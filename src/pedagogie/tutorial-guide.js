// [Claude] — 2026-10-14 — Pédagogie IA : le GUIDE d'un tuto — ses étapes, le résultat final une
// fois tout assemblé, et les mouvements harmoniques qu'il montre.
//
// Narcisse : « les tutoriels sont conçus pour expliquer chaque note au fur et à mesure. Parfois, le
// pianiste ne joue pas le résultat final d'un seul bloc […]. Ce que je veux, c'est que Copilot
// reconstitue le résultat final à partir des explications du pianiste » ; « identifier les passages
// clés […] en précisant ce que chaque partie explique ; regrouper toutes ces explications pour donner
// un rendu final […] ; repérer les mouvements harmoniques (aller du 1er au 6e degré…) et savoir si le
// tuto le montre ». Et surtout : « ces mouvements ne doivent pas être inventés : ils doivent provenir
// directement du tuto ».
//
// Tout est calculé ici, de façon déterministe, d'après ce que l'application a relevé (la grille des
// accords et les notes du prof) ; le Copilote l'explique, il ne l'invente pas.
//   1. MOMENTS : chaque accord relevé, avec ses notes ;
//   2. MAINS : un moment est « les deux mains » s'il porte un voicing complet (cinq notes au moins,
//      un accord nommé) ; une main seule s'il est contenu dans un voicing complet du tuto — sa partie
//      basse (il en a la note la plus grave) = main gauche, sa partie haute = main droite (« Next
//      Level Worship » : la main gauche Sol♭2 Ré♭3 Fa3 montrée seule est le bas de Sol♭maj9) ; à
//      défaut, d'après le registre. Une ou deux notes à la fois : une ligne (mélodie, notes du dessus) ;
//   3. ÉTAPES : les moments qui se suivent avec les mêmes mains forment une étape ; un long silence
//      (il parle) en est une aussi ;
//   4. PARTIES : une nouvelle tonalité ouvre une partie (« la même chose en Ré♭ ») ; dans chaque
//      partie, la progression (la boucle) ;
//   5. RÉSULTAT FINAL de chaque partie : le passage où il joue toute la progression des deux mains,
//      s'il existe (« Together ») ; sinon ASSEMBLÉ : pour chaque accord de la boucle, sa main gauche
//      (montrée seule) + sa main droite (montrée seule) — une hypothèse, dite comme telle ;
//   6. MOUVEMENTS : d'un accord de la boucle au suivant, avec ce qui se passe entre les deux (accords
//      de passage, lick, ligne qui y mène), avec les moments où le tuto le montre.
//
// Module pur, testé par test-tutorial-guide.js.

import { harmonicTokens, structureKey, keyName, degreeLabel, respell, songStructure } from './song-structure.js';
import { parseChordName } from './note-roles.js';
import { chordFamily, chordsExample } from './tutorial-transfer.js';
import { passageExample, transposeInterval } from './teacher-notes.js';
import { chordToneIntervals } from '../practice-exercise.js';
import { availableTensions } from './note-roles.js';

export const GUIDE_VERSION = 2;
/** Un voicing complet : au moins ceci de notes (deux mains). */
const FULL_MIN_NOTES = 5;
/** … et au moins cet écart entre la plus grave et la plus aiguë (demi-tons). */
const FULL_MIN_SPAN = 10;
/** Un silence plus long coupe une étape (s). */
const GAP_BREAK = 2.5;
/** Un silence plus long devient une étape « il explique » (s). */
const TALK_MIN = 4;
/** Une étape plus brève est rattachée à sa voisine (s). */
const MIN_STEP = 2.5;
/** Une nouvelle tonalité doit tenir au moins ceci pour ouvrir une partie (accords ou secondes). */
const KEY_CHANGE_CHORDS = 3;
const KEY_CHANGE_SECONDS = 6;
/** Une partie doit compter au moins ceci de jeu des deux mains (s), sinon elle rejoint sa voisine. */
const MIN_PART_SECONDS = 12;

const pcOf = (n) => ((n % 12) + 12) % 12;
const round2 = (x) => Math.round(x * 100) / 100;
const uniq = (list) => [...new Set(list)];
const sortNum = (list) => [...list].sort((a, b) => a - b);

export const clock = (t) => {
  const s = Math.max(0, Math.floor((Number(t) || 0) + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const NOTE_FR = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const NOTE_FR_SHARP = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
/** « Mi♭3 » (Do4 = Do central). */
export function noteFr(midi, { flats = true } = {}) {
  return `${(flats ? NOTE_FR : NOTE_FR_SHARP)[pcOf(midi)]}${Math.floor(midi / 12) - 1}`;
}

// ── 1. Moments ────────────────────────────────────────────────────────────────

/** Les accords relevés, chacun avec ses notes (celles du segment, sinon celles attaquées dedans). */
export function guideMoments(segments, notes = []) {
  const heard = (notes || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start));
  return (segments || [])
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
    .map((s) => {
      const own = Array.isArray(s.midis) && s.midis.length ? s.midis : heard.filter((n) => n.start >= s.start - 0.05 && n.start < s.end).map((n) => n.midi);
      return {
        start: round2(s.start),
        end: round2(s.end),
        label: s.chord?.resolved ? s.chord.label : (s.label || null),
        midis: sortNum(uniq(own.map((m) => Math.round(m)))),
      };
    })
    .filter((m) => m.midis.length)
    .sort((a, b) => a.start - b.start);
}

// ── 2. Mains ──────────────────────────────────────────────────────────────────

/** Deux écarts au-dessus de la basse « de même rôle » : égaux, ou deux septièmes (10 / 11), deux tierces (3 / 4). */
function sameShapeStep(a, b) {
  if (a === b) return true;
  const pair = (x, y) => (a === x && b === y) || (a === y && b === x);
  return pair(10, 11) || pair(22, 23) || pair(3, 4) || pair(15, 16);
}

/** Les formes de main gauche montrées seules (écarts au-dessus de la basse), les plus fréquentes d'abord. */
export function leftHandShapes(moments) {
  const count = new Map();
  for (const m of moments) {
    if (m.hand !== 'lh' || m.midis.length < 2 || !m.partOf) continue;
    const shape = m.midis.map((x) => x - m.midis[0]);
    const key = shape.join(',');
    count.set(key, { shape, n: (count.get(key)?.n || 0) + 1 });
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.shape.length - a.shape.length).map((x) => x.shape);
}

const isFull = (m) => m.label && m.midis.length >= FULL_MIN_NOTES && m.midis[m.midis.length - 1] - m.midis[0] >= FULL_MIN_SPAN;

/** Toutes les notes de `part` sont dans `whole` (une de travers tolérée à partir de quatre notes). */
function containedIn(part, whole) {
  const set = new Set(whole);
  const missing = part.filter((m) => !set.has(m)).length;
  return missing === 0 || (part.length >= 4 && missing === 1);
}

/** La plus grande coupure (une quinte au moins) sépare les mains d'un voicing ; sinon la basse seule. */
export function splitVoicing(midis) {
  const sorted = sortNum(uniq(midis));
  let cut = -1;
  let widest = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > widest) { widest = gap; cut = i; }
  }
  if (sorted.length >= 3 && widest >= 5 && cut > 0) return { lh: sorted.slice(0, cut), rh: sorted.slice(cut) };
  return { lh: sorted.slice(0, 1), rh: sorted.slice(1) };
}

/**
 * Les mains d'un voicing complet : la main gauche montrée seule par le prof, si elle en est le bas
 * (« Next Level Worship » : Sol♭2 Ré♭3 Fa3 sous Sol♭maj9) ; sinon la coupure la plus large, la
 * main gauche gardant trois notes au plus, dans l'octave et demie au-dessus de la basse.
 */
export function voicingHands(midis, moments = [], lhShapes = []) {
  const sorted = sortNum(uniq(midis));
  // La main gauche montrée seule doit être le BAS du voicing (ses notes, puis celles de la droite).
  const shown = moments
    .filter((m) => m.hand === 'lh' && m.midis.length >= 2 && m.midis.length <= sorted.length - 2 && m.midis.every((x, k) => x === sorted[k]))
    .sort((a, b) => b.midis.length - a.midis.length)[0];
  if (shown) return { lh: [...shown.midis], rh: sorted.slice(shown.midis.length), shown: true };
  // Sinon, la forme de main gauche qu'il montre ailleurs dans le tuto (fondamentale – quinte –
  // septième sous Sol♭maj9, Si♭m9, Ré♭maj9 : la même sous Mi♭m9), si ce voicing la contient.
  for (const shape of lhShapes) {
    const k = shape.length;
    const bottom = sorted.slice(0, k);
    if (sorted.length - k < 2) continue;
    if (bottom.every((x, i) => sameShapeStep(x - sorted[0], shape[i]))) return { lh: bottom, rh: sorted.slice(k), shape: true };
  }
  const split = splitVoicing(sorted);
  if (split.lh.length <= 3 && split.lh[split.lh.length - 1] - sorted[0] <= 19) return split;
  const lh = sorted.filter((x) => x - sorted[0] <= 12).slice(0, 3);
  return { lh, rh: sorted.filter((x) => !lh.includes(x)) };
}

/**
 * Les mains de chaque moment : 'both', 'lh', 'rh' ou 'line'. Un moment contenu dans un voicing
 * complet du tuto en garde la référence (`partOf`).
 */
export function assignHands(moments) {
  const fulls = moments.filter(isFull);
  for (const m of moments) {
    if (isFull(m)) { m.hand = 'both'; continue; }
    const pcs = uniq(m.midis.map(pcOf));
    // Une ou deux classes de hauteur : une ligne (mélodie, notes du dessus), ou une basse seule.
    const host = fulls
      .filter((f) => f !== m && f.midis.length >= m.midis.length + 2 && containedIn(m.midis, f.midis))
      .sort((a, b) => Math.abs(a.start - m.start) - Math.abs(b.start - m.start))[0];
    if (host && m.midis.length >= 2) {
      m.partOf = host;
      const low = host.midis[0];
      const high = host.midis[host.midis.length - 1];
      if (m.midis[0] === low) m.hand = 'lh';
      else if (m.midis.includes(high) || m.midis[0] > host.midis[Math.floor(host.midis.length / 2)]) m.hand = 'rh';
      else m.hand = 'rh';
      continue;
    }
    if (pcs.length <= 2) {
      m.hand = m.midis[m.midis.length - 1] < 55 ? 'lh' : 'line';
      continue;
    }
    const split = splitVoicing(m.midis);
    if (split.lh.length && split.rh.length >= 2 && split.rh[0] - split.lh[split.lh.length - 1] >= 7) m.hand = 'both';
    else if (m.midis[m.midis.length - 1] <= 59) m.hand = 'lh';
    else m.hand = 'rh';
  }
  return moments;
}

// ── 3. Étapes ─────────────────────────────────────────────────────────────────

/** Les moments qui se suivent avec les mêmes mains forment une étape ; un long silence aussi. */
export function buildSteps(moments, { transcript = [], duration = null } = {}) {
  const steps = [];
  for (const m of moments) {
    const cur = steps[steps.length - 1];
    // Un voicing complet qui sort franchement des notes entendues jusque-là (deux notes au moins
    // hors de ce qui précède, après quatre accords) : la tonalité change, l'étape aussi (« la même
    // chose en Ré♭ » enchaînée sans pause après la version en Do).
    const outside = cur && cur.kind === 'both' && m.hand === 'both' && cur.moments.length >= 4
      && uniq(m.midis.map(pcOf)).filter((pc) => !cur.pcs.has(pc)).length >= 2;
    if (cur && cur.kind === m.hand && m.start - cur.end <= GAP_BREAK && !outside) {
      cur.moments.push(m);
      cur.end = Math.max(cur.end, m.end);
      for (const x of m.midis) cur.pcs.add(pcOf(x));
    } else {
      steps.push({ kind: m.hand, start: m.start, end: m.end, moments: [m], pcs: new Set(m.midis.map(pcOf)), keyBreak: Boolean(outside) });
    }
  }
  // Une étape trop brève (un accord isolé) rejoint sa voisine la plus proche, si elle la touche.
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      if (s.end - s.start >= MIN_STEP || s.moments.length > 1 || steps.length < 2) continue;
      const prev = steps[i - 1];
      const next = steps[i + 1];
      const dPrev = prev ? s.start - prev.end : Infinity;
      const dNext = next ? next.start - s.end : Infinity;
      // Pas par-dessus un changement de tonalité.
      const okPrev = prev && !s.keyBreak;
      const okNext = next && !next.keyBreak;
      const into = okPrev && (!okNext || dPrev <= dNext) ? prev : okNext ? next : null;
      if (!into || (into === prev ? dPrev : dNext) > GAP_BREAK) continue;
      if (into === next) into.keyBreak = Boolean(s.keyBreak);
      into.moments.push(...s.moments);
      into.moments.sort((a, b) => a.start - b.start);
      into.start = Math.min(into.start, s.start);
      into.end = Math.max(into.end, s.end);
      steps.splice(i, 1);
      changed = true;
      break;
    }
  }
  // Des étapes très brèves qui se suivent (quelques secondes chacune : il montre un détail, puis un
  // autre) n'en font qu'une, nommée d'après les mains qui y jouent le plus longtemps.
  for (let i = steps.length - 1; i > 0; i -= 1) {
    const a = steps[i - 1];
    const b = steps[i];
    const brief = (x) => x.end - x.start < 2 * MIN_STEP && x.kind !== 'both';
    if (!(brief(a) && brief(b)) || b.start - a.end > GAP_BREAK || b.keyBreak) continue;
    const kind = (b.end - b.start) > (a.end - a.start) ? b.kind : a.kind;
    a.moments.push(...b.moments);
    a.end = Math.max(a.end, b.end);
    a.kind = kind;
    steps.splice(i, 1);
  }
  // Deux étapes voisines de même nature (rapprochées par la fusion) n'en font qu'une.
  for (let i = steps.length - 1; i > 0; i -= 1) {
    if (steps[i].kind === steps[i - 1].kind && steps[i].start - steps[i - 1].end <= GAP_BREAK && !steps[i].keyBreak) {
      steps[i - 1].moments.push(...steps[i].moments);
      steps[i - 1].end = Math.max(steps[i - 1].end, steps[i].end);
      steps.splice(i, 1);
    }
  }
  // Les silences : il explique (ou la vidéo montre autre chose).
  const out = [];
  const lines = (transcript || []).filter((l) => Number.isFinite(l?.start) && String(l.text || '').trim());
  // [Claude] — 2026-10-16 — « Il parle » ne se déduit PAS d'un silence de notes : seulement de la parole
  // transcrite. Sans parole, rien n'est relevé (il peut jouer sans que l'image le montre) : étape « quiet ».
  // Narcisse : le Copilote disait « il explique » entre 0 et 20 s d'une vidéo où il joue sans parler.
  const talk = (start, end) => {
    const said = lines.filter((l) => l.start >= start - 0.5 && l.start < end).map((l) => String(l.text).trim());
    out.push({ kind: said.length ? 'talk' : 'quiet', start: round2(start), end: round2(end), moments: [], said });
  };
  let cursor = 0;
  for (const s of steps) {
    if (s.start - cursor >= TALK_MIN) talk(cursor, s.start);
    out.push(s);
    cursor = s.end;
  }
  if (Number.isFinite(duration) && duration - cursor >= TALK_MIN) talk(cursor, duration);
  // Ce qu'il dit pendant qu'il joue compte aussi (il commente souvent en jouant).
  for (const s of out) {
    if (s.kind === 'talk' || s.kind === 'quiet') continue;
    s.said = lines.filter((l) => l.start >= s.start - 0.5 && l.start < s.end).map((l) => String(l.text).trim());
  }
  return out;
}

// ── 4. Parties (tonalités) et progression ───────────────────────────────────

function chordsOfMoments(moments) {
  return moments.filter((m) => m.label).map((m) => ({ start: m.start, end: m.end, label: m.label }));
}

function keyOfSteps(steps) {
  const tokens = harmonicTokens(steps.flatMap((s) => chordsOfMoments(s.moments)));
  return tokens.length >= 2 ? structureKey(null, tokens) : null;
}

// Même armure : Do majeur et La mineur (ou Ré mineur pris pour la tonalité d'une boucle qui
// commence par Ré m) jouent les mêmes notes : ce n'est pas un changement de tonalité.
const signature = (k) => pcOf(k.rootPc - (k.minor ? 9 : 0));
const sameKey = (a, b) => a && b && signature(a) === signature(b);

/**
 * Les parties : une nouvelle tonalité (jouée des deux mains, assez longtemps) en ouvre une. On la
 * reconnaît à ses NOTES (deux classes de hauteur au moins jamais jouées des deux mains dans la
 * partie) plutôt qu'à une tonalité devinée : Ré m9 – Fa maj9 – La m7 – Do maj7, c'est encore Do.
 */
export function buildParts(steps) {
  const parts = [];
  let cur = null;
  for (const s of steps) {
    const both = s.kind === 'both';
    const pcs = both ? uniq(s.moments.flatMap((m) => m.midis.map(pcOf))) : [];
    const chords = both ? uniq(chordsOfMoments(s.moments).map((c) => c.label)).length : 0;
    const strong = both && (chords >= KEY_CHANGE_CHORDS || s.end - s.start >= KEY_CHANGE_SECONDS);
    const outside = cur && cur.pcs.size ? pcs.filter((pc) => !cur.pcs.has(pc)).length : 0;
    if (!cur || (strong && cur.pcs.size && outside >= 2)) {
      cur = { start: s.start, end: s.end, key: null, steps: [], pcs: new Set() };
      parts.push(cur);
    }
    if (both) for (const pc of pcs) cur.pcs.add(pc);
    cur.steps.push(s);
    cur.end = s.end;
  }
  // Une partie trop brève (un accord d'intro, une fin) rejoint sa voisine.
  for (let i = parts.length - 1; i >= 0 && parts.length > 1; i -= 1) {
    const p = parts[i];
    const playing = p.steps.filter((s) => s.kind === 'both').reduce((sum, s) => sum + (s.end - s.start), 0);
    if (playing >= MIN_PART_SECONDS) continue;
    const into = parts[i - 1] || parts[i + 1];
    if (into === parts[i - 1]) { into.steps.push(...p.steps); into.end = p.end; }
    else { into.steps.unshift(...p.steps); into.start = p.start; }
    for (const pc of p.pcs) into.pcs.add(pc);
    parts.splice(i, 1);
  }
  // La tonalité de chaque partie, sur tout ce qu'il y joue des deux mains (sinon tous ses accords,
  // sinon la voisine).
  parts.forEach((p, i) => {
    const both = p.steps.filter((s) => s.kind === 'both');
    p.key = (both.length ? keyOfSteps(both) : null) || p.key || keyOfSteps(p.steps) || parts[i - 1]?.key || parts[i + 1]?.key || { rootPc: 0, minor: false, flats: false, guessed: true };
  });
  return parts;
}

/** Degré d'un accord écrit dans la tonalité (« 2 », « 6 », « b7 », « 4(m) »). */
export function degreeIn(key, label) {
  const parsed = parseChordName(label);
  if (!parsed || !key) return null;
  const token = harmonicTokens([{ start: 0, end: 1, label }])[0];
  return degreeLabel(key, { rootPc: token?.rootPc ?? parsed.rootPc, family: token?.family ?? chordFamily(parsed.quality) });
}

/** Le degré nu : « 6(m) » → « 6 », « b7 » → « b7 ». */
export const bareDegree = (degree) => String(degree || '').replace(/\(.*\)$/, '');

/** La progression d'une partie : la boucle de ce qu'il joue des deux mains (sinon de tout). */
function partProgression(part) {
  const both = part.steps.filter((s) => s.kind === 'both');
  const chords = chordsOfMoments((both.length ? both : part.steps).flatMap((s) => s.moments));
  const structure = chords.length >= 2 ? songStructure({ chords }) : null;
  const loop = structure?.sections.find((s) => s.kind === 'loop');
  if (loop) {
    return {
      loop: true,
      chords: loop.pattern.map((x) => ({ name: respell(x.name, part.key), degree: degreeIn(part.key, x.name) || x.degree, pc: pcOf(part.key.rootPc + x.interval) })),
      secondsPerCycle: loop.secondsPerCycle,
      cycles: loop.cycles,
    };
  }
  // Pas de boucle : les accords principaux dans l'ordre (huit au plus, sans répétition voisine).
  const list = [];
  for (const c of chords) {
    const name = respell(c.label, part.key);
    const parsed = parseChordName(c.label);
    // Chaque accord une fois (même fondamentale, même genre) : la liste de ce qu'il joue, pas la grille.
    if (list.some((x) => x.pc === (parsed ? parsed.rootPc : null) && kindOfLabel(x.name) === kindOfLabel(c.label))) continue;
    list.push({ name, degree: degreeIn(part.key, c.label), pc: parsed ? parsed.rootPc : null });
  }
  return { loop: false, chords: list.slice(0, 8), secondsPerCycle: null, cycles: 0 };
}

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const KIND_OF = { major: 'M', dominant: 'M', sus: 'M', other: 'M', minor: 'm', halfdim: 'ø', dim: '°' };
const kindOfLabel = (label) => KIND_OF[chordFamily(parseChordName(label)?.quality || '')] || 'M';

/**
 * La progression de référence (`ref`, une boucle) jouée dans une autre partie, transposée ? On
 * cherche le décalage où chacun de ses accords (même fondamentale transposée, même genre) est joué
 * des deux mains dans la partie. Rend le décalage et, pour chaque accord, le nom le plus joué.
 */
function transposedLoop(part, ref) {
  const moments = part.steps.filter((s) => s.kind === 'both').flatMap((s) => s.moments).filter((m) => m.label);
  if (!moments.length || !ref.loop) return null;
  const slots = ref.chords.filter((c) => Number.isFinite(c.pc));
  let best = null;
  for (let offset = 0; offset < 12; offset += 1) {
    const names = slots.map((slot) => {
      const pc = pcOf(slot.pc + offset);
      const kind = kindOfLabel(slot.name);
      const here = moments.filter((m) => rootOf(m.label) === pc && kindOfLabel(m.label) === kind);
      if (!here.length) return null;
      const count = new Map();
      for (const m of here) count.set(m.label, (count.get(m.label) || 0) + (m.end - m.start));
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    });
    const found = names.filter(Boolean).length;
    if (found === slots.length && (!best || found > best.found)) best = { offset, names, found };
  }
  return best;
}

/**
 * Les progressions des parties, chaque tonalité lue de la même façon d'une partie à l'autre : la
 * même boucle jouée en Do puis en Ré♭ (« Next Level Worship ») est 2 – 4 – 6 – 1 les deux fois, et
 * pas 1 – 3 – 5 – b7 en Ré mineur parce qu'elle commence par Ré m, ou « pas de boucle » parce que
 * les tours en Do sont moins nets. La partie la plus longue dont on a trouvé la boucle sert de
 * référence ; une autre partie qui joue ses accords, transposés, prend la même lecture.
 */
function alignKeys(parts) {
  const progressions = parts.map((p) => partProgression(p));
  const order = parts.map((_, i) => i)
    .filter((i) => progressions[i].loop)
    .sort((a, b) => (parts[b].end - parts[b].start) - (parts[a].end - parts[a].start));
  const ref = order[0];
  if (ref == null) return progressions;
  const refKey = parts[ref].key;
  const refProg = progressions[ref];
  parts.forEach((p, i) => {
    if (i === ref) return;
    const match = transposedLoop(p, refProg);
    if (!match) return;
    const rootPc = pcOf(refKey.rootPc + match.offset);
    p.key = structureKey(`${KEY_NAMES[rootPc]}${refKey.minor ? 'm' : ''}`);
    progressions[i] = {
      loop: true,
      chords: refProg.chords.map((c, k) => ({ name: respell(match.names[k], p.key), degree: c.degree, pc: pcOf(c.pc + match.offset) })),
      secondsPerCycle: refProg.secondsPerCycle,
      cycles: 0,
      transposedFrom: parts[ref],
    };
  });
  return progressions;
}

// ── 5. Résultat final ─────────────────────────────────────────────────────────

const rootOf = (label) => parseChordName(label)?.rootPc ?? null;
/** Le moment joue-t-il cet accord de la progression (même fondamentale) ? */
const playsSlot = (m, slot) => m.label && rootOf(m.label) === slot.pc && kindOfLabel(m.label) === kindOfLabel(slot.name);

/** Le meilleur moment (le plus de notes) pour chaque accord de la progression, ou null. */
function bestPerSlot(moments, slots, accept = () => true) {
  return slots.map((slot) => {
    const here = moments.filter((m) => accept(m) && playsSlot(m, slot));
    // Le voicing qu'il rejoue le plus (même nom) ; à égalité, le premier (le dernier tour porte
    // souvent une fioriture de fin).
    const count = new Map();
    for (const m of here) count.set(m.label, (count.get(m.label) || 0) + 1);
    // Un renversement (C6/G : basse ≠ fondamentale) n'est pas l'accord de la progression.
    const root = (m) => (pcOf(m.midis[0]) === slot.pc ? 1 : 0);
    const named = (m) => (respell(m.label, slot.key || false) === slot.name || m.label === slot.name ? 1 : 0);
    return here.sort((a, b) => root(b) - root(a) || named(b) - named(a) || count.get(b.label) - count.get(a.label) || a.start - b.start)[0] || null;
  });
}

/** La main droite montrée seule qui va sur cet accord (toutes ses notes en sont des notes). */
function fitsChord(midis, slot) {
  const parsed = parseChordName(slot.name);
  if (!parsed) return false;
  const ok = new Set([...chordToneIntervals(parsed.quality), ...availableTensions(parsed.quality)]);
  return midis.every((m) => ok.has(pcOf(m - parsed.rootPc)));
}

/**
 * Le résultat final d'une partie.
 * @returns {null|{source: 'together'|'assembled', start?: number, end?: number, chords: object[], seconds: number, note?: string}}
 */
export function partFinal(part, progression) {
  const slots = progression.chords.filter((c) => Number.isFinite(c.pc));
  if (slots.length < 2) return null;
  const moments = part.steps.flatMap((s) => s.moments);
  const shapes = leftHandShapes(moments);
  // a. Le passage où il joue toute la progression des deux mains — le dernier (« Together »).
  const together = part.steps
    .filter((s) => s.kind === 'both')
    .filter((s) => slots.every((slot) => s.moments.some((m) => isFull(m) && playsSlot(m, slot))))
    .pop();
  const seconds = progression.secondsPerCycle && slots.length ? round2(progression.secondsPerCycle / slots.length) : 2;
  if (together) {
    const picks = bestPerSlot(together.moments, slots, isFull);
    return {
      source: 'together',
      start: together.start,
      end: together.end,
      seconds,
      chords: picks.map((m, i) => {
        const hands = voicingHands(m.midis, moments, shapes);
        return { name: respell(m.label, part.key), degree: slots[i].degree, midis: m.midis, lh: hands.lh, rh: hands.rh, at: m.start };
      }),
    };
  }
  // b. Assemblé : main gauche montrée seule + main droite montrée seule, accord par accord.
  const fullPicks = bestPerSlot(moments, slots, isFull);
  const chords = [];
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (fullPicks[i]) {
      const hands = voicingHands(fullPicks[i].midis, moments, shapes);
      chords.push({ name: respell(fullPicks[i].label, part.key), degree: slot.degree, midis: fullPicks[i].midis, lh: hands.lh, rh: hands.rh, at: fullPicks[i].start, from: { both: fullPicks[i].start } });
      continue;
    }
    const lh = moments
      .filter((m) => m.hand === 'lh' && pcOf(m.midis[0]) === slot.pc)
      .sort((a, b) => b.midis.length - a.midis.length)[0];
    const top = lh ? lh.midis[lh.midis.length - 1] : -Infinity;
    const rh = moments
      .filter((m) => m.hand === 'rh' && m.midis.length >= 2 && fitsChord(m.midis, slot) && m.midis[0] > top - 3)
      .sort((a, b) => b.midis.length - a.midis.length || a.start - b.start)[0];
    if (!lh && !rh) return null;
    const left = lh ? lh.midis : [];
    const right = rh ? rh.midis.filter((m) => !left.includes(m)) : [];
    chords.push({
      name: slot.name,
      degree: slot.degree,
      midis: sortNum(uniq([...left, ...right])),
      lh: left,
      rh: right,
      at: Math.min(lh ? lh.start : Infinity, rh ? rh.start : Infinity),
      from: { ...(lh ? { lh: lh.start } : {}), ...(rh ? { rh: rh.start } : {}) },
      partial: !lh || !rh,
    });
  }
  if (!chords.some((c) => c.lh.length && c.rh.length)) return null;
  return { source: 'assembled', seconds, chords, note: 'Le prof ne joue jamais toute la progression d\'un trait : chaque accord est réuni à partir des moments où il le montre (une main, puis l\'autre).' };
}

// ── 6. Mouvements ─────────────────────────────────────────────────────────────

const KIND_WORDS = {
  modulation: 'changement de tonalité',
  walkUp: 'basse qui monte',
  walkDown: 'basse qui descend',
  direct: 'enchaînement direct',
  passing: 'avec accord de passage',
  chromatic: 'chromatique',
  line: 'ligne qui y mène',
  lick: 'lick',
};

/** Les mouvements d'une partie : d'un accord principal au suivant, et ce qu'il y a entre les deux. */
export function partMovements(part, { notes = [], progression = null } = {}) {
  const tokens = partTokens(part, progression);
  if (tokens.length < 2) return [];
  const heard = (notes || []).filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start));
  const found = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const a = tokens[i];
    if (a.passing) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].passing) j += 1;
    const b = tokens[j];
    if (!b || b.start - a.end > GAP_BREAK + 1) continue;
    addMovement(found, { a, b, via: tokens.slice(i + 1, j), fromKey: part.key, toKey: part.key, heard });
  }
  return [...found.values()].sort((x, y) => x.times[0].start - y.times[0].start);
}

/**
 * Les accords joués des deux mains dans une partie, marqués `passing` quand ils ne portent pas la
 * progression : dans une boucle, ce qui n'est pas l'accord attendu au tour (C6/G entre Fmaj9 et
 * Am9 : la basse qui monte Fa – Sol – La) ; partout, ce qui est bref (moins de 45 % de la durée
 * habituelle).
 */
function partTokens(part, progression = null) {
  const moments = part.steps.filter((s) => s.kind === 'both').flatMap((s) => s.moments).filter((m) => m.label);
  const tokens = harmonicTokens(moments.map((m) => ({ start: m.start, end: m.end, label: m.label })));
  if (!tokens.length) return tokens;
  const durs = sortNum(tokens.map((t) => t.dur));
  const typical = durs[Math.floor(durs.length * 0.6)] || 1;
  const slots = progression?.loop ? progression.chords.filter((c) => Number.isFinite(c.pc)) : [];
  const slotOf = (t) => slots.findIndex((c) => c.pc === t.rootPc && (KIND_OF[t.family] || 'M') === kindOfLabel(c.name));
  let expected = null;
  for (const t of tokens) {
    t.passing = t.dur < 0.45 * typical;
    if (!slots.length || t.passing) continue;
    const k = slotOf(t);
    // Une basse qui n'est pas la fondamentale (renversement) entre deux accords de la boucle : de passage.
    const inverted = t.bassPc != null && t.bassPc !== t.rootPc;
    if (k < 0 || inverted) { t.passing = true; continue; }
    if (expected == null || k === expected || k === (expected + slots.length - 1) % slots.length) {
      // L'accord attendu (ou le même qui continue) : la boucle avance.
      expected = (k + 1) % slots.length;
      continue;
    }
    // Un autre accord de la boucle, hors de son tour : bref, il passe ; long, la boucle reprend là.
    if (t.dur < 0.8 * typical) t.passing = true;
    else expected = (k + 1) % slots.length;
  }
  return tokens;
}

/** Un mouvement de `a` à `b` (et ce qu'il y a entre les deux), ajouté à `found` (par degrés). */
function addMovement(found, { a, b, via, fromKey, toKey, heard, modulation = false }) {
  const fromDeg = degreeLabel(fromKey, a);
  const toDeg = degreeLabel(toKey, b);
  if (!modulation && bareDegree(fromDeg) === bareDegree(toDeg) && !via.length) return;
  const kinds = [];
  if (modulation) kinds.push('modulation');
  if (via.length) kinds.push('passing');
  const bassSteps = [a, ...via, b].map((t) => t.bassPc ?? t.rootPc);
  if (via.length && bassSteps.slice(1).every((pc, k) => Math.min(pcOf(pc - bassSteps[k]), pcOf(bassSteps[k] - pc)) === 1)) kinds.push('chromatic');
  else if (via.length && bassSteps.slice(1).every((pc, k) => [1, 2].includes(pcOf(pc - bassSteps[k])))) kinds.push('walkUp');
  else if (via.length && bassSteps.slice(1).every((pc, k) => [1, 2].includes(pcOf(bassSteps[k] - pc)))) kinds.push('walkDown');
  // Une ligne de notes seules juste avant l'arrivée (trois au moins, par pas) : elle y mène.
  const before = heard.filter((n) => n.start >= b.start - 1.5 && n.start < b.start + 0.05).sort((x, y) => x.start - y.start);
  const line = before.filter((n, k) => k === 0 || n.start - before[k - 1].start > 0.04);
  if (line.length >= 3 && line.slice(1).every((n, k) => Math.abs(n.midi - line[k].midi) <= 4)) kinds.push('line');
  if (!kinds.length) kinds.push('direct');
  const via2 = via.map((t) => ({ name: respell(t.name, fromKey), degree: degreeLabel(fromKey, t) }));
  const id = `${modulation ? 'mod:' : ''}${bareDegree(fromDeg)}>${bareDegree(toDeg)}|${via2.map((v) => bareDegree(v.degree)).join(',')}`;
  let mv = found.get(id);
  if (!mv) {
    mv = {
      id,
      from: { name: respell(a.name, fromKey), degree: fromDeg },
      to: { name: respell(b.name, toKey), degree: toDeg },
      via: via2,
      kinds: [],
      times: [],
      ...(modulation ? { keys: { from: keyName(fromKey), to: keyName(toKey) } } : {}),
    };
    found.set(id, mv);
  }
  for (const k of kinds) if (!mv.kinds.includes(k)) mv.kinds.push(k);
  mv.times.push({ start: round2(a.start + Math.max(0, a.dur - 1.5)), end: round2(b.start + Math.min(1.5, b.dur)) });
}

/** Le passage d'une partie à la suivante, s'il est joué d'un trait (changement de tonalité). */
function modulationMovement(partA, progA, partB, progB, notes) {
  const ta = partTokens(partA, progA);
  const tb = partTokens(partB, progB);
  const lastA = [...ta].reverse().findIndex((t) => !t.passing);
  if (lastA < 0 || !tb.length) return null;
  const ia = ta.length - 1 - lastA;
  const a = ta[ia];
  const b = tb.find((t) => !t.passing);
  if (!b || b.start - (ta[ta.length - 1].end) > GAP_BREAK) return null;
  const found = new Map();
  addMovement(found, { a, b, via: [...ta.slice(ia + 1), ...tb.slice(0, tb.indexOf(b))], fromKey: partA.key, toKey: partB.key, heard: notes, modulation: true });
  return [...found.values()][0] || null;
}

/** « enchaînement direct », « avec accord de passage (Edim) · chromatique »… */
export function movementKindText(mv) {
  return mv.kinds.map((k) => {
    if (k === 'passing' && mv.via.length) return `${KIND_WORDS.passing} (${mv.via.map((v) => v.name).join(', ')})`;
    if (k === 'modulation' && mv.keys) return `${KIND_WORDS.modulation} (${mv.keys.from} → ${mv.keys.to})`;
    return KIND_WORDS[k] || k;
  }).join(' · ');
}

// ── Titres et résumés ─────────────────────────────────────────────────────────

const HAND_TITLES = {
  both: 'Les deux mains',
  lh: 'Main gauche seule',
  rh: 'Main droite seule',
  line: 'La ligne du dessus',
  talk: 'Il explique',
  quiet: 'Rien de relevé',
};

/** Les accords d'une étape, dans l'ordre, sans répétition voisine (six au plus). */
function stepChords(step, key, slots = []) {
  const out = [];
  for (const m of step.moments) {
    // Une main seule : l'accord complet dont elle fait partie, ou celui de la progression qu'elle
    // accompagne ; sinon ses notes (son nom d'accord, sur trois notes, tromperait).
    let label = m.label;
    if (step.kind !== 'both') {
      const slot = slots.find((x) => (step.kind === 'lh' ? pcOf(m.midis[0]) === x.pc : fitsChord(m.midis, x)));
      label = m.partOf?.label || slot?.name || null;
      if (!label) {
        const notes = m.midis.map((x) => noteFr(x, { flats: key.flats })).join(' ');
        if (out[out.length - 1]?.name !== notes) out.push({ name: notes, degree: null, at: m.start, notes: true });
        continue;
      }
    }
    if (!label) continue;
    const name = respell(label, key);
    if (out[out.length - 1]?.name === name) continue;
    out.push({ name, degree: degreeIn(key, label), at: m.start });
  }
  return out;
}

function describeStep(step, part, progression, { first }) {
  const chords = stepChords(step, part.key, progression.chords);
  const slots = progression.chords;
  const covers = slots.length >= 2 && slots.every((slot) => step.moments.some((m) => playsSlot(m, slot)));
  // La tonalité est dite par la partie (en-tête « Partie 2 · Ré♭ majeur ») : pas dans le titre.
  const where = '';
  const degrees = (list) => list.map((c) => c.degree).filter(Boolean).join(' – ');
  let title = HAND_TITLES[step.kind] || 'Passage';
  let summary = '';
  if (step.kind === 'talk') {
    summary = 'Il parle sans jouer.';
  } else if (step.kind === 'quiet') {
    summary = 'Ni notes ni parole relevées ici : il peut jouer sans que l\'image le montre.';
  } else if (step.kind === 'both') {
    if (covers && progression.loop) {
      title = 'Tout ensemble';
      summary = `La progression complète, des deux mains : ${degrees(slots)}.`;
    } else {
      summary = chords.length ? `Les accords complets : ${chords.slice(0, 6).map((c) => c.name).join(' → ')}.` : 'Des accords complets.';
    }
  } else if (step.kind === 'lh') {
    summary = chords.length ? `Ce que fait la main gauche sous ${chords.slice(0, 6).map((c) => c.name).join(', ')}.` : 'La main gauche, seule.';
  } else if (step.kind === 'rh') {
    summary = chords.length ? `Ce que fait la main droite sur ${chords.slice(0, 6).map((c) => c.name).join(', ')}.` : 'La main droite, seule.';
  } else if (step.kind === 'line') {
    const top = uniq(step.moments.map((m) => m.midis[m.midis.length - 1])).slice(0, 8);
    summary = `Les notes du dessus, une par une : ${top.map((m) => noteFr(m, { flats: part.key.flats })).join(' · ')}.`;
  }
  return { title: `${where}${title}`, summary, chords: chords.slice(0, 8), covers };
}

// ── Le guide ──────────────────────────────────────────────────────────────────

// ── Rôle de chaque étape dans le morceau (HYPOTHÈSES) ─────────────────────────

/**
 * Le guide d'un tuto.
 * @param {{segments: object[], noteEvents?: object[], transcript?: {start: number, text: string}[], duration?: number|null}} input
 * @returns {{version: number, steps: object[], parts: object[], movements: object[]}|null}
 */
export function buildTutorialGuide({ segments = [], noteEvents = [], transcript = [], duration = null } = {}) {
  const moments = assignHands(guideMoments(segments, noteEvents));
  if (!moments.length) return null;
  const rawSteps = buildSteps(moments, { transcript, duration });
  const parts = buildParts(rawSteps);
  const progressions = alignKeys(parts);
  const steps = [];
  const outParts = [];
  const movements = [];
  parts.forEach((part, pi) => {
    const progression = progressions[pi];
    const final = partFinal(part, progression);
    const partId = `p${pi + 1}`;
    const same = outParts.find((p) => p.progression.loop && progression.loop && p.progression.chords.map((c) => bareDegree(c.degree)).join() === progression.chords.map((c) => bareDegree(c.degree)).join());
    const stepIds = [];
    part.steps.forEach((s, si) => {
      const d = describeStep(s, part, progression, { first: si === 0 && parts.length > 1 });
      const id = `s${steps.length + 1}`;
      stepIds.push(id);
      steps.push({
        id,
        part: partId,
        kind: s.kind,
        start: round2(s.start),
        end: round2(s.end),
        title: d.title,
        summary: d.summary,
        chords: d.chords,
        complete: d.covers && s.kind === 'both',
        said: s.said || [],
      });
    });
    if (pi > 0) {
      const mod = modulationMovement(parts[pi - 1], progressions[pi - 1], part, progression, noteEvents);
      if (mod) movements.push({ ...mod, id: `${partId}:${mod.id}`, part: partId });
    }
    const mvs = partMovements(part, { notes: noteEvents, progression }).map((m) => ({ ...m, id: `${partId}:${m.id}`, part: partId }));
    movements.push(...mvs);
    outParts.push({
      id: partId,
      start: round2(part.start),
      end: round2(part.end),
      key: part.key,
      keyName: keyName(part.key),
      progression,
      sameAs: same ? same.id : null,
      final,
      steps: stepIds,
    });
  });
  return { version: GUIDE_VERSION, steps, parts: outParts, movements };
}

// ── Recherche d'un mouvement (« du 1 au 6 ») ─────────────────────────────────

/** « 1 », « I », « 6m », « vi », « b7 » → « 1 », « 6 », « b7 ». */
export function normalizeDegree(text) {
  const t = String(text || '').trim();
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  const m = /^([b#♭♯]?)\s*([1-7]|i{1,3}|iv|vi{0,2}|v)\b/i.exec(t);
  if (!m) return null;
  const acc = m[1].replace('♭', 'b').replace('♯', '#');
  const n = /^\d$/.test(m[2]) ? m[2] : String(roman[m[2].toLowerCase()]);
  return `${acc}${n}`;
}

/**
 * Ce que le tuto montre pour aller d'un degré à un autre : les mouvements directs, sinon le
 * chemin que prend sa progression (« du 1 au 6 : sa boucle passe par le 2 et le 4 »).
 * @returns {{direct: object[], routes: {part: string, path: object[]}[]}}
 */
export function findMovements(guide, from, to) {
  const a = normalizeDegree(from);
  const b = normalizeDegree(to);
  if (!guide || !a || !b) return { direct: [], routes: [] };
  const direct = guide.movements.filter((m) => bareDegree(m.from.degree) === a && bareDegree(m.to.degree) === b);
  const routes = [];
  for (const p of guide.parts) {
    const loop = p.progression.loop ? p.progression.chords : [];
    const i = loop.findIndex((c) => bareDegree(c.degree) === a);
    const j = loop.findIndex((c) => bareDegree(c.degree) === b);
    if (i < 0 || j < 0 || i === j) continue;
    const path = [];
    for (let k = i; ; k = (k + 1) % loop.length) {
      path.push(loop[k]);
      if (k === j) break;
    }
    if (path.length > 2 || !direct.length) routes.push({ part: p.id, keyName: p.keyName, path });
  }
  return { direct, routes };
}

// ── Pour le Copilote ──────────────────────────────────────────────────────────

/** Le bloc « Guide du tuto » du contexte du Copilote. */
export function guideLines(guide, { maxSteps = 24, maxMovements = 16 } = {}) {
  if (!guide) return [];
  const out = ['', '## Guide du tuto (calculé par l\'application d\'après ce qu\'il joue : ses étapes, son résultat final, ses mouvements)'];
  out.push('Ce que le pianiste voit à l\'écran : la liste des étapes, le résultat final (à écouter), et les mouvements. Appuie-toi dessus ; ne cite que ce qui y est.');
  for (const p of guide.parts) {
    const prog = p.progression.chords.map((c) => `${c.degree} (${c.name})`).join(' – ');
    out.push(`Partie ${p.id.slice(1)} — ${p.keyName} (${clock(p.start)} → ${clock(p.end)}) : ${p.progression.loop ? `boucle ${prog}` : `accords principaux ${prog}`}${p.sameAs ? ` — la même progression que la partie ${p.sameAs.slice(1)}, dans une autre tonalité` : ''}.`);
    const f = p.final;
    if (f) {
      const where = f.source === 'together' ? `il la joue tout entière des deux mains de ${clock(f.start)} à ${clock(f.end)}` : 'ASSEMBLÉ par l\'application (il ne joue jamais tout ensemble : main gauche et main droite montrées séparément — une hypothèse)';
      out.push(`  Résultat final (${where}) :`);
      for (const c of f.chords) {
        const from = c.from ? ` [${Object.entries(c.from).map(([h, t]) => `${h === 'lh' ? 'main gauche' : h === 'rh' ? 'main droite' : 'deux mains'} vue à ${clock(t)}`).join(', ')}]` : '';
        out.push(`  - ${c.degree} ${c.name} : main gauche ${c.lh.map((m) => noteFr(m, { flats: p.key.flats })).join(' ') || '—'} | main droite ${c.rh.map((m) => noteFr(m, { flats: p.key.flats })).join(' ') || '—'}${from}${c.partial ? ' (incomplet)' : ''}`);
      }
      out.push(`  Pour le faire entendre : play_final_result (part « ${p.id} »).`);
    } else {
      out.push('  Résultat final : pas assez d\'éléments pour l\'assembler.');
    }
  }
  // [Claude] — 2026-10-16 — Seulement ce que le relevé établit : il joue (des notes lues), il parle (de la
  // parole transcrite), ou rien n'est relevé. Ni mains (ADR-054), ni rôle supposé (ADR-052), ni noms d'accords.
  const DOING = { talk: 'il parle (parole transcrite)', quiet: 'rien de relevé : ni notes ni parole (ne rien affirmer sur ce qu\'il fait)' };
  out.push('Ce que le relevé montre, moment par moment (n\'affirme rien de plus : là où « rien de relevé », ne dis PAS qu\'il parle ou explique) :');
  for (const s of guide.steps.slice(0, maxSteps)) {
    const doing = DOING[s.kind] || 'il joue';
    out.push(`- ${clock(s.start)}–${clock(s.end)} ${doing}${s.said?.length ? ` — il dit : « ${s.said.join(' ').slice(0, 140)} »` : ''}`);
  }
  if (guide.steps.length > maxSteps) out.push(`… (${guide.steps.length - maxSteps} étapes de plus)`);
  if (guide.movements.length) {
    out.push('Mouvements harmoniques montrés dans le tuto (degrés de la tonalité de leur partie) :');
    for (const m of guide.movements.slice(0, maxMovements)) {
      out.push(`- ${m.from.degree} → ${m.to.degree} (${m.from.name} → ${m.to.name}) : ${movementKindText(m)} ; à ${m.times.slice(0, 3).map((t) => clock(t.start)).join(', ')}${m.times.length > 3 ? '…' : ''} [id ${m.id}]`);
    }
    out.push('Pour faire entendre un mouvement tel que le prof le joue : play_tutorial_passage (start, end de l\'un de ses moments).');
    out.push('Si on te demande un mouvement que cette liste ne contient pas, dis que le tuto ne le montre pas, puis propose ce qu\'il montre de plus proche (par exemple le chemin que prend sa boucle). N\'invente pas de mouvement attribué au prof.');
  }
  return out;
}

/**
 * Le résultat final en exemple à écouter : les accords plaqués à leur durée, chaque main à sa
 * place (`hand` : 'lh' ou 'rh' pour une main seule), `cycles` tours.
 * @returns {{chords: {name: string, leftHand: number[], rightHand: number[], seconds: number}[]}|null}
 */
export function finalRealized(final, { hand = null, cycles = 2, semitones = 0 } = {}) {
  if (!final?.chords?.length) return null;
  const shift = (list) => list.map((m) => m + semitones);
  const one = final.chords.map((c) => ({
    name: c.name,
    leftHand: hand === 'rh' ? [] : shift(c.lh),
    rightHand: hand === 'lh' ? [] : shift(c.rh),
    seconds: Math.max(1.2, Math.min(4, final.seconds || 2)),
  }));
  const out = [];
  for (let k = 0; k < Math.max(1, cycles); k += 1) out.push(...one);
  return out;
}

/**
 * Le résultat final d'une partie, à écouter (Copilote : play_final_result ; guide : « Écouter »).
 * Joué d'un trait par le prof : SES notes, avec sa pédale, telles qu'il les joue (deux tours au
 * plus) ; assemblé : les accords réunis, plaqués, deux tours. Une main seule, transposable.
 * @param {{guide: object, noteEvents?: object[], pedals?: object[]|null, activity?: object[]}} tutorial
 * @param {{part?: string, hand?: 'LH'|'RH'|'both'|'lh'|'rh', transposeTo?: string, semitones?: number, title?: string}} args
 * @returns {{example: object|null, part: object|null, note?: string}}
 */
export function finalResultExample(tutorial, args = {}) {
  const guide = tutorial?.guide;
  const parts = (guide?.parts || []).filter((p) => p.final);
  if (!parts.length) return { example: null, part: null, note: '_(Le résultat final de ce tuto n\'a pas pu être reconstitué : pas assez d\'accords complets relevés.)_' };
  const part = parts.find((p) => p.id === args.part) || parts[parts.length - 1];
  const f = part.final;
  const hand = /^l/i.test(args.hand || '') ? 'lh' : /^r/i.test(args.hand || '') ? 'rh' : null;
  const keyText = `${KEY_NAMES[part.key.rootPc]}${part.key.minor ? 'm' : ''}`;
  // `semitones` (le guide : sélecteur « Transposer ») ou `transposeTo` (le Copilote : une tonalité nommée).
  const semitones = Number.isFinite(args.semitones) ? args.semitones : (args.transposeTo ? transposeInterval(keyText, args.transposeTo) : 0);
  const title = args.title ? String(args.title) : `Le résultat final — ${part.keyName}${semitones ? ` (transposé)` : ''}`;
  if (f.source === 'together' && Array.isArray(tutorial.noteEvents) && tutorial.noteEvents.length) {
    // Deux tours au plus : le passage peut en compter davantage.
    const cycle = f.seconds * f.chords.length;
    const end = Math.min(f.end, f.start + Math.max(cycle * 2 + 0.5, 6));
    const example = passageExample(tutorial.noteEvents, {
      start: f.start, end, hand: hand ? hand.toUpperCase() : null, semitones, title,
      pedals: tutorial.pedals || null, speech: tutorial.activity || [],
    });
    if (example) return { example, part };
  }
  const realized = finalRealized(f, { hand, cycles: 2, semitones });
  return { example: realized ? chordsExample(realized, { title, subtitle: f.source === 'assembled' ? 'Assemblé à partir de ses explications' : '' }) : null, part };
}
