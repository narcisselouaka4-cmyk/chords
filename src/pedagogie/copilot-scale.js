// Une gamme demandée n'est ni un accord ni un lick aléatoire : ses notes sont calculées localement.
import { Note } from '@tonaljs/tonal';
import { scaleById } from './scales.js';

export const SCALE_DEFINITIONS = {
  minorPentatonic: { label: 'pentatonique mineure', intervals: ['1P', '3m', '4P', '5P', '7m'] },
  majorPentatonic: { label: 'pentatonique majeure', intervals: ['1P', '2M', '3M', '5P', '6M'] },
  minorBlues: { label: 'blues mineure', intervals: ['1P', '3m', '4P', '4A', '5P', '7m'] },
  majorBlues: { label: 'blues majeure', intervals: ['1P', '2M', '3m', '3M', '5P', '6M'] },
  major: { label: 'majeure', intervals: ['1P', '2M', '3M', '4P', '5P', '6M', '7M'] },
  naturalMinor: { label: 'mineure naturelle', intervals: ['1P', '2M', '3m', '4P', '5P', '6m', '7m'] },
  harmonicMinor: { label: 'mineure harmonique', intervals: ['1P', '2M', '3m', '4P', '5P', '6m', '7M'] },
  melodicMinor: { label: 'mineure mélodique (forme ascendante)', intervals: ['1P', '2M', '3m', '4P', '5P', '6M', '7M'] },
  dorian: { label: 'dorienne', intervals: ['1P', '2M', '3m', '4P', '5P', '6M', '7m'] },
  mixolydian: { label: 'mixolydienne', intervals: ['1P', '2M', '3M', '4P', '5P', '6M', '7m'] },
};
const folded = (value) => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/♭/g, 'b').replace(/♯/g, '#');
const SOLFEGE = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
const FRENCH = { C: 'Do', D: 'Ré', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const CATALOG_IDS = { minorPentatonic: 'minor-pentatonic', majorPentatonic: 'major-pentatonic', minorBlues: 'blues', majorBlues: 'major-blues', naturalMinor: 'aeolian', harmonicMinor: 'harmonic-minor', melodicMinor: 'melodic-minor' };

export function scaleType(value) {
  if (Object.hasOwn(SCALE_DEFINITIONS, value)) return value;
  const text = folded(value);
  if (/pentaton/.test(text)) {
    if (/mineur|minor/.test(text)) return 'minorPentatonic';
    if (/majeur|major/.test(text)) return 'majorPentatonic';
    return null;
  }
  if (/blues/.test(text)) return /majeur|major/.test(text) ? 'majorBlues' : 'minorBlues';
  if (/harmoni[qc]/.test(text) && /mineur|minor/.test(text)) return 'harmonicMinor';
  if (/melodi[qc]/.test(text) && /mineur|minor/.test(text)) return 'melodicMinor';
  if (/dorien|dorian/.test(text)) return 'dorian';
  if (/mixolyd/.test(text)) return 'mixolydian';
  if (/majeur|major/.test(text)) return 'major';
  if (/mineur|minor|aeolian|eolien/.test(text)) return 'naturalMinor';
  return null;
}

function tonicFromText(value) {
  const text = folded(value).replace(/\b(bemol|flat)\b/g, 'b').replace(/\b(diese|sharp)\b/g, '#');
  const note = '(do|re|mi|fa|sol|la|si|[a-g])\\s*([#b]{0,2})(?![a-z#])';
  const isNote = (match) => {
    const after = text.slice(match.index + match[0].length);
    if (/^['’]/.test(after)) return false; // « c'est » n'est pas Do.
    return !(/^(?:la|a)$/.test(match[1]) && /^\s+(?:gamme|scale|musique|main|note|phrase|melodie|video|suite|jouer|tonique)\b/.test(after));
  };
  const preferred = new RegExp(`\\b(?:de|en|sur|of|in)\\s+${note}`, 'g');
  const matches = [...text.matchAll(preferred)].filter(isNote);
  const titled = [...text.matchAll(new RegExp(`\\b(?:gamme|scale)\\s+${note}`, 'g'))];
  const candidates = titled.length ? titled : matches.length ? matches : [...text.matchAll(new RegExp(`\\b${note}`, 'g'))].filter(isNote);
  const match = candidates.at(-1);
  if (!match) return null;
  const tonic = `${SOLFEGE[match[1]] || match[1].toUpperCase()}${match[2]}`;
  return Note.get(tonic).empty ? null : tonic;
}

/** Ne reprend le contexte que pour une référence explicite, jamais une gamme/tonalité inventée. */
export function resolveScaleRequest(message, history = []) {
  const text = folded(message);
  const explicit = /gamme|scale|pentaton|blues/.test(text);
  if (/\blick|\briff|\bfill|\bphrase/.test(text)) return null;
  const referential = /cette gamme|cette pentatonique|la meme|fais.le.moi entendre|joue.la|et en\b/.test(text);
  if (!explicit && !referential) return null;
  let type = explicit ? scaleType(message) : null;
  let tonic = explicit && type || /\b(?:en|de|in)\s+/.test(text) ? tonicFromText(message) : null;
  if ((!type || !tonic) && referential) {
    const recent = [...history].reverse();
    // L'intention écrite par le pianiste prime sur une liste de notes ou une comparaison du modèle.
    for (const entry of [...recent.filter((item) => item.role === 'user'), ...recent.filter((item) => item.role === 'assistant')]) {
      if (entry.isTyping || entry.isError || !['user', 'assistant'].includes(entry.role)) continue;
      if (!/gamme|scale|pentaton|blues/.test(folded(entry.content))) continue;
      const previousType = scaleType(entry.content);
      const previousTonic = tonicFromText(entry.content);
      if (previousType && previousTonic) { type ||= previousType; tonic ||= previousTonic; break; }
    }
  }
  if (!type || !tonic) return null;
  return { tonic, scale: type, direction: /descend/.test(text) ? 'down' : 'both' };
}

export function buildScaleNotes({ tonic, scale, direction = 'both', hand = 'RH', octave, bpm = 90 } = {}) {
  const type = scaleType(scale);
  const root = tonicFromText(tonic);
  if (!type || !root || !['up', 'down', 'both'].includes(direction)) return null;
  const definition = SCALE_DEFINITIONS[type];
  const names = definition.intervals.map((interval) => Note.transpose(root, interval));
  const register = Number.isInteger(octave) ? Math.max(1, Math.min(6, octave)) : hand === 'LH' ? 3 : 4;
  const start = Note.midi(`${root}${register}`);
  if (!Number.isFinite(start)) return null;
  // Même catalogue que le portrait « Qu'en penses-tu ? » ; les intervalles écrits ci-dessus
  // ne servent qu'à orthographier les notes (Mi# plutôt que Fa dans Do# majeur).
  const semitones = scaleById(CATALOG_IDS[type] || type)?.intervals;
  if (!semitones) return null;
  const up = semitones.map((interval) => start + interval).concat(start + 12);
  const sequence = direction === 'up' ? up : direction === 'down' ? [...up].reverse() : up.concat(up.slice(0, -1).reverse());
  const beat = 60000 / Math.max(40, Math.min(180, Number(bpm) || 90));
  const french = (name) => `${FRENCH[name[0]]}${name.slice(1)}`;
  return {
    title: `${french(root)} — ${definition.label}`,
    names: names.map(french),
    notes: sequence.map((midi, index) => ({ midi, startOffsetMs: Math.round(index * beat), durationMs: Math.round(beat * .8), velocity: .7, hand: hand === 'LH' ? 'LH' : 'RH' })),
  };
}

/** Réponses factuelles aux définitions/comparaisons simples ; les questions ouvertes restent au modèle. */
export function scaleTheoryAnswer(message, history = []) {
  const request = resolveScaleRequest(message, history);
  if (!request) return null;
  const text = folded(message);
  const definition = /c['’]est quoi|qu['’]est.ce|quelles? (?:sont )?(?:les )?notes|donne.moi les notes/.test(text);
  const comparison = /difference avec/.test(text);
  if (!definition && !comparison) return null;
  const result = buildScaleNotes(request);
  if (!result) return null;
  if (comparison) {
    const recent = [...history].reverse();
    for (const entry of [...recent.filter((item) => item.role === 'user'), ...recent.filter((item) => item.role === 'assistant')]) {
      if (entry.isTyping || entry.isError) continue;
      const previous = resolveScaleRequest(entry.content);
      if (!previous || previous.scale === request.scale || previous.tonic !== request.tonic) continue;
      const other = buildScaleNotes(previous);
      const currentPcs = result.notes.slice(0, result.names.length).map((n) => n.midi % 12);
      const otherPcs = new Set(other.notes.slice(0, other.names.length).map((n) => n.midi % 12));
      const added = result.names.filter((_, i) => !otherPcs.has(currentPcs[i]));
      return `${other.title} : **${other.names.join(' – ')}**.\n\n${result.title} : **${result.names.join(' – ')}**.${added.length ? `\n\nLa seconde ajoute **${added.join(' et ')}**.` : ''}${request.scale === 'minorBlues' && previous.scale === 'minorPentatonic' ? ' Cette « blue note » est entre la quarte et la quinte : elle peut servir de passage vers l’une ou l’autre.' : ''}`;
    }
    return null;
  }
  const steps = result.notes.slice(1, result.names.length + 1).map((n, i) => n.midi - result.notes[i].midi);
  return `La gamme ${result.title} contient **${result.names.length} notes : ${result.names.join(' – ')}**.\n\nD’une note à la suivante, jusqu’au retour à la tonique : **${steps.join(' – ')} demi-tons**. Tu peux me demander de la jouer pour la retrouver sur le clavier.`;
}
