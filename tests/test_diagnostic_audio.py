#!/usr/bin/env python3
"""
Tests unitaires du diagnostic audio (LOT 6) : _segment_diagnostic et analyse
avec le flag --diagnostics.

Vérifie :
  - la structure déterministe du dict de diagnostic ;
  - le calcul des champs (chroma moyen, fondamentale dominante, candidats, marge) ;
  - que l'activation du diagnostic ne change PAS la sortie normale (comparaison
    avec/sans diagnostics sur un vrai fichier) ; absence de la clé cachée sinon.

Usage:
    python tests/test_diagnostic_audio.py
"""

import importlib.util
import json
import os
import sys
from subprocess import PIPE, Popen

import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    'audio_processor',
    os.path.join(PROJECT_ROOT, 'electron', 'audio-processor.py'),
)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

FIXTURE = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'progressions', 'prog1_dm7_g7_cmaj7.wav')


def _tiny_state_diag(chroma_seed, score_seed):
    """Fabrique obs_scores de façon à ce que l'état C (racine 0, suffixe '')
    soit clairement dominant sur 4 beats."""
    np.random.seed(chroma_seed)
    beat_chroma = np.random.rand(12, 4).astype(np.float32)
    beat_chroma /= np.maximum(np.sum(beat_chroma, axis=0, keepdims=True), 1e-6)
    states = ap._build_chord_states('baseline')
    S = len(states)
    obs_scores = np.zeros((4, S), dtype=np.float64)
    np.random.seed(score_seed)
    for t in range(4):
        obs_scores[t] = np.random.rand(S) * 0.05
    c_idx = next(j for j, st in enumerate(states) if st['name'] == 'C')
    obs_scores[:, c_idx] = 0.9
    seg = {'startTime': 0.0, 'endTime': 4.0, 'chord': 'C', 'state': c_idx, 'confidence': 0.9}
    key = {'pc': 0, 'mode': 'major', 'name': 'C'}
    return seg, states, obs_scores, beat_chroma, [0.0, 1.0, 2.0, 3.0], key


def test_beat_indices_in_range_basic():
    assert ap._beat_indices_in_range(0.0, 2.0, [0.0, 1.0, 2.0]) == [0, 1, 2]
    assert ap._beat_indices_in_range(0.4, 1.6, [0.0, 1.0, 2.0]) == [1]
    assert ap._beat_indices_in_range(10.0, 11.0, [0.0, 1.0]) == []


def test_segment_diagnostic_structure():
    seg, states, obs_scores, beat_chroma, beat_times, key = _tiny_state_diag(0, 2)
    diag = ap._segment_diagnostic(seg, states, obs_scores, beat_chroma, beat_times, key)
    assert diag is not None
    for k in ('segmentStart', 'segmentEnd', 'beatIndices', 'meanChroma',
              'dominantChromaPc', 'dominantChromaNote', 'key', 'keyMode',
              'candidates', 'hmmChoice', 'finalChord', 'confidence'):
        assert k in diag, f'missing key {k}'
    assert len(diag['meanChroma']) == 12
    assert 1 <= len(diag['candidates']) <= 5
    assert diag['key'] == 'C' and diag['keyMode'] == 'major'
    assert all(isinstance(x, int) for x in diag['beatIndices'])


def test_segment_diagnostic_deterministic():
    args = _tiny_state_diag(1, 1)
    a = ap._segment_diagnostic(*args)
    b = ap._segment_diagnostic(*args)
    assert a == b and json.dumps(a).encode() == json.dumps(b).encode()


def test_segment_diagnostic_candidates_consistent():
    seg, states, obs_scores, beat_chroma, beat_times, key = _tiny_state_diag(3, 4)
    diag = ap._segment_diagnostic(seg, states, obs_scores, beat_chroma, beat_times, key)
    cands = diag['candidates']
    for i in range(len(cands) - 1):
        assert cands[i]['emissionFinal'] >= cands[i + 1]['emissionFinal'] - 1e-9
    for c in cands:
        assert 0.0 - 1e-6 <= c['similarityRaw'] <= 1.0 + 1e-6
        assert 'chord' in c and 'state' in c and 'inDiatonic' in c


def _analyze_real(flag):
    py = sys.executable
    script = os.path.join(PROJECT_ROOT, 'electron', 'audio-processor.py')
    args = [py, script, 'analyze-chords', FIXTURE, 'legacy']
    if flag:
        args.append('--diagnostics')
    p = Popen(args, stdout=PIPE, stderr=PIPE, cwd=PROJECT_ROOT)
    out, _ = p.communicate()
    lines = [l for l in out.decode().splitlines() if l.strip().startswith('{')]
    assert lines, 'aucune sortie JSON'
    return json.loads(lines[-1])


def test_real_file_without_diag_no_key():
    r = _analyze_real(False)
    assert 'diagnostics' not in r
    assert len(r['chords']) > 0


def test_real_file_with_diag_structure():
    r = _analyze_real(True)
    d = r['diagnostics']
    assert isinstance(d, list) and len(d) == len(r['chords'])
    for diag in d:
        assert 'segmentStart' in diag and 'candidates' in diag and 'finalChord' in diag
        assert 'dominantChromaNote' in diag


def test_real_file_output_identical():
    a = _analyze_real(False)
    b = _analyze_real(True)
    del b['diagnostics']
    assert sorted(a.keys()) == sorted(b.keys())
    assert a['chords'] == b['chords'], 'le diagnostic ne doit pas changer la sortie'


def main():
    n_pass = n_fail = 0

    def check(name, fn):
        nonlocal n_pass, n_fail
        try:
            fn()
            print(f'  [PASS] {name}')
            n_pass += 1
        except Exception as e:
            print(f'  [FAIL] {name}: {e}')
            n_fail += 1

    check('test_beat_indices_in_range_basic', test_beat_indices_in_range_basic)
    check('test_segment_diagnostic_structure', test_segment_diagnostic_structure)
    check('test_segment_diagnostic_deterministic', test_segment_diagnostic_deterministic)
    check('test_segment_diagnostic_candidates_consistent', test_segment_diagnostic_candidates_consistent)
    if os.path.exists(FIXTURE):
        check('test_real_file_without_diag_no_key', test_real_file_without_diag_no_key)
        check('test_real_file_with_diag_structure', test_real_file_with_diag_structure)
        check('test_real_file_output_identical', test_real_file_output_identical)
    else:
        print(f'  [SKIP] fixture absente : {FIXTURE}')
    print()
    print(f'  {n_pass} passed, {n_fail} failed')
    print('=' * 60)
    return 0 if n_fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())