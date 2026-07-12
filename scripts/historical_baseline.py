"""
Phase 1B.6 — Historical production baseline adapter.

Appelle le moteur de production (electron/audio-processor.py) en lecture seule
sur les chroma des fixtures DEV, sans modifier aucun code de production.

Usage:
    from scripts.historical_baseline import historical_classify, HISTORICAL_CHORD_NAMES
"""

import importlib.util
import os
import sys
import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Import production module in read-only mode
_prod_spec = importlib.util.spec_from_file_location(
    'audio_processor_prod',
    os.path.join(PROJECT_ROOT, 'electron', 'audio-processor.py'),
)
ap = importlib.util.module_from_spec(_prod_spec)
_prod_spec.loader.exec_module(ap)

# Mapping from production chord name suffix to structured quality string
SUFFIX_TO_QUALITY = {
    '': '',
    'm': 'm',
    '7': '7',
    'maj7': 'maj7',
    'sus2': 'sus2',
    'sus4': 'sus4',
    'm7': 'm7',
    'dim': 'dim',
    'm7b5': 'm7b5',
    'aug': None,  # not in our vocabulary
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
NOTE_TO_PC = {n: i for i, n in enumerate(NOTE_NAMES)}


def _parse_production_chord(chord_name_str: str) -> dict:
    """Parse a production chord name like 'Cmaj7' or 'F#m7' into root_pc, quality."""
    if not chord_name_str or chord_name_str == 'N':
        return {'root': -1, 'quality': 'N', 'suffix': 'N', 'valid': False}

    name = chord_name_str
    root = None
    suffix = ''

    if len(name) >= 2 and name[1] in '#b':
        root_str = name[:2]
        suffix = name[2:]
    elif name:
        root_str = name[0]
        suffix = name[1:]
    else:
        return {'root': -1, 'quality': 'N', 'suffix': 'N', 'valid': False}

    if root_str not in NOTE_TO_PC:
        return {'root': -1, 'quality': 'N', 'suffix': suffix, 'valid': False}

    root_pc = NOTE_TO_PC[root_str]
    quality = SUFFIX_TO_QUALITY.get(suffix, None)

    return {
        'root': root_pc,
        'quality': quality if quality is not None else suffix,
        'suffix': suffix,
        'valid': quality is not None,
    }


def historical_classify_single(chroma_12_vec: list[float]) -> dict:
    """Classify a single 12-element chroma vector using the production engine.

    Returns dict with keys: root, quality, chord_name.
    Uses argmax on observation scores (no Viterbi, single observation).
    """
    beat_chroma = np.asarray(chroma_12_vec, dtype=np.float32).reshape(12, 1)
    frame_energies = np.array([float(np.sum(beat_chroma[:, 0]))], dtype=np.float32)

    states = ap._build_chord_states('baseline', 0.10)
    obs = ap._compute_observation_scores(beat_chroma, states, key=None, frame_energies=frame_energies)
    obs = np.clip(obs, 0.0, 1.0)

    best_idx = int(np.argmax(obs[0]))
    state = states[best_idx]
    chord_name = state['name']

    parsed = _parse_production_chord(chord_name)
    parsed['chord_name'] = chord_name
    parsed['confidence'] = float(obs[0, best_idx])
    return parsed


def historical_classify_many(chroma_list: list[list[float]]) -> list[dict]:
    """Classify many chroma vectors. Returns list of result dicts."""
    return [historical_classify_single(ch) for ch in chroma_list]
