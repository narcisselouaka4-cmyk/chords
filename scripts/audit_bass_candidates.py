#!/usr/bin/env python3
"""
Audit Bass Engine candidates against ground truth (A/B/C classification).

For each reference note, checks whether the correct bass note exists among
the internal V2 octave candidates:

  Level A: exact MIDI match found in at least one frame
  Level B: same pitch class found but wrong octave
  Level C: pitch class not found among candidates at all

Usage:
  python scripts/audit_bass_candidates.py --candidates <candidates.json> --gt <ground_truth.csv>
"""
import sys, os, json, csv, argparse

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def note_name(midi):
    return f'{NOTE_NAMES[midi % 12]}{midi // 12 - 1}'


def load_ground_truth(csv_path):
    refs = []
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            start = float(row['start_time'])
            end = float(row['end_time'])
            midi = int(row['midi_note'])
            refs.append({
                'start': start,
                'end': end,
                'midi': midi,
                'note': note_name(midi),
                'pc': midi % 12,
            })
    return refs


def audit(candidates_path, gt_path):
    # Load candidates
    with open(candidates_path) as f:
        candidates_data = json.load(f)

    frames = candidates_data['frames']
    print(f'Loaded {len(frames)} frames from candidates export')
    print(f'Audio duration: {candidates_data["duration"]}s')
    print(f'Frame rate: {candidates_data["frame_rate"]} fps')
    print()

    # Load ground truth
    refs = load_ground_truth(gt_path)
    print(f'Loaded {len(refs)} reference notes from ground truth')
    print()

    # For each reference note, collect candidate info from overlapping frames
    results = []
    overall = {'A': 0, 'B': 0, 'C': 0}

    for ref in refs:
        ref_start = ref['start']
        ref_end = ref['end']
        ref_midi = ref['midi']
        ref_pc = ref['pc']
        ref_note = ref['note']

        # Find frames that overlap this reference note
        relevant_frames = [
            f for f in frames
            if not f.get('silent', False)
            and f['time'] < ref_end
            and f['time'] >= ref_start - (1.0 / candidates_data['frame_rate'])
        ]

        if not relevant_frames:
            results.append({
                'ref_note': ref_note,
                'ref_midi': ref_midi,
                'ref_start': ref_start,
                'ref_end': ref_end,
                'level': 'C',
                'n_frames': 0,
                'details': 'Aucune frame active dans cette plage',
            })
            overall['C'] += 1
            continue

        # Collect all unique candidate MIDIs from overlapping frames
        exact_found = False
        pc_found = False
        best_candidate_info = None

        for f in relevant_frames:
            for cand in f.get('candidates', []):
                cand_midi = cand['midi']
                cand_pc = cand_midi % 12
                if cand_midi == ref_midi:
                    exact_found = True
                    if best_candidate_info is None or cand['score'] > best_candidate_info['score']:
                        best_candidate_info = {
                            'midi': cand_midi,
                            'note': cand['note'],
                            'score': cand['score'],
                            'octave': cand['octave'],
                            'time': f['time'],
                        }
                elif cand_pc == ref_pc:
                    pc_found = True
                    if best_candidate_info is None or cand['score'] > best_candidate_info['score']:
                        best_candidate_info = {
                            'midi': cand_midi,
                            'note': cand['note'],
                            'score': cand['score'],
                            'octave': cand['octave'],
                            'time': f['time'],
                        }

        # Also check the selected notes
        selected_notes = []
        for f in relevant_frames:
            sel = f.get('selected')
            if sel:
                selected_notes.append({
                    'midi': sel['midi'],
                    'note': sel['note'],
                    'confidence': sel['confidence'],
                })

        selected_pc_hits = sum(1 for s in selected_notes if s['midi'] % 12 == ref_pc)
        selected_midi_hits = sum(1 for s in selected_notes if s['midi'] == ref_midi)

        # Count frames where exact PC or MIDI is present among candidates
        frames_with_exact = sum(
            1 for f in relevant_frames
            if any(c['midi'] == ref_midi for c in f.get('candidates', []))
        )
        frames_with_pc = sum(
            1 for f in relevant_frames
            if any(c['midi'] % 12 == ref_pc for c in f.get('candidates', []))
        )

        # Classify
        if exact_found:
            level = 'A'
            overall['A'] += 1
        elif pc_found:
            level = 'B'
            overall['B'] += 1
        else:
            level = 'C'
            overall['C'] += 1

        result = {
            'ref_note': ref_note,
            'ref_midi': ref_midi,
            'ref_start': ref_start,
            'ref_end': ref_end,
            'level': level,
            'n_frames': len(relevant_frames),
            'frames_with_exact': frames_with_exact,
            'frames_with_pc_match': frames_with_pc,
            'selected_hits_midi': selected_midi_hits,
            'selected_hits_pc': selected_pc_hits,
            'best_candidate': best_candidate_info,
            'selected_notes_dominant': max(set(s['note'] for s in selected_notes),
                                           key=lambda n: sum(1 for s in selected_notes if s['note'] == n))
            if selected_notes else None,
        }
        results.append(result)

    # --- Print report ---
    print('=' * 72)
    print('  AUDIT DES CANDIDATS INTERNES — BASS ENGINE V2')
    print('  Morceau : Ton NOM est Jéhovah (extrait 60s)')
    print('=' * 72)
    print()
    print(f'  {"Réf":>8s} | {"Temps":>10s} | {"Niveau":>6s} | {"Frames":>6s} | {"Exact":>5s} | {"PC":>5s} | {"Sél. PC":>7s} | {"Meilleur candidat":>20s}')
    print(f'  {"-"*8} | {"-"*10} | {"-"*6} | {"-"*6} | {"-"*5} | {"-"*5} | {"-"*7} | {"-"*20}')
    for r in results:
        label = r['level']
        bc = r['best_candidate']
        best_str = f'{bc["note"]} (s={bc["score"]:.2f})' if bc else '-'
        print(f'  {r["ref_note"]:>8s} | {r["ref_start"]:.0f}-{r["ref_end"]:.0f}s | {label:>6s} | '
              f'{r["n_frames"]:>6d} | {r["frames_with_exact"]:>5d} | {r["frames_with_pc_match"]:>5d} | '
              f'{r["selected_hits_pc"]:>7d} | {best_str:>20s}')

    print()
    print('=' * 72)
    print('  RÉSUMÉ')
    print('=' * 72)
    print(f'  Niveau A (exact MIDI)     : {overall["A"]}/{len(refs)} ({overall["A"]/len(refs)*100:.1f}%)')
    print(f'  Niveau B (pitch class OK) : {overall["B"]}/{len(refs)} ({overall["B"]/len(refs)*100:.1f}%)')
    print(f'  Niveau C (absent)         : {overall["C"]}/{len(refs)} ({overall["C"]/len(refs)*100:.1f}%)')
    print(f'  Total notes de référence  : {len(refs)}')
    print()

    # Analysis of which pitch classes are problematic
    pc_stats = {}
    for r in results:
        pc = r['ref_midi'] % 12
        if pc not in pc_stats:
            pc_stats[pc] = {'name': NOTE_NAMES[pc], 'total': 0, 'A': 0, 'B': 0, 'C': 0}
        pc_stats[pc]['total'] += 1
        pc_stats[pc][r['level']] += 1

    print('  Par pitch class :')
    print(f'  {"PC":>4s} | {"Note":>4s} | {"Total":>5s} | {"A":>5s} | {"B":>5s} | {"C":>5s}')
    print(f'  {"-"*4} | {"-"*4} | {"-"*5} | {"-"*5} | {"-"*5} | {"-"*5}')
    for pc in sorted(pc_stats.keys()):
        s = pc_stats[pc]
        print(f'  {pc:>4d} | {s["name"]:>4s} | {s["total"]:>5d} | {s["A"]:>5d} | {s["B"]:>5d} | {s["C"]:>5d}')

    # Write full report to JSON
    report_path = os.path.join(
        os.path.dirname(candidates_path),
        'audit_bass_candidates_report.json'
    )
    report = {
        'piece': 'Ton NOM est Jéhovah',
        'duration': candidates_data['duration'],
        'n_refs': len(refs),
        'n_frames': len(frames),
        'summary': {
            'A_exact_midi': overall['A'],
            'B_pitch_class': overall['B'],
            'C_absent': overall['C'],
            'A_pct': round(overall['A'] / len(refs) * 100, 1),
            'B_pct': round(overall['B'] / len(refs) * 100, 1),
            'C_pct': round(overall['C'] / len(refs) * 100, 1),
        },
        'per_note': results,
    }
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f'\n  Rapport détaillé : {report_path}')
    print()


def main():
    parser = argparse.ArgumentParser(
        description='Audit Bass Engine candidates against ground truth (A/B/C)')
    parser.add_argument('--candidates', required=True,
                        help='Candidates JSON from export_bass_candidates.py')
    parser.add_argument('--gt', required=True,
                        help='Ground truth CSV (start_time,end_time,midi_note)')
    args = parser.parse_args()

    for p in [args.candidates, args.gt]:
        if not os.path.isfile(p):
            print(f'[ERROR] File not found: {p}')
            return 1

    audit(args.candidates, args.gt)
    return 0


if __name__ == '__main__':
    sys.exit(main())
