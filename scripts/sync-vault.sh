#!/usr/bin/env bash
# Recopie les notes de docs/vault-a-reporter/ dans le vault Obsidian du PC (hors du dépôt).
# Usage, depuis la racine du dépôt :   bash scripts/sync-vault.sh
# Ne remplace jamais une note déjà présente dans le vault : seules les nouvelles sont copiées.
# Elles arrivent dans  <vault>/a-integrer/  ; l'agent qui lit le vault (00_AGENT_START_HERE.md)
# les range ensuite dans state/, log.md, experiments/ ou decisions/.
set -euo pipefail

VAULT="${PJC_VAULT:-/home/visiteur/.openclaw/workspace/apps/piano-jazz-chord}"
SRC="$(cd "$(dirname "$0")/.." && pwd)/docs/vault-a-reporter"
DEST="$VAULT/a-integrer"

if [ ! -d "$VAULT" ]; then
  echo "Vault introuvable : $VAULT" >&2
  echo "Indique son emplacement :  PJC_VAULT=/chemin/du/vault bash scripts/sync-vault.sh" >&2
  exit 1
fi

mkdir -p "$DEST"
new=0
for f in "$SRC"/*.md; do
  name="$(basename "$f")"
  [ "$name" = "LISEZ-MOI.md" ] && continue
  # Déjà reportée (dans a-integrer/) ou déjà rangée ailleurs dans le vault : on n'y touche pas.
  if [ -e "$DEST/$name" ] || [ -n "$(find "$VAULT" -name "$name" -print -quit 2>/dev/null)" ]; then continue; fi
  cp "$f" "$DEST/$name"
  echo "  + $name"
  new=$((new + 1))
done
echo "$new nouvelle(s) note(s) copiée(s) dans $DEST"
