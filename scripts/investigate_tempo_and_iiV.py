#!/usr/bin/env python3
"""
Investigation script for:
1. Tempo octave ambiguity (why 140→70, 60→120 on syncopated)
2. ii-V-I progression stuck at ~33% sevenths score
"""
import sys, os, json, math
import numpy as np
import librosa

PROJECT = os.path.dirname(os.path.abspath(__file__))
AP_PATH = os.path.join(PROJECT, '..', 'electron', 'audio-processor.py')

import importlib.util
spec = importlib.util.spec_from_file_location('audio_processor', AP_PATH)
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

# ============================================================
# TASK 1: Trace tempo detection on problematic cases
# ============================================================

def trace_tempo(wav_path, label):
    print(f"\n{'='*60}")
    print(f"TEMPO TRACE: {label}")
    print(f"{'='*60}")
    
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    print(f"Duration: {len(y)/sr:.2f}s, SR: {sr}")
    
    # Raw beat tracking
    tempo_raw, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=512)
    if isinstance(tempo_raw, (np.ndarray, list)):
        tempo_raw = float(np.squeeze(tempo_raw).item())
    else:
        tempo_raw = float(tempo_raw)
    print(f"Raw librosa tempo: {tempo_raw:.1f} BPM")
    print(f"Beats found: {len(beats)}")
    
    # Onset strength
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    print(f"Onset env shape: {onset_env.shape}, mean: {np.mean(onset_env):.4f}")
    
    # Test candidates
    TEMPO_OCTAVE_RATIOS = (0.25, 0.5, 1.0, 2.0, 4.0)
    TEMPO_PERCEPTUAL_CENTER = 110.0
    TEMPO_PRIOR_SIGMA = 0.7
    
    duration = float(len(y) / sr)
    candidates = [tempo_raw * ratio for ratio in TEMPO_OCTAVE_RATIOS]
    
    print(f"\nCandidate evaluation:")
    for cand in candidates:
        if cand <= 0:
            continue
        interval = 60.0 / cand
        if duration < 2 * interval:
            print(f"  {cand:6.1f} BPM: SKIP (duration too short)")
            continue
        grid = np.arange(0.0, duration, interval)
        frames = librosa.time_to_frames(grid, sr=sr, hop_length=512)
        frames = frames[(frames >= 0) & (frames < len(onset_env))]
        if len(frames) == 0:
            print(f"  {cand:6.1f} BPM: SKIP (no valid frames)")
            continue
        strength = float(np.mean(onset_env[frames]))
        overall = float(np.mean(onset_env)) or 1.0
        periodicity = strength / overall
        
        prior = math.exp(-0.5 * (math.log2(cand / TEMPO_PERCEPTUAL_CENTER) / TEMPO_PRIOR_SIGMA) ** 2)
        score = periodicity * prior
        print(f"  {cand:6.1f} BPM: periodicity={periodicity:.4f}, prior={prior:.4f}, score={score:.4f}")
    
    # Final resolved tempo
    resolved = ap.detect_tempo(wav_path)
    print(f"\nResolved tempo: {resolved} BPM")

# ============================================================
# TASK 2: Trace ii-V-I chord detection step by step
# ============================================================

def trace_iiV_I(wav_path, label):
    print(f"\n{'='*60}")
    print(f"ii-V-I TRACE: {label}")
    print(f"{'='*60}")
    
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    
    # Get the chroma at specific time points
    # ii-V-I in F major: Gmin7 (G-Bb-D-F), C7 (C-E-G-Bb), Fmaj7 (F-A-C-E)
    # Expected pitch classes: 
    #   Gmin7: G(7), Bb(10), D(2), F(5) -> PC: 7,10,2,5
    #   C7: C(0), E(4), G(7), Bb(10) -> PC: 0,4,7,10
    #   Fmaj7: F(5), A(9), C(0), E(4) -> PC: 5,9,0,4
    
    # Compute chroma_cqt
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
    n_frames = chroma.shape[1]
    frame_time = 512 / sr  # ~23ms
    
    # Ground truth timing: 3 chords, 3 repeats, 1 bar each, 4 beats per bar
    # At 60 BPM: 1 beat = 1s, 1 bar = 4s
    # Gmin7: 0-4s, C7: 4-8s, Fmaj7: 8-12s (repeated 3x = 36s total)
    
    beat = 60.0 / 60  # 1s per beat at 60 BPM
    bar = beat * 4    # 4s per bar
    
    # Map time to frame
    def time_to_frame(t):
        return int(t / frame_time)
    
    print(f"\nChroma analysis at key timepoints (60 BPM case):")
    # Check each chord region
    regions = [
        (0, bar, "Gmin7 (ii)"),
        (bar, 2*bar, "C7 (V)"),
        (2*bar, 3*bar, "Fmaj7 (I)"),
    ]
    
    for start_t, end_t, label_r in regions:
        start_f = time_to_frame(start_t)
        end_f = time_to_frame(end_t)
        if end_f > n_frames:
            end_f = n_frames
        if start_f >= end_f:
            continue
        region_chroma = np.mean(chroma[:, start_f:end_f], axis=1)
        # Normalize
        norm = np.linalg.norm(region_chroma)
        if norm > 0:
            region_chroma = region_chroma / norm
        
        # Top pitch classes
        top_pcs = np.argsort(region_chroma)[::-1][:6]
        print(f"  {label_r}: top PCs = {top_pcs}, values = {region_chroma[top_pcs]}")
    
    # Now run the actual chord detection and trace the HMM
    result = ap.analyze_chords(wav_path, 'legacy')
    print(f"\nDetected chords:")
    for c in result['chords']:
        print(f"  {c['startTime']:.2f}-{c['endTime']:.2f}: {c['chord']} (conf={c['confidence']:.2f})")

# ============================================================
# MAIN
# ============================================================

# Problematic tempo cases
print("="*70)
print("TASK 1: TEMPO OCTAVE AMBIGUITY INVESTIGATION")
print("="*70)

trace_tempo("tests/corpus/b4/b4_stable_140.wav", "Stable 140 BPM (detected as 70)")
trace_tempo("tests/corpus/b4/b4_syncop_60.wav", "Syncopated 60 BPM (detected as 117)")
trace_tempo("tests/corpus/b4/b4_rubato_140.wav", "Rubato 140 BPM (detected as 69)")

# Control cases (working)
trace_tempo("tests/corpus/b4/b4_stable_90.wav", "Stable 90 BPM (works)")
trace_tempo("tests/corpus/b4/b4_syncop_120.wav", "Syncopated 120 BPM (works)")

# ii-V-I investigation
print("\n" + "="*70)
print("TASK 2: ii-V-I PROGRESSION SEVENTHS ISSUE")
print("="*70)

trace_iiV_I("tests/corpus/b1/b1_3iivi_60.wav", "ii-V-I at 60 BPM")
trace_iiV_I("tests/corpus/b1/b1_3iivi_120.wav", "ii-V-I at 120 BPM")

# Also check the template matching for Gmin7 vs Gm
print("\n" + "="*60)
print("TEMPLATE ANALYSIS: Gmin7 vs Gm")
print("="*60)

# Get the chord templates
for suffix in ['m', 'm7']:
    tpl = ap.CHORD_TEMPLATES_WEIGHTED[suffix]
    print(f"\n{suffix} template: {tpl}")
    # Compute what the template expects for G (root=7)
    template = np.zeros(12, dtype=np.float32)
    for pc, weight in tpl:
        template[(7 + pc) % 12] = weight
    norm = float(np.linalg.norm(template))
    if norm > 0:
        template = template / norm
    print(f"  Normalized template for G{suffix}: {template}")

