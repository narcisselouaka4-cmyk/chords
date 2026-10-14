# Mission à lancer SUR LE PC : un seul coffre Obsidian pour Piano Jazz Chords

À coller dans une session Claude Code ouverte dans `/home/visiteur/piano-jazz-chords` (le PC de
Narcisse). Cette mission ne peut pas être faite depuis le cloud : les dossiers n'y existent pas.

Avant de la coller : `git pull --ff-only` (les notes de Claude arrivent par là).

## Où sont les sources (déjà retrouvées, ne pas redemander)
1. Coffre existant : `/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord` (~200 fichiers).
2. Notes écrites par Claude dans le dépôt : `/home/visiteur/piano-jazz-chords/docs/vault-a-reporter/`
   (53 notes `AAAA-MM-JJ-sujet.md`, du 24/09 au 14/10/2026 ; `LISEZ-MOI.md` n'est pas une note).
   Un script existe déjà : `scripts/sync-vault.sh` (copie sans écraser vers `<vault>/a-integrer/`).
3. Autres textes du dépôt : `CLAUDE.md` (la mémoire de travail du projet), `docs/*.md`
   (ARCHITECTURE, DESIGN, KNOWN_LIMITATIONS, rapports, baselines…), `CHANGES*.md` s'il existe.
4. Le journal git (`git log`) pour dater les décisions.
À ne pas lire : `node_modules`, `.git`, `dist`, caches, modèles, venv, binaires.

## Garde-fous propres à ce dépôt (à respecter en plus de la mission)
- Il existe un fichier nommé `apikeys` à la racine du dépôt : **ne jamais l'ouvrir ni le copier**.
- Aucune clé, aucun token, aucun mot de passe dans le coffre (chercher aussi `sk-`, `Bearer`, `API_KEY`).
- Pas de `git add -A` ni `git add .` : toujours des chemins explicites (dans le dépôt de l'app ;
  dans le coffre, le premier commit peut ajouter le contenu du coffre, qui est un dépôt à part).
- Ne pas modifier le code de l'application ; ne rien supprimer ni déplacer dans les originaux.

## Mission
(Colle ici, tel quel, le texte de la mission de Narcisse : étapes 1 à 8, interdits, rapport final.)
