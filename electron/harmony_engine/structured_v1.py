from __future__ import annotations
from typing import Optional

from .candidate import ChordCandidate, ObservationInput
from .templates import (
    QUALITY_TEMPLATES,
    TRIAD_LABELS,
    SEVENTH_LABELS,
    expected_pcs,
    intervals_for,
)
from .voicing import (
    VoicingType,
    voicing_cost,
    compute_voicing_observed,
)
from .scoring import (
    acoustic_score,
    total_score_with_gating,
    f_root as _f_root,
    f_triad as _f_triad,
    f_seventh as _f_seventh,
)
from .bass import compute_bass_pc, bass_is_weak, bass_score
from .style_profiles import STYLE_PROFILES
from .seventh_scorer import (
    legacy_seventh_scorer,
    conditional_residual_seventh_v1,
    factorized_family_seventh_v2,
)

MAX_ROOTS = 5
MAX_TRIADS_PER_ROOT = 2
MAX_SEVENTHS_PER_PAIR = 2
MAX_CANDIDATES_SCORED = 12
TOP_N = 3

OBSERVATION_THRESHOLD = 0.08

# Active seventh scorer — can be switched at runtime
# Values: 'legacy', 'conditional_residual_v1', or 'factorized_family_seventh_v2'
ACTIVE_SEVENTH_SCORER = 'legacy'

# Parameters for conditional_residual_v1 (only used when active)
CONDITIONAL_SEVENTH_PARAMS = {
    'presence_threshold': 0.05,
    'dominance_threshold': 0.02,
}


def _select_roots(chroma: list[float], bass_chroma: list[float]) -> list[int]:
    energies = [(i, chroma[i]) for i in range(12)]
    energies.sort(key=lambda x: -x[1])
    top = [e[0] for e in energies[:4]]

    if not bass_is_weak(bass_chroma):
        bass_pc = compute_bass_pc(bass_chroma)
        if bass_pc >= 0 and bass_pc not in top:
            top.append(bass_pc)

    return top[:MAX_ROOTS]


def _evaluate_triad(chroma: list[float], root: int) -> list[tuple[str, float]]:
    scores = []
    intervals_map = {
        'major': {4, 7},
        'minor': {3, 7},
        'dim': {3, 6},
        'sus2': {2, 7},
        'sus4': {5, 7},
    }
    for triad in TRIAD_LABELS:
        ivs = intervals_map[triad]
        energy = sum(chroma[(root + iv) % 12] for iv in ivs) / len(ivs)
        scores.append((triad, energy))
    scores.sort(key=lambda x: -x[1])
    return scores[:MAX_TRIADS_PER_ROOT]


def _evaluate_seventh(
    chroma: list[float], root: int, triad: str
) -> list[tuple[str, float]]:
    global ACTIVE_SEVENTH_SCORER, CONDITIONAL_SEVENTH_PARAMS
    pt = CONDITIONAL_SEVENTH_PARAMS['presence_threshold']
    dt = CONDITIONAL_SEVENTH_PARAMS['dominance_threshold']
    if ACTIVE_SEVENTH_SCORER == 'conditional_residual_v1':
        return conditional_residual_seventh_v1(chroma, root, triad, pt, dt)
    if ACTIVE_SEVENTH_SCORER == 'factorized_family_seventh_v2':
        return factorized_family_seventh_v2(chroma, root, triad, pt, dt)
    # Legacy
    scores = []
    for sev in SEVENTH_LABELS:
        if sev == 'none':
            score = 1.0
        else:
            iv = 10 if sev == 'b7' else 11
            score = chroma[(root + iv) % 12]
        scores.append((sev, score))
    scores.sort(key=lambda x: -x[1])
    return scores[:MAX_SEVENTHS_PER_PAIR]


def _quality_name(triad: str, seventh: str) -> str:
    for q, tpl in QUALITY_TEMPLATES.items():
        if tpl['triad'] == triad and tpl['seventh'] == seventh:
            return q
    return ''


def _make_candidate(
    root: int,
    triad: str,
    seventh: str,
    observed_pcs: set[int],
    bass_pc: int,
    chroma: list[float],
    bass_chroma: list[float],
) -> Optional[ChordCandidate]:
    qname = _quality_name(triad, seventh)
    if qname not in QUALITY_TEMPLATES:
        return None

    intervals = QUALITY_TEMPLATES[qname]['intervals']
    exp = set(expected_pcs(root, intervals))

    best_acoustic = -1e9
    best_vt_name = 'full'
    best_exp_filtered = list(exp)
    best_missing = []
    best_extra = []

    for vt in [VoicingType.FULL, VoicingType.NO5, VoicingType.ROOTLESS,
               VoicingType.SHELL, VoicingType.INVERSION]:
        if vt == VoicingType.ROOTLESS and seventh == 'none':
            continue

        exp_f, missing, extra, _, _ = compute_voicing_observed(
            root, triad, seventh, observed_pcs, vt)

        ac = acoustic_score(chroma, root, triad, seventh, vt)

        if ac > best_acoustic:
            best_acoustic = ac
            best_vt_name = vt.value
            best_exp_filtered = exp_f
            best_missing = missing
            best_extra = extra

    best_exp_set = set(best_exp_filtered)
    missing = sorted(best_exp_set - observed_pcs)
    extra = sorted(observed_pcs - best_exp_set)
    tension = sorted(
        {pc for pc in extra
         if pc not in {(root + iv) % 12 for iv in intervals}}
    )

    bs, bass_expl = bass_score(
        bass_chroma, root, bass_pc, best_exp_set, best_vt_name)

    c = ChordCandidate(
        root=root,
        triad=triad,
        seventh=seventh,
        quality=qname,
        bass_pc=bass_pc,
        voicing_type=best_vt_name,
        expected_pcs=sorted(best_exp_set),
        observed_pcs=sorted(observed_pcs),
        missing_pcs=missing,
        extra_pcs=extra,
        tension_pcs=tension,
        acoustic_score=best_acoustic,
        bass_score=bs,
        tonal_score=0.0,
        style_factor=1.0,
        total_score=0.0,
        inversion=(best_vt_name == 'inversion'),
        explanation={
            'voicing': best_vt_name,
            'bass': bass_expl,
            'acoustic_f_root': _f_root(chroma, root, VoicingType(best_vt_name)),
            'acoustic_f_triad': _f_triad(chroma, root, triad),
            'acoustic_f_seventh': _f_seventh(chroma, root, triad, seventh),
        },
    )

    return c


def analyze_chord(
    observation: ObservationInput,
    style_profile_name: str = 'neutral',
) -> list[ChordCandidate]:
    chroma = observation.chroma
    bass_chroma = observation.bass_chroma

    observed_pcs = {i for i, v in enumerate(chroma) if v > OBSERVATION_THRESHOLD}

    bass_pc = compute_bass_pc(bass_chroma)
    if bass_pc < 0:
        bass_pc = max(range(12), key=lambda i: chroma[i])

    roots = _select_roots(chroma, bass_chroma)
    candidates: list[ChordCandidate] = []

    for r in roots:
        triads = _evaluate_triad(chroma, r)
        for triad, _ in triads:
            sevenths = _evaluate_seventh(chroma, r, triad)
            for seventh, _ in sevenths:
                c = _make_candidate(r, triad, seventh, observed_pcs, bass_pc,
                                    chroma, bass_chroma)
                if c is not None:
                    candidates.append(c)

    if not candidates:
        return []

    candidates.sort(key=lambda c: -c.acoustic_score)
    best_acoustic = candidates[0].acoustic_score

    for c in candidates:
        c.total_score = total_score_with_gating(
            c.acoustic_score, best_acoustic,
            c.bass_score, c.tonal_score,
        )

    if ACTIVE_SEVENTH_SCORER == 'factorized_family_seventh_v2':
        # Stage 1: Rank families (root, triad) using 'none' variant's total_score.
        # This guarantees root+triad selection is identical to C0 (legacy + 'none'
        # always present), since 'none' has f_seventh=1.0 in both C0 and here.
        family_scores: dict[tuple[int, str], float] = {}
        for c in candidates:
            if c.seventh == 'none':
                key = (c.root, c.triad)
                if key not in family_scores or c.total_score > family_scores[key]:
                    family_scores[key] = c.total_score

        best_family = max(family_scores, key=family_scores.get)
        best_br, best_triad = best_family

        # Stage 2: Within best family, rank by scorer priority, then total_score.
        # Re-fetch the scorer's ordering for this specific family.
        family_ranking = _evaluate_seventh(chroma, best_br, best_triad)
        seventh_priority = {sev: i for i, (sev, _) in enumerate(family_ranking)}

        def _sort_key(c: ChordCandidate) -> tuple[int, float]:
            sp = seventh_priority.get(c.seventh, len(family_ranking))
            return (sp, -c.total_score)

        family_cands = [c for c in candidates if (c.root, c.triad) == best_family]
        family_cands.sort(key=_sort_key)
        rest = [c for c in candidates if (c.root, c.triad) != best_family]
        rest.sort(key=lambda c: -c.total_score)
        return (family_cands + rest)[:MAX_CANDIDATES_SCORED]

    candidates.sort(key=lambda c: -c.total_score)
    return candidates[:MAX_CANDIDATES_SCORED]
