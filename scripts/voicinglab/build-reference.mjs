#!/usr/bin/env node
// Construit le référentiel compact embarqué par l'app à partir de l'extraction
// brute VoicingLab (extract-voicinglab.mjs).
//
// Usage : node scripts/voicinglab/build-reference.mjs
//   entrée : data/voicinglab/voicinglab-extraction-12-tons.json
//   sortie : src/data/voicinglab-reference.json
//
// Les NOTES ne sont jamais modifiées. Seule la répartition main gauche / main
// droite est calculée ici, parce que VoicingLab indique hand = "both" sans dire
// quelle note va dans quelle main (règle documentée dans splitHands).

import { readFileSync, writeFileSync } from 'node:fs';

const MAX_HAND_SPAN = 12;

// Nombre de notes graves confiées à la main gauche quand hand = "both",
// d'après la définition même du style (cf. getVoicingStyles de VoicingLab).
const LH_COUNT_BY_STYLE = {
  close: 0,            // tout en main droite, dans l'octave
  drop2: 1,            // la voix descendue d'une octave
  drop3: 1,            // idem
  drop2_4: 2,          // les deux voix descendues
  block: 1,            // locked hands : doublure grave de la mélodie
  spread: 1,           // basse seule, accord étalé au-dessus
  open: 2,             // basse + une voix, le reste ouvert au-dessus
  quartal: 2,          // deux quartes graves / deux aiguës
  so_what: 3,          // trois quartes graves, tierce majeure au-dessus (Bill Evans)
  upper_structure: -3, // négatif = tout sauf les 3 notes du haut (la triade)
};

function span(notes) {
  return notes.length ? notes[notes.length - 1] - notes[0] : 0;
}

/**
 * Répartit un voicing trié entre les deux mains.
 * 1. hand = left / right : tout dans la main indiquée.
 * 2. hand = both : on applique LH_COUNT_BY_STYLE ; si une main dépasse alors
 *    l'octave (MAX_HAND_SPAN), on retient le point de coupure qui minimise
 *    l'écartement de la main la plus ouverte (à égalité : le plus proche de la
 *    règle du style).
 */
export function splitHands(midi, hand, style) {
  const notes = [...midi].sort((a, b) => a - b);
  if (hand === 'left') return { lh: notes, rh: [] };
  if (hand === 'right') return { lh: [], rh: notes };
  const rule = LH_COUNT_BY_STYLE[style] ?? 1;
  const preferred = Math.max(0, Math.min(notes.length, rule < 0 ? notes.length + rule : rule));
  const cost = (k) => Math.max(span(notes.slice(0, k)), span(notes.slice(k)));
  let best = preferred;
  if (cost(preferred) > MAX_HAND_SPAN) {
    for (let k = 0; k <= notes.length; k += 1) {
      const better = cost(k) < cost(best)
        || (cost(k) === cost(best) && Math.abs(k - preferred) < Math.abs(best - preferred));
      if (better) best = k;
    }
  }
  return { lh: notes.slice(0, best), rh: notes.slice(best) };
}

const raw = JSON.parse(readFileSync('data/voicinglab/voicinglab-extraction-12-tons.json', 'utf8'));
const chords = {};
const absent = {};
for (const c of raw.chords) {
  const pc = raw.roots.indexOf(c.pitchClassRoot);
  const key = `${pc}|${c.quality}`;
  if (!c.exists) { absent[key] = c.reason; continue; }
  const styles = {};
  for (const [style, list] of Object.entries(c.styles)) {
    styles[style] = list.map((v) => {
      const { lh, rh } = splitHands(v.midi, v.hand, style);
      return { lh, rh, n: v.names.join(' '), i: v.intervals.join(' '), d: v.difficulty };
    });
  }
  chords[key] = { s: c.symbol, styles };
}

writeFileSync('src/data/voicinglab-reference.json', JSON.stringify({
  source: raw.source,
  extractedAt: raw.extractedAt,
  note: 'Clé = "<pitch class racine>|<qualité VoicingLab>". lh/rh = MIDI réels VoicingLab ; seule la répartition des mains est calculée (scripts/voicinglab/build-reference.mjs). n = noms VoicingLab, i = intervalles, d = difficulté VoicingLab.',
  chords,
  absent,
}));
const total = Object.values(chords).reduce((a, c) => a + Object.values(c.styles).flat().length, 0);
console.log(`${Object.keys(chords).length} accords, ${total} voicings, ${Object.keys(absent).length} combinaisons absentes`);
