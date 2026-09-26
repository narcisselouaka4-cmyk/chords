// [OpenCode] — 2026-07-04 — Lecteur de sessions MIDI.
// Rejoue les événements enregistrés en les réinjectant dans le moteur de détection existant.
// [Claude] — 2026-09-25 — Relecture exacte (Narcisse : « il ne peut pas reproduire
// exactement mon jeu ») : la note posée pile au début d'un moment est jouée
// (elle était sautée : comparaison stricte), la pédale est rejouée, et en
// partant du milieu d'un passage, ce qui sonnait à cet instant (touches
// tenues, pédale enfoncée) est remis en place.

export function createPlayer({ onNoteOn, onNoteOff, onSustain, onPitchWheel, onModWheel, onProgramChange } = {}) {
  let events = [];
  let startTime = 0;
  let state = 'stopped'; // 'stopped' | 'playing' | 'paused'
  let speed = 1;
  let currentTime = 0;
  let rafId = null;
  let scheduledUntil = 0;
  // Le prochain envoi inclut les évènements pile à scheduledUntil (début de lecture, saut).
  let inclusive = true;
  let activeNotes = new Set();
  let pedalDown = false;

  function allNotesOff() {
    for (const note of activeNotes) {
      onNoteOff?.(note);
    }
    activeNotes.clear();
    if (pedalDown) {
      pedalDown = false;
      onSustain?.(false);
    }
  }

  /** Ce qui sonne à l'instant t : touches tenues (avec leur vélocité) et pédale. */
  function soundingAt(t) {
    const held = new Map();
    let pedal = false;
    for (const e of events) {
      if (e.time >= t) break;
      if (e.type === 'note_on' && (e.velocity ?? 1) > 0) held.set(e.note, e);
      else if (e.type === 'note_off' || (e.type === 'note_on' && !(e.velocity > 0))) held.delete(e.note);
      else if (e.type === 'control' && e.controller === 64) pedal = e.value >= 64;
    }
    return { held: [...held.values()], pedal };
  }

  /** Remet en place ce qui sonnait à currentTime (lecture reprise au milieu d'un passage). */
  function restoreAt(t) {
    if (t <= 0) return;
    const { held, pedal } = soundingAt(t);
    if (pedal) {
      pedalDown = true;
      onSustain?.(true);
    }
    for (const e of held) {
      activeNotes.add(e.note);
      onNoteOn?.(e.note, e.velocity ?? 0.8, e.channel);
    }
  }

  function load(eventsData) {
    allNotesOff();
    stop();
    events = [...eventsData].sort((a, b) => a.time - b.time);
    currentTime = 0;
  }

  function play() {
    if (state === 'playing') return;

    if (state === 'paused') {
      // Reprendre exactement à currentTime, pas à zéro.
      startTime = performance.now() - (currentTime * 1000) / speed;
    } else {
      startTime = performance.now() - (currentTime * 1000) / speed;
    }

    state = 'playing';
    scheduledUntil = currentTime;
    inclusive = true;
    restoreAt(currentTime);
    scheduleLoop();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    currentTime = getCurrentTime();
    cancelFrame(rafId);
    rafId = null;
    allNotesOff();
  }

  function stop() {
    state = 'stopped';
    currentTime = 0;
    speed = 1;
    cancelFrame(rafId);
    rafId = null;
    scheduledUntil = 0;
    allNotesOff();
  }

  function seek(time) {
    // 1. Couper toutes les notes actives AVANT de déplacer la tête de lecture.
    allNotesOff();

    // 2. Seulement après, mettre à jour la position.
    const wasPlaying = state === 'playing';
    currentTime = Math.max(0, Math.min(time, getDuration()));
    scheduledUntil = currentTime;
    inclusive = true;
    if (wasPlaying) {
      startTime = performance.now() - (currentTime * 1000) / speed;
      restoreAt(currentTime);
    }
  }

  function setSpeed(newSpeed) {
    if (newSpeed <= 0) return;
    const wasPlaying = state === 'playing';
    currentTime = getCurrentTime();
    speed = newSpeed;
    if (wasPlaying) {
      startTime = performance.now() - (currentTime * 1000) / speed;
      scheduledUntil = currentTime;
    }
  }

  function getCurrentTime() {
    if (state !== 'playing') return currentTime;
    return ((performance.now() - startTime) / 1000) * speed;
  }

  function getDuration() {
    if (events.length === 0) return 0;
    return events[events.length - 1].time;
  }

  function scheduleLoop() {
    if (state !== 'playing') return;

    const now = getCurrentTime();
    const lookahead = 0.1; // schedule events 100ms ahead

    // Dispatch events that should already have happened
    while (scheduledUntil < now + lookahead && scheduledUntil < getDuration()) {
      const sliceEnd = Math.min(now + lookahead, getDuration());
      const from = scheduledUntil;
      const slice = events.filter((e) => (inclusive ? e.time >= from : e.time > from) && e.time <= sliceEnd);
      inclusive = false;
      for (const event of slice) {
        dispatchEvent(event);
      }
      scheduledUntil = sliceEnd;
    }

    if (now >= getDuration()) {
      state = 'stopped';
      currentTime = getDuration();
      cancelFrame(rafId);
      rafId = null;
      allNotesOff();
      return;
    }

    const nextDelay = Math.max(8, (lookahead * 1000) / 2);
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(scheduleLoop);
    } else {
      rafId = setTimeout(scheduleLoop, nextDelay);
    }
  }

  function cancelFrame(id) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }

  function dispatchEvent(event) {
    switch (event.type) {
      case 'note_on':
        activeNotes.add(event.note);
        onNoteOn?.(event.note, event.velocity ?? 0.8, event.channel);
        break;
      case 'note_off':
        activeNotes.delete(event.note);
        onNoteOff?.(event.note, event.channel);
        break;
      case 'control':
        if (event.controller === 64) {
          pedalDown = event.value >= 64;
          onSustain?.(pedalDown, event.channel);
        }
        else if (event.controller === 1) onModWheel?.(event.value / 127, event.channel);
        else onModWheel?.(event.value / 127, event.channel);
        break;
      case 'pitch_bend':
        onPitchWheel?.(event.value, event.channel);
        break;
      case 'program_change':
        onProgramChange?.(event.program, event.channel);
        break;
    }
  }

  return {
    load,
    play,
    pause,
    stop,
    seek,
    setSpeed,
    getDuration,
    getCurrentTime,
    get state() { return state; },
    get isPlaying() { return state === 'playing'; },
    get isPaused() { return state === 'paused'; },
    get speed() { return speed; },
  };
}
