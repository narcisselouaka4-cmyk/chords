// [Refonte v2/Global] — 2026-09-02 — Chargement des polices de la refonte.
// Bundlées localement via @fontsource (aucun appel réseau à l'exécution, aucune
// entorse à la CSP stricte d'Electron — Vite les sert en same-origin).
//   Manrope       → titres (600/700/800)
//   Inter         → texte courant (400/500/600/700)
//   JetBrains Mono → métadonnées techniques, badges (400/500)

import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
