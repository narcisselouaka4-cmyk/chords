#!/usr/bin/env python3
"""
Validate a ground truth CSV file for bass annotation.

Format attendu :
  start_time,end_time,midi_note
  0.0000,0.4500,45
  ...

Checks :
  - En-têtes corrects (start_time,end_time,midi_note)
  - Temps croissants, pas de chevauchement
  - Durées > 0
  - MIDI dans [24, 84]
  - Pas de notes identiques consécutives sauf si même temps
  - Gap max entre notes < 2× la durée de note moyenne

Usage :
  python scripts/validate_ground_truth.py <csv_path>
"""

import sys, os, csv


def validate(csv_path):
    print(f'Validation : {csv_path}')
    print()

    if not os.path.isfile(csv_path):
        print(f'  [ERROR] Fichier introuvable : {csv_path}')
        return False

    with open(csv_path, newline='') as f:
        reader = csv.reader(f)
        rows = list(reader)

    if len(rows) < 2:
        print(f'  [ERROR] Fichier vide ou sans données ({len(rows)} lignes)')
        return False

    header = rows[0]
    expected = ['start_time', 'end_time', 'midi_note']
    if header != expected:
        print(f'  [ERROR] En-têtes incorrects : {header}')
        print(f'          Attendu : {expected}')
        return False

    data = []
    errors = []
    for i, row in enumerate(rows[1:], start=2):
        line = i
        if len(row) != 3:
            errors.append(f'  Ligne {line} : {len(row)} colonnes au lieu de 3')
            continue
        try:
            start = float(row[0])
            end = float(row[1])
            midi = int(row[2])
        except ValueError as e:
            errors.append(f'  Ligne {line} : conversion impossible — {e}')
            continue
        data.append((line, start, end, midi))

    if errors:
        for e in errors:
            print(e)
        return False

    n = len(data)
    print(f'  Lignes valides : {n}')
    print(f'  Plage temporelle : {data[0][1]:.4f}s – {data[-1][2]:.4f}s')

    start_times = [d[1] for d in data]
    end_times = [d[2] for d in data]
    midis = [d[3] for d in data]

    # MIDI range
    for line, s, e, m in data:
        if not (24 <= m <= 84):
            errors.append(f'  Ligne {line} : MIDI {m} hors plage [24, 84]')

    # Durées positives
    for line, s, e, m in data:
        dur = e - s
        if dur <= 0:
            errors.append(f'  Ligne {line} : durée {dur:.4f} ≤ 0')

    # Times croissants
    for i in range(1, n):
        if start_times[i] < start_times[i - 1]:
            errors.append(f'  Ligne {data[i][0]} : start_time {start_times[i]:.4f} < précédent {start_times[i-1]:.4f}')
        if start_times[i] < end_times[i - 1]:
            errors.append(f'  Ligne {data[i][0]} : start {start_times[i]:.4f} < end précédent {end_times[i-1]:.4f} (chevauchement)')

    # Gap analysis
    if n > 1:
        gaps = [start_times[i] - end_times[i - 1] for i in range(1, n)]
        avg_gap = sum(gaps) / len(gaps) if gaps else 0.0
        max_gap = max(gaps) if gaps else 0.0
        avg_dur = sum(e - s for s, e in zip(start_times, end_times)) / n
        print(f'  Durée moyenne des notes  : {avg_dur:.4f}s')
        print(f'  Gap moyen entre notes    : {avg_gap:.4f}s')
        print(f'  Gap max                  : {max_gap:.4f}s')
        if max_gap > 2 * avg_dur:
            errors.append(f'  Gap max ({max_gap:.4f}s) > 2× durée moyenne ({avg_dur:.4f}s) — possible annotation incomplète')

    # Pas de notes consécutives identiques (sauf si même temps)
    for i in range(1, n):
        if midis[i] == midis[i - 1] and start_times[i] != start_times[i - 1]:
            print(f'  [WARN] Ligne {data[i][0]} : MIDI {midis[i]} identique à la précédente — possible sur-segmentation')

    # MIDI range global
    print(f'  MIDI min        : {min(midis)}')
    print(f'  MIDI max        : {max(midis)}')
    print(f'  MIDI unique     : {len(set(midis))}')

    if errors:
        print()
        for e in errors:
            print(f'  [ERROR] {e}')
        print(f'\n  {len(errors)} erreur(s) — INVALIDE')
        return False

    print()
    print(f'  Tous les contrôles passés — VALIDE')
    return True


def main():
    if len(sys.argv) < 2:
        print(f'Usage: python {os.path.basename(__file__)} <csv_path>')
        return 1
    ok = validate(sys.argv[1])
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
