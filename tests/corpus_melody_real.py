#!/usr/bin/env python3
"""Validation sur fichier réel du corpus (Track_003, "Nous élevons Ton nom").

Mesure l'écart entre l'extraction pyin (notre module) et une estimation
indépendante par autocorrélation sur onsets, sur un extrait de 60s du stem
vocals. Aucune vérité terrain mélodique chiffrée n'existe pour ce fichier ;
on établit donc un contrôle indépendant par une méthode différente.

Usage:
    python tests/corpus_melody_real.py
"""

import os
import sys
import json
import tempfile

import numpy as np
import librosa
import soundfile as sf

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))

from melody_extractor import extract_melody

STEM_PATH = '/home/visiteur/PianoJazzChords/Studio/Track_003/stems/vocals.wav'
EXCERPT_S = 60


def estimate_pitch_autocorr(y, sr, fmin=65, fmax=500):
    """Estimation de pitch par autocorrélation sur une frame."""
    if len(y) < 256:
        return 0.0
    ac = np.correlate(y, y, mode='full')
    ac = ac[len(ac) // 2:]
    min_lag = max(2, int(sr / fmax))
    max_lag = min(len(ac) - 1, int(sr / fmin))
    if max_lag <= min_lag:
        return 0.0
    peak_idx = np.argmax(ac[min_lag:max_lag]) + min_lag
    if ac[peak_idx] > 0.1 * ac[0]:
        return sr / peak_idx
    return 0.0


def build_reference_onsets(y, sr, max_notes=60):
    """Construit une vérité terrain approximative par onset + autocorrélation.

    Méthode indépendante de pyin : détecte les onsets, estime le pitch de
    chaque onset par autocorrélation, filtre les onsets trop rapprochés.
    Retourne une liste de {midi, start, end}.
    """
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=512, units='time')
    # Filtre les onsets trop rapprochés (< 200ms)
    filtered = []
    last_t = -1.0
    for t in onsets:
        if t - last_t >= 0.2:
            filtered.append(t)
            last_t = t
    # Estime le pitch de chaque onset
    refs = []
    for i, t in enumerate(filtered[:max_notes]):
        idx = int(t * sr)
        frame_len = int(0.1 * sr)
        frame = y[idx:idx + frame_len]
        f0 = estimate_pitch_autocorr(frame, sr)
        if f0 > 0:
            midi = round(69 + 12 * np.log2(f0 / 440.0))
            end = filtered[i + 1] if i + 1 < len(filtered) else t + 0.3
            refs.append({'midi': midi, 'start': round(t, 3), 'end': round(min(end, t + 0.5), 3)})
    return refs


def match_notes(gt_notes, extracted, tolerance_s=0.3, pitch_tolerance=2):
    """Compare deux listes de notes. Retourne (tp, fp, fn)."""
    used = set()
    tp = 0
    for g in gt_notes:
        best = None
        best_score = 0
        for i, e in enumerate(extracted):
            if i in used:
                continue
            if abs(e['midi'] - g['midi']) > pitch_tolerance:
                continue
            # Chevauchement ou proximité temporelle
            gt_center = (g['start'] + g['end']) / 2
            et_center = (e['start'] + e['end']) / 2
            if abs(gt_center - et_center) > tolerance_s:
                continue
            overlap = min(g['end'], e['end']) - max(g['start'], e['start'])
            score = max(0, overlap) - abs(gt_center - et_center) * 0.1
            if score > best_score:
                best_score = score
                best = i
        if best is not None:
            used.add(best)
            tp += 1
    fp = len(extracted) - tp
    fn = len(gt_notes) - tp
    return tp, fp, fn


def main():
    if not os.path.exists(STEM_PATH):
        print(f'Stem introuvable: {STEM_PATH}', file=sys.stderr)
        sys.exit(1)

    tmp = tempfile.mktemp(suffix='.wav')
    y, sr = librosa.load(STEM_PATH, sr=22050, mono=True, duration=EXCERPT_S)
    sf.write(tmp, y, sr)
    print(f'Extrait {EXCERPT_S}s de {STEM_PATH}', file=sys.stderr)

    # 1. Référence indépendante (onset + autocorrélation)
    refs = build_reference_onsets(y, sr, max_notes=60)
    print(f'Référence (onset+autocorr): {len(refs)} notes', file=sys.stderr)

    # 2. Extraction par notre module (pyin)
    import time
    t0 = time.time()
    result = extract_melody(tmp)
    print(f'pyin: {result["n_notes"]} notes en {time.time()-t0:.1f}s', file=sys.stderr)

    # 3. Comparaison
    tp, fp, fn = match_notes(refs, result['notes'], tolerance_s=0.3, pitch_tolerance=2)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    print()
    print(f'=== Validation sur fichier réel (Track_003, 60s vocals) ===')
    print(f'Référence (onset+autocorr): {len(refs)} notes')
    print(f'pyin: {result["n_notes"]} notes')
    print(f'Match (tol=300ms, pitch±2): tp={tp}, fp={fp}, fn={fn}')
    print(f'precision={precision:.3f} recall={recall:.3f} f1={f1:.3f}')
    print()
    print('NOTE : la référence n\'est pas une vérité terrain exacte mais une')
    print('estimation indépendante par méthode différente. L\'accord entre les')
    print('deux méthodes est un signal de cohérence, pas une preuve de justesse.')

    # Détail : range et distribution
    midis_pyin = [n['midi'] for n in result['notes']]
    midis_ref = [n['midi'] for n in refs]
    if midis_pyin:
        print(f'pyin: midi {min(midis_pyin)}-{max(midis_pyin)}, median={sorted(midis_pyin)[len(midis_pyin)//2]}')
    if midis_ref:
        print(f'ref : midi {min(midis_ref)}-{max(midis_ref)}, median={sorted(midis_ref)[len(midis_ref)//2]}')

    # Sortie JSON
    out = {
        'file': STEM_PATH,
        'excerpt_s': EXCERPT_S,
        'reference': {'method': 'onset+autocorrelation', 'n_notes': len(refs), 'notes': refs[:20]},
        'pyin': {'n_notes': result['n_notes'], 'notes': result['notes'][:20]},
        'match': {'tp': tp, 'fp': fp, 'fn': fn, 'precision': round(precision, 3), 'recall': round(recall, 3), 'f1': round(f1, 3)},
    }
    out_path = '/tmp/opencode/melody_real_result.json'
    with open(out_path, 'w') as f:
        json.dump(out, f, indent=2)
    print(f'\nDétails → {out_path}', file=sys.stderr)


if __name__ == '__main__':
    main()