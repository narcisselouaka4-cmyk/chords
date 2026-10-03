// [Claude] — 2026-09-24 — Analyse du jeu d'une session MIDI (Copilote, carnet).
//
// Narcisse : « pouvoir transférer une session MIDI vers le Copilote IA pour qu'il
// analyse le jeu, donne des conseils et pointe ce qui ne va pas ». Le Copilote ne
// recevait que la grille des accords : il ne pouvait rien dire du jeu lui-même.
// Ici, l'application mesure ce que le MIDI permet de mesurer sans se tromper ;
// le Copilote commente ces constats (son prompt lui interdit d'en inventer) :
//   - pédale gardée pendant un changement d'accord : des notes de l'accord
//     précédent, relâchées au clavier, sonnent encore sur le suivant ;
//   - voicings boueux dans le grave (limites d'intervalles graves de Levine,
//     les mêmes que le moteur de voicings) ;
//   - frottements de 9e mineure entre deux voix (hors b9 d'une dominante) ;
//   - accords qu'aucun modèle n'explique (note étrangère ou voicing très rare) ;
//   - voix du dessus : sauts d'un accord à l'autre, ou enchaînement soigné ;
//   - nuances, équilibre des mains, voix du dessus qui ressort ou non (seulement
//     si le clavier transmet la vélocité : au clavier virtuel, elle est fixe) ;
//   - régularité des changements d'accords (seulement quand ils reviennent à
//     intervalles à peu près réguliers), arrêts de plus de deux secondes ;
//   - accords attaqués ensemble ou en ordre dispersé ;
//   - vocabulaire : triades, 7e, couleurs (9e, 11e, 13e), accords de tension.
// Chaque constat garde ses moments (secondes) pour le carnet et le Copilote.
// [Claude] — 2026-09-25 — Ton : l'application est un assistant, pas un coach
// (Narcisse). Un point à travailler est dit comme une SUGGESTION : ce qu'on
// propose d'essayer, puis ce qui est entendu (moments, notes) ; jamais « erreur »,
// « faux », « ne va pas ». Le titre dit le conseil (« Relever la pédale aux
// changements »), pas le défaut.
// [Claude] — 2026-09-25 — … et ses cas (`details`) : moment, accord, notes jouées,
// notes en cause (celles qui traînent, qui frottent, qui sautent), phrase
// courte. Le carnet les montre au clavier ; le Copilote les reçoit en notes
// exactes (Narcisse : « je n'arrive pas à situer exactement où […] et pourquoi »).

import { buildNoteWindows, segmentSessionEvents, nameChordSegments, clusterAttacks } from './session-analysis.js';
import { noteRoles, nearestFitting } from '../pedagogie/note-roles.js';
import { LOW_INTERVAL_LIMITS, minorNinthClashes } from '../voicing-engine/textbook-voicings.js';
import { isTensionQuality } from '../practice-exercise.js';

const FRENCH = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];
const INTERVALS = {
  1: 'seconde mineure', 2: 'seconde majeure', 3: 'tierce mineure', 4: 'tierce majeure', 5: 'quarte',
  6: 'triton', 7: 'quinte', 8: 'sixte mineure', 9: 'sixte majeure', 10: 'septième mineure',
  11: 'septième majeure', 13: 'neuvième mineure', 14: 'neuvième majeure', 15: 'dixième mineure', 16: 'dixième majeure',
};

const pcOf = (n) => ((n % 12) + 12) % 12;
const sortedUnique = (notes) => [...new Set(notes)].sort((a, b) => a - b);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const quantile = (xs, q) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const median = (xs) => quantile(xs, 0.5);
/** Vélocité ramenée entre 0 et 1 (0–127 pour un fichier MIDI importé). */
const velocityOf = (w) => (w.velocity > 1 ? w.velocity / 127 : w.velocity);
const on127 = (v) => Math.round(v * 127);

/** Nom français d'une note avec son octave (Do4 = 60). */
export function frenchNote(midi) {
  return `${FRENCH[pcOf(midi)]}${Math.floor(midi / 12) - 1}`;
}

/** Moment mm:ss (m:ss). */
export function formatMoment(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const seconds1 = (s) => `${(Math.round(s * 10) / 10).toString().replace('.', ',')} s`;
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** Intervalles où la pédale de sustain est enfoncée. */
function pedalIntervals(events, end) {
  const intervals = [];
  let down = null;
  for (const ev of events) {
    if (ev.type !== 'control' || ev.controller !== 64) continue;
    const on = ev.value >= 64;
    if (on && down == null) down = ev.time;
    else if (!on && down != null) {
      intervals.push({ start: down, end: ev.time });
      down = null;
    }
  }
  if (down != null) intervals.push({ start: down, end: Math.max(end, down) });
  return intervals;
}

/** Première paire de voix voisines sous sa limite grave (Levine), ou null. */
function muddyPair(notes) {
  const s = sortedUnique(notes);
  for (let i = 1; i < s.length; i += 1) {
    const limit = LOW_INTERVAL_LIMITS[s[i] - s[i - 1]];
    if (limit != null && s[i - 1] < limit) return { low: s[i - 1], high: s[i], limit };
  }
  return null;
}

/** Famille d'un accord pour le vocabulaire : triade, 7e, couleur, tension. */
function chordFamily(symbol) {
  const q = String(symbol ?? '');
  if (isTensionQuality(q)) return 'tension';
  if (/9|11|13|6\/9|add/.test(q)) return 'color';
  if (/7|6/.test(q)) return 'seventh';
  return 'triad';
}

/**
 * Notes probablement ajoutées à un accord non reconnu : celles qui sont étrangères
 * à l'accord qu'on lit malgré elles (ni note de l'accord, ni tension disponible).
 */
function foreignNotes(chord) {
  if (chord.rootPc == null) return [];
  return noteRoles({ rootPc: chord.rootPc, quality: chord.symbol || '', bassPc: chord.bassPc ?? null }, chord.attackNotes)
    .filter((r) => r.kind === 'outside').map((r) => r.midi).slice(0, 2);
}

/** Moments (m:ss) d'une liste de cas, trois au plus. */
const moments = (cases, describe) => cases.slice(0, 3).map(describe).join(' ; ');

/**
 * Analyse du jeu d'une session.
 * @param {object[]} events - évènements MIDI de la session ({type, time, note, velocity, controller, value})
 * @param {{tempo?: number|null, latin?: boolean}} [options] - latin : noms d'accords Do, Ré, Mi (comme le carnet)
 * @returns {{stats: object, strengths: object[], issues: object[]}|null}
 *   constat = { id, title, text, times: number[], severity? (1 à 3, pour les suggestions),
 *     details?: {at: number, chord: string|null, from?: string, notes: number[], problemNotes: number[], text: string}[] }
 */
export function analyzeSessionPerformance(events, { tempo = null, latin = false } = {}) {
  const sorted = [...(events || [])].filter((e) => Number.isFinite(e?.time)).sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sorted);
  if (windows.length === 0) return null;
  const segments = nameChordSegments(segmentSessionEvents(sorted), { latin });
  const chords = segments.filter((s) => s.type === 'chord' && s.attackNotes?.length);
  const first = windows[0].onTime;
  const last = Math.max(...sorted.map((e) => e.time));
  const duration = Math.max(0, last - first);
  const pedal = pedalIntervals(sorted, last);
  const pedalTime = pedal.reduce((sum, p) => sum + Math.max(0, Math.min(p.end, last) - Math.max(p.start, first)), 0);
  const strengths = [];
  const issues = [];
  const changes = Math.max(0, chords.length - 1);

  // ── Pédale gardée pendant un changement d'accord ──
  const blur = [];
  for (let i = 1; i < chords.length; i += 1) {
    const t = chords[i].start;
    if (!pedal.some((p) => p.start < t - 0.05 && p.end > t + 0.4)) continue;
    const nextPcs = new Set(chords[i].notes.map(pcOf));
    const ghosts = windows.filter((w) => w.onTime < t && w.keyOffTime <= t + 0.02 && w.offTime > t + 0.4 && !nextPcs.has(pcOf(w.note)));
    if (ghosts.length) blur.push({ at: t, from: chords[i - 1].chordName, to: chords[i].chordName, ghosts: sortedUnique(ghosts.map((w) => w.note)), notes: chords[i].attackNotes });
  }
  if (blur.length) {
    const ratio = blur.length / Math.max(1, changes);
    issues.push({
      id: 'pedal-blur',
      title: 'Relever la pédale aux changements',
      severity: ratio >= 0.5 ? 3 : ratio >= 0.2 ? 2 : 1,
      times: blur.map((c) => c.at),
      text: `Pour que chaque accord sonne net, relève la pédale au moment où l'accord change : sur ${plural(blur.length, 'changement', 'changements')} d'accord (sur ${changes}), des notes de l'accord précédent sonnent encore (${moments(blur, (c) => `${formatMoment(c.at)} ${c.from} → ${c.to} : ${c.ghosts.slice(0, 3).map(frenchNote).join(', ')}`)}).`,
      details: blur.map((c) => ({
        at: c.at, chord: c.to, from: c.from, notes: c.notes, problemNotes: c.ghosts,
        text: `${c.ghosts.map(frenchNote).join(', ')} de ${c.from} ${c.ghosts.length > 1 ? 'sonnent' : 'sonne'} encore sous ${c.to} : relève la pédale au changement`,
      })),
    });
  } else if (changes >= 3 && pedalTime > 0.2 * duration) {
    strengths.push({ id: 'pedal-clean', title: 'Pédale propre', times: [], text: 'Pédale relevée à chaque changement d\'accord : les harmonies ne se mélangent pas.' });
  }

  // ── Voicings boueux dans le grave ──
  const mud = chords.map((c) => ({ at: c.start, chord: c.chordName, pair: muddyPair(c.attackNotes), notes: c.attackNotes })).filter((c) => c.pair);
  if (mud.length) {
    issues.push({
      id: 'low-mud',
      title: 'Aérer le grave',
      severity: mud.length >= 3 || mud.length / chords.length >= 0.3 ? 2 : 1,
      times: mud.map((c) => c.at),
      text: `Pour un grave plus clair, écarte la main gauche (fondamentale + quinte ou septième) : ${plural(mud.length, 'accord a', 'accords ont')} un intervalle serré sous sa limite grave (${moments(mud, (c) => `${formatMoment(c.at)} ${c.chord}, ${INTERVALS[c.pair.high - c.pair.low]} ${frenchNote(c.pair.low)}–${frenchNote(c.pair.high)} (pas sous ${frenchNote(c.pair.limit)})`)}), qui sonne épais.`,
      details: mud.map((c) => ({
        at: c.at, chord: c.chord, notes: c.notes, problemNotes: [c.pair.low, c.pair.high],
        text: `${INTERVALS[c.pair.high - c.pair.low]} ${frenchNote(c.pair.low)}–${frenchNote(c.pair.high)} sous sa limite (${frenchNote(c.pair.limit)}) : écarte ces deux notes`,
      })),
    });
  } else if (chords.length >= 4 && chords.some((c) => c.attackNotes[0] < 48)) {
    strengths.push({ id: 'low-clear', title: 'Grave clair', times: [], text: 'Main gauche claire : aucun intervalle boueux dans le grave.' });
  }

  // ── Frottements de 9e mineure ──
  const rubs = chords
    .map((c) => ({ at: c.start, chord: c.chordName, notes: c.attackNotes, pairs: minorNinthClashes(c.attackNotes, c.rootPc, { flatNineChord: /b9|alt/.test(String(c.symbol)) }) }))
    .filter((c) => c.pairs.length);
  if (rubs.length) {
    issues.push({
      id: 'minor-ninth',
      title: 'Adoucir les 9es mineures',
      severity: rubs.length >= 2 ? 2 : 1,
      times: rubs.map((c) => c.at),
      text: `Hors b9 d'une dominante, une 9e mineure entre deux voix frotte ; pour l'adoucir, déplace l'une des deux notes d'un demi-ton (${plural(rubs.length, 'accord', 'accords')} : ${moments(rubs, (c) => `${formatMoment(c.at)} ${c.chord}, ${frenchNote(c.pairs[0][0])} sous ${frenchNote(c.pairs[0][1])}`)}).`,
      details: rubs.map((c) => ({
        at: c.at, chord: c.chord, notes: c.notes, problemNotes: sortedUnique(c.pairs.flat()),
        text: `${frenchNote(c.pairs[0][0])} sous ${frenchNote(c.pairs[0][1])} : 9e mineure, déplace l'une des deux d'un demi-ton`,
      })),
    });
  }

  // ── Accords non reconnus ──
  const unknown = chords.filter((c) => c.matched === false);
  if (unknown.length) {
    issues.push({
      id: 'unknown-chord',
      title: 'Accords à réécouter',
      severity: 1,
      times: unknown.map((c) => c.start),
      text: `Je ne sais pas nommer ${plural(unknown.length, 'accord', 'accords')} : ${moments(unknown, (c) => `${formatMoment(c.start)} ${c.attackNotes.map(frenchNote).join(' ')}`)}. Note ajoutée voulue ou voicing rare ? Réécoute-les ; si ce n'est pas voulu, essaie de déplacer la note signalée.`,
      details: unknown.map((c) => {
        const suspects = foreignNotes(c);
        const chord = c.rootPc != null ? { rootPc: c.rootPc, quality: c.symbol || '' } : null;
        const ideas = suspects.map((n) => ({ from: n, to: chord ? nearestFitting(n, { chord }) : null })).filter((x) => x.to != null);
        return {
          at: c.start, chord: c.chordName || null, notes: c.attackNotes, problemNotes: suspects,
          suggestions: ideas,
          text: suspects.length
            ? `${suspects.map(frenchNote).join(' et ')} hors de ${c.chordName} : voulu ? sinon essaie ${ideas.length ? ideas.map((x) => `${frenchNote(x.to)} à la place de ${frenchNote(x.from)}`).join(', ') : 'une note voisine'}`
            : 'accord que je ne sais pas nommer',
        };
      }),
    });
  }

  // ── Voix du dessus d'un accord à l'autre ──
  const leaps = [];
  const moves = [];
  for (let i = 1; i < chords.length; i += 1) {
    if (chords[i].attackNotes.length < 3 || chords[i - 1].attackNotes.length < 3) continue;
    const a = Math.max(...chords[i - 1].attackNotes);
    const b = Math.max(...chords[i].attackNotes);
    moves.push(Math.abs(b - a));
    if (Math.abs(b - a) >= 9) leaps.push({ at: chords[i].start, from: chords[i - 1].chordName, to: chords[i].chordName, a, b, notes: chords[i].attackNotes });
  }
  if (leaps.length >= 2 && leaps.length / moves.length >= 0.25) {
    issues.push({
      id: 'top-leaps',
      title: 'Lier la voix du dessus',
      severity: leaps.length / moves.length >= 0.5 ? 2 : 1,
      times: leaps.map((c) => c.at),
      text: `Pour une ligne du dessus qui chante, essaie le renversement le plus proche : la note du dessus saute d'une sixte ou plus dans ${leaps.length} changements sur ${moves.length} (${moments(leaps, (c) => `${formatMoment(c.at)} ${c.from} → ${c.to}, ${frenchNote(c.a)} → ${frenchNote(c.b)}`)}).`,
      details: leaps.map((c) => ({
        at: c.at, chord: c.to, from: c.from, notes: c.notes, problemNotes: [c.b],
        text: `le dessus saute de ${frenchNote(c.a)} à ${frenchNote(c.b)} : un renversement plus proche garderait la ligne`,
      })),
    });
  } else if (moves.length >= 3 && mean(moves) <= 3) {
    strengths.push({ id: 'top-smooth', title: 'Voix du dessus bien enchaînée', times: [], text: `Voix du dessus bien conduite : elle bouge en moyenne de ${(Math.round(mean(moves) * 10) / 10).toString().replace('.', ',')} demi-ton(s) d'un accord à l'autre.` });
  }

  // ── Nuances et équilibre (si le clavier transmet la vélocité) ──
  const velocities = windows.map(velocityOf);
  const dynamicsKnown = sd(velocities) >= 0.025 && new Set(velocities.map(on127)).size >= 4;
  const stats = {
    duration,
    noteCount: windows.length,
    chordCount: chords.length,
    melodyPassages: segments.filter((s) => s.type === 'melody').length,
    pedalRatio: duration > 0 ? Math.min(1, pedalTime / duration) : 0,
    dynamicsKnown,
    velocity: dynamicsKnown ? { low: on127(quantile(velocities, 0.1)), high: on127(quantile(velocities, 0.9)), mean: on127(mean(velocities)) } : null,
    changeEvery: null,
    tempo: tempo || null,
  };
  if (dynamicsKnown) {
    // Voix du dessus des accords (trois notes ou plus) contre les autres notes.
    const clusters = clusterAttacks(windows).filter((c) => c.length >= 3);
    const diffs = clusters.map((c) => {
      const top = c.reduce((m, w) => (w.note > m.note ? w : m), c[0]);
      return velocityOf(top) - mean(c.filter((w) => w !== top).map(velocityOf));
    });
    if (clusters.length >= 5 && mean(diffs) < -0.03 && diffs.filter((d) => d < -0.015).length / diffs.length >= 0.6) {
      issues.push({
        id: 'melody-buried',
        title: 'Faire chanter la voix du dessus',
        severity: 2,
        times: [],
        text: `Pour faire chanter la note du haut (c'est elle que l'oreille suit), donne-lui un peu plus de poids avec le 5e doigt : elle est jouée moins fort que les autres dans ${diffs.filter((d) => d < -0.015).length} accords sur ${diffs.length} (écart moyen ${on127(mean(diffs))} sur 127).`,
      });
    } else if (clusters.length >= 5 && mean(diffs) > 0.04) {
      strengths.push({ id: 'melody-sings', title: 'Voix du dessus qui chante', times: [], text: `Voix du dessus mise en avant : +${on127(mean(diffs))} sur 127 en moyenne au-dessus des autres notes de l'accord.` });
    }
    // Grave (sous Sol3) contre aigu (Do4 et au-dessus).
    const low = windows.filter((w) => w.note < 55).map(velocityOf);
    const high = windows.filter((w) => w.note >= 60).map(velocityOf);
    if (low.length >= 10 && high.length >= 10 && mean(low) - mean(high) > 0.08) {
      issues.push({
        id: 'left-heavy',
        title: 'Alléger la main gauche',
        severity: 2,
        times: [],
        text: `Pour laisser passer la main droite, allège la main gauche : vélocité moyenne ${on127(mean(low))} sous Sol3 contre ${on127(mean(high))} à partir de Do4.`,
      });
    }
    const spread = quantile(velocities, 0.9) - quantile(velocities, 0.1);
    if (windows.length >= 40 && spread < 0.12) {
      issues.push({
        id: 'flat-dynamics',
        title: 'Varier les nuances',
        severity: 1,
        times: [],
        text: `Pour un jeu plus vivant, essaie des nuances (crescendo vers l'accord de résolution, accompagnement plus doux) : presque tout est joué à la même force (vélocité ${stats.velocity.low} à ${stats.velocity.high} sur 127).`,
      });
    } else if (windows.length >= 40 && spread > 0.35) {
      strengths.push({ id: 'dynamics', title: 'Belles nuances', times: [], text: `Jeu nuancé : de ${stats.velocity.low} à ${stats.velocity.high} sur 127.` });
    }
  }

  // ── Arrêts (plus de deux secondes sans aucune note) ──
  const spans = windows.map((w) => [w.onTime, w.offTime]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let reach = spans[0][1];
  for (const [on, off] of spans.slice(1)) {
    if (on - reach >= 2) gaps.push({ at: reach, length: on - reach });
    reach = Math.max(reach, off);
  }
  if (gaps.length && duration >= 20) {
    issues.push({
      id: 'gaps',
      title: 'Silences de plus de 2 s',
      severity: 1,
      times: gaps.map((g) => g.at),
      text: `${plural(gaps.length, 'silence', 'silences')} de plus de deux secondes : ${moments(gaps, (g) => `${formatMoment(g.at)} (${seconds1(g.length)})`)}. Respiration voulue ? Sinon, essaie un tempo un peu plus lent pour enchaîner sans t'arrêter.`,
      details: gaps.map((g) => ({ at: g.at, chord: null, notes: [], problemNotes: [], text: `silence de ${seconds1(g.length)}` })),
    });
  }

  // ── Régularité des changements d'accords ──
  const starts = chords.map((c) => c.start);
  const iois = starts.slice(1).map((t, i) => ({ at: t, d: t - starts[i], from: starts[i] }));
  const inGap = (a, b) => gaps.some((g) => g.at >= a && g.at < b);
  if (iois.length >= 6) {
    const m = median(iois.map((x) => x.d));
    const near = iois.filter((x) => x.d >= 0.75 * m && x.d <= 1.33 * m);
    if (m >= 0.4 && near.length / iois.length >= 0.6) {
      stats.changeEvery = m;
      // Rythme harmonique qui double ou divise par deux : voulu. Entre les deux : en avance ou en retard.
      const early = iois.filter((x) => x.d > 0.55 * m && x.d < 0.72 * m);
      const late = iois.filter((x) => x.d > 1.4 * m && x.d < 1.8 * m && !inGap(x.from, x.at));
      const cv = sd(near.map((x) => x.d)) / mean(near.map((x) => x.d));
      const off = [...early.map((x) => ({ ...x, kind: 'en avance' })), ...late.map((x) => ({ ...x, kind: 'en retard' }))].sort((a, b) => a.at - b.at);
      if (off.length >= 2 || cv > 0.15) {
        issues.push({
          id: 'timing',
          title: 'Régulariser les changements',
          severity: off.length >= 3 || cv > 0.2 ? 2 : 1,
          times: off.map((x) => x.at),
          text: `Tu changes d'accord toutes les ${seconds1(m)} environ, ${off.length ? `avec des écarts : ${moments(off, (x) => `à ${formatMoment(x.at)} ${x.kind} (${seconds1(x.d)})`)}` : `à ${Math.round(cv * 100)} % près`}. Pour des changements plus réguliers, essaie ces enchaînements au métronome, lentement.`,
          details: off.map((x) => {
            const chord = chords.find((c) => Math.abs(c.start - x.at) < 1e-6);
            return { at: x.at, chord: chord?.chordName || null, notes: chord?.attackNotes || [], problemNotes: [], text: `changement ${x.kind} (${seconds1(x.d)} au lieu de ${seconds1(m)})` };
          }),
        });
      } else if (cv < 0.08) {
        strengths.push({ id: 'timing-steady', title: 'Changements réguliers', times: [], text: `Changements d'accords réguliers : toutes les ${seconds1(m)}, à ${Math.max(1, Math.round(cv * 100))} % près.` });
      }
    }
  }

  // ── Attaques : ensemble ou dispersées ──
  const attackClusters = clusterAttacks(windows).filter((c) => c.length >= 3);
  const ragged = attackClusters.filter((c) => {
    const spreadTime = c[c.length - 1].onTime - c[0].onTime;
    if (spreadTime < 0.045) return false;
    const notes = c.map((w) => w.note);
    const up = notes.every((n, i) => i === 0 || n >= notes[i - 1]);
    const down = notes.every((n, i) => i === 0 || n <= notes[i - 1]);
    return !up && !down; // un accord roulé (du grave à l'aigu) est voulu
  });
  if (attackClusters.length >= 5) {
    if (ragged.length >= 3 && ragged.length / attackClusters.length >= 0.3) {
      issues.push({
        id: 'ragged',
        title: 'Plaquer les accords ensemble',
        severity: 1,
        times: ragged.map((c) => c[0].onTime),
        text: `Pour des accords plus nets, fais tomber les deux mains ensemble : dans ${ragged.length} accords sur ${attackClusters.length}, les notes partent en ordre dispersé (${moments(ragged, (c) => formatMoment(c[0].onTime))}).`,
        details: ragged.map((c) => ({
          at: c[0].onTime, chord: null, notes: sortedUnique(c.map((w) => w.note)), problemNotes: [],
          text: `notes étalées sur ${Math.round((c[c.length - 1].onTime - c[0].onTime) * 1000)} ms (${c.map((w) => frenchNote(w.note)).join(' → ')})`,
        })),
      });
    } else if (attackClusters.filter((c) => c[c.length - 1].onTime - c[0].onTime < 0.03).length / attackClusters.length >= 0.8) {
      strengths.push({ id: 'together', title: 'Accords bien ensemble', times: [], text: 'Accords attaqués bien ensemble : les notes tombent en moins de 30 ms.' });
    }
  }

  // ── Vocabulaire harmonique ──
  const families = { triad: [], seventh: [], color: [], tension: [] };
  chords.forEach((c) => families[chordFamily(c.symbol)].push(c.chordName));
  const colorful = [...families.color, ...families.tension];
  stats.vocabulary = Object.fromEntries(Object.entries(families).map(([k, v]) => [k, v.length]));
  if (chords.length >= 4 && colorful.length >= 3 && colorful.length / chords.length >= 0.4) {
    strengths.push({ id: 'vocabulary', title: 'Vocabulaire coloré', times: [], text: `Harmonies colorées : ${colorful.length} accords sur ${chords.length} avec 9e, 11e, 13e ou tension (${[...new Set(colorful)].slice(0, 4).join(', ')}).` });
  } else if (chords.length >= 5 && families.triad.length / chords.length >= 0.7) {
    issues.push({
      id: 'triads-only',
      title: 'Colorer les accords',
      severity: 1,
      times: [],
      text: `Si le style le demande, essaie d'ajouter la 7e et la 9e (Cmaj9, Dm9, G13) pour la couleur jazz ou gospel : la session joue surtout des triades (${families.triad.length} accords sur ${chords.length}).`,
    });
  }

  issues.sort((a, b) => b.severity - a.severity || b.times.length - a.times.length);
  return { stats, strengths: strengths.slice(0, 4), issues: issues.slice(0, 6) };
}

/**
 * Constats en texte, pour le contexte du Copilote.
 * @param {ReturnType<typeof analyzeSessionPerformance>} analysis
 * @returns {string[]} lignes
 */
export function formatPerformanceFindings(analysis) {
  if (!analysis) return [];
  const { stats, strengths, issues } = analysis;
  const lines = [];
  lines.push('Ce qui marche :');
  if (strengths.length) strengths.forEach((f) => lines.push(`- ${f.text}`));
  else lines.push('- (rien de mesurable à souligner : appuie-toi sur la grille)');
  lines.push('Suggestions (de la plus utile à la moins utile) :');
  if (issues.length) issues.forEach((f) => lines.push(`- ${f.text}`));
  else lines.push('- (aucune : rien de mesurable à changer)');
  const facts = [
    `${stats.noteCount} notes`,
    `${stats.chordCount} accords`,
    stats.melodyPassages ? `${stats.melodyPassages} passages mélodiques` : null,
    stats.changeEvery ? `un changement d'accord toutes les ${seconds1(stats.changeEvery)} environ` : null,
    stats.velocity ? `vélocité ${stats.velocity.low} à ${stats.velocity.high} sur 127 (moyenne ${stats.velocity.mean})` : 'vélocité constante (clavier sans nuances, ou clavier virtuel)',
    `pédale enfoncée ${Math.round(stats.pedalRatio * 100)} % du temps`,
  ].filter(Boolean);
  lines.push(`Repères : ${facts.join(' · ')}.`);
  return lines;
}
