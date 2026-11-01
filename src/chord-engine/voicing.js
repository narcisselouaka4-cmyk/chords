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

// [Claude] — 2026-10-02 — Les alias figés (« maj7alt », « sus4 7 », « m7 (3rd
// inversion) »…) sont retirés : le Temps réel montre les vraies autres lectures des
// mêmes notes (chordReadings, src/chord-engine/index.js).
