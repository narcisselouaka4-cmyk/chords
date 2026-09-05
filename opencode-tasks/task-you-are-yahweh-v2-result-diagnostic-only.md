[0m
> build · deepseek-v4-flash-free
[0m
[0m→ [0mRead electron/audio-processor.py
[0m
[0m$ [0mls -la /tmp/local_analysis3_clean.json /tmp/local_piano3.wav 2>&1; ls /home/visiteur/piano-jazz-chords/opencode-tasks/ 2>&1
-rw-rw-r-- 1 visiteur visiteur    43957 20 août  22:23 /tmp/local_analysis3_clean.json
-rw-rw-r-- 1 visiteur visiteur 26342478 20 août  22:22 /tmp/local_piano3.wav
task-you-are-yahweh.md
task-you-are-yahweh-result.md
task-you-are-yahweh-v2.md
task-you-are-yahweh-v2-result.md
[0m
[0m→ [0mRead electron/audio-processor.py[90m [offset=1349][0m
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json
d = json.load(open('/tmp/local_analysis3_clean.json'))
print('keys:', list(d.keys()))
print('key:', d.get('key'), d.get('keyMode'), 'conf:', d.get('keyConfidence'))
print('tempo:', d.get('tempo'))
print('timeSig:', d.get('timeSignature'))
print('n chords:', len(d.get('chords', [])))
print()
print('timeline:')
for c in d['chords']:
    print(f\"  {c['startTime']:7.2f} - {c['endTime']:7.2f}  {c['chord']:>12}  conf={c['confidence']:.3f}\")
"
keys: ['duration', 'tempo', 'timeSignature', 'key', 'keyMode', 'keyConfidence', 'keyCandidates', 'confidence', 'chords', 'aggregation']
key: A major conf: 0.994
tempo: 53.8
timeSig: 4/4
n chords: 73

timeline:
     0.00 -    6.94         Dmaj7  conf=0.830
     6.94 -    8.08         Asus4  conf=0.921
     8.08 -    8.64             D  conf=0.835
     8.64 -    9.20             E  conf=0.773
     9.20 -   12.89             A  conf=0.992
    12.89 -   13.47            C#  conf=0.775
    13.47 -   14.03             A  conf=0.975
    14.03 -   17.41         Bsus4  conf=0.935
    17.41 -   20.83           F#m  conf=0.914
    20.83 -   23.64         Dmaj7  conf=0.860
    23.64 -   25.91         Asus4  conf=0.916
    25.91 -   27.61          F#m7  conf=0.876
    27.61 -   34.39         Esus4  conf=0.961
    34.39 -   35.53            Bm  conf=0.908
    35.53 -   36.66          C#m7  conf=0.880
    36.66 -   37.83         Esus4  conf=0.947
    37.83 -   38.38             A  conf=0.873
    38.38 -   40.05         Asus2  conf=0.918
    40.05 -   40.61           C#m  conf=0.848
    40.61 -   43.45         Bsus4  conf=0.944
    43.45 -   48.55         Asus4  conf=0.933
    48.55 -   49.11             A  conf=1.000
    49.11 -   49.67           C#m  conf=0.847
    49.67 -   52.50         Bsus4  conf=0.944
    52.50 -   57.61         Asus4  conf=0.932
    57.61 -   58.17             A  conf=1.000
    58.17 -   59.30           C#m  conf=0.923
    59.30 -   61.00         Bsus4  conf=0.980
    61.00 -   62.69         Dmaj7  conf=0.925
    62.69 -   63.83         Asus4  conf=0.927
    63.83 -   67.80             A  conf=0.976
    67.80 -   70.06         Bsus4  conf=0.926
    70.06 -   71.75         Dmaj7  conf=0.925
    71.75 -   73.47         Asus2  conf=0.961
    73.47 -   74.05         Esus4  conf=0.968
    74.05 -   76.28             A  conf=0.950
    76.28 -   76.86          C#m7  conf=1.000
    76.86 -   78.00         Esus4  conf=0.975
    78.00 -   79.11             E  conf=1.000
    79.11 -   79.67            B7  conf=0.823
    79.67 -   84.75         Asus4  conf=0.918
    84.75 -   85.89          C#m7  conf=1.000
    85.89 -   88.75         Bsus4  conf=0.900
    88.75 -   91.00         Asus4  conf=0.996
    91.00 -   94.39         Esus4  conf=0.987
    94.39 -   95.53        C#sus4  conf=0.988
    95.53 -   97.22         Bsus4  conf=0.988
    97.22 -   97.80          C#m7  conf=0.927
    97.80 -   99.50         Asus4  conf=0.926
    99.50 -  100.06           Bm7  conf=0.994
   100.06 -  101.75         Esus4  conf=0.946
   101.75 -  102.31         Asus4  conf=0.878
   102.31 -  102.89         Esus4  conf=0.903
   102.89 -  103.44             A  conf=1.000
   103.44 -  104.03           C#m  conf=0.848
   104.03 -  106.86         Bsus4  conf=0.942
   106.86 -  111.94         Asus4  conf=0.933
   111.94 -  112.50             A  conf=1.000
   112.50 -  113.08           C#m  conf=0.848
   113.08 -  115.91         Bsus4  conf=0.942
   115.91 -  121.00         Asus4  conf=0.932
   121.00 -  121.56             A  conf=1.000
   121.56 -  122.69           C#m  conf=0.920
   122.69 -  124.39         Bsus4  conf=0.980
   124.39 -  126.11         Dmaj7  conf=0.925
   126.11 -  127.22         Asus4  conf=0.926
   127.22 -  130.61             A  conf=0.996
   130.61 -  131.75        C#sus4  conf=0.869
   131.75 -  133.44         Bsus4  conf=0.980
   133.44 -  135.16         Dmaj7  conf=0.925
   135.16 -  135.72         Asus4  conf=0.895
   135.72 -  136.28         Bsus4  conf=0.819
   136.28 -  149.33          F#m7  conf=0.803
[0m
Now let me examine the analysis JSON and the deterministic
[0m→ [0mRead tests/test_harmonic_deterministic.py
[0m→ [0mRead opencode-tasks/task-you-are-yahweh-v2-result.md
Let me look at the previous task results and understand the pipeline better
[0m→ [0mRead opencode-tasks/task-you-are-yahweh.md
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && git status && git log --oneline -5 && git diff --stat
Sur la branche master
Modifications qui ne seront pas validées :
  (utilisez "git add <fichier>..." pour mettre à jour ce qui sera validé)
  (utilisez "git restore <fichier>..." pour annuler les modifications dans le répertoire de travail)
  (valider ou annuler le contenu non suivi ou modifié dans les sous-modules)
	modifié :         .claude/worktrees/refonte-ui-jazz (contenu modifié, contenu non suivi)
	modifié :         electron/__pycache__/audio-processor.cpython-313.pyc
	modifié :         electron/audio-processor.py
	modifié :         src/style.css
	modifié :         src/ui/analyzer-tab.js
	modifié :         src/ui/components/analyzer-workspace.css
	modifié :         src/ui/media-library.js

Fichiers non suivis:
  (utilisez "git add <fichier>..." pour inclure dans ce qui sera validé)
	.obsidian/
	opencode-tasks/
	scripts/generate-arpeggio-fixtures.py
	tests/__pycache__/test_harmonic_deterministic.cpython-313.pyc
	tests/audio/arpeggio/
	tests/test_arpeggio_audio.py
	tests/test_arpeggio_segmentation.py
	tests/test_harmonic_deterministic.py

aucune modification n'a été ajoutée à la validation (utilisez "git add" ou "git commit -a")
d053411 fix(analyzer): menu bibliothèque accessible + modale de renommage
ab5eb1b fix(analyzer): separate home and results workspace rendering
077921f LOT 4 — Sous-onglet Réharmonisation dédié
d5d1525 LOT 3 — Timeline d'accords + MIDI Stop
50a9501 LOT 2 — Bibliothèque persistante + dédoublonnage
 .claude/worktrees/refonte-ui-jazz                  |   0
 .../__pycache__/audio-processor.cpython-313.pyc    | Bin 72399 -> 86401 bytes
 electron/audio-processor.py                        | 196 +++++++++++++++++++++
 src/style.css                                      |  10 +-
 src/ui/analyzer-tab.js                             |   9 +
 src/ui/components/analyzer-workspace.css           |   7 +
 src/ui/media-library.js                            |   2 +
 7 files changed, 217 insertions(+), 7 deletions(-)
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 tests/test_harmonic_deterministic.py 2>&1 | tail -5
segs=['Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']
      OK: symbole interdit Gm présent 0 fois
        segs=['Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']

=== 14/17 passés, 3 échoués ===
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && git diff electron/audio-processor.py
diff --git a/electron/audio-processor.py b/electron/audio-processor.py
index e6eeb2d..2990924 100644
--- a/electron/audio-processor.py
+++ b/electron/audio-processor.py
@@ -693,6 +693,195 @@ def _merge_similar_segments(segments):
     return merged
 
 
+def _state_pc_set(state):
+    """Retourne le pitch-class set d'un état d'accord."""
+    suffix = state['suffix']
+    if suffix == 'N' or state['root'] is None:
+        return set()
+    return {(state['root'] + pc) % 12 for pc in CHORD_INTERVALS[suffix]}
+
+
+def _merge_arpeggio_segments(segments, beat_chroma, states, key, obs_scores=None,
+                             max_window_beats=4,
+                             min_obs_score=0.50,
+                             min_score_gain=0.08,
+                             min_pc_coverage=0.60):
+    """Fusionne les courts segments consécutifs issus d'un même harmonie.
+
+    Quand un arpège, un walking bass ou une figure mélodique courte fait
+    changer le HMM à chaque beat, les segments consécutifs appartiennent
+    souvent au même pitch-class set agrégé. Cette fonction détecte ces
+    fenêtres et les fusionne en l'accord le plus cohérent, sans toucher au
+    HMM ni à l'observation.
+
+    Garde-fous pour éviter les régressions :
+    - le score de l'accord gagnant sur le chroma agrégé doit être nettement
+      supérieur au score moyen des segments pris individuellement ;
+    - une majorité des fondamentales des segments fusionnés doit appartenir
+      au PC-set de l'accord gagnant ;
+    - l'accord gagnant doit être diatonique dans la tonalité détectée.
+    """
+    if len(segments) < 2:
+        return segments
+
+    diatonic_roots = _build_diatonic_roots(key)
+    if not diatonic_roots:
+        return segments
+
+    seg_beats = [seg.get('beatIndices', []) for seg in segments]
+
+    def segment_score(seg):
+        """Score moyen du segment avec son propre état, si disponible."""
+        idxs = seg.get('beatIndices', [])
+        state_idx = seg.get('state')
+        if not idxs or state_idx is None or state_idx < 0 or state_idx >= len(states):
+            return 0.0
+        if states[state_idx]['suffix'] == 'N':
+            return 0.0
+        # On ne dispose pas de obs_scores ici ; on se fie à la confidence.
+        return float(seg.get('confidence', 0.0))
+
+    def aggregate_score(beat_idxs):
+        """Retourne (best_state_index, best_score, second_score, all_scores) sur le chroma agrégé."""
+        if not beat_idxs:
+            return None, 0.0, 0.0, None
+        agg = np.mean(beat_chroma[:, beat_idxs], axis=1)
+        norm = float(np.linalg.norm(agg))
+        if norm < 1e-6:
+            return None, 0.0, 0.0, None
+        agg_norm = agg / norm
+        scores = np.zeros(len(states), dtype=np.float64)
+        for j, st in enumerate(states):
+            if st['suffix'] == 'N' or st['root'] is None:
+                scores[j] = -1.0
+                continue
+            scores[j] = float(np.dot(agg_norm, st['template']))
+        top_idx = int(np.argmax(scores))
+        top_score = float(scores[top_idx])
+        second_score = float(np.partition(scores, -2)[-2]) if len(scores) > 1 else 0.0
+        return top_idx, top_score, second_score, scores
+
+    def pc_coverage(window_root_pcs, state_idx):
+        """Proportion des fondamentales de la fenêtre incluses dans le PC-set."""
+        if state_idx is None or state_idx < 0 or state_idx >= len(states):
+            return 0.0
+        pcs = _state_pc_set(states[state_idx])
+        if not pcs:
+            return 0.0
+        return sum(1 for r in window_root_pcs if r in pcs) / len(window_root_pcs)
+
+    merged = []
+    i = 0
+    n = len(segments)
+    while i < n:
+        best_w = 1
+        best_state = None
+        best_score = 0.0
+
+        # Fenêtres croissantes à partir de i
+        for w in range(2, min(max_window_beats + 1, n - i + 1)):
+            beat_idxs = []
+            window_root_pcs = []
+            window_scores = []
+            valid = True
+            for k in range(i, i + w):
+                seg = segments[k]
+                if seg['chord'] == 'N':
+                    valid = False
+                    break
+                idxs = seg_beats[k]
+                if not idxs:
+                    valid = False
+                    break
+                beat_idxs.extend(idxs)
+                root, _ = _parse_chord_label(seg['chord'])
+                window_root_pcs.append(root if root is not None else -1)
+                window_scores.append(segment_score(seg))
+
+            if not valid or not beat_idxs or any(r < 0 for r in window_root_pcs):
+                continue
+
+            state_idx, agg_score, sec_score, all_scores = aggregate_score(beat_idxs)
+            if state_idx is None:
+                continue
+            if states[state_idx]['suffix'] == 'N':
+                continue
+
+            # L'accord gagnant doit être diatonique
+            if states[state_idx]['root'] not in diatonic_roots:
+                continue
+
+            # Score agrégé nettement supérieur au score moyen individuel
+            mean_indiv = float(np.mean(window_scores))
+            full_coverage = pc_coverage(window_root_pcs, state_idx) >= 0.999
+            if agg_score < mean_indiv + min_score_gain:
+                # Même sans gain acoustique, on peut fusionner si toutes les
+                # fondamentales de la fenêtre appartiennent au PC-set d'un accord
+                # diatonique stable (ex: walking bass C-E-G-B dans Cmaj7).
+                if not full_coverage:
+                    continue
+                if agg_score < min_obs_score + 0.10:
+                    continue
+
+            # Marge par rapport au deuxième candidat
+            if agg_score - sec_score < min_score_gain * 0.5:
+                continue
+
+            # Couverture minimale du PC-set (redondant avec full_coverage mais
+            # utile lorsque le gain acoustique est présent).
+            coverage = pc_coverage(window_root_pcs, state_idx)
+            if coverage < min_pc_coverage:
+                continue
+
+            # Conserver la meilleure fenêtre
+            if agg_score > best_score:
+                best_w = w
+                best_state = state_idx
+                best_score = agg_score
+
+        if best_w > 1 and best_state is not None:
+            new_seg = {
+                'startTime': segments[i]['startTime'],
+                'endTime': segments[i + best_w - 1]['endTime'],
+                'chord': states[best_state]['name'],
+                'state': best_state,
+                'beatIndices': [],
+                'confidence': round(best_score, 3),
+                'structural_root': states[best_state].get('structural_root'),
+                'structural_mode': states[best_state].get('structural_mode'),
+                'merged_by_arpeggio': True,
+            }
+            for k in range(i, i + best_w):
+                new_seg['beatIndices'].extend(seg_beats[k])
+            merged.append(new_seg)
+            i += best_w
+        else:
+            merged.append(segments[i])
+            i += 1
+
+    # Passe finale : absorber un segment terminal très court et isolé
+    # lorsque le segment précédent est le résultat d'une fusion arpège.
+    # Cela nettoie les notes de passage en fin de phrase sans affecter
+    # les vrais changements d'accord.
+    if len(merged) >= 2 and obs_scores is not None:
+        last = merged[-1]
+        prev = merged[-2]
+        if last['chord'] != 'N' and prev['chord'] != 'N' and prev.get('merged_by_arpeggio'):
+            last_dur = last['endTime'] - last['startTime']
+            prev_dur = prev['endTime'] - prev['startTime'] - last_dur
+            if last_dur <= 0.55 and prev_dur >= 1.0:
+                prev['endTime'] = last['endTime']
+                prev['beatIndices'].extend(last.get('beatIndices', []))
+                last_conf = float(last.get('confidence', 0.0))
+                if prev_dur + last_dur > 0:
+                    prev['confidence'] = round(
+                        (prev.get('confidence', 0.0) * prev_dur + last_conf * last_dur)
+                        / (prev_dur + last_dur), 3)
+                merged.pop()
+
+    return merged
+
+
 def _build_transition_matrix(states, key):
     """Matrice de transition log-additive : bonus positif = favorisé, négatif = pénalisé.
 
@@ -1694,6 +1883,13 @@ def analyze_chords(wav_path, clean_mode="legacy", debug=False, downgrade_mode="h
     if debug:
         _log_seg_stage("after _merge_similar_segments", segments, states)
 
+    # Fusion des courts segments appartenant à un même harmonie (arpèges,
+    # walking bass, figures mélodiques courtes). Cette couche est additive :
+    # elle ne modifie ni le HMM ni l'observation.
+    segments = _merge_arpeggio_segments(segments, beat_chroma, states, key, obs_scores=obs_scores)
+    if debug:
+        _log_seg_stage("after _merge_arpeggio_segments", segments, states)
+
     # Exposition des candidats d'observation (top 3) pour chaque segment.
     for seg in segments:
         idxs = seg.get('beatIndices', [])
[0m
[0m→ [0mRead opencode-tasks/task-you-are-yahweh-v2.md
Let me look at the task v2 spec and current state, then run diagnostics
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && time python3 -c "
import json, importlib.util
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
result = ap.analyze_chords('/tmp/local_piano3.wav')
print('n chords:', len(result['chords']))
" 2>&1 | tail -5
[AudioProcessor] analyzing chords from /tmp/local_piano3.wav (mode=legacy, obs=baseline)
[AudioProcessor] chord analysis done: 73 segments, key=A, tempo=53.8
n chords: 73

real	0m25,208s
user	0m23,510s
sys	0m1,471s
[0m
Let me write a diagnostic script to understand each pipeline stage
[0m← [0mWrite /tmp/opencode/diag_pipeline.py
Wrote file successfully.
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 /tmp/opencode/diag_pipeline.py 2>&1
=== after segment_path: 134
       Am7b5 t=0.00-4.11 d=4.11 conf=0.877 beats=[0]
      C#sus4 t=4.11-4.67 d=0.56 conf=0.797 beats=[1]
       Asus4 t=4.67-5.80 d=1.14 conf=0.949 beats=[2, 3]
           D t=5.80-6.94 d=1.14 conf=0.942 beats=[4, 5]
       Asus4 t=6.94-7.52 d=0.58 conf=0.921 beats=[6]
       Amaj7 t=7.52-8.08 d=0.56 conf=0.787 beats=[7]
           D t=8.08-8.64 d=0.56 conf=0.835 beats=[8]
           E t=8.64-9.20 d=0.56 conf=0.773 beats=[9]
           A t=9.20-12.89 d=3.69 conf=0.992 beats=[10, 11, 12, 13, 14, 15, 16]
          C# t=12.89-13.47 d=0.58 conf=0.775 beats=[17]
           A t=13.47-14.02 d=0.56 conf=0.975 beats=[18]
       Bsus4 t=14.02-17.41 d=3.39 conf=0.935 beats=[19, 20, 21, 22, 23, 24]
       Asus4 t=17.41-17.97 d=0.56 conf=0.803 beats=[25]
      C#sus4 t=17.97-19.13 d=1.16 conf=0.888 beats=[26, 27]
         F#m t=19.13-20.83 d=1.70 conf=1.000 beats=[28, 29, 30]
      C#sus4 t=20.83-21.39 d=0.56 conf=0.923 beats=[31]
           A t=21.39-22.50 d=1.11 conf=0.907 beats=[32, 33]
         C#m t=22.50-23.08 d=0.58 conf=1.000 beats=[34]
       Asus4 t=23.08-23.64 d=0.56 conf=0.952 beats=[35]
           D t=23.64-24.78 d=1.14 conf=1.000 beats=[36, 37]
       Asus4 t=24.78-25.91 d=1.14 conf=0.890 beats=[38, 39]
      F#sus2 t=25.91-26.49 d=0.58 conf=0.967 beats=[40]
       Esus2 t=26.49-27.05 d=0.56 conf=0.962 beats=[41]
         C#m t=27.05-27.61 d=0.56 conf=1.000 beats=[42]
           A t=27.61-31.00 d=3.39 conf=0.992 beats=[43, 44, 45, 46, 47, 48]
       Esus4 t=31.00-32.14 d=1.14 conf=0.850 beats=[49, 50]
       Bsus4 t=32.14-33.83 d=1.70 conf=0.966 beats=[51, 52, 53]
       Bsus2 t=33.83-34.39 d=0.56 conf=0.968 beats=[54]
          Bm t=34.39-35.53 d=1.14 conf=0.908 beats=[55, 56]
         C#m t=35.53-36.11 d=0.58 conf=1.000 beats=[57]
       Bsus4 t=36.11-36.66 d=0.56 conf=0.955 beats=[58]
       Esus4 t=36.66-37.83 d=1.16 conf=0.947 beats=[59, 60]
       Asus4 t=37.83-38.38 d=0.56 conf=0.894 beats=[61]
       Esus4 t=38.38-38.94 d=0.56 conf=0.954 beats=[62]
       Asus2 t=38.94-39.50 d=0.56 conf=0.967 beats=[63]
           A t=39.50-40.05 d=0.56 conf=1.000 beats=[64]
         C#m t=40.05-40.61 d=0.56 conf=0.848 beats=[65]
       Esus4 t=40.61-41.19 d=0.58 conf=0.978 beats=[66]
       Bsus4 t=41.19-42.89 d=1.70 conf=0.977 beats=[67, 68, 69]
      F#sus4 t=42.89-43.44 d=0.56 conf=0.899 beats=[70]
       Asus4 t=43.44-44.03 d=0.58 conf=0.952 beats=[71]
           D t=44.03-45.16 d=1.14 conf=1.000 beats=[72, 73]
       Dsus2 t=45.16-45.72 d=0.56 conf=0.940 beats=[74]
       Esus4 t=45.72-48.55 d=2.83 conf=0.995 beats=[75, 76, 77, 78, 79]
           A t=48.55-49.11 d=0.56 conf=1.000 beats=[80]
         C#m t=49.11-49.67 d=0.56 conf=0.847 beats=[81]
       Esus4 t=49.67-50.25 d=0.58 conf=0.978 beats=[82]
       Bsus4 t=50.25-51.94 d=1.70 conf=0.976 beats=[83, 84, 85]
      F#sus4 t=51.94-52.50 d=0.56 conf=0.896 beats=[86]
       Asus4 t=52.50-53.08 d=0.58 conf=0.951 beats=[87]
           D t=53.08-54.20 d=1.11 conf=1.000 beats=[88, 89]
       Dsus2 t=54.20-54.78 d=0.58 conf=0.933 beats=[90]
       Esus4 t=54.78-57.61 d=2.83 conf=0.995 beats=[91, 92, 93, 94, 95]
           A t=57.61-58.17 d=0.56 conf=1.000 beats=[96]
         C#m t=58.17-58.72 d=0.56 conf=0.839 beats=[97]
       Esus4 t=58.72-59.30 d=0.58 conf=0.832 beats=[98]
       Bsus4 t=59.30-61.00 d=1.70 conf=0.980 beats=[99, 100, 101]
      C#sus4 t=61.00-61.56 d=0.56 conf=0.752 beats=[102]
       Asus4 t=61.56-62.14 d=0.58 conf=0.989 beats=[103]
           D t=62.14-62.69 d=0.56 conf=1.000 beats=[104]
       Asus4 t=62.69-63.27 d=0.58 conf=0.921 beats=[105]
       Dsus2 t=63.27-63.83 d=0.56 conf=0.930 beats=[106]
           A t=63.83-67.80 d=3.97 conf=0.976 beats=[107, 108, 109, 110, 111, 112, 113]
       Esus4 t=67.80-68.36 d=0.56 conf=0.840 beats=[114]
       Bsus4 t=68.36-70.05 d=1.70 conf=0.979 beats=[115, 116, 117]
      C#sus4 t=70.05-70.61 d=0.56 conf=0.754 beats=[118]
       Asus4 t=70.61-71.19 d=0.58 conf=0.991 beats=[119]
           D t=71.19-71.75 d=0.56 conf=1.000 beats=[120]
       Asus4 t=71.75-72.33 d=0.58 conf=0.892 beats=[121]
       Bsus4 t=72.33-72.89 d=0.56 conf=0.824 beats=[122]
       Asus4 t=72.89-73.47 d=0.58 conf=0.897 beats=[123]
       Esus4 t=73.47-74.05 d=0.58 conf=0.968 beats=[124]
           A t=74.05-76.28 d=2.23 conf=0.950 beats=[125, 126, 127, 128]
        C#m7 t=76.28-76.86 d=0.58 conf=1.000 beats=[129]
       Esus4 t=76.86-77.42 d=0.56 conf=0.951 beats=[130]
       Bsus4 t=77.42-78.00 d=0.58 conf=0.973 beats=[131]
           E t=78.00-79.11 d=1.11 conf=1.000 beats=[132, 133]
          B7 t=79.11-79.67 d=0.56 conf=0.823 beats=[134]
          D7 t=79.67-81.39 d=1.72 conf=0.982 beats=[135, 136, 137]
       Asus4 t=81.39-81.94 d=0.56 conf=0.977 beats=[138]
       Esus4 t=81.94-84.75 d=2.81 conf=0.989 beats=[139, 140, 141, 142, 143]
        C#m7 t=84.75-85.89 d=1.14 conf=1.000 beats=[144, 145]
       Bsus4 t=85.89-87.05 d=1.16 conf=0.986 beats=[146, 147]
           E t=87.05-88.17 d=1.11 conf=1.000 beats=[148, 149]
       Bsus4 t=88.17-88.75 d=0.58 conf=0.869 beats=[150]
       Asus4 t=88.75-91.00 d=2.25 conf=0.996 beats=[151, 152, 153, 154]
       Esus4 t=91.00-94.39 d=3.39 conf=0.987 beats=[155, 156, 157, 158, 159, 160]
      C#sus4 t=94.39-95.53 d=1.14 conf=0.988 beats=[161, 162]
       Bsus4 t=95.53-97.22 d=1.70 conf=0.988 beats=[163, 164, 165]
        C#m7 t=97.22-97.80 d=0.58 conf=0.927 beats=[166]
       Asus4 t=97.80-98.36 d=0.56 conf=0.946 beats=[167]
       Dsus4 t=98.36-98.92 d=0.56 conf=0.904 beats=[168]
       Asus4 t=98.92-99.50 d=0.58 conf=1.000 beats=[169]
         Bm7 t=99.50-100.05 d=0.56 conf=0.994 beats=[170]
       Esus4 t=100.05-101.75 d=1.70 conf=0.946 beats=[171, 172, 173]
       Asus4 t=101.75-102.31 d=0.56 conf=0.878 beats=[174]
       Esus4 t=102.31-102.89 d=0.58 conf=0.903 beats=[175]
           A t=102.89-103.44 d=0.56 conf=1.000 beats=[176]
         C#m t=103.44-104.03 d=0.58 conf=0.848 beats=[177]
       Esus4 t=104.03-104.58 d=0.56 conf=0.976 beats=[178]
       Bsus4 t=104.58-106.28 d=1.70 conf=0.976 beats=[179, 180, 181]
      F#sus4 t=106.28-106.86 d=0.58 conf=0.897 beats=[182]
       Asus4 t=106.86-107.42 d=0.56 conf=0.952 beats=[183]
           D t=107.42-108.55 d=1.14 conf=1.000 beats=[184, 185]
       Dsus2 t=108.55-109.11 d=0.56 conf=0.933 beats=[186]
       Esus4 t=109.11-111.94 d=2.83 conf=0.995 beats=[187, 188, 189, 190, 191]
           A t=111.94-112.50 d=0.56 conf=1.000 beats=[192]
         C#m t=112.50-113.08 d=0.58 conf=0.848 beats=[193]
       Esus4 t=113.08-113.64 d=0.56 conf=0.977 beats=[194]
       Bsus4 t=113.64-115.33 d=1.70 conf=0.976 beats=[195, 196, 197]
      F#sus4 t=115.33-115.91 d=0.58 conf=0.892 beats=[198]
       Asus4 t=115.91-116.47 d=0.56 conf=0.952 beats=[199]
           D t=116.47-117.61 d=1.14 conf=1.000 beats=[200, 201]
       Dsus2 t=117.61-118.17 d=0.56 conf=0.928 beats=[202]
       Esus4 t=118.17-121.00 d=2.83 conf=0.995 beats=[203, 204, 205, 206, 207]
           A t=121.00-121.56 d=0.56 conf=1.000 beats=[208]
         C#m t=121.56-122.14 d=0.58 conf=0.856 beats=[209]
       Esus4 t=122.14-122.69 d=0.56 conf=0.831 beats=[210]
       Bsus4 t=122.69-124.39 d=1.70 conf=0.980 beats=[211, 212, 213]
      C#sus4 t=124.39-124.97 d=0.58 conf=0.750 beats=[214]
       Asus4 t=124.97-125.55 d=0.58 conf=0.991 beats=[215]
           D t=125.55-126.11 d=0.56 conf=1.000 beats=[216]
       Asus4 t=126.11-126.66 d=0.56 conf=0.922 beats=[217]
       Dsus2 t=126.66-127.22 d=0.56 conf=0.924 beats=[218]
           A t=127.22-130.61 d=3.39 conf=0.996 beats=[219, 220, 221, 222, 223, 224]
      C#sus4 t=130.61-131.19 d=0.58 conf=0.964 beats=[225]
        F#m7 t=131.19-131.75 d=0.56 conf=0.903 beats=[226]
       Bsus4 t=131.75-133.45 d=1.70 conf=0.980 beats=[227, 228, 229]
      C#sus4 t=133.45-134.03 d=0.58 conf=0.752 beats=[230]
       Asus4 t=134.03-134.61 d=0.58 conf=0.993 beats=[231]
           D t=134.61-135.16 d=0.56 conf=1.000 beats=[232]
       Asus4 t=135.16-135.72 d=0.56 conf=0.895 beats=[233]
       Bsus4 t=135.72-136.28 d=0.56 conf=0.819 beats=[234]
        F#m7 t=136.28-149.33 d=13.06 conf=0.803 beats=[235]

=== after merge_similar: 127
       Am7b5 t=0.00-4.11 d=4.11 conf=0.877
      C#sus4 t=4.11-4.67 d=0.56 conf=0.797
       Asus4 t=4.67-5.80 d=1.14 conf=0.949
           D t=5.80-6.94 d=1.14 conf=0.942
       Asus4 t=6.94-8.08 d=1.14 conf=0.921
           D t=8.08-8.64 d=0.56 conf=0.835
           E t=8.64-9.20 d=0.56 conf=0.773
           A t=9.20-12.89 d=3.69 conf=0.992
          C# t=12.89-13.47 d=0.58 conf=0.775
           A t=13.47-14.02 d=0.56 conf=0.975
       Bsus4 t=14.02-17.41 d=3.39 conf=0.935
       Asus4 t=17.41-17.97 d=0.56 conf=0.803
      C#sus4 t=17.97-19.13 d=1.16 conf=0.888
         F#m t=19.13-20.83 d=1.70 conf=1.000
      C#sus4 t=20.83-21.39 d=0.56 conf=0.923
           A t=21.39-22.50 d=1.11 conf=0.907
         C#m t=22.50-23.08 d=0.58 conf=1.000
       Asus4 t=23.08-23.64 d=0.56 conf=0.952
           D t=23.64-24.78 d=1.14 conf=1.000
       Asus4 t=24.78-25.91 d=1.14 conf=0.890
      F#sus2 t=25.91-26.49 d=0.58 conf=0.967
       Esus2 t=26.49-27.05 d=0.56 conf=0.962
         C#m t=27.05-27.61 d=0.56 conf=1.000
           A t=27.61-31.00 d=3.39 conf=0.992
       Esus4 t=31.00-32.14 d=1.14 conf=0.850
       Bsus4 t=32.14-34.39 d=2.25 conf=0.966
          Bm t=34.39-35.53 d=1.14 conf=0.908
         C#m t=35.53-36.11 d=0.58 conf=1.000
       Bsus4 t=36.11-36.66 d=0.56 conf=0.955
       Esus4 t=36.66-37.83 d=1.16 conf=0.947
       Asus4 t=37.83-38.38 d=0.56 conf=0.894
       Esus4 t=38.38-38.94 d=0.56 conf=0.954
       Asus2 t=38.94-40.05 d=1.11 conf=0.967
         C#m t=40.05-40.61 d=0.56 conf=0.848
       Esus4 t=40.61-41.19 d=0.58 conf=0.978
       Bsus4 t=41.19-42.89 d=1.70 conf=0.977
      F#sus4 t=42.89-43.44 d=0.56 conf=0.899
       Asus4 t=43.44-44.03 d=0.58 conf=0.952
           D t=44.03-45.72 d=1.70 conf=1.000
       Esus4 t=45.72-48.55 d=2.83 conf=0.995
           A t=48.55-49.11 d=0.56 conf=1.000
         C#m t=49.11-49.67 d=0.56 conf=0.847
       Esus4 t=49.67-50.25 d=0.58 conf=0.978
       Bsus4 t=50.25-51.94 d=1.70 conf=0.976
      F#sus4 t=51.94-52.50 d=0.56 conf=0.896
       Asus4 t=52.50-53.08 d=0.58 conf=0.951
           D t=53.08-54.78 d=1.70 conf=1.000
       Esus4 t=54.78-57.61 d=2.83 conf=0.995
           A t=57.61-58.17 d=0.56 conf=1.000
         C#m t=58.17-58.72 d=0.56 conf=0.839
       Esus4 t=58.72-59.30 d=0.58 conf=0.832
       Bsus4 t=59.30-61.00 d=1.70 conf=0.980
      C#sus4 t=61.00-61.56 d=0.56 conf=0.752
       Asus4 t=61.56-62.14 d=0.58 conf=0.989
           D t=62.14-62.69 d=0.56 conf=1.000
       Asus4 t=62.69-63.27 d=0.58 conf=0.921
       Dsus2 t=63.27-63.83 d=0.56 conf=0.930
           A t=63.83-67.80 d=3.97 conf=0.976
       Esus4 t=67.80-68.36 d=0.56 conf=0.840
       Bsus4 t=68.36-70.05 d=1.70 conf=0.979
      C#sus4 t=70.05-70.61 d=0.56 conf=0.754
       Asus4 t=70.61-71.19 d=0.58 conf=0.991
           D t=71.19-71.75 d=0.56 conf=1.000
       Asus4 t=71.75-72.33 d=0.58 conf=0.892
       Bsus4 t=72.33-72.89 d=0.56 conf=0.824
       Asus4 t=72.89-73.47 d=0.58 conf=0.897
       Esus4 t=73.47-74.05 d=0.58 conf=0.968
           A t=74.05-76.28 d=2.23 conf=0.950
        C#m7 t=76.28-76.86 d=0.58 conf=1.000
       Esus4 t=76.86-77.42 d=0.56 conf=0.951
       Bsus4 t=77.42-78.00 d=0.58 conf=0.973
           E t=78.00-79.11 d=1.11 conf=1.000
          B7 t=79.11-79.67 d=0.56 conf=0.823
          D7 t=79.67-81.39 d=1.72 conf=0.982
       Asus4 t=81.39-81.94 d=0.56 conf=0.977
       Esus4 t=81.94-84.75 d=2.81 conf=0.989
        C#m7 t=84.75-85.89 d=1.14 conf=1.000
       Bsus4 t=85.89-87.05 d=1.16 conf=0.986
           E t=87.05-88.17 d=1.11 conf=1.000
       Bsus4 t=88.17-88.75 d=0.58 conf=0.869
       Asus4 t=88.75-91.00 d=2.25 conf=0.996
       Esus4 t=91.00-94.39 d=3.39 conf=0.987
      C#sus4 t=94.39-95.53 d=1.14 conf=0.988
       Bsus4 t=95.53-97.22 d=1.70 conf=0.988
        C#m7 t=97.22-97.80 d=0.58 conf=0.927
       Asus4 t=97.80-98.36 d=0.56 conf=0.946
       Dsus4 t=98.36-98.92 d=0.56 conf=0.904
       Asus4 t=98.92-99.50 d=0.58 conf=1.000
         Bm7 t=99.50-100.05 d=0.56 conf=0.994
       Esus4 t=100.05-101.75 d=1.70 conf=0.946
       Asus4 t=101.75-102.31 d=0.56 conf=0.878
       Esus4 t=102.31-102.89 d=0.58 conf=0.903
           A t=102.89-103.44 d=0.56 conf=1.000
         C#m t=103.44-104.03 d=0.58 conf=0.848
       Esus4 t=104.03-104.58 d=0.56 conf=0.976
       Bsus4 t=104.58-106.28 d=1.70 conf=0.976
      F#sus4 t=106.28-106.86 d=0.58 conf=0.897
       Asus4 t=106.86-107.42 d=0.56 conf=0.952
           D t=107.42-109.11 d=1.70 conf=1.000
       Esus4 t=109.11-111.94 d=2.83 conf=0.995
           A t=111.94-112.50 d=0.56 conf=1.000
         C#m t=112.50-113.08 d=0.58 conf=0.848
       Esus4 t=113.08-113.64 d=0.56 conf=0.977
       Bsus4 t=113.64-115.33 d=1.70 conf=0.976
      F#sus4 t=115.33-115.91 d=0.58 conf=0.892
       Asus4 t=115.91-116.47 d=0.56 conf=0.952
           D t=116.47-118.17 d=1.70 conf=1.000
       Esus4 t=118.17-121.00 d=2.83 conf=0.995
           A t=121.00-121.56 d=0.56 conf=1.000
         C#m t=121.56-122.14 d=0.58 conf=0.856
       Esus4 t=122.14-122.69 d=0.56 conf=0.831
       Bsus4 t=122.69-124.39 d=1.70 conf=0.980
      C#sus4 t=124.39-124.97 d=0.58 conf=0.750
       Asus4 t=124.97-125.55 d=0.58 conf=0.991
           D t=125.55-126.11 d=0.56 conf=1.000
       Asus4 t=126.11-126.66 d=0.56 conf=0.922
       Dsus2 t=126.66-127.22 d=0.56 conf=0.924
           A t=127.22-130.61 d=3.39 conf=0.996
      C#sus4 t=130.61-131.19 d=0.58 conf=0.964
        F#m7 t=131.19-131.75 d=0.56 conf=0.903
       Bsus4 t=131.75-133.45 d=1.70 conf=0.980
      C#sus4 t=133.45-134.03 d=0.58 conf=0.752
       Asus4 t=134.03-134.61 d=0.58 conf=0.993
           D t=134.61-135.16 d=0.56 conf=1.000
       Asus4 t=135.16-135.72 d=0.56 conf=0.895
       Bsus4 t=135.72-136.28 d=0.56 conf=0.819
        F#m7 t=136.28-149.33 d=13.06 conf=0.803

=== after merge_arpeggio: 73
       Dmaj7 t=0.00-6.94 d=6.94 conf=0.830 arp=True
       Asus4 t=6.94-8.08 d=1.14 conf=0.921 arp=False
           D t=8.08-8.64 d=0.56 conf=0.835 arp=False
           E t=8.64-9.20 d=0.56 conf=0.773 arp=False
           A t=9.20-12.89 d=3.69 conf=0.992 arp=False
          C# t=12.89-13.47 d=0.58 conf=0.775 arp=False
           A t=13.47-14.02 d=0.56 conf=0.975 arp=False
       Bsus4 t=14.02-17.41 d=3.39 conf=0.935 arp=False
         F#m t=17.41-20.83 d=3.41 conf=0.914 arp=True
       Dmaj7 t=20.83-23.64 d=2.81 conf=0.860 arp=True
       Asus4 t=23.64-25.91 d=2.28 conf=0.916 arp=True
        F#m7 t=25.91-27.61 d=1.70 conf=0.876 arp=True
       Esus4 t=27.61-34.39 d=6.78 conf=0.961 arp=True
          Bm t=34.39-35.53 d=1.14 conf=0.908 arp=False
        C#m7 t=35.53-36.66 d=1.14 conf=0.880 arp=True
       Esus4 t=36.66-37.83 d=1.16 conf=0.947 arp=False
       Asus4 t=37.83-38.38 d=0.56 conf=0.894 arp=False
       Asus2 t=38.38-40.05 d=1.67 conf=0.918 arp=True
         C#m t=40.05-40.61 d=0.56 conf=0.848 arp=False
       Bsus4 t=40.61-43.44 d=2.83 conf=0.944 arp=True
       Asus4 t=43.44-48.55 d=5.11 conf=0.933 arp=True
           A t=48.55-49.11 d=0.56 conf=1.000 arp=False
         C#m t=49.11-49.67 d=0.56 conf=0.847 arp=False
       Bsus4 t=49.67-52.50 d=2.83 conf=0.944 arp=True
       Asus4 t=52.50-57.61 d=5.11 conf=0.932 arp=True
           A t=57.61-58.17 d=0.56 conf=1.000 arp=False
         C#m t=58.17-59.30 d=1.14 conf=0.923 arp=True
       Bsus4 t=59.30-61.00 d=1.70 conf=0.980 arp=False
       Dmaj7 t=61.00-62.69 d=1.70 conf=0.925 arp=True
       Asus4 t=62.69-63.83 d=1.14 conf=0.927 arp=True
           A t=63.83-67.80 d=3.97 conf=0.976 arp=False
       Bsus4 t=67.80-70.05 d=2.25 conf=0.926 arp=True
       Dmaj7 t=70.05-71.75 d=1.70 conf=0.925 arp=True
       Asus2 t=71.75-73.47 d=1.72 conf=0.961 arp=True
       Esus4 t=73.47-74.05 d=0.58 conf=0.968 arp=False
           A t=74.05-76.28 d=2.23 conf=0.950 arp=False
        C#m7 t=76.28-76.86 d=0.58 conf=1.000 arp=False
       Esus4 t=76.86-78.00 d=1.14 conf=0.975 arp=True
           E t=78.00-79.11 d=1.11 conf=1.000 arp=False
          B7 t=79.11-79.67 d=0.56 conf=0.823 arp=False
       Asus4 t=79.67-84.75 d=5.09 conf=0.918 arp=True
        C#m7 t=84.75-85.89 d=1.14 conf=1.000 arp=False
       Bsus4 t=85.89-88.75 d=2.86 conf=0.900 arp=True
       Asus4 t=88.75-91.00 d=2.25 conf=0.996 arp=False
       Esus4 t=91.00-94.39 d=3.39 conf=0.987 arp=False
      C#sus4 t=94.39-95.53 d=1.14 conf=0.988 arp=False
       Bsus4 t=95.53-97.22 d=1.70 conf=0.988 arp=False
        C#m7 t=97.22-97.80 d=0.58 conf=0.927 arp=False
       Asus4 t=97.80-99.50 d=1.70 conf=0.926 arp=True
         Bm7 t=99.50-100.05 d=0.56 conf=0.994 arp=False
       Esus4 t=100.05-101.75 d=1.70 conf=0.946 arp=False
       Asus4 t=101.75-102.31 d=0.56 conf=0.878 arp=False
       Esus4 t=102.31-102.89 d=0.58 conf=0.903 arp=False
           A t=102.89-103.44 d=0.56 conf=1.000 arp=False
         C#m t=103.44-104.03 d=0.58 conf=0.848 arp=False
       Bsus4 t=104.03-106.86 d=2.83 conf=0.942 arp=True
       Asus4 t=106.86-111.94 d=5.09 conf=0.933 arp=True
           A t=111.94-112.50 d=0.56 conf=1.000 arp=False
         C#m t=112.50-113.08 d=0.58 conf=0.848 arp=False
       Bsus4 t=113.08-115.91 d=2.83 conf=0.942 arp=True
       Asus4 t=115.91-121.00 d=5.09 conf=0.932 arp=True
           A t=121.00-121.56 d=0.56 conf=1.000 arp=False
         C#m t=121.56-122.69 d=1.14 conf=0.920 arp=True
       Bsus4 t=122.69-124.39 d=1.70 conf=0.980 arp=False
       Dmaj7 t=124.39-126.11 d=1.72 conf=0.925 arp=True
       Asus4 t=126.11-127.22 d=1.11 conf=0.926 arp=True
           A t=127.22-130.61 d=3.39 conf=0.996 arp=False
      C#sus4 t=130.61-131.75 d=1.14 conf=0.869 arp=True
       Bsus4 t=131.75-133.45 d=1.70 conf=0.980 arp=False
       Dmaj7 t=133.45-135.16 d=1.72 conf=0.925 arp=True
       Asus4 t=135.16-135.72 d=0.56 conf=0.895 arp=False
       Bsus4 t=135.72-136.28 d=0.56 conf=0.819 arp=False
        F#m7 t=136.28-149.33 d=13.06 conf=0.803 arp=False

=== after downgrade: 73
       Dmaj7 t=0.00-6.94 d=6.94
       Asus4 t=6.94-8.08 d=1.14
           D t=8.08-8.64 d=0.56
           E t=8.64-9.20 d=0.56
           A t=9.20-12.89 d=3.69
          C# t=12.89-13.47 d=0.58
           A t=13.47-14.02 d=0.56
       Bsus4 t=14.02-17.41 d=3.39
         F#m t=17.41-20.83 d=3.41
       Dmaj7 t=20.83-23.64 d=2.81
       Asus4 t=23.64-25.91 d=2.28
        F#m7 t=25.91-27.61 d=1.70
       Esus4 t=27.61-34.39 d=6.78
          Bm t=34.39-35.53 d=1.14
        C#m7 t=35.53-36.66 d=1.14
       Esus4 t=36.66-37.83 d=1.16
           A t=37.83-38.38 d=0.56
       Asus2 t=38.38-40.05 d=1.67
         C#m t=40.05-40.61 d=0.56
       Bsus4 t=40.61-43.44 d=2.83
       Asus4 t=43.44-48.55 d=5.11
           A t=48.55-49.11 d=0.56
         C#m t=49.11-49.67 d=0.56
       Bsus4 t=49.67-52.50 d=2.83
       Asus4 t=52.50-57.61 d=5.11
           A t=57.61-58.17 d=0.56
         C#m t=58.17-59.30 d=1.14
       Bsus4 t=59.30-61.00 d=1.70
       Dmaj7 t=61.00-62.69 d=1.70
       Asus4 t=62.69-63.83 d=1.14
           A t=63.83-67.80 d=3.97
       Bsus4 t=67.80-70.05 d=2.25
       Dmaj7 t=70.05-71.75 d=1.70
       Asus2 t=71.75-73.47 d=1.72
       Esus4 t=73.47-74.05 d=0.58
           A t=74.05-76.28 d=2.23
        C#m7 t=76.28-76.86 d=0.58
       Esus4 t=76.86-78.00 d=1.14
           E t=78.00-79.11 d=1.11
          B7 t=79.11-79.67 d=0.56
       Asus4 t=79.67-84.75 d=5.09
        C#m7 t=84.75-85.89 d=1.14
       Bsus4 t=85.89-88.75 d=2.86
       Asus4 t=88.75-91.00 d=2.25
       Esus4 t=91.00-94.39 d=3.39
      C#sus4 t=94.39-95.53 d=1.14
       Bsus4 t=95.53-97.22 d=1.70
        C#m7 t=97.22-97.80 d=0.58
       Asus4 t=97.80-99.50 d=1.70
         Bm7 t=99.50-100.05 d=0.56
       Esus4 t=100.05-101.75 d=1.70
       Asus4 t=101.75-102.31 d=0.56
       Esus4 t=102.31-102.89 d=0.58
           A t=102.89-103.44 d=0.56
         C#m t=103.44-104.03 d=0.58
       Bsus4 t=104.03-106.86 d=2.83
       Asus4 t=106.86-111.94 d=5.09
           A t=111.94-112.50 d=0.56
         C#m t=112.50-113.08 d=0.58
       Bsus4 t=113.08-115.91 d=2.83
       Asus4 t=115.91-121.00 d=5.09
           A t=121.00-121.56 d=0.56
         C#m t=121.56-122.69 d=1.14
       Bsus4 t=122.69-124.39 d=1.70
       Dmaj7 t=124.39-126.11 d=1.72
       Asus4 t=126.11-127.22 d=1.11
           A t=127.22-130.61 d=3.39
      C#sus4 t=130.61-131.75 d=1.14
       Bsus4 t=131.75-133.45 d=1.70
       Dmaj7 t=133.45-135.16 d=1.72
       Asus4 t=135.16-135.72 d=0.56
       Bsus4 t=135.72-136.28 d=0.56
        F#m7 t=136.28-149.33 d=13.06

=== after clean: 73
       Dmaj7 t=0.00-6.94 d=6.94
       Asus4 t=6.94-8.08 d=1.14
           D t=8.08-8.64 d=0.56
           E t=8.64-9.20 d=0.56
           A t=9.20-12.89 d=3.69
          C# t=12.89-13.47 d=0.58
           A t=13.47-14.02 d=0.56
       Bsus4 t=14.02-17.41 d=3.39
         F#m t=17.41-20.83 d=3.41
       Dmaj7 t=20.83-23.64 d=2.81
       Asus4 t=23.64-25.91 d=2.28
        F#m7 t=25.91-27.61 d=1.70
       Esus4 t=27.61-34.39 d=6.78
          Bm t=34.39-35.53 d=1.14
        C#m7 t=35.53-36.66 d=1.14
       Esus4 t=36.66-37.83 d=1.16
           A t=37.83-38.38 d=0.56
       Asus2 t=38.38-40.05 d=1.67
         C#m t=40.05-40.61 d=0.56
       Bsus4 t=40.61-43.44 d=2.83
       Asus4 t=43.44-48.55 d=5.11
           A t=48.55-49.11 d=0.56
         C#m t=49.11-49.67 d=0.56
       Bsus4 t=49.67-52.50 d=2.83
       Asus4 t=52.50-57.61 d=5.11
           A t=57.61-58.17 d=0.56
         C#m t=58.17-59.30 d=1.14
       Bsus4 t=59.30-61.00 d=1.70
       Dmaj7 t=61.00-62.69 d=1.70
       Asus4 t=62.69-63.83 d=1.14
           A t=63.83-67.80 d=3.97
       Bsus4 t=67.80-70.05 d=2.25
       Dmaj7 t=70.05-71.75 d=1.70
       Asus2 t=71.75-73.47 d=1.72
       Esus4 t=73.47-74.05 d=0.58
           A t=74.05-76.28 d=2.23
        C#m7 t=76.28-76.86 d=0.58
       Esus4 t=76.86-78.00 d=1.14
           E t=78.00-79.11 d=1.11
          B7 t=79.11-79.67 d=0.56
       Asus4 t=79.67-84.75 d=5.09
        C#m7 t=84.75-85.89 d=1.14
       Bsus4 t=85.89-88.75 d=2.86
       Asus4 t=88.75-91.00 d=2.25
       Esus4 t=91.00-94.39 d=3.39
      C#sus4 t=94.39-95.53 d=1.14
       Bsus4 t=95.53-97.22 d=1.70
        C#m7 t=97.22-97.80 d=0.58
       Asus4 t=97.80-99.50 d=1.70
         Bm7 t=99.50-100.05 d=0.56
       Esus4 t=100.05-101.75 d=1.70
       Asus4 t=101.75-102.31 d=0.56
       Esus4 t=102.31-102.89 d=0.58
           A t=102.89-103.44 d=0.56
         C#m t=103.44-104.03 d=0.58
       Bsus4 t=104.03-106.86 d=2.83
       Asus4 t=106.86-111.94 d=5.09
           A t=111.94-112.50 d=0.56
         C#m t=112.50-113.08 d=0.58
       Bsus4 t=113.08-115.91 d=2.83
       Asus4 t=115.91-121.00 d=5.09
           A t=121.00-121.56 d=0.56
         C#m t=121.56-122.69 d=1.14
       Bsus4 t=122.69-124.39 d=1.70
       Dmaj7 t=124.39-126.11 d=1.72
       Asus4 t=126.11-127.22 d=1.11
           A t=127.22-130.61 d=3.39
      C#sus4 t=130.61-131.75 d=1.14
       Bsus4 t=131.75-133.45 d=1.70
       Dmaj7 t=133.45-135.16 d=1.72
       Asus4 t=135.16-135.72 d=0.56
       Bsus4 t=135.72-136.28 d=0.56
        F#m7 t=136.28-149.33 d=13.06
[0m
Let me examine the reference video to establish ground truth timing
[0m$ [0mcd /home/visiteur/piano-jazz-chords && ls -la /home/visiteur/2026-08-20\ 22-26-49.mkv && python3 -c "
from imageio_ffmpeg import get_ffmpeg_exe
import subprocess
ff = get_ffmpeg_exe()
def dur(p):
    r = subprocess.run([ff,'-i',p], capture_output=True, text=True)
    import re
    m = re.search(r'Duration:\s+(\d+):(\d+):([\d.]+)', r.stderr)
    if m:
        h,mm,s = m.groups()
        return int(h)*3600+int(mm)*60+float(s)
    return None
print('ref video dur:', dur('/home/visiteur/2026-08-20 22-26-49.mkv'))
print('wav dur:', dur('/tmp/local_piano3.wav'))
"
-rw-rw-r-- 1 visiteur visiteur 8288925 20 août  22:29 /home/visiteur/2026-08-20 22-26-49.mkv
ref video dur: 145.47
wav dur: 149.32999999999998
[0m
[0m$ [0mmkdir -p /tmp/opencode/ref_frames && cd /tmp/opencode/ref_frames && python3 -c "
from imageio_ffmpeg import get_ffmpeg_exe
import subprocess, math
ff = get_ffmpeg_exe()
for t in [2,6,8,12,16,20,24,28,32,36,40,44,48,52,56,60,64,68,72,76,80,84,88,92,96,100,104,108,112,116,120,124,128,132,136,140]:
    subprocess.run([ff,'-y','-ss',str(t),'-i','/home/visiteur/2026-08-20 22-26-49.mkv','-frames:v','1',f'f{t:03d}.png'],capture_output=True)
print('done')
" && ls
done
f002.png
f006.png
f008.png
f012.png
f016.png
f020.png
f024.png
f028.png
f032.png
f036.png
f040.png
f044.png
f048.png
f052.png
f056.png
f060.png
f064.png
f068.png
f072.png
f076.png
f080.png
f084.png
f088.png
f092.png
f096.png
f100.png
f104.png
f108.png
f112.png
f116.png
f120.png
f124.png
f128.png
f132.png
f136.png
f140.png
[0m
[0m$ [0mcd /tmp/opencode/ref_frames && python3 -c "
from PIL import Image
import glob
files = sorted(glob.glob('f0*.png'))
imgs = [Image.open(f) for f in files]
w,h = imgs[0].size
cols=4; rows=9
sheet = Image.new('RGB',(w*cols, h*rows),'black')
for i,im in enumerate(imgs):
    x=(i%cols)*w; y=(i//cols)*h
    sheet.paste(im,(x,y))
sheet.save('/tmp/opencode/ref_sheet.png')
print(sheet.size)
"
(5120, 6480)
[0m
[0m$ [0mcd /tmp/opencode/ref_frames && python3 -c "
from PIL import Image
im = Image.open('/tmp/opencode/ref_sheet.png')
im.save('/tmp/opencode/ref_sheet_small.jpg', quality=60)
print(im.size)
"
(5120, 6480)
[0m
[0m→ [0mRead /tmp/opencode/ref_frames/f012.png
I can't view images with this model. Let me try OCR to extract the chord labels from the reference
[0m
[0m$ [0mwhich tesseract || echo "no tesseract"; python3 -c "import pytesseract" 2>&1 | head -1
no tesseract
Traceback (most recent call last):
[0m
[0m$ [0msudo apt-get install -y tesseract-ocr 2>&1 | tail -2 || apt-get install -y tesseract-ocr 2>&1 | tail -2
sudo: un terminal est requis pour lire le mot de passe; utilisez soit l'option -S pour lire depuis l'entrée standard ou configurez un outil askpass de demande de mot de passe
sudo: il est nécessaire de saisir un mot de passe
[0m
[0m$ [0mpip install pytesseract 2>&1 | tail -1; ls /usr/bin | grep -i tesseract 2>/dev/null; apt list --installed 2>/dev/null | grep -i tesseract | head
hint: See PEP 668 for the detailed specification.
[0m
