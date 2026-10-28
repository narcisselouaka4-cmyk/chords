# Audit mélodie & réharmonisation Piano Jazz Chords

**Session ID:** ses_02b49dbd2ffeU47nta7KuykrZX
**Created:** 8/6/2026, 3:35:34 AM
**Updated:** 8/6/2026, 3:58:03 AM

---

## User

Tu travailles sur l’application Electron « Piano Jazz Chords ».

MISSION

Réaliser un audit architectural et fonctionnel EN LECTURE SEULE afin de préparer
la nouvelle branche « Mélodie & Réharmonisation » de l’onglet Analyse.

Ne modifie aucun fichier.
Ne crée aucun fichier de production.
Ne lance aucune refonte.
Ne commence aucune implémentation.

Le résultat attendu est un rapport précis, fondé uniquement sur le code réellement
présent dans le dépôt.

==================================================
CONTEXTE PRODUIT
==================================================

L’onglet Analyse devra à terme proposer trois sources :

1. Importer un fichier audio MP3/WAV
2. Importer un fichier vidéo MP4
3. Enregistrer une session au clavier MIDI

Les maquettes déjà validées montrent notamment :

- un écran de sélection de source ;
- une préparation d’analyse audio ;
- une classification des vidéos :
  - Tutoriel pédagogique
  - Cover / Reprise
  - Morceau
  - Démonstration / Autre
- une session d’enregistrement MIDI avec piano-roll ;
- une timeline de mélodie capturée ;
- plusieurs propositions de réharmonisation :
  - Version fidèle
  - Version gospel
  - Version plus tendue
- un clavier virtuel permettant de visualiser les résultats.

Le premier développement concernera la saisie ou la capture MIDI et la
réharmonisation. L’analyse audio/vidéo complète viendra ensuite.

==================================================
PRINCIPES MUSICAUX IMPÉRATIFS
==================================================

La mélodie est prioritaire.

Le système devra à terme distinguer :

- la note mélodique ;
- la note la plus aiguë du voicing ;
- la hauteur MIDI exacte ;
- l’octave ;
- l’attaque ;
- la durée ;
- les notes encore tenues ;
- la basse ;
- les voix intérieures.

Une note mélodique n’est pas obligatoirement la note la plus aiguë.

Le moteur devra séparer :

- symbole d’accord ;
- notes réellement jouées ;
- basse ;
- inversion ;
- qualité ;
- fonction harmonique ;
- voicing ;
- rôle dans la progression.

Le système devra ensuite pouvoir :

- préserver strictement la mélodie ;
- éventuellement imposer la mélodie au soprano ;
- générer des accords candidats ;
- préserver les notes caractéristiques de l’accord ;
- mesurer la conduite des voix ;
- rechercher une progression cohérente sur toute une phrase ;
- produire plusieurs niveaux de tension ;
- générer des voicings jouables ;
- expliquer les résultats sans laisser une IA inventer les notes.

==================================================
SCÉNARIO DE RÉFÉRENCE
==================================================

Ce scénario servira plus tard de test musical, mais ne doit pas être codé en dur :

Tonalité :
A♭ majeur

Accord initial :
Fm7

Accord d’arrivée :
B♭m7

Mélodie exacte :
E♭3 → A♭3 → B♭3 → C4 → E♭4 → F4

Style :
Gospel-jazz

Exemple possible de résultat :
Fm7 → A♭maj7 → D♭6/9 → Cm7 → F7(♭9) → B♭m7

Cette progression est seulement un cas de comparaison, pas une vérité unique.

==================================================
1. CARTOGRAPHIE DU PROJET
==================================================

Identifie :

- framework frontend ;
- architecture Electron ;
- structure renderer / main / preload ;
- gestion d’état ;
- langage et configuration TypeScript éventuelle ;
- tests ;
- build ;
- lint ;
- stockage local ;
- services externes ;
- dépendances musicales ;
- dépendances audio/vidéo ;
- dépendances MIDI.

Fournis une arborescence commentée limitée aux fichiers utiles à cette mission.

==================================================
2. ONGLET ANALYSE ACTUEL
==================================================

Décris précisément :

- composants de l’onglet Analyse ;
- états et sous-vues existants ;
- données affichées ;
- imports actuels ;
- boutons et interactions ;
- code dormant ou placeholders ;
- logique déjà implémentée ;
- logique seulement simulée.

Indique clairement ce qui est réellement fonctionnel et ce qui ne l’est pas.

==================================================
3. ONGLET STUDIO ET IMPORT DES MÉDIAS
==================================================

Localise :

- sélection de fichiers MP3/MP4 ;
- dialogue ou fenêtre demandant le type de média ;
- logique « tutoriel / morceau » actuelle ;
- pipeline utilisé après ce choix ;
- extraction audio éventuelle ;
- métadonnées ;
- détection d’accords ;
- séparation de pistes ;
- appels réseau ou API.

Vérifie pourquoi les choix « tutoriel » et « morceau » produisent actuellement
le même résultat.

Détermine ce qui doit rester dans Studio et ce qui pourrait être réutilisé dans
Analyse.

Ne déplace encore aucun code.

==================================================
4. PIPELINE MIDI
==================================================

Identifie précisément :

- connexion MIDI ;
- écoute note-on / note-off ;
- représentation des notes ;
- conservation des octaves ;
- vélocité ;
- timestamps ;
- tolérance temporelle ;
- notes simultanées ;
- notes maintenues ;
- pédale de sustain éventuelle ;
- canal MIDI ;
- déconnexion/reconnexion ;
- affichage sur le clavier virtuel.

Détermine si le code actuel permet déjà d’enregistrer une vraie session temporelle
ou s’il ne conserve que l’état instantané des touches.

==================================================
5. RECONNAISSANCE D’ACCORDS
==================================================

Identifie :

- moteur de reconnaissance ;
- fichiers principaux ;
- types d’accords pris en charge ;
- gestion des notes manquantes ;
- gestion des doublures ;
- inversion ;
- basse ;
- enharmonie ;
- tonalité ;
- fonction harmonique ;
- shell voicings ;
- accords suspendus ;
- accords diminués ;
- extensions ;
- distinction analyse détaillée / structure harmonique.

Indique les limites connues ou visibles dans les tests.

==================================================
6. GÉNÉRATION DE VOICINGS
==================================================

Identifie :

- générateur actuel ;
- positions simples ou fermées ;
- open voicings ;
- drop 2 / drop 3 éventuels ;
- gestion de la basse ;
- gestion d’une note supérieure ;
- registres ;
- répartition main gauche / main droite ;
- jouabilité ;
- preservation des tierces et septièmes ;
- génération rootless éventuelle.

Vérifie l’existence ou non du travail H1 déjà commencé ou planifié.

==================================================
7. CLAVIER VIRTUEL ET VISUALISATION
==================================================

Détermine :

- comment les notes actives sont transmises ;
- si plusieurs couches visuelles peuvent coexister ;
- si le clavier peut distinguer plus tard :
  - mélodie ;
  - basse ;
  - notes communes ;
  - voix déplacées ;
  - proposition prévisualisée ;
- si une lecture séquentielle ou animation de transition est déjà possible.

==================================================
8. INTÉGRATION IA
==================================================

Localise :

- configuration de la clé API ;
- fournisseur réel ;
- modèle configuré ;
- endpoints ;
- stockage de la clé ;
- exposition éventuelle dans le renderer ;
- appels actuels ;
- formats de sortie ;
- gestion des erreurs ;
- limitations de taille ;
- éventuels prompts existants.

Ne révèle jamais la valeur de la clé.

Détermine comment isoler l’IA dans un rôle d’explication et de classement, sans
lui confier la validation théorique finale.

==================================================
9. MODÈLE DE DONNÉES CIBLE
==================================================

À partir de l’existant, propose les types nécessaires pour représenter :

- MidiNoteEvent ;
- MelodyEvent ;
- HeldNoteState ;
- MelodyPhrase ;
- TonalContext ;
- ReharmonizationConstraints ;
- ChordCandidate ;
- HarmonicFunction ;
- CandidateTransition ;
- VoicingCandidate ;
- ReharmonizationPath ;
- ExplanationPayload.

Pour chaque type :

- champs ;
- unités ;
- optionalité ;
- relation avec les types existants ;
- emplacement recommandé ;
- compatibilité avec l’existant.

Ne produis pas encore le code définitif.

==================================================
10. ALGORITHME CIBLE
==================================================

Propose une architecture déterministe pour :

1. construire la timeline MIDI ;
2. segmenter la mélodie ;
3. générer des accords candidats ;
4. vérifier la présence de la mélodie ;
5. vérifier l’octave exacte ;
6. imposer ou non la mélodie au soprano ;
7. préserver les notes caractéristiques ;
8. calculer la fonction harmonique ;
9. scorer la conduite des voix ;
10. scorer la préparation et la résolution ;
11. rechercher les meilleurs chemins sur toute la phrase ;
12. générer les voicings ;
13. valider une dernière fois les résultats ;
14. produire des données fiables pour l’IA.

Compare succinctement :

- programmation dynamique ;
- beam search ;
- recherche exhaustive limitée ;
- règles gloutonnes.

Recommande la solution la plus adaptée à ce dépôt et au premier MVP.

==================================================
11. RÉUTILISATION OU NOUVELLES DÉPENDANCES
==================================================

Détermine ce qui peut être fait avec les dépendances actuelles.

Évalue notamment si une bibliothèque musicale existante est déjà présente.

Ne propose une nouvelle dépendance que si elle apporte une valeur majeure et
difficile à reproduire.

Pour toute dépendance proposée :

- rôle exact ;
- poids ;
- compatibilité Electron ;
- exécution locale ou processus séparé ;
- coût de maintenance ;
- alternative sans dépendance.

==================================================
12. RISQUES
==================================================

Liste les risques :

- représentation temporelle insuffisante ;
- confusion mélodie / soprano ;
- erreurs enharmoniques ;
- explosion combinatoire ;
- voicings injouables ;
- logique dépendante de l’interface ;
- clé API exposée ;
- blocage du renderer ;
- traitement audio lourd ;
- perte de données MIDI ;
- tests insuffisants ;
- couplage Studio / Analyse.

Classe chaque risque :

- critique ;
- important ;
- modéré.

==================================================
13. PLAN DE DÉVELOPPEMENT
==================================================

Propose des étapes petites et validables.

Chaque étape doit contenir :

- objectif ;
- fichiers ou modules concernés ;
- prérequis ;
- tests ;
- critère d’acceptation ;
- possibilité de rollback ;
- modèle IA de codage recommandé :
  - Claude Code
  - OpenCode / modèle puissant
  - OpenCode / modèle léger.

Le premier incrément doit être le plus petit atome réellement utile.

Ne propose pas d’implémenter tout l’onglet en une seule étape.

==================================================
14. FORMAT DU RAPPORT
==================================================

Rends le rapport dans cet ordre :

A. Résumé exécutif
B. Architecture actuelle
C. Fonctionnalités réellement disponibles
D. Éléments réutilisables
E. Manques critiques
F. Modèle de données recommandé
G. Algorithme recommandé
H. Risques
I. Plan par incréments
J. Répartition Claude Code / OpenCode
K. Questions réellement bloquantes

Toute affirmation sur le dépôt doit citer le chemin du fichier et, si possible,
les fonctions ou composants concernés.

Ne modifie aucun fichier. 

---

## Assistant (Plan · deepseek-v4-pro · 6.8s)

_Thinking:_

The user wants me to perform a comprehensive read-only audit of the "Piano Jazz Chords" Electron application to prepare for a new "Mélodie & Réharmonisation" branch of the Analyse tab. This is a large, multi-section audit. Let me start by exploring the codebase systematically.

Let me begin by understanding the project structure, then dive into each section requested.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "1. Cartographie du projet (structure, dépendances, architecture)",
      "priority": "high",
      "status": "in_progress"
    },
    {
      "content": "2. Audit de l'onglet Analyse actuel",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "3. Audit de l'onglet Studio et import des médias",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "4. Audit du pipeline MIDI",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "5. Audit de la reconnaissance d'accords",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "6. Audit de la génération de voicings",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "7. Audit du clavier virtuel et visualisation",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "8. Audit de l'intégration IA",
      "priority": "high",
      "status": "pending"
    },
    {
      "content": "9. Modèle de données cible",
      "priority": "medium",
      "status": "pending"
    },
    {
      "content": "10. Algorithme cible",
      "priority": "medium",
      "status": "pending"
    },
    {
      "content": "11. Réutilisation ou nouvelles dépendances",
      "priority": "medium",
      "status": "pending"
    },
    {
      "content": "12. Risques",
      "priority": "medium",
      "status": "pending"
    },
    {
      "content": "13. Plan de développement",
      "priority": "medium",
      "status": "pending"
    },
    {
      "content": "14. Rédaction du rapport final",
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
    "content": "1. Cartographie du projet (structure, dépendances, architecture)",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "2. Audit de l'onglet Analyse actuel",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "3. Audit de l'onglet Studio et import des médias",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "4. Audit du pipeline MIDI",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "5. Audit de la reconnaissance d'accords",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "6. Audit de la génération de voicings",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "7. Audit du clavier virtuel et visualisation",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "8. Audit de l'intégration IA",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "9. Modèle de données cible",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "10. Algorithme cible",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "11. Réutilisation ou nouvelles dépendances",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "12. Risques",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "13. Plan de développement",
    "status": "pending",
    "priority": "medium"
  },
  {
    "content": "14. Rédaction du rapport final",
    "status": "pending",
    "priority": "high"
  }
]
```

---

## Assistant (Plan · deepseek-v4-pro · 3.0s)

_Thinking:_

Je vais commencer par explorer la structure du projet en parallèle pour cartographier l'architecture, les dépendances, et les fichiers clés.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords</path>
<type>directory</type>
<entries>
!
.claude/
.clinerules/
.env
.env.example
.git/
.gitignore
.venv/
ANALYSE_QUALITE_413.md
assets/
benchmark_corpus_results.md
benchmark_outputs/
CHANGES.md
CLAUDE.md
COMPARAISON_AB.md
COMPARAISON_PROGRESSIONS.md
COMPARAISON_REELLES.md
corpus_config.json
data/
dist/
docs/
electron-builder.yml
electron/
fusion_params_novr.json
fusion_params.json
launch.sh
node_modules/
output_diagnostic_comparatif_v2.txt
output_diagnostic_comparatif.txt
output_diagnostic.txt
package-lock.json
package.json
PRESENTATION.md
RAPPORT_DIAGNOSTIC.md
REPARTITION.md
screenshots/
scripts/
SESSION.md
src/
test-midi-ports.js
tests/
VISION.md
vite.config.js

(43 entries)
</entries>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/package.json"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/package.json</path>
<type>file</type>
<content>
1: {
2:   "name": "piano-jazz-chords",
3:   "version": "0.1.0",
4:   "description": "Application desktop d'affichage et d'apprentissage des accords jazz en temps réel",
5:   "author": "Claude Code",
6:   "license": "MIT",
7:   "type": "module",
8:   "main": "electron/main.js",
9:   "scripts": {
10:     "dev": "NODE_ENV=development concurrently \"vite\" \"electron .\" -k",
11:     "build": "vite build",
12:     "test:chords": "node src/chord-engine/test-chords.js",
13:     "dist:linux": "npm run build && electron-builder --linux",
14:     "dist:win": "npm run build && electron-builder --win",
15:     "dist:mac": "npm run build && electron-builder --mac"
16:   },
17:   "dependencies": {
18:     "@julusian/midi": "^3.6.1",
19:     "@soundtouchjs/audio-worklet": "^2.0.4",
20:     "soundtouchjs": "^0.3.0"
21:   },
22:   "devDependencies": {
23:     "@tailwindcss/vite": "^4.3.2",
24:     "concurrently": "^9.2.3",
25:     "electron": "^32.0.0",
26:     "electron-builder": "^25.0.5",
27:     "tailwindcss": "^4.3.2",
28:     "vite": "^5.4.0"
29:   }
30: }

(End of file - total 30 lines)
</content>
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "src/**/*",
  "path": "/home/visiteur/piano-jazz-chords"
}
```

**Output:**
```
/home/visiteur/piano-jazz-chords/src/data/movements-library.json
/home/visiteur/piano-jazz-chords/src/style.css
/home/visiteur/piano-jazz-chords/src/analyzer/voice-leading.js
/home/visiteur/piano-jazz-chords/src/virtual-keyboard.js
/home/visiteur/piano-jazz-chords/src/analyzer/test-analysis-export.js
/home/visiteur/piano-jazz-chords/src/note-grouper.js
/home/visiteur/piano-jazz-chords/src/analyzer/analysis-export.js
/home/visiteur/piano-jazz-chords/src/analyzer/analyzer.js
/home/visiteur/piano-jazz-chords/src/analyzer/reharmonizer.js
/home/visiteur/piano-jazz-chords/src/analyzer/test-regression-part1.js
/home/visiteur/piano-jazz-chords/src/analyzer/alternatives.js
/home/visiteur/piano-jazz-chords/src/analyzer/substitutions.js
/home/visiteur/piano-jazz-chords/src/analyzer/test-analysis.js
/home/visiteur/piano-jazz-chords/src/analyzer/audio-analyzer.js
/home/visiteur/piano-jazz-chords/src/analyzer/segmenter.js
/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-utils.js
/home/visiteur/piano-jazz-chords/src/analyzer/chord-timeline.js
/home/visiteur/piano-jazz-chords/src/analyzer/chord-comparator.js
/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-patterns.js
/home/visiteur/piano-jazz-chords/src/analyzer/key-detector.js
/home/visiteur/piano-jazz-chords/src/analyzer/midi-exporter.js
/home/visiteur/piano-jazz-chords/src/analyzer/bass-harmonic-relation.js
/home/visiteur/piano-jazz-chords/src/practice-exercise.js
/home/visiteur/piano-jazz-chords/src/session-manager.js
/home/visiteur/piano-jazz-chords/src/analyzer/scorer.js
/home/visiteur/piano-jazz-chords/src/progressions/parser.js
/home/visiteur/piano-jazz-chords/src/index.html.tailwind-backup
/home/visiteur/piano-jazz-chords/src/voicing-engine/midi-convention.js
/home/visiteur/piano-jazz-chords/src/chord-engine/test-chords.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/hand-ranges.js
/home/visiteur/piano-jazz-chords/src/audio/stem-player.js
/home/visiteur/piano-jazz-chords/src/audio/stem-mixer.js
/home/visiteur/piano-jazz-chords/src/audio/simple-synth.js
/home/visiteur/piano-jazz-chords/src/audio/media-engine.js
/home/visiteur/piano-jazz-chords/src/audio/pitch-shifter.js
/home/visiteur/piano-jazz-chords/src/audio/stem-separator.js
/home/visiteur/piano-jazz-chords/src/audio/simple-player.js
/home/visiteur/piano-jazz-chords/src/chord-engine/index.js
/home/visiteur/piano-jazz-chords/src/chord-engine/chord-display.js
/home/visiteur/piano-jazz-chords/src/chord-engine/chord-defs.js
/home/visiteur/piano-jazz-chords/src/chord-engine/intervals.js
/home/visiteur/piano-jazz-chords/src/chord-engine/voicing.js
/home/visiteur/piano-jazz-chords/src/chord-engine/test-regression-part3.js
/home/visiteur/piano-jazz-chords/src/ui/test-voicing-preview.js
/home/visiteur/piano-jazz-chords/src/chord-engine/naming.js
/home/visiteur/piano-jazz-chords/src/chord-engine/pedagogy.js
/home/visiteur/piano-jazz-chords/src/ui/studio-tab.js
/home/visiteur/piano-jazz-chords/src/ui/test-load-session.js
/home/visiteur/piano-jazz-chords/src/ui/chord-editor.js
/home/visiteur/piano-jazz-chords/src/ui/test-chord-editor.js
/home/visiteur/piano-jazz-chords/src/ui/display.js
/home/visiteur/piano-jazz-chords/src/ui/analyzer-tab.js
/home/visiteur/piano-jazz-chords/src/ui/keyboard-svg.js
/home/visiteur/piano-jazz-chords/src/ui/voicing-preview.js
/home/visiteur/piano-jazz-chords/src/ui/mini-keyboard.js
/home/visiteur/piano-jazz-chords/src/ui/recording-tab.js
/home/visiteur/piano-jazz-chords/src/index.html
/home/visiteur/piano-jazz-chords/src/voicing-engine/test-voicing-phase1.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/test-voicing-phase2.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/data-model.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/constraints.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/generate-voicing.js
/home/visiteur/piano-jazz-chords/src/chord-history.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/test-voicing-phase0.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/vocabulary.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/chord-input.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/candidate-generator.js
/home/visiteur/piano-jazz-chords/src/recorder/serializer.js
/home/visiteur/piano-jazz-chords/src/recorder/recorder.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/corpus-invariants.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/close.js
/home/visiteur/piano-jazz-chords/src/ui/components/design-system.css
/home/visiteur/piano-jazz-chords/src/ui/components/index.js
/home/visiteur/piano-jazz-chords/src/main.js
/home/visiteur/piano-jazz-chords/src/midi-fallback.js
/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/simple.js
/home/visiteur/piano-jazz-chords/src/recorder/player.js
/home/visiteur/piano-jazz-chords/src/recorder/studio-storage.js
/home/visiteur/piano-jazz-chords/src/recorder/test-recorder.js
/home/visiteur/piano-jazz-chords/src/recorder/storage.js
/home/visiteur/piano-jazz-chords/src/recorder/session-manager.js
/home/visiteur/piano-jazz-chords/src/ai/ai-client.js
/home/visiteur/piano-jazz-chords/src/ai/openai-config.js
```

**Tool: glob**

**Input:**
```json
{
  "pattern": "electron/**/*",
  "path": "/home/visiteur/piano-jazz-chords"
}
```

**Output:**
```
/home/visiteur/piano-jazz-chords/electron/audio-processor.py.new
/home/visiteur/piano-jazz-chords/electron/preload.js
/home/visiteur/piano-jazz-chords/electron/preload.cjs
/home/visiteur/piano-jazz-chords/electron/demucs-wrapper.py
/home/visiteur/piano-jazz-chords/electron/main.js
/home/visiteur/piano-jazz-chords/electron/audio-processor.py.regularized
/home/visiteur/piano-jazz-chords/electron/harmony_engine/scoring.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/voicing.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/bass.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/style_profiles.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__init__.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/seventh_scorer.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/candidate.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/structured_v1.py
/home/visiteur/piano-jazz-chords/electron/audio-processor.py.current
/home/visiteur/piano-jazz-chords/electron/audio-processor.py
/home/visiteur/piano-jazz-chords/electron/__pycache__/audio-processor.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/templates.py
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/candidate.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/seventh_scorer.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/style_profiles.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/templates.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/bass.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/voicing.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/scoring.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/structured_v1.cpython-313.pyc
/home/visiteur/piano-jazz-chords/electron/harmony_engine/__pycache__/__init__.cpython-313.pyc
```

---

## Assistant (Plan · deepseek-v4-pro · 3.5s)

_Thinking:_

Let me start by reading the key files to understand the architecture. I'll read multiple files in parallel to build a comprehensive picture.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/main.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/main.js</path>
<type>file</type>
<content>
1: import { generateKeyboard, setPitchWheel, setModWheel } from './ui/keyboard-svg.js';
2: import { updateDisplay, clearDisplay } from './ui/display.js';
3: import { detectChord } from './chord-engine/index.js';
4: import { noteName, formatPc } from './chord-engine/naming.js';
5: 
6: import { initVirtualKeyboard, playVirtualNote, releaseVirtualNote } from './virtual-keyboard.js';
7: import { setSynthMode } from './audio/simple-synth.js';
8: 
9: import { initWebMidi, getWebMidiInputs, openWebMidiInput } from './midi-fallback.js';
10: import { createChordHistory } from './chord-history.js';
11: 
12: import { createNoteGrouper } from './note-grouper.js';
13: import { initAnalyzerTab } from './ui/analyzer-tab.js';
14: import { initStudioTab } from './ui/studio-tab.js';
15: import {
16:   getAIConfig,
17:   saveAIConfig,
18:   testAIConfig,
19:   PRESETS,
20: } from './ai/openai-config.js';
21: import { createPracticeExercise, renderExerciseTarget } from './practice-exercise.js';
22: 
23: const state = {
24:   activeNotes: new Map(), // midi -> velocity
25:   sustainedNotes: new Set(), // midi sustained while pedal down
26:   sustain: false,
27:   currentPitch: 0,
28:   currentMod: 0,
29:   noteStart: 'C0',
30:   noteEnd: 'C9',
31:   notation: 'english',
32:   transpose: 0,
33:   silentMode: false,
34:   rhodesMode: false,
35:   // [Claude] — 2026-07-03 — Couleur active par défaut alignée sur chord-display (#bf3a2b)
36:   colorNote: '#2563eb',
37:   colorTonic: '#111111',
38:   currentChord: null,
39:   // [Claude] — 2026-07-03 — true quand une session est rejouée pour éviter la ré-enregistrement
40:   isPlayback: false,
41:   keyboardCompact: false,
42:   // [OpenCode] — 2026-07-04 — Notes de suggestion affichées sur le clavier principal
43:   suggestionNotes: new Set(),
44: };
45: 
46: let chordHistory = null;
47: let noteGrouper = null;
48: let practiceExercise = null;
49: 
50: // [Claude] — 2026-07-08 — Détection d'accord différée pour ne pas bloquer le thread
51: // principal quand le clavier MIDI envoie beaucoup d'événements. Cela permet au
52: // lecteur audio de l'onglet Analyse de continuer à défiler sans saccade.
53: let chordRefreshTimer = null;
54: function scheduleRefreshChord() {
55:   if (chordRefreshTimer) return;
56:   chordRefreshTimer = setTimeout(() => {
57:     chordRefreshTimer = null;
58:     refreshChord();
59:   }, 80);
60: }
61: 
62: let groupedDetectionTimer = null;
63: let pendingGroupNotes = null;
64: function scheduleGroupedDetection(notes) {
65:   pendingGroupNotes = notes;
66:   if (groupedDetectionTimer) return;
67:   groupedDetectionTimer = setTimeout(() => {
68:     groupedDetectionTimer = null;
69:     const toAnalyze = pendingGroupNotes;
70:     pendingGroupNotes = null;
71:     if (toAnalyze && toAnalyze.length >= 3) {
72:       const result = detectChord(toAnalyze);
73:       updateDisplay(els, result, toAnalyze, state.notation === 'latin');
74:       addToHistory(result);
75:     }
76:   }, 50);
77: }
78: 
79: const els = {
80:   midiSelect: document.getElementById('midi-select'),
81:   midiStatus: document.getElementById('midi-status-text'),
82:   keyboard: document.getElementById('keyboard-container'),
83:   noteStart: document.getElementById('note-start'),
84:   noteEnd: document.getElementById('note-end'),
85:   notation: document.getElementById('notation-select'),
86:   keyboardToggle: document.getElementById('keyboard-toggle'),
87:   keyboardPanel: document.getElementById('keyboard-panel'),
88:   chordName: document.getElementById('chord-name'),
89:   chordDetail: document.getElementById('chord-detail'),
90:   chordMeta: document.getElementById('chord-meta'),
91:   voicingLabel: document.getElementById('voicing-label'),
92:   aliasLabel: document.getElementById('alias-label'),
93:   chordDisplay: document.getElementById('chord-display'),
94:   notesDisplay: document.getElementById('notes-display'),
95:   pedagogy: document.getElementById('pedagogy-content'),
96:   colorNote: document.getElementById('color-note'),
97:   colorTonic: document.getElementById('color-tonic'),
98:   statusBar: document.getElementById('status-bar'),
99: 
100:   midiRefresh: document.getElementById('midi-refresh'),
101:   midiPortCount: document.getElementById('midi-port-count'),
102:   midiPorts: document.getElementById('midi-ports'),
103:   midiLog: document.getElementById('midi-log'),
104:   midiSystem: document.getElementById('midi-system'),
105:   pedagogyPanel: document.getElementById('pedagogy-panel'),
106:   pedagogyToggle: document.getElementById('pedagogy-toggle'),
107:   pedagogyContent: document.getElementById('pedagogy-content'),
108:   pedagogyPanelTab: document.getElementById('pedagogy-panel-tab'),
109:   exercisePanel: document.getElementById('practice-exercise-panel'),
110:   exercisePanelToggle: document.getElementById('exercise-panel-toggle'),
111:   exercisePanelTab: document.getElementById('exercise-panel-tab'),
112:   practiceLayout: document.getElementById('practice-tab'),
113: 
114:   keyboardSize: document.getElementById('keyboard-size'),
115:   transposeInput: document.getElementById('transpose'),
116:   toleranceInput: document.getElementById('tolerance'),
117:   silentMode: document.getElementById('silent-mode'),
118:   rhodesMode: document.getElementById('rhodes-mode'),
119:   midiDiagnosticPanel: document.getElementById('midi-diagnostic-panel'),
120:   midiDiagnosticToggle: document.getElementById('midi-diagnostic-toggle'),
121:   midiDiagnosticContent: document.getElementById('midi-diagnostic-content'),
122:   themeToggle: document.getElementById('theme-toggle'),
123: 
124:   // [Claude] — 2026-07-04 — Paramètres API IA
125:   aiSettingsToggle: document.getElementById('ai-settings-toggle'),
126:   aiSettingsModal: document.getElementById('ai-settings-modal'),
127:   aiPreset: document.getElementById('ai-preset'),
128:   aiBaseUrl: document.getElementById('ai-base-url'),
129:   aiApiKey: document.getElementById('ai-api-key'),
130:   aiModel: document.getElementById('ai-model'),
131:   aiTestBtn: document.getElementById('ai-test-btn'),
132:   aiSaveBtn: document.getElementById('ai-save-btn'),
133:   aiCancelBtn: document.getElementById('ai-cancel-btn'),
134:   aiTestResult: document.getElementById('ai-test-result'),
135: };
136: 
137: function setStatus(message) {
138:   els.statusBar.textContent = message;
139: }
140: 
141: let keyboardResizeObserver = null;
142: 
143: function renderKeyboardAtCurrentSize() {
144:   const rect = els.keyboard.getBoundingClientRect();
145:   const width = Math.max(rect.width, 100);
146:   const height = Math.max(rect.height, 60);
147: 
148:   els.keyboard.innerHTML = generateKeyboard(
149:     state.noteStart,
150:     state.noteEnd,
151:     width,
152:     height,
153:     state.colorNote,
154:     state.colorTonic,
155:     state.notation === 'latin',
156:   );
157:   applyActiveNotes();
158:   initVirtualKeyboard({
159:     onNoteOn: (note, velocity = 0.8) => handleNoteOn(note, velocity, true, true),
160:     onNoteOff: (note) => handleNoteOff(note, true, true),
161:   });
162: }
163: 
164: function initKeyboardToggle() {
165:   if (!els.keyboardToggle || !els.keyboardPanel) return;
166:   els.keyboardToggle.addEventListener('click', () => {
167:     state.keyboardCompact = !state.keyboardCompact;
168:     applyKeyboardCompact();
169:     refreshKeyboard();
170:   });
171:   applyKeyboardCompact();
172: }
173: 
174: function applyKeyboardCompact() {
175:   if (!els.keyboardPanel || !els.keyboardToggle) return;
176:   if (state.keyboardCompact) {
177:     els.keyboardPanel.classList.add('keyboard-compact');
178:     els.keyboardToggle.textContent = '[v]';
179:     els.keyboardToggle.title = 'Développer le clavier';
180:   } else {
181:     els.keyboardPanel.classList.remove('keyboard-compact');
182:     els.keyboardToggle.textContent = '[^]';
183:     els.keyboardToggle.title = 'Réduire le clavier';
184:   }
185: }
186: 
187: function refreshKeyboard() {
188:   renderKeyboardAtCurrentSize();
189: 
190:   if (!keyboardResizeObserver) {
191:     keyboardResizeObserver = new ResizeObserver(() => {
192:       renderKeyboardAtCurrentSize();
193:     });
194:     keyboardResizeObserver.observe(els.keyboard);
195:   }
196: }
197: 
198: function applyActiveNotes() {
199:   for (const midi of state.activeNotes.keys()) {
200:     highlightKey(midi, 'active');
201:   }
202:   for (const midi of state.sustainedNotes) {
203:     highlightKey(midi, 'active');
204:   }
205:   for (const midi of state.suggestionNotes) {
206:     highlightKey(midi, 'active');
207:   }
208: }
209: 
210: let suggestionReleaseTimer = null;
211: 
212: function handleSuggestionPlay(action, notes, name) {
213:   if (action === 'clear' || action === 'play') {
214:     if (suggestionReleaseTimer) {
215:       clearTimeout(suggestionReleaseTimer);
216:       suggestionReleaseTimer = null;
217:     }
218:     for (const n of state.suggestionNotes) {
219:       unhighlightKey(n, 'active');
220:       releaseVirtualNote(n);
221:     }
222:     state.suggestionNotes.clear();
223:   }
224:   if (action === 'play' && notes && notes.length > 0) {
225:     for (const note of notes) {
226:       playVirtualNote(note, 0.78);
227:       highlightKey(note, 'active');
228:     }
229:     state.suggestionNotes = new Set(notes);
230:     if (name && els.chordName) els.chordName.textContent = name;
231:     if (els.chordDetail) {
232:       const names = notes.map((n) => formatNoteForDisplay(n % 12)).join(' — ');
233:       els.chordDetail.textContent = names;
234:     }
235:     if (els.voicingLabel) els.voicingLabel.style.display = 'none';
236:     if (els.aliasLabel) els.aliasLabel.style.display = 'none';
237:     // Auto-release apres 3 secondes (sans effacer l'affichage)
238:     suggestionReleaseTimer = setTimeout(() => {
239:       for (const n of state.suggestionNotes) {
240:         releaseVirtualNote(n);
241:       }
242:       suggestionReleaseTimer = null;
243:     }, 3000);
244:   }
245: }
246: 
247: function highlightKey(midi, className) {
248:   const key = document.getElementById(`note-${midi}`);
249:   if (key) key.classList.add(className);
250: }
251: 
252: function unhighlightKey(midi, className = 'active') {
253:   const key = document.getElementById(`note-${midi}`);
254:   if (key) key.classList.remove(className);
255: }
256: 
257: function getAllActivePcs() {
258:   const all = new Set([...state.activeNotes.keys(), ...state.sustainedNotes]);
259:   return Array.from(all).sort((a, b) => a - b);
260: }
261: 
262: function refreshChord() {
263:   const notes = getAllActivePcs();
264:   if (notes.length === 0) {
265:     clearDisplay(els);
266:     state.currentChord = null;
267:     return;
268:   }
269: 
270:   const result = detectChord(notes);
271:   state.currentChord = result;
272:   updateDisplay(els, result, notes, state.notation === 'latin');
273:   addToHistory(result);
274: 
275:   // Vérification de l'exercice rapide si un accord valide est détecté
276:   if (result && result.notes.length >= 3 && result.symbol !== '?') {
277:     checkPracticeExercise(result.notes);
278:   }
279: }
280: 
281: function addToHistory(result) {
282:   if (!result || !chordHistory) return;
283: 
284:   // Ignore single notes, two-note clusters, and unidentified chords
285:   if (result.notes.length < 3 || result.symbol === '?') return;
286: 
287:   const last = chordHistory.getAll()[0];
288:   const name = formatChordResult(result);
289: 
290:   if (last && last.name === name) return;
291: 
292:   chordHistory.add({
293:     name,
294:     display: name,
295:     result,
296:     notes: [...result.notes],
297:     timestamp: Date.now(),
298:   });
299: }
300: 
301: function formatNoteForDisplay(pc) {
302:   return formatPc(pc, state.notation === 'latin');
303: }
304: 
305: function formatChordResult(result) {
306:   if (!result) return '?';
307:   if (result.rootless) return `${formatNoteForDisplay(result.rootPc)}${result.symbol}`;
308:   if (result.isSlash) return `${formatNoteForDisplay(result.rootPc)}${result.symbol}/${formatNoteForDisplay(result.bassPc)}`;
309:   return `${formatNoteForDisplay(result.rootPc)}${result.symbol}`;
310: }
311: 
312: // [Claude] — 2026-07-03 — Transposition appliquée aux notes actives pour l'affichage, la détection et le son
313: function transposeNote(note) {
314:   return note + state.transpose;
315: }
316: 
317: function isPlayableMidi(note) {
318:   return Number.isFinite(note) && Number.isInteger(note) && note >= 0 && note <= 127;
319: }
320: 
321: function handleNoteOn(note, velocity = 0.8, virtual = false, audible = true) {
322:   if (!isPlayableMidi(note)) {
323:     console.warn('[Main] noteOn MIDI invalide ignorée:', note);
324:     return;
325:   }
326:   const transposed = transposeNote(note);
327:   if (!isPlayableMidi(transposed)) {
328:     console.warn('[Main] noteOn transposée invalide ignorée:', transposed);
329:     return;
330:   }
331:   // Auto-clear suggestion notes when user plays real MIDI
332:   if (!state.isPlayback && state.suggestionNotes.size > 0) {
333:     for (const n of state.suggestionNotes) {
334:       unhighlightKey(n, 'active');
335:       releaseVirtualNote(n);
336:     }
337:     state.suggestionNotes.clear();
338:   }
339:   const safeVelocity = Number.isFinite(velocity) && velocity >= 0 && velocity <= 1 ? velocity : 0.8;
340:   if (audible && !state.silentMode) playVirtualNote(transposed, safeVelocity);
341:   state.activeNotes.set(transposed, safeVelocity);
342:   highlightKey(transposed, 'active');
343:   noteGrouper?.noteOn(transposed, velocity);
344:   // La détection est différée pour ne pas bloquer le thread principal
345:   // (lecture audio / défilement de l'onglet Analyse).
346:   scheduleRefreshChord();
347: }
348: 
349: // [Claude] — 2026-07-03 — Gestion des grace notes : une note relâchée est retirée du groupement temporel sauf si la pédale de sustain est active.
350: function handleNoteOff(note, virtual = false, audible = true) {
351:   if (!isPlayableMidi(note)) {
352:     console.warn('[Main] noteOff MIDI invalide ignorée:', note);
353:     return;
354:   }
355:   const transposed = transposeNote(note);
356:   if (!isPlayableMidi(transposed)) {
357:     console.warn('[Main] noteOff transposée invalide ignorée:', transposed);
358:     return;
359:   }
360:   if (audible) releaseVirtualNote(transposed);
361:   if (state.sustain) {
362:     state.sustainedNotes.add(transposed);
363:     noteGrouper?.noteOff(transposed, { sustained: true });
364:     return;
365:   }
366:   state.activeNotes.delete(transposed);
367:   unhighlightKey(transposed, 'active');
368:   noteGrouper?.noteOff(transposed, { sustained: false });
369:   scheduleRefreshChord();
370: }
371: 
372: function handleSustain(value) {
373:   state.sustain = value;
374:   if (!value) {
375:     for (const note of state.sustainedNotes) {
376:       if (!state.activeNotes.has(note)) {
377:         unhighlightKey(note, 'active');
378:       }
379:     }
380:     state.sustainedNotes.clear();
381:     scheduleRefreshChord();
382:   }
383: }
384: 
385: function handlePitchWheel(value) {
386:   state.currentPitch = value;
387:   setPitchWheel(value);
388: }
389: 
390: function handleModWheel(value) {
391:   state.currentMod = value;
392:   setModWheel(value);
393: }
394: 
395: function logMidiEvent(event) {
396:   if (!els.midiLog) return;
397:   const entry = document.createElement('div');
398:   entry.className = 'midi-log-entry';
399:   const time = new Date(event.time).toLocaleTimeString('fr-FR', { hour12: false });
400: 
401:   switch (event.type) {
402:     case 'scan':
403:       entry.textContent = `[${time}] Scan: ${event.data.count} port(s)`;
404:       break;
405:     case 'port':
406:       entry.textContent = `[${time}] Port ${event.data.id}: ${event.data.name}`;
407:       break;
408:     case 'open':
409:       entry.textContent = `[${time}] Ouverture port ${event.data.portId}`;
410:       break;
411:     case 'message':
412:       const { cmd, channel, data1, data2 } = event.data;
413:       let msg = `[${time}] ch=${channel} cmd=${cmd} note=${data1} vel=${data2}`;
414:       if (cmd === 9 && data2 > 0) msg += ' NOTE ON';
415:       if (cmd === 8 || (cmd === 9 && data2 === 0)) msg += ' NOTE OFF';
416:       entry.textContent = msg;
417:       break;
418:     default:
419:       entry.textContent = `[${time}] ${event.type}: ${JSON.stringify(event.data)}`;
420:   }
421: 
422:   els.midiLog.prepend(entry);
423:   while (els.midiLog.children.length > 50) {
424:     els.midiLog.lastChild.remove();
425:   }
426: }
427: 
428: async function loadSystemInfo() {
429:   try {
430:     if (window.electronAPI?.system?.getAudioGroups) {
431:       const info = await window.electronAPI.system.getAudioGroups();
432:       const status = info.inAudio
433:         ? '✅ Utilisateur dans le groupe audio'
434:         : '⚠️ Utilisateur NON dans le groupe audio (peut bloquer le MIDI)';
435:       els.midiSystem.innerHTML = `<div>${status}</div><div>Utilisateur: ${info.username}</div>`;
436:     }
437:   } catch (e) {
438:     console.error('System info error:', e);
439:   }
440: }
441: 
442: // [OpenCode] — 2026-07-04 — Gestion unifiée et robuste des ports MIDI.
443: let currentMidiName = null;
444: 
445: const PREFERRED_MIDI_KEYWORDS = ['usb', 'piano', 'keyboard', 'mpk', 'midi', 'key', 'synth', 'controller'];
446: const VIRTUAL_PORT_NAMES = ['midi through', 'through', 'virmidi', 'timidity', 'fluidsynth', 'pipewire'];
447: 
448: function isHardwareInput(input) {
449:   const lower = input.name.toLowerCase();
450:   return !VIRTUAL_PORT_NAMES.some((v) => lower.includes(v));
451: }
452: 
453: function findPreferredInput(inputs) {
454:   const hardware = inputs.filter(isHardwareInput);
455:   for (const keyword of PREFERRED_MIDI_KEYWORDS) {
456:     const found = hardware.find((i) => i.name.toLowerCase().includes(keyword));
457:     if (found) return found;
458:   }
459:   return hardware[0] || inputs[0] || null;
460: }
461: 
462: function populateMidiSelect(inputs, onChange) {
463:   const previousValue = els.midiSelect.value;
464:   els.midiSelect.innerHTML = '';
465:   els.midiPorts.innerHTML = '';
466: 
467:   if (els.midiPortCount) els.midiPortCount.textContent = `(${inputs.length})`;
468:   if (inputs.length === 0) {
469:     els.midiStatus.textContent = 'Aucun périphérique';
470:     els.midiPorts.textContent = 'Aucun port MIDI trouvé';
471:     return;
472:   }
473: 
474:   inputs.forEach((input) => {
475:     const opt = document.createElement('option');
476:     opt.value = input.id;
477:     opt.textContent = input.name;
478:     els.midiSelect.appendChild(opt);
479:   });
480: 
481:   els.midiPorts.innerHTML = inputs.map((i) => `<div>[${i.id}] ${i.name}</div>`).join('');
482: 
483:   const stillAvailable = Array.from(els.midiSelect.options).some((o) => o.value === previousValue);
484:   if (stillAvailable) {
485:     els.midiSelect.value = previousValue;
486:   }
487: 
488:   els.midiSelect.onchange = () => onChange(Number(els.midiSelect.value));
489: }
490: 
491: async function tryOpenMidi(portId, inputs) {
492:   const input = inputs.find((i) => i.id === portId);
493:   const name = input?.name || '';
494:   const result = await window.electronAPI.midi.openInput(portId);
495:   if (result?.success) {
496:     currentMidiName = result.name || name;
497:     els.midiStatus.textContent = 'Connecté';
498:     els.midiSelect.value = String(result.portId || portId);
499:     setStatus(`MIDI connecté : ${currentMidiName}`);
500:   } else {
501:     console.error('[MIDI] openInput failed:', result?.error || result);
502:     setStatus(`Échec connexion MIDI : ${result?.error || 'inconnu'}`);
503:   }
504:   return result;
505: }
506: 
507: async function initMidi() {
508:   await loadSystemInfo();
509:   const callbacks = {
510:     onNoteOn: (data) => handleNoteOn(data.note, data.velocity, false, true),
511:     onNoteOff: (data) => handleNoteOff(data.note, false, true),
512:     onSustain: (data) => handleSustain(data.value),
513:     onPitchWheel: (data) => handlePitchWheel(data.value),
514:     onModWheel: (data) => handleModWheel(data.value),
515:     onMidiLog: (data) => logMidiEvent(data),
516:   };
517: 
518:   if (!window.electronAPI?.midi) {
519:     const webMidi = await initWebMidi({ ...callbacks, onStateChange: handleWebMidiStateChange });
520:     if (webMidi.available) {
521:       updateMidiList(webMidi.inputs, callbacks, true);
522:       setStatus(webMidi.inputs.length > 0 ? 'MIDI Web prêt' : 'MIDI Web actif — aucun périphérique');
523:     } else {
524:       els.midiStatus.textContent = 'Non disponible';
525:       setStatus(webMidi.error || 'MIDI non disponible');
526:     }
527:     return;
528:   }
529: 
530:   window.electronAPI.midi.onNoteOn(callbacks.onNoteOn);
531:   window.electronAPI.midi.onNoteOff(callbacks.onNoteOff);
532:   window.electronAPI.midi.onSustain(callbacks.onSustain);
533:   window.electronAPI.midi.onPitchWheel(callbacks.onPitchWheel);
534:   window.electronAPI.midi.onModWheel(callbacks.onModWheel);
535:   window.electronAPI.midi.onMidiLog(callbacks.onMidiLog);
536: 
537:   window.electronAPI.midi.onDeviceConnected?.((event) => {
538:     currentMidiName = event.name;
539:     els.midiStatus.textContent = 'Connecté';
540:     if (els.midiSelect.value !== String(event.portId)) {
541:       els.midiSelect.value = String(event.portId);
542:     }
543:     setStatus(`MIDI connecté : ${event.name}`);
544:     logMidiEvent({ type: 'connected', data: event, time: Date.now() });
545:   });
546: 
547:   window.electronAPI.midi.onPortLost?.((event) => {
548:     currentMidiName = null;
549:     logMidiEvent({ type: 'port-lost', data: event, time: Date.now() });
550:     els.midiStatus.textContent = 'Périphérique perdu';
551:     setStatus('Périphérique MIDI débranché');
552:   });
553: 
554:   window.electronAPI.midi.onDevicesChanged?.((inputs) => {
555:     logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
556:     inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));
557: 
558:     populateMidiSelect(inputs, async (portId) => {
559:       await tryOpenMidi(portId, inputs);
560:     });
561: 
562:     const wasEmpty = els.midiSelect.dataset.lastCount === '0';
563:     els.midiSelect.dataset.lastCount = String(inputs.length);
564: 
565:     const previousValue = els.midiSelect.value;
566:     const previousStillAvailable = inputs.some((i) => String(i.id) === previousValue);
567: 
568:     if ((!previousStillAvailable || wasEmpty) && inputs.length > 0) {
569:       const preferred = findPreferredInput(inputs);
570:       if (preferred) {
571:         tryOpenMidi(preferred.id, inputs);
572:       }
573:     }
574:   });
575: 
576:   els.midiSelect.addEventListener('change', async () => {
577:     const portId = Number(els.midiSelect.value);
578:     const inputs = await window.electronAPI.midi.getInputs();
579:     await tryOpenMidi(portId, inputs);
580:   });
581: 
582:   els.midiRefresh?.addEventListener('click', async () => {
583:     const refreshed = await window.electronAPI.midi.refreshInputs();
584:     populateMidiSelect(refreshed, async (portId) => {
585:       await tryOpenMidi(portId, refreshed);
586:     });
587:     const preferred = findPreferredInput(refreshed);
588:     if (preferred) {
589:       await tryOpenMidi(preferred.id, refreshed);
590:     }
591:   });
592: 
593:   const inputs = await window.electronAPI.midi.getInputs();
594:   els.midiSelect.dataset.lastCount = String(inputs.length);
595:   logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
596:   inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));
597: 
598:   populateMidiSelect(inputs, async (portId) => {
599:     await tryOpenMidi(portId, inputs);
600:   });
601: 
602:   const preferred = findPreferredInput(inputs);
603:   if (preferred) {
604:     await tryOpenMidi(preferred.id, inputs);
605:   }
606: }
607: 
608: function handleWebMidiStateChange(inputs) {
609:   const callbacks = {
610:     onNoteOn: (data) => handleNoteOn(data.note, data.velocity, false, true),
611:     onNoteOff: (data) => handleNoteOff(data.note, false, true),
612:     onSustain: (data) => handleSustain(data.value),
613:     onPitchWheel: (data) => handlePitchWheel(data.value),
614:     onModWheel: (data) => handleModWheel(data.value),
615:   };
616:   updateMidiList(inputs, callbacks, true);
617: }
618: 
619: function updateMidiList(inputs, callbacks, isWeb) {
620:   logMidiEvent({ type: 'scan', data: { count: inputs.length }, time: Date.now() });
621:   inputs.forEach((input) => logMidiEvent({ type: 'port', data: { id: input.id, name: input.name }, time: Date.now() }));
622: 
623:   populateMidiSelect(inputs, async (portId) => {
624:     openWebMidiInput(portId, callbacks);
625:     els.midiStatus.textContent = 'Connecté (Web MIDI)';
626:     const name = els.midiSelect.options[els.midiSelect.selectedIndex]?.text || 'Web MIDI';
627:     setStatus(`MIDI connecté : ${name}`);
628:   });
629: 
630:   const preferred = findPreferredInput(inputs);
631:   if (preferred) {
632:     els.midiSelect.value = preferred.id;
633:     openWebMidiInput(preferred.id, callbacks);
634:     els.midiStatus.textContent = 'Connecté (Web MIDI)';
635:     setStatus(`MIDI connecté : ${preferred.name}`);
636:   }
637: }
638: 
639: const KEYBOARD_PRESETS = {
640:   '25': { start: 'C3', end: 'C5' },
641:   '49': { start: 'C2', end: 'C6' },
642:   '61': { start: 'C2', end: 'C7' },
643:   '76': { start: 'E1', end: 'G7' },
644:   '88': { start: 'A0', end: 'C8' },
645:   'midi': { start: 'C0', end: 'C9' },
646:   'custom': null,
647: };
648: 
649: function applyKeyboardPreset(size) {
650:   const preset = KEYBOARD_PRESETS[size];
651:   if (!preset) return;
652:   state.noteStart = preset.start;
653:   state.noteEnd = preset.end;
654:   els.noteStart.value = preset.start;
655:   els.noteEnd.value = preset.end;
656:   refreshKeyboard();
657: }
658: 
659: function initSettings() {
660:   els.noteStart.value = state.noteStart;
661:   els.noteEnd.value = state.noteEnd;
662:   els.keyboardSize.value = 'midi';
663:   els.notation.value = state.notation || 'english';
664:   els.colorNote.value = state.colorNote;
665:   els.colorTonic.value = state.colorTonic;
666:   els.transposeInput.value = state.transpose;
667:   // [Claude] — 2026-07-07 — Forcer le checkbox Silencieux à décoché au démarrage
668:   // pour éviter que le clavier MIDI virtuel soit muet par défaut.
669:   state.silentMode = false;
670:   els.silentMode.checked = false;
671:   els.rhodesMode.checked = state.rhodesMode;
672: 
673:   const update = () => {
674:     const previousTranspose = state.transpose;
675:     state.noteStart = els.noteStart.value || 'C0';
676:     state.noteEnd = els.noteEnd.value || 'C9';
677:     state.notation = els.notation.value || 'english';
678:     state.transpose = Number(els.transposeInput.value) || 0;
679:     state.silentMode = els.silentMode.checked;
680:     state.colorNote = els.colorNote.value;
681:     state.colorTonic = els.colorTonic.value;
682: 
683:     // [Claude] — 2026-07-03 — Retransposer les notes actives quand le réglage de transposition change
684:     const transposeDelta = state.transpose - previousTranspose;
685:     if (transposeDelta !== 0) {
686:       const newActiveNotes = new Map();
687:       for (const [midi, velocity] of state.activeNotes) {
688:         newActiveNotes.set(midi + transposeDelta, velocity);
689:       }
690:       state.activeNotes = newActiveNotes;
691: 
692:       const newSustainedNotes = new Set();
693:       for (const midi of state.sustainedNotes) {
694:         newSustainedNotes.add(midi + transposeDelta);
695:       }
696:       state.sustainedNotes = newSustainedNotes;
697:     }
698: 
699:     // [Claude] — 2026-07-03 — Mise à jour dynamique de la tolérance de groupement
700:     const toleranceMs = Number(els.toleranceInput?.value) || 200;
701:     noteGrouper?.setTolerance(toleranceMs);
702: 
703:     refreshKeyboard();
704:     refreshChord();
705:   };
706: 
707:   els.noteStart.addEventListener('change', () => {
708:     els.keyboardSize.value = 'custom';
709:     update();
710:   });
711:   els.noteEnd.addEventListener('change', () => {
712:     els.keyboardSize.value = 'custom';
713:     update();
714:   });
715:   els.notation.addEventListener('change', () => {
716:     update();
717:   });
718:   els.transposeInput.addEventListener('change', update);
719:   els.toleranceInput?.addEventListener('change', update);
720:   els.silentMode.addEventListener('change', update);
721:   els.rhodesMode.addEventListener('change', () => {
722:     state.rhodesMode = els.rhodesMode.checked;
723:     setSynthMode(state.rhodesMode ? 'rhodes' : 'piano');
724:   });
725:   els.colorNote.addEventListener('input', update);
726:   els.colorTonic.addEventListener('input', update);
727: 
728:   els.keyboardSize?.addEventListener('change', () => {
729:     applyKeyboardPreset(els.keyboardSize.value);
730:   });
731: }
732: 
733: function initPanelToggles() {
734:   const LEFT_COLLAPSED_CLASS = 'practice-left-collapsed';
735:   const RIGHT_COLLAPSED_CLASS = 'practice-right-collapsed';
736: 
737:   function applyPedagogyCollapsed(collapsed) {
738:     if (!els.practiceLayout) return;
739:     if (collapsed) {
740:       els.practiceLayout.classList.add(RIGHT_COLLAPSED_CLASS);
741:     } else {
742:       els.practiceLayout.classList.remove(RIGHT_COLLAPSED_CLASS);
743:     }
744:     if (els.pedagogyToggle) {
745:       els.pedagogyToggle.textContent = collapsed ? '+' : '−';
746:       els.pedagogyToggle.title = collapsed ? 'Afficher les techniques' : 'Masquer les techniques';
747:       els.pedagogyToggle.setAttribute('aria-expanded', String(!collapsed));
748:     }
749:     if (els.pedagogyPanelTab) {
750:       els.pedagogyPanelTab.style.display = collapsed ? 'flex' : 'none';
751:       els.pedagogyPanelTab.setAttribute('aria-expanded', String(collapsed));
752:     }
753:   }
754: 
755:   function applyExerciseCollapsed(collapsed) {
756:     if (!els.practiceLayout) return;
757:     if (collapsed) {
758:       els.practiceLayout.classList.add(LEFT_COLLAPSED_CLASS);
759:     } else {
760:       els.practiceLayout.classList.remove(LEFT_COLLAPSED_CLASS);
761:     }
762:     if (els.exercisePanelToggle) {
763:       els.exercisePanelToggle.textContent = collapsed ? '+' : '−';
764:       els.exercisePanelToggle.title = collapsed ? 'Développer Exercice rapide' : 'Réduire le panneau Exercice rapide';
765:       els.exercisePanelToggle.setAttribute('aria-expanded', String(!collapsed));
766:     }
767:     if (els.exercisePanelTab) {
768:       els.exercisePanelTab.style.display = collapsed ? 'flex' : 'none';
769:       els.exercisePanelTab.setAttribute('aria-expanded', String(collapsed));
770:     }
771:   }
772: 
773:   // Pedagogy panel: starts visible, can be collapsed
774:   const pedagogyCollapsed = localStorage.getItem('pedagogy-collapsed') === 'true';
775:   applyPedagogyCollapsed(pedagogyCollapsed);
776: 
777:   els.pedagogyToggle?.addEventListener('click', () => {
778:     const collapsed = !els.practiceLayout?.classList.contains(RIGHT_COLLAPSED_CLASS);
779:     applyPedagogyCollapsed(collapsed);
780:     localStorage.setItem('pedagogy-collapsed', String(collapsed));
781:   });
782: 
783:   els.pedagogyPanelTab?.addEventListener('click', () => {
784:     applyPedagogyCollapsed(false);
785:     localStorage.setItem('pedagogy-collapsed', 'false');
786:   });
787: 
788:   // Exercise panel: starts visible, can be collapsed
789:   const exerciseCollapsed = localStorage.getItem('exercise-collapsed') === 'true';
790:   applyExerciseCollapsed(exerciseCollapsed);
791: 
792:   els.exercisePanelToggle?.addEventListener('click', () => {
793:     const collapsed = !els.practiceLayout?.classList.contains(LEFT_COLLAPSED_CLASS);
794:     applyExerciseCollapsed(collapsed);
795:     localStorage.setItem('exercise-collapsed', String(collapsed));
796:   });
797: 
798:   els.exercisePanelTab?.addEventListener('click', () => {
799:     applyExerciseCollapsed(false);
800:     localStorage.setItem('exercise-collapsed', 'false');
801:   });
802: 
803:   // MIDI diagnostic panel: starts hidden
804:   els.midiDiagnosticToggle?.addEventListener('click', () => {
805:     const isHidden = els.midiDiagnosticContent.style.display === 'none';
806:     els.midiDiagnosticContent.style.display = isHidden ? '' : 'none';
807:     els.midiDiagnosticPanel.style.display = '';
808:     els.midiDiagnosticToggle.textContent = isHidden ? '−' : '+';
809:     els.midiDiagnosticToggle.title = isHidden ? 'Masquer le diagnostic MIDI' : 'Afficher le diagnostic MIDI';
810:   });
811: }
812: 
813: function initTheme() {
814:   const saved = localStorage.getItem('theme') || 'light';
815:   document.body.setAttribute('data-theme', saved);
816:   updateThemeIcon(saved);
817: 
818:   els.themeToggle?.addEventListener('click', () => {
819:     const current = document.body.getAttribute('data-theme') || 'light';
820:     const next = current === 'light' ? 'dark' : 'light';
821:     document.body.setAttribute('data-theme', next);
822:     localStorage.setItem('theme', next);
823:     updateThemeIcon(next);
824:   });
825: }
826: 
827: function updateThemeIcon(theme) {
828:   if (els.themeToggle) {
829:     els.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
830:     els.themeToggle.title = theme === 'light' ? 'Passer au mode sombre' : 'Passer au mode clair';
831:   }
832: }
833: 
834: function initNoteGrouper() {
835:   noteGrouper = createNoteGrouper({
836:     toleranceMs: Number(els.toleranceInput?.value) || 200,
837:     onGroupReady: (group) => {
838:       // Re-evaluate chord after grouping window closes, en différé pour ne pas
839:       // bloquer l'animation / le lecteur audio.
840:       const notes = group.map((n) => n.note);
841:       const unique = Array.from(new Set(notes)).sort((a, b) => a - b);
842:       if (unique.length >= 3) {
843:         scheduleGroupedDetection(unique);
844:       }
845:     },
846:   });
847: }
848: 
849: function initHistory() {
850:   chordHistory = createChordHistory(() => {});
851: }
852: 
853: // [Claude] — 2026-07-07 — Initialisation du panneau d'exercice rapide
854: function initPracticeExercise() {
855:   const panel = document.getElementById('practice-exercise-panel');
856:   if (!panel) return;
857: 
858:   const modeButtons = panel.querySelectorAll('.exercise-mode-btn');
859:   const newBtn = document.getElementById('new-exercise-btn');
860:   const targetDiv = document.getElementById('exercise-target');
861:   const feedbackDiv = document.getElementById('exercise-feedback');
862: 
863:   practiceExercise = createPracticeExercise();
864: 
865:   function render() {
866:     const exState = practiceExercise.getState();
867:     targetDiv.style.display = exState.target ? 'flex' : 'none';
868:     if (exState.target) {
869:       targetDiv.innerHTML = renderExerciseTarget(exState.target);
870:     }
871:   }
872: 
873:   modeButtons.forEach((btn) => {
874:     btn.addEventListener('click', () => {
875:       modeButtons.forEach((b) => b.classList.remove('active'));
876:       btn.classList.add('active');
877:       practiceExercise.setMode(btn.dataset.mode);
878:       feedbackDiv.textContent = '';
879:       render();
880:     });
881:   });
882: 
883:   newBtn?.addEventListener('click', () => {
884:     practiceExercise.next();
885:     feedbackDiv.textContent = '';
886:     render();
887:   });
888: 
889:   // Premier exercice au démarrage
890:   practiceExercise.next();
891:   render();
892: }
893: 
894: function checkPracticeExercise(notes) {
895:   if (!practiceExercise) return;
896:   const result = practiceExercise.check(notes);
897:   const feedbackDiv = document.getElementById('exercise-feedback');
898:   if (feedbackDiv) {
899:     feedbackDiv.textContent = result.message;
900:     feedbackDiv.className = `exercise-feedback ${result.success ? 'success' : 'error'}`;
901:   }
902:   if (result.success) {
903:     const targetDiv = document.getElementById('exercise-target');
904:     const exState = practiceExercise.getState();
905:     targetDiv.innerHTML = renderExerciseTarget(exState.target);
906:   }
907: }
908: 
909: // [Claude] — 2026-07-04 — Initialisation du panneau de configuration API IA
910: function initAISettings() {
911:   const modal = els.aiSettingsModal;
912:   if (!modal) return;
913: 
914:   function loadConfigIntoUI() {
915:     const cfg = getAIConfig();
916:     if (els.aiBaseUrl) els.aiBaseUrl.value = cfg.baseUrl;
917:     if (els.aiApiKey) els.aiApiKey.value = cfg.apiKey;
918:     if (els.aiModel) els.aiModel.value = cfg.model;
919:     if (els.aiPreset) els.aiPreset.value = '';
920:     if (els.aiTestResult) {
921:       els.aiTestResult.textContent = '';
922:       els.aiTestResult.className = 'ai-test-result';
923:     }
924:   }
925: 
926:   function gatherConfigFromUI() {
927:     return {
928:       baseUrl: els.aiBaseUrl?.value || '',
929:       apiKey: els.aiApiKey?.value || '',
930:       model: els.aiModel?.value || '',
931:     };
932:   }
933: 
934:   els.aiSettingsToggle?.addEventListener('click', () => {
935:     loadConfigIntoUI();
936:     modal.style.display = 'flex';
937:   });
938: 
939:   els.aiCancelBtn?.addEventListener('click', () => {
940:     modal.style.display = 'none';
941:   });
942: 
943:   modal.addEventListener('click', (e) => {
944:     if (e.target === modal) modal.style.display = 'none';
945:   });
946: 
947:   els.aiPreset?.addEventListener('change', () => {
948:     const key = els.aiPreset.value;
949:     const preset = PRESETS.find((p) => {
950:       if (key === 'groq' && p.name.includes('Groq')) return true;
951:       if (key === 'openrouter' && p.name.includes('OpenRouter')) return true;
952:       if (key === 'gemini' && p.name.includes('Google AI Studio')) return true;
953:       return false;
954:     });
955:     if (preset) {
956:       if (els.aiBaseUrl) els.aiBaseUrl.value = preset.baseUrl;
957:       if (els.aiModel) els.aiModel.value = preset.models[0] || '';
958:     }
959:   });
960: 
961:   els.aiTestBtn?.addEventListener('click', async () => {
962:     if (!els.aiTestResult) return;
963:     els.aiTestResult.textContent = 'Test en cours…';
964:     els.aiTestResult.className = 'ai-test-result';
965:     try {
966:       await testAIConfig(gatherConfigFromUI());
967:       els.aiTestResult.textContent = '✅ Clé API valide';
968:       els.aiTestResult.classList.add('success');
969:     } catch (err) {
970:       els.aiTestResult.textContent = `❌ ${err.message}`;
971:       els.aiTestResult.classList.add('error');
972:     }
973:   });
974: 
975:   els.aiSaveBtn?.addEventListener('click', () => {
976:     const cfg = saveAIConfig(gatherConfigFromUI());
977:     setStatus(`Paramètres IA enregistrés (${cfg.model})`);
978:     modal.style.display = 'none';
979:   });
980: }
981: 
982: async function init() {
983:   initTheme();
984:   initPanelToggles();
985:   refreshKeyboard();
986:   initKeyboardToggle();
987:   initSettings();
988:   initNoteGrouper();
989:   initHistory();
990:   initPracticeExercise();
991:   initAISettings();
992:   // [Claude] — 2026-07-08 — Initialisation de l'onglet Analyse simplifié (import → analyse → grille).
993:   initAnalyzerTab();
994: 
995:   // [OpenCode] — 2026-07-04 — Initialisation de l'onglet Studio (Module 4)
996:   // Le Studio est isolé du synthétiseur/clavier principal : aucun feedMidiEvent.
997:   initStudioTab();
998:   initTabNavigation();
999:   await initMidi();
1000: }
1001: 
1002: function initTabNavigation() {
1003:   const tabNav = document.getElementById('tab-nav');
1004:   const practiceTab = document.getElementById('practice-tab');
1005:   const analysisTab = document.getElementById('analysis-tab');
1006:   const studioTab = document.getElementById('studio-tab');
1007:   const keyboardPanel = document.getElementById('keyboard-panel');
1008: 
1009:   function switchToTab(tab) {
1010:     if (practiceTab) practiceTab.style.display = tab === 'practice' ? 'grid' : 'none';
1011:     if (analysisTab) analysisTab.style.display = tab === 'analysis' ? 'flex' : 'none';
1012:     if (studioTab) studioTab.style.display = tab === 'studio' ? 'grid' : 'none';
1013: 
1014:     document.querySelectorAll('.tab-btn').forEach((b) => {
1015:       b.classList.toggle('active', b.dataset.tab === tab);
1016:     });
1017: 
1018:     if (keyboardPanel) keyboardPanel.style.display = 'flex';
1019:   }
1020: 
1021:   tabNav?.addEventListener('click', (e) => {
1022:     const btn = e.target.closest('.tab-btn');
1023:     if (!btn) return;
1024:     switchToTab(btn.dataset.tab);
1025:   });
1026: 
1027:   document.addEventListener('app-switch-tab', (e) => {
1028:     if (e.detail?.tab) {
1029:       if (e.detail.tab !== 'analysis' && state.suggestionNotes.size > 0) {
1030:         for (const n of state.suggestionNotes) {
1031:           unhighlightKey(n, 'active');
1032:           releaseVirtualNote(n);
1033:         }
1034:         state.suggestionNotes.clear();
1035:         if (els.chordName) els.chordName.textContent = '—';
1036:         if (els.chordDetail) els.chordDetail.textContent = '';
1037:       }
1038:       switchToTab(e.detail.tab);
1039:     }
1040:   });
1041: 
1042:   if (window.location.hash === '#analysis') switchToTab('analysis');
1043:   else if (window.location.hash === '#studio') switchToTab('studio');
1044: }
1045: 
1046: init();

(End of file - total 1046 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/index.html"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/index.html</path>
<type>file</type>
<content>
1: <!DOCTYPE html>
2: <html lang="fr">
3:   <head>
4:     <meta charset="UTF-8" />
5:     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
6:     <!-- [Claude] — 2026-07-07 — CSP stricte en production, 'unsafe-eval' seulement en dev pour Vite HMR. -->
7:     <meta id="csp-meta" http-equiv="Content-Security-Policy" content="" />
8:     <script>
9:       (function () {
10:         const isDev = location.protocol === 'http:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
11:         const csp = isDev
12:           ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:* https://api.groq.com https://openrouter.ai https://generativelanguage.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:;"
13:           : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.groq.com https://openrouter.ai https://generativelanguage.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:;";
14:         document.getElementById('csp-meta').setAttribute('content', csp);
15:       })();
16:     </script>
17:     <title>Piano Jazz Chords</title>
18:     <link rel="stylesheet" href="./style.css" />
19:     <link rel="stylesheet" href="./ui/components/design-system.css" />
20:   </head>
21:   <body data-theme="light">
22:     <div id="app" class="app">
23:       <header class="app-header">
24:         <div class="brand">
25:           <div class="brand-icon">🎹</div>
26:           <div>
27:             <h1>Piano Jazz Chords</h1>
28:             <div class="brand-subtitle">Affichage & apprentissage des accords en temps réel</div>
29:           </div>
30:         </div>
31:         <div class="header-actions">
32:           <nav class="tab-nav" id="tab-nav">
33:             <button class="tab-btn active" data-tab="practice" title="Entraînement en temps réel">Entraînement</button>
34:             <button class="tab-btn" data-tab="analysis" title="Analyser et rejouer des sessions MIDI">Analyse</button>
35:             <button class="tab-btn" data-tab="studio" title="Importer, lire et séparer des morceaux">Studio</button>
36:           </nav>
37:           <button class="settings-toggle" id="ai-settings-toggle" title="Paramètres IA">🔑</button>
38:           <button class="theme-toggle" id="theme-toggle" title="Changer de thème">🌙</button>
39:         </div>
40:       </header>
41: 
42:       <main class="app-main practice-layout" id="practice-tab">
43:         <div class="training-workspace">
44:           <aside class="quick-exercise-panel" id="practice-exercise-panel">
45:             <div class="panel-title">
46:               Exercice rapide
47:               <button class="panel-toggle" id="exercise-panel-toggle" title="Réduire le panneau Exercice rapide" aria-label="Réduire le panneau Exercice rapide" aria-expanded="true" aria-controls="practice-exercise-panel">−</button>
48:             </div>
49:             <div class="exercise-content" id="exercise-content">
50:               <div class="exercise-mode-selector">
51:                 <button class="exercise-mode-btn active" data-mode="chord" type="button">Accord cible</button>
52:                 <button class="exercise-mode-btn" data-mode="progression" type="button">Progression</button>
53:               </div>
54:               <p class="detail-hint">Lancez un exercice pour vous entraîner sur un accord ou une progression.</p>
55:               <button class="panel-action" id="new-exercise-btn" type="button">Nouvel exercice</button>
56:               <div class="exercise-target" id="exercise-target" style="display:none;"></div>
57:               <div class="exercise-feedback" id="exercise-feedback"></div>
58:             </div>
59:           </aside>
60: 
61:           <section class="main-training-stage" id="practice-center">
62:             <button class="quick-exercise-open-control" id="exercise-panel-tab" title="Ouvrir Exercice rapide" aria-label="Ouvrir Exercice rapide" aria-expanded="false" aria-controls="practice-exercise-panel" style="display: none;">
63:               <span class="open-control-icon">›</span>
64:               <span class="open-control-label">Exercice rapide</span>
65:             </button>
66: 
67:             <div class="chord-display" id="chord-display">
68:               <div class="chord-name chord-name-empty" id="chord-name"></div>
69:               <div class="chord-meta" id="chord-meta">
70:                 <span class="voicing-label" id="voicing-label" style="display: none;"></span>
71:                 <span class="alias-label" id="alias-label" style="display: none;"></span>
72:               </div>
73:               <div class="chord-detail" id="chord-detail"></div>
74:             </div>
75: 
76:             <div class="notes-display" id="notes-display"></div>
77: 
78:             <div class="practice-empty-hint" id="practice-empty-hint">Jouez des notes pour afficher l'accord…</div>
79: 
80:             <aside class="techniques-panel" id="pedagogy-panel">
81:               <div class="panel-title">
82:                 Techniques
83:                 <button class="panel-toggle" id="pedagogy-toggle" title="Masquer les techniques" aria-label="Masquer les techniques" aria-expanded="true" aria-controls="pedagogy-panel">−</button>
84:               </div>
85:               <div class="pedagogy-content" id="pedagogy-content">
86:                 <p>Jouez des notes pour voir les techniques...</p>
87:               </div>
88:             </aside>
89: 
90:             <button class="techniques-open-control" id="pedagogy-panel-tab" title="Ouvrir Techniques" aria-label="Ouvrir Techniques" aria-expanded="false" aria-controls="pedagogy-panel" style="display: none;">
91:               <span class="open-control-icon">‹</span>
92:               <span class="open-control-label">Techniques</span>
93:             </button>
94: 
95:             <div class="panel" id="midi-diagnostic-panel" style="display: none;">
96:               <div class="panel-title">
97:                 Diagnostic MIDI
98:                 <button class="panel-toggle" id="midi-diagnostic-toggle" title="Afficher le diagnostic MIDI">+</button>
99:               </div>
100:               <div class="midi-diagnostic-box" id="midi-diagnostic-content" style="display: none;">
101:                 <div class="midi-system" id="midi-system"></div>
102:                 <div class="midi-ports" id="midi-ports"></div>
103:                 <div class="midi-log" id="midi-log"></div>
104:               </div>
105:             </div>
106:           </section>
107:         </div>
108:       </main>
109: 
110:       <!-- Onglet Analyse — version Tailwind -->
111:       <main class="flex-1 flex overflow-hidden bg-zinc-950" id="analysis-tab" style="display: none;">
112:         <section class="flex-1 flex flex-col overflow-hidden min-w-0 relative" id="analyzer-workspace">
113:           <div class="flex items-center justify-center flex-1" id="analyzer-import-screen">
114:             <div class="flex flex-col items-center gap-4 p-8">
115:               <div class="text-5xl">🎵</div>
116:               <h2 class="text-xl font-bold text-zinc-200">Importer un fichier</h2>
117:               <p class="text-sm text-zinc-500 text-center">
118:                 Formats acceptés :<br />
119:                 MP3 · WAV · MP4 · M4A
120:               </p>
121:               <button type="button" id="analyzer-import-btn" class="px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors">
122:                 Choisir un fichier
123:               </button>
124:               <p class="text-xs text-zinc-600 text-center">
125:                 Importez un morceau ou une vidéo afin de lancer son analyse.
126:               </p>
127:             </div>
128:           </div>
129: 
130:           <div class="flex-1 flex flex-col overflow-hidden min-w-0" id="analyzer-results" style="display: none;">
131:             <div class="flex items-center gap-3 px-4 py-2 bg-zinc-900/50 border-b border-zinc-800 flex-shrink-0">
132:               <div class="flex items-center gap-3 flex-1 min-w-0">
133:                 <h2 class="text-sm font-semibold text-zinc-200 truncate" id="analyzer-song-title">Titre du morceau</h2>
134:                 <span class="text-xs text-zinc-500" id="analyzer-song-artist">Inconnu</span>
135:                 <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400" id="analyzer-stem-badge" style="display:none"></span>
136:               </div>
137:               <div class="flex items-center gap-2">
138:                 <button type="button" id="analyzer-prev-btn" class="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors" title="Revenir au début">⏮</button>
139:                 <button type="button" id="analyzer-play-btn" class="px-3 py-1 rounded text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors" title="Lecture / Pause">▶</button>
140:                 <button type="button" id="analyzer-back-btn" class="px-2 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">Importer</button>
141:               </div>
142:             </div>
143: 
144:             <div class="flex items-center gap-3 px-4 py-1.5 bg-zinc-900/30 border-b border-zinc-800 flex-shrink-0">
145:               <span class="text-xs text-zinc-500 font-mono w-12 text-right" id="analyzer-current-time">00:00</span>
146:               <div class="flex-1 relative h-6 bg-zinc-800 rounded-full cursor-pointer" id="analyzer-progress-track">
147:                 <div class="absolute left-0 top-0 h-full bg-sky-600 rounded-full" id="analyzer-progress-fill" style="width:0%"></div>
148:                 <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md" id="analyzer-progress-thumb" style="left:0%"></div>
149:               </div>
150:               <span class="text-xs text-zinc-500 font-mono w-12" id="analyzer-duration">00:00</span>
151:               <div class="flex items-center gap-2 ml-4">
152:                 <label for="analyzer-zoom" class="text-xs text-zinc-500">Zoom</label>
153:                 <input type="range" id="analyzer-zoom" min="0.25" max="8.0" step="0.1" value="1" class="w-20 h-1 accent-sky-500" />
154:                 <span class="text-xs text-zinc-500 w-10" id="analyzer-zoom-value">100%</span>
155:               </div>
156:             </div>
157: 
158:             <div id="analyzer-audio-container" style="display: none;"></div>
159: 
160:             <div class="relative flex-shrink-0 h-20 overflow-x-auto overflow-y-hidden bg-zinc-900 border-b border-zinc-800" id="analyzer-chord-timeline">
161:               <div class="relative h-full min-w-full" id="analyzer-chord-timeline-inner"></div>
162:               <button type="button" class="absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full text-zinc-400 hover:text-sky-400 hover:border-sky-500 cursor-pointer text-sm shadow-lg left-2" id="analyzer-timeline-scroll-left">‹</button>
163:               <button type="button" class="absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full text-zinc-400 hover:text-sky-400 hover:border-sky-500 cursor-pointer text-sm shadow-lg right-2" id="analyzer-timeline-scroll-right">›</button>
164:             </div>
165: 
166:             <div class="flex flex-col items-center gap-3 py-6 flex-shrink-0" id="analyzer-hero" style="display:none">
167:               <div class="text-6xl font-extrabold tracking-tight text-white" id="analyzer-hero-name"></div>
168:               <div class="text-base text-zinc-400" id="analyzer-hero-notes"></div>
169:               <div class="flex justify-center" id="analyzer-hero-keyboard"></div>
170:             </div>
171: 
172:             <section id="analyzer-voicing-preview" class="voicing-preview-panel" aria-label="Aperçu du voicing piano" style="display:none">
173:               <div
174:                 id="analyzer-voicing-style-selector"
175:                 class="voicing-style-selector"
176:                 role="group"
177:                 aria-label="Style de voicing"
178:               >
179:                 <button
180:                   type="button"
181:                   class="voicing-style-btn"
182:                   data-voicing-style="close"
183:                   aria-pressed="true"
184:                 >
185:                   Close
186:                 </button>
187:                 <button
188:                   type="button"
189:                   class="voicing-style-btn"
190:                   data-voicing-style="simple"
191:                   aria-pressed="false"
192:                 >
193:                   Simple
194:                 </button>
195:               </div>
196:               <div id="analyzer-voicing-content"></div>
197:             </section>
198: 
199:             <div class="flex gap-0 px-4 border-b border-zinc-800 flex-shrink-0" id="analyzer-section-tabs" role="tablist">
200:               <button type="button" class="px-4 py-2 text-sm font-medium transition-colors text-sky-400 border-b-2 border-sky-400" data-section="chords" role="tab" aria-selected="true">Accords</button>
201:               <button type="button" class="px-4 py-2 text-sm font-medium transition-colors text-zinc-500 hover:text-zinc-300" data-section="analysis" role="tab" aria-selected="false">Analyse</button>
202:               <button type="button" class="px-4 py-2 text-sm font-medium transition-colors text-zinc-500 hover:text-zinc-300" data-section="masterclass" role="tab" aria-selected="false">Masterclass</button>
203:               <button type="button" class="px-4 py-2 text-sm font-medium transition-colors text-zinc-500 hover:text-zinc-300" data-section="tools" role="tab" aria-selected="false">Outils</button>
204:             </div>
205: 
206:             <div class="flex-1 overflow-y-auto min-h-0 px-4 py-4" id="analyzer-section-panels">
207:               <div class="flex flex-col items-center justify-center h-full text-sm text-zinc-500" data-section="chords" role="tabpanel">
208:                 <p>Les accords sont affichés dans la timeline et le panneau hero ci-dessus.</p>
209:                 <p class="mt-1">Sélectionnez un accord dans la timeline pour voir ses détails.</p>
210:               </div>
211: 
212:               <div class="flex flex-col gap-3 h-full overflow-y-auto" data-section="analysis" role="tabpanel" style="display:none">
213:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden" open>
214:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Scores d'analyse</summary>
215:                   <div class="p-4 text-sm text-zinc-400" id="analyzer-scores-panel">
216:                     <p class="text-xs text-zinc-500">Scores de confiance et métriques globales s'afficheront ici après analyse.</p>
217:                   </div>
218:                 </details>
219:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
220:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Patterns harmoniques</summary>
221:                   <div class="p-4 text-sm text-zinc-400" id="analyzer-patterns-panel">
222:                     <p class="text-xs text-zinc-500">II-V-I, cadences, turnarounds et substitutions détectés s'afficheront ici.</p>
223:                   </div>
224:                 </details>
225:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
226:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Réharmonisation</summary>
227:                   <div class="p-4 text-sm text-zinc-400" id="analyzer-reharm-panel">
228:                     <div class="flex items-center gap-3 mb-3">
229:                       <label for="analyzer-reharm-style" class="text-xs text-zinc-500">Style</label>
230:                       <select id="analyzer-reharm-style" class="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300">
231:                         <option value="jazz" selected>Jazz</option>
232:                         <option value="gospel">Gospel</option>
233:                         <option value="worship">Worship</option>
234:                         <option value="neoSoul">Neo Soul</option>
235:                       </select>
236:                       <button type="button" id="analyzer-reharm-run" class="px-3 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">Générer suggestions</button>
237:                     </div>
238:                     <div class="analyzer-reharm-output" id="analyzer-reharm-output"></div>
239:                   </div>
240:                 </details>
241:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
242:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Ligne de basse</summary>
243:                   <div class="p-4 text-sm text-zinc-400" id="analyzer-bass-panel">
244:                     <p class="text-xs text-zinc-500">Résumé de la ligne de basse détectée.</p>
245:                     <div class="analyzer-bass-summary" id="analyzer-bass-summary"></div>
246:                   </div>
247:                 </details>
248:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
249:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Export</summary>
250:                   <div class="p-4 text-sm text-zinc-400 flex flex-col gap-2" id="analyzer-export-panel">
251:                     <button type="button" id="analyzer-export-midi-btn" class="px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">Exporter l'analyse en MIDI</button>
252:                     <button type="button" id="analyzer-export-json-btn" class="px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">Exporter en JSON</button>
253:                     <button type="button" id="analyzer-copy-text-btn" class="px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">Copier la grille texte</button>
254:                     <p class="text-xs text-zinc-500 mt-1">MIDI, JSON et texte reflètent les corrections manuelles. JSON conserve aussi la détection originale.</p>
255:                   </div>
256:                 </details>
257: 
258:                 <details class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
259:                   <summary class="px-4 py-2.5 text-sm font-semibold text-zinc-300 cursor-pointer hover:bg-zinc-800/50 transition-colors">Statistiques</summary>
260:                   <div class="p-4 text-sm text-zinc-400" id="analyzer-stats-panel">
261:                     <div class="analyzer-stats-content" id="analyzer-stats-content">Aucune statistique disponible.</div>
262:                   </div>
263:                 </details>
264:               </div>
265: 
266:               <div class="flex flex-col gap-4 h-full" data-section="masterclass" role="tabpanel" style="display:none">
267:                 <div class="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-400" id="analyzer-masterclass-output">
268:                   <div class="text-xs text-zinc-500 text-center">
269:                     Configurez une clé API OpenAI-compatible (Groq, OpenRouter, Google AI Studio…) via le bouton 🔑 en haut à droite pour obtenir une analyse pédagogique personnalisée.
270:                   </div>
271:                 </div>
272:                 <div class="flex-shrink-0">
273:                   <button type="button" id="analyzer-masterclass-run" class="px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-500 cursor-not-allowed transition-colors" disabled>Générer l'analyse pédagogique</button>
274:                 </div>
275:               </div>
276: 
277:               <div class="grid grid-cols-3 gap-4 h-full" data-section="tools" role="tabpanel" style="display:none">
278:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
279:                   <div class="text-2xl">🎧</div>
280:                   <div class="text-sm font-semibold text-zinc-300">Aperçu audio</div>
281:                   <p class="text-xs text-zinc-500">Écoute isolée des accords détectés — à venir.</p>
282:                 </div>
283:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
284:                   <div class="text-2xl">🎤</div>
285:                   <div class="text-sm font-semibold text-zinc-300">Accords &amp; Paroles</div>
286:                   <p class="text-xs text-zinc-500">Synchronisation des paroles — à venir.</p>
287:                 </div>
288:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
289:                   <div class="text-2xl">🎚</div>
290:                   <div class="text-sm font-semibold text-zinc-300">Accordeur</div>
291:                   <p class="text-xs text-zinc-500">Accordeur intégré — à venir.</p>
292:                 </div>
293:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
294:                   <div class="text-2xl">⏱</div>
295:                   <div class="text-sm font-semibold text-zinc-300">Compte à rebours</div>
296:                   <p class="text-xs text-zinc-500">Décompte avant lecture — à venir.</p>
297:                 </div>
298:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
299:                   <div class="text-2xl">🔁</div>
300:                   <div class="text-sm font-semibold text-zinc-300">Transposition globale</div>
301:                   <p class="text-xs text-zinc-500">Transposer tous les accords — à venir.</p>
302:                 </div>
303:                 <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center gap-2 text-center">
304:                   <div class="text-2xl">✨</div>
305:                   <div class="text-sm font-semibold text-zinc-300">Simplification</div>
306:                   <p class="text-xs text-zinc-500">Simplifier les enrichissements — à venir.</p>
307:                 </div>
308:               </div>
309:             </div>
310:           </div>
311: 
312:           <div class="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-30" id="analyzer-processing" style="display: none;">
313:             <div class="flex flex-col items-center gap-3">
314:               <div class="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
315:               <p class="text-sm text-zinc-400" id="analyzer-processing-text">Analyse en cours...</p>
316:             </div>
317:           </div>
318:         </section>
319:       </main>
320: 
321:       <main class="studio-tab" id="studio-tab" style="display: none;">
322:         <div id="studio-stage-overlay" class="studio-stage-overlay" style="display: none;">
323:           <div class="studio-stage-overlay-inner">
324:             <h3>🎯 Sélectionnez une zone à travailler</h3>
325:             <p class="studio-overlay-hint">1. Écoutez le morceau avec le bouton <strong>▶</strong>.</p>
326:             <p class="studio-overlay-hint">2. Tracez une région de maximum 5 minutes sur la waveform.</p>
327:             <p class="studio-overlay-hint">3. Cliquez sur <strong>Confirmer la région</strong>.</p>
328:           </div>
329:         </div>
330: 
331:         <div id="studio-processing-overlay" class="studio-processing-overlay" style="display: none;">
332:           <div class="studio-processing-box">
333:             <div class="studio-processing-spinner"></div>
334:             <h3>Préparation du morceau</h3>
335:             <p id="studio-processing-label">Extraction audio en cours...</p>
336:             <div class="studio-processing-bar-wrap">
337:               <div id="studio-processing-bar" class="studio-processing-bar" style="width: 0%"></div>
338:             </div>
339:             <p class="studio-processing-hint">Vous pouvez utiliser les autres onglets en attendant.</p>
340:           </div>
341:         </div>
342: 
343:         <div id="studio-ready-toast" class="studio-ready-toast" style="display: none;">
344:           <span>✅ Le morceau est prêt dans le Studio !</span>
345:         </div>
346: 
347:         <div id="studio-record-countdown" class="studio-record-countdown" style="display: none;">
348:           <div class="studio-record-countdown-number" id="studio-record-countdown-number">3</div>
349:         </div>
350: 
351:         <div id="studio-recording-indicator" class="studio-recording-indicator" style="display: none;">
352:           <span class="studio-recording-dot"></span>
353:           <span>REC</span>
354:         </div>
355: 
356:         <aside class="studio-sidebar left" id="studio-sidebar-left">
357:           <div class="panel studio-tracks-panel" id="studio-tracks-panel">
358:             <button class="studio-collapse-tab" id="studio-collapse-tab" title="Développer le panneau" aria-label="Développer le panneau Morceaux importés">▼</button>
359:             <div class="studio-panel-header" id="studio-tracks-header">
360:               <span class="studio-panel-title">🎵 Morceaux importés</span>
361:               <button class="studio-collapse-btn" id="studio-collapse-left" title="Réduire le panneau" aria-label="Réduire le panneau Morceaux importés">▲</button>
362:             </div>
363:             <div class="studio-panel-body" id="studio-tracks-body">
364:               <p class="studio-empty-hint">Sélectionnez un morceau pour commencer à travailler.</p>
365:               <button id="studio-import-btn" class="record-action">Importer un fichier</button>
366:               <div class="studio-track-list" id="studio-track-list"></div>
367:             </div>
368:           </div>
369:         </aside>
370: 
371:         <section class="studio-center">
372:           <div class="studio-player-wrap" id="studio-player-wrap">
373:             <div id="studio-video-container" class="studio-video-container"></div>
374:             <div id="studio-audio-container" class="studio-audio-container"></div>
375:             <div id="studio-audio-backdrop" class="studio-audio-backdrop" style="display: none;">
376:               <div class="studio-backdrop-icon">🎵</div>
377:               <div class="studio-backdrop-title" id="studio-backdrop-title"></div>
378:               <div class="studio-backdrop-hint">Fichier audio</div>
379:             </div>
380:           </div>
381: 
382:           <div class="studio-waveform-wrap" id="studio-waveform-wrap">
383:             <canvas id="studio-waveform" class="studio-waveform" width="800" height="80"></canvas>
384:             <div class="studio-region" id="studio-region"></div>
385:             <div class="studio-playhead" id="studio-playhead"></div>
386:             <div class="studio-handle studio-handle-start" id="studio-handle-start"></div>
387:             <div class="studio-handle studio-handle-end" id="studio-handle-end"></div>
388:           </div>
389: 
390:           <div class="studio-region-bar">
391:             <div class="studio-region-info" id="studio-region-info">Sélectionnez une région pour activer transpo / séparation</div>
392:             <button id="studio-confirm-region" class="studio-action-btn studio-confirm-btn" title="Confirmer la région" style="display:none;">Confirmer la région</button>
393:             <button id="studio-back-region" class="studio-action-btn" title="Revenir à la timeline entière" style="display:none;">↩</button>
394:             <button id="studio-reset-region" class="studio-action-btn" title="Réinitialiser la région">↺</button>
395:           </div>
396: 
397:           <div class="studio-controls">
398:             <div class="studio-buttons">
399:               <button id="studio-prev-btn" title="Revenir au début">◀◀</button>
400:               <button id="studio-play-btn" title="Lecture / Pause">▶</button>
401:               <button id="studio-stop-btn" title="Stop">■</button>
402:               <button id="studio-record-btn" class="studio-record-btn" title="Enregistrer la fenêtre (R)" aria-label="Enregistrer la fenêtre">●</button>
403:             </div>
404:             <input type="range" id="studio-progress" min="0" max="100" value="0" step="0.1" />
405:             <div class="studio-time" id="studio-time">00:00 / 00:00</div>
406:             <div class="studio-transpose-control" id="studio-transpose-control">
407:               <span class="studio-transpose-title">Transpo</span>
408:               <button id="studio-transpose-minus" type="button" aria-label="Diminuer la transposition">−</button>
409:               <input type="number" id="studio-transpose" value="0" min="-12" max="12" step="1" aria-label="Transposition en demi-tons" />
410:               <button id="studio-transpose-plus" type="button" aria-label="Augmenter la transposition">+</button>
411:               <span id="studio-transpose-status" class="studio-transpose-status"></span>
412:             </div>
413:             <label class="studio-volume-label" id="studio-master-volume-label">
414:               <span>Vol</span>
415:               <span id="studio-volume-label">0 dB</span>
416:               <input type="range" id="studio-volume" min="-60" max="6" value="0" step="1" />
417:             </label>
418:           </div>
419:         </section>
420: 
421:         <aside class="studio-sidebar right">
422:           <div class="panel">
423:             <div class="panel-title">Pistes séparées</div>
424:             <button id="studio-separate-btn" class="record-action">Séparer les pistes</button>
425:             <div class="studio-separate-status" id="studio-separate-status"></div>
426:             <div class="studio-stems-list" id="studio-stems-list"></div>
427:             <div class="studio-status-box" id="studio-status-text">Aucun morceau sélectionné</div>
428:           </div>
429:         </aside>
430:       </main>
431: 
432:       <section class="keyboard-panel global-keyboard-panel" id="keyboard-panel">
433:         <div id="keyboard-container" class="keyboard-container"></div>
434:         <div class="keyboard-controls">
435:           <label>
436:             Taille
437:             <select id="keyboard-size">
438:               <option value="custom">Personnalisé</option>
439:               <option value="25">25 touches (C3–C5)</option>
440:               <option value="49">49 touches (C2–C6)</option>
441:               <option value="61">61 touches (C2–C7)</option>
442:               <option value="76">76 touches (E1–G7)</option>
443:               <option value="88">88 touches (A0–C8)</option>
444:               <option value="midi" selected>Virtuel MIDI (C0–C9)</option>
445:             </select>
446:           </label>
447:           <button id="keyboard-toggle" class="keyboard-toggle" type="button" title="Réduire/développer le clavier">[^]</button>
448:           <label>
449:             Début
450:             <input type="text" id="note-start" value="C0" />
451:           </label>
452:           <label>
453:             Fin
454:             <input type="text" id="note-end" value="C9" />
455:           </label>
456:           <label>
457:             Transposition
458:             <input type="number" id="transpose" value="0" min="-12" max="12" />
459:           </label>
460:           <label>
461:             Tolérance (ms)
462:             <input type="number" id="tolerance" value="200" min="50" max="500" step="10" />
463:           </label>
464:           <label>
465:             Notation
466:             <select id="notation-select">
467:               <option value="latin">Latine (Do/Ré/Mi)</option>
468:               <option value="english" selected>Anglaise (C/D/E)</option>
469:             </select>
470:           </label>
471:           <label class="switch-label">
472:             <input type="checkbox" id="silent-mode" />
473:             Silencieux
474:           </label>
475:           <label class="switch-label">
476:             <input type="checkbox" id="rhodes-mode" />
477:             Rhodes
478:           </label>
479:         </div>
480:       </section>
481: 
482:       <footer class="app-footer">
483:         <div class="footer-left">
484:           <label>
485:             Couleur notes
486:             <input type="color" id="color-note" value="#2563eb" />
487:           </label>
488:           <label>
489:             Couleur fondamentale
490:             <input type="color" id="color-tonic" value="#111111" />
491:           </label>
492:         </div>
493: 
494:         <div class="footer-midi">
495:           <label for="midi-select">MIDI :</label>
496:           <select id="midi-select" data-last-count="0"></select>
497:           <span id="midi-status-text">Aucun</span>
498:           <span id="midi-port-count">(0)</span>
499:           <button id="midi-refresh" title="Rafraîchir les périphériques MIDI">↻</button>
500:         </div>
501: 
502:         <div class="footer-right" id="status-bar"></div>
503:       </footer>
504: 
505:       <div class="modal-overlay" id="session-end-modal" style="display: none;">
506:         <div class="modal-box">
507:           <h3>Session terminée</h3>
508:           <div class="modal-stats" id="modal-stats"></div>
509:           <div class="modal-actions">
510:             <button type="button" id="modal-delete" class="secondary">Supprimer</button>
511:             <button type="button" id="modal-replay" class="record">▶ Rejouer</button>
512:             <button type="button" id="modal-keep" class="primary">Conserver</button>
513:           </div>
514:         </div>
515:       </div>
516: 
517:       <div class="modal-overlay" id="ai-settings-modal" style="display: none;">
518:         <div class="modal-box ai-settings-box">
519:           <h3>Paramètres IA</h3>
520:           <p class="modal-hint">Configure une clé API gratuite (Groq, OpenRouter, Google AI Studio…). Le format est compatible OpenAI.</p>
521: 
522:           <label class="ai-field">
523:             <span>Preset</span>
524:             <select id="ai-preset">
525:               <option value="" disabled selected>Choisir un provider…</option>
526:               <option value="groq">Groq (gratuit, rapide)</option>
527:               <option value="openrouter">OpenRouter (multi-modèles gratuits)</option>
528:               <option value="gemini">Google AI Studio (Gemini Flash)</option>
529:               <option value="custom">Personnalisé</option>
530:             </select>
531:           </label>
532: 
533:           <label class="ai-field">
534:             <span>Base URL</span>
535:             <input type="url" id="ai-base-url" placeholder="https://api.groq.com/openai/v1" />
536:           </label>
537: 
538:           <label class="ai-field">
539:             <span>Clé API</span>
540:             <input type="password" id="ai-api-key" placeholder="gsk_..." />
541:           </label>
542: 
543:           <label class="ai-field">
544:             <span>Modèle</span>
545:             <input type="text" id="ai-model" placeholder="llama-3.1-8b-instant" />
546:           </label>
547: 
548:           <div class="ai-test-result" id="ai-test-result"></div>
549: 
550:           <div class="modal-actions">
551:             <button type="button" id="ai-test-btn" class="secondary">🧪 Tester</button>
552:             <button type="button" id="ai-save-btn" class="primary">Enregistrer</button>
553:             <button type="button" id="ai-cancel-btn" class="secondary">Annuler</button>
554:           </div>
555:         </div>
556:       </div>
557:     </div>
558: 
559:     <script type="module" src="./main.js"></script>
560:   </body>
561: </html>

(End of file - total 561 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/electron/main.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/electron/main.js</path>
<type>file</type>
<content>
1: import { app, BrowserWindow, ipcMain, session, dialog, desktopCapturer } from 'electron';
2: import path from 'path';
3: import { fileURLToPath } from 'url';
4: import midi from '@julusian/midi';
5: import os from 'os';
6: import fs from 'fs/promises';
7: import fsSync from 'fs';
8: import { spawn } from 'child_process';
9: import { pathToFileURL } from 'url';
10: 
11: // [OpenCode] — 2026-07-04 — Charge .env s'il existe (sans dépendance dotenv)
12: try {
13:   const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
14:   if (fsSync.existsSync(envPath)) {
15:     const content = fsSync.readFileSync(envPath, 'utf-8');
16:     for (const line of content.split('\n')) {
17:       const trimmed = line.trim();
18:       if (!trimmed || trimmed.startsWith('#')) continue;
19:       const eqIndex = trimmed.indexOf('=');
20:       if (eqIndex === -1) continue;
21:       const key = trimmed.slice(0, eqIndex).trim();
22:       const value = trimmed.slice(eqIndex + 1).trim();
23:       if (key && value && !process.env[key]) {
24:         process.env[key] = value.replace(/^['"]|['"]$/g, '');
25:       }
26:     }
27:   }
28: } catch (e) { /* .env silencieux */ }
29: 
30: // [OpenCode] — 2026-07-04 — Désactivation de l'accélération GPU pour éviter les crashes sur certains environnements Linux.
31: app.disableHardwareAcceleration();
32: app.commandLine.appendSwitch('disable-gpu');
33: app.commandLine.appendSwitch('disable-software-rasterizer');
34: 
35: const __dirname = path.dirname(fileURLToPath(import.meta.url));
36: 
37: let mainWindow = null;
38: let midiInput = null;
39: let currentInputId = null; // currently opened input port id
40: let currentInputName = null; // name used to reconnect after hot-plug
41: 
42: function createWindow() {
43:   mainWindow = new BrowserWindow({
44:     width: 1400,
45:     height: 900,
46:     minWidth: 1100,
47:     minHeight: 700,
48:     title: 'Piano Jazz Chords',
49:     icon: path.join(__dirname, '../assets/icon.svg'),
50:     webPreferences: {
51:       preload: path.join(__dirname, 'preload.cjs'),
52:       contextIsolation: true,
53:       nodeIntegration: false,
54:     },
55:   });
56: 
57:   // [Claude] — 2026-07-07 — Autorise la capture d'écran pour la fenêtre de l'application elle-même.
58:   // Sans ce gestionnaire, navigator.mediaDevices.getUserMedia({ chromeMediaSource: 'desktop' })
59:   // échoue avec NotAllowedError dans le renderer.
60:   mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
61:     const isOwnWindow = webContents.id === mainWindow.webContents.id;
62:     const isMedia = permission === 'media' || permission === 'display-capture' || permission === 'clipboard-sanitized-write';
63:     if (isOwnWindow && isMedia) {
64:       callback(true);
65:     } else {
66:       callback(false);
67:     }
68:   });
69: 
70:   // [OpenCode] — 2026-07-04 — En développement, charge Vite HMR ; en production, charge le build dist.
71:   const isDev = process.env.NODE_ENV === 'development';
72:   const indexPath = path.join(__dirname, '../dist/index.html');
73:   const devUrl = 'http://localhost:5173/';
74:   if (isDev) {
75:     console.log('Loading renderer from Vite dev server:', devUrl);
76:     mainWindow.loadURL(devUrl).catch((err) => {
77:       console.error('Failed to load Vite dev URL:', err.message);
78:     });
79:   } else {
80:     console.log('Loading renderer from:', indexPath);
81:     mainWindow.loadFile(indexPath).catch((err) => {
82:       console.error('Failed to load renderer:', err.message);
83:     });
84:   }
85: 
86:   // [OpenCode] — 2026-07-04 — DevTools ouverts en permanence pour déboguer les bugs UI.
87:   mainWindow.webContents.openDevTools({ mode: 'detach' });
88: 
89:   mainWindow.on('close', async (e) => {
90:     try {
91:       const dirty = await mainWindow.webContents.executeJavaScript('window.__projectDirty || false');
92:       if (!dirty) return;
93:     } catch {
94:       return; // renderer not ready
95:     }
96:     e.preventDefault();
97:     const result = await dialog.showMessageBox(mainWindow, {
98:       type: 'question',
99:       buttons: ['Enregistrer', 'Ignorer', 'Annuler la fermeture'],
100:       defaultId: 0,
101:       cancelId: 2,
102:       title: 'Modifications non enregistrées',
103:       message: 'Des modifications d\'accords n\'ont pas été enregistrées.',
104:       detail: 'Les corrections manuelles seront perdues si vous ne les enregistrez pas.',
105:     });
106:     if (result.response === 0) {
107:       try {
108:         await mainWindow.webContents.executeJavaScript('window.__saveProjectBeforeClose()');
109:       } catch (saveErr) {
110:         console.error('[Main] save before close failed:', saveErr);
111:       }
112:       mainWindow.destroy();
113:     } else if (result.response === 1) {
114:       mainWindow.destroy();
115:     }
116:   });
117: 
118:   mainWindow.on('closed', () => {
119:     mainWindow = null;
120:     closeMidiInput();
121:   });
122: }
123: 
124: function sendMidiLog(type, data) {
125:   if (mainWindow && !mainWindow.isDestroyed()) {
126:     mainWindow.webContents.send('midi-log', { type, data, time: Date.now() });
127:   }
128: }
129: 
130: let midiInputEnumerator = null;
131: 
132: let nativeMidiFailed = false;
133: 
134: // [OpenCode] — 2026-07-04 — Heuristic to skip internal/virtual ALSA ports when auto-connecting.
135: const VIRTUAL_PORT_NAMES = ['midi through', 'through', 'virmidi', 'client-', 'timidity', 'fluidsynth', 'pipewire'];
136: function isLikelyHardware(name) {
137:   const lower = name.toLowerCase();
138:   return !VIRTUAL_PORT_NAMES.some((v) => lower.includes(v));
139: }
140: 
141: function getMidiInputEnumerator() {
142:   if (nativeMidiFailed) return null;
143:   if (!midiInputEnumerator) {
144:     try {
145:       midiInputEnumerator = new midi.Input();
146:     } catch (err) {
147:       console.error('[MIDI] Failed to initialize native MIDI:', err.message);
148:       nativeMidiFailed = true;
149:       return null;
150:     }
151:   }
152:   return midiInputEnumerator;
153: }
154: 
155: function closeMidiInputEnumerator() {
156:   if (midiInputEnumerator) {
157:     try {
158:       midiInputEnumerator.closePort();
159:       midiInputEnumerator = null;
160:     } catch (e) {
161:       // ignore
162:     }
163:   }
164: }
165: 
166: function getMidiInputs() {
167:   const input = getMidiInputEnumerator();
168:   if (!input) return [];
169:   const ports = [];
170:   const count = input.getPortCount();
171:   sendMidiLog('scan', { count });
172:   for (let i = 0; i < count; i++) {
173:     const name = input.getPortName(i);
174:     sendMidiLog('port', { id: i, name });
175:     ports.push({
176:       id: i,
177:       name,
178:     });
179:   }
180:   return ports;
181: }
182: 
183: // [Claude] — 2026-07-03 — Fermeture propre du port MIDI natif courant
184: function closeMidiInput() {
185:   if (midiInput) {
186:     try {
187:       midiInput.closePort();
188:     } catch (e) {
189:       // ignore
190:     }
191:     midiInput = null;
192:     currentInputId = null;
193:     currentInputName = null;
194:   }
195: }
196: 
197: // [Claude] — 2026-07-03 — Ouverture d'un port MIDI natif avec suivi de l'id courant
198: // [OpenCode] — 2026-07-04 — Retourne maintenant { success, portId, name } pour que le renderer
199: // puisse afficher le bon périphérique et reconnecter par nom en cas de hot-plug.
200: function openMidiInput(portId) {
201:   console.log('[MIDI] openMidiInput called for port', portId);
202:   closeMidiInput();
203:   // [OpenCode] — 2026-07-03 — Close the enumerator while a port is open to avoid ALSA conflicts
204:   // where the enumerator cannot see the same port that is currently in use.
205:   closeMidiInputEnumerator();
206:   midiInput = new midi.Input();
207:   let name = '';
208:   try {
209:     midiInput.openPort(portId);
210:     name = midiInput.getPortName(portId) || '';
211:     console.log('[MIDI] port opened successfully:', portId, name);
212:   } catch (err) {
213:     console.error('[MIDI] openPort failed:', err.message);
214:     midiInput = null;
215:     return { success: false, error: err.message };
216:   }
217:   midiInput.on('message', (deltaTime, message) => {
218:     if (!mainWindow || mainWindow.isDestroyed()) return;
219:     const [status, data1, data2] = message;
220:     const cmd = status >> 4;
221:     const channel = status & 0x0f;
222: 
223:     sendMidiLog('message', { status, data1, data2, cmd, channel });
224: 
225:     if (channel === 9) return; // ignore drums channel
226: 
227:     if (cmd === 0x8 || (cmd === 0x9 && data2 === 0)) {
228:       mainWindow.webContents.send('midi-note-off', { note: data1 });
229:     } else if (cmd === 0x9) {
230:       mainWindow.webContents.send('midi-note-on', { note: data1, velocity: data2 / 127 });
231:     } else if (cmd === 0xb && data1 === 64) {
232:       mainWindow.webContents.send('midi-sustain', { value: data2 >= 64 });
233:     } else if (cmd === 0xb && data1 === 1) {
234:       mainWindow.webContents.send('midi-mod-wheel', { value: data2 / 127 });
235:     } else if (cmd === 0xe) {
236:       const bend = (data2 * 128 + data1 - 8192) / 8192;
237:       mainWindow.webContents.send('midi-pitch-wheel', { value: bend });
238:     }
239:   });
240:   currentInputId = portId;
241:   currentInputName = name;
242:   sendMidiLog('open', { portId, name });
243:   return { success: true, portId, name };
244: }
245: 
246: // [OpenCode] — 2026-07-04 — Auto-connect to a real hardware input if none is open yet.
247: function autoOpenHardwareInput(inputs) {
248:   if (midiInput) return null; // already connected
249:   const hardware = inputs.filter((i) => isLikelyHardware(i.name));
250:   const preferred = hardware.find((i) =>
251:     /usb|piano|keyboard|mpk|midi|key|synth|controller/i.test(i.name),
252:   ) || hardware[0];
253:   if (preferred) {
254:     console.log('[MIDI] auto-connecting to', preferred.id, preferred.name);
255:     const result = openMidiInput(preferred.id);
256:     if (result.success) {
257:       if (mainWindow && !mainWindow.isDestroyed()) {
258:         mainWindow.webContents.send('midi-device-connected', { portId: preferred.id, name: preferred.name });
259:       }
260:       return result;
261:     }
262:   }
263:   return null;
264: }
265: 
266: // [OpenCode] — 2026-07-04 — When the current port disappears, try to reconnect to a port with the same name.
267: function reconnectByName(inputs) {
268:   if (!currentInputName || midiInput) return null;
269:   const match = inputs.find((i) => i.name === currentInputName && i.id !== currentInputId);
270:   if (match) {
271:     console.log('[MIDI] reconnecting by name to', match.id, match.name);
272:     const result = openMidiInput(match.id);
273:     if (result.success && mainWindow && !mainWindow.isDestroyed()) {
274:       mainWindow.webContents.send('midi-device-connected', { portId: match.id, name: match.name });
275:     }
276:     return result;
277:   }
278:   return null;
279: }
280: 
281: function userAudioGroups() {
282:   const userInfo = os.userInfo();
283:   const groups = process.getgroups?.() || [];
284:   const names = groups.map((gid) => {
285:     try { return os.userInfo({ gid }).username; } catch { return String(gid); }
286:   });
287:   return {
288:     username: userInfo.username,
289:     groups: names,
290:     inAudio: names.includes('audio') || groups.includes(29),
291:   };
292: }
293: 
294: function requestMidiPermission() {
295:   session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
296:     if (permission === 'midi' || permission === 'midiSysex') {
297:       callback(true);
298:     } else {
299:       callback(false);
300:     }
301:   });
302: 
303:   session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
304:     return permission === 'midi' || permission === 'midiSysex';
305:   });
306: }
307: 
308: let lastSeenInputs = [];
309: 
310: function inputsChanged(a, b) {
311:   if (a.length !== b.length) return true;
312:   for (let i = 0; i < a.length; i++) {
313:     if (a[i].name !== b[i].name) return true;
314:   }
315:   return false;
316: }
317: 
318: // [Claude] — 2026-07-03 — API système de fichiers pour le Module 2 (sessions d'enregistrement)
319: function setupFileSystemIPC() {
320:   const homeDir = os.homedir();
321: 
322:   ipcMain.handle('files:home-dir', () => homeDir);
323: 
324:   ipcMain.handle('files:ensure-dir', async (event, dirPath) => {
325:     await fs.mkdir(dirPath, { recursive: true });
326:     return true;
327:   });
328: 
329:   ipcMain.handle('files:read-dir', async (event, dirPath) => {
330:     try {
331:       const entries = await fs.readdir(dirPath, { withFileTypes: true });
332:       return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
333:     } catch (err) {
334:       if (err.code === 'ENOENT') return [];
335:       throw err;
336:     }
337:   });
338: 
339:   ipcMain.handle('files:write-file', async (event, filePath, content) => {
340:     let data = content;
341:     if (content instanceof ArrayBuffer) {
342:       data = new Uint8Array(content);
343:     } else if (typeof content === 'object' && content !== null && !(content instanceof Uint8Array)) {
344:       data = JSON.stringify(content);
345:     }
346:     await fs.writeFile(filePath, data);
347:     return true;
348:   });
349: 
350:   ipcMain.handle('files:read-file', async (event, filePath) => {
351:     try {
352:       return await fs.readFile(filePath, 'utf-8');
353:     } catch (err) {
354:       if (err.code === 'ENOENT') return null;
355:       throw err;
356:     }
357:   });
358: 
359:   ipcMain.handle('files:read-binary', async (event, filePath) => {
360:     const buffer = await fs.readFile(filePath);
361:     return new Uint8Array(buffer);
362:   });
363: 
364:   ipcMain.handle('files:write-binary', async (event, filePath, data) => {
365:     let buffer = data;
366:     if (data instanceof ArrayBuffer) {
367:       buffer = Buffer.from(data);
368:     } else if (Array.isArray(data)) {
369:       buffer = Buffer.from(data);
370:     } else if (data instanceof Uint8Array) {
371:       buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
372:     }
373:     await fs.writeFile(filePath, buffer);
374:     return true;
375:   });
376: 
377:   ipcMain.handle('files:exists', async (event, filePath) => {
378:     try {
379:       await fs.access(filePath);
380:       return true;
381:     } catch {
382:       return false;
383:     }
384:   });
385: 
386:   ipcMain.handle('files:delete-dir', async (event, dirPath) => {
387:     await fs.rm(dirPath, { recursive: true, force: true });
388:     return true;
389:   });
390: 
391:   ipcMain.handle('files:delete-file', async (event, filePath) => {
392:     await fs.rm(filePath, { force: true });
393:     return true;
394:   });
395: 
396:   ipcMain.handle('files:save-dialog', async (event, options = {}) => {
397:     if (!mainWindow) return null;
398:     const result = await dialog.showSaveDialog(mainWindow, {
399:       defaultPath: options.defaultPath || 'analysis.mid',
400:       filters: options.filters || [
401:         { name: 'Fichier MIDI', extensions: ['mid'] },
402:         { name: 'Tous les fichiers', extensions: ['*'] },
403:       ],
404:     });
405:     return result.canceled ? null : result.filePath;
406:   });
407: 
408:   ipcMain.handle('files:stat', async (event, filePath) => {
409:     try {
410:       const st = await fs.stat(filePath);
411:       return { size: st.size, mtimeMs: st.mtimeMs, isFile: st.isFile(), isDirectory: st.isDirectory() };
412:     } catch (err) {
413:       if (err.code === 'ENOENT') return null;
414:       throw err;
415:     }
416:   });
417: 
418:   ipcMain.handle('files:rename', async (event, oldPath, newPath) => {
419:     await fs.rename(oldPath, newPath);
420:     return true;
421:   });
422: }
423: 
424: const STUDIO_DIR_NAME = 'PianoJazzChords/Studio';
425: const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];
426: 
427: // [Claude] — 2026-07-08 — Si un fichier importé dans l'onglet Analyse correspond
428: // à un morceau déjà séparé dans le Studio, on utilise le stem piano isolé pour
429: // l'analyse. Cela améliore nettement la qualité par rapport au mix complet.
430: async function findStudioPianoStemForFile(filePath) {
431:   const studioDir = getStudioDir();
432:   try {
433:     const entries = await fs.readdir(studioDir, { withFileTypes: true });
434:     const realFilePath = await fs.realpath(filePath).catch(() => filePath);
435:     for (const entry of entries) {
436:       if (!entry.isDirectory()) continue;
437:       const trackDir = path.join(studioDir, entry.name);
438:       const files = await fs.readdir(trackDir);
439:       const originalFile = files.find((f) => f.startsWith('original.'));
440:       if (!originalFile) continue;
441:       const originalPath = path.join(trackDir, originalFile);
442:       const realOriginalPath = await fs.realpath(originalPath).catch(() => originalPath);
443:       if (realFilePath !== realOriginalPath) continue;
444:       const pianoStem = path.join(trackDir, 'stems', 'piano.wav');
445:       try {
446:         await fs.access(pianoStem);
447:         return pianoStem;
448:       } catch {
449:         return null;
450:       }
451:     }
452:   } catch (e) {
453:     // ignore: le dossier Studio peut ne pas exister.
454:   }
455:   return null;
456: }
457: 
458: async function findStudioBassStemForFile(filePath) {
459:   const studioDir = getStudioDir();
460:   try {
461:     const entries = await fs.readdir(studioDir, { withFileTypes: true });
462:     const realFilePath = await fs.realpath(filePath).catch(() => filePath);
463:     for (const entry of entries) {
464:       if (!entry.isDirectory()) continue;
465:       const trackDir = path.join(studioDir, entry.name);
466:       const files = await fs.readdir(trackDir);
467:       const originalFile = files.find((f) => f.startsWith('original.'));
468:       if (!originalFile) continue;
469:       const originalPath = path.join(trackDir, originalFile);
470:       const realOriginalPath = await fs.realpath(originalPath).catch(() => originalPath);
471:       if (realFilePath !== realOriginalPath) continue;
472:       const bassStem = path.join(trackDir, 'stems', 'bass.wav');
473:       try {
474:         await fs.access(bassStem);
475:         return bassStem;
476:       } catch {
477:         return null;
478:       }
479:     }
480:   } catch (e) {
481:     // ignore
482:   }
483:   return null;
484: }
485: 
486: // [OpenCode] — 2026-07-04 — Utilise le venv local s'il existe, sinon python3.
487: function getVenvPythonPath() {
488:   const venvPython = path.join(__dirname, '..', '.venv', 'bin', 'python');
489:   if (process.platform === 'win32') {
490:     return path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
491:   }
492:   return venvPython;
493: }
494: 
495: function getPythonCommand() {
496:   const venvPath = getVenvPythonPath();
497:   try {
498:     fsSync.accessSync(venvPath);
499:     return venvPath;
500:   } catch {
501:     return 'python3';
502:   }
503: }
504: 
505: function runAudioProcessor(args, onProgress = null) {
506:   return new Promise((resolve, reject) => {
507:     const proc = spawn(getPythonCommand(), [
508:       path.join(__dirname, 'audio-processor.py'),
509:       ...args,
510:     ], { shell: false });
511: 
512:     let stdout = '';
513:     let stderr = '';
514:     proc.stdout.on('data', (data) => {
515:       const text = data.toString();
516:       stdout += text;
517:       if (onProgress && mainWindow && !mainWindow.isDestroyed()) {
518:         const match = text.match(/waveform progress:\s*(\d{1,3})%/);
519:         if (match) onProgress(Number(match[1]));
520:       }
521:     });
522:     proc.stderr.on('data', (data) => {
523:       stderr += data.toString();
524:     });
525: 
526:     proc.on('error', (err) => reject(err));
527:     proc.on('exit', (code) => {
528:       if (code !== 0) {
529:         reject(new Error(stderr || `audio-processor exited with code ${code}`));
530:         return;
531:       }
532:       resolve(stdout.trim());
533:     });
534:   });
535: }
536: 
537: async function extractTrackAudio(inputPath, outputWav) {
538:   await runAudioProcessor(['extract', inputPath, outputWav]);
539:   return outputWav;
540: }
541: 
542: async function generateWaveform(wavPath, onProgress = null) {
543:   const json = await runAudioProcessor(['waveform', wavPath], onProgress);
544:   return JSON.parse(json.split('\n').filter(Boolean).pop());
545: }
546: 
547: async function pitchShiftRegion(inputWav, outputWav, semitones, startSec, endSec) {
548:   await runAudioProcessor([
549:     'pitch-shift',
550:     inputWav,
551:     outputWav,
552:     String(semitones),
553:     String(startSec),
554:     endSec !== null ? String(endSec) : '',
555:   ]);
556:   return outputWav;
557: }
558: 
559: async function mixStemsToMaster(stemPaths, outputWav) {
560:   await runAudioProcessor(['mix-stems', stemPaths.join(','), outputWav]);
561:   return outputWav;
562: }
563: 
564: async function runBassAnalysis(analysisWav, chordsData, tmpDir) {
565:   const scriptsDir = path.join(__dirname, '..', 'scripts');
566:   const paramsPath = path.join(__dirname, '..', 'fusion_params.json');
567:   const candidatesJson = path.join(tmpDir, 'candidates.json');
568:   const chordsJson = path.join(tmpDir, 'chords.json');
569:   const segmentsJson = path.join(tmpDir, 'fusion_segments.json');
570: 
571:   // Save chords data to temp file for Fusion Engine
572:   await fs.writeFile(chordsJson, JSON.stringify(chordsData));
573: 
574:   // Step 1: export BE candidates
575:   await new Promise((resolve, reject) => {
576:     const proc = spawn(getPythonCommand(), [
577:       path.join(scriptsDir, 'export_bass_candidates.py'),
578:       '--wav', analysisWav,
579:       '--output', candidatesJson,
580:     ], { shell: false });
581:     let stderr = '';
582:     proc.stderr.on('data', (d) => { stderr += d.toString(); });
583:     proc.on('error', reject);
584:     proc.on('exit', (code) => {
585:       if (code !== 0) return reject(new Error(stderr || `export_bass_candidates failed (code ${code})`));
586:       resolve();
587:     });
588:   });
589: 
590:   // Step 2: run Fusion Engine
591:   await new Promise((resolve, reject) => {
592:     const proc = spawn(getPythonCommand(), [
593:       path.join(scriptsDir, 'fusion_bass_chord.py'),
594:       '--candidates', candidatesJson,
595:       '--chords', chordsJson,
596:       '--params', paramsPath,
597:       '--output-segments', segmentsJson,
598:     ], { shell: false });
599:     let stderr = '';
600:     proc.stderr.on('data', (d) => { stderr += d.toString(); });
601:     proc.on('error', reject);
602:     proc.on('exit', (code) => {
603:       if (code !== 0) return reject(new Error(stderr || `fusion_bass_chord failed (code ${code})`));
604:       resolve();
605:     });
606:   });
607: 
608:   // Parse and return segments
609:   const segContent = await fs.readFile(segmentsJson, 'utf-8');
610:   return JSON.parse(segContent).segments || [];
611: }
612: 
613: async function convertWebmToMp4(inputWebm, outputMp4) {
614:   await runAudioProcessor(['convert-webm-to-mp4', inputWebm, outputMp4]);
615:   return outputMp4;
616: }
617: 
618: function getStudioDir() {
619:   return path.join(os.homedir(), STUDIO_DIR_NAME);
620: }
621: 
622: async function ensureStudioDir() {
623:   const dir = getStudioDir();
624:   await fs.mkdir(dir, { recursive: true });
625:   return dir;
626: }
627: 
628: async function createSilentWav(durationSec = 1) {
629:   // Minimal valid WAV file : PCM 16-bit 44100 Hz mono silence
630:   const sampleRate = 44100;
631:   const numSamples = sampleRate * durationSec;
632:   const dataSize = numSamples * 2;
633:   const buffer = Buffer.alloc(44 + dataSize);
634:   buffer.write('RIFF', 0);
635:   buffer.writeUInt32LE(36 + dataSize, 4);
636:   buffer.write('WAVE', 8);
637:   buffer.write('fmt ', 12);
638:   buffer.writeUInt32LE(16, 16); // fmt chunk size
639:   buffer.writeUInt16LE(1, 20); // PCM
640:   buffer.writeUInt16LE(1, 22); // mono
641:   buffer.writeUInt32LE(sampleRate, 24);
642:   buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
643:   buffer.writeUInt16LE(2, 32); // block align
644:   buffer.writeUInt16LE(16, 34); // bits per sample
645:   buffer.write('data', 36);
646:   buffer.writeUInt32LE(dataSize, 40);
647:   return buffer;
648: }
649: 
650: async function createBeepWav(durationSec = 1, freq = 440) {
651:   const sampleRate = 44100;
652:   const numSamples = sampleRate * durationSec;
653:   const dataSize = numSamples * 2;
654:   const buffer = Buffer.alloc(44 + dataSize);
655:   buffer.write('RIFF', 0);
656:   buffer.writeUInt32LE(36 + dataSize, 4);
657:   buffer.write('WAVE', 8);
658:   buffer.write('fmt ', 12);
659:   buffer.writeUInt32LE(16, 16);
660:   buffer.writeUInt16LE(1, 20);
661:   buffer.writeUInt16LE(1, 22);
662:   buffer.writeUInt32LE(sampleRate, 24);
663:   buffer.writeUInt32LE(sampleRate * 2, 28);
664:   buffer.writeUInt16LE(2, 32);
665:   buffer.writeUInt16LE(16, 34);
666:   buffer.write('data', 36);
667:   buffer.writeUInt32LE(dataSize, 40);
668:   const view = new DataView(buffer.buffer, buffer.byteOffset + 44, dataSize);
669:   for (let i = 0; i < numSamples; i++) {
670:     const t = i / sampleRate;
671:     const sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
672:     view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
673:   }
674:   return buffer;
675: }
676: 
677: async function demucsInstalled() {
678:   return new Promise((resolve) => {
679:     const proc = spawn(getPythonCommand(), ['-c', 'import demucs'], { shell: false });
680:     proc.on('error', () => resolve(false));
681:     proc.on('exit', (code) => resolve(code === 0));
682:   });
683: }
684: 
685: async function runDemucs(trackId, inputPath) {
686:   const studioDir = await ensureStudioDir();
687:   const trackDir = path.join(studioDir, trackId);
688:   const stemsDir = path.join(trackDir, 'stems');
689:   await fs.mkdir(stemsDir, { recursive: true });
690: 
691:   const outputDir = path.join(trackDir, 'demucs_out');
692:   await fs.mkdir(outputDir, { recursive: true });
693: 
694:   return new Promise((resolve, reject) => {
695:     const proc = spawn(getPythonCommand(), [
696:       path.join(__dirname, 'demucs-wrapper.py'),
697:       outputDir,
698:       inputPath,
699:     ], { shell: false });
700: 
701:     let stderr = '';
702:     let lastPercent = 0;
703:     let startTime = Date.now();
704: 
705:     function sendProgress(percent, fallback = false) {
706:       if (mainWindow && !mainWindow.isDestroyed()) {
707:         mainWindow.webContents.send('studio:separation-progress', { trackId, percent, fallback });
708:       }
709:     }
710: 
711:     proc.stderr.on('data', (data) => {
712:       const line = data.toString();
713:       stderr += line;
714:       // tqdm progress bars are printed to stderr, e.g.:
715:       // "  45%|█████     | 45.0/100.0 [00:14<00:17, 3.5seconds/s]"
716:       const match = line.match(/\s*(\d{1,3})%\|.*?\|\s*[\d.]+\/([\d.]+)/);
717:       if (match) {
718:         const percent = Math.min(100, Math.max(0, Number(match[1])));
719:         if (percent > lastPercent) {
720:           lastPercent = percent;
721:           sendProgress(percent);
722:         }
723:       }
724:     });
725: 
726:     proc.stdout.on('data', (data) => {
727:       const line = data.toString();
728:       console.log('[Demucs]', line.trim());
729:       const match = line.match(/\s*(\d{1,3})%\|.*?\|\s*[\d.]+\/([\d.]+)/);
730:       if (match) {
731:         const percent = Math.min(100, Math.max(0, Number(match[1])));
732:         if (percent > lastPercent) {
733:           lastPercent = percent;
734:           sendProgress(percent);
735:         }
736:       }
737:     });
738: 
739:     // Fallback progress: send elapsed time as a fake percent so the UI
740:     // never appears frozen when Demucs does not emit tqdm lines.
741:     const fallbackInterval = setInterval(() => {
742:       if (lastPercent < 100) {
743:         const elapsed = Math.floor((Date.now() - startTime) / 1000);
744:         sendProgress(lastPercent, true);
745:       }
746:     }, 1000);
747: 
748:     proc.on('error', (err) => {
749:       clearInterval(fallbackInterval);
750:       reject(err);
751:     });
752:     proc.on('exit', async (code) => {
753:       clearInterval(fallbackInterval);
754:       if (code !== 0) {
755:         reject(new Error(stderr || `Demucs exited with code ${code}`));
756:         return;
757:       }
758:       try {
759:         // The wrapper uses htdemucs_6s, which produces 6 stems.
760:         // htdemucs_6s writes files directly under outputDir/\u003cmodel\u003e/\u003cstem\u003e.wav
761:         const modelDir = path.join(outputDir, 'htdemucs_6s');
762:         const files = await fs.readdir(modelDir);
763:         // Clean old stems first so simulated files don't shadow real ones.
764:         for (const stem of STEMS) {
765:           try {
766:             await fs.rm(path.join(stemsDir, `${stem}.wav`), { force: true });
767:           } catch (e) {
768:             // ignore
769:           }
770:         }
771:         for (const file of files) {
772:           const rawStem = file.replace(/\.wav$/i, '');
773:           // htdemucs_6s has 6 stems; guitar is merged into other for our UI.
774:           const stem = rawStem === 'guitar' ? 'other' : rawStem;
775:           if (STEMS.includes(stem)) {
776:             const src = path.join(modelDir, file);
777:             const dst = path.join(stemsDir, `${stem}.wav`);
778:             await fs.copyFile(src, dst);
779:           }
780:         }
781:         resolve();
782:       } catch (err) {
783:         reject(err);
784:       }
785:     });
786:   });
787: }
788: 
789: async function createSimulatedStems(trackId) {
790:   const studioDir = await ensureStudioDir();
791:   const stemsDir = path.join(studioDir, trackId, 'stems');
792:   await fs.mkdir(stemsDir, { recursive: true });
793: 
794:   const freqs = { bass: 80, drums: 200, vocals: 440, other: 660, piano: 880 };
795:   for (const stem of STEMS) {
796:     const wav = await createBeepWav(2, freqs[stem]);
797:     await fs.writeFile(path.join(stemsDir, `${stem}.wav`), wav);
798:   }
799: }
800: 
801: function setupStudioIPC() {
802:   console.log('[StudioIPC] registering studio handlers...');
803:   ipcMain.handle('studio:select-file', async () => {
804:     if (!mainWindow) return null;
805:     const result = await dialog.showOpenDialog(mainWindow, {
806:       title: 'Importer un morceau',
807:       properties: ['openFile'],
808:       filters: [
809:         { name: 'Formats supportés (MP3, WAV, M4A, MP4)', extensions: ['mp3', 'wav', 'm4a', 'mp4'] },
810:       ],
811:     });
812:     return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
813:   });
814: 
815:   ipcMain.handle('studio:separate', async (event, trackId, inputPath) => {
816:     console.log('[Studio] separation requested for', trackId, inputPath);
817:     try {
818:       const installed = await demucsInstalled();
819:       console.log('[Studio] demucs installed:', installed);
820:       if (installed) {
821:         await runDemucs(trackId, inputPath);
822:         console.log('[Studio] demucs separation done for', trackId);
823:         return { success: true, simulated: false };
824:       }
825:       await createSimulatedStems(trackId);
826:       return { success: true, simulated: true };
827:     } catch (err) {
828:       console.error('[Studio] separation failed:', err);
829:       // Fallback to simulated stems so tests can continue
830:       await createSimulatedStems(trackId);
831:       return { success: true, simulated: true, error: err.message };
832:     }
833:   });
834: 
835:   ipcMain.handle('studio:is-separated', async (event, trackId) => {
836:     const studioDir = await ensureStudioDir();
837:     for (const stem of STEMS) {
838:       try {
839:         await fs.access(path.join(studioDir, trackId, 'stems', `${stem}.wav`));
840:       } catch {
841:         return false;
842:       }
843:     }
844:     return true;
845:   });
846: 
847:   ipcMain.handle('studio:get-stems', async (event, trackId) => {
848:     const studioDir = await ensureStudioDir();
849:     const paths = {};
850:     for (const stem of STEMS) {
851:       const p = path.join(studioDir, trackId, 'stems', `${stem}.wav`);
852:       try {
853:         await fs.access(p);
854:         paths[stem] = p;
855:       } catch {
856:         paths[stem] = null;
857:       }
858:     }
859:     return paths;
860:   });
861: 
862:   // [OpenCode] — 2026-07-04 — Audio extraction, waveform and pitch-shift IPCs.
863:   ipcMain.handle('studio:extract-audio', async (event, trackId, inputPath) => {
864:     const studioDir = await ensureStudioDir();
865:     const trackDir = path.join(studioDir, trackId);
866:     await fs.mkdir(trackDir, { recursive: true });
867:     const outputWav = path.join(trackDir, 'audio.wav');
868:     await extractTrackAudio(inputPath, outputWav);
869:     return outputWav;
870:   });
871: 
872:   console.log('[StudioIPC] registering studio:trim-region handler');
873:   ipcMain.handle('studio:trim-region', async (event, trackId, inputPath, startSec, endSec) => {
874:     console.log('[StudioIPC] trim-region called for', trackId, inputPath, startSec, endSec);
875:     const studioDir = await ensureStudioDir();
876:     const tempDir = path.join(studioDir, 'temp');
877:     await fs.mkdir(tempDir, { recursive: true });
878:     const outputWav = path.join(tempDir, `${trackId}_region_${Date.now()}.wav`);
879:     await runAudioProcessor(['trim', inputPath, outputWav, String(startSec), String(endSec)]);
880:     return outputWav;
881:   });
882: 
883:   ipcMain.handle('studio:generate-waveform', async (event, wavPath) => {
884:     const trackId = path.basename(path.dirname(wavPath));
885:     return await generateWaveform(wavPath, (percent) => {
886:       if (mainWindow && !mainWindow.isDestroyed()) {
887:         mainWindow.webContents.send('studio:waveform-progress', { trackId, percent });
888:       }
889:     });
890:   });
891: 
892:   ipcMain.handle('studio:pitch-shift', async (event, trackId, semitones, startSec, endSec, useStems) => {
893:     const studioDir = await ensureStudioDir();
894:     const trackDir = path.join(studioDir, trackId);
895:     const tempWav = path.join(trackDir, `shifted_${Date.now()}.wav`);
896: 
897:     let inputWav = path.join(trackDir, 'audio.wav');
898:     if (useStems) {
899:       const stemPaths = [];
900:       for (const stem of STEMS) {
901:         const p = path.join(trackDir, 'stems', `${stem}.wav`);
902:         try {
903:           await fs.access(p);
904:           stemPaths.push(p);
905:         } catch {
906:           // missing stem
907:         }
908:       }
909:       if (stemPaths.length > 0) {
910:         inputWav = path.join(trackDir, 'stems_master.wav');
911:         await mixStemsToMaster(stemPaths, inputWav);
912:       }
913:     }
914: 
915:     await pitchShiftRegion(inputWav, tempWav, semitones, startSec, endSec);
916:     return tempWav;
917:   });
918: 
919:   ipcMain.handle('studio:pitch-shift-stems', async (event, trackId, semitones, startSec, endSec, stemPathsMap) => {
920:     const studioDir = await ensureStudioDir();
921:     const trackDir = path.join(studioDir, trackId);
922:     const outputDir = path.join(trackDir, `shifted_stems_${Date.now()}`);
923:     await fs.mkdir(outputDir, { recursive: true });
924: 
925:     // Clean up older shifted stem folders to avoid accumulation.
926:     try {
927:       const entries = await fs.readdir(trackDir);
928:       for (const entry of entries) {
929:         if (entry.startsWith('shifted_stems_')) {
930:           const fullPath = path.join(trackDir, entry);
931:           const stat = await fs.stat(fullPath);
932:           if (stat.isDirectory()) {
933:             await fs.rm(fullPath, { recursive: true, force: true });
934:           }
935:         }
936:       }
937:     } catch (e) {
938:       // ignore cleanup errors
939:     }
940: 
941:     const json = JSON.stringify(stemPathsMap);
942:     const resultJson = await runAudioProcessor([
943:       'pitch-shift-stems',
944:       json,
945:       outputDir,
946:       String(semitones),
947:       String(startSec),
948:       endSec !== null ? String(endSec) : '',
949:     ]);
950: 
951:     const resultLines = resultJson.split('\n').filter(Boolean);
952:     const result = JSON.parse(resultLines[resultLines.length - 1]);
953:     return result;
954:   });
955: 
956:   ipcMain.handle('studio:cleanup-shifted', async (event, trackId) => {
957:     const studioDir = await ensureStudioDir();
958:     const trackDir = path.join(studioDir, trackId);
959:     try {
960:       const entries = await fs.readdir(trackDir);
961:       for (const entry of entries) {
962:         if (entry.startsWith('shifted_') && entry.endsWith('.wav')) {
963:           await fs.rm(path.join(trackDir, entry), { force: true });
964:         }
965:       }
966:     } catch (e) {
967:       // ignore
968:     }
969:     return true;
970:   });
971: 
972:   // [Claude] — 2026-07-08 — Analyse audio automatique pour l'onglet Analyse.
973:   // Extrait la piste audio du fichier importé, lance analyze-chords, retourne la grille enrichie.
974:   // Si le fichier a déjà été séparé dans le Studio, on analyse le stem piano isolé
975:   // pour plus de précision, tout en conservant le mix original pour la lecture.
976:   ipcMain.handle('analyzer:process-file', async (event, filePath, options = {}) => {
977:     const tmpDir = path.join(os.tmpdir(), `pjc-analyze-${Date.now()}`);
978:     await fs.mkdir(tmpDir, { recursive: true });
979:     const playbackWav = path.join(tmpDir, 'audio.wav');
980: 
981:     try {
982:       const pianoStem = await findStudioPianoStemForFile(filePath);
983:       if (pianoStem) {
984:         console.log('[Analyzer] using Studio piano stem:', pianoStem);
985:       }
986: 
987:       // Find bass stem if requested
988:       const bassStem = options.analyzeBass !== false
989:         ? await findStudioBassStemForFile(filePath) : null;
990:       if (bassStem) {
991:         console.log('[Analyzer] using Studio bass stem for bass detection:', bassStem);
992:       }
993: 
994:       // Durée du fichier original importé, indépendamment du stem utilisé pour l'analyse.
995:       let duration = null;
996:       try {
997:         const probeJson = await runAudioProcessor(['probe', filePath]);
998:         const probeLines = probeJson.split('\n').filter(Boolean);
999:         const probeResult = JSON.parse(probeLines[probeLines.length - 1]);
1000:         duration = probeResult.duration;
1001:       } catch (probeErr) {
1002:         console.warn('[Analyzer] probe duration failed:', probeErr.message);
1003:       }
1004: 
1005:       // La lecture utilise toujours le mix original.
1006:       await extractTrackAudio(filePath, playbackWav);
1007: 
1008:       // L'analyse des accords utilise le piano isolé si disponible, sinon le mix.
1009:       const analysisWav = pianoStem || playbackWav;
1010:       const chordArgs = ['analyze-chords', analysisWav];
1011:       if (options.observationMode && options.observationMode !== 'baseline') {
1012:         chordArgs.push(`--observation-mode=${options.observationMode}`);
1013:       }
1014:       if (options.contradictionWeight != null) {
1015:         chordArgs.push(`--contradiction-weight=${options.contradictionWeight}`);
1016:       }
1017:       if (options.discriminatorThreshold != null) {
1018:         chordArgs.push(`--discriminator-threshold=${options.discriminatorThreshold}`);
1019:       }
1020:       if (options.discriminatorStrength != null) {
1021:         chordArgs.push(`--discriminator-strength=${options.discriminatorStrength}`);
1022:       }
1023:       const chordJson = await runAudioProcessor(chordArgs);
1024:       const lines = chordJson.split('\n').filter(Boolean);
1025:       const result = JSON.parse(lines[lines.length - 1]);
1026: 
1027:       // Analyse de la basse via Fusion Engine
1028:       let bassSegments = [];
1029:       if (options.analyzeBass !== false) {
1030:         try {
1031:           const bassWav = bassStem || playbackWav;
1032:           console.log('[Analyzer] running bass analysis on:', bassWav);
1033:           bassSegments = await runBassAnalysis(bassWav, result, tmpDir);
1034:           console.log(`[Analyzer] bass analysis done: ${bassSegments.length} segments`);
1035:         } catch (bassErr) {
1036:           console.warn('[Analyzer] bass analysis failed (fallback to chords only):', bassErr.message);
1037:         }
1038:       }
1039: 
1040:       return {
1041:         wavPath: playbackWav,
1042:         analysisWavPath: analysisWav,
1043:         usedPianoStem: Boolean(pianoStem),
1044:         usedBassStem: Boolean(bassStem),
1045:         duration: duration ?? result.duration ?? 0,
1046:         tempo: result.tempo ?? null,
1047:         timeSignature: result.timeSignature ?? '4/4',
1048:         key: result.key ?? null,
1049:         keyConfidence: result.keyConfidence ?? 0,
1050:         confidence: result.confidence ?? 0,
1051:         chords: result.chords ?? [],
1052:         bassSegments: bassSegments,
1053:       };
1054:     } catch (err) {
1055:       console.error('[Analyzer] process-file failed:', err);
1056:       throw err;
1057:     }
1058:   });
1059: 
1060:   // [Claude] — 2026-07-07 — Screen Recorder : source vidéo via desktopCapturer.
1061:   // Le renderer demande l'id de la source de la fenêtre de l'application.
1062:   ipcMain.handle('studio:get-screen-source-id', async () => {
1063:     try {
1064:       if (!mainWindow || mainWindow.isDestroyed()) {
1065:         return { error: 'Fenêtre principale indisponible' };
1066:       }
1067:       // Utilise l'API fiable de la fenêtre plutôt qu'une recherche par titre
1068:       // dans desktopCapturer.getSources(), qui peut échouer si le titre change
1069:       // ou si la source n'est pas encore listée.
1070:       const sourceId = mainWindow.getMediaSourceId();
1071:       if (!sourceId) {
1072:         return { error: 'Source d\'écran introuvable' };
1073:       }
1074:       return { id: sourceId };
1075:     } catch (err) {
1076:       console.error('[Studio] getMediaSourceId failed:', err);
1077:       return { error: err.message };
1078:     }
1079:   });
1080: 
1081:   // [Claude] — 2026-07-07 — Screen Recorder : dialogue de sauvegarde du Blob enregistré.
1082:   ipcMain.handle('studio:save-recording', async (event, arrayBuffer) => {
1083:     if (!mainWindow || mainWindow.isDestroyed()) return { canceled: true };
1084:     const home = os.homedir();
1085:     const desktopCandidates = ['Desktop', 'Bureau', 'Schreibtisch', 'Escritorio', 'Scrivania', 'Рабочий стол'];
1086:     let desktopDir = null;
1087:     for (const name of desktopCandidates) {
1088:       const candidate = path.join(home, name);
1089:       try {
1090:         await fs.access(candidate);
1091:         desktopDir = candidate;
1092:         break;
1093:       } catch (_) {}
1094:     }
1095:     const defaultPath = path.join(desktopDir || home, `studio-record-${Date.now()}.mp4`);
1096:     const result = await dialog.showSaveDialog(mainWindow, {
1097:       title: 'Enregistrer la vidéo',
1098:       defaultPath,
1099:       filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }],
1100:     });
1101:     if (result.canceled) return { canceled: true };
1102: 
1103:     try {
1104:       // MediaRecorder produit un WebM. On le remux en MP4 H.264 + AAC via ffmpeg.
1105:       const tmpWebm = path.join(os.tmpdir(), `studio-record-${Date.now()}.webm`);
1106:       await fs.writeFile(tmpWebm, Buffer.from(arrayBuffer));
1107:       await new Promise((resolve, reject) => {
1108:         const proc = spawn('ffmpeg', [
1109:           '-y',
1110:           '-i', tmpWebm,
1111:           '-c:v', 'libx264',
1112:           '-preset', 'fast',
1113:           '-crf', '23',
1114:           '-pix_fmt', 'yuv420p',
1115:           '-c:a', 'aac',
1116:           '-b:a', '128k',
1117:           '-movflags', '+faststart',
1118:           result.filePath,
1119:         ], { shell: false });
1120:         let stderr = '';
1121:         proc.stderr.on('data', (data) => { stderr += data.toString(); });
1122:         proc.on('error', reject);
1123:         proc.on('exit', (code) => {
1124:           fs.rm(tmpWebm, { force: true }).catch(() => {});
1125:           code !== 0 ? reject(new Error(stderr || `ffmpeg exit ${code}`)) : resolve();
1126:         });
1127:       });
1128:       return { canceled: false, path: result.filePath };
1129:     } catch (err) {
1130:       console.error('[Studio] save recording failed:', err);
1131:       throw err;
1132:     }
1133:   });
1134: 
1135:   // Legacy handlers supprimés / inactifs.
1136:   ipcMain.handle('studio:get-window-source', async () => null);
1137:   ipcMain.handle('studio:save-video', async () => null);
1138:   ipcMain.handle('studio:start-screen-record', async () => ({ error: 'deprecated' }));
1139:   ipcMain.handle('studio:stop-screen-record', async () => ({ error: 'deprecated' }));
1140:   ipcMain.handle('studio:save-dialog', async () => ({ canceled: true }));
1141:   ipcMain.handle('studio:save-recorded-video', async () => ({ error: 'deprecated' }));
1142: }
1143: 
1144: app.whenReady().then(() => {
1145:   requestMidiPermission();
1146:   setupFileSystemIPC();
1147:   setupStudioIPC();
1148:   createWindow();
1149: 
1150:   // Poll native MIDI ports so hot-plugged keyboards/synths are detected automatically.
1151:   // [OpenCode] — 2026-07-04 — Even when a port is open we still scan to detect hot-unplug.
1152:   setInterval(() => {
1153:     if (nativeMidiFailed) return;
1154:     const inputs = getMidiInputs();
1155: 
1156:     // [Claude] — 2026-07-03 — Hot-plug handling : if the currently opened port disappeared, close it and notify renderer.
1157:     if (currentInputId !== null) {
1158:       const stillAvailable = inputs.some((input) => input.id === currentInputId);
1159:       if (!stillAvailable) {
1160:         console.log('[MIDI] current port lost, closing input');
1161:         closeMidiInput();
1162:         if (mainWindow && !mainWindow.isDestroyed()) {
1163:           mainWindow.webContents.send('midi-port-lost', { previousId: currentInputId, previousName: currentInputName });
1164:         }
1165:       }
1166:     }
1167: 
1168:     // [OpenCode] — 2026-07-04 — If current port vanished but same name came back with a new id, reconnect.
1169:     if (!midiInput && currentInputName) {
1170:       reconnectByName(inputs);
1171:     }
1172: 
1173:     if (inputsChanged(inputs, lastSeenInputs)) {
1174:       console.log('[MIDI] ports changed:', inputs.map((i) => i.name).join(', ') || 'none');
1175:       lastSeenInputs = inputs;
1176:       if (mainWindow && !mainWindow.isDestroyed()) {
1177:         mainWindow.webContents.send('midi-devices-changed', inputs);
1178:       }
1179:     }
1180: 
1181:     // [OpenCode] — 2026-07-04 — Auto-connect a hardware device if nothing is open yet.
1182:     if (!midiInput && inputs.length > 0) {
1183:       autoOpenHardwareInput(inputs);
1184:     }
1185:   }, 2000);
1186: 
1187:   ipcMain.handle('midi:get-inputs', () => {
1188:     return getMidiInputs();
1189:   });
1190: 
1191:   ipcMain.handle('midi:refresh-inputs', () => {
1192:     // Close the active input before re-enumerating to avoid ALSA 'port in use' issues
1193:     closeMidiInput();
1194:     closeMidiInputEnumerator();
1195:     const inputs = getMidiInputs();
1196:     if (mainWindow && !mainWindow.isDestroyed()) {
1197:       mainWindow.webContents.send('midi-devices-changed', inputs);
1198:     }
1199:     // [OpenCode] — 2026-07-04 — After a manual refresh, try to auto-connect a hardware device.
1200:     const auto = autoOpenHardwareInput(inputs);
1201:     if (auto) {
1202:       inputs.forEach((input) => sendMidiLog('port', { id: input.id, name: input.name }));
1203:     }
1204:     return inputs;
1205:   });
1206: 
1207:   // [Claude] — 2026-07-03 — Return the actually opened port id so the renderer can track the current input
1208:   ipcMain.handle('midi:open-input', (event, portId) => {
1209:     const result = openMidiInput(portId);
1210:     return result;
1211:   });
1212: 
1213:   ipcMain.handle('midi:close-input', () => {
1214:     closeMidiInput();
1215:     return true;
1216:   });
1217: 
1218:   ipcMain.handle('system:audio-groups', () => {
1219:     return userAudioGroups();
1220:   });
1221: 
1222:   ipcMain.handle('app:log', (event, msg) => {
1223:     console.log(`[RENDERER] ${msg}`);
1224:   });
1225: 
1226:   // Forward renderer console messages to terminal for debugging
1227:   mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
1228:     console.log(`[RENDERER-CONSOLE ${sourceId}:${line}] ${message}`);
1229:   });
1230: 
1231:   app.on('activate', () => {
1232:     if (BrowserWindow.getAllWindows().length === 0) createWindow();
1233:   });
1234: });
1235: 
1236: app.on('window-all-closed', () => {
1237:   closeMidiInput();
1238:   closeMidiInputEnumerator();
1239:   if (process.platform !== 'darwin') app.quit();
1240: });

(End of file - total 1240 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/electron/preload.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/electron/preload.js</path>
<type>file</type>
<content>
1: import { contextBridge, ipcRenderer } from 'electron';
2: 
3: function getIAEnvVars() {
4:   const env = {};
5:   try {
6:     for (const key of Object.keys(process.env || {})) {
7:       if (key.startsWith('IA_')) env[key] = process.env[key];
8:     }
9:   } catch (e) { /* process.env inaccessible selon le sandboxing */ }
10:   return env;
11: }
12: 
13: contextBridge.exposeInMainWorld('electronAPI', {
14:   env: getIAEnvVars(),
15:   midi: {
16:     getInputs: () => ipcRenderer.invoke('midi:get-inputs'),
17:     refreshInputs: () => ipcRenderer.invoke('midi:refresh-inputs'),
18:     openInput: (portId) => ipcRenderer.invoke('midi:open-input', portId),
19:     closeInput: () => ipcRenderer.invoke('midi:close-input'),
20:     onNoteOn: (callback) => ipcRenderer.on('midi-note-on', (event, data) => callback(data)),
21:     onNoteOff: (callback) => ipcRenderer.on('midi-note-off', (event, data) => callback(data)),
22:     onSustain: (callback) => ipcRenderer.on('midi-sustain', (event, data) => callback(data)),
23:     onModWheel: (callback) => ipcRenderer.on('midi-mod-wheel', (event, data) => callback(data)),
24:     onPitchWheel: (callback) => ipcRenderer.on('midi-pitch-wheel', (event, data) => callback(data)),
25:     onMidiLog: (callback) => ipcRenderer.on('midi-log', (event, data) => callback(data)),
26:     onDevicesChanged: (callback) => ipcRenderer.on('midi-devices-changed', (event, data) => callback(data)),
27:     onPortLost: (callback) => ipcRenderer.on('midi-port-lost', (event, data) => callback(data)),
28:     onDeviceConnected: (callback) => ipcRenderer.on('midi-device-connected', (event, data) => callback(data)),
29:   },
30:   system: {
31:     getAudioGroups: () => ipcRenderer.invoke('system:audio-groups'),
32:   },
33:   log: (msg) => ipcRenderer.invoke('app:log', msg),
34:   files: {
35:     homeDir: () => ipcRenderer.invoke('files:home-dir'),
36:     ensureDir: (dirPath) => ipcRenderer.invoke('files:ensure-dir', dirPath),
37:     readDir: (dirPath) => ipcRenderer.invoke('files:read-dir', dirPath),
38:     writeFile: (filePath, content) => ipcRenderer.invoke('files:write-file', filePath, content),
39:     writeBinary: (filePath, data) => ipcRenderer.invoke('files:write-binary', filePath, data),
40:     readFile: (filePath) => ipcRenderer.invoke('files:read-file', filePath),
41:     readBinary: (filePath) => ipcRenderer.invoke('files:read-binary', filePath),
42:     exists: (filePath) => ipcRenderer.invoke('files:exists', filePath),
43:     deleteDir: (dirPath) => ipcRenderer.invoke('files:delete-dir', dirPath),
44:     deleteFile: (filePath) => ipcRenderer.invoke('files:delete-file', filePath),
45:   },
46:   studio: {
47:     selectFile: () => ipcRenderer.invoke('studio:select-file'),
48:     separate: (trackId, inputPath) => ipcRenderer.invoke('studio:separate', trackId, inputPath),
49:     isSeparated: (trackId) => ipcRenderer.invoke('studio:is-separated', trackId),
50:     getStems: (trackId) => ipcRenderer.invoke('studio:get-stems', trackId),
51:     onSeparationProgress: (callback) => {
52:       const handler = (event, data) => callback(data);
53:       ipcRenderer.on('studio:separation-progress', handler);
54:       return () => ipcRenderer.removeListener('studio:separation-progress', handler);
55:     },
56:     extractAudio: (trackId, inputPath) => ipcRenderer.invoke('studio:extract-audio', trackId, inputPath),
57:     trimRegion: (trackId, inputPath, startSec, endSec) => ipcRenderer.invoke('studio:trim-region', trackId, inputPath, startSec, endSec),
58:     generateWaveform: (wavPath) => ipcRenderer.invoke('studio:generate-waveform', wavPath),
59:     onWaveformProgress: (callback) => {
60:       const handler = (event, data) => callback(data);
61:       ipcRenderer.on('studio:waveform-progress', handler);
62:       return () => ipcRenderer.removeListener('studio:waveform-progress', handler);
63:     },
64:     pitchShift: (trackId, semitones, startSec, endSec, useStems) => ipcRenderer.invoke('studio:pitch-shift', trackId, semitones, startSec, endSec, useStems),
65:     pitchShiftStems: (trackId, semitones, startSec, endSec, stemPaths) => ipcRenderer.invoke('studio:pitch-shift-stems', trackId, semitones, startSec, endSec, stemPaths),
66:     cleanupShifted: (trackId) => ipcRenderer.invoke('studio:cleanup-shifted', trackId),
67:   },
68: });

(End of file - total 68 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/electron/preload.cjs"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/electron/preload.cjs</path>
<type>file</type>
<content>
1: const { contextBridge, ipcRenderer } = require('electron');
2: 
3: // Expose les variables d'environnement IA_* définies dans .env
4: function getIAEnvVars() {
5:   const env = {};
6:   try {
7:     for (const key of Object.keys(process.env || {})) {
8:       if (key.startsWith('IA_')) env[key] = process.env[key];
9:     }
10:   } catch (e) {
11:     // process.env inaccessible selon le sandboxing
12:   }
13:   return env;
14: }
15: 
16: contextBridge.exposeInMainWorld('electronAPI', {
17:   env: getIAEnvVars(),
18:   midi: {
19:     getInputs: () => ipcRenderer.invoke('midi:get-inputs'),
20:     refreshInputs: () => ipcRenderer.invoke('midi:refresh-inputs'),
21:     openInput: (portId) => ipcRenderer.invoke('midi:open-input', portId),
22:     closeInput: () => ipcRenderer.invoke('midi:close-input'),
23:     onNoteOn: (callback) => ipcRenderer.on('midi-note-on', (event, data) => callback(data)),
24:     onNoteOff: (callback) => ipcRenderer.on('midi-note-off', (event, data) => callback(data)),
25:     onSustain: (callback) => ipcRenderer.on('midi-sustain', (event, data) => callback(data)),
26:     onModWheel: (callback) => ipcRenderer.on('midi-mod-wheel', (event, data) => callback(data)),
27:     onPitchWheel: (callback) => ipcRenderer.on('midi-pitch-wheel', (event, data) => callback(data)),
28:     onMidiLog: (callback) => ipcRenderer.on('midi-log', (event, data) => callback(data)),
29:     onDevicesChanged: (callback) => ipcRenderer.on('midi-devices-changed', (event, data) => callback(data)),
30:     onPortLost: (callback) => ipcRenderer.on('midi-port-lost', (event, data) => callback(data)),
31:     onDeviceConnected: (callback) => ipcRenderer.on('midi-device-connected', (event, data) => callback(data)),
32:   },
33:   system: {
34:     getAudioGroups: () => ipcRenderer.invoke('system:audio-groups'),
35:   },
36:   log: (msg) => ipcRenderer.invoke('app:log', msg),
37:   files: {
38:     homeDir: () => ipcRenderer.invoke('files:home-dir'),
39:     ensureDir: (dirPath) => ipcRenderer.invoke('files:ensure-dir', dirPath),
40:     readDir: (dirPath) => ipcRenderer.invoke('files:read-dir', dirPath),
41:     writeFile: (filePath, content) => ipcRenderer.invoke('files:write-file', filePath, content),
42:     writeBinary: (filePath, data) => ipcRenderer.invoke('files:write-binary', filePath, data),
43:     readFile: (filePath) => ipcRenderer.invoke('files:read-file', filePath),
44:     readBinary: (filePath) => ipcRenderer.invoke('files:read-binary', filePath),
45:     exists: (filePath) => ipcRenderer.invoke('files:exists', filePath),
46:     deleteDir: (dirPath) => ipcRenderer.invoke('files:delete-dir', dirPath),
47:     deleteFile: (filePath) => ipcRenderer.invoke('files:delete-file', filePath),
48:     saveDialog: (options) => ipcRenderer.invoke('files:save-dialog', options),
49:     stat: (filePath) => ipcRenderer.invoke('files:stat', filePath),
50:     rename: (oldPath, newPath) => ipcRenderer.invoke('files:rename', oldPath, newPath),
51:   },
52:   analyzer: {
53:     processFile: (filePath, options = {}) => ipcRenderer.invoke('analyzer:process-file', filePath, options),
54:   },
55:   studio: {
56:     selectFile: () => ipcRenderer.invoke('studio:select-file'),
57:     separate: (trackId, inputPath) => ipcRenderer.invoke('studio:separate', trackId, inputPath),
58:     isSeparated: (trackId) => ipcRenderer.invoke('studio:is-separated', trackId),
59:     getStems: (trackId) => ipcRenderer.invoke('studio:get-stems', trackId),
60:     onSeparationProgress: (callback) => {
61:       const handler = (event, data) => callback(data);
62:       ipcRenderer.on('studio:separation-progress', handler);
63:       return () => ipcRenderer.removeListener('studio:separation-progress', handler);
64:     },
65:     extractAudio: (trackId, inputPath) => ipcRenderer.invoke('studio:extract-audio', trackId, inputPath),
66:     trimRegion: (trackId, inputPath, startSec, endSec) => ipcRenderer.invoke('studio:trim-region', trackId, inputPath, startSec, endSec),
67:     generateWaveform: (wavPath) => ipcRenderer.invoke('studio:generate-waveform', wavPath),
68:     onWaveformProgress: (callback) => {
69:       const handler = (event, data) => callback(data);
70:       ipcRenderer.on('studio:waveform-progress', handler);
71:       return () => ipcRenderer.removeListener('studio:waveform-progress', handler);
72:     },
73:     pitchShift: (trackId, semitones, startSec, endSec, useStems) => ipcRenderer.invoke('studio:pitch-shift', trackId, semitones, startSec, endSec, useStems),
74:     pitchShiftStems: (trackId, semitones, startSec, endSec, stemPaths) => ipcRenderer.invoke('studio:pitch-shift-stems', trackId, semitones, startSec, endSec, stemPaths),
75:     cleanupShifted: (trackId) => ipcRenderer.invoke('studio:cleanup-shifted', trackId),
76:     getWindowSource: () => ipcRenderer.invoke('studio:get-window-source'),
77:     saveVideo: (arrayBuffer) => ipcRenderer.invoke('studio:save-video', arrayBuffer),
78:     getScreenSourceId: () => ipcRenderer.invoke('studio:get-screen-source-id'),
79:     saveRecording: (arrayBuffer) => ipcRenderer.invoke('studio:save-recording', arrayBuffer),
80:   },
81: });

(End of file - total 81 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/vite.config.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/vite.config.js</path>
<type>file</type>
<content>
1: import { defineConfig } from 'vite';
2: import path from 'path';
3: import tailwindcss from '@tailwindcss/vite';
4: 
5: export default defineConfig({
6:   root: 'src',
7:   base: './',
8:   plugins: [tailwindcss()],
9:   build: {
10:     outDir: '../dist',
11:     emptyOutDir: true,
12:     rollupOptions: {
13:       input: {
14:         main: path.resolve(__dirname, 'src/index.html'),
15:       },
16:     },
17:   },
18:   server: {
19:     port: 5173,
20:   },
21: });

(End of file - total 21 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 6.5s)

_Thinking:_

Let me now read the key files for the analysis tab, MIDI pipeline, chord engine, voicing engine, AI integration, and other criticalmodules.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ui/analyzer-tab.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ui/analyzer-tab.js</path>
<type>file</type>
<content>
1: import { selectMediaFile, createAudioPlayer, isSupportedMediaFile } from '../audio/media-engine.js';
2: import { createAudioAnalyzer } from '../analyzer/audio-analyzer.js';
3: import {
4:   exportAnalysisToMidi,
5:   exportAnalysisToJson,
6:   exportAnalysisToText,
7:   computeProductStatistics,
8:   countManuallyEditedChords,
9: } from '../analyzer/analysis-export.js';
10: import { miniKeyboardForNotes } from './mini-keyboard.js';
11: import {
12:   updateVoicingPreviewForChord,
13:   clearVoicingTextPreview,
14:   initVoicingStyle,
15:   getVoicingStyle,
16:   selectVoicingStyle,
17:   setRerenderActiveVoicing,
18:   renderVoicingStyleSelector,
19: } from './voicing-preview.js';
20: import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
21: import { noteNameToPc } from '../chord-engine/intervals.js';
22: import { ChordEditor, makeSegmentId, NOTE_NAMES } from './chord-editor.js';
23: import {
24:   getEffectiveChord,
25:   normalizeOverride,
26:   formatEffectiveChord,
27:   deriveChordDisplay,
28: } from '../chord-engine/chord-display.js';
29: import {
30:   buildProjectPath,
31:   buildProjectData,
32:   validateProjectSchema,
33:   verifyAudioIdentity,
34:   tryApplyProjectOverrides,
35: } from './chord-editor.js';
36: 
37: const BASE_PIXELS_PER_SECOND = 80;
38: const MIN_BLOCK_WIDTH = 4;
39: const BLOCK_GAP = 4;
40: 
41: let timelineZoom = 1.0;
42: 
43: let undoStack = [];
44: let redoStack = [];
45: const MAX_UNDO = 50;
46: 
47: let chordEditor = null;
48: 
49: const els = {
50:   importScreen: document.getElementById('analyzer-import-screen'),
51:   importBtn: document.getElementById('analyzer-import-btn'),
52:   results: document.getElementById('analyzer-results'),
53:   backBtn: document.getElementById('analyzer-back-btn'),
54: 
55:   songTitle: document.getElementById('analyzer-song-title'),
56:   songArtist: document.getElementById('analyzer-song-artist'),
57:   stemBadge: document.getElementById('analyzer-stem-badge'),
58: 
59:   prevBtn: document.getElementById('analyzer-prev-btn'),
60:   playBtn: document.getElementById('analyzer-play-btn'),
61:   progressTrack: document.getElementById('analyzer-progress-track'),
62:   progressFill: document.getElementById('analyzer-progress-fill'),
63:   progressThumb: document.getElementById('analyzer-progress-thumb'),
64:   currentTimeEl: document.getElementById('analyzer-current-time'),
65:   durationEl: document.getElementById('analyzer-duration'),
66: 
67:   zoomSlider: document.getElementById('analyzer-zoom'),
68:   zoomValue: document.getElementById('analyzer-zoom-value'),
69: 
70:   chordTimeline: document.getElementById('analyzer-chord-timeline'),
71:   chordTimelineInner: document.getElementById('analyzer-chord-timeline-inner'),
72:   timelineScrollLeft: document.getElementById('analyzer-timeline-scroll-left'),
73:   timelineScrollRight: document.getElementById('analyzer-timeline-scroll-right'),
74: 
75:   audioContainer: document.getElementById('analyzer-audio-container'),
76: 
77:   sectionTabs: document.querySelectorAll('#analyzer-section-tabs button[data-section]'),
78:   sectionPanels: document.querySelectorAll('#analyzer-section-panels > [data-section]'),
79: 
80:   exportMidiBtn: document.getElementById('analyzer-export-midi-btn'),
81:   exportJsonBtn: document.getElementById('analyzer-export-json-btn'),
82:   copyTextBtn: document.getElementById('analyzer-copy-text-btn'),
83:   statsContent: document.getElementById('analyzer-stats-content'),
84: 
85:   // Hero chord (sous la timeline)
86:   hero: document.getElementById('analyzer-hero'),
87:   heroName: document.getElementById('analyzer-hero-name'),
88:   heroNotes: document.getElementById('analyzer-hero-notes'),
89:   heroKeyboard: document.getElementById('analyzer-hero-keyboard'),
90: 
91:   processing: document.getElementById('analyzer-processing'),
92:   processingText: document.getElementById('analyzer-processing-text'),
93: };
94: 
95: let analyzer = null;
96: let currentPlayer = null;
97: let currentAnalysis = null;
98: let currentFileName = '';
99: let currentAudioPath = '';
100: let isDraggingProgress = false;
101: let lastAutoScrollIndex = -1;
102: let lastRenderedVoicingChord = null;
103: let lastRenderedVoicingStyle = null;
104: 
105: // Phase B : persistance
106: let projectDirty = false;
107: let projectPath = null;
108: let audioIdentity = null;
109: let saveStatusEl = null;
110: let currentProjectOrphanedOverrides = {};
111: 
112: export function initAnalyzerTab() {
113:   analyzer = createAudioAnalyzer();
114:   bindImportButton();
115:   bindPlayerControls();
116:   bindToolbar();
117:   initTimelineZoom();
118:   bindTimelineScroll();
119:   bindSectionTabs();
120:   bindExportMidiButton();
121:   bindExportJsonButton();
122:   bindCopyTextButton();
123:   initChordEditor();
124:   initKeyboardShortcuts();
125: }
126: 
127: function bindImportButton() {
128:   els.importBtn?.addEventListener('click', handleImportClick);
129:   els.backBtn?.addEventListener('click', showImportScreen);
130: }
131: 
132: async function handleImportClick() {
133:   try {
134:     const filePath = await selectMediaFile();
135:     if (!filePath) return;
136: 
137:     if (!isSupportedMediaFile(filePath)) {
138:       alert('Format non supporté. Formats acceptés : MP3, WAV, MP4, M4A.');
139:       return;
140:     }
141: 
142:     currentAudioPath = filePath;
143:     currentFileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
144:     showProcessing('Extraction audio en cours…');
145: 
146:     const analysis = await analyzer.analyze(filePath);
147:     currentAnalysis = analysis;
148: 
149:     showResults(analysis);
150:   } catch (err) {
151:     console.error('[Analyzer] import failed:', err);
152:     hideProcessing();
153:     alert(`Erreur d'analyse : ${err.message}`);
154:   }
155: }
156: 
157: function showProcessing(text) {
158:   els.processingText.textContent = text;
159:   els.processing.style.display = 'flex';
160: }
161: 
162: function hideProcessing() {
163:   els.processing.style.display = 'none';
164: }
165: 
166: async function showResults(analysis) {
167:   hideProcessing();
168:   els.importScreen.style.display = 'none';
169:   els.results.style.display = 'flex';
170:   currentAnalysis = analysis;
171:   enrichSegments(analysis.chords);
172:   resetUndoRedo();
173:   chordEditor?.close();
174:   resetZoom();
175:   lastRenderedVoicingChord = null;
176:   lastRenderedVoicingStyle = null;
177: 
178:   initVoicingStyle();
179:   setRerenderActiveVoicing(() => {
180:     lastRenderedVoicingChord = null;
181:     lastRenderedVoicingStyle = null;
182:     if (currentPlayer) {
183:       updatePlaybackPosition(currentPlayer.element?.currentTime ?? 0);
184:     }
185:   });
186: 
187:   renderHeader(analysis);
188:   addSaveIndicator();
189:   await loadProjectIfExists();
190: 
191:   if (currentPlayer) {
192:     currentPlayer.destroy();
193:     currentPlayer = null;
194:   }
195: 
196:   if (analysis.wavPath) {
197:     const blobUrl = await loadAudioBlobUrl(analysis.wavPath);
198:     currentPlayer = createAudioPlayer(els.audioContainer, blobUrl, {
199:       onTimeUpdate: updatePlaybackPosition,
200:     });
201:   }
202: 
203:   renderTimeline(analysis.chords || [], analysis.duration || 0);
204:   updatePlayButton();
205:   renderStats(analysis);
206: }
207: 
208: function renderHeader(analysis) {
209:   const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'Morceau importé';
210:   els.songTitle.textContent = baseName;
211:   els.songArtist.textContent = 'Import local';
212: 
213:   if (analysis.usedPianoStem) {
214:     els.stemBadge.textContent = 'Analyse piano isolé';
215:     els.stemBadge.classList.add('visible');
216:   } else {
217:     els.stemBadge.textContent = '';
218:     els.stemBadge.classList.remove('visible');
219:   }
220: }
221: 
222: function showImportScreen() {
223:   if (currentPlayer) {
224:     currentPlayer.destroy();
225:     currentPlayer = null;
226:   }
227:   currentAnalysis = null;
228:   currentFileName = '';
229:   currentAudioPath = '';
230:   resetProjectState();
231:   resetUndoRedo();
232:   chordEditor?.close();
233:   els.results.style.display = 'none';
234:   els.importScreen.style.display = 'flex';
235:   lastRenderedVoicingChord = null;
236:   lastRenderedVoicingStyle = null;
237:   els.chordTimelineInner.innerHTML = '';
238:   if (els.hero) els.hero.style.display = 'none';
239:   clearVoicingTextPreview();
240:   els.stemBadge.textContent = '';
241:   els.stemBadge.classList.remove('visible');
242:   const bassTimeline = document.getElementById('analyzer-bass-timeline-wrapper');
243:   if (bassTimeline) bassTimeline.remove();
244:   const bassDevInfo = document.getElementById('analyzer-bass-dev-info');
245:   if (bassDevInfo) bassDevInfo.remove();
246: }
247: 
248: function formatTime(seconds) {
249:   const total = Math.max(0, Math.floor(seconds));
250:   const m = String(Math.floor(total / 60)).padStart(2, '0');
251:   const s = String(total % 60).padStart(2, '0');
252:   return `${m}:${s}`;
253: }
254: 
255: function chordNotes(chordName) {
256:   if (!chordName || chordName === 'N') return [];
257:   const slashIdx = chordName.indexOf('/');
258:   const namePart = slashIdx >= 0 ? chordName.slice(0, slashIdx) : chordName;
259:   const rootMatch = namePart.match(/^([A-G][#b]?)/);
260:   if (!rootMatch) return [];
261:   const rootPc = noteNameToPc(rootMatch[1]);
262:   if (rootPc === null) return [];
263: 
264:   const suffix = namePart.slice(rootMatch[1].length).trim();
265:   const def = CHORD_DEFINITIONS.find((d) => d.symbol === suffix && !d.parentSymbol);
266:   const intervals = def ? def.intervals : [0, 4, 7];
267: 
268:   const chordPcs = intervals.map((i) => (rootPc + i) % 12);
269: 
270:   if (slashIdx >= 0) {
271:     const bassStr = chordName.slice(slashIdx + 1).trim();
272:     const bassPc = noteNameToPc(bassStr);
273:     if (bassPc != null) {
274:       chordPcs.push(bassPc % 12);
275:     }
276:   }
277: 
278:   return [...new Set(chordPcs)];
279: }
280: 
281: function enrichSegments(chords) {
282:   if (!chords) return;
283:   for (const seg of chords) {
284:     if (!seg.segmentId) seg.segmentId = makeSegmentId(seg);
285:     if (!Object.prototype.hasOwnProperty.call(seg, 'manualOverride')) {
286:       seg.manualOverride = null;
287:     }
288:   }
289: }
290: 
291: function resetUndoRedo() {
292:   undoStack = [];
293:   redoStack = [];
294: }
295: 
296: function pushUndo(action) {
297:   undoStack.push(action);
298:   redoStack.length = 0;
299:   if (undoStack.length > MAX_UNDO) undoStack.shift();
300: }
301: 
302: function undo() {
303:   const cmd = undoStack.pop();
304:   if (!cmd) return;
305:   const seg = currentAnalysis?.chords?.[cmd.segmentIndex];
306:   if (!seg) return;
307:   seg.manualOverride = cmd.oldState;
308:   redoStack.push(cmd);
309:   rerenderTimeline();
310: }
311: 
312: function redo() {
313:   const cmd = redoStack.pop();
314:   if (!cmd) return;
315:   const seg = currentAnalysis?.chords?.[cmd.segmentIndex];
316:   if (!seg) return;
317:   seg.manualOverride = cmd.newState;
318:   undoStack.push(cmd);
319:   rerenderTimeline();
320: }
321: 
322: function rerenderTimeline() {
323:   if (currentAnalysis) {
324:     renderTimeline(currentAnalysis.chords || [], currentAnalysis.duration || 0);
325:   }
326: }
327: 
328: function applyChordOverride(segmentIndex, override) {
329:   const seg = currentAnalysis?.chords?.[segmentIndex];
330:   if (!seg) return;
331:   const normalized = normalizeOverride(seg, override);
332:   pushUndo({ segmentIndex, oldState: seg.manualOverride, newState: normalized });
333:   seg.manualOverride = normalized;
334:   markDirty();
335:   rerenderTimeline();
336: }
337: 
338: function initChordEditor() {
339:   chordEditor = new ChordEditor({
340:     onSave: (segmentIndex, override) => {
341:       applyChordOverride(segmentIndex, override);
342:     },
343:     onCancel: () => {
344:       // Rien à faire — l'éditeur est fermé
345:     },
346:     onReset: (segmentIndex) => {
347:       applyChordOverride(segmentIndex, null);
348:     },
349:   });
350: }
351: 
352: function initKeyboardShortcuts() {
353:   document.addEventListener('keydown', (e) => {
354:     if (chordEditor?.isOpen) {
355:       if (e.key === 'Escape') {
356:         e.preventDefault();
357:         chordEditor.close();
358:         return;
359:       }
360:       // Ne pas intercepter Ctrl+Z/S dans l'éditeur si un champ texte a le focus
361:       const tag = document.activeElement?.tagName;
362:       if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
363:     }
364: 
365:     // Ctrl+S : sauvegarde du projet
366:     if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
367:       e.preventDefault();
368:       saveProject();
369:       return;
370:     }
371: 
372:     if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
373:       e.preventDefault();
374:       redo();
375:       return;
376:     }
377:     if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
378:       e.preventDefault();
379:       // Ne pas intercepter dans les champs texte
380:       const tag = document.activeElement?.tagName;
381:       if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
382:       undo();
383:       return;
384:     }
385: 
386:     if (e.key === ' ' || e.code === 'Space') {
387:       const tag = document.activeElement?.tagName;
388:       if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
389:       e.preventDefault();
390:       togglePlayback();
391:     }
392:   });
393: }
394: 
395: function openChordEditor(segmentIndex) {
396:   if (!currentAnalysis) return;
397:   const seg = currentAnalysis.chords[segmentIndex];
398:   if (!seg) return;
399:   chordEditor.open(seg, segmentIndex, currentAnalysis);
400: }
401: 
402: function renderTimeline(chords, duration) {
403:   if (!els.chordTimelineInner) return;
404:   els.chordTimelineInner.innerHTML = '';
405: 
406:   duration = Math.max(duration || 0, 1);
407:   const pps = BASE_PIXELS_PER_SECOND * timelineZoom;
408:   const totalWidth = Math.max(duration * pps + (chords.length - 1) * BLOCK_GAP, 0);
409:   els.chordTimelineInner.style.width = `${totalWidth}px`;
410: 
411:   if (chords.length === 0) {
412:     els.chordTimelineInner.innerHTML = '<span class="text-sm text-zinc-500">Aucun accord détecté.</span>';
413:     return;
414:   }
415: 
416:   chords.forEach((chord, index) => {
417:     const block = document.createElement('button');
418:     block.className = 'absolute inset-y-2 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 font-bold text-lg cursor-pointer hover:bg-zinc-700 hover:border-sky-500 transition-all overflow-hidden';
419:     block.type = 'button';
420:     block.dataset.index = String(index);
421:     block.dataset.start = String(chord.startTime);
422:     block.dataset.segmentId = chord.segmentId || '';
423: 
424:     const left = chord.startTime * pps + index * BLOCK_GAP;
425:     const timeWidth = Math.max((chord.endTime - chord.startTime) * pps - BLOCK_GAP, 0);
426:     block.style.left = `${left}px`;
427:     block.style.width = `${timeWidth}px`;
428: 
429:     const fmt = (s) => {
430:       const m = Math.floor(s / 60);
431:       const sec = Math.floor(s % 60);
432:       return `${m}:${String(sec).padStart(2, '0')}`;
433:     };
434: 
435:     const effectiveChordStr = getEffectiveChord(chord);
436:     const originalDetected = chord.chord;
437:     const isOverridden = chord.manualOverride != null;
438: 
439:     if (isOverridden) {
440:       block.title = `Corrigé manuellement — ${originalDetected} → ${effectiveChordStr}  ${fmt(chord.startTime)} → ${fmt(chord.endTime)}  (${(chord.endTime - chord.startTime).toFixed(1)}s)`;
441:     } else {
442:       block.title = `${effectiveChordStr}  ${fmt(chord.startTime)} → ${fmt(chord.endTime)}  (${(chord.endTime - chord.startTime).toFixed(1)}s)`;
443:     }
444: 
445:     const fontSize = effectiveChordStr.length >= 7 ? 'text-base' : 'text-lg';
446:     block.classList.add(fontSize);
447: 
448:     // Bloc très étroit : pas de texte, simple marqueur visuel
449:     if (timeWidth < 24) {
450:       block.classList.add('timeline-block-micro');
451:     }
452: 
453:     if (isOverridden) {
454:       block.classList.add('manual-override');
455:     }
456: 
457:     block.innerHTML = `
458:       <span class="truncate max-w-full px-2 font-bold">${escapeHtml(effectiveChordStr)}</span>
459:       ${isOverridden ? '<span class="manual-override-icon" title="Corrigé manuellement">✏</span>' : ''}
460:     `;
461: 
462:     block.addEventListener('click', () => {
463:       if (currentPlayer) {
464:         currentPlayer.seek(chord.startTime);
465:         currentPlayer.play();
466:       }
467:       block.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
468:     });
469:     block.addEventListener('keydown', (e) => {
470:       if (e.key === 'Enter') {
471:         e.preventDefault();
472:         openChordEditor(index);
473:       }
474:     });
475:     block.addEventListener('dblclick', (e) => {
476:       e.stopPropagation();
477:       openChordEditor(index);
478:     });
479:     block.addEventListener('pointerdown', (e) => e.stopPropagation());
480:     els.chordTimelineInner.appendChild(block);
481:   });
482: 
483:   // Restaurer la sélection active
484:   updatePlaybackPosition(
485:     currentPlayer?.element?.currentTime ?? 0
486:   );
487: }
488: 
489: function renderHeroChord(chord) {
490:   if (!els.hero) return;
491:   if (!chord) {
492:     els.hero.style.display = 'none';
493:     return;
494:   }
495: 
496:   const effectiveChordStr = getEffectiveChord(chord);
497:   const display = deriveChordDisplay(effectiveChordStr);
498:   const originalDetected = chord.chord;
499: 
500:   els.hero.style.display = 'flex';
501: 
502:   if (chord.manualOverride) {
503:     els.heroName.textContent = display.symbol;
504:     els.heroName.title = `Détecté : ${originalDetected}`;
505:   } else {
506:     els.heroName.textContent = display.symbol || originalDetected || '';
507:     els.heroName.title = '';
508:   }
509: 
510:   // Notes
511:   let notesText = display.chordToneNames.join(' · ');
512:   if (display.bassName) {
513:     notesText = `Accord : ${notesText}    Basse : ${display.bassName}`;
514:   }
515:   els.heroNotes.textContent = notesText;
516: 
517:   // Mini clavier : toutes les notes y compris la basse
518:   const allPcs = display.allPcs;
519:   if (allPcs.length) {
520:     const midiNotes = allPcs.map((pc) => 60 + ((pc - (60 % 12) + 12) % 12));
521:     const { svg } = miniKeyboardForNotes(midiNotes);
522:     els.heroKeyboard.innerHTML = svg;
523:   } else {
524:     els.heroKeyboard.innerHTML = '';
525:   }
526: }
527: 
528: function updatePlaybackPosition(currentTime) {
529:   if (!currentAnalysis) return;
530:   const duration = currentPlayer?.getDuration?.() || currentAnalysis.duration || 1;
531:   const clamped = Math.max(0, Math.min(currentTime, duration));
532:   const ratio = duration > 0 ? clamped / duration : 0;
533: 
534:   els.progressFill.style.width = `${ratio * 100}%`;
535:   els.progressThumb.style.left = `${ratio * 100}%`;
536:   els.currentTimeEl.textContent = formatTime(clamped);
537:   els.durationEl.textContent = formatTime(duration);
538: 
539:   const chords = currentAnalysis.chords || [];
540:   let activeIndex = -1;
541:   for (let i = 0; i < chords.length; i++) {
542:     if (clamped >= chords[i].startTime && clamped < chords[i].endTime) {
543:       activeIndex = i;
544:       break;
545:     }
546:   }
547: 
548:   const blocks = els.chordTimelineInner.querySelectorAll('.analyzer-timeline-block, button[data-index]');
549:   blocks.forEach((block, idx) => {
550:     if (idx === activeIndex) {
551:       block.classList.add('!bg-sky-600', '!border-sky-400', '!text-white', 'shadow-lg', 'shadow-sky-500/20', 'scale-105', 'z-10');
552:       block.classList.remove('bg-zinc-800', 'border-zinc-700', 'text-zinc-200');
553:     } else {
554:       block.classList.remove('!bg-sky-600', '!border-sky-400', '!text-white', 'shadow-lg', 'shadow-sky-500/20', 'scale-105', 'z-10');
555:       block.classList.add('bg-zinc-800', 'border-zinc-700', 'text-zinc-200');
556:     }
557:   });
558: 
559:   // Hero chord
560:   const activeChord = activeIndex >= 0 ? chords[activeIndex] : null;
561:   renderHeroChord(activeChord);
562: 
563:   // Phase 1.5A + 2B : read-only close/simple voicing text preview
564:   const effectiveChord = activeChord ? getEffectiveChord(activeChord) : null;
565:   const currentStyle = getVoicingStyle();
566:   if (effectiveChord !== lastRenderedVoicingChord || currentStyle !== lastRenderedVoicingStyle) {
567:     lastRenderedVoicingChord = effectiveChord;
568:     lastRenderedVoicingStyle = currentStyle;
569:     if (effectiveChord) {
570:       updateVoicingPreviewForChord(effectiveChord, { style: currentStyle });
571:     } else {
572:       clearVoicingTextPreview();
573:     }
574:   }
575: 
576:   // Auto-scroll horizontal : défiler uniquement quand le segment approche du bord.
577:   if (activeIndex >= 0 && activeIndex !== lastAutoScrollIndex && blocks[activeIndex]) {
578:     lastAutoScrollIndex = activeIndex;
579:     const block = blocks[activeIndex];
580:     const containerRect = els.chordTimeline.getBoundingClientRect();
581:     const blockRect = block.getBoundingClientRect();
582:     const margin = 120;
583:     if (blockRect.right > containerRect.right - margin || blockRect.left < containerRect.left + margin) {
584:       const targetScroll = els.chordTimeline.scrollLeft + blockRect.left - containerRect.left - containerRect.width / 3 + blockRect.width / 2;
585:       els.chordTimeline.scrollTo({ left: targetScroll, behavior: 'smooth' });
586:     }
587:   }
588: }
589: 
590: function togglePlayback() {
591:   if (!currentPlayer) return;
592:   if (currentPlayer.element?.paused) {
593:     currentPlayer.play();
594:   } else {
595:     currentPlayer.pause();
596:   }
597:   updatePlayButton();
598: }
599: 
600: function bindPlayerControls() {
601:   els.playBtn?.addEventListener('click', togglePlayback);
602: 
603:   els.prevBtn?.addEventListener('click', () => {
604:     if (!currentPlayer) return;
605:     currentPlayer.seek(0);
606:     currentPlayer.play();
607:   });
608: 
609:   els.progressTrack?.addEventListener('pointerdown', (e) => {
610:     if (!currentPlayer) return;
611:     isDraggingProgress = true;
612:     seekFromPointerEvent(e);
613: 
614:     function onMove(ev) {
615:       seekFromPointerEvent(ev);
616:     }
617: 
618:     function onUp() {
619:       isDraggingProgress = false;
620:       window.removeEventListener('pointermove', onMove);
621:       window.removeEventListener('pointerup', onUp);
622:     }
623: 
624:     window.addEventListener('pointermove', onMove);
625:     window.addEventListener('pointerup', onUp);
626:   });
627: }
628: 
629: function seekFromPointerEvent(e) {
630:   if (!currentPlayer) return;
631:   const rect = els.progressTrack.getBoundingClientRect();
632:   const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
633:   const duration = currentPlayer.getDuration?.() || currentAnalysis?.duration || 1;
634:   currentPlayer.seek(ratio * duration);
635: }
636: 
637: function updatePlayButton() {
638:   if (!els.playBtn || !currentPlayer) return;
639:   const isPaused = currentPlayer.element?.paused !== false;
640:   els.playBtn.textContent = isPaused ? '▶' : '⏸';
641:   els.playBtn.title = isPaused ? 'Lecture' : 'Pause';
642: }
643: 
644: function bindToolbar() {
645:   // Only zoom slider in the toolbar for now
646: }
647: 
648: function resetZoom() {
649:   timelineZoom = 1.0;
650:   if (els.zoomSlider) els.zoomSlider.value = '1';
651:   if (els.zoomValue) els.zoomValue.textContent = '100%';
652: }
653: 
654: function initTimelineZoom() {
655:   els.zoomSlider?.addEventListener('input', () => {
656:     timelineZoom = Number(els.zoomSlider.value);
657:     els.zoomValue.textContent = `${Math.round(timelineZoom * 100)}%`;
658:     if (currentAnalysis) {
659:       renderTimeline(currentAnalysis.chords || [], currentAnalysis.duration || 0);
660:     }
661:   });
662: }
663: 
664: async function handleExportMidi() {
665:   if (!currentAnalysis) return;
666:   if (!window.electronAPI?.files?.saveDialog || !window.electronAPI?.files?.writeBinary) {
667:     alert('Export MIDI non disponible dans cet environnement.');
668:     return;
669:   }
670: 
671:   const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
672:   const filePath = await window.electronAPI.files.saveDialog({
673:     defaultPath: `${baseName}_analysis.mid`,
674:   });
675:   if (!filePath) return;
676: 
677:   const midiBytes = exportAnalysisToMidi(currentAnalysis);
678:   if (!midiBytes) {
679:     alert('Aucune donnée à exporter.');
680:     return;
681:   }
682:   await window.electronAPI.files.writeBinary(filePath, midiBytes);
683:   const edited = countManuallyEditedChords(currentAnalysis);
684:   const suffix = edited > 0 ? ` — ${edited} accord(s) corrigé(s) manuellement inclus(s)` : '';
685:   showToast(`MIDI exporté${suffix} vers ${filePath}`, 4000);
686: }
687: 
688: async function handleExportJson() {
689:   if (!currentAnalysis) return;
690:   if (!window.electronAPI?.files?.saveDialog || !window.electronAPI?.files?.writeFile) {
691:     alert('Export JSON non disponible dans cet environnement.');
692:     return;
693:   }
694: 
695:   const baseName = currentFileName.replace(/\.[^.]+$/, '') || 'analyse';
696:   const filePath = await window.electronAPI.files.saveDialog({
697:     defaultPath: `${baseName}_analysis.json`,
698:     filters: [{ name: 'Fichier JSON', extensions: ['json'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
699:   });
700:   if (!filePath) return;
701: 
702:   const jsonData = exportAnalysisToJson(currentAnalysis);
703:   await window.electronAPI.files.writeFile(filePath, JSON.stringify(jsonData, null, 2));
704:   const edited = countManuallyEditedChords(currentAnalysis);
705:   const suffix = edited > 0 ? ` — ${edited} correction(s) manuelle(s)` : '';
706:   showToast(`JSON exporté${suffix} vers ${filePath}`, 4000);
707: }
708: 
709: async function handleCopyText() {
710:   if (!currentAnalysis) return;
711:   const text = exportAnalysisToText(currentAnalysis);
712:   if (navigator.clipboard) {
713:     await navigator.clipboard.writeText(text);
714:   } else {
715:     const textarea = document.createElement('textarea');
716:     textarea.value = text;
717:     document.body.appendChild(textarea);
718:     textarea.select();
719:     document.execCommand('copy');
720:     textarea.remove();
721:   }
722:   const edited = countManuallyEditedChords(currentAnalysis);
723:   const suffix = edited > 0 ? ` — ${edited} correction(s) manuelle(s)` : '';
724:   showToast(`Grille texte copiée${suffix}`, 3000);
725: }
726: 
727: function showToast(message, duration = 3000, type = 'info') {
728:   const existing = document.getElementById('analyzer-toast');
729:   if (existing) existing.remove();
730:   const toast = document.createElement('div');
731:   toast.id = 'analyzer-toast';
732:   toast.className = `analyzer-toast ${type}`;
733:   toast.textContent = message;
734:   document.body.appendChild(toast);
735:   setTimeout(() => toast.classList.add('visible'), 10);
736:   setTimeout(() => {
737:     toast.classList.remove('visible');
738:     setTimeout(() => toast.remove(), 300);
739:   }, duration);
740: }
741: 
742: function bindTimelineScroll() {
743:   els.timelineScrollLeft?.addEventListener('click', () => {
744:     els.chordTimeline.scrollBy({ left: -els.chordTimeline.clientWidth * 0.6, behavior: 'smooth' });
745:   });
746:   els.timelineScrollRight?.addEventListener('click', () => {
747:     els.chordTimeline.scrollBy({ left: els.chordTimeline.clientWidth * 0.6, behavior: 'smooth' });
748:   });
749: }
750: 
751: function bindSectionTabs() {
752:   if (!els.sectionTabs.length) return;
753: 
754:   els.sectionTabs.forEach((tab) => {
755:     tab.addEventListener('click', () => {
756:       els.sectionTabs.forEach((t) => {
757:         t.classList.remove('text-sky-400', 'border-b-2', 'border-sky-400');
758:         t.classList.add('text-zinc-500', 'hover:text-zinc-300');
759:         t.setAttribute('aria-selected', 'false');
760:       });
761:       tab.classList.remove('text-zinc-500', 'hover:text-zinc-300');
762:       tab.classList.add('text-sky-400', 'border-b-2', 'border-sky-400');
763:       tab.setAttribute('aria-selected', 'true');
764: 
765:       const section = tab.dataset.section;
766:       els.sectionPanels.forEach((panel) => {
767:         if (panel.dataset.section === section) {
768:           panel.style.display = '';
769:         } else {
770:           panel.style.display = 'none';
771:         }
772:       });
773:     });
774:   });
775: }
776: 
777: function bindExportMidiButton() {
778:   els.exportMidiBtn?.addEventListener('click', handleExportMidi);
779: }
780: 
781: function bindExportJsonButton() {
782:   els.exportJsonBtn?.addEventListener('click', handleExportJson);
783: }
784: 
785: function bindCopyTextButton() {
786:   els.copyTextBtn?.addEventListener('click', handleCopyText);
787: }
788: 
789: async function loadAudioBlobUrl(filePath) {
790:   if (!window.electronAPI?.files?.readBinary) {
791:     throw new Error('Lecture de fichier non disponible');
792:   }
793:   const bytes = await window.electronAPI.files.readBinary(filePath);
794:   const blob = new Blob([bytes], { type: 'audio/wav' });
795:   return URL.createObjectURL(blob);
796: }
797: 
798: // ── Phase B : Persistance des overrides ──
799: 
800: function resetProjectState() {
801:   projectDirty = false;
802:   projectPath = null;
803:   audioIdentity = null;
804:   currentProjectOrphanedOverrides = {};
805:   if (saveStatusEl) {
806:     saveStatusEl.remove();
807:     saveStatusEl = null;
808:   }
809:   window.__projectDirty = false;
810: }
811: 
812: function addSaveIndicator() {
813:   if (saveStatusEl) { saveStatusEl.remove(); saveStatusEl = null; }
814:   saveStatusEl = document.createElement('span');
815:   saveStatusEl.id = 'analyzer-save-status';
816:   saveStatusEl.className = 'analyzer-save-status';
817:   const projectPathDisplay = projectPath || buildProjectPath(currentAudioPath) || '(chemin inconnu)';
818:   saveStatusEl.title = `Enregistrer les corrections (Ctrl+S)\nFichier : ${projectPathDisplay}`;
819:   saveStatusEl.addEventListener('click', (e) => {
820:     e.stopPropagation();
821:     saveProject();
822:   });
823:   const header = els.songTitle?.parentElement;
824:   if (header) {
825:     header.appendChild(saveStatusEl);
826:   }
827:   markClean();
828: }
829: 
830: async function getAudioStat(filePath) {
831:   if (!window.electronAPI?.files?.stat) return null;
832:   try {
833:     return await window.electronAPI.files.stat(filePath);
834:   } catch {
835:     return null;
836:   }
837: }
838: 
839: function markDirty() {
840:   if (!projectDirty) {
841:     projectDirty = true;
842:     window.__projectDirty = true;
843:     updateSaveIndicator();
844:   }
845: }
846: 
847: function markClean() {
848:   projectDirty = false;
849:   window.__projectDirty = false;
850:   updateSaveIndicator();
851: }
852: 
853: function updateSaveIndicator() {
854:   if (!saveStatusEl) return;
855:   const projectPathDisplay = projectPath || buildProjectPath(currentAudioPath) || '(chemin inconnu)';
856:   saveStatusEl.title = `Enregistrer les corrections (Ctrl+S)\nFichier : ${projectPathDisplay}`;
857:   if (projectDirty) {
858:     saveStatusEl.textContent = '⚠ Modifications non enregistrées';
859:     saveStatusEl.className = 'analyzer-save-status dirty';
860:   } else {
861:     saveStatusEl.textContent = '💾 Enregistré';
862:     saveStatusEl.className = 'analyzer-save-status clean';
863:   }
864: }
865: 
866: async function saveProject() {
867:   if (!currentAudioPath || !currentAnalysis) return;
868:   if (!window.electronAPI?.files?.writeFile || !window.electronAPI?.files?.rename) {
869:     showToast('Sauvegarde non disponible dans cet environnement.');
870:     return;
871:   }
872: 
873:   try {
874:     if (!audioIdentity) {
875:       const stat = await getAudioStat(currentAudioPath);
876:       audioIdentity = buildAudioIdentity(currentAudioPath, currentAnalysis, stat);
877:     }
878: 
879:     projectPath = projectPath || buildProjectPath(currentAudioPath);
880:     const data = buildProjectData(audioIdentity, currentAnalysis.chords || [], currentProjectOrphanedOverrides);
881: 
882:     // Écriture atomique : fichier temporaire → renommage
883:     const tmpPath = projectPath + '.tmp';
884:     await window.electronAPI.files.writeFile(tmpPath, JSON.stringify(data, null, 2));
885:     await window.electronAPI.files.rename(tmpPath, projectPath);
886: 
887:     markClean();
888:     const displayPath = projectPath || '';
889:     const shortPath = displayPath.length > 60 ? '…' + displayPath.slice(-60) : displayPath;
890:     showToast(`Projet enregistré : ${shortPath}`, 4000);
891:   } catch (err) {
892:     console.error('[Analyzer] save failed:', err);
893:     showToast("Erreur d'enregistrement : " + err.message, 5000);
894:     // Les corrections en mémoire restent intactes
895:   }
896: }
897: 
898: async function loadProjectIfExists() {
899:   if (!currentAudioPath || !currentAnalysis) return;
900:   if (!window.electronAPI?.files?.readFile) return;
901: 
902:   const path = buildProjectPath(currentAudioPath);
903:   if (!path) return;
904:   projectPath = path;
905: 
906:   try {
907:     const exists = await window.electronAPI.files.exists(path);
908:     if (!exists) return;
909: 
910:     const content = await window.electronAPI.files.readFile(path);
911:     if (!content) {
912:       showToast('Projet existant vide ou illisible.', 5000, 'warning');
913:       return;
914:     }
915: 
916:     const data = safeJsonParse(content);
917:     if (!data) {
918:       console.warn('[Analyzer] projet invalide (JSON mal formé) :', path);
919:       showToast('Projet existant illisible (JSON invalide).', 6000, 'warning');
920:       return;
921:     }
922: 
923:     if (!validateProjectSchema(data)) {
924:       console.warn('[Analyzer] projet incompatible (schemaVersion) :', path);
925:       const version = data && data.schemaVersion;
926:       const detail = version != null ? ` (version ${version})` : '';
927:       showToast(`Projet incompatible${detail}. Créez un nouveau projet avec Ctrl+S.`, 6000, 'warning');
928:       return;
929:     }
930: 
931:     const stat = await getAudioStat(currentAudioPath);
932:     const identity = buildAudioIdentity(currentAudioPath, currentAnalysis, stat);
933:     audioIdentity = identity;
934: 
935:     if (!verifyAudioIdentity(data.audio, identity)) {
936:       console.warn('[Analyzer] identité audio différente — overrides ignorés');
937:       const diff = describeIdentityDiff(data.audio, identity);
938:       showToast(`Projet existant incompatible.${diff} Corrections non appliquées.`, 8000, 'warning');
939:       return;
940:     }
941: 
942:     const { applied, orphaned } = tryApplyProjectOverrides(data, currentAnalysis.chords || []);
943:     currentProjectOrphanedOverrides = orphaned;
944: 
945:     // L'état chargé est la nouvelle ligne de base : pas d'undo possible sur le load
946:     resetUndoRedo();
947:     rerenderTimeline();
948: 
949:     if (applied.length > 0) {
950:       showToast(`${applied.length} correction(s) chargée(s).`, 3000, 'info');
951:     } else if (Object.keys(data.manualChordOverrides || {}).length === 0) {
952:       showToast('Aucune correction enregistrée dans ce projet.', 2000, 'info');
953:     }
954:     if (Object.keys(orphaned).length > 0) {
955:       console.warn('[Analyzer] overrides orphelins conservés :', Object.keys(orphaned));
956:       showToast(`${Object.keys(orphaned).length} correction(s) orpheline(s) conservée(s).`, 5000, 'warning');
957:     }
958: 
959:     markClean();
960:   } catch (err) {
961:     console.error('[Analyzer] load project failed:', err);
962:     showToast('Erreur de lecture du projet.', 6000, 'error');
963:   }
964: }
965: 
966: function describeIdentityDiff(savedAudio, currentAudio) {
967:   if (!savedAudio || !currentAudio) return '';
968:   if (savedAudio.path !== currentAudio.path) {
969:     return ' Ce fichier audio semble différent.';
970:   }
971:   if (savedAudio.size > 0 && currentAudio.size > 0 && savedAudio.size !== currentAudio.size) {
972:     return ' La taille du fichier a changé.';
973:   }
974:   if (savedAudio.modifiedAt > 0 && currentAudio.modifiedAt > 0 && savedAudio.modifiedAt !== currentAudio.modifiedAt) {
975:     return ' Le fichier a été modifié.';
976:   }
977:   return '';
978: }
979: 
980: function safeJsonParse(str) {
981:   try { return JSON.parse(str); } catch { return null; }
982: }
983: 
984: function buildAudioIdentity(audioPath, analysis, stat) {
985:   return {
986:     path: audioPath,
987:     size: stat?.size ?? 0,
988:     duration: analysis?.duration ?? 0,
989:     modifiedAt: stat?.mtimeMs ?? 0,
990:   };
991: }
992: 
993: // Exposé pour le gestionnaire close dans main.js
994: window.__projectDirty = false;
995: window.__saveProjectBeforeClose = async function () {
996:   await saveProject();
997: };
998: 
999: function renderStats(analysis) {
1000:   if (!els.statsContent) return;
1001:   const stats = computeProductStatistics(analysis);
1002:   const qualityRows = Object.entries(stats.qualityCounts)
1003:     .sort((a, b) => b[1] - a[1])
1004:     .map(([q, count]) => `<div class="flex justify-between text-xs"><span>${q || 'majeur'}</span><span>${count}</span></div>`)
1005:     .join('');
1006: 
1007:   const topRows = stats.mostUsedChords
1008:     .map(({ symbol, count }) => `<div class="flex justify-between text-xs"><span>${escapeHtml(symbol)}</span><span>${count}</span></div>`)
1009:     .join('');
1010: 
1011:   els.statsContent.innerHTML = `
1012:     <div class="space-y-3">
1013:       <div class="flex justify-between text-sm font-medium text-zinc-300"><span>Segments</span><span>${stats.totalSegments}</span></div>
1014:       <div class="flex justify-between text-sm font-medium text-zinc-300"><span>Durée totale</span><span>${formatTime(stats.totalDuration)}</span></div>
1015:       <div class="flex justify-between text-sm font-medium text-zinc-300"><span>Corrections manuelles</span><span>${stats.manuallyEditedCount}</span></div>
1016:       <div class="flex justify-between text-sm font-medium text-zinc-300"><span>Slash chords</span><span>${stats.slashChordCount}</span></div>
1017:       <div>
1018:         <div class="text-xs font-semibold text-zinc-500 uppercase mb-1">Qualités</div>
1019:         ${qualityRows || '<div class="text-xs text-zinc-600">Aucune</div>'}
1020:       </div>
1021:       <div>
1022:         <div class="text-xs font-semibold text-zinc-500 uppercase mb-1">Accords les plus utilisés</div>
1023:         ${topRows || '<div class="text-xs text-zinc-600">Aucun</div>'}
1024:       </div>
1025:     </div>
1026:   `;
1027: }
1028: 
1029: function escapeHtml(str) {
1030:   return String(str)
1031:     .replace(/\u0026/g, '\u0026amp;')
1032:     .replace(/\u003c/g, '\u0026lt;')
1033:     .replace(/\u003e/g, '\u0026gt;')
1034:     .replace(/"/g, '\u0026quot;');
1035: }

(End of file - total 1035 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/midi-fallback.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/midi-fallback.js</path>
<type>file</type>
<content>
1: // Web MIDI fallback when native MIDI bridge is unavailable or empty.
2: // This mirrors the behavior of chord-display.rednet.io.
3: 
4: let midiAccess = null;
5: let currentInput = null;
6: 
7: export async function initWebMidi({
8:   onNoteOn,
9:   onNoteOff,
10:   onSustain,
11:   onPitchWheel,
12:   onModWheel,
13:   onStateChange,
14: }) {
15:   if (!navigator.requestMIDIAccess) {
16:     return { available: false, error: 'Web MIDI API non supportée' };
17:   }
18: 
19:   try {
20:     midiAccess = await navigator.requestMIDIAccess({ sysex: false });
21: 
22:     midiAccess.onstatechange = () => {
23:       onStateChange?.(getWebMidiInputs());
24:     };
25: 
26:     return { available: true, inputs: getWebMidiInputs() };
27:   } catch (err) {
28:     return { available: false, error: err.message };
29:   }
30: }
31: 
32: export function getWebMidiInputs() {
33:   if (!midiAccess) return [];
34:   const inputs = [];
35:   let id = 0;
36:   for (const input of midiAccess.inputs.values()) {
37:     inputs.push({ id, name: input.name, device: input });
38:     id++;
39:   }
40:   return inputs;
41: }
42: 
43: export function openWebMidiInput(inputId, callbacks) {
44:   if (!midiAccess) return false;
45:   let id = 0;
46:   for (const input of midiAccess.inputs.values()) {
47:     if (id === inputId) {
48:       if (currentInput) {
49:         currentInput.onmidimessage = null;
50:       }
51:       currentInput = input;
52:       currentInput.onmidimessage = (event) => handleMidiMessage(event.data, callbacks);
53:       return true;
54:     }
55:     id++;
56:   }
57:   return false;
58: }
59: 
60: function handleMidiMessage(data, { onNoteOn, onNoteOff, onSustain, onPitchWheel, onModWheel }) {
61:   const [status, d1, d2] = data;
62:   const cmd = status >> 4;
63:   const channel = status & 0x0f;
64:   if (channel === 9) return;
65: 
66:   if (cmd === 0x8 || (cmd === 0x9 && d2 === 0)) {
67:     onNoteOff?.({ note: d1 });
68:   } else if (cmd === 0x9) {
69:     onNoteOn?.({ note: d1, velocity: d2 / 127 });
70:   } else if (cmd === 0xb && d1 === 64) {
71:     onSustain?.({ value: d2 >= 64 });
72:   } else if (cmd === 0xb && d1 === 1) {
73:     onModWheel?.({ value: d2 / 127 });
74:   } else if (cmd === 0xe) {
75:     const bend = (d2 * 128 + d1 - 8192) / 8192;
76:     onPitchWheel?.({ value: bend });
77:   }
78: }

(End of file - total 78 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/recorder/recorder.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/recorder/recorder.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Enregistreur de sessions MIDI.
2: // Capture tous les événements MIDI avec un timestamp relatif au début de l'enregistrement.
3: 
4: export function createRecorder() {
5:   let events = [];
6:   let startTime = 0;
7:   let isRecording = false;
8:   let isPaused = false;
9:   let pausedDuration = 0;
10:   let pauseStart = 0;
11: 
12:   function now() {
13:     if (!isRecording) return 0;
14:     if (isPaused) return (pauseStart - startTime - pausedDuration) / 1000;
15:     return (performance.now() - startTime - pausedDuration) / 1000;
16:   }
17: 
18:   function start() {
19:     events = [];
20:     startTime = performance.now();
21:     pausedDuration = 0;
22:     isRecording = true;
23:     isPaused = false;
24:   }
25: 
26:   function pause() {
27:     if (!isRecording || isPaused) return;
28:     isPaused = true;
29:     pauseStart = performance.now();
30:   }
31: 
32:   function resume() {
33:     if (!isRecording || !isPaused) return;
34:     pausedDuration += performance.now() - pauseStart;
35:     isPaused = false;
36:   }
37: 
38:   function stop() {
39:     isRecording = false;
40:     isPaused = false;
41:     return getEvents();
42:   }
43: 
44:   function addEvent(event) {
45:     if (!isRecording || isPaused) return;
46:     events.push({
47:       ...event,
48:       time: now(),
49:     });
50:   }
51: 
52:   function noteOn(note, velocity = 0.8, channel = 0) {
53:     addEvent({ type: 'note_on', note, velocity, channel });
54:   }
55: 
56:   function noteOff(note, channel = 0) {
57:     addEvent({ type: 'note_off', note, velocity: 0, channel });
58:   }
59: 
60:   function control(controller, value, channel = 0) {
61:     addEvent({ type: 'control', controller, value, channel });
62:   }
63: 
64:   function sustain(value, channel = 0) {
65:     control(64, value ? 127 : 0, channel);
66:   }
67: 
68:   function pitchWheel(value, channel = 0) {
69:     addEvent({ type: 'pitch_bend', value, channel });
70:   }
71: 
72:   function modWheel(value, channel = 0) {
73:     control(1, Math.round(value * 127), channel);
74:   }
75: 
76:   function programChange(program, channel = 0) {
77:     addEvent({ type: 'program_change', program, channel });
78:   }
79: 
80:   function sysEx(data, channel = 0) {
81:     addEvent({ type: 'sys_ex', data, channel });
82:   }
83: 
84:   function getEvents() {
85:     return [...events];
86:   }
87: 
88:   function getStats() {
89:     const noteOnEvents = events.filter((e) => e.type === 'note_on');
90:     const lastEvent = events[events.length - 1];
91:     return {
92:       duration: lastEvent?.time || 0,
93:       noteCount: noteOnEvents.length,
94:       chordCount: 0, // computed externally by chord history
95:     };
96:   }
97: 
98:   return {
99:     start,
100:     pause,
101:     resume,
102:     stop,
103:     noteOn,
104:     noteOff,
105:     control,
106:     sustain,
107:     pitchWheel,
108:     modWheel,
109:     programChange,
110:     sysEx,
111:     getEvents,
112:     getStats,
113:     getCurrentTime: now,
114:     get isRecording() { return isRecording; },
115:     get isPaused() { return isPaused; },
116:   };
117: }

(End of file - total 117 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/recorder/player.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/recorder/player.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Lecteur de sessions MIDI.
2: // Rejoue les événements enregistrés en les réinjectant dans le moteur de détection existant.
3: 
4: export function createPlayer({ onNoteOn, onNoteOff, onSustain, onPitchWheel, onModWheel, onProgramChange } = {}) {
5:   let events = [];
6:   let startTime = 0;
7:   let state = 'stopped'; // 'stopped' | 'playing' | 'paused'
8:   let speed = 1;
9:   let currentTime = 0;
10:   let rafId = null;
11:   let scheduledUntil = 0;
12:   let activeNotes = new Set();
13: 
14:   function allNotesOff() {
15:     if (activeNotes.size === 0) return;
16:     for (const note of activeNotes) {
17:       onNoteOff?.(note);
18:     }
19:     activeNotes.clear();
20:   }
21: 
22:   function load(eventsData) {
23:     allNotesOff();
24:     stop();
25:     events = [...eventsData].sort((a, b) => a.time - b.time);
26:     currentTime = 0;
27:   }
28: 
29:   function play() {
30:     if (state === 'playing') return;
31: 
32:     if (state === 'paused') {
33:       // Reprendre exactement à currentTime, pas à zéro.
34:       startTime = performance.now() - (currentTime * 1000) / speed;
35:     } else {
36:       startTime = performance.now() - (currentTime * 1000) / speed;
37:     }
38: 
39:     state = 'playing';
40:     scheduledUntil = currentTime;
41:     scheduleLoop();
42:   }
43: 
44:   function pause() {
45:     if (state !== 'playing') return;
46:     state = 'paused';
47:     currentTime = getCurrentTime();
48:     cancelFrame(rafId);
49:     rafId = null;
50:     allNotesOff();
51:   }
52: 
53:   function stop() {
54:     state = 'stopped';
55:     currentTime = 0;
56:     speed = 1;
57:     cancelFrame(rafId);
58:     rafId = null;
59:     scheduledUntil = 0;
60:     allNotesOff();
61:   }
62: 
63:   function seek(time) {
64:     // 1. Couper toutes les notes actives AVANT de déplacer la tête de lecture.
65:     allNotesOff();
66: 
67:     // 2. Seulement après, mettre à jour la position.
68:     const wasPlaying = state === 'playing';
69:     currentTime = Math.max(0, Math.min(time, getDuration()));
70:     scheduledUntil = currentTime;
71:     if (wasPlaying) {
72:       startTime = performance.now() - (currentTime * 1000) / speed;
73:     }
74:   }
75: 
76:   function setSpeed(newSpeed) {
77:     if (newSpeed <= 0) return;
78:     const wasPlaying = state === 'playing';
79:     currentTime = getCurrentTime();
80:     speed = newSpeed;
81:     if (wasPlaying) {
82:       startTime = performance.now() - (currentTime * 1000) / speed;
83:       scheduledUntil = currentTime;
84:     }
85:   }
86: 
87:   function getCurrentTime() {
88:     if (state !== 'playing') return currentTime;
89:     return ((performance.now() - startTime) / 1000) * speed;
90:   }
91: 
92:   function getDuration() {
93:     if (events.length === 0) return 0;
94:     return events[events.length - 1].time;
95:   }
96: 
97:   function scheduleLoop() {
98:     if (state !== 'playing') return;
99: 
100:     const now = getCurrentTime();
101:     const lookahead = 0.1; // schedule events 100ms ahead
102: 
103:     // Dispatch events that should already have happened
104:     while (scheduledUntil < now + lookahead && scheduledUntil < getDuration()) {
105:       const sliceEnd = Math.min(now + lookahead, getDuration());
106:       const slice = events.filter((e) => e.time > scheduledUntil && e.time <= sliceEnd);
107:       for (const event of slice) {
108:         dispatchEvent(event);
109:       }
110:       scheduledUntil = sliceEnd;
111:     }
112: 
113:     if (now >= getDuration()) {
114:       state = 'stopped';
115:       currentTime = getDuration();
116:       cancelFrame(rafId);
117:       rafId = null;
118:       allNotesOff();
119:       return;
120:     }
121: 
122:     const nextDelay = Math.max(8, (lookahead * 1000) / 2);
123:     if (typeof requestAnimationFrame === 'function') {
124:       rafId = requestAnimationFrame(scheduleLoop);
125:     } else {
126:       rafId = setTimeout(scheduleLoop, nextDelay);
127:     }
128:   }
129: 
130:   function cancelFrame(id) {
131:     if (typeof cancelAnimationFrame === 'function') {
132:       cancelAnimationFrame(id);
133:     } else {
134:       clearTimeout(id);
135:     }
136:   }
137: 
138:   function dispatchEvent(event) {
139:     switch (event.type) {
140:       case 'note_on':
141:         activeNotes.add(event.note);
142:         onNoteOn?.(event.note, event.velocity ?? 0.8, event.channel);
143:         break;
144:       case 'note_off':
145:         activeNotes.delete(event.note);
146:         onNoteOff?.(event.note, event.channel);
147:         break;
148:       case 'control':
149:         if (event.controller === 64) onSustain?.(event.value >= 64, event.channel);
150:         else if (event.controller === 1) onModWheel?.(event.value / 127, event.channel);
151:         else onModWheel?.(event.value / 127, event.channel);
152:         break;
153:       case 'pitch_bend':
154:         onPitchWheel?.(event.value, event.channel);
155:         break;
156:       case 'program_change':
157:         onProgramChange?.(event.program, event.channel);
158:         break;
159:     }
160:   }
161: 
162:   return {
163:     load,
164:     play,
165:     pause,
166:     stop,
167:     seek,
168:     setSpeed,
169:     getDuration,
170:     getCurrentTime,
171:     get state() { return state; },
172:     get isPlaying() { return state === 'playing'; },
173:     get isPaused() { return state === 'paused'; },
174:     get speed() { return speed; },
175:   };
176: }

(End of file - total 176 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/recorder/serializer.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/recorder/serializer.js</path>
<type>file</type>
<content>
1: import { midiToNoteName } from '../chord-engine/intervals.js';
2: 
3: // [OpenCode] — 2026-07-04 — Sérialisation des événements MIDI en JSON et en fichier MIDI (SMF).
4: 
5: export function serializeEventsJson(events) {
6:   return JSON.stringify(
7:     events.map((e) => ({
8:       time: Math.round(e.time * 1000) / 1000,
9:       type: e.type,
10:       note: e.note,
11:       noteName: e.note != null ? midiToNoteName(e.note, false, false) : undefined,
12:       velocity: e.velocity,
13:       controller: e.controller,
14:       value: e.value,
15:       program: e.program,
16:       data: e.data,
17:       channel: e.channel ?? 0,
18:     })),
19:     null,
20:     2,
21:   );
22: }
23: 
24: export function parseEventsJson(json) {
25:   return JSON.parse(json);
26: }
27: 
28: // [OpenCode] — 2026-07-04 — Génération d'un fichier MIDI SMF format 0 à partir d'événements.
29: // Supporte note_on, note_off, control, pitch_bend, program_change.
30: export function buildMidiFile(events) {
31:   const trackEvents = [];
32: 
33:   const ppq = 480; // pulses per quarter note
34:   const tempo = 500000; // microseconds per quarter note = 120 BPM
35: 
36:   // Track name meta event
37:   trackEvents.push(...deltaTime(0), 0xff, 0x03, ...stringBytes('Piano Jazz Chords Session'));
38: 
39:   // Set tempo meta event
40:   trackEvents.push(...deltaTime(0), 0xff, 0x51, 0x03, ...uint24(tempo));
41: 
42:   // Time signature 4/4
43:   trackEvents.push(...deltaTime(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);
44: 
45:   const sorted = [...events].filter((e) => MIDI_EVENT_TYPES.includes(e.type)).sort((a, b) => a.time - b.time);
46: 
47:   let lastTick = 0;
48:   for (const event of sorted) {
49:     const tick = Math.round(event.time * ppq);
50:     const delta = tick - lastTick;
51:     lastTick = tick;
52: 
53:     const channel = event.channel ?? 0;
54: 
55:     switch (event.type) {
56:       case 'note_on': {
57:         const velocity = Math.round((event.velocity ?? 0.8) * 127);
58:         trackEvents.push(...deltaTime(Math.max(0, delta)), 0x90 | channel, event.note, velocity);
59:         break;
60:       }
61:       case 'note_off': {
62:         const velocity = Math.round((event.velocity ?? 0) * 127);
63:         trackEvents.push(...deltaTime(Math.max(0, delta)), 0x80 | channel, event.note, velocity);
64:         break;
65:       }
66:       case 'control': {
67:         trackEvents.push(...deltaTime(Math.max(0, delta)), 0xb0 | channel, event.controller, event.value);
68:         break;
69:       }
70:       case 'pitch_bend': {
71:         const bend = Math.round(((event.value ?? 0) + 1) * 8191); // -1..+1 -> 0..16382
72:         const lsb = bend & 0x7f;
73:         const msb = (bend >> 7) & 0x7f;
74:         trackEvents.push(...deltaTime(Math.max(0, delta)), 0xe0 | channel, lsb, msb);
75:         break;
76:       }
77:       case 'program_change': {
78:         trackEvents.push(...deltaTime(Math.max(0, delta)), 0xc0 | channel, event.program);
79:         break;
80:       }
81:     }
82:   }
83: 
84:   // End of track
85:   trackEvents.push(...deltaTime(0), 0xff, 0x2f, 0x00);
86: 
87:   const trackChunk = buildChunk('MTrk', new Uint8Array(trackEvents));
88:   const headerChunk = buildChunk('MThd', new Uint8Array([
89:     0x00, 0x00, // format 0
90:     0x00, 0x01, // 1 track
91:     ...uint16(ppq),
92:   ]));
93: 
94:   const totalLength = headerChunk.length + trackChunk.length;
95:   const result = new Uint8Array(totalLength);
96:   result.set(headerChunk, 0);
97:   result.set(trackChunk, headerChunk.length);
98:   return result;
99: }
100: 
101: // [Claude] — 2026-07-10 — Extension : buildMidiFileMultiTrack (Format 1, multi-pistes, tempo dynamique)
102: export function buildMidiFileMultiTrack(tracks, options = {}) {
103:   const ppq = options.ppq ?? 480;
104:   const tempoUsPerQn = options.tempo ? Math.round(60_000_000 / options.tempo) : 500000;
105:   const tsNumerator = options.timeSignature?.[0] ?? 4;
106:   const tsDenominator = options.timeSignature?.[1] ?? 4;
107:   const tsMetronome = options.timeSignature?.[2] ?? 24;
108:   const ts32nds = options.timeSignature?.[3] ?? 8;
109:   const title = options.title ?? 'Piano Jazz Chords Analysis';
110: 
111:   const trackChunks = [];
112: 
113:   // Track 0: global tempo + time signature + title
114:   const globalTrack = [];
115:   globalTrack.push(...deltaTime(0), 0xff, 0x03, ...stringBytes(title));
116:   globalTrack.push(...deltaTime(0), 0xff, 0x51, 0x03, ...uint24(tempoUsPerQn));
117:   globalTrack.push(...deltaTime(0), 0xff, 0x58, 0x04, tsNumerator, tsDenominator === 4 ? 2 : 3, tsMetronome, ts32nds);
118:   globalTrack.push(...deltaTime(0), 0xff, 0x2f, 0x00);
119:   trackChunks.push(buildChunk('MTrk', new Uint8Array(globalTrack)));
120: 
121:   // Track 1..N: each instrument track
122:   for (const track of tracks) {
123:     const trackEvents = [];
124:     const channel = track.channel ?? 0;
125: 
126:     if (track.name) {
127:       trackEvents.push(...deltaTime(0), 0xff, 0x03, ...stringBytes(track.name));
128:     }
129: 
130:     if (track.program != null) {
131:       trackEvents.push(...deltaTime(0), 0xc0 | channel, track.program);
132:     }
133: 
134:     const sorted = (track.events || []).filter((e) => MIDI_EVENT_TYPES.includes(e.type)).sort((a, b) => a.time - b.time);
135:     let lastTick = 0;
136:     for (const event of sorted) {
137:       const tick = Math.round(event.time * ppq);
138:       const delta = tick - lastTick;
139:       lastTick = tick;
140: 
141:       switch (event.type) {
142:         case 'note_on': {
143:           const velocity = Math.round((event.velocity ?? 0.8) * 127);
144:           trackEvents.push(...deltaTime(Math.max(0, delta)), 0x90 | channel, event.note, velocity);
145:           break;
146:         }
147:         case 'note_off': {
148:           const velocity = Math.round((event.velocity ?? 0) * 127);
149:           trackEvents.push(...deltaTime(Math.max(0, delta)), 0x80 | channel, event.note, velocity);
150:           break;
151:         }
152:         case 'control': {
153:           trackEvents.push(...deltaTime(Math.max(0, delta)), 0xb0 | channel, event.controller, event.value);
154:           break;
155:         }
156:         case 'pitch_bend': {
157:           const bend = Math.round(((event.value ?? 0) + 1) * 8191);
158:           const lsb = bend & 0x7f;
159:           const msb = (bend >> 7) & 0x7f;
160:           trackEvents.push(...deltaTime(Math.max(0, delta)), 0xe0 | channel, lsb, msb);
161:           break;
162:         }
163:         case 'program_change': {
164:           trackEvents.push(...deltaTime(Math.max(0, delta)), 0xc0 | channel, event.program);
165:           break;
166:         }
167:       }
168:     }
169: 
170:     trackEvents.push(...deltaTime(0), 0xff, 0x2f, 0x00);
171:     trackChunks.push(buildChunk('MTrk', new Uint8Array(trackEvents)));
172:   }
173: 
174:   const numTracks = trackChunks.length;
175:   const headerChunk = buildChunk('MThd', new Uint8Array([
176:     0x00, 0x01,
177:     (numTracks >> 8) & 0xff, numTracks & 0xff,
178:     ...uint16(ppq),
179:   ]));
180: 
181:   const totalLength = headerChunk.length + trackChunks.reduce((s, c) => s + c.length, 0);
182:   const result = new Uint8Array(totalLength);
183:   result.set(headerChunk, 0);
184:   let offset = headerChunk.length;
185:   for (const chunk of trackChunks) {
186:     result.set(chunk, offset);
187:     offset += chunk.length;
188:   }
189:   return result;
190: }
191: 
192: const MIDI_EVENT_TYPES = ['note_on', 'note_off', 'control', 'pitch_bend', 'program_change'];
193: 
194: function buildChunk(type, data) {
195:   const chunk = new Uint8Array(8 + data.length);
196:   for (let i = 0; i < 4; i++) {
197:     chunk[i] = type.charCodeAt(i);
198:   }
199:   const view = new DataView(chunk.buffer);
200:   view.setUint32(4, data.length, false);
201:   chunk.set(data, 8);
202:   return chunk;
203: }
204: 
205: function deltaTime(ticks) {
206:   const bytes = [];
207:   let value = ticks;
208:   do {
209:     let byte = value & 0x7f;
210:     value >>= 7;
211:     if (bytes.length > 0) byte |= 0x80;
212:     bytes.unshift(byte);
213:   } while (value > 0);
214:   if (bytes.length === 0) bytes.push(0);
215:   return bytes;
216: }
217: 
218: function uint16(value) {
219:   return [(value >> 8) & 0xff, value & 0xff];
220: }
221: 
222: function uint24(value) {
223:   return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
224: }
225: 
226: function stringBytes(str) {
227:   const encoder = new TextEncoder();
228:   const bytes = Array.from(encoder.encode(str));
229:   return [bytes.length, ...bytes];
230: }

(End of file - total 230 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ai/ai-client.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ai/ai-client.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Client API IA pour suggestions de réharmonisation.
2: // Compatible OpenAI (Groq, OpenRouter, Google AI Studio, etc.).
3: // Retourne null si aucune clé configurée → fallback algorithmique dans reharmonizer.js.
4: // La clé est cherchée dans :
5: //   1. localStorage (via openai-config.js / modal UI)
6: //   2. window.electronAPI.env.IA_API_KEY (exposé par preload depuis .env)
7: //
8: // NOTE : le modèle llama-3.1-8b ne maîtrise pas toujours la théorie musicale.
9: // Les notes générées sont validées avant d'être acceptées. Si invalides → fallback.
10: 
11: import { getAIConfig } from './openai-config.js';
12: import movementsLibrary from '../data/movements-library.json' with { type: 'json' };
13: import { classifyVoicing } from '../chord-engine/index.js';
14: 
15: const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
16: const NOTE_PC_MAP = {
17:   C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
18:   E: 4, Fb: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
19:   Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
20: };
21: const OCTAVE_BASE = 12; // C4 = 60
22: 
23: function noteNameToMidi(name) {
24:   if (typeof name === 'number') return Math.round(name);
25:   if (!name || typeof name !== 'string') return null;
26:   const match = name.trim().match(/^([A-G][#b]?)(-?\d+)$/i);
27:   if (!match) return null;
28:   const pc = NOTE_PC_MAP[match[1]];
29:   if (pc == null) return null;
30:   const octave = parseInt(match[2], 10);
31:   return octave * 12 + pc + 12; // C4 = 60
32: }
33: 
34: export function midiToNoteName(midi) {
35:   const pc = ((midi % 12) + 12) % 12;
36:   const octave = Math.floor(midi / 12) - 1;
37:   return `${NOTE_NAMES[pc]}${octave}`;
38: }
39: 
40: function parseVoicing(voicing) {
41:   if (!Array.isArray(voicing)) return [];
42:   return voicing.map(noteNameToMidi).filter((n) => n != null && n >= 24 && n <= 108);
43: }
44: 
45: // Normalise une suggestion en recalculant Top Note et type de voicing via le moteur harmonique.
46: // Le texte original (bibliothèque/IA) devient un label de style informatif, jamais la vérité technique.
47: function normalizeSuggestion(suggestion) {
48:   if (!suggestion || !Array.isArray(suggestion.voicingNotes) || suggestion.voicingNotes.length === 0) {
49:     return null;
50:   }
51:   const classification = classifyVoicing(suggestion.voicingNotes);
52:   return {
53:     ...suggestion,
54:     topNoteMidi: classification.topNote,
55:     topNoteName: midiToNoteName(classification.topNote),
56:     voicingType: classification.voicingType,
57:     // styleLabel conserve l'intention textuelle originale (ex. "Drop 2 / Substitution Diatonique")
58:     styleLabel: suggestion.technique || '',
59:     technique: classification.voicingType,
60:   };
61: }
62: 
63: function getApiConfig() {
64:   const local = getAIConfig();
65:   if (local.apiKey) return local;
66: 
67:   // Fallback : variable d'environnement exposée par le preload Electron
68:   try {
69:     const envKey = window.electronAPI?.env?.IA_API_KEY;
70:     const envBaseUrl = window.electronAPI?.env?.IA_BASE_URL;
71:     const envModel = window.electronAPI?.env?.IA_MODEL;
72:     if (envKey) {
73:       return {
74:         baseUrl: envBaseUrl || 'https://api.groq.com/openai/v1',
75:         apiKey: envKey,
76:         model: envModel || 'llama-3.1-8b-instant',
77:       };
78:     }
79:   } catch (e) { /* window.electronAPI non disponible */ }
80: 
81:   return null;
82: }
83: 
84: function safeJsonParse(text) {
85:   if (!text || typeof text !== 'string') return null;
86:   // Nettoyer les balises markdown et extraire le bloc JSON le plus profond
87:   let cleaned = text
88:     .replace(/```json\s*/gi, '')
89:     .replace(/```\s*/gi, '')
90:     .replace(/^\s*\n*/, '')
91:     .replace(/\s*\n*$/, '');
92:   const match = cleaned.match(/\{[\s\S]*\}/);
93:   if (!match) return null;
94:   let raw = match[0];
95:   try {
96:     return JSON.parse(raw);
97:   } catch (_) {
98:     raw = raw
99:       .replace(/,(\s*[}\]])/g, '$1')
100:       .replace(/([{,])\s*'([^']+)'\s*:/g, '$1"$2":')
101:       .replace(/:\s*'([^']+)'\s*([,}])/g, ':"$1"$2')
102:       .replace(/\n\s*\/\/[^\n]*/g, '');
103:     try {
104:       return JSON.parse(raw);
105:     } catch (err) {
106:       console.warn('[AI] safeJsonParse final failure:', err.message);
107:       return null;
108:     }
109:   }
110: }
111: 
112: // Valide que les notes MIDI contiennent la fondamentale declaree par l'IA.
113: function validateAINotes(name, notes) {
114:   if (!name || !Array.isArray(notes) || notes.length < 2) return false;
115:   if (notes.some((n) => n < 36 || n > 96)) return false;
116:   const pcs = new Set(notes.map((n) => n % 12));
117:   const rootMatch = name.match(/^([A-G][#b]?)/);
118:   if (!rootMatch) return true;
119:   const claimedRootPc = NOTE_PC_MAP[rootMatch[1]];
120:   if (claimedRootPc == null) return true;
121:   return pcs.has(claimedRootPc);
122: }
123: 
124: export async function generateReharmonization(chord, style, topNoteName = '—') {
125:   const config = getApiConfig();
126:   if (!config) return null;
127: 
128:   const rootPc = typeof chord.rootPc === 'number' ? chord.rootPc : 0;
129:   const symbol = chord.symbol || '';
130:   const notes = chord.notes || [];
131:   const rootName = NOTE_NAMES[rootPc % 12] || '?';
132:   const originalName = `${rootName}${symbol}`;
133: 
134:   const styleDesc = {
135:     worship: 'ouverts, aérés, suspendus (sus4, add9, maj7), voix amples',
136:     gospel: 'riches, avec tensions (9, 13, #9, b9), block chords, voix serrées',
137:     jazz: 'voicings de type drop 2, drop 3, rootless, substitutions altérées, quartals',
138:     neoSoul: 'voicings étendus avec 9, 11, 13, couleurs Jazz modales, planing',
139:   };
140: 
141:   const libraryText = movementsLibrary.movements
142:     .map((m) => `- ${m.artist} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
143:     .join('\n');
144: 
145:   const systemPrompt = `Tu es l'algorithme central de réharmonisation de l'application. Tu analyses la suite de mouvements jouée par l'utilisateur (Basse + Top Note). Au lieu de suggérer des accords théoriques isolés, tu fouilles dans la bibliothèque de mouvements locale extraite des vidéos précédemment analysées pour proposer 3 alternatives basées sur des signatures réelles.
146: 
147: BIBLIOTHÈQUE DE MOUVEMENTS LOCALE :
148: ${libraryText}
149: 
150: RÈGLES STRICTES :
151: 1. L'accord original DOIT garder sa fondamentale. Les suggestions sont des REHARMONISATIONS, pas des accords complètement différents.
152: 2. Les voicings DOIVENT être jouables à la main gauche : 2 à 6 notes, tessiture C2-C6 (MIDI 36-84).
153: 3. Chaque suggestion doit citer explicitement une catégorie stylistique (Walk-up Gospel, Montée diatonique Worship, Turnaround Gospel, Couleur Gospel moderne, Substitution Jazz, II-V-I Jazz mineur, ou Générique) plutôt qu'un nom d'artiste.
154: 4. Le champ "voicing" est un tableau de notes au format "NoteOctave" (ex: "C#2", "B2", "E3").
155: 5. La "technique" doit décrire le mouvement (Drop 2, Quartal, Rootless, Substitution tritonique, etc.).
156: 6. Réponds UNIQUEMENT en JSON valide, sans aucun texte avant/après.
157: 
158: Format attendu :
159: {
160:   "accord_original": "Em7",
161:   "top_note": "G#",
162:   "suggestions": [
163:     { "inspiration": "Substitution Jazz", "voicing": ["C#2", "B2", "E3", "G#3", "B3"], "technique": "Drop 2 / Substitution Diatonique" },
164:     { "inspiration": "Couleur Gospel moderne", "voicing": ["A2", "E3", "G3", "B3", "D4", "G#4"], "technique": "La6/9 basse de Mi / Quartal" },
165:     { "inspiration": "II-V-I Jazz mineur", "voicing": ["D#2", "A#2", "C#3", "F#3", "A#3"], "technique": "2-5-1 Mineur Altéré / Rootless" }
166:   ]
167: }`;
168: 
169:   const userPrompt = `Accord original : ${originalName} (fondamentale ${rootPc}, top note ${topNoteName}, notes ${JSON.stringify(notes)})
170: Style cible : ${style} — ${styleDesc[style] || ''}
171: 
172: Propose 3 réharmonisations inspirées de la bibliothèque de mouvements locales pour ${originalName}.`;
173: 
174:   try {
175:     const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
176:       method: 'POST',
177:       headers: {
178:         'Content-Type': 'application/json',
179:         Authorization: `Bearer ${config.apiKey}`,
180:       },
181:       body: JSON.stringify({
182:         model: config.model,
183:         messages: [
184:           { role: 'system', content: systemPrompt },
185:           { role: 'user', content: userPrompt },
186:         ],
187:         max_tokens: 500,
188:         temperature: 0.35,
189:       }),
190:     });
191: 
192:     if (!response.ok) {
193:       if (response.status === 401 || response.status === 403) {
194:         throw new Error('AI_API_KEY_INVALID');
195:       }
196:       console.warn('[AI] API error:', response.status);
197:       return null;
198:     }
199: 
200:     const data = await response.json();
201:     const content = data.choices?.[0]?.message?.content;
202:     if (!content) return null;
203: 
204:     const result = safeJsonParse(content);
205:     if (!result || !Array.isArray(result.suggestions) || result.suggestions.length === 0) return null;
206: 
207:     // Normaliser, classifier et valider chaque suggestion
208:     const normalizedSuggestions = result.suggestions.map((s) => {
209:       const parsed = parseVoicing(s.voicing);
210:       const base = {
211:         inspiration: s.inspiration || 'Générique',
212:         voicingNotes: parsed,
213:         voicingNames: s.voicing || [],
214:         technique: s.technique || '',
215:       };
216:       return normalizeSuggestion(base);
217:     }).filter((s) => s != null && s.voicingNotes.length >= 2 && s.voicingNotes.every((n) => n >= 36 && n <= 84));
218: 
219:     if (normalizedSuggestions.length === 0) {
220:       console.warn('[AI] Aucune suggestion valide reçue pour', originalName);
221:       return null;
222:     }
223: 
224:     return {
225:       accord_original: result.accord_original || originalName,
226:       top_note: normalizedSuggestions[0]?.topNoteName || topNoteName,
227:       suggestions: normalizedSuggestions,
228:       style,
229:     };
230:   } catch (err) {
231:     if (err.message === 'AI_API_KEY_INVALID') {
232:       console.error('[AI] Clé API invalide ou refusée.');
233:       throw err;
234:     }
235:     console.warn('[AI] Request failed:', err);
236:     return null;
237:   }
238: }
239: 
240: const masterclassCache = new Map();
241: const RETRY_DELAYS = [1000, 3000, 9000];
242: 
243: function hashAnalysis(analysis) {
244:   const chords = analysis.chords || [];
245:   const key = `${analysis.sessionId || 'unknown'}-${chords.length}-${chords.map((c) => `${c.rootPc}${c.symbol || ''}`).join(',')}`;
246:   let h = 0;
247:   for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
248:   return String(h);
249: }
250: 
251: function sleep(ms) {
252:   return new Promise((resolve) => setTimeout(resolve, ms));
253: }
254: 
255: function buildFallbackMasterclass(analysis) {
256:   const chords = analysis.chords || [];
257:   const movements = movementsLibrary.movements || [];
258:   return chords.map((chord, i) => {
259:     const rootName = NOTE_NAMES[chord.rootPc % 12] || '?';
260:     const next = chords[i + 1];
261:     const movement = pickMovementForChord(chord, next, movements);
262:     const isActive = chord._arrangementActive !== false;
263:     return {
264:       index: i,
265:       top_note: `Top note ${midiToNoteName(getTopNoteMidi(chord))}. ${movement ? `Mouvement suggéré : ${movement.category}.` : 'Conservez la mélodie actuelle.'}`,
266:       worship: isActive ? [48, 52, 55, 59] : [],
267:       jazz: isActive ? [55, 59, 62, 65] : [],
268:       passing: movement ? `${movement.pattern} — ${movement.description}` : 'Aucun mouvement de référence trouvé.',
269:       commentaire: isActive
270:         ? (movement
271:           ? `Inspirez-vous du mouvement « ${movement.name} » pour enrichir ce passage.`
272:           : 'Aucune suggestion automatique disponible pour cet accord.')
273:         : 'Accord désactivé dans l\'arrangement.',
274:       skip: !isActive,
275:     };
276:   });
277: }
278: 
279: function getTopNoteMidi(chord) {
280:   if (!chord || !chord.notes || chord.notes.length === 0) return null;
281:   return Math.max(...chord.notes);
282: }
283: 
284: function pickMovementForChord(chord, nextChord, movements) {
285:   if (!movements || movements.length === 0) return null;
286:   const symbol = chord.symbol || '';
287:   const isDom = /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
288:   const isMinor = /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
289:   const hasNext = !!nextChord;
290: 
291:   // Score simple : préférer les mouvements dont le style correspond et qui traitent les dominantes / mineurs.
292:   const scored = movements.map((m) => {
293:     let score = 0;
294:     if (m.style === 'jazz' && isDom) score += 2;
295:     if (m.style === 'gospel' && isDom) score += 2;
296:     if (m.style === 'worship' && !isDom && !isMinor) score += 2;
297:     if (m.style === 'jazz' && isMinor && /m7b5|m9/.test(symbol)) score += 1;
298:     if (hasNext && m.pattern.includes('-')) score += 1; // mouvement de passage
299:     return { m, score };
300:   });
301:   scored.sort((a, b) => b.score - a.score);
302:   return scored[0]?.m || null;
303: }
304: 
305: async function fetchMasterclass(config, systemPrompt, userPrompt) {
306:   const controller = new AbortController();
307:   const timeoutId = setTimeout(() => controller.abort(), 30000);
308: 
309:   try {
310:     const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
311:       method: 'POST',
312:       headers: {
313:         'Content-Type': 'application/json',
314:         Authorization: `Bearer ${config.apiKey}`,
315:       },
316:       body: JSON.stringify({
317:         model: config.model,
318:         messages: [
319:           { role: 'system', content: systemPrompt },
320:           { role: 'user', content: userPrompt },
321:         ],
322:         max_tokens: 2000,
323:         temperature: 0.3,
324:       }),
325:       signal: controller.signal,
326:     });
327: 
328:     clearTimeout(timeoutId);
329: 
330:     if (!response.ok) {
331:       if (response.status === 401 || response.status === 403) {
332:         throw new Error('AI_API_KEY_INVALID');
333:       } else if (response.status === 429) {
334:         throw new Error('AI_RATE_LIMIT');
335:       }
336:       throw new Error(`AI_API_ERROR_${response.status}`);
337:     }
338: 
339:     const data = await response.json();
340:     const content = data.choices?.[0]?.message?.content;
341:     if (!content) return null;
342: 
343:     const result = safeJsonParse(content);
344:     if (!result || !result.masterclass || !Array.isArray(result.masterclass)) return null;
345:     return result.masterclass;
346:   } catch (err) {
347:     clearTimeout(timeoutId);
348:     throw err;
349:   }
350: }
351: 
352: export async function generateMasterclass(analysis) {
353:   const config = getApiConfig();
354:   if (!config) return null;
355: 
356:   const chords = analysis.chords || [];
357:   const sections = analysis.sections || [];
358:   if (chords.length === 0) return null;
359: 
360:   const cacheKey = hashAnalysis(analysis);
361:   if (masterclassCache.has(cacheKey)) {
362:     console.log('[AI] Masterclass servie depuis le cache.');
363:     return masterclassCache.get(cacheKey);
364:   }
365: 
366:   const chordList = chords.map((c, i) => {
367:     const rootName = NOTE_NAMES[c.rootPc % 12] || '?';
368:     const topNote = c.notes && c.notes.length > 0 ? Math.max(...c.notes) : null;
369:     const topNoteName = topNote != null ? `${NOTE_NAMES[topNote % 12]}${Math.floor(topNote / 12) - 1}` : '—';
370:     const notesStr = (c.notes || []).map((n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`).join(' ');
371:     const active = c._arrangementActive !== false;
372:     const bass = c._arrangementBass || 'auto';
373:     return `[${i}] ${active ? 'ACTIF' : 'INACTIF'} ${rootName}${c.symbol || ''} (voicing:${c.voicing || '—'}, notes:${notesStr}, top:${topNoteName}, basse:${bass})`;
374:   }).join('\n');
375: 
376:   const sectionList = sections.map((s) => {
377:     const labels = { Intro: 'Intro', Verse: 'Couplet', PreChorus: 'Pré-refrain', Chorus: 'Refrain', Bridge: 'Bridge', Outro: 'Outro', Interlude: 'Interlude' };
378:     return `${labels[s.label] || s.label} (${formatTime(s.start)} — ${formatTime(s.end)})`;
379:   }).join('\n');
380: 
381:   const libraryText = movementsLibrary.movements
382:     .map((m) => `- ${m.category || 'Générique'} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
383:     .join('\n');
384: 
385:   const systemPrompt = `Tu es un professeur de piano jazz et gospel de renom. Tu analyses des progressions harmoniques completes et tu donnes des conseils personnalises.
386: 
387: BIBLIOTHÈQUE DE MOUVEMENTS LOCALE (cite explicitement ces mouvements quand ils s'appliquent) :
388: ${libraryText}
389: 
390: Pour chaque accord de la session, fournis :
391: 1. **top_note** : analyse de la note de melodie actuelle. Est-elle adaptee au style ? Quelle alternative suggeres-tu ?
392: 2. **worship** : un voicing Worship/Open (drop 2, sus2, doublages) sous forme de notes MIDI
393: 3. **jazz** : un voicing Jazz/Advanced (rootless, enrichissements 9/11/#11/13) sous forme de notes MIDI
394: 4. **passing** : un mouvement de passage vers l'accord suivant (substitution diatonique, turnaround 2-5-1 altere, chromatisme)
395: 5. **commentaire** : un conseil pedagogique en une phrase en francais
396: 
397: Les accords marques INACTIF doivent avoir "skip": true et tu ne proposes pas de voicing pour eux (laisse worship et jazz vides).
398: 
399: REGLE STRICTE : les notes MIDI doivent etre entre 48 et 84 (C3 a C6), 2 a 5 notes par voicing, jouables a la main gauche.
400: 
401: Reponds UNIQUEMENT en JSON valide, sans aucun texte avant/apres. Format :
402: { "masterclass": [
403:     { "index": 0, "top_note": "...", "worship": [60,64,67], "jazz": [57,60,64,67], "passing": "...", "commentaire": "...", "skip": false },
404:     ...
405:   ]
406: }`;
407: 
408:   const userPrompt = `Session complete :
409: 
410: Sections :
411: ${sectionList}
412: 
413: Accords (format : [index] ACTIF/INACTIF nom (voicing, notes, top, basse)) :
414: ${chordList}
415: 
416: Analyse chaque accord et donne des conseils de maître.`;
417: 
418:   let lastErr = null;
419:   for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
420:     try {
421:       const result = await fetchMasterclass(config, systemPrompt, userPrompt);
422:       if (result) {
423:         masterclassCache.set(cacheKey, result);
424:         return result;
425:       }
426:     } catch (err) {
427:       lastErr = err;
428:       if (err.message === 'AI_API_KEY_INVALID') {
429:         console.error('[AI] Clé API invalide ou refusée.');
430:         throw err;
431:       }
432:       if (attempt < RETRY_DELAYS.length) {
433:         console.warn(`[AI] Masterclass tentative ${attempt + 1} échouée (${err.message}). Retry dans ${RETRY_DELAYS[attempt]}ms...`);
434:         await sleep(RETRY_DELAYS[attempt]);
435:       }
436:     }
437:   }
438: 
439:   console.warn('[AI] Masterclass IA indisponible après retry. Fallback sur bibliothèque locale :', lastErr?.message);
440:   const fallback = buildFallbackMasterclass(analysis);
441:   masterclassCache.set(cacheKey, fallback);
442:   return fallback;
443: }
444: 
445: // ── Utilitaires publics ──
446: 
447: export function classifyAndLabel(notes, styleLabel = '') {
448:   if (!Array.isArray(notes) || notes.length === 0) return null;
449:   const base = { voicingNotes: notes, technique: styleLabel };
450:   return normalizeSuggestion(base);
451: }
452: 
453: function formatTime(seconds) {
454:   if (seconds == null) return '--:--';
455:   const m = Math.floor(seconds / 60);
456:   const s = Math.floor(seconds % 60);
457:   return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
458: }

(End of file - total 458 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ai/openai-config.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ai/openai-config.js</path>
<type>file</type>
<content>
1: // [Claude] — 2026-07-04 — Configuration générique pour une API OpenAI-compatible (Groq, OpenRouter, Gemini, etc.)
2: 
3: const STORAGE_KEY = 'piano-jazz-ai-config';
4: 
5: const DEFAULTS = {
6:   baseUrl: 'https://api.groq.com/openai/v1',
7:   apiKey: '',
8:   model: 'llama-3.1-8b-instant',
9: };
10: 
11: export function getAIConfig() {
12:   try {
13:     const raw = localStorage.getItem(STORAGE_KEY);
14:     if (!raw) return { ...DEFAULTS };
15:     const parsed = JSON.parse(raw);
16:     return {
17:       baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
18:       apiKey: parsed.apiKey || DEFAULTS.apiKey,
19:       model: parsed.model || DEFAULTS.model,
20:     };
21:   } catch (e) {
22:     console.warn('[AI Config] Failed to load config:', e);
23:     return { ...DEFAULTS };
24:   }
25: }
26: 
27: export function saveAIConfig(config) {
28:   const safe = {
29:     baseUrl: config.baseUrl?.trim() || DEFAULTS.baseUrl,
30:     apiKey: config.apiKey?.trim() || DEFAULTS.apiKey,
31:     model: config.model?.trim() || DEFAULTS.model,
32:   };
33:   localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
34:   return safe;
35: }
36: 
37: export function createOpenAIClient(config = getAIConfig()) {
38:   return {
39:     baseUrl: config.baseUrl.replace(/\/$/, ''),
40:     apiKey: config.apiKey,
41:     model: config.model,
42:   };
43: }
44: 
45: export async function testAIConfig(config) {
46:   const client = createOpenAIClient(config);
47:   if (!client.apiKey) {
48:     throw new Error('Clé API manquante');
49:   }
50: 
51:   const res = await fetch(`${client.baseUrl}/chat/completions`, {
52:     method: 'POST',
53:     headers: {
54:       'Content-Type': 'application/json',
55:       Authorization: `Bearer ${client.apiKey}`,
56:     },
57:     body: JSON.stringify({
58:       model: client.model,
59:       messages: [{ role: 'user', content: 'Réponds par un simple OK.' }],
60:       max_tokens: 5,
61:     }),
62:   });
63: 
64:   if (!res.ok) {
65:     const body = await res.text();
66:     throw new Error(`Erreur API ${res.status}: ${body}`);
67:   }
68: 
69:   return await res.json();
70: }
71: 
72: export const PRESETS = [
73:   {
74:     name: 'Groq (gratuit, rapide)',
75:     baseUrl: 'https://api.groq.com/openai/v1',
76:     models: [
77:       'llama-3.1-8b-instant',
78:       'llama-3.3-70b-versatile',
79:       'llama-3.3-70b-specdec',
80:       'gemma2-9b-it',
81:       'mixtral-8x7b-32768',
82:     ],
83:   },
84:   {
85:     name: 'OpenRouter (multi-modèles gratuits)',
86:     baseUrl: 'https://openrouter.ai/api/v1',
87:     models: ['meta-llama/llama-3.1-8b-instruct:free', 'google/gemini-flash-1.5:free'],
88:   },
89:   {
90:     name: 'Google AI Studio (Gemini Flash)',
91:     baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
92:     models: ['gemini-1.5-flash', 'gemini-1.5-flash-8b'],
93:   },
94: ];

(End of file - total 94 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 5.4s)

_Thinking:_

Let me continue reading the key files for the audit. I need to look at the chord engine, voicing engine, analyzer modules, and other criticalfiles.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/chord-engine/index.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/chord-engine/index.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-03 — Module moteur harmonique avancé (rootless, quartal, etc.)
2: import { CHORD_DEFINITIONS, ROOTLESS_DEFINITIONS } from './chord-defs.js';
3: 
4: import { formatNote } from './intervals.js';
5: 
6: // [OpenCode] — 2026-07-03 — Upper structure triads detection
7: // Given a detected chord, look for a complete triad formed by the upper notes
8: // whose root is different from the chord root. Common in jazz (e.g. D major over C7).
9: const UPPER_STRUCTURE_TRIADS = [
10:   { name: 'Major', symbol: '', intervals: [0, 4, 7] },
11:   { name: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
12:   { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
13:   { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
14: ];
15: 
16: function findUpperStructure(pcSet, rootPc, notes) {
17:   // Exclude the root from the upper notes search
18:   const upperPcs = notes.filter((pc) => pc !== rootPc);
19:   if (upperPcs.length < 3) return null;
20: 
21:   for (const triad of UPPER_STRUCTURE_TRIADS) {
22:     for (let triadRoot = 0; triadRoot < 12; triadRoot++) {
23:       if (triadRoot === rootPc) continue;
24:       const triadPcs = triad.intervals.map((i) => (triadRoot + i) % 12);
25:       if (triadPcs.every((pc) => upperPcs.includes(pc))) {
26:         return { rootPc: triadRoot, triad };
27:       }
28:     }
29:   }
30:   return null;
31: }
32: 
33: // [OpenCode] — 2026-07-03 — Polychord detection
34: // A polychord is the superposition of two distinct triads.
35: function findPolychord(pcSet) {
36:   const foundTriads = [];
37:   for (const triad of UPPER_STRUCTURE_TRIADS) {
38:     for (let root = 0; root < 12; root++) {
39:       const triadPcs = triad.intervals.map((i) => (root + i) % 12);
40:       if (triadPcs.every((pc) => pcSet.has(pc))) {
41:         foundTriads.push({ rootPc: root, triad });
42:       }
43:     }
44:   }
45:   // Look for pairs of triads with different roots and minimal overlap
46:   for (let i = 0; i < foundTriads.length; i++) {
47:     for (let j = i + 1; j < foundTriads.length; j++) {
48:       const a = foundTriads[i];
49:       const b = foundTriads[j];
50:       if (a.rootPc === b.rootPc) continue;
51:       const setA = new Set(a.triad.intervals.map((i) => (a.rootPc + i) % 12));
52:       const setB = new Set(b.triad.intervals.map((i) => (b.rootPc + i) % 12));
53:       const overlap = [...setA].filter((pc) => setB.has(pc)).length;
54:       if (overlap === 0) {
55:         return { lower: a, upper: b };
56:       }
57:     }
58:   }
59:   return null;
60: }
61: 
62: function setEquals(a, b) {
63:   if (a.size !== b.size) return false;
64:   for (const x of a) {
65:     if (!b.has(x)) return false;
66:   }
67:   return true;
68: }
69: 
70: function isSubset(subset, superset) {
71:   for (const x of subset) {
72:     if (!superset.has(x)) return false;
73:   }
74:   return true;
75: }
76: 
77: function buildPcSet(root, intervals) {
78:   return new Set(intervals.map((i) => (root + i) % 12));
79: }
80: 
81: function findInversionIndex(pcs, root, intervals) {
82:   // intervals are from root, find which chord tone is in the bass
83:   const bassPc = pcs[0]; // pcs is sorted ascending by midi, so first is bass
84:   const idx = intervals.findIndex((i) => (root + i) % 12 === bassPc);
85:   return idx === -1 ? 0 : idx;
86: }
87: 
88: // [OpenCode] — 2026-07-03 — Rootless voicings detection
89: const MIN_ROOTLESS_NOTES = 3;
90: 
91: // [OpenCode] — 2026-07-03 — Dedicated rootless definitions using explicit parent chord tones
92: function findRootlessMatches(pcSet, uniquePcs) {
93:   const matches = [];
94:   // [OpenCode] — 2026-07-03 — Rootless requires at least 3 notes and no more than the voicing size
95:   if (uniquePcs.length < 3) return matches;
96: 
97:   const sortedPlayed = [...uniquePcs].sort((a, b) => a - b);
98: 
99:   for (const def of ROOTLESS_DEFINITIONS) {
100:     if (sortedPlayed.length !== def.intervals.length) continue;
101: 
102:     // Try every possible implied root
103:     for (let impliedRoot = 0; impliedRoot < 12; impliedRoot++) {
104:       // The root must not be present in the played notes
105:       if (pcSet.has(impliedRoot)) continue;
106: 
107:       const rootlessRequired = def.intervals.map((i) => (impliedRoot + i) % 12);
108:       const sortedRequired = [...rootlessRequired].sort((a, b) => a - b);
109: 
110:       if (!sortedPlayed.every((pc, idx) => pc === sortedRequired[idx])) continue;
111: 
112:       // Determine bass note info relative to the parent chord intervals (root included)
113:       const parentIntervals = [0, ...def.intervals];
114:       const bassPc = sortedPlayed[0];
115:       const inversion = parentIntervals.findIndex((i) => (impliedRoot + i) % 12 === bassPc);
116: 
117:       matches.push({
118:         rootPc: impliedRoot,
119:         def,
120:         bassPc,
121:         inversion: inversion === -1 ? 0 : inversion,
122:         confidence: 1.0,
123:       });
124:     }
125:   }
126:   return matches;
127: }
128: 
129: // [OpenCode] — 2026-07-06 — Classifieur pur de voicing, réutilisable pour le jeu live et les suggestions.
130: // Même tableau de notes MIDI en entrée → même résultat en sortie.
131: export function classifyVoicing(midiNotes) {
132:   if (!Array.isArray(midiNotes) || midiNotes.length === 0) {
133:     return { topNote: null, voicingType: '—', inversion: 0, bassPc: null };
134:   }
135: 
136:   const sortedNotes = [...midiNotes].sort((a, b) => a - b);
137:   const topNote = sortedNotes[sortedNotes.length - 1];
138:   const bassMidi = sortedNotes[0];
139:   const bassPc = bassMidi % 12;
140: 
141:   const uniquePcs = Array.from(new Set(sortedNotes.map((n) => n % 12))).sort((a, b) => a - b);
142: 
143:   if (uniquePcs.length < 2) {
144:     return { topNote, voicingType: 'single', inversion: 0, bassPc };
145:   }
146: 
147:   const spans = [];
148:   for (let i = 1; i < uniquePcs.length; i++) {
149:     spans.push((uniquePcs[i] - uniquePcs[i - 1] + 12) % 12);
150:   }
151:   const hasMinorSecond = spans.includes(1);
152:   const hasMajorSecond = spans.includes(2);
153:   const hasOctave = spans.includes(0);
154:   const totalRange = (uniquePcs[uniquePcs.length - 1] - uniquePcs[0] + 12) % 12;
155: 
156:   let voicingType = 'close';
157: 
158:   if (midiNotes.length === 2 && (spans.includes(3) || spans.includes(4) || spans.includes(10) || spans.includes(11))) {
159:     voicingType = 'shell';
160:   } else if (hasMinorSecond) {
161:     voicingType = 'cluster';
162:   } else if (totalRange <= 7 && !hasOctave) {
163:     voicingType = 'close';
164:   } else if (hasOctave || totalRange > 19) {
165:     voicingType = 'spread';
166:   } else if (totalRange > 7) {
167:     voicingType = 'open';
168:   }
169: 
170:   return { topNote, voicingType, inversion: 0, bassPc };
171: }
172: 
173: export function detectChord(activeNotes) {
174:   if (!activeNotes || activeNotes.length === 0) return null;
175: 
176:   const sortedNotes = [...activeNotes].sort((a, b) => a - b);
177:   const bassMidi = sortedNotes[0];
178:   const bassPc = bassMidi % 12;
179:   const uniquePcs = Array.from(new Set(sortedNotes.map((n) => n % 12))).sort((a, b) => a - b);
180:   const pcSet = new Set(uniquePcs);
181: 
182:   const classification = classifyVoicing(sortedNotes);
183:   const voicing = classification.voicingType;
184: 
185:   let bestMatch = null;
186:   let bestScore = -1;
187: 
188:   // [OpenCode] — 2026-07-03 — Standard chord detection first
189:   for (const rootPc of uniquePcs) {
190:     for (const def of CHORD_DEFINITIONS) {
191:       const required = buildPcSet(rootPc, def.intervals);
192:       if (!isSubset(required, pcSet)) continue;
193: 
194:       // Compute score: prefer larger definitions that match exactly, and prefer root = bass
195:       let score = def.intervals.length * 10;
196:       const exactMatch = setEquals(required, pcSet);
197:       if (exactMatch) score += 20; // exact match bonus
198:       if (exactMatch && rootPc === bassPc) score += 15; // strong bonus for exact rooted chord with root in bass
199:       else if (rootPc === bassPc) score += 5; // root in bass bonus
200:       if (rootPc === uniquePcs[0]) score += 3; // alphabetical root bonus
201:       // [OpenCode] — 2026-07-03 — Slight bonus for 7th/9th chords that contain an upper-structure triad
202:       if ((def.symbol.includes('7') || def.symbol.includes('9')) && rootPc === bassPc) {
203:         const upper = findUpperStructure(pcSet, rootPc, uniquePcs);
204:         if (upper) score += 4;
205:       }
206: 
207:       if (score > bestScore) {
208:         bestScore = score;
209:         const inversion = findInversionIndex(uniquePcs, rootPc, def.intervals);
210:         const confidence = setEquals(required, pcSet) ? 1.0 : required.size / pcSet.size;
211:       bestMatch = {
212:         rootPc,
213:         symbol: def.symbol,
214:         fullName: def.name,
215:         intervals: def.intervals,
216:         notes: sortedNotes,
217:         bassPc,
218:         inversion,
219:         isSlash: bassPc !== rootPc,
220:         missing: [],
221:         confidence,
222:         rootless: false,
223:         voicing,
224:       };
225:       }
226:     }
227:   }
228: 
229:   // [OpenCode] — 2026-07-16 — N2-B: Rooted seventh shell recognition
230:   // When a maj7/7/m7 voicing omits the 5th but keeps root (as bass), 3rd, and 7th,
231:   // the canonical quality is returned rather than falling back to power chords.
232:   const SHELL_DEFS = [
233:     { symbol: 'maj7', fullName: 'Major 7', intervals: [0, 4, 11] },
234:     { symbol: '7',    fullName: 'Dominant 7', intervals: [0, 4, 10] },
235:     { symbol: 'm7',   fullName: 'Minor 7', intervals: [0, 3, 10] },
236:   ];
237:   if (!bestMatch || bestScore < 68) {
238:     for (const def of SHELL_DEFS) {
239:       const shellPcs = buildPcSet(bassPc, def.intervals);
240:       if (setEquals(shellPcs, pcSet)) {
241:         const shellScore = 30 + 20 + 15 + (bassPc === uniquePcs[0] ? 3 : 0);
242:         if (shellScore > bestScore) {
243:           bestScore = shellScore;
244:           bestMatch = {
245:             rootPc: bassPc,
246:             symbol: def.symbol,
247:             fullName: def.fullName,
248:             intervals: def.intervals,
249:             notes: sortedNotes,
250:             bassPc,
251:             inversion: 0,
252:             isSlash: false,
253:             missing: [],
254:             confidence: 1.0,
255:             rootless: false,
256:             voicing,
257:             omittedIntervals: [7],
258:           };
259:         }
260:         break;
261:       }
262:     }
263:   }
264: 
265:   // [OpenCode] — 2026-07-03 — Rootless post-processing
266:   // Prefer a rootless interpretation when the standard match is a triad in root position
267:   // and the notes also form a known rootless 7th chord. This covers guide-tone voicings
268:   // like E-G-B being Cmaj7 rootless rather than Em, while preserving slash chords like C/E.
269:   // [Claude] — 2026-07-03 — Correction : ne pas écraser une triade parfaite en position fondamentale par un rootless. Un C-E-G est un C majeur, pas un Am7 rootless.
270:   if (bestMatch && bestMatch.intervals.length === 3 && bestMatch.bassPc === bestMatch.rootPc) {
271:     const rootlessMatches = findRootlessMatches(pcSet, uniquePcs);
272:     const richerRootless = rootlessMatches.find((m) => m.def.intervals.length >= 3);
273:     // Only upgrade to rootless when we have more than 3 notes. With exactly 3 notes, the simplest
274:     // and most reliable reading is the triad itself (e.g. C-E-G is C major, not Am7 rootless).
275:     if (richerRootless && uniquePcs.length > 3) {
276:       const { rootPc, def, bassPc: rlBassPc, inversion, confidence } = richerRootless;
277:       const parentIntervals = [0, ...def.intervals];
278:       return {
279:         rootPc,
280:         symbol: def.symbol,
281:         fullName: `${def.name} (rootless)`,
282:         intervals: parentIntervals,
283:         notes: sortedNotes,
284:         bassPc: rlBassPc,
285:         inversion,
286:         isSlash: rlBassPc !== rootPc,
287:         missing: [0],
288:         confidence,
289:         rootless: true,
290:         voicing,
291:       };
292:     }
293:   }
294: 
295:   // [OpenCode] — 2026-07-03 — Upper structure enrichment
296:   // When a standard chord contains a 7th or 9th/11th/13th, see if the upper notes also form
297:   // a complete triad whose root differs from the chord root. If so, enrich the result.
298:   if (bestMatch && bestMatch.intervals.some((i) => [10, 11, 14, 17, 18, 20, 21].includes(i))) {
299:     const upper = findUpperStructure(pcSet, bestMatch.rootPc, uniquePcs);
300:     if (upper) {
301:       bestMatch.upperStructure = upper;
302:       bestMatch.fullName = `${bestMatch.fullName} (upper: ${upper.triad.name} ${formatNote(upper.rootPc)})`;
303:       bestMatch.voicing = voicing;
304:     }
305:   }
306: 
307:   // [OpenCode] — 2026-07-03 — Polychord detection
308:   // Detect two non-overlapping triads as a polychord. Prefer this interpretation when
309:   // the standard match is just a generic 7th/9th/11th that happens to contain the triads,
310:   // unless it is an exact match with the root in bass.
311:   const exactRooted = bestMatch && bestMatch.confidence === 1.0 && bestMatch.bassPc === bestMatch.rootPc;
312:   if (!exactRooted) {
313:     const poly = findPolychord(pcSet);
314:     if (poly) {
315:       const { lower, upper } = poly;
316:       return {
317:         rootPc: lower.rootPc,
318:         symbol: upper.triad.symbol,
319:         fullName: `${lower.triad.name} / ${upper.triad.name} polychord`,
320:         intervals: [...lower.triad.intervals, ...upper.triad.intervals.map((i) => i + 12)],
321:         notes: sortedNotes,
322:         bassPc,
323:         inversion: 0,
324:         isSlash: true,
325:         missing: [],
326:         confidence: 1.0,
327:         rootless: false,
328:         polychord: { lower, upper },
329:         voicing,
330:       };
331:     }
332:   }
333: 
334:   // [OpenCode] — 2026-07-03 — Helper: detect clusters of minor/major seconds
335:   function hasCluster(notes, requireMinorSecond = false) {
336:     const sorted = [...notes].sort((a, b) => a - b);
337:     for (let i = 1; i < sorted.length; i++) {
338:       const gap = (sorted[i] - sorted[i - 1] + 12) % 12;
339:       if (requireMinorSecond) {
340:         if (gap === 1) return true;
341:       } else {
342:         if (gap === 1 || gap === 2) return true;
343:       }
344:     }
345:     return false;
346:   }
347: 
348:   // [OpenCode] — 2026-07-03 — Rootless fallback
349:   // If no standard chord matches, try interpreting the notes as a rootless jazz voicing.
350:   if (!bestMatch) {
351:     const rootlessMatches = findRootlessMatches(pcSet, uniquePcs);
352:     if (rootlessMatches.length > 0) {
353:       const match = rootlessMatches.sort((a, b) => b.def.intervals.length - a.def.intervals.length)[0];
354:       const { rootPc, def, bassPc: rlBassPc, inversion, confidence } = match;
355:       return {
356:         rootPc,
357:         symbol: def.symbol,
358:         fullName: `${def.name} (rootless)`,
359:         intervals: def.intervals.slice(1),
360:         notes: sortedNotes,
361:         bassPc: rlBassPc,
362:         inversion,
363:         isSlash: rlBassPc !== rootPc,
364:         missing: [0],
365:         confidence,
366:         rootless: true,
367:         voicing,
368:       };
369:     }
370:   }
371: 
372:   if (!bestMatch) {
373:     // Fallback: no known chord.
374:     return {
375:       rootPc: bassPc,
376:       symbol: '?',
377:       fullName: 'Accord non identifié',
378:       intervals: [0],
379:       notes: sortedNotes,
380:       bassPc,
381:       inversion: 0,
382:       isSlash: false,
383:       missing: [],
384:       confidence: 0,
385:       rootless: false,
386:       voicing,
387:     };
388:   }
389: 
390:   bestMatch.voicing = voicing;
391:   return bestMatch;
392: }

(End of file - total 392 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/chord-engine/chord-defs.js",
  "limit": 100
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/chord-engine/chord-defs.js</path>
<type>file</type>
<content>
1: // Interval definitions in semitones from root.
2: // Each chord has a name (english), symbol, optional aliases, and a set of required intervals.
3: // Order matters: first match wins, so put the most specific / jazziest forms first.
4: 
5: export const CHORD_DEFINITIONS = [
6:   // 13th chords
7:   { name: 'Dominant 13 sus4', symbol: '13sus4', intervals: [0, 5, 7, 10, 14, 17, 21] },
8:   { name: 'Major 13', symbol: 'maj13', intervals: [0, 4, 7, 11, 14, 17, 21] },
9:   { name: 'Dominant 13', symbol: '13', intervals: [0, 4, 7, 10, 14, 17, 21] },
10:   { name: 'Minor 13', symbol: 'm13', intervals: [0, 3, 7, 10, 14, 17, 21] },
11:   { name: 'Dominant 13 #11', symbol: '13#11', intervals: [0, 4, 7, 10, 14, 18, 21] },
12:   { name: 'Dominant 7 b13', symbol: '7b13', intervals: [0, 4, 7, 10, 14, 20] },
13:   { name: 'Dominant 7 #9 b13', symbol: '7#9b13', intervals: [0, 4, 7, 10, 15, 20] },
14:   { name: 'Dominant 7 b9 b13', symbol: '7b9b13', intervals: [0, 4, 7, 10, 13, 20] },
15: 
16:   // 11th chords
17:   { name: 'Major 11', symbol: 'maj11', intervals: [0, 4, 7, 11, 14, 17] },
18:   { name: 'Dominant 11', symbol: '11', intervals: [0, 4, 7, 10, 14, 17] },
19:   { name: 'Minor 11', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
20:   { name: 'Dominant 7 #11', symbol: '7#11', intervals: [0, 4, 7, 10, 18] },
21: 
22:   // 9th chords
23:   { name: 'Dominant 9 sus4', symbol: '9sus4', intervals: [0, 5, 7, 10, 14] },
24:   { name: 'Major 9', symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
25:   { name: 'Dominant 9', symbol: '9', intervals: [0, 4, 7, 10, 14] },
26:   { name: 'Minor 9', symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
27:   { name: 'Dominant 7 b9', symbol: '7b9', intervals: [0, 4, 7, 10, 13] },
28:   { name: 'Dominant 7 #9', symbol: '7#9', intervals: [0, 4, 7, 10, 15] },
29:   { name: 'Dominant 7 b9 #9', symbol: '7b9#9', intervals: [0, 4, 7, 10, 13, 15] },
30:   { name: 'Minor 7 b9', symbol: 'm7b9', intervals: [0, 3, 7, 10, 13] },
31: 
32:   // 7th chords
33:   { name: 'Major 7', symbol: 'maj7', intervals: [0, 4, 7, 11] },
34:   { name: 'Dominant 7', symbol: '7', intervals: [0, 4, 7, 10] },
35:   { name: 'Minor 7', symbol: 'm7', intervals: [0, 3, 7, 10] },
36:   { name: 'Half-Diminished 7', symbol: 'm7b5', intervals: [0, 3, 6, 10] },
37:   { name: 'Diminished 7', symbol: 'dim7', intervals: [0, 3, 6, 9] },
38:   { name: 'Augmented 7', symbol: '7#5', intervals: [0, 4, 8, 10] },
39:   { name: 'Dominant 7 b5', symbol: '7b5', intervals: [0, 4, 6, 10] },
40:   { name: 'Major 7 #5', symbol: 'maj7#5', intervals: [0, 4, 8, 11] },
41:   { name: 'Minor Major 7', symbol: 'mMaj7', intervals: [0, 3, 7, 11] },
42:   { name: 'Dominant 7 sus4', symbol: '7sus4', intervals: [0, 5, 7, 10] },
43:   { name: 'Dominant 7 sus2', symbol: '7sus2', intervals: [0, 2, 7, 10] },
44:   { name: 'Major 7 suspended 2', symbol: 'maj7sus2', intervals: [0, 2, 7, 11] },
45:   { name: 'Major 7 suspended 4', symbol: 'maj7sus4', intervals: [0, 5, 7, 11] },
46:   { name: 'Minor 7 b5', symbol: 'm7b5', intervals: [0, 3, 6, 10] },
47: 
48:   // 6/9 and add chords
49:   { name: 'Major 6/9', symbol: '6/9', intervals: [0, 4, 7, 9, 14] },
50:   { name: 'Major 6', symbol: '6', intervals: [0, 4, 7, 9] },
51:   { name: 'Minor 6', symbol: 'm6', intervals: [0, 3, 7, 9] },
52:   { name: 'Major add9', symbol: 'add9', intervals: [0, 4, 7, 14] },
53:   { name: 'Minor add9', symbol: 'madd9', intervals: [0, 3, 7, 14] },
54:   { name: 'Major add11', symbol: 'add11', intervals: [0, 4, 7, 17] },
55:   { name: 'Major 6 add11', symbol: '6add11', intervals: [0, 4, 7, 9, 17] },
56: 
57:   // Triads
58:   { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8] },
59:   { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6] },
60:   { name: 'Major', symbol: '', intervals: [0, 4, 7] },
61:   { name: 'Minor', symbol: 'm', intervals: [0, 3, 7] },
62:   { name: 'Sus4', symbol: 'sus4', intervals: [0, 5, 7] },
63:   { name: 'Sus2', symbol: 'sus2', intervals: [0, 2, 7] },
64: 
65:   // Power chord
66:   { name: 'Power', symbol: '5', intervals: [0, 7] },
67: 
68:   // Quartal voicings (stacks of perfect fourths, common in modal/modern jazz)
69:   { name: 'Quartal', symbol: 'quartal', intervals: [0, 5, 10] },
70:   { name: 'Quartal add4', symbol: 'quartal(add4)', intervals: [0, 5, 10, 15] },
71: 
72:   // Single notes
73:   { name: '', symbol: '', intervals: [0] },
74: 
75:   // Définition factice partageant le symbole 'm7b5' pour tester la résolution
76:   // canonique. Elle doit être placée après la définition standard. Grâce à
77:   // `parentSymbol`, `resolveCanonicalChordDefinition` l'ignore et la définition
78:   // complète [0,3,6,10] reste choisie pour 'm7b5'.
79:   { name: 'Half-Diminished 7 (rootless mirror)', symbol: 'm7b5', parentSymbol: 'm7b5', intervals: [3, 6, 10] },
80: ];
81: 
82: // [OpenCode] — 2026-07-03 — Common rootless jazz voicings
83: // Each entry describes a set of pitch classes (relative to the implied root) that, when played
84: // without the root, represents the parent chord.
85: export const ROOTLESS_DEFINITIONS = [
86:   { name: 'Major 7', symbol: 'maj7', parentSymbol: 'maj7', intervals: [4, 7, 11] },      // 3-5-7
87:   { name: 'Major 9', symbol: 'maj9', parentSymbol: 'maj9', intervals: [4, 7, 11, 14] },    // 3-5-7-9
88:   { name: 'Dominant 7', symbol: '7', parentSymbol: '7', intervals: [4, 7, 10] },            // 3-5-b7
89:   { name: 'Dominant 9', symbol: '9', parentSymbol: '9', intervals: [4, 7, 10, 14] },        // 3-5-b7-9
90:   { name: 'Minor 7', symbol: 'm7', parentSymbol: 'm7', intervals: [3, 7, 10] },             // b3-5-b7
91:   { name: 'Minor 9', symbol: 'm9', parentSymbol: 'm9', intervals: [3, 7, 10, 14] },        // b3-5-b7-9
92:   { name: 'Half-Diminished 7', symbol: 'm7b5', parentSymbol: 'm7b5', intervals: [3, 6, 10] }, // b3-b5-b7
93: ];
94: 
95: // Intervals names for pedagogical display
96: export const INTERVAL_NAMES = {
97:   0: 'fondamentale',
98:   1: 'mineure seconde',
99:   2: 'majeure seconde',
100:   3: 'mineure tierce',

(Showing lines 1-100 of 118. Use offset=101 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/chord-engine/voicing.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/chord-engine/voicing.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Labels pédagogiques pour les types de voicing
2: 
3: const VOICING_LABELS = {
4:   single: 'Note seule',
5:   shell: 'Shell voicing',
6:   cluster: 'Cluster',
7:   close: 'Close voicing',
8:   open: 'Open voicing',
9:   spread: 'Spread voicing',
10: };
11: 
12: export function getVoicingLabel(voicing) {
13:   return VOICING_LABELS[voicing] || voicing || '';
14: }
15: 
16: // [OpenCode] — 2026-07-04 — Alias musicaux utiles : même notes, nom différent.
17: // Clé = symbole principal, valeur = symbole alternatif (sans fondamentale).
18: const ALIASES = {
19:   '6': 'm7 (3rd inversion)',
20:   'm7': '6 (relative major)',
21:   'maj7#5': 'maj7alt',
22:   '7sus4': 'sus4 7',
23:   '9sus4': 'sus4 9',
24:   '13sus4': 'sus4 13',
25: };
26: 
27: export function getAlias(symbol) {
28:   return ALIASES[symbol] || null;
29: }

(End of file - total 29 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/data-model.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/data-model.js</path>
<type>file</type>
<content>
1: // Types / data model immuables du voicing-engine.
2: // Aucun code exécutable, juste des constantes et constructeurs purs.
3: 
4: /**
5:  * Entrée pure normalisée pour le voicing-engine.
6:  * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
7:  */
8: 
9: /**
10:  * Notes MIDI d'une main.
11:  * @typedef {{ hand: 'LH' | 'RH', notes: number[], metadata: VoicingHandMetadata }} HandVoicing
12:  */
13: 
14: /**
15:  * Métadonnées attachées à une main.
16:  * @typedef {{
17:  *   rootless: boolean,
18:  *   omitted?: string[],
19:  *   doubled?: string[],
20:  *   source?: string
21:  * }} VoicingHandMetadata
22:  */
23: 
24: /**
25:  * Candidate complète (LH + RH) pour un accord.
26:  * @typedef {{
27:  *   input: VoicingInput,
28:  *   lh: HandVoicing,
29:  *   rh: HandVoicing,
30:  *   score: number,
31:  *   metadata: VoicingCandidateMetadata
32:  * }} VoicingCandidate
33:  */
34: 
35: /**
36:  * Métadonnées globales de la candidate.
37:  * `generatorId` est réservé pour Phase 1+ et reste vide en Phase 0.
38:  * @typedef {{
39:  *   generatorId: string,
40:  *   rootless: boolean,
41:  *   features: import('./constraints.js').SoftConstraintFeatures
42:  * }} VoicingCandidateMetadata
43:  */
44: 
45: /**
46:  * Résultat de validation hard.
47:  * @typedef {{
48:  *   valid: boolean,
49:  *   errors: string[]
50:  * }} ConstraintResult
51:  */
52: 
53: /** Métadonnées par défaut pour une main en Phase 0 (rootless toujours false). */
54: export const DEFAULT_HAND_METADATA = Object.freeze({
55:   rootless: false,
56:   omitted: [],
57:   doubled: [],
58:   source: '',
59: });
60: 
61: /** Métadonnées par défaut pour une candidate en Phase 0.
62:  * Les champs suffixés `Reserved` sont explicitement des placeholders
63:  * pour des phases ultérieures ; ils ne doivent pas être interprétés comme des
64:  * mesures fonctionnelles en Phase 0.
65:  */
66: export function createDefaultCandidateMetadata() {
67:   return Object.freeze({
68:     generatorId: '',
69:     rootless: false,
70:     features: {
71:       lhNotesInSoft: 0,
72:       rhNotesInSoft: 0,
73:       totalNotesInSoft: 0,
74:       lhSpan: 0,
75:       rhSpan: 0,
76:       totalSpan: 0,
77:       bassDistanceFromIdealLowReserved: 0,
78:       voiceLeadingCostReserved: 0,
79:       completeness: 0,
80:       doublings: 0,
81:       omissions: 0,
82:     },
83:   });
84: }
85: 
86: /**
87:  * Crée un HandVoicing immuable.
88:  * Rejette les valeurs MIDI non entières (float, NaN, Infinity, chaînes).
89:  * @param {'LH' | 'RH'} hand
90:  * @param {number[]} notes
91:  * @param {Partial<VoicingHandMetadata>} [metadata]
92:  * @returns {HandVoicing}
93:  */
94: export function createHandVoicing(hand, notes, metadata = {}) {
95:   const bad = notes.find((n) => !Number.isInteger(n));
96:   if (bad !== undefined) {
97:     throw new TypeError(`HandVoicing notes must be integer MIDI numbers, got ${bad}`);
98:   }
99:   return Object.freeze({
100:     hand,
101:     notes: Object.freeze([...notes].sort((a, b) => a - b)),
102:     metadata: Object.freeze({ ...DEFAULT_HAND_METADATA, ...metadata }),
103:   });
104: }
105: 
106: /**
107:  * Crée une VoicingCandidate immuable.
108:  * @param {VoicingInput} input
109:  * @param {HandVoicing} lh
110:  * @param {HandVoicing} rh
111:  * @param {number} score
112:  * @param {Partial<VoicingCandidateMetadata>} [metadata]
113:  * @returns {VoicingCandidate}
114:  */
115: export function createVoicingCandidate(input, lh, rh, score, metadata = {}) {
116:   const defaults = createDefaultCandidateMetadata();
117:   return Object.freeze({
118:     input,
119:     lh,
120:     rh,
121:     score,
122:     metadata: Object.freeze({
123:       ...defaults,
124:       ...metadata,
125:       features: Object.freeze({ ...defaults.features, ...(metadata.features || {}) }),
126:     }),
127:   });
128: }

(End of file - total 128 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/generate-voicing.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/generate-voicing.js</path>
<type>file</type>
<content>
1: // API publique Phase 1 du Two-Hand Piano Voicing Engine.
2: // Reçoit un symbole d'accord ou un VoicingInput normalisé et retourne un
3: // voicing close-v1 déterministe, stateless, sans UI.
4: 
5: import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
6: import { generateCloseVoicing, CLOSE_GENERATOR_ID } from './candidate-generator.js';
7: import { generateSimpleVoicing } from './styles/simple.js';
8: import { isSupportedInV1 } from './vocabulary.js';
9: 
10: /**
11:  * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
12:  */
13: 
14: /**
15:  * Génère un voicing close-v1 à partir d'un symbole d'accord.
16:  * @param {string} chordSymbol
17:  * @returns {ReturnType<typeof generateCloseVoicing>}
18:  */
19: export function generateVoicingFromSymbol(chordSymbol, options = {}) {
20:   const input = normalizeVoicingInputFromSymbol(chordSymbol);
21:   return dispatchVoicing(input, options);
22: }
23: 
24: /**
25:  * Génère un voicing à partir d'un objet brut.
26:  * @param {{ rootPc: number, quality: string, bassPc?: number|null }} rawInput
27:  * @param {{ style?: string }} [options]
28:  * @returns {ReturnType<typeof generateCloseVoicing> | ReturnType<typeof generateSimpleVoicing>}
29:  */
30: export function generateVoicing(rawInput, options = {}) {
31:   const input = normalizeVoicingInput(rawInput);
32:   return dispatchVoicing(input, options);
33: }
34: 
35: function dispatchVoicing(input, options) {
36:   if (!input.valid) return generateCloseVoicing(input);
37: 
38:   const style = options.style || 'close';
39: 
40:   if (!isSupportedInV1(input.quality)) {
41:     return Object.freeze({
42:       ok: false,
43:       input,
44:       selectedCandidate: null,
45:       candidatesConsidered: 0,
46:       candidatesValid: 0,
47:       diagnostics: Object.freeze([`quality '${input.quality}' is not supported in V1`]),
48:       rejectionReasons: Object.freeze(['UNSUPPORTED_QUALITY']),
49:     });
50:   }
51: 
52:   if (style === 'close') {
53:     return generateCloseVoicing(input);
54:   }
55: 
56:   if (style === 'simple') {
57:     return generateSimpleVoicing(input);
58:   }
59: 
60:   return Object.freeze({
61:     ok: false,
62:     input,
63:     selectedCandidate: null,
64:     candidatesConsidered: 0,
65:     candidatesValid: 0,
66:     diagnostics: Object.freeze([`unsupported style: '${style}'`]),
67:     rejectionReasons: Object.freeze(['UNSUPPORTED_STYLE']),
68:   });
69: }
70: 
71: export { CLOSE_GENERATOR_ID, generateCloseVoicing };

(End of file - total 71 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/constraints.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/constraints.js</path>
<type>file</type>
<content>
1: // Validation hard et mesure soft features du voicing-engine.
2: // Toutes les fonctions sont pures, aucune dépendance UI.
3: 
4: import {
5:   LH_HARD_RANGE,
6:   LH_SOFT_RANGE,
7:   LH_MAX_SPAN,
8:   RH_HARD_RANGE,
9:   RH_SOFT_RANGE,
10:   RH_MAX_SPAN,
11:   midiInRange,
12:   span,
13:   isIntegerMidi,
14: } from './hand-ranges.js';
15: 
16: /**
17:  * @typedef {import('./data-model.js').HandVoicing} HandVoicing
18:  * @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate
19:  */
20: 
21: /**
22:  * Caractéristiques mesurées pour le scoring soft.
23:  * Les champs suffixés `Reserved` sont explicitement des placeholders pour des
24:  * phases ultérieures ; ils ne doivent pas être interprétés comme des mesures
25:  * fonctionnelles en Phase 0.
26:  * @typedef {{
27:  *   lhNotesInSoft: number,
28:  *   rhNotesInSoft: number,
29:  *   totalNotesInSoft: number,
30:  *   lhSpan: number,
31:  *   rhSpan: number,
32:  *   totalSpan: number,
33:  *   bassDistanceFromIdealLowReserved: number,
34:  *   voiceLeadingCostReserved: number,
35:  *   completeness: number,
36:  *   doublings: number,
37:  *   omissions: number
38:  * }} SoftConstraintFeatures
39:  */
40: 
41: /**
42:  * Vérifie qu'un HandVoicing respecte les contraintes strictes.
43:  * @param {HandVoicing} handVoicing
44:  * @returns {import('./data-model.js').ConstraintResult}
45:  */
46: export function checkHandHardConstraints(handVoicing) {
47:   const errors = [];
48:   const { hand, notes } = handVoicing;
49:   if (!notes || notes.length === 0) {
50:     return { valid: true, errors: [] };
51:   }
52: 
53:   const range = hand === 'LH' ? LH_HARD_RANGE : RH_HARD_RANGE;
54:   const maxSpan = hand === 'LH' ? LH_MAX_SPAN : RH_MAX_SPAN;
55: 
56:   const nonIntegerNotes = notes.filter((n) => !isIntegerMidi(n));
57:   if (nonIntegerNotes.length > 0) {
58:     errors.push(`${hand} notes must be integer MIDI numbers, got: ${nonIntegerNotes.join(',')}`);
59:   }
60: 
61:   const outOfRange = notes.filter((n) => isIntegerMidi(n) && !midiInRange(n, range));
62:   if (outOfRange.length > 0) {
63:     errors.push(`${hand} notes out of hard range ${range.min}-${range.max}: ${outOfRange.join(',')}`);
64:   }
65: 
66:   const duplicates = notes.filter((n, i) => notes.indexOf(n) !== i);
67:   if (duplicates.length > 0) {
68:     errors.push(`${hand} duplicate MIDI notes: ${[...new Set(duplicates)].join(',')}`);
69:   }
70: 
71:   if (span(notes) > maxSpan) {
72:     errors.push(`${hand} span ${span(notes)} exceeds max ${maxSpan}`);
73:   }
74: 
75:   return { valid: errors.length === 0, errors };
76: }
77: 
78: /**
79:  * Vérifie qu'une candidate complète respecte les contraintes globales.
80:  * - Pas de croisement : toutes les notes LH <= toutes les notes RH.
81:  * - Si l'entrée indique un bassPc, la note la plus grave globale doit être cette hauteur (mod 12).
82:  * @param {VoicingCandidate} candidate
83:  * @returns {import('./data-model.js').ConstraintResult}
84:  */
85: export function checkCandidateHardConstraints(candidate) {
86:   const errors = [];
87:   const { input, lh, rh } = candidate;
88: 
89:   const lhCheck = checkHandHardConstraints(lh);
90:   const rhCheck = checkHandHardConstraints(rh);
91:   errors.push(...lhCheck.errors, ...rhCheck.errors);
92: 
93:   const allNotes = [...lh.notes, ...rh.notes];
94:   if (allNotes.length > 0) {
95:     // Une main vide ne peut pas croiser l'autre : sa borne est -Infinity/+Infinity.
96:     // On vérifie explicitement qu'il y a au moins une note de chaque côté avant de comparer.
97:     const maxLh = lh.notes.length > 0 ? Math.max(...lh.notes) : -Infinity;
98:     const minRh = rh.notes.length > 0 ? Math.min(...rh.notes) : Infinity;
99:     if (maxLh > minRh) {
100:       errors.push(`hand crossing: LH max ${maxLh} > RH min ${minRh}`);
101:     }
102: 
103:     if (input.bassPc != null) {
104:       const lowest = Math.min(...allNotes);
105:       if (lowest % 12 !== input.bassPc) {
106:         errors.push(`slash bass mismatch: lowest MIDI ${lowest} (${lowest % 12}) != expected pc ${input.bassPc}`);
107:       }
108:     }
109:   }
110: 
111:   return { valid: errors.length === 0, errors };
112: }
113: 
114: /**
115:  * Mesure les features soft d'une candidate.
116:  * @param {VoicingCandidate} candidate
117:  * @returns {SoftConstraintFeatures}
118:  */
119: export function measureSoftConstraintFeatures(candidate) {
120:   const { input, lh, rh } = candidate;
121:   const lhNotesInSoft = lh.notes.filter((n) => midiInRange(n, LH_SOFT_RANGE)).length;
122:   const rhNotesInSoft = rh.notes.filter((n) => midiInRange(n, RH_SOFT_RANGE)).length;
123: 
124:   const allNotes = [...lh.notes, ...rh.notes];
125:   const uniquePcs = new Set(allNotes.map((n) => n % 12));
126:   const requiredPcs = new Set(input.chordTonePcs);
127: 
128:   let completeness = 0;
129:   for (const pc of requiredPcs) {
130:     if (uniquePcs.has(pc)) completeness += 1;
131:   }
132: 
133:   const presentRequired = [...uniquePcs].filter((pc) => requiredPcs.has(pc)).length;
134:   const doublings = allNotes.length - uniquePcs.size;
135:   const omissions = requiredPcs.size - presentRequired;
136: 
137:   // Distance basse → main droite : information soft, pas un hard constraint.
138:   // Mesurée ici en demi-tons entre la note globalement la plus grave (toutes
139:   // mains confondues) et la note la plus grave de la main droite. Quand la
140:   // main droite est vide, la mesure vaut 0.
141:   const lowestAll = allNotes.length > 0 ? Math.min(...allNotes) : 0;
142:   const lowestRh = rh.notes.length > 0 ? Math.min(...rh.notes) : lowestAll;
143:   const bassToRightGap = rh.notes.length > 0 ? lowestRh - lowestAll : 0;
144: 
145:   return Object.freeze({
146:     lhNotesInSoft,
147:     rhNotesInSoft,
148:     totalNotesInSoft: lhNotesInSoft + rhNotesInSoft,
149:     lhSpan: span(lh.notes),
150:     rhSpan: span(rh.notes),
151:     totalSpan: span(allNotes),
152:     bassDistanceFromIdealLowReserved: 0,
153:     voiceLeadingCostReserved: 0,
154:     bassToRightGap,
155:     completeness,
156:     doublings,
157:     omissions,
158:   });
159: }

(End of file - total 159 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/candidate-generator.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/candidate-generator.js</path>
<type>file</type>
<content>
1: // Générateur de candidates close-v1 pour le Two-Hand Piano Voicing Engine.
2: // Stateless, pur, sans UI. Produit des candidates immuables validées.
3: 
4: import { createHandVoicing, createVoicingCandidate } from './data-model.js';
5: import {
6:   LH_HARD_RANGE,
7:   LH_SOFT_RANGE,
8:   RH_HARD_RANGE,
9:   RH_SOFT_RANGE,
10:   RH_MAX_SPAN,
11:   midiInRange,
12:   span,
13: } from './hand-ranges.js';
14: import { checkCandidateHardConstraints, measureSoftConstraintFeatures } from './constraints.js';
15: 
16: /**
17:  * @typedef {import('./chord-input.js').NormalizedVoicingInput} VoicingInput
18:  * @typedef {import('./data-model.js').VoicingCandidate} VoicingCandidate
19:  */
20: 
21: export const CLOSE_GENERATOR_ID = 'close-v1';
22: 
23: /** Budget maximal de candidates RH inspectés par accord. */
24: export const CLOSE_CANDIDATE_BUDGET = 200;
25: 
26: /** Centre de registre de référence pour la main droite (C4). */
27: export const RH_TARGET_CENTER = 60;
28: 
29: /**
30:  * Génère toutes les instances MIDI d'une pitch class dans une plage.
31:  * @param {number} pc
32:  * @param {number} minMidi
33:  * @param {number} maxMidi
34:  * @returns {number[]}
35:  */
36: export function midiInstancesInRange(pc, minMidi, maxMidi) {
37:   const notes = [];
38:   let first = minMidi + ((pc - (minMidi % 12) + 12) % 12);
39:   if (first < minMidi) first += 12;
40:   for (let m = first; m <= maxMidi; m += 12) {
41:     notes.push(m);
42:   }
43:   return notes;
44: }
45: 
46: /**
47:  * Construit la main gauche Close-v1 : exactement une note.
48:  * - Si bassPc est défini : note la plus confortable dans LH_SOFT_RANGE,
49:  *   sinon dans LH_HARD_RANGE.
50:  * - Sinon : fondamentale dans LH_SOFT_RANGE si possible, sinon LH_HARD_RANGE.
51:  * @param {VoicingInput} input
52:  * @returns {{ notes: number[], diagnostics: string[] }}
53:  */
54: function buildLeftHand(input) {
55:   const diagnostics = [];
56:   const targetPc = input.bassPc != null ? input.bassPc : input.rootPc;
57:   let candidates = midiInstancesInRange(targetPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
58:   let source = 'LH_SOFT_RANGE';
59:   if (candidates.length === 0) {
60:     candidates = midiInstancesInRange(targetPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
61:     source = 'LH_HARD_RANGE';
62:   }
63:   if (candidates.length === 0) {
64:     diagnostics.push(`LH: no MIDI instance found for pc ${targetPc}`);
65:     return { notes: [], diagnostics };
66:   }
67:   // Préfère l'octave confortable médiane : proche du centre C3 (48).
68:   const center = source === 'LH_SOFT_RANGE' ? 42 : 41;
69:   const note = candidates.reduce((best, n) => (Math.abs(n - center) < Math.abs(best - center) ? n : best));
70:   diagnostics.push(`LH: ${note} (pc ${targetPc}, ${source})`);
71:   return { notes: [note], diagnostics };
72: }
73: 
74: /**
75:  * Génère les rotations (inversions) d'un ensemble de pitch classes.
76:  * Chaque rotation est un tableau de pitch classes ordonnées en partant d'une
77:  * note différente, avec l'ordre ascendant mod 12 préservé.
78:  * @param {number[]} pcs
79:  * @returns {number[][]}
80:  */
81: export function generateRotations(pcs) {
82:   if (!pcs || pcs.length === 0) return [];
83:   const sorted = [...pcs].sort((a, b) => a - b);
84:   const rotations = [];
85:   for (let i = 0; i < sorted.length; i++) {
86:     const rotation = [];
87:     for (let j = 0; j < sorted.length; j++) {
88:       const pc = sorted[(i + j) % sorted.length];
89:       // L'inversion de départ reste dans [0,11], les suivantes montent d'une
90:       // octave quand elles descendent par rapport à la précédente, afin de
91:       // préserver l'ordre MIDI strictement croissant.
92:       const prev = j === 0 ? -Infinity : rotation[j - 1];
93:       let shifted = pc;
94:       while (shifted <= prev) shifted += 12;
95:       rotation.push(shifted);
96:     }
97:     rotations.push(rotation);
98:   }
99:   return rotations;
100: }
101: 
102: /**
103:  * Convertit une rotation relative (pitch classes exprimées avec octaves
104:  * relatifs 0..23) en candidates MIDI concrètes dans la plage RH, en plaçant
105:  * chaque note de la rotation dans toutes les octaves compatibles.
106:  * @param {number[]} relativePcs
107:  * @param {number} minMidi
108:  * @param {number} maxMidi
109:  * @param {number} maxSpan
110:  * @returns {number[][]}
111:  */
112: function concreteRotationsFromRelative(relativePcs, minMidi, maxMidi, maxSpan) {
113:   const allInstances = relativePcs.map((rpc) => midiInstancesInRange(rpc % 12, minMidi, maxMidi));
114:   /** @type {number[][]} */
115:   const results = [];
116: 
117:   function backtrack(index, current) {
118:     if (index === relativePcs.length) {
119:       results.push([...current]);
120:       return;
121:     }
122:     for (const m of allInstances[index]) {
123:       if (current.length > 0 && m <= current[current.length - 1]) continue;
124:       current.push(m);
125:       backtrack(index + 1, current);
126:       current.pop();
127:     }
128:   }
129: 
130:   backtrack(0, []);
131:   return results.filter((notes) => span(notes) <= maxSpan);
132: }
133: 
134: /**
135:  * Génère les candidates de main droite close pour un accord donné.
136:  * Conserve toutes les inversions pertinentes (au plus n) et les place dans
137:  * toutes les octaves compatibles avec RH_HARD_RANGE, avec span ≤ RH_MAX_SPAN.
138:  * @param {VoicingInput} input
139:  * @returns {{ candidates: number[][], diagnostics: string[] }}
140:  */
141: export function generateRightHandCandidates(input) {
142:   const diagnostics = [];
143:   const pcs = input.chordTonePcs;
144:   if (pcs.length === 0) {
145:     diagnostics.push('RH: no chord tones available');
146:     return { candidates: [], diagnostics };
147:   }
148: 
149:   const rotations = generateRotations(pcs);
150:   /** @type {number[][]} */
151:   const all = [];
152:   for (const rot of rotations) {
153:     const concrete = concreteRotationsFromRelative(rot, RH_HARD_RANGE.min, RH_HARD_RANGE.max, RH_MAX_SPAN);
154:     all.push(...concrete);
155:     if (all.length > CLOSE_CANDIDATE_BUDGET) {
156:       diagnostics.push(`RH: candidate budget exceeded (${CLOSE_CANDIDATE_BUDGET}), truncating`);
157:       break;
158:     }
159:   }
160: 
161:   diagnostics.push(`RH: ${all.length} concrete candidates from ${rotations.length} rotations`);
162:   return { candidates: all.slice(0, CLOSE_CANDIDATE_BUDGET), diagnostics };
163: }
164: 
165: /**
166:  * Tuple de classement lexicographique déterministe pour une candidate.
167:  * Ordre (du plus petit au plus grand) :
168:  * 1. violation hard (0 = valide, 1 = invalide)
169:  * 2. notes RH hors soft range
170:  * 3. distance totale des notes RH à la soft range
171:  * 4. span RH
172:  * 5. distance du centre de gravité RH à RH_TARGET_CENTER
173:  * 6. note RH la plus grave
174:  * 7. ordre lexicographique des notes RH
175:  * @param {VoicingCandidate} candidate
176:  * @returns {number[]}
177:  */
178: export function rankCandidate(candidate) {
179:   const { rh } = candidate;
180:   const hard = checkCandidateHardConstraints(candidate);
181:   const rhOutOfSoft = rh.notes.filter((n) => !midiInRange(n, RH_SOFT_RANGE)).length;
182:   const rhSoftDistance = rh.notes.reduce((sum, n) => {
183:     if (n < RH_SOFT_RANGE.min) return sum + RH_SOFT_RANGE.min - n;
184:     if (n > RH_SOFT_RANGE.max) return sum + n - RH_SOFT_RANGE.max;
185:     return sum;
186:   }, 0);
187:   const rhSpan = span(rh.notes);
188:   const centroid = rh.notes.length > 0 ? rh.notes.reduce((a, b) => a + b, 0) / rh.notes.length : 0;
189:   const centerDistance = Math.abs(centroid - RH_TARGET_CENTER);
190:   const lowestRh = rh.notes.length > 0 ? rh.notes[0] : 0;
191:   return [
192:     hard.valid ? 0 : 1,
193:     rhOutOfSoft,
194:     rhSoftDistance,
195:     rhSpan,
196:     centerDistance,
197:     lowestRh,
198:     ...rh.notes,
199:   ];
200: }
201: 
202: /**
203:  * Compare deux tuples de classement lexicographiquement.
204:  * @param {number[]} a
205:  * @param {number[]} b
206:  * @returns {number}
207:  */
208: function compareRank(a, b) {
209:   const len = Math.max(a.length, b.length);
210:   for (let i = 0; i < len; i++) {
211:     const av = a[i] ?? 0;
212:     const bv = b[i] ?? 0;
213:     if (av !== bv) return av - bv;
214:   }
215:   return 0;
216: }
217: 
218: /**
219:  * Génère le voicing close-v1 pour une entrée normalisée.
220:  * @param {VoicingInput} input
221:  * @returns {{
222:  *   ok: boolean,
223:  *   input: VoicingInput,
224:  *   selectedCandidate: VoicingCandidate | null,
225:  *   candidatesConsidered: number,
226:  *   candidatesValid: number,
227:  *   diagnostics: string[],
228:  *   rejectionReasons?: string[]
229:  * }}
230:  */
231: export function generateCloseVoicing(input) {
232:   const diagnostics = [];
233:   if (!input || !input.valid) {
234:   return Object.freeze({
235:     ok: false,
236:     input,
237:     selectedCandidate: null,
238:     candidatesConsidered: 0,
239:     candidatesValid: 0,
240:     diagnostics: Object.freeze(['input is invalid or missing']),
241:     rejectionReasons: Object.freeze(['INVALID_INPUT']),
242:   });
243: }
244: 
245:   const lh = buildLeftHand(input);
246:   diagnostics.push(...lh.diagnostics);
247:   if (lh.notes.length === 0) {
248:     return Object.freeze({
249:       ok: false,
250:       input,
251:       selectedCandidate: null,
252:       candidatesConsidered: 0,
253:       candidatesValid: 0,
254:       diagnostics: Object.freeze(diagnostics),
255:       rejectionReasons: Object.freeze(['NO_VALID_LH_BASS']),
256:     });
257:   }
258: 
259:   const rh = generateRightHandCandidates(input);
260:   diagnostics.push(...rh.diagnostics);
261: 
262:   let candidatesConsidered = 0;
263:   let candidatesValid = 0;
264:   /** @type {VoicingCandidate[]} */
265:   const scored = [];
266:   const rejectionReasons = [];
267: 
268:   for (const rhNotes of rh.candidates) {
269:     candidatesConsidered++;
270:     const candidate = createVoicingCandidate(
271:       input,
272:       createHandVoicing('LH', lh.notes),
273:       createHandVoicing('RH', rhNotes),
274:       0,
275:       {
276:         generatorId: CLOSE_GENERATOR_ID,
277:         rootless: false,
278:       },
279:     );
280:     const hard = checkCandidateHardConstraints(candidate);
281:     if (hard.valid) {
282:       candidatesValid++;
283:       scored.push(candidate);
284:     } else {
285:       if (candidatesConsidered <= 5) {
286:         rejectionReasons.push(`rejected ${rhNotes.join(',')}: ${hard.errors.join('; ')}`);
287:       }
288:     }
289:   }
290: 
291:   if (scored.length === 0) {
292:     return Object.freeze({
293:       ok: false,
294:       input,
295:       selectedCandidate: null,
296:       candidatesConsidered,
297:       candidatesValid,
298:       diagnostics: Object.freeze(diagnostics),
299:       rejectionReasons: Object.freeze(['NO_VALID_CLOSE_VOICING', ...rejectionReasons]),
300:     });
301:   }
302: 
303:   scored.sort((a, b) => compareRank(rankCandidate(a), rankCandidate(b)));
304:   const selected = scored[0];
305: 
306:   // Métadonnées Phase 1 enrichies.
307:   const interHandDoubled = selected.lh.notes.filter((n) => selected.rh.notes.some((r) => r % 12 === n % 12)).map((n) => n % 12);
308:   const inversion = selected.rh.notes.length > 0 ? (selected.rh.notes[0] % 12) : 0;
309:   const enriched = createVoicingCandidate(
310:     selected.input,
311:     createHandVoicing('LH', selected.lh.notes, {
312:       ...selected.lh.metadata,
313:       source: CLOSE_GENERATOR_ID,
314:     }),
315:     createHandVoicing('RH', selected.rh.notes, {
316:       ...selected.rh.metadata,
317:       source: CLOSE_GENERATOR_ID,
318:     }),
319:     selected.score,
320:     {
321:       ...selected.metadata,
322:       generatorId: CLOSE_GENERATOR_ID,
323:       rootless: false,
324:       style: 'close',
325:       inversion,
326:       omittedPitchClasses: [],
327:       doubledPitchClasses: [],
328:       interHandDoubledPitchClasses: interHandDoubled,
329:     },
330:   );
331: 
332:   return Object.freeze({
333:     ok: true,
334:     input,
335:     selectedCandidate: enriched,
336:     candidatesConsidered,
337:     candidatesValid,
338:     diagnostics: Object.freeze(diagnostics),
339:     rejectionReasons: Object.freeze(rejectionReasons),
340:   });
341: }

(End of file - total 341 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 5.2s)

_Thinking:_

Let me continue reading the remaining key files to complete the audit.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/vocabulary.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/vocabulary.js</path>
<type>file</type>
<content>
1: // Vocabulaire officiel du Two-Hand Piano Voicing Engine V1.
2: // Ce tableau borne explicitement ce que le générateur Phase 1 doit accepter.
3: // Toute qualité hors `supportedInV1` doit être rejetée proprement par le
4: // générateur, sans fallback silencieux vers major.
5: 
6: /** @typedef {{ category: 'supportedInV1' | 'metadataOnly' | 'futurePhase' | 'unsupported', description: string }} QualityCategory */
7: 
8: /** @type {Readonly<Record<string, QualityCategory>>} */
9: export const VOICING_V1_VOCABULARY = Object.freeze({
10:   // Triades et modes de base — supportés en V1
11:   '': { category: 'supportedInV1', description: 'Major triad' },
12:   'm': { category: 'supportedInV1', description: 'Minor triad' },
13:   'dim': { category: 'supportedInV1', description: 'Diminished triad' },
14:   'aug': { category: 'supportedInV1', description: 'Augmented triad' },
15:   'sus2': { category: 'supportedInV1', description: 'Sus2 triad' },
16:   'sus4': { category: 'supportedInV1', description: 'Sus4 triad' },
17: 
18:   // Septièmes — supportées en V1
19:   '7': { category: 'supportedInV1', description: 'Dominant 7' },
20:   'maj7': { category: 'supportedInV1', description: 'Major 7' },
21:   'm7': { category: 'supportedInV1', description: 'Minor 7' },
22:   'm7b5': { category: 'supportedInV1', description: 'Half-diminished 7' },
23: 
24:   // Slash bass — traitée comme métadonnée sur n'importe quel accord V1
25:   '/': { category: 'metadataOnly', description: 'Slash bass separator; not a quality' },
26: 
27:   // Extensions et couleurs — reportées à des phases ultérieures
28:   '6': { category: 'futurePhase', description: 'Major 6' },
29:   'm6': { category: 'futurePhase', description: 'Minor 6' },
30:   'add9': { category: 'futurePhase', description: 'Major add9' },
31:   '9': { category: 'futurePhase', description: 'Dominant 9' },
32:   'm9': { category: 'futurePhase', description: 'Minor 9' },
33:   'maj9': { category: 'futurePhase', description: 'Major 9' },
34:   '11': { category: 'futurePhase', description: 'Dominant 11' },
35:   'm11': { category: 'futurePhase', description: 'Minor 11' },
36:   'maj11': { category: 'futurePhase', description: 'Major 11' },
37:   '13': { category: 'futurePhase', description: 'Dominant 13' },
38:   'm13': { category: 'futurePhase', description: 'Minor 13' },
39:   'maj13': { category: 'futurePhase', description: 'Major 13' },
40:   '7b9': { category: 'futurePhase', description: 'Dominant 7 flat 9' },
41:   '7#9': { category: 'futurePhase', description: 'Dominant 7 sharp 9' },
42:   '7b9#9': { category: 'futurePhase', description: 'Dominant 7 flat 9 sharp 9' },
43:   '7#11': { category: 'futurePhase', description: 'Dominant 7 sharp 11' },
44:   '7b13': { category: 'futurePhase', description: 'Dominant 7 flat 13' },
45:   '7#5': { category: 'futurePhase', description: 'Augmented 7' },
46:   '7b5': { category: 'futurePhase', description: 'Dominant 7 flat 5' },
47:   '7sus4': { category: 'futurePhase', description: 'Dominant 7 sus4' },
48:   '7sus2': { category: 'futurePhase', description: 'Dominant 7 sus2' },
49:   'mMaj7': { category: 'futurePhase', description: 'Minor major 7' },
50:   'maj7#5': { category: 'futurePhase', description: 'Major 7 sharp 5' },
51: 
52:   // Hors périmètre
53:   'alt': { category: 'unsupported', description: 'Altered chord — not in CHORD_DEFINITIONS' },
54:   '5': { category: 'unsupported', description: 'Power chord — not targeted by V1 voicing engine' },
55:   'quartal': { category: 'unsupported', description: 'Quartal harmony — not targeted by V1' },
56:   'quartal(add4)': { category: 'unsupported', description: 'Quartal add4 — not targeted by V1' },
57:   '6/9': { category: 'unsupported', description: 'Major 6/9 — parsed as quality "6" plus unexpected chars by current parser' },
58:   '6add11': { category: 'unsupported', description: 'Major 6 add11 — parsed as quality "6" plus unexpected chars' },
59:   'madd9': { category: 'unsupported', description: 'Minor add9 — parsed as quality "m" plus unexpected chars' },
60:   'add11': { category: 'unsupported', description: 'Major add11 — parsed as quality "add11" not present in definitions' },
61:   '13sus4': { category: 'unsupported', description: 'Dominant 13 sus4 — parsed as quality "13sus4" not present in definitions' },
62:   '13#11': { category: 'unsupported', description: 'Dominant 13 #11 — parsed as quality "13#11" not present in definitions' },
63:   '7#9b13': { category: 'unsupported', description: 'Dominant 7 #9 b13 — parsed as quality "7#9b13" not present in definitions' },
64:   '7b9b13': { category: 'unsupported', description: 'Dominant 7 b9 b13 — parsed as quality "7b9b13" not present in definitions' },
65:   'm7b9': { category: 'unsupported', description: 'Minor 7 b9 — parsed as quality "m7b9" not present in definitions' },
66: });
67: 
68: /**
69:  * Retourne true si la qualité est officiellement supportée par le générateur V1.
70:  * @param {string} quality
71:  * @returns {boolean}
72:  */
73: export function isSupportedInV1(quality) {
74:   return VOICING_V1_VOCABULARY[quality]?.category === 'supportedInV1';
75: }
76: 
77: /**
78:  * Retourne true si la qualité fait partie du vocabulaire (supportée ou future).
79:  * Les qualités non listées sont totalement inconnues.
80:  * @param {string} quality
81:  * @returns {boolean}
82:  */
83: export function isKnownQuality(quality) {
84:   return quality in VOICING_V1_VOCABULARY;
85: }
86: 
87: /**
88:  * Catégorie d'une qualité.
89:  * @param {string} quality
90:  * @returns {QualityCategory['category'] | 'unknown'}
91:  */
92: export function qualityCategory(quality) {
93:   return VOICING_V1_VOCABULARY[quality]?.category || 'unknown';
94: }

(End of file - total 94 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/chord-input.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/chord-input.js</path>
<type>file</type>
<content>
1: // Contrat d'entrée pur du voicing-engine.
2: // Reçoit un objet indépendant de toute UI ou timeline, et le normalise.
3: // Ne doit importer aucun module de src/ui/.
4: 
5: import { noteNameToPc } from '../chord-engine/intervals.js';
6: import { CHORD_DEFINITIONS } from '../chord-engine/chord-defs.js';
7: import { resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';
8: 
9: /**
10:  * Entrée pure du moteur de voicings.
11:  * Les pitch classes et les numéros MIDI ne dépendent jamais d'une préférence
12:  * de notation ; la notation n'a d'effet que sur l'affichage des noms de notes.
13:  * @typedef {{
14:  *   rootPc: number,
15:  *   quality: string,
16:  *   bassPc: number | null
17:  * }} VoicingChordInput
18:  */
19: 
20: /**
21:  * Résultat de la normalisation.
22:  * @typedef {{
23:  *   rootPc: number,
24:  *   quality: string,
25:  *   bassPc: number | null,
26:  *   chordTonePcs: number[],
27:  *   bassIsInChord: boolean,
28:  *   valid: boolean,
29:  *   errors: string[]
30:  * }} NormalizedVoicingInput
31:  */
32: 
33: const VALID_QUALITIES = new Set(CHORD_DEFINITIONS.map((d) => d.symbol).concat(''));
34: 
35: /**
36:  * Vérifie qu'une pitch class est un entier dans [0, 11].
37:  * @param {any} pc
38:  * @returns {boolean}
39:  */
40: function isValidPitchClass(pc) {
41:   return Number.isInteger(pc) && pc >= 0 && pc <= 11;
42: }
43: 
44: /**
45:  * Vérifie qu'une valeur est un numéro MIDI entier valide.
46:  * @param {any} midi
47:  * @returns {boolean}
48:  */
49: function isValidMidiNumber(midi) {
50:   return Number.isInteger(midi);
51: }
52: 
53: /**
54:  * Normalise une entrée de voicing.
55:  * Retourne un objet immuable avec les pitch classes de l'accord et un flag valid.
56:  * @param {VoicingChordInput} input
57:  * @returns {NormalizedVoicingInput}
58:  */
59: export function normalizeVoicingInput(input) {
60:   const errors = [];
61: 
62:   if (!input || typeof input !== 'object') {
63:     return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze(['input must be an object']) });
64:   }
65: 
66:   const rootPc = input.rootPc;
67:   if (!isValidPitchClass(rootPc)) {
68:     errors.push(`rootPc must be an integer in 0..11, got ${rootPc}`);
69:   }
70: 
71:   const quality = input.quality;
72:   if (typeof quality !== 'string' || !VALID_QUALITIES.has(quality)) {
73:     errors.push(`quality must be one of ${[...VALID_QUALITIES].join(', ')}, got ${quality}`);
74:   }
75: 
76:   const bassPc = input.bassPc == null ? null : input.bassPc;
77:   if (bassPc != null && !isValidPitchClass(bassPc)) {
78:     errors.push(`bassPc must be null or an integer in 0..11, got ${bassPc}`);
79:   }
80: 
81:   if (errors.length > 0) {
82:     return Object.freeze({
83:       rootPc: isValidPitchClass(rootPc) ? rootPc : 0,
84:       quality: typeof quality === 'string' ? quality : '',
85:       bassPc: isValidPitchClass(bassPc) ? bassPc : null,
86:       chordTonePcs: Object.freeze([]),
87:       bassIsInChord: false,
88:       valid: false,
89:       errors: Object.freeze(errors),
90:     });
91:   }
92: 
93:   const def = resolveCanonicalChordDefinition(quality);
94:   const intervals = def ? def.intervals : [0, 4, 7]; // '' = major triade si pas trouvé dans chord-defs
95: 
96:   const chordTonePcs = Object.freeze([...new Set(intervals.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b));
97:   const bassIsInChord = bassPc != null && chordTonePcs.includes(bassPc);
98: 
99:   return Object.freeze({
100:     rootPc,
101:     quality,
102:     bassPc,
103:     chordTonePcs,
104:     bassIsInChord,
105:     valid: true,
106:     errors: Object.freeze([]),
107:   });
108: }
109: 
110: /**
111:  * Convertit un symbole d'accord en entrée de voicing.
112:  * Cet adaptateur reste pur : il ne reçoit pas de segment UI.
113:  * @param {string} chordSymbol
114:  * @returns {NormalizedVoicingInput}
115:  */
116: export function normalizeVoicingInputFromSymbol(chordSymbol) {
117:   if (!chordSymbol || chordSymbol === 'N') {
118:     return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze(['no chord or N chord']) });
119:   }
120: 
121:   const slashIdx = chordSymbol.indexOf('/');
122:   const chordPart = slashIdx >= 0 ? chordSymbol.slice(0, slashIdx) : chordSymbol;
123:   const bassStr = slashIdx >= 0 ? chordSymbol.slice(slashIdx + 1).trim() : null;
124: 
125:   const rootMatch = chordPart.match(/^([A-G][#b]?)(.*)/);
126:   if (!rootMatch) {
127:     return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized chord symbol ${chordSymbol}`]) });
128:   }
129: 
130:   const rootPc = noteNameToPc(rootMatch[1]);
131:   const quality = rootMatch[2] || '';
132:   if (rootPc == null) {
133:     return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized root note in ${chordSymbol}`]) });
134:   }
135:   if (bassStr != null && noteNameToPc(bassStr) == null) {
136:     return Object.freeze({ rootPc: 0, quality: '', bassPc: null, chordTonePcs: Object.freeze([]), bassIsInChord: false, valid: false, errors: Object.freeze([`unrecognized bass note in ${chordSymbol}`]) });
137:   }
138:   const bassPc = bassStr ? noteNameToPc(bassStr) : null;
139: 
140:   return normalizeVoicingInput({ rootPc, quality, bassPc });
141: }

(End of file - total 141 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/hand-ranges.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/hand-ranges.js</path>
<type>file</type>
<content>
1: // Plages et contraintes physiques des mains.
2: // Valeurs en numéros MIDI. Pure data, pas de logique UI.
3: 
4: /** @typedef {{ min: number, max: number }} HandRange */
5: 
6: /** @type {HandRange} */
7: export const LH_HARD_RANGE = Object.freeze({ min: 28, max: 55 });
8: 
9: /** @type {HandRange} */
10: export const LH_SOFT_RANGE = Object.freeze({ min: 36, max: 48 });
11: 
12: /** @type {HandRange} */
13: export const RH_HARD_RANGE = Object.freeze({ min: 48, max: 84 });
14: 
15: /** @type {HandRange} */
16: export const RH_SOFT_RANGE = Object.freeze({ min: 55, max: 72 });
17: 
18: /** Max span (semitones) autorisé pour une main. */
19: export const LH_MAX_SPAN = 12;
20: export const RH_MAX_SPAN = 16;
21: 
22: /**
23:  * Vérifie qu'une note MIDI est dans une plage stricte.
24:  * @param {number} midi
25:  * @param {HandRange} range
26:  * @returns {boolean}
27:  */
28: export function midiInRange(midi, range) {
29:   return Number.isInteger(midi) && midi >= range.min && midi <= range.max;
30: }
31: 
32: /**
33:  * Calcule l'étendue (max - min) d'un ensemble de notes MIDI.
34:  * Retourne 0 pour 0 ou 1 note.
35:  * @param {number[]} midis
36:  * @returns {number}
37:  */
38: export function span(midis) {
39:   if (!midis || midis.length < 2) return 0;
40:   return Math.max(...midis) - Math.min(...midis);
41: }
42: 
43: /**
44:  * Vérifie qu'une valeur est un numéro MIDI entier.
45:  * Rejette les non-nombres, les valeurs non entières, NaN, Infinity et les
46:  * chaînes numériques (par typage strict via Number.isInteger).
47:  * @param {any} value
48:  * @returns {boolean}
49:  */
50: export function isIntegerMidi(value) {
51:   return Number.isInteger(value);
52: }

(End of file - total 52 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/close.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/close.js</path>
<type>file</type>
<content>
1: // Style Close-v1 du Two-Hand Piano Voicing Engine.
2: // Re-exporte le générateur close et ses utilitaires pour permettre une
3: // organisation modulaire des styles futurs.
4: 
5: export {
6:   CLOSE_GENERATOR_ID,
7:   CLOSE_CANDIDATE_BUDGET,
8:   RH_TARGET_CENTER,
9:   midiInstancesInRange,
10:   generateRotations,
11:   generateRightHandCandidates,
12:   rankCandidate,
13:   generateCloseVoicing,
14: } from '../candidate-generator.js';
15: 
16: export { generateCloseVoicing as default } from '../candidate-generator.js';

(End of file - total 16 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/simple.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/styles/simple.js</path>
<type>file</type>
<content>
1: // Style Simple du Two-Hand Piano Voicing Engine V1.
2: // Stateless, pur, sans UI. Conçu pour l'apprentissage : pas de Jazz, Gospel,
3: // voice leading, ni rootless. Dérive tous les rôles depuis rootPc et n'utilise
4: // jamais la position dans chordTonePcs trié.
5: 
6: import { createHandVoicing, createVoicingCandidate } from '../data-model.js';
7: import {
8:   LH_HARD_RANGE,
9:   LH_SOFT_RANGE,
10:   RH_HARD_RANGE,
11:   RH_SOFT_RANGE,
12:   midiInRange,
13:   span,
14: } from '../hand-ranges.js';
15: import { checkCandidateHardConstraints, measureSoftConstraintFeatures } from '../constraints.js';
16: import {
17:   generateRightHandCandidates,
18:   rankCandidate,
19:   midiInstancesInRange,
20: } from '../candidate-generator.js';
21: 
22: /**
23:  * @typedef {import('../chord-input.js').NormalizedVoicingInput} VoicingInput
24:  * @typedef {import('../data-model.js').VoicingCandidate} VoicingCandidate
25:  */
26: 
27: export const SIMPLE_GENERATOR_ID = 'simple-v1';
28: 
29: /** Budget maximal de candidates RH inspectés par accord. */
30: export const SIMPLE_CANDIDATE_BUDGET = 200;
31: 
32: /** Table canonique V1 des intervalles relatifs à rootPc. */
33: export const SIMPLE_INTERVALS = Object.freeze({
34:   '': [0, 4, 7],       // major
35:   'm': [0, 3, 7],      // minor
36:   'dim': [0, 3, 6],    // diminished
37:   'aug': [0, 4, 8],    // augmented
38:   'sus2': [0, 2, 7],   // sus2
39:   'sus4': [0, 5, 7],   // sus4
40:   '7': [0, 4, 7, 10],  // dominant 7
41:   'maj7': [0, 4, 7, 11], // major 7
42:   'm7': [0, 3, 7, 10], // minor 7
43:   'm7b5': [0, 3, 6, 10], // half-diminished 7
44: });
45: 
46: /**
47:  * Retourne les intervalles canoniques d'une qualité V1, ou null.
48:  * @param {string} quality
49:  * @returns {number[] | null}
50:  */
51: export function getCanonicalIntervals(quality) {
52:   return SIMPLE_INTERVALS[quality] || null;
53: }
54: 
55: /**
56:  * Retourne les pitch classes canoniques d'un accord, dérivées depuis rootPc.
57:  * Le résultat est trié numériquement ; l'appelant ne doit pas interpréter
58:  * l'ordre comme un ordre de rôles.
59:  * @param {number} rootPc
60:  * @param {string} quality
61:  * @returns {number[] | null}
62:  */
63: export function getCanonicalPitchClasses(rootPc, quality) {
64:   const intervals = getCanonicalIntervals(quality);
65:   if (!intervals) return null;
66:   return [...new Set(intervals.map((i) => (rootPc + i) % 12))].sort((a, b) => a - b);
67: }
68: 
69: /**
70:  * Retourne la pitch class d'un rôle relatif à rootPc.
71:  * @param {number} rootPc
72:  * @param {number} interval
73:  * @returns {number}
74:  */
75: export function getRolePc(rootPc, interval) {
76:   return (rootPc + interval) % 12;
77: }
78: 
79: /**
80:  * Indique si la qualité est une triade.
81:  * @param {string} quality
82:  * @returns {boolean}
83:  */
84: export function isTriad(quality) {
85:   const intervals = getCanonicalIntervals(quality);
86:   return !!intervals && intervals.length === 3;
87: }
88: 
89: /**
90:  * Indique si la qualité est un accord de septième.
91:  * @param {string} quality
92:  * @returns {boolean}
93:  */
94: export function isSeventh(quality) {
95:   const intervals = getCanonicalIntervals(quality);
96:   return !!intervals && intervals.length === 4;
97: }
98: 
99: /**
100:  * Sélectionne le sous-ensemble de pitch classes pour la main droite Simple.
101:  * Aucune utilisation de l'index dans chordTonePcs : les rôles sont calculés
102:  * depuis rootPc.
103:  *
104:  * @param {number} rootPc
105:  * @param {string} quality
106:  * @param {boolean} bassIsRoot
107:  * @returns {number[] | null}
108:  */
109: export function getSimpleRightHandPitchClasses(rootPc, quality, bassIsRoot) {
110:   const intervals = getCanonicalIntervals(quality);
111:   if (!intervals) return null;
112: 
113:   if (isTriad(quality)) {
114:     // Triades : toutes les pitch classes canoniques en RH.
115:     return intervals.map((i) => (rootPc + i) % 12);
116:   }
117: 
118:   if (isSeventh(quality)) {
119:     if (quality === 'm7b5') {
120:       if (bassIsRoot) {
121:         // Fondamentale en LH : RH = b3, b5, b7 (intervalles 3, 6, 10).
122:         return [3, 6, 10].map((i) => (rootPc + i) % 12);
123:       }
124:       // Basse slash non fondamentale : accord complet en RH.
125:       return intervals.map((i) => (rootPc + i) % 12);
126:     }
127: 
128:     // 7, maj7, m7 : quinte omise ; on garde root, tierce, septième.
129:     // Les intervalles canoniques sont [0, 3|4, 7, 10|11].
130:     const root = 0;
131:     const third = intervals[1];
132:     const seventh = intervals[3];
133:     return [root, third, seventh].map((i) => (rootPc + i) % 12);
134:   }
135: 
136:   return null;
137: }
138: 
139: /**
140:  * Choix médian d'une note dans une liste d'instances MIDI triées.
141:  * @param {number[]} instances
142:  * @param {number} center
143:  * @returns {number | null}
144:  */
145: function pickMedianNote(instances, center) {
146:   if (!instances || instances.length === 0) return null;
147:   return instances.reduce((best, n) => (Math.abs(n - center) < Math.abs(best - center) ? n : best));
148: }
149: 
150: /**
151:  * Construit la main gauche Simple.
152:  *
153:  * - Triades avec basse fondamentale : fondamentale + octave si l'octave tient
154:  *   dans LH_HARD_RANGE, sinon fondamentale seule.
155:  * - Basse slash non fondamentale : basse seule.
156:  * - Septièmes : une seule note (fondamentale ou basse slash).
157:  *
158:  * @param {VoicingInput} input
159:  * @returns {{ notes: number[], diagnostics: string[] }}
160:  */
161: function buildSimpleLeftHand(input) {
162:   const diagnostics = [];
163:   const playedBassPc = input.bassPc ?? input.rootPc;
164:   const bassIsRoot = input.bassPc == null || input.bassPc === input.rootPc;
165: 
166:   // Fondamentale/basse dans la soft range si possible, sinon hard range.
167:   let instances = midiInstancesInRange(playedBassPc, LH_SOFT_RANGE.min, LH_SOFT_RANGE.max);
168:   let source = 'LH_SOFT_RANGE';
169:   if (instances.length === 0) {
170:     instances = midiInstancesInRange(playedBassPc, LH_HARD_RANGE.min, LH_HARD_RANGE.max);
171:     source = 'LH_HARD_RANGE';
172:   }
173:   if (instances.length === 0) {
174:     diagnostics.push(`LH: no MIDI instance found for pc ${playedBassPc}`);
175:     return { notes: [], diagnostics };
176:   }
177: 
178:   const bassNote = pickMedianNote(instances, source === 'LH_SOFT_RANGE' ? 42 : 41);
179: 
180:   // Doublure d'octave réservée aux triades avec fondamentale en basse.
181:   if (isTriad(input.quality) && bassIsRoot) {
182:     const octave = bassNote + 12;
183:     if (midiInRange(octave, LH_HARD_RANGE)) {
184:       diagnostics.push(`LH: ${bassNote},${octave} (pc ${playedBassPc}, ${source}, octave doubled)`);
185:       return { notes: [bassNote, octave], diagnostics };
186:     }
187:     diagnostics.push(`LH: ${bassNote} (pc ${playedBassPc}, ${source}, octave out of range)`);
188:     return { notes: [bassNote], diagnostics };
189:   }
190: 
191:   diagnostics.push(`LH: ${bassNote} (pc ${playedBassPc}, ${source})`);
192:   return { notes: [bassNote], diagnostics };
193: }
194: 
195: /**
196:  * Valide que toutes les pitch classes sélectionnées pour la RH appartiennent
197:  * à l'ensemble canonique de l'accord.
198:  * @param {number} rootPc
199:  * @param {string} quality
200:  * @param {number[]} selectedRhPcs
201:  * @returns {{ ok: boolean, errors: string[] }}
202:  */
203: function validateSelectedPitchClasses(rootPc, quality, selectedRhPcs) {
204:   const canonical = new Set(getCanonicalPitchClasses(rootPc, quality));
205:   const errors = [];
206:   for (const pc of selectedRhPcs) {
207:     if (!canonical.has(pc)) {
208:       errors.push(`RH pitch class ${pc} not in canonical set for ${quality}`);
209:     }
210:   }
211:   return { ok: errors.length === 0, errors };
212: }
213: 
214: /**
215:  * Calcule omittedPitchClasses par différence d'ensembles concrets.
216:  * @param {number[]} canonicalPcs
217:  * @param {number[]} lhNotes
218:  * @param {number[]} rhNotes
219:  * @returns {number[]}
220:  */
221: export function computeOmittedPitchClasses(canonicalPcs, lhNotes, rhNotes) {
222:   const presentPcs = new Set([...lhNotes, ...rhNotes].map((n) => n % 12));
223:   return canonicalPcs.filter((pc) => !presentPcs.has(pc));
224: }
225: 
226: /**
227:  * Calcule doubledPitchClasses depuis les notes MIDI réelles.
228:  * @param {number[]} lhNotes
229:  * @param {number[]} rhNotes
230:  * @returns {number[]}
231:  */
232: export function computeDoubledPitchClasses(lhNotes, rhNotes) {
233:   const pcCounts = new Map();
234:   for (const n of [...lhNotes, ...rhNotes]) {
235:     const pc = n % 12;
236:     pcCounts.set(pc, (pcCounts.get(pc) || 0) + 1);
237:   }
238:   return [...pcCounts.entries()]
239:     .filter(([, count]) => count > 1)
240:     .map(([pc]) => pc)
241:     .sort((a, b) => a - b);
242: }
243: 
244: /**
245:  * Compare deux tuples de classement lexicographiquement (même contrat que Close).
246:  * @param {number[]} a
247:  * @param {number[]} b
248:  * @returns {number}
249:  */
250: function compareRank(a, b) {
251:   const len = Math.max(a.length, b.length);
252:   for (let i = 0; i < len; i++) {
253:     const av = a[i] ?? 0;
254:     const bv = b[i] ?? 0;
255:     if (av !== bv) return av - bv;
256:   }
257:   return 0;
258: }
259: 
260: /**
261:  * Génère le voicing Simple-v1 pour une entrée normalisée.
262:  *
263:  * @param {VoicingInput} input
264:  * @returns {{
265:  *   ok: boolean,
266:  *   input: VoicingInput,
267:  *   selectedCandidate: VoicingCandidate | null,
268:  *   candidatesConsidered: number,
269:  *   candidatesValid: number,
270:  *   diagnostics: string[],
271:  *   rejectionReasons?: string[]
272:  * }}
273:  */
274: export function generateSimpleVoicing(input) {
275:   const diagnostics = [];
276: 
277:   if (!input || !input.valid) {
278:     return Object.freeze({
279:       ok: false,
280:       input,
281:       selectedCandidate: null,
282:       candidatesConsidered: 0,
283:       candidatesValid: 0,
284:       diagnostics: Object.freeze(['input is invalid or missing']),
285:       rejectionReasons: Object.freeze(['INVALID_INPUT']),
286:     });
287:   }
288: 
289:   const playedBassPc = input.bassPc ?? input.rootPc;
290:   const bassIsRoot = input.bassPc == null || input.bassPc === input.rootPc;
291: 
292:   // Main gauche.
293:   const lh = buildSimpleLeftHand(input);
294:   diagnostics.push(...lh.diagnostics);
295:   if (lh.notes.length === 0) {
296:     return Object.freeze({
297:       ok: false,
298:       input,
299:       selectedCandidate: null,
300:       candidatesConsidered: 0,
301:       candidatesValid: 0,
302:       diagnostics: Object.freeze(diagnostics),
303:       rejectionReasons: Object.freeze(['NO_VALID_LH_BASS']),
304:     });
305:   }
306: 
307:   // Sous-ensemble RH concret de pitch classes, sans index harmonique.
308:   const selectedRhPcs = getSimpleRightHandPitchClasses(input.rootPc, input.quality, bassIsRoot);
309:   if (selectedRhPcs == null) {
310:     // Ne devrait jamais arriver car la qualité est validée en amont.
311:     return Object.freeze({
312:       ok: false,
313:       input,
314:       selectedCandidate: null,
315:       candidatesConsidered: 0,
316:       candidatesValid: 0,
317:       diagnostics: Object.freeze([`unknown quality: '${input.quality}'`]),
318:       rejectionReasons: Object.freeze(['UNSUPPORTED_QUALITY']),
319:     });
320:   }
321: 
322:   const validation = validateSelectedPitchClasses(input.rootPc, input.quality, selectedRhPcs);
323:   if (!validation.ok) {
324:     return Object.freeze({
325:       ok: false,
326:       input,
327:       selectedCandidate: null,
328:       candidatesConsidered: 0,
329:       candidatesValid: 0,
330:       diagnostics: Object.freeze(validation.errors),
331:       rejectionReasons: Object.freeze(['INVALID_SIMPLE_VOICING_CONFIGURATION']),
332:     });
333:   }
334: 
335:   // On génère les candidates RH à partir du sous-ensemble sélectionné,
336:   // sans muter l'entrée originale.
337:   const derivedInput = Object.freeze({
338:     ...input,
339:     chordTonePcs: Object.freeze([...selectedRhPcs]),
340:   });
341: 
342:   const rhGen = generateRightHandCandidates(derivedInput);
343:   diagnostics.push(...rhGen.diagnostics);
344: 
345:   // Contrôle du budget Simple (le générateur RH respecte déjà le budget Close,
346:   // mais on tronque défensivement au budget Simple).
347:   const rhCandidates = rhGen.candidates.slice(0, SIMPLE_CANDIDATE_BUDGET);
348: 
349:   let candidatesConsidered = 0;
350:   let candidatesValid = 0;
351:   /** @type {VoicingCandidate[]} */
352:   const scored = [];
353:   const rejectionReasons = [];
354: 
355:   for (const rhNotes of rhCandidates) {
356:     candidatesConsidered++;
357:     const candidate = createVoicingCandidate(
358:       input,
359:       createHandVoicing('LH', lh.notes),
360:       createHandVoicing('RH', rhNotes),
361:       0,
362:       {
363:         generatorId: SIMPLE_GENERATOR_ID,
364:         rootless: false,
365:         style: 'simple',
366:       },
367:     );
368: 
369:     // Ajoute les features soft pour le classement (même contrat que Close).
370:     const features = measureSoftConstraintFeatures(candidate);
371:     const featured = createVoicingCandidate(
372:       candidate.input,
373:       candidate.lh,
374:       candidate.rh,
375:       candidate.score,
376:       {
377:         ...candidate.metadata,
378:         features,
379:       },
380:     );
381: 
382:     const hard = checkCandidateHardConstraints(featured);
383:     if (hard.valid) {
384:       candidatesValid++;
385:       scored.push(featured);
386:     } else if (candidatesConsidered <= 5) {
387:       rejectionReasons.push(`rejected ${rhNotes.join(',')}: ${hard.errors.join('; ')}`);
388:     }
389:   }
390: 
391:   if (scored.length === 0) {
392:     return Object.freeze({
393:       ok: false,
394:       input,
395:       selectedCandidate: null,
396:       candidatesConsidered,
397:       candidatesValid,
398:       diagnostics: Object.freeze(diagnostics),
399:       rejectionReasons: Object.freeze(['NO_VALID_SIMPLE_VOICING', ...rejectionReasons]),
400:     });
401:   }
402: 
403:   scored.sort((a, b) => compareRank(rankCandidate(a), rankCandidate(b)));
404:   const selected = scored[0];
405: 
406:   // Métadonnées calculées depuis le résultat réel.
407:   const canonicalPcs = getCanonicalPitchClasses(input.rootPc, input.quality) || [];
408:   const omittedPitchClasses = Object.freeze(
409:     computeOmittedPitchClasses(
410:       canonicalPcs,
411:       selected.lh.notes,
412:       selected.rh.notes,
413:     ),
414:   );
415:   const doubledPitchClasses = Object.freeze(
416:     computeDoubledPitchClasses(
417:       selected.lh.notes,
418:       selected.rh.notes,
419:     ),
420:   );
421:   const interHandDoubled = Object.freeze(
422:     selected.lh.notes
423:       .filter((n) => selected.rh.notes.some((r) => r % 12 === n % 12))
424:       .map((n) => n % 12)
425:       .sort((a, b) => a - b),
426:   );
427:   const inversion = selected.rh.notes.length > 0 ? (selected.rh.notes[0] % 12) : 0;
428: 
429:   const enriched = createVoicingCandidate(
430:     selected.input,
431:     createHandVoicing('LH', selected.lh.notes, {
432:       ...selected.lh.metadata,
433:       source: SIMPLE_GENERATOR_ID,
434:     }),
435:     createHandVoicing('RH', selected.rh.notes, {
436:       ...selected.rh.metadata,
437:       source: SIMPLE_GENERATOR_ID,
438:     }),
439:     selected.score,
440:     {
441:       ...selected.metadata,
442:       generatorId: SIMPLE_GENERATOR_ID,
443:       rootless: false,
444:       style: 'simple',
445:       inversion,
446:       omittedPitchClasses,
447:       doubledPitchClasses,
448:       interHandDoubledPitchClasses: interHandDoubled,
449:     },
450:   );
451: 
452:   return Object.freeze({
453:     ok: true,
454:     input,
455:     selectedCandidate: enriched,
456:     candidatesConsidered,
457:     candidatesValid,
458:     diagnostics: Object.freeze(diagnostics),
459:     rejectionReasons: Object.freeze(rejectionReasons),
460:   });
461: }
462: 
463: export { generateSimpleVoicing as default };

(End of file - total 463 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/reharmonizer.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/reharmonizer.js</path>
<type>file</type>
<content>
1: import { midiToPc } from '../chord-engine/intervals.js';
2: 
3: // [OpenCode] — 2026-07-04 — Suggestions de réharmonisation par style, accord par accord.
4: // Chaque suggestion est un objet { name, notes: number[], style } avec un tableau MIDI jouable.
5: 
6: const STYLE_LABELS = {
7:   worship: 'Worship',
8:   gospel: 'Gospel',
9:   jazz: 'Jazz',
10:   neoSoul: 'Neo Soul',
11: };
12: 
13: const STYLE_TRANSFORMERS = {
14:   worship: transformWorship,
15:   gospel: transformGospel,
16:   jazz: transformJazz,
17:   neoSoul: transformNeoSoul,
18: };
19: 
20: export function getStyleLabels() {
21:   return STYLE_LABELS;
22: }
23: 
24: export function suggestForChord(chord, style = 'jazz') {
25:   const transformer = STYLE_TRANSFORMERS[style] || transformJazz;
26:   return transformer(chord);
27: }
28: 
29: // ────────────────────────────── Utilitaires ──────────────────────────────
30: 
31: function rootPc(chord) {
32:   return typeof chord.rootPc === 'number' ? chord.rootPc : midiToPc(baseNotes(chord)[0]);
33: }
34: 
35: function baseNotes(chord) {
36:   if (!chord) return [];
37:   if (Array.isArray(chord.notes) && chord.notes.length > 0) {
38:     return chord.notes.map((n) => (typeof n === 'number' ? n : midiToPc(n) + 60));
39:   }
40:   return [];
41: }
42: 
43: function isMinorSymbol(symbol) {
44:   if (!symbol) return false;
45:   // Match "m", "m7...", "min", "mi" as a distinct qualifier, or "-" (minus chord shorthand)
46:   return /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
47: }
48: 
49: function isDominantSymbol(symbol) {
50:   if (!symbol || isMinorSymbol(symbol)) return false;
51:   return /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
52: }
53: 
54: function pickInversion(notes, bassPc) {
55:   if (bassPc == null) return notes;
56:   const bassMidi = notes.find((n) => midiToPc(n) === bassPc) ?? notes[0];
57:   const result = [bassMidi];
58:   for (const note of notes) {
59:     if (note === bassMidi) continue;
60:     let pos = note;
61:     while (pos <= bassMidi) pos += 12;
62:     result.push(pos);
63:   }
64:   return result.sort((a, b) => a - b);
65: }
66: 
67: function voicing(root, intervals, options = {}) {
68:   const { bassPc = null, octave = 4, spread = false } = options;
69:   const base = (octave + 1) * 12 + root;
70:   const notes = intervals.map((i, idx) => {
71:     if (spread && idx === 1 && i > 7) return base + i - 12;
72:     if (spread && idx === 3 && i > 14) return base + i - 12;
73:     return base + i;
74:   });
75:   const sorted = [...new Set(notes)].sort((a, b) => a - b);
76:   if (bassPc != null && bassPc !== root) {
77:     return pickInversion(sorted, bassPc);
78:   }
79:   return sorted;
80: }
81: 
82: function pcName(pc, latin = false) {
83:   const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
84:   const LATIN_NAMES = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
85:   const names = latin ? LATIN_NAMES : NOTE_NAMES;
86:   return names[(pc + 12) % 12];
87: }
88: 
89: function name(root, symbol, bassPc = null, latin = false) {
90:   const rootName = pcName(root, latin);
91:   const bassName = bassPc != null && bassPc !== root ? `/${pcName(bassPc, latin)}` : '';
92:   return `${rootName}${symbol}${bassName}`;
93: }
94: 
95: function hash(str) {
96:   let h = 0;
97:   for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
98:   return h;
99: }
100: 
101: function seededChoice(seed, items) {
102:   return items[Math.abs(hash(String(seed))) % items.length];
103: }
104: 
105: function chordSeed(chord) {
106:   const root = rootPc(chord);
107:   const sym = chord.symbol || '';
108:   const time = Math.floor((chord.time || 0) * 100);
109:   return `${root}-${sym}-${time}`;
110: }
111: 
112: // ────────────────────────────── Worship ──────────────────────────────
113: 
114: function transformWorship(chord) {
115:   const r = rootPc(chord);
116:   const sym = chord.symbol || '';
117:   const minor = isMinorSymbol(sym);
118:   const seed = chordSeed(chord);
119: 
120:   const options = minor
121:     ? [
122:         { symbol: 'm(add9)', intervals: [0, 3, 7, 14] },
123:         { symbol: 'm7', intervals: [0, 3, 7, 10] },
124:         { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
125:         { symbol: 'm(add4)', intervals: [0, 3, 5, 7] },
126:         { symbol: 'sus2', intervals: [0, 2, 7, 12] },
127:       ]
128:     : [
129:         { symbol: '', intervals: [0, 4, 7, 12] },
130:         { symbol: 'add9', intervals: [0, 4, 7, 14] },
131:         { symbol: 'sus2', intervals: [0, 2, 7, 12] },
132:         { symbol: 'sus4', intervals: [0, 5, 7, 12] },
133:         { symbol: 'maj7', intervals: [0, 4, 7, 11] },
134:         { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
135:       ];
136: 
137:   const choice = seededChoice(seed, options);
138:   return {
139:     name: name(r, choice.symbol),
140:     notes: voicing(r, choice.intervals, { spread: true }),
141:     style: 'worship',
142:   };
143: }
144: 
145: // ────────────────────────────── Gospel ──────────────────────────────
146: 
147: function transformGospel(chord) {
148:   const r = rootPc(chord);
149:   const sym = chord.symbol || '';
150:   const seed = chordSeed(chord);
151:   const minor = isMinorSymbol(sym);
152:   const dominant = isDominantSymbol(sym);
153: 
154:   if (dominant || (!minor && /[0-9]/.test(sym))) {
155:     const options = [
156:       { symbol: '9', intervals: [0, 4, 7, 10, 14] },
157:       { symbol: '13', intervals: [0, 4, 7, 10, 14, 21] },
158:       { symbol: '7(#9)', intervals: [0, 4, 7, 10, 15] },
159:       { symbol: '7(b9)', intervals: [0, 4, 7, 10, 13] },
160:     ];
161:     const choice = seededChoice(seed, options);
162:     return {
163:       name: name(r, choice.symbol),
164:       notes: voicing(r, choice.intervals),
165:       style: 'gospel',
166:     };
167:   }
168: 
169:   if (!minor && Math.abs(hash(seed)) % 4 === 0) {
170:     const subRoot = (r + 6) % 12;
171:     return {
172:       name: name(subRoot, '7b9', r),
173:       notes: voicing(subRoot, [0, 4, 7, 10, 13], { bassPc: r }),
174:       style: 'gospel',
175:     };
176:   }
177: 
178:   if (minor) {
179:     const options = [
180:       { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
181:       { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
182:       { symbol: 'm7(b5)', intervals: [0, 3, 6, 10] },
183:     ];
184:     const choice = seededChoice(seed, options);
185:     return {
186:       name: name(r, choice.symbol),
187:       notes: voicing(r, choice.intervals),
188:       style: 'gospel',
189:     };
190:   }
191: 
192:   const options = [
193:     { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
194:     { symbol: '6/9', intervals: [0, 4, 7, 9, 14] },
195:     { symbol: '13sus', intervals: [0, 5, 7, 10, 14, 21] },
196:   ];
197:   const choice = seededChoice(seed, options);
198:   return {
199:     name: name(r, choice.symbol),
200:     notes: voicing(r, choice.intervals),
201:     style: 'gospel',
202:   };
203: }
204: 
205: // ────────────────────────────── Jazz ──────────────────────────────
206: 
207: function transformJazz(chord) {
208:   const r = rootPc(chord);
209:   const sym = chord.symbol || '';
210:   const seed = chordSeed(chord);
211:   const minor = isMinorSymbol(sym);
212:   const dominant = isDominantSymbol(sym);
213: 
214:   if (dominant) {
215:     const options = [
216:       { symbol: '7alt', intervals: [0, 4, 8, 10, 13, 15, 18] },
217:       { symbol: '13', intervals: [0, 4, 7, 10, 14, 17, 21] },
218:       { symbol: '9', intervals: [0, 4, 7, 10, 14] },
219:       { symbol: '7b9', intervals: [0, 4, 7, 10, 13] },
220:     ];
221:     const choice = seededChoice(seed, options);
222:     return {
223:       name: name(r, choice.symbol),
224:       notes: voicing(r, choice.intervals, { spread: true }),
225:       style: 'jazz',
226:     };
227:   }
228: 
229:   if (!minor && Math.abs(hash(seed)) % 3 === 0) {
230:     const subRoot = (r + 6) % 12;
231:     return {
232:       name: name(subRoot, '7b9', r),
233:       notes: voicing(subRoot, [0, 4, 8, 10, 13], { bassPc: r }),
234:       style: 'jazz',
235:     };
236:   }
237: 
238:   if (minor) {
239:     const options = [
240:       { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
241:       { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
242:       { symbol: 'm6', intervals: [0, 3, 7, 9] },
243:       { symbol: 'm7(b5)', intervals: [0, 3, 6, 10] },
244:     ];
245:     const choice = seededChoice(seed, options);
246:     return {
247:       name: name(r, choice.symbol),
248:       notes: voicing(r, choice.intervals, { spread: true }),
249:       style: 'jazz',
250:     };
251:   }
252: 
253:   const options = [
254:     { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
255:     { symbol: 'maj7(#11)', intervals: [0, 4, 7, 11, 18] },
256:     { symbol: '6', intervals: [0, 4, 7, 9] },
257:     { symbol: 'maj13', intervals: [0, 4, 7, 11, 14, 17, 21] },
258:   ];
259:   const choice = seededChoice(seed, options);
260:   return {
261:     name: name(r, choice.symbol),
262:     notes: voicing(r, choice.intervals, { spread: true }),
263:     style: 'jazz',
264:   };
265: }
266: 
267: // ────────────────────────────── Neo Soul ──────────────────────────────
268: 
269: function transformNeoSoul(chord) {
270:   const r = rootPc(chord);
271:   const sym = chord.symbol || '';
272:   const seed = chordSeed(chord);
273:   const minor = isMinorSymbol(sym);
274: 
275:   if (minor) {
276:     const options = [
277:       { symbol: 'm9', intervals: [0, 3, 7, 10, 14] },
278:       { symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17] },
279:       { symbol: 'm7(9,11)', intervals: [0, 3, 7, 10, 14, 17] },
280:       { symbol: 'm7 add11', intervals: [0, 3, 7, 10, 17] },
281:     ];
282:     const choice = seededChoice(seed, options);
283:     return {
284:       name: name(r, choice.symbol),
285:       notes: voicing(r, choice.intervals, { spread: true }),
286:       style: 'neoSoul',
287:     };
288:   }
289: 
290:   const options = [
291:     { symbol: 'maj9', intervals: [0, 4, 7, 11, 14] },
292:     { symbol: '11', intervals: [0, 4, 7, 10, 14, 17] },
293:     { symbol: '13sus', intervals: [0, 5, 7, 10, 14, 21] },
294:     { symbol: 'add9(#11)', intervals: [0, 4, 7, 14, 18] },
295:     { symbol: 'quartal', intervals: [0, 5, 10, 15, 19] },
296:   ];
297:   const choice = seededChoice(seed, options);
298:   return {
299:     name: name(r, choice.symbol),
300:     notes: voicing(r, choice.intervals, { spread: true }),
301:     style: 'neoSoul',
302:   };
303: }
304: 
305: // ────────────────────────────── Réharmonisation d'une progression complète ──────────────────────────────
306: 
307: export function suggestProgression(chords, style = 'jazz') {
308:   if (!Array.isArray(chords) || chords.length === 0) return [];
309: 
310:   return chords.map((chord) => {
311:     const suggestion = suggestForChord(chord, style);
312:     return {
313:       original: {
314:         rootPc: chord.rootPc,
315:         symbol: chord.symbol,
316:         bassPc: chord.bassPc,
317:         notes: chord.notes,
318:         time: chord.time,
319:         duration: chord.duration,
320:       },
321:       replacement: {
322:         rootPc: chord.rootPc,
323:         symbol: suggestion.name.replace(/^[^/]+/, '').replace(/^\//, '') || chord.symbol,
324:         name: suggestion.name,
325:         notes: suggestion.notes,
326:         style,
327:       },
328:       time: chord.time,
329:       duration: chord.duration,
330:     };
331:   });
332: }
333: 
334: export function renderProgressionToEvents(progression, bpm = 90) {
335:   if (!Array.isArray(progression) || progression.length === 0) return [];
336: 
337:   const beatDuration = 60 / bpm;
338:   const events = [];
339: 
340:   for (const entry of progression) {
341:     const notes = entry.replacement?.notes || entry.original?.notes || [];
342:     if (notes.length === 0) continue;
343: 
344:     const duration = entry.duration || entry.original?.duration || beatDuration * 4;
345:     const startTime = entry.time || entry.original?.time || 0;
346:     const velocity = 0.72;
347: 
348:     for (const note of notes) {
349:       events.push({ time: startTime, type: 'note_on', note, velocity, channel: 0 });
350:       events.push({ time: startTime + duration, type: 'note_off', note, velocity: 0, channel: 0 });
351:     }
352:   }
353: 
354:   return events.sort((a, b) => a.time - b.time);
355: }
356: 
357: export function playProgression(progression, feedMidiEvent, bpm = 90) {
358:   if (!feedMidiEvent || !Array.isArray(progression) || progression.length === 0) return;
359: 
360:   const events = renderProgressionToEvents(progression, bpm);
361:   const now = performance.now();
362:   const startOffset = events[0]?.time || 0;
363: 
364:   for (const event of events) {
365:     const delay = (event.time - startOffset) * 1000;
366:     setTimeout(() => {
367:       switch (event.type) {
368:         case 'note_on':
369:           feedMidiEvent('noteOn', event.note, event.velocity);
370:           break;
371:         case 'note_off':
372:           feedMidiEvent('noteOff', event.note);
373:           break;
374:       }
375:     }, delay);
376:   }
377: }
378: 
379: // ────────────────────────────── Export playback helpers ──────────────────────────────
380: 
381: export function renderSuggestionToEvents(suggestion, channel = 0) {
382:   if (!suggestion || !Array.isArray(suggestion.notes) || suggestion.notes.length === 0) return [];
383:   const velocity = 0.7;
384:   const duration = 1.0;
385:   const events = [];
386:   for (const note of suggestion.notes) {
387:     events.push({ time: 0, type: 'note_on', note, velocity, channel });
388:   }
389:   for (const note of suggestion.notes) {
390:     events.push({ time: duration, type: 'note_off', note, channel });
391:   }
392:   return events.sort((a, b) => a.time - b.time);
393: }
394: 
395: export function playSuggestion(suggestion, feedMidiEvent) {
396:   if (!feedMidiEvent) return;
397:   const events = renderSuggestionToEvents(suggestion);
398:   for (const event of events) {
399:     setTimeout(() => {
400:       switch (event.type) {
401:         case 'note_on':
402:           feedMidiEvent('noteOn', event.note, event.velocity);
403:           break;
404:         case 'note_off':
405:           feedMidiEvent('noteOff', event.note);
406:           break;
407:       }
408:     }, event.time * 1000);
409:   }
410: }

(End of file - total 410 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/audio-analyzer.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/audio-analyzer.js</path>
<type>file</type>
<content>
1: // [Claude] — 2026-07-08 — Abstraction du moteur d'analyse audio d'accords.
2: // L'objectif est de pouvoir remplacer l'algorithme simple (templates chromagramme)
3: // par un modèle plus avancé (Basic Pitch, transcription ML, etc.) sans modifier
4: // le reste de l'application.
5: 
6: /**
7:  * Résultat d'analyse d'un accord :
8:  * {
9:  *   startTime: number,
10:  *   endTime: number,
11:  *   chord: string,
12:  *   confidence: number,
13:  *   analysis: {},        // réservé pour données enrichies futures
14:  *   suggestions: [],     // réservé pour suggestions futures
15:  *   reharmonizations: [],// réservé pour réharmonisations futures
16:  *   voiceLeading: {},    // réservé pour voice leading futur
17:  *   techniques: []       // réservé pour techniques futures
18:  * }
19:  */
20: 
21: export class AudioAnalyzer {
22:   /**
23:    * Analyse un fichier media et retourne un objet enrichi.
24:    * @param {string} filePath — chemin vers le fichier original (mp3, mp4, wav, m4a...)
25:    * @returns {Promise<{
26:    *   wavPath: string,
27:    *   duration: number,
28:    *   tempo: number|null,
29:    *   timeSignature: string,
30:    *   key: string|null,
31:    *   keyConfidence: number,
32:    *   confidence: number,
33:    *   chords: Array
34:    * }>}
35:    */
36:   async analyze(filePath) {
37:     throw new Error('AudioAnalyzer.analyze() must be implemented by subclass');
38:   }
39: }
40: 
41: /**
42:  * Implémentation par défaut : analyse via le processeur Python (chromagramme + templates).
43:  */
44: export class TemplateAudioAnalyzer extends AudioAnalyzer {
45:   async analyze(filePath, options = {}) {
46:     if (!window.electronAPI?.analyzer?.processFile) {
47:       throw new Error('processFile IPC non disponible');
48:     }
49:     const opts = { analyzeBass: true, ...options };
50:     const result = await window.electronAPI.analyzer.processFile(filePath, opts);
51:     const keyCandidates = (result.keyCandidates || [])
52:       .filter((c) => c.name !== result.key)
53:       .slice(0, 3)
54:       .map((c) => ({
55:         name: c.name ?? '?',
56:         mode: c.mode ?? 'major',
57:         confidence: c.confidence ?? 0,
58:       }));
59: 
60:     return {
61:       wavPath: result.wavPath || '',
62:       analysisWavPath: result.analysisWavPath || result.wavPath || '',
63:       usedPianoStem: result.usedPianoStem ?? false,
64:       usedBassStem: result.usedBassStem ?? false,
65:       duration: result.duration ?? 0,
66:       tempo: result.tempo ?? null,
67:       timeSignature: result.timeSignature ?? '4/4',
68:       key: result.key ?? null,
69:       keyMode: result.keyMode ?? 'major',
70:       keyConfidence: result.keyConfidence ?? 0,
71:       keyCandidates,
72:       confidence: result.confidence ?? 0,
73:       chords: (result.chords || []).map((c) => ({
74:         startTime: c.startTime ?? 0,
75:         endTime: c.endTime ?? 0,
76:         chord: c.chord || '?',
77:         structuralChord: c.structural_chord || c.structuralChord || null,
78:         confidence: c.confidence ?? 0,
79:         analysis: c.analysis || {},
80:         techniques: c.techniques || [],
81:         suggestions: c.suggestions || [],
82:         reharmonizations: c.reharmonizations || [],
83:         voiceLeading: c.voiceLeading || {},
84:       })),
85:       bassSegments: (result.bassSegments || []).map((s) => ({
86:         startTime: s.startTime ?? 0,
87:         endTime: s.endTime ?? 0,
88:         midi: s.midi ?? 0,
89:         note: s.bass || s.note || '?',
90:         octave: s.octave ?? 0,
91:         confidence: s.confidence ?? 0,
92:         source: s.source || 'bass_engine',
93:         isVirtual: s.isVirtual ?? false,
94:       })),
95:     };
96:   }
97: }
98: 
99: /**
100:  * Factory : retourne l'analyseur actif du projet.
101:  * Pour l'instant, c'est toujours TemplateAudioAnalyzer.
102:  */
103: export function createAudioAnalyzer() {
104:   return new TemplateAudioAnalyzer();
105: }

(End of file - total 105 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 6.1s)

_Thinking:_

Let me now read the remaining key files to complete the audit: the virtual keyboard, the UI keyboard SVG, the note-grouper, the chord history, the practice exercise, the session manager, the recording tab, the chord editor, the voicing preview, the mini-keyboard, the analyzer files (scorer, segmenter, harmonic-utils, etc.), and the Python harmonyengine.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/virtual-keyboard.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/virtual-keyboard.js</path>
<type>file</type>
<content>
1: import { playNote, releaseNote } from './audio/simple-synth.js';
2: 
3: let noteOnHandler = null;
4: let noteOffHandler = null;
5: let keyboardKeydownHandler = null;
6: let keyboardKeyupHandler = null;
7: 
8: function getActiveTab() {
9:   const activeBtn = document.querySelector('.tab-btn.active');
10:   return activeBtn?.dataset?.tab || 'practice';
11: }
12: 
13: function shouldHandleKeyboardShortcuts() {
14:   // Only enable computer-keyboard shortcuts on the practice tab,
15:   // where the virtual keyboard is the primary input method.
16:   return getActiveTab() === 'practice';
17: }
18: 
19: export function initVirtualKeyboard({ onNoteOn, onNoteOff }) {
20:   noteOnHandler = onNoteOn;
21:   noteOffHandler = onNoteOff;
22: 
23:   const container = document.getElementById('keyboard-container');
24:   if (!container) return;
25: 
26:   // Remove any previous global keyboard shortcut listeners to avoid duplicates.
27:   if (keyboardKeydownHandler) {
28:     document.removeEventListener('keydown', keyboardKeydownHandler);
29:     document.removeEventListener('keyup', keyboardKeyupHandler);
30:   }
31: 
32:   const keys = container.querySelectorAll('.note');
33: 
34:   const startNote = (el) => {
35:     const midi = Number(el.getAttribute('data-midi'));
36:     if (Number.isFinite(midi) && midi >= 12 && midi <= 127 && noteOnHandler) {
37:       noteOnHandler(midi, 0.8, true);
38:     }
39:   };
40: 
41:   const endNote = (el) => {
42:     const midi = Number(el.getAttribute('data-midi'));
43:     if (Number.isFinite(midi) && midi >= 12 && midi <= 127 && noteOffHandler) {
44:       noteOffHandler(midi, true);
45:     }
46:   };
47: 
48:   for (const key of keys) {
49:     key.addEventListener('mousedown', (e) => {
50:       e.preventDefault();
51:       startNote(key);
52:     });
53:     key.addEventListener('mouseup', () => endNote(key));
54:     key.addEventListener('mouseleave', () => endNote(key));
55: 
56:     key.addEventListener('touchstart', (e) => {
57:       e.preventDefault();
58:       startNote(key);
59:     });
60:     key.addEventListener('touchend', () => endNote(key));
61:   }
62: 
63:   // Keyboard shortcuts (one octave starting at C4)
64:   const keyMap = {
65:     a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
66:     k: 72, o: 73, l: 74, p: 75,
67:   };
68: 
69:   const pressed = new Set();
70: 
71:   keyboardKeydownHandler = (e) => {
72:     if (e.code === 'Space') return; // Espace réservé au Play/Pause du lecteur.
73:     if (!shouldHandleKeyboardShortcuts()) return;
74:     if (e.ctrlKey || e.altKey || e.metaKey) return;
75:     if (e.repeat) return;
76:     const midi = keyMap[e.key.toLowerCase()];
77:     if (midi && !pressed.has(midi)) {
78:       pressed.add(midi);
79:       if (noteOnHandler) noteOnHandler(midi, 0.8, true);
80:     }
81:   };
82: 
83:   keyboardKeyupHandler = (e) => {
84:     if (!shouldHandleKeyboardShortcuts()) return;
85:     const midi = keyMap[e.key.toLowerCase()];
86:     if (midi) {
87:       pressed.delete(midi);
88:       if (noteOffHandler) noteOffHandler(midi, true);
89:     }
90:   };
91: 
92:   document.addEventListener('keydown', keyboardKeydownHandler);
93:   document.addEventListener('keyup', keyboardKeyupHandler);
94: }
95: 
96: export function playVirtualNote(midi, velocity) {
97:   playNote(midi, velocity);
98: }
99: 
100: export function releaseVirtualNote(midi) {
101:   releaseNote(midi);
102: }

(End of file - total 102 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ui/keyboard-svg.js",
  "limit": 80
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ui/keyboard-svg.js</path>
<type>file</type>
<content>
1: import { noteNameToMidi, midiToNoteName } from '../chord-engine/intervals.js';
2: 
3: // [Claude] — 2026-07-03 — Refonte du rendu clavier pour reproduire les proportions et le style de chord-display (rednetio/chord-display)
4: const NOTE_RADIUS = 5;
5: const NOTE_WHITE_WIDTH = 40;
6: const NOTE_WHITE_HEIGHT = 150;
7: const NOTE_BLACK_WIDTH = 22;
8: const NOTE_BLACK_HEIGHT = 90;
9: const NOTE_TONIC_RADIUS = 5;
10: const NOTE_TONIC_BOTTOM_OFFSET = 30;
11: const NOTE_NAME_BOTTOM_OFFSET = 2;
12: 
13: function mixRGB(color1, color2, ratio) {
14:   const c1 = parseInt(color1.replace('#', ''), 16);
15:   const c2 = parseInt(color2.replace('#', ''), 16);
16:   const r1 = (c1 >> 16) & 255;
17:   const g1 = (c1 >> 8) & 255;
18:   const b1 = c1 & 255;
19:   const r2 = (c2 >> 16) & 255;
20:   const g2 = (c2 >> 8) & 255;
21:   const b2 = c2 & 255;
22:   const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
23:   const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
24:   const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
25:   return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
26: }
27: 
28: function isBlackKey(midi) {
29:   return [1, 3, 6, 8, 10].includes(midi % 12);
30: }
31: 
32: function getNoteProps(midi, latin = false) {
33:   const name = midiToNoteName(midi, true, latin);
34:   const octave = Math.floor(midi / 12) - 1; // MIDI C4 = central C
35:   return { midi, name, octave, alt: isBlackKey(midi) };
36: }
37: 
38: function whiteKeyTemplate(props, posX, color) {
39:   const name = `${props.name}${props.octave}`;
40:   return `\
41: <g id="note-${props.midi}" class="note white" data-midi="${props.midi}" transform="translate(${posX},0)" style="color: ${color};">
42:   <rect class="piano-key" width="${NOTE_WHITE_WIDTH}" height="${NOTE_WHITE_HEIGHT + NOTE_RADIUS}" x="0" y="${-NOTE_RADIUS}" rx="${NOTE_RADIUS}" ry="${NOTE_RADIUS}"></rect>
43:   <circle class="piano-tonic" cx="${NOTE_WHITE_WIDTH / 2}" cy="${NOTE_WHITE_HEIGHT - NOTE_TONIC_BOTTOM_OFFSET}" r="${NOTE_TONIC_RADIUS}"></circle>
44:   <text class="piano-key-name" x="${NOTE_WHITE_WIDTH / 2}" y="${NOTE_WHITE_HEIGHT - NOTE_NAME_BOTTOM_OFFSET}" text-anchor="middle">${name}</text>
45: </g>`;
46: }
47: 
48: function blackKeyTemplate(props, posX, color) {
49:   return `\
50: <g id="note-${props.midi}" class="note black" data-midi="${props.midi}" transform="translate(${posX - NOTE_BLACK_WIDTH / 2},0)" style="color: ${color};">
51:   <rect class="piano-key" width="${NOTE_BLACK_WIDTH}" height="${NOTE_BLACK_HEIGHT + NOTE_RADIUS}" x="0" y="${-NOTE_RADIUS}" rx="${NOTE_RADIUS}" ry="${NOTE_RADIUS}"></rect>
52:   <circle class="piano-tonic" cx="${NOTE_BLACK_WIDTH / 2}" cy="${NOTE_BLACK_HEIGHT - NOTE_TONIC_BOTTOM_OFFSET}" r="${NOTE_TONIC_RADIUS}"></circle>
53: </g>`;
54: }
55: 
56: function range(start, end) {
57:   return Array.from({ length: end - start + 1 }, (_, i) => start + i);
58: }
59: 
60: // [Claude] — 2026-07-03 — Génération SVG avec proportions fixes (40×150 blanches, 22×90 noires), gradients chord-display et positionnement réaliste des touches noires
61: export function generateKeyboard(
62:   noteStart,
63:   noteEnd,
64:   containerWidth,
65:   containerHeight,
66:   colorNote = '#bf3a2b',
67:   colorTonic = '#111111',
68:   latin = false,
69: ) {
70:   const safeColorNote = /^#[0-9A-Fa-f]{6}$/.test(colorNote) ? colorNote : '#bf3a2b';
71:   const colorNoteWhite = mixRGB(safeColorNote, '#ffffff', 0.4);
72:   const colorNoteBlack = safeColorNote;
73: 
74:   const startMidi = noteNameToMidi(noteStart, 4);
75:   const endMidi = noteNameToMidi(noteEnd, 4);
76: 
77:   if (startMidi === null || endMidi === null) {
78:     throw new Error(`Invalid note range: "${noteStart}" to "${noteEnd}"`);
79:   }
80: 

(Showing lines 1-80 of 149. Use offset=81 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/note-grouper.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/note-grouper.js</path>
<type>file</type>
<content>
1: const DEFAULT_TOLERANCE_MS = 200;
2: 
3: // [OpenCode] — 2026-07-04 — Groupement temporel des notes avec fenêtre glissante pour les cascades/arpèges.
4: // Toutes les notes jouées dans la fenêtre sont accumulées (même relâchées) pour reconstituer l'accord complet.
5: // Le déclenchement nécessite ≥ 3 notes distinctes (vérifié par l'appelant).
6: export function createNoteGrouper({ onGroupReady, toleranceMs = DEFAULT_TOLERANCE_MS } = {}) {
7:   let pendingNotes = [];
8:   let timer = null;
9: 
10:   function noteOn(note, velocity = 0.8) {
11:     pendingNotes.push({ note, velocity, time: performance.now() });
12:     resetTimer();
13:   }
14: 
15:   function noteOff(note, _options = {}) {
16:     // Ne pas retirer la note du buffer : elle fait toujours partie de l'accord en cours
17:     // (cascade/arpège). Le timeout de la fenêtre se charge de la frontière temporelle.
18:   }
19: 
20:   function resetTimer() {
21:     if (timer) clearTimeout(timer);
22:     timer = setTimeout(() => {
23:       flush();
24:     }, toleranceMs);
25:   }
26: 
27:   function flush() {
28:     if (pendingNotes.length === 0) return;
29:     const group = pendingNotes.slice();
30:     pendingNotes = [];
31:     timer = null;
32:     onGroupReady?.(group);
33:   }
34: 
35:   function clear() {
36:     pendingNotes = [];
37:     if (timer) clearTimeout(timer);
38:     timer = null;
39:   }
40: 
41:   function setTolerance(ms) {
42:     toleranceMs = Math.max(50, Math.min(500, ms));
43:   }
44: 
45:   function getTolerance() {
46:     return toleranceMs;
47:   }
48: 
49:   return { noteOn, noteOff, flush, clear, setTolerance, getTolerance };
50: }

(End of file - total 50 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/chord-history.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/chord-history.js</path>
<type>file</type>
<content>
1: const MAX_HISTORY = 50;
2: 
3: export function createChordHistory(onSelect) {
4:   const history = [];
5: 
6:   function add(item) {
7:     history.unshift(item);
8:     if (history.length > MAX_HISTORY) history.pop();
9:     render();
10:     return history;
11:   }
12: 
13:   function clear() {
14:     history.length = 0;
15:     render();
16:   }
17: 
18:   function getAll() {
19:     return [...history];
20:   }
21: 
22:   function render(container) {
23:     if (!container) return;
24:     container.innerHTML = '';
25: 
26:     if (history.length === 0) {
27:       container.innerHTML = '<p style="color: var(--muted); font-size: 0.8rem;">Aucun accord joué pour le moment.</p>';
28:       return;
29:     }
30: 
31:     for (const item of history) {
32:       const el = document.createElement('div');
33:       el.className = 'history-item';
34:       el.innerHTML = `
35:         <span class="history-chord">${item.display || item.name}</span>
36:         <span class="time">${formatTime(item.timestamp)}</span>
37:       `;
38:       el.addEventListener('click', () => onSelect?.(item));
39:       container.appendChild(el);
40:     }
41:   }
42: 
43:   function formatTime(ts) {
44:     const d = new Date(ts);
45:     return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
46:   }
47: 
48:   return { add, clear, getAll, render };
49: }

(End of file - total 49 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ui/recording-tab.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ui/recording-tab.js</path>
<type>file</type>
<content>
1: import {
2:   createSession,
3:   saveSessionEvents,
4:   loadSession,
5:   listSessions,
6:   deleteSession,
7:   renameSession,
8: } from '../recorder/session-manager.js';
9: import { createRecorder } from '../recorder/recorder.js';
10: import { createPlayer } from '../recorder/player.js';
11: import {
12:   renderAnalysis,
13:   setAnalyzerNotation,
14:   initAnalyzerTab,
15: } from './analyzer-tab.js';
16: 
17: let currentNotation = 'english';
18: let recorder = null;
19: let player = null;
20: let currentSession = null;
21: let currentEvents = [];
22: let currentMetadata = null;
23: let onMidiEvent = null;
24: let getCurrentChordFn = null;
25: let refreshHistoryCallback = null;
26: let recordingTimerInterval = null;
27: let metronomeInterval = null;
28: let lastChordName = null;
29: let chordCountDuringRecording = 0;
30: 
31: const els = {
32:   sessionList: document.getElementById('session-list'),
33:   sessionSearch: document.getElementById('session-search'),
34:   newSessionBtn: document.getElementById('new-session-btn'),
35:   startRecordingBtn: document.getElementById('start-recording-btn'),
36:   stopRecordingBtn: document.getElementById('stop-recording-btn'),
37:   recordingControls: document.getElementById('recording-controls'),
38:   recordingStatus: document.getElementById('recording-status'),
39:   recordingCountdown: document.getElementById('recording-countdown'),
40:   recordingTimer: document.getElementById('recording-timer'),
41:   recordingStats: document.getElementById('recording-stats'),
42:   recordingInitModal: document.getElementById('recording-init-modal'),
43:   metronomeToggle: document.getElementById('metronome-toggle'),
44:   selectedSessionInfo: document.getElementById('selected-session-info'),
45:   analysisContent: document.getElementById('analysis-content'),
46:   analyzeSessionBtn: document.getElementById('analyze-session-btn'),
47:   modalOverlay: document.getElementById('session-end-modal'),
48:   modalStats: document.getElementById('modal-stats'),
49:   modalKeepBtn: document.getElementById('modal-keep'),
50:   modalDeleteBtn: document.getElementById('modal-delete'),
51:   modalReplayBtn: document.getElementById('modal-replay'),
52:   transportBar: document.getElementById('transport-bar'),
53:   transportRewind: document.getElementById('transport-rewind'),
54:   transportPlay: document.getElementById('transport-play'),
55:   transportSlider: document.getElementById('transport-slider'),
56:   sessionTitleInput: document.getElementById('session-title-input'),
57:   sessionBpmInput: document.getElementById('session-bpm-input'),
58:   bpmRow: document.getElementById('bpm-row'),
59:   countdownOverlay: document.getElementById('countdown-overlay'),
60:   countdownNumber: document.getElementById('countdown-number'),
61: };
62: 
63: export function initRecordingTab({
64:   notation = 'english',
65:   feedMidiEvent,
66:   getCurrentChord,
67:   refreshHistory,
68: } = {}) {
69:   currentNotation = notation;
70:   onMidiEvent = feedMidiEvent;
71:   getCurrentChordFn = getCurrentChord;
72:   refreshHistoryCallback = refreshHistory;
73: 
74:   // Initialise l'analyseur avec le callback de lecture dès le départ.
75:   // On transmet les événements MIDI au pipeline principal : il met à jour l'UI
76:   // et déclenche le synthétiseur via handleNoteOn/handleNoteOff.
77:   initAnalyzerTab({
78:     onPlay: (type, note, velocity) => {
79:       if (type === 'noteOn') {
80:         onMidiEvent?.('noteOn', note, velocity ?? 0.78);
81:       } else if (type === 'noteOff') {
82:         onMidiEvent?.('noteOff', note);
83:       }
84:     },
85:     onSuggestionPlay: (action, notes, name) => {
86:       onMidiEvent?.('suggestion', action, notes, name);
87:     },
88:   });
89: 
90:   player = createPlayer({
91:     onNoteOn: (note, velocity) => feedMidiEvent?.('noteOn', note, velocity),
92:     onNoteOff: (note) => feedMidiEvent?.('noteOff', note),
93:     onSustain: (value) => feedMidiEvent?.('sustain', value),
94:     onPitchWheel: (value) => feedMidiEvent?.('pitchWheel', value),
95:     onModWheel: (value) => feedMidiEvent?.('modWheel', value),
96:   });
97: 
98:   bindSessionForm();
99:   bindRecordingControls();
100:   bindModal();
101:   bindSessionSearch();
102:   bindAnalyzeButton();
103:   bindTransportBar();
104:   refreshSessionList();
105: 
106:   switchToRecordingTab();
107: }
108: 
109: export function switchToRecordingTab() {
110:   const event = new CustomEvent('app-switch-tab', { detail: { tab: 'analysis' } });
111:   document.dispatchEvent(event);
112: }
113: 
114: function bindSessionForm() {
115:   els.newSessionBtn?.addEventListener('click', () => {
116:     els.recordingInitModal.style.display = 'flex';
117:     els.newSessionBtn.style.display = 'none';
118:     if (els.sessionTitleInput) els.sessionTitleInput.value = '';
119:     if (els.sessionTitleInput) els.sessionTitleInput.focus();
120:     if (els.bpmRow) {
121:       els.bpmRow.style.display = els.metronomeToggle?.checked ? 'flex' : 'none';
122:     }
123:   });
124:   els.startRecordingBtn?.addEventListener('click', () => startCountdown());
125: 
126:   if (els.metronomeToggle && els.bpmRow) {
127:     els.metronomeToggle.addEventListener('change', () => {
128:       els.bpmRow.style.display = els.metronomeToggle.checked ? 'flex' : 'none';
129:     });
130:   }
131: }
132: 
133: function startCountdown() {
134:   els.recordingInitModal.style.display = 'none';
135:   els.recordingControls.style.display = 'flex';
136:   const countdownEl = els.recordingCountdown;
137:   countdownEl.style.display = 'block';
138: 
139:   if (els.countdownOverlay) {
140:     els.countdownOverlay.style.display = 'flex';
141:   }
142:   if (els.countdownNumber) {
143:     els.countdownNumber.textContent = '3';
144:   }
145: 
146:   let count = 3;
147:   countdownEl.textContent = '3';
148: 
149:   const interval = setInterval(() => {
150:     count--;
151:     if (count > 0) {
152:       countdownEl.textContent = String(count);
153:       if (els.countdownNumber) els.countdownNumber.textContent = String(count);
154:     } else if (count === 0) {
155:       countdownEl.textContent = 'GO !';
156:       if (els.countdownNumber) els.countdownNumber.textContent = 'GO !';
157:     } else {
158:       clearInterval(interval);
159:       countdownEl.style.display = 'none';
160:       if (els.countdownOverlay) els.countdownOverlay.style.display = 'none';
161:       startRecording();
162:     }
163:   }, 800);
164: }
165: 
166: function bindRecordingControls() {
167:   els.stopRecordingBtn?.addEventListener('click', (e) => {
168:     e.preventDefault();
169:     stopRecording();
170:   });
171: }
172: 
173: function bindModal() {
174:   els.modalKeepBtn?.addEventListener('click', () => keepSession());
175:   els.modalDeleteBtn?.addEventListener('click', () => discardSession());
176:   els.modalReplayBtn?.addEventListener('click', () => replaySession());
177: }
178: 
179: function bindSessionSearch() {
180:   els.sessionSearch?.addEventListener('input', () => {
181:     refreshSessionList();
182:   });
183: }
184: 
185: async function startRecording() {
186:   try {
187:     if (!window.electronAPI?.files) {
188:       throw new Error('Mode navigateur non supporté pour l\'enregistrement. Lancez l\'application via Electron.');
189:     }
190: 
191:     const now = new Date();
192:     const dateStr = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
193:     const title = els.sessionTitleInput?.value?.trim() || `Session ${dateStr}`;
194:     const tempo = els.metronomeToggle?.checked ? Number(els.sessionBpmInput?.value) || 90 : 120;
195:     const metadata = {
196:       name: title,
197:       key: '',
198:       tempo,
199:       comments: '',
200:       tags: [],
201:     };
202:     currentSession = await createSession(metadata);
203:     if (!currentSession || !currentSession.id) {
204:       throw new Error('La session n\'a pas pu être créée');
205:     }
206: 
207:     currentEvents = [];
208:     currentMetadata = metadata;
209:     lastChordName = null;
210:     chordCountDuringRecording = 0;
211: 
212:     recorder = createRecorder();
213:     recorder.start();
214: 
215:     startMetronome();
216:     setRecordingStatus('● Enregistrement en cours...', 'recording');
217:     startRecordingTimer();
218:     blinkStopButton(true);
219:   } catch (err) {
220:     console.error('Failed to start recording:', err);
221:     setRecordingStatus(`Erreur : ${err.message}`, 'error');
222:     if (els.modalOverlay) {
223:       showEndModal({ duration: 0, noteCount: 0, chordCount: 0, error: err.message });
224:     }
225:   }
226: }
227: 
228: function blinkStopButton(on) {
229:   const btn = els.stopRecordingBtn;
230:   if (!btn) return;
231:   if (on) {
232:     let visible = true;
233:     btn._blink = setInterval(() => {
234:       visible = !visible;
235:       btn.style.opacity = visible ? '1' : '0.3';
236:     }, 600);
237:   } else {
238:     if (btn._blink) clearInterval(btn._blink);
239:     btn.style.opacity = '1';
240:   }
241: }
242: 
243: function startMetronome() {
244:   if (!els.metronomeToggle?.checked) return;
245:   stopMetronome();
246:   const ctx = new (window.AudioContext || window.webkitAudioContext)();
247:   if (ctx.state === 'suspended') ctx.resume();
248:   const bpm = Number(els.sessionBpmInput?.value) || 90;
249:   const intervalMs = 60000 / bpm;
250:   metronomeInterval = setInterval(() => {
251:     const osc = ctx.createOscillator();
252:     const gain = ctx.createGain();
253:     osc.type = 'sine';
254:     osc.frequency.value = 1200;
255:     gain.gain.value = 0.15;
256:     gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
257:     osc.connect(gain);
258:     gain.connect(ctx.destination);
259:     osc.start(ctx.currentTime);
260:     osc.stop(ctx.currentTime + 0.05);
261:   }, intervalMs);
262: }
263: 
264: function stopMetronome() {
265:   if (metronomeInterval) {
266:     clearInterval(metronomeInterval);
267:     metronomeInterval = null;
268:   }
269: }
270: 
271: async function stopRecording() {
272:   if (!recorder || !currentSession) return;
273:   stopMetronome();
274:   currentEvents = recorder.stop();
275:   stopRecordingTimer();
276:   blinkStopButton(false);
277: 
278:   const stats = recorder.getStats();
279:   stats.chordCount = chordCountDuringRecording;
280:   currentSession = { ...currentSession, ...stats };
281: 
282:   showRecordingUI(false);
283:   showEndModal(stats);
284: }
285: 
286: function showRecordingUI(active) {
287:   if (!els.recordingControls || !els.newSessionBtn) return;
288:   els.recordingControls.style.display = active ? 'flex' : 'none';
289:   els.newSessionBtn.style.display = active ? 'none' : 'inline-flex';
290:   if (els.recordingInitModal) els.recordingInitModal.style.display = 'none';
291: }
292: 
293: function setRecordingStatus(text, state) {
294:   if (!els.recordingStatus) return;
295:   els.recordingStatus.textContent = text;
296:   els.recordingStatus.dataset.state = state;
297: }
298: 
299: function startRecordingTimer() {
300:   stopRecordingTimer();
301:   recordingTimerInterval = setInterval(() => {
302:     if (!recorder) return;
303:     const seconds = Math.floor(recorder.getCurrentTime());
304:     els.recordingTimer.textContent = formatDuration(seconds);
305:     const stats = recorder.getStats();
306:     const chord = getCurrentChordFn?.();
307:     if (chord && chord.name && chord.name !== lastChordName) {
308:       lastChordName = chord.name;
309:       chordCountDuringRecording += 1;
310:     }
311:     els.recordingStats.textContent = `${stats.noteCount} notes · ${chordCountDuringRecording} accords · Cours : ${chord?.name || '—'}`;
312:   }, 200);
313: }
314: 
315: function stopRecordingTimer() {
316:   if (recordingTimerInterval) {
317:     clearInterval(recordingTimerInterval);
318:     recordingTimerInterval = null;
319:   }
320: }
321: 
322: function showEndModal(stats) {
323:   if (!els.modalOverlay || !els.modalStats) return;
324:   els.modalStats.innerHTML = `
325:     <div><strong>Nom :</strong> ${escapeHtml(currentSession.name)}</div>
326:     <div><strong>Durée :</strong> ${formatDuration(stats.duration)}</div>
327:     <div><strong>Notes :</strong> ${stats.noteCount}</div>
328:     <div><strong>Accords :</strong> ${stats.chordCount}</div>
329:   `;
330:   els.modalOverlay.style.display = 'flex';
331: }
332: 
333: function hideEndModal() {
334:   if (els.modalOverlay) els.modalOverlay.style.display = 'none';
335: }
336: 
337: async function keepSession() {
338:   hideEndModal();
339:   try {
340:     const stats = { ...recorder.getStats(), chordCount: chordCountDuringRecording };
341:     await saveSessionEvents(currentSession.id, currentEvents, stats);
342:     currentSession = { ...currentSession, ...stats };
343:     setRecordingStatus('Session sauvegardée.', 'saved');
344:     refreshSessionList();
345:     selectSession(currentSession.id);
346:     // Activer directement l'analyse
347:     if (els.analyzeSessionBtn) els.analyzeSessionBtn.disabled = false;
348:   } catch (err) {
349:     console.error('Failed to save recording:', err);
350:     setRecordingStatus(`Erreur de sauvegarde : ${err.message}`, 'error');
351:   }
352: }
353: 
354: async function discardSession() {
355:   hideEndModal();
356:   try {
357:     if (currentSession?.id) await deleteSession(currentSession.id);
358:   } catch (err) {
359:     console.error('Failed to delete session:', err);
360:   }
361:   if (els.transportBar) els.transportBar.style.display = 'none';
362:   currentSession = null;
363:   currentEvents = [];
364:   currentMetadata = null;
365:   setRecordingStatus('Session supprimée.', 'deleted');
366:   refreshSessionList();
367: }
368: 
369: async function replaySession() {
370:   await keepSession();
371:   if (currentSession && player) {
372:     player.stop();
373:     player.play();
374:     startTransportLoop();
375:   }
376: }
377: 
378: export function feedRecorderNoteOn(note, velocity) {
379:   recorder?.noteOn(note, velocity);
380: }
381: 
382: export function feedRecorderNoteOff(note) {
383:   recorder?.noteOff(note);
384: }
385: 
386: export function feedRecorderSustain(value) {
387:   recorder?.sustain(value);
388: }
389: 
390: export function feedRecorderPitchWheel(value) {
391:   recorder?.pitchWheel(value);
392: }
393: 
394: export function feedRecorderModWheel(value) {
395:   recorder?.modWheel(value);
396: }
397: 
398: async function refreshSessionList() {
399:   if (!els.sessionList) return;
400:   try {
401:     const sessions = await listSessions();
402:     const query = (els.sessionSearch?.value || '').trim().toLowerCase();
403:     const filtered = query
404:       ? sessions.filter((s) => {
405:           try {
406:             return (
407:               (s.name || '').toLowerCase().includes(query) ||
408:               (s.comments || '').toLowerCase().includes(query) ||
409:               (s.tags || []).some((t) => (t || '').toLowerCase().includes(query))
410:             );
411:           } catch { return false; }
412:         })
413:       : sessions;
414:     renderSessionList(filtered);
415:   } catch (err) {
416:     console.error('Failed to list sessions:', err);
417:     els.sessionList.innerHTML = `<p class="detail-hint">Impossible de charger les sessions.</p>`;
418:   }
419: }
420: 
421: function renderSessionList(sessions) {
422:   if (!els.sessionList) return;
423:   els.sessionList.innerHTML = '';
424: 
425:   if (sessions.length === 0) {
426:     els.sessionList.innerHTML = `<p class="detail-hint">Aucune session enregistrée.</p>`;
427:     return;
428:   }
429: 
430:   for (const session of sessions) {
431:     const item = document.createElement('div');
432:     item.className = 'session-item';
433:     const date = new Date(session.date).toLocaleString('fr-FR');
434:     const duration = formatDuration(session.duration);
435:     const isSelected = currentSession && currentSession.id === session.id;
436:     if (isSelected) item.classList.add('active');
437: 
438:     item.innerHTML = `
439:       <div class="session-name" contenteditable="false" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</div>
440:       <div class="session-meta">${date} · ${duration} · ${session.noteCount || 0} notes · ${session.chordCount || 0} accords${session.key ? ` · ${session.key}` : ''}${session.tempo ? ` · ${session.tempo} BPM` : ''}</div>
441:       <div class="session-actions">
442:         <button class="session-action delete" data-id="${session.id}" title="Supprimer">🗑</button>
443:       </div>
444:     `;
445: 
446:     const nameEl = item.querySelector('.session-name');
447:     nameEl.addEventListener('dblclick', () => {
448:       nameEl.contentEditable = 'true';
449:       nameEl.focus();
450:     });
451:     nameEl.addEventListener('blur', async () => {
452:       nameEl.contentEditable = 'false';
453:       await renameSession(session.id, nameEl.textContent.trim() || session.name);
454:       refreshSessionList();
455:     });
456:     nameEl.addEventListener('keydown', (e) => {
457:       if (e.key === 'Enter') {
458:         e.preventDefault();
459:         nameEl.blur();
460:       }
461:     });
462: 
463:     item.addEventListener('click', (e) => {
464:       if (e.target.closest('.delete')) return;
465:       loadAndPlaySession(session.id);
466:     });
467:     item.querySelector('.delete')?.addEventListener('click', async (e) => {
468:       e.stopPropagation();
469:       if (confirm(`Supprimer la session "${session.name}" ?`)) {
470:         await deleteSession(session.id);
471:         if (currentSession?.id === session.id) {
472:           currentSession = null;
473:           currentEvents = [];
474:           resetSelectedSessionInfo();
475:         }
476:         refreshSessionList();
477:       }
478:     });
479: 
480:     els.sessionList.appendChild(item);
481:   }
482: }
483: 
484: function selectSession(sessionId) {
485:   loadAndPlaySession(sessionId);
486: }
487: 
488: async function loadAndPlaySession(sessionId, autoPlay = false) {
489:   try {
490:     const data = await loadSession(sessionId);
491:     currentSession = data.session;
492:     currentEvents = data.events;
493:     currentMetadata = data.metadata;
494: 
495:     player.load(currentEvents);
496:     renderSelectedSessionInfo();
497:     refreshSessionList();
498:     if (els.analyzeSessionBtn) els.analyzeSessionBtn.disabled = false;
499:     if (els.analysisContent) {
500:       els.analysisContent.innerHTML = '<p class="detail-hint">Cliquez sur « Analyser » pour générer l\'analyse de cette session.</p>';
501:     }
502:     if (els.transportBar) els.transportBar.style.display = 'flex';
503:     updateTransportUI();
504:     if (autoPlay) {
505:       player.play();
506:       startTransportLoop();
507:     }
508:   } catch (err) {
509:     console.error('Failed to load session:', err);
510:     setRecordingStatus(`Erreur de lecture : ${err.message}`, 'error');
511:   }
512: }
513: 
514: function renderSelectedSessionInfo() {
515:   if (!els.selectedSessionInfo || !currentSession) return;
516:   const duration = formatDuration(currentSession.duration);
517:   els.selectedSessionInfo.innerHTML = `
518:     <div class="info-row"><strong>${escapeHtml(currentSession.name)}</strong></div>
519:     <div class="info-row">${currentSession.noteCount || 0} notes · ${currentSession.chordCount || 0} accords · ${duration}</div>
520:     <div class="info-row">${currentSession.key || 'Tonalité non définie'} · ${currentSession.tempo || '—'} BPM</div>
521:     <div class="info-row">${escapeHtml(currentSession.comments || '')}</div>
522:     <div class="info-tags">${(currentSession.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
523:   `;
524: }
525: 
526: function resetSelectedSessionInfo() {
527:   if (!els.selectedSessionInfo) return;
528:   els.selectedSessionInfo.innerHTML = `<p class="detail-hint">Aucune session sélectionnée. Créez une nouvelle session ou choisissez-en une dans la liste.</p>`;
529: }
530: 
531: function formatDuration(seconds) {
532:   if (!seconds || isNaN(seconds)) return '00:00';
533:   const total = Math.floor(Number(seconds));
534:   const mins = String(Math.floor(total / 60)).padStart(2, '0');
535:   const secs = String(total % 60).padStart(2, '0');
536:   return `${mins}:${secs}`;
537: }
538: 
539: function escapeHtml(str) {
540:   return String(str)
541:     .replace(/&/g, '&amp;')
542:     .replace(/</g, '&lt;')
543:     .replace(/>/g, '&gt;')
544:     .replace(/"/g, '&quot;');
545: }
546: 
547: export function setRecordingNotation(notation) {
548:   currentNotation = notation;
549:   setAnalyzerNotation(notation);
550: }
551: 
552: function bindAnalyzeButton() {
553:   if (!els.analyzeSessionBtn) return;
554:   els.analyzeSessionBtn.addEventListener('click', async () => {
555:     if (!currentSession || !currentEvents.length) return;
556:     await runAnalysis();
557:   });
558: }
559: 
560: async function runAnalysis() {
561:   if (!els.analysisContent || !currentSession || !currentEvents.length) return;
562:   setAnalyzerNotation(currentNotation);
563:   await renderAnalysis(currentSession.id, currentEvents, currentSession, els.analysisContent);
564: }
565: 
566: let transportRafId = null;
567: 
568: function bindTransportBar() {
569:   if (!els.transportBar) return;
570: 
571:   els.transportRewind?.addEventListener('click', () => {
572:     player?.stop();
573:     updateTransportUI();
574:   });
575: 
576:   els.transportPlay?.addEventListener('click', () => {
577:     if (!player) return;
578:     if (player.isPlaying) {
579:       player.pause();
580:     } else {
581:       if (player.getCurrentTime() >= player.getDuration()) {
582:         player.stop();
583:       }
584:       player.play();
585:     }
586:     updateTransportUI();
587:     if (player.isPlaying) startTransportLoop();
588:   });
589: 
590:   els.transportSlider?.addEventListener('input', () => {
591:     const duration = player?.getDuration() || 0;
592:     const val = Number(els.transportSlider.value);
593:     // Mise à jour visuelle uniquement pendant le drag ; le son se déclenche au mouseup.
594:     updateTransportSliderOnly((val / 100) * duration, duration);
595:   });
596: 
597:   els.transportSlider?.addEventListener('change', () => {
598:     const duration = player?.getDuration() || 0;
599:     const val = Number(els.transportSlider.value);
600:     player?.seek((val / 100) * duration);
601:   });
602: }
603: 
604: function startTransportLoop() {
605:   if (transportRafId) cancelAnimationFrame(transportRafId);
606:   function loop() {
607:     if (!player || !player.isPlaying) {
608:       updateTransportUI();
609:       transportRafId = null;
610:       return;
611:     }
612:     updateTransportUI();
613:     transportRafId = requestAnimationFrame(loop);
614:   }
615:   transportRafId = requestAnimationFrame(loop);
616: }
617: 
618: function updateTransportSliderOnly(cur, dur) {
619:   if (!els.transportBar || !els.transportSlider) return;
620:   els.transportSlider.value = dur > 0 ? String((cur / dur) * 100) : '0';
621: }
622: 
623: function updateTransportUI() {
624:   if (!els.transportBar) return;
625:   const dur = player?.getDuration() || 0;
626:   const cur = player?.getCurrentTime() || 0;
627:   updateTransportSliderOnly(cur, dur);
628:   if (els.transportPlay) {
629:     els.transportPlay.textContent = player?.isPlaying ? '⏸' : '▶';
630:   }
631: }

(End of file - total 631 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ui/voicing-preview.js",
  "limit": 80
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ui/voicing-preview.js</path>
<type>file</type>
<content>
1: // Phase 1.5A — Read-Only Close Voicing Text Preview.
2: // Phase 2B — Close/Simple style selector.
3: // Ce module UI est la seule couche autorisée à importer le moteur de voicing.
4: // Aucune règle musicale n’est déplacée ici : l’UI se contente d’adapter,
5: // formater et rendre le résultat immuable produit par generateVoicing().
6: 
7: import { parseChordSymbol } from '../chord-engine/chord-display.js';
8: import { midiToNoteName, NOTE_NAMING_POLICY } from '../voicing-engine/midi-convention.js';
9: import { generateVoicing } from '../voicing-engine/generate-voicing.js';
10: 
11: /**
12:  * @typedef {import('../voicing-engine/generate-voicing.js').VoicingResult} VoicingResult
13:  */
14: 
15: const CONTAINER_ID = 'analyzer-voicing-preview';
16: const SELECTOR_CONTAINER_ID = 'analyzer-voicing-style-selector';
17: const CONTENT_ID = 'analyzer-voicing-content';
18: const STORAGE_KEY = 'piano-jazz-chords:notation-sharps';
19: const VOICING_STYLE_KEY = 'piano-jazz-chords.voicing-style';
20: 
21: let currentVoicingStyle = 'close';
22: let voicingStyleInitialized = false;
23: 
24: function getLocalStorage() {
25:   return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;
26: }
27: 
28: export function normalizeVoicingStyle(raw) {
29:   if (raw === 'simple') return 'simple';
30:   return 'close';
31: }
32: 
33: export function getVoicingStyle() {
34:   return currentVoicingStyle;
35: }
36: 
37: export function setVoicingStyle(rawStyle) {
38:   const normalizedStyle = normalizeVoicingStyle(rawStyle);
39:   currentVoicingStyle = normalizedStyle;
40: 
41:   try {
42:     getLocalStorage()?.setItem(VOICING_STYLE_KEY, normalizedStyle);
43:   } catch {
44:     // La préférence reste active pour la session courante.
45:   }
46: 
47:   return normalizedStyle;
48: }
49: 
50: export function selectVoicingStyle(rawStyle) {
51:   const newStyle = normalizeVoicingStyle(rawStyle);
52:   const previousStyle = currentVoicingStyle;
53: 
54:   if (newStyle === previousStyle) {
55:     updateVoicingStyleSelector(previousStyle);
56:     return false;
57:   }
58: 
59:   setVoicingStyle(newStyle);
60:   updateVoicingStyleSelector(newStyle);
61:   rerenderActiveVoicing();
62:   return true;
63: }
64: 
65: export function updateVoicingStyleSelector(selectedStyle) {
66:   const container = document.getElementById(SELECTOR_CONTAINER_ID);
67:   if (!container) return;
68:   const buttons = container.querySelectorAll('[data-voicing-style]');
69:   buttons.forEach((btn) => {
70:     const isActive = btn.dataset.voicingStyle === selectedStyle;
71:     btn.setAttribute('aria-pressed', String(isActive));
72:     btn.classList.toggle('active', isActive);
73:   });
74: }
75: 
76: export function renderVoicingStyleSelector(container, currentStyle, onChange) {
77:   const selectorContainer = document.getElementById(SELECTOR_CONTAINER_ID);
78:   if (!selectorContainer) return;
79:   if (selectorContainer.dataset.voicingListenersAttached === 'true') return;
80: 

(Showing lines 1-80 of 397. Use offset=81 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/ui/mini-keyboard.js"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/ui/mini-keyboard.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Mini-clavier SVG pédagogique pour un accord.
2: // Affiche environ 2 octaves (C4–B5 par défaut), touches blanches alignées,
3: // touches noires positionnées réalistes entre les blanches, notes actives en rouge.
4: // Retourne aussi la liste textuelle des notes pour affichage en dessous.
5: 
6: const WHITE_WIDTH = 20;
7: const WHITE_HEIGHT = 80;
8: const BLACK_WIDTH = 12;
9: const BLACK_HEIGHT = 50;
10: const START_MIDI = 60;    // C4
11: const END_MIDI = 83;      // B5
12: const WHITE_RADIUS = 3;
13: const BLACK_RADIUS = 2;
14: 
15: const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
16: const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
17: const LATIN_SHARP = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
18: const LATIN_FLAT = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
19: 
20: function midiToNoteName(midi, useSharps = true, latin = false) {
21:   const pc = midi % 12;
22:   const octave = Math.floor(midi / 12) - 1;
23:   const names = latin
24:     ? (useSharps ? LATIN_SHARP : LATIN_FLAT)
25:     : (useSharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT);
26:   return `${names[pc]}${octave}`;
27: }
28: 
29: function isBlackKey(midi) {
30:   return [1, 3, 6, 8, 10].includes(midi % 12);
31: }
32: 
33: function whiteKeyIndex(midi, startMidi) {
34:   let count = 0;
35:   for (let i = startMidi; i < midi; i++) {
36:     if (!isBlackKey(i)) count++;
37:   }
38:   return count;
39: }
40: 
41: function blackKeyX(midi, startMidi) {
42:   const pc = midi % 12;
43:   const prevWhiteIndex = whiteKeyIndex(midi, startMidi) - 1; // index de la blanche précédente
44:   const baseX = (prevWhiteIndex + 1) * WHITE_WIDTH; // bord droit de la blanche précédente
45:   const offsets = {
46:     1: -BLACK_WIDTH * 0.35, // C# proche de D
47:     3: -BLACK_WIDTH * 0.65, // D# proche de E
48:     6: -BLACK_WIDTH * 0.30, // F# proche de G
49:     8: -BLACK_WIDTH * 0.50, // G# centré
50:     10: -BLACK_WIDTH * 0.70, // A# proche de B
51:   };
52:   return baseX + offsets[pc];
53: }
54: 
55: export function generateMiniKeyboard(activeNotes = [], options = {}) {
56:   const start = options.startMidi ?? START_MIDI;
57:   const end = options.endMidi ?? END_MIDI;
58:   const activeSet = new Set(activeNotes.map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
59: 
60:   // S'assurer que start est une note blanche pour l'alignement
61:   let firstWhite = start;
62:   while (isBlackKey(firstWhite) && firstWhite <= end) firstWhite++;
63:   let lastWhite = end;
64:   while (isBlackKey(lastWhite) && lastWhite >= start) lastWhite--;
65: 
66:   const whites = [];
67:   for (let midi = firstWhite; midi <= lastWhite; midi++) {
68:     if (!isBlackKey(midi)) whites.push(midi);
69:   }
70:   const whiteCount = whites.length || 1;
71: 
72:   const width = whiteCount * WHITE_WIDTH;
73:   const height = WHITE_HEIGHT;
74: 
75:   let markup = '';
76: 
77:   // Touches blanches
78:   whites.forEach((midi, index) => {
79:     const x = index * WHITE_WIDTH;
80:     const active = activeSet.has(midi);
81:     const fill = active ? 'var(--mini-key-active, #ef4444)' : '#ffffff';
82:     const stroke = active ? '#991b1b' : '#9ca3af';
83:     const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
84:     markup += `<rect data-midi="${midi}" x="${x}" y="0" width="${WHITE_WIDTH}" height="${WHITE_HEIGHT}" rx="${WHITE_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 1.5 : 0.5}"${title}/>`;
85:   });
86: 
87:   // Touches noires
88:   for (let midi = firstWhite; midi <= lastWhite; midi++) {
89:     if (!isBlackKey(midi)) continue;
90:     const x = blackKeyX(midi, firstWhite);
91:     if (x < 0 || x + BLACK_WIDTH > width) continue;
92:     const active = activeSet.has(midi);
93:     const fill = active ? 'var(--mini-key-active, #ef4444)' : '#1f2937';
94:     const stroke = active ? '#991b1b' : '#000000';
95:     const title = active ? ` title="${midiToNoteName(midi, true, false)}"` : '';
96:     markup += `<rect data-midi="${midi}" x="${x}" y="0" width="${BLACK_WIDTH}" height="${BLACK_HEIGHT}" rx="${BLACK_RADIUS}" fill="${fill}" stroke="${stroke}" stroke-width="${active ? 1.5 : 0.5}"${title}/>`;
97:   }
98: 
99:   const svg = `\n<svg class="mini-keyboard" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${markup}</svg>\n`;
100:   const noteNames = activeNotes
101:     .filter((n) => typeof n === 'number')
102:     .sort((a, b) => a - b)
103:     .map((n) => midiToNoteName(n, true, false));
104:   return { svg, noteNames };
105: }
106: 
107: export function miniKeyboardForNotes(activeNotes, centerMidi = 60) {
108:   // Choisit une fenêtre de 2 octaves parmi C3–B4 (48–71) ou C4–B5 (60–83)
109:   // selon la tessiture des notes, comme demandé par l'interface.
110:   if (!Array.isArray(activeNotes) || activeNotes.length === 0) {
111:     return { svg: generateMiniKeyboard([], { startMidi: 60, endMidi: 83 }).svg, noteNames: [] };
112:   }
113:   const min = Math.min(...activeNotes);
114:   const max = Math.max(...activeNotes);
115:   // Si au moins une note est en dessous de C4, on descend à C3–B4
116:   const startMidi = min < 60 ? 48 : 60;
117:   return generateMiniKeyboard(activeNotes, { startMidi, endMidi: startMidi + 23 });
118: }

(End of file - total 118 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 6.1s)

_Thinking:_

Let me now read a few more critical files to complete the audit, particularly the remaining analyzer files and the Python harmony engine.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/alternatives.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/alternatives.js</path>
<type>file</type>
<content>
1: import { formatPc } from '../chord-engine/naming.js';
2: import { midiToNoteName, noteNameToMidi } from '../chord-engine/intervals.js';
3: 
4: // [Claude] — 2026-07-03 — Génération de voicings alternatifs pour un accord.
5: // Objectif : proposer 2 à 3 versions conservant les notes communes et minimisant les déplacements.
6: export function generateAlternatives(result, latin = false) {
7:   if (!result || !result.intervals?.length) return [];
8: 
9:   const alternatives = [];
10:   const rootPc = result.rootPc;
11:   const intervals = result.intervals;
12:   const bassPc = result.bassPc;
13: 
14:   // Close position : fondamentale en bas, notes empilées.
15:   const closeNotes = intervals.map((i) => (rootPc + i) % 12);
16:   alternatives.push({
17:     name: `${formatPc(rootPc, latin)} close position`,
18:     notes: closeNotes.map((pc) => formatPc(pc, latin)),
19:     midiNotes: closeNotes.map((pc) => pc + 60),
20:   });
21: 
22:   // Drop 2 : retirer la 2ème note en partant du haut et la descendre d'une octave.
23:   if (intervals.length >= 4) {
24:     const drop2Notes = [...closeNotes];
25:     const secondFromTopIndex = drop2Notes.length - 2;
26:     const dropped = drop2Notes.splice(secondFromTopIndex, 1)[0];
27:     drop2Notes.push((dropped + 12 - 12) % 12);
28:     alternatives.push({
29:       name: `${formatPc(rootPc, latin)} drop 2`,
30:       notes: drop2Notes.map((pc) => formatPc(pc, latin)),
31:       midiNotes: drop2Notes.map((pc) => pc + 60),
32:     });
33:   }
34: 
35:   // Spread voicing : disperser les notes pour un son plus ouvert.
36:   if (intervals.length >= 4) {
37:     const spreadNotes = closeNotes.map((pc, index) =>
38:       index % 2 === 1 ? (pc + 12) % 12 : pc
39:     );
40:     alternatives.push({
41:       name: `${formatPc(rootPc, latin)} spread`,
42:       notes: spreadNotes.map((pc) => formatPc(pc, latin)),
43:       midiNotes: spreadNotes.map((pc) => pc + 60),
44:     });
45:   }
46: 
47:   return alternatives.filter((alt) => alt.notes.length >= 3);
48: }

(End of file - total 48 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/substitutions.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/substitutions.js</path>
<type>file</type>
<content>
1: import { detectChord } from '../chord-engine/index.js';
2: import { isDominantSymbol, isMinorSymbol } from './harmonic-utils.js';
3: 
4: // [Claude] — 2026-07-03 — Détection basique de substitutions harmoniques.
5: // Pour l'instant, on repère les cas classiques à partir de l'accord courant et du précédent.
6: export function findSubstitutions(prevResult, currentResult) {
7:   if (!currentResult) return [];
8: 
9:   const substitutions = [];
10:   const root = currentResult.rootPc;
11:   const symbol = currentResult.symbol;
12:   const intervals = currentResult.intervals || [];
13:   const isDom = isDominantSymbol(symbol);
14:   const isMin = isMinorSymbol(symbol);
15: 
16:   // Substitution tritonique : un accord dominant dont la fondamentale est un triton de la dominante attendue.
17:   // Exemple : Db7 remplace G7 dans une cadence V-I en C.
18:   if (isDom) {
19:     substitutions.push({
20:       type: 'tritone',
21:       label: 'Substitution tritonique possible',
22:       description:
23:         'Cet accord dominant peut remplacer la dominante située un triton au-dessus ou en dessous.',
24:     });
25:   }
26: 
27:   // Dominante secondaire : un accord dominant résolvant vers un degré autre que la tonique.
28:   // Détectée si l'accord précédent forme un intervalle de quinte descendante vers l'accord courant.
29:   if (
30:     prevResult &&
31:     isDom
32:   ) {
33:     const prevRoot = prevResult.rootPc;
34:     const fifthUp = (prevRoot + 7) % 12;
35:     if (fifthUp === root) {
36:       substitutions.push({
37:         type: 'secondary-dominant',
38:         label: 'Dominante secondaire',
39:         description:
40:           "L'accord précédent fonctionne comme la dominante (V) de cet accord.",
41:       });
42:     }
43:   }
44: 
45:   // Accord de passage chromatique : accord dominant d'une demi-ton au-dessus/dessous
46:   // situé entre deux accords diatoniques. Ici, on signale juste la possibilité.
47:   if (isDom && intervals.includes(10)) {
48:     substitutions.push({
49:       type: 'passing',
50:       label: 'Accord de passage chromatique',
51:       description:
52:         "Cet accord dominant peut servir de passage chromatique entre deux degrés voisins.",
53:     });
54:   }
55: 
56:   return substitutions;
57: }

(End of file - total 57 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-utils.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-utils.js</path>
<type>file</type>
<content>
1: // [Claude] — 2026-07-07 — Utilitaires harmoniques partagés entre analyseurs.
2: // Centralise la logique de classification d'accords (dominante, mineur, majeur)
3: // et les helpers de degrés pour éviter la duplication entre substitutions.js
4: // et harmonic-patterns.js.
5: 
6: export const DEGREE_NAMES_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
7: export const DEGREE_NAMES_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
8: 
9: export function isMinorSymbol(symbol) {
10:   if (!symbol) return false;
11:   return /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
12: }
13: 
14: export function isDominantSymbol(symbol) {
15:   if (!symbol || isMinorSymbol(symbol)) return false;
16:   return /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
17: }
18: 
19: export function isMajorSymbol(symbol) {
20:   return !isMinorSymbol(symbol) && !isDominantSymbol(symbol);
21: }
22: 
23: export function degreeOf(rootPc, keyPc) {
24:   return (rootPc - keyPc + 12) % 12;
25: }
26: 
27: export function degreeName(rootPc, keyPc, mode = 'major') {
28:   const degree = degreeOf(rootPc, keyPc);
29:   const names = mode === 'minor' ? DEGREE_NAMES_MINOR : DEGREE_NAMES_MAJOR;
30:   return names[degree] || String(degree);
31: }
32: 
33: export function formatChordBrief(chord) {
34:   if (!chord) return '—';
35:   const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
36:   const root = NOTE_NAMES[chord.rootPc % 12] || '?';
37:   const bass = chord.bassPc != null && chord.bassPc !== chord.rootPc
38:     ? `/${NOTE_NAMES[chord.bassPc % 12] || '?'}`
39:     : '';
40:   return `${root}${chord.symbol || ''}${bass}`;
41: }

(End of file - total 41 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/key-detector.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/key-detector.js</path>
<type>file</type>
<content>
1: import { formatNote, noteNameToPc } from '../chord-engine/intervals.js';
2: 
3: // [OpenCode] — 2026-07-05 — Détecteur de tonalité par profils Krumhansl-Schmuckler
4: // combiné à une heuristique sur les accords joués.
5: 
6: // Profils Krumhansl-Kessler pour la corrélation tonale (12 degrés, Do = index 0)
7: const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
8: const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
9: 
10: const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
11: const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
12: 
13: function rotate(arr, steps) {
14:   return arr.slice(steps).concat(arr.slice(0, steps));
15: }
16: 
17: function mean(arr) {
18:   return arr.reduce((a, b) => a + b, 0) / arr.length;
19: }
20: 
21: function stdDev(arr, m) {
22:   return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
23: }
24: 
25: function correlation(a, b) {
26:   const ma = mean(a);
27:   const mb = mean(b);
28:   const sa = stdDev(a, ma);
29:   const sb = stdDev(b, mb);
30:   if (sa === 0 || sb === 0) return 0;
31:   return a.reduce((sum, av, i) => sum + (av - ma) * (b[i] - mb), 0) / (a.length * sa * sb);
32: }
33: 
34: function buildPcHistogram(events) {
35:   const hist = new Array(12).fill(0);
36:   if (!events || events.length === 0) return hist;
37: 
38:   // Accumule la durée pondérée par vélocité pour chaque pitch class.
39:   const active = new Map(); // note -> { time, velocity }
40:   for (const e of events) {
41:     if (e.type === 'note_on') {
42:       active.set(e.note, { time: e.time, velocity: e.velocity ?? 0.8 });
43:     } else if (e.type === 'note_off') {
44:       const start = active.get(e.note);
45:       if (start) {
46:         const duration = Math.max(0, e.time - start.time);
47:         const weight = duration * (0.5 + start.velocity * 0.5);
48:         hist[e.note % 12] += weight;
49:         active.delete(e.note);
50:       }
51:     }
52:   }
53: 
54:   // Notes encore actives à la fin : comptabilisées avec la durée restante.
55:   const lastTime = events[events.length - 1]?.time || 0;
56:   for (const [note, start] of active) {
57:     const duration = Math.max(0, lastTime - start.time);
58:     const weight = duration * (0.5 + start.velocity * 0.5);
59:     hist[note % 12] += weight;
60:   }

(Showing lines 1-60 of 257. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/scorer.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/scorer.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Scoring de la qualité harmonique d'une session.
2: 
3: const MAJOR_SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11];
4: 
5: export function scoreSession(chords, keyPc = null) {
6:   if (!chords || chords.length === 0) {
7:     return {
8:       voiceLeading: { value: 0, comment: 'Aucun accord détecté' },
9:       transitions: { value: 0, comment: 'Aucune transition à évaluer' },
10:       tensions: { value: 0, comment: 'Aucune tension détectée' },
11:       innerVoices: { value: 0, comment: 'Pas de mouvement interne' },
12:     };
13:   }
14: 
15:   return {
16:     voiceLeading: scoreVoiceLeading(chords),
17:     transitions: scoreTransitions(chords, keyPc),
18:     tensions: scoreTensions(chords),
19:     innerVoices: scoreInnerVoices(chords),
20:   };
21: }
22: 
23: function scoreVoiceLeading(chords) {
24:   let totalMovement = 0;
25:   let count = 0;
26: 
27:   for (let i = 1; i < chords.length; i++) {
28:     const prev = chords[i - 1];
29:     const curr = chords[i];
30:     const prevRoot = prev.bassPc ?? prev.rootPc;
31:     const currRoot = curr.bassPc ?? curr.rootPc;
32:     const raw = Math.abs(currRoot - prevRoot);
33:     const movement = Math.min(raw, 12 - raw);
34:     totalMovement += movement;
35:     count++;
36:   }
37: 
38:   const avgMovement = count > 0 ? totalMovement / count : 0;
39:   // In jazz/gospel, stepwise or 4th/5th root movements are good.
40:   // 0-2 semitones = excellent, 3-4 = good, 5-6 = average, >6 = poor
41:   let value;
42:   if (avgMovement <= 2) value = 9 + (2 - avgMovement) / 2;
43:   else if (avgMovement <= 4) value = 7 + (4 - avgMovement);
44:   else if (avgMovement <= 6) value = 5 + (6 - avgMovement) / 2;
45:   else value = Math.max(0, 10 - (avgMovement - 6) * 1.5);
46:   value = Math.round(Math.min(10, value) * 10) / 10;
47: 
48:   let comment = 'Mouvements de voix corrects';
49:   if (value >= 8) comment = 'Mouvements de voix fluides';
50:   else if (value <= 4) comment = 'Mouvements de voix abrupts';
51: 
52:   return { value, comment };
53: }
54: 
55: function scoreTransitions(chords, keyPc) {
56:   let good = 0;
57:   let count = 0;
58: 
59:   const isFifthDown = (fromRoot, toRoot) => {
60:     const diff = (toRoot - fromRoot + 12) % 12;

(Showing lines 1-60 of 130. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/voice-leading.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/voice-leading.js</path>
<type>file</type>
<content>
1: import { detectChord } from '../chord-engine/index.js';
2: 
3: // [Claude] — 2026-07-03 — Calcul du voice leading entre deux accords.
4: // Chaque note de l'accord précédent est associée à la note la plus proche de l'accord suivant
5: // en termes de classes de hauteur. On minimise le mouvement total.
6: export function buildVoiceLeading(fromNotes, toNotes) {
7:   if (!fromNotes?.length || !toNotes?.length) return null;
8: 
9:   const fromPcs = [...new Set(fromNotes.map((n) => n % 12))].sort((a, b) => a - b);
10:   const toPcs = [...new Set(toNotes.map((n) => n % 12))].sort((a, b) => a - b);
11: 
12:   const movements = [];
13:   let totalMovement = 0;
14: 
15:   // Greedy matching: for each source pitch class, find closest destination pitch class
16:   const used = new Set();
17:   for (const fromPc of fromPcs) {
18:     let bestTo = null;
19:     let bestDistance = Infinity;
20: 
21:     for (const toPc of toPcs) {
22:       if (used.has(toPc)) continue;
23:       const rawDistance = Math.abs(toPc - fromPc);
24:       const distance = Math.min(rawDistance, 12 - rawDistance);
25:       if (distance < bestDistance) {
26:         bestDistance = distance;
27:         bestTo = toPc;
28:       }
29:     }
30: 
31:     if (bestTo !== null) {
32:       used.add(bestTo);
33:       const rawSemitones = bestTo - fromPc;
34:       const signedSemitones =
35:         rawSemitones > 6 ? rawSemitones - 12 : rawSemitones < -6 ? rawSemitones + 12 : rawSemitones;
36:       movements.push({ from: fromPc, to: bestTo, semitones: signedSemitones });
37:       totalMovement += Math.abs(signedSemitones);
38:     } else {
39:       movements.push({ from: fromPc, to: null, semitones: 0 });
40:     }
41:   }
42: 
43:   return { movements, totalMovement };
44: }
45: 
46: // [Claude] — 2026-07-03 — Score de fluidité : inversement proportionnel au mouvement total.
47: // Moins les voix bougent inutilement, plus le score est élevé.
48: export function buildFluidityScore(voiceLeadings, maxMovement = 24) {
49:   if (!voiceLeadings?.length) return null;
50:   const total = voiceLeadings.reduce((sum, vl) => sum + (vl?.totalMovement || 0), 0);
51:   const average = total / voiceLeadings.length;
52:   const normalized = Math.min(average / maxMovement, 1);
53:   return Math.round((1 - normalized) * 100);
54: }
55: 
56: // [Claude] — 2026-07-03 — Score de tension : proportion de notes de tension (9/11/13/altérations)
57: // par rapport aux notes de base de l'accord.
58: export function buildTensionScore(results) {
59:   if (!results?.length) return null;
60:   let totalTension = 0;

(Showing lines 1-60 of 112. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-patterns.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/harmonic-patterns.js</path>
<type>file</type>
<content>
1: // [Claude] — 2026-07-07 — Détection des patterns harmoniques : degrés, cadences, II-V-I,
2: // turnarounds et substitutions. Utilisé par l'analyseur de session pour enrichir le rapport pédagogique.
3: 
4: import {
5:   degreeName,
6:   degreeOf,
7:   isDominantSymbol,
8:   isMajorSymbol,
9:   isMinorSymbol,
10:   formatChordBrief,
11: } from './harmonic-utils.js';
12: 
13: export function enrichChordsWithDegrees(chords, key) {
14:   if (!key || chords.length === 0) return chords;
15: 
16:   return chords.map((chord) => {
17:     const degree = degreeName(chord.rootPc, key.pc, key.mode);
18:     const functionType = isDominantSymbol(chord.symbol)
19:       ? 'dominant'
20:       : isMinorSymbol(chord.symbol)
21:         ? 'minor'
22:         : 'major';
23:     return { ...chord, degree, functionType };
24:   });
25: }
26: 
27: export function detectII_V_I(chords, key) {
28:   if (!key || chords.length < 3) return [];
29: 
30:   const patterns = [];
31:   for (let i = 0; i <= chords.length - 3; i++) {
32:     const a = chords[i];
33:     const b = chords[i + 1];
34:     const c = chords[i + 2];
35: 
36:     // Degrés attendus : II -> V -> I (ou ii -> V7 -> Imaj7)
37:     const degA = degreeOf(a.rootPc, key.pc);
38:     const degB = degreeOf(b.rootPc, key.pc);
39:     const degC = degreeOf(c.rootPc, key.pc);
40: 
41:     const isII = degA === 2 && isMinorSymbol(a.symbol);
42:     const isV = degB === 7 && isDominantSymbol(b.symbol);
43:     const isI = degC === 0 && isMajorSymbol(c.symbol);
44: 
45:     if (isII && isV && isI) {
46:       patterns.push({
47:         type: 'ii-v-i',
48:         startIndex: i,
49:         endIndex: i + 2,
50:         chords: [a, b, c],
51:         description: `${formatChordBrief(a)} → ${formatChordBrief(b)} → ${formatChordBrief(c)} forme un II-V-I en ${key.name}.`,
52:       });
53:     }
54:   }
55:   return patterns;
56: }
57: 
58: export function detectCadences(chords, key) {
59:   if (!key || chords.length < 2) return [];
60: 

(Showing lines 1-60 of 218. Use offset=61 to continue.)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 5.9s)

_Thinking:_

Let me now read a few more files to complete the audit, particularly the remaining analyzer files and the Python harmonyengine.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/segmenter.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/segmenter.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Segmentation simple d'une session en sections musicales.
2: // Utilise les silences et la répétition des progressions comme heuristiques.
3: 
4: const MIN_SECTION_DURATION = 6; // secondes
5: const SILENCE_THRESHOLD = 1.5; // secondes
6: 
7: export function segment(chords, totalDuration) {
8:   if (!chords || chords.length === 0) {
9:     return [];
10:   }
11: 
12:   const boundaries = findBoundaries(chords, totalDuration);
13:   const sections = [];
14: 
15:   for (let i = 0; i < boundaries.length - 1; i++) {
16:     const start = boundaries[i];
17:     const end = boundaries[i + 1];
18:     if (end - start < MIN_SECTION_DURATION && i !== 0) continue;
19: 
20:     const indices = chords
21:       .map((c, idx) => (c.time >= start && c.time < end ? idx : -1))
22:       .filter((idx) => idx !== -1);
23: 
24:     // Also include chords that started slightly before but extend into this section
25:     chords.forEach((c, idx) => {
26:       if (c.time < start && c.endTime > start && !indices.includes(idx)) {
27:         indices.push(idx);
28:       }
29:     });
30:     indices.sort((a, b) => a - b);
31: 
32:     sections.push({
33:       start,
34:       end,
35:       label: guessLabel(sections, i, end - start, totalDuration),
36:       chordIndices: indices,
37:     });
38:   }
39: 
40:   // Merge very short sections
41:   return mergeShortSections(sections, totalDuration);
42: }
43: 
44: function findBoundaries(chords, totalDuration) {
45:   const boundaries = new Set([0]);
46: 
47:   // Boundaries from silence gaps
48:   for (let i = 0; i < chords.length - 1; i++) {
49:     const gap = chords[i + 1].time - chords[i].endTime;
50:     if (gap >= SILENCE_THRESHOLD) {
51:       boundaries.add(Math.round(chords[i].endTime * 10) / 10);
52:     }
53:   }
54: 
55:   // Periodicity boundary: if a progression repeats, mark its start
56:   const progressionSignatures = chords.map((c) => `${c.rootPc}:${c.symbol}:${c.bassPc ?? ''}`);
57:   for (let length = 2; length <= 8; length++) {
58:     for (let start = 0; start < progressionSignatures.length - length * 2; start++) {
59:       const first = progressionSignatures.slice(start, start + length).join('|');
60:       const second = progressionSignatures.slice(start + length, start + length * 2).join('|');

(Showing lines 1-60 of 109. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/chord-timeline.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/chord-timeline.js</path>
<type>file</type>
<content>
1: import { detectChord } from '../chord-engine/index.js';
2: 
3: // [OpenCode] — 2026-07-06 — Construit une timeline d'accords à partir d'événements MIDI.
4: // Pattern COLLECT-PUIS-ANALYSE synchrone : les notes sont regroupées par proximité temporelle,
5: // puis chaque groupe est analysé UNE SEULE FOIS quand il se stabilise.
6: 
7: const MIN_CHORD_DURATION = 0.2; // secondes, ignore les accords trop fugaces
8: const SILENCE_GAP = 0.5; // secondes de silence = coupure entre deux accords
9: const GRACE_NOTE_THRESHOLD = 0.2; // secondes, notes jouées moins longtemps sont taguées grace notes
10: const COLLECT_WINDOW = 0.18; // fenêtre de collecte en secondes (180ms)
11: const MELODIC_RATIO_THRESHOLD = 0.15; // Partie 1.4
12: 
13: export function buildChordTimeline(events, options = {}) {
14:   const minDuration = options.minDuration ?? MIN_CHORD_DURATION;
15:   const silenceGap = options.silenceGap ?? SILENCE_GAP;
16:   const collectWindow = options.collectWindow ?? COLLECT_WINDOW;
17: 
18:   const sorted = [...events].filter((e) => e != null).sort((a, b) => a.time - b.time);
19: 
20:   // ── Détection du caractère mélodique de la session ──
21:   const melodicProfile = computeMelodicProfile(sorted);
22:   const isMelodic = melodicProfile.ratio < MELODIC_RATIO_THRESHOLD;
23: 
24:   if (isMelodic) {
25:     return {
26:       isMelodic: true,
27:       chords: [],
28:       melodyLine: melodicProfile.melodyLine,
29:       noteGroups: melodicProfile.groups,
30:     };
31:   }
32: 
33:   // ── Phase 1 : Collecte synchrone des groupes de notes ──
34:   // On construit des "note groups" : ensembles de notes actives pendant une période.
35:   const rawGroups = collectNoteGroups(sorted, collectWindow);
36: 
37:   // ── Phase 2 : Analyse de chaque groupe stable ──
38:   const chords = [];
39:   let lastChord = null;
40:   let pendingGraceNotes = new Set();
41: 
42:   for (const group of rawGroups) {
43:     const notes = group.activeNotes;
44:     if (notes.length < 3) {
45:       // Pas assez de notes : possiblement un silence ou une ligne mélodique isolée
46:       if (lastChord) {
47:         const nextTime = group.startTime;
48:         if (nextTime - (lastChord.time + lastChord.duration) >= silenceGap) {
49:           lastChord = null;
50:         }
51:       }
52:       continue;
53:     }
54: 
55:     // Grace notes : notes tenues moins longtemps que le seuil
56:     const graceNotes = new Set();
57:     for (const n of notes) {
58:       const held = group.endTime - n.onTime;
59:       if (held < GRACE_NOTE_THRESHOLD && held >= 0) {
60:         graceNotes.add(n.midi);

(Showing lines 1-60 of 243. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/chord-comparator.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/chord-comparator.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Comparateur de grilles pour le Coach de Studio.
2: // Compare une grille de référence (saisie manuelle ou import) avec les accords joués.
3: // Phase 1 : parsing texte + structure. Phase 2 : IA pour le feedback.
4: 
5: export function parseChordGrid(text) {
6:   if (!text || typeof text !== 'string') return [];
7:   const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
8:   const chords = [];
9:   for (const line of lines) {
10:     const trimmed = line.trim();
11:     const parts = trimmed.split(/\s+/);
12:     for (const part of parts) {
13:       const parsed = parseChordSymbol(part);
14:       if (parsed) chords.push(parsed);
15:     }
16:   }
17:   return chords;
18: }
19: 
20: const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
21: 
22: function formatChordName(chord) {
23:   if (!chord) return '—';
24:   const root = NOTE_NAMES[chord.rootPc % 12] || '?';
25:   return `${root}${chord.symbol || ''}`;
26: }
27: 
28: function parseChordSymbol(str) {
29:   const match = str.match(/^([A-Ga-g][#b]?)(.*)$/);
30:   if (!match) return null;
31:   const rootStr = match[1];
32:   const symbol = match[2] || '';
33:   const pcMap = {
34:     C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
35:     E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
36:     Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
37:   };
38:   const rootPc = pcMap[rootStr];
39:   if (rootPc == null) return null;
40:   return { rootPc, symbol: symbol || '', name: formatChordName({ rootPc, symbol }) };
41: }
42: 
43: export function compareGridToPlayed(referenceGrid, playedChords) {
44:   if (!referenceGrid.length || !playedChords.length) return { matches: 0, total: 0, feedback: [] };
45: 
46:   const feedback = [];
47:   const maxLen = Math.max(referenceGrid.length, playedChords.length);
48: 
49:   for (let i = 0; i < maxLen; i++) {
50:     const ref = referenceGrid[i];
51:     const played = playedChords[i];
52:     if (!ref || !played) {
53:       feedback.push({
54:         index: i,
55:         ref: ref ? formatChordName(ref) : '—',
56:         played: played ? formatChordName(played) : '—',
57:         match: false,
58:         comment: !ref ? 'Accord joué non attendu' : 'Accord attendu non joué',
59:       });
60:       continue;

(Showing lines 1-60 of 89. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/bass-harmonic-relation.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/bass-harmonic-relation.js</path>
<type>file</type>
<content>
1: import { formatNote } from '../chord-engine/intervals.js';
2: import { slashName, inversionName } from '../chord-engine/naming.js';
3: 
4: const NOTE_PCS = {
5:   'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
6:   'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
7:   'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
8: };
9: 
10: const CHORD_QUALITY_PATTERNS = [
11:   { quality: 'min', suffixes: ['m', 'min', '-'] },
12:   { quality: 'maj7', suffixes: ['maj7', 'M7'] },
13:   { quality: 'min7', suffixes: ['m7', 'min7', '-7'] },
14:   { quality: 'dom7', suffixes: ['7'] },
15:   { quality: 'dim', suffixes: ['dim', '°', 'o'] },
16:   { quality: 'aug', suffixes: ['aug', '+'] },
17:   { quality: 'sus2', suffixes: ['sus2'] },
18:   { quality: 'sus4', suffixes: ['sus4'] },
19: ];
20: 
21: const QUALITY_INTERVALS = {
22:   '':         [0, 4, 7],               // major triad
23:   'maj':      [0, 4, 7],               // major triad
24:   'min':      [0, 3, 7],               // minor triad
25:   'maj7':     [0, 4, 7, 11],           // major 7
26:   'min7':     [0, 3, 7, 10],           // minor 7
27:   'dom7':     [0, 4, 7, 10],           // dominant 7
28:   'dim':      [0, 3, 6],               // diminished
29:   'aug':      [0, 4, 8],               // augmented
30:   'sus2':     [0, 2, 7],               // sus2
31:   'sus4':     [0, 5, 7],               // sus4
32: };
33: 
34: function parseChordName(chordName) {
35:   if (!chordName || typeof chordName !== 'string') return null;
36:   if (chordName.length >= 2 && chordName.slice(0, 2) in NOTE_PCS) {
37:     return chordName.slice(0, 2);
38:   }
39:   if (chordName[0] in NOTE_PCS) {
40:     return chordName[0];
41:   }
42:   return null;
43: }
44: 
45: function parseChordQuality(chordName, rootName) {
46:   const rest = chordName.slice(rootName.length).toLowerCase();
47:   if (!rest) return '';
48:   for (const { quality, suffixes } of CHORD_QUALITY_PATTERNS) {
49:     for (const suffix of suffixes) {
50:       if (rest === suffix || rest.startsWith(suffix)) {
51:         return quality;
52:       }
53:     }
54:   }
55:   // Default: treat as major if just root
56:   if (rest === '') return '';
57:   // Unknown quality, return as-is
58:   return rest;
59: }
60: 

(Showing lines 1-60 of 269. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/midi-exporter.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/midi-exporter.js</path>
<type>file</type>
<content>
1: // [OpenCode] — 2026-07-04 — Export MIDI de l'analyse.
2: // Phase D : réexporte depuis analysis-export.js pour refléter les corrections manuelles.
3: import { exportAnalysisToMidi } from './analysis-export.js';
4: 
5: export { exportAnalysisToMidi };
6: export default exportAnalysisToMidi;

(End of file - total 6 lines)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/analyzer/analysis-export.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/analyzer/analysis-export.js</path>
<type>file</type>
<content>
1: import { buildMidiFileMultiTrack } from '../recorder/serializer.js';
2: import { getEffectiveChord, deriveChordDisplay, parseChordSymbol } from '../chord-engine/chord-display.js';
3: 
4: // ── Phase D : exports et statistiques basés sur effectiveChord ──
5: 
6: const DEFAULT_OPTIONS = {
7:   includeBass: true,
8:   includeChords: true,
9:   bassProgram: 33,
10:   chordProgram: 1,
11:   bassVelocity: 0.78,
12:   chordVelocity: 0.63,
13:   chordOctave: 4,
14:   slashBassOctave: 3,
15: };
16: 
17: function effectiveNotesForChord(chord, options = {}) {
18:   const opts = { ...DEFAULT_OPTIONS, ...options };
19:   const effectiveChordStr = getEffectiveChord(chord);
20:   const display = deriveChordDisplay(effectiveChordStr);
21: 
22:   if (!display.chordTonePcs.length) return [];
23: 
24:   const rootMidi = display.rootPc + (opts.chordOctave + 1) * 12;
25:   const notes = display.chordTonePcs.map((pc) => rootMidi + ((pc - display.rootPc + 12) % 12));
26: 
27:   // Slash chord : la basse doit être la note la plus grave.
28:   // Si elle est déjà dans l'accord, on retire l'instance existante et on la
29:   // place une octave en dessous. Sinon on l'ajoute simplement en dessous.
30:   if (display.bassPc != null && display.bassPc !== display.rootPc) {
31:     const bassIndex = notes.findIndex((midi) => (midi % 12) === display.bassPc);
32:     const bassMidi = display.bassPc + (opts.slashBassOctave + 1) * 12;
33:     if (bassIndex >= 0) {
34:       notes[bassIndex] = bassMidi;
35:     } else {
36:       notes.push(bassMidi);
37:     }
38:   }
39: 
40:   return notes.sort((a, b) => a - b);
41: }
42: 
43: export function buildAnalysisMidiEvents(analysis, options = {}) {
44:   const opts = { ...DEFAULT_OPTIONS, ...options };
45:   const bassSegments = analysis.bassSegments || [];
46:   const chords = analysis.chords || [];
47:   const tracks = [];
48: 
49:   if (opts.includeBass && bassSegments.length > 0) {
50:     const bassEvents = [];
51:     for (const seg of bassSegments) {
52:       bassEvents.push(
53:         { time: seg.startTime, type: 'note_on', note: seg.midi, velocity: opts.bassVelocity },
54:         { time: seg.endTime, type: 'note_off', note: seg.midi, velocity: 0 },
55:       );
56:     }
57:     tracks.push({
58:       name: 'Bass detected',
59:       channel: 0,
60:       program: opts.bassProgram,

(Showing lines 1-60 of 208. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/electron/harmony_engine/__init__.py"
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/electron/harmony_engine/__init__.py</path>
<type>file</type>
<content>
1: from .candidate import ChordCandidate, ObservationInput
2: from .templates import QUALITY_TEMPLATES, assert_template_invariants
3: from .voicing import VoicingType, voicing_cost
4: from .scoring import acoustic_score, total_score_with_gating
5: from .bass import compute_bass_pc, bass_score
6: from .style_profiles import StyleProfile, STYLE_PROFILES
7: from .structured_v1 import analyze_chord
8: 
9: __all__ = [
10:     "ChordCandidate",
11:     "ObservationInput",
12:     "QUALITY_TEMPLATES",
13:     "assert_template_invariants",
14:     "VoicingType",
15:     "voicing_cost",
16:     "acoustic_score",
17:     "total_score_with_gating",
18:     "compute_bass_pc",
19:     "bass_score",
20:     "StyleProfile",
21:     "STYLE_PROFILES",
22:     "analyze_chord",
23: ]

(End of file - total 23 lines)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 5.2s)

_Thinking:_

Let me now read a few more critical files to complete the audit, then compile the comprehensive report.

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/audio/media-engine.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/audio/media-engine.js</path>
<type>file</type>
<content>
1: // [Claude] — 2026-07-08 — Service audio minimal partagé entre Studio et Analyse.
2: // Pour l'instant, ce service encapsule l'import d'un fichier media et la lecture audio simple.
3: // Il est conçu pour évoluer vers un moteur complet commun aux deux onglets.
4: 
5: const SUPPORTED_FORMATS = ['mp3', 'wav', 'mp4', 'm4a', 'ogg', 'flac', 'aac', 'webm'];
6: 
7: export function isSupportedMediaFile(filePath) {
8:   const ext = (filePath.split('.').pop() || '').toLowerCase();
9:   return SUPPORTED_FORMATS.includes(ext);
10: }
11: 
12: export async function selectMediaFile() {
13:   if (!window.electronAPI?.studio?.selectFile) {
14:     throw new Error('Sélection de fichier non disponible');
15:   }
16:   return window.electronAPI.studio.selectFile();
17: }
18: 
19: /**
20:  * Crée un lecteur audio simple dans un conteneur DOM.
21:  * Retourne un objet { element, play, pause, seek, getCurrentTime, getDuration, destroy }.
22:  */
23: export function createAudioPlayer(container, wavPath, { onTimeUpdate, onEnded } = {}) {
24:   if (!container) {
25:     throw new Error('Conteneur de lecteur manquant');
26:   }
27: 
28:   const audio = document.createElement('audio');
29:   audio.controls = true;
30:   audio.src = wavPath;
31:   audio.style.width = '100%';
32:   container.innerHTML = '';
33:   container.appendChild(audio);
34: 
35:   let rafId = null;
36: 
37:   function notifyTime() {
38:     onTimeUpdate?.(audio.currentTime, audio.duration);
39:   }
40: 
41:   function startLoop() {
42:     stopLoop();
43:     function loop() {
44:       notifyTime();
45:       rafId = requestAnimationFrame(loop);
46:     }
47:     rafId = requestAnimationFrame(loop);
48:   }
49: 
50:   function stopLoop() {
51:     if (rafId) {
52:       cancelAnimationFrame(rafId);
53:       rafId = null;
54:     }
55:   }
56: 
57:   audio.addEventListener('play', startLoop);
58:   audio.addEventListener('pause', stopLoop);
59:   audio.addEventListener('ended', () => {
60:     stopLoop();

(Showing lines 1-60 of 90. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/audio/simple-synth.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/audio/simple-synth.js</path>
<type>file</type>
<content>
1: const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
2: const activeOscillators = new Map();
3: let synthMode = 'piano';
4: 
5: // [Claude] — 2026-07-07 — Bus de sortie permanent du synthé.
6: // Toutes les notes passent par ce gain, qui est branché sur la destination système.
7: // Pour l'enregistrement Studio, on branche temporairement une MediaStreamDestination
8: // sur ce bus au moment de l'appel à getMediaStream().
9: const synthOutput = audioCtx.createGain();
10: synthOutput.connect(audioCtx.destination);
11: 
12: export function midiToFrequency(midi) {
13:   return 440 * Math.pow(2, (midi - 69) / 12);
14: }
15: 
16: const MAX_OSC_FREQUENCY = 20000; // Marge sous la limite Web Audio nominale (24000 Hz)
17: const MIN_MIDI_NOTE = 12;        // C0 — rejette la note 0 et les infrasons en dessous
18: 
19: function clampOscFrequency(freq) {
20:   return Math.min(Math.max(freq, 20), MAX_OSC_FREQUENCY);
21: }
22: 
23: function isValidMidiNote(midi) {
24:   return Number.isFinite(midi) && Number.isInteger(midi) && midi >= MIN_MIDI_NOTE && midi <= 127;
25: }
26: 
27: export async function resumeAudio() {
28:   if (audioCtx.state === 'suspended') {
29:     await audioCtx.resume();
30:   }
31: }
32: 
33: export function getAudioContext() {
34:   return audioCtx;
35: }
36: 
37: export function getMediaStream() {
38:   // Crée une destination temporaire branchée sur le bus permanent du synthé.
39:   // Ainsi, toutes les notes jouées (même après l'appel) sont capturées.
40:   const destination = audioCtx.createMediaStreamDestination();
41:   synthOutput.connect(destination);
42:   return destination.stream;
43: }
44: 
45: export function connectOutput(destination) {
46:   // Branche le bus permanent du synthé sur une destination externe.
47:   // Utilisé par le Studio pour mixer le synthé dans un seul MediaStream.
48:   if (destination && destination.context === audioCtx) {
49:     synthOutput.connect(destination);
50:   }
51: }
52: 
53: export function setSynthMode(mode) {
54:   synthMode = mode === 'rhodes' ? 'rhodes' : 'piano';
55: }
56: 
57: export function getSynthMode() {
58:   return synthMode;
59: }
60: 

(Showing lines 1-60 of 253. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/audio/stem-mixer.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/audio/stem-mixer.js</path>
<type>file</type>
<content>
1: import { resumeAudio } from './simple-synth.js';
2: import { createPitchShifter } from './pitch-shifter.js';
3: 
4: const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];
5: 
6: // Convert a dB value to a linear gain. -Infinity dB -> 0 gain.
7: export function dbToGain(db) {
8:   if (db <= -60) return 0;
9:   return Math.pow(10, db / 20);
10: }
11: 
12: export function gainToDb(gain) {
13:   if (gain <= 0) return -Infinity;
14:   return 20 * Math.log10(gain);
15: }
16: 
17: /**
18:  * Crée le mixer de stems autour d'un AudioContext partagé.
19:  *
20:  * @param {AudioContext|null} sharedAudioCtx - Contexte audio à partager.
21:  * @param {(path: string) => Promise<ArrayBuffer>} readAudioFn - Fonction de lecture
22:  *   du fichier (obligatoire). Doit retourner un ArrayBuffer valide pour
23:  *   AudioContext.decodeAudioData(). Cela permet d'éviter fetch(blob:) bloqué par CSP.
24:  */
25: export function createStemMixer(sharedAudioCtx = null, readAudioFn = null) {
26:   let audioCtx = sharedAudioCtx;
27:   let readAudio = readAudioFn;
28: 
29:   let buffers = {};           // stem -> AudioBuffer
30:   let sourceNodes = {};       // stem -> AudioBufferSourceNode actif
31:   let pitchShifters = {};      // stem -> pitch-shifter (persistant)
32:   let gains = {};             // stem -> GainNode (persistant)
33:   let state = {};
34:   let destination = null;
35:   let currentDuration = 0;
36:   let onProgress = null;
37:   let progressInterval = null;
38:   let masterGain = null;
39:   let isLoaded = false;
40:   let currentPitch = 0;
41: 
42:   let currentTime = 0;          // position dans le fichier (secondes)
43:   let playStartCtxTime = 0;     // audioCtx.currentTime au moment du play
44:   let isPlaying = false;
45: 
46:   for (const stem of STEMS) {
47:     state[stem] = { muted: false, solo: false, volumeDb: 0 };
48:   }
49: 
50:   function ensureContext() {
51:     if (!audioCtx) {
52:       audioCtx = new (window.AudioContext || window.webkitAudioContext)();
53:     }
54:     if (!destination) {
55:       destination = audioCtx.createGain();
56:       destination.connect(audioCtx.destination);
57:       masterGain = destination;
58:     }
59:     return audioCtx;
60:   }

(Showing lines 1-60 of 341. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/audio/pitch-shifter.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/audio/pitch-shifter.js</path>
<type>file</type>
<content>
1: import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
2: import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
3: 
4: /**
5:  * Factory de PitchShifter basé sur SoundTouch AudioWorklet.
6:  * Le processeur est enregistré une seule fois par AudioContext.
7:  */
8: const registeredContexts = new WeakSet();
9: const registrations = new WeakMap();
10: 
11: async function ensureWorkletRegistered(audioCtx) {
12:   if (registeredContexts.has(audioCtx)) return;
13:   if (registrations.has(audioCtx)) return registrations.get(audioCtx);
14: 
15:   const promise = SoundTouchNode.register(audioCtx, processorUrl).then(() => {
16:     registeredContexts.add(audioCtx);
17:   }).catch((err) => {
18:     console.error('[PitchShifter] Failed to register SoundTouch worklet:', err);
19:     throw err;
20:   });
21: 
22:   registrations.set(audioCtx, promise);
23:   return promise;
24: }
25: 
26: /**
27:  * Crée un nœud de pitch-shifting et le connecte à destinationNode.
28:  *
29:  * @param {AudioContext} audioCtx
30:  * @param {AudioNode} destinationNode
31:  * @param {number} semitones
32:  * @returns {Promise<{ node: AudioNode, setPitch(semitones: number): void, disconnect(): void, clear(): void }>}
33:  */
34: function semitonesToPitchRatio(semitones) {
35:   return Math.pow(2, semitones / 12);
36: }
37: 
38: export async function createPitchShifter(audioCtx, destinationNode, semitones = 0) {
39:   await ensureWorkletRegistered(audioCtx);
40:   const stNode = new SoundTouchNode({ context: audioCtx });
41: 
42:   // Verrouillage STRICT du tempo et du rate sur 1.0.
43:   // On utilise pitch (ratio) qui est l'API AudioParam stable de la librairie.
44:   stNode.pitch.value = semitonesToPitchRatio(semitones);
45:   stNode.tempo = 1.0;
46:   stNode.rate = 1.0;
47: 
48:   // Paramètre AudioParam de secours si l'objet expose des paramètres wrappés.
49:   if (stNode.tempo && typeof stNode.tempo.value === 'number') stNode.tempo.value = 1.0;
50:   if (stNode.rate && typeof stNode.rate.value === 'number') stNode.rate.value = 1.0;
51:   if (stNode.playbackRate && typeof stNode.playbackRate.value === 'number') stNode.playbackRate.value = 1.0;
52: 
53:   stNode.connect(destinationNode);
54: 
55:   return {
56:     node: stNode,
57:     setPitch: (st) => {
58:       // On garde le verrou tempo/rate actif, on ne touche qu'au pitch.
59:       if (stNode.tempo && typeof stNode.tempo.value === 'number') stNode.tempo.value = 1.0;
60:       if (stNode.rate && typeof stNode.rate.value === 'number') stNode.rate.value = 1.0;

(Showing lines 1-60 of 81. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/corpus-invariants.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/corpus-invariants.js</path>
<type>file</type>
<content>
1: // Corpus d'invariants pour le voicing-engine.
2: // Chaque entrée décrit un cas de test : nom, symbole, pitch classes attendues,
3: // basse attendue, classification et, le cas échéant, une voicingCandidate de test.
4: //
5: // Classification :
6: // - hard_invariants   : obligations physiques et harmoniques (ne doit jamais changer)
7: // - acceptable_properties : propriétés que le moteur devrait privilégier (soft)
8: // - style_preferences : choix stylistiques, non testés comme obligations
9: // - out_of_scope      : hors vocabulaire V1 ; conservé comme documentation
10: //
11: // Les champs `notesOnStaff` et `notes` ne sont PAS testés automatiquement
12: // (ils servent de référence pour le futur générateur). La validation
13: // automatique porte sur expectedPcSet et expectedBassPc.
14: 
15: /** @typedef {{ name: string, symbol: string, expectedPcSet: number[], expectedBassPc: number | null, notesOnStaff: number, notes: number[], classification: 'hard_invariants' | 'acceptable_properties' | 'style_preferences' | 'out_of_scope', description: string }} InvariantCase */
16: 
17: /** @type {InvariantCase[]} */
18: export const INVARIANT_CORPUS = Object.freeze([
19:   // ============================================================
20:   // hard_invariants — obligations physiques et harmoniques
21:   // ============================================================
22: 
23:   // --- Triades de base (support V1) ---
24:   { name: 'C major triad', symbol: 'C', expectedPcSet: [0, 4, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade majeure en Do' },
25:   { name: 'F major triad', symbol: 'F', expectedPcSet: [5, 9, 0], expectedBassPc: 5, notesOnStaff: 3, notes: [41, 48, 53], classification: 'hard_invariants', description: 'Triade majeure en Fa' },
26:   { name: 'Bb major triad', symbol: 'Bb', expectedPcSet: [10, 2, 5], expectedBassPc: 10, notesOnStaff: 3, notes: [46, 53, 58], classification: 'hard_invariants', description: 'Triade majeure en Sib' },
27:   { name: 'G major triad', symbol: 'G', expectedPcSet: [7, 11, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 50, 55], classification: 'hard_invariants', description: 'Triade majeure en Sol' },
28:   { name: 'D major triad', symbol: 'D', expectedPcSet: [2, 6, 9], expectedBassPc: 2, notesOnStaff: 3, notes: [38, 45, 50], classification: 'hard_invariants', description: 'Triade majeure en Ré' },
29:   { name: 'A major triad', symbol: 'A', expectedPcSet: [9, 1, 4], expectedBassPc: 9, notesOnStaff: 3, notes: [45, 52, 57], classification: 'hard_invariants', description: 'Triade majeure en La' },
30: 
31:   { name: 'C minor triad', symbol: 'Cm', expectedPcSet: [0, 3, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade mineure en Do' },
32:   { name: 'F minor triad', symbol: 'Fm', expectedPcSet: [5, 8, 0], expectedBassPc: 5, notesOnStaff: 3, notes: [41, 48, 53], classification: 'hard_invariants', description: 'Triade mineure en Fa' },
33:   { name: 'G minor triad', symbol: 'Gm', expectedPcSet: [7, 10, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 50, 55], classification: 'hard_invariants', description: 'Triade mineure en Sol' },
34: 
35:   { name: 'C diminished triad', symbol: 'Cdim', expectedPcSet: [0, 3, 6], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 43, 48], classification: 'hard_invariants', description: 'Triade diminuée en Do' },
36:   { name: 'C augmented triad', symbol: 'Caug', expectedPcSet: [0, 4, 8], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 44, 48], classification: 'hard_invariants', description: 'Triade augmentée en Do' },
37: 
38:   { name: 'Csus4', symbol: 'Csus4', expectedPcSet: [0, 5, 7], expectedBassPc: 0, notesOnStaff: 3, notes: [36, 41, 48], classification: 'hard_invariants', description: 'Sus4 en Do' },
39:   { name: 'Gsus4', symbol: 'Gsus4', expectedPcSet: [7, 0, 2], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 48, 50], classification: 'hard_invariants', description: 'Sus4 en Sol' },
40:   { name: 'Dsus2', symbol: 'Dsus2', expectedPcSet: [2, 4, 9], expectedBassPc: 2, notesOnStaff: 3, notes: [38, 40, 45], classification: 'hard_invariants', description: 'Sus2 en Ré' },
41: 
42:   // --- Septièmes (support V1) ---
43:   { name: 'Cmaj7', symbol: 'Cmaj7', expectedPcSet: [0, 4, 7, 11], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 52], classification: 'hard_invariants', description: 'Maj7 en Do' },
44:   { name: 'Fmaj7', symbol: 'Fmaj7', expectedPcSet: [5, 9, 0, 4], expectedBassPc: 5, notesOnStaff: 4, notes: [41, 48, 53, 57], classification: 'hard_invariants', description: 'Maj7 en Fa' },
45:   { name: 'Bbmaj7', symbol: 'Bbmaj7', expectedPcSet: [10, 2, 5, 9], expectedBassPc: 10, notesOnStaff: 4, notes: [46, 53, 58, 62], classification: 'hard_invariants', description: 'Maj7 en Sib' },
46: 
47:   { name: 'C7', symbol: 'C7', expectedPcSet: [0, 4, 7, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Dominante en Do' },
48:   { name: 'G7', symbol: 'G7', expectedPcSet: [7, 11, 2, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Dominante en Sol' },
49:   { name: 'D7', symbol: 'D7', expectedPcSet: [2, 6, 9, 0], expectedBassPc: 2, notesOnStaff: 4, notes: [38, 45, 50, 53], classification: 'hard_invariants', description: 'Dominante en Ré' },
50: 
51:   { name: 'Cm7', symbol: 'Cm7', expectedPcSet: [0, 3, 7, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Mineur 7 en Do' },
52:   { name: 'Fm7', symbol: 'Fm7', expectedPcSet: [5, 8, 0, 3], expectedBassPc: 5, notesOnStaff: 4, notes: [41, 48, 53, 56], classification: 'hard_invariants', description: 'Mineur 7 en Fa' },
53:   { name: 'Gm7', symbol: 'Gm7', expectedPcSet: [7, 10, 2, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Mineur 7 en Sol' },
54: 
55:   { name: 'Cm7b5', symbol: 'Cm7b5', expectedPcSet: [0, 3, 6, 10], expectedBassPc: 0, notesOnStaff: 4, notes: [36, 43, 48, 51], classification: 'hard_invariants', description: 'Demi-diminué en Do' },
56:   { name: 'Gm7b5', symbol: 'Gm7b5', expectedPcSet: [7, 10, 1, 5], expectedBassPc: 7, notesOnStaff: 4, notes: [43, 50, 55, 59], classification: 'hard_invariants', description: 'Demi-diminué en Sol' },
57: 
58:   // --- Slash chords : basse dans l'accord ---
59:   { name: 'C/E', symbol: 'C/E', expectedPcSet: [0, 4, 7], expectedBassPc: 4, notesOnStaff: 3, notes: [40, 43, 48], classification: 'hard_invariants', description: 'C majeur avec basse tierce' },
60:   { name: 'C/G', symbol: 'C/G', expectedPcSet: [0, 4, 7], expectedBassPc: 7, notesOnStaff: 3, notes: [43, 48, 52], classification: 'hard_invariants', description: 'C majeur avec basse quinte' },

(Showing lines 1-60 of 121. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/midi-convention.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/midi-convention.js</path>
<type>file</type>
<content>
1: // Convention MIDI du voicing-engine.
2: // C4 = MIDI 60. Toutes les fonctions sont pures.
3: // Convention octave : pcOctaveToMidi(pc, octave) = 12 * (octave + 1) + pc.
4: 
5: const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
6: const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
7: 
8: /**
9:  * Convertit une pitch class et un octave en numéro MIDI.
10:  * @param {number} pc - pitch class 0..11
11:  * @param {number} octave - octave avec C4=60
12:  * @returns {number} numéro MIDI
13:  */
14: export function pcOctaveToMidi(pc, octave) {
15:   if (!Number.isInteger(pc) || !Number.isInteger(octave)) {
16:     throw new TypeError(`pcOctaveToMidi expects integer pc and octave, got pc=${pc}, octave=${octave}`);
17:   }
18:   return 12 * (octave + 1) + pc;
19: }
20: 
21: /**
22:  * Extrait la pitch class et l'octave d'un numéro MIDI.
23:  * @param {number} midi
24:  * @returns {{ pc: number, octave: number }}
25:  */
26: export function midiToPcOctave(midi) {
27:   if (!Number.isInteger(midi)) {
28:     throw new TypeError(`midiToPcOctave expects integer midi, got ${midi}`);
29:   }
30:   const pc = ((midi % 12) + 12) % 12;
31:   const octave = Math.floor(midi / 12) - 1;
32:   return { pc, octave };
33: }
34: 
35: /**
36:  * Renvoie le nom de note pour un MIDI donné.
37:  * Par défaut utilise la politique enharmonique du module (bémols).
38:  * Passer useSharps=true pour forcer les dièses.
39:  * @param {number} midi
40:  * @param {{ useSharps?: boolean }} [opts]
41:  * @returns {string}
42:  */
43: export function midiToNoteName(midi, opts = {}) {
44:   const { pc, octave } = midiToPcOctave(midi);
45:   const useSharps = opts.useSharps != null ? opts.useSharps : NOTE_NAMING_POLICY.defaultUseSharps;
46:   const names = useSharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT;
47:   return `${names[pc]}${octave}`;
48: }
49: 
50: /**
51:  * Renvoie le MIDI d'un nom de type "C4", "F#3", "Bb2".
52:  * Accepte les altérations simples (# ou b). Les doubles altérations (x, bb)
53:  * ne sont pas supportées et retournent null.
54:  * @param {string} name
55:  * @returns {number | null}
56:  */
57: export function noteNameToMidi(name) {
58:   if (typeof name !== 'string') return null;
59:   const m = name.match(/^([A-G])([#b]?)(-?\d+)$/);
60:   if (!m) return null;

(Showing lines 1-60 of 101. Use offset=61 to continue.)
</content>
```

**Tool: read**

**Input:**
```json
{
  "filePath": "/home/visiteur/piano-jazz-chords/src/voicing-engine/test-voicing-phase0.js",
  "limit": 60
}
```

**Output:**
```
<path>/home/visiteur/piano-jazz-chords/src/voicing-engine/test-voicing-phase0.js</path>
<type>file</type>
<content>
1: // Tests Phase 0 et 0.5 du Two-Hand Piano Voicing Engine V1.
2: // Objectif : valider fondations pures sans générer de voicings utilisateurs.
3: // Pas de dépendances src/ui/ autorisées ici.
4: 
5: import { normalizeVoicingInput, normalizeVoicingInputFromSymbol } from './chord-input.js';
6: import {
7:   pcOctaveToMidi,
8:   midiToPcOctave,
9:   midiToNoteName,
10:   noteNameToMidi,
11:   pcMidiInstances,
12:   NOTE_NAMING_POLICY,
13: } from './midi-convention.js';
14: import {
15:   LH_HARD_RANGE,
16:   LH_SOFT_RANGE,
17:   RH_HARD_RANGE,
18:   RH_SOFT_RANGE,
19:   LH_MAX_SPAN,
20:   RH_MAX_SPAN,
21:   midiInRange,
22:   span,
23:   isIntegerMidi,
24: } from './hand-ranges.js';
25: import {
26:   DEFAULT_HAND_METADATA,
27:   createDefaultCandidateMetadata,
28:   createHandVoicing,
29:   createVoicingCandidate,
30: } from './data-model.js';
31: import { checkHandHardConstraints, checkCandidateHardConstraints, measureSoftConstraintFeatures } from './constraints.js';
32: import { INVARIANT_CORPUS, findInvariant, invariantsByClassification } from './corpus-invariants.js';
33: import { isSupportedInV1, isKnownQuality, qualityCategory, VOICING_V1_VOCABULARY } from './vocabulary.js';
34: 
35: const failures = [];
36: let total = 0;
37: let passed = 0;
38: 
39: async function test(name, fn) {
40:   total++;
41:   try {
42:     await fn();
43:     passed++;
44:     console.log(`  ✓ ${name}`);
45:   } catch (err) {
46:     failures.push({ name, error: err });
47:     console.log(`  ✗ ${name}: ${err.message}`);
48:   }
49: }
50: 
51: function assertEqual(actual, expected, msg = '') {
52:   if (actual !== expected) {
53:     throw new Error(`${msg} expected ${expected}, got ${actual}`);
54:   }
55: }
56: 
57: function assertTrue(value, msg = '') {
58:   if (!value) throw new Error(msg || 'expected true');
59: }
60: 

(Showing lines 1-60 of 918. Use offset=61 to continue.)
</content>
```

---

## Assistant (Plan · deepseek-v4-pro · 7.9s)

_Thinking:_

Now I have a comprehensive understanding of the codebase. Let me compile the audit report. I have read all the key files. Let me now write the comprehensive report.

Let me organize my findings:

## Architecture
- Electron 32 + Vite 5
- Vanilla JS (ES modules)
- Web Audio API + SoundTouch AudioWorklet
- Python backend (audio-processor.py, demucs-wrapper.py, harmony_engine)
- Tailwind CSS 4
- @julusian/midi for native MIDI
- Storage: ~/PianoJazzChords/Studio/<trackId>/

## Key files for the mission:
- `src/main.js` - Main entry, MIDI handling, state management
- `src/ui/analyzer-tab.js` - Analysis tab UI
- `src/ui/studio-tab.js` - Studio tab UI
- `src/recorder/recorder.js` - MIDI event recorder
- `src/recorder/player.js` - MIDI event player
- `src/recorder/serializer.js` - MIDI serialization
- `src/chord-engine/index.js` - Chord detection engine
- `src/chord-engine/chord-defs.js` - Chord definitions
- `src/voicing-engine/` - Voicing generation engine
- `src/analyzer/reharmonizer.js` - Reharmonization suggestions
- `src/ai/ai-client.js` - AI client for reharmonization
- `src/ai/openai-config.js` - AI configuration
- `src/virtual-keyboard.js` - Virtual keyboard
- `src/ui/keyboard-svg.js` - SVG keyboard rendering
- `src/ui/mini-keyboard.js` - Mini keyboard for chords
- `src/note-grouper.js` - Note grouping
- `src/chord-history.js` - Chord history
- `electron/main.js` - Electron main process
- `electron/preload.cjs` - Preload script

Now let me write the comprehensive report.

**Tool: todowrite**

**Input:**
```json
{
  "todos": [
    {
      "content": "1. Cartographie du projet (structure, dépendances, architecture)",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "2. Audit de l'onglet Analyse actuel",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "3. Audit de l'onglet Studio et import des médias",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "4. Audit du pipeline MIDI",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "5. Audit de la reconnaissance d'accords",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "6. Audit de la génération de voicings",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "7. Audit du clavier virtuel et visualisation",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "8. Audit de l'intégration IA",
      "priority": "high",
      "status": "completed"
    },
    {
      "content": "9. Modèle de données cible",
      "priority": "medium",
      "status": "completed"
    },
    {
      "content": "10. Algorithme cible",
      "priority": "medium",
      "status": "completed"
    },
    {
      "content": "11. Réutilisation ou nouvelles dépendances",
      "priority": "medium",
      "status": "completed"
    },
    {
      "content": "12. Risques",
      "priority": "medium",
      "status": "completed"
    },
    {
      "content": "13. Plan de développement",
      "priority": "medium",
      "status": "completed"
    },
    {
      "content": "14. Rédaction du rapport final",
      "priority": "high",
      "status": "in_progress"
    }
  ]
}
```

**Output:**
```
[
  {
    "content": "1. Cartographie du projet (structure, dépendances, architecture)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "2. Audit de l'onglet Analyse actuel",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "3. Audit de l'onglet Studio et import des médias",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "4. Audit du pipeline MIDI",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "5. Audit de la reconnaissance d'accords",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "6. Audit de la génération de voicings",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "7. Audit du clavier virtuel et visualisation",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "8. Audit de l'intégration IA",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "9. Modèle de données cible",
    "status": "completed",
    "priority": "medium"
  },
  {
    "content": "10. Algorithme cible",
    "status": "completed",
    "priority": "medium"
  },
  {
    "content": "11. Réutilisation ou nouvelles dépendances",
    "status": "completed",
    "priority": "medium"
  },
  {
    "content": "12. Risques",
    "status": "completed",
    "priority": "medium"
  },
  {
    "content": "13. Plan de développement",
    "status": "completed",
    "priority": "medium"
  },
  {
    "content": "14. Rédaction du rapport final",
    "status": "in_progress",
    "priority": "high"
  }
]
```

---

## Assistant (Plan · deepseek-v4-pro · 69.3s)

_Thinking:_

I've now completed a thorough audit of the entire codebase. Let me compile the comprehensive report. I have read all the key files and have a clear picture of the architecture, what's functional, what's missing, and what needs to be built.

Let me now write the final report.

Voici le rapport d'audit complet.

---

# RAPPORT D'AUDIT — BRANCHE « MÉLODIE & RÉHARMONISATION »

---

## A. RÉSUMÉ EXÉCUTIF

Le dépôt dispose d'une base solide pour la reconnaissance d'accords temps réel, la génération de voicings piano, et l'analyse audio. En revanche, **la capture temporelle MIDI avec conservation de la mélodie, la réharmonisation déterministe par phrase, et la distinction mélodie/soprano/basse sont quasi inexistantes**. Le premier MVP (saisie MIDI + réharmonisation) nécessite la création de nouveaux modules, mais peut s'appuyer sur le `voicing-engine` existant, le `recorder`, le `chord-engine`, et le `reharmonizer` algorithmique.

---

## B. ARCHITECTURE ACTUELLE

### B.1 Framework et stack

| Élément | Valeur |
|---------|--------|
| Frontend | Vanilla JS (modules ES), Vite 5, Tailwind CSS 4 |
| Desktop | Electron 32, `contextIsolation: true`, `nodeIntegration: false` |
| Preload | `electron/preload.cjs` (CommonJS, utilisé en prod) + `electron/preload.js` (ESM, backup) |
| Main process | `electron/main.js` — MIDI natif (`@julusian/midi`), IPC fichiers, Studio, analyse audio |
| Audio | Web Audio API + `@soundtouchjs/audio-worklet` (pitch-shift) |
| Synthèse | `src/audio/simple-synth.js` — oscillateurs Web Audio (piano/Rhodes) |
| Python backend | `electron/audio-processor.py` — extraction audio, waveform, pitch-shift, analyse accords (chromagramme + templates), Demucs |
| Harmony engine Python | `electron/harmony_engine/` — scoring, templates, voicing, bass, style profiles, structured analysis |
| Stockage | `~/PianoJazzChords/Studio/<trackId>/` pour le Studio ; `localStorage` pour config IA et préférences UI |
| Tests | `node src/analyzer/test-regression-part1.js`, `node src/chord-engine/test-regression-part3.js`, `node src/voicing-engine/test-voicing-phase0.js` (et phase1, phase2) |
| Build | `vite build` → `dist/` |
| Lint | Aucun configuré (pas de ESLint/Prettier dans `package.json`) |
| TypeScript | Aucun — JSDoc uniquement dans le `voicing-engine` |

### B.2 Arborescence commentée (fichiers utiles à la mission)

```
src/
├── main.js                          # Point d'entrée renderer, état global, MIDI, onglets
├── index.html                       # HTML complet (3 onglets : Entraînement, Analyse, Studio)
├── style.css                        # Styles globaux
│
├── chord-engine/                    # ★ MOTEUR HARMONIQUE (réutilisable)
│   ├── index.js                     # detectChord(), classifyVoicing() — cœur de la reco
│   ├── chord-defs.js                # CHORD_DEFINITIONS (60+ accords), ROOTLESS_DEFINITIONS
│   ├── chord-display.js             # getEffectiveChord(), parseChordSymbol()
│   ├── intervals.js                 # noteNameToPc, midiToNoteName, formatNote
│   ├── naming.js                    # formatPc, slashName, inversionName
│   ├── voicing.js                   # getVoicingLabel(), getAlias()
│   └── pedagogy.js                  # Contenu pédagogique
│
├── voicing-engine/                  # ★ MOTEUR DE VOICINGS PIANO (réutilisable)
│   ├── generate-voicing.js          # API publique : generateVoicing(), generateVoicingFromSymbol()
│   ├── chord-input.js               # Normalisation d'entrée (rootPc, quality, bassPc)
│   ├── candidate-generator.js       # Close-v1 : LH + RH candidates, ranking
│   ├── constraints.js                # Hard/soft constraints, validation
│   ├── data-model.js                 # Types immuables (HandVoicing, VoicingCandidate)
│   ├── hand-ranges.js               # Plages MIDI main gauche/droite
│   ├── vocabulary.js                 # Qualités supportées V1
│   ├── midi-convention.js            # C4=60, conversions MIDI↔nom
│   ├── corpus-invariants.js          # Corpus de test (invariants harmoniques)
│   ├── styles/close.js              # Style Close
│   ├── styles/simple.js             # Style Simple (pédagogique)
│   └── test-voicing-phase*.js       # Tests Phase 0, 1, 2
│
├── recorder/                        # ★ ENREGISTREMENT/LECTURE MIDI (réutilisable)
│   ├── recorder.js                  # createRecorder() — capture événements MIDI avec timestamps
│   ├── player.js                    # createPlayer() — rejoue des événements MIDI
│   ├── serializer.js                # buildMidiFile(), buildMidiFileMultiTrack()
│   ├── storage.js                   # Stockage fichiers
│   └── session-manager.js           # CRUD sessions
│
├── analyzer/                        # ★ ANALYSE (partiellement réutilisable)
│   ├── audio-analyzer.js            # AudioAnalyzer, TemplateAudioAnalyzer
│   ├── reharmonizer.js              # suggestForChord(), suggestProgression() — algorithmique
│   ├── alternatives.js              # generateAlternatives() — close, drop 2, spread
│   ├── substitutions.js             # findSubstitutions() — tritonique, dominante secondaire
│   ├── harmonic-utils.js            # isMinorSymbol, isDominantSymbol, degreeName
│   ├── harmonic-patterns.js         # II-V-I, cadences, turnarounds
│   ├── key-detector.js              # Krumhansl-Schmuckler + heuristique accords
│   ├── scorer.js                    # scoreSession() — voice leading, transitions, tensions
│   ├── voice-leading.js             # buildVoiceLeading(), buildFluidityScore()
│   ├── segmenter.js                 # Segmentation en sections
│   ├── chord-timeline.js            # buildChordTimeline() — groupes de notes → accords
│   ├── chord-comparator.js          # compareGridToPlayed()
│   ├── bass-harmonic-relation.js    # Relation basse↔accord
│   ├── analysis-export.js           # Export MIDI/JSON/texte
│   └── midi-exporter.js             # Re-export
│
├── ai/                              # ★ INTÉGRATION IA
│   ├── ai-client.js                 # generateReharmonization(), generateMasterclass()
│   └── openai-config.js            # getAIConfig(), saveAIConfig(), PRESETS
│
├── audio/                           # ★ AUDIO (partiellement réutilisable)
│   ├── simple-synth.js             # Synthétiseur Web Audio (piano/Rhodes)
│   ├── media-engine.js              # selectMediaFile(), createAudioPlayer()
│   ├── stem-mixer.js                # Mixer multi-pistes (AudioBuffer natif)
│   ├── pitch-shifter.js             # SoundTouch AudioWorklet
│   └── stem-player.js / stem-separator.js
│
├── ui/                              # ★ INTERFACE
│   ├── analyzer-tab.js             # Onglet Analyse (import → timeline → édition)
│   ├── studio-tab.js                # Onglet Studio (4 étapes)
│   ├── recording-tab.js             # Enregistrement sessions MIDI
│   ├── keyboard-svg.js              # Clavier SVG principal
│   ├── mini-keyboard.js             # Mini-clavier pour accord
│   ├── voicing-preview.js           # Aperçu voicing (close/simple)
│   ├── chord-editor.js              # Éditeur d'accord (correction manuelle)
│   └── display.js                   # Affichage résultat détection
│
├── virtual-keyboard.js             # Clavier virtuel (souris + raccourcis clavier)
├── note-grouper.js                  # Groupement temporel des notes (fenêtre glissante)
├── chord-history.js                # Historique des accords détectés
├── midi-fallback.js                 # Web MIDI API fallback
└── practice-exercise.js             # Exercices d'entraînement
```

---

## C. FONCTIONNALITÉS RÉELLEMENT DISPONIBLES

### C.1 Onglet Analyse (`src/ui/analyzer-tab.js`)

**Fonctionnel :**
- Import de fichier audio/vidéo via `selectMediaFile()` → `analyzer.analyze()` → `analyzer:process-file` IPC
- Extraction audio + analyse accords via Python (`audio-processor.py analyze-chords`)
- Timeline d'accords interactive (zoom, scroll, clic pour seek, double-clic pour éditer)
- Lecture audio synchronisée avec surbrillance de l'accord courant
- Hero chord (affiche l'accord actif avec mini-clavier)
- Correction manuelle des accords (ChordEditor, undo/redo, Ctrl+Z/Y)
- Persistance des corrections (projet JSON, Ctrl+S, rechargement automatique)
- Export MIDI, JSON, copie texte
- Statistiques (qualités, accords les plus utilisés)
- Aperçu voicing close/simple via `voicing-preview.js`
- Sections UI : Accords, Analyse, Masterclass, Outils
- Détection basse (Fusion Engine Python)

**Non fonctionnel / Placeholder :**
- L'écran d'import (`#analyzer-import-screen`) ne propose qu'un seul bouton "Choisir un fichier" — pas de sélection de source (audio/vidéo/MIDI)
- Pas de classification vidéo (tutoriel/cover/morceau/démo)
- Pas de piano-roll
- Pas de timeline de mélodie
- Pas de réharmonisation interactive (le panneau "Réharmonisation" dans l'onglet Analyse a un `<select>` de style et un bouton "Générer suggestions" mais aucun handler n'est câblé dans `analyzer-tab.js:227-239`)
- Le panneau Masterclass affiche "Configurez une clé API..." — le bouton est désactivé tant qu'aucune clé n'est configurée
- Les outils (Aperçu audio, Accords & Paroles, Accordeur, Compte à rebours, Transposition globale, Simplification) sont tous marqués "à venir"
- Pas d'enregistrement MIDI dans l'onglet Analyse (l'enregistrement est dans `recording-tab.js`, lié à l'onglet Entraînement)

### C.2 Onglet Studio (`src/ui/studio-tab.js`)

**Fonctionnel :**
- Workflow 4 étapes (accueil → ciblage → traitement → pro)
- Import MP3/MP4/WAV/M4A
- Waveform interactive avec tracé de région
- Lecture audio bufferisée (AudioBuffer natif, pas de `<audio>`)
- Vidéo muette synchronisée
- Séparation de pistes (Demucs ou stems simulés)
- Mixer multi-pistes (mute/solo/volume)
- Transposition ±12 demi-tons (SoundTouch)
- Enregistrement vidéo de la fenêtre

**Note importante :** Le Studio n'a **pas** de dialogue demandant le type de média (tutoriel/morceau). L'import est direct : `studio:select-file` → extraction audio → waveform. La classification "tutoriel / morceau" mentionnée dans les maquettes n'existe pas dans le code.

### C.3 Reconnaissance d'accords (`src/chord-engine/index.js`)

**Fonctionnel :**
- `detectChord(activeNotes)` — notes MIDI → accord (rootPc, symbol, intervals, bassPc, inversion, confidence, voicing)
- 60+ définitions d'accords (triades à 13th, sus, quartal, etc.)
- Rootless voicings (3-5-7, 3-5-7-9, etc.)
- Upper structure triads
- Polychords
- Shell voicings (maj7, 7, m7 sans quinte)
- Classification de voicing (`classifyVoicing`) : single, shell, cluster, close, open, spread

**Limites :**
- Détection purement verticale (pas de contexte harmonique)
- Pas de gestion de tonalité dans `detectChord` (uniquement dans `key-detector.js`)
- Pas de fonction harmonique (tonique/dominante/sous-dominante)
- Enharmonie simplifiée (C# = Db, pas de choix contextuel)
- Notes manquantes : seules les notes jouées sont analysées ; pas d'inférence des notes omises

### C.4 Générateur de voicings (`src/voicing-engine/`)

**Fonctionnel :**
- `generateVoicing()` / `generateVoicingFromSymbol()` — entrée → candidat LH+RH
- Deux styles : Close (inversions, toutes notes dans RH) et Simple (pédagogique, triades/septièmes)
- Contraintes physiques : plages MIDI main gauche (28-55) / droite (48-84), span max (12/16)
- Validation hard : pas de croisement, basse slash respectée, pas de doublons
- Ranking déterministe (notes dans soft range, span, centroïde)
- Vocabulaire V1 : triades (M, m, dim, aug, sus2, sus4) + septièmes (7, maj7, m7, m7b5)
- Corpus d'invariants (40+ cas de test)

**Non supporté (futurePhase) :**
- Extensions (9, 11, 13, altérations)
- Drop 2, drop 3, quartal (mentionnés dans `alternatives.js` mais pas dans le `voicing-engine`)
- Rootless voicings dans le générateur
- Voice leading entre accords successifs
- Contrainte de note supérieure (top note / mélodie imposée)

### C.5 Pipeline MIDI

**Fonctionnel :**
- MIDI natif (`@julusian/midi` dans `electron/main.js`) + Web MIDI fallback (`src/midi-fallback.js`)
- Note-on/note-off avec vélocité
- Sustain (CC 64)
- Pitch bend, modulation wheel
- Détection automatique de périphériques, hot-plug, reconnexion
- Filtrage des ports virtuels

**Ce qui manque pour une vraie session temporelle :**
- Le `recorder` (`src/recorder/recorder.js`) capture bien les événements avec timestamps relatifs
- Le `player` (`src/recorder/player.js`) les rejoue correctement
- **Mais** le flux principal (`main.js`) ne conserve que l'état instantané (`activeNotes: Map`) — pas d'historique temporel
- Le `note-grouper.js` groupe les notes par fenêtre glissante (200ms) pour la détection d'accords, mais ne conserve pas la timeline individuelle des notes
- **Pas de distinction note mélodique / note d'accompagnement**
- **Pas de conservation des octaves dans la timeline** (seules les pitch classes sont utilisées pour la détection)
- **Pas de pédale de sustain dans le recorder** (le `recorder.sustain()` existe mais n'est pas appelé dans le flux principal — `feedRecorderSustain` est exporté mais non connecté)

### C.6 Clavier virtuel (`src/ui/keyboard-svg.js`, `src/virtual-keyboard.js`)

**Fonctionnel :**
- Rendu SVG avec touches blanches/noires proportionnées
- Interaction souris et tactile
- Raccourcis clavier (1 octave, A→L)
- Highlight des notes actives (classe CSS `active`)
- Mini-clavier pour accord (`src/ui/mini-keyboard.js`)

**Limites pour la visualisation multicouche :**
- Une seule classe CSS pour les notes actives (`active`) — pas de couches distinctes (mélodie/basse/voix/proposition)
- Pas d'animation de transition entre accords
- Pas de lecture séquentielle (les notes sont affichées statiquement)
- Le clavier est global (partagé entre tous les onglets)

### C.7 Intégration IA (`src/ai/`)

**Fonctionnel :**
- Configuration via UI modale (preset Groq/OpenRouter/Google AI Studio)
- Stockage dans `localStorage` (clé `piano-jazz-ai-config`)
- Fallback vers variables d'environnement `IA_API_KEY`, `IA_BASE_URL`, `IA_MODEL`
- `generateReharmonization(chord, style, topNoteName)` — appel API → 3 suggestions
- `generateMasterclass(analysis)` — analyse pédagogique par phrase
- Validation des notes MIDI retournées (plage 36-84, présence de la fondamentale)
- Fallback algorithmique si pas de clé ou échec API
- Cache des masterclass

**Risques :**
- La clé API est stockée dans `localStorage` (accessible au renderer)
- Les appels API sont faits directement depuis le renderer (visibles dans DevTools)
- Les endpoints sont codés en dur dans la CSP (`src/index.html:12-13`)
- Le modèle par défaut (`llama-3.1-8b-instant`) a des lacunes en théorie musicale (documenté dans `ai-client.js:8`)

---

## D. ÉLÉMENTS RÉUTILISABLES

| Composant | Fichier | Réutilisation pour Mélodie & Réharmonisation |
|-----------|---------|----------------------------------------------|
| `detectChord()` | `chord-engine/index.js` | Validation des accords candidats |
| `classifyVoicing()` | `chord-engine/index.js` | Classification des voicings générés |
| `CHORD_DEFINITIONS` | `chord-engine/chord-defs.js` | Base de données d'accords (intervalles) |
| `generateVoicing()` | `voicing-engine/generate-voicing.js` | Génération de voicings jouables pour les candidats |
| `createRecorder()` | `recorder/recorder.js` | Capture MIDI avec timestamps |
| `createPlayer()` | `recorder/player.js` | Rejeu des événements MIDI |
| `buildMidiFileMultiTrack()` | `recorder/serializer.js` | Export MIDI multipiste |
| `suggestForChord()` | `analyzer/reharmonizer.js` | Base algorithmique de réharmonisation (à étendre) |
| `key-detector.js` | `analyzer/key-detector.js` | Détection de tonalité (Krumhansl-Schmuckler) |
| `voice-leading.js` | `analyzer/voice-leading.js` | Calcul de conduite des voix |
| `harmonic-utils.js` | `analyzer/harmonic-utils.js` | Degrés, classification majeur/mineur/dominant |
| `harmonic-patterns.js` | `analyzer/harmonic-patterns.js` | Détection II-V-I, cadences |
| `scorer.js` | `analyzer/scorer.js` | Scoring de progression |
| `generateReharmonization()` | `ai/ai-client.js` | Suggestions IA (à utiliser pour l'explication, pas la validation) |
| `mini-keyboard.js` | `ui/mini-keyboard.js` | Visualisation des propositions |
| `keyboard-svg.js` | `ui/keyboard-svg.js` | Clavier principal (à étendre pour multicouche) |
| `note-grouper.js` | `note-grouper.js` | Groupement temporel (base pour segmentation mélodique) |
| `simple-synth.js` | `audio/simple-synth.js` | Synthèse audio pour prévisualisation |

---

## E. MANQUES CRITIQUES

### E.1 Représentation temporelle de la mélodie
**Aucun module n'existe.** Le `recorder` capture des événements MIDI bruts mais personne ne les interprète comme une mélodie. Le `chord-timeline.js` détecte le caractère mélodique d'une session mais ne conserve pas la ligne mélodique.

### E.2 Distinction mélodie / accompagnement
**Aucune logique.** Le système traite toutes les notes comme un ensemble indistinct pour la détection d'accords.

### E.3 Moteur de réharmonisation par phrase
Le `reharmonizer.js` actuel est **accord par accord**, sans vision globale de la phrase. `suggestProgression()` applique juste `suggestForChord()` à chaque accord indépendamment.

### E.4 Contrainte de mélodie dans les voicings
Le `voicing-engine` ne permet pas d'imposer une note supérieure. La top note est un résultat, pas une contrainte d'entrée.

### E.5 Pas de piano-roll / timeline MIDI
L'onglet Analyse a une timeline d'accords mais pas de piano-roll pour visualiser/éditer les notes MIDI.

### E.6 Pas de sélection de source dans l'onglet Analyse
Un seul bouton "Choisir un fichier" — pas d'écran de choix (audio/vidéo/MIDI).

### E.7 Pas de fonction harmonique dans la détection
`detectChord()` ne retourne pas de fonction (tonique, dominante, etc.). Cette information est calculée séparément dans `harmonic-patterns.js` mais pas intégrée au flux principal.

### E.8 Enharmonie non contextuelle
C# et Db sont traités comme identiques. Pas de choix enharmonique basé sur la tonalité.

---

## F. MODÈLE DE DONNÉES RECOMMANDÉ

### F.1 Types proposés

```js
// ── Événement MIDI brut capturé ──
// Fichier recommandé : src/melody/midi-types.js
/**
 * @typedef {{
 *   time: number,          // secondes depuis le début de l'enregistrement
 *   type: 'note_on' | 'note_off',
 *   note: number,          // MIDI 0-127
 *   velocity: number,      // 0-1
 *   channel: number        // 0-15
 * }} MidiNoteEvent
 */

// ── Note de mélodie identifiée ──
/**
 * @typedef {{
 *   midi: number,
 *   pitchClass: number,    // 0-11
 *   octave: number,        // C4=4
 *   startTime: number,     // secondes
 *   duration: number,      // secondes
 *   velocity: number,      // 0-1
 *   isMelody: boolean,     // true si identifiée comme mélodique
 *   isHeld: boolean        // true si encore tenue à la fin de la phrase
 * }} MelodyEvent
 */

// ── État des notes tenues à un instant T ──
/**
 * @typedef {{
 *   activeNotes: Map<number, { startTime: number, velocity: number }>,
 *   sustainedNotes: Set<number>,
 *   sustainPedal: boolean
 * }} HeldNoteState
 */

// ── Phrase mélodique ──
/**
 * @typedef {{
 *   id: string,
 *   startTime: number,
 *   endTime: number,
 *   events: MelodyEvent[],
 *   pitchRange: [number, number],
 *   contour: 'ascending' | 'descending' | 'arch' | 'valley' | 'static'
 * }} MelodyPhrase
 */

// ── Contexte tonal ──
// Réutilise et étend key-detector.js
/**
 * @typedef {{
 *   tonicPc: number,
 *   mode: 'major' | 'minor',
 *   confidence: number,
 *   candidates: { tonicPc: number, mode: string, confidence: number }[]
 * }} TonalContext
 */

// ── Contraintes de réharmonisation ──
/**
 * @typedef {{
 *   preserveMelody: boolean,           // préserver strictement la mélodie
 *   forceMelodyInSoprano: boolean,     // imposer la mélodie au soprano
 *   style: 'faithful' | 'gospel' | 'tense' | 'jazz',
 *   maxTension: number,                // 0-1
 *   allowedQualities: string[],        // ex: ['maj7', '7', 'm7', 'm7b5', 'dim7']
 *   minCommonTones: number,            // notes communes minimales avec l'original
 *   preferStepwiseBass: boolean,
 *   maxVoicingSpread: number           // demi-tons
 * }} ReharmonizationConstraints
 */

// ── Candidat d'accord ──
/**
 * @typedef {{
 *   rootPc: number,
 *   quality: string,          // symbole (ex: 'm7', '7b9')
 *   bassPc: number | null,    // null = fondamentale
 *   inversion: number,        // 0 = fondamentale en basse
 *   chordTonePcs: number[],   // pitch classes de l'accord
 *   containsMelodyNote: boolean,
 *   melodyNotePosition: 'soprano' | 'inner' | 'bass' | 'absent',
 *   characteristicNotesPreserved: string[],  // ex: ['3', '7']
 * }} ChordCandidate
 */

// ── Fonction harmonique ──
/**
 * @typedef {{
 *   degree: string,           // 'I', 'ii', 'V', etc.
 *   function: 'tonic' | 'subdominant' | 'dominant' | 'passing' | 'secondary',
 *   targetDegree: string | null  // degré cible pour les dominantes secondaires
 * }} HarmonicFunction
 */

// ── Transition entre deux candidats ──
/**
 * @typedef {{
 *   from: ChordCandidate,
 *   to: ChordCandidate,
 *   voiceLeadingScore: number,     // 0-1, conduite des voix
 *   bassMovement: number,          // demi-tons
 *   commonTones: number,
 *   resolutionScore: number,      // 0-1, préparation/résolution des tensions
 *   totalScore: number
 * }} CandidateTransition
 */

// ── Voicing concret pour un candidat ──
// Réutilise VoicingCandidate du voicing-engine
/**
 * @typedef {import('../voicing-engine/data-model.js').VoicingCandidate} VoicingCandidate
 * // Étendu avec :
 * // - melodyNoteMidi: number | null (la note de mélodie dans ce voicing)
 * // - melodyInSoprano: boolean
 */

// ── Chemin de réharmonisation complet ──
/**
 * @typedef {{
 *   id: string,
 *   style: string,
 *   tensionLevel: number,          // 0-1
 *   chords: ChordCandidate[],
 *   transitions: CandidateTransition[],
 *   voicings: VoicingCandidate[],
 *   totalScore: number,
 *   explanationKey: string         // clé pour le cache d'explication IA
 * }} ReharmonizationPath
 */

// ── Payload d'explication pour l'IA ──
/**
 * @typedef {{
 *   originalChords: { rootPc: number, quality: string }[],
 *   reharmonizedChords: { rootPc: number, quality: string, function: string }[],
 *   melodyEvents: MelodyEvent[],
 *   tonalContext: TonalContext,
 *   style: string,
 *   voiceLeadingSummary: { avgMovement: number, parallelFifths: number },
 *   tensionMap: number[]           // tension par position
 * }} ExplanationPayload
 */
```

### F.2 Emplacements recommandés

| Module | Fichier |
|--------|---------|
| Types MIDI/mélodie | `src/melody/midi-types.js` (nouveau) |
| Segmentation mélodique | `src/melody/melody-segmenter.js` (nouveau) |
| Moteur de réharmonisation | `src/melody/reharmonization-engine.js` (nouveau) |
| Contraintes + scoring | `src/melody/reharmonization-scorer.js` (nouveau) |
| Recherche de chemins | `src/melody/path-finder.js` (nouveau) |
| Explication IA | `src/melody/explanation-builder.js` (nouveau) |
| UI Réharmonisation | `src/ui/reharmonization-panel.js` (nouveau) |
| Piano-roll | `src/ui/piano-roll.js` (nouveau) |

---

## G. ALGORITHME RECOMMANDÉ

### G.1 Pipeline cible

```
1. Capture MIDI → MidiNoteEvent[]
2. Construction HeldNoteState par tranche de ~10ms
3. Segmentation en MelodyPhrase[] (silence > 500ms, changement de registre)
4. Détection TonalContext (key-detector.js existant)
5. Pour chaque MelodyPhrase :
   a. Génération ChordCandidate[] (substitutions diatoniques + emprunts)
   b. Filtrage : contient la note de mélodie, notes caractéristiques préservées
   c. Pour chaque paire (candidat_i, candidat_i+1) :
      - Calcul CandidateTransition (voice leading, résolution, common tones)
   d. Recherche du meilleur chemin (ReharmonizationPath)
   e. Génération VoicingCandidate[] pour le chemin retenu
   f. Construction ExplanationPayload → cache + IA (asynchrone)
6. Affichage : piano-roll + clavier + propositions
```

### G.2 Comparaison des approches de recherche

| Approche | Avantages | Inconvénients | Recommandation |
|----------|-----------|---------------|----------------|
| **Programmation dynamique** | Optimal, efficace O(n·k²) | Nécessite une fonction de score additive | ★ **Recommandé pour le MVP** |
| Beam search | Bon compromis qualité/performance | Paramètre beam width à tuner | Alternative si k > 50 |
| Recherche exhaustive | Garantit l'optimum global | O(k^n) — explosion pour n > 6 | Inacceptable |
| Règles gloutonnes | Simple, rapide | Qualité médiocre, pas de vision globale | Uniquement en fallback |

**Recommandation : Programmation dynamique** avec :
- États : `(position, chordCandidate)` 
- Transition : `CandidateTransition.totalScore`
- k limité à ~20 candidats par position (filtrage agressif)
- n ≤ 16 accords par phrase (typique)

### G.3 Scoring des transitions (ordre de priorité)

1. Présence de la note de mélodie (hard constraint)
2. Présence des notes caractéristiques (tierce + septième) (hard constraint)
3. Conduite des voix (mouvement minimal, pas de parallèles de quinte)
4. Fonction harmonique (préférer les progressions fonctionnelles)
5. Mouvement de basse (conjoint ou quarte/quinte préféré)
6. Tension (selon le niveau demandé)

---

## H. RISQUES

### Risques critiques

| # | Risque | Impact |
|---|--------|--------|
| R1 | **Représentation temporelle insuffisante** — le `note-grouper` écrase la timeline individuelle des notes. Impossible de distinguer mélodie et accompagnement sans refonte. | La mélodie ne peut pas être extraite |
| R2 | **Clé API exposée** — stockée dans `localStorage`, accessible au renderer, envoyée dans les requêtes fetch. | Fuite de credentials |
| R3 | **Confusion mélodie / soprano** — le système actuel ne distingue pas la note la plus aiguë de la note mélodique. | Réharmonisations incorrectes |

### Risques importants

| # | Risque | Impact |
|---|--------|--------|
| R4 | **Explosion combinatoire** — sans filtrage agressif, le nombre de candidats par position peut dépasser 100. | Performance inacceptable |
| R5 | **Voicings injouables** — le `voicing-engine` V1 ne supporte pas les extensions (9, 11, 13). Les propositions pourront être injouables. | Expérience utilisateur dégradée |
| R6 | **Erreurs enharmoniques** — C# et Db sont confondus. Une progression en Db majeur sera affichée C# majeur. | Confusion pour le musicien |
| R7 | **Pas de test de réharmonisation** — aucun test n'existe pour valider la qualité musicale des propositions. | Régressions silencieuses |

### Risques modérés

| # | Risque | Impact |
|---|--------|--------|
| R8 | **Logique dépendante de l'UI** — le `reharmonizer.js` actuel mélange génération et formatage. | Refactoring nécessaire |
| R9 | **Blocage du renderer** — la recherche de chemins peut être CPU-intensive. | UI gelée si pas de Web Worker |
| R10 | **Couplage Studio / Analyse** — `analyzer:process-file` dépend du Studio pour les stems. | Complexité de test |
| R11 | **Perte de données MIDI** — le `note-grouper` jette les notes après flush. | Impossible de reconstruire la timeline |

---

## I. PLAN PAR INCRÉMENTS

### Incrément 0 — Fondations (1-2 jours)
**Objectif :** Créer les types de données et le module de capture MIDI temporelle.

- Fichiers : `src/melody/midi-types.js` (nouveau), `src/melody/midi-capture.js` (nouveau)
- Prérequis : Aucun
- Tests : Validation des types JSDoc, test de capture/playback round-trip
- Critère d'acceptation : Une session MIDI enregistrée peut être rejouée note par note avec timestamps et vélocités corrects
- Rollback : Suppression des nouveaux fichiers
- Modèle IA : OpenCode / modèle puissant

### Incrément 1 — Segmentation mélodique (2-3 jours)
**Objectif :** Distinguer les notes mélodiques des notes d'accompagnement.

- Fichiers : `src/melody/melody-segmenter.js` (nouveau), `src/melody/melody-detector.js` (nouveau)
- Prérequis : Incrément 0
- Tests : Sessions de test avec mélodie + accords, vérification que la mélodie est correctement isolée
- Critère d'acceptation : Sur un enregistrement main droite (mélodie) + main gauche (accords), les notes mélodiques sont correctement identifiées
- Rollback : Suppression des nouveaux fichiers
- Modèle IA : Claude Code (logique musicale complexe)

### Incrément 2 — Génération de candidats d'accords (2-3 jours)
**Objectif :** Pour une note de mélodie et une tonalité données, générer tous les accords candidats possibles.

- Fichiers : `src/melody/chord-candidate-generator.js` (nouveau)
- Prérequis : Incrément 1, `chord-engine/chord-defs.js`, `analyzer/harmonic-utils.js`
- Tests : Corpus de référence (ex: note E♭ en Ab majeur → Fm7, A♭maj7, D♭6/9, etc.)
- Critère d'acceptation : Pour chaque note de la gamme, au moins 5 candidats valides sont générés, tous contenant la note mélodique
- Rollback : Suppression du nouveau fichier
- Modèle IA : Claude Code

### Incrément 3 — Scoring de transitions (2 jours)
**Objectif :** Calculer un score de qualité pour chaque transition entre deux accords candidats.

- Fichiers : `src/melody/reharmonization-scorer.js` (nouveau)
- Prérequis : Incrément 2, `analyzer/voice-leading.js`, `analyzer/scorer.js`
- Tests : Transitions connues (ex: II-V-I parfait = score élevé, triton → cluster = score bas)
- Critère d'acceptation : Le score reflète la qualité musicale (conduite des voix, résolution, fonction)
- Rollback : Suppression du nouveau fichier
- Modèle IA : OpenCode / modèle puissant

### Incrément 4 — Recherche de chemins (2-3 jours)
**Objectif :** Trouver le meilleur chemin de réharmonisation par programmation dynamique.

- Fichiers : `src/melody/path-finder.js` (nouveau)
- Prérequis : Incréments 2 et 3
- Tests : Progression de référence (Fm7 → A♭maj7 → D♭6/9 → Cm7 → F7(♭9) → B♭m7) avec la mélodie E♭3→A♭3→B♭3→C4→E♭4→F4
- Critère d'acceptation : Le chemin trouvé est musicalement cohérent et contient toutes les notes de mélodie
- Rollback : Suppression du nouveau fichier
- Modèle IA : Claude Code (algorithmique + théorie musicale)

### Incrément 5 — Génération de voicings avec contrainte de mélodie (2 jours)
**Objectif :** Étendre le `voicing-engine` pour accepter une note supérieure imposée.

- Fichiers : `src/voicing-engine/generate-voicing.js` (modification), `src/voicing-engine/candidate-generator.js` (modification)
- Prérequis : Incrément 4, `voicing-engine` existant
- Tests : Ajout de cas au corpus d'invariants avec `requiredTopNote`
- Critère d'acceptation : `generateVoicing(input, { requiredTopNote: 64 })` produit un voicing dont la note la plus aiguë est MIDI 64
- Rollback : Git revert
- Modèle IA : Claude Code

### Incrément 6 — UI de réharmonisation (3-4 jours)
**Objectif :** Interface utilisateur dans l'onglet Analyse.

- Fichiers : `src/ui/reharmonization-panel.js` (nouveau), `src/index.html` (modification), `src/ui/analyzer-tab.js` (modification)
- Prérequis : Incréments 0-5
- Tests : Test manuel checklist
- Critère d'acceptation : L'utilisateur peut sélectionner une source MIDI, voir la mélodie capturée, choisir un style, et visualiser 3 propositions de réharmonisation avec voicings jouables
- Rollback : Git revert
- Modèle IA : OpenCode / modèle puissant (UI) + Claude Code (intégration)

### Incrément 7 — Explication IA (2 jours)
**Objectif :** Générer des explications pédagogiques pour les réharmonisations.

- Fichiers : `src/melody/explanation-builder.js` (nouveau), `src/ai/ai-client.js` (modification)
- Prérequis : Incrément 6, `ai/ai-client.js` existant
- Tests : Vérification que l'IA ne reçoit que des données validées, jamais de notes à inventer
- Critère d'acceptation : Chaque proposition de réharmonisation est accompagnée d'une explication en français
- Rollback : Git revert
- Modèle IA : OpenCode / modèle puissant

---

## J. RÉPARTITION CLAUDE CODE / OPENCODE

| Tâche | Outil recommandé | Raison |
|-------|-----------------|--------|
| Types JSDoc, structures de données | OpenCode / modèle puissant | Mécanique, bien défini |
| Segmentation mélodique | Claude Code | Logique musicale complexe, heuristiques |
| Génération de candidats | Claude Code | Théorie musicale, connaissance des accords |
| Scoring de transitions | Claude Code | Théorie musicale, voice leading |
| Path finding (DP) | Claude Code | Algorithmique + contraintes musicales |
| Extension voicing-engine | Claude Code | Codebase existante complexe |
| UI (panneaux, piano-roll) | OpenCode / modèle puissant | HTML/CSS/JS standard |
| Intégration IA (prompts) | OpenCode / modèle puissant | Texte, API |
| Tests | OpenCode / modèle léger | Répétitif, bien spécifié |
| Documentation | OpenCode / modèle léger | Formatage |

---

## K. QUESTIONS RÉELLEMENT BLOQUANTES

1. **Faut-il une Web Worker pour la recherche de chemins ?** La DP sur 16 positions × 20 candidats = ~6400 transitions. C'est faisable dans le thread principal (< 50ms), mais si k augmente, un Worker sera nécessaire.

2. **Faut-il étendre le `voicing-engine` aux extensions (9, 11, 13) avant l'Incrément 5 ?** Sans ces extensions, les voicings gospel/jazz seront limités aux triades et septièmes. Le `vocabulary.js` les marque `futurePhase`.

3. **Comment gérer l'enharmonie ?** Faut-il un module dédié ou une correction a posteriori basée sur la tonalité ?

4. **L'écran de sélection de source (audio/vidéo/MIDI) doit-il être implémenté dans l'Incrément 6 ou peut-il attendre ?** Les maquettes le montrent, mais le premier MVP pourrait se limiter au MIDI.

5. **La clé API doit-elle être migrée vers le main process ?** Actuellement dans `localStorage` (renderer), ce qui est une faille de sécurité. Une migration vers le stockage sécurisé Electron (`safeStorage`) serait préférable mais peut attendre.

6. **Le `note-grouper` doit-il être refondu avant l'Incrément 1 ?** Il écrase la timeline. Une refonte ou un module parallèle est nécessaire pour conserver l'historique temporel complet.

---

*Rapport généré le 6 août 2026 — Lecture seule, aucun fichier modifié.*

---

## User

Révise uniquement le plan final de l’audit à partir des décisions suivantes.

Ne réaudite pas le dépôt depuis le début.
Ne modifie aucun fichier de production.
Conserve toutes les constatations factuelles déjà établies sur le dépôt.
Produis un PLAN V2 corrigé.

DÉCISIONS ARCHITECTURALES

1. Le premier MVP ne tentera pas de séparer automatiquement une performance
   complète en « main droite = mélodie » et « main gauche = harmonie ».

   Ce principe est musicalement incorrect :
   - la mélodie peutement incorrect :
   - la mélodie peut être une voix intérieure ;
   - elle n’est pas obligatoirement la note la plus aiguë ;
   - elle peut partager le même registre et la même main que l’harmonie.

2. Le MVP utilisera un workflow guidé :
   - capture explicite d’une piste Mélodie ;
   - saisie ou capture séparée du contexte harmonique ;
   - analyse et réharmonisation ensuite.

   La séparation automatique d’une performance complète sera une phase future.

3. Ne refonds pas note-grouper pour le premier incrément.
   Crée un module temporel parallèle et non destructif pour Analyse.
   L’onglet Entraînement doit continuer à utiliser son pipeline actuel.

4. Le contrat du générateur de voicings ne doit pas utiliser uniquement :

   requiredTopNote

   Il faut distinguer :
   - melodyPitch ;
   - preserveExactPitch ;
   - sopranoPolicy.

   sopranoPolicy doit au minimum permettre :
   - melody-must-be-top ;
   - allow-notes-above ;
   - free.

5. La mélodie doit pouvoir rester une voix intérieure tout en étant conservée
   à son octave MIDI exacte.

6. Ajouter à chaque événement mélodique une politique d’harmonisation :
   - force ;
   - automatic ;
   - skip.

7. La segmentation automatique par silence > 500 ms ne doit pas être une règle
   absolue codée en dur. Les sessions, marqueurs utilisateur, mesures et silences
   peuvent tous contribuer aux limites de phrase.

8. L’enharmonie doit être traitée par un module dédié dès les fondations :
   - pitch class sonore ;
   - orthographe ;
   - contexte tonal ;
   - fonction harmonique.

   Ne pas faire une correction de chaînes de caractères à la fin.

9. Le premier vocabulaire harmonique doit prévoir :
   - majeur, mineur ;
   - maj7, m7, 7, m7b5, dim7 ;
   - 6, m6, 6/9 ;
   - maj9, m9, 9 ;
   - 7sus4, 9sus4 ;
   - 7b9 ;
   - 13 limitée ;
   - renversements ;
   - substitutions diatoniques ;
   - dominantes secondaires ;
   - diminués d’approche.

10. Il n’est pas nécessaire de supporter toutes les extensions possibles avant
    les fondations. Mais le moteur doit prendre en charge les couleurs utiles
    ci-dessus avant l’interface finale « fidèle / gospel / plus tendue ».

11. La génération des candidats se fait par événement harmonique ou point
    d’ancrage de la phrase, pas arbitrairement pour chaque note de la gamme.

12. Ne fixe pas un minimum arbitraire de cinq candidats.
    Génère les candidats valides, filtre-les, puis conserve les meilleurs selon
    un plafond configurable.

13. La programmation dynamique reste le choix du MVP.

14. Aucun Web Worker n’est requis au départ.
    Le moteur doit cependant :
    - être pur ;
    - être appelé derrière une frontière asynchrone ;
    - être benchmarké ;
    - permettre une migration ultérieure vers un Worker.

15. Le scénario :
    Fm7 → Abmaj7 → Db6/9 → Cm7 → F7(b9) → Bbm7

    ne doit pas être une sortie codée en dur ni un critère d’égalité exacte.
    Il sert à vérifier des invariants musicaux et peut apparaître parmi plusieurs
    bons chemins.

16. La sélection Audio / Vidéo / MIDI ne fait pas partie du premier MVP.
    Les maquettes restent la cible future, mais le workflow initial peut ouvrir
    directement la capture MIDI.

17. La clé API doit être migrée hors de localStorage et du renderer avant toute
    nouvelle fonctionnalité IA :
    renderer → IPC → main process → API.
    Prévoir safeStorage ou le mécanisme sécurisé compatible avec le projet.

18. L’IA intervient uniquement après validation déterministe :
    - explication ;
    - comparaison ;
    - classement ;
    - adaptation pédagogique.
    Elle ne génère pas les notes servant de vérité finale.

PLAN V2 ATTENDU

Réécris les incréments selon cet ordre :

0. Capture MIDI temporelle non destructive
1. Capture explicite de la piste Mélodie
2. Contexte tonal et harmonique
3. Modèle enharmonique
4. Génération de candidats
5. Scoring des transitions
6. Recherche de chemins
7. Génération de voicings contextuels
8. Interface Réharmonisation
9. Sécurisation et explications IA
10. Sélection de source Audio / Vidéo / MIDI ultérieure

Pour chaque incrément, donne :

- objectif précis ;
- fichiers concernés selon l’audit réel ;
- fonctions ou interfaces principales ;
- prérequis ;
- tests ;
- critères d’acceptation ;
- rollback ;
- modèle recommandé :
  - Claude Code ;
  - OpenCode modèle puissant ;
  - OpenCode modèle léger.

Ajoute une section spécifique :

« Contrats de données corrigés »

avec au minimum :

- MidiNoteEvent ;
- MelodyEvent ;
- MelodyTrack ;
- HarmonicAnchor ;
- ReharmonizationConstraints ;
- SopranoPolicy ;
- HarmonizationPolicy ;
- SpelledPitch ;
- VoicingCandidate ;
- ReharmonizationPath.

Ajoute également une section :

« Invariants musicaux obligatoires »

Ne modifie aucun fichier.
Rends uniquement le rapport V2 final. 

---

## Assistant (Plan · deepseek-v4-pro · 76.5s)

_Thinking:_

The user wants me to revise the final plan from the audit report based on specific architectural decisions. I need to produce a PLAN V2 that:

1. Keeps all factual findings from the audit
2. Restructures the increments according to the new order
3. Incorporates all 18 architectural decisions
4. Adds "Contrats de données corrigés" section
5. Adds "Invariants musicaux obligatoires" section
6. Does NOT modify any files

Let me carefully go through each decision and restructure the plan accordingly.

Key changes from the decisions:
- No automatic melody/harmony separation in MVP
- Workflow: explicit melody capture → separate harmony context → analysis
- Don't refactor note-grouper; create parallel non-destructive module
- Voicing generator contract: melodyPitch, preserveExactPitch, sopranoPolicy (melody-must-be-top, allow-notes-above, free)
- Melody can be inner voice at exact MIDI octave
- HarmonizationPolicy per melody event: force, automatic, skip
- Segmentation: not just silence > 500ms; sessions, user markers, measures, silences all contribute
- Enharmony: dedicated module from foundations (pitch class, spelling, tonal context, harmonic function)
- Vocabulary: major, minor, maj7, m7, 7, m7b5, dim7, 6, m6, 6/9, maj9, m9, 9, 7sus4, 9sus4, 7b9, limited 13, inversions, diatonic substitutions, secondary dominants, approach diminished
- Candidates generated per harmonic anchor, not per scale note
- No fixed minimum of 5 candidates; generate valid, filter, keep best up to configurable cap
- DP remains MVP choice
- No Web Worker initially; engine must be pure, async boundary, benchmarkable, migratable
- Scenario is for invariant checking, not exact equality
- Audio/Video/MIDI selection NOT in first MVP
- API key must be migrated out of localStorage before any new IA feature
- IA only after deterministic validation (explanation, comparison, ranking, pedagogical adaptation)

New increment order:
0. Capture MIDI temporelle non destructive
1. Capture explicite de la piste Mélodie
2. Contexte tonal et harmonique
3. Modèle enharmonique
4. Génération de candidats
5. Scoring des transitions
6. Recherche de chemins
7. Génération de voicings contextuels
8. Interface Réharmonisation
9. Sécurisation et explications IA
10. Sélection de source Audio / Vidéo / MIDI ultérieure

Let me write this comprehensive V2plan.

# PLAN V2 — BRANCHE « MÉLODIE & RÉHARMONISATION »

> Révision du plan final de l'audit du 6 août 2026.
> Toutes les constatations factuelles de l'audit V1 restent valides.
> Ce document remplace uniquement les sections I (Plan par incréments), J (Répartition), F (Modèle de données), et G (Algorithme).

---

## I. PLAN PAR INCRÉMENTS — V2

---

### Incrément 0 — Capture MIDI temporelle non destructive

**Objectif :** Créer un module de capture MIDI parallèle à `note-grouper.js`, qui conserve la timeline complète des événements sans écraser l'historique. L'onglet Entraînement continue d'utiliser `note-grouper.js` sans modification.

**Fichiers concernés :**
- `src/melody/midi-capture.js` (nouveau) — module pur de capture temporelle
- `src/melody/midi-types.js` (nouveau) — définitions JSDoc des types MIDI

**Fonctions / interfaces principales :**
```js
// midi-capture.js
createMidiCapture() → { noteOn, noteOff, sustain, getEvents, getTimeline, clear, getDuration }
// midi-types.js
MidiNoteEvent, MidiTimeline, HeldNoteState
```

**Prérequis :** Aucun. Ne dépend pas de `note-grouper.js`.

**Tests :**
- Capture de 50 événements note-on/note-off → vérification que `getEvents()` retourne la liste complète triée par temps
- Round-trip : capture → `getEvents()` → `createPlayer().load()` → rejeu → les mêmes notes sont jouées
- `getTimeline(t)` retourne l'état des notes tenues à l'instant t
- La vélocité et le canal MIDI sont conservés

**Critère d'acceptation :**
- `createMidiCapture()` expose une timeline non destructive
- `note-grouper.js` n'est pas modifié
- Les événements incluent : `time`, `type`, `note`, `velocity`, `channel`
- `getTimeline(t)` reconstruit correctement l'état des notes à un instant donné

**Rollback :** Suppression des deux nouveaux fichiers.

**Modèle recommandé :** OpenCode / modèle puissant

---

### Incrément 1 — Capture explicite de la piste Mélodie

**Objectif :** Permettre à l'utilisateur d'enregistrer explicitement une piste Mélodie, distincte du contexte harmonique. Pas de séparation automatique. Chaque événement mélodique reçoit une `HarmonizationPolicy`.

**Fichiers concernés :**
- `src/melody/melody-track.js` (nouveau) — piste mélodique avec politique d'harmonisation
- `src/melody/midi-types.js` (modification) — ajout de `MelodyEvent`, `MelodyTrack`, `HarmonizationPolicy`
- `src/melody/midi-capture.js` (modification) — exposition pour le mode « capture mélodie »

**Fonctions / interfaces principales :**
```js
// melody-track.js
createMelodyTrack() → {
  startRecording, stopRecording,
  addEvent(midi, velocity, policy?),
  setHarmonizationPolicy(index, policy),
  getEvents() → MelodyEvent[],
  getPhrases() → MelodyPhrase[],
  addMarker(time, label),
  getMarkers()
}

// Types
MelodyEvent {
  midi, pitchClass, octave, startTime, duration, velocity,
  harmonizationPolicy: 'force' | 'automatic' | 'skip'
}
MelodyTrack {
  events: MelodyEvent[],
  markers: { time, label }[],
  duration
}
HarmonizationPolicy = 'force' | 'automatic' | 'skip'
```

**Prérequis :** Incrément 0

**Tests :**
- Enregistrement d'une mélodie de 8 notes → `getEvents()` retourne 8 `MelodyEvent` avec `harmonizationPolicy: 'automatic'` par défaut
- `setHarmonizationPolicy(2, 'force')` → l'événement 2 a `harmonizationPolicy: 'force'`
- `setHarmonizationPolicy(4, 'skip')` → l'événement 4 est marqué `skip`
- `addMarker(4.5, 'Pont')` → le marqueur est conservé
- `getPhrases()` segmente correctement selon les marqueurs et silences

**Critère d'acceptation :**
- L'utilisateur peut enregistrer une piste mélodie indépendante
- Chaque note a une politique d'harmonisation (force/automatic/skip)
- Les marqueurs utilisateur sont supportés
- La segmentation en phrases utilise les marqueurs, pas seulement les silences

**Rollback :** Suppression des nouveaux fichiers, revert des modifications.

**Modèle recommandé :** Claude Code (logique d'enregistrement + types)

---

### Incrément 2 — Contexte tonal et harmonique

**Objectif :** Saisir ou détecter le contexte tonal et le contexte harmonique (accords de référence) associés à la piste Mélodie. Réutilise `key-detector.js` et `harmonic-utils.js` existants.

**Fichiers concernés :**
- `src/melody/harmonic-context.js` (nouveau) — contexte tonal + accords de référence
- `src/melody/midi-types.js` (modification) — ajout de `TonalContext`, `HarmonicAnchor`
- `src/analyzer/key-detector.js` (réutilisation, pas de modification)
- `src/analyzer/harmonic-utils.js` (réutilisation, pas de modification)

**Fonctions / interfaces principales :**
```js
// harmonic-context.js
createHarmonicContext(tonalContext, anchors?) → HarmonicContext
detectTonalContext(melodyEvents) → TonalContext  // utilise key-detector.js
setTonalContext(tonicPc, mode) → TonalContext
addHarmonicAnchor(time, chordSymbol) → void
getAnchors() → HarmonicAnchor[]

// Types
TonalContext { tonicPc, mode, confidence, candidates }
HarmonicAnchor {
  time,               // position dans la piste mélodie
  rootPc, quality, bassPc,
  isUserDefined,      // true si saisi manuellement
  source              // 'manual' | 'detected' | 'imported'
}
```

**Prérequis :** Incrément 1, `key-detector.js`, `harmonic-utils.js`

**Tests :**
- Mélodie en Do majeur → `detectTonalContext()` retourne `{ tonicPc: 0, mode: 'major' }`
- `addHarmonicAnchor(2.0, 'Fm7')` → l'ancre est stockée avec `isUserDefined: true`
- Contexte sans ancre → `getAnchors()` retourne `[]`
- Détection de tonalité sur une mélodie chromatique → confidence faible, plusieurs candidats

**Critère d'acceptation :**
- Le contexte tonal est détectable automatiquement ou saisissable manuellement
- Les ancres harmoniques (accords de référence) sont associables à des positions temporelles
- La détection de tonalité existante (`key-detector.js`) est réutilisée sans modification

**Rollback :** Suppression de `harmonic-context.js`, revert des types.

**Modèle recommandé :** OpenCode / modèle puissant

---

### Incrément 3 — Modèle enharmonique

**Objectif :** Créer un module dédié à l'enharmonie, capable de distinguer la pitch class sonore de son orthographe, en fonction du contexte tonal et de la fonction harmonique. Pas de correction de chaînes a posteriori.

**Fichiers concernés :**
- `src/melody/enharmony.js` (nouveau) — module pur d'enharmonie
- `src/melody/midi-types.js` (modification) — ajout de `SpelledPitch`

**Fonctions / interfaces principales :**
```js
// enharmony.js
spellPitch(midi, tonalContext, harmonicFunction?) → SpelledPitch
spellChord(rootPc, quality, tonalContext) → SpelledChord
enharmonicEquivalent(spelledPitch) → SpelledPitch[]  // toutes les orthographes possibles
isDiatonic(spelledPitch, tonalContext) → boolean

// Types
SpelledPitch {
  midi: number,           // 0-127
  pitchClass: number,     // 0-11, invariant sonore
  letter: string,         // 'C'..'B'
  accidental: string,     // '', '#', 'b', 'x', 'bb'
  octave: number,         // C4=4
  displayName: string     // ex: 'Eb4'
}
SpelledChord {
  root: SpelledPitch,
  quality: string,
  bass: SpelledPitch | null,
  displayName: string     // ex: 'Ebm7/Gb'
}
```

**Prérequis :** Incrément 2 (`TonalContext`)

**Tests :**
- MIDI 63 en Do majeur → `spellPitch(63, { tonicPc: 0, mode: 'major' })` → `{ letter: 'E', accidental: 'b', displayName: 'Eb4' }`
- MIDI 63 en Si majeur → `{ letter: 'D', accidental: '#', displayName: 'D#4' }`
- `enharmonicEquivalent({ letter: 'E', accidental: 'b' })` inclut `{ letter: 'D', accidental: '#' }`
- `isDiatonic({ letter: 'F', accidental: '#' }, { tonicPc: 0, mode: 'major' })` → `true`
- `isDiatonic({ letter: 'F', accidental: '' }, { tonicPc: 0, mode: 'major' })` → `true`
- `spellChord(5, 'm7', { tonicPc: 0, mode: 'major' })` → `{ displayName: 'Fm7' }` (pas E#m7)

**Critère d'acceptation :**
- Même pitch class sonore → orthographe différente selon le contexte tonal
- Toutes les fonctions sont pures
- Aucune correction de chaîne de caractères en aval

**Rollback :** Suppression de `enharmony.js`, revert des types.

**Modèle recommandé :** Claude Code (théorie musicale + algorithmique)

---

### Incrément 4 — Génération de candidats d'accords

**Objectif :** Pour chaque `HarmonicAnchor` (point d'ancrage de la phrase), générer les accords candidats valides qui contiennent la note de mélodie et respectent le vocabulaire harmonique défini. Pas de minimum arbitraire : on génère, on filtre, on plafonne.

**Fichiers concernés :**
- `src/melody/chord-candidate-generator.js` (nouveau)
- `src/melody/midi-types.js` (modification) — ajout de `ChordCandidate`, `ReharmonizationConstraints`
- `src/chord-engine/chord-defs.js` (réutilisation)
- `src/analyzer/harmonic-utils.js` (réutilisation)

**Fonctions / interfaces principales :**
```js
// chord-candidate-generator.js
generateCandidates(anchor, melodyEvent, tonalContext, constraints) → ChordCandidate[]
filterByMelody(candidates, melodyEvent, constraints) → ChordCandidate[]
filterByVocabulary(candidates, constraints) → ChordCandidate[]
rankAndCap(candidates, maxCandidates) → ChordCandidate[]

// Types
ChordCandidate {
  rootPc, quality, bassPc, inversion,
  chordTonePcs: number[],
  containsMelodyNote: boolean,
  melodyNotePosition: 'soprano' | 'inner' | 'bass' | 'absent',
  characteristicNotesPreserved: string[],  // ex: ['3', '7']
  isDiatonic: boolean,
  harmonicFunction: string | null,         // ex: 'ii', 'V7/IV'
  source: 'diatonic' | 'secondary-dominant' | 'approach-diminished' | 'substitution' | 'borrowed'
}

ReharmonizationConstraints {
  preserveMelody: boolean,
  forceMelodyInSoprano: boolean,
  sopranoPolicy: 'melody-must-be-top' | 'allow-notes-above' | 'free',
  style: 'faithful' | 'gospel' | 'tense' | 'jazz',
  maxTension: number,
  allowedQualities: string[],
  minCommonTones: number,
  preferStepwiseBass: boolean,
  maxCandidatesPerAnchor: number
}
```

**Vocabulaire harmonique du MVP (décision 9) :**
- Triades : `''` (majeur), `'m'` (mineur)
- Septièmes : `'maj7'`, `'m7'`, `'7'`, `'m7b5'`, `'dim7'`
- Sixtes : `'6'`, `'m6'`, `'6/9'`
- Neuvièmes : `'maj9'`, `'m9'`, `'9'`
- Sus : `'7sus4'`, `'9sus4'`
- Altérations : `'7b9'`
- 13e limitée : `'13'` (dominant 13)
- Renversements : toute qualité + `bassPc`
- Substitutions diatoniques, dominantes secondaires, diminués d'approche

**Prérequis :** Incréments 2 et 3, `chord-defs.js`, `harmonic-utils.js`

**Tests :**
- Ancre Fm7, mélodie E♭4, tonalité A♭ majeur → candidats incluent Fm7, A♭maj7, D♭6/9 (contiennent tous E♭)
- Ancre B♭m7, mélodie F4, tonalité A♭ majeur → candidats incluent B♭m7, D♭maj7, G7(♭9) (contiennent tous F)
- `sopranoPolicy: 'melody-must-be-top'` → tous les candidats ont `melodyNotePosition: 'soprano'`
- `sopranoPolicy: 'allow-notes-above'` → certains candidats peuvent avoir des notes au-dessus de la mélodie
- `sopranoPolicy: 'free'` → pas de contrainte de position
- `maxCandidatesPerAnchor: 10` → au plus 10 candidats retournés
- Aucun candidat ne contient de note hors vocabulaire

**Critère d'acceptation :**
- Génération par ancre harmonique, pas par note de gamme
- Filtrage par mélodie, vocabulaire, et contraintes
- Plafonnement configurable, pas de minimum arbitraire
- Les trois `sopranoPolicy` sont respectées

**Rollback :** Suppression de `chord-candidate-generator.js`, revert des types.

**Modèle recommandé :** Claude Code (théorie musicale + génération combinatoire)

---

### Incrément 5 — Scoring des transitions

**Objectif :** Calculer un score de qualité pour chaque transition entre deux accords candidats successifs. Le score intègre la conduite des voix, la résolution des tensions, les notes communes, et la fonction harmonique.

**Fichiers concernés :**
- `src/melody/reharmonization-scorer.js` (nouveau)
- `src/melody/midi-types.js` (modification) — ajout de `CandidateTransition`
- `src/analyzer/voice-leading.js` (réutilisation)
- `src/analyzer/scorer.js` (réutilisation partielle)

**Fonctions / interfaces principales :**
```js
// reharmonization-scorer.js
scoreTransition(from, to, melodyEvent, tonalContext) → CandidateTransition
scoreVoiceLeading(fromPcs, toPcs) → { score, movements, parallelFifths }
scoreResolution(from, to, tonalContext) → number
scoreHarmonicFunction(from, to, tonalContext) → number
scoreBassMovement(from, to) → number

// Types
CandidateTransition {
  from: ChordCandidate,
  to: ChordCandidate,
  voiceLeadingScore: number,       // 0-1
  resolutionScore: number,         // 0-1
  harmonicFunctionScore: number,   // 0-1
  bassMovementScore: number,       // 0-1
  commonTones: number,
  parallelFifths: boolean,
  totalScore: number               // pondéré
}
```

**Prérequis :** Incrément 4, `voice-leading.js`

**Tests :**
- Transition II-V-I parfait (Dm7 → G7 → Cmaj7) → score élevé (> 0.8)
- Transition triton → cluster → score bas (< 0.3)
- Transition avec parallèles de quinte → `parallelFifths: true`, score réduit
- Transition avec note commune (Fm7 → B♭m7, note commune E♭) → `commonTones >= 1`
- Transition avec résolution de sensible (G7 → Cmaj7, B→C) → `resolutionScore` élevé

**Critère d'acceptation :**
- Chaque transition reçoit un score décomposé et un score total
- Les parallèles de quinte sont détectés
- La résolution des tensions (septièmes, altérations) est évaluée
- Le score est déterministe (mêmes entrées → même score)

**Rollback :** Suppression de `reharmonization-scorer.js`, revert des types.

**Modèle recommandé :** Claude Code (théorie musicale + scoring)

---

### Incrément 6 — Recherche de chemins

**Objectif :** Trouver les meilleurs chemins de réharmonisation par programmation dynamique sur la phrase complète. Le scénario de référence (Fm7 → A♭maj7 → D♭6/9 → Cm7 → F7(♭9) → B♭m7) sert à vérifier des invariants musicaux, pas comme critère d'égalité exacte.

**Fichiers concernés :**
- `src/melody/path-finder.js` (nouveau)
- `src/melody/midi-types.js` (modification) — ajout de `ReharmonizationPath`

**Fonctions / interfaces principales :**
```js
// path-finder.js
findBestPaths(anchors, melodyTrack, tonalContext, constraints) → ReharmonizationPath[]
// Algorithme : programmation dynamique
// États : (anchorIndex, chordCandidate)
// Transition : CandidateTransition.totalScore
// Retourne les N meilleurs chemins complets

// Types
ReharmonizationPath {
  id: string,
  style: string,
  tensionLevel: number,
  anchors: { time, chord: ChordCandidate }[],
  transitions: CandidateTransition[],
  totalScore: number,
  melodyRespected: boolean,       // toutes les notes 'force' et 'automatic' sont dans leur accord
  invariantsSatisfied: string[],  // liste des invariants vérifiés
}
```

**Prérequis :** Incréments 4 et 5

**Tests :**
- Scénario de référence : la mélodie E♭3→A♭3→B♭3→C4→E♭4→F4 en A♭ majeur produit au moins un chemin contenant Fm7→A♭maj7→D♭6/9→Cm7→F7(♭9)→B♭m7 **ou une variante proche** (le test vérifie des invariants, pas l'égalité exacte)
- Invariants testés :
  - Chaque note de mélodie est présente dans son accord
  - La progression commence sur Fm7 (ou substitut diatonique proche)
  - La progression se termine sur B♭m7 (ou substitut diatonique proche)
  - Les fonctions harmoniques sont cohérentes (pas de V→IV sans préparation)
- Phrase de 8 ancres avec 15 candidats par ancre → `findBestPaths` termine en < 200ms
- `sopranoPolicy: 'melody-must-be-top'` → tous les accords du chemin ont la mélodie au soprano
- `sopranoPolicy: 'free'` → la mélodie peut être une voix intérieure
- Note avec `harmonizationPolicy: 'skip'` → aucun accord n'est généré pour cette position
- Note avec `harmonizationPolicy: 'force'` → l'accord contient obligatoirement cette note

**Critère d'acceptation :**
- Programmation dynamique, pas de recherche exhaustive
- Plusieurs chemins retournés (top-N)
- Le moteur est pur, appelable derrière une frontière asynchrone
- Benchmark inclus dans les tests
- Le scénario de référence est un test d'invariants, pas d'égalité

**Rollback :** Suppression de `path-finder.js`, revert des types.

**Modèle recommandé :** Claude Code (algorithmique + théorie musicale)

---

### Incrément 7 — Génération de voicings contextuels

**Objectif :** Étendre le `voicing-engine` existant pour accepter des contraintes de mélodie : `melodyPitch`, `preserveExactPitch`, et `sopranoPolicy`. La mélodie peut rester une voix intérieure tout en étant conservée à son octave MIDI exacte.

**Fichiers concernés :**
- `src/voicing-engine/generate-voicing.js` (modification) — nouvelle option `melodyConstraint`
- `src/voicing-engine/candidate-generator.js` (modification) — filtrage par contrainte de mélodie
- `src/voicing-engine/constraints.js` (modification) — validation de la contrainte de mélodie
- `src/voicing-engine/data-model.js` (modification) — ajout de `MelodyConstraint` aux métadonnées
- `src/voicing-engine/corpus-invariants.js` (modification) — nouveaux cas avec mélodie
- `src/voicing-engine/test-voicing-phase2.js` (modification) — tests des contraintes de mélodie

**Fonctions / interfaces principales :**
```js
// generate-voicing.js — signature étendue
generateVoicing(input, options) → VoicingResult
// options.melodyConstraint: {
//   melodyPitch: number | null,        // MIDI exact de la note de mélodie
//   preserveExactPitch: boolean,       // true = conserver l'octave exacte
//   sopranoPolicy: 'melody-must-be-top' | 'allow-notes-above' | 'free'
// }

// constraints.js — nouvelle validation
checkMelodyConstraint(candidate, melodyConstraint) → ConstraintResult
// Vérifie que :
// - si melodyPitch != null et preserveExactPitch : la note exacte est présente
// - si melodyPitch != null et !preserveExactPitch : la pitch class est présente
// - si sopranoPolicy === 'melody-must-be-top' : aucune note > melodyPitch
// - si sopranoPolicy === 'allow-notes-above' : la mélodie est présente, d'autres notes peuvent être au-dessus
// - si sopranoPolicy === 'free' : pas de contrainte de position
```

**Prérequis :** Incrément 6, `voicing-engine` existant

**Tests :**
- `generateVoicing(input, { melodyConstraint: { melodyPitch: 64, preserveExactPitch: true, sopranoPolicy: 'melody-must-be-top' } })` → le voicing contient MIDI 64 et aucune note > 64
- `melodyPitch: 64, preserveExactPitch: false` → le voicing contient la pitch class 4 (E) mais pas nécessairement MIDI 64
- `sopranoPolicy: 'allow-notes-above'` → le voicing contient la mélodie, d'autres notes peuvent être plus aiguës
- `sopranoPolicy: 'free'` → pas de contrainte de position
- Mélodie en voix intérieure : `melodyPitch: 60, sopranoPolicy: 'allow-notes-above'` → MIDI 60 présent, note plus aiguë possible
- Cas ajoutés au corpus d'invariants

**Critère d'acceptation :**
- Les trois `sopranoPolicy` sont respectées
- `preserveExactPitch: true` conserve l'octave MIDI exacte
- `preserveExactPitch: false` conserve uniquement la pitch class
- La mélodie peut être une voix intérieure
- Les tests du `voicing-engine` existant ne régressent pas

**Rollback :** Git revert des modifications.

**Modèle recommandé :** Claude Code (modification du moteur existant)

---

### Incrément 8 — Interface Réharmonisation

**Objectif :** Créer l'interface utilisateur de réharmonisation dans l'onglet Analyse. Workflow : capture mélodie → saisie/contexte harmonique → réharmonisation → visualisation des propositions.

**Fichiers concernés :**
- `src/ui/reharmonization-panel.js` (nouveau) — panneau principal de réharmonisation
- `src/ui/melody-piano-roll.js` (nouveau) — piano-roll pour la piste mélodie
- `src/ui/reharmonization-results.js` (nouveau) — affichage des propositions
- `src/index.html` (modification) — ajout des conteneurs UI dans `#analysis-tab`
- `src/ui/analyzer-tab.js` (modification) — intégration du nouveau panneau
- `src/main.js` (modification) — initialisation du panneau

**Fonctions / interfaces principales :**
```js
// reharmonization-panel.js
initReharmonizationPanel(container) → ReharmonizationPanel
// États : idle → recording-melody → editing-harmony → reharmonizing → results

// melody-piano-roll.js
renderMelodyPianoRoll(melodyTrack, tonalContext) → void
// Affiche les notes de mélodie avec :
// - couleur par politique d'harmonisation (force=rouge, automatic=bleu, skip=gris)
// - marqueurs utilisateur
// - contexte tonal

// reharmonization-results.js
renderReharmonizationPaths(paths, melodyTrack) → void
// Pour chaque chemin :
// - nom du style et niveau de tension
// - timeline des accords
// - mini-clavier pour chaque accord
// - bouton de prévisualisation audio
```

**Prérequis :** Incréments 0 à 7

**Tests :**
- Test manuel : checklist complète du workflow
- Ouverture du panneau → état `idle`
- Clic "Enregistrer mélodie" → état `recording-melody`, le piano-roll s'anime
- Fin d'enregistrement → état `editing-harmony`, les notes apparaissent dans le piano-roll
- Saisie de la tonalité + ancres → état prêt pour réharmonisation
- Clic "Réharmoniser" → état `reharmonizing`, loader
- Résultats affichés → état `results`, 3 chemins visibles
- Clic sur un chemin → prévisualisation audio + clavier

**Critère d'acceptation :**
- Workflow complet fonctionnel sans erreur
- Le piano-roll affiche les notes avec les couleurs de politique
- Les propositions sont visualisables et pré-écoutables
- L'interface est intégrée dans l'onglet Analyse existant

**Rollback :** Git revert des modifications.

**Modèle recommandé :** OpenCode / modèle puissant (UI) + Claude Code (intégration)

---

### Incrément 9 — Sécurisation et explications IA

**Objectif :** Migrer la clé API hors de `localStorage` (renderer → main process), puis ajouter les explications IA pour les chemins de réharmonisation. L'IA intervient uniquement après validation déterministe.

**Fichiers concernés :**
- `electron/main.js` (modification) — nouveaux IPCs pour le stockage sécurisé et les appels API
- `electron/preload.cjs` (modification) — exposition des nouveaux IPCs
- `src/ai/openai-config.js` (modification) — migration du stockage vers IPC
- `src/ai/ai-client.js` (modification) — appels API via main process, nouveau prompt d'explication
- `src/melody/explanation-builder.js` (nouveau) — construction du payload d'explication

**Fonctions / interfaces principales :**
```js
// electron/main.js — nouveaux IPCs
'ai:store-key'       → safeStorage.encryptString(key) → fichier
'ai:get-key'         → fichier → safeStorage.decryptString()
'ai:chat-completion' → fetch API (dans le main process)

// preload.cjs — nouvelle exposition
ai: {
  storeKey, getKey, chatCompletion
}

// explanation-builder.js
buildExplanationPayload(path, melodyTrack, tonalContext) → ExplanationPayload
// Construit un payload JSON strict, sans notes à inventer :
// - accords originaux (si disponibles)
// - accords réharmonisés avec fonction harmonique
// - événements de mélodie (sans les vélocités)
// - contexte tonal
// - résumé de conduite des voix
// - carte de tension par position

// ai-client.js — nouveau rôle
explainReharmonization(path, melodyTrack, tonalContext) → string
// Prompt système : "Tu es un professeur de piano jazz. Explique en français
// pourquoi cette réharmonisation fonctionne. Ne modifie aucune note.
// Décris : la fonction de chaque accord, la conduite des voix, les tensions utilisées."
```

**Prérequis :** Incrément 8, `ai-client.js` existant

**Tests :**
- `ai:store-key` → la clé n'est plus dans `localStorage`
- `ai:get-key` → retourne la clé déchiffrée (test avec clé factice)
- `ai:chat-completion` → l'appel API transite par le main process
- `buildExplanationPayload` → le payload ne contient que des données validées
- `explainReharmonization` → retourne une explication en français sans notes inventées

**Critère d'acceptation :**
- La clé API n'est plus accessible dans le renderer (DevTools)
- Les appels API passent par le main process
- L'IA reçoit uniquement des données déjà validées par le moteur déterministe
- L'IA produit des explications, pas des notes

**Rollback :** Git revert des modifications. La clé dans `localStorage` reste fonctionnelle en fallback.

**Modèle recommandé :** Claude Code (sécurité + intégration)

---

### Incrément 10 — Sélection de source Audio / Vidéo / MIDI (phase future)

**Objectif :** Implémenter l'écran de sélection de source conforme aux maquettes, avec classification des vidéos et intégration du pipeline d'analyse audio complet. Cette phase est planifiée mais non détaillée ici car elle sort du premier MVP.

**Fichiers concernés (indicatif) :**
- `src/ui/source-selector.js` (nouveau)
- `src/ui/analyzer-tab.js` (modification)
- `src/index.html` (modification)

**Prérequis :** Incréments 0 à 9, pipeline d'analyse audio existant

**Modèle recommandé :** OpenCode / modèle puissant (UI) + Claude Code (intégration)

---

## CONTRATS DE DONNÉES CORRIGÉS

### MidiNoteEvent
```js
/**
 * Événement MIDI brut capturé, non destructif.
 * @typedef {{
 *   time: number,          // secondes depuis début capture
 *   type: 'note_on' | 'note_off',
 *   note: number,          // MIDI 0-127
 *   velocity: number,      // 0-1
 *   channel: number        // 0-15
 * }} MidiNoteEvent
 */
```
**Fichier :** `src/melody/midi-types.js`

### MelodyEvent
```js
/**
 * Note de mélodie avec politique d'harmonisation.
 * @typedef {{
 *   midi: number,                    // MIDI 0-127
 *   pitchClass: number,              // 0-11, invariant sonore
 *   octave: number,                  // C4=4
 *   startTime: number,               // secondes
 *   duration: number,                // secondes
 *   velocity: number,                // 0-1
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   spelled: SpelledPitch | null     // null tant que le contexte tonal n'est pas défini
 * }} MelodyEvent
 */
```
**Fichier :** `src/melody/midi-types.js`

### MelodyTrack
```js
/**
 * Piste mélodique complète.
 * @typedef {{
 *   id: string,
 *   events: MelodyEvent[],
 *   markers: { time: number, label: string }[],
 *   duration: number,
 *   tonalContext: TonalContext | null
 * }} MelodyTrack
 */
```
**Fichier :** `src/melody/midi-types.js`

### HarmonicAnchor
```js
/**
 * Point d'ancrage harmonique dans la phrase.
 * @typedef {{
 *   time: number,                    // position dans la piste mélodie
 *   rootPc: number,                  // 0-11
 *   quality: string,                 // symbole (ex: 'm7')
 *   bassPc: number | null,           // null = fondamentale
 *   isUserDefined: boolean,
 *   source: 'manual' | 'detected' | 'imported'
 * }} HarmonicAnchor
 */
```
**Fichier :** `src/melody/midi-types.js`

### ReharmonizationConstraints
```js
/**
 * Contraintes de réharmonisation.
 * @typedef {{
 *   preserveMelody: boolean,              // préserver strictement la mélodie
 *   sopranoPolicy: 'melody-must-be-top' | 'allow-notes-above' | 'free',
 *   style: 'faithful' | 'gospel' | 'tense' | 'jazz',
 *   maxTension: number,                   // 0-1
 *   allowedQualities: string[],           // ex: ['maj7', '7', 'm7', 'm7b5', 'dim7']
 *   minCommonTones: number,               // notes communes minimales avec l'original
 *   preferStepwiseBass: boolean,
 *   maxCandidatesPerAnchor: number,       // plafond configurable
 *   useSecondaryDominants: boolean,
 *   useApproachDiminished: boolean,
 *   useDiatonicSubstitutions: boolean
 * }} ReharmonizationConstraints
 */
```
**Fichier :** `src/melody/midi-types.js`

### SopranoPolicy
```js
/**
 * Politique de position de la mélodie dans le voicing.
 * @typedef {'melody-must-be-top' | 'allow-notes-above' | 'free'} SopranoPolicy
 *
 * - 'melody-must-be-top' : la note de mélodie est la plus aiguë du voicing.
 *   Aucune note du voicing n'a un MIDI > melodyPitch.
 * - 'allow-notes-above' : la note de mélodie est présente dans le voicing,
 *   mais d'autres notes peuvent être plus aiguës. La mélodie peut être une
 *   voix intérieure.
 * - 'free' : aucune contrainte de position. La mélodie peut être absente
 *   du voicing (ex: confiée à un autre instrument).
 */
```
**Fichier :** `src/melody/midi-types.js`

### HarmonizationPolicy
```js
/**
 * Politique d'harmonisation d'une note de mélodie.
 * @typedef {'force' | 'automatic' | 'skip'} HarmonizationPolicy
 *
 * - 'force' : l'accord généré DOIT contenir cette note exacte (MIDI + octave).
 *   Si preserveExactPitch est true, l'octave MIDI est conservée.
 * - 'automatic' : l'accord généré doit contenir cette note (pitch class),
 *   mais l'octave peut être adaptée par le moteur de voicing.
 * - 'skip' : cette note n'est pas harmonisée (passage mélodique seul,
 *   note de passage, broderie). Aucun accord n'est généré pour cette position.
 */
```
**Fichier :** `src/melody/midi-types.js`

### SpelledPitch
```js
/**
 * Pitch class avec orthographe enharmonique.
 * @typedef {{
 *   midi: number,              // 0-127
 *   pitchClass: number,        // 0-11, invariant sonore
 *   letter: string,            // 'C'..'B'
 *   accidental: string,        // '', '#', 'b', 'x', 'bb'
 *   octave: number,            // C4=4
 *   displayName: string        // ex: 'Eb4', 'F#3'
 * }} SpelledPitch
 */
```
**Fichier :** `src/melody/midi-types.js`

### VoicingCandidate (extension du type existant)
```js
/**
 * Extension du VoicingCandidate du voicing-engine.
 * Les champs ci-dessous s'ajoutent aux champs existants dans
 * src/voicing-engine/data-model.js.
 *
 * Champs ajoutés :
 * @property {number | null} melodyNoteMidi - MIDI de la note de mélodie dans ce voicing
 * @property {boolean} melodyInSoprano - true si la mélodie est la note la plus aiguë
 * @property {boolean} melodyExactPitch - true si l'octave MIDI exacte est respectée
 * @property {SopranoPolicy} sopranoPolicy - politique appliquée
 */
```
**Fichier :** `src/voicing-engine/data-model.js` (modification)

### ReharmonizationPath
```js
/**
 * Chemin de réharmonisation complet pour une phrase.
 * @typedef {{
 *   id: string,
 *   style: string,
 *   tensionLevel: number,                    // 0-1
 *   anchors: { time: number, chord: ChordCandidate }[],
 *   transitions: CandidateTransition[],
 *   voicings: VoicingCandidate[],            // générés à la demande
 *   totalScore: number,
 *   melodyRespected: boolean,
 *   invariantsSatisfied: string[],
 *   explanationKey: string | null            // clé de cache pour l'explication IA
 * }} ReharmonizationPath
 */
```
**Fichier :** `src/melody/midi-types.js`

---

## INVARIANTS MUSICAUX OBLIGATOIRES

Ces invariants doivent être vérifiés par les tests de régression. Ils ne sont pas codés en dur dans le moteur, mais servent de garde-fous.

### I1 — Présence de la mélodie
> Toute note de mélodie avec `harmonizationPolicy: 'force'` ou `'automatic'` doit être présente dans l'accord généré pour sa position.
> - `'force'` + `preserveExactPitch: true` → MIDI exact présent
> - `'force'` + `preserveExactPitch: false` → pitch class présente
> - `'automatic'` → pitch class présente

### I2 — Notes caractéristiques
> Pour tout accord de septième (maj7, m7, 7, m7b5, dim7), la tierce et la septième doivent être présentes dans le voicing, sauf omission explicite documentée.

### I3 — Conduite des voix
> Entre deux accords successifs, le mouvement de chaque voix ne doit pas dépasser une quarte juste (5 demi-tons) sauf pour la basse.

### I4 — Pas de parallèles de quinte
> Deux voix consécutives ne doivent pas former des quintes parallèles (mouvement de 7 demi-tons dans la même direction).

### I5 — Résolution de la sensible
> Dans une progression V7→I (ou V7→i), la sensible (tierce de l'accord de dominante) doit résoudre vers le haut d'un demi-ton vers la tonique, sauf si elle est conduite vers la quinte du I.

### I6 — Résolution de la septième
> Dans une progression V7→I, la septième de l'accord de dominante doit résoudre vers le bas par mouvement conjoint.

### I7 — Fonction harmonique cohérente
> Une progression ne doit pas contenir de séquence V→IV sans préparation (ex: dominante secondaire ou accord de passage).

### I8 — Registre jouable
> Toute note de voicing doit être dans la plage MIDI 36-84 (C2-C6) pour une main, sauf la basse qui peut descendre jusqu'à MIDI 28 (E1).

### I9 — Span maximal
> L'écart entre la note la plus grave et la plus aiguë d'une main ne doit pas dépasser 12 demi-tons (main gauche) ou 16 demi-tons (main droite).

### I10 — Orthographe enharmonique cohérente
> Dans une tonalité donnée, les notes diatoniques doivent utiliser l'orthographe de la gamme. Exemple : en A♭ majeur, utiliser E♭ et non D#.

### I11 — Pas de doublure de sensible
> La sensible (7e degré) ne doit pas être doublée dans un voicing.

### I12 — Scénario de référence (test d'invariants, pas d'égalité)
> Pour la mélodie E♭3→A♭3→B♭3→C4→E♭4→F4 en A♭ majeur, style gospel-jazz :
> - Le chemin doit commencer par un accord contenant F, A♭, C, E♭ (Fm7 ou substitut)
> - Le chemin doit se terminer par un accord contenant B♭, D♭, F, A♭ (B♭m7 ou substitut)
> - Chaque note de mélodie est présente dans son accord
> - La progression Fm7 → A♭maj7 → D♭6/9 → Cm7 → F7(♭9) → B♭m7 est un chemin valide parmi d'autres
> - Le test vérifie que ce chemin apparaît dans le top-5, pas qu'il est le seul

---

## J. RÉPARTITION CLAUDE CODE / OPENCODE — V2

| Incrément | Tâche | Outil | Raison |
|-----------|-------|-------|--------|
| 0 | Capture MIDI non destructive | OpenCode / puissant | Mécanique, bien spécifié |
| 1 | Capture piste Mélodie | Claude Code | Logique d'enregistrement + types musicaux |
| 2 | Contexte tonal et harmonique | OpenCode / puissant | Intégration de modules existants |
| 3 | Modèle enharmonique | Claude Code | Théorie musicale + algorithmique pure |
| 4 | Génération de candidats | Claude Code | Théorie musicale + combinatoire |
| 5 | Scoring des transitions | Claude Code | Théorie musicale + voice leading |
| 6 | Recherche de chemins (DP) | Claude Code | Algorithmique + contraintes musicales |
| 7 | Voicings contextuels | Claude Code | Modification du moteur existant |
| 8 | Interface Réharmonisation | OpenCode / puissant | HTML/CSS/JS standard |
| 9 | Sécurisation + Explications IA | Claude Code | Sécurité Electron + prompts |
| 10 | Sélection de source | OpenCode / puissant | UI, phase future |

---

*Plan V2 — 6 août 2026. Lecture seule, aucun fichier modifié.*

---

## User

Effectue une dernière révision ciblée du PLAN V2.

Ne réaudite pas le dépôt.
Ne modifie aucun fichier.
Conserve l’ordre actuel des incréments et toutes les constatations factuelles.
Corrige uniquement les contrats musicaux, les invariants et la répartition
détaillée des règles.

==================================================
1. SÉPARER LES RÈGLES
==================================================

Remplace la liste unique « Invariants musicaux obligatoires » par trois groupes :

A. HARD CONSTRAINTS
Une violation invalide le candidat ou le chemin.

B. SOFT HEURISTICS
Une violation modifie le score, mais ne rejette pas automatiquement le résultat.

C. STYLE-DEPENDENT RULES
Les poids et tolérances dépendent du profil musical :
- classical
- jazz
- gospel
- pop
- neo-soul
- free

==================================================
2. HARD CONSTRAINTS
==================================================

Inclure au minimum :

- intégrité des événements MIDI ;
- absence de notes bloquées après la fin d’une session ;
- respect de melodyPitch selon preserveExactPitch ;
- respect de sopranoPolicy ;
- respect de harmonizationPolicy ;
- respect des accords initial/final lorsqu’ils sont imposés ;
- présence des intervalles identitaires obligatoires ;
- compatibilité avec le profil de jouabilité lorsqu’il est en mode strict ;
- cohérence des références eventId / anchorId ;
- validité de l’orthographe enharmonique stockée.

Ne considère pas automatiquement comme hard constraints :

- mouvement maximal d’une quarte ;
- quintes parallèles ;
- résolution de la sensible ;
- résolution de la septième ;
- V vers IV ;
- doublure de sensible.

==================================================
3. SOFT HEURISTICS
==================================================

Déplacer dans les préférences scorées :

- mouvement minimal des voix ;
- pénalité progressive des grands sauts ;
- conservation des notes communes ;
- résolution de la sensible ;
- résolution de la septième de dominante ;
- parallèles de quinte et d’octave ;
- doublure de sensible ;
- mouvements conjoints ;
- stabilité du registre ;
- équilibre entre les mains ;
- cohérence fonctionnelle ;
- préparation et résolution des tensions ;
- variété harmonique.

Les poids doivent dépendre du StyleProfile.

Supprimer complètement comme règle universelle :

« Une progression ne doit pas contenir V → IV sans préparation. »

V → IV doit rester possible, particulièrement en blues, pop et gospel.

==================================================
4. IDENTITÉ DES ACCORDS
==================================================

Ne définis pas l’identité de tous les accords de septième uniquement par
« tierce + septième ».

Prévoir un mapping par qualité, par exemple :

maj7  : [3, 7]
m7    : [b3, b7]
7     : [3, b7]
m7b5  : [b3, b5, b7]
dim7  : [b3, b5, bb7]
7sus4 : [4, b7]
9sus4 : [4, b7, 9]

Prévoir :
- identityIntervals ;
- optionalIntervals ;
- omittedIntervals ;
- omissionReason.

Tenir compte du fait que dim7 est symétrique et peut être contextuellement ambigu.

==================================================
5. COMPATIBILITÉ MÉLODIQUE
==================================================

Ne limite pas la validation à :
« la pitch class de la mélodie doit appartenir à l’accord ».

Créer une classification conceptuelle :

- chord-tone ;
- available-tension ;
- suspension ;
- non-chord-tone-allowed ;
- incompatible.

Une note de passage ou une appoggiature peut être tolérée sans appartenir
strictement à la structure de l’accord, selon :
- harmonizationPolicy ;
- durée ;
- position métrique ;
- style ;
- résolution prévue.

Conserver :
- preserveExactPitch ;
- sopranoPolicy ;
- harmonizationPolicy.

==================================================
6. JOUABILITÉ CONFIGURABLE
==================================================

Remplacer les limites universelles de registre et d’écartement par un
PlayabilityProfile configurable comprenant au minimum :

- leftHandMin ;
- leftHandMax ;
- rightHandMin ;
- rightHandMax ;
- leftHandMaxSpan ;
- rightHandMaxSpan ;
- allowRolledChords ;
- allowHandRedistribution ;
- strictPlayability.

Lorsque strictPlayability est false, certaines limites deviennent des pénalités,
pas des rejets.

==================================================
7. CONTRATS DE VALIDATION
==================================================

Dans ReharmonizationPath, remplace les champs trop généraux :

- melodyRespected: boolean
- invariantsSatisfied: string[]

par un rapport structuré conceptuellement :

validationReport: {
  valid: boolean,
  hardViolations: ValidationIssue[],
  warnings: ValidationIssue[],
  satisfiedConstraints: string[],
  melodyChecks: MelodyValidationResult[]
}

Les ancres doivent utiliser :
- anchorId ;
- melodyEventId ;
- time uniquement comme donnée complémentaire.

Si les voicings sont générés à la demande, le champ voicings doit être facultatif
ou traité comme un cache, pas comme une donnée toujours obligatoire.

==================================================
8. SCÉNARIO DE RÉFÉRENCE
==================================================

Conserver le scénario Fm7 → Bbm7 comme test d’invariants.

Ne pas exiger que chaque note soit nécessairement une note constitutive stricte :
une note peut être une tension ou une note étrangère autorisée.

Ne pas exiger une égalité exacte avec la progression de référence.

Vérifier plutôt :
- respect des politiques mélodiques ;
- compatibilité harmonique ;
- jouabilité ;
- cohérence des transitions ;
- diversité des chemins ;
- absence de violations strictes.

==================================================
9. RÉPARTITION DES MODÈLES
==================================================

Pour l’Incrément 0 :

- implémentation initiale : OpenCode / DeepSeek V4 Pro ;
- tests détaillés : OpenCode / modèle léger ou Flash ;
- une revue architecturale et de sûreté : Claude Code en une seule session ;
- Claude ne réimplémente pas automatiquement le module si la revue passe.

Les cas de test obligatoires de la capture MIDI sont :

- note-on / note-off normal ;
- note-on vélocité 0 ;
- répétition de la même note avant relâchement ;
- accords simultanés ;
- sustain CC64 ;
- relâchement pendant sustain ;
- fin de sustain ;
- déconnexion MIDI ;
- arrêt forcé de session ;
- plusieurs canaux ;
- horloge monotone ;
- aucune note bloquée après finalize().

==================================================
10. SORTIE
==================================================

Rends uniquement :

1. les contrats de données corrigés ;
2. la nouvelle classification Hard / Soft / Style-dependent ;
3. le StyleProfile ;
4. le PlayabilityProfile ;
5. le ValidationReport ;
6. les modifications nécessaires au plan des incréments ;
7. la répartition finale des modèles.

Ne modifie aucun fichier. 

---

## Assistant (Plan · deepseek-v4-pro · 65.3s)

_Thinking:_

The user wants me to revise the PLAN V2 with specific corrections to the musical contracts, invariants, and model distribution. I need to produce a focused revision document that covers:

1. Corrected data contracts
2. New Hard/Soft/Style-dependent classification
3. StyleProfile
4. PlayabilityProfile
5. ValidationReport
6. Modifications to the increment plan
7. Final model distribution

I must NOT modify any files. This is a read-only planning exercise.

Let me carefully go through each requirement and produce the revised document.

Key changes needed:
- Split invariants into Hard Constraints, Soft Heuristics, Style-Dependent Rules
- Move several items from hard to soft (parallel fifths, voice leading limits, etc.)
- Remove "V→IV without preparation" as a universal rule
- Define identity intervals per quality, not just "3rd + 7th"
- Create melody compatibility classification (chord-tone, available-tension, suspension, etc.)
- Replace fixed playability limits with PlayabilityProfile
- Replace simple validation fields with structured ValidationReport
- Update model distribution for Increment 0 specifically
- Add mandatory MIDI capture test cases

Let me write this outcomprehensively.

# RÉVISION CIBLÉE DU PLAN V2

> Lecture seule. Corrige uniquement les contrats musicaux, invariants, et répartition.
> Conserve l'ordre des incréments et toutes les constatations factuelles de l'audit V1 et du plan V2.

---

## 1. CONTRATS DE DONNÉES CORRIGÉS

### 1.1 ChordCandidate — identité par qualité

```js
/**
 * Candidat d'accord avec identité harmonique explicite.
 * @typedef {{
 *   rootPc: number,
 *   quality: string,
 *   bassPc: number | null,
 *   inversion: number,
 *   chordTonePcs: number[],
 *
 *   identityIntervals: string[],       // ex: ['3', 'b7'] pour un accord 7
 *   optionalIntervals: string[],       // ex: ['5', '9'] pour un accord 7
 *   omittedIntervals: string[],        // intervalles absents du voicing
 *   omissionReason: string | null,     // ex: 'shell-voicing', 'voice-leading'
 *
 *   melodyCompatibility: 'chord-tone' | 'available-tension' | 'suspension'
 *                       | 'non-chord-tone-allowed' | 'incompatible',
 *
 *   containsMelodyNote: boolean,
 *   melodyNotePosition: 'soprano' | 'inner' | 'bass' | 'absent',
 *
 *   isDiatonic: boolean,
 *   harmonicFunction: string | null,
 *   source: 'diatonic' | 'secondary-dominant' | 'approach-diminished'
 *          | 'substitution' | 'borrowed'
 * }} ChordCandidate
 */
```

**Mapping `identityIntervals` par qualité :**

| Qualité | identityIntervals | optionalIntervals | Note |
|---------|-------------------|-------------------|------|
| `''` (maj) | `['3', '5']` | — | triade |
| `'m'` | `['b3', '5']` | — | triade |
| `'maj7'` | `['3', '7']` | `['5']` | |
| `'m7'` | `['b3', 'b7']` | `['5']` | |
| `'7'` | `['3', 'b7']` | `['5']` | |
| `'m7b5'` | `['b3', 'b5', 'b7']` | — | trois notes identitaires |
| `'dim7'` | `['b3', 'b5', 'bb7']` | — | symétrique, ambiguïté contextuelle possible |
| `'7sus4'` | `['4', 'b7']` | `['5']` | pas de tierce |
| `'9sus4'` | `['4', 'b7', '9']` | `['5']` | pas de tierce |
| `'6'` | `['3', '6']` | `['5']` | |
| `'m6'` | `['b3', '6']` | `['5']` | |
| `'6/9'` | `['3', '6', '9']` | `['5']` | |
| `'maj9'` | `['3', '7', '9']` | `['5']` | |
| `'m9'` | `['b3', 'b7', '9']` | `['5']` | |
| `'9'` | `['3', 'b7', '9']` | `['5']` | |
| `'7b9'` | `['3', 'b7', 'b9']` | `['5']` | |
| `'13'` | `['3', 'b7', '13']` | `['5', '9']` | 13e limitée |

**Note sur dim7 :** L'accord diminué 7 est symétrique (empilement de tierces mineures). Toute note de l'accord peut être interprétée comme fondamentale. Le `identityIntervals` `['b3', 'b5', 'bb7']` est l'orthographe standard, mais le moteur doit accepter les réinterprétations enharmoniques contextuelles.

### 1.2 MelodyCompatibility — classification conceptuelle

```js
/**
 * Compatibilité d'une note de mélodie avec un accord candidat.
 * @typedef {'chord-tone' | 'available-tension' | 'suspension'
 *          | 'non-chord-tone-allowed' | 'incompatible'} MelodyCompatibility
 *
 * - 'chord-tone'            : la note est un intervalle identitaire de l'accord.
 * - 'available-tension'     : la note est une tension disponible (9, 11, 13, etc.)
 *                              compatible avec la qualité de l'accord.
 * - 'suspension'            : la note est une suspension (4 au lieu de 3, 2 au lieu de 1/3).
 *                              Tolérée si résolution prévue ou style approprié.
 * - 'non-chord-tone-allowed': la note n'appartient pas à l'accord mais est tolérée
 *                              (note de passage, appoggiature, broderie) selon :
 *                              - harmonizationPolicy,
 *                              - durée de la note,
 *                              - position métrique (temps fort/faible),
 *                              - style,
 *                              - résolution prévue (mouvement conjoint vers note réelle).
 * - 'incompatible'          : la note ne peut pas coexister avec cet accord
 *                              (ex: tierce majeure sur accord mineur).
 */
```

### 1.3 SopranoPolicy (inchangé)

```js
/**
 * @typedef {'melody-must-be-top' | 'allow-notes-above' | 'free'} SopranoPolicy
 */
```

### 1.4 HarmonizationPolicy (inchangé)

```js
/**
 * @typedef {'force' | 'automatic' | 'skip'} HarmonizationPolicy
 */
```

### 1.5 SpelledPitch (inchangé)

```js
/**
 * @typedef {{
 *   midi: number, pitchClass: number, letter: string,
 *   accidental: string, octave: number, displayName: string
 * }} SpelledPitch
 */
```

### 1.6 PlayabilityProfile

```js
/**
 * Profil de jouabilité configurable. Remplace les constantes universelles
 * LH_HARD_RANGE, RH_HARD_RANGE, etc. du voicing-engine.
 *
 * @typedef {{
 *   leftHandMin: number,           // MIDI, défaut 28 (E1)
 *   leftHandMax: number,           // MIDI, défaut 55 (G3)
 *   rightHandMin: number,          // MIDI, défaut 48 (C3)
 *   rightHandMax: number,          // MIDI, défaut 84 (C6)
 *   leftHandMaxSpan: number,       // demi-tons, défaut 12
 *   rightHandMaxSpan: number,      // demi-tons, défaut 16
 *   allowRolledChords: boolean,    // autoriser les accords arpégés/roulés
 *   allowHandRedistribution: boolean, // autoriser la redistribution entre mains
 *   strictPlayability: boolean     // true = rejet si hors limites,
 *                                  // false = pénalité soft seulement
 * }} PlayabilityProfile
 */
```

**Fichier :** `src/melody/midi-types.js` (nouveau type) — remplace les constantes de `src/voicing-engine/hand-ranges.js` pour le nouveau module. Le `voicing-engine` existant conserve ses propres constantes jusqu'à migration.

### 1.7 StyleProfile

```js
/**
 * Profil stylistique déterminant les poids des soft heuristics.
 * @typedef {{
 *   id: string,                          // 'classical' | 'jazz' | 'gospel' | 'pop' | 'neo-soul' | 'free'
 *   label: string,                       // nom affichable
 *
 *   weights: {
 *     voiceLeadingSmoothness: number,    // 0-1, poids du mouvement minimal
 *     commonToneRetention: number,       // 0-1, poids des notes communes
 *     leadingToneResolution: number,    // 0-1, poids de la résolution de sensible
 *     seventhResolution: number,        // 0-1, poids de la résolution de septième
 *     parallelFifthsPenalty: number,    // 0-1, pénalité pour quintes parallèles
 *     parallelOctavesPenalty: number,   // 0-1, pénalité pour octaves parallèles
 *     leadingToneDoublingPenalty: number, // 0-1, pénalité pour doublure de sensible
 *     stepwiseMotion: number,           // 0-1, bonus pour mouvements conjoints
 *     registerStability: number,        // 0-1, poids de la stabilité de registre
 *     handBalance: number,              // 0-1, poids de l'équilibre entre mains
 *     functionalCoherence: number,      // 0-1, poids de la cohérence fonctionnelle
 *     tensionPreparation: number,       // 0-1, poids de la préparation des tensions
 *     tensionResolution: number,        // 0-1, poids de la résolution des tensions
 *     harmonicVariety: number,          // 0-1, bonus pour variété harmonique
 *   },
 *
 *   tolerances: {
 *     maxVoiceLeadingJump: number,       // demi-tons, saut maximal toléré sans pénalité
 *     allowedNonChordToneDuration: number, // secondes, durée max d'une note étrangère
 *     allowedNonChordToneMetricPosition: 'any' | 'weak' | 'none'
 *   },
 *
 *   melodyPreferences: {
 *     preferChordTones: boolean,
 *     allowTensions: boolean,
 *     allowSuspensions: boolean,
 *     allowNonChordTones: boolean
 *   }
 * }} StyleProfile
 */
```

**Profils prédéfinis :**

| Profil | Caractéristique principale |
|--------|---------------------------|
| `classical` | Conduite des voix stricte, résolutions obligatoires, parallèles pénalisés fortement |
| `jazz` | Tensions libres, substitutions, voice leading souple, septièmes non résolues acceptées |
| `gospel` | Block chords, mouvements parallèles tolérés, tensions riches, V→IV accepté |
| `pop` | Simplicité harmonique, triades et septièmes de base, voice leading minimal |
| `neo-soul` | Extensions libres (9, 11, 13), planing, voix serrées, tensions non résolues |
| `free` | Aucune contrainte soft, seules les hard constraints s'appliquent |

**Fichier :** `src/melody/style-profiles.js` (nouveau)

### 1.8 ValidationReport

```js
/**
 * Rapport de validation structuré pour un ReharmonizationPath.
 * @typedef {{
 *   valid: boolean,                         // false si au moins une hard violation
 *   hardViolations: ValidationIssue[],      // violations qui invalident le chemin
 *   warnings: ValidationIssue[],            // soft heuristics non satisfaites
 *   satisfiedConstraints: string[],         // contraintes satisfaites (labels)
 *   melodyChecks: MelodyValidationResult[]  // résultat par événement mélodique
 * }} ValidationReport
 */

/**
 * @typedef {{
 *   severity: 'error' | 'warning',
 *   code: string,                  // ex: 'MELODY_ABSENT', 'PARALLEL_FIFTHS'
 *   message: string,               // description lisible
 *   anchorId: string | null,      // ancre concernée
 *   melodyEventId: string | null,  // événement mélodique concerné
 *   details: object               // données spécifiques à la violation
 * }} ValidationIssue
 */

/**
 * @typedef {{
 *   melodyEventId: string,
 *   midi: number,
 *   harmonizationPolicy: 'force' | 'automatic' | 'skip',
 *   chordCandidate: { rootPc: number, quality: string } | null,
 *   compatibility: MelodyCompatibility,
 *   presentInChord: boolean,
 *   exactPitchPreserved: boolean,
 *   sopranoPolicyRespected: boolean,
 *   issues: ValidationIssue[]
 * }} MelodyValidationResult
 */
```

### 1.9 ReharmonizationPath — corrigé

```js
/**
 * @typedef {{
 *   id: string,
 *   style: string,
 *   tensionLevel: number,
 *   anchors: { anchorId: string, melodyEventId: string, time: number, chord: ChordCandidate }[],
 *   transitions: CandidateTransition[],
 *   voicings: VoicingCandidate[] | null,    // null si non générés, cache si générés
 *   totalScore: number,
 *   validationReport: ValidationReport,
 *   explanationKey: string | null
 * }} ReharmonizationPath
 */
```

**Corrections apportées :**
- `melodyRespected: boolean` → `validationReport: ValidationReport`
- `invariantsSatisfied: string[]` → intégré dans `validationReport.satisfiedConstraints`
- Les ancres utilisent `anchorId` et `melodyEventId` comme identifiants primaires ; `time` est complémentaire
- `voicings` est nullable (génération à la demande)

---

## 2. CLASSIFICATION HARD / SOFT / STYLE-DEPENDENT

### A. HARD CONSTRAINTS

Une violation **invalide** le candidat ou le chemin. Aucun score ne peut compenser.

| Code | Règle | Portée |
|------|-------|--------|
| `H01` | **Intégrité des événements MIDI** : tout `MidiNoteEvent` doit avoir `time >= 0`, `note` dans 0-127, `velocity` dans 0-1, `channel` dans 0-15 | Événement |
| `H02` | **Absence de notes bloquées** : après `finalize()`, aucune note ne reste dans l'état `active` sans note-off correspondant | Session |
| `H03` | **Respect de melodyPitch** : si `harmonizationPolicy` est `'force'` et `preserveExactPitch` est `true`, le MIDI exact doit être présent dans l'accord | Ancre |
| `H04` | **Respect de preserveExactPitch (pitch class)** : si `harmonizationPolicy` est `'force'` et `preserveExactPitch` est `false`, la pitch class doit être présente | Ancre |
| `H05` | **Respect de harmonizationPolicy `'automatic'`** : la pitch class de la mélodie doit être présente dans l'accord (sauf si `melodyCompatibility` est `'non-chord-tone-allowed'` et le style l'autorise) | Ancre |
| `H06` | **Respect de sopranoPolicy `'melody-must-be-top'`** : aucune note du voicing ne doit avoir un MIDI > `melodyPitch` | Voicing |
| `H07` | **Respect de sopranoPolicy `'allow-notes-above'`** : la note de mélodie doit être présente dans le voicing | Voicing |
| `H08` | **Respect des accords initial/final imposés** : si l'utilisateur impose un accord de début ou de fin, le chemin doit commencer/finir par cet accord (ou équivalent enharmonique) | Chemin |
| `H09` | **Présence des identityIntervals** : pour chaque `ChordCandidate`, tous les `identityIntervals` doivent être présents dans `chordTonePcs`, sauf si `omissionReason` est documenté | Candidat |
| `H10` | **Compatibilité avec le PlayabilityProfile en mode strict** : si `strictPlayability` est `true`, toutes les notes du voicing doivent être dans les plages et spans définis | Voicing |
| `H11` | **Cohérence des références** : tout `anchorId` et `melodyEventId` référencé doit exister dans la piste mélodie | Chemin |
| `H12` | **Validité de l'orthographe enharmonique** : tout `SpelledPitch` doit avoir `letter` dans A-G, `accidental` dans `['', '#', 'b', 'x', 'bb']`, et `displayName` cohérent avec `letter + accidental + octave` | Donnée |

### B. SOFT HEURISTICS

Une violation **modifie le score** mais ne rejette pas automatiquement. Les poids dépendent du `StyleProfile`.

| Code | Heuristique | Effet |
|------|------------|-------|
| `S01` | **Mouvement minimal des voix** : somme des déplacements en demi-tons entre voix correspondantes | Bonus si faible |
| `S02` | **Pénalité progressive des grands sauts** : pénalité croissante par demi-ton au-delà de `maxVoiceLeadingJump` | Pénalité si élevé |
| `S03` | **Conservation des notes communes** : nombre de pitch classes communes entre deux accords successifs | Bonus si élevé |
| `S04` | **Résolution de la sensible** : dans V7→I, la sensible (tierce de V7) monte d'un demi-ton vers la tonique | Bonus si respecté |
| `S05` | **Résolution de la septième de dominante** : dans V7→I, la septième descend par mouvement conjoint | Bonus si respecté |
| `S06` | **Parallèles de quinte** : deux voix consécutives forment des quintes parallèles | Pénalité |
| `S07` | **Parallèles d'octave** : deux voix consécutives forment des octaves parallèles | Pénalité |
| `S08` | **Doublure de sensible** : la sensible (7e degré) est doublée dans le voicing | Pénalité |
| `S09` | **Mouvements conjoints** : proportion de mouvements de 1-2 demi-tons entre voix | Bonus si élevé |
| `S10` | **Stabilité du registre** : variance de la tessiture globale sur la phrase | Bonus si stable |
| `S11` | **Équilibre entre les mains** : répartition des notes entre LH et RH | Bonus si équilibré |
| `S12` | **Cohérence fonctionnelle** : la progression suit des enchaînements fonctionnels standards (II-V-I, IV-V-I, etc.) | Bonus si cohérent |
| `S13` | **Préparation des tensions** : une tension (9, 11, 13, altération) est préparée par note commune ou mouvement conjoint | Bonus si préparée |
| `S14` | **Résolution des tensions** : une tension est résolue par mouvement conjoint vers une note réelle de l'accord suivant | Bonus si résolue |
| `S15` | **Variété harmonique** : diversité des qualités d'accords utilisées dans le chemin | Bonus si varié |

### C. STYLE-DEPENDENT RULES

Les poids et tolérances des soft heuristics **dépendent du `StyleProfile`**. Les profils prédéfinis sont documentés en section 1.7.

**Règle supprimée :** « Une progression ne doit pas contenir V → IV sans préparation. »
- V → IV est un mouvement parfaitement valide en blues, pop, gospel, et de nombreux contextes jazz.
- Le `StyleProfile` peut pénaliser ce mouvement dans `classical` (via `functionalCoherence`) mais ne doit pas l'interdire.
- Aucune hard constraint ne porte sur V → IV.

---

## 3. MODIFICATIONS AU PLAN DES INCRÉMENTS

### Incrément 0 — Ajouts

**Cas de test obligatoires pour la capture MIDI :**

| # | Cas | Vérification |
|---|-----|-------------|
| T01 | Note-on / note-off normal | L'événement est stocké avec le bon `time`, `note`, `velocity` |
| T02 | Note-on vélocité 0 | Traité comme note-off (convention MIDI) |
| T03 | Répétition de la même note avant relâchement | Deux note-on distincts, le second ne remplace pas le premier |
| T04 | Accords simultanés | Plusieurs note-on avec le même `time` → tous conservés |
| T05 | Sustain CC64 | `sustain` events stockés ; `getTimeline(t)` inclut les notes sustained |
| T06 | Relâchement pendant sustain | La note reste dans `getTimeline()` jusqu'au relâchement du sustain |
| T07 | Fin de sustain | `getTimeline()` ne contient plus les notes sustained après CC64=0 |
| T08 | Déconnexion MIDI | `finalize()` est appelé, toutes les notes actives reçoivent un note-off artificiel |
| T09 | Arrêt forcé de session | `finalize()` libère toutes les notes, pas de note bloquée |
| T10 | Plusieurs canaux | Les événements conservent leur `channel` d'origine |
| T11 | Horloge monotone | Les `time` sont strictement croissants (basés sur `performance.now()` ou équivalent) |
| T12 | Aucune note bloquée après `finalize()` | `getTimeline(Infinity)` retourne un état vide |

### Incrément 4 — Ajouts

**Ajouter à `ChordCandidate` :**
- `identityIntervals`, `optionalIntervals`, `omittedIntervals`, `omissionReason`
- `melodyCompatibility` (classification conceptuelle)

**Ajouter au filtrage :**
- `filterByMelodyCompatibility()` : classifie chaque candidat selon `chord-tone` / `available-tension` / `suspension` / `non-chord-tone-allowed` / `incompatible`
- Les candidats `incompatible` sont rejetés (hard constraint H09 implicite)
- Les candidats `non-chord-tone-allowed` sont acceptés seulement si le `StyleProfile.melodyPreferences.allowNonChordTones` est `true` ET la durée est ≤ `allowedNonChordToneDuration` ET la position métrique le permet

### Incrément 5 — Ajouts

**Remplacer les constantes de score par des poids du `StyleProfile` :**
- `scoreTransition()` accepte un paramètre `StyleProfile`
- Chaque soft heuristic est pondérée par `StyleProfile.weights[heuristicName]`
- Les tolérances (ex: `maxVoiceLeadingJump`) viennent de `StyleProfile.tolerances`

### Incrément 6 — Ajouts

**Remplacer `melodyRespected` et `invariantsSatisfied` par `validationReport` :**
- `findBestPaths()` retourne des `ReharmonizationPath` avec `validationReport` structuré
- Le `validationReport` est construit par `validatePath(path, melodyTrack, tonalContext, playabilityProfile)`
- Les hard violations dans `validationReport.hardViolations` invalident le chemin (`valid: false`)

**Ajouter `PlayabilityProfile` en paramètre :**
- `findBestPaths()` accepte un `PlayabilityProfile`
- Si `strictPlayability` est `true`, les candidats hors plages sont rejetés (H10)
- Si `strictPlayability` est `false`, une pénalité soft est appliquée

### Incrément 7 — Ajouts

**Remplacer les constantes de plages par `PlayabilityProfile` :**
- `generateVoicing()` accepte un `PlayabilityProfile` optionnel
- Si non fourni, utilise les constantes existantes du `voicing-engine` (rétrocompatibilité)
- Si fourni, les plages du profil remplacent `LH_HARD_RANGE`, `RH_HARD_RANGE`, etc.

### Incrément 8 — Ajouts

**Ajouter le sélecteur de `StyleProfile` dans l'interface :**
- L'utilisateur peut choisir parmi les profils prédéfinis (classical, jazz, gospel, pop, neo-soul, free)
- Le profil sélectionné est passé à `findBestPaths()` et `generateVoicing()`

---

## 4. RÉPARTITION FINALE DES MODÈLES

### Incrément 0 — Capture MIDI temporelle non destructive

| Phase | Modèle | Rôle |
|-------|--------|------|
| Implémentation initiale | **OpenCode / DeepSeek V4 Pro** | Écriture du module `midi-capture.js` et des types `midi-types.js` |
| Tests détaillés (T01-T12) | **OpenCode / modèle léger ou Flash** | Rédaction et exécution des 12 cas de test obligatoires |
| Revue architecturale et de sûreté | **Claude Code** (1 session) | Vérifie : pas de fuite mémoire, pas de note bloquée, `finalize()` correct, monotonie de l'horloge, isolation vis-à-vis de `note-grouper.js` |
| Post-revue | **OpenCode / DeepSeek V4 Pro** | Corrections uniquement si la revue Claude identifie des défauts. Claude ne réimplémente pas automatiquement. |

### Incréments 1 à 10 — Répartition (inchangée sauf précisions)

| Incrément | Tâche | Modèle |
|-----------|-------|--------|
| 1 | Capture piste Mélodie | Claude Code |
| 2 | Contexte tonal et harmonique | OpenCode / puissant |
| 3 | Modèle enharmonique | Claude Code |
| 4 | Génération de candidats (+ melodyCompatibility) | Claude Code |
| 5 | Scoring des transitions (+ StyleProfile) | Claude Code |
| 6 | Recherche de chemins (+ ValidationReport, PlayabilityProfile) | Claude Code |
| 7 | Voicings contextuels (+ PlayabilityProfile) | Claude Code |
| 8 | Interface Réharmonisation (+ sélecteur StyleProfile) | OpenCode / puissant |
| 9 | Sécurisation + Explications IA | Claude Code |
| 10 | Sélection de source | OpenCode / puissant |

---

## 5. RÉCAPITULATIF DES TYPES AJOUTÉS/MODIFIÉS

| Type | Fichier | Statut |
|------|---------|--------|
| `MidiNoteEvent` | `src/melody/midi-types.js` | Existant (V2) |
| `MelodyEvent` | `src/melody/midi-types.js` | Existant (V2) |
| `MelodyTrack` | `src/melody/midi-types.js` | Existant (V2) |
| `HarmonicAnchor` | `src/melody/midi-types.js` | **Modifié** : + `anchorId`, + `melodyEventId` |
| `ChordCandidate` | `src/melody/midi-types.js` | **Modifié** : + `identityIntervals`, + `optionalIntervals`, + `omittedIntervals`, + `omissionReason`, + `melodyCompatibility` |
| `MelodyCompatibility` | `src/melody/midi-types.js` | **Nouveau** |
| `ReharmonizationConstraints` | `src/melody/midi-types.js` | Existant (V2) |
| `SopranoPolicy` | `src/melody/midi-types.js` | Existant (V2) |
| `HarmonizationPolicy` | `src/melody/midi-types.js` | Existant (V2) |
| `SpelledPitch` | `src/melody/midi-types.js` | Existant (V2) |
| `PlayabilityProfile` | `src/melody/midi-types.js` | **Nouveau** |
| `StyleProfile` | `src/melody/style-profiles.js` | **Nouveau** |
| `ValidationReport` | `src/melody/midi-types.js` | **Nouveau** (remplace `melodyRespected` + `invariantsSatisfied`) |
| `ValidationIssue` | `src/melody/midi-types.js` | **Nouveau** |
| `MelodyValidationResult` | `src/melody/midi-types.js` | **Nouveau** |
| `CandidateTransition` | `src/melody/midi-types.js` | Existant (V2) |
| `ReharmonizationPath` | `src/melody/midi-types.js` | **Modifié** : `validationReport` au lieu de `melodyRespected`/`invariantsSatisfied`, `voicings` nullable, ancres avec `anchorId`/`melodyEventId` |
| `VoicingCandidate` (extension) | `src/voicing-engine/data-model.js` | Existant (V2) |

---

*Révision ciblée — 6 août 2026. Lecture seule, aucun fichier modifié.*

---

