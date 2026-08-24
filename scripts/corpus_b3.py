#!/usr/bin/env python3
"""Batterie B3 — anticipation de basse.

Hypothèse à tester (documentée dans le plan de corpus) : le bass-engine
tire-t-il les frontières en avance parce qu'il suit une basse qui anticipe
réellement la fondamentale du prochain accord ?

B3 reproduit ce phénomène en conditions contrôlées : la basse joue la
fondamentale du prochain accord un peu avant le changement d'harmonie
(1/16, 1/8, 1/4 de temps), pendant que l'harmonie supérieure reste sur
l'accord courant. Un moteur qui suit la basse produira des frontières en
avance ; un moteur qui suit l'harmonie produira des frontières justes.

Conception :
  - 5 progressions (les mêmes que B1, pour la comparabilité) × 4 tempos =
    20 cas.
  - Pour chaque cas, 3 niveaux d'anticipation (1/16, 1/8, 1/4) sont joués
    successivement, chacun répété 2 fois. La vérité terrain note l'accord
    d'harmonie (pas la basse anticipée) : c'est elle que le moteur doit
    suivre.
  - Voicing : basse à l'octave 2 (vélocité 92, comme un bassiste), harmonie
    plaquée à l'octave 4 (vélocité 80). La basse est plus forte que
    l'harmonie — c'est le cas réel où le bassiste est audible.

Sous-commandes
--------------
  generate : produit les 20 cas (MIDI → WAV + vérité terrain JSON)
  run      : exécute le moteur et affiche le tableau de scores

Exemples
--------
  python3 scripts/corpus_b3.py generate
  python3 scripts/corpus_b3.py run --label avant
  python3 scripts/corpus_b3.py run --label apres --compare avant
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
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b3')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b3')

_b1 = None


def b1():
    """Réutilise le générateur et le scoring de B1 : mêmes métriques."""
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
INTERVALS = {'maj': [0, 4, 7], 'min': [0, 3, 7], '7': [0, 4, 7, 10],
             'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10]}


def note(name, octave):
    return PITCH[name] + 12 * (octave + 1)


# 5 progressions × 4 tempos = 20 cas. Mêmes progressions que B1 pour la
# comparabilité, avec une tonalité mineure (Am) pour exercer la détection.
PROGRESSIONS = [
    ('I-IV-V-I', 'C', [('C', 'maj'), ('F', 'maj'), ('G', 'maj'), ('C', 'maj')]),
    ('I-vi-IV-V', 'G', [('G', 'maj'), ('E', 'min'), ('C', 'maj'), ('D', 'maj')]),
    ('ii-V-I', 'F', [('G', 'min7'), ('C', '7'), ('F', 'maj7')]),
    ('I-V-vi-IV', 'D', [('D', 'maj'), ('A', 'maj'), ('B', 'min'), ('G', 'maj')]),
    ('i-iv-v-i', 'Am', [('A', 'min'), ('D', 'min'), ('E', 'min'), ('A', 'min')]),
]
TEMPOS = [60, 77, 90, 120]

# Trois niveaux d'anticipation, en fraction de temps (beat). 1/16 = double
# croche, 1/8 = croche, 1/4 = noire. Chacune est plus agressive que la
# précédente : un bassiste qui anticipe d'une noire est très en avance.
ANTICIPATIONS = [
    ('1/16', 1.0 / 16),
    ('1/8', 1.0 / 8),
    ('1/4', 1.0 / 4),
]
REPEATS = 2  # chaque niveau est joué 2 fois pour stabiliser la mesure


def build_case(prog_name, key, chords, tempo):
    """Construit le MIDI et la vérité terrain d'un cas.

    La structure est : pour chaque niveau d'anticipation, on joue la
    progression 2 fois. La basse anticipe la fondamentale du prochain accord
    de `anticip` temps avant le changement. L'harmonie reste plaquée jusqu'au
    changement exact. La vérité terrain note l'accord d'harmonie (pas la
    basse).
    """
    import pretty_midi
    beat = 60.0 / tempo
    bar = beat * 4
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo))
    piano = pretty_midi.Instrument(program=0)
    segments = []
    t = 0.0

    for anticip_name, anticip in ANTICIPATIONS:
        for _ in range(REPEATS):
            for i, (root, quality) in enumerate(chords):
                # Accord courant : harmonie plaquée octave 4.
                for iv in INTERVALS[quality]:
                    piano.notes.append(pretty_midi.Note(
                        velocity=80, pitch=note(root, 4) + iv,
                        start=t, end=t + bar * 0.98))
                # Basse : fondamentale de l'accord courant, puis fondamentale
                # du PROCHAIN accord en anticipation sur la fin de la mesure.
                next_root = chords[(i + 1) % len(chords)][0]
                # Basse sur l'accord courant (octave 2, vel 92).
                bass_current_end = t + bar - anticip * beat
                if bass_current_end > t:
                    piano.notes.append(pretty_midi.Note(
                        velocity=92, pitch=note(root, 2),
                        start=t, end=bass_current_end))
                # Basse anticipée (prochain accord) sur la fin de la mesure.
                anticip_start = t + bar - anticip * beat
                if anticip_start < t + bar:
                    piano.notes.append(pretty_midi.Note(
                        velocity=92, pitch=note(next_root, 2),
                        start=anticip_start, end=t + bar))
                segments.append({
                    'start': round(t, 6),
                    'end': round(t + bar, 6),
                    'chord': f'{root}:{quality}',
                })
                t += bar
    pm.instruments.append(piano)
    return pm, segments, round(t, 6)


def cmd_generate(args):
    try:
        import pretty_midi  # noqa: F401
    except ImportError:
        sys.exit('pretty_midi manquant : pip install pretty_midi')
    if not shutil.which('fluidsynth'):
        sys.exit('fluidsynth introuvable')

    sf2 = b1().soundfont()
    os.makedirs(CORPUS_DIR, exist_ok=True)
    index = []

    for prog_index, (prog_name, key, chords) in enumerate(PROGRESSIONS, start=1):
        for tempo in TEMPOS:
            # L'indice évite une collision : « I-IV-V-I » et « i-iv-v-i » se
            # réduisent au même identifiant une fois la casse effacée.
            slug = prog_name.replace('-', '').lower()
            case_id = f'b3_{prog_index}{slug}_{tempo}'
            pm, segments, duration = build_case(prog_name, key, chords, tempo)
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
            gt = {
                'caseId': case_id, 'battery': 'B3', 'progression': prog_name,
                'key': key, 'tempo': float(tempo), 'duration': duration,
                'status': 'exact',
                'source': ("Audio rendu depuis cette grille. La basse anticipe "
                           "la fondamentale du prochain accord (1/16, 1/8, 1/4 de "
                           "temps). La vérité terrain note l'accord d'harmonie."),
                'segments': segments,
            }
            with open(os.path.join(CORPUS_DIR, f'{case_id}.json'), 'w',
                      encoding='utf-8') as f:
                json.dump(gt, f, ensure_ascii=False, indent=2)
            index.append({'caseId': case_id, 'progression': prog_name,
                          'key': key, 'tempo': tempo, 'duration': duration,
                          'wav': os.path.relpath(wav_path, PROJECT)})
            print(f'  {case_id:<26} {duration:6.1f}s  {len(segments):>2} accords')

    with open(os.path.join(CORPUS_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'battery': 'B3', 'soundfont': sf2,
                   'tempos': TEMPOS,
                   'progressions': [p[0] for p in PROGRESSIONS],
                   'anticipations': [a[0] for a in ANTICIPATIONS],
                   'generated': datetime.now().isoformat(timespec='seconds'),
                   'cases': index}, f, ensure_ascii=False, indent=2)
    print(f'\n{len(index)} cas générés dans {CORPUS_DIR}')


def cmd_run(args):
    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f"corpus B3 absent : lance d'abord `python3 {sys.argv[0]} generate`")
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)

    flags = {n: getattr(ap(), n) for n in dir(ap()) if n.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = 'unknown'

    report = {'label': args.label, 'battery': 'B3', 'commit': commit, 'flags': flags,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    all_offsets = []
    # Regrouper par progression et par tempo pour le tableau.
    par_prog = collections.defaultdict(list)
    par_tempo = collections.defaultdict(list)
    print(f"{'cas':<28}{'majmin':>9}{'sevenths':>10}{'offset':>10}{'seg':>10}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"),
                  encoding='utf-8') as f:
            gt = json.load(f)
        result = ap().analyze_chords(os.path.join(PROJECT, case['wav']), 'legacy')
        scored = b1().score_case(gt, result)
        if scored is None:
            print(f"{case['caseId']:<28}  aucun accord détecté")
            continue
        report['cases'][case['caseId']] = scored
        all_offsets.extend(scored['offsets_ms'])
        par_prog[case['progression']].append(scored)
        par_tempo[case['tempo']].append(scored)
        med = statistics.median(scored['offsets_ms']) if scored['offsets_ms'] else 0.0
        print(f"{case['caseId']:<28}{scored['majmin']:>8.1%}"
              f"{scored['sevenths']:>10.1%}{med:>9.0f}ms"
              f"{str(scored['segments_pred']) + '/' + str(scored['segments_gt']):>10}")

    if not report['cases']:
        sys.exit('aucun cas mesuré')

    print()
    print(f"{'progression':<22}{'cas':>5}{'CSR(majmin)':>14}"
          f"{'CSR(sevenths)':>16}{'offset médian':>16}")
    for prog, cases in sorted(par_prog.items()):
        offs = [o for c in cases for o in c['offsets_ms']]
        mm = sum(c['majmin'] for c in cases) / len(cases)
        ms = sum(c['sevenths'] for c in cases) / len(cases)
        om = statistics.median(offs) if offs else 0.0
        print(f"{prog:<22}{len(cases):>5}{mm:>13.2%}{ms:>16.2%}{om:>13.0f} ms")

    print()
    print(f"{'tempo':<22}{'cas':>5}{'CSR(majmin)':>14}"
          f"{'CSR(sevenths)':>16}{'offset médian':>16}")
    for tempo, cases in sorted(par_tempo.items()):
        offs = [o for c in cases for o in c['offsets_ms']]
        mm = sum(c['majmin'] for c in cases) / len(cases)
        ms = sum(c['sevenths'] for c in cases) / len(cases)
        om = statistics.median(offs) if offs else 0.0
        print(f"{tempo:<22}{len(cases):>5}{mm:>13.2%}{ms:>16.2%}{om:>13.0f} ms")

    tous = list(report['cases'].values())
    globals_ = {
        'cases': len(tous),
        'csr_majmin': sum(c['majmin'] for c in tous) / len(tous),
        'csr_sevenths': sum(c['sevenths'] for c in tous) / len(tous),
        'offset_median_ms': statistics.median(all_offsets) if all_offsets else None,
        'offset_stdev_ms': statistics.pstdev(all_offsets) if len(all_offsets) > 1 else None,
    }
    report['global'] = globals_
    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}"
          f"{'Offset médian':>16}{'Écart-type':>13}")
    print(f"{'B3':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}"
          f"{globals_['offset_median_ms']:>13.0f} ms"
          f"{globals_['offset_stdev_ms']:>10.0f} ms")

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'{args.label}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f'rapport : {out}')

    if args.compare:
        before_path = os.path.join(OUT_DIR, f'{args.compare}.json')
        if not os.path.exists(before_path):
            print(f'\n(rapport de comparaison introuvable : {before_path})')
            return
        with open(before_path, encoding='utf-8') as f:
            before = json.load(f)
        gb, ga = before['global'], globals_
        print(f"\n{'métrique':<20}{'avant':>10}{'après':>10}{'écart':>10}")
        for key, label, pct in (('csr_majmin', 'CSR majmin', True),
                                ('csr_sevenths', 'CSR sevenths', True),
                                ('offset_median_ms', 'offset médian', False),
                                ('offset_stdev_ms', 'écart-type', False)):
            vb, va = gb.get(key), ga.get(key)
            if vb is None or va is None:
                continue
            if pct:
                print(f"{label:<20}{vb:>9.1%}{va:>10.1%}{va - vb:>+10.1%}")
            else:
                print(f"{label:<20}{vb:>7.0f} ms{va:>8.0f} ms{va - vb:>+8.0f} ms")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)
    p_gen = sub.add_parser('generate', help='produit les cas de la batterie B3')
    p_gen.set_defaults(func=cmd_generate)
    p_run = sub.add_parser('run', help='mesure le moteur sur la batterie B3')
    p_run.add_argument('--label', default='b3')
    p_run.add_argument('--compare', default=None)
    p_run.add_argument('--flag', action='append', default=[], metavar='NOM=VALEUR',
                       help='force un flag ENABLE_* le temps de la mesure')
    p_run.set_defaults(func=cmd_run)
    args = parser.parse_args()
    for assignment in getattr(args, 'flag', []) or []:
        name, _, raw = assignment.partition('=')
        name = name.strip()
        if not hasattr(ap(), name):
            sys.exit(f'flag inconnu : {name}')
        value = raw.strip().lower()
        if value in ('true', '1', 'on'):
            parsed = True
        elif value in ('false', '0', 'off'):
            parsed = False
        else:
            try:
                parsed = float(raw)
            except ValueError:
                sys.exit(f'valeur non interprétable pour {name} : {raw!r}')
        setattr(ap(), name, parsed)
        print(f'  flag forcé : {name} = {parsed}')
    args.func(args)


if __name__ == '__main__':
    main()