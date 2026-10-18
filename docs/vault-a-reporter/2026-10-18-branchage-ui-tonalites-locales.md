---
title: Branchage UI des tonalités locales (keys/engine) — 18 octobre 2026
type: session
date: 2026-10-18
status: a-reporter
tags: [analyse, modulations, ui, ipc, cache]
---

# Branchage UI des tonalités locales — 18/10/2026

## Ce qui a été fait

Narcisse a remonté : sur l'onglet Analyse, SEIGNEUR n'affichait que « F majeur »,
aucune modulation dans la carte Tonalité, la Vue d'ensemble ni la frise — alors
que l'export JSON (commit 10d81ae) contenait bien les keys. Diagnostic : le
moteur calculait la couche, **quatre filtres champ par champ l'avalent en
chemin**. Même défaillance que `role` (documentée dans `audio-analyzer.js`),
cette fois pour `keys`/`keyMode`/`engine` :

1. **IPC `analyze-file`** (`electron/main.js` ~2132) : l'objet retourné est
   construit champ par champ ; `keys`, `keyMode`, `engine` manquaient.
2. **Mapper `TemplateAudioAnalyzer.analyze`** (`src/analyzer/audio-analyzer.js` :
   liste blanche, même piège que `role`.
3. **Snapshot .pjc.json** (`src/ui/chord-editor.js`,
   `PERSISTED_ANALYSIS_FIELDS`) : même si un champ survit aux deux premiers,
   il n'est pas persisté → perdu au rechargement sans recalcul.
4. **Restauration sans garde de version** (`restoreSavedAnalysis`) : une
   analyse enregistrée avec une ancienne version du moteur (sans keys)
   aurait été servie à jamais.

Correctifs (commit **447b1a0**, poussé sur `fix/detection-accords-triades`) :
- `electron/main.js` : `keys`, `keyMode`, `engine` dans la réponse IPC.
- `audio-analyzer.js` : idem dans le mapper + nouveau contrat
  `UI_ANALYSIS_FIELDS = [key, keyMode, keys, engine, keyConfidence, tempo,
  timeSignature]`.
- `chord-editor.js` : `keys`, `engine` ajoutés à `PERSISTED_ANALYSIS_FIELDS`.
- **Nouveau `src/analyzer/engine-versions.js`** : `ANALYSIS_ENGINE_VERSION =
  'ADR-061-triades-3'`, jumeau JS de `ENGINE_VERSION` (Python) — renvoi
  croisé en commentaire des deux côtés.
- `analyzer-tab.js` `restoreSavedAnalysis` : refuse (recalcul puis
  resauvegarde) si `cached.engine` absent (analyses d'avant l'exposition) ou
  ≠ `ANALYSIS_ENGINE_VERSION`. Toast explicite dans le cas ≠.
- `test-analyzer-mapping.js` : test D ajouté — `keys`, son pivot, et
  `engine` survivent au mapper (fixture enrichie).

## Ce qui a été vérifié, et comment

- `node src/analyzer/test-analyzer-mapping.js` : tout vert, y compris le
  test D (pivot `A#m` passe entier).
- `npm run test:chords` 98/98 ; régression Partie 1 et Partie 3 : OK.
- `node src/analyzer/test-analysis.js` + `test-analysis-export.js` : OK.
- `npm run build` : OK (8 s, warning chunks > 500 kB préexistant).
- Round-trip snapshot via node : `keys` (2 segments) et `engine` survivent
  à buildAnalysisSnapshot → extractCachedAnalysis ; le sans-engine est bien
  invalidé.

## Ce qui reste à vérifier (pas fait ici)

- **Dans l'app réelle (Electron)** : ouvrir SEIGNEUR → l'analyse enregistrée
  (sans engine) doit déclencher un recalcul, puis afficher
  « Fa majeur → Fa♯ majeur à 4:26 » cliquable, les marqueurs de modulation
  sur la frise, et les tonalités par section dans la Vue d'ensemble.
  Recharger ensuite : aucun recalcul (l'analyse resauvée porte
  ADR-061-triades-3 + les keys).
- Clonage du comportement sur ANGES (Do majeur → Ré majeur à 7:10) et les
  autres morceaux du lot.

## À mettre dans decisions/

- (éventuel ADR) Le contrat moteur → UI repose maintenant sur trois listes
  blanches couvertes par tests : `UI_SEGMENT_FIELDS` (+ test A/B),
  `UI_ANALYSIS_FIELDS` (nouveau, + test D) et la version du moteur
  jumelée Python/JS. Ajouter un champ lu par l'UI = l'ajouter aux trois
  endroits, sinon il est avalé silencieusement.

## À mettre dans experiments/

- EXP-060 complétée : la couche modulations est désormais branchée de bout
  en bout (moteur → IPC → mapper → snapshot → restauration gardée par
  version). Quatre points de filtrage pour un seul champ : le diagnostic
  est allé de l'aval (UI) vers la source (IPC), chaque étape réinjectée
  une à une jusqu'à trouver les coupures.
- Les analyses enregistrées avant le branchement sont invalidées une fois
  (recalcul au premier rechargement) : coût unique et voulu.

## Prochaines actions et questions pour Narcisse

1. Vérifier visuellement SEIGNEUR et ANGES dans l'app (rappels attendus
   ci-dessus) puis confirmer à l'oreille les frontières : SEIGNEUR
   Fa♯ ~4:25.4 (fenêtre 4:25–4:26), ANGES Ré ~7:10.4 (7:05–7:10).
2. Toujours en attente d'oreille : medley B 10:25 / retour E 11:19,
   yahweh_live A 0:48 (prologue vamp D = artéfact documenté).
3. Suite du chantier accords (documenté dans EXP-060, non engagé) : axe
   basse/aigu (F ≈ 0,85-0,92 écrase Am/Dm sur leurs propres barres),
   A#→F 18,8 s et F♯→C♯ 21 s dans la section Fa♯ de SEIGNEUR.
