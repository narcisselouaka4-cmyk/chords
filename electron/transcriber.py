#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
[Claude] — 2026-09-06 — Pédagogie IA v2 : transcription locale de la parole.

Même contrat que audio-processor.py : arguments en ligne de commande, JSON sur
la DERNIÈRE ligne de stdout. Les journaux vont sur stderr, jamais sur stdout.

    transcriber.py transcribe <fichier.wav> [--model=small] [--language=fr]

Sortie, succès :
    {"ok": true, "segments": [{"start": 0.0, "end": 3.2, "text": "..."}],
     "language": "fr", "languageProbability": 0.99, "model": "small",
     "dropped": 2}

Sortie, échec (le processus sort quand même avec le code 0 : c'est le JSON qui
porte la raison, pour que l'interface puisse la distinguer) :
    {"ok": false, "reason": "MissingDependency" | "ReadFailed" | "Failed",
     "message": "..."}

POURQUOI faster-whisper ET PAS whisper-timestamped
--------------------------------------------------
faster-whisper (réimplémentation CTranslate2 de Whisper) est sous licence MIT et
donne l'horodatage PAR SEGMENT en natif. whisper-timestamped ajoute
l'horodatage mot à mot, mais sous licence AGPL-3.0 : un copyleft avec obligation
de divulgation de la source, exactement la contrainte que le projet évite depuis
la décision du 28/08. La granularité segment suffit à ce qui est demandé —
situer un conseil dans le temps, pas sous-titrer mot à mot.

POURQUOI LE MODÈLE « small »
----------------------------
`tiny` et `base` décrochent nettement sur du français parlé : ils confondent le
vocabulaire musical (« tierce » / « tierces », « quinte » / « quinze ») et
rendent un texte que l'on ne peut pas montrer comme étant la parole du
professeur. `medium` et `large-v3` sont plus justes mais demandent plusieurs
fois le temps réel sur un CPU sans GPU, ce qui est le cas ici. `small`
(~244 M paramètres, ~250 Mo sur disque en int8) est le premier palier qui tient
un tutoriel calme en français.

POUR CHANGER DE MODÈLE : la constante DEFAULT_MODEL ci-dessous, ou l'option
`--model=` passée par l'appelant. Rien d'autre n'est à toucher. Les tailles
disponibles : tiny, base, small, medium, large-v3, turbo.
"""

import json
import os
import sys

# Taille de modèle par défaut — voir l'en-tête pour le raisonnement.
DEFAULT_MODEL = "small"

# CPU sans GPU : la quantification int8 divise l'empreinte mémoire et accélère
# nettement, pour une perte de justesse négligeable à cette taille de modèle.
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

# Un faisceau de 1 (recherche gloutonne) suffit et reste deux fois plus rapide
# qu'un faisceau de 5. Sur de la parole de tutoriel, l'écart de justesse observé
# ne justifie pas le coût.
BEAM_SIZE = 1

# Whisper INVENTE du texte sur les plages sans parole — et un tutoriel de piano
# en contient beaucoup (démonstrations jouées). Deux garde-fous :
#   - le détecteur d'activité vocale (VAD) écarte les plages sans voix AVANT
#     la transcription ;
#   - les segments dont le modèle dit lui-même qu'ils sont probablement du
#     silence sont jetés ensuite.
# Un texte inventé serait ici un mensonge pédagogique, pas une approximation.
NO_SPEECH_MAX = 0.6
AVG_LOGPROB_MIN = -1.0


def log(message):
    """Journal sur stderr : stdout est réservé au JSON."""
    print(f"[transcriber] {message}", file=sys.stderr, flush=True)


def emit(payload):
    """Écrit le JSON de sortie sur la dernière ligne de stdout."""
    print(json.dumps(payload, ensure_ascii=False))


def parse_option(argv, name, default=None):
    prefix = f"--{name}="
    for arg in argv:
        if arg.startswith(prefix):
            value = arg[len(prefix):].strip()
            return value or default
    return default


def transcribe(wav_path, model_size, language):
    try:
        from faster_whisper import WhisperModel
    except ImportError as err:
        return {
            "ok": False,
            "reason": "MissingDependency",
            "message": f"faster-whisper n'est pas installé dans cet interpréteur Python ({err}).",
        }

    if not os.path.isfile(wav_path):
        return {
            "ok": False,
            "reason": "ReadFailed",
            "message": f"Fichier introuvable : {wav_path}",
        }

    try:
        log(f"chargement du modèle {model_size} ({DEVICE}/{COMPUTE_TYPE})")
        model = WhisperModel(model_size, device=DEVICE, compute_type=COMPUTE_TYPE)

        log(f"transcription de {os.path.basename(wav_path)}")
        segment_iter, info = model.transcribe(
            wav_path,
            language=language,          # None = détection automatique
            beam_size=BEAM_SIZE,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            # Sans ce réglage, le modèle se met à répéter en boucle la dernière
            # phrase entendue dès qu'il traverse une longue plage musicale.
            condition_on_previous_text=False,
        )

        segments = []
        dropped = 0
        for seg in segment_iter:
            text = (seg.text or "").strip()
            if not text:
                dropped += 1
                continue
            no_speech = getattr(seg, "no_speech_prob", 0.0) or 0.0
            avg_logprob = getattr(seg, "avg_logprob", 0.0) or 0.0
            if no_speech > NO_SPEECH_MAX or avg_logprob < AVG_LOGPROB_MIN:
                dropped += 1
                continue
            segments.append({
                "start": round(float(seg.start), 3),
                "end": round(float(seg.end), 3),
                "text": text,
            })

        log(f"{len(segments)} segments retenus, {dropped} écartés")
        return {
            "ok": True,
            "segments": segments,
            "language": getattr(info, "language", None),
            "languageProbability": round(float(getattr(info, "language_probability", 0.0) or 0.0), 3),
            "model": model_size,
            "dropped": dropped,
        }
    except Exception as err:  # noqa: BLE001 — la raison remonte telle quelle à l'interface
        return {
            "ok": False,
            "reason": "Failed",
            "message": f"{type(err).__name__}: {err}",
        }


def main():
    if len(sys.argv) < 3 or sys.argv[1] != "transcribe":
        print("usage: transcriber.py transcribe <fichier.wav> [--model=small] [--language=fr]",
              file=sys.stderr)
        sys.exit(1)

    wav_path = sys.argv[2]
    model_size = parse_option(sys.argv, "model", DEFAULT_MODEL)
    language = parse_option(sys.argv, "language", None)

    emit(transcribe(wav_path, model_size, language))


if __name__ == "__main__":
    main()
