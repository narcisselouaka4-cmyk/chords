// [Claude] — 2026-10-13 — Retranspose les notes en cours quand le réglage de transposition change
// (Narcisse : « je transpose de −1 en pleine lecture d'une Session MIDI : des touches passent à
// la couleur de l'utilisateur »). Les notes tenues (activeNotes) et la pédale (sustainedNotes)
// étaient déjà décalées ; pas l'ensemble `playbackNotes`, qui sert à choisir la couleur (jaune =
// l'application, bleu = le pianiste). Il gardait donc les anciennes hauteurs : les touches
// décalées n'y figuraient plus et se rallumaient en bleu. Ici, les trois sont décalés ensemble.

/**
 * @param {{activeNotes: Map<number,number>, sustainedNotes: Set<number>, playbackNotes: Set<number>, keyTimes: Map}} state
 * @param {number} delta demi-tons ajoutés (nouvelle transposition − ancienne)
 */
export function shiftTransposedState(state, delta) {
  if (!delta) return;
  state.activeNotes = new Map([...state.activeNotes].map(([midi, velocity]) => [midi + delta, velocity]));
  state.sustainedNotes = new Set([...state.sustainedNotes].map((midi) => midi + delta));
  state.playbackNotes = new Set([...state.playbackNotes].map((midi) => midi + delta));
  state.keyTimes.clear(); // horodatages des grace notes : plus valables
}
