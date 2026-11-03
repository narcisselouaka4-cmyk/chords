// Conseils vérifiables : une modification locale de la prise, jamais une progression recomposée.
import { reviewTake } from '../recorder/take-review.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { parseChordName } from './note-roles.js';
import { frenchNote } from '../recorder/session-performance.js';
import { takeExample } from './take-attachment.js';

const pc = (n) => ((n % 12) + 12) % 12;
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
const name = (n) => frenchNote(n).replace(/-?\d+$/, '');
const simpleQuality = /^(?:m|maj)?(?:6|7|9|11|13)?(?:sus[24])?$|^add9$/;
const chordLabel = (c) => `${name(c.rootPc + 60)} ${/sus/.test(c.quality) ? 'suspendu' : /^m(?!aj)/.test(c.quality) ? 'mineur' : /^(?:7|9|13)$/.test(c.quality) ? 'septième' : 'majeur'}`;

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
  if (edit.type === 'passing') {
    if (!Array.isArray(edit.notes) || edit.notes.length < 3 || edit.notes.some((n) => !Number.isInteger(n) || n < 21 || n > 108)) return null;
    if (!Number.isFinite(edit.start) || !Number.isFinite(edit.end) || edit.start < 0 || edit.end - edit.start < .12) return null;
    if (pairs.some((p) => edit.notes.includes(p.event.note) && p.event.time < edit.end && p.end > edit.start)) return null;
    const anchor = pairs.find((p) => p.on === edit.on);
    if (!anchor) return null;
    const events = take.events.map((e) => ({ ...e }));
    edit.notes.forEach((note, i) => {
      const time = edit.start + i * Math.min(.04, (edit.end - edit.start) / (edit.notes.length * 3));
      events.push({ type: 'note_on', note, time, velocity: anchor.event.velocity, channel: anchor.event.channel || 0 },
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
    delete events[events.length - 1].raw;
    delete events[events.length - 2].raw;
    events.sort((a, b) => a.time - b.time);
  }
  return { ...take, events };
}

export function playingProposals(take) {
  const review = reviewTake(take.events);
  if (!review) return { review: null, proposals: [], harmonicCount: 0 };
  const pairs = notePairs(take.events);
  const proposals = [];
  let harmonicCount = 0;
  for (const chord of review.chords) {
    const parsed = parseChordName(chord.name);
    // Les empilements ambigus ne deviennent pas des conseils d'harmonie.
    if (!parsed || !chord.matched || !simpleQuality.test(parsed.quality)) continue;
    const tones = chordToneIntervals(parsed.quality);
    const label = chordLabel(parsed);
    const notes = [...new Set(chord.notes)].sort((a, b) => a - b);
    const actual = new Set(notes.map((n) => pc(n - parsed.rootPc)));
    if (actual.size !== tones.size || [...actual].some((n) => !tones.has(n))) continue;
    harmonicCount += 1;
    // Un accord arpégé se déploie sur tout le segment, pas seulement sur ses 250 premières ms.
    const played = pairs.filter((p) => p.event.time >= chord.at - .025 && p.event.time < chord.end
      && notes.includes(p.event.note) && p.end - p.event.time >= .12).sort((a, b) => a.event.time - b.event.time);
    if (played.length < 3) continue;
    const top = notes.at(-1);
    const bass = notes[0];
    // Retirer une doublure intérieure conserve la basse, le dessus et toutes les classes de hauteur.
    const duplicate = played.find((p) => p.event.note !== bass && p.event.note !== top
      && played.some((o) => o !== p && pc(o.event.note) === pc(p.event.note) && o.event.time < p.end && o.end > p.event.time));
    if (duplicate) proposals.push({
      id: `light-${duplicate.on}`, goal: 'lighten', edit: { type: 'remove', on: duplicate.on },
      text: `Sur ton accord de ${label}, essaie de retirer le ${name(duplicate.event.note)} doublé à l’intérieur. Tu gardes la basse et la note du dessus, avec un accompagnement moins chargé.`,
    });
    const anchor = duplicate || played.filter((p) => p.event.note !== bass).at(-1);
    if (!anchor) continue;
    // Plusieurs couleurs possibles : une neuvième qui ne tient pas sous la mélodie ne signifie
    // pas que l'harmonie est inconnue. Garder une position proche de la main qui arpège.
    const colors = /^m(?!aj)/.test(parsed.quality) ? [2, 5] : /sus/.test(parsed.quality) ? [9, 10] : [2, 9];
    const candidates = colors.flatMap((color, rank) => Array.from({ length: Math.max(0, top - Math.max(48, bass + 2)) }, (_, i) => Math.max(48, bass + 2) + i)
      .filter((n) => pc(n - parsed.rootPc) === color && !tones.has(color) && !notes.some((m) => Math.abs(m - n) <= 1))
      .map((note) => ({ note, cost: rank * 30 + Math.abs(note - anchor.event.note) + (note < 53 ? 15 : 0) })))
      .sort((a, b) => a.cost - b.cost).map((c) => c.note);
    const color = candidates.find((note) => applyTakeEdit(take, { type: duplicate ? 'replace' : 'add', on: anchor.on, note }));
    if (color != null) proposals.push({
      id: `color-${anchor.on}`, goal: 'enrich', edit: { type: duplicate ? 'replace' : 'add', on: anchor.on, note: color },
      text: duplicate
        ? `Sur ton accord de ${label}, essaie un ${name(color)} à la place du ${name(anchor.event.note)} doublé. Cette note apporte une couleur supplémentaire sans épaissir ton accord.`
        : `Sur ton accord de ${label}, essaie d’ajouter un ${name(color)} sous la note du dessus. Je conserve le déroulement de ton arpège et le reste de ta progression.`,
    });
  }
  proposals.push(...passingProposals(take, review, pairs));
  return { review, harmonicCount, proposals: proposals.filter((p) => applyTakeEdit(take, p.edit)) };
}

/** Dominante de l'accord d'arrivée dans une respiration disponible ; aucune note source supprimée. */
function passingProposals(take, review, pairs) {
  const out = [];
  for (let i = 1; i < review.chords.length; i += 1) {
    const target = review.chords[i];
    const previous = review.chords[i - 1];
    const c = parseChordName(target.name);
    if (!c || !target.matched || !simpleQuality.test(c.quality) || /sus/.test(c.quality) || target.at - previous.at < .7) continue;
    const tones = chordToneIntervals(c.quality);
    const actual = new Set(target.notes.map((n) => pc(n - c.rootPc)));
    if (actual.size !== tones.size || [...actual].some((n) => !tones.has(n))) continue;
    // Si la dominante est déjà jouée, ne pas la présenter comme une nouvelle idée.
    const dominant = pc(c.rootPc + 7);
    if (previous.rootPc === dominant && /7|9|13/.test(previous.symbol)) continue;
    const anchor = pairs.find((p) => p.event.time >= target.at - .025 && p.event.time <= target.at + .25 && target.notes.includes(p.event.note));
    if (!anchor) continue;
    const bass = Math.min(...target.notes);
    let root = bass - 3;
    while (pc(root) !== dominant) root -= 1;
    if (root < 28) continue;
    // Shell de dominante : basse, septième, tierce. Les intervalles sont calculés sur la cible.
    const notes = [root, root + 10, root + 16];
    const allowed = new Set([0, 4, 7, 10].map((n) => pc(dominant + n)));
    const end = target.at - .025;
    let start = Math.max(previous.at + .3, target.at - .6);
    for (const p of pairs) {
      if (p.event.time >= end || p.end <= start) continue;
      // Ne pas empiler sur une autre harmonie, ni sur une touche déjà enfoncée.
      if (!allowed.has(pc(p.event.note)) || notes.includes(p.event.note) || notes.some((n) => Math.abs(n - p.event.note) === 1)) start = Math.max(start, p.end + .012);
    }
    if (end - start < .14) continue;
    // Le maintien par pédale rendrait cette respiration trompeuse : laisser cette transition intacte.
    let pedal = false;
    let pedalled = false;
    for (const e of take.events) {
      if (e.time > end) break;
      if (e.type !== 'control' || e.controller !== 64) continue;
      pedal = e.value >= 64;
      if (e.time >= start && pedal) pedalled = true;
      if (e.time < start) pedalled = pedal;
    }
    if (pedalled) continue;
    const label = `${name(dominant + 60)} septième`;
    out.push({ id: `passing-${anchor.on}`, goal: 'passing',
      edit: { type: 'passing', on: anchor.on, start, end, notes },
      text: `Juste avant ton accord de ${chordLabel(c)}, essaie un ${label} comme accord de passage. Il prépare l’arrivée sur l’accord suivant. Je le glisse dans une respiration de ton jeu, sans remplacer ta progression.`,
    });
  }
  return out;
}

const HEAR = 'Fais-moi entendre cette proposition';
const actions = [
  { label: 'Enrichis mes accords', message: 'Enrichis mes accords' },
  { label: 'Propose un accord de passage', message: 'Propose un accord de passage' },
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
  const goal = /accords? de passage|accords? (?:pour|de) transition/.test(text) ? 'passing'
    : /alleg|moins charge|(?:retir|supprim).*(?:doublure|double)|simplifi.*(?:accord|accompagnement)/.test(text) ? 'lighten'
    : /enrich|(?:ajout|rajout).*(?:couleur|neuvieme|9e)|couleur.*accord|ameliore.*voicing/.test(text) ? 'enrich' : null;
  // Une consigne d'exercice explicite reste évaluée par le chemin dédié.
  if (!goal && generic && context.type === 'exercise') return null;
  if (!goal && /(?:fais.*entendre|demonstration|montre[- ]moi|un exemple)/.test(text) && !/rejou|reecout|reentendre|ma melodie|ma main/.test(text)) return answer('Je peux te faire réécouter ta prise, ou préparer un changement précis pour enrichir ou alléger tes accords. Quel changement souhaites-tu entendre ?', {}, actions);
  if (!goal && !generic) return null;
  const take = { ...data, duration: data.duration || Math.max(...data.events.map((e) => e.time)) };
  const found = playingProposals(take);
  if (!goal) return answer('J’ai bien reçu ta prise. Que souhaites-tu travailler : enrichir tes accords, alléger l’accompagnement, ou autre chose ? Je préfère connaître ton intention avant de te proposer un changement.', {}, actions);
  // Demande mixte (« passage ou enrichissement ») : donner l'autre option si elle convient mieux.
  const proposal = found.proposals.find((p) => p.goal === goal)
    || (goal === 'passing' && /enrich|couleur|agremente/.test(text) ? found.proposals.find((p) => p.goal === 'enrich') : null);
  if (!proposal) {
    if (goal === 'lighten') return answer('Je n’ai pas repéré de doublure que je puisse retirer en conservant clairement ton accord, ta basse et la mélodie. Choisis un accord précis ou indique ce que tu trouves trop chargé.');
    if (found.harmonicCount > 0) {
      return goal === 'passing'
        ? answer('Je repère les accords, mais je n’ai pas trouvé assez de place pour insérer un accord de passage sans couvrir les notes que tu tiens. Je peux plutôt te proposer un enrichissement.', {}, [{ label: 'Enrichis mes accords', message: 'Enrichis mes accords' }])
        : answer('Je repère les accords de ta prise, mais pas de couleur supplémentaire dans cette position qui conserve clairement ton dessus. Je peux chercher un accord de passage.', {}, [{ label: 'Propose un accord de passage', message: 'Propose un accord de passage' }]);
    }
    return answer('Je n’ai pas assez de repères harmoniques pour ajouter une note avec confiance. Indique l’accord que tu souhaitais jouer, ou enregistre un passage plus court. Je garderai ta façon de le jouer.');
  }
  const advice = { ...proposal, take };
  return answer(proposal.text, { playingAdvice: advice }, [{ label: HEAR, message: HEAR }]);
}
