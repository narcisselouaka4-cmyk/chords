// Transformations de la prise, distinctes du générateur de progressions génériques.
// Toutes les éditions désignent les occurrences MIDI originales : rythme,
// nuances, appuis graves et dessus restent contrôlables par comparaison.
import { parseChordName } from './note-roles.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { applyTakeEdit } from './take-edit.js';
import { frenchNote } from '../recorder/session-performance.js';
const pc = (n) => (n%12+12)%12;
const name = (n) => frenchNote(n).replace(/-?\d+$/, '');

export function playingVoicingProposals(take, review, pairs) {
  const out = [];
  for (const chord of review.chords) {
    const c = parseChordName(chord.name);
    if (!chord.matched || !c || !/^(?:m|maj)?(?:6|7|9|11|13)?(?:sus[24])?$|^add9$/.test(c.quality)) continue;
    const notes = [...new Set(chord.notes)].sort((a,b) => a-b);
    const actual = new Set(notes.map((n) => pc(n-c.rootPc)));
    const base = chordToneIntervals(c.quality);
    const minor = /^m(?!aj)/.test(c.quality);
    const dominant = /^(?:7|9|13)$/.test(c.quality);
    const colors = minor ? [2,10,5,9] : /sus/.test(c.quality) ? [9,10] : dominant ? [2,9] : [11,2,9];
    // Les extensions déjà présentes ne font pas refuser un accord reconnu.
    // En revanche, une tierce manquante ou une classe incompatible reste ambiguë.
    if ([...base].some((n) => !actual.has(n)) || [...actual].some((n) => !base.has(n) && !colors.includes(n))) continue;
    const played = pairs.filter((p) => p.event.time >= chord.at-.025 && p.event.time < chord.end
      && notes.includes(p.event.note) && p.end-p.event.time >= .1);
    const top = notes.at(-1);
    const guarded = notes.slice(0,2);
    const upper = played.filter((p) => !guarded.includes(p.event.note));
    if (!upper.length) continue;
    const meta = { version: 3, at: chord.at, end: chord.end, region: `${chord.at}:${chord.name}`, chord: chord.name, goal: 'enrich' };
    const register = Array.from({length:Math.max(0,top-guarded[1]-2)},(_,i)=>guarded[1]+2+i);
    const chosen = [];
    for (const interval of colors) {
      if (actual.has(interval)) continue;
      const candidates = register.filter((n) => pc(n-c.rootPc) === interval && ![...notes,...chosen].some((m) => Math.abs(m-n)<=1))
        .sort((a,b) => Math.min(...upper.map((p) => Math.abs(p.event.note-a))) - Math.min(...upper.map((p) => Math.abs(p.event.note-b))));
      if (candidates.length) chosen.push(candidates[0]);
      if (chosen.length === 2) break;
    }
    const candidatesToAdd = chosen.flatMap((note) => {
      const anchor = [...upper].sort((a,b) => Math.abs(a.event.note-note)-Math.abs(b.event.note-note))[0];
      // Reprendre le geste à chaque occurrence de cette voix dans le segment.
      return upper.filter((p) => p.event.note === anchor.event.note).map((p) => ({on:p.on,note}));
    });
    const count = Math.min(8,candidatesToAdd.length);
    const additions = Array.from({length:count},(_,i) => candidatesToAdd[Math.floor(i*candidatesToAdd.length/count)]);
    const edit = { type:'voicing', additions };
    if (additions.length >= 2 && applyTakeEdit(take,edit)) out.push({...meta,id:`voicing-${upper[0].on}-${chosen.join('-')}`,technique:'colors',edit,
      summary:`${chord.name} enrichi avec ${chosen.map(name).join(' et ')}, sur le motif`,
      text:`J’enrichis le voicing de ${chord.name} et ses reprises dans ton motif, en gardant tes appuis graves, ton rythme et ton dessus.`});

    // Un vrai drop 2 : quatre voix serrées dans le haut, deuxième voix en
    // partant du dessus abaissée d'une octave. Ne pas rebaptiser une triade.
    const voices = notes.slice(1);
    if (voices.length === 4 && voices.at(-1)-voices[0] <= 12) {
      const from = voices.at(-2), to = from-12;
      if (to > notes[0]+3 && !notes.includes(to)) {
        const edit = {type:'voicing',replacements:played.filter((p)=>p.event.note===from).map((p)=>({on:p.on,note:to}))};
        if (applyTakeEdit(take,edit)) out.push({...meta,id:`drop2-${upper[0].on}`,technique:'drop2',edit,
          summary:`voicing drop 2 sur ${chord.name}`,text:`Sur ${chord.name}, je descends d’une octave la deuxième voix en partant du haut. La basse, le dessus et les attaques restent à leur place.`});
      }
    }
    // Upper structure II sur une dominante : triade majeure à un ton de la
    // fondamentale, au-dessus de sa tierce et septième, sous le dessus source.
    if (dominant && actual.has(4) && actual.has(10)) {
      for (let root = guarded[1]+3; root+7 < top; root++) {
        if (pc(root-c.rootPc)!==2) continue;
        const triad=[root,root+4,root+7];
        const removes=played.filter((p)=>!guarded.includes(p.event.note) && p.event.note!==top
          && ![4,10].includes(pc(p.event.note-c.rootPc)) && triad.some((n)=>Math.abs(n-p.event.note)<=1));
        const anchor=upper[0];
        const edit={type:'voicing',removals:removes.map((p)=>p.on),additions:triad.map((note)=>({on:anchor.on,note}))};
        if (applyTakeEdit(take,edit)) {
          out.push({...meta,id:`upper-${anchor.on}-${root}`,technique:'upper',edit,
            summary:`triade de ${name(root)} au-dessus de ${chord.name}`,text:`Sur ${chord.name}, je garde la base de la dominante et pose une triade de ${name(root)} au-dessus. Elle enrichit l’accord sans changer ton dessus ni ton rythme.`});
          break;
        }
      }
    }
  }
  return out;
}
