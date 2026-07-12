from .templates import expected_pcs, intervals_for
from .voicing import VoicingType, voicing_cost

DELTA_GATE = 0.08
W_BASS = 0.25
W_TONAL = 0.10
W_STYLE = 0.05


def _quality_name(triad: str, seventh: str) -> str:
    mapping = {
        ('major', 'none'): '',
        ('major', 'b7'): '7',
        ('major', 'maj7'): 'maj7',
        ('minor', 'none'): 'm',
        ('minor', 'b7'): 'm7',
        ('dim', 'none'): 'dim',
        ('dim', 'b7'): 'm7b5',
        ('sus2', 'none'): 'sus2',
        ('sus4', 'none'): 'sus4',
    }
    return mapping.get((triad, seventh), '')


def f_root(chroma: list[float], root: int, voicing: VoicingType) -> float:
    root_energy = chroma[root]
    if voicing == VoicingType.ROOTLESS:
        return 0.5
    return root_energy


def f_triad(chroma: list[float], root: int, triad: str) -> float:
    intervals = {
        'major': {4, 7},
        'minor': {3, 7},
        'dim': {3, 6},
        'sus2': {2, 7},
        'sus4': {5, 7},
    }
    ivs = intervals.get(triad, set())
    if not ivs:
        return 0.0
    energy = 0.0
    for iv in ivs:
        pc = (root + iv) % 12
        energy += chroma[pc]
    return energy / len(ivs)


def f_seventh(chroma: list[float], root: int, triad: str, seventh: str) -> float:
    if seventh == 'none':
        return 1.0
    iv = 10 if seventh == 'b7' else 11
    sev_pc = (root + iv) % 12
    return chroma[sev_pc]


def acoustic_score(
    chroma: list[float],
    root: int,
    triad: str,
    seventh: str,
    voicing: VoicingType,
) -> float:
    w_r = 1.0
    w_t = 1.0
    w_s = 1.0

    fr = w_r * f_root(chroma, root, voicing)
    ft = w_t * f_triad(chroma, root, triad)
    fs = w_s * f_seventh(chroma, root, triad, seventh)

    cost = voicing_cost(voicing)
    return fr + ft + fs - cost


def bass_score_component(bass_chroma: list[float], expected_bass_pc: int) -> float:
    return bass_chroma[expected_bass_pc]


def total_score_with_gating(
    acoustic: float,
    best_acoustic: float,
    bass_score_val: float,
    tonal_score_val: float,
    style_val: float = 0.0,
) -> float:
    delta = best_acoustic - acoustic
    if delta > DELTA_GATE:
        return acoustic
    gated = (
        W_BASS * bass_score_val
        + W_TONAL * tonal_score_val
        + W_STYLE * style_val
    )
    return acoustic + gated
