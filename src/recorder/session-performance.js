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

import { buildNoteWindows, segmentSessionEvents, nameChordSegments, clusterAttacks } from './session-analysis.js';
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

/** Moments (m:ss) d'une liste de cas, trois au plus. */
const moments = (cases, describe) => cases.slice(0, 3).map(describe).join(' ; ');

/**
 * Analyse du jeu d'une session.
 * @param {object[]} events - évènements MIDI de la session ({type, time, note, velocity, controller, value})
 * @param {{tempo?: number|null, latin?: boolean}} [options] - latin : noms d'accords Do, Ré, Mi (comme le carnet)
 * @returns {{stats: object, strengths: object[], issues: object[]}|null}
 *   constat = { id, title, text, times: number[], severity? (1 à 3, pour les points à travailler) }
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
    if (ghosts.length) blur.push({ at: t, from: chords[i - 1].chordName, to: chords[i].chordName, ghosts: sortedUnique(ghosts.map((w) => w.note)) });
  }
  if (blur.length) {
    const ratio = blur.length / Math.max(1, changes);
    issues.push({
      id: 'pedal-blur',
      title: 'Pédale gardée entre deux accords',
      severity: ratio >= 0.5 ? 3 : ratio >= 0.2 ? 2 : 1,
      times: blur.map((c) => c.at),
      text: `Pédale gardée pendant ${plural(blur.length, 'changement', 'changements')} d'accord sur ${changes} : des notes de l'accord précédent sonnent encore sur le suivant (${moments(blur, (c) => `${formatMoment(c.at)} ${c.from} → ${c.to} : ${c.ghosts.slice(0, 3).map(frenchNote).join(', ')}`)}).`,
    });
  } else if (changes >= 3 && pedalTime > 0.2 * duration) {
    strengths.push({ id: 'pedal-clean', title: 'Pédale propre', times: [], text: 'Pédale relevée à chaque changement d\'accord : les harmonies ne se mélangent pas.' });
  }

  // ── Voicings boueux dans le grave ──
  const mud = chords.map((c) => ({ at: c.start, chord: c.chordName, pair: muddyPair(c.attackNotes) })).filter((c) => c.pair);
  if (mud.length) {
    issues.push({
      id: 'low-mud',
      title: 'Voicings boueux dans le grave',
      severity: mud.length >= 3 || mud.length / chords.length >= 0.3 ? 2 : 1,
      times: mud.map((c) => c.at),
      text: `Intervalles trop serrés dans le grave (${plural(mud.length, 'accord', 'accords')}) : ${moments(mud, (c) => `${formatMoment(c.at)} ${c.chord}, ${INTERVALS[c.pair.high - c.pair.low]} ${frenchNote(c.pair.low)}–${frenchNote(c.pair.high)} (pas sous ${frenchNote(c.pair.limit)})`)}. En dessous de ces limites, l'intervalle sonne boueux : écarte la main gauche (fondamentale + quinte ou septième).`,
    });
  } else if (chords.length >= 4 && chords.some((c) => c.attackNotes[0] < 48)) {
    strengths.push({ id: 'low-clear', title: 'Grave clair', times: [], text: 'Main gauche claire : aucun intervalle boueux dans le grave.' });
  }

  // ── Frottements de 9e mineure ──
  const rubs = chords
    .map((c) => ({ at: c.start, chord: c.chordName, pairs: minorNinthClashes(c.attackNotes, c.rootPc, { flatNineChord: /b9|alt/.test(String(c.symbol)) }) }))
    .filter((c) => c.pairs.length);
  if (rubs.length) {
    issues.push({
      id: 'minor-ninth',
      title: 'Frottements de 9e mineure',
      severity: rubs.length >= 2 ? 2 : 1,
      times: rubs.map((c) => c.at),
      text: `9e mineure entre deux voix (${plural(rubs.length, 'accord', 'accords')}) : ${moments(rubs, (c) => `${formatMoment(c.at)} ${c.chord}, ${frenchNote(c.pairs[0][0])} sous ${frenchNote(c.pairs[0][1])}`)}. Hors b9 d'une dominante, cet écart frotte : déplace l'une des deux notes.`,
    });
  }

  // ── Accords non reconnus ──
  const unknown = chords.filter((c) => c.matched === false);
  if (unknown.length) {
    issues.push({
      id: 'unknown-chord',
      title: 'Accords non reconnus',
      severity: 1,
      times: unknown.map((c) => c.start),
      text: `Accords qu'aucun modèle n'explique entièrement (${unknown.length}) : ${moments(unknown, (c) => `${formatMoment(c.start)} ${c.attackNotes.map(frenchNote).join(' ')}`)} — note étrangère (fausse note ?) ou voicing très rare, à réécouter.`,
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
    if (Math.abs(b - a) >= 9) leaps.push({ at: chords[i].start, from: chords[i - 1].chordName, to: chords[i].chordName, a, b });
  }
  if (leaps.length >= 2 && leaps.length / moves.length >= 0.25) {
    issues.push({
      id: 'top-leaps',
      title: 'Voix du dessus qui saute',
      severity: leaps.length / moves.length >= 0.5 ? 2 : 1,
      times: leaps.map((c) => c.at),
      text: `La note du dessus saute d'une sixte ou plus dans ${leaps.length} changements sur ${moves.length} : ${moments(leaps, (c) => `${formatMoment(c.at)} ${c.from} → ${c.to}, ${frenchNote(c.a)} → ${frenchNote(c.b)}`)}. Le renversement le plus proche garde une ligne chantante.`,
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
        title: 'Voix du dessus effacée',
        severity: 2,
        times: [],
        text: `La note du haut des accords est jouée moins fort que les autres (${diffs.filter((d) => d < -0.015).length} accords sur ${diffs.length}, écart moyen ${on127(mean(diffs))} sur 127) : c'est elle que l'oreille suit, fais-la chanter (poids sur le 5e doigt).`,
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
        title: 'Main gauche trop forte',
        severity: 2,
        times: [],
        text: `Le grave couvre l'aigu : vélocité moyenne ${on127(mean(low))} sous Sol3 contre ${on127(mean(high))} à partir de Do4. Allège la main gauche pour laisser passer la main droite.`,
      });
    }
    const spread = quantile(velocities, 0.9) - quantile(velocities, 0.1);
    if (windows.length >= 40 && spread < 0.12) {
      issues.push({
        id: 'flat-dynamics',
        title: 'Nuances resserrées',
        severity: 1,
        times: [],
        text: `Presque tout est joué à la même force (vélocité ${stats.velocity.low} à ${stats.velocity.high} sur 127) : des nuances (crescendo vers l'accord de résolution, accompagnement plus doux) rendraient le jeu plus vivant.`,
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
      title: 'Arrêts',
      severity: 1,
      times: gaps.map((g) => g.at),
      text: `Arrêts de plus de deux secondes (${gaps.length}) : ${moments(gaps, (g) => `${formatMoment(g.at)} (${seconds1(g.length)})`)} — hésitation, ou respiration voulue ?`,
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
          title: 'Changements d\'accords irréguliers',
          severity: off.length >= 3 || cv > 0.2 ? 2 : 1,
          times: off.map((x) => x.at),
          text: `Tu changes d'accord toutes les ${seconds1(m)} environ, mais ${off.length ? `${moments(off, (x) => `à ${formatMoment(x.at)} ${x.kind} (${seconds1(x.d)})`)}` : `l'écart varie de ${Math.round(cv * 100)} %`} : travaille ces enchaînements au métronome, lentement.`,
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
        title: 'Attaques dispersées',
        severity: 1,
        times: ragged.map((c) => c[0].onTime),
        text: `Dans ${ragged.length} accords sur ${attackClusters.length}, les notes partent en ordre dispersé (${moments(ragged, (c) => formatMoment(c[0].onTime))}) : les deux mains ne tombent pas ensemble.`,
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
      title: 'Surtout des triades',
      severity: 1,
      times: [],
      text: `Surtout des triades (${families.triad.length} accords sur ${chords.length}) : la 7e et la 9e (Cmaj9, Dm9, G13) donneraient la couleur jazz ou gospel, si le style le demande.`,
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
  lines.push('Points forts :');
  if (strengths.length) strengths.forEach((f) => lines.push(`- ${f.text}`));
  else lines.push('- (aucun point fort mesurable : appuie-toi sur la grille)');
  lines.push('À travailler (du plus important au moins important) :');
  if (issues.length) issues.forEach((f) => lines.push(`- ${f.text}`));
  else lines.push('- (aucun problème mesuré)');
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
