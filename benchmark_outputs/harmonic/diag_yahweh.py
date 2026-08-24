"""Diagnostic ponctuel : aligne visuellement vérité terrain et prédiction."""
import importlib.util, json
spec = importlib.util.spec_from_file_location('bh', 'scripts/benchmark_harmonic.py')
bh = importlib.util.module_from_spec(spec); spec.loader.exec_module(bh)

gt = json.load(open('tests/corpus/gt/you-are-yahweh.json', encoding='utf-8'))
track = next(t for t in bh.load_corpus()['tracks'] if t['id'] == 'you-are-yahweh')
res, _ = bh.analyze(track['media'])
pred = res['chords']
print(f"tempo={res.get('tempo')} key={res.get('key')} segments={len(pred)}\n")
print(f"{'VÉRITÉ TERRAIN':<34}| PRÉDIT")
print('-' * 78)
for g in gt['segments'][:18]:
    g0, g1 = g['start'], g['end']
    ov = [f"{p['chord']}@{p['startTime']:.1f}-{p['endTime']:.1f}"
          for p in pred if bh.overlap(g0, g1, p['startTime'], p['endTime']) > 0.3]
    print(f"{g['chord']:<4} {g0:>6.1f}-{g1:<6.1f} {str(g.get('section',''))[:8]:<9}| {' '.join(ov)}")
