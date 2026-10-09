import sys

# [Claude] — 2026-10-09 — Régression du Studio (Narcisse : « une fois la séparation terminée,
# le son bug, le lecteur est bloqué, un bruit sourd au lancement de la vidéo »).
#
# Les versions récentes de torchaudio (2.9 et plus) enregistrent TOUJOURS par TorchCodec :
# `torchaudio.save()` n'écoute plus la variable TORCHAUDIO_BACKEND. Sans le paquet torchcodec,
# Demucs calculait les pistes (100 %) puis échouait au moment de les enregistrer :
#   ImportError: TorchCodec is required for save_with_torchcodec.
# L'application remplaçait alors les pistes par des bips de 2 s (voir electron/main.js).
#
# Demucs appelle `torchaudio.save(chemin, wav, sample_rate=…, encoding=…, bits_per_sample=…)`
# au moment d'écrire chaque piste. On remplace cet appel par une écriture WAV directe :
# soundfile (déjà requis par requirements.txt), sinon le module `wave` de Python. Le
# résultat ne dépend plus de la version de torchaudio installée.
import torchaudio


def _write_wav(uri, src, sample_rate, channels_first=True, format=None, encoding=None,
               bits_per_sample=None, **_ignored):
    import numpy as np

    data = src.detach().cpu().numpy() if hasattr(src, 'detach') else np.asarray(src)
    if data.ndim == 1:
        data = data[None, :] if channels_first else data[:, None]
    if channels_first:
        data = data.T  # (échantillons, canaux)
    as_float = encoding == 'PCM_F'
    bits = int(bits_per_sample or 16)
    try:
        import soundfile as sf
    except ImportError:
        sf = None
    if sf is not None:
        subtype = 'FLOAT' if as_float else {24: 'PCM_24', 32: 'PCM_32'}.get(bits, 'PCM_16')
        sf.write(str(uri), data, int(sample_rate), subtype=subtype)
        return
    # Sans soundfile : PCM 16 bits avec la bibliothèque standard.
    import wave
    pcm = (np.clip(data, -1.0, 1.0) * 32767).round().astype('<i2')
    with wave.open(str(uri), 'wb') as out:
        out.setnchannels(pcm.shape[1])
        out.setsampwidth(2)
        out.setframerate(int(sample_rate))
        out.writeframes(pcm.tobytes())


torchaudio.save = _write_wav

import demucs.separate  # noqa: E402 — après le remplacement de torchaudio.save

if __name__ == '__main__':
    output_dir = sys.argv[1]
    input_path = sys.argv[2]
    sys.argv = [
        'demucs',
        '-n', 'htdemucs_6s',
        '--out', output_dir,
        '--filename', '{stem}.{ext}',
        input_path,
    ]
    demucs.separate.main()
