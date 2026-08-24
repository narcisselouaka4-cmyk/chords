"""Diagnostic tempo : tempo brut librosa vs tempo résolu, et densité de la grille."""
import importlib.util, numpy as np, librosa
spec = importlib.util.spec_from_file_location('bh', 'scripts/benchmark_harmonic.py')
bh = importlib.util.module_from_spec(spec); spec.loader.exec_module(bh)
ap = bh.ap()

for t in bh.load_corpus()['tracks']:
    wav = bh.to_wav(t['media'])
    y, sr = librosa.load(wav, sr=22050, mono=True)
    raw, beats = ap._beat_track(y, sr)
    bt = librosa.frames_to_time(np.atleast_1d(beats), sr=sr, hop_length=512)
    ibi = float(np.median(np.diff(bt))) if len(bt) > 2 else 0
    med_tempo = 60.0 / ibi if ibi > 0 else 0
    resolved = ap._resolve_tempo(y, sr, med_tempo)
    # Tempogramme : estimations multiples pour repérer les ambiguïtés moitié/double.
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    cands = librosa.feature.tempo(onset_envelope=onset, sr=sr, aggregate=None)
    top = sorted(set(np.round(np.atleast_1d(librosa.feature.tempo(
        onset_envelope=onset, sr=sr, aggregate=np.median)), 1)))
    print(f"{t['id']:<22} brut={raw:6.1f}  médian={med_tempo:6.1f}  résolu={resolved:6.1f}"
          f"  beat={60.0/resolved if resolved else 0:.2f}s  librosa.tempo={top}")
