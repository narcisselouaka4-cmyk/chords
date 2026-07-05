// [OpenCode] — 2026-07-04 — Labels pédagogiques pour les types de voicing

const VOICING_LABELS = {
  single: 'Note seule',
  shell: 'Shell voicing',
  cluster: 'Cluster',
  close: 'Close voicing',
  open: 'Open voicing',
  spread: 'Spread voicing',
};

export function getVoicingLabel(voicing) {
  return VOICING_LABELS[voicing] || voicing || '';
}

// [OpenCode] — 2026-07-04 — Alias musicaux utiles : même notes, nom différent.
// Clé = symbole principal, valeur = symbole alternatif (sans fondamentale).
const ALIASES = {
  '6': 'm7 (3rd inversion)',
  'm7': '6 (relative major)',
  'maj7#5': 'maj7alt',
  '7sus4': 'sus4 7',
  '9sus4': 'sus4 9',
  '13sus4': 'sus4 13',
};

export function getAlias(symbol) {
  return ALIASES[symbol] || null;
}
