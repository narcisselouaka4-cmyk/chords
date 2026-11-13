// [Claude] — 2026-11-13 — L'accompagnement du Copilote repris du jeu des pianistes relevés.
//
// Narcisse (12/11) : « Copilote joue comme dans les démonstrations. Un pianiste joue de différentes
// façons. » Le vocabulaire écrit à la main (gospel-comping.js) répondait à la variété ; à la question
// « je m'appuie sur quoi pour aller plus loin ? », il a choisi : « Mes tutoriels ».
//
// Ici, chaque mesure de la progression demandée est jouée avec le GESTE d'un pianiste relevé dans
// ses vidéos (Pédagogie IA) : ses notes, dans son ordre et à ses écarts de temps, transposées sur
// l'accord demandé. Rien n'est inventé ni réécrit ; l'application choisit seulement quel geste
// convient à quel accord.
//
//   geste     : ce que le pianiste joue entre deux changements d'harmonie (une ligne de la grille
//               relevée), tant que ce passage dure à peu près une mesure chez lui ;
//   fondamentale : la note la plus grave de l'attaque — un geste dont la basse n'est pas la
//               fondamentale (renversement) n'est pas repris, on ne sait pas le replacer ;
//   convient  : les notes de l'attaque appartiennent à l'accord demandé (tierce et septième du bon
//               type, tensions courantes), et les notes tenues du geste aussi ;
//   enchaîné  : si le pianiste allait ensuite vers un accord placé au même intervalle et de même
//               nature que l'accord suivant demandé, tout son passage est repris tel quel, accords
//               de passage compris (c'est là que vit le jeu gospel : substitution, diminué, marche).
//
// Mesuré sur ses relevés (13/11) : dans un tutoriel, le prof POSE souvent l'accord et le tient. Repris
// seul, cela redonnait des mesures immobiles — le défaut de départ. Chaque mesure reçoit donc :
//   1. le passage du pianiste tel qu'il l'a joué, quand il bouge (notes ajoutées, accords de
//      passage, enchaînement vers l'accord suivant) ;
//   2. sinon son voicing (les notes de son attaque, dans son registre), animé par le vocabulaire
//      rythmique de gospel-comping.js ;
//   3. sinon, faute de geste qui convienne, le voicing de l'application — et la carte le dit.
// Une prise suit un pianiste (une vidéo) autant que possible ; « une autre façon de la jouer »
// change de pianiste ou de passages. Moins de la moitié des mesures couvertes : `null`, et le
// vocabulaire écrit à la main joue seul (copilot-demo.js).
//
// Seuls les relevés d'église (gospel, worship) servent ici, et seulement ceux dont la lecture est
// assez sûre (voir `trustOf`). Lecture seule : aucun relevé n'est modifié.

import { guessHands, transposeChordLabel } from './teacher-notes.js';
import { demoHands } from '../practice-demo.js';
import { buildGospelComping } from './gospel-comping.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const round = (t) => Math.round(t * 1000) / 1000;
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const clock = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

/** Attaques « ensemble » : un accord roulé reste un seul groupe. */
const TOGETHER = 0.07;
/** L'attaque d'un geste : ce qui est posé dans la première demi-seconde. */
const ANCHOR_SECONDS = 0.45;
/** Une note plus courte est un ornement ou une note de passage : elle ne définit pas l'accord. */
const LONG_NOTE = 0.3;
const ORNAMENT = 0.25;
/** Un accord plus court que cette part de la durée médiane est un accord de passage. */
const PASSING_SHARE = 0.55;
/** Silence au-delà duquel deux lignes de la grille ne s'enchaînent plus (il parle, il s'arrête). */
const BREAK_SECONDS = 1.5;
const LOWEST = 28;
const HIGHEST = 96;
const LIFT = 0.05;

// ── Quels relevés ─────────────────────────────────────────────────────────

const CHURCH = /gospel|worship|grace|louange|adoration|praise|church|[ée]glise|hymn|cantique|sabaoth|[ée]ternel|harmonis/i;
const OTHER_STYLE = /salsa|montuno|latin|bossa|samba|jazz|bebop|stride|ragtime|classi|mccoy|tyner|evans/i;
const WORSHIP = /worship|louange|adoration/i;

/** Titre court pour la carte : sans la parenthèse ni la fin d'un long titre de vidéo. */
export function shortTitle(title) {
  const text = String(title || '').replace(/\s*[([].*$/, '').trim() || String(title || '');
  return text.length > 40 ? `${text.slice(0, 38).replace(/\s+\S*$/, '')}…` : text;
}

/** Un relevé d'église : dit dans le titre, ou rien dans le titre ne dit un autre style. */
export function isChurchTutorial(tutorial) {
  const title = String(tutorial?.title || '');
  return CHURCH.test(title) || !OTHER_STYLE.test(title);
}

/**
 * Confiance dans la lecture d'un relevé : 2 = recoupé avec le son (l'image et l'oreille disent la
 * même chose), 1 = lecture d'image récente, 0 = lecture ancienne jamais recoupée — avant la
 * révision 5, certaines vidéos étaient lues sur le mauvais clavier ou dans la mauvaise octave
 * (tutorial-memory.js). Un relevé à 0 n'est pas repris : rouvrir le tutoriel dans Pédagogie IA le
 * fait relire, et il sert alors ici.
 */
export function trustOf(tutorial) {
  if (tutorial?.soundChecked) return 2;
  return Number(tutorial?.revision) >= 5 ? 1 : 0;
}

// ── L'accord demandé ──────────────────────────────────────────────────────

/** Ce qu'un accord demandé accepte et exige, en demi-tons au-dessus de sa fondamentale. */
export function shapeOf(chord, feel = 'gospel') {
  const hands = demoHands(chord, 'fifth');
  const tones = new Set([...(hands.lh || []), ...(hands.rh || [])].map((n) => pcOf(n - chord.rootPc)));
  tones.add(0);
  const symbol = String(chord.symbol ?? '');
  const slash = /\//.test(String(chord.name || '').replace(/^[A-G][#b♯♭]?/, '')) && !/6\/9/.test(String(chord.name || ''));
  const minor = tones.has(3) && !tones.has(4);
  const major = tones.has(4);
  let kind;
  let allowed;
  let needs;
  if (minor && tones.has(6) && !tones.has(7)) {
    kind = 'dim';
    allowed = [0, 3, 6, 5, 8, tones.has(9) ? 9 : 10];
    needs = [3, 6];
  } else if (minor) {
    kind = 'min';
    allowed = [0, 2, 3, 5, 7, ...(tones.has(11) ? [11] : [10]), ...(tones.has(9) ? [9] : [])];
    needs = [3];
  } else if (major && tones.has(10)) {
    kind = 'dom';
    // Une septième de dominante, au piano gospel, se joue volontiers altérée (♭9, ♯9, ♯11, ♭13) :
    // la fonction de l'accord ne change pas, et la carte dit ce que le pianiste a joué. Une prise
    // worship reste sur l'accord écrit.
    allowed = [0, 2, 4, 7, 9, 10, ...[1, 3, 6, 8].filter((t) => feel !== 'worship' || tones.has(t))];
    needs = [10];
  } else if (major) {
    kind = 'maj';
    allowed = [0, 2, 4, 7, 9, ...(tones.has(11) ? [11] : []), ...(tones.has(6) ? [6] : [])];
    needs = [4];
  } else {
    kind = 'sus';
    allowed = [0, 2, 5, 7, 9, ...(tones.has(10) ? [10] : []), ...(tones.has(11) ? [11] : [])];
    needs = tones.has(5) ? [5] : [];
  }
  return { chord, rootPc: pcOf(chord.rootPc), kind, allowed: new Set(allowed), needs, slash, symbol, hands };
}

const within = (pcs, allowed) => [...pcs].every((p) => allowed.has(p));

const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Ce que la grille relevée dit de l'accord ({rootPc, kind}) ; null si elle ne dit rien d'utile. */
export function labelKind(label) {
  const m = /^([A-G])([#b♯♭]?)([^/]*)/.exec(String(label || '').trim());
  if (!m) return null;
  const rootPc = pcOf(LETTERS[m[1]] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0));
  const rest = m[3];
  let kind = null;
  if (/dim|°|ø|m7b5|m7♭5/.test(rest)) kind = 'dim';
  else if (/^m(?!aj)/.test(rest)) kind = 'min';
  else if (/sus/.test(rest)) kind = 'sus';
  else if (/^(7|9|11|13)/.test(rest)) kind = 'dom';
  else if (rest === '' || /^(maj|add|6|M)/.test(rest)) kind = 'maj';
  return kind ? { rootPc, kind } : null;
}
const MINORISH = new Set(['min', 'dim']);

/** L'attaque du pianiste dit-elle bien cet accord ? */
function anchorFits(gesture, shape) {
  if (shape.slash || !within(gesture.anchorPcs, shape.allowed)) return false;
  if (!shape.needs.every((p) => gesture.anchorPcs.has(p))) return false;
  // La grille relevée dit le contraire (mineur là où l'on demande majeur, ou l'inverse) : dans le
  // doute, le geste n'est pas repris.
  const said = gesture.said;
  if (said && said.rootPc === gesture.rootPc && said.kind !== 'sus' && shape.kind !== 'sus' && MINORISH.has(said.kind) !== MINORISH.has(shape.kind)) return false;
  // Une septième de dominante sans tierce (la coquille gospel) passe ; un accord majeur ou mineur
  // sans sa tierce ne dit rien.
  if (shape.kind === 'dom') {
    // Sans tierce dans l'attaque, une tierce mineure ailleurs dans le geste dirait un accord mineur.
    if (!gesture.anchorPcs.has(4)) return gesture.anchorPcs.has(7) && !gesture.allPcs.has(3) && ![1, 6, 8].some((t) => gesture.anchorPcs.has(t));
  }
  return true;
}

/**
 * L'accord où le pianiste arrive est-il de la même nature que l'accord suivant demandé ? Ses notes
 * ne sont pas rejouées (seul le trajet l'est) : la fondamentale est déjà la bonne, il suffit que la
 * tierce ne contredise pas (majeure contre mineure).
 */
function landingFits(landing, shape) {
  if (shape.slash) return false;
  const minor = landing.anchorPcs.has(3) && !landing.anchorPcs.has(4);
  const major = landing.anchorPcs.has(4);
  if (MINORISH.has(shape.kind)) return !major;
  return shape.kind === 'sus' ? true : !minor;
}

// ── Les gestes d'un relevé ────────────────────────────────────────────────

function groupsOf(notes) {
  const groups = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && n.start - last.start <= TOGETHER) last.notes.push(n);
    else groups.push({ start: n.start, notes: [n] });
  }
  return groups;
}

const cache = new WeakMap();

/**
 * Les gestes d'un relevé : un par ligne de sa grille, quand la ligne est jouable telle quelle.
 * @param {{title: string, notes: object[], segments: {start: number, label?: string}[]}} tutorial
 * @returns {object[]}
 */
export function tutorialGestures(tutorial) {
  if (!tutorial || !Array.isArray(tutorial.notes)) return [];
  if (cache.has(tutorial)) return cache.get(tutorial);
  const notes = guessHands(tutorial.notes.filter((n) => Number.isFinite(n?.midi) && Number.isFinite(n?.start) && n.midi >= LOWEST && n.midi <= HIGHEST))
    .map((n) => ({ midi: n.midi, start: n.start, end: Number.isFinite(n.end) && n.end > n.start ? n.end : n.start + 0.25, hand: n.hand === 'lh' ? 'lh' : 'rh' }))
    .sort((a, b) => a.start - b.start || a.midi - b.midi);
  const starts = [...new Set((tutorial.segments || []).map((s) => Number(s.start)).filter(Number.isFinite))].sort((a, b) => a - b);
  const labels = new Map((tutorial.segments || []).map((s) => [Number(s.start), s.label || null]));
  // Les notes de chaque ligne de la grille.
  const lines = [];
  let k = 0;
  starts.forEach((start, i) => {
    const until = i + 1 < starts.length ? starts[i + 1] - 0.06 : Infinity;
    while (k < notes.length && notes[k].start < start - 0.06) k += 1;
    const own = [];
    while (k < notes.length && notes[k].start < until) { own.push(notes[k]); k += 1; }
    if (own.length) lines.push({ label: labels.get(start), notes: own, at: own[0].start, last: Math.max(...own.map((n) => n.end)) });
  });
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    line.joined = !!next && next.at - line.last < BREAK_SECONDS;
    line.duration = line.joined ? next.at - line.at : Math.min(line.last - line.at + 0.3, 6);
    // Les notes frappées à trois ou plus forment un accord, même brèves (certaines vidéos n'allument
    // la touche qu'à la frappe) ; une note seule et brève est un ornement.
    const struck = new Set(groupsOf(line.notes).filter((g) => g.notes.length >= 3).flatMap((g) => g.notes));
    const anchor = line.notes.filter((n) => n.start - line.at <= ANCHOR_SECONDS && (n.end - n.start >= ORNAMENT || struck.has(n)));
    line.anchor = anchor;
    line.bass = anchor.length ? anchor.reduce((low, n) => (n.midi < low.midi ? n : low)) : null;
    line.rootPc = line.bass ? pcOf(line.bass.midi) : null;
    line.anchorPcs = new Set(anchor.map((n) => pcOf(n.midi - (line.bass?.midi ?? 0))));
    line.said = labelKind(line.label);
    line.allPcs = new Set(line.notes.map((n) => pcOf(n.midi - (line.bass?.midi ?? 0))));
    // Il bouge : quelque chose est joué après l'attaque (au moins deux moments, ou trois notes).
    const later = line.notes.filter((n) => n.start - line.at > ANCHOR_SECONDS);
    line.moves = groupsOf(later).length >= 2 || later.length >= 3;
    line.longPcs = new Set(line.notes.filter((n) => n.end - n.start >= LONG_NOTE || struck.has(n)).map((n) => pcOf(n.midi - (line.bass?.midi ?? 0))));
  });
  const usual = median(lines.filter((l) => l.joined).map((l) => l.duration)) || 2;
  const span = (list) => (list.length ? Math.max(...list.map((n) => n.midi)) - Math.min(...list.map((n) => n.midi)) : 0);
  const sound = (line) => {
    if (!line.bass || line.bass.hand !== 'lh' || line.bass.midi > 57) return false;
    // La vraie basse arrive après l'attaque (main droite d'abord) : la fondamentale n'est pas sûre.
    if (line.notes.some((n) => n.start - line.at <= 1.2 && n.midi < line.bass.midi && pcOf(n.midi) !== line.rootPc)) return false;
    const lh = line.anchor.filter((n) => n.hand === 'lh');
    const rh = line.anchor.filter((n) => n.hand !== 'lh');
    if (line.anchor.length < 3 || line.anchor.length > 9 || !rh.length) return false;
    if (line.anchorPcs.size < 3 || span(lh) > 16 || span(rh) > 14) return false;
    // Deux touches voisines tenues ensemble : la lecture d'image en a déjà inventé (un repère large
    // allumait la touche d'à côté). Seuls les frottements d'usage passent : septième majeure sous
    // l'octave, neuvième sous la tierce mineure. Dans le doute, le geste n'est pas repris.
    const keys = [...new Set(line.anchor.map((n) => n.midi))].sort((a, b) => a - b);
    if (keys.some((k, i) => i > 0 && k - keys[i - 1] === 1 && ![11, 2].includes(pcOf(keys[i - 1] - line.bass.midi)))) return false;
    return line.notes.length / Math.max(0.5, line.duration) <= 14;
  };
  const gestures = [];
  lines.forEach((line, i) => {
    line.main = line.duration >= PASSING_SHARE * usual;
    line.sound = sound(line);
  });
  lines.forEach((line, i) => {
    if (!line.main || !line.sound || line.duration < 0.7 || line.duration > 5) return;
    // Jusqu'au prochain accord « posé » : les accords de passage entre les deux font partie du trajet.
    let j = i + 1;
    let joined = line.joined;
    while (joined && j < lines.length && !lines[j].main && j - i < 4) { joined = lines[j].joined; j += 1; }
    const landing = joined && j < lines.length && lines[j].main && lines[j].sound ? lines[j] : null;
    const tail = landing ? lines.slice(i + 1, j) : [];
    gestures.push({
      tutorial, at: line.at, label: line.label, rootPc: line.rootPc, bass: line.bass.midi,
      anchor: line.anchor, anchorPcs: line.anchorPcs, longPcs: line.longPcs, allPcs: line.allPcs, said: line.said, moves: line.moves,
      body: { notes: line.notes, duration: line.duration, changes: [] },
      linked: landing ? {
        notes: [line, ...tail].flatMap((l) => l.notes), duration: landing.at - line.at,
        changes: tail.map((l) => l.at - line.at), passing: tail.map((l) => l.label).filter(Boolean),
        interval: pcOf(landing.rootPc - line.rootPc), landing,
      } : null,
      top: Math.max(...line.anchor.map((n) => n.midi)),
      index: gestures.length,
    });
  });
  // Le geste qui suit dans la vidéo (pour continuer un passage d'un seul tenant).
  gestures.forEach((g) => { g.usual = usual; });
  cache.set(tutorial, gestures);
  return gestures;
}

// ── Une prise ─────────────────────────────────────────────────────────────

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(random, options) {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let r = random() * total;
  for (const o of options) { r -= o.weight; if (r <= 0) return o; }
  return options[options.length - 1] || null;
}

/** Les façons de jouer une mesure (accord demandé, accord suivant) avec les gestes relevés. */
function candidatesFor(pool, shape, nextShape) {
  const out = [];
  for (const g of pool) {
    if (!anchorFits(g, shape)) continue;
    const semis = pcOf(shape.rootPc - g.rootPc);
    if (g.linked && nextShape && g.linked.interval === pcOf(nextShape.rootPc - shape.rootPc) && landingFits(g.linked.landing, nextShape)) {
      out.push({ gesture: g, part: g.linked, linked: true, semis });
    }
    if (within(g.longPcs, shape.allowed)) out.push({ gesture: g, part: g.body, linked: false, semis });
  }
  return out;
}

/**
 * La transposition (vers le haut ou vers le bas) qui garde le geste dans un registre qui sonne :
 * un accord de main droite descendu sous Ré3 devient boueux, une basse sous Mi1 ne se distingue
 * plus, un dessus au-delà de Mi6 crie. À registre égal, le plus petit déplacement.
 */
function shiftOf(candidate) {
  const notes = candidate.part.notes.map((n) => n.midi);
  const low = Math.min(...notes);
  const high = Math.max(...notes);
  const upper = candidate.gesture.anchor.filter((n) => n.midi !== candidate.gesture.bass).map((n) => n.midi);
  const chordLow = upper.length ? Math.min(...upper) : high;
  let best = null;
  for (const shift of [candidate.semis - 12, candidate.semis]) {
    if (low + shift < LOWEST || high + shift > HIGHEST || chordLow + shift < 48) continue;
    const cost = Math.max(0, 50 - (chordLow + shift)) * 4 + Math.max(0, high + shift - 88) * 4 + Math.max(0, 31 - (low + shift)) * 4 + Math.abs(shift) * 0.1;
    if (!best || cost < best.cost) best = { shift, cost };
  }
  return best ? best.shift : null;
}

/**
 * Durées jouées (la pédale du pianiste n'est pas relevée) : une note tenue reste jusqu'au prochain
 * accord de la même main ou au prochain changement d'harmonie ; un ornement garde sa durée.
 */
function sustain(part, limit) {
  const byHand = { lh: groupsOf(part.notes.filter((n) => n.hand === 'lh')), rh: groupsOf(part.notes.filter((n) => n.hand !== 'lh')) };
  const t0 = part.notes[0].start;
  const changes = (part.changes || []).map((c) => t0 + c);
  const out = [];
  for (const hand of ['lh', 'rh']) {
    const groups = byHand[hand];
    groups.forEach((group, gi) => {
      for (const n of group.notes) {
        let until = n.end;
        if (n.end - n.start >= ORNAMENT) {
          // Main gauche : la basse suivante la remplace. Main droite : un accord tient jusqu'au
          // prochain accord (une note seule chante par-dessus) ; une note seule, jusqu'à la suivante
          // — sinon une ligne de huit notes sonnerait comme une grappe.
          const chordal = group.notes.length >= 2;
          const replaced = groups.slice(gi + 1).find((g) => (hand === 'lh' || !chordal ? true : g.notes.length >= 2));
          until = Math.max(n.end, Math.min(replaced ? replaced.start : limit, limit));
          const change = changes.find((c) => c > n.start + 0.05);
          if (change !== undefined) until = Math.min(until, Math.max(n.end, change));
        }
        const again = part.notes.find((m) => m !== n && m.midi === n.midi && m.start > n.start + 0.02);
        if (again) until = Math.min(until, again.start - 0.02);
        out.push({ ...n, until: Math.min(Math.max(until, n.start + 0.08), limit) });
      }
    });
  }
  out.sort((a, b) => a.start - b.start || a.midi - b.midi);
  // Une main ne tient pas plus de cinq notes : la plus ancienne se lève.
  for (const hand of ['lh', 'rh']) {
    const mine = out.filter((n) => (n.hand === 'lh') === (hand === 'lh'));
    mine.forEach((n, i) => {
      const held = mine.slice(0, i).filter((m) => m.until > n.start + 0.05 && n.start - m.start > TOGETHER).sort((a, b) => a.start - b.start);
      const together = mine.filter((m) => Math.abs(m.start - n.start) <= TOGETHER).length;
      while (held.length + together > 5) held.shift().until = n.start;
    });
  }
  return out;
}

/**
 * Le voicing d'un geste pour le moteur : la basse, et ce qu'UNE main peut tenir au-dessus (cinq
 * notes, une neuvième d'écart au plus), en partant du haut — c'est le dessus qui chante.
 * null si, ainsi réduit, il ne dit plus l'accord demandé (tierce ou septième perdue).
 */
function voicingOf(gesture, shift, shape) {
  const root = gesture.bass + shift;
  const upper = gesture.anchor.filter((n) => n.midi !== gesture.bass);
  // La main gauche du moteur joue déjà fondamentale, quinte et octave : ces doublures-là sont à lui.
  let rh = upper.filter((n) => !(n.hand === 'lh' && [0, 7].includes(pcOf(n.midi - gesture.bass)))).map((n) => n.midi + shift);
  if (new Set(rh).size < 2) rh = upper.map((n) => n.midi + shift);
  rh = [...new Set(rh)].sort((a, b) => b - a);
  rh = rh.filter((n, k) => k < 5 && rh[0] - n <= 14).sort((a, b) => a - b);
  if (rh.length < 2) return null;
  const pcs = new Set(rh.map((n) => pcOf(n - root)));
  return shape.needs.every((p) => pcs.has(p)) ? { rh, root } : null;
}

/**
 * Une progression jouée avec les gestes des pianistes relevés.
 * @param {object[]} chords accords de l'application ({name, rootPc, symbol, voicing…})
 * @param {object[]} tutorials relevés (library-combine.js : `loadTutorialLibrary`)
 * @param {{seed?: number, variation?: number, feel?: 'gospel'|'worship', beatsPerChord?: number}} [options]
 * @returns {{events: object[], beats: number, tempo: number, gestures: string[], bars: object[], hands: {lh: number[], rh: number[]}[], sources: string[], played: number, voiced: number}|null}
 */
export function buildTutorialComping(chords, tutorials, { seed = 1, variation = 0, feel = 'gospel', beatsPerChord = 4 } = {}) {
  if (!Array.isArray(chords) || chords.length < 2 || !Array.isArray(tutorials)) return null;
  const sources = tutorials.filter((t) => t?.notes?.length && isChurchTutorial(t) && trustOf(t) > 0);
  if (!sources.length) return null;
  const shapes = chords.map((chord) => shapeOf(chord, feel));
  const random = rng(seed);
  const perSource = sources.map((tutorial) => {
    const pool = tutorialGestures(tutorial);
    const bars = shapes.map((shape, i) => candidatesFor(pool, shape, shapes[i + 1] || null).filter((c) => shiftOf(c) !== null));
    return { tutorial, pool, bars, covered: bars.filter((b) => b.length).length, linked: bars.filter((b) => b.some((c) => c.linked)).length };
  }).filter((s) => s.covered > 0);
  if (!perSource.length) return null;
  // Le pianiste de la prise : celui qui couvre le plus de mesures ; une autre prise, le suivant.
  const rank = (s) => s.covered * 2 + s.linked + trustOf(s.tutorial) + (feel === 'worship' && WORSHIP.test(s.tutorial.title) ? 3 : 0);
  perSource.sort((a, b) => rank(b) - rank(a) || a.tutorial.title.localeCompare(b.tutorial.title));
  const leaders = perSource.filter((s) => rank(s) >= rank(perSource[0]) * 0.6);
  const lead = leaders[Math.abs(Math.round(Number(variation) || 0)) % leaders.length];
  const usual = Math.min(3.4, Math.max(1.5, lead.pool[0]?.usual || 2));
  const worship = feel === 'worship';

  const chosen = [];
  const used = new Set();
  shapes.forEach((shape, i) => {
    const prev = chosen[i - 1];
    const last = i === shapes.length - 1;
    const options = [];
    for (const source of perSource) {
      for (const c of source.bars[i]) {
        const moving = !last && (c.gesture.moves || (c.linked && c.part.changes.length > 0));
        // Un passage joué tel quel doit durer à peu près une mesure chez lui ; un voicing, peu importe.
        if (moving && (c.part.duration < usual * 0.55 || c.part.duration > usual * 1.75)) continue;
        // Une prise sobre (worship) ne prend pas les accords de passage d'un pianiste gospel.
        if (worship && c.linked && c.part.changes.length && !WORSHIP.test(source.tutorial.title)) continue;
        const shift = shiftOf(c);
        if (!moving && !voicingOf(c.gesture, shift, shape)) continue;
        if (!moving && c.linked) continue; // même voicing que le geste simple : une seule fois
        let weight = source === lead ? 6 : 1;
        if (moving) weight *= c.linked ? 5 : 2.5;
        weight *= Math.max(1, Math.min(3, c.gesture.anchorPcs.size - 2));
        // La suite du même passage, dans la vidéo : le pianiste continue sa phrase.
        if (prev?.moving && prev.linked && prev.gesture.linked.landing.at === c.gesture.at && prev.gesture.tutorial === c.gesture.tutorial) weight *= 4;
        if (prev && Math.abs(c.gesture.top + shift - prev.top) > 8) weight *= 0.35;
        if (used.has(c.gesture)) weight *= 0.12;
        options.push({ ...c, shift, weight, moving, top: c.gesture.top + shift });
      }
    }
    const pick = options.length ? weighted(random, options) : null;
    if (pick) used.add(pick.gesture);
    chosen.push(pick);
  });
  const covered = chosen.filter(Boolean).length;
  if (covered < Math.ceil(chords.length / 2)) return null;

  // Tempo : la mesure du pianiste, un peu plus posée (×1,25) — seule au piano, sans chant ni
  // batterie, la progression respire ; jamais plus lente que le jeu gospel de l'application (72).
  const movers = chosen.filter((c) => c?.moving).map((c) => c.part.duration);
  const tempo = movers.length ? Math.min(92, Math.max(72, Math.round((60 * beatsPerChord) / (median(movers) * 1.25)))) : 72;

  const overrides = chosen.map((pick, i) => {
    if (!pick) return { plan: { source: null } };
    const { gesture, part, shift, linked, moving } = pick;
    const plan = {
      source: gesture.tutorial.title, at: clock(gesture.at), seconds: round(gesture.at),
      // Le nom donné par la grille relevée, s'il part bien de la même basse (sinon il égarerait).
      played: gesture.label && gesture.said?.rootPc === gesture.rootPc ? transposeChordLabel(gesture.label, shift) : null, semitones: shift,
    };
    const hands = {
      lh: gesture.anchor.filter((n) => n.hand === 'lh').map((n) => n.midi + shift).sort((a, b) => a - b),
      rh: gesture.anchor.filter((n) => n.hand !== 'lh').map((n) => n.midi + shift).sort((a, b) => a - b),
    };
    const voicing = voicingOf(gesture, shift, shapes[i]);
    if (!moving) return { voicing, plan: { ...plan, how: 'voicing' }, hands };
    const t0 = part.notes[0].start;
    const limit = t0 + part.duration;
    const scale = beatsPerChord / part.duration;
    // Sans enchaînement, les dernières notes étrangères à l'accord menaient vers la suite du
    // pianiste, pas vers la nôtre : elles ne sont pas reprises.
    const leadsAway = (n) => !linked && n.start - t0 > part.duration * 0.75 && !shapes[i].allowed.has(pcOf(n.midi - gesture.bass));
    const notes = sustain({ ...part, notes: part.notes.filter((n) => n.start < limit - 0.03 && !leadsAway(n)) }, limit);
    const tops = groupsOf(notes.filter((n) => n.hand !== 'lh')).filter((g) => g.notes.length >= 2)
      .map((g) => ({ start: g.start, top: Math.max(...g.notes.map((n) => n.midi)) }));
    const passing = linked ? part.passing.map((label) => transposeChordLabel(label, shift)) : [];
    return {
      voicing,
      hands,
      plan: { ...plan, how: 'passage', ...(linked ? { linked: true } : {}), ...(passing.length ? { passing } : {}) },
      play(score, t, v) {
        for (const n of notes) {
          const at = t + (n.start - t0) * scale;
          const until = Math.min(t + (n.until - t0) * scale, t + beatsPerChord) - LIFT;
          const isTop = n.hand !== 'lh' && tops.some((g) => Math.abs(g.start - n.start) <= TOGETHER && g.top === n.midi);
          score.note(at, n.midi + shift, v + (n.hand === 'lh' ? 0.06 : isTop ? 0.07 : 0), Math.max(until - at, 0.1), n.hand);
        }
      },
    };
  });
  const comping = buildGospelComping(chords, { seed, feel, beatsPerChord, overrides });
  if (!comping) return null;

  const bars = comping.bars;
  const titles = [...new Set(bars.map((b) => b.source).filter(Boolean))];
  const played = bars.filter((b) => b.how === 'passage').length;
  const voiced = bars.filter((b) => b.how === 'voicing').length;
  const passing = bars.filter((b) => b.passing?.length).length;
  const named = titles.slice(0, 2).map((s) => `« ${shortTitle(s)} »`).join(' et ');
  const gestures = [`d’après ${named}${titles.length > 2 ? ` et ${titles.length - 2} autre${titles.length > 3 ? 's' : ''} vidéo${titles.length > 3 ? 's' : ''}` : ''}`];
  if (played) gestures.push(`${played} mesure${played > 1 ? 's' : ''} jouée${played > 1 ? 's' : ''} comme dans la vidéo`);
  if (passing) gestures.push(`${passing > 1 ? 'accords' : 'accord'} de passage du pianiste`);
  if (voiced) gestures.push(`${voiced} voicing${voiced > 1 ? 's' : ''} du pianiste, animé${voiced > 1 ? 's' : ''} par l’application`);
  if (covered < chords.length) gestures.push(`${chords.length - covered} accord${chords.length - covered > 1 ? 's' : ''} sur le voicing de l’application`);
  return { ...comping, tempo, gestures, sources: titles, lead: lead.tutorial.title, played, voiced };
}
