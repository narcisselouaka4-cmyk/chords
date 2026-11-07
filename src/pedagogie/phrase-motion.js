// Un mouvement a une arrivée et une place audible. Il ne remplit pas chaque
// silence et ne quantifie pas le jeu. Les notes source restent intactes.
import {fixedFrames, harmonyVoicings} from './fixed-harmony.js';
import {notePairs, applyTakeEdit} from './take-edit.js';
import {voiceLeadingCost} from '../practice-exercise.js';
import {pitchClass as pc, resolvingVoices} from './harmonic-intentions.js';
import {planPassingEdit} from './playing-passage.js';
import {accompanimentPerformance} from './arrangement-performance.js';

function pedalIn(events, start, end) {
  let held = false;
  for (const e of events) {
    if (e.time >= end) break;
    if (e.type !== 'control' || e.controller !== 64) continue;
    if (e.time >= start && held) return true;
    held = e.value >= 64;
    if (e.time >= start && held) return true;
  }
  return held;
}

function restBefore(take, previous, target, frames) {
  const arrival = Math.min(...target.source.map(p => p.event.time));
  const before = Math.min(...previous.source.map(p => p.event.time));
  const span = arrival - before;
  if (span < 1 || span > 6) return null;
  const pairs = notePairs(take.events);
  const released = Math.max(before, ...pairs.filter(p => p.event.time < arrival - .01).map(p => p.end));
  const start = Math.max(released + .03, arrival - Math.min(.9, span * .375));
  const end = arrival - .04;
  if (end-start>=.32 && !pedalIn(take.events,start,arrival)) return {start,end,arrival,span,held:false};
  // Un accord tenu peut céder sa fin à un passage, en conservant sa mélodie.
  // La durée harmonique doit être répétée ; aucune mesure/phase n'est inventée.
  const spans=frames.slice(1).map((f,i)=>f.at-frames[i].at).filter(s=>s>=1&&s<=6).sort((a,b)=>a-b);
  const typical=spans[Math.floor(spans.length/2)];
  if(spans.length<3||spans.filter(s=>Math.abs(s/typical-1)<.2).length/spans.length<.7||Math.abs(span/typical-1)>.2)return null;
  if(pairs.some(p=>p.event.time>before+.4&&p.event.time<arrival-.04))return null;
  const top=previous.source.find(p=>p.event.note===previous.topMidi);
  const heldStart=arrival-Math.min(.8,span/3), heldEnd=Math.min(arrival-.04,top.end-.01);
  if(heldEnd-heldStart<.35||pedalIn(take.events,heldStart,arrival))return null;
  return {start:heldStart,end:heldEnd,arrival,span,held:true};
}

function passing(take, previous, target, rest) {
  if (/dim|aug|sus/.test(target.chord.quality)) return null;
  const rootPc = pc(target.chord.rootPc + 7);
  // Une arrivée déjà précédée de sa dominante ne reçoit pas une répétition de
  // cette même dominante présentée comme un nouvel accord de passage.
  if (previous.chord.rootPc === rootPc && /^(7|9|13)/.test(previous.chord.quality)) return null;
  const ceiling = rest.held ? previous.topMidi : Math.min(previous.topMidi, target.topMidi) - 1;
  const candidates = [];
  for (let topMidi = ceiling; topMidi >= (rest.held?ceiling:Math.max(48,ceiling-18)); topMidi--) {
    for (const quality of ['9', '7b9', '13', '7']) {
      const frame = {...previous, topMidi};
      for (const v of harmonyVoicings(frame, {rootPc, quality, chromatic: true, preserveBass: false})) {
        const function_ = {kind: 'passing-dominant', targetRootPc: target.chord.rootPc, targetAt: rest.arrival};
        if (!resolvingVoices({...v, function: function_}, {...target.chord, notes: target.notes})) continue;
        candidates.push({...v, function: function_, cost: voiceLeadingCost(previous.notes, v.notes)
          + voiceLeadingCost(v.notes, target.notes) * 2});
      }
    }
  }
  const v = candidates.sort((a,b) => a.cost - b.cost)[0];
  if (!v) return null;
  const anchor = target.source.find(p => p.event.note === target.bassMidi);
  let edit = {type: 'passing', on: anchor.on, start: rest.start, end: rest.end,
    notes: v.notes, attacks: v.notes.map(() => rest.start), adjustments: [],
    placement: 'source-rest'};
  if(rest.held) {
    const notes=v.notes.filter(n=>n!==previous.topMidi);
    if(notes.length<3) return null;
    edit=planPassingEdit(take,null,notePairs(take.events),target,previous,notes,anchor,
      {...rest,step:(rest.end-rest.start)/3,attacks:notes.map(()=>rest.start),allowedPitchClasses:v.notes.map(pc)});
    if(!edit)return null;
    for(const p of notePairs(take.events)) {
      if(p.event.note===previous.topMidi||p.end<=rest.start||p.event.time>=rest.end
        ||edit.adjustments.some(a=>a.on===p.on))continue;
      if(p.event.time>=rest.start-.06)return null;
      edit.adjustments.push({on:p.on,off:p.off,end:rest.start-.01});
    }
    edit.placement='held-phrase';
  }
  const source=f=>({...f,top:f.source.find(p=>p.event.note===f.topMidi),
    accompaniment:f.source.filter(p=>p.event.note<f.topMidi)});
  const from=source(previous),to=source(target);
  const segment={at:rest.start,frame:from,notes:edit.notes,kind:'dominant'};
  const performance=accompanimentPerformance(segment,[segment,{frame:to}]);
  // La basse cible peut être très douce ; ne pas l'utiliser pour atténuer
  // toutes les voix du passage, ni y appliquer un coefficient arbitraire.
  edit.velocities=edit.notes.map(n=>performance.get(n).velocity);
  return {edit, at: rest.start, end: rest.end, goal: 'passing', chord: v.label, function: v.function,
    placement:edit.placement,summary: `${v.label} prépare ${target.chord.name}`, evidence: 'drop2:1:51-2:12;above-all:1:37-1:54'};
}

function innerLine(take, previous, target, rest) {
  if (rest.held || rest.end - rest.start < .4) return null;
  const ceiling = Math.min(previous.topMidi, target.topMidi) - 1;
  const anchors = target.source.filter(p => p.event.note > target.bassMidi && p.event.note < target.topMidi
    && p.event.time <= rest.arrival + .045).sort((a,b) => {
    const distance = p => Math.min(...previous.notes.slice(1,-1).map(n => Math.abs(n - p.event.note)));
    return distance(a) - distance(b);
  });
  for (const anchor of anchors) {
    const note = anchor.event.note;
    const previousNote = [...previous.notes.slice(1,-1)].sort((a,b) => Math.abs(a-note) - Math.abs(b-note))[0];
    if (previousNote == null || Math.abs(previousNote - note) > 5) continue;
    const direction = previousNote > note ? 1 : -1;
    const notes = [note + direction * 2, note + direction];
    if (notes.some(n => n > ceiling || n < previous.bassMidi + 7 || n < 48)) continue;
    const split = rest.start + (rest.end - rest.start) * .58;
    const edit = {type: 'ornament', on: anchor.on, notes: [
      {note: notes[0], time: rest.start, end: split - .015},
      {note: notes[1], time: split, end: rest.end},
    ]};
    return {edit, at: rest.start, end: rest.end, goal: 'connection', technique: 'inner-line',
      resolvesTo: {note, time: anchor.event.time},
      summary: 'Une voix intérieure rejoint la note de ton accord suivant.', evidence: 'above-all:5:55-7:29'};
  }
  return null;
}

export function planPhraseMotions(take, {kind = 'connection', changes = [], limit = 3} = {}) {
  const initial = fixedFrames(take).frames;
  // Garder la fonction annoncée par le plan, même si le détecteur préfère un
  // autre nom pour la même collection (par exemple une dominante sans racine).
  for (const f of initial) {
    const change = changes.find(c => Math.abs(c.at - f.at) < .05);
    if (change?.rootPc!=null) f.chord={name:change.chord,rootPc:change.rootPc,quality:change.quality};
  }
  const possible = [];
  for (let i = 1; i < initial.length; i++) {
    const rest = restBefore(take, initial[i-1], initial[i],initial);
    if (rest) possible.push({previous: initial[i-1], target: initial[i], rest});
  }
  // Répartir sur la phrase avant de charger des arrivées consécutives.
  const count = Math.min(limit, possible.length);
  const selected = Array.from({length: count}, (_,i) => possible[Math.floor(i * possible.length / count)]);
  const edits = [], motions = [];
  let current = take;
  for (const {previous, target, rest} of selected) {
    const currentPairs = notePairs(current.events);
    const fresh = {...target, source: target.source.map(p => currentPairs.find(q => q.event.note === p.event.note
      && q.event.time === p.event.time && (q.event.channel || 0) === (p.event.channel || 0)))};
    if (fresh.source.some(p => !p)) continue;
    const proposal = kind === 'passing' ? passing(current, previous, fresh, rest) : innerLine(current, previous, fresh, rest);
    if (!proposal) continue;
    const changed = applyTakeEdit(current, proposal.edit);
    if (!changed) continue;
    const added = changed.events.filter(e => e.type === 'note_on' && e.velocity > 0).length
      - take.events.filter(e => e.type === 'note_on' && e.velocity > 0).length;
    if (added > Math.max(6, Math.floor(take.events.filter(e => e.type === 'note_on' && e.velocity > 0).length * .4))) continue;
    current = changed; edits.push(proposal.edit); motions.push(proposal);
  }
  return {take: current, edits, motions};
}
