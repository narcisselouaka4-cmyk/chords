#!/usr/bin/env python3
"""Tests isolés du module melody_extractor (suivi de pitch + segmentation).

Valide la chaîne complète sur un signal synthétique où la vérité terrain
est connue par construction : on génère un signal audio à partir de notes
MIDI connues, on l'extrait, et on compare.

Usage:
    python tests/test_melody_extractor.py
"""

import os
import sys
import json
import math
import tempfile

import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))

from melody_extractor import extract_melody, hz_to_midi, segment_notes, track_pitch

SR = 22050


def midi_to_hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def synth_note(midi, duration_s, sr=SR, vibrato_cents=8, vibrato_rate=5.0):
    """Synthétise une note avec fondamental + 3 harmoniques + vibrato léger.

    Le vibrato simule une voix chantée (le défi principal de pyin sur voix
    réelle). Amplitude avec fade in/out court pour éviter les clicks.
    """
    n = int(duration_s * sr)
    t = np.arange(n) / sr
    f0 = midi_to_hz(midi)
    # Vibrato sinusoïdal
    vibrato = vibrato_cents / 1200.0
    f0_inst = f0 * (1 + vibrato * np.sin(2 * np.pi * vibrato_rate * t))
    phase = 2 * np.pi * np.cumsum(f0_inst) / sr
    # Fondamental + harmoniques (amplitudes décroissantes)
    sig = (np.sin(phase)
           + 0.5 * np.sin(2 * phase)
           + 0.25 * np.sin(3 * phase)
           + 0.125 * np.sin(4 * phase))
    sig = sig / np.max(np.abs(sig)) * 0.8
    # Fade in/out 30ms
    fade = int(0.03 * sr)
    if n > 2 * fade:
        env = np.ones(n)
        env[:fade] = np.linspace(0, 1, fade)
        env[-fade:] = np.linspace(1, 0, fade)
        sig = sig * env
    return sig


def synth_melody(notes, sr=SR, gap_s=0.1):
    """Synthétise une mélodie : liste de (midi, duration_s) → (signal, gt_notes).

    gt_notes = vérité terrain [{midi, start, end}] en secondes.
    """
    parts = []
    gt = []
    t = 0.0
    for midi, dur in notes:
        note_audio = synth_note(midi, dur)
        parts.append(note_audio)
        gt.append({'midi': midi, 'start': round(t, 4), 'end': round(t + dur, 4)})
        t += dur
        # Gap court
        gap = np.zeros(int(gap_s * sr))
        parts.append(gap)
        t += gap_s
    signal = np.concatenate(parts)
    return signal, gt


def write_wav(path, signal, sr=SR):
    import soundfile as sf
    sf.write(path, signal, sr)


def match_notes(gt_notes, extracted, tolerance_s=0.08, pitch_tolerance=0):
    """Compare deux listes de notes. Retourne (tp, fp, fn, matched_pairs).

    Un appariement est accepté si :
      - même MIDI (pitch_tolerance=0 → exact)
      - |gt.start - extracted.start| <= tolerance_s
      - chevauchement temporel > 50% de la plus courte note
    """
    matched = []
    used = set()
    tp = 0
    for g in gt_notes:
        best = None
        best_score = 0
        for i, e in enumerate(extracted):
            if i in used:
                continue
            if abs(e['midi'] - g['midi']) > pitch_tolerance:
                continue
            # Chevauchement
            overlap = min(g['end'], e['end']) - max(g['start'], e['start'])
            if overlap <= 0:
                continue
            shorter = min(g['end'] - g['start'], e['end'] - e['start'])
            overlap_ratio = overlap / shorter if shorter > 0 else 0
            start_diff = abs(g['start'] - e['start'])
            if overlap_ratio > 0.5 and start_diff <= tolerance_s:
                score = overlap_ratio - start_diff
                if score > best_score:
                    best_score = score
                    best = i
        if best is not None:
            used.add(best)
            matched.append((g, extracted[best]))
            tp += 1
    fp = len(extracted) - tp
    fn = len(gt_notes) - tp
    return tp, fp, fn, matched


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def run_tests():
    passed = 0
    failed = 0

    def assert_cond(cond, msg):
        nonlocal passed, failed
        if cond:
            passed += 1
        else:
            failed += 1
            print(f'  ✗ {msg}')

    tmpdir = tempfile.mkdtemp(prefix='melody_test_')

    # T1 : note unique Do4 (MIDI 60), 1 seconde
    print('T1 — note unique Do4 1s')
    signal, gt = synth_melody([(60, 1.0)])
    path = os.path.join(tmpdir, 't1.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    assert_cond(result['n_notes'] >= 1, f'au moins 1 note extraite (got {result["n_notes"]})')
    if result['n_notes'] >= 1:
        # La note extraite devrait être MIDI 60 (à 1 près pour le vibrato)
        midis = [n['midi'] for n in result['notes']]
        assert_cond(60 in midis or 59 in midis or 61 in midis, f'MIDI 60 (±1) présent (got {midis})')
    tp, fp, fn, _ = match_notes(gt, result['notes'])
    assert_cond(tp == 1 and fn == 0, f'T1 match: tp={tp}, fn={fn}')

    # T2 : gamme Do majeur ascendante (C D E F G A B)
    print('T2 — gamme Do majeur ascendante 7 notes')
    scale = [60, 62, 64, 65, 67, 69, 71]
    signal, gt = synth_melody([(m, 0.4) for m in scale])
    path = os.path.join(tmpdir, 't2.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    tp, fp, fn, _ = match_notes(gt, result['notes'])
    # On tolère 1 erreur (pyin peut manquer une note ou en fusionner)
    assert_cond(tp >= 6, f'au moins 6/7 notes correctes (tp={tp}, fn={fn})')
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    print(f'   precision={precision:.2f} recall={recall:.2f} (tp={tp}, fp={fp}, fn={fn})')

    # T3 : mélodie avec saut d'octave (Do4 → Do5 → Sol4)
    print('T3 — saut d\'octave C4→C5→G4')
    signal, gt = synth_melody([(60, 0.5), (72, 0.5), (67, 0.5)])
    path = os.path.join(tmpdir, 't3.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    tp, fp, fn, _ = match_notes(gt, result['notes'])
    assert_cond(tp >= 2, f'au moins 2/3 notes (saut d\'octave) (tp={tp}, fn={fn})')

    # T4 : note tenue longue (2s) — ne doit pas être segmentée en plusieurs
    print('T4 — note tenue 2s (ne doit pas se segmenter)')
    signal, gt = synth_melody([(64, 2.0)])
    path = os.path.join(tmpdir, 't4.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    # On accepte 1 ou 2 segments (pyin peut hésiter), pas 5+
    assert_cond(result['n_notes'] <= 3, f'note tenue non sur-segmentée (got {result["n_notes"]})')
    if result['n_notes'] >= 1:
        midis = [n['midi'] for n in result['notes']]
        assert_cond(all(m in (64, 63, 65) for m in midis), f'toutes les notes ~MIDI 64 (got {midis})')

    # T5 : silence → note → silence (ne doit pas produire de notes fantômes)
    print('T5 — silence + note + silence (pas de notes fantômes)')
    silence = np.zeros(int(1.0 * SR))
    note = synth_note(60, 0.5)
    signal = np.concatenate([silence, note, silence])
    gt = [{'midi': 60, 'start': 1.0, 'end': 1.5}]
    path = os.path.join(tmpdir, 't5.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    # On accepte 1-2 notes, pas 5
    assert_cond(result['n_notes'] <= 3, f'pas de sur-segmentation sur silence (got {result["n_notes"]})')
    if result['n_notes'] >= 1:
        # Au moins une note proche de MIDI 60
        midis = [n['midi'] for n in result['notes']]
        assert_cond(any(m in (60, 59, 61) for m in midis), f'une note ~MIDI 60 (got {midis})')

    # T6 : hz_to_midi correctness
    print('T6 — hz_to_midi')
    f0 = np.array([440.0, 0.0, 880.0, 261.63])
    midi = hz_to_midi(f0)
    assert_cond(abs(midi[0] - 69.0) < 0.01, f'A4=440Hz → MIDI 69 (got {midi[0]})')
    assert_cond(midi[1] == 0.0, f'0 Hz → 0 (got {midi[1]})')
    assert_cond(abs(midi[2] - 81.0) < 0.01, f'A5=880Hz → MIDI 81 (got {midi[2]})')

    # T7 : segment_notes avec entrée vide
    print('T7 — segment_notes vide')
    empty = segment_notes(np.array([]), np.array([]), np.array([]))
    assert_cond(empty == [], 'entrée vide → liste vide')

    # T8 : mélodie R1-like (Mi Fa Mi Ré Mi Do) — validation format
    print('T8 — mélodie R1-like Mi Fa Mi Ré Mi Do')
    melody = [(64, 0.4), (65, 0.4), (64, 0.4), (62, 0.4), (64, 0.4), (60, 0.4)]
    signal, gt = synth_melody(melody)
    path = os.path.join(tmpdir, 't8.wav')
    write_wav(path, signal)
    result = extract_melody(path)
    tp, fp, fn, _ = match_notes(gt, result['notes'])
    assert_cond(tp >= 4, f'au moins 4/6 notes R1 (tp={tp}, fn={fn})')
    # Format de sortie
    if result['notes']:
        n = result['notes'][0]
        assert_cond('midi' in n and 'start' in n and 'end' in n and 'confidence' in n,
                    'format de note {midi, start, end, confidence}')

    print(f'\n{passed} tests réussis, {failed} échoués (sur {passed + failed})')
    return failed == 0


if __name__ == '__main__':
    ok = run_tests()
    sys.exit(0 if ok else 1)