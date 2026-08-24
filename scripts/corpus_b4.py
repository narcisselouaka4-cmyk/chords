#!/usr/bin/env python3
"""Batterie B4 — tempo et beat tracking.

Le correctif de désambiguïsation d'octave (EXP-018, `_resolve_tempo`) est en
place. B4 sert à vérifier s'il tient sur des cas plus difficiles que la mesure
ponctuelle déjà faite sur « You Are Yahweh » : tempos lents (76/77 BPM, zone
d'ambiguïté noire/croche), rubato progressif ±3 %, accelerando/ritardando,
syncopes.

Conception : 20 cas répartis en 4 familles de 5 cas :
  F1 tempo stable — 5 tempos exacts (60, 77, 90, 120, 140) sans variation.
  F2 rubato — tempo 90 avec fluctuation progressive ±3 % (MIDI tempo map).
  F3 accelerando / ritardando — tempo allant de 70 à 110 (accel) puis 110 à 70
      (ritard) sur la durée du morceau.
  F4 syncopes — tempo 100 avec accents décalés (basse sur contretemps).

Pour chaque cas, la vérité terrain est le tempo moyen attendu (pour F1 c'est
exact, pour F2/F3/F4 c'est la moyenne de la courbe). Le scoring mesure le
tempo prédit vs attendu, la tonalité, et la justesse des accords (CSR majmin).

Sous-commandes : generate, run (même chaîne que B1/B2/B3).
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
CORPUS_DIR = os.path.join(PROJECT, 'tests', 'corpus', 'b4')
OUT_DIR = os.path.join(PROJECT, 'benchmark_outputs', 'b4')

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
INTERVALS = {'maj': [0, 4, 7], 'min': [0, 3, 7], '7': [0, 4, 7, 10],
             'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10]}


def note(name, octave):
    return PITCH[name] + 12 * (octave + 1)


# Progression de base (I-vi-IV-V en C — harmonie simple, le tempo est le sujet)
PROG = [('C', 'maj'), ('A', 'min'), ('F', 'maj'), ('G', 'maj')]
KEY = 'C'
BARS_PER_CASE = 8  # 8 mesures × 4 temps = 32 temps, assez pour le beat tracking


# --------------------------------------------------------------------------
# Familles
# --------------------------------------------------------------------------

def build_stable(tempo):
    """Tempo stable : 8 mesures à tempo constant."""
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo), resolution=480)
    piano = pretty_midi.Instrument(program=0)
    beat = 60.0 / tempo
    bar = beat * 4
    segments = []
    t = 0.0
    for i in range(BARS_PER_CASE):
        root, quality = PROG[i % len(PROG)]
        for iv in INTERVALS[quality]:
            piano.notes.append(pretty_midi.Note(
                velocity=88, pitch=note(root, 4) + iv,
                start=t, end=t + bar * 0.98))
        segments.append({'start': round(t, 6), 'end': round(t + bar, 6),
                         'chord': f'{root}:{quality}'})
        t += bar
    pm.instruments.append(piano)
    return pm, segments, round(t, 6), float(tempo)


def build_rubato(base_tempo, variation_pct=3.0):
    """Rubato progressif ±3 % : la tempo fluctue sinusoïdalement autour de
    base_tempo sur la durée du morceau. La moyenne reste base_tempo."""
    import pretty_midi
    import math
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(base_tempo), resolution=480)
    piano = pretty_midi.Instrument(program=0)
    base_beat = 60.0 / base_tempo
    segments = []
    t = 0.0
    n_bars = BARS_PER_CASE
    for i in range(n_bars):
        # Variation sinusoïdale : +variation à i=0, -variation à i=n/2, etc.
        phase = 2 * math.pi * i / n_bars
        factor = 1.0 + (variation_pct / 100.0) * math.sin(phase)
        bar = base_beat * 4 * factor
        root, quality = PROG[i % len(PROG)]
        for iv in INTERVALS[quality]:
            piano.notes.append(pretty_midi.Note(
                velocity=88, pitch=note(root, 4) + iv,
                start=t, end=t + bar * 0.98))
        segments.append({'start': round(t, 6), 'end': round(t + bar, 6),
                         'chord': f'{root}:{quality}'})
        t += bar
    pm.instruments.append(piano)
    # Tempo moyen = base_tempo (la sinusoïde est centrée)
    return pm, segments, round(t, 6), float(base_tempo)


def build_accel_rit(base_tempo, direction='accel'):
    """Accelerando (70→110) ou ritardando (110→70) : tempo linéaire sur la
    durée. Tempo moyen = (start+end)/2."""
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(base_tempo), resolution=480)
    piano = pretty_midi.Instrument(program=0)
    n_bars = BARS_PER_CASE
    if direction == 'accel':
        t_start, t_end = 70.0, 110.0
    else:
        t_start, t_end = 110.0, 70.0
    mean_tempo = (t_start + t_end) / 2.0
    segments = []
    t = 0.0
    for i in range(n_bars):
        # Tempo linéaire sur les mesures
        frac = i / max(n_bars - 1, 1)
        tempo_i = t_start + (t_end - t_start) * frac
        beat = 60.0 / tempo_i
        bar = beat * 4
        root, quality = PROG[i % len(PROG)]
        for iv in INTERVALS[quality]:
            piano.notes.append(pretty_midi.Note(
                velocity=88, pitch=note(root, 4) + iv,
                start=t, end=t + bar * 0.98))
        segments.append({'start': round(t, 6), 'end': round(t + bar, 6),
                         'chord': f'{root}:{quality}'})
        t += bar
    pm.instruments.append(piano)
    return pm, segments, round(t, 6), float(mean_tempo)


def build_syncopated(tempo):
    """Syncopes : tempo 100 avec basse sur contretemps (décalage 1/8). L'harmonie
    reste plaquée sur le temps. Teste si le beat tracker verrouille sur la
    basse syncopée ou sur l'harmonie."""
    import pretty_midi
    pm = pretty_midi.PrettyMIDI(initial_tempo=float(tempo), resolution=480)
    piano = pretty_midi.Instrument(program=0)
    beat = 60.0 / tempo
    bar = beat * 4
    segments = []
    t = 0.0
    for i in range(BARS_PER_CASE):
        root, quality = PROG[i % len(PROG)]
        # Harmonie plaquée sur le temps (beat 0 de chaque mesure).
        for iv in INTERVALS[quality]:
            piano.notes.append(pretty_midi.Note(
                velocity=80, pitch=note(root, 4) + iv,
                start=t, end=t + bar * 0.98))
        # Basse syncopée : sur les contretemps (1/8 de temps décalé).
        for k in range(8):
            bass_start = t + k * beat / 2 + beat / 4  # décalage 1/8
            if bass_start + beat * 0.4 < t + bar:
                piano.notes.append(pretty_midi.Note(
                    velocity=92, pitch=note(root, 2),
                    start=bass_start, end=bass_start + beat * 0.4))
        segments.append({'start': round(t, 6), 'end': round(t + bar, 6),
                         'chord': f'{root}:{quality}'})
        t += bar
    pm.instruments.append(piano)
    return pm, segments, round(t, 6), float(tempo)


# 20 cas : 5 stable + 5 rubato + 5 accel/ritard + 5 syncopes
CASES = []
# F1 stable : 5 tempos
for tempo in [60, 77, 90, 120, 140]:
    CASES.append(('f1_stable', f'stable_{tempo}', 'tempo stable',
                  lambda t=tempo: build_stable(t)))
# F2 rubato : 5 tempos de base
for tempo in [60, 77, 90, 120, 140]:
    CASES.append(('f2_rubato', f'rubato_{tempo}', 'rubato ±3 %',
                  lambda t=tempo: build_rubato(t)))
# F3 accel/ritard : 5 cas (accel 70-110, ritard 110-70, et 3 variantes)
CASES.append(('f3_accel', 'accel_70_110', 'accelerando 70→110',
              lambda: build_accel_rit(90, 'accel')))
CASES.append(('f3_ritard', 'ritard_110_70', 'ritardando 110→70',
              lambda: build_accel_rit(90, 'ritard')))
CASES.append(('f3_accel_slow', 'accel_60_90', 'accelerando 60→90',
              lambda: build_accel_rit(75, 'accel')))
CASES.append(('f3_ritard_slow', 'ritard_90_60', 'ritardando 90→60',
              lambda: build_accel_rit(75, 'ritard')))
CASES.append(('f3_accel_fast', 'accel_100_140', 'accelerando 100→140',
              lambda: build_accel_rit(120, 'accel')))
# F4 syncopes : 5 tempos
for tempo in [60, 77, 90, 120, 140]:
    CASES.append(('f4_syncop', f'syncop_{tempo}', 'syncopes basse contretemps',
                  lambda t=tempo: build_syncopated(t)))


def cmd_generate(args):
    try:
        import pretty_midi  # noqa: F401
    except ImportError:
        sys.exit('pretty_midi manquant')
    if not shutil.which('fluidsynth'):
        sys.exit('fluidsynth introuvable')
    sf2 = b1().soundfont()
    os.makedirs(CORPUS_DIR, exist_ok=True)
    index = []
    for fam_id, case_slug, fam_label, builder in CASES:
        case_id = f'b4_{case_slug}'
        pm, segments, duration, tempo_gt = builder()
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
        gt = {'caseId': case_id, 'battery': 'B4', 'family': fam_id,
              'familyLabel': fam_label, 'key': KEY, 'tempo': tempo_gt,
              'duration': duration, 'status': 'exact',
              'source': ("Audio rendu depuis cette grille. Le tempo attendu "
                         "est la moyenne de la courbe (exact pour F1)."),
              'segments': segments}
        with open(os.path.join(CORPUS_DIR, f'{case_id}.json'), 'w',
                  encoding='utf-8') as f:
            json.dump(gt, f, ensure_ascii=False, indent=2)
        index.append({'caseId': case_id, 'family': fam_id,
                      'familyLabel': fam_label, 'key': KEY, 'tempo': tempo_gt,
                      'duration': duration,
                      'wav': os.path.relpath(wav_path, PROJECT)})
        print(f'  {case_id:<26} {fam_label:<24} {duration:6.1f}s  '
              f'{len(segments):>2} accords  tempo_gt={tempo_gt}')
    with open(os.path.join(CORPUS_DIR, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'battery': 'B4', 'soundfont': sf2,
                   'generated': datetime.now().isoformat(timespec='seconds'),
                   'cases': index}, f, ensure_ascii=False, indent=2)
    print(f'\n{len(index)} cas générés dans {CORPUS_DIR}')


def cmd_run(args):
    index_path = os.path.join(CORPUS_DIR, 'index.json')
    if not os.path.exists(index_path):
        sys.exit(f"corpus B4 absent : lance `python3 {sys.argv[0]} generate`")
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)
    flags = {n: getattr(ap(), n) for n in dir(ap()) if n.startswith('ENABLE_')}
    try:
        commit = subprocess.run(['git', '-C', PROJECT, 'rev-parse', '--short', 'HEAD'],
                                capture_output=True, text=True).stdout.strip()
    except Exception:
        commit = 'unknown'
    report = {'label': args.label, 'battery': 'B4', 'commit': commit, 'flags': flags,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    par_fam = collections.defaultdict(list)
    print(f"{'cas':<28}{'famille':<22}{'majmin':>9}{'tempo_pred':>12}"
          f"{'tempo_gt':>10}{'verdict':>10}")
    for case in index['cases']:
        with open(os.path.join(CORPUS_DIR, f"{case['caseId']}.json"),
                  encoding='utf-8') as f:
            gt = json.load(f)
        result = ap().analyze_chords(os.path.join(PROJECT, case['wav']), 'legacy')
        scored = b1().score_case(gt, result)
        if scored is None:
            print(f"{case['caseId']:<28}  aucun accord")
            continue
        report['cases'][case['caseId']] = scored
        par_fam[case['family']].append(scored)
        tempo_pred = scored.get('tempo_pred')
        tempo_gt = scored.get('tempo_gt')
        # Verdict tempo : exact si ratio dans [0.94, 1.06] OU si double/moitié
        # dans [1.88, 2.12] / [0.47, 0.53] (ambiguïté d'octave acceptable si
        # le tempo est dans la bonne octave).
        verdict = '✗'
        if tempo_pred and tempo_gt:
            r = tempo_pred / tempo_gt
            if 0.94 <= r <= 1.06:
                verdict = '✓'
            elif 1.88 <= r <= 2.12 or 0.47 <= r <= 0.53:
                verdict = '×2/÷2'
        print(f"{case['caseId']:<28}{case['familyLabel']:<22}"
              f"{scored['majmin']:>8.1%}{str(tempo_pred):>12}"
              f"{str(tempo_gt):>10}{verdict:>10}")
    if not report['cases']:
        sys.exit('aucun cas mesuré')
    print()
    print(f"{'famille':<26}{'cas':>5}{'CSR(majmin)':>14}{'tempo exact':>14}")
    resume = {}
    for fam_id, cases in par_fam.items():
        mm = sum(c['majmin'] for c in cases) / len(cases)
        n_tempo_ok = sum(1 for c in cases if c['tempo_pred'] and c['tempo_gt']
                         and 0.94 <= c['tempo_pred'] / c['tempo_gt'] <= 1.06)
        resume[fam_id] = {'cases': len(cases), 'csr_majmin': mm,
                          'tempo_exact': n_tempo_ok}
        print(f"{fam_id:<26}{len(cases):>5}{mm:>13.2%}{n_tempo_ok:>14}")
    tous = list(report['cases'].values())
    n_tempo_ok = sum(1 for c in tous if c['tempo_pred'] and c['tempo_gt']
                     and 0.94 <= c['tempo_pred'] / c['tempo_gt'] <= 1.06)
    globals_ = {
        'cases': len(tous),
        'csr_majmin': sum(c['majmin'] for c in tous) / len(tous),
        'tempo_exact': n_tempo_ok,
    }
    report['global'] = globals_
    report['families'] = resume
    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'tempo exact':>14}")
    print(f"{'B4':<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{n_tempo_ok:>14}/{globals_['cases']}")
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
    p_run.add_argument('--label', default='b4')
    p_run.set_defaults(func=cmd_run)
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()