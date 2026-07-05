const DEFAULT_TOLERANCE_MS = 200;

// [OpenCode] — 2026-07-04 — Groupement temporel des notes avec fenêtre glissante pour les cascades/arpèges.
// Toutes les notes jouées dans la fenêtre sont accumulées (même relâchées) pour reconstituer l'accord complet.
// Le déclenchement nécessite ≥ 3 notes distinctes (vérifié par l'appelant).
export function createNoteGrouper({ onGroupReady, toleranceMs = DEFAULT_TOLERANCE_MS } = {}) {
  let pendingNotes = [];
  let timer = null;

  function noteOn(note, velocity = 0.8) {
    pendingNotes.push({ note, velocity, time: performance.now() });
    resetTimer();
  }

  function noteOff(note, _options = {}) {
    // Ne pas retirer la note du buffer : elle fait toujours partie de l'accord en cours
    // (cascade/arpège). Le timeout de la fenêtre se charge de la frontière temporelle.
  }

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      flush();
    }, toleranceMs);
  }

  function flush() {
    if (pendingNotes.length === 0) return;
    const group = pendingNotes.slice();
    pendingNotes = [];
    timer = null;
    onGroupReady?.(group);
  }

  function clear() {
    pendingNotes = [];
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function setTolerance(ms) {
    toleranceMs = Math.max(50, Math.min(500, ms));
  }

  function getTolerance() {
    return toleranceMs;
  }

  return { noteOn, noteOff, flush, clear, setTolerance, getTolerance };
}
