#!/usr/bin/env python3
"""Classify bass detection errors by category for a single piece.

Usage:
  python scripts/benchmark_error_classifier.py --ref <ground_truth.csv> --det <segments.json> [--output <out.json>]
"""
import sys, os, json, csv, argparse
import numpy as np
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def load_ground_truth(csv_path):
    refs = []
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            refs.append({
                'start': float(row['start_time']),
                'end': float(row['end_time']),
                'midi': int(row['midi_note']),
            })
    return refs


def load_segments(seg_path):
    with open(seg_path) as f:
        data = json.load(f)
    return data.get('segments', data) if isinstance(data, dict) else data


def load_trace(trace_path):
    with open(trace_path) as f:
        return json.load(f)


def needleman_wunsch_pc(ref, det, match=1, gap=-1, mismatch=-1):
    n, m = len(ref), len(det)
    dp = np.zeros((n + 1, m + 1), dtype=int)
    for i in range(1, n + 1):
        dp[i, 0] = dp[i - 1, 0] + gap
    for j in range(1, m + 1):
        dp[0, j] = dp[0, j - 1] + gap
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            score = match if ref[i - 1] == det[j - 1] else mismatch
            dp[i, j] = max(dp[i - 1, j - 1] + score, dp[i - 1, j] + gap, dp[i, j - 1] + gap)
    al_ref, al_det = [], []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and dp[i, j] == dp[i - 1, j - 1] + (match if ref[i - 1] == det[j - 1] else mismatch):
            al_ref.append(ref[i - 1])
            al_det.append(det[j - 1])
            i -= 1; j -= 1
        elif i > 0 and dp[i, j] == dp[i - 1, j] + gap:
            al_ref.append(ref[i - 1])
            al_det.append(None)
            i -= 1
        else:
            al_ref.append(None)
            al_det.append(det[j - 1])
            j -= 1
    al_ref.reverse()
    al_det.reverse()
    return al_ref, al_det


def classify_errors(refs, det_segments, chords_data=None, trace_data=None):
    ref_pc = [r['midi'] % 12 for r in refs]
    ref_oct = [r['midi'] // 12 - 1 for r in refs]
    det_midis = [s['midi'] for s in det_segments]
    det_pc = [m % 12 for m in det_midis]

    al_ref, al_det = needleman_wunsch_pc(ref_pc, det_pc)

    classes = defaultdict(int)
    details = []
    pc_errors = 0
    oct_errors = 0
    total_aligned = 0
    ref_idx = 0
    det_idx = 0

    for r, d in zip(al_ref, al_det):
        if r is not None:
            total_aligned += 1
            ref_note = refs[ref_idx] if ref_idx < len(refs) else None
            det_midi = None
            det_note = None
            if d is not None:
                if det_idx < len(det_segments):
                    det_note = det_segments[det_idx]
                    det_midi = det_note['midi']
                det_idx += 1
            ref_idx += 1

            if ref_note is None:
                continue

            if d is None:
                classes['bass_missing'] += 1
                details.append({
                    'reference_midi': ref_note['midi'],
                    'reference_note': f'{NOTE_NAMES[ref_note["midi"] % 12]}{ref_note["midi"] // 12 - 1}',
                    'detected_midi': None,
                    'category': 'bass_missing',
                    'ref_start': ref_note['start'],
                    'ref_end': ref_note['end'],
                })
                continue

            if r != d:
                pc_errors += 1
                classes['pitch_class_wrong'] += 1
                details.append({
                    'reference_midi': ref_note['midi'],
                    'reference_note': f'{NOTE_NAMES[ref_note["midi"] % 12]}{ref_note["midi"] // 12 - 1}',
                    'detected_midi': det_midi,
                    'detected_note': f'{NOTE_NAMES[det_midi % 12]}{det_midi // 12 - 1}' if det_midi else None,
                    'category': 'pitch_class_wrong',
                    'ref_start': ref_note['start'],
                    'ref_end': ref_note['end'],
                })
            else:
                ref_oct_ = ref_note['midi'] // 12 - 1
                det_oct_ = det_midi // 12 - 1 if det_midi else ref_oct_
                if ref_oct_ != det_oct_:
                    oct_errors += 1
                    classes['octave_wrong'] += 1
                    details.append({
                        'reference_midi': ref_note['midi'],
                        'reference_note': f'{NOTE_NAMES[ref_note["midi"] % 12]}{ref_oct_}',
                        'detected_midi': det_midi,
                        'detected_note': f'{NOTE_NAMES[det_midi % 12]}{det_oct_}' if det_midi else None,
                        'category': 'octave_wrong',
                        'ref_start': ref_note['start'],
                        'ref_end': ref_note['end'],
                    })
                else:
                    details.append({
                        'reference_midi': ref_note['midi'],
                        'reference_note': f'{NOTE_NAMES[ref_note["midi"] % 12]}{ref_oct_}',
                        'detected_midi': det_midi,
                        'detected_note': f'{NOTE_NAMES[det_midi % 12]}{det_oct_}' if det_midi else None,
                        'category': 'correct',
                        'ref_start': ref_note['start'],
                        'ref_end': ref_note['end'],
                    })
        else:
            det_idx += 1

    # Fragmentation analysis
    ref_durs = [r['end'] - r['start'] for r in refs]
    det_count = len(det_segments)
    frag_ratio = round(det_count / len(refs), 2) if refs else 0
    if frag_ratio > 2.5:
        classes['fragmentation_excessive'] = 1

    nw_matches = total_aligned - pc_errors - oct_errors
    nw_accuracy = round(nw_matches / total_aligned * 100, 1) if total_aligned > 0 else 0.0
    oct_error_rate = round(oct_errors / total_aligned * 100, 1) if total_aligned > 0 else 0.0

    return {
        'n_reference_notes': len(refs),
        'n_detected_segments': det_count,
        'nw_accuracy': nw_accuracy,
        'octave_error_rate': oct_error_rate,
        'fragmentation': frag_ratio,
        'error_classes': dict(classes),
        'n_total_aligned': total_aligned,
        'n_pc_errors': pc_errors,
        'n_oct_errors': oct_errors,
        'n_correct': nw_matches,
        'details': details,
    }


def main():
    parser = argparse.ArgumentParser(description='Classify bass detection errors')
    parser.add_argument('--ref', required=True, help='Ground truth CSV')
    parser.add_argument('--det', required=True, help='Detected segments JSON')
    parser.add_argument('--output', default=None, help='Output JSON')
    parser.add_argument('--pretty', action='store_true', help='Pretty print output')
    args = parser.parse_args()

    refs = load_ground_truth(args.ref)
    det = load_segments(args.det)
    result = classify_errors(refs, det)

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result, f, indent=2 if args.pretty else None)
        print(f'Written: {args.output}')
    else:
        print(json.dumps(result, indent=2))

    # Summary
    print()
    print(f'NW Accuracy: {result["nw_accuracy"]}%')
    print(f'Octave Error: {result["octave_error_rate"]}%')
    print(f'Fragmentation: {result["fragmentation"]}')
    print(f'Errors: {dict(result["error_classes"])}')


if __name__ == '__main__':
    main()
