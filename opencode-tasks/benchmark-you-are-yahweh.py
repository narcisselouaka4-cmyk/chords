#!/usr/bin/env python3
"""Benchmark You are Yahweh — compare la sortie du moteur au ground truth.

Métriques :
  - segmentation par fondamentale sur une grille fine (0.25s)
  - durée des fondamentales structurelles (A, D, E, F#m) vs parasites
  - correspondance temporelle par section (overlap IoU moyen)
  - nombre de segments parasites (B, C#m7, C#sus4, Fm, Dm)

Usage :
  python3 opencode-tasks/benchmark-you-are-yahweh.py [--mode raw|legacy|grid]
"""
import importlib.util, os, json, argparse, sys

PROJECT = '/home/visiteur/piano-jazz-chords'
AP_PATH = os.path.join(PROJECT, 'electron', 'audio-processor.py')
GT_PATH = os.path.join(PROJECT, 'opencode-tasks', 'ground-truth-you-are-yahweh.json')

spec = importlib.util.spec_from_file_location('audio_processor', AP_PATH)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Accords structurels autorisés (PC de la fondamentale).
STRUCTURAL_PC = {pc for pc, n in enumerate(NOTE_NAMES) if n in ('A', 'D', 'E', 'F#')}
PARASITE_LABELS = {'B', 'C#m7', 'C#sus4', 'C#', 'Fm', 'Dm', 'F', 'G'}

STEP = 0.25

def root_of(chord):
    if not chord or chord == 'N':
        return None
    import re
    m = re.match(r'^([A-G][#b]?)(.*)$', chord)
    if not m:
        return None
    name = m.group(1)
    return NOTE_NAMES.index(name) if name in NOTE_NAMES else None

def discretize(chords, duration):
    """Retourne un tableau de fondamentales (PC) par pas de STEP secondes."""
    n = int(duration / STEP) + 1
    grid = [None] * n
    for c in chords:
        r = root_of(c['chord'])
        if r is None:
            continue
        s = c.get('startTime', c.get('start', 0))
        e = c.get('endTime', c.get('end', 0))
        i0 = max(0, int(s / STEP))
        i1 = min(n, int(e / STEP) + 1)
        for i in range(i0, i1):
            grid[i] = r
    return grid

def compare(gt_seg, det_seg, duration):
    """Compare deux grilles de fondamentales. Retourne métriques."""
    n = min(len(gt_seg), len(det_seg))
    correct = sum(1 for i in range(n) if gt_seg[i] is not None
                  and det_seg[i] == gt_seg[i])
    structural_correct = sum(1 for i in range(n) if det_seg[i] in STRUCTURAL_PC
                             and gt_seg[i] == det_seg[i])
    gt_struct = sum(1 for i in range(n) if gt_seg[i] in STRUCTURAL_PC)
    return {
        'frames': n,
        'exact_matches': correct,
        'exact_pct': 100.0 * correct / max(1, n),
        'structural_frames_in_gt': gt_struct,
        'structural_correct': structural_correct,
        'structural_recall_pct': 100.0 * structural_correct / max(1, gt_struct),
    }

def section_overlap(gt_chords, det_chords):
    """Overlap moyen par section du ground truth (intro/verse/chorus/outro)."""
    results = []
    for g in gt_chords:
        gs, ge, gch = g['start'], g['end'], g['chord']
        gr = root_of(gch)
        if gr is None:
            continue
        # union des segments détectés chevauchant [gs,ge]
        union = 0.0
        for d in det_chords:
            ds, de = d['startTime'], d['endTime']
            ov = max(0.0, min(ge, de) - max(gs, ds))
            if ov > 0 and root_of(d['chord']) == gr:
                union += ov
        dur = ge - gs
        iou = union / dur if dur > 0 else 0.0
        results.append({'section': g.get('section', '?'),
                        'gt': gch, 'start': gs, 'end': ge,
                        'overlap_pct': round(100 * iou, 1)})
    return results

def run(mode='raw'):
    r = ap.analyze_chords('/tmp/local_piano3.wav', clean_mode=mode, debug=False)
    return r

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', default='raw')
    args = parser.parse_args()
    gt = json.load(open(GT_PATH))
    gt_chords = gt['segments']
    duration = gt.get('duration_seconds', 141)

    r = run(args.mode)
    det = r.get('chords', [])
    print(f"KEY={r.get('key')} BPM={r.get('tempo')} N={len(det)}")

    gt_grid = discretize(gt_chords, duration)
    det_grid = discretize(det, duration)
    m = compare(gt_grid, det_grid, duration)
    print("\n--- Métriques globales ---")
    for k, v in m.items():
        print(f"  {k}: {v}")

    # Durée par fondamentale
    by_root = {}
    for c in det:
        rr = root_of(c['chord'])
        if rr is None:
            continue
        by_root[rr] = by_root.get(rr, 0.0) + (c['endTime'] - c['startTime'])
    total = sum(by_root.values()) or 1.0
    print("\n--- Durée par fondamentale ---")
    for pc, dur in sorted(by_root.items(), key=lambda x: -x[1]):
        mark = 'STRUCT' if pc in STRUCTURAL_PC else 'PARASITE'
        print(f"  {NOTE_NAMES[pc]:>2s}  {dur:6.2f}s  {100*dur/total:5.1f}%  [{mark}]")
    struct_dur = sum(d for pc, d in by_root.items() if pc in STRUCTURAL_PC)
    print(f"\nDurée structurelle (A,D,E,F#m): {struct_dur:.2f}s / {total:.2f}s = {100*struct_dur/total:.1f}%")

    # Segments parasites
    parasites = [c for c in det if c['chord'] in PARASITE_LABELS
                 or (c['chord'].startswith('B') and c['chord'] not in ('Bb',))]
    print(f"\nSegments parasites: {len(parasites)}")
    for c in parasites:
        print(f"  {c['startTime']:6.2f}-{c['endTime']:6.2f}  {c['chord']}")

    # Overlap par section
    ov = section_overlap(gt_chords, det)
    avg = sum(s['overlap_pct'] for s in ov) / max(1, len(ov))
    print(f"\n--- Overlap moyen par section: {avg:.1f}% ---")
    for s in ov[:8]:
        print(f"  {s['section']:6s} {s['gt']:>4s} {s['start']:6.1f}-{s['end']:6.1f}  {s['overlap_pct']:5.1f}%")

if __name__ == '__main__':
    main()