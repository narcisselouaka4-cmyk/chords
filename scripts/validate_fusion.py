#!/usr/bin/env python3
"""
Validation script for the Fusion Engine.

Runs the fusion pipeline on specified pieces, compares fused output
against ground truth, and reports metrics.

Usage:
  python scripts/validate_fusion.py --dev amazing_grace,autumn_leaves_mix \\
                                    --test ton_nom_est_jehovah \\
                                    --params fusion_params.json

Metrics:
  - NW Accuracy (pitch class alignment via Needleman-Wunsch)
  - Octave error (% of reference segments with wrong octave)
  - Fragmentation (detected segments / reference notes)
  - Execution time / RTF
"""
import sys, os, json, csv, time, subprocess, argparse
import importlib.util
import numpy as np
from typing import List, Optional, Tuple
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_TO_PC = {n: i for i, n in enumerate(NOTE_NAMES)}

# ---------------------------------------------------------------------------
# Load ground truth
# ---------------------------------------------------------------------------

def load_ground_truth_csv(csv_path: str) -> list:
    refs = []
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            refs.append({
                'start': float(row['start_time']),
                'end': float(row['end_time']),
                'midi': int(row['midi_note']),
                'note': f'{NOTE_NAMES[int(row["midi_note"]) % 12]}{int(row["midi_note"]) // 12 - 1}',
            })
    return refs


def load_ground_truth_json(gt_path: str) -> list:
    with open(gt_path) as f:
        data = json.load(f)
    refs = []
    chords = data.get('chords_in_order', data.get('chords', []))
    if isinstance(chords, list):
        if chords and isinstance(chords[0], str):
            # chords_in_order format: just chord strings, estimate timing from BPM
            bpm = data.get('bpm', 65)
            beats_per_chord = 2
            sec_per_chord = beats_per_chord * 60.0 / bpm
            for i, chord_str in enumerate(chords):
                refs.append({
                    'start': i * sec_per_chord,
                    'end': (i + 1) * sec_per_chord,
                    'midi': chord_to_bass_midi(chord_str),
                    'note': chord_str,
                })
    return refs


def chord_to_bass_midi(chord_str: str) -> int:
    """Extract bass note MIDI from chord name, defaulting to A2=45."""
    root_lookup = {
        'C': 36, 'C#': 37, 'Db': 37, 'D': 38, 'D#': 39, 'Eb': 39,
        'E': 40, 'F': 41, 'F#': 42, 'Gb': 42, 'G': 43, 'G#': 44,
        'Ab': 44, 'A': 45, 'A#': 46, 'Bb': 46, 'B': 47,
    }
    if not chord_str:
        return 45
    parts = chord_str.split('/')
    root_part = parts[-1].strip()
    for length in [2, 1]:
        candidate = root_part[:length]
        if candidate in root_lookup:
            return root_lookup[candidate]
    return 45


def load_amazing_grace_gt() -> list:
    """Load Amazing Grace ground truth, extracting bass notes from chord names."""
    json_path = os.path.join(PROJECT_DIR, 'tests/references/amazing_grace_gospel_piano.json')
    return load_ground_truth_json(json_path)


def format_gt_for_piece(piece_name: str) -> list:
    """Return list of {start, end, midi} for the given piece."""
    if piece_name == 'amazing_grace':
        return load_amazing_grace_gt()
    elif piece_name == 'ton_nom_est_jehovah':
        csv_path = os.path.join(PROJECT_DIR, 'data/real/ton_nom_est_jehovah_ground_truth.csv')
        return load_ground_truth_csv(csv_path)
    elif piece_name == 'autumn_leaves_mix':
        csv_path = os.path.join(PROJECT_DIR, 'data/autumn_leaves/autumn_leaves_ground_truth.csv')
        return load_ground_truth_csv(csv_path)
    elif piece_name == 'autumn_leaves_bass_only':
        csv_path = os.path.join(PROJECT_DIR, 'data/autumn_leaves/autumn_leaves_ground_truth.csv')
        return load_ground_truth_csv(csv_path)
    else:
        return []


# ---------------------------------------------------------------------------
# NW alignment (simplified, same logic as bass-detector.py)
# ---------------------------------------------------------------------------

def needleman_wunsch(ref: List[int], det: List[int],
                     match_score: int = 1, gap_penalty: int = -1,
                     mismatch_penalty: int = -1) -> dict:
    n, m = len(ref), len(det)
    dp = np.zeros((n + 1, m + 1), dtype=int)
    for i in range(1, n + 1):
        dp[i, 0] = dp[i - 1, 0] + gap_penalty
    for j in range(1, m + 1):
        dp[0, j] = dp[0, j - 1] + gap_penalty
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            match = dp[i - 1, j - 1] + (match_score if ref[i - 1] == det[j - 1] else mismatch_penalty)
            delete = dp[i - 1, j] + gap_penalty
            insert = dp[i, j - 1] + gap_penalty
            dp[i, j] = max(match, delete, insert)
    # Backtrack
    al_ref, al_det = [], []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and dp[i, j] == dp[i - 1, j - 1] + (match_score if ref[i - 1] == det[j - 1] else mismatch_penalty):
            al_ref.append(ref[i - 1])
            al_det.append(det[j - 1])
            i -= 1
            j -= 1
        elif i > 0 and dp[i, j] == dp[i - 1, j] + gap_penalty:
            al_ref.append(ref[i - 1])
            al_det.append(None)
            i -= 1
        else:
            al_ref.append(None)
            al_det.append(det[j - 1])
            j -= 1
    al_ref.reverse()
    al_det.reverse()
    return {'alignRef': al_ref, 'alignDet': al_det, 'score': int(dp[n, m])}


def compute_nw_accuracy(det_midis: List[int], ref_midis: List[int]) -> Tuple[float, int, int, int]:
    """Compute NW pitch-class accuracy."""
    ref_pc = [m % 12 for m in ref_midis]
    det_pc = [m % 12 for m in det_midis]
    alignment = needleman_wunsch(ref_pc, det_pc)
    al_ref = alignment['alignRef']
    al_det = alignment['alignDet']
    total = sum(1 for r in al_ref if r is not None)
    matches = sum(1 for r, d in zip(al_ref, al_det) if r is not None and d is not None and r == d)
    accuracy = (matches / total * 100) if total > 0 else 0.0
    return round(accuracy, 1), matches, total, alignment['score']


# ---------------------------------------------------------------------------
# Octave error
# ---------------------------------------------------------------------------

def compute_octave_error(det_segments: List[dict], refs: List[dict]) -> Tuple[float, int, int]:
    """Compare dominant detected octave vs reference octave for each ref note."""
    errors = 0
    total = 0
    for ref in refs:
        ref_start = ref['start']
        ref_end = ref['end']
        ref_midi = ref['midi']
        ref_octave = ref_midi // 12 - 1
        ref_pc = ref_midi % 12

        # Find overlapping detected segments
        overlapping = [
            s for s in det_segments
            if s['startTime'] < ref_end and s['endTime'] > ref_start
        ]
        if not overlapping:
            continue

        # Find dominant detected octave for matching pitch class
        octave_counts = defaultdict(float)
        for s in overlapping:
            if s['midi'] % 12 == ref_pc:
                oct_ = s['midi'] // 12 - 1
                octave_counts[oct_] += s['endTime'] - s['startTime']

        if not octave_counts:
            # No matching pitch class at all
            errors += 1
            total += 1
            continue

        dominant_octave = max(octave_counts, key=octave_counts.get)
        if dominant_octave != ref_octave:
            errors += 1
        total += 1

    rate = (errors / total * 100) if total > 0 else 0.0
    return round(rate, 1), errors, total


# ---------------------------------------------------------------------------
# Fragmentation
# ---------------------------------------------------------------------------

def compute_fragmentation(det_segments: List[dict], refs: List[dict]) -> float:
    if not refs:
        return 0.0
    return round(len(det_segments) / len(refs), 2)


# ---------------------------------------------------------------------------
# Fusion runner
# ---------------------------------------------------------------------------

def ensure_candidates(piece_name: str, piece_config: dict) -> str:
    """Generate candidates JSON if needed."""
    candidates_path = os.path.join(
        PROJECT_DIR, 'benchmark_outputs', f'candidates_{piece_name}.json')
    if os.path.isfile(candidates_path):
        return candidates_path

    wav_path = piece_config['audio']
    if not os.path.isfile(wav_path):
        print(f'  [WARN] Audio not found: {wav_path}')
        return None

    log(f'Generating candidates for {piece_name}...')
    script = os.path.join(SCRIPT_DIR, 'export_bass_candidates.py')
    result = subprocess.run(
        [sys.executable, script, '--wav', wav_path, '--output', candidates_path],
        capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f'  [ERROR] Candidate export failed: {result.stderr}')
        return None
    return candidates_path


def ensure_chords(piece_name: str, piece_config: dict) -> str:
    """Generate chords JSON if needed."""
    chords_path = os.path.join(
        PROJECT_DIR, 'benchmark_outputs', f'chords_{piece_name}.json')
    if os.path.isfile(chords_path):
        return chords_path

    wav_path = piece_config['audio']
    if not os.path.isfile(wav_path):
        print(f'  [WARN] Audio not found: {wav_path}')
        return None

    log(f'Generating chords for {piece_name}...')
    script = os.path.join(PROJECT_DIR, 'electron/audio-processor.py')
    result = subprocess.run(
        [sys.executable, script, 'analyze-chords', wav_path, 'grid_norm'],
        capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        print(f'  [ERROR] Chord analysis failed: {result.stderr}')
        return None
    # Write JSON
    for line in result.stdout.split('\n'):
        line = line.strip()
        if line.startswith('{'):
            with open(chords_path, 'w') as f:
                f.write(line)
            break
    return chords_path


def run_fusion(piece_name: str, candidates_path: str, chords_path: str,
               params_path: str) -> Tuple[Optional[List[dict]], Optional[dict], float]:
    """Run the fusion engine and return segments + trace + execution time."""
    script = os.path.join(SCRIPT_DIR, 'fusion_bass_chord.py')
    seg_path = os.path.join(
        PROJECT_DIR, 'benchmark_outputs', f'fusion_segments_{piece_name}.json')
    trace_path = os.path.join(
        PROJECT_DIR, 'benchmark_outputs', f'fusion_trace_{piece_name}.json')

    t0 = time.time()
    result = subprocess.run(
        [sys.executable, script,
         '--candidates', candidates_path,
         '--chords', chords_path,
         '--params', params_path,
         '--output-segments', seg_path,
         '--output-trace', trace_path],
        capture_output=True, text=True, timeout=300)
    t1 = time.time()
    elapsed = t1 - t0

    if result.returncode != 0:
        print(f'  [ERROR] Fusion failed: {result.stderr}')
        return None, None, elapsed

    with open(seg_path) as f:
        seg_data = json.load(f)
    with open(trace_path) as f:
        trace_data = json.load(f)

    return seg_data['segments'], trace_data, elapsed


def evaluate_piece(piece_name: str, piece_config: dict,
                   candidates_path: str, chords_path: str,
                   params_path: str, refs: list) -> dict:
    """Run fusion and compute metrics for one piece."""
    # Get baseline metrics from summary.json if available
    baseline = get_baseline_metrics(piece_name)

    # Run fusion
    segments, trace, elapsed = run_fusion(
        piece_name, candidates_path, chords_path, params_path)
    if segments is None:
        return {'piece': piece_name, 'error': 'fusion failed'}

    # Compute metrics
    det_midis = [s['midi'] for s in segments]
    ref_midis = [r['midi'] for r in refs]

    nw_acc, nw_matches, nw_total, align_score = compute_nw_accuracy(det_midis, ref_midis)
    oct_err, oct_err_count, oct_total = compute_octave_error(segments, refs)
    frag = compute_fragmentation(segments, refs)

    virtual_pct = trace.get('virtual_pct', 0.0) if trace else 0.0
    n_virtual = trace.get('n_virtual_selected', 0) if trace else 0

    source_metrics = {'be_pct': 0.0, 'virtual_pct': 0.0, 'virtual_by_octave': {}}
    if trace and 'frames' in trace:
        frames_data = trace['frames']
        non_silent = [f for f in frames_data if not f.get('silent')]
        n_total = len(non_silent) if non_silent else 1
        n_be = sum(1 for f in non_silent if f.get('selected_source') == 'bass_engine')
        n_virt = sum(1 for f in non_silent if f.get('selected_is_virtual'))
        source_metrics['be_pct'] = round(n_be / n_total * 100, 1)
        source_metrics['virtual_pct'] = round(n_virt / n_total * 100, 1)
        octave_counts = {}
        for f in non_silent:
            if f.get('selected_is_virtual'):
                best = next((c for c in f.get('candidates', []) if c.get('selected')), None)
                if best:
                    oct_ = best.get('octave', '?')
                    octave_counts[oct_] = octave_counts.get(oct_, 0) + 1
        source_metrics['virtual_by_octave'] = {str(k): v for k, v in sorted(octave_counts.items())}

    result = {
        'piece': piece_name,
        'style': piece_config.get('style', ''),
        'n_ref_notes': len(refs),
        'n_det_segments': len(segments),
        'n_virtual_selected': n_virtual,
        'virtual_pct': virtual_pct,
        'source_metrics': source_metrics,
        'execution_time_s': round(elapsed, 3),
        'metrics': {
            'nw_accuracy': nw_acc,
            'nw_matches': nw_matches,
            'nw_total': nw_total,
            'alignment_score': align_score,
            'octave_error_pct': oct_err,
            'octave_error_count': oct_err_count,
            'octave_total': oct_total,
            'fragmentation': frag,
        },
        'baseline': baseline,
    }
    return result


def get_baseline_metrics(piece_name: str) -> Optional[dict]:
    """Retrieve baseline BE V2.5 metrics from existing benchmark outputs."""
    summary_path = os.path.join(PROJECT_DIR, 'benchmark_outputs', 'summary.json')
    if not os.path.isfile(summary_path):
        return None
    with open(summary_path) as f:
        summary = json.load(f)
    for r in summary.get('results', []):
        if r['id'] == piece_name and r.get('metrics'):
            m = r['metrics']
            return {
                'nw_accuracy': m.get('bass_accuracy'),
                'fragmentation': m.get('fragmentation'),
                'n_segments': m.get('det_segments'),
            }
    return None


# ---------------------------------------------------------------------------
# Report printing
# ---------------------------------------------------------------------------

def print_report(results: List[dict], label: str = 'dev'):
    print()
    print('=' * 72)
    print(f'  VALIDATION FUSION — {label}')
    print('=' * 72)
    print()
    print(f'  {"Piece":>24s} | {"NW Acc":>6s} | {"Octave Err":>10s} | {"Virt%":>6s} | {"Fragm":>6s} | {"Segm":>5s} | {"Time":>7s}')
    print(f'  {"-"*24} | {"-"*6} | {"-"*10} | {"-"*6} | {"-"*6} | {"-"*5} | {"-"*7}')

    agg_nw, agg_oct, agg_frag, agg_virt = [], [], [], []
    for r in results:
        if 'error' in r:
            print(f'  {r["piece"]:>24s} | ERROR: {r["error"]}')
            continue
        m = r['metrics']
        baseline_str = ''
        bl = r.get('baseline')
        if bl and bl.get('nw_accuracy') is not None:
            baseline_str = f' (BE: {bl["nw_accuracy"]}%)'
        print(f'  {r["piece"]:>24s} | {m["nw_accuracy"]:>5.1f}%{baseline_str:>12s} | '
              f'{m["octave_error_pct"]:>8.1f}%  | {r["virtual_pct"]:>5.1f}% | '
              f'{m["fragmentation"]:>5.2f}  | '
              f'{r["n_det_segments"]:>5d} | {r["execution_time_s"]:>5.1f}s')
        agg_nw.append(m['nw_accuracy'])
        agg_oct.append(m['octave_error_pct'])
        agg_frag.append(m['fragmentation'])
        agg_virt.append(r['virtual_pct'])

    if agg_nw:
        print()
        print(f'  Moyenne NW Accuracy   : {np.mean(agg_nw):.1f}%')
        print(f'  Moyenne Octave Error  : {np.mean(agg_oct):.1f}%')
        print(f'  Moyenne Virtual       : {np.mean(agg_virt):.1f}%')
        print(f'  Moyenne Fragmentation : {np.mean(agg_frag):.2f}')

    print()

    print()
    print('  --- SOURCE METRICS (per-frame) ---')
    print(f'  {"Piece":>24s} | {"BE%":>5s} | {"Virt%":>6s} | {"Virt by Octave":>20s}')
    print(f'  {"-"*24} | {"-"*5} | {"-"*6} | {"-"*20}')
    for r in results:
        if 'error' in r:
            continue
        sm = r.get('source_metrics', {})
        virt_by_oct = sm.get('virtual_by_octave', {})
        oct_keys = sorted(virt_by_oct.keys(), key=lambda x: int(x) if x != '?' else 99)
        oct_labels = ' '.join(f'{k}:' for k in oct_keys)
        oct_counts = ' '.join(f'{virt_by_oct[k]}' for k in oct_keys)
        if virt_by_oct:
            oct_display = f'[{oct_labels} {oct_counts}]'
        else:
            oct_display = 'N/A'
        print(f'  {r["piece"]:>24s} | {sm.get("be_pct",0):>4.1f}% | {sm.get("virtual_pct",0):>5.1f}% | {oct_display:>20s}')
    print()


def print_comparison(all_results: dict):
    """Print before/after comparison table."""
    print()
    print('=' * 72)
    print('  COMPARAISON AVANT/APRÈS FUSION')
    print('=' * 72)
    print()
    print(f'  {"Piece":>24s} | {"BE NW":>7s} | {"Fusion NW":>10s} | {"BE Fragm":>9s} | {"Fusion Fragm":>12s}')
    print(f'  {"-"*24} | {"-"*7} | {"-"*10} | {"-"*9} | {"-"*12}')

    for label, results in all_results.items():
        print(f'\n  [{label}]')
        for r in results:
            if 'error' in r:
                continue
            m = r['metrics']
            bl = r.get('baseline')
            bl_nw = bl['nw_accuracy'] if bl and bl.get('nw_accuracy') is not None else None
            bl_frag = bl['fragmentation'] if bl and bl.get('fragmentation') is not None else None
            fusion_nw = m['nw_accuracy']
            fusion_frag = m['fragmentation']

            nw_delta = f'({fusion_nw - bl_nw:+.1f})' if bl_nw else ''
            frag_delta = f'({fusion_frag - bl_frag:+.2f})' if bl_frag else ''

            bl_nw_str = f'{bl_nw:.1f}%' if bl_nw else 'N/A'
            bl_frag_str = f'{bl_frag:.2f}' if bl_frag else 'N/A'

            print(f'  {r["piece"]:>24s} | {bl_nw_str:>7s} | {fusion_nw:>5.1f}% {nw_delta:>8s} | '
                  f'{bl_frag_str:>9s} | {fusion_frag:>5.2f} {frag_delta:>8s}')
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def log(msg):
    print(f'[ValidateFusion] {msg}', file=sys.stderr, flush=True)


def resolve_piece_config(piece_name: str) -> Optional[dict]:
    """Resolve piece config from corpus_config.json."""
    config_path = os.path.join(PROJECT_DIR, 'corpus_config.json')
    with open(config_path) as f:
        config = json.load(f)
    for p in config.get('pieces', []):
        if p['id'] == piece_name:
            # Resolve relative paths
            audio = p['audio']
            if not os.path.isabs(audio):
                audio = os.path.join(PROJECT_DIR, audio)
            return {**p, 'audio': audio}
    return None


def main():
    parser = argparse.ArgumentParser(
        description='Validate Fusion Engine against ground truth')
    parser.add_argument('--dev', default='',
                        help='Comma-separated piece IDs for dev (parameter tuning)')
    parser.add_argument('--test', default='',
                        help='Comma-separated piece IDs for test (final validation)')
    parser.add_argument('--params', default=None,
                        help='Fusion params JSON path')
    parser.add_argument('--output', default=None,
                        help='Validation report output path')
    args = parser.parse_args()

    if args.params is None:
        args.params = os.path.join(PROJECT_DIR, 'fusion_params.json')
    if args.output is None:
        args.output = os.path.join(
            PROJECT_DIR, 'benchmark_outputs', 'fusion_validation_report.json')

    # Parse piece lists
    dev_pieces = [p.strip() for p in args.dev.split(',') if p.strip()]
    test_pieces = [p.strip() for p in args.test.split(',') if p.strip()]

    if not dev_pieces and not test_pieces:
        print('[ERROR] Specify at least --dev or --test pieces')
        return 1

    all_results = {}
    report = {}

    for label, pieces in [('dev', dev_pieces), ('test', test_pieces)]:
        if not pieces:
            continue
        results = []
        for piece_name in pieces:
            log(f'Processing {piece_name} [{label}]...')
            config = resolve_piece_config(piece_name)
            if config is None:
                print(f'  [WARN] Unknown piece: {piece_name}')
                continue

            # Get ground truth
            refs = format_gt_for_piece(piece_name)
            if not refs:
                print(f'  [WARN] No ground truth for {piece_name}')
                continue
            log(f'  Loaded {len(refs)} reference notes')

            # Ensure candidates and chords
            cand_path = ensure_candidates(piece_name, config)
            if cand_path is None:
                continue
            chord_path = ensure_chords(piece_name, config)
            if chord_path is None:
                continue

            # Run fusion
            r = evaluate_piece(piece_name, config, cand_path, chord_path,
                               args.params, refs)
            results.append(r)

        all_results[label] = results
        print_report(results, label)

    print_comparison(all_results)

    # Build report JSON
    report['params'] = args.params
    report['dev'] = dev_pieces
    report['test'] = test_pieces
    report['results'] = all_results

    # Aggregate
    for label in all_results:
        vals = [r['metrics'] for r in all_results[label] if 'metrics' in r]
        if vals:
            report[f'{label}_summary'] = {
                'mean_nw_accuracy': round(np.mean([v['nw_accuracy'] for v in vals]), 1),
                'mean_octave_error': round(np.mean([v['octave_error_pct'] for v in vals]), 1),
                'mean_virtual_pct': round(np.mean([r['virtual_pct'] for r in results if 'metrics' in r]), 1),
                'mean_fragmentation': round(np.mean([v['fragmentation'] for v in vals]), 2),
            }

    with open(args.output, 'w') as f:
        json.dump(report, f, indent=2)
    log(f'Report written to {args.output}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
