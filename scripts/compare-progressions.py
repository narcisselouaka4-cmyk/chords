#!/usr/bin/env python3
"""A/B benchmark on controlled progression tests.

Run: scripts/compare-progressions.py
Output: COMPARAISON_PROGRESSIONS.md
"""
import json, os, sys, subprocess, re
from collections import defaultdict
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROGRESSIONS_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')
AUDIO_PROC = os.path.join(PROJECT, 'electron', 'audio-processor.py')
PYTHON = os.path.join(PROJECT, '.venv', 'bin', 'python')
REPORT = os.path.join(PROJECT, 'COMPARAISON_PROGRESSIONS.md')

VARIANTS = {
    'A (legacy_family_fix)': 'legacy_family_fix',
    'B (distinctive_interval)': 'distinctive_interval',
    'C (hybrid)': 'hybrid',
}

VARIANT_LABELS = list(VARIANTS.keys())

NOTE_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def normalize_root(root_str):
    """Normalize root to sharp-based naming (e.g. Bb → A#, C# → C#)."""
    FLAT_TO_SHARP = {
        'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
    }
    r = root_str.strip()
    r2 = r[:2]
    r1 = r[:1]
    if r2 in FLAT_TO_SHARP:
        return FLAT_TO_SHARP[r2]
    if r2 in NOTE_SHARP:
        return r2
    if r1 in FLAT_TO_SHARP:
        return FLAT_TO_SHARP[r1]
    if r1 in NOTE_SHARP:
        return r1
    return r

QUALITY_MAP = {
    'major': '',
    'minor': 'm',
    'min': 'm',
    'min7': 'm7',
    'dom7': '7',
    'dim': 'dim',
    'hdim7': 'm7b5',
    'hdim': 'm7b5',
    'half-diminished': 'm7b5',
    'aug': 'aug',
}

def normalize_quality(q):
    q = q.strip()
    if q in QUALITY_MAP:
        return QUALITY_MAP[q]
    return q

def parse_chord_label(chord_str):
    """Parse 'Cmaj7' → ('C', 'maj7'), 'A#7' → ('A#', '7'), 'Bb' → ('A#', ''), etc."""
    if chord_str == 'N' or not chord_str:
        return None, None
    m = re.match(r'^([A-G][#b]?)(.*)', chord_str)
    if not m:
        return None, None
    root_raw = m.group(1)
    suffix = m.group(2).strip()
    # Handle cases like 'A#7' where root would be 'A' and suffix '#7'
    if suffix and suffix[0] in ('#', 'b'):
        root_raw = root_raw + suffix[0]
        suffix = suffix[1:].strip()
    root_norm = normalize_root(root_raw)
    suffix_norm = normalize_quality(suffix)
    return root_norm, suffix_norm


def run_variant(wav_path, variant):
    cmd = [PYTHON, AUDIO_PROC, 'analyze-chords', wav_path, 'legacy', variant]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            print(f'  ERROR: {r.stderr[:200]}')
            return None
        # Extract JSON from stdout (log lines are prefixed with [AudioProcessor])
        json_lines = [line for line in r.stdout.splitlines()
                      if line.startswith('{') or line.startswith('[')]
        if not json_lines:
            print(f'  PARSE ERROR: no JSON found in output')
            print(f'  stdout: {r.stdout[:300]}')
            return None
        return json.loads(json_lines[-1])
    except Exception as e:
        print(f'  EXCEPTION: {e}')
        return None


def load_ground_truth(json_path):
    with open(json_path) as f:
        return json.load(f)


def time_overlap(a_start, a_end, b_start, b_end):
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def compute_metrics(gt_data, result):
    gt_segs = gt_data['segments']
    det_segs = result.get('chords', [])
    dur_total = gt_data['chord_duration'] * len(gt_data['progression']) * gt_data['repeats']

    root_correct = 0.0
    quality_correct = 0.0
    full_correct = 0.0
    confusion = defaultdict(lambda: defaultdict(float))
    quality_preservation = defaultdict(lambda: {'correct': 0.0, 'total': 0.0})
    false_7 = 0.0
    sus_to_major = 0.0
    sus_total = 0.0
    short_segs = 0
    n_segs = len(det_segs)

    # Per-ground-truth-segment tracking
    for gs in gt_segs:
        gs_root = normalize_root(gs['root'])
        gs_qual = normalize_quality(gs['quality'])
        gs_start = gs['start_time']
        gs_end = gs['end_time']
        gs_dur = gs_end - gs_start

        overlap_detected = False
        best_overlap = 0.0
        best_det = None

        for ds in det_segs:
            ds_root_norm, ds_qual_norm = parse_chord_label(ds.get('chord', ''))
            if ds_root_norm is None:
                continue
            ov = time_overlap(gs_start, gs_end, ds['startTime'], ds['endTime'])
            if ov > best_overlap:
                best_overlap = ov
                best_det = (ds_root_norm, ds_qual_norm, ds['startTime'], ds['endTime'])

        if best_det and best_overlap > 0:
            dr, dq, ds_start, ds_end = best_det
            gs_dur = gs_end - gs_start
            overlap_frac = best_overlap / gs_dur if gs_dur > 0 else 0

            # Track quality preservation
            qual_key = f"{gs_root}:{gs_qual}"
            quality_preservation[qual_key]['total'] += best_overlap
            if dq == gs_qual:
                quality_preservation[qual_key]['correct'] += best_overlap

            # Root correct
            if dr == gs_root:
                root_correct += best_overlap
            # Quality correct
            if dq == gs_qual:
                quality_correct += best_overlap
            # Full correct
            if dr == gs_root and dq == gs_qual:
                full_correct += best_overlap

            # Confusion matrix (by quality only for readability)
            confusion[gs_qual][dq] += best_overlap

            # False 7 detection
            if gs_qual != '7' and dq == '7':
                false_7 += best_overlap

            # Sus → major
            if 'sus' in gs_qual and dq in ('', 'maj7'):
                sus_to_major += best_overlap
            if 'sus' in gs_qual:
                sus_total += best_overlap

    # Short segments
    for ds in det_segs:
        dur = ds['endTime'] - ds['startTime']
        if dur < 0.4:
            short_segs += 1

    n_expected = len(gt_segs)
    fragmentation_ratio = n_segs / max(1, n_expected)

    return {
        'duration_total': dur_total,
        'root_accuracy': round(root_correct / max(dur_total, 1e-9), 4),
        'quality_accuracy': round(quality_correct / max(dur_total, 1e-9), 4),
        'full_accuracy': round(full_correct / max(dur_total, 1e-9), 4),
        'root_correct_seconds': round(root_correct, 3),
        'quality_correct_seconds': round(quality_correct, 3),
        'full_correct_seconds': round(full_correct, 3),
        'confusion': {k: dict(v) for k, v in confusion.items()},
        'quality_preservation': {k: dict(v) for k, v in quality_preservation.items()},
        'false_7_seconds': round(false_7, 3),
        'sus_to_major_seconds': round(sus_to_major, 3),
        'sus_total_seconds': round(sus_total, 3),
        'short_segments': short_segs,
        'total_segments': n_segs,
        'expected_segments': n_expected,
        'fragmentation_ratio': round(fragmentation_ratio, 3),
    }


def fmt_qual(q):
    return q if q else 'major'


def fmt_pct(v):
    return f'{v*100:.1f}%'


QUALITY_FAMILIES = {
    '': 0, 'maj7': 1, 'sus2': 2, 'sus4': 3,
    '7': 4,
    'm': 5, 'm7': 6,
    'dim': 7, 'm7b5': 8,
    'aug': 9,
}


def main():
    wav_files = sorted([
        f for f in os.listdir(PROGRESSIONS_DIR)
        if f.endswith('.wav')
    ])

    if not wav_files:
        print('No WAV files found in', PROGRESSIONS_DIR)
        sys.exit(1)

    all_results = {}

    for wf in wav_files:
        wav_path = os.path.join(PROGRESSIONS_DIR, wf)
        gt_path = wav_path.replace('.wav', '.json')
        if not os.path.exists(gt_path):
            print(f'  SKIP (no ground truth): {wf}')
            continue
        gt_data = load_ground_truth(gt_path)
        name = wf.replace('.wav', '')
        print(f'\n=== {name} ===')
        all_results[name] = {'gt': gt_data}
        for label, variant in VARIANTS.items():
            print(f'  Running {label}...')
            result = run_variant(wav_path, variant)
            if result is None:
                print(f'  FAILED')
                all_results[name][label] = None
                continue
            metrics = compute_metrics(gt_data, result)
            all_results[name][label] = {'result': result, 'metrics': metrics}
            print(f'    root={fmt_pct(metrics["root_accuracy"])} '
                  f'qual={fmt_pct(metrics["quality_accuracy"])} '
                  f'full={fmt_pct(metrics["full_accuracy"])} '
                  f'segs={metrics["total_segments"]} '
                  f'short={metrics["short_segments"]}')

    # ─── Generate report ───
    def fmt_val_3(label, key_or_get):
        """Return formatted values for A, B, C as tuple (a_str, b_str, c_str)."""
        def _get(var_label):
            d = data.get(var_label)
            if d is None:
                return '?'
            if callable(key_or_get):
                return key_or_get(d['metrics'])
            return d['metrics'].get(key_or_get, '?')
        a = _get('A (legacy_family_fix)')
        b = _get('B (distinctive_interval)')
        c = _get('C (hybrid)')
        return a, b, c

    lines = []
    lines.append('# Comparaison A/B/C — Progressions contrôlées\n')
    lines.append(f'Généré le {datetime.now().strftime("%Y-%m-%d %H:%M")}\n')

    for name, data in all_results.items():
        gt = data['gt']
        prog_desc = gt.get('description', '')
        lines.append(f'## {name}')
        if prog_desc:
            lines.append(f'_{prog_desc}_')
        lines.append('')
        lines.append(f'- {gt["repeats"]} répétitions × {len(gt["progression"])} accords = {gt["chord_duration"] * len(gt["progression"]) * gt["repeats"]:.0f}s')
        lines.append('')

        # Ground truth summary
        lines.append('| # | Accord | Root | Qualité | Notes |')
        lines.append('|---|--------|------|---------|-------|')
        for i, c in enumerate(gt['progression']):
            notes_str = ', '.join([c['bass']] + c['upper_notes'])
            lines.append(f'| {i+1} | {c["root"]}{"" if c["quality"]=="major" else c["quality"]} | {c["root"]} | {c["quality"]} | {notes_str} |')
        lines.append('')

        # Metrics table
        lines.append('| Métrique | Variante A | Variante B | Variante C |')
        lines.append('|---|---|---|---|')
        metrics_keys = [
            ('root_accuracy', 'Root (pondéré durée)'),
            ('quality_accuracy', 'Qualité (pondéré durée)'),
            ('full_accuracy', 'Root + Qualité'),
        ]
        for key, label in metrics_keys:
            a, b, c = fmt_val_3(key, key)
            lines.append(f'| {label} | {fmt_pct(float(a)) if a != "?" else "?"} | {fmt_pct(float(b)) if b != "?" else "?"} | {fmt_pct(float(c)) if c != "?" else "?"} |')

        # Additional metrics
        for label_key, metric_label in [
            ('total_segments', 'Segments détectés'),
            ('expected_segments', 'Segments attendus'),
            ('short_segments', 'Segments < 0.4s'),
            ('fragmentation_ratio', 'Ratio fragmentation'),
        ]:
            a, b, c = fmt_val_3(label_key, label_key)
            lines.append(f'| {metric_label} | {a} | {b} | {c} |')

        # False 7 and sus metrics
        dur = data['A (legacy_family_fix)']['metrics']['duration_total'] if data['A (legacy_family_fix)'] else 1
        for label_key, metric_label in [
            ('false_7_seconds', 'Faux positifs 7 (durée)'),
            ('sus_to_major_seconds', 'Sus → major (durée)'),
        ]:
            row = [metric_label]
            for vl in VARIANT_LABELS:
                if data[vl] is not None:
                    s = data[vl]['metrics'][label_key]
                    row.append(f'{s:.2f}s ({fmt_pct(s / max(dur, 1))})')
                else:
                    row.append('?')
            lines.append('| ' + ' | '.join(row) + ' |')
        lines.append('')

        # Confusion matrices
        for vl in VARIANT_LABELS:
            if not data[vl]:
                continue
            label_short = vl.split(' ')[0]  # A, B, C
            conf = data[vl]['metrics']['confusion']
            if not conf:
                continue
            all_quals_expected = sorted(conf.keys(), key=lambda x: (QUALITY_FAMILIES.get(x, 99), x))
            all_quals_detected = sorted(set(
                dq for v in conf.values() for dq in v.keys()
            ), key=lambda x: (QUALITY_FAMILIES.get(x, 99), x))
            lines.append(f'### Matrice de confusion — Variante {label_short}')
            lines.append(f'| Attendu \\ Détecté | ' + ' | '.join(f'`{fmt_qual(q)}`' for q in all_quals_detected) + ' |')
            lines.append('|' + '---|' * (len(all_quals_detected) + 1))
            for eq in all_quals_expected:
                row = [f'`{fmt_qual(eq)}`']
                for dq in all_quals_detected:
                    val = conf.get(eq, {}).get(dq, 0.0)
                    row.append(f'{val:.2f}s')
                lines.append('| ' + ' | '.join(row) + ' |')
            lines.append('')

        # Quality preservation
        for vl in VARIANT_LABELS:
            if not data[vl]:
                continue
            label_short = vl.split(' ')[0]
            qp = data[vl]['metrics']['quality_preservation']
            if not qp:
                continue
            lines.append(f'### Préservation par qualité — Variante {label_short}')
            lines.append('| Qualité (root:suffix) | Correct | Total (durée) | Taux |')
            lines.append('|---|---|---|---|')
            for key in sorted(qp.keys()):
                v = qp[key]
                rate = v['correct'] / max(v['total'], 1e-9)
                lines.append(f'| {key} | {v["correct"]:.2f}s | {v["total"]:.2f}s | {fmt_pct(rate)} |')
            lines.append('')

    # ─── Summary across all progressions ───
    lines.append('## Synthèse globale\n')
    lines.append('| Métrique | Variante A | Variante B | Variante C |')
    lines.append('|---|---|---|---|')

    agg = {label: {
        'root_correct': [],
        'quality_correct': [],
        'full_correct': [],
        'total_dur': [],
        'total_segs': [],
        'short_segs': [],
        'false_7': [],
        'sus_to_major': [],
        'sus_total': [],
        'expected_segs': [],
    } for label in VARIANTS}

    for name, data in all_results.items():
        for label in VARIANTS:
            if not data[label]:
                continue
            m = data[label]['metrics']
            agg[label]['root_correct'].append(m['root_correct_seconds'])
            agg[label]['quality_correct'].append(m['quality_correct_seconds'])
            agg[label]['full_correct'].append(m['full_correct_seconds'])
            agg[label]['total_dur'].append(m['duration_total'])
            agg[label]['total_segs'].append(m['total_segments'])
            agg[label]['short_segs'].append(m['short_segments'])
            agg[label]['false_7'].append(m['false_7_seconds'])
            agg[label]['sus_to_major'].append(m['sus_to_major_seconds'])
            agg[label]['sus_total'].append(m['sus_total_seconds'])
            agg[label]['expected_segs'].append(m['expected_segments'])

    for label_key, metric_label in [
        ('root_pct', 'Root (pondéré durée)'),
        ('quality_pct', 'Qualité (pondéré durée)'),
        ('full_pct', 'Root + Qualité'),
    ]:
        row = [metric_label]
        for label in VARIANT_LABELS:
            d = agg[label]
            if not d['total_dur']:
                row.append('?')
            else:
                if label_key == 'root_pct':
                    v = sum(d['root_correct']) / max(sum(d['total_dur']), 1e-9)
                elif label_key == 'quality_pct':
                    v = sum(d['quality_correct']) / max(sum(d['total_dur']), 1e-9)
                else:
                    v = sum(d['full_correct']) / max(sum(d['total_dur']), 1e-9)
                row.append(fmt_pct(v))
        lines.append('| ' + ' | '.join(row) + ' |')

    # Aggregate fragmentation
    for label_key, metric_label in [
        ('total_segs', 'Segments total'),
        ('short_segs', 'Segments < 0.4s total'),
        ('frag_ratio', 'Ratio fragmentation moyen'),
    ]:
        row = [metric_label]
        for label in VARIANT_LABELS:
            d = agg[label]
            if not d['total_segs']:
                row.append('?')
                continue
            if label_key == 'total_segs':
                row.append(str(sum(d['total_segs'])))
            elif label_key == 'short_segs':
                row.append(str(sum(d['short_segs'])))
            else:
                v = sum(d['total_segs']) / max(sum(d['expected_segs']), 1)
                row.append(f'{v:.3f}')
        lines.append('| ' + ' | '.join(row) + ' |')

    # Aggregate false 7, sus → major
    for label_key, metric_label in [
        ('false_7', 'Faux positifs 7 (durée)'),
        ('sus_to_major', 'Sus → major (durée)'),
    ]:
        row = [metric_label]
        for label in VARIANT_LABELS:
            d = agg[label]
            total = sum(d[label_key])
            total_dur = sum(d['total_dur'])
            pct = total / max(total_dur, 1e-9)
            row.append(f'{total:.2f}s ({fmt_pct(pct)})')
        lines.append('| ' + ' | '.join(row) + ' |')

    lines.append('')

    # Qualitative analysis
    lines.append('## Analyse qualitative\n')
    for name, data in all_results.items():
        parts = []
        for vl in VARIANT_LABELS:
            if not data[vl]:
                parts.append(f'{vl.split(" ")[0]} échoué')
                continue
            m = data[vl]['metrics']
            label_short = vl.split(' ')[0]
            parts.append(f'{label_short}: root={fmt_pct(m["root_accuracy"])}, qual={fmt_pct(m["quality_accuracy"])}, full={fmt_pct(m["full_accuracy"])}')
        lines.append(f'- **{name}** : {", ".join(parts)}')

    lines.append('')

    # Decision
    lines.append('## Décision\n')
    lines.append('À déterminer après analyse des résultats ci-dessus.\n')

    report = '\n'.join(lines)
    with open(REPORT, 'w') as f:
        f.write(report)
    print(f'\nReport written to {REPORT}')


if __name__ == '__main__':
    main()
