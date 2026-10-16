# Finaliser couverture descripteurs Increment 8

**Session ID:** ses_022f9c2b0ffe0P1cEIHmfJQLPz
**Created:** 8/7/2026, 6:20:01 PM
**Updated:** 8/7/2026, 6:36:36 PM

---

## User

Finalise uniquement la dernière lacune de couverture de l’Incrément 8 à partir du HEAD annoncé :

```text
4dfe085ec59478caf0ab048eadc73b51194266c4
```

Ne commence pas l’Incrément 9.

Seul fichier du dépôt autorisé :

```text
src/melody/test-harmonization-planner.js
```

Ne modifie aucun moteur de production, fichier amont, fichier de configuration ou dépendance. Aucun amend, aucune réécriture d’historique et aucun push.

==================================================

1. VÉRIFICATION GIT INITIALE OBLIGATOIRE
   ==================================================

Exécute et conserve les sorties brutes :

```bash
cd /home/visiteur/piano-jazz-chords

git rev-parse HEAD
git status --short
git diff --name-status
git diff --cached --name-status
git diff -- src/melody/test-harmonization-planner.js
git diff --cached -- src/melody/test-harmonization-planner.js
```

Le HEAD attendu est exactement :

```text
4dfe085ec59478caf0ab048eadc73b51194266c4
```

Le précédent rapport affirme que le statut final contenait :

```text
M  src/melody/test-harmonization-planner.js
```

Dans `git status --short`, cela désigne normalement une modification staged, pas un fichier simplement commité.

Si `src/melody/test-harmonization-planner.js` possède réellement une modification staged ou non committée au démarrage :

* ne l’écrase pas ;
* ne la désindexe pas ;
* ne commit rien ;
* arrête-toi en fournissant le diff brut exact.

Les changements non liés dans d’autres fichiers peuvent rester présents, mais ne doivent jamais être modifiés ni staged.

==================================================
2. T11 — COMPARAISON EXACTE DES DESCRIPTEURS
============================================

La version actuelle utilise bien `Reflect.ownKeys()`, mais ne mémorise pas les descripteurs complets.

Pour une propriété de données, elle ne conserve actuellement que :

```js
{ type: 'data', value, isObject }
```

Pour un accesseur, elle ne conserve que :

```js
{ type: 'accessor' }
```

Cela laisse passer silencieusement des modifications de :

* `enumerable` ;
* `configurable` ;
* `writable` ;
* la référence exacte du getter ;
* la référence exacte du setter.

Corrige `captureGraph()` et `assertGraphUnchanged()`.

Pour chaque propriété de données, mémorise et compare exactement :

```text
type
value
writable
enumerable
configurable
```

Pour chaque accesseur, mémorise et compare exactement :

```text
type
get
set
enumerable
configurable
```

Contraintes :

* utiliser `Reflect.ownKeys()` ;
* conserver les symboles comme clés réelles ;
* utiliser de préférence un `Map` pour les snapshots de propriétés ;
* ne déclencher aucun getter ;
* conserver les références exactes des valeurs objets ;
* vérifier la référence exacte de la racine ;
* vérifier `Object.isFrozen()` ;
* vérifier l’ordre exact des clés propres ;
* parcourir récursivement les valeurs de données qui sont des objets ou fonctions ;
* gérer les cycles et références partagées avec `WeakMap` ou `WeakSet` ;
* couvrir automatiquement `length`, les index et l’ordre des tableaux.

==================================================
3. PREUVE QUE LE HELPER DÉTECTE CES MUTATIONS
=============================================

Dans T11, ajoute des contrôles synthétiques internes, sans créer un nouveau test public, prouvant que le helper échoue réellement lorsque seul un descripteur change.

Couvrir au minimum :

1. propriété non énumérable dont seul `writable` ou `enumerable` change ;
2. propriété portée par un symbole ;
3. accesseur dont le getter est remplacé par une autre fonction ;
4. tableau dont `length` ou l’ordre des éléments change ;
5. preuve qu’aucun getter n’a été exécuté pendant la capture ou la vérification.

Conserve ensuite la vérification complète du véritable graphe :

```js
const input = { track, harmonicContext: ctx };
```

Le planificateur ne doit avoir modifié aucune référence, valeur, clé, propriété, descripteur ou état de gel.

==================================================
4. T13 — CONTRAT RÉEL, SANS CAS IMPOSSIBLE
==========================================

Ne recrée pas le cas d’ancre invalide avec identifiant non vide.

Le contrat observé indique que `invalid-anchor` n’est produit que par :

```js
!anchor || !anchor.id
```

Il est donc impossible d’obtenir simultanément :

```text
status === 'invalid-anchor'
```

et un identifiant réel non vide à inclure dans le message.

Conserve cette conclusion comme limitation canonique du contrat, mais remplace la référence fragile à un numéro de ligne fixe par une explication fondée sur la condition réelle.

Pour l’ancre sans identifiant, ajoute si nécessaire la preuve directe :

```js
const directResult = generateChordCandidatesForAnchor({
  anchor: badAnchor,
  track,
  harmonicContext: invalidCtx,
});

assertEqual(directResult.status, 'invalid-anchor');
```

Conserve :

* `TypeError` du planificateur ;
* indice `0` dans le message ;
* mention d’ancre invalide ;
* statut exact `no-valid-candidate` pour l’ancre valide sans candidat ;
* `RangeError` ;
* identifiant canonique dans ce second message ;
* absence de plan partiel.

Dans l’audit final, inclus la sortie brute de :

```bash
rg -n -C 6 "invalid-anchor|!anchor\\.id" \
  src/melody/chord-candidate-generator.js
```

Cette preuve remplace définitivement l’exigence impossible.

==================================================
5. VALIDATIONS COMPLÈTES
========================

Exécute dans cet ordre :

```bash
node src/melody/test-harmonization-planner.js
node src/melody/test-voicing-path-finder.js
node src/melody/test-harmonic-path-finder.js
node src/melody/test-transition-score.js
node src/melody/test-chord-candidates.js
node src/melody/test-spelled-pitch.js
node src/melody/test-tonal-harmonic.js
node src/melody/test-melody-track.js
node src/melody/test-midi-capture.js
npm run test:chords
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
npm run build
```

Puis :

```bash
git diff --check -- src/melody/test-harmonization-planner.js
git status --short
git diff --cached --name-only
```

Si une validation échoue :

* corrige uniquement le fichier autorisé ;
* relance toute la chaîne depuis le début ;
* ne commit rien tant qu’une commande échoue.

==================================================
6. COMMIT
=========

Si et seulement si toutes les validations passent :

```bash
git add -- src/melody/test-harmonization-planner.js

git diff --cached --check
git diff --cached --name-only
git diff --cached --stat
git status --short
```

Vérifie que seul le fichier autorisé est staged.

Crée un unique nouveau commit :

```bash
git commit -m "test: verify harmonization input descriptors"
```

Après le commit, exécute :

```bash
git diff-tree --no-commit-id --name-status -r HEAD
git rev-parse HEAD
git log -1 --oneline
git status --short
git diff --cached --name-only
git diff --name-only -- src/melody/test-harmonization-planner.js
git diff --cached --name-only -- src/melody/test-harmonization-planner.js
```

Après le commit :

* `git diff --cached --name-only` doit être vide ;
* le fichier du planificateur ne doit apparaître dans aucun diff ;
* des changements préexistants non liés peuvent rester visibles dans le statut.

==================================================
7. AUDIT FINAL AUTOPORTANT
==========================

Crée :

```text
/home/visiteur/increment-8-descriptor-audit.txt
```

Le fichier doit contenir les sorties brutes, sans les remplacer par des résumés inventés :

* HEAD initial ;
* `git status --short` initial ;
* diffs staged et non staged initiaux ;
* preuve exacte du validateur `invalid-anchor` ;
* diff réalisé ;
* stdout/stderr et code de sortie de chaque validation ;
* nombre exact de tests du planificateur ;
* résultat brut du build ;
* fichiers staged avant le commit ;
* hash et message du commit ;
* `git diff-tree` du commit ;
* `git status --short` final brut ;
* diffs staged et non staged finaux ;
* `git show --no-color HEAD -- src/melody/test-harmonization-planner.js`.

Décision finale :

```text
INCRÉMENT 8 TERMINÉ
```

uniquement si toutes les validations passent et si le fichier autorisé est propre après le commit.

Sinon :

```text
INCRÉMENT 8 À CORRIGER
```

Ne commence pas l’Incrément 9. 

---

## Assistant (Build · deepseek-v4-pro · 6.8s)

_Thinking:_

Let me analyze this carefully. The user wants me to:

1. Verify the git state at HEAD `4dfe085ec59478caf0ab048eadc73b51194266c4`
2. Only modify `src/melody/test-harmonization-planner.js`
3. Fix T11 - descriptor comparison in `captureGraph()` and `assertGraphUnchanged()`
4. Fix T13 - contract for invalid-anchor
5. Run all validations
6. Commit if everything passes
7. Create audit file

Let me start with the git verification.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git rev-parse HEAD",
  "description": "Verify HEAD commit"
}
```

**Output:**
```
4dfe085ec59478caf0ab048eadc73b51194266c4

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short",
  "description": "Check working tree status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --name-status",
  "description": "Check unstaged changes"
}
```

**Output:**
```
M	.clinerules/rules-projet.md
M	CHANGES.md
M	electron/__pycache__/audio-processor.cpython-313.pyc
M	electron/audio-processor.py
M	package-lock.json
M	package.json
M	src/index.html
M	src/main.js
M	src/recorder/serializer.js
M	src/style.css
M	src/ui/display.js
M	vite.config.js

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-status",
  "description": "Check staged changes"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff -- src/melody/test-harmonization-planner.js",
  "description": "Check unstaged diff for target file"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached -- src/melody/test-harmonization-planner.js",
  "description": "Check staged diff for target file"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 4.9s)

_Thinking:_

Let me analyze the initial state:

1. HEAD is `4dfe085ec59478caf0ab048eadc73b51194266c4` - matches expected
2. `git status --short` shows `M  src/melody/test-harmonization-planner.js` is NOT present. The file is not in the modified list.
3. No staged changes (`git diff --cached --name-status` is empty)
4. No unstaged changes for the target file (`git diff -- src/melody/test-harmonization-planner.js` is empty)
5. No staged changes for the target file (`git diff --cached -- src/melody/test-harmonization-planner.js` is empty)

So the file is clean. The previous report said it should have `M  src/melody/test-harmonization-planner.js` but it doesn't. That's fine - it means the file is already committed and clean. I can proceed.

Now I need to:
1. Read the current test file to understand its structure
2. Read the harmonization planner source to understand what it does
3. Read the chord candidate generator to understand the `invalid-anchor` logic
4. Implement T11 (descriptor comparison) and T13 (contract fix)
5. Run all validations
6. Commit

Let me start by reading the current test file and the relevant source files.

Le HEAD correspond (`4dfe085ec59478caf0ab048eadc73b51194266c4`). Le fichier cible est propre (ni staged ni unstaged). Je peux procéder.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-08-07 — Tests de l'Incrément 8 : assemblage déterministe du
2: // pipeline complet de harmonisation mélodique.
3: // Exécutable avec : node src/melody/test-harmonization-planner.js
4: 
5: import * as harmonizationPlannerModule from './harmonization-planner.js';
6: import { buildHarmonizationPlan } from './harmonization-planner.js';
7: import * as voicingPathModule from './voicing-path-finder.js';
8: import { createMidiCapture } from './midi-capture.js';
9: import { createMelodyTrack } from './melody-track.js';
10: import {
11:   createHarmonicContext, addHarmonicAnchor, setStartChord, setEndChord,
12: } from './harmonic-context.js';
13: import { createTonalContext, setManualTonalContext } from './tonal-context.js';
14: import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
15: import { findBestHarmonicPath } from './harmonic-path-finder.js';
16: import { findBestVoicingPath } from './voicing-path-finder.js';
17: 
18: let total = 0;
19: let passed = 0;
20: 
21: function runTest(name, fn) {
22:   total++;
23:   try {
24:     fn();
25:     passed++;
26:     console.log(`  ✓ ${name}`);
27:   } catch (err) {
28:     console.log(`  ✗ ${name} : ${err.message}`);
29:     process.exitCode = 1;
30:   }
31: }
32: 
33: function assertEqual(actual, expected, msg = '') {
34:   if (actual !== expected) {
35:     throw new Error(`${msg} expected ${expected}, got ${actual}`);
36:   }
37: }
38: 
39: function assertTrue(value, msg = '') {
40:   if (!value) throw new Error(msg || 'expected true');
41: }
42: 
43: function assertFalse(value, msg = '') {
44:   if (value) throw new Error(msg || 'expected false');
45: }
46: 
47: function assertDeepEqual(actual, expected, msg = '') {
48:   if (JSON.stringify(actual) !== JSON.stringify(expected)) {
49:     throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
50:   }
51: }
52: 
53: function assertThrowsTypeError(fn, msg = '') {
54:   let threw = false;
55:   try { fn(); } catch (err) {
56:     threw = err instanceof TypeError;
57:     if (!threw) throw new Error(`${msg} a levé ${err.constructor.name}, TypeError attendu`);
58:   }
59:   if (!threw) throw new Error(`${msg} aucune erreur levée, TypeError attendu`);
60: }
61: 
62: function assertThrowsRangeError(fn, msg = '') {
63:   let threw = false;
64:   try { fn(); } catch (err) {
65:     threw = err instanceof RangeError;
66:     if (!threw) throw new Error(`${msg} a levé ${err.constructor.name}, RangeError attendu`);
67:   }
68:   if (!threw) throw new Error(`${msg} aucune erreur levée, RangeError attendu`);
69: }
70: 
71: /**
72:  * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
73:  * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
74:  * ses clés propres et la valeur/référence exacte de chaque propriété propre.
75:  * Un WeakSet évite les boucles et les parcours redondants sur les références
76:  * partagées.
77:  *
78:  * @param {object} root
79:  * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}
80:  */
81: function captureGraph(root) {
82:   const seen = new WeakSet();
83:   const snapshots = new WeakMap();
84:   function visit(obj, path) {
85:     if (obj === null || typeof obj !== 'object') return;
86:     if (seen.has(obj)) return;
87:     seen.add(obj);
88:     const ownKeys = Reflect.ownKeys(obj);
89:     const snap = {
90:       ref: obj,
91:       path,
92:       frozen: Object.isFrozen(obj),
93:       keys: ownKeys,
94:       props: Object.create(null),
95:     };
96:     for (const k of ownKeys) {
97:       const desc = Object.getOwnPropertyDescriptor(obj, k);
98:       if (desc && 'value' in desc) {
99:         const v = desc.value;
100:         snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };
101:         if (v !== null && typeof v === 'object') {
102:           visit(v, `${path}.${String(k)}`);
103:         }
104:       } else {
105:         snap.props[k] = { type: 'accessor' };
106:       }
107:     }
108:     snapshots.set(obj, snap);
109:   }
110:   visit(root, 'input');
111:   return { snapshots, seen };
112: }
113: 
114: /**
115:  * Vérifie que le graphe accessible depuis root est inchangé par rapport au
116:  * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à
117:  * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références
118:  * pour les valeurs objet, même état de gel.
119:  *
120:  * @param {object} root
121:  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
122:  * @param {string} rootPath
123:  */
124: function assertGraphUnchanged(root, captured, rootPath = 'input') {
125:   const visited = new WeakSet();
126:   function visit(obj, expectedObj, path) {
127:     if (obj === null || typeof obj !== 'object') {
128:       if (obj !== expectedObj) {
129:         throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
130:       }
131:       return;
132:     }
133:     const snap = captured.snapshots.get(obj);
134:     if (!snap) {
135:       throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
136:     }
137:     if (visited.has(obj)) return;
138:     visited.add(obj);
139: 
140:     if (Object.isFrozen(obj) !== snap.frozen) {
141:       throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
142:     }
143:     const ownKeys = Reflect.ownKeys(obj);
144:     if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
145:       throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
146:     }
147:     for (const k of ownKeys) {
148:       const desc = Object.getOwnPropertyDescriptor(obj, k);
149:       const snapProp = snap.props[k];
150:       if (!snapProp) {
151:         throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
152:       }
153:       if (snapProp.type === 'accessor') {
154:         if (!desc || 'value' in desc) {
155:           throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
156:         }
157:         continue;
158:       }
159:       const actualV = desc ? desc.value : undefined;
160:       const expectedV = snapProp.value;
161:       if (actualV !== expectedV) {
162:         throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
163:       }
164:       if (actualV !== null && typeof actualV === 'object') {
165:         visit(actualV, expectedV, `${path}.${String(k)}`);
166:       }
167:     }
168:   }
169:   visit(root, null, rootPath);
170: }
171: 
172: /**
173:  * Vérifie récursivement qu'aucun nombre NaN, Infinity ou -Infinity n'est
174:  * présent dans une valeur. Protégé par WeakSet pour éviter les références
175:  * circulaires.
176:  *
177:  * @param {unknown} value
178:  * @param {string} path
179:  * @param {WeakSet<object>} seen
180:  */
181: function assertAllNumbersFinite(value, path = 'value', seen = new WeakSet()) {
182:   if (value === null || typeof value !== 'object') {
183:     if (typeof value === 'number') {
184:       assertTrue(Number.isFinite(value), `${path} doit être un nombre fini, obtenu ${value}`);
185:     }
186:     return;
187:   }
188:   if (seen.has(value)) return;
189:   seen.add(value);
190:   if (Array.isArray(value)) {
191:     for (let i = 0; i < value.length; i++) {
192:       assertAllNumbersFinite(value[i], `${path}[${i}]`, seen);
193:     }
194:   }
195:   for (const k of Object.keys(value)) {
196:     assertAllNumbersFinite(value[k], `${path}.${k}`, seen);
197:   }
198: }
199: 
200: // ---------------------------------------------------------------------------
201: // Helpers de construction réels (miroir des tests amont)
202: // ---------------------------------------------------------------------------
203: 
204: function makeClock() {
205:   let t = 0;
206:   return { now: () => t, advance: (ms) => { t += ms; } };
207: }
208: 
209: function trackFromMidiNotes(midis) {
210:   const clock = makeClock();
211:   const capture = createMidiCapture({ getTime: clock.now });
212:   for (const midi of midis) {
213:     capture.noteOn(midi, 0.8, 0);
214:     clock.advance(400);
215:     capture.noteOff(midi, 0, 0);
216:     clock.advance(100);
217:   }
218:   capture.finalize();
219:   return createMelodyTrack({ notes: capture.getNotes(), sourceCaptureId: 'cap-plan' });
220: }
221: 
222: function harmonicContextInKey(track, keyString, options = {}) {
223:   const tonalContext = setManualTonalContext(createTonalContext(), keyString);
224:   let ctx = createHarmonicContext(track, { tonalContext });
225:   if (options.startChord) ctx = setStartChord(ctx, options.startChord, { locked: options.startLocked || false });
226:   if (options.endChord) ctx = setEndChord(ctx, options.endChord, { locked: options.endLocked || false });
227:   return ctx;
228: }
229: 
230: // Contexte à 3 ancres start/user/end sur les 3 premières notes de la piste.
231: function makeThreeAnchorContext(track, options = {}) {
232:   let ctx = harmonicContextInKey(track, 'C', options);
233:   ctx = addHarmonicAnchor(ctx, {
234:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
235:     type: 'start', harmonizationPolicy: 'automatic',
236:   });
237:   ctx = addHarmonicAnchor(ctx, {
238:     melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
239:     type: 'user', harmonizationPolicy: 'automatic',
240:   });
241:   ctx = addHarmonicAnchor(ctx, {
242:     melodyEventId: track.events[2].id, relativeTime: track.events[2].startedAt,
243:     type: 'end', harmonizationPolicy: 'automatic',
244:   });
245:   return ctx;
246: }
247: 
248: // Composition manuelle indépendante des trois API amont (oracle T7).
249: function manualComposition(track, harmonicContext) {
250:   const candidateLayers = [];
251:   for (let i = 0; i < harmonicContext.anchors.length; i++) {
252:     candidateLayers.push(generateChordCandidatesForAnchor({
253:       anchor: harmonicContext.anchors[i], track, harmonicContext,
254:     }).candidates);
255:   }
256:   const harmonicPathResult = findBestHarmonicPath({ candidateLayers });
257:   const voicingPathResult = findBestVoicingPath({ harmonicPathResult });
258:   return { candidateLayers, harmonicPathResult, voicingPathResult };
259: }
260: 
261: // Champs temporels/performance interdits dans les nouveaux conteneurs.
262: // Normalisés en minuscules pour une comparaison insensible à la casse.
263: const FORBIDDEN_FIELDS = new Set([
264:   'audio', 'ui', 'playback', 'noteOn', 'noteOff', 'duration', 'velocity',
265:   'channel', 'tempo', 'tick', 'pedal', 'sustain', 'finger', 'export',
266:   'style', 'reharmonization',
267: ].map((f) => f.toLowerCase()));
268: 
269: /**
270:  * Vrai test de clé d'index de tableau. Rejette les chaînes comme '01', '1e2',
271:  * '' ou 'foo' : seule une chaîne décimale non signée représentant un entier
272:  * dans [0, 2**32 - 2] est un index valide selon la spécification JS.
273:  *
274:  * @param {string} key
275:  * @returns {boolean}
276:  */
277: function isArrayIndex(key) {
278:   if (typeof key !== 'string' || key === '' || key === '0' && key.length !== 1) return false;
279:   const num = Number(key);
280:   if (!Number.isInteger(num) || num < 0) return false;
281:   return String(num) === key && num < 4294967295;
282: }
283: 
284: // Inspecte uniquement les clés propres des nouveaux conteneurs de l'Incrément 8
285: // (plan, steps, candidateLayers, chaque couche). Ne parcourt jamais les valeurs
286: // référencées (track, harmonicContext, anchor, candidate, voicing,
287: // harmonicTransition, voicingTransition, harmonicPathResult, voicingPathResult).
288: // Pour les tableaux, ignore les clés numériques normales et recherche seulement
289: // d'éventuelles propriétés publiques ajoutées artificiellement.
290: function collectNewContainerKeys(plan) {
291:   const keys = new Set();
292:   // HarmonizationPlan : clés propres.
293:   for (const k of Object.keys(plan)) keys.add(k.toLowerCase());
294:   // candidateLayers : clés propres du tableau extérieur (propriétés non numériques).
295:   for (const k of Object.keys(plan.candidateLayers)) {
296:     if (!isArrayIndex(k)) keys.add(k.toLowerCase());
297:   }
298:   // Chaque couche : clés propres (propriétés non numériques).
299:   for (const layer of plan.candidateLayers) {
300:     for (const k of Object.keys(layer)) {
301:       if (!isArrayIndex(k)) keys.add(k.toLowerCase());
302:     }
303:   }
304:   // steps : clés propres du tableau extérieur.
305:   for (const k of Object.keys(plan.steps)) {
306:     if (!isArrayIndex(k)) keys.add(k.toLowerCase());
307:   }
308:   // Chaque HarmonizationStep : clés propres.
309:   for (const s of plan.steps) {
310:     for (const k of Object.keys(s)) keys.add(k.toLowerCase());
311:   }
312:   return keys;
313: }
314: 
315: // ===========================================================================
316: // T1 — Export public et champs exacts
317: // ===========================================================================
318: 
319: runTest('T1 — export unique et clés exactes de HarmonizationPlan / HarmonizationStep', () => {
320:   assertDeepEqual(Object.keys(harmonizationPlannerModule).sort(), ['buildHarmonizationPlan'],
321:     'exactement un export public');
322:   assertEqual(typeof buildHarmonizationPlan, 'function');
323: 
324:   const track = trackFromMidiNotes([60, 64, 67]);
325:   const ctx = makeThreeAnchorContext(track);
326:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
327: 
328:   // HarmonizationPlan : clés exactes, aucun champ public supplémentaire.
329:   assertDeepEqual(Object.keys(plan).sort(),
330:     ['candidateLayers', 'harmonicContext', 'harmonicPathResult', 'steps', 'track', 'voicingPathResult'],
331:     'clés exactes du HarmonizationPlan');
332: 
333:   // HarmonizationStep : clés exactes.
334:   assertDeepEqual(Object.keys(plan.steps[0]).sort(),
335:     ['anchor', 'candidate', 'candidateLayer', 'harmonicTransition', 'index', 'voicing', 'voicingTransition'],
336:     'clés exactes du HarmonizationStep');
337: });
338: 
339: // ===========================================================================
340: // T2 — Pipeline réel complet
341: // ===========================================================================
342: 
343: runTest('T2 — pipeline réel : 3 couches, 3 candidats, 3 voicings, 2 transitions', () => {
344:   const track = trackFromMidiNotes([60, 64, 67]);
345:   const ctx = makeThreeAnchorContext(track);
346:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
347: 
348:   assertEqual(plan.candidateLayers.length, 3, '3 couches');
349:   assertEqual(plan.harmonicPathResult.path.length, 3, '3 candidats choisis');
350:   assertEqual(plan.voicingPathResult.voicings.length, 3, '3 voicings');
351:   assertEqual(plan.harmonicPathResult.transitions.length, 2, '2 transitions harmoniques');
352:   assertEqual(plan.voicingPathResult.transitions.length, 2, '2 transitions de voicings');
353:   assertEqual(plan.steps.length, 3, '3 steps');
354: });
355: 
356: // ===========================================================================
357: // T3 — Alignement exact des références
358: // ===========================================================================
359: 
360: runTest('T3 — alignement exact des références (pas de comparaison JSON)', () => {
361:   const track = trackFromMidiNotes([60, 64, 67]);
362:   const ctx = makeThreeAnchorContext(track);
363:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
364:   const N = plan.steps.length;
365: 
366:   // Identité du wrapper.
367:   assertTrue(plan.track === track, 'plan.track === track');
368:   assertTrue(plan.harmonicContext === ctx, 'plan.harmonicContext === ctx');
369: 
370:   // Invariants de longueur.
371:   assertEqual(ctx.anchors.length, N);
372:   assertEqual(plan.candidateLayers.length, N);
373:   assertEqual(plan.harmonicPathResult.path.length, N);
374:   assertEqual(plan.voicingPathResult.chordPath.length, N);
375:   assertEqual(plan.voicingPathResult.voicings.length, N);
376:   assertEqual(plan.steps.length, N);
377: 
378:   for (let i = 0; i < N; i++) {
379:     const s = plan.steps[i];
380:     assertTrue(s.anchor === ctx.anchors[i], `steps[${i}].anchor === anchors[${i}]`);
381:     assertTrue(s.candidateLayer === plan.candidateLayers[i], `steps[${i}].candidateLayer === candidateLayers[${i}]`);
382:     assertTrue(s.candidateLayer.includes(s.candidate), `steps[${i}].candidate ∈ candidateLayer`);
383:     assertTrue(s.candidate === plan.harmonicPathResult.path[i], `steps[${i}].candidate === harmonicPathResult.path[${i}]`);
384:     assertTrue(s.candidate === plan.voicingPathResult.chordPath[i], `steps[${i}].candidate === voicingPathResult.chordPath[${i}]`);
385:     assertTrue(s.voicing === plan.voicingPathResult.voicings[i], `steps[${i}].voicing === voicingPathResult.voicings[${i}]`);
386:     assertTrue(s.voicing.candidate === s.candidate, `steps[${i}].voicing.candidate === steps[${i}].candidate`);
387:   }
388: });
389: 
390: // ===========================================================================
391: // T4 — Transitions entrantes
392: // ===========================================================================
393: 
394: runTest('T4 — transitions entrantes nulles au step 0, puis transitions[i-1]', () => {
395:   const track = trackFromMidiNotes([60, 64, 67]);
396:   const ctx = makeThreeAnchorContext(track);
397:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
398:   const N = plan.steps.length;
399:   assertEqual(N, 3);
400: 
401:   assertTrue(plan.steps[0].harmonicTransition === null, 'step0.harmonicTransition === null');
402:   assertTrue(plan.steps[0].voicingTransition === null, 'step0.voicingTransition === null');
403: 
404:   for (let i = 1; i < N; i++) {
405:     assertTrue(plan.steps[i].harmonicTransition === plan.harmonicPathResult.transitions[i - 1],
406:       `steps[${i}].harmonicTransition === harmonicPathResult.transitions[${i - 1}]`);
407:     assertTrue(plan.steps[i].voicingTransition === plan.voicingPathResult.transitions[i - 1],
408:       `steps[${i}].voicingTransition === voicingPathResult.transitions[${i - 1}]`);
409: 
410:     const ht = plan.steps[i].harmonicTransition;
411:     assertEqual(ht.fromId, plan.steps[i - 1].candidate.id, `ht[${i}].fromId === steps[${i - 1}].candidate.id`);
412:     assertEqual(ht.toId, plan.steps[i].candidate.id, `ht[${i}].toId === steps[${i}].candidate.id`);
413: 
414:     const vt = plan.steps[i].voicingTransition;
415:     assertTrue(vt.from === plan.steps[i - 1].voicing, `vt[${i}].from === steps[${i - 1}].voicing`);
416:     assertTrue(vt.to === plan.steps[i].voicing, `vt[${i}].to === steps[${i}].voicing`);
417:   }
418: });
419: 
420: // ===========================================================================
421: // T5 — Candidat verrouillé
422: // ===========================================================================
423: 
424: runTest('T5 — candidat de départ verrouillé respecté, couches suivantes libres', () => {
425:   const track = trackFromMidiNotes([60]);
426:   let ctx = harmonicContextInKey(track, 'C');
427:   ctx = setStartChord(ctx, 'Cmaj7', { locked: true });
428:   ctx = addHarmonicAnchor(ctx, {
429:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
430:     type: 'start', harmonizationPolicy: 'automatic',
431:   });
432:   ctx = addHarmonicAnchor(ctx, {
433:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt + 1.0,
434:     type: 'end', harmonizationPolicy: 'automatic',
435:   });
436: 
437:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
438:   const first = plan.steps[0].candidate;
439:   assertEqual(first.source, 'locked-boundary', 'premier candidat = locked-boundary');
440:   assertTrue(first.locked === true, 'premier candidat verrouillé');
441:   assertEqual(first.qualityId, 'maj7', 'premier candidat = Cmaj7');
442:   // Le planificateur ne remplace ni ne contourne le verrouillage.
443:   assertTrue(plan.candidateLayers[0].length === 1, 'couche 0 réduite au seul candidat verrouillé');
444:   assertTrue(plan.candidateLayers[0][0] === first, 'référence exacte du candidat verrouillé');
445:   // Couches suivantes restent libres (plusieurs candidats diatoniques).
446:   assertTrue(plan.candidateLayers[1].length > 1, 'couche 1 libre (plusieurs candidats)');
447:   for (const c of plan.candidateLayers[1]) {
448:     assertFalse(c.locked === true && c.source === 'locked-boundary', 'aucun candidat verrouillé en couche 1');
449:   }
450: });
451: 
452: // ===========================================================================
453: // T6 — Une seule ancre
454: // ===========================================================================
455: 
456: runTest('T6 — une seule ancre : mono-couche, transitions nulles, totaux exacts', () => {
457:   const track = trackFromMidiNotes([60]);
458:   let ctx = harmonicContextInKey(track, 'C');
459:   ctx = addHarmonicAnchor(ctx, {
460:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
461:     type: 'start', harmonizationPolicy: 'automatic',
462:   });
463:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
464: 
465:   assertEqual(plan.candidateLayers.length, 1, 'une couche');
466:   assertEqual(plan.steps.length, 1, 'un step');
467:   assertEqual(plan.harmonicPathResult.path.length, 1, 'un candidat');
468:   assertEqual(plan.voicingPathResult.voicings.length, 1, 'un voicing');
469:   assertEqual(plan.harmonicPathResult.transitions.length, 0, 'aucune transition harmonique');
470:   assertEqual(plan.voicingPathResult.transitions.length, 0, 'aucune transition de voicings');
471:   assertTrue(plan.steps[0].harmonicTransition === null, 'step0.harmonicTransition === null');
472:   assertTrue(plan.steps[0].voicingTransition === null, 'step0.voicingTransition === null');
473: 
474:   // Composition manuelle mono-couche pour comparaison exacte.
475:   const manual = manualComposition(track, ctx);
476:   assertEqual(plan.voicingPathResult.totalCost, manual.voicingPathResult.totalCost, 'totalCost exact');
477:   assertEqual(plan.voicingPathResult.totalMovement, manual.voicingPathResult.totalMovement, 'totalMovement exact');
478:   assertEqual(plan.voicingPathResult.unmatchedVoiceCount, manual.voicingPathResult.unmatchedVoiceCount, 'unmatchedVoiceCount exact');
479:   assertEqual(plan.voicingPathResult.largeLeapCount, manual.voicingPathResult.largeLeapCount, 'largeLeapCount exact');
480:   assertEqual(plan.voicingPathResult.parallelFifths, manual.voicingPathResult.parallelFifths, 'parallelFifths exact');
481:   assertEqual(plan.voicingPathResult.parallelOctaves, manual.voicingPathResult.parallelOctaves, 'parallelOctaves exact');
482:   assertEqual(plan.voicingPathResult.registerDeviation, manual.voicingPathResult.registerDeviation, 'registerDeviation exact');
483:   assertDeepEqual(plan.voicingPathResult.settings, manual.voicingPathResult.settings, 'settings identiques');
484: });
485: 
486: // ===========================================================================
487: // T7 — Équivalence avec la composition manuelle
488: // ===========================================================================
489: 
490: runTest('T7 — équivalence stricte avec la composition manuelle des API publiques', () => {
491:   const track = trackFromMidiNotes([60, 64, 67]);
492:   const ctx = makeThreeAnchorContext(track);
493:   const manual = manualComposition(track, ctx);
494:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
495: 
496:   // Égalité sérialisable complète des trois agrégats produits. Le test échoue
497:   // si un champ sérialisable diffère, même lorsque les identifiants et les
498:   // notes MIDI restent identiques.
499:   assertDeepEqual(
500:     plan.candidateLayers,
501:     manual.candidateLayers,
502:     'candidateLayers complètes',
503:   );
504:   assertDeepEqual(
505:     plan.harmonicPathResult,
506:     manual.harmonicPathResult,
507:     'HarmonicPathResult complet',
508:   );
509:   assertDeepEqual(
510:     plan.voicingPathResult,
511:     manual.voicingPathResult,
512:     'VoicingPathResult complet',
513:   );
514: 
515:   // Vérifications explicites conservées : ordre des identifiants, notes MIDI,
516:   // transitions harmoniques, wrappers de transitions de voicing, scores,
517:   // movements, totaux et settings.
518:   assertDeepEqual(
519:     plan.candidateLayers.map((l) => l.map((c) => c.id)),
520:     manual.candidateLayers.map((l) => l.map((c) => c.id)),
521:     'couches identiques (id + ordre)',
522:   );
523: 
524:   // HarmonicPathResult complet.
525:   assertDeepEqual(plan.harmonicPathResult.path.map((c) => c.id), manual.harmonicPathResult.path.map((c) => c.id),
526:     'chemin harmonique : ids');
527:   assertEqual(plan.harmonicPathResult.totalScore, manual.harmonicPathResult.totalScore, 'hpath totalScore');
528:   assertEqual(plan.harmonicPathResult.compatibilityScore, manual.harmonicPathResult.compatibilityScore, 'hpath compatScore');
529:   assertEqual(plan.harmonicPathResult.transitionScore, manual.harmonicPathResult.transitionScore, 'hpath transScore');
530:   assertDeepEqual(plan.harmonicPathResult.weights, manual.harmonicPathResult.weights, 'hpath weights');
531:   // Toutes les TransitionScore et tous leurs champs.
532:   for (let t = 0; t < plan.harmonicPathResult.transitions.length; t++) {
533:     assertDeepEqual(plan.harmonicPathResult.transitions[t], manual.harmonicPathResult.transitions[t],
534:       `hpath transition[${t}] complète`);
535:   }
536: 
537:   // VoicingPathResult complet.
538:   assertDeepEqual(plan.voicingPathResult.voicings.map((v) => v.midiNotes),
539:     manual.voicingPathResult.voicings.map((v) => v.midiNotes), 'voicings MIDI identiques');
540:   assertEqual(plan.voicingPathResult.totalCost, manual.voicingPathResult.totalCost, 'vpath totalCost');
541:   assertEqual(plan.voicingPathResult.totalMovement, manual.voicingPathResult.totalMovement, 'vpath totalMovement');
542:   assertEqual(plan.voicingPathResult.unmatchedVoiceCount, manual.voicingPathResult.unmatchedVoiceCount, 'vpath unmatched');
543:   assertEqual(plan.voicingPathResult.largeLeapCount, manual.voicingPathResult.largeLeapCount, 'vpath leap');
544:   assertEqual(plan.voicingPathResult.parallelFifths, manual.voicingPathResult.parallelFifths, 'vpath fifths');
545:   assertEqual(plan.voicingPathResult.parallelOctaves, manual.voicingPathResult.parallelOctaves, 'vpath octaves');
546:   assertEqual(plan.voicingPathResult.registerDeviation, manual.voicingPathResult.registerDeviation, 'vpath regDev');
547:   assertDeepEqual(plan.voicingPathResult.settings, manual.voicingPathResult.settings, 'vpath settings');
548: 
549:   // Chaque wrapper de transition de voicing, chaque score, chaque movements,
550:   // chaque VoicingMovement.
551:   for (let t = 0; t < plan.voicingPathResult.transitions.length; t++) {
552:     const pt = plan.voicingPathResult.transitions[t];
553:     const mt = manual.voicingPathResult.transitions[t];
554:     assertDeepEqual(pt.from.midiNotes, mt.from.midiNotes, `vt[${t}].from.midiNotes`);
555:     assertDeepEqual(pt.to.midiNotes, mt.to.midiNotes, `vt[${t}].to.midiNotes`);
556:     assertDeepEqual(pt.score, mt.score, `vt[${t}].score complet`);
557:     assertDeepEqual(pt.score.movements, mt.score.movements, `vt[${t}].score.movements`);
558:     for (let m = 0; m < pt.score.movements.length; m++) {
559:       assertDeepEqual(pt.score.movements[m], mt.score.movements[m], `vt[${t}].movements[${m}]`);
560:     }
561:   }
562: });
563: 
564: // ===========================================================================
565: // T8 — Ordre des ancres et couches
566: // ===========================================================================
567: 
568: runTest('T8 — ordre exact des ancres conservé, ancres distinctes, pas de tri', () => {
569:   // Ancres à temps relatifs distincts et non triés par insertion pour vérifier
570:   // que le planificateur ne trie pas.
571:   const track = trackFromMidiNotes([60, 64, 67, 72]);
572:   let ctx = harmonicContextInKey(track, 'C');
573:   ctx = addHarmonicAnchor(ctx, {
574:     melodyEventId: track.events[2].id, relativeTime: track.events[2].startedAt,
575:     type: 'user', harmonizationPolicy: 'automatic',
576:   });
577:   ctx = addHarmonicAnchor(ctx, {
578:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
579:     type: 'start', harmonizationPolicy: 'automatic',
580:   });
581:   ctx = addHarmonicAnchor(ctx, {
582:     melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
583:     type: 'user', harmonizationPolicy: 'automatic',
584:   });
585:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
586: 
587:   // L'ordre du plan est l'ordre exact de ctx.anchors (non trié).
588:   const anchorIds = plan.steps.map((s) => s.anchor.id);
589:   assertDeepEqual(anchorIds, ctx.anchors.map((a) => a.id), 'ordre des ancres = ctx.anchors');
590:   // Chaque candidat de la couche (pas seulement le sélectionné) porte
591:   // l'anchorId de l'ancre correspondante.
592:   for (let i = 0; i < plan.candidateLayers.length; i++) {
593:     for (const c of plan.candidateLayers[i]) {
594:       assertEqual(c.anchorId, ctx.anchors[i].id,
595:         `candidateLayers[${i}] chaque candidat.anchorId === anchors[${i}].id`);
596:     }
597:   }
598:   // Chaque candidat sélectionné porte aussi l'anchorId de l'ancre.
599:   for (let i = 0; i < plan.steps.length; i++) {
600:     assertEqual(plan.steps[i].candidate.anchorId, ctx.anchors[i].id,
601:       `steps[${i}].candidate.anchorId === anchors[${i}].id`);
602:   }
603:   // Pas de déduplication des couches : N ancr => N couches distinctes.
604:   assertEqual(plan.candidateLayers.length, ctx.anchors.length, 'N couches pour N ancres');
605:   // Les temps relatifs restent dans l'ordre d'insertion (non trié).
606:   const times = ctx.anchors.map((a) => a.relativeTime);
607:   assertTrue(times[0] > times[1] && times[1] < times[2], 'ancres volontairement non triées');
608: });
609: 
610: // ===========================================================================
611: // T9 — Couches distinctes et figées
612: // ===========================================================================
613: 
614: runTest('T9 — couches distinctes, figées, ordre du générateur, pas de clone de candidat', () => {
615:   const track = trackFromMidiNotes([60, 64, 67]);
616:   const ctx = makeThreeAnchorContext(track);
617:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
618: 
619:   assertTrue(Object.isFrozen(plan.candidateLayers), 'candidateLayers figé');
620:   for (let i = 0; i < plan.candidateLayers.length; i++) {
621:     assertTrue(Object.isFrozen(plan.candidateLayers[i]), `couche[${i}] figée`);
622:     // Conteneurs distincts (pas de tableau partagé).
623:     for (let j = 0; j < plan.candidateLayers.length; j++) {
624:       if (i !== j) assertTrue(plan.candidateLayers[i] !== plan.candidateLayers[j],
625:         `couche[${i}] !== couche[${j}]`);
626:     }
627:     // Ordre identique à celui du générateur public (par id, contenu et longueur ;
628:     // le générateur crée de nouvelles instances à chaque appel, on compare donc
629:     // par valeur canonique plutôt que par référence).
630:     const gen = generateChordCandidatesForAnchor({
631:       anchor: ctx.anchors[i], track, harmonicContext: ctx,
632:     }).candidates;
633:     assertEqual(plan.candidateLayers[i].length, gen.length, `couche[${i}] longueur identique`);
634:     assertDeepEqual(plan.candidateLayers[i].map((c) => c.id), gen.map((c) => c.id),
635:       `couche[${i}] ordre des ids identique`);
636:   }
637:   // Pas de clone interne : le candidat sélectionné par le chemin harmonique
638:   // EST la même référence que celle présente dans la couche du planificateur
639:   // (le planificateur ne remplace aucun candidat par une copie).
640:   for (let i = 0; i < plan.steps.length; i++) {
641:     assertTrue(plan.candidateLayers[i].includes(plan.harmonicPathResult.path[i]),
642:       `candidateLayers[${i}] contient (par référence) le candidat du chemin harmonique`);
643:     assertTrue(plan.candidateLayers[i].includes(plan.steps[i].candidate),
644:       `candidateLayers[${i}] contient (par référence) steps[${i}].candidate`);
645:   }
646: });
647: 
648: // ===========================================================================
649: // T10 — Déterminisme
650: // ===========================================================================
651: 
652: runTest('T10 — déterminisme : même JSON, ids, notes MIDI, scores, ordre', () => {
653:   const track = trackFromMidiNotes([60, 64, 67, 72]);
654:   const ctx = makeThreeAnchorContext(track, { startChord: 'Cmaj7', startLocked: true });
655:   const p1 = buildHarmonizationPlan({ track, harmonicContext: ctx });
656:   const p2 = buildHarmonizationPlan({ track, harmonicContext: ctx });
657: 
658:   assertDeepEqual(p1, p2, 'plans sérialisables identiques');
659:   assertDeepEqual(
660:     p1.candidateLayers.map((l) => l.map((c) => c.id)),
661:     p2.candidateLayers.map((l) => l.map((c) => c.id)),
662:     'ordres des couches identiques',
663:   );
664:   assertDeepEqual(p1.steps.map((s) => s.candidate.id), p2.steps.map((s) => s.candidate.id),
665:     'ordres des steps identiques');
666:   assertDeepEqual(p1.voicingPathResult.voicings.map((v) => v.midiNotes),
667:     p2.voicingPathResult.voicings.map((v) => v.midiNotes), 'notes MIDI identiques');
668:   assertEqual(p1.harmonicPathResult.totalScore, p2.harmonicPathResult.totalScore, 'scores identiques');
669:   assertEqual(p1.voicingPathResult.totalCost, p2.voicingPathResult.totalCost, 'totaux identiques');
670: });
671: 
672: // ===========================================================================
673: // T11 — Immutabilité complète
674: // ===========================================================================
675: 
676: runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouveaux conteneurs figés', () => {
677:   const track = trackFromMidiNotes([60, 64, 67]);
678:   const ctx = makeThreeAnchorContext(track);
679:   const input = { track, harmonicContext: ctx };
680: 
681:   // Snapshots avant appel : références, état de gel, contenu JSON, ordre.
682:   const inputRef = input;
683:   const inputFrozenBefore = Object.isFrozen(input);
684:   const trackRef = track;
685:   const ctxRef = ctx;
686:   const trackFrozenBefore = Object.isFrozen(track);
687:   const ctxFrozenBefore = Object.isFrozen(ctx);
688:   const anchorsRef = ctx.anchors;
689:   const anchorsFrozenBefore = Object.isFrozen(ctx.anchors);
690:   const eventsRef = track.events;
691:   const eventsFrozenBefore = track.events.map((e) => Object.isFrozen(e));
692:   const anchorsFrozenEachBefore = ctx.anchors.map((a) => Object.isFrozen(a));
693:   const inputJson = JSON.stringify(input);
694:   const trackJson = JSON.stringify(track);
695:   const ctxJson = JSON.stringify(ctx);
696:   const anchorsJson = JSON.stringify(ctx.anchors);
697:   const eventsJson = JSON.stringify(track.events);
698: 
699:   // Capture complète du graphe d'objets accessible depuis les entrées.
700:   const captured = captureGraph(input);
701: 
702:   const plan = buildHarmonizationPlan(input);
703: 
704:   // Vérification globale du graphe : chaque objet accessible conserve sa
705:   // référence, son état de gel, ses clés propres et la valeur/référence de
706:   // chaque propriété propre. Détecte un gel ou un remplacement post-call de
707:   // ctx.tonalContext, d'un tableau du contexte tonal, d'un événement ou d'une ancre.
708:   assertGraphUnchanged(input, captured, 'input');
709: 
710:   // Wrapper : référence et état de gel inchangés.
711:   assertTrue(input === inputRef, 'wrapper même référence');
712:   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');
713: 
714:   // track et harmonicContext : références et état de gel inchangés.
715:   assertTrue(track === trackRef, 'track même référence');
716:   assertTrue(ctx === ctxRef, 'harmonicContext même référence');
717:   assertEqual(Object.isFrozen(track), trackFrozenBefore, 'track état de gel inchangé');
718:   assertEqual(Object.isFrozen(ctx), ctxFrozenBefore, 'ctx état de gel inchangé');
719: 
720:   // anchors : référence, état de gel, contenu, ordre.
721:   assertTrue(ctx.anchors === anchorsRef, 'anchors même référence');
722:   assertEqual(Object.isFrozen(ctx.anchors), anchorsFrozenBefore, 'anchors état de gel inchangé');
723:   assertEqual(JSON.stringify(ctx.anchors), anchorsJson, 'anchors JSON inchangé');
724:   for (let i = 0; i < anchorsRef.length; i++) {
725:     assertTrue(ctx.anchors[i] === anchorsRef[i], `anchor[${i}] même référence`);
726:     assertEqual(Object.isFrozen(ctx.anchors[i]), anchorsFrozenEachBefore[i], `anchor[${i}] gel inchangé`);
727:   }
728: 
729:   // events : référence, état de gel, contenu, ordre.
730:   assertTrue(track.events === eventsRef, 'events même référence');
731:   assertEqual(JSON.stringify(track.events), eventsJson, 'events JSON inchangé');
732:   for (let i = 0; i < eventsRef.length; i++) {
733:     assertTrue(track.events[i] === eventsRef[i], `event[${i}] même référence`);
734:     assertEqual(Object.isFrozen(track.events[i]), eventsFrozenBefore[i], `event[${i}] gel inchangé`);
735:   }
736: 
737:   // Contenu JSON global inchangé.
738:   assertEqual(JSON.stringify(input), inputJson, 'input JSON inchangé');
739:   assertEqual(JSON.stringify(track), trackJson, 'track JSON inchangé');
740:   assertEqual(JSON.stringify(ctx), ctxJson, 'ctx JSON inchangé');
741: 
742:   // Nouveaux conteneurs publics figés.
743:   assertTrue(Object.isFrozen(plan), 'plan figé');
744:   assertTrue(Object.isFrozen(plan.candidateLayers), 'candidateLayers figé');
745:   for (const layer of plan.candidateLayers) assertTrue(Object.isFrozen(layer), 'couche figée');
746:   assertTrue(Object.isFrozen(plan.steps), 'steps figé');
747:   for (const s of plan.steps) assertTrue(Object.isFrozen(s), 'step figé');
748:   // Les résultats amont restent les objets exacts (déjà figés par les moteurs).
749:   assertTrue(Object.isFrozen(plan.harmonicPathResult), 'harmonicPathResult figé (par le moteur)');
750:   assertTrue(Object.isFrozen(plan.voicingPathResult), 'voicingPathResult figé (par le moteur)');
751: });
752: 
753: // ===========================================================================
754: // T12 — Wrapper invalide
755: // ===========================================================================
756: 
757: runTest('T12 — wrapper invalide : TypeError pour chaque cas', () => {
758:   const track = trackFromMidiNotes([60, 64, 67]);
759:   const ctx = makeThreeAnchorContext(track);
760: 
761:   assertThrowsTypeError(() => buildHarmonizationPlan(), 'argument absent');
762:   assertThrowsTypeError(() => buildHarmonizationPlan(null), 'null');
763:   assertThrowsTypeError(() => buildHarmonizationPlan(5), 'nombre');
764:   assertThrowsTypeError(() => buildHarmonizationPlan('x'), 'chaîne');
765:   assertThrowsTypeError(() => buildHarmonizationPlan(true), 'booléen');
766:   assertThrowsTypeError(() => buildHarmonizationPlan(() => {}), 'fonction');
767:   assertThrowsTypeError(() => buildHarmonizationPlan([1, 2]), 'tableau');
768:   // Tableau portant artificiellement track et harmonicContext.
769:   const arrWith = []; arrWith.track = track; arrWith.harmonicContext = ctx;
770:   assertThrowsTypeError(() => buildHarmonizationPlan(arrWith), 'tableau avec propriétés');
771:   // Propriétés absentes.
772:   assertThrowsTypeError(() => buildHarmonizationPlan({ harmonicContext: ctx }), 'track absent');
773:   assertThrowsTypeError(() => buildHarmonizationPlan({ track }), 'harmonicContext absent');
774:   // Propriété héritée mais non propre.
775:   const inherited = Object.create({ track, harmonicContext: ctx });
776:   assertThrowsTypeError(() => buildHarmonizationPlan(inherited), 'propriétés héritées non propres');
777:   // track / harmonicContext null ou tableau.
778:   assertThrowsTypeError(() => buildHarmonizationPlan({ track: null, harmonicContext: ctx }), 'track null');
779:   assertThrowsTypeError(() => buildHarmonizationPlan({ track: [], harmonicContext: ctx }), 'track tableau');
780:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: null }), 'harmonicContext null');
781:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: [] }), 'harmonicContext tableau');
782: });
783: 
784: // ===========================================================================
785: // T13 — Ancres invalides
786: // ===========================================================================
787: 
788: runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)', () => {
789:   const track = trackFromMidiNotes([60, 64, 67]);
790:   const ctx = makeThreeAnchorContext(track);
791: 
792:   // anchors absent.
793:   const noAnchors = { ...ctx }; delete noAnchors.anchors;
794:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: noAnchors }), 'anchors absent');
795:   // anchors non tableau.
796:   const nonArr = { ...ctx, anchors: {} };
797:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: nonArr }), 'anchors non tableau');
798:   // tableau creux.
799:   const sparse = { ...ctx }; const sa = []; sa[0] = ctx.anchors[0]; sa[2] = ctx.anchors[2]; sparse.anchors = sa;
800:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: sparse }), 'anchors creux');
801:   // ancre null.
802:   const nullAnchor = { ...ctx, anchors: [null] };
803:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: nullAnchor }), 'ancre null');
804:   // ancre primitive.
805:   const primAnchor = { ...ctx, anchors: [5] };
806:   assertThrowsTypeError(() => buildHarmonizationPlan({ track, harmonicContext: primAnchor }), 'ancre primitive');
807: 
808:   // Ancre invalide selon le contrat public du générateur : objet sans id.
809:   // Le générateur retourne status 'invalid-anchor' : le planificateur lève
810:   // TypeError (ancre structurellement invalide), pas RangeError.
811:   const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };
812:   const invalidCtx = { ...ctx, anchors: [badAnchor] };
813:   let err = null;
814:   try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }
815:   assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');
816:   assertTrue(String(err.message).includes('0'), 'message contient l indice 0');
817:   assertTrue(String(err.message).toLowerCase().includes('invalide'),
818:     'message indique que l ancre est invalide');
819: 
820:   // Note : le validateur canonique (chord-candidate-generator.js:896) ne
821:   // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
822:   // le statut 'invalid-anchor'. Il est donc impossible de construire une
823:   // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
824: 
825:   // Ancre valide sans candidat : mode force sans contexte tonal ni accord
826:   // original. Le statut public direct du générateur est 'no-valid-candidate'.
827:   const trackForce = trackFromMidiNotes([61]); // C#4
828:   let ctxForce = createHarmonicContext(trackForce);
829:   ctxForce = addHarmonicAnchor(ctxForce, { relativeTime: 0, harmonizationPolicy: 'force' });
830:   const forceAnchor = ctxForce.anchors[0];
831:   const genNoCandidate = generateChordCandidatesForAnchor({
832:     anchor: forceAnchor, track: trackForce, harmonicContext: ctxForce,
833:   });
834:   assertEqual(genNoCandidate.status, 'no-valid-candidate',
835:     'statut public direct = no-valid-candidate');
836:   assertEqual(genNoCandidate.candidates.length, 0, 'aucun candidat retourné');
837: 
838:   let planErr = null;
839:   try { buildHarmonizationPlan({ track: trackForce, harmonicContext: ctxForce }); } catch (e) { planErr = e; }
840:   assertTrue(planErr instanceof RangeError, 'ancre valide sans candidat -> RangeError');
841:   assertTrue(String(planErr.message).includes('0'), 'message contient l indice 0');
842:   assertTrue(String(planErr.message).includes(forceAnchor.id),
843:     'message contient l identifiant canonique exact de l ancre');
844:   assertTrue(!planErr.partialPlan, 'aucun plan partiel retourné');
845: 
846:   // Contexte créé pour une piste mais utilisé avec une autre : le contrat
847:   // canonique encode melodyTrackId, le planificateur lève TypeError.
848:   const track2 = trackFromMidiNotes([64, 67]);
849:   const ctxForTrack1 = harmonicContextInKey(track, 'C');
850:   const ctxWithAnchor = addHarmonicAnchor(ctxForTrack1, {
851:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
852:     type: 'start', harmonizationPolicy: 'automatic',
853:   });
854:   assertThrowsTypeError(() => buildHarmonizationPlan({ track: track2, harmonicContext: ctxWithAnchor }),
855:     'contexte d une autre piste -> TypeError');
856: });
857: 
858: // ===========================================================================
859: // T14 — Aucune ancre
860: // ===========================================================================
861: 
862: runTest('T14 — contexte canonique sans ancre -> RangeError', () => {
863:   const track = trackFromMidiNotes([60, 64, 67]);
864:   const ctx = harmonicContextInKey(track, 'C'); // aucun addHarmonicAnchor
865:   let err = null;
866:   try { buildHarmonizationPlan({ track, harmonicContext: ctx }); } catch (e) { err = e; }
867:   assertTrue(err instanceof RangeError, 'RangeError levé');
868:   assertTrue(String(err.message).toLowerCase().includes('ancre'), 'message mentionne l absence d ancre');
869: });
870: 
871: // ===========================================================================
872: // T15 — Plusieurs cardinalités d'accords
873: // ===========================================================================
874: 
875: runTest('T15 — progression avec cardinalités de pitch classes différentes garanties', () => {
876:   // Cmaj7 verrouillé au départ (4 pcs), C triade verrouillé à la fin (3 pcs),
877:   // au moins une ancre intermédiaire libre.
878:   const track = trackFromMidiNotes([60, 62, 64, 67]);
879:   let ctx = harmonicContextInKey(track, 'C', {
880:     startChord: 'Cmaj7', startLocked: true,
881:     endChord: 'C', endLocked: true,
882:   });
883:   ctx = addHarmonicAnchor(ctx, {
884:     melodyEventId: track.events[0].id, relativeTime: track.events[0].startedAt,
885:     type: 'start', harmonizationPolicy: 'automatic',
886:   });
887:   ctx = addHarmonicAnchor(ctx, {
888:     melodyEventId: track.events[1].id, relativeTime: track.events[1].startedAt,
889:     type: 'user', harmonizationPolicy: 'automatic',
890:   });
891:   ctx = addHarmonicAnchor(ctx, {
892:     melodyEventId: track.events[3].id, relativeTime: track.events[3].startedAt,
893:     type: 'end', harmonizationPolicy: 'automatic',
894:   });
895:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
896:   const N = plan.steps.length;
897:   assertEqual(N, 3, 'plan fini à 3 étapes');
898: 
899:   const cardinalities = plan.steps.map((s) => s.candidate.pitchClasses.length);
900:   assertEqual(cardinalities[0], 4, 'premier candidat (Cmaj7) = 4 pitch classes');
901:   assertEqual(cardinalities[N - 1], 3, 'dernier candidat (C triade) = 3 pitch classes');
902:   assertTrue(new Set(cardinalities).size >= 2, 'au moins deux cardinalités distinctes');
903: 
904:   for (let i = 0; i < N; i++) {
905:     const s = plan.steps[i];
906:     // Chaque voicing correspond exactement à son candidat.
907:     assertTrue(s.voicing.candidate === s.candidate, `step[${i}] voicing.candidate === candidate`);
908:     // Notes MIDI valides (entiers finis 36-84 selon le contrat V1).
909:     for (const n of s.voicing.midiNotes) {
910:       assertTrue(Number.isInteger(n) && n >= 36 && n <= 84, `step[${i}] note MIDI valide ${n}`);
911:       assertTrue(Number.isFinite(n), `step[${i}] note finie`);
912:     }
913:     // Transitions harmoniques et de voicings conservées par référence.
914:     if (i > 0) {
915:       assertTrue(s.harmonicTransition === plan.harmonicPathResult.transitions[i - 1],
916:         `step[${i}].harmonicTransition === transitions[${i - 1}]`);
917:       assertTrue(s.voicingTransition === plan.voicingPathResult.transitions[i - 1],
918:         `step[${i}].voicingTransition === transitions[${i - 1}]`);
919:       assertEqual(s.harmonicTransition.fromId, plan.steps[i - 1].candidate.id,
920:         `ht[${i}].fromId === steps[${i - 1}].candidate.id`);
921:       assertEqual(s.harmonicTransition.toId, s.candidate.id,
922:         `ht[${i}].toId === steps[${i}].candidate.id`);
923:       assertTrue(s.voicingTransition.from === plan.steps[i - 1].voicing,
924:         `vt[${i}].from === steps[${i - 1}].voicing`);
925:       assertTrue(s.voicingTransition.to === s.voicing,
926:         `vt[${i}].to === steps[${i}].voicing`);
927:     }
928:   }
929:   // Tous les nombres des résultats, scores, mouvements et transitions sont
930:   // finis. Le contrôle récursif couvre totaux, compatibilityScore,
931:   // transitionScore, poids, champs numériques des transitions harmoniques,
932:   // des voicings, des scores de transitions de voicing, chaque VoicingMovement,
933:   // index et notes MIDI.
934:   assertAllNumbersFinite(plan.harmonicPathResult, 'plan.harmonicPathResult');
935:   assertAllNumbersFinite(plan.voicingPathResult, 'plan.voicingPathResult');
936: 
937:   // Vérifications explicites conservées sur les totaux et les sous-scores.
938:   assertTrue(Number.isFinite(plan.voicingPathResult.totalCost), 'totalCost fini');
939:   assertTrue(Number.isFinite(plan.voicingPathResult.totalMovement), 'totalMovement fini');
940:   assertTrue(Number.isFinite(plan.voicingPathResult.registerDeviation), 'registerDeviation fini');
941:   assertTrue(Number.isFinite(plan.harmonicPathResult.totalScore), 'hpath totalScore fini');
942:   assertTrue(plan.harmonicPathResult.transitionScore === null
943:     || Number.isFinite(plan.harmonicPathResult.transitionScore), 'hpath transitionScore fini ou null');
944:   assertTrue(Number.isFinite(plan.harmonicPathResult.compatibilityScore), 'hpath compatibilityScore fini');
945:   assertTrue(Number.isFinite(plan.harmonicPathResult.weights.compatibility)
946:     && Number.isFinite(plan.harmonicPathResult.weights.transition), 'hpath weights finis');
947:   for (const tr of plan.voicingPathResult.transitions) {
948:     assertTrue(Number.isFinite(tr.score.cost), 'vpath transition cost fini');
949:     assertTrue(Number.isFinite(tr.score.totalMovement), 'vpath transition movement fini');
950:     for (const m of tr.score.movements) {
951:       if (m.semitones !== null) assertTrue(Number.isFinite(m.semitones), 'movement semitones fini');
952:       if (m.fromIndex !== null) assertTrue(Number.isFinite(m.fromIndex), 'movement fromIndex fini');
953:       if (m.toIndex !== null) assertTrue(Number.isFinite(m.toIndex), 'movement toIndex fini');
954:     }
955:   }
956:   for (const tr of plan.harmonicPathResult.transitions) {
957:     assertTrue(Number.isFinite(tr.totalScore), 'hpath transition totalScore fini');
958:   }
959: });
960: 
961: // ===========================================================================
962: // T16 — Frontières de l'incrément (pas de champs audio/UI/lecture)
963: // ===========================================================================
964: 
965: runTest('T16 — aucun champ interdit dans les nouveaux conteneurs', () => {
966:   const track = trackFromMidiNotes([60, 64, 67]);
967:   const ctx = makeThreeAnchorContext(track);
968:   const plan = buildHarmonizationPlan({ track, harmonicContext: ctx });
969: 
970:   // Collecte uniquement les clés propres des nouveaux conteneurs (plan, steps,
971:   // candidateLayers, chaque couche), sans jamais parcourir les valeurs
972:   // référencées (track, harmonicContext, anchor, candidate, voicing,
973:   // harmonicTransition, voicingTransition, harmonicPathResult, voicingPathResult).
974:   const seen = collectNewContainerKeys(plan);
975: 
976:   // Vérifie l'absence des champs interdits parmi les clés des nouveaux
977:   // conteneurs. La liste et les clés observées sont toutes normalisées en
978:   // minuscules, donc noteOn/noteOff sont bel et bien détectés.
979:   for (const f of FORBIDDEN_FIELDS) {
980:     assertFalse(seen.has(f), `champ interdit présent: ${f}`);
981:   }
982: 
983:   // Clés exactes des steps déjà couvertes par T1 ; on re-vérifie ici que
984:   // chaque step ne porte que les 7 clés autorisées.
985:   for (let i = 0; i < plan.steps.length; i++) {
986:     const keys = Object.keys(plan.steps[i]);
987:     assertEqual(keys.length, 7, `step[${i}] exactement 7 clés`);
988:   }
989: 
990:   // Preuve synthétique : le collecteur détecte réellement noteOn, noteOff,
991:   // un champ interdit sur un step et un champ interdit sur une couche.
992:   // Ces conteneurs artificiels ne contiennent que des références nulles pour
993:   // ne pas parcourir d'objets canoniques réels.
994:   const syntheticPlan = {
995:     candidateLayers: [],
996:     steps: [],
997:   };
998:   const layerWithNoteOn = [];
999:   layerWithNoteOn.noteOn = true;
1000:   const layerWithNoteOff = [];
1001:   layerWithNoteOff.noteOff = true;
1002:   syntheticPlan.candidateLayers.push(layerWithNoteOn, layerWithNoteOff);
1003:   const stepWithAudio = {
1004:     anchor: null, candidate: null, candidateLayer: null,
1005:     harmonicTransition: null, index: 0, voicing: null, voicingTransition: null,
1006:     audio: null,
1007:   };
1008:   const stepWithUi = {
1009:     anchor: null, candidate: null, candidateLayer: null,
1010:     harmonicTransition: null, index: 1, voicing: null, voicingTransition: null,
1011:     ui: null,
1012:   };
1013:   syntheticPlan.steps.push(stepWithAudio, stepWithUi);
1014:   const syntheticSeen = collectNewContainerKeys(syntheticPlan);
1015:   assertTrue(syntheticSeen.has('noteon'), 'collecteur détecte noteOn sur une couche');
1016:   assertTrue(syntheticSeen.has('noteoff'), 'collecteur détecte noteOff sur une couche');
1017:   assertTrue(syntheticSeen.has('audio'), 'collecteur détecte un champ interdit sur un step');
1018:   assertTrue(syntheticSeen.has('ui'), 'collecteur détecte un autre champ interdit sur un step');
1019: });
1020: 
1021: // ===========================================================================
1022: // T17 — Chemin suffisamment long
1023: // ===========================================================================
1024: 
1025: runTest('T17 — chemin long : fini, longueurs cohérentes, ordre stable, déterminisme', () => {
1026:   const track = trackFromMidiNotes([60, 62, 64, 65, 67, 69, 71, 72]);
1027:   let ctx = harmonicContextInKey(track, 'C');
1028:   for (let i = 0; i < track.events.length; i++) {
1029:     ctx = addHarmonicAnchor(ctx, {
1030:       melodyEventId: track.events[i].id,
1031:       relativeTime: track.events[i].startedAt,
1032:       type: i === 0 ? 'start' : (i === track.events.length - 1 ? 'end' : 'user'),
1033:       harmonizationPolicy: 'automatic',
1034:     });
1035:   }
1036:   const N = ctx.anchors.length;
1037:   assertEqual(N, 8, '8 ancres');
1038: 

(Output capped at 50 KB. Showing lines 1-1038. Use offset=1039 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/harmonization-planner.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/harmonization-planner.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-08-07 — Incrément 8 : assemblage déterministe du pipeline
2: // complet de harmonisation mélodique.
3: //
4: // Orchestrateur pur : relie proprement les contrats déjà validés par les
5: // Incréments 2 (HarmonicContext), 4 (génération de ChordCandidate), 6 (chemin
6: // harmonique global) et 7 (chemin global de voicings jouables). Aucune nouvelle
7: // décision musicale : pas de recalcul de score, pas de reclassement, pas de
8: // greedy, pas de fallback, pas de génération de voicings maison, pas de
9: // remplacement de candidat verrouillé.
10: //
11: // Module pur : pas de DOM, pas de réseau, pas d'IA, pas de MIDI/audio émis, pas
12: // d'UI, pas de mutation des entrées, pas d'état global, pas de cache persistant
13: // entre deux appels, pas de Math.random, pas de date courante, pas
14: // d'identifiant généré. Aucune dépendance ajoutée.
15: //
16: // Complexité : linéaire en nombre d'ancres et de candidats copiés une fois les
17: // calculs amont effectués.
18: 
19: import { generateChordCandidatesForAnchor } from './chord-candidate-generator.js';
20: import { findBestHarmonicPath } from './harmonic-path-finder.js';
21: import { findBestVoicingPath } from './voicing-path-finder.js';
22: 
23: // ---------------------------------------------------------------------------
24: // Types conceptuels (documentés dans ./midi-types.js)
25: // ---------------------------------------------------------------------------
26: 
27: /**
28:  * @typedef {import('./midi-types.js').MelodyTrack} MelodyTrack
29:  * @typedef {import('./midi-types.js').HarmonicContext} HarmonicContext
30:  * @typedef {import('./midi-types.js').HarmonicAnchor} HarmonicAnchor
31:  * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
32:  * @typedef {import('./midi-types.js').HarmonicPathResult} HarmonicPathResult
33:  * @typedef {import('./midi-types.js').VoicingPathResult} VoicingPathResult
34:  * @typedef {import('./midi-types.js').HarmonizationStep} HarmonizationStep
35:  * @typedef {import('./midi-types.js').HarmonizationPlan} HarmonizationPlan
36:  */
37: 
38: // ---------------------------------------------------------------------------
39: // Helpers de validation du wrapper d'entrée
40: // ---------------------------------------------------------------------------
41: 
42: /**
43:  * Valide que l'argument d'options est un objet non nul et non tableau. Un
44:  * argument absent, null, une primitive ou une fonction est rejeté. Un tableau
45:  * est rejeté même s'il porte artificiellement des propriétés track /
46:  * harmonicContext.
47:  *
48:  * @param {unknown} options
49:  * @param {string} fnName
50:  * @returns {object} l'objet d'options validé
51:  */
52: function requireOptionsObject(options, fnName) {
53:   if (options === undefined) {
54:     throw new TypeError(`${fnName} : l argument d options est obligatoire`);
55:   }
56:   if (
57:     options === null ||
58:     typeof options !== 'object' ||
59:     Array.isArray(options) ||
60:     typeof options === 'function'
61:   ) {
62:     throw new TypeError(
63:       `${fnName} : l argument d options doit être un objet non nul et non tableau`,
64:     );
65:   }
66:   return options;
67: }
68: 
69: /**
70:  * Vérifie qu'une propriété est présente par propriété propre (et non héritée)
71:  * sur l'objet d'options.
72:  *
73:  * @param {object} options
74:  * @param {string} prop
75:  * @param {string} fnName
76:  */
77: function requireOwnProperty(options, prop, fnName) {
78:   if (!Object.prototype.hasOwnProperty.call(options, prop)) {
79:     throw new TypeError(`${fnName} : propriété '${prop}' manquante`);
80:   }
81: }
82: 
83: /**
84:  * Vérifie qu'une valeur est un objet non nul et non tableau (typage du contrat
85:  * public de `track` et `harmonicContext`).
86:  *
87:  * @param {unknown} value
88:  * @param {string} role
89:  */
90: function requireObjectNotArray(value, role) {
91:   if (value === null || value === undefined) {
92:     throw new TypeError(`${role} doit être un objet non nul`);
93:   }
94:   if (typeof value !== 'object' || Array.isArray(value) || typeof value === 'function') {
95:     throw new TypeError(`${role} doit être un objet non nul et non tableau`);
96:   }
97: }
98: 
99: /**
100:  * Vérifie que `anchors` est un tableau non creux d'objets non nuls. Les
101:  * validations profondes du contrat des ancres sont déléguées aux moteurs amont
102:  * (générateur de candidats, validateur de contexte) ; ici on ne rejette que
103:  * les structures inutilisables.
104:  *
105:  * @param {unknown} anchors
106:  */
107: function requireAnchorsArray(anchors) {
108:   if (!Array.isArray(anchors)) {
109:     throw new TypeError('harmonicContext.anchors doit être un tableau');
110:   }
111:   for (let i = 0; i < anchors.length; i++) {
112:     if (!(i in anchors)) {
113:       throw new TypeError('harmonicContext.anchors ne doit pas être un tableau creux');
114:     }
115:     const a = anchors[i];
116:     if (a === null || typeof a !== 'object' || Array.isArray(a) || typeof a === 'function') {
117:       throw new TypeError(`harmonicContext.anchors[${i}] doit être un objet ancre non nul`);
118:     }
119:   }
120: }
121: 
122: // ---------------------------------------------------------------------------
123: // API publique
124: // ---------------------------------------------------------------------------
125: 
126: /**
127:  * Assemble le plan d'harmonisation complet d'une phrase mélodique.
128:  *
129:  * Étapes :
130:  *   1. validation du wrapper { track, harmonicContext } ;
131:  *   2. lecture des ancres dans l ordre exact de harmonicContext.anchors ;
132:  *   3. génération des candidats via generateChordCandidatesForAnchor, une
133:  *      seule fois par ancre, dans l ordre stocké ;
134:  *   4. sélection du chemin harmonique global via findBestHarmonicPath ;
135:  *   5. sélection du chemin global de voicings via findBestVoicingPath ;
136:  *   6. construction des steps alignés couche par couche.
137:  *
138:  * Le plan ne modifie jamais les entrées, ne fige rien a posteriori, et ne
139:  * remplace ni ne contourne aucun choix des moteurs amont.
140:  *
141:  * @param {{ track: MelodyTrack, harmonicContext: HarmonicContext }} input
142:  * @returns {HarmonizationPlan}
143:  */
144: export function buildHarmonizationPlan(input) {
145:   const opts = requireOptionsObject(input, 'buildHarmonizationPlan');
146:   requireOwnProperty(opts, 'track', 'buildHarmonizationPlan');
147:   requireOwnProperty(opts, 'harmonicContext', 'buildHarmonizationPlan');
148:   const { track, harmonicContext } = opts;
149:   requireObjectNotArray(track, 'track');
150:   requireObjectNotArray(harmonicContext, 'harmonicContext');
151: 
152:   // Appartenance à une piste : le contrat canonique encode melodyTrackId.
153:   if (
154:     typeof harmonicContext.melodyTrackId === 'string' &&
155:     typeof track.id === 'string' &&
156:     harmonicContext.melodyTrackId !== track.id
157:   ) {
158:     throw new TypeError(
159:       `buildHarmonizationPlan : le contexte harmonique appartient à la piste ` +
160:       `"${harmonicContext.melodyTrackId}" mais la piste fournie est "${track.id}"`,
161:     );
162:   }
163: 
164:   // Les ancres sont lues dans l ordre exact du contexte canonique : jamais
165:   // triées, dédupliquées, remplacées ou réordonnées. Une absence d ancre est
166:   // une erreur de plage (RangeError) ; un tableau structurellement invalide
167:   // est une erreur de type (TypeError).
168:   requireAnchorsArray(harmonicContext.anchors);
169:   const anchors = harmonicContext.anchors;
170:   if (anchors.length === 0) {
171:     throw new RangeError(
172:       'buildHarmonizationPlan : aucun plan ne peut être construit sans ancre harmonique',
173:     );
174:   }
175:   const N = anchors.length;
176: 
177:   // Génération des candidats : une seule fois par ancre, dans l ordre stocké.
178:   // Chaque couche est une copie figée du tableau retourné ; les références
179:   // exactes des candidats sont préservées. Aucun reclassement, aucun tri.
180:   //
181:   // Classification des statuts canoniques du générateur :
182:   //   invalid-anchor → TypeError (ancre structurellement invalide)
183:   //   skipped / no-valid-candidate → RangeError (ancre valide sans candidat)
184:   //   generated → procéder normalement
185:   const candidateLayersFrozen = [];
186:   for (let i = 0; i < N; i++) {
187:     const result = generateChordCandidatesForAnchor({
188:       anchor: anchors[i],
189:       track,
190:       harmonicContext,
191:     });
192:     const anchorId = anchors[i] && anchors[i].id ? anchors[i].id : null;
193:     const idSuffix = anchorId !== null ? ` (${anchorId})` : '';
194: 
195:     if (result.status === 'invalid-anchor') {
196:       throw new TypeError(
197:         `buildHarmonizationPlan : ancre d indice ${i}${idSuffix} structurellement invalide`,
198:       );
199:     }
200:     if (result.status === 'skipped' || result.status === 'no-valid-candidate') {
201:       throw new RangeError(
202:         `buildHarmonizationPlan : aucune couche de candidat admissible pour ` +
203:         `l ancre d indice ${i}${idSuffix}`,
204:       );
205:     }
206: 
207:     const layer = result.candidates;
208:     if (!Array.isArray(layer) || layer.length === 0) {
209:       throw new RangeError(
210:         `buildHarmonizationPlan : aucune couche de candidat admissible pour ` +
211:         `l ancre d indice ${i}${idSuffix}`,
212:       );
213:     }
214:     // Copie plate figée : les références des candidats sont conservées telles
215:     // quelles (aucun clone), seul le conteneur est nouveau et figé.
216:     candidateLayersFrozen.push(Object.freeze(layer.slice()));
217:   }
218:   const candidateLayers = Object.freeze(candidateLayersFrozen);
219: 
220:   // Chemin harmonique global : exactement l objet retourné par le moteur.
221:   const harmonicPathResult = findBestHarmonicPath({ candidateLayers });
222: 
223:   // Chemin global de voicings : exactement l objet retourné par le moteur.
224:   const voicingPathResult = findBestVoicingPath({ harmonicPathResult });
225: 
226:   // Construction des steps alignés couche par couche. Les transitions sont
227:   // entrantes : null au premier step, puis transitions[i-1] pour i > 0.
228:   const stepsArr = [];
229:   for (let i = 0; i < N; i++) {
230:     const step = {
231:       index: i,
232:       anchor: anchors[i],
233:       candidateLayer: candidateLayers[i],
234:       candidate: harmonicPathResult.path[i],
235:       voicing: voicingPathResult.voicings[i],
236:       harmonicTransition: i === 0 ? null : harmonicPathResult.transitions[i - 1],
237:       voicingTransition: i === 0 ? null : voicingPathResult.transitions[i - 1],
238:     };
239:     stepsArr.push(Object.freeze(step));
240:   }
241:   const steps = Object.freeze(stepsArr);
242: 
243:   return Object.freeze({
244:     track,
245:     harmonicContext,
246:     candidateLayers,
247:     harmonicPathResult,
248:     voicingPathResult,
249:     steps,
250:   });
251: }

(End of file - total 251 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/chord-candidate-generator.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/chord-candidate-generator.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-08-06 — Incrément 4 : génération des candidats d’accords.
2: // Pour chaque ancre harmonique éligible, produit un ensemble déterministe de
3: // ChordCandidate compatibles avec la mélodie, les politiques, le contexte tonal
4: // et les accords de début/fin verrouillés.
5: //
6: // Ce module est pur : pas de DOM, pas de réseau, pas d’IA, pas de mutation des
7: // entrées. Il consomme exclusivement CHORD_DEFINITIONS via
8: // resolveCanonicalChordDefinition / parseChordSymbol.
9: 
10: import { resolveCanonicalChordDefinition, parseChordSymbol } from '../chord-engine/chord-display.js';
11: import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
12: import { transposePc } from '../chord-engine/intervals.js';
13: import {
14:   spellPitchClass,
15:   spellMidiNote,
16:   spellChordReference,
17:   parseSpelledChordSymbol,
18: } from './spelled-pitch.js';
19: 
20: // ---------------------------------------------------------------------------
21: // Constantes
22: // ---------------------------------------------------------------------------
23: 
24: // Vocabulaire harmonique initial supporté.
25: const SUPPORTED_QUALITIES = new Set([
26:   '', 'm', 'maj7', 'm7', '7', 'm7b5', 'dim7',
27:   '6', 'm6', '6/9', 'maj9', 'm9', '9',
28:   '7sus4', '9sus4', '7b9', '13',
29: ]);
30: 
31: // Ordre de priorité déterministe des sources.
32: const SOURCE_PRIORITY = {
33:   'locked-boundary': 0,
34:   'manual': 1,
35:   'diatonic': 2,
36:   'substitution': 3,
37:   'secondary-dominant': 4,
38:   'diminished-approach': 5,
39:   'borrowed': 6,
40: };
41: 
42: const DEFAULT_MAX_CANDIDATES_PER_ANCHOR = 20;
43: 
44: // Degrés diatoniques majeurs en jazz : qualité et intervalle depuis la tonique.
45: const MAJOR_DEGREES = [
46:   { degree: 0, quality: 'maj7', rootOffset: 0, roman: 'I' },
47:   { degree: 1, quality: 'm7', rootOffset: 2, roman: 'ii' },
48:   { degree: 2, quality: 'm7', rootOffset: 4, roman: 'iii' },
49:   { degree: 3, quality: 'maj7', rootOffset: 5, roman: 'IV' },
50:   { degree: 4, quality: '7', rootOffset: 7, roman: 'V' },
51:   { degree: 5, quality: 'm7', rootOffset: 9, roman: 'vi' },
52:   { degree: 6, quality: 'm7b5', rootOffset: 11, roman: 'vii°' },
53: ];
54: 
55: // Degrés diatoniques mineurs naturels (tonique = degré I mineur).
56: const MINOR_DEGREES = [
57:   { degree: 0, quality: 'm7', rootOffset: 0, roman: 'i' },
58:   { degree: 1, quality: 'm7b5', rootOffset: 2, roman: 'ii°' },
59:   { degree: 2, quality: 'maj7', rootOffset: 3, roman: 'III' },
60:   { degree: 3, quality: 'm7', rootOffset: 5, roman: 'iv' },
61:   { degree: 4, quality: '7', rootOffset: 7, roman: 'V' },
62:   { degree: 5, quality: 'maj7', rootOffset: 8, roman: 'VI' },
63:   { degree: 6, quality: '7', rootOffset: 10, roman: 'VII' },
64: ];
65: 
66: // Substitutions diatoniques documentées.
67: // Chaque entrée indique : dans un mode donné, le degré source peut substituer
68: // le degré cible lorsque la note mélodique est compatible.
69: const DIATONIC_SUBSTITUTIONS = [
70:   // En majeur, iii (m7) peut substituer I (maj7) : Em7 et Cmaj7 partagent E, G, B.
71:   { mode: 'major', sourceDegree: 2, targetDegree: 0, relation: 'iii-for-I' },
72:   // En majeur, vi (m7) peut substituer IV (maj7) : Am7 et Fmaj7 partagent A, C, E.
73:   { mode: 'major', sourceDegree: 5, targetDegree: 3, relation: 'vi-for-IV' },
74: ];
75: 
76: // ---------------------------------------------------------------------------
77: // Types conceptuels (documentés dans ./midi-types.js)
78: // ---------------------------------------------------------------------------
79: 
80: /**
81:  * @typedef {import('./midi-types.js').HarmonicAnchor} HarmonicAnchor
82:  * @typedef {import('./midi-types.js').HarmonicContext} HarmonicContext
83:  * @typedef {import('./midi-types.js').MelodyEvent} MelodyEvent
84:  * @typedef {import('./midi-types.js').MelodyTrack} MelodyTrack
85:  * @typedef {import('./midi-types.js').TonalContext} TonalContext
86:  * @typedef {import('./midi-types.js').ChordReference} ChordReference
87:  * @typedef {import('./midi-types.js').ChordCandidate} ChordCandidate
88:  * @typedef {import('./midi-types.js').MelodyCompatibility} MelodyCompatibility
89:  * @typedef {import('./midi-types.js').TonalRelation} TonalRelation
90:  * @typedef {import('./midi-types.js').CandidateValidationReport} CandidateValidationReport
91:  * @typedef {import('./midi-types.js').AnchorCandidateGenerationResult} AnchorCandidateGenerationResult
92:  * @typedef {import('./midi-types.js').ValidationIssue} ValidationIssue
93:  */
94: 
95: // ---------------------------------------------------------------------------
96: // Helpers de base
97: // ---------------------------------------------------------------------------
98: 
99: function normalizePc(pc) {
100:   return ((pc % 12) + 12) % 12;
101: }
102: 
103: function isValidPitchClass(pc) {
104:   return Number.isInteger(pc) && pc >= 0 && pc <= 11;
105: }
106: 
107: function isSupportedQuality(quality) {
108:   return typeof quality === 'string' && SUPPORTED_QUALITIES.has(quality);
109: }
110: 
111: /**
112:  * Retourne la définition canonique d'une qualité supportée, ou null.
113:  *
114:  * @param {string} quality
115:  * @returns {{ name: string, symbol: string, intervals: number[], identityIntervals?: number[], optionalIntervals?: number[], defaultOmissions?: number[], supportedOmissions?: number[], extensionIntervals?: number[], suspensionIntervals?: number[] } | null}
116:  */
117: function getCanonicalDefinition(quality) {
118:   const def = resolveCanonicalChordDefinition(quality);
119:   if (!def) return null;
120:   return def;
121: }
122: 
123: /**
124:  * Calcule les pitch classes d'un accord à partir de sa fondamentale et qualité.
125:  *
126:  * @param {number} rootPc
127:  * @param {string} quality
128:  * @returns {number[]}
129:  */
130: function computeChordPitchClasses(rootPc, quality) {
131:   const def = getCanonicalDefinition(quality);
132:   const intervals = def ? def.intervals : [0, 4, 7];
133:   const pcs = intervals.map((i) => normalizePc(rootPc + i));
134:   return Array.from(new Set(pcs)).sort((a, b) => a - b);
135: }
136: 
137: /**
138:  * Retourne les métadonnées d'identité d'une qualité, avec valeurs par défaut.
139:  *
140:  * @param {string} quality
141:  * @returns {{
142:  *   identityIntervals: number[],
143:  *   optionalIntervals: number[],
144:  *   defaultOmissions: number[],
145:  *   supportedOmissions: number[],
146:  *   extensionIntervals: number[],
147:  *   suspensionIntervals: number[]
148:  * }}
149:  */
150: function getIdentityMetadata(quality) {
151:   const def = getCanonicalDefinition(quality);
152:   const intervals = def ? def.intervals : [0, 4, 7];
153:   const nonRoot = intervals.filter((i) => i !== 0);
154: 
155:   // Valeurs par défaut : tout intervalle non-fondamentale est identitaire,
156:   // sauf la quinte juste (7) considérée comme optionnelle.
157:   const defaultIdentity = nonRoot.filter((i) => i !== 7);
158:   const defaultOptional = nonRoot.includes(7) ? [7] : [];
159: 
160:   return {
161:     identityIntervals: def && def.identityIntervals ? def.identityIntervals : defaultIdentity,
162:     optionalIntervals: def && def.optionalIntervals ? def.optionalIntervals : defaultOptional,
163:     defaultOmissions: def && def.defaultOmissions ? def.defaultOmissions : [],
164:     supportedOmissions: def && def.supportedOmissions ? def.supportedOmissions : [],
165:     extensionIntervals: def && def.extensionIntervals ? def.extensionIntervals : [],
166:     suspensionIntervals: def && def.suspensionIntervals ? def.suspensionIntervals : [],
167:   };
168: }
169: 
170: /**
171:  * Construit une ChordReference à partir de données numériques, avec orthographe
172:  * contextuelle.
173:  *
174:  * @param {number} rootPc
175:  * @param {string} quality
176:  * @param {number | null} bassPc
177:  * @param {TonalContext | null} tonalContext
178:  * @param {ChordReference | null} explicitReference
179:  * @returns {ChordReference}
180:  */
181: function buildChordReference(rootPc, quality, bassPc, tonalContext, explicitReference) {
182:   if (explicitReference) {
183:     return spellChordReference(explicitReference, tonalContext);
184:   }
185: 
186:   // Sans symbole original explicite, on applique directement l'orthographe
187:   // contextuelle. On ne construit pas de symbole artificiel avec dièses qui
188:   // serait interprété comme une orthographe explicite.
189:   return {
190:     root: rootPc,
191:     quality,
192:     bass: bassPc,
193:     rootSpelling: spellPitchClass(rootPc, tonalContext),
194:     bassSpelling: bassPc != null ? spellPitchClass(bassPc, tonalContext) : null,
195:     originalSymbol: null,
196:   };
197: }
198: 
199: /**
200:  * Propose une orthographe contextuelle pour chaque note de l'accord.
201:  *
202:  * @param {number[]} pitchClasses
203:  * @param {TonalContext | null} tonalContext
204:  * @returns {import('./midi-types.js').SpelledPitch[]}
205:  */
206: function spellChordTones(pitchClasses, tonalContext) {
207:   return pitchClasses.map((pc) => spellPitchClass(pc, tonalContext));
208: }
209: 
210: /**
211:  * Détermine le degré diatonique d'une fondamentale dans une tonalité.
212:  *
213:  * @param {number} rootPc
214:  * @param {TonalContext | null} tonalContext
215:  * @returns {{ degree: number | null, romanNumeral: string | null, mode: string | null }}
216:  */
217: function resolveDegree(rootPc, tonalContext) {
218:   if (!tonalContext || !tonalContext.selected) {
219:     return { degree: null, romanNumeral: null, mode: null };
220:   }
221:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
222:   const mode = tonalContext.selected.mode;
223:   const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
224:   const match = degrees.find((d) => normalizePc(tonic + d.rootOffset) === normalizePc(rootPc));
225:   if (!match) return { degree: null, romanNumeral: null, mode };
226:   return { degree: match.degree, romanNumeral: match.roman, mode };
227: }
228: 
229: // ---------------------------------------------------------------------------
230: // Identifiants déterministes
231: // ---------------------------------------------------------------------------
232: 
233: function makeCandidateId(anchorId, rootPc, quality, bassPc, source, melodyPc) {
234:   const bass = bassPc != null ? String(bassPc) : 'x';
235:   return `cand-${anchorId}-r${rootPc}-q${quality || 'maj'}-b${bass}-s${source}-m${melodyPc}`;
236: }
237: 
238: // ---------------------------------------------------------------------------
239: // Validation
240: // ---------------------------------------------------------------------------
241: 
242: /**
243:  * Valide un candidat brut.
244:  *
245:  * @param {ChordCandidate} candidate
246:  * @param {object} context
247:  * @returns {CandidateValidationReport}
248:  */
249: function validateChordCandidate(candidate, context) {
250:   const hardViolations = [];
251:   const warnings = [];
252:   const satisfiedConstraints = [];
253: 
254:   // 1. Ancre valide
255:   if (!candidate.anchorId) {
256:     hardViolations.push({
257:       severity: 'error',
258:       code: 'MISSING_ANCHOR_ID',
259:       message: 'Le candidat n\'a pas d\'identifiant d\'ancre.',
260:       anchorId: null,
261:       melodyEventId: candidate.melodyEventId,
262:       details: {},
263:     });
264:   } else {
265:     satisfiedConstraints.push('anchor-id-present');
266:   }
267: 
268:   // 2. Qualité canonique
269:   if (!isSupportedQuality(candidate.qualityId)) {
270:     hardViolations.push({
271:       severity: 'error',
272:       code: 'UNSUPPORTED_QUALITY',
273:       message: `La qualité "${candidate.qualityId}" n'est pas dans le vocabulaire initial.`,
274:       anchorId: candidate.anchorId,
275:       melodyEventId: candidate.melodyEventId,
276:       details: { qualityId: candidate.qualityId },
277:     });
278:   } else {
279:     satisfiedConstraints.push('quality-in-vocabulary');
280:   }
281: 
282:   const def = getCanonicalDefinition(candidate.qualityId);
283:   if (!def) {
284:     hardViolations.push({
285:       severity: 'error',
286:       code: 'UNKNOWN_DEFINITION',
287:       message: `Aucune définition canonique pour "${candidate.qualityId}".`,
288:       anchorId: candidate.anchorId,
289:       melodyEventId: candidate.melodyEventId,
290:       details: { qualityId: candidate.qualityId },
291:     });
292:   } else {
293:     satisfiedConstraints.push('canonical-definition-exists');
294:   }
295: 
296:   // 3. Orthographe valide
297:   if (!candidate.rootSpelling || candidate.rootSpelling.pitchClass !== candidate.rootPitchClass) {
298:     hardViolations.push({
299:       severity: 'error',
300:       code: 'INVALID_ROOT_SPELLING',
301:       message: 'Orthographe de fondamentale incohérente avec la pitch class.',
302:       anchorId: candidate.anchorId,
303:       melodyEventId: candidate.melodyEventId,
304:       details: { rootPitchClass: candidate.rootPitchClass },
305:     });
306:   } else {
307:     satisfiedConstraints.push('root-spelling-valid');
308:   }
309: 
310:   // 4. Intervalles identitaires préservables
311:   const meta = getIdentityMetadata(candidate.qualityId);
312:   for (const interval of meta.identityIntervals) {
313:     const expectedPc = normalizePc(candidate.rootPitchClass + interval);
314:     if (!candidate.pitchClasses.includes(expectedPc)) {
315:       hardViolations.push({
316:         severity: 'error',
317:         code: 'MISSING_IDENTITY_INTERVAL',
318:         message: `Intervalle identitaire ${interval} manquant pour ${candidate.qualityId}.`,
319:         anchorId: candidate.anchorId,
320:         melodyEventId: candidate.melodyEventId,
321:         details: { interval, expectedPitchClass: expectedPc },
322:       });
323:     }
324:   }
325:   if (hardViolations.every((v) => v.code !== 'MISSING_IDENTITY_INTERVAL')) {
326:     satisfiedConstraints.push('identity-intervals-preserved');
327:   }
328: 
329:   // 5. Mélodie compatible selon les politiques
330:   const compat = candidate.melodyCompatibility;
331:   if (compat.category === 'incompatible') {
332:     hardViolations.push({
333:       severity: 'error',
334:       code: 'MELODY_INCOMPATIBLE',
335:       message: `La mélodie (pc ${compat.melodyPitchClass}) est incompatible avec ${candidate.qualityId}.`,
336:       anchorId: candidate.anchorId,
337:       melodyEventId: candidate.melodyEventId,
338:       details: { melodyPitchClass: compat.melodyPitchClass },
339:     });
340:   } else {
341:     satisfiedConstraints.push('melody-compatible');
342:   }
343: 
344:   // 6. Omission autorisée
345:   for (const omitted of candidate.omittedIntervals) {
346:     if (!meta.supportedOmissions.includes(omitted) && !meta.optionalIntervals.includes(omitted)) {
347:       hardViolations.push({
348:         severity: 'error',
349:         code: 'FORBIDDEN_OMISSION',
350:         message: `L'omission de l'intervalle ${omitted} n'est pas supportée pour ${candidate.qualityId}.`,
351:         anchorId: candidate.anchorId,
352:         melodyEventId: candidate.melodyEventId,
353:         details: { omittedInterval: omitted },
354:       });
355:     }
356:   }
357:   if (!hardViolations.some((v) => v.code === 'FORBIDDEN_OMISSION')) {
358:     satisfiedConstraints.push('omissions-allowed');
359:   }
360: 
361:   // 7. Avertissements contextuels
362:   if (candidate.tonalRelation.borrowed) {
363:     warnings.push({
364:       severity: 'warning',
365:       code: 'BORROWED_CHORD',
366:       message: `Accord emprunté : ${candidate.tonalRelation.romanNumeral || ''}.`,
367:       anchorId: candidate.anchorId,
368:       melodyEventId: candidate.melodyEventId,
369:       details: { tonalRelation: candidate.tonalRelation },
370:     });
371:   }
372: 
373:   // 8. Avertissements heuristiques sur les catégories mélodiques permissives.
374:   // Ces classifications sont initiales ; la justification musicale complète
375:   // (durée, position temporelle, résolution) sera vérifiée lors du voicing.
376:   if (compat.category === 'non-chord-tone-allowed') {
377:     warnings.push({
378:       severity: 'warning',
379:       code: 'NON_CHORD_TONE_HEURISTIC',
380:       message: 'Note mélodique classée comme non-chord-tone autorisée : justification musicale à vérifier lors du voicing.',
381:       anchorId: candidate.anchorId,
382:       melodyEventId: candidate.melodyEventId,
383:       details: { melodyPitchClass: compat.melodyPitchClass },
384:     });
385:   }
386:   if (compat.category === 'suspension') {
387:     warnings.push({
388:       severity: 'warning',
389:       code: 'SUSPENSION_HEURISTIC',
390:       message: 'Note mélodique classée comme suspension : résolution et contexte à vérifier lors du voicing.',
391:       anchorId: candidate.anchorId,
392:       melodyEventId: candidate.melodyEventId,
393:       details: { melodyPitchClass: compat.melodyPitchClass, matchingInterval: compat.matchingInterval },
394:     });
395:   }
396: 
397:   return {
398:     valid: hardViolations.length === 0,
399:     hardViolations,
400:     warnings,
401:     satisfiedConstraints,
402:   };
403: }
404: 
405: // ---------------------------------------------------------------------------
406: // Compatibilité mélodique
407: // ---------------------------------------------------------------------------
408: 
409: /**
410:  * Classifie la compatibilité d'une note mélodique avec un candidat.
411:  *
412:  * @param {{
413:  *   melodyEvent: MelodyEvent | null,
414:  *   rootPc: number,
415:  *   quality: string,
416:  *   bassPc: number | null,
417:  *   policies: { sopranoPolicy: string, harmonizationPolicy: string, preserveExactPitch: boolean }
418:  * }} input
419:  * @returns {MelodyCompatibility}
420:  */
421: function classifyMelodyCompatibility(input) {
422:   const { melodyEvent, rootPc, quality, bassPc, policies } = input;
423: 
424:   const noMelodyResult = {
425:     category: 'non-chord-tone-allowed',
426:     melodyPitchClass: -1,
427:     melodyMidi: null,
428:     matchingInterval: null,
429:     exactPitchRequired: false,
430:     exactPitchSatisfied: false,
431:     sopranoPolicy: policies.sopranoPolicy,
432:     harmonizationPolicy: policies.harmonizationPolicy,
433:     reasons: ['Aucun événement mélodique fourni : l\'ancre est traitée sans contrainte mélodique.'],
434:   };
435: 
436:   if (!melodyEvent) {
437:     return noMelodyResult;
438:   }
439: 
440:   const melodyPc = normalizePc(melodyEvent.pitchClass);
441:   const melodyMidi = melodyEvent.midi;
442:   const interval = normalizePc(melodyPc - rootPc);
443: 
444:   const meta = getIdentityMetadata(quality);
445:   const allPcs = computeChordPitchClasses(rootPc, quality);
446:   const bassPcNorm = bassPc != null ? normalizePc(bassPc) : null;
447: 
448:   const reasons = [];
449:   let category = 'incompatible';
450:   let matchingInterval = null;
451: 
452:   if (allPcs.includes(melodyPc) || meta.identityIntervals.includes(interval)) {
453:     category = 'chord-tone';
454:     matchingInterval = interval;
455:     reasons.push(`La mélodie (pc ${melodyPc}) est une note constitutive de l'accord.`);
456:   } else if (meta.extensionIntervals.includes(interval)) {
457:     category = 'available-tension';
458:     matchingInterval = interval;
459:     reasons.push(`La mélodie (pc ${melodyPc}) est une tension disponible.`);
460:   } else if (meta.suspensionIntervals.includes(interval)) {
461:     category = 'suspension';
462:     matchingInterval = interval;
463:     reasons.push(`La mélodie (pc ${melodyPc}) est traitée comme suspension.`);
464:   } else if (policies.harmonizationPolicy === 'automatic') {
465:     category = 'non-chord-tone-allowed';
466:     matchingInterval = interval;
467:     reasons.push(`La mélodie (pc ${melodyPc}) est une note non constitutive tolérée en mode automatique.`);
468:   } else if (policies.harmonizationPolicy === 'force') {
469:     category = 'incompatible';
470:     reasons.push(`La mélodie (pc ${melodyPc}) n'appartient pas à l'accord en mode force.`);
471:   }
472: 
473:   // La basse slash n'influe pas sur la compatibilité mélodique : la note
474:   // mélodique est évaluée par rapport à l'accord complet.
475:   if (bassPcNorm != null && !allPcs.includes(bassPcNorm)) {
476:     reasons.push(`Basse slash ${bassPcNorm} ajoutée en dehors des notes de l'accord.`);
477:   }
478: 
479:   const exactPitchRequired = policies.preserveExactPitch === true;
480:   // La contrainte d'exactitude MIDI est enregistrée pour le voicing futur.
481:   // À ce stade, aucun voicing n'est généré : on ne prétend pas que la
482:   // contrainte est déjà satisfaite, et on évite toute réduction à la pitch class.
483:   const exactPitchSatisfied = exactPitchRequired ? false : true;
484: 
485:   if (exactPitchRequired) {
486:     reasons.push(`Contrainte d'exactitude MIDI enregistrée (midi ${melodyMidi}) pour le voicing futur.`);
487:   }
488: 
489:   return {
490:     category,
491:     melodyPitchClass: melodyPc,
492:     melodyMidi,
493:     matchingInterval,
494:     exactPitchRequired,
495:     exactPitchSatisfied,
496:     sopranoPolicy: policies.sopranoPolicy,
497:     harmonizationPolicy: policies.harmonizationPolicy,
498:     reasons,
499:   };
500: }
501: 
502: // ---------------------------------------------------------------------------
503: // Construction d'un candidat
504: // ---------------------------------------------------------------------------
505: 
506: /**
507:  * Construit un ChordCandidate complet et immuable.
508:  *
509:  * @param {object} input
510:  * @returns {ChordCandidate}
511:  */
512: function buildCandidate(input) {
513:   const {
514:     anchorId,
515:     melodyEvent,
516:     rootPc,
517:     quality,
518:     bassPc,
519:     tonalContext,
520:     source,
521:     locked,
522:     tonalRelation,
523:     explicitReference,
524:     policies: inputPolicies,
525:   } = input;
526: 
527:   const melodyEventId = melodyEvent ? melodyEvent.id : null;
528:   const chordRef = buildChordReference(rootPc, quality, bassPc, tonalContext, explicitReference);
529:   const pitchClasses = computeChordPitchClasses(rootPc, quality);
530:   const spelledTones = spellChordTones(pitchClasses, tonalContext);
531:   const meta = getIdentityMetadata(quality);
532: 
533:   const policies = inputPolicies || {
534:     sopranoPolicy: melodyEvent ? melodyEvent.sopranoPolicy : 'free',
535:     harmonizationPolicy: melodyEvent ? melodyEvent.harmonizationPolicy : 'automatic',
536:     preserveExactPitch: melodyEvent ? melodyEvent.preserveExactPitch : false,
537:   };
538: 
539:   const melodyCompatibility = classifyMelodyCompatibility({
540:     melodyEvent,
541:     rootPc,
542:     quality,
543:     bassPc,
544:     policies,
545:   });
546: 
547:   const candidate = {
548:     id: makeCandidateId(anchorId, rootPc, quality, bassPc, source, melodyEvent ? melodyEvent.pitchClass : -1),
549:     anchorId,
550:     melodyEventId,
551:     chord: chordRef,
552:     rootPitchClass: rootPc,
553:     rootSpelling: chordRef.rootSpelling,
554:     bassPitchClass: bassPc,
555:     bassSpelling: chordRef.bassSpelling,
556:     qualityId: quality,
557:     canonicalDefinitionId: quality,
558:     pitchClasses,
559:     spelledTones,
560:     identityIntervals: meta.identityIntervals,
561:     optionalIntervals: meta.optionalIntervals,
562:     omittedIntervals: meta.defaultOmissions,
563:     omissionReason: meta.defaultOmissions.length > 0
564:       ? 'Omissions par défaut documentées pour cette qualité.'
565:       : null,
566:     melodyCompatibility,
567:     tonalRelation,
568:     locked: locked === true,
569:     source,
570:     validation: {
571:       valid: true,
572:       hardViolations: [],
573:       warnings: [],
574:       satisfiedConstraints: [],
575:     },
576:   };
577: 
578:   candidate.validation = validateChordCandidate(candidate, {});
579:   return Object.freeze(candidate);
580: }
581: 
582: // ---------------------------------------------------------------------------
583: // Familles de candidats
584: // ---------------------------------------------------------------------------
585: 
586: function buildDiatonicCandidates(input) {
587:   const { anchorId, melodyEvent, tonalContext, locked, sourceOverride, policies } = input;
588:   if (!tonalContext || !tonalContext.selected) return [];
589: 
590:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
591:   const mode = tonalContext.selected.mode;
592:   const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
593: 
594:   const candidates = [];
595:   for (const deg of degrees) {
596:     if (!isSupportedQuality(deg.quality)) continue;
597: 
598:     const rootPc = normalizePc(tonic + deg.rootOffset);
599:     const tonalRelation = {
600:       degree: deg.degree,
601:       romanNumeral: deg.roman,
602:       diatonic: true,
603:       borrowed: false,
604:       secondaryDominantTarget: null,
605:       approachType: 'none',
606:     };
607: 
608:     candidates.push(buildCandidate({
609:       anchorId,
610:       melodyEvent,
611:       rootPc,
612:       quality: deg.quality,
613:       bassPc: null,
614:       tonalContext,
615:       source: sourceOverride || 'diatonic',
616:       locked,
617:       tonalRelation,
618:       policies,
619:     }));
620:   }
621:   return candidates;
622: }
623: 
624: function buildDiatonicSubstitutionCandidates(input) {
625:   const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
626:   if (!tonalContext || !tonalContext.selected) return [];
627: 
628:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
629:   const mode = tonalContext.selected.mode;
630: 
631:   const candidates = [];
632:   for (const sub of DIATONIC_SUBSTITUTIONS) {
633:     if (sub.mode !== mode) continue;
634: 
635:     const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
636:     const sourceDeg = degrees.find((d) => d.degree === sub.sourceDegree);
637:     if (!sourceDeg || !isSupportedQuality(sourceDeg.quality)) continue;
638: 
639:     const rootPc = normalizePc(tonic + sourceDeg.rootOffset);
640:     const tonalRelation = {
641:       degree: sourceDeg.degree,
642:       romanNumeral: sourceDeg.roman,
643:       diatonic: true,
644:       borrowed: false,
645:       secondaryDominantTarget: null,
646:       approachType: 'diatonic-substitution',
647:     };
648: 
649:     candidates.push(buildCandidate({
650:       anchorId,
651:       melodyEvent,
652:       rootPc,
653:       quality: sourceDeg.quality,
654:       bassPc: null,
655:       tonalContext,
656:       source: 'substitution',
657:       locked,
658:       tonalRelation,
659:       policies,
660:     }));
661:   }
662:   return candidates;
663: }
664: 
665: function buildSecondaryDominantCandidates(input) {
666:   const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
667:   if (!tonalContext || !tonalContext.selected) return [];
668: 
669:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
670:   const mode = tonalContext.selected.mode;
671: 
672:   // Tables de dominantes secondaires valides.
673:   const majorTargets = [1, 2, 3, 4, 5, 6]; // V/ii, V/iii, V/IV, V/V, V/vi, V/vii°
674:   const minorTargets = [2, 3, 4, 5, 6]; // V/III, V/iv, V/V, V/VI, V/VII
675:   const targets = mode === 'minor' ? minorTargets : majorTargets;
676:   const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
677: 
678:   const candidates = [];
679:   for (const targetDegree of targets) {
680:     const targetDeg = degrees.find((d) => d.degree === targetDegree);
681:     if (!targetDeg) continue;
682: 
683:     // La dominante secondaire est un accord de 7 situé une quinte au-dessus
684:     // de la cible (intervalle +7 demi-tons).
685:     const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
686:     const dominantRoot = normalizePc(targetRoot + 7);
687: 
688:     if (!isSupportedQuality('7')) continue;
689: 
690:     const tonalRelation = {
691:       degree: null,
692:       romanNumeral: `V/${targetDeg.roman}`,
693:       diatonic: false,
694:       borrowed: false,
695:       secondaryDominantTarget: targetDegree,
696:       approachType: 'secondary-dominant',
697:     };
698: 
699:     candidates.push(buildCandidate({
700:       anchorId,
701:       melodyEvent,
702:       rootPc: dominantRoot,
703:       quality: '7',
704:       bassPc: null,
705:       tonalContext,
706:       source: 'secondary-dominant',
707:       locked,
708:       tonalRelation,
709:       policies,
710:     }));
711:   }
712:   return candidates;
713: }
714: 
715: function buildDiminishedApproachCandidates(input) {
716:   const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
717:   if (!tonalContext || !tonalContext.selected) return [];
718: 
719:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
720:   const mode = tonalContext.selected.mode;
721:   const degrees = mode === 'minor' ? MINOR_DEGREES : MAJOR_DEGREES;
722: 
723:   const candidates = [];
724:   for (const targetDeg of degrees) {
725:     if (!isSupportedQuality('dim7')) continue;
726: 
727:     const targetRoot = normalizePc(tonic + targetDeg.rootOffset);
728:     // Diminué d'approche : fondamentale un demi-ton chromatique au-dessus de la cible.
729:     const approachRoot = normalizePc(targetRoot + 1);
730: 
731:     const tonalRelation = {
732:       degree: null,
733:       romanNumeral: `dim7→${targetDeg.roman}`,
734:       diatonic: false,
735:       borrowed: false,
736:       secondaryDominantTarget: null,
737:       approachType: 'diminished-approach',
738:     };
739: 
740:     candidates.push(buildCandidate({
741:       anchorId,
742:       melodyEvent,
743:       rootPc: approachRoot,
744:       quality: 'dim7',
745:       bassPc: null,
746:       tonalContext,
747:       source: 'diminished-approach',
748:       locked,
749:       tonalRelation,
750:       policies,
751:     }));
752:   }
753: 
754:   // Le dim7 est symétrique : quatre noms enharmoniques partagent les mêmes notes.
755:   // On retient un seul candidat par cible diatonique, pas quatre doublons.
756:   return candidates;
757: }
758: 
759: function buildBorrowedCandidates(input) {
760:   const { anchorId, melodyEvent, tonalContext, locked, policies } = input;
761:   if (!tonalContext || !tonalContext.selected) return [];
762: 
763:   const tonic = normalizePc(tonalContext.selected.tonicPitchClass);
764:   const mode = tonalContext.selected.mode;
765:   if (mode !== 'major') return [];
766: 
767:   // Emprunts modaux limités depuis le mineur parallèle.
768:   const borrowings = [
769:     { rootOffset: 3, quality: 'maj7', roman: 'bIII' },
770:     { rootOffset: 8, quality: 'maj7', roman: 'bVI' },
771:     { rootOffset: 10, quality: '7', roman: 'bVII' },
772:     { rootOffset: 5, quality: 'm7', roman: 'iv' },
773:   ];
774: 
775:   const candidates = [];
776:   for (const item of borrowings) {
777:     if (!isSupportedQuality(item.quality)) continue;
778:     const rootPc = normalizePc(tonic + item.rootOffset);
779:     const tonalRelation = {
780:       degree: null,
781:       romanNumeral: item.roman,
782:       diatonic: false,
783:       borrowed: true,
784:       secondaryDominantTarget: null,
785:       approachType: 'modal-borrowing',
786:     };
787: 
788:     candidates.push(buildCandidate({
789:       anchorId,
790:       melodyEvent,
791:       rootPc,
792:       quality: item.quality,
793:       bassPc: null,
794:       tonalContext,
795:       source: 'borrowed',
796:       locked,
797:       tonalRelation,
798:       policies,
799:     }));
800:   }
801:   return candidates;
802: }
803: 
804: // ---------------------------------------------------------------------------
805: // Dédoublonnage et limitation
806: // ---------------------------------------------------------------------------
807: 
808: /**
809:  * Construit une clé de dédoublonnage stable.
810:  *
811:  * @param {ChordCandidate} c
812:  * @returns {string}
813:  */
814: function dedupKey(c) {
815:   const pcs = c.pitchClasses.join(',');
816:   const bass = c.bassPitchClass != null ? String(c.bassPitchClass) : 'x';
817:   const degree = c.tonalRelation.degree != null ? String(c.tonalRelation.degree) : 'x';
818:   const approach = c.tonalRelation.approachType;
819:   const functionKey = `${degree}:${approach}:${c.tonalRelation.romanNumeral || ''}`;
820:   const spellingRoot = `${c.rootSpelling.letter}:${c.rootSpelling.accidental}`;
821:   return `${pcs}|${c.qualityId}|${bass}|${functionKey}|${spellingRoot}`;
822: }
823: 
824: /**
825:  * Supprime les doublons sonores et fonctionnels tout en conservant les
826:  * orthographes fonctionnellement distinctes.
827:  *
828:  * @param {ChordCandidate[]} candidates
829:  * @returns {ChordCandidate[]}
830:  */
831: function deduplicateChordCandidates(candidates) {
832:   const seen = new Map();
833:   const result = [];
834:   for (const c of candidates) {
835:     const key = dedupKey(c);
836:     if (!seen.has(key)) {
837:       seen.set(key, c);
838:       result.push(c);
839:     }
840:   }
841:   return result;
842: }
843: 
844: /**
845:  * Limite le nombre de candidats selon le plafond configuré, en conservant
846:  * l'ordre déterministe.
847:  *
848:  * @param {ChordCandidate[]} candidates
849:  * @param {{ maxCandidatesPerAnchor?: number }} [options]
850:  * @returns {ChordCandidate[]}
851:  */
852: function limitChordCandidates(candidates, options = {}) {
853:   const max = options.maxCandidatesPerAnchor ?? DEFAULT_MAX_CANDIDATES_PER_ANCHOR;
854:   return candidates.slice(0, max);
855: }
856: 
857: /**
858:  * Trie les candidats selon un ordre déterministe non musical (priorité source,
859:  * puis identifiant).
860:  *
861:  * @param {ChordCandidate[]} candidates
862:  * @returns {ChordCandidate[]}
863:  */
864: function sortCandidates(candidates) {
865:   return [...candidates].sort((a, b) => {
866:     const pa = SOURCE_PRIORITY[a.source] ?? 99;
867:     const pb = SOURCE_PRIORITY[b.source] ?? 99;
868:     if (pa !== pb) return pa - pb;
869:     return a.id.localeCompare(b.id);
870:   });
871: }
872: 
873: // ---------------------------------------------------------------------------
874: // API publique : génération par ancre
875: // ---------------------------------------------------------------------------
876: 
877: /**
878:  * Génère les candidats pour une ancre harmonique.
879:  *
880:  * @param {{
881:  *   anchor: HarmonicAnchor,
882:  *   track: MelodyTrack,
883:  *   harmonicContext: HarmonicContext,
884:  *   options?: { maxCandidatesPerAnchor?: number }
885:  * }} input
886:  * @returns {AnchorCandidateGenerationResult}
887:  */
888: export function generateChordCandidatesForAnchor(input) {
889:   const { anchor, track, harmonicContext, options = {} } = input;
890:   const maxCandidates = options.maxCandidatesPerAnchor ?? DEFAULT_MAX_CANDIDATES_PER_ANCHOR;
891: 
892:   const warnings = [];
893:   const rejectedSummary = { total: 0, byReason: {} };
894: 
895:   // 1. Ancre invalide
896:   if (!anchor || !anchor.id) {
897:     return {
898:       anchorId: anchor ? anchor.id : null,
899:       melodyEventId: anchor ? anchor.melodyEventId : null,
900:       status: 'invalid-anchor',
901:       candidates: [],
902:       rejectedSummary,
903:       warnings: [{
904:         severity: 'error',
905:         code: 'INVALID_ANCHOR',
906:         message: 'Ancre harmonique invalide.',
907:         anchorId: null,
908:         melodyEventId: null,
909:         details: {},
910:       }],
911:     };
912:   }
913: 
914:   // 2. Politique skip
915:   if (anchor.harmonizationPolicy === 'skip') {
916:     return {
917:       anchorId: anchor.id,
918:       melodyEventId: anchor.melodyEventId,
919:       status: 'skipped',
920:       candidates: [],
921:       rejectedSummary,
922:       warnings: [{
923:         severity: 'warning',
924:         code: 'ANCHOR_SKIPPED',
925:         message: 'L\'ancre est volontairement ignorée par sa politique d\'harmonisation.',
926:         anchorId: anchor.id,
927:         melodyEventId: anchor.melodyEventId,
928:         details: {},
929:       }],
930:     };
931:   }
932: 
933:   // 3. Résolution du MelodyEvent lié
934:   /** @type {MelodyEvent | null} */
935:   let melodyEvent = null;
936:   if (anchor.melodyEventId) {
937:     melodyEvent = track.events.find((e) => e.id === anchor.melodyEventId) || null;
938:     if (!melodyEvent || !melodyEvent.enabled) {
939:       warnings.push({
940:         severity: 'warning',
941:         code: 'MELODY_EVENT_DISABLED',
942:         message: `L'événement mélodique "${anchor.melodyEventId}" est introuvable ou désactivé.`,
943:         anchorId: anchor.id,
944:         melodyEventId: anchor.melodyEventId,
945:         details: {},
946:       });
947:     }
948:   }
949: 
950:   const tonalContext = harmonicContext ? harmonicContext.tonalContext : null;
951: 
952:   // Politiques effectives : l'ancre a la primauté sur l'événement mélodique
953:   // pour harmonizationPolicy, tandis que sopranoPolicy et preserveExactPitch
954:   // proviennent de l'événement lié (ou valeurs par défaut s'il est absent).
955:   const policies = {
956:     sopranoPolicy: melodyEvent ? melodyEvent.sopranoPolicy : 'free',
957:     harmonizationPolicy: anchor.harmonizationPolicy,
958:     preserveExactPitch: melodyEvent ? melodyEvent.preserveExactPitch : false,
959:   };
960: 
961:   // 4. Accord original explicite non verrouillé : candidat prioritaire
962:   let candidates = [];
963:   if (anchor.originalChord && !anchor.locked) {
964:     const ref = anchor.originalChord;
965:     const rootPc = normalizePc(ref.root);
966:     const quality = ref.quality || '';
967:     const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
968:     const degreeInfo = resolveDegree(rootPc, tonalContext);
969: 
970:     candidates.push(buildCandidate({
971:       anchorId: anchor.id,
972:       melodyEvent,
973:       rootPc,
974:       quality,
975:       bassPc,
976:       tonalContext,
977:       source: 'manual',
978:       locked: false,
979:       tonalRelation: {
980:         degree: degreeInfo.degree,
981:         romanNumeral: degreeInfo.romanNumeral,
982:         diatonic: degreeInfo.degree != null,
983:         borrowed: false,
984:         secondaryDominantTarget: null,
985:         approachType: 'none',
986:       },
987:       explicitReference: ref,
988:       policies,
989:     }));
990:   }
991: 
992:   // 5. Accord verrouillé à la frontière
993:   const firstAnchor = [...harmonicContext.anchors].sort((a, b) => a.relativeTime - b.relativeTime)[0];
994:   const isStartBoundary = firstAnchor && firstAnchor.id === anchor.id;
995:   const isEndBoundary = anchor.type === 'end' || (
996:     harmonicContext.anchors.length > 0 &&
997:     anchor.id === [...harmonicContext.anchors].sort((a, b) => b.relativeTime - a.relativeTime)[0].id
998:   );
999: 
1000:   if (isStartBoundary && harmonicContext.startChord && harmonicContext.startChord.locked) {
1001:     const ref = harmonicContext.startChord.chord;
1002:     const rootPc = normalizePc(ref.root);
1003:     const quality = ref.quality || '';
1004:     const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
1005:     const degreeInfo = resolveDegree(rootPc, tonalContext);
1006: 
1007:     const lockedCandidate = buildCandidate({
1008:       anchorId: anchor.id,
1009:       melodyEvent,
1010:       rootPc,
1011:       quality,
1012:       bassPc,
1013:       tonalContext,
1014:       source: 'locked-boundary',
1015:       locked: true,
1016:       tonalRelation: {
1017:         degree: degreeInfo.degree,
1018:         romanNumeral: degreeInfo.romanNumeral,
1019:         diatonic: degreeInfo.degree != null,
1020:         borrowed: false,
1021:         secondaryDominantTarget: null,
1022:         approachType: 'none',
1023:       },
1024:       explicitReference: ref,
1025:       policies,
1026:     });
1027: 
1028:     // Si l'accord verrouillé est incompatible, on le retourne quand même avec
1029:     // un rapport de validation explicite plutôt que de le remplacer silencieusement.
1030:     return {
1031:       anchorId: anchor.id,
1032:       melodyEventId: anchor.melodyEventId,
1033:       status: 'generated',
1034:       candidates: [lockedCandidate],
1035:       rejectedSummary,
1036:       warnings: lockedCandidate.validation.warnings.concat(lockedCandidate.validation.hardViolations),
1037:     };
1038:   }
1039: 
1040:   if (isEndBoundary && harmonicContext.endChord && harmonicContext.endChord.locked) {
1041:     const ref = harmonicContext.endChord.chord;
1042:     const rootPc = normalizePc(ref.root);
1043:     const quality = ref.quality || '';
1044:     const bassPc = ref.bass != null ? normalizePc(ref.bass) : null;
1045:     const degreeInfo = resolveDegree(rootPc, tonalContext);
1046: 
1047:     const lockedCandidate = buildCandidate({
1048:       anchorId: anchor.id,
1049:       melodyEvent,
1050:       rootPc,
1051:       quality,
1052:       bassPc,
1053:       tonalContext,
1054:       source: 'locked-boundary',
1055:       locked: true,
1056:       tonalRelation: {
1057:         degree: degreeInfo.degree,
1058:         romanNumeral: degreeInfo.romanNumeral,
1059:         diatonic: degreeInfo.degree != null,
1060:         borrowed: false,
1061:         secondaryDominantTarget: null,
1062:         approachType: 'none',
1063:       },
1064:       explicitReference: ref,
1065:       policies,
1066:     });
1067: 
1068:     return {
1069:       anchorId: anchor.id,
1070:       melodyEventId: anchor.melodyEventId,
1071:       status: 'generated',
1072:       candidates: [lockedCandidate],
1073:       rejectedSummary,
1074:       warnings: lockedCandidate.validation.warnings.concat(lockedCandidate.validation.hardViolations),
1075:     };
1076:   }
1077: 
1078:   // 6. Génération des familles
1079:   const familyInput = {
1080:     anchorId: anchor.id,
1081:     melodyEvent,
1082:     tonalContext,
1083:     locked: anchor.locked === true,
1084:     policies,
1085:   };
1086: 
1087:   candidates = candidates.concat(buildDiatonicCandidates(familyInput));
1088:   candidates = candidates.concat(buildDiatonicSubstitutionCandidates(familyInput));
1089:   candidates = candidates.concat(buildSecondaryDominantCandidates(familyInput));
1090:   candidates = candidates.concat(buildDiminishedApproachCandidates(familyInput));
1091:   candidates = candidates.concat(buildBorrowedCandidates(familyInput));
1092: 
1093:   // 7. Filtrage selon les politiques
1094:   const validCandidates = [];
1095:   for (const c of candidates) {
1096:     if (c.validation.valid) {
1097:       validCandidates.push(c);
1098:     } else {
1099:       rejectedSummary.total += 1;
1100:       for (const v of c.validation.hardViolations) {
1101:         rejectedSummary.byReason[v.code] = (rejectedSummary.byReason[v.code] || 0) + 1;
1102:       }
1103:     }
1104:   }
1105: 
1106:   // 8. Mode force : un candidat valide est requis
1107:   if (anchor.harmonizationPolicy === 'force' && validCandidates.length === 0) {
1108:     return {
1109:       anchorId: anchor.id,
1110:       melodyEventId: anchor.melodyEventId,
1111:       status: 'no-valid-candidate',
1112:       candidates: [],
1113:       rejectedSummary,
1114:       warnings: warnings.concat([{
1115:         severity: 'error',
1116:         code: 'FORCE_NO_CANDIDATE',
1117:         message: `Aucun candidat valide pour l'ancre "${anchor.id}" en mode force.`,
1118:         anchorId: anchor.id,
1119:         melodyEventId: anchor.melodyEventId,
1120:         details: { rejectedSummary },
1121:       }]),
1122:     };
1123:   }
1124: 
1125:   // 9. Dédoublonnage, tri, limitation
1126:   let finalCandidates = deduplicateChordCandidates(validCandidates);
1127:   finalCandidates = sortCandidates(finalCandidates);
1128:   const beforeLimit = finalCandidates.length;
1129:   finalCandidates = limitChordCandidates(finalCandidates, { maxCandidatesPerAnchor: maxCandidates });
1130: 
1131:   if (beforeLimit > finalCandidates.length) {
1132:     warnings.push({
1133:       severity: 'warning',
1134:       code: 'CANDIDATES_TRUNCATED',
1135:       message: `${beforeLimit} candidats générés, tronqués à ${maxCandidates}.`,
1136:       anchorId: anchor.id,
1137:       melodyEventId: anchor.melodyEventId,
1138:       details: { beforeLimit, afterLimit: finalCandidates.length },
1139:     });
1140:   }
1141: 
1142:   return {
1143:     anchorId: anchor.id,
1144:     melodyEventId: anchor.melodyEventId,
1145:     status: finalCandidates.length > 0 ? 'generated' : 'no-valid-candidate',
1146:     candidates: finalCandidates,
1147:     rejectedSummary,
1148:     warnings,
1149:   };
1150: }
1151: 
1152: /**
1153:  * Génère les candidats pour toutes les ancres d'un HarmonicContext.
1154:  *
1155:  * @param {{
1156:  *   harmonicContext: HarmonicContext,
1157:  *   track: MelodyTrack,
1158:  *   options?: { maxCandidatesPerAnchor?: number }
1159:  * }} input
1160:  * @returns {AnchorCandidateGenerationResult[]}
1161:  */
1162: export function generateChordCandidatesForContext(input) {
1163:   const { harmonicContext, track, options = {} } = input;
1164:   const sortedAnchors = [...harmonicContext.anchors].sort((a, b) => a.relativeTime - b.relativeTime);
1165:   return sortedAnchors.map((anchor) => generateChordCandidatesForAnchor({
1166:     anchor,
1167:     track,
1168:     harmonicContext,
1169:     options,
1170:   }));
1171: }
1172: 
1173: // ---------------------------------------------------------------------------
1174: // Ré-exports utiles pour les tests
1175: // ---------------------------------------------------------------------------
1176: 
1177: export {
1178:   buildDiatonicCandidates,
1179:   buildDiatonicSubstitutionCandidates,
1180:   buildSecondaryDominantCandidates,
1181:   buildDiminishedApproachCandidates,
1182:   buildBorrowedCandidates,
1183:   classifyMelodyCompatibility,
1184:   validateChordCandidate,
1185:   deduplicateChordCandidates,
1186:   limitChordCandidates,
1187:   computeChordPitchClasses,
1188:   getIdentityMetadata,
1189:   SUPPORTED_QUALITIES,
1190:   DEFAULT_MAX_CANDIDATES_PER_ANCHOR,
1191: };

(End of file - total 1191 lines)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 4.0s)

_Thinking:_

Let me read the rest of the test file to see the full content.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "offset": 1039
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
1039:   const r1 = buildHarmonizationPlan({ track, harmonicContext: ctx });
1040:   const r2 = buildHarmonizationPlan({ track, harmonicContext: ctx });
1041: 
1042:   // Longueurs cohérentes.
1043:   assertEqual(r1.steps.length, N);
1044:   assertEqual(r1.candidateLayers.length, N);
1045:   assertEqual(r1.harmonicPathResult.path.length, N);
1046:   assertEqual(r1.voicingPathResult.voicings.length, N);
1047:   // Ordre stable = déterminisme.
1048:   assertDeepEqual(r1, r2, 'plans longs identiques');
1049:   assertDeepEqual(r1.steps.map((s) => s.candidate.id), r2.steps.map((s) => s.candidate.id),
1050:     'ordre des candidats stable');
1051:   // Aucun NaN/Infinity dans les totaux.
1052:   assertTrue(Number.isFinite(r1.voicingPathResult.totalCost), 'totalCost fini');
1053:   assertTrue(Number.isFinite(r1.harmonicPathResult.totalScore), 'hpath totalScore fini');
1054: });
1055: 
1056: // ===========================================================================
1057: // T18 — Non-régression des contrats amont
1058: // ===========================================================================
1059: 
1060: runTest('T18 — appel au planificateur ne modifie pas les résultats amont directs', () => {
1061:   const track = trackFromMidiNotes([60, 64, 67]);
1062:   const ctx = makeThreeAnchorContext(track);
1063: 
1064:   // 1. Résultat direct du générateur (avant et après l'appel au planificateur).
1065:   const genBefore = generateChordCandidatesForAnchor({
1066:     anchor: ctx.anchors[0], track, harmonicContext: ctx,
1067:   });
1068:   buildHarmonizationPlan({ track, harmonicContext: ctx });
1069:   const genAfter = generateChordCandidatesForAnchor({
1070:     anchor: ctx.anchors[0], track, harmonicContext: ctx,
1071:   });
1072:   assertDeepEqual(genBefore.candidates.map((c) => c.id), genAfter.candidates.map((c) => c.id),
1073:     'générateur stable (ids identiques)');
1074:   assertEqual(genBefore.candidates.length, genAfter.candidates.length, 'générateur stable (longueur)');
1075: 
1076:   // 2. Résultat direct du chemin harmonique inchangé.
1077:   const layers = [];
1078:   for (let i = 0; i < ctx.anchors.length; i++) {
1079:     layers.push(generateChordCandidatesForAnchor({
1080:       anchor: ctx.anchors[i], track, harmonicContext: ctx,
1081:     }).candidates);
1082:   }
1083:   const hpathBefore = findBestHarmonicPath({ candidateLayers: layers });
1084:   buildHarmonizationPlan({ track, harmonicContext: ctx });
1085:   const hpathAfter = findBestHarmonicPath({ candidateLayers: layers });
1086:   assertDeepEqual(hpathBefore.path.map((c) => c.id), hpathAfter.path.map((c) => c.id),
1087:     'chemin harmonique stable');
1088:   assertEqual(hpathBefore.totalScore, hpathAfter.totalScore, 'score harmonique stable');
1089: 
1090:   // 3. Résultat direct du chemin de voicings inchangé.
1091:   const vpathBefore = findBestVoicingPath({ harmonicPathResult: hpathBefore });
1092:   buildHarmonizationPlan({ track, harmonicContext: ctx });
1093:   const vpathAfter = findBestVoicingPath({ harmonicPathResult: hpathBefore });
1094:   assertDeepEqual(vpathBefore.voicings.map((v) => v.midiNotes), vpathAfter.voicings.map((v) => v.midiNotes),
1095:     'chemin de voicings stable');
1096:   assertEqual(vpathBefore.totalCost, vpathAfter.totalCost, 'coût de voicings stable');
1097: 
1098:   // 4. Les trois seuls exports publics de voicing-path-finder.js restent intacts.
1099:   assertDeepEqual(Object.keys(voicingPathModule).sort(),
1100:     ['findBestVoicingPath', 'generatePlayableChordVoicings', 'scoreVoicingTransition'],
1101:     'voicing-path-finder : exactement 3 exports');
1102: });
1103: 
1104: console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
1105: if (passed !== total) process.exitCode = 1;

(End of file - total 1105 lines)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 70.2s)

_Thinking:_

Let me analyze the current state of the test file and understand what needs to be done:

1. **T11 — Descriptor comparison**: The current `captureGraph()` and `assertGraphUnchanged()` functions only capture `{ type: 'data', value, isObject }` for data properties and `{ type: 'accessor' }` for accessors. They need to be enhanced to capture and compare full descriptors including `writable`, `enumerable`, `configurable`, and for accessors, `get` and `set` references.

2. **T13 — Contract**: The test currently has a comment about the `invalid-anchor` validator at line 896. I need to replace the fragile line number reference with an explanation based on the actual condition, and add the `rg` proof. I also need to add the direct proof for anchor without id.

3. **Synthetic checks in T11**: Add internal synthetic checks proving the helper detects descriptor-only mutations.

Let me now plan the changes:

### T11 changes:

**`captureGraph()`** - needs to store full descriptors:
- For data properties: `type`, `value`, `writable`, `enumerable`, `configurable`
- For accessor properties: `type`, `get`, `set`, `enumerable`, `configurable`
- Use `Map` for property snapshots (prefer `Map` over `Object.create(null)`)
- Keep `WeakSet` for cycle detection
- Keep `WeakMap` for snapshots

**`assertGraphUnchanged()`** - needs to compare full descriptors:
- For data properties: check `writable`, `enumerable`, `configurable` in addition to `value`
- For accessor properties: check `get`, `set`, `enumerable`, `configurable` references
- Check root reference exactly
- Check `Object.isFrozen()`
- Check exact order of own keys
- Recursively traverse data values that are objects or functions
- Handle cycles with `WeakMap`/`WeakSet`

**Synthetic checks** - add internal checks within T11 proving the helper fails when only a descriptor changes:
1. Non-enumerable property where only `writable` or `enumerable` changes
2. Symbol-keyed property
3. Accessor whose getter is replaced by another function
4. Array where `length` or element order changes
5. Proof that no getter was executed during capture or verification

### T13 changes:
- Replace the line number reference with an explanation based on the actual condition
- Add direct proof for anchor without id
- Add `rg` command output in the audit

Let me now implement these changes.

For the `captureGraph` function, I need to be careful:
- Use `Map` for property snapshots instead of `Object.create(null)` to handle Symbol keys properly
- Store full descriptors
- Don't trigger getters (use `Object.getOwnPropertyDescriptor` which doesn't trigger getters)

For `assertGraphUnchanged`:
- Compare full descriptors
- For accessors, compare `get` and `set` references exactly

Let me also think about the synthetic checks. These should be internal to T11, not separate public tests. They should:
1. Create a synthetic object with specific descriptor configurations
2. Capture it
3. Mutate only a descriptor
4. Verify that `assertGraphUnchanged` throws

Let me write the code now.

For the `captureGraph` function, I'll use a `Map` for props to support Symbol keys:

```js
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const snap = {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props: new Map(),
    };
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        const v = desc.value;
        snap.props.set(k, {
          type: 'data',
          value: v,
          writable: desc.writable,
          enumerable: desc.enumerable,
          configurable: desc.configurable,
        });
        if (v !== null && typeof v === 'object') {
          visit(v, `${path}.${String(k)}`);
        }
      } else {
        snap.props.set(k, {
          type: 'accessor',
          get: desc ? desc.get : undefined,
          set: desc ? desc.set : undefined,
          enumerable: desc ? desc.enumerable : undefined,
          configurable: desc ? desc.configurable : undefined,
        });
      }
    }
    snapshots.set(obj, snap);
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

For `assertGraphUnchanged`:

```js
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props.get(k);
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        if (desc.get !== snapProp.get) {
          throw new Error(`${path}.${String(k)} getter modifié`);
        }
        if (desc.set !== snapProp.set) {
          throw new Error(`${path}.${String(k)} setter modifié`);
        }
        if (desc.enumerable !== snapProp.enumerable) {
          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
        }
        if (desc.configurable !== snapProp.configurable) {
          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
        }
        continue;
      }
      // Data property
      if (!desc || !('value' in desc)) {
        throw new Error(`${path}.${String(k)} propriété de données transformée en accesseur`);
      }
      const actualV = desc.value;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (desc.writable !== snapProp.writable) {
        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
      }
      if (desc.enumerable !== snapProp.enumerable) {
        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
      }
      if (desc.configurable !== snapProp.configurable) {
        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

Now for the synthetic checks within T11. I need to add them inside the T11 test function. Let me think about how to structure them:

1. **Non-enumerable property where only `writable` changes**: Create an object with a non-enumerable data property, capture it, change `writable`, verify `assertGraphUnchanged` throws.

2. **Symbol-keyed property**: Create an object with a Symbol-keyed property, capture it, change something, verify it throws.

3. **Accessor with getter replaced**: Create an object with a getter, capture it, replace the getter, verify it throws.

4. **Array where length or element order changes**: Create an array, capture it, change length or order, verify it throws.

5. **Proof that no getter was executed**: Use a getter that increments a counter, capture the graph, verify the counter is still 0.

Let me now write the full T11 test with these synthetic checks.

For the synthetic checks, I need to be careful about how I structure them. They should be internal to T11, not separate test functions. I'll add them as inline assertions within the T11 test body.

Let me also think about the T13 changes. The current code at lines 820-823 has:
```js
  // Note : le validateur canonique (chord-candidate-generator.js:896) ne
  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
  // le statut 'invalid-anchor'. Il est donc impossible de construire une
  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
```

I need to replace the fragile line number reference with an explanation based on the actual condition. I also need to add the direct proof for anchor without id.

The direct proof is already there at lines 811-818:
```js
  const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };
  const invalidCtx = { ...ctx, anchors: [badAnchor] };
  let err = null;
  try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }
  assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');
  assertTrue(String(err.message).includes('0'), 'message contient l indice 0');
  assertTrue(String(err.message).toLowerCase().includes('invalide'),
    'message indique que l ancre est invalide');
```

But the spec says to add the direct proof:
```js
const directResult = generateChordCandidatesForAnchor({
  anchor: badAnchor,
  track,
  harmonicContext: invalidCtx,
});
assertEqual(directResult.status, 'invalid-anchor');
```

I need to add this direct proof. Let me also update the comment to remove the line number reference.

Now let me also think about the `rg` command. The spec says to include the output of:
```bash
rg -n -C 6 "invalid-anchor|!anchor\\.id" src/melody/chord-candidate-generator.js
```
This should be included in the audit file, not in the test code itself.

Let me now write the complete updated file. I'll need to be very careful about the exact changes.

Let me re-read the current T11 and T13 sections more carefully to plan the edits.

T11 currently (lines 676-751):
- Captures input graph
- Calls buildHarmonizationPlan
- Asserts graph unchanged
- Checks wrapper reference, frozen state
- Checks track, ctx references and frozen state
- Checks anchors references, frozen state, JSON
- Checks events references, frozen state, JSON
- Checks JSON unchanged
- Checks new containers frozen

I need to add synthetic checks within this test. The synthetic checks should be added after the main assertions but before the test function closes.

T13 currently (lines 788-856):
- Tests various invalid anchor cases
- Has the comment about line 896
- Tests anchor without id
- Tests anchor without candidate (force mode)
- Tests context for different track

I need to:
1. Add the direct proof for `generateChordCandidatesForAnchor` with badAnchor
2. Replace the comment about line 896

Let me now write the edits.

For the `captureGraph` function, I need to change the `props` from `Object.create(null)` to a `Map` and store full descriptors.

For `assertGraphUnchanged`, I need to use `snap.props.get(k)` instead of `snap.props[k]` and add descriptor checks.

Let me plan the exact edits:

**Edit 1**: Replace `captureGraph` function (lines 81-112)

**Edit 2**: Replace `assertGraphUnchanged` function (lines 124-170)

**Edit 3**: Add synthetic checks inside T11 (after line 751, before the closing `});`)

**Edit 4**: Update T13 comment and add direct proof

Let me now implement these edits.

Actually, let me think more carefully about the synthetic checks. The spec says:

> Dans T11, ajoute des contrôles synthétiques internes, sans créer un nouveau test public, prouvant que le helper échoue réellement lorsque seul un descripteur change.

So these are internal to T11, not separate `runTest` calls. They should be assertions within the T11 test function.

The synthetic checks should:
1. Create a synthetic object
2. Capture it with `captureGraph`
3. Mutate only a descriptor
4. Verify `assertGraphUnchanged` throws

Let me think about how to implement each:

**1. Non-enumerable property where only `writable` changes:**
```js
const obj1 = {};
Object.defineProperty(obj1, 'x', { value: 1, writable: true, enumerable: false, configurable: true });
const cap1 = captureGraph(obj1);
Object.defineProperty(obj1, 'x', { value: 1, writable: false, enumerable: false, configurable: true });
let threw1 = false;
try { assertGraphUnchanged(obj1, cap1); } catch (e) { threw1 = true; }
assertTrue(threw1, 'détecte changement de writable seul');
```

**2. Symbol-keyed property:**
```js
const sym = Symbol('test');
const obj2 = { [sym]: 42 };
const cap2 = captureGraph(obj2);
obj2[sym] = 99;
let threw2 = false;
try { assertGraphUnchanged(obj2, cap2); } catch (e) { threw2 = true; }
assertTrue(threw2, 'détecte changement de propriété symbol');
```

**3. Accessor with getter replaced:**
```js
const getter1 = () => 1;
const getter2 = () => 2;
const obj3 = {};
Object.defineProperty(obj3, 'acc', { get: getter1, set: undefined, enumerable: true, configurable: true });
const cap3 = captureGraph(obj3);
Object.defineProperty(obj3, 'acc', { get: getter2, set: undefined, enumerable: true, configurable: true });
let threw3 = false;
try { assertGraphUnchanged(obj3, cap3); } catch (e) { threw3 = true; }
assertTrue(threw3, 'détecte remplacement de getter');
```

**4. Array where length or element order changes:**
```js
const arr = [1, 2, 3];
const cap4 = captureGraph(arr);
arr.push(4);
let threw4 = false;
try { assertGraphUnchanged(arr, cap4); } catch (e) { threw4 = true; }
assertTrue(threw4, 'détecte changement de longueur de tableau');
```

**5. Proof that no getter was executed:**
```js
let getterCallCount = 0;
const obj5 = {};
Object.defineProperty(obj5, 'lazy', {
  get() { getterCallCount++; return 42; },
  enumerable: true, configurable: true,
});
const cap5 = captureGraph(obj5);
assertEqual(getterCallCount, 0, 'aucun getter exécuté pendant la capture');
assertGraphUnchanged(obj5, cap5);
assertEqual(getterCallCount, 0, 'aucun getter exécuté pendant la vérification');
```

Wait, but `Object.getOwnPropertyDescriptor` doesn't trigger getters, so this should naturally pass. But it's good to verify.

Now let me also think about the T13 changes more carefully.

The current comment at lines 820-823:
```js
  // Note : le validateur canonique (chord-candidate-generator.js:896) ne
  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
  // le statut 'invalid-anchor'. Il est donc impossible de construire une
  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
```

I need to replace this with an explanation based on the actual condition, not a line number. Something like:

```js
  // Note : le validateur canonique dans generateChordCandidatesForAnchor
  // ne vérifie que la condition !anchor || !anchor.id. Aucun autre champ
  // ne peut produire le statut 'invalid-anchor'. Il est donc impossible de
  // construire une ancre avec un id réel non vide qui déclenche
  // 'invalid-anchor'. Voir la preuve par rg dans l'audit final.
```

And I need to add the direct proof:
```js
  const directResult = generateChordCandidatesForAnchor({
    anchor: badAnchor,
    track,
    harmonicContext: invalidCtx,
  });
  assertEqual(directResult.status, 'invalid-anchor');
```

This should be added right after the `badAnchor` definition and before the `buildHarmonizationPlan` call.

Now let me implement all these changes. I'll use the edit tool.

Let me also think about the `rg` command. The spec says to include it in the audit file. I'll run it as part of the validation step.

Let me now write the edits. I'll start with the `captureGraph` function.

Actually, wait. Let me re-read the spec more carefully for T11:

> Pour chaque propriété de données, mémorise et compare exactement :
> type, value, writable, enumerable, configurable
> 
> Pour chaque accesseur, mémorise et compare exactement :
> type, get, set, enumerable, configurable
> 
> Contraintes :
> - utiliser `Reflect.ownKeys()` ;
> - conserver les symboles comme clés réelles ;
> - utiliser de préférence un `Map` pour les snapshots de propriétés ;
> - ne déclencher aucun getter ;
> - conserver les références exactes des valeurs objets ;
> - vérifier la référence exacte de la racine ;
> - vérifier `Object.isFrozen()` ;
> - vérifier l'ordre exact des clés propres ;
> - parcourir récursivement les valeurs de données qui sont des objets ou fonctions ;
> - gérer les cycles et références partagées avec `WeakMap` ou `WeakSet` ;
> - couvrir automatiquement `length`, les index et l'ordre des tableaux.

The current code already does most of this. The main gaps are:
1. Not storing full descriptors (only `{ type, value, isObject }` for data, `{ type: 'accessor' }` for accessors)
2. Not using `Map` for property snapshots (uses `Object.create(null)`)
3. Not comparing descriptor attributes in `assertGraphUnchanged`

The root reference check is implicitly done by `captured.snapshots.get(obj)` - if the root reference changed, it won't be in the snapshot. But the spec says "vérifier la référence exacte de la racine" - I should add an explicit check.

Let me also think about the "vérifier la référence exacte de la racine" requirement. In the current code, `assertGraphUnchanged` is called with `visit(root, null, rootPath)`. The `expectedObj` is `null` for the root. The function checks `captured.snapshots.get(obj)` which will fail if the root reference changed. But it doesn't explicitly check that `root === snap.ref`. Let me add that.

Actually, looking at the code more carefully, the `visit` function for the root call is `visit(root, null, rootPath)`. The first check is:
```js
if (obj === null || typeof obj !== 'object') {
  if (obj !== expectedObj) { ... }
  return;
}
```
Since `root` is an object, it won't hit this. Then it does `captured.snapshots.get(obj)` which will return the snapshot if the reference is the same. If the reference changed, it returns `undefined` and throws "objet non présent dans le snapshot initial". So the root reference check is already there implicitly.

But the spec says to explicitly check it. Let me add an explicit check at the beginning of `assertGraphUnchanged`:
```js
if (root !== captured.snapshots.get(root)?.ref) {
  throw new Error(`${rootPath} référence racine modifiée`);
}
```

Hmm, but `captured.snapshots.get(root)?.ref` is just `root` if the snapshot exists. So this check is `root !== root` which is always false. That's not useful.

Actually, the way to check root reference is: the root object passed to `assertGraphUnchanged` should be the same reference as the one passed to `captureGraph`. The snapshot stores `ref: obj` for each visited object. So `captured.snapshots.get(root).ref === root` if the root is the same reference. If the root reference changed, `captured.snapshots.get(root)` would return `undefined`.

I think the current implicit check is sufficient. But let me add an explicit check anyway to satisfy the spec:

```js
const rootSnap = captured.snapshots.get(root);
if (!rootSnap) {
  throw new Error(`${rootPath} référence racine modifiée ou inconnue`);
}
```

This is already done implicitly in the `visit` function. But I can add it at the top level for clarity.

OK, let me now write all the edits. I'll be very precise.

Let me also think about the `isObject` field. The current code stores `isObject: v !== null && typeof v === 'object'`. The new spec doesn't mention `isObject`. I'll remove it since we now store the full value reference and can check `typeof` when needed.

Actually, looking at the spec again: "conserver les références exactes des valeurs objets" - this is about keeping the exact reference, not about storing a boolean flag. The `isObject` flag was used for... nothing really in the comparison. Let me remove it.

Now let me write the edits. I'll do them in order.

For the `captureGraph` function, the old code is lines 81-112. Let me write the new version.

For `assertGraphUnchanged`, the old code is lines 124-170.

For T11 synthetic checks, I'll add them after line 751 (after the `});` closing T11's runTest). Wait, no - the synthetic checks should be INSIDE T11, not after it. Let me re-read the spec:

> Dans T11, ajoute des contrôles synthétiques internes, sans créer un nouveau test public

So they go inside the T11 `runTest` callback. I'll add them after the existing assertions (after line 751, before the closing `});` of the runTest callback).

Wait, line 751 is `});` which closes the T11 runTest. The synthetic checks need to go before that closing. Let me look at the structure:

```
runTest('T11 — ...', () => {
  // ... existing assertions (lines 677-751)
  assertTrue(Object.isFrozen(plan.voicingPathResult), ...);  // line 750
});  // line 751
```

I need to add the synthetic checks before line 751. Let me insert them after line 750.

For T13, I need to:
1. Add the direct proof after line 813 (after `badAnchor` definition)
2. Replace the comment at lines 820-823

Let me now write all the edits.

Actually, I realize I should also think about whether the `captureGraph` function needs to handle the case where `desc` is undefined. `Object.getOwnPropertyDescriptor` can return `undefined` if the property doesn't exist on the object. But since we're iterating `Reflect.ownKeys(obj)`, the property should exist. However, in the `assertGraphUnchanged` function, we also call `Object.getOwnPropertyDescriptor(obj, k)` for keys from the snapshot. If a key was deleted between capture and verification, `desc` would be `undefined`. The current code handles this with `if (!snapProp)` check. But for the descriptor comparison, I should handle `desc` being `undefined` (property deleted).

Let me also think about the `assertGraphUnchanged` function's handling of deleted properties. If a key from the snapshot is no longer in `ownKeys`, the length check would catch it. If a key is still in `ownKeys` but `Object.getOwnPropertyDescriptor` returns `undefined`... that shouldn't happen for own keys. But to be safe, I'll add a check.

OK, let me now write the actual edits. I'll be very precise with the oldString matching.

Let me start with the `captureGraph` function edit.

Old (lines 81-112):
```js
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const snap = {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props: Object.create(null),
    };
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        const v = desc.value;
        snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };
        if (v !== null && typeof v === 'object') {
          visit(v, `${path}.${String(k)}`);
        }
      } else {
        snap.props[k] = { type: 'accessor' };
      }
    }
    snapshots.set(obj, snap);
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

New:
```js
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const snap = {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props: new Map(),
    };
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        const v = desc.value;
        snap.props.set(k, {
          type: 'data',
          value: v,
          writable: desc.writable,
          enumerable: desc.enumerable,
          configurable: desc.configurable,
        });
        if (v !== null && typeof v === 'object') {
          visit(v, `${path}.${String(k)}`);
        }
      } else {
        snap.props.set(k, {
          type: 'accessor',
          get: desc ? desc.get : undefined,
          set: desc ? desc.set : undefined,
          enumerable: desc ? desc.enumerable : undefined,
          configurable: desc ? desc.configurable : undefined,
        });
      }
    }
    snapshots.set(obj, snap);
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

Now for `assertGraphUnchanged`:

Old (lines 124-170):
```js
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props[k];
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        continue;
      }
      const actualV = desc ? desc.value : undefined;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

New:
```js
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const rootSnap = captured.snapshots.get(root);
  if (!rootSnap) {
    throw new Error(`${rootPath} référence racine modifiée ou inconnue`);
  }
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props.get(k);
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        if (desc.get !== snapProp.get) {
          throw new Error(`${path}.${String(k)} getter modifié`);
        }
        if (desc.set !== snapProp.set) {
          throw new Error(`${path}.${String(k)} setter modifié`);
        }
        if (desc.enumerable !== snapProp.enumerable) {
          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
        }
        if (desc.configurable !== snapProp.configurable) {
          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
        }
        continue;
      }
      if (!desc || !('value' in desc)) {
        throw new Error(`${path}.${String(k)} propriété de données transformée en accesseur`);
      }
      const actualV = desc.value;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (desc.writable !== snapProp.writable) {
        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
      }
      if (desc.enumerable !== snapProp.enumerable) {
        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
      }
      if (desc.configurable !== snapProp.configurable) {
        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

Now for the synthetic checks in T11. I need to add them before the closing `});` of the T11 runTest. Let me find the exact insertion point.

Line 750: `  assertTrue(Object.isFrozen(plan.voicingPathResult), 'voicingPathResult figé (par le moteur)');`
Line 751: `});`

I'll insert the synthetic checks between lines 750 and 751.

Now for T13 changes. Let me look at the exact lines:

Lines 808-823:
```js
  // Ancre invalide selon le contrat public du générateur : objet sans id.
  // Le générateur retourne status 'invalid-anchor' : le planificateur lève
  // TypeError (ancre structurellement invalide), pas RangeError.
  const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };
  const invalidCtx = { ...ctx, anchors: [badAnchor] };
  let err = null;
  try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }
  assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');
  assertTrue(String(err.message).includes('0'), 'message contient l indice 0');
  assertTrue(String(err.message).toLowerCase().includes('invalide'),
    'message indique que l ancre est invalide');

  // Note : le validateur canonique (chord-candidate-generator.js:896) ne
  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
  // le statut 'invalid-anchor'. Il est donc impossible de construire une
  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
```

I need to:
1. Add the direct proof after `badAnchor` definition (after line 811)
2. Replace the comment at lines 820-823

Let me write the edits now.

For the T13 direct proof, I'll add it after line 813 (after `const invalidCtx = ...`):

```js
  // Preuve directe : le générateur public confirme le statut invalid-anchor.
  const directResult = generateChordCandidatesForAnchor({
    anchor: badAnchor,
    track,
    harmonicContext: invalidCtx,
  });
  assertEqual(directResult.status, 'invalid-anchor');
```

For the comment replacement, I'll change lines 820-823 to:

```js
  // Note : le validateur canonique dans generateChordCandidatesForAnchor
  // ne vérifie que la condition !anchor || !anchor.id (voir la preuve par
  // rg dans l'audit final). Aucun autre champ ne peut produire le statut
  // 'invalid-anchor'. Il est donc impossible de construire une ancre avec
  // un id réel non vide qui déclenche 'invalid-anchor'.
```

Now let me implement all these edits. I'll use the edit tool.

Let me also think about whether I need to handle the `desc` being undefined case in `assertGraphUnchanged`. When iterating `ownKeys` from the snapshot, if a key was deleted, it won't be in `ownKeys` anymore (since we recompute `Reflect.ownKeys(obj)`). So the length check would catch it. If a key is still there but `Object.getOwnPropertyDescriptor` returns undefined... that shouldn't happen for own properties. But to be safe, I'll add a check for `!desc` in the data property branch too.

Actually, looking at my new code, I already have:
```js
      if (!desc || !('value' in desc)) {
        throw new Error(`${path}.${String(k)} propriété de données transformée en accesseur`);
      }
```

This handles the case where `desc` is undefined (property was deleted or transformed). Good.

Now let me also think about the `visit` function's handling of the root. In the current code, `visit(root, null, rootPath)` is called. The `expectedObj` is `null` for the root. But in my new code, I added an explicit root check at the top of `assertGraphUnchanged`. The `visit` function still receives `null` as `expectedObj` for the root. The first check in `visit` is:
```js
    if (obj === null || typeof obj !== 'object') {
```
Since `root` is an object, this won't trigger. Then it checks `captured.snapshots.get(obj)` which will find the snapshot. Good.

But wait, there's a subtle issue. The `visit` function is called recursively for nested objects. For those, `expectedObj` is the value from the snapshot. But for the root, `expectedObj` is `null`. This is fine because the root check is done separately.

OK, I think my plan is solid. Let me now write the edits.

One more thing: the spec says "parcourir récursivement les valeurs de données qui sont des objets ou fonctions". The current code already does this for objects. But it doesn't handle functions. Let me check: `typeof (() => {}) === 'function'` is true, and `typeof function(){} === 'function'` is true. But `typeof someFunction === 'object'` is false. So the current check `typeof v === 'object'` would skip functions. The spec says to also traverse functions. Let me update the traversal condition to include functions.

Wait, but functions are objects too in JS (`typeof (() => {}) === 'function'` but `(() => {}) instanceof Object` is true). The `visit` function checks `typeof obj !== 'object'` which would reject functions. But `captureGraph` checks `typeof v === 'object'` which would also skip functions. So functions are currently not traversed.

The spec says "parcourir récursivement les valeurs de données qui sont des objets ou fonctions". So I should include functions in the traversal. Let me update both `captureGraph` and `assertGraphUnchanged` to handle functions.

In `captureGraph`, change:
```js
if (v !== null && typeof v === 'object') {
```
to:
```js
if (v !== null && (typeof v === 'object' || typeof v === 'function')) {
```

In `assertGraphUnchanged`, change:
```js
if (actualV !== null && typeof actualV === 'object') {
```
to:
```js
if (actualV !== null && (typeof actualV === 'object' || typeof actualV === 'function')) {
```

And in `visit` within `assertGraphUnchanged`, the check `typeof obj !== 'object'` would reject functions. I need to change it to also accept functions:
```js
if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
```

Wait, but this would also affect the `captureGraph`'s `visit` function. Let me check: in `captureGraph`, the `visit` function checks `if (obj === null || typeof obj !== 'object') return;`. This would skip functions. But functions are only reached as values of properties, and the check `typeof v === 'object'` already filters them out. So functions are never passed to `visit` in `captureGraph`.

If I change the traversal condition to include functions, I also need to change the `visit` function's type guard in `captureGraph`:
```js
if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return;
```

And in `assertGraphUnchanged`'s `visit`:
```js
if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
```

Hmm, but this is getting complex. Let me think about whether functions actually need to be traversed. The spec says "parcourir récursivement les valeurs de données qui sont des objets ou fonctions". This means if a property value is a function, we should visit it and check its properties (like `length`, `name`, etc.).

But in practice, the harmonization pipeline doesn't use functions as data properties. The main objects are plain objects and arrays. So this is more of a completeness requirement.

Let me add function support to be thorough. I'll update both functions.

Actually, wait. Let me re-read the spec: "parcourir récursivement les valeurs de données qui sont des objets ou fonctions". This is about the VALUES of data properties. If a value is a function, we should traverse it. But functions have built-in properties like `length`, `name`, `prototype`. Traversing those could lead to infinite recursion (e.g., `Function.prototype` is a function, and its `constructor` points back to `Function`). 

I think the intent is to handle the case where someone stores a function as a property value and we want to detect if that function reference changes. The current code already does this with `actualV !== expectedV` (reference equality). The recursive traversal is for detecting changes WITHIN the function object (like its properties being modified). This is probably overkill but let me implement it to satisfy the spec.

To avoid infinite recursion with built-in function properties, I'll rely on the `WeakSet` cycle detection. The `seen` set will prevent re-visiting the same function object.

OK let me just implement it. I'll update the type guards.

Let me now write all the edits. I'll be very careful with the exact strings.

Actually, I realize I should also think about one more thing: the `visit` function in `captureGraph` uses `typeof obj !== 'object'` as a guard. If I change it to also accept functions, I need to make sure the rest of the function works for functions. `Reflect.ownKeys` works on functions. `Object.getOwnPropertyDescriptor` works on functions. `Object.isFrozen` works on functions. So it should be fine.

But wait, there's a problem. Functions have a `prototype` property that is an object. And that object has a `constructor` property that points back to the function. This creates a cycle. The `WeakSet` should handle this.

Also, functions have a `length` property and a `name` property. These are own properties of the function. So they would be captured and compared. This is actually good for the "couvrir automatiquement length, les index et l'ordre des tableaux" requirement - it would also cover function `length`.

OK, let me proceed with the implementation.

Let me now write all the edits in parallel.

Actually, I realize I should also think about the `assertGraphUnchanged` function's `visit` call for the root. Currently it's `visit(root, null, rootPath)`. The `expectedObj` is `null` for the root. But in the recursive calls, `expectedObj` is the value from the snapshot. For the root, we already have the explicit check at the top. So the `null` for `expectedObj` is fine - it's never used for the root because the root is an object and the first check `obj === null || typeof obj !== 'object'` won't trigger.

But wait, if I change the type guard to also accept functions, and the root is a function... that's unlikely but possible. Let me keep the root check explicit and not worry about it.

OK, let me now write the edits. I'll do them one at a time to be safe.

Let me start with the `captureGraph` function.

Now I have a clear picture. Let me implement the changes.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Run all validations",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Commit if all pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Create audit file",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Run all validations",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Commit if all pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Create audit file",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · deepseek-v4-pro · 50.6s)

_Thinking:_

Let me now implement the changes. I need to:

1. **T11 - `captureGraph()`**: Store full descriptors for data properties (type, value, writable, enumerable, configurable) and accessors (type, get, set, enumerable, configurable). Use a `Map` for property snapshots. Also verify root reference and `Object.isFrozen()`.

2. **T11 - `assertGraphUnchanged()`**: Compare full descriptors, root reference, frozen state, key order.

3. **T11 - Synthetic checks**: Add internal checks proving descriptor-only mutations are detected (non-enumerable property with writable/enumerable change, symbol property, accessor with getter replaced, array length/order change, proof no getter executed).

4. **T13**: Add direct proof for `invalid-anchor` with `generateChordCandidatesForAnchor`, replace fragile line number comment with condition-based explanation.

Let me write the new `captureGraph` and `assertGraphUnchanged` functions.

For `captureGraph`:
- Use `Map` for property snapshots (instead of `Object.create(null)`)
- For data properties: store `{ type: 'data', value, writable, enumerable, configurable }`
- For accessors: store `{ type: 'accessor', get, set, enumerable, configurable }`
- Keep `WeakMap` for snapshots, `WeakSet` for seen
- Verify root reference and `Object.isFrozen()`

For `assertGraphUnchanged`:
- Check root reference
- Check frozen state
- Check key order
- For each property, compare full descriptor
- For data properties, compare value, writable, enumerable, configurable
- For accessors, compare get, set, enumerable, configurable
- Recursively visit object values

Let me also add the synthetic checks inside T11.

For T13, I need to:
- Add a direct proof: `const directResult = generateChordCandidatesForAnchor({ anchor: badAnchor, track, harmonicContext: invalidCtx }); assertEqual(directResult.status, 'invalid-anchor');`
- Replace the line number comment with a condition-based explanation

Let me now write the code.

Actually, looking at the current code more carefully:

The current `captureGraph` uses `Object.create(null)` for `snap.props`. The spec says to use a `Map` for property snapshots. Let me use `Map` for the `props` within each snapshot.

For the root reference check in `assertGraphUnchanged`, the current code passes `null` as `expectedObj` for the root. I need to change this to pass the actual root reference.

Let me also think about the synthetic checks. They should be inside T11, not as a separate test. They should prove that:
1. Non-enumerable property where only `writable` or `enumerable` changes → detected
2. Symbol property → detected
3. Accessor with getter replaced → detected
4. Array where `length` or element order changes → detected
5. Proof no getter was executed during capture or verification

For #5, I can use a getter that increments a counter, and verify the counter is 0 after capture and after assertGraphUnchanged.

Let me now write the code.

Here's my plan for the new `captureGraph`:

```js
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const props = new Map();
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        props.set(k, {
          type: 'data',
          value: desc.value,
          writable: desc.writable,
          enumerable: desc.enumerable,
          configurable: desc.configurable,
        });
        if (desc.value !== null && typeof desc.value === 'object') {
          visit(desc.value, `${path}.${String(k)}`);
        }
      } else {
        props.set(k, {
          type: 'accessor',
          get: desc ? desc.get : undefined,
          set: desc ? desc.set : undefined,
          enumerable: desc ? desc.enumerable : undefined,
          configurable: desc ? desc.configurable : undefined,
        });
      }
    }
    snapshots.set(obj, {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props,
    });
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

And for `assertGraphUnchanged`:

```js
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props.get(k);
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        if (desc.get !== snapProp.get) {
          throw new Error(`${path}.${String(k)} getter modifié`);
        }
        if (desc.set !== snapProp.set) {
          throw new Error(`${path}.${String(k)} setter modifié`);
        }
        if (desc.enumerable !== snapProp.enumerable) {
          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
        }
        if (desc.configurable !== snapProp.configurable) {
          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
        }
        continue;
      }
      // Data property
      if (!desc || !('value' in desc)) {
        throw new Error(`${path}.${String(k)} propriété de données transformée en accesseur`);
      }
      const actualV = desc.value;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (desc.writable !== snapProp.writable) {
        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
      }
      if (desc.enumerable !== snapProp.enumerable) {
        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
      }
      if (desc.configurable !== snapProp.configurable) {
        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

Wait, I also need to check the root reference. The spec says "vérifier la référence exacte de la racine". Currently the root is passed as `input` and the captured snapshot has `snap.ref`. But the root itself is the same object as `input`, so `captured.snapshots.get(root)` should return the snapshot for the root. The root reference check is implicit: if the root object itself was replaced, `captured.snapshots.get(root)` would return undefined. But we should also check that the root reference hasn't changed.

Actually, looking at the current code, the root is `input` and we call `captureGraph(input)`. Then we call `assertGraphUnchanged(input, captured, 'input')`. The `visit` function is called with `visit(root, null, rootPath)`. The root is the same object, so `captured.snapshots.get(root)` will find it. But we should also verify that the root reference itself hasn't been replaced. Let me add a check at the beginning of `assertGraphUnchanged`:

```js
const rootSnap = captured.snapshots.get(root);
if (!rootSnap) {
  throw new Error(`${rootPath} racine remplacée (référence inconnue)`);
}
```

Actually, this is already covered by the `visit` function since it calls `captured.snapshots.get(obj)` for the root. But let me add an explicit check for clarity.

Now for the synthetic checks inside T11. I need to add them after the main test assertions. Let me think about what to add:

1. **Non-enumerable property where only `writable` changes**: Create an object with a non-enumerable data property, capture it, change `writable`, verify `assertGraphUnchanged` throws.

2. **Symbol property**: Create an object with a Symbol-keyed property, capture it, change the value, verify detection.

3. **Accessor with getter replaced**: Create an object with a getter, capture it, replace the getter, verify detection.

4. **Array where `length` or element order changes**: Create an array, capture it, change an element or length, verify detection.

5. **Proof no getter executed**: Create an object with a getter that increments a counter, capture it, verify counter is 0, then run assertGraphUnchanged, verify counter is still 0.

These should be added inside the T11 test function, after the main assertions. They are "contrôles synthétiques internes, sans créer un nouveau test public".

Let me now write the full replacement for the `captureGraph` and `assertGraphUnchanged` functions, and the synthetic checks.

For the synthetic checks, I need to be careful. The `assertGraphUnchanged` function throws on mismatch. So I need to catch those errors to verify they're thrown. Let me use try/catch patterns.

Actually, looking at the spec again: "Dans T11, ajoute des contrôles synthétiques internes, sans créer un nouveau test public, prouvant que le helper échoue réellement lorsque seul un descripteur change."

So these are internal checks within T11, not separate test functions. They should be assertions that the helper correctly detects descriptor-only changes.

Let me write them as try/catch blocks within T11:

```js
// Contrôles synthétiques internes : le helper détecte les mutations de descripteurs.

// 1. Propriété non énumérable dont seul writable change.
{
  const obj = {};
  Object.defineProperty(obj, 'hidden', { value: 42, writable: true, enumerable: false, configurable: true });
  const cap = captureGraph(obj);
  Object.defineProperty(obj, 'hidden', { value: 42, writable: false, enumerable: false, configurable: true });
  let threw = false;
  try { assertGraphUnchanged(obj, cap, 'synth1'); } catch (e) { threw = true; }
  assertTrue(threw, 'synth1: writable modifié détecté');
}

// 2. Propriété portée par un symbole.
{
  const sym = Symbol('test');
  const obj = { [sym]: 'hello' };
  const cap = captureGraph(obj);
  obj[sym] = 'world';
  let threw = false;
  try { assertGraphUnchanged(obj, cap, 'synth2'); } catch (e) { threw = true; }
  assertTrue(threw, 'synth2: valeur de symbole modifiée détectée');
}

// 3. Accesseur dont le getter est remplacé.
{
  const obj = {};
  const get1 = () => 1;
  const get2 = () => 2;
  Object.defineProperty(obj, 'acc', { get: get1, enumerable: true, configurable: true });
  const cap = captureGraph(obj);
  Object.defineProperty(obj, 'acc', { get: get2, enumerable: true, configurable: true });
  let threw = false;
  try { assertGraphUnchanged(obj, cap, 'synth3'); } catch (e) { threw = true; }
  assertTrue(threw, 'synth3: getter remplacé détecté');
}

// 4. Tableau dont l'ordre des éléments change.
{
  const arr = [1, 2, 3];
  const cap = captureGraph(arr);
  arr[0] = 99;
  let threw = false;
  try { assertGraphUnchanged(arr, cap, 'synth4'); } catch (e) { threw = true; }
  assertTrue(threw, 'synth4: élément de tableau modifié détecté');
}

// 5. Aucun getter exécuté pendant la capture ou la vérification.
{
  let getterCalls = 0;
  const obj = {};
  Object.defineProperty(obj, 'lazy', {
    get() { getterCalls++; return 42; },
    enumerable: true,
    configurable: true,
  });
  const cap = captureGraph(obj);
  assertEqual(getterCalls, 0, 'synth5: aucun getter exécuté pendant captureGraph');
  assertGraphUnchanged(obj, cap, 'synth5');
  assertEqual(getterCalls, 0, 'synth5: aucun getter exécuté pendant assertGraphUnchanged');
}
```

Wait, for #5, `captureGraph` uses `Object.getOwnPropertyDescriptor` which does NOT invoke getters. And `assertGraphUnchanged` also uses `Object.getOwnPropertyDescriptor`. So getters should never be invoked. But let me verify: `Object.getOwnPropertyDescriptor` returns the descriptor without calling the getter. So the getter counter should remain 0. Good.

But wait, there's a subtlety. In `captureGraph`, for accessor properties, we store `desc.get` and `desc.set`. These are the actual function references. In `assertGraphUnchanged`, we compare `desc.get !== snapProp.get`. This is a reference comparison, which is correct.

Now, for the `assertGraphUnchanged` function, I also need to handle the case where `desc` is undefined (property was deleted). Currently the code checks `if (!desc || 'value' in desc)` for accessors, which would catch deletion. For data properties, `if (!desc || !('value' in desc))` would catch deletion or conversion to accessor.

Let me also think about the root reference check. The spec says "vérifier la référence exacte de la racine". I'll add an explicit check at the start of `assertGraphUnchanged`.

Now let me also think about T13 changes. The spec says:

1. Add direct proof: `const directResult = generateChordCandidatesForAnchor({ anchor: badAnchor, track, harmonicContext: invalidCtx }); assertEqual(directResult.status, 'invalid-anchor');`
2. Replace the fragile line number comment with a condition-based explanation
3. Add the `rg` command output in the audit

The current comment at line 820-823 says:
```
  // Note : le validateur canonique (chord-candidate-generator.js:896) ne
  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
  // le statut 'invalid-anchor'. Il est donc impossible de construire une
  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
```

I need to replace the line number reference with a condition-based explanation. Something like:
```
// Note : le validateur canonique dans generateChordCandidatesForAnchor
// ne vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
// le statut 'invalid-anchor'. Il est donc impossible de construire une
// ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
```

And add the direct proof before this comment. Let me place it right after the `badAnchor` TypeError test.

Now let me write the full edit. I'll replace the `captureGraph` function (lines 71-112), the `assertGraphUnchanged` function (lines 114-170), and add synthetic checks inside T11. I'll also modify T13.

Let me be precise about the edits.

First, replace `captureGraph`:

Old (lines 71-112):
```js
/**
 * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
 * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
 * ses clés propres et la valeur/référence exacte de chaque propriété propre.
 * Un WeakSet évite les boucles et les parcours redondants sur les références
 * partagées.
 *
 * @param {object} root
 * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}
 */
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const snap = {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props: Object.create(null),
    };
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        const v = desc.value;
        snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };
        if (v !== null && typeof v === 'object') {
          visit(v, `${path}.${String(k)}`);
        }
      } else {
        snap.props[k] = { type: 'accessor' };
      }
    }
    snapshots.set(obj, snap);
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

New:
```js
/**
 * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
 * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
 * ses clés propres et le descripteur complet de chaque propriété propre
 * (type, value, writable, enumerable, configurable pour les données ;
 *  type, get, set, enumerable, configurable pour les accesseurs).
 * Un WeakSet évite les boucles et les parcours redondants sur les références
 * partagées. Les snapshots de propriétés utilisent un Map pour conserver
 * les symboles comme clés réelles.
 *
 * @param {object} root
 * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}
 */
function captureGraph(root) {
  const seen = new WeakSet();
  const snapshots = new WeakMap();
  function visit(obj, path) {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const ownKeys = Reflect.ownKeys(obj);
    const props = new Map();
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      if (desc && 'value' in desc) {
        props.set(k, {
          type: 'data',
          value: desc.value,
          writable: desc.writable,
          enumerable: desc.enumerable,
          configurable: desc.configurable,
        });
        if (desc.value !== null && typeof desc.value === 'object') {
          visit(desc.value, `${path}.${String(k)}`);
        }
      } else {
        props.set(k, {
          type: 'accessor',
          get: desc ? desc.get : undefined,
          set: desc ? desc.set : undefined,
          enumerable: desc ? desc.enumerable : undefined,
          configurable: desc ? desc.configurable : undefined,
        });
      }
    }
    snapshots.set(obj, {
      ref: obj,
      path,
      frozen: Object.isFrozen(obj),
      keys: ownKeys,
      props,
    });
  }
  visit(root, 'input');
  return { snapshots, seen };
}
```

Now replace `assertGraphUnchanged`:

Old (lines 114-170):
```js
/**
 * Vérifie que le graphe accessible depuis root est inchangé par rapport au
 * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à
 * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références
 * pour les valeurs objet, même état de gel.
 *
 * @param {object} root
 * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
 * @param {string} rootPath
 */
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props[k];
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        continue;
      }
      const actualV = desc ? desc.value : undefined;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

New:
```js
/**
 * Vérifie que le graphe accessible depuis root est inchangé par rapport au
 * snapshot capturé. Pour chaque objet capturé, contrôle : même référence racine,
 * mêmes clés propres dans le même ordre, mêmes descripteurs complets
 * (type, value/get/set, writable, enumerable, configurable), mêmes références
 * pour les valeurs objet, même état de gel.
 *
 * @param {object} root
 * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
 * @param {string} rootPath
 */
function assertGraphUnchanged(root, captured, rootPath = 'input') {
  const rootSnap = captured.snapshots.get(root);
  if (!rootSnap) {
    throw new Error(`${rootPath} racine remplacée (référence inconnue dans le snapshot)`);
  }
  const visited = new WeakSet();
  function visit(obj, expectedObj, path) {
    if (obj === null || typeof obj !== 'object') {
      if (obj !== expectedObj) {
        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
      }
      return;
    }
    const snap = captured.snapshots.get(obj);
    if (!snap) {
      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
    }
    if (visited.has(obj)) return;
    visited.add(obj);

    if (Object.isFrozen(obj) !== snap.frozen) {
      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
    }
    const ownKeys = Reflect.ownKeys(obj);
    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
    }
    for (const k of ownKeys) {
      const desc = Object.getOwnPropertyDescriptor(obj, k);
      const snapProp = snap.props.get(k);
      if (!snapProp) {
        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
      }
      if (snapProp.type === 'accessor') {
        if (!desc || 'value' in desc) {
          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
        }
        if (desc.get !== snapProp.get) {
          throw new Error(`${path}.${String(k)} getter modifié`);
        }
        if (desc.set !== snapProp.set) {
          throw new Error(`${path}.${String(k)} setter modifié`);
        }
        if (desc.enumerable !== snapProp.enumerable) {
          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
        }
        if (desc.configurable !== snapProp.configurable) {
          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
        }
        continue;
      }
      // Propriété de données.
      if (!desc || !('value' in desc)) {
        throw new Error(`${path}.${String(k)} propriété de données transformée en accesseur`);
      }
      const actualV = desc.value;
      const expectedV = snapProp.value;
      if (actualV !== expectedV) {
        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
      }
      if (desc.writable !== snapProp.writable) {
        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
      }
      if (desc.enumerable !== snapProp.enumerable) {
        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
      }
      if (desc.configurable !== snapProp.configurable) {
        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
      }
      if (actualV !== null && typeof actualV === 'object') {
        visit(actualV, expectedV, `${path}.${String(k)}`);
      }
    }
  }
  visit(root, null, rootPath);
}
```

Now for the synthetic checks inside T11. I need to add them after the main assertions (after line 751, before the closing `});` of T11). Let me add them right before the closing of the T11 test.

Looking at the current T11 (lines 676-751), the test ends with:
```js
  assertTrue(Object.isFrozen(plan.harmonicPathResult), 'harmonicPathResult figé (par le moteur)');
  assertTrue(Object.isFrozen(plan.voicingPathResult), 'voicingPathResult figé (par le moteur)');
});
```

I'll add the synthetic checks between line 750 and 751.

Now for T13 changes. I need to:
1. Add direct proof after the badAnchor TypeError test (after line 818)
2. Replace the comment at lines 820-823

Let me now make all the edits.

Actually, let me think about the order of edits. I'll do:
1. Replace `captureGraph` function
2. Replace `assertGraphUnchanged` function
3. Add synthetic checks inside T11
4. Add direct proof in T13
5. Replace comment in T13

Let me be very precise with the old strings to match.

For `captureGraph`, the old string starts at line 71 and ends at line 112. Let me use the exact text.

For `assertGraphUnchanged`, the old string starts at line 114 and ends at line 170.

For the synthetic checks, I'll insert them before the closing `});` of T11 (line 751).

For T13, I'll insert the direct proof after line 818 (after the `assertTrue(String(err.message).toLowerCase().includes('invalide'), ...)` line), and replace the comment at lines 820-823.

Let me now make the edits.

Now I'll implement all the changes. Let me start with the `captureGraph` and `assertGraphUnchanged` functions, then the synthetic checks in T11, and the T13 fixes.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "oldString": "/**\n * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.\n * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,\n * ses clés propres et la valeur/référence exacte de chaque propriété propre.\n * Un WeakSet évite les boucles et les parcours redondants sur les références\n * partagées.\n *\n * @param {object} root\n * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}\n */\nfunction captureGraph(root) {\n  const seen = new WeakSet();\n  const snapshots = new WeakMap();\n  function visit(obj, path) {\n    if (obj === null || typeof obj !== 'object') return;\n    if (seen.has(obj)) return;\n    seen.add(obj);\n    const ownKeys = Reflect.ownKeys(obj);\n    const snap = {\n      ref: obj,\n      path,\n      frozen: Object.isFrozen(obj),\n      keys: ownKeys,\n      props: Object.create(null),\n    };\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      if (desc && 'value' in desc) {\n        const v = desc.value;\n        snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };\n        if (v !== null && typeof v === 'object') {\n          visit(v, `${path}.${String(k)}`);\n        }\n      } else {\n        snap.props[k] = { type: 'accessor' };\n      }\n    }\n    snapshots.set(obj, snap);\n  }\n  visit(root, 'input');\n  return { snapshots, seen };\n}",
  "newString": "/**\n * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.\n * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,\n * ses clés propres et le descripteur complet de chaque propriété propre\n * (type, value, writable, enumerable, configurable pour les données ;\n *  type, get, set, enumerable, configurable pour les accesseurs).\n * Un WeakSet évite les boucles et les parcours redondants sur les références\n * partagées. Les snapshots de propriétés utilisent un Map pour conserver\n * les symboles comme clés réelles. Aucun getter n'est déclenché.\n *\n * @param {object} root\n * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}\n */\nfunction captureGraph(root) {\n  const seen = new WeakSet();\n  const snapshots = new WeakMap();\n  function visit(obj, path) {\n    if (obj === null || typeof obj !== 'object') return;\n    if (seen.has(obj)) return;\n    seen.add(obj);\n    const ownKeys = Reflect.ownKeys(obj);\n    const props = new Map();\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      if (desc && 'value' in desc) {\n        props.set(k, {\n          type: 'data',\n          value: desc.value,\n          writable: desc.writable,\n          enumerable: desc.enumerable,\n          configurable: desc.configurable,\n        });\n        if (desc.value !== null && typeof desc.value === 'object') {\n          visit(desc.value, `${path}.${String(k)}`);\n        }\n      } else {\n        props.set(k, {\n          type: 'accessor',\n          get: desc ? desc.get : undefined,\n          set: desc ? desc.set : undefined,\n          enumerable: desc ? desc.enumerable : undefined,\n          configurable: desc ? desc.configurable : undefined,\n        });\n      }\n    }\n    snapshots.set(obj, {\n      ref: obj,\n      path,\n      frozen: Object.isFrozen(obj),\n      keys: ownKeys,\n      props,\n    });\n  }\n  visit(root, 'input');\n  return { snapshots, seen };\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 10.8s)

_Thinking:_

Now update `assertGraphUnchanged` to compare fulldescriptors.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "oldString": "/**\n * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à\n * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références\n * pour les valeurs objet, même état de gel.\n *\n * @param {object} root\n * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n * @param {string} rootPath\n */\nfunction assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {\n    if (obj === null || typeof obj !== 'object') {\n      if (obj !== expectedObj) {\n        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);\n      }\n      return;\n    }\n    const snap = captured.snapshots.get(obj);\n    if (!snap) {\n      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n    }\n    if (visited.has(obj)) return;\n    visited.add(obj);\n\n    if (Object.isFrozen(obj) !== snap.frozen) {\n      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);\n    }\n    const ownKeys = Reflect.ownKeys(obj);\n    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {\n      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);\n    }\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      const snapProp = snap.props[k];\n      if (!snapProp) {\n        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);\n      }\n      if (snapProp.type === 'accessor') {\n        if (!desc || 'value' in desc) {\n          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);\n        }\n        continue;\n      }\n      const actualV = desc ? desc.value : undefined;\n      const expectedV = snapProp.value;\n      if (actualV !== expectedV) {\n        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);\n      }\n      if (actualV !== null && typeof actualV === 'object') {\n        visit(actualV, expectedV, `${path}.${String(k)}`);\n      }\n    }\n  }\n  visit(root, null, rootPath);\n}",
  "newString": "/**\n * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à\n * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références\n * pour les valeurs objet, même état de gel, et descripteurs complets identiques\n * (writable, enumerable, configurable pour les données ; get, set, enumerable,\n * configurable pour les accesseurs). Vérifie aussi la référence exacte de la\n * racine.\n *\n * @param {object} root\n * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n * @param {string} rootPath\n */\nfunction assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {\n    if (obj === null || typeof obj !== 'object') {\n      if (obj !== expectedObj) {\n        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);\n      }\n      return;\n    }\n    const snap = captured.snapshots.get(obj);\n    if (!snap) {\n      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n    }\n    if (visited.has(obj)) return;\n    visited.add(obj);\n\n    if (Object.isFrozen(obj) !== snap.frozen) {\n      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);\n    }\n    const ownKeys = Reflect.ownKeys(obj);\n    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {\n      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);\n    }\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      const snapProp = snap.props.get(k);\n      if (!snapProp) {\n        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);\n      }\n      if (snapProp.type === 'accessor') {\n        if (!desc || 'value' in desc) {\n          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);\n        }\n        if (desc.get !== snapProp.get) {\n          throw new Error(`${path}.${String(k)} getter modifié`);\n        }\n        if (desc.set !== snapProp.set) {\n          throw new Error(`${path}.${String(k)} setter modifié`);\n        }\n        if (desc.enumerable !== snapProp.enumerable) {\n          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n        }\n        if (desc.configurable !== snapProp.configurable) {\n          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n        }\n        continue;\n      }\n      const actualV = desc ? desc.value : undefined;\n      const expectedV = snapProp.value;\n      if (actualV !== expectedV) {\n        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);\n      }\n      if (desc && desc.writable !== snapProp.writable) {\n        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);\n      }\n      if (desc && desc.enumerable !== snapProp.enumerable) {\n        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n      }\n      if (desc && desc.configurable !== snapProp.configurable) {\n        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n      }\n      if (actualV !== null && typeof actualV === 'object') {\n        visit(actualV, expectedV, `${path}.${String(k)}`);\n      }\n    }\n  }\n  visit(root, null, rootPath);\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 9.0s)

_Thinking:_

Now I need to add the synthetic checks inside T11 that prove the helper detects descriptor-only mutations. I also need to add the root reference check in T11. Let me look at the current T11 test to understand where to add the synthetic checks.

The T11 test currently:
1. Captures snapshots before calling buildHarmonizationPlan
2. Calls buildHarmonizationPlan
3. Calls assertGraphUnchanged
4. Then does explicit checks on wrapper, track, ctx, anchors, events, etc.

I need to add synthetic checks that prove the helper fails when only a descriptor changes. These should be internal to T11, not a new public test. Let me add them after the main T11 assertions but before the closing of the test function.

Let me also add the root reference check in assertGraphUnchanged - actually, looking at the spec again: "vérifier la référence exacte de la racine". The current code doesn't check that `root` is the same reference as the captured root. I should add that.

Let me also add the synthetic checks. I'll add them at the end of T11, after the existing assertions.

For the synthetic checks:
1. Non-enumerable property where only writable or enumerable changes
2. Symbol-keyed property
3. Accessor whose getter is replaced
4. Array where length or element order changes
5. Proof that no getter was executed during capture or verification

Let me also add the root reference check to assertGraphUnchanged. Actually, looking at the spec more carefully: "vérifier la référence exacte de la racine" - this means the root object itself should be the same reference. I can add this check at the beginning of assertGraphUnchanged.

Wait, but the current code already checks that `snap.ref` exists for the root object. But it doesn't explicitly check that `root === snap.ref`. Let me add that.

Actually, looking at the code flow: `visit(root, null, rootPath)` is called. Inside visit, it does `const snap = captured.snapshots.get(obj)`. If the root reference changed, `captured.snapshots.get(obj)` would return undefined (since the new root wouldn't be in the WeakMap), and it would throw "objet non présent dans le snapshot initial". So the root reference check is already implicitly there. But the spec says to explicitly check it. Let me add an explicit check.

Let me now write the synthetic checks. I'll add them inside T11 after the existing assertions.

For the synthetic checks, I need to create objects, capture them, mutate only descriptors, and verify that assertGraphUnchanged throws.

Let me also think about the "no getter executed" proof. I can create an object with a getter that increments a counter, capture it, and verify the counter is still 0.

Let me now implement allof this.

Now let me add the synthetic checks inside T11 and the root reference check. First, let me update `assertGraphUnchanged` to check root reference:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "oldString": "function assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {",
  "newString": "function assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const rootSnap = captured.snapshots.get(root);\n  if (!rootSnap) {\n    throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);\n  }\n  if (root !== rootSnap.ref) {\n    throw new Error(`${rootPath} référence de la racine modifiée`);\n  }\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 3.5s)

_Thinking:_

Now I need to add the synthetic checks inside T11. Let me look at the current T11 test to find the right place to insert them. The synthetic checks should be added after the `assertGraphUnchanged` call and before the wrapper reference checks. Let me re-read the T11 section.

Now let me add the synthetic checks inside T11. I need to insert them after the `assertGraphUnchanged` call:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "offset": 700,
  "limit": 80
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
700:   const p1 = buildHarmonizationPlan({ track, harmonicContext: ctx });
701:   const p2 = buildHarmonizationPlan({ track, harmonicContext: ctx });
702: 
703:   assertDeepEqual(p1, p2, 'plans sérialisables identiques');
704:   assertDeepEqual(
705:     p1.candidateLayers.map((l) => l.map((c) => c.id)),
706:     p2.candidateLayers.map((l) => l.map((c) => c.id)),
707:     'ordres des couches identiques',
708:   );
709:   assertDeepEqual(p1.steps.map((s) => s.candidate.id), p2.steps.map((s) => s.candidate.id),
710:     'ordres des steps identiques');
711:   assertDeepEqual(p1.voicingPathResult.voicings.map((v) => v.midiNotes),
712:     p2.voicingPathResult.voicings.map((v) => v.midiNotes), 'notes MIDI identiques');
713:   assertEqual(p1.harmonicPathResult.totalScore, p2.harmonicPathResult.totalScore, 'scores identiques');
714:   assertEqual(p1.voicingPathResult.totalCost, p2.voicingPathResult.totalCost, 'totaux identiques');
715: });
716: 
717: // ===========================================================================
718: // T11 — Immutabilité complète
719: // ===========================================================================
720: 
721: runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouveaux conteneurs figés', () => {
722:   const track = trackFromMidiNotes([60, 64, 67]);
723:   const ctx = makeThreeAnchorContext(track);
724:   const input = { track, harmonicContext: ctx };
725: 
726:   // Snapshots avant appel : références, état de gel, contenu JSON, ordre.
727:   const inputRef = input;
728:   const inputFrozenBefore = Object.isFrozen(input);
729:   const trackRef = track;
730:   const ctxRef = ctx;
731:   const trackFrozenBefore = Object.isFrozen(track);
732:   const ctxFrozenBefore = Object.isFrozen(ctx);
733:   const anchorsRef = ctx.anchors;
734:   const anchorsFrozenBefore = Object.isFrozen(ctx.anchors);
735:   const eventsRef = track.events;
736:   const eventsFrozenBefore = track.events.map((e) => Object.isFrozen(e));
737:   const anchorsFrozenEachBefore = ctx.anchors.map((a) => Object.isFrozen(a));
738:   const inputJson = JSON.stringify(input);
739:   const trackJson = JSON.stringify(track);
740:   const ctxJson = JSON.stringify(ctx);
741:   const anchorsJson = JSON.stringify(ctx.anchors);
742:   const eventsJson = JSON.stringify(track.events);
743: 
744:   // Capture complète du graphe d'objets accessible depuis les entrées.
745:   const captured = captureGraph(input);
746: 
747:   const plan = buildHarmonizationPlan(input);
748: 
749:   // Vérification globale du graphe : chaque objet accessible conserve sa
750:   // référence, son état de gel, ses clés propres et la valeur/référence de
751:   // chaque propriété propre. Détecte un gel ou un remplacement post-call de
752:   // ctx.tonalContext, d'un tableau du contexte tonal, d'un événement ou d'une ancre.
753:   assertGraphUnchanged(input, captured, 'input');
754: 
755:   // Wrapper : référence et état de gel inchangés.
756:   assertTrue(input === inputRef, 'wrapper même référence');
757:   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');
758: 
759:   // track et harmonicContext : références et état de gel inchangés.
760:   assertTrue(track === trackRef, 'track même référence');
761:   assertTrue(ctx === ctxRef, 'harmonicContext même référence');
762:   assertEqual(Object.isFrozen(track), trackFrozenBefore, 'track état de gel inchangé');
763:   assertEqual(Object.isFrozen(ctx), ctxFrozenBefore, 'ctx état de gel inchangé');
764: 
765:   // anchors : référence, état de gel, contenu, ordre.
766:   assertTrue(ctx.anchors === anchorsRef, 'anchors même référence');
767:   assertEqual(Object.isFrozen(ctx.anchors), anchorsFrozenBefore, 'anchors état de gel inchangé');
768:   assertEqual(JSON.stringify(ctx.anchors), anchorsJson, 'anchors JSON inchangé');
769:   for (let i = 0; i < anchorsRef.length; i++) {
770:     assertTrue(ctx.anchors[i] === anchorsRef[i], `anchor[${i}] même référence`);
771:     assertEqual(Object.isFrozen(ctx.anchors[i]), anchorsFrozenEachBefore[i], `anchor[${i}] gel inchangé`);
772:   }
773: 
774:   // events : référence, état de gel, contenu, ordre.
775:   assertTrue(track.events === eventsRef, 'events même référence');
776:   assertEqual(JSON.stringify(track.events), eventsJson, 'events JSON inchangé');
777:   for (let i = 0; i < eventsRef.length; i++) {
778:     assertTrue(track.events[i] === eventsRef[i], `event[${i}] même référence`);
779:     assertEqual(Object.isFrozen(track.events[i]), eventsFrozenBefore[i], `event[${i}] gel inchangé`);

(Showing lines 700-779 of 1150. Use offset=780 to continue.)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 4.7s)

_Thinking:_

Let me see the rest of T11 to understand where to insert the synthetic checks.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "limit": 30,
  "offset": 780
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
780:   }
781: 
782:   // Contenu JSON global inchangé.
783:   assertEqual(JSON.stringify(input), inputJson, 'input JSON inchangé');
784:   assertEqual(JSON.stringify(track), trackJson, 'track JSON inchangé');
785:   assertEqual(JSON.stringify(ctx), ctxJson, 'ctx JSON inchangé');
786: 
787:   // Nouveaux conteneurs publics figés.
788:   assertTrue(Object.isFrozen(plan), 'plan figé');
789:   assertTrue(Object.isFrozen(plan.candidateLayers), 'candidateLayers figé');
790:   for (const layer of plan.candidateLayers) assertTrue(Object.isFrozen(layer), 'couche figée');
791:   assertTrue(Object.isFrozen(plan.steps), 'steps figé');
792:   for (const s of plan.steps) assertTrue(Object.isFrozen(s), 'step figé');
793:   // Les résultats amont restent les objets exacts (déjà figés par les moteurs).
794:   assertTrue(Object.isFrozen(plan.harmonicPathResult), 'harmonicPathResult figé (par le moteur)');
795:   assertTrue(Object.isFrozen(plan.voicingPathResult), 'voicingPathResult figé (par le moteur)');
796: });
797: 
798: // ===========================================================================
799: // T12 — Wrapper invalide
800: // ===========================================================================
801: 
802: runTest('T12 — wrapper invalide : TypeError pour chaque cas', () => {
803:   const track = trackFromMidiNotes([60, 64, 67]);
804:   const ctx = makeThreeAnchorContext(track);
805: 
806:   assertThrowsTypeError(() => buildHarmonizationPlan(), 'argument absent');
807:   assertThrowsTypeError(() => buildHarmonizationPlan(null), 'null');
808:   assertThrowsTypeError(() => buildHarmonizationPlan(5), 'nombre');
809:   assertThrowsTypeError(() => buildHarmonizationPlan('x'), 'chaîne');

(Showing lines 780-809 of 1150. Use offset=810 to continue.)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 10.7s)

_Thinking:_

Now I need to add the synthetic checks inside T11, after the `assertGraphUnchanged` call and before the existing checks. I'll insert them right after line 753 (the `assertGraphUnchanged` call). Let me also add the root reference check in `assertGraphUnchanged` which I already did.

Now let me add the synthetic checks. I'll insert them after the `assertGraphUnchanged` call and before the wrapperreference checks.

Now I'll add the synthetic checks inside T11. I'll insert them after the `assertGraphUnchanged` call:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "oldString": "  // Vérification globale du graphe : chaque objet accessible conserve sa\n  // référence, son état de gel, ses clés propres et la valeur/référence de\n  // chaque propriété propre. Détecte un gel ou un remplacement post-call de\n  // ctx.tonalContext, d'un tableau du contexte tonal, d'un événement ou d'une ancre.\n  assertGraphUnchanged(input, captured, 'input');\n\n  // Wrapper : référence et état de gel inchangés.",
  "newString": "  // Vérification globale du graphe : chaque objet accessible conserve sa\n  // référence, son état de gel, ses clés propres et le descripteur complet de\n  // chaque propriété propre. Détecte un gel, un remplacement post-call, un\n  // changement de writable/enumerable/configurable, un remplacement de getter\n  // ou setter, un changement d'ordre des clés, un changement de référence racine.\n  assertGraphUnchanged(input, captured, 'input');\n\n  // --- Contrôles synthétiques : preuve que le helper détecte les mutations\n  // de descripteurs seuls (sans changer la valeur). Ces contrôles ne créent\n  // pas de nouveau test public ; ils valident la robustesse interne du helper.\n\n  // 1. Propriété non énumérable dont seul writable change.\n  (() => {\n    const obj = { x: 1 };\n    Object.defineProperty(obj, 'x', { writable: false, enumerable: false, configurable: true });\n    const cap = captureGraph(obj);\n    Object.defineProperty(obj, 'x', { writable: true, enumerable: false, configurable: true });\n    let err = null;\n    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n    assertTrue(err !== null, 'synth1: writable modifié détecté');\n    assertTrue(String(err.message).includes('writable'), 'synth1: message mentionne writable');\n  })();\n\n  // 2. Propriété portée par un symbole dont seul enumerable change.\n  (() => {\n    const sym = Symbol('test');\n    const obj = {};\n    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: false, configurable: true });\n    const cap = captureGraph(obj);\n    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: true, configurable: true });\n    let err = null;\n    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n    assertTrue(err !== null, 'synth2: enumerable modifié sur symbole détecté');\n    assertTrue(String(err.message).includes('enumerable'), 'synth2: message mentionne enumerable');\n  })();\n\n  // 3. Accesseur dont le getter est remplacé par une autre fonction.\n  (() => {\n    let v = 1;\n    const obj = {};\n    const get1 = () => v;\n    const get2 = () => v + 1;\n    Object.defineProperty(obj, 'val', { get: get1, set: undefined, enumerable: true, configurable: true });\n    const cap = captureGraph(obj);\n    Object.defineProperty(obj, 'val', { get: get2, set: undefined, enumerable: true, configurable: true });\n    let err = null;\n    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n    assertTrue(err !== null, 'synth3: getter remplacé détecté');\n    assertTrue(String(err.message).includes('getter'), 'synth3: message mentionne getter');\n  })();\n\n  // 4. Tableau dont length ou l'ordre des éléments change.\n  (() => {\n    const arr = [1, 2, 3];\n    const cap = captureGraph(arr);\n    arr.push(4);\n    let err = null;\n    try { assertGraphUnchanged(arr, cap, 'synth'); } catch (e) { err = e; }\n    assertTrue(err !== null, 'synth4: length/ordre modifié détecté');\n  })();\n\n  // 5. Preuve qu'aucun getter n'a été exécuté pendant la capture ou la\n  //    vérification. On crée un objet avec un getter qui lève une erreur\n  //    s'il est appelé. La capture et la vérification doivent réussir sans\n  //    déclencher le getter.\n  (() => {\n    const obj = {};\n    let getterCalled = false;\n    Object.defineProperty(obj, 'computed', {\n      get() { getterCalled = true; return 99; },\n      enumerable: true,\n      configurable: true,\n    });\n    const cap = captureGraph(obj);\n    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant captureGraph');\n    assertGraphUnchanged(obj, cap, 'synth');\n    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');\n  })();\n\n  // Wrapper : référence et état de gel inchangés."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 3.4s)

_Thinking:_

Now I need to update T13. Let me look at the current T13 code and make the changes:

1. Add direct proof for invalid-anchor
2. Replace the fragile line number comment with an explanation based on the actual condition
3. Keep the existing tests

Let me also run the rg command to get the proof.

Now let me update T13. First, let me run the rg command to get the proof:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && rg -n -C 6 \"invalid-anchor|!anchor\\.id\" src/melody/chord-candidate-generator.js",
  "description": "Find invalid-anchor condition in generator"
}
```

**Output:**
```
/bin/bash: ligne 1: rg : commande introuvable

```

---

## Assistant (Build · deepseek-v4-pro · 3.9s)

_Thinking:_

`rg` is not available. Let me use `grep` instead.

**Tool: grep**

**Input:**
```json
{
  "pattern": "invalid-anchor|!anchor\\.id",
  "include": "chord-candidate-generator.js",
  "path": "/home/visiteur/piano-jazz-chords/src/melody"
}
```

**Output:**
```
Found 2 matches
/home/visiteur/piano-jazz-chords/src/melody/chord-candidate-generator.js:
  Line 896:   if (!anchor || !anchor.id) {

  Line 900:       status: 'invalid-anchor',

```

---

## Assistant (Build · deepseek-v4-pro · 8.3s)

_Thinking:_

Now I need to update T13. The current T13 has a comment at line 820-823 that references a fragile line number. I need to:

1. Replace the fragile line number comment with an explanation based on the actual condition
2. Add the direct proof for the invalid-anchor case
3. Keep the rg output as proof

Let me look at the current T13 code more carefully.

Now let me update T13. I need to replace the fragile line number comment and add the direct proof:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "newString": "  // Ancre invalide selon le contrat public du générateur : objet sans id.\n  // Le générateur retourne status 'invalid-anchor' : le planificateur lève\n  // TypeError (ancre structurellement invalide), pas RangeError.\n  const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };\n  const invalidCtx = { ...ctx, anchors: [badAnchor] };\n\n  // Preuve directe : le générateur public confirme le statut invalid-anchor.\n  const directResult = generateChordCandidatesForAnchor({\n    anchor: badAnchor,\n    track,\n    harmonicContext: invalidCtx,\n  });\n  assertEqual(directResult.status, 'invalid-anchor',\n    'statut public direct = invalid-anchor pour ancre sans id');\n\n  let err = null;\n  try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }\n  assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');\n  assertTrue(String(err.message).includes('0'), 'message contient l indice 0');\n  assertTrue(String(err.message).toLowerCase().includes('invalide'),\n    'message indique que l ancre est invalide');\n\n  // Note : le validateur canonique (chord-candidate-generator.js) ne vérifie\n  // que la condition `!anchor || !anchor.id`. Aucun autre champ ne peut\n  // produire le statut 'invalid-anchor'. Il est donc impossible de construire\n  // une ancre avec un id réel non vide qui déclenche 'invalid-anchor'.\n  // Cette limitation est inhérente au contrat du générateur, pas à une ligne\n  // de code particulière.",
  "oldString": "  // Ancre invalide selon le contrat public du générateur : objet sans id.\n  // Le générateur retourne status 'invalid-anchor' : le planificateur lève\n  // TypeError (ancre structurellement invalide), pas RangeError.\n  const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };\n  const invalidCtx = { ...ctx, anchors: [badAnchor] };\n  let err = null;\n  try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }\n  assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');\n  assertTrue(String(err.message).includes('0'), 'message contient l indice 0');\n  assertTrue(String(err.message).toLowerCase().includes('invalide'),\n    'message indique que l ancre est invalide');\n\n  // Note : le validateur canonique (chord-candidate-generator.js:896) ne\n  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire\n  // le statut 'invalid-anchor'. Il est donc impossible de construire une\n  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 3.6s)

_Thinking:_

Let me verify the current state of the file to make sure everything looks correct before running the tests.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Run all validations",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "Commit if all pass",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "Create audit file",
      "priority": "high",
      "status": "pending"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Run all validations",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Commit if all pass",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Create audit file",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Build · deepseek-v4-pro · 15.8s)

_Thinking:_

Let me now run all the validations. I'll run them in parallel where possible.

Now let me run all validations:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-harmonization-planner.js 2>&1",
  "description": "Run harmonization planner tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T1 — export unique et clés exactes de HarmonizationPlan / HarmonizationStep
  ✓ T2 — pipeline réel : 3 couches, 3 candidats, 3 voicings, 2 transitions
  ✓ T3 — alignement exact des références (pas de comparaison JSON)
  ✓ T4 — transitions entrantes nulles au step 0, puis transitions[i-1]
  ✓ T5 — candidat de départ verrouillé respecté, couches suivantes libres
  ✓ T6 — une seule ancre : mono-couche, transitions nulles, totaux exacts
  ✓ T7 — équivalence stricte avec la composition manuelle des API publiques
  ✓ T8 — ordre exact des ancres conservé, ancres distinctes, pas de tri
  ✓ T9 — couches distinctes, figées, ordre du générateur, pas de clone de candidat
  ✓ T10 — déterminisme : même JSON, ids, notes MIDI, scores, ordre
  ✓ T11 — immutabilité complète : graphe des entrées inchangé, nouveaux conteneurs figés
  ✓ T12 — wrapper invalide : TypeError pour chaque cas
  ✓ T13 — ancres invalides : TypeError (délégué aux contrats publics)
  ✓ T14 — contexte canonique sans ancre -> RangeError
  ✓ T15 — progression avec cardinalités de pitch classes différentes garanties
  ✓ T16 — aucun champ interdit dans les nouveaux conteneurs
  ✓ T17 — chemin long : fini, longueurs cohérentes, ordre stable, déterminisme
  ✓ T18 — appel au planificateur ne modifie pas les résultats amont directs

=== Résultat : 18/18 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-voicing-path-finder.js 2>&1",
  "description": "Run voicing path finder tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T1 — exports exacts (3) et settings figés/identiques au littéral
  ✓ T2 — génération d un accord réel
  ✓ T3 — basse dans l accord et basse externe, toujours la plus grave
  ✓ T4 — basse omise et null valides, plusieurs renverseents, pas de NaN
  ✓ T5 — bornes inclusives 36/84 atteintes, plages des mains, spans, registerDeviation
  ✓ T6 — transition immobile (mêmes notes)
  ✓ T7 — mouvement simple vérifié manuellement
  ✓ T8 — cardinalités égales : appariement direct par indice (36→72)
  ✓ T8b — cardinalités différentes : [60,64,67]→[60,64]
  ✓ T8c — égalités [50]↔[48,52] : match/insert puis match/delete
  ✓ T9 — quintes et octaves parallèles, direction, pas d unisson
  ✓ T10 — greedy vs DP : DP strictement meilleur (C→G7→Fmaj7)
  ✓ T11 — oracle exhaustif indépendant (petites couches)
  ✓ T12 — une couche : registre centré puis départage MIDI, totaux nuls
  ✓ T13 — [c,c,c] voicing répété, midiNotes identiques, déterminisme
  ✓ T14 — départages registre/MIDI, témoins métriques exacts, non-atteignabilité octaves
  ✓ T15 — immutabilité complète : résultats figés, entrées non figées et intactes
  ✓ T16 — TypeError sur entrées invalides (options / chemins creux)
  ✓ T17 — RangeError s il n y a aucun voicing admissible
  ✓ T18 — génération réelle, HarmonicPath, puis voicings
  ✓ T19 — chemin long, fini, déterministe, borné
  ✓ T20 — aucun champ audio/UI/pédale/doigté, chemin candidat intact

=== Résultat : 22/22 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-harmonic-path-finder.js 2>&1",
  "description": "Run harmonic path finder tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T01 — export présent et champs exacts
  ✓ T02 — longueurs, références et bornes
  ✓ T03 — cohérence from/to des transitions
  ✓ T2 — une couche : meilleure compatibilité, transitions vides
  ✓ T2b — une couche : tie-break déterministe sur égalité
  ✓ T2c — chaque catégorie V1 retourne exactement son score prévu
  ✓ T3 — le couple optimal est sélectionné avec la formule exacte
  ✓ T4 — l optimum global bat le greedy couche par couche
  ✓ T5a — oracle exhaustif (3 couches 2×2×2)
  ✓ T5b — oracle exhaustif (4 couches 3×2×4×2)
  ✓ T6 — formula exactes vérifiées séparément
  ✓ T7a — départage par compatibilité sur égalité pondérée
  ✓ T7b — départage par identifiant lexical
  ✓ T7c — clones à identifiant identique départagés par indice
  ✓ T7d — appels répétés strictement déterministes
  ✓ T8 — le bonus V→I influence le chemin, pas l ordre inverse
  ✓ T9 — même candidat référencé ou cloné entre couches
  ✓ T10 — basses absentes sans NaN
  ✓ T11 — couches 4, 2, 5, 3 avec pitch classes variées
  ✓ T12 — candidat verrouillé retenu (contrat réel Inc4)
  ✓ T13 — entrées non mutées, résultat et conteneurs figés
  ✓ T14 — TypeError sur entrées invalides
  ✓ T14b — clés héritées dangereuses : toutes lèvent TypeError
  ✓ T14c — argument absent, non-objet, creux externes et internes
  ✓ T14d — category lue au plus une fois par candidat
  ✓ T14e — départage lexical sur plusieurs couches, priorité à la première différence
  ✓ T14f — identifiants identiques, départagés par toute la suite d indices
  ✓ T14g — trois couches parfaites identiques : totalScore exactement 100
  ✓ T14h — départage par indices quand les unités sont égales
  ✓ T15 — matrice large : fini, borné, déterministe
  ✓ T16 — de vrais candidats générés passent au path finder
  ✓ T17 — aucun champ voicing/octave/doigté/audio/UI/segment
  ✓ T18 — sanity de l écosystème et export unique

=== Résultat : 33/33 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-transition-score.js 2>&1",
  "description": "Run transition score tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 5 — Scoring de transition entre ChordCandidate ===

  ✓ T01 — Deux appels identiques produisent exactement le même JSON
  ✓ T02 — Candidats profonds inchangés après l'appel
  ✓ T02b — Résultat et structures imbriquées figés
  ✓ T03 — Même identité sonore, orthographes différentes → mêmes scores
  ✓ T04 — Mouvement de fondamentale contrôlé : plus de notes communes → commonScore ≥
  ✓ T05 — Paire proche obtient un motionScore supérieur
  ✓ T06 — from === to valide, borné, totalScore = 100
  ✓ T06b — Deux clones séparés du même candidat
  ✓ T07 — 4 vs 5 pitch classes, symétrie des composantes
  ✓ T08 — Deux basses absentes → bassScore null, bass inactif
  ✓ T08b — Une seule basse présente → bassScore null
  ✓ T08c — Deux basses présentes → composante bass active
  ✓ T08d — Deux propriétés bassPitchClass omises → valide, bass inactif
  ✓ T08e — Une seule propriété omise → bassScore null, bass inactif
  ✓ T08f — Ordre inverse : basse omise côté from, présente côté to
  ✓ T09 — V→I active resolutionScore = 100
  ✓ T09b — I→V ne bénéficie d'aucune résolution
  ✓ T09c — Le bonus V→I rend le total différent de I→V
  ✓ T10 — Matrice large : tous les nombres sont finis
  ✓ T11 — TypeError sur entrées invalides
  ✓ T11b — from === to ne renvoie jamais d'erreur
  ✓ T12 — Aucun champ de chemin dans le résultat
  ✓ T12b — Aucune fonction de sélection exportée
  ✓ T13 — De vrais candidats générés passent au scoreur
  ✓ T14 — Sanity des imports sans régression

=== Résultat : 25/25 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-chord-candidates.js 2>&1",
  "description": "Run chord candidates tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 4 — Génération des candidats d'accords ===

  ✓ S01 — CHORD_DEFINITIONS reste le référentiel unique
  ✓ S02 — Aucune table indépendante de qualités dans src/melody
  ✓ S03 — Anciennes définitions d'accords restent compatibles
  ✓ S04 — Métadonnées d'identité accessibles depuis la définition canonique
  ✓ I05 — maj7 conserve 3 et 7
  ✓ I06 — m7 conserve b3 et b7
  ✓ I07 — 7 conserve 3 et b7
  ✓ I08 — m7b5 conserve b3, b5 et b7
  ✓ I09 — dim7 conserve sa structure identitaire
  ✓ I10 — 7sus4 ne requiert pas une tierce majeure
  ✓ I11 — Omission de quinte autorisée lorsqu'elle est déclarée
  ✓ I12 — Omission identitaire interdite
  ✓ M13 — Mélodie comme chord-tone
  ✓ M14 — Mélodie comme available-tension
  ✓ M15 — Mélodie comme suspension
  ✓ M16 — Note de passage tolérée
  ✓ M17 — Note incompatible rejetée
  ✓ M18 — preserveExactPitch enregistré comme contrainte future
  ✓ M19 — melody-must-be-top enregistré comme contrainte future
  ✓ M20 — allow-notes-above n'élimine pas une mélodie intérieure
  ✓ M21 — harmonizationPolicy skip retourne skipped
  ✓ M22 — harmonizationPolicy force sans candidat retourne no-valid-candidate
  ✓ M23 — automatic conserve plusieurs catégories compatibles
  ✓ A24 — Ancre liée à MelodyEvent
  ✓ A25 — Ancre sans MelodyEvent
  ✓ A26 — Ancre invalide
  ✓ A27 — Accord initial verrouillé
  ✓ A28 — Accord final verrouillé
  ✓ A29 — Accord verrouillé incompatible signalé
  ✓ A30 — Accord original non verrouillé inclus comme candidat
  ✓ F31 — Candidats diatoniques en tonalité majeure
  ✓ F32 — Candidats diatoniques en tonalité mineure
  ✓ F33 — Substitution diatonique documentée
  ✓ F34 — Dominante secondaire avec cible
  ✓ F35 — Dominante secondaire sans cible non générée
  ✓ F36 — Diminué d'approche valide
  ✓ F37 — Symétrie dim7 sans quadruplon inutile
  ✓ F38 — Emprunt modal limité
  ✓ F39 — Candidat chromatique non justifié rejeté
  ✓ E40 — D♭ majeur produit une orthographe en bémols
  ✓ E41 — C# majeur conserve E# et B# lorsque nécessaire
  ✓ E42 — Accord manuel explicite conserve son symbole
  ✓ E43 — Même hauteur, orthographes fonctionnelles distinctes
  ✓ E44 — Respelling ne modifie pas les pitch classes
  ✓ D45 — Doublon réel supprimé
  ✓ D46 — Fonctions distinctes conservées
  ✓ D47 — Basses différentes conservées
  ✓ D48 — Plafond configurable respecté
  ✓ D49 — Aucun minimum artificiel de candidats
  ✓ D50 — Ordre déterministe
  ✓ V51 — CandidateValidationReport JSON-safe
  ✓ V52 — AnchorCandidateGenerationResult JSON-safe
  ✓ V53 — Entrées non mutées
  ✓ V54 — Identifiants stables
  ✓ V55 — Même entrée produit exactement la même sortie
  ✓ V56 — Candidat inconnu rejeté proprement
  ✓ V57 — Aucune logique de transition exécutée
  ✓ V58 — Aucun voicing généré
  ✓ V59 — Aucun appel réseau ou IA
  ✓ R60 — Fm7 verrouillé au départ
  ✓ R61 — B♭m7 verrouillé à l'arrivée
  ✓ R62 — Chaque note mélodique conserve sa contrainte
  ✓ R63 — Plusieurs candidats valides peuvent exister par ancre
  ✓ R64 — La progression complète n'est pas imposée
  ✓ NR65 — Tests des Incréments 0 à 3 toujours verts (sanity locale)
  ✓ NR66 — Tests du moteur d'accords toujours verts (sanity locale)
  ✓ NR67 — Résultat historique du détecteur tonal inchangé
  ✓ NR68 — Build réussi non testable ici, mais modules syntaxiquement valides
  ✓ H69 — preserveExactPitch ne se réduit pas à la pitch class
  ✓ H70 — non-chord-tone-allowed produit un avertissement explicite
  ✓ H71 — suspension produit un avertissement explicite
  ✓ H72 — intervalle identitaire prime sur available-tension
  ✓ H73 — accord initial verrouillé incompatible expose une violation exploitable
  ✓ H74 — plafond bas ne supprime pas le candidat verrouillé
  ✓ H75 — troncature signalée avec le code CANDIDATES_TRUNCATED
  ✓ H76 — aucun score musical caché dans les candidats
  ✓ H77 — emprunts modaux strictement limités au vocabulaire documenté

=== Résultat : 77/77 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-spelled-pitch.js 2>&1",
  "description": "Run spelled pitch tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 3 — Orthographe enharmonique et contrats stabilisés ===

  ✓ A01 — C# et Db ont la même pitchClass
  ✓ A02 — C# et Db n'ont pas la même orthographe
  ✓ A03 — pitchClassFromSpelling valide letter + accidental
  ✓ A04 — Rejet d'une orthographe incohérente
  ✓ A05 — Double bémol accepté
  ✓ A06 — Double dièse accepté
  ✓ A07 — Aucune triple altération générée automatiquement
  ✓ B08 — Do majeur correctement orthographié
  ✓ B09 — Fa majeur avec Si♭
  ✓ B10 — Ré♭ majeur
  ✓ B11 — Do dièse majeur avec Mi dièse et Si dièse
  ✓ B12 — Fa dièse majeur avec Mi dièse
  ✓ B13 — Sol bémol majeur avec Do bémol
  ✓ B13b — 7 lettres distinctes dans chaque gamme
  ✓ C14 — Tonalité détectée avec orthographe par défaut
  ✓ C15 — Sélection manuelle D♭ conservée
  ✓ C16 — Sélection manuelle C# conservée
  ✓ C17 — Scores automatiques inchangés après sélection orthographique
  ✓ C18 — Suppression de la correction manuelle restaure l'orthographe par défaut
  ✓ C19 — Ancien TonalContext sans SpelledKey reste accepté
  ✓ D20 — ChordReference C#m7
  ✓ D21 — ChordReference D♭m7
  ✓ D22 — C#m7 et D♭m7 partagent la même qualité canonique et symboles conservés
  ✓ D23 — Slash chord D♭/F conserve les orthographes respectives
  ✓ D24 — Accord explicite prioritaire sur respelling automatique
  ✓ D25 — Respelling contextuel seulement sur demande ou absence d'écriture explicite
  ✓ E26 — startChord verrouillable
  ✓ E27 — endChord verrouillable
  ✓ E28 — Version incrémentée lors du verrouillage
  ✓ F29 — Ancre facultative après la fin = warning
  ✓ F30 — Ancre force après la fin = error
  ✓ F31 — Ancre verrouillée après la fin = error
  ✓ F32 — Temps négatif = error
  ✓ G33 — Identifiants stables après respelling
  ✓ G34 — JSON-sérialisation
  ✓ G35 — Immutabilité
  ✓ H36 — Résultat historique du détecteur tonal inchangé
  ✓ H37 — Aucun second référentiel d'accords
  ✓ I38 — spellMidiNote conserve l'octave
  ✓ I39 — spellPitchClass fallback déterministe
  ✓ I40 — formatSpelledPitch affiche les altérations

=== Résultat : 41/41 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-tonal-harmonic.js 2>&1",
  "description": "Run tonal harmonic tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 2 — Contexte tonal et harmonique ===

  ✓ T01 — estimation depuis une MelodyTrack simple (Do majeur)
  ✓ T02 — appel réel du chemin notes brutes
  ✓ T03 — aucun appel au chemin fondé sur les accords
  ✓ T04 — événements disabled ignorés
  ✓ T05 — événements incomplets ignorés et signalés
  ✓ T06 — plusieurs candidats conservés
  ✓ T07 — sélection d'un candidat
  ✓ T08 — tonalité manuelle séparée des candidats détectés
  ✓ T09 — correction utilisateur non écrasée
  ✓ T10 — retrait de confirmation
  ✓ T11 — contexte sans estimation suffisante (piste vide)
  ✓ T12 — création d'un HarmonicContext vide
  ✓ T13 — accord initial valide
  ✓ T14 — accord final valide
  ✓ T15 — symbole d'accord inconnu rejeté proprement
  ✓ T16 — ajout d'une ancre liée à MelodyEvent
  ✓ T17 — ancre avec MelodyEvent inexistant rejetée
  ✓ T18 — ancres triées sans mutation de l'entrée
  ✓ T19 — politiques force / automatic / skip
  ✓ T20 — progression originale manuelle
  ✓ T21 — ordre temporel invalide signalé
  ✓ T22 — comparaison mélodie/harmonie en accord
  ✓ T23 — comparaison mélodie/harmonie en conflit
  ✓ T24 — sorties JSON-sérialisables
  ✓ T25 — immutabilité des entrées
  ✓ T26 — version incrémentée après édition
  ✓ T27 — aucun doublon de source de vérité des accords
  ✓ T28 — computeKeyCandidatesFromRawNotes retourne 24 candidats
  ✓ T29 — mise à jour d'une ancre
  ✓ T30 — suppression d'une ancre
  ✓ T31 — validation complète d'un contexte valide
  ✓ T32 — setStartChord avec null retire l'accord
  ✓ T33 — setEndChord avec null retire l'accord
  ✓ T48 — startChord verrouillable
  ✓ T49 — endChord verrouillable
  ✓ T50 — tonalité manuelle C# majeur conservée
  ✓ T51 — tonalité manuelle Db majeur conservée
  ✓ T52 — setStartChord accepte une option locked
  ✓ T34 — rebuildTonalContext crée un nouvel ID
  ✓ T35 — setManualTonalContext avec objet
  ✓ T36 — comparaison relatifs (Do majeur / La mineur)
  ✓ T37 — comparaison parallèles (Do majeur / Do mineur)
  ✓ T38 — validation avec piste vide
  ✓ T39 — ancre avec temps négatif rejetée
  ✓ T40 — mélodie en La mineur produit une estimation
  ✓ T41 — cohérence entre computeKeyFromRawNotes et computeKeyCandidatesFromRawNotes
  ✓ T42 — résultat historique de computeKeyFromRawNotes inchangé
  ✓ T43 — mélodie ambiguë conserve Do majeur et La mineur
  ✓ T44 — très courte mélodie
  ✓ T45 — corrections manuelles répétées sans accumulation
  ✓ T46 — symétrie de compareTonalEstimates
  ✓ T47 — durée exploitée conformément au détecteur

=== Résultat : 52/52 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-melody-track.js 2>&1",
  "description": "Run melody track tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 1 — Piste mélodique explicite ===

  ✓ T01 — conversion d'une note normale en MelodyEvent
  ✓ T02 — conservation exacte du MIDI et de l'octave
  ✓ T03 — conservation des temps et de la durée
  ✓ T04 — conservation de la vélocité
  ✓ T05 — valeurs par défaut des trois politiques
  ✓ T06 — plusieurs notes successives conservent l'ordre
  ✓ T07 — attaque simultanée conservée sans suppression
  ✓ T08 — chevauchement legato conservé et diagnostiqué
  ✓ T09 — événement désactivé reste présent
  ✓ T10 — modification de sopranoPolicy non destructive
  ✓ T11 — modification de harmonizationPolicy non destructive
  ✓ T12 — ajout et suppression d'un marqueur
  ✓ T13 — découpage temporel de la piste
  ✓ T14 — temps relatifs commençant à zéro
  ✓ T15 — construction des événements de lecture
  ✓ T16 — relecture préservant ordre, notes et durées
  ✓ T17 — fin synthétique conservée et signalée
  ✓ T18 — déconnexion signalée
  ✓ T19 — snapshot source non muté
  ✓ T20 — MelodyTrack JSON-sérialisable
  ✓ T21 — retours publics non mutables extérieurement
  ✓ T22 — version incrémentée après édition
  ✓ T23 — deux note-on de même note deviennent deux MelodyEvent
  ✓ T24 — validation refuse une piste vide
  ✓ T25 — piste vide gérée proprement
  ✓ T26 — modification de preserveExactPitch

=== Résultat : 26/26 tests passés ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-midi-capture.js 2>&1",
  "description": "Run midi capture tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 0 — Capture MIDI temporelle non destructive ===

  ✓ T01 — note-on / note-off normal conserve time, note, velocity et channel
  ✓ T02 — note-on vélocité 0 équivaut à note-off
  ✓ T03 — répétition de la même note avant relâchement crée deux note-on distincts
  ✓ T04 — accords simultanés conservent tous les événements
  ✓ T05 — sustain CC64 maintient les notes après note-off
  ✓ T06 — relâchement pendant sustain conserve la note jusqu'à fin de sustain
  ✓ T07 — fin de sustain libère uniquement les notes du canal concerné
  ✓ T08 — finalize génère des note-off pour notes actives sans note-off
  ✓ T09 — finalize nettoie aussi les notes sustained
  ✓ T10 — plusieurs canaux conservent leurs événements séparément
  ✓ T11 — horloge par défaut est monotone
  ✓ T12 — aucune note bloquée après finalize()
  ✓ Bonus — getTimeline est pure et n'altère pas l'état interne
  ✓ T13 — note-off orphelin est enregistré sans crasher
  ✓ T14 — finalize est idempotent
  ✓ T15 — getTimeline/getNotes/getEvents retournent des snapshots JSON-safe
  ✓ T16 — horloge invalide rejette les timestamps incohérents
  ✓ T17 — plusieurs sources conservent leurs notes séparément

=== Résultat : 18/18 tests passés ===

```

---

## Assistant (Build · deepseek-v4-pro · 8.2s)

_Thinking:_

All 9 melody tests passed. Now let me run the remaining validations.

All melody tests pass. Now the remaining validations:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && npm run test:chords 2>&1",
  "description": "Run chord engine tests",
  "timeout": 30000
}
```

**Output:**
```

> piano-jazz-chords@0.1.0 test:chords
> node src/chord-engine/test-chords.js

✅ C9 → C9
✅ C13 → C13
✅ Cm7b5 → Cm7b5
✅ C7#9b13 → C7#9b13
✅ C13#11 → C13#11
✅ C/E (1ère inversion) → C/E
✅ Cmaj9 → Cmaj9
✅ Dm9 → Dm9
✅ G7sus4 → G7sus4
✅ F#m7b5 → F#m7b5
✅ C major (C-E-G) → C
✅ F major (F-A-C) → F
✅ C quartal (C-F-Bb) → Cquartal
✅ C quartal add4 (C-F-Bb-Eb) → Cquartal(add4)
✅ C13#11 with D major upper structure → C13#11
✅ D/C polychord → C/D
✅ C9sus4 → C9sus4
✅ C13sus4 → C13sus4
✅ Cmaj7sus2 → Cmaj7sus2
✅ Cmaj7sus4 → Cmaj7sus4
✅ Dmaj7sus2 → Dmaj7sus2
✅ C7sus4 regression → C7sus4
✅ C9sus4 regression → C9sus4
✅ Gadd11 regression → Gadd11
✅ Aadd11 regression → Aadd11
✅ Em7b9 cluster voicing → Em7b9
✅ Cmaj7 shell (C E B) → Cmaj7
✅ C7 shell (C E Bb) → C7
✅ Cm7 shell (C Eb Bb) → Cm7
✅ Cmaj7 full (C E G B) → Cmaj7
✅ C7 full (C E G Bb) → C7
✅ Cm7 full (C Eb G Bb) → Cm7
✅ C7 no5 — power chord not shell (E B) → E5
✅ Em — not Cmaj7 shell (E G B) → Em
✅ Eb5 — not Cm7 shell (Eb Bb) → D#5
✅ Cmaj7 shell with 9th — not recognised yet (C E B D) → E5/C
✅ C7 shell with 13th — not recognised yet (C E Bb A) → Am/C
✅ C9sus4 no5 — not recognised as shell (C F Bb D) → A#add9/C

Résultat : 98/98 tests réussis (38 directs + 60 transpositions)

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/analyzer/test-regression-part1.js 2>&1",
  "description": "Run regression part1 tests",
  "timeout": 30000
}
```

**Output:**
```
✅ Bug 1.3 — Fmaj9 6 notes (F3,C4,E4,G4,A4,C5) avec jitter
✅ Bug 1.4 — Mélodie isolée C D E F G → Do majeur
✅ Sanity — Progression II-V-I non mélodique

=== Partie 1 regression tests done ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/chord-engine/test-regression-part3.js 2>&1",
  "description": "Run regression part3 tests",
  "timeout": 30000
}
```

**Output:**
```
✅ Partie 3.3 — Secondes rapprochées classées cluster
✅ Partie 3.3 — Triade Mi majeur sur basse Do → upper structure/slash
✅ Partie 3 — Pureté du classifieur

=== Partie 3 regression tests done ===

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && npm run build 2>&1",
  "description": "Run build",
  "timeout": 60000
}
```

**Output:**
```

> piano-jazz-chords@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 47 modules transformed.
rendering chunks...
computing gzip size...
../dist/index.html                                34.14 kB │ gzip:  7.16 kB
../dist/assets/soundtouch-processor-C1MAJdwL.js   72.87 kB
../dist/assets/main-BUD1_6Cx.css                 107.30 kB │ gzip: 19.29 kB
../dist/assets/main-BGsDLFac.js                  164.26 kB │ gzip: 48.65 kB
✓ built in 2.15s

```

---

## Assistant (Build · deepseek-v4-pro · 4.1s)

_Thinking:_

All validations pass. Now let me run the git checks and commit.

Toutes les validations passent. Maintenant les vérifications git et le commit.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --check -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Check whitespace in diff"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short 2>&1",
  "description": "Check status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/melody/test-harmonization-planner.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only 2>&1",
  "description": "Check staged files"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 3.7s)

_Thinking:_

The file `src/melody/test-harmonization-planner.js` is modified but not staged. No staged changes. Let me now stage and commit.

Le fichier est modifié (non staged), pas de staged changes. Je procède au commit.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git add -- src/melody/test-harmonization-planner.js && git diff --cached --check 2>&1 && git diff --cached --name-only 2>&1 && git diff --cached --stat 2>&1 && git status --short 2>&1",
  "description": "Stage and verify only target file"
}
```

**Output:**
```
src/melody/test-harmonization-planner.js
 src/melody/test-harmonization-planner.js | 178 ++++++++++++++++++++++++++-----
 1 file changed, 154 insertions(+), 24 deletions(-)
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
M  src/melody/test-harmonization-planner.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

---

## Assistant (Build · deepseek-v4-pro · 3.2s)

_Thinking:_

Seul le fichier autorisé est staged. Je peux maintenant créer le commit.

Seul le fichier autorisé est staged. Création du commit :

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git commit -m \"test: verify harmonization input descriptors\" 2>&1",
  "description": "Create commit"
}
```

**Output:**
```
[master b6085b4] test: verify harmonization input descriptors
 1 file changed, 154 insertions(+), 24 deletions(-)

```

---

## Assistant (Build · deepseek-v4-pro · 5.5s)

_Thinking:_

The commit was successful. Now I need to run the post-commit verifications and create the auditfile.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff-tree --no-commit-id --name-status -r HEAD 2>&1",
  "description": "Verify commit contents"
}
```

**Output:**
```
M	src/melody/test-harmonization-planner.js

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git rev-parse HEAD 2>&1",
  "description": "Get new HEAD"
}
```

**Output:**
```
b6085b4baa16afb15af3bf89bece19ecc65bf632

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git log -1 --oneline 2>&1",
  "description": "Show last commit"
}
```

**Output:**
```
b6085b4 test: verify harmonization input descriptors

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short 2>&1",
  "description": "Final status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only 2>&1",
  "description": "Verify no staged changes"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --name-only -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Verify target file clean"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Verify target file not staged"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 3.8s)

_Thinking:_

All post-commit checks pass:
- `git diff --cached --name-only` is empty
- `git diff --name-only -- src/melody/test-harmonization-planner.js` is empty
- `git diff --cached --name-only -- src/melody/test-harmonization-planner.js` is empty
- The target file is clean after commit

Now I need to create the audit file. Let me also get the `git show` output for the commit.

Tout est propre. Création du fichier d'audit.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git show --no-color HEAD -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Show commit diff for audit"
}
```

**Output:**
```
commit b6085b4baa16afb15af3bf89bece19ecc65bf632
Author: OpenCode Agent <opencode@local.dev>
Date:   Fri Aug 7 18:23:50 2026 +0200

    test: verify harmonization input descriptors

diff --git a/src/melody/test-harmonization-planner.js b/src/melody/test-harmonization-planner.js
index 8ffaab2..808092f 100644
--- a/src/melody/test-harmonization-planner.js
+++ b/src/melody/test-harmonization-planner.js
@@ -71,9 +71,12 @@ function assertThrowsRangeError(fn, msg = '') {
 /**
  * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
  * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
- * ses clés propres et la valeur/référence exacte de chaque propriété propre.
+ * ses clés propres et le descripteur complet de chaque propriété propre
+ * (type, value, writable, enumerable, configurable pour les données ;
+ *  type, get, set, enumerable, configurable pour les accesseurs).
  * Un WeakSet évite les boucles et les parcours redondants sur les références
- * partagées.
+ * partagées. Les snapshots de propriétés utilisent un Map pour conserver
+ * les symboles comme clés réelles. Aucun getter n'est déclenché.
  *
  * @param {object} root
  * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}
@@ -86,26 +89,37 @@ function captureGraph(root) {
     if (seen.has(obj)) return;
     seen.add(obj);
     const ownKeys = Reflect.ownKeys(obj);
-    const snap = {
-      ref: obj,
-      path,
-      frozen: Object.isFrozen(obj),
-      keys: ownKeys,
-      props: Object.create(null),
-    };
+    const props = new Map();
     for (const k of ownKeys) {
       const desc = Object.getOwnPropertyDescriptor(obj, k);
       if (desc && 'value' in desc) {
-        const v = desc.value;
-        snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };
-        if (v !== null && typeof v === 'object') {
-          visit(v, `${path}.${String(k)}`);
+        props.set(k, {
+          type: 'data',
+          value: desc.value,
+          writable: desc.writable,
+          enumerable: desc.enumerable,
+          configurable: desc.configurable,
+        });
+        if (desc.value !== null && typeof desc.value === 'object') {
+          visit(desc.value, `${path}.${String(k)}`);
         }
       } else {
-        snap.props[k] = { type: 'accessor' };
+        props.set(k, {
+          type: 'accessor',
+          get: desc ? desc.get : undefined,
+          set: desc ? desc.set : undefined,
+          enumerable: desc ? desc.enumerable : undefined,
+          configurable: desc ? desc.configurable : undefined,
+        });
       }
     }
-    snapshots.set(obj, snap);
+    snapshots.set(obj, {
+      ref: obj,
+      path,
+      frozen: Object.isFrozen(obj),
+      keys: ownKeys,
+      props,
+    });
   }
   visit(root, 'input');
   return { snapshots, seen };
@@ -115,13 +129,23 @@ function captureGraph(root) {
  * Vérifie que le graphe accessible depuis root est inchangé par rapport au
  * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à
  * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références
- * pour les valeurs objet, même état de gel.
+ * pour les valeurs objet, même état de gel, et descripteurs complets identiques
+ * (writable, enumerable, configurable pour les données ; get, set, enumerable,
+ * configurable pour les accesseurs). Vérifie aussi la référence exacte de la
+ * racine.
  *
  * @param {object} root
  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
  * @param {string} rootPath
  */
 function assertGraphUnchanged(root, captured, rootPath = 'input') {
+  const rootSnap = captured.snapshots.get(root);
+  if (!rootSnap) {
+    throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);
+  }
+  if (root !== rootSnap.ref) {
+    throw new Error(`${rootPath} référence de la racine modifiée`);
+  }
   const visited = new WeakSet();
   function visit(obj, expectedObj, path) {
     if (obj === null || typeof obj !== 'object') {
@@ -146,7 +170,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
     }
     for (const k of ownKeys) {
       const desc = Object.getOwnPropertyDescriptor(obj, k);
-      const snapProp = snap.props[k];
+      const snapProp = snap.props.get(k);
       if (!snapProp) {
         throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
       }
@@ -154,6 +178,18 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
         if (!desc || 'value' in desc) {
           throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
         }
+        if (desc.get !== snapProp.get) {
+          throw new Error(`${path}.${String(k)} getter modifié`);
+        }
+        if (desc.set !== snapProp.set) {
+          throw new Error(`${path}.${String(k)} setter modifié`);
+        }
+        if (desc.enumerable !== snapProp.enumerable) {
+          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
+        }
+        if (desc.configurable !== snapProp.configurable) {
+          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
+        }
         continue;
       }
       const actualV = desc ? desc.value : undefined;
@@ -161,6 +197,15 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
       if (actualV !== expectedV) {
         throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
       }
+      if (desc && desc.writable !== snapProp.writable) {
+        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
+      }
+      if (desc && desc.enumerable !== snapProp.enumerable) {
+        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
+      }
+      if (desc && desc.configurable !== snapProp.configurable) {
+        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
+      }
       if (actualV !== null && typeof actualV === 'object') {
         visit(actualV, expectedV, `${path}.${String(k)}`);
       }
@@ -702,11 +747,84 @@ runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouvea
   const plan = buildHarmonizationPlan(input);
 
   // Vérification globale du graphe : chaque objet accessible conserve sa
-  // référence, son état de gel, ses clés propres et la valeur/référence de
-  // chaque propriété propre. Détecte un gel ou un remplacement post-call de
-  // ctx.tonalContext, d'un tableau du contexte tonal, d'un événement ou d'une ancre.
+  // référence, son état de gel, ses clés propres et le descripteur complet de
+  // chaque propriété propre. Détecte un gel, un remplacement post-call, un
+  // changement de writable/enumerable/configurable, un remplacement de getter
+  // ou setter, un changement d'ordre des clés, un changement de référence racine.
   assertGraphUnchanged(input, captured, 'input');
 
+  // --- Contrôles synthétiques : preuve que le helper détecte les mutations
+  // de descripteurs seuls (sans changer la valeur). Ces contrôles ne créent
+  // pas de nouveau test public ; ils valident la robustesse interne du helper.
+
+  // 1. Propriété non énumérable dont seul writable change.
+  (() => {
+    const obj = { x: 1 };
+    Object.defineProperty(obj, 'x', { writable: false, enumerable: false, configurable: true });
+    const cap = captureGraph(obj);
+    Object.defineProperty(obj, 'x', { writable: true, enumerable: false, configurable: true });
+    let err = null;
+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }
+    assertTrue(err !== null, 'synth1: writable modifié détecté');
+    assertTrue(String(err.message).includes('writable'), 'synth1: message mentionne writable');
+  })();
+
+  // 2. Propriété portée par un symbole dont seul enumerable change.
+  (() => {
+    const sym = Symbol('test');
+    const obj = {};
+    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: false, configurable: true });
+    const cap = captureGraph(obj);
+    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: true, configurable: true });
+    let err = null;
+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }
+    assertTrue(err !== null, 'synth2: enumerable modifié sur symbole détecté');
+    assertTrue(String(err.message).includes('enumerable'), 'synth2: message mentionne enumerable');
+  })();
+
+  // 3. Accesseur dont le getter est remplacé par une autre fonction.
+  (() => {
+    let v = 1;
+    const obj = {};
+    const get1 = () => v;
+    const get2 = () => v + 1;
+    Object.defineProperty(obj, 'val', { get: get1, set: undefined, enumerable: true, configurable: true });
+    const cap = captureGraph(obj);
+    Object.defineProperty(obj, 'val', { get: get2, set: undefined, enumerable: true, configurable: true });
+    let err = null;
+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }
+    assertTrue(err !== null, 'synth3: getter remplacé détecté');
+    assertTrue(String(err.message).includes('getter'), 'synth3: message mentionne getter');
+  })();
+
+  // 4. Tableau dont length ou l'ordre des éléments change.
+  (() => {
+    const arr = [1, 2, 3];
+    const cap = captureGraph(arr);
+    arr.push(4);
+    let err = null;
+    try { assertGraphUnchanged(arr, cap, 'synth'); } catch (e) { err = e; }
+    assertTrue(err !== null, 'synth4: length/ordre modifié détecté');
+  })();
+
+  // 5. Preuve qu'aucun getter n'a été exécuté pendant la capture ou la
+  //    vérification. On crée un objet avec un getter qui lève une erreur
+  //    s'il est appelé. La capture et la vérification doivent réussir sans
+  //    déclencher le getter.
+  (() => {
+    const obj = {};
+    let getterCalled = false;
+    Object.defineProperty(obj, 'computed', {
+      get() { getterCalled = true; return 99; },
+      enumerable: true,
+      configurable: true,
+    });
+    const cap = captureGraph(obj);
+    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant captureGraph');
+    assertGraphUnchanged(obj, cap, 'synth');
+    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');
+  })();
+
   // Wrapper : référence et état de gel inchangés.
   assertTrue(input === inputRef, 'wrapper même référence');
   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');
@@ -810,6 +928,16 @@ runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)'
   // TypeError (ancre structurellement invalide), pas RangeError.
   const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };
   const invalidCtx = { ...ctx, anchors: [badAnchor] };
+
+  // Preuve directe : le générateur public confirme le statut invalid-anchor.
+  const directResult = generateChordCandidatesForAnchor({
+    anchor: badAnchor,
+    track,
+    harmonicContext: invalidCtx,
+  });
+  assertEqual(directResult.status, 'invalid-anchor',
+    'statut public direct = invalid-anchor pour ancre sans id');
+
   let err = null;
   try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }
   assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');
@@ -817,10 +945,12 @@ runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)'
   assertTrue(String(err.message).toLowerCase().includes('invalide'),
     'message indique que l ancre est invalide');
 
-  // Note : le validateur canonique (chord-candidate-generator.js:896) ne
-  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire
-  // le statut 'invalid-anchor'. Il est donc impossible de construire une
-  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
+  // Note : le validateur canonique (chord-candidate-generator.js) ne vérifie
+  // que la condition `!anchor || !anchor.id`. Aucun autre champ ne peut
+  // produire le statut 'invalid-anchor'. Il est donc impossible de construire
+  // une ancre avec un id réel non vide qui déclenche 'invalid-anchor'.
+  // Cette limitation est inhérente au contrat du générateur, pas à une ligne
+  // de code particulière.
 
   // Ancre valide sans candidat : mode force sans contexte tonal ni accord
   // original. Le statut public direct du générateur est 'no-valid-candidate'.

```

---

## Assistant (Build · deepseek-v4-pro · 3.2s)

_Thinking:_

Now I need to create the audit file. Let me gather all the raw outputs and write the audit file.

Now let me create the audit file:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && grep -n \"invalid-anchor\\|!anchor\\.id\" src/melody/chord-candidate-generator.js",
  "description": "Get exact proof for invalid-anchor condition"
}
```

**Output:**
```
896:  if (!anchor || !anchor.id) {
900:      status: 'invalid-anchor',

```

---

## Assistant (Build · deepseek-v4-pro · 55.8s)

_Thinking:_

Now I need to create the audit file. Let me gather all the information needed.

**Tool: write**

**Input:**
```json
{
  "filePath": "/home/visiteur/increment-8-descriptor-audit.txt",
  "content": "==================================================\nAUDIT FINAL — INCRÉMENT 8 — LACUNE DESCRIPTEURS\n==================================================\n\nHEAD initial :\n4dfe085ec59478caf0ab048eadc73b51194266c4\n\ngit status --short initial :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n?? .claude/plans/increment-3-enharmonic-plan.md\n?? .claude/plans/increment-4-candidate-generation-plan.md\n?? .claude/worktrees/\n?? ANALYSE_QUALITE_413.md\n?? COMPARAISON_AB.md\n?? COMPARAISON_PROGRESSIONS.md\n?? COMPARAISON_REELLES.md\n?? RAPPORT_DIAGNOSTIC.md\n?? docs/DESIGN.md\n?? docs/MIDI_EXPORT.md\n?? docs/chord-audit/chord-system-audit.md\n?? docs/chord-audit/chord-test-cases.json\n?? docs/chord-audit/chord-vocabulary.json\n?? docs/chord-audit/source-files.txt\n?? electron/harmony_engine/__pycache__/\n?? screenshots/\n?? scripts/__pycache__/calibrate_v1.cpython-313.pyc\n?? scripts/__pycache__/experiment-templates.cpython-313.pyc\n?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc\n?? scripts/__pycache__/historical_baseline.cpython-313.pyc\n?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc\n?? scripts/ab-benchmark.py\n?? scripts/audit-observation.py\n?? scripts/compare-progressions.py\n?? scripts/compare-reelles.py\n?? scripts/diagnostic-pipeline.py\n?? scripts/diagnostic-stages.py\n?? scripts/experiment-templates.py\n?? scripts/gen-benchmark.py\n?? scripts/generate-progression-tests.py\n?? scripts/verif-metrics.py\n?? sessionjazz-ses_02b4.md\n?? src/index.html.tailwind-backup\n?? src/ui/components/\n?? tests/__pycache__/\n?? tests/audio/diagnostic/\n?? tests/audio/progressions/\n?? tests/audio/reelles_comparison/\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav\n\ngit diff --name-status initial :\nM\t.clinerules/rules-projet.md\nM\tCHANGES.md\nM\telectron/__pycache__/audio-processor.cpython-313.pyc\nM\telectron/audio-processor.py\nM\tpackage-lock.json\nM\tpackage.json\nM\tsrc/index.html\nM\tsrc/main.js\nM\tsrc/recorder/serializer.js\nM\tsrc/style.css\nM\tsrc/ui/display.js\nM\tvite.config.js\n\ngit diff --cached --name-status initial :\n(no output)\n\ngit diff -- src/melody/test-harmonization-planner.js initial :\n(no output)\n\ngit diff --cached -- src/melody/test-harmonization-planner.js initial :\n(no output)\n\n==================================================\nPREUVE EXACTE DU VALIDATEUR invalid-anchor\n==================================================\n\nCommande : grep -n \"invalid-anchor\\|!anchor\\.id\" src/melody/chord-candidate-generator.js\n\nSortie brute :\n896:  if (!anchor || !anchor.id) {\n900:      status: 'invalid-anchor',\n\nContexte (lignes 895-912) :\n  // 1. Ancre invalide\n  if (!anchor || !anchor.id) {\n    return {\n      anchorId: anchor ? anchor.id : null,\n      melodyEventId: anchor ? anchor.melodyEventId : null,\n      status: 'invalid-anchor',\n      candidates: [],\n      rejectedSummary,\n      warnings: [{\n        severity: 'error',\n        code: 'INVALID_ANCHOR',\n        message: 'Ancre harmonique invalide.',\n        anchorId: null,\n        melodyEventId: null,\n        details: {},\n      }],\n    };\n  }\n\nConclusion : La condition canonique est `!anchor || !anchor.id`. Aucun autre\nchamp (type, harmonizationPolicy, relativeTime, etc.) ne peut produire le\nstatut 'invalid-anchor'. Il est donc impossible de construire une ancre avec\nun id réel non vide qui déclenche 'invalid-anchor'. Cette limitation est\ninhérente au contrat du générateur.\n\n==================================================\nDIFF RÉALISÉ\n==================================================\n\nsrc/melody/test-harmonization-planner.js | 178 ++++++++++++++++++++++++++-----\n 1 file changed, 154 insertions(+), 24 deletions(-)\n\nModifications :\n- captureGraph() : utilise Map pour les snapshots de propriétés, mémorise\n  writable/enumerable/configurable pour les données, get/set/enumerable/\n  configurable pour les accesseurs. Conserve les symboles comme clés réelles.\n- assertGraphUnchanged() : vérifie la référence exacte de la racine, compare\n  writable/enumerable/configurable pour les données, get/set/enumerable/\n  configurable pour les accesseurs.\n- T11 : ajout de 5 contrôles synthétiques internes prouvant que le helper\n  détecte les mutations de descripteurs seuls (writable, enumerable sur\n  symbole, getter remplacé, length/ordre tableau, aucun getter déclenché).\n- T13 : ajout de la preuve directe `generateChordCandidatesForAnchor` avec\n  statut 'invalid-anchor'. Remplacement de la référence fragile au numéro\n  de ligne par une explication fondée sur la condition réelle.\n\n==================================================\nVALIDATIONS\n==================================================\n\n1. node src/melody/test-harmonization-planner.js\n   Résultat : 18/18 tests passés\n   Code de sortie : 0\n\n2. node src/melody/test-voicing-path-finder.js\n   Résultat : 22/22 tests passés\n   Code de sortie : 0\n\n3. node src/melody/test-harmonic-path-finder.js\n   Résultat : 33/33 tests passés\n   Code de sortie : 0\n\n4. node src/melody/test-transition-score.js\n   Résultat : 25/25 tests passés\n   Code de sortie : 0\n\n5. node src/melody/test-chord-candidates.js\n   Résultat : 77/77 tests passés\n   Code de sortie : 0\n\n6. node src/melody/test-spelled-pitch.js\n   Résultat : 41/41 tests passés\n   Code de sortie : 0\n\n7. node src/melody/test-tonal-harmonic.js\n   Résultat : 52/52 tests passés\n   Code de sortie : 0\n\n8. node src/melody/test-melody-track.js\n   Résultat : 26/26 tests passés\n   Code de sortie : 0\n\n9. node src/melody/test-midi-capture.js\n   Résultat : 18/18 tests passés\n   Code de sortie : 0\n\n10. npm run test:chords\n    Résultat : 98/98 tests réussis (38 directs + 60 transpositions)\n    Code de sortie : 0\n\n11. node src/analyzer/test-regression-part1.js\n    Résultat : 3/3 OK\n    Code de sortie : 0\n\n12. node src/chord-engine/test-regression-part3.js\n    Résultat : 3/3 OK\n    Code de sortie : 0\n\n13. npm run build\n    Résultat : Build réussi en 2.15s\n    Code de sortie : 0\n\nNombre exact de tests du planificateur : 18\n\n==================================================\nCOMMIT\n==================================================\n\nFichiers staged avant le commit :\nsrc/melody/test-harmonization-planner.js\n\ngit diff --cached --check : (no output)\ngit diff --cached --name-only : src/melody/test-harmonization-planner.js\ngit diff --cached --stat : 1 file changed, 154 insertions(+), 24 deletions(-)\n\nHash du commit : b6085b4baa16afb15af3bf89bece19ecc65bf632\nMessage : test: verify harmonization input descriptors\n\ngit diff-tree --no-commit-id --name-status -r HEAD :\nM\tsrc/melody/test-harmonization-planner.js\n\ngit status --short final :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n?? .claude/plans/increment-3-enharmonic-plan.md\n?? .claude/plans/increment-4-candidate-generation-plan.md\n?? .claude/worktrees/\n?? ANALYSE_QUALITE_413.md\n?? COMPARAISON_AB.md\n?? COMPARAISON_PROGRESSIONS.md\n?? COMPARAISON_REELLES.md\n?? RAPPORT_DIAGNOSTIC.md\n?? docs/DESIGN.md\n?? docs/MIDI_EXPORT.md\n?? docs/chord-audit/chord-system-audit.md\n?? docs/chord-audit/chord-test-cases.json\n?? docs/chord-audit/chord-vocabulary.json\n?? docs/chord-audit/source-files.txt\n?? electron/harmony_engine/__pycache__/\n?? screenshots/\n?? scripts/__pycache__/calibrate_v1.cpython-313.pyc\n?? scripts/__pycache__/experiment-templates.cpython-313.pyc\n?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc\n?? scripts/__pycache__/historical_baseline.cpython-313.pyc\n?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc\n?? scripts/ab-benchmark.py\n?? scripts/audit-observation.py\n?? scripts/compare-progressions.py\n?? scripts/compare-reelles.py\n?? scripts/diagnostic-pipeline.py\n?? scripts/diagnostic-stages.py\n?? scripts/experiment-templates.py\n?? scripts/gen-benchmark.py\n?? scripts/generate-progression-tests.py\n?? scripts/verif-metrics.py\n?? sessionjazz-ses_02b4.md\n?? src/index.html.tailwind-backup\n?? src/ui/components/\n?? tests/__pycache__/\n?? tests/audio/diagnostic/\n?? tests/audio/progressions/\n?? tests/audio/reelles_comparison/\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav\n\ngit diff --cached --name-only final :\n(no output)\n\ngit diff --name-only -- src/melody/test-harmonization-planner.js final :\n(no output)\n\ngit diff --cached --name-only -- src/melody/test-harmonization-planner.js final :\n(no output)\n\n==================================================\ngit show --no-color HEAD -- src/melody/test-harmonization-planner.js\n==================================================\n\ncommit b6085b4baa16afb15af3bf89bece19ecc65bf632\nAuthor: OpenCode Agent <opencode@local.dev>\nDate:   Fri Aug 7 18:23:50 2026 +0200\n\n    test: verify harmonization input descriptors\n\ndiff --git a/src/melody/test-harmonization-planner.js b/src/melody/test-harmonization-planner.js\nindex 8ffaab2..808092f 100644\n--- a/src/melody/test-harmonization-planner.js\n+++ b/src/melody/test-harmonization-planner.js\n@@ -71,9 +71,12 @@ function assertThrowsRangeError(fn, msg = '') {\n /**\n  * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.\n  * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,\n- * ses clés propres et la valeur/référence exacte de chaque propriété propre.\n+ * ses clés propres et le descripteur complet de chaque propriété propre\n+ * (type, value, writable, enumerable, configurable pour les données ;\n+ *  type, get, set, enumerable, configurable pour les accesseurs).\n  * Un WeakSet évite les boucles et les parcours redondants sur les références\n- * partagées.\n+ * partagées. Les snapshots de propriétés utilisent un Map pour conserver\n+ * les symboles comme clés réelles. Aucun getter n'est déclenché.\n  *\n  * @param {object} root\n  * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}\n@@ -86,26 +89,37 @@ function captureGraph(root) {\n     if (seen.has(obj)) return;\n     seen.add(obj);\n     const ownKeys = Reflect.ownKeys(obj);\n-    const snap = {\n-      ref: obj,\n-      path,\n-      frozen: Object.isFrozen(obj),\n-      keys: ownKeys,\n-      props: Object.create(null),\n-    };\n+    const props = new Map();\n     for (const k of ownKeys) {\n       const desc = Object.getOwnPropertyDescriptor(obj, k);\n       if (desc && 'value' in desc) {\n-        const v = desc.value;\n-        snap.props[k] = { type: 'data', value: v, isObject: v !== null && typeof v === 'object' };\n-        if (v !== null && typeof v === 'object') {\n-          visit(v, `${path}.${String(k)}`);\n+        props.set(k, {\n+          type: 'data',\n+          value: desc.value,\n+          writable: desc.writable,\n+          enumerable: desc.enumerable,\n+          configurable: desc.configurable,\n+        });\n+        if (desc.value !== null && typeof desc.value === 'object') {\n+          visit(desc.value, `${path}.${String(k)}`);\n         }\n       } else {\n-        snap.props[k] = { type: 'accessor' };\n+        props.set(k, {\n+          type: 'accessor',\n+          get: desc ? desc.get : undefined,\n+          set: desc ? desc.set : undefined,\n+          enumerable: desc ? desc.enumerable : undefined,\n+          configurable: desc ? desc.configurable : undefined,\n+        });\n       }\n     }\n-    snapshots.set(obj, snap);\n+    snapshots.set(obj, {\n+      ref: obj,\n+      path,\n+      frozen: Object.isFrozen(obj),\n+      keys: ownKeys,\n+      props,\n+    });\n   }\n   visit(root, 'input');\n   return { snapshots, seen };\n@@ -115,13 +129,23 @@ function captureGraph(root) {\n  * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n  * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à\n  * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références\n- * pour les valeurs objet, même état de gel.\n+ * pour les valeurs objet, même état de gel, et descripteurs complets identiques\n+ * (writable, enumerable, configurable pour les données ; get, set, enumerable,\n+ * configurable pour les accesseurs). Vérifie aussi la référence exacte de la\n+ * racine.\n  *\n  * @param {object} root\n  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n  * @param {string} rootPath\n  */\n function assertGraphUnchanged(root, captured, rootPath = 'input') {\n+  const rootSnap = captured.snapshots.get(root);\n+  if (!rootSnap) {\n+    throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);\n+  }\n+  if (root !== rootSnap.ref) {\n+    throw new Error(`${rootPath} référence de la racine modifiée`);\n+  }\n   const visited = new WeakSet();\n   function visit(obj, expectedObj, path) {\n     if (obj === null || typeof obj !== 'object') {\n@@ -146,7 +170,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n     }\n     for (const k of ownKeys) {\n       const desc = Object.getOwnPropertyDescriptor(obj, k);\n-      const snapProp = snap.props[k];\n+      const snapProp = snap.props.get(k);\n       if (!snapProp) {\n         throw new Error(`${path}.${String(k)} propriété absente du snapshot`);\n       }\n@@ -154,6 +178,18 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n         if (!desc || 'value' in desc) {\n           throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);\n         }\n+        if (desc.get !== snapProp.get) {\n+          throw new Error(`${path}.${String(k)} getter modifié`);\n+        }\n+        if (desc.set !== snapProp.set) {\n+          throw new Error(`${path}.${String(k)} setter modifié`);\n+        }\n+        if (desc.enumerable !== snapProp.enumerable) {\n+          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n+        }\n+        if (desc.configurable !== snapProp.configurable) {\n+          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n+        }\n         continue;\n       }\n       const actualV = desc ? desc.value : undefined;\n@@ -161,6 +197,15 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n       if (actualV !== expectedV) {\n         throw new Error(`${path}.${String(k)} valeur/référence modifiée`);\n       }\n+      if (desc && desc.writable !== snapProp.writable) {\n+        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);\n+      }\n+      if (desc && desc.enumerable !== snapProp.enumerable) {\n+        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n+      }\n+      if (desc && desc.configurable !== snapProp.configurable) {\n+        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n+      }\n       if (actualV !== null && typeof actualV === 'object') {\n         visit(actualV, expectedV, `${path}.${String(k)}`);\n       }\n@@ -702,11 +747,84 @@ runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouvea\n   const plan = buildHarmonizationPlan(input);\n \n   // Vérification globale du graphe : chaque objet accessible conserve sa\n-  // référence, son état de gel, ses clés propres et la valeur/référence de\n-  // chaque propriété propre. Détecte un gel ou un remplacement post-call de\n-  // ctx.tonalContext, d'un tableau du contexte tonal, d'un événement ou d'une ancre.\n+  // référence, son état de gel, ses clés propres et le descripteur complet de\n+  // chaque propriété propre. Détecte un gel, un remplacement post-call, un\n+  // changement de writable/enumerable/configurable, un remplacement de getter\n+  // ou setter, un changement d'ordre des clés, un changement de référence racine.\n   assertGraphUnchanged(input, captured, 'input');\n \n+  // --- Contrôles synthétiques : preuve que le helper détecte les mutations\n+  // de descripteurs seuls (sans changer la valeur). Ces contrôles ne créent\n+  // pas de nouveau test public ; ils valident la robustesse interne du helper.\n+\n+  // 1. Propriété non énumérable dont seul writable change.\n+  (() => {\n+    const obj = { x: 1 };\n+    Object.defineProperty(obj, 'x', { writable: false, enumerable: false, configurable: true });\n+    const cap = captureGraph(obj);\n+    Object.defineProperty(obj, 'x', { writable: true, enumerable: false, configurable: true });\n+    let err = null;\n+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n+    assertTrue(err !== null, 'synth1: writable modifié détecté');\n+    assertTrue(String(err.message).includes('writable'), 'synth1: message mentionne writable');\n+  })();\n+\n+  // 2. Propriété portée par un symbole dont seul enumerable change.\n+  (() => {\n+    const sym = Symbol('test');\n+    const obj = {};\n+    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: false, configurable: true });\n+    const cap = captureGraph(obj);\n+    Object.defineProperty(obj, sym, { value: 42, writable: true, enumerable: true, configurable: true });\n+    let err = null;\n+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n+    assertTrue(err !== null, 'synth2: enumerable modifié sur symbole détecté');\n+    assertTrue(String(err.message).includes('enumerable'), 'synth2: message mentionne enumerable');\n+  })();\n+\n+  // 3. Accesseur dont le getter est remplacé par une autre fonction.\n+  (() => {\n+    let v = 1;\n+    const obj = {};\n+    const get1 = () => v;\n+    const get2 = () => v + 1;\n+    Object.defineProperty(obj, 'val', { get: get1, set: undefined, enumerable: true, configurable: true });\n+    const cap = captureGraph(obj);\n+    Object.defineProperty(obj, 'val', { get: get2, set: undefined, enumerable: true, configurable: true });\n+    let err = null;\n+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n+    assertTrue(err !== null, 'synth3: getter remplacé détecté');\n+    assertTrue(String(err.message).includes('getter'), 'synth3: message mentionne getter');\n+  })();\n+\n+  // 4. Tableau dont length ou l'ordre des éléments change.\n+  (() => {\n+    const arr = [1, 2, 3];\n+    const cap = captureGraph(arr);\n+    arr.push(4);\n+    let err = null;\n+    try { assertGraphUnchanged(arr, cap, 'synth'); } catch (e) { err = e; }\n+    assertTrue(err !== null, 'synth4: length/ordre modifié détecté');\n+  })();\n+\n+  // 5. Preuve qu'aucun getter n'a été exécuté pendant la capture ou la\n+  //    vérification. On crée un objet avec un getter qui lève une erreur\n+  //    s'il est appelé. La capture et la vérification doivent réussir sans\n+  //    déclencher le getter.\n+  (() => {\n+    const obj = {};\n+    let getterCalled = false;\n+    Object.defineProperty(obj, 'computed', {\n+      get() { getterCalled = true; return 99; },\n+      enumerable: true,\n+      configurable: true,\n+    });\n+    const cap = captureGraph(obj);\n+    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant captureGraph');\n+    assertGraphUnchanged(obj, cap, 'synth');\n+    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');\n+  })();\n+\n   // Wrapper : référence et état de gel inchangés.\n   assertTrue(input === inputRef, 'wrapper même référence');\n   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');\n@@ -810,6 +928,16 @@ runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)'\n   // TypeError (ancre structurellement invalide), pas RangeError.\n   const badAnchor = { relativeTime: 0, type: 'user', harmonizationPolicy: 'automatic' };\n   const invalidCtx = { ...ctx, anchors: [badAnchor] };\n+\n+  // Preuve directe : le générateur public confirme le statut invalid-anchor.\n+  const directResult = generateChordCandidatesForAnchor({\n+    anchor: badAnchor,\n+    track,\n+    harmonicContext: invalidCtx,\n+  });\n+  assertEqual(directResult.status, 'invalid-anchor',\n+    'statut public direct = invalid-anchor pour ancre sans id');\n+\n   let err = null;\n   try { buildHarmonizationPlan({ track, harmonicContext: invalidCtx }); } catch (e) { err = e; }\n   assertTrue(err instanceof TypeError, 'ancre sans id -> TypeError');\n@@ -817,10 +945,12 @@ runTest('T13 — ancres invalides : TypeError (délégué aux contrats publics)'\n   assertTrue(String(err.message).toLowerCase().includes('invalide'),\n     'message indique que l ancre est invalide');\n \n-  // Note : le validateur canonique (chord-candidate-generator.js:896) ne\n-  // vérifie que !anchor || !anchor.id. Aucun autre champ ne peut produire\n-  // le statut 'invalid-anchor'. Il est donc impossible de construire une\n-  // ancre avec un id réel non vide qui déclenche 'invalid-anchor'.\n+  // Note : le validateur canonique (chord-candidate-generator.js) ne vérifie\n+  // que la condition `!anchor || !anchor.id`. Aucun autre champ ne peut\n+  // produire le statut 'invalid-anchor'. Il est donc impossible de construire\n+  // une ancre avec un id réel non vide qui déclenche 'invalid-anchor'.\n+  // Cette limitation est inhérente au contrat du générateur, pas à une ligne\n+  // de code particulière.\n \n   // Ancre valide sans candidat : mode force sans contexte tonal ni accord\n   // original. Le statut public direct du générateur est 'no-valid-candidate'.\n\n==================================================\nDÉCISION FINALE\n==================================================\n\nINCRÉMENT 8 TERMINÉ\n"
}
```

**Output:**
```
Wrote file successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 4.6s)

_Thinking:_

All validations passed, the commit was created successfully, and the audit file has been written. Let me verify the final state is clean for the target file.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Run all validations",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Commit if all pass",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "Create audit file",
      "priority": "high",
      "status": "completed"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "T11: Update captureGraph() to store full descriptors (writable, enumerable, configurable, get, set) using Map",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T11: Update assertGraphUnchanged() to compare full descriptors + root reference",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T11: Add synthetic checks proving descriptor-only mutations are detected",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "T13: Add direct proof for invalid-anchor + replace fragile line number comment",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Run all validations",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Commit if all pass",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Create audit file",
    "status": "completed",
    "priority": "high"
  }
]
```

---

## Assistant (Build · deepseek-v4-pro · 12.8s)

_Thinking:_

All tasks are complete. Let me summarize what was done:

1. **T11 - Descriptor comparison**: Updated `captureGraph()` to use `Map` for property snapshots (preserving Symbols as real keys), and to store full descriptors: `type`, `value`, `writable`, `enumerable`, `configurable` for data properties; `type`, `get`, `set`, `enumerable`, `configurable` for accessors. Updated `assertGraphUnchanged()` to compare all these descriptor fields, plus root reference verification.

2. **T11 - Synthetic checks**: Added 5 internal synthetic checks proving the helper detects:
   - Non-enumerable property with only `writable` changed
   - Symbol-keyed property with only `enumerable` changed
   - Accessor with getter replaced by another function
   - Array with `length`/order changed
   - Proof that no getter is triggered during capture or verification

3. **T13 - Invalid anchor contract**: Added direct proof via `generateChordCandidatesForAnchor` confirming `invalid-anchor` status. Replaced the fragile line number reference (`chord-candidate-generator.js:896`) with an explanation based on the actual condition (`!anchor || !anchor.id`).

All 13 validation commands passed, build succeeded, commit created cleanly.

INCRÉMENT 8 TERMINÉ

Commit `b6085b4` — `test: verify harmonization input descriptors`

Résumé des modifications dans `src/melody/test-harmonization-planner.js` :

- **`captureGraph()`** : utilise `Map` pour les snapshots de propriétés (conserve les symboles comme clés réelles), mémorise `writable`/`enumerable`/`configurable` pour les données, `get`/`set`/`enumerable`/`configurable` pour les accesseurs.
- **`assertGraphUnchanged()`** : vérifie la référence exacte de la racine, compare tous les champs de descripteurs.
- **T11** : 5 contrôles synthétiques internes (writable, symbole+enumerable, getter remplacé, length/ordre tableau, aucun getter déclenché).
- **T13** : preuve directe `generateChordCandidatesForAnchor` → `invalid-anchor`, remplacement de la référence fragile au numéro de ligne par l'explication fondée sur la condition `!anchor || !anchor.id`.

Toutes les validations (18/18 planificateur, 13 suites de tests, build) passent. Audit complet dans `/home/visiteur/increment-8-descriptor-audit.txt`.

---

## User

Clôture strictement finale de l’Incrément 8.

HEAD attendu :

b6085b4baa16afb15af3bf89bece19ecc65bf632

Ne commence pas l’Incrément 9.

Seul fichier du dépôt autorisé :

src/melody/test-harmonization-planner.js

1. ÉTAT INITIAL

Exécute et conserve les sorties brutes :

cd /home/visiteur/piano-jazz-chords
git rev-parse HEAD
git status --short
git diff --name-status
git diff --cached --name-status
git diff -- src/melody/test-harmonization-planner.js
git diff --cached -- src/melody/test-harmonization-planner.js

Si le fichier autorisé possède déjà un changement staged ou non committé,
arrête-toi sans rien modifier.

2. T11 — PARCOURS DES FONCTIONS

captureGraph() et assertGraphUnchanged() ne reconnaissent actuellement comme
nœuds récursifs que les valeurs pour lesquelles :

typeof value === 'object'

Corrige-les afin de traiter comme nœud toute valeur non nulle dont le type est :

- object ;
- function.

Utilise un helper commun, par exemple :

function isGraphNode(value) {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function');
}

Utilise ce helper de manière cohérente pendant la capture et la vérification.

Les fonctions atteignables comme valeurs de propriétés doivent donc conserver :

- leur référence exacte ;
- leur état de gel ;
- toutes leurs clés propres via Reflect.ownKeys() ;
- tous leurs descripteurs ;
- leurs éventuels sous-objets et sous-fonctions ;
- leurs cycles et références partagées.

Ne déclenche aucun getter.

Ajoute dans T11 une preuve synthétique interne :

- une propriété de données contient une fonction ;
- cette fonction possède une propriété propre imbriquée ;
- le graphe est capturé ;
- seule une propriété ou un descripteur de cette fonction est modifié ;
- assertGraphUnchanged() doit détecter la mutation.

Conserve tous les contrôles existants.

3. VALIDATIONS AVEC SORTIES BRUTES

Exécute exactement, dans cet ordre :

node src/melody/test-harmonization-planner.js
node src/melody/test-voicing-path-finder.js
node src/melody/test-harmonic-path-finder.js
node src/melody/test-transition-score.js
node src/melody/test-chord-candidates.js
node src/melody/test-spelled-pitch.js
node src/melody/test-tonal-harmonic.js
node src/melody/test-melody-track.js
node src/melody/test-midi-capture.js
npm run test:chords
node src/analyzer/test-regression-part1.js
node src/chord-engine/test-regression-part3.js
npm run build

Puis :

git diff --check -- src/melody/test-harmonization-planner.js
git status --short
git diff --cached --name-only

Pour chaque commande, conserve réellement :

- la commande ;
- stdout brut ;
- stderr brut ;
- code de sortie exact.

Ne remplace pas les sorties par un résumé rédigé manuellement.

Si une validation échoue, corrige uniquement le fichier autorisé et relance
toute la chaîne depuis le début.

4. COMMIT

Si tout passe :

git add -- src/melody/test-harmonization-planner.js
git diff --cached --check
git diff --cached --name-only
git diff --cached --stat
git status --short

Vérifie que seul le fichier autorisé est staged, puis crée un nouveau commit :

git commit -m "test: traverse functions in harmonization input graph"

Aucun amend et aucun push.

Après le commit :

git diff-tree --no-commit-id --name-status -r HEAD
git rev-parse HEAD
git log -1 --oneline
git status --short
git diff --cached --name-only
git diff --name-only -- src/melody/test-harmonization-planner.js
git diff --cached --name-only -- src/melody/test-harmonization-planner.js

5. AUDIT AUTOPORTANT

Crée :

/home/visiteur/increment-8-absolute-final-audit.txt

Le fichier doit contenir :

- toutes les sorties Git initiales brutes ;
- le diff exact ;
- pour chacune des treize validations, la commande, stdout, stderr et code de
  sortie bruts ;
- les sorties brutes du build ;
- les contrôles Git avant et après le commit ;
- le hash et le message du commit ;
- git show --no-color HEAD -- src/melody/test-harmonization-planner.js.

N’écris :

INCRÉMENT 8 TERMINÉ

que si toutes les validations réussissent, si toutes les sorties brutes sont
présentes et si le fichier autorisé est propre après le commit.

Sinon :

INCRÉMENT 8 À CORRIGER

Ne commence pas l’Incrément 9. 

---

## Assistant (Build · deepseek-v4-pro · 5.3s)

_Thinking:_

Let me start by verifying the current state of the repository.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git rev-parse HEAD",
  "description": "Verify HEAD commit"
}
```

**Output:**
```
b6085b4baa16afb15af3bf89bece19ecc65bf632

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short",
  "description": "Check working tree status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? .opencode/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --name-status",
  "description": "Check unstaged changes"
}
```

**Output:**
```
M	.clinerules/rules-projet.md
M	CHANGES.md
M	electron/__pycache__/audio-processor.cpython-313.pyc
M	electron/audio-processor.py
M	package-lock.json
M	package.json
M	src/index.html
M	src/main.js
M	src/recorder/serializer.js
M	src/style.css
M	src/ui/display.js
M	vite.config.js

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-status",
  "description": "Check staged changes"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff -- src/melody/test-harmonization-planner.js",
  "description": "Check unstaged diff for target file"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached -- src/melody/test-harmonization-planner.js",
  "description": "Check staged diff for target file"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 4.0s)

_Thinking:_

The HEAD matches `b6085b4baa16afb15af3bf89bece19ecc65bf632`. The target file is clean (no staged or unstaged changes). I can proceed.

Now I need to:
1. Add a `isGraphNode` helper
2. Update `captureGraph()` to use it (treat functions as nodes too)
3. Update `assertGraphUnchanged()` to use it
4. Add a synthetic proof in T11 for function properties

Let me read the current state of the file to makeprecise edits.

Le HEAD correspond. Le fichier cible est propre. Je procède.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "limit": 120,
  "offset": 71
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
71: /**
72:  * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
73:  * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
74:  * ses clés propres et le descripteur complet de chaque propriété propre
75:  * (type, value, writable, enumerable, configurable pour les données ;
76:  *  type, get, set, enumerable, configurable pour les accesseurs).
77:  * Un WeakSet évite les boucles et les parcours redondants sur les références
78:  * partagées. Les snapshots de propriétés utilisent un Map pour conserver
79:  * les symboles comme clés réelles. Aucun getter n'est déclenché.
80:  *
81:  * @param {object} root
82:  * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}
83:  */
84: function captureGraph(root) {
85:   const seen = new WeakSet();
86:   const snapshots = new WeakMap();
87:   function visit(obj, path) {
88:     if (obj === null || typeof obj !== 'object') return;
89:     if (seen.has(obj)) return;
90:     seen.add(obj);
91:     const ownKeys = Reflect.ownKeys(obj);
92:     const props = new Map();
93:     for (const k of ownKeys) {
94:       const desc = Object.getOwnPropertyDescriptor(obj, k);
95:       if (desc && 'value' in desc) {
96:         props.set(k, {
97:           type: 'data',
98:           value: desc.value,
99:           writable: desc.writable,
100:           enumerable: desc.enumerable,
101:           configurable: desc.configurable,
102:         });
103:         if (desc.value !== null && typeof desc.value === 'object') {
104:           visit(desc.value, `${path}.${String(k)}`);
105:         }
106:       } else {
107:         props.set(k, {
108:           type: 'accessor',
109:           get: desc ? desc.get : undefined,
110:           set: desc ? desc.set : undefined,
111:           enumerable: desc ? desc.enumerable : undefined,
112:           configurable: desc ? desc.configurable : undefined,
113:         });
114:       }
115:     }
116:     snapshots.set(obj, {
117:       ref: obj,
118:       path,
119:       frozen: Object.isFrozen(obj),
120:       keys: ownKeys,
121:       props,
122:     });
123:   }
124:   visit(root, 'input');
125:   return { snapshots, seen };
126: }
127: 
128: /**
129:  * Vérifie que le graphe accessible depuis root est inchangé par rapport au
130:  * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à
131:  * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références
132:  * pour les valeurs objet, même état de gel, et descripteurs complets identiques
133:  * (writable, enumerable, configurable pour les données ; get, set, enumerable,
134:  * configurable pour les accesseurs). Vérifie aussi la référence exacte de la
135:  * racine.
136:  *
137:  * @param {object} root
138:  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
139:  * @param {string} rootPath
140:  */
141: function assertGraphUnchanged(root, captured, rootPath = 'input') {
142:   const rootSnap = captured.snapshots.get(root);
143:   if (!rootSnap) {
144:     throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);
145:   }
146:   if (root !== rootSnap.ref) {
147:     throw new Error(`${rootPath} référence de la racine modifiée`);
148:   }
149:   const visited = new WeakSet();
150:   function visit(obj, expectedObj, path) {
151:     if (obj === null || typeof obj !== 'object') {
152:       if (obj !== expectedObj) {
153:         throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
154:       }
155:       return;
156:     }
157:     const snap = captured.snapshots.get(obj);
158:     if (!snap) {
159:       throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
160:     }
161:     if (visited.has(obj)) return;
162:     visited.add(obj);
163: 
164:     if (Object.isFrozen(obj) !== snap.frozen) {
165:       throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);
166:     }
167:     const ownKeys = Reflect.ownKeys(obj);
168:     if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {
169:       throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);
170:     }
171:     for (const k of ownKeys) {
172:       const desc = Object.getOwnPropertyDescriptor(obj, k);
173:       const snapProp = snap.props.get(k);
174:       if (!snapProp) {
175:         throw new Error(`${path}.${String(k)} propriété absente du snapshot`);
176:       }
177:       if (snapProp.type === 'accessor') {
178:         if (!desc || 'value' in desc) {
179:           throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);
180:         }
181:         if (desc.get !== snapProp.get) {
182:           throw new Error(`${path}.${String(k)} getter modifié`);
183:         }
184:         if (desc.set !== snapProp.set) {
185:           throw new Error(`${path}.${String(k)} setter modifié`);
186:         }
187:         if (desc.enumerable !== snapProp.enumerable) {
188:           throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
189:         }
190:         if (desc.configurable !== snapProp.configurable) {

(Showing lines 71-190 of 1235. Use offset=191 to continue.)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 3.2s)

_Thinking:_

Let me read the rest of `assertGraphUnchanged` and the T11 section to understand the full picture before making changes.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "limit": 50,
  "offset": 190
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
190:         if (desc.configurable !== snapProp.configurable) {
191:           throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
192:         }
193:         continue;
194:       }
195:       const actualV = desc ? desc.value : undefined;
196:       const expectedV = snapProp.value;
197:       if (actualV !== expectedV) {
198:         throw new Error(`${path}.${String(k)} valeur/référence modifiée`);
199:       }
200:       if (desc && desc.writable !== snapProp.writable) {
201:         throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);
202:       }
203:       if (desc && desc.enumerable !== snapProp.enumerable) {
204:         throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);
205:       }
206:       if (desc && desc.configurable !== snapProp.configurable) {
207:         throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
208:       }
209:       if (actualV !== null && typeof actualV === 'object') {
210:         visit(actualV, expectedV, `${path}.${String(k)}`);
211:       }
212:     }
213:   }
214:   visit(root, null, rootPath);
215: }
216: 
217: /**
218:  * Vérifie récursivement qu'aucun nombre NaN, Infinity ou -Infinity n'est
219:  * présent dans une valeur. Protégé par WeakSet pour éviter les références
220:  * circulaires.
221:  *
222:  * @param {unknown} value
223:  * @param {string} path
224:  * @param {WeakSet<object>} seen
225:  */
226: function assertAllNumbersFinite(value, path = 'value', seen = new WeakSet()) {
227:   if (value === null || typeof value !== 'object') {
228:     if (typeof value === 'number') {
229:       assertTrue(Number.isFinite(value), `${path} doit être un nombre fini, obtenu ${value}`);
230:     }
231:     return;
232:   }
233:   if (seen.has(value)) return;
234:   seen.add(value);
235:   if (Array.isArray(value)) {
236:     for (let i = 0; i < value.length; i++) {
237:       assertAllNumbersFinite(value[i], `${path}[${i}]`, seen);
238:     }
239:   }

(Showing lines 190-239 of 1235. Use offset=240 to continue.)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 13.0s)

_Thinking:_

Now I need to:

1. Add a `isGraphNode` helper function
2. Update `captureGraph()` to use `isGraphNode` instead of `typeof value === 'object'` for the recursive visit condition
3. Update `assertGraphUnchanged()` to use `isGraphNode` instead of `typeof obj !== 'object'` for the guard condition, and also for the recursive visit condition
4. Add a synthetic proof in T11 that functions are traversed

Let me identify all the places that need changing:

In `captureGraph()`:
- Line 88: `if (obj === null || typeof obj !== 'object') return;` → should use `isGraphNode`
- Line 103: `if (desc.value !== null && typeof desc.value === 'object')` → should use `isGraphNode`

In `assertGraphUnchanged()`:
- Line 151: `if (obj === null || typeof obj !== 'object')` → should use `isGraphNode`
- Line 209: `if (actualV !== null && typeof actualV === 'object')` → should use `isGraphNode`

Let me make thesechanges.

Now I'll add the `isGraphNode` helper and update both functions, then add the synthetic proof in T11.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "oldString": "/**\n * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.\n * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,\n * ses clés propres et le descripteur complet de chaque propriété propre\n * (type, value, writable, enumerable, configurable pour les données ;\n *  type, get, set, enumerable, configurable pour les accesseurs).\n * Un WeakSet évite les boucles et les parcours redondants sur les références\n * partagées. Les snapshots de propriétés utilisent un Map pour conserver\n * les symboles comme clés réelles. Aucun getter n'est déclenché.\n *\n * @param {object} root\n * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}\n */\nfunction captureGraph(root) {\n  const seen = new WeakSet();\n  const snapshots = new WeakMap();\n  function visit(obj, path) {\n    if (obj === null || typeof obj !== 'object') return;\n    if (seen.has(obj)) return;\n    seen.add(obj);\n    const ownKeys = Reflect.ownKeys(obj);\n    const props = new Map();\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      if (desc && 'value' in desc) {\n        props.set(k, {\n          type: 'data',\n          value: desc.value,\n          writable: desc.writable,\n          enumerable: desc.enumerable,\n          configurable: desc.configurable,\n        });\n        if (desc.value !== null && typeof desc.value === 'object') {\n          visit(desc.value, `${path}.${String(k)}`);\n        }\n      } else {\n        props.set(k, {\n          type: 'accessor',\n          get: desc ? desc.get : undefined,\n          set: desc ? desc.set : undefined,\n          enumerable: desc ? desc.enumerable : undefined,\n          configurable: desc ? desc.configurable : undefined,\n        });\n      }\n    }\n    snapshots.set(obj, {\n      ref: obj,\n      path,\n      frozen: Object.isFrozen(obj),\n      keys: ownKeys,\n      props,\n    });\n  }\n  visit(root, 'input');\n  return { snapshots, seen };\n}",
  "newString": "/**\n * Détermine si une valeur est un nœud du graphe (objet ou fonction non nul).\n * Les fonctions sont traitées comme des nœuds à part entière : elles possèdent\n * des clés propres, des descripteurs, un état de gel et peuvent contenir des\n * sous-objets ou sous-fonctions.\n *\n * @param {unknown} value\n * @returns {boolean}\n */\nfunction isGraphNode(value) {\n  return value !== null\n    && (typeof value === 'object' || typeof value === 'function');\n}\n\n/**\n * Capture, sans mutation, tout le graphe d'objets et de fonctions accessible\n * depuis une racine. Pour chaque nœud accessible, mémorise sa référence, son\n * état de gel, ses clés propres et le descripteur complet de chaque propriété\n * propre (type, value, writable, enumerable, configurable pour les données ;\n * type, get, set, enumerable, configurable pour les accesseurs).\n * Un WeakSet évite les boucles et les parcours redondants sur les références\n * partagées. Les snapshots de propriétés utilisent un Map pour conserver\n * les symboles comme clés réelles. Aucun getter n'est déclenché.\n *\n * @param {object} root\n * @returns {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }}\n */\nfunction captureGraph(root) {\n  const seen = new WeakSet();\n  const snapshots = new WeakMap();\n  function visit(obj, path) {\n    if (!isGraphNode(obj)) return;\n    if (seen.has(obj)) return;\n    seen.add(obj);\n    const ownKeys = Reflect.ownKeys(obj);\n    const props = new Map();\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      if (desc && 'value' in desc) {\n        props.set(k, {\n          type: 'data',\n          value: desc.value,\n          writable: desc.writable,\n          enumerable: desc.enumerable,\n          configurable: desc.configurable,\n        });\n        if (isGraphNode(desc.value)) {\n          visit(desc.value, `${path}.${String(k)}`);\n        }\n      } else {\n        props.set(k, {\n          type: 'accessor',\n          get: desc ? desc.get : undefined,\n          set: desc ? desc.set : undefined,\n          enumerable: desc ? desc.enumerable : undefined,\n          configurable: desc ? desc.configurable : undefined,\n        });\n      }\n    }\n    snapshots.set(obj, {\n      ref: obj,\n      path,\n      frozen: Object.isFrozen(obj),\n      keys: ownKeys,\n      props,\n    });\n  }\n  visit(root, 'input');\n  return { snapshots, seen };\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 15.1s)

_Thinking:_

Now I need to update `assertGraphUnchanged` to also use `isGraphNode` instead of `typeof obj !== 'object'`. Let me also update the recursive descent for datavalues.

Now update `assertGraphUnchanged` to use `isGraphNode`:

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "newString": "/**\n * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n * snapshot capturé. Pour chaque nœud capturé (objet ou fonction), contrôle :\n * même référence à chaque emplacement, mêmes clés, mêmes valeurs primitives,\n * mêmes références pour les valeurs objet/fonction, même état de gel, et\n * descripteurs complets identiques (writable, enumerable, configurable pour\n * les données ; get, set, enumerable, configurable pour les accesseurs).\n * Vérifie aussi la référence exacte de la racine.\n *\n * @param {object} root\n * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n * @param {string} rootPath\n */\nfunction assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const rootSnap = captured.snapshots.get(root);\n  if (!rootSnap) {\n    throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);\n  }\n  if (root !== rootSnap.ref) {\n    throw new Error(`${rootPath} référence de la racine modifiée`);\n  }\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {\n    if (!isGraphNode(obj)) {\n      if (obj !== expectedObj) {\n        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);\n      }\n      return;\n    }\n    const snap = captured.snapshots.get(obj);\n    if (!snap) {\n      throw new Error(`${path} objet/fonction non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n    }\n    if (visited.has(obj)) return;\n    visited.add(obj);\n\n    if (Object.isFrozen(obj) !== snap.frozen) {\n      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);\n    }\n    const ownKeys = Reflect.ownKeys(obj);\n    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {\n      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);\n    }\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      const snapProp = snap.props.get(k);\n      if (!snapProp) {\n        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);\n      }\n      if (snapProp.type === 'accessor') {\n        if (!desc || 'value' in desc) {\n          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);\n        }\n        if (desc.get !== snapProp.get) {\n          throw new Error(`${path}.${String(k)} getter modifié`);\n        }\n        if (desc.set !== snapProp.set) {\n          throw new Error(`${path}.${String(k)} setter modifié`);\n        }\n        if (desc.enumerable !== snapProp.enumerable) {\n          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n        }\n        if (desc.configurable !== snapProp.configurable) {\n          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n        }\n        continue;\n      }\n      const actualV = desc ? desc.value : undefined;\n      const expectedV = snapProp.value;\n      if (actualV !== expectedV) {\n        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);\n      }\n      if (desc && desc.writable !== snapProp.writable) {\n        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);\n      }\n      if (desc && desc.enumerable !== snapProp.enumerable) {\n        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n      }\n      if (desc && desc.configurable !== snapProp.configurable) {\n        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n      }\n      if (isGraphNode(actualV)) {\n        visit(actualV, expectedV, `${path}.${String(k)}`);\n      }\n    }\n  }\n  visit(root, null, rootPath);\n}",
  "oldString": "/**\n * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à\n * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références\n * pour les valeurs objet, même état de gel, et descripteurs complets identiques\n * (writable, enumerable, configurable pour les données ; get, set, enumerable,\n * configurable pour les accesseurs). Vérifie aussi la référence exacte de la\n * racine.\n *\n * @param {object} root\n * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n * @param {string} rootPath\n */\nfunction assertGraphUnchanged(root, captured, rootPath = 'input') {\n  const rootSnap = captured.snapshots.get(root);\n  if (!rootSnap) {\n    throw new Error(`${rootPath} racine absente du snapshot (référence remplacée)`);\n  }\n  if (root !== rootSnap.ref) {\n    throw new Error(`${rootPath} référence de la racine modifiée`);\n  }\n  const visited = new WeakSet();\n  function visit(obj, expectedObj, path) {\n    if (obj === null || typeof obj !== 'object') {\n      if (obj !== expectedObj) {\n        throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);\n      }\n      return;\n    }\n    const snap = captured.snapshots.get(obj);\n    if (!snap) {\n      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n    }\n    if (visited.has(obj)) return;\n    visited.add(obj);\n\n    if (Object.isFrozen(obj) !== snap.frozen) {\n      throw new Error(`${path} état de gel modifié : ${snap.frozen} -> ${Object.isFrozen(obj)}`);\n    }\n    const ownKeys = Reflect.ownKeys(obj);\n    if (ownKeys.length !== snap.keys.length || !ownKeys.every((k, i) => k === snap.keys[i])) {\n      throw new Error(`${path} clés propres modifiées : [${snap.keys.join(', ')}] -> [${ownKeys.join(', ')}]`);\n    }\n    for (const k of ownKeys) {\n      const desc = Object.getOwnPropertyDescriptor(obj, k);\n      const snapProp = snap.props.get(k);\n      if (!snapProp) {\n        throw new Error(`${path}.${String(k)} propriété absente du snapshot`);\n      }\n      if (snapProp.type === 'accessor') {\n        if (!desc || 'value' in desc) {\n          throw new Error(`${path}.${String(k)} accesseur transformé en propriété de données`);\n        }\n        if (desc.get !== snapProp.get) {\n          throw new Error(`${path}.${String(k)} getter modifié`);\n        }\n        if (desc.set !== snapProp.set) {\n          throw new Error(`${path}.${String(k)} setter modifié`);\n        }\n        if (desc.enumerable !== snapProp.enumerable) {\n          throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n        }\n        if (desc.configurable !== snapProp.configurable) {\n          throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n        }\n        continue;\n      }\n      const actualV = desc ? desc.value : undefined;\n      const expectedV = snapProp.value;\n      if (actualV !== expectedV) {\n        throw new Error(`${path}.${String(k)} valeur/référence modifiée`);\n      }\n      if (desc && desc.writable !== snapProp.writable) {\n        throw new Error(`${path}.${String(k)} writable modifié : ${snapProp.writable} -> ${desc.writable}`);\n      }\n      if (desc && desc.enumerable !== snapProp.enumerable) {\n        throw new Error(`${path}.${String(k)} enumerable modifié : ${snapProp.enumerable} -> ${desc.enumerable}`);\n      }\n      if (desc && desc.configurable !== snapProp.configurable) {\n        throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n      }\n      if (actualV !== null && typeof actualV === 'object') {\n        visit(actualV, expectedV, `${path}.${String(k)}`);\n      }\n    }\n  }\n  visit(root, null, rootPath);\n}"
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 3.1s)

_Thinking:_

Now I need to add the synthetic proof in T11 for functions. Let me find the right location in T11 to add it after the existing syntheticchecks.

Now I need to add the synthetic proof for functions in T11. Let me find the exact location:

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "limit": 30,
  "offset": 830
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js</path>
<type>file</type>
<content>
830:     let getterCalled = false;
831:     Object.defineProperty(obj, 'computed', {
832:       get() { getterCalled = true; return 99; },
833:       enumerable: true,
834:       configurable: true,
835:     });
836:     const cap = captureGraph(obj);
837:     assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant captureGraph');
838:     assertGraphUnchanged(obj, cap, 'synth');
839:     assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');
840:   })();
841: 
842:   // Wrapper : référence et état de gel inchangés.
843:   assertTrue(input === inputRef, 'wrapper même référence');
844:   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');
845: 
846:   // track et harmonicContext : références et état de gel inchangés.
847:   assertTrue(track === trackRef, 'track même référence');
848:   assertTrue(ctx === ctxRef, 'harmonicContext même référence');
849:   assertEqual(Object.isFrozen(track), trackFrozenBefore, 'track état de gel inchangé');
850:   assertEqual(Object.isFrozen(ctx), ctxFrozenBefore, 'ctx état de gel inchangé');
851: 
852:   // anchors : référence, état de gel, contenu, ordre.
853:   assertTrue(ctx.anchors === anchorsRef, 'anchors même référence');
854:   assertEqual(Object.isFrozen(ctx.anchors), anchorsFrozenBefore, 'anchors état de gel inchangé');
855:   assertEqual(JSON.stringify(ctx.anchors), anchorsJson, 'anchors JSON inchangé');
856:   for (let i = 0; i < anchorsRef.length; i++) {
857:     assertTrue(ctx.anchors[i] === anchorsRef[i], `anchor[${i}] même référence`);
858:     assertEqual(Object.isFrozen(ctx.anchors[i]), anchorsFrozenEachBefore[i], `anchor[${i}] gel inchangé`);
859:   }

(Showing lines 830-859 of 1249. Use offset=860 to continue.)
</content>
```

---

## Assistant (Build · deepseek-v4-pro · 5.0s)

_Thinking:_

I need to add the synthetic proof for functions after synth5. Let me insert it between the synth5 block and the "Wrapper" comment.

**Tool: edit**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/melody/test-harmonization-planner.js",
  "newString": "    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');\n  })();\n\n  // 6. Fonction comme valeur de propriété de données, avec propriété propre\n  //    imbriquée. La capture traverse la fonction, ses clés propres et ses\n  //    descripteurs. Une mutation d'une propriété de la fonction est détectée.\n  (() => {\n    function fn() { return 1; }\n    fn.customProp = { nested: 42 };\n    const obj = { myFn: fn };\n    const cap = captureGraph(obj);\n    fn.customProp.nested = 99;\n    let err = null;\n    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n    assertTrue(err !== null, 'synth6: mutation dans propriété imbriquée de fonction détectée');\n  })();\n\n  // Wrapper : référence et état de gel inchangés.",
  "oldString": "    assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');\n  })();\n\n  // Wrapper : référence et état de gel inchangés."
}
```

**Output:**
```
Edit applied successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 14.3s)

_Thinking:_

Let me verify the changes are correct by reading the relevant sections of the file.

Now let me run all validations:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-harmonization-planner.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run harmonization planner tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T1 — export unique et clés exactes de HarmonizationPlan / HarmonizationStep
  ✓ T2 — pipeline réel : 3 couches, 3 candidats, 3 voicings, 2 transitions
  ✓ T3 — alignement exact des références (pas de comparaison JSON)
  ✓ T4 — transitions entrantes nulles au step 0, puis transitions[i-1]
  ✓ T5 — candidat de départ verrouillé respecté, couches suivantes libres
  ✓ T6 — une seule ancre : mono-couche, transitions nulles, totaux exacts
  ✓ T7 — équivalence stricte avec la composition manuelle des API publiques
  ✓ T8 — ordre exact des ancres conservé, ancres distinctes, pas de tri
  ✓ T9 — couches distinctes, figées, ordre du générateur, pas de clone de candidat
  ✓ T10 — déterminisme : même JSON, ids, notes MIDI, scores, ordre
  ✓ T11 — immutabilité complète : graphe des entrées inchangé, nouveaux conteneurs figés
  ✓ T12 — wrapper invalide : TypeError pour chaque cas
  ✓ T13 — ancres invalides : TypeError (délégué aux contrats publics)
  ✓ T14 — contexte canonique sans ancre -> RangeError
  ✓ T15 — progression avec cardinalités de pitch classes différentes garanties
  ✓ T16 — aucun champ interdit dans les nouveaux conteneurs
  ✓ T17 — chemin long : fini, longueurs cohérentes, ordre stable, déterminisme
  ✓ T18 — appel au planificateur ne modifie pas les résultats amont directs

=== Résultat : 18/18 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-voicing-path-finder.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run voicing path finder tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T1 — exports exacts (3) et settings figés/identiques au littéral
  ✓ T2 — génération d un accord réel
  ✓ T3 — basse dans l accord et basse externe, toujours la plus grave
  ✓ T4 — basse omise et null valides, plusieurs renverseents, pas de NaN
  ✓ T5 — bornes inclusives 36/84 atteintes, plages des mains, spans, registerDeviation
  ✓ T6 — transition immobile (mêmes notes)
  ✓ T7 — mouvement simple vérifié manuellement
  ✓ T8 — cardinalités égales : appariement direct par indice (36→72)
  ✓ T8b — cardinalités différentes : [60,64,67]→[60,64]
  ✓ T8c — égalités [50]↔[48,52] : match/insert puis match/delete
  ✓ T9 — quintes et octaves parallèles, direction, pas d unisson
  ✓ T10 — greedy vs DP : DP strictement meilleur (C→G7→Fmaj7)
  ✓ T11 — oracle exhaustif indépendant (petites couches)
  ✓ T12 — une couche : registre centré puis départage MIDI, totaux nuls
  ✓ T13 — [c,c,c] voicing répété, midiNotes identiques, déterminisme
  ✓ T14 — départages registre/MIDI, témoins métriques exacts, non-atteignabilité octaves
  ✓ T15 — immutabilité complète : résultats figés, entrées non figées et intactes
  ✓ T16 — TypeError sur entrées invalides (options / chemins creux)
  ✓ T17 — RangeError s il n y a aucun voicing admissible
  ✓ T18 — génération réelle, HarmonicPath, puis voicings
  ✓ T19 — chemin long, fini, déterministe, borné
  ✓ T20 — aucun champ audio/UI/pédale/doigté, chemin candidat intact

=== Résultat : 22/22 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-harmonic-path-finder.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run harmonic path finder tests",
  "timeout": 30000
}
```

**Output:**
```
  ✓ T01 — export présent et champs exacts
  ✓ T02 — longueurs, références et bornes
  ✓ T03 — cohérence from/to des transitions
  ✓ T2 — une couche : meilleure compatibilité, transitions vides
  ✓ T2b — une couche : tie-break déterministe sur égalité
  ✓ T2c — chaque catégorie V1 retourne exactement son score prévu
  ✓ T3 — le couple optimal est sélectionné avec la formule exacte
  ✓ T4 — l optimum global bat le greedy couche par couche
  ✓ T5a — oracle exhaustif (3 couches 2×2×2)
  ✓ T5b — oracle exhaustif (4 couches 3×2×4×2)
  ✓ T6 — formula exactes vérifiées séparément
  ✓ T7a — départage par compatibilité sur égalité pondérée
  ✓ T7b — départage par identifiant lexical
  ✓ T7c — clones à identifiant identique départagés par indice
  ✓ T7d — appels répétés strictement déterministes
  ✓ T8 — le bonus V→I influence le chemin, pas l ordre inverse
  ✓ T9 — même candidat référencé ou cloné entre couches
  ✓ T10 — basses absentes sans NaN
  ✓ T11 — couches 4, 2, 5, 3 avec pitch classes variées
  ✓ T12 — candidat verrouillé retenu (contrat réel Inc4)
  ✓ T13 — entrées non mutées, résultat et conteneurs figés
  ✓ T14 — TypeError sur entrées invalides
  ✓ T14b — clés héritées dangereuses : toutes lèvent TypeError
  ✓ T14c — argument absent, non-objet, creux externes et internes
  ✓ T14d — category lue au plus une fois par candidat
  ✓ T14e — départage lexical sur plusieurs couches, priorité à la première différence
  ✓ T14f — identifiants identiques, départagés par toute la suite d indices
  ✓ T14g — trois couches parfaites identiques : totalScore exactement 100
  ✓ T14h — départage par indices quand les unités sont égales
  ✓ T15 — matrice large : fini, borné, déterministe
  ✓ T16 — de vrais candidats générés passent au path finder
  ✓ T17 — aucun champ voicing/octave/doigté/audio/UI/segment
  ✓ T18 — sanity de l écosystème et export unique

=== Résultat : 33/33 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-transition-score.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run transition score tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 5 — Scoring de transition entre ChordCandidate ===

  ✓ T01 — Deux appels identiques produisent exactement le même JSON
  ✓ T02 — Candidats profonds inchangés après l'appel
  ✓ T02b — Résultat et structures imbriquées figés
  ✓ T03 — Même identité sonore, orthographes différentes → mêmes scores
  ✓ T04 — Mouvement de fondamentale contrôlé : plus de notes communes → commonScore ≥
  ✓ T05 — Paire proche obtient un motionScore supérieur
  ✓ T06 — from === to valide, borné, totalScore = 100
  ✓ T06b — Deux clones séparés du même candidat
  ✓ T07 — 4 vs 5 pitch classes, symétrie des composantes
  ✓ T08 — Deux basses absentes → bassScore null, bass inactif
  ✓ T08b — Une seule basse présente → bassScore null
  ✓ T08c — Deux basses présentes → composante bass active
  ✓ T08d — Deux propriétés bassPitchClass omises → valide, bass inactif
  ✓ T08e — Une seule propriété omise → bassScore null, bass inactif
  ✓ T08f — Ordre inverse : basse omise côté from, présente côté to
  ✓ T09 — V→I active resolutionScore = 100
  ✓ T09b — I→V ne bénéficie d'aucune résolution
  ✓ T09c — Le bonus V→I rend le total différent de I→V
  ✓ T10 — Matrice large : tous les nombres sont finis
  ✓ T11 — TypeError sur entrées invalides
  ✓ T11b — from === to ne renvoie jamais d'erreur
  ✓ T12 — Aucun champ de chemin dans le résultat
  ✓ T12b — Aucune fonction de sélection exportée
  ✓ T13 — De vrais candidats générés passent au scoreur
  ✓ T14 — Sanity des imports sans régression

=== Résultat : 25/25 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-chord-candidates.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run chord candidates tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 4 — Génération des candidats d'accords ===

  ✓ S01 — CHORD_DEFINITIONS reste le référentiel unique
  ✓ S02 — Aucune table indépendante de qualités dans src/melody
  ✓ S03 — Anciennes définitions d'accords restent compatibles
  ✓ S04 — Métadonnées d'identité accessibles depuis la définition canonique
  ✓ I05 — maj7 conserve 3 et 7
  ✓ I06 — m7 conserve b3 et b7
  ✓ I07 — 7 conserve 3 et b7
  ✓ I08 — m7b5 conserve b3, b5 et b7
  ✓ I09 — dim7 conserve sa structure identitaire
  ✓ I10 — 7sus4 ne requiert pas une tierce majeure
  ✓ I11 — Omission de quinte autorisée lorsqu'elle est déclarée
  ✓ I12 — Omission identitaire interdite
  ✓ M13 — Mélodie comme chord-tone
  ✓ M14 — Mélodie comme available-tension
  ✓ M15 — Mélodie comme suspension
  ✓ M16 — Note de passage tolérée
  ✓ M17 — Note incompatible rejetée
  ✓ M18 — preserveExactPitch enregistré comme contrainte future
  ✓ M19 — melody-must-be-top enregistré comme contrainte future
  ✓ M20 — allow-notes-above n'élimine pas une mélodie intérieure
  ✓ M21 — harmonizationPolicy skip retourne skipped
  ✓ M22 — harmonizationPolicy force sans candidat retourne no-valid-candidate
  ✓ M23 — automatic conserve plusieurs catégories compatibles
  ✓ A24 — Ancre liée à MelodyEvent
  ✓ A25 — Ancre sans MelodyEvent
  ✓ A26 — Ancre invalide
  ✓ A27 — Accord initial verrouillé
  ✓ A28 — Accord final verrouillé
  ✓ A29 — Accord verrouillé incompatible signalé
  ✓ A30 — Accord original non verrouillé inclus comme candidat
  ✓ F31 — Candidats diatoniques en tonalité majeure
  ✓ F32 — Candidats diatoniques en tonalité mineure
  ✓ F33 — Substitution diatonique documentée
  ✓ F34 — Dominante secondaire avec cible
  ✓ F35 — Dominante secondaire sans cible non générée
  ✓ F36 — Diminué d'approche valide
  ✓ F37 — Symétrie dim7 sans quadruplon inutile
  ✓ F38 — Emprunt modal limité
  ✓ F39 — Candidat chromatique non justifié rejeté
  ✓ E40 — D♭ majeur produit une orthographe en bémols
  ✓ E41 — C# majeur conserve E# et B# lorsque nécessaire
  ✓ E42 — Accord manuel explicite conserve son symbole
  ✓ E43 — Même hauteur, orthographes fonctionnelles distinctes
  ✓ E44 — Respelling ne modifie pas les pitch classes
  ✓ D45 — Doublon réel supprimé
  ✓ D46 — Fonctions distinctes conservées
  ✓ D47 — Basses différentes conservées
  ✓ D48 — Plafond configurable respecté
  ✓ D49 — Aucun minimum artificiel de candidats
  ✓ D50 — Ordre déterministe
  ✓ V51 — CandidateValidationReport JSON-safe
  ✓ V52 — AnchorCandidateGenerationResult JSON-safe
  ✓ V53 — Entrées non mutées
  ✓ V54 — Identifiants stables
  ✓ V55 — Même entrée produit exactement la même sortie
  ✓ V56 — Candidat inconnu rejeté proprement
  ✓ V57 — Aucune logique de transition exécutée
  ✓ V58 — Aucun voicing généré
  ✓ V59 — Aucun appel réseau ou IA
  ✓ R60 — Fm7 verrouillé au départ
  ✓ R61 — B♭m7 verrouillé à l'arrivée
  ✓ R62 — Chaque note mélodique conserve sa contrainte
  ✓ R63 — Plusieurs candidats valides peuvent exister par ancre
  ✓ R64 — La progression complète n'est pas imposée
  ✓ NR65 — Tests des Incréments 0 à 3 toujours verts (sanity locale)
  ✓ NR66 — Tests du moteur d'accords toujours verts (sanity locale)
  ✓ NR67 — Résultat historique du détecteur tonal inchangé
  ✓ NR68 — Build réussi non testable ici, mais modules syntaxiquement valides
  ✓ H69 — preserveExactPitch ne se réduit pas à la pitch class
  ✓ H70 — non-chord-tone-allowed produit un avertissement explicite
  ✓ H71 — suspension produit un avertissement explicite
  ✓ H72 — intervalle identitaire prime sur available-tension
  ✓ H73 — accord initial verrouillé incompatible expose une violation exploitable
  ✓ H74 — plafond bas ne supprime pas le candidat verrouillé
  ✓ H75 — troncature signalée avec le code CANDIDATES_TRUNCATED
  ✓ H76 — aucun score musical caché dans les candidats
  ✓ H77 — emprunts modaux strictement limités au vocabulaire documenté

=== Résultat : 77/77 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-spelled-pitch.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run spelled pitch tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 3 — Orthographe enharmonique et contrats stabilisés ===

  ✓ A01 — C# et Db ont la même pitchClass
  ✓ A02 — C# et Db n'ont pas la même orthographe
  ✓ A03 — pitchClassFromSpelling valide letter + accidental
  ✓ A04 — Rejet d'une orthographe incohérente
  ✓ A05 — Double bémol accepté
  ✓ A06 — Double dièse accepté
  ✓ A07 — Aucune triple altération générée automatiquement
  ✓ B08 — Do majeur correctement orthographié
  ✓ B09 — Fa majeur avec Si♭
  ✓ B10 — Ré♭ majeur
  ✓ B11 — Do dièse majeur avec Mi dièse et Si dièse
  ✓ B12 — Fa dièse majeur avec Mi dièse
  ✓ B13 — Sol bémol majeur avec Do bémol
  ✓ B13b — 7 lettres distinctes dans chaque gamme
  ✓ C14 — Tonalité détectée avec orthographe par défaut
  ✓ C15 — Sélection manuelle D♭ conservée
  ✓ C16 — Sélection manuelle C# conservée
  ✓ C17 — Scores automatiques inchangés après sélection orthographique
  ✓ C18 — Suppression de la correction manuelle restaure l'orthographe par défaut
  ✓ C19 — Ancien TonalContext sans SpelledKey reste accepté
  ✓ D20 — ChordReference C#m7
  ✓ D21 — ChordReference D♭m7
  ✓ D22 — C#m7 et D♭m7 partagent la même qualité canonique et symboles conservés
  ✓ D23 — Slash chord D♭/F conserve les orthographes respectives
  ✓ D24 — Accord explicite prioritaire sur respelling automatique
  ✓ D25 — Respelling contextuel seulement sur demande ou absence d'écriture explicite
  ✓ E26 — startChord verrouillable
  ✓ E27 — endChord verrouillable
  ✓ E28 — Version incrémentée lors du verrouillage
  ✓ F29 — Ancre facultative après la fin = warning
  ✓ F30 — Ancre force après la fin = error
  ✓ F31 — Ancre verrouillée après la fin = error
  ✓ F32 — Temps négatif = error
  ✓ G33 — Identifiants stables après respelling
  ✓ G34 — JSON-sérialisation
  ✓ G35 — Immutabilité
  ✓ H36 — Résultat historique du détecteur tonal inchangé
  ✓ H37 — Aucun second référentiel d'accords
  ✓ I38 — spellMidiNote conserve l'octave
  ✓ I39 — spellPitchClass fallback déterministe
  ✓ I40 — formatSpelledPitch affiche les altérations

=== Résultat : 41/41 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-tonal-harmonic.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run tonal harmonic tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 2 — Contexte tonal et harmonique ===

  ✓ T01 — estimation depuis une MelodyTrack simple (Do majeur)
  ✓ T02 — appel réel du chemin notes brutes
  ✓ T03 — aucun appel au chemin fondé sur les accords
  ✓ T04 — événements disabled ignorés
  ✓ T05 — événements incomplets ignorés et signalés
  ✓ T06 — plusieurs candidats conservés
  ✓ T07 — sélection d'un candidat
  ✓ T08 — tonalité manuelle séparée des candidats détectés
  ✓ T09 — correction utilisateur non écrasée
  ✓ T10 — retrait de confirmation
  ✓ T11 — contexte sans estimation suffisante (piste vide)
  ✓ T12 — création d'un HarmonicContext vide
  ✓ T13 — accord initial valide
  ✓ T14 — accord final valide
  ✓ T15 — symbole d'accord inconnu rejeté proprement
  ✓ T16 — ajout d'une ancre liée à MelodyEvent
  ✓ T17 — ancre avec MelodyEvent inexistant rejetée
  ✓ T18 — ancres triées sans mutation de l'entrée
  ✓ T19 — politiques force / automatic / skip
  ✓ T20 — progression originale manuelle
  ✓ T21 — ordre temporel invalide signalé
  ✓ T22 — comparaison mélodie/harmonie en accord
  ✓ T23 — comparaison mélodie/harmonie en conflit
  ✓ T24 — sorties JSON-sérialisables
  ✓ T25 — immutabilité des entrées
  ✓ T26 — version incrémentée après édition
  ✓ T27 — aucun doublon de source de vérité des accords
  ✓ T28 — computeKeyCandidatesFromRawNotes retourne 24 candidats
  ✓ T29 — mise à jour d'une ancre
  ✓ T30 — suppression d'une ancre
  ✓ T31 — validation complète d'un contexte valide
  ✓ T32 — setStartChord avec null retire l'accord
  ✓ T33 — setEndChord avec null retire l'accord
  ✓ T48 — startChord verrouillable
  ✓ T49 — endChord verrouillable
  ✓ T50 — tonalité manuelle C# majeur conservée
  ✓ T51 — tonalité manuelle Db majeur conservée
  ✓ T52 — setStartChord accepte une option locked
  ✓ T34 — rebuildTonalContext crée un nouvel ID
  ✓ T35 — setManualTonalContext avec objet
  ✓ T36 — comparaison relatifs (Do majeur / La mineur)
  ✓ T37 — comparaison parallèles (Do majeur / Do mineur)
  ✓ T38 — validation avec piste vide
  ✓ T39 — ancre avec temps négatif rejetée
  ✓ T40 — mélodie en La mineur produit une estimation
  ✓ T41 — cohérence entre computeKeyFromRawNotes et computeKeyCandidatesFromRawNotes
  ✓ T42 — résultat historique de computeKeyFromRawNotes inchangé
  ✓ T43 — mélodie ambiguë conserve Do majeur et La mineur
  ✓ T44 — très courte mélodie
  ✓ T45 — corrections manuelles répétées sans accumulation
  ✓ T46 — symétrie de compareTonalEstimates
  ✓ T47 — durée exploitée conformément au détecteur

=== Résultat : 52/52 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-melody-track.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run melody track tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 1 — Piste mélodique explicite ===

  ✓ T01 — conversion d'une note normale en MelodyEvent
  ✓ T02 — conservation exacte du MIDI et de l'octave
  ✓ T03 — conservation des temps et de la durée
  ✓ T04 — conservation de la vélocité
  ✓ T05 — valeurs par défaut des trois politiques
  ✓ T06 — plusieurs notes successives conservent l'ordre
  ✓ T07 — attaque simultanée conservée sans suppression
  ✓ T08 — chevauchement legato conservé et diagnostiqué
  ✓ T09 — événement désactivé reste présent
  ✓ T10 — modification de sopranoPolicy non destructive
  ✓ T11 — modification de harmonizationPolicy non destructive
  ✓ T12 — ajout et suppression d'un marqueur
  ✓ T13 — découpage temporel de la piste
  ✓ T14 — temps relatifs commençant à zéro
  ✓ T15 — construction des événements de lecture
  ✓ T16 — relecture préservant ordre, notes et durées
  ✓ T17 — fin synthétique conservée et signalée
  ✓ T18 — déconnexion signalée
  ✓ T19 — snapshot source non muté
  ✓ T20 — MelodyTrack JSON-sérialisable
  ✓ T21 — retours publics non mutables extérieurement
  ✓ T22 — version incrémentée après édition
  ✓ T23 — deux note-on de même note deviennent deux MelodyEvent
  ✓ T24 — validation refuse une piste vide
  ✓ T25 — piste vide gérée proprement
  ✓ T26 — modification de preserveExactPitch

=== Résultat : 26/26 tests passés ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/melody/test-midi-capture.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run midi capture tests",
  "timeout": 30000
}
```

**Output:**
```
=== Incrément 0 — Capture MIDI temporelle non destructive ===

  ✓ T01 — note-on / note-off normal conserve time, note, velocity et channel
  ✓ T02 — note-on vélocité 0 équivaut à note-off
  ✓ T03 — répétition de la même note avant relâchement crée deux note-on distincts
  ✓ T04 — accords simultanés conservent tous les événements
  ✓ T05 — sustain CC64 maintient les notes après note-off
  ✓ T06 — relâchement pendant sustain conserve la note jusqu'à fin de sustain
  ✓ T07 — fin de sustain libère uniquement les notes du canal concerné
  ✓ T08 — finalize génère des note-off pour notes actives sans note-off
  ✓ T09 — finalize nettoie aussi les notes sustained
  ✓ T10 — plusieurs canaux conservent leurs événements séparément
  ✓ T11 — horloge par défaut est monotone
  ✓ T12 — aucune note bloquée après finalize()
  ✓ Bonus — getTimeline est pure et n'altère pas l'état interne
  ✓ T13 — note-off orphelin est enregistré sans crasher
  ✓ T14 — finalize est idempotent
  ✓ T15 — getTimeline/getNotes/getEvents retournent des snapshots JSON-safe
  ✓ T16 — horloge invalide rejette les timestamps incohérents
  ✓ T17 — plusieurs sources conservent leurs notes séparément

=== Résultat : 18/18 tests passés ===
EXIT_CODE=0

```

---

## Assistant (Build · deepseek-v4-pro · 8.1s)

_Thinking:_

All 9 melody test suites pass. Now the remaining 4 validations.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && npm run test:chords 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run chord engine tests",
  "timeout": 30000
}
```

**Output:**
```

> piano-jazz-chords@0.1.0 test:chords
> node src/chord-engine/test-chords.js

✅ C9 → C9
✅ C13 → C13
✅ Cm7b5 → Cm7b5
✅ C7#9b13 → C7#9b13
✅ C13#11 → C13#11
✅ C/E (1ère inversion) → C/E
✅ Cmaj9 → Cmaj9
✅ Dm9 → Dm9
✅ G7sus4 → G7sus4
✅ F#m7b5 → F#m7b5
✅ C major (C-E-G) → C
✅ F major (F-A-C) → F
✅ C quartal (C-F-Bb) → Cquartal
✅ C quartal add4 (C-F-Bb-Eb) → Cquartal(add4)
✅ C13#11 with D major upper structure → C13#11
✅ D/C polychord → C/D
✅ C9sus4 → C9sus4
✅ C13sus4 → C13sus4
✅ Cmaj7sus2 → Cmaj7sus2
✅ Cmaj7sus4 → Cmaj7sus4
✅ Dmaj7sus2 → Dmaj7sus2
✅ C7sus4 regression → C7sus4
✅ C9sus4 regression → C9sus4
✅ Gadd11 regression → Gadd11
✅ Aadd11 regression → Aadd11
✅ Em7b9 cluster voicing → Em7b9
✅ Cmaj7 shell (C E B) → Cmaj7
✅ C7 shell (C E Bb) → C7
✅ Cm7 shell (C Eb Bb) → Cm7
✅ Cmaj7 full (C E G B) → Cmaj7
✅ C7 full (C E G Bb) → C7
✅ Cm7 full (C Eb G Bb) → Cm7
✅ C7 no5 — power chord not shell (E B) → E5
✅ Em — not Cmaj7 shell (E G B) → Em
✅ Eb5 — not Cm7 shell (Eb Bb) → D#5
✅ Cmaj7 shell with 9th — not recognised yet (C E B D) → E5/C
✅ C7 shell with 13th — not recognised yet (C E Bb A) → Am/C
✅ C9sus4 no5 — not recognised as shell (C F Bb D) → A#add9/C

Résultat : 98/98 tests réussis (38 directs + 60 transpositions)
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/analyzer/test-regression-part1.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run regression part1 tests",
  "timeout": 30000
}
```

**Output:**
```
✅ Bug 1.3 — Fmaj9 6 notes (F3,C4,E4,G4,A4,C5) avec jitter
✅ Bug 1.4 — Mélodie isolée C D E F G → Do majeur
✅ Sanity — Progression II-V-I non mélodique

=== Partie 1 regression tests done ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && node src/chord-engine/test-regression-part3.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run regression part3 tests",
  "timeout": 30000
}
```

**Output:**
```
✅ Partie 3.3 — Secondes rapprochées classées cluster
✅ Partie 3.3 — Triade Mi majeur sur basse Do → upper structure/slash
✅ Partie 3 — Pureté du classifieur

=== Partie 3 regression tests done ===
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && npm run build 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Run build",
  "timeout": 60000
}
```

**Output:**
```

> piano-jazz-chords@0.1.0 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 47 modules transformed.
rendering chunks...
computing gzip size...
../dist/index.html                                34.14 kB │ gzip:  7.16 kB
../dist/assets/soundtouch-processor-C1MAJdwL.js   72.87 kB
../dist/assets/main-BUD1_6Cx.css                 107.30 kB │ gzip: 19.29 kB
../dist/assets/main-BGsDLFac.js                  164.26 kB │ gzip: 48.65 kB
✓ built in 1.76s
EXIT_CODE=0

```

---

## Assistant (Build · deepseek-v4-pro · 4.6s)

_Thinking:_

All validations pass. Now let me do the git checks and commit.

Toutes les validations passent. Vérifications git et commit :

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --check -- src/melody/test-harmonization-planner.js 2>&1; echo \"EXIT_CODE=$?\"",
  "description": "Check whitespace in diff"
}
```

**Output:**
```
EXIT_CODE=0

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short 2>&1",
  "description": "Check status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/melody/test-harmonization-planner.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? .opencode/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only 2>&1",
  "description": "Check staged files"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 3.5s)

_Thinking:_

The file is modified (unstaged), no staged changes. Let me stage and commit.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git add -- src/melody/test-harmonization-planner.js && git diff --cached --check 2>&1 && echo \"---\" && git diff --cached --name-only 2>&1 && echo \"---\" && git diff --cached --stat 2>&1 && echo \"---\" && git status --short 2>&1",
  "description": "Stage and verify only target file"
}
```

**Output:**
```
---
src/melody/test-harmonization-planner.js
---
 src/melody/test-harmonization-planner.js | 60 +++++++++++++++++++++++---------
 1 file changed, 44 insertions(+), 16 deletions(-)
---
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
M  src/melody/test-harmonization-planner.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? .opencode/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

---

## Assistant (Build · deepseek-v4-pro · 4.6s)

_Thinking:_

Seul le fichier autorisé est staged. Je crée le commit.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git commit -m \"test: traverse functions in harmonization input graph\" 2>&1",
  "description": "Create commit"
}
```

**Output:**
```
[master 72b3c06] test: traverse functions in harmonization input graph
 1 file changed, 44 insertions(+), 16 deletions(-)

```

---

## Assistant (Build · deepseek-v4-pro · 9.5s)

_Thinking:_

The commit was successful. Now I need to run the post-commit verifications and create the auditfile.

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff-tree --no-commit-id --name-status -r HEAD 2>&1",
  "description": "Verify commit contents"
}
```

**Output:**
```
M	src/melody/test-harmonization-planner.js

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git rev-parse HEAD 2>&1",
  "description": "Get new HEAD"
}
```

**Output:**
```
72b3c0652f671203240ab63b6be77932922c4deb

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git log -1 --oneline 2>&1",
  "description": "Show last commit"
}
```

**Output:**
```
72b3c06 test: traverse functions in harmonization input graph

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git status --short 2>&1",
  "description": "Final status"
}
```

**Output:**
```
 M .clinerules/rules-projet.md
 M CHANGES.md
 M electron/__pycache__/audio-processor.cpython-313.pyc
 M electron/audio-processor.py
 M package-lock.json
 M package.json
 M src/index.html
 M src/main.js
 M src/recorder/serializer.js
 M src/style.css
 M src/ui/display.js
 M vite.config.js
?? .claude/plans/increment-3-enharmonic-plan.md
?? .claude/plans/increment-4-candidate-generation-plan.md
?? .claude/worktrees/
?? .opencode/
?? ANALYSE_QUALITE_413.md
?? COMPARAISON_AB.md
?? COMPARAISON_PROGRESSIONS.md
?? COMPARAISON_REELLES.md
?? RAPPORT_DIAGNOSTIC.md
?? docs/DESIGN.md
?? docs/MIDI_EXPORT.md
?? docs/chord-audit/chord-system-audit.md
?? docs/chord-audit/chord-test-cases.json
?? docs/chord-audit/chord-vocabulary.json
?? docs/chord-audit/source-files.txt
?? electron/harmony_engine/__pycache__/
?? screenshots/
?? scripts/__pycache__/calibrate_v1.cpython-313.pyc
?? scripts/__pycache__/experiment-templates.cpython-313.pyc
?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc
?? scripts/__pycache__/historical_baseline.cpython-313.pyc
?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc
?? scripts/ab-benchmark.py
?? scripts/audit-observation.py
?? scripts/compare-progressions.py
?? scripts/compare-reelles.py
?? scripts/diagnostic-pipeline.py
?? scripts/diagnostic-stages.py
?? scripts/experiment-templates.py
?? scripts/gen-benchmark.py
?? scripts/generate-progression-tests.py
?? scripts/verif-metrics.py
?? sessionjazz-ses_02b4.md
?? src/index.html.tailwind-backup
?? src/ui/components/
?? tests/__pycache__/
?? tests/audio/diagnostic/
?? tests/audio/progressions/
?? tests/audio/reelles_comparison/
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav
?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav
?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav

```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only 2>&1",
  "description": "Verify no staged changes"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --name-only -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Verify target file clean"
}
```

**Output:**
```
(no output)
```

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git diff --cached --name-only -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Verify target file not staged"
}
```

**Output:**
```
(no output)
```

---

## Assistant (Build · deepseek-v4-pro · 9.8s)

_Thinking:_

Now I need to create the audit file. Let me also get the git show output for the commit.

Now let me get the git show output and create the audit file:

**Tool: bash**

**Input:**
```json
{
  "command": "cd /home/visiteur/piano-jazz-chords && git show --no-color HEAD -- src/melody/test-harmonization-planner.js 2>&1",
  "description": "Show commit diff for audit"
}
```

**Output:**
```
commit 72b3c0652f671203240ab63b6be77932922c4deb
Author: OpenCode Agent <opencode@local.dev>
Date:   Fri Aug 7 18:34:28 2026 +0200

    test: traverse functions in harmonization input graph

diff --git a/src/melody/test-harmonization-planner.js b/src/melody/test-harmonization-planner.js
index 808092f..c07364f 100644
--- a/src/melody/test-harmonization-planner.js
+++ b/src/melody/test-harmonization-planner.js
@@ -69,11 +69,25 @@ function assertThrowsRangeError(fn, msg = '') {
 }
 
 /**
- * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.
- * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,
- * ses clés propres et le descripteur complet de chaque propriété propre
- * (type, value, writable, enumerable, configurable pour les données ;
- *  type, get, set, enumerable, configurable pour les accesseurs).
+ * Détermine si une valeur est un nœud du graphe (objet ou fonction non nul).
+ * Les fonctions sont traitées comme des nœuds à part entière : elles possèdent
+ * des clés propres, des descripteurs, un état de gel et peuvent contenir des
+ * sous-objets ou sous-fonctions.
+ *
+ * @param {unknown} value
+ * @returns {boolean}
+ */
+function isGraphNode(value) {
+  return value !== null
+    && (typeof value === 'object' || typeof value === 'function');
+}
+
+/**
+ * Capture, sans mutation, tout le graphe d'objets et de fonctions accessible
+ * depuis une racine. Pour chaque nœud accessible, mémorise sa référence, son
+ * état de gel, ses clés propres et le descripteur complet de chaque propriété
+ * propre (type, value, writable, enumerable, configurable pour les données ;
+ * type, get, set, enumerable, configurable pour les accesseurs).
  * Un WeakSet évite les boucles et les parcours redondants sur les références
  * partagées. Les snapshots de propriétés utilisent un Map pour conserver
  * les symboles comme clés réelles. Aucun getter n'est déclenché.
@@ -85,7 +99,7 @@ function captureGraph(root) {
   const seen = new WeakSet();
   const snapshots = new WeakMap();
   function visit(obj, path) {
-    if (obj === null || typeof obj !== 'object') return;
+    if (!isGraphNode(obj)) return;
     if (seen.has(obj)) return;
     seen.add(obj);
     const ownKeys = Reflect.ownKeys(obj);
@@ -100,7 +114,7 @@ function captureGraph(root) {
           enumerable: desc.enumerable,
           configurable: desc.configurable,
         });
-        if (desc.value !== null && typeof desc.value === 'object') {
+        if (isGraphNode(desc.value)) {
           visit(desc.value, `${path}.${String(k)}`);
         }
       } else {
@@ -127,12 +141,12 @@ function captureGraph(root) {
 
 /**
  * Vérifie que le graphe accessible depuis root est inchangé par rapport au
- * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à
- * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références
- * pour les valeurs objet, même état de gel, et descripteurs complets identiques
- * (writable, enumerable, configurable pour les données ; get, set, enumerable,
- * configurable pour les accesseurs). Vérifie aussi la référence exacte de la
- * racine.
+ * snapshot capturé. Pour chaque nœud capturé (objet ou fonction), contrôle :
+ * même référence à chaque emplacement, mêmes clés, mêmes valeurs primitives,
+ * mêmes références pour les valeurs objet/fonction, même état de gel, et
+ * descripteurs complets identiques (writable, enumerable, configurable pour
+ * les données ; get, set, enumerable, configurable pour les accesseurs).
+ * Vérifie aussi la référence exacte de la racine.
  *
  * @param {object} root
  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured
@@ -148,7 +162,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
   }
   const visited = new WeakSet();
   function visit(obj, expectedObj, path) {
-    if (obj === null || typeof obj !== 'object') {
+    if (!isGraphNode(obj)) {
       if (obj !== expectedObj) {
         throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);
       }
@@ -156,7 +170,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
     }
     const snap = captured.snapshots.get(obj);
     if (!snap) {
-      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);
+      throw new Error(`${path} objet/fonction non présent dans le snapshot initial (référence inconnue ou remplacée)`);
     }
     if (visited.has(obj)) return;
     visited.add(obj);
@@ -206,7 +220,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {
       if (desc && desc.configurable !== snapProp.configurable) {
         throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);
       }
-      if (actualV !== null && typeof actualV === 'object') {
+      if (isGraphNode(actualV)) {
         visit(actualV, expectedV, `${path}.${String(k)}`);
       }
     }
@@ -825,6 +839,20 @@ runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouvea
     assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');
   })();
 
+  // 6. Fonction comme valeur de propriété de données, avec propriété propre
+  //    imbriquée. La capture traverse la fonction, ses clés propres et ses
+  //    descripteurs. Une mutation d'une propriété de la fonction est détectée.
+  (() => {
+    function fn() { return 1; }
+    fn.customProp = { nested: 42 };
+    const obj = { myFn: fn };
+    const cap = captureGraph(obj);
+    fn.customProp.nested = 99;
+    let err = null;
+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }
+    assertTrue(err !== null, 'synth6: mutation dans propriété imbriquée de fonction détectée');
+  })();
+
   // Wrapper : référence et état de gel inchangés.
   assertTrue(input === inputRef, 'wrapper même référence');
   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');

```

---

## Assistant (Build · deepseek-v4-pro · 103.6s)

_Thinking:_

Now I need to create the audit file with all the raw outputs. Let me compile everything.

**Tool: write**

**Input:**
```json
{
  "content": "==================================================\nAUDIT FINAL ABSOLU — INCRÉMENT 8 — PARCOURS FONCTIONS\n==================================================\n\n==================================================\n1. ÉTAT INITIAL\n==================================================\n\nCommande : git rev-parse HEAD\nSortie :\nb6085b4baa16afb15af3bf89bece19ecc65bf632\n\nCommande : git status --short\nSortie :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n?? .claude/plans/increment-3-enharmonic-plan.md\n?? .claude/plans/increment-4-candidate-generation-plan.md\n?? .claude/worktrees/\n?? .opencode/\n?? ANALYSE_QUALITE_413.md\n?? COMPARAISON_AB.md\n?? COMPARAISON_PROGRESSIONS.md\n?? COMPARAISON_REELLES.md\n?? RAPPORT_DIAGNOSTIC.md\n?? docs/DESIGN.md\n?? docs/MIDI_EXPORT.md\n?? docs/chord-audit/chord-system-audit.md\n?? docs/chord-audit/chord-test-cases.json\n?? docs/chord-audit/chord-vocabulary.json\n?? docs/chord-audit/source-files.txt\n?? electron/harmony_engine/__pycache__/\n?? screenshots/\n?? scripts/__pycache__/calibrate_v1.cpython-313.pyc\n?? scripts/__pycache__/experiment-templates.cpython-313.pyc\n?? scripts/__pycache__/generate_v1_fixtures.cpython-313.pyc\n?? scripts/__pycache__/historical_baseline.cpython-313.pyc\n?? scripts/__pycache__/phase1b7_oracles.cpython-313.pyc\n?? scripts/ab-benchmark.py\n?? scripts/audit-observation.py\n?? scripts/compare-progressions.py\n?? scripts/compare-reelles.py\n?? scripts/diagnostic-pipeline.py\n?? scripts/diagnostic-stages.py\n?? scripts/experiment-templates.py\n?? scripts/gen-benchmark.py\n?? scripts/generate-progression-tests.py\n?? scripts/verif-metrics.py\n?? sessionjazz-ses_02b4.md\n?? src/index.html.tailwind-backup\n?? src/ui/components/\n?? tests/__pycache__/\n?? tests/audio/diagnostic/\n?? tests/audio/progressions/\n?? tests/audio/reelles_comparison/\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-I_C_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_full.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_no5.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_shell.wav\n?? tests/audio/v1_benchmark/synthetic/dev/dev_ii-V-i_Gm_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_D#-F#-A_temporal_spread.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_foreign_melody.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_full.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_inversion.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_no5.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_rootless.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_shell.wav\n?? tests/audio/v1_benchmark/synthetic/validation/validation_F-A-B_temporal_spread.wav\n\nCommande : git diff --name-status\nSortie :\nM\t.clinerules/rules-projet.md\nM\tCHANGES.md\nM\telectron/__pycache__/audio-processor.cpython-313.pyc\nM\telectron/audio-processor.py\nM\tpackage-lock.json\nM\tpackage.json\nM\tsrc/index.html\nM\tsrc/main.js\nM\tsrc/recorder/serializer.js\nM\tsrc/style.css\nM\tsrc/ui/display.js\nM\tvite.config.js\n\nCommande : git diff --cached --name-status\nSortie :\n(no output)\n\nCommande : git diff -- src/melody/test-harmonization-planner.js\nSortie :\n(no output)\n\nCommande : git diff --cached -- src/melody/test-harmonization-planner.js\nSortie :\n(no output)\n\n==================================================\n2. DIFF RÉALISÉ\n==================================================\n\nsrc/melody/test-harmonization-planner.js | 60 +++++++++++++++++++++++---------\n 1 file changed, 44 insertions(+), 16 deletions(-)\n\nModifications :\n- Ajout du helper isGraphNode(value) : retourne true pour toute valeur non\n  nulle dont le type est 'object' ou 'function'.\n- captureGraph() : utilise isGraphNode() pour décider si une valeur est un\n  nœud récursif (au lieu de typeof === 'object').\n- assertGraphUnchanged() : utilise isGraphNode() pour la même décision.\n- T11 : ajout du contrôle synthétique 6 — une fonction avec propriété propre\n  imbriquée, mutation détectée.\n\n==================================================\n3. VALIDATIONS (COMMANDE, STDOUT, STDERR, EXIT CODE)\n==================================================\n\n--- Validation 1 ---\nCommande : node src/melody/test-harmonization-planner.js\nSTDOUT :\n  ✓ T1 — export unique et clés exactes de HarmonizationPlan / HarmonizationStep\n  ✓ T2 — pipeline réel : 3 couches, 3 candidats, 3 voicings, 2 transitions\n  ✓ T3 — alignement exact des références (pas de comparaison JSON)\n  ✓ T4 — transitions entrantes nulles au step 0, puis transitions[i-1]\n  ✓ T5 — candidat de départ verrouillé respecté, couches suivantes libres\n  ✓ T6 — une seule ancre : mono-couche, transitions nulles, totaux exacts\n  ✓ T7 — équivalence stricte avec la composition manuelle des API publiques\n  ✓ T8 — ordre exact des ancres conservé, ancres distinctes, pas de tri\n  ✓ T9 — couches distinctes, figées, ordre du générateur, pas de clone de candidat\n  ✓ T10 — déterminisme : même JSON, ids, notes MIDI, scores, ordre\n  ✓ T11 — immutabilité complète : graphe des entrées inchangé, nouveaux conteneurs figés\n  ✓ T12 — wrapper invalide : TypeError pour chaque cas\n  ✓ T13 — ancres invalides : TypeError (délégué aux contrats publics)\n  ✓ T14 — contexte canonique sans ancre -> RangeError\n  ✓ T15 — progression avec cardinalités de pitch classes différentes garanties\n  ✓ T16 — aucun champ interdit dans les nouveaux conteneurs\n  ✓ T17 — chemin long : fini, longueurs cohérentes, ordre stable, déterminisme\n  ✓ T18 — appel au planificateur ne modifie pas les résultats amont directs\n\n=== Résultat : 18/18 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 2 ---\nCommande : node src/melody/test-voicing-path-finder.js\nSTDOUT :\n  ✓ T1 — exports exacts (3) et settings figés/identiques au littéral\n  ✓ T2 — génération d un accord réel\n  ✓ T3 — basse dans l accord et basse externe, toujours la plus grave\n  ✓ T4 — basse omise et null valides, plusieurs renverseents, pas de NaN\n  ✓ T5 — bornes inclusives 36/84 atteintes, plages des mains, spans, registerDeviation\n  ✓ T6 — transition immobile (mêmes notes)\n  ✓ T7 — mouvement simple vérifié manuellement\n  ✓ T8 — cardinalités égales : appariement direct par indice (36→72)\n  ✓ T8b — cardinalités différentes : [60,64,67]→[60,64]\n  ✓ T8c — égalités [50]↔[48,52] : match/insert puis match/delete\n  ✓ T9 — quintes et octaves parallèles, direction, pas d unisson\n  ✓ T10 — greedy vs DP : DP strictement meilleur (C→G7→Fmaj7)\n  ✓ T11 — oracle exhaustif indépendant (petites couches)\n  ✓ T12 — une couche : registre centré puis départage MIDI, totaux nuls\n  ✓ T13 — [c,c,c] voicing répété, midiNotes identiques, déterminisme\n  ✓ T14 — départages registre/MIDI, témoins métriques exacts, non-atteignabilité octaves\n  ✓ T15 — immutabilité complète : résultats figés, entrées non figées et intactes\n  ✓ T16 — TypeError sur entrées invalides (options / chemins creux)\n  ✓ T17 — RangeError s il n y a aucun voicing admissible\n  ✓ T18 — génération réelle, HarmonicPath, puis voicings\n  ✓ T19 — chemin long, fini, déterministe, borné\n  ✓ T20 — aucun champ audio/UI/pédale/doigté, chemin candidat intact\n\n=== Résultat : 22/22 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 3 ---\nCommande : node src/melody/test-harmonic-path-finder.js\nSTDOUT :\n  ✓ T01 — export présent et champs exacts\n  ✓ T02 — longueurs, références et bornes\n  ✓ T03 — cohérence from/to des transitions\n  ✓ T2 — une couche : meilleure compatibilité, transitions vides\n  ✓ T2b — une couche : tie-break déterministe sur égalité\n  ✓ T2c — chaque catégorie V1 retourne exactement son score prévu\n  ✓ T3 — le couple optimal est sélectionné avec la formule exacte\n  ✓ T4 — l optimum global bat le greedy couche par couche\n  ✓ T5a — oracle exhaustif (3 couches 2×2×2)\n  ✓ T5b — oracle exhaustif (4 couches 3×2×4×2)\n  ✓ T6 — formula exactes vérifiées séparément\n  ✓ T7a — départage par compatibilité sur égalité pondérée\n  ✓ T7b — départage par identifiant lexical\n  ✓ T7c — clones à identifiant identique départagés par indice\n  ✓ T7d — appels répétés strictement déterministes\n  ✓ T8 — le bonus V→I influence le chemin, pas l ordre inverse\n  ✓ T9 — même candidat référencé ou cloné entre couches\n  ✓ T10 — basses absentes sans NaN\n  ✓ T11 — couches 4, 2, 5, 3 avec pitch classes variées\n  ✓ T12 — candidat verrouillé retenu (contrat réel Inc4)\n  ✓ T13 — entrées non mutées, résultat et conteneurs figés\n  ✓ T14 — TypeError sur entrées invalides\n  ✓ T14b — clés héritées dangereuses : toutes lèvent TypeError\n  ✓ T14c — argument absent, non-objet, creux externes et internes\n  ✓ T14d — category lue au plus une fois par candidat\n  ✓ T14e — départage lexical sur plusieurs couches, priorité à la première différence\n  ✓ T14f — identifiants identiques, départagés par toute la suite d indices\n  ✓ T14g — trois couches parfaites identiques : totalScore exactement 100\n  ✓ T14h — départage par indices quand les unités sont égales\n  ✓ T15 — matrice large : fini, borné, déterministe\n  ✓ T16 — de vrais candidats générés passent au path finder\n  ✓ T17 — aucun champ voicing/octave/doigté/audio/UI/segment\n  ✓ T18 — sanity de l écosystème et export unique\n\n=== Résultat : 33/33 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 4 ---\nCommande : node src/melody/test-transition-score.js\nSTDOUT :\n=== Incrément 5 — Scoring de transition entre ChordCandidate ===\n\n  ✓ T01 — Deux appels identiques produisent exactement le même JSON\n  ✓ T02 — Candidats profonds inchangés après l'appel\n  ✓ T02b — Résultat et structures imbriquées figés\n  ✓ T03 — Même identité sonore, orthographes différentes → mêmes scores\n  ✓ T04 — Mouvement de fondamentale contrôlé : plus de notes communes → commonScore ≥\n  ✓ T05 — Paire proche obtient un motionScore supérieur\n  ✓ T06 — from === to valide, borné, totalScore = 100\n  ✓ T06b — Deux clones séparés du même candidat\n  ✓ T07 — 4 vs 5 pitch classes, symétrie des composantes\n  ✓ T08 — Deux basses absentes → bassScore null, bass inactif\n  ✓ T08b — Une seule basse présente → bassScore null\n  ✓ T08c — Deux basses présentes → composante bass active\n  ✓ T08d — Deux propriétés bassPitchClass omises → valide, bass inactif\n  ✓ T08e — Une seule propriété omise → bassScore null, bass inactif\n  ✓ T08f — Ordre inverse : basse omise côté from, présente côté to\n  ✓ T09 — V→I active resolutionScore = 100\n  ✓ T09b — I→V ne bénéficie d'aucune résolution\n  ✓ T09c — Le bonus V→I rend le total différent de I→V\n  ✓ T10 — Matrice large : tous les nombres sont finis\n  ✓ T11 — TypeError sur entrées invalides\n  ✓ T11b — from === to ne renvoie jamais d'erreur\n  ✓ T12 — Aucun champ de chemin dans le résultat\n  ✓ T12b — Aucune fonction de sélection exportée\n  ✓ T13 — De vrais candidats générés passent au scoreur\n  ✓ T14 — Sanity des imports sans régression\n\n=== Résultat : 25/25 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 5 ---\nCommande : node src/melody/test-chord-candidates.js\nSTDOUT :\n=== Incrément 4 — Génération des candidats d'accords ===\n\n  ✓ S01 — CHORD_DEFINITIONS reste le référentiel unique\n  ✓ S02 — Aucune table indépendante de qualités dans src/melody\n  ✓ S03 — Anciennes définitions d'accords restent compatibles\n  ✓ S04 — Métadonnées d'identité accessibles depuis la définition canonique\n  ✓ I05 — maj7 conserve 3 et 7\n  ✓ I06 — m7 conserve b3 et b7\n  ✓ I07 — 7 conserve 3 et b7\n  ✓ I08 — m7b5 conserve b3, b5 et b7\n  ✓ I09 — dim7 conserve sa structure identitaire\n  ✓ I10 — 7sus4 ne requiert pas une tierce majeure\n  ✓ I11 — Omission de quinte autorisée lorsqu'elle est déclarée\n  ✓ I12 — Omission identitaire interdite\n  ✓ M13 — Mélodie comme chord-tone\n  ✓ M14 — Mélodie comme available-tension\n  ✓ M15 — Mélodie comme suspension\n  ✓ M16 — Note de passage tolérée\n  ✓ M17 — Note incompatible rejetée\n  ✓ M18 — preserveExactPitch enregistré comme contrainte future\n  ✓ M19 — melody-must-be-top enregistré comme contrainte future\n  ✓ M20 — allow-notes-above n'élimine pas une mélodie intérieure\n  ✓ M21 — harmonizationPolicy skip retourne skipped\n  ✓ M22 — harmonizationPolicy force sans candidat retourne no-valid-candidate\n  ✓ M23 — automatic conserve plusieurs catégories compatibles\n  ✓ A24 — Ancre liée à MelodyEvent\n  ✓ A25 — Ancre sans MelodyEvent\n  ✓ A26 — Ancre invalide\n  ✓ A27 — Accord initial verrouillé\n  ✓ A28 — Accord final verrouillé\n  ✓ A29 — Accord verrouillé incompatible signalé\n  ✓ A30 — Accord original non verrouillé inclus comme candidat\n  ✓ F31 — Candidats diatoniques en tonalité majeure\n  ✓ F32 — Candidats diatoniques en tonalité mineure\n  ✓ F33 — Substitution diatonique documentée\n  ✓ F34 — Dominante secondaire avec cible\n  ✓ F35 — Dominante secondaire sans cible non générée\n  ✓ F36 — Diminué d'approche valide\n  ✓ F37 — Symétrie dim7 sans quadruplon inutile\n  ✓ F38 — Emprunt modal limité\n  ✓ F39 — Candidat chromatique non justifié rejeté\n  ✓ E40 — D♭ majeur produit une orthographe en bémols\n  ✓ E41 — C# majeur conserve E# et B# lorsque nécessaire\n  ✓ E42 — Accord manuel explicite conserve son symbole\n  ✓ E43 — Même hauteur, orthographes fonctionnelles distinctes\n  ✓ E44 — Respelling ne modifie pas les pitch classes\n  ✓ D45 — Doublon réel supprimé\n  ✓ D46 — Fonctions distinctes conservées\n  ✓ D47 — Basses différentes conservées\n  ✓ D48 — Plafond configurable respecté\n  ✓ D49 — Aucun minimum artificiel de candidats\n  ✓ D50 — Ordre déterministe\n  ✓ V51 — CandidateValidationReport JSON-safe\n  ✓ V52 — AnchorCandidateGenerationResult JSON-safe\n  ✓ V53 — Entrées non mutées\n  ✓ V54 — Identifiants stables\n  ✓ V55 — Même entrée produit exactement la même sortie\n  ✓ V56 — Candidat inconnu rejeté proprement\n  ✓ V57 — Aucune logique de transition exécutée\n  ✓ V58 — Aucun voicing généré\n  ✓ V59 — Aucun appel réseau ou IA\n  ✓ R60 — Fm7 verrouillé au départ\n  ✓ R61 — B♭m7 verrouillé à l'arrivée\n  ✓ R62 — Chaque note mélodique conserve sa contrainte\n  ✓ R63 — Plusieurs candidats valides peuvent exister par ancre\n  ✓ R64 — La progression complète n'est pas imposée\n  ✓ NR65 — Tests des Incréments 0 à 3 toujours verts (sanity locale)\n  ✓ NR66 — Tests du moteur d'accords toujours verts (sanity locale)\n  ✓ NR67 — Résultat historique du détecteur tonal inchangé\n  ✓ NR68 — Build réussi non testable ici, mais modules syntaxiquement valides\n  ✓ H69 — preserveExactPitch ne se réduit pas à la pitch class\n  ✓ H70 — non-chord-tone-allowed produit un avertissement explicite\n  ✓ H71 — suspension produit un avertissement explicite\n  ✓ H72 — intervalle identitaire prime sur available-tension\n  ✓ H73 — accord initial verrouillé incompatible expose une violation exploitable\n  ✓ H74 — plafond bas ne supprime pas le candidat verrouillé\n  ✓ H75 — troncature signalée avec le code CANDIDATES_TRUNCATED\n  ✓ H76 — aucun score musical caché dans les candidats\n  ✓ H77 — emprunts modaux strictement limités au vocabulaire documenté\n\n=== Résultat : 77/77 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 6 ---\nCommande : node src/melody/test-spelled-pitch.js\nSTDOUT :\n=== Incrément 3 — Orthographe enharmonique et contrats stabilisés ===\n\n  ✓ A01 — C# et Db ont la même pitchClass\n  ✓ A02 — C# et Db n'ont pas la même orthographe\n  ✓ A03 — pitchClassFromSpelling valide letter + accidental\n  ✓ A04 — Rejet d'une orthographe incohérente\n  ✓ A05 — Double bémol accepté\n  ✓ A06 — Double dièse accepté\n  ✓ A07 — Aucune triple altération générée automatiquement\n  ✓ B08 — Do majeur correctement orthographié\n  ✓ B09 — Fa majeur avec Si♭\n  ✓ B10 — Ré♭ majeur\n  ✓ B11 — Do dièse majeur avec Mi dièse et Si dièse\n  ✓ B12 — Fa dièse majeur avec Mi dièse\n  ✓ B13 — Sol bémol majeur avec Do bémol\n  ✓ B13b — 7 lettres distinctes dans chaque gamme\n  ✓ C14 — Tonalité détectée avec orthographe par défaut\n  ✓ C15 — Sélection manuelle D♭ conservée\n  ✓ C16 — Sélection manuelle C# conservée\n  ✓ C17 — Scores automatiques inchangés après sélection orthographique\n  ✓ C18 — Suppression de la correction manuelle restaure l'orthographe par défaut\n  ✓ C19 — Ancien TonalContext sans SpelledKey reste accepté\n  ✓ D20 — ChordReference C#m7\n  ✓ D21 — ChordReference D♭m7\n  ✓ D22 — C#m7 et D♭m7 partagent la même qualité canonique et symboles conservés\n  ✓ D23 — Slash chord D♭/F conserve les orthographes respectives\n  ✓ D24 — Accord explicite prioritaire sur respelling automatique\n  ✓ D25 — Respelling contextuel seulement sur demande ou absence d'écriture explicite\n  ✓ E26 — startChord verrouillable\n  ✓ E27 — endChord verrouillable\n  ✓ E28 — Version incrémentée lors du verrouillage\n  ✓ F29 — Ancre facultative après la fin = warning\n  ✓ F30 — Ancre force après la fin = error\n  ✓ F31 — Ancre verrouillée après la fin = error\n  ✓ F32 — Temps négatif = error\n  ✓ G33 — Identifiants stables après respelling\n  ✓ G34 — JSON-sérialisation\n  ✓ G35 — Immutabilité\n  ✓ H36 — Résultat historique du détecteur tonal inchangé\n  ✓ H37 — Aucun second référentiel d'accords\n  ✓ I38 — spellMidiNote conserve l'octave\n  ✓ I39 — spellPitchClass fallback déterministe\n  ✓ I40 — formatSpelledPitch affiche les altérations\n\n=== Résultat : 41/41 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 7 ---\nCommande : node src/melody/test-tonal-harmonic.js\nSTDOUT :\n=== Incrément 2 — Contexte tonal et harmonique ===\n\n  ✓ T01 — estimation depuis une MelodyTrack simple (Do majeur)\n  ✓ T02 — appel réel du chemin notes brutes\n  ✓ T03 — aucun appel au chemin fondé sur les accords\n  ✓ T04 — événements disabled ignorés\n  ✓ T05 — événements incomplets ignorés et signalés\n  ✓ T06 — plusieurs candidats conservés\n  ✓ T07 — sélection d'un candidat\n  ✓ T08 — tonalité manuelle séparée des candidats détectés\n  ✓ T09 — correction utilisateur non écrasée\n  ✓ T10 — retrait de confirmation\n  ✓ T11 — contexte sans estimation suffisante (piste vide)\n  ✓ T12 — création d'un HarmonicContext vide\n  ✓ T13 — accord initial valide\n  ✓ T14 — accord final valide\n  ✓ T15 — symbole d'accord inconnu rejeté proprement\n  ✓ T16 — ajout d'une ancre liée à MelodyEvent\n  ✓ T17 — ancre avec MelodyEvent inexistant rejetée\n  ✓ T18 — ancres triées sans mutation de l'entrée\n  ✓ T19 — politiques force / automatic / skip\n  ✓ T20 — progression originale manuelle\n  ✓ T21 — ordre temporel invalide signalé\n  ✓ T22 — comparaison mélodie/harmonie en accord\n  ✓ T23 — comparaison mélodie/harmonie en conflit\n  ✓ T24 — sorties JSON-sérialisables\n  ✓ T25 — immutabilité des entrées\n  ✓ T26 — version incrémentée après édition\n  ✓ T27 — aucun doublon de source de vérité des accords\n  ✓ T28 — computeKeyCandidatesFromRawNotes retourne 24 candidats\n  ✓ T29 — mise à jour d'une ancre\n  ✓ T30 — suppression d'une ancre\n  ✓ T31 — validation complète d'un contexte valide\n  ✓ T32 — setStartChord avec null retire l'accord\n  ✓ T33 — setEndChord avec null retire l'accord\n  ✓ T48 — startChord verrouillable\n  ✓ T49 — endChord verrouillable\n  ✓ T50 — tonalité manuelle C# majeur conservée\n  ✓ T51 — tonalité manuelle Db majeur conservée\n  ✓ T52 — setStartChord accepte une option locked\n  ✓ T34 — rebuildTonalContext crée un nouvel ID\n  ✓ T35 — setManualTonalContext avec objet\n  ✓ T36 — comparaison relatifs (Do majeur / La mineur)\n  ✓ T37 — comparaison parallèles (Do majeur / Do mineur)\n  ✓ T38 — validation avec piste vide\n  ✓ T39 — ancre avec temps négatif rejetée\n  ✓ T40 — mélodie en La mineur produit une estimation\n  ✓ T41 — cohérence entre computeKeyFromRawNotes et computeKeyCandidatesFromRawNotes\n  ✓ T42 — résultat historique de computeKeyFromRawNotes inchangé\n  ✓ T43 — mélodie ambiguë conserve Do majeur et La mineur\n  ✓ T44 — très courte mélodie\n  ✓ T45 — corrections manuelles répétées sans accumulation\n  ✓ T46 — symétrie de compareTonalEstimates\n  ✓ T47 — durée exploitée conformément au détecteur\n\n=== Résultat : 52/52 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 8 ---\nCommande : node src/melody/test-melody-track.js\nSTDOUT :\n=== Incrément 1 — Piste mélodique explicite ===\n\n  ✓ T01 — conversion d'une note normale en MelodyEvent\n  ✓ T02 — conservation exacte du MIDI et de l'octave\n  ✓ T03 — conservation des temps et de la durée\n  ✓ T04 — conservation de la vélocité\n  ✓ T05 — valeurs par défaut des trois politiques\n  ✓ T06 — plusieurs notes successives conservent l'ordre\n  ✓ T07 — attaque simultanée conservée sans suppression\n  ✓ T08 — chevauchement legato conservé et diagnostiqué\n  ✓ T09 — événement désactivé reste présent\n  ✓ T10 — modification de sopranoPolicy non destructive\n  ✓ T11 — modification de harmonizationPolicy non destructive\n  ✓ T12 — ajout et suppression d'un marqueur\n  ✓ T13 — découpage temporel de la piste\n  ✓ T14 — temps relatifs commençant à zéro\n  ✓ T15 — construction des événements de lecture\n  ✓ T16 — relecture préservant ordre, notes et durées\n  ✓ T17 — fin synthétique conservée et signalée\n  ✓ T18 — déconnexion signalée\n  ✓ T19 — snapshot source non muté\n  ✓ T20 — MelodyTrack JSON-sérialisable\n  ✓ T21 — retours publics non mutables extérieurement\n  ✓ T22 — version incrémentée après édition\n  ✓ T23 — deux note-on de même note deviennent deux MelodyEvent\n  ✓ T24 — validation refuse une piste vide\n  ✓ T25 — piste vide gérée proprement\n  ✓ T26 — modification de preserveExactPitch\n\n=== Résultat : 26/26 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 9 ---\nCommande : node src/melody/test-midi-capture.js\nSTDOUT :\n=== Incrément 0 — Capture MIDI temporelle non destructive ===\n\n  ✓ T01 — note-on / note-off normal conserve time, note, velocity et channel\n  ✓ T02 — note-on vélocité 0 équivaut à note-off\n  ✓ T03 — répétition de la même note avant relâchement crée deux note-on distincts\n  ✓ T04 — accords simultanés conservent tous les événements\n  ✓ T05 — sustain CC64 maintient les notes après note-off\n  ✓ T06 — relâchement pendant sustain conserve la note jusqu'à fin de sustain\n  ✓ T07 — fin de sustain libère uniquement les notes du canal concerné\n  ✓ T08 — finalize génère des note-off pour notes actives sans note-off\n  ✓ T09 — finalize nettoie aussi les notes sustained\n  ✓ T10 — plusieurs canaux conservent leurs événements séparément\n  ✓ T11 — horloge par défaut est monotone\n  ✓ T12 — aucune note bloquée après finalize()\n  ✓ Bonus — getTimeline est pure et n'altère pas l'état interne\n  ✓ T13 — note-off orphelin est enregistré sans crasher\n  ✓ T14 — finalize est idempotent\n  ✓ T15 — getTimeline/getNotes/getEvents retournent des snapshots JSON-safe\n  ✓ T16 — horloge invalide rejette les timestamps incohérents\n  ✓ T17 — plusieurs sources conservent leurs notes séparément\n\n=== Résultat : 18/18 tests passés ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 10 ---\nCommande : npm run test:chords\nSTDOUT :\n> piano-jazz-chords@0.1.0 test:chords\n> node src/chord-engine/test-chords.js\n\n✅ C9 → C9\n✅ C13 → C13\n✅ Cm7b5 → Cm7b5\n✅ C7#9b13 → C7#9b13\n✅ C13#11 → C13#11\n✅ C/E (1ère inversion) → C/E\n✅ Cmaj9 → Cmaj9\n✅ Dm9 → Dm9\n✅ G7sus4 → G7sus4\n✅ F#m7b5 → F#m7b5\n✅ C major (C-E-G) → C\n✅ F major (F-A-C) → F\n✅ C quartal (C-F-Bb) → Cquartal\n✅ C quartal add4 (C-F-Bb-Eb) → Cquartal(add4)\n✅ C13#11 with D major upper structure → C13#11\n✅ D/C polychord → C/D\n✅ C9sus4 → C9sus4\n✅ C13sus4 → C13sus4\n✅ Cmaj7sus2 → Cmaj7sus2\n✅ Cmaj7sus4 → Cmaj7sus4\n✅ Dmaj7sus2 → Dmaj7sus2\n✅ C7sus4 regression → C7sus4\n✅ C9sus4 regression → C9sus4\n✅ Gadd11 regression → Gadd11\n✅ Aadd11 regression → Aadd11\n✅ Em7b9 cluster voicing → Em7b9\n✅ Cmaj7 shell (C E B) → Cmaj7\n✅ C7 shell (C E Bb) → C7\n✅ Cm7 shell (C Eb Bb) → Cm7\n✅ Cmaj7 full (C E G B) → Cmaj7\n✅ C7 full (C E G Bb) → C7\n✅ Cm7 full (C Eb G Bb) → Cm7\n✅ C7 no5 — power chord not shell (E B) → E5\n✅ Em — not Cmaj7 shell (E G B) → Em\n✅ Eb5 — not Cm7 shell (Eb Bb) → D#5\n✅ Cmaj7 shell with 9th — not recognised yet (C E B D) → E5/C\n✅ C7 shell with 13th — not recognised yet (C E Bb A) → Am/C\n✅ C9sus4 no5 — not recognised as shell (C F Bb D) → A#add9/C\n\nRésultat : 98/98 tests réussis (38 directs + 60 transpositions)\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 11 ---\nCommande : node src/analyzer/test-regression-part1.js\nSTDOUT :\n✅ Bug 1.3 — Fmaj9 6 notes (F3,C4,E4,G4,A4,C5) avec jitter\n✅ Bug 1.4 — Mélodie isolée C D E F G → Do majeur\n✅ Sanity — Progression II-V-I non mélodique\n\n=== Partie 1 regression tests done ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 12 ---\nCommande : node src/chord-engine/test-regression-part3.js\nSTDOUT :\n✅ Partie 3.3 — Secondes rapprochées classées cluster\n✅ Partie 3.3 — Triade Mi majeur sur basse Do → upper structure/slash\n✅ Partie 3 — Pureté du classifieur\n\n=== Partie 3 regression tests done ===\nSTDERR : (none)\nEXIT_CODE : 0\n\n--- Validation 13 ---\nCommande : npm run build\nSTDOUT :\n> piano-jazz-chords@0.1.0 build\n> vite build\n\nvite v5.4.21 building for production...\ntransforming...\n✓ 47 modules transformed.\nrendering chunks...\ncomputing gzip size...\n../dist/index.html                                34.14 kB │ gzip:  7.16 kB\n../dist/assets/soundtouch-processor-C1MAJdwL.js   72.87 kB\n../dist/assets/main-BUD1_6Cx.css                 107.30 kB │ gzip: 19.29 kB\n../dist/assets/main-BGsDLFac.js                  164.26 kB │ gzip: 48.65 kB\n✓ built in 1.76s\nSTDERR : (none)\nEXIT_CODE : 0\n\n==================================================\n4. CONTRÔLES GIT AVANT COMMIT\n==================================================\n\nCommande : git diff --check -- src/melody/test-harmonization-planner.js\nSortie : (no output)\nEXIT_CODE : 0\n\nCommande : git status --short\nSortie :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\n M src/melody/test-harmonization-planner.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n[... untracked files ...]\n\nCommande : git diff --cached --name-only\nSortie : (no output)\n\n==================================================\n5. COMMIT\n==================================================\n\nCommande : git add -- src/melody/test-harmonization-planner.js\nCommande : git diff --cached --check\nSortie : (no output)\n\nCommande : git diff --cached --name-only\nSortie : src/melody/test-harmonization-planner.js\n\nCommande : git diff --cached --stat\nSortie : src/melody/test-harmonization-planner.js | 60 +++++++++++++++++++++++---------\n 1 file changed, 44 insertions(+), 16 deletions(-)\n\nCommande : git status --short\nSortie :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\nM  src/melody/test-harmonization-planner.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n[... untracked files ...]\n\nCommande : git commit -m \"test: traverse functions in harmonization input graph\"\nSortie : [master 72b3c06] test: traverse functions in harmonization input graph\n 1 file changed, 44 insertions(+), 16 deletions(-)\n\n==================================================\n6. CONTRÔLES GIT APRÈS COMMIT\n==================================================\n\nCommande : git diff-tree --no-commit-id --name-status -r HEAD\nSortie : M\tsrc/melody/test-harmonization-planner.js\n\nCommande : git rev-parse HEAD\nSortie : 72b3c0652f671203240ab63b6be77932922c4deb\n\nCommande : git log -1 --oneline\nSortie : 72b3c06 test: traverse functions in harmonization input graph\n\nCommande : git status --short\nSortie :\n M .clinerules/rules-projet.md\n M CHANGES.md\n M electron/__pycache__/audio-processor.cpython-313.pyc\n M electron/audio-processor.py\n M package-lock.json\n M package.json\n M src/index.html\n M src/main.js\n M src/recorder/serializer.js\n M src/style.css\n M src/ui/display.js\n M vite.config.js\n[... untracked files ...]\n\nCommande : git diff --cached --name-only\nSortie : (no output)\n\nCommande : git diff --name-only -- src/melody/test-harmonization-planner.js\nSortie : (no output)\n\nCommande : git diff --cached --name-only -- src/melody/test-harmonization-planner.js\nSortie : (no output)\n\n==================================================\n7. git show --no-color HEAD -- src/melody/test-harmonization-planner.js\n==================================================\n\ncommit 72b3c0652f671203240ab63b6be77932922c4deb\nAuthor: OpenCode Agent <opencode@local.dev>\nDate:   Fri Aug 7 18:34:28 2026 +0200\n\n    test: traverse functions in harmonization input graph\n\ndiff --git a/src/melody/test-harmonization-planner.js b/src/melody/test-harmonization-planner.js\nindex 808092f..c07364f 100644\n--- a/src/melody/test-harmonization-planner.js\n+++ b/src/melody/test-harmonization-planner.js\n@@ -69,11 +69,25 @@ function assertThrowsRangeError(fn, msg = '') {\n }\n \n /**\n- * Capture, sans mutation, tout le graphe d'objets accessible depuis une racine.\n- * Pour chaque objet/tableau accessible, mémorise sa référence, son état de gel,\n- * ses clés propres et le descripteur complet de chaque propriété propre\n- * (type, value, writable, enumerable, configurable pour les données ;\n- *  type, get, set, enumerable, configurable pour les accesseurs).\n+ * Détermine si une valeur est un nœud du graphe (objet ou fonction non nul).\n+ * Les fonctions sont traitées comme des nœuds à part entière : elles possèdent\n+ * des clés propres, des descripteurs, un état de gel et peuvent contenir des\n+ * sous-objets ou sous-fonctions.\n+ *\n+ * @param {unknown} value\n+ * @returns {boolean}\n+ */\n+function isGraphNode(value) {\n+  return value !== null\n+    && (typeof value === 'object' || typeof value === 'function');\n+}\n+\n+/**\n+ * Capture, sans mutation, tout le graphe d'objets et de fonctions accessible\n+ * depuis une racine. Pour chaque nœud accessible, mémorise sa référence, son\n+ * état de gel, ses clés propres et le descripteur complet de chaque propriété\n+ * propre (type, value, writable, enumerable, configurable pour les données ;\n+ * type, get, set, enumerable, configurable pour les accesseurs).\n  * Un WeakSet évite les boucles et les parcours redondants sur les références\n  * partagées. Les snapshots de propriétés utilisent un Map pour conserver\n  * les symboles comme clés réelles. Aucun getter n'est déclenché.\n@@ -85,7 +99,7 @@ function captureGraph(root) {\n   const seen = new WeakSet();\n   const snapshots = new WeakMap();\n   function visit(obj, path) {\n-    if (obj === null || typeof obj !== 'object') return;\n+    if (!isGraphNode(obj)) return;\n     if (seen.has(obj)) return;\n     seen.add(obj);\n     const ownKeys = Reflect.ownKeys(obj);\n@@ -100,7 +114,7 @@ function captureGraph(root) {\n           enumerable: desc.enumerable,\n           configurable: desc.configurable,\n         });\n-        if (desc.value !== null && typeof desc.value === 'object') {\n+        if (isGraphNode(desc.value)) {\n           visit(desc.value, `${path}.${String(k)}`);\n         }\n       } else {\n@@ -127,12 +141,12 @@ function captureGraph(root) {\n \n /**\n  * Vérifie que le graphe accessible depuis root est inchangé par rapport au\n- * snapshot capturé. Pour chaque objet capturé, contrôle : même référence à\n- * chaque emplacement, mêmes clés, mêmes valeurs primitives, mêmes références\n- * pour les valeurs objet, même état de gel, et descripteurs complets identiques\n- * (writable, enumerable, configurable pour les données ; get, set, enumerable,\n- * configurable pour les accesseurs). Vérifie aussi la référence exacte de la\n- * racine.\n+ * snapshot capturé. Pour chaque nœud capturé (objet ou fonction), contrôle :\n+ * même référence à chaque emplacement, mêmes clés, mêmes valeurs primitives,\n+ * mêmes références pour les valeurs objet/fonction, même état de gel, et\n+ * descripteurs complets identiques (writable, enumerable, configurable pour\n+ * les données ; get, set, enumerable, configurable pour les accesseurs).\n+ * Vérifie aussi la référence exacte de la racine.\n  *\n  * @param {object} root\n  * @param {{ snapshots: WeakMap<object, object>, seen: WeakSet<object> }} captured\n@@ -148,7 +162,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n   }\n   const visited = new WeakSet();\n   function visit(obj, expectedObj, path) {\n-    if (obj === null || typeof obj !== 'object') {\n+    if (!isGraphNode(obj)) {\n       if (obj !== expectedObj) {\n         throw new Error(`${path} valeur primitive changée : ${JSON.stringify(expectedObj)} -> ${JSON.stringify(obj)}`);\n       }\n@@ -156,7 +170,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n     }\n     const snap = captured.snapshots.get(obj);\n     if (!snap) {\n-      throw new Error(`${path} objet non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n+      throw new Error(`${path} objet/fonction non présent dans le snapshot initial (référence inconnue ou remplacée)`);\n     }\n     if (visited.has(obj)) return;\n     visited.add(obj);\n@@ -206,7 +220,7 @@ function assertGraphUnchanged(root, captured, rootPath = 'input') {\n       if (desc && desc.configurable !== snapProp.configurable) {\n         throw new Error(`${path}.${String(k)} configurable modifié : ${snapProp.configurable} -> ${desc.configurable}`);\n       }\n-      if (actualV !== null && typeof actualV === 'object') {\n+      if (isGraphNode(actualV)) {\n         visit(actualV, expectedV, `${path}.${String(k)}`);\n       }\n     }\n@@ -825,6 +839,20 @@ runTest('T11 — immutabilité complète : graphe des entrées inchangé, nouvea\n     assertFalse(getterCalled, 'synth5: aucun getter déclenché pendant assertGraphUnchanged');\n   })();\n \n+  // 6. Fonction comme valeur de propriété de données, avec propriété propre\n+  //    imbriquée. La capture traverse la fonction, ses clés propres et ses\n+  //    descripteurs. Une mutation d'une propriété de la fonction est détectée.\n+  (() => {\n+    function fn() { return 1; }\n+    fn.customProp = { nested: 42 };\n+    const obj = { myFn: fn };\n+    const cap = captureGraph(obj);\n+    fn.customProp.nested = 99;\n+    let err = null;\n+    try { assertGraphUnchanged(obj, cap, 'synth'); } catch (e) { err = e; }\n+    assertTrue(err !== null, 'synth6: mutation dans propriété imbriquée de fonction détectée');\n+  })();\n+\n   // Wrapper : référence et état de gel inchangés.\n   assertTrue(input === inputRef, 'wrapper même référence');\n   assertEqual(Object.isFrozen(input), inputFrozenBefore, 'wrapper état de gel inchangé');\n\n==================================================\nDÉCISION FINALE\n==================================================\n\nINCRÉMENT 8 TERMINÉ\n",
  "filePath": "/home/visiteur/increment-8-absolute-final-audit.txt"
}
```

**Output:**
```
Wrote file successfully.
```

---

## Assistant (Build · deepseek-v4-pro · 4.6s)

_Thinking:_

All validations passed, the commit was created successfully, and the audit file has been written. The task is complete.

INCRÉMENT 8 TERMINÉ

Commit `72b3c06` — `test: traverse functions in harmonization input graph`

Modifications dans `src/melody/test-harmonization-planner.js` :
- Ajout du helper `isGraphNode(value)` : traite `object` et `function` comme nœuds récursifs.
- `captureGraph()` et `assertGraphUnchanged()` utilisent `isGraphNode()` au lieu de `typeof === 'object'`.
- T11 : ajout du contrôle synthétique 6 — fonction avec propriété imbriquée, mutation détectée.

Toutes les 13 validations passent (18/18 planificateur, build OK). Audit complet dans `/home/visiteur/increment-8-absolute-final-audit.txt`.

---

