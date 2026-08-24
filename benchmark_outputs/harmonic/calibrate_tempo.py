"""Calibration du prior de tempo sur les tempos validés par l'utilisateur.

Cherche le centre perceptif qui reproduit le mieux les tempos réels du
répertoire (adoration / gospel), au lieu d'une constante de la littérature
pop/rock.
"""
import importlib.util, json, math, glob, os
import numpy as np, librosa

spec = importlib.util.spec_from_file_location('bh', 'scripts/benchmark_harmonic.py')
bh = importlib.util.module_from_spec(spec); spec.loader.exec_module(bh)
ap = bh.ap()

# Pré-calcul : tempo brut + enveloppe d'onset par morceau (coûteux, une seule fois).
cache = {}
for t in bh.load_corpus()['tracks']:
    gt_path = f"tests/corpus/gt/{t['id']}.json"
    if not os.path.exists(gt_path):
        continue
    gt = json.load(open(gt_path, encoding='utf-8'))
    if not gt.get('tempo'):
        continue
    wav = bh.to_wav(t['media'])
    y, sr = librosa.load(wav, sr=22050, mono=True)
    raw, beats = ap._beat_track(y, sr)
    bt = librosa.frames_to_time(np.atleast_1d(beats), sr=sr, hop_length=512)
    ibi = float(np.median(np.diff(bt))) if len(bt) > 2 else 0
    detected = 60.0 / ibi if ibi > 0 else raw
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    cache[t['id']] = {
        'detected': float(detected),
        'onset': onset,
        'sr': sr,
        'duration': float(len(y) / sr),
        'truth': float(gt['tempo']),
        'confidence': gt.get('tempoConfidence'),
    }
    print(f"{t['id']:<24} détecté={detected:6.1f}  attendu={gt['tempo']:6.1f} ({gt.get('tempoConfidence')})")

def resolve(entry, center, sigma):
    """Réplique la logique de _resolve_tempo avec un prior paramétrable."""
    onset_env, sr, duration = entry['onset'], entry['sr'], entry['duration']
    overall = float(np.mean(onset_env)) or 1.0
    best, best_score = entry['detected'], -1.0
    for cand in (entry['detected'] / 2.0, entry['detected'], entry['detected'] * 2.0):
        interval = 60.0 / cand
        if duration < 2 * interval:
            continue
        grid = np.arange(0.0, duration, interval)
        periodicity = ap._grid_onset_strength(onset_env, sr, 512, grid) / overall
        prior = math.exp(-0.5 * (math.log2(cand / center) / sigma) ** 2)
        score = periodicity * prior
        if score > best_score:
            best_score, best = score, cand
    return round(best, 1)

print("\ncentre  sigma  corrects  détail")
print("-" * 72)
best_cfg = None
for center in (40, 45, 50, 55, 58, 60, 62, 65, 68, 70, 72, 75):
    for sigma in (0.7,):
        ok, detail = 0, []
        for tid, e in cache.items():
            got = resolve(e, center, sigma)
            hit = abs(got - e['truth']) / e['truth'] < 0.06
            ok += hit
            detail.append(f"{tid.split('-')[0][:6]}:{got:.0f}{'✓' if hit else '✗'}")
        print(f"{center:>5}  {sigma:>5}  {ok}/{len(cache)}     {' '.join(detail)}")
        if best_cfg is None or ok > best_cfg[0]:
            best_cfg = (ok, center, sigma)
print(f"\nMeilleure configuration : centre={best_cfg[1]} sigma={best_cfg[2]} ({best_cfg[0]}/{len(cache)})")
