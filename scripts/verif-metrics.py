#!/usr/bin/env python3
"""Step 1 — verification complete du 41,3% sur les 4 progressions.
Tableau segment par segment pour chaque progression.
Recalcul independant de la metrique.
"""
import json, os, sys, subprocess, re
from collections import defaultdict

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_PROC = os.path.join(PROJECT, 'electron', 'audio-processor.py')
PYTHON = os.path.join(PROJECT, '.venv', 'bin', 'python')
PROG_DIR = os.path.join(PROJECT, 'tests', 'audio', 'progressions')

NOTE_SHARP = set('C D E F G A'.split())
NOTE_SHARP_2 = {'C#', 'D#', 'F#', 'G#', 'A#'}
FLAT_TO_SHARP = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
}

def normalize_root(r):
    r = r.strip()
    r2 = r[:2]; r1 = r[:1]
    if r2 in FLAT_TO_SHARP: return FLAT_TO_SHARP[r2]
    if r2 in NOTE_SHARP_2: return r2
    if r1 in FLAT_TO_SHARP: return FLAT_TO_SHARP[r1]
    if r1 in NOTE_SHARP: return r1
    return r

QUALITY_MAP = {
    'major': '', 'minor': 'm', 'min': 'm',
    'min7': 'm7', 'dom7': '7',
    'dim': 'dim', 'hdim7': 'm7b5', 'hdim': 'm7b5',
    'half-diminished': 'm7b5', 'aug': 'aug',
}

def normalize_quality(q):
    return QUALITY_MAP.get(q.strip(), q.strip())

def parse_chord_label(chord_str):
    if chord_str == 'N' or not chord_str:
        return None, None
    m = re.match(r'^([A-G][#b]?)(.*)', chord_str)
    if not m: return None, None
    root_raw = m.group(1); suffix = m.group(2).strip()
    if suffix and suffix[0] in ('#', 'b'):
        root_raw += suffix[0]; suffix = suffix[1:].strip()
    return normalize_root(root_raw), normalize_quality(suffix)

def time_overlap(a_s, a_e, b_s, b_e):
    return max(0.0, min(a_e, b_e) - max(a_s, b_s))

def run_variant(wav, variant):
    cmd = [PYTHON, AUDIO_PROC, 'analyze-chords', wav, 'legacy', variant]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        return None
    json_lines = [l for l in r.stdout.splitlines() if l.startswith('{') or l.startswith('[')]
    if not json_lines: return None
    return json.loads(json_lines[-1])

def compute_segment_table(gt_segs, det_segs):
    rows = []
    for gs in gt_segs:
        gs_root = normalize_root(gs['root'])
        gs_qual = normalize_quality(gs['quality'])
        gs_s = gs['start_time']; gs_e = gs['end_time']
        best_ov = 0.0; best_det = None
        for ds in det_segs:
            dr, dq = parse_chord_label(ds.get('chord', ''))
            if dr is None: continue
            ov = time_overlap(gs_s, gs_e, ds['startTime'], ds['endTime'])
            if ov > best_ov:
                best_ov = ov
                best_det = (dr, dq, ds['startTime'], ds['endTime'], ds.get('chord', ''))
        if best_det:
            dr, dq, ds_s, ds_e, dchord = best_det
            rows.append({
                'gt_s': gs_s, 'gt_e': gs_e,
                'gt_root': gs_root, 'gt_qual': gs_qual,
                'det_chord': dchord, 'det_root': dr, 'det_qual': dq,
                'det_s': ds_s, 'det_e': ds_e, 'overlap': best_ov,
                'root_ok': dr == gs_root, 'qual_ok': dq == gs_qual,
            })
        else:
            rows.append({
                'gt_s': gs_s, 'gt_e': gs_e,
                'gt_root': gs_root, 'gt_qual': gs_qual,
                'det_chord': '?', 'det_root': None, 'det_qual': None,
                'det_s': None, 'det_e': None, 'overlap': 0.0,
                'root_ok': False, 'qual_ok': False,
            })
    return rows

def analyse_one(name, gt_data, result_a, result_c):
    gt_segs = gt_data['segments']
    progress = gt_data['progression']
    n_uniq = len(progress)
    n_repeats = gt_data['repeats']
    chord_dur = gt_data['chord_duration']
    dur_total = chord_dur * n_uniq * n_repeats

    det_a = result_a.get('chords', [])
    det_c = result_c.get('chords', [])
    rows_a = compute_segment_table(gt_segs, det_a)
    rows_c = compute_segment_table(gt_segs, det_c)

    sep = '-' * 150
    hdr = (
        f"{'#':>3} {'start':>6} {'end':>6}  "
        f"{'Attendu':>10}  "
        f"{'A_out':>10} {'ov_A':>5} {'r_A':>5} {'q_A':>5}  "
        f"{'C_out':>10} {'ov_C':>5} {'r_C':>5} {'q_C':>5}"
    )
    print(sep); print(hdr); print(sep)

    qual_ok_a = 0.0; qual_ok_c = 0.0
    root_ok_a = 0.0; root_ok_c = 0.0

    for i, (ra, rc) in enumerate(zip(rows_a, rows_c)):
        gt_label = ra['gt_root'] + ra['gt_qual']
        line = (
            f"{i:>3} {ra['gt_s']:>6.1f} {ra['gt_e']:>6.1f}  "
            f"{gt_label:>10}  "
            f"{ra['det_chord']:>10} {ra['overlap']:>5.2f} {str(ra['root_ok']):>5} {str(ra['qual_ok']):>5}  "
            f"{rc['det_chord']:>10} {rc['overlap']:>5.2f} {str(rc['root_ok']):>5} {str(rc['qual_ok']):>5}"
        )
        print(line)
        if ra['qual_ok']: qual_ok_a += ra['overlap']
        if rc['qual_ok']: qual_ok_c += rc['overlap']
        if ra['root_ok']: root_ok_a += ra['overlap']
        if rc['root_ok']: root_ok_c += rc['overlap']
    print(sep)

    full_a = sum(r['overlap'] for r in rows_a if r['root_ok'] and r['qual_ok'])
    full_c = sum(r['overlap'] for r in rows_c if r['root_ok'] and r['qual_ok'])

    result = {
        'name': name,
        'dur_total': dur_total,
        'A': {'root': root_ok_a, 'qual': qual_ok_a, 'full': full_a},
        'C': {'root': root_ok_c, 'qual': qual_ok_c, 'full': full_c},
        'rows': len(rows_a),
    }

    print(f'\n  Durée GT: {dur_total:.1f}s')
    print(f'  A: root={root_ok_a/dur_total*100:.1f}%  qual={qual_ok_a/dur_total*100:.1f}%  full={full_a/dur_total*100:.1f}%')
    print(f'  C: root={root_ok_c/dur_total*100:.1f}%  qual={qual_ok_c/dur_total*100:.1f}%  full={full_c/dur_total*100:.1f}%')

    # Per-chord analysis
    print(f'\n  Analyse par accord:')
    for ci, chord in enumerate(progress):
        er = normalize_root(chord['root'])
        eq = normalize_quality(chord['quality'])
        label = er + eq
        total_dur = chord_dur * n_repeats
        qual_a = 0.0; qual_c = 0.0
        root_a = 0.0; root_c = 0.0
        a_det = defaultdict(float)
        c_det = defaultdict(float)
        for ri in range(n_repeats):
            idx = ci + ri * n_uniq
            ra = rows_a[idx]; rc = rows_c[idx]
            if ra['qual_ok']: qual_a += ra['overlap']
            if rc['qual_ok']: qual_c += rc['overlap']
            if ra['root_ok']: root_a += ra['overlap']
            if rc['root_ok']: root_c += rc['overlap']
            a_det[ra['det_qual']] += ra['overlap']
            c_det[rc['det_qual']] += rc['overlap']
        a_str = ', '.join(f'{q}={d/total_dur*100:.0f}%' for q, d in sorted(a_det.items(), key=lambda x: -x[1]))
        c_str = ', '.join(f'{q}={d/total_dur*100:.0f}%' for q, d in sorted(c_det.items(), key=lambda x: -x[1]))
        print(f'    {label:>8}: qual_A={qual_a/total_dur*100:.0f}%  qual_C={qual_c/total_dur*100:.0f}%')
        print(f'             A->{a_str}')
        print(f'             C->{c_str}')

    return result


def main():
    wav_files = sorted(f for f in os.listdir(PROG_DIR) if f.endswith('.wav'))
    if not wav_files:
        print('No WAV files'); sys.exit(1)

    all_results = {}
    total_dur = 0.0
    total_root_a = 0.0; total_qual_a = 0.0; total_full_a = 0.0
    total_root_c = 0.0; total_qual_c = 0.0; total_full_c = 0.0

    for wf in wav_files:
        wav_path = os.path.join(PROG_DIR, wf)
        gt_path = wav_path.replace('.wav', '.json')
        if not os.path.exists(gt_path):
            print(f'SKIP: {wf}'); continue
        with open(gt_path) as f: gt = json.load(f)
        name = wf.replace('.wav', '')

        print(f'\n{"="*70}')
        print(f'=== {name} ===')
        print(f'{"="*70}')

        r_a = run_variant(wav_path, 'legacy_family_fix')
        r_c = run_variant(wav_path, 'hybrid')
        if not r_a or not r_c:
            print(f'FAILED {wf}'); continue

        res = analyse_one(name, gt, r_a, r_c)
        all_results[name] = res
        d = res['dur_total']
        total_dur += d
        total_root_a += res['A']['root']
        total_qual_a += res['A']['qual']
        total_full_a += res['A']['full']
        total_root_c += res['C']['root']
        total_qual_c += res['C']['qual']
        total_full_c += res['C']['full']

    # Global summary
    print(f'\n{"="*70}')
    print('=== VERIFICATION GLOBALE ===')
    print(f'{"="*70}')
    print(f'\nTotal duree: {total_dur:.1f}s\n')
    print(f'  {"Progression":>30}  {"A_qual%":>8}  {"C_qual%":>8}  {"A_root%":>8}  {"C_root%":>8}')
    print(f'  {"-"*30}  {"-"*8}  {"-"*8}  {"-"*8}  {"-"*8}')
    for name, res in all_results.items():
        print(f'  {name:>30}  {res["A"]["qual"]/res["dur_total"]*100:>7.1f}%  {res["C"]["qual"]/res["dur_total"]*100:>7.1f}%  '
              f'{res["A"]["root"]/res["dur_total"]*100:>7.1f}%  {res["C"]["root"]/res["dur_total"]*100:>7.1f}%')

    print(f'  {"-"*30}  {"-"*8}  {"-"*8}  {"-"*8}  {"-"*8}')
    print(f'  {"TOTAL":>30}  {total_qual_a/total_dur*100:>7.1f}%  {total_qual_c/total_dur*100:>7.1f}%  '
          f'{total_root_a/total_dur*100:>7.1f}%  {total_root_c/total_dur*100:>7.1f}%')

    expected = 0.413
    qa_a = total_qual_a / total_dur
    qa_c = total_qual_c / total_dur
    if abs(qa_a - expected) < 0.005 and abs(qa_c - expected) < 0.005:
        print(f'\n>>> CONFIRME: quality accuracy A={qa_a*100:.1f}% C={qa_c*100:.1f}% == 41.3% <<<')
    else:
        print(f'\n>>> ATTENTION: ecart A={qa_a*100:.1f}% C={qa_c*100:.1f}% vs 41.3% <<<')

    # Check differences between A and C
    diffs_found = False
    for name, res in all_results.items():
        if abs(res['A']['qual'] - res['C']['qual']) > 0.01:
            diffs_found = True
    if diffs_found:
        print(f'\n>>> A et C DIFFERENT sur certaines progressions <<<')
    else:
        print(f'\n>>> A et C IDENTIQUES sur toutes les progressions (qualite) <<<')


if __name__ == '__main__':
    main()
