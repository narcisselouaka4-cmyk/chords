// [Claude] — 2026-11-12 — La bibliothèque entière au service du Copilote.
//
// Narcisse : « faut que copilote ait aussi accès à toute la bibliothèque pour qu'il puisse
// réutiliser leurs contenus afin de faire des combinaisons » ; précisé : les Exercices et les
// Tutoriels de Pédagogie IA ; enchaîner, superposer, transposer et adapter.
//
// Avant, le Copilote ne connaissait que les NOMS des exercices et ne jouait que l'exercice
// affiché. Ce module lui donne :
//   - un catalogue court (identifiant, nom, tonalité, tempo, accords) des deux bibliothèques ;
//   - le détail d'un élément (accords et mains d'un exercice dans une tonalité, chronologie
//     relevée d'un tutoriel) ;
//   - la combinaison de morceaux : enchaînés ou superposés, transposés, au tempo voulu, une main
//     ou les deux. Les NOTES viennent toujours des sources (étude écrite, relevé du tutoriel) :
//     l'application ne compose rien, elle les assemble et dit d'où elles viennent.

import movementsLibrary from '../exercise-catalogue.js';
import { createPracticeExercise } from '../practice-exercise.js';
import { buildDemo, cardHands } from '../practice-demo.js';
import { passageExample, transposeInterval, compactTimeline } from './teacher-notes.js';

const NAMES = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const pcOf = (n) => ((n % 12) + 12) % 12;
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export const MAX_PARTS = 6;
export const MAX_SECONDS = 180;

// ── Exercices ─────────────────────────────────────────────────────────────

let practice = null;
/** Un moteur d'exercices à part : construire un aperçu ne touche jamais l'exercice affiché. */
function engine() {
  if (!practice) practice = createPracticeExercise();
  return practice;
}

function exerciseEntry(id) {
  const text = String(id || '').trim().toLowerCase();
  return movementsLibrary.movements.find((m) => m.id.toLowerCase() === text)
    || movementsLibrary.movements.find((m) => m.name.toLowerCase() === text) || null;
}

/** Tonalité écrite d'un exercice (classe de hauteur). */
export function writtenKeyOf(entry) {
  return Number.isInteger(entry?.writtenKey) ? entry.writtenKey : 0;
}

/** Tempo de l'étude, à la noire. */
function exerciseTempo(entry) {
  return Math.round((entry?.score?.tempo || 80) * (entry?.score?.performanceRate || 1));
}

/** Classe de hauteur d'une tonalité dite « D », « Ré », « Bbm », « Fa♯ mineur »… ; null sinon. */
const SOLFEGE = { do: 0, re: 2, 'ré': 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function keyPcOf(key) {
  const text = String(key ?? '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  if (!text) return null;
  if (/^\d+$/.test(text)) return pcOf(Number(text));
  const alter = (sign) => (/^(#|dièse)/i.test(sign || '') ? 1 : /^(b|bémol)/i.test(sign || '') ? -1 : 0);
  const fr = /^(do|ré|re|mi|fa|sol|la|si)\s*(#|b(?!\w)|dièse|bémol)?/i.exec(text);
  if (fr) return pcOf(SOLFEGE[fr[1].toLowerCase()] + alter(fr[2]));
  const en = /^([a-g])(#|b)?/i.exec(text);
  return en ? pcOf(LETTERS[en[1].toLowerCase()] + alter(en[2])) : null;
}

function exerciseChords(entry, keyPc) {
  const chords = engine().previewMovement(entry.id, keyPc);
  return Array.isArray(chords) && chords.length ? chords : null;
}

const dedupe = (names) => names.filter((n, i) => n !== names[i - 1]);

// ── Tutoriels ─────────────────────────────────────────────────────────────

/** Fiche courte d'un relevé gardé ({ id, title, key, duration, notes, segments }). */
export function tutorialItem(fileKey, saved) {
  const analysis = saved?.analysis || {};
  const notes = (analysis.noteEvents || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start));
  const segments = (analysis.segments || []).filter((s) => Number.isFinite(s?.start))
    .map((s) => ({ start: s.start, end: s.end, label: s.chord?.label || s.label || null }));
  const title = String(saved?.path || fileKey).split('/').pop().replace(/\.(mp4|mov|mkv|webm)$/i, '').replace(/\s+/g, ' ').replace(/^[\s\-–—_.]+/, '').trim();
  const end = Math.max(0, ...notes.map((n) => n.end || n.start), ...segments.map((s) => s.end || s.start));
  return { id: `tuto-${fileKey}`, title, key: saved?.key || null, duration: end, notes, segments, savedAt: saved?.savedAt || '' };
}

/** Une vidéo relue plusieurs fois (autre dossier, autre date) : le relevé le plus récent et le plus riche. */
export function uniqueTutorials(items) {
  const best = new Map();
  for (const item of items) {
    const name = item.title.toLowerCase();
    const prev = best.get(name);
    if (!prev || item.notes.length > prev.notes.length || (item.notes.length === prev.notes.length && item.savedAt > prev.savedAt)) best.set(name, item);
  }
  return [...best.values()].sort((a, b) => a.title.localeCompare(b.title));
}

let tutorialCache = null;
/**
 * Les relevés de Pédagogie IA gardés sur le disque (…/PianoJazzChords/Pedagogie/memoire).
 * Lus une fois par séance ; hors Electron, une liste vide. Lecture seule.
 */
export function loadTutorialLibrary({ files = globalThis.window?.electronAPI?.files, refresh = false } = {}) {
  if (tutorialCache && !refresh) return tutorialCache;
  tutorialCache = (async () => {
    if (!files?.homeDir || !files?.readDir || !files?.readFile) return [];
    try {
      const home = String(await files.homeDir()).replace(/\/+$/, '');
      const dir = `${home}/PianoJazzChords/Pedagogie/memoire`;
      const entries = await files.readDir(dir);
      const items = [];
      for (const e of entries || []) {
        if (!e?.isFile || !/^[a-z0-9]+\.json$/i.test(e.name) || e.name === 'index.json') continue;
        try {
          const saved = JSON.parse(await files.readFile(`${dir}/${e.name}`));
          if (saved?.analysis) items.push(tutorialItem(e.name.replace(/\.json$/i, ''), saved));
        } catch (_) { /* relevé illisible : ignoré */ }
      }
      return uniqueTutorials(items);
    } catch (err) {
      console.warn('[Bibliothèque] relevés des tutoriels non lus :', err?.message || err);
      return [];
    }
  })();
  return tutorialCache;
}

// ── Catalogue ─────────────────────────────────────────────────────────────

/** Le catalogue court donné au modèle (une ligne par élément). */
let exerciseLines = null;
export function libraryCatalogue(tutorials = []) {
  if (!exerciseLines) exerciseLines = buildExerciseLines();
  const lines = [...exerciseLines];
  lines.push('', '### Tutoriels relevés (Pédagogie IA : notes lues dans la vidéo du prof)');
  if (!tutorials.length) lines.push('- (aucun relevé disponible)');
  for (const t of tutorials) {
    lines.push(`- ${t.id} : ${t.title} — ${t.key ? `en ${t.key}, ` : ''}${clock(t.duration)}, ${t.notes.length ? `${t.notes.length} notes relevées` : 'aucune note relevée (pas combinable)'}`);
  }
  return lines.join('\n');
}

function buildExerciseLines() {
  const lines = ['### Exercices (études écrites, transposables dans toutes les tonalités)'];
  for (const m of movementsLibrary.movements) {
    const key = writtenKeyOf(m);
    const chords = exerciseChords(m, key);
    const names = chords ? dedupe(chords.map((c) => c.name)) : [];
    lines.push(`- ${m.id} : ${m.name} — ${m.kind === 'study' ? 'geste' : m.kind}, ${m.style || 'style libre'}, écrit en ${NAMES[key]}, ${exerciseTempo(m)} à la noire ; accords : ${names.slice(0, 12).join(' ')}${names.length > 12 ? ' …' : ''}`);
  }
  return lines;
}

function findItem(id, tutorials) {
  const text = String(id || '').trim();
  if (/^tuto-/i.test(text)) return { tutorial: tutorials.find((t) => t.id.toLowerCase() === text.toLowerCase()) || null };
  const entry = exerciseEntry(text);
  if (entry) return { exercise: entry };
  const tutorial = tutorials.find((t) => t.title.toLowerCase() === text.toLowerCase());
  return tutorial ? { tutorial } : {};
}

const handNames = (notes) => notes.map((n) => `${['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pcOf(n)]}${Math.floor(n / 12) - 1}`).join(' ');

/**
 * Détail d'un élément pour le modèle (`consult_library`) : données, jamais des consignes.
 * @returns {{ok: boolean, content?: string, error?: string}}
 */
export function consultLibrary(rawArgs, tutorials = []) {
  let args = rawArgs;
  if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch (_) { return { ok: false, error: 'arguments illisibles' }; } }
  const { exercise, tutorial } = findItem(args?.id, tutorials);
  if (exercise) {
    const asked = keyPcOf(args.key);
    const key = asked ?? writtenKeyOf(exercise);
    const chords = exerciseChords(exercise, key);
    if (!chords) return { ok: false, error: `exercice ${exercise.id} non constructible en ${NAMES[key]}` };
    const demo = buildDemo(chords, 'gospel');
    const lines = chords.slice(0, 40).map((c, i) => { const { lh, rh } = cardHands(c); return `${i + 1}. ${c.name}${c.studyStep?.beats ? ` (${c.studyStep.beats} temps)` : ''} : MG ${handNames(lh || []) || '—'} | MD ${handNames(rh || []) || '—'}`; });
    return { ok: true, content: `Exercice ${exercise.id} — ${exercise.name}\nEn ${NAMES[key]} ; ${exerciseTempo(exercise)} à la noire ; ${Math.round(demo?.beats || 0)} temps.\n${exercise.context || exercise.description || ''}\n${lines.join('\n')}${chords.length > 40 ? '\n…' : ''}` };
  }
  if (tutorial) {
    if (!tutorial.notes.length) return { ok: false, error: `aucune note relevée dans ${tutorial.title}` };
    const from = Math.max(0, Number(args.start) || 0);
    const to = Number(args.end) > from ? Number(args.end) : tutorial.duration;
    const notes = tutorial.notes.filter((n) => n.start >= from && n.start < to);
    const segs = tutorial.segments.filter((s) => s.start >= from && s.start < to);
    const lines = compactTimeline(notes, segs, { maxLines: 60 });
    return { ok: true, content: `Tutoriel ${tutorial.id} — ${tutorial.title}\n${tutorial.key ? `Tonalité relevée : ${tutorial.key} ; ` : ''}durée ${clock(tutorial.duration)} ; extrait ${clock(from)}–${clock(to)} (mm:ss ; « MG | MD »).\n${lines.join('\n')}` };
  }
  return { ok: false, error: `élément inconnu : ${String(args?.id || '').slice(0, 60)} (utilise un identifiant du catalogue)` };
}

// ── Combinaison ───────────────────────────────────────────────────────────

/** Événements en secondes d'un exercice, dans une tonalité, à un tempo, une main ou deux. */
function exercisePart(entry, part, commonTempo) {
  const keyPc = keyPcOf(part.key) ?? writtenKeyOf(entry);
  const chords = exerciseChords(entry, keyPc);
  if (!chords) return { error: `${entry.name} n'est pas constructible en ${NAMES[keyPc]}` };
  const demo = buildDemo(chords, 'gospel');
  const written = exerciseTempo(entry);
  const speed = Number(part.speed) > 0 ? Math.max(0.5, Math.min(1.5, Number(part.speed))) : null;
  const tempo = Math.round(Number(part.tempo) > 0 ? Number(part.tempo) : commonTempo || written * (speed || 1));
  const perBeat = 60 / Math.max(30, Math.min(220, tempo));
  const events = (demo?.events || []).filter((e) => e.type === 'noteOn' || e.type === 'noteOff')
    .map((e) => ({ ...e, time: e.time * perBeat }));
  return {
    events, length: (demo?.beats || 0) * perBeat,
    label: `${entry.name} (${NAMES[keyPc]}${keyPc !== writtenKeyOf(entry) ? `, transposé depuis ${NAMES[writtenKeyOf(entry)]}` : ''}, ${tempo} à la noire)`,
    chords: dedupe(chords.map((c) => c.name)), tempo,
  };
}

/** Événements en secondes d'un passage de tutoriel (relevé), transposé, ralenti ou accéléré. */
function tutorialPart(tutorial, part) {
  if (!tutorial.notes.length) return { error: `aucune note relevée dans « ${tutorial.title} »` };
  const start = Math.max(0, Number(part.start) || 0);
  const end = Number(part.end) > start ? Math.min(Number(part.end), start + 60) : Math.min(tutorial.duration, start + 16);
  const semitones = part.key && tutorial.key ? transposeInterval(tutorial.key, part.key) : Math.round(Number(part.transpose) || 0);
  const hand = part.hand === 'left' ? 'lh' : part.hand === 'right' ? 'rh' : null;
  const ex = passageExample(tutorial.notes, { start, end, hand, semitones });
  if (!ex) return { error: `pas de notes relevées entre ${clock(start)} et ${clock(end)} dans « ${tutorial.title} »` };
  const speed = Number(part.speed) > 0 ? Math.max(0.5, Math.min(1.5, Number(part.speed))) : 1;
  const scale = (ex.tempo ? 60 / ex.tempo : 1) / speed;
  const events = ex.events.map((e) => ({ ...e, time: e.time * scale, ...(Number.isFinite(e.withoutPedalAt) ? { withoutPedalAt: e.withoutPedalAt * scale } : {}) }));
  const label = `${tutorial.title} ${clock(start)}–${clock(end)}${semitones ? ` (transposé de ${semitones > 0 ? '+' : ''}${semitones} demi-ton${Math.abs(semitones) > 1 ? 's' : ''})` : ''}${speed !== 1 ? ` ×${speed}` : ''}`;
  return { events, length: Math.max(...events.map((e) => e.time)), label };
}

/**
 * Assemble des morceaux de la bibliothèque (`combine_library`).
 * mode « chain » : bout à bout ; « overlay » : ensemble (chacun peut être répété pour couvrir le plus long).
 * @returns {{example: object|null, note: string, summary: string}}
 */
export function combineLibrary(rawArgs, tutorials = []) {
  let args = rawArgs;
  if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch (_) { args = {}; } }
  const mode = args?.mode === 'overlay' ? 'overlay' : 'chain';
  const parts = (Array.isArray(args?.parts) ? args.parts : []).slice(0, MAX_PARTS);
  if (!parts.length) return { example: null, note: '_(Combinaison vide : aucun élément de la bibliothèque demandé.)_', summary: 'aucun élément' };
  // Superposer des exercices : même tempo pour tous (celui demandé, sinon celui du premier).
  const firstExercise = parts.map((p) => exerciseEntry(p?.id)).find(Boolean);
  const commonTempo = Number(args.tempo) > 0 ? Number(args.tempo) : mode === 'overlay' && firstExercise ? exerciseTempo(firstExercise) : null;
  // [Claude] — 2026-11-12 — Sans tonalité précisée, tout prend celle du premier élément : le modèle
  // annonçait « les deux sont en La mineur » alors que le Montuno restait en Do (essai réel).
  const firstPart = findItem(parts[0]?.id, tutorials);
  const sharedKey = parts[0]?.key || (firstPart.exercise ? NAMES[writtenKeyOf(firstPart.exercise)] : firstPart.tutorial?.key) || null;
  const built = [];
  const problems = [];
  for (const raw of parts) {
    const part = raw?.key || !sharedKey ? raw : { ...raw, key: sharedKey };
    const { exercise, tutorial } = findItem(part?.id, tutorials);
    const made = exercise ? exercisePart(exercise, part, commonTempo) : tutorial ? tutorialPart(tutorial, part) : { error: `élément inconnu « ${String(part?.id || '').slice(0, 60)} »` };
    if (made.error) { problems.push(made.error); continue; }
    // Une main seulement (les exercices notent la main de chaque note).
    if (exercise && (part.hand === 'left' || part.hand === 'right')) {
      const keep = part.hand === 'left' ? 'lh' : 'rh';
      made.events = made.events.filter((e) => (e.hand || 'rh') === keep);
      made.label += part.hand === 'left' ? ', main gauche' : ', main droite';
    }
    if (!made.events.some((e) => e.type === 'noteOn')) { problems.push(`${made.label} : aucune note pour cette main`); continue; }
    made.repeat = Math.max(1, Math.min(8, Math.round(Number(part.repeat) || 1)));
    made.at = Math.max(0, Math.min(120, Number(part.at) || 0));
    built.push(made);
  }
  if (!built.length) return { example: null, note: `_(Je n'ai rien pu assembler : ${problems.join(' ; ')}.)_`, summary: problems.join(' ; ') };

  const events = [];
  let cursor = 0;
  const longest = Math.max(...built.map((b) => b.length * b.repeat));
  for (const b of built) {
    const at = mode === 'chain' ? cursor : Math.max(0, Number(b.at) || 0);
    // En superposition, un morceau plus court est répété (au plus 8 fois) pour couvrir le plus long, si demandé.
    const times = b.repeat;
    for (let r = 0; r < times; r += 1) {
      const offset = at + r * b.length;
      if (offset >= MAX_SECONDS) break;
      for (const e of b.events) {
        const time = e.time + offset;
        if (time > MAX_SECONDS + 4) continue;
        events.push({ ...e, time, ...(Number.isFinite(e.withoutPedalAt) ? { withoutPedalAt: e.withoutPedalAt + offset } : {}) });
      }
    }
    if (mode === 'chain') cursor = at + b.length * times + 0.15;
  }
  // À temps égal : relâchements d'abord, puis attaques.
  const order = { noteOff: 0, noteOn: 1 };
  events.sort((a, b) => a.time - b.time || (order[a.type] ?? 2) - (order[b.type] ?? 2));
  const ons = events.filter((e) => e.type === 'noteOn');
  // Superposition de deux morceaux aux deux mains : plus de dix doigts, dit franchement.
  let crowded = false;
  if (mode === 'overlay') {
    const active = new Map();
    for (const e of events) {
      if (e.type === 'noteOn') active.set(e.note, (active.get(e.note) || 0) + 1);
      else if (e.type === 'noteOff') active.set(e.note, Math.max(0, (active.get(e.note) || 1) - 1));
      if ([...active.values()].filter(Boolean).length > 10) { crowded = true; break; }
    }
  }
  const join = mode === 'chain' ? ' → ' : ' + ';
  const title = built.map((b) => b.label.replace(/\s*\(.*$/, '')).join(join).slice(0, 120);
  const subtitle = `${mode === 'chain' ? 'Enchaînés' : 'Superposés'} depuis la bibliothèque : ${built.map((b) => `${b.label}${b.repeat > 1 ? ` ×${b.repeat}` : ''}`).join(' ; ')}${crowded ? ' · plus de dix notes ensemble : à écouter, pas jouable seul à deux mains' : ''}`;
  const example = {
    kind: 'library', title, subtitle, style: null, tempo: 60, events,
    beats: Math.max(...events.map((e) => e.time), longest), chords: [],
    source: { kind: 'bibliothèque', mode, parts: built.map((b) => b.label), request: { mode, parts: parts.map((p) => ({ ...p })), ...(Number(args.tempo) > 0 ? { tempo: Number(args.tempo) } : {}) } },
  };
  const summary = `${mode === 'chain' ? 'Enchaînement' : 'Superposition'} de ${built.length} élément(s), ${Math.round(example.beats)} s, ${ons.length} notes : ${built.map((b) => `${b.label}${b.chords ? ` [${b.chords.slice(0, 10).join(' ')}]` : ''}`).join(' ; ')}${problems.length ? ` — non retenus : ${problems.join(' ; ')}` : ''}${crowded ? ' — plus de dix notes ensemble' : ''}`;
  const note = problems.length ? `_(Non retenu : ${problems.join(' ; ')}.)_` : '';
  return { example, note, summary };
}

// ── Demande en toutes lettres ─────────────────────────────────────────────

const plainText = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[’']/g, "'").replace(/[·•–—→>|«»"“”]/g, ' ').replace(/[^a-z0-9#' ]+/g, ' ').replace(/\s+/g, ' ').trim();

function mentionAt(text, phrase) {
  const p = plainText(phrase);
  if (p.length < 4) return -1;
  const re = new RegExp(`(?:^| )${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?= |$)`);
  const m = re.exec(text);
  return m ? m.index : -1;
}

/**
 * Les éléments de la bibliothèque nommés dans la phrase du pianiste, dans l'ordre où il les dit
 * (« joue le Lick 1 puis enchaîne avec le Montuno mineur »). Sert quand le modèle n'a pas appelé
 * combine_library : l'application monte alors la combinaison demandée, jamais un lick générique.
 * @returns {{mode: 'chain'|'overlay', key: string|null, parts: object[]}|null}
 */
export function libraryPartsFromText(message, tutorials = []) {
  const text = plainText(message);
  if (!text) return null;
  const found = [];
  for (const m of movementsLibrary.movements) {
    const short = m.name.split(' · ')[0];
    // Premier mot assez parlant et propre à cet exercice (« Turnaround », « Suspension »).
    const head = plainText(m.name).split(' ')[0];
    const own = head.length >= 8 && movementsLibrary.movements.filter((o) => plainText(o.name).split(' ')[0] === head).length === 1 ? head : '';
    const at = [m.name, m.id, short.length >= 6 ? short : '', own, ...(m.aliases || [])].map((n) => mentionAt(text, n)).filter((i) => i >= 0);
    if (at.length) found.push({ id: m.id, at: Math.min(...at), length: plainText(m.name).length });
  }
  for (const t of tutorials) {
    const words = plainText(t.title).split(' ');
    const at = [t.title, words.slice(0, 4).join(' ')].map((n) => mentionAt(text, n)).filter((i) => i >= 0);
    if (at.length && t.notes.length) found.push({ id: t.id, at: Math.min(...at), length: t.title.length });
  }
  // « Lick 1 » ne doit pas aussi compter « Lick 1 · octaves… » deux fois, ni un nom inclus dans un autre.
  found.sort((a, b) => a.at - b.at || b.length - a.length);
  const parts = [];
  for (const f of found) if (!parts.some((p) => p.id === f.id)) parts.push(f);
  if (!parts.length) return null;
  const overlay = /superpos|en meme temps|par dessus|ensemble/.test(text);
  for (const p of parts) {
    const before = text.slice(Math.max(0, p.at - 30), p.at);
    if (/main droite d/.test(before)) p.hand = 'right';
    else if (/main gauche d/.test(before)) p.hand = 'left';
  }
  const keyWord = /(?:^| )en (do|re|mi|fa|sol|la|si|[a-g])( ?(?:#|b|diese|bemol))?( mineur| majeur|m)?(?= |$)/.exec(text);
  return {
    mode: overlay ? 'overlay' : 'chain',
    key: keyWord ? `${keyWord[1]}${(keyWord[2] || '').trim().replace('diese', '#').replace('bemol', 'b')}` : null,
    parts: parts.slice(0, MAX_PARTS).map(({ id, hand }) => ({ id, ...(hand ? { hand } : {}) })),
  };
}

/** Tempo demandé en toutes lettres (« tempo de 170 », « à 120 à la noire », « 90 bpm »). */
export function tempoFromText(message) {
  const text = plainText(message);
  const m = /tempo (?:de |a |à )?(\d{2,3})|(\d{2,3}) (?:a la noire|bpm|a la blanche)|(?:^| )a (\d{2,3})(?: |$)/.exec(text);
  const n = Number(m?.[1] || m?.[2] || m?.[3]);
  return n >= 40 && n <= 260 ? n : null;
}

// « Joue-les », « essaie », « fais-le-moi entendre », « rejoue » : la combinaison dont on parlait.
const REFERS_BACK = /\b(?:les|les deux|l'enchainement|la combinaison|enchain\w*|combin\w*|essai\w*|essay\w*|rejou\w*|refai\w*|fais.le|joue.les|entendre|ecouter|recommence\w*)\b/;
const NAMES_A_CHORD = /\b[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|°|ø)?\d{0,2}\b(?! (?:mineur|majeur))/;

/**
 * Arguments de combine_library pour une demande en toutes lettres. Si la phrase ne nomme rien
 * (« Joue-les en La mineur, enchaînés », « essaie au moins », « fais-le-moi entendre »), on reprend
 * la dernière combinaison (`previous`) ou les éléments nommés plus haut (`recent`, du plus récent
 * au plus ancien) ; la tonalité et le tempo dits en cours de route s'appliquent.
 * @param {{previous?: {mode: string, parts: object[], tempo?: number}|null, recent?: string[]}} [history]
 */
export function libraryRequestCall(message, tutorials = [], { previous = null, recent = [] } = {}) {
  let asked = libraryPartsFromText(message, tutorials);
  const text = plainText(message);
  let tempo = tempoFromText(message);
  if (!asked && REFERS_BACK.test(text) && !NAMES_A_CHORD.test(String(message || '').replace(/\b(?:La|Do|Ré|Re|Mi|Fa|Sol|Si)\b/g, ''))) {
    const named = recent.map((t) => libraryPartsFromText(t, tutorials)).find(Boolean);
    const base = previous?.parts?.length ? { mode: previous.mode === 'overlay' ? 'overlay' : 'chain', key: null, parts: previous.parts.map(({ key, ...p }) => p), prevKey: previous.parts[0]?.key || null } : named;
    if (!base) return null;
    const keyNow = libraryPartsFromText(`x ${message}`, [])?.key || /(?:^| )en (do|re|mi|fa|sol|la|si|[a-g])( ?(?:#|b|diese|bemol))?( mineur| majeur|m)?(?= |$)/.exec(text)?.slice(1, 3).join('') || null;
    asked = { ...base, key: keyNow || base.key || base.prevKey || recent.map((t) => libraryPartsFromText(t, tutorials)?.key).find(Boolean) || null };
    tempo = tempo || previous?.tempo || recent.map(tempoFromText).find(Boolean) || null;
  }
  if (!asked) return null;
  const first = exerciseEntry(asked.parts[0].id);
  const firstTuto = tutorials.find((t) => t.id === asked.parts[0].id);
  const key = asked.key || (first ? NAMES[writtenKeyOf(first)] : firstTuto?.key) || null;
  const moved = asked.parts.filter((p) => { const e = exerciseEntry(p.id); return e && key && writtenKeyOf(e) !== keyPcOf(key); });
  const parts = asked.parts.map((p) => ({ ...p, ...(key ? { key } : {}) }));
  const names = parts.map((p) => exerciseEntry(p.id)?.name || tutorials.find((t) => t.id === p.id)?.title || p.id);
  const keyName = key && keyPcOf(key) != null ? NAMES[keyPcOf(key)] : key;
  const said = `${asked.mode === 'overlay' ? 'Voici, superposés' : names.length > 1 ? 'Voici, enchaînés' : 'Voici'} : ${names.join(asked.mode === 'overlay' ? ' + ' : ' → ')}, avec les notes de la bibliothèque${tempo ? `, à ${tempo} à la noire` : ''}.${moved.length && keyName ? ` Tout est en ${keyName} : ${moved.map((p) => exerciseEntry(p.id).name).join(', ')} ${moved.length > 1 ? 'sont transposés depuis leur tonalité écrite' : 'est transposé depuis sa tonalité écrite'}.` : ''}`;
  return { call: { function: { name: 'combine_library', arguments: JSON.stringify({ mode: asked.mode, parts, ...(tempo ? { tempo } : {}) }) } }, text: said };
}

export const CONSULT_LIBRARY_TOOL = {
  type: 'function',
  function: {
    name: 'consult_library',
    description: 'Détail d\'un élément de la bibliothèque (identifiant du catalogue) : pour un exercice, ses accords et les notes de chaque main dans la tonalité demandée ; pour un tutoriel, la chronologie relevée (accords et notes, mm:ss) entre deux instants. À utiliser avant de combiner, pour choisir ce qui va ensemble.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', description: 'Identifiant du catalogue (ex. « latin-ellen-lick-3 », « study-turnaround », « tuto-04028adb »).' },
        key: { type: 'string', description: 'Exercice : tonalité voulue (« D », « Ré », « Am »). Par défaut, celle où il est écrit.' },
        start: { type: 'number', description: 'Tutoriel : début de l\'extrait, en secondes.' },
        end: { type: 'number', description: 'Tutoriel : fin de l\'extrait, en secondes.' },
      },
      required: ['id'],
    },
  },
};

export const COMBINE_LIBRARY_TOOL = {
  type: 'function',
  function: {
    name: 'combine_library',
    description: 'Assemble des éléments de la bibliothèque (exercices et tutoriels relevés) et prépare un exemple sous ta réponse (Écouter). mode « chain » : bout à bout ; « overlay » : ensemble (ex. la main droite du Lick 3 sur la main gauche du II–V–I). Chaque élément peut être transposé (key), mis à un tempo (tempo) ou ralenti (speed), réduit à une main (hand), répété (repeat) ; pour un tutoriel, choisis l\'extrait (start, end en secondes, 60 s au plus). Les notes viennent des sources : ne prétends pas avoir ajouté ce que l\'outil ne fait pas (pas de nouvelle note, pas d\'ornement inventé).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['chain', 'overlay'], description: 'chain : enchaîner ; overlay : superposer.' },
        tempo: { type: 'number', description: 'Tempo commun des exercices, à la noire (superposition : celui du premier exercice par défaut).' },
        parts: {
          type: 'array', maxItems: MAX_PARTS,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Identifiant du catalogue.' },
              key: { type: 'string', description: 'Tonalité voulue (« D », « Ré mineur »…). Sans elle, l\'élément prend la tonalité du premier élément.' },
              hand: { type: 'string', enum: ['both', 'left', 'right'], description: 'Les deux mains (défaut), la gauche ou la droite.' },
              tempo: { type: 'number', description: 'Exercice : tempo de cet élément, à la noire.' },
              speed: { type: 'number', description: 'Vitesse relative, de 0.5 à 1.5.' },
              start: { type: 'number', description: 'Tutoriel : début de l\'extrait, en secondes.' },
              end: { type: 'number', description: 'Tutoriel : fin de l\'extrait, en secondes.' },
              repeat: { type: 'integer', description: 'Nombre de fois (1 à 8).' },
              at: { type: 'number', description: 'Superposition : départ de cet élément, en secondes après le début.' },
            },
            required: ['id'],
          },
        },
      },
      required: ['parts'],
    },
  },
};

export const LIBRARY_GUIDANCE = `## Bibliothèque de l'application (exercices et tutoriels)
Tu peux puiser dans toute la bibliothèque ci-dessous pour réutiliser son contenu et faire des combinaisons : enchaîner des éléments, les superposer (une main de l'un, une main de l'autre), les transposer dans une autre tonalité, les mettre au même tempo. consult_library donne le détail d'un élément ; combine_library prépare l'exemple à écouter. Dès que le pianiste demande d'entendre un ou plusieurs éléments de la bibliothèque (« joue le Lick 1 puis le montuno »), appelle combine_library : ne dis jamais que tu ne peux pas les faire entendre. Pour que des éléments aillent ensemble, mets-les dans la même tonalité et le même tempo, et dis pourquoi ils se marient (accords communs, même fonction). Nomme les éléments par leur nom, jamais par leur identifiant. Les notes viennent des sources : l'application ne compose rien.`;
