from .scoring import bass_score_component

NOISE_FLOOR = 0.03


def compute_bass_pc(bass_chroma: list[float]) -> int:
    peak = max(bass_chroma)
    if peak < NOISE_FLOOR:
        return -1
    return int(bass_chroma.index(peak))


def bass_is_weak(bass_chroma: list[float]) -> bool:
    return max(bass_chroma) < NOISE_FLOOR


def bass_score(
    bass_chroma: list[float],
    candidate_root: int,
    candidate_bass_pc: int,
    candidate_expected_pcs: set[int],
    voicing_type: str,
) -> tuple[float, dict]:
    if bass_is_weak(bass_chroma):
        return 0.0, {'bass_found': False, 'bass_pc': -1, 'reason': 'weak_absent'}

    actual_bass = compute_bass_pc(bass_chroma)
    result = {
        'bass_found': True,
        'bass_pc': actual_bass,
    }

    if voicing_type == 'rootless':
        if actual_bass == candidate_root:
            score = 0.8
            result['reason'] = 'rootless_bass_plays_root'
        elif actual_bass in candidate_expected_pcs:
            guide_tones = {
                (candidate_root + 3) % 12,
                (candidate_root + 4) % 12,
                (candidate_root + 10) % 12,
                (candidate_root + 11) % 12,
            }
            if guide_tones.intersection(
                {(actual_bass + 3) % 12, (actual_bass + 4) % 12,
                 (actual_bass + 10) % 12, (actual_bass + 11) % 12}
            ):
                score = 0.5
                result['reason'] = 'rootless_guide_tones_present'
            else:
                score = 0.3
                result['reason'] = 'rootless_unrelated_bass'
        else:
            score = 0.0
            result['reason'] = 'rootless_foreign_bass'
    else:
        if actual_bass == candidate_root:
            score = 1.0
            result['reason'] = 'root_in_bass'
        elif actual_bass in candidate_expected_pcs:
            score = 0.6
            result['reason'] = 'chord_tone_in_bass'
        else:
            score = 0.0
            result['reason'] = 'foreign_bass'

    result['score'] = score
    return score, result
