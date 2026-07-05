import { formatPc } from '../chord-engine/naming.js';
import { midiToNoteName, noteNameToMidi } from '../chord-engine/intervals.js';

// [Claude] — 2026-07-03 — Génération de voicings alternatifs pour un accord.
// Objectif : proposer 2 à 3 versions conservant les notes communes et minimisant les déplacements.
export function generateAlternatives(result, latin = false) {
  if (!result || !result.intervals?.length) return [];

  const alternatives = [];
  const rootPc = result.rootPc;
  const intervals = result.intervals;
  const bassPc = result.bassPc;

  // Close position : fondamentale en bas, notes empilées.
  const closeNotes = intervals.map((i) => (rootPc + i) % 12);
  alternatives.push({
    name: `${formatPc(rootPc, latin)} close position`,
    notes: closeNotes.map((pc) => formatPc(pc, latin)),
    midiNotes: closeNotes.map((pc) => pc + 60),
  });

  // Drop 2 : retirer la 2ème note en partant du haut et la descendre d'une octave.
  if (intervals.length >= 4) {
    const drop2Notes = [...closeNotes];
    const secondFromTopIndex = drop2Notes.length - 2;
    const dropped = drop2Notes.splice(secondFromTopIndex, 1)[0];
    drop2Notes.push((dropped + 12 - 12) % 12);
    alternatives.push({
      name: `${formatPc(rootPc, latin)} drop 2`,
      notes: drop2Notes.map((pc) => formatPc(pc, latin)),
      midiNotes: drop2Notes.map((pc) => pc + 60),
    });
  }

  // Spread voicing : disperser les notes pour un son plus ouvert.
  if (intervals.length >= 4) {
    const spreadNotes = closeNotes.map((pc, index) =>
      index % 2 === 1 ? (pc + 12) % 12 : pc
    );
    alternatives.push({
      name: `${formatPc(rootPc, latin)} spread`,
      notes: spreadNotes.map((pc) => formatPc(pc, latin)),
      midiNotes: spreadNotes.map((pc) => pc + 60),
    });
  }

  return alternatives.filter((alt) => alt.notes.length >= 3);
}
