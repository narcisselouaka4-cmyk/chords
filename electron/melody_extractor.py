#!/usr/bin/env python3
"""Suivi de pitch monophonique + segmentation en notes discrètes.

Module isolé et testable indépendamment du reste du pipeline. Produit, à
partir d'un fichier audio monophonique (typiquement un stem vocal séparé
par Demucs), une liste de notes (pitch MIDI, début, fin) exploitable par
le pont vers MelodyTrack (étage 4).

Pipeline interne :
  1. chargement du WAV (librosa, mono, sr=22050)
  2. suivi de pitch par librosa.pyin (pYIN probabiliste)
  3. segmentation en notes discrètes :
       - quantification des frames f0 vers des numéros de note MIDI
       - détection d'onset (changement de note + onset energy)
       - fusion des frames voisés consécutifs de même note
       - filtrage des notes trop courtes (< min_duration_s)
       - interpolation des gaps non-voisés courts (< max_gap_s)
  4. sortie : liste de dict {midi, start, end, confidence}

Aucune dépendance lourde : librosa est déjà une dépendance du projet.
Aucun appel réseau, aucun modèle à télécharger.

Usage CLI :
  python electron/melody_extractor.py <input.wav> [--stem vocals] [--out out.json]
"""

import argparse
import json
import os
import sys

import numpy as np
import librosa


# ---------------------------------------------------------------------------
# Constantes du modèle de segmentation (non configurables en V1)
# ---------------------------------------------------------------------------

DEFAULT_SR = 22050
DEFAULT_FRAME_LENGTH = 2048
DEFAULT_HOP_LENGTH = 512
DEFAULT_FMIN = 65.0      # Do2 ~ basse masculine
DEFAULT_FMAX = 1046.0   # Do6 ~ soprano aiguë
DEFAULT_MIN_DURATION_S = 0.12   # 120 ms — plus court = ornement/grace note
DEFAULT_MAX_GAP_S = 0.18         # 180 ms — gap plus court interpolé
DEFAULT_MIN_CONFIDENCE = 0.4     # seuil de confiance pyin pour noter une frame


# ---------------------------------------------------------------------------
# Suivi de pitch
# ---------------------------------------------------------------------------

def track_pitch(audio_path, sr=DEFAULT_SR, frame_length=DEFAULT_FRAME_LENGTH,
                hop_length=DEFAULT_HOP_LENGTH, fmin=DEFAULT_FMIN, fmax=DEFAULT_FMAX):
    """Charge le WAV et calcule f0 + voicing par frame via librosa.pyin.

    Retourne (f0, voiced_prob, times). f0 en Hz (0 si non voisé),
    voiced_prob en [0,1], times en secondes (centre de chaque frame).
    """
    y, sr = librosa.load(audio_path, sr=sr, mono=True)
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=fmin,
        fmax=fmax,
        sr=sr,
        frame_length=frame_length,
        hop_length=hop_length,
        fill_na=0.0,
    )
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)
    return f0, voiced_prob, times, sr


# ---------------------------------------------------------------------------
# Segmentation en notes discrètes
# ---------------------------------------------------------------------------

def hz_to_midi(f0):
    """Convertit Hz en numéro de note MIDI (float). 0 Hz → 0 (silence)."""
    out = np.zeros_like(f0)
    mask = f0 > 0
    out[mask] = 69 + 12 * np.log2(f0[mask] / 440.0)
    return out


def segment_notes(f0, voiced_prob, times, sr=DEFAULT_SR,
                  min_duration_s=DEFAULT_MIN_DURATION_S,
                  max_gap_s=DEFAULT_MAX_GAP_S,
                  min_confidence=DEFAULT_MIN_CONFIDENCE):
    """Segment la courbe f0 en notes discrètes.

    Étapes :
      1. quantification MIDI (round) des frames voisées
      2. interpolation des gaps non-voisés courts (< max_gap_s) si la note
         avant et après le gap est identique
      3. fusion des frames consécutifs de même note en segments
      4. filtrage des segments plus courts que min_duration_s
      5. calcul de confiance moyenne par segment

    Retourne une liste de dict {midi, start, end, confidence} triée par start.
    """
    if len(f0) == 0:
        return []

    midi = hz_to_midi(f0)
    # Frame « voisée » si confiance suffisante ET f0 > 0
    voiced = (voiced_prob >= min_confidence) & (f0 > 0)

    # 1. Interpolation des gaps courts : on reconstruit un tableau « note »
    # où les frames non-voisés à l'intérieur d'un gap < max_gap_s entre deux
    # frames voisés de même note MIDI sont remplis avec cette note.
    midi_filled = np.full(len(midi), -1, dtype=int)
    midi_filled[voiced] = np.round(midi[voiced]).astype(int)

    gap_max_frames = int(max_gap_s * sr / DEFAULT_HOP_LENGTH) + 1
    i = 0
    while i < len(midi_filled):
        if midi_filled[i] == -1:
            # Cherche la prochaine frame voisée
            j = i
            while j < len(midi_filled) and midi_filled[j] == -1:
                j += 1
            gap_len = j - i
            if gap_len <= gap_max_frames and i > 0 and j < len(midi_filled):
                # Remplir le gap si même note avant/après
                if midi_filled[i - 1] == midi_filled[j]:
                    midi_filled[i:j] = midi_filled[i - 1]
            i = j
        else:
            i += 1

    # 2. Fusion en segments : runs de même note MIDI
    segments = []
    i = 0
    while i < len(midi_filled):
        if midi_filled[i] == -1:
            i += 1
            continue
        note = midi_filled[i]
        start = i
        while i < len(midi_filled) and midi_filled[i] == note:
            i += 1
        end = i
        segments.append({
            'midi': int(note),
            'start_idx': start,
            'end_idx': end,
            'start': float(times[start]),
            'end': float(times[min(end - 1, len(times) - 1)]),
            'confidence': float(np.mean(voiced_prob[start:end])),
        })

    # 3. Calcul de la durée réelle de chaque segment (en secondes)
    min_frames = int(min_duration_s * sr / DEFAULT_HOP_LENGTH) + 1
    kept = []
    for seg in segments:
        dur = seg['end'] - seg['start']
        # Étendre la fin à la frame suivante (la dernière frame couvre jusqu'à
        # son bord droit, pas son centre)
        seg['end'] = seg['end'] + (DEFAULT_HOP_LENGTH / sr)
        if (seg['end_idx'] - seg['start_idx']) >= min_frames or dur >= min_duration_s:
            kept.append(seg)

    # 4. Fusion des segments adjacents de même note séparés par un gap
    # déjà interpolé (ne devrait pas arriver, mais par sécurité)
    merged = []
    for seg in kept:
        if merged and merged[-1]['midi'] == seg['midi'] and \
                abs(seg['start'] - merged[-1]['end']) < max_gap_s:
            merged[-1]['end'] = seg['end']
            merged[-1]['end_idx'] = seg['end_idx']
            merged[-1]['confidence'] = (merged[-1]['confidence'] + seg['confidence']) / 2
        else:
            merged.append(dict(seg))

    # Nettoyage : on ne garde que midi, start, end, confidence
    return [{
        'midi': s['midi'],
        'start': round(s['start'], 4),
        'end': round(s['end'], 4),
        'confidence': round(s['confidence'], 3),
    } for s in merged]


# ---------------------------------------------------------------------------
# API publique : extract_melody
# ---------------------------------------------------------------------------

def extract_melody(audio_path, **kwargs):
    """Point d'entrée principal : fichier WAV → liste de notes.

    @param audio_path: chemin vers un fichier audio monophonique (stem).
    @return: dict {notes: [{midi, start, end, confidence}], sr, duration, n_notes}
    """
    f0, voiced_prob, times, sr = track_pitch(audio_path,
                                              fmin=kwargs.get('fmin', DEFAULT_FMIN),
                                              fmax=kwargs.get('fmax', DEFAULT_FMAX))
    notes = segment_notes(f0, voiced_prob, times, sr,
                          min_duration_s=kwargs.get('min_duration_s', DEFAULT_MIN_DURATION_S),
                          max_gap_s=kwargs.get('max_gap_s', DEFAULT_MAX_GAP_S),
                          min_confidence=kwargs.get('min_confidence', DEFAULT_MIN_CONFIDENCE))
    duration = float(len(f0) * DEFAULT_HOP_LENGTH / sr) if len(f0) > 0 else 0.0
    return {
        'notes': notes,
        'sr': sr,
        'duration': round(duration, 3),
        'n_notes': len(notes),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Extraction de mélodie monophonique')
    parser.add_argument('input', help='Fichier audio en entrée (WAV)')
    parser.add_argument('--out', help='Fichier JSON de sortie (défaut: stdout)', default=None)
    parser.add_argument('--fmin', type=float, default=DEFAULT_FMIN)
    parser.add_argument('--fmax', type=float, default=DEFAULT_FMAX)
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f'Fichier introuvable: {args.input}', file=sys.stderr)
        sys.exit(1)

    result = extract_melody(args.input, fmin=args.fmin, fmax=args.fmax)
    text = json.dumps(result, indent=2)
    if args.out:
        with open(args.out, 'w') as f:
            f.write(text)
        print(f'{result["n_notes"]} notes extraites → {args.out}', file=sys.stderr)
    else:
        print(text)


if __name__ == '__main__':
    main()