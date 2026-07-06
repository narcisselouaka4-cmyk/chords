#!/bin/bash
# Lanceur rapide de Piano Jazz Chords

set -e

APP_DIR="/home/visiteur/piano-jazz-chords"
cd "$APP_DIR"

# Ensure Node and npm are available in double-click context
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"

# Tuer proprement l'instance Electron précédente pour recharger le main process.
APP_NAME="piano-jazz-chords"
if command -v pkill >/dev/null 2>&1; then
  pkill -f "$APP_NAME" 2>/dev/null || true
fi
sleep 0.5

# Use local Vite and Electron binaries directly
echo "Build de l'interface..."
node "$APP_DIR/node_modules/vite/bin/vite.js" build

echo "Lancement de l'application..."
node "$APP_DIR/node_modules/electron/cli.js" "$APP_DIR"
