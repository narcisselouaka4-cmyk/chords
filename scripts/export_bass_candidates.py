#!/usr/bin/env python3
"""
Export internal Bass Engine V2 candidates per frame, without modifying bass-detector.py.

Loads bass-detector.py as a module via importlib, calls compute_cqt() and
score_octave_candidate(), then replicates the per-frame estimation loop to capture
all 5 octave candidates (not just the winner).

Usage:
  python scripts/export_bass_candidates.py --wav <path> [--output <path>]

Output:
  JSON with per-frame candidate scores and selected note.
"""
import sys, os, json, argparse
import importlib.util

import numpy as np
import librosa

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BD_PATH = os.path.join(SCRIPT_DIR, 'bass-detector.py')


def load_bass_detector():
    """Load bass-detector.py as a module via importlib."""
    spec = importlib.util.spec_from_file_location('bass_detector', BD_PATH)
    bd = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bd)
    return bd


def export_candidates(wav_path, output_path=None):
    bd = load_bass_detector()

    # --- Load audio ---
    log(f'Loading {wav_path}')
    y, sr, duration = bd.load_audio(wav_path)

    # --- Compute CQT ---
    log('Computing CQT...')
    mag = bd.compute_cqt(y, sr)
    n_frames = mag.shape[1]

    cqt_freqs = librosa.cqt_frequencies(bd.N_BINS, fmin=bd.FMIN,
                                         bins_per_octave=bd.BINS_PER_OCTAVE)

    # --- Per-frame estimation (V2 logic, capture all candidates) ---
    frames_data = []
    for t in range(n_frames):
        time_s = round(t * bd.HOP_LENGTH / bd.SR, 3)
        frame = mag[:, t]

        raw_peak_bin = int(np.argmax(frame))
        raw_peak_val = float(frame[raw_peak_bin])

        # Silence detection
        if raw_peak_val < bd.ENERGY_THRESHOLD:
            frames_data.append({
                'time': time_s,
                'frame': t,
                'energy': round(raw_peak_val, 6),
                'silent': True,
                'selected': None,
                'candidates': [],
            })
            continue

        # HPS
        hps = bd.hps_on_cqt(frame)
        hps_peak_bin = int(np.argmax(hps))
        hps_peak_val = float(hps[hps_peak_bin])

        use_hps = hps_peak_val > raw_peak_val * 0.3 and hps_peak_val > 1e-6
        peak_bin = hps_peak_bin if use_hps else raw_peak_bin

        # V1 reference
        peak_freq_v1 = cqt_freqs[peak_bin]
        midi_v1 = int(round(librosa.hz_to_midi(peak_freq_v1)))
        pc_v1 = midi_v1 % 12
        octave_v1 = midi_v1 // 12 - 1

        # Collect all 5 octave candidates with scores
        candidates = []
        best_score = -1.0
        best_octave = octave_v1
        best_midi = midi_v1

        for cand_octave in range(1, 6):
            cand_midi = pc_v1 + 12 * (cand_octave + 1)
            cand_freq = librosa.midi_to_hz(cand_midi)
            cand_bin = int(np.argmin(np.abs(cqt_freqs - cand_freq)))
            if cand_bin >= bd.N_BINS:
                continue

            score = float(bd.score_octave_candidate(
                hps, frame, cqt_freqs, cand_bin, cand_octave))
            note_name = bd.NOTE_NAMES[cand_midi % 12]
            cand_entry = {
                'octave': cand_octave,
                'midi': cand_midi,
                'note': f'{note_name}{cand_octave}',
                'freq': round(cand_freq, 2),
                'score': round(score, 4),
                'is_winner': False,
            }
            if use_hps:
                if score > best_score:
                    best_score = score
                    best_octave = cand_octave
                    best_midi = cand_midi
                candidates.append(cand_entry)
            else:
                # When use_hps is False, keep V1 octave (no candidate scoring)
                candidates.append(cand_entry)
                # Only mark V1 octave as winner
                if cand_octave == octave_v1:
                    best_octave = octave_v1
                    best_midi = midi_v1

        # Mark the winner
        for c in candidates:
            if c['midi'] == best_midi and c['octave'] == best_octave:
                c['is_winner'] = True

        # Confidence (same formula as V2)
        mean_val = float(np.mean(hps))
        conf = min(1.0, (hps_peak_val / max(mean_val, 1e-10)) / 12.0)
        conf = max(0.0, conf)

        if not use_hps:
            # Keep only the V1 octave candidate as winner
            pass

        frames_data.append({
            'time': time_s,
            'frame': t,
            'energy': round(raw_peak_val, 6),
            'silent': False,
            'pc': pc_v1,
            'use_hps': bool(use_hps),
            'selected': {
                'midi': best_midi,
                'octave': best_octave,
                'note': f'{bd.NOTE_NAMES[best_midi % 12]}{best_octave}',
                'confidence': round(conf, 4),
            },
            'candidates': candidates,
        })

    # --- Build output ---
    result = {
        'wav': wav_path,
        'duration': round(duration, 2),
        'n_frames': n_frames,
        'frame_rate': round(bd.SR / bd.HOP_LENGTH, 2),
        'params': {
            'sr': bd.SR,
            'hop_length': bd.HOP_LENGTH,
            'fmin': bd.FMIN,
            'n_bins': bd.N_BINS,
            'bins_per_octave': bd.BINS_PER_OCTAVE,
        },
        'frames': frames_data,
    }

    if output_path:
        log(f'Writing {output_path}')
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2)
        print(f'Exported {n_frames} frames to {output_path}')
    else:
        print(json.dumps(result, indent=2))

    return result


def log(msg):
    print(f'[ExportCandidates] {msg}', file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(
        description='Export Bass Engine V2 octave candidates per frame')
    parser.add_argument('--wav', required=True, help='Input WAV path')
    parser.add_argument('--output', default=None, help='Output JSON path')
    args = parser.parse_args()

    if not os.path.isfile(args.wav):
        print(f'[ERROR] File not found: {args.wav}')
        return 1

    export_candidates(args.wav, args.output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
