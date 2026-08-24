#!/usr/bin/env python3
"""Batterie B5 — voicings jazz.

Test de robustesse d'identification d'accords sur des voicings jazz réalistes,
pas de timing. 20 cas répartis en 5 familles de 4 cas :

  F1 sans fondamentale — la basse joue une note autre que la fondamentale
      (quinte, tierce, septième). Le moteur doit identifier l'accord depuis
      les voix supérieures.
  F2 upper structures — triade superposée sur un accord de base (ex: F triad
      over C7 = C13). Le moteur doit identifier l'accord complet.
  F3 quartal / clusters — voicings en quartes et clusters denses. Pas de
      position fondamentale claire.
  F4 renversements / slash chords — accord avec basse différente (C/E, G/B,
      Am/C). Le moteur doit identifier la fondamentale harmonique.
  F5 tensions (9, 11, 13, altérations) — accords enrichis avec tensions.

Chaque cas : 4 accords × 2 répétitions = 8 segments, tempo 90 BPM.

Sous-commandes : generate, run (même chaîne que B1-B4).
"""

import argparse
import collections
import importlib.util
import json
import os
import shutil
import statistics
import subprocess
import sys
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b5')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b5')

_b1 = None


def b1():
    global _b1
    if _b1 is None:
        spec = importlib.util.spec_from_file_location(
            'corpus_b1', os.path.join(PROJECT, 'scripts', 'corpus_b1.py'))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _b1 = mod
    return _b1


def ap():
    return b1().ap()


PITCH = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
         'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def note(name, octave):
    return PITCH[name] + 12 * (octave + 1)


TEMPO = 90
REPEATS = 2


# Chaque cas = (label, family, [(voicing_notes, expected_chord), ...])
# voicing_notes = liste de (pitch_midi, velocity) — la basse en premier.
# expected_chord = "Root:quality" — ce que le moteur DOIT identifier.
# La vérité terrain est l'accord harmonique, pas la basse.

def midi_notes(name_octave_list):
    """['C', 2, 'E', 4, 'G', 4] → [(pitch, vel), ...] avec basse vel 92."""
    notes = []
    for i in range(0, len(name_octave_list), 2):
        name = name_octave_list[i]
        octv = name_octave_list[i + 1]
        pitch = note(name, octv)
        vel = 92 if i == 0 else 80  # basse plus forte
        notes.append((pitch, vel))
    return notes


CASES = [
    # F1 — sans fondamentale. La basse joue la quinte ou la tierce.
    # Le moteur doit identifier l'accord depuis les voix supérieures.
    ('f1_no_root', 'sans fondamentale (basse=quinte)', [
        # Cmaj avec basse G (quinte) : C-E-G voicé, basse G2
        (midi_notes(['G', 2, 'E', 4, 'G', 4, 'C', 5]), 'C:maj'),
        # Fmaj avec basse C (quinte) : F-A-C voicé, basse C3
        (midi_notes(['C', 3, 'A', 4, 'C', 5, 'F', 5]), 'F:maj'),
        # Dmin avec basse A (quinte)
        (midi_notes(['A', 2, 'F', 4, 'A', 4, 'D', 5]), 'D:min'),
        # G7 avec basse D (quinte)
        (midi_notes(['D', 3, 'F', 4, 'A', 4, 'G', 5, 'B', 5]), 'G:7'),
    ]),
    # F2 — upper structures. Triade superposée sur accord de base.
    # C7(13) = F triad over C7 : C-E-Bb (C7) + F-A-D (F triad)
    ('f2_upper', 'upper structures', [
        # C13 : basse C2, voicing E4-F4-A4-Bb4-D5
        (midi_notes(['C', 2, 'E', 4, 'F', 4, 'A', 4, 'A#', 4, 'D', 5]), 'C:7'),
        # Dm11 : basse D2, voicing F4-A4-C5-E5-G5
        (midi_notes(['D', 2, 'F', 4, 'A', 4, 'C', 5, 'E', 5, 'G', 5]), 'D:min'),
        # G7(b9) : basse G2, voicing B4-Db5-F5-Ab5
        (midi_notes(['G', 2, 'B', 4, 'C#', 5, 'F', 5, 'G#', 5]), 'G:7'),
        # Cmaj9 : basse C2, voicing E4-G4-B4-D5
        (midi_notes(['C', 2, 'E', 4, 'G', 4, 'B', 4, 'D', 5]), 'C:maj'),
    ]),
    # F3 — quartal / clusters. Voicings en quartes.
    ('f3_quartal', 'quartal / clusters', [
        # Cmaj7 quartal : E4-A4-D4-G4 (quartes)
        (midi_notes(['C', 2, 'E', 4, 'A', 4, 'D', 4, 'G', 4]), 'C:maj'),
        # Fm11 quartal : F4-Bb4-Eb5-Ab5
        (midi_notes(['F', 2, 'F', 4, 'A#', 4, 'D#', 5, 'G#', 5]), 'F:min'),
        # Dm7 quartal : D4-G4-C5-F5
        (midi_notes(['D', 2, 'D', 4, 'G', 4, 'C', 5, 'F', 5]), 'D:min'),
        # G7 quartal : G4-C5-F5-Bb5
        (midi_notes(['G', 2, 'G', 4, 'C', 5, 'F', 5, 'A#', 5]), 'G:7'),
    ]),
    # F4 — renversements / slash chords. Basse différente de la fondamentale.
    ('f4_slash', 'renversements / slash', [
        # C/E : basse E2, accord C-E-G
        (midi_notes(['E', 2, 'C', 4, 'E', 4, 'G', 4]), 'C:maj'),
        # G/B : basse B2, accord G-B-D
        (midi_notes(['B', 2, 'D', 4, 'G', 4, 'B', 4]), 'G:maj'),
        # Am/C : basse C3, accord A-C-E
        (midi_notes(['C', 3, 'A', 4, 'C', 5, 'E', 5]), 'A:min'),
        # D/F# : basse F#2, accord D-F#-A
        (midi_notes(['F#', 2, 'D', 4, 'F#', 4, 'A', 4]), 'D:maj'),
    ]),
    # F5 — tensions (9, 11, 13, altérations).
    ('f5_tensions', 'tensions 9/11/13', [
        # Cmaj9 : C-E-G-B-D
        (midi_notes(['C', 2, 'C', 4, 'E', 4, 'G', 4, 'B', 4, 'D', 5]), 'C:maj'),
        # Fm9 : F-Ab-C-Eb-G
        (midi_notes(['F', 2, 'F', 4, 'G#', 4, 'C', 5, 'D#', 5, 'G', 5]), 'F:min'),
        # G7b9 : G-B-F-Ab
        (midi_notes(['G', 2, 'G', 4, 'B', 4, 'F', 5, 'G#', 5]), 'G:7'),
        # Dm7b5 : D-F-Ab-C (half-diminished)
        (midi_notes(['D', 2, 'D', 4, 'F', 4, 'G#', 4, 'C', 5]), 'D:min'),
    ]),
]


def cmd_generate(args):
    try:
        import pretty_midi
    except ImportError:
        sys.exit('pretty_midi manquant')
    if not shutil.which('fluidsynth'):
        sys.exit('fluidsynth introuvable')
    sf2 = b1().soundfont()
    os.makedirs(CORPUS_DIR, exist_ok=True)
    index = []
    beat = 60.0 / TEMPO
    bar = beat * 4
    for fam_idx, (fam_id, fam_label, voicings) in enumerate(CASES, start=1):
        case_id = f'b5_{fam_id}'
        pm = pretty_midi.PrettyMIDI(initial_tempo=float(TEMPO))
        piano = pretty_midi.Instrument(program=0)
        segments = []
        t = 0.0
        for _ in range(REPEATS):
            for voicing_notes, expected in voicings:
                for pitch, vel in voicing_notes:
                    piano.notes.append(pretty_midi.Note(
                        velocity=int(vel), pitch=int(pitch),
                        start=t, end=t + bar * 0.98))
                segments.append({
                    'start': round(t, 6),
                    'end': round(t + bar, 6),
                    'chord': expected,
                })
                t += bar
        pm.instruments.append(piano)
        midi_path = os.path.join(CORPUS_DIR, f'{case_id}.mid')
        wav_path = os.path.join(CORPUS_DIR, f'{case_id}.wav')
        pm.write(midi_path)
        proc = subprocess.run(
            ['fluidsynth', '-ni', '-F', wav_path, '-r', '44100',
             '-o', 'synth.reverb.active=0', '-o', 'synth.chorus.active=0',
             '-g', '0.8', sf2, midi_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if proc.returncode != 0 or not os.path.exists(wav_path):
            sys.exit(f'fluidsynth a échoué sur {case_id}:\n{proc.stderr[-400:]}')
        gt = {'caseId': case_id, 'battery': 'B5', 'family': fam_id,
              'familyLabel': fam_label, 'tempo': float(TEMPO),
              'duration': round(t, 6), 'status': 'exact',
              'source': ("Audio rendu depuis cette grille. Voicings jazz avec "
                         "basse, tensions, renversements. Vérité terrain = "
                         "l'accord harmonique attendu."),
              'segments': segments}
        with open(os.path.join(CORPUS_DIR, f'{case_id}.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(gt, f, ensure_ascii=False, indent=2)
        index.append({'caseId': case_id, 'family': fam_id,
                      'familyLabel': fam_label, 'tempo': TEMPO,
                      'duration': round(t, 6),
                      'wav': os.path.relpath(wav_path, PROJECT)})
        print(f'  {case_id:<22} {fam_label:<30} {t:6.1f}s  {len(segments):>2} accords')
    with open(os.path.join(CORPUS_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'battery': 'B5', 'soundfont': sf2,
                   'generated': datetime.now().isoformat(timespec='seconds'),
                   'cases': index}, f, ensure_ascii=False, indent=2)
    print(f'\n{len(index)} cas générés dans {CORPUS_DIR}')


def cmd_run(args):
    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f"corpus B5 absent : lance `python3 {sys.argv[0]} generate`")
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)
    flags = {n: getattr(ap(), n) for n in dir(ap()) if n.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = 'unknown'
    report = {'label': args.label, 'battery': 'B5', 'commit': commit, 'flags': flags,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    par_fam = collections.defaultdict(list)
    print(f"{'cas':<24}{'famille':<32}{'majmin':>9}{'sevenths':>10}{'seg':>10}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"),
                  encoding='utf-8') as f:
            gt = json.load(f)
        result = ap().analyze_chords(os.path.join(PROJECT, case['wav']), 'legacy')
        scored = b1().score_case(gt, result)
        if scored is None:
            print(f"{case['caseId']:<24}  aucun accord")
            continue
        report['cases'][case['caseId']] = scored
        par_fam[case['family']].append(scored)
        print(f"{case['caseId']:<24}{case['familyLabel']:<32}"
              f"{scored['majmin']:>8.1%}{scored['sevenths']:>10.1%}"
              f"{str(scored['segments_pred']) + '/' + str(scored['segments_gt']):>10}")
    if not report['cases']:
        sys.exit('aucun cas mesuré')
    print()
    print(f"{'famille':<32}{'cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}")
    resume = {}
    for fam_id, cases in par_fam.items():
        mm = sum(c['majmin'] for c in cases) / len(cases)
        ms = sum(c['sevenths'] for c in cases) / len(cases)
        resume[fam_id] = {'label': cases[0].get('familyLabel', fam_id),
                          'cases': len(cases), 'csr_majmin': mm, 'csr_sevenths': ms}
        print(f"{fam_id:<32}{len(cases):>5}{mm:>13.2%}{ms:>16.2%}")
    tous = list(report['cases'].values())
    globals_ = {
        'cases': len(tous),
        'csr_majmin': sum(c['majmin'] for c in tous) / len(tous),
        'csr_sevenths': sum(c['sevenths'] for c in tous) / len(tous),
    }
    report['global'] = globals_
    report['families'] = resume
    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}")
    print(f"{'B5':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}")
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{args.label}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f'rapport : {out}')


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    p_gen = sub.add_parser('generate')
    p_gen.set_defaults(func=cmd_generate)
    p_run = sub.add_parser('run')
    p_run.add_argument('--label', default='b5')
    p_run.set_defaults(func=cmd_run)
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()