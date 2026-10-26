---
title: "Mesurer l'ordre des accords, et le premier gain audio de la semaine"
type: decision
date: 2026-10-26
status: à-reporter
tags: [analyse, audio, banc, metrique, fondu, sur-decoupage]
---

## Ce qui a été fait

Narcisse veut travailler l'audio. Avant de corriger, il fallait savoir mesurer
— et la mesure existante ne voyait pas son reproche.

Deux commits : `8718c22` la mesure d'ORDRE, `d2b4434` le fondu des segments
brefs, premier gain audio mesuré de la semaine.

## La décision : une mesure de l'ORDRE, à côté de celles de durée

Les métriques MIREX (root, majmin, triads, sevenths) sont pondérées par la
**durée**. Sur « Saint Esprit » (344 s), un `Bm` parasite d'une seconde glissé
entre un Sol et un Ré coûte **0,3 point** : autant dire rien. Narcisse, lui, le
voit immédiatement — « un pianiste débutant va penser qu'il y a eu deux
enregistrements pour le même accord ».

La nouvelle mesure réduit chaque grille à sa **suite d'accords** — répétitions
consécutives fusionnées, silences retirés, durées ignorées — et compte les
corrections qui mènent de l'une à l'autre (distance d'édition). Un accord en
trop, un manquant, un mal nommé coûtent chacun **un point**, qu'il dure une
seconde ou dix. Elle sépare les trois, ce qui dit de quoi le moteur souffre :
des ajouts = sur-découpage, des manques = absorption, des substitutions =
mauvaise fondamentale.

**Elle ne remplace pas les métriques de durée.** Un relevé juste dans l'ordre
mais décalé dans le temps y obtient un bon score. Les deux se lisent ensemble,
et le rapport les affiche côte à côte.

### Ce qu'elle a immédiatement corrigé au diagnostic

Référence, 40 morceaux de GuitarSet :

| | |
|---|---|
| ordre | **55,3 %** |
| fondamentale seule | 60,1 % |
| majmin | 65,0 % |
| mal nommés | 92 |
| **en trop** | **237** |
| manquants | 11 |
| relevés / attendus | **1,48×** |

Et sur « Saint Esprit » : 159 accords relevés pour environ 121 attendus
(1,32×), dont 26 étrangers à sa boucle, 13 `Bm` en tête — l'intersection exacte
de Sol et de Ré.

**La veille, j'avais conclu « la cause est la fondamentale, pas la
segmentation ». Il faut nuancer :** en DURÉE c'est la fondamentale (31,4 %
d'erreurs, écart de quinte en tête) ; en NOMBRE d'accords c'est le
sur-découpage, et de loin — 237 contre 92. Les deux sont vrais ; il manquait la
seconde lecture, celle qui correspond à ce qu'il voit à l'écran.

## Le fondu : une réfutation qui s'inverse, proprement

Le fondu des segments courts avait été **écarté la veille** : il coûtait 1,1 pt
de majmin à ×0,67, et à ×0,30 ses +0,4 pt paraissaient négligeables. Avec la
mesure d'ordre, ces +0,4 pt s'accompagnent de **+7,4 pt d'ordre** (post-
traitement du banc, 24 morceaux mieux contre 2, p = 0,00001). Les deux mesures
montent à ×0,30 : aucun arbitrage à faire.

Au-delà de ×0,50, l'ordre gagne encore un peu mais les accords MANQUANTS
explosent (57 à ×0,67, 152 à ×1,00) : on fond alors de vrais accords.

### Le chiffre retenu est celui du moteur, pas du proxy

| | ordre | mieux / pire | p | pire cas |
|---|---|---|---|---|
| post-traitement du banc | +7,4 pt | 24 / 2 | 0,00001 | −16,7 |
| **moteur réellement modifié** | **+1,6 pt** | **11 / 0** | **0,0010** | **+0,0** |

Même écart proxy/moteur qu'hier (+0,9 annoncé, +0,1 réel). Voir
`[[proxy-nest-pas-le-moteur]]`.

**Livré quand même, et pour une raison de forme plus que de fond :** 11
morceaux améliorés, **zéro dégradé**, 29 inchangés, et le majmin ne bouge pas
(8 mieux / 7 pire, neutre). Le pire cas est +0,0 — aucun morceau ne perd. Le
gain moyen est modeste parce que le mécanisme n'a presque rien à manger : le
filtre `min_duration=0.4` absorbe déjà ce qui est plus court, et le garde-fou
ci-dessous épargne le reste. Il ne lui reste qu'une bande entre 0,4 s et
~0,5 s.

### Garde-fou, posé après régression attrapée par un test

Un accord bref mais RÉEL est épargné — évidence harmonique indépendante, ou
support acoustique mesuré — exactement comme par le filtre de durée. Sans lui,
le fondu mangeait l'accord de passage de `test_harmonic_timing` : un `D` de
0,25 s entre C et G, avec son appui propre (47 tests → 46). Le corpus seul ne
montrait pas ce cas.

## Variante mesurée puis ÉCARTÉE : ne garder que le signal fort

Retirer la protection faible (`supportSeconds > 0`) et ne garder que
`_independentHarmony` :

| | ordre | mieux / pire | p | pire cas |
|---|---|---|---|---|
| variante vs sans fondu | +2,41 pt | 15 / 1 | 0,0005 | −5,8 |
| **variante vs fondu livré** | **+0,79 pt** | **5 / 1** | **0,2188** | **−5,8** |

Elle ne casse AUCUN test (47/47) — donc ce n'est pas `supportSeconds` qui
protégeait l'accord de passage, c'est `_independentHarmony`. Mais l'écart avec
le mécanisme livré **n'est pas significatif** (p = 0,22), et elle dégrade un
morceau de 5,8 points là où le livré n'en dégrade aucun. **La propriété « ne
nuit jamais » vaut plus que +0,79 point non prouvé.**

Piste non explorée, pour qui reprendra : `supportSeconds > 0` est un seuil très
permissif (littéralement « plus que zéro »). Entre le garder tel quel et le
retirer, il y a à exiger un support SUBSTANTIEL. Non mesuré — un tour de banc
de plus pour un gain non significatif ne valait pas la priorité.

## Ce qui reste à vérifier

Le fondu n'a pas été vu tourner dans Electron. À regarder sur « Saint Esprit » :
moins d'étiquettes, et surtout aucun accord réel disparu.

## Prochaine action décidée avec Narcisse

Comparer notre moteur à un moteur de référence pré-entraîné, **sur notre banc
et avec notre note**. La question qu'il faut trancher : notre approche chroma +
HMM peut-elle encore progresser, ou plafonne-t-elle ?

**Point de licence, décisif pour l'application :** les modèles pré-entraînés de
madmom sont en CC BY-NC-SA, et le checkpoint BTC en « research only ». Tous
deux servent à MESURER, aucun ne peut être embarqué dans une application
distribuée. Sous licence permissive : `autochord` (Apache 2.0, Bi-LSTM-CRF sur
chroma NNLS), `ChordMiniApp` (MIT), `onehotchord` (Apache 2.0).

Risque technique à annoncer : madmom date de 2018 et casse souvent sur
Python 3.13 (celui du projet) ; autochord demande TensorFlow et un plugin VAMP.

## Questions pour Narcisse

- Le fondu supprime environ 2 % des segments. Sur « Saint Esprit », vérifier
  qu'aucun accord qu'il joue n'a disparu — c'est le seul risque du mécanisme, et
  le corpus ne peut pas répondre à sa place.
- Si un moteur de référence se révèle nettement meilleur, accepte-t-il une
  dépendance Python supplémentaire (TensorFlow, ~500 Mo) dans l'application ?
