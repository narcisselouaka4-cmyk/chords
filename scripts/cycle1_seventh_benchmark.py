"""
Cycle 1 — Conditional residual seventh scorer benchmark.

Tests C0 (legacy scorer) vs C1 (conditional_residual_seventh_v1)
with a grid of (presence_threshold, dominance_threshold) values.

Uses EMG-DEV partitions on DEV only. Validation split not accessed.
"""

import json
import os
import sys
import hashlib
import time
from collections import defaultdict

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))

from harmony_engine.candidate import ObservationInput
from harmony_engine.structured_v1 import (
    analyze_chord,
    ACTIVE_SEVENTH_SCORER,
    CONDITIONAL_SEVENTH_PARAMS,
    _evaluate_seventh,
)
from harmony_engine.seventh_scorer import (
    legacy_seventh_scorer,
    conditional_residual_seventh_v1,
)
from harmony_engine import scoring as sc

DEV_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                         'fixtures', 'chroma_fixtures_dev.json')
INV_PATH = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark',
                         'fixtures', 'fixture_inventory.json')
OUT_DIR = os.path.join(PROJECT_ROOT, 'tests', 'audio', 'v1_benchmark')
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

SELECTED = {'delta_gate': 0.04, 'bass_weight': 0.1, 'tonal_weight': 0.0,
            'no5_cost': 0.02, 'rootless_cost': 0.04, 'shell_cost': 0.02}

with open(DEV_PATH) as f:
    fixtures = json.load(f)['fixtures']
with open(INV_PATH) as f:
    inv_data = json.load(f)
parent_map = {}
for item in inv_data['inventory']:
    parent_map[item['id']] = item['variant_group_key']
groups_info = [(idx, parent_map.get(f['id'], f'ungrouped_{idx}'))
               for idx, f in enumerate(fixtures)]
total = len(fixtures)

group_to_indices = defaultdict(list)
for idx, gid in groups_info:
    group_to_indices[gid].append(idx)


def apply_selected():
    sc.DELTA_GATE = SELECTED['delta_gate']
    sc.W_BASS = SELECTED['bass_weight']
    sc.W_TONAL = SELECTED['tonal_weight']
    import harmony_engine.voicing as vc
    from harmony_engine.voicing import VoicingType
    vc.VOICING_COSTS[VoicingType.NO5] = SELECTED['no5_cost']
    vc.VOICING_COSTS[VoicingType.ROOTLESS] = SELECTED['rootless_cost']
    vc.VOICING_COSTS[VoicingType.SHELL] = SELECTED['shell_cost']


def run_predictions(scorer_name, presence=None, dominance=None):
    """Run analyze_chord for all fixtures with the specified scorer."""
    import harmony_engine.structured_v1 as sv1
    sv1.ACTIVE_SEVENTH_SCORER = scorer_name
    if scorer_name == 'conditional_residual_v1':
        sv1.CONDITIONAL_SEVENTH_PARAMS['presence_threshold'] = presence
        sv1.CONDITIONAL_SEVENTH_PARAMS['dominance_threshold'] = dominance

    predictions = []
    start = time.time()
    for f in fixtures:
        obs = ObservationInput(chroma=f['chroma'], bass_chroma=f['chroma_bass'])
        cands = analyze_chord(obs)
        top3 = [{'root': c.root, 'quality': c.quality, 'triad': c.triad,
                 'seventh': c.seventh, 'score': round(c.total_score, 4)}
                for c in cands[:3]]
        top3_contains_gt = any(
            c.root == f['root'] and c.quality == f['quality']
            for c in cands[:3])
        predictions.append({
            'fixture_id': f['id'],
            'parent_group_id': parent_map.get(f['id'], 'ungrouped'),
            'gt_root': f['root'], 'gt_quality': f['quality'],
            'gt_triad': f['triad'], 'gt_seventh': f['seventh'],
            'pred_root': cands[0].root if cands else -1,
            'pred_quality': cands[0].quality if cands else 'N',
            'pred_triad': cands[0].triad if cands else 'N',
            'pred_seventh': cands[0].seventh if cands else 'N',
            'top3': top3,
            'top3_contains_gt': top3_contains_gt,
        })
    elapsed = time.time() - start
    return predictions, elapsed


def compute_metrics(predictions, indices=None):
    """Compute metrics for a subset of predictions (or all)."""
    if indices is not None:
        preds = [predictions[i] for i in indices]
    else:
        preds = predictions
    n = len(preds)
    if n == 0:
        return {}

    correct_root = sum(1 for p in preds if p['pred_root'] == p['gt_root'])
    correct_exact = sum(1 for p in preds
                        if p['pred_root'] == p['gt_root']
                        and p['pred_quality'] == p['gt_quality'])
    correct_triad = sum(1 for p in preds
                        if p['pred_triad'] == p['gt_triad'])
    correct_seventh = sum(1 for p in preds
                          if p['pred_root'] == p['gt_root']
                          and p['pred_seventh'] == p['gt_seventh'])
    correct_triad_only = sum(1 for p in preds
                             if p['pred_triad'] == p['gt_triad'])
    correct_root_triad = sum(1 for p in preds
                             if p['pred_root'] == p['gt_root']
                             and p['pred_triad'] == p['gt_triad'])
    correct_t3_exact = sum(1 for p in preds
                           if p['top3_contains_gt'])

    # False enrichments: predicted seventh when GT has none
    false_enrich = sum(1 for p in preds
                       if p['gt_seventh'] == 'none'
                       and p['pred_seventh'] != 'none')
    # False impoverishments: GT seventh but predicted none
    false_impoverish = sum(1 for p in preds
                           if p['gt_seventh'] != 'none'
                           and p['pred_seventh'] == 'none')

    # Confusion matrices
    conf_none_to_seventh = sum(1 for p in preds
                               if p['gt_seventh'] == 'none'
                               and p['pred_seventh'] in ('b7', 'maj7', 'bb7'))
    conf_seventh_to_none = sum(1 for p in preds
                               if p['gt_seventh'] in ('b7', 'maj7', 'bb7')
                               and p['pred_seventh'] == 'none')
    conf_b7_to_maj7 = sum(1 for p in preds
                          if p['gt_seventh'] == 'b7' and p['pred_seventh'] == 'maj7')
    conf_maj7_to_b7 = sum(1 for p in preds
                          if p['gt_seventh'] == 'maj7' and p['pred_seventh'] == 'b7')
    conf_bb7 = sum(1 for p in preds
                   if p['gt_seventh'] == 'bb7' and p['pred_seventh'] != 'bb7')

    return {
        'root_t1': correct_root / n,
        'exact_chord_t1': correct_exact / n,
        'exact_chord_t3': correct_t3_exact / n,
        'triad_only_t1': correct_triad_only / n,
        'root_and_triad_t1': correct_root_triad / n,
        'seventh_t1': correct_seventh / n,
        'seventh_t3': correct_t3_exact / n,
        'false_enrich_rate': false_enrich / n if n else 0,
        'false_impoverish_rate': false_impoverish / n if n else 0,
        'conf_none_to_seventh': conf_none_to_seventh,
        'conf_seventh_to_none': conf_seventh_to_none,
        'conf_b7_to_maj7': conf_b7_to_maj7,
        'conf_maj7_to_b7': conf_maj7_to_b7,
        'conf_bb7': conf_bb7,
        'total': n,
    }


def partition_metrics(predictions):
    """Compute per-partition EMG-DEV metrics."""
    partitions = []
    for holdout_gid, held_indices in group_to_indices.items():
        m = compute_metrics(predictions, held_indices)
        m['partition_name'] = holdout_gid
        m['held_out_size'] = len(held_indices)
        partitions.append(m)
    return partitions


def aggregate_partitions(partition_list):
    """Aggregate partition metrics."""
    if not partition_list:
        return {}
    keys = ['root_t1', 'exact_chord_t1', 'exact_chord_t3', 'seventh_t1',
            'triad_only_t1', 'root_and_triad_t1', 'false_enrich_rate',
            'false_impoverish_rate']
    agg = {}
    for k in keys:
        values = [r.get(k, 0) for r in partition_list]
        n = len(values)
        mean_v = sum(values) / n
        sorted_v = sorted(values)
        median_v = sorted_v[n // 2]
        min_v = min(values)
        max_v = max(values)
        std_v = (sum((v - mean_v)**2 for v in values) / n)**0.5 if n > 1 else 0.0
        agg[k] = {
            'mean': round(mean_v, 4),
            'median': round(median_v, 4),
            'min': round(min_v, 4),
            'max': round(max_v, 4),
            'std': round(std_v, 4),
        }
    avg_cands = sum(r.get('avg_candidates', 0) for r in partition_list) / max(len(partition_list), 1)
    agg['n_partitions'] = len(partition_list)
    agg['total_fixtures'] = sum(r.get('total', 0) for r in partition_list)
    agg['avg_candidates'] = round(avg_cands, 2)
    agg['_partition_values'] = {
        k: {r['partition_name']: round(r.get(k, 0), 4)
            for r in partition_list}
        for k in keys
    }
    return agg


def config_is_valid(agg, baseline_root=None, baseline_exact=None):
    """Check if a config meets minimum quality constraints."""
    if agg is None:
        return False, 'no metrics'
    root_t1 = agg.get('root_t1', {}).get('mean', 0)
    exact_t1 = agg.get('exact_chord_t1', {}).get('mean', 0)
    enrich = agg.get('false_enrich_rate', {}).get('mean', 0)
    if baseline_root is not None and root_t1 < baseline_root - 0.02:
        return False, f'root_t1 {root_t1:.4f} dropped more than 2pts from baseline {baseline_root:.4f}'
    if baseline_exact is not None and exact_t1 < baseline_exact - 0.02:
        return False, f'exact_chord_t1 {exact_t1:.4f} dropped more than 2pts'
    if enrich > 0.15:
        return False, f'false_enrich_rate {enrich:.4f} > 15%'
    return True, 'ok'


apply_selected()

# ===========================================================================
# C0 — Legacy scorer
# ===========================================================================
print("Running C0 (legacy scorer)...")
preds_c0, cpu_c0 = run_predictions('legacy')
parts_c0 = partition_metrics(preds_c0)
agg_c0 = aggregate_partitions(parts_c0)
m_c0 = compute_metrics(preds_c0)
print(f"  exact_chord_t1={m_c0['exact_chord_t1']:.4f}  root_t1={m_c0['root_t1']:.4f}  "
      f"seventh_t1={m_c0['seventh_t1']:.4f}  CPU={cpu_c0:.3f}s")

# ===========================================================================
# C1 — Conditional residual scorer grid
# ===========================================================================
presence_grid = [0.03, 0.05, 0.07, 0.10]
dominance_grid = [0.00, 0.02, 0.04]

print("\nRunning C1 grid (conditional_residual_seventh_v1)...")
c1_results = []
for pt in presence_grid:
    for dt in dominance_grid:
        preds, cpu = run_predictions('conditional_residual_v1', pt, dt)
        parts = partition_metrics(preds)
        agg = aggregate_partitions(parts)
        m = compute_metrics(preds)
        c1_results.append({
            'presence_threshold': pt,
            'dominance_threshold': dt,
            'predictions': preds,
            'global_metrics': m,
            'partition_metrics': agg,
            'cpu_time': cpu,
        })
        print(f"  pt={pt:.2f} dt={dt:.2f}: exact_t1={m['exact_chord_t1']:.4f} "
              f"root_t1={m['root_t1']:.4f} seventh_t1={m['seventh_t1']:.4f} "
              f"enrich={m['false_enrich_rate']:.4f} CPU={cpu:.3f}s")

# ===========================================================================
# SELECTION
# ===========================================================================
print("\n" + "=" * 70)
print("SELECTION")
print("=" * 70)

baseline_root = m_c0['root_t1']
baseline_exact = m_c0['exact_chord_t1']
baseline_triad = m_c0['triad_only_t1']

# 1. Filter: must meet acceptance criteria
acceptable = []
for r in c1_results:
    valid, reason = config_is_valid(r['partition_metrics'],
                                     baseline_root, baseline_exact)
    if not valid:
        print(f"  pt={r['presence_threshold']:.2f} dt={r['dominance_threshold']:.2f}: REJECTED ({reason})")
        continue

    # Check gain >= 5pp (absolute)
    gain = (r['global_metrics']['exact_chord_t1'] - baseline_exact) * 100

    # Count improved fixtures: where C1 gets right but C0 got wrong
    improved = 0
    improved_groups = set()
    for i, (p_c0, p_c1) in enumerate(zip(preds_c0, r['predictions'])):
        c0_ok = (p_c0['pred_root'] == p_c0['gt_root'] and p_c0['pred_quality'] == p_c0['gt_quality'])
        c1_ok = (p_c1['pred_root'] == p_c1['gt_root'] and p_c1['pred_quality'] == p_c1['gt_quality'])
        if not c0_ok and c1_ok:
            improved += 1
            improved_groups.add(parent_map.get(fixtures[i]['id'], 'ungrouped'))

    # Check triad stability
    triad_delta = (r['global_metrics']['triad_only_t1'] - baseline_triad) * 100

    meets_criteria = (
        gain >= 5.0
        and improved >= 5
        and len(improved_groups) >= 4
        and triad_delta >= -2.0
    )

    r['gain_pp'] = round(gain, 2)
    r['improved_fixtures'] = improved
    r['improved_groups'] = len(improved_groups)
    r['triad_delta_pp'] = round(triad_delta, 2)
    r['meets_criteria'] = meets_criteria

    if meets_criteria:
        acceptable.append(r)
        print(f"  pt={r['presence_threshold']:.2f} dt={r['dominance_threshold']:.2f}: "
              f"ACCEPTABLE gain={gain:+.2f}pp improved={improved} groups={len(improved_groups)}")
    else:
        reasons = []
        if gain < 5.0: reasons.append(f'gain {gain:+.2f}pp < 5pp')
        if improved < 5: reasons.append(f'improved {improved} < 5')
        if len(improved_groups) < 4: reasons.append(f'groups {len(improved_groups)} < 4')
        if triad_delta < -2.0: reasons.append(f'triad {triad_delta:+.2f}pp drop')
        print(f"  pt={r['presence_threshold']:.2f} dt={r['dominance_threshold']:.2f}: "
              f"REJECTED ({'; '.join(reasons)})")

# 2. Select best among acceptable
if acceptable:
    # Sort by exact_chord_t1 mean (primary), then median, then worst partition
    acceptable.sort(key=lambda r: (
        -r['partition_metrics']['exact_chord_t1']['mean'],
        -r['partition_metrics']['exact_chord_t1']['median'],
        -r['partition_metrics']['exact_chord_t1']['min'],
        -r['global_metrics']['seventh_t1'],
        r['global_metrics']['false_enrich_rate'],
        r['presence_threshold'],
        r['dominance_threshold'],
        r['cpu_time'],
    ))
    best = acceptable[0]
    print(f"\n  SELECTED: pt={best['presence_threshold']:.2f} dt={best['dominance_threshold']:.2f}")
    print(f"    exact_chord_t1: {best['global_metrics']['exact_chord_t1']:.4f} "
          f"(gain: {best['gain_pp']:+.2f}pp)")
    print(f"    EMG-DEV mean: {best['partition_metrics']['exact_chord_t1']['mean']:.4f}")
    print(f"    EMG-DEV median: {best['partition_metrics']['exact_chord_t1']['median']:.4f}")
    print(f"    EMG-DEV worst: {best['partition_metrics']['exact_chord_t1']['min']:.4f}")
else:
    best = None
    print("\n  No acceptable C1 configurations found.")
print()

# ===========================================================================
# SURVIVAL AUDIT — for each fixture incorrect under C0
# ===========================================================================
print("=" * 70)
print("SURVIVAL AUDIT — fixtures incorrect under legacy scorer")
print("=" * 70)

if best:
    audit_rows = []
    for i, (p_c0, p_c1) in enumerate(zip(preds_c0, best['predictions'])):
        c0_ok = (p_c0['pred_root'] == p_c0['gt_root'] and p_c0['pred_quality'] == p_c0['gt_quality'])
        if c0_ok:
            continue

        f = fixtures[i]
        gt_seventh = f['seventh']
        c0_seventh = p_c0['pred_seventh']
        c1_seventh = p_c1['pred_seventh']
        c1_ok = (p_c1['pred_root'] == p_c1['gt_root'] and p_c1['pred_quality'] == p_c1['gt_quality'])
        correction = 'corrected' if c1_ok else 'still_incorrect'
        regression = 'regression' if (not c0_ok and not c1_ok
                                       and c1_seventh != f['seventh']
                                       and p_c0['pred_seventh'] == f['seventh']) else ''

        # Debug info from new scorer
        from harmony_engine.seventh_scorer import scorer_debug_info
        debug = scorer_debug_info(f['chroma'], f['root'], f['triad'],
                                   best['presence_threshold'],
                                   best['dominance_threshold'])

        audit_rows.append({
            'fixture_id': f['id'],
            'parent_group_id': parent_map.get(f['id'], 'ungrouped'),
            'ground_truth': f"{NOTE_NAMES[f['root']]}:{f['quality']}",
            'gt_seventh': gt_seventh,
            'legacy_prediction': f"{NOTE_NAMES[p_c0['pred_root']] if p_c0['pred_root']>=0 else '?'}:{p_c0['pred_quality']}",
            'new_prediction': f"{NOTE_NAMES[p_c1['pred_root']] if p_c1['pred_root']>=0 else '?'}:{p_c1['pred_quality']}",
            'legacy_seventh': c0_seventh,
            'new_seventh': c1_seventh,
            'residual_floor': debug['residual_noise_floor'],
            'energy_9': debug['energy_9'],
            'energy_10': debug['energy_10'],
            'energy_11': debug['energy_11'],
            'contrast_9': debug['contrast_9'],
            'contrast_10': debug['contrast_10'],
            'contrast_11': debug['contrast_11'],
            'dominance': debug['details'].get('b7', {}).get('dominance', 0),
            'correction_or_regression': correction + (' (' + regression + ')' if regression else ''),
        })

    print(f"{'Fixture':<30s} {'GT_7th':>8s} {'Legacy_7th':>10s} {'New_7th':>9s} {'Floor':>6s} {'E9':>5s} {'E10':>5s} {'E11':>5s} {'C9':>5s} {'C10':>5s} {'C11':>5s} {'Result':>12s}")
    print("-" * 110)
    for row in audit_rows:
        print(f"{row['fixture_id']:<30s} {row['gt_seventh']:>8s} {row['legacy_seventh']:>10s} "
              f"{row['new_seventh']:>9s} {row['residual_floor']:>6.3f} "
              f"{row['energy_9']:>5.3f} {row['energy_10']:>5.3f} {row['energy_11']:>5.3f} "
              f"{row['contrast_9']:>5.3f} {row['contrast_10']:>5.3f} {row['contrast_11']:>5.3f} "
              f"{row['correction_or_regression']:>12s}")
    print()
    corrected = sum(1 for r in audit_rows if 'corrected' in r['correction_or_regression'])
    regressed = sum(1 for r in audit_rows if 'regression' in r['correction_or_regression'])
    print(f"Corrected: {corrected}/{len(audit_rows)}  Regressed: {regressed}")
    print()

# ===========================================================================
# BUILD REPORT
# ===========================================================================
print("=" * 70)
print("WRITING REPORT")
print("=" * 70)

# Hashes
hashes = {
    'chroma_fixtures_dev': hashlib.md5(open(DEV_PATH, 'rb').read()).hexdigest(),
    'fixture_inventory': hashlib.md5(open(INV_PATH, 'rb').read()).hexdigest(),
    'structured_v1_py': hashlib.md5(
        open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'structured_v1.py'), 'rb').read()).hexdigest(),
    'seventh_scorer_py': hashlib.md5(
        open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'seventh_scorer.py'), 'rb').read()).hexdigest(),
    'scoring_py': hashlib.md5(
        open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'scoring.py'), 'rb').read()).hexdigest(),
    'voicing_py': hashlib.md5(
        open(os.path.join(PROJECT_ROOT, 'electron', 'harmony_engine', 'voicing.py'), 'rb').read()).hexdigest(),
}

report = {
    'experiment': 'cycle1_seventh_scorer_benchmark',
    'structured_correction_cycles_used': 1,
    'structured_correction_cycles_remaining': 1,
    'hypothesis': 'conditional residual seventh evidence',
    'calibrated_on': 'DEV_EMG_ONLY',
    'validation_accessed': False,
    'phase1c_authorized': False,
    'correction_cycle': 1,
    'changed_component': 'seventh_scorer_only',
    'baseline_C0': {
        'scorer': 'legacy_seventh_scorer',
        'global_metrics': {
            k: round(v, 4) if isinstance(v, float) else v
            for k, v in m_c0.items()
            if k not in ('partition_name', 'held_out_size')
        },
        'partition_metrics_c0': agg_c0,
        'cpu_time': round(cpu_c0, 4),
    },
    'c1_grid': [],
    'selection_rule': {
        'primary': 'maximize exact_chord_t1 EMG-DEV mean',
        'constraints': [
            'exact_chord_t1 gain >= 5pp vs C0',
            'gain covers >= 5 fixtures',
            'gain covers >= 4 parent groups',
            'root_t1 no more than 2pp drop',
            'triad_only_t1 no more than 2pp drop',
            'false_enrich_rate <= 15%',
        ],
        'tiebreak': [
            'EMG-DEV mean exact_chord_t1',
            'EMG-DEV median exact_chord_t1',
            'EMG-DEV worst partition exact_chord_t1',
            'seventh_t1',
            'lowest false_enrich_rate',
            'most conservative thresholds',
            'lowest CPU',
        ],
    },
    'code_hashes': hashes,
}

for r in c1_results:
    c1_entry = {
        'presence_threshold': r['presence_threshold'],
        'dominance_threshold': r['dominance_threshold'],
        'global_metrics': {k: round(v, 4) if isinstance(v, float) else v
                           for k, v in r['global_metrics'].items()
                           if k not in ('partition_name', 'held_out_size')},
        'partition_metrics': r['partition_metrics'],
        'cpu_time': round(r['cpu_time'], 4),
        'acceptable': hasattr(r, 'meets_criteria') and r['meets_criteria'],
        'gain_pp': round(r.get('gain_pp', 0), 2) if hasattr(r, 'gain_pp') else 0,
        'improved_fixtures': r.get('improved_fixtures', 0) if hasattr(r, 'improved_fixtures') else 0,
        'improved_groups': r.get('improved_groups', 0) if hasattr(r, 'improved_groups') else 0,
    }
    report['c1_grid'].append(c1_entry)

if best:
    report['selected'] = {
        'presence_threshold': best['presence_threshold'],
        'dominance_threshold': best['dominance_threshold'],
        'global_metrics': {k: round(v, 4) if isinstance(v, float) else v
                           for k, v in best['global_metrics'].items()
                           if k not in ('partition_name', 'held_out_size')},
        'partition_metrics': best['partition_metrics'],
        'gain_pp': round(best['gain_pp'], 2),
        'improved_fixtures': best['improved_fixtures'],
        'improved_groups': best['improved_groups'],
    }
    # Write selected config
    selected_config = {
        'hypothesis': 'conditional residual seventh evidence',
        'calibrated_on': 'DEV_EMG_ONLY',
        'validation_accessed': False,
        'correction_cycle': 1,
        'changed_component': 'seventh_scorer_only',
        'selected_scorer': 'conditional_residual_seventh_v1',
        'parameters': {
            'presence_threshold': best['presence_threshold'],
            'dominance_threshold': best['dominance_threshold'],
        },
        'v3_config_unchanged': SELECTED,
        'performance_vs_C0': {
            'exact_chord_t1_gain_pp': round(best['gain_pp'], 2),
            'improved_fixtures': best['improved_fixtures'],
            'improved_parent_groups': best['improved_groups'],
            'root_t1_change_pp': round(
                (best['global_metrics']['root_t1'] - m_c0['root_t1']) * 100, 2),
            'triad_only_t1_change_pp': round(
                (best['global_metrics']['triad_only_t1'] - m_c0['triad_only_t1']) * 100, 2),
        },
        'code_hashes': hashes,
    }
    with open(os.path.join(OUT_DIR, 'cycle1_seventh_selected_config.json'), 'w') as f:
        json.dump(selected_config, f, indent=2)
    print(f"  Selected config: {os.path.join(OUT_DIR, 'cycle1_seventh_selected_config.json')}")

report['survival_audit'] = {
    'per_fixture': audit_rows if best else [],
    'corrected_count': corrected if best else 0,
    'regressed_count': regressed if best else 0,
}

# Write main report
out_path = os.path.join(OUT_DIR, 'cycle1_seventh_report.json')
with open(out_path, 'w') as f:
    json.dump(report, f, indent=2, default=str)
print(f"  Report: {out_path}")

# Write predictions JSONL
if best:
    jsonl_path = os.path.join(OUT_DIR, 'cycle1_seventh_predictions.jsonl')
    with open(jsonl_path, 'w') as f:
        for i, (p_c0, p_c1) in enumerate(zip(preds_c0, best['predictions'])):
            line = {
                'fixture_id': p_c0['fixture_id'],
                'parent_group_id': p_c0['parent_group_id'],
                'ground_truth': f"{NOTE_NAMES[p_c0['gt_root']]}:{p_c0['gt_quality']}",
                'legacy_prediction': f"{NOTE_NAMES[p_c0['pred_root']]}:{p_c0['pred_quality']}",
                'c1_prediction': f"{NOTE_NAMES[p_c1['pred_root']]}:{p_c1['pred_quality']}",
                'legacy_exact_correct': (
                    p_c0['pred_root'] == p_c0['gt_root'] and p_c0['pred_quality'] == p_c0['gt_quality']
                ),
                'c1_exact_correct': (
                    p_c1['pred_root'] == p_c1['gt_root'] and p_c1['pred_quality'] == p_c1['gt_quality']
                ),
            }
            f.write(json.dumps(line) + '\n')
    print(f"  Predictions JSONL: {jsonl_path}")

# ===========================================================================
# VERDICT
# ===========================================================================
print("\n" + "=" * 70)
print("VERDICT")
print("=" * 70)

if best:
    print(f"  CYCLE_1_SEVENTH_SCORER_VALIDATED")
    print(f"  Selected: pt={best['presence_threshold']:.2f} dt={best['dominance_threshold']:.2f}")
    print(f"  exact_chord_t1: {m_c0['exact_chord_t1']:.4f} -> {best['global_metrics']['exact_chord_t1']:.4f} "
          f"(gain: {best['gain_pp']:+.2f}pp)")
    print(f"  EMG-DEV mean: {best['partition_metrics']['exact_chord_t1']['mean']:.4f}")
    print(f"  Cycles remaining: 1")
elif any(r.get('gain_pp', 0) > 0 for r in c1_results):
    print(f"  CYCLE_1_SEVENTH_SCORER_NO_GAIN")
    print(f"  No configuration meets all acceptance criteria.")
else:
    print(f"  CYCLE_1_SEVENTH_SCORER_NO_GAIN")
    print(f"  No improvement over legacy scorer.")
print()
print("  Note: A maximum of one additional correction cycle remains")
print("  before applying the pre-established HMM reprise criterion.")
print()
