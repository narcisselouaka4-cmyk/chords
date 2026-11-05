import {notePairs} from './take-edit.js';

// Politique de sélection distincte de la version du moteur harmonique.
export const PROPOSAL_DIVERSITY = 1;
const pc = n => (n % 12 + 12) % 12;
const difference = (a, b) => [...a].filter(n => !b.has(n)).length + [...b].filter(n => !a.has(n)).length;
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function soundingNotes(events = []) {
  const normalized = events.map(e => ({...e, type: ({noteOn:'note_on', noteOff:'note_off'})[e.type] || e.type}));
  const pairs = notePairs(normalized).filter(p => p.end - p.event.time >= .14);
  const pedal = events.filter(e => e.type === 'sustain' || e.type === 'control' && e.controller === 64);
  const isDown = e => e.type === 'sustain' ? Boolean(e.value) : e.value >= 64;
  const end = Math.max(0, ...events.map(e => e.time));
  return pairs.map(p => {
    const state = pedal.filter(e => e.time <= p.end).at(-1);
    if (!state || !isDown(state)) return p;
    const release = pedal.find(e => e.time > p.end && !isDown(e))?.time ?? end;
    const next = pairs.find(q => q.event.note === p.event.note && q.event.time >= p.end)?.event.time ?? end;
    return {...p, end: Math.min(release, next)};
  });
}

/** Comparer ce qui sonne : titres, force et minuscules décalages ne créent pas une variante. */
export function compareProposals(left, right) {
  const a = soundingNotes(left), b = soundingNotes(right);
  const end = Math.max(0, ...a.map(p => p.end), ...b.map(p => p.end));
  let duration = 0, harmony = 0, bass = 0, space = 0, fullness = 0;
  let firstHarmony = null, firstBass = null, firstSpace = null;
  const notesAt = (pairs, at) => [...new Set(pairs.filter(p => p.event.time <= at && p.end > at).map(p => p.event.note))].sort((x,y) => x-y);
  // Pas de 100 ms : les micro-décalages et les notes très brèves ne gonflent pas le score.
  for (let start = 0; start < end; start += .1) {
    const span = Math.min(.1, end - start), at = start + span / 2;
    const x = notesAt(a, at), y = notesAt(b, at);
    if (x.length < 2 && y.length < 2) continue;
    duration += span;
    fullness += (y.length - x.length) * span;
    if (x.length < 2 || y.length < 2) {
      space += span; firstSpace ??= start; continue;
    }
    const px = new Set(x.map(pc)), py = new Set(y.map(pc));
    const delta = difference(px, py);
    if (delta >= 2 && delta / new Set([...px,...py]).size >= .28) {
      harmony += span; firstHarmony ??= start;
    }
    if (pc(x[0]) !== pc(y[0])) { bass += span; firstBass ??= start; }
  }
  const ratio = n => duration ? n / duration : 0;
  return {duration, harmony:ratio(harmony), bass:ratio(bass), space:ratio(space), fullness:ratio(fullness),
    firstHarmony, firstBass, firstSpace,
    distinct: harmony >= .6 && ratio(harmony) >= .35 || bass >= .6 && ratio(bass) >= .35 || space >= .6 && ratio(space) >= .25};
}

function describe(variant, source, first) {
  const original = compareProposals(source, variant.example.events);
  if (first) {
    const delta = compareProposals(first.example.events, variant.example.events);
    if (delta.bass >= .35) return `Par rapport à la première : la basse suit un autre chemin, dès ${clock(delta.firstBass)}. La mélodie reste la même.`;
    if (delta.harmony >= .35) return `Par rapport à la première : d’autres accords changent la couleur, dès ${clock(delta.firstHarmony)}. La mélodie reste la même.`;
    return `Par rapport à la première : l’accompagnement occupe d’autres moments, dès ${clock(delta.firstSpace)}. La mélodie reste la même.`;
  }
  const intro = original.fullness >= .7 ? 'Les accords sont plus fournis sous ta mélodie.'
    : original.harmony >= .35 ? 'Les accords changent de couleur sous ta mélodie.'
      : 'Les notes à l’intérieur des accords sont réorganisées sous ta mélodie.';
  const passage = variant.harmony?.find(h => h.goal === 'passing' && h.targetAt != null);
  if (passage) return `${intro}${original.bass >= .35 ? ' La basse suit aussi un autre chemin.' : ''} Vers ${clock(passage.at)}, un accord de passage prépare l’arrivée suivante.`;
  if (original.bass >= .35) return `${intro} La basse suit aussi un autre chemin.`;
  return `${intro} Le rythme de ta mélodie est conservé.`;
}

/** Une seule bonne proposition vaut mieux que plusieurs quasi-doublons. */
export function selectDistinctProposals(variants, source, {exclude = []} = {}) {
  const previous = exclude.flatMap(events => {
    try { const parsed = typeof events === 'string' ? JSON.parse(events) : events; return Array.isArray(parsed) ? [parsed] : []; }
    catch { return []; }
  });
  const selected = [];
  for (const v of variants) {
    if (!v.example?.events?.length) continue;
    if ([...previous,...selected.map(x => x.example.events)].some(events => !compareProposals(events, v.example.events).distinct)) continue;
    selected.push(v);
  }
  return selected.slice(0,3).map((v,i) => {
    const description = describe(v, source, i ? selected[0] : null);
    return {...v, description, advice:{...v.advice,text:description}, example:{...v.example,subtitle:description}};
  });
}
