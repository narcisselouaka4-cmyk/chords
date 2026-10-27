---
title: "Le moteur audio passe à lv-chordia : +34 points d'ordre, 39 morceaux sur 40"
type: decision
date: 2026-10-27
status: à-reporter
tags: [audio, adr, lv-chordia, chroma, remplacement, licence]
---

## La décision

La **grille d'accords audio** est désormais produite par `lv-chordia` (ISMIR
2019, licence MIT). Le moteur chroma + HMM reste dans le dépôt comme **repli**.

Commit : `d023b37`.

## Ce qui l'a déclenché

Narcisse a relevé lui-même, étiquette par étiquette, la première minute de
« Saint Esprit » : « bref, c'est catastrophique ». Son relevé est devenu la
première vérité terrain temporelle du projet sur du gospel complet
(`tests/references/saint-esprit-mlk.lab`, commit `a5f27ca`).

Mesure contre ce relevé : **41,9 %** de fondamentales justes, **19 étiquettes
pour 10 accords joués**. Le même moteur fait 68,8 % sur GuitarSet — **le banc
sur lequel la semaine entière avait été réglée n'est pas représentatif de son
répertoire.**

## Pourquoi le moteur chroma plafonnait — la mesure qui tranche

Sur son introduction, le moteur entend : **Mi 100, Si 74, Sol 57, Ré 48**. En
plaquant les accords et en comparant, comme il le fait lui-même à l'oreille :

    Em  0,886      Am9 0,793      G 0,686      C 0,675      Am 0,522

`Em` gagne **honnêtement**. Et sur le passage où il dit `G` pendant 2,1 s :

    Em 0,848   contre   G 0,847   →   écart de DEUX MILLIÈMES

**51,6 % des décisions du moteur se jouent à moins de cinq centièmes d'écart**
(15 % à moins d'un centième). Ce n'était pas un défaut de réglage : il n'y a
rien à arbitrer. Le chroma jette l'octave, le timbre et les harmoniques — tout
ce qui permettrait de trancher.

Trois pistes ont été mesurées puis écartées avant d'en arriver là :

1. **Rouvrir le vocabulaire aux enrichissements** (sa méthode, en version
   complète : plaquer Am, Am7, Am9, Am6… et garder le meilleur de chaque
   famille). Résultat : **5/10 contre 5/10**, aucun gain — et `Sol` gagne 6
   fois sur 10, parce qu'un accord qui a plus de notes ressemble mécaniquement
   plus à tout. C'est exactement le biais que l'ADR-061 avait supprimé.
2. **Le principe de continuité** qu'il décrit (« si ça ne change pas
   franchement, c'est que ça n'a pas changé ») : **+2,5 pt** seulement, sur un
   seul morceau. Son principe est juste ; c'est l'information qui manque, pas
   la logique de décision.
3. **Les stems Demucs** : le stem piano règle le sur-découpage (8 étiquettes au
   lieu de 19) mais la fondamentale **empire** (27,6 % contre 32,4 %). Il dit
   `G` pendant 5,9 s sur l'introduction.

## La mesure qui a décidé

A/B apparié, 40 morceaux de GuitarSet, même banc, mêmes références :

| | avant | après | mieux / pire |
|---|---|---|---|
| fondamentale | 68,9 % | **90,9 %** | **39 / 0** |
| majmin | 65,1 % | **89,1 %** | 39 / 0 |
| **ordre des accords** | 56,9 % | **90,7 %** | **37 / 0** |
| accords relevés | 690 (1,48×) | **476 (1,01×)** | — |

Test du signe bilatéral **p < 10⁻⁶** sur les trois mesures, et **aucun morceau
ne perd** (pire cas +0,0).

Sur son propre relevé : fondamentale **41,9 → 74,5 %**, ordre **42,1 → 90,9 %**,
**zéro accord mal nommé**, 11 étiquettes pour 10 accords.

## Architecture retenue

**Gardé** : `detect_key`, le tempo (`_beat_track` + `_resolve_tempo`), la
signature, `detect_local_keys`, `_classify_chord_roles`. Seule la GRILLE change
de producteur. **Tout le chemin MIDI est intact.**

**Sauté, délibérément** : les couches de rattrapage du chroma
(`_merge_arpeggio_segments`, `_stabilize_antiparasite`, `_refine_chorus_loops`,
`_fix_intro_prefix`, `_clean_segments`, et **le fondu des segments brefs livré
le matin même**, commit `d2b4434`). Elles corrigent des défauts que lv-chordia
n'a pas — il relève déjà 1,01× le bon nombre d'accords contre 1,48× — et les
appliquer à une grille propre ne ferait que l'abîmer.

**Repli** : `PJC_DISABLE_LV_CHORDIA=1`, ou simplement l'absence du paquet,
ramène au moteur d'origine (vérifié). Un modèle pas encore téléchargé ne doit
pas empêcher de lire un morceau.

## La licence, qui a décidé du candidat

| moteur | licence des modèles | verdict |
|---|---|---|
| **lv-chordia** | **MIT** | retenu — aucune restriction commerciale |
| madmom | CC BY-NC-SA | mesure seulement ; et ininstallable ici |
| BTC (ISMIR 19) | « research only » | mesure seulement |

madmom est de toute façon hors d'atteinte sur ce poste : il exige Cython 1.x,
qui ne supporte pas Python 3.13 — impasse circulaire. Une heure y a été perdue
avant d'abandonner.

## Coûts, à assumer explicitement

- **~1,4 Go** de modèles au premier usage, dans `ism2019-chord/` (déjà ignoré
  par git). C'est le vrai point de friction pour une application de bureau.
- Environ **0,4× le temps réel** à l'analyse (13,6 s pour 34 s d'audio).
- Dépendance à PyTorch — déjà présente pour la transcription du piano.
- Le vocabulaire de lv-chordia est **large** (c'est son objet). L'adaptateur de
  mesure le repliait sur le vocabulaire du projet, ce qui le PÉNALISAIT sur les
  septièmes (74 % mesurés, donc sous-estimés). L'intégration, elle, conserve
  ses enrichissements.

## Ce qui devient sans objet

Une partie du travail audio de la semaine : le fondu des segments brefs
(`d2b4434`), et les mesures qui l'entouraient. Le code reste dans le moteur de
repli. Les trois formes de fondu restent mesurables dans `corpus-bench.py`.

La mesure d'**ORDRE** (`8718c22`), elle, reste centrale : c'est elle qui a
montré l'écart réel (+33,8 pt) là où les métriques de durée n'en voyaient que
la moitié.

## Ce qui reste à vérifier

**Rien n'a été vu tourner dans Electron.** À regarder sur « Saint Esprit » : la
grille doit afficher sa boucle `Em → C → G → D`, et non plus 19 étiquettes.

Le premier `Do` est placé à 2,76 s par lv-chordia quand Narcisse dit 6 s —
seul écart notable sur son relevé. À lui de dire qui a raison.

## Prochaines actions

1. Ouvrir Electron et regarder une grille audio.
2. Décider du traitement des 1,4 Go : téléchargement à la demande, au premier
   import audio, ou embarqué dans l'installeur.
3. Les enrichissements de lv-chordia (`maj9`, `min11`, `13`) remontent
   maintenant jusqu'à l'interface : vérifier que `chord-display` et la frise
   les affichent correctement.
4. Mesurer les 180 morceaux de GuitarSet, et non plus 40, pour figer la
   référence.

## Questions pour Narcisse

- Les 1,4 Go : téléchargement au premier morceau importé, avec une barre de
  progression, ou autre chose ?
- Sur « Saint Esprit », le premier `Do` : à 2,76 s ou à 6 s ?
