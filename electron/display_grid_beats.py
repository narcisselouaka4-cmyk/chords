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


# [Claude] — 2026-10-28 — Les premiers temps de mesure viennent d'un modèle entraîné.
#
#   librosa.beat.beat_track suit une pulsation mais ne dit JAMAIS où commence la
#   mesure, et sa grille glisse : mesuré sur quatre morceaux de Narcisse, elle se
#   décalait d'un temps entier au cours du morceau sur deux d'entre eux. Les
#   accords tombaient alors visuellement à côté, alors qu'ils étaient justes.
#
#   beat-this (ISMIR 2024) donne les temps ET les premiers temps de mesure.
#   Mesuré sur les quatre mêmes morceaux, changements d'accord alignés sur le
#   premier temps : 48→84 %, 91→95 %, 58→79 %, 75→91 % ; et la phase devient
#   stable sur 4 morceaux sur 4, contre 2 sur 4.
#
#   Repli sur librosa si le paquet manque. Le mode manuel (tempo imposé par
#   l'utilisateur) reste sur librosa : beat-this n'accepte pas de tempo imposé.
#   Une réserve mesurée : beat-this lit parfois la pulsation à la demi-vitesse
#   (68 au lieu de 136 BPM sur « Les cieux proclament »), et son nombre de temps
#   par mesure n'est pas toujours 4 (9 mesures justes sur 55 pour « You are
#   Yahweh »). On garde donc l'octave du tempo du moteur, comme pour librosa ;
#   ses PREMIERS TEMPS, eux, restent de vrais débuts de mesure même lu en 2.
def _beat_this_rhythm(wav_path, duration, reference_tempo):
    from beat_this.inference import File2Beats
    beats, downbeats = File2Beats(device='cpu', dbn=False)(wav_path)
    beats = np.array([float(t) for t in beats if 0 <= t < duration])
    if len(beats) < 4:
        raise ValueError('pulsations insuffisantes')
    tempo = 60.0 / float(np.median(np.diff(beats)))
    beats, tempo = octave_aligned_times(beats, tempo, reference_tempo)
    beats = [float(t) for t in beats if 0 <= t < duration]
    return beats, [float(t) for t in downbeats if 0 <= t < duration], tempo


def display_rhythm(wav_path, reference_tempo, manual=False):
    if not math.isfinite(reference_tempo) or not 20 <= reference_tempo <= 400:
        raise ValueError('Tempo attendu entre 20 et 400 BPM')
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    hop = 512
    duration = len(y) / sr
    if not manual:
        try:
            beats, downbeats, tempo = _beat_this_rhythm(wav_path, duration, reference_tempo)
            return dict(version=3, source='beat-this', sourceTempo=reference_tempo,
                        tempo=tempo, duration=duration,
                        beatTimes=[round(t, 6) for t in beats],
                        downbeatTimes=[round(t, 6) for t in downbeats])
        except Exception:
            pass  # paquet absent ou morceau atypique : on garde librosa.
    # Même enveloppe spectrale et même suivi que librosa.beat.beat_track(y=…).
    # Le moteur harmonique n'est ni importé ni appelé.
    onsets = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    detected, times = track_pulses(onsets, sr, hop, reference_tempo if manual else None)
    if detected > 0 and not manual:
        times, detected = octave_aligned_times(times, detected, reference_tempo)
    return dict(version=3, source='librosa-display', sourceTempo=reference_tempo,
                tempo=detected or reference_tempo, duration=duration,
                beatTimes=[round(float(t), 6) for t in times if 0 <= t < duration],
                downbeatTimes=[])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('wav_path')
    parser.add_argument('--tempo', type=float, required=True)
    parser.add_argument('--manual', action='store_true')
    args = parser.parse_args()
    print(json.dumps(display_rhythm(args.wav_path, args.tempo, args.manual)))
