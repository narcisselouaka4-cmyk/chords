#!/usr/bin/env python3
"""
Tests d'invariants — Bass Engine V2.5 Baseline.

Vérifie que le pipeline s'exécute sans erreur et que la structure
de sortie respecte les invariants (tri chronologique, durées >= 0,
MIDI dans [24, 84], etc.).

Usage:
    python tests/test_bass_baseline.py
"""

import sys
import os
import importlib.util

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WAV_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'walking_bass.wav')
DETECTOR_PATH = os.path.join(PROJECT_ROOT, 'scripts', 'bass-detector.py')


def import_bass_detector():
    spec = importlib.util.spec_from_file_location('bass_detector', DETECTOR_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_pipeline_runs():
    """Le pipeline s'exécute sans exception."""
    bd = import_bass_detector()
    result = bd.analyze_bass(
        WAV_PATH,
        smoothing_window=2,
        min_segment_duration=0.15,
        tracking='mode',
    )
    assert isinstance(result, dict), 'result should be a dict'
    return result


def test_output_has_required_keys(result):
    """La sortie contient les clés attendues."""
    assert 'segments' in result, 'missing segments key'
    assert 'duration' in result, 'missing duration key'
    assert isinstance(result['segments'], list), 'segments should be a list'
    assert result['duration'] > 0, 'duration should be positive'


def test_segments_not_empty(result):
    """Au moins un segment est détecté."""
    assert len(result['segments']) > 0, 'no segments detected'


def test_segments_chronological(result):
    """Les segments sont triés par startTime croissant."""
    segments = result['segments']
    for i in range(len(segments) - 1):
        st_curr = float(segments[i]['startTime'])
        st_next = float(segments[i + 1]['startTime'])
        assert st_curr <= st_next, (
            f'segment {i} startTime={st_curr} > segment {i + 1} startTime={st_next}'
        )


def test_no_negative_duration(result):
    """Aucun segment n'a une durée négative ou nulle."""
    duration_max = float(result['duration'])
    for i, seg in enumerate(result['segments']):
        dur = float(seg['endTime']) - float(seg['startTime'])
        assert dur > 0, f'segment {i} has non-positive duration {dur}'
        assert dur <= duration_max + 1e-6, (
            f'segment {i} duration {dur} exceeds file duration {duration_max}'
        )


def test_midi_in_range(result):
    """Toutes les notes MIDI sont dans [24, 84]. """
    for i, seg in enumerate(result['segments']):
        midi = int(seg['midi'])
        assert 24 <= midi <= 84, (
            f'segment {i} midi={midi} out of range [24, 84]'
        )


def test_no_overlapping_segments(result):
    """Les segments ne se chevauchent pas."""
    segments = result['segments']
    for i in range(len(segments) - 1):
        end_curr = float(segments[i]['endTime'])
        st_next = float(segments[i + 1]['startTime'])
        assert end_curr <= st_next + 1e-9, (
            f'segment {i} endTime={end_curr} > segment {i+1} startTime={st_next}'
        )


def test_default_params_produce_valid_output():
    """Les paramètres par défaut produisent une sortie valide."""
    bd = import_bass_detector()
    result = bd.analyze_bass(
        WAV_PATH,
        smoothing_window=bd.SMOOTHING_WINDOW,
        min_segment_duration=bd.MIN_SEGMENT_DURATION,
        tracking='mode',
    )
    assert len(result['segments']) > 0
    for seg in result['segments']:
        midi = int(seg['midi'])
        assert 24 <= midi <= 84
        assert float(seg['endTime']) > float(seg['startTime'])
        assert seg['bass'] in bd.NOTE_NAMES, f"invalid note name: {seg['bass']}"


def main():
    print('=' * 60)
    print('Bass Engine V2.5 — Tests d\'invariants')
    print('=' * 60)
    print(f'WAV : {WAV_PATH}')
    print()

    assert os.path.isfile(WAV_PATH), f'WAV not found: {WAV_PATH}'
    assert os.path.isfile(DETECTOR_PATH), f'detector not found: {DETECTOR_PATH}'

    n_pass = 0
    n_fail = 0

    # test 1: pipeline runs
    try:
        result = test_pipeline_runs()
        print(f'  [PASS] test_pipeline_runs')
        n_pass += 1
    except Exception as e:
        print(f'  [FAIL] test_pipeline_runs: {e}')
        n_fail += 1
        return 1

    tests = [
        ('test_output_has_required_keys', lambda: test_output_has_required_keys(result)),
        ('test_segments_not_empty', lambda: test_segments_not_empty(result)),
        ('test_segments_chronological', lambda: test_segments_chronological(result)),
        ('test_no_negative_duration', lambda: test_no_negative_duration(result)),
        ('test_midi_in_range', lambda: test_midi_in_range(result)),
        ('test_no_overlapping_segments', lambda: test_no_overlapping_segments(result)),
        ('test_default_params_produce_valid_output', test_default_params_produce_valid_output),
    ]

    for name, fn in tests:
        try:
            fn()
            print(f'  [PASS] {name}')
            n_pass += 1
        except Exception as e:
            print(f'  [FAIL] {name}: {e}')
            n_fail += 1

    print()
    print(f'  {n_pass} passed, {n_fail} failed')
    print('=' * 60)

    return 0 if n_fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
