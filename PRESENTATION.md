# Piano Jazz Chords — Présentation projet

> Document de synthèse à destination du chef de projet.
> Dernière mise à jour : 5 juillet 2026.

---

## 1. Qu'est-ce que Piano Jazz Chords ?

**Piano Jazz Chords** est une application desktop (Electron) qui accompagne les pianistes gospel et jazz pendant leur apprentissage et leur pratique.

Elle détecte en temps réel les accords joués sur un clavier MIDI, les affiche à l'écran avec leurs notes, leur type de voicing et des explications pédagogiques, et permet d'importer des morceaux audio/vidéo pour les étudier, les séparer en pistes et les transposer.

---

## 2. Objectifs métier

- Aider le musicien à **comprendre immédiatement** ce qu'il joue.
- Fournir un **historique et un enregistreur de sessions** pour réviser son travail.
- Permettre l'**étude de morceaux externes** grâce à la séparation de sources et à la transposition.
- Rester centré sur le **gospel/jazz** (accords enrichis, tensions, substitutions, voicings).

---

## 3. Modules fonctionnels et état d'avancement

### Module 1 — Entraînement en temps réel

**Ce que fait le module aujourd'hui :**

- Détection temps réel des accords joués sur un clavier MIDI physique ou virtuel.
- Affichage du nom de l'accord, de ses notes, de l'inversion et du type de voicing.
- Clavier virtuel SVG qui reflète les touches actives.
- Historique des accords détectés avec sauvegarde de session.
- Pédagogie jazz : inversions, close position, rootless, upper structures, polychords, quartal.
- Paramètres : transposition, tolérance de groupement, notation latine/anglaise, couleurs.

**État :** ✅ Fonctionnel et testé.

---

### Module 2 — Sessions MIDI

**Ce que fait le module aujourd'hui :**

- Création d'une session avec nom, tonalité, tempo, commentaires et tags.
- Enregistrement de tous les événements MIDI (note on/off, vélocité, sustain, pitch bend, modulation).
- Sauvegarde structurée dans le dossier utilisateur `~/PianoJazzChords/Sessions/`.
- Liste des sessions enregistrées, recherche, relecture avec les mêmes affichages que le module temps réel.

**État :** 🔄 Partiellement consolidé.

---

### Module 3 — Analyse IA

**Ce que le module fait aujourd'hui :**

- Pipeline d'analyse à trois entrées : MIDI, Tutoriel vidéo, Cover / Performance.
- Détection de tonalité par profils Krumhansl-Schmuckler + heuristique sur les accords.
- Segmentation d'une session en sections (Intro, Couplet, Pré-refrain, Refrain, Bridge, Outro, Interlude).
- Timeline d'accords avec Top Note détectée, grace notes, voicing et technique.
- Grille d'arrangement harmonique : toggle Actif/Inactif par accord, dropdown de ligne de basse (Auto, 1/3/5/7, patterns 7-3-6, 2-5-1, etc.).
- Suggestions de réharmonisation par style (Worship, Gospel, Jazz, Neo Soul) avec mini-claviers.
- Intégration IA (Groq/OpenRouter/Gemini) avec format JSON blueprint : accord original, top note, 3 suggestions par influence locale, technique et voicing.
- Masterclass IA : analyse pédagogique par accord, avec cache, retry exponentiel et fallback sur la bibliothèque locale de mouvements.

**État :** ✅ Fonctionnel et testé.

---

### Module 4 — Étude audio/vidéo (Studio)

**Ce que fait le module aujourd'hui :**

- Import de fichiers MP3, MP4, WAV, FLAC, OGG.
- Lecture audio/vidéo avec waveform et sélection de région bouclée.
- Séparation en 5 stems via Demucs : Basse, Batterie, Voix, Autres, Piano.
- Mixer avec mute, solo et volumes en dB par piste.
- Transposition pitch-seul de ±12 demi-tons avec RubberBand (qualité pro, conservation du tempo).
- La transposition s'applique à chaque stem individuellement : on peut donc couper la basse transposée, mettre la voix en solo, etc.

**État :** ✅ Fonctionnel et testé.

---

## 4. Architecture technique

| Composant | Technologie |
|-----------|-------------|
| Framework desktop | Electron + Vite |
| Langage | JavaScript natif (ES modules) |
| MIDI natif | `@julusian/midi` |
| Audio | Web Audio API |
| Synthétiseur | Web Audio (oscillateurs + enveloppes ADSR) |
| Clavier virtuel | SVG interactif |
| Moteur d'accords | Module maison `src/chord-engine/` |
| Studio / séparation | Python + Demucs + librosa + RubberBand |
| Stockage | Dossiers locaux (`~/PianoJazzChords/`) |

---

## 5. Détection harmonique

Le moteur reconnaît :

- Triades (majeur, mineur, diminué, augmenté, sus2, sus4, power).
- Accords de 7e, 9e, 11e, 13e avec leurs altérations.
- Accords suspendus : `7sus4`, `9sus4`, `13sus4`.
- Inversions et notations slash (`C/E`).
- Rootless voicings, upper-structure triads et polychords.
- Quartal voicings.

Depuis la dernière version, le moteur distingue :
- **le nom de l'accord** (ex. `Em7b9`) ;
- **le type de voicing** (cluster, close, open, spread, shell), affiché sous le nom.

---

## 6. Comment lancer l'application

```bash
# Installation des dépendances
npm install

# Build de l'interface
npm run build

# Lancement
./launch.sh
```

---

## 7. Tests disponibles

```bash
# Tests du moteur d'accords
node src/chord-engine/test-chords.js

# Build de production
npm run build
```

---

## 8. État global du projet

| Module | État |
|--------|------|
| Entraînement temps réel | ✅ Terminé |
| Clavier MIDI virtuel | ✅ Terminé |
| Moteur d'accords | ✅ Terminé |
| Sessions MIDI | ✅ Terminé |
| Analyse IA | ✅ Terminé |
| Studio audio/vidéo | ✅ Terminé |

---

## 9. Points de vigilance / prochaines étapes

- Tests utilisateurs réels sur le module Analyse (détection de tonalité sur des sessions variées).
- Spike time-boxé sur le packaging de Demucs en bundle Electron multi-plateforme (1-2 jours max).
- Pour la v1 : installation Python + ffmpeg documentée comme prérequis acceptable ; packaging propre reporté en v1.1.
- Gestion des erreurs utilisateur et journal d'application.
- Anonymisation complète des références artistes : les suggestions affichent désormais des catégories de style (ex. « Walk-up Gospel ») plutôt que des noms propres.

---

## 10. Ressources du projet

- `VISION.md` — Vision globale et roadmap.
- `docs/README.md` — Guide rapide technique.
- `docs/MODULE_01_*.md` à `MODULE_04_*.md` — Cahiers des charges par module.
- `CHANGES.md` — Journal des modifications.
- `REPARTITION.md` — Répartition du travail.
