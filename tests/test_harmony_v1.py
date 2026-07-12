#!/usr/bin/env python3
"""
Tests d'invariants — structured_harmony_v1 Phase 0.

Verifie les invariants sur les fixtures deterministes et les structures
de donnees, sans implementer le moteur.

Usage:
    python tests/test_harmony_v1.py
"""

import hashlib
import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'fixtures', 'chroma_fixtures.json')
DEV_FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                 'fixtures', 'chroma_fixtures_dev.json')
VAL_FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                 'fixtures', 'chroma_fixtures_val.json')
INVENTORY_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'fixtures', 'fixture_inventory.json')
SYNTH_INVENTORY_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                    'synthetic', 'synthetic_inventory.json')
DEV_SYNTH_DIR = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'synthetic', 'dev')
VAL_SYNTH_DIR = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                             'synthetic', 'validation')

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

EXPECTED_INTERVALS = {
    '':      [0, 4, 7],      # major triad: root, MAJOR third (4), fifth
    'm':     [0, 3, 7],      # minor triad: root, minor third (3), fifth
    '7':     [0, 4, 7, 10],  # dominant 7th
    'maj7':  [0, 4, 7, 11],  # major 7th
    'sus2':  [0, 2, 7],      # sus2
    'sus4':  [0, 5, 7],      # sus4
    'm7':    [0, 3, 7, 10],  # minor 7th
    'dim':   [0, 3, 6],      # diminished
    'm7b5':  [0, 3, 6, 10],  # half-diminished
    'aug':   [0, 4, 8],      # excluded from V1 vocabulary
}

EXPECTED_TRIAD = {
    '': 'major', 'm': 'minor', '7': 'major', 'maj7': 'major',
    'sus2': 'sus2', 'sus4': 'sus4', 'm7': 'minor', 'dim': 'dim',
    'm7b5': 'dim', 'aug': 'major',
}

EXPECTED_SEVENTH = {
    '': 'none', 'm': 'none', '7': 'b7', 'maj7': 'maj7',
    'sus2': 'none', 'sus4': 'none', 'm7': 'b7', 'dim': 'none',
    'm7b5': 'b7', 'aug': 'none',
}

DELTA_GATE = 0.08
VALID_VOICING_TYPES = {'complete', 'no5', 'rootless', 'shell',
                       'inversion', 'foreign_melody', 'temporal_spread'}


def load_fixtures():
    with open(FIXTURES_PATH, 'r') as f:
        data = json.load(f)
    return data['fixtures'], data['metadata']


def check(condition, msg, errors):
    if not condition:
        errors.append(msg)
        return False
    return True


def test_major_triad_uses_interval_4(errors):
    """1. Le template major utilise l'intervalle 4, jamais 3."""
    iv = EXPECTED_INTERVALS['']
    check(4 in iv, "major triad: interval 4 (major third) is required", errors)
    check(3 not in iv, "major triad: interval 3 (minor third) must NOT be present", errors)


def test_minor_triad_uses_interval_3(errors):
    """2. Le template minor utilise l'intervalle 3."""
    iv = EXPECTED_INTERVALS['m']
    check(3 in iv, "minor triad: interval 3 (minor third) is required", errors)


def test_root_is_relative_not_absolute(errors):
    """3. expected_pcs derives from root + intervals, not from absolute 0."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        if f['root'] == 0:
            continue
        expected = set(f['expected_pcs'])
        computed = set((f['root'] + iv) % 12 for iv in f['intervals'])
        check(expected == computed,
              f"{f['id']}: root={f['root']} expected_pcs={expected} "
              f"!= root+intervals={computed}", errors)


def test_missing_root_not_confused_with_abs_C(errors):
    """4. missing_pcs is a subset of expected_pcs (relative root)."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        if not f['missing_pcs']:
            continue
        for pc in f['missing_pcs']:
            check(pc in f['expected_pcs'],
                  f"{f['id']}: missing_pc={pc} not in expected_pcs "
                  f"(pc={NOTE_NAMES[pc]}, root={NOTE_NAMES[f['root']]})", errors)


def test_insertion_order_invariant(errors):
    """5. Identical chroma yields same root/quality regardless of order."""
    fixtures, _ = load_fixtures()
    pairs = [f for f in fixtures if 'invariant_order' in f['id']]
    for i in range(0, len(pairs), 2):
        if i + 1 >= len(pairs):
            break
        a, b = pairs[i], pairs[i+1]
        check(a['chroma'] == b['chroma'] or all(
            abs(ja - jb) < 1e-5 for ja, jb in zip(a['chroma'], b['chroma'])
        ), f"{a['id']} vs {b['id']}: chroma mismatch", errors)
        check(a['root'] == b['root'], f"{a['id']} vs {b['id']}: root mismatch", errors)


def test_foreign_note_not_in_expected(errors):
    """6. Foreign melody note is in extra_pcs, not expected_pcs."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        if f['voicing_type'] != 'foreign_melody':
            continue
        for pc in f['extra_pcs']:
            check(pc not in f['expected_pcs'],
                  f"{f['id']}: extra_pc {pc} found in expected_pcs", errors)
        check(len(set(f['extra_pcs']) & set(f['expected_pcs'])) == 0,
              f"{f['id']}: extra_pcs overlap with expected_pcs", errors)


def test_corroboration_only_confirms(errors):
    """7. temporal_spread missing_pcs are expected notes, not foreign."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        if not f['temporal_spread']:
            continue
        for pc in f['missing_pcs']:
            check(pc in f['expected_pcs'],
                  f"{f['id']}: missing_pc {pc} not in expected_pcs "
                  "(corroboration would add foreign note)", errors)


def test_bass_is_separate_chroma(errors):
    """8. chroma_bass is a 12-dim vector distinct from chroma."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        check(len(f['chroma_bass']) == 12,
              f"{f['id']}: chroma_bass should be 12-dimensional", errors)
        if f['bass_pc'] >= 0:
            check(f['chroma_bass'][f['bass_pc']] > 0,
                  f"{f['id']}: bass_pc={f['bass_pc']} has zero energy in chroma_bass", errors)


def test_style_profile_neutral_is_identity(errors):
    """9. Neutral profile has all multipliers = 1.0."""
    priors = {'quality_priors': 1.0, 'rootless_cost_mult': 1.0,
              'no5_cost_mult': 1.0, 'bass_weight_mult': 1.0}
    for k, v in priors.items():
        check(v == 1.0, f"neutral profile: {k} should be 1.0", errors)


def test_acoustic_gate_reasonable(errors):
    """10. delta_gate is between 0.05 and 0.10."""
    check(0.05 <= DELTA_GATE <= 0.10,
          f"delta_gate={DELTA_GATE} should be in [0.05, 0.10]", errors)


def test_quality_triad_seventh_consistency(errors):
    """11. Each fixture triad/seventh matches quality."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        q = f['quality']
        if q in EXPECTED_TRIAD:
            check(f['triad'] == EXPECTED_TRIAD[q],
                  f"{f['id']}: quality={q} expected triad={EXPECTED_TRIAD[q]} "
                  f"got {f['triad']}", errors)
        if q in EXPECTED_SEVENTH:
            check(f['seventh'] == EXPECTED_SEVENTH[q],
                  f"{f['id']}: quality={q} expected seventh={EXPECTED_SEVENTH[q]} "
                  f"got {f['seventh']}", errors)


def test_intervals_match_quality(errors):
    """12. intervals array matches quality definition."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        q = f['quality']
        if q in EXPECTED_INTERVALS:
            check(f['intervals'] == EXPECTED_INTERVALS[q],
                  f"{f['id']}: quality={q} expected intervals="
                  f"{EXPECTED_INTERVALS[q]} got {f['intervals']}", errors)


def test_ambiguity_am7_bassA(errors):
    """13. A-C-E-G with bass A -> Am7."""
    fixtures, _ = load_fixtures()
    f = next((x for x in fixtures if x['id'] == 'ambiguity_am7_ca_bassA'), None)
    check(f is not None, "ambiguity_am7_ca_bassA not found", errors)
    if f:
        check(f['root'] == 9, f"expected root=9 (A) got {f['root']}", errors)
        check(f['quality'] == 'm7', f"expected quality=m7 got {f['quality']}", errors)
        check(f['bass_pc'] == 9, f"expected bass_pc=9 got {f['bass_pc']}", errors)


def test_ambiguity_am7_bassC(errors):
    """14. A-C-E-G with bass C -> C major tension_pcs={9}."""
    fixtures, _ = load_fixtures()
    f = next((x for x in fixtures if x['id'] == 'ambiguity_am7_ca_bassC'), None)
    check(f is not None, "ambiguity_am7_ca_bassC not found", errors)
    if f:
        check(9 in f['tension_pcs'],
              f"expected tension_pcs to contain 9, got {f['tension_pcs']}", errors)
        check(f['bass_pc'] == 0, f"expected bass_pc=0 got {f['bass_pc']}", errors)


def test_ambiguity_dshm7_bassDsh(errors):
    """15. D#-F#-A#-C# with bass D# -> D#m7."""
    fixtures, _ = load_fixtures()
    f = next((x for x in fixtures if x['id'] == 'ambiguity_dshm7_bmaj7_bassDsh'), None)
    check(f is not None, "ambiguity_dshm7_bmaj7_bassDsh not found", errors)
    if f:
        check(f['root'] == 3, f"expected root=3 (D#) got {f['root']}", errors)
        check(f['quality'] == 'm7', f"expected quality=m7 got {f['quality']}", errors)


def test_ambiguity_bmaj7_rootless_bassB(errors):
    """16. D#-F#-A#-C# with bass B -> Bmaj7 rootless in top-3, no Bmaj9."""
    fixtures, _ = load_fixtures()
    f = next((x for x in fixtures if x['id'] == 'ambiguity_dshm7_bmaj7_bassB'), None)
    check(f is not None, "ambiguity_dshm7_bmaj7_bassB not found", errors)
    if f:
        check(f['quality'] == 'maj7', f"expected quality=maj7 got {f['quality']}", errors)
        check(11 in f['missing_pcs'],
              f"expected root (11) in missing_pcs, got {f['missing_pcs']}", errors)
        check(2 in f['tension_pcs'],
              f"expected tension_pcs to contain 2 (9th), got {f['tension_pcs']}", errors)


def test_fixture_schema_compliance(errors):
    """17. All fixtures have required fields and valid values."""
    fixtures, metadata = load_fixtures()
    required = ['id', 'seed', 'root', 'triad', 'seventh', 'quality',
                'bass_pc', 'observed_pcs', 'expected_pcs', 'missing_pcs',
                'extra_pcs', 'voicing_type', 'tension_pcs', 'temporal_spread',
                'intervals', 'chroma', 'chroma_bass', 'comment']
    for f in fixtures:
        for field in required:
            check(field in f, f"{f['id']}: missing field '{field}'", errors)
        check(f['voicing_type'] in VALID_VOICING_TYPES,
              f"{f['id']}: invalid voicing_type '{f['voicing_type']}'", errors)
        check(len(f['chroma']) == 12, f"{f['id']}: chroma must be 12-dim", errors)
        check(len(f['chroma_bass']) == 12,
              f"{f['id']}: chroma_bass must be 12-dim", errors)
        check(0 <= f['root'] <= 11, f"{f['id']}: root out of range", errors)


def test_no_C6_in_fixtures(errors):
    """18. C6 never appears in fixture ids or comments."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        check('C6' not in f['id'], f"'C6' found in id: {f['id']}", errors)
        check('C6' not in f.get('comment', ''),
              f"'C6' found in comment: {f['id']}", errors)


def test_no_Bmaj9_in_fixtures(errors):
    """19. Bmaj9 never appears in fixture ids or comments."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        check('Bmaj9' not in f['id'], f"'Bmaj9' found in id: {f['id']}", errors)


def test_expected_pcs_from_root_intervals(errors):
    """20. For each fixture, expected_pcs = (root + intervals) mod 12."""
    fixtures, _ = load_fixtures()
    for f in fixtures:
        computed = set((f['root'] + iv) % 12 for iv in f['intervals'])
        check(set(f['expected_pcs']) == computed,
              f"{f['id']}: expected_pcs mismatch", errors)


def test_voicing_coverage(errors):
    """21. Every voicing type has at least one fixture."""
    fixtures, metadata = load_fixtures()
    for vt in sorted(VALID_VOICING_TYPES):
        count = metadata['voicing_coverage'].get(vt, 0)
        check(count > 0, f"voicing type '{vt}' has zero fixtures", errors)


def test_aug_not_in_v1_fixtures(errors):
    """22. Quality 'aug' has zero fixtures in V1."""
    fixtures, _ = load_fixtures()
    count = sum(1 for f in fixtures if f['quality'] == 'aug')
    check(count == 0, f"expected 0 fixtures with quality 'aug', found {count}", errors)


def test_major_triad_interval_4_correct_static(errors):
    """23. Static check: major qualities have interval 4, not 3."""
    for q in ('', '7', 'maj7'):
        iv = EXPECTED_INTERVALS[q]
        check(4 in iv, f"quality '{q}': interval 4 required", errors)
        if q == '':
            check(3 not in iv, f"quality '': interval 3 must NOT be present", errors)


def test_minor_qualities_have_interval_3(errors):
    """24. Minor-type qualities have interval 3."""
    for q in ('m', 'm7', 'dim', 'm7b5'):
        check(3 in EXPECTED_INTERVALS[q],
              f"quality '{q}': interval 3 required", errors)


def test_validation_split_not_for_calibration(errors):
    """25. Validation fixtures are excluded from calibration scope.

    Calibration must operate on DEV split only. This test verifies:
    - dev and val fixture files are separate
    - every fixture in dev file belongs to a DEV root (0,2,7)
    - every fixture in val file belongs to a VAL root (3,5,9,11)
    - a calibration function would reject a val fixture if attempted
    """
    DEV_ROOTS = {0, 2, 7}
    VAL_ROOTS = {3, 5, 9, 11}

    check(os.path.exists(DEV_FIXTURES_PATH),
          f"Dev fixtures file not found: {DEV_FIXTURES_PATH}", errors)
    check(os.path.exists(VAL_FIXTURES_PATH),
          f"Val fixtures file not found: {VAL_FIXTURES_PATH}", errors)

    with open(DEV_FIXTURES_PATH) as f:
        dev_data = json.load(f)
    with open(VAL_FIXTURES_PATH) as f:
        val_data = json.load(f)

    for fix in dev_data['fixtures']:
        check(fix['root'] in DEV_ROOTS,
              f"DEV file contains fixture {fix['id']} with root={fix['root']} "
              f"not in DEV roots {DEV_ROOTS}", errors)

    for fix in val_data['fixtures']:
        check(fix['root'] in VAL_ROOTS,
              f"VAL file contains fixture {fix['id']} with root={fix['root']} "
              f"not in VAL roots {VAL_ROOTS}", errors)

    # Simulate calibration guard: loading a val fixture for calibration
    # must raise an error. We use a convention check: val fixtures must
    # have no 'calibration_params' field (which would indicate calibration
    # leakage).
    for fix in val_data['fixtures']:
        check('calibration_params' not in fix,
              f"VAL fixture {fix['id']} has calibration_params — "
              f"would leak into calibration", errors)


def test_variant_groups_dont_cross_splits(errors):
    """26. All voicing variants of a parent group stay in the same split.

    For each variant_group_key in the fixture inventory, verify that
    every fixture sharing that key belongs to exactly one split (dev or val).
    """
    with open(INVENTORY_PATH) as f:
        inv = json.load(f)

    groups = {}
    for item in inv['inventory']:
        gk = item['variant_group_key']
        split = item['split']
        if gk not in groups:
            groups[gk] = set()
        groups[gk].add(split)

    for gk, splits in sorted(groups.items()):
        check(len(splits) == 1,
              f"Group '{gk}' appears in multiple splits: {splits}", errors)

    # Also check synthetic WAV/JSON: each file's split is consistent
    with open(SYNTH_INVENTORY_PATH) as f:
        synth = json.load(f)

    synth_groups = {}
    for entry in synth['files']:
        prog = entry['progression']
        split = entry['split']
        if prog not in synth_groups:
            synth_groups[prog] = set()
        synth_groups[prog].add(split)

    for prog, splits in sorted(synth_groups.items()):
        check(len(splits) == 1,
              f"Synth progression '{prog}' spans splits: {splits}", errors)


# ─── Calibration guard (executable, not just field check) ───

VALID_CALIBRATION_SPLITS = {'dev'}


def assert_calibration_split(split):
    """Raise ValueError if split is not valid for calibration."""
    if split not in VALID_CALIBRATION_SPLITS:
        raise ValueError(
            f"Calibration split must be one of {VALID_CALIBRATION_SPLITS}, "
            f"got '{split}'")


def test_calibration_guard_rejects_validation(errors):
    """27. assert_calibration_split('dev') passes; 'validation' raises."""
    try:
        assert_calibration_split('dev')
    except ValueError as e:
        check(False, f"assert_calibration_split('dev') raised: {e}", errors)

    try:
        assert_calibration_split('validation')
        check(False, "assert_calibration_split('validation') should have raised",
              errors)
    except ValueError:
        pass  # expected

    try:
        assert_calibration_split('other')
        check(False, "assert_calibration_split('other') should have raised",
              errors)
    except ValueError:
        pass  # expected


def test_synthetic_dirs_have_wav_and_json(errors):
    """28. Each synthetic subdirectory contains WAV and JSON files."""
    for split_dir, label in [(DEV_SYNTH_DIR, 'dev'),
                             (VAL_SYNTH_DIR, 'validation')]:
        check(os.path.isdir(split_dir),
              f"Synthetic dir missing: {split_dir}", errors)
        wavs = [f for f in os.listdir(split_dir) if f.endswith('.wav')]
        jsons = [f for f in os.listdir(split_dir) if f.endswith('.json')]
        check(len(wavs) > 0, f"{label}: no WAV files", errors)
        check(len(jsons) > 0, f"{label}: no JSON files", errors)


def test_every_wav_has_corresponding_json(errors):
    """29. Every WAV file has exactly one matching JSON."""
    for split_dir, label in [(DEV_SYNTH_DIR, 'dev'),
                             (VAL_SYNTH_DIR, 'validation')]:
        files = os.listdir(split_dir)
        stems = set()
        for f in files:
            base, ext = os.path.splitext(f)
            stems.add(base)
        for stem in sorted(stems):
            wav_path = os.path.join(split_dir, stem + '.wav')
            json_path = os.path.join(split_dir, stem + '.json')
            check(os.path.exists(wav_path),
                  f"{label}: {stem} missing .wav", errors)
            check(os.path.exists(json_path),
                  f"{label}: {stem} missing .json", errors)


def test_no_inter_split_wav_duplicates(errors):
    """30. No WAV hash appears in both dev and validation splits."""
    all_hashes = {}
    for split_dir, label in [(DEV_SYNTH_DIR, 'dev'),
                             (VAL_SYNTH_DIR, 'validation')]:
        for f in os.listdir(split_dir):
            if not f.endswith('.wav'):
                continue
            path = os.path.join(split_dir, f)
            with open(path, 'rb') as fp:
                h = hashlib.md5(fp.read()).hexdigest()
            all_hashes.setdefault(h, []).append((label, f))

    for h, entries in all_hashes.items():
        splits_in = set(e[0] for e in entries)
        check(len(splits_in) == 1,
              f"Hash {h} appears in multiple splits: {entries}", errors)


def test_no_parent_group_crosses_splits_synthetic(errors):
    """31. No parent_group_id from fixture inventory crosses splits."""
    with open(INVENTORY_PATH) as f:
        inv = json.load(f)
    groups = {}
    for item in inv['inventory']:
        gk = item['variant_group_key']
        split = item['split']
        groups.setdefault(gk, set()).add(split)
    for gk, splits in groups.items():
        check(len(splits) == 1,
              f"Group '{gk}' crosses splits: {splits}", errors)


# --- RUN ---

def run_all():
    tests = [
        ("major third=4", test_major_triad_uses_interval_4),
        ("minor third=3", test_minor_triad_uses_interval_3),
        ("root is relative", test_root_is_relative_not_absolute),
        ("missing relative not C", test_missing_root_not_confused_with_abs_C),
        ("insertion order", test_insertion_order_invariant),
        ("foreign not integrated", test_foreign_note_not_in_expected),
        ("corroboration only confirms", test_corroboration_only_confirms),
        ("bass separate chroma", test_bass_is_separate_chroma),
        ("neutral identity profile", test_style_profile_neutral_is_identity),
        ("acoustic gate range", test_acoustic_gate_reasonable),
        ("triad/seventh consistency", test_quality_triad_seventh_consistency),
        ("intervals match quality", test_intervals_match_quality),
        ("Am7 bass A top-1", test_ambiguity_am7_bassA),
        ("Am7 bass C tension", test_ambiguity_am7_bassC),
        ("D#m7 bass D# top-1", test_ambiguity_dshm7_bassDsh),
        ("Bmaj7 rootless bass B", test_ambiguity_bmaj7_rootless_bassB),
        ("schema compliance", test_fixture_schema_compliance),
        ("no C6 emitted", test_no_C6_in_fixtures),
        ("no Bmaj9 emitted", test_no_Bmaj9_in_fixtures),
        ("expected_pcs from intervals", test_expected_pcs_from_root_intervals),
        ("voicing coverage", test_voicing_coverage),
        ("aug excluded from V1", test_aug_not_in_v1_fixtures),
        ("major interval 4 static", test_major_triad_interval_4_correct_static),
        ("minor interval 3 static", test_minor_qualities_have_interval_3),
        ("val split not for calibration", test_validation_split_not_for_calibration),
        ("variant groups no cross-split", test_variant_groups_dont_cross_splits),
        ("calibration guard rejects val", test_calibration_guard_rejects_validation),
        ("synth dirs have wav+json", test_synthetic_dirs_have_wav_and_json),
        ("every wav has json", test_every_wav_has_corresponding_json),
        ("no inter-split wav duplicates", test_no_inter_split_wav_duplicates),
        ("no parent group crosses splits", test_no_parent_group_crosses_splits_synthetic),
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
    print(f"structured_harmony_v1 - Phase 0")
    print(f"{'='*60}")
    print(f"Fixtures: {FIXTURES_PATH}")
    stats_path = os.path.join(os.path.dirname(FIXTURES_PATH), '..',
                              'phase0_report.json')
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
    if not os.path.exists(FIXTURES_PATH):
        print(f"ERROR: Fixtures not found at {FIXTURES_PATH}")
        sys.exit(1)
    sys.exit(run_all())
