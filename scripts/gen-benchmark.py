#!/usr/bin/env python3
"""Generate synthetic chroma benchmark: dev + val (clean + noisy).
Read-only: no production files modified.
"""
import json, os
import numpy as np

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'tests', 'audio', 'diagnostic')
os.makedirs(OUT_DIR, exist_ok=True)

NP_RNG = np.random.RandomState(42)

# Voicing definitions
# Each entry: (intervals, root_weight_override, comment)
# root_weight_override allows simulating inversions (lower root energy)

QUALITY_INTERVALS = {
    '':    [0, 4, 7],
    'm':   [0, 3, 7],
    '7':   [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    'm7':  [0, 3, 7, 10],
    'dim': [0, 3, 6],
    'm7b5': [0, 3, 6, 10],
    'aug': [0, 4, 8],
}

def make_chroma(intervals, root, weights=None, normalize=True, spread=0.15, floor=0.03):
    v = np.ones(12, dtype=np.float32) * floor  # uniform noise floor
    for i, pc in enumerate(intervals):
        idx = (root + pc) % 12
        w = weights[i] if weights else 1.0
        v[idx] = max(v[idx], w)
        # Spectral spread to adjacent bins
        v[(idx + 1) % 12] = max(v[(idx + 1) % 12], w * spread)
        v[(idx - 1) % 12] = max(v[(idx - 1) % 12], w * spread)
        # Second-order spread (further neighbors, smaller)
        v[(idx + 2) % 12] = max(v[(idx + 2) % 12], w * spread * 0.5)
        v[(idx - 2) % 12] = max(v[(idx - 2) % 12], w * spread * 0.5)
    if normalize:
        n = float(np.linalg.norm(v))
        if n > 1e-8:
            v /= n
    return [round(float(x), 6) for x in v]

def make_delayed_chroma(intervals, root, delay_idx):
    v = np.ones(12, dtype=np.float32) * 0.03
    for i, pc in enumerate(intervals):
        idx = (root + pc) % 12
        w = 0.5 if i == delay_idx else 1.0
        v[idx] = max(v[idx], w)
        v[(idx + 1) % 12] = max(v[(idx + 1) % 12], w * 0.15)
        v[(idx - 1) % 12] = max(v[(idx - 1) % 12], w * 0.15)
    n = float(np.linalg.norm(v))
    if n > 1e-8:
        v /= n
    return [round(float(x), 6) for x in v]

def add_noise(chroma_list, sigma=0.02, seed=42):
    rng = np.random.RandomState(seed)
    noisy = []
    for vec in chroma_list:
        v = np.array(vec, dtype=np.float32)
        v += rng.normal(0, sigma, 12).astype(np.float32)
        v = np.maximum(v, 0.0)
        n = float(np.linalg.norm(v))
        if n > 1e-8:
            v /= n
        noisy.append([round(float(x), 6) for x in v])
    return noisy

def entry(ident, root, quality, intervals, chroma, inversion=0, comment=''):
    return {
        'id': ident,
        'root': root,
        'quality': quality,
        'intervals': intervals,
        'chroma': chroma,
        'inversion': inversion,
        'comment': comment,
    }

def build_dev():
    cases = []
    # --- 2 tonalites: C, G ---
    cases.append(entry('C_major', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [1.0, 0.8, 0.6]), 0, 'C major root'))
    cases.append(entry('G_major', 7, '', [0,4,7],
        make_chroma([0,4,7], 7, [1.0, 0.8, 0.6]), 0, 'G major root'))

    # --- Inversions ---
    cases.append(entry('C_E_inv', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [0.5, 1.0, 0.6]), 1, 'C/E first inversion'))
    cases.append(entry('C_G_inv', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [0.3, 0.8, 1.0]), 2, 'C/G second inversion'))
    cases.append(entry('Am_C_inv', 9, 'm', [0,3,7],
        make_chroma([0,3,7], 9, [0.5, 1.0, 0.6]), 1, 'Am/C'))
    cases.append(entry('Dm_F_inv', 2, 'm', [0,3,7],
        make_chroma([0,3,7], 2, [0.5, 1.0, 0.6]), 1, 'Dm/F'))

    # --- Complete voicings ---
    cases.append(entry('Cmaj7_full', 0, 'maj7', [0,4,7,11],
        make_chroma([0,4,7,11], 0, [1.0, 0.85, 0.65, 0.9]), 0, 'Cmaj7 4 voices'))
    cases.append(entry('G7_full', 7, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 7, [1.0, 0.75, 0.55, 0.4]), 0, 'G7 4 voices'))
    cases.append(entry('Am7_full', 9, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 9, [1.0, 0.85, 0.65, 0.85]), 0, 'Am7 4 voices'))
    cases.append(entry('Dm7b5_full', 2, 'm7b5', [0,3,6,10],
        make_chroma([0,3,6,10], 2, [1.0, 0.85, 0.9, 0.85]), 0, 'Dm7b5 4 voices'))

    # --- Incomplete voicings ---
    cases.append(entry('Cmaj7_no5', 0, 'maj7', [0,4,11],
        make_chroma([0,4,11], 0, [1.0, 0.85, 0.9]), 0, 'Cmaj7 no 5th'))
    cases.append(entry('G7_no3', 7, '7', [0,7,10],
        make_chroma([0,7,10], 7, [1.0, 0.55, 0.4]), 0, 'G7 no 3rd'))

    # --- Delayed attack ---
    cases.append(entry('C_maj_delay_3rd', 0, '', [0,4,7],
        make_delayed_chroma([0,4,7], 0, 1), 0, 'C major 3rd arrives late'))
    cases.append(entry('Cmaj7_delay_7th', 0, 'maj7', [0,4,7,11],
        make_delayed_chroma([0,4,7,11], 0, 3), 0, 'Cmaj7 7th arrives late'))

    # --- Confusion major/7/maj7 (3 cases) ---
    cases.append(entry('conf_major_vs_7_a', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [1.0, 0.8, 0.6]), 0, 'C major — prone to C7 false positive'))
    cases.append(entry('conf_major_vs_maj7_a', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [1.0, 0.8, 0.6]), 0, 'C major — prone to Cmaj7 false positive'))
    cases.append(entry('conf_7_vs_major_a', 7, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 7, [1.0, 0.75, 0.55, 0.4]), 0, 'G7 — prone to G major false positive'))

    # --- Confusion minor/m7/m7b5 (3 cases) ---
    cases.append(entry('conf_minor_vs_m7_a', 9, 'm', [0,3,7],
        make_chroma([0,3,7], 9, [1.0, 0.85, 0.55]), 0, 'Am — prone to Am7 false positive'))
    cases.append(entry('conf_minor_vs_m7b5_a', 9, 'm', [0,3,7],
        make_chroma([0,3,7], 9, [1.0, 0.85, 0.55]), 0, 'Am — prone to Am7b5 false positive'))
    cases.append(entry('conf_m7_vs_minor_a', 9, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 9, [1.0, 0.85, 0.65, 0.85]), 0, 'Am7 — prone to Am false positive'))

    # --- Confusion major/minor/sus (3 cases) ---
    cases.append(entry('conf_major_vs_sus2_a', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [1.0, 0.8, 0.6]), 0, 'C major — prone to Csus2'))
    cases.append(entry('conf_major_vs_sus4_a', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [1.0, 0.8, 0.6]), 0, 'C major — prone to Csus4'))
    cases.append(entry('conf_minor_vs_sus4_a', 9, 'm', [0,3,7],
        make_chroma([0,3,7], 9, [1.0, 0.85, 0.55]), 0, 'Am — prone to Asus4'))

    # --- False positive extensions (3 cases) ---
    cases.append(entry('fp_G7_to_major', 7, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 7, [1.0, 0.75, 0.55, 0.4]), 0, 'G7 should NOT be major'))
    cases.append(entry('fp_Cmaj7_to_major', 0, 'maj7', [0,4,7,11],
        make_chroma([0,4,7,11], 0, [1.0, 0.85, 0.65, 0.9]), 0, 'Cmaj7 should NOT be major'))
    cases.append(entry('fp_Am7_to_minor', 9, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 9, [1.0, 0.85, 0.65, 0.85]), 0, 'Am7 should NOT be minor'))

    return cases

def build_val():
    cases = []
    # --- Different tonalities: D, F ---
    cases.append(entry('D_major', 2, '', [0,4,7],
        make_chroma([0,4,7], 2, [1.0, 0.8, 0.6]), 0, 'D major root'))
    cases.append(entry('F_major', 5, '', [0,4,7],
        make_chroma([0,4,7], 5, [1.0, 0.8, 0.6]), 0, 'F major root'))

    # --- Different inversions ---
    cases.append(entry('C_G_inv_alt', 0, '', [0,4,7],
        make_chroma([0,4,7], 0, [0.2, 0.6, 1.0]), 2, 'C/G alt voicing'))
    cases.append(entry('G_B_inv', 7, '', [0,4,7],
        make_chroma([0,4,7], 7, [0.5, 1.0, 0.6]), 1, 'G/B first inversion'))
    cases.append(entry('Em_G_inv', 4, 'm', [0,3,7],
        make_chroma([0,3,7], 4, [0.5, 1.0, 0.6]), 1, 'Em/G'))

    # --- Different extended voicings ---
    cases.append(entry('Fmaj7_full', 5, 'maj7', [0,4,7,11],
        make_chroma([0,4,7,11], 5, [1.0, 0.85, 0.65, 0.9]), 0, 'Fmaj7 4 voices'))
    cases.append(entry('D7_full', 2, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 2, [1.0, 0.75, 0.55, 0.4]), 0, 'D7 4 voices'))
    cases.append(entry('Em7_full', 4, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 4, [1.0, 0.85, 0.65, 0.85]), 0, 'Em7 4 voices'))
    cases.append(entry('G7b5_full', 7, 'm7b5', [0,3,6,10],
        make_chroma([0,3,6,10], 7, [1.0, 0.85, 0.9, 0.85]), 0, 'G7b5 4 voices'))

    # --- Different incomplete voicings ---
    cases.append(entry('Am7_no5', 9, 'm7', [0,3,10],
        make_chroma([0,3,10], 9, [1.0, 0.85, 0.85]), 0, 'Am7 no 5th'))
    cases.append(entry('Dm7b5_no3', 2, 'm7b5', [0,6,10],
        make_chroma([0,6,10], 2, [1.0, 0.9, 0.85]), 0, 'Dm7b5 no 3rd'))

    # --- Delayed attack ---
    cases.append(entry('F_maj_delay_5th', 5, '', [0,4,7],
        make_delayed_chroma([0,4,7], 5, 2), 0, 'F major 5th arrives late'))
    cases.append(entry('D7_delay_7th', 2, '7', [0,4,7,10],
        make_delayed_chroma([0,4,7,10], 2, 3), 0, 'D7 7th arrives late'))

    # --- Confusion major/7/maj7 val (3 cases) ---
    cases.append(entry('conf_major_vs_7_b', 5, '', [0,4,7],
        make_chroma([0,4,7], 5, [1.0, 0.8, 0.6]), 0, 'F major — prone to F7'))
    cases.append(entry('conf_major_vs_maj7_b', 5, '', [0,4,7],
        make_chroma([0,4,7], 5, [1.0, 0.8, 0.6]), 0, 'F major — prone to Fmaj7'))
    cases.append(entry('conf_7_vs_major_b', 2, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 2, [1.0, 0.75, 0.55, 0.4]), 0, 'D7 — prone to D major'))

    # --- Confusion minor/m7/m7b5 val (3 cases) ---
    cases.append(entry('conf_minor_vs_m7_b', 4, 'm', [0,3,7],
        make_chroma([0,3,7], 4, [1.0, 0.85, 0.55]), 0, 'Em — prone to Em7'))
    cases.append(entry('conf_minor_vs_m7b5_b', 4, 'm', [0,3,7],
        make_chroma([0,3,7], 4, [1.0, 0.85, 0.55]), 0, 'Em — prone to Em7b5'))
    cases.append(entry('conf_m7_vs_minor_b', 4, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 4, [1.0, 0.85, 0.65, 0.85]), 0, 'Em7 — prone to Em'))

    # --- Confusion major/minor/sus val (3 cases) ---
    cases.append(entry('conf_major_vs_sus2_b', 5, '', [0,4,7],
        make_chroma([0,4,7], 5, [1.0, 0.8, 0.6]), 0, 'F major — prone to Fsus2'))
    cases.append(entry('conf_major_vs_sus4_b', 5, '', [0,4,7],
        make_chroma([0,4,7], 5, [1.0, 0.8, 0.6]), 0, 'F major — prone to Fsus4'))
    cases.append(entry('conf_minor_vs_sus4_b', 4, 'm', [0,3,7],
        make_chroma([0,3,7], 4, [1.0, 0.85, 0.55]), 0, 'Em — prone to Esus4'))

    # --- False positive extensions val (3 cases) ---
    cases.append(entry('fp_D7_to_major', 2, '7', [0,4,7,10],
        make_chroma([0,4,7,10], 2, [1.0, 0.75, 0.55, 0.4]), 0, 'D7 should NOT be major'))
    cases.append(entry('fp_Fmaj7_to_major', 5, 'maj7', [0,4,7,11],
        make_chroma([0,4,7,11], 5, [1.0, 0.85, 0.65, 0.9]), 0, 'Fmaj7 should NOT be major'))
    cases.append(entry('fp_Em7_to_minor', 4, 'm7', [0,3,7,10],
        make_chroma([0,3,7,10], 4, [1.0, 0.85, 0.65, 0.85]), 0, 'Em7 should NOT be minor'))

    return cases

def main():
    dev = build_dev()
    val_clean = build_val()
    val_noisy = add_noise([c['chroma'] for c in val_clean], sigma=0.02, seed=99)
    val_noisy_cases = []
    for i, c in enumerate(val_clean):
        nc = dict(c)
        nc['chroma'] = val_noisy[i]
        nc['id'] = c['id'] + '_noisy'
        nc['comment'] = c['comment'] + ' + noise σ=0.02'
        val_noisy_cases.append(nc)

    data = {
        'dev': dev,
        'val': {
            'clean': val_clean,
            'noisy': val_noisy_cases,
        },
        'metadata': {
            'noise_seed': 42,
            'noise_sigma': 0.02,
            'description': 'Synthetic chroma benchmark for template experiments',
        },
    }

    path = os.path.join(OUT_DIR, 'benchmark_synthetic.json')
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'Generated synthetic benchmark: {path}')
    print(f'  dev: {len(dev)} cases')
    print(f'  val clean: {len(val_clean)} cases')
    print(f'  val noisy: {len(val_noisy_cases)} cases')

if __name__ == '__main__':
    main()
