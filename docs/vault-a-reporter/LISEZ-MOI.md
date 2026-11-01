# Notes à reporter dans le vault

Une session de Claude dans le cloud travaille dans le dépôt et ne peut pas écrire dans le coffre
du PC (`/home/visiteur/Documents/zic-vault/`, coffre unique depuis le 14/10/2026). Ses notes de fin
de tâche sont donc déposées ici, une par sujet, nommées `AAAA-MM-JJ-sujet.md`. Les 53 notes du
24/09 au 14/10 ont déjà été rangées dans le coffre le 14/10 (`features/<module>/`).

Après un `git pull`, depuis `/home/visiteur/piano-jazz-chords` :

    bash scripts/sync-vault.sh

Les notes qui ne sont pas encore dans le vault sont copiées dans `<vault>/a-integrer/` (rien n'est
écrasé). L'agent qui travaille dans le coffre les range ensuite (`features/<module>/`, `state/`, `log.md`,
`experiments/`, `decisions/`), les relie depuis un hub, puis commite et pousse le coffre. Un autre emplacement : `PJC_VAULT=/chemin bash scripts/sync-vault.sh`.
