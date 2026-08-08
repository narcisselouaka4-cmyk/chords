#!/usr/bin/env python3
"""A/B benchmark: baseline vs targeted_contradictions on real pipeline.

Evaluates the real analyze_chords() function via subprocess on:
  1. Audio progressions (4 files in tests/audio/progressions/)
  2. Single chords (WAVs in tests/audio/)
  3. Synthetic benchmark (direct import, no audio needed)
  4. Stuck chord test (isolated WAVs)

Produces JSON report + terminal summary.
"""
import json, os, sys, glob, re
from collections import defaultdict

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

AP_SCRIPT = os.path.join(PROJECT, 'electron', 'audio-processor.py')
PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def parse_chord(chord_str):
    m = re.match(r'([A-G][#b]?)(.*)', chord_str)
    if not m:
        return None, None
    root_str = m.group(1)
    root = NOTE_NAMES.index(root_str) if root_str in NOTE_NAMES else None
    suffix = m.group(2)
    return root, suffix

def chord_name(root, suffix):
    return f'{NOTE_NAMES[root % 12]}{suffix}'

FLATS = {'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B'}
def norm_root(r):
    return FLATS.get(r[:2], FLATS.get(r[:1], r))

QUAL_MAP = {'major': '', 'minor': 'm', 'min': 'm', 'min7': 'm7', 'dom7': '7',
            'dim': 'dim', 'hdim7': 'm7b5', 'hdim': 'm7b5',
            'half-diminished': 'm7b5', 'aug': 'aug'}
def norm_qual(q):
    return QUAL_MAP.get(q.strip(), q.strip())

QUALITY_FAMILIES = {
    '': 0, 'maj7': 0, 'sus2': 0, 'sus4': 0,
    '7': 1,
    'm': 2, 'm7': 2,
    'dim': 3, 'm7b5': 3,
    'aug': 4,
}

def run_analysis(wav, **kwargs):
    args = [sys.executable, AP_SCRIPT, 'analyze-chords', wav, 'legacy', '--debug']
    for k, v in kwargs.items():
        if v is not None:
            args.append(f'--{k.replace("_", "-")}={v}')
    proc = subprocess.run(args, capture_output=True, text=True, timeout=120)
    lines = proc.stdout.strip().split('\n')
    json_line = None
    for line in lines:
        if line.startswith('{'):
            json_line = line
            break
    if json_line:
        return json.loads(json_line)
    raise RuntimeError(f'No JSON output for {wav}. stderr: {proc.stderr[:500]}')

import subprocess


# ─── Synthetic benchmark (direct import) ───

import importlib.util
import numpy as np

def run_synthetic(bench_path):
    spec = importlib.util.spec_from_file_location('ap', AP_SCRIPT)
    ap = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ap)

    with open(bench_path) as f:
        bench = json.load(f)

    results = {}
    for ds_name, cases in [('dev', bench['dev']),
                           ('val_clean', bench['val']['clean']),
                           ('val_noisy', bench['val']['noisy'])]:
        results[ds_name] = {}
        for label, obs_mode in [('baseline', 'baseline'), ('targeted_contradictions', 'targeted_contradictions')]:
            w = 0.10 if obs_mode == 'targeted_contradictions' else None
            correct = 0
            n = len(cases)
            conf = defaultdict(lambda: defaultdict(int))
            fp_ext = 0
            fp_ext_tot = 0
            for case in cases:
                ground_root = case['root']
                ground_qual = case['quality']
                chroma = np.array(case['chroma'], dtype=np.float64)

                # Build states for the given mode
                states = ap._build_chord_states(obs_mode, w)
                # Score all states at ground root
                all_scores = {}
                for st in states:
                    if st['root'] != ground_root:
                        continue
                    tmpl = st['template']
                    frame = chroma.copy()
                    fn = np.linalg.norm(frame)
                    if fn > 1e-8:
                        frame = frame / fn
                    sim = float(np.dot(frame, tmpl))
                    sim = max(0.0, min(1.0, sim))
                    all_scores[st['suffix']] = sim

                ranked = sorted(all_scores.items(), key=lambda x: -x[1])
                best_q = ranked[0][0]

                if best_q == ground_qual:
                    correct += 1
                conf[ground_qual][best_q] += 1
                if ground_qual in ('', 'm'):
                    fp_ext_tot += 1
                    if best_q in ('7', 'maj7', 'sus2', 'sus4', 'm7'):
                        fp_ext += 1

            results[ds_name][label] = {
                'quality_accuracy': round(correct / max(n, 1), 4),
                'confusion': {k: dict(v) for k, v in sorted(conf.items())},
                'fp_extension': {'count': fp_ext, 'total': fp_ext_tot, 'rate': round(fp_ext / max(fp_ext_tot, 1), 4)},
            }
    return results


# ─── Audio progression evaluation ───

def load_gt(json_path):
    with open(json_path) as f:
        data = json.load(f)
    segs = []
    for s in data['segments']:
        segs.append({
            'start': s['start_time'],
            'end': s['end_time'],
            'root': NOTE_NAMES.index(norm_root(s['root'])),
            'quality': norm_qual(s['quality']),
        })
    return segs

def evaluate_progression_wav(wav_path, obs_mode, w):
    """Run the full pipeline and evaluate beat-level against ground truth."""
    try:
        result = run_analysis(wav_path, observation_mode=obs_mode, contradiction_weight=w)
    except Exception as e:
        return {'error': str(e)}

    gt_path = wav_path.replace('.wav', '.json')
    if not os.path.exists(gt_path):
        return {'error': f'GT not found: {gt_path}'}

    gt_segs = load_gt(gt_path)
    chords = result.get('chords', [])
    if not chords:
        return {'error': 'No chords returned'}

    total_secs = 0.0
    root_ok = 0.0
    qual_ok = 0.0
    both_ok = 0.0
    conf = defaultdict(lambda: defaultdict(float))
    fp_ext = 0.0
    fp_ext_tot = 0.0

    for seg in chords:
        st = seg['startTime']
        et = seg['endTime']
        dur = et - st
        mid = (st + et) / 2
        chord = seg['chord']
        seg_root, seg_sfx = parse_chord(chord)
        if seg_root is None:
            continue

        # Find GT for this midpoint
        gt = None
        for gs in gt_segs:
            if gs['start'] <= mid < gs['end']:
                gt = gs
                break
        if gt is None:
            continue

        total_secs += dur
        if seg_root == gt['root']:
            root_ok += dur
        if seg_sfx == gt['quality']:
            qual_ok += dur
        if seg_root == gt['root'] and seg_sfx == gt['quality']:
            both_ok += dur
        conf[f'{gt["root"]}:{gt["quality"]}'][f'{seg_root}:{seg_sfx}'] += dur
        if gt['quality'] in ('', 'm'):
            fp_ext_tot += dur
            if seg_sfx in ('7', 'maj7', 'sus2', 'sus4', 'm7'):
                fp_ext += dur

    return {
        'total_seconds': round(total_secs, 3),
        'root_accuracy': round(root_ok / max(total_secs, 1), 4),
        'quality_accuracy': round(qual_ok / max(total_secs, 1), 4),
        'root_plus_quality': round(both_ok / max(total_secs, 1), 4),
        'fp_extension_rate': round(fp_ext / max(fp_ext_tot, 1), 4),
        'confusion': {k: dict(v) for k, v in sorted(conf.items())},
        'chord_list': chords,
    }

def run_audio_benchmark():
    wavs = sorted(glob.glob(os.path.join(PROG_DIR, '*.wav')))
    results = {}
    for wav in wavs:
        name = os.path.splitext(os.path.basename(wav))[0]
        results[name] = {}
        for mode_name, obs_mode in [('baseline', 'baseline'), ('contradictions', 'targeted_contradictions')]:
            w = 0.10 if obs_mode == 'targeted_contradictions' else None
            r = evaluate_progression_wav(wav, obs_mode, w)
            results[name][mode_name] = r
    return results


# ─── Single chord test (isolated WAVs) ───

def run_single_chord_test(obs_mode, w):
    """Recognise individual chord WAVs using the full pipeline."""
    audio_dir = os.path.join(PROJECT, 'tests', 'audio')
    wavs = sorted(glob.glob(os.path.join(audio_dir, 'chord_*.wav')))
    results = {}
    for wav in wavs:
        fname = os.path.basename(wav)
        chord_str = os.path.splitext(fname)[0]
        gt_root, gt_sfx = parse_chord(chord_str.replace('chord_', ''))
        if gt_root is None:
            continue
        try:
            r = run_analysis(wav, observation_mode=obs_mode, contradiction_weight=w)
        except Exception as e:
            results[fname] = {'error': str(e)}
            continue
        chords = r.get('chords', [])
        # Majority vote by duration
        from collections import Counter
        ctr = Counter()
        total = 0.0
        for seg in chords:
            dur = seg['endTime'] - seg['startTime']
            if dur > 0.1:
                ctr[seg['chord']] += dur
                total += dur
        if ctr:
            pred = ctr.most_common(1)[0][0]
            pr, ps = parse_chord(pred)
            results[fname] = {
                'gt': chord_str.replace('chord_', ''),
                'prediction': pred,
                'root_correct': pr == gt_root if pr is not None else False,
                'quality_correct': ps == gt_sfx if ps is not None else False,
                'duration': round(total, 3),
            }
        else:
            results[fname] = {'gt': chord_str, 'error': 'no segments'}
    return results


# ─── Report ───

def print_report(synth, audio):
    print('=' * 72)
    print('A/B BENCHMARK: baseline vs targeted_contradictions (w=0.10)')
    print('=' * 72)

    # 1. Synth
    print('\n── 1. SYNTHETIC ──')
    for ds in ['dev', 'val_clean', 'val_noisy']:
        if ds not in synth:
            continue
        print(f'\n  {ds}:')
        for label in ['baseline', 'targeted_contradictions']:
            r = synth[ds].get(label)
            if r:
                print(f'    {label:24s}  qual={r["quality_accuracy"]:.1%}  fp={r["fp_extension"]["rate"]:.1%}')

    # 2. Audio progression
    print('\n── 2. AUDIO PROGRESSIONS ──')
    agg = {'baseline': {'root': 0, 'qual': 0, 'both': 0, 'secs': 0, 'fp': 0, 'fp_tot': 0},
           'contradictions': {'root': 0, 'qual': 0, 'both': 0, 'secs': 0, 'fp': 0, 'fp_tot': 0}}
    for name, modes in sorted(audio.items()):
        print(f'\n  {name}:')
        for mode_name, short in [('baseline', 'O0'), ('contradictions', 'O2')]:
            r = modes.get(mode_name)
            if not r or 'error' in r:
                print(f'    {short}: ERROR {r.get("error", "")}')
                continue
            print(f'    {short}: qual={r["quality_accuracy"]:.1%}  root={r["root_accuracy"]:.1%}  '
                  f'both={r["root_plus_quality"]:.1%}  fp={r["fp_extension_rate"]:.1%}')
            a = agg[mode_name]
            a['root'] += r['root_accuracy'] * r['total_seconds']
            a['qual'] += r['quality_accuracy'] * r['total_seconds']
            a['both'] += r['root_plus_quality'] * r['total_seconds']
            a['secs'] += r['total_seconds']
            a['fp'] += r['fp_extension_rate'] * r['total_seconds']
            a['fp_tot'] += r['total_seconds']

    if agg['baseline']['secs'] > 0:
        print(f'\n  ── Aggregate ──')
        for mode_name, short in [('baseline', 'O0 baseline'), ('contradictions', 'O2 contradictions')]:
            a = agg[mode_name]
            s = a['secs']
            print(f'    {short:24s}: qual={a["qual"]/s:.1%}  root={a["root"]/s:.1%}  both={a["both"]/s:.1%}  '
                  f'fp={a["fp"]/s:.1%}')
        d = (agg['contradictions']['qual'] - agg['baseline']['qual']) / agg['baseline']['secs']
        print(f'    Δ quality (O2 - O0): {d:+.1%}')
        print(f'    → {"O2 recommended" if d > 0 else "O0 recommended (no gain)"}')

    # 3. Specific confusions
    print('\n── 3. KEY CONFUSIONS ──')
    for name in ['prog2_am7b5_d7_gm', 'prog3_cmaj7_csus4_cmaj7_c', 'prog1_dm7_g7_cmaj7']:
        if name not in audio:
            continue
        for mode_name, short in [('baseline', 'O0'), ('contradictions', 'O2')]:
            r = audio[name].get(mode_name)
            if not r or 'error' in r:
                continue
            conf = r.get('confusion', {})
            # Find m7b5→m and maj7→sus2 confusions
            for gt_key, preds in conf.items():
                gt_root, gt_q = gt_key.split(':')
                for pred_key, secs in preds.items():
                    pr_root, pr_q = pred_key.split(':')
                    if gt_q == 'm7b5' and pr_q == 'm':
                        print(f'    {short} m7b5→m: {secs:.1f}s')
                    if gt_q == 'maj7' and pr_q == 'sus2':
                        print(f'    {short} maj7→sus2: {secs:.1f}s')
                    if gt_q == 'maj7' and pr_q == '':
                        print(f'    {short} maj7→major: {secs:.1f}s')
                    if gt_q == 'm7' and pr_q == 'm':
                        print(f'    {short} m7→m: {secs:.1f}s')


def main():
    print('Loading synthetic benchmark...')
    synth_path = os.path.join(OUT_DIR, 'benchmark_synthetic.json')
    if os.path.exists(synth_path):
        synth = run_synthetic(synth_path)
    else:
        print(f'  SKIP: {synth_path} not found')
        synth = {}

    print('Running audio progressions...')
    audio = run_audio_benchmark()

    print('Running single chord test...')
    single_base = run_single_chord_test('baseline', None)
    single_contra = run_single_chord_test('targeted_contradictions', 0.10)

    print_report(synth, audio)

    # Single chord results
    print('\n── 4. SINGLE CHORD TEST ──')
    n_correct_base = sum(1 for v in single_base.values() if v.get('quality_correct'))
    n_correct_contra = sum(1 for v in single_contra.values() if v.get('quality_correct'))
    n_total = len(single_base)
    print(f'  baseline:        {n_correct_base}/{n_total} correct ({n_correct_base/max(n_total,1):.0%})')
    print(f'  contradictions:  {n_correct_contra}/{n_total} correct ({n_correct_contra/max(n_total,1):.0%})')
    for fname, v in sorted(single_contra.items()):
        if 'error' not in v and not v['quality_correct']:
            b_v = single_base.get(fname, {})
            print(f'    {fname}: GT={v["gt"]}  O0→{b_v.get("prediction","?")}  O2→{v["prediction"]}')

    # Save report
    report = {
        'synthetic': synth,
        'audio_progressions': audio,
        'single_chords': {'baseline': single_base, 'contradictions': single_contra},
    }

    report_path = os.path.join(OUT_DIR, 'rapport_ab_benchmark.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    print(f'\nReport saved: {report_path}')

if __name__ == '__main__':
    main()
