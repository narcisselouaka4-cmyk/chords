#!/usr/bin/env python3
"""
Benchmark corpus — Bass Engine V2.5.

Lance la baseline V2.5 sur un ensemble de morceaux défini dans
corpus_config.json et produit :
  - benchmark_outputs/<id>_result.json    (résultat par morceau)
  - benchmark_outputs/summary.json        (agrégat + params)
  - benchmark_corpus_results.md           (rapport lisible)

Usage:
    python scripts/benchmark_corpus.py [--config corpus_config.json]
"""

import sys, os, json, time, csv, re

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location(
    'bass_detector',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bass-detector.py'),
)
bd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bd)

OUTPUT_DIR = 'benchmark_outputs'
RESULTS_MD = 'benchmark_corpus_results.md'

NOTE_NAMES = bd.NOTE_NAMES


# ---------------------------------------------------------------------------
# Ground truth loading
# ---------------------------------------------------------------------------

def load_ground_truth_json(path):
    with open(path) as f:
        ref = json.load(f)
    bass_notes = bd.parse_reference_bass(ref)
    ref_chords = ref.get('chords_in_order') or []
    slash_positions = {i for i, c in enumerate(ref_chords) if '/' in str(c)}
    return bass_notes, slash_positions, ref_chords


def load_ground_truth_csv(path):
    basenotes = []
    chords = []
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            midi = int(row['midi_note'])
            pitch_class = NOTE_NAMES[midi % 12]
            basenotes.append(pitch_class)
            chords.append(row.get('chord', ''))
    slash_positions = {i for i, c in enumerate(chords) if '/' in str(c)}
    return basenotes, slash_positions, chords


def load_ground_truth(path):
    if not path or not os.path.isfile(path):
        return None, set(), []
    if path.endswith('.json'):
        return load_ground_truth_json(path)
    elif path.endswith('.csv'):
        return load_ground_truth_csv(path)
    else:
        print(f'  [WARN] Unknown ground truth format: {path}')
        return None, set(), []


# ---------------------------------------------------------------------------
# Metrics (same logic as benchmark() in bass-detector.py)
# ---------------------------------------------------------------------------

def compute_metrics(det_segments, ref_bass, slash_positions):
    ref_bass_pc = [bd.NOTE_TO_PC.get(b, -1) for b in ref_bass]
    det_bass_pc = [bd.NOTE_TO_PC.get(s['bass'], -1) for s in det_segments]

    alignment = bd.needleman_wunsch(ref_bass_pc, det_bass_pc)
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
    fragmentation = len(det_segments) / len(ref_bass) if len(ref_bass) > 0 else 0.0

    return {
        'bass_accuracy': round(bass_accuracy, 1),
        'slash_accuracy': round(slash_accuracy, 1),
        'fragmentation': round(fragmentation, 2),
        'det_segments': len(det_segments),
        'ref_notes': len(ref_bass),
        'alignment_score': alignment['score'],
    }


# ---------------------------------------------------------------------------
# Per-piece runner
# ---------------------------------------------------------------------------

def run_piece(piece, params):
    audio = piece['audio']
    gt_path = piece.get('ground_truth')
    pid = piece['id']
    style = piece.get('style', '?')

    print(f'[{pid}] {style}')
    print(f'  Audio: {audio}')

    if not os.path.isfile(audio):
        print(f'  [ERROR] File not found: {audio}')
        return None, None, None

    ref_bass, slash_positions, ref_chords = load_ground_truth(gt_path)
    has_gt = ref_bass is not None and len(ref_bass) > 0
    if gt_path and not has_gt:
        print(f'  [WARN] Ground truth not found or empty: {gt_path}')
    elif has_gt:
        print(f'  Ref: {len(ref_bass)} notes, {len(slash_positions)} slash chords')

    t0 = time.time()
    try:
        result = bd.analyze_bass(
            audio,
            use_v2=True,
            use_v3=False,
            smoothing_window=params['smoothing_window'],
            min_segment_duration=params['min_segment_duration'],
            tracking=params['tracking'],
        )
    except Exception as e:
        print(f'  [ERROR] Pipeline failed: {e}')
        return None, None, None

    elapsed = time.time() - t0
    duration = result['duration']
    rtf = elapsed / duration if duration > 0 else 0.0
    segments = result['segments']
    print(f'  Duration: {duration:.1f}s  Process: {elapsed:.1f}s  RTF: {rtf:.3f}')
    print(f'  Segments: {len(segments)}')

    metrics = compute_metrics(segments, ref_bass, slash_positions) if has_gt else None
    if metrics:
        print(f'  NW Accuracy: {metrics["bass_accuracy"]:.1f}%  '
              f'Slash: {metrics["slash_accuracy"]:.1f}%  '
              f'Fragm: {metrics["fragmentation"]:.2f}')

    return {
        'id': pid,
        'style': style,
        'audio': audio,
        'duration': round(duration, 3),
        'process_time': round(elapsed, 3),
        'rtf': round(rtf, 4),
        'has_ground_truth': has_gt,
        'metrics': metrics,
        'segments': segments,
    }, pid, result


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------

def save_individual(data, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    pid = data['id']
    segs = data.pop('segments')
    segs_clean = []
    for s in segs:
        segs_clean.append({
            'startTime': round(float(s['startTime']), 4),
            'endTime': round(float(s['endTime']), 4),
            'midi': int(s['midi']),
            'bass': s['bass'],
            'octave': int(s['octave']),
            'confidence': round(float(s['confidence']), 4),
        })
    out = {**data, 'segments': segs_clean}
    path = os.path.join(output_dir, f'{pid}_result.json')
    with open(path, 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    data['segments'] = segs
    return path


def generate_summary(all_results, params, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    valid = [r for r in all_results if r is not None and r['has_ground_truth']]
    metrics_keys = ['bass_accuracy', 'slash_accuracy', 'fragmentation']
    agg = {}
    for key in metrics_keys:
        vals = [r['metrics'][key] for r in valid]
        avg = np.mean(vals) if vals else 0.0
        std = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0
        agg[key] = {
            'mean': round(avg, 2),
            'std': round(std, 2),
            'min': round(min(vals), 2) if vals else 0.0,
            'max': round(max(vals), 2) if vals else 0.0,
        }

    times = [r['process_time'] for r in all_results if r is not None]
    durs = [r['duration'] for r in all_results if r is not None]
    rtfs = [r['rtf'] for r in all_results if r is not None]

    commit = os.popen('git rev-parse HEAD 2>/dev/null').read().strip() or 'unknown'

    summary = {
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'commit': commit,
        'params': params,
        'pieces_processed': len([r for r in all_results if r is not None]),
        'pieces_with_gt': len(valid),
        'aggregate_metrics': agg,
        'timing': {
            'mean_process_time': round(float(np.mean(times)), 3) if times else 0.0,
            'mean_rtf': round(float(np.mean(rtfs)), 4) if rtfs else 0.0,
            'total_audio_duration': round(sum(durs), 1),
            'total_process_time': round(sum(times), 1),
        },
        'results': [
            {
                'id': r['id'],
                'style': r['style'],
                'duration': r['duration'],
                'process_time': r['process_time'],
                'rtf': r['rtf'],
                'has_ground_truth': r['has_ground_truth'],
                'metrics': r['metrics'],
                'segment_count': len(r['segments']),
            }
            for r in all_results if r is not None
        ],
    }

    summary_path = os.path.join(output_dir, 'summary.json')
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    generate_markdown(summary, valid, rtfs, output_dir)
    return summary_path


def generate_markdown(summary, valid, rtfs, output_dir):
    lines = []
    lines.append('# Benchmark Corpus — Bass Engine V2.5\n')
    lines.append(f'Date : {summary["timestamp"]}')
    lines.append(f'Commit : `{summary["commit"]}`')
    lines.append(f'Params : `--smoothing-window {summary["params"]["smoothing_window"]}` '
                 f'`--min-segment-duration {summary["params"]["min_segment_duration"]}` '
                 f'`--tracking {summary["params"]["tracking"]}`\n')

    lines.append('## Résultats par morceau\n')
    lines.append('| ID | Style | Durée (s) | Segments | NW Acc. | Slash Acc. | Fragm. | RTF |')
    lines.append('|----|-------|-----------|----------|---------|------------|--------|-----|')
    for r in summary['results']:
        segs = r['segment_count']
        nw = f'{r["metrics"]["bass_accuracy"]:.1f}%' if r['metrics'] else '-'
        sl = f'{r["metrics"]["slash_accuracy"]:.1f}%' if r['metrics'] and r['metrics']["ref_notes"] > 0 else '-'
        fr = f'{r["metrics"]["fragmentation"]:.2f}' if r['metrics'] else '-'
        lines.append(f'| {r["id"]} | {r["style"]} | {r["duration"]:.1f} | {segs} | {nw} | {sl} | {fr} | {r["rtf"]:.3f} |')

    lines.append('\n## Synthèse\n')
    agg = summary['aggregate_metrics']
    lines.append(f'| Métrique | Moyenne | Écart-type | Min | Max |')
    lines.append(f'|----------|---------|------------|-----|-----|')
    for key in ['bass_accuracy', 'slash_accuracy', 'fragmentation']:
        a = agg[key]
        suffix = '%' if 'accuracy' in key else ''
        lines.append(f'| {key} | {a["mean"]}{suffix} | {a["std"]}{suffix} | {a["min"]}{suffix} | {a["max"]}{suffix} |')

    lines.append('\n## Performance\n')
    t = summary['timing']
    lines.append(f'- Temps total de traitement : {t["total_process_time"]:.1f}s')
    lines.append(f'- Durée audio totale : {t["total_audio_duration"]:.1f}s')
    lines.append(f'- RTF moyen : {t["mean_rtf"]:.4f}')
    lines.append(f'- Temps moyen par morceau : {t["mean_process_time"]:.3f}s')

    content = '\n'.join(lines) + '\n'
    md_path = os.path.join(output_dir, summary.get('_md_path', os.path.join('..', RESULTS_MD)))
    md_path = os.path.join(output_dir, '..', RESULTS_MD)
    with open(md_path, 'w') as f:
        f.write(content)
    print(f'\n  Results: {md_path}')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    config_path = sys.argv[1] if len(sys.argv) > 1 else 'corpus_config.json'
    if not os.path.isfile(config_path):
        print(f'Config not found: {config_path}')
        return 1

    with open(config_path) as f:
        config = json.load(f)

    params = config['params']
    pieces = config['pieces']

    print(f'Benchmark Corpus — Bass Engine V2.5')
    print(f'Config: {config_path}')
    print(f'Pieces: {len(pieces)}')
    print(f'Params: {params}')
    print()

    all_results = []
    for piece in pieces:
        data, pid, result = run_piece(piece, params)
        if data is not None:
            path = save_individual(data, OUTPUT_DIR)
            print(f'  Saved: {path}')
            all_results.append(data)
        else:
            print(f'  [SKIP] {piece.get("id", "?")}')
        print()

    n_ok = len([r for r in all_results if r is not None])
    print(f'Processed: {n_ok}/{len(pieces)}')

    if n_ok == 0:
        print('No pieces processed. Exiting.')
        return 1

    summary_path = generate_summary(all_results, params, OUTPUT_DIR)
    print(f'Summary: {summary_path}')
    print(f'Done.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
