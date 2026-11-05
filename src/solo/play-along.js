// [Claude] — 2026-11-05 — Le fond de jeu du mode Solo.
//
// L'idée qui tient tout le mode : la boucle de batterie n'est pas qu'un
// métronome, c'est un fond sur lequel on solote. Montuno (déjà écrit,
// `buildMontunoDemo`) + batterie (déjà écrite, `drum-loop.js`) = un play-along.
// Personne ne chante, on n'accompagne rien — exactement ce que Narcisse
// demande : « des jeux où il n'y a pas de personnes qui chantent, où on
// n'accompagne pas des musiques. On fait simplement des solos. »
//
// Ce module ne joue rien et ne fabrique aucun voicing : il donne la carte du
// temps. Qui sonne, quand, et sur quoi on atterrit. Les voicings et les
// évènements restent produits par la machinerie des démos, inchangée — on ne
// duplique pas le moteur, on lui donne une grille qui tourne.

import { parseChordName } from '../pedagogie/note-roles.js';

const round = (n, p = 3) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Carte du temps d'une grille : un segment par accord, avec son instant de
 * début et de fin en temps musicaux.
 *
 * @param {Array<string|{name: string, beats?: number, landing?: number[]}>} grid
 * @param {number} [beatsPerChord] - durée par défaut d'un accord
 * @returns {Array<{fromBeat: number, toBeat: number, name: string, rootPc: number,
 *   quality: string, landing: number[]|null, beats: number}>}
 */
export function gridTimeline(grid, beatsPerChord = 4) {
  const items = Array.isArray(grid) ? grid : [];
  const out = [];
  let at = 0;
  for (const raw of items) {
    const entry = typeof raw === 'string' ? { name: raw } : (raw || {});
    const parsed = parseChordName(entry.name);
    if (!parsed) continue;
    const beats = Number.isFinite(entry.beats) && entry.beats > 0
      ? Number(entry.beats) : Number(beatsPerChord) || 4;
    out.push({
      fromBeat: round(at),
      toBeat: round(at + beats),
      beats,
      name: parsed.name,
      rootPc: parsed.rootPc,
      quality: parsed.quality,
      // Notes d'atterrissage déclarées par la fiche, en demi-tons depuis la
      // fondamentale. Null = les notes de l'accord (voir footing-judge).
      landing: Array.isArray(entry.landing) && entry.landing.length ? [...entry.landing] : null,
    });
    at += beats;
  }
  return out;
}

/** Durée d'un tour de grille, en temps musicaux. */
export function cycleBeats(timeline) {
  return timeline?.length ? timeline[timeline.length - 1].toBeat : 0;
}

/**
 * Accord qui sonne à un instant donné, la grille tournant en boucle.
 * Un play-along ne s'arrête pas au bout d'un tour : au temps 13 d'une grille de
 * 12 temps, on est revenu au premier accord.
 * @param {Array} timeline
 * @param {number} beat
 * @returns {object|null}
 */
export function chordAtBeat(timeline, beat) {
  const cycle = cycleBeats(timeline);
  if (!cycle || !Number.isFinite(beat)) return null;
  const at = ((beat % cycle) + cycle) % cycle;
  // Comparaison sur une borne inférieure incluse et supérieure exclue : un
  // temps fort tombant pile sur le changement d'accord appartient au nouveau.
  return timeline.find((s) => at >= s.fromBeat && at < s.toBeat) || null;
}

/**
 * Noms d'accords répétés sur plusieurs tours, pour la machinerie des démos.
 * Elle attend une suite d'accords à plat ; un play-along de quatre tours sur
 * trois accords, c'est douze accords.
 * @param {Array} timeline
 * @param {number} [cycles]
 * @returns {string[]}
 */
export function repeatGrid(timeline, cycles = 4) {
  const turns = Math.max(1, Math.round(Number(cycles) || 1));
  const out = [];
  for (let i = 0; i < turns; i += 1) for (const s of timeline) out.push(s.name);
  return out;
}

/**
 * Suit le temps d'une boucle qui se répète, en temps cumulés.
 *
 * Le lecteur de démos rend une position à l'intérieur de ce qu'il joue : il
 * repart de zéro à chaque relance. Pour juger un rythme ou un atterrissage sur
 * la durée, il faut un temps qui AVANCE — sinon le deuxième tour écraserait les
 * frappes du premier. Ce compteur détecte le retour en arrière et ajoute un
 * tour, ce qui donne une horloge monotone sans toucher au lecteur.
 *
 * @param {number} loopBeats - durée d'un tour
 * @returns {{beat: (raw: number) => number, reset: () => void, cycles: () => number}}
 */
export function createLoopClock(loopBeats) {
  const loop = Number(loopBeats) > 0 ? Number(loopBeats) : 0;
  let cycles = 0;
  let last = 0;
  return {
    beat(raw) {
      const pos = Number.isFinite(raw) ? raw : 0;
      if (!loop) return pos;
      // Un recul franc (plus d'un quart de tour) = un nouveau tour. Le seuil
      // évite de compter un tour sur le tremblement de la position pendant
      // qu'une note se déclenche.
      if (pos + loop / 4 < last) cycles += 1;
      last = pos;
      return round(cycles * loop + pos);
    },
    reset() { cycles = 0; last = 0; },
    cycles: () => cycles,
  };
}

/**
 * Accords que le FOND doit jouer, répétés sur plusieurs tours.
 *
 * Pourquoi ce n'est pas simplement la grille jugée : VoicingLab ne publie pas
 * les triades majeures et mineures. Un « Gm » n'a donc aucun voicing, et la
 * fabrique de démos le laisse tomber SANS RIEN DIRE — un fond de trois accords
 * en jouerait deux. La fiche déclare alors `backing` (ici Gm7), tandis que
 * l'atterrissage reste jugé sur le Gm que le professeur nomme.
 * @param {object} entry - fiche du mode Solo
 * @param {Array} timeline - carte du temps de la grille jugée
 * @returns {string[]}
 */
export function backingNames(entry, timeline = []) {
  const solo = entry?.solo || {};
  const cycles = Math.max(1, Math.round(Number(solo.cycles) || 4));
  const declared = Array.isArray(solo.backing) && solo.backing.length ? solo.backing : null;
  const base = declared || (timeline.length ? timeline.map((s) => s.name) : []);
  if (!base.length) return [];
  const out = [];
  for (let i = 0; i < cycles; i += 1) out.push(...base);
  return out;
}
