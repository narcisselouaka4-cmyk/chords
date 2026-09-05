[0m
> build · glm-5.2
[0m
[0m$ [0mwc -l /home/visiteur/piano-jazz-chords/electron/audio-processor.py
2105 /home/visiteur/piano-jazz-chords/electron/audio-processor.py
[0m
[0m$ [0mls -la /tmp/local_analysis3_clean.json /tmp/local_piano3.wav 2>&1; echo "---"; ls /home/visiteur/piano-jazz-chords/electron/audio-processor.py
-rw-rw-r-- 1 visiteur visiteur    43957 20 août  22:23 /tmp/local_analysis3_clean.json
-rw-rw-r-- 1 visiteur visiteur 26342478 20 août  22:22 /tmp/local_piano3.wav
---
/home/visiteur/piano-jazz-chords/electron/audio-processor.py
[0m
[0m$ [0mpython3 -c "
import json
d = json.load(open('/tmp/local_analysis3_clean.json'))
print('Keys:', list(d.keys()))
print('BPM:', d.get('tempo'))
print('Key:', d.get('key'))
print('Num segments:', len(d.get('chords', [])))
print('First 30 segments:')
for c in d.get('chords', [])[:30]:
    print(f\"  {c.get('start',0):.2f} - {c.get('end',0):.2f} : {c.get('chord')}\")
"
Keys: ['duration', 'tempo', 'timeSignature', 'key', 'keyMode', 'keyConfidence', 'keyCandidates', 'confidence', 'chords', 'aggregation']
BPM: 53.8
Key: A
Num segments: 73
First 30 segments:
  0.00 - 0.00 : Dmaj7
  0.00 - 0.00 : Asus4
  0.00 - 0.00 : D
  0.00 - 0.00 : E
  0.00 - 0.00 : A
  0.00 - 0.00 : C#
  0.00 - 0.00 : A
  0.00 - 0.00 : Bsus4
  0.00 - 0.00 : F#m
  0.00 - 0.00 : Dmaj7
  0.00 - 0.00 : Asus4
  0.00 - 0.00 : F#m7
  0.00 - 0.00 : Esus4
  0.00 - 0.00 : Bm
  0.00 - 0.00 : C#m7
  0.00 - 0.00 : Esus4
  0.00 - 0.00 : A
  0.00 - 0.00 : Asus2
  0.00 - 0.00 : C#m
  0.00 - 0.00 : Bsus4
  0.00 - 0.00 : Asus4
  0.00 - 0.00 : A
  0.00 - 0.00 : C#m
  0.00 - 0.00 : Bsus4
  0.00 - 0.00 : Asus4
  0.00 - 0.00 : A
  0.00 - 0.00 : C#m
  0.00 - 0.00 : Bsus4
  0.00 - 0.00 : Dmaj7
  0.00 - 0.00 : Asus4
[0m
[0m$ [0mpython3 -c "
import json
d = json.load(open('/tmp/local_analysis3_clean.json'))
print('First chord full:', json.dumps(d['chords'][0], indent=2))
print('Aggregation:', json.dumps(d.get('aggregation'), indent=2))
"
First chord full: {
  "startTime": 0.0,
  "endTime": 6.943,
  "chord": "Dmaj7",
  "structural_chord": "Dmaj7",
  "confidence": 0.83,
  "observation_candidates": [
    {
      "chord": "Dmaj7",
      "emission_score": 0.764
    },
    {
      "chord": "Asus4",
      "emission_score": 0.744
    },
    {
      "chord": "Dsus2",
      "emission_score": 0.705
    }
  ],
  "viterbi_choice": "Dmaj7",
  "analysis": {},
  "techniques": [],
  "suggestions": [],
  "reharmonizations": [],
  "voiceLeading": {}
}
Aggregation: null
[0m
[0m$ [0mpython3 -c "
import json
d = json.load(open('/tmp/local_analysis3_clean.json'))
print('Real segments (with startTime):')
for c in d['chords']:
    if c.get('startTime',0) > 0 or c.get('endTime',0) > 0:
        print(f\"  {c.get('startTime',0):.2f} - {c.get('endTime',0):.2f} : {c.get('chord')} (conf {c.get('confidence',0):.2f})\")
"
Real segments (with startTime):
  0.00 - 6.94 : Dmaj7 (conf 0.83)
  6.94 - 8.08 : Asus4 (conf 0.92)
  8.08 - 8.64 : D (conf 0.83)
  8.64 - 9.20 : E (conf 0.77)
  9.20 - 12.89 : A (conf 0.99)
  12.89 - 13.47 : C# (conf 0.78)
  13.47 - 14.03 : A (conf 0.97)
  14.03 - 17.41 : Bsus4 (conf 0.94)
  17.41 - 20.83 : F#m (conf 0.91)
  20.83 - 23.64 : Dmaj7 (conf 0.86)
  23.64 - 25.91 : Asus4 (conf 0.92)
  25.91 - 27.61 : F#m7 (conf 0.88)
  27.61 - 34.39 : Esus4 (conf 0.96)
  34.39 - 35.53 : Bm (conf 0.91)
  35.53 - 36.66 : C#m7 (conf 0.88)
  36.66 - 37.83 : Esus4 (conf 0.95)
  37.83 - 38.38 : A (conf 0.87)
  38.38 - 40.05 : Asus2 (conf 0.92)
  40.05 - 40.61 : C#m (conf 0.85)
  40.61 - 43.45 : Bsus4 (conf 0.94)
  43.45 - 48.55 : Asus4 (conf 0.93)
  48.55 - 49.11 : A (conf 1.00)
  49.11 - 49.67 : C#m (conf 0.85)
  49.67 - 52.50 : Bsus4 (conf 0.94)
  52.50 - 57.61 : Asus4 (conf 0.93)
  57.61 - 58.17 : A (conf 1.00)
  58.17 - 59.30 : C#m (conf 0.92)
  59.30 - 61.00 : Bsus4 (conf 0.98)
  61.00 - 62.69 : Dmaj7 (conf 0.93)
  62.69 - 63.83 : Asus4 (conf 0.93)
  63.83 - 67.80 : A (conf 0.98)
  67.80 - 70.06 : Bsus4 (conf 0.93)
  70.06 - 71.75 : Dmaj7 (conf 0.93)
  71.75 - 73.47 : Asus2 (conf 0.96)
  73.47 - 74.05 : Esus4 (conf 0.97)
  74.05 - 76.28 : A (conf 0.95)
  76.28 - 76.86 : C#m7 (conf 1.00)
  76.86 - 78.00 : Esus4 (conf 0.97)
  78.00 - 79.11 : E (conf 1.00)
  79.11 - 79.67 : B7 (conf 0.82)
  79.67 - 84.75 : Asus4 (conf 0.92)
  84.75 - 85.89 : C#m7 (conf 1.00)
  85.89 - 88.75 : Bsus4 (conf 0.90)
  88.75 - 91.00 : Asus4 (conf 1.00)
  91.00 - 94.39 : Esus4 (conf 0.99)
  94.39 - 95.53 : C#sus4 (conf 0.99)
  95.53 - 97.22 : Bsus4 (conf 0.99)
  97.22 - 97.80 : C#m7 (conf 0.93)
  97.80 - 99.50 : Asus4 (conf 0.93)
  99.50 - 100.06 : Bm7 (conf 0.99)
  100.06 - 101.75 : Esus4 (conf 0.95)
  101.75 - 102.31 : Asus4 (conf 0.88)
  102.31 - 102.89 : Esus4 (conf 0.90)
  102.89 - 103.44 : A (conf 1.00)
  103.44 - 104.03 : C#m (conf 0.85)
  104.03 - 106.86 : Bsus4 (conf 0.94)
  106.86 - 111.94 : Asus4 (conf 0.93)
  111.94 - 112.50 : A (conf 1.00)
  112.50 - 113.08 : C#m (conf 0.85)
  113.08 - 115.91 : Bsus4 (conf 0.94)
  115.91 - 121.00 : Asus4 (conf 0.93)
  121.00 - 121.56 : A (conf 1.00)
  121.56 - 122.69 : C#m (conf 0.92)
  122.69 - 124.39 : Bsus4 (conf 0.98)
  124.39 - 126.11 : Dmaj7 (conf 0.93)
  126.11 - 127.22 : Asus4 (conf 0.93)
  127.22 - 130.61 : A (conf 1.00)
  130.61 - 131.75 : C#sus4 (conf 0.87)
  131.75 - 133.44 : Bsus4 (conf 0.98)
  133.44 - 135.16 : Dmaj7 (conf 0.93)
  135.16 - 135.72 : Asus4 (conf 0.90)
  135.72 - 136.28 : Bsus4 (conf 0.82)
  136.28 - 149.33 : F#m7 (conf 0.80)
[0m
[0m✱ [0mGrep "_merge_arpeggio_segments|def analyze_chords|def _post|def _aggregate|def _merge"[90m in electron/audio-processor.py · 9 matches[0m
[0m
[0m$ [0mls -la /home/visiteur/piano-jazz-chords/electron/audio-processor.py* 2>&1
-rw-rw-r-- 1 visiteur visiteur 83436 20 août  21:33 /home/visiteur/piano-jazz-chords/electron/audio-processor.py
-rw-rw-r-- 1 visiteur visiteur 51436  9 juil. 01:25 /home/visiteur/piano-jazz-chords/electron/audio-processor.py.current
-rw-rw-r-- 1 visiteur visiteur 51436  9 juil. 01:24 /home/visiteur/piano-jazz-chords/electron/audio-processor.py.new
-rw-rw-r-- 1 visiteur visiteur 53377  9 juil. 02:49 /home/visiteur/piano-jazz-chords/electron/audio-processor.py.regularized
[0m
[0m→ [0mRead electron/audio-processor.py[90m [offset=678, limit=240][0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=130, offset=1776][0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=200, offset=1905][0m
[0m✱ [0mGrep "_build_diatonic_roots|_parse_chord_label|_is_similar_quality|_pc_distance|CHORD_INTERVALS|_clean_segments|_downgrade_advanced_segments|_segment_path"[90m in electron/audio-processor.py · 72 matches[0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=60, offset=655][0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=60, offset=400][0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=220, offset=1128][0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=200, offset=1336][0m
Maintenant, je vais examiner le fichier de test déterministe et l'état actuel de l'exécution :
[0m→ [0mRead tests/test_harmonic_deterministic.py
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 tests/test_harmonic_deterministic.py 2>&1 | tail -30
zones=[('G', 0.0), ('Bsus4', 2.5), ('Bm', 3.0), ('Am', 3.5), ('G', 4.5), ('Bsus4', 7.0), ('Bm', 7.5), ('Am', 8.0)]
      FAIL: symbole interdit Bm présent 2 fois
        segs=['G', 'Bsus4', 'Bm', 'Am', 'G', 'Bsus4', 'Bm', 'Am']
      OK: symbole interdit Bm7 présent 0 fois
        segs=['G', 'Bsus4', 'Bm', 'Am', 'G', 'Bsus4', 'Bm', 'Am']
      FAIL: symbole interdit Bsus4 présent 2 fois
        segs=['G', 'Bsus4', 'Bm', 'Am', 'G', 'Bsus4', 'Bm', 'Am']
      OK: symbole interdit Em7 présent 0 fois
        segs=['G', 'Bsus4', 'Bm', 'Am', 'G', 'Bsus4', 'Bm', 'Am']
  FAIL Q: pédale G + mélodie E-C-F-D-B (chroma synthétique)
    FAIL: nombre exact de zones : attendu 1, obtenu 13
    FAIL: zone 0 (attendu G suffixe |maj7 @ beat 0±2) : fondamentale E non admissible, obtenu Em
    FAIL: zone 0 (attendu G suffixe |maj7 @ beat 0±2) : suffixe "m" non admissible pour Em
    FAIL: zones supplémentaires non autorisées : ['Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']
      n_segs=13 segs=[('Em', 0.0, 0.5), ('Gsus4', 0.5, 1.0), ('Fsus2', 1.0, 1.5), ('G', 1.5, 2.5), ('Em', 2.5, 3.0), ('Gsus4', 3.0, 4.0), ('Em', 4.0, 4.5), ('Gsus4', 4.5, 5.0), ('Fsus2', 5.0, 5.5), ('G', 5.5, 6.5), ('Em', 6.5, 7.0), ('Gsus4', 7.0, 7.5), ('Fsus2', 7.5, 8.0)]
      FAIL: nombre exact de zones : attendu 1, obtenu 13
      FAIL: zone 0 (attendu G suffixe |maj7 @ beat 0±2) : fondamentale E non admissible, obtenu Em
        segs=[('Em', 0.0), ('Gsus4', 0.5), ('Fsus2', 1.0), ('G', 1.5), ('Em', 2.5), ('Gsus4', 3.0), ('Em', 4.0), ('Gsus4', 4.5), ('Fsus2', 5.0), ('G', 5.5), ('Em', 6.5), ('Gsus4', 7.0), ('Fsus2', 7.5)]
      FAIL: zone 0 (attendu G suffixe |maj7 @ beat 0±2) : suffixe "m" non admissible pour Em
      OK: zone 0 (attendu G suffixe |maj7 @ beat 0±2) : frontière attendue 0.00s±1.00s, obtenue 0.00s
      FAIL: zones supplémentaires non autorisées : ['Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']
        zones=[('Em', 0.0), ('Gsus4', 0.5), ('Fsus2', 1.0), ('G', 1.5), ('Em', 2.5), ('Gsus4', 3.0), ('Em', 4.0), ('Gsus4', 4.5), ('Fsus2', 5.0), ('G', 5.5), ('Em', 6.5), ('Gsus4', 7.0), ('Fsus2', 7.5)]
      OK: symbole interdit Gm7 présent 0 fois
        segs=['Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']
      OK: symbole interdit Dsus4 présent 0 fois
        segs=['Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']
      OK: symbole interdit Gm présent 0 fois
        segs=['Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Em', 'Gsus4', 'Fsus2', 'G', 'Em', 'Gsus4', 'Fsus2']

=== 14/17 passés, 3 échoués ===
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 tests/test_harmonic_deterministic.py --verbose 2>&1 | grep -E "FAIL [A-Q]" | head -20
FAIL L: walking bass interne à Cmaj7 (chroma synthétique)
  FAIL P: cellule réelle G/B + B-D-E + Am (chroma synthétique)
  FAIL Q: pédale G + mélodie E-C-F-D-B (chroma synthétique)
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 tests/test_harmonic_deterministic.py --verbose 2>&1 | grep -A 30 "FAIL L:"
FAIL L: walking bass interne à Cmaj7 (chroma synthétique)
    FAIL: nombre exact de zones : attendu 1, obtenu 8
    FAIL: zones supplémentaires non autorisées : ['Em', 'C', 'Em', 'C', 'Em', 'C', 'Em']
      n_segs=8 segs=[('C', 0.0, 0.5), ('Em', 0.5, 2.0), ('C', 2.0, 2.5), ('Em', 2.5, 4.0), ('C', 4.0, 4.5), ('Em', 4.5, 6.0), ('C', 6.0, 6.5), ('Em', 6.5, 8.0)]
      FAIL: nombre exact de zones : attendu 1, obtenu 8
      OK: zone 0 (attendu C suffixe |maj7 @ beat 0±2) : fondamentale C non admissible, obtenu C
        segs=[('C', 0.0), ('Em', 0.5), ('C', 2.0), ('Em', 2.5), ('C', 4.0), ('Em', 4.5), ('C', 6.0), ('Em', 6.5)]
      OK: zone 0 (attendu C suffixe |maj7 @ beat 0±2) : suffixe "" non admissible pour C
      OK: zone 0 (attendu C suffixe |maj7 @ beat 0±2) : frontière attendue 0.00s±1.00s, obtenue 0.00s
      FAIL: zones supplémentaires non autorisées : ['Em', 'C', 'Em', 'C', 'Em', 'C', 'Em']
        zones=[('C', 0.0), ('Em', 0.5), ('C', 2.0), ('Em', 2.5), ('C', 4.0), ('Em', 4.5), ('C', 6.0), ('Em', 6.5)]
  PASS M: Csus4→C (chroma synthétique)
      n_segs=2 segs=[('Csus4', 0.0, 1.0), ('C', 1.0, 2.0)]
      OK: nombre exact de zones : attendu 2, obtenu 2
      OK: zone 0 (attendu C suffixe sus2|sus4 @ beat 0±2) : fondamentale C non admissible, obtenu Csus4
        segs=[('Csus4', 0.0), ('C', 1.0)]
      OK: zone 0 (attendu C suffixe sus2|sus4 @ beat 0±2) : suffixe "sus4" non admissible pour Csus4
      OK: zone 0 (attendu C suffixe sus2|sus4 @ beat 0±2) : frontière attendue 0.00s±1.00s, obtenue 0.00s
      OK: zone 1 (attendu C suffixe |maj7 @ beat 2±1) : fondamentale C non admissible, obtenu C
        segs=[('Csus4', 0.0), ('C', 1.0)]
      OK: zone 1 (attendu C suffixe |maj7 @ beat 2±1) : suffixe "" non admissible pour C
      OK: zone 1 (attendu C suffixe |maj7 @ beat 2±1) : frontière attendue 1.00s±0.50s, obtenue 1.00s
      OK: symbole interdit Fsus2 présent 0 fois
        segs=['Csus4', 'C']
  PASS N: arpège incomplet C-G-B sans tierce (chroma synthétique)
      n_segs=1 segs=[('Cmaj7', 0.0, 2.0)]
      OK: nombre exact de zones : attendu 1, obtenu 1
      OK: zone 0 (attendu C suffixe |maj7|sus2 @ beat 0±2) : fondamentale C non admissible, obtenu Cmaj7
        segs=[('Cmaj7', 0.0)]
      OK: zone 0 (attendu C suffixe |maj7|sus2 @ beat 0±2) : suffixe "maj7" non admissible pour Cmaj7
      OK: zone 0 (attendu C suffixe |maj7|sus2 @ beat 0±2) : frontière attendue 0.00s±1.00s, obtenue 0.00s
[0m
Je vais exécuter l'analyse de référence pour confirmer l'état actuel :
[0m$ [0mcd /home/visiteur/piano-jazz-chords && time python3 -c "
import json, importlib.util
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
result = ap.analyze_chords('/tmp/local_piano3.wav')
print(json.dumps(result, indent=2, ensure_ascii=False))
" > /tmp/local_analysis3_before.json 2>/tmp/before_err.log; echo "exit=$?"; tail -5 /tmp/before_err.log; python3 -c "
import json
d=json.load(open('/tmp/local_analysis3_before.json'))
print('Key:', d['key'], 'BPM:', d['tempo'], 'Num segs:', len(d['chords']))
for c in d['chords']:
    print(f\"  {c['startTime']:.2f}-{c['endTime']:.2f} : {c['chord']}\")
"
real	0m40,073s
user	0m37,103s
sys	0m2,413s
exit=0
Traceback (most recent call last):
  File "<string>", line 3, in <module>
    d=json.load(open('/tmp/local_analysis3_before.json'))
  File "/usr/lib/python3.13/json/__init__.py", line 293, in load
    return loads(fp.read(),
        cls=cls, object_hook=object_hook,
        parse_float=parse_float, parse_int=parse_int,
        parse_constant=parse_constant, object_pairs_hook=object_pairs_hook, **kw)
  File "/usr/lib/python3.13/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ~~~~~~~~~~~~~~~~~~~~~~~^^^
  File "/usr/lib/python3.13/json/decoder.py", line 345, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.13/json/decoder.py", line 363, in raw_decode
    raise JSONDecodeError("Expecting value", s, err.value) from None
json.decoder.JSONDecodeError: Expecting value: line 1 column 2 (char 1)
[0m
[0m$ [0mhead -5 /tmp/local_analysis3_before.json; echo "---"; wc -l /tmp/local_analysis3_before.json; echo "--- last logs:"; tail -20 /tmp/before_err.log
[AudioProcessor] analyzing chords from /tmp/local_piano3.wav (mode=legacy, obs=baseline)
[AudioProcessor] chord analysis done: 73 segments, key=A, tempo=53.8
{
  "duration": 149.333,
  "tempo": 53.8,
---
2017 /tmp/local_analysis3_before.json
--- last logs:
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
with contextlib.redirect_stdout(io.StringIO()):
    result = ap.analyze_chords('/tmp/local_piano3.wav')
print(json.dumps(result, indent=2, ensure_ascii=False))
" > /tmp/local_analysis3_before.json 2>/tmp/before_err.log; echo "exit=$?"; python3 -c "
import json
d=json.load(open('/tmp/local_analysis3_before.json'))
print('Key:', d['key'], 'BPM:', d['tempo'], 'Num segs:', len(d['chords']))
for c in d['chords']:
    print(f\"  {c['startTime']:.2f}-{c['endTime']:.2f} : {c['chord']}\")
"
exit=0
Key: A BPM: 53.8 Num segs: 73
  0.00-6.94 : Dmaj7
  6.94-8.08 : Asus4
  8.08-8.64 : D
  8.64-9.20 : E
  9.20-12.89 : A
  12.89-13.47 : C#
  13.47-14.03 : A
  14.03-17.41 : Bsus4
  17.41-20.83 : F#m
  20.83-23.64 : Dmaj7
  23.64-25.91 : Asus4
  25.91-27.61 : F#m7
  27.61-34.39 : Esus4
  34.39-35.53 : Bm
  35.53-36.66 : C#m7
  36.66-37.83 : Esus4
  37.83-38.38 : A
  38.38-40.05 : Asus2
  40.05-40.61 : C#m
  40.61-43.45 : Bsus4
  43.45-48.55 : Asus4
  48.55-49.11 : A
  49.11-49.67 : C#m
  49.67-52.50 : Bsus4
  52.50-57.61 : Asus4
  57.61-58.17 : A
  58.17-59.30 : C#m
  59.30-61.00 : Bsus4
  61.00-62.69 : Dmaj7
  62.69-63.83 : Asus4
  63.83-67.80 : A
  67.80-70.06 : Bsus4
  70.06-71.75 : Dmaj7
  71.75-73.47 : Asus2
  73.47-74.05 : Esus4
  74.05-76.28 : A
  76.28-76.86 : C#m7
  76.86-78.00 : Esus4
  78.00-79.11 : E
  79.11-79.67 : B7
  79.67-84.75 : Asus4
  84.75-85.89 : C#m7
  85.89-88.75 : Bsus4
  88.75-91.00 : Asus4
  91.00-94.39 : Esus4
  94.39-95.53 : C#sus4
  95.53-97.22 : Bsus4
  97.22-97.80 : C#m7
  97.80-99.50 : Asus4
  99.50-100.06 : Bm7
  100.06-101.75 : Esus4
  101.75-102.31 : Asus4
  102.31-102.89 : Esus4
  102.89-103.44 : A
  103.44-104.03 : C#m
  104.03-106.86 : Bsus4
  106.86-111.94 : Asus4
  111.94-112.50 : A
  112.50-113.08 : C#m
  113.08-115.91 : Bsus4
  115.91-121.00 : Asus4
  121.00-121.56 : A
  121.56-122.69 : C#m
  122.69-124.39 : Bsus4
  124.39-126.11 : Dmaj7
  126.11-127.22 : Asus4
  127.22-130.61 : A
  130.61-131.75 : C#sus4
  131.75-133.44 : Bsus4
  133.44-135.16 : Dmaj7
  135.16-135.72 : Asus4
  135.72-136.28 : Bsus4
  136.28-149.33 : F#m7
[0m
Je vais examiner les CHORD_TEMPLATES et comprendre la structure des états :
[0m→ [0mRead electron/audio-processor.py[90m [limit=75, offset=280][0m
[0m✱ [0mGrep "_build_chord_states|def _compute_observation_scores|def _initial_scores|ADVANCED_SUFFIXES|SIMPLE_TRIAD_FOR_SUFFIX|QUALITY_FAMILIES|ENABLE_CHORD_DOWNGRADE"[90m in electron/audio-processor.py · 44 matches[0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=90, offset=370][0m
Laissez-moi examiner les étapes de l'analyse avec debug :
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    result = ap.analyze_chords('/tmp/local_piano3.wav', debug=True)
logs = buf.getvalue()
# print stage logs
for line in logs.splitlines():
    if 'SEG STAGE' in line or 'after ' in line:
        print(line)
print('=== FINAL ===')
print('Num segs:', len(result['chords']))
" 2>&1 | head -50
[DEBUG] after Viterbi + segment_path:
[DEBUG] after _merge_similar_segments:
[DEBUG] after _merge_arpeggio_segments:
[DEBUG] after _downgrade_advanced_segments:
[DEBUG] after _clean_segments:
=== FINAL ===
Num segs: 73
[0m
[0m✱ [0mGrep "_log_seg_stage|def _log"[90m in electron/audio-processor.py · 6 matches[0m
[0m→ [0mRead electron/audio-processor.py[90m [limit=60, offset=1639][0m
Je vais maintenant exécuter l'analyse en mode debug pour voir le compte de segmentation à chaque étape :
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    result = ap.analyze_chords('/tmp/local_piano3.wav', debug=True)
logs = buf.getvalue()
for line in logs.splitlines():
    if '[DEBUG]' in line and ('count=' in line or 'after ' in line):
        print(line)
"
[DEBUG] after Viterbi + segment_path:
[DEBUG] after _merge_similar_segments:
[DEBUG] after _merge_arpeggio_segments:
[DEBUG] after _downgrade_advanced_segments:
[DEBUG] after _clean_segments:
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    result = ap.analyze_chords('/tmp/local_piano3.wav', debug=True)
logs = buf.getvalue()
for line in logs.splitlines():
    if '[DEBUG]' in line:
        print(line)
"
[DEBUG] after Viterbi + segment_path:
[DEBUG] after _merge_similar_segments:
[DEBUG] after _merge_arpeggio_segments:
[DEBUG] after _downgrade_advanced_segments:
[DEBUG] after _clean_segments:
[0m
Hmm, la sortie de débogage est incomplète. Laissez-moi vérifier :
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    result = ap.analyze_chords('/tmp/local_piano3.wav', debug=True)
logs = buf.getvalue()
import sys
sys.stderr.write(logs[:3000]+'\n---END---\n')
sys.stderr.write('LEN: '+str(len(logs))+'\n')
" 2>&1 | head -60
[AudioProcessor] analyzing chords from /tmp/local_piano3.wav (mode=legacy, obs=baseline)
[DEBUG] after Viterbi + segment_path:
        count=134, total_dur=149.33s, avg=1.114s
        min=0.557s, max=13.055s
        <0.4s=0
        <0.6s=88
        same_root_diff_quality_adjacent=8
               Am7b5  t=0.0s  dur=4.110s  conf=0.877
              C#sus4  t=4.1s  dur=0.557s  conf=0.797
               Asus4  t=4.7s  dur=1.138s  conf=0.949
                   D  t=5.8s  dur=1.138s  conf=0.942
               Asus4  t=6.9s  dur=0.580s  conf=0.921
          ... (+129)
[DEBUG] after _merge_similar_segments:
        count=127, total_dur=149.33s, avg=1.176s
        min=0.557s, max=13.055s
        <0.4s=0
        <0.6s=79
        same_root_diff_quality_adjacent=1
               Am7b5  t=0.0s  dur=4.110s  conf=0.877
              C#sus4  t=4.1s  dur=0.557s  conf=0.797
               Asus4  t=4.7s  dur=1.138s  conf=0.949
                   D  t=5.8s  dur=1.138s  conf=0.942
               Asus4  t=6.9s  dur=1.138s  conf=0.921
          ... (+122)
[DEBUG] after _merge_arpeggio_segments:
        count=73, total_dur=149.33s, avg=2.046s
        min=0.557s, max=13.055s
        <0.4s=0
        <0.6s=23
        same_root_diff_quality_adjacent=8
               Dmaj7  t=0.0s  dur=6.943s  conf=0.830
               Asus4  t=6.9s  dur=1.138s  conf=0.921
                   D  t=8.1s  dur=0.557s  conf=0.835
                   E  t=8.6s  dur=0.557s  conf=0.773
                   A  t=9.2s  dur=3.692s  conf=0.992
          ... (+68)
[DEBUG] after _downgrade_advanced_segments:
        count=73, total_dur=149.33s, avg=2.046s
        min=0.557s, max=13.055s
        <0.4s=0
        <0.6s=23
        same_root_diff_quality_adjacent=8
               Dmaj7  t=0.0s  dur=6.943s  conf=0.830
               Asus4  t=6.9s  dur=1.138s  conf=0.921
                   D  t=8.1s  dur=0.557s  conf=0.835
                   E  t=8.6s  dur=0.557s  conf=0.773
                   A  t=9.2s  dur=3.692s  conf=0.992
          ... (+68)
[DEBUG] after _clean_segments:
        count=73, total_dur=149.33s, avg=2.046s
        min=0.557s, max=13.055s
        <0.4s=0
        <0.6s=23
        same_root_diff_quality_adjacent=8
               Dmaj7  t=0.0s  dur=6.943s  conf=0.830
               Asus4  t=6.9s  dur=1.138s  conf=0.921
                   D  t=8.1s  dur=0.557s  conf=0.835
                   E  t=8.6s  dur=0.557s  conf=0.773
                   A  t=9.2s  dur=3.692s  conf=0.992
[0m
Je vais examiner les étapes de mise à niveau (downgrade) plus en détail :
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

# Replicate pipeline up to each stage
import numpy as np
y, sr = __import__('librosa').load('/tmp/local_piano3.wav', sr=22050, mono=True)
duration = float(len(y)/sr)
hop_length = 512
tempo, beat_frames = ap._beat_track(y, sr, hop_length=hop_length)
beat_frames = np.atleast_1d(beat_frames)
if len(beat_frames)==0 or beat_frames[0]!=0:
    beat_frames = np.concatenate(([0], beat_frames))
beat_times = __import__('librosa').frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
ibis = np.diff(beat_times)
median_ibi = float(np.median(ibis))
avg_tempo = 60.0/median_ibi if median_ibi>0 else tempo
avg_tempo = ap._resolve_tempo(y, sr, avg_tempo)
key, _ = ap.detect_key(y, sr)
y_harm, _ = __import__('librosa').effects.hpss(y, margin=8.0)
chroma = __import__('librosa').feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length, bins_per_octave=36)
n_frames = chroma.shape[1]
K = len(beat_frames)
beat_chroma = np.zeros((12, K), dtype=np.float32)
frame_energies = np.zeros(K, dtype=np.float32)
for k in range(K):
    sf = int(beat_frames[k]); ef = int(beat_frames[k+1]) if k+1<K else n_frames
    if ef<=sf:
        beat_chroma[:,k]=0.0; frame_energies[k]=0.0
    else:
        beat_chroma[:,k]=np.mean(chroma[:,sf:ef],axis=1); frame_energies[k]=float(np.sum(beat_chroma[:,k]))
states = ap._build_chord_states('baseline', 0.10)
obs_scores = ap._compute_observation_scores(beat_chroma, states, key, frame_energies)
obs_scores[0] += ap._initial_scores(states, key)
obs_scores = np.clip(obs_scores, 0.0, 1.0)
trans = ap._build_transition_matrix(states, key)
path = ap._viterbi(obs_scores, trans)
segs = ap._segment_path(path, beat_times, duration, states, obs_scores)
segs = ap._merge_similar_segments(list(segs))
segs_arp = ap._merge_arpeggio_segments(list(segs), beat_chroma, states, key, obs_scores=obs_scores)
segs_down = ap._downgrade_advanced_segments([dict(s) for s in segs_arp], beat_chroma, states, threshold=0.03, mode='hybrid')
print('After arpeggio:')
print([s['chord'] for s in segs_arp])
print('After downgrade:')
print([s['chord'] for s in segs_down])
print('Diff positions:')
for i,(a,b) in enumerate(zip(segs_arp, segs_down)):
    if a['chord']!=b['chord']:
        print(f'  {i}: {a[\"chord\"]} -> {b[\"chord\"]}')
" 2>&1 | tail -30
After arpeggio:
['Dmaj7', 'Asus4', 'D', 'E', 'A', 'C#', 'A', 'Bsus4', 'F#m', 'Dmaj7', 'Asus4', 'F#m7', 'Esus4', 'Bm', 'C#m7', 'Esus4', 'Asus4', 'Asus2', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Dmaj7', 'Asus4', 'A', 'Bsus4', 'Dmaj7', 'Asus2', 'Esus4', 'A', 'C#m7', 'Esus4', 'E', 'B7', 'Asus4', 'C#m7', 'Bsus4', 'Asus4', 'Esus4', 'C#sus4', 'Bsus4', 'C#m7', 'Asus4', 'Bm7', 'Esus4', 'Asus4', 'Esus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Dmaj7', 'Asus4', 'A', 'C#sus4', 'Bsus4', 'Dmaj7', 'Asus4', 'Bsus4', 'F#m7']
After downgrade:
['Dmaj7', 'Asus4', 'D', 'E', 'A', 'C#', 'A', 'Bsus4', 'F#m', 'Dmaj7', 'Asus4', 'F#m7', 'Esus4', 'Bm', 'C#m7', 'Esus4', 'A', 'Asus2', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Dmaj7', 'Asus4', 'A', 'Bsus4', 'Dmaj7', 'Asus2', 'Esus4', 'A', 'C#m7', 'Esus4', 'E', 'B7', 'Asus4', 'C#m7', 'Bsus4', 'Asus4', 'Esus4', 'C#sus4', 'Bsus4', 'C#m7', 'Asus4', 'Bm7', 'Esus4', 'Asus4', 'Esus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Asus4', 'A', 'C#m', 'Bsus4', 'Dmaj7', 'Asus4', 'A', 'C#sus4', 'Bsus4', 'Dmaj7', 'Asus4', 'Bsus4', 'F#m7']
Diff positions:
  16: Asus4 -> A
[0m
Je vais analyser les durées des fondamentales sur la timeline réelle :
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json
d = json.load(open('/tmp/local_analysis3_before.json'))
root_durs = {}
for c in d['chords']:
    name = c['chord']
    import re
    m = re.match(r'^([A-G][#b]?)(.*)$', name)
    if not m: continue
    root = m.group(1)
    dur = c['endTime'] - c['startTime']
    root_durs[root] = root_durs.get(root, 0.0) + dur
total = sum(root_durs.values())
print('Roots sorted by total duration:')
for r, dur in sorted(root_durs.items(), key=lambda x: -x[1]):
    print(f'  {r}: {dur:.2f}s ({dur/total*100:.1f}%)')
print(f'Total: {total:.2f}s')
"
Roots sorted by total duration:
  A: 56.77s (38.0%)
  B: 29.42s (19.7%)
  F#: 18.16s (12.2%)
  D: 17.14s (11.5%)
  E: 17.00s (11.4%)
  C#: 10.84s (7.3%)
Total: 149.33s
[0m
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import json
d = json.load(open('/tmp/local_analysis3_before.json'))
# View the (root, suffix) distribution
import re
from collections import defaultdict
counts = defaultdict(lambda: {'count':0, 'dur':0.0})
for c in d['chords']:
    m = re.match(r'^([A-G][#b]?)(.*)$', c['chord'])
    root = m.group(1); sfx = m.group(2)
    dur = c['endTime'] - c['startTime']
    counts[(root, sfx)]['count'] += 1
    counts[(root, sfx)]['dur'] += dur
print('Full chord distribution (count, total dur):')
for k, v in sorted(counts.items(), key=lambda x: -x[1]['dur']):
    print(f'  {k[0]}{k[1]:6s}: count={v[\"count\"]:3d} dur={v[\"dur\"]:.2f}s')
"
Full chord distribution (count, total dur):
  Asus4  : count= 13 dur=36.20s
  Bsus4  : count= 12 dur=27.17s
  A      : count= 11 dur=17.18s
  Dmaj7  : count=  6 dur=16.58s
  Esus4  : count=  7 dur=15.32s
  F#m7    : count=  2 dur=14.75s
  C#m     : count=  6 dur=4.55s
  C#m7    : count=  4 dur=3.44s
  F#m     : count=  1 dur=3.41s
  Asus2  : count=  2 dur=3.39s
  C#sus4  : count=  2 dur=2.28s
  E      : count=  2 dur=1.67s
  Bm     : count=  1 dur=1.14s
  C#      : count=  1 dur=0.58s
  B7     : count=  1 dur=0.56s
  Bm7    : count=  1 dur=0.56s
  D      : count=  1 dur=0.56s
[0m
Je vais examiner la sortie de débogage pour le test L :
[0m$ [0mcd /home/visiteur/piano-jazz-chords && python3 -c "
import sys, os, importlib.util, numpy as np
sys.path.insert(0, 'electron')
sys.path.insert(0, 'tests')
from test_harmonic_deterministic import *

# Test L
specs = build_all_specs()
spec = specs[11]  # L is 12th (0-indexed: 11)
print('Spec:', spec.name, spec.description)

beat_chroma = make_beat_chroma(spec.beats_content)
energies = make_frame_energies(spec.beats_content)
r = run_pipeline(beat_chroma, energies, key_pc=spec.key_pc)
print('segs (after Viterbi):')
for s in r['segs']:
    print(' ', s['chord'], round(s['startTime'],2), round(s['endTime'],2))
print('segs_merged:')
for s in r['segs_merged']:
    print(' ', s['chord'], round(s['startTime'],2), round(s['endTime'],2))
print('segs_arpeggio:')
for s in r['segs_arpeggio']:
    print(' ', s['chord'], round(s['startTime'],2), round(s['endTime'],2))
print('segs_final:')
for s in r['segs_final']:
    print(' ', s['chord'], round(s['startTime'],2), round(s['endTime'],2))
" 2>&1 | tail -50
Spec: L walking bass interne à Cmaj7 (chroma synthétique)
segs (after Viterbi):
  C 0.0 0.5
  Em 0.5 2.0
  C 2.0 2.5
  Em 2.5 4.0
  C 4.0 4.5
  Em 4.5 6.0
  C 6.0 6.5
  Em 6.5 8.0
segs_merged:
  C 0.0 0.5
  Em 0.5 2.0
  C 2.0 2.5
  Em 2.5 4.0
  C 4.0 4.5
  Em 4.5 6.0
  C 6.0 6.5
  Em 6.5 8.0
segs_arpeggio:
  C 0.0 0.5
  Em 0.5 2.0
  C 2.0 2.5
  Em 2.5 4.0
  C 4.0 4.5
  Em 4.5 6.0
  C 6.0 6.5
  Em 6.5 8.0
segs_final:
  C 0.0 0.5
  Em 0.5 2.0
  C 2.0 2.5
  Em 2.5 4.0
  C 4.0 4.5
  Em 4.5 6.0
  C 6.0 6.5
  Em 6.5 8.0
[0m
