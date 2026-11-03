// Comparaison par occurrence, jamais par simple hauteur : un La ajouté ici ne
// colore pas les La que le pianiste joue ailleurs. Aucune modification du MIDI.
import { notePairs } from './take-edit.js';
import { takeExample } from './take-attachment.js';

const velocity = (e) => e.velocity > 1 ? e.velocity / 127 : e.velocity;
const identity = (p) => JSON.stringify([p.event.channel || 0, p.event.note, p.event.time, velocity(p.event), p.end]);

function span(pair, take, kind, start = pair.event.time) {
  const events = take.events;
  let sustainedEnd = pair.end;
  const pedal = events.filter((e) => e.type === 'control' && e.controller === 64 && e.time <= pair.end).at(-1);
  if (pedal?.value >= 64) {
    sustainedEnd = events.find((e) => e.type === 'control' && e.controller === 64 && e.value < 64 && e.time > pair.end)?.time
      ?? Math.max(take.duration || 0, ...events.map((e) => e.time));
    const next = events.find((e) => e.type === 'note_on' && e.velocity > 0 && e.note === pair.event.note && e.time >= pair.end);
    if (next) sustainedEnd = Math.min(sustainedEnd, next.time);
  }
  return { kind, note: pair.event.note, start, end: pair.end, sustainedEnd };
}

export function comparedTakeExample(original, changed) {
  const example = takeExample(changed, 'Avec la proposition');
  if (!example) return null;
  const source = notePairs(original.events);
  const remaining = [...source];
  const unmatched = [];
  for (const pair of notePairs(changed.events)) {
    const index = remaining.findIndex((p) => identity(p) === identity(pair));
    if (index >= 0) remaining.splice(index, 1);
    else unmatched.push(pair);
  }
  const changes = [];
  for (const pair of unmatched) {
    // Un relâchement raccourci reste une modification de la même attaque.
    const index = remaining.findIndex((p) => p.event.note === pair.event.note
      && (p.event.channel || 0) === (pair.event.channel || 0) && p.event.time === pair.event.time);
    const previous = index >= 0 ? remaining.splice(index, 1)[0] : null;
    changes.push(span(pair, changed, previous ? 'modified' : 'added'));
    if (previous?.end > pair.end) changes.push(span(previous, original, 'removed', pair.end));
  }
  changes.push(...remaining.map((p) => span(p, original, 'removed')));
  return { ...example, comparison: { version: 1, changes: changes.sort((a, b) => a.start - b.start) } };
}

/** L'horloge est celle de la prise, indépendamment de la vitesse de lecture. */
export function playingChangesAt(comparison, at, { pedal = true } = {}) {
  const changed = new Set();
  const removed = new Set();
  for (const s of comparison?.changes || []) {
    if (at >= s.start && at < (pedal ? s.sustainedEnd : s.end)) {
      (s.kind === 'removed' ? removed : changed).add(s.note);
    }
  }
  return { changed, removed };
}
