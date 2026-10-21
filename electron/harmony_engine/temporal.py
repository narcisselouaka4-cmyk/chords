"""Acoustic checks on the original CQT frames, independent of HMM smoothing.

The decoder identifies harmony on a coarse, denoised grid. These functions
use the file's original clock to check short events and locate transitions.
They never quantize to the displayed tempo or snap to percussion attacks.
"""

import numpy as np


def analysis_frame_grid(n_samples, sample_rate, hop_length=512, frame_seconds=0.25):
    """Return frame starts and their actual spacing on the file's clock."""
    step = max(1, int(round(frame_seconds * sample_rate / hop_length)))
    # Starts only: never create an observation at the exact end of the file.
    count = max(1, int(np.ceil(n_samples / hop_length)))
    frames = np.arange(0, count, step, dtype=int)
    return frames, frames * hop_length / sample_rate, step * hop_length / sample_rate


class HarmonicTimeline:
    def __init__(self, chroma, frame_seconds, states, upper_chroma=None):
        self.frame_seconds = float(frame_seconds)
        self.states = {s['name']: s for s in states if s['template'] is not None}
        self.chroma = np.maximum(np.asarray(chroma, dtype=float), 0.0)
        norms = np.linalg.norm(self.chroma, axis=0)
        self.normalized = self.chroma / np.maximum(norms, 1e-9)
        self.times = np.arange(self.chroma.shape[1]) * self.frame_seconds
        self._scores = {}
        self._tones = {}
        self._families = {}
        self.upper_chroma = upper_chroma

    def upper_voice_change(self, start, end):
        """A moving bass under stationary upper voices is not new harmony."""
        if self.upper_chroma is None:
            return True
        def mean(a, b):
            lo = max(0, int(np.ceil(a / self.frame_seconds)))
            hi = min(self.upper_chroma.shape[1], int(np.ceil(b / self.frame_seconds)))
            if hi <= lo:
                return None
            v = np.mean(self.upper_chroma[:, lo:hi], axis=1)
            norm = np.linalg.norm(v)
            return v / norm if norm > 1e-6 else None
        middle = mean(start, end)
        neighbors = [mean(start - 0.3, start - 0.05), mean(end + 0.05, end + 0.3)]
        # Bass harmonics can change the relative loudness of stationary upper
        # tones. An amplitude-only cosine must not turn that into new harmony.
        if middle is not None:
            signature = set(np.argsort(middle)[-3:])
            present = [n for n in neighbors if n is not None]
            if present and all(set(np.argsort(n)[-3:]) == signature for n in present):
                return False
        comparisons = [float(np.dot(middle, n)) for n in neighbors
                       if middle is not None and n is not None]
        return bool(comparisons and min(comparisons) < 0.96)

    def scores(self, chord):
        if chord not in self._scores:
            state = self.states.get(chord)
            self._scores[chord] = (state['template'] @ self.normalized
                                   if state else np.zeros(len(self.times)))
        return self._scores[chord]

    def indices(self, segment, trim=0.0):
        return np.flatnonzero((self.times >= segment['startTime'] + trim)
                              & (self.times < segment['endTime'] - trim))

    def tone_presence(self, chord):
        if chord not in self._tones:
            state = self.states.get(chord)
            if state is None:
                return np.zeros(len(self.times), dtype=bool)
            pcs = np.flatnonzero(state['template'] > 0)
            # A loud bass may exceed the upper voices by more than 10:1.
            floor = np.maximum(0.04 * np.max(self.chroma, axis=0),
                               1.5 * np.median(self.chroma, axis=0))
            self._tones[chord] = np.min(self.chroma[pcs], axis=0) >= np.maximum(floor, 1e-9)
        return self._tones[chord]

    def acoustic_scores(self, chord):
        # A root alone must not beat a full inversion just because it is loud.
        return self.scores(chord) - 0.2 * ~self.tone_presence(chord)

    def family_scores(self, chord):
        """Acoustic fit allowing the existing engine's seventh/sus voicings."""
        if chord not in self._families:
            state = self.states.get(chord)
            templates = (state.get('family_templates') or [state['template']]) if state else []
            self._families[chord] = (np.max(np.stack(templates) @ self.normalized, axis=0)
                                     if templates else np.zeros(len(self.times)))
        return self._families[chord]

    def resolve_recurring_harmony(self, segments, beat_seconds):
        """Resolve weak events by matching independently confirmed occurrences.

        Both full-range and upper-register fingerprints must agree, with a
        margin over other chords. A short, independently supported passing
        chord is never renamed by recurrence, however rare its root is.
        References are frozen before resolution, so guesses cannot teach one
        another and turn a whole ambiguous run into false confirmations.
        """
        out = [dict(s, analysis=dict(s.get('analysis', {}))) for s in segments]
        for seg in out:
            seg['analysis'].pop('contextEvidence', None)
        if self.upper_chroma is None:
            return out

        def fingerprint(seg):
            idx = self.indices(seg, trim=min(0.08, (seg['endTime'] - seg['startTime']) * 0.1))
            if not len(idx):
                return None
            upper_idx = idx[idx < self.upper_chroma.shape[1]]
            if not len(upper_idx):
                return None
            full = np.mean(self.chroma[:, idx], axis=1)
            upper = np.mean(self.upper_chroma[:, upper_idx], axis=1)
            nf, nu = np.linalg.norm(full), np.linalg.norm(upper)
            if nf < 1e-6 or nu < 1e-6:
                return None
            if np.max(full) < 1.5 * np.mean(full) or np.max(upper) < 1.5 * np.mean(upper):
                return None
            # A bass or a single melody pitch cannot establish chord quality.
            if np.count_nonzero(upper >= 0.2 * np.max(upper)) < 2:
                return None
            return full / nf, upper / nu, idx

        references = []
        for seg in segments:
            evidence = seg.get('analysis', {}).get('harmonicEvidence', {})
            if (seg['chord'] not in self.states
                    or seg['endTime'] - seg['startTime'] < 2.0 * beat_seconds
                    or not evidence.get('independent')
                    or evidence.get('supportSeconds', 0.0) < 0.2
                    or evidence.get('margin', 0.0) < 0.035):
                continue
            fp = fingerprint(seg)
            if fp is not None:
                references.append((seg, fp))

        for i, seg in enumerate(segments):
            if seg['chord'] not in self.states or not references:
                continue
            fp = fingerprint(seg)
            if fp is None:
                continue
            full, upper, idx = fp
            matches = {}
            for ref, (ref_full, ref_upper, _) in references:
                # Do not let an event provide its own independent confirmation.
                if ref['startTime'] < seg['endTime'] and seg['startTime'] < ref['endTime']:
                    continue
                sf, su = float(full @ ref_full), float(upper @ ref_upper)
                similarity = (sf + su) * 0.5
                previous = matches.get(ref['chord'])
                if previous is None or similarity > previous[0]:
                    matches[ref['chord']] = (similarity, sf, su, ref)
            if not matches:
                continue
            own_evidence = seg.get('analysis', {}).get('harmonicEvidence', {})
            # A shared root can be clear while its third or fifth is confused
            # by vocals. Resolve quality only when both a known voicing and
            # the distinctive note contradict the original interpretation.
            quality_matches = {}
            mean_chroma = np.mean(self.chroma[:, idx], axis=1)
            peak = max(float(np.max(mean_chroma)), 1e-9)
            own_state = self.states[seg['chord']]
            own_pcs = set(np.flatnonzero(own_state['template'] > 0))
            if not own_evidence.get('independent') and mean_chroma[own_state['root']] >= 0.12 * peak:
                for chord, match in matches.items():
                    state = self.states[chord]
                    if (chord == seg['chord'] or state['root'] != own_state['root']
                            or match[1] < 0.93 or match[2] < 0.90):
                        continue
                    pcs = set(np.flatnonzero(state['template'] > 0))
                    added, removed = list(pcs - own_pcs), list(own_pcs - pcs)
                    if not added or not removed:
                        continue
                    positive = float(np.mean(mean_chroma[added]))
                    negative = float(np.mean(mean_chroma[removed]))
                    if positive - negative >= 0.12 * peak and positive >= 1.4 * negative:
                        quality_matches[chord] = match
            ranked = sorted(matches, key=lambda c: -matches[c][0])
            quality_resolution = bool(quality_matches)
            if quality_resolution:
                ranked = sorted(quality_matches, key=lambda c: -quality_matches[c][0])
            winner = ranked[0]
            score, sf, su, ref = matches[winner]
            runner_up = matches[ranked[1]][0] if len(ranked) > 1 else 0.0
            margin = score - runner_up
            if sf < (0.93 if quality_resolution else 0.94) or su < 0.90 or margin < 0.025:
                continue
            if winner != seg['chord']:
                if own_evidence.get('independent'):
                    continue
                gain = float(np.mean(self.family_scores(winner)[idx]
                                     - self.family_scores(seg['chord'])[idx]))
                if not quality_resolution and gain < 0.025:
                    continue
                out[i]['chord'] = winner
            # Even a same-label match is a new independent acoustic source of
            # support for incomplete/noisy voicings, rather than a role override.
            out[i]['analysis']['contextEvidence'] = {
                'confirmed': True, 'source': 'recurring_harmony', 'chord': winner,
                'kind': 'quality_resolution' if quality_resolution else 'voicing_match',
                'fullSimilarity': round(sf, 4), 'upperSimilarity': round(su, 4),
                'margin': round(margin, 4),
                'referenceStartTime': float(ref['startTime']),
                'referenceEndTime': float(ref['endTime']),
            }
        return out

    def evidence(self, segment, neighbors=()):
        """Require sustained full harmony, not a single melodic/bass note.

        Comparing on the SHORT event itself avoids letting a long neighbor
        overwhelm a real passing chord when the two windows are pooled.
        """
        state = self.states.get(segment['chord'])
        idx = self.indices(segment, trim=min(0.05,
                           (segment['endTime'] - segment['startTime']) * 0.1))
        if state is None or not len(idx):
            return {'independent': False, 'supportSeconds': 0.0, 'margin': 0.0}
        own = self.scores(segment['chord'])[idx]
        rivals = [self.acoustic_scores(n['chord'])[idx] for n in neighbors
                  if n['chord'] in self.states and n['chord'] != segment['chord']]
        margin = own - np.maximum.reduce(rivals) if rivals else own
        # All triad tones must be audible together. An isolated root with its
        # fifth, or a fleeting chromatic melody, cannot establish a chord.
        # A bass fundamental can be over ten times louder than the upper
        # third in a piano CQT. Compare with the noise floor as well as peak.
        tones = self.tone_presence(segment['chord'])[idx]
        # Inversions put the loudest tone somewhere other than the root.
        # Their weighted cosine is naturally lower despite all tones being
        # present; the missing-tone check and local margin remain mandatory.
        loudest = np.argmax(self.chroma[:, idx], axis=0)
        threshold = np.where(loudest == state['root'], 0.72, 0.65)
        supported = (own >= threshold) & (margin >= 0.035) & tones
        longest = run = 0
        for yes in supported:
            run = run + 1 if yes else 0
            longest = max(longest, run)
        support = longest * self.frame_seconds
        return {'independent': bool(support >= 0.12),
                'supportSeconds': round(support, 3),
                'margin': round(float(np.median(margin)), 3)}

    def annotate(self, segments):
        for i, seg in enumerate(segments):
            neighbors = segments[max(0, i - 1):i] + segments[i + 1:i + 2]
            evidence = self.evidence(seg, neighbors)
            seg['_independentHarmony'] = evidence['independent']
            seg['_upperVoiceChange'] = self.upper_voice_change(seg['startTime'], seg['endTime'])
            seg['analysis'] = {**seg.get('analysis', {}), 'harmonicEvidence': evidence}
        return segments

    def recover_local_harmonies(self, segments):
        """Restore full chords hidden by coarse smoothing inside a flat label.

        Require a sustained winner over BOTH the displayed chord and every
        other candidate. Missing triad tones or ambiguous overlaps stay out.
        """
        names = list(self.states)
        if not names or not len(self.times):
            return segments
        matrix = np.stack([self.acoustic_scores(name) for name in names])
        order = np.argsort(matrix, axis=0)
        winners = order[-1]
        cols = np.arange(len(self.times))
        margins = matrix[winners, cols] - matrix[order[-2], cols]
        out = []
        min_frames = max(2, int(np.ceil(0.16 / self.frame_seconds)))
        for seg in segments:
            if seg['chord'] not in self.states:
                out.append(dict(seg))
                continue
            idx = self.indices(seg)
            original = self.acoustic_scores(seg['chord'])
            cursor = float(seg['startTime'])
            k = 0
            while k < len(idx):
                frame = idx[k]
                chord = names[int(winners[frame])]
                if (chord == seg['chord'] or margins[frame] < 0.04
                        or matrix[winners[frame], frame] - original[frame] < 0.08):
                    k += 1
                    continue
                end = k + 1
                while (end < len(idx) and winners[idx[end]] == winners[frame]
                       and margins[idx[end]] >= 0.04
                       and matrix[winners[frame], idx[end]] - original[idx[end]] >= 0.08):
                    end += 1
                start_time = float(self.times[frame])
                end_time = min(float(seg['endTime']), float(self.times[idx[end - 1]]) + self.frame_seconds)
                candidate = dict(seg, chord=chord, startTime=start_time, endTime=end_time,
                                 _recoveredFrom=seg['chord'])
                if (end - k >= min_frames
                        and self.evidence(candidate, [seg])['independent']
                        and self.upper_voice_change(start_time, end_time)):
                    if start_time > cursor + self.frame_seconds:
                        out.append(dict(seg, startTime=cursor, endTime=start_time))
                    else:
                        candidate['startTime'] = cursor
                    out.append(candidate)
                    cursor = end_time
                k = end
            if cursor < seg['endTime']:
                if seg['endTime'] - cursor <= self.frame_seconds and out:
                    out[-1]['endTime'] = seg['endTime']
                else:
                    out.append(dict(seg, startTime=cursor))
        return out

    def reject_unconfirmed_recoveries(self, segments):
        """A newly inserted chord must still be supported after time fitting.

        If fitting or neighboring insertions removed that proof, restore the
        decoder's original label instead of introducing an uncertain chord.
        """
        out = [dict(s) for s in segments]
        for i, seg in enumerate(segments):
            original = seg.get('_recoveredFrom')
            if not original:
                continue
            neighbors = segments[max(0, i - 1):i] + segments[i + 1:i + 2]
            if not self.evidence(seg, neighbors)['independent']:
                out[i]['chord'] = original
                out[i].pop('_recoveredFrom', None)
        return out

    def refine_boundaries(self, segments, max_shift=1.0):
        """Fit each pair to unsmoothed audio; require evidence on both sides.

        Optimize the split jointly (left chord before, right chord after).
        This handles both early and late labels without a global offset.
        Neighbors bound the search, so short passing chords cannot be crossed.
        """
        out = [dict(s) for s in segments]
        for left, right in zip(out, out[1:]):
            if (left['chord'] not in self.states or right['chord'] not in self.states
                    or left['chord'] == right['chord']
                    or abs(left['endTime'] - right['startTime']) > 1e-3):
                continue
            old = float(right['startTime'])
            lo = max(old - max_shift, left['startTime'] + 0.12)
            hi = min(old + max_shift, right['endTime'] - 0.12)
            idx = np.flatnonzero((self.times >= lo) & (self.times <= hi))
            if len(idx) < 6:
                continue
            contrast = (self.acoustic_scores(left['chord']) - self.acoustic_scores(right['chord']))[idx]
            # Split after k frames: maximizing left-right score is equivalent
            # to maximizing its prefix sum. Keep enough evidence either side.
            prefix = np.concatenate(([0.0], np.cumsum(contrast)))
            guard = max(2, int(np.ceil(0.09 / self.frame_seconds)))
            candidates = np.arange(guard, len(idx) - guard + 1)
            if not len(candidates):
                continue
            best = int(candidates[np.argmax(prefix[candidates])])
            original = int(np.searchsorted(self.times[idx], old))
            gain = (prefix[best] - prefix[original]) / len(idx)
            before = contrast[max(0, best - guard):best]
            after = contrast[best:best + guard]
            if gain < 0.005 or np.mean(before) < 0.015 or np.mean(after) > -0.015:
                continue
            boundary = float(self.times[idx[best]])
            left['endTime'] = right['startTime'] = boundary
        return out

    def suppress_unsupported_short_events(self, segments, max_duration):
        """Absorb a short detection only when a neighbor acoustically wins.

        Ambiguous events stay visible as uncertain; a positive proof is needed
        to remove one. A supported passing chord is always preserved.
        """
        out = [dict(s) for s in segments]
        for i in range(1, len(out) - 1):
            left, seg, right = out[i - 1:i + 2]
            if (seg['endTime'] - seg['startTime'] > max_duration
                    or seg['chord'] not in self.states
                    or left['chord'] not in self.states or right['chord'] not in self.states
                    or abs(left['endTime'] - seg['startTime']) > 1e-3
                    or abs(seg['endTime'] - right['startTime']) > 1e-3
                    or self.evidence(seg, [left, right])['independent']):
                continue
            duration = seg['endTime'] - seg['startTime']
            idx = self.indices(seg, trim=0.0 if duration < 0.12 else min(0.04, duration * 0.1))
            if not len(idx):
                continue
            neighbor = max((left, right), key=lambda n: np.mean(self.acoustic_scores(n['chord'])[idx]))
            gain = np.mean(self.acoustic_scores(neighbor['chord'])[idx] - self.acoustic_scores(seg['chord'])[idx])
            if gain >= (0.0 if duration < 0.12 else 0.035):
                seg['chord'] = neighbor['chord']
                seg['state'] = neighbor.get('state')
                seg['confidence'] = float(np.mean(self.scores(seg['chord'])[idx]))
        return out

    def refresh_segments(self, segments, grid_times, observations, states):
        """Rebuild ownership and confidence after merges and time corrections."""
        by_name = {s['name']: i for i, s in enumerate(states)}
        grid_times = np.asarray(grid_times)
        for seg in segments:
            idx = np.flatnonzero((grid_times >= seg['startTime'])
                                 & (grid_times < seg['endTime']))
            seg['beatIndices'] = idx.tolist()
            seg['beatRealTimes'] = grid_times[idx].tolist()
            seg['state'] = by_name.get(seg['chord'])
            raw_idx = self.indices(seg)
            if seg['chord'] == 'N':
                seg['confidence'] = 0.0
            elif len(raw_idx) and seg['chord'] in self.states:
                seg['confidence'] = float(np.mean(self.scores(seg['chord'])[raw_idx]))
            seg['observation_candidates'] = []
            if len(idx):
                means = np.mean(observations[idx], axis=0)
                seg['observation_candidates'] = [
                    {'chord': states[int(j)]['name'], 'emission_score': round(float(means[j]), 3)}
                    for j in np.argsort(means)[-3:][::-1]]
        return self.annotate(segments)
