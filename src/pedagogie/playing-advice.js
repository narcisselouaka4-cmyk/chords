// Conseils vérifiables : une modification locale de la prise, jamais une progression recomposée.
import { reviewTake } from '../recorder/take-review.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { parseChordName } from './note-roles.js';
import { frenchNote } from '../recorder/session-performance.js';
import { comparedTakeExample } from './playing-diff.js';
import { notePairs, applyTakeEdit } from './take-edit.js';
export { notePairs, applyTakeEdit } from './take-edit.js';
import { planPlayingChanges } from './playing-plan.js';
import { planPassingEdit } from './playing-passage.js';
import { playingVoicingProposals } from './playing-voicings.js';

const pc = (n) => ((n % 12) + 12) % 12;
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").replace(/[‐‑‒–—]/g, '-').toLowerCase();
const name = (n) => frenchNote(n).replace(/-?\d+$/, '');
const simpleQuality = /^(?:m|maj)?(?:6|7|9|11|13)?(?:sus[24])?$|^add9$/;
const chordLabel = (c) => `${name(c.rootPc + 60)} ${/sus/.test(c.quality) ? 'suspendu' : /^m(?!aj)/.test(c.quality) ? 'mineur' : /^(?:7|9|13)$/.test(c.quality) ? 'septième' : 'majeur'}`;

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
    // Protéger les deux appuis graves : ils peuvent appartenir à la main gauche.
    // C'est un garde-fou de registre, pas une détection certaine des mains.
    const guarded = new Set(notes.slice(0, 2));
    const upper = played.filter((p) => !guarded.has(p.event.note));
    const meta = { version: 3, at: chord.at, end: chord.end, region: `${chord.at}:${chord.name}`, chord: label };
    // Retirer une doublure intérieure conserve la basse, le dessus et toutes les classes de hauteur.
    const duplicate = upper.find((p) => p.event.note !== top
      && played.some((o) => o !== p && pc(o.event.note) === pc(p.event.note) && o.event.time < p.end && o.end > p.event.time));
    if (duplicate) proposals.push({
      ...meta, id: `light-${duplicate.on}`, goal: 'lighten', edit: { type: 'remove', on: duplicate.on },
      text: `Sur ton accord de ${label}, essaie de retirer le ${name(duplicate.event.note)} doublé à l’intérieur. Tu gardes la basse et la note du dessus, avec un accompagnement moins chargé.`,
    });
    const anchor = upper.find((p) => p.event.note !== top) || upper[0];
    if (!anchor) continue;
    // Plusieurs couleurs possibles : une neuvième qui ne tient pas sous la mélodie ne signifie
    // pas que l'harmonie est inconnue. Garder une position proche de la main qui arpège.
    const colors = /^m(?!aj)/.test(parsed.quality) ? [2, 5] : /sus/.test(parsed.quality) ? [9, 10] : [2, 9];
    const candidates = colors.flatMap((color, rank) => Array.from({ length: Math.max(0, top - Math.max(53, notes[1] + 2)) }, (_, i) => Math.max(53, notes[1] + 2) + i)
      .filter((n) => pc(n - parsed.rootPc) === color && !tones.has(color) && !notes.some((m) => Math.abs(m - n) <= 1))
      .map((note) => ({ note, cost: rank * 30 + Math.abs(note - anchor.event.note) + (note < 53 ? 15 : 0) })))
      .sort((a, b) => a.cost - b.cost).map((c) => c.note);
    const colorsAdded = new Set();
    for (const color of candidates) {
      if (colorsAdded.has(pc(color)) || colorsAdded.size >= 2) continue;
      const edit = { type: 'add', on: anchor.on, note: color };
      if (!applyTakeEdit(take, edit)) continue;
      colorsAdded.add(pc(color));
      proposals.push({ ...meta, id: `color-${anchor.on}-${color}`, goal: 'enrich', edit,
        summary: `${name(color)} sur ${label}`,
        text: `Sur ton accord de ${label}, ajoute un ${name(color)} dans le haut de l’accompagnement. Je garde tes appuis graves, ton dessus et le déroulement de ton arpège.`,
      });
    }
  }
  proposals.push(...passingProposals(take, review, pairs));
  proposals.push(...playingVoicingProposals(take, review, pairs));
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
    const edit = planPassingEdit(take, review, pairs, target, previous, notes, anchor);
    if (!edit) continue;
    const label = `${name(dominant + 60)} septième`;
    out.push({ version: 3, at: edit.start, end: edit.end, region: `passing:${target.at}`,
      summary: `${label} avant ${chordLabel(c)}`, id: `passing-${anchor.on}`, goal: 'passing',
      transition: { rootPc: dominant, targetRootPc: c.rootPc, targetQuality: c.quality }, edit,
      text: `Juste avant ton accord de ${chordLabel(c)}, essaie un ${label} comme accord de passage. Je le commence à contretemps, en suivant ton arpège, puis je garde ton arrivée sur l’accord suivant.`,
    });
  }
  return out;
}

/** Les cartes sauvegardées avant le correctif ne doivent pas rejouer l'ancien placement. */
export function refreshPlayingResult(result) {
  const advice = result?.playingAdvice;
  if (!advice) return result;
  if (advice.version === 3 || advice.version === 4 || advice.version === 5 || advice.version === 6 || advice.version === 7 || advice.version === 8 || advice.version === 9 || advice.edit?.type === 'plan') {
    if (result.example?.comparison?.version === 1) return result;
    const changed = applyTakeEdit(advice.take, advice.edit);
    const example = changed && comparedTakeExample(advice.take, changed);
    return example ? { ...result, originalTake: advice.take, example } : null;
  }
  const proposals = playingProposals(advice.take).proposals;
  const oldTime = advice.take.events[advice.edit?.on]?.time;
  const current = proposals.find((p) => p.id === advice.id) || proposals.find((p) => p.goal === advice.goal && p.at <= oldTime && p.end > oldTime);
  if (!current) return null;
  const changed = applyTakeEdit(advice.take, current.edit);
  const example = changed && comparedTakeExample(advice.take, changed);
  return example ? { ...result, playingAdvice: { ...current, take: advice.take }, originalTake: advice.take, example } : null;
}

const HEAR = 'Fais-moi entendre cette proposition';
const actions = [
  { label: 'Enrichis mes accords', message: 'Enrichis mes accords' },
  { label: 'Propose un accord de passage', message: 'Propose un accord de passage' },
  { label: 'Allège mes accords', message: 'Allège mes accords' },
];

const requestedGoal = (text) => /mouvements?|developp|reharmonis|ameliore.*(?:jeu|progression)|drop\s*2|upper.?structures?|(?:meme|ma|cette) progression.*(?:gospel|jazz|neo.?soul)/.test(text) ? 'develop' : /accords? de passage|accords? (?:pour|de) transition/.test(text) ? 'passing'
  : /alleg|moins charge|(?:retir|supprim).*(?:doublure|double)|simplifi.*(?:accord|accompagnement)/.test(text) ? 'lighten'
    : /enrich|(?:ajout|rajout).*(?:couleur|neuvieme|9e)|couleur.*accord|ameliore.*voicing/.test(text) ? 'enrich' : null;

// Les accords explicitement demandés sont des contraintes, jamais remplacés silencieusement.
function requestedTransition(message) {
  const roots = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
  const text = String(message).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(do|re|mi|fa|sol|la|si)\s+(mineur\s*7|mineur|majeur\s*7|septieme)\b/gi,
      (_, root, quality) => roots[root.toLowerCase()] + ({ mineur: 'm', mineur7: 'm7', majeur7: 'maj7', septieme: '7' }[quality.toLowerCase().replace(/\s/g, '')] || ''));
  const chords = [...text.matchAll(/\b([A-G](?:#|b)?(?:maj7|maj9|m7b5|m7|m9|7b9|7|9|13|m)?(?:\/[A-G](?:#|b)?)?)\b/g)].map((m) => parseChordName(m[1])).filter(Boolean);
  return chords.length >= 2 ? chords.slice(-2) : null;
}

/** Retour local pour le jeu personnel. Une demande d'écoute aboutit à une démonstration calculée. */
export function personalPlayingAnswer({ message, messages = [], context, review = false }) {
  const data = context?.playing?.passage;
  if (!data?.events?.length) return null;
  const text = plain(message);
  const sourceBoundary = messages.findLastIndex((m) => m.role === 'user' && m.take?.events?.length);
  const relevant = messages.slice(Math.max(0, sourceBoundary));
  const previousReply = [...relevant].reverse().find((m) => m.role === 'assistant' && !m.isTyping && m.toolResult?.playingAdvice);
  const previous = previousReply?.toolResult.playingAdvice;
  const correction = /tu.*jou.*pas.*(?:comme|mon jeu)|respecte.*(?:mon jeu|ma facon)|garde.*ma facon/.test(text);
  const hear = (correction || /fais.*(?:entendre|ecouter)|entendre|ecout|montre[- ]moi|demonstration|\bdemo\b|un exemple|joue[- ]moi/.test(text))
    && !/(?:rejou|reecout|reentendre).*(?:ma prise|mon jeu|original|ma melodie|ma main)/.test(text);
  const lastRequest = [...relevant].reverse().filter((m) => m.role === 'user').map((m) => ({
    goal: requestedGoal(plain(m.content)), named: requestedTransition(m.content),
  })).find((r) => r.goal || r.named);
  const named = requestedTransition(message) || (hear ? lastRequest?.named : null);
  const base = { played: [], ignored: 0, suggestions: [], example: null, voicing: null };
  const answer = (content, extra = {}, suggestedActions = []) => ({ ok: true, content, toolResult: { ...base, ...extra }, suggestedActions, autoplay: Boolean(extra.example) });
  if (/\b(?:hasard|n'importe quoi|aleatoire|sans intention|test des touches)\b/.test(text)) {
    return answer('D’accord, cette prise était une exploration. Je n’en déduis pas ton niveau. Pour un conseil utile, choisis un petit passage ou dis-moi ce que tu souhaites essayer.');
  }
  const more = /c[' ]est tout|(?:rien|autre chose|davantage|encore|plus|d.autres?).*(?:ajout|rajout|enrich|propos)|(?:ajout|rajout|enrich|propos).*(?:plus|encore|autre|davantage)|va plus loin|encore un peu|continue|poursui/.test(text);
  const alternative = /autre (?:version|variante|proposition)|differente/.test(text);
  // [Claude] — 2026-11-11 — Un avis sur la PRISE seulement : « qu'en penses-tu de Bill Evans ? » parle
  // d'autre chose et va au modèle (audit des routes locales, mission Copilot fiable).
  const generic = /qu['’ ]en penses[- ]tu\s*(?:[?.!]|$|de (?:ce que je|ma |mon |mes |ca|cela|cette prise|ce passage))|ton avis\s*(?:[?.!]|$|sur (?:ma |mon |mes |ca|cela|ce que))|analyse mon jeu/.test(text);
  const retry = /^(?:et )?(?:maintenant|alors|reessaie)(?:[ ?!.]*)$/.test(text);
  const historyGoal = () => lastRequest?.goal;
  const goal = requestedGoal(text) || (correction ? 'develop' : (retry || more || alternative) ? previous?.goal || historyGoal() || 'develop' : null);
  const source = (more || alternative) && previous?.take ? previous.take : data;
  const take = { ...source, duration: source.duration || Math.max(...source.events.map((e) => e.time)) };
  if (hear && !more && !alternative && previous && !named && !goal && (!historyGoal() || historyGoal() === previous.goal)) {
    // Réévaluer les anciens placements compressés, y compris après réouverture de l'historique.
    const updated = refreshPlayingResult({ playingAdvice: previous });
    if (!updated) return answer('Je ne trouve pas de placement rythmique assez clair pour ce passage. Je peux plutôt enrichir tes accords.', {}, actions);
    const advice = updated.playingAdvice;
    return demonstrate(advice);
  }
  function demonstrate(advice) {
    const changed = applyTakeEdit(advice.take, advice.edit);
    const example = changed && comparedTakeExample(advice.take, changed);
    if (!example) return answer('Je ne peux pas appliquer ce changement à la prise enregistrée. Reprenons à partir de ton jeu.');
    const comparison = advice.edit.type === 'plan' ? 'Compare ton jeu original et cette version enrichie.' : advice.edit.type === 'passing' || advice.changes?.some((p) => p.goal === 'passing')
      ? 'Compare les deux versions. Seul l’accompagnement à cet endroit est ajusté.'
      : 'Compare ton jeu original et la proposition. Le reste de ta prise est conservé.';
    return answer(`${advice.text}\n\n${comparison}`, { example, originalTake: advice.take, playingAdvice: advice });
  }
  // Une consigne d'exercice explicite reste évaluée par le chemin dédié.
  if (!goal && generic && context.type === 'exercise') return null;
  if (!goal && !generic && !hear) return null;
  const found = playingProposals(take);
  if (!goal && !hear) return answer('J’ai bien reçu ta prise. Que souhaites-tu travailler : enrichir tes accords, alléger l’accompagnement, ou autre chose ? Je préfère connaître ton intention avant de te proposer un changement.', {}, actions);
  const desired = named ? 'passing' : goal || historyGoal() || previous?.goal || 'passing';
  const broad = desired === 'develop' || /progression|plusieurs|(?:mes|les|des) accords|tout le|ensemble/.test(text);
  if (!named && (broad || more || alternative)) {
    const updated = previous ? refreshPlayingResult({ playingAdvice: previous })?.playingAdvice : null;
    const requestedTechniques = [...(/drop\s*2/.test(text) ? ['drop2'] : []), ...(/upper.?structures?/.test(text) ? ['upper'] : [])];
    const technique = requestedTechniques.length ? requestedTechniques : null;
    const plan = planPlayingChanges(take, found.proposals, { goal: desired, previous: updated, more, alternative, broad, technique });
    if (plan) return hear || ((more || alternative) && previousReply?.toolResult.example)
      ? demonstrate(plan) : answer(plan.text, { playingAdvice: plan }, [{ label: HEAR, message: HEAR }]);
    if (technique) return answer('Je n’ai pas trouvé de disposition vérifiable pour cette technique qui garde ta basse et ton dessus dans cette prise. Je peux plutôt enrichir les voicings existants.', {}, [{label:'Enrichis mes accords',message:'Enrichis mes accords'}]);
    if ((more || alternative) && previous) return answer('Je n’ai pas trouvé d’autre changement compatible à ajouter à cette version. Choisis un accord précis à retravailler, ou demande une autre variante.', {}, [{ label: 'Une autre version', message: 'Propose une autre version de ma progression' }]);
  }
  const matches = (p) => !named || (p.transition?.rootPc === named[0].rootPc && /^7$/.test(named[0].quality)
    && p.transition?.targetRootPc === named[1].rootPc && /^m(?!aj)/.test(p.transition.targetQuality) === /^m(?!aj)/.test(named[1].quality));
  const proposal = found.proposals.find((p) => p.goal === desired && matches(p))
    || (!named && desired === 'passing' && (/enrich|couleur|agremente/.test(text) || (hear && !goal)) ? found.proposals.find((p) => p.goal === 'enrich') : null);
  if (!proposal && named) return answer('Je ne peux pas encore placer cet enchaînement précis dans ta prise avec une démonstration fidèle. Je peux chercher un accord de passage adapté aux accords que tu as joués.', {}, [{ label: 'Propose un accord de passage', message: 'Propose un accord de passage' }]);
  if (!proposal) {
    if (desired === 'lighten') return answer('Je n’ai pas repéré de doublure que je puisse retirer en conservant clairement ton accord, ta basse et la mélodie. Choisis un accord précis ou indique ce que tu trouves trop chargé.');
    if (found.harmonicCount > 0) {
      return desired === 'passing'
        ? answer('Je repère les accords, mais pas encore un placement rythmique assez clair pour insérer un accord de passage en gardant ta mélodie. Je peux plutôt te proposer un enrichissement.', {}, [{ label: 'Enrichis mes accords', message: 'Enrichis mes accords' }])
        : answer('Je repère les accords de ta prise, mais pas de couleur supplémentaire dans cette position qui conserve clairement ton dessus. Je peux chercher un accord de passage.', {}, [{ label: 'Propose un accord de passage', message: 'Propose un accord de passage' }]);
    }
    return answer('Je n’ai pas assez de repères harmoniques pour ajouter une note avec confiance. Indique l’accord que tu souhaitais jouer, ou enregistre un passage plus court. Je garderai ta façon de le jouer.');
  }
  const advice = { ...proposal, take };
  return hear ? demonstrate(advice) : answer(proposal.text, { playingAdvice: advice }, [{ label: HEAR, message: HEAR }]);
}
