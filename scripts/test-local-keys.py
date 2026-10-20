#!/usr/bin/env python3
"""Régressions rapides de la couche informative, sans extraction audio.

Le cas MP3 réel est couvert par test-modulations-vraies.py --only nous_elevons.
"""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audio_processor', ROOT / 'electron/audio-processor.py')
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)


def progression(parts):
    chords = []
    time = 0.0
    for label, duration in parts:
        chords.append({'startTime': time, 'endTime': time + duration, 'chord': label})
        time += duration
    return chords, time


def transpose(parts, amount):
    result = []
    for label, duration in parts:
        root, suffix = processor._parse_chord_label(label)
        result.append((processor.NOTE_NAMES[(root + amount) % 12] + suffix, duration))
    return result


HOME = [('C', 4), ('F', 4), ('G', 4), ('C', 4)]


class LocalKeysTests(unittest.TestCase):
    def test_cache_version_matches_renderer(self):
        js = (ROOT / 'src/analyzer/engine-versions.js').read_text()
        self.assertIn(f"ANALYSIS_ENGINE_VERSION = '{processor.ENGINE_VERSION}'", js)
        self.assertNotEqual(processor.ENGINE_VERSION, 'ADR-061-triades-3')

    def test_stable_in_twelve_keys(self):
        for amount in range(12):
            with self.subTest(transpose=amount):
                chords, duration = progression(transpose(HOME * 6, amount))
                keys, _ = processor.detect_local_keys(chords, duration)
                self.assertEqual(len(keys), 1)
                self.assertEqual(keys[0]['key'], processor.NOTE_NAMES[amount])

    def test_real_established_change_in_twelve_keys(self):
        for amount in range(12):
            with self.subTest(transpose=amount):
                chords, duration = progression(transpose(
                    HOME * 3 + [('C#', 4), ('F#', 4), ('G#', 4), ('C#', 4)] * 4, amount))
                keys, _ = processor.detect_local_keys(chords, duration)
                self.assertEqual(len(keys), 2)
                self.assertEqual(keys[1]['key'], processor.NOTE_NAMES[(1 + amount) % 12])
                self.assertEqual(keys[1]['start'], 48)

    def test_short_tail_does_not_become_a_modulation(self):
        for amount in range(12):
            with self.subTest(transpose=amount):
                chords, duration = progression(transpose(HOME * 4 + [('D', 2), ('G', 7)], amount))
                keys, _ = processor.detect_local_keys(chords, duration)
                self.assertEqual(len(keys), 1)
                # Le cas reproduit bien un faux changement de l'ancien algorithme.
                legacy, _ = processor.detect_local_keys(chords, duration, require_established_change=False)
                self.assertEqual(len(legacy), 2)

    def test_returning_old_tonic_prevents_an_unsupported_change(self):
        chords, duration = progression(HOME * 3 + [('D', 6), ('G', 6), ('C', 1)] * 6)
        keys, _ = processor.detect_local_keys(chords, duration)
        self.assertEqual(len(keys), 1)
        legacy, _ = processor.detect_local_keys(chords, duration, require_established_change=False)
        self.assertGreater(len(legacy), 1)

    def test_input_is_unchanged(self):
        chords, duration = progression(HOME * 4)
        original = copy.deepcopy(chords)
        processor.detect_local_keys(chords, duration)
        self.assertEqual(chords, original)

    def test_unestablished_intro_does_not_replace_the_existing_global_key(self):
        chords, duration = progression(HOME * 4 + [('D', 2), ('G', 7)])
        fallback = {'pc': 7, 'name': 'G', 'mode': 'major', 'confidence': 0.8}
        keys, global_key = processor.detect_local_keys(chords, duration, fallback_key=fallback)
        self.assertEqual(len(keys), 1)
        self.assertEqual(keys[0]['key'], 'G')
        self.assertEqual(global_key['name'], 'G')
        legacy, _ = processor.detect_local_keys(chords, duration, fallback_key=fallback,
                                               require_established_change=False)
        self.assertEqual(legacy[0]['key'], 'C')
        self.assertEqual(len(legacy), 2)

    def test_empty_and_fallback(self):
        self.assertEqual(processor.detect_local_keys([], 0), ([], None))
        fallback = {'name': 'D#', 'pc': 3, 'mode': 'major', 'confidence': 0.5}
        keys, global_key = processor.detect_local_keys([], 10, fallback_key=fallback)
        self.assertEqual(keys[0]['key'], 'D#')
        self.assertEqual(keys[0]['end'], 10)
        self.assertEqual(global_key, fallback)


if __name__ == '__main__':
    unittest.main()
