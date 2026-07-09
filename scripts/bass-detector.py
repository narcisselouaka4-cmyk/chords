#!/usr/bin/env python3
"""
Bass Engine — CQT + Harmonic Product Spectrum + octave correction + temporal tracking.

Architecture:
  Audio WAV → CQT → HPS ×[1,2,3,4] → fundamental freq → MIDI note + octave
  → octave correction (V2) → mode smoothing (V2.5) → segmentation → JSON timeline

Versions:
  V1   : CQT + HPS, no octave correction
  V2   : + octave disambiguation (score_octave_candidate)
  V2.5 : + mode smoothing with configurable window
  V3   : [experimental] Viterbi temporal tracking

Usage:
  python scripts/bass-detector.py analyze <wav> [--v2]
         [--smoothing-window <n>] [--min-segment-duration <s>]
         [--tracking <mode|viterbi|none>]
"""
import sys, os, json, re, math, csv
import numpy as np
import librosa

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_TO_PC = {n: i for i, n in enumerate(NOTE_NAMES)}

SR = 22050
HOP_LENGTH = 512
BINS_PER_OCTAVE = 36
FMIN = 32.7
N_BINS = 144
SMOOTHING_WINDOW = 2   # half-window for mode smoothing (default 2 ≙ 5-frame window)
ENERGY_THRESHOLD = 0.02
MIN_SEGMENT_DURATION = 0.15


def log(msg):
    print(f'[BassDetector] {msg}', file=sys.stderr, flush=True)


def load_audio(wav_path):
    y, sr = librosa.load(wav_path, sr=SR, mono=True)
    duration = float(len(y)) / sr
    return y, sr, duration


def compute_cqt(y, sr):
    cqt = librosa.cqt(
        y, sr=sr, hop_length=HOP_LENGTH,
        fmin=FMIN, n_bins=N_BINS,
        bins_per_octave=BINS_PER_OCTAVE,
        window='hann',
    )
    return np.abs(cqt)


def hps_on_cqt(mag_frame, bpo=BINS_PER_OCTAVE):
    n = len(mag_frame)
    hps = mag_frame.copy()
    for harmonic in [2, 3, 4]:
        shift = int(round(bpo * math.log2(harmonic)))
        if shift < n:
            hps[:n - shift] *= mag_frame[shift:]
    return hps


def estimate_bass_per_frame(mag):
    n_frames = mag.shape[1]
    cqt_freqs = librosa.cqt_frequencies(N_BINS, fmin=FMIN, bins_per_octave=BINS_PER_OCTAVE)
    results = []
    for t in range(n_frames):
        frame = mag[:, t]
        raw_peak_bin = int(np.argmax(frame))
        raw_peak_val = frame[raw_peak_bin]

        if raw_peak_val < ENERGY_THRESHOLD:
            results.append({'midi': None, 'pc': None, 'octave': None,
                            'freq': 0.0, 'confidence': 0.0})
            continue

        hps = hps_on_cqt(frame)
        hps_peak_bin = int(np.argmax(hps))
        hps_peak_val = hps[hps_peak_bin]

        # If HPS has a strong peak, use it (disambiguates octave)
        # Otherwise fall back to raw CQT peak (weaker octave certainty)
        use_hps = hps_peak_val > raw_peak_val * 0.3 and hps_peak_val > 1e-6
        if use_hps:
            peak_bin = hps_peak_bin
            peak_val = hps_peak_val
        else:
            peak_bin = raw_peak_bin
            peak_val = raw_peak_val

        peak_freq = cqt_freqs[peak_bin]
        midi_raw = librosa.hz_to_midi(peak_freq)
        midi_note = int(round(midi_raw))
        pc = midi_note % 12
        octave = midi_note // 12 - 1

        mean_val = float(np.mean(hps))
        conf = min(1.0, (peak_val / max(mean_val, 1e-10)) / 12.0)
        conf = max(0.0, conf)

        results.append({
            'midi': midi_note,
            'pc': pc,
            'octave': octave,
            'freq': round(peak_freq, 2),
            'confidence': round(conf, 4),
            'use_hps': bool(use_hps),
        })
    return results


# ═══════════════════════════════════════════════════════════════
#  V2 — Octave disambiguation
# ═══════════════════════════════════════════════════════════════

# Octave preference weights (soft bias toward bass register)
OCTAVE_BONUS = {1: 0.40, 2: 0.55, 3: 0.30, 4: 0.08, 5: 0.02}


def score_octave_candidate(hps_frame, cqt_frame, cqt_freqs, candidate_bin, octave):
    """Combined score: HPS value + harmonic coherence + bass register bonus.

    Includes a penalty when the candidate's own fundamental is much weaker
    than its 2nd harmonic — this prevents the 'missing fundamental' illusion
    where a false low octave borrows energy from the real note's fundamental.
    """
    max_hps = max(np.max(hps_frame), 1e-10)
    max_cqt = max(np.max(cqt_frame), 1e-10)

    # 1. Normalized HPS score
    hps_score = hps_frame[candidate_bin] / max_hps

    # 2. Harmonic coherence: energy at 2×, 3×, 4× the candidate
    cand_freq = cqt_freqs[candidate_bin]
    harm_sum = 0.0
    harm_cnt = 0
    for h in [2, 3, 4]:
        hf = cand_freq * h
        hb = int(np.argmin(np.abs(cqt_freqs - hf)))
        if hb < len(cqt_frame):
            harm_sum += cqt_frame[hb] / max_cqt
            harm_cnt += 1
    harm_coherence = harm_sum / max(harm_cnt, 1)

    # 3. Fundamental vs 2nd-harmonic sanity check
    #    If the 2nd harmonic is much stronger than the candidate's own
    #    fundamental, the candidate is likely a false sub-octave.
    fund_energy = cqt_frame[candidate_bin] / max_cqt
    h2_bin = int(np.argmin(np.abs(cqt_freqs - cand_freq * 2)))
    h2_energy = cqt_frame[h2_bin] / max_cqt if h2_bin < len(cqt_frame) else 0
    fundamental_penalty = 0.0
    if h2_energy > 0.005 and fund_energy < h2_energy * 0.3:
        fundamental_penalty = -0.45

    # 4. Bass register bonus (soft, peaks at octave 2)
    bass_bonus = OCTAVE_BONUS.get(octave, 0.0)

    return hps_score + harm_coherence + bass_bonus + fundamental_penalty


def estimate_bass_per_frame_v2(mag):
    """V2: same HPS as V1, then re-score octave candidates for each pitch class."""
    n_frames = mag.shape[1]
    cqt_freqs = librosa.cqt_frequencies(N_BINS, fmin=FMIN,
                                         bins_per_octave=BINS_PER_OCTAVE)
    results = []
    for t in range(n_frames):
        frame = mag[:, t]
        raw_peak_bin = int(np.argmax(frame))
        raw_peak_val = frame[raw_peak_bin]

        if raw_peak_val < ENERGY_THRESHOLD:
            results.append({'midi': None, 'pc': None, 'octave': None,
                            'freq': 0.0, 'confidence': 0.0, 'use_hps': False})
            continue

        hps = hps_on_cqt(frame)
        hps_peak_bin = int(np.argmax(hps))
        hps_peak_val = hps[hps_peak_bin]

        use_hps = hps_peak_val > raw_peak_val * 0.3 and hps_peak_val > 1e-6
        peak_bin = hps_peak_bin if use_hps else raw_peak_bin

        # V1 reference: original peak freq / midi / pc / octave
        peak_freq_v1 = cqt_freqs[peak_bin]
        midi_v1 = int(round(librosa.hz_to_midi(peak_freq_v1)))
        pc_v1 = midi_v1 % 12
        octave_v1 = midi_v1 // 12 - 1

        # ─── V2: octave candidates for this pitch class ───
        # Only apply octave correction when HPS is meaningful (use_hps=True).
        # Pure sines (HPS product → 0) keep V1's raw CQT result.
        if not use_hps:
            best_octave = octave_v1
        else:
            best_octave = octave_v1
            best_score = -1.0

            for cand_octave in range(1, 6):  # octaves 1–5
                cand_midi = pc_v1 + 12 * (cand_octave + 1)
                cand_freq = librosa.midi_to_hz(cand_midi)
                cand_bin = int(np.argmin(np.abs(cqt_freqs - cand_freq)))
                if cand_bin >= N_BINS:
                    continue

                score = score_octave_candidate(hps, frame, cqt_freqs,
                                               cand_bin, cand_octave)
                if score > best_score:
                    best_score = score
                    best_octave = cand_octave

        # Build result with corrected octave
        best_midi = pc_v1 + 12 * (best_octave + 1)
        best_freq = librosa.midi_to_hz(best_midi)

        mean_val = float(np.mean(hps))
        conf = min(1.0, (hps_peak_val / max(mean_val, 1e-10)) / 12.0)
        conf = max(0.0, conf)

        results.append({
            'midi': best_midi,
            'pc': pc_v1,
            'octave': best_octave,
            'freq': round(best_freq, 2),
            'confidence': round(conf, 4),
            'use_hps': bool(use_hps),
        })
    return results


def mode_smooth(estimates, half=None):
    """Mode filter: each frame gets the most common MIDI value in the window.

    half controls the window radius (window = 2*half + 1 frames).
    Defaults to SMOOTHING_WINDOW (2 → 5-frame window ≈ 116ms).
    """
    if half is None:
        half = SMOOTHING_WINDOW
    n = len(estimates)
    midis = np.full(n, -1, dtype=int)
    confs = np.zeros(n, dtype=np.float64)
    for i, e in enumerate(estimates):
        if e['midi'] is not None:
            midis[i] = e['midi']
            confs[i] = e['confidence']

    smoothed = np.full(n, -1, dtype=int)
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        window = midis[lo:hi]
        valid = window[window >= 0]
        if len(valid) == 0:
            continue
        counts = np.bincount(valid)
        smoothed[i] = int(np.argmax(counts))
    return smoothed, confs


def median_smooth(estimates):
    """Legacy wrapper — uses mode_smooth with original default window (5)."""
    return mode_smooth(estimates, half=2)


def segment(estimates, smoothed, confs, times, duration, min_duration=None):
    if min_duration is None:
        min_duration = MIN_SEGMENT_DURATION
    segments = []
    start_i = None
    prev_note = None
    conf_sum = 0.0
    conf_cnt = 0

    for i in range(len(smoothed)):
        midi = smoothed[i]
        if midi < 0:
            if start_i is not None:
                segments.append({
                    'startTime': times[start_i],
                    'endTime': times[i],
                    'midi': prev_note,
                    'bass': NOTE_NAMES[int(prev_note) % 12],
                    'octave': int(prev_note) // 12 - 1,
                    'confidence': conf_sum / max(conf_cnt, 1),
                })
                start_i = None
            continue
        if midi != prev_note:
            if start_i is not None and conf_cnt > 0:
                segments.append({
                    'startTime': times[start_i],
                    'endTime': times[i],
                    'midi': prev_note,
                    'bass': NOTE_NAMES[int(prev_note) % 12],
                    'octave': int(prev_note) // 12 - 1,
                    'confidence': conf_sum / conf_cnt,
                })
            start_i = i
            prev_note = midi
            conf_sum = confs[i]
            conf_cnt = 1
        else:
            conf_sum += confs[i]
            conf_cnt += 1

    if start_i is not None and conf_cnt > 0:
        segments.append({
            'startTime': times[start_i],
            'endTime': times[-1] if len(times) > start_i else duration,
            'midi': prev_note,
            'bass': NOTE_NAMES[int(prev_note) % 12],
            'octave': int(prev_note) // 12 - 1,
            'confidence': conf_sum / conf_cnt,
        })

    merged = []
    for seg in segments:
        seg['endTime'] = min(seg['endTime'], duration)
        dur = seg['endTime'] - seg['startTime']
        if dur < min_duration:
            if merged:
                merged[-1]['endTime'] = seg['endTime']
                w_old = merged[-1]['confidence'] * (merged[-1]['endTime'] - merged[-1]['startTime'] - dur)
                w_new = seg['confidence'] * dur
                total_dur = merged[-1]['endTime'] - merged[-1]['startTime']
                merged[-1]['confidence'] = (w_old + w_new) / max(total_dur, 1e-10)
            continue
        merged.append(seg)

    return merged


# ═══════════════════════════════════════════════════════════════
#  Experimental — Viterbi temporal tracking
# ═══════════════════════════════════════════════════════════════
#
# DISABLED by default. Use --tracking=viterbi to enable.
#
# Probabilistic model:
#   Emission (narrow): P(obs | state) ~ exp(-(obs - state)² / 2σ²)
#   Transition (sticky): P(j | i) = self if j == i, else uniform low prob
#
# Benchmark results (Amazing Grace):
#   NW accuracy : 84.1% (vs V2 87.3%)
#   Segments    : 199   (vs V2 231)
#   Changes     : 279   (vs V2 443)
#
# Reduces temporal fragmentation by ~14% at the cost of ~3pp accuracy.
# The correct bass note appears in only 18% of frames, so no temporal
# smoother can recover it reliably without musical context.

VITERBI_SELF_TRANSITION = 0.99
VITERBI_SIGMA = 3.0
VITERBI_MIDI_MIN = 24
VITERBI_MIDI_MAX = 84


def viterbi_smooth(estimates):
    n_frames = len(estimates)
    midi_offset = VITERBI_MIDI_MIN
    n_states = VITERBI_MIDI_MAX - VITERBI_MIDI_MIN + 1
    n_states_f = float(n_states)

    log_self = math.log(VITERBI_SELF_TRANSITION)
    log_other = math.log((1.0 - VITERBI_SELF_TRANSITION) / (n_states_f - 1.0))
    log_T = np.full((n_states, n_states), log_other, dtype=np.float64)
    np.fill_diagonal(log_T, log_self)

    inv_sig2 = -0.5 / (VITERBI_SIGMA * VITERBI_SIGMA)
    log_norm = math.log(1.0 / (VITERBI_SIGMA * math.sqrt(2.0 * math.pi)))

    log_E = np.full((n_frames, n_states), -np.inf, dtype=np.float64)
    for t, e in enumerate(estimates):
        if e['midi'] is None:
            log_E[t, :] = math.log(1.0 / n_states_f)
            continue
        m_t = e['midi']
        for s_idx in range(n_states):
            d = (s_idx + midi_offset) - m_t
            log_E[t, s_idx] = log_norm + inv_sig2 * (d * d)

    V = np.full((n_frames, n_states), -np.inf, dtype=np.float64)
    B = np.zeros((n_frames, n_states), dtype=np.int32)
    V[0] = log_E[0] - math.log(n_states_f)

    for t in range(1, n_frames):
        scores = V[t - 1, :, np.newaxis] + log_T
        max_scores = np.max(scores, axis=0)
        B[t] = np.argmax(scores, axis=0)
        V[t] = log_E[t] + max_scores

    path = np.zeros(n_frames, dtype=np.int32)
    path[-1] = int(np.argmax(V[-1]))
    for t in range(n_frames - 2, -1, -1):
        path[t] = B[t + 1, path[t + 1]]

    smoothed = np.full(n_frames, -1, dtype=np.int32)
    confs = np.zeros(n_frames, dtype=np.float64)
    for t, s_idx in enumerate(path):
        midi = s_idx + midi_offset
        smoothed[t] = midi
        confs[t] = estimates[t]['confidence'] if estimates[t]['midi'] is not None else 0.0

    return smoothed, confs


def analyze_bass(wav_path, use_v2=False, use_v3=False, smoothing_window=None,
                 min_segment_duration=None, tracking='mode'):
    log(f'Loading {wav_path}')
    y, sr, duration = load_audio(wav_path)
    log(f'Duration: {duration:.1f}s')

    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP_LENGTH)
    if isinstance(tempo, (np.ndarray, list)):
        tempo = float(np.squeeze(tempo).item())
    else:
        tempo = float(tempo)

    log('Computing CQT...')
    mag = compute_cqt(y, sr)
    n_frames = mag.shape[1]
    times = np.arange(n_frames) * HOP_LENGTH / sr

    estimator = estimate_bass_per_frame_v2 if (use_v2 or use_v3) else estimate_bass_per_frame
    label = 'V2 octave scoring' if (use_v2 or use_v3) else 'HPS + peak estimation'
    log(f'Applying {label}...')
    estimates = estimator(mag)

    if tracking == 'viterbi':
        log('Tracking (Viterbi)...')
        smoothed, confs = viterbi_smooth(estimates)
    elif tracking == 'mode':
        half = smoothing_window if smoothing_window is not None else SMOOTHING_WINDOW
        log(f'Tracking (mode smoothing h={half})...')
        smoothed, confs = mode_smooth(estimates, half=half)
    else:
        log('Tracking (no smoothing)...')
        smoothed = np.array([e['midi'] if e['midi'] is not None else -1
                            for e in estimates], dtype=np.int32)
        confs = np.array([e['confidence'] for e in estimates], dtype=np.float64)

    segments = segment(estimates, smoothed, confs, times, duration,
                       min_duration=min_segment_duration)

    log(f'Detected {len(segments)} bass segments (tempo={tempo:.0f} BPM)')
    return {'segments': segments, 'duration': duration, 'tempo': float(tempo)}


def export_json(result, wav_path, output_path=None):
    data = {
        'file': wav_path,
        'duration': result['duration'],
        'tempo': result['tempo'],
        'bass': [],
    }
    for seg in result['segments']:
        data['bass'].append({
            'startTime': round(seg['startTime'], 3),
            'endTime': round(seg['endTime'], 3),
            'bass': seg['bass'],
            'octave': seg['octave'],
            'confidence': round(seg['confidence'], 4),
        })
    out = json.dumps(data, indent=2, ensure_ascii=False)
    if output_path:
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        with open(output_path, 'w') as f:
            f.write(out)
        log(f'Saved to {output_path}')
    else:
        print(out)


def parse_reference_bass(ref):
    chords = ref.get('chords_in_order')
    if not chords:
        chords = [c.get('chord', '') if isinstance(c, dict) else c
                  for c in ref.get('chords', [])]
    bass_notes = []
    for c in chords:
        c = str(c).strip()
        if '/' in c:
            bass_raw = c.split('/')[1].strip()
            m = re.match(r'^([A-G][#b]?)', bass_raw)
            bass = m.group(1) if m else '?'
        else:
            m = re.match(r'^([A-G][#b]?)', c)
            bass = m.group(1) if m else '?'
        bass_notes.append(bass)
    return bass_notes


def needleman_wunsch(ref_seq, det_seq):
    GAP = -1
    MATCH = 2
    MISMATCH = -1

    def subst(a, b):
        if a is None or b is None:
            return MISMATCH
        return MATCH if a == b else MISMATCH

    nx, ny = len(ref_seq), len(det_seq)
    score = [[0] * (ny + 1) for _ in range(nx + 1)]
    trace = [[''] * (ny + 1) for _ in range(nx + 1)]

    for i in range(1, nx + 1):
        score[i][0] = score[i - 1][0] + GAP
        trace[i][0] = 'up'
    for j in range(1, ny + 1):
        score[0][j] = score[0][j - 1] + GAP
        trace[0][j] = 'left'

    for i in range(1, nx + 1):
        for j in range(1, ny + 1):
            diag = score[i - 1][j - 1] + subst(ref_seq[i - 1], det_seq[j - 1])
            up = score[i - 1][j] + GAP
            left = score[i][j - 1] + GAP
            if diag >= up and diag >= left:
                score[i][j] = diag
                trace[i][j] = 'diag'
            elif up >= left:
                score[i][j] = up
                trace[i][j] = 'up'
            else:
                score[i][j] = left
                trace[i][j] = 'left'

    i, j = nx, ny
    align_ref, align_det = [], []
    while i > 0 or j > 0:
        if trace[i][j] == 'diag':
            align_ref.insert(0, ref_seq[i - 1])
            align_det.insert(0, det_seq[j - 1])
            i -= 1
            j -= 1
        elif trace[i][j] == 'up':
            align_ref.insert(0, ref_seq[i - 1])
            align_det.insert(0, None)
            i -= 1
        else:
            align_ref.insert(0, None)
            align_det.insert(0, det_seq[j - 1])
            j -= 1
    return {'alignRef': align_ref, 'alignDet': align_det, 'score': score[nx][ny]}


def benchmark(wav_path, ref_path, output_path=None, use_v2=False, use_v3=False,
              smoothing_window=None, min_segment_duration=None, tracking='mode'):
    log(f'Loading reference {ref_path}')
    with open(ref_path) as f:
        ref = json.load(f)

    ref_bass = parse_reference_bass(ref)
    ref_bass_pc = [NOTE_TO_PC.get(b, -1) for b in ref_bass]

    ref_chords = ref.get('chords_in_order')
    if not ref_chords:
        ref_chords = [c.get('chord', '') if isinstance(c, dict) else c
                      for c in ref.get('chords', [])]
    slash_positions = {i for i, c in enumerate(ref_chords) if '/' in str(c)}

    mode = {'viterbi': 'V3-Viterbi', 'mode': 'V2.5-mode', 'none': 'V2-brute',
            }.get(tracking, 'V2' if use_v2 else 'V1')
    if tracking == 'mode' and smoothing_window is not None:
        mode += f'(h={smoothing_window})'
    log(f'Running bass detection ({mode})...')
    result = analyze_bass(wav_path, use_v2=use_v2, use_v3=use_v3,
                          smoothing_window=smoothing_window,
                          min_segment_duration=min_segment_duration,
                          tracking=tracking)
    det_segments = result['segments']
    det_bass_pc = [NOTE_TO_PC.get(s['bass'], -1) for s in det_segments]

    duration = result['duration']
    detected_tempo = float(result.get('tempo', 0) or 0)
    bpm = float(ref.get('bpm', 0) or 0)
    if bpm <= 0:
        bpm = detected_tempo if detected_tempo > 0 else 120
    measure_duration = (60.0 / bpm) * 4
    n_measures = duration / measure_duration if measure_duration > 0 else 1

    alignment = needleman_wunsch(ref_bass_pc, det_bass_pc)
    al_ref = alignment['alignRef']
    al_det = alignment['alignDet']
    total_aligned = sum(1 for r in al_ref if r is not None)
    matches = sum(1 for r, d in zip(al_ref, al_det)
                  if r is not None and d is not None and r == d)
    slash_matches = 0
    slash_total = 0
    ref_idx = 0
    for i in range(len(al_ref)):
        if al_ref[i] is not None:
            if ref_idx in slash_positions and al_det[i] is not None:
                slash_total += 1
                if al_ref[i] == al_det[i]:
                    slash_matches += 1
            ref_idx += 1

    bass_accuracy = (matches / total_aligned * 100) if total_aligned > 0 else 0.0
    slash_accuracy = (slash_matches / slash_total * 100) if slash_total > 0 else 0.0

    bass_changes = sum(1 for i in range(1, len(det_segments))
                       if det_segments[i]['bass'] != det_segments[i - 1]['bass'])
    temporal_coherence = bass_changes / n_measures if n_measures > 0 else 0.0
    fragmentation = len(det_segments) / len(ref_bass) if len(ref_bass) > 0 else 0.0
    segments_per_min = len(det_segments) / (duration / 60) if duration > 0 else 0.0

    octave_errors = 0
    octave_total = 0
    for i, s in enumerate(det_segments):
        if s['octave'] is not None:
            expected_oct = 2
            if s['octave'] != expected_oct:
                octave_errors += 1
            octave_total += 1
    octave_error_rate = (octave_errors / octave_total * 100) if octave_total > 0 else 0.0

    avg_seg_dur = duration / len(det_segments) if det_segments else 0.0

    print()
    print('=========================================================')
    print('BASS DETECTOR BENCHMARK')
    print('=========================================================')
    print(f'Reference       : {os.path.basename(ref_path)}')
    print(f'Audio           : {os.path.basename(wav_path)}')
    print(f'Duration        : {duration:.1f}s  Tempo: {bpm:.0f} BPM  Measures: {n_measures:.1f}')
    print(f'Ref bass notes  : {len(ref_bass)} ({slash_total} slash chords)')
    print(f'Det segments    : {len(det_segments)}')
    print(f'Alignment pairs : {total_aligned}')
    print('=========================================================')
    print(f'{"Metric":40s} {"Value":>10s}')
    print('-' * 52)
    print(f'{"Bass accuracy (pitch class)":40s} {bass_accuracy:>9.1f}%')
    print(f'{"Slash chord accuracy":40s} {slash_accuracy:>9.1f}%')
    print(f'{"Octave error rate":40s} {octave_error_rate:>9.1f}%')
    print(f'{"Temporal coherence (chg/measure)":40s} {temporal_coherence:>10.2f}')
    print(f'{"Fragmentation (det/ref)":40s} {fragmentation:>10.2f}')
    print(f'{"Segments/min":40s} {segments_per_min:>10.1f}')
    print(f'{"Avg segment duration":40s} {avg_seg_dur:>10.2f}s')
    print('=========================================================')
    if total_aligned <= 30:
        print('Alignment:')
        for i in range(len(al_ref)):
            r = NOTE_NAMES[al_ref[i]] if al_ref[i] is not None and al_ref[i] >= 0 else '-'
            d = NOTE_NAMES[al_det[i]] if al_det[i] is not None and al_det[i] >= 0 else '-'
            marker = '✓' if r == d and r != '-' else '✗' if r != '-' and d != '-' else ' '
            print(f'  {marker} ref={r}  det={d}')
    else:
        print(f'First 10 ref     : {ref_bass[:10]}')
        print(f'First 10 det     : {det_bass_pc[:10]}')
        print(f'  → ref as notes : {[NOTE_NAMES[p] if p >= 0 else "?" for p in ref_bass_pc[:10]]}')
        print(f'  → det as notes : {[NOTE_NAMES[p] if p >= 0 else "?" for p in det_bass_pc[:10]]}')

    metrics = {
        'bass_accuracy': round(bass_accuracy, 1),
        'slash_accuracy': round(slash_accuracy, 1),
        'octave_error_rate': round(octave_error_rate, 1),
        'temporal_coherence': round(temporal_coherence, 2),
        'fragmentation': round(fragmentation, 2),
        'segments_per_min': round(segments_per_min, 1),
        'avg_segment_duration': round(avg_seg_dur, 2),
        'det_segments': len(det_segments),
        'ref_notes': len(ref_bass),
        'alignment_score': alignment['score'],
    }
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(metrics, f, indent=2)
        log(f'Benchmark saved to {output_path}')
    print()
    print('__METRICS__')
    print(json.dumps(metrics))
    return metrics


def main():
    if len(sys.argv) < 3:
        print('Usage:')
        print('  python scripts/bass-detector.py analyze <wav_path> [--output <json>] [--v2]')
        print('                             [--smoothing-window <n>] [--min-segment-duration <s>]')
        print('                             [--tracking <mode|viterbi|none>]')
        print('  python scripts/bass-detector.py benchmark <reference.json> [--output <json>] [--v2]')
        print('                               [--smoothing-window <n>] [--min-segment-duration <s>]')
        print('                               [--tracking <mode|viterbi|none>]')
        print()
        print('Defaults: --v2 --smoothing-window 2 --min-segment-duration 0.15 --tracking mode')
        print()
        print('Bass Engine versions:')
        print('  V1    : CQT + HPS peak        (no --v2)')
        print('  V2    : + octave correction    (--v2, default)')
        print('  V2.5  : + mode smoothing h=2   (--v2, default)')
        print('  V3    : Viterbi experimental   (--tracking=viterbi, implies --v2)')
        sys.exit(1)

    command = sys.argv[1]

    def _find_arg(flag):
        if flag in sys.argv:
            idx = sys.argv.index(flag)
            if idx + 1 < len(sys.argv):
                return sys.argv[idx + 1]
        return None

    def _find_path(start_idx):
        for i in range(start_idx, len(sys.argv)):
            if not sys.argv[i].startswith('--'):
                return sys.argv[i]
        return None

    def _parse_kwargs():
        kwargs = {}
        if '--v2' in sys.argv:
            kwargs['use_v2'] = True
        if '--v3' in sys.argv or '--tracking' in sys.argv:
            if '--v3' in sys.argv:
                kwargs['use_v3'] = True
            arg = _find_arg('--tracking')
            kwargs['tracking'] = arg if arg else 'mode'
        win = _find_arg('--smoothing-window')
        if win is not None:
            kwargs['smoothing_window'] = int(win)
        seg_min = _find_arg('--min-segment-duration')
        if seg_min is not None:
            kwargs['min_segment_duration'] = float(seg_min)
        return kwargs

    if command == 'analyze':
        wav_path = _find_path(2)
        if not wav_path or not os.path.exists(wav_path):
            print(f'[Error] WAV file not found: {wav_path}')
            sys.exit(1)
        output_path = _find_arg('--output')
        kwargs = _parse_kwargs()
        result = analyze_bass(wav_path, **kwargs)
        export_json(result, wav_path, output_path)

    elif command == 'benchmark':
        ref_path = _find_path(2)
        if not ref_path or not os.path.exists(ref_path):
            print(f'[Error] Reference file not found: {ref_path}')
            sys.exit(1)
        with open(ref_path) as f:
            ref = json.load(f)
        wav_path = ref.get('file', '')
        if not wav_path:
            print('[Error] No "file" field in reference JSON')
            sys.exit(1)
        if not os.path.exists(wav_path):
            print(f'[Error] Audio file not found: {wav_path}')
            sys.exit(1)
        output_path = _find_arg('--output')
        kwargs = _parse_kwargs()
        benchmark(wav_path, ref_path, output_path, **kwargs)

    elif command == 'gen-tests':
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              'generate-bass-test-audio.py')
        if os.path.exists(script):
            log(f'Running {script}')
            os.system(f'python3 {script}')
        else:
            print(f'[Error] Not found: {script}')
            sys.exit(1)

    else:
        print(f'[Error] Unknown command: {command}')
        sys.exit(1)


if __name__ == '__main__':
    main()
