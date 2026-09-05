#!/usr/bin/env python3
"""Run ISMIR2019 model on synthetic corpus (B1, B2) and score with mir_eval.

Uses the same ground truth as corpus_b1.py / corpus_b2.py but runs the
ISMIR2019 chord recognition model instead of the HMM.
"""

import argparse
import importlib.util
import json
import os
import shutil
import statistics
import subprocess
import sys
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b1')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b1')

# ISMIR2019 environment
ISMIR_VENV = os.path.join(PROJECT, '..', 'ism2019-chord', 'venv')
ISMIR_SCRIPT = os.path.join(PROJECT, '..', 'ism2019-chord', 'chord_recognition.py')

# mir_eval chord label mapping
ENGINE_TO_MIREVAL = {
    '': 'maj', 'm': 'min', '7': '7', 'maj7': 'maj7', 'm7': 'min7',
    'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus2': 'sus2',
    'sus4': 'sus4', 'm7b5': 'hdim7', '6': 'maj6', 'm6': 'min6',
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def chord_name_to_mireval(label):
    """Convert ISMIR2019 label (e.g. 'C:maj', 'D:min7', 'N') to mir_eval format."""
    if not label or label == 'N':
        return 'N'
    # ISMIR2019 format: "C:maj", "C:min/b7", "C:7", etc.
    # We need to map to mir_eval qualities
    parts = label.split(':')
    if len(parts) != 2:
        return 'N'
    root, quality = parts
    # Map ISMIR qualities to mir_eval
    # ISMIR qualities: maj, min, 7, maj7, min7, dim, dim7, aug, sus2, sus4, 9, min9, maj9, 11, 13, hdim7
    quality_map = {
        'maj': 'maj', 'min': 'min', '7': '7', 'maj7': 'maj7', 'min7': 'min7',
        'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
        '9': '7', 'min9': 'min7', 'maj9': 'maj7', '11': '7', '13': '7',
        'hdim7': 'hdim7', 'min/b7': 'min7', 'maj/b7': '7', 'min/2': 'min',
        'maj/2': 'maj', 'sus4(b7)': 'sus4', 'min/5': 'min', 'min/b3': 'min',
        'maj/5': 'maj', 'maj/3': 'maj',
    }
    mir_quality = quality_map.get(quality, 'maj')
    return f'{root}:{mir_quality}'

def run_ismir2019_on_wav(wav_path, lab_path):
    """Run ISMIR2019 chord recognition on a WAV file."""
    # Use the venv python
    python = os.path.join(ISMIR_VENV, 'bin', 'python')
    if not os.path.exists(python):
        # Fallback to system python with ISMIR path
        python = sys.executable
    
    env = os.environ.copy()
    env['PYTHONPATH'] = os.path.join(PROJECT, '..', 'ism2019-chord')
    
    cmd = [python, ISMIR_SCRIPT, wav_path, lab_path]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(ISMIR_SCRIPT), env=env, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f'ISMIR2019 failed: {proc.stderr}')
    return True

def parse_lab_file(lab_path):
    """Parse ISMIR2019 .lab output file into segments."""
    segments = []
    with open(lab_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) >= 3:
                start = float(parts[0])
                end = float(parts[1])
                chord = parts[2]
                segments.append({
                    'startTime': start,
                    'endTime': end,
                    'chord': chord_name_to_mireval(chord),
                })
    return segments

def boundary_offsets(gt_segments, pred_segments):
    gt_b = sorted({round(s['start'], 4) for s in gt_segments[1:]})
    pred_b = sorted({round(float(s['startTime']), 4) for s in pred_segments[1:]})
    if not gt_b or not pred_b:
        return []
    return [min(pred_b, key=lambda p: abs(p - g)) - g for g in gt_b]

def score_case(gt, pred_segments):
    import mir_eval
    import numpy as np

    ref_int = np.array([[s['start'], s['end']] for s in gt['segments']])
    ref_lab = [s['chord'] for s in gt['segments']]

    if not pred_segments:
        return None
    est_int = np.array([[float(c['startTime']), float(c['endTime'])] for c in pred_segments])
    est_lab = [c['chord'] for c in pred_segments]

    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int.min(), ref_int.max(), mir_eval.chord.NO_CHORD,
        mir_eval.chord.NO_CHORD)
    intervals, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(intervals)

    out = {}
    for name, fn in (('majmin', mir_eval.chord.majmin),
                     ('sevenths', mir_eval.chord.sevenths)):
        comparisons = fn(ref_l, est_l)
        out[name] = float(mir_eval.chord.weighted_accuracy(comparisons, durations))

    offsets = boundary_offsets(gt['segments'], pred_segments)
    out['offsets_ms'] = [o * 1000.0 for o in offsets]
    out['segments_gt'] = len(gt['segments'])
    out['segments_pred'] = len(pred_segments)
    out['tempo_pred'] = None  # ISMIR2019 doesn't provide tempo
    out['tempo_gt'] = gt.get('tempo')
    out['key_pred'] = None
    out['key_gt'] = gt.get('key')
    return out

def main():
    parser = argparse.ArgumentParser(description='Run ISMIR2019 on B1 corpus')
    parser.add_argument('--label', default='ismir2019')
    parser.add_argument('--compare', default=None)
    args = parser.parse_args()

    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f'corpus B1 absent: lance d\'abord `python3 scripts/corpus_b1.py generate`')

    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)

    report = {'label': args.label, 'battery': 'B1', 'engine': 'ISMIR2019',
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    all_offsets = []

    print(f"{'cas':<28}{'majmin':>9}{'sevenths':>10}{'offset':>10}{'segments':>12}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"), encoding='utf-8') as f:
            gt = json.load(f)
        wav = os.path.join(PROJECT, case['wav'])
        lab_path = os.path.join('/tmp', f'{case["caseId"]}.lab')

        try:
            run_ismir2019_on_wav(wav, lab_path)
            pred_segments = parse_lab_file(lab_path)
            scored = score_case(gt, pred_segments)
        except Exception as e:
            print(f"{case['caseId']:<28}  ERREUR: {e}")
            continue

        if scored is None:
            print(f"{case['caseId']:<28}  aucun accord détecté")
            continue

        report['cases'][case['caseId']] = scored
        all_offsets.extend(scored['offsets_ms'])
        med = statistics.median(scored['offsets_ms']) if scored['offsets_ms'] else 0.0
        print(f"{case['caseId']:<28}{scored['majmin']:>8.1%}{scored['sevenths']:>10.1%}"
              f"{med:>9.0f}ms{str(scored['segments_pred']) + '/' + str(scored['segments_gt']):>12}")

    cases = list(report['cases'].values())
    if not cases:
        sys.exit('aucun cas mesuré')

    total = len(cases)
    globals_ = {
        'cases': total,
        'csr_majmin': sum(c['majmin'] for c in cases) / total,
        'csr_sevenths': sum(c['sevenths'] for c in cases) / total,
        'offset_median_ms': statistics.median(all_offsets) if all_offsets else None,
        'offset_stdev_ms': statistics.pstdev(all_offsets) if len(all_offsets) > 1 else None,
    }
    report['global'] = globals_

    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}"
          f"{'Offset médian':>16}{'Écart-type':>13}")
    print(f"{'B1':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}"
          f"{globals_['offset_median_ms']:>13.0f} ms{globals_['offset_stdev_ms']:>10.0f} ms")

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{args.label}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f'rapport : {out}')

    if args.compare:
        before_path = os.path.join(OUT_DIR, f'{args.compare}.json')
        if os.path.exists(before_path):
            with open(before_path, encoding='utf-8') as f:
                before = json.load(f)
            b, a = before['global'], globals_
            print(f"\n{'métrique':<20}{'avant':>10}{'après':>10}{'écart':>10}")
            for key, label, pct in (('csr_majmin', 'CSR majmin', True),
                                    ('csr_sevenths', 'CSR sevenths', True),
                                    ('offset_median_ms', 'offset médian', False),
                                    ('offset_stdev_ms', 'écart-type', False)):
                vb, va = b.get(key), a.get(key)
                if vb is None or va is None:
                    continue
                if pct:
                    print(f"{label:<20}{vb:>9.1%}{va:>10.1%}{va - vb:>+10.1%}")
                else:
                    print(f"{label:<20}{vb:>7.0f} ms{va:>8.0f} ms{va - vb:>+8.0f} ms")

if __name__ == '__main__':
    main()
