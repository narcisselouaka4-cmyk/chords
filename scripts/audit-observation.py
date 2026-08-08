#!/usr/bin/env python3
"""Audit observation — templates, variantes O0-O4, Viterbi.
Read-only: ne modifie aucun fichier de production.
"""
import json, os, sys, re
from collections import defaultdict
import importlib.util
import numpy as np
import librosa

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

spec = importlib.util.spec_from_file_location(
    "audio_processor", os.path.join(PROJECT, 'electron', 'audio-processor.py')
)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

_beat_track = ap._beat_track
detect_key = ap.detect_key
_build_chord_states = ap._build_chord_states
_initial_scores = ap._initial_scores
_build_transition_matrix = ap._build_transition_matrix
_viterbi = ap._viterbi
segm_path = ap._segment_path
NOTE_NAMES = ap.NOTE_NAMES
CHORD_TEMPLATES_WEIGHTED = ap.CHORD_TEMPLATES_WEIGHTED
CHORD_INTERVALS = ap.CHORD_INTERVALS

# ─── Parsing helpers ───
NOTE_SHARP = set('C D E F G A'.split())
NOTE_SHARP_2 = {'C#', 'D#', 'F#', 'G#', 'A#'}
FLAT_TO_SHARP = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
}

def norm_root(r):
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

def norm_qual(q):
    return QUALITY_MAP.get(q.strip(), q.strip())

def parse_chord(chord_str):
    if chord_str == 'N' or not chord_str: return None, None
    m = re.match(r'^([A-G][#b]?)(.*)', chord_str)
    if not m: return None, None
    r = m.group(1); s = m.group(2).strip()
    if s and s[0] in ('#', 'b'): r += s[0]; s = s[1:].strip()
    return norm_root(r), norm_qual(s)

def overlap(a_s, a_e, b_s, b_e):
    return max(0.0, min(a_e, b_e) - max(a_s, b_s))

# ─── Template building helpers ───
def build_template_vector(tpl, root=0):
    """Build 12-bin chroma vector from (interval, weight) tuples, then L2-normalize."""
    v = np.zeros(12, dtype=np.float32)
    for pc, w in tpl:
        v[(root + pc) % 12] = w
    norm = float(np.linalg.norm(v))
    if norm > 0: v = v / norm
    return v

def build_template_raw(tpl, root=0):
    """Build 12-bin chroma WITHOUT L2 normalization."""
    v = np.zeros(12, dtype=np.float32)
    for pc, w in tpl:
        v[(root + pc) % 12] = w
    return v

def build_states_from_templates(templates_dict):
    """Build state list from a custom templates dict (same format as CHORD_TEMPLATES_WEIGHTED)."""
    states = []
    for root in range(12):
        for suffix, tpl in templates_dict.items():
            template = build_template_vector(tpl, root)
            states.append({
                'name': ap.chord_name(root, suffix),
                'root': root,
                'suffix': suffix,
                'template': template,
            })
    states.append({'name': 'N', 'root': None, 'suffix': 'N', 'template': None})
    return states

def build_intervals_set(tpl):
    """Return set of pitch-class intervals for a template."""
    return {pc for pc, w in tpl}

# ─── Scoring functions (O0–O4) ───

def score_O0(beat_chroma, states, key, frame_energies):
    """Baseline: exact copy of _compute_observation_scores."""
    T = beat_chroma.shape[1]
    S = len(states)
    scores = np.zeros((T, S), dtype=np.float64)
    diatonic = ap._build_diatonic_roots(key) if key else set()
    max_en = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0
    for j, st in enumerate(states):
        if st['suffix'] == 'N':
            for t in range(T):
                er = frame_energies[t] / max_en if max_en > 0 else 1.0
                scores[t, j] = max(0.05, 1.0 - er)
            continue
        tmpl = st['template']
        for t in range(T):
            frame = beat_chroma[:, t]
            nrm = np.linalg.norm(frame)
            if nrm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / nrm, tmpl))
            sim = max(0.0, min(1.0, sim))
            if st['root'] is not None and st['root'] in diatonic:
                sim += 0.05
            scores[t, j] = max(0.0, min(1.0, sim))
    return scores

def score_O1(beat_chroma, states, key, frame_energies):
    """No L2 normalization on template. Frame still normalized for scale stability.
    Uses raw (non-L2-normalized) templates so templates with more notes get higher scores."""
    T = beat_chroma.shape[1]
    S = len(states)
    scores = np.zeros((T, S), dtype=np.float64)
    max_en = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0

    raw_templates = []
    for st in states:
        if st['suffix'] == 'N':
            raw_templates.append(None)
            continue
        tpl = CHORD_TEMPLATES_WEIGHTED.get(st['suffix'], [])
        vec = build_template_raw(tpl, st['root'])
        raw_templates.append(vec)

    for j, st in enumerate(states):
        if st['suffix'] == 'N':
            for t in range(T):
                er = frame_energies[t] / max_en if max_en > 0 else 1.0
                scores[t, j] = max(0.05, 1.0 - er)
            continue
        tmpl = raw_templates[j]
        for t in range(T):
            frame = beat_chroma[:, t]
            nrm = np.linalg.norm(frame)
            if nrm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / nrm, tmpl))
            sim = max(0.0, min(5.0, sim))
            scores[t, j] = sim
    return scores

# O2 templates: reinforced distinctive intervals
TEMPLATES_O2 = {
    '':  [(0, 1.0), (4, 0.8),  (7, 0.6)],
    'm': [(0, 1.0), (3, 0.85), (7, 0.8)],   # 5th reinforced to help m vs m7b5
    '7': [(0, 1.0), (4, 1.1),  (7, 0.55), (10, 0.4)],   # tierce M3 0.75→1.1
    'maj7': [(0, 1.0), (4, 0.85), (7, 0.65), (11, 1.3)], # M7 0.9→1.3
    'sus2': [(0, 1.0), (2, 0.75), (7, 0.55)],
    'sus4': [(0, 1.0), (5, 0.75), (7, 0.55)],
    'm7': [(0, 1.0), (3, 1.2),  (7, 0.65), (10, 0.85)],  # m3 0.85→1.2
    'dim': [(0, 1.0), (3, 0.9),  (6, 0.9)],
    'm7b5': [(0, 1.0), (3, 0.85), (6, 1.2), (10, 0.85)], # b5 0.9→1.2
    'aug': [(0, 1.0), (4, 0.85), (8, 0.9)],
}

def score_O2(beat_chroma, states, key, frame_energies):
    """Reinforced distinctive intervals. Uses TEMPLATES_O2, still L2-normalized."""
    o2_states = build_states_from_templates(TEMPLATES_O2)
    # Now score with O2 states
    T = beat_chroma.shape[1]
    S = len(o2_states)
    scores = np.zeros((T, S), dtype=np.float64)
    diatonic = ap._build_diatonic_roots(key) if key else set()
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
            nrm = np.linalg.norm(frame)
            if nrm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / nrm, tmpl))
            sim = max(0.0, min(1.0, sim))
            if st['root'] is not None and st['root'] in diatonic:
                sim += 0.05
            scores[t, j] = max(0.0, min(1.0, sim))
    return scores, o2_states

def score_O3(beat_chroma, states, key, frame_energies, alpha=0.2):
    """Baseline + penalty for foreign pitch-classes."""
    T = beat_chroma.shape[1]
    S = len(states)
    scores = np.zeros((T, S), dtype=np.float64)
    trace = defaultdict(list)  # score, penalty for each (t, state)
    diatonic = ap._build_diatonic_roots(key) if key else set()
    max_en = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0

    # Pre-compute interval sets per state
    intervals_per_state = []
    for st in states:
        if st['suffix'] == 'N':
            intervals_per_state.append(set())
        else:
            tpl = CHORD_TEMPLATES_WEIGHTED.get(st['suffix'], [])
            intervals_per_state.append(build_intervals_set(tpl))

    for j, st in enumerate(states):
        if st['suffix'] == 'N':
            for t in range(T):
                er = frame_energies[t] / max_en if max_en > 0 else 1.0
                scores[t, j] = max(0.05, 1.0 - er)
            continue
        tmpl = st['template']
        ivs = intervals_per_state[j]
        for t in range(T):
            frame = beat_chroma[:, t]
            nrm = np.linalg.norm(frame)
            if nrm < 1e-6:
                sim = 0.0
            else:
                fn = frame / nrm
                sim = float(np.dot(fn, tmpl))
                foreign = sum(fn[pc] for pc in range(12) if pc not in ivs)
                sim = sim - alpha * foreign
            sim = max(0.0, min(1.0, sim))
            if st['root'] is not None and st['root'] in diatonic:
                sim += 0.05
            scores[t, j] = max(0.0, min(1.0, sim))
    return scores

# ─── Part 1: Template analysis ───

def analyze_templates():
    results = {
        'norms': {},
        'n_notes': {},
        'pairwise_similarity': {},
        'theoretical_scores': {},
    }
    # Norms and notes
    for suffix, tpl in CHORD_TEMPLATES_WEIGHTED.items():
        vec = build_template_vector(tpl, root=0)
        norms_l2 = float(np.linalg.norm(build_template_raw(tpl)))
        results['norms'][suffix] = {
            'L2_norm_raw': round(norms_l2, 4),
            'n_notes': len(tpl),
            'intervals': [pc for pc, w in tpl],
            'weights': [w for pc, w in tpl],
            'template_vector_C': [round(float(v), 4) for v in vec],
        }

    # Pairwise similarity between templates of same root
    suffixes = list(CHORD_TEMPLATES_WEIGHTED.keys())
    for i, s1 in enumerate(suffixes):
        for s2 in suffixes[i+1:]:
            v1 = build_template_vector(CHORD_TEMPLATES_WEIGHTED[s1], root=0)
            v2 = build_template_vector(CHORD_TEMPLATES_WEIGHTED[s2], root=0)
            cos = float(np.dot(v1, v2))
            common = set(a for a, w in CHORD_TEMPLATES_WEIGHTED[s1]) & set(a for a, w in CHORD_TEMPLATES_WEIGHTED[s2])
            results['pairwise_similarity'][f'{s1}_vs_{s2}'] = {
                'cosine_similarity': round(cos, 4),
                'common_intervals': sorted(common),
            }

    # Theoretical scores: perfect chroma of each chord scored against all templates
    for suffix, tpl in CHORD_TEMPLATES_WEIGHTED.items():
        perfect_chroma = build_template_vector(tpl, root=0)
        scores_vs_all = {}
        for other_sfx, other_tpl in CHORD_TEMPLATES_WEIGHTED.items():
            other_vec = build_template_vector(other_tpl, root=0)
            th_score = float(np.dot(perfect_chroma, other_vec))
            scores_vs_all[other_sfx] = round(th_score, 4)
        results['theoretical_scores'][suffix] = scores_vs_all

    return results

# ─── Part 2-3: Per-experiment evaluation ───

def eval_experiment(name, gt_data, beat_chroma, states, key, frame_energies, dur_total, scoring_fn, extra_states=None):
    """Evaluate an observation experiment on one progression.
    Returns metrics dict + per-segment top-5 data.
    """
    if extra_states is not None:
        use_states = extra_states
    else:
        use_states = states
    obs = scoring_fn(beat_chroma, use_states, key, frame_energies)

    gt_segs = gt_data['segments']
    K = obs.shape[0]

    # GT per beat
    gt_beats = []
    for i in range(K):
        b_s = 0.0  # dummy, we'll use GT segment times
        best = None
        for gs in gt_segs:
            mid = (gs['start_time'] + gs['end_time']) / 2.0
            # We don't have beat_times here, but GT segment-based approach works
        # Actually, let's do segment-level analysis
        pass

    # Segment-level analysis: for each GT segment, mean chroma across beats
    # We'll compute per-segment top-5 from the mean obs scores of its beats
    per_segment = []
    total_qual_correct = 0.0
    total_root_correct = 0.0
    confusion = defaultdict(lambda: defaultdict(float))
    n_correct_top1 = 0
    n_correct_top3 = 0
    total_beats = 0
    cumulative_rank = 0.0
    cumulative_gap = 0.0

    for gs in gt_segs:
        gt_r = norm_root(gs['root'])
        gt_q = norm_qual(gs['quality'])
        gs_s = gs['start_time']
        gs_e = gs['end_time']

        # Find which beats fall in this GT segment
        # We don't have beat_times in this function, so we use the OBSOLETE approach
        # Actually, for synthetic progressions we know beats are every ~0.5s (120bpm)
        # But we need precise beat timing. Let's pass beat_times.
        pass

    # We'll redo this in the caller with beat_times available
    return None

# ─── Main evaluation with full pipeline ───

def evaluate_on_all():
    """Orchestrate everything."""
    wav_files = sorted(f for f in os.listdir(PROG_DIR) if f.endswith('.wav'))

    # ─── Part 1: Template analysis ───
    print('=== Part 1: Template analysis ===')
    tpl_results = analyze_templates()
    tpl_path = os.path.join(OUT_DIR, 'audit_templates.json')
    with open(tpl_path, 'w') as f:
        json.dump(tpl_results, f, indent=2)
    print(f'  Saved: {tpl_path}')

    # Print norms
    print(f'\n  Template norms (C root):')
    for sfx, info in sorted(tpl_results['norms'].items()):
        label = sfx if sfx else 'major'
        print(f'    {label:>6}: L2_raw={info["L2_norm_raw"]:.3f}  n_notes={info["n_notes"]}  intervals={info["intervals"]}')

    # Print pairwise similarities (only confusable pairs)
    print(f'\n  Pairwise similarities (relevant pairs):')
    key_pairs = ['m7_vs_7', 'maj7_vs_', '_vs_maj7', 'm7b5_vs_m', 'm_vs_m7b5',
                 'm7b5_vs_7', 'sus2_vs_sus4', 'maj7_vs_7', '_vs_7']
    for pname, info in sorted(tpl_results['pairwise_similarity'].items()):
        if any(k in pname for k in key_pairs):
            print(f'    {pname:>20}: cos_sim={info["cosine_similarity"]:.4f}  common={info["common_intervals"]}')

    # Print theoretical scores
    print(f'\n  Theoretical scores (perfect C chord vs all templates):')
    for sfx, scores in sorted(tpl_results['theoretical_scores'].items()):
        label = sfx if sfx else 'major'
        worst_confusion = sorted(scores.items(), key=lambda x: -x[1])[1]  # second best
        print(f'    {label:>8}: self={scores[sfx]:.4f}  best_wrong={worst_confusion[0]}={worst_confusion[1]:.4f}')

    # ─── Parts 2-3: Per-experiment ───
    print(f'\n=== Parts 2-3: Observation experiments ===')

    EXPERIMENTS = [
        ('O0_baseline', score_O0, None, False),
        ('O1_noL2', score_O1, None, True),
        ('O2_reinforced', lambda bc, st, key, fe: score_O2(bc, st, key, fe)[0],
         lambda: build_states_from_templates(TEMPLATES_O2), False),
        ('O3_penalty', score_O3, None, False),
    ]

    all_exp_results = {}

    for wf in wav_files:
        wav_path = os.path.join(PROG_DIR, wf)
        gt_path = wav_path.replace('.wav', '.json')
        if not os.path.exists(gt_path): continue
        name = wf.replace('.wav', '')
        with open(gt_path) as f: gt = json.load(f)
        gt_segs = gt['segments']
        dur_total = gt['chord_duration'] * len(gt['progression']) * gt['repeats']
        progress = gt['progression']

        print(f'\n--- {name} ---')

        y, sr = librosa.load(wav_path, sr=22050, mono=True)
        duration = float(len(y) / sr)
        hop_length = 512

        tempo, beat_frames = _beat_track(y, sr, hop_length=hop_length)
        beat_frames = np.atleast_1d(beat_frames)
        if len(beat_frames) == 0 or beat_frames[0] != 0:
            beat_frames = np.concatenate(([0], beat_frames))
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
        K = len(beat_times)

        key, _ = detect_key(y, sr)

        y_harm, _ = librosa.effects.hpss(y, margin=8.0)
        chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
        n_frames = chroma.shape[1]

        beat_chroma = np.zeros((12, K), dtype=np.float32)
        frame_energies = np.zeros(K, dtype=np.float32)
        for k in range(K):
            sf = int(beat_frames[k])
            ef = int(beat_frames[k + 1]) if k + 1 < K else n_frames
            if ef <= sf:
                beat_chroma[:, k] = 0.0; frame_energies[k] = 0.0
            else:
                beat_chroma[:, k] = np.mean(chroma[:, sf:ef], axis=1)
                frame_energies[k] = float(np.sum(beat_chroma[:, k]))

        states = _build_chord_states()

        for exp_name, scoring_fn, state_builder_fn, _ in EXPERIMENTS:
            if state_builder_fn:
                use_states = state_builder_fn()
            else:
                use_states = states

            obs = scoring_fn(beat_chroma, use_states, key, frame_energies)
            if isinstance(obs, tuple):
                obs = obs[0]

            # ── Beat-level evaluation (matches diagnostic-pipeline.py) ──
            gt_per_beat = []
            for i in range(K):
                b_mid = (beat_times[i] + (beat_times[i+1] if i+1 < K else duration)) / 2
                assigned = None
                for gs in gt_segs:
                    if gs['start_time'] <= b_mid < gs['end_time']:
                        assigned = (norm_root(gs['root']), norm_qual(gs['quality']))
                        break
                gt_per_beat.append(assigned)

            qual_correct = 0.0
            root_correct = 0.0
            full_correct = 0.0
            conf = defaultdict(lambda: defaultdict(float))
            fp_ext = defaultdict(float)

            # Each beat counted exactly once via midpoint assignment
            for i in range(K):
                gt_pair = gt_per_beat[i]
                if gt_pair is None: continue
                g_r, g_q = gt_pair
                b_s = beat_times[i]
                b_e = beat_times[i+1] if i+1 < K else duration
                b_dur = b_e - b_s

                best_si = int(np.argmax(obs[i]))
                best_st = use_states[best_si]
                best_r = norm_root(NOTE_NAMES[best_st['root']] if best_st['root'] is not None else '?')
                best_q_st = best_st['suffix']

                if best_r == g_r: root_correct += b_dur
                if best_q_st == g_q: qual_correct += b_dur
                if best_r == g_r and best_q_st == g_q: full_correct += b_dur
                conf[g_q][best_q_st] += b_dur

                if best_r == g_r:
                    if best_q_st != g_q and best_q_st in ('maj7', '7', 'm7', 'sus2', 'sus4'):
                        fp_ext['triad_to_extension'] += b_dur
                if g_q == 'sus4' and best_q_st == '':
                    fp_ext['sus_to_major'] += b_dur
                if g_q in ('sus2', 'sus4') and best_q_st in ('7', 'maj7', ''):
                    fp_ext['sus_enriched'] += b_dur
                if g_q == 'm' and best_q_st in ('m7',):
                    fp_ext['m_to_m7'] += b_dur

            # Per-segment top-5 export (use mean obs per GT segment)
            seg_data = []
            cum_rank = 0.0
            cum_gap = 0.0
            n_ranked = 0
            n_top1 = 0
            n_top3 = 0
            n_absent = 0

            for gs in gt_segs:
                gt_r = norm_root(gs['root'])
                gt_q = norm_qual(gs['quality'])
                gs_s = gs['start_time']; gs_e = gs['end_time']

                # Beats whose midpoint falls in this GT segment
                beat_idxs = [i for i in range(K) if gt_per_beat[i] == (gt_r, gt_q)]
                if not beat_idxs:
                    continue

                # Per-segment top-5 (mean obs for export)
                mean_obs = np.mean(obs[beat_idxs], axis=0)
                ranked = np.argsort(mean_obs)[::-1]

                top5 = []
                correct_rank = None
                correct_score = None
                for rank, si in enumerate(ranked):
                    st = use_states[si]
                    if st['suffix'] == 'N': continue
                    sr_name = NOTE_NAMES[st['root']] if st['root'] is not None else '?'
                    sr_norm = norm_root(sr_name)
                    s_score = float(mean_obs[si])

                    if len(top5) < 5:
                        top5.append({
                            'chord': st['name'],
                            'root': sr_norm,
                            'quality': st['suffix'],
                            'score': round(s_score, 4),
                            'rank': rank + 1,
                        })

                    if sr_norm == gt_r and st['suffix'] == gt_q:
                        correct_rank = rank + 1
                        correct_score = s_score
                        break

                # Per-segment rank/gap stats (from mean obs)
                if correct_rank is not None:
                    cum_rank += correct_rank
                    n_ranked += 1
                    if correct_rank == 1: n_top1 += 1
                    if correct_rank <= 3: n_top3 += 1
                    gap = float(mean_obs[ranked[0]]) - correct_score
                    cum_gap += gap
                else:
                    n_absent += 1

                seg_dur_total = sum(
                    (beat_times[i+1] if i+1 < K else duration) - beat_times[i]
                    for i in beat_idxs
                )

                best_si_gs = ranked[0]
                best_st_gs = use_states[best_si_gs]

                seg_data.append({
                    'gt_start': round(gs_s, 2), 'gt_end': round(gs_e, 2),
                    'gt_root': gt_r, 'gt_quality': gt_q,
                    'best_chord': best_st_gs['name'],
                    'best_quality': best_st_gs['suffix'],
                    'correct_rank': correct_rank,
                    'correct_score': round(correct_score, 4) if correct_score is not None else None,
                    'gap': round(float(mean_obs[ranked[0]]) - correct_score, 4) if correct_score is not None else None,
                    'top5': top5,
                    'overlap_dur': round(seg_dur_total, 3),
                })

            n_total = len(seg_data)
            actual_dur = sum(
                (beat_times[i+1] if i+1 < K else duration) - beat_times[i]
                for i in range(K) if gt_per_beat[i] is not None
            )
            qa = qual_correct / max(actual_dur, 1e-9)
            ra = root_correct / max(actual_dur, 1e-9)

            result = {
                'experiment': exp_name,
                'progression': name,
                'dur_total': dur_total,
                'actual_dur': round(actual_dur, 3),
                'quality_accuracy': round(qa, 4),
                'root_accuracy': round(ra, 4),
                'n_segments': n_total,
                'correct_rank1': round(n_top1 / max(n_total, 1) * 100, 1),
                'correct_top3': round(n_top3 / max(n_total, 1) * 100, 1),
                'absent_from_top3': round(n_absent / max(n_total, 1) * 100, 1),
                'mean_rank_of_correct': round(cum_rank / max(n_ranked, 1), 2) if n_ranked else None,
                'mean_gap_to_winner': round(cum_gap / max(n_ranked, 1), 4) if n_ranked else None,
                'confusion': {k: dict(v) for k, v in conf.items()},
                'false_positive_extensions': {k: round(v, 3) for k, v in fp_ext.items()},
                'segments': seg_data,
            }
            all_exp_results.setdefault(exp_name, {})[name] = result

            print(f'  {exp_name:>20}: qual={qa*100:.1f}%  root={ra*100:.1f}%  '
                  f'rank1={result["correct_rank1"]}%  top3={result["correct_top3"]}%  '
                  f'mean_rank={result["mean_rank_of_correct"]}  gap={result["mean_gap_to_winner"]}')

    # Save per-experiment results
    for exp_name, per_prog in all_exp_results.items():
        exp_path = os.path.join(OUT_DIR, f'audit_{exp_name}.json')
        with open(exp_path, 'w') as f:
            json.dump(per_prog, f, indent=2)
        print(f'\n  Saved: {exp_path}')

    # Aggregate across progressions
    print(f'\n{"="*70}')
    print('AGGREGATE BY EXPERIMENT')
    print(f'{"="*70}')
    for exp_name in ['O0_baseline', 'O1_noL2', 'O2_reinforced', 'O3_penalty']:
        if exp_name not in all_exp_results: continue
        total_qual = 0.0; total_root = 0.0; total_dur = 0.0
        total_rank = 0.0; total_gap = 0.0; n_r = 0
        n_top1 = 0; n_top3 = 0; n_abs = 0; n_total = 0
        global_conf = defaultdict(lambda: defaultdict(float))
        fp_ext_agg = defaultdict(float)

        for prog_name, res in all_exp_results[exp_name].items():
            d = res.get('actual_dur', res['dur_total'])
            total_qual += res['quality_accuracy'] * d
            total_root += res['root_accuracy'] * d
            total_dur += d
            if res['mean_rank_of_correct'] is not None:
                total_rank += res['mean_rank_of_correct'] * res['n_segments']
                n_r += res['n_segments']
            if res['mean_gap_to_winner'] is not None:
                total_gap += res['mean_gap_to_winner'] * res['n_segments']
            n_top1 += res['correct_rank1'] / 100 * res['n_segments']
            n_top3 += res['correct_top3'] / 100 * res['n_segments']
            n_abs += res['absent_from_top3'] / 100 * res['n_segments']
            n_total += res['n_segments']
            for gt_q, dets in res['confusion'].items():
                for det_q, dur in dets.items():
                    if gt_q != det_q:
                        global_conf[gt_q][det_q] += dur
            for k, v in res['false_positive_extensions'].items():
                fp_ext_agg[k] += v

        qa_agg = total_qual / max(total_dur, 1e-9)
        ra_agg = total_root / max(total_dur, 1e-9)
        print(f'\n  {exp_name}:')
        print(f'    quality_accuracy: {qa_agg*100:.1f}%')
        print(f'    root_accuracy:    {ra_agg*100:.1f}%')
        print(f'    correct_rank1:    {n_top1/max(n_total,1)*100:.1f}%')
        print(f'    correct_top3:     {n_top3/max(n_total,1)*100:.1f}%')
        print(f'    absent_top3:      {n_abs/max(n_total,1)*100:.1f}%')
        print(f'    mean_rank:        {total_rank/max(n_r,1):.2f}')
        print(f'    mean_gap:         {total_gap/max(n_total,1):.4f}')
        print(f'    confusions (top):')
        for gt_q in sorted(global_conf.keys()):
            for det_q, dur in sorted(global_conf[gt_q].items(), key=lambda x: -x[1])[:3]:
                pct = dur / max(total_dur, 1e-9) * 100
                if pct > 1:
                    print(f'      {gt_q:>6} -> {det_q:<6}: {dur:.1f}s ({pct:.1f}%)')
        if fp_ext_agg:
            print(f'    false positive extensions:')
            for k, v in sorted(fp_ext_agg.items()):
                pct = v / max(total_dur, 1e-9) * 100
                print(f'      {k}: {v:.1f}s ({pct:.1f}%)')

    # Determine best experiment
    exp_quals = {}
    for exp_name in ['O0_baseline', 'O1_noL2', 'O2_reinforced', 'O3_penalty']:
        if exp_name not in all_exp_results: continue
        total_qual = 0.0; total_dur = 0.0
        for res in all_exp_results[exp_name].values():
            d = res.get('actual_dur', res['dur_total'])
            total_qual += res['quality_accuracy'] * d
            total_dur += d
        exp_quals[exp_name] = total_qual / max(total_dur, 1e-9)

    best_exp = max(exp_quals, key=exp_quals.get)
    print(f'\n  Best experiment: {best_exp} ({exp_quals[best_exp]*100:.1f}%)')
    print(f'  Baseline (O0):  {exp_quals.get("O0_baseline", 0)*100:.1f}%')
    print(f'  Gain:           {(exp_quals[best_exp] - exp_quals.get("O0_baseline", 0))*100:.1f}%')

    # ─── Part 4: Viterbi audit (best experiment) ───
    print(f'\n{"="*70}')
    print(f'PART 4: VITERBI AUDIT with {best_exp}')
    print(f'{"="*70}')

    viterbi_results = {}
    for wf in wav_files:
        wav_path = os.path.join(PROG_DIR, wf)
        gt_path = wav_path.replace('.wav', '.json')
        if not os.path.exists(gt_path): continue
        name = wf.replace('.wav', '')
        with open(gt_path) as f: gt = json.load(f)
        gt_segs = gt['segments']
        dur_total = gt['chord_duration'] * len(gt['progression']) * gt['repeats']

        y, sr = librosa.load(wav_path, sr=22050, mono=True)
        duration = float(len(y) / sr)
        hop_length = 512

        tempo, beat_frames = _beat_track(y, sr, hop_length=hop_length)
        beat_frames = np.atleast_1d(beat_frames)
        if len(beat_frames) == 0 or beat_frames[0] != 0:
            beat_frames = np.concatenate(([0], beat_frames))
        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
        K = len(beat_times)

        key, _ = detect_key(y, sr)

        y_harm, _ = librosa.effects.hpss(y, margin=8.0)
        chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
        n_frames = chroma.shape[1]

        beat_chroma = np.zeros((12, K), dtype=np.float32)
        frame_energies = np.zeros(K, dtype=np.float32)
        for k in range(K):
            sf = int(beat_frames[k])
            ef = int(beat_frames[k + 1]) if k + 1 < K else n_frames
            if ef <= sf:
                beat_chroma[:, k] = 0.0; frame_energies[k] = 0.0
            else:
                beat_chroma[:, k] = np.mean(chroma[:, sf:ef], axis=1)
                frame_energies[k] = float(np.sum(beat_chroma[:, k]))

        states = _build_chord_states()

        # Get best experiment's observation scores
        for exp_name, scoring_fn, state_builder_fn, is_raw in EXPERIMENTS:
            if exp_name == best_exp:
                if state_builder_fn:
                    use_states = state_builder_fn()
                else:
                    use_states = states
                obs = scoring_fn(beat_chroma, use_states, key, frame_energies)
                if isinstance(obs, tuple): obs = obs[0]
                break

        # Run Viterbi
        trans = _build_transition_matrix(use_states, key)

        # Need to add initial scores for Viterbi (same as production)
        init = _initial_scores(use_states, key)
        obs_vit = obs.copy()
        obs_vit[0] += init

        # Scale raw scores to [0,1] — critical for O1 which has no L2 normalization
        obs_min = float(np.min(obs_vit))
        obs_max = float(np.max(obs_vit))
        if obs_max > obs_min and best_exp == 'O1_noL2':
            obs_vit = (obs_vit - obs_min) / (obs_max - obs_min)
        obs_vit = np.clip(obs_vit, 0.0, 1.0)

        path = _viterbi(obs_vit, trans)

        # Per-beat GT assignment
        gt_per_beat = []
        for i in range(K):
            b_mid = (beat_times[i] + (beat_times[i+1] if i+1 < K else duration)) / 2
            assigned = None
            for gs in gt_segs:
                if gs['start_time'] <= b_mid < gs['end_time']:
                    assigned = (norm_root(gs['root']), norm_qual(gs['quality']))
                    break
            gt_per_beat.append(assigned)

        # Per-beat best observation
        obs_best = [int(np.argmax(obs[i])) for i in range(K)]

        actual_dur_vit = sum(
            (beat_times[i+1] if i+1 < K else duration) - beat_times[i]
            for i in range(K) if gt_per_beat[i] is not None
        )

        # Compare obs vs Viterbi vs GT
        obs_correct_beat = 0.0  # obs correct → viterbi correct
        obs_correct_vit_wrong = 0.0  # obs correct → viterbi wrong (regression)
        obs_wrong_vit_correct = 0.0  # obs wrong → viterbi correct (correction)
        obs_wrong_vit_wrong = 0.0  # obs wrong → viterbi wrong
        regression_details = []

        for i in range(K):
            gt_pair = gt_per_beat[i]
            if gt_pair is None: continue
            gt_r, gt_q = gt_pair
            b_dur = (beat_times[i+1] if i+1 < K else duration) - beat_times[i]

            obs_si = obs_best[i]
            obs_st = use_states[obs_si]
            obs_r = norm_root(NOTE_NAMES[obs_st['root']] if obs_st['root'] is not None else '?')
            obs_q = obs_st['suffix']

            vit_si = int(path[i])
            vit_st = use_states[vit_si]
            vit_r = norm_root(NOTE_NAMES[vit_st['root']] if vit_st['root'] is not None else '?')
            vit_q = vit_st['suffix']

            obs_ok = (obs_r == gt_r and obs_q == gt_q)
            vit_ok = (vit_r == gt_r and vit_q == gt_q)

            if obs_ok and vit_ok:
                obs_correct_beat += b_dur
            elif obs_ok and not vit_ok:
                obs_correct_vit_wrong += b_dur
                regression_details.append({
                    'beat': i,
                    'time': round(beat_times[i], 2),
                    'gt_chord': f"{gt_r}{gt_q}",
                    'obs_chord': obs_st['name'],
                    'obs_score': round(float(obs[i][obs_si]), 4),
                    'vit_chord': vit_st['name'],
                    'vit_score': float(obs[i][vit_si]),
                    'trans_cost': float(trans[path[i-1] if i > 0 else vit_si, vit_si] -
                                        trans[path[i-1] if i > 0 else vit_si, obs_si]),
                })
            elif not obs_ok and vit_ok:
                obs_wrong_vit_correct += b_dur
            else:
                obs_wrong_vit_wrong += b_dur

        # Count consecutive wrong Viterbi runs
        wrong_runs = []
        cur_run = 0
        for i in range(K):
            gt_pair = gt_per_beat[i]
            if gt_pair is None: continue
            gt_r, gt_q = gt_pair
            vit_si = int(path[i])
            vit_st = use_states[vit_si]
            vit_r = norm_root(NOTE_NAMES[vit_st['root']] if vit_st['root'] is not None else '?')
            vit_q = vit_st['suffix']
            vit_ok = (vit_r == gt_r and vit_q == gt_q)
            if not vit_ok:
                cur_run += 1
            else:
                if cur_run > 0:
                    wrong_runs.append(cur_run)
                cur_run = 0
        if cur_run > 0:
            wrong_runs.append(cur_run)

        vres = {
            'progression': name,
            'dur_total': dur_total,
            'actual_dur': round(actual_dur_vit, 3),
            'obs_correct_and_viterbi_correct': round(obs_correct_beat, 3),
            'obs_correct_but_viterbi_wrong': round(obs_correct_vit_wrong, 3),
            'obs_wrong_but_viterbi_corrected': round(obs_wrong_vit_correct, 3),
            'obs_wrong_and_viterbi_wrong': round(obs_wrong_vit_wrong, 3),
            'regression_pct': round(obs_correct_vit_wrong / max(actual_dur_vit, 1e-9) * 100, 1),
            'correction_pct': round(obs_wrong_vit_correct / max(actual_dur_vit, 1e-9) * 100, 1),
            'n_wrong_runs': len(wrong_runs),
            'max_wrong_run_beats': max(wrong_runs) if wrong_runs else 0,
            'mean_wrong_run_beats': round(sum(wrong_runs) / max(len(wrong_runs), 1), 1) if wrong_runs else 0,
            'regression_details': regression_details[:20],  # first 20
        }
        viterbi_results[name] = vres

        print(f'\n  {name}:')
        print(f'    obs_correct → viterbi_correct:  {vres["obs_correct_and_viterbi_correct"]:.1f}s')
        print(f'    obs_correct → viterbi_WRONG:    {vres["obs_correct_but_viterbi_wrong"]:.1f}s ({vres["regression_pct"]}%) ← regression')
        print(f'    obs_wrong → viterbi_corrected:  {vres["obs_wrong_but_viterbi_corrected"]:.1f}s ({vres["correction_pct"]}%)')
        print(f'    obs_wrong → viterbi_wrong:      {vres["obs_wrong_and_viterbi_wrong"]:.1f}s')
        print(f'    wrong runs: {vres["n_wrong_runs"]}, max={vres["max_wrong_run_beats"]}, mean={vres["mean_wrong_run_beats"]}')

        if regression_details:
            print(f'    Sample regressions:')
            for rd in regression_details[:5]:
                print(f'      t={rd["time"]:.1f}s  gt={rd["gt_chord"]}  obs={rd["obs_chord"]}({rd["obs_score"]:.3f}) → vit={rd["vit_chord"]}  cost={rd["trans_cost"]:.3f}')

    vit_path = os.path.join(OUT_DIR, 'audit_viterbi.json')
    with open(vit_path, 'w') as f:
        json.dump({'experiment': best_exp, 'results': viterbi_results}, f, indent=2)
    print(f'\n  Saved: {vit_path}')

    # Aggregate Viterbi
    total_obs_correct_vit_wrong = sum(r['obs_correct_but_viterbi_wrong'] for r in viterbi_results.values())
    total_obs_wrong_vit_corrected = sum(r['obs_wrong_but_viterbi_corrected'] for r in viterbi_results.values())
    total_dur_all = sum(r.get('actual_dur', r['dur_total']) for r in viterbi_results.values())
    print(f'\n  Viterbi aggregate:')
    print(f'    Total regression: {total_obs_correct_vit_wrong:.1f}s ({total_obs_correct_vit_wrong/max(total_dur_all,1e-9)*100:.1f}%)')
    print(f'    Total correction: {total_obs_wrong_vit_corrected:.1f}s ({total_obs_wrong_vit_corrected/max(total_dur_all,1e-9)*100:.1f}%)')
    net = total_obs_correct_vit_wrong - total_obs_wrong_vit_corrected
    print(f'    Net regression:   {net:.1f}s ({net/max(total_dur_all,1e-9)*100:.1f}%)')

    # Compare O0 vs best vs Viterbi final quality
    print(f'\n{"="*70}')
    print('FINAL COMPARISON')
    print(f'{"="*70}')
    for exp_name in ['O0_baseline', 'O1_noL2', 'O2_reinforced', 'O3_penalty']:
        if exp_name not in all_exp_results: continue
        total_qual = 0.0; total_dur = 0.0
        for res in all_exp_results[exp_name].values():
            d = res.get('actual_dur', res['dur_total'])
            total_qual += res['quality_accuracy'] * d
            total_dur += d
        q = total_qual / max(total_dur, 1e-9)
        print(f'  {exp_name:>20}: quality_accuracy = {q*100:.1f}%')

    # Viterbi final quality (using best experiment obs)
    total_qual_vit = 0.0
    for name, vres in viterbi_results.items():
        total_qual_vit += (vres['obs_correct_and_viterbi_correct'] + vres['obs_wrong_but_viterbi_corrected'])
    q_vit = total_qual_vit / max(total_dur_all, 1e-9)
    best_obs_q = exp_quals.get(best_exp, 0)
    print(f'  {best_exp + "_viterbi":>20}: quality_accuracy = {q_vit*100:.1f}%')
    print(f'   (best obs without Viterbi: {best_obs_q*100:.1f}%)')
    print(f'   Viterbi delta: {(q_vit - best_obs_q)*100:.1f}%')

    print(f'\nDone — all results in {OUT_DIR}/audit_*')


if __name__ == '__main__':
    evaluate_on_all()
