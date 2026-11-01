---
title: Coffre unique et flux des notes du cloud
type: decision
date: 2026-10-14
status: en place (règle écrite dans CLAUDE.md)
tags: [vault, process, memoire, claude-code]
---

# Coffre unique et flux des notes du cloud

## Ce qui a été fait
- Constat : le vault du PC n'était plus mis à jour depuis des semaines. Claude (cloud) ne voit pas
  `/home/visiteur/...` et déposait ses notes dans `docs/vault-a-reporter/` sans qu'elles soient reportées (53 notes).
- `scripts/sync-vault.sh` : copie les nouvelles notes vers `<coffre>/a-integrer/`, sans rien écraser.
- `docs/MISSION-COFFRE-UNIQUE.md` : brief pour la session du PC (sources, état du projet au 14/10, garde-fous).
- `CLAUDE.md` : section « Fin de session (obligatoire) » (tests + build, commit/push par chemins explicites,
  note avec frontmatter, push de la note, phrase finale « Note à reporter dans le coffre : … »).
- Fusion avec le commit du PC (ADR-049) : le coffre `zic-vault` est la source de vérité, l'ancien est une archive.
- Fichiers : `CLAUDE.md`, `scripts/sync-vault.sh`, `docs/MISSION-COFFRE-UNIQUE.md`, `docs/vault-a-reporter/LISEZ-MOI.md`.

## Vérifié
- `sync-vault.sh` sur un coffre de test : copie, pas d'écrasement, `LISEZ-MOI.md` exclu.
- Pas testé sur le vrai coffre (inaccessible depuis le cloud).

## À mettre dans decisions/
- Le cloud n'écrit jamais dans le coffre ; il dépose des notes datées dans le dépôt, une session du PC les range.
- Option si le passage devient pénible : refléter le coffre dans un dépôt GitHub privé pour que le cloud y écrive directement.

## À mettre dans experiments/
- Rien.

## Prochaines actions
- Lancer la mission d'unification sur le PC ; ranger les 53 notes (features / ADR / EXP).
- Question : veux-tu une chronologie 24/09 → 14/10 préparée depuis les notes et `git log` ?
