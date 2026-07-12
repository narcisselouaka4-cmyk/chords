from enum import Enum
from .templates import expected_pcs, intervals_for


class VoicingType(Enum):
    FULL = 'full'
    NO5 = 'no5'
    ROOTLESS = 'rootless'
    SHELL = 'shell'
    INVERSION = 'inversion'

    def __str__(self):
        return self.value


VOICING_COSTS = {
    VoicingType.FULL: 0.0,
    VoicingType.NO5: 0.02,
    VoicingType.ROOTLESS: 0.06,
    VoicingType.SHELL: 0.04,
    VoicingType.INVERSION: 0.0,
}


def voicing_cost(vt: VoicingType) -> float:
    return VOICING_COSTS.get(vt, 0.0)


def voicing_name(vt: VoicingType) -> str:
    return vt.value


def compute_voicing_observed(
    root: int,
    triad: str,
    seventh: str,
    observed_pcs: set[int],
    vt: VoicingType,
):
    intervals = intervals_for(
        _quality_name(triad, seventh))
    exp = set(expected_pcs(root, intervals))

    if vt == VoicingType.ROOTLESS:
        if seventh == 'none':
            return list(exp), list(exp - observed_pcs), sorted(observed_pcs - exp), [], []
        expected_filtered = {pc for pc in exp if pc != root}
    elif vt == VoicingType.NO5:
        fifth_interval = 6 if triad == 'dim' else 7
        fifth_pc = (root + fifth_interval) % 12
        expected_filtered = {pc for pc in exp if pc != fifth_pc}
    elif vt == VoicingType.SHELL:
        third_int = 3 if triad in ('minor', 'dim') else 4
        sev_int = _seventh_interval(seventh)
        keep = {root, (root + third_int) % 12}
        if sev_int is not None:
            keep.add((root + sev_int) % 12)
        expected_filtered = {pc for pc in exp if pc in keep}
    else:
        expected_filtered = exp

    missing = sorted(expected_filtered - observed_pcs)
    extra = sorted(observed_pcs - expected_filtered)
    observed_in = sorted(observed_pcs & expected_filtered)
    observed_out = sorted(observed_pcs - expected_filtered)

    return list(expected_filtered), missing, extra, observed_in, observed_out


def compute_voicing_for_candidate(
    root: int,
    triad: str,
    seventh: str,
    observed_pcs: set[int],
) -> tuple[str, list[int], list[int], list[int], float]:
    best_acoustic = -1e9
    best_vt = VoicingType.FULL
    best_data = None

    for vt in VoicingType:
        if vt == VoicingType.INVERSION:
            continue
        if vt == VoicingType.ROOTLESS and seventh == 'none':
            continue

        intervals = intervals_for(_quality_name(triad, seventh))
        exp = set(expected_pcs(root, intervals))

        if vt == VoicingType.ROOTLESS:
            expected_filtered = {pc for pc in exp if pc != root}
        elif vt == VoicingType.NO5:
            fifth_interval = 6 if triad == 'dim' else 7
            fifth_pc = (root + fifth_interval) % 12
            expected_filtered = {pc for pc in exp if pc != fifth_pc}
        elif vt == VoicingType.SHELL:
            third_int = 3 if triad in ('minor', 'dim') else 4
            sev_int = _seventh_interval(seventh)
            keep = {root, (root + third_int) % 12}
            if sev_int is not None:
                keep.add((root + sev_int) % 12)
            expected_filtered = {pc for pc in exp if pc in keep}
        else:
            expected_filtered = exp

        present = len(expected_filtered & observed_pcs)
        total = len(expected_filtered)
        acoustic = (present / total) if total > 0 else 0.0
        acoustic -= voicing_cost(vt)

        if acoustic > best_acoustic:
            best_acoustic = acoustic
            best_vt = vt
            missing = sorted(expected_filtered - observed_pcs)
            extra = sorted(observed_pcs - expected_filtered)
            best_data = (best_vt.value, list(expected_filtered), missing, extra, acoustic)

    return best_data or ('full', list(exp), [], [], 0.0)


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


def _seventh_interval(seventh: str) -> int | None:
    return {'none': None, 'b7': 10, 'maj7': 11}.get(seventh)
