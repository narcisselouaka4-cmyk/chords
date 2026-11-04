import { applyFixedHarmony } from './fixed-harmony-edit.js';
// Les éditions restent indexées sur la prise originale, même quand plusieurs changements sont combinés.
const SOURCE_INDEX = Symbol('copilot-source-event');

/** Paires d'évènements : une note répétée garde son propre relâchement. */
export function notePairs(events) {
  const active = new Map();
  const out = [];
  events.forEach((e, index) => {
    const key = `${e.channel || 0}:${e.note}`;
    if (e.type === 'note_on' && e.velocity > 0) active.set(key, { on: index, event: e });
    else if (e.type === 'note_off' || (e.type === 'note_on' && e.velocity === 0)) {
      const pair = active.get(key);
      if (pair) { out.push({ ...pair, off: index, end: e.time }); active.delete(key); }
    }
  });
  return out;
}

/** Applique un changement au couple exact attaque/relâchement ; tous les autres événements restent intacts. */
export function applyTakeEdit(take, edit) {
  if (!edit || !Array.isArray(take?.events)) return null;
  if (edit.type === 'plan') return applyTakePlan(take, edit.edits);
  const pairs = notePairs(take.events);
  if (edit.type === 'fixed-harmony') return applyFixedHarmony(take, edit, pairs);
  if (edit.type === 'ornament') {
    const anchor = pairs.find((p) => p.on === edit.on);
    if (!anchor || !Array.isArray(edit.notes) || !edit.notes.length || edit.notes.length > 8) return null;
    const duration = Math.max(take.duration || 0,...take.events.map((e) => e.time));
    const added = [];
    for (const n of edit.notes) {
      if (!Number.isInteger(n.note) || n.note < 21 || n.note > 108 || !Number.isFinite(n.time)
        || !Number.isFinite(n.end) || n.time < 0 || n.end-n.time < .035 || n.end > duration) return null;
      // Les approches résolvent vers l'attaque source, sans la décaler.
      if (edit.approach && (n.end > anchor.event.time || anchor.event.time-n.end > .04 || Math.abs(n.note-anchor.event.note)>2)) return null;
      const controls=take.events.filter(e=>e.type==='control'&&e.controller===64);
      if(controls.filter(e=>e.time<=n.time).at(-1)?.value>=64
        ||controls.some(e=>e.time>n.time&&e.time<n.end&&e.value>=64))return null;
      if (pairs.some((p) => Math.abs(p.event.note-n.note)<=1 && p.event.time<n.end && p.end>n.time)) return null;
      if (added.some((p) => p.note===n.note && p.time<n.end && p.end>n.time)) return null;
      added.push({note:n.note,time:n.time,end:n.end});
    }
    const events = take.events.map((e) => ({...e}));
    for (const n of added) events.push(
      {type:'note_on',note:n.note,time:n.time,velocity:anchor.event.velocity,channel:anchor.event.channel || 0},
      {type:'note_off',note:n.note,time:n.end,velocity:0,channel:anchor.event.channel || 0});
    return {...take,events:events.sort((a,b) => a.time-b.time)};
  }
  if (edit.type === 'voicing') {
    const replacements = edit.replacements || [];
    const additions = edit.additions || [];
    const removals = edit.removals || [];
    if (![replacements, additions, removals].every(Array.isArray) || !replacements.length && !additions.length && !removals.length) return null;
    const changes = [...replacements, ...removals.map((on) => ({ on, remove: true }))];
    if (new Set(changes.map((e) => e.on)).size !== changes.length) return null;
    const selected = [...changes, ...additions].map((e) => ({ ...e, pair: pairs.find((p) => p.on === e.on) }));
    if (selected.some((e) => !e.pair || !e.remove && (!Number.isInteger(e.note) || e.note < 21 || e.note > 108))) return null;
    const events = take.events.map((e) => ({ ...e }));
    const removed = new Set();
    const newAttacks = new Set();
    for (const e of selected.slice(0, changes.length)) {
      if (e.remove) { removed.add(e.pair.on); removed.add(e.pair.off); }
      else {
        for (const i of [e.pair.on, e.pair.off]) { events[i].note = e.note; delete events[i].raw; }
        newAttacks.add(events[e.pair.on]);
      }
    }
    for (const e of selected.slice(changes.length)) for (const i of [e.pair.on, e.pair.off]) {
      const added = { ...take.events[i], note: e.note };
      delete added[SOURCE_INDEX]; delete added.raw;
      events.push(added);
      if (i === e.pair.on) newAttacks.add(added);
    }
    const kept = events.filter((_,i) => !removed.has(i)).sort((a,b) => a.time-b.time);
    const resultPairs = notePairs(kept);
    // Vérifier avant l'appariement : une seconde attaque de même hauteur ne
    // doit pas masquer le premier appui dans notePairs.
    const sounding = new Map();
    for (const e of kept) {
      if (e.type === 'note_on' && e.velocity > 0) {
        if (sounding.has(e.note) && (newAttacks.has(e) || newAttacks.has(sounding.get(e.note)))) return null;
        sounding.set(e.note,e);
      } else if (e.type === 'note_off' || e.type === 'note_on' && e.velocity === 0) sounding.delete(e.note);
    }
    if (resultPairs.some((p) => newAttacks.has(p.event) && resultPairs.some((q) => q !== p
      && Math.abs(q.event.note-p.event.note) <= 1 && q.event.time < p.end && q.end > p.event.time))) return null;
    return { ...take, events: kept };
  }
  if (edit.type === 'passing') {
    if (!Array.isArray(edit.notes) || edit.notes.length < 3 || edit.notes.some((n) => !Number.isInteger(n) || n < 21 || n > 108)) return null;
    if (!Number.isFinite(edit.start) || !Number.isFinite(edit.end) || edit.start < 0 || edit.end - edit.start < .12) return null;
    const anchor = pairs.find((p) => p.on === edit.on);
    if (!anchor) return null;
    const attacks = edit.attacks || edit.notes.map((_, i) => edit.start + i * Math.min(.04, (edit.end - edit.start) / (edit.notes.length * 3)));
    if (attacks.length !== edit.notes.length || attacks.some((t, i) => !Number.isFinite(t) || t < edit.start || t >= edit.end || (i && t < attacks[i - 1]))) return null;
    const adjustments = edit.adjustments || [];
    const removed = new Set();
    const events = take.events.map((e) => ({ ...e }));
    for (const a of adjustments) {
      const pair = pairs.find((p) => p.on === a.on && p.off === a.off);
      if (!pair || pair.end <= edit.start || pair.event.time >= edit.end) return null;
      if (a.remove) {
        if (pair.event.time < edit.start) return null;
        removed.add(pair.on); removed.add(pair.off);
      } else {
        if (!Number.isFinite(a.end) || a.end < pair.event.time + .05 || a.end > pair.end || a.end > edit.end) return null;
        events[pair.off].time = a.end;
      }
    }
    const kept = events.filter((_, i) => !removed.has(i));
    if (notePairs(kept).some((p) => edit.notes.some((n, i) => n === p.event.note && p.event.time < edit.end && p.end > attacks[i]))) return null;
    events.length = 0;
    events.push(...kept);
    edit.notes.forEach((note, i) => {
      events.push({ type: 'note_on', note, time: attacks[i], velocity: anchor.event.velocity, channel: anchor.event.channel || 0 },
        { type: 'note_off', note, time: edit.end, velocity: 0, channel: anchor.event.channel || 0 });
    });
    events.sort((a, b) => a.time - b.time);
    return { ...take, events };
  }
  const pair = pairs.find((p) => p.on === edit.on);
  if (!pair || !['add', 'remove', 'replace'].includes(edit.type)) return null;
  const events = take.events.map((e) => ({ ...e }));
  if (edit.type !== 'remove' && (!Number.isInteger(edit.note) || edit.note < 21 || edit.note > 108)) return null;
  if (edit.type === 'remove') {
    return { ...take, events: events.filter((_, i) => i !== pair.on && i !== pair.off) };
  }
  // Une note ajoutée/remplacée ne doit pas chevaucher un autre appui sur la même touche.
  if (pairs.some((p) => p !== pair && Math.abs(p.event.note - edit.note) <= 1 && p.event.time < pair.end && p.end > pair.event.time)) return null;
  if (edit.type === 'replace') {
    events[pair.on].note = edit.note;
    events[pair.off].note = edit.note;
    delete events[pair.on].raw;
    delete events[pair.off].raw;
  } else {
    events.push({ ...events[pair.on], note: edit.note }, { ...events[pair.off], note: edit.note });
    delete events[events.length - 1][SOURCE_INDEX];
    delete events[events.length - 2][SOURCE_INDEX];
    delete events[events.length - 1].raw;
    delete events[events.length - 2].raw;
    events.sort((a, b) => a.time - b.time);
  }
  return { ...take, events };
}

/** Fusion des éditions indépendantes : aucun décalage d'indice lors d'un ajout ou retrait. */
function applyTakePlan(take, edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 32 || edits.some((e) => e?.type === 'plan')) return null;
  const indexed = { ...take, events: take.events.map((e, i) => ({ ...e, [SOURCE_INDEX]: i })) };
  const modified = new Map();
  const removed = new Set();
  const added = [];
  for (const edit of edits) {
    const changed = applyTakeEdit(indexed, edit);
    if (!changed) return null;
    const present = new Set();
    for (const e of changed.events) {
      const index = e[SOURCE_INDEX];
      if (index == null) { added.push(e); continue; }
      present.add(index);
      if (JSON.stringify(e) === JSON.stringify(indexed.events[index])) continue;
      if (removed.has(index) || (modified.has(index) && JSON.stringify(modified.get(index)) !== JSON.stringify(e))) return null;
      modified.set(index, e);
    }
    for (let i = 0; i < indexed.events.length; i++) if (!present.has(i)) {
      if (modified.has(i)) return null;
      removed.add(i);
    }
  }
  const events = indexed.events.filter((_, i) => !removed.has(i)).map((e) => modified.get(e[SOURCE_INDEX]) || e).concat(added).sort((a, b) => a.time - b.time);
  const pairs = notePairs(events);
  // Contrôle final de la combinaison, pas seulement de chaque couleur prise séparément.
  const newAttacks = new Set([...added.filter((e) => e.type === 'note_on'), ...[...modified.values()].filter((e) => e.type === 'note_on')]);
  const sounding = new Map();
  for (const e of events) {
    if (e.type === 'note_on' && e.velocity > 0) {
      const held = sounding.get(e.note);
      if (held && (newAttacks.has(e) || newAttacks.has(held))) return null;
      sounding.set(e.note, e);
    } else if (e.type === 'note_off' || (e.type === 'note_on' && e.velocity === 0)) sounding.delete(e.note);
  }
  if (pairs.some((p) => newAttacks.has(p.event) && pairs.some((q) => q !== p && Math.abs(q.event.note - p.event.note) <= 1 && q.event.time < p.end && q.end > p.event.time))) return null;
  return { ...take, events: events.map(({ [SOURCE_INDEX]: _index, ...e }) => e) };
}
