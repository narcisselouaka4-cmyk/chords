#!/usr/bin/env python3
"""
Fusion Engine — combine Bass Engine candidates + Chord Engine context
into a single bass line using configurable weighted scoring.

Consumes only pre-computed outputs:
  - candidates.json (from export_bass_candidates.py)
  - chords.json      (from audio-processor.py analyze-chords)

Produces:
  - segments.json    (timeline of bass notes, same format as BE output)
  - trace.json       (per-frame candidate scores for full traceability)
"""
import sys, os, json, math, argparse, importlib.util
import numpy as np
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
from abc import ABC, abstractmethod

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

PC_TO_NOTE = {i: n for i, n in enumerate(NOTE_NAMES)}
NOTE_TO_PC = {n: i for i, n in enumerate(NOTE_NAMES)}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)


# ---------------------------------------------------------------------------
# Chord parsing
# ---------------------------------------------------------------------------

CHORD_QUALITY_PATTERNS = [
    ('min', ['m', 'min', '-']),
    ('maj7', ['maj7', 'M7']),
    ('min7', ['m7', 'min7', '-7']),
    ('7', ['7']),
    ('dim', ['dim', '°', 'o']),
    ('aug', ['aug', '+']),
    ('sus2', ['sus2']),
    ('sus4', ['sus4']),
]

NOTE_PCS = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}


def parse_root(chord_str: str) -> Optional[str]:
    if not chord_str:
        return None
    if len(chord_str) >= 2 and chord_str[:2] in NOTE_PCS:
        return chord_str[:2]
    if chord_str[0] in NOTE_PCS:
        return chord_str[0]
    return None


def parse_slash_bass(chord_str: str) -> Optional[str]:
    if '/' in chord_str:
        parts = chord_str.split('/')
        return parse_root(parts[-1].strip())
    return None


@dataclass
class ChordInfo:
    start: float
    end: float
    chord_name: str
    root_pc: int
    root_name: str
    quality: str
    confidence: float
    slash_bass_pc: Optional[int]
    slash_bass_name: Optional[str]

    @classmethod
    def from_dict(cls, d: dict) -> Optional['ChordInfo']:
        chord_name = d.get('structural_chord') or d.get('chord') or ''
        if not chord_name:
            return None
        confidence = d.get('confidence', 0.0) or 0.0
        root_name = parse_root(chord_name)
        if not root_name:
            return None
        root_pc = NOTE_PCS[root_name]
        slash_bass_name = parse_slash_bass(chord_name)
        slash_bass_pc = NOTE_PCS.get(slash_bass_name) if slash_bass_name else None
        quality = chord_name[len(root_name):] if root_name else ''

        return cls(
            start=d['startTime'],
            end=d['endTime'],
            chord_name=chord_name,
            root_pc=root_pc,
            root_name=root_name,
            quality=quality,
            confidence=confidence,
            slash_bass_pc=slash_bass_pc,
            slash_bass_name=slash_bass_name,
        )


def load_chords(chords_path: str) -> List[ChordInfo]:
    with open(chords_path) as f:
        content = f.read()
    for line in content.split('\n'):
        line = line.strip()
        if line.startswith('{'):
            data = json.loads(line)
            break
    else:
        data = json.loads(content)

    chords_data = data.get('chords', [])
    results = []
    for c in chords_data:
        info = ChordInfo.from_dict(c)
        if info:
            results.append(info)
    return results, data


# ---------------------------------------------------------------------------
# Harmonic note roles within a chord
# ---------------------------------------------------------------------------

def note_role_in_chord(pc: int, chord: ChordInfo) -> str:
    root = chord.root_pc
    if chord.slash_bass_pc is not None and pc == chord.slash_bass_pc:
        return 'slash_bass'
    if pc == root:
        return 'root'

    # Third
    third_semitones = 4 if chord.quality.startswith('maj') or chord.quality == '' else 3
    third_semitones = 3 if chord.quality.startswith('min') or chord.quality.startswith('m') else third_semitones
    third_pc = (root + third_semitones) % 12
    if pc == third_pc:
        return 'third'

    # Fifth
    fifth_pc = (root + 7) % 12
    # Handle diminished fifth for dim chords
    if 'dim' in chord.quality or chord.quality == '°':
        fifth_pc = (root + 6) % 12
    if pc == fifth_pc:
        return 'fifth'

    # Seventh
    seventh_semitones = 10
    if 'maj7' in chord.quality or chord.quality == 'M7':
        seventh_semitones = 11
    elif 'dim' in chord.quality:
        seventh_semitones = 9
    seventh_pc = (root + seventh_semitones) % 12
    if pc == seventh_pc:
        return 'seventh'

    return 'non_chord'


# ---------------------------------------------------------------------------
# Score components (declarative)
# ---------------------------------------------------------------------------

class FusionContext:
    def __init__(self, frame_time: float, chord: Optional[ChordInfo],
                 previous_midi: Optional[int], params: dict):
        self.frame_time = frame_time
        self.chord = chord
        self.previous_midi = previous_midi
        self.params = params


class ScoreComponent(ABC):
    @abstractmethod
    def compute(self, candidate: dict, context: FusionContext) -> float:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


class BassScore(ScoreComponent):
    name = 'bass_score'

    def compute(self, candidate: dict, context: FusionContext) -> float:
        return float(candidate.get('score', 0.0))


class HarmonicScore(ScoreComponent):
    name = 'harmonic_score'

    def compute(self, candidate: dict, context: FusionContext) -> float:
        chord = context.chord
        if chord is None:
            return 0.0
        cand_midi = candidate['midi']
        cand_pc = cand_midi % 12
        role = note_role_in_chord(cand_pc, chord)
        bonus_table = context.params.get('harmonic_bonus', {})
        return float(bonus_table.get(role, 0.0))


class OctaveScore(ScoreComponent):
    name = 'octave_score'

    def compute(self, candidate: dict, context: FusionContext) -> float:
        octave = candidate['octave']
        bonus_table = context.params.get('octave_bonus', {})
        return float(bonus_table.get(str(octave), 0.0))


class ContinuityScore(ScoreComponent):
    name = 'continuity_score'

    def compute(self, candidate: dict, context: FusionContext) -> float:
        prev = context.previous_midi
        if prev is None:
            return 0.0
        curr = candidate['midi']
        interval = abs(curr - prev)
        max_int = context.params.get('continuity', {}).get('max_interval_semitones', 24)
        decay = context.params.get('continuity', {}).get('decay', 1.0)
        return max(0.0, 1.0 - (interval / max_int)) * decay


class ChordConfidenceMultiplier(ScoreComponent):
    name = 'chord_confidence_multiplier'

    def compute(self, candidate: dict, context: FusionContext) -> float:
        if context.chord is None:
            return 1.0
        return float(context.chord.confidence)


# Registry
COMPONENT_CLASSES = {
    'BassScore': BassScore,
    'HarmonicScore': HarmonicScore,
    'OctaveScore': OctaveScore,
    'ContinuityScore': ContinuityScore,
    'ChordConfidenceMultiplier': ChordConfidenceMultiplier,
}


# ---------------------------------------------------------------------------
# Fusion Engine
# ---------------------------------------------------------------------------

class FusionEngine:
    def __init__(self, params_path: Optional[str] = None):
        self.params = self._load_params(params_path)
        self.components = self._init_components()
        self.modulators = self._init_modulators()

    def _load_params(self, params_path: Optional[str] = None) -> dict:
        if params_path is None:
            params_path = os.path.join(PROJECT_DIR, 'fusion_params.json')
        with open(params_path) as f:
            return json.load(f)

    def _init_components(self) -> List[Tuple[ScoreComponent, float]]:
        result = []
        for spec in self.params.get('components', []):
            class_name = spec.get('class', '')
            cls = COMPONENT_CLASSES.get(class_name)
            if cls is None:
                print(f'  [WARN] Unknown component class: {class_name}', file=sys.stderr)
                continue
            weight = float(spec.get('weight', 1.0))
            result.append((cls(), weight))
        return result

    def _init_modulators(self) -> List[Tuple[ScoreComponent, str, float]]:
        result = []
        for spec in self.params.get('modulators', []):
            class_name = spec.get('class', '')
            cls = COMPONENT_CLASSES.get(class_name)
            if cls is None:
                print(f'  [WARN] Unknown modulator class: {class_name}', file=sys.stderr)
                continue
            target = spec.get('target', '')
            weight = float(spec.get('weight', 1.0))
            result.append((cls(), target, weight))
        return result

    def score_candidate(self, candidate: dict, context: FusionContext) -> Tuple[float, dict]:
        scores = {}
        total = 0.0

        for comp, weight in self.components:
            value = comp.compute(candidate, context)
            scores[comp.name] = round(value, 4)
            total += weight * value

        for mod, target, m_weight in self.modulators:
            m_value = mod.compute(candidate, context)
            scores[mod.name] = round(m_value, 4)
            # Apply modulator to target component weight
            total += 0.0  # modulator's effect is on the target, not additive
            # The modulator's value will be used by the caller to explain the score
            # but the actual modulated score is: component_weight * component_value * m_value^m_weight
            # We handle this in a second pass below

        # Second pass: apply modulators to their targets
        # We need to find the modulated component and adjust its contribution
        # We do this by checking modulators and adjusting the target's contribution
        component_names = [c.name for c, _ in self.components]

        for mod, target, m_weight in self.modulators:
            if target in scores:
                m_value = scores[mod.name]
                target_idx = component_names.index(target) if target in component_names else -1
                if target_idx >= 0:
                    _, base_weight = self.components[target_idx]
                    target_value = scores[target]
                    # The original contribution was base_weight * target_value
                    # Subtract it, then add the modulated version
                    total -= base_weight * target_value
                    modulated_value = target_value * (m_value ** m_weight)
                    total += base_weight * modulated_value
                    scores[f'{target}_modulated'] = round(modulated_value, 4)
                    scores[f'{mod.name}_applied'] = round(m_value ** m_weight, 4)

        return round(total, 4), scores

    def align_chords_to_frames(self, frames: list, chords: List[ChordInfo]) -> List[Optional[ChordInfo]]:
        aligned = []
        chord_idx = 0
        for f in frames:
            t = f['time']
            # Advance chord_idx to find the covering chord
            while chord_idx < len(chords) and chords[chord_idx].end <= t:
                chord_idx += 1
            if chord_idx < len(chords) and chords[chord_idx].start <= t < chords[chord_idx].end:
                aligned.append(chords[chord_idx])
            else:
                aligned.append(None)
        return aligned

    def _inject_virtual_candidates(self, candidates: list, context: FusionContext) -> list:
        params = self.params.get('virtual_root', {})
        if not params.get('enabled', True):
            return candidates
        chord = context.chord
        if chord is None:
            return candidates
        score_ratio = float(params.get('score_ratio', 0.3))
        default_octaves = params.get('default_octaves', [2, 3, 4])
        target_pcs = [chord.root_pc]
        if chord.slash_bass_pc is not None:
            target_pcs.append(chord.slash_bass_pc)
        real_scores = [c.get('score', 0.0) for c in candidates if not c.get('is_virtual')]
        best_real_score = max(real_scores) if real_scores else 0.0
        existing_pcs = set(c['midi'] % 12 for c in candidates)
        new_candidates = list(candidates)
        for target_pc in target_pcs:
            if target_pc in existing_pcs:
                continue
            for octave in default_octaves:
                midi = target_pc + 12 * (octave + 1)
                note_name = PC_TO_NOTE[target_pc]
                new_candidates.append({
                    'midi': midi,
                    'note': f'{note_name}{octave}',
                    'octave': octave,
                    'score': round(best_real_score * score_ratio, 4),
                    'source': 'virtual_root',
                    'is_virtual': True,
                })
        if len(new_candidates) > len(candidates):
            log(f'  Injected {len(new_candidates) - len(candidates)} virtual candidate(s) '
                f'(root={NOTE_NAMES[chord.root_pc]}, '
                f'slash={NOTE_NAMES[chord.slash_bass_pc] if chord.slash_bass_pc is not None else "None"})')
        return new_candidates

    def run(self, candidates_path: str, chords_path: str,
            output_segments: Optional[str] = None,
            output_trace: Optional[str] = None) -> Tuple[List[dict], dict]:
        # Load inputs
        with open(candidates_path) as f:
            candidates_data = json.load(f)
        frames = candidates_data['frames']

        chords, chords_meta = load_chords(chords_path)
        log(f'Loaded {len(frames)} frames, {len(chords)} chord segments')

        # Align chords to frames
        chord_map = self.align_chords_to_frames(frames, chords)

        # Score each frame
        trace_frames = []
        selected_midis = []
        prev_midi = None

        for i, f in enumerate(frames):
            t = f['time']
            silent = f.get('silent', False)
            chord = chord_map[i]
            context = FusionContext(t, chord, prev_midi, self.params)

            if silent or not f.get('candidates'):
                trace_frames.append({
                    'time': t,
                    'frame': i,
                    'silent': True,
                    'candidates': [],
                    'selected': None,
                })
                selected_midis.append(None)
                continue

            candidates = self._inject_virtual_candidates(f['candidates'], context)
            scored = []
            for cand in candidates:
                final_score, score_components = self.score_candidate(cand, context)
                scored.append({
                    'midi': cand['midi'],
                    'note': cand.get('note', ''),
                    'octave': cand.get('octave', 0),
                    'source': cand.get('source', 'bass_engine'),
                    'is_virtual': cand.get('is_virtual', False),
                    **score_components,
                    'final_score': final_score,
                })

            # Sort by final score descending, pick winner
            scored.sort(key=lambda x: x['final_score'], reverse=True)
            for j, s in enumerate(scored):
                s['rank'] = j + 1
                s['selected'] = (j == 0)

            best = scored[0]
            selected_midis.append(best['midi'])
            prev_midi = best['midi']

            trace_frames.append({
                'time': t,
                'frame': i,
                'silent': False,
                'chord': {
                    'name': chord.chord_name if chord else None,
                    'root': chord.root_name if chord else None,
                    'confidence': chord.confidence if chord else None,
                } if chord else None,
                'previous_midi': context.previous_midi,
                'selected_source': best.get('source', 'bass_engine'),
                'selected_is_virtual': best.get('is_virtual', False),
                'candidates': scored,
            })

        # Smooth and segment
        segments = self.smooth_and_segment(selected_midis, frames, candidates_data)
        log(f'Produced {len(segments)} segments')

        # Build output structures
        result_segments = {
            'params': {
                'candidates': candidates_path,
                'chords': chords_path,
                'fusion_params': self.params.get('components', [])
                              + self.params.get('modulators', []),
            },
            'n_segments': len(segments),
            'segments': segments,
        }

        n_virtual = sum(1 for tf in trace_frames if tf.get('selected_is_virtual'))
        n_non_silent = sum(1 for tf in trace_frames if not tf.get('silent'))
        virtual_pct = round(n_virtual / n_non_silent * 100, 1) if n_non_silent > 0 else 0.0

        result_trace = {
            'wav': candidates_data.get('wav', ''),
            'duration': candidates_data.get('duration', 0),
            'n_frames': len(trace_frames),
            'n_virtual_selected': n_virtual,
            'virtual_pct': virtual_pct,
            'params': {
                'candidates_path': candidates_path,
                'chords_path': chords_path,
            },
            'frames': trace_frames,
        }

        if output_segments:
            with open(output_segments, 'w') as f:
                json.dump(result_segments, f, indent=2)
            log(f'Segments written to {output_segments}')

        if output_trace:
            with open(output_trace, 'w') as f:
                json.dump(result_trace, f, indent=2)
            log(f'Trace written to {output_trace}')

        return segments, trace_frames

    def smooth_and_segment(self, selected_midis: list, frames: list,
                           candidates_data: dict) -> List[dict]:
        half = self.params.get('smoothing_window', 2)
        min_dur = self.params.get('min_segment_duration', 0.15)
        sr = candidates_data.get('params', {}).get('sr', 22050)
        hop = candidates_data.get('params', {}).get('hop_length', 512)
        frame_dur = hop / sr

        n = len(selected_midis)

        # Mode smoothing
        midi_arr = np.array([m if m is not None else -1 for m in selected_midis], dtype=int)
        smoothed = midi_arr.copy()
        for i in range(n):
            lo = max(0, i - half)
            hi = min(n, i + half + 1)
            window = midi_arr[lo:hi]
            valid = window[window >= 0]
            if len(valid) > 0:
                counts = np.bincount(valid)
                smoothed[i] = np.argmax(counts)

        # Segment: merge consecutive same-MIDI
        segments = []
        seg_start = None
        seg_midi = None

        for i in range(n):
            current_midi = int(smoothed[i]) if smoothed[i] >= 0 else None
            if current_midi is not None:
                if seg_midi is None:
                    seg_start = frames[i]['time']
                    seg_midi = current_midi
                elif current_midi != seg_midi:
                    seg_end = frames[i]['time']
                    dur = seg_end - seg_start
                    if dur >= min_dur:
                        note_name = NOTE_NAMES[seg_midi % 12]
                        octave = seg_midi // 12 - 1
                        segments.append({
                            'startTime': round(seg_start, 4),
                            'endTime': round(seg_end, 4),
                            'midi': seg_midi,
                            'bass': note_name,
                            'octave': octave,
                            'note': f'{note_name}{octave}',
                            'confidence': 1.0,
                        })
                    seg_start = frames[i]['time']
                    seg_midi = current_midi
            else:
                if seg_midi is not None:
                    seg_end = frames[i]['time']
                    dur = seg_end - seg_start
                    if dur >= min_dur:
                        note_name = NOTE_NAMES[seg_midi % 12]
                        octave = seg_midi // 12 - 1
                        segments.append({
                            'startTime': round(seg_start, 4),
                            'endTime': round(seg_end, 4),
                            'midi': seg_midi,
                            'bass': note_name,
                            'octave': octave,
                            'note': f'{note_name}{octave}',
                            'confidence': 1.0,
                        })
                    seg_midi = None

        # Close last segment
        if seg_midi is not None:
            seg_end = frames[-1]['time'] + frame_dur
            dur = seg_end - seg_start
            if dur >= min_dur:
                note_name = NOTE_NAMES[seg_midi % 12]
                octave = seg_midi // 12 - 1
                segments.append({
                    'startTime': round(seg_start, 4),
                    'endTime': round(seg_end, 4),
                    'midi': seg_midi,
                    'bass': note_name,
                    'octave': octave,
                    'note': f'{note_name}{octave}',
                    'confidence': 1.0,
                })

        return segments


def log(msg):
    print(f'[FusionEngine] {msg}', file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser(
        description='Fusion Engine — combine Bass + Chord Engine outputs')
    parser.add_argument('--candidates', required=True,
                        help='Candidates JSON from export_bass_candidates.py')
    parser.add_argument('--chords', required=True,
                        help='Chords JSON from audio-processor.py')
    parser.add_argument('--params', default=None,
                        help='Fusion params JSON')
    parser.add_argument('--output-segments', default=None,
                        help='Output segments JSON path')
    parser.add_argument('--output-trace', default=None,
                        help='Output trace JSON path')
    args = parser.parse_args()

    for p in [args.candidates, args.chords]:
        if not os.path.isfile(p):
            print(f'[ERROR] File not found: {p}')
            return 1

    engine = FusionEngine(params_path=args.params)
    segments, trace = engine.run(
        args.candidates, args.chords,
        output_segments=args.output_segments,
        output_trace=args.output_trace,
    )

    print(json.dumps({'n_segments': len(segments)}, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
