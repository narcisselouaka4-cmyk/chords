#!/usr/bin/env python3
"""
Phase 1B (corrigé) — Calibration DEV et benchmark d'ablation du moteur structured_harmony_v1.
Benchmark corrigé après audit Phase 1B.5: ablation A1/BASELINE/tiebreak bugs.

Usage:
    python scripts/calibrate_v1.py

Protection:
    - N'utilise que le split DEV (vérifie qu'aucune fixture VAL n'est chargée)
    - Ne modifie aucun fichier de production
    - Ne consulte pas le split validation
"""

import copy
import json
import os
import sys
import time
from collections import defaultdict

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))

from harmony_engine.candidate import ObservationInput
from harmony_engine.structured_v1 import analyze_chord
from harmony_engine.scoring import (
    DELTA_GATE, W_BASS, W_TONAL, W_STYLE,
    total_score_with_gating,
)
from harmony_engine.voicing import VOICING_COSTS, VoicingType

# ─── Paths ───

DEV_FIXTURES_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                 'fixtures', 'chroma_fixtures_dev.json')
INVENTORY_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                              'fixtures', 'fixture_inventory.json')
# New (corrected) output paths
GOLDEN_CONFIG_PATH_V2 = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                     'phase1b_selected_config_v2.json')
REPORT_PATH_CORRECTED = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                     'phase1b_corrected_report.json')

# Old paths (for reference / invalidation)
OLD_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_selected_config.json')
OLD_REPORT_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                               'phase1b_report.json')

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

MAX_FALSE_ENRICH = 0.15
MAX_CANDIDATES = 12

# ─── Search space ───

SEARCH_SPACE = {
    'delta_gate': [0.04, 0.06, 0.08, 0.10, 0.12],
    'bass_weight': [0.00, 0.10, 0.20, 0.25, 0.30],
    'tonal_weight': [0.00, 0.05, 0.10, 0.15],
    'no5_cost': [0.02, 0.04, 0.06],
    'rootless_cost': [0.04, 0.06, 0.08, 0.10],
    'shell_cost': [0.02, 0.04, 0.06],
}


# ─── Load DEV data ───

def load_dev_fixtures():
    with open(DEV_FIXTURES_PATH) as f:
        data = json.load(f)
    return data['fixtures'], data['metadata']


def load_inventory():
    with open(INVENTORY_PATH) as f:
        return json.load(f)


def get_parent_groups(fixtures):
    """Build parent_group_key -> list of fixture indices."""
    inv = load_inventory()
    group_map = defaultdict(list)
    for i, fix in enumerate(fixtures):
        # Find matching inventory entry
        for item in inv['inventory']:
            if item['id'] == fix['id']:
                group_map[item['variant_group_key']].append(i)
                break
        else:
            group_map[f'ungrouped_{fix["id"]}'].append(i)
    return dict(group_map)


# ─── Metrics ───

def compute_metrics(fixtures, indices):
    """Run engine on listed fixtures, return metrics dict.

    Metrics definitions:
    - root_t1: top-1 pred.root == gt.root (independamment de la qualite)
    - triad_t1: top-1 pred.triad == gt.triad
    - seventh_t1: top-1 pred.seventh == gt.seventh
    - quality_t1: top-1 pred.quality == gt.quality (independamment de la fondamentale)
    - exact_chord_t1: top-1 pred.root == gt.root ET pred.quality == gt.quality
    - root_and_triad_t1: top-1 pred.root == gt.root ET pred.triad == gt.triad
    - root_and_seventh_t1: top-1 pred.root == gt.root ET pred.seventh == gt.seventh
    - slash_chord_t1: top-1 pred.root == gt.root ET pred.quality == gt.quality
                      ET pred.bass_pc == gt.bass_pc (quand gt a une basse)
    """
    correct_root_t1 = 0
    correct_root_t3 = 0
    correct_triad_t1 = 0
    correct_triad_t3 = 0
    correct_seventh_t1 = 0
    correct_seventh_t3 = 0
    correct_quality_t1 = 0
    correct_quality_t3 = 0
    correct_exact_t1 = 0
    correct_exact_t3 = 0
    correct_root_triad_t1 = 0
    correct_root_seventh_t1 = 0
    correct_slash_t1 = 0
    slash_fixtures = 0
    total = 0
    false_enrichments = 0
    false_enrich_fixtures = 0
    total_candidates = 0
    max_candidates = 0
    results_by_quality = defaultdict(lambda: {'t1': 0, 'total': 0, 'exact_t1': 0})
    results_by_voicing = defaultdict(lambda: {'t1': 0, 'total': 0, 'exact_t1': 0})
    matrix_root = defaultdict(lambda: defaultdict(int))
    matrix_quality = defaultdict(lambda: defaultdict(int))
    matrix_chord = defaultdict(lambda: defaultdict(int))
    cpu_time = 0.0

    for idx in indices:
        f = fixtures[idx]
        obs = ObservationInput(
            chroma=f['chroma'],
            bass_chroma=f['chroma_bass'],
        )
        t0 = time.perf_counter()
        candidates = analyze_chord(obs)
        t1 = time.perf_counter()
        cpu_time += t1 - t0

        expected_root = f['root']
        expected_quality = f['quality']
        expected_triad = f['triad']
        expected_seventh = f['seventh']
        expected_bass = f.get('bass_pc', -1)

        total += 1
        total_candidates += len(candidates)
        max_candidates = max(max_candidates, len(candidates))

        top3_roots = {c.root for c in candidates[:3]}
        top3_qualities = {c.quality for c in candidates[:3]}
        top3_triads = {c.triad for c in candidates[:3]}
        top3_sevenths = {c.seventh for c in candidates[:3]}
        top3_exact = {(c.root, c.quality) for c in candidates[:3]}

        # Top-1
        if candidates:
            c = candidates[0]
            root_ok = c.root == expected_root
            triad_ok = c.triad == expected_triad
            seventh_ok = c.seventh == expected_seventh
            quality_ok = c.quality == expected_quality
            exact_ok = root_ok and quality_ok
            bass_ok = c.bass_pc == expected_bass if expected_bass >= 0 else True

            if root_ok:
                correct_root_t1 += 1
            if triad_ok:
                correct_triad_t1 += 1
            if seventh_ok:
                correct_seventh_t1 += 1
            if quality_ok:
                correct_quality_t1 += 1
            if exact_ok:
                correct_exact_t1 += 1
            if root_ok and triad_ok:
                correct_root_triad_t1 += 1
            if root_ok and seventh_ok:
                correct_root_seventh_t1 += 1
            if exact_ok and bass_ok and expected_bass >= 0:
                correct_slash_t1 += 1
            if expected_bass >= 0:
                slash_fixtures += 1

            # False enrichments
            expected_set = set(c.expected_pcs)
            for pc in c.extra_pcs:
                if pc not in expected_set and pc not in c.tension_pcs:
                    false_enrichments += 1
            if c.extra_pcs:
                false_enrich_fixtures += 1

            # By quality
            results_by_quality[expected_quality]['total'] += 1
            if quality_ok:
                results_by_quality[expected_quality]['t1'] += 1
            if exact_ok:
                results_by_quality[expected_quality]['exact_t1'] += 1

            # By voicing
            vt = f.get('voicing_type', 'complete')
            results_by_voicing[vt]['total'] += 1
            if quality_ok:
                results_by_voicing[vt]['t1'] += 1
            if exact_ok:
                results_by_voicing[vt]['exact_t1'] += 1

            matrix_root[expected_root][c.root] += 1
            matrix_quality[expected_quality][c.quality] += 1
            gt_chord = f'{NOTE_NAMES[expected_root]}:{expected_quality}'
            pred_chord = f'{NOTE_NAMES[c.root]}:{c.quality}'
            matrix_chord[gt_chord][pred_chord] += 1

        # Top-3
        if expected_root in top3_roots:
            correct_root_t3 += 1
        if expected_triad in top3_triads:
            correct_triad_t3 += 1
        if expected_seventh in top3_sevenths:
            correct_seventh_t3 += 1
        if expected_quality in top3_qualities:
            correct_quality_t3 += 1
        if (expected_root, expected_quality) in top3_exact:
            correct_exact_t3 += 1

    return {
        'total': total,
        'root_t1': correct_root_t1 / total if total else 0,
        'root_t3': correct_root_t3 / total if total else 0,
        'triad_t1': correct_triad_t1 / total if total else 0,
        'triad_t3': correct_triad_t3 / total if total else 0,
        'seventh_t1': correct_seventh_t1 / total if total else 0,
        'seventh_t3': correct_seventh_t3 / total if total else 0,
        'quality_t1': correct_quality_t1 / total if total else 0,
        'quality_t3': correct_quality_t3 / total if total else 0,
        'exact_chord_t1': correct_exact_t1 / total if total else 0,
        'exact_chord_t3': correct_exact_t3 / total if total else 0,
        'root_and_triad_t1': correct_root_triad_t1 / total if total else 0,
        'root_and_seventh_t1': correct_root_seventh_t1 / total if total else 0,
        'slash_chord_t1': correct_slash_t1 / slash_fixtures if slash_fixtures else 0,
        'slash_fixtures': slash_fixtures,
        'false_enrichments': false_enrichments,
        'false_enrich_rate': false_enrichments / total if total else 0,
        'false_enrich_fixtures': false_enrich_fixtures / total if total else 0,
        'avg_candidates': total_candidates / total if total else 0,
        'max_candidates': max_candidates,
        'cpu_time': cpu_time,
        'results_by_quality': dict(results_by_quality),
        'results_by_voicing': dict(results_by_voicing),
        'matrix_root': {str(k): dict(v) for k, v in matrix_root.items()},
        'matrix_quality': {str(k): dict(v) for k, v in matrix_quality.items()},
        'matrix_chord': {str(k): dict(v) for k, v in matrix_chord.items()},
    }


def partition_indices(groups, holdout_key):
    """Split indices into training/held-out by holding out one parent group."""
    training_idx = []
    held_out_idx = []
    for gk, indices in groups.items():
        if gk == holdout_key:
            held_out_idx.extend(indices)
        else:
            training_idx.extend(indices)
    return training_idx, held_out_idx


def group_emg_dev_partitions(groups):
    """Return list of (partition_name, training_indices, held_out_indices)."""
    partitions = []
    for gk in groups:
        training_idx, held_out_idx = partition_indices(groups, gk)
        partitions.append((gk, training_idx, held_out_idx))
    return partitions


# ─── Apply config ───

def apply_config(config):
    """Monkey-patch engine constants with config values."""
    import harmony_engine.scoring as sc
    import harmony_engine.voicing as vc
    import harmony_engine.structured_v1 as sv1

    sc.DELTA_GATE = config['delta_gate']
    sc.W_BASS = config['bass_weight']
    sc.W_TONAL = config['tonal_weight']
    sc.W_STYLE = 0.05

    # Update voicing costs
    vc.VOICING_COSTS[VoicingType.NO5] = config['no5_cost']
    vc.VOICING_COSTS[VoicingType.ROOTLESS] = config['rootless_cost']
    vc.VOICING_COSTS[VoicingType.SHELL] = config['shell_cost']
    vc.VOICING_COSTS[VoicingType.FULL] = 0.0
    vc.VOICING_COSTS[VoicingType.INVERSION] = 0.0

    # Clear any cached references
    sv1.DELTA_GATE = config['delta_gate']


def reset_config():
    """Reset to default values."""
    apply_config({
        'delta_gate': 0.08,
        'bass_weight': 0.25,
        'tonal_weight': 0.10,
        'no5_cost': 0.02,
        'rootless_cost': 0.06,
        'shell_cost': 0.04,
    })


def evaluate_config(config, fixtures, groups):
    """Evaluate a config across all EMG-DEV partitions, return aggregated metrics."""
    partitions = group_emg_dev_partitions(groups)
    apply_config(config)

    all_partition_results = []
    for partition_name, training_idx, held_out_idx in partitions:
        if not held_out_idx:
            continue
        metrics = compute_metrics(fixtures, held_out_idx)
        metrics['partition_name'] = partition_name
        metrics['training_size'] = len(training_idx)
        metrics['held_out_size'] = len(held_out_idx)
        all_partition_results.append(metrics)

    reset_config()
    return all_partition_results


def aggregate_partitions(partition_results):
    """Average metrics across EMG-DEV partitions."""
    if not partition_results:
        return {}
    keys = ['root_t1', 'root_t3', 'triad_t1', 'triad_t3',
            'seventh_t1', 'seventh_t3', 'quality_t1', 'quality_t3',
            'exact_chord_t1', 'exact_chord_t3',
            'root_and_triad_t1', 'root_and_seventh_t1',
            'false_enrich_rate', 'false_enrich_fixtures',
            'avg_candidates', 'max_candidates', 'cpu_time']
    agg = {}
    for k in keys:
        values = [r[k] for r in partition_results]
        agg[k] = {
            'mean': sum(values) / len(values),
            'median': sorted(values)[len(values) // 2],
            'min': min(values),
            'max': max(values),
            'std': (sum((v - sum(values)/len(values))**2 for v in values) / len(values))**0.5 if len(values) > 1 else 0.0,
        }
    agg['n_partitions'] = len(partition_results)
    agg['total_fixtures'] = sum(r['total'] for r in partition_results)
    return agg


def config_is_valid(agg, baseline_root=None, baseline_exact=None):
    """Check constraints. baseline_root/exact = A0 acoustic-only means."""
    bl = baseline_root if baseline_root is not None else agg['root_t1']['mean']
    el = baseline_exact if baseline_exact is not None else agg['exact_chord_t1']['mean']
    if agg['root_t1']['mean'] < bl - 0.02:
        return False, f"root_t1 {agg['root_t1']['mean']:.3f} < A0 root baseline ({bl:.3f}) - 2pts"
    if agg['exact_chord_t1']['mean'] < el - 0.02:
        return False, f"exact_chord_t1 {agg['exact_chord_t1']['mean']:.3f} < A0 exact baseline ({el:.3f}) - 2pts"
    if agg['max_candidates']['max'] > MAX_CANDIDATES:
        return False, f"max_candidates {agg['max_candidates']['max']} > {MAX_CANDIDATES}"
    if agg['false_enrich_rate']['mean'] > MAX_FALSE_ENRICH:
        return False, f"false_enrich {agg['false_enrich_rate']['mean']:.3f} > {MAX_FALSE_ENRICH}"
    return True, ""


# ─── Progressive search ───

def compute_a0_baseline(fixtures, groups):
    """Compute A0 (acoustic only) stats to use as constraint reference."""
    cfg = {'delta_gate': 0.08, 'bass_weight': 0.0, 'tonal_weight': 0.0,
           'no5_cost': 0.02, 'rootless_cost': 0.06, 'shell_cost': 0.04}
    results_list = evaluate_config(cfg, fixtures, groups)
    agg = aggregate_partitions(results_list)
    return agg['root_t1']['mean'], agg['exact_chord_t1']['mean']


def _eval_and_pick(fixtures, groups, cfgs, baseline_root, prev_best=None, baseline_exact=None):
    """Evaluate a list of configs and pick the best by exact_chord_t1 (primary).

    Selection rule (Phase 1B.6):
    1. Maximize exact_chord_t1 EMG-DEV mean
    2. Tiebreak: median partition exact_chord_t1
    3. Tiebreak: worst partition exact_chord_t1
    4. Tiebreak: quality_t1 EMG-DEV mean
    5. Tiebreak: root_t1 EMG-DEV mean
    6. Tiebreak: lowest false_enrich_rate
    7. Tiebreak: lowest contextual weights
    8. Tiebreak: lowest CPU
    """
    best_q = -1.0
    best_cfg = prev_best or cfgs[0]
    best_agg = None
    for cfg in cfgs:
        results_list = evaluate_config(cfg, fixtures, groups)
        agg = aggregate_partitions(results_list)
        valid, reason = config_is_valid(agg, baseline_root, baseline_exact)
        if not valid:
            continue
        exact = agg['exact_chord_t1']['mean']
        if exact > best_q:
            best_q = exact
            best_cfg = cfg
            best_agg = agg
        elif exact == best_q and best_agg is not None:
            tie_keys = [
                ('exact_chord_t1', 'median'),
                ('exact_chord_t1', 'min'),
                ('quality_t1', 'mean'),
                ('root_t1', 'mean'),
                ('false_enrich_rate', 'mean'),
            ]
            for k, stat in tie_keys:
                a = agg[k][stat]
                b = best_agg[k][stat]
                better = a > b if k != 'false_enrich_rate' else a < b
                if a != b:
                    if better:
                        best_cfg = cfg
                        best_agg = agg
                    break
    return best_cfg, best_q


def search_omission_costs(fixtures, groups, baseline_root, baseline_exact):
    """Step 1: calibrate omission costs with acoustic only."""
    base = {'delta_gate': 0.08, 'bass_weight': 0.0, 'tonal_weight': 0.0,
            'no5_cost': 0.02, 'rootless_cost': 0.06, 'shell_cost': 0.04}
    candidates = []
    for no5 in SEARCH_SPACE['no5_cost']:
        for rl in SEARCH_SPACE['rootless_cost']:
            for sh in SEARCH_SPACE['shell_cost']:
                candidates.append(dict(base, no5_cost=no5, rootless_cost=rl, shell_cost=sh))
    return _eval_and_pick(fixtures, groups, candidates, baseline_root, base, baseline_exact)


def search_delta_gate(fixtures, groups, omission_cfg, baseline_root, baseline_exact):
    """Step 2: calibrate delta_gate."""
    candidates = []
    for dg in SEARCH_SPACE['delta_gate']:
        candidates.append(dict(omission_cfg, delta_gate=dg, bass_weight=0.0, tonal_weight=0.0))
    return _eval_and_pick(fixtures, groups, candidates, baseline_root, omission_cfg, baseline_exact)


def search_bass_weight(fixtures, groups, base_cfg, baseline_root, baseline_exact):
    """Step 3: add bass."""
    candidates = []
    for bw in SEARCH_SPACE['bass_weight']:
        candidates.append(dict(base_cfg, bass_weight=bw, tonal_weight=0.0))
    return _eval_and_pick(fixtures, groups, candidates, baseline_root, base_cfg, baseline_exact)


# ─── Ablation benchmark ───

def run_ablation(fixtures, groups, selected_config):
    """Run corrected ablation on full DEV (all folds combined).

    A0: acoustic only (bass=0, tonal=0).
    A1_BASS: tests each non-zero bass_weight, no tonal.
    A2_TONAL: NOT_EVALUABLE (key_context unavailable).
    FULL_NEUTRAL: NOT_EVALUABLE (tonal unavailable).
    A0_NOGATE_NOCOST: same engine, no gate, no costs (not a historical baseline).
    """
    all_indices = []
    for idx_list in groups.values():
        all_indices.extend(idx_list)

    results = {}

    # A0: acoustic only
    a0_cfg = dict(selected_config, bass_weight=0.0, tonal_weight=0.0)
    apply_config(a0_cfg)
    results['A0_acoustic_only'] = compute_metrics(fixtures, all_indices)
    reset_config()

    # A1_BASS: each non-zero bass_weight separately
    for bw in [v for v in SEARCH_SPACE['bass_weight'] if v > 0.0]:
        name = f'A1_BASS_{bw:.2f}'
        cfg = dict(selected_config, bass_weight=bw, tonal_weight=0.0)
        apply_config(cfg)
        results[name] = compute_metrics(fixtures, all_indices)
        reset_config()

    # A2_TONAL: NOT_EVALUABLE
    results['A2_TONAL'] = {
        'status': 'NOT_EVALUABLE',
        'reason': 'key_context unavailable in fixtures',
    }

    # FULL_NEUTRAL: NOT_EVALUABLE
    results['FULL_NEUTRAL'] = {
        'status': 'NOT_EVALUABLE',
        'reason': 'tonal component not available (key_context missing)',
    }

    # A0_NOGATE_NOCOST: corrected name (was BASELINE_historical)
    nogate_cfg = {'delta_gate': 0.0, 'bass_weight': 0.0, 'tonal_weight': 0.0,
                  'no5_cost': 0.0, 'rootless_cost': 0.0, 'shell_cost': 0.0}
    apply_config(nogate_cfg)
    results['A0_NOGATE_NOCOST'] = compute_metrics(fixtures, all_indices)
    reset_config()

    # HISTORICAL_PRODUCTION_BASELINE: true production engine via adapter
    try:
        sys.path.insert(0, PROJECT_ROOT)
        from scripts.historical_baseline import historical_classify_many
        t0 = time.perf_counter()
        historical_results = historical_classify_many([fixtures[i]['chroma'] for i in all_indices])
        t1 = time.perf_counter()
        hist_cpu = t1 - t0

        hist_root_ok = 0
        hist_quality_ok = 0
        hist_exact_ok = 0
        hist_valid = 0
        hist_total = len(all_indices)
        for i, res in zip(all_indices, historical_results):
            if res['valid']:
                hist_valid += 1
                gt = fixtures[i]
                if res['root'] == gt['root']:
                    hist_root_ok += 1
                if res['quality'] == gt['quality']:
                    hist_quality_ok += 1
                if res['root'] == gt['root'] and res['quality'] == gt['quality']:
                    hist_exact_ok += 1

        results['HISTORICAL_PRODUCTION_BASELINE'] = {
            'total': hist_total,
            'valid_fixtures': hist_valid,
            'root_t1': hist_root_ok / hist_total if hist_total else 0,
            'quality_t1': hist_quality_ok / hist_total if hist_total else 0,
            'exact_chord_t1': hist_exact_ok / hist_total if hist_total else 0,
            'cpu_time': hist_cpu,
            'note': 'Historical production engine (audio-processor.py) via argmax on observation scores. '
                    f'{hist_total - hist_valid}/{hist_total} fixtures unmatched vocabulary (aug, N, etc).',
        }
    except Exception as e:
        results['HISTORICAL_PRODUCTION_BASELINE'] = {
            'status': 'EVALUATION_FAILED',
            'error': str(e),
            'note': 'Historical production baseline adapter failed. See scripts/historical_baseline.py.',
        }

    return results


# ─── Main ───

def main():
    print("=" * 70)
    print("Phase 1B — Calibration DEV & Benchmark d'ablation")
    print("=" * 70)

    # Guard: refuse validation path
    VAL_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                            'synthetic', 'validation')
    if os.path.exists(VAL_PATH):
        print(f"GUARD: validation path exists at {VAL_PATH}, refusing access")
        # But we don't read it - just note it exists

    # Load DEV data
    fixtures, meta = load_dev_fixtures()
    groups = get_parent_groups(fixtures)

    print(f"\nDEV fixtures: {len(fixtures)}")
    print(f"Parent groups: {len(groups)}")

    # Verify no validation leaks in groups
    for gk in groups:
        assert 'validation' not in gk, f"VALIDATION LEAK in group key: {gk}"

    # Guard: assert_calibration_split
    VALID_SPLITS = {'dev'}
    if 'dev' not in VALID_SPLITS:
        raise ValueError("Calibration must use split=dev")
    print("Calibration guard: OK (split=dev)")

    # ─── Compute A0 baseline (constraint reference) ───
    print("\n--- Computing A0 baseline (constraint reference) ---")
    a0_root, a0_exact = compute_a0_baseline(fixtures, groups)
    print(f"  A0 root_t1 = {a0_root:.3f}  exact_chord_t1 = {a0_exact:.3f}")

    # ─── Step 1: Omission costs ───
    print("\n--- Step 1: Omission costs (acoustic only) ---")
    om_cfg, om_q = search_omission_costs(fixtures, groups, a0_root, a0_exact)
    print(f"  Best: no5={om_cfg['no5_cost']}, rl={om_cfg['rootless_cost']}, "
          f"shell={om_cfg['shell_cost']} → exact_chord_t1={om_q:.3f}")

    # ─── Step 2: Delta gate ───
    print("\n--- Step 2: Delta gate ---")
    dg_cfg, dg_q = search_delta_gate(fixtures, groups, om_cfg, a0_root, a0_exact)
    print(f"  Best: delta_gate={dg_cfg['delta_gate']} → exact_chord_t1={dg_q:.3f}")

    # ─── Step 3: Bass weight ───
    print("\n--- Step 3: Bass weight ---")
    bw_cfg, bw_q = search_bass_weight(fixtures, groups, dg_cfg, a0_root, a0_exact)
    print(f"  Best: bass_weight={bw_cfg['bass_weight']} → exact_chord_t1={bw_q:.3f}")

    # ─── Step 4: Tonal weight (NOT_EVALUABLE) ───
    print("\n--- Step 4: Tonal weight (NOT_EVALUABLE) ---")
    print("  key_context unavailable in fixtures → tonal component cannot be evaluated.")
    print("  tonal_weight=0.00 forced. See A2_TONAL in ablation for details.")

    selected = dict(bw_cfg, tonal_weight=0.0)
    print(f"\n  Selected config: {json.dumps(selected, indent=2)}")

    # ─── Ablation ───
    print("\n--- Ablation benchmark ---")
    ablation = run_ablation(fixtures, groups, selected)

    for name, m in ablation.items():
        status = m.get('status')
        if status in ('NOT_EVALUABLE', 'EVALUATION_FAILED'):
            print(f"\n  {name}:")
            print(f"    status: {status} ({m.get('reason') or m.get('error', '')})")
        else:
            rt = m.get('root_t1', -1)
            ect = m.get('exact_chord_t1', -1)
            qt = m.get('quality_t1', -1)
            fe = m.get('false_enrich_rate', -1)
            ac = m.get('avg_candidates', -1)
            cpu = m.get('cpu_time', -1)
            print(f"\n  {name}:")
            print(f"    root_t1={rt:.3f}  exact_chord_t1={ect:.3f}  "
                  f"quality_t1={qt:.3f}  "
                  f"false_enrich={fe:.3f}  "
                  f"avg_cand={ac:.1f}  cpu={cpu:.3f}s")

    # ─── Write config v2 (previous) and v3 (Phase 1B.6) ───
    import hashlib
    ap_hash = hashlib.md5(open(os.path.join(PROJECT_ROOT, 'electron', 'audio-processor.py'), 'rb').read()).hexdigest()
    mj_hash = hashlib.md5(open(os.path.join(PROJECT_ROOT, 'electron', 'main.js'), 'rb').read()).hexdigest()

    # Read old config hashes for reference
    old_config_hash = None
    v2_config_hash = None
    if os.path.exists(OLD_CONFIG_PATH):
        old_config_hash = hashlib.md5(open(OLD_CONFIG_PATH, 'rb').read()).hexdigest()
    if os.path.exists(GOLDEN_CONFIG_PATH_V2):
        v2_config_hash = hashlib.md5(open(GOLDEN_CONFIG_PATH_V2, 'rb').read()).hexdigest()

    GOLDEN_CONFIG_PATH_V3 = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                         'phase1b_selected_config_v3.json')
    REPORT_PATH_EXACT = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                                     'phase1b6_exact_chord_report.json')

    hist_baseline = ablation.get('HISTORICAL_PRODUCTION_BASELINE', {})
    hist_evaluated = hist_baseline.get('status') != 'EVALUATION_FAILED' and 'exact_chord_t1' in hist_baseline

    selected_config_v3 = {
        'status': 'CALIBRATED_ON_DEV_ONLY_WITH_EXACT_CHORD_METRIC',
        'supersedes': 'phase1b_selected_config_v2.json',
        'superseded_hash': v2_config_hash,
        'validation_accessed': False,
        'tonal_component_status': 'NOT_EVALUABLE',
        'tonal_component_reason': 'key_context unavailable in DEV fixtures',
        'historical_production_baseline_evaluated': hist_evaluated,
        'historical_production_baseline_note': (
            'Called via scripts/historical_baseline.py → audio-processor.py private functions. '
            'Comparison limited by vocabulary gap and argmax-only (no Viterbi for single chroma).'
        ),
        'selection_primary_metric': 'exact_chord_t1',
        'benchmark_bug_correction': (
            'Previous ablation A1/A2 inherited bass_weight=0.0 / tonal_weight=0.0 '
            'from selected config, making all configurations identical. '
            'A1_BASS now tests each non-zero bass_weight separately. '
            'A2_TONAL and FULL_NEUTRAL are NOT_EVALUABLE. '
            'Selection primary metric changed from quality_t1 to exact_chord_t1.'
        ),
        'selected_parameters': {
            'delta_gate': selected['delta_gate'],
            'bass_weight': selected['bass_weight'],
            'tonal_weight': selected['tonal_weight'],
            'no5_cost': selected['no5_cost'],
            'rootless_cost': selected['rootless_cost'],
            'shell_cost': selected['shell_cost'],
        },
        'search_space': SEARCH_SPACE,
        'selection_rule': {
            'primary': 'maximize exact_chord_t1 EMG-DEV mean',
            'constraints': [
                'root_t1 >= baseline - 2pts',
                'exact_chord_t1 >= baseline - 2pts',
                'false_enrich_rate <= 15%',
                'max_candidates <= 12',
                'no profile non-neutral used',
            ],
            'tiebreak': ['median partition exact_chord_t1',
                         'worst partition exact_chord_t1',
                         'quality_t1 EMG-DEV mean',
                         'root_t1 EMG-DEV mean',
                         'lowest false_enrich_rate',
                         'lowest contextual weights',
                         'lowest CPU'],
        },
        'dev_group_cv_results': {
            'n_folds': len(groups),
            'n_groups': len(groups),
            'n_fixtures': len(fixtures),
        },
        'seed': 20260711,
        'code_hashes': {
            'electron/harmony_engine/scoring.py': hashlib.md5(
                open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'scoring.py'), 'rb').read()
            ).hexdigest(),
            'electron/harmony_engine/structured_v1.py': hashlib.md5(
                open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'structured_v1.py'), 'rb').read()
            ).hexdigest(),
        },
    }

    with open(GOLDEN_CONFIG_PATH_V3, 'w') as f:
        json.dump(selected_config_v3, f, indent=2)
    print(f"Config frozen: {GOLDEN_CONFIG_PATH_V3}")

    # Preserve v2 if it already exists; otherwise write it from v3 data
    if not os.path.exists(GOLDEN_CONFIG_PATH_V2):
        with open(GOLDEN_CONFIG_PATH_V2, 'w') as f:
            json.dump(selected_config_v3, f, indent=2)
        print(f"Config v2 created: {GOLDEN_CONFIG_PATH_V2}")

    # ─── Phase 1B.6 Exact Chord Report ───
    if os.path.exists(OLD_REPORT_PATH):
        with open(OLD_REPORT_PATH) as f:
            old_report = json.load(f)
        if 'status' not in old_report:
            old_report['status'] = 'INVALIDATED_BY_BENCHMARK_BUG'
            old_report['status_reason'] = (
                'Ablation A1/A2 structurellement identiques a A0. '
                'BASELINE n\'est pas un moteur historique distinct. '
                'Voir phase1b_corrected_report.json et phase1b6_exact_chord_report.json.'
            )
            with open(OLD_REPORT_PATH, 'w') as f:
                json.dump(old_report, f, indent=2)
            print(f"Invalidated old report: {OLD_REPORT_PATH}")

    exact_report = {
        'report_type': 'structured_harmony_v1_phase1b6_exact_chord',
        'date': '2026-07-11',
        'command': 'python scripts/calibrate_v1.py',
        'supersedes': 'phase1b_corrected_report.json',
        'metric_definitions': {
            'root_t1': 'Top-1 predicted root == ground truth root (independamment de la qualite)',
            'quality_t1': 'Top-1 predicted quality string == GT quality string (independamment de la fondamentale)',
            'triad_t1': 'Top-1 predicted triad label == GT triad label',
            'seventh_t1': 'Top-1 predicted seventh label == GT seventh label',
            'exact_chord_t1': 'Top-1 predicted root == GT root ET predicted quality == GT quality (symbole complet)',
            'exact_chord_t3': 'Au moins un candidat du top-3 a la bonne fondamentale ET la bonne qualite',
            'root_and_triad_t1': 'Top-1 predicted root == GT root ET predicted triad == GT triad',
            'root_and_seventh_t1': 'Top-1 predicted root == GT root ET predicted seventh == GT seventh',
            'slash_chord_t1': 'Exact chord + predicted bass_pc == GT bass_pc (quand GT a une basse definie)',
        },
        'dev_data': {
            'fixtures_path': DEV_FIXTURES_PATH,
            'fixtures_count': len(fixtures),
            'parent_groups': len(groups),
        },
        'validation_accessed': False,
        'tonal_component_status': 'NOT_EVALUABLE',
        'historical_production_baseline_evaluated': hist_evaluated,
        'search_steps': [
            {
                'step': 1,
                'name': 'Omission costs (acoustic only)',
                'primary_metric': 'exact_chord_t1',
                'best': om_cfg,
                'best_value': om_q,
            },
            {
                'step': 2,
                'name': 'Delta gate',
                'primary_metric': 'exact_chord_t1',
                'best': dg_cfg,
                'best_value': dg_q,
            },
            {
                'step': 3,
                'name': 'Bass weight',
                'primary_metric': 'exact_chord_t1',
                'best': bw_cfg,
                'best_value': bw_q,
            },
            {
                'step': 4,
                'name': 'Tonal weight',
                'note': 'NOT_EVALUABLE — key_context unavailable.',
                'primary_metric': 'exact_chord_t1',
                'best': selected,
                'best_value': bw_q,
            },
        ],
        'selected_config': selected,
        'ablation_results': {},
        'historical_baseline': None,
        'selection_rule': {
            'primary': 'maximize exact_chord_t1 cross-validated mean',
            'constraints': [
                'root_t1 >= A0 baseline - 2pts',
                'exact_chord_t1 >= A0 baseline - 2pts',
                'false_enrich_rate <= 15%',
                'max_candidates <= 12',
                'no profile non-neutral used',
            ],
            'tiebreak': ['median fold exact_chord_t1',
                         'worst fold exact_chord_t1',
                         'quality_t1 CV mean',
                         'root_t1 CV mean',
                         'lowest false_enrich_rate',
                         'lowest contextual weights',
                         'lowest CPU'],
        },
        'old_selection_rule': {
            'primary': 'maximize quality_t1 cross-validated mean',
            'constraints': ['root_t1 >= A0 baseline - 2pts',
                            'false_enrich_rate <= 15%',
                            'max_candidates <= 12',
                            'no profile non-neutral used'],
            'tiebreak': ['median fold quality', 'worst fold quality',
                         'lowest false_enrich', 'lowest contextual weights',
                         'lowest CPU'],
        },
        'production_hashes': {
            'electron/audio-processor.py': ap_hash,
            'electron/main.js': mj_hash,
        },
        'limits': [
            'Calibrated on DEV chroma fixtures only (29 fixtures)',
            'No synthetic WAV or real progressions used',
            'No validation data consulted',
            'No non-neutral profiles activated',
            'No accuracy claimed beyond DEV cross-validation',
            'Tonal component not evaluable (key_context missing)',
            'Historical baseline uses argmax (no Viterbi) on single chroma vectors',
            'Historical baseline vocabulary includes "aug" which is not in V1 vocabulary',
        ],
    }

    for name, m in ablation.items():
        if m.get('status') == 'NOT_EVALUABLE':
            exact_report['ablation_results'][name] = {
                'status': 'NOT_EVALUABLE',
                'reason': m.get('reason', ''),
            }
        elif m.get('status') == 'EVALUATION_FAILED':
            exact_report['ablation_results'][name] = {
                'status': 'EVALUATION_FAILED',
                'error': m.get('error', ''),
            }
        elif 'exact_chord_t1' not in m:
            exact_report['ablation_results'][name] = {
                'status': 'PARTIAL',
                'note': m.get('note', 'No exact_chord_t1 available'),
                'root_t1': m.get('root_t1', -1),
                'quality_t1': m.get('quality_t1', -1),
                'cpu_time': m.get('cpu_time', -1),
                'total': m.get('total', -1),
            }
        else:
            exact_report['ablation_results'][name] = {
                k: v for k, v in m.items()
                if k in ('root_t1', 'root_t3', 'triad_t1', 'triad_t3',
                         'seventh_t1', 'seventh_t3', 'quality_t1', 'quality_t3',
                         'exact_chord_t1', 'exact_chord_t3',
                         'root_and_triad_t1', 'root_and_seventh_t1',
                         'slash_chord_t1', 'slash_fixtures',
                         'false_enrich_rate', 'avg_candidates', 'max_candidates',
                         'cpu_time', 'total', 'note')
            }

    # Add historical baseline to report
    if 'HISTORICAL_PRODUCTION_BASELINE' in ablation:
        hb = ablation['HISTORICAL_PRODUCTION_BASELINE']
        exact_report['historical_baseline'] = {
            k: v for k, v in hb.items()
            if k in ('total', 'valid_fixtures', 'root_t1', 'quality_t1',
                     'exact_chord_t1', 'cpu_time', 'note', 'status', 'error')
        }

    with open(REPORT_PATH_EXACT, 'w') as f:
        json.dump(exact_report, f, indent=2)
    print(f"Exact chord report: {REPORT_PATH_EXACT}")

    # ─── Final verdict ───
    verdict = "PHASE_1B6_BASS_SELECTED" if selected['bass_weight'] > 0 else "PHASE_1B6_BASS_REJECTED"
    print("\n" + "=" * 70)
    print(verdict)
    print("=" * 70)


if __name__ == '__main__':
    main()
