#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
[Claude] — 2026-09-25 — Pédagogie IA : les notes jouées par un pianiste filmé de
côté ou de face (le clavier ne se lit pas à l'image), transcrites depuis le son.

Narcisse : ses tutoriels sont de trois sortes (vrai clavier filmé du dessus,
clavier dessiné façon Synthesia, pianiste filmé de côté / de face). Pour la
troisième, seule la bande son reste ; l'analyse d'accords n'en tirait que des
noms d'accords, pas les notes d'un lick. Ce script rend les notes elles-mêmes.

Même contrat que transcriber.py : arguments en ligne de commande, JSON sur la
DERNIÈRE ligne de stdout, journaux sur stderr, code de sortie 0 même en échec
(c'est le JSON qui porte la raison).

    piano-transcriber.py transcribe <fichier.wav> [--device=cpu]

Sortie, succès :
    {"ok": true, "notes": [{"midi": 60, "onset": 0.51, "offset": 1.02, "velocity": 74}],
     "pedals": [{"onset": 0.4, "offset": 2.1}], "duration": 123.4, "model": "piano-transcription-inference"}

Sortie, échec :
    {"ok": false, "reason": "MissingDependency" | "ReadFailed" | "Failed", "message": "..."}

POURQUOI piano-transcription-inference
--------------------------------------
Modèle « High-resolution Piano Transcription with Pedals » (Kong et al., ByteDance),
licence MIT (compatible avec le projet, comme faster-whisper), fait pour le
piano seul : onsets, offsets, vélocités et pédale. Il demande torch, librosa et
torchlibrosa ; le modèle (~170 Mo) se télécharge au premier usage dans le
dossier personnel. basic-pitch (Spotify) a été écarté : il demande TensorFlow,
une seconde pile lourde à côté de torch.

Installation, dans le .venv du projet :
    .venv/bin/pip install piano-transcription-inference torchlibrosa
"""

import json
import os
import sys
import tempfile


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def fail(reason, message):
    emit({"ok": False, "reason": reason, "message": message})
    sys.exit(0)


def parse_args(argv):
    if len(argv) < 3 or argv[1] != "transcribe":
        fail("Failed", "Usage : piano-transcriber.py transcribe <fichier.wav> [--device=cpu]")
    options = {"device": "cpu"}
    for extra in argv[3:]:
        if extra.startswith("--device="):
            options["device"] = extra.split("=", 1)[1] or "cpu"
    return argv[2], options


def main():
    wav_path, options = parse_args(sys.argv)
    try:
        from piano_transcription_inference import PianoTranscription, sample_rate, load_audio
    except ImportError as e:
        fail("MissingDependency", f"Dépendance Python manquante : {e}")

    if not os.path.exists(wav_path):
        fail("ReadFailed", f"Fichier audio introuvable : {wav_path}")

    try:
        audio, _ = load_audio(wav_path, sr=sample_rate, mono=True)
    except Exception as e:  # noqa: BLE001 — la raison est rendue telle quelle
        fail("ReadFailed", f"Lecture audio impossible : {e}")

    try:
        transcriptor = PianoTranscription(device=options["device"], checkpoint_path=None)
        with tempfile.TemporaryDirectory() as tmp:
            result = transcriptor.transcribe(audio, os.path.join(tmp, "out.mid"))
    except Exception as e:  # noqa: BLE001
        fail("Failed", f"Transcription impossible : {e}")

    notes = []
    for ev in result.get("est_note_events", []) or []:
        try:
            notes.append({
                "midi": int(ev["midi_note"]),
                "onset": round(float(ev["onset_time"]), 3),
                "offset": round(float(ev["offset_time"]), 3),
                "velocity": int(ev.get("velocity", 64)),
            })
        except (KeyError, TypeError, ValueError):
            continue
    notes.sort(key=lambda n: (n["onset"], n["midi"]))
    pedals = []
    for ev in result.get("est_pedal_events", []) or []:
        try:
            pedals.append({"onset": round(float(ev["onset_time"]), 3), "offset": round(float(ev["offset_time"]), 3)})
        except (KeyError, TypeError, ValueError):
            continue
    emit({
        "ok": True,
        "notes": notes,
        "pedals": pedals,
        "duration": round(len(audio) / float(sample_rate), 3),
        "model": "piano-transcription-inference",
    })


if __name__ == "__main__":
    main()
