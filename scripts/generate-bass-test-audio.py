#!/usr/bin/env python3
"""Generate test WAV files for bass-detector benchmarks.
Run: python scripts/generate-bass-test-audio.py
Output: tests/audio/bass_*.wav, tests/audio/slash_*.wav, etc.
"""
import os, sys
import numpy as np
import soundfile as sf
import librosa

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'audio')
os.makedirs(OUT, exist_ok=True)


def note_to_hz(note):
    return librosa.note_to_hz(note)


def sine(freq, dur, amp=0.4):
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    return amp * np.sin(2 * np.pi * freq * t)


def save(name, y):
    path = os.path.join(OUT, name)
    sf.write(path, y, SR)
    print(f'  {path}  ({len(y)/SR:.1f}s)')


# ─── Single bass notes (pure sine at bass frequency) ───
print('Generating single bass notes...')
for note in ['C2', 'E2', 'F#2', 'G2', 'A2', 'B2']:
    freq = note_to_hz(note)
    y = sine(freq, 2.0)
    save(f'bass_{note.replace("#", "s")}.wav', y)

# ─── Single bass notes with harmonics ───
print('Generating harmonically rich bass notes...')
for note in ['C2', 'E2', 'G2', 'B2']:
    freq = note_to_hz(note)
    dur = 2.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    y = (0.4 * np.sin(2 * np.pi * freq * t)
         + 0.2 * np.sin(2 * np.pi * 2 * freq * t)
         + 0.1 * np.sin(2 * np.pi * 3 * freq * t)
         + 0.05 * np.sin(2 * np.pi * 4 * freq * t))
    save(f'bass_harm_{note.replace("#", "s")}.wav', y)

# ─── Chord with root bass (C major, bass=C2) ───
print('Generating chords with root bass...')
for chord_name, bass_note, chord_notes in [
    ('C', 'C2', ['C3', 'E3', 'G3']),
    ('G', 'G2', ['G3', 'B3', 'D4']),
    ('Dm', 'D2', ['D3', 'F3', 'A3']),
]:
    dur = 2.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    y = sine(note_to_hz(bass_note), dur, amp=0.35)
    for n in chord_notes:
        y += sine(note_to_hz(n), dur, amp=0.2)
    y = np.clip(y, -1, 1)
    save(f'chord_{chord_name}.wav', y)

# ─── Slash chords (inversions) ───
print('Generating slash chords...')
for slash_name, bass_note, chord_notes in [
    ('C_E', 'E2', ['C3', 'E3', 'G3']),       # C/E
    ('G_B', 'B2', ['G3', 'B3', 'D4']),       # G/B
    ('D_Fs', 'F#2', ['D3', 'F#3', 'A3']),    # D/F#
    ('Am7_G', 'G2', ['A3', 'C4', 'E4', 'G4']), # Am7/G (bass G ≠ root A)
]:
    dur = 2.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    y = sine(note_to_hz(bass_note), dur, amp=0.35)
    for n in chord_notes:
        y += sine(note_to_hz(n), dur, amp=0.15)
    y = np.clip(y, -1, 1)
    save(f'slash_{slash_name}.wav', y)

# ─── Walking bass pattern ───
print('Generating walking bass...')
dur = 4.0
fps = 4  # notes per second
notes_per_sec = 4
t = np.linspace(0, dur, int(SR * dur), endpoint=False)
pattern_notes = ['C2', 'E2', 'G2', 'B2', 'C3', 'B2', 'G2', 'E2',
                 'C2', 'D2', 'E2', 'F#2', 'G2', 'F#2', 'E2', 'D2']
notes_dur = dur / len(pattern_notes)
y = np.zeros(int(SR * dur))
for i, note in enumerate(pattern_notes):
    start = int(i * notes_dur * SR)
    end = int((i + 0.8) * notes_dur * SR)
    n_samples = end - start
    tn = np.linspace(0, notes_dur * 0.8, n_samples, endpoint=False)
    freq = note_to_hz(note)
    env = np.exp(-tn * 4)  # quick decay for each note
    y[start:end] += 0.35 * np.sin(2 * np.pi * freq * tn) * env
y = np.clip(y, -1, 1)
save('walking_bass.wav', y)

# ─── Jazz piano voicing (two-handed, specific bass) ───
print('Generating jazz piano voicings...')
for name, bass_note, chord_notes in [
    ('Cmaj9', 'C2', ['E3', 'G3', 'B3', 'D4']),
    ('Dm7_G', 'G2', ['D3', 'F3', 'A3', 'C4']),  # Dm7/G
    ('G13', 'G2', ['B3', 'D4', 'F4', 'A4']),
]:
    dur = 2.0
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    y = sine(note_to_hz(bass_note), dur, amp=0.30)
    for n in chord_notes:
        y += sine(note_to_hz(n), dur, amp=0.12)
    y = np.clip(y, -1, 1)
    save(f'jazz_{name}.wav', y)

print(f'\nDone — {len(os.listdir(OUT))} files in {OUT}')
