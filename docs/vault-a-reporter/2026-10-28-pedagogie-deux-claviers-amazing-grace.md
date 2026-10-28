---
title: Pédagogie IA — régression « Amazing Grace » (deux claviers à l'écran)
type: bug
date: 2026-10-28
status: corrigé, mesuré sur la vraie vidéo, non vérifié dans Electron
tags: [pedagogie-ia, lecture-image, regression, format-detector, rejeu]
---

# Régression « Amazing Grace — Slow Gospel Blues Piano » : le rejeu avait perdu 4 notes sur 5

## Symptôme (Narcisse, 28/10)
« Rejoue ce passage » de 0:03 à 2:55 : 125 notes et des repères « Ici, le prof s'arrête de jouer »
partout, alors qu'il joue. Avant : 559 notes, propre.

## Cause (mesurée sur la vraie vidéo)
- La vidéo montre **deux claviers de même étendue** (touche la plus grave = 24) : en haut le clavier
  dessiné qui s'allume (bas des touches y = 233), en bas le vrai piano sous les mains (y = 323).
- Depuis le 14/10 (`e1d3984`, stratégie « bande » pour Next Level Worship), le vrai piano est aussi
  reconnu : 5 sondes sur 24 le voient, 19 voient le clavier du haut.
- `detectVideoFormat` ne départageait les sondes que par le calage puis par le **nombre de noires** :
  une sonde du bas en comptait 33 (au lieu de 32) et l'emportait. Rien ne s'allume sur le vrai piano.
- Mesuré avec les vrais modules, comme Electron (sondes ffmpeg fps identiques, 8 i/s) :
  - avant le 14/10 : 5 009 touches lues, **562** notes rejouées de 0:03 à 2:55 ;
  - version cassée : 161 touches, **97** notes (et prise à tort pour un rendu « éclair ») ;
  - corrigé : 4 436 touches, **562** notes. Images identiques touche pour touche à l'ancienne lecture,
    sauf 0:00–0:02,75 et la dernière demi-seconde : fondu de l'image que l'ancienne version lisait
    comme une rangée de blanches (le filtre de présence l'écarte, à juste titre).
- La révision 5 (16/10) avait vu le relevé abîmé (127 notes, octave 2) et suggérait de chercher « dans
  les sondes de géométrie » : c'était bien là.

## Correctif
- `src/pedagogie/format-detector.js` : les sondes votent d'abord sur l'**emplacement** du clavier
  (bas des touches, tolérance = max(12 px, hauteur des noires)) ; l'emplacement vu par le plus d'images
  gagne, puis calage et nombre de touches comme avant.
- `src/pedagogie/tutorial-memory.js` : `READING_REVISION` 6 → les relevés gardés sont relus.
- Test `T90` (`test-pedagogie-engine.js`) : deux claviers de même étendue, 4 images contre 1 ; échoue
  sans le correctif (retient le bas), passe avec.

## Vérifié
- Vraie vidéo (banc Node, mêmes modules, mêmes sondes) : chiffres ci-dessus.
- Suites Pédagogie vertes (moteur 98/98, mémoire 20/20, DOM 176 ✓), build, Parties 1 et 3, test:chords 98/98.
- `test-tutorial-moment` 30/32 : échec **ancien**, identique sans ce correctif.

## Reste à vérifier
- Dans Electron : rouvrir le tuto (relu automatiquement), rejouer 0:03 → 2:55 (≈ 560 notes, plus de
  « le prof s'arrête » au milieu). La relecture fine à 30 i/s et le recoupement par le son n'ont pas été
  rejoués ici (même géométrie, donc même clavier).
- Next Level Worship (un seul clavier, mains devant) : non rejoué sur la vraie vidéo, absente du
  conteneur ; tests synthétiques T84–T89 verts, tolérance prévue pour les mains.

## À mettre dans decisions/
- Plusieurs claviers à l'écran : on lit celui que montrent le plus d'images de sondage.

## À mettre dans experiments/
- Banc de lecture hors Electron (ffmpeg → `createFrame` → `detectVideoFormat` → `readLitKeys`) :
  reproduit le relevé de l'application ; il faut reprendre EXACTEMENT les sondes d'Electron
  (fps = min(1, 24/durée), premières images), sinon on ne voit pas ce genre de bug.

## Prochaines actions / questions
- Narcisse : rouvrir Amazing Grace et confirmer le rejeu.
- Boucle de batterie par style : styles à choisir.
