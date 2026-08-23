#!/usr/bin/env python3
"""Batterie B1 — corpus synthétique à vérité terrain exacte, et scoring mir_eval.

Pourquoi un corpus synthétique alors qu'il existe déjà un corpus réel : parce
qu'une vérité terrain relevée à l'oreille porte sa propre imprécision, et que
ce projet a déjà perdu beaucoup de temps à corriger un moteur contre des
annotations fausses (voir experiments/EXP-009). Ici l'audio est RENDU depuis la
grille : les frontières sont justes à l'échantillon près, par construction.

B1 est délibérément facile — accords plaqués, changements exactement sur le
temps, ni pédale ni percussion ni réverbération. Un moteur qui échoue ici a un
défaut structurel, pas un problème de difficulté musicale. C'est ce qui permet
de mesurer un décalage de frontière sans que l'ambiguïté du signal ne pollue la
mesure.

Sous-commandes
--------------
  generate : produit les 20 cas (MIDI → WAV + vérité terrain JSON)
  run      : exécute le moteur sur les 20 cas et affiche le tableau de scores

Exemples
--------
  python3 scripts/corpus_b1.py generate
  python3 scripts/corpus_b1.py run --label avant-correctif
  python3 scripts/corpus_b1.py run --label apres-correctif --compare avant-correctif
"""

import argparse
import importlib.util
import json
import os
import shutil
import statistics
import subprocess
import sys
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AP_PATH = os.path.join(PROJECT, 'electron', 'audio-processor.py')
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b1')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b1')

SOUNDFONT_CANDIDATES = [
    '/usr/share/sounds/sf2/FluidR3_GM.sf2',
    '/usr/share/sounds/sf2/default-GM.sf2',
    '/usr/share/sounds/sf2/TimGM6mb.sf2',
]

TEMPOS = [60, 77, 90, 120]

# Cinq progressions, chacune dans une tonalité différente : la détection de
# tonalité est ainsi exercée elle aussi, sans compliquer le reste.
PITCH = {'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65,
         'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71}

INTERVALS = {
    'maj': [0, 4, 7], 'min': [0, 3, 7], '7': [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10],
}

PROGRESSIONS = [
    ('I-IV-V-I', 'C', [('C', 'maj'), ('F', 'maj'), ('G', 'maj'), ('C', 'maj')]),
    ('I-vi-IV-V', 'G', [('G', 'maj'), ('E', 'min'), ('C', 'maj'), ('D', 'maj')]),
    ('ii-V-I', 'F', [('G', 'min7'), ('C', '7'), ('F', 'maj7')]),
    ('I-V-vi-IV', 'D', [('D', 'maj'), ('A', 'maj'), ('B', 'min'), ('G', 'maj')]),
    # Tonalité notée « Am » et non « A » : c'est la notation du moteur pour
    # une tonalité mineure, et comparer deux notations différentes ferait
    # échouer la détection de tonalité pour une raison purement cosmétique.
    ('i-iv-v-i', 'Am', [('A', 'min'), ('D', 'min'), ('E', 'min'), ('A', 'min')]),
]

BARS_PER_CHORD = 1
REPEATS = 3
BEATS_PER_BAR = 4

_ap = None


def ap():
    global _ap
    if _ap is None:
        spec = importlib.util.spec_from_file_location('audio_processor', AP_PATH)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _ap = mod
    return _ap


def soundfont():
    for path in SOUNDFONT_CANDIDATES:
        if os.path.exists(path):
            return path
    sys.exit('aucune soundfont trouvée : installe fluid-soundfont-gm ou équivalent')


# --------------------------------------------------------------------------
# Étiquettes
# --------------------------------------------------------------------------

# mir_eval attend la syntaxe Harte : « C:maj », « D:min7 », « N ».
ENGINE_TO_MIREVAL = {
    '': 'maj', 'm': 'min', '7': '7', 'maj7': 'maj7', 'm7': 'min7',
    'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus2': 'sus2',
    'sus4': 'sus4', 'm7b5': 'hdim7', '6': 'maj6', 'm6': 'min6',
}


def engine_label_to_mireval(label):
    """« F#m7 » → « F#:min7 ». Les slash chords perdent leur basse : B1 n'en
    contient pas, et les comparer introduirait une variable de plus."""
    if not label or label == 'N':
        return 'N'
    if '/' in label:
        label = label.split('/')[0]
    root, suffix = ap()._parse_chord_label(label)
    if root is None:
        return 'N'
    quality = ENGINE_TO_MIREVAL.get(suffix or '')
    if quality is None:
        # Qualité que mir_eval ne connaît pas : on retombe sur la triade, ce qui
        # est plus honnête que de déclarer l'accord absent.
        quality = 'min' if (suffix or '').startswith('m') else 'maj'
    return f'{ap().NOTE_NAMES[root % 12]}:{quality}'


# --------------------------------------------------------------------------
# Génération
# --------------------------------------------------------------------------

def build_case(prog_name, key, chords, tempo):
    """Construit la grille temporelle exacte d'un cas."""
    import pretty_midi

    beat = 60.0 / tempo
    bar = beat * BEATS_PER_BAR
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo))
    piano = pretty_midi.Instrument(program=0)  # Acoustic Grand Piano

    segments = []
    t = 0.0
    for _ in range(REPEATS):
        for root_name, quality in chords:
            duration = bar * BARS_PER_CHORD
            base = PITCH[root_name]
            # Voicing plaqué, main droite seule, position fondamentale autour
            # de C4 : aucune ambiguïté d'inversion ni de basse à interpréter.
            for interval in INTERVALS[quality]:
                piano.notes.append(pretty_midi.Note(
                    velocity=88, pitch=base + interval,
                    start=t, end=t + duration * 0.98))
            segments.append({
                'start': round(t, 6),
                'end': round(t + duration, 6),
                'chord': f'{root_name}:{quality}',
            })
            t += duration
    pm.instruments.append(piano)
    return pm, segments, round(t, 6)


def cmd_generate(args):
    try:
        import pretty_midi  # noqa: F401
    except ImportError:
        sys.exit('pretty_midi manquant : pip install pretty_midi')
    if not shutil.which('fluidsynth'):
        sys.exit('fluidsynth introuvable')

    sf2 = soundfont()
    os.makedirs(CORPUS_DIR, exist_ok=True)
    index = []

    for prog_index, (prog_name, key, chords) in enumerate(PROGRESSIONS, start=1):
        for tempo in TEMPOS:
            # L'indice évite une collision : « I-IV-V-I » et « i-iv-v-i » se
            # réduisent au même identifiant une fois la casse effacée.
            slug = prog_name.replace('-', '').lower()
            case_id = f'b1_{prog_index}{slug}_{tempo}'
            pm, segments, duration = build_case(prog_name, key, chords, tempo)

            midi_path = os.path.join(CORPUS_DIR, f'{case_id}.mid')
            wav_path = os.path.join(CORPUS_DIR, f'{case_id}.wav')
            pm.write(midi_path)

            # Rendu sec : ni réverbération ni chorus, pour que la seule
            # difficulté du cas soit l'harmonie elle-même.
            proc = subprocess.run(
                ['fluidsynth', '-ni', '-F', wav_path, '-r', '44100',
                 '-o', 'synth.reverb.active=0', '-o', 'synth.chorus.active=0',
                 '-g', '0.8', sf2, midi_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
            if proc.returncode != 0 or not os.path.exists(wav_path):
                sys.exit(f'fluidsynth a échoué sur {case_id}:\n{proc.stderr[-400:]}')

            gt = {
                'caseId': case_id, 'battery': 'B1', 'progression': prog_name,
                'key': key, 'tempo': float(tempo), 'duration': duration,
                'status': 'exact',
                'source': ("Audio rendu depuis cette grille par fluidsynth. Les frontières "
                           "sont exactes par construction, pas relevées à l'oreille."),
                'segments': segments,
            }
            with open(os.path.join(CORPUS_DIR, f'{case_id}.json'), 'w', encoding='utf-8') as f:
                json.dump(gt, f, ensure_ascii=False, indent=2)
            index.append({'caseId': case_id, 'progression': prog_name, 'key': key,
                          'tempo': tempo, 'duration': duration,
                          'wav': os.path.relpath(wav_path, PROJECT)})
            print(f'  {case_id:<26} {duration:6.1f}s  {len(segments):>2} accords')

    with open(os.path.join(CORPUS_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'battery': 'B1', 'soundfont': sf2, 'tempos': TEMPOS,
                   'progressions': [p[0] for p in PROGRESSIONS],
                   'generated': datetime.now().isoformat(timespec='seconds'),
                   'cases': index}, f, ensure_ascii=False, indent=2)
    print(f'\n{len(index)} cas générés dans {CORPUS_DIR}')


# --------------------------------------------------------------------------
# Mesure
# --------------------------------------------------------------------------

def boundary_offsets(gt_segments, pred_segments):
    """Décalage signé de chaque frontière attendue vers la frontière prédite la
    plus proche. Positif = le moteur change d'accord APRÈS la grille."""
    gt_b = sorted({round(s['start'], 4) for s in gt_segments[1:]})
    pred_b = sorted({round(float(s['startTime']), 4) for s in pred_segments[1:]})
    if not gt_b or not pred_b:
        return []
    return [min(pred_b, key=lambda p: abs(p - g)) - g for g in gt_b]


def score_case(gt, result):
    import mir_eval
    import numpy as np

    ref_int = np.array([[s['start'], s['end']] for s in gt['segments']])
    ref_lab = [s['chord'] for s in gt['segments']]

    chords = result.get('chords', [])
    if not chords:
        return None
    est_int = np.array([[float(c['startTime']), float(c['endTime'])] for c in chords])
    est_lab = [engine_label_to_mireval(c.get('chord')) for c in chords]

    # mir_eval exige des intervalles contigus couvrant la même étendue.
    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int.min(), ref_int.max(), mir_eval.chord.NO_CHORD,
        mir_eval.chord.NO_CHORD)
    intervals, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(intervals)

    out = {}
    for name, fn in (('majmin', mir_eval.chord.majmin),
                     ('sevenths', mir_eval.chord.sevenths)):
        comparisons = fn(ref_l, est_l)
        out[name] = float(mir_eval.chord.weighted_accuracy(comparisons, durations))

    offsets = boundary_offsets(gt['segments'], chords)
    out['offsets_ms'] = [o * 1000.0 for o in offsets]
    out['segments_gt'] = len(gt['segments'])
    out['segments_pred'] = len(chords)
    out['tempo_pred'] = result.get('tempo')
    out['tempo_gt'] = gt.get('tempo')
    out['key_pred'] = result.get('key')
    out['key_gt'] = gt.get('key')
    return out


def cmd_run(args):
    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f'corpus B1 absent : lance d’abord `python3 {sys.argv[0]} generate`')
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)

    flags = {n: getattr(ap(), n) for n in dir(ap()) if n.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = 'unknown'

    report = {'label': args.label, 'battery': 'B1', 'commit': commit, 'flags': flags,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    all_offsets = []
    print(f"{'cas':<28}{'majmin':>9}{'sevenths':>10}{'offset':>10}{'tempo':>14}{'tonalité':>12}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"), encoding='utf-8') as f:
            gt = json.load(f)
        wav = os.path.join(PROJECT, case['wav'])
        result = ap().analyze_chords(wav, 'legacy')
        scored = score_case(gt, result)
        if scored is None:
            print(f"{case['caseId']:<28}  aucun accord détecté")
            continue
        report['cases'][case['caseId']] = scored
        all_offsets.extend(scored['offsets_ms'])
        med = statistics.median(scored['offsets_ms']) if scored['offsets_ms'] else 0.0
        tempo_ok = '✓' if scored['tempo_pred'] and abs(
            scored['tempo_pred'] / scored['tempo_gt'] - 1) < 0.06 else '✗'
        key_ok = '✓' if (scored['key_pred'] or '') == scored['key_gt'] else '✗'
        print(f"{case['caseId']:<28}{scored['majmin']:>8.1%}{scored['sevenths']:>10.1%}"
              f"{med:>9.0f}ms"
              f"{str(scored['tempo_pred']) + ' ' + tempo_ok:>14}"
              f"{str(scored['key_pred']) + ' ' + key_ok:>12}")

    cases = list(report['cases'].values())
    if not cases:
        sys.exit('aucun cas mesuré')
    total = sum(1 for _ in cases)
    globals_ = {
        'cases': total,
        'csr_majmin': sum(c['majmin'] for c in cases) / total,
        'csr_sevenths': sum(c['sevenths'] for c in cases) / total,
        'offset_median_ms': statistics.median(all_offsets) if all_offsets else None,
        'offset_stdev_ms': statistics.pstdev(all_offsets) if len(all_offsets) > 1 else None,
        'tempo_exact': sum(1 for c in cases if c['tempo_pred'] and c['tempo_gt']
                           and abs(c['tempo_pred'] / c['tempo_gt'] - 1) < 0.06),
        'key_exact': sum(1 for c in cases if (c['key_pred'] or '') == c['key_gt']),
    }
    report['global'] = globals_

    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}"
          f"{'Offset médian':>16}{'Écart-type':>13}")
    print(f"{'B1':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}"
          f"{globals_['offset_median_ms']:>13.0f} ms{globals_['offset_stdev_ms']:>10.0f} ms")
    print(f"\ntempo exact : {globals_['tempo_exact']}/{total}"
          f"   ·   tonalité exacte : {globals_['key_exact']}/{total}")

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
        b, a = before['global'], globals_
        print(f"\n{'métrique':<20}{'avant':>10}{'après':>10}{'écart':>10}")
        for key, label, pct in (('csr_majmin', 'CSR majmin', True),
                                ('csr_sevenths', 'CSR sevenths', True),
                                ('offset_median_ms', 'offset médian', False),
                                ('offset_stdev_ms', 'écart-type', False)):
            vb, va = b.get(key), a.get(key)
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

    p_gen = sub.add_parser('generate', help='produit les 20 cas de la batterie B1')
    p_gen.set_defaults(func=cmd_generate)

    p_run = sub.add_parser('run', help='mesure le moteur sur la batterie B1')
    p_run.add_argument('--label', default='b1')
    p_run.add_argument('--compare', default=None,
                       help='label d’un rapport antérieur à comparer')
    p_run.add_argument('--flag', action='append', default=[], metavar='NOM=VALEUR',
                       help="force un flag ENABLE_* du moteur le temps de la mesure, "
                            "ex. --flag ENABLE_FIFTH_CONFUSION_FIX=False. Répétable. "
                            "L'état effectif de tous les flags est enregistré dans le rapport.")
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
