// Édition de voicings fixes : basse et voix intérieures sous un dessus inchangé.
// Aucun nouvel instant musical ; le dessus garde son occurrence MIDI exacte.
import {applyProposalPedal} from './proposal-pedal.js';
import {playableTimeline} from './piano-voicing.js';
import { realizesHarmony } from './harmonic-identity.js';
import { respectsLowIntervalLimits } from '../voicing-engine/textbook-voicings.js';
const pc = n => (n % 12 + 12) % 12;

export function applyFixedHarmony(take, edit, pairs) {
  if (!Array.isArray(edit.frames) || !edit.frames.length || edit.frames.length > 64) return null;
  const events = take.events.map(e => ({ ...e }));
  const removed = new Set(), added = [], used = new Set(), changedAttacks = new Set();
  for (const frame of edit.frames) {
    if (!Array.isArray(frame.source) || new Set(frame.source).size !== frame.source.length) return null;
    const source = frame.source.map(on => pairs.find(p => p.on === on));
    if (source.length < 3 || source.some(p => !p || used.has(p.on))) return null;
    const byPitch = [...source].sort((a, b) => a.event.note - b.event.note);
    const bass = byPitch[0], top = byPitch.at(-1);
    const notes = frame.notes;
    if (!Array.isArray(notes) || notes.length < 3 || notes.length > 7
      || notes.some(n => !Number.isInteger(n) || n < 28 || n > 96)
      || new Set(notes).size !== notes.length) return null;
    const sorted = [...notes].sort((a,b) => a-b);
    if (sorted.at(-1) !== top.event.note || frame.topOn !== top.on) return null;
    if (frame.preserveBass && (pc(sorted[0]) !== pc(bass.event.note) || Math.abs(sorted[0]-bass.event.note)>12)) return null;
    if (frame.exactBass && sorted[0] !== bass.event.note) return null;
    if (!Number.isInteger(frame.rootPc) || frame.rootPc < 0 || frame.rootPc > 11
      || !realizesHarmony(sorted, frame.rootPc, frame.quality)
      || !respectsLowIntervalLimits(sorted)) return null;
    const first = Math.min(...source.map(p => p.event.time));
    const last = Math.max(...source.map(p => p.event.time));
    if (last-first > .4 || source.some(p => p.end < last+.08)) return null;
    // Une réharmonisation n'efface pas les notes que la pédale garde du bloc précédent.
    const pedal = take.events.filter(e => e.type==='control' && e.controller===64 && e.time<=first).at(-1);
    if (!edit.replacePedal && !frame.preserveBass && pedal?.value>=64 && pairs.some(p => !frame.source.includes(p.on) && p.end<=first)) return null;
    const assignments = [{ pair: top, note: top.event.note }, { pair: bass, note: sorted[0] }];
    const free = byPitch.slice(1,-1);
    for (const note of sorted.slice(1,-1)) {
      free.sort((a,b) => Math.abs(a.event.note-note)-Math.abs(b.event.note-note));
      const pair = free.shift();
      if (pair) assignments.push({ pair, note });
      else {
        const on={...top.event,note}, off={...take.events[top.off],note};
        delete on.raw; delete off.raw; added.push(on,off); changedAttacks.add(on);
      }
    }
    for (const pair of free) { removed.add(pair.on); removed.add(pair.off); }
    for (const {pair,note} of assignments) {
      if (note !== pair.event.note) changedAttacks.add(events[pair.on]);
      for (const index of [pair.on,pair.off]) {
        events[index].note = note;
        if (note !== pair.event.note) delete events[index].raw;
      }
    }
    source.forEach(p => used.add(p.on));
    // Aucun conflit avec une autre voix en dehors du bloc édité.
    if (pairs.some(p => !frame.source.includes(p.on) && p.event.time<Math.max(...source.map(q=>q.end))
      && p.end>first && sorted.includes(p.event.note))) return null;
  }
  let result = events.filter((_,i)=>!removed.has(i)).concat(added).sort((a,b)=>a.time-b.time);
  const active = new Map();
  for (const e of result) {
    const key = `${e.channel||0}:${e.note}`;
    if (e.type==='note_on' && e.velocity>0) {
      const previous = active.get(key);
      if (previous && (changedAttacks.has(e)||changedAttacks.has(previous))) return null;
      active.set(key,e);
    } else if (e.type==='note_off'||e.type==='note_on'&&e.velocity===0) active.delete(key);
  }
  result=applyProposalPedal(result,edit,Math.max(take.duration||0,...take.events.map(e=>e.time)));if(!result)return null;
  result.sort((a,b)=>a.time-b.time);
  if(!playableTimeline(result,e=>changedAttacks.has(e)))return null;
  return { ...take, events: result };
}
