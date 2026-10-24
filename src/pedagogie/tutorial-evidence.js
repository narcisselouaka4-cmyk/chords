// Ce que la source permet d'affirmer : degrés annoncés, tonalité annoncée et
// occurrence effectivement retrouvée dans le relevé. Aucun choix de notes par l'IA.
import { readSpokenTheory, announcedProgression, keyText } from './spoken-theory.js';
import { parseKey, progressionFromDegrees } from './tutorial-transfer.js';
import { parseChordName } from './note-roles.js';
import { parseTutorialRequest } from './tutorial-questions.js';

const clean = (s) => String(s || '').replace(/[‐‑‒–—−]/g, '-').replace(/’/g, "'");
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const ROOTS = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

export function tutorialEvidence(context, requestedDegrees = null) {
  if (context?.type !== 'tutorial') return null;
  const spoken = readSpokenTheory(context.transcript || []);
  const named = clean(context.name).match(/(?:^|[^\d])([1-7](?:\s*-\s*[1-7]){1,11})(?![\d-])/);
  const said = announcedProgression(spoken);
  const degrees = requestedDegrees || named?.[1]?.replace(/\s/g, '') || said?.degrees?.join('-');
  if (!degrees) return null;
  const grid = [];
  for (const c of [...(context.chords || [])].sort((a, b) => a.start - b.start)) {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.end <= c.start) continue;
    const parsed = parseChordName(c.label || c.name);
    // Un accord illisible reste une rupture : le supprimer fabriquerait une suite complète.
    if (!parsed || c.uncertain) { grid.push({ start: c.start, end: c.end, rootPc: null }); continue; }
    if (grid.at(-1)?.name === parsed.name && c.start <= grid.at(-1).end + 0.2) { grid.at(-1).end = Math.max(grid.at(-1).end, c.end); continue; }
    grid.push({ ...parsed, start: c.start, end: c.end });
  }
  const candidates = [...spoken.keys.map((k) => ({ key: keyText(k.pc, k.minor), announced: true, at: k.at })), { key: context.key, announced: false }].filter((k) => parseKey(k.key));
  for (const candidate of candidates) {
    const expected = progressionFromDegrees(degrees, candidate.key)?.map(parseChordName);
    if (!expected?.length) continue;
    const occurrences = [];
    for (let i = 0; i + expected.length <= grid.length; i++) {
      const sequence = grid.slice(i, i + expected.length);
      if (!sequence.every((c, j) => c.rootPc === expected[j].rootPc && (!j || c.start - sequence[j - 1].end <= 1))) continue;
      if (candidate.announced && (candidate.at > sequence[0].start + 1 || sequence[0].start - candidate.at > 120)) continue;
      occurrences.push({ start: sequence[0].start, end: sequence.at(-1).end, chords: sequence.map((c) => ({ start: c.start, end: c.end, label: c.name })) });
    }
    if (context.moment?.chosen && !occurrences.some((o) => o.start >= context.moment.start - 0.05 && o.end <= context.moment.end + 0.05)) continue;
    if (occurrences.length) return { degrees, key: candidate.key, announced: candidate.announced, keyAt: candidate.at, expected, occurrences };
  }
  return null;
}

/** Une région explicite reste prioritaire ; une référence nommée peut retrouver son occurrence. */
export function evidenceOccurrence(evidence, moment) {
  if (!evidence) return null;
  const inside = evidence.occurrences.filter((o) => !moment?.chosen || (o.start >= moment.start - 0.05 && o.end <= moment.end + 0.05));
  if (!inside.length) return null;
  const near = Number.isFinite(moment?.now) ? moment.now : Number.isFinite(moment?.end) ? moment.end : inside[0].end;
  return [...inside].sort((a, b) => Math.abs(a.end - near) - Math.abs(b.end - near))[0];
}

export function evidenceLines(evidence) {
  if (!evidence) return [];
  const key = parseKey(evidence.key);
  const first = evidence.occurrences[0];
  return [
    `Référence vérifiée dans le relevé : ${evidence.degrees} désigne une progression d'accords successifs en ${ROOTS[key.rootPc]} ${key.minor ? 'mineur' : 'majeur'}, pas la 7e, la 3ce et la 6te à répartir dans un accord.`,
    `${evidence.announced ? `Tonalité annoncée dans la transcription à ${clock(evidence.keyAt)} et corroborée par cette progression` : 'Tonalité du contexte corroborée par cette progression'} : ${evidence.key}.`,
    `Occurrence relevée à ${clock(first.start)}–${clock(first.end)} : ${first.chords.map((c) => c.label).join(' → ')}.`,
    'Ces constats priment sur les suppositions et les anciennes réponses de la conversation. Ne prétends pas avoir compris des gestes ou une répartition des mains que le relevé ne donne pas.',
  ];
}

export function tutorialMeaningAnswer(message, context, evidence) {
  const text = clean(message).toLowerCase();
  if (!evidence || !/anglais|raconte quoi|(?:compris|comprend|comprendre).{0,25}(?:vidéo|video)|(?:il|le prof).{0,12}(?:dit quoi|explique quoi)/.test(text)) return null;
  const key = parseKey(evidence.key), occurrence = evidenceOccurrence(evidence, context.moment) || evidence.occurrences[0];
  return `Il présente un **enchaînement ${evidence.degrees.replace(/-/g, ' → ')}** : les chiffres sont les degrés des accords qui se succèdent dans la tonalité, pas trois notes à répartir entre les mains.\n\n${evidence.announced ? 'Il annonce' : 'Le contexte indique'} **${ROOTS[key.rootPc]} ${key.minor ? 'mineur' : 'majeur'}**. Dans cette tonalité, ces degrés ont pour fondamentales **${evidence.expected.map((c) => ROOTS[c.rootPc]).join(' → ')}**. Le relevé donne **${occurrence.chords.map((c) => c.label).join(' → ')}** à ${clock(occurrence.start)}–${clock(occurrence.end)}.\n\nJe peux te faire entendre ce passage avec ses notes relevées. Pour l'utiliser ailleurs, il faut vérifier où cet enchaînement ou ses voicings peuvent être conservés.`;
}

/** Les relances courtes portent sur le dernier objet musical, pas sur une ancienne
 * grille citée ailleurs dans la conversation. La provenance est un fait du lecteur. */
export function tutorialConversation(message, context, messages = []) {
  if (context?.type !== 'tutorial') return null;
  const text = clean(message).trim();
  const previous = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isError && m.toolResult?.example);
  if (!previous) return null;
  const example = previous.toolResult.example;
  const source = example.source;
  const provenance = /(?:c'est|ce n'est|est-ce|ça|cela|cet exemple).{0,60}(?:dans|de|vient|sort).{0,20}(?:vidéo|video)|(?:vient|provient).{0,20}(?:vidéo|video)|tu.{0,15}invent|ça vient d'où/i.test(text);
  if (provenance) {
    const path = source?.path || previous.toolResult.transferIntent?.sourceId;
    if (path && context.path && path !== context.path) return { answer: 'Cet exemple vient d’une autre source que la vidéo actuellement ouverte. Rouvre la vidéo d’origine pour vérifier son passage.' };
    if (example.kind === 'tutorial') return { answer: `Oui : cet exemple reprend les notes relevées de la vidéo à **${clock(example.tutorialStart)}–${clock(example.tutorialEnd)}**${source?.transposeTo ? `, transposées en ${source.transposeTo}` : ''}. Il reste dépendant de la qualité du relevé automatique.` };
    if (source?.kind && source.kind !== 'passage vidéo') return { answer: 'Cet exemple est une adaptation de ton jeu MIDI. Il ne reprend pas les notes du pianiste de la vidéo.' };
    if (source?.what === 'insertion') return { answer: 'Cet exemple est une insertion adaptée : le passage central reprend les notes de la vidéo transposées ; les accords de contexte et la résolution éventuelle sont ajoutés. Cette séquence complète n’est pas jouée telle quelle dans la vidéo.' };
    if (example.kind === 'tutorial-transfer') return { answer: `C’est une adaptation calculée à partir du passage vidéo${Number.isFinite(source?.start) ? ` de ${clock(source.start)} à ${clock(source.end)}` : ''}. Elle reprend ${source?.what === 'voicing' ? 'les rôles des voicings' : 'des éléments du passage'} sur ta grille ; ce résultat n’est pas joué tel quel dans la vidéo.` };
    return { answer: `Cet exemple a été généré par l’application${example.title ? ` : **${example.title}**` : ''}. Il ne rejoue pas les notes du pianiste dans la vidéo. Pour un autre exemple du passage vidéo, je dois reprendre une occurrence du relevé.` };
  }
  const another = /^(?:(?:joue|montre|fais|fait)(?:[- ]moi)?\s+)?(?:un|une)\s+autre\s+(?:exemple|démonstration|demonstration|passage|occurrence)(?:\s+(?:de la vidéo|du prof|stp|s'il te plaît))?[.!? ]*$/i.test(text);
  if (!another || (example.kind !== 'tutorial' && !source)) return null;
  if (source?.path && source.path !== context.path) return { answer: 'La vidéo source de l’exemple précédent n’est plus ouverte. Je ne choisis pas un passage d’une autre vidéo à sa place.' };
  const intent = previous.toolResult.transferIntent;
  const degrees = source?.degrees || intent?.request?.sourceProgression || (example.kind === 'tutorial' ? clean(example.title).match(/[1-7](?:\s*-\s*[1-7]){1,11}/)?.[0] : null);
  if (example.kind !== 'tutorial' && !degrees) return { answer: 'Je n’ai pas d’autre adaptation vérifiée de ce passage. Précise ce que tu veux faire varier ; je ne la remplace pas par une progression générée.' };
  const evidence = tutorialEvidence(context, degrees);
  const seen = messages.filter((m) => m.role === 'assistant' && m.toolResult?.example).map((m) => m.toolResult.example);
  const available = (evidence?.occurrences || []).filter((o) => (!context.moment?.chosen || (o.start >= context.moment.start - 0.05 && o.end <= context.moment.end + 0.05))
    && !seen.some((e) => Math.abs((e.tutorialStart ?? e.source?.start) - o.start) < 0.05 && Math.abs((e.tutorialEnd ?? e.source?.end) - o.end) < 0.05));
  const next = available.find((o) => o.start >= (example.tutorialEnd ?? source?.end) - 0.05) || available[0];
  if (!next) return { answer: 'Je n’ai pas retrouvé d’autre occurrence complète et vérifiable de ce mouvement dans cette région. Je peux reprendre le même passage ; je ne le remplace pas par un exemple généré.' };
  if (intent && example.kind !== 'tutorial') return { transfer: { request: intent.request, resume: { ...intent, sourceSignature: null, window: { start: next.start, end: next.end } }, allowPartial: true } };
  return { playback: { window: next, evidence, key: evidence.key, transposeTo: source?.transposeTo || null, another: true } };
}

/** Les demandes de démonstration du tutoriel ne deviennent jamais un lick généré. */
export function tutorialPlayback(message, context, { messages = [] } = {}) {
  if (context?.type !== 'tutorial') return null;
  const text = clean(message), ask = parseTutorialRequest(message);
  if (ask?.kind === 'apply' || /\b(?:ma|mon|mes)\s+(?:jeu|session|mélodie|passage)/i.test(text)) return null;
  const hear = /rejou|reprodui|(?:fais|fait|joue|montre)[- ]moi|fais(?:[- ]moi)? entendre|(?:^|\s)(?:joue|montre) (?:ce|cet|son|le|la|un|une)/i.test(text);
  const reference = /qu'il (?:vient de |a )?(?:montr|jou|démontr)|du (?:prof|tuto)|de la (?:vidéo|video)|ce passage|ce mouvement|son (?:lick|voicing|enchaînement)|(?:lick|voicing) de \d+:\d+/i.test(text);
  const accompany = /combl.{0,30}lick.{0,30}accord|accord.{0,20}(?:sous|avec).{0,20}lick/i.test(text);
  const bareDemo = /^(?:fais|fait|joue|montre)(?:[- ]moi)?\s+(?:une? )?(?:démonstration|demonstration|exemple)(?:\s+(?:s'il te pla[iî]t|stp))?[.!? ]*$/i.test(text);
  if (!(ask?.kind === 'replay' || ask?.kind === 'otherKey' || (hear && (reference || bareDemo)) || accompany)) return null;
  if (!context.noteEvents?.length) return { example: null, error: `Je n’ai pas les notes exactes de ce passage : ${context.notesUnavailable || 'le relevé n’a pas fourni de notes'}. Je ne les remplace pas par un exemple généré.` };
  const named = text.match(/(?:^|[^\d])([1-7](?:\s*-\s*[1-7]){1,11})(?![\d-])/);
  const evidence = tutorialEvidence(context, named?.[1]?.replace(/\s/g, ''));
  if (named && !evidence) return { example: null, error: `Je ne retrouve pas un ${named[1]} complet et vérifiable dans ce relevé. Je ne le remplace pas par une progression ou un lick généré.` };
  const occurrence = evidenceOccurrence(evidence, context.moment);
  let window = (named || bareDemo || accompany) && evidence ? occurrence : context.moment;
  if (Number.isFinite(ask?.at)) {
    if (context.moment?.chosen && (ask.at < context.moment.start || ask.at >= context.moment.end)) return { example: null, error: 'Le moment demandé est en dehors de la région sélectionnée. Modifie la région pour écouter ce passage.' };
    window = { start: ask.at, end: context.moment?.chosen ? Math.min(context.moment.end, ask.at + 8) : Math.min(context.duration || Infinity, ask.at + 8) };
  }
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start) return { example: null, error: 'Sélectionne le passage complet de la vidéo à rejouer. Je ne remplace pas les notes de cette source par un exemple généré.' };
  if (named && evidence && !occurrence) return { example: null, error: `La région sélectionnée ne contient pas un ${evidence.degrees} complet. Élargis-la jusqu’à son accord d’arrivée.` };
  // La transposition reste contrôlée dans le client commun, avec la tonalité corroborée.
  const previous = [...messages].reverse().find((m) => m.role === 'assistant' && !m.isError);
  const complete = evidence?.occurrences.some((o) => o.start >= window.start - 0.05 && o.end <= window.end + 0.05);
  const related = evidence?.occurrences.some((o) => o.start < window.end && o.end > window.start);
  return { window, evidence: complete ? evidence : null, key: related ? evidence.key : context.key, transposeTo: ask?.kind === 'otherKey' ? ask.key : null,
    correctedGeneratedExample: accompany && previous?.toolResult?.example?.kind === 'lick' };
}
