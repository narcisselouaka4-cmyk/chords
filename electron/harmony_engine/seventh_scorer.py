"""
Seventh scorers for structured_harmony_v1.

Two modes:
- legacy_seventh_scorer: original chroma-energy-based (unchanged)
- conditional_residual_seventh_v1: residual energy after removing triad pitch classes

Intervals (relative to root):
  bb7  = 9   (dim triad only, V1-compatible)
  b7   = 10
  maj7 = 11

Usage:
    from harmony_engine.seventh_scorer import (
        legacy_seventh_scorer,
        conditional_residual_seventh_v1,
        SEVENTH_INTERVALS,
    )
"""

SEVENTH_INTERVALS = {
    'bb7': 9,
    'b7': 10,
    'maj7': 11,
}

TRIAD_PITCH_CLASSES = {
    'major': {0, 4, 7},
    'minor': {0, 3, 7},
    'dim': {0, 3, 6},
    'sus2': {0, 2, 7},
    'sus4': {0, 5, 7},
}

SEVENTH_LABEL_INTERVALS = [
    (9, 'bb7'),
    (10, 'b7'),
    (11, 'maj7'),
]
SEVENTH_IV_SET = {9, 10, 11}

MAX_SEVENTHS_RETURNED = 2


def legacy_seventh_scorer(
    chroma: list[float],
    root: int,
    triad: str,
) -> list[tuple[str, float]]:
    """Original seventh scorer: raw chroma energy at b7/maj7 intervals.

    'none' always scores 1.0 (highest possible), making it the default
    choice regardless of chroma content.
    """
    from .structured_v1 import SEVENTH_LABELS as _LABELS
    scores = []
    for sev in _LABELS:
        if sev == 'none':
            score = 1.0
        else:
            iv = SEVENTH_INTERVALS[sev]
            score = chroma[(root + iv) % 12]
        scores.append((sev, score))
    scores.sort(key=lambda x: -x[1])
    return scores[:MAX_SEVENTHS_RETURNED]


def conditional_residual_seventh_v1(
    chroma: list[float],
    root: int,
    triad: str,
    presence_threshold: float = 0.05,
    dominance_threshold: float = 0.02,
) -> list[tuple[str, float]]:
    """Conditional residual seventh scorer.

    For a given (root, triad):
    1. Identify triad pitch classes (explained by the triad)
    2. Measure raw energy at seventh intervals (9, 10, 11)
    3. Compute residual noise floor from non-triad, non-seventh bins
    4. For each seventh interval: contrast = energy - noise_floor
    5. For each seventh interval: dominance = energy - second-highest-seventh-energy
    6. A seventh is valid iff contrast >= presence_threshold
       AND dominance >= dominance_threshold
    7. 'none' is selected iff NO seventh interval meets both thresholds

    'none' is never scored with a fixed 1.0 bonus. It only appears
    when no seventh evidence exists.
    """
    triad_ivs = TRIAD_PITCH_CLASSES.get(triad, {0, 4, 7})

    energies_at_seventh: dict[int, float] = {}
    noise_bins: list[float] = []

    for iv in range(12):
        e = chroma[(root + iv) % 12]
        if iv in triad_ivs:
            continue
        if iv in SEVENTH_IV_SET:
            energies_at_seventh[iv] = e
        else:
            noise_bins.append(e)

    residual_noise_floor = sum(noise_bins) / max(len(noise_bins), 1)

    candidate_list: list[tuple[str, float, float, float]] = []
    for iv, label in SEVENTH_LABEL_INTERVALS:
        e = energies_at_seventh.get(iv, 0.0)

        contrast = e - residual_noise_floor
        if contrast < 0.0:
            contrast = 0.0

        other_energies = [
            energies_at_seventh.get(j, 0.0)
            for j in SEVENTH_IV_SET
            if j != iv
        ]
        second_highest = max(other_energies) if other_energies else 0.0
        dominance = e - second_highest

        if dominance < 0.0:
            continue

        if label == 'bb7' and triad != 'dim':
            continue

        if contrast >= presence_threshold and dominance >= dominance_threshold:
            candidate_list.append((label, contrast, e, residual_noise_floor))

    if not candidate_list:
        return [('none', 0.0)]

    candidate_list.sort(key=lambda x: -x[1])
    result = [(label, round(contrast, 4))
              for label, contrast, e, floor in candidate_list[:MAX_SEVENTHS_RETURNED]]

    # DO NOT pad with 'none' when a valid seventh is found.
    # Padding causes 'none' (f_seventh=1.0) to win over the correct seventh
    # in the final acoustic score, rendering the scorer useless.

    return result


def factorized_family_seventh_v2(
    chroma: list[float],
    root: int,
    triad: str,
    presence_threshold: float = 0.05,
    dominance_threshold: float = 0.02,
) -> list[tuple[str, float]]:
    """Factorized family seventh scorer for cycle 2.

    Same residual energy detection as conditional_residual_seventh_v1, but
    ALWAYS includes 'none' as the lowest-ranked option.

    The scores reflect residual contrast (confidence). Within a family
    (root, triad), the seventh with the highest score is selected.
    'none' always has score 0.0 and is chosen only when no seventh
    interval meets both presence and dominance thresholds.
    """
    triad_ivs = TRIAD_PITCH_CLASSES.get(triad, {0, 4, 7})

    energies_at_seventh: dict[int, float] = {}
    noise_bins: list[float] = []

    for iv in range(12):
        e = chroma[(root + iv) % 12]
        if iv in triad_ivs:
            continue
        if iv in SEVENTH_IV_SET:
            energies_at_seventh[iv] = e
        else:
            noise_bins.append(e)

    residual_noise_floor = sum(noise_bins) / max(len(noise_bins), 1)

    candidate_list: list[tuple[str, float]] = []
    for iv, label in SEVENTH_LABEL_INTERVALS:
        e = energies_at_seventh.get(iv, 0.0)

        contrast = e - residual_noise_floor
        if contrast < 0.0:
            contrast = 0.0

        other_energies = [
            energies_at_seventh.get(j, 0.0)
            for j in SEVENTH_IV_SET
            if j != iv
        ]
        second_highest = max(other_energies) if other_energies else 0.0
        dominance = e - second_highest

        if dominance < 0.0:
            continue

        if label == 'bb7' and triad != 'dim':
            continue

        if contrast >= presence_threshold and dominance >= dominance_threshold:
            candidate_list.append((label, round(contrast, 4)))

    candidate_list.sort(key=lambda x: -x[1])
    candidate_list.append(('none', 0.0))
    return candidate_list[:MAX_SEVENTHS_RETURNED]


def scorer_debug_info(
    chroma: list[float],
    root: int,
    triad: str,
    presence_threshold: float = 0.05,
    dominance_threshold: float = 0.02,
) -> dict:
    """Return detailed debug info for the residual scorer (audit use)."""
    triad_ivs = TRIAD_PITCH_CLASSES.get(triad, {0, 4, 7})

    energies_at_seventh = {}
    noise_bins = []

    for iv in range(12):
        e = chroma[(root + iv) % 12]
        if iv in triad_ivs:
            continue
        if iv in SEVENTH_IV_SET:
            energies_at_seventh[iv] = e
        else:
            noise_bins.append(e)

    residual_noise_floor = sum(noise_bins) / max(len(noise_bins), 1)

    details = {}
    for iv, label in SEVENTH_LABEL_INTERVALS:
        e = energies_at_seventh.get(iv, 0.0)
        contrast = e - residual_noise_floor
        if contrast < 0.0:
            contrast = 0.0
        other_energies = [
            energies_at_seventh.get(j, 0.0)
            for j in SEVENTH_IV_SET
            if j != iv
        ]
        second_highest = max(other_energies) if other_energies else 0.0
        dominance = e - second_highest
        if dominance < 0.0:
            dominance = 0.0
        details[label] = {
            'energy': round(e, 4),
            'contrast': round(contrast, 4),
            'dominance': round(dominance, 4),
            'valid': contrast >= presence_threshold and dominance >= dominance_threshold,
        }

    return {
        'root': root,
        'triad': triad,
        'residual_noise_floor': round(residual_noise_floor, 4),
        'energy_9': round(energies_at_seventh.get(9, 0.0), 4),
        'energy_10': round(energies_at_seventh.get(10, 0.0), 4),
        'energy_11': round(energies_at_seventh.get(11, 0.0), 4),
        'contrast_9': round(energies_at_seventh.get(9, 0.0) - residual_noise_floor, 4) if energies_at_seventh.get(9, 0.0) > residual_noise_floor else 0.0,
        'contrast_10': round(energies_at_seventh.get(10, 0.0) - residual_noise_floor, 4) if energies_at_seventh.get(10, 0.0) > residual_noise_floor else 0.0,
        'contrast_11': round(energies_at_seventh.get(11, 0.0) - residual_noise_floor, 4) if energies_at_seventh.get(11, 0.0) > residual_noise_floor else 0.0,
        'details': details,
        'selected': conditional_residual_seventh_v1(
            chroma, root, triad, presence_threshold, dominance_threshold
        ),
    }
