#!/usr/bin/env node
// Construit les voicings DÉRIVÉS des qualités absentes de VoicingLab
// (m13, 11, maj11, 13#11, maj13#11, 7sus2, madd9, add11, 6add11).
//
// Validé par Narcisse le 2026-09-23 (« Fais-les toutes »). Composition des
// accords recoupée dans data/voicinglab/qualites-hors-voicinglab-verifiees.json.
//
// Méthode : pour chaque ton, on part des voicings RÉELS VoicingLab de l'accord
// parent et on déplace UNE note de l'accord (même octave, même main, écart ≤ 4
// demi-tons). Un voicing dérivé est rejeté s'il crée un doublon, un croisement
// de mains, une note étrangère à l'accord cible, s'il lui manque une note
// caractéristique, si la note déplacée change de rang (l'ordre des voix d'un
// drop 2 / drop 3 est conservé) ou, pour quartal / so what / cluster, si le
// motif d'intervalles du style change.
//
// Usage : node scripts/voicinglab/build-derived.mjs
//   entrée : src/data/voicinglab-reference.json
//   sortie : src/data/voicinglab-derived.json + data/voicinglab/voicings-derives-C.md

import { readFileSync, writeFileSync } from 'node:fs';

// Intervalles en demi-tons depuis la fondamentale (modulo 12).
const DERIVATIONS = [
  { quality: 'madd9', parent: 'add9', moves: [[4, 3]], rule: 'tierce majeure → tierce mineure',
    tones: [0, 2, 3, 7], required: [3, 2] },
  { quality: 'add11', parent: 'add9', moves: [[2, 5]], rule: '9e → 11e',
    tones: [0, 4, 5, 7], required: [4, 5] },
  { quality: '7sus2', parent: '7sus4', moves: [[5, 2]], rule: '4te → 2de',
    tones: [0, 2, 7, 10], required: [2, 10] },
  { quality: '6add11', parent: '6', moves: [[7, 5]], rule: '5te (facultative) → 11e',
    tones: [0, 4, 5, 7, 9], required: [4, 9, 5] },
  { quality: '11', parent: '9sus4', moves: [], rule: 'équivalence jazz C11 = C9sus4 (tierce omise)',
    tones: [0, 2, 4, 5, 7, 10], required: [10, 5] },
  { quality: 'm13', parent: 'm11', moves: [[5, 9]], rule: '11e → 13e',
    tones: [0, 2, 3, 5, 7, 9, 10], required: [3, 10, 9] },
  { quality: 'maj11', parent: 'maj9', moves: [[4, 5]], rule: 'tierce → 11e (évite la note à éviter 3/11)',
    tones: [0, 2, 4, 5, 7, 11], required: [11, 5] },
  { quality: '13#11', parent: '13', moves: [[7, 6], [2, 6]], rule: '5te → #11 (sinon 9e → #11)',
    tones: [0, 2, 4, 6, 7, 9, 10], required: [4, 10, 6, 9] },
  { quality: 'maj13#11', parent: 'maj13', moves: [[7, 6], [2, 6]], rule: '5te → #11 (sinon 9e → #11)',
    tones: [0, 2, 4, 6, 7, 9, 11], required: [4, 11, 6, 9] },
];

const LABELS = { 0: '1P', 1: '9m', 2: '9M', 3: '3m', 4: '3M', 5: '11P', 6: '11A', 7: '5P', 8: '13m', 9: '13M', 10: '7m', 11: '7M' };
const LABEL_OVERRIDES = { '7sus2': { 2: '2M' }, '6add11': { 9: '6M' } };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE = { 1: 0, 2: 1, 9: 1, 3: 2, 4: 3, 11: 3, 5: 4, 6: 5, 13: 5, 7: 6 };

/** Épelle une note selon son degré dans l'accord (la #11 de C = F#, pas Gb). */
function spell(rootName, label, midi) {
  const letter = LETTERS[(LETTERS.indexOf(rootName[0]) + DEGREE[parseInt(label, 10)]) % 7];
  let acc = ((midi % 12) - LETTER_PC[letter] + 12) % 12;
  if (acc > 6) acc -= 12;
  const accStr = acc < 0 ? 'b'.repeat(-acc) : '#'.repeat(acc);
  return `${letter}${accStr}${Math.floor((midi - acc) / 12) - 1}`;
}

const ref = JSON.parse(readFileSync('src/data/voicinglab-reference.json', 'utf8'));
const chords = {};
const rejected = {};

// Styles définis par leurs intervalles : la dérivée doit garder le même motif.
const STRUCTURAL_STYLES = new Set(['quartal', 'so_what', 'cluster']);

const gaps = (arr) => arr.slice(1).map((m, i) => m - arr[i]);

function deriveVoicing(v, rootPc, der, style) {
  const pcOf = (m) => (((m - rootPc) % 12) + 12) % 12;
  // Premier déplacement applicable : la note source doit être présente.
  const all = [...v.lh, ...v.rh];
  const move = der.moves.find(([from]) => all.some((m) => pcOf(m) === from));
  const shift = (m) => (move && pcOf(m) === move[0] ? m + (move[1] - move[0]) : m);
  const lh = v.lh.map(shift).sort((a, b) => a - b);
  const rh = v.rh.map(shift).sort((a, b) => a - b);
  const notes = [...lh, ...rh];
  if (der.moves.length && !move) return { error: 'note source absente' };
  if (new Set(notes).size !== notes.length) return { error: 'doublon' };
  // La note déplacée garde son rang : l'ordre des voix (drop 2, drop 3…) est conservé.
  const moved = all.map(shift);
  if (moved.some((m, i) => i > 0 && m <= moved[i - 1])) return { error: 'ordre des voix modifié' };
  if (STRUCTURAL_STYLES.has(style) && gaps(notes).join() !== gaps(all).join()) {
    return { error: 'structure du style perdue' };
  }
  if (lh.length && rh.length && lh[lh.length - 1] >= rh[0]) return { error: 'croisement de mains' };
  const pcs = new Set(notes.map(pcOf));
  if ([...pcs].some((pc) => !der.tones.includes(pc))) return { error: 'note étrangère' };
  if (der.required.some((pc) => !pcs.has(pc))) return { error: 'note caractéristique manquante' };
  return { lh, rh, notes };
}

for (const der of DERIVATIONS) {
  for (let pc = 0; pc < 12; pc += 1) {
    const parent = ref.chords[`${pc}|${der.parent}`];
    if (!parent) continue;
    const rootName = parent.s.slice(0, parent.s.length - der.parent.length);
    const labels = { ...LABELS, ...(LABEL_OVERRIDES[der.quality] || {}) };
    const styles = {};
    for (const [style, list] of Object.entries(parent.styles)) {
      const seen = new Set();
      const out = [];
      for (const v of list) {
        const r = deriveVoicing(v, pc, der, style);
        if (r.error) {
          const k = `${der.quality}/${style}: ${r.error}`;
          rejected[k] = (rejected[k] || 0) + 1;
          continue;
        }
        const key = r.notes.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          lh: r.lh, rh: r.rh,
          n: r.notes.map((m) => spell(rootName, labels[(((m - pc) % 12) + 12) % 12], m)).join(' '),
          i: r.notes.map((m) => labels[(((m - pc) % 12) + 12) % 12]).join(' '),
          d: v.d,
          from: v.n,
        });
      }
      if (out.length) styles[style] = out;
    }
    chords[`${pc}|${der.quality}`] = {
      s: `${rootName}${der.quality}`,
      derivedFrom: parent.s,
      rule: der.rule,
      styles,
    };
  }
}

writeFileSync('src/data/voicinglab-derived.json', JSON.stringify({
  note: 'Voicings DÉRIVÉS (absents de VoicingLab) : une note déplacée à partir d\'un voicing VoicingLab réel du même ton. from = voicing VoicingLab d\'origine. Généré par scripts/voicinglab/build-derived.mjs.',
  chords,
}));

// Fiche de relecture humaine (ton de C).
const lines = ['# Voicings dérivés — relecture (ton de C)', '',
  'Chaque ligne : voicing dérivé ← voicing VoicingLab réel d\'origine. MG = main gauche, MD = main droite.', ''];
for (const der of DERIVATIONS) {
  const c = chords[`0|${der.quality}`];
  lines.push(`## C${der.quality} — depuis ${c.derivedFrom} (${der.rule})`, '');
  lines.push('| Style | MG | MD | ← VoicingLab |', '|---|---|---|---|');
  for (const [style, list] of Object.entries(c.styles)) {
    for (const v of list) {
      const names = v.n.split(' ');
      const lhNames = names.slice(0, v.lh.length).join(' ') || '—';
      const rhNames = names.slice(v.lh.length).join(' ') || '—';
      lines.push(`| ${style} | ${lhNames} | ${rhNames} | ${v.from} |`);
    }
  }
  lines.push('');
}
writeFileSync('data/voicinglab/voicings-derives-C.md', `${lines.join('\n')}\n`);

const count = (q) => Object.entries(chords).filter(([k]) => k.endsWith(`|${q}`))
  .reduce((a, [, c]) => a + Object.values(c.styles).flat().length, 0);
for (const der of DERIVATIONS) console.log(`${der.quality.padEnd(9)} ${String(count(der.quality)).padStart(4)} voicings (12 tons)`);
console.log('Rejets :', rejected);
