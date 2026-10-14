# Notes à reporter dans le vault

Claude travaille dans le dépôt (sur un serveur) et ne peut pas écrire dans le vault du PC
(`/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord/`). Ses notes de fin de tâche sont donc
déposées ici, une par sujet, nommées `AAAA-MM-JJ-sujet.md`.

Après un `git pull`, depuis `/home/visiteur/piano-jazz-chords` :

    bash scripts/sync-vault.sh

Les notes qui ne sont pas encore dans le vault sont copiées dans `<vault>/a-integrer/` (rien n'est
écrasé). L'agent qui travaille dans le vault les range ensuite (`state/`, `log.md`, `experiments/`,
`decisions/`). Un autre emplacement : `PJC_VAULT=/chemin bash scripts/sync-vault.sh`.
