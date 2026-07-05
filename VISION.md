# Vision globale — Piano Jazz Chords

> Document de vision pour l'application Piano Jazz Chords.
> Ce document définit la destination finale du projet sans entrer dans les détails d'implémentation.
> La roadmap et les cahiers des charges par module sont dans `docs/`.

## Énoncé de la vision

Piano Jazz Chords est un **assistant IA pour pianistes gospel et jazz**.

Il accompagne le musicien à chaque étape de son apprentissage et de sa pratique :
- en temps réel, quand il joue seul pour s'entraîner ;
- en session, quand il veut enregistrer, réécouter et analyser son jeu ;
- en analyse, quand il veut comprendre une chanson ou une vidéo ;
- en création, quand il veut explorer des réharmonisations et des styles.

L'application reste centrée sur **deux usages principaux** :
1. Le clavier MIDI physique comme interface privilégiée.
2. La compréhension harmonique du gospel/jazz comme cœur intellectuel.

## Modules fonctionnels

### Module 1 — Entraînement en temps réel

Laboratoire de jeu immédiat.

- Détection d'accords et de techniques au moment où l'utilisateur joue.
- Affichage du clavier virtuel avec les touches actives.
- Historique des accords détectés.
- Pédagogie : close position, inversions, drop 2/3/2&4, rootless, upper structures, quartal.
- Paramètres : transposition, tolérance de groupement, notation latine/anglaise, couleurs.

**État actuel** : bien entamé.

### Module 2 — Enregistrement de sessions

Capture du jeu sous forme de projet.

- Création d'une session avec métadonnées (nom, tonalité, tempo, commentaires, tags).
- Enregistrement de tous les événements MIDI (note on/off, vélocité, sustain, pitch bend, modulation, contrôleurs).
- Chronomètre et compteurs en temps réel (notes, accords, accord courant).
- Sauvegarde structurée dans un dossier utilisateur.
- Lecture de la session avec les mêmes affichages que le module temps réel.
- Vitesse variable, pause, stop, retour au début.

**État actuel** : partiellement commencé, à consolider.

### Module 3 — Analyse IA

Analyse automatique d'une session enregistrée.

- Segmentation en sections : Intro, Couplet, Pré-refrain, Refrain, Bridge, Outro (ou Section A/B sur les sessions courtes).
- Identification des progressions harmoniques par section.
- Comparaison entre les accords joués et les accords attendus dans la tonalité.
- Scoring : voice leading, transitions, utilisation des tensions, voix internes.
- Suggestions de réharmonisation par style : Worship, Gospel, Jazz, Neo Soul.
- Application immédiate d'une suggestion pour écouter le résultat.

**État actuel** : 🔄 Fonctionnel, à consolider.

### Module 4 — Étude et pédagogie

Apprentissage à partir de sources externes.

- Import de fichier audio ou vidéo (MP3, YouTube).
- Séparation des sources (piano, basse, batterie, voix, pads) si techniquement possible.
- Détection automatique des accords joués dans la source.
- Identification des techniques utilisées (rootless, upper structures, quartal, passing chords, tritone sub, planing).
- Navigation temporelle avec accès direct aux moments clés.
- Explications pédagogiques : fonction harmonique, substitutions possibles, gammes, variantes.
- Exercices générés à partir d'un extrait.

**État actuel** : non développé.

## Principes directeurs

- **Spécialisation** : l'application est centrée sur le gospel et le jazz, pas un outil généraliste.
- **Modularité** : chaque module est indépendant mais interopérable.
- **Non-destructivité** : le code existant continue de fonctionner quand on ajoute un module.
- **Progressivité** : on avance par étapes, avec une application utilisable à chaque palier.
- **Performances** : l'application reste fluide même avec des sessions longues ou de nombreuses sessions.

## Roadmap actuelle

1. ✅ Module 1 — Détection MIDI et harmonique en temps réel.
2. 🔄 Module 2 — Sessions MIDI : enregistrement, sauvegarde, relecture.
3. 🔄 Module 3 — Analyse IA des sessions : segmentation, suggestions de réharmonisation, écoute.
4. ⏳ Module 4 — Étude audio/vidéo et pédagogie IA.

Cette roadmap est un document vivant. L'ordre peut évoluer si une étape s'avère nécessaire avant une autre, mais la vision globale reste stable.

## Stack technique actuelle

- Electron + Vite + JavaScript natif (ES modules).
- `@julusian/midi` pour les entrées MIDI natives.
- Web Audio API pour le synthétiseur et le lecteur audio.
- SVG pour le clavier interactif.

Tout nouveau module doit rester compatible avec cette stack sauf décision explicite de migration.
