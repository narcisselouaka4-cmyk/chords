#!/usr/bin/env python3
"""
Phase 6 Benchmark – complete evaluation of Bass Engine, Fusion Engine,
and Chord Engine baseline across an extended corpus.

Usage:
  python scripts/benchmark_phase6.py --corpus data/benchmark/corpus_config_phase6.json
                                     [--output-dir benchmark_outputs/phase6]
                                     [--no-graphs]
"""
import sys, os, json, csv, time, argparse, subprocess
import numpy as np
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

HAS_MPL = False
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MPL = True
except ImportError:
    pass

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

PIPELINES = ['be_only', 'fusion_no_vr', 'fusion_vr', 'chord_baseline']

PIECES_WITH_GROUND_TRUTH = [
    'amazing_grace', 'autumn_leaves_bass_only', 'autumn_leaves_mix',
    'ton_nom_est_jehovah',
    'note_C2', 'note_E2', 'note_Fs2', 'note_G2', 'note_A2', 'note_B2',
    'note_harm_C2', 'note_harm_E2', 'note_harm_G2', 'note_harm_B2',
    'chord_C', 'chord_G', 'chord_Dm',
    'slash_C_E', 'slash_G_B', 'slash_D_Fs', 'slash_Am7_G',
    'walking_bass',
    'jazz_Cmaj9', 'jazz_Dm7_G', 'jazz_G13',
]

NOTE_TO_MIDI = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
}


def note_str_to_midi(note_str):
    pc = NOTE_TO_MIDI.get(note_str[0].upper(), 0)
    for ch in note_str[1:-1]:
        if ch == '#': pc += 1
        elif ch == 'b': pc -= 1
    octave = int(note_str[-1])
    return (octave + 1) * 12 + (pc % 12)


def log(msg):
    print(f'[Phase6] {msg}', file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Running pipelines
# ---------------------------------------------------------------------------

def run_be_only(audio_path, candidates_path, output_segments):
    """Run Bass Engine alone via export_bass_candidates + extract winner."""
    log(f'  Running Bass Engine only...')
    t0 = time.time()
    subprocess.run(
        [sys.executable, os.path.join(SCRIPT_DIR, 'export_bass_candidates.py'),
         '--wav', audio_path, '--output', candidates_path],
        capture_output=True, text=True, timeout=300)
    with open(candidates_path) as f:
        data = json.load(f)
    frames = data['frames']
    sr = data.get('params', {}).get('sr', 22050)
    hop = data.get('params', {}).get('hop_length', 512)
    frame_dur = hop / sr

    smoothing = 2
    min_dur = 0.15

    # Extract selected MIDI per frame (winner = candidate with best score)
    selected = []
    for f in frames:
        if f.get('silent') or not f.get('candidates'):
            selected.append(None)
        else:
            best = max(f['candidates'], key=lambda c: c.get('score', 0))
            selected.append(best['midi'])

    # Mode smoothing
    midi_arr = np.array([m if m is not None else -1 for m in selected], dtype=int)
    smoothed = midi_arr.copy()
    for i in range(len(selected)):
        lo = max(0, i - smoothing)
        hi = min(len(selected), i + smoothing + 1)
        window = midi_arr[lo:hi]
        valid = window[window >= 0]
        if len(valid) > 0:
            counts = np.bincount(valid)
            smoothed[i] = np.argmax(counts)

    # Segment
    segments = []
    seg_start = None
    seg_midi = None
    for i in range(len(frames)):
        curr = int(smoothed[i]) if smoothed[i] >= 0 else None
        t = frames[i]['time']
        if curr is not None:
            if seg_midi is None:
                seg_start = t
                seg_midi = curr
            elif curr != seg_midi:
                dur = t - seg_start
                if dur >= min_dur:
                    segments.append({
                        'startTime': round(seg_start, 4),
                        'endTime': round(t, 4),
                        'midi': seg_midi,
                        'note': f'{NOTE_NAMES[seg_midi % 12]}{seg_midi // 12 - 1}',
                    })
                seg_start = t
                seg_midi = curr
        else:
            if seg_midi is not None:
                dur = t - seg_start
                if dur >= min_dur:
                    segments.append({
                        'startTime': round(seg_start, 4),
                        'endTime': round(t, 4),
                        'midi': seg_midi,
                        'note': f'{NOTE_NAMES[seg_midi % 12]}{seg_midi // 12 - 1}',
                    })
                seg_midi = None

    if seg_midi is not None:
        t = frames[-1]['time'] + frame_dur
        dur = t - seg_start
        if dur >= min_dur:
            segments.append({
                'startTime': round(seg_start, 4),
                'endTime': round(t, 4),
                'midi': seg_midi,
                'note': f'{NOTE_NAMES[seg_midi % 12]}{seg_midi // 12 - 1}',
            })

    with open(output_segments, 'w') as f:
        json.dump(segments, f, indent=2)
    elapsed = time.time() - t0
    log(f'  Done: {len(segments)} segments in {elapsed:.1f}s')
    return segments, candidates_path, elapsed


def run_fusion(candidates_path, chords_path, output_segments, output_trace, params_path):
    log(f'  Running Fusion Engine...')
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, os.path.join(SCRIPT_DIR, 'fusion_bass_chord.py'),
         '--candidates', candidates_path,
         '--chords', chords_path,
         '--params', params_path,
         '--output-segments', output_segments,
         '--output-trace', output_trace],
        capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        log(f'  Fusion failed: {result.stderr[:200]}')
        return None, None, time.time() - t0
    with open(output_segments) as f:
        seg_data = json.load(f)
    with open(output_trace) as f:
        trace_data = json.load(f)
    elapsed = time.time() - t0
    log(f'  Done: {len(seg_data.get("segments",[]))} segments in {elapsed:.1f}s')
    return seg_data.get('segments', []), trace_data, elapsed


def run_chord_baseline(chords_path, output_segments):
    """Chord baseline: extract root note from chord name as bass."""
    log(f'  Computing chord baseline...')
    try:
        with open(chords_path) as f:
            content = f.read()
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                data = json.loads(line)
                break
        else:
            data = json.loads(content)
    except Exception as e:
        log(f'  Chord loading failed: {e}')
        return [], 0

    root_lookup = {
        'C': 36, 'C#': 37, 'Db': 37, 'D': 38, 'D#': 39, 'Eb': 39,
        'E': 40, 'F': 41, 'F#': 42, 'Gb': 42, 'G': 43, 'G#': 44,
        'Ab': 44, 'A': 45, 'A#': 46, 'Bb': 46, 'B': 47,
    }

    segments = []
    chords_data = data.get('chords', [])
    for c in chords_data:
        chord_name = c.get('structural_chord') or c.get('chord') or ''
        if not chord_name:
            continue
        parts = chord_name.split('/')
        root_part = parts[0].strip()
        slash_part = parts[-1].strip() if '/' in chord_name else None
        # Prefer slash bass if exists
        bass_part = slash_part or root_part
        midi = None
        for length in [2, 1]:
            candidate = bass_part[:length]
            if candidate in root_lookup:
                midi = root_lookup[candidate]
                break
        if midi is None:
            midi = 45
        segments.append({
            'startTime': c.get('startTime', 0),
            'endTime': c.get('endTime', 0),
            'midi': midi,
            'note': f'{NOTE_NAMES[midi % 12]}{midi // 12 - 1}',
        })

    with open(output_segments, 'w') as f:
        json.dump(segments, f, indent=2)
    return segments, len(segments)


# ---------------------------------------------------------------------------
# Error classification (inline, mirrors benchmark_error_classifier)
# ---------------------------------------------------------------------------

def classify_errors(refs, segments):
    ref_midis = [r['midi'] for r in refs]
    det_midis = [s['midi'] for s in segments]
    ref_pc = [m % 12 for m in ref_midis]
    det_pc = [m % 12 for m in det_midis]

    n, m = len(ref_pc), len(det_pc)
    dp = np.zeros((n + 1, m + 1), dtype=int)
    for i in range(1, n + 1): dp[i, 0] = dp[i - 1, 0] - 1
    for j in range(1, m + 1): dp[0, j] = dp[0, j - 1] - 1
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            score = 1 if ref_pc[i - 1] == det_pc[j - 1] else -1
            dp[i, j] = max(dp[i - 1, j - 1] + score, dp[i - 1, j] - 1, dp[i, j - 1] - 1)

    al_ref, al_det = [], []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and dp[i, j] == dp[i - 1, j - 1] + (1 if ref_pc[i - 1] == det_pc[j - 1] else -1):
            al_ref.append(ref_pc[i - 1])
            al_det.append(det_pc[j - 1])
            i -= 1; j -= 1
        elif i > 0 and dp[i, j] == dp[i - 1, j] - 1:
            al_ref.append(ref_pc[i - 1])
            al_det.append(None)
            i -= 1
        else:
            al_ref.append(None)
            al_det.append(det_pc[j - 1])
            j -= 1
    al_ref.reverse()
    al_det.reverse()

    classes = defaultdict(int)
    ref_idx = 0
    det_idx = 0
    pc_errors = 0
    oct_errors = 0
    total = 0
    correct = 0

    for r, d in zip(al_ref, al_det):
        if r is not None:
            total += 1
            ref_note = refs[ref_idx]
            ref_midi = ref_note['midi']
            ref_oct = ref_midi // 12 - 1
            ref_idx += 1

            if d is None:
                classes['bass_missing'] += 1
                continue

            det_midi = det_midis[det_idx] if det_idx < len(det_midis) else None
            det_idx += 1
            if det_midi is None:
                classes['bass_missing'] += 1
                continue

            if r != d:
                pc_errors += 1
                classes['pitch_class_wrong'] += 1
            else:
                det_oct = det_midi // 12 - 1
                if ref_oct != det_oct:
                    oct_errors += 1
                    classes['octave_wrong'] += 1
                else:
                    correct += 1

    frag_ratio = round(len(segments) / len(refs), 2) if refs else 0
    if frag_ratio > 2.5:
        classes['fragmentation_excessive'] = 1

    nw_acc = round(correct / total * 100, 1) if total > 0 else 0.0
    oct_err = round(oct_errors / total * 100, 1) if total > 0 else 0.0

    return {
        'nw_accuracy': nw_acc,
        'octave_error_rate': oct_err,
        'fragmentation': frag_ratio,
        'n_correct': correct,
        'n_pc_errors': pc_errors,
        'n_oct_errors': oct_errors,
        'n_total': total,
        'n_det_segments': len(segments),
        'error_classes': dict(classes),
    }


# ---------------------------------------------------------------------------
# Main benchmark
# ---------------------------------------------------------------------------

def run_pipeline(piece_id, config, output_dir, params_path):
    """Run all pipelines for one piece, return results dict."""
    audio_path = config['audio']
    refs = config.get('ground_truth_data', [])
    if not refs:
        log(f'  {piece_id}: no ground truth, skipping')
        return None

    chords_path = os.path.join(PROJECT_DIR, 'benchmark_outputs', f'chords_{piece_id}.json')
    if not os.path.isfile(chords_path):
        log(f'  {piece_id}: no chords file at {chords_path}')
        return None

    cand_path = os.path.join(output_dir, f'{piece_id}_candidates.json')
    seg_be = os.path.join(output_dir, f'{piece_id}_be.json')
    seg_fusion_novr = os.path.join(output_dir, f'{piece_id}_fusion_novr.json')
    seg_fusion_vr = os.path.join(output_dir, f'{piece_id}_fusion_vr.json')
    trace_fusion_vr = os.path.join(output_dir, f'{piece_id}_fusion_vr_trace.json')
    seg_chord = os.path.join(output_dir, f'{piece_id}_chord_baseline.json')

    results = {'piece': piece_id, 'style': config.get('style', '')}

    # 1. Bass Engine only
    segments, _, elapsed = run_be_only(audio_path, cand_path, seg_be)
    results['be_only'] = classify_errors(refs, segments)
    results['be_only']['time_s'] = round(elapsed, 2)

    # 2. Fusion without Virtual Root
    log(f'  Running Fusion without VR...')
    params_novr = params_path.replace('.json', '_novr.json')
    if not os.path.isfile(params_novr):
        with open(params_path) as f:
            p = json.load(f)
        p['virtual_root'] = {'enabled': False}
        with open(params_novr, 'w') as f:
            json.dump(p, f, indent=2)
    segments, _, elapsed = run_fusion(cand_path, chords_path, seg_fusion_novr, seg_fusion_novr.replace('.json', '_trace.json'), params_novr)
    if segments is not None:
        results['fusion_no_vr'] = classify_errors(refs, segments)
        results['fusion_no_vr']['time_s'] = round(elapsed, 2)
    else:
        results['fusion_no_vr'] = {'error': 'fusion failed'}

    # 3. Fusion with Virtual Root
    segments, trace, elapsed = run_fusion(cand_path, chords_path, seg_fusion_vr, trace_fusion_vr, params_path)
    if segments is not None:
        results['fusion_vr'] = classify_errors(refs, segments)
        results['fusion_vr']['time_s'] = round(elapsed, 2)
        results['fusion_vr']['n_virtual'] = trace.get('n_virtual_selected', 0) if trace else 0
        results['fusion_vr']['virtual_pct'] = trace.get('virtual_pct', 0.0) if trace else 0.0
    else:
        results['fusion_vr'] = {'error': 'fusion failed'}

    # 4. Chord baseline
    segments, _ = run_chord_baseline(chords_path, seg_chord)
    results['chord_baseline'] = classify_errors(refs, segments)
    results['chord_baseline']['time_s'] = 0

    return results


def generate_graphs(all_results, output_dir):
    if not HAS_MPL:
        log('matplotlib not available, skipping graphs')
        return

    log('Generating graphs...')
    pieces = [r['piece'] for r in all_results if r]

    n = len(pieces)
    if n == 0:
        return

    # NW Accuracy comparison
    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(n)
    width = 0.2
    for i, pipe in enumerate(PIPELINES):
        vals = []
        for r in all_results:
            if r and pipe in r and isinstance(r[pipe], dict) and 'nw_accuracy' in r[pipe]:
                vals.append(r[pipe]['nw_accuracy'])
            else:
                vals.append(0)
        ax.bar(x + i * width, vals, width, label=pipe)
    ax.set_xlabel('Piece')
    ax.set_ylabel('NW Accuracy (%)')
    ax.set_title('Phase 6 — NW Accuracy by Pipeline')
    ax.set_xticks(x + width * 1.5)
    ax.set_xticklabels(pieces, rotation=45, ha='right', fontsize=8)
    ax.legend(fontsize=8)
    plt.tight_layout()
    fig.savefig(os.path.join(output_dir, 'phase6_nw_accuracy.png'), dpi=150)
    plt.close(fig)

    # Octave error
    fig, ax = plt.subplots(figsize=(12, 6))
    for i, pipe in enumerate(PIPELINES):
        vals = []
        for r in all_results:
            if r and pipe in r and isinstance(r[pipe], dict) and 'octave_error_rate' in r[pipe]:
                vals.append(r[pipe]['octave_error_rate'])
            else:
                vals.append(0)
        ax.bar(x + i * width, vals, width, label=pipe)
    ax.set_xlabel('Piece')
    ax.set_ylabel('Octave Error (%)')
    ax.set_title('Phase 6 — Octave Error by Pipeline')
    ax.set_xticks(x + width * 1.5)
    ax.set_xticklabels(pieces, rotation=45, ha='right', fontsize=8)
    ax.legend(fontsize=8)
    plt.tight_layout()
    fig.savefig(os.path.join(output_dir, 'phase6_octave_error.png'), dpi=150)
    plt.close(fig)

    # Fragmentation
    fig, ax = plt.subplots(figsize=(12, 6))
    for i, pipe in enumerate(PIPELINES):
        vals = []
        for r in all_results:
            if r and pipe in r and isinstance(r[pipe], dict) and 'fragmentation' in r[pipe]:
                vals.append(r[pipe]['fragmentation'])
            else:
                vals.append(0)
        ax.bar(x + i * width, vals, width, label=pipe)
    ax.set_xlabel('Piece')
    ax.set_ylabel('Fragmentation')
    ax.set_title('Phase 6 — Fragmentation by Pipeline')
    ax.set_xticks(x + width * 1.5)
    ax.set_xticklabels(pieces, rotation=45, ha='right', fontsize=8)
    ax.legend(fontsize=8)
    plt.tight_layout()
    fig.savefig(os.path.join(output_dir, 'phase6_fragmentation.png'), dpi=150)
    plt.close(fig)

    log(f'Graphs saved to {output_dir}')


def generate_summary_csv(all_results, output_dir):
    path = os.path.join(output_dir, 'phase6_comparison.csv')
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['piece', 'pipeline', 'nw_accuracy', 'octave_error', 'fragmentation',
                         'n_det_segments', 'time_s', 'virtual_pct'])
        for r in all_results:
            if r is None:
                continue
            for pipe in PIPELINES:
                if pipe not in r or isinstance(r[pipe], dict) and 'error' in r[pipe]:
                    continue
                d = r[pipe]
                writer.writerow([
                    r['piece'], pipe,
                    d.get('nw_accuracy', 0),
                    d.get('octave_error_rate', 0),
                    d.get('fragmentation', 0),
                    d.get('n_det_segments', 0),
                    d.get('time_s', 0),
                    d.get('virtual_pct', ''),
                ])
    log(f'CSV written: {path}')
    return path


def generate_summary_json(all_results, output_dir, config):
    summary = {
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'n_pieces': len([r for r in all_results if r]),
        'pipelines': PIPELINES,
        'results': all_results,
        'config': config,
    }
    path = os.path.join(output_dir, 'phase6_summary.json')
    with open(path, 'w') as f:
        json.dump(summary, f, indent=2, default=str)
    log(f'JSON written: {path}')
    return path


def main():
    parser = argparse.ArgumentParser(description='Phase 6 benchmark')
    parser.add_argument('--corpus', required=True, help='Corpus config JSON')
    parser.add_argument('--output-dir', default=None)
    parser.add_argument('--params', default=None, help='Fusion params JSON')
    parser.add_argument('--no-graphs', action='store_true')
    parser.add_argument('--skip-pipelines', default='', help='Comma-separated pipelines to skip')
    args = parser.parse_args()

    if args.output_dir is None:
        args.output_dir = os.path.join(PROJECT_DIR, 'benchmark_outputs', 'phase6')
    os.makedirs(args.output_dir, exist_ok=True)

    if args.params is None:
        args.params = os.path.join(PROJECT_DIR, 'fusion_params.json')
    if not os.path.isfile(args.params):
        log(f'ERROR: params file not found: {args.params}')
        return 1

    skip = [s.strip() for s in args.skip_pipelines.split(',') if s.strip()]

    # Load corpus config
    with open(args.corpus) as f:
        config = json.load(f)

    # Resolve paths and load ground truth
    pieces = config.get('pieces', [])
    for p in pieces:
        audio = p.get('audio', '')
        if not os.path.isabs(audio):
            audio = os.path.join(PROJECT_DIR, audio)
        p['audio'] = audio
        gt = p.get('ground_truth', '')
        if gt:
            if not os.path.isabs(gt):
                gt = os.path.join(PROJECT_DIR, gt)
            if os.path.isfile(gt):
                with open(gt, newline='') as f:
                    reader = csv.DictReader(f)
                    p['ground_truth_data'] = []
                    for row in reader:
                        p['ground_truth_data'].append({
                            'start': float(row['start_time']),
                            'end': float(row['end_time']),
                            'midi': int(row['midi_note']),
                        })
                log(f'{p["id"]}: {len(p["ground_truth_data"])} GT notes loaded')
            else:
                log(f'{p["id"]}: GT file not found: {gt}')

    # Run benchmark
    all_results = []
    for p in pieces:
        log(f'Processing: {p["id"]}')
        result = run_pipeline(p['id'], p, args.output_dir, args.params)
        if result:
            all_results.append(result)

    # Generate outputs
    csv_path = generate_summary_csv(all_results, args.output_dir)
    json_path = generate_summary_json(all_results, args.output_dir, config)

    if not args.no_graphs:
        generate_graphs(all_results, args.output_dir)

    # Print summary table
    print()
    print('=' * 100)
    print('  PHASE 6 — Benchmark Results Summary')
    print('=' * 100)
    print(f'  {"Piece":>24s}', end='')
    for pipe in PIPELINES:
        print(f' | {"NW":>5s} {"Oct":>5s} {"Frag":>5s}', end='')
    print()
    print(f'  {"-"*24}', end='')
    for _ in PIPELINES:
        print(f' | {"-"*5} {"-"*5} {"-"*5}', end='')
    print()

    for r in all_results:
        if r is None:
            continue
        print(f'  {r["piece"]:>24s}', end='')
        for pipe in PIPELINES:
            d = r.get(pipe, {})
            if isinstance(d, dict) and 'error' in d:
                print(f' | {"ERR":>5s} {"":>5s} {"":>5s}', end='')
            elif isinstance(d, dict):
                nw = d.get('nw_accuracy', 0)
                oc = d.get('octave_error_rate', 0)
                fr = d.get('fragmentation', 0)
                print(f' | {nw:>5.1f} {oc:>5.1f} {fr:>5.2f}', end='')
            else:
                print(f' | {"SKIP":>5s} {"":>5s} {"":>5s}', end='')
        print()

    # Averages
    print()
    for pipe in PIPELINES:
        nw_vals = [r[pipe]['nw_accuracy'] for r in all_results if r and pipe in r and isinstance(r[pipe], dict) and 'nw_accuracy' in r[pipe]]
        oc_vals = [r[pipe]['octave_error_rate'] for r in all_results if r and pipe in r and isinstance(r[pipe], dict) and 'octave_error_rate' in r[pipe]]
        fr_vals = [r[pipe]['fragmentation'] for r in all_results if r and pipe in r and isinstance(r[pipe], dict) and 'fragmentation' in r[pipe]]
        if nw_vals:
            print(f'  Average {pipe:>20s}: NW={np.mean(nw_vals):.1f}%  Oct={np.mean(oc_vals):.1f}%  Frag={np.mean(fr_vals):.2f}')
    print()

    log(f'All outputs in: {args.output_dir}')
    log(f'CSV: {csv_path}')
    log(f'JSON: {json_path}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
