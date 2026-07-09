#!/usr/bin/env python3
"""
Benchmark comparatif : V2 brute | V2.5 mode(h=n) | Viterbi (expérimental).

Usage:
  python scripts/benchmark-bass-v2.5.py <reference.json> [--output <csv>]
"""
import sys, os, json, subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASS_SCRIPT = os.path.join(SCRIPT_DIR, 'bass-detector.py')
PY = sys.executable

RUNS = [
    ('V2 brute',         [PY, BASS_SCRIPT, 'benchmark', 'PLACEHOLDER',
                           '--v2', '--tracking', 'none']),
    ('V2.5 h=2',         [PY, BASS_SCRIPT, 'benchmark', 'PLACEHOLDER',
                           '--v2', '--tracking', 'mode', '--smoothing-window', '2']),
    ('V2.5 h=4',         [PY, BASS_SCRIPT, 'benchmark', 'PLACEHOLDER',
                           '--v2', '--tracking', 'mode', '--smoothing-window', '4']),
    ('V2.5 h=6',         [PY, BASS_SCRIPT, 'benchmark', 'PLACEHOLDER',
                           '--v2', '--tracking', 'mode', '--smoothing-window', '6']),
    ('V3 Viterbi',       [PY, BASS_SCRIPT, 'benchmark', 'PLACEHOLDER',
                           '--v2', '--tracking', 'viterbi']),
]

METRICS_KEYS = [
    'bass_accuracy', 'slash_accuracy', 'octave_error_rate',
    'temporal_coherence', 'fragmentation', 'segments_per_min',
    'avg_segment_duration', 'det_segments',
]


def main():
    if len(sys.argv) < 2:
        ref = os.path.join(SCRIPT_DIR, '..', 'tests', 'references',
                           'amazing_grace_gospel_piano.json')
    else:
        ref = sys.argv[1]
    if not os.path.exists(ref):
        print(f'[Error] Reference not found: {ref}')
        sys.exit(1)

    output_path = None
    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    results = []

    for label, cmd in RUNS:
        cmd = [c if c != 'PLACEHOLDER' else ref for c in cmd]
        print(f'── {label} ──', flush=True)
        proc = subprocess.run(cmd, capture_output=True, text=True)
        # Check stderr for log messages
        for line in proc.stderr.split('\n'):
            if line.strip():
                print(f'  {line}')
        # Parse metrics from stdout
        metrics = {}
        in_metrics = False
        for line in proc.stdout.split('\n'):
            if line.strip() == '__METRICS__':
                in_metrics = True
                continue
            if in_metrics and line.strip():
                try:
                    metrics = json.loads(line.strip())
                except json.JSONDecodeError:
                    pass
                break
        results.append({'label': label, **metrics})
        print()

    # Summary table
    print()
    print('=' * 110)
    print('BENCHMARK BASS ENGINE V2.5 — SYNTHÈSE')
    print('=' * 110)
    headers = ['Method', 'Segs', 'BassAcc', 'SlashAcc', 'OctErr',
               'Coher', 'Fragm', 'SegMin', 'DurMoy']
    print(f'  {" | ".join(f"{h:>10s}" for h in headers)}')
    print('  ' + '-' * (11 * len(headers) - 3))
    for r in results:
        vals = [
            r['label'][:12],
            str(r.get('det_segments', '?')),
            f"{r.get('bass_accuracy', 0):.1f}%",
            f"{r.get('slash_accuracy', 0):.1f}%",
            f"{r.get('octave_error_rate', 0):.1f}%",
            f"{r.get('temporal_coherence', 0):.2f}",
            f"{r.get('fragmentation', 0):.2f}",
            f"{r.get('segments_per_min', 0):.1f}",
            f"{r.get('avg_segment_duration', 0):.2f}s",
        ]
        print(f'  {" | ".join(f"{v:>10s}" for v in vals)}')
    print()

    if output_path:
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f'Saved to {output_path}')


if __name__ == '__main__':
    main()
