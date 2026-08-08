#!/usr/bin/env python3
"""Diagnostic pipeline — steps 2-3: audit etage par etage.
Pour chaque progression synthetique, capture les resultats intermediaires
a chaque etape du pipeline et calcule les metriques.
"""
import json, os, sys, re
from collections import defaultdict

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

import importlib.util
spec = importlib.util.spec_from_file_location(
    "audio_processor", os.path.join(PROJECT, 'electron', 'audio-processor.py')
)
ap_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap_mod)

_beat_track = ap_mod._beat_track
detect_key = ap_mod.detect_key
_build_chord_states = ap_mod._build_chord_states
_compute_observation_scores = ap_mod._compute_observation_scores
_initial_scores = ap_mod._initial_scores
_build_transition_matrix = ap_mod._build_transition_matrix
_viterbi = ap_mod._viterbi
_segment_path = ap_mod._segment_path
_merge_similar_segments = ap_mod._merge_similar_segments
_downgrade_advanced_segments = ap_mod._downgrade_advanced_segments
_clean_segments = ap_mod._clean_segments
_parse_chord_label = ap_mod._parse_chord_label
chord_name = ap_mod.chord_name
NOTE_NAMES = ap_mod.NOTE_NAMES
CHORD_TEMPLATES_WEIGHTED = ap_mod.CHORD_TEMPLATES_WEIGHTED
_build_diatonic_roots = ap_mod._build_diatonic_roots

import numpy as np
import librosa

# ─── Parsing helpers (same as compare-progressions.py) ───

NOTE_SHARP = set('C D E F G A'.split())
NOTE_SHARP_2 = {'C#', 'D#', 'F#', 'G#', 'A#'}
FLAT_TO_SHARP = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
}

def normalize_root(r):
    r = r.strip()
    r2 = r[:2]; r1 = r[:1]
    if r2 in FLAT_TO_SHARP: return FLAT_TO_SHARP[r2]
    if r2 in NOTE_SHARP_2: return r2
    if r1 in FLAT_TO_SHARP: return FLAT_TO_SHARP[r1]
    if r1 in NOTE_SHARP: return r1
    return r

QUALITY_MAP = {
    'major': '', 'minor': 'm', 'min': 'm',
    'min7': 'm7', 'dom7': '7',
    'dim': 'dim', 'hdim7': 'm7b5', 'hdim': 'm7b5',
    'half-diminished': 'm7b5', 'aug': 'aug',
}

def normalize_quality(q):
    q = q.strip()
    return QUALITY_MAP.get(q, q)

def parse_chord_label(chord_str):
    if chord_str == 'N' or not chord_str:
        return None, None
    m = re.match(r'^([A-G][#b]?)(.*)', chord_str)
    if not m: return None, None
    root_raw = m.group(1); suffix = m.group(2).strip()
    if suffix and suffix[0] in ('#', 'b'):
        root_raw += suffix[0]; suffix = suffix[1:].strip()
    return normalize_root(root_raw), normalize_quality(suffix)

def time_overlap(a_s, a_e, b_s, b_e):
    return max(0.0, min(a_e, b_e) - max(a_s, b_s))

def beat_ground_truth(gt_segs, beat_times, duration):
    """Assign each beat index to the GT chord that contains it.
    Returns list of (root, quality) per beat.
    """
    n_beats = len(beat_times)
    result = []
    for i in range(n_beats):
        b_s = float(beat_times[i])
        b_e = float(beat_times[i + 1]) if i + 1 < n_beats else duration
        mid = (b_s + b_e) / 2.0
        assigned = None
        for gs in gt_segs:
            if gs['start_time'] <= mid < gs['end_time']:
                assigned = (normalize_root(gs['root']), normalize_quality(gs['quality']))
                break
        result.append(assigned)
    return result

def beat_segments_from_chords(chords_per_beat, beat_times, duration):
    """Convert a per-beat chord list to segments.
    chords_per_beat: list of (root, quality) tuples or None per beat.
    """
    segs = []
    n = len(chords_per_beat)
    if n == 0: return segs
    cur_root, cur_qual = chords_per_beat[0]
    cur_start = 0
    for i in range(1, n):
        r, q = chords_per_beat[i]
        if r != cur_root or q != cur_qual:
            segs.append({
                'startTime': float(beat_times[cur_start]),
                'endTime': float(beat_times[i]),
                'root': cur_root,
                'quality': cur_qual,
            })
            cur_root, cur_qual = r, q
            cur_start = i
    segs.append({
        'startTime': float(beat_times[cur_start]),
        'endTime': float(duration),
        'root': cur_root,
        'quality': cur_qual if cur_root is not None else None,
    })
    return segs

def metrics_vs_gt(gt_segs, det_segs, dur_total):
    """Compute metrics between ground truth segments and detected segments.
    gt_segs: list of {start_time, end_time, root, quality}
    det_segs: list of {startTime, endTime, chord} or {root, quality}
    Returns dict with root_accuracy, quality_accuracy, full_accuracy, confusion, etc.
    """
    root_correct = 0.0
    quality_correct = 0.0
    full_correct = 0.0
    confusion = defaultdict(lambda: defaultdict(float))

    for gs in gt_segs:
        gs_root = normalize_root(gs['root'])
        gs_qual = normalize_quality(gs['quality'])
        gs_s = gs['start_time']; gs_e = gs['end_time']
        best_ov = 0.0; best_det = None
        for ds in det_segs:
            if 'chord' in ds:
                dr, dq = parse_chord_label(ds['chord'])
            else:
                dr = ds.get('root'); dq = ds.get('quality')
            if dr is None: continue
            ds_s = ds['startTime']; ds_e = ds['endTime']
            ov = time_overlap(gs_s, gs_e, ds_s, ds_e)
            if ov > best_ov:
                best_ov = ov
                best_det = (dr, dq)
        if best_det and best_ov > 0:
            dr, dq = best_det
            if dr == gs_root: root_correct += best_ov
            if dq == gs_qual: quality_correct += best_ov
            if dr == gs_root and dq == gs_qual: full_correct += best_ov
            confusion[gs_qual][dq] += best_ov

    td = max(dur_total, 1e-9)
    return {
        'duration_total': dur_total,
        'root_accuracy': round(root_correct / td, 4),
        'quality_accuracy': round(quality_correct / td, 4),
        'full_accuracy': round(full_correct / td, 4),
        'root_correct_seconds': round(root_correct, 3),
        'quality_correct_seconds': round(quality_correct, 3),
        'full_correct_seconds': round(full_correct, 3),
        'confusion': {k: dict(v) for k, v in confusion.items()},
    }

def labels_changed(prev_segs, curr_segs, dur_total):
    """Compare two segment lists at beat resolution to count changes.
    For each beat, determine chord from prev_stage and curr_stage.
    Returns: total_changed_seconds, corrected_seconds, regressed_seconds,
             wrong_to_wrong_seconds.

    'corrected': prev wrong, curr right
    'regressed': prev right, curr wrong
    'wrong_to_wrong': prev wrong, curr wrong (different wrong)
    """
    # Build beat-resolution chord arrays from segments
    # Use 100ms steps for reasonable precision
    step = 0.1
    n_steps = int(dur_total / step) + 1
    prev_chord = [None] * n_steps
    curr_chord = [None] * n_steps

    def fill(arr, segs):
        for s in segs:
            if 'chord' in s:
                r, q = parse_chord_label(s['chord'])
            else:
                r = s.get('root'); q = s.get('quality')
            if r is None: continue
            s_s = s['startTime']; s_e = s['endTime']
            si = int(s_s / step); ei = int(s_e / step)
            for i in range(si, min(ei, n_steps)):
                arr[i] = (r, q)

    fill(prev_chord, prev_segs)
    fill(curr_chord, curr_segs)

    changed = 0.0
    corrected = 0.0
    regressed = 0.0
    wrong2wrong = 0.0

    # GT for determining right/wrong
    # We need GT to determine what's correct
    # But labels_changed should be called with GT context
    # Actually, let's make GT optional and just count raw changes
    for i in range(n_steps):
        p = prev_chord[i]
        c = curr_chord[i]
        if p != c:
            changed += step

    return {
        'changed_seconds': round(changed, 3),
        'changed_pct': round(changed / max(dur_total, 1e-9) * 100, 1),
    }

def labels_corrected(prev_segs, curr_segs, gt_segs, dur_total):
    """Count corrected, regressed, wrong→wrong at beat resolution.
    Uses ground truth to determine right vs wrong.
    """
    step = 0.1
    n_steps = int(dur_total / step) + 1
    prev_chord = [None] * n_steps
    curr_chord = [None] * n_steps
    gt_chord = [None] * n_steps

    def fill(arr, segs, is_gt=False):
        for s in segs:
            if is_gt:
                r = normalize_root(s['root'])
                q = normalize_quality(s['quality'])
            elif 'chord' in s:
                r, q = parse_chord_label(s['chord'])
            else:
                r = s.get('root'); q = s.get('quality')
            if r is None: continue
            s_s = s.get('startTime', s.get('start_time', 0))
            s_e = s.get('endTime', s.get('end_time', 0))
            si = int(s_s / step); ei = int(s_e / step)
            for i in range(si, min(ei, n_steps)):
                arr[i] = (r, q)

    fill(prev_chord, prev_segs)
    fill(curr_chord, curr_segs)
    fill(gt_chord, gt_segs, is_gt=True)

    corrected = 0.0
    regressed = 0.0
    w2w = 0.0
    unchanged = 0.0

    for i in range(n_steps):
        p = prev_chord[i]
        c = curr_chord[i]
        g = gt_chord[i]
        if g is None:
            continue
        if p == c:
            unchanged += step
        else:
            # Something changed
            prev_ok = (p == g) if p is not None else False
            curr_ok = (c == g) if c is not None else False
            if not prev_ok and curr_ok:
                corrected += step
            elif prev_ok and not curr_ok:
                regressed += step
            else:
                w2w += step

    return {
        'corrected_seconds': round(corrected, 3),
        'regressed_seconds': round(regressed, 3),
        'wrong_to_wrong_seconds': round(w2w, 3),
        'unchanged_seconds': round(unchanged, 3),
        'corrected_pct': round(corrected / max(dur_total, 1e-9) * 100, 1),
        'regressed_pct': round(regressed / max(dur_total, 1e-9) * 100, 1),
        'w2w_pct': round(w2w / max(dur_total, 1e-9) * 100, 1),
    }


# ─── Pipeline replication ───

def run_diagnostic(wav_path, gt_path):
    name = os.path.basename(wav_path).replace('.wav', '')
    print(f'\n=== {name} ===')

    with open(gt_path) as f: gt = json.load(f)
    gt_segs = gt['segments']
    dur_total = gt['chord_duration'] * len(gt['progression']) * gt['repeats']
    print(f'  duree: {dur_total:.1f}s, accords: {len(gt["progression"])} x {gt["repeats"]} reps')

    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    duration = float(len(y) / sr)
    hop_length = 512

    # 1. Beat tracking
    tempo, beat_frames = _beat_track(y, sr, hop_length=hop_length)
    beat_frames = np.atleast_1d(beat_frames)
    if len(beat_frames) == 0 or beat_frames[0] != 0:
        beat_frames = np.concatenate(([0], beat_frames))
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    if len(beat_times) < 2:
        print('  SKIP: < 2 beats'); return None

    # 2. Key detection
    key, key_candidates = detect_key(y, sr)

    # 3. Beat-sync chroma
    y_harm, _ = librosa.effects.hpss(y, margin=8.0)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
    n_frames = chroma.shape[1]
    K = len(beat_frames)
    beat_chroma = np.zeros((12, K), dtype=np.float32)
    frame_energies = np.zeros(K, dtype=np.float32)
    for k in range(K):
        start_f = int(beat_frames[k])
        end_f = int(beat_frames[k + 1]) if k + 1 < K else n_frames
        if end_f <= start_f:
            beat_chroma[:, k] = 0.0; frame_energies[k] = 0.0
        else:
            beat_chroma[:, k] = np.mean(chroma[:, start_f:end_f], axis=1)
            frame_energies[k] = float(np.sum(beat_chroma[:, k]))

    # 4. HMM
    states = _build_chord_states()
    obs_scores = _compute_observation_scores(beat_chroma, states, key, frame_energies)
    obs_scores[0] += _initial_scores(states, key)
    obs_scores = np.clip(obs_scores, 0.0, 1.0)
    trans = _build_transition_matrix(states, key)
    path = _viterbi(obs_scores, trans)

    # GT per beat
    gt_beats = beat_ground_truth(gt_segs, beat_times, duration)

    # ─── Stage 1: Best observation candidate per beat ───
    best_obs_beats = []
    for t in range(K):
        best_idx = int(np.argmax(obs_scores[t]))
        best_r = states[best_idx]['root']
        best_q = states[best_idx]['suffix']
        best_obs_beats.append((NOTE_NAMES[best_r] if best_r is not None else None, best_q))

    # ─── Stage 2: Viterbi per beat ───
    vit_beats = []
    for t in range(K):
        si = path[t]
        r = states[si]['root']
        q = states[si]['suffix']
        vit_beats.append((NOTE_NAMES[r] if r is not None else None, q))

    # Convert beat-level stages to segment lists for metric computation
    def beat_to_segs(chord_pairs):
        segs = []
        if not chord_pairs: return segs
        cur_r, cur_q = chord_pairs[0]
        cur_s = 0
        for i in range(1, K):
            r, q = chord_pairs[i]
            if r != cur_r or q != cur_q:
                segs.append({
                    'startTime': float(beat_times[cur_s]),
                    'endTime': float(beat_times[i]),
                    'root': cur_r, 'quality': cur_q,
                })
                cur_r, cur_q = r, q; cur_s = i
        segs.append({
            'startTime': float(beat_times[cur_s]),
            'endTime': float(duration),
            'root': cur_r, 'quality': cur_q if cur_r is not None else None,
        })
        return segs

    s1_segs = beat_to_segs(best_obs_beats)
    s2_segs = beat_to_segs(vit_beats)

    # ─── Stage 3: _segment_path() ───
    s3_segs_raw = _segment_path(path, beat_times, duration, states, obs_scores)

    # Add observation_candidates (as production does before merge)
    for seg in s3_segs_raw:
        idxs = seg.get('beatIndices', [])
        if idxs:
            seg_obs = obs_scores[idxs, :]
            mean_scores = np.mean(seg_obs, axis=0)
            top3_idx = np.argsort(mean_scores)[-3:][::-1]
            seg['observation_candidates'] = [
                {'chord': states[int(si)]['name'],
                 'emission_score': round(float(mean_scores[int(si)]), 3)}
                for si in top3_idx
            ]
        else:
            seg['observation_candidates'] = []
        seg['viterbi_choice'] = seg['chord']

    s3_segs = s3_segs_raw  # alias

    # ─── Stage 4: _merge_similar_segments() ───
    s4_segs = _merge_similar_segments(s3_segs)

    # Re-add observation_candidates to merged segments (production replicates them from s3)
    for seg in s4_segs:
        # Match with s3 segments to get candidates
        s_s = seg['startTime']; s_e = seg['endTime']
        cands = []
        for s3 in s3_segs:
            ov = time_overlap(s_s, s_e, s3['startTime'], s3['endTime'])
            if ov > 0:
                cands.extend(s3.get('observation_candidates', []))
        # Keep unique by chord name
        seen = set()
        uniq = []
        for c in cands:
            if c['chord'] not in seen:
                seen.add(c['chord']); uniq.append(c)
        seg['observation_candidates'] = uniq[:3]
        seg['viterbi_choice'] = seg['chord']

    # ─── Stage 5a: Downgrade A ───
    s5a_segs = _downgrade_advanced_segments(
        [dict(s) for s in s4_segs], beat_chroma, states, threshold=0.03,
        mode='legacy_family_fix'
    )

    # ─── Stage 5b: Downgrade C ───
    s5c_segs = _downgrade_advanced_segments(
        [dict(s) for s in s4_segs], beat_chroma, states, threshold=0.03,
        mode='hybrid'
    )

    # ─── Stage 6a: Clean A ───
    s6a_segs = _clean_segments(s5a_segs, min_duration=0.4, silence_min=1.2)

    # ─── Stage 6b: Clean C ───
    s6c_segs = _clean_segments(s5c_segs, min_duration=0.4, silence_min=1.2)

    # ─── Convert to metric-compatible format ───
    def to_metric_fmt(segs):
        return [{
            'startTime': s['startTime'],
            'endTime': s['endTime'],
            'chord': s['chord'],
        } for s in segs]

    stages = {
        's1_best_obs': [{
            'startTime': s['startTime'], 'endTime': s['endTime'],
            'root': s['root'], 'quality': s['quality'],
        } for s in s1_segs],
        's2_viterbi': [{
            'startTime': s['startTime'], 'endTime': s['endTime'],
            'root': s['root'], 'quality': s['quality'],
        } for s in s2_segs],
        's3_segmented': to_metric_fmt(s3_segs),
        's4_merged': to_metric_fmt(s4_segs),
        's5a_downgrade_A': to_metric_fmt(s5a_segs),
        's5c_downgrade_C': to_metric_fmt(s5c_segs),
        's6a_clean_A': to_metric_fmt(s6a_segs),
        's6c_clean_C': to_metric_fmt(s6c_segs),
    }

    # ─── Compute metrics per stage ───
    metrics = {}
    stage_labels = {
        's1_best_obs': '1. Best observation (per beat)',
        's2_viterbi': '2. Viterbi brut (per beat)',
        's3_segmented': '3. Apres segmentation',
        's4_merged': '4. Apres merge_similar_segments',
        's5a_downgrade_A': '5a. Apres downgrade A (legacy_family_fix)',
        's5c_downgrade_C': '5c. Apres downgrade C (hybrid)',
        's6a_clean_A': '6a. Apres clean (A final)',
        's6c_clean_C': '6c. Apres clean (C final)',
    }

    for skey, ssegs in stages.items():
        m = metrics_vs_gt(gt_segs, ssegs, dur_total)
        m['n_segments'] = len(ssegs)
        metrics[skey] = m

    # ─── Label changes between consecutive stages ───
    stage_order = ['s1_best_obs', 's2_viterbi', 's3_segmented', 's4_merged',
                   's5a_downgrade_A', 's6a_clean_A']
    changes = {}
    for i in range(len(stage_order) - 1):
        a, b = stage_order[i], stage_order[i+1]
        ch = labels_corrected(stages[a], stages[b], gt_segs, dur_total)
        ch['n_segments_prev'] = len(stages[a])
        ch['n_segments_curr'] = len(stages[b])
        changes[f'{a}→{b}'] = ch

    # Also C path: s4 → s5c → s6c
    for a, b in [('s4_merged', 's5c_downgrade_C'), ('s5c_downgrade_C', 's6c_clean_C')]:
        ch = labels_corrected(stages[a], stages[b], gt_segs, dur_total)
        ch['n_segments_prev'] = len(stages[a])
        ch['n_segments_curr'] = len(stages[b])
        changes[f'{a}→{b}'] = ch

    # ─── Save results ───
    result = {
        'name': name,
        'duration': duration,
        'dur_total': dur_total,
        'progression': gt['progression'],
        'repeats': gt['repeats'],
        'key': key,
        'tempo': tempo,
        'n_beats': K,
        'metrics': metrics,
        'stage_labels': stage_labels,
        'changes': changes,
        'stages': {k: v for k, v in stages.items()},  # full segments for inspection
    }

    out_path = os.path.join(OUT_DIR, f'{name}_diagnostic.json')
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2, default=str)
    print(f'  Sauvegarde: {out_path}')

    # ─── Print summary ───
    print(f'\n  {"Etape":>35}  {"root%":>7}  {"qual%":>7}  {"full%":>7}  {"segms":>5}')
    print(f'  {"-"*35}  {"-"*7}  {"-"*7}  {"-"*7}  {"-"*5}')
    for skey in stage_order:
        m = metrics.get(skey, {})
        label = stage_labels.get(skey, skey)
        print(f'  {label:>35}  {m.get("root_accuracy",0)*100:>6.1f}%  '
              f'{m.get("quality_accuracy",0)*100:>6.1f}%  '
              f'{m.get("full_accuracy",0)*100:>6.1f}%  '
              f'{m.get("n_segments",0):>5}')

    # Print C stages
    for skey in ['s5c_downgrade_C', 's6c_clean_C']:
        m = metrics.get(skey, {})
        label = stage_labels.get(skey, skey)
        print(f'  {label:>35}  {m.get("root_accuracy",0)*100:>6.1f}%  '
              f'{m.get("quality_accuracy",0)*100:>6.1f}%  '
              f'{m.get("full_accuracy",0)*100:>6.1f}%  '
              f'{m.get("n_segments",0):>5}')

    # Print changes summary
    print(f'\n  -- Corrections/regressions par transition --')
    for ckey, ch in changes.items():
        print(f'  {ckey:>50}: '
              f'corr={ch["corrected_seconds"]:.2f}s ({ch["corrected_pct"]}%)  '
              f'reg={ch["regressed_seconds"]:.2f}s ({ch["regressed_pct"]}%)  '
              f'w2w={ch["wrong_to_wrong_seconds"]:.2f}s ({ch["w2w_pct"]}%)')

    # ─── Step 3: Confusion analysis + observation rank ───
    print(f'\n  -- Confusions principales (etape 6c finale C) --')

    # Build mapping: state index -> (root_norm, quality_norm)
    state_chord_map = {}
    for si, st in enumerate(states):
        r = st['root']
        q = st['suffix']
        if r is not None:
            state_chord_map[si] = (NOTE_NAMES[r], q)
        else:
            state_chord_map[si] = (None, q)

    # For each beat, find the rank of the correct quality in observation scores
    gt_beat_pairs = beat_ground_truth(gt_segs, beat_times, duration)

    # Per confusion: collect observation ranks of the correct chord
    confusion_detail = defaultdict(lambda: {
        'total_dur': 0.0,
        'n_independent': 0,
        'first_stage': None,
        'obs_ranks': [],  # list of (rank, score) for correct quality
        'n_beats': 0,
        'correct_in_top3': 0,
    })

    conf = metrics.get('s6c_clean_C', {}).get('confusion', {})
    for gt_q, dets in sorted(conf.items()):
        for det_q, dur_item in sorted(dets.items(), key=lambda x: -x[1]):
            if gt_q != det_q and dur_item > 0.3:
                key = (gt_q, det_q)
                cd = confusion_detail[key]
                cd['total_dur'] += dur_item

                # Find first stage
                first = None
                for skey in stage_order:
                    c2 = metrics.get(skey, {}).get('confusion', {})
                    if c2.get(gt_q, {}).get(det_q, 0) >= dur_item * 0.5:
                        first = stage_labels.get(skey, skey)
                        break
                if first and (cd['first_stage'] is None or stage_order.index(skey) < stage_order.index(
                    [k for k, v in stage_labels.items() if v == cd['first_stage']][0]
                )):
                    cd['first_stage'] = first

    # Count independent harmonic instances
    for key in confusion_detail:
        gt_q, det_q = key
        n_uniq = sum(1 for chord in gt['progression'] if normalize_quality(chord['quality']) == gt_q)
        confusion_detail[key]['n_independent'] = n_uniq

    # Observation rank analysis: for each beat, find rank of correct quality
    for t in range(K):
        gt_pair = gt_beat_pairs[t]
        if gt_pair is None:
            continue
        gt_r, gt_q = gt_pair

        # Build ranked list of (state_idx, score) for this beat
        obs_t = obs_scores[t]
        ranked = np.argsort(obs_t)[::-1]  # descending

        # Find rank of correct quality among states with correct root
        # We look for any state that matches (gt_root, gt_quality)
        correct_rank = None
        for rank, si in enumerate(ranked):
            r, q = state_chord_map[si]
            if r == gt_r and q == gt_q:
                correct_rank = rank
                break

        # Now determine which confusion cell this beat belongs to at stage 6c
        beat_s = beat_times[t]
        beat_e = beat_times[t + 1] if t + 1 < K else duration
        beat_dur = beat_e - beat_s
        beat_mid = (beat_s + beat_e) / 2

        # Find the detected chord at final stage for this beat
        det_r = None; det_q = None
        for sseg in stages['s6c_clean_C']:
            seg_s = sseg.get('startTime', 0)
            seg_e = sseg.get('endTime', 0)
            if seg_s <= beat_mid < seg_e:
                if 'chord' in sseg:
                    det_r, det_q = parse_chord_label(sseg['chord'])
                else:
                    det_r = sseg.get('root')
                    det_q = sseg.get('quality')
                break

        if det_r == gt_r and det_q is not None and det_q != gt_q:
            key = (gt_q, det_q)
            if key in confusion_detail:
                cd = confusion_detail[key]
                cd['n_beats'] += 1
                if correct_rank is not None:
                    cd['obs_ranks'].append(correct_rank)
                    if correct_rank < 3:
                        cd['correct_in_top3'] += 1

    # Print confusion detail
    for (gt_q, det_q), cd in sorted(confusion_detail.items(), key=lambda x: -x[1]['total_dur']):
        ranks = cd['obs_ranks']
        avg_rank = sum(ranks) / len(ranks) if ranks else -1
        in_top3_pct = cd['correct_in_top3'] / max(cd['n_beats'], 1) * 100
        first_stage = cd.get('first_stage', '?')
        n_uniq = cd['n_independent']
        dur_v = cd['total_dur']
        print(f'  {gt_q:>6} -> {det_q:<6}  '
              f'dur={dur_v:.1f}s ({dur_v/dur_total*100:.0f}%)  '
              f'instances={n_uniq}  '
              f'rang_moyen_obs={avg_rank:.1f}  '
              f'correct_dans_top3={in_top3_pct:.0f}%  '
              f'1ere_etape={first_stage}')

    return result


def main():
    wav_files = sorted(f for f in os.listdir(PROG_DIR) if f.endswith('.wav'))
    if not wav_files:
        print('No WAV files in', PROG_DIR); sys.exit(1)

    all_results = {}
    for wf in wav_files:
        wav_path = os.path.join(PROG_DIR, wf)
        gt_path = wav_path.replace('.wav', '.json')
        if not os.path.exists(gt_path):
            print(f'SKIP (no GT): {wf}'); continue
        result = run_diagnostic(wav_path, gt_path)
        if result:
            all_results[wf.replace('.wav', '')] = result

    # ─── Aggregate report ───
    print(f'\n\n{"="*70}')
    print('RESUME GLOBAL')
    print(f'{"="*70}')

    for name, res in all_results.items():
        print(f'\n--- {name} ---')
        print(f'  {"Etape":>35}  {"root%":>7}  {"qual%":>7}  {"full%":>7}  {"segms":>5}')
        print(f'  {"-"*35}  {"-"*7}  {"-"*7}  {"-"*7}  {"-"*5}')
        stage_labels = res['stage_labels']
        for skey in ['s1_best_obs', 's2_viterbi', 's3_segmented', 's4_merged',
                      's5a_downgrade_A', 's5c_downgrade_C', 's6a_clean_A', 's6c_clean_C']:
            m = res['metrics'].get(skey, {})
            label = stage_labels.get(skey, skey)
            print(f'  {label:>35}  {m.get("root_accuracy",0)*100:>6.1f}%  '
                  f'{m.get("quality_accuracy",0)*100:>6.1f}%  '
                  f'{m.get("full_accuracy",0)*100:>6.1f}%  '
                  f'{m.get("n_segments",0):>5}')

    # Global average
    print(f'\n--- MOYENNE GLOBALE ---')
    for skey in ['s1_best_obs', 's2_viterbi', 's3_segmented', 's4_merged',
                  's5a_downgrade_A', 's5c_downgrade_C', 's6a_clean_A', 's6c_clean_C']:
        total_root = 0.0; total_qual = 0.0; total_full = 0.0; total_dur = 0.0
        for name, res in all_results.items():
            m = res['metrics'].get(skey, {})
            d = res['dur_total']
            total_root += m.get('root_correct_seconds', 0)
            total_qual += m.get('quality_correct_seconds', 0)
            total_full += m.get('full_correct_seconds', 0)
            total_dur += d
        label = stage_labels.get(skey, skey) if 'stage_labels' in res else skey
        print(f'  {label:>35}  {total_root/total_dur*100:>6.1f}%  '
              f'{total_qual/total_dur*100:>6.1f}%  '
              f'{total_full/total_dur*100:>6.1f}%')

    # Confusions globales
    print(f'\n--- CONFUSIONS QUALITE GLOBALES (etape 6c finale C) ---')
    global_conf = defaultdict(lambda: defaultdict(float))
    for name, res in all_results.items():
        conf = res['metrics'].get('s6c_clean_C', {}).get('confusion', {})
        for gt_q, dets in conf.items():
            for det_q, dur in dets.items():
                if gt_q != det_q:
                    global_conf[gt_q][det_q] += dur
    total_dur_all = sum(r['dur_total'] for r in all_results.values())
    for gt_q in sorted(global_conf.keys()):
        for det_q, dur in sorted(global_conf[gt_q].items(), key=lambda x: -x[1]):
            if dur > 0.5:
                print(f'  {gt_q:>6} -> {det_q:<6}  {dur:.1f}s ({dur/total_dur_all*100:.1f}%)')

    # Total report
    report = {
        'total_duration': total_dur_all,
        'summary': {},
        'global_confusions': {k: dict(v) for k, v in global_conf.items()},
    }
    for skey in ['s1_best_obs', 's2_viterbi', 's3_segmented', 's4_merged',
                  's5a_downgrade_A', 's5c_downgrade_C', 's6a_clean_A', 's6c_clean_C']:
        total_root = 0.0; total_qual = 0.0; total_full = 0.0; total_dur = 0.0
        for name, res in all_results.items():
            m = res['metrics'].get(skey, {})
            d = res['dur_total']
            total_root += m.get('root_correct_seconds', 0)
            total_qual += m.get('quality_correct_seconds', 0)
            total_full += m.get('full_correct_seconds', 0)
            total_dur += d
        report['summary'][skey] = {
            'root_accuracy': round(total_root / max(total_dur, 1e-9), 4),
            'quality_accuracy': round(total_qual / max(total_dur, 1e-9), 4),
            'full_accuracy': round(total_full / max(total_dur, 1e-9), 4),
        }

    report_path = os.path.join(OUT_DIR, 'rapport_global.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\nRapport global: {report_path}')

    # Print the final overall accuracy
    final_qual = report['summary']['s6c_clean_C']['quality_accuracy']
    print(f'\n=== VERDICT ===')
    print(f'Quality accuracy finale (moyenne 4 progressions, C): {final_qual*100:.1f}%')
    if abs(final_qual - 0.413) < 0.01:
        print('>>> CONFIRME: 41.3% est correct <<<')
    else:
        print(f'>>> ATTENTION: {final_qual*100:.1f}% vs 41.3% attendu <<<')


if __name__ == '__main__':
    main()
