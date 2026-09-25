// [Claude] — 2026-09-25 — « Qu'en penses-tu ? » : portrait complet d'un passage joué.
//
// Narcisse : « je joue un 2-5-1, l'IA analyse ce que je suis en train de jouer
// et me fait un retour pour me dire ce qui va et ce qui ne va pas », puis « le
// 2-5-1 n'était qu'un exemple : il faut que ce soit pour tout type de demande ».
// Quel que soit le contenu du passage (un accord, un voicing, une progression,
// une gamme, un lick, un run gospel, un arpège, la main gauche seule, un
// morceau), l'application en dresse ici le portrait avec les notes exactes et
// leurs moments :
//   - accords : nom, mains, renversement, type de voicing (shell, rootless A/B,
//     drop 2…), rôle de chaque note, conduite des voix d'un accord au suivant ;
//   - harmonie : tonalité probable, degrés, II-V-I et cadences V-I ;
//   - lignes (mélodie, gamme, lick, run, arpège) : notes dans l'ordre, gamme ou
//     mode reconnu, rôle de chaque note sur l'accord qui sonne (note de
//     l'accord, couleur, approche, passage, note étrangère appuyée) ;
//   - rythme : tempo estimé, régularité, swing ;
//   - son : constats de l'analyse du jeu (pédale, grave boueux, 9es mineures,
//     nuances…), avec leurs notes ;
//   - comparaison à la question quand elle dit ce qui était voulu (accords,
//     tonalité, technique, gamme, arpège).
// Le Copilote reçoit ce portrait (contextLines) et répond à la question posée
// sans rien inventer ; sans clé d'IA, le verdict local s'affiche au clavier.
//
// [Claude] — 2026-09-25 — Ton : l'application est un assistant, pas un coach
// (Narcisse : « ce serait pas très bien vu de simplement dire à l'utilisateur
// qu'il a fait des erreurs […] l'assistant devrait plutôt lui conseiller de
// faire ci ou ça »). Chaque point est une SUGGESTION : ce qui est entendu (moment,
// notes exactes), ce qu'on peut essayer (quelle note à la place de laquelle),
// et pourquoi. Jamais « erreur », « faux », « ne va pas », « à revoir ».

import { buildNoteWindows, segmentSessionEvents, nameChordSegments, clusterAttacks } from './session-analysis.js';
import { analyzeSessionPerformance, frenchNote } from './session-performance.js';
import { classifyVoicing } from '../voicing-engine/voicing-classifier.js';
import { noteRoles, parseChordName, availableTensions, nearestFitting } from '../pedagogie/note-roles.js';

export { nearestFitting };
import { describeVoiceLeading, lineNoteRole, frenchPitchName, degreeWord } from '../pedagogie/example-guide.js';
import { fitScales, extractScaleRequest, scalePitchClasses } from '../pedagogie/scales.js';
import { classifyIntent, extractKey } from '../pedagogie/intent-classifier.js';
import { detectKey } from '../analyzer/key-detector.js';
import { isMinorSymbol, isDominantSymbol } from '../analyzer/harmonic-utils.js';
import { chordToneIntervals } from '../practice-exercise.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const ROOTS_FR = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const TECHNIQUE_WORDS = { drop2: 'drop 2', drop3: 'drop 3', rootless: 'rootless', quartal: 'voicings en quartes', close: 'position serrée' };
// Comment obtenir la technique demandée (conventions de la règle 7 du Copilote).
const TECHNIQUE_TITLES = {
  drop2: 'Pour un vrai drop 2', drop3: 'Pour un vrai drop 3', rootless: 'Pour un voicing rootless',
  quartal: 'Pour des voicings en quartes', close: 'Pour une position serrée',
};
const TECHNIQUE_HINTS = {
  drop2: 'pars de l\'accord serré et descends d\'une octave la 2e note en partant du haut',
  drop3: 'pars de l\'accord serré et descends d\'une octave la 3e note en partant du haut',
  rootless: 'laisse la fondamentale à la basse (ou à la main gauche) et garde 3ce, 7e et une couleur (9e ou 13e)',
  quartal: 'empile des quartes justes à partir d\'une note de l\'accord',
  close: 'resserre les notes de l\'accord dans une octave, à la main droite',
};
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => (xs.length < 2 ? 0 : Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))));

/** Moment précis d'un passage : « 0:02,4 ». */
export function takeMoment(seconds) {
  const t = Math.max(0, seconds || 0);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const whole = Math.floor(s);
  const tenth = Math.floor((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, '0')},${tenth}`;
}

const names = (notes) => notes.map((n) => frenchNote(n)).join(' ');

/** « Fa3 (7e) » : une note avec son rôle dans l'accord. */
function noteWithRole(midi, chord) {
  const role = chord ? noteRoles(chord, [midi])[0] : null;
  return `${frenchNote(midi)}${role?.degree ? ` (${degreeWord(role.degree)})` : ''}`;
}

/** Texte d'un moment sans son horodatage de tête (l'affichage le remet devant). */
export function momentText(moment) {
  return String(moment?.text || '').replace(/^\d+:\d{2}(?:,\d)?\s*:?\s*/, '');
}

// Degré d'un accord dans la tonalité (chiffres romains du jazz, altérés d'après la
// gamme majeure : en Do mineur, Mib = bIII, Lab = bVI, Sib = bVII).
const ROMANS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const romanOf = (rootPc, key) => ROMANS[pcOf(rootPc - key.pc)];

// Question sur une ligne (lick, phrase, impro, run, gamme, arpège) : l'accord
// qu'elle nomme est celui SOUS la ligne, pas un accord à jouer.
const LINE_QUESTION = /\b(?:lick|licks|phrase|impro|improvisation|solo|run|runs|riff|fill|ligne|mélodie|melodie|gamme|arp[eè]ge|montée|descente|trait)s?\b/i;

/** Famille d'un accord pour comparer ce qui était voulu à ce qui est joué. */
function chordFamily(symbol) {
  const q = String(symbol || '');
  if (/m7b5|ø/.test(q)) return 'half-dim';
  if (/dim|°/.test(q)) return 'dim';
  if (/aug|\+/.test(q)) return 'aug';
  if (/sus/.test(q)) return 'sus';
  if (isMinorSymbol(q)) return 'minor';
  if (isDominantSymbol(q)) return 'dominant';
  return 'major';
}

/** Voicing d'un accord joué, pour la conduite des voix (la basse ne conduit pas). */
function voicesOf(chord) {
  const { left, right, oneHand } = chord.hands;
  if (!oneHand) return { name: chord.name, leftHand: left, rightHand: right };
  const all = [...left, ...right].sort((a, b) => a - b);
  // Une main : la fondamentale en bas fait la basse ; sinon toutes les notes sont des voix.
  return pcOf(all[0] - chord.rootPc) === 0
    ? { name: chord.name, leftHand: [all[0]], rightHand: all.slice(1) }
    : { name: chord.name, leftHand: [], rightHand: all };
}

// ── Accords ──

function describeChords(segments) {
  const chords = segments
    .filter((s) => s.type === 'chord' && s.attackNotes?.length && s.rootPc != null)
    .map((seg) => {
      const parsed = parseChordName(seg.chordName) || { name: seg.chordName, rootPc: seg.rootPc, quality: seg.symbol || '', bassPc: seg.bassPc ?? null };
      const voicing = classifyVoicing(seg.attackNotes, seg.rootPc, seg.symbol || '');
      return {
        at: seg.start, end: seg.end, name: seg.chordName, rootPc: seg.rootPc, symbol: seg.symbol || '', bassPc: seg.bassPc,
        matched: seg.matched !== false, notes: seg.attackNotes, hands: voicing.hands, voicing,
        roles: noteRoles(parsed, seg.attackNotes),
      };
    });
  chords.forEach((c, i) => {
    if (chords[i + 1]) c.leading = describeVoiceLeading(voicesOf(c), voicesOf(chords[i + 1]));
  });
  return chords;
}

/**
 * II-V-I et cadences V-I, sans tonalité : quartes ascendantes des fondamentales,
 * mineur (ou demi-diminué) → dominante → accord de repos.
 */
export function findCadences(chords) {
  const out = [];
  const fourthUp = (a, b) => pcOf(b.rootPc - a.rootPc) === 5;
  const isII = (c) => ['minor', 'half-dim'].includes(chordFamily(c.symbol));
  const isV = (c) => ['dominant', 'sus'].includes(chordFamily(c.symbol));
  const isI = (c) => ['major', 'minor'].includes(chordFamily(c.symbol));
  for (let i = 0; i < chords.length; i += 1) {
    const [a, b, c] = [chords[i], chords[i + 1], chords[i + 2]];
    if (a && b && c && isII(a) && isV(b) && isI(c) && fourthUp(a, b) && fourthUp(b, c)) {
      const minor = chordFamily(c.symbol) === 'minor';
      out.push({ type: 'ii-v-i', at: a.at, chords: [a.name, b.name, c.name], label: `II-V-I en ${ROOTS_FR[c.rootPc]} ${minor ? 'mineur' : 'majeur'}` });
      i += 2;
    } else if (a && b && isII(a) && isV(b) && fourthUp(a, b)) {
      out.push({ type: 'ii-v', at: a.at, chords: [a.name, b.name], label: `II-V vers ${ROOTS_FR[pcOf(b.rootPc + 5)]}` });
      i += 1;
    } else if (a && b && isV(a) && isI(b) && fourthUp(a, b)) {
      out.push({ type: 'v-i', at: a.at, chords: [a.name, b.name], label: `cadence V-I vers ${b.name}` });
      i += 1;
    }
  }
  return out;
}

/**
 * Cadences presque justes : les fondamentales font un II-V-I (quartes
 * ascendantes, repos à la fin) mais le II n'est pas mineur ou le V n'est pas une
 * dominante (Fa# dans le G7 d'un II-V-I en Do, Fa# dans le Dm7). La suggestion
 * dit quelle note essayer à la place de laquelle (si c'est voulu, on la garde).
 */
export function cadenceSlips(chords) {
  const slips = [];
  const fourthUp = (a, b) => pcOf(b.rootPc - a.rootPc) === 5;
  for (let i = 0; i + 2 < chords.length; i += 1) {
    const [a, b, c] = [chords[i], chords[i + 1], chords[i + 2]];
    if (!fourthUp(a, b) || !fourthUp(b, c)) continue;
    const famA = chordFamily(a.symbol);
    const famB = chordFamily(b.symbol);
    const famC = chordFamily(c.symbol);
    if (!['major', 'minor'].includes(famC)) continue;
    const iiOk = ['minor', 'half-dim'].includes(famA);
    const vOk = ['dominant', 'sus'].includes(famB);
    if (iiOk && !vOk && famB === 'major') {
      const wrong = b.notes.filter((n) => pcOf(n - b.rootPc) === 11);
      const swaps = wrong.map((n) => `${frenchNote(n - 1)} (7e) à la place de ${frenchNote(n)}`);
      slips.push({
        id: 'cadence-v', title: 'Pour une vraie dominante', at: b.at, chord: b.name, notes: b.notes, problemNotes: wrong, missing: [pcOf(b.rootPc + 10)],
        text: `${takeMoment(b.at)} : ${a.name} → ${b.name} → ${c.name} dessine un II-V-I. Pour que ${ROOTS_FR[b.rootPc]} sonne en dominante (${ROOTS_FR[b.rootPc]}7) et tire vers ${c.name}, essaie ${swaps.join(', ') || `${ROOTS_FR[pcOf(b.rootPc + 10)]} (7e)`} ; si la 7e majeure est voulue, garde-la.`,
      });
    } else if (!iiOk && vOk && famA === 'major') {
      const wrong = a.notes.filter((n) => pcOf(n - a.rootPc) === 4);
      const swaps = wrong.map((n) => `${frenchNote(n - 1)} (3ce mineure) à la place de ${frenchNote(n)}`);
      slips.push({
        id: 'cadence-ii', title: 'Pour un II mineur', at: a.at, chord: a.name, notes: a.notes, problemNotes: wrong, missing: [pcOf(a.rootPc + 3)],
        text: `${takeMoment(a.at)} : ${a.name} → ${b.name} → ${c.name} dessine un II-V-I. Pour un II mineur (${ROOTS_FR[a.rootPc]}m7) qui prépare ${b.name}, essaie ${swaps.join(', ') || `${ROOTS_FR[pcOf(a.rootPc + 3)]} (3ce mineure)`} ; si la tierce majeure est voulue, garde-la.`,
      });
    }
  }
  return slips;
}

// ── Lignes (mélodie, gamme, lick, run, arpège) ──

function describeLines(segments, windows, chords, contextChord = null) {
  // Sans accord joué sous la note, l'accord nommé dans la question (« mon lick sur G7 »).
  const context = contextChord ? parseChordName(contextChord) : null;
  const fallback = context ? { name: context.name, rootPc: context.rootPc } : null;
  const chordAt = (t) => chords.find((c) => c.at - 0.05 <= t && t < c.end + 0.05) || fallback;
  // Notes attaquées avec un accord (même grappe) : elles lui appartiennent.
  const inChordAttack = (w) => chords.some((c) => Math.abs(w.onTime - c.at) <= 0.09 && c.notes.includes(w.note));
  return segments.filter((s) => s.type === 'melody').map((seg) => {
    const notes = windows
      .filter((w) => w.onTime >= seg.start - 1e-6 && w.onTime <= seg.end + 1e-6 && seg.notes.includes(w.note) && !inChordAttack(w))
      .sort((a, b) => a.onTime - b.onTime || a.note - b.note)
      .map((w) => ({ midi: w.note, at: w.onTime, dur: Math.max(0.05, (w.keyOffTime ?? w.offTime) - w.onTime) }));
    if (notes.length === 0) return null;
    const over = notes.map((n) => chordAt(n.at));
    const roles = notes.map((n, i) => ({ ...lineNoteRole(n.midi, over[i]?.name || '', notes[i - 1]?.midi, notes[i + 1]?.midi), midi: n.midi, at: n.at, dur: n.dur, chord: over[i]?.name || null }));
    const overNames = [...new Set(over.filter(Boolean).map((c) => c.name))];
    const longest = notes.reduce((m, n) => (n.dur > m.dur ? n : m), notes[0]);
    const hints = [over.find(Boolean)?.rootPc, notes[notes.length - 1].midi, notes[0].midi, longest.midi].filter(Number.isFinite);
    const scales = notes.length >= 4 ? fitScales(notes.map((n) => ({ pc: n.midi, weight: n.dur })), { tonicHints: hints }) : [];
    return { start: notes[0].at, end: seg.end, notes, roles, over: overNames, scale: scales[0] || null, alternatives: scales.slice(1, 3) };
  }).filter(Boolean);
}

// ── Rythme ──

function describeRhythm(windows, lines) {
  const onsets = clusterAttacks(windows).map((c) => c[0].onTime);
  const iois = onsets.slice(1).map((t, i) => t - onsets[i]).filter((d) => d > 0.05);
  // Pas de tempo « à la noire » : on ne sait pas si une attaque vaut une noire
  // ou une croche. On donne l'écart habituel entre deux attaques.
  const out = { every: null, perMinute: null, steadiness: null, swing: null, onsets: onsets.length };
  if (iois.length >= 3) {
    const beat = median(iois);
    const near = iois.filter((d) => d >= 0.6 * beat && d <= 1.6 * beat);
    out.every = beat;
    out.perMinute = Math.round(60 / beat);
    out.steadiness = near.length >= 3 ? sd(near) / mean(near) : null;
  }
  // Swing : croches longue / brève qui alternent dans une ligne.
  const ratios = [];
  for (const line of lines) {
    const d = line.notes.slice(1).map((n, i) => n.at - line.notes[i].at);
    for (let i = 0; i + 1 < d.length; i += 2) if (d[i + 1] > 0.05) ratios.push(d[i] / d[i + 1]);
  }
  if (ratios.length >= 3) {
    const r = median(ratios);
    if (r >= 1.3 && r <= 2.6 && ratios.filter((x) => x > 1.15).length / ratios.length >= 0.7) out.swing = { ratio: Math.round(r * 10) / 10, feel: 'swing' };
    else if (r >= 0.85 && r <= 1.15) out.swing = { ratio: Math.round(r * 10) / 10, feel: 'droit' };
  }
  return out;
}

// ── Comparaison à la demande ──

function compareToQuestion(question, chords, lines, expect = null) {
  const out = { asked: [], issues: [], strengths: [], expected: null, key: null, scale: null };
  const text = String(question || '').trim();
  // [Claude] — 2026-09-25 — Attentes explicites (l'exercice en cours) : elles passent
  // avant la lecture de la question ; un accord de l'exercice non joué n'est pas
  // signalé (on peut ne jouer que l'accord en cours), sauf si aucun n'est entendu.
  const fromExercise = Boolean(expect?.chords?.length);
  if (!text && !fromExercise) return out;
  const intent = text ? classifyIntent(text) : { params: {} };
  const params = { ...(intent.params || {}) };
  if (fromExercise) {
    params.chords = expect.chords;
    params.chordSymbol = null;
    if (expect.technique) params.technique = expect.technique;
    out.asked.push(`exercice : ${expect.label || expect.chords.join(' → ')}`);
  }
  const key = fromExercise && Number.isInteger(expect.keyPc) ? { rootPc: expect.keyPc, minor: Boolean(expect.minor), fromExercise: true } : extractKey(text);
  if (key) out.key = key;

  // Accords voulus (une grille, un II-V-I, un accord seul) ; pour une question sur
  // une ligne (« mon lick sur G7 »), l'accord nommé est celui sous la ligne.
  const aboutLine = !fromExercise && LINE_QUESTION.test(text) && lines.length > 0;
  if (aboutLine && params.chordSymbol) out.contextChord = params.chordSymbol;
  const expected = aboutLine ? [] : params.chords?.length ? params.chords : params.chordSymbol ? [params.chordSymbol] : [];
  if (expected.length && chords.length) {
    out.expected = expected;
    out.asked.push(`accords ${expected.join(' → ')}`);
    let from = 0;
    const rows = expected.map((name) => {
      const want = parseChordName(name);
      if (!want) return null;
      let idx = chords.findIndex((c, i) => i >= from && c.rootPc === want.rootPc);
      // Joué sans fondamentale (rootless : Fa La Do Mi pour Dm9, que le détecteur
      // lit Fmaj7) : toutes ses notes sont dans l'accord voulu, 3ce et 7e comprises.
      let rootless = false;
      if (idx < 0) {
        const fits = (c) => {
          const rels = c.notes.map((n) => pcOf(n - want.rootPc));
          const tones = chordToneIntervals(want.quality);
          const tensions = availableTensions(want.quality);
          return rels.every((i) => tones.has(i) || tensions.has(i)) && rels.some((i) => i === 3 || i === 4) && rels.some((i) => i === 10 || i === 11 || i === 9);
        };
        idx = chords.findIndex((c, i) => i >= from && fits(c));
        rootless = idx >= 0;
      }
      if (idx < 0) return { name, status: 'missing' };
      from = idx + 1;
      const played = chords[idx];
      if (rootless) {
        // Lu comme l'accord voulu : rôles et voicing par rapport à lui (Dm9 : b3 5 b7 9, rootless A).
        played.asked = `${want.name} sans fondamentale (rootless)`;
        played.readAs = want.name;
        played.roles = noteRoles(want, played.notes);
        played.voicing = classifyVoicing(played.notes, want.rootPc, want.quality);
        return { name, status: 'rootless', played, problemNotes: [], missing: [] };
      }
      const same = played.symbol === want.quality;
      const status = same ? 'exact' : chordFamily(played.symbol) === chordFamily(want.quality)
        || (chordFamily(want.quality) === 'dominant' && chordFamily(played.symbol) === 'sus') ? 'variant' : 'wrong-quality';
      // Notes étrangères à l'accord voulu (ni ses notes, ni ses tensions) ; notes guides absentes.
      const tones = chordToneIntervals(want.quality);
      const tensions = availableTensions(want.quality);
      const problemNotes = played.notes.filter((n) => !tones.has(pcOf(n - want.rootPc)) && !tensions.has(pcOf(n - want.rootPc)));
      const guides = [...tones].filter((i) => [3, 4, 10, 11].includes(i) || (/6|dim7/.test(want.quality) && i === 9));
      const missing = guides.filter((i) => !played.notes.some((n) => pcOf(n - want.rootPc) === i));
      return { name, status, played, problemNotes, missing: missing.map((i) => pcOf(want.rootPc + i)) };
    }).filter(Boolean);
    // Exercice : seuls les accords joués comptent (sauf si aucun n'est entendu).
    const heardAny = rows.some((r) => r.status !== 'missing');
    const considered = fromExercise && heardAny ? rows.filter((r) => r.status !== 'missing') : rows;
    const bad = considered.filter((r) => r.status === 'missing' || r.status === 'wrong-quality');
    if (fromExercise && !heardAny) {
      out.issues.push({ id: 'intent-missing', title: 'Accords de l\'exercice pas entendus', at: null, chord: null, notes: [], problemNotes: [], missing: [], text: `Je n'entends pas les accords de l'exercice (${expected.join(' → ')}) dans ce passage : rejoue l'accord en cours (ou le mouvement) si tu veux que je l'écoute.` });
    } else if (bad.length === 0) {
      const variants = rows.filter((r) => r.status === 'variant').map((r) => `${r.played.name} pour ${r.name}`);
      const rootlessRows = rows.filter((r) => r.status === 'rootless').map((r) => `${r.played.notes.map((n) => frenchNote(n)).join(' ')} = ${r.name} sans fondamentale`);
      out.strengths.push({ id: 'intent-chords', text: `Les accords voulus sont là : ${considered.map((r) => (r.status === 'rootless' ? r.name : r.played.name)).join(' → ')}${variants.length ? ` (${variants.join(', ')} : même fonction, couleurs en plus)` : ''}${rootlessRows.length ? ` (${rootlessRows.join(' ; ')} : voicing rootless, la basse ou la main gauche prend la fondamentale)` : ''}.` });
    }
    for (const r of fromExercise && !heardAny ? [] : bad) {
      if (r.status === 'missing') {
        out.issues.push({ id: 'intent-missing', title: `${r.name} pas entendu`, at: null, chord: r.name, notes: [], problemNotes: [], missing: [], text: `Je n'entends pas ${r.name} dans ce passage : rejoue-le si tu veux que je l'écoute.` });
      } else {
        const want = parseChordName(r.name);
        // Chaque note étrangère à l'accord voulu → la note la plus proche qui y entre
        // (une note guide qui manque d'abord) ; les notes guides encore absentes s'ajoutent.
        const swaps = r.problemNotes.map((from) => ({ from, to: nearestFitting(from, { chord: want, prefer: r.missing }) })).filter((x) => x.to != null);
        const covered = new Set(swaps.map((x) => pcOf(x.to)));
        const adds = r.missing.filter((pc) => !covered.has(pc));
        const swapText = swaps.map((x) => `${noteWithRole(x.to, want)} à la place de ${frenchNote(x.from)}`).join(', ');
        const addText = adds.map((pc) => `${frenchPitchName(pc, want)} (${degreeWord(noteRoles(want, [pc + 60])[0]?.degree || '')})`).join(', ');
        const idea = swapText ? `essaie ${swapText}${addText ? ` et ajoute ${addText}` : ''}` : addText ? `ajoute ${addText}` : '';
        out.issues.push({
          id: 'intent-chord', title: `Pour retrouver ${r.name}`, at: r.played.at, chord: r.played.name, notes: r.played.notes,
          problemNotes: r.problemNotes, missing: r.missing, fixChord: r.name,
          text: `${takeMoment(r.played.at)} : pour ${r.name}, j'entends ${r.played.name} (${names(r.played.notes)})${idea ? ` ; ${idea}` : ''}.`,
        });
      }
    }
  }

  // Technique voulue (drop 2, rootless…).
  if (params.technique && chords.length) {
    const word = TECHNIQUE_WORDS[params.technique] || params.technique;
    out.asked.push(`technique ${word}`);
    const hits = chords.filter((c) => c.voicing.technique === params.technique);
    if (hits.length === chords.length) {
      out.strengths.push({ id: 'intent-technique', text: `${word} bien réalisé${chords.length > 1 ? ' sur chaque accord' : ''}.` });
    } else {
      const other = chords.filter((c) => c.voicing.technique !== params.technique);
      const hint = TECHNIQUE_HINTS[params.technique];
      out.issues.push({
        id: 'intent-technique', title: TECHNIQUE_TITLES[params.technique] || `Pour du ${word}`, at: other[0].at, chord: other[0].name, notes: other[0].notes, problemNotes: [], missing: [],
        text: `${other.slice(0, 3).map((c) => `${takeMoment(c.at)} ${c.name} se lit en ${c.voicing.label}${c.voicing.detail ? ` (${c.voicing.detail})` : ''}`).join(' ; ')}${hint ? ` ; pour du ${word}, ${hint}` : ''}.`,
      });
    }
  }

  // Gamme ou arpège voulus.
  const scaleAsked = extractScaleRequest(text);
  const lineNotes = lines.flatMap((l) => l.notes);
  const pool = lineNotes.length ? lineNotes : chords.flatMap((c) => c.notes.map((midi) => ({ midi, at: c.at })));
  if (scaleAsked && pool.length) {
    let allowed;
    let label;
    if (scaleAsked.kind === 'arpeggio') {
      const c = parseChordName(scaleAsked.chord);
      allowed = c ? [...chordToneIntervals(c.quality)].map((i) => pcOf(c.rootPc + i)) : null;
      label = `arpège de ${scaleAsked.chord}`;
    } else {
      allowed = scalePitchClasses(scaleAsked.rootPc, scaleAsked.scaleId);
      label = scaleAsked.label;
    }
    if (allowed?.length) {
      out.scale = { ...scaleAsked, label };
      out.asked.push(label);
      const outside = pool.filter((n) => !allowed.includes(pcOf(n.midi)));
      if (outside.length === 0) {
        out.strengths.push({ id: 'intent-scale', text: `${label} : toutes les notes y sont (${pool.length} notes).` });
      } else {
        const swaps = outside.slice(0, 4).map((n) => {
          const to = nearestFitting(n.midi, { pcs: allowed });
          return `${takeMoment(n.at)} ${to != null ? `${frenchNote(to)} à la place de ${frenchNote(n.midi)}` : frenchNote(n.midi)}`;
        });
        out.issues.push({
          id: 'intent-scale', title: `Pour rester dans ${label}`, at: outside[0].at, chord: null, notes: [...new Set(pool.map((n) => n.midi))], problemNotes: [...new Set(outside.map((n) => n.midi))], missing: [],
          suggestions: outside.map((n) => ({ from: n.midi, to: nearestFitting(n.midi, { pcs: allowed }) })),
          text: `${outside.length} note${outside.length > 1 ? 's' : ''} sort${outside.length > 1 ? 'ent' : ''} de ${label} ; si ce n'est pas un passage voulu, essaie ${swaps.join(', ')}.`,
        });
      }
    }
  }
  return out;
}

// ── Portrait ──

/**
 * Portrait d'un passage joué (voir l'en-tête).
 * @param {object[]} events - évènements au format de l'enregistreur, temps en secondes depuis le début du passage
 * @param {{question?: string, expect?: {chords: string[], technique?: string|null, keyPc?: number|null, minor?: boolean, label?: string}|null}} [options]
 *   question du pianiste (ce qu'il voulait jouer) ; expect : attentes explicites (l'exercice en cours)
 * @returns {object|null}
 */
export function reviewTake(events, { question = '', expect = null } = {}) {
  const sorted = [...(events || [])].filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sorted);
  if (windows.length === 0) return null;
  const segments = nameChordSegments(segmentSessionEvents(sorted));
  const chords = describeChords(segments);
  // Accord nommé par une question sur une ligne (« mon lick sur G7 ») : sous la
  // ligne quand aucun accord n'est joué avec elle.
  const text = String(question || '');
  const lineChord = LINE_QUESTION.test(text) ? classifyIntent(text).params?.chordSymbol || null : null;
  const lines = describeLines(segments, windows, chords, lineChord);
  const duration = Math.max(0, Math.max(...sorted.map((e) => e.time)) - windows[0].onTime);
  const rhythm = describeRhythm(windows, lines);
  const perf = analyzeSessionPerformance(sorted);
  const cadences = findCadences(chords);
  const lineNoteCount = lines.reduce((n, l) => n + l.notes.length, 0);
  const intent = compareToQuestion(question, chords, lines, expect);
  // Tonalité : celle que la question annonce (« un 2-5-1 en Fa »), sinon celle
  // que l'application entend (assez de matière : trois accords ou huit notes).
  let key = null;
  if (intent.key) {
    const mode = intent.key.minor ? 'minor' : 'major';
    key = { pc: intent.key.rootPc, mode, label: `${ROOTS_FR[intent.key.rootPc]} ${mode === 'minor' ? 'mineur' : 'majeur'}`, confidence: 1, source: intent.key.fromExercise ? 'exercice' : 'question' };
  } else if (chords.length >= 3 || lineNoteCount >= 8) {
    const found = detectKey(sorted, chords.map((c) => ({ rootPc: c.rootPc, symbol: c.symbol, duration: Math.max(0.2, c.end - c.at) })));
    if (found) key = { pc: found.pc, mode: found.mode, label: `${ROOTS_FR[found.pc]} ${found.mode === 'minor' ? 'mineur' : 'majeur'}`, confidence: found.confidence, source: 'jeu' };
  }
  // Un II-V-I entendu dit la tonalité mieux que le profil des notes (qui prend
  // volontiers la dominante pour la tonique) : sa tonique l'emporte.
  const cadenceKey = cadences.find((c) => c.type === 'ii-v-i');
  if (cadenceKey && key?.source !== 'question' && key?.source !== 'exercice') {
    const tonic = chords.find((c) => c.name === cadenceKey.chords[2]);
    if (tonic) {
      const mode = /mineur$/.test(cadenceKey.label) ? 'minor' : 'major';
      key = { pc: tonic.rootPc, mode, label: `${ROOTS_FR[tonic.rootPc]} ${mode === 'minor' ? 'mineur' : 'majeur'}`, confidence: Math.max(0.8, key?.confidence || 0), source: 'cadence' };
    }
  }
  // Degrés seulement dans une tonalité sûre (annoncée, ou entendue à 60 % au moins).
  if (key && key.confidence >= 0.6) chords.forEach((c) => { c.degree = romanOf(c.readAs ? parseChordName(c.readAs).rootPc : c.rootPc, key); });
  const kind = chords.length && lineNoteCount >= 4 ? 'mixed' : chords.length ? (chords.length === 1 ? 'chord' : 'chords') : 'line';

  // Lignes : notes étrangères appuyées (longues, pas résolues par un demi-ton / ton).
  const lineIssues = [];
  for (const line of lines) {
    const long = median(line.notes.map((n) => n.dur)) * 1.8;
    const leaned = line.roles.filter((r) => r.kind === 'outside' && r.dur >= Math.max(0.35, long) && r.chord);
    if (leaned.length) {
      const ideas = leaned.slice(0, 3).map((r) => {
        const to = nearestFitting(r.midi, { chord: r.chord });
        return `${takeMoment(r.at)} ${frenchNote(r.midi)} tenue sur ${r.chord}${to != null ? ` → glisse vers ${noteWithRole(to, r.chord)}` : ''}`;
      });
      lineIssues.push({
        id: 'line-outside', title: 'Faire résoudre une note tenue', at: leaned[0].at, chord: leaned[0].chord,
        notes: [...new Set(line.notes.map((n) => n.midi))], problemNotes: [...new Set(leaned.map((r) => r.midi))], missing: [],
        text: `${ideas.join(' ; ')} : une note hors de l'accord, tenue, crée une tension ; si elle est voulue, garde-la, sinon fais-la glisser d'un demi-ton ou d'un ton vers la note de l'accord indiquée.`,
      });
    }
  }

  // Suggestions : la demande d'abord, puis l'harmonie, le son (avec leurs cas), les lignes.
  // Une cadence presque juste n'est proposée que si la question n'a pas déjà dit
  // quels accords étaient voulus (la comparaison le fait alors, plus précisément).
  const slips = intent.expected?.length ? [] : cadenceSlips(chords);
  const perfIssues = (perf?.issues || []).map((f) => ({ ...f, moments: f.details || [] }));
  const issues = [
    ...intent.issues.map((i) => ({ ...i, moments: i.at != null ? [i] : [] })),
    ...slips.map((i) => ({ ...i, moments: [i] })),
    ...perfIssues.map((f) => ({ id: f.id, title: f.title, text: f.text, severity: f.severity, moments: f.moments })),
    ...lineIssues.map((i) => ({ ...i, moments: [i] })),
  ];
  const strengths = [...intent.strengths, ...(perf?.strengths || [])];
  const resolutions = chords.filter((c) => c.leading?.moves.some((m) => m.kind === 'resolution'));
  if (chords.length >= 2 && resolutions.length >= Math.max(1, (chords.length - 1) / 2)) {
    strengths.push({ id: 'guide-tones', text: `Conduite des voix : ${resolutions.length === chords.length - 1 ? 'à chaque changement' : `${resolutions.length} fois`}, la 7e descend sur la 3ce de l'accord suivant (${resolutions[0].leading.text}).` });
  }
  const scaleLine = lines.find((l) => l.scale && l.notes.length >= 5);
  if (scaleLine && scaleLine.scale.outside.length === 0 && !intent.scale) {
    strengths.push({ id: 'line-scale', text: `Ligne cohérente : ${scaleLine.notes.length} notes toutes dans ${scaleLine.scale.label}.` });
  }

  // Moments à montrer au clavier (suggestions), dans l'ordre du passage.
  const moments = issues.flatMap((i) => i.moments.map((m) => ({ ...m, title: i.title, issueId: i.id })))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at);

  const review = {
    duration, noteCount: windows.length, kind, question: String(question || '').trim(),
    chords, lines, key, cadences, rhythm, perf, intent, issues, strengths, moments,
  };
  review.verdict = takeVerdict(review);
  review.contextLines = takeContextLines(review);
  return review;
}

/** Verdict d'une ligne (légende du clavier, sans clé d'IA). */
export function takeVerdict(review) {
  const { chords, lines, cadences, intent, issues } = review;
  const count = issues.length;
  const tail = count ? ` · ${count} suggestion${count > 1 ? 's' : ''}` : ' · rien à suggérer';
  if (intent.expected?.length) {
    const wrong = intent.issues.filter((i) => i.id === 'intent-chord' || i.id === 'intent-missing').length;
    const cadence = cadences.find((c) => c.type === 'ii-v-i');
    const label = intent.expected.length === 3 && cadence ? cadence.label : intent.expected.join(' → ');
    const played = chords.slice(0, 6).map((c) => (c.readAs ? `${c.readAs} rootless` : c.name)).join(' → ');
    // Exercice dont aucun accord n'est entendu.
    if (intent.issues.some((i) => i.id === 'intent-missing' && !i.chord)) return `${label} : je n'entends pas ces accords (${played || 'aucun accord'})`;
    return `${label} : ${wrong ? `une piste pour ${wrong} accord${wrong > 1 ? 's' : ''}` : 'les accords voulus sont là'} (${played})${count > wrong ? ` · ${count - wrong} autre${count - wrong > 1 ? 's' : ''} suggestion${count - wrong > 1 ? 's' : ''}` : ''}`;
  }
  if (intent.contextChord && lines.length) {
    const roles = lines.flatMap((l) => l.roles);
    const chordish = roles.filter((r) => ['root', 'guide', 'fifth', 'color', 'bass'].includes(r.kind)).length;
    const passing = roles.filter((r) => r.kind === 'passing').length;
    const outside = roles.filter((r) => r.kind === 'outside').length;
    return `Ligne sur ${intent.contextChord} : ${roles.length} notes · ${chordish} de l'accord ou couleurs · ${passing} de passage · ${outside} étrangère${outside > 1 ? 's' : ''}${tail}`;
  }
  if (intent.scale) {
    const scaleIssue = intent.issues.find((i) => i.id === 'intent-scale');
    return `${intent.scale.label} : ${scaleIssue ? `${scaleIssue.problemNotes.length} note${scaleIssue.problemNotes.length > 1 ? 's' : ''} à rapprocher de la gamme` : 'toutes les notes y sont'}`;
  }
  if (chords.length === 1 && !lines.length) {
    const c = chords[0];
    return `${c.readAs || c.name} : ${c.voicing.label}${c.voicing.detail ? ` (${c.voicing.detail})` : ''}${tail}`;
  }
  if (chords.length) {
    const grid = chords.slice(0, 6).map((c) => c.name).join(' → ') + (chords.length > 6 ? ' …' : '');
    return `${grid}${cadences[0] ? ` · ${cadences[0].label}` : ''}${tail}`;
  }
  const line = lines.find((l) => l.scale) || lines[0];
  return `${line.notes.length} notes${line.scale ? ` · ${line.scale.label}` : ''}${tail}`;
}

/**
 * Portrait en texte compact pour le Copilote (notes exactes, moments précis).
 * @param {{title?: string, maxChords?: number}} [options] - une session : titre à elle, 60 accords détaillés
 */
export function takeContextLines(review, { title = '## Passage joué au clavier (« Qu\'en penses-tu ? »)', maxChords = 40 } = {}) {
  const { chords, lines, key, cadences, rhythm, perf, intent, question } = review;
  const isTake = /Qu'en penses-tu/.test(title);
  const out = [];
  out.push(title);
  const pedal = perf?.stats ? Math.round(perf.stats.pedalRatio * 100) : 0;
  const velocity = perf?.stats?.velocity ? `vélocité ${perf.stats.velocity.low} à ${perf.stats.velocity.high} sur 127` : 'vélocité constante (clavier virtuel ou sans nuances)';
  out.push(`Durée : ${takeMoment(review.duration)} · ${review.noteCount} notes · pédale ${pedal} % du temps · ${velocity}`);
  if (isTake) out.push(`Question du pianiste : « ${question || 'Qu\'en penses-tu de ce que je viens de jouer ?'} »`);
  if (intent.asked.length) out.push(`Ce qu'il voulait jouer : ${intent.asked.join(' ; ')}`);
  if (chords.length) {
    out.push('');
    out.push('### Accords (moment · nom [degré] · main gauche | main droite · voicing reconnu · rôles · conduite des voix vers le suivant)');
    for (const c of chords.slice(0, maxChords)) {
      const hands = c.hands.oneHand ? `une main : ${names([...c.hands.left, ...c.hands.right])}` : `${names(c.hands.left)} | ${names(c.hands.right)}`;
      const roles = c.roles.map((r) => (r.kind === 'outside' ? `${r.degree}!` : r.degree)).join(' ');
      const voicing = `${c.voicing.label}${c.voicing.detail ? ` (${c.voicing.detail})` : ''}, ${c.voicing.inversion}`;
      out.push(`- ${takeMoment(c.at)} ${c.name}${c.asked ? ` (= ${c.asked})` : ''}${c.degree ? ` [${c.degree}]` : ''}${c.matched ? '' : ' (non reconnu)'} · ${hands} · ${voicing} · ${roles}${c.leading?.text ? ` · → ${c.leading.text}` : ''}`);
    }
    if (chords.length > maxChords) {
      // Au-delà : la grille seule (moments et noms), pour garder le contexte borné.
      const rest = chords.slice(maxChords);
      out.push(`- … puis ${rest.length} accords (grille seule) : ${rest.slice(0, 80).map((c) => `${takeMoment(c.at)} ${c.name}`).join(' · ')}${rest.length > 80 ? ' …' : ''}`);
    }
  }
  if (lines.length) {
    out.push('');
    out.push('### Lignes (mélodie, gamme, lick, run, arpège : notes dans l\'ordre, rôle sur l\'accord qui sonne)');
    for (const l of lines.slice(0, 10)) {
      const notes = l.roles.slice(0, 32).map((r) => `${frenchNote(r.midi)}${r.chord ? `(${r.kind === 'passing' ? 'passage' : r.kind === 'outside' ? `${r.label}!` : r.label})` : ''}`).join(' ');
      const scale = l.scale ? ` · gamme reconnue : ${l.scale.label}${l.scale.outside.length ? ` (${l.scale.outside.length} note(s) hors gamme)` : ''}${l.alternatives.length ? ` [ou ${l.alternatives.map((a) => a.label).join(', ')}]` : ''}` : '';
      out.push(`- ${takeMoment(l.start)} : ${notes}${l.notes.length > 32 ? ' …' : ''} (${l.notes.length} notes)${l.over.length ? ` sur ${l.over.join(', ')}` : ''}${scale}`);
    }
  }
  const harmony = [];
  if (key) {
    harmony.push(key.source === 'exercice' ? `tonalité de l'exercice : ${key.label}`
      : key.source === 'question' ? `tonalité annoncée par le pianiste : ${key.label}`
      : key.source === 'cadence' ? `tonalité ${key.label} (d'après le II-V-I)`
        : `tonalité probable ${key.label} (confiance ${Math.round(key.confidence * 100)} %)`);
  }
  if (cadences.length) harmony.push(cadences.map((c) => `${c.label} à ${takeMoment(c.at)} (${c.chords.join(' → ')})`).join(' ; '));
  if (harmony.length) {
    out.push('');
    out.push(`### Harmonie : ${harmony.join(' · ')}`);
  }
  const rhythmParts = [];
  if (rhythm.every) rhythmParts.push(`une attaque toutes les ${String(Math.round(rhythm.every * 100) / 100).replace('.', ',')} s environ (≈ ${rhythm.perMinute} par minute)`);
  if (rhythm.steadiness != null) rhythmParts.push(`régularité des attaques ±${Math.round(rhythm.steadiness * 100)} %`);
  if (rhythm.swing) rhythmParts.push(rhythm.swing.feel === 'swing' ? `croches swinguées (longue / brève = ${String(rhythm.swing.ratio).replace('.', ',')})` : 'notes égales (pas de swing)');
  if (rhythmParts.length) {
    out.push('');
    out.push(`### Rythme : ${rhythmParts.join(' · ')}`);
  }
  out.push('');
  out.push('### Observations de l\'application (seule source des suggestions ; moments m:ss,d)');
  out.push('Ce qui marche :');
  if (review.strengths.length) review.strengths.slice(0, 5).forEach((s) => out.push(`- ${s.text}`));
  else out.push('- (rien de mesurable à souligner)');
  out.push('Suggestions (à proposer comme des conseils) :');
  if (review.issues.length) {
    review.issues.slice(0, 6).forEach((i) => {
      out.push(`- ${i.title} : ${i.text}`);
      (i.moments || []).slice(0, 4).forEach((m) => {
        if (m.text === i.text) return;
        out.push(`  · ${takeMoment(m.at)}${m.chord ? ` ${m.chord}` : ''} : ${momentText(m)}${m.notes?.length ? ` (joué : ${names(m.notes)})` : ''}`);
      });
    });
  } else {
    out.push('- (aucune : rien de mesurable à changer)');
  }
  return out;
}

/**
 * Le passage en exemple réécoutable (même lecteur que les exemples du Copilote :
 * touches allumées en jaune, pédale rejouée).
 * @param {object[]} events - évènements du passage (secondes)
 * @param {object} review - reviewTake(events)
 * @returns {object|null} exemple ({kind: 'take', events en temps (tempo 60 : un temps = une seconde), beats})
 */
export function passageToExample(events, review, { maxEvents = 1500 } = {}) {
  const list = (events || []).filter((e) => Number.isFinite(e?.time));
  if (!list.length || list.length > maxEvents || !review) return null;
  const out = [];
  for (const e of list) {
    if (e.type === 'note_on' && e.velocity > 0) out.push({ time: e.time, type: 'noteOn', note: e.note, velocity: e.velocity > 1 ? e.velocity / 127 : e.velocity });
    else if (e.type === 'note_off' || (e.type === 'note_on' && !(e.velocity > 0))) out.push({ time: e.time, type: 'noteOff', note: e.note });
    else if (e.type === 'control' && e.controller === 64) out.push({ time: e.time, type: 'sustain', value: e.value >= 64 });
  }
  const order = { noteOff: 0, sustain: 1, noteOn: 2 };
  out.sort((a, b) => a.time - b.time || order[a.type] - order[b.type]);
  const beats = Math.max(0, ...out.map((e) => e.time));
  return { kind: 'take', title: 'Ton passage', subtitle: review.verdict, style: null, tempo: 60, events: out, beats, chords: [] };
}
