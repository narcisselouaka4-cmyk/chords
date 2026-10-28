---
title: Pédagogie IA — rôle supposé de chaque étape (intro, couplet, mouvement…)
type: feature
date: 2026-10-14
status: implémenté, non vérifié dans Electron
tags: [pedagogie-ia, guide, hypotheses, copilote]
---

# Rôle supposé de chaque étape du tuto

## Ce qui a été fait
Demande de Narcisse : « poser des hypothèses pour rattacher chaque passage à un moment précis du morceau (intro, couplet, mouvement) ».
- `src/pedagogie/tutorial-guide.js` : `assignRoles` (pur, sans IA) pose sur chaque étape un `role {id, label, why, guess}` et la liste `movements` qui s'y jouent. `GUIDE_VERSION` 2. `guideLines` donne au Copilote « rôle supposé : X — raison ».
- Règles, dans l'ordre : mot du prof (intro, verse/couplet, chorus/refrain, bridge/pont, outro, turnaround) → nouvelle tonalité → il parle (présentation au début, conclusion à la fin, sinon explication) → première chose jouée avant d'être décomposée = intro → mouvement relevé (étape courte ou prof qui en parle) → main seule = construction → deux mains après les mains séparées = assemblage → sinon la boucle.
- Un couplet / refrain / pont n'est **jamais deviné** : seulement si le prof le dit.
- `src/ui/pedagogie-guide.js` + CSS : pastille « Intro ? » (pointillés = hypothèse, raison en infobulle) ; la barre du tuto répète le rôle dans l'infobulle. « Explication » (il parle) n'a pas de « ? » : c'est observé.
- `src/pedagogie/copilot-client.js` : règle 22 complétée (dire « il semble », donner la raison, préciser ce qui manque).
- Tests : `test-tutorial-guide.js` (49), `test-pedagogie-dom.js` (177).

## Vérifié
- Sur les vraies données NLW : 0:00 intro ; 0:07–0:42 construction (main droite, main gauche, ligne) ; 0:42 assemblage ; 1:08 changement de tonalité (Ré♭) ; **3:08–3:35 assemblage** (le passage de la demande) ; fin conclusion.
- « this is the verse » dit par le prof → « Couplet ». Sans le mot : aucun couplet.
- Tests complets, build, régressions Partie 1 et 3, scénario Playwright (sombre/clair) sans erreur.

## Reste à vérifier
- Pas testé dans le vrai Electron. Les mots du prof viennent de la transcription (Whisper, souvent en anglais, parfois fausse) : sans elle, seuls les rôles structurels sont proposés.
- Seules les étiquettes anglaises / françaises courantes sont reconnues (liste `SAID_ROLES`).

## À mettre dans decisions/
- Le rôle d'une étape est toujours une hypothèse affichée comme telle (« ? », raison, « il semble » côté Copilote) ; aucun couplet/refrain sans mot du prof.

## À mettre dans experiments/
- Première version : la 1re étape (0:00–0:07) sortait « Mouvement » car un mouvement s'y jouait ; corrigé en testant l'intro avant le mouvement.

## Prochaines actions / questions
- Boucle de batterie par style : quels styles veux-tu ?
- Faire dire au Copilote d'abord le rôle dans « De quoi parle-t-il à 2:05 ? » (déjà dans sa consigne) : à juger à l'usage.
