#!/usr/bin/env python3
"""
Benchmark V1 vs V2 — Octave disambiguation comparison.

Usage:
  python scripts/benchmark-octave-v2.py <reference.json>
  python scripts/benchmark-octave-v2.py <reference.json> --output <stats.json>

Runs both V1 and V2 on the same reference, prints side-by-side comparison.
"""
import sys, os, json, subprocess, tempfile, datetime

BASE = os.path.dirname(os.path.abspath(__file__))
DETECTOR = os.path.join(BASE, 'bass-detector.py')


def run_benchmark(ref_path, use_v2=False):
    """Run benchmark and return metrics dict."""
    cmd = [sys.executable, DETECTOR, 'benchmark']
    if use_v2:
        cmd.append('--v2')
    cmd.append(ref_path)

    # Capture JSON metrics via tempfile
    tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
    tmp.close()
    cmd.extend(['--output', tmp.name])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        print(f'[Error] Benchmark failed (V2={use_v2}): {result.stderr[:500]}', file=sys.stderr)
        return None

    with open(tmp.name) as f:
        metrics = json.load(f)
    os.unlink(tmp.name)
    return metrics


def print_comparison(v1, v2, ref_path):
    """Print side-by-side V1 vs V2 comparison."""
    def p(msg=''):
        print(msg)

    p('╔══════════════════════════════════════════════════════════════╗')
    p('║     OCTAVE DISAMBIGUATION — V1 vs V2 COMPARISON             ║')
    p('╚══════════════════════════════════════════════════════════════╝')
    p(f'Reference  : {os.path.basename(ref_path)}')
    p(f'Generated  : {datetime.datetime.now().isoformat()}')
    p()

    fields = [
        ('bass_accuracy', 'Bass accuracy (pitch class)', '%'),
        ('slash_accuracy', 'Slash chord accuracy', '%'),
        ('octave_error_rate', 'Octave error rate', '%'),
        ('temporal_coherence', 'Temporal coherence (chg/measure)', ''),
        ('fragmentation', 'Fragmentation (det/ref)', ''),
        ('segments_per_min', 'Segments/min', ''),
        ('avg_segment_duration', 'Avg segment duration', 's'),
        ('det_segments', 'Detected segments', ''),
        ('ref_notes', 'Reference notes', ''),
    ]

    p(f'{"Metric":40s} {"V1":>10s} {"V2":>10s} {"Δ":>10s}')
    p('-' * 72)
    for field, label, unit in fields:
        v1v = v1.get(field, '?') if v1 else '?'
        v2v = v2.get(field, '?') if v2 else '?'
        if isinstance(v1v, (int, float)) and isinstance(v2v, (int, float)):
            delta = v2v - v1v
            unit_str = unit if unit else ''
            delta_str = f'{delta:+.1f}{unit_str}' if delta != 0 else '—'
            better = ''
            if field == 'octave_error_rate':
                better = ' ✓' if delta < 0 else ' ✗' if delta > 0 else ''
            elif field == 'bass_accuracy' or field == 'slash_accuracy':
                better = ' ✓' if delta > 0 else ' ✗' if delta < 0 else ''
            elif field == 'fragmentation':
                better = ' ✓' if delta < 0 else ' ✗' if delta > 0 else ''
            p(f'{label:40s} {v1v:>8.1f}{unit_str:>2s} {v2v:>8.1f}{unit_str:>2s} '
              f'{delta_str:>10s}{better}')
        else:
            p(f'{label:40s} {str(v1v):>10s} {str(v2v):>10s}')

    p()
    p('─' * 72)

    # Interpret
    p()
    p('INTERPRÉTATION:')
    delta_oct = v2.get('octave_error_rate', 0) - v1.get('octave_error_rate', 0) \
        if v1 and v2 else 0
    delta_bass = v2.get('bass_accuracy', 0) - v1.get('bass_accuracy', 0) \
        if v1 and v2 else 0
    delta_slash = v2.get('slash_accuracy', 0) - v1.get('slash_accuracy', 0) \
        if v1 and v2 else 0
    delta_frag = v2.get('fragmentation', 0) - v1.get('fragmentation', 0) \
        if v1 and v2 else 0

    if delta_oct < 0:
        p(f'  ✅ Octave error rate: {abs(delta_oct):.1f}pp réduit')
    else:
        p(f'  ❌ Octave error rate: {delta_oct:+.1f}pp augmenté')

    if delta_bass > 0:
        p(f'  ✅ Pitch class accuracy: {delta_bass:+.1f}pp amélioré')
    elif delta_bass < 0:
        p(f'  ⚠️  Pitch class accuracy: {delta_bass:.1f}pp dégradé')

    if abs(delta_slash) < 1:
        p(f'  ✅ Slash chord accuracy: stable ({delta_slash:+.1f}pp)')
    elif delta_slash < 0:
        p(f'  ⚠️  Slash chord accuracy: {delta_slash:.1f}pp dégradé')

    if delta_frag < 0:
        p(f'  ✅ Fragmentation: légèrement réduite ({delta_frag:.2f})')
    elif delta_frag > 0:
        p(f'  ⚠️  Fragmentation: {delta_frag:+.2f} augmenté')

    p()
    p('─' * 72)

    # Summary verdict
    p()
    changes = 0
    good = 0
    if delta_oct < 0:
        changes += 1
        good += 1
    if delta_bass > 0:
        changes += 1
        good += 1
    if abs(delta_slash) > 0.5:
        changes += 1
        if delta_slash > 0:
            good += 1

    if good == changes:
        p('VERDICT: V2 améliore ou préserve tous les métriques. ✓')
    elif delta_oct < 0 and abs(delta_bass) < 1 and abs(delta_slash) < 2:
        p('VERDICT: V2 réduit l\'erreur d\'octave sans dégrader le pitch class. ✓')
    else:
        p('VERDICT: Résultats mitigés — vérifier les compromis.')

    p()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ref_path = sys.argv[1]
    if not os.path.exists(ref_path):
        print(f'[Error] Reference not found: {ref_path}')
        sys.exit(1)

    print('[Benchmark V1 vs V2] Running V1...')
    v1 = run_benchmark(ref_path, use_v2=False)
    print('[Benchmark V1 vs V2] Running V2...')
    v2 = run_benchmark(ref_path, use_v2=True)

    if not v1 or not v2:
        print('[Error] Benchmark failed', file=sys.stderr)
        sys.exit(1)

    print_comparison(v1, v2, ref_path)

    # Save combined stats
    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            out = sys.argv[idx + 1]
            with open(out, 'w') as f:
                json.dump({'v1': v1, 'v2': v2, 'deltas': {
                    'octave_error_rate': round(v2['octave_error_rate'] - v1['octave_error_rate'], 1),
                    'bass_accuracy': round(v2['bass_accuracy'] - v1['bass_accuracy'], 1),
                    'slash_accuracy': round(v2['slash_accuracy'] - v1['slash_accuracy'], 1),
                    'fragmentation': round(v2['fragmentation'] - v1['fragmentation'], 1),
                }}, f, indent=2)


if __name__ == '__main__':
    main()
