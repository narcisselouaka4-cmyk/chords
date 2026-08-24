// [OpenCode] — 2026-08-24 — Réharmonisation V1, Étape 1 : bus MIDI live.
//
// Petit canal de publication global permettant à l'onglet Analyse (et
// spécifiquement la capture de mélodie pour la réharmonisation) de recevoir
// les notes jouées au clavier MIDI/virtuel sans coupler main.js au module
// d'analyse. main.js publie ; les souscriptions sont optionnelles.
//
// Une seule instance globale. Pas de DOM, pas d'UI. Aucune dépendance vers
// src/melody/* : le bus transporte des nombres (note, velocity, channel) et
// reste indépendant du moteur canonique.

const subscribers = new Set();

/**
 * Abonne un consommateur aux événements MIDI globaux.
 * @param {{ noteOn?: (note: number, velocity: number, channel: number) => void,
 *           noteOff?: (note: number, channel: number) => void,
 *           sustain?: (value: boolean, channel: number) => void }} callbacks
 * @returns {() => void} fonction de désabonnement
 */
export function subscribeToLiveMidi(callbacks) {
  subscribers.add(callbacks);
  return () => subscribers.delete(callbacks);
}

/**
 * Publie un note_on vers tous les abonnés. Appelé par main.js uniquement.
 * @param {number} note
 * @param {number} velocity
 * @param {number} channel
 */
export function publishLiveNoteOn(note, velocity, channel) {
  for (const cb of subscribers) {
    try { cb.noteOn?.(note, velocity, channel); } catch (_) { /* isoler les abonnés */ }
  }
}

/**
 * Publie un note_off vers tous les abonnés. Appelé par main.js uniquement.
 * @param {number} note
 * @param {number} channel
 */
export function publishLiveNoteOff(note, channel) {
  for (const cb of subscribers) {
    try { cb.noteOff?.(note, channel); } catch (_) { /* isoler les abonnés */ }
  }
}

/**
 * Publie un changement de pédale sustain vers tous les abonnés.
 * @param {boolean} value
 * @param {number} channel
 */
export function publishLiveSustain(value, channel) {
  for (const cb of subscribers) {
    try { cb.sustain?.(value, channel); } catch (_) { /* isoler les abonnés */ }
  }
}

/**
 * Indique si au moins un abonné est actif (utile pour éviter du travail
 * de publication inutile quand personne n'écoute).
 */
export function hasLiveMidiSubscribers() {
  return subscribers.size > 0;
}