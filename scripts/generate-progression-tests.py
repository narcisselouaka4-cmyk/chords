#!/usr/bin/env python3
"""Generate 4 chord progression test files for A/B benchmark.

Output: tests/audio/progressions/*.wav + tests/audio/progressions/*.json
Run: python scripts/generate-progression-tests.py
"""
import json, os
import numpy as np
import soundfile as sf
import librosa

SR = 22050
BPM = 120
BEAT_DUR = 60.0 / BPM
CHORD_DUR = 2.0  # 4 beats per chord
REPEATS = 4
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'tests', 'audio', 'progressions')
os.makedirs(OUT, exist_ok=True)


def note_to_hz(note):
    return librosa.note_to_hz(note)


def envelope(n, attack_ms=1, release_ms=50):
    """Apply amplitude envelope with sharp attack and soft release."""
    atk = min(int(attack_ms / 1000.0 * SR), n // 8)
    rel = min(int(release_ms / 1000.0 * SR), n // 4)
    env = np.ones(n)
    if atk > 0:
        env[:atk] = np.linspace(0, 1, atk)
    if rel > 0:
        env[-rel:] = np.linspace(1, 0, rel)
    return env


def percussive_click(n_samples, amp=0.08):
    """Short broadband click to help beat tracking."""
    click_len = min(int(0.010 * SR), n_samples // 4)
    click = amp * np.random.randn(click_len)
    click *= np.linspace(1, 0, click_len)  # fast decay
    return click


def render_chord(bass_note, upper_notes, dur=CHORD_DUR, bass_amp=0.30, upper_amp=0.12):
    n = int(SR * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    y = np.zeros(n)
    freq = note_to_hz(bass_note)
    # Fundamental + 2nd + 3rd harmonics for richer timbre
    y += bass_amp * np.sin(2 * np.pi * freq * t)
    y += bass_amp * 0.3 * np.sin(2 * np.pi * 2 * freq * t)
    y += bass_amp * 0.15 * np.sin(2 * np.pi * 3 * freq * t)
    for note in upper_notes:
        f = note_to_hz(note)
        y += upper_amp * np.sin(2 * np.pi * f * t)
        y += upper_amp * 0.2 * np.sin(2 * np.pi * 2 * f * t)
    y *= envelope(n, attack_ms=1, release_ms=80)
    # Add percussive onset
    click = percussive_click(n)
    y[:len(click)] += click
    y = np.clip(y, -1, 1)
    return y


# ─── Progressions ───
PROGRESSIONS = [
    {
        "name": "prog1_dm7_g7_cmaj7",
        "description": "ii-V-I in C major",
        "chords": [
            {
                "root": "D",
                "quality": "m7",
                "bass": "D2",
                "upper": ["F3", "A3", "C4"],
                "intervals": [0, 3, 7, 10]
            },
            {
                "root": "G",
                "quality": "7",
                "bass": "G2",
                "upper": ["B3", "D4", "F4"],
                "intervals": [0, 4, 7, 10]
            },
            {
                "root": "C",
                "quality": "maj7",
                "bass": "C2",
                "upper": ["E3", "G3", "B3"],
                "intervals": [0, 4, 7, 11]
            },
        ]
    },
    {
        "name": "prog2_am7b5_d7_gm",
        "description": "iiø7-V7-i in G minor",
        "chords": [
            {
                "root": "A",
                "quality": "m7b5",
                "bass": "A2",
                "upper": ["C4", "Eb4", "G4"],
                "intervals": [0, 3, 6, 10]
            },
            {
                "root": "D",
                "quality": "7",
                "bass": "D2",
                "upper": ["F#3", "A3", "C4"],
                "intervals": [0, 4, 7, 10]
            },
            {
                "root": "G",
                "quality": "minor",
                "bass": "G2",
                "upper": ["Bb3", "D4"],
                "intervals": [0, 3, 7]
            },
        ]
    },
    {
        "name": "prog3_cmaj7_csus4_cmaj7_c",
        "description": "Cmaj7 → Csus4 → Cmaj7 → C (major triad)",
        "chords": [
            {
                "root": "C",
                "quality": "maj7",
                "bass": "C2",
                "upper": ["E3", "G3", "B3"],
                "intervals": [0, 4, 7, 11]
            },
            {
                "root": "C",
                "quality": "sus4",
                "bass": "C2",
                "upper": ["F3", "G3", "B3"],
                "intervals": [0, 5, 7, 11]
            },
            {
                "root": "C",
                "quality": "maj7",
                "bass": "C2",
                "upper": ["E3", "G3", "B3"],
                "intervals": [0, 4, 7, 11]
            },
            {
                "root": "C",
                "quality": "major",
                "bass": "C2",
                "upper": ["E3", "G3", "C4"],
                "intervals": [0, 4, 7]
            },
        ]
    },
    {
        "name": "prog4_f7_bbmaj7",
        "description": "F7 → Bbmaj7 in Bb major",
        "chords": [
            {
                "root": "F",
                "quality": "7",
                "bass": "F2",
                "upper": ["A3", "C4", "Eb4"],
                "intervals": [0, 4, 7, 10]
            },
            {
                "root": "Bb",
                "quality": "maj7",
                "bass": "Bb2",
                "upper": ["D4", "F4", "A4"],
                "intervals": [0, 4, 7, 11]
            },
        ]
    },
]

for prog in PROGRESSIONS:
    name = prog["name"]
    chords = prog["chords"]
    total_dur = len(chords) * CHORD_DUR * REPEATS
    y = np.zeros(int(SR * total_dur))
    gt_segments = []

    gap_s = 0.030  # 30ms silent gap between chords for onset clarity
    offset = 0.0
    for rep in range(REPEATS):
        for ci, chord in enumerate(chords):
            seg = render_chord(chord["bass"], chord["upper"], dur=CHORD_DUR - gap_s)
            start_s = int(offset * SR)
            end_s = start_s + len(seg)
            y[start_s:end_s] = seg  # overwrite (gap ensures no overlap)
            gt_segments.append({
                "start_time": round(offset, 3),
                "end_time": round(offset + CHORD_DUR, 3),
                "root": chord["root"],
                "quality": chord["quality"],
                "bass": chord["bass"],
                "upper_notes": chord["upper"],
                "intervals": chord["intervals"],
            })
            offset += CHORD_DUR

    y = np.clip(y, -1, 1)
    wav_path = os.path.join(OUT, f"{name}.wav")
    sf.write(wav_path, y, SR)

    # Ground truth JSON (also save a repeat-agnostic template)
    gt_path = os.path.join(OUT, f"{name}.json")
    with open(gt_path, "w") as f:
        json.dump({
            "file": f"{name}.wav",
            "sr": SR,
            "bpm": BPM,
            "chord_duration": CHORD_DUR,
            "repeats": REPEATS,
            "progression": [
                {
                    "root": c["root"],
                    "quality": c["quality"],
                    "bass": c["bass"],
                    "upper_notes": c["upper"],
                    "intervals": c["intervals"],
                }
                for c in chords
            ],
            "segments": gt_segments,
        }, f, indent=2)

    print(f"  {wav_path}  ({total_dur:.1f}s)")
    print(f"  {gt_path}")

print(f"\nDone — {len(PROGRESSIONS)} files in {OUT}")
