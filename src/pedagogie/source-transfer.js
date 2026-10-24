// Une adaptation est calculée avant l'appel au modèle : source, cible et compatibilité
// explicites. Le même moteur traite tutoriel/cover et notes MIDI du pianiste.
import { parseTutorialRequest } from './tutorial-questions.js';
import { applyTutorialPassage, progressionFromDegrees, parseKey } from './tutorial-transfer.js';
import { buildNoteWindows, segmentSessionEvents, nameChordSegments } from '../recorder/session-analysis.js';
import { MAX_PASSAGE_SECONDS } from './passage-range.js';
import { tutorialEvidence, evidenceOccurrence } from './tutorial-evidence.js';
import { insertionBetween, insertSourcePassage, findSourceInsertion } from './passage-insertion.js';

function sourceSignature(source) {
  const inside = (n) => n.start < source.end && n.end > source.start;
  const text = JSON.stringify([source.key, source.start, source.end,
    source.notes.filter(inside).map((n) => [n.midi, n.start, n.end, n.hand]),
    source.chords.filter(inside).map((c) => [c.label, c.start, c.end, Boolean(c.uncertain)]),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

function midiSource(data) {
  const offset = Number(data.offset) || 0;
  const events = data.events.map((e) => ({ ...e, ...(Number.isFinite(e.note) ? { note: e.note + offset } : {}) }))
    .sort((a, b) => a.time - b.time);
  const last = events.reduce((max, e) => Math.max(max, Number(e.time) || 0), 0);
  const notes = buildNoteWindows(events).map((w) => ({ midi: w.note, start: w.onTime, end: Number.isFinite(w.offTime) ? w.offTime : last }));
  const chords = nameChordSegments(segmentSessionEvents(events)).filter((s) => s.type === 'chord' && s.chordName)
    .map((s) => ({ start: s.start, end: s.end, label: s.chordName, uncertain: s.matched === false }));
  const parsedKey = parseKey(data.key);
  const key = parsedKey && offset ? `${['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][((parsedKey.rootPc + offset) % 12 + 12) % 12]}${parsedKey.minor ? ' minor' : ' major'}` : data.key || null;
  return { notes, chords, key, start: notes.reduce((min, n) => Math.min(min, n.start), Infinity), end: notes.reduce((max, n) => Math.max(max, n.end), 0) };
}

/** null = autre type de question ; sinon réponse fiable, y compris motif de refus. */
export function sourceTransferRequest(message, context = {}, options = {}) {
  const ask = options.request || parseTutorialRequest(message);
  if (ask?.kind !== 'apply') return null;
  let transferIntent = null;
  const refused = (reason) => ({ example: null, text: '', error: reason, status: 'unavailable', transferIntent });
  const sourceId = context.path || context.sessionId || context.name || context.type;
  if (options.resume?.sourceId && options.resume.sourceId !== sourceId) return refused('La source de la demande précédente n’est plus ouverte. Rouvre-la pour reprendre cette adaptation ; je ne la remplace pas par une autre source.');
  const tooLong = 'Ce passage est trop long pour une adaptation précise. Sélectionne le mouvement voulu (dix minutes au maximum) ; je ne travaille pas seulement sur son début à ton insu.';
  const mine = Boolean(options.resume?.playingSource) || /\b(?:mon|ma|mes)\s+(?:jeu|mouvement|voicing|accord|lick|passage|encha[iî]nement|session)|ce que (?:j’ai|j'ai|je viens de) jou/i.test(message);
  const teacher = /\b(?:prof|professeur|tuto|tutoriel|vidéo|video|cover)\b|\b(?:son|ses)\s+(?:jeu|mouvement|voicing|accord|lick|passage)/i.test(message);
  let source;
  let label;
  let playingSource = null;
  if (context.type === 'tutorial' && !mine) {
    const moment = options.resume?.window ? { ...options.resume.window, chosen: true } : context.moment;
    source = { ...moment, notes: context.noteEvents || [], chords: context.chords || [], key: options.resume ? options.resume.sourceKey : context.key };
    if (ask.sourceProgression) {
      const evidence = tutorialEvidence({ ...context, moment }, ask.sourceProgression);
      const occurrence = evidenceOccurrence(evidence, moment);
      if (!occurrence) return refused(`Je ne retrouve pas le ${ask.sourceProgression} complet dans le relevé de cette région. Je ne le reconstruis pas à partir du seul titre de la vidéo. Sélectionne sa démonstration complète.`);
      source = { ...source, ...occurrence, chords: context.chords || [], key: evidence.key };
    }
    label = 'passage vidéo';
  } else {
    if (teacher) return refused('Ouvre le tutoriel ou la cover et sélectionne le passage à reprendre. Je ne remplace pas ce passage par ton propre jeu.');
    const wantsSession = options.resume?.playingSource === 'session' || /\bsession\b/i.test(message);
    const data = wantsSession ? context.playing?.session : context.playing?.passage || context.playing?.session;
    if (!Array.isArray(data?.events) || !data.events.length) return refused('Je n’ai pas ton jeu à adapter. Enregistre un passage avec « Qu’en penses-tu ? », ou ouvre ta session MIDI et confie-la au Copilote.');
    const end = data.events.reduce((max, e) => Math.max(max, Number(e.time) || 0), 0);
    const start = data.events.reduce((min, e) => e.type === 'note_on' && e.velocity > 0 ? Math.min(min, e.time) : min, Infinity);
    if (end - start > MAX_PASSAGE_SECONDS) return refused(tooLong);
    source = midiSource(data);
    playingSource = wantsSession || data === context.playing?.session ? 'session' : 'passage';
    if (options.resume?.window && (source.start !== options.resume.window.start || source.end !== options.resume.window.end || source.key !== options.resume.sourceKey)) return refused('Ton passage MIDI a changé depuis la demande. Demande une nouvelle adaptation pour utiliser ce nouveau jeu.');
    label = wantsSession || data === context.playing?.session ? 'ta session MIDI' : 'ton passage joué';
  }
  if (Number.isFinite(ask.at)) {
    // Un instant seul ne dit pas où finit le mouvement : ne pas inventer huit secondes.
    return refused('Pour adapter le mouvement à cet instant, sélectionne aussi sa fin : j’ai besoin du passage complet, avec son accord d’arrivée.');
  }
  if (!Number.isFinite(source.start) || !Number.isFinite(source.end) || source.end <= source.start) return refused('Sélectionne le début et la fin du passage à adapter.');
  if (source.end - source.start > MAX_PASSAGE_SECONDS) return refused(tooLong);
  if (!source.notes.length) return refused('Les notes de ce passage ne sont pas disponibles. Il faut un relevé lisible avant de pouvoir en adapter le voicing ou le mouvement.');
  const signature = sourceSignature(source);
  if (options.resume?.sourceSignature && options.resume.sourceSignature !== signature) return refused('Le relevé du passage a changé depuis ta demande. Demande une nouvelle adaptation pour utiliser ces nouvelles notes ; je ne les substitue pas à la source précédente.');
  if (!ask.progression && !ask.chords?.length) return refused('Indique la progression cible, par exemple « 2-5-1 en Do » ou « Dm7 G7 Cmaj7 ».');
  const key = ask.key || source.key;
  if (ask.progression && !parseKey(key)) return refused('Dans quelle tonalité veux-tu cette progression ? Les degrés seuls ne suffisent pas, et la tonalité de la source n’est pas connue.');
  const targets = ask.chords || progressionFromDegrees(ask.progression, key);
  if (!targets?.length) return refused('Je ne reconnais pas la progression cible. Écris ses degrés avec la tonalité, ou ses accords.');
  const passingOnly = ask.passingOnly ?? /accords? de passage|passing chords?/i.test(message);
  transferIntent = { request: { ...ask, key, passingOnly }, sourceId, sourceKey: source.key, sourceSignature: signature, playingSource, window: { start: source.start, end: source.end } };
  if (ask.placement === 'insert') {
    const result = insertSourcePassage({ source, targets, targetKey: key, between: ask.between, sourceProgression: ask.sourceProgression });
    if (result.example) result.example.source = { kind: label, path: sourceId, start: source.start, end: source.end, targets, what: 'insertion', between: ask.between };
    return { ...result, status: result.example ? 'compatible' : 'unavailable', source: label, transferIntent };
  }
  const evaluate = (what) => {
    if (!parseKey(source.key)) {
      if (what === 'enchainement') return { example: null, error: 'La tonalité de la source n’est pas connue : je ne peux pas vérifier les degrés de ce mouvement. Précise cette tonalité, ou demande seulement d’adapter la répartition des notes du voicing.' };
      if (what === 'lick' && source.chords.filter((c) => c.start < source.end && c.end > source.start).length > 1) return { example: null, error: 'La tonalité de la source manque pour vérifier cette ligne entre plusieurs accords. Je ne peux pas certifier que son mouvement conserve les mêmes degrés.' };
    }
    return applyTutorialPassage({ notes: source.notes, chords: source.chords, start: source.start, end: source.end, what, targets, key: source.key, targetKey: key, passingOnly: what === 'enchainement' && passingOnly });
  };
  const initialKind = ask.what || 'enchainement';
  let result = evaluate(initialKind), chosenKind = initialKind;
  // Un mouvement nommé peut servir d'approche vers une arrivée de la grille,
  // même si cette grille entière ne reproduit pas le mouvement.
  if (!result.example && initialKind === 'enchainement' && ask.sourceProgression?.split('-').length >= 3) {
    const insertion = findSourceInsertion({ source, targets, targetKey: key, sourceProgression: ask.sourceProgression });
    if (insertion) {
      transferIntent.request = { ...transferIntent.request, placement: 'insert', between: insertion.between };
      insertion.example.source = { kind: label, path: sourceId, start: source.start, end: source.end, targets, what: 'insertion', between: insertion.between };
      return { ...insertion, status: 'compatible', source: label, transferIntent };
    }
  }
  if (!result.example && (options.allowPartial || !ask.what)) {
    const alternatives = ['lick', 'voicing'].filter((kind) => kind !== initialKind).map((what) => ({ what, result: evaluate(what) }));
    const possible = alternatives.filter((a) => a.result.example);
    if (possible.length && options.allowPartial) {
      const preferred = possible.find((a) => a.what === options.prefer) || possible.find((a) => a.what === 'voicing') || possible[0];
      const unavailable = result.error;
      result = { ...preferred.result, summary: `${unavailable}\n\n**Ce qui peut être conservé : ${preferred.what === 'voicing' ? 'les voicings' : 'la ligne mélodique'}.** ${preferred.result.summary}` };
      chosenKind = preferred.what;
    } else if (possible.length) {
      const names = possible.map((a) => a.what === 'voicing' ? 'la répartition et les rôles des notes des voicings' : 'la ligne mélodique').join(' ; ');
      return { ...refused(`${result.error}\n\nJ’ai aussi vérifié les éléments séparément : je peux conserver ${names} sur ${targets.join(' → ')}. Je peux te faire entendre cette reprise partielle si tu la souhaites.`), alternatives: possible.map((a) => a.what) };
    } else {
      return refused(`${result.error}\n\nLes autres éléments ne donnent pas non plus d’adaptation vérifiable : ${alternatives.map((a) => a.result.error).join(' ')}`);
    }
  } else if (!result.example && initialKind === 'enchainement') {
    const voicing = evaluate('voicing');
    if (voicing.example) return { ...refused(`${result.error}\n\nJ’ai vérifié ce qui reste réutilisable : les rôles des voicings peuvent être adaptés séparément à ${targets.join(' → ')}. Le mouvement complet serait changé. Tu peux me demander de conserver seulement ce qui est possible.`), alternatives: ['voicing'] };
  }
  // Le moteur historique dit « prof » ; une session personnelle reste attribuée au pianiste.
  const wording = (text) => label === 'passage vidéo' ? text : String(text || '')
    .replace(/du prof/g, 'de ton jeu').replace(/Ses voicings/g, 'Tes voicings').replace(/ses voicings/g, 'tes voicings')
    .replace(/Son lick/g, 'Ton lick').replace(/son lick/g, 'ton lick');
  if (result.example) {
    result.example.title = wording(result.example.title);
    result.example.source = { kind: label, start: source.start, end: source.end, targets, what: chosenKind };
  }
  return { ...result, text: wording(result.text), error: wording(result.error), status: result.example ? 'compatible' : 'unavailable', source: label, transferIntent };
}

/** Les réponses « ce qui est possible » gardent la source et la cible de la demande. */
export function transferFollowup(message, messages = []) {
  if (parseTutorialRequest(message)?.kind === 'apply') return null;
  const text = String(message || '').replace(/’/g, "'");
  const partial = /(?:ce qu[i']|tout ce qui).{0,30}possible|(?:conserv|repren|gard).{0,30}(?:possible|voicings?|ligne|mouvement)/i.test(text);
  const prefer = /voicing|répartition/i.test(text) ? 'voicing' : /ligne|lick/i.test(text) ? 'lick' : null;
  const choice = /^(?:oui\b|(?:seulement\s+)?(?:les? |la |son |ses )?(?:voicings?|répartition|ligne|lick)\b|(?:je veux|je choisis|adapte|reprends|garde|conserve|fais|joue)\b)/i.test(text.trim());
  if (!partial && !(prefer && choice)) return null;
  const previous = previousTransfer(message, messages);
  return previous ? { request: previous.request, ...(previous.sourceId ? { resume: previous } : {}), allowPartial: true, prefer } : null;
}

function previousTransfer(message, messages) {
  const history = messages.filter((m) => !m.isTyping && !(m.role === 'user' && m.content?.trim() === String(message).trim()));
  const last = [...history].reverse().find((m) => m.role === 'assistant' && !m.isError && m.toolResult?.transferIntent);
  if (last) return last.toolResult.transferIntent;
  // Compatibilité avec les conversations enregistrées avant le stockage de l'intention.
  for (const m of [...history].reverse().slice(0, 12)) {
    if (m.role !== 'user') continue;
    const request = parseTutorialRequest(m.content);
    if (request?.kind === 'apply') return { request };
  }
  return null;
}

/** « Entre le 1 et le 6 » précise un emplacement dans la grille précédente. */
export function insertionFollowup(message, messages = [], context = {}) {
  if (!/jou|rejou|ins[èée]r|gliss|plac|ajout|appliqu/i.test(message) || /^(?:pourquoi|quelle?\b|comment (?:il|le prof))/i.test(String(message).trim())) return null;
  const placement = insertionBetween(message);
  if (!placement) return null;
  const previous = previousTransfer(message, messages);
  const explicit = parseTutorialRequest(`Applique ce mouvement ${placement.withoutBetween}`);
  const base = previous?.request || {};
  const request = { ...base, ...(explicit?.kind === 'apply' ? Object.fromEntries(Object.entries(explicit).filter(([, value]) => value !== null)) : {}),
    kind: 'apply', what: 'enchainement', placement: 'insert', between: placement.degrees,
    progression: explicit?.progression && explicit.progression !== placement.sourceDegrees ? explicit.progression : base.progression || placement.degrees.join('-'),
    key: explicit?.key || base.key || null,
    sourceProgression: explicit?.sourceProgression || placement.sourceDegrees || base.sourceProgression || tutorialEvidence(context)?.degrees || null,
  };
  return { request, ...(previous?.sourceId ? { resume: previous } : {}) };
}
