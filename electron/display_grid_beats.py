"""Pulsations pour l'affichage uniquement. Ne lit/écrit aucun résultat d'accords."""
import argparse
import json
import math

import librosa
import numpy as np


def octave_aligned_times(times, detected_tempo, reference_tempo):
    """Même octave de pulsation que le tempo de référence (ex. 70 / 140)."""
    factor = 2 ** max(-2, min(2, round(math.log2(reference_tempo / detected_tempo))))
    result = np.asarray(times, dtype=float)
    if factor >= 1:
        for _ in range(round(math.log2(factor))):
            if len(result) < 2:
                break
            interleaved = np.empty(len(result) * 2 - 1)
            interleaved[::2] = result
            interleaved[1::2] = (result[:-1] + result[1:]) / 2
            result = interleaved
    else:
        result = result[::round(1 / factor)]
    return result, detected_tempo * factor


def track_pulses(onset_envelope, sr, hop_length, tempo=None):
    options = dict(onset_envelope=onset_envelope, sr=sr, hop_length=hop_length,
                   tightness=100, trim=True)
    if tempo is not None:
        options['bpm'] = float(tempo)
    detected, frames = librosa.beat.beat_track(**options)
    scalar = float(np.asarray(detected).reshape(-1)[0])
    return scalar, librosa.frames_to_time(frames, sr=sr, hop_length=hop_length)


def display_rhythm(wav_path, reference_tempo, manual=False):
    if not math.isfinite(reference_tempo) or not 20 <= reference_tempo <= 400:
        raise ValueError('Tempo attendu entre 20 et 400 BPM')
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    hop = 512
    # Même enveloppe spectrale et même suivi que librosa.beat.beat_track(y=…).
    # Le moteur harmonique n'est ni importé ni appelé.
    onsets = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    detected, times = track_pulses(onsets, sr, hop, reference_tempo if manual else None)
    if detected > 0 and not manual:
        times, detected = octave_aligned_times(times, detected, reference_tempo)
    duration = len(y) / sr
    return dict(version=2, source='librosa-display', sourceTempo=reference_tempo,
                tempo=detected or reference_tempo, duration=duration,
                beatTimes=[round(float(t), 6) for t in times if 0 <= t < duration])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('wav_path')
    parser.add_argument('--tempo', type=float, required=True)
    parser.add_argument('--manual', action='store_true')
    args = parser.parse_args()
    print(json.dumps(display_rhythm(args.wav_path, args.tempo, args.manual)))
