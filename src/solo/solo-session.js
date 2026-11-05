// [Claude] — 2026-11-05 — La séance de solo : elle tient le temps, ramasse les
// frappes et rend le verdict de la fiche — ou n'en rend aucun.
//
// Les trois sortes de fiches ne se jugent pas de la même façon, et c'est le
// cœur du mode : un play-along ne juge RIEN (on y joue, point), un exercice de
// rythme ne juge que le quand, le footing ne juge que l'atterrissage sur le
// temps fort. Aucune des trois ne note un solo : l'application trie, elle ne
// choisit pas à la place du pianiste.

import {
  judgeRhythm, rhythmVerdict, msToBeats, DEFAULT_TOLERANCE_MS,
  MIN_TOLERANCE_MS, MAX_TOLERANCE_MS,
} from './rhythm-judge.js';
import { judgeFooting, footingVerdict } from './footing-judge.js';
import { gridTimeline, chordAtBeat, cycleBeats, createLoopClock, backingNames } from './play-along.js';

export const SOLO_KINDS = ['play-along', 'rhythm', 'footing'];

export const SOLO_KIND_LABELS = {
  'play-along': 'Play-along',
  rhythm: 'Rythme seul',
  footing: 'Footing',
};

/** Ce que la fiche vérifie, en une phrase — affichée avant de commencer. */
export const SOLO_KIND_PROMISE = {
  'play-along': 'Rien n\'est vérifié : un fond tourne, tu soloes par-dessus.',
  rhythm: 'Seul le moment de tes frappes est vérifié. Aucune hauteur n\'est regardée.',
  footing: 'Seules les notes qui tombent sur les temps forts sont vérifiées.',
};

/** Vrai si la fiche est une fiche du mode Solo. */
export function isSoloEntry(entry) {
  return SOLO_KINDS.includes(entry?.solo?.kind);
}

/**
 * Séance de solo.
 * @param {object} options
 * @param {(quality: string) => Iterable<number>} options.chordTones - notes d'un
 *   accord, injectées depuis le moteur (practice-exercise.js) pour que ce
 *   module reste testable seul.
 * @param {number} [options.toleranceMs]
 */
export function createSoloSession({ chordTones, toleranceMs = DEFAULT_TOLERANCE_MS } = {}) {
  let entry = null;
  let timeline = [];
  let loop = 0;
  let clock = createLoopClock(0);
  let hits = [];
  let tolerance = clampTolerance(toleranceMs);
  let lastBeat = 0;
  let running = false;

  function clampTolerance(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return DEFAULT_TOLERANCE_MS;
    return Math.min(MAX_TOLERANCE_MS, Math.max(MIN_TOLERANCE_MS, n));
  }

  function kind() { return entry?.solo?.kind || null; }
  function tempo() { return Number(entry?.solo?.tempo) || 90; }
  function barBeats() { return Number(entry?.solo?.barBeats) || 4; }

  /**
   * Prépare une fiche. La longueur du tour vient de la grille pour un
   * play-along ou un footing, et de la cellule du motif pour un exercice de
   * rythme : c'est elle qui se répète.
   */
  function load(next) {
    entry = isSoloEntry(next) ? next : null;
    const solo = entry?.solo || {};
    timeline = solo.grid ? gridTimeline(solo.grid, solo.beatsPerChord) : [];
    loop = timeline.length ? cycleBeats(timeline) : (Number(solo.pattern?.beats) || 0);
    clock = createLoopClock(loop);
    hits = [];
    lastBeat = 0;
    running = false;
    return state();
  }

  function start() { running = true; return state(); }

  function stop() { running = false; return state(); }

  /** Remet les frappes et l'horloge à zéro, en gardant la fiche chargée. */
  function reset() {
    hits = [];
    clock.reset();
    lastBeat = 0;
    return state();
  }

  /**
   * Une frappe. `rawBeat` est la position rendue par le lecteur, qui repart de
   * zéro à chaque tour ; l'horloge de boucle la transforme en temps cumulé.
   * La hauteur est gardée même pour un exercice de rythme — elle n'entre pas
   * dans le verdict, mais elle sert à regrouper les octaves parallèles en une
   * seule frappe, et à afficher ce qui a été joué.
   */
  function noteOn(note, rawBeat) {
    if (!entry || !running) return null;
    const at = clock.beat(rawBeat);
    lastBeat = Math.max(lastBeat, at);
    const hit = { at, note: Number(note) };
    hits.push(hit);
    return hit;
  }

  /** Avance l'horloge sans frappe (appelé à chaque image pendant la lecture). */
  function tick(rawBeat) {
    if (!entry) return lastBeat;
    const at = clock.beat(rawBeat);
    lastBeat = Math.max(lastBeat, at);
    return at;
  }

  function chordAt(beat) {
    return timeline.length ? chordAtBeat(timeline, beat) : null;
  }

  /**
   * Verdict courant.
   *
   * On ne juge que ce qui est DÉFINITIVEMENT passé : la borne haute recule
   * d'une tolérance. Sans ça, une frappe attendue dans dix millisecondes
   * serait comptée comme manquée avant même d'avoir pu être jouée.
   */
  function verdict() {
    if (!entry) return null;
    const k = kind();
    const t = tempo();
    const window = msToBeats(tolerance, t);
    const toBeat = Math.max(0, lastBeat - window);

    if (k === 'play-along') {
      // Rien à juger, par construction. On rend seulement de quoi afficher
      // l'avancement : un play-along n'a ni réussite ni échec.
      return {
        kind: k, judged: false, cycles: clock.cycles(), hits: hits.length,
        text: hits.length
          ? `${hits.length} note${hits.length > 1 ? 's' : ''} jouée${hits.length > 1 ? 's' : ''} sur ${clock.cycles() + 1} tour${clock.cycles() ? 's' : ''}. Rien n'est vérifié ici.`
          : SOLO_KIND_PROMISE[k],
      };
    }

    if (k === 'rhythm') {
      const rhythm = judgeRhythm({
        hits, pattern: entry.solo.pattern, fromBeat: 0, toBeat,
        tempo: t, toleranceMs: tolerance,
      });
      return { kind: k, judged: true, rhythm, text: rhythmVerdict(rhythm) || SOLO_KIND_PROMISE[k] };
    }

    if (k === 'footing') {
      const footing = judgeFooting({
        hits, chordAt, chordTones,
        strongBeats: entry.solo.strongBeats, barBeats: barBeats(),
        fromBeat: 0, toBeat, tempo: t, toleranceMs: tolerance,
      });
      return { kind: k, judged: true, footing, text: footingVerdict(footing) || SOLO_KIND_PROMISE[k] };
    }

    return null;
  }

  function state() {
    return {
      entry, kind: kind(), tempo: tempo(), loopBeats: loop, timeline,
      hits: hits.length, running, toleranceMs: tolerance,
      cycles: clock.cycles(), lastBeat,
      kit: entry?.solo?.kit || null,
      // Durée de la séance : le fond tourne ce nombre de tours puis s'arrête,
      // et le verdict reste lisible. Une boucle sans fin n'aurait pas de
      // moment où regarder le résultat.
      cyclesPlanned: Math.max(1, Math.round(Number(entry?.solo?.cycles) || 4)),
      totalBeats: loop * Math.max(1, Math.round(Number(entry?.solo?.cycles) || 4)),
      // Accords répétés pour la machinerie des démos (play-along et footing).
      // `backing` l'emporte sur la grille jugée quand il est déclaré : une
      // triade mineure n'a pas de voicing publié, et le fond la perdrait en
      // silence (voir le lisez-moi de solo-studies.json).
      chordNames: backingNames(entry, timeline),
    };
  }

  function setTolerance(ms) {
    tolerance = clampTolerance(ms);
    return tolerance;
  }

  return {
    load, start, stop, reset, noteOn, tick, verdict, state,
    setTolerance, chordAt,
    getHits: () => [...hits],
  };
}
