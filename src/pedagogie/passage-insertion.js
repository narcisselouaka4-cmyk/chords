// Insérer une chaîne observée avant son arrivée, sans la confondre avec le
// remplacement de toute une grille. Les notes du passage sont transposées en bloc.
import { parseChordName } from './note-roles.js';
import { parseKey, progressionFromDegrees, voicingShapes, chordsExample, prefersSharps } from './tutorial-transfer.js';
import { passageExample, transposeInterval } from './teacher-notes.js';
import { buildChordExample } from './copilot-demo.js';
import { chordToneIntervals } from '../practice-exercise.js';

const pc = (n) => ((n % 12) + 12) % 12;
const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const fail = (error) => ({ example: null, text: '', error });

export function insertionBetween(message) {
  const text = String(message || '').replace(/[‐‑‒–—−]/g, '-').replace(/’/g, "'");
  const match = /\bentre\s+(?:le\s+)?([1-7])\s*(?:-|et|au|vers)\s*(?:le\s+)?([1-7])\b/i.exec(text);
  const sourceDegrees = match && text.slice(0, match.index).match(/[1-7](?:\s*-\s*[1-7]){1,11}/)?.[0]?.replace(/\s/g, '');
  return match ? { degrees: [Number(match[1]), Number(match[2])], sourceDegrees, withoutBetween: text.replace(match[0], '') } : null;
}

export function findSourceInsertion(input) {
  const { source, targets, targetKey } = input;
  if (!parseKey(source.key) || !parseKey(targetKey)) return null;
  const degrees = progressionFromDegrees('1-2-3-4-5-6-7', targetKey).map(parseChordName);
  const parsed = targets.map(parseChordName);
  for (let i = 1; i < parsed.length; i++) {
    const between = [degrees.findIndex((d) => d.rootPc === parsed[i - 1]?.rootPc) + 1, degrees.findIndex((d) => d.rootPc === parsed[i]?.rootPc) + 1];
    if (between.some((n) => !n)) continue;
    const result = insertSourcePassage({ ...input, between });
    if (result.example) return { ...result, between };
  }
  return null;
}

/** Les seuls ajouts de notes permis ici sont les accords explicites de la cible et
 * une résolution sus4 → tierce calculée depuis les notes de l'arrivée observée. */
export function insertSourcePassage({ source, targets, targetKey, between, sourceProgression }) {
  if (!Array.isArray(between) || between.length !== 2 || between.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return fail('Précise les deux degrés entre lesquels insérer le passage.');
  const fromKey = parseKey(source.key), toKey = parseKey(targetKey);
  if (!fromKey || !toKey || fromKey.minor !== toKey.minor) return fail('Il faut connaître les tonalités de la source et de la cible, avec le même mode, pour conserver les intervalles de ce passage.');
  const degrees = progressionFromDegrees('1-2-3-4-5-6-7', targetKey).map(parseChordName);
  const parsed = targets.map(parseChordName);
  if (!parsed.length || parsed.some((c) => !c)) return fail('Un accord cible n’est pas reconnu. Je ne le retire pas de la grille pour forcer l’insertion.');
  const left = degrees[between[0] - 1], right = degrees[between[1] - 1];
  const at = parsed.findIndex((c, i) => i > 0 && c.rootPc === right.rootPc && parsed[i - 1].rootPc === left.rootPc);
  if (at < 1) return fail(`Ta grille ne contient pas ${between.join(' → ')} comme deux accords successifs. Je ne déplace pas ce passage ailleurs à ta place.`);
  const grid = source.chords.filter((c) => c.start < source.end && c.end > source.start).sort((a, b) => a.start - b.start);
  if (grid.length < 2 || grid.some((c, i) => c.uncertain || !parseChordName(c.label) || (i && c.start - grid[i - 1].end > 1))) return fail('Il manque une chaîne continue et lisible dans cette source. Je ne construis pas de mouvement à partir de morceaux séparés.');
  const shapes = voicingShapes(source.notes, grid, source);
  const checked = grid.map((c) => shapes.find((s) => !s.unsure && s.time >= Math.max(c.start, source.start) - 0.15 && s.time < Math.min(c.end, source.end)));
  if (checked.some((s) => !s) || checked.some((s, i) => s.rootPc !== parseChordName(grid[i].label).rootPc)) return fail('Les notes disponibles ne confirment pas tous les accords de ce mouvement. Je ne prépare pas d’insertion à partir des seules étiquettes.');
  const shift = transposeInterval(source.key, targetKey);
  const symbols = grid.map((c) => {
    const chord = parseChordName(c.label);
    const alphabet = prefersSharps(targets) ? names : flats;
    const root = alphabet[pc(chord.rootPc + shift)];
    return `${root}${chord.quality}${chord.bassPc === null ? '' : `/${alphabet[pc(chord.bassPc + shift)]}`}`;
  });
  const arrival = parseChordName(symbols.at(-1)), target = parsed[at];
  if (arrival.rootPc !== target.rootPc) return fail(`Ce passage arrive sur ${symbols.at(-1)}, alors que tu veux rejoindre ${targets[at]}. L’insérer ici changerait ses degrés ; je ne le fais pas.`);
  const picked = source.notes.filter((n) => n.start < source.end && n.end > source.start);
  if (picked.some((n) => n.midi + shift < 21 || n.midi + shift > 108)) return fail('La transposition sort du clavier disponible. Je ne supprime pas les notes hors registre.');
  const lastShape = checked.at(-1);
  const playedArrival = ['lh', 'rh'].flatMap((hand) => lastShape.hands[hand].map((n) => ({ midi: n.midi + shift, hand })));
  let resolution = null;
  if (arrival.quality !== target.quality) {
    const tones = chordToneIntervals(target.quality);
    const third = tones.has(3) ? 3 : tones.has(4) ? 4 : null;
    const intervals = new Set(playedArrival.map((n) => pc(n.midi - arrival.rootPc)));
    if (!/sus4/.test(arrival.quality) || third === null || !intervals.has(5)
      || [...intervals].some((n) => n !== 5 && !tones.has(n))) {
      return fail(`La source arrive sur ${symbols.at(-1)}, pas sur ${targets[at]}. Je ne change pas silencieusement cette qualité d’accord pour forcer l’insertion.`);
    }
    const hands = { lh: [], rh: [] };
    for (const n of playedArrival) hands[n.hand].push(n.midi + (pc(n.midi - arrival.rootPc) === 5 ? third - 5 : 0));
    if ([...hands.lh, ...hands.rh].some((n) => n < 21 || n > 108)) return fail('La résolution sort du clavier disponible. Je ne supprime pas ces notes.');
    resolution = { name: targets[at], leftHand: hands.lh, rightHand: hands.rh };
  }
  const clip = passageExample(source.notes, { start: source.start, end: source.end, semitones: shift });
  if (!clip) return fail('Aucune note exploitable dans ce passage.');
  const events = [], segments = [], chords = [];
  let time = 0;
  const append = (example, origin, label) => {
    const factor = 60 / example.tempo;
    const length = Math.max(example.beats || 0, ...example.events.map((e) => e.time)) * factor;
    const start = time;
    events.push(...example.events.map((e) => ({ ...e, time: time + e.time * factor, ...(Number.isFinite(e.withoutPedalAt) ? { withoutPedalAt: time + e.withoutPedalAt * factor } : {}), origin })));
    time += length + 0.1;
    segments.push({ start, end: time - 0.1, origin, label });
  };
  const appendContext = (name) => {
    const block = buildChordExample([name], { pattern: 'block' });
    if (!block || block.chords.length !== 1) return false;
    append(block, 'context', name);
    chords.push({ ...block.chords[0], origin: 'context' });
    return true;
  };
  for (let i = 0; i < targets.length; i++) {
    if (i !== at) {
      if (!appendContext(targets[i])) return fail(`Je ne peux pas préparer l’accord cible ${targets[i]}.`);
      continue;
    }
    append(clip, 'source', symbols.join(' → '));
    for (let j = 0; j < symbols.length; j++) chords.push({ name: symbols[j], leftHand: checked[j].hands.lh.map((n) => n.midi + shift), rightHand: checked[j].hands.rh.map((n) => n.midi + shift), origin: 'source' });
    if (resolution) {
      append(chordsExample([resolution]), 'resolution', targets[i]);
      chords.push({ ...resolution, origin: 'resolution' });
    }
  }
  const order = { noteOff: 0, sustain: 1, noteOn: 2 };
  events.sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
  const chain = chords.map((c) => c.name).join(' → ');
  return {
    example: { kind: 'tutorial-insertion', title: `Passage inséré entre ${between.join(' et ')}`, subtitle: 'Passage source transposé · accords de contexte ajoutés', tempo: 60, style: null, beats: time, events, chords, segments },
    summary: `Oui : on peut placer le ${sourceProgression || 'passage relevé'} avant le ${between[1]}, en conservant sa chaîne de notes par transposition. Cela donne **${chain}**.`,
    text: `${resolution ? `Attention : la source arrive sur **${symbols.at(-1)}**. Pour rejoindre **${targets[at]}**, la quarte suspendue descend vers la tierce ; cette résolution est ajoutée et n’est pas jouée telle quelle dans l’extrait.\n\n` : ''}Le passage **${symbols.join(' → ')}** reprend les notes relevées de la vidéo, transposées de ${shift > 0 ? '+' : ''}${shift} demi-tons. Les autres accords mettent ta grille en contexte avec les voicings de l’application.`,
  };
}
