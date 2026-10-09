// [Claude] — 2026-09-24 — Sortie MIDI de l'application (Narcisse : la démo doit
// jouer sur son VST « comme si c'était nous qui jouions »). Pont natif Electron
// (RtMidi, port virtuel possible hors Windows) ou Web MIDI en repli. Seules la
// démo et « Écouter » y envoient leurs notes : le jeu de l'utilisateur arrive
// déjà au VST par son propre clavier.

import { getWebMidiOutputs, findWebMidiOutput } from './midi-fallback.js';

const STORAGE_KEY = 'midi-output-name';
let current = null; // { id, name, web?: MIDIOutput }

const nativeMidi = () => (typeof window !== 'undefined' ? window.electronAPI?.midi : null);

/** Sorties disponibles : [{ id, name }]. */
export async function listMidiOutputs() {
  const native = nativeMidi();
  if (native?.getOutputs) return (await native.getOutputs()) || [];
  return getWebMidiOutputs().map(({ id, name }) => ({ id, name }));
}

/**
 * Ouvre la sortie `id` (null = aucune : piano intégré). Le nom est mémorisé
 * pour la retrouver au prochain lancement (les numéros de port changent).
 */
export async function openMidiOutput(id, name = null) {
  midiOutputAllOff();
  const native = nativeMidi();
  if (native?.openOutput) {
    const result = await native.openOutput(id ?? null);
    current = result?.ok && result.id != null ? { id: result.id, name: result.name } : null;
  } else {
    const web = findWebMidiOutput(id);
    current = web ? { id, name: web.name, web } : null;
  }
  try {
    if (current) window.localStorage?.setItem(STORAGE_KEY, current.name || name || '');
    else window.localStorage?.removeItem(STORAGE_KEY);
  } catch (e) {
    // Stockage indisponible : la sortie sera à rechoisir au prochain lancement.
  }
  return current;
}

/** Nom de la dernière sortie choisie (à rouvrir au lancement), ou null. */
export function savedMidiOutputName() {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function isMidiOutputActive() {
  return current != null;
}

export function currentMidiOutput() {
  return current;
}

/** Envoie un message MIDI brut (octets) sur la sortie ouverte. */
export function sendMidi(bytes) {
  if (!current) return;
  if (current.web) current.web.send(bytes);
  else nativeMidi()?.send?.(bytes);
}

/** Notes et pédale relâchées sur la sortie (arrêt de la démo, changement de port). */
export function midiOutputAllOff() {
  if (!current) return;
  sendMidi([0xb0, 64, 0]);
  sendMidi([0xb0, 123, 0]);
}
