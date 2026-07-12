QUALITY_TEMPLATES = {
    '':      {'intervals': [0, 4, 7],       'triad': 'major', 'seventh': 'none'},
    'm':     {'intervals': [0, 3, 7],       'triad': 'minor', 'seventh': 'none'},
    '7':     {'intervals': [0, 4, 7, 10],   'triad': 'major', 'seventh': 'b7'},
    'maj7':  {'intervals': [0, 4, 7, 11],   'triad': 'major', 'seventh': 'maj7'},
    'sus2':  {'intervals': [0, 2, 7],       'triad': 'sus2',  'seventh': 'none'},
    'sus4':  {'intervals': [0, 5, 7],       'triad': 'sus4',  'seventh': 'none'},
    'm7':    {'intervals': [0, 3, 7, 10],   'triad': 'minor', 'seventh': 'b7'},
    'dim':   {'intervals': [0, 3, 6],       'triad': 'dim',   'seventh': 'none'},
    'm7b5':  {'intervals': [0, 3, 6, 10],   'triad': 'dim',   'seventh': 'b7'},
}

TRIAD_LABELS = ['major', 'minor', 'dim', 'sus2', 'sus4']
SEVENTH_LABELS = ['none', 'b7', 'maj7']


def intervals_for(quality: str) -> list[int]:
    return list(QUALITY_TEMPLATES[quality]['intervals'])


def expected_pcs(root: int, intervals: list[int]) -> list[int]:
    return sorted((root + iv) % 12 for iv in intervals)


def assert_template_invariants():
    major_t = QUALITY_TEMPLATES['']
    assert 4 in major_t['intervals'], "major template must contain interval 4"
    assert 3 not in major_t['intervals'], "major template must NOT contain interval 3"

    minor_t = QUALITY_TEMPLATES['m']
    assert 3 in minor_t['intervals'], "minor template must contain interval 3"

    dim_t = QUALITY_TEMPLATES['dim']
    assert 6 in dim_t['intervals'], "dim template must contain interval 6 (diminished fifth)"

    sus2_t = QUALITY_TEMPLATES['sus2']
    assert 2 in sus2_t['intervals'], "sus2 template must contain interval 2"
    assert 3 not in sus2_t['intervals'], "sus2 template must NOT contain interval 3"
    assert 4 not in sus2_t['intervals'], "sus2 template must NOT contain interval 4"

    sus4_t = QUALITY_TEMPLATES['sus4']
    assert 5 in sus4_t['intervals'], "sus4 template must contain interval 5"
    assert 3 not in sus4_t['intervals'], "sus4 template must NOT contain interval 3"
    assert 4 not in sus4_t['intervals'], "sus4 template must NOT contain interval 4"

    for q, tpl in QUALITY_TEMPLATES.items():
        iv = tpl['intervals']
        expected = expected_pcs(0, iv)
        for i, pc in enumerate(expected):
            assert pc == (0 + iv[i]) % 12, \
                f"quality {q}: expected_pcs root-relative invariant failed"

    assert 'aug' not in QUALITY_TEMPLATES, "aug must not be in V1 vocabulary"
    forbidden = {'6', 'maj9', 'm9', '7b9', '7#9', '7#11', '7b13', '13', '9', '11'}
    for q in QUALITY_TEMPLATES:
        assert q not in forbidden, f"extended chord '{q}' not in V1 vocabulary"
