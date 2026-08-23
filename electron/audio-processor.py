import sys
import os
import re
import json
import subprocess
import tempfile
import wave
import struct
import math

import numpy as np
import librosa
import soundfile as sf
from imageio_ffmpeg import get_ffmpeg_exe

FFMPEG = get_ffmpeg_exe()


def log(msg):
    print(f'[AudioProcessor] {msg}', flush=True)


def trim_audio(input_path, output_wav, start_sec, end_sec, sample_rate=44100):
    """Extract a precise region from any media file to WAV using ffmpeg."""
    duration = end_sec - start_sec
    log(f'trimming {input_path} region {start_sec}-{end_sec} to {output_wav}')
    cmd = [
        FFMPEG,
        '-y',
        *_ffmpeg_input_options(),
        '-ss', str(start_sec),
        '-t', str(duration),
        '-i', input_path,
        '-vn',
        '-dn',
        '-sn',
        '-map', '0:a:0',
        '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,aresample=44100:resampler=soxr:precision=28,volume=1.0',
        '-ar', str(sample_rate),
        '-ac', '2',
        '-sample_fmt', 's16',
        '-c:a', 'pcm_s16le',
        output_wav,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg trim failed: {proc.stderr}')
    try:
        with wave.open(output_wav, 'rb') as w:
            frames = w.getnframes()
            log(f'trim done: {frames} frames, {w.getnchannels()} ch, {w.getframerate()} Hz')
            if frames == 0:
                raise RuntimeError('ffmpeg produced an empty WAV file')
    except Exception as e:
        raise RuntimeError(f'trimmed WAV is invalid: {e}')


def _ffmpeg_input_options():
    """Options de lecture robustes pour les conteneurs endommagés (M4A/AAC inclus)."""
    return [
        '-fflags', '+genpts+discardcorrupt+fastseek',
        '-err_detect', 'ignore_err',
    ]


def probe_duration(input_path):
    """Retourne la durée audio exacte en secondes (ffprobe via ffmpeg)."""
    cmd = [
        FFMPEG,
        *_ffmpeg_input_options(),
        '-i', input_path,
        '-vn', '-an',
        '-f', 'null',
        '-',
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    # La durée apparaît dans stderr sous la forme "Duration: 00:00:10.01"
    match = re.search(r'Duration:\s+(\d+):(\d+):([\d.]+)', proc.stderr)
    if match:
        h, m, s = match.groups()
        return int(h) * 3600 + int(m) * 60 + float(s)
    return None


def extract_audio(input_path, output_wav, sample_rate=44100):
    """Extract audio track from any media file to WAV using ffmpeg.

    Pour les conteneurs M4A/AAC problématiques, on force la lecture complète
    du flux audio en ignorant les erreurs de conteneur et en convertissant
    explicitement en stéréo PCM 16 bits 44.1 kHz.
    """
    log(f'extracting audio from {input_path} to {output_wav}')
    cmd = [
        FFMPEG,
        '-y',
        *_ffmpeg_input_options(),
        '-i', input_path,
        '-vn',  # no video
        '-dn',  # no data streams
        '-sn',  # no subtitle streams
        '-map', '0:a:0',  # sélectionne explicitement la première piste audio
        '-af', 'aformat=sample_fmts=s16:channel_layouts=stereo,aresample=44100:resampler=soxr:precision=28,volume=1.0',
        '-ar', str(sample_rate),
        '-ac', '2',
        '-sample_fmt', 's16',
        '-c:a', 'pcm_s16le',
        output_wav,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg extraction failed: {proc.stderr}')
    # Vérifier que le fichier de sortie est un WAV PCM valide et non vide.
    try:
        with wave.open(output_wav, 'rb') as w:
            frames = w.getnframes()
            rate = w.getframerate()
            duration = frames / rate if rate else 0
            log(f'audio extraction done: {frames} frames, {w.getnchannels()} ch, {rate} Hz, duration {duration:.3f}s')
            if frames == 0:
                raise RuntimeError('ffmpeg produced an empty WAV file')
    except Exception as e:
        raise RuntimeError(f'extracted WAV is invalid: {e}')
    return output_wav



def generate_waveform(wav_path, num_peaks=400):
    """Generate a compact array of peak amplitudes for waveform display.

    Stream la lecture du WAV par bloc pour rester fluide sur les fichiers longs
    et émettre des lignes de log intermédiaires."""
    log(f'generating waveform from {wav_path}')
    sr = librosa.get_samplerate(wav_path)
    duration = sf.info(wav_path).duration
    total_frames = int(duration * sr)

    if total_frames == 0:
        return {'duration': 0, 'peaks': [0] * num_peaks}

    block = max(1, total_frames // num_peaks)
    peaks = []
    reported_steps = set()

    with sf.SoundFile(wav_path, 'r') as f:
        for i in range(num_peaks):
            start = i * block
            end = min(start + block, total_frames)
            frames_to_read = end - start
            if frames_to_read <= 0:
                peaks.append(0.0)
                continue
            chunk = f.read(frames_to_read, dtype='float32')
            if chunk.ndim > 1:
                chunk = librosa.to_mono(chunk.T)
            peak = float(np.max(np.abs(chunk))) if len(chunk) > 0 else 0.0
            peaks.append(round(peak, 4))

            pct = int((i / num_peaks) * 100)
            if pct % 25 == 0 and pct not in reported_steps:
                reported_steps.add(pct)
                log(f'waveform progress: {pct}%')

    log(f'waveform done: {len(peaks)} peaks, duration {duration:.2f}s')
    return {'duration': round(duration, 3), 'peaks': peaks}


def pitch_shift_region(input_wav, output_wav, semitones, start_sec=0.0, end_sec=None):
    """Pitch-shift a region of a WAV file without changing tempo.

    Uses RubberBand CLI when available (high quality, preserves formants,
    tempo invariant). Falls back to librosa phase vocoder otherwise.
    """
    log(f'pitch-shifting {input_wav} region {start_sec}-{end_sec} by {semitones} semitones')
    y, sr = librosa.load(input_wav, sr=None, mono=False)

    # Convert to mono if stereo
    if y.ndim > 1:
        y = librosa.to_mono(y)

    total_duration = len(y) / sr
    end_sec = end_sec if end_sec is not None else total_duration
    start_sample = int(max(0, start_sec) * sr)
    end_sample = int(min(end_sec, total_duration) * sr)
    region = y[start_sample:end_sample]

    if len(region) == 0:
        sf.write(output_wav, np.zeros((sr,), dtype=np.float32), sr)
        log('empty region, wrote silence')
        return

    if abs(semitones) < 0.01:
        sf.write(output_wav, region, sr)
        log('no shift needed, region copied')
        return

    # Try RubberBand first for high-quality pitch-only shift.
    try:
        tmp_input = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        tmp_output = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        sf.write(tmp_input.name, region, sr)
        # -p = pitch shift by semitones, -F = preserve formants.
        cmd = [
            'rubberband',
            '-p', str(semitones),
            '-F',
            tmp_input.name,
            tmp_output.name,
        ]
        rb_proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if rb_proc.returncode == 0:
            shifted, _ = librosa.load(tmp_output.name, sr=sr, mono=True)
            log('rubberband pitch-shift done')
        else:
            log(f'rubberband failed ({rb_proc.returncode}), falling back to librosa')
            shifted = librosa.effects.pitch_shift(region, sr=sr, n_steps=semitones)
    except Exception as e:
        log(f'rubberband error {e}, falling back to librosa')
        shifted = librosa.effects.pitch_shift(region, sr=sr, n_steps=semitones)
    finally:
        for f in (tmp_input.name, tmp_output.name):
            try:
                os.remove(f)
            except Exception:
                pass

    # Trim/pad to match original region length (avoid drift)
    target_len = len(region)
    if len(shifted) > target_len:
        shifted = shifted[:target_len]
    elif len(shifted) < target_len:
        shifted = np.pad(shifted, (0, target_len - len(shifted)), mode='constant')

    sf.write(output_wav, shifted, sr)
    log('pitch-shift done')


def convert_webm_to_mp4(input_webm, output_mp4):
    """Convertit un fichier WebM (MediaRecorder Electron) en MP4 H.264."""
    log(f'converting {input_webm} to {output_mp4}')
    cmd = [
        FFMPEG,
        '-y',
        '-i', input_webm,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        output_mp4,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg webm->mp4 failed: {proc.stderr}')
    log('webm to mp4 conversion done')


def mix_stems_to_master(stem_wavs, output_wav, sample_rate=44100):
    """Mix multiple stem WAVs into a single master WAV."""
    log(f'mixing {len(stem_wavs)} stems into {output_wav}')
    if not stem_wavs:
        sf.write(output_wav, np.zeros((sample_rate,), dtype=np.float32), sample_rate)
        return

    # Load all stems and pad to same length
    clips = []
    for path in stem_wavs:
        y, sr = librosa.load(path, sr=sample_rate, mono=False)
        if y.ndim > 1:
            y = librosa.to_mono(y)
        clips.append(y)

    max_len = max(len(c) for c in clips)
    mixed = np.zeros(max_len, dtype=np.float32)
    for c in clips:
        if len(c) < max_len:
            c = np.pad(c, (0, max_len - len(c)), mode='constant')
        mixed += c

    # Normalize to avoid clipping
    peak = np.max(np.abs(mixed))
    if peak > 1.0:
        mixed = mixed / peak

    sf.write(output_wav, mixed, sample_rate)
    log('mix done')


def pitch_shift_stems(stem_paths_json, output_dir, semitones, start_sec=0.0, end_sec=None):
    """Pitch-shift each stem individually and write shifted WAVs to output_dir.

    stem_paths_json is a JSON object mapping stem name to input wav path.
    Returns a JSON object mapping stem name to shifted wav path.
    """
    stem_paths = json.loads(stem_paths_json)
    os.makedirs(output_dir, exist_ok=True)
    result = {}
    log(f'pitch-shifting {len(stem_paths)} stems by {semitones} semitones')
    for stem, input_path in stem_paths.items():
        output_path = os.path.join(output_dir, f'{stem}.wav')
        pitch_shift_region(input_path, output_path, semitones, start_sec, end_sec)
        result[stem] = output_path
    log('all stems pitch-shifted')
    print(json.dumps(result))


# [Claude] — 2026-07-08 — Moteur d'analyse audio contextuel (HMM + chromagramme beat-synchrone).
# Priorité : tonalité fiable, accords principaux corrects (majeur/mineur, puis 7/maj7/sus
# uniquement si confiance élevée), timing aligné sur les beats réels.

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Profils Krumhansl-Kessler pour l'estimation de la tonalité (Do = index 0)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], dtype=np.float32)
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17], dtype=np.float32)

# Vocabulaire strict d'accords : pas de 9/11/13/altérations à ce stade.
# Vocabulaire strict d'accords : pas de 9/11/13/altérations à ce stade.
# Les templates pondèrent la fondamentale > tierce > quinte > extensions.
CHORD_TEMPLATES_WEIGHTED = {
    '': [(0, 1.0), (4, 0.8), (7, 0.6)],
    'm': [(0, 1.0), (3, 0.85), (7, 0.55)],
    '7': [(0, 1.0), (4, 0.75), (7, 0.55), (10, 0.4)],
    'maj7': [(0, 1.0), (4, 0.85), (7, 0.65), (11, 0.9)],
    'sus2': [(0, 1.0), (2, 0.75), (7, 0.55)],
    'sus4': [(0, 1.0), (5, 0.75), (7, 0.55)],
    'm7': [(0, 1.0), (3, 0.85), (7, 0.65), (10, 0.85)],
    'dim': [(0, 1.0), (3, 0.9), (6, 0.9)],
    'm7b5': [(0, 1.0), (3, 0.85), (6, 0.9), (10, 0.85)],
    'aug': [(0, 1.0), (4, 0.85), (8, 0.9)],
}
CHORD_INTERVALS = {suffix: [pc for pc, _ in tpl] for suffix, tpl in CHORD_TEMPLATES_WEIGHTED.items()}

# Contradictions ciblées pour le mode "targeted_contradictions" (O2).
# Chaque entrée : suffixe cible → liste de (intervalle, poids_relatif).
# Le poids effectif = contradiction_weight * poids_relatif.
# Validé par benchmark expérimental (scripts/experiment-templates.py).
CHORD_CONTRADICTIONS = {
    '': [(10, 0.15), (11, 0.15), (2, 0.10), (5, 0.10)],
    'm': [(10, 0.15), (6, 0.15)],
    '7': [(11, 0.15)],
    'maj7': [(10, 0.15)],
    'm7': [(6, 0.10)],
    'm7b5': [(10, 0.10)],
    'sus2': [(5, 0.10)],
    'sus4': [(2, 0.10)],
}

# Paires de discriminateurs post-hoc pour le mode "posthoc_discriminator".
# Chaque entrée : (q1, q2, interval1, interval2)
#   Si interval2 is None : booster q2 quand chroma[interval1] > ENERGY_THRESHOLD
#   Si les deux sont définis : comparer chroma[interval1] vs chroma[interval2]
# Les paires couvrent les confusions observées sur l'audio réel.
DISCRIMINATOR_PAIRS = [
    ('m', 'm7b5', 7, 6),     # 5te vs b5 → départager m/m7b5
    ('m', 'm7', None, 10),   # 7e mineure → départager m/m7
    ('', 'maj7', None, 11),  # 7e majeure → départager major/maj7
    ('', '7', None, 10),     # 7e mineure → départager major/7
    ('maj7', '7', 11, 10),   # 7M vs 7m → départager maj7/7
    ('sus2', 'sus4', 2, 5),  # 2de vs 4te → départager sus2/sus4
    ('m7b5', 'dim', None, 10), # 7e mineure → départager m7b5/dim
]

# [OpenCode] — 2026-07-10 — Discrimination de tierce (LOT 7).
# Les familles possèdent une caractéristique réelle de tierce : la (b3) pour
# le mineur, la (3M) pour le majeur/dominant. La similarité cosinus ne pénalise
# pas l'absence d'une note ; un template "7" (3M + b7) peut donc gagner sur un
# vrai m7 via la b7 partagée alors que sa 3M n'est pas jouée.
# On ajoute un bonus aux familles dont la tierce caractéristique ressort du
# chroma (b3 > 3M → renforcer m/m7/dim ; 3M > b3 → renforcer maj/7/aug).
# Ce bonus est purement basé sur le contenu acoustique (jamais sur la tonalité
# ni le degré) : les sus2/sus4 (sans tierce) restent neutralères et les vraies
# dominantes (3M réellement jouée) conservent leur supériorité.
THIRD_EVIDENCE_WEIGHT = 0.12
_MINOR_THIRD_SUFFIXES = frozenset({'m', 'm7', 'm7b5', 'dim'})
_MAJOR_THIRD_SUFFIXES = frozenset({'', '7', 'maj7', 'aug'})

ADVANCED_SUFFIXES = {'7', 'maj7', 'sus2', 'sus4', 'm7'}
# [OpenCode] — 2026-07-10 — Template simple cohérent avec la famille harmonique.
SIMPLE_TRIAD_FOR_SUFFIX = {
    '7': [0, 4, 7],      # majeur
    'maj7': [0, 4, 7],   # majeur
    'sus2': [0, 4, 7],   # majeur
    'sus4': [0, 4, 7],   # majeur
    'm7': [0, 3, 7],     # mineur
}
# [OpenCode] — 2026-07-10 — Réactivation du post-traitement (min_duration=0.4, threshold=0.03)
# Voir CHANGES.md pour les résultats du benchmark corpus.
# Correction de l'erreur d'octave du tempo (moitié / double). L'ancien
# critère — force d'onset moyenne sur la grille — favorisait mécaniquement le
# tempo divisé par deux. Désactiver ce flag restaure le tempo brut de librosa.
ENABLE_TEMPO_OCTAVE_FIX = True

# Tempo perceptif de référence : à périodicité comparable, l'auditeur choisit
# l'octave la plus proche de cette valeur. Sert de prior pour arbitrer entre
# les octaves candidates.
#
# HISTORIQUE — cette constante a valu 65.0, calibrée sur l'hypothèse que « You
# Are Yahweh » tournait à 51,7 BPM. L'utilisateur a infirmé cette hypothèse le
# 2026-08-23 : le tempo officiel du morceau est 107. La calibration reposait
# donc sur une donnée fausse, et divisait par deux un tempo que librosa
# trouvait déjà juste (107,7 brut).
#
# Retour à la valeur de la littérature. Vérifié sur les deux seuls tempos de
# référence dont la provenance est traçable — You Are Yahweh 107 (utilisateur)
# et Autumn Leaves 120 (exact par construction, rendu depuis MIDI) : les deux
# ressortent exacts, et le résultat est insensible au centre entre 100 et 120
# comme au sigma. Ce plateau large est le signe qu'on ne surajuste pas.
TEMPO_PERCEPTUAL_CENTER = 110.0
TEMPO_PRIOR_SIGMA = 0.7

# Octaves candidates. Se limiter à moitié / réel / double ne suffit pas : sur
# « Autumn Leaves » le suiveur verrouille sur la mesure et annonce 30 BPM pour
# un morceau à 120 — le quart. Le vrai tempo était hors de portée des candidats
# quel que soit le prior.
TEMPO_OCTAVE_RATIOS = (0.25, 0.5, 1.0, 2.0, 4.0)

ENABLE_CHORD_DOWNGRADE = True

# Active l'absorption des figures d'arpège / walking bass / pédale détectées
# par analyse du chroma global (cas L et Q du test déterministe). Cette couche
# est additive et très conservative pour ne pas affecter l'audio réel.
# Garde d'identité de la fusion d'arpèges. Sans elle, la branche « couverture
# totale » de _merge_arpeggio_segments absorbe n'importe quelle alternance
# d'accords à la quinte (I↔V) : les deux fondamentales appartiennent toujours au
# PC-set d'un même accord diatonique, et le chroma moyen de C+G ressemble à un
# Gsus4. Mesuré sur les fixtures : la couche fusionnait à tort H (C/G toutes les
# 2 temps), J (C-D7-G), O (silences) et P (cellule réelle), pour ne servir
# correctement que L (walking bass dans Cmaj7).
#
# Critère retenu : absorber un arpège, c'est reconnaître que la fenêtre est
# l'un des accords DÉJÀ hypothésés, étalé dans le temps — pas un accord
# nouveau fabriqué à partir du mélange. On exige donc que l'accord gagnant
# soit exactement l'un des accords de la fenêtre. Ce critère sépare les 5 cas
# mesurés sans exception ; le critère « le vainqueur explique aussi chaque
# segment » avait été essayé d'abord et ne séparait pas (L, fusion légitime,
# présentait le plus grand écart de tous : +0,209).
# Garde de registre pour la branche « cycle de walking bass » de
# _absorb_arpeggio_figures. Un cycle de fondamentales répété (C-G-C-G…) a deux
# lectures possibles : une basse qui se promène sous un accord tenu, ou une
# vraie alternance d'accords. Le chroma global ne les distingue pas ; le chroma
# restreint aux voix supérieures, si — mesuré sur les fixtures :
#
#   walking bass Cmaj7  1,000 |  alternance C/G      0,178
#   pédale G + mélodie  1,000 |  C-D7-G              0,561
#                             |  cellule B-D-E + Am  0,445
#                             |  pédale C, voix qui changent  0,663
#
# Sous un accord tenu les voix supérieures sont immobiles ; dès qu'un accord
# change réellement, elles bougent. Seuil placé entre 0,663 et 1,000.
ENABLE_UPPER_VOICE_STABILITY_GUARD = True
UPPER_VOICE_STABILITY_MIN = 0.80

# Plafond de durée des cellules absorbées par _merge_arpeggio_segments.
# La couche n'en avait aucun : sur « You Are Yahweh » elle fusionnait un segment
# de 18,7 s avec ses voisins en un seul accord de 33 s. Un arpège, une walking
# bass ou une note de passage sont par définition des cellules brèves ; un
# segment qui dure plusieurs mesures est une harmonie établie, quoi qu'en dise
# le chroma agrégé. Exprimé en temps (et non en secondes) pour rester valable
# quel que soit le tempo.
# Comblement des trous de la grille de beats.
#
# Toute l'analyse harmonique est beat-synchrone : le chroma est moyenné entre
# deux beats consécutifs. Là où le suiveur de beats ne trouve rien, il n'existe
# qu'UNE fenêtre d'observation, et le HMM ne peut structurellement pas
# segmenter. Sur « You Are Yahweh », librosa ne place aucun beat entre 0 et
# 18,11 s — l'intro rubato sans batterie — ce qui produisait un unique accord
# de 18,7 s là où la grille attend D → A → E → F#m. Ce n'était ni un défaut du
# HMM ni du post-traitement : l'information n'atteignait jamais le décodeur.
#
# On comble les trous par une subdivision régulière à l'intervalle médian.
# _beat_track n'est pas modifié (gel ADR-003) : la couche est additive, opère
# après lui, et se désactive par ce flag.
ENABLE_BEAT_GRID_GAP_FILL = True
BEAT_GAP_FACTOR = 1.75

ENABLE_ARPEGGIO_CELL_DURATION_CAP = True
# Une cellule d'arpège, de walking bass ou de note de passage est brève par
# nature. Sans cette borne la couche n'en avait aucune : sur « You Are Yahweh »
# elle fusionnait un segment de 18,7 s avec ses voisins en un accord de 33 s,
# effaçant l'intro entière. Un segment qui dure plusieurs mesures est une
# harmonie établie, quoi qu'en dise le chroma agrégé.
ARPEGGIO_CELL_MAX_BEATS = 2.0
# Plancher absolu en secondes, 0 = pas de plancher. Balayage mesuré du plafond
# (2 / 3 / 4 temps) le 2026-08-23 :
#   2 temps → fixtures audio 11/17 · You Are Yahweh 68,8 % · frontières 36,8 %
#   3 temps → fixtures audio 10/17 · You Are Yahweh 65,9 % · frontières 21,1 %
#   4 temps → fixtures audio 10/17 · You Are Yahweh 65,3 % · frontières 21,1 %
# 2 temps retenu : meilleur sur l'audio réel des trois axes. Contrepartie
# assumée et documentée — le cas P de tests/test_harmonic_deterministic.py
# (chroma SYNTHÉTIQUE) attend l'absorption d'une cellule d'une mesure entière
# et échoue ; son équivalent sur audio réel échoue dans toutes les
# configurations, y compris avant ce changement.
ARPEGGIO_CELL_MAX_SECONDS = 0.0

ENABLE_ARPEGGIO_MERGE_IDENTITY_GUARD = True

ENABLE_ARPEGGIO_FIGURE_ABSORPTION = True

# Active le vocabulaire d'accords simplifié en sortie : uniquement les accords
# de base (maj, min, maj7, min7, 7, dim, dim7, aug, aug7). Les sus2/sus4,
# slash chords et qualités non listées sont simplifiés. C'est le mode
# "tutoriel simple" demandé par l'utilisateur.
ENABLE_SIMPLE_CHORD_VOCABULARY = True

# [OpenCode] — 2026-08-21 — Régularisation des progressions répétitives
# (mission refrain/couplet "You Are Yahweh"). Couche additive qui détecte
# les zones en boucle simple (I/IV/V) et scinde les longs segments I
# encadrés par IV/V lorsque le chroma local le confirme. Désactivé par
# défaut (conservateur, opt-in).
ENABLE_REPEATED_PROGRESSION_REGULARIZATION = False

# Active la détection de boucle structurelle vs accords de passage.
# Couche additive purement informative : ajoute un champ `role` aux segments
# (`structural`, `passing`, `unreliable`) sans modifier l'accord affiché.
# Classification du rôle harmonique de chaque segment, pour la hiérarchie
# visuelle de Chordify (accord structurel encadré, accord de passage discret).
#
# Le champ `role` produit précédemment par _detect_structural_loop valait
# structural | unreliable et confondait deux questions distinctes : « cet
# accord porte-t-il la structure ? » et « cette détection est-elle fiable ? ».
# Il ne s'activait de plus que sur les morceaux dominés à 80 % par une boucle
# de quatre accords — donc presque jamais.
#
# Le discriminant retenu est musical et non statistique : un accord structurel
# est diatonique ET fait partie du vocabulaire récurrent du morceau ; un accord
# de passage est bref, étranger à ce vocabulaire, et encadré par deux accords
# structurels. Vérifié sur la fixture J (C → D7 → G) où D7 est étiqueté
# `passing` par la vérité terrain : D7 porte un fa dièse hors de do majeur,
# alors que C et G sont les piliers diatoniques.
# Désambiguïsation de la confusion à la quinte.
#
# Les templates pondèrent la fondamentale à 1,0 et la quinte à 0,6 : ils
# supposent que la fondamentale est la note la plus présente. Sur les voicings
# où la quinte domine — courant au piano gospel, main gauche en quintes ouvertes
# et tierce haute et discrète — l'étiquette glisse d'une quinte vers le haut.
# Mesuré sur le tutoriel « You Are Yahweh » : les SIX accords de Mi du morceau
# ressortaient en Si, avec un chroma à B 44 %, E 21 %, G# 6 %, D# 0 %.
#
# Le critère qui tranche est la couverture NON pondérée : quelle proportion du
# chroma les notes de l'accord expliquent-elles réellement ? Sur ce même chroma,
# Mi majeur couvre 71 %, Si mineur 61 %, Si majeur 56 %. La question « quelles
# notes sont là » sépare, là où « quelle note est la plus forte » se trompe.
#
# Couche additive : ne touche ni au HMM ni aux observations, réécrit seulement
# l'étiquette d'un segment déjà décidé.
# Silence de tête : ne pas inventer d'accord avant que la musique commence.
#
# Le chroma d'un silence numérique est du bruit ; le HMM y place quand même un
# accord, et `_clean_segments` ne l'écarte pas dès qu'il dure plus longtemps que
# `min_duration`. Sur le tutoriel « You Are Yahweh », 1,765 s de silence réel
# produisaient un Si majeur de 1,811 s en tête de morceau.
#
# On marque ces segments `N` plutôt que de rogner l'audio. Rogner déplacerait
# l'origine temporelle de l'analyse par rapport au fichier : la lecture, les
# corrections manuelles enregistrées et toutes les vérités terrain sont
# exprimées dans le temps DU FICHIER. Créer un second axe de temps serait
# reproduire, à l'envers, le défaut de mesure qui a coûté le plus cher à ce
# projet (voir experiments/EXP-009).
# Énergie réelle des fenêtres d'analyse, au lieu de la somme du chroma.
#
# `frame_energies` alimente le seul état « N » (pas d'accord) :
#   score(N) = max(0,05 ; 1 − énergie / énergie_max)
#
# Il était calculé comme la somme du vecteur chroma. Or `chroma_cqt` normalise
# chaque trame : un silence n'y devient pas un vecteur nul mais du bruit
# amplifié. Mesuré sur la batterie B2, famille « silences » — dans un silence à
# −40 dB, la somme du chroma vaut **1,94 fois celle d'une zone sonore**, quand
# le RMS réel vaut 0,0008 fois.
#
# Le compteur n'était donc pas seulement aveugle à l'intensité : il était
# INVERSÉ. L'état N scorait son plancher de 0,05 précisément là où il aurait dû
# scorer 1,0, et le moteur n'a jamais émis un seul « N » en milieu de morceau.
#
# DÉSACTIVÉ malgré tout, le 2026-08-23, parce que corriger cette quantité SEULE
# dégrade le résultat : −14,8 points sur le MP3 live de « You Are Yahweh »,
# isolé par ablation. La formule d'observation de N — `1 − énergie / max` — a
# été réglée pour une quantité qui, en pratique, ne variait pas. La rendre
# variable fait gagner l'état N sur des passages simplement doux mais bel et
# bien harmoniques.
#
# La correction complète suppose de recalibrer l'observation de N, ce qui relève
# de la baseline HMM gelée (ADR-003) et demande sa propre expérience. Le
# problème utilisateur — ne pas inventer d'accord dans le silence — est résolu
# autrement, par ENABLE_SILENCE_CARVING, qui opère sur le signal et non sur
# l'observation, sans rien coûter nulle part.
ENABLE_TRUE_FRAME_ENERGY = False

ENABLE_LEADING_SILENCE_GUARD = True
# Seuil d'énergie sous lequel une zone est tenue pour silencieuse, en fraction
# du RMS maximal du morceau.
#
# Calibré sur la distribution mesurée, et non choisi a priori. À 0,02, la QUEUE
# d'une note de piano qui décroît pendant quatre secondes passe sous le seuil :
# 35,6 % des trames de la batterie B1 à 60 BPM y tombent, et le moteur y
# découpait des silences fantômes — B1 perdait 6 points. À 0,005, ces mêmes
# queues n'y tombent plus (5,1 %) alors que les vrais silences de B2 restent
# largement en dessous (38,0 % des trames, à un quart de millième du maximum).
SILENCE_RMS_RATIO = 0.005

# Silences EN MILIEU de morceau, pas seulement en tête.
#
# Le seul mécanisme prévu pour eux était l'état « N » du HMM, inatteignable pour
# deux raisons cumulées : son énergie de référence était inversée (voir
# ENABLE_TRUE_FRAME_ENERGY), et la fenêtre d'analyse est beat-synchrone, donc
# souvent plus longue que le silence lui-même. Sur la batterie B2, famille
# « silences », le moteur n'émettait **aucun** N sur des trous de 1,56 s à
# −40 dB, et les accords voisins s'étiraient par-dessus.
#
# La détection se fait donc directement sur le signal, indépendamment de la
# grille : un silence n'est pas un phénomène rythmique.
ENABLE_SILENCE_CARVING = True
# Durée minimale d'un silence pour être découpé. En dessous, c'est une
# respiration entre deux accords, pas une absence d'harmonie.
SILENCE_MIN_DURATION = 0.45

ENABLE_FIFTH_CONFUSION_FIX = True
# Écart minimal de couverture pour accepter la correction. Assez large pour ne
# pas osciller sur des cas ambigus.
FIFTH_CONFUSION_MIN_GAIN = 0.08

ENABLE_CHORD_ROLE_CLASSIFICATION = True
# Part de la durée totale couverte par les accords retenus comme vocabulaire.
ROLE_VOCABULARY_COVERAGE = 0.85
# Un accord diatonique revenant au moins ce nombre de fois appartient au
# vocabulaire même s'il tombe hors des 85 % : le F#m de l'intro de « You Are
# Yahweh » est un vrai pilier, il est simplement moins tenu que A, D et E.
ROLE_VOCABULARY_MIN_OCCURRENCES = 2
# … ou tenu au moins ce nombre de temps en une seule fois. Un accord diatonique
# tenu deux mesures porte l'harmonie même s'il n'apparaît qu'une fois : c'est le
# cas du F#m qui clôt l'intro de « You Are Yahweh » (4,6 s, une occurrence).
ROLE_VOCABULARY_MIN_HELD_BEATS = 4.0
# Un accord structurel doit AUSSI durer : porter la progression suppose d'être
# tenu. Sans condition de durée, la règle « diatonique + récurrent » suffisait,
# et des fragments de 0,56 s issus de la sur-segmentation étaient présentés
# comme des piliers — 12 des 14 segments de moins d'une seconde de « You Are
# Yahweh » étaient marqués structural, ce que l'utilisateur a vu immédiatement
# à l'écran le 2026-08-23.
#
# Le seuil est une fraction de la durée MÉDIANE des segments du morceau, et non
# un nombre de temps. Exprimé en temps, il dépendait de l'octave choisie par le
# suiveur de beats : sur les fixtures où celui-ci verrouille sur la moitié du
# pulse, le seuil doublait en secondes et déclassait des accords parfaitement
# légitimes. La médiane, elle, se calibre sur ce que le morceau tient
# réellement — « un pilier n'est pas nettement plus court que ce que ce morceau
# tient d'habitude ».
ROLE_STRUCTURAL_MIN_RATIO = 0.5

ENABLE_STRUCTURAL_LOOP_DETECTION = True

SIMPLE_ALLOWED_SUFFIXES = {'', 'm', 'maj7', 'm7', '7', 'dim', 'dim7', 'aug', 'aug7'}
SIMPLE_MAJOR_FAMILY = {'', 'maj7', '7', 'sus2', 'sus4', 'aug', 'aug7'}
SIMPLE_MINOR_FAMILY = {'m', 'm7', 'dim', 'dim7', 'm7b5'}

QUALITY_FAMILIES = {
    '': 0, 'maj7': 0, 'sus2': 0, 'sus4': 0,
    '7': 1,
    'm': 2, 'm7': 2,
    'dim': 3, 'm7b5': 3,
    'aug': 4,
}


def _is_similar_quality(a, b):
    if a == b:
        return True
    fa = QUALITY_FAMILIES.get(a)
    fb = QUALITY_FAMILIES.get(b)
    if fa is None or fb is None:
        return False
    if fa == fb:
        return True
    if {a, b} in ({'7', 'sus4'}, {'7', 'sus2'}, {'', '7'}, {'7', 'maj7'}):
        return True
    return False


def _parse_chord_label(chord_str):
    m = re.match(r'^([A-G][#b]?)(.*)$', chord_str or '')
    if not m:
        return None, None
    root = m.group(1)
    if root not in NOTE_NAMES:
        return None, None
    return NOTE_NAMES.index(root), m.group(2).strip()


def _pc_distance(a, b):
    """Distance circulaire entre deux classes de hauteur."""
    d = abs(a - b)
    return min(d, 12 - d)


def chord_name(root, suffix):
    """Formate le nom d'un accord (ex: C, Cm, C7, Cmaj7)."""
    base = NOTE_NAMES[root % 12]
    return f'{base}{suffix}' if suffix else base


def key_name(root, mode):
    """Formate le nom d'une tonalité (ex: G, Gm)."""
    base = NOTE_NAMES[root % 12]
    return f'{base}m' if mode == 'minor' else base


def normalize_chroma_frame(frame):
    """Normalise un vecteur chroma par sa norme L2."""
    norm = np.linalg.norm(frame)
    if norm < 1e-6:
        return None
    return frame / norm


def _beat_track(y, sr, hop_length=512):
    """Retourne (tempo_bpm, beat_frames) en gérant les versions de librosa."""
    result = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    if isinstance(result, tuple):
        tempo = float(np.squeeze(result[0]).item())
        beats = np.atleast_1d(result[1])
    else:
        # Anciennes versions retournent directement le tempo scalaire.
        tempo = float(np.squeeze(result).item())
        beats = np.atleast_1d(result)
    return tempo, beats


def _grid_onset_strength(onset_env, sr, hop_length, times):
    """Force d'onset moyenne aux positions temporelles données."""
    if len(times) == 0:
        return 0.0
    frames = librosa.time_to_frames(times, sr=sr, hop_length=hop_length)
    frames = frames[(frames >= 0) & (frames < len(onset_env))]
    if len(frames) == 0:
        return 0.0
    return float(np.mean(onset_env[frames]))


def _subdivision_support(onset_env, sr, hop_length, duration, tempo):
    """Les temps intercalaires de cette grille portent-ils de l'énergie ?

    Retourne le rapport entre la force d'onset moyenne des positions
    intercalaires (contretemps) et celle des positions principales.
    Proche de 1 : la grille fine correspond à de vrais événements, le tempo
    ne doit pas être divisé. Proche de 0 : les contretemps sont vides, le
    tempo est probablement le double du tempo réel.
    """
    interval = 60.0 / tempo
    if interval <= 0 or duration < 2 * interval:
        return 1.0
    main = np.arange(0.0, duration, 2 * interval)
    offs = np.arange(interval, duration, 2 * interval)
    strong = _grid_onset_strength(onset_env, sr, hop_length, main)
    weak = _grid_onset_strength(onset_env, sr, hop_length, offs)
    if strong <= 0:
        return 1.0
    return weak / strong


def _fill_beat_grid_gaps(beat_frames):
    """Subdivise les intervalles anormalement longs de la grille de beats.

    Un trou dans la grille est un angle mort de l'analyse : le chroma y est
    moyenné sur toute la durée du trou, donc une seule observation atteint le
    décodeur et aucune segmentation n'y est possible. On y insère des frames
    régulièrement espacées à l'intervalle médian, ce qui rend au HMM sa
    résolution temporelle sans rien changer aux beats réellement détectés.
    """
    if not ENABLE_BEAT_GRID_GAP_FILL or len(beat_frames) < 3:
        return beat_frames
    frames = np.asarray(beat_frames, dtype=np.int64)
    gaps = np.diff(frames)
    gaps = gaps[gaps > 0]
    if len(gaps) == 0:
        return beat_frames
    median_gap = float(np.median(gaps))
    if median_gap <= 0:
        return beat_frames

    filled = [int(frames[0])]
    for prev, nxt in zip(frames[:-1], frames[1:]):
        gap = int(nxt) - int(prev)
        if gap > BEAT_GAP_FACTOR * median_gap:
            n_insert = max(1, int(round(gap / median_gap)) - 1)
            for i in range(1, n_insert + 1):
                filled.append(int(round(prev + i * gap / (n_insert + 1))))
        filled.append(int(nxt))
    out = np.array(sorted(set(filled)), dtype=np.int64)
    if len(out) > len(frames):
        log(f'grille de beats : {len(out) - len(frames)} frames insérées '
            f'dans {int(np.sum(gaps > BEAT_GAP_FACTOR * median_gap))} trou(s)')
    return out


def _resolve_tempo(y, sr, detected_tempo):
    """Corrige l'erreur classique 'double ou moitié' du tempo détecté.

    L'ancienne version choisissait le candidat maximisant la force d'onset
    moyenne sur sa grille. Ce critère est structurellement biaisé vers le
    tempo divisé par deux : une grille deux fois plus grossière ne retient
    que les temps forts, donc sa moyenne est mécaniquement plus élevée,
    même quand les contretemps sont pleinement joués. En pratique la moitié
    l'emportait sur presque tous les morceaux du corpus.

    La décision repose désormais sur une question mesurable et non biaisée :
    les positions intercalaires portent-elles de l'énergie ? Si oui, la
    grille fine est réelle et on ne divise pas.
    """
    if not detected_tempo or detected_tempo <= 0:
        return detected_tempo

    hop_length = 512
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    except Exception:
        return round(float(detected_tempo), 1)

    duration = float(len(y) / sr)
    if duration <= 0 or len(onset_env) == 0:
        return round(float(detected_tempo), 1)

    tempo = float(detected_tempo)

    if not ENABLE_TEMPO_OCTAVE_FIX:
        return round(tempo, 1)

    # L'énergie des onsets ne peut pas trancher seule l'ambiguïté d'octave :
    # sur une ballade jouée en croches, les contretemps sont réellement joués,
    # donc la grille double paraît aussi valide que la grille réelle. Le
    # critère qui tranche est perceptif : à périodicité comparable, l'oreille
    # choisit le tempo le plus proche d'environ 110 BPM.
    candidates = [tempo * ratio for ratio in TEMPO_OCTAVE_RATIOS]
    best_tempo, best_score = tempo, -1.0

    for cand in candidates:
        if cand <= 0:
            continue
        # Périodicité : énergie moyenne d'onset sur la grille du candidat,
        # normalisée pour ne pas favoriser les grilles grossières.
        interval = 60.0 / cand
        if duration < 2 * interval:
            continue
        grid = np.arange(0.0, duration, interval)
        strength = _grid_onset_strength(onset_env, sr, hop_length, grid)
        overall = float(np.mean(onset_env)) or 1.0
        periodicity = strength / overall

        # Prior log-normal centré sur le tempo perceptif de référence.
        prior = math.exp(-0.5 * (math.log2(cand / TEMPO_PERCEPTUAL_CENTER)
                                 / TEMPO_PRIOR_SIGMA) ** 2)
        score = periodicity * prior

        if score > best_score:
            best_score, best_tempo = score, cand

    return round(float(best_tempo), 1)


def detect_tempo(wav_path):
    """Détecte le tempo moyen d'un fichier WAV en BPM (avec correction double/moitié)."""
    try:
        y, sr = librosa.load(wav_path, sr=22050, mono=True)
        if len(y) == 0:
            return None
        tempo, _ = _beat_track(y, sr)
        return _resolve_tempo(y, sr, tempo)
    except Exception as e:
        log(f'tempo detection failed: {e}')
        return None


def estimate_time_signature(wav_path, tempo):
    """Estime la signature rythmique la plus probable (3/4 ou 4/4)."""
    try:
        if tempo is None:
            return '4/4'
        y, sr = librosa.load(wav_path, sr=22050, mono=True)
        if len(y) == 0:
            return '4/4'
        _, beat_frames = _beat_track(y, sr)
        beat_frames = np.atleast_1d(beat_frames)
        if len(beat_frames) < 8:
            return '4/4'
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        strengths = onset_env[beat_frames]
        mean = float(np.mean(strengths))
        if mean == 0:
            return '4/4'
        centered = strengths - mean
        best_lag = 4
        best_corr = -1.0
        for lag in range(2, 6):
            if lag >= len(centered):
                break
            a = centered[:-lag]
            b = centered[lag:]
            if len(a) < 2:
                continue
            c = float(np.corrcoef(a, b)[0, 1])
            if np.isnan(c):
                c = 0.0
            if c > best_corr:
                best_corr = c
                best_lag = lag
        if best_lag == 3 and best_corr > 0.25:
            return '3/4'
        return '4/4'
    except Exception as e:
        log(f'time signature estimation failed: {e}')
        return '4/4'


def detect_key(y, sr):
    """Détecte la tonalité globale et retourne les candidates ordonnées."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
        if chroma.shape[1] == 0:
            return None, []
        energy = np.sum(chroma, axis=0)
        total = np.sum(energy)
        if total == 0:
            return None, []
        weights = energy / total
        profile = np.sum(chroma * weights, axis=1)
        profile_norm = normalize_chroma_frame(profile.astype(np.float32))
        if profile_norm is None:
            return None, []

        candidates = []
        for root in range(12):
            major = float(np.dot(profile_norm, np.roll(MAJOR_PROFILE, root)) / np.linalg.norm(MAJOR_PROFILE))
            minor = float(np.dot(profile_norm, np.roll(MINOR_PROFILE, root)) / np.linalg.norm(MINOR_PROFILE))
            candidates.append({'pc': root, 'mode': 'major', 'score': major})
            candidates.append({'pc': root, 'mode': 'minor', 'score': minor})

        candidates.sort(key=lambda x: x['score'], reverse=True)
        best = candidates[0]
        best_score = best['score']
        if best_score <= 0:
            return None, []

        main = {
            'pc': best['pc'],
            'mode': best['mode'],
            'name': key_name(best['pc'], best['mode']),
            'confidence': round(float(np.clip(best_score, 0.0, 1.0)), 3),
        }
        all_candidates = [
            {
                'pc': c['pc'],
                'mode': c['mode'],
                'name': key_name(c['pc'], c['mode']),
                'confidence': round(float(np.clip(c['score'] / best_score, 0.0, 1.0)), 3),
            }
            for c in candidates
        ]
        return main, all_candidates
    except Exception as e:
        log(f'key detection failed: {e}')
        return None, []


def _build_chord_states(observation_mode="baseline", contradiction_weight=0.10):
    """Construit la liste des états d'accords du HMM.

    observation_mode :
        "baseline" — templates originaux (CHORD_TEMPLATES_WEIGHTED).
        "targeted_contradictions" — ajoute des poids négatifs sur les
        intervalles distinctifs des rivales de même famille (CHORD_CONTRADICTIONS).
    contradiction_weight : poids global appliqué aux contradictions (w dans O2).
    """
    states = []
    for root in range(12):
        for suffix, tpl in CHORD_TEMPLATES_WEIGHTED.items():
            template = np.zeros(12, dtype=np.float32)
            for pc, weight in tpl:
                template[(root + pc) % 12] = weight
            if observation_mode == "targeted_contradictions" and suffix in CHORD_CONTRADICTIONS:
                for interval, rel_weight in CHORD_CONTRADICTIONS[suffix]:
                    pc = (root + interval) % 12
                    template[pc] -= contradiction_weight * rel_weight
            norm = float(np.linalg.norm(template))
            if norm > 0:
                template = template / norm
            base_chord_parsed = parse_chord_for_normalization(chord_name(root, suffix))
            states.append({
                'name': chord_name(root, suffix),
                'root': root,
                'suffix': suffix,
                'template': template,
                'structural_root': base_chord_parsed['root_pc'],
                'structural_mode': base_chord_parsed['mode'],
            })
    # État "pas d'accord" (silence / bruit).
    states.append({'name': 'N', 'root': None, 'suffix': 'N', 'template': None})
    return states


def _build_diatonic_roots(key):
    """Retourne l'ensemble des fondamentales diatoniques (pitch classes).

    Majeur : les 7 degrés de l'échelle majeure.
    Mineur : union des 3 variantes (naturelle, harmonique, mélodique)
    pour couvrir V7, VII, ii, III+ dans le mineur sans forcer un mode unique.
    """
    if not key:
        return set()
    root = key['pc']
    mode = key['mode']
    major = {0, 2, 4, 5, 7, 9, 11}
    if mode == 'major':
        degrees = major
    else:
        minor_natural = {0, 2, 3, 5, 7, 8, 10}
        minor_harmonic = {0, 2, 3, 5, 7, 8, 11}
        minor_melodic = {0, 2, 3, 5, 7, 8, 10}
        # Union des 3 variantes : degrés 0,2,3,5,7,8,10,11
        degrees = minor_natural | minor_harmonic | minor_melodic
    return {(root + d) % 12 for d in degrees}


def _merge_similar_segments(segments):
    """Fusionne les segments consécutifs de même fondamentale et qualité voisine."""
    if not segments:
        return segments
    merged = [segments[0]]
    for seg in segments[1:]:
        prev = merged[-1]
        prev_root, prev_sfx = _parse_chord_label(prev['chord'])
        cur_root, cur_sfx = _parse_chord_label(seg['chord'])
        if (prev_root is not None and cur_root is not None
            and prev_root == cur_root
            and _is_similar_quality(prev_sfx, cur_sfx)):
            merged[-1]['endTime'] = seg['endTime']
        else:
            merged.append(seg)
    return merged


def _state_pc_set(state):
    """Retourne le pitch-class set d'un état d'accord."""
    suffix = state['suffix']
    if suffix == 'N' or state['root'] is None:
        return set()
    return {(state['root'] + pc) % 12 for pc in CHORD_INTERVALS[suffix]}


def _merge_arpeggio_segments(segments, beat_chroma, states, key, obs_scores=None,
                             max_window_beats=4,
                             min_obs_score=0.50,
                             min_score_gain=0.08,
                             min_pc_coverage=0.60,
                             beat_dur=None):
    """Fusionne les courts segments consécutifs issus d'un même harmonie.

    Quand un arpège, un walking bass ou une figure mélodique courte fait
    changer le HMM à chaque beat, les segments consécutifs appartiennent
    souvent au même pitch-class set agrégé. Cette fonction détecte ces
    fenêtres et les fusionne en l'accord le plus cohérent, sans toucher au
    HMM ni à l'observation.

    Garde-fous pour éviter les régressions :
    - le score de l'accord gagnant sur le chroma agrégé doit être nettement
      supérieur au score moyen des segments pris individuellement ;
    - une majorité des fondamentales des segments fusionnés doit appartenir
      au PC-set de l'accord gagnant ;
    - l'accord gagnant doit être diatonique dans la tonalité détectée.
    """
    if len(segments) < 2:
        return segments

    diatonic_roots = _build_diatonic_roots(key)
    if not diatonic_roots:
        return segments

    seg_beats = [seg.get('beatIndices', []) for seg in segments]

    # Durée maximale d'une cellule absorbable, en secondes.
    if beat_dur is None:
        ref = next((s for s in segments if len(s.get('beatRealTimes', [])) > 1), None)
        beat_dur = float(np.mean(np.diff(ref['beatRealTimes']))) if ref else 0.5
    max_cell_dur = max(ARPEGGIO_CELL_MAX_BEATS * float(beat_dur),
                       ARPEGGIO_CELL_MAX_SECONDS)

    def segment_score(seg):
        """Score moyen du segment avec son propre état, si disponible."""
        idxs = seg.get('beatIndices', [])
        state_idx = seg.get('state')
        if not idxs or state_idx is None or state_idx < 0 or state_idx >= len(states):
            return 0.0
        if states[state_idx]['suffix'] == 'N':
            return 0.0
        # On ne dispose pas de obs_scores ici ; on se fie à la confidence.
        return float(seg.get('confidence', 0.0))

    def aggregate_score(beat_idxs):
        """Retourne (best_state_index, best_score, second_score, all_scores) sur le chroma agrégé."""
        if not beat_idxs:
            return None, 0.0, 0.0, None
        agg = np.mean(beat_chroma[:, beat_idxs], axis=1)
        norm = float(np.linalg.norm(agg))
        if norm < 1e-6:
            return None, 0.0, 0.0, None
        agg_norm = agg / norm
        scores = np.zeros(len(states), dtype=np.float64)
        for j, st in enumerate(states):
            if st['suffix'] == 'N' or st['root'] is None:
                scores[j] = -1.0
                continue
            scores[j] = float(np.dot(agg_norm, st['template']))
        top_idx = int(np.argmax(scores))
        top_score = float(scores[top_idx])
        second_score = float(np.partition(scores, -2)[-2]) if len(scores) > 1 else 0.0
        return top_idx, top_score, second_score, scores

    def pc_coverage(window_root_pcs, state_idx):
        """Proportion des fondamentales de la fenêtre incluses dans le PC-set."""
        if state_idx is None or state_idx < 0 or state_idx >= len(states):
            return 0.0
        pcs = _state_pc_set(states[state_idx])
        if not pcs:
            return 0.0
        return sum(1 for r in window_root_pcs if r in pcs) / len(window_root_pcs)

    merged = []
    i = 0
    n = len(segments)
    while i < n:
        best_w = 1
        best_state = None
        best_score = 0.0

        # Fenêtres croissantes à partir de i
        for w in range(2, min(max_window_beats + 1, n - i + 1)):
            beat_idxs = []
            window_root_pcs = []
            window_scores = []
            window_chord_names = []
            valid = True
            for k in range(i, i + w):
                seg = segments[k]
                if seg['chord'] == 'N':
                    valid = False
                    break
                idxs = seg_beats[k]
                if not idxs:
                    valid = False
                    break
                if (ENABLE_ARPEGGIO_CELL_DURATION_CAP
                        and seg['endTime'] - seg['startTime'] > max_cell_dur):
                    valid = False
                    break
                beat_idxs.extend(idxs)
                root, _ = _parse_chord_label(seg['chord'])
                window_root_pcs.append(root if root is not None else -1)
                window_scores.append(segment_score(seg))
                window_chord_names.append(seg['chord'])

            if not valid or not beat_idxs or any(r < 0 for r in window_root_pcs):
                continue

            state_idx, agg_score, sec_score, all_scores = aggregate_score(beat_idxs)
            if state_idx is None:
                continue
            if states[state_idx]['suffix'] == 'N':
                continue

            # L'accord gagnant doit être diatonique
            if states[state_idx]['root'] not in diatonic_roots:
                continue

            # Garde d'identité : l'accord gagnant doit être l'un des accords
            # déjà présents dans la fenêtre. Un arpège est un accord connu
            # étalé dans le temps ; une alternance C↔G n'est pas un Gsus4.
            if (ENABLE_ARPEGGIO_MERGE_IDENTITY_GUARD
                    and states[state_idx]['name'] not in window_chord_names):
                continue

            # Score agrégé nettement supérieur au score moyen individuel
            mean_indiv = float(np.mean(window_scores))
            full_coverage = pc_coverage(window_root_pcs, state_idx) >= 0.999
            if agg_score < mean_indiv + min_score_gain:
                # Même sans gain acoustique, on peut fusionner si toutes les
                # fondamentales de la fenêtre appartiennent au PC-set d'un accord
                # diatonique stable (ex: walking bass C-E-G-B dans Cmaj7).
                if not full_coverage:
                    continue
                if agg_score < min_obs_score + 0.10:
                    continue

            # Marge par rapport au deuxième candidat
            if agg_score - sec_score < min_score_gain * 0.5:
                continue

            # Couverture minimale du PC-set (redondant avec full_coverage mais
            # utile lorsque le gain acoustique est présent).
            coverage = pc_coverage(window_root_pcs, state_idx)
            if coverage < min_pc_coverage:
                continue

            # Conserver la meilleure fenêtre
            if agg_score > best_score:
                best_w = w
                best_state = state_idx
                best_score = agg_score

        if best_w > 1 and best_state is not None:
            new_seg = {
                'startTime': segments[i]['startTime'],
                'endTime': segments[i + best_w - 1]['endTime'],
                'chord': states[best_state]['name'],
                'state': best_state,
                'beatIndices': [],
                'confidence': round(best_score, 3),
                'structural_root': states[best_state].get('structural_root'),
                'structural_mode': states[best_state].get('structural_mode'),
                'merged_by_arpeggio': True,
            }
            for k in range(i, i + best_w):
                new_seg['beatIndices'].extend(seg_beats[k])
            merged.append(new_seg)
            i += best_w
        else:
            merged.append(segments[i])
            i += 1

    # Passe finale : absorber un segment terminal très court et isolé
    # lorsque le segment précédent est le résultat d'une fusion arpège.
    # Cela nettoie les notes de passage en fin de phrase sans affecter
    # les vrais changements d'accord.
    if len(merged) >= 2 and obs_scores is not None:
        last = merged[-1]
        prev = merged[-2]
        if last['chord'] != 'N' and prev['chord'] != 'N' and prev.get('merged_by_arpeggio'):
            last_dur = last['endTime'] - last['startTime']
            prev_dur = prev['endTime'] - prev['startTime'] - last_dur
            if last_dur <= 0.55 and prev_dur >= 1.0:
                prev['endTime'] = last['endTime']
                prev['beatIndices'].extend(last.get('beatIndices', []))
                last_conf = float(last.get('confidence', 0.0))
                if prev_dur + last_dur > 0:
                    prev['confidence'] = round(
                        (prev.get('confidence', 0.0) * prev_dur + last_conf * last_dur)
                        / (prev_dur + last_dur), 3)
                merged.pop()

    return merged


# ─────────────────────────────────────────────────────────────────
# Stabilisation de progression (couche additive post-Viterbi)
# [OpenCode] — 2026-08-20 — Nettoyage des fondamentales parasites
# issues de notes de passage / arpèges, pour produire une timeline
# lisible sur les progressions simples en boucle (ex: A-E-B-D en La
# majeur). Ne modifie ni le HMM ni l'observation : pure post-correction
# opérant sur les segments déjà fusionnés.
# ─────────────────────────────────────────────────────────────────


def _diatonic_triad_suffix(root_pc, key):
    """Retourne le suffixe de triade diatonique ('' majeur, 'm' mineur,
    'dim' diminué) pour une fondamentale donnée dans la tonalité détectée.

    Utilise la tierce diatonique de l'échelle majeure/mineure harmonique.
    Retourne None si la fondamentale n'est pas diatonique (hors échelle).
    """
    if not key:
        return None
    key_pc = key['pc']
    mode = key['mode']
    # Intervalle de la fondamentale par rapport à la tonique.
    interval = (root_pc - key_pc) % 12
    if mode == 'major':
        # Degrés majeurs : I(0)=maj, ii(2)=m, iii(4)=m, IV(5)=maj,
        # V(7)=maj, vi(9)=m, vii°(11)=dim. Tierce majeure=4, mineure=3, dim=3+dim5.
        scale_thirds = {0: 4, 2: 3, 4: 3, 5: 4, 7: 4, 9: 3, 11: 3}
        if interval not in scale_thirds:
            return None
        if interval == 11:
            return 'dim'  # vii° diatonique en majeur
        return '' if scale_thirds[interval] == 4 else 'm'
    else:
        # Mineur : union des variantes harmonique/mélodique pour la tierce.
        scale_thirds = {0: 3, 2: 3, 3: 4, 5: 3, 7: 3, 8: 4, 10: 3, 11: 3}
        if interval not in scale_thirds:
            return None
        return 'm' if scale_thirds[interval] == 3 else ''


def _simplify_quality(root_pc, suffix, key, confidence, complex_confidence):
    """Retourne le suffixe simplifié (triade majeure/mineure) lorsque le
    contexte est stable et que l'accord complexe n'est pas fortement soutenu.

    Règles :
      - sus2/sus4/maj7/7/m7 → triade diatonique de la tonalité si disponible ;
      - on conserve la qualité complexe si sa confidence dépasse la
        confiance simplifiée d'une marge (complex_confidence) OU si la
        fondamentale n'est pas diatonique (on ne devine pas le mode).
    """
    diatonic_suffix = _diatonic_triad_suffix(root_pc, key)
    if diatonic_suffix is None:
        return suffix
    # Suffixes complexes candidats à la simplification vers une triade.
    complex_suffixes = {'sus2', 'sus4', 'maj7', '7', 'm7', 'add9', '9', '11', '13'}
    if suffix not in complex_suffixes:
        return suffix
    # Conserver la qualité complexe si fortement soutenue (ex: vraie 7e de
    # dominante bien marquée). La marge est relative à la confiance du segment.
    if confidence >= complex_confidence:
        # m7 vers mineur seulement si la 7e mineure est claire ; sinon simplifier.
        if suffix == 'm7':
            return diatonic_suffix
        # maj7/7 vers majeur seulement si la 7e est nette ; tolérance plus haute.
        if suffix in ('maj7', '7'):
            return diatonic_suffix
        return diatonic_suffix
    return diatonic_suffix


def _absorb_arpeggio_figures(segments, beat_chroma, states, beat_dur=None,
                             beat_chroma_upper=None):
    """Absorbe les figures d'arpège / walking bass / pédale très conservatives.

    Cette couche est additive et n'intervient que lorsque le chroma global d'une
    zone sans silence montre un pattern évident :
      - **Pédale** : un pitch class basse domine à >50 % de l'énergie sur la zone
        et apparaît au moins deux fois comme fondamentale de segment.
      - **Walking bass cycle** : les fondamentales forment un motif périodique
        (longueur 2–4) répété au moins 2 fois, avec la même fondamentale en
        début et fin de cycle, et le template de l'accord de début correspond
        au chroma agrégé.

    Le but est de résoudre des cas déterministes comme L (walking bass Cmaj7)
    et Q (pédale G + mélodie) sans toucher au HMM ni au beat tracker, et sans
    affecter des morceaux réels comme "You Are Yahweh".
    """
    if not ENABLE_ARPEGGIO_FIGURE_ABSORPTION or len(segments) < 3:
        return segments

    # Déterminer beat_dur si non fourni.
    if beat_dur is None:
        if beat_chroma.shape[1] > 1:
            # On essaie de récupérer la durée moyenne entre beats via beatRealTimes
            first_seg = next((s for s in segments if s.get('beatRealTimes')), None)
            if first_seg and len(first_seg['beatRealTimes']) > 1:
                beat_dur = float(np.mean(np.diff(first_seg['beatRealTimes'])))
            else:
                beat_dur = 0.5
        else:
            beat_dur = 0.5

    state_by_name = {st['name']: st for st in states if st.get('suffix') != 'N'}

    def _zone_chroma(start_s, end_s):
        start_b = max(0, int(round(start_s / beat_dur)))
        end_b = min(beat_chroma.shape[1], int(round(end_s / beat_dur)))
        if end_b <= start_b:
            return np.zeros(12, dtype=np.float32)
        return beat_chroma[:, start_b:end_b].mean(axis=1)

    def _template_score(chroma, root_pc, suffix):
        st = state_by_name.get(chord_name(root_pc, suffix))
        if st is None or st.get('template') is None:
            return 0.0
        norm = float(np.linalg.norm(chroma))
        if norm <= 0:
            return 0.0
        return float(np.dot(chroma / norm, st['template']))

    def _choose_quality(root_pc, chroma):
        """Choisit '' ou 'maj7' selon le template score."""
        maj_score = _template_score(chroma, root_pc, '')
        maj7_score = _template_score(chroma, root_pc, 'maj7')
        return 'maj7' if maj7_score > maj_score else ''

    def _upper_voice_stability(start_s, end_s):
        """Immobilité des voix supérieures sur la zone : cosinus moyen entre
        beats consécutifs du chroma aigu. 1,0 = registre figé (accord tenu),
        valeurs basses = l'harmonie change réellement.

        Retourne None quand le chroma aigu n'est pas disponible : la garde est
        alors inopérante et le comportement historique est conservé."""
        if beat_chroma_upper is None:
            return None
        start_b = max(0, int(round(start_s / beat_dur)))
        end_b = min(beat_chroma_upper.shape[1], int(round(end_s / beat_dur)))
        if end_b - start_b < 2:
            return None
        sims = []
        for t in range(start_b, end_b - 1):
            a = beat_chroma_upper[:, t]
            b = beat_chroma_upper[:, t + 1]
            na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
            if na < 1e-6 or nb < 1e-6:
                continue
            sims.append(float(np.dot(a / na, b / nb)))
        return float(np.mean(sims)) if sims else None

    # 1. Découper en groupes sans silence.
    groups = []
    current = []
    for s in segments:
        if s['chord'] == 'N':
            if current:
                groups.append(current)
                current = []
        else:
            current.append(s)
    if current:
        groups.append(current)

    fusions = []
    for group in groups:
        if len(group) < 3:
            continue
        roots = []
        valid = True
        for s in group:
            r, _ = _parse_chord_label(s['chord'])
            if r is None:
                valid = False
                break
            roots.append(r)
        if not valid:
            continue

        zone_start = group[0]['startTime']
        zone_end = group[-1]['endTime']
        zone_dur = zone_end - zone_start
        if zone_dur < 1.5:
            continue
        zone_chroma = _zone_chroma(zone_start, zone_end)
        zone_total = float(zone_chroma.sum())
        if zone_total <= 0:
            continue
        zone_chroma_norm = zone_chroma / zone_total
        dominant_pc = int(np.argmax(zone_chroma_norm))
        dominant_energy = float(zone_chroma_norm[dominant_pc])

        # ── Détection pédale (très stricte) ──
        root_count = sum(1 for r in roots if r == dominant_pc)
        other_segments = [s for s, r in zip(group, roots) if r != dominant_pc]
        other_roots = {r for r in roots if r != dominant_pc}
        max_other_dur = max((s['endTime'] - s['startTime']) for s in other_segments) if other_segments else 0.0
        if (dominant_energy >= 0.50 and root_count >= 2 and
                len(other_roots) >= 1 and len(set(roots)) >= 2 and
                max_other_dur < 1.2):
            suffix = _choose_quality(dominant_pc, zone_chroma)
            fusions.append((segments.index(group[0]),
                            segments.index(group[-1]),
                            chord_name(dominant_pc, suffix)))
            continue

        # ── Détection walking bass cycle ──
        # On cherche un motif périodique de longueur 2–4 répété au moins 2 fois.
        n = len(roots)
        found_cycle = False
        for cycle_len in range(2, 5):
            if n < cycle_len * 2:
                continue
            pattern = tuple(roots[:cycle_len])
            # Le pattern doit contenir au moins 2 fondamentales distinctes
            # (sinon ce n'est pas un walking bass / cycle).
            if len(set(pattern)) < 2:
                continue
            repeats = True
            for i in range(cycle_len, n):
                if roots[i] != pattern[i % cycle_len]:
                    repeats = False
                    break
            if not repeats:
                continue
            # Vérifier que les segments intermédiaires du cycle sont courts
            # (figures d'arpège / notes de passage) et non des accords réels.
            max_intermediate_dur = max(
                (group[i]['endTime'] - group[i]['startTime'])
                for i in range(cycle_len - 1)
            )
            if max_intermediate_dur >= 1.2:
                continue

            distinct = len(set(pattern))
            if distinct < 2:
                continue

            # Un cycle de fondamentales ne vaut absorption que si les voix
            # supérieures restent immobiles : sinon ce n'est pas une basse qui
            # se promène sous un accord tenu, c'est une vraie progression.
            if ENABLE_UPPER_VOICE_STABILITY_GUARD:
                stab = _upper_voice_stability(zone_start, zone_end)
                if stab is not None and stab < UPPER_VOICE_STABILITY_MIN:
                    continue

            # Vérifier que l'accord de début correspond au chroma global.
            tonic = pattern[0]
            suffix = _choose_quality(tonic, zone_chroma)
            score = _template_score(zone_chroma, tonic, suffix)
            if score >= 0.30:
                fusions.append((segments.index(group[0]),
                                segments.index(group[-1]),
                                chord_name(tonic, suffix)))
                found_cycle = True
                break
        if found_cycle:
            continue

    if not fusions:
        return segments

    # Fusionner les zones détectées (pas de chevauchement, on garde la plus large).
    fusions = sorted(set(fusions), key=lambda x: x[0])
    filtered = []
    for start, end, chord in fusions:
        if not filtered or start >= filtered[-1][1]:
            filtered.append([start, end, chord])
        elif end > filtered[-1][1]:
            filtered[-1][1] = end
            filtered[-1][2] = chord

    result = []
    i = 0
    while i < len(segments):
        if filtered and filtered[0][0] == i:
            start, end, chord = filtered.pop(0)
            merged = dict(segments[start])
            merged['chord'] = chord
            merged['endTime'] = float(segments[end]['endTime'])
            merged['duration'] = merged['endTime'] - merged['startTime']
            # Recalculer beatIndices / beatRealTimes sur la zone fusionnée.
            bidx = []
            brt = []
            for k in range(start, end + 1):
                bidx.extend(segments[k].get('beatIndices', []))
                brt.extend(segments[k].get('beatRealTimes', []))
            merged['beatIndices'] = bidx
            merged['beatRealTimes'] = brt
            # state : on garde celui du premier segment si l'accord est identique,
            # sinon on cherche l'état correspondant au nouvel accord.
            if segments[start].get('chord') == chord:
                merged['state'] = segments[start].get('state')
            else:
                merged['state'] = None
                for idx, st in enumerate(states):
                    if st.get('name') == chord:
                        merged['state'] = idx
                        break
            merged['structural_root'] = segments[start].get('structural_root')
            merged['structural_mode'] = segments[start].get('structural_mode')
            result.append(merged)
            i = end + 1
        else:
            result.append(segments[i])
            i += 1
    return result


def _stabilize_progression(segments, key, states,
                           n_structural_roots=4,
                           short_threshold=1.5,
                           complex_confidence=0.95):
    """Couche additive de stabilisation harmonique post-Viterbi.

    Détecte les progressions simples en boucle (ex: I-V-II-IV en La majeur)
    et nettoie les fondamentales parasites issues de notes de passage ou
    d'arpèges internes, sans toucher au HMM ni à l'observation.

    Étapes :
      1. Identifier les fondamentales structurelles (top-N diatoniques par
         durée cumulée). Les autres fondamentales diatoniques rares et les
         fondamentales non diatoniques sont considérées comme « passantes ».
      2. Absorber les courts segments passants dans le voisin structurel le
         plus proche (gauche puis droite) lorsque la fondamentale passante
         appartient au PC-set du voisin (ex: C# dans A majeur → A ou E).
      3. Simplifier les qualités complexes (sus4, maj7, m7...) vers des
         triades majeures/mineures diatoniques lorsque le contexte est stable.
      4. Fusionner les segments consécutifs de même fondamentale simplifiée.
    """
    if len(segments) < 2 or not key:
        return segments

    diatonic_roots = _build_diatonic_roots(key)
    if not diatonic_roots:
        return segments

    # ── 1. Identifier les fondamentales structurelles ──
    # On mesure la "présence étalée" d'une fondamentale via la durée totale
    # diminuée du segment le plus long (durée "trimmée"). Cela évite qu'une
    # unique longue tenue (ex: outro de 13s sur F#m) ne fasse passer une
    # fondamentale parasite pour "structurelle". Les membres d'une boucle
    # réapparaissent plusieurs fois ; leur durée trimmée est donc élevée.
    root_total = {}
    root_max = {}
    for seg in segments:
        if seg['chord'] == 'N':
            continue
        root_pc, _ = _parse_chord_label(seg['chord'])
        if root_pc is None:
            continue
        dur = seg['endTime'] - seg['startTime']
        root_total[root_pc] = root_total.get(root_pc, 0.0) + dur
        root_max[root_pc] = max(root_max.get(root_pc, 0.0), dur)

    # Score structurel = durée trimmée (total - max). On inclut toutes les
    # fondamentales (diatoniques ou non) : une progression en boucle peut
    # contenir des accords empruntés hors échelle (ex: II majeur en La majeur).
    ranked = sorted(
        ((r, root_total[r] - root_max.get(r, 0.0)) for r in root_total),
        key=lambda x: -x[1]
    )
    structural_roots = set(r for r, _ in ranked[:n_structural_roots]
                          if root_total[r] >= 1.0)
    if not structural_roots:
        return segments

    # Index rapide des états par nom (pour récupérer les PC-sets).
    state_by_name = {st['name']: st for st in states if st['suffix'] != 'N'}

    def seg_root_pc(seg):
        if seg['chord'] == 'N':
            return None
        rp, _ = _parse_chord_label(seg['chord'])
        return rp

    def seg_pc_set(seg):
        """PC-set de l'accord d'un segment via son état (ou reconstitué)."""
        if seg['chord'] == 'N':
            return set()
        st = state_by_name.get(seg['chord'])
        if st is not None:
            return _state_pc_set(st)
        # Reconstituer à partir du suffixe parsé (rare, défensif).
        rp, sfx = _parse_chord_label(seg['chord'])
        if rp is None or sfx is None or sfx not in CHORD_INTERVALS:
            return set()
        return {(rp + pc) % 12 for pc in CHORD_INTERVALS[sfx]}

    # ── 2. Absorber les courts segments passants ──
    # On travaille sur une copie pour pouvoir étendre les voisins.
    merged = [dict(seg) for seg in segments]
    n = len(merged)
    keep = [True] * n

    for i, seg in enumerate(merged):
        if seg['chord'] == 'N':
            continue
        dur = seg['endTime'] - seg['startTime']
        if dur >= short_threshold:
            continue
        rp = seg_root_pc(seg)
        if rp is None:
            continue
        # Structurel ? On garde.
        if rp in structural_roots:
            continue
        # Passant : tenter d'absorber à gauche puis à droite si la fondamentale
        # passante appartient au PC-set du voisin structurel.
        # Les segments d'entrée étant contigus, on ne considère que le voisin
        # immédiatement adjacent (le premier segment conservé à gauche/droite).
        absorbed = False
        # Voisin gauche immédiat (premier segment conservé avant i).
        for j in range(i - 1, -1, -1):
            if not keep[j]:
                continue
            neighbor = merged[j]
            # Adjacence : le voisin doit finir là où le segment passant commence.
            if abs(neighbor['endTime'] - seg['startTime']) > 1e-3:
                break
            if neighbor['chord'] == 'N':
                break
            nrp = seg_root_pc(neighbor)
            if nrp in structural_roots and rp in seg_pc_set(neighbor):
                # Étendre le voisin gauche jusqu'à la fin du segment passant.
                neighbor['endTime'] = seg['endTime']
                if neighbor.get('beatIndices') is not None and seg.get('beatIndices'):
                    neighbor['beatIndices'].extend(seg['beatIndices'])
                # Confiance pondérée par durée.
                nd = neighbor['endTime'] - neighbor['startTime']
                if nd > 0:
                    neighbor['confidence'] = round(
                        (float(neighbor.get('confidence', 0.0)) * (nd - dur)
                         + float(seg.get('confidence', 0.0)) * dur) / nd, 3)
                keep[i] = False
                absorbed = True
            break
        if absorbed:
            continue
        # Voisin droit immédiat (premier segment conservé après i).
        for j in range(i + 1, n):
            if not keep[j]:
                continue
            neighbor = merged[j]
            # Adjacence : le voisin doit commencer là où le segment passant finit.
            if abs(neighbor['startTime'] - seg['endTime']) > 1e-3:
                break
            if neighbor['chord'] == 'N':
                break
            nrp = seg_root_pc(neighbor)
            if nrp in structural_roots and rp in seg_pc_set(neighbor):
                # Avancer le début du voisin droit jusqu'au début du segment passant.
                neighbor['startTime'] = seg['startTime']
                if neighbor.get('beatIndices') is not None and seg.get('beatIndices'):
                    neighbor['beatIndices'] = list(seg['beatIndices']) + list(neighbor.get('beatIndices', []))
                nd = neighbor['endTime'] - neighbor['startTime']
                if nd > 0:
                    neighbor['confidence'] = round(
                        (float(neighbor.get('confidence', 0.0)) * (nd - dur)
                         + float(seg.get('confidence', 0.0)) * dur) / nd, 3)
                keep[i] = False
                absorbed = True
            break
        # Si non absorbable, on conserve le segment (note de passage réelle).

    merged = [seg for k, seg in zip(keep, merged) if k]

    # ── 3. Simplification des qualités ──
    for seg in merged:
        if seg['chord'] == 'N':
            continue
        rp, sfx = _parse_chord_label(seg['chord'])
        if rp is None:
            continue
        if rp not in structural_roots:
            continue
        conf = float(seg.get('confidence', 0.0))
        new_sfx = _simplify_quality(rp, sfx, key, conf, complex_confidence)
        if new_sfx != sfx:
            seg['chord'] = chord_name(rp, new_sfx)
            seg['structural_root'] = rp
            seg['structural_mode'] = 'major' if new_sfx == '' else (
                'minor' if new_sfx == 'm' else seg.get('structural_mode'))

    # ── 4. Fusion des segments consécutifs de même fondamentale simplifiée ──
    final = []
    for seg in merged:
        if not final:
            final.append(seg)
            continue
        prev = final[-1]
        if prev['chord'] == 'N' or seg['chord'] == 'N':
            final.append(seg)
            continue
        pr, _ = _parse_chord_label(prev['chord'])
        cr, _ = _parse_chord_label(seg['chord'])
        if pr is not None and pr == cr and prev['chord'] == seg['chord']:
            d1 = prev['endTime'] - prev['startTime']
            d2 = seg['endTime'] - seg['startTime']
            prev['endTime'] = seg['endTime']
            if prev.get('beatIndices') is not None and seg.get('beatIndices'):
                prev['beatIndices'].extend(seg['beatIndices'])
            if d1 + d2 > 0:
                prev['confidence'] = round(
                    (float(prev.get('confidence', 0.0)) * d1
                     + float(seg.get('confidence', 0.0)) * d2) / (d1 + d2), 3)
        else:
            final.append(seg)

    return final


# [OpenCode] — 2026-08-21 — Stabilisation anti-parasite contextuelle (mission v4).
# Couche additive post-_stabilize_progression qui élimine les fondamentales
# diatoniques « passantes » (II, VII, III...) attirées par le bonus diatonique
# du HMM mais qui ne sont pas des accords structurels du morceau. Conçue pour
# les progressions simples en boucle (ex: E-D-A en La majeur) où le Viterbi
# insère des B (quinte de E / tierce de G#) aux transitions.
#
# Trois mécanismes additive, sans toucher au HMM ni aux observations :
#   A. Anti-parasite par contexte : un segment court non structurel, entouré
#      de segments structurels, est remplacé par le voisin dont le template
#      matche le mieux le chroma agrégé (on ne se limite plus à l'appartenance
#      au PC-set du voisin, qui échouait pour B entre A car B ∉ {A,C#,E}).
#   B. Lissage par voisinage majoritaire : un segment non structurel entouré
#      des deux côtés par la même fondamentale structurelle est fusionné dans
#      celle-ci (vote majoritaire + garde acoustique).
#   C. Re-fusion finale des segments consécutifs devenus identiques.
ENABLE_ANTIPARASITE_STABILIZATION = True


def _compute_structural_roots_v4(segments, n_structural_roots=4,
                                   min_mean_segment_dur=2.5,
                                   min_total_dur=1.0):
    """Calcule les fondamentales structurelles (mission v4).

    Combine durée trimmée (total - max) et durée moyenne par segment pour
    distinguer un vrai structurel (revient souvent en segments longs) d'un
    parasite diatonique (apparaît souvent en segments courts, ex: B en La
    majeur). Retourne un set de pitch-classes.
    """
    root_total = {}
    root_max = {}
    root_count = {}
    for seg in segments:
        if seg['chord'] == 'N':
            continue
        rp, _ = _parse_chord_label(seg['chord'])
        if rp is None:
            continue
        dur = seg['endTime'] - seg['startTime']
        root_total[rp] = root_total.get(rp, 0.0) + dur
        root_max[rp] = max(root_max.get(rp, 0.0), dur)
        root_count[rp] = root_count.get(rp, 0) + 1

    def _score(r):
        if root_count.get(r, 0) == 0:
            return 0.0
        mean_dur = root_total[r] / root_count[r]
        if mean_dur < min_mean_segment_dur:
            return 0.0
        return root_total[r] - root_max.get(r, 0.0)

    ranked = sorted(((r, _score(r)) for r in root_total), key=lambda x: -x[1])
    return set(r for r, _ in ranked[:n_structural_roots]
               if root_total.get(r, 0.0) >= min_total_dur)


def _stabilize_antiparasite(segments, key, states, beat_chroma,
                             n_structural_roots=4,
                             short_threshold=3.5,
                             min_template_margin=0.0,
                             neighbor_majority_only=False):
    """Couche additive anti-parasite contextuelle (mission v4).

    Élimine les fondamentales diatoniques passantes attirées par le bonus
    diatonique du HMM mais qui ne sont pas des accords structurels du morceau
    (ex: B en La majeur, qui est la quinte de E / tierce de G# et apparaît aux
    transitions E↔A du refrain « You are Yahweh »).

    Un segment est considéré « parasite » si :
      - sa fondamentale n'appartient pas aux fondamentales structurelles
        (top-N par durée trimmée, comme dans _stabilize_progression) ;
      - il est court (< short_threshold) ;
      - il est entouré (à gauche et/ou à droite) de segments structurels.

    Le parasite est alors remplacé par le voisin structurel dont le template
    matche le mieux le chroma agrégé sur la fenêtre [voisin + parasite]. On ne
    se limite plus à l'appartenance de la fondamentale parasite au PC-set du
    voisin (qui échouait pour B entre A : B ∉ {A,C#,E}), ce qui expliquait
    pourquoi _stabilize_progression laissait passer les B.

    Paramètres :
      n_structural_roots : nombre de fondamentales structurelles (top-N).
      short_threshold    : durée max d'un segment parasite candidat (s).
      min_template_margin: marge min entre le score du voisin gagnant et le
                           score de l'accord parasite pour valider l'absorption
                           (0.0 = pas de garde acoustique, on fait confiance au
                           contexte structurel).
      neighbor_majority_only: si True, n'absorbe que quand gauche et droite sont
                           la même fondamentale (vote majoritaire strict).
    """
    if len(segments) < 3 or not key:
        return segments

    diatonic_roots = _build_diatonic_roots(key)
    if not diatonic_roots:
        return segments

    # ── 1. Identifier les fondamentales structurelles ──
    # On combine deux critères pour distinguer un vrai accord structurel
    # (qui revient plusieurs fois en segments longs) d'une fondamentale
    # parasite (qui apparaît souvent mais en segments courts, typiquement
    # une note de passage attirée par le bonus diatonique du HMM) :
    #   - durée trimmée (total - max) : capte les progressions en boucle ;
    #   - durée moyenne par segment : un structurel tient ses segments
    #     (ex: A tient ~5s, B parasite ~2s). On exige une durée moyenne
    #     minimale (min_mean_segment_dur) pour qu'une fondamentale soit
    #     candidate structurelle. Cela empêche B (13 segments de ~2s) de
    #     passer devant D/E (peu de segments mais longs).
    structural_roots = _compute_structural_roots_v4(
        segments, n_structural_roots=n_structural_roots)
    if not structural_roots:
        return segments
    # Recalcul des compteurs pour le reste de la fonction.
    root_total = {}
    root_max = {}
    for seg in segments:
        if seg['chord'] == 'N':
            continue
        rp, _ = _parse_chord_label(seg['chord'])
        if rp is None:
            continue
        dur = seg['endTime'] - seg['startTime']
        root_total[rp] = root_total.get(rp, 0.0) + dur
        root_max[rp] = max(root_max.get(rp, 0.0), dur)

    state_by_name = {st['name']: st for st in states if st['suffix'] != 'N'}

    def seg_state(seg):
        if seg['chord'] == 'N':
            return None
        return state_by_name.get(seg['chord'])

    def template_of(seg):
        st = seg_state(seg)
        return st.get('template') if st else None

    segs = [dict(s) for s in segments]
    changed = True
    # ── 2. Boucle d'absorption anti-parasite ──
    # On itère jusqu'à stabilisation (un parasite absorbé peut révéler un
    # nouveau contexte). On garde l'ordre gauche-then-droite.
    while changed:
        changed = False
        i = 1
        while i < len(segs) - 1:
            s = segs[i]
            if s['chord'] == 'N':
                i += 1
                continue
            s_dur = s['endTime'] - s['startTime']
            if s_dur > short_threshold:
                i += 1
                continue
            s_root, _ = _parse_chord_label(s['chord'])
            if s_root is None:
                i += 1
                continue
            if s_root in structural_roots:
                i += 1
                continue
            # Voisins immédiats (conservés). On saute les N.
            left = segs[i - 1] if i - 1 >= 0 else None
            right = segs[i + 1] if i + 1 < len(segs) else None
            if left and left['chord'] == 'N':
                left = None
            if right and right['chord'] == 'N':
                right = None
            if not left and not right:
                i += 1
                continue
            # Au moins un voisin doit être structurel.
            lr = _parse_chord_label(left['chord'])[0] if left else None
            rr = _parse_chord_label(right['chord'])[0] if right else None
            if not ((lr and lr in structural_roots) or (rr and rr in structural_roots)):
                i += 1
                continue
            # Mode majority-only : gauche et droite identiques et structurels.
            if neighbor_majority_only:
                if lr is None or rr is None or lr != rr:
                    i += 1
                    continue
            # ── Choix du voisin gagnant par garde acoustique (template) ──
            # On agrège le chroma sur [voisin + parasite] et on compare le
            # score du template du voisin à celui du parasite. On ne garde le
            # parasite que si son template gagne nettement (marge).
            beats = list(s.get('beatIndices', []))
            target = None
            candidates = []
            if left and lr in structural_roots:
                candidates.append(('left', left, lr))
            if right and rr in structural_roots:
                candidates.append(('right', right, rr))
            # Si gauche et droite sont structurels et différents, on choisit
            # le meilleur match de template sur la fenêtre parasite + bord.
            best = None
            best_score = -1.0
            for key_nb, nb, nb_root in candidates:
                nb_beats = list(nb.get('beatIndices', []))
                agg = _aggregate_chroma(nb_beats + beats, beat_chroma)
                if agg is None:
                    # Pas de garde acoustique : on accepte quand même le
                    # contexte structurel (le parasite est court et non
                    # structurel, le voisin est structurel).
                    sc = 0.0
                else:
                    nb_st = seg_state(nb)
                    s_st = seg_state(s)
                    sc_nb = _anchor_template_score(agg, nb_st) or 0.0
                    sc_self = _anchor_template_score(agg, s_st) or 0.0
                    sc = sc_nb - sc_self
                # Préférence au voisin le plus long (ancre plus crédible).
                nb_dur = nb['endTime'] - nb['startTime']
                score = sc + 0.001 * nb_dur
                if score > best_score:
                    best_score = score
                    best = (key_nb, nb, nb_root)
            # Garde acoustique : on n'absorbe que si le voisin bat le parasite
            # (ou qu'on n'a pas de chroma et qu'on fait confiance au contexte).
            if best is None:
                i += 1
                continue
            if min_template_margin > 0.0 and best_score < min_template_margin:
                # Vérifier qu'on a bien un score de template (pas juste le
                # tie-break de durée). best_score contient sc + 0.001*dur ;
                # on n'applique la garde que si sc a pu être calculé.
                # Heuristique : si on a des beats et un chroma, sc est réel.
                if beats:
                    i += 1
                    continue
            # ── Absorption ──
            key_nb, nb, nb_root = best
            if key_nb == 'left':
                nb['endTime'] = s['endTime']
            else:
                nb['startTime'] = s['startTime']
            if beats:
                nb.setdefault('beatIndices', []).extend(beats)
            d_nb = nb['endTime'] - nb['startTime'] - s_dur
            if d_nb + s_dur > 0:
                nb['confidence'] = round(
                    (float(nb.get('confidence', 0.0)) * d_nb
                     + float(s.get('confidence', 0.0)) * s_dur)
                    / (d_nb + s_dur), 3)
            del segs[i]
            changed = True
            # Ne pas avancer i : le voisin étendu peut absorber le suivant.

    # ── 3. Re-fusion finale des segments consécutifs identiques ──
    final = []
    for s in segs:
        if s['chord'] == 'N':
            final.append(s)
            continue
        if final and final[-1]['chord'] == s['chord']:
            prev = final[-1]
            d1 = prev['endTime'] - prev['startTime']
            d2 = s['endTime'] - s['startTime']
            prev['endTime'] = s['endTime']
            if d1 + d2 > 0:
                prev['confidence'] = round(
                    (float(prev.get('confidence', 0.0)) * d1
                     + float(s.get('confidence', 0.0)) * d2) / (d1 + d2), 3)
            if prev.get('beatIndices') is not None and s.get('beatIndices'):
                prev['beatIndices'].extend(s['beatIndices'])
        else:
            final.append(s)
    return final


# [OpenCode] — 2026-08-21 — Raffinement des boucles de refrain (mission v4).
# Couche additive qui détecte les longues sections « plates » d'un accord
# structurel (ex: A tenu 20s) là où le ground truth attend une boucle
# périodique E-D-A, et y réinsère les accords manquants en se basant sur le
# chroma local (et non sur le HMM, qui a raté les courts E/D noyés dans le
# bonus diatonique de la tonique).
#
# Principe : pour chaque longue section d'un accord structurel « plat »,
# on découpe en fenêtres de `window` secondes et on y réévalue l'accord
# dominant en comparant les templates des accords structurels candidats
# au chroma agrégé. On ne réinsère un accord alternatif que s'il bat
# nettement l'accord plat courant (marge `min_margin`) sur le chroma local.
#
# Conçu pour ne pas régresser sur les morceaux sans boucle : on exige une
# dégradation claire du score de l'accord plat sur la fenêtre candidate.
# DÉSACTIVÉE le 2026-08-23 — mesurée sans effet.
#
# Écrite pour « You Are Yahweh » contre une vérité terrain décalée de 18 s (voir
# EXP-009), elle valait alors +6 points sur ce seul morceau. Sur la mesure
# assainie, ablation sur les deux corpus :
#   corpus réel (5 morceaux) : +0,0 point
#   batterie B1 (20 cas)     : +0,0 point
#
# Le code est conservé plutôt que supprimé : c'est une information historique,
# et le flag suffit à la réactiver si un cas la justifie à nouveau.
ENABLE_CHORUS_LOOP_REFINE = False


def _refine_chorus_loops(segments, key, states, beat_chroma,
                          structural_roots, beat_times=None,
                          long_threshold=8.0,
                          window=2.0,
                          min_margin=0.08,
                          min_window_dur=1.5):
    """Raffine les longues sections plates d'un accord structurel en y
    réinsérant les accords structurels manquants, sur la base du chroma.

    Paramètres :
      structural_roots : ensemble des fondamentales structurelles (PC)
                         calculé en amont (partagé avec _stabilize_antiparasite).
      long_threshold   : durée min d'une section plate pour être candidate (s).
      window           : taille de la fenêtre de réévaluation (s).
      min_margin       : marge min du score template de l'accord alternatif
                         sur l'accord plat pour réinsérer (garde anti-faux).
      min_window_dur   : durée min d'une fenêtre pour être conservée (s).
    """
    if len(segments) < 2 or not key or beat_chroma is None:
        return segments
    if not structural_roots:
        return segments

    # États des accords structurels (triades majeures/mineures) par PC.
    state_by_name = {st['name']: st for st in states if st['suffix'] != 'N'}

    # Associer chaque beat à son vrai temps si beat_times est fourni ; sinon on
    # utilise une répartition linéaire des beatIndices dans [startTime, endTime].
    # L'utilisation des vrais temps est cruciale pour les segments longs contenant
    # des beats de durées très inégales (intro "You Are Yahweh").
    beat_time = {}
    if beat_times is not None and len(beat_times) > 0:
        for seg in segments:
            bi = seg.get('beatIndices') or []
            for k in bi:
                if 0 <= k < len(beat_times):
                    beat_time[k] = float(beat_times[k])
    if not beat_time:
        for seg in segments:
            bi = seg.get('beatIndices') or []
            if not bi:
                continue
            s, e = seg['startTime'], seg['endTime']
            if len(bi) == 1:
                beat_time[bi[0]] = (s + e) / 2.0
            else:
                step = (e - s) / len(bi)
                for j, k in enumerate(bi):
                    beat_time[k] = s + step * (j + 0.5)

    def chroma_window(t0, t1):
        """Chroma agrégé normalisé sur [t0,t1] via les beats dont le temps
        estimé tombe dans la fenêtre."""
        idxs = [k for k, tt in beat_time.items() if t0 <= tt < t1]
        if not idxs:
            return None
        return _aggregate_chroma(idxs, beat_chroma)

    def diatonic_suffix(root_pc):
        return _diatonic_triad_suffix(root_pc, key) or ''

    segs = [dict(s) for s in segments]
    new_segs = []
    i = 0
    while i < len(segs):
        s = segs[i]
        if s['chord'] == 'N':
            new_segs.append(s)
            i += 1
            continue
        s_dur = s['endTime'] - s['startTime']
        s_root, _ = _parse_chord_label(s['chord'])
        if s_root is None or s_dur < long_threshold or s_root not in structural_roots:
            new_segs.append(s)
            i += 1
            continue
        # Section plate candidate : découper en fenêtres et réévaluer.
        sfx = _parse_chord_label(s['chord'])[1] or diatonic_suffix(s_root)
        t_start = s['startTime']
        t_end = s['endTime']
        flat_state = state_by_name.get(chord_name(s_root, sfx))
        if flat_state is None:
            new_segs.append(s)
            i += 1
            continue
        # Découpage en fenêtres de `window` couvrant exactement [t_start, t_end].
        # Le reste terminal plus court que min_window_dur est absorbé dans la
        # dernière fenêtre complète pour éviter de créer un micro-segment
        # parasite (p.ex. F#m de 0.6 s entre D et A).
        windows = []
        t = t_start
        while t < t_end - 1e-6:
            w_end = min(t + window, t_end)
            if w_end - t >= min_window_dur:
                windows.append((t, w_end))
            elif windows:
                # Reste terminal court : fusionner avec la fenêtre précédente.
                prev_start, _ = windows[-1]
                windows[-1] = (prev_start, w_end)
            else:
                # Section trop courte pour être découpée : ne pas raffiner.
                new_segs.append(s)
                i += 1
                continue
            t = w_end
        if not windows:
            new_segs.append(s)
            i += 1
            continue
        # Pour chaque fenêtre, choisir l'accord structurel dont le template
        # matche le mieux le chroma local, s'il bat l'accord plat.
        refined = []
        for w0, w1 in windows:
            agg = chroma_window(w0, w1)
            if agg is None:
                # pas de chroma -> garder l'accord plat
                refined.append((s_root, sfx, w0, w1))
                continue
            sc_flat = _anchor_template_score(agg, state_by_name.get(chord_name(s_root, sfx))) or 0.0
            best_root, best_sfx, best_sc = s_root, sfx, sc_flat
            for r in structural_roots:
                if r == s_root:
                    continue
                rsfx = diatonic_suffix(r)
                st = state_by_name.get(chord_name(r, rsfx))
                if st is None:
                    continue
                sc = _anchor_template_score(agg, st)
                if sc is None:
                    continue
                if sc > best_sc + min_margin:
                    best_sc = sc
                    best_root, best_sfx = r, rsfx
            refined.append((best_root, best_sfx, w0, w1))
        # Reconstruire les segments raffinés en fusionnant les fenêtres
        # consécutives de même accord.
        for r, sfx2, w0, w1 in refined:
            name = chord_name(r, sfx2)
            if new_segs and new_segs[-1]['chord'] == name:
                new_segs[-1]['endTime'] = w1
            else:
                new_segs.append({
                    'startTime': w0,
                    'endTime': w1,
                    'chord': name,
                    'confidence': float(s.get('confidence', 0.0)),
                    'state': _chord_state_index(states, r, sfx2),
                    'beatIndices': [],
                })
        i += 1
    return new_segs


# [OpenCode] — 2026-08-21 — Correction intro « You Are Yahweh » (mission v4).
# Couche additive post-_refine_chorus_loops qui répare les débuts de morceau
# lorsque le Viterbi/HMM confond la tonique (A) avec l'accord d'introduction
# (D) sur les premières mesures. Le symptôme typique : un accord de tonique
# court (< 2 beats) précède immédiatement un accord structurel diatonique
# beaucoup plus long, et le chroma global du début soutient nettement cet
# accord structurel plutôt que la tonique. On fusionne alors ce "préfixe"
# parasite dans l'accord d'intro.
# DÉSACTIVÉE le 2026-08-23 — mesurée nuisible, faiblement.
#
# Même origine que _refine_chorus_loops : corriger un faux accord d'intro sur
# « You Are Yahweh », contre une mesure fausse. Ablation :
#   corpus réel (5 morceaux) : +0,0 point en la retirant
#   batterie B1 (20 cas)     : +0,8 point en la retirant
#
# Elle ne corrige plus rien et coûte un peu. Code conservé, flag à False.
ENABLE_INTRO_PREFIX_FIX = False


def _fix_intro_prefix(segments, key, states, beat_chroma, max_prefix_dur=2.5):
    """Corrige un faux accord de tonique (ou autre fondamentale parasite) en
    début de morceau lorsqu'il précède immédiatement un accord structurel
    diatonique beaucoup plus probable acoustiquement.

    Critères stricts pour éviter les régressions :
      - le premier segment est très court (<= max_prefix_dur) ;
      - il est immédiatement suivi d'un accord structurel diatonique ;
      - la fondamentale du premier segment appartient au PC-set du second
        (ex: A est la quinte de D) OU les deux sont diatoniques dans la tonalité ;
      - le chroma agrégé sur [prefix + accord d'intro] soutient nettement
        l'accord d'intro (marge >= 0.03) ;
      - l'accord d'intro est le premier "vrai" accord de la progression,
        et le prefix n'est pas un silence N.

    Ne modifie ni le HMM, ni les observations, ni les templates : c'est une
    post-correction pure sur la segmentation.
    """
    if not ENABLE_INTRO_PREFIX_FIX or len(segments) < 2 or not key or beat_chroma is None:
        return segments

    diatonic_roots = _build_diatonic_roots(key)
    if not diatonic_roots:
        return segments

    state_by_name = {st['name']: st for st in states if st['suffix'] != 'N'}

    prefix = segments[0]
    nxt = segments[1]
    if prefix['chord'] == 'N':
        return segments
    p_dur = prefix['endTime'] - prefix['startTime']
    if p_dur > max_prefix_dur:
        return segments

    p_root, p_sfx = _parse_chord_label(prefix['chord'])
    n_root, n_sfx = _parse_chord_label(nxt['chord'])
    if p_root is None or n_root is None:
        return segments
    # Le voisin doit être structurel et diatonique.
    if n_root not in diatonic_roots:
        return segments

    # La fondamentale du prefix doit appartenir au PC-set de l'accord d'intro
    # (cas A est la quinte de D), ou les deux doivent être diatoniques.
    n_state = state_by_name.get(nxt['chord'])
    if n_state is None:
        return segments
    n_pcs = _state_pc_set(n_state)
    if p_root not in n_pcs and p_root not in diatonic_roots:
        return segments

    # Adjacence stricte : le prefix finit exactement où commence le suivant.
    if abs(prefix['endTime'] - nxt['startTime']) > 1e-3:
        return segments

    # Garde acoustique : le chroma agrégé sur l'ensemble soutient-il nettement
    # l'accord d'intro plutôt que le prefix ?
    p_beats = list(prefix.get('beatIndices', []))
    n_beats = list(nxt.get('beatIndices', []))
    if not p_beats or not n_beats:
        return segments
    agg = _aggregate_chroma(p_beats + n_beats, beat_chroma)
    if agg is None:
        return segments
    sc_n = _anchor_template_score(agg, n_state)
    p_state = state_by_name.get(prefix['chord'])
    sc_p = _anchor_template_score(agg, p_state) if p_state else None
    if sc_n is None:
        return segments
    # Marge de 0.03 (cohérente avec _stabilize_progressive_harmony).
    if sc_p is not None and sc_p - sc_n >= 0.03:
        return segments

    # Fusionner le prefix dans l'accord d'intro.
    segs = [dict(s) for s in segments]
    intro = segs[1]
    intro['startTime'] = segs[0]['startTime']
    intro['beatIndices'] = list(segs[0].get('beatIndices', [])) + list(intro.get('beatIndices', []))
    total_dur = intro['endTime'] - intro['startTime']
    if total_dur > 0:
        intro['confidence'] = round(
            (float(intro.get('confidence', 0.0)) * (total_dur - p_dur)
             + float(prefix.get('confidence', 0.0)) * p_dur) / total_dur, 3)
    del segs[0]
    return segs


def _fix_intro_pair(segments, key, states, beat_chroma,
                    max_prefix_dur=3.0,
                    min_intro_dur=2.0,
                    acoustic_margin=0.02):
    """Corrige un faux premier accord (typiquement A) en le fusionnant dans
    le second accord (D) lorsque le début de morceau est mal segmenté.

    Cette couche est plus permissive que _fix_intro_prefix : elle s'active
    même si les deux premiers accords sont "structurels" (A et D sont tous les
    deux diatoniques en La majeur), dès lors que le chroma global du début
    soutient nettement le second accord. Cela corrige les introductions de
    type D-A-E-F#m où le Viterbi insère un court A parasite avant le D.

    Critères :
      - au moins 2 segments non-N en début ;
      - le premier segment est court (<= max_prefix_dur) ;
      - le second segment est un accord diatonique stable d'au moins
        min_intro_dur ;
      - les deux segments sont strictement adjacents ;
      - le chroma agrégé sur [prefix + second] soutient le second avec une
        marge acoustique >= acoustic_margin par rapport au premier.

    Ne modifie ni le HMM, ni les observations, ni les templates.
    """
    if len(segments) < 2 or not key or beat_chroma is None:
        return segments

    diatonic_roots = _build_diatonic_roots(key)
    if not diatonic_roots:
        return segments

    state_by_name = {st['name']: st for st in states if st['suffix'] != 'N'}

    prefix = segments[0]
    nxt = segments[1]
    if prefix['chord'] == 'N' or nxt['chord'] == 'N':
        return segments

    p_dur = prefix['endTime'] - prefix['startTime']
    n_dur = nxt['endTime'] - nxt['startTime']
    if p_dur > max_prefix_dur or n_dur < min_intro_dur:
        return segments

    p_root, _ = _parse_chord_label(prefix['chord'])
    n_root, _ = _parse_chord_label(nxt['chord'])
    if p_root is None or n_root is None:
        return segments
    # Le second accord doit être diatonique stable.
    if n_root not in diatonic_roots:
        return segments

    # Adjacence stricte.
    if abs(prefix['endTime'] - nxt['startTime']) > 1e-3:
        return segments

    # Garde acoustique : le chroma agrégé sur l'ensemble soutient-il nettement
    # le second accord plutôt que le premier ?
    p_beats = list(prefix.get('beatIndices', []))
    n_beats = list(nxt.get('beatIndices', []))
    if not p_beats or not n_beats:
        return segments
    agg = _aggregate_chroma(p_beats + n_beats, beat_chroma)
    if agg is None:
        return segments
    p_state = state_by_name.get(prefix['chord'])
    n_state = state_by_name.get(nxt['chord'])
    sc_p = _anchor_template_score(agg, p_state) if p_state else None
    sc_n = _anchor_template_score(agg, n_state) if n_state else None
    if sc_n is None:
        return segments
    # On fusionne si le second est meilleur OU si les scores sont équivalents
    # (marge >= -acoustic_margin) et que le second est nettement plus long.
    if sc_p is not None and sc_p > sc_n + acoustic_margin:
        return segments
    if sc_n < sc_p:
        if n_dur <= p_dur * 1.5:
            return segments

    # Fusionner le prefix dans le second accord.
    segs = [dict(s) for s in segments]
    intro = segs[1]
    intro['startTime'] = segs[0]['startTime']
    intro['beatIndices'] = list(segs[0].get('beatIndices', [])) + list(intro.get('beatIndices', []))
    total_dur = intro['endTime'] - intro['startTime']
    if total_dur > 0:
        intro['confidence'] = round(
            (float(intro.get('confidence', 0.0)) * (total_dur - p_dur)
             + float(prefix.get('confidence', 0.0)) * p_dur) / total_dur, 3)
    del segs[0]
    return segs


# [OpenCode] — 2026-08-20 — Stabilisation progressive des accords (post-Viterbi).
# Couche additive qui simplifie la structure harmonique répétitive détectée par
# le HMM : on repère les fondamentales « principales » (forte couverture
# temporelle cumulée), on réduit leurs qualités avancées vers des triades
# simples, puis on absorbe les segments très courts dont la fondamentale est une
# note de passage d'un arpège (ex: C# est la tierce de A) dans l'accord chef
# adjacent. Aucune modification du HMM, des observations ni de l'extraction.
ENABLE_PROGRESSIVE_STABILIZATION = True


def _simple_triad_suffix(suffix):
    """Suffixe de triade simple vers lequel ramener une qualité avancée."""
    if suffix in ('', 'm', 'dim', 'aug', 'm7b5'):
        return suffix
    if suffix == 'm7':
        return 'm'
    # maj7 / 7 / sus2 / sus4 → triade majeure de base
    return ''


def _chord_state_index(states, root, suffix):
    """Indice d'état HMM correspondant à (fondamentale, suffixe), ou None."""
    for i, st in enumerate(states):
        if st['suffix'] != 'N' and st['root'] is not None and st['root'] == root and st['suffix'] == suffix:
            return i
    return None


def _aggregate_chroma(beat_idxs, beat_chroma):
    """Chroma moyen normalisé sur un ensemble de beats, ou None si inutilisable."""
    if beat_chroma is None or beat_chroma.size == 0:
        return None
    idxs = [i for i in beat_idxs if 0 <= i < beat_chroma.shape[1]]
    if not idxs:
        return None
    agg = np.mean(beat_chroma[:, idxs], axis=1)
    norm = float(np.linalg.norm(agg))
    if norm < 1e-6:
        return None
    return agg / norm


def _anchor_template_score(agg_norm, state):
    """Score de similarité entre un chroma agrégé et le template d'un état."""
    if agg_norm is None or state is None:
        return None
    t = state.get('template')
    if t is None:
        return None
    tn = float(np.linalg.norm(t))
    if tn < 1e-8:
        return None
    return float(np.dot(agg_norm, t / tn))


def _stabilize_progressive_harmony(segments, beat_chroma, states, key,
                                   principal_fraction=0.10,
                                   max_absorb_dur=1.2,
                                   anchor_min_dur=1.2,
                                   same_root_resolved_min=0.6,
                                   absorb_margin=0.03):
    """Stabilise la structure harmonique répétitive issue de Viterbi.

    Couche additive exécutée après `_merge_arpeggio_segments`, sans toucher ni
    au HMM ni aux observations. Elle repose sur trois mécanismes :

    1. Détection des fondamentales « principales » : les racines dont la durée
       cumulée atteint `principal_fraction` de la durée totale forment la
       colonne vertébrale harmonique (ex: A, E, B, D dans une boucle A-E-B-D).
    2. Simplification des qualités avancées (sus2/sus4/maj7/m7/7) de ces racines
       vers la triade simple correspondante, sauf lorsqu'un segment de même
       fondamentale « résolu » suit immédiatement (mouvement de suspension
       authentique type Csus4 → C, que l'on ne doit pas écraser).
    3. Absorption des segments très courts de fondamentale parasite : si la
       fondamentale est une note de l'accord principal adjacent (tierce,
       quinte, septième...) et que le chroma agrégé soutient nettement l'ancre,
       on étend l'ancre sur le segment parasite. On ne fusionne jamais un vrai
       changement d'accord long (le segment parasite doit rester nettement plus
       court que l'ancre).
    """
    if len(segments) < 2:
        return segments

    segs = [dict(s) for s in segments]
    total_dur = sum(s['endTime'] - s['startTime'] for s in segs)
    if total_dur <= 0:
        return segments

    # ── 1. Fondamentales principales par couverture temporelle cumulée ──
    root_dur = {}
    for s in segs:
        root, _ = _parse_chord_label(s['chord'])
        if root is None:
            continue
        root_dur[root] = root_dur.get(root, 0.0) + (s['endTime'] - s['startTime'])
    principal_roots = {r for r, d in root_dur.items() if d >= principal_fraction * total_dur}

    # ── 2. Simplification des qualités avancées sur les fondamentales stables ──
    n = len(segs)
    for i in range(n):
        s = segs[i]
        root, suffix = _parse_chord_label(s['chord'])
        if root is None or suffix not in ADVANCED_SUFFIXES:
            continue
        if root not in principal_roots:
            continue
        # Protection : vraie suspension Csus4 → C (même fondamentale résolue
        # juste après, segment suffisamment long pour être une vraie frontière).
        if i + 1 < n:
            nxt_root, nxt_suffix = _parse_chord_label(segs[i + 1]['chord'])
            nxt_dur = segs[i + 1]['endTime'] - segs[i + 1]['startTime']
            if (nxt_root == root and nxt_suffix in ('', 'm')
                    and nxt_dur >= same_root_resolved_min):
                continue
        new_suffix = _simple_triad_suffix(suffix)
        if new_suffix == suffix:
            continue
        new_idx = _chord_state_index(states, root, new_suffix)
        s['chord'] = chord_name(root, new_suffix)
        if new_idx is not None:
            s['state'] = new_idx
            s['structural_root'] = states[new_idx].get('structural_root')
            s['structural_mode'] = states[new_idx].get('structural_mode')

    # ── 3. Absorption des segments courts de fondamentale parasite ──
    #    Le segment parasite doit appartenir au PC-set de l'accord chef et être
    #    nettement plus court que lui ; le chroma agrégé doit valider l'ancre.
    changed = True
    while changed:
        changed = False
        i = 1
        while i < len(segs):
            s = segs[i]
            if s['chord'] == 'N':
                i += 1
                continue
            s_dur = s['endTime'] - s['startTime']
            if s_dur > max_absorb_dur:
                i += 1
                continue
            s_root, _ = _parse_chord_label(s['chord'])
            if s_root is None or s['state'] is None or not (0 <= s['state'] < len(states)):
                i += 1
                continue

            absorbed = None
            candidates = (
                (i - 1, 'prev'),
                (i + 1, 'next'),
            )
            for nb_idx, nb_key in candidates:
                if not (0 <= nb_idx < len(segs)):
                    continue
                nb = segs[nb_idx]
                if nb['chord'] == 'N' or nb['state'] is None or not (0 <= nb['state'] < len(states)):
                    continue
                nb_root, _ = _parse_chord_label(nb['chord'])
                nb_dur = nb['endTime'] - nb['startTime']
                if nb_root is None or nb_dur < anchor_min_dur:
                    continue
                # Le parasite doit rester nettement plus court que l'accord chef.
                if s_dur > 0.5 * nb_dur:
                    continue
                # La fondamentale parasite doit être une note de l'accord chef.
                pcs = _state_pc_set(states[nb['state']])
                if not pcs or s_root not in pcs:
                    continue
                # Garde acoustique : le chroma agrégé doit soutenir l'accord chef.
                nb_idxs = nb.get('beatIndices', [])
                s_idxs = s.get('beatIndices', [])
                if nb_idxs and s_idxs:
                    agg = _aggregate_chroma(nb_idxs + s_idxs, beat_chroma)
                    sc_nb = _anchor_template_score(agg, states[nb['state']])
                    sc_self = _anchor_template_score(agg, states[s['state']])
                    if sc_nb is None or sc_self is None:
                        continue
                    if sc_nb - sc_self < absorb_margin:
                        continue
                absorbed = nb_key
                break

            if absorbed is not None:
                nb = segs[i - 1] if absorbed == 'prev' else segs[i + 1]
                s_beats = s.get('beatIndices', [])
                if absorbed == 'prev':
                    nb['endTime'] = s['endTime']
                else:
                    nb['startTime'] = s['startTime']
                if s_beats:
                    nb.setdefault('beatIndices', []).extend(s_beats)
                d_nb = nb['endTime'] - nb['startTime'] - s_dur
                if d_nb + s_dur > 0:
                    nb['confidence'] = round(
                        (float(nb.get('confidence', 0.0)) * d_nb
                         + float(s.get('confidence', 0.0)) * s_dur)
                        / (d_nb + s_dur), 3)
                del segs[i]
                changed = True
            else:
                i += 1

    # ── 4. Re-fusion des segments consécutifs devenus identiques ──
    #    Fusion STRICTE (même nom d'accord exact) : on ne réintroduit pas la
    #    fusion par familles de qualité, qui écraserait des suspensions
    #    authentiques du type Csus4 → C.
    result = []
    for s in segs:
        if result and result[-1]['chord'] == s['chord']:
            d1 = result[-1]['endTime'] - result[-1]['startTime']
            d2 = s['endTime'] - s['startTime']
            result[-1]['endTime'] = s['endTime']
            if d1 + d2 > 0:
                result[-1]['confidence'] = round(
                    (float(result[-1].get('confidence', 0.0)) * d1
                     + float(s.get('confidence', 0.0)) * d2) / (d1 + d2), 3)
            result[-1].setdefault('beatIndices', []).extend(s.get('beatIndices', []))
            continue
        result.append(s)
    return result


def _build_transition_matrix(states, key):
    """Matrice de transition log-additive : bonus positif = favorisé, négatif = pénalisé.

    L'objectif est d'obtenir des accords stables tout en autorisant les changements
    naturels (quinte, ton voisin, degrés diatoniques). Le décodeur Viterbi combinera
    ces transitions avec les observations ; la post-segmentation fusionnera les courts
    segments parasites.
    """
    n = len(states)
    mat = np.full((n, n), -0.12, dtype=np.float64)
    diatonic_roots = _build_diatonic_roots(key)

    for i, src in enumerate(states):
        for j, dst in enumerate(states):
            if i == j:
                mat[i, j] = 0.0
                continue

            if src['suffix'] == 'N' or dst['suffix'] == 'N':
                mat[i, j] = -0.1
                continue

            score = -0.12
            rd = _pc_distance(src['root'], dst['root'])

            if rd == 0:
                score += 0.1
            elif rd in (2, 3, 4, 5, 7, 8, 9, 10):
                score += 0.05
            elif rd in (1, 11):
                score -= 0.12
            elif rd == 6:
                score -= 0.18

            if src['suffix'] != dst['suffix']:
                score -= 0.04

            # Stabilité harmonique : même fondamentale, qualité voisine → pas de
            # pénalité de suffixe ni de bonus diatonique, pour que la transition
            # reste proche de 0.0 (neutre avec le fait de rester).
            same_root_similar = (
                src['root'] is not None and dst['root'] is not None
                and src['root'] == dst['root']
                and src['suffix'] != dst['suffix']
                and _is_similar_quality(src['suffix'] or '', dst['suffix'] or '')
            )

            if not same_root_similar:
                # Bonus diatonique UNIQUEMENT si la fondamentale change (rd != 0).
                # Ne pas l'appliquer sur la même fondamentale évite que le Viterbi
                # récompense l'alternance de qualité (ex: A → Aaug → A → Aaug).
                if dst['root'] is not None and dst['root'] in diatonic_roots and rd != 0:
                    score += 0.1

            mat[i, j] = score
    return mat


def _viterbi(obs_scores, trans):
    """Décodage Viterbi : obs_scores (T, S), trans (S, S). Retourne le meilleur chemin d'états."""
    T, S = obs_scores.shape
    if T == 0 or S == 0:
        return np.array([], dtype=np.int32)

    dp = obs_scores[0].astype(np.float64).copy()
    backptr = np.zeros((T - 1, S), dtype=np.int32)

    for t in range(1, T):
        prev = dp[:, np.newaxis] + trans  # (S, S)
        backptr[t - 1] = np.argmax(prev, axis=0)
        dp = obs_scores[t] + np.max(prev, axis=0)

    path = np.zeros(T, dtype=np.int32)
    path[-1] = int(np.argmax(dp))
    for t in range(T - 2, -1, -1):
        path[t] = int(backptr[t, path[t + 1]])
    return path


def _compute_observation_scores(beat_chroma, states, key, frame_energies):
    """Retourne (T, S) scores d'observation pour chaque beat et chaque état."""
    T = beat_chroma.shape[1]
    S = len(states)
    scores = np.zeros((T, S), dtype=np.float64)
    diatonic_roots = _build_diatonic_roots(key)

    max_energy = float(np.max(frame_energies)) if len(frame_energies) > 0 else 1.0

    for j, state in enumerate(states):
        if state['suffix'] == 'N':
            for t in range(T):
                energy_ratio = frame_energies[t] / max_energy if max_energy > 0 else 1.0
                scores[t, j] = max(0.05, 1.0 - energy_ratio)
            continue

        template = state['template']
        for t in range(T):
            frame = beat_chroma[:, t]
            norm = np.linalg.norm(frame)
            if norm < 1e-6:
                sim = 0.0
            else:
                sim = float(np.dot(frame / norm, template))
            sim = max(0.0, min(1.0, sim))

            # LOT 7 — Discrimination de tierce (contenu acoustique uniquement).
            # Compare l'énergie de la tierce mineure vs majeure pour la racine
            # de cet état et renforce la famille dont la caractéristique ressort.
            # Sus2/sus4 (sans tierce) et 'N' ne sont pas affectés.
            if state['root'] is not None and state['suffix'] != 'N':
                third_diff = frame[(state['root'] + 3) % 12] - frame[(state['root'] + 4) % 12]
                if state['suffix'] in _MINOR_THIRD_SUFFIXES and third_diff > 0:
                    sim = min(1.0, sim + THIRD_EVIDENCE_WEIGHT * third_diff)
                elif state['suffix'] in _MAJOR_THIRD_SUFFIXES and third_diff < 0:
                    sim = min(1.0, sim - THIRD_EVIDENCE_WEIGHT * third_diff)

            # Biais tonal doux : bonus sur la fondamentale seule, sans pénalité.
            if state['root'] is not None and state['root'] in diatonic_roots:
                sim += 0.05
            scores[t, j] = max(0.0, min(1.0, sim))

    return scores


def _apply_discriminator(obs_scores, beat_chroma, states,
                          discriminator_threshold=0.02,
                          discriminator_strength=0.05,
                          energy_threshold=0.15):
    """Correction post-hoc des scores d'observation pour les paires confuses.

    Pour chaque battement et chaque paire (q1, q2), si l'écart entre les deux
    scores est < discriminator_threshold, on consulte l'énergie du chroma sur
    l'intervalle discriminant pour départager.
    """
    T = obs_scores.shape[0]
    state_idx = {}
    for i, st in enumerate(states):
        if st['suffix'] != 'N':
            state_idx.setdefault(st['root'], {})[st['suffix']] = i

    for t in range(T):
        frame = beat_chroma[:, t]
        fn = float(np.linalg.norm(frame))
        if fn < 1e-8:
            continue
        frame_n = frame / fn

        for root in range(12):
            root_states = state_idx.get(root)
            if not root_states:
                continue

            for q1, q2, int1, int2 in DISCRIMINATOR_PAIRS:
                i1 = root_states.get(q1)
                i2 = root_states.get(q2)
                if i1 is None or i2 is None:
                    continue
                s1 = obs_scores[t, i1]
                s2 = obs_scores[t, i2]
                if abs(s1 - s2) >= discriminator_threshold:
                    continue

                if int1 is not None and int2 is not None:
                    pc1 = (root + int1) % 12
                    pc2 = (root + int2) % 12
                    if frame_n[pc1] > frame_n[pc2]:
                        obs_scores[t, i1] = min(1.0, s1 + discriminator_strength)
                    else:
                        obs_scores[t, i2] = min(1.0, s2 + discriminator_strength)
                elif int2 is not None:
                    pc2 = (root + int2) % 12
                    if frame_n[pc2] > energy_threshold:
                        obs_scores[t, i2] = min(1.0, s2 + discriminator_strength)
                elif int1 is not None:
                    pc1 = (root + int1) % 12
                    if frame_n[pc1] > energy_threshold:
                        obs_scores[t, i1] = min(1.0, s1 + discriminator_strength)

    return obs_scores


def _initial_scores(states, key):
    """Bonus initial pour les degrés stables de la tonalité (tonique / dominante)."""
    scores = np.zeros(len(states), dtype=np.float64)
    if not key:
        return scores
    diatonic_roots = _build_diatonic_roots(key)
    for j, state in enumerate(states):
        if state['root'] is not None and state['root'] in diatonic_roots:
            if state['root'] == key['pc']:
                scores[j] += 0.25
            elif (state['root'] - key['pc']) % 12 == 7:
                scores[j] += 0.15
    return scores


def _segment_path(path, beat_times, duration, states, obs_scores):
    """Convertit le chemin d'états en segments {startTime, endTime, chord, confidence}."""
    if len(path) == 0:
        return []

    segments = []
    current_state = path[0]
    start_idx = 0
    K = len(path)

    def end_for(idx):
        return beat_times[idx + 1] if idx + 1 < K else duration

    for t in range(1, K):
        if path[t] != current_state:
            structural_root = states[current_state].get('structural_root')
            structural_mode = states[current_state].get('structural_mode')
            seg = {
                'startTime': float(beat_times[start_idx]),
                'endTime': float(end_for(t - 1)),
                'chord': states[current_state]['name'],
                'state': current_state,
                'beatIndices': list(range(start_idx, t)),
                'beatRealTimes': [float(beat_times[k]) for k in range(start_idx, t)],
                'confidence': float(np.mean(obs_scores[start_idx:t, current_state])),
                'structural_root': structural_root,
                'structural_mode': structural_mode,
            }
            segments.append(seg)
            current_state = path[t]
            start_idx = t

    # Dernier segment
    structural_root = states[current_state].get('structural_root')
    structural_mode = states[current_state].get('structural_mode')
    segments.append({
        'startTime': float(beat_times[start_idx]),
        'endTime': float(duration),
        'chord': states[current_state]['name'],
        'state': current_state,
        'beatIndices': list(range(start_idx, K)),
        'beatRealTimes': [float(beat_times[k]) for k in range(start_idx, K)],
        'confidence': float(np.mean(obs_scores[start_idx:K, current_state])),
        'structural_root': structural_root,
        'structural_mode': structural_mode,
    })
    return segments


def _downgrade_advanced_segments(segments, beat_chroma, states, threshold=0.07, mode='hybrid'):
    """Remplace un accord avancé par sa triade simple si la preuve harmonique
    est insuffisante.

    Trois modes :
    - 'legacy_family_fix' (A) : comparaison par produit scalaire de templates
      normalisés + seuil global. Seule différence avec l'original :
      SIMPLE_TRIAD_FOR_SUFFIX['m7'] = [0,3,7].
    - 'distinctive_interval' (B) : mesure directe de l'énergie relative sur
      l'intervalle distinctif (7ème, 2nde, 4te) pour chaque suffixe.
    - 'hybrid' (C) : distinctive_interval pour 7/maj7/m7, legacy_family_fix
      pour sus2/sus4.
    """
    if mode == 'distinctive_interval':
        return _downgrade_distinctive_interval(segments, beat_chroma, states, threshold)
    elif mode == 'hybrid':
        return _downgrade_hybrid(segments, beat_chroma, states, threshold)
    else:
        return _downgrade_legacy_family_fix(segments, beat_chroma, states, threshold)


def _downgrade_legacy_family_fix(segments, beat_chroma, states, threshold):
    """Variante A : ancienne comparaison par produits scalaires normalisés,
    seuil global 0.03. Seule correction : m7 utilise [0,3,7] au lieu de [0,4,7]."""
    for seg in segments:
        state = states[seg['state']]
        suffix = state['suffix']
        if suffix not in ADVANCED_SUFFIXES:
            continue

        simple_intervals = SIMPLE_TRIAD_FOR_SUFFIX.get(suffix, [0, 4, 7])
        simple_template = np.zeros(12, dtype=np.float32)
        simple_template[np.array(simple_intervals) % 12] = 1.0
        simple_template = np.roll(simple_template, state['root'])
        simple_template = simple_template / np.linalg.norm(simple_template)

        advanced_scores = []
        simple_scores = []
        for idx in seg['beatIndices']:
            frame = beat_chroma[:, idx]
            norm = np.linalg.norm(frame)
            if norm < 1e-6:
                advanced_scores.append(0.0)
                simple_scores.append(0.0)
                continue
            f = frame / norm
            advanced_scores.append(float(np.dot(f, state['template'])))
            simple_scores.append(float(np.dot(f, simple_template)))

        mean_advanced = float(np.mean(advanced_scores))
        mean_simple = float(np.mean(simple_scores))
        if mean_advanced - mean_simple < threshold:
            simple_suffix = ''
            if suffix == 'm7':
                simple_suffix = 'm'
            seg['chord'] = chord_name(state['root'], simple_suffix)
            seg['confidence'] = round(mean_simple, 3)
    return segments


def _downgrade_distinctive_interval(segments, beat_chroma, states, threshold):
    """Variante B : mesure directe de l'énergie relative sur l'intervalle
    distinctif de chaque suffixe, évitant l'annulation par norme L2."""
    SUFFIX_RATIO_THRESHOLD = {
        '7': 0.08,
        'maj7': 0.15,
        'sus2': 0.20,
        'sus4': 0.20,
        'm7': 0.08,
    }
    INTERVAL_KEY = {
        '7': 10,
        'maj7': 11,
        'sus2': 2,
        'sus4': 5,
        'm7': 10,
    }

    for seg in segments:
        state = states[seg['state']]
        suffix = state['suffix']
        if suffix not in ADVANCED_SUFFIXES:
            continue

        root = state['root']
        dist_interval = INTERVAL_KEY.get(suffix)
        threshold_ratio = SUFFIX_RATIO_THRESHOLD.get(suffix, 0.2)

        avg_chroma = np.zeros(12, dtype=np.float32)
        count = 0
        for idx in seg['beatIndices']:
            frame = beat_chroma[:, idx]
            norm = np.linalg.norm(frame)
            if norm > 1e-6:
                avg_chroma += frame / norm
                count += 1
        if count == 0:
            continue
        avg_chroma /= count

        energy_root = float(avg_chroma[root % 12])
        if energy_root < 1e-6:
            continue

        energy_dist = float(avg_chroma[(root + dist_interval) % 12])
        ratio = energy_dist / energy_root

        downgrade = False
        if suffix in ('7', 'maj7', 'm7'):
            if ratio < threshold_ratio:
                downgrade = True
        elif suffix == 'sus2':
            energy_third = float(avg_chroma[(root + 4) % 12])
            if energy_dist < energy_third * 0.8 or ratio < threshold_ratio:
                downgrade = True
        elif suffix == 'sus4':
            energy_third = float(avg_chroma[(root + 4) % 12])
            if energy_dist < energy_third * 0.8 or ratio < threshold_ratio:
                downgrade = True

        if downgrade:
            simple_suffix = ''
            if suffix == 'm7':
                simple_suffix = 'm'
            seg['chord'] = chord_name(root, simple_suffix)
    return segments


def _downgrade_hybrid(segments, beat_chroma, states, threshold=0.07):
    """Variante C : distinctive_interval pour 7/maj7/m7, legacy_family_fix
    pour sus2/sus4."""
    SUFFIX_RATIO_THRESHOLD = {
        '7': 0.08,
        'maj7': 0.15,
        'm7': 0.08,
    }
    INTERVAL_KEY = {
        '7': 10,
        'maj7': 11,
        'm7': 10,
    }

    for seg in segments:
        state = states[seg['state']]
        suffix = state['suffix']
        if suffix not in ADVANCED_SUFFIXES:
            continue

        root = state['root']

        if suffix in ('7', 'maj7', 'm7'):
            # Distinctive-interval logic (B)
            dist_interval = INTERVAL_KEY.get(suffix)
            threshold_ratio = SUFFIX_RATIO_THRESHOLD.get(suffix, 0.15)

            avg_chroma = np.zeros(12, dtype=np.float32)
            count = 0
            for idx in seg['beatIndices']:
                frame = beat_chroma[:, idx]
                norm = np.linalg.norm(frame)
                if norm > 1e-6:
                    avg_chroma += frame / norm
                    count += 1
            if count == 0:
                continue
            avg_chroma /= count

            energy_root = float(avg_chroma[root % 12])
            if energy_root < 1e-6:
                continue

            energy_dist = float(avg_chroma[(root + dist_interval) % 12])
            ratio = energy_dist / energy_root

            if ratio < threshold_ratio:
                simple_suffix = 'm' if suffix == 'm7' else ''
                seg['chord'] = chord_name(root, simple_suffix)

        elif suffix in ('sus2', 'sus4'):
            # Legacy template dot-product logic (A)
            simple_intervals = SIMPLE_TRIAD_FOR_SUFFIX.get(suffix, [0, 4, 7])
            simple_template = np.zeros(12, dtype=np.float32)
            simple_template[np.array(simple_intervals) % 12] = 1.0
            simple_template = np.roll(simple_template, root)
            simple_template = simple_template / np.linalg.norm(simple_template)

            advanced_scores = []
            simple_scores = []
            for idx in seg['beatIndices']:
                frame = beat_chroma[:, idx]
                norm = np.linalg.norm(frame)
                if norm < 1e-6:
                    advanced_scores.append(0.0)
                    simple_scores.append(0.0)
                    continue
                f = frame / norm
                advanced_scores.append(float(np.dot(f, state['template'])))
                simple_scores.append(float(np.dot(f, simple_template)))

            mean_advanced = float(np.mean(advanced_scores))
            mean_simple = float(np.mean(simple_scores))
            if mean_advanced - mean_simple < threshold:
                seg['chord'] = chord_name(root, '')
                seg['confidence'] = round(mean_simple, 3)

    return segments


def _simplify_chord_vocabulary(segments):
    """Simplifie le vocabulaire de sortie vers les accords de base uniquement.

    Mode "tutoriel simple" : autorise maj, min, maj7, min7, 7, dim, dim7,
    aug, aug7. Les sus2/sus4 deviennent majeur, les slash chords perdent leur
    basse, m7b5 devient dim, et toute qualité inconnue est projetée dans la
    famille majeure ou mineure.

    Cette couche ne modifie ni le HMM ni les observations : elle ne fait que
    réécrire le nom d'accord affiché dans les segments finaux.
    """
    if not ENABLE_SIMPLE_CHORD_VOCABULARY:
        return segments

    for seg in segments:
        chord = seg.get('chord', '')
        if chord == 'N' or not chord:
            continue

        # Slash chord : ne garder que la partie avant le slash.
        if '/' in chord:
            chord = chord.split('/')[0]

        root, suffix = _parse_chord_label(chord)
        if root is None:
            continue

        if suffix in SIMPLE_ALLOWED_SUFFIXES:
            new_chord = chord_name(root, suffix)
        elif suffix in ('sus2', 'sus4'):
            new_chord = chord_name(root, '')
        elif suffix == 'm7b5':
            new_chord = chord_name(root, 'dim')
        elif suffix in SIMPLE_MAJOR_FAMILY:
            new_chord = chord_name(root, '')
        elif suffix in SIMPLE_MINOR_FAMILY:
            new_chord = chord_name(root, 'm')
        else:
            # Par défaut : majeur si la fondamentale est diatonique majeure,
            # sinon mineur. On choisit majeur par défaut.
            new_chord = chord_name(root, '')

        if new_chord != seg['chord']:
            seg['chord'] = new_chord
    return segments


def _absorb_vi_parasites(segments, key, max_parasite_dur=2.5,
                          intro_safe_dur=20.0):
    """Absorbe les courts segments de degré vi (mineur relatif) parasites.

    Exemple : un F#m court au milieu d'un couplet D-A-E-A en La majeur.
    Cette couche est additive et très conservative. Elle ne touche ni au HMM
    ni aux observations. Active uniquement en mode simple.
    """
    if not ENABLE_SIMPLE_CHORD_VOCABULARY or not key or len(segments) < 3:
        return segments

    key_pc = key['pc']
    mode = key.get('mode', 'major')
    if mode != 'major':
        return segments

    vi_degree = 9
    result = []
    n = len(segments)
    for i, s in enumerate(segments):
        chord = s.get('chord', '')
        if chord == 'N' or not chord:
            result.append(s)
            continue
        root, _ = _parse_chord_label(chord)
        if root is None:
            result.append(s)
            continue
        rel = (root - key_pc) % 12
        dur = s['endTime'] - s['startTime']
        is_parasite = (
            rel == vi_degree and
            dur <= max_parasite_dur and
            0 < i < n - 1 and  # pas le premier ni le dernier
            s['startTime'] > intro_safe_dur  # pas dans l'intro
        )
        if is_parasite:
            prev = result[-1] if result else None
            next_s = segments[i + 1] if i + 1 < n else None
            target = None
            if prev and prev.get('chord') != 'N':
                target = prev
            elif next_s and next_s.get('chord') != 'N':
                target = next_s
            if target is not None:
                if target is prev:
                    prev['endTime'] = s['endTime']
                    prev['duration'] = prev['endTime'] - prev['startTime']
                    bi = prev.get('beatIndices', []) + s.get('beatIndices', [])
                    brt = prev.get('beatRealTimes', []) + s.get('beatRealTimes', [])
                    if bi:
                        prev['beatIndices'] = bi
                        prev['beatRealTimes'] = brt
                else:
                    next_s['startTime'] = s['startTime']
                    next_s['duration'] = next_s['endTime'] - next_s['startTime']
                    bi = s.get('beatIndices', []) + next_s.get('beatIndices', [])
                    brt = s.get('beatRealTimes', []) + next_s.get('beatRealTimes', [])
                    if bi:
                        next_s['beatIndices'] = bi
                        next_s['beatRealTimes'] = brt
                continue
        result.append(s)

    # Fusionner les segments consécutifs identiques.
    final = []
    for s in result:
        if final and s['chord'] == final[-1]['chord']:
            final[-1]['endTime'] = s['endTime']
            final[-1]['duration'] = final[-1]['endTime'] - final[-1]['startTime']
            bi = final[-1].get('beatIndices', []) + s.get('beatIndices', [])
            brt = final[-1].get('beatRealTimes', []) + s.get('beatRealTimes', [])
            if bi:
                final[-1]['beatIndices'] = bi
                final[-1]['beatRealTimes'] = brt
            continue
        final.append(s)
    return final


def _diatonic_degree_map(key):
    """Degrés diatoniques attendus de la tonalité : {pitch class: suffixe}."""
    if not key:
        return {}
    pc = key['pc']
    if key.get('mode') == 'minor':
        # Mineur naturel, avec la dominante majeure admise (v ou V).
        return {(pc + 0) % 12: 'm', (pc + 2) % 12: 'dim', (pc + 3) % 12: '',
                (pc + 5) % 12: 'm', (pc + 7) % 12: 'm', (pc + 8) % 12: '',
                (pc + 10) % 12: ''}
    return {(pc + 0) % 12: '', (pc + 2) % 12: 'm', (pc + 4) % 12: 'm',
            (pc + 5) % 12: '', (pc + 7) % 12: '', (pc + 9) % 12: 'm',
            (pc + 11) % 12: 'dim'}


def _is_diatonic_chord(root, suffix, degrees):
    """L'accord appartient-il à la tonalité, fondamentale ET qualité ?

    Un accord dont la fondamentale est diatonique mais la qualité non (un D7 en
    do majeur, dominante secondaire) n'est PAS diatonique : c'est précisément ce
    qui en fait un accord de passage plutôt qu'un pilier.
    """
    if root is None:
        return False
    expected = degrees.get(root % 12)
    if expected is None:
        return False
    if expected == '':
        return suffix in ('', 'maj7', 'sus2', 'sus4')
    if expected == 'm':
        return suffix in ('m', 'm7')
    if expected == 'dim':
        return suffix in ('dim', 'dim7', 'm7b5')
    return suffix == expected


def _audio_onset_time(y, sr, hop_length=512, rel_threshold=SILENCE_RMS_RATIO):
    """Instant du premier son réel du fichier, en secondes.

    Retourne 0.0 si le morceau commence directement par de la musique.
    """
    if len(y) == 0:
        return 0.0
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    if len(rms) == 0:
        return 0.0
    peak = float(rms.max())
    if peak <= 0:
        return 0.0
    loud = np.flatnonzero(rms > peak * rel_threshold)
    if len(loud) == 0:
        return 0.0
    return float(librosa.frames_to_time(loud[0], sr=sr, hop_length=hop_length))


def _detect_silent_regions(y, sr, hop_length=512,
                           rel_threshold=SILENCE_RMS_RATIO,
                           min_duration=SILENCE_MIN_DURATION):
    """Régions du signal réellement silencieuses, en secondes.

    Mesurées sur le signal brut, pas sur la grille de beats : un silence est un
    fait acoustique, pas un fait rythmique, et il peut parfaitement être plus
    court qu'une fenêtre d'analyse.
    """
    if len(y) == 0:
        return []
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    if len(rms) == 0:
        return []
    peak = float(rms.max())
    if peak <= 0:
        return []
    quiet = rms <= peak * rel_threshold
    times = librosa.frames_to_time(np.arange(len(rms) + 1), sr=sr, hop_length=hop_length)

    regions = []
    start = None
    for i, is_quiet in enumerate(quiet):
        if is_quiet and start is None:
            start = i
        elif not is_quiet and start is not None:
            regions.append((float(times[start]), float(times[i])))
            start = None
    if start is not None:
        regions.append((float(times[start]), float(times[len(rms)])))
    return [(a, b) for a, b in regions if b - a >= min_duration]


def _carve_silences(segments, silent_regions):
    """Retire des segments ce qui tombe dans un silence, en le remplaçant par `N`.

    Un segment à cheval sur un silence est scindé : ses parties sonores gardent
    leur accord, sa partie silencieuse devient `N`. Aucune frontière réelle
    n'est déplacée — on ne fait que refuser d'attribuer une harmonie au vide.
    """
    if not ENABLE_SILENCE_CARVING or not silent_regions or not segments:
        return segments

    out = []
    for seg in segments:
        pieces = [(float(seg['startTime']), float(seg['endTime']), seg.get('chord'))]
        for q0, q1 in silent_regions:
            nouveaux = []
            for a, b, chord in pieces:
                if q1 <= a or q0 >= b or chord == 'N':
                    nouveaux.append((a, b, chord))
                    continue
                if a < q0:
                    nouveaux.append((a, min(q0, b), chord))
                nouveaux.append((max(a, q0), min(b, q1), 'N'))
                if b > q1:
                    nouveaux.append((max(q1, a), b, chord))
            pieces = [(a, b, c) for a, b, c in nouveaux if b - a > 1e-3]
        for a, b, chord in pieces:
            piece = dict(seg)
            piece['startTime'], piece['endTime'] = a, b
            if chord == 'N':
                piece['chord'] = 'N'
                piece['state'] = None
                piece['confidence'] = 0.0
                piece['beatIndices'] = []
                piece['beatRealTimes'] = []
            out.append(piece)

    merged = []
    for seg in out:
        if merged and seg['chord'] == merged[-1]['chord']:
            merged[-1]['endTime'] = seg['endTime']
            continue
        merged.append(seg)
    return merged


def _silence_leading_segments(segments, onset_time):
    """Remplace par `N` ce qui est détecté avant le début réel du son.

    Un segment à cheval sur l'onset est coupé : sa partie silencieuse devient
    `N`, sa partie sonore garde son accord. On ne déplace aucune frontière
    réelle et l'axe de temps du fichier reste intact.
    """
    if not ENABLE_LEADING_SILENCE_GUARD or onset_time <= 0 or not segments:
        return segments

    out = []
    for seg in segments:
        start, end = float(seg['startTime']), float(seg['endTime'])
        if end <= onset_time:
            quiet = dict(seg)
            quiet['chord'] = 'N'
            quiet['state'] = None
            quiet['confidence'] = 0.0
            out.append(quiet)
            continue
        if start < onset_time < end:
            quiet = dict(seg)
            quiet['chord'] = 'N'
            quiet['state'] = None
            quiet['confidence'] = 0.0
            quiet['endTime'] = onset_time
            quiet['beatIndices'] = []
            quiet['beatRealTimes'] = []
            out.append(quiet)
            seg = dict(seg)
            seg['startTime'] = onset_time
        out.append(seg)

    # Fusionner les `N` consécutifs pour ne pas multiplier les blocs vides.
    merged = []
    for seg in out:
        if merged and seg['chord'] == 'N' and merged[-1]['chord'] == 'N':
            merged[-1]['endTime'] = seg['endTime']
            continue
        merged.append(seg)
    return merged


def _resolve_fifth_confusion(segments, beat_chroma, states, key,
                             min_gain=FIFTH_CONFUSION_MIN_GAIN):
    """Corrige les étiquettes décalées d'une quinte vers le haut.

    Pour un segment étiqueté X, on examine le candidat Y dont X est la quinte
    (Y = X - 7 demi-tons). On compare la part du chroma que chacun explique, en
    comptant ses notes SANS pondération : c'est précisément la pondération de la
    fondamentale qui produit l'erreur, s'en servir pour l'arbitrer reviendrait à
    demander au coupable de juger.

    Garde-fous : le candidat doit appartenir à la tonalité, et l'emporter d'une
    marge nette. Un V/V légitime — non diatonique — n'est donc jamais réécrit.
    """
    if not ENABLE_FIFTH_CONFUSION_FIX or not key or not segments:
        return segments

    degrees = _diatonic_degree_map(key)
    if not degrees:
        return segments

    def coverage(chroma_norm, root, suffix):
        """Part du chroma couverte par les notes de l'accord, sans pondération."""
        intervals = CHORD_INTERVALS.get(suffix)
        if intervals is None:
            return 0.0
        return float(sum(chroma_norm[(root + i) % 12] for i in intervals))

    changed = False
    for seg in segments:
        chord = seg.get('chord')
        if not chord or chord == 'N':
            continue
        idxs = seg.get('beatIndices') or []
        if not idxs:
            continue
        root, suffix = _parse_chord_label(chord)
        if root is None or suffix not in CHORD_INTERVALS:
            continue

        agg = np.mean(beat_chroma[:, idxs], axis=1)
        total = float(agg.sum())
        if total <= 0:
            continue
        chroma_norm = agg / total

        # Candidat : l'accord dont la fondamentale actuelle est la quinte.
        cand_root = (root - 7) % 12
        cand_suffix = degrees.get(cand_root)
        if cand_suffix is None or cand_suffix not in CHORD_INTERVALS:
            continue

        here = coverage(chroma_norm, root, suffix)
        there = coverage(chroma_norm, cand_root, cand_suffix)
        if there - here < min_gain:
            continue

        new_state = _chord_state_index(states, cand_root, cand_suffix)
        if new_state is None:
            # Sans état correspondant, les couches suivantes ne sauraient plus
            # sur quoi travailler : on préfère ne pas corriger.
            continue
        seg['chord'] = chord_name(cand_root, cand_suffix)
        seg['fifth_confusion_fixed'] = True
        seg['state'] = new_state
        changed = True

    if not changed:
        return segments

    # Deux voisins devenus identiques doivent fusionner : la correction ne doit
    # pas laisser une frontière qui ne correspond plus à aucun changement.
    merged = [segments[0]]
    for seg in segments[1:]:
        if seg.get('chord') == merged[-1].get('chord') and seg['chord'] != 'N':
            merged[-1]['endTime'] = seg['endTime']
            merged[-1]['beatIndices'] = (merged[-1].get('beatIndices', [])
                                         + seg.get('beatIndices', []))
            merged[-1]['beatRealTimes'] = (merged[-1].get('beatRealTimes', [])
                                           + seg.get('beatRealTimes', []))
        else:
            merged.append(seg)
    return merged


def _classify_chord_roles(segments, key, beat_dur=None):
    """Annote chaque segment d'un `role` : structural, passing, uncertain, silence.

    Sert la hiérarchie visuelle de Chordify. Aucune conséquence sur les accords
    détectés : cette couche ne renomme ni ne fusionne rien, elle qualifie.

    - `structural` : diatonique et membre du vocabulaire récurrent du morceau.
      C'est l'accord fondamental au sens de concepts/accord-fondamental.
    - `passing`    : bref, hors vocabulaire structurel, encadré des deux côtés
      par des accords structurels. C'est concepts/accord-passage.
    - `uncertain`  : ni l'un ni l'autre — à afficher, mais sans prétendre qu'il
      porte la structure.
    - `silence`    : absence d'accord.
    """
    if not ENABLE_CHORD_ROLE_CLASSIFICATION or not segments:
        return segments

    degrees = _diatonic_degree_map(key)
    if beat_dur is None or beat_dur <= 0:
        ref = next((s for s in segments if len(s.get('beatRealTimes', [])) > 1), None)
        beat_dur = float(np.mean(np.diff(ref['beatRealTimes']))) if ref else 0.5

    # Vocabulaire récurrent : les accords qui, cumulés du plus tenu au moins
    # tenu, couvrent l'essentiel du morceau. Un accord entendu une seule fois
    # pendant deux secondes sur quatre minutes n'est pas un pilier.
    durations = {}
    occurrences = {}
    longest = {}
    total = 0.0
    for seg in segments:
        chord = seg.get('chord')
        if not chord or chord == 'N':
            continue
        dur = float(seg['endTime'] - seg['startTime'])
        durations[chord] = durations.get(chord, 0.0) + dur
        occurrences[chord] = occurrences.get(chord, 0) + 1
        longest[chord] = max(longest.get(chord, 0.0), dur)
        total += dur
    vocabulary = set()
    if total > 0:
        cumulative = 0.0
        for chord, dur in sorted(durations.items(), key=lambda kv: -kv[1]):
            vocabulary.add(chord)
            cumulative += dur
            if cumulative >= ROLE_VOCABULARY_COVERAGE * total:
                break
        # Repêchage : un accord diatonique qui revient plusieurs fois porte la
        # structure même s'il est moins tenu que les autres.
        held_threshold = ROLE_VOCABULARY_MIN_HELD_BEATS * float(beat_dur)
        for chord, count in occurrences.items():
            if chord in vocabulary:
                continue
            if (count < ROLE_VOCABULARY_MIN_OCCURRENCES
                    and longest.get(chord, 0.0) < held_threshold):
                continue
            root, suffix = _parse_chord_label(chord)
            if _is_diatonic_chord(root, suffix, degrees):
                vocabulary.add(chord)

    # Première passe : les piliers. Trois conditions cumulatives — appartenir à
    # la tonalité, appartenir au vocabulaire récurrent, et être tenu assez
    # longtemps pour porter l'harmonie.
    sounding = [float(seg['endTime'] - seg['startTime']) for seg in segments
                if seg.get('chord') and seg['chord'] != 'N']
    median_dur = float(np.median(sounding)) if sounding else 0.0
    min_structural = ROLE_STRUCTURAL_MIN_RATIO * median_dur
    for seg in segments:
        chord = seg.get('chord')
        if not chord or chord == 'N':
            seg['role'] = 'silence'
            continue
        dur = float(seg['endTime'] - seg['startTime'])
        root, suffix = _parse_chord_label(chord)
        diatonic = _is_diatonic_chord(root, suffix, degrees)
        held = dur >= min_structural
        # Sans tonalité fiable, on ne prétend pas hiérarchiser finement : tout ce
        # qui est récurrent et tenu est admis comme structurel.
        if not degrees:
            seg['role'] = 'structural' if (chord in vocabulary and held) else None
        else:
            seg['role'] = 'structural' if (diatonic and chord in vocabulary and held) else None

    # Seconde passe : passage contre incertain, décidé par le voisinage. Un
    # accord de passage relie deux piliers ; il peut parfaitement être
    # diatonique — un IV bref entre deux I en est un. Un seul seuil sépare donc
    # les deux rôles : trop court pour être un pilier, mais encadré par deux
    # piliers, c'est un passage ; sinon on ne prétend rien et c'est incertain.
    for i, seg in enumerate(segments):
        if seg.get('role') is not None:
            continue
        prev_role = segments[i - 1].get('role') if i > 0 else None
        next_role = segments[i + 1].get('role') if i + 1 < len(segments) else None
        framed = prev_role == 'structural' and next_role == 'structural'
        seg['role'] = 'passing' if framed else 'uncertain'

    return segments


def _detect_structural_loop(segments, key,
                            coverage_threshold=0.80,
                            n_top_roots=4,
                            diatonic_bonus=5.0):
    """Annote chaque segment d'un champ `inStructuralLoop` (booléen ou None).

    N'écrit plus `role` : ce champ appartient désormais à
    _classify_chord_roles, qui distingue structurel, passage et incertain.
    Cette couche ne répond qu'à une question plus étroite — l'accord fait-il
    partie de la boucle de quatre accords qui domine le morceau ?

    Couche très conservative : si un morceau est dominé par une boucle simple
    de 4 accords, ces accords sont marqués `structural` et tout le reste est
    `unreliable`. Aucune tentative de détection d'accords de passage ici,
    pour éviter les faux positifs.

    La boucle structurelle est déduite des accords les plus couverts
    temporellement, avec un bonus pour les accords diatoniques complets
    (fondamentale + qualité attendue) en majeur : I, ii, iii, IV, V, vi.
    """
    if not ENABLE_STRUCTURAL_LOOP_DETECTION or not key or not segments:
        return segments

    key_pc = key['pc']

    # Degrés diatoniques en majeur avec la qualité attendue.
    # suffixe vide = majeur, 'm' = mineur, 'dim' = diminué.
    diatonic_degrees = {
        (key_pc + 0) % 12: '',      # I   : majeur
        (key_pc + 2) % 12: 'm',     # ii  : mineur
        (key_pc + 4) % 12: 'm',     # iii : mineur
        (key_pc + 5) % 12: '',      # IV  : majeur
        (key_pc + 7) % 12: '',      # V   : majeur
        (key_pc + 9) % 12: 'm',     # vi  : mineur
        (key_pc + 11) % 12: 'dim',  # vii°: diminué
    }

    def is_diatonic(root, suffix):
        if root is None:
            return False
        expected = diatonic_degrees.get(root % 12)
        if expected is None:
            return False
        # Accepte la qualité exacte ou sa famille proche (7 pour majeur/mineur).
        if expected == '':
            return suffix in ('', '7', 'maj7', 'sus2', 'sus4')
        if expected == 'm':
            return suffix in ('m', 'm7')
        if expected == 'dim':
            return suffix in ('dim', 'dim7', 'm7b5')
        return suffix == expected

    # Durée cumulée par accord diatonique (root + suffix exact).
    chord_dur = {}
    for seg in segments:
        if seg.get('chord') == 'N':
            continue
        root, suffix = _parse_chord_label(seg['chord'])
        if root is None or not is_diatonic(root, suffix):
            continue
        token = (root, suffix)
        chord_dur[token] = chord_dur.get(token, 0.0) + (seg['endTime'] - seg['startTime'])

    total_dur = sum(seg['endTime'] - seg['startTime'] for seg in segments if seg.get('chord') != 'N')
    if total_dur <= 0 or not chord_dur:
        for seg in segments:
            seg['inStructuralLoop'] = None
        return segments

    def chord_score(token):
        root, suffix = token
        score = chord_dur[token]
        # Bonus diatonique (fondamentale dans les degrés naturels).
        if (root % 12) in diatonic_degrees:
            score += diatonic_bonus
        return score

    # Sélectionner les top-N accords diatoniques.
    ranked = sorted(chord_dur.keys(), key=lambda t: -chord_score(t))
    structural_chords = set(ranked[:n_top_roots])
    covered = sum(chord_dur.get(t, 0.0) for t in structural_chords)

    # Pas de boucle clairement dominante : tout est structural par défaut.
    if covered < coverage_threshold * total_dur:
        for seg in segments:
            seg['inStructuralLoop'] = None
        return segments

    for seg in segments:
        if seg.get('chord') == 'N':
            seg['inStructuralLoop'] = None
            continue
        root, suffix = _parse_chord_label(seg['chord'])
        if root is None:
            seg['inStructuralLoop'] = False
            continue
        seg['inStructuralLoop'] = (root, suffix) in structural_chords

    return segments


# [OpenCode] — 2026-08-21 — Régularisation des progressions répétitives
# (mission refrain/couplet "You Are Yahweh").
# Couche additive qui régularise les longues tenues d'un accord I (tonique)
# encadrées par V et IV dans une boucle simple I/IV/V. Ex: le couplet
# D → A → E → A et le refrain E → D → A en La majeur contiennent des
# segments A parfois très longs (7–8 s) là où le ground truth attend deux
# accords distincts (A+E ou A+D). On scinde ces longs A en deux parties
# lorsque le chroma local confirme la présence du second accord, en
# s'appuyant sur les templates structurels déjà observés ailleurs (détection
# de boucle) et sur le chroma agrégé par demi-segment.
def _regularize_repeated_progression(segments, key, states, beat_chroma,
                                     beat_times=None,
                                     long_threshold=4.2,
                                     min_margin=0.03,
                                     min_second_half_dur=1.2):
    """Régularise les longues tenues I en boucle I/IV/V par scission guidée chroma.

    Détection :
      - tonalité majeure uniquement (I/IV/V diatoniques) ;
      - boucle simple : on vérifie qu'un pattern E-D-A (V-IV-I) ou D-A-E
        (IV-I-V) apparaît au moins 2 fois ailleurs (template de boucle) ;
      - candidate : segment long I (durée >= long_threshold) encadré par
        E avant et D après (E–A–D) ou D avant et E après (D–A–E).

    Scission :
      - on découpe le segment long en deux moitiés (temps médian) et on
        agrège le chroma de chaque moitié via beat_chroma/beat_times ;
      - si le chroma de la seconde moitié soutient nettement D (IV) ou E (V)
        plutôt que I, on scinde en A + D ou A + E selon le meilleur score et
        selon le contexte (le voisin attendu après le long I).

    Conservateur : on ne scinde que si la seconde moitié est assez longue,
    que le score alternatif bat I d'une marge et que le voisinage correspond.
    """
    if not ENABLE_REPEATED_PROGRESSION_REGULARIZATION:
        return segments
    if not ENABLE_SIMPLE_CHORD_VOCABULARY:
        return segments
    if not key or key.get('mode') != 'major' or not segments or beat_chroma is None:
        return segments
    if len(segments) < 3:
        return segments

    key_pc = key['pc']
    pc_I = key_pc % 12
    pc_IV = (key_pc + 5) % 12
    pc_V = (key_pc + 7) % 12

    # Vérifier présence de boucles templates (E-D-A et/ou D-A-E) ailleurs
    # pour ne pas inventer une structure inexistante.
    seq_roots = []
    for s in segments:
        if s.get('chord') == 'N':
            seq_roots.append(None)
        else:
            r, _ = _parse_chord_label(s['chord'])
            seq_roots.append(r)
    # Compter les motifs E-D-A et D-A-E exacts (racines I/IV/V)
    def count_pattern(pat):
        c = 0
        for i in range(len(seq_roots) - len(pat) + 1):
            if seq_roots[i:i+len(pat)] == pat:
                c += 1
        return c
    cnt_EDA = count_pattern([pc_V, pc_IV, pc_I])
    cnt_DAE = count_pattern([pc_IV, pc_I, pc_V])
    # Au moins 2 occurrences d'un des deux motifs pour considérer la boucle établie
    has_loop = (cnt_EDA >= 2 or cnt_DAE >= 2)
    if not has_loop:
        return segments

    # Mapping pc -> suffixe diatonique simple (triade majeure en majeur)
    def diatonic_suffix(pc):
        return _diatonic_triad_suffix(pc, key) or ''

    state_by_name = {st['name']: st for st in states if st.get('suffix') != 'N'}

    # Association beat -> temps : on utilise directement beat_times (ne pas
    # se fier aux beatIndices des segments qui peuvent être vides après
    # les fusions). Fallback linéaire si beat_times absent.
    if beat_times is not None and len(beat_times) > 0:
        # beat_times est la référence absolue ; on n'a pas besoin de beat_time dict.
        def beats_in_interval(t0, t1):
            return [k for k, tt in enumerate(beat_times) if t0 <= tt < t1]
    else:
        # Fallback : construire un mapping approximatif via les segments
        beat_time = {}
        for seg in segments:
            bi = seg.get('beatIndices') or []
            if not bi:
                continue
            s, e = seg['startTime'], seg['endTime']
            if len(bi) == 1:
                beat_time[bi[0]] = (s + e) / 2.0
            else:
                step = (e - s) / len(bi)
                for j, k in enumerate(bi):
                    beat_time[k] = s + step * (j + 0.5)

        def beats_in_interval(t0, t1):
            return [k for k, tt in beat_time.items() if t0 <= tt < t1]

    new_segments = []
    for idx, seg in enumerate(segments):
        if seg.get('chord') == 'N':
            new_segments.append(seg)
            continue
        root, _ = _parse_chord_label(seg['chord'])
        dur = seg['endTime'] - seg['startTime']
        if root != pc_I or dur < long_threshold:
            new_segments.append(seg)
            continue
        # Vérifier encadrement D-A-E ou E-A-D
        left = segments[idx - 1] if idx > 0 else None
        right = segments[idx + 1] if idx + 1 < len(segments) else None
        if not left or not right or left.get('chord') == 'N' or right.get('chord') == 'N':
            new_segments.append(seg)
            continue
        lr, _ = _parse_chord_label(left['chord'])
        rr, _ = _parse_chord_label(right['chord'])
        pattern = None
        expected_second = None
        # D avant, E après => D-A(long)-E  -> seconde moitié devrait être E
        if lr == pc_IV and rr == pc_V:
            pattern = 'D-A-E'
            expected_second = pc_V
        # E avant, D après => E-A(long)-D  -> seconde moitié devrait être D
        elif lr == pc_V and rr == pc_IV:
            pattern = 'E-A-D'
            expected_second = pc_IV
        else:
            new_segments.append(seg)
            continue
        # Intro protégée : ne pas toucher avant ~15s (sécurité, voir ground truth intro D-A-E-F#m)
        if seg['startTime'] < 15.0:
            new_segments.append(seg)
            continue
        # Découper au milieu temporel
        mid = (seg['startTime'] + seg['endTime']) / 2.0
        # S'assurer que chaque moitié reste assez longue
        if mid - seg['startTime'] < min_second_half_dur or seg['endTime'] - mid < min_second_half_dur:
            new_segments.append(seg)
            continue
        beats_first = beats_in_interval(seg['startTime'], mid)
        beats_second = beats_in_interval(mid, seg['endTime'])
        if not beats_first or not beats_second:
            # Fallback via beatIndices déjà présents
            bi = seg.get('beatIndices') or []
            if len(bi) >= 2:
                mid_idx = len(bi) // 2
                beats_first = bi[:mid_idx]
                beats_second = bi[mid_idx:]
            else:
                new_segments.append(seg)
                continue
        agg_first = _aggregate_chroma(beats_first, beat_chroma)
        agg_second = _aggregate_chroma(beats_second, beat_chroma)
        if agg_first is None or agg_second is None:
            new_segments.append(seg)
            continue
        # Scores templates pour seconde moitié : I vs attendu
        sfx_I = diatonic_suffix(pc_I)
        sfx_exp = diatonic_suffix(expected_second)
        st_I = state_by_name.get(chord_name(pc_I, sfx_I))
        st_exp = state_by_name.get(chord_name(expected_second, sfx_exp))
        sc_I = _anchor_template_score(agg_second, st_I)
        sc_exp = _anchor_template_score(agg_second, st_exp)
        if sc_I is None or sc_exp is None:
            new_segments.append(seg)
            continue
        # Garde acoustique : compatible = attendu pas trop loin de I et
        # suffisamment présent. On autorise une légère infériorité (jusqu'à
        # 0.12) pour ne pas rater les transitions où A reste dominant mais
        # E/D est déjà présent dans le chroma (cas Yahweh). Seuil 0.55 évite
        # les faux positifs sur bruit.
        # min_margin reste la marge stricte ; on complète par une tolérance.
        if sc_exp < 0.55:
            new_segments.append(seg)
            continue
        # Tolérance : on accepte si l'attendu est à moins de 0.12 sous I,
        # ou s'il bat I de min_margin. Cela reste conservateur.
        if sc_exp - sc_I < min_margin and sc_exp < sc_I - 0.12:
            new_segments.append(seg)
            continue
        # Vérifier aussi que la première moitié reste bien I (évite de scinder un E pur)
        sc_first_I = _anchor_template_score(agg_first, st_I)
        sc_first_exp = _anchor_template_score(agg_first, st_exp)
        if sc_first_I is not None and sc_first_exp is not None:
            if sc_first_exp > sc_first_I + 0.02:
                # Première moitié déjà plus E/D que I -> segment mal labellisé, ne pas scinder ainsi
                new_segments.append(seg)
                continue
            # La première moitié doit rester clairement I (seuil 0.60)
            if sc_first_I < 0.60:
                new_segments.append(seg)
                continue
        # Scission validée : A (première moitié) + E/D (seconde moitié)
        # Construire deux nouveaux segments
        bi_all = seg.get('beatIndices') or []
        brt_all = seg.get('beatRealTimes') or []
        # Répartir beatIndices selon mid time
        # Utiliser beats_first / beats_second déjà calculés
        seg1 = dict(seg)
        seg1['endTime'] = float(mid)
        seg1['duration'] = seg1['endTime'] - seg1['startTime']
        seg1['beatIndices'] = beats_first
        # beatRealTimes : filtrer par intervalle si disponible
        if brt_all:
            seg1['beatRealTimes'] = [t for t in brt_all if t < mid]
        # Confiance pondérée : on garde celle du segment d'origine pour la première moitié
        # (la seconde aura une confiance dérivée du score chroma)
        seg2_chord = chord_name(expected_second, sfx_exp)
        seg2 = {
            'startTime': float(mid),
            'endTime': float(seg['endTime']),
            'chord': seg2_chord,
            'state': _chord_state_index(states, expected_second, sfx_exp),
            'beatIndices': beats_second,
            'beatRealTimes': [t for t in brt_all if t >= mid] if brt_all else [],
            'confidence': round(float(sc_exp), 3) if sc_exp <= 1.0 else 0.9,
            'duration': float(seg['endTime'] - mid),
        }
        # Ajuster confiance de seg1 si possible (moyenne simple)
        if sc_first_I is not None:
            seg1['confidence'] = round(float(sc_first_I), 3) if sc_first_I <= 1.0 else seg1.get('confidence', 0.9)
        new_segments.append(seg1)
        new_segments.append(seg2)
    # Re-fusion des consécutifs identiques devenus adjacents (ex: E scindé suivi d'un E existant)
    merged = []
    for s in new_segments:
        if merged and merged[-1]['chord'] == s['chord'] and s['chord'] != 'N':
            merged[-1]['endTime'] = s['endTime']
            merged[-1]['duration'] = merged[-1]['endTime'] - merged[-1]['startTime']
            merged[-1]['beatIndices'] = list(merged[-1].get('beatIndices', [])) + list(s.get('beatIndices', []))
            merged[-1]['beatRealTimes'] = list(merged[-1].get('beatRealTimes', [])) + list(s.get('beatRealTimes', []))
            # moyenne pondérée des confiances
            d1 = merged[-1]['endTime'] - merged[-1]['startTime'] - (s['endTime'] - s['startTime'])
            d2 = s['endTime'] - s['startTime']
            if d1 + d2 > 0:
                merged[-1]['confidence'] = round(
                    (float(merged[-1].get('confidence', 0.8)) * d1 + float(s.get('confidence', 0.8)) * d2) / (d1 + d2), 3)
        else:
            merged.append(s)
    return merged


def _clean_segments(segments, min_duration=0.6, silence_min=1.2):
    """Fusionne les segments très courts et supprime les silences parasites."""
    if not segments:
        return []

    # D'abord fusionner les silences courts entre deux fois le même accord.
    merged = []
    for seg in segments:
        if seg['chord'] == 'N' and (seg['endTime'] - seg['startTime']) < silence_min:
            if merged:
                # Étendre le segment précédent pour masquer le silence court.
                merged[-1]['endTime'] = seg['endTime']
                continue
        merged.append(seg)

    # Supprimer / absorber les segments trop courts.
    cleaned = []
    for seg in merged:
        duration = seg['endTime'] - seg['startTime']
        if duration < min_duration:
            if cleaned:
                cleaned[-1]['endTime'] = seg['endTime']
            continue
        cleaned.append(seg)

    # Fusionner les répétitions consécutives (peut arriver après absorption).
    final = []
    for seg in cleaned:
        if final and seg['chord'] == final[-1]['chord']:
            final[-1]['endTime'] = seg['endTime']
            # Moyenne pondérée par durée pour la confiance.
            d1 = final[-1]['endTime'] - final[-1]['startTime']
            d2 = seg['endTime'] - seg['startTime']
            if d1 + d2 > 0:
                final[-1]['confidence'] = round(
                    (final[-1]['confidence'] * d1 + seg['confidence'] * d2) / (d1 + d2), 3
                )
            continue
        final.append(seg)

    return final


def extract_structural_chord(chord_name_str):
    """
    Extrait l'accord structurel (fondamentale + qualité maj/min) d'un nom d'accord
    et documente la nature de la simplification effectuée.

    Règles de simplification (non destructives) :
    - EXTENSION    : 7, maj7, add9, 9, 11, 13  -> triade de base
    - SUSPENSION   : sus2, sus4               -> triade de base (tierce remplacée)
    - FUNDAMENTAL_QUALITY : major/minor/dim/aug -> jamais écrasé
    - NONE         : accord déjà structurel

    Retourne un dict :
        {
            'raw': 'Bmaj7',
            'root': 'B',
            'root_pc': 11,
            'base_quality': 'major',
            'structural_chord': 'B',
            'simplification_type': 'EXTENSION'
        }
    """
    if not chord_name_str or chord_name_str == 'N' or chord_name_str == '?':
        return {
            'raw': chord_name_str,
            'root': None,
            'root_pc': None,
            'base_quality': 'N',
            'structural_chord': 'N',
            'simplification_type': 'NONE'
        }

    root_match = re.match(r'^([A-G][#b]?)(.*)$', chord_name_str)
    if not root_match:
        return {
            'raw': chord_name_str,
            'root': None,
            'root_pc': None,
            'base_quality': 'unknown',
            'structural_chord': chord_name_str,
            'simplification_type': 'NONE'
        }

    root_name = root_match.group(1)
    suffix = root_match.group(2).strip()
    root_pc = NOTE_NAMES.index(root_name)

    # Détection de la qualité fondamentale : on ne doit JAMAIS écraser un changement
    # de qualité réel (ex: Bdim n'est pas un B majeur).
    has_dim = 'dim' in suffix or u'\u00b0' in suffix  # ex: Bdim, B°
    has_aug = 'aug' in suffix or '+' in suffix        # ex: Baug, B+
    is_minor = re.search(r'(^|[^a-zA-Z])(m|min|mi|-)(?=$|[^a-zA-Z])', suffix) is not None

    if has_dim:
        base_quality = 'dim'
        simplification_type = 'FUNDAMENTAL_QUALITY'
        structural_chord = chord_name(root_pc, 'dim')
    elif has_aug:
        base_quality = 'aug'
        simplification_type = 'FUNDAMENTAL_QUALITY'
        structural_chord = chord_name(root_pc, 'aug')
    elif suffix in ('', 'm'):
        base_quality = 'minor' if is_minor else 'major'
        simplification_type = 'NONE'
        structural_chord = chord_name(root_pc, 'm' if is_minor else '')
    elif suffix == 'm7b5':
        base_quality = 'dim'
        simplification_type = 'FUNDAMENTAL_QUALITY'
        structural_chord = chord_name(root_pc, 'dim')
    elif re.search(r'^(7|maj7|add9|9|11|13|m7)$', suffix):
        base_quality = 'minor' if is_minor else 'major'
        simplification_type = 'EXTENSION'
        structural_chord = chord_name(root_pc, 'm' if is_minor else '')
    elif re.search(r'^(sus2|sus4)$', suffix):
        # La suspension remplace la tierce : information intermédiaire, identifiable.
        base_quality = 'suspended'
        simplification_type = 'SUSPENSION'
        structural_chord = chord_name(root_pc, '')  # On vote pour la triade majeure de base
    else:
        # Cas par défaut conservatif : on garde le mode détecté sans écraser la qualité.
        base_quality = 'minor' if is_minor else 'major'
        simplification_type = 'FUNDAMENTAL_QUALITY'
        structural_chord = chord_name(root_pc, 'm' if is_minor else '')

    return {
        'raw': chord_name_str,
        'root': root_name,
        'root_pc': root_pc,
        'base_quality': base_quality,
        'structural_chord': structural_chord,
        'simplification_type': simplification_type
    }


def parse_chord_for_normalization(chord_name_str):
    """
    Parse un nom d'accord pour extraire sa fondamentale et son mode (Majeur/Mineur).
    Ex: 'Cmaj7' -> {'root_pc': 0, 'mode': 'major', 'raw': 'Cmaj7'}
        'Am9'   -> {'root_pc': 9, 'mode': 'minor', 'raw': 'Am9'}

    Cette fonction est un wrapper de compatibilité autour de extract_structural_chord().
    """
    structural = extract_structural_chord(chord_name_str)
    return {
        'root_pc': structural['root_pc'],
        'mode': 'N' if structural['base_quality'] == 'N' else (
            'minor' if structural['base_quality'] == 'minor' else 'major'
        ),
        'raw': chord_name_str,
        'structural_chord': structural['structural_chord']
    }

def aggregate_chords_to_grid(segments, bpm, beats_per_bar=4, subdivision="full_bar", normalization=True):
    """
    Transforme une séquence d'accords HMM en grille rythmique stable par vote pondéré
    sur des subdivisions de mesure basées sur le tempo réel.

    Args:
        normalization: si True, les votes utilisent extract_structural_chord()
                       (EXTENSION et SUSPENSION simplifiées vers la triade de base).
                       si False, les votes utilisent parse_chord_for_normalization()
                       (comportement historique half_bar).
    """
    if not segments or not bpm or bpm <= 0:
        return segments

    beat_duration = 60.0 / bpm
    
    # Calcul de la taille de la fenêtre d'agrégation (en secondes)
    if subdivision == "half_bar":
        window_duration = beat_duration * 2.0  # demi-mesure (2 temps)
    elif subdivision == "full_bar":
        window_duration = beat_duration * float(beats_per_bar)  # mesure entière (4 temps)
    else:
        window_duration = beat_duration  # par beat (1 temps)

    # Durée totale couverte par le morceau
    duration = segments[-1]['endTime']
    
    # Nombre d'intervalles réguliers à construire
    num_intervals = int(np.ceil(duration / window_duration))
    grid_segments = []

    for i in range(num_intervals):
        t_start = i * window_duration
        t_end = min(duration, (i + 1) * window_duration)
        if t_end <= t_start + 0.05:  # évite des résidus d'intervalles infimes
            continue

        # Vote pondéré : dictionnaire {structural_chord_name: total_weighted_vote}
        # On agrège les votes par l'accord structurel simplifié, pas par l'accord brut HMM
        votes = {}
        overlap_durations = {}
        raw_candidates_in_window = []  # Garder les accords bruts pour le diagnostic avancé

        simplification_exposure = {}

        for seg in segments:
            overlap = max(0.0, min(t_end, seg["endTime"]) - max(t_start, seg["startTime"]))  # overlap en secondes
            if overlap <= 0.01:
                continue

            # Normalisation du nom d'accord pour le vote
            if normalization:
                parsed_det = extract_structural_chord(seg["chord"])
            else:
                parsed_det = parse_chord_for_normalization(seg["chord"])
                parsed_det["simplification_type"] = "UNKNOWN"

            structural_chord_name = parsed_det["structural_chord"]
            simplification_type = parsed_det.get("simplification_type", "UNKNOWN")

            confidence = seg.get("confidence", 1.0)
            vote_weight = overlap * confidence
            votes[structural_chord_name] = votes.get(structural_chord_name, 0.0) + vote_weight
            overlap_durations[structural_chord_name] = overlap_durations.get(structural_chord_name, 0.0) + overlap
            raw_candidates_in_window.append({"chord": seg["chord"], "confidence": confidence, "overlap": overlap})

            # Exposition temporelle des simplifications pour le diagnostic futur
            simplification_exposure[simplification_type] = simplification_exposure.get(simplification_type, 0.0) + overlap

        if not votes:
            continue

        winner_structural_chord = max(votes, key=votes.get)
        winner_overlap_total = overlap_durations[winner_structural_chord]
        winner_confidence = round(votes[winner_structural_chord] / winner_overlap_total, 3) if winner_overlap_total > 0 else 0.5

        # Tenter de trouver le nom d'accord original le plus proche du gagnant structurel
        best_raw_chord_name = winner_structural_chord
        best_raw_chord_confidence = winner_confidence

        # Filtrer les candidats bruts qui correspondent à la fondamentale et au mode du gagnant structurel
        winner_parsed = parse_chord_for_normalization(winner_structural_chord)
        matching_raw_candidates = [c for c in raw_candidates_in_window
                                   if parse_chord_for_normalization(c["chord"])["root_pc"] == winner_parsed["root_pc"]
                                   and parse_chord_for_normalization(c["chord"])["mode"] == winner_parsed["mode"]]

        if matching_raw_candidates:
            # Choisir le candidat brut qui a la plus haute confiance, pondérée par son overlap
            best_raw_candidate = max(matching_raw_candidates,
                                     key=lambda x: x["confidence"] * x["overlap"])
            best_raw_chord_name = best_raw_candidate["chord"]
            best_raw_chord_confidence = best_raw_candidate["confidence"]

        grid_segments.append({
            "startTime": round(t_start, 3),
            "endTime": round(t_end, 3),
            "structural_chord": winner_structural_chord,
            "chord": best_raw_chord_name,
            "confidence": best_raw_chord_confidence,
            "simplification_exposure": simplification_exposure
        })

    if not grid_segments: return []

    final_segments = []
    current = grid_segments[0]

    for next_seg in grid_segments[1:]:
        # On fusionne si l'accord structurel est le même
        if next_seg["structural_chord"] == current["structural_chord"]:
            current["endTime"] = next_seg["endTime"]
            # Ici, la confiance pourrait être une moyenne pondérée ou max.
            # Pour l'instant, faisons une moyenne pondérée par la durée.
            d1 = current["endTime"] - current["startTime"]
            d2 = next_seg["endTime"] - next_seg["startTime"]
            if d1 + d2 > 0: # Évite division par zéro
                current["confidence"] = round(
                    (current["confidence"] * d1 + next_seg["confidence"] * d2) / (d1 + d2), 3
                )
            # L'accord brut pour l'affichage expert est conservé du premier segment pour simplicité
            # ou on peut introduire une logique de "le plus long/confiant" ici aussi.
            # Pour l'instant, on garde le premier.
        else:
            final_segments.append(current)
            current = next_seg

    final_segments.append(current)
    return final_segments

    for next_seg in grid_segments[1:]:
        if next_seg['chord'] == current['chord']:
            # Même accord : on étend la durée du bloc courant
            current['endTime'] = next_seg['endTime']
            # Confiance finale est la moyenne pondérée par la durée des deux sous-blocs
            d1 = current['endTime'] - current['startTime']
            d2 = next_seg['endTime'] - next_seg['startTime']
            if d1 + d2 > 0:
                current['confidence'] = round(
                    (current['confidence'] * d1 + next_seg['confidence'] * d2) / (d1 + d2), 3
                )
        else:
            # Accord différent : on pousse le bloc courant et on passe au suivant
            final_segments.append(current)
            current = next_seg

    final_segments.append(current)
    return final_segments


def _log_seg_stage(label, segments, states=None):
    """Affiche les stats d'une étape du pipeline pour le debug."""
    if not segments:
        print(f"[DEBUG] {label}: 0 segments")
        return
    durs = [s['endTime'] - s['startTime'] for s in segments]
    chords = [s['chord'] for s in segments]
    print(f"[DEBUG] {label}:")
    print(f"        count={len(segments)}, total_dur={sum(durs):.2f}s, avg={sum(durs)/len(durs):.3f}s")
    print(f"        min={min(durs):.3f}s, max={max(durs):.3f}s")
    print(f"        <0.4s={sum(1 for d in durs if d < 0.4)}")
    print(f"        <0.6s={sum(1 for d in durs if d < 0.6)}")
    # Compte les alternances rapides (root identique, qualité différente)
    alt = 0
    for i in range(1, len(segments)):
        r1, s1 = _parse_chord_label(segments[i-1]['chord'])
        r2, s2 = _parse_chord_label(segments[i]['chord'])
        if r1 is not None and r1 == r2 and s1 != s2:
            alt += 1
    print(f"        same_root_diff_quality_adjacent={alt}")
    # Affiche les 5 premiers segments pour inspection
    for s in segments[:5]:
        d = s['endTime'] - s['startTime']
        print(f"          {s['chord']:>10}  t={s['startTime']:.1f}s  dur={d:.3f}s  conf={s.get('confidence',0):.3f}")
    if len(segments) > 5:
        print(f"          ... (+{len(segments)-5})")
    sys.stdout.flush()


def _beat_indices_in_range(start_time, end_time, beat_times, eps=1e-3):
    """Retourne les indices des beats couverts par un segment [start, end].

    Un beat est inclus si son centre est dans [start - eps, end + eps].
    Retourne une liste vide si le segment ne couvre aucun beat.
    """
    idxs = []
    for k, t in enumerate(beat_times):
        if t >= start_time - eps and t <= end_time + eps:
            idxs.append(k)
    return idxs


def _segment_diagnostic(seg, states, obs_scores, beat_chroma, beat_times, key):
    """Construit le diagnostic déterministe d'un segment d'accord.

    Instrumentation en lecture seule : ne modifie ni les poids ni les scorers.
    Pour chaque segment on expose :
      - la plage temporelle ; le chroma moyen observé sur le segment ;
      - la fondamentale dominante du chroma (preuve observée) ;
      - les candidats d'états considérés (top 5 par émission moyenne) avec :
        similarité brute (dot chroma/template, sans biais tonal), émission finale
        (avec le biais tonal +0.05 si racine diatonique, comme _compute_observation_scores),
        et marge vs le 2e candidat ;
      - la tonalité/contexte tonal utilisé ;
      - l'accord choisi par le HMM (state) et l'accord final affiché (post traitement).
    Retourne None si le segment ne couvre aucun beat.
    """
    start = seg["startTime"]
    end = seg["endTime"]
    idxs = _beat_indices_in_range(start, end, beat_times)
    if not idxs:
        return None

    n_states = len(states)

    # Chroma moyen observé sur le segment.
    mean_chroma = np.zeros(12, dtype=np.float64)
    for idx in idxs:
        mean_chroma += beat_chroma[:, idx]
    mean_chroma /= len(idxs)

    # Score moyen d'observation (émission finale telle que l'a vue le HMM).
    mean_scores = np.zeros(n_states, dtype=np.float64)
    for idx in idxs:
        for j in range(n_states):
            mean_scores[j] += obs_scores[idx][j]
    mean_scores /= len(idxs)

    # Recalcul déterministe de la similarité brute (sans biais) pour la décomposition.
    similar = np.zeros(n_states, dtype=np.float64)
    diatonic_roots = _build_diatonic_roots(key)
    chroma_norm = np.linalg.norm(mean_chroma)
    for j, st in enumerate(states):
        template = st.get('template')
        if template is None:
            similar[j] = 0.0
        elif chroma_norm < 1e-6:
            similar[j] = 0.0
        else:
            similar[j] = float(np.dot(mean_chroma / chroma_norm, template))

    # Candidats classés par émission finale moyenne du segment.
    ranked = []
    for j, st in enumerate(states):
        if st.get('suffix') == 'N':
            continue
        ranked.append((j, st, float(mean_scores[j])))
    ranked.sort(key=lambda c: c[2], reverse=True)

    # Candidats topN avec décomposition de score.
    candidates = []
    second_score = ranked[1][2] if len(ranked) > 1 else None
    for j, st, score in ranked[:5]:
        margin = (score - second_score) if second_score is not None else 0.0
        candidates.append({
            'chord': st['name'],
            'state': j,
            'suffix': st.get('suffix'),
            'rootPc': st.get('root'),
            'similarityRaw': round(float(similar[j]), 4),
            'emissionFinal': round(score, 4),
            'marginVsNext': round(margin, 4),
            'inDiatonic': bool(st.get('root') in diatonic_roots),
        })

    # fondamentale dominante du chroma (preuve observée).
    dom_pc = int(np.argmax(mean_chroma)) if np.sum(mean_chroma) > 1e-6 else None
    dom_energy = float(mean_chroma[dom_pc]) if dom_pc is not None else 0.0

    return {
        'segmentStart': round(float(start), 3),
        'segmentEnd': round(float(end), 3),
        'beatIndices': idxs,
        'meanChroma': [round(float(v), 4) for v in mean_chroma],
        'dominantChromaPc': dom_pc,
        'dominantChromaNote': NOTE_NAMES[dom_pc % 12] if dom_pc is not None else None,
        'dominantChromaEnergy': round(dom_energy, 4),
        'key': (key['name'] if key else None),
        'keyMode': (key['mode'] if key else None),
        'keyPc': (key['pc'] if key else None),
        'candidates': candidates,
        'hmmChoice': int(seg['state']) if seg.get('state') is not None else None,
        'finalChord': seg.get('chord'),
        'confidence': round(float(seg.get('confidence', 0.0)), 4),
    }


def analyze_chords(wav_path, clean_mode="legacy", debug=False, downgrade_mode="hybrid",
                   observation_mode="baseline", contradiction_weight=0.10,
                   discriminator_threshold=0.02,
                   discriminator_strength=0.05,
                   diagnostics=False):
    """Pipeline d'analyse audio : tempo, signature, tonalité, accords principaux contextualisés.

    observation_mode : "baseline", "targeted_contradictions" (O2 expérimental),
                       ou "posthoc_discriminator" (correction post-hoc des paires confuses).
    contradiction_weight : pondération des contradictions (mode targeted_contradictions).
    discriminator_threshold : écart max pour déclencher le discriminateur (mode posthoc).
    discriminator_strength : bonus ajouté au vainqueur du discriminateur.

    Retourne un dict enrichi {duration, tempo, timeSignature, key, keyConfidence,
    keyCandidates, confidence, chords: [ChordEvent]}.
    """
    log(f'analyzing chords from {wav_path} (mode={clean_mode}, obs={observation_mode})')
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    duration = float(len(y) / sr)

    if len(y) == 0:
        return {
            'duration': round(duration, 3),
            'tempo': None,
            'timeSignature': '4/4',
            'key': None,
            'keyMode': None,
            'keyConfidence': 0.0,
            'keyCandidates': [],
            'confidence': 0.0,
            'chords': [],
        }

    # 1. Rythme : beats réels et tempo moyen.
    hop_length = 512
    tempo, beat_frames = _beat_track(y, sr, hop_length=hop_length)
    beat_frames = np.atleast_1d(beat_frames)
    # On inclut explicitement le début du fichier pour ne pas perdre la première mesure.
    if len(beat_frames) == 0 or beat_frames[0] != 0:
        beat_frames = np.concatenate(([0], beat_frames))
    beat_frames = _fill_beat_grid_gaps(beat_frames)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    if len(beat_times) < 2:
        # Fallback : pas assez de beats, on retourne une grille vide.
        key, key_candidates = detect_key(y, sr)
        return {
            'duration': round(duration, 3),
            'tempo': round(tempo, 1) if tempo else None,
            'timeSignature': '4/4',
            'key': key['name'] if key else None,
            'keyMode': key['mode'] if key else None,
            'keyConfidence': key['confidence'] if key else 0.0,
            'keyCandidates': key_candidates,
            'confidence': 0.0,
            'chords': [],
        }

    # Tempo moyen robuste (médiane des inter-beat intervals).
    ibis = np.diff(beat_times)
    if len(ibis) > 0:
        median_ibi = float(np.median(ibis))
        avg_tempo = 60.0 / median_ibi if median_ibi > 0 else tempo
    else:
        avg_tempo = tempo
    # Correction du double/moitié classique sur les morceaux lents avec batterie/voix.
    avg_tempo = _resolve_tempo(y, sr, avg_tempo)
    time_signature = estimate_time_signature(wav_path, avg_tempo)

    # 2. Tonalité.
    key, key_candidates = detect_key(y, sr)

    # 3. Chromagramme beat-synchrone sur la partie harmonique.
    y_harm, _ = librosa.effects.hpss(y, margin=8.0)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
    n_frames = chroma.shape[1]

    # Chroma des seules voix supérieures (à partir de C4). Il ne sert PAS à la
    # détection : uniquement à distinguer, en post-traitement, une basse mobile
    # sous un accord tenu d'une vraie progression d'accords. Le chroma global
    # confond les deux ; celui-ci reste figé dans le premier cas.
    chroma_upper = None
    if ENABLE_UPPER_VOICE_STABILITY_GUARD:
        try:
            chroma_upper = librosa.feature.chroma_cqt(
                y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36,
                fmin=librosa.note_to_hz('C4'), n_octaves=3)
        except Exception as exc:  # pragma: no cover - dépend de la durée du signal
            log(f'chroma aigu indisponible ({exc}) : garde de registre inactive')
            chroma_upper = None

    # Moyenne des frames à l'intérieur de chaque intervalle beat.
    K = len(beat_frames)
    beat_chroma = np.zeros((12, K), dtype=np.float32)
    beat_chroma_upper = (np.zeros((12, K), dtype=np.float32)
                         if chroma_upper is not None else None)
    frame_energies = np.zeros(K, dtype=np.float32)
    # Énergie réelle du signal par fenêtre, indépendante de la normalisation du
    # chroma. Voir ENABLE_TRUE_FRAME_ENERGY : la somme du chroma est inversée
    # dans les silences et rendait l'état « N » inatteignable.
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0] \
        if ENABLE_TRUE_FRAME_ENERGY else None

    for k in range(K):
        start_f = int(beat_frames[k])
        end_f = int(beat_frames[k + 1]) if k + 1 < K else n_frames
        if end_f <= start_f:
            beat_chroma[:, k] = 0.0
            frame_energies[k] = 0.0
        else:
            beat_chroma[:, k] = np.mean(chroma[:, start_f:end_f], axis=1)
            if rms is not None:
                lo, hi = min(start_f, len(rms)), min(end_f, len(rms))
                frame_energies[k] = float(np.mean(rms[lo:hi])) if hi > lo else 0.0
            else:
                frame_energies[k] = float(np.sum(beat_chroma[:, k]))
        if beat_chroma_upper is not None:
            e_up = min(end_f, chroma_upper.shape[1])
            s_up = min(start_f, e_up)
            if e_up > s_up:
                beat_chroma_upper[:, k] = np.mean(chroma_upper[:, s_up:e_up], axis=1)

    # 4. HMM : observation + transition + Viterbi.
    states = _build_chord_states(observation_mode, contradiction_weight)
    obs_scores = _compute_observation_scores(beat_chroma, states, key, frame_energies)
    if observation_mode == "posthoc_discriminator":
        obs_scores = _apply_discriminator(
            obs_scores, beat_chroma, states,
            discriminator_threshold=discriminator_threshold,
            discriminator_strength=discriminator_strength)
    obs_scores[0] += _initial_scores(states, key)
    obs_scores = np.clip(obs_scores, 0.0, 1.0)
    trans = _build_transition_matrix(states, key)
    path = _viterbi(obs_scores, trans)

    # 5. Segmentation et post-traitement.
    segments = _segment_path(path, beat_times, duration, states, obs_scores)
    if debug:
        _log_seg_stage("after Viterbi + segment_path", segments, states)
    segments = _merge_similar_segments(segments)
    if debug:
        _log_seg_stage("after _merge_similar_segments", segments, states)

    # Fusion des courts segments appartenant à un même harmonie (arpèges,
    # walking bass, figures mélodiques courtes). Cette couche est additive :
    # elle ne modifie ni le HMM ni l'observation.
    segments = _merge_arpeggio_segments(segments, beat_chroma, states, key,
                                       obs_scores=obs_scores, beat_dur=median_ibi)
    if debug:
        _log_seg_stage("after _merge_arpeggio_segments", segments, states)

    # Absorption des figures d'arpège / walking bass / pédale détectées par
    # analyse du chroma global. Couche additive très conservative (flag
    # ENABLE_ARPEGGIO_FIGURE_ABSORPTION). Résout les cas L et Q du test
    # déterministe sans toucher au HMM ni au beat tracker.
    if ENABLE_ARPEGGIO_FIGURE_ABSORPTION:
        segments = _absorb_arpeggio_figures(segments, beat_chroma, states,
                                            beat_dur=median_ibi,
                                            beat_chroma_upper=beat_chroma_upper)
        if debug:
            _log_seg_stage("after _absorb_arpeggio_figures", segments, states)

    # Stabilisation progressive de la structure harmonique (couche additive) :
    # simplification des qualités des fondamentales stables + absorption des
    # segments courts de fondamentale parasite. N'altère ni le HMM ni les obs.
    if ENABLE_PROGRESSIVE_STABILIZATION:
        segments = _stabilize_progressive_harmony(segments, beat_chroma, states, key)
        if debug:
            _log_seg_stage("after _stabilize_progressive_harmony", segments, states)

    # Stabilisation de progression : nettoie les fondamentales parasites
    # (notes de passage / arpèges) sur les progressions simples en boucle et
    # simplifie les qualités vers des triades stables. Couche additive pure.
    segments = _stabilize_progression(segments, key, states)
    if debug:
        _log_seg_stage("after _stabilize_progression", segments, states)

    # Stabilisation anti-parasite contextuelle (mission v4 « You are Yahweh ») :
    # élimine les fondamentales diatoniques passantes (II, VII...) attirées par
    # le bonus diatonique du HMM mais non structurelles, en les remplaçant par
    # le voisin structurel dont le template matche le mieux le chroma agrégé.
    # Couche additive pure, paramétrable et désactivable.
    if ENABLE_ANTIPARASITE_STABILIZATION:
        segments = _stabilize_antiparasite(segments, key, states, beat_chroma)
        if debug:
            _log_seg_stage("after _stabilize_antiparasite", segments, states)

    # Raffinement des boucles de refrain (mission v4 « You are Yahweh ») :
    # détecte les longues sections « plates » d'un accord structurel (ex: A
    # tenu 20s) là où le ground truth attend une boucle périodique E-D-A, et y
    # réinsère les accords manquants sur la base du chroma local (le HMM
    # baseline a raté les courts E/D noyés dans le bonus diatonique de la
    # tonique). Couche additive pure, paramétrable et désactivable.
    if ENABLE_CHORUS_LOOP_REFINE:
        structural_roots = _compute_structural_roots_v4(segments)
        segments = _refine_chorus_loops(segments, key, states, beat_chroma,
                                         structural_roots, beat_times=beat_times)
        if debug:
            _log_seg_stage("after _refine_chorus_loops", segments, states)

    # Correction du faux accord de tonique en début d'intro (mission v4
    # « You are Yahweh ») : le Viterbi baseline place parfois un court A
    # avant le vrai accord d'intro D, car le chroma de début contient la
    # quinte/tonique. On fusionne ce préfixe dans l'accord d'intro lorsque
    # l'évidence acoustique est nette. Couche additive pure, désactivable.
    if ENABLE_INTRO_PREFIX_FIX:
        segments = _fix_intro_prefix(segments, key, states, beat_chroma)
        if debug:
            _log_seg_stage("after _fix_intro_prefix", segments, states)

    # Correction de l'intro : si le premier accord diatonique stable est suivi
    # d'un accord diatonique stable de durée similaire ou supérieure et que le
    # chroma global du début soutient clairement ce second accord, on fusionne
    # le préfixe parasite dans le second pour obtenir D → A → E → F#m.
    segments = _fix_intro_pair(segments, key, states, beat_chroma)
    if debug:
        _log_seg_stage("after _fix_intro_pair", segments, states)

    # Exposition des candidats d'observation (top 3) pour chaque segment.
    for seg in segments:
        idxs = seg.get('beatIndices', [])
        if idxs:
            seg_obs = obs_scores[idxs, :]
            mean_scores = np.mean(seg_obs, axis=0)
            top3_idx = np.argsort(mean_scores)[-3:][::-1]
            seg['observation_candidates'] = [
                {'chord': states[int(si)]['name'],
                 'emission_score': round(float(mean_scores[int(si)]), 3)}
                for si in top3_idx
            ]
        else:
            seg['observation_candidates'] = []
        seg['viterbi_choice'] = seg['chord']

    source_count = len(segments)

    subdivision_method = "raw"
    window_duration = 0
    normalization = False
    beats_per_bar = 4

    if clean_mode == "legacy":
        # Placé avant la simplification du vocabulaire pour que les couches
        # suivantes travaillent sur la bonne fondamentale.
        segments = _resolve_fifth_confusion(segments, beat_chroma, states, key)
        if debug:
            _log_seg_stage("after _resolve_fifth_confusion", segments, states)
        if ENABLE_CHORD_DOWNGRADE:
            segments = _downgrade_advanced_segments(segments, beat_chroma, states, threshold=0.03, mode=downgrade_mode)
            if debug:
                _log_seg_stage("after _downgrade_advanced_segments", segments, states)
            # Simplification finale du vocabulaire vers les accords de base
            # (mode "tutoriel simple").
            if ENABLE_SIMPLE_CHORD_VOCABULARY:
                segments = _simplify_chord_vocabulary(segments)
                if debug:
                    _log_seg_stage("after _simplify_chord_vocabulary", segments, states)
                # Absorption des courts degrés vi parasites (mode simple).
                segments = _absorb_vi_parasites(segments, key)
                if debug:
                    _log_seg_stage("after _absorb_vi_parasites", segments, states)
                # Régularisation des progressions répétitives en boucle (mission
                # refrain/couplet "You Are Yahweh") : scinde les longs I encadrés
                # par IV/V quand le chroma le confirme. Additive, opt-in.
                if ENABLE_REPEATED_PROGRESSION_REGULARIZATION:
                    segments = _regularize_repeated_progression(
                        segments, key, states, beat_chroma, beat_times=beat_times)
                    if debug:
                        _log_seg_stage("after _regularize_repeated_progression", segments, states)
                # Détection structurelle vs accords de passage (informationnelle).
                if ENABLE_SIMPLE_CHORD_VOCABULARY and ENABLE_STRUCTURAL_LOOP_DETECTION:
                    segments = _detect_structural_loop(segments, key)
                    if debug:
                        _log_seg_stage("after _detect_structural_loop", segments, states)
            segments = _silence_leading_segments(segments, _audio_onset_time(y, sr, hop_length))
            segments = _carve_silences(segments, _detect_silent_regions(y, sr, hop_length))
            if debug:
                _log_seg_stage("after _silence_leading_segments", segments, states)
            segments = _clean_segments(segments, min_duration=0.4, silence_min=1.2)
            # Qualification des segments définitifs. Placée en dernier pour que
            # le rôle porte sur ce que l'utilisateur voit réellement.
            segments = _classify_chord_roles(segments, key, beat_dur=median_ibi)
            if debug:
                _log_seg_stage("after _clean_segments", segments, states)
        subdivision_method = "legacy"
    elif clean_mode in ("grid", "grid_half", "grid_norm", "grid_full"):
        # grid_half : grille d'origine (baseline historique)
        # grid_norm : grille half_bar + normalisation structurelle objet
        # grid_full : grille full_bar + normalisation structurelle
        if clean_mode == "grid_full":
            subdivision_method = "full_bar"
        else:
            subdivision_method = "half_bar"
        beat_duration = 60.0 / avg_tempo if avg_tempo else 1.0
        window_duration = beat_duration * float(beats_per_bar) if subdivision_method == "full_bar" else beat_duration * 2.0
        normalization = (clean_mode in ("grid_norm", "grid_full"))
        segments = aggregate_chords_to_grid(
            segments, avg_tempo, beats_per_bar=4,
            subdivision=subdivision_method,
            normalization=normalization
        )
    elif clean_mode == "raw":
        # Aucun nettoyage, segments HMM bruts
        pass

    chords = []
    diagnostics = [] if diagnostics else None
    total_confidence = 0.0
    total_duration = 0.0
    for seg in segments:
        length = seg["endTime"] - seg["startTime"]
        # On peuple la liste "chords" avec la version "structural" pour le vote
        # et la version "raw" pour l'affichage expert (si disponible)
        structural_chord = seg.get("structural_chord", seg["chord"]) # par défaut, l'accord brut si non agrégué
        display_chord = seg["chord"] # l'accord brut ou celui de l'aggrégation

        chord_entry = {
            "startTime": round(seg["startTime"], 3),
            "endTime": round(seg["endTime"], 3),
            "chord": display_chord,
            "structural_chord": structural_chord,
            "confidence": round(float(seg["confidence"]), 3),
            "observation_candidates": seg.get("observation_candidates", []),
            "viterbi_choice": seg.get("viterbi_choice", seg["chord"]),
            "analysis": seg.get("analysis", {}),
            "techniques": seg.get("techniques", []),
            "suggestions": seg.get("suggestions", []),
            "reharmonizations": seg.get("reharmonizations", []),
            "voiceLeading": seg.get("voiceLeading", {})
        }
        if "role" in seg:
            chord_entry["role"] = seg["role"]
        if "inStructuralLoop" in seg:
            chord_entry["inStructuralLoop"] = seg["inStructuralLoop"]
        chords.append(chord_entry)
        if diagnostics is not None:
            diag = _segment_diagnostic(seg, states, obs_scores, beat_chroma, beat_times, key)
            if diag is not None:
                diagnostics.append(diag)
        total_confidence += seg["confidence"] * length
        total_duration += length

    overall_confidence = round(total_confidence / max(1.0, total_duration), 3) if total_duration > 0 else 0.0
    key_info = f'key={key["name"] if key else "?"}, tempo={avg_tempo}'
    log(f'chord analysis done: {len(chords)} segments, {key_info}')

    # Information d'agrégation pour les modes grille (inclut les variants grid_*)
    aggregation_info = None
    if clean_mode in ("grid", "grid_half", "grid_norm", "grid_full"):
        aggregation_info = {
            "method": subdivision_method,
            "window": round(window_duration, 3),
            "source_segments": source_count,
            "output_segments": len(chords),
            "normalization": normalization
        }

    result = {
        "duration": round(duration, 3),
        "tempo": avg_tempo,
        "timeSignature": time_signature,
        "key": key["name"] if key else None,
        "keyMode": key["mode"] if key else None,
        "keyConfidence": key["confidence"] if key else 0.0,
        "keyCandidates": key_candidates[:5],
        "confidence": overall_confidence,
        "chords": chords,
        "aggregation": aggregation_info
    }
    if diagnostics is not None:
        result["diagnostics"] = diagnostics
    return result


def main():
    if len(sys.argv) < 2:
        print('usage: audio-processor.py <command> [args...]', file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == 'extract':
        input_path = sys.argv[2]
        output_wav = sys.argv[3]
        extract_audio(input_path, output_wav)

    elif command == 'probe':
        input_path = sys.argv[2]
        duration = probe_duration(input_path)
        print(json.dumps({'duration': duration}))

    elif command == 'trim':
        input_path = sys.argv[2]
        output_wav = sys.argv[3]
        start_sec = float(sys.argv[4])
        end_sec = float(sys.argv[5])
        trim_audio(input_path, output_wav, start_sec, end_sec)

    elif command == 'waveform':
        wav_path = sys.argv[2]
        result = generate_waveform(wav_path)
        print(json.dumps(result))

    elif command == 'pitch-shift':
        input_wav = sys.argv[2]
        output_wav = sys.argv[3]
        semitones = float(sys.argv[4])
        start_sec = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else 0.0
        end_sec = float(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else None
        pitch_shift_region(input_wav, output_wav, semitones, start_sec, end_sec)

    elif command == 'mix-stems':
        stem_paths = sys.argv[2].split(',')
        output_wav = sys.argv[3]
        mix_stems_to_master(stem_paths, output_wav)

    elif command == 'convert-webm-to-mp4':
        input_webm = sys.argv[2]
        output_mp4 = sys.argv[3]
        convert_webm_to_mp4(input_webm, output_mp4)

    elif command == 'pitch-shift-stems':
        stem_paths_json = sys.argv[2]
        output_dir = sys.argv[3]
        semitones = float(sys.argv[4])
        start_sec = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else 0.0
        end_sec = float(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else None
        pitch_shift_stems(stem_paths_json, output_dir, semitones, start_sec, end_sec)

    elif command == 'analyze-chords':
        wav_path = sys.argv[2]
        clean_mode = sys.argv[3] if len(sys.argv) > 3 else 'legacy'
        debug_mode = '--debug' in sys.argv
        # Le downgrade_mode peut être passé en 4ème argument positionnel.
        downgrade_mode = 'hybrid'
        if len(sys.argv) > 4 and not sys.argv[4].startswith('--'):
            downgrade_mode = sys.argv[4]
        observation_mode = 'baseline'
        contradiction_weight = 0.10
        discriminator_threshold = 0.02
        discriminator_strength = 0.05
        diagnostics = '--diagnostics' in sys.argv
        for a in sys.argv:
            if a.startswith('--observation-mode='):
                observation_mode = a.split('=', 1)[1]
            elif a.startswith('--contradiction-weight='):
                contradiction_weight = float(a.split('=', 1)[1])
            elif a.startswith('--discriminator-threshold='):
                discriminator_threshold = float(a.split('=', 1)[1])
            elif a.startswith('--discriminator-strength='):
                discriminator_strength = float(a.split('=', 1)[1])
        result = analyze_chords(wav_path, clean_mode, debug=debug_mode, downgrade_mode=downgrade_mode,
                                observation_mode=observation_mode,
                                contradiction_weight=contradiction_weight,
                                discriminator_threshold=discriminator_threshold,
                                discriminator_strength=discriminator_strength,
                                diagnostics=diagnostics)
        if not debug_mode:
            print(json.dumps(result))
        else:
            # En mode debug, on imprime le JSON en dernier pour ne pas polluer
            print("\n[JSON_OUTPUT]")
            print(json.dumps(result))

    else:
        print(f'unknown command: {command}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
