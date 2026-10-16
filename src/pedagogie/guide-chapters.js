// [Claude] — 2026-10-15 — Les chapitres d'un tuto, comme ceux d'une vidéo YouTube.
//
// Narcisse : « nos guides tutos devraient ressembler un peu à ce que font les youtubeurs sur YouTube,
// avec une sorte de timeline. Des grosses timelines, par exemple de une à trois minutes pour
// l'introduction, puis une deuxième timeline qui aborde un premier sujet, une troisième pour un autre
// sujet, etc. Je veux que l'application fasse ça automatiquement et détecte ces parties d'elle-même :
// faire la transcription et écouter tout ce qui a été dit (les notes, le contenu), puis générer
// automatiquement ces timelines. »
//
// Les BORNES sont décidées ici, par le moteur, jamais par l'IA (qui invente des horodatages et vise le
// moment où le prof PARLE d'un geste plutôt que celui où il le JOUE). Quatre indices, additionnés :
//   • le prof passe de « il joue » à « il parle » (ou l'inverse) ;
//   • une pause dans la parole ;
//   • un changement de tonalité (les parties du guide) ;
//   • un changement de vocabulaire dans ce qu'il dit (on parle d'autre chose).
// L'IA ne sert qu'à NOMMER chaque chapitre en français (chapterMessages), et seulement à partir de ce
// que le moteur a relevé. Sans elle, des titres factuels : « Début », « Chapitre 2 »…, et « Il joue,
// sans parler » pour un vrai passage muet.
//
// Module PUR (aucune dépendance au navigateur), testé par test-guide-chapters.js.

import { ACTIVITY } from './teacher-activity.js';

export const CHAPTER_DEFAULTS = {
  // [Claude] — 2026-10-16 — Durée visée d'un chapitre (s). 150 s donnait 3 chapitres pour un tuto de
  // 7 min : Narcisse les a trouvés « un peu trop gros ». 110 s → 4 chapitres pour 7 min, 9 (le plafond)
  // pour 19 min. Un chapitre reste une PARTIE du tuto, pas une phrase : en dessous, on retomberait dans
  // le « quasiment une case pour chaque phrase » qu'il reprochait à la version précédente.
  perChapter: 110,
  minChapters: 2,
  maxChapters: 9,
  /** Aucun chapitre plus court que cela (s) ni que la moitié de la durée visée. */
  minLength: 30,
  /** Pause dans la parole qui suggère un changement de sujet (s). */
  pause: 6,
  /** Sous-repères DANS un chapitre (Narcisse : « il faudrait peut-être des sous-sujets, pas beaucoup »). */
  maxSubpoints: 2,
  subpointMargin: 20,
  /** Titre de secours : combien de ses mots reprendre, quand l'IA n'a pas (encore) nommé le chapitre. */
  fallbackWords: 7,
  /** Transition jeu ↔ parole : chaque côté dure au moins cela (s). */
  runMin: 15,
  /** Score minimal pour qu'une coupure soit retenue. */
  minScore: 1.2,
  /** Fenêtre (nombre de phrases) pour comparer le vocabulaire avant / après. */
  windowSegments: 6,
};

const finite = (n) => Number.isFinite(n);
const round1 = (x) => Math.round(x * 10) / 10;

const STOP = new Set(('the a an and or but so to of in on at for with is are was were be been it its this that these those i you we they he she me my your our them '
  + 'do does did have has had not no yes just like very really okay ok well now then here there what when where which who how if as by from up out about into '
  + 'can will would could should going gonna want let one get got make see know think say said right yeah um uh '
  + 'le la les un une des et ou mais donc de du en dans sur au aux pour avec est sont était être ce cet cette ces je tu il elle nous vous ils elles que qui quoi '
  + 'ne pas plus très ici là alors comme si par mon ma mes ton ta tes son sa ses notre votre leur y a ai as '
  + 'el los las unos unas y o pero de del en con por para es son era ser este esta estos estas yo tu nosotros ellos que como si muy aquí ahí').split(/\s+/));

function words(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9#]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function cosine(a, b) {
  const fa = new Map(); const fb = new Map();
  for (const w of a) fa.set(w, (fa.get(w) || 0) + 1);
  for (const w of b) fb.set(w, (fb.get(w) || 0) + 1);
  let dot = 0; let na = 0; let nb = 0;
  for (const [w, x] of fa) { na += x * x; if (fb.has(w)) dot += x * fb.get(w); }
  for (const x of fb.values()) nb += x * x;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Les passages « il joue » / « il parle », fusionnés (les trous de 5 s au plus sont recousus). */
function activityRuns(spans) {
  const runs = [];
  for (const s of [...(spans || [])].sort((a, b) => a.start - b.start)) {
    if (!finite(s.start) || !finite(s.end)) continue;
    const cls = s.kind === ACTIVITY.PLAYS ? 'play' : (s.kind === ACTIVITY.SPEAKS || s.kind === ACTIVITY.BOTH) ? 'talk' : null;
    if (!cls) continue;
    const last = runs[runs.length - 1];
    if (last && last.cls === cls && s.start - last.end <= 5) last.end = Math.max(last.end, s.end);
    else runs.push({ cls, start: s.start, end: s.end });
  }
  return runs;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Les coupures candidates, avec leur score et ce qui les justifie.
 * @returns {{t: number, score: number, why: string[]}[]}
 */
export function chapterCandidates({ narration = [], spans = [], parts = [] } = {}, options = {}) {
  const o = { ...CHAPTER_DEFAULTS, ...options };
  const out = [];
  const add = (t, score, why) => { if (finite(t) && t > 0 && score > 0) out.push({ t, score, why: [why] }); };

  // 1. Jeu ↔ parole.
  const runs = activityRuns(spans);
  for (let i = 1; i < runs.length; i += 1) {
    const a = runs[i - 1]; const b = runs[i];
    if (a.cls === b.cls) continue;
    if (a.end - a.start >= o.runMin && b.end - b.start >= o.runMin) add(b.start, 3, 'activité');
  }

  // 2. Pauses dans la parole.
  const speech = narration.filter((n) => finite(n?.start) && String(n.text || '').trim()).sort((a, b) => a.start - b.start);
  for (let i = 1; i < speech.length; i += 1) {
    const gap = speech[i].start - (finite(speech[i - 1].end) ? speech[i - 1].end : speech[i - 1].start);
    if (gap >= o.pause) add(speech[i].start - 0.3, Math.min(1 + gap / 10, 3), 'pause');
  }

  // 3. Changement de tonalité.
  parts.forEach((p, i) => { if (i > 0) add(p.start, 4, 'tonalité'); });

  // 4. Changement de vocabulaire.
  const W = o.windowSegments;
  for (let k = W - 1; k < speech.length - W; k += 1) {
    const left = words(speech.slice(k - W + 1, k + 1).map((s) => s.text).join(' '));
    const right = words(speech.slice(k + 1, k + 1 + W).map((s) => s.text).join(' '));
    if (left.length < 15 || right.length < 15) continue;
    const dip = 1 - cosine(left, right);
    if (dip >= 0.6) add(speech[k + 1].start, dip * 3, 'sujet');
  }
  return out;
}

/** Rassemble les candidates voisines (8 s) : la première date, les scores s'additionnent (8 au plus). */
function mergeCandidates(list) {
  const sorted = [...list].sort((a, b) => a.t - b.t);
  const merged = [];
  for (const c of sorted) {
    const last = merged[merged.length - 1];
    if (last && c.t - last.t <= 8) { last.score = Math.min(8, last.score + c.score); last.why = [...new Set([...last.why, ...c.why])]; } else merged.push({ ...c, why: [...c.why] });
  }
  return merged;
}

/**
 * Découpe un tuto en chapitres.
 * @param {object} input
 * @param {{start: number, end?: number, text: string}[]} input.narration - ce que dit le prof
 * @param {{start: number, end: number, kind: string}[]} input.spans - quand il joue / parle (teacher-activity.js)
 * @param {{start: number}[]} [input.parts] - les parties du guide (une tonalité chacune)
 * @param {{id: string, start: number|null}[]} [input.highlights] - les mouvements à rattacher (guide-highlights.js)
 * @param {number} [input.duration]
 * @returns {{id: string, start: number, end: number, kind: 'play'|'talk'|'mixed'|'none', text: string,
 *   moves: string[], subpoints: {t: number, label: string}[], title: string, autoTitle: string,
 *   summary: string, why: string[]}[]}
 */
export function buildChapters({ narration = [], spans = [], parts = [], highlights = [], duration = null } = {}, options = {}) {
  const o = { ...CHAPTER_DEFAULTS, ...options };
  const ends = [
    ...narration.map((n) => (finite(n?.end) ? n.end : n?.start)),
    ...spans.map((s) => s?.end),
    ...parts.map((p) => p?.end),
  ].filter(finite);
  const total = finite(duration) && duration > 0 ? duration : (ends.length ? Math.max(...ends) : 0);
  if (!total || total < o.minLength * 1.5) return [];

  const target = Math.max(o.minChapters, Math.min(o.maxChapters, Math.round(total / o.perChapter)));
  const minLen = Math.max(o.minLength, total / (target * 2.5));
  const cuts = [];
  const ranked = mergeCandidates(chapterCandidates({ narration, spans, parts }, o)).filter((c) => c.score >= o.minScore).sort((a, b) => b.score - a.score);
  for (const c of ranked) {
    if (cuts.length >= target - 1) break;
    if (c.t < minLen || total - c.t < minLen) continue;
    if (cuts.some((x) => Math.abs(x.t - c.t) < minLen)) continue;
    cuts.push(c);
  }
  cuts.sort((a, b) => a.t - b.t);

  const bounds = [{ t: 0, why: [] }, ...cuts, { t: total, why: [] }];
  const speech = narration.filter((n) => finite(n?.start) && String(n.text || '').trim());
  // [Claude] — 2026-10-16 — Sous-repères : les meilleures coupures candidates qui n'ont pas fait un
  // chapitre à part entière, mais tombent franchement À L'INTÉRIEUR d'un chapitre (`subpointMargin` des
  // bords). Peu nombreux (`maxSubpoints`), juste de quoi sauter à l'intérieur d'un gros chapitre.
  const usedAsCut = (t) => bounds.some((b) => Math.abs(b.t - t) < 1);
  const chapters = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const start = bounds[i].t; const end = bounds[i + 1].t; const len = end - start;
    const text = speech.filter((n) => n.start >= start && n.start < end).map((n) => String(n.text).trim()).join(' ');
    let play = 0; let talk = 0;
    for (const s of spans) {
      const ov = overlap(start, end, s.start, s.end);
      if (!ov) continue;
      if (s.kind === ACTIVITY.PLAYS || s.kind === ACTIVITY.BOTH) play += ov;
      if (s.kind === ACTIVITY.SPEAKS || s.kind === ACTIVITY.BOTH) talk += ov;
    }
    let kind;
    if (!spans.length) kind = text ? 'talk' : 'none';
    else if (play / len >= 0.6 && talk / len < 0.3) kind = 'play';
    else if (talk / len >= 0.6 && play / len < 0.3) kind = 'talk';
    else kind = (play || talk) ? 'mixed' : 'none';
    const moves = highlights.filter((h) => h.kind === 'movement' && finite(h.start) && h.start >= start && h.start < end).map((h) => h.id);
    const first = speech.find((n) => n.start >= start && n.start < end && String(n.text || '').trim());
    const inside = ranked.filter((c) => !usedAsCut(c.t) && c.t >= start + o.subpointMargin && c.t <= end - o.subpointMargin);
    const subpoints = [];
    for (const c of inside.sort((a, b) => b.score - a.score)) {
      if (subpoints.length >= o.maxSubpoints) break;
      if (subpoints.some((sp) => Math.abs(sp.t - c.t) < o.subpointMargin)) continue;
      const near = speech.find((n) => n.start >= c.t - 1 && n.start < c.t + 8);
      // Un sous-repère MUET n'aide pas (on ne sait pas ce qu'il désigne), et un sous-repère qui répète
      // les premiers mots de son propre chapitre non plus : dans les deux cas, on n'en pose pas.
      const label = near ? near.text.trim().split(/\s+/).slice(0, 8).join(' ') : '';
      if (!label || (first && near === first)) continue;
      subpoints.push({ t: round1(c.t), label });
    }
    subpoints.sort((a, b) => a.t - b.t);
    chapters.push({
      id: `c${i + 1}`, start: round1(start), end: round1(end), kind, text: text.slice(0, 900), moves, subpoints,
      title: '', autoTitle: '', summary: '', why: bounds[i].why,
    });
  }

  // [Claude] — 2026-10-16 — Titres de secours (sans l'IA, ou tant qu'elle n'a pas répondu) : les PREMIERS
  // MOTS que le prof dit dans le chapitre, pas un numéro. Narcisse : « comme titre de chapitre tu as
  // littéralement mis "chapitre", et pas le sujet dont parle la vidéo » — et, plus largement, « le guide
  // tuto ne nous aide pas du tout à comprendre la vidéo ». Ses mots ne sont pas une traduction (ils restent
  // dans la langue du tuto), mais ils disent de quoi il parle ; un numéro ne dit rien. Rien n'est inventé :
  // c'est sa phrase, coupée.
  chapters.forEach((c, i) => {
    const opening = speech.find((n) => n.start >= c.start && n.start < c.end && String(n.text || '').trim());
    const words = opening ? String(opening.text).trim().split(/\s+/) : [];
    const excerpt = words.length ? `${words.slice(0, o.fallbackWords).join(' ')}${words.length > o.fallbackWords ? '…' : ''}` : '';
    const base = excerpt || (c.kind === 'play' ? 'Il joue, sans parler' : (i === 0 ? 'Début' : `Partie ${i + 1}`));
    c.autoTitle = base;
    c.title = base;
    c.fromSpeech = Boolean(excerpt);
  });
  return chapters;
}

/** La signature des chapitres : pour ne pas réutiliser les titres d'un autre découpage. */
export function chaptersSignature(chapters) {
  if (!chapters?.length) return '';
  return chapters.map((c) => `${c.id}@${Math.round(c.start)}-${Math.round(c.end)}`).join('|');
}

/**
 * [Claude] — 2026-10-16 — Retrouver les titres déjà obtenus même si le découpage a BOUGÉ.
 *
 * Les bornes dépendent du relevé (notes lues, parole) : une ré-analyse les déplace de quelques
 * secondes, la signature change, et tous les titres français étaient perdus — l'écran retombait sur
 * des titres de secours, ce que Narcisse a vu comme une régression (« tu as littéralement mis
 * "chapitre" »). On apparie donc chaque chapitre au titre gardé dont la plage se RECOUVRE le plus,
 * à condition que le recouvrement couvre l'essentiel du plus LONG des deux : un titre ne se retrouve
 * jamais sur un passage qui n'est pas le sien, ni sur un court extrait d'un passage plus large.
 *
 * @param {object[]} chapters
 * @param {{start: number, end: number, title: string, summary: string}[]} stored
 * @param {{minShare?: number}} [options]
 */
export function matchChapterTitles(chapters, stored, { minShare = 0.6 } = {}) {
  const list = (stored || []).filter((t) => finite(t?.start) && finite(t?.end) && t.end > t.start && t.title);
  if (!list.length) return chapters || [];
  const used = new Set();
  return (chapters || []).map((c) => {
    let best = null;
    let bestShare = 0;
    list.forEach((t, i) => {
      if (used.has(i)) return;
      const ov = overlap(c.start, c.end, t.start, t.end);
      if (ov <= 0) return;
      // Le recouvrement doit couvrir l'essentiel du PLUS LONG des deux : sans cela, un court chapitre
      // tombant à l'intérieur d'un long passage gardé en hériterait le titre, qui ne le décrit pas.
      const share = ov / Math.max(c.end - c.start, t.end - t.start);
      if (share > bestShare) { bestShare = share; best = { t, i }; }
    });
    if (!best || bestShare < minShare) return c;
    used.add(best.i);
    return { ...c, title: best.t.title, summary: best.t.summary || '' };
  });
}

/** Faut-il demander des titres à l'IA ? Seulement s'il y a des paroles à comprendre. */
export function needsChapterTitles(chapters) {
  return Boolean(chapters?.some((c) => c.text));
}

const clock = (t) => {
  const s = Math.max(0, Math.floor(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const DOING = { play: 'il joue sans parler', talk: 'il parle', mixed: 'il parle en jouant', none: 'rien de relevé' };
const MAX_TEXT = 600;
const MAX_TITLE = 60;
const MAX_SUMMARY = 170;
const MAX_SUBJECT = 220;

/**
 * La demande à l'IA (format chat/completions) : un titre et une phrase en français par chapitre, plus
 * « de quoi parle le tuto ». Elle ne reçoit que ce que le moteur a relevé et ne choisit aucune borne.
 */
export function chapterMessages(chapters, { moveTitles = {} } = {}) {
  const list = (chapters || []).map((c) => ({
    id: c.id,
    moment: `${clock(c.start)}–${clock(c.end)}`,
    il: DOING[c.kind] || DOING.none,
    paroles: c.text.slice(0, MAX_TEXT),
    mouvements_releves: c.moves.map((id) => moveTitles[id]).filter(Boolean),
  }));
  return [
    {
      role: 'system',
      content: 'Tu aides un pianiste francophone, débutant ou intermédiaire, à suivre un tutoriel de piano filmé dans une autre langue. '
        + 'Le tuto est découpé en chapitres, comme sur YouTube. Pour chaque chapitre, écris en français simple : un titre court (6 mots au plus) '
        + 'et une phrase (20 mots au plus) qui dit ce que le prof dit ou montre. Écris aussi « sujet » : de quoi parle le tutoriel, en une phrase (25 mots au plus). '
        + 'Appuie-toi UNIQUEMENT sur ce qui est donné : ses paroles (transcription automatique, parfois fausse), ce qu\'il fait (il joue / il parle) et les mouvements relevés. '
        + 'N\'ajoute aucune note, aucun accord, aucune technique qui n\'y est pas. Un chapitre sans paroles : dis seulement qu\'il joue. '
        + 'Ne parle jamais de mains gauche ou droite. Ne change ni les identifiants ni les moments. '
        + 'Réponds par un JSON seul, sans texte autour : {"sujet":"…","chapitres":[{"id":"c1","titre":"…","resume":"…"}]}.',
    },
    { role: 'user', content: `Chapitres :\n${JSON.stringify(list)}` },
  ];
}

const trimTo = (s, max) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** Lit la réponse de l'IA. @returns {{subject: string, byId: Record<string, {title: string, summary: string}>}} */
export function parseChapterTitles(content, chapters) {
  const out = { subject: '', byId: {} };
  const raw = String(content || '');
  const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return out;
  let data;
  try { data = JSON.parse(raw.slice(a, b + 1)); } catch (_) { return out; }
  const known = new Set((chapters || []).map((c) => c.id));
  out.subject = trimTo(data?.sujet, MAX_SUBJECT);
  for (const c of Array.isArray(data?.chapitres) ? data.chapitres : []) {
    if (!c || !known.has(c.id)) continue;
    const title = trimTo(c.titre, MAX_TITLE);
    if (!title) continue;
    out.byId[c.id] = { title, summary: trimTo(c.resume, MAX_SUMMARY) };
  }
  return out;
}

/** Applique les titres français ; les titres factuels restent dans `autoTitle`. */
export function applyChapterTitles(chapters, parsed) {
  return (chapters || []).map((c) => {
    const t = parsed?.byId?.[c.id];
    return t ? { ...c, title: t.title, summary: t.summary } : c;
  });
}
