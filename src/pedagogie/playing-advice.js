// Conseils vérifiables : une modification locale de la prise, jamais une progression recomposée.
import { reviewTake } from '../recorder/take-review.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { parseChordName } from './note-roles.js';
import { frenchNote } from '../recorder/session-performance.js';
import { takeExample } from './take-attachment.js';

const pc = (n) => ((n % 12) + 12) % 12;
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
const name = (n) => frenchNote(n).replace(/-?\d+$/, '');

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
  const pairs = notePairs(take.events);
  const pair = pairs.find((p) => p.on === edit.on);
  if (!pair || !['add', 'remove', 'replace'].includes(edit.type)) return null;
  const events = take.events.map((e) => ({ ...e }));
  if (edit.type !== 'remove' && (!Number.isInteger(edit.note) || edit.note < 21 || edit.note > 108)) return null;
  if (edit.type === 'remove') {
    return { ...take, events: events.filter((_, i) => i !== pair.on && i !== pair.off) };
  }
  // Une note ajoutée/remplacée ne doit pas chevaucher un autre appui sur la même touche.
  if (pairs.some((p) => p !== pair && p.event.note === edit.note && p.event.time < pair.end && p.end > pair.event.time)) return null;
  if (edit.type === 'replace') {
    events[pair.on].note = edit.note;
    events[pair.off].note = edit.note;
    delete events[pair.on].raw;
    delete events[pair.off].raw;
  } else {
    events.push({ ...events[pair.on], note: edit.note }, { ...events[pair.off], note: edit.note });
    delete events[events.length - 1].raw;
    delete events[events.length - 2].raw;
    events.sort((a, b) => a.time - b.time);
  }
  return { ...take, events };
}

export function playingProposals(take) {
  const review = reviewTake(take.events);
  if (!review) return { review: null, proposals: [] };
  const pairs = notePairs(take.events);
  const proposals = [];
  for (const chord of review.chords) {
    const parsed = parseChordName(chord.name);
    // Les empilements ambigus ne deviennent pas des conseils d'harmonie.
    if (!parsed || !chord.matched || !['', 'm', '7', 'maj7', 'm7', '6', 'm6'].includes(parsed.quality)) continue;
    if (parsed.bassPc != null && parsed.bassPc !== parsed.rootPc) continue;
    const tones = chordToneIntervals(parsed.quality);
    const chordLabel = `${name(parsed.rootPc + 60)} ${{ '': 'majeur', m: 'mineur', '7': 'septième', maj7: 'majeur septième', m7: 'mineur septième', '6': 'sixième', m6: 'mineur sixième' }[parsed.quality]}`;
    const notes = [...new Set(chord.notes)].sort((a, b) => a - b);
    const actual = new Set(notes.map((n) => pc(n - parsed.rootPc)));
    if (actual.size !== tones.size || [...actual].some((n) => !tones.has(n))) continue;
    const played = pairs.filter((p) => Math.abs(p.event.time - chord.at) <= .25 && notes.includes(p.event.note) && p.end - p.event.time >= .12);
    if (played.length < 3) continue;
    const top = notes.at(-1);
    const bass = notes[0];
    // Retirer une doublure intérieure conserve la basse, le dessus et toutes les classes de hauteur.
    const duplicate = played.find((p) => p.event.note !== bass && p.event.note !== top
      && played.some((o) => o !== p && pc(o.event.note) === pc(p.event.note) && o.event.time < p.end && o.end > p.event.time));
    if (duplicate) proposals.push({
      id: `light-${duplicate.on}`, goal: 'lighten', edit: { type: 'remove', on: duplicate.on },
      text: `Sur ton accord de ${chordLabel}, essaie de retirer le ${name(duplicate.event.note)} doublé à l’intérieur. Tu gardes la basse et la note du dessus, avec un accompagnement moins chargé.`,
    });
    const anchor = duplicate || played.filter((p) => p.event.note !== bass).at(-1);
    if (!anchor || top - bass > 36) continue;
    const ninthPc = pc(parsed.rootPc + 2);
    // Chercher une couleur près de la position réelle, sous le dessus et sans frottement de demi-ton.
    const candidates = Array.from({ length: 25 }, (_, i) => Math.max(53, bass + 7) + i)
      .filter((n) => n < top && pc(n) === ninthPc && !notes.some((m) => Math.abs(m - n) <= 1))
      .sort((a, b) => Math.abs(a - anchor.event.note) - Math.abs(b - anchor.event.note));
    if (candidates.length) proposals.push({
      id: `color-${anchor.on}`, goal: 'enrich', edit: { type: duplicate ? 'replace' : 'add', on: anchor.on, note: candidates[0] },
      text: duplicate
        ? `Sur ton accord de ${chordLabel}, essaie un ${name(candidates[0])} à la place du ${name(anchor.event.note)} doublé. Cette note apporte une couleur supplémentaire sans épaissir ton accord.`
        : `Sur ton accord de ${chordLabel}, essaie d’ajouter un ${name(candidates[0])} sous la note du dessus. Cette note apporte une couleur supplémentaire à ton accord.`,
    });
  }
  return { review, proposals: proposals.filter((p) => applyTakeEdit(take, p.edit)) };
}

const HEAR = 'Fais-moi entendre cette proposition';
const actions = [
  { label: 'Enrichis mes accords', message: 'Enrichis mes accords' },
  { label: 'Allège mes accords', message: 'Allège mes accords' },
];

/** Retour local pour le jeu personnel. Une réponse générique n'invente pas de bilan de maîtrise. */
export function personalPlayingAnswer({ message, messages = [], context, review = false }) {
  const data = context?.playing?.passage;
  if (!data?.events?.length) return null;
  const text = plain(message);
  const last = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isTyping);
  const previous = last?.toolResult?.playingAdvice;
  const base = { played: [], ignored: 0, suggestions: [], example: null, voicing: null };
  const answer = (content, extra = {}, suggestedActions = []) => ({ ok: true, content, toolResult: { ...base, ...extra }, suggestedActions, autoplay: false });
  if (/\b(?:hasard|n'importe quoi|aleatoire|sans intention|test des touches)\b/.test(text)) {
    return answer('D’accord, cette prise était une exploration. Je n’en déduis pas ton niveau. Pour un conseil utile, choisis un petit passage ou dis-moi ce que tu souhaites essayer.');
  }
  if ((text === plain(HEAR) || /fais[- ](?:le[- ])?moi entendre|montre[- ]moi|demonstration|un exemple/.test(text)) && previous) {
    // Le conseil garde SA source, même si une autre prise a été confiée ensuite.
    const changed = applyTakeEdit(previous.take, previous.edit);
    const example = changed && takeExample(changed, 'Avec la proposition');
    if (!example) return answer('Je ne peux pas appliquer ce changement à la prise enregistrée. Reprenons à partir de ton jeu.');
    return answer(`${previous.text}\n\nCompare ton jeu original et la proposition. Le reste de ta prise est conservé.`, {
      example, originalTake: previous.take, playingAdvice: previous,
    });
  }
  const generic = /qu['’ ]en penses|ton avis|analyse mon jeu/.test(text);
  const goal = /alleg|moins charge|(?:retir|supprim).*(?:doublure|double)|simplifi.*(?:accord|accompagnement)/.test(text) ? 'lighten'
    : /enrich|(?:ajout|rajout).*(?:couleur|neuvieme|9e)|couleur.*accord|ameliore.*voicing/.test(text) ? 'enrich' : null;
  // Une consigne d'exercice explicite reste évaluée par le chemin dédié.
  if (!goal && generic && context.type === 'exercise') return null;
  if (!goal && /(?:fais.*entendre|demonstration|montre[- ]moi|un exemple)/.test(text) && !/rejou|reecout|reentendre|ma melodie|ma main/.test(text)) return answer('Je peux te faire réécouter ta prise, ou préparer un changement précis pour enrichir ou alléger tes accords. Quel changement souhaites-tu entendre ?', {}, actions);
  if (!goal && !generic) return null;
  const take = { ...data, duration: data.duration || Math.max(...data.events.map((e) => e.time)) };
  const found = playingProposals(take);
  if (!goal) return answer('J’ai bien reçu ta prise. Que souhaites-tu travailler : enrichir tes accords, alléger l’accompagnement, ou autre chose ? Je préfère connaître ton intention avant de te proposer un changement.', {}, actions);
  const proposal = found.proposals.find((p) => p.goal === goal);
  if (!proposal) return answer(goal === 'lighten'
    ? 'Je n’ai pas repéré de doublure que je puisse retirer en conservant clairement ton accord, ta basse et la mélodie. Choisis un accord précis ou indique ce que tu trouves trop chargé.'
    : 'Je n’ai pas assez de repères harmoniques pour ajouter une note avec confiance. Indique l’accord que tu souhaitais jouer, ou enregistre un passage plus court. Je garderai ta façon de le jouer.');
  const advice = { ...proposal, take };
  return answer(proposal.text, { playingAdvice: advice }, [{ label: HEAR, message: HEAR }]);
}
