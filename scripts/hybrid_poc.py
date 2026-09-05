#!/usr/bin/env python3
"""Proof-of-concept : Hybrid HMM + ISMIR2019 chord recognition.

Architecture: HMM provides tempo/beats/key, ISMIR2019 provides chord qualities.
Alignment: ISMIR segments snapped to HMM beat grid, arbitration = HMM root + ISMIR quality.
"""

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import statistics
from collections import Counter
from datetime import datetime

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ISMIR2019 paths
ISMIR_DIR = os.path.join(PROJECT, 'ism2019-chord')
ISMIR_VENV = os.path.join(ISMIR_DIR, 'venv')
ISMIR_SCRIPT = os.path.join(ISMIR_DIR, 'chord_recognition.py')
ISMIR_PYTHON = os.path.join(ISMIR_VENV, 'bin', 'python')

# Corpus
CORPUS_B1 = os.path.join(PROJECT, 'tests', 'corpus', 'b1')
CORPUS_B2 = os.path.join(PROJECT, 'tests', 'corpus', 'b2')
BENCH_OUT = os.path.join(PROJECT, 'benchmark_outputs')

# Load HMM module
AP_PATH = os.path.join(PROJECT, 'electron', 'audio-processor.py')
spec = importlib.util.spec_from_file_location('audio_processor', AP_PATH)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

# mir_eval mapping
ENGINE_TO_MIREVAL = {
    '': 'maj', 'm': 'min', '7': '7', 'maj7': 'maj7', 'm7': 'min7',
    'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus2': 'sus2',
    'sus4': 'sus4', 'm7b5': 'hdim7', '6': 'maj6', 'm6': 'min6',
}

def engine_label_to_mireval(label):
    if not label or label == 'N':
        return 'N'
    if '/' in label:
        label = label.split('/')[0]
    root, suffix = ap._parse_chord_label(label)
    if root is None:
        return 'N'
    quality = ENGINE_TO_MIREVAL.get(suffix or '')
    if quality is None:
        quality = 'min' if (suffix or '').startswith('m') else 'maj'
    return f'{ap.NOTE_NAMES[root % 12]}:{quality}'

def ismr_label_to_mireval(label):
    """Convert ISMIR2019 label (e.g. 'C:maj', 'D:min7') to mir_eval format."""
    if not label or label == 'N':
        return 'N'
    parts = label.split(':')
    if len(parts) != 2:
        return 'N'
    root, quality = parts
    quality_map = {
        'maj': 'maj', 'min': 'min', '7': '7', 'maj7': 'maj7', 'min7': 'min7',
        'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
        '9': '7', 'min9': 'min7', 'maj9': 'maj7', '11': '7', '13': '7',
        'hdim7': 'hdim7', 'min/b7': 'min7', 'maj/b7': '7', 'min/2': 'min',
        'maj/2': 'maj', 'sus4(b7)': 'sus4', 'min/5': 'min', 'min/b3': 'min',
        'maj/5': 'maj', 'maj/3': 'maj',
        # Extended qualities from ISMIR2019
        'min/b3': 'min', 'min/b5': 'min', 'maj/b3': 'maj', 'maj/b5': 'maj',
        'min/7': 'min7', 'maj/7': 'maj7', 'min/9': 'min7', 'maj/9': 'maj7',
        'min/11': 'min7', 'maj/11': 'maj7', 'min/13': 'min7', 'maj/13': 'maj7',
        'sus2/b7': 'sus2', 'sus4/b7': 'sus4',
    }
    mir_quality = quality_map.get(quality, 'maj')
    return f'{root}:{mir_quality}'

def run_ismir2019(wav_path, lab_path, chord_dict='submission'):
    """Run ISMIR2019 chord recognition on a WAV file."""
    if not os.path.exists(ISMIR_PYTHON):
        python = sys.executable
    else:
        python = ISMIR_PYTHON
    
    env = os.environ.copy()
    env['PYTHONPATH'] = ISMIR_DIR
    
    cmd = [python, ISMIR_SCRIPT, wav_path, lab_path, chord_dict]
    proc = subprocess.run(cmd, capture_output=True, text=True, 
                          cwd=ISMIR_DIR, env=env, timeout=120)
    if proc.returncode != 0:
        raise RuntimeError(f'ISMIR2019 failed: {proc.stderr[-500:]}')
    return True

def parse_lab_file(lab_path):
    """Parse ISMIR2019 .lab output file into segments."""
    segments = []
    with open(lab_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) >= 3:
                start = float(parts[0])
                end = float(parts[1])
                chord = parts[2]
                segments.append({
                    'start': start,
                    'end': end,
                    'chord': ismr_label_to_mireval(chord),
                    'raw': chord,
                })
    return segments

def parse_hmm_chord(label):
    """Parse HMM chord label to (root_pc, suffix)."""
    if not label or label == 'N':
        return None, ''
    if '/' in label:
        label = label.split('/')[0]
    root, suffix = ap._parse_chord_label(label)
    return root, suffix or ''

def align_ismir_to_hmm_grid(ismir_segments, hmm_segments, beat_times):
    """Align ISMIR segments to HMM beat grid.
    
    For each HMM segment (which spans multiple beats), collect ISMIR chords
    that overlap it and determine the majority quality.
    """
    if not ismir_segments or not hmm_segments:
        return hmm_segments
    
    aligned = []
    for hmm_seg in hmm_segments:
        h_start = hmm_seg['startTime']
        h_end = hmm_seg['endTime']
        hmm_root, hmm_suffix = parse_hmm_chord(hmm_seg['chord'])
        
        # Collect ISMIR segments overlapping this HMM segment
        overlapping = []
        for ism in ismir_segments:
            # Check temporal overlap
            if ism['end'] <= h_start or ism['start'] >= h_end:
                continue
            overlap = min(ism['end'], h_end) - max(ism['start'], h_start)
            if overlap > 0:
                overlapping.append((overlap, ism))
        
        if not overlapping:
            # No ISMIR data in this window -> keep HMM
            aligned.append(hmm_seg)
            continue
        
        # Vote on quality from ISMIR chords (weighted by overlap)
        quality_votes = Counter()
        for overlap, ism in overlapping:
            ism_root, ism_quality = ism['chord'].split(':') if ':' in ism['chord'] else (None, 'maj')
            quality_votes[ism_quality] += overlap
        
        if quality_votes:
            best_quality = quality_votes.most_common(1)[0][0]
            # Map back to HMM suffix format
            hmm_suffix_map = {'maj': '', 'min': 'm', '7': '7', 'maj7': 'maj7', 
                              'min7': 'm7', 'dim': 'dim', 'dim7': 'dim7', 
                              'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
                              'hdim7': 'm7b5',
                              # ISMIR2019 extended qualities
                              'min/b3': 'm', 'min/b5': 'm', 'maj/b3': '', 'maj/b5': '',
                              'min/7': 'm7', 'maj/7': 'maj7', 'min/9': 'm7', 'maj/9': 'maj7',
                              'min/11': 'm7', 'maj/11': 'maj7', 'min/13': 'm7', 'maj/13': 'maj7',
                              'sus2/b7': 'sus2', 'sus4/b7': 'sus4',
                              'min/b3': 'm', 'min/b5': 'm', 'min/b7': 'm7',
                              'maj/b3': '', 'maj/b5': '', 'maj/b7': '7',
                              'min/2': 'm', 'maj/2': '', 'sus4(b7)': 'sus4',
                              'min/5': 'm', 'min/b3': 'm', 'maj/b3': '', 'maj/b5': ''}
            fused_suffix = hmm_suffix_map.get(best_quality, '')
        else:
            fused_suffix = hmm_suffix
        
        fused_chord = ap.chord_name(hmm_root, fused_suffix) if hmm_root is not None else hmm_seg['chord']
        
        fused_seg = dict(hmm_seg)
        fused_seg['chord'] = fused_chord
        fused_seg['ismir_quality_votes'] = dict(quality_votes)
        aligned.append(fused_seg)
    
    return aligned

def score_case(gt, pred_segments):
    import mir_eval
    import numpy as np

    ref_int = np.array([[s['start'], s['end']] for s in gt['segments']])
    ref_lab = [s['chord'] for s in gt['segments']]

    if not pred_segments:
        return None
    est_int = np.array([[float(c['startTime']), float(c['endTime'])] for c in pred_segments])
    est_lab = [engine_label_to_mireval(c.get('chord')) for c in pred_segments]

    est_int, est_lab = mir_eval.util.adjust_intervals(
        est_int, est_lab, ref_int.min(), ref_int.max(), mir_eval.chord.NO_CHORD,
        mir_eval.chord.NO_CHORD)
    intervals, ref_l, est_l = mir_eval.util.merge_labeled_intervals(
        ref_int, ref_lab, est_int, est_lab)
    durations = mir_eval.util.intervals_to_durations(intervals)

    out = {}
    for name, fn in (('majmin', mir_eval.chord.majmin),
                     ('sevenths', mir_eval.chord.sevenths)):
        comparisons = fn(ref_l, est_l)
        out[name] = float(mir_eval.chord.weighted_accuracy(comparisons, durations))

    # Boundary offsets
    gt_b = sorted({round(s['start'], 4) for s in gt['segments'][1:]})
    pred_b = sorted({round(float(s['startTime']), 4) for s in pred_segments[1:]})
    if gt_b and pred_b:
        offsets = [min(pred_b, key=lambda p: abs(p - g)) - g for g in gt_b]
        out['offsets_ms'] = [o * 1000.0 for o in offsets]
    else:
        out['offsets_ms'] = []
    
    out['segments_gt'] = len(gt['segments'])
    out['segments_pred'] = len(pred_segments)
    out['tempo_pred'] = None
    out['tempo_gt'] = gt.get('tempo')
    out['key_pred'] = None
    out['key_gt'] = gt.get('key')
    return out

def run_hybrid_on_corpus(corpus_dir, index_path, label, chord_dict='submission'):
    """Run hybrid HMM+ISMIR on a corpus."""
    with open(index_path, encoding='utf-8') as f:
        index = json.load(f)
    
    report = {'label': label, 'battery': os.path.basename(corpus_dir), 
              'engine': 'HYBRID_HMM_ISMIR2019', 'chord_dict': chord_dict,
              'date': datetime.now().isoformat(timespec='seconds'), 'cases': {}}
    all_offsets = []
    
    print(f"{'cas':<28}{'majmin':>9}{'sevenths':>10}{'offset':>10}{'segs':>10}")
    
    for case in index['cases']:
        case_id = case['caseId']
        with open(os.path.join(corpus_dir, f"{case_id}.json"), encoding='utf-8') as f:
            gt = json.load(f)
        wav = os.path.join(PROJECT, case['wav'])
        
        # 1. Run HMM (baseline) to get structure
        hmm_result = ap.analyze_chords(wav, 'legacy')
        hmm_segments = hmm_result['chords']
        beat_times = hmm_result.get('beat_times', [])
        
        # 2. Run ISMIR2019
        lab_path = os.path.join('/tmp', f'{case_id}.lab')
        try:
            run_ismir2019(wav, lab_path, chord_dict)
            ismir_segments = parse_lab_file(lab_path)
        except Exception as e:
            print(f"{case_id:<28}  ISMIR ERROR: {e}")
            # Fallback to HMM only
            ismir_segments = []
        
        # 3. Align and fuse
        if ismir_segments and beat_times:
            fused_segments = align_ismir_to_hmm_grid(ismir_segments, hmm_segments, beat_times)
        else:
            fused_segments = hmm_segments
        
        # 4. Score
        scored = score_case(gt, fused_segments)
        if scored is None:
            print(f"{case_id:<28}  aucun accord détecté")
            continue
        
        report['cases'][case_id] = scored
        all_offsets.extend(scored['offsets_ms'])
        med = statistics.median(scored['offsets_ms']) if scored['offsets_ms'] else 0.0
        print(f"{case_id:<28}{scored['majmin']:>8.1%}{scored['sevenths']:>10.1%}"
              f"{med:>9.0f}ms{str(scored['segments_pred']) + '/' + str(scored['segments_gt']):>10}")
    
    cases = list(report['cases'].values())
    if not cases:
        sys.exit('aucun cas mesuré')
    
    total = len(cases)
    globals_ = {
        'cases': total,
        'csr_majmin': sum(c['majmin'] for c in cases) / total,
        'csr_sevenths': sum(c['sevenths'] for c in cases) / total,
        'offset_median_ms': statistics.median(all_offsets) if all_offsets else None,
        'offset_stdev_ms': statistics.pstdev(all_offsets) if len(all_offsets) > 1 else None,
    }
    report['global'] = globals_
    
    print()
    print(f"{'Batterie':<11}{'Cas':>5}{'CSR(majmin)':>14}{'CSR(sevenths)':>16}"
          f"{'Offset médian':>16}{'Écart-type':>13}")
    print(f"{os.path.basename(corpus_dir):<11}{globals_['cases']:>5}{globals_['csr_majmin']:>13.2%}"
          f"{globals_['csr_sevenths']:>16.2%}"
          f"{globals_['offset_median_ms']:>13.0f} ms{globals_['offset_stdev_ms']:>10.0f} ms")
    
    out_dir = os.path.join(BENCH_OUT, os.path.basename(corpus_dir))
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, f'{label}.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f'rapport : {out}')
    
    return report

def main():
    parser = argparse.ArgumentParser(description='Hybrid HMM + ISMIR2019 PoC')
    parser.add_argument('--corpus', choices=['b1', 'b2'], default='b2',
                        help='Corpus to test on')
    parser.add_argument('--label', default='hybrid-poc')
    parser.add_argument('--chord-dict', default='submission',
                        choices=['submission', 'full', 'ismir2017', 'extended'])
    args = parser.parse_args()
    
    if args.corpus == 'b1':
        corpus_dir = CORPUS_B1
        index_path = os.path.join(CORPUS_B1, 'index.json')
    else:
        corpus_dir = CORPUS_B2
        index_path = os.path.join(CORPUS_B2, 'index.json')
    
    if not os.path.exists(index_path):
        sys.exit(f'Corpus {args.corpus} absent')
    
    run_hybrid_on_corpus(corpus_dir, index_path, args.label, args.chord_dict)

if __name__ == '__main__':
    main()