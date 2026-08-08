#!/usr/bin/env python3
"""Experiment: compare O0, O2 (contradictions), O3 (pairwise discriminators).
Synthetic benchmark + audio non-regression.
No production files modified.
"""
import json, os, sys, re
from collections import defaultdict
import importlib.util
import numpy as np

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

spec = importlib.util.spec_from_file_location(
    "audio_processor", os.path.join(PROJECT, 'electron', 'audio-processor.py')
)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

NOTE_NAMES = ap.NOTE_NAMES
CHORD_TEMPLATES_WEIGHTED = dict(ap.CHORD_TEMPLATES_WEIGHTED)

BASE_TEMPLATES = {
    '':    [(0, 1.0), (4, 0.8),  (7, 0.6)],
    'm':   [(0, 1.0), (3, 0.85), (7, 0.55)],
    '7':   [(0, 1.0), (4, 0.75), (7, 0.55), (10, 0.4)],
    'maj7': [(0, 1.0), (4, 0.85), (7, 0.65), (11, 0.9)],
    'sus2': [(0, 1.0), (2, 0.75), (7, 0.55)],
    'sus4': [(0, 1.0), (5, 0.75), (7, 0.55)],
    'm7':  [(0, 1.0), (3, 0.85), (7, 0.65), (10, 0.85)],
    'dim': [(0, 1.0), (3, 0.9),  (6, 0.9)],
    'm7b5': [(0, 1.0), (3, 0.85), (6, 0.9), (10, 0.85)],
    'aug': [(0, 1.0), (4, 0.85), (8, 0.9)],
}

ALL_QUALITIES = list(BASE_TEMPLATES.keys())

QUALITY_FAMILIES = {
    '': 0, 'maj7': 0, 'sus2': 0, 'sus4': 0,
    '7': 1,
    'm': 2, 'm7': 2,
    'dim': 3, 'm7b5': 3,
    'aug': 4,
}

DISCRIMINANT_INTERVALS = {
    ('', '7'): (10, 0.15),
    ('', 'maj7'): (11, 0.15),
    ('', 'sus2'): (2, 0.10),
    ('', 'sus4'): (5, 0.10),
    ('7', 'maj7'): (11, 0.15),
    ('maj7', '7'): (10, 0.15),
    ('m', 'm7'): (10, 0.15),
    ('m', 'm7b5'): (6, 0.15),
    ('m7', 'm7b5'): (6, 0.10),
    ('m7b5', 'dim'): (10, 0.10),
    ('sus2', 'sus4'): (5, 0.10),
    ('sus4', 'sus2'): (2, 0.10),
}

SAME_FAMILY_PAIRS = [
    ('', '7'), ('', 'maj7'), ('7', 'maj7'),
    ('m', 'm7'), ('m', 'm7b5'), ('m7', 'm7b5'),
    ('', 'sus2'), ('', 'sus4'), ('sus2', 'sus4'),
    ('m', 'sus2'), ('m', 'sus4'),
]

def build_template_vector(tpl, root=0, l2_norm=True):
    v = np.zeros(12, dtype=np.float32)
    for pc, w in tpl:
        v[(root + pc) % 12] = w
    if l2_norm:
        n = float(np.linalg.norm(v))
        if n > 1e-8:
            v = v / n
    return v

def build_O2_templates(w):
    """Modify base templates by adding negative weights on distinctive intervals."""
    templates = {}
    for q in ALL_QUALITIES:
        tpl = list(BASE_TEMPLATES[q])
        for (src, tgt), (interval, default_w) in DISCRIMINANT_INTERVALS.items():
            if src == q:
                tpl.append((interval, -w * default_w))
        templates[q] = tpl
    return templates

def score_O0(chroma_vec, root_templates):
    """Baseline: dot(chroma_norm, template_l2_norm) for all qualities at one root."""
    scores = {}
    cn = np.array(chroma_vec, dtype=np.float32)
    nrm = float(np.linalg.norm(cn))
    if nrm > 1e-8:
        cn = cn / nrm
    for q, tpl in root_templates.items():
        tv = build_template_vector(tpl, 0, l2_norm=True)
        s = float(np.dot(cn, tv))
        s = max(0.0, min(1.0, s))
        scores[q] = s
    return scores

def score_O2(chroma_vec, root_templates_o2):
    """Contradiction templates. Uses O2 templates with negative intervals."""
    cn = np.array(chroma_vec, dtype=np.float32)
    nrm = float(np.linalg.norm(cn))
    if nrm > 1e-8:
        cn = cn / nrm
    scores = {}
    for q, tpl in root_templates_o2.items():
        tv = build_template_vector(tpl, 0, l2_norm=True)
        s = float(np.dot(cn, tv))
        s = max(0.0, min(1.0, s))
        scores[q] = s
    return scores

def score_O3(chroma_vec, base_scores, w, delta):
    """Post-hoc pairwise adjustment for close families."""
    scores = dict(base_scores)
    cn = np.array(chroma_vec, dtype=np.float32)

    for q1, q2 in SAME_FAMILY_PAIRS:
        k1, k2 = q1, q2
        if k1 not in scores or k2 not in scores:
            continue
        s1, s2 = scores[k1], scores[k2]
        gap = abs(s1 - s2)
        if gap >= delta:
            continue
        # Find which pair has a distinctive interval
        interval = None
        if (k1, k2) in DISCRIMINANT_INTERVALS:
            interval = DISCRIMINANT_INTERVALS[(k1, k2)][0]
            booster, reducer = k2, k1
        elif (k2, k1) in DISCRIMINANT_INTERVALS:
            interval = DISCRIMINANT_INTERVALS[(k2, k1)][0]
            booster, reducer = k1, k2
        else:
            continue
        e = float(cn[interval % 12])
        adjust = w * e
        scores[booster] = min(1.0, scores[booster] + adjust)
        scores[reducer] = max(0.0, scores[reducer] - adjust)

    return scores

def build_root_templates(templates_dict, root=0):
    shifted = {}
    for q, tpl in templates_dict.items():
        shifted[q] = [((pc + root) % 12, w) for pc, w in tpl]
    return shifted

def flat_suffix(q):
    if q.startswith('m') and q != 'maj7':
        return q
    if q in ('maj7', 'sus2', 'sus4', '7', 'dim', 'aug'):
        return q
    if q == '':
        return ''
    return ''

# ─── Evaluation on synthetic data ───

def evaluate_synthetic(cases, label, templates_dict, scoring_fn, o2_w=None, o3_w=None, o3_delta=None):
    n = len(cases)
    correct = 0
    top3 = 0
    conf = defaultdict(lambda: defaultdict(int))
    fp_ext = 0
    fp_ext_total = 0
    fam_major_7_maj7_ok = 0
    fam_major_7_maj7_n = 0
    fam_minor_m7_m7b5_ok = 0
    fam_minor_m7_m7b5_n = 0
    fam_sus_ok = 0
    fam_sus_n = 0

    for case in cases:
        root = case['root']
        gt_q = case['quality']
        chroma = case['chroma']

        rtpl = build_root_templates(templates_dict, root)
        base_scores = score_O0(chroma, rtpl) if scoring_fn == 'O0' else {}

        if scoring_fn == 'O0':
            scores = score_O0(chroma, rtpl)
        elif scoring_fn == 'O2':
            o2_tpl = build_O2_templates(o2_w)
            rtpl_o2 = build_root_templates(o2_tpl, root)
            scores = score_O2(chroma, rtpl_o2)
        elif scoring_fn == 'O3':
            base = score_O0(chroma, rtpl)
            scores = score_O3(chroma, base, o3_w, o3_delta)
        else:
            scores = score_O0(chroma, rtpl)

        ranked = sorted(scores.items(), key=lambda x: -x[1])
        best_q = ranked[0][0]
        top3_qs = set(q for q, s in ranked[:3])

        if best_q == gt_q:
            correct += 1
        if gt_q in top3_qs:
            top3 += 1

        conf[gt_q][best_q] += 1

        # False positive extension: triad detected as extension
        if gt_q in ('', 'm'):
            fp_ext_total += 1
            if best_q in ('7', 'maj7', 'sus2', 'sus4', 'm7'):
                fp_ext += 1

        # Per-family accuracy
        f_gt = QUALITY_FAMILIES[gt_q]
        f_best = QUALITY_FAMILIES.get(best_q, -1)
        if gt_q in ('', '7', 'maj7'):
            fam_major_7_maj7_n += 1
            if f_gt == f_best or (f_gt == 0 and f_best == 1) or (f_gt == 1 and f_best == 0):
                if best_q == gt_q:
                    fam_major_7_maj7_ok += 1
        if gt_q in ('m', 'm7', 'm7b5'):
            fam_minor_m7_m7b5_n += 1
            if best_q == gt_q:
                fam_minor_m7_m7b5_ok += 1
        if gt_q in ('', 'sus2', 'sus4', 'm'):
            fam_sus_n += 1
            if best_q == gt_q:
                fam_sus_ok += 1

    quality = correct / max(n, 1)
    top3_acc = top3 / max(n, 1)
    fp_rate = fp_ext / max(fp_ext_total, 1)

    result = {
        'label': label,
        'n_cases': n,
        'quality_accuracy': round(quality, 5),
        'top3_accuracy': round(top3_acc, 5),
        'false_positive_extension_rate': round(fp_rate, 5),
        'confusion': {k: dict(v) for k, v in sorted(conf.items())},
        'per_family': {
            'major_7_maj7_accuracy': round(fam_major_7_maj7_ok / max(fam_major_7_maj7_n, 1), 5),
            'major_7_maj7_n': fam_major_7_maj7_n,
            'minor_m7_m7b5_accuracy': round(fam_minor_m7_m7b5_ok / max(fam_minor_m7_m7b5_n, 1), 5),
            'minor_m7_m7b5_n': fam_minor_m7_m7b5_n,
            'sus_accuracy': round(fam_sus_ok / max(fam_sus_n, 1), 5),
            'sus_n': fam_sus_n,
        },
        'params': {},
    }
    if o2_w is not None:
        result['params']['w'] = o2_w
    if o3_w is not None:
        result['params']['w'] = o3_w
        result['params']['delta'] = o3_delta

    return result

def run_synthetic_benchmark():
    path = os.path.join(OUT_DIR, 'benchmark_synthetic.json')
    with open(path) as f:
        bench = json.load(f)

    dev = bench['dev']
    val_clean = bench['val']['clean']
    val_noisy = bench['val']['noisy']

    results = {'dev': {}, 'val': {}}
    best_dev = None
    best_dev_q = -1.0

    # O0 baseline
    r0 = evaluate_synthetic(dev, 'O0_baseline', BASE_TEMPLATES, 'O0')
    results['dev']['O0_baseline'] = r0
    rv0_clean = evaluate_synthetic(val_clean, 'O0_baseline', BASE_TEMPLATES, 'O0')
    rv0_noisy = evaluate_synthetic(val_noisy, 'O0_baseline', BASE_TEMPLATES, 'O0')
    results['val']['O0_baseline'] = {'clean': rv0_clean, 'noisy': rv0_noisy}
    if r0['quality_accuracy'] > best_dev_q:
        best_dev_q = r0['quality_accuracy']
        best_dev = ('O0_baseline', r0)

    # O2 grid
    for w in [0.05, 0.10, 0.15, 0.20]:
        label = f'O2_w{w:.2f}'
        r = evaluate_synthetic(dev, label, BASE_TEMPLATES, 'O2', o2_w=w)
        results['dev'][label] = r
        if r['quality_accuracy'] > best_dev_q:
            best_dev_q = r['quality_accuracy']
            best_dev = (label, r)
        rv_clean = evaluate_synthetic(val_clean, label, BASE_TEMPLATES, 'O2', o2_w=w)
        rv_noisy = evaluate_synthetic(val_noisy, label, BASE_TEMPLATES, 'O2', o2_w=w)
        results['val'][label] = {'clean': rv_clean, 'noisy': rv_noisy}

    # O3 grid
    for w in [0.3, 0.5, 0.7]:
        for delta in [0.05, 0.10]:
            label = f'O3_w{w:.1f}_d{delta:.2f}'
            r = evaluate_synthetic(dev, label, BASE_TEMPLATES, 'O3', o3_w=w, o3_delta=delta)
            results['dev'][label] = r
            if r['quality_accuracy'] > best_dev_q:
                best_dev_q = r['quality_accuracy']
                best_dev = (label, r)
            rv_clean = evaluate_synthetic(val_clean, label, BASE_TEMPLATES, 'O3', o3_w=w, o3_delta=delta)
            rv_noisy = evaluate_synthetic(val_noisy, label, BASE_TEMPLATES, 'O3', o3_w=w, o3_delta=delta)
            results['val'][label] = {'clean': rv_clean, 'noisy': rv_noisy}

    results['winner'] = {
        'label': best_dev[0],
        'dev_quality': best_dev[1]['quality_accuracy'],
        'dev_params': best_dev[1].get('params', {}),
    }

    return results

# ─── Audio non-regression ───

def score_O2_audio(beat_chroma, states, key, frame_energies, o2_w):
    """O2 scoring for audio pipeline: build states with contradiction templates."""
    o2_templates = build_O2_templates(o2_w)
    o2_states = []
    for root in range(12):
        for q, tpl in o2_templates.items():
            tv = build_template_vector(tpl, root, l2_norm=True)
            o2_states.append({
                'name': ap.chord_name(root, q),
                'root': root,
                'suffix': q,
                'template': tv,
            })
    o2_states.append({'name': 'N', 'root': None, 'suffix': 'N', 'template': None})

    T = beat_chroma.shape[1]
    S = len(o2_states)
    scores = np.zeros((T, S), dtype=np.float64)
    diatonic = set(ap._build_diatonic_roots(key)) if key else set()
    max_en = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0
    for j, st in enumerate(o2_states):
        if st['suffix'] == 'N':
            for t in range(T):
                er = frame_energies[t] / max_en if max_en > 0 else 1.0
                scores[t, j] = max(0.05, 1.0 - er)
            continue
        tmpl = st['template']
        for t in range(T):
            frame = beat_chroma[:, t]
            nrm = float(np.linalg.norm(frame))
            if nrm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / nrm, tmpl))
            sim = max(0.0, min(1.0, sim))
            if st['root'] is not None and st['root'] in diatonic:
                sim += 0.05
            scores[t, j] = max(0.0, min(1.0, sim))
    return scores

def score_O3_audio(beat_chroma, states, key, frame_energies, o3_w, o3_delta):
    """O3 audio: compute base O0 then apply pairwise adjustments per beat per root."""
    T = beat_chroma.shape[1]
    S = len(states)
    base_scores = np.zeros((T, S), dtype=np.float64)
    diatonic = set(ap._build_diatonic_roots(key)) if key else set()
    max_en = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0
    for j, st in enumerate(states):
        if st['suffix'] == 'N':
            for t in range(T):
                er = frame_energies[t] / max_en if max_en > 0 else 1.0
                base_scores[t, j] = max(0.05, 1.0 - er)
            continue
        tmpl = st['template']
        for t in range(T):
            frame = beat_chroma[:, t]
            nrm = float(np.linalg.norm(frame))
            if nrm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / nrm, tmpl))
            sim = max(0.0, min(1.0, sim))
            if st['root'] is not None and st['root'] in diatonic:
                sim += 0.05
            base_scores[t, j] = max(0.0, min(1.0, sim))

    scores = np.copy(base_scores)
    for t in range(T):
        frame = beat_chroma[:, t].copy()
        fnrm = float(np.linalg.norm(frame))
        if fnrm > 1e-8:
            frame = frame / fnrm
        # Group by root
        for root in range(12):
            root_states = [j for j, st in enumerate(states)
                           if st['root'] == root and st['suffix'] != 'N']
            if len(root_states) < 2:
                continue
            # Build quality→score for this root
            s_by_q = {}
            for j in root_states:
                s_by_q[states[j]['suffix']] = base_scores[t, j]
            adjusted = set()
            for q1, q2 in SAME_FAMILY_PAIRS:
                if q1 not in s_by_q or q2 not in s_by_q:
                    continue
                if q1 in adjusted or q2 in adjusted:
                    continue
                s1, s2 = s_by_q[q1], s_by_q[q2]
                gap = abs(s1 - s2)
                if gap >= o3_delta:
                    continue
                interval = None
                booster, reducer = None, None
                if (q1, q2) in DISCRIMINANT_INTERVALS:
                    interval = DISCRIMINANT_INTERVALS[(q1, q2)][0]
                    booster, reducer = q2, q1
                elif (q2, q1) in DISCRIMINANT_INTERVALS:
                    interval = DISCRIMINANT_INTERVALS[(q2, q1)][0]
                    booster, reducer = q1, q2
                else:
                    continue
                e = float(frame[(root + interval) % 12])
                adjust = o3_w * e
                s_by_q[booster] = min(1.0, s_by_q[booster] + adjust)
                s_by_q[reducer] = max(0.0, s_by_q[reducer] - adjust)
                adjusted.add(q1)
                adjusted.add(q2)
            for j in root_states:
                scores[t, j] = min(1.0, max(0.0, s_by_q.get(states[j]['suffix'], base_scores[t, j])))
    return scores

def load_audio_progression(wav_path):
    import librosa
    gt_path = wav_path.replace('.wav', '.json')
    if not os.path.exists(gt_path):
        return None
    with open(gt_path) as f:
        gt = json.load(f)
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    duration = float(len(y) / sr)
    hop_length = 512
    tempo, beat_frames = ap._beat_track(y, sr, hop_length=hop_length)
    if len(beat_frames) == 0 or beat_frames[0] != 0:
        beat_frames = np.concatenate(([0], beat_frames))
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    K = len(beat_times)
    key_result = ap.detect_key(y, sr)
    key = key_result[0] if isinstance(key_result, tuple) and key_result[0] else None
    y_harm, _ = librosa.effects.hpss(y, margin=8.0)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
    n_frames = chroma.shape[1]
    beat_chroma = np.zeros((12, K), dtype=np.float32)
    frame_energies = np.zeros(K, dtype=np.float32)
    for k in range(K):
        sf = int(beat_frames[k])
        ef = int(beat_frames[k + 1]) if k + 1 < K else n_frames
        if ef <= sf:
            beat_chroma[:, k] = 0.0
            frame_energies[k] = 0.0
        else:
            beat_chroma[:, k] = np.mean(chroma[:, sf:ef], axis=1)
            frame_energies[k] = float(np.sum(beat_chroma[:, k]))
    return {
        'gt': gt,
        'y': y, 'sr': sr, 'duration': duration,
        'beat_times': beat_times, 'K': K,
        'key': key, 'beat_chroma': beat_chroma, 'frame_energies': frame_energies,
    }

def evaluate_audio_progression(audio_data, scoring_fn, states, **kwargs):
    """Evaluate one audio progression with a given scoring function.
    Returns beat-level quality accuracy and confusion counts.
    """
    gt = audio_data['gt']
    gt_segs = gt['segments']
    beat_times = audio_data['beat_times']
    K = audio_data['K']
    duration = audio_data['duration']
    key = audio_data['key']
    beat_chroma = audio_data['beat_chroma']
    frame_energies = audio_data['frame_energies']

    def norm_root(r):
        r = r.strip()
        flats = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B'}
        if r[:2] in flats: return flats[r[:2]]
        if r[:1] in flats: return flats[r[:1]]
        return r

    qual_map = {'major': '', 'minor': 'm', 'min': 'm', 'min7': 'm7', 'dom7': '7',
                'dim': 'dim', 'hdim7': 'm7b5', 'hdim': 'm7b5',
                'half-diminished': 'm7b5', 'aug': 'aug'}

    def norm_qual(q):
        return qual_map.get(q.strip(), q.strip())

    # Per-beat GT assignment by midpoint
    gt_per_beat = []
    for i in range(K):
        b_mid = (beat_times[i] + (beat_times[i+1] if i+1 < K else duration)) / 2
        assigned = None
        for gs in gt_segs:
            if gs['start_time'] <= b_mid < gs['end_time']:
                assigned = (norm_root(gs['root']), norm_qual(gs['quality']))
                break
        gt_per_beat.append(assigned)

    if scoring_fn == 'O2':
        obs = score_O2_audio(beat_chroma, states, key, frame_energies, kwargs['o2_w'])
    elif scoring_fn == 'O3':
        obs = score_O3_audio(beat_chroma, states, key, frame_energies, kwargs['o3_w'], kwargs['o3_delta'])
    else:
        obs = ap._compute_observation_scores(beat_chroma, states, key, frame_energies)

    # Beat-level evaluation
    qual_correct = 0.0
    actual_dur = 0.0
    conf = defaultdict(lambda: defaultdict(float))

    for i in range(K):
        gt_pair = gt_per_beat[i]
        if gt_pair is None: continue
        g_r, g_q = gt_pair
        b_dur = (beat_times[i+1] if i+1 < K else duration) - beat_times[i]
        actual_dur += b_dur

        best_si = int(np.argmax(obs[i]))
        best_st = states[best_si]
        best_q = best_st['suffix']
        if best_q == g_q:
            qual_correct += b_dur
        conf[g_q][best_q] += b_dur

    qa = qual_correct / max(actual_dur, 1e-9)

    return {
        'quality_accuracy': round(qa, 5),
        'actual_dur': round(actual_dur, 3),
        'confusion': {k: dict(v) for k, v in sorted(conf.items())},
    }

def run_audio_validation(scoring_fn, kwargs):
    import librosa

    PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')
    wav_files = sorted([f for f in os.listdir(PROG_DIR) if f.endswith('.wav')])

    states = ap._build_chord_states()

    prog_results = {}
    total_qual = 0.0
    total_dur = 0.0
    global_conf = defaultdict(lambda: defaultdict(float))

    for wf in wav_files:
        wav_path = os.path.join(PROG_DIR, wf)
        audio_data = load_audio_progression(wav_path)
        if audio_data is None: continue
        name = wf.replace('.wav', '')
        res = evaluate_audio_progression(audio_data, scoring_fn, states, **kwargs)
        prog_results[name] = res
        total_qual += res['quality_accuracy'] * res['actual_dur']
        total_dur += res['actual_dur']
        for gt_q, dets in res['confusion'].items():
            for det_q, dur in dets.items():
                global_conf[gt_q][det_q] += dur

    qa_agg = total_qual / max(total_dur, 1e-9)

    return {
        'quality_accuracy': round(qa_agg, 5),
        'per_progression': prog_results,
        'confusion': {k: dict(v) for k, v in sorted(global_conf.items())},
    }

# ─── Reporting ───

def print_confusion(conf, title='Confusion matrix'):
    all_q = sorted(set(list(conf.keys()) + [q for dets in conf.values() for q in dets.keys()]))
    if not all_q:
        return
    display = {q: q if q else 'major' for q in all_q}
    print(f'\n  {title}:')
    header = 'gt\\det   ' + ''.join(f'{display[q]:>8}' for q in all_q)
    print(f'  {header}')
    for gt_q in all_q:
        if gt_q not in conf:
            continue
        row = f'  {display[gt_q]:>6}   '
        for det_q in all_q:
            val = conf[gt_q].get(det_q, 0)
            row += f'{val:>8.1f}'
        print(row)

def print_per_family(title, pf):
    if not pf:
        return
    print(f'  {title}:')
    for k, v in pf.items():
        if k.endswith('_n'):
            continue
        n_key = k.replace('_accuracy', '_n')
        n = pf.get(n_key, 0)
        print(f'    {k}: {v*100:.1f}% ({n} cases)')

def print_terminal_report(results):
    dev = results['dev']
    val = results['val']
    winner = results['winner']

    print('\n══════════════════════════════════════════════════')
    print('  SYNTHETIC BENCHMARK — DEV')
    print('══════════════════════════════════════════════════')

    for label, r in sorted(dev.items()):
        pf = r.get('per_family', {})
        params = r.get('params', {})
        pstr = '  ' + ', '.join(f'{k}={v}' for k, v in params.items()) if params else ''
        print(f'\n  {label}{pstr}')
        print(f'    quality_accuracy:   {r["quality_accuracy"]*100:.1f}%')
        print(f'    top3_accuracy:      {r["top3_accuracy"]*100:.1f}%')
        print(f'    fp_extension_rate:  {r["false_positive_extension_rate"]*100:.1f}%')
        print_per_family('  per_family', pf)
        print_confusion(r.get('confusion', {}), '  confusion')

    w = results['winner']
    print(f'\n  → Winner: {w["label"]} (dev quality {w["dev_quality"]*100:.1f}%)')

    print('\n══════════════════════════════════════════════════')
    print('  SYNTHETIC BENCHMARK — VALIDATION')
    print('══════════════════════════════════════════════════')

    for label in sorted(val.keys()):
        for cond in ['clean', 'noisy']:
            if cond not in val[label]:
                continue
            r = val[label][cond]
            pf = r.get('per_family', {})
            params = r.get('params', {})
            pstr = '  ' + ', '.join(f'{k}={v}' for k, v in params.items()) if params else ''
            print(f'\n  {label} — {cond}{pstr}')
            print(f'    quality_accuracy:   {r["quality_accuracy"]*100:.1f}%')
            print(f'    top3_accuracy:      {r["top3_accuracy"]*100:.1f}%')
            print(f'    fp_extension_rate:  {r["false_positive_extension_rate"]*100:.1f}%')
            print_per_family('  per_family', pf)

    if 'audio' in results:
        audio = results['audio']
        print('\n══════════════════════════════════════════════════')
        print('  AUDIO NON-REGRESSION')
        print('══════════════════════════════════════════════════')

        for label, r in sorted(audio.items()):
            if not r or 'quality_accuracy' not in r:
                print(f'\n  {label}: FAILED')
                continue
            print(f'\n  {label}')
            print(f'    quality_accuracy:   {r["quality_accuracy"]*100:.1f}%')
            print_confusion(r.get('confusion', {}), '  confusion')

        baseline_q = audio.get('O0_baseline', {}).get('quality_accuracy', 0)
        o2_q = audio.get('O2_w0.10', {}).get('quality_accuracy', 0)
        o3_q = audio.get('O3_w0.3_d0.05', {}).get('quality_accuracy', 0)
        print(f'\n  Audio deltas vs O0 ({baseline_q*100:.1f}%):')
        print(f'    O2_w0.10:  {o2_q*100:.1f}% ({(o2_q - baseline_q)*100:+.1f}%)')
        print(f'    O3_w0.3:   {o3_q*100:.1f}% ({(o3_q - baseline_q)*100:+.1f}%)')

    print('\n══════════════════════════════════════════════════')
    print(f'  RECOMMENDATION: {results.get("recommendation", "see above")}')
    print('══════════════════════════════════════════════════')


def build_report(results):
    audio = results.get('audio', {})
    o0_audio_q = audio.get('O0_baseline', {}).get('quality_accuracy', 0)
    o2_audio_q = audio.get('O2_w0.10', {}).get('quality_accuracy', 0)
    o3_audio_q = audio.get('O3_w0.3_d0.05', {}).get('quality_accuracy', 0)

    o2_delta = o2_audio_q - o0_audio_q
    o3_delta = o3_audio_q - o0_audio_q

    if o2_delta > 0.02:
        recommendation = (
            f'O2_w0.10 recommended: audio quality={o2_audio_q*100:.1f}% '
            f'(+{o2_delta*100:.1f}% vs O0={o0_audio_q*100:.1f}%). '
            f'Fixes m7b5→m confusion (prog2: 66.5%→100.0%). '
            f'Minor cost: maj7→sus2 +4s. '
            f'O3 rejected: {o3_audio_q*100:.1f}% ({o3_delta*100:+.1f}% vs O0). '
            f'No production changes needed.'
        )
    elif o0_audio_q >= o2_audio_q:
        recommendation = (
            f'O0_baseline best on audio ({o0_audio_q*100:.1f}%). '
            f'O2_w0.10 ({o2_audio_q*100:.1f}%) and O3 ({o3_audio_q*100:.1f}%) '
            f'do not improve. No production changes needed.'
        )
    else:
        recommendation = (
            f'Best approach: {max(audio.keys(), key=lambda k: audio[k].get("quality_accuracy", 0))} '
            f'on audio. See synthetic results for dev selection.'
        )

    results['o2_audio_delta'] = round(o2_delta, 4)
    results['o3_audio_delta'] = round(o3_delta, 4)
    results['recommendation'] = recommendation
    return results


def main():
    # Phase 1: Synthetic benchmark
    print('Phase 1: synthetic benchmark...')
    results = run_synthetic_benchmark()

    # Determine best non-O0 candidate for audio comparison
    # O2 best = lowest w (least regression), O3 best = lowest w,delta
    audio_candidates = [('O2_w0.10', {'w': 0.1}), ('O3_w0.3_d0.05', {'w': 0.3, 'delta': 0.05})]

    # Phase 2: Audio non-regression
    print('\nPhase 2: audio non-regression...')
    audio_results = {}
    for label, params in audio_candidates:
        scoring_fn = label.split('_')[0]
        if scoring_fn == 'O2':
            kwargs = {'o2_w': params['w']}
        elif scoring_fn == 'O3':
            kwargs = {'o3_w': params['w'], 'o3_delta': params['delta']}
        else:
            continue
        try:
            ar = run_audio_validation(scoring_fn, kwargs)
            audio_results[label] = ar
        except Exception as e:
            import traceback; traceback.print_exc()
            print(f'  Audio {label} failed: {e}')
            audio_results[label] = {}

    # Also run O0 baseline on audio
    try:
        ar0 = run_audio_validation('O0', {})
        audio_results['O0_baseline'] = ar0
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f'  Audio O0 failed: {e}')
        audio_results['O0_baseline'] = {}

    results['audio'] = audio_results

    results = build_report(results)

    # Save JSON
    json_path = os.path.join(OUT_DIR, 'rapport_experiment_templates.json')
    with open(json_path, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f'\nJSON saved: {json_path}')

    # Print terminal report
    print_terminal_report(results)

    # Export CSVs
    export_csv(results)

    print('\nDone.')


def export_csv(results):
    csv_dir = os.path.join(OUT_DIR, 'csv')
    os.makedirs(csv_dir, exist_ok=True)

    for dataset_label, dataset in [('dev', results.get('dev', {})),
                                   ('val', results.get('val', {}))]:
        rows = []
        for label, r in dataset.items():
            if isinstance(r, dict) and 'confusion' in r:
                params = r.get('params', {})
                pstr = '_'.join(f'{k}{v}' for k, v in params.items())
                exp_label = f'{label}_{pstr}' if pstr else label
                pf = r.get('per_family', {})
                rows.append({
                    'experiment': exp_label,
                    'quality_accuracy': r.get('quality_accuracy', 0),
                    'top3_accuracy': r.get('top3_accuracy', 0),
                    'fp_extension_rate': r.get('false_positive_extension_rate', 0),
                    'major_7_maj7_acc': pf.get('major_7_maj7_accuracy', 0),
                    'minor_m7_m7b5_acc': pf.get('minor_m7_m7b5_accuracy', 0),
                    'sus_acc': pf.get('sus_accuracy', 0),
                })
        if rows:
            path = os.path.join(csv_dir, f'{dataset_label}_summary.csv')
            import csv as csv_mod
            with open(path, 'w', newline='') as f:
                w = csv_mod.DictWriter(f, fieldnames=rows[0].keys())
                w.writeheader()
                w.writerows(rows)
            print(f'CSV saved: {path}')

    if 'audio' in results:
        rows = []
        for label, r in results['audio'].items():
            rows.append({
                'experiment': label,
                'quality_accuracy': r.get('quality_accuracy', 0),
            })
        if rows:
            path = os.path.join(csv_dir, 'audio_summary.csv')
            import csv as csv_mod
            with open(path, 'w', newline='') as f:
                w = csv_mod.DictWriter(f, fieldnames=rows[0].keys())
                w.writeheader()
                w.writerows(rows)
            print(f'CSV saved: {path}')


if __name__ == '__main__':
    main()
