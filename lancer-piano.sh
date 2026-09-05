#!/bin/bash
# Lanceur bureau de Piano Jazz Chords
set -e
APP_DIR="/home/visiteur/piano-jazz-chords"
cd "$APP_DIR"
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
"$APP_DIR/launch.sh"
# Pause pour garder le terminal ouvert et voir les erreurs.
echo ""
read -p "Appuyez sur Entrée pour fermer..."
