#!/usr/bin/env python3
"""Tests harmoniques déterministes STRICTS — testent la segmentation harmonique
sans dépendre du beat tracker. Construit un beat_chroma synthétique contrôlé et
appelle directement les fonctions internes du moteur audio-processor.py.

Usage :
  python3 tests/test_harmonic_deterministic.py          # strict : EXIT=1 si un FAIL
  python3 tests/test_harmonic_deterministic.py --verbose  # avec détails

ORACLES STRICTS : chaque cas vérifie simultanément
  1. le nombre EXACT de zones harmoniques,
  2. l'ordre EXACT des fondamentales,
  3. les familles de suffixes admissibles par zone,
  4. les frontières attendues en beats (tolérance explicite),
  5. l'absence de zones supplémentaires (couvert par 1),
  6. l'absence de symboles interdits,
  7. le comportement du silence (fenêtre couverte par un segment N).

Aucune condition du type « l'accord attendu apparaît quelque part », « moins
de N segments » ou « symbole interdit absent » n'est utilisée : le PASS n'est
décerné que si la structure complète est exacte.

Ces tests isolent la responsabilité de chaque étage du moteur :
  - _compute_observation_scores (modèle d'observation du HMM)
  - _viterbi (décodage chemin d'états)
  - _segment_path (conversion en segments)
  - _merge_similar_segments (fusion post-Viterbi)
  - _downgrade_advanced_segments (simplification)
  - _clean_segments (nettoyage final)
"""
import argparse
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ENGINE = os.path.join(ROOT, 'electron')

# Importer le moteur sans produire de .pyc
sys.path.insert(0, ENGINE)
import importlib.util
spec = importlib.util.spec_from_file_location(
    'audio_processor',
    os.path.join(ENGINE, 'audio-processor.py'),
)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def pc(note_name):
    """Retourne le pitch class 0-11 d'un nom de note."""
    return NOTE_NAMES.index(note_name)


def make_chroma_vector(notes_with_weights):
    """Construit un vecteur chroma 12-D à partir de (note, poids) tuples."""
    vec = np.zeros(12, dtype=np.float32)
    for note, w in notes_with_weights:
        vec[pc(note) % 12] = w
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec


def make_beat_chroma(beats_content):
    """Construit un beat_chroma (12, K) à partir d'une liste de beats."""
    K = len(beats_content)
    chroma = np.zeros((12, K), dtype=np.float32)
    for t, beat_notes in enumerate(beats_content):
        chroma[:, t] = make_chroma_vector(beat_notes)
    return chroma


def make_frame_energies(beats_content):
    """Construit frame_energies (K,) : somme des poids de chaque beat."""
    K = len(beats_content)
    energies = np.zeros(K, dtype=np.float32)
    for t, beat_notes in enumerate(beats_content):
        energies[t] = sum(w for _, w in beat_notes)
    return energies


def run_pipeline(beat_chroma, frame_energies, key_pc=0, key_mode='major',
                 duration=None, clean_mode='legacy'):
    """Exécute le pipeline complet à partir d'un beat_chroma synthétique.

    Retourne le résultat avec les segments finaux et le chemin Viterbi.
    """
    K = beat_chroma.shape[1]
    if duration is None:
        beat_dur = 0.5  # Beat dur arbitraire de 0.5s (120 BPM)
    else:
        beat_dur = duration / K if K > 0 else 0.5
    beat_times = np.array([i * beat_dur for i in range(K)], dtype=np.float64)

    key = {'pc': key_pc, 'mode': key_mode,
           'name': NOTE_NAMES[key_pc] + ('' if key_mode == 'major' else 'm'),
           'confidence': 0.95}

    states = ap._build_chord_states('baseline', 0.10)
    obs_scores = ap._compute_observation_scores(beat_chroma, states, key, frame_energies)
    obs_scores[0] += ap._initial_scores(states, key)
    obs_scores = np.clip(obs_scores, 0.0, 1.0)
    trans = ap._build_transition_matrix(states, key)
    path = ap._viterbi(obs_scores, trans)
    segs = ap._segment_path(path, beat_times, K * beat_dur, states, obs_scores)
    segs_merged = ap._merge_similar_segments(list(segs))
    segs_arpeggio = ap._merge_arpeggio_segments(segs_merged, beat_chroma, states, key, obs_scores=obs_scores)
    if ap.ENABLE_ARPEGGIO_FIGURE_ABSORPTION:
        segs_arpeggio = ap._absorb_arpeggio_figures(segs_arpeggio, beat_chroma, states, beat_dur=beat_dur)
    if ap.ENABLE_PROGRESSIVE_STABILIZATION:
        segs_arpeggio = ap._stabilize_progressive_harmony(
            list(segs_arpeggio), beat_chroma, states, key)

    if clean_mode == 'legacy' and ap.ENABLE_CHORD_DOWNGRADE:
        segs_down = ap._downgrade_advanced_segments(
            list(segs_arpeggio), beat_chroma, states, threshold=0.03, mode='hybrid')
        segs_clean = ap._clean_segments(list(segs_down), min_duration=0.4, silence_min=1.2)
    else:
        segs_clean = segs_arpeggio

    return {
        'states': states,
        'obs_scores': obs_scores,
        'path': path,
        'segs': segs,
        'segs_merged': segs_merged,
        'segs_arpeggio': segs_arpeggio,
        'segs_final': segs_clean,
        'beat_times': beat_times,
        'beat_dur': beat_dur,
        'key': key,
    }


def parse_root(chord_str):
    if not chord_str or chord_str in ('N', '?'):
        return None, ''
    m = re.match(r'^([A-G][#b]?)(.*)$', chord_str)
    if not m:
        return None, ''
    root = m.group(1)
    if root not in NOTE_NAMES:
        return None, ''
    return NOTE_NAMES.index(root), m.group(2).strip()


def root_name(pc_):
    return NOTE_NAMES[pc_ % 12] if pc_ is not None else '?'


def root_pc_from_name(name):
    r, _ = parse_root(name)
    return r


def triad_beat(root_pc, weights=(1.0, 0.8, 0.6)):
    """Un beat = accord majeur plaqué sur une fondamentale."""
    return [(NOTE_NAMES[root_pc], weights[0]),
            (NOTE_NAMES[(root_pc + 4) % 12], weights[1]),
            (NOTE_NAMES[(root_pc + 7) % 12], weights[2])]


def triad_beats(root_pc, n):
    return [triad_beat(root_pc) for _ in range(n)]


# ═══════════════════════════════════════════════════════════════
# ORACLE STRICT
# ═══════════════════════════════════════════════════════════════

class ZoneExpectation:
    """Attente stricte pour une zone : fondamentales autorisées + suffixes
    admissibles + index de beat de début (tolérance)."""

    def __init__(self, roots, suffixes, start_beat, tol_beats=2):
        self.roots = roots if isinstance(roots, (list, tuple, set)) else [roots]
        self.roots = set(self.roots)
        self.suffixes = suffixes if isinstance(suffixes, (list, tuple, set)) else [suffixes]
        self.suffixes = set(self.suffixes)
        self.start_beat = start_beat
        self.tol_beats = tol_beats


class StrictSpec:
    """Spécification stricte d'un cas déterministe."""

    def __init__(self, name, description, beats_content, expected,
                 forbidden=None, silence=None, min_dur=0.4, key_pc=0):
        self.name = name
        self.description = description
        self.beats_content = beats_content
        self.expected = expected          # liste de ZoneExpectation
        self.forbidden = forbidden or []  # symboles interdits (noms exacts)
        self.silence = silence or []      # liste de (start_beat, end_beat) fenêtres
        self.min_dur = min_dur
        self.key_pc = key_pc


class TestResult:
    def __init__(self, name, description):
        self.name = name
        self.description = description
        self.passed = True
        self.failures = []
        self.details = []

    def check(self, condition, msg, detail=''):
        if condition:
            self.details.append(f'  OK: {msg}')
        else:
            self.passed = False
            self.failures.append(msg)
            self.details.append(f'  FAIL: {msg}')
        if detail:
            self.details.append(f'    {detail}')


def zones_from(segs, min_dur=0.15):
    """Zones harmoniques (non-N) d'au moins min_dur secondes."""
    return [s for s in segs
            if s['chord'] != 'N' and (s['endTime'] - s['startTime']) >= min_dur]


def evaluate_strict(spec):
    """Évalue un StrictSpec contre le moteur. Retourne un TestResult."""
    tr = TestResult(spec.name, spec.description)
    beat_chroma = make_beat_chroma(spec.beats_content)
    energies = make_frame_energies(spec.beats_content)
    r = run_pipeline(beat_chroma, energies, key_pc=spec.key_pc)
    segs = r['segs_final']
    beat_dur = r['beat_dur']
    zones = zones_from(segs, min_dur=spec.min_dur)

    tr.details.append(f'  n_segs={len(segs)} '
                      f'segs={[(s["chord"], round(s["startTime"], 2), round(s["endTime"], 2)) for s in segs]}')

    # ── 1. Nombre EXACT de zones ──
    exp_count = len(spec.expected)
    tr.check(len(zones) == exp_count,
             f'nombre exact de zones : attendu {exp_count}, obtenu {len(zones)}')

    # ── 2/3/4. Ordre, fondamentales, familles de suffixes, frontières ──
    for i, exp in enumerate(spec.expected):
        if i >= len(zones):
            break
        seg = zones[i]
        root, suffix = parse_root(seg['chord'])
        prefix = f'zone {i} (attendu {"|".join(root_name(x) for x in exp.roots)}'
        if exp.suffixes:
            prefix += f' suffixe {"|".join(sorted(exp.suffixes))}'
        prefix += f' @ beat {exp.start_beat}±{exp.tol_beats}) : '
        tr.check(root in exp.roots,
                 prefix + f'fondamentale {root_name(root)} non admissible, obtenu {seg["chord"]}',
                 f'segs={[(s["chord"], round(s["startTime"], 2)) for s in zones]}')
        tr.check(suffix in exp.suffixes,
                 prefix + f'suffixe "{suffix}" non admissible pour {seg["chord"]}')
        start_s = exp.start_beat * beat_dur
        tol_s = exp.tol_beats * beat_dur
        tr.check(abs(seg['startTime'] - start_s) <= tol_s,
                 prefix + f'frontière attendue {start_s:.2f}s±{tol_s:.2f}s, '
                          f'obtenue {seg["startTime"]:.2f}s')

    # ── 5. Absence de zones supplémentaires ──
    if len(zones) > len(spec.expected):
        extra = [s['chord'] for s in zones[len(spec.expected):]]
        tr.check(False, f'zones supplémentaires non autorisées : {extra}',
                 f'zones={[(s["chord"], round(s["startTime"], 2)) for s in zones]}')

    # ── 6. Symboles interdits ──
    for f in spec.forbidden:
        present = [s['chord'] for s in segs if s['chord'] == f]
        tr.check(not present,
                 f'symbole interdit {f} présent {len(present)} fois',
                 f'segs={[s["chord"] for s in segs]}')

    # ── 7. Comportement du silence ──
    for (sil_start_beat, sil_end_beat) in spec.silence:
        sil_start = sil_start_beat * beat_dur
        sil_end = sil_end_beat * beat_dur
        # Aucun accord non-N ne doit être entièrement dans la fenêtre de silence.
        inside = [s for s in segs
                  if s['chord'] != 'N'
                  and s['startTime'] > sil_start + 0.15
                  and s['endTime'] < sil_end - 0.15
                  and (s['endTime'] - s['startTime']) >= spec.min_dur]
        tr.check(not inside,
                 f'accord(s) inventé(s) dans le silence [{sil_start:.2f},{sil_end:.2f}] : '
                 f'{[s["chord"] for s in inside]}')
        # Un segment N doit couvrir la fenêtre de silence.
        n_covers = any(s['chord'] == 'N'
                       and s['startTime'] <= sil_start + 0.1
                       and s['endTime'] >= sil_end - 0.1
                       for s in segs)
        tr.check(n_covers,
                 f'fenêtre de silence [{sil_start:.2f},{sil_end:.2f}] non couverte par N')
    return tr


# ═══════════════════════════════════════════════════════════════
# CAS DE TEST DÉTERMINISTES (A–Q, STRICT)
# ═══════════════════════════════════════════════════════════════

def build_all_specs():
    specs = []
    C = pc('C')
    G = pc('G')
    A = pc('A')
    B = pc('B')
    D = pc('D')

    # ─── A. C majeur plaqué → 1 zone C ───
    specs.append(StrictSpec(
        'A', 'C majeur plaqué (chroma synthétique)',
        triad_beats(C, 4),
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── B. Cmaj7 plaqué → 1 zone C (Cmaj7 ou C après downgrade) ───
    specs.append(StrictSpec(
        'B', 'Cmaj7 plaqué (chroma synthétique)',
        [[('C', 1.0), ('E', 0.85), ('G', 0.65), ('B', 0.9)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── C. Cmaj7 arpégé en noires → 1 zone, aucune frontière interne ───
    specs.append(StrictSpec(
        'C', 'Cmaj7 arpégé noires (chroma synthétique)',
        [[('E', 1.0), ('C', 0.3)],
         [('G', 1.0), ('C', 0.3)],
         [('B', 1.0), ('C', 0.3)],
         [('C', 1.0), ('C', 0.3)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── D. Cmaj7 arpégé en croches → 1 zone, aucune frontière interne ───
    specs.append(StrictSpec(
        'D', 'Cmaj7 arpégé croches (chroma synthétique)',
        [[('E', 1.0), ('C', 0.3)],
         [('G', 1.0), ('C', 0.3)],
         [('B', 1.0), ('C', 0.3)],
         [('C', 1.0), ('C', 0.3)]] * 8,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── E. Cmaj7 arpégé en doubles croches (toutes les notes par beat) ───
    specs.append(StrictSpec(
        'E', 'Cmaj7 arpégé doubles croches (toutes notes par beat)',
        [[('E', 1.0), ('G', 0.8), ('B', 0.7), ('C', 0.9)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── F. Mélodie diatonique au-dessus de C → 1 zone C ───
    f_beats = []
    for mel in ['C', 'D', 'E', 'F', 'G', 'A', 'G', 'E']:
        f_beats.append([('C', 1.0), ('E', 0.7), ('G', 0.5), (mel, 0.3)])
    specs.append(StrictSpec(
        'F', 'mélodie diatonique au-dessus de C (chroma synthétique)',
        f_beats * 2,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── G. Chromatisme fugace au-dessus de C → 1 zone C ───
    g_beats = []
    for mel in ['C', 'E', 'G', 'G#', 'G']:
        g_beats.append([('C', 1.0), ('E', 0.7), ('G', 0.5), (mel, 0.3)])
    specs.append(StrictSpec(
        'G', 'chromatisme fugace au-dessus de C (chroma synthétique)',
        g_beats * 2,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── H. C 2 beats puis G 2 beats → EXACTEMENT 2 zones C, G ───
    specs.append(StrictSpec(
        'H', 'C→G 2 beats chacun (chroma synthétique)',
        triad_beats(C, 2) + triad_beats(G, 2),
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0),
                  ZoneExpectation(G, {'', 'maj7'}, 2, tol_beats=2)],
    ))

    # ─── I. Changement C→G sur demi-temps → 2 zones, frontière au demi-temps ───
    specs.append(StrictSpec(
        'I', 'C→G frontière au demi-temps (chroma synthétique)',
        triad_beats(C, 3) + triad_beats(G, 2),
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0),
                  ZoneExpectation(G, {'', 'maj7'}, 3, tol_beats=1)],
    ))

    # ─── J. C→D7→G → EXACTEMENT 3 zones C, D, G ───
    # NB : D7 = D+F#+A+C (tierce majeure). D7 peut être downgradé en D.
    specs.append(StrictSpec(
        'J', 'C→D7→G (chroma synthétique, D7 vrai = F#)',
        triad_beats(C, 2)
        + [[('D', 1.0), ('F#', 0.8), ('A', 0.6), ('C', 0.4)]]
        + triad_beats(G, 1),
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0),
                  ZoneExpectation(D, {'7', ''}, 2, tol_beats=1),
                  ZoneExpectation(G, {'', 'maj7'}, 3, tol_beats=1)],
        forbidden=['Dm', 'Dm7'],
    ))

    # ─── K. Pédale C + changement supérieur C→Am → 2 zones C, Am ───
    specs.append(StrictSpec(
        'K', 'pédale C + changement supérieur C→Am (chroma synthétique)',
        triad_beats(C, 4)
        + [[('C', 1.0), ('A', 0.8), ('C', 0.6), ('E', 0.5)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0),
                  ZoneExpectation(A, {'m', 'm7'}, 4, tol_beats=1)],
        forbidden=['Cm'],
    ))

    # ─── L. Walking bass interne à Cmaj7 → 1 zone C, aucune frontière interne ───
    specs.append(StrictSpec(
        'L', 'walking bass interne à Cmaj7 (chroma synthétique)',
        [[('C', 1.0), ('E', 0.8), ('G', 0.6), ('B', 0.5)],
         [('E', 1.0), ('G', 0.6), ('B', 0.5)],
         [('G', 1.0), ('E', 0.8), ('B', 0.5)],
         [('B', 1.0), ('E', 0.8), ('G', 0.6)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0)],
    ))

    # ─── M. Csus4→C → EXACTEMENT 2 zones Csus4, C ───
    specs.append(StrictSpec(
        'M', 'Csus4→C (chroma synthétique)',
        [[('C', 1.0), ('F', 0.8), ('G', 0.6)]] * 2
        + [[('C', 1.0), ('E', 0.8), ('G', 0.6)]] * 2,
        expected=[ZoneExpectation(C, {'sus4', 'sus2'}, 0),
                  ZoneExpectation(C, {'', 'maj7'}, 2, tol_beats=1)],
        forbidden=['Fsus2'],
    ))

    # ─── N. Arpège incomplet C-G-B sans tierce → 1 zone C admissible ───
    specs.append(StrictSpec(
        'N', 'arpège incomplet C-G-B sans tierce (chroma synthétique)',
        [[('C', 1.0), ('G', 0.8), ('B', 0.7)]] * 4,
        expected=[ZoneExpectation(C, {'', 'maj7', 'sus2'}, 0)],
    ))

    # ─── O. Silence entre C et G → 2 zones C, G + gap N couvrant le silence ───
    specs.append(StrictSpec(
        'O', 'silence entre C et G (chroma synthétique)',
        triad_beats(C, 2) + [[]] * 4 + triad_beats(G, 2),
        expected=[ZoneExpectation(C, {'', 'maj7'}, 0),
                  ZoneExpectation(G, {'', 'maj7'}, 6, tol_beats=2)],
        silence=[(2, 6)],
    ))

    # ─── P. Cellule réelle G/B + B-D-E + Am → zones GT, sans Bm/Bsus4 ───
    cell1 = triad_beats(G, 2)
    cell2 = [[('B', 1.0), ('G', 0.6), ('D', 0.5)]]
    cell2 += [[('B', 1.0), ('B', 0.6)],
              [('B', 1.0), ('D', 0.6)],
              [('B', 1.0), ('E', 0.6)],
              [('B', 1.0), ('D', 0.6)]]
    cell2 += [[('A', 1.0), ('C', 0.8), ('E', 0.6)]] * 2
    specs.append(StrictSpec(
        'P', 'cellule réelle G/B + B-D-E + Am (chroma synthétique)',
        cell1 + cell2 + cell1 + cell2,
        expected=[ZoneExpectation(G, {'', '7', 'maj7', 'sus2', 'sus4'}, 0),
                  ZoneExpectation(A, {'m', 'm7'}, 6, tol_beats=2),
                  ZoneExpectation(G, {'', '7', 'maj7', 'sus2', 'sus4'}, 8, tol_beats=2),
                  ZoneExpectation(A, {'m', 'm7'}, 14, tol_beats=2)],
        forbidden=['Bm', 'Bm7', 'Bsus4', 'Em7'],
    ))

    # ─── Q. Pédale G + mélodie E-C-F-D-B → 1 zone G, sans Gm7/Dsus4 ───
    q_beats = []
    for mel in ['E', 'C', 'F', 'D', 'B', 'E', 'C', 'F']:
        q_beats.append([('G', 1.0), (mel, 0.5)])
    specs.append(StrictSpec(
        'Q', 'pédale G + mélodie E-C-F-D-B (chroma synthétique)',
        q_beats * 2,
        expected=[ZoneExpectation(G, {'', 'maj7'}, 0)],
        forbidden=['Gm7', 'Dsus4', 'Gm'],
    ))

    return specs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    print('=== TESTS HARMONIQUES DÉTERMINISTES (STRICTS) ===')
    print('(beat_chroma synthétique — pas de beat tracker)\n')

    specs = build_all_specs()
    total = 0
    passed = 0
    failed = 0

    for spec in specs:
        tr = evaluate_strict(spec)
        total += 1
        status = 'PASS' if tr.passed else 'FAIL'
        print(f'  {status} {tr.name}: {tr.description}')
        if not tr.passed:
            for f in tr.failures:
                print(f'    FAIL: {f}')
        if args.verbose or not tr.passed:
            for d in tr.details:
                print(f'    {d}')
        if tr.passed:
            passed += 1
        else:
            failed += 1

    print(f'\n=== {passed}/{total} passés, {failed} échoués ===')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
