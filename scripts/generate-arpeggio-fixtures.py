#!/usr/bin/env python3
"""Génère un corpus minimal de fixtures WAV synthétiques déterministes pour
valider la correction de la sur-segmentation des arpèges, mouvements mélodiques
et pédales dans le pipeline d'analyse d'accords audio.

Sortie : tests/audio/arpeggio/*.wav + tests/audio/arpeggio/*.json
Lancer : python3 scripts/generate-arpeggio-fixtures.py

Convention reprise de scripts/generate-progression-tests.py :
  - SR = 22050, sinus + harmoniques, enveloppe attaque/release, click percussif.
  - Ground truth JSON décrivant segments attendus et événements à absorber.

Chaque fixture est conçue pour être reproductible (numpy seeded) et assez longue
pour que librosa.beat_track détecte un tempo stable.
"""
import json
import os

import numpy as np
import librosa
import soundfile as sf

SR = 22050
BPM = 120
BEAT_DUR = 60.0 / BPM
EIGHTH = BEAT_DUR / 2.0
SIXTEENTH = BEAT_DUR / 4.0
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'tests', 'audio', 'arpeggio',
)
os.makedirs(OUT, exist_ok=True)

np.random.seed(42)


def note_to_hz(note):
    return float(librosa.note_to_hz(note))


def envelope(n, attack_ms=1, release_ms=50):
    atk = min(int(attack_ms / 1000.0 * SR), max(n // 8, 1))
    rel = min(int(release_ms / 1000.0 * SR), max(n // 4, 1))
    env = np.ones(n)
    if atk > 0:
        env[:atk] = np.linspace(0, 1, atk)
    if rel > 0:
        env[-rel:] = np.linspace(1, 0, rel)
    return env


def percussive_click(n_samples, amp=0.08):
    click_len = min(int(0.010 * SR), max(n_samples // 4, 1))
    click = amp * np.random.randn(click_len)
    click *= np.linspace(1, 0, click_len)
    return click


def note_wave(note, dur, amp=0.12, attack_ms=1, release_ms=50):
    """Rendu d'une note unique sinus + 2nd/3rd harmoniques."""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    f = note_to_hz(note)
    y = amp * np.sin(2 * np.pi * f * t)
    y += amp * 0.2 * np.sin(2 * np.pi * 2 * f * t)
    y += amp * 0.1 * np.sin(2 * np.pi * 3 * f * t)
    y *= envelope(n, attack_ms=attack_ms, release_ms=release_ms)
    return y


def chord_wave(bass_note, upper_notes, dur, bass_amp=0.30, upper_amp=0.12,
               attack_ms=1, release_ms=80):
    """Rendu d'un accord plaqué (basse + voix supérieures simultanées)."""
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    y = np.zeros(n)
    fb = note_to_hz(bass_note)
    y += bass_amp * np.sin(2 * np.pi * fb * t)
    y += bass_amp * 0.3 * np.sin(2 * np.pi * 2 * fb * t)
    y += bass_amp * 0.15 * np.sin(2 * np.pi * 3 * fb * t)
    for note in upper_notes:
        f = note_to_hz(note)
        y += upper_amp * np.sin(2 * np.pi * f * t)
        y += upper_amp * 0.2 * np.sin(2 * np.pi * 2 * f * t)
    y *= envelope(n, attack_ms=attack_ms, release_ms=release_ms)
    click = percussive_click(n)
    y[:len(click)] += click
    return np.clip(y, -1, 1)


def arpeggio_wave(bass_note, note_sequence, note_dur, bass_amp=0.30, upper_amp=0.14,
                  bass_pedal=True, attack_ms=1, release_ms=60):
    """Rend une suite de notes (arpège) avec une basse pedal sous-jacente.

    bass_pedal=True : la basse est tenue pendant toute la durée (pédale).
    bass_pedal=False : la basse n'est jouée qu'au début (arpège pur).
    """
    total_dur = len(note_sequence) * note_dur
    n = int(SR * total_dur)
    y = np.zeros(n)
    # Basse
    fb = note_to_hz(bass_note)
    t_full = np.linspace(0, total_dur, n, endpoint=False)
    if bass_pedal:
        y += bass_amp * np.sin(2 * np.pi * fb * t_full)
        y += bass_amp * 0.3 * np.sin(2 * np.pi * 2 * fb * t_full)
        y += bass_amp * 0.15 * np.sin(2 * np.pi * 3 * fb * t_full)
    else:
        # Basse uniquement sur la première note
        nb = int(SR * note_dur)
        tb = np.linspace(0, note_dur, nb, endpoint=False)
        y[:nb] += bass_amp * np.sin(2 * np.pi * fb * tb)
        y[:nb] += bass_amp * 0.3 * np.sin(2 * np.pi * 2 * fb * tb)
    # Notes successives
    for i, note in enumerate(note_sequence):
        start = int(i * note_dur * SR)
        nw = note_wave(note, note_dur, amp=upper_amp,
                       attack_ms=attack_ms, release_ms=release_ms)
        end = min(start + len(nw), n)
        y[start:end] += nw[:end - start]
    y *= envelope(n, attack_ms=1, release_ms=80)
    click = percussive_click(n)
    y[:len(click)] += click
    return np.clip(y, -1, 1)


def silence_wave(dur):
    n = int(SR * dur)
    return np.zeros(n)


def concat(*blocks):
    return np.concatenate(blocks)


def save(name, y, gt):
    wav_path = os.path.join(OUT, f'{name}.wav')
    sf.write(wav_path, y, SR)
    gt_path = os.path.join(OUT, f'{name}.json')
    with open(gt_path, 'w') as f:
        json.dump(gt, f, indent=2)
    print(f'  {wav_path}  ({len(y)/SR:.2f}s)')
    print(f'  {gt_path}')


def gt_segment(start, end, root, quality, bass, upper_notes, intervals,
               kind='chord', absorb=False, note='keep'):
    return {
        'start_time': round(start, 3),
        'end_time': round(end, 3),
        'root': root,
        'quality': quality,
        'bass': bass,
        'upper_notes': upper_notes,
        'intervals': intervals,
        'kind': kind,
        'absorb': absorb,
        'expected': note,
    }


# Durée d'un accord plaqué de 4 temps (une mesure à 120 BPM)
CHORD4 = 4 * BEAT_DUR  # 2.0s
# Répétitions pour stabiliser beat_track (au moins 4 mesures)
REPS = 4


# ─── A. C majeur plaqué pendant 4 temps → un segment C ───
def build_A():
    name = 'A_c_major_blocked'
    block = chord_wave('C2', ['E3', 'G3', 'C4'], CHORD4)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'C majeur plaqué pendant 4 temps, répété 4 fois',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['C'] * REPS,
        'absorb_internal': True,
        'segments': segs,
    })


# ─── B. Cmaj7 plaqué pendant 4 temps → Cmaj7 ou downgrade explicite ───
def build_B():
    name = 'B_cmaj7_blocked'
    block = chord_wave('C2', ['E3', 'G3', 'B3'], CHORD4)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'maj7', 'C2',
                               ['E3', 'G3', 'B3'], [0, 4, 7, 11], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Cmaj7 plaqué pendant 4 temps, répété 4 fois',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── C. Cmaj7 arpégé à une note par temps → une seule harmonie ───
def build_C():
    name = 'C_cmaj7_arpeg_quarter'
    # 4 notes par mesure, 1 note par temps, 4 temps = 1 mesure
    notes = ['E3', 'G3', 'B3', 'C4']  # tierce, quinte, septième, octave
    note_dur = BEAT_DUR
    block = arpeggio_wave('C2', notes, note_dur, bass_pedal=True)
    # Répéter pour stabiliser le beat tracking (4 mesures)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'maj7', 'C2',
                               notes, [0, 4, 7, 11], kind='arpeggio',
                               absorb=True, note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Cmaj7 arpégé à une note par temps (croche implicite = noire), pédale C',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── D. Cmaj7 arpégé en croches → un seul segment harmonique ───
def build_D():
    name = 'D_cmaj7_arpeg_eighth'
    # 8 notes par mesure (2 croches par temps), 4 temps
    notes = ['E3', 'G3', 'B3', 'C4', 'E3', 'G3', 'B3', 'C4']
    note_dur = EIGHTH
    block = arpeggio_wave('C2', notes, note_dur, bass_pedal=True)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'maj7', 'C2',
                               notes, [0, 4, 7, 11], kind='arpeggio',
                               absorb=True, note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Cmaj7 arpégé en croches, pédale C',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── E. Cmaj7 arpégé en doubles croches → un seul segment harmonique ───
def build_E():
    name = 'E_cmaj7_arpeg_sixteenth'
    # 16 notes par mesure (4 doubles croches par temps)
    notes = (['E3', 'G3', 'B3', 'C4'] * 4)
    note_dur = SIXTEENTH
    block = arpeggio_wave('C2', notes, note_dur, bass_pedal=True)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'maj7', 'C2',
                               notes, [0, 4, 7, 11], kind='arpeggio',
                               absorb=True, note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Cmaj7 arpégé en doubles croches, pédale C',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── F. Mouvement mélodique diatonique au-dessus d'un C stable ───
def build_F():
    name = 'F_diatonic_melody_over_C'
    # C plaqué 4 temps, avec mélodie diatonique C-D-E-F-G-A-G-E par noire
    block = chord_wave('C2', ['E3', 'G3'], CHORD4, bass_amp=0.30, upper_amp=0.08)
    melody_notes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'G4', 'E4']
    note_dur = BEAT_DUR / 2  # croches
    n = int(SR * CHORD4)
    t = np.linspace(0, CHORD4, n, endpoint=False)
    y = block.copy()
    for i, mn in enumerate(melody_notes):
        start = int(i * note_dur * SR)
        nw = note_wave(mn, note_dur, amp=0.14)
        end = min(start + len(nw), n)
        y[start:end] += nw[:end - start]
    y = np.clip(y, -1, 1)
    y = concat(*([y] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'major', 'C2',
                               ['E3', 'G3'] + melody_notes, [0, 4, 7],
                               kind='melody_over_chord', absorb=True,
                               note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Mouvement mélodique diatonique au-dessus d un C stable',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['C', 'Cmaj7'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── G. Note chromatique fugitive au-dessus de C ───
def build_G():
    name = 'G_chromatic_passing_over_C'
    # C plaqué 4 temps, mélodie C-E-G-Ab-G (Ab = chromatique fugace)
    block = chord_wave('C2', ['E3', 'G3'], CHORD4, bass_amp=0.30, upper_amp=0.08)
    melody_notes = ['C4', 'E4', 'G4', 'Ab4', 'G4']
    # L'Ab est courte (double croche), les autres sont des croches
    durations = [EIGHTH, EIGHTH, EIGHTH, SIXTEENTH, EIGHTH]
    n = int(SR * CHORD4)
    y = block.copy()
    pos = 0.0
    for mn, d in zip(melody_notes, durations):
        start = int(pos * SR)
        nw = note_wave(mn, d, amp=0.14)
        end = min(start + len(nw), n)
        y[start:end] += nw[:end - start]
        pos += d
    y = np.clip(y, -1, 1)
    y = concat(*([y] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'major', 'C2',
                               ['E3', 'G3'] + melody_notes, [0, 4, 7],
                               kind='melody_over_chord', absorb=True,
                               note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Note chromatique fugitive Ab au-dessus d un C stable',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['C', 'Cmaj7'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── H. C pendant 2 temps puis G pendant 2 temps → deux segments ───
def build_H():
    name = 'H_c_then_g_half_bar'
    dur = 2 * BEAT_DUR  # 2 temps = 1.0s
    c_block = chord_wave('C2', ['E3', 'G3', 'C4'], dur)
    g_block = chord_wave('G2', ['B3', 'D4', 'G4'], dur)
    pair = concat(c_block, g_block)
    y = concat(*([pair] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * 2 * dur
        segs.append(gt_segment(s0, s0 + dur, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + dur, s0 + 2 * dur, 'G', 'major', 'G2',
                               ['B3', 'D4', 'G4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'C 2 temps puis G 2 temps, répété 4 fois',
        'expected_segments_min': REPS * 2,
        'expected_segments_max': REPS * 2,
        'expected_chords': ['C', 'G'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── I. Changement C → G sur un demi-temps → changement préservé ───
def build_I():
    name = 'I_c_g_off_half_beat'
    # C sur 1.5 temps (0.75s), G sur 0.5 temps (0.25s), puis C 2 temps
    # On ajoute un click fort à chaque beat pour aider le beat tracking à 120.
    c_short = chord_wave('C2', ['E3', 'G3', 'C4'], 1.5 * BEAT_DUR)
    g_short = chord_wave('G2', ['B3', 'D4', 'G4'], 0.5 * BEAT_DUR)
    c_long = chord_wave('C2', ['E3', 'G3', 'C4'], 2 * BEAT_DUR)
    triplet = concat(c_short, g_short, c_long)
    y = concat(*([triplet] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * (1.5 + 0.5 + 2) * BEAT_DUR
        segs.append(gt_segment(s0, s0 + 1.5 * BEAT_DUR, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + 1.5 * BEAT_DUR, s0 + 2 * BEAT_DUR,
                               'G', 'major', 'G2',
                               ['B3', 'D4', 'G4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + 2 * BEAT_DUR, s0 + 4 * BEAT_DUR,
                               'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': BEAT_DUR, 'repeats': REPS,
        'description': 'Changement C -> G sur demi-temps (0.25s) puis retour C',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS * 3,
        'expected_chords': ['C', 'G', 'C'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── J. C 2 temps → D7 0.5 temps → G 1.5 temps → trois segments ───
def build_J():
    name = 'J_c_d7_g_passing'
    # NB: le D7 dure 1 temps (0.5s) pour rester au-dessus du seuil _clean_segments
    # (min_duration=0.4s). Un passage plus court serait absorbé par le moteur,
    # ce qui n'est pas le défaut ciblé ici.
    c_block = chord_wave('C2', ['E3', 'G3', 'C4'], 2 * BEAT_DUR)
    d7_block = chord_wave('D2', ['F3', 'A3', 'C4'], 1 * BEAT_DUR)
    g_block = chord_wave('G2', ['B3', 'D4', 'G4'], 1 * BEAT_DUR)
    triplet = concat(c_block, d7_block, g_block)
    y = concat(*([triplet] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * (2 + 1 + 1) * BEAT_DUR
        segs.append(gt_segment(s0, s0 + 2 * BEAT_DUR, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + 2 * BEAT_DUR, s0 + 3 * BEAT_DUR,
                               'D', '7', 'D2',
                               ['F3', 'A3', 'C4'], [0, 4, 7, 10], kind='passing'))
        segs.append(gt_segment(s0 + 3 * BEAT_DUR, s0 + 4 * BEAT_DUR,
                               'G', 'major', 'G2',
                               ['B3', 'D4', 'G4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': BEAT_DUR, 'repeats': REPS,
        'description': 'C 2 temps -> D7 passage 1 temps -> G 1 temps',
        'expected_segments_min': REPS * 3,
        'expected_segments_max': REPS * 3,
        'expected_chords': ['C', 'D7', 'G'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── K. Pédale de basse C avec vrai changement supérieur ───
def build_K():
    name = 'K_pedal_c_upper_change'
    # Pédale C pendant 4 temps, voix supérieures : C-E-G pendant 2 temps, A-C-E pendant 2 temps
    # Le changement supérieur (C→Am) doit rester détectable malgré la pédale commune
    dur = 2 * BEAT_DUR
    n = int(SR * 4 * BEAT_DUR)
    t = np.linspace(0, 4 * BEAT_DUR, n, endpoint=False)
    # Basse pédale C2
    fb = note_to_hz('C2')
    y = 0.30 * np.sin(2 * np.pi * fb * t)
    y += 0.30 * 0.3 * np.sin(2 * np.pi * 2 * fb * t)
    # Première moitié : C-E-G
    n_half = int(SR * dur)
    for note in ['E3', 'G3', 'C4']:
        f = note_to_hz(note)
        th = np.linspace(0, dur, n_half, endpoint=False)
        y[:n_half] += 0.12 * np.sin(2 * np.pi * f * th)
    # Seconde moitié : A-C-E (Am sur pédale C)
    for note in ['A3', 'C4', 'E4']:
        f = note_to_hz(note)
        th = np.linspace(0, dur, n - n_half, endpoint=False)
        y[n_half:] += 0.12 * np.sin(2 * np.pi * f * th)
    y *= envelope(n, attack_ms=1, release_ms=80)
    click = percussive_click(n)
    y[:len(click)] += click
    y = np.clip(y, -1, 1)
    y = concat(*([y] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * 4 * BEAT_DUR
        segs.append(gt_segment(s0, s0 + 2 * BEAT_DUR, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + 2 * BEAT_DUR, s0 + 4 * BEAT_DUR,
                               'A', 'minor', 'C2',
                               ['A3', 'C4', 'E4'], [0, 3, 7], kind='chord',
                               note='keep_upper_change'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': 2 * BEAT_DUR, 'repeats': REPS,
        'description': 'Pédale C avec changement réel des voix supérieures (C -> Am)',
        'expected_segments_min': REPS * 2,
        'expected_segments_max': REPS * 2,
        'expected_chords': ['C', 'Am'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── L. Basse mobile interne à Cmaj7 → aucun changement artificiel ───
def build_L():
    name = 'L_walking_bass_cmaj7'
    # Voix supérieures stables C-E-G-B (Cmaj7) pendant 4 temps,
    # basse mobile C2-E2-G2-B2 (walking interne au Cmaj7)
    dur = 4 * BEAT_DUR
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    y = np.zeros(n)
    # Voix supérieures stables
    for note in ['E3', 'G3', 'B3']:
        f = note_to_hz(note)
        y += 0.12 * np.sin(2 * np.pi * f * t)
        y += 0.12 * 0.2 * np.sin(2 * np.pi * 2 * f * t)
    # Basse mobile : C2 sur temps 1, E2 sur temps 2, G2 sur temps 3, B2 sur temps 4
    bass_notes = ['C2', 'E2', 'G2', 'B2']
    for i, bn in enumerate(bass_notes):
        start = int(i * BEAT_DUR * SR)
        end = int((i + 1) * BEAT_DUR * SR)
        fb = note_to_hz(bn)
        tb = np.linspace(0, BEAT_DUR, end - start, endpoint=False)
        y[start:end] += 0.30 * np.sin(2 * np.pi * fb * tb)
        y[start:end] += 0.30 * 0.3 * np.sin(2 * np.pi * 2 * fb * tb)
    y *= envelope(n, attack_ms=1, release_ms=80)
    click = percussive_click(n)
    y[:len(click)] += click
    y = np.clip(y, -1, 1)
    y = concat(*([y] * REPS))
    segs = []
    for r in range(REPS):
        s = r * dur
        segs.append(gt_segment(s, s + dur, 'C', 'maj7', 'C2',
                               ['E3', 'G3', 'B3'] + bass_notes, [0, 4, 7, 11],
                               kind='walking_bass', absorb=True,
                               note='absorb_internal'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'Basse mobile interne à Cmaj7 (walking C-E-G-B)',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── M. Csus4 → C → résolution préservée ───
def build_M():
    name = 'M_csus4_to_c'
    dur = 2 * BEAT_DUR
    sus4 = chord_wave('C2', ['F3', 'G3', 'C4'], dur)
    cmaj = chord_wave('C2', ['E3', 'G3', 'C4'], dur)
    pair = concat(sus4, cmaj)
    y = concat(*([pair] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * 2 * dur
        segs.append(gt_segment(s0, s0 + dur, 'C', 'sus4', 'C2',
                               ['F3', 'G3', 'C4'], [0, 5, 7], kind='chord'))
        segs.append(gt_segment(s0 + dur, s0 + 2 * dur, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'Csus4 -> C, résolution préservée',
        'expected_segments_min': REPS * 2,
        'expected_segments_max': REPS * 2,
        'expected_chords': ['Csus4', 'C'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── N. Arpège incomplet C-G-B sans tierce ───
def build_N():
    name = 'N_incomplete_arpeg_no_third'
    # C-G-B (sans E), 1 note par temps, pédale C
    notes = ['G3', 'B3', 'G3', 'B3']  # pas de tierce E
    note_dur = BEAT_DUR
    block = arpeggio_wave('C2', notes, note_dur, bass_pedal=True)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s = r * CHORD4
        segs.append(gt_segment(s, s + CHORD4, 'C', 'maj7', 'C2',
                               notes, [0, 7, 11], kind='arpeggio_incomplete',
                               absorb=True, note='absorb_internal_no_third'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': CHORD4, 'repeats': REPS,
        'description': 'Arpège incomplet C-G-B sans tierce, pédale C',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS,
        'expected_chords': ['Cmaj7', 'C'],
        'absorb_internal': True,
        'segments': segs,
    })


# ─── O. Silence entre C et G → aucun accord inventé ───
def build_O():
    name = 'O_silence_between_c_g'
    dur = 2 * BEAT_DUR
    # Silence de 3 temps (1.5s) > silence_min=1.2s pour ne pas être absorbé
    sil_dur = 3 * BEAT_DUR
    c_block = chord_wave('C2', ['E3', 'G3', 'C4'], dur)
    g_block = chord_wave('G2', ['B3', 'D4', 'G4'], dur)
    sil = silence_wave(sil_dur)
    triplet = concat(c_block, sil, g_block)
    y = concat(*([triplet] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * (2 * dur + sil_dur)
        segs.append(gt_segment(s0, s0 + dur, 'C', 'major', 'C2',
                               ['E3', 'G3', 'C4'], [0, 4, 7], kind='chord'))
        segs.append(gt_segment(s0 + dur, s0 + dur + sil_dur, '', '', '',
                               [], [], kind='silence', note='no_invented_chord'))
        segs.append(gt_segment(s0 + dur + sil_dur, s0 + 2 * dur + sil_dur,
                               'G', 'major', 'G2',
                               ['B3', 'D4', 'G4'], [0, 4, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'Silence de 3 temps (>1.2s) entre C et G',
        'expected_segments_min': REPS * 2,
        'expected_segments_max': REPS * 2,
        'expected_chords': ['C', 'G'] * REPS,
        'absorb_internal': False,
        'segments': segs,
    })


# ─── P. Cellule inspirée des passages réels (G/B + B-D-E + Am) ───
def build_P():
    name = 'P_real_cell_bde_am'
    # Pédale G/B pendant 4 temps, voix successive B-D-E (sans F# stable), puis Am
    # Pas d'assertion arbitraire sur G6/B ou Em7/B, juste : pas de Bm7->Em7->Bm
    # Section 1 : G/B (B bass + G-D upper) pendant 2 temps
    # Section 2 : voix B-D-E mobiles pendant 2 temps (toujours basse B)
    # Section 3 : Am pendant 2 temps
    dur = 2 * BEAT_DUR
    # Section 1 : G/B
    n1 = int(SR * dur)
    t1 = np.linspace(0, dur, n1, endpoint=False)
    sec1 = np.zeros(n1)
    fb = note_to_hz('B2')
    sec1 += 0.30 * np.sin(2 * np.pi * fb * t1)
    sec1 += 0.30 * 0.3 * np.sin(2 * np.pi * 2 * fb * t1)
    for note in ['G3', 'D4']:
        f = note_to_hz(note)
        sec1 += 0.12 * np.sin(2 * np.pi * f * t1)
    sec1 *= envelope(n1, attack_ms=1, release_ms=80)
    sec1[:min(int(0.010 * SR), n1 // 4)] += percussive_click(n1)
    # Section 2 : voix mobiles B-D-E (croches), basse B tenue
    notes_seq = ['B3', 'D4', 'E4', 'D4']
    note_dur_s = EIGHTH
    n2 = int(SR * dur)
    sec2 = np.zeros(n2)
    t2 = np.linspace(0, dur, n2, endpoint=False)
    fb = note_to_hz('B2')
    sec2 += 0.28 * np.sin(2 * np.pi * fb * t2)
    sec2 += 0.28 * 0.3 * np.sin(2 * np.pi * 2 * fb * t2)
    for i, mn in enumerate(notes_seq):
        start = int(i * note_dur_s * SR)
        nw = note_wave(mn, note_dur_s, amp=0.14)
        end = min(start + len(nw), n2)
        sec2[start:end] += nw[:end - start]
    sec2 *= envelope(n2, attack_ms=1, release_ms=80)
    # Section 3 : Am
    sec3 = chord_wave('A2', ['A3', 'C4', 'E4'], dur)
    block = concat(sec1, sec2, sec3)
    y = concat(*([block] * REPS))
    segs = []
    for r in range(REPS):
        s0 = r * 3 * dur
        # Section 1 et 2 : une seule harmonie (pas de succession Bm7->Em7->Bm)
        segs.append(gt_segment(s0, s0 + 2 * dur, '', '', 'B2',
                               ['G3', 'D4'] + notes_seq, [],
                               kind='real_cell_arpeggio', absorb=True,
                               note='absorb_no_bde_split'))
        # Section 3 : Am préservé
        segs.append(gt_segment(s0 + 2 * dur, s0 + 3 * dur, 'A', 'minor', 'A2',
                               ['A3', 'C4', 'E4'], [0, 3, 7], kind='chord'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'Cellule réelle : G/B + voix B-D-E mobiles + Am',
        'expected_segments_min': REPS * 2,
        'expected_segments_max': REPS * 2,
        'expected_chords': [['G', 'G/B', 'Em7/B', 'G6/B', 'Cmaj7/B'], 'Am'] * REPS,
        'absorb_internal': True,
        'forbidden_succession': ['Bm7', 'Em7', 'Bm'],
        'segments': segs,
    })


# ─── Q. Pédale de G avec voix supérieures mobiles E-C-F-D-B ───
def build_Q():
    name = 'Q_pedal_g_melody_ecfdb'
    # Pédale G pendant 4 temps, mélodie E-C-F-D-B (croches)
    dur = 4 * BEAT_DUR
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    y = np.zeros(n)
    fb = note_to_hz('G2')
    y += 0.32 * np.sin(2 * np.pi * fb * t)
    y += 0.32 * 0.3 * np.sin(2 * np.pi * 2 * fb * t)
    y += 0.32 * 0.15 * np.sin(2 * np.pi * 3 * fb * t)
    melody_notes = ['E4', 'C4', 'F4', 'D4', 'B3', 'E4', 'C4', 'F4']
    note_dur_s = BEAT_DUR / 2  # croches
    for i, mn in enumerate(melody_notes):
        start = int(i * note_dur_s * SR)
        nw = note_wave(mn, note_dur_s, amp=0.14)
        end = min(start + len(nw), n)
        y[start:end] += nw[:end - start]
    y *= envelope(n, attack_ms=1, release_ms=80)
    click = percussive_click(n)
    y[:len(click)] += click
    y = np.clip(y, -1, 1)
    y = concat(*([y] * REPS))
    segs = []
    for r in range(REPS):
        s = r * dur
        segs.append(gt_segment(s, s + dur, 'G', 'major', 'G2',
                               melody_notes, [0, 4, 7], kind='pedal_with_melody',
                               absorb=True, note='absorb_no_gm7_dsus4'))
    save(name, y, {
        'file': f'{name}.wav', 'sr': SR, 'bpm': BPM,
        'chord_duration': dur, 'repeats': REPS,
        'description': 'Pédale G avec voix supérieures mobiles E-C-F-D-B',
        'expected_segments_min': REPS,
        'expected_segments_max': REPS * 2,
        'expected_chords': ['G', 'Gmaj7', 'C/G'],
        'absorb_internal': True,
        'forbidden_chords': ['Gm7', 'Dsus4'],
        'segments': segs,
    })


if __name__ == '__main__':
    print('Génération du corpus arpeggio...')
    build_A()
    build_B()
    build_C()
    build_D()
    build_E()
    build_F()
    build_G()
    build_H()
    build_I()
    build_J()
    build_K()
    build_L()
    build_M()
    build_N()
    build_O()
    build_P()
    build_Q()
    print(f'\nDone — corpus dans {OUT}')