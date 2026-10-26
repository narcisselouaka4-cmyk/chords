# Consignes de travail — Piano Jazz Chords

Lire aussi `CLAUDE.md`, puis le protocole et l'état du coffre canonique :
`/home/visiteur/Documents/zic-vault/00_AGENT_START_HERE.md`, `index.md` et `state/`.

## Chaque commit doit être documenté dans le vault

Consigne explicite de Narcisse du 26/10/2026 : toute nouveauté ou correction
commitée doit être reportée dans le vault, à chaque commit, sans attendre
une nouvelle demande ni la fin de plusieurs sessions.

- Documenter le comportement, les fichiers concernés, le SHA applicatif,
  les vérifications réellement faites, leurs limites et les prochaines actions.
- Mettre à jour la note du module, `state/current-state.md`,
  `state/current-work.md`, `state/next-actions.md`, puis ajouter une entrée
  datée en fin de `log.md`. Relier les nouvelles notes depuis leur hub et `index.md`.
- Ajouter une ADR ou une expérience seulement si le changement le justifie.
- Commiter les changements documentaires du coffre séparément, par chemins explicites.
  Indiquer distinctement les commits applicatif et documentaire dans le bilan.
- Si le coffre est inaccessible, déposer une note complète dans
  `docs/vault-a-reporter/AAAA-MM-JJ-sujet.md`, avec le SHA à intégrer ; annoncer
  clairement que le report reste à faire. Cette note ne remplace pas l'intégration.
- Distinguer commit local et publication distante ; suivre la dernière consigne
  explicite de Narcisse concernant le push.

Préserver les modifications des autres travaux. Ne jamais utiliser `git add -A`
ni `git add .`, ni inclure des secrets, `.env`, `apikeys` ou caches générés.
