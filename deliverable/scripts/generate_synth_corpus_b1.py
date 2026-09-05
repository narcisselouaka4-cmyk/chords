#!/usr/bin/env python3
"""
Générateur de corpus synthétique — Batterie B1 (Offset systématique).

Suit exactement la spec de corpus-test-detection-accords.md :
  - changements d'accords exactement sur le temps
  - voicings en blocs, main droite seule
  - pas de pédale, pas de percussion, pas de réverbération
  - tempos : 60 / 77 / 90 / 120 BPM
  - 5 progressions simples (diatoniques en Do majeur)
  - 4 x 5 = 20 cas

Chaîne : progression (code) -> MIDI (pretty_midi) -> audio (fluidsynth + soundfont)
         -> .wav + vérité terrain .json (labels au format mir_eval : "C:maj", "A:min"...)

Usage:
    python scripts/generate_synth_corpus_b1.py [--out data/synthetic_b1] [--soundfont /usr/share/sounds/sf2/FluidR3_GM.sf2]
"""
import argparse
import json
import os
import subprocess
import sys

import pretty_midi

PC = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6,
      'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# quality -> intervals (root, third, fifth) depuis la fondamentale
QUALITY_INTERVALS = {
    'maj': [0, 4, 7],
    'min': [0, 3, 7],
}

# 5 progressions simples, diatoniques en Do majeur.
# Chaque élément : (nom_degré, pitch_class_racine, qualité)
PROGRESSIONS = {
    'prog01_I-IV-V-I': [('I', PC['C'], 'maj'), ('IV', PC['F'], 'maj'),
                         ('V', PC['G'], 'maj'), ('I', PC['C'], 'maj')],
    'prog02_I-vi-IV-V': [('I', PC['C'], 'maj'), ('vi', PC['A'], 'min'),
                          ('IV', PC['F'], 'maj'), ('V', PC['G'], 'maj')],
    'prog03_ii-V-I': [('ii', PC['D'], 'min'), ('V', PC['G'], 'maj'),
                       ('I', PC['C'], 'maj')],
    'prog04_I-V-vi-IV': [('I', PC['C'], 'maj'), ('V', PC['G'], 'maj'),
                          ('vi', PC['A'], 'min'), ('IV', PC['F'], 'maj')],
    'prog05_vi-ii-V-I': [('vi', PC['A'], 'min'), ('ii', PC['D'], 'min'),
                          ('V', PC['G'], 'maj'), ('I', PC['C'], 'maj')],
}

TEMPOS = [60, 77, 90, 120]
BEATS_PER_CHORD = 4  # une mesure de 4/4 par accord
BASE_OCTAVE_MIDI = 60  # C4


def chord_label_mir_eval(root_pc, quality):
    return f'{NOTE_NAMES[root_pc]}:{quality}'


def build_midi(progression, bpm):
    """Construit un objet pretty_midi avec voicings en blocs, main droite seule."""
    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    inst = pretty_midi.Instrument(program=0, name='Acoustic Grand Piano')  # program 0 = piano acoustique
    sec_per_beat = 60.0 / bpm
    chord_dur = BEATS_PER_CHORD * sec_per_beat

    t = 0.0
    chords_gt = []
    for _, root_pc, quality in progression:
        intervals = QUALITY_INTERVALS[quality]
        for iv in intervals:
            pitch = BASE_OCTAVE_MIDI + root_pc + iv
            note = pretty_midi.Note(velocity=90, pitch=pitch, start=t, end=t + chord_dur)
            inst.notes.append(note)
        chords_gt.append({
            'start': round(t, 6),
            'end': round(t + chord_dur, 6),
            'label': chord_label_mir_eval(root_pc, quality),
        })
        t += chord_dur

    pm.instruments.append(inst)
    total_duration = t
    n_beats = int(round(total_duration / sec_per_beat))
    beats = [round(i * sec_per_beat, 6) for i in range(n_beats + 1)]
    return pm, chords_gt, beats, total_duration


def render_audio(midi_path, wav_path, soundfont, sample_rate=44100):
    cmd = ['fluidsynth', '-ni', '-F', wav_path, '-r', str(sample_rate), soundfont, midi_path]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0 or not os.path.isfile(wav_path):
        raise RuntimeError(f'fluidsynth failed: {proc.stderr}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data/synthetic_b1')
    ap.add_argument('--soundfont', default='/usr/share/sounds/sf2/FluidR3_GM.sf2')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    manifest = []

    case_n = 0
    for bpm in TEMPOS:
        for prog_id, progression in PROGRESSIONS.items():
            case_n += 1
            case_id = f'B1_offset_{bpm:03d}bpm_{prog_id}'
            midi_path = os.path.join(args.out, f'{case_id}.mid')
            wav_path = os.path.join(args.out, f'{case_id}.wav')
            gt_path = os.path.join(args.out, f'{case_id}_ground_truth.json')

            pm, chords_gt, beats, duration = build_midi(progression, bpm)
            pm.write(midi_path)
            render_audio(midi_path, wav_path, args.soundfont)

            gt = {
                'audio': os.path.basename(wav_path),
                'bpm': float(bpm),
                'beats': beats,
                'chords': chords_gt,
            }
            with open(gt_path, 'w') as f:
                json.dump(gt, f, indent=2, ensure_ascii=False)

            manifest.append({
                'battery': 'B1',
                'id': case_id,
                'audio': wav_path,
                'ground_truth': gt_path,
                'bpm': bpm,
                'progression': prog_id,
                'n_chords': len(chords_gt),
                'duration': round(duration, 3),
            })
            print(f'[{case_n:2d}/20] {case_id}  ({duration:.2f}s)')

    manifest_path = os.path.join(args.out, 'manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f'\nCorpus B1 généré : {len(manifest)} cas -> {args.out}')
    print(f'Manifest : {manifest_path}')


if __name__ == '__main__':
    sys.exit(main())
