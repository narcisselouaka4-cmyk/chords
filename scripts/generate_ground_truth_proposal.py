#!/usr/bin/env python3
"""Generate ground truth CSVs for synthetic test pieces and propose ground truth for real ones.

Usage:
  python scripts/generate_ground_truth_proposal.py [--output-dir data/benchmark]
"""
import sys, os, json, csv, argparse, time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(PROJECT_DIR, 'data', 'benchmark')

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_TO_PC = {n: i for i, n in enumerate(NOTE_NAMES)}
NOTE_TO_MIDI_BASE = {n: i + 12 for i, n in enumerate(NOTE_NAMES)}  # MIDI at octave 0

NOTE_PCS = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}

SYNTHETIC_PIECES = {
    'note_C2': {'notes': [('C2', 0.0, 2.0)]},
    'note_E2': {'notes': [('E2', 0.0, 2.0)]},
    'note_Fs2': {'notes': [('F#2', 0.0, 2.0)]},
    'note_G2': {'notes': [('G2', 0.0, 2.0)]},
    'note_A2': {'notes': [('A2', 0.0, 2.0)]},
    'note_B2': {'notes': [('B2', 0.0, 2.0)]},
    'note_harm_C2': {'notes': [('C2', 0.0, 2.0)]},
    'note_harm_E2': {'notes': [('E2', 0.0, 2.0)]},
    'note_harm_G2': {'notes': [('G2', 0.0, 2.0)]},
    'note_harm_B2': {'notes': [('B2', 0.0, 2.0)]},
    'chord_C': {'notes': [('C2', 0.0, 2.0)]},
    'chord_G': {'notes': [('G2', 0.0, 2.0)]},
    'chord_Dm': {'notes': [('D2', 0.0, 2.0)]},
    'slash_C_E': {'notes': [('E2', 0.0, 2.0)]},
    'slash_G_B': {'notes': [('B2', 0.0, 2.0)]},
    'slash_D_Fs': {'notes': [('F#2', 0.0, 2.0)]},
    'slash_Am7_G': {'notes': [('G2', 0.0, 2.0)]},
    'walking_bass': {
        'notes': [
            ('C2', 0.0, 0.25), ('E2', 0.25, 0.5), ('G2', 0.5, 0.75), ('B2', 0.75, 1.0),
            ('C3', 1.0, 1.25), ('B2', 1.25, 1.5), ('G2', 1.5, 1.75), ('E2', 1.75, 2.0),
            ('C2', 2.0, 2.25), ('D2', 2.25, 2.5), ('E2', 2.5, 2.75), ('F#2', 2.75, 3.0),
            ('G2', 3.0, 3.25), ('F#2', 3.25, 3.5), ('E2', 3.5, 3.75), ('D2', 3.75, 4.0),
        ]
    },
    'jazz_Cmaj9': {'notes': [('C2', 0.0, 2.0)]},
    'jazz_Dm7_G': {'notes': [('G2', 0.0, 2.0)]},
    'jazz_G13': {'notes': [('G2', 0.0, 2.0)]},
}


def note_to_midi(note_str):
    """Convert note name like 'C2', 'F#3' to MIDI number."""
    note_str = note_str.replace('s', '#')
    if len(note_str) < 2:
        return 60
    root = note_str[:-1]
    octave = int(note_str[-1])
    pc = NOTE_PCS.get(root, 0)
    return (octave + 1) * 12 + pc


def generate_synthetic_ground_truth(piece_id, piece_data):
    rows = []
    for note_name, start, end in piece_data['notes']:
        midi = note_to_midi(note_name)
        rows.append({'start_time': start, 'end_time': end, 'midi_note': midi})
    return rows


def propose_from_chords(piece_id, chords_path):
    if not os.path.isfile(chords_path):
        return None
    with open(chords_path) as f:
        content = f.read()
    for line in content.split('\n'):
        line = line.strip()
        if line.startswith('{'):
            data = json.loads(line)
            break
    else:
        data = json.loads(content)

    chords_data = data.get('chords', [])
    root_lookup = {
        'C': 36, 'C#': 37, 'Db': 37, 'D': 38, 'D#': 39, 'Eb': 39,
        'E': 40, 'F': 41, 'F#': 42, 'Gb': 42, 'G': 43, 'G#': 44,
        'Ab': 44, 'A': 45, 'A#': 46, 'Bb': 46, 'B': 47,
    }

    rows = []
    for c in chords_data:
        chord_name = c.get('structural_chord') or c.get('chord') or ''
        if not chord_name:
            continue
        parts = chord_name.split('/')
        root_part = parts[0].strip()
        for length in [2, 1]:
            candidate = root_part[:length]
            if candidate in root_lookup:
                midi = root_lookup[candidate]
                break
        else:
            midi = 45
        rows.append({
            'start_time': c.get('startTime', 0),
            'end_time': c.get('endTime', 0),
            'midi_note': midi,
        })

    return rows


def save_csv(rows, output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['start_time', 'end_time', 'midi_note'])
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    print(f'  Written: {output_path} ({len(rows)} notes)')


def main():
    parser = argparse.ArgumentParser(description='Generate ground truth proposals')
    parser.add_argument('--output-dir', default=OUTPUT_DIR)
    parser.add_argument('--corpus', default=None, help='Corpus config JSON')
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Synthetic pieces
    print('Generating ground truth for synthetic pieces...')
    for piece_id, piece_data in SYNTHETIC_PIECES.items():
        rows = generate_synthetic_ground_truth(piece_id, piece_data)
        out_path = os.path.join(args.output_dir, f'{piece_id}_ground_truth.csv')
        save_csv(rows, out_path)

    # Walking bass (already in corpus config)
    for pid in ['walking_bass']:
        if pid in SYNTHETIC_PIECES:
            continue

    # Pieces with chord data in benchmark_outputs
    chords_dir = os.path.join(PROJECT_DIR, 'benchmark_outputs')
    if os.path.isdir(chords_dir):
        for fname in os.listdir(chords_dir):
            if fname.startswith('chords_') and fname.endswith('.json'):
                piece_id = fname[len('chords_'):-len('.json')]
                if piece_id in [p.replace('_ground_truth.csv', '') for p in os.listdir(args.output_dir)]:
                    continue
                chords_path = os.path.join(chords_dir, fname)
                rows = propose_from_chords(piece_id, chords_path)
                if rows:
                    out_path = os.path.join(args.output_dir, f'{piece_id}_ground_truth_proposal.csv')
                    save_csv(rows, out_path)
                    print(f'  ⚠ PROPOSAL — validate manually: {out_path}')

    print(f'\nDone. Ground truth files in {args.output_dir}')


if __name__ == '__main__':
    main()
