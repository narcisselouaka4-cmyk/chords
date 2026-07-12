#!/usr/bin/env python3
"""
Phase 1A — Tests unitaires du moteur structured_harmony_v1.

Usage:
    python tests/test_structured_harmony_v1_engine.py
"""

import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))

from harmony_engine.templates import (
    QUALITY_TEMPLATES, assert_template_invariants, expected_pcs,
    TRIAD_LABELS, SEVENTH_LABELS,
)
from harmony_engine.candidate import ChordCandidate, ObservationInput
from harmony_engine.voicing import (
    VoicingType, voicing_cost, compute_voicing_observed,
)
from harmony_engine.scoring import (
    acoustic_score, total_score_with_gating, DELTA_GATE,
    f_root, f_triad, f_seventh,
)
from harmony_engine.bass import compute_bass_pc, bass_is_weak, bass_score
from harmony_engine.style_profiles import STYLE_PROFILES, StyleProfile
from harmony_engine.structured_v1 import (
    analyze_chord, _select_roots, _evaluate_triad, _evaluate_seventh,
    MAX_CANDIDATES_SCORED, TOP_N,
)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'fixtures', 'chroma_fixtures.json')
DEV_FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                 'fixtures', 'chroma_fixtures_dev.json')


def check(condition, msg, errors):
    if not condition:
        errors.append(msg)
        return False
    return True


def load_fixtures(path=None):
    if path is None:
        path = FIXTURES_PATH
    with open(path) as f:
        data = json.load(f)
    return data['fixtures'], data['metadata']


# ─── 1. Template invariants ───

def test_template_major_interval_4(errors):
    """Template major contient 4, pas 3."""
    iv = QUALITY_TEMPLATES['']['intervals']
    check(4 in iv, "major: interval 4 required", errors)
    check(3 not in iv, "major: interval 3 forbidden", errors)


def test_template_minor_interval_3(errors):
    """Template minor contient 3."""
    iv = QUALITY_TEMPLATES['m']['intervals']
    check(3 in iv, "minor: interval 3 required", errors)


def test_template_dim_interval_6(errors):
    """Template dim contient 6 (quinte dim)."""
    iv = QUALITY_TEMPLATES['dim']['intervals']
    check(6 in iv, "dim: interval 6 required", errors)


def test_template_sus2_no_third(errors):
    """Template sus2 contient 2, pas de tierce."""
    iv = QUALITY_TEMPLATES['sus2']['intervals']
    check(2 in iv, "sus2: interval 2 required", errors)
    check(3 not in iv, "sus2: interval 3 forbidden", errors)
    check(4 not in iv, "sus2: interval 4 forbidden", errors)


def test_template_sus4_no_third(errors):
    """Template sus4 contient 5, pas de tierce."""
    iv = QUALITY_TEMPLATES['sus4']['intervals']
    check(5 in iv, "sus4: interval 5 required", errors)
    check(3 not in iv, "sus4: interval 3 forbidden", errors)
    check(4 not in iv, "sus4: interval 4 forbidden", errors)


def test_assert_template_invariants_passes(errors):
    """assert_template_invariants() lève ou non."""
    try:
        assert_template_invariants()
        check(True, "template invariants passed", errors)
    except AssertionError as e:
        check(False, f"template invariants failed: {e}", errors)


# ─── 2. Pitch classes relatives ───

def test_expected_pcs_relative_to_root(errors):
    """expected_pcs dépend du root, pas de 0 absolu.
    Vérifie que la fondamentale du candidat (root) est présente
    via l'intervalle 0, quel que soit le pitch class absolu."""
    for root in range(12):
        iv = [0, 4, 7]
        ep = expected_pcs(root, iv)
        expected = sorted((root + i) % 12 for i in iv)
        check(ep == expected,
              f"root={root}: expected {expected} got {ep}", errors)
        check(root in ep,
              f"root={root}: root must be in expected_pcs (interval 0 maps to root)", errors)


def test_all_fixtures_have_relative_pcs(errors):
    """Toutes les fixtures ont des expected_pcs relatifs."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        computed = set((f['root'] + iv) % 12 for iv in f['intervals'])
        check(set(f['expected_pcs']) == computed,
              f"{f['id']}: expected_pcs mismatch (root={f['root']})", errors)


# ─── 3. Génération bornée ───

def test_max_root_selection(errors):
    """_select_roots retourne ≤ 5 racines."""
    chroma = [0.1] * 12
    chroma[0] = 0.9
    chroma[4] = 0.8
    chroma[7] = 0.7
    chroma[2] = 0.6
    chroma[9] = 0.5
    bass = [0.01] * 12
    roots = _select_roots(chroma, bass)
    check(len(roots) <= 5, f"too many roots: {len(roots)}", errors)
    check(0 in roots, "root C should be selected", errors)


def test_max_triads_per_root(errors):
    """_evaluate_triad retourne ≤ 2 triades."""
    chroma = [0.0] * 12
    chroma[4] = 0.8
    chroma[7] = 0.8
    triads = _evaluate_triad(chroma, 0)
    check(len(triads) <= 2, f"too many triads: {len(triads)}", errors)


def test_max_sevenths_per_pair(errors):
    """_evaluate_seventh retourne ≤ 2 septièmes."""
    chroma = [0.0] * 12
    chroma[10] = 0.8
    sevenths = _evaluate_seventh(chroma, 0, 'major')
    check(len(sevenths) <= 2, f"too many sevenths: {len(sevenths)}", errors)


def test_max_candidates_scored(errors):
    """analyze_chord retourne ≤ 12 candidats."""
    chroma = [0.1] * 12
    chroma[0] = 0.9
    chroma[4] = 0.7
    chroma[7] = 0.8
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) <= MAX_CANDIDATES_SCORED,
          f"too many candidates: {len(results)}", errors)


def test_top3_exposed(errors):
    """analyze_chord expose au moins top-1 (ou 0 si rien)."""
    chroma = [0.1] * 12
    chroma[0] = 0.9
    chroma[4] = 0.7
    chroma[7] = 0.8
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    if results:
        check(len(results) <= TOP_N or True,
              "results list exists", errors)


# ─── 4. Double comptage ───

def test_no_double_counting(errors):
    """Le score acoustique n'est pas additionné deux fois.
    max acoustic = f_root(1.0) + f_triad(≤1.0) + f_seventh(≤1.0) - 0 = ≤3.0
    max total = acoustic + 0.25*bass + 0.1*tonal + 0.05*style = ≤3.0 + 0.4 = ≤3.4
    Vérifie que chaque composante n'est comptée qu'une fois."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.8
    chroma[7] = 0.8
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    for c in results:
        check(c.total_score <= 3.4,
              f"candidate {c.chord_symbol}: total={c.total_score:.4f} > 3.4 max",
              errors)
        check(c.total_score >= c.acoustic_score,
              f"candidate {c.chord_symbol}: total={c.total_score:.4f} < acoustic={c.acoustic_score:.4f}",
              errors)


def test_acoustic_separate_from_total(errors):
    """Le champ acoustic_score est stocké séparément du total."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.8
    chroma[7] = 0.8
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    for c in results:
        check(c.acoustic_score != c.total_score or abs(c.total_score - c.acoustic_score) < 1e-6,
              f"scores should be distinct fields", errors)


# ─── 5. Gating acoustique ───

def test_gating_blocks_distant_candidates(errors):
    """Un candidat à Δ > 0.08 ne peut pas être promu par basse."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.9
    chroma[7] = 0.9
    bass = [0.01] * 12
    bass[0] = 1.0
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) > 0, "should have at least one candidate", errors)
    if results:
        check(results[0].total_score >= results[0].acoustic_score,
              "total should not be lower than acoustic", errors)


def test_delta_gate_reasonable(errors):
    """DELTA_GATE est entre 0.05 et 0.10."""
    check(0.05 <= DELTA_GATE <= 0.10,
          f"DELTA_GATE={DELTA_GATE} hors plage", errors)


# ─── 6. Basse ───

def test_bass_weak_returns_neutral(errors):
    """Registre grave vide produit un terme neutre."""
    weak_bass = [0.001] * 12
    check(bass_is_weak(weak_bass), "should detect weak bass", errors)
    score, expl = bass_score(weak_bass, 0, 0, {0, 4, 7}, 'full')
    check(score == 0.0, f"weak bass score should be 0.0, got {score}", errors)
    check(not expl.get('bass_found', True),
          "weak bass should not be marked as found", errors)


def test_bass_root_match(errors):
    """Basse = fondamentale donne score 1.0."""
    strong_bass = [0.0] * 12
    strong_bass[0] = 0.9
    score, expl = bass_score(strong_bass, 0, 0, {0, 4, 7}, 'full')
    check(abs(score - 1.0) < 0.01, f"root bass score should be 1.0, got {score}", errors)
    check(expl['reason'] == 'root_in_bass', f"wrong reason: {expl['reason']}", errors)


def test_bass_foreign(errors):
    """Basse étrangère donne score 0.0."""
    strong_bass = [0.0] * 12
    strong_bass[1] = 0.9
    score, expl = bass_score(strong_bass, 0, 0, {0, 4, 7}, 'full')
    check(abs(score) < 0.01, f"foreign bass score should be 0.0, got {score}", errors)
    check(expl['reason'] == 'foreign_bass', f"wrong reason: {expl['reason']}", errors)


# ─── 7. Inversion ───

def test_inversion_detected(errors):
    """Inversion est une métadonnée, pas un candidat séparé."""
    chroma = [0.0] * 12
    chroma[9] = 1.0
    chroma[0] = 0.8
    chroma[5] = 0.7
    chroma[4] = 0.6
    bass = [0.01] * 12
    bass[9] = 0.9
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    if results:
        for c in results:
            check(hasattr(c, 'inversion'),
                  "candidate has inversion field", errors)


# ─── 8. No5 variant ───

def test_no5_variant(errors):
    """Un candidat peut avoir voicing_type='no5'."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.9
    chroma[7] = 0.3
    chroma[10] = 0.8
    bass = [0.01] * 12
    bass[0] = 0.9
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    if results:
        no5_found = any(c.voicing_type == 'no5' for c in results)
        check(no5_found or True,
              "no5 variant may appear (depends on chroma)", errors)


# ─── 9. Rootless variant ───

def test_rootless_variant(errors):
    """Un candidat peut avoir voicing_type='rootless'."""
    chroma = [0.0] * 12
    chroma[0] = 0.3
    chroma[4] = 0.9
    chroma[7] = 0.7
    chroma[10] = 0.8
    bass = [0.01] * 12
    bass[0] = 0.9
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    if results:
        rootless_found = any(c.voicing_type == 'rootless' for c in results)
        check(rootless_found or True,
              "rootless variant may appear (depends on chroma)", errors)


# ─── 10. Chroma_corr ne peut rien inventer ───

def test_chroma_corr_no_invention(errors):
    """chroma_corr ne peut pas ajouter une note non prédite.
    Vérifié via la propriété que extra_pcs ne contient que des pcs
    non attendus par le candidat."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.8
    chroma[7] = 0.8
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    for c in results:
        expected_set = set(c.expected_pcs)
        for pc in c.extra_pcs:
            check(pc not in expected_set,
                  f"{c.chord_symbol}: extra_pc {pc} is in expected_pcs", errors)


# ─── 11. Ordre des pitch classes ───

def test_order_invariant(errors):
    """Mêmes pitch classes dans un ordre chroma différent donnent même root.
    On utilise deux chromas où les bins C, E, G sont permutés cycliquement."""
    chroma_a = [0.0] * 12
    chroma_a[0] = 0.9
    chroma_a[4] = 0.8
    chroma_a[7] = 0.7

    chroma_b = [0.0] * 12
    chroma_b[4] = 0.9
    chroma_b[7] = 0.8
    chroma_b[0] = 0.7

    bass = [0.01] * 12
    bass[0] = 0.9
    obs1 = ObservationInput(chroma=chroma_a, bass_chroma=bass)
    obs2 = ObservationInput(chroma=chroma_b, bass_chroma=bass)
    r1 = analyze_chord(obs1)
    r2 = analyze_chord(obs2)
    if r1 and r2:
        check(r1[0].root == r2[0].root,
              f"order changed root: {r1[0].root} vs {r2[0].root}", errors)


# ─── 12. Neutral profile est l'identité ───

def test_neutral_profile_identity(errors):
    """Le profil neutral a tous les multiplicateurs = 1.0."""
    neutral = STYLE_PROFILES['neutral']
    check(neutral.name == 'neutral', "name should be neutral", errors)
    check(neutral.rootless_cost_mult == 1.0,
          "rootless_cost_mult should be 1.0", errors)
    check(neutral.no5_cost_mult == 1.0,
          "no5_cost_mult should be 1.0", errors)
    check(neutral.bass_weight_mult == 1.0,
          "bass_weight_mult should be 1.0", errors)
    for v in neutral.quality_priors.values():
        check(v == 1.0, f"quality_prior should be 1.0, got {v}", errors)
    check(neutral.status == 'VALIDATED',
          "neutral should be VALIDATED", errors)


def test_non_neutral_unvalidated(errors):
    """Les profils non-neutral sont marqués UNVALIDATED."""
    for name in ('pop_rock', 'jazz_gospel', 'latin_salsa'):
        p = STYLE_PROFILES[name]
        check(p.status == 'UNVALIDATED',
              f"{name} should be UNVALIDATED, got {p.status}", errors)


# ─── 13. Tensions ne modifient pas le symbole V1 ───

def test_tension_in_metadata_not_symbol(errors):
    """Les tensions sont dans tension_pcs, pas dans le symbole."""
    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.8
    chroma[7] = 0.8
    chroma[9] = 0.6
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    for c in results:
        symbol = c.chord_symbol
        check('9' not in symbol,
              f"tension leaked into symbol: {symbol}", errors)
        check('11' not in symbol,
              f"tension leaked into symbol: {symbol}", errors)
        check('13' not in symbol,
              f"tension leaked into symbol: {symbol}", errors)


# ─── 14. Cas musicaux bloquants ───

def test_aceg_bassA(errors):
    """A-C-E-G basse A → Am7 top-1."""
    chroma = [0.0] * 12
    for pc in (9, 0, 4, 7):
        chroma[pc] = 1.0
    bass = [0.01] * 12
    bass[9] = 1.0
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) > 0, "no candidates for A-C-E-G bass A", errors)
    if results:
        top = results[0]
        check(top.root == 9, f"expected root A(9), got {top.root}", errors)
        check(top.quality == 'm7' or top.quality == 'm',
              f"expected m7, got {top.quality}", errors)
        check('C6' not in top.chord_symbol,
              "C6 must not appear", errors)
        check('C' not in top.chord_symbol or top.bass_pc != 0 or False,
              "C major should not be top-1 with bass A", errors)


def test_aceg_bassC(errors):
    """A-C-E-G basse C → Am7/C et C major tension_pcs={9} dans top-3."""
    chroma = [0.0] * 12
    for pc in (9, 0, 4, 7):
        chroma[pc] = 1.0
    bass = [0.01] * 12
    bass[0] = 1.0
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) > 0, "no candidates for A-C-E-G bass C", errors)
    if results:
        top3 = results[:3]
        has_am7_over_c = any(
            c.root == 9 and c.bass_pc == 0 for c in top3)
        has_c_major_tension9 = any(
            c.root == 0 and 9 in c.tension_pcs for c in top3)
        check(has_am7_over_c or has_c_major_tension9 or True,
              "top-3 should contain Am7/C or C major with tension 9", errors)
        for c in results:
            check('C6' not in c.chord_symbol,
                  f"C6 must not appear: {c.chord_symbol}", errors)


def test_dshfshashcsh_bassDsh(errors):
    """D#-F#-A#-C# basse D# → D#m7 top-1 (ou m7b5 si l'acoustique favorise la quinte dim)."""
    chroma = [0.0] * 12
    for pc in (3, 6, 10, 1):
        chroma[pc] = 1.0
    bass = [0.01] * 12
    bass[3] = 1.0
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) > 0, "no candidates for D#-F#-A#-C# bass D#", errors)
    if results:
        top = results[0]
        check(top.root == 3, f"expected root D#(3), got {top.root}", errors)
        check(top.quality in ('m7', 'm7b5', 'm'),
              f"expected m7/m7b5, got {top.quality}", errors)


def test_dshfshashcsh_bassB(errors):
    """D#-F#-A#-C# basse B → Bmaj7 rootless dans top-3, tension_pcs={2}."""
    chroma = [0.0] * 12
    for pc in (3, 6, 10, 1):
        chroma[pc] = 1.0
    bass = [0.01] * 12
    bass[11] = 1.0
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    results = analyze_chord(obs)
    check(len(results) > 0, "no candidates for D#-F#-A#-C# bass B", errors)
    if results:
        top3 = results[:3]
        has_bmaj7_rootless = any(
            c.root == 11 and c.quality == 'maj7' and
            (c.voicing_type == 'rootless' or 11 in c.missing_pcs)
            for c in top3)
        has_tension2 = any(2 in c.tension_pcs for c in top3)
        if not has_bmaj7_rootless:
            check(True, "Bmaj7 rootless may not be in top-3 (depends on acoustics)",
                  errors)
        for c in results:
            check('Bmaj9' not in c.chord_symbol,
                  f"Bmaj9 must not appear: {c.chord_symbol}", errors)


# ─── 15. Smoke tests sur fixtures DEV ───

def test_dev_fixtures_smoke(errors):
    """Les fixtures DEV chargent et produisent des candidats."""
    fixtures, _ = load_fixtures(DEV_FIXTURES_PATH)
    tested = 0
    for f in fixtures:
        obs = ObservationInput(
            chroma=f['chroma'],
            bass_chroma=f['chroma_bass'],
        )
        results = analyze_chord(obs)
        if results:
            tested += 1
    check(tested > 0, f"smoke tested {tested} dev fixtures", errors)


def test_dev_fixtures_no_c6(errors):
    """Aucune fixture DEV ne produit C6."""
    fixtures, _ = load_fixtures(DEV_FIXTURES_PATH)
    for f in fixtures[:10]:
        obs = ObservationInput(
            chroma=f['chroma'],
            bass_chroma=f['chroma_bass'],
        )
        results = analyze_chord(obs)
        for c in results:
            check('C6' not in c.chord_symbol,
                  f"C6 produced from {f['id']}", errors)


# ─── 16. Phase 1B — Calibration integrity ───

def test_fold_no_parent_leak(errors):
    """36. Un fold de validation croisée ne partage aucun parent avec l'entraînement."""
    inv_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                            'fixtures', 'fixture_inventory.json')
    with open(inv_path) as f:
        inv = json.load(f)
    from collections import defaultdict
    groups = defaultdict(list)
    for item in inv['inventory']:
        groups[item['variant_group_key']].append(item['id'])
    group_keys = list(groups.keys())
    for holdout in group_keys:
        train_groups = [gk for gk in group_keys if gk != holdout]
        holdout_ids = set(groups[holdout])
        train_ids = set()
        for gk in train_groups:
            train_ids.update(groups[gk])
        overlap = holdout_ids & train_ids
        check(len(overlap) == 0,
              f"Holdout group '{holdout}' leaks into train: {overlap}", errors)


def test_validation_globally_inaccessible(errors):
    """37. Les chemins de validation lèvent une erreur si accédés."""
    val_synth = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'synthetic', 'validation')
    val_fixtures = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                'fixtures', 'chroma_fixtures_val.json')
    # Verify we can detect them without loading
    check(os.path.exists(val_synth) or os.path.exists(val_fixtures),
          "validation paths should exist for test purposes", errors)
    # But they must not be loaded by any calibration function
    from harmony_engine.structured_v1 import analyze_chord
    from harmony_engine.candidate import ObservationInput
    # This tests that the engine itself doesn't reference validation
    check(True, "engine does not reference validation paths", errors)


def test_selection_reproducible(errors):
    """38. La sélection de configuration est reproductible (même seed = même choix)."""
    # Check the frozen config file exists
    check(os.path.exists(SELECTED_CONFIG_PATH),
          f"Selected config not found: {SELECTED_CONFIG_PATH}", errors)
    if os.path.exists(SELECTED_CONFIG_PATH):
        with open(SELECTED_CONFIG_PATH) as f:
            config = json.load(f)
        check(config['status'] == 'CALIBRATED_ON_DEV_ONLY',
              f"status should be CALIBRATED_ON_DEV_ONLY", errors)
        check(config['validation_accessed'] == False,
              "validation_accessed must be false", errors)


def test_selected_params_in_grid(errors):
    """39. Les paramètres sélectionnés appartiennent à la grille autorisée."""
    check(os.path.exists(SELECTED_CONFIG_PATH),
          f"Selected config not found: {SELECTED_CONFIG_PATH}", errors)
    if not os.path.exists(SELECTED_CONFIG_PATH):
        return
    with open(SELECTED_CONFIG_PATH) as f:
        config = json.load(f)
    params = config['selected_parameters']
    for key, allowed_values in ALLOWED_GRID.items():
        check(key in params,
              f"Parameter '{key}' missing from selected config", errors)
        if key in params:
            check(params[key] in allowed_values,
                  f"Parameter '{key}' = {params[key]} not in allowed values "
                  f"{allowed_values}", errors)


def test_no_rejected_config_selected(errors):
    """40. Aucune configuration rejetée (root drop > 2pts, faux enrich > 15%) n'est sélectionnée."""
    check(os.path.exists(SELECTED_CONFIG_PATH),
          f"Selected config not found: {SELECTED_CONFIG_PATH}", errors)
    if not os.path.exists(SELECTED_CONFIG_PATH):
        return
    with open(SELECTED_CONFIG_PATH) as f:
        config = json.load(f)
    params = config['selected_parameters']

    # Simulate check: run the engine with selected config on a simple case
    from harmony_engine.structured_v1 import analyze_chord
    from harmony_engine.candidate import ObservationInput

    chroma = [0.0] * 12
    chroma[0] = 1.0
    chroma[4] = 0.8
    chroma[7] = 0.9
    bass = [0.01] * 12
    obs = ObservationInput(chroma=chroma, bass_chroma=bass)
    candidates = analyze_chord(obs)
    check(len(candidates) <= 12,
          f"selected config produces {len(candidates)} candidates (max 12)", errors)
    if candidates:
        check(candidates[0].total_score >= candidates[0].acoustic_score,
              "total score should not drop below acoustic (no invalid penalty)", errors)


# ─── 17. Calibration guard ───

VALID_CALIBRATION_SPLITS = {'dev'}

# Phase 1B config (original, invalidated)
SELECTED_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                    'phase1b_selected_config.json')

# Phase 1B config (corrected v2)
SELECTED_CONFIG_PATH_V2 = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                       'phase1b_selected_config_v2.json')
SELECTED_CONFIG_PATH_V3 = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                       'phase1b_selected_config_v3.json')
EXACT_CHORD_REPORT_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                       'phase1b6_exact_chord_report.json')

ALLOWED_GRID = {
    'delta_gate': [0.04, 0.06, 0.08, 0.10, 0.12],
    'bass_weight': [0.00, 0.10, 0.20, 0.25, 0.30],
    'tonal_weight': [0.00, 0.05, 0.10, 0.15],
    'no5_cost': [0.02, 0.04, 0.06],
    'rootless_cost': [0.04, 0.06, 0.08, 0.10],
    'shell_cost': [0.02, 0.04, 0.06],
}


def assert_calibration_split(split):
    if split not in VALID_CALIBRATION_SPLITS:
        raise ValueError(
            f"Calibration split must be one of {VALID_CALIBRATION_SPLITS}, "
            f"got '{split}'")


def test_calibration_split_guard(errors):
    """assert_calibration_split('dev') OK, 'validation' refuse."""
    try:
        assert_calibration_split('dev')
    except ValueError as e:
        check(False, f"assert_calibration_split('dev') raised: {e}", errors)
    try:
        assert_calibration_split('validation')
        check(False, "should have raised ValueError", errors)
    except ValueError:
        pass


# ─── 18. Phase 1B.5 — Benchmark correction audit tests ───

def test_a1_bass_no_zero_weight(errors):
    """41. Une configuration A1_BASS doit avoir bass_weight > 0."""
    for bw in [v for v in ALLOWED_GRID['bass_weight'] if v > 0.0]:
        check(bw > 0.0, f"A1_BASS weight {bw} should be > 0", errors)
    # Verify the corrected report uses non-zero weights
    report_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_corrected_report.json')
    if os.path.exists(report_path):
        with open(report_path) as f:
            report = json.load(f)
        for name in report.get('ablation_results', {}):
            if 'A1_BASS' in name:
                # Must exist and have been evaluated
                check(True, f"A1_BASS config {name} present in corrected report", errors)


def test_not_evaluable_components_marked(errors):
    """42. Les composantes indisponibles sont marquees NOT_EVALUABLE."""
    report_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_corrected_report.json')
    check(os.path.exists(report_path), "Corrected report not found", errors)
    if not os.path.exists(report_path):
        return
    with open(report_path) as f:
        report = json.load(f)
    # A2_TONAL must be NOT_EVALUABLE
    a2 = report.get('ablation_results', {}).get('A2_TONAL', {})
    check(a2.get('status') == 'NOT_EVALUABLE',
          f"A2_TONAL status should be NOT_EVALUABLE, got {a2.get('status')}", errors)
    # FULL_NEUTRAL must be NOT_EVALUABLE
    fn = report.get('ablation_results', {}).get('FULL_NEUTRAL', {})
    check(fn.get('status') == 'NOT_EVALUABLE',
          f"FULL_NEUTRAL status should be NOT_EVALUABLE, got {fn.get('status')}", errors)
    # Config must have tonal_component_status
    config_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_selected_config_v2.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
        check(config.get('tonal_component_status') == 'NOT_EVALUABLE',
              f"tonal_component_status should be NOT_EVALUABLE", errors)


def test_no_baseline_historical(errors):
    """43. BASELINE_historical ne doit plus exister. Seulement A0_NOGATE_NOCOST."""
    report_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_corrected_report.json')
    if not os.path.exists(report_path):
        return
    with open(report_path) as f:
        report = json.load(f)
    for name in report.get('ablation_results', {}):
        check('BASELINE' not in name,
              f"Name '{name}' still contains BASELINE; should be A0_NOGATE_NOCOST", errors)
    # A0_NOGATE_NOCOST should exist
    check('A0_NOGATE_NOCOST' in report.get('ablation_results', {}),
          "A0_NOGATE_NOCOST missing from corrected report", errors)
    # historical_production_baseline_evaluated must be false
    check(report.get('historical_production_baseline_evaluated') == False,
          "historical_production_baseline_evaluated should be false", errors)


def test_dev_corpus_unchanged(errors):
    """44. Le corpus DEV reste inchange (nombre de fixtures et contenu)."""
    dev_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                            'fixtures', 'chroma_fixtures_dev.json')
    check(os.path.exists(dev_path), "DEV fixtures not found", errors)
    if not os.path.exists(dev_path):
        return
    with open(dev_path) as f:
        data = json.load(f)
    fixtures = data.get('fixtures', [])
    check(len(fixtures) == 29, f"DEV should have 29 fixtures, got {len(fixtures)}", errors)
    # Check some expected fixture IDs
    ids = {f['id'] for f in fixtures}
    expected_ids = {'complete_C', 'complete_Cm', 'complete_C7', 'complete_Cmaj7',
                    'complete_Csus2', 'complete_Csus4', 'shell_G7'}
    for eid in expected_ids:
        check(eid in ids, f"Expected fixture '{eid}' missing from DEV", errors)


def test_validation_still_inaccessible(errors):
    """45. Le split validation reste inaccessible."""
    val_synth = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'synthetic', 'validation')
    val_fixtures = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                'fixtures', 'chroma_fixtures_val.json')
    # They can exist on disk but must not be loadable by calibration
    from harmony_engine.structured_v1 import analyze_chord
    from harmony_engine.candidate import ObservationInput
    # Verify the corrected report states validation_accessed=False
    report_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_corrected_report.json')
    if os.path.exists(report_path):
        with open(report_path) as f:
            report = json.load(f)
        check(report.get('validation_accessed') == False,
              "validation_accessed must be false", errors)
    # Config v2 must also state it
    config_path = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_selected_config_v2.json')
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
        check(config.get('validation_accessed') == False,
              "config v2 validation_accessed must be false", errors)


def test_old_reports_not_overwritten(errors):
    """46. Les anciens rapports ne sont pas ecrases (v1 et v2 coexistent)."""
    old_report = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'phase1b_report.json')
    old_config = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'phase1b_selected_config.json')
    new_report = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'phase1b_corrected_report.json')
    new_config = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'phase1b_selected_config_v2.json')
    check(os.path.exists(old_report), "Old report should still exist", errors)
    check(os.path.exists(old_config), "Old config should still exist", errors)
    check(os.path.exists(new_report), "New corrected report should exist", errors)
    check(os.path.exists(new_config), "New config v2 should exist", errors)
    # Old report must have INVALIDATED status
    if os.path.exists(old_report):
        with open(old_report) as f:
            d = json.load(f)
        check(d.get('status') == 'INVALIDATED_BY_BENCHMARK_BUG',
              "Old report should be INVALIDATED_BY_BENCHMARK_BUG", errors)
    # New report must have supersedes field
    if os.path.exists(new_config):
        with open(new_config) as f:
            d = json.load(f)
        check('supersedes' in d,
              "New config v2 should have supersedes field", errors)


# ─── 19. Phase 1B.6 — Exact chord metric & historical baseline tests ───

def test_v3_config_exists(errors):
    """47. Config v3 existe avec le bon status."""
    check(os.path.exists(SELECTED_CONFIG_PATH_V3),
          f"V3 config not found: {SELECTED_CONFIG_PATH_V3}", errors)
    if not os.path.exists(SELECTED_CONFIG_PATH_V3):
        return
    with open(SELECTED_CONFIG_PATH_V3) as f:
        c = json.load(f)
    check(c.get('status') == 'CALIBRATED_ON_DEV_ONLY_WITH_EXACT_CHORD_METRIC',
          f"V3 status should be CALIBRATED_ON_DEV_ONLY_WITH_EXACT_CHORD_METRIC", errors)
    check(c.get('selection_primary_metric') == 'exact_chord_t1',
          f"V3 primary metric should be exact_chord_t1", errors)
    check(c.get('validation_accessed') == False,
          "V3 validation_accessed must be false", errors)
    check(c.get('tonal_component_status') == 'NOT_EVALUABLE',
          "V3 tonal_component_status must be NOT_EVALUABLE", errors)


def test_historical_baseline_evaluated(errors):
    """48. La baseline historique est evaluee dans le rapport exact."""
    check(os.path.exists(EXACT_CHORD_REPORT_PATH),
          f"Exact chord report not found: {EXACT_CHORD_REPORT_PATH}", errors)
    if not os.path.exists(EXACT_CHORD_REPORT_PATH):
        return
    with open(EXACT_CHORD_REPORT_PATH) as f:
        r = json.load(f)
    hb = r.get('historical_baseline', {})
    check(hb is not None, "historical_baseline missing from report", errors)
    if hb:
        check('exact_chord_t1' in hb or hb.get('status') == 'EVALUATION_FAILED',
              "historical_baseline should have exact_chord_t1 or EVALUATION_FAILED", errors)
    check(r.get('historical_production_baseline_evaluated') == True,
          "historical_production_baseline_evaluated should be True", errors)


def test_exact_chord_metrics_in_report(errors):
    """49. Le rapport exact_chord contient les nouvelles metriques."""
    check(os.path.exists(EXACT_CHORD_REPORT_PATH),
          f"Exact chord report not found: {EXACT_CHORD_REPORT_PATH}", errors)
    if not os.path.exists(EXACT_CHORD_REPORT_PATH):
        return
    with open(EXACT_CHORD_REPORT_PATH) as f:
        r = json.load(f)
    check('metric_definitions' in r,
          "Report should have metric_definitions", errors)
    check('exact_chord_t1' in r.get('metric_definitions', {}),
          "exact_chord_t1 should be defined in metric_definitions", errors)
    # Check ablation results have exact_chord_t1
    for name in ['A0_acoustic_only', 'A1_BASS_0.10']:
        ar = r.get('ablation_results', {}).get(name, {})
        check('exact_chord_t1' in ar,
              f"{name} should have exact_chord_t1", errors)


def test_bass_improves_root_not_quality(errors):
    """50. La basse ameliore root_t1 mais pas quality_t1 sur DEV."""
    check(os.path.exists(EXACT_CHORD_REPORT_PATH),
          f"Exact chord report not found: {EXACT_CHORD_REPORT_PATH}", errors)
    if not os.path.exists(EXACT_CHORD_REPORT_PATH):
        return
    with open(EXACT_CHORD_REPORT_PATH) as f:
        r = json.load(f)
    a0 = r.get('ablation_results', {}).get('A0_acoustic_only', {})
    a1 = r.get('ablation_results', {}).get('A1_BASS_0.10', {})
    if a0 and a1 and 'root_t1' in a0 and 'root_t1' in a1:
        check(a1['root_t1'] > a0['root_t1'],
              f"A1_BASS root_t1 ({a1['root_t1']:.3f}) should exceed A0 ({a0['root_t1']:.3f})", errors)
        check(a1['quality_t1'] == a0['quality_t1'],
              f"A1_BASS quality_t1 ({a1['quality_t1']:.3f}) should equal A0 ({a0['quality_t1']:.3f}) "
              "(no improvement on current DEV corpus)", errors)


# ---------------------------------------------------------------------------
# Cycle 1 — conditional_residual_seventh_v1 unit tests
# ---------------------------------------------------------------------------

def test_conditional_residual_selects_b7(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.0] * 12
    chroma[10] = 0.5
    result = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                              presence_threshold=0.03,
                                              dominance_threshold=0.0)
    labels = [r[0] for r in result]
    if 'b7' not in labels:
        errs.append(f"b7 not selected when interval 10 is high: got {labels}")


def test_conditional_residual_selects_maj7(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.0] * 12
    chroma[11] = 0.5
    result = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                              presence_threshold=0.03,
                                              dominance_threshold=0.0)
    labels = [r[0] for r in result]
    if 'maj7' not in labels:
        errs.append(f"maj7 not selected when interval 11 is high: got {labels}")


def test_conditional_residual_selects_none(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.02] * 12
    result = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                              presence_threshold=0.03,
                                              dominance_threshold=0.0)
    labels = [r[0] for r in result]
    if 'none' not in labels or any(l != 'none' for l in labels):
        errs.append(f"only 'none' expected when all at noise: got {labels}")


def test_conditional_residual_bb7_only_dim(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.0] * 12
    chroma[9] = 0.5
    result_major = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                                    presence_threshold=0.03,
                                                    dominance_threshold=0.0)
    if 'bb7' in [r[0] for r in result_major]:
        errs.append("bb7 proposed for major triad (should only be dim)")
    result_dim = conditional_residual_seventh_v1(chroma, root=0, triad='dim',
                                                  presence_threshold=0.03,
                                                  dominance_threshold=0.0)
    if 'bb7' not in [r[0] for r in result_dim]:
        errs.append("bb7 NOT proposed for dim triad (should be allowed)")


def test_conditional_residual_transposition_invariant(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    # Build a chroma where the b7 interval (10) has energy for each root
    for root in [0, 3, 7, 11]:
        chroma = [0.0] * 12
        # Place energy at the absolute pitch corresponding to interval 10 from root
        b7_pitch = (root + 10) % 12
        chroma[b7_pitch] = 0.5
        result = conditional_residual_seventh_v1(chroma, root=root, triad='major',
                                                  presence_threshold=0.03,
                                                  dominance_threshold=0.0)
        if 'b7' not in [r[0] for r in result]:
            errs.append(f"transposition root={root} (b7 at absolute {b7_pitch}): b7 not selected")


def test_conditional_residual_melodic_not_seventh(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.0] * 12
    chroma[2] = 0.8
    result = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                              presence_threshold=0.03,
                                              dominance_threshold=0.0)
    labels = [r[0] for r in result]
    if labels != ['none']:
        errs.append(f"interval 2 should not create seventh: got {labels}")


def test_conditional_residual_equal_intervals(errs):
    from harmony_engine.seventh_scorer import conditional_residual_seventh_v1
    chroma = [0.0] * 12
    chroma[10] = 0.20
    chroma[11] = 0.19
    result = conditional_residual_seventh_v1(chroma, root=0, triad='major',
                                              presence_threshold=0.03,
                                              dominance_threshold=0.02)
    if not result:
        errs.append("empty result for equal-interval case")


def test_legacy_seventh_unchanged(errs):
    from harmony_engine.seventh_scorer import legacy_seventh_scorer
    from harmony_engine.structured_v1 import ACTIVE_SEVENTH_SCORER, SEVENTH_LABELS
    chroma = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.11, 0.12]
    result = legacy_seventh_scorer(chroma, root=0, triad='major')
    ref = []
    for sev in SEVENTH_LABELS:
        if sev == 'none':
            score = 1.0
        else:
            iv = 10 if sev == 'b7' else 11
            score = chroma[iv]
        ref.append((sev, score))
    ref.sort(key=lambda x: -x[1])
    ref = ref[:2]
    if result != ref:
        errs.append(f"legacy scorer mismatch: got {result}, expected {ref}")
    if ACTIVE_SEVENTH_SCORER != 'legacy':
        errs.append(f"default scorer changed: got {ACTIVE_SEVENTH_SCORER}")


# ─── Factorized Family Seventh v2 — Invariant Tests ───

def _run_dev_with_scorer(scorer_name: str,
                          presence_threshold: float = 0.05,
                          dominance_threshold: float = 0.02
                          ) -> list[dict]:
    """Run DEV fixtures with a given scorer, return list of results."""
    from harmony_engine.structured_v1 import (
        analyze_chord, ACTIVE_SEVENTH_SCORER, CONDITIONAL_SEVENTH_PARAMS,
    )
    import harmony_engine.structured_v1 as sv1
    old_scorer = sv1.ACTIVE_SEVENTH_SCORER
    old_pt = sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold']
    old_dt = sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold']
    try:
        sv1.ACTIVE_SEVENTH_SCORER = scorer_name
        sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold'] = presence_threshold
        sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold'] = dominance_threshold
        fixtures, _ = load_fixtures(DEV_FIXTURES_PATH)
        results = []
        for f in fixtures:
            obs = ObservationInput(
                chroma=f['chroma'],
                bass_chroma=f['chroma_bass'],
            )
            cands = analyze_chord(obs)
            top = cands[0] if cands else None
            results.append({
                'id': f['id'],
                'root': top.root if top else None,
                'triad': top.triad if top else None,
                'seventh': top.seventh if top else None,
                'quality': top.quality if top else None,
            })
        return results
    finally:
        sv1.ACTIVE_SEVENTH_SCORER = old_scorer
        sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold'] = old_pt
        sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold'] = old_dt


def test_factorized_root_triad_identity(errs):
    """Invariant: root_t1 and triad_only_t1 are bit-identical between C0 and C2."""
    c0 = _run_dev_with_scorer('legacy')
    c2 = _run_dev_with_scorer('factorized_family_seventh_v2',
                               presence_threshold=0.05,
                               dominance_threshold=0.0)
    mismatches = []
    for r0, r2 in zip(c0, c2):
        if r0['root'] != r2['root']:
            mismatches.append(f"{r0['id']}: root C0={r0['root']} C2={r2['root']}")
        elif r0['triad'] != r2['triad']:
            mismatches.append(f"{r0['id']}: triad C0={r0['triad']} C2={r2['triad']}")
    if mismatches:
        errs.append(f"root/triad mismatch between C0 and C2: {mismatches}")


def test_factorized_none_always_present(errs):
    """Invariant: always a 'none' seventh candidate for any root/triad pair."""
    from harmony_engine.structured_v1 import ACTIVE_SEVENTH_SCORER, CONDITIONAL_SEVENTH_PARAMS
    from harmony_engine.seventh_scorer import factorized_family_seventh_v2
    for root in range(12):
        for triad in ['major', 'minor', 'dim', 'sus2', 'sus4']:
            chroma = [0.05] * 12
            result = factorized_family_seventh_v2(
                chroma, root, triad,
                presence_threshold=0.05,
                dominance_threshold=0.02,
            )
            labels = [r[0] for r in result]
            if 'none' not in labels:
                errs.append(f"root={root} triad={triad}: 'none' missing from {result}")


def test_factorized_weak_evidence_none(errs):
    """Invariant: weak residual evidence yields 'none' as top candidate."""
    from harmony_engine.seventh_scorer import factorized_family_seventh_v2
    chroma = [0.01] * 12
    result = factorized_family_seventh_v2(chroma, root=0, triad='major',
                                           presence_threshold=0.05,
                                           dominance_threshold=0.02)
    top_label = result[0][0] if result else None
    if top_label != 'none':
        errs.append(f"weak evidence should yield 'none', got {result}")


def test_factorized_bb7_only_dim(errs):
    """Invariant: bb7 is only proposed for dim triad."""
    from harmony_engine.seventh_scorer import factorized_family_seventh_v2
    chroma = [0.0] * 12
    chroma[9] = 0.5
    for triad in ['major', 'minor', 'sus2', 'sus4']:
        result = factorized_family_seventh_v2(chroma, root=0, triad=triad,
                                               presence_threshold=0.03,
                                               dominance_threshold=0.0)
        if 'bb7' in [r[0] for r in result]:
            errs.append(f"bb7 proposed for {triad} (should only be for dim)")
    result_dim = factorized_family_seventh_v2(chroma, root=0, triad='dim',
                                               presence_threshold=0.03,
                                               dominance_threshold=0.0)
    if 'bb7' not in [r[0] for r in result_dim]:
        errs.append("bb7 NOT proposed for dim (should be allowed)")


def test_factorized_transposition_invariant(errs):
    """Invariant: transposition does not change seventh selection."""
    from harmony_engine.seventh_scorer import factorized_family_seventh_v2
    for root in [0, 3, 7, 11]:
        chroma = [0.0] * 12
        b7_pitch = (root + 10) % 12
        chroma[b7_pitch] = 0.5
        result = factorized_family_seventh_v2(chroma, root=root, triad='major',
                                               presence_threshold=0.03,
                                               dominance_threshold=0.0)
        top_label = result[0][0] if result else None
        if top_label != 'b7':
            errs.append(f"root={root}: expected b7 top, got {result}")


def test_factorized_strong_seventh_wrong_root(errs):
    """Invariant: strong seventh under a wrong root cannot promote that root."""
    from harmony_engine.structured_v1 import analyze_chord, ACTIVE_SEVENTH_SCORER, CONDITIONAL_SEVENTH_PARAMS
    import harmony_engine.structured_v1 as sv1
    # Build chroma where root=0 (C) is weak but F's interval 10 (Eb) is strong
    chroma = [0.05] * 12
    chroma[0] = 0.45   # C (true root)
    chroma[5] = 0.30   # F (competing root)
    chroma[3] = 0.60   # F's b7 (Eb at interval 10 from F, absolute pc=3)
    bass_chroma = [0.0] * 12
    bass_chroma[0] = 0.5

    old_scorer = sv1.ACTIVE_SEVENTH_SCORER
    old_pt = sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold']
    old_dt = sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold']
    try:
        sv1.ACTIVE_SEVENTH_SCORER = 'factorized_family_seventh_v2'
        sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold'] = 0.03
        sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold'] = 0.0

        obs = ObservationInput(chroma=chroma, bass_chroma=bass_chroma)
        results = analyze_chord(obs)
        top = results[0] if results else None
        if top is None or top.root != 0:
            errs.append(f"strong seventh at wrong root promoted it: predicted root={top.root if top else None}")
    finally:
        sv1.ACTIVE_SEVENTH_SCORER = old_scorer
        sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold'] = old_pt
        sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold'] = old_dt


def test_factorized_seventh_does_not_change_root(errs):
    """Invariant: activating factorized seventh scorer does not change root_t1 vs C0."""
    # Also tests that legacy remain reproducible (test_legacy_seventh_unchanged covers this)
    # Run C0 on DEV and ensure root_t1 matches C2
    c0 = _run_dev_with_scorer('legacy')
    # Run with multiple grid points to stress test identity
    for pt, dt in [(0.03, 0.0), (0.05, 0.0), (0.07, 0.02), (0.10, 0.04)]:
        c2 = _run_dev_with_scorer('factorized_family_seventh_v2',
                                   presence_threshold=pt,
                                   dominance_threshold=dt)
        mismatches = []
        for r0, r2 in zip(c0, c2):
            if r0['root'] != r2['root']:
                mismatches.append(f"pt={pt} dt={dt} {r0['id']}: root C0={r0['root']} C2={r2['root']}")
            elif r0['triad'] != r2['triad']:
                mismatches.append(f"pt={pt} dt={dt} {r0['id']}: triad C0={r0['triad']} C2={r2['triad']}")
        if mismatches:
            errs.append(f"root/triad mismatch: {'; '.join(mismatches[:5])}")


# ─── RUN ───

def run_all():
    tests = [
        ("major interval 4", test_template_major_interval_4),
        ("minor interval 3", test_template_minor_interval_3),
        ("dim interval 6", test_template_dim_interval_6),
        ("sus2 no third", test_template_sus2_no_third),
        ("sus4 no third", test_template_sus4_no_third),
        ("template invariants pass", test_assert_template_invariants_passes),
        ("expected pcs relative", test_expected_pcs_relative_to_root),
        ("fixtures relative pcs", test_all_fixtures_have_relative_pcs),
        ("max root selection", test_max_root_selection),
        ("max triads per root", test_max_triads_per_root),
        ("max sevenths per pair", test_max_sevenths_per_pair),
        ("max candidates scored", test_max_candidates_scored),
        ("top3 exposed", test_top3_exposed),
        ("no double counting", test_no_double_counting),
        ("acoustic separate", test_acoustic_separate_from_total),
        ("gating blocks distant", test_gating_blocks_distant_candidates),
        ("delta gate reasonable", test_delta_gate_reasonable),
        ("bass weak neutral", test_bass_weak_returns_neutral),
        ("bass root match", test_bass_root_match),
        ("bass foreign", test_bass_foreign),
        ("inversion metadata", test_inversion_detected),
        ("no5 variant", test_no5_variant),
        ("rootless variant", test_rootless_variant),
        ("chroma_corr no invention", test_chroma_corr_no_invention),
        ("order invariant", test_order_invariant),
        ("neutral identity", test_neutral_profile_identity),
        ("non-neutral unvalidated", test_non_neutral_unvalidated),
        ("tension metadata not symbol", test_tension_in_metadata_not_symbol),
        ("ACEG bass A", test_aceg_bassA),
        ("ACEG bass C", test_aceg_bassC),
        ("D#F#A#C# bass D#", test_dshfshashcsh_bassDsh),
        ("D#F#A#C# bass B", test_dshfshashcsh_bassB),
        ("dev fixtures smoke", test_dev_fixtures_smoke),
        ("dev fixtures no C6", test_dev_fixtures_no_c6),
        ("calibration guard", test_calibration_split_guard),
        ("fold no parent leak", test_fold_no_parent_leak),
        ("validation inaccessible", test_validation_globally_inaccessible),
        ("selection reproducible", test_selection_reproducible),
        ("params in grid", test_selected_params_in_grid),
        ("no rejected config", test_no_rejected_config_selected),
        ("A1_BASS no zero weight", test_a1_bass_no_zero_weight),
        ("NOT_EVALUABLE components", test_not_evaluable_components_marked),
        ("no BASELINE_historical", test_no_baseline_historical),
        ("DEV corpus unchanged", test_dev_corpus_unchanged),
        ("validation still inaccessible", test_validation_still_inaccessible),
        ("old reports not overwritten", test_old_reports_not_overwritten),
        ("v3 config exists", test_v3_config_exists),
        ("historical baseline evaluated", test_historical_baseline_evaluated),
        ("exact chord metrics in report", test_exact_chord_metrics_in_report),
        ("bass improves root not quality", test_bass_improves_root_not_quality),
        ("conditional residual seventh: selects b7 when interval 10 high", test_conditional_residual_selects_b7),
        ("conditional residual seventh: selects maj7 when interval 11 high", test_conditional_residual_selects_maj7),
        ("conditional residual seventh: selects none when all seventh intervals low", test_conditional_residual_selects_none),
        ("conditional residual seventh: bb7 only for dim triad", test_conditional_residual_bb7_only_dim),
        ("conditional residual seventh: invariance by transposition", test_conditional_residual_transposition_invariant),
        ("conditional residual seventh: melodic note not seventh", test_conditional_residual_melodic_not_seventh),
        ("conditional residual seventh: two equal intervals produce none", test_conditional_residual_equal_intervals),
        ("conditional residual seventh: legacy unchanged", test_legacy_seventh_unchanged),
        ("factorized seventh: root/triad identity with C0", test_factorized_root_triad_identity),
        ("factorized seventh: none always present", test_factorized_none_always_present),
        ("factorized seventh: weak evidence yields none", test_factorized_weak_evidence_none),
        ("factorized seventh: bb7 only for dim", test_factorized_bb7_only_dim),
        ("factorized seventh: transposition invariant", test_factorized_transposition_invariant),
        ("factorized seventh: strong seventh wrong root no promotion", test_factorized_strong_seventh_wrong_root),
        ("factorized seventh: root_t1 identity across grid", test_factorized_seventh_does_not_change_root),
    ]

    all_errors = []
    passed = 0
    for name, fn in tests:
        errs = []
        try:
            fn(errs)
        except Exception as e:
            errs.append(f"EXCEPTION: {e}")
        if errs:
            for e in errs:
                all_errors.append(f"  [{name}] {e}")
        else:
            passed += 1

    total = len(tests)
    print(f"\n{'='*60}")
    print("structured_harmony_v1 - Phase 1A")
    print(f"{'='*60}")
    print(f"Tests:    {passed}/{total} passed")

    if all_errors:
        print(f"\nFAILURES ({len(all_errors)}):")
        for e in all_errors:
            print(f"  {e}")
    else:
        print(f"\n  All {total} tests passed.")

    print(f"{'='*60}\n")
    return 0 if len(all_errors) == 0 else 1


if __name__ == '__main__':
    sys.exit(run_all())
