#!/usr/bin/env python3
"""Diagnostic par étage : baseline vs posthoc_discriminator.

Compare chaque étape du pipeline sur les 4 progressions audio.
Production d'un rapport JSON + terminal structuré.
"""
import json, os, sys, glob, re
from collections import defaultdict
import importlib.util
import numpy as np

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

spec = importlib.util.spec_from_file_location('ap', os.path.join(PROJECT, 'electron', 'audio-processor.py'))
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

import librosa

NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
FLATS = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B'}
QUAL_MAP = {'major':'','minor':'m','min':'m','min7':'m7','dom7':'7','dim':'dim','hdim7':'m7b5','hdim':'m7b5','half-diminished':'m7b5','aug':'aug'}

def norm_root(r):
    return FLATS.get(r[:2], FLATS.get(r[:1], r))

def norm_qual(q):
    return QUAL_MAP.get(q.strip(), q.strip())

def parse_chord(c):
    m = re.match(r'([A-G][#b]?)(.*)', c)
    if not m: return None, None
    return NOTE_NAMES.index(m.group(1)), m.group(2)


def load_audio_progression(wav_path):
    """Same as experiment: load WAV, detect beats, compute chroma."""
    gt_path = wav_path.replace('.wav', '.json')
    with open(gt_path) as f:
        gt = json.load(f)
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    duration = float(len(y) / sr)
    hop_length = 512
    tempo, beat_frames = ap._beat_track(y, sr, hop_length=hop_length)
    beat_frames = np.atleast_1d(beat_frames)
    if len(beat_frames) == 0 or beat_frames[0] != 0:
        beat_frames = np.concatenate(([0], beat_frames))
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    K = len(beat_times)
    key, _ = ap.detect_key(y, sr)
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
        'key': key, 'beat_chroma': beat_chroma,
        'frame_energies': frame_energies,
    }


def build_gt_per_beat(audio_data):
    """Map each beat midpoint to (root_pc, quality)."""
    gt = audio_data['gt']
    gt_segs = gt['segments']
    beat_times = audio_data['beat_times']
    K = audio_data['K']
    duration = audio_data['duration']
    result = []
    for i in range(K):
        b_mid = (beat_times[i] + (beat_times[i+1] if i+1 < K else duration)) / 2
        assigned = None
        for gs in gt_segs:
            if gs['start_time'] <= b_mid < gs['end_time']:
                assigned = (
                    NOTE_NAMES.index(norm_root(gs['root'])),
                    norm_qual(gs['quality']),
                    (beat_times[i+1] if i+1 < K else duration) - beat_times[i],
                )
                break
        result.append(assigned)
    return result


def evaluate_beats(states, beat_choices, gt_per_beat):
    """Evaluate a sequence of per-beat state choices against GT."""
    total_root = 0.0
    total_qual = 0.0
    total_both = 0.0
    total_secs = 0.0
    conf = defaultdict(lambda: defaultdict(float))
    for i, (st_idx, gt) in enumerate(zip(beat_choices, gt_per_beat)):
        if gt is None:
            continue
        g_r, g_q, dur = gt
        st = states[st_idx]
        s_r, s_q = st['root'], st['suffix']
        total_secs += dur
        if s_r is not None and s_r == g_r:
            total_root += dur
        if s_q == g_q:
            total_qual += dur
        if s_r is not None and s_r == g_r and s_q == g_q:
            total_both += dur
        conf[f'{g_r}:{g_q}'][f'{s_r}:{s_q}'] += dur
    return {
        'root': round(total_root / max(total_secs, 1), 4),
        'quality': round(total_qual / max(total_secs, 1), 4),
        'root_quality': round(total_both / max(total_secs, 1), 4),
        'seconds': round(total_secs, 3),
        'confusion': {k: dict(v) for k, v in sorted(conf.items())},
    }


def evaluate_segments(states, segments, gt_per_beat):
    """Evaluate segments by midpoint projection onto GT beats."""
    total_root = 0.0
    total_qual = 0.0
    total_both = 0.0
    total_secs = 0.0
    conf = defaultdict(lambda: defaultdict(float))
    for seg in segments:
        st = seg['startTime']
        et = seg['endTime']
        dur = et - st
        mid = (st + et) / 2
        chord = seg['chord']
        s_r, s_q = parse_chord(chord)
        if s_r is None:
            continue
        # Find GT beat that contains this midpoint
        for gt in gt_per_beat:
            if gt is None:
                continue
            # gt_per_beat entries don't have timing info directly
        # Actually, use the original gt data
        pass
    # Rebuild: use audio_data['gt'] directly
    return {}


def run_stages(wav_path):
    """Run pipeline step by step, record choices at each stage."""
    audio_data = load_audio_progression(wav_path)
    gt_per_beat = build_gt_per_beat(audio_data)
    bc = audio_data['beat_chroma']
    key = audio_data['key']
    fe = audio_data['frame_energies']
    bt = audio_data['beat_times']
    dur = audio_data['duration']

    results = {}
    for mode_name, obs_mode, cw, dt, ds in [
        ('baseline', 'baseline', None, None, None),
        ('posthoc', 'posthoc_discriminator', None, 0.02, 0.05),
    ]:
        mode_results = {}
        states = ap._build_chord_states(obs_mode, cw or 0.10)
        trans = ap._build_transition_matrix(states, key)

        # Stage 1: Observation (argmax per beat)
        obs = ap._compute_observation_scores(bc, states, key, fe)
        if obs_mode == 'posthoc_discriminator':
            obs = ap._apply_discriminator(obs, bc, states, dt, ds)
        obs[0] += ap._initial_scores(states, key)
        obs = np.clip(obs, 0.0, 1.0)
        obs_choices = [int(np.argmax(obs[t])) for t in range(obs.shape[0])]
        mode_results['observation'] = {
            'choices': obs_choices,
            'eval': evaluate_beats(states, obs_choices, gt_per_beat),
        }

        # Stage 2: Viterbi path
        path = ap._viterbi(obs, trans)
        mode_results['viterbi'] = {
            'choices': list(path),
            'eval': evaluate_beats(states, path, gt_per_beat),
        }

        # Stage 3: segment_path
        segs = ap._segment_path(path, bt, dur, states, obs)
        mode_results['segment_path'] = {
            'segments': [{'start': s['startTime'], 'end': s['endTime'],
                          'chord': s['chord'], 'state': s['state']} for s in segs],
            'eval': evaluate_segments_gt(segs, audio_data['gt']),
        }

        # Stage 4: merge_similar_segments
        merged = ap._merge_similar_segments(segs)
        mode_results['merged'] = {
            'segments': [{'start': s['startTime'], 'end': s['endTime'],
                          'chord': s['chord'], 'state': s['state']} for s in merged],
            'eval': evaluate_segments_gt(merged, audio_data['gt']),
        }

        # Stage 5: downgrade + clean (final output)
        from copy import deepcopy
        final = deepcopy(merged)
        if ap.ENABLE_CHORD_DOWNGRADE:
            final_states = states
            final = ap._downgrade_advanced_segments(final, bc, final_states, threshold=0.03, mode='hybrid')
            final = ap._clean_segments(final, min_duration=0.4, silence_min=1.2)
        mode_results['final'] = {
            'segments': [{'start': s['startTime'], 'end': s['endTime'],
                          'chord': s['chord'], 'state': s.get('state', -1)} for s in final],
            'eval': evaluate_segments_gt(final, audio_data['gt']),
        }

        results[mode_name] = mode_results

    return results


def evaluate_segments_gt(segments, gt_data):
    """Evaluate segments against ground truth by midpoint."""
    gt_segs = []
    for s in gt_data['segments']:
        gt_segs.append({
            'start': s['start_time'],
            'end': s['end_time'],
            'root': NOTE_NAMES.index(norm_root(s['root'])),
            'quality': norm_qual(s['quality']),
        })

    total_root = 0.0
    total_qual = 0.0
    total_both = 0.0
    total_secs = 0.0
    conf = defaultdict(lambda: defaultdict(float))
    per_q_correct = defaultdict(float)
    per_q_total = defaultdict(float)

    for seg in segments:
        st = seg.get('start', seg.get('startTime'))
        et = seg.get('end', seg.get('endTime'))
        dur = et - st
        mid = (st + et) / 2
        chord = seg.get('chord', seg.get('name'))
        s_r, s_q = parse_chord(chord)
        if s_r is None:
            continue
        # Find GT segment containing this midpoint
        for gs in gt_segs:
            if gs['start'] <= mid < gs['end']:
                total_secs += dur
                per_q_total[gs['quality']] += dur
                if s_r == gs['root']:
                    total_root += dur
                if s_q == gs['quality']:
                    total_qual += dur
                    per_q_correct[gs['quality']] += dur
                if s_r == gs['root'] and s_q == gs['quality']:
                    total_both += dur
                conf[f'{gs["root"]}:{gs["quality"]}'][f'{s_r}:{s_q}'] += dur
                break

    per_q = {}
    for q in per_q_total:
        per_q[q] = round(per_q_correct.get(q, 0) / per_q_total[q], 4) if per_q_total[q] > 0 else 0.0

    return {
        'root': round(total_root / max(total_secs, 1), 4),
        'quality': round(total_qual / max(total_secs, 1), 4),
        'root_quality': round(total_both / max(total_secs, 1), 4),
        'seconds': round(total_secs, 3),
        'confusion': {k: dict(v) for k, v in sorted(conf.items())},
        'per_quality': per_q,
    }


# ─── Viterbi cancellation analysis ───

def analyze_viterbi_cancel(wav_path, beat_idx, obs_mode, dt, ds):
    """Detailed analysis of why a specific beat was cancelled by Viterbi."""
    audio_data = load_audio_progression(wav_path)
    bc = audio_data['beat_chroma']
    key = audio_data['key']
    fe = audio_data['frame_energies']
    bt = audio_data['beat_times']
    dur = audio_data['duration']
    K = audio_data['K']

    states = ap._build_chord_states(obs_mode, 0.10)
    obs = ap._compute_observation_scores(bc, states, key, fe)
    if obs_mode == 'posthoc_discriminator':
        obs = ap._apply_discriminator(obs, bc, states, dt, ds)
    obs_raw = obs.copy()
    obs[0] += ap._initial_scores(states, key)
    obs = np.clip(obs, 0.0, 1.0)

    trans = ap._build_transition_matrix(states, key)
    path = ap._viterbi(obs, trans)

    # For the given beat, list top-3 observations
    top3 = np.argsort(obs_raw[beat_idx])[-3:][::-1]
    print(f'\n  Beat {beat_idx} (t={bt[beat_idx]:.2f}s):')
    print(f'  Top-3 observation scores:')
    for rank, si in enumerate(top3):
        st = states[si]
        print(f'    {rank+1}. {st["name"]:12s} raw={obs_raw[beat_idx][si]:.4f} final={obs[beat_idx][si]:.4f}')
    print(f'  Viterbi choice: {states[path[beat_idx]]["name"]}')
    if beat_idx > 0:
        print(f'  Previous state: {states[path[beat_idx-1]]["name"]}')
    if beat_idx < K - 1:
        print(f'  Next state:     {states[path[beat_idx+1]]["name"]}')

    # Transition costs
    if beat_idx > 0:
        prev_si = path[beat_idx - 1]
        cur_si = path[beat_idx]
        print(f'  Transition {states[prev_si]["name"]} → {states[cur_si]["name"]}: {trans[prev_si][cur_si]:.4f}')

        # What would be transition to m7b5?
        for suffix in ['m7b5', 'm', '7']:
            si = None
            for i, st in enumerate(states):
                if st['root'] == 9 and st['suffix'] == suffix:
                    si = i
                    break
            if si is not None:
                print(f'  Transition {states[prev_si]["name"]} → A{suffix}: {trans[prev_si][si]:.4f} (obs={obs[beat_idx][si]:.4f})')

    return states, obs, trans, path


# ─── Main ───

def main():
    PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')
    wav_files = sorted(glob.glob(os.path.join(PROG_DIR, '*.wav')))
    report = {
        'metric_definitions': {
            'observation_beat': {
                'description': 'Per-beat argmax of observation scores (before Viterbi).',
                'unit': 'Duration-weighted accuracy',
                'denominator': 'Sum of beat durations where GT exists (midpoint assignment)',
                'corpus': '4 audio progressions',
            },
            'viterbi_beat': {
                'description': 'Per-beat Viterbi-decoded path.',
                'unit': 'Duration-weighted accuracy',
                'denominator': 'Sum of beat durations with GT',
                'corpus': '4 audio progressions',
            },
            'segment_path': {
                'description': 'Segments from _segment_path(), evaluated by midpoint.',
                'unit': 'Duration-weighted accuracy',
                'denominator': 'Sum of segment durations mapping to a GT segment',
                'corpus': '4 audio progressions',
            },
            'merged': {
                'description': 'Segments after _merge_similar_segments().',
                'unit': 'Duration-weighted accuracy',
                'denominator': 'Sum of segment durations with GT',
                'corpus': '4 audio progressions',
            },
            'final': {
                'description': 'Final output after downgrade + clean.',
                'unit': 'Duration-weighted accuracy',
                'denominator': 'Sum of segment durations with GT',
                'corpus': '4 audio progressions',
            },
        },
        'per_progression': {},
        'aggregate': {},
        'viterbi_cancellation': {},
        'maj7_diagnostic': {},
    }

    # Aggregate accumulators
    agg = {}
    for mode in ['baseline', 'posthoc']:
        agg[mode] = {}
        for stage in ['observation', 'viterbi', 'segment_path', 'merged', 'final']:
            agg[mode][stage] = {'root': 0, 'qual': 0, 'both': 0, 'secs': 0}

    for wav in wav_files:
        name = os.path.splitext(os.path.basename(wav))[0]
        print(f'\n{"="*60}')
        print(f'Processing: {name}')
        print(f'{"="*60}')

        stages = run_stages(wav)
        report['per_progression'][name] = stages

        for mode_name in ['baseline', 'posthoc']:
            print(f'\n  --- {mode_name} ---')
            for stage_name, label in [
                ('observation', 'Observation (per-beat argmax)'),
                ('viterbi', 'Viterbi path'),
                ('segment_path', 'segment_path'),
                ('merged', 'merge_similar_segments'),
                ('final', 'Final (downgrade+clean)'),
            ]:
                r = stages[mode_name][stage_name]['eval']
                print(f'  {label:40s}  qual={r["quality"]:.1%}  root={r["root"]:.1%}  both={r["root_quality"]:.1%}  secs={r["seconds"]:.1f}')
                a = agg[mode_name][stage_name]
                a['root'] += r['root'] * r['seconds']
                a['qual'] += r['quality'] * r['seconds']
                a['both'] += r['root_quality'] * r['seconds']
                a['secs'] += r['seconds']

        # Viterbi cancellation analysis for prog2
        if 'prog2' in name:
            print(f'\n  --- Viterbi cancellation (prog2) ---')
            for mode_name, obs_mode, dt, ds in [
                ('baseline', 'baseline', None, None),
                ('posthoc', 'posthoc_discriminator', 0.02, 0.05),
            ]:
                print(f'\n  {mode_name}:')
                analyze_viterbi_cancel(wav, 0, obs_mode, dt, ds)
                analyze_viterbi_cancel(wav, 3, obs_mode, dt, ds)

    # Aggregate
    print(f'\n{"="*60}')
    print(f'AGGREGATE (all progressions)')
    print(f'{"="*60}')
    for mode_name in ['baseline', 'posthoc']:
        print(f'\n  {mode_name}:')
        for stage_name, label in [
            ('observation', 'Observation'),
            ('viterbi', 'Viterbi'),
            ('segment_path', 'segment_path'),
            ('merged', 'merge_similar_segments'),
            ('final', 'Final'),
        ]:
            a = agg[mode_name][stage_name]
            s = a['secs']
            if s > 0:
                print(f'  {label:40s}  qual={a["qual"]/s:.1%}  root={a["root"]/s:.1%}  both={a["both"]/s:.1%}')

    # Delta table
    print(f'\n  Δ (posthoc - baseline):')
    for stage_name in ['observation', 'viterbi', 'segment_path', 'merged', 'final']:
        ab = agg['baseline'][stage_name]
        ap_stage = agg['posthoc'][stage_name]
        sb = ab['secs']
        sp = ap_stage['secs']
        if sb > 0 and sp > 0:
            dq = ap_stage['qual']/sp - ab['qual']/sb
            print(f'  {stage_name:40s}  Δqual={dq:+.1%}')

    # ─── maj7 diagnostic ───
    print(f'\n{"="*60}')
    print(f'maj7 DIAGNOSTIC')
    print(f'{"="*60}')
    for wav in wav_files:
        name = os.path.splitext(os.path.basename(wav))[0]
        stages = report['per_progression'][name]
        audio_data = load_audio_progression(wav)
        bc = audio_data['beat_chroma']
        key = audio_data['key']
        fe = audio_data['frame_energies']

        gt = audio_data['gt']
        gt_segs = [s for s in gt['segments'] if norm_qual(s['quality']) == 'maj7']
        if not gt_segs:
            continue

        print(f'\n  {name}: {len(gt_segs)} maj7 segments, total {sum(s["end_time"]-s["start_time"] for s in gt_segs):.0f}s')

        for mode_name, obs_mode, dt, ds in [
            ('baseline', 'baseline', None, None),
            ('posthoc', 'posthoc_discriminator', 0.02, 0.05),
        ]:
            states = ap._build_chord_states(obs_mode, 0.10)
            obs = ap._compute_observation_scores(bc, states, key, fe)
            if obs_mode == 'posthoc_discriminator':
                obs = ap._apply_discriminator(obs, bc, states, dt, ds)
            obs[0] += ap._initial_scores(states, key)
            obs = np.clip(obs, 0.0, 1.0)
            trans = ap._build_transition_matrix(states, key)
            path = ap._viterbi(obs, trans)

            # For each maj7 GT segment, check observation rank
            for gs in gt_segs:
                g_root = NOTE_NAMES.index(norm_root(gs['root']))
                mid = (gs['start_time'] + gs['end_time']) / 2
                beat_idx = None
                for i in range(len(audio_data['beat_times'])):
                    if audio_data['beat_times'][i] <= mid < (audio_data['beat_times'][i+1] if i+1 < len(audio_data['beat_times']) else audio_data['duration']):
                        beat_idx = i
                        break
                if beat_idx is None:
                    continue

                # Find maj7 state index
                maj7_si = None
                for i, st in enumerate(states):
                    if st['root'] == g_root and st['suffix'] == 'maj7':
                        maj7_si = i
                        break
                if maj7_si is None:
                    continue

                # Rank of maj7 in observation at this beat
                sorted_indices = np.argsort(obs[beat_idx])[::-1]
                rank = int(np.where(sorted_indices == maj7_si)[0][0]) + 1
                top3 = []
                for r in range(3):
                    si = sorted_indices[r]
                    top3.append(f'{states[si]["name"]}({obs[beat_idx][si]:.3f})')

                print(f'    {mode_name:10s}  maj7 rank={rank}/{(len(states)-1):d}  top3=[{", ".join(top3)}]')
                
                # What wins over maj7?
                winner_si = sorted_indices[0]
                winner_name = states[winner_si]['name']
                winner_score = obs[beat_idx][winner_si]
                print(f'              winner={winner_name:12s} score={winner_score:.3f}  maj7={obs[beat_idx][maj7_si]:.3f}  gap={winner_score-obs[beat_idx][maj7_si]:.3f}')

    # Save report
    report_path = os.path.join(OUT_DIR, 'diagnostic_stages.json')
    # Convert numpy types
    class NpEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, (np.integer,)): return int(obj)
            if isinstance(obj, (np.floating,)): return float(obj)
            if isinstance(obj, np.ndarray): return obj.tolist()
            return super().default(obj)
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, cls=NpEncoder, default=str)
    print(f'\nReport: {report_path}')

if __name__ == '__main__':
    main()
