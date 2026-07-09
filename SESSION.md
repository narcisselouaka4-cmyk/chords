# Session Piano Jazz Chords

> Dis "jazz" à OpenCode pour reprendre exactement là où on s'est arrêté.
> Dernière mise à jour : 2026-07-09.

---

## Projet

Application desktop Electron pour pianistes jazz/gospel : détection accords temps réel,
enregistrement/analyse de sessions MIDI, import audio/vidéo avec séparation/stems/transposition.

- **Répertoire :** `/home/visiteur/piano-jazz-chords/`
- **Stack :** Electron + Vite + JavaScript natif (ES modules)
- **MIDI :** `@julusian/midi` (Electron) / Web MIDI fallback
- **Audio :** Web Audio API (+ Python Demucs/librosa/RubberBand)
- **Stockage :** `~/PianoJazzChords/Sessions/` et `~/PianoJazzChords/Studio/`

---

## État des modules

| Module | Statut |
|--------|--------|
| 1 — Entraînement temps réel | ✅ Terminé |
| 2 — Sessions MIDI | 🔄 Partiellement consolidé |
| 3 — Analyse IA | 🟡 Fonctionnel (UI + réharmonisation + segmentation), IA réelle à brancher |
| 4 — Studio audio/vidéo | ✅ Terminé |
| **Moteur harmonique HMM** | **✅ Baseline officielle figée** (10 qualités, 109 états, régularisation) |

---

## Baseline officielle — 2026-07-09

Le moteur harmonique enrichi (10 qualités, 109 états, régularisation post-Viterbi)
est figé comme référence pour toutes les futures évolutions.

Benchmark Amazing Grace : RAW 27.7% / GRID_HALF 47.9% — cf. `docs/ARCHITECTURE.md`.

Commande de reproductibilité :
```bash
node scripts/test-analysis-diagnostic.js tests/references/amazing_grace_gospel_piano.json --benchmark-pre=/tmp/pre_regul.json
```

---

## Ce qu'on a fait cette session (2026-07-09)

### Phase 1 — Timer 2s + persistance des suggestions

- `src/ui/analyzer-tab.js` — Timer 1s supprimé de `playSuggestion`. Notes restent sur le clavier principal jusqu'au clic suivant (nouvel accord, autre suggestion, ou jeu MIDI réel).
- `src/main.js` — `state.suggestionNotes` (Set) séparé de `state.activeNotes`. Auto-clear des suggestions sur jeu MIDI réel ou changement d'onglet.
- `src/ui/recording-tab.js` — Passage du callback `onSuggestionPlay`.

### Phase 1 — Architecture IA (préparation)

- `src/ai/ai-client.js` (création) — Client API OpenAI-compatible. Lit la clé depuis localStorage (via `openai-config.js`) ou `window.electronAPI.env.IA_API_KEY`. `generateReharmonization(chord, style)` retourne `null` si pas de clé.
- `electron/preload.cjs` / `electron/preload.js` — Exposition des vars `IA_*` via `window.electronAPI.env`.
- `.env.example` (création) — Template : `IA_API_KEY`, `IA_BASE_URL`, `IA_MODEL`.
- `src/ui/analyzer-tab.js` — Appel IA en arrière-plan dans `renderChordDetail` : si clé dispo, les suggestions algorithmiques sont remplacées par les réponses LLM.

### Phase 1 — Coach grille de référence

- `src/analyzer/chord-comparator.js` (création) — `parseChordGrid(text)` parsing de grilles texte. `compareGridToPlayed(ref, played)` détection de substitutions.
- `src/ui/analyzer-tab.js` — Panneau « Grille de référence » pliable sous la timeline. Textarea + bouton Comparer + affichage des résultats.
- `src/style.css` — Styles du comparateur.

### Sessions précédentes (résumé)

- Module 3 Analyse : refonte timeline + mini-claviers + suggestions par style + segmentation
- Module 4 Studio : import audio/vidéo, séparation Demucs, mixer dB, transposition RubberBand
- Notation latine/anglaise, voicing séparé, alias, accord m7b9/9sus4/13sus4
- Synthétiseur piano (additif 7 partiels, ADSR)
- Toggle compact clavier, boucle infinie corrigée

---

## Décisions clés

1. **Pitch-shift offline Python** (RubberBand) plutôt que Web Audio temps réel.
2. **Transposition stem par stem** plutôt que mix master.
3. **"Cluster" = type de voicing**, pas nom d'accord.
4. **Son piano synthèse additive pure** (pas d'échantillons).
5. **Notation : `state.notation`** seul point source de vérité.
6. **Sessions courtes :** Sections A/B/C plutôt qu'Intro→Outro.
7. **IA cloud (API) plutôt que locale :** pas de surcharge GPU sur la machine de l'utilisateur.
8. **IA non bloquante :** `ai-client.js` retourne `null` sans clé → fallback algorithmique transparent.
9. **Notes de suggestion séparées de `state.activeNotes`** pour ne pas interférer avec la détection temps réel.
10. **Coach grille :** parsing texte simple (pas d'extraction audio automatique pour l'instant).

---

## Fichiers importants

| Fichier | Rôle |
|---------|------|
| `electron/main.js` | IPC Studio, MIDI, pitch-shift, Demucs |
| `electron/audio-processor.py` | Pitch-shift, waveform, extraction audio |
| `electron/demucs-wrapper.py` | Séparation Demucs |
| `src/main.js` | Orchestration globale, notation, clavier |
| `src/chord-engine/index.js` | `detectChord`, voicing detection |
| `src/chord-engine/chord-defs.js` | Définitions d'accords (9sus4, 13sus4, m7b9...) |
| `src/chord-engine/voicing.js` | Types de voicing + alias |
| `src/audio/simple-synth.js` | Synthétiseur piano (7 partiels, ADSR) |
| `src/audio/stem-mixer.js` | Mixage stems (dB log, mute/solo) |
| `src/audio/stem-separator.js` | Bridge Demucs |
| `src/ui/analyzer-tab.js` | Module Analyse (timeline, suggestions, écoute) |
| `src/ui/studio-tab.js` | Module Studio (import, lecteur, pistes, transposition) |
| `src/ui/mini-keyboard.js` | Mini-clavier SVG 3 octaves |
| `src/ui/display.js` | Affichage voicing + alias |
| `src/ui/recording-tab.js` | Onglet Enregistrement/analyse |
| `src/analyzer/reharmonizer.js` | Suggestions par style |
| `src/analyzer/segmenter.js` | Segmentation en sections |
| `src/analyzer/analyzer.js` | Analyse d'une session |
| `src/analyzer/chord-comparator.js` | Comparateur grille (Coach Studio) |
| `src/ai/ai-client.js` | Client API IA (OpenAI-compatible) |
| `src/ai/openai-config.js` | Config IA localStorage + modale UI |
| `src/recorder/player.js` | Relecture session MIDI |
| `src/recorder/studio-storage.js` | Stockage studio |
| `electron/preload.cjs` | Preload Electron (env IA, MIDI, Studio) |
| `.env.example` | Template vars d'env IA |

---

## Problèmes connus / à faire

### Prioritaire
1. ✅ ~~Timer 2s + persistance suggestions~~ — Corrigé.
2. ✅ **Clé API Groq configurée** — voir `.env` (modèle `llama-3.1-8b-instant`).
   → Les suggestions IA sont actives. Le fallback algorithmique s'applique si la clé est absente.
3. **Vérifier le son relecture session** — le paramètre `audible` dans les sessions.

### Backlog
- **Coach de Studio :** UI + parsing grille faits (`chord-comparator.js`). Améliorer le feedback (ajouter suggestions de correction).
- **Prof de Masterclass :** transcription audio de vidéos locales tutoriels.
- Packaging multi-plateforme (Linux, Windows, macOS).
- Tests utilisateurs réels.
- Gestion des erreurs utilisateur.

### Bloquant
- Tests visuels longs limités par environnement graphique instable (crashs GPU/signaux intermittents).
- Lancement `./launch.sh` freeze parfois sans output.

---

## Commandes utiles

```bash
# Lancer l'application
./launch.sh

# Tests d'accords (19/19)
node src/chord-engine/test-chords.js

# Build production
npm run build

# Dépendances natives MIDI (après npm install)
npm run rebuild

# Config IA : copier .env.example → .env et remplir la clé
cp .env.example .env
```

---

## Comment reprendre

1. Dire **"jazz"** à OpenCode.
2. Lire ce fichier (`SESSION.md`) — c'est automatique.
3. Vérifier `CHANGES.md` pour les détails par fichier.
4. **Prochaine étape :** obtenir une clé API gratuite (Groq, OpenRouter, Google AI Studio).
   → Interface modale 🔑 déjà prête dans l'app.
   → Ou mettre dans `.env` (copier depuis `.env.example`).
5. Une fois la clé ajoutée, les suggestions IA remplaceront automatiquement l'algorithme.
6. Pour l'instant, l'app fonctionne sans clé (fallback algorithmique).
