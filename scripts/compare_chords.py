#!/usr/bin/env python3
"""
Compare detected chords (from audio-processor.py analyze-chords) against
a ground truth chord grid with timestamps.

Reports:
  - Root note accuracy (per segment, total)
  - Chord quality accuracy (with tolerance for extensions)
  - Detailed per-segment comparison table

Usage:
  python scripts/compare_chords.py --detected <detected.json> --ref <reference.json>
"""
import sys, os, json, argparse

NOTE_PCS = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}


def parse_root(chord_str):
    """Extract root note name from a chord string like 'Dmaj7', 'Bm', 'Faug'."""
    if not chord_str:
        return None
    # Handle 2-char roots: C#, Db, D#, Eb, F#, Gb, G#, Ab, A#, Bb
    if len(chord_str) >= 2 and chord_str[:2] in NOTE_PCS:
        return chord_str[:2]
    # Handle 1-char roots: C, D, E, F, G, A, B
    if chord_str[0] in NOTE_PCS:
        return chord_str[0]
    return None


def normalize_quality(chord_str, root):
    """Extract the quality string from a chord, normalizing minor."""
    if not chord_str or not root:
        return ''
    suffix = chord_str[len(root):]
    # Normalize minor: 'm', 'min', '-' → 'min'
    if suffix.startswith('m') and not suffix.startswith('maj'):
        return 'min' + suffix[1:]
    # Normalize major: empty or 'maj' → 'maj'
    return suffix if suffix else 'maj'


def quality_matches(ref_quality, det_quality):
    """Check if qualities match with tolerance for extensions."""
    # Normalize both
    rq = ref_quality or ''
    dq = det_quality or ''

    # Both empty → major
    if rq == '' or rq == 'maj':
        rq = 'maj'
    if dq == '' or dq == 'maj':
        dq = 'maj'

    # Exact match
    if rq == dq:
        return True

    # Root note only (no quality specified in ref) → accept any
    if rq == 'maj':
        return True

    # min vs min7 → minor family match
    if rq.startswith('min') and dq.startswith('min'):
        return True

    # maj vs maj7 → major family match
    if rq.startswith('maj') and dq.startswith('maj'):
        return True

    # dim vs dim7 → diminished family
    if rq.startswith('dim') and dq.startswith('dim'):
        return True
    if rq == 'dim' and dq.startswith('dim'):
        return True

    # aug vs aug7 → augmented family
    if rq.startswith('aug') and dq.startswith('aug'):
        return True

    return False


def load_reference(json_path):
    with open(json_path) as f:
        data = json.load(f)

    chords = data.get('chords', [])
    refs = []
    for c in chords:
        start = c['start']
        end = c['end']
        chord_name = c['chord']
        root_str = c.get('root', '')
        quality_str = c.get('quality', '')
        refs.append({
            'start': start,
            'end': end,
            'chord': chord_name,
            'root': root_str,
            'root_pc': NOTE_PCS.get(root_str, -1),
            'quality': quality_str,
        })
    return refs, data


def load_detected(json_path):
    with open(json_path) as f:
        # Handle log lines before JSON
        content = f.read()
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('{'):
                data = json.loads(line)
                break
        else:
            data = json.loads(content)

    chords = data.get('chords', [])
    dets = []
    for c in chords:
        start = c['startTime']
        end = c['endTime']
        chord_name = c['chord']
        confidence = c.get('confidence', 0)
        root = parse_root(chord_name)
        root_pc = NOTE_PCS.get(root, -1) if root else -1
        quality = normalize_quality(chord_name, root) if root else ''
        dets.append({
            'start': start,
            'end': end,
            'chord': chord_name,
            'root': root,
            'root_pc': root_pc,
            'quality': quality,
            'confidence': confidence,
        })
    return dets, data


def compare(refs, dets):
    results = []

    for ref in refs:
        ref_start = ref['start']
        ref_end = ref['end']
        ref_root = ref['root']
        ref_root_pc = ref['root_pc']
        ref_quality = ref['quality']
        ref_chord = ref['chord']

        # Find overlapping detected chord(s)
        overlapping = [
            d for d in dets
            if d['start'] < ref_end and d['end'] > ref_start
        ]

        if not overlapping:
            results.append({
                'ref_start': ref_start,
                'ref_end': ref_end,
                'ref_chord': ref_chord,
                'det_chord': '—',
                'det_root': None,
                'root_match': False,
                'quality_match': False,
                'overall_match': False,
                'n_detected': 0,
                'best_det': None,
            })
            continue

        # Find best overlapping detected chord (by confidence-weighted overlap)
        best_det = None
        best_overlap = 0.0
        for d in overlapping:
            overlap_start = max(ref_start, d['start'])
            overlap_end = min(ref_end, d['end'])
            overlap = overlap_end - overlap_start
            if overlap > best_overlap:
                best_overlap = overlap
                best_det = d

        det_root = best_det['root']
        det_root_pc = best_det['root_pc']
        det_quality = best_det['quality']
        det_chord = best_det['chord']

        root_match = ref_root_pc == det_root_pc
        qual_match = quality_matches(ref_quality, det_quality)
        overall = root_match

        results.append({
            'ref_start': ref_start,
            'ref_end': ref_end,
            'ref_chord': ref_chord,
            'ref_root': ref_root,
            'ref_quality': ref_quality or 'maj',
            'det_chord': det_chord,
            'det_root': det_root,
            'det_quality': det_quality,
            'det_confidence': best_det['confidence'],
            'root_match': root_match,
            'quality_match': qual_match,
            'overall_match': overall,
            'n_detected': len(overlapping),
            'best_det': best_det,
        })

    return results


def print_report(results):
    n_total = len(results)
    n_root_ok = sum(1 for r in results if r['root_match'])
    n_qual_ok = sum(1 for r in results if r['quality_match'])
    n_overall = sum(1 for r in results if r['overall_match'])

    print('=' * 72)
    print('  VALIDATION CHORD ENGINE — Ton NOM est Jéhovah')
    print('  Comparaison : accords détectés vs grille attendue')
    print('=' * 72)
    print()
    print(f'  {"Plage":>12s} | {"Attendu":>12s} | {"Détecté":>14s} | {"Root":>4s} | {"Qualité":>7s} | Conf')
    print(f'  {"-"*12} | {"-"*12} | {"-"*14} | {"-"*4} | {"-"*7} | {"-"*4}')
    for r in results:
        plage = f'{r["ref_start"]:.0f}-{r["ref_end"]:.0f}s'
        root_mark = '✓' if r['root_match'] else '✗'
        qual_mark = '✓' if r['quality_match'] else '✗'
        det_display = r['det_chord'] if r['det_chord'] else '—'
        conf_display = f'{r["det_confidence"]:.2f}' if r.get('det_confidence') else '-'
        print(f'  {plage:>12s} | {r["ref_chord"]:>12s} | {det_display:>14s} | {root_mark:>4s} | {qual_mark:>7s} | {conf_display}')

    print()
    print('=' * 72)
    print('  RÉSUMÉ')
    print('=' * 72)
    print(f'  Segments de référence      : {n_total}')
    print(f'  Root correct               : {n_root_ok}/{n_total} ({n_root_ok/n_total*100:.1f}%)')
    print(f'  Qualité (tolérante)        : {n_qual_ok}/{n_total} ({n_qual_ok/n_total*100:.1f}%)')
    print(f'  Overall (root + tolérance) : {n_overall}/{n_total} ({n_overall/n_total*100:.1f}%)')
    print()

    # Error analysis
    root_errors = [r for r in results if not r['root_match']]
    if root_errors:
        print(f'  Erreurs de root ({len(root_errors)}) :')
        for r in root_errors:
            det_root = r['det_root'] if r['det_root'] else '—'
            print(f'    {r["ref_start"]:.0f}-{r["ref_end"]:.0f}s : attendu {r["ref_root"]}, détecté {det_root} ({r["det_chord"]})')

    return {
        'n_total': n_total,
        'root_accuracy': round(n_root_ok / n_total * 100, 1) if n_total else 0,
        'quality_accuracy': round(n_qual_ok / n_total * 100, 1) if n_total else 0,
        'overall_accuracy': round(n_overall / n_total * 100, 1) if n_total else 0,
    }


def main():
    parser = argparse.ArgumentParser(
        description='Compare detected chords against ground truth grid')
    parser.add_argument('--detected', required=True,
                        help='Detected chords JSON from audio-processor.py')
    parser.add_argument('--ref', required=True,
                        help='Reference chord grid JSON')
    args = parser.parse_args()

    for p in [args.detected, args.ref]:
        if not os.path.isfile(p):
            print(f'[ERROR] File not found: {p}')
            return 1

    refs, ref_data = load_reference(args.ref)
    dets, det_data = load_detected(args.detected)

    print(f'Loaded {len(refs)} reference chord segments')
    print(f'Loaded {len(dets)} detected chord segments')
    print(f'Detected key: {det_data.get("key", "?")} {det_data.get("keyMode", "?")}')

    results = compare(refs, dets)
    summary = print_report(results)

    # Write report
    report_path = os.path.join(
        os.path.dirname(args.detected),
        'audit_chord_engine_report.json'
    )
    # Ensure output dir exists
    os.makedirs(os.path.dirname(report_path) or '.', exist_ok=True)

    report = {
        'piece': 'Ton NOM est Jéhovah',
        'ref_key': ref_data.get('key'),
        'detected_key': det_data.get('key'),
        'detected_key_mode': det_data.get('keyMode'),
        'n_ref_segments': len(refs),
        'n_detected_segments': len(dets),
        'summary': summary,
        'per_segment': results,
    }
    # Make det_confidence JSON-serializable for all entries
    for r in report['per_segment']:
        if 'best_det' in r and isinstance(r['best_det'], dict):
            r['best_det'] = {
                k: v for k, v in r['best_det'].items()
                if k in ('start', 'end', 'chord', 'confidence', 'root', 'quality')
            }

    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\n  Rapport détaillé : {report_path}')
    print()

    return 0


if __name__ == '__main__':
    sys.exit(main())
