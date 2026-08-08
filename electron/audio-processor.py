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
ENABLE_CHORD_DOWNGRADE = True

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


def _resolve_tempo(y, sr, detected_tempo):
    """Choisit entre tempo/2, tempo et tempo*2 en maximisant l'alignement
    de la grille sur l'enveloppe d'onset. Cela corrige l'erreur classique
    'double ou moitié du vrai tempo' rencontrée sur mix et stems piano."""
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

    # Candidats : le tempo brut, sa moitié et son double.
    candidates = [detected_tempo / 2.0, detected_tempo, detected_tempo * 2.0]
    best_tempo = float(detected_tempo)
    best_score = -1.0

    for tempo in candidates:
        if tempo <= 0:
            continue
        interval = 60.0 / tempo
        # Grille régulière à ce tempo sur toute la durée.
        beat_times = np.arange(0.0, duration, interval)
        if len(beat_times) < 2:
            continue
        beat_frames = librosa.time_to_frames(beat_times, sr=sr, hop_length=hop_length)
        beat_frames = beat_frames[beat_frames < len(onset_env)]
        if len(beat_frames) < 2:
            continue

        # Score d'alignement : somme des forces d'onset sur les beats.
        score = float(np.sum(onset_env[beat_frames])) / len(beat_frames)

        # Pénaliser les tempi en dehors d'une plage musicale raisonnable
        # et désavantager légèrement le double pour favoriser la valeur réelle.
        if tempo < 45 or tempo > 200:
            score *= 0.5
        elif tempo > 150:
            score *= 0.85

        if score > best_score:
            best_score = score
            best_tempo = float(tempo)

    return round(best_tempo, 1)


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


def analyze_chords(wav_path, clean_mode="legacy", debug=False, downgrade_mode="hybrid",
                   observation_mode="baseline", contradiction_weight=0.10,
                   discriminator_threshold=0.02,
                   discriminator_strength=0.05):
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

    # Moyenne des frames à l'intérieur de chaque intervalle beat.
    K = len(beat_frames)
    beat_chroma = np.zeros((12, K), dtype=np.float32)
    frame_energies = np.zeros(K, dtype=np.float32)
    for k in range(K):
        start_f = int(beat_frames[k])
        end_f = int(beat_frames[k + 1]) if k + 1 < K else n_frames
        if end_f <= start_f:
            beat_chroma[:, k] = 0.0
            frame_energies[k] = 0.0
        else:
            beat_chroma[:, k] = np.mean(chroma[:, start_f:end_f], axis=1)
            frame_energies[k] = float(np.sum(beat_chroma[:, k]))

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
        if ENABLE_CHORD_DOWNGRADE:
            segments = _downgrade_advanced_segments(segments, beat_chroma, states, threshold=0.03, mode=downgrade_mode)
            if debug:
                _log_seg_stage("after _downgrade_advanced_segments", segments, states)
            segments = _clean_segments(segments, min_duration=0.4, silence_min=1.2)
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
    total_confidence = 0.0
    total_duration = 0.0
    for seg in segments:
        length = seg["endTime"] - seg["startTime"]
        # On peuple la liste "chords" avec la version "structural" pour le vote
        # et la version "raw" pour l'affichage expert (si disponible)
        structural_chord = seg.get("structural_chord", seg["chord"]) # par défaut, l'accord brut si non agrégué
        display_chord = seg["chord"] # l'accord brut ou celui de l'aggrégation

        chords.append({
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
        })
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

    return {
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
                                discriminator_strength=discriminator_strength)
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
