---
title: Pédagogie IA — la transcription du piano au son échouait (modèle, torch récent)
type: bug
date: 2026-11-01
status: corrigé, prouvé avec un modèle de même forme, non vérifié sur le PC
tags: [pedagogie-ia, transcription, piano-transcription-inference, torch]
---

# La transcription du piano au son échouait sans dire pourquoi

## Symptôme
Narcisse : « la transcription piano ne marche toujours pas dans Pédagogie IA ». L'application
n'affichait que « le son n'a pas pu être transcrit » (raison avalée).

## Causes (reproduites dans le cloud, sur le son d'« Amazing Grace »)
Environnement refait comme une installation récente : torch 2.15 CPU, librosa 0.11,
piano-transcription-inference. Le vrai modèle (zenodo.org) est inaccessible depuis le cloud ; les
essais utilisent un modèle de même forme (172 Mo, même structure que celui des auteurs).
1. **Téléchargement raté** : la bibliothèque télécharge le modèle (~165 Mo) avec `wget` au premier
   usage. Un échec laisse un fichier vide/tronqué ; ensuite `torch.load` échoue à chaque fois avec une
   erreur SANS message → « Transcription impossible : » (vide).
2. **torch ≥ 2.6** ouvre les modèles en `weights_only` par défaut et refuse celui-ci (objets numpy de
   l'entraînement) : « Weights only load failed ». `requirements.txt` ne fixe que `torch>=2.2`.

## Correctif
- `electron/piano-transcriber.py` : un modèle incomplet est retiré avant le chargement (la bibliothèque
  le retélécharge) ; sans wget, message clair ; le modèle officiel est chargé avec
  `weights_only=False` le temps de sa construction seulement ; erreurs avec leur type et leur message ;
  nouvelle raison `ModelMissing` (« n'a pas pu être téléchargé (N octets sur ~165 Mo) »).
- `src/ui/pedagogie-tab.js` + `src/pedagogie/sound-reconcile.js` : la raison est gardée
  (`soundCheck.detail`) et dite dans la phrase de lecture.
- `src/pedagogie/tutorial-memory.js` : `READING_REVISION` 7 (relecture, pour que le son recoupe l'image).

## Vérifié
- Script d'avant + modèle de même forme : « Weights only load failed ». Script corrigé : transcription
  complète de 2 extraits de 20 s (notes sans valeur : faux modèle, seul le chargement est prouvé).
- Fichier de modèle vide : message `ModelMissing` clair au lieu d'une erreur vide.
- Tests : sound-reconcile 40/40, moteur 98/98, mémoire, DOM (exit 0), build, Parties 1 et 3.

## Reste à vérifier
- Sur le PC de Narcisse, avec le vrai modèle : la transcription aboutit. Si le modèle n'est pas encore
  téléchargé, le premier lancement le télécharge (165 Mo, zenodo.org).
- Le contenu exact de l'erreur sur son PC n'est pas connu (pas de journal fourni) : les deux causes
  ci-dessus sont les seules trouvées ; si ça échoue encore, la phrase de lecture donne maintenant la raison.

## À mettre dans decisions/
- Le modèle de transcription (fichier officiel, téléchargé par la bibliothèque) est chargé en mode complet
  (`weights_only=False`), limité à sa construction.

## À mettre dans experiments/
- Banc Python dans le cloud : venv torch CPU + librosa 0.11 + piano-transcription-inference ; zenodo et
  huggingface bloqués par le proxy → modèle factice de même forme pour tester le chargement.

## Prochaines actions / questions
- Narcisse : `git pull`, relancer, rouvrir Amazing Grace ; si la phrase de lecture dit encore que le son
  n'a pas pu être transcrit, me copier la raison affichée.
