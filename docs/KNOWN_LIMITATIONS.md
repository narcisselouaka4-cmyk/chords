# Limitations connues — Fusion Engine V1.0

Ce document liste les limitations architecturales et fonctionnelles du pipeline
Bass Engine + Chord Engine + Fusion Engine, en vue de la V1.0.

---

## 1. Dépendance au Chord Engine

Le Fusion Engine utilise le Chord Engine comme source exclusive de contexte
harmonique. Toute erreur du Chord Engine (mauvaise détection d'accord, de
tonalité, ou de fonction) est propagée à la fusion.

**Impact** : si le Chord Engine détecte un accord incorrect, le Virtual Root
Candidate peut favoriser une basse cohérente avec le mauvais contexte, ce qui
dégrade la sortie.

**Métriques manquantes** : le benchmark actuel (`Phase 6`) ne mesure pas la
performance du Chord Engine indépendamment. Seule la sortie finale de la
fusion est évaluée.

**Piste d'amélioration** : créer un benchmark harmonique dédié et une analyse
de l'impact des erreurs du Chord Engine sur la fusion.

---

## 2. Tolérance instrumentale

Le Bass Engine V2.5 a été calibré et testé principalement sur :
- piano acoustique (jeu jazz / gospel),
- piano électrique (Rhodes, Wurlitzer),
- synthétiseurs basses (mono, walking bass simulée).

Il n'a pas été validé sur d'autres instruments (contrebasse, basse électrique
avec médiator, synthétiseur avec distorsion, orgue, etc.).

**Piste d'amélioration** : enrichir le corpus avec des enregistrements
d'instruments variés.

---

## 3. Registre grave

Le Bass Engine a une limite basse à ~F#2 (MIDI 42, 46,8 Hz). En dessous de
cette fréquence, les erreurs d'octave dominent (C2/E2 détectés une octave
trop haut). Le Fusion Engine ne peut pas corriger ces erreurs en l'absence
de contexte harmonique (notes isolées).

**Piste d'amélioration** : étendre la résolution du CQT dans le registre
grave, ou ajouter un post-traitement de correction d'octave.

---

## 4. Walking bass et lignes mélodiques

Le Virtual Root Candidate remplace les notes de passage mélodiques par la
fondamentale de l'accord sur les lignes de basse mouvantes (walking bass).
La regression est documentée dans `docs/BENCHMARK_REPORT.md`.

**Piste d'amélioration** : implémenter un détecteur de mouvement mélodique
(`bass_motion_score`) pour désactiver le VR sur les sections walking.

---

## 5. Accords slash non résolus

Pour les accords slash C/E et D/F#, le Bass Engine joue la fondamentale
(C, D) plutôt que la note de basse (E, F#). Le Fusion Engine ne corrige pas
ces cas car le Virtual Root Candidate cible la fondamentale de la partie
gauche de l'accord.

**Piste d'amélioration** : ajouter une heuristique de slash-bass following
dans la fusion, ou enrichir le Virtual Root Candidate avec la note de
renversement.

---

## 6. Fragmentation

Le Bass Engine V2.5 sursegmente les passages rapides ou bruités, produisant
une fragmentation excessive (jusqu'à ×3,78 sur Amazing Grace par rapport à
la ground truth). Le Fusion Engine réduit partiellement la fragmentation
(×3,52) mais ne la résout pas.

**Piste d'amélioration** : améliorer le lissage temporel dans le Bass
Engine ou ajouter un post-traitement de fusion de segments adjacents.

---

## 7. Mono-instrumental

Le corpus de validation est composé majoritairement de fichiers monophoniques
ou à deux pistes (basse + accompagnement). Les performances sur un mixage
complet (batterie, basse, piano, chant) n'ont pas été évaluées.

**Piste d'amélioration** : créer un corpus d'enregistrements d'ensemble
(≥ 4 instruments) avec ground truth de basse.
