#!/usr/bin/env python3
"""Batterie B2 — absorption, pédale, quinte dominante, silence.

Pourquoi une seconde batterie. B1 est jouée en accords plaqués, position
fondamentale, sans pédale : les phénomènes qui mettent réellement le moteur en
difficulté sur de la musique n'y existent pas. La preuve, mesurée : la couche
`ENABLE_FIFTH_CONFUSION_FIX` vaut **−16 points sur le corpus réel** quand on la
retire, et **+0,0 sur B1** — non parce qu'elle serait inutile, mais parce que
B1 ne produit jamais de voicing où la quinte domine la fondamentale.

B2 comble ce trou. Chaque famille reproduit, en conditions contrôlées et avec
une vérité terrain exacte, un phénomène observé sur du matériel réel ou dans
les fixtures `tests/audio/arpeggio/` encore en échec :

  F1  pédale de basse, harmonie qui change au-dessus     (fixture K)
  F2  voicing à quinte dominante                          (« You Are Yahweh »)
  F3  walking bass sous un accord tenu                    (fixture L)
  F4  arpège contre accord plaqué, même harmonie          (fixtures C à E)
  F5  silences entre les accords                          (fixture O)
  F6  pédale ET progression réelle simultanées            (le cas difficile)

La différence avec les fixtures existantes : ici la vérité terrain est exacte
par construction et le scoring est `mir_eval`, donc comparable à B1 et
reproductible chiffre en main.

Sous-commandes
--------------
  generate : produit les cas (MIDI → WAV + vérité terrain JSON)
  run      : exécute le moteur et affiche le tableau de scores, par famille

Exemples
--------
  python3 scripts/corpus_b2.py generate
  python3 scripts/corpus_b2.py run --label avant
  python3 scripts/corpus_b2.py run --label apres --compare avant
  python3 scripts/corpus_b2.py run --label sans-quinte \\
      --flag ENABLE_FIFTH_CONFUSION_FIX=False
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
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b2')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b2')

_b1 = None


def b1():
    """Réutilise le générateur et le scoring de B1 : mêmes métriques, donc
    chiffres comparables entre les deux batteries."""
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
    """« C », 4 → numéro MIDI. C4 = 60, convention de l'application."""
    return PITCH[name] + 12 * (octave + 1)


# --------------------------------------------------------------------------
# Familles
# --------------------------------------------------------------------------
# Chaque famille retourne (notes, segments) où notes = [(pitch, start, end,
# velocity)] et segments = vérité terrain contiguë couvrant tout le cas.

def f1_pedale(tempo, prog, key):
    """Pédale de basse tenue, harmonie qui change au-dessus.

    La fondamentale entendue au grave ne change jamais ; seule l'harmonie
    supérieure bouge. Un moteur qui suit la basse produira un seul accord.
    """
    bar = 60.0 / tempo * 4
    notes, segs, t = [], [], 0.0
    pedal = note(key, 2)
    for root, quality in prog:
        # La pédale est ré-attaquée à chaque mesure, mais toujours sur la même
        # note : c'est bien une pédale, pas une ligne de basse.
        notes.append((pedal, t, t + bar * 0.98, 95))
        for i in INTERVALS[quality]:
            notes.append((note(root, 4) + i, t, t + bar * 0.98, 78))
        segs.append({'start': round(t, 6), 'end': round(t + bar, 6),
                     'chord': f'{root}:{quality}'})
        t += bar
    return notes, segs


def f2_quinte_dominante(tempo, prog, key):
    """Voicing où la quinte domine le chroma sans que la fondamentale disparaisse.

    Reproduit le phénomène qui faisait sortir les six Mi de « You Are Yahweh »
    en Si : la note la plus présente du chroma n'est pas la fondamentale.

    Le voicing est CALIBRÉ sur le chroma réellement mesuré sur ce morceau
    (B 44 %, E 21 %, G# 6 %). Une première version plaçait la quinte à l'octave 2
    avec le double de vélocité : sa série harmonique écrasait tout et produisait
    un chroma de Si majeur franc (G 42 %, D 25 %, C 4 % pour un do attendu). Le
    moteur avait alors raison de lire un Sol — la fixture ne testait pas ce
    qu'elle prétendait tester. Quintes doublées aux octaves 2 et 3, fondamentale
    à l'octave 3, tierce à l'octave 4 : rapport quinte/fondamentale ≈ 1,5, un peu
    moins extrême que la réalité, donc un test honnête plutôt qu'impossible.
    """
    bar = 60.0 / tempo * 4
    notes, segs, t = [], [], 0.0
    for root, quality in prog:
        ivs = INTERVALS[quality]
        base = note(root, 3)
        fifth = base + 7
        notes.append((fifth - 12, t, t + bar * 0.98, 98))   # quinte, octave 2
        notes.append((fifth, t, t + bar * 0.98, 96))        # quinte, octave 3
        notes.append((base, t, t + bar * 0.98, 82))         # fondamentale, octave 3
        for i in ivs[1:]:
            if i == 7:
                continue                                    # quinte déjà posée
            notes.append((base + 12 + i, t, t + bar * 0.98, 64))
        segs.append({'start': round(t, 6), 'end': round(t + bar, 6),
                     'chord': f'{root}:{quality}'})
        t += bar
    return notes, segs


def f3_walking_bass(tempo, prog, key):
    """Basse qui se promène dans l'accord, harmonie supérieure immobile.

    L'inverse de F1 : ici c'est la basse qui bouge et l'harmonie qui tient.
    Le moteur ne doit produire qu'un accord par mesure, pas un par note de basse.
    """
    beat = 60.0 / tempo
    bar = beat * 4
    notes, segs, t = [], [], 0.0
    for root, quality in prog:
        ivs = INTERVALS[quality]
        for i in ivs:
            notes.append((note(root, 4) + i, t, t + bar * 0.98, 74))
        # Une note de basse par temps, toutes prises dans l'accord.
        for k in range(4):
            notes.append((note(root, 2) + ivs[k % len(ivs)],
                          t + k * beat, t + (k + 0.9) * beat, 96))
        segs.append({'start': round(t, 6), 'end': round(t + bar, 6),
                     'chord': f'{root}:{quality}'})
        t += bar
    return notes, segs


def f4_arpege(tempo, prog, key):
    """Arpège : les notes de l'accord jouées l'une après l'autre.

    Une seule harmonie par mesure, malgré quatre attaques successives. C'est le
    cas que la frontière harmonie/mélodie doit trancher.
    """
    beat = 60.0 / tempo
    bar = beat * 4
    notes, segs, t = [], [], 0.0
    for root, quality in prog:
        ivs = INTERVALS[quality]
        notes.append((note(root, 2), t, t + bar * 0.98, 88))    # pédale de fondamentale
        for k in range(4):
            notes.append((note(root, 4) + ivs[k % len(ivs)],
                          t + k * beat, t + (k + 0.95) * beat, 84))
        segs.append({'start': round(t, 6), 'end': round(t + bar, 6),
                     'chord': f'{root}:{quality}'})
        t += bar
    return notes, segs


def f5_silences(tempo, prog, key):
    """Accord, silence, accord… Le moteur ne doit rien inventer dans le vide."""
    beat = 60.0 / tempo
    sound = beat * 3
    gap = beat * 2          # nettement plus long que le seuil de 1,2 s à 77 BPM
    notes, segs, t = [], [], 0.0
    for root, quality in prog:
        for i in INTERVALS[quality]:
            notes.append((note(root, 4) + i, t, t + sound * 0.98, 88))
        notes.append((note(root, 2), t, t + sound * 0.98, 92))
        segs.append({'start': round(t, 6), 'end': round(t + sound, 6),
                     'chord': f'{root}:{quality}'})
        t += sound
        segs.append({'start': round(t, 6), 'end': round(t + gap, 6), 'chord': 'N'})
        t += gap
    return notes, segs


def f6_pedale_et_progression(tempo, prog, key):
    """Pédale de tonique ET progression réelle au-dessus, en même temps.

    Le cas difficile : il faut suivre l'harmonie supérieure sans se laisser
    tirer par la basse, tout en gardant les frontières justes.
    """
    beat = 60.0 / tempo
    bar = beat * 4
    notes, segs, t = [], [], 0.0
    pedal = note(key, 2)
    for root, quality in prog:
        # Pédale battue à la noire, harmonie plaquée à la mesure.
        for k in range(4):
            notes.append((pedal, t + k * beat, t + (k + 0.9) * beat, 92))
        for i in INTERVALS[quality]:
            notes.append((note(root, 4) + i, t, t + bar * 0.98, 80))
        segs.append({'start': round(t, 6), 'end': round(t + bar, 6),
                     'chord': f'{root}:{quality}'})
        t += bar
    return notes, segs


FAMILLES = [
    ('f1', 'pédale de basse', f1_pedale),
    ('f2', 'quinte dominante', f2_quinte_dominante),
    ('f3', 'walking bass', f3_walking_bass),
    ('f4', 'arpège', f4_arpege),
    ('f5', 'silences', f5_silences),
    ('f6', 'pédale + progression', f6_pedale_et_progression),
]

# Deux progressions et deux tempos par famille : de quoi distinguer un défaut
# systématique d'un accident, sans faire exploser la durée de la mesure.
VARIANTES = [
    ('C', [('C', 'maj'), ('A', 'min'), ('F', 'maj'), ('G', 'maj')], 77),
    ('C', [('C', 'maj'), ('A', 'min'), ('F', 'maj'), ('G', 'maj')], 100),
    ('A', [('D', 'maj'), ('A', 'maj'), ('E', 'maj'), ('F#', 'min')], 77),
    ('A', [('D', 'maj'), ('A', 'maj'), ('E', 'maj'), ('F#', 'min')], 100),
]

REPEATS = 2


# --------------------------------------------------------------------------
# Génération
# --------------------------------------------------------------------------

def cmd_generate(args):
    try:
        import pretty_midi
    except ImportError:
        sys.exit('pretty_midi manquant : pip install pretty_midi')
    if not shutil.which('fluidsynth'):
        sys.exit('fluidsynth introuvable')

    sf2 = b1().soundfont()
    os.makedirs(CORPUS_DIR, exist_ok=True)
    index = []

    for fam_id, fam_label, builder in FAMILLES:
        for v_index, (key, prog, tempo) in enumerate(VARIANTES, start=1):
            case_id = f'b2_{fam_id}_v{v_index}_{tempo}'
            notes, segs, total = [], [], 0.0
            for _ in range(REPEATS):
                n, s = builder(tempo, prog, key)
                span = max(x['end'] for x in s)
                notes += [(p, a + total, b + total, v) for p, a, b, v in n]
                segs += [{**x, 'start': round(x['start'] + total, 6),
                          'end': round(x['end'] + total, 6)} for x in s]
                total += span

            pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo))
            piano = pretty_midi.Instrument(program=0)
            for pitch, start, end, vel in notes:
                piano.notes.append(pretty_midi.Note(
                    velocity=int(vel), pitch=int(pitch), start=start, end=end))
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

            gt = {'caseId': case_id, 'battery': 'B2', 'family': fam_id,
                  'familyLabel': fam_label, 'key': key, 'tempo': float(tempo),
                  'duration': round(total, 6), 'status': 'exact',
                  'source': ('Audio rendu depuis cette grille. La vérité terrain n’est pas '
                             'une annotation : c’est ce qui a servi à produire le son.'),
                  'segments': segs}
            with open(os.path.join(CORPUS_DIR, f'{case_id}.json'), 'w', encoding='utf-8') as f:
                json.dump(gt, f, ensure_ascii=False, indent=2)
            index.append({'caseId': case_id, 'family': fam_id, 'familyLabel': fam_label,
                          'key': key, 'tempo': tempo, 'duration': round(total, 2),
                          'wav': os.path.relpath(wav_path, PROJECT)})
            sounding = [s for s in segs if s['chord'] != 'N']
            print(f'  {case_id:<22} {fam_label:<22} {total:6.1f}s  '
                  f'{len(sounding):>2} accords, {len(segs)-len(sounding)} silences')

    with open(os.path.join(CORPUS_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'battery': 'B2', 'soundfont': sf2,
                   'families': [{'id': i, 'label': l} for i, l, _ in FAMILLES],
                   'generated': datetime.now().isoformat(timespec='seconds'),
                   'cases': index}, f, ensure_ascii=False, indent=2)
    print(f'\n{len(index)} cas générés dans {CORPUS_DIR}')


# --------------------------------------------------------------------------
# Mesure
# --------------------------------------------------------------------------

def cmd_run(args):
    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f'corpus B2 absent : lance d’abord `python3 {sys.argv[0]} generate`')
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)

    flags = {n: getattr(ap(), n) for n in dir(ap()) if n.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = 'unknown'

    report = {'label': args.label, 'battery': 'B2', 'commit': commit, 'flags': flags,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    par_famille = collections.defaultdict(list)
    tous_offsets = []

    print(f"{'cas':<24}{'famille':<24}{'majmin':>9}{'sevenths':>10}{'offset':>10}{'seg':>10}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"), encoding='utf-8') as f:
            gt = json.load(f)
        result = ap().analyze_chords(os.path.join(PROJECT, case['wav']), 'legacy')
        scored = b1().score_case(gt, result)
        if scored is None:
            print(f"{case['caseId']:<24}  aucun accord détecté")
            continue
        report['cases'][case['caseId']] = scored
        par_famille[case['family']].append(scored)
        tous_offsets.extend(scored['offsets_ms'])
        med = statistics.median(scored['offsets_ms']) if scored['offsets_ms'] else 0.0
        print(f"{case['caseId']:<24}{case['familyLabel']:<24}{scored['majmin']:>8.1%}"
              f"{scored['sevenths']:>10.1%}{med:>9.0f}ms"
              f"{str(scored['segments_pred']) + '/' + str(scored['segments_gt']):>10}")

    if not report['cases']:
        sys.exit('aucun cas mesuré')

    print()
    print(f"{'famille':<26}{'cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}{'offset médian':>16}")
    familles = {i: l for i, l, _ in FAMILLES}
    resume = {}
    for fam_id, label in familles.items():
        cases = par_famille.get(fam_id, [])
        if not cases:
            continue
        offs = [o for c in cases for o in c['offsets_ms']]
        resume[fam_id] = {
            'label': label, 'cases': len(cases),
            'csr_majmin': sum(c['majmin'] for c in cases) / len(cases),
            'csr_sevenths': sum(c['sevenths'] for c in cases) / len(cases),
            'offset_median_ms': statistics.median(offs) if offs else None,
        }
        r = resume[fam_id]
        print(f"{label:<26}{r['cases']:>5}{r['csr_majmin']:>13.2%}"
              f"{r['csr_sevenths']:>16.2%}{r['offset_median_ms']:>13.0f} ms")

    tous = list(report['cases'].values())
    globals_ = {
        'cases': len(tous),
        'csr_majmin': sum(c['majmin'] for c in tous) / len(tous),
        'csr_sevenths': sum(c['sevenths'] for c in tous) / len(tous),
        'offset_median_ms': statistics.median(tous_offsets) if tous_offsets else None,
        'offset_stdev_ms': statistics.pstdev(tous_offsets) if len(tous_offsets) > 1 else None,
    }
    report['global'] = globals_
    report['families'] = resume
    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}"
          f"{'Offset médian':>16}{'Écart-type':>13}")
    print(f"{'B2':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}"
          f"{globals_['offset_median_ms']:>13.0f} ms{globals_['offset_stdev_ms']:>10.0f} ms")

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
        print(f"\n{'famille':<26}{'avant':>10}{'après':>10}{'écart':>10}")
        for fam_id, r in resume.items():
            b = before.get('families', {}).get(fam_id)
            if not b:
                continue
            print(f"{r['label']:<26}{b['csr_majmin']:>9.1%}{r['csr_majmin']:>10.1%}"
                  f"{r['csr_majmin'] - b['csr_majmin']:>+10.1%}")
        gb, ga = before['global'], globals_
        print(f"{'GLOBAL':<26}{gb['csr_majmin']:>9.1%}{ga['csr_majmin']:>10.1%}"
              f"{ga['csr_majmin'] - gb['csr_majmin']:>+10.1%}")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='cmd', required=True)

    p_gen = sub.add_parser('generate', help='produit les cas de la batterie B2')
    p_gen.set_defaults(func=cmd_generate)

    p_run = sub.add_parser('run', help='mesure le moteur sur la batterie B2')
    p_run.add_argument('--label', default='b2')
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
