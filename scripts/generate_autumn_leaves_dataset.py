#!/usr/bin/env python3
"""
Generate Autumn Leaves synthetic dataset (G minor, Bill Evans progression).

Produces:
  data/autumn_leaves/
  ├── autumn_leaves_bass_only.wav
  ├── autumn_leaves_mix.wav
  ├── autumn_leaves_ground_truth.csv
  └── generation_config.json

Usage:
    python scripts/generate_autumn_leaves_dataset.py \
        [--chord-json tests/references/autumn_leaves.json] \
        [--output-dir data/autumn_leaves] \
        [--tempo 120] [--seed 42]
"""

import sys, os, json, csv, re, subprocess, time, random

import numpy as np

OUTPUT_DIR = 'data/autumn_leaves'
SOUNDFONT = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
BASS_PROGRAM = 43
PIANO_PROGRAM = 0

NOTE_TO_MIDI = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}

# ---------------------------------------------------------------------------
# Chord symbols → root note name + quality
# ---------------------------------------------------------------------------

# Normalise Unicode accidentals to ASCII
ACC_MAP = str.maketrans({
    '\u266d': 'b',  # flat ♭
    '\u266f': '#',  # sharp ♯
    '\u0394': '',   # Δ maj7 symbol — drop, quality handled separately
    '\u00f8': 'ø',  # half-dim ø
    '\u00d8': 'ø',
})
# Remove quality suffix after root extraction
QUALITY_SUFFIX = re.compile(
    r'(-7|m7|min7|maj7|\u03947|7|dim7|o7|ø7|\u00f87|'
    r'aug7|\+7|sus4|sus2|6|69|add9|11|13|'
    r'[#b]?\d+)'
)


def parse_chord(s):
    s = s.translate(ACC_MAP).strip()
    # extract root: letter + optional accidental (# or b)
    m = re.match(r'^([A-Ga-g][#b]?)', s)
    if not m:
        raise ValueError(f'Cannot parse chord: {s}')
    root = m.group(1).upper()
    root = root[0] + (root[1] if len(root) > 1 and root[1] in '#b' else '')
    return root


def root_to_midi(root_note, lo=36, hi=55):
    pc = NOTE_TO_MIDI.get(root_note)
    if pc is None:
        raise ValueError(f'Unknown root note: {root_note}')
    midi = pc + 24
    while midi < lo:
        midi += 12
    while midi > hi:
        midi -= 12
    return midi


# ---------------------------------------------------------------------------
# Walking bass generation
# ---------------------------------------------------------------------------

def generate_walking_bass(chord_roots, tempo=120, seed=42, lo=36, hi=55):
    rng = random.Random(seed)
    beats_per_measure = 4
    n_measures = len(chord_roots)
    total_beats = n_measures * beats_per_measure
    notes = [None] * total_beats

    for m in range(n_measures):
        root_midi = root_to_midi(chord_roots[m], lo, hi)
        beat0 = m * beats_per_measure
        notes[beat0] = root_midi

        if m < n_measures - 1:
            next_root = root_to_midi(chord_roots[m + 1], lo, hi)
        else:
            next_root = root_to_midi(chord_roots[0], lo, hi)

        target = next_root
        b1 = notes[beat0]

        # Beat 4: half-step approach to target
        diff = (target - b1) % 12
        if diff < 6:
            b4 = target - 1
        else:
            b4 = target + 1
        b4 = max(lo, min(hi, b4))
        notes[beat0 + 3] = b4

        # Beat 2 & 3: fill the gap
        gap = b4 - b1
        step = gap // 3 if abs(gap) >= 3 else (1 if gap > 0 else -1)
        b2 = b1 + step
        b2 = max(lo, min(hi, b2))
        b3 = b2 + step
        b3 = max(lo, min(hi, b3))

        notes[beat0 + 1] = b2
        notes[beat0 + 2] = b3

        # 20% chance: replace beat 2 or 3 with a leap
        for bi in [beat0 + 1, beat0 + 2]:
            if rng.random() < 0.20:
                leap = rng.choice([-5, -7, 5, 7])
                prev = notes[bi - 1]
                alt = prev + leap
                if lo <= alt <= hi:
                    notes[bi] = alt

    # ---- validation ----
    roots_set = {m * beats_per_measure for m in range(n_measures)}
    n_root = sum(1 for i in range(total_beats) if i in roots_set)
    n_pass = total_beats - n_root
    return notes, n_root, n_pass


# ---------------------------------------------------------------------------
# Piano voicings
# ---------------------------------------------------------------------------

PIANO_VOICINGS = {
    'Aø7':     [45, 48, 51, 55],
    'D7':      [50, 54, 57, 60],
    'G-7':     [43, 46, 50, 53],
    'C-7':     [48, 51, 55, 58],
    'F7':      [53, 57, 60, 63],
    'B♭Δ7':    [46, 50, 53, 57],
    'E♭Δ7':    [51, 55, 58, 62],
    'Aø7' :    [45, 48, 51, 55],
    'Bbmaj7':  [46, 50, 53, 57],
    'Ebmaj7':  [51, 55, 58, 62],
    'Gm7':     [43, 46, 50, 53],
    'Cm7':     [48, 51, 55, 58],
    'Am7b5':   [45, 48, 51, 55],
    'BbΔ7':    [46, 50, 53, 57],
    'EbΔ7':    [51, 55, 58, 62],
}


def get_piano_voicing(chord_symbol):
    return PIANO_VOICINGS.get(chord_symbol)


# ---------------------------------------------------------------------------
# MIDI file creation
# ---------------------------------------------------------------------------

def create_midi(chord_data, bass_notes, tempo, output_path, include_piano=True):
    from midiutil import MIDIFile

    n_tracks = 2 if include_piano else 1
    midi = MIDIFile(n_tracks)
    beats_per_measure = 4
    bps = tempo / 60.0

    midi.addTempo(0, 0, tempo)

    piano_ch = 0
    bass_ch = 1

    if include_piano:
        midi.addTrackName(0, 0, 'Piano')
        midi.addProgramChange(0, piano_ch, 0, PIANO_PROGRAM)
        midi.addTrackName(1, 0, 'Bass')
        midi.addProgramChange(1, bass_ch, 0, BASS_PROGRAM)
    else:
        midi.addTrackName(0, 0, 'Bass')
        midi.addProgramChange(0, bass_ch, 0, BASS_PROGRAM)

    for m, chord in enumerate(chord_data):
        symbol = chord['chord']
        start_beat = m * beats_per_measure

        if include_piano:
            voicing = get_piano_voicing(symbol)
            if voicing:
                for note in voicing:
                    midi.addNote(0, piano_ch, note, start_beat, beats_per_measure - 0.05, 70)

        for bi in range(beats_per_measure):
            idx = m * beats_per_measure + bi
            if idx < len(bass_notes):
                pitch = bass_notes[idx]
                if pitch is not None:
                    track = 1 if include_piano else 0
                    midi.addNote(track, bass_ch, pitch,
                                 start_beat + bi, 0.9, 85)

    with open(output_path, 'wb') as f:
        midi.writeFile(f)


# ---------------------------------------------------------------------------
# WAV rendering via fluidsynth
# ---------------------------------------------------------------------------

def render_wav(midi_path, wav_path):
    if not os.path.isfile(SOUNDFONT):
        raise RuntimeError(f'SoundFont not found: {SOUNDFONT}')
    cmd = [
        'fluidsynth', '-ni', SOUNDFONT, midi_path,
        '-F', wav_path, '-g', '1.2',
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f'fluidsynth failed: {result.stderr}')
    return wav_path


# ---------------------------------------------------------------------------
# Ground truth CSV
# ---------------------------------------------------------------------------

def write_ground_truth(bass_notes, tempo, csv_path):
    bps = tempo / 60.0
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['start_time', 'end_time', 'midi_note'])
        for i, pitch in enumerate(bass_notes):
            if pitch is not None:
                start = i * (1.0 / bps)
                end = start + 0.9 / bps
                writer.writerow([f'{start:.4f}', f'{end:.4f}', pitch])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Generate Autumn Leaves dataset')
    parser.add_argument('--chord-json', default='tests/references/autumn_leaves.json')
    parser.add_argument('--output-dir', default=OUTPUT_DIR)
    parser.add_argument('--tempo', type=int, default=120)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    chord_json = args.chord_json
    output_dir = args.output_dir
    tempo = args.tempo
    seed = args.seed

    print(f'[Autumn Leaves Generator]')
    print(f'  Chord JSON : {chord_json}')
    print(f'  Output dir : {output_dir}')
    print(f'  Tempo      : {tempo} BPM')
    print(f'  Seed       : {seed}')
    print()

    if not os.path.isfile(chord_json):
        print(f'[ERROR] Chord JSON not found: {chord_json}')
        return 1

    with open(chord_json) as f:
        ref = json.load(f)

    chord_data = ref['chords']
    key = ref.get('key', 'G minor')
    n_measures = len(chord_data)

    chord_symbols = [c['chord'] for c in chord_data]
    chord_roots = [parse_chord(c) for c in chord_symbols]
    print(f'  Chords parsed: {n_measures} measures')
    print(f'  Key           : {key}')
    print(f'  Roots         : {chord_roots}')
    print()

    bass_notes, n_root, n_pass = generate_walking_bass(
        chord_roots, tempo=tempo, seed=seed, lo=36, hi=55
    )
    total_notes = len(bass_notes)
    root_pct = n_root / total_notes * 100
    pass_pct = n_pass / total_notes * 100

    duration = n_measures * 4 * (60.0 / tempo)
    midi_range = (min(bass_notes), max(bass_notes))

    print(f'[Walking Bass Validation]')
    print(f'  Total notes : {total_notes}')
    print(f'  Roots       : {n_root} ({root_pct:.1f}%)  ≤ 50%: {"✓" if root_pct <= 50 else "✗ FAIL"}')
    print(f'  Passing     : {n_pass} ({pass_pct:.1f}%)  ≥ 20%: {"✓" if pass_pct >= 20 else "✗ FAIL"}')
    print(f'  MIDI range  : {midi_range[0]}–{midi_range[1]}  (target 36–55)')
    print(f'  Duration    : {duration:.1f}s')
    print()

    if root_pct > 50 or pass_pct < 20:
        print('[WARN] Bass line constraints not met. Adjusting...')
        for i in range(total_notes):
            if i % 4 == 0 and i > 0:
                rnd = random.Random(seed + i)
                if rnd.random() < 0.3:
                    prev = bass_notes[i - 1]
                    nxt = bass_notes[i + 1] if i + 1 < total_notes else bass_notes[i - 2]
                    bass_notes[i] = (prev + nxt) // 2
                    n_root -= 1
                    n_pass += 1
        root_pct = n_root / total_notes * 100
        pass_pct = n_pass / total_notes * 100
        print(f'  Adjusted: roots {root_pct:.1f}%, passing {pass_pct:.1f}%')

    # MIDI files
    os.makedirs(output_dir, exist_ok=True)
    midi_mix = os.path.join(output_dir, 'autumn_leaves.mid')
    midi_bass = os.path.join(output_dir, 'autumn_leaves_bass.mid')

    create_midi(chord_data, bass_notes, tempo, midi_mix, include_piano=True)
    create_midi(chord_data, bass_notes, tempo, midi_bass, include_piano=False)
    print(f'  MIDI mix  : {midi_mix}')
    print(f'  MIDI bass : {midi_bass}')

    print('  Rendering WAV (fluidsynth)...')
    wav_mix = os.path.join(output_dir, 'autumn_leaves_mix.wav')
    wav_bass = os.path.join(output_dir, 'autumn_leaves_bass_only.wav')

    render_wav(midi_mix, wav_mix)
    print(f'  WAV mix   : {wav_mix}')
    render_wav(midi_bass, wav_bass)
    print(f'  WAV bass  : {wav_bass}')

    csv_path = os.path.join(output_dir, 'autumn_leaves_ground_truth.csv')
    write_ground_truth(bass_notes, tempo, csv_path)
    print(f'  CSV       : {csv_path}')

    config = {
        'source_file': os.path.abspath(chord_json),
        'key': key,
        'tempo': tempo,
        'seed': seed,
        'soundfont': SOUNDFONT,
        'bass_program': BASS_PROGRAM,
        'piano_program': PIANO_PROGRAM,
        'measures': n_measures,
        'duration_seconds': round(duration, 2),
        'chords_parsed': chord_symbols,
        'total_bass_notes': total_notes,
        'root_percent': round(root_pct, 1),
        'passing_percent': round(pass_pct, 1),
        'midi_range': list(midi_range),
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }

    config_path = os.path.join(output_dir, 'generation_config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f'  Config    : {config_path}')
    print()
    print('Done.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
