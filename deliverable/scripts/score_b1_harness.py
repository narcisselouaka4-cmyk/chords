#!/usr/bin/env python3
"""
Harnais de scoring B1 — compare un ou plusieurs moteurs à la vérité terrain
du corpus synthétique B1, avec mir_eval (CSR majmin/sevenths) + offset médian
de frontière (métrique maison, cf. corpus-test-detection-accords.md).

Usage:
    python scripts/score_b1_harness.py --manifest data/synthetic_b1/manifest.json \
        --engine hmm:data/synthetic_b1/hmm_outputs/{id}_hmm_clean.json \
        [--engine ismir2019:data/synthetic_b1/ismir_outputs/{id}.lab]
"""
import argparse
import glob
import json
import os
import re
import statistics
import sys

import mir_eval
import numpy as np

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
PC = {n: i for i, n in enumerate(NOTE_NAMES)}
PC.update({'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10})

# Suffixe du moteur maison -> qualité mir_eval
SUFFIX_MAP = {
    '': 'maj',
    'm': 'min',
    '7': '7',
    'maj7': 'maj7',
    'm7': 'min7',
    'm7b5': 'hdim7',
    'dim': 'dim',
    'dim7': 'dim7',
    'aug': 'aug',
    'aug7': 'aug',
    'sus2': 'sus2',
    'sus4': 'sus4',
    '6': 'maj6',
    'm6': 'min6',
    '9': '9',
    'maj9': 'maj9',
    'm9': 'min9',
    'add9': 'maj(9)',
}

_ROOT_RE = re.compile(r'^([A-G])(#|b)?')


def app_label_to_mir_eval(label):
    """Convertit un label du moteur maison (ex: 'F#m7', 'C', 'Bm') en label mir_eval ('F#:min7', 'C:maj', 'B:min')."""
    if not label or label in ('N', 'NC', 'X'):
        return 'N'
    m = _ROOT_RE.match(label)
    if not m:
        return 'N'
    root = m.group(1) + (m.group(2) or '')
    suffix = label[m.end():]
    quality = SUFFIX_MAP.get(suffix)
    if quality is None:
        print(f'  [WARN] suffixe inconnu "{suffix}" (label="{label}") -> fallback maj/min sur 3ce', file=sys.stderr)
        quality = 'min' if suffix.startswith('m') and not suffix.startswith('maj') else 'maj'
    return f'{root}:{quality}'


def load_ground_truth(gt_path):
    with open(gt_path) as f:
        gt = json.load(f)
    intervals = np.array([[c['start'], c['end']] for c in gt['chords']], dtype=float)
    labels = [c['label'] for c in gt['chords']]
    return intervals, labels, gt


def load_hmm_estimate(path):
    with open(path) as f:
        d = json.load(f)
    intervals = np.array([[c['startTime'], c['endTime']] for c in d['chords']], dtype=float)
    labels = [app_label_to_mir_eval(c['chord']) for c in d['chords']]
    return intervals, labels, d


def load_lab_estimate(path):
    """Charge un fichier .lab standard (start end label), format ISMIR2019 / mir_eval natif."""
    intervals, labels = mir_eval.io.load_labeled_intervals(path)
    return np.array(intervals, dtype=float), list(labels), None


def offset_stats(ref_intervals, est_intervals, match_window=1.5):
    """Offset médian/écart-type des frontières internes (transitions accord->accord).

    Apparie chaque transition de référence à la transition détectée la plus proche
    dans une fenêtre de +/- match_window secondes. Retourne (median_ms, std_ms, n_matched, n_ref_transitions).
    """
    ref_transitions = ref_intervals[1:, 0] if len(ref_intervals) > 1 else np.array([])
    est_transitions = est_intervals[1:, 0] if len(est_intervals) > 1 else np.array([])
    if len(ref_transitions) == 0:
        return None, None, 0, 0

    deltas = []
    used = set()
    for rt in ref_transitions:
        if len(est_transitions) == 0:
            continue
        diffs = np.abs(est_transitions - rt)
        order = np.argsort(diffs)
        for idx in order:
            if idx in used:
                continue
            if diffs[idx] <= match_window:
                deltas.append((est_transitions[idx] - rt) * 1000.0)
                used.add(idx)
            break

    if not deltas:
        return None, None, 0, len(ref_transitions)
    median_ms = statistics.median(deltas)
    std_ms = statistics.pstdev(deltas) if len(deltas) > 1 else 0.0
    return round(median_ms, 1), round(std_ms, 1), len(deltas), len(ref_transitions)


def score_case(ref_intervals, ref_labels, est_intervals, est_labels):
    # Recadrage : mir_eval exige que ref et est couvrent exactement le même intervalle total.
    est_intervals, est_labels = mir_eval.util.adjust_intervals(
        est_intervals, est_labels, ref_intervals.min(), ref_intervals.max(),
        mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)
    ref_intervals_adj, ref_labels_adj = mir_eval.util.adjust_intervals(
        ref_intervals, ref_labels, ref_intervals.min(), ref_intervals.max(),
        mir_eval.chord.NO_CHORD, mir_eval.chord.NO_CHORD)

    (i, r, e) = mir_eval.util.merge_labeled_intervals(ref_intervals_adj, ref_labels_adj, est_intervals, est_labels)
    durations = mir_eval.util.intervals_to_durations(i)

    comparisons = {}
    for name, fn in [('majmin', mir_eval.chord.majmin), ('sevenths', mir_eval.chord.sevenths),
                      ('root', mir_eval.chord.root), ('mirex', mir_eval.chord.mirex)]:
        try:
            comp = fn(r, e)
            score = mir_eval.chord.weighted_accuracy(comp, durations)
            comparisons[name] = round(float(score) * 100, 2)
        except Exception as ex:
            comparisons[name] = None

    off_med, off_std, n_matched, n_ref_trans = offset_stats(ref_intervals, est_intervals)
    return comparisons, off_med, off_std, n_matched, n_ref_trans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', default='data/synthetic_b1/manifest.json')
    ap.add_argument('--engine', action='append', required=True,
                     help='nom:pattern_avec_{id}. type de fichier détecté par extension (.json=moteur maison, .lab=format lab standard)')
    ap.add_argument('--out-json', default='data/synthetic_b1/scores.json')
    ap.add_argument('--out-md', default='data/synthetic_b1/scores_B1.md')
    args = ap.parse_args()

    with open(args.manifest) as f:
        manifest = json.load(f)

    engines = {}
    for spec in args.engine:
        name, pattern = spec.split(':', 1)
        engines[name] = pattern

    all_rows = []
    for case in manifest:
        case_id = case['id']
        ref_intervals, ref_labels, gt = load_ground_truth(case['ground_truth'])

        row = {'id': case_id, 'bpm': case['bpm'], 'progression': case['progression'],
               'n_chords_ref': len(ref_labels)}

        for ename, pattern in engines.items():
            path = pattern.format(id=case_id)
            if not os.path.isfile(path):
                print(f'  [MISSING] {ename}: {path}')
                row[ename] = None
                continue
            if path.endswith('.lab'):
                est_intervals, est_labels, _ = load_lab_estimate(path)
            else:
                est_intervals, est_labels, _ = load_hmm_estimate(path)

            comparisons, off_med, off_std, n_matched, n_ref_trans = score_case(
                ref_intervals, ref_labels, est_intervals, est_labels)
            row[ename] = {
                'csr_majmin': comparisons.get('majmin'),
                'csr_sevenths': comparisons.get('sevenths'),
                'csr_root': comparisons.get('root'),
                'csr_mirex': comparisons.get('mirex'),
                'offset_median_ms': off_med,
                'offset_std_ms': off_std,
                'transitions_matched': n_matched,
                'transitions_ref': n_ref_trans,
                'n_chords_est': len(est_labels),
            }
        all_rows.append(row)

    with open(args.out_json, 'w') as f:
        json.dump(all_rows, f, indent=2, ensure_ascii=False)

    # --- Rapport markdown ---
    lines = ['# Score B1 — comparaison moteurs\n']
    header = '| Cas | BPM | Prog | ' + ' | '.join(
        f'{e} CSR(majmin) | {e} CSR(7e) | {e} Offset médian | {e} Offset σ' for e in engines) + ' |'
    sep = '|---|---|---|' + '---|---|---|---|' * len(engines)
    lines.append(header)
    lines.append(sep)
    for row in all_rows:
        cells = [row['id'], f"{row['bpm']:.0f}", row['progression']]
        for e in engines:
            r = row.get(e)
            if not r:
                cells += ['-', '-', '-', '-']
            else:
                cells += [f"{r['csr_majmin']:.1f}%" if r['csr_majmin'] is not None else '-',
                           f"{r['csr_sevenths']:.1f}%" if r['csr_sevenths'] is not None else '-',
                           f"{r['offset_median_ms']:.0f} ms" if r['offset_median_ms'] is not None else 'n/a',
                           f"{r['offset_std_ms']:.0f} ms" if r['offset_std_ms'] is not None else 'n/a']
        lines.append('| ' + ' | '.join(cells) + ' |')

    lines.append('\n## Synthèse B1 (moyenne sur les 20 cas)\n')
    lines.append('| Moteur | CSR(majmin) moy | CSR(7e) moy | Offset médian (médiane des cas) | Offset σ moyen |')
    lines.append('|---|---|---|---|---|')
    for e in engines:
        vals_majmin = [row[e]['csr_majmin'] for row in all_rows if row.get(e) and row[e]['csr_majmin'] is not None]
        vals_7 = [row[e]['csr_sevenths'] for row in all_rows if row.get(e) and row[e]['csr_sevenths'] is not None]
        vals_off = [row[e]['offset_median_ms'] for row in all_rows if row.get(e) and row[e]['offset_median_ms'] is not None]
        vals_std = [row[e]['offset_std_ms'] for row in all_rows if row.get(e) and row[e]['offset_std_ms'] is not None]
        m1 = f'{statistics.mean(vals_majmin):.1f}%' if vals_majmin else 'n/a'
        m2 = f'{statistics.mean(vals_7):.1f}%' if vals_7 else 'n/a'
        m3 = f'{statistics.median(vals_off):.0f} ms' if vals_off else 'n/a'
        m4 = f'{statistics.mean(vals_std):.0f} ms' if vals_std else 'n/a'
        lines.append(f'| {e} | {m1} | {m2} | {m3} | {m4} |')

    with open(args.out_md, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    print(f'JSON: {args.out_json}')
    print(f'Markdown: {args.out_md}')
    print()
    print('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
