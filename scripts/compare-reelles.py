#!/usr/bin/env python3
"""Run A/B/C on 4 real music files and produce a comparison report.

Run: scripts/compare-reelles.py
Output: COMPARAISON_REELLES.md
"""
import json, os, subprocess
from datetime import datetime
from collections import defaultdict

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON = os.path.join(PROJECT, '.venv', 'bin', 'python')
AUDIO_PROC = os.path.join(PROJECT, 'electron', 'audio-processor.py')
REPORT = os.path.join(PROJECT, 'COMPARAISON_REELLES.md')
OUT_DIR = os.path.join(PROJECT, 'tests', 'audio', 'reelles_comparison')
os.makedirs(OUT_DIR, exist_ok=True)

VARIANTS = [
    ('A', 'legacy_family_fix'),
    ('B', 'distinctive_interval'),
    ('C', 'hybrid'),
]

def find_file(pattern):
    """Find a file by glob pattern, returning first match."""
    import glob
    matches = glob.glob(pattern)
    return matches[0] if matches else None

AMAZING_GRACE = find_file('/home/visiteur/Musique/*Amazing*Grace*.mp3')
AUTUMN_LEAVES = find_file('/home/visiteur/Musique/*Autumn*Leaves*.mp3')

FILES = [
    ('Amazing Grace', AMAZING_GRACE),
    ('Autumn Leaves', AUTUMN_LEAVES),
    ('Gospel', os.path.join(PROJECT, 'data/real/gospel_reel_extrait.wav')),
    ('Worship', os.path.join(PROJECT, 'data/real/ton_nom_est_jehovah_extrait.wav')),
]

QUALITY_FAMILIES = {
    '': 0, 'maj7': 1, 'sus2': 2, 'sus4': 3,
    '7': 4,
    'm': 5, 'm7': 6,
    'dim': 7, 'm7b5': 8,
    'aug': 9,
}


def run_variant(wav_path, variant):
    cmd = [PYTHON, AUDIO_PROC, 'analyze-chords', wav_path, 'legacy', variant]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            return None
        json_lines = [line for line in r.stdout.splitlines()
                      if line.startswith('{') or line.startswith('[')]
        if not json_lines:
            return None
        return json.loads(json_lines[-1])
    except Exception as e:
        print(f'  EXCEPTION: {e}')
        return None


def main():
    lines = []
    lines.append('# Comparaison A/B/C — Fichiers réels\n')
    lines.append(f'Généré le {datetime.now().strftime("%Y-%m-%d %H:%M")}\n')

    for name, wav_path in FILES:
        print(f'\n=== {name} ===')
        real_path = os.path.expanduser(wav_path)
        if not os.path.exists(real_path):
            print(f'  NOT FOUND: {real_path}')
            continue

        results = {}
        for short_label, variant in VARIANTS:
            print(f'  Running {short_label} ({variant})...')
            result = run_variant(real_path, variant)
            if result is None:
                print(f'  FAILED')
                continue
            results[short_label] = result
            # Save JSON
            out = os.path.join(OUT_DIR, f'{name.replace(" ", "_")}_{short_label}.json')
            with open(out, 'w') as f:
                json.dump(result, f, indent=2)
            print(f'    tempo={result.get("tempo"):.1f}, key={result.get("key")}, chords={len(result.get("chords", []))}')

        if not results:
            continue

        lines.append(f'## {name}\n')
        first = results[list(results.keys())[0]]
        lines.append(f'- Fichier : `{os.path.basename(real_path)}`')
        lines.append(f'- Durée : {first.get("duration", "?")}s')
        lines.append(f'- Tempo : {first.get("tempo", "?")} BPM')
        lines.append(f'- Tonalité : {first.get("key", "?")} ({first.get("keyMode", "?")})\n')

        # Summary per variant
        lines.append('| Variante | Segments | < 0.4s | N | Qualités distinctes |')
        lines.append('|---|---|---|---|---|')
        for short_label in [v[0] for v in VARIANTS]:
            if short_label not in results:
                continue
            r = results[short_label]
            chords = r.get('chords', [])
            n_segs = len(chords)
            short_segs = sum(1 for c in chords if c['endTime'] - c['startTime'] < 0.4)
            n_silence = sum(1 for c in chords if c['chord'] == 'N')
            distinct_quals = set()
            for c in chords:
                if c['chord'] != 'N':
                    # Extract suffix after root
                    name = c['chord']
                    suffix = ''
                    for i, ch in enumerate(name):
                        if ch not in 'ABCDEFG#b':
                            suffix = name[i:]
                            break
                    distinct_quals.add(suffix if suffix else 'major')
            lines.append(f'| {short_label} | {n_segs} | {short_segs} | {n_silence} | {len(distinct_quals)} |')
        lines.append('')

        # Per-quality distribution table
        lines.append('### Distribution par qualité (durée en secondes)\n')
        all_quals = set()
        variant_data = {}
        for short_label in [v[0] for v in VARIANTS]:
            if short_label not in results:
                continue
            r = results[short_label]
            qual_dur = defaultdict(float)
            for c in r.get('chords', []):
                dur = c['endTime'] - c['startTime']
                if c['chord'] == 'N':
                    qual_dur['N'] += dur
                else:
                    ch = c['chord']
                    suffix = ''
                    for i, ch_char in enumerate(ch):
                        if ch_char not in 'ABCDEFG#b':
                            suffix = ch[i:]
                            break
                    q = suffix if suffix else 'major'
                    qual_dur[q] += dur
                    all_quals.add(q)
            variant_data[short_label] = qual_dur

        sorted_quals = sorted(all_quals, key=lambda x: (QUALITY_FAMILIES.get(x if x != 'N' else '', 99), x))

        header = '| Qualité | ' + ' | '.join([f'{v[0]} (seg/dur)' for v in VARIANTS if v[0] in results]) + ' |'
        lines.append(header)
        lines.append('|' + '---|' * (1 + sum(1 for v in VARIANTS if v[0] in results)))

        for q in sorted_quals:
            row = [f'`{q}`']
            for short_label in [v[0] for v in VARIANTS]:
                if short_label not in results:
                    continue
                r = results[short_label]
                chords = r.get('chords', [])
                seg_count = 0
                total_dur = 0.0
                for c in chords:
                    dur = c['endTime'] - c['startTime']
                    if c['chord'] == 'N' and q == 'N':
                        seg_count += 1
                        total_dur += dur
                    elif c['chord'] != 'N':
                        ch = c['chord']
                        suffix = ''
                        for i, ch_char in enumerate(ch):
                            if ch_char not in 'ABCDEFG#b':
                                suffix = ch[i:]
                                break
                        detected_q = suffix if suffix else 'major'
                        if detected_q == q:
                            seg_count += 1
                            total_dur += dur
                dur_pct = total_dur / max(r.get('duration', 1), 1) * 100
                row.append(f'{seg_count} / {total_dur:.1f}s ({dur_pct:.1f}%)')
            lines.append(' | '.join(row) + ' |')

        lines.append('')

        # Differences section
        lines.append('### Différences entre variantes\n')
        r_a = results.get('A')
        r_b = results.get('B')
        r_c = results.get('C')

        if r_a and r_b:
            chords_a = {f"{c['startTime']:.1f}-{c['endTime']:.1f}": c['chord'] for c in r_a['chords']}
            chords_b = {f"{c['startTime']:.1f}-{c['endTime']:.1f}": c['chord'] for c in r_b['chords']}
            chords_c = {f"{c['startTime']:.1f}-{c['endTime']:.1f}": c['chord'] for c in r_c['chords']} if r_c else {}

            # A vs B
            all_keys = sorted(set(list(chords_a.keys()) + list(chords_b.keys()) + list(chords_c.keys())))
            diff_ab = sum(1 for k in all_keys if chords_a.get(k) != chords_b.get(k))
            diff_ac = sum(1 for k in all_keys if chords_a.get(k) != chords_c.get(k))
            diff_bc = sum(1 for k in all_keys if chords_b.get(k) != chords_c.get(k))
            total_slots = len(all_keys)
            lines.append(f'- A vs B : {diff_ab}/{total_slots} segments différents ({diff_ab/max(total_slots,1)*100:.1f}%)')
            lines.append(f'- A vs C : {diff_ac}/{total_slots} segments différents ({diff_ac/max(total_slots,1)*100:.1f}%)')
            lines.append(f'- B vs C : {diff_bc}/{total_slots} segments différents ({diff_bc/max(total_slots,1)*100:.1f}%)')
            lines.append('')

            # Key chord-level differences
            lines.append('| Time | A | B | C |')
            lines.append('|---|---|---|---|')
            for k in all_keys[:30]:  # Show first 30 differences
                va = chords_a.get(k, '-')
                vb = chords_b.get(k, '-')
                vc = chords_c.get(k, '-')
                if va != vb or va != vc:
                    lines.append(f'| {k} | {va} | {vb} | {vc} |')
            if len(all_keys) > 30:
                lines.append(f'| ... | ({len(all_keys) - 30} segments supplémentaires) | | |')
            lines.append('')

    # Write report
    report = '\n'.join(lines)
    with open(REPORT, 'w') as f:
        f.write(report)
    print(f'\nReport written to {REPORT}')


if __name__ == '__main__':
    main()
