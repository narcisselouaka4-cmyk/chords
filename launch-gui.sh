#!/bin/bash
# Lanceur graphique pour le bureau Cinnamon
set -e
APP_DIR="/home/visiteur/piano-jazz-chords"
cd "$APP_DIR"
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
gnome-terminal -- bash -c "$APP_DIR/lancer-piano.sh; read -p 'Appuyez sur Entrée pour fermer...'"
