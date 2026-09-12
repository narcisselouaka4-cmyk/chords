export const DEFAULT_TOLERANCE_MS = 200;
export const MAX_SPAN_SEMITONES = 24; // > 2 octaves : mouvement/glissando, pas un accord tenu
export const MIN_SIMULTANEOUS = 3; // seuil minimal de notes réellement superposées dans le temps
export const CONJUNCT_INTERVAL_SEMITONES = 2; // pas conjoint (ton/demi-ton) typique d'une gamme/trait mélodique

// [OpenCode] — 2026-07-04 — Groupement temporel des notes avec fenêtre glissante pour les cascades/arpèges.
// [OpenCode] — 2026-09-05 — Un accord (même roulé, pédale tenue) a un instant où plusieurs
// notes sonnent vraiment ensemble ; une gamme ou un glissando joués note à note, même rapides
// et même sur une étendue modeste, n'en ont jamais plus d'une ou deux à la fois. On mesure donc
// la concurrence réelle (fenêtres [attaque, relâchement] qui se chevauchent) plutôt que de se
// fier à la seule présence de ≥ 3 notes dans le buffer ou à l'étendue.
export function createNoteGrouper({ onGroupReady, toleranceMs = DEFAULT_TOLERANCE_MS } = {}) {
  let pendingNotes = [];
  let timer = null;

  function noteOn(note, velocity = 0.8) {
    pendingNotes.push({ note, velocity, onTime: performance.now(), offTime: null });
    resetTimer();
  }

  function noteOff(note, { sustained = false } = {}) {
    // Pédale tenue : la note continue de sonner, on ne referme pas sa fenêtre.
    if (sustained) return;
    for (let i = pendingNotes.length - 1; i >= 0; i--) {
      if (pendingNotes[i].note === note && pendingNotes[i].offTime === null) {
        pendingNotes[i].offTime = performance.now();
        break;
      }
    }
  }

  function resetTimer() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      flush();
    }, toleranceMs);
  }

  // Garde-fou "gamme sous pédale" : quand la pédale est tenue, noteOff() ne ferme jamais
  // offTime (voir plus haut) — la concurrence calculée dans flush() peut donc être
  // artificiellement gonflée même pour un trait joué note à note (gamme, mouvement).
  // Un vrai accord (même roulé) empile des notes qui ne sont jamais toutes voisines d'un
  // demi-ton/ton une fois triées par hauteur — une gamme ou un trait conjoint, si. On
  // rejette donc comme "non-accord" tout groupe dont TOUTES les notes voisines (triées par
  // hauteur) sont à un intervalle conjoint (≤ CONJUNCT_INTERVAL_SEMITONES).
  function isMelodicRun(group) {
    if (group.length < MIN_SIMULTANEOUS) return false;
    const byPitch = group.map((n) => n.note).sort((a, b) => a - b);
    for (let i = 1; i < byPitch.length; i++) {
      if (byPitch[i] - byPitch[i - 1] > CONJUNCT_INTERVAL_SEMITONES) return false;
    }
    return true;
  }

  function flush() {
    if (pendingNotes.length === 0) return;
    const group = pendingNotes.slice();
    pendingNotes = [];
    timer = null;

    const noteValues = group.map((n) => n.note);
    const span = Math.max(...noteValues) - Math.min(...noteValues);
    // Garde-fou d'étendue : un mouvement/glissando large ne peut pas être un accord tenu.
    if (span > MAX_SPAN_SEMITONES) return;

    if (isMelodicRun(group)) return;

    const flushTime = performance.now();
    const events = [];
    for (const n of group) {
      events.push({ t: n.onTime, delta: 1 });
      events.push({ t: n.offTime ?? flushTime, delta: -1 });
    }
    events.sort((a, b) => a.t - b.t);
    let concurrent = 0;
    let maxConcurrent = 0;
    for (const e of events) {
      concurrent += e.delta;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
    }
    // Garde-fou de simultanéité : si jamais au moins MIN_SIMULTANEOUS notes ne sonnent
    // vraiment ensemble au même instant, ce n'est pas un accord (gamme/mouvement note à note).
    if (maxConcurrent < MIN_SIMULTANEOUS) return;

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
