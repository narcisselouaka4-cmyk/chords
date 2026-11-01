// [Claude] — 2026-10-03 — La barre de lecture des exemples du Copilote.
//
// Narcisse : « un contrôle de lecture : il faudrait un système pour pouvoir revenir en
// arrière manuellement quand le copilote joue, un peu comme sur un lecteur. Ce serait
// vraiment pratique pour revoir un passage et demander des explications
// supplémentaires ». Et, pour les pauses du prof dans un rejeu : « il faudrait rendre ça
// un peu plus clair, par exemple en signalant les moments où le prof parle ».
//
// Fonctions pures, testées dans test-example-transport.js. La carte de l'exemple
// (copilot-tab.js) en tire sa durée, ses marques (le prof parle), la phrase à afficher
// pendant une pause et l'instant correspondant dans la vidéo. Le lecteur lui-même est
// src/exercise-demo-player.js (pause, reprise, aller à).

import { clock } from './tutorial-moment.js';

/** « ⟲ 5 s » : de combien on revient en arrière. */
export const BACK_SECONDS = 5;

/** Secondes par temps de l'exemple (tempo 60 : un temps = une seconde). */
export function secondsPerBeat(example) {
  const tempo = Number(example?.tempo);
  return 60 / (Number.isFinite(tempo) && tempo > 0 ? tempo : 60);
}

/** Durée de l'exemple, en secondes (jusqu'au dernier évènement). */
export function exampleSeconds(example) {
  const events = Array.isArray(example?.events) ? example.events : [];
  const end = events.reduce((max, e) => Math.max(max, Number(e?.time) || 0), Number(example?.beats) || 0);
  return end * secondsPerBeat(example);
}

/**
 * L'instant de la vidéo qui correspond à un instant de l'exemple : sa table (`timeMap`,
 * les pauses raccourcies y sont dépliées), sinon son début dans la vidéo. null : l'exemple
 * ne vient pas d'un passage de la vidéo.
 * @param {object} example
 * @param {number} t - secondes depuis le début de l'exemple
 * @returns {number|null}
 */
export function videoTimeAt(example, t) {
  const time = Math.max(0, Number(t) || 0);
  const map = Array.isArray(example?.timeMap) ? example.timeMap.filter((p) => Array.isArray(p) && p.length === 2) : [];
  if (!map.length) return Number.isFinite(example?.tutorialStart) ? example.tutorialStart + time : null;
  if (time <= map[0][0]) return map[0][1];
  for (let k = 1; k < map.length; k += 1) {
    const [e0, v0] = map[k - 1];
    const [e1, v1] = map[k];
    if (time <= e1) return e1 > e0 ? v0 + ((time - e0) * (v1 - v0)) / (e1 - e0) : v1;
  }
  // Après le dernier point : le temps file comme dans la vidéo.
  const [eLast, vLast] = map[map.length - 1];
  return vLast + (time - eLast);
}

/**
 * La pause (raccourcie) où se trouve la lecture, s'il y en a une. `after` : la phrase reste
 * encore ce temps-là après la pause (2 s, c'est court pour la lire).
 */
export function markerAt(example, t, { after = 0 } = {}) {
  const time = Number(t);
  if (!Number.isFinite(time)) return null;
  const found = (example?.markers || []).filter((m) => time >= m.at - 0.05 && time <= m.until + after + 0.05);
  return found.length ? found[found.length - 1] : null;
}

/** « Ici, le prof explique (10:12 → 10:20) : sa pause est raccourcie à 2 s. » */
export function markerNote(marker) {
  if (!marker) return '';
  const range = `${clock(marker.videoStart)} → ${clock(marker.videoEnd)}`;
  const seconds = Math.round((marker.until - marker.at) * 10) / 10;
  const short = `${String(seconds).replace('.', ',')} s`;
  return marker.kind === 'parle'
    ? `Ici, le prof explique (${range}) : sa pause est raccourcie à ${short}.`
    : `Ici, le prof s'arrête de jouer (${range}) : sa pause est raccourcie à ${short}.`;
}

/**
 * Les marques de la barre : chaque pause, à sa place (en % de la durée).
 * @returns {{kind: string, left: number, width: number, title: string}[]}
 */
export function markerSpans(example, duration = exampleSeconds(example)) {
  if (!(duration > 0)) return [];
  const pct = (x) => Math.round(Math.max(0, Math.min(100, (x / duration) * 100)) * 100) / 100;
  return (example?.markers || [])
    .filter((m) => Number.isFinite(m?.at) && Number.isFinite(m?.until) && m.until > m.at && m.at < duration)
    .map((m) => ({
      kind: m.kind === 'parle' ? 'parle' : 'pause',
      left: pct(m.at),
      width: Math.max(0.5, pct(Math.min(m.until, duration) - m.at)),
      title: `${m.kind === 'parle' ? 'Le prof explique' : 'Le prof s\'arrête'} (${clock(m.videoStart)} → ${clock(m.videoEnd)})`,
    }));
}

/** « 0:12 / 0:45 ». */
export function timeLabel(position, duration) {
  return `${clock(Math.max(0, Number(position) || 0))} / ${clock(Math.max(0, Number(duration) || 0))}`;
}
