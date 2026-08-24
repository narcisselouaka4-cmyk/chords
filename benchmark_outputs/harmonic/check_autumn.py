import importlib.util, math, numpy as np, librosa
spec = importlib.util.spec_from_file_location('bh', 'scripts/benchmark_harmonic.py')
bh = importlib.util.module_from_spec(spec); spec.loader.exec_module(bh)
ap = bh.ap()
t = next(x for x in bh.load_corpus()['tracks'] if x['id'] == 'autumn-leaves')
y, sr = librosa.load(bh.to_wav(t['media']), sr=22050, mono=True)
raw, beats = ap._beat_track(y, sr)
bt = librosa.frames_to_time(np.atleast_1d(beats), sr=sr, hop_length=512)
det = 60.0 / float(np.median(np.diff(bt)))
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
dur = len(y) / sr
overall = float(np.mean(onset)) or 1.0
for center in (65, 110):
    best, bs = det, -1
    for cand in (det/2, det, det*2):
        grid = np.arange(0.0, dur, 60.0/cand)
        per = ap._grid_onset_strength(onset, sr, 512, grid) / overall
        pri = math.exp(-0.5 * (math.log2(cand/center)/0.7)**2)
        if per*pri > bs: bs, best = per*pri, cand
    print(f"  centre {center:>3} → {best:.1f} BPM")
