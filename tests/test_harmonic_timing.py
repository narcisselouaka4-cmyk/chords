"""Regression tests for timing, acoustic passage evidence and silence ownership."""
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'electron'))
from harmony_engine.temporal import HarmonicTimeline, analysis_frame_grid

spec = importlib.util.spec_from_file_location('ap_timing', ROOT / 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
STATES = ap._build_chord_states()
BY_NAME = {s['name']: s for s in STATES}


def test_grid_uses_actual_spacing_without_accumulated_time_drift():
    frames, times, spacing = analysis_frame_grid(22050 * 1200, 22050)
    assert spacing == pytest.approx(11 * 512 / 22050)
    assert np.allclose(times, frames * 512 / 22050)
    assert round(times[-1] / spacing) == len(times) - 1
    assert times[-1] < 1200


def test_grid_never_includes_a_zero_length_observation_at_file_end():
    frames, times, _ = analysis_frame_grid(11 * 512 * 16, 22050)
    assert len(frames) == 16
    assert times[-1] < (11 * 512 * 16) / 22050


def segment(chord, start, end):
    return dict(chord=chord, startTime=start, endTime=end, confidence=0.8,
                state=next(i for i, s in enumerate(STATES) if s['name'] == chord))


def timeline(events, step=0.01):
    frames = np.zeros((12, round(events[-1][2] / step)))
    for chord, start, end in events:
        if chord != 'N':
            frames[:, round(start / step):round(end / step)] = BY_NAME[chord]['template'][:, None]
    return HarmonicTimeline(frames, step, STATES)


@pytest.mark.parametrize('offset', [-0.9, -0.3, 0.3, 0.9])
def test_early_and_late_boundaries_follow_harmony(offset):
    audio = timeline([('C', 0, 3), ('G', 3, 6)])
    result = audio.refine_boundaries([segment('C', 0, 3 + offset), segment('G', 3 + offset, 6)])
    assert result[0]['endTime'] == pytest.approx(3, abs=0.02)
    assert result[1]['startTime'] == result[0]['endTime']
    assert result[0]['startTime'] == 0 and result[-1]['endTime'] == 6


def test_no_harmonic_change_does_not_move_boundary_to_an_attack():
    audio = timeline([('C', 0, 6)])
    audio.chroma[:, 150] *= 8  # a percussive/energy spike is not a change of harmony
    segments = [segment('C', 0, 3), segment('G', 3, 6)]
    assert audio.refine_boundaries(segments) == segments


def test_short_real_passing_chord_is_supported_and_preserved():
    events = [('C', 0, 3), ('D', 3, 3.25), ('G', 3.25, 6)]
    audio = timeline(events)
    segments = audio.annotate([segment(*e) for e in events])
    assert segments[1]['_independentHarmony']
    for result in (ap._clean_segments(segments, min_duration=0.4),
                   ap._stabilize_progression(segments, {'pc': 0, 'mode': 'major'}, STATES)):
        assert [s['chord'] for s in result] == ['C', 'D', 'G']
    result = audio.suppress_unsupported_short_events(segments, max_duration=1)
    assert [s['chord'] for s in result] == ['C', 'D', 'G']
    ap._classify_chord_roles(result, {'pc': 0, 'mode': 'major'}, beat_dur=0.5)
    assert [s['role'] for s in result] == ['structural', 'passing', 'structural']


def test_melodic_note_cannot_establish_a_passing_chord():
    audio = timeline([('C', 0, 3), ('G', 3, 6)])
    segments = [segment('C', 0, 2.7), segment('Em', 2.7, 3), segment('G', 3, 6)]
    audio.annotate(segments)
    assert not segments[1]['_independentHarmony']
    result = audio.suppress_unsupported_short_events(segments, max_duration=1)
    assert [s['chord'] for s in result] == ['C', 'C', 'G']


def test_single_tone_and_silence_do_not_prove_harmony():
    frames = np.zeros((12, 100))
    frames[0, :50] = 1
    audio = HarmonicTimeline(frames, 0.01, STATES)
    assert not audio.evidence(segment('C', 0, 0.5))['independent']
    assert not audio.evidence(segment('C', 0.5, 1))['independent']


def test_quiet_upper_voices_above_a_loud_bass_still_prove_harmony():
    frames = np.zeros((12, 100)) + 0.005
    frames[0] = 1.0
    frames[4] = 0.08
    frames[7] = 0.11
    audio = HarmonicTimeline(frames, 0.01, STATES)
    assert audio.evidence(segment('C', 0, 1))['independent']


def test_full_minor_inversion_beats_an_incomplete_root_position_triad():
    frames = np.zeros((12, 100)) + 0.005
    frames[0] = 1.0
    frames[4] = frames[9] = 0.1
    audio = HarmonicTimeline(frames, 0.01, STATES)
    assert audio.evidence(segment('Am', 0, 1), [segment('C', 0, 1)])['independent']


def test_local_harmonies_hidden_by_smoothing_are_restored():
    events = [('C', 0, 3), ('G', 3, 3.25), ('C', 3.25, 6)]
    audio = timeline(events)
    result = audio.recover_local_harmonies([segment('C', 0, 6)])
    assert [s['chord'] for s in result] == ['C', 'G', 'C']
    assert result[1]['startTime'] == pytest.approx(3)
    assert result[1]['endTime'] == pytest.approx(3.25)


def test_passing_melody_without_a_full_chord_is_not_inserted():
    audio = timeline([('C', 0, 6)])
    audio.chroma[:, 300:325] = 0
    audio.chroma[7, 300:325] = 1
    norms = np.linalg.norm(audio.chroma, axis=0)
    audio.normalized = audio.chroma / np.maximum(norms, 1e-9)
    result = audio.recover_local_harmonies([segment('C', 0, 6)])
    assert [s['chord'] for s in result] == ['C']


def test_stationary_upper_voices_block_bass_only_changes():
    events = [('C', 0, 3), ('G', 3, 3.5), ('C', 3.5, 6)]
    audio = timeline(events)
    audio.upper_chroma = np.repeat(BY_NAME['C']['template'][:, None], len(audio.times), axis=1)
    assert [s['chord'] for s in audio.recover_local_harmonies([segment('C', 0, 6)])] == ['C']


def test_upper_voice_amplitude_changes_do_not_create_harmony():
    audio = timeline([('C', 0, 3), ('G', 3, 3.5), ('C', 3.5, 6)])
    upper = np.zeros((12, len(audio.times))) + 0.005
    upper[[4, 7, 11]] = 0.4
    upper[4, 300:350] = 1.0
    audio.upper_chroma = upper
    assert not audio.upper_voice_change(3, 3.5)


def test_walking_bass_cycle_with_a_clipped_tail_keeps_stationary_harmony():
    events = [('C', 0, .5), ('Em', .5, 2), ('C', 2, 2.5), ('Em', 2.5, 4),
              ('C', 4, 4.5), ('Em', 4.5, 6), ('C', 6, 7), ('G', 7, 8)]
    segments = [dict(segment(*e), _independentHarmony=True, _upperVoiceChange=False) for e in events]
    full = np.zeros((12, 32))
    full[[0, 4, 7, 11]] = .25
    upper = full.copy()
    upper[0] = 0
    result = ap._absorb_arpeggio_figures(segments, full, STATES, .25, upper)
    assert [(s['chord'], s['startTime'], s['endTime']) for s in result] == [('C', 0, 8)]
    # A real upper-voice change at the tail must keep the progression visible.
    segments[-1]['_upperVoiceChange'] = True
    result = ap._absorb_arpeggio_figures(segments, full, STATES, .25, upper)
    assert len(result) == len(segments)


def test_unsupported_short_remnants_between_recovered_chords_are_absorbed():
    events = [('C', 0, 3), ('Am', 3, 4), ('G', 4, 7)]
    audio = timeline(events)
    segments = [segment('C', 0, 3), segment('A', 3, 3.04),
                segment('Am', 3.04, 3.96), segment('A', 3.96, 4), segment('G', 4, 7)]
    result = ap._clean_segments(audio.suppress_unsupported_short_events(segments, 1))
    assert [s['chord'] for s in result] == ['C', 'Am', 'G']


def test_split_segments_do_not_share_their_evidence_dictionary():
    events = [('C', 0, 3), ('G', 3, 3.5), ('C', 3.5, 6)]
    audio = timeline(events)
    source = segment('C', 0, 6)
    source['analysis'] = {'existingField': True}
    segments = audio.annotate(audio.recover_local_harmonies([source]))
    assert len({id(s['analysis']) for s in segments}) == len(segments)
    assert all(s['analysis']['existingField'] for s in segments)


def test_recovered_chords_losing_support_after_refinement_are_reverted():
    audio = timeline([('C', 0, 3), ('G', 3, 6)])
    segments = [segment('C', 0, 2.7), dict(segment('Em', 2.7, 3), _recoveredFrom='C'),
                segment('G', 3, 6)]
    result = audio.reject_unconfirmed_recoveries(segments)
    assert [s['chord'] for s in result] == ['C', 'C', 'G']
    # Genuine insertions remain, and untagged decoder choices are not rewritten.
    segments[1] = dict(segment('G', 3, 3.25), _recoveredFrom='C')
    assert audio.reject_unconfirmed_recoveries(segments)[1]['chord'] == 'G'
    segments[1] = segment('Em', 2.7, 3)
    assert audio.reject_unconfirmed_recoveries(segments)[1]['chord'] == 'Em'


def test_a_chain_of_short_passing_chords_is_classified_as_a_run():
    events = [('C', 0, 4), ('D', 4, 4.25), ('D#', 4.25, 4.5), ('G', 4.5, 8.5)]
    segments = timeline(events).annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, beat_dur=0.5)
    assert [s['role'] for s in segments] == ['structural', 'passing', 'passing', 'structural']


def test_long_borrowed_chord_is_not_mistaken_for_a_passing_chord():
    events = [('C', 0, 4), ('D', 4, 7), ('G', 7, 11)]
    segments = timeline(events).annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, beat_dur=0.5)
    assert [s['role'] for s in segments] == ['structural'] * 3


def test_frequent_short_diatonic_passages_do_not_become_pillars():
    events = []
    for k in range(4):
        t = 4.75 * k
        events.extend([('C', t, t + 4), ('Dm', t + 4, t + 4.25),
                       ('Em', t + 4.25, t + 4.5), ('F', t + 4.5, t + 4.75)])
    events.append(('G', 19, 23))
    segments = timeline(events).annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, beat_dur=0.5)
    assert all(s['role'] == 'passing' for s in segments if s['chord'] in ('Dm', 'Em', 'F'))


def test_ambiguous_detection_is_uncertain_even_between_pillars():
    segments = [segment('C', 0, 4), segment('D', 4, 4.3), segment('G', 4.3, 8)]
    for s in segments:
        s['analysis'] = {'harmonicEvidence': {'independent': s['chord'] != 'D'}}
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, beat_dur=0.5)
    assert segments[1]['role'] == 'uncertain'


def test_short_acoustic_silence_is_preserved_and_never_refined():
    audio = timeline([('C', 0, 2), ('N', 2, 2.5), ('G', 2.5, 4)])
    segments = [segment('C', 0, 2), dict(segment('N', 2, 2.5), state=None), segment('G', 2.5, 4)]
    result = audio.refine_boundaries(ap._clean_segments(segments))
    assert [(s['chord'], s['startTime'], s['endTime']) for s in result] == [
        ('C', 0, 2), ('N', 2, 2.5), ('G', 2.5, 4)]


def test_refinement_cannot_cross_a_short_passing_chord():
    events = [('C', 0, 3), ('D', 3, 3.25), ('G', 3.25, 6)]
    audio = timeline(events)
    result = audio.refine_boundaries([segment('C', 0, 2.85), segment('D', 2.85, 3.35), segment('G', 3.35, 6)])
    assert all(s['endTime'] > s['startTime'] for s in result)
    assert all(a['endTime'] == b['startTime'] for a, b in zip(result, result[1:]))
    assert result[1]['startTime'] == pytest.approx(3, abs=0.02)
    assert result[1]['endTime'] == pytest.approx(3.25, abs=0.02)


def test_reindexing_uses_final_intervals_and_refreshes_confidence():
    audio = timeline([('C', 0, 3), ('G', 3, 6)])
    times = np.arange(0, 6, 0.25)
    observations = np.full((len(times), len(STATES)), 0.5)
    segments = [segment('C', 0, 3), segment('G', 3, 6)]
    result = audio.refresh_segments(segments, times, observations, STATES)
    assert result[0]['beatIndices'] == list(range(12))
    assert result[1]['beatIndices'] == list(range(12, 24))
    assert result[0]['confidence'] == pytest.approx(1, abs=1e-6)
    short = segment('C', 0.1, 0.2)
    short['observation_candidates'] = [{'chord': 'G', 'emission_score': 0.9}]
    audio.refresh_segments([short], times, observations, STATES)
    assert short['beatIndices'] == []
    assert short['observation_candidates'] == []


def recurring_incomplete_chord():
    events = [('C', 0, 4), ('G', 4, 8), ('C', 8, 9)]
    audio = timeline(events)
    # A bass-heavy reference, followed by the same harmony arpeggiated:
    # its third and fifth are never simultaneous in the short occurrence.
    audio.chroma[:, :400] = 0.001
    audio.chroma[0, :400] = 1
    audio.chroma[4, :400] = .2
    audio.chroma[7, :400] = .3
    audio.chroma[:, 800:] = 0.001
    audio.chroma[0, 800:] = 1
    audio.chroma[4, 800::2] = .2
    audio.chroma[7, 801::2] = .3
    upper = np.copy(audio.chroma)
    upper[:, :400] = 0.001
    upper[0, :400], upper[4, :400], upper[7, :400] = .8, .7, .6
    upper[:, 800:] = 0.001
    upper[0, 800:] = .8
    upper[4, 800::2] = .7
    upper[7, 801::2] = .6
    audio = HarmonicTimeline(audio.chroma, .01, STATES, upper)
    return audio, audio.annotate([segment(*e) for e in events])


def test_recurrence_resolves_an_incomplete_short_pillar_with_independent_audio():
    audio, segments = recurring_incomplete_chord()
    assert not segments[-1]['analysis']['harmonicEvidence']['independent']
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, .5)
    assert segments[-1]['role'] == 'uncertain'
    resolved = audio.resolve_recurring_harmony(segments, .5)
    ap._classify_chord_roles(resolved, {'pc': 0, 'mode': 'major'}, .5)
    assert resolved[-1]['role'] == 'structural'
    proof = resolved[-1]['analysis']['contextEvidence']
    assert proof['confirmed'] and proof['chord'] == 'C'
    assert proof['referenceEndTime'] <= resolved[-1]['startTime']
    assert not resolved[-1]['analysis']['harmonicEvidence']['independent']
    assert [(s['startTime'], s['endTime']) for s in resolved] == [(0, 4), (4, 8), (8, 9)]


@pytest.mark.parametrize('root', range(12))
def test_recurrence_corrects_major_minor_confusion_using_the_actual_third(root):
    minor = ap.chord_name(root, 'm')
    major = ap.chord_name(root, '')
    neighbor = ap.chord_name((root + 7) % 12, '')
    events = [(minor, 0, 4), (neighbor, 4, 8), (major, 8, 9)]
    audio = timeline(events)
    audio.chroma[:, 800:] = 0.001
    audio.chroma[root, 800:] = 1.0
    audio.chroma[(root + 3) % 12, 800:] = .75
    audio.chroma[(root + 4) % 12, 800:] = .02
    audio.chroma[(root + 7) % 12, 800:] = .6
    audio = HarmonicTimeline(audio.chroma, .01, STATES, np.copy(audio.chroma))
    segments = audio.annotate([segment(*e) for e in events])
    resolved = audio.resolve_recurring_harmony(segments, .5)
    assert resolved[-1]['chord'] == minor
    assert resolved[-1]['analysis']['contextEvidence']['kind'] == 'quality_resolution'
    # Clear reference detections are kept, including the neighboring chord.
    assert [s['chord'] for s in resolved[:2]] == [minor, neighbor]


def test_recurrence_keeps_major_minor_ambiguity_when_both_thirds_are_present():
    events = [('C', 0, 4), ('Cm', 4, 8), ('C', 8, 9)]
    audio = timeline(events)
    audio.chroma[:, 800:] = 0.001
    audio.chroma[0, 800:] = 1
    audio.chroma[3, 800:] = audio.chroma[4, 800:] = .5
    audio.chroma[7, 800:] = .6
    audio = HarmonicTimeline(audio.chroma, .01, STATES, np.copy(audio.chroma))
    segments = audio.annotate([segment(*e) for e in events])
    resolved = audio.resolve_recurring_harmony(segments, .5)
    assert resolved[-1]['chord'] == 'C'
    assert 'contextEvidence' not in resolved[-1]['analysis']


def test_recurrence_cannot_confirm_from_the_bass_when_upper_voices_disagree():
    audio, segments = recurring_incomplete_chord()
    audio.upper_chroma[:, 800:] = BY_NAME['G']['template'][:, None]
    resolved = audio.resolve_recurring_harmony(segments, .5)
    assert 'contextEvidence' not in resolved[-1]['analysis']


def test_short_weak_occurrences_cannot_teach_one_another():
    audio = timeline([('C', 0, .5), ('G', .5, 1), ('C', 1, 1.5)])
    audio.upper_chroma = np.copy(audio.chroma)
    segments = audio.annotate([segment('C', 0, .5), segment('G', .5, 1), segment('C', 1, 1.5)])
    segments[-1]['analysis']['contextEvidence'] = {'confirmed': True, 'chord': 'C'}
    resolved = audio.resolve_recurring_harmony(segments, .5)
    assert all('contextEvidence' not in s['analysis'] for s in resolved)


def test_recurrence_preserves_novel_short_passing_chords_and_silence():
    events = [('C', 0, 4), ('D', 4, 4.25), ('G', 4.25, 8.25), ('N', 8.25, 9)]
    audio = timeline(events)
    audio.upper_chroma = np.copy(audio.chroma)
    segments = audio.annotate([segment(*e) for e in events])
    resolved = audio.resolve_recurring_harmony(segments, .5)
    assert [(s['chord'], s['startTime'], s['endTime']) for s in resolved] == events


def test_a_clear_diatonic_pillar_need_not_cover_the_songs_longest_chords():
    events = [('C', 0, 8), ('Dm', 8, 9.2), ('G', 9.2, 17.2)]
    audio = timeline(events)
    segments = audio.annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, .5)
    assert [s['role'] for s in segments] == ['structural'] * 3


def test_repeated_one_beat_pillars_frame_a_secondary_dominant_as_passing():
    events = []
    for i in range(4):
        t = 2 * i
        events.extend([('C', t, t + 1), ('D', t + 1, t + 1.5), ('G', t + 1.5, t + 2)])
    audio = timeline(events)
    segments = audio.annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, .5)
    assert [s['role'] for s in segments] == ['structural', 'passing', 'structural'] * 4


def test_two_confirmed_passing_harmonies_can_share_a_three_beat_turnaround():
    events = [('C', 0, 4), ('D', 4, 4.8), ('G#dim', 4.8, 5.45), ('G', 5.45, 9.45)]
    audio = timeline(events)
    segments = audio.annotate([segment(*e) for e in events])
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, .5)
    assert [s['role'] for s in segments] == ['structural', 'passing', 'passing', 'structural']
    segments[2]['analysis']['harmonicEvidence']['independent'] = False
    ap._classify_chord_roles(segments, {'pc': 0, 'mode': 'major'}, .5)
    assert segments[2]['role'] == 'uncertain'
