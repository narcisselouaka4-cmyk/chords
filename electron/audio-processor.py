import sys
import os
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


def extract_audio(input_path, output_wav, sample_rate=44100):
    """Extract audio track from any media file to WAV using ffmpeg."""
    log(f'extracting audio from {input_path} to {output_wav}')
    cmd = [
        FFMPEG,
        '-y',
        '-i', input_path,
        '-vn',  # no video
        '-ar', str(sample_rate),
        '-ac', '2',
        '-sample_fmt', 's16',
        output_wav,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f'ffmpeg extraction failed: {proc.stderr}')
    log('audio extraction done')


def generate_waveform(wav_path, num_peaks=400):
    """Generate a compact array of peak amplitudes for waveform display."""
    log(f'generating waveform from {wav_path}')
    y, sr = librosa.load(wav_path, sr=None, mono=True)
    duration = len(y) / sr

    if len(y) == 0:
        return {'duration': 0, 'peaks': [0] * num_peaks}

    block = max(1, len(y) // num_peaks)
    peaks = []
    for i in range(num_peaks):
        start = i * block
        end = min(start + block, len(y))
        chunk = y[start:end]
        peak = float(np.max(np.abs(chunk))) if len(chunk) > 0 else 0.0
        peaks.append(round(peak, 4))

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


def main():
    if len(sys.argv) < 2:
        print('usage: audio-processor.py <command> [args...]', file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == 'extract':
        input_path = sys.argv[2]
        output_wav = sys.argv[3]
        extract_audio(input_path, output_wav)

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

    elif command == 'pitch-shift-stems':
        stem_paths_json = sys.argv[2]
        output_dir = sys.argv[3]
        semitones = float(sys.argv[4])
        start_sec = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else 0.0
        end_sec = float(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else None
        pitch_shift_stems(stem_paths_json, output_dir, semitones, start_sec, end_sec)

    else:
        print(f'unknown command: {command}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
