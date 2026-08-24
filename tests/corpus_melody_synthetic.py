#!/usr/bin/env python3
"""Corpus synthétique pour valider la précision brute de melody_extractor.

Génère une série de mélodies monophoniques depuis des séquences MIDI connues,
les rend en audio (synthèse additive avec vibrato), et mesure la précision
du module de suivi de pitch (étages 2+3) contre la vérité terrain exacte —
sans passer par Demucs, pour isoler la précision brute de l'extraction.

Usage:
    python tests/corpus_melody_synthetic.py [--n N] [--out results.json]
"""

import argparse
import json
import math
import os
import sys
import tempfile
import random

import numpy as np
import soundfile as sf

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'electron'))
sys.path.insert(0, os.path.join(PROJECT_ROOT, 'tests'))

from melody_extractor import extract_melody
from test_melody_extractor import synth_melody, write_wav, match_notes, SR


# ---------------------------------------------------------------------------
# Générateurs de mélodies (corpus diversifié)
# ---------------------------------------------------------------------------

def gen_scale(notes, dur=0.4):
    """Gamme (liste de MIDI) avec durée uniforme."""
    return [(m, dur) for m in notes]


def gen_arpeggio(root, quality='maj7', dur=0.4, octave=4):
    """Arpège ascendant/descendant."""
    base = root + 12 * octave
    if quality == 'maj7':
        notes = [base, base + 4, base + 7, base + 11, base + 7, base + 4]
    elif quality == 'm7':
        notes = [base, base + 3, base + 7, base + 10, base + 7, base + 3]
    elif quality == '7':
        notes = [base, base + 4, base + 7, base + 10, base + 7, base + 4]
    else:
        notes = [base, base + 4, base + 7, base + 4]
    return [(m, dur) for m in notes]


def gen_r1_melody():
    """Mélodie R1 (I Surrender All) : Mi Fa Mi Ré Mi Do."""
    return [(64, 0.4), (65, 0.4), (64, 0.4), (62, 0.4), (64, 0.4), (60, 0.4)]


def gen_random_melody(n_notes=8, root=60, spread=7, dur_range=(0.3, 0.6), seed=None):
    """Mélodie aléatoire avec mouvements conjoints majoritaires."""
    rng = random.Random(seed)
    notes = []
    current = root
    for _ in range(n_notes):
        # 70% de mouvements conjoints (±1, ±2), 30% de sauts (jusqu'à spread)
        if rng.random() < 0.7:
            delta = rng.choice([-2, -1, -1, 0, 1, 1, 2])
        else:
            delta = rng.randint(-spread, spread)
        current = max(48, min(84, current + delta))
        dur = round(rng.uniform(*dur_range), 2)
        notes.append((current, dur))
    return notes


def gen_long_tones(notes_dur_pairs):
    """Notes longues (1-2s) pour tester la tenue."""
    return notes_dur_pairs


# ---------------------------------------------------------------------------
# Construction du corpus
# ---------------------------------------------------------------------------

def build_corpus(n_random=20):
    """Construit le corpus de test. Retourne une liste de (id, melody, description)."""
    corpus = []

    # Catégorie 1 : gammes (5 cas)
    corpus.append(('scale-C-major', gen_scale([60, 62, 64, 65, 67, 69, 71]), 'Do majeur ascendante'))
    corpus.append(('scale-A-minor', gen_scale([69, 71, 72, 74, 76, 77, 79]), 'La mineur ascendante'))
    corpus.append(('scale-C-desc', gen_scale([72, 71, 69, 67, 65, 64, 62, 60]), 'Do majeur descendante'))
    corpus.append(('scale-chromatic', gen_scale([60, 61, 62, 63, 64, 65, 66, 67], 0.3), 'chromatique'))
    corpus.append(('scale-pentatonic', gen_scale([60, 62, 64, 67, 69, 72], 0.4), 'pentatonique majeure'))

    # Catégorie 2 : arpèges (4 cas)
    corpus.append(('arp-Cmaj7', gen_arpeggio(0, 'maj7'), 'arpège Do maj7'))
    corpus.append(('arp-Dm7', gen_arpeggio(2, 'm7'), 'arpège Ré m7'))
    corpus.append(('arp-G7', gen_arpeggio(7, '7'), 'arpège Sol 7'))
    corpus.append(('arp-Am7b5', gen_arpeggio(9, 'm7'), 'arpège La m7'))

    # Catégorie 3 : cas spécifiques (3 cas)
    corpus.append(('r1-melody', gen_r1_melody(), 'R1 I Surrender All'))
    corpus.append(('octave-jump', [(60, 0.5), (72, 0.5), (67, 0.5), (79, 0.5)], 'sauts d\'octave'))
    corpus.append(('long-tones', [(60, 1.5), (64, 1.5), (67, 2.0), (72, 1.5)], 'notes tenues 1.5-2s'))

    # Catégorie 4 : mélodies aléatoires (n_random cas, déterministes)
    for i in range(n_random):
        seed = 1000 + i
        corpus.append((f'random-{i}', gen_random_melody(n_notes=8, seed=seed), f'aléatoire seed={seed}'))

    return corpus


# ---------------------------------------------------------------------------
# Mesure
# ---------------------------------------------------------------------------

def measure_corpus(corpus, tolerance_s=0.08):
    """Mesure la précision du module sur le corpus. Retourne un dict de résultats."""
    tmpdir = tempfile.mkdtemp(prefix='melody_corpus_')
    results = []
    total_tp = total_fp = total_fn = 0

    for case_id, melody, desc in corpus:
        signal, gt = synth_melody(melody)
        path = os.path.join(tmpdir, f'{case_id}.wav')
        write_wav(path, signal)
        result = extract_melody(path)
        tp, fp, fn, _ = match_notes(gt, result['notes'], tolerance_s=tolerance_s)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        total_tp += tp
        total_fp += fp
        total_fn += fn

        results.append({
            'id': case_id,
            'description': desc,
            'n_gt': len(gt),
            'n_extracted': result['n_notes'],
            'tp': tp, 'fp': fp, 'fn': fn,
            'precision': round(precision, 3),
            'recall': round(recall, 3),
            'f1': round(f1, 3),
        })

    # Agrégat micro (tous les cas confondus)
    micro_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    micro_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    micro_f1 = 2 * micro_precision * micro_recall / (micro_precision + micro_recall) if (micro_precision + micro_recall) > 0 else 0

    return {
        'cases': results,
        'n_cases': len(results),
        'aggregate': {
            'tp': total_tp, 'fp': total_fp, 'fn': total_fn,
            'precision': round(micro_precision, 3),
            'recall': round(micro_recall, 3),
            'f1': round(micro_f1, 3),
        },
    }


def main():
    parser = argparse.ArgumentParser(description='Corpus synthétique melody_extractor')
    parser.add_argument('--n', type=int, default=20, help='Nombre de mélodies aléatoires')
    parser.add_argument('--out', default=None, help='Fichier JSON de sortie')
    parser.add_argument('--tolerance', type=float, default=0.08, help='Tolérance temporelle (s)')
    args = parser.parse_args()

    corpus = build_corpus(n_random=args.n)
    results = measure_corpus(corpus, tolerance_s=args.tolerance)

    print(f'=== Corpus synthétique melody_extractor ({results["n_cases"]} cas) ===')
    print(f'Aggregate micro: precision={results["aggregate"]["precision"]} '
          f'recall={results["aggregate"]["recall"]} '
          f'f1={results["aggregate"]["f1"]} '
          f'(tp={results["aggregate"]["tp"]}, fp={results["aggregate"]["fp"]}, '
          f'fn={results["aggregate"]["fn"]})')
    print()
    print(f'{"id":<20} {"n_gt":>4} {"n_ex":>4} {"tp":>3} {"fp":>3} {"fn":>3} {"prec":>5} {"rec":>5} {"f1":>5}')
    for r in results['cases']:
        print(f'{r["id"]:<20} {r["n_gt"]:>4} {r["n_extracted"]:>4} '
              f'{r["tp"]:>3} {r["fp"]:>3} {r["fn"]:>3} '
              f'{r["precision"]:>5} {r["recall"]:>5} {r["f1"]:>5}')

    if args.out:
        with open(args.out, 'w') as f:
            json.dump(results, f, indent=2)
        print(f'\nRésultats écrits → {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()