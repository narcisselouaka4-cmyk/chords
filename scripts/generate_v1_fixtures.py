#!/usr/bin/env python3
"""
Extended synthetic generator for structured_harmony_v1 Phase 0.

Output: Chroma fixtures + extended WAV variants for ablation benchmark.
Seeds fixed. Dev/val separated. No modifications to production files.

Usage:
    python scripts/generate_v1_fixtures.py
"""

import json
import os
import numpy as np
import soundfile as sf
import librosa

SR = 22050
BPM = 120
BEAT_DUR = 60.0 / BPM
CHORD_DUR = 2.0
REPEATS = 2
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_DIR = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                            'fixtures')
SYNTH_DIR = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                         'synthetic')
DEV_SYNTH_DIR = os.path.join(SYNTH_DIR, 'dev')
VAL_SYNTH_DIR = os.path.join(SYNTH_DIR, 'validation')
os.makedirs(FIXTURES_DIR, exist_ok=True)
os.makedirs(DEV_SYNTH_DIR, exist_ok=True)
os.makedirs(VAL_SYNTH_DIR, exist_ok=True)

NP_RNG = np.random.RandomState(20260711)
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

QUALITY_MAP = {
    '':      ([0,4,7],       [1.0,0.8,0.6],       'major', 'none'),
    'm':     ([0,3,7],       [1.0,0.85,0.55],      'minor', 'none'),
    '7':     ([0,4,7,10],    [1.0,0.75,0.55,0.4],  'major', 'b7'),
    'maj7':  ([0,4,7,11],    [1.0,0.85,0.65,0.9],  'major', 'maj7'),
    'sus2':  ([0,2,7],       [1.0,0.75,0.55],      'sus2',  'none'),
    'sus4':  ([0,5,7],       [1.0,0.75,0.55],      'sus4',  'none'),
    'm7':    ([0,3,7,10],    [1.0,0.85,0.65,0.85], 'minor', 'b7'),
    'dim':   ([0,3,6],       [1.0,0.9,0.9],        'dim',   'none'),
    'm7b5':  ([0,3,6,10],    [1.0,0.85,0.9,0.85],  'dim',   'b7'),
}

# Voicing variants specification
VOICING_VARIANTS = {
    'full':   {'description': 'All chord tones present', 'transform': 'identity'},
    'no5':    {'description': 'Fifth omitted', 'transform': 'remove_interval', 'interval': 7},
    'rootless': {'description': 'Root omitted (bass supplies it)', 'transform': 'remove_root'},
    'shell':  {'description': 'Root + 3rd + 7th only', 'transform': 'keep_guide_tones'},
    'inversion': {'description': 'Bass on 3rd or 5th', 'transform': 'shift_bass'},
    'foreign_melody': {'description': 'Extra foreign pitch class', 'transform': 'add_foreign'},
    'temporal_spread': {'description': 'Notes split across beats', 'transform': 'split_across_beats'},
}


def note_to_hz(note):
    return librosa.note_to_hz(note)


def envelope(n, attack_ms=1, release_ms=50):
    atk = min(int(attack_ms / 1000.0 * SR), n // 8)
    rel = min(int(release_ms / 1000.0 * SR), n // 4)
    env = np.ones(n)
    if atk > 0:
        env[:atk] = np.linspace(0, 1, atk)
    if rel > 0:
        env[-rel:] = np.linspace(1, 0, rel)
    return env


def percussive_click(n_samples, amp=0.08):
    click_len = min(int(0.010 * SR), n_samples // 4)
    click = amp * np.random.RandomState(2026).randn(click_len)
    click *= np.linspace(1, 0, click_len)
    return click


def render_chord_with_voicing(bass_note, upper_notes, dur=CHORD_DUR,
                               bass_amp=0.30, upper_amp=0.12,
                               voice_weights=None):
    """Render chord with per-voice amplitude control for voicing simulation."""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    y = np.zeros(n)
    freq = note_to_hz(bass_note)
    y += bass_amp * np.sin(2 * np.pi * freq * t)
    y += bass_amp * 0.3 * np.sin(2 * np.pi * 2 * freq * t)
    y += bass_amp * 0.15 * np.sin(2 * np.pi * 3 * freq * t)
    for i, note in enumerate(upper_notes):
        f = note_to_hz(note)
        w = voice_weights[i] if voice_weights else 1.0
        y += w * upper_amp * np.sin(2 * np.pi * f * t)
        y += w * upper_amp * 0.2 * np.sin(2 * np.pi * 2 * f * t)
    y *= envelope(n, attack_ms=1, release_ms=80)
    click = percussive_click(n)
    y[:len(click)] += click
    y = np.clip(y, -1, 1)
    return y


NOTE_TO_PC = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11,
}


def _note_letter(note):
    """Extract note letter from a note string like 'F#3' -> 'F#', 'C4' -> 'C'."""
    i = 0
    while i < len(note) and not note[i].isdigit():
        i += 1
    return note[:i]


def _note_pc(note):
    """Get pitch class (0-11) from a note string like 'D#3', 'Eb4', 'C2'."""
    letter = _note_letter(note)
    return NOTE_TO_PC.get(letter)


def _voicing_transform(chord, voicing_type):
    """Apply voicing transformation to a chord.
    Returns (upper_notes, voice_weights, bass_note, bass_pc).
    """
    upper = list(chord.get('upper_notes', []))
    n = len(upper)
    voice_weights = [1.0] * n
    bass_note = chord['bass_note']
    bass_pc = chord['bass_pc']
    root_note_name = NOTE_NAMES[chord['root']]
    root_pc = chord['root']
    intervals = chord['intervals']

    if voicing_type == 'no5':
        fifth_pc = None
        for iv in chord.get('intervals', []):
            if iv % 12 in (6, 7, 8):
                fifth_pc = (chord['root'] + iv) % 12
                break
        if fifth_pc is not None:
            upper = [n for n in upper if _note_pc(n) != fifth_pc]
        voice_weights = [1.0] * len(upper)

    elif voicing_type == 'rootless':
        sev = chord.get('seventh', 'none')
        if sev == 'b7':
            rootless_bass_pc = (chord['root'] + 10) % 12
        elif sev == 'maj7':
            rootless_bass_pc = (chord['root'] + 11) % 12
        else:
            rootless_bass_pc = (chord['root'] + 7) % 12
        bass_note = NOTE_NAMES[rootless_bass_pc] + '2'
        bass_pc = rootless_bass_pc
        upper = [n for n in upper if _note_pc(n) != root_pc]
        voice_weights = [1.0] * len(upper)

    elif voicing_type == 'shell':
        third_int = 3 if chord.get('quality','') in ('m','m7','dim','m7b5') else 4
        sev = chord.get('seventh', 'none')
        sev_int = 10 if sev == 'b7' else (11 if sev == 'maj7' else None)
        keep_pcs = {(chord['root'] + third_int) % 12}
        if sev_int is not None:
            keep_pcs.add((chord['root'] + sev_int) % 12)
        upper = [n for n in upper if _note_pc(n) in keep_pcs]
        root_upper = root_note_name + '3'
        if root_upper not in upper:
            upper = [root_upper] + upper
        voice_weights = [1.0] * len(upper)

    elif voicing_type == 'inversion':
        third_int = 3 if chord.get('quality','') in ('m','m7','dim','m7b5') else 4
        inv_pc = (chord['root'] + third_int) % 12
        bass_note = NOTE_NAMES[inv_pc] + '2'
        bass_pc = inv_pc
        voice_weights = [1.0] * len(upper)

    elif voicing_type == 'foreign_melody':
        extra_note = chord.get('extra_note')
        if extra_note:
            upper = upper + [extra_note]
            voice_weights = [1.0] * (len(upper) - 1) + [0.4]

    elif voicing_type == 'temporal_spread':
        voice_weights = [1.0] * len(upper)

    return upper, voice_weights, bass_note, bass_pc


def generate_synthetic_audio(output_path, chords, voicing_type='full',
                             seed=20260711):
    """Generate synthetic WAV with labelled voicing."""
    total_dur = len(chords) * CHORD_DUR * REPEATS
    y = np.zeros(int(SR * total_dur))
    gt_segments = []
    gap_s = 0.030
    offset = 0.0

    for rep in range(REPEATS):
        for chord in chords:
            upper, voice_weights, bass_note, bass_pc = _voicing_transform(
                chord, voicing_type)

            seg = render_chord_with_voicing(
                bass_note, upper, dur=CHORD_DUR - gap_s,
                voice_weights=voice_weights
            )
            start_s = int(offset * SR)
            end_s = start_s + len(seg)
            y[start_s:end_s] = seg

            if voicing_type == 'temporal_spread' and len(upper) >= 3:
                split = len(upper) // 2
                late_upper = upper[split:]
                late_weights = [0.6] * len(late_upper)
                late_seg = render_chord_with_voicing(
                    bass_note, late_upper,
                    dur=CHORD_DUR - gap_s, upper_amp=0.08,
                    voice_weights=late_weights
                )
                late_start = start_s + int(0.5 * SR)
                if late_start + len(late_seg) < len(y):
                    y[late_start:late_start + len(late_seg)] += late_seg

            seg_y = y[start_s:int(min(end_s, len(y)))]
            if len(seg_y) > 0:
                chroma = librosa.feature.chroma_cqt(
                    y=seg_y, sr=SR, hop_length=512)
                if chroma.shape[1] > 0:
                    obs_chroma = np.mean(chroma, axis=1)
                    observed_pcs = [int(pc) for pc in range(12)
                                    if obs_chroma[pc] > 0.15]
                else:
                    observed_pcs = list(chord.get('intervals', []))
            else:
                observed_pcs = list(chord.get('intervals', []))

            expected_pcs = [(chord['root'] + iv) % 12
                           for iv in chord['intervals']]
            missing = sorted(set(expected_pcs) - set(observed_pcs))
            extra = sorted(set(observed_pcs) - set(expected_pcs))

            gt_segments.append({
                'start_time': round(offset, 3),
                'end_time': round(offset + CHORD_DUR, 3),
                'root': chord['root_note'],
                'quality': chord['quality'],
                'bass': bass_note,
                'bass_pc': bass_pc,
                'upper_notes': upper,
                'intervals': chord['intervals'],
                'voicing_type': voicing_type,
                'observed_pcs': observed_pcs,
                'expected_pcs': expected_pcs,
                'missing_pcs': missing,
                'extra_pcs': extra,
                'tension_pcs': chord.get('tension_pcs', []),
                'temporal_spread': voicing_type == 'temporal_spread',
                'extra_note': chord.get('extra_note'),
            })
            offset += CHORD_DUR

    y = np.clip(y, -1, 1)
    wav_path = output_path
    sf.write(wav_path, y, SR)

    gt_path = output_path.replace('.wav', '.json')
    with open(gt_path, 'w') as f:
        json.dump({
            'file': os.path.basename(wav_path),
            'sr': SR, 'bpm': BPM, 'chord_duration': CHORD_DUR,
            'repeats': REPEATS, 'voicing_type': voicing_type,
            'segments': gt_segments,
        }, f, indent=2)

    return wav_path, gt_path


# ─── DEV PROGRESSIONS ───

DEV_CHORDS = [
    {
        'name': 'ii-V-I_C',
        'chords': [
            {'root_note': 'D', 'root': 2, 'quality': 'm7', 'seventh': 'b7',
             'bass_note': 'D2', 'bass_pc': 2,
             'upper_notes': ['F3', 'A3', 'C4'], 'intervals': [0,3,7,10]},
            {'root_note': 'G', 'root': 7, 'quality': '7', 'seventh': 'b7',
             'bass_note': 'G2', 'bass_pc': 7,
             'upper_notes': ['B3', 'D4', 'F4'], 'intervals': [0,4,7,10]},
            {'root_note': 'C', 'root': 0, 'quality': 'maj7', 'seventh': 'maj7',
             'bass_note': 'C2', 'bass_pc': 0,
             'upper_notes': ['E3', 'G3', 'B3'], 'intervals': [0,4,7,11]},
        ]
    },
    {
        'name': 'ii-V-i_Gm',
        'chords': [
            {'root_note': 'A', 'root': 9, 'quality': 'm7b5', 'seventh': 'b7',
             'bass_note': 'A2', 'bass_pc': 9,
             'upper_notes': ['C4', 'Eb4', 'G4'], 'intervals': [0,3,6,10]},
            {'root_note': 'D', 'root': 2, 'quality': '7', 'seventh': 'b7',
             'bass_note': 'D2', 'bass_pc': 2,
             'upper_notes': ['F#3', 'A3', 'C4'], 'intervals': [0,4,7,10]},
            {'root_note': 'G', 'root': 7, 'quality': 'm', 'seventh': 'none',
             'bass_note': 'G2', 'bass_pc': 7,
             'upper_notes': ['Bb3', 'D4'], 'intervals': [0,3,7]},
        ]
    },
]


# ─── VAL PROGRESSIONS (validation split, roots in {3,5,9,11}) ───

VAL_CHORDS = [
    {
        'name': 'F-A-B',
        'chords': [
            {'root_note': 'F', 'root': 5, 'quality': 'maj7', 'seventh': 'maj7',
             'bass_note': 'F2', 'bass_pc': 5,
             'upper_notes': ['A3', 'C4', 'E4'], 'intervals': [0,4,7,11]},
            {'root_note': 'A', 'root': 9, 'quality': 'm7', 'seventh': 'b7',
             'bass_note': 'A2', 'bass_pc': 9,
             'upper_notes': ['C4', 'E4', 'G4'], 'intervals': [0,3,7,10]},
            {'root_note': 'B', 'root': 11, 'quality': '7', 'seventh': 'b7',
             'bass_note': 'B2', 'bass_pc': 11,
             'upper_notes': ['D#4', 'F#4', 'A4'], 'intervals': [0,4,7,10]},
        ]
    },
    {
        'name': 'D#-F#-A',
        'chords': [
            {'root_note': 'D#', 'root': 3, 'quality': 'm7b5', 'seventh': 'b7',
             'bass_note': 'D#2', 'bass_pc': 3,
             'upper_notes': ['F#3', 'A3', 'C#4'], 'intervals': [0,3,6,10]},
            {'root_note': 'F', 'root': 5, 'quality': 'm', 'seventh': 'none',
             'bass_note': 'F2', 'bass_pc': 5,
             'upper_notes': ['Ab3', 'C4'], 'intervals': [0,3,7]},
            {'root_note': 'A', 'root': 9, 'quality': 'maj7', 'seventh': 'maj7',
             'bass_note': 'A2', 'bass_pc': 9,
             'upper_notes': ['C#4', 'E4', 'G#4'], 'intervals': [0,4,7,11]},
        ]
    },
]


# ─── MAIN ───

def main():
    # 1. Generate chroma fixtures (already done separately)
    chroma_fixtures_path = os.path.join(FIXTURES_DIR, 'chroma_fixtures.json')
    if not os.path.exists(chroma_fixtures_path):
        print(f"Chroma fixtures at {chroma_fixtures_path}")
        print("Run tests/test_harmony_v1.py to verify them.")
    else:
        with open(chroma_fixtures_path) as f:
            data = json.load(f)
        print(f"Chroma fixtures: {data['metadata']['total_fixtures']} cases "
              f"({os.path.getsize(chroma_fixtures_path)} bytes)")

    # 2. Generate synthetic WAV variants for each voicing type
    generated = []

    def _generate_prog_set(progs, split_label, out_dir):
        count = 0
        for prog in progs:
            for vt in sorted(VOICING_VARIANTS.keys()):
                seed = abs(hash(f"{split_label}_{prog['name']}_{vt}")) % (2**31)
                out_name = f"{split_label}_{prog['name']}_{vt}"
                out_path = os.path.join(out_dir, f"{out_name}.wav")

                chords_with_meta = []
                for c in prog['chords']:
                    cc = dict(c)
                    cc['voicing_type'] = vt
                    if vt == 'foreign_melody':
                        foreign_pc = (c['root'] + 6) % 12
                        cc['extra_note'] = NOTE_NAMES[foreign_pc] + '4'
                    cc['tension_pcs'] = []
                    chords_with_meta.append(cc)

                try:
                    wav_path, gt_path = generate_synthetic_audio(
                        out_path, chords_with_meta, voicing_type=vt, seed=seed)
                    generated.append({
                        'wav': wav_path,
                        'gt': gt_path,
                        'voicing': vt,
                        'progression': prog['name'],
                        'split': split_label,
                    })
                    count += 1
                except Exception as e:
                    print(f"  FAILED {out_name}: {e}")
        return count

    dev_count = _generate_prog_set(DEV_CHORDS, 'dev', DEV_SYNTH_DIR)
    val_count = _generate_prog_set(VAL_CHORDS, 'validation', VAL_SYNTH_DIR)

    print(f"\nDEV WAV:      {dev_count}")
    print(f"VALIDATION WAV: {val_count}")
    print(f"Total:        {len(generated)}")

    # 3. Summary per split
    print(f"\nFiles in {DEV_SYNTH_DIR}:")
    for f in sorted(os.listdir(DEV_SYNTH_DIR)):
        sz = os.path.getsize(os.path.join(DEV_SYNTH_DIR, f))
        print(f"  {f} ({sz} bytes)")

    print(f"\nFiles in {VAL_SYNTH_DIR}:")
    for f in sorted(os.listdir(VAL_SYNTH_DIR)):
        sz = os.path.getsize(os.path.join(VAL_SYNTH_DIR, f))
        print(f"  {f} ({sz} bytes)")

    print(f"\nDone. Run tests/test_harmony_v1.py to verify invariants.")


if __name__ == '__main__':
    main()
