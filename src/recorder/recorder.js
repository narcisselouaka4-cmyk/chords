// [OpenCode] — 2026-07-04 — Enregistreur de sessions MIDI.
// Capture tous les événements MIDI avec un timestamp relatif au début de l'enregistrement.

export function createRecorder() {
  let events = [];
  let startTime = 0;
  let isRecording = false;
  let isPaused = false;
  let pausedDuration = 0;
  let pauseStart = 0;

  function now() {
    if (!isRecording) return 0;
    if (isPaused) return (pauseStart - startTime - pausedDuration) / 1000;
    return (performance.now() - startTime - pausedDuration) / 1000;
  }

  function start() {
    events = [];
    startTime = performance.now();
    pausedDuration = 0;
    isRecording = true;
    isPaused = false;
  }

  function pause() {
    if (!isRecording || isPaused) return;
    isPaused = true;
    pauseStart = performance.now();
  }

  function resume() {
    if (!isRecording || !isPaused) return;
    pausedDuration += performance.now() - pauseStart;
    isPaused = false;
  }

  function stop() {
    isRecording = false;
    isPaused = false;
    return getEvents();
  }

  function addEvent(event) {
    if (!isRecording || isPaused) return;
    events.push({
      ...event,
      time: now(),
    });
  }

  function noteOn(note, velocity = 0.8, channel = 0) {
    addEvent({ type: 'note_on', note, velocity, channel });
  }

  function noteOff(note, channel = 0) {
    addEvent({ type: 'note_off', note, velocity: 0, channel });
  }

  function control(controller, value, channel = 0) {
    addEvent({ type: 'control', controller, value, channel });
  }

  function sustain(value, channel = 0) {
    control(64, value ? 127 : 0, channel);
  }

  function pitchWheel(value, channel = 0) {
    addEvent({ type: 'pitch_bend', value, channel });
  }

  function modWheel(value, channel = 0) {
    control(1, Math.round(value * 127), channel);
  }

  function programChange(program, channel = 0) {
    addEvent({ type: 'program_change', program, channel });
  }

  function sysEx(data, channel = 0) {
    addEvent({ type: 'sys_ex', data, channel });
  }

  function getEvents() {
    return [...events];
  }

  function getStats() {
    const noteOnEvents = events.filter((e) => e.type === 'note_on');
    const lastEvent = events[events.length - 1];
    return {
      duration: lastEvent?.time || 0,
      noteCount: noteOnEvents.length,
      chordCount: 0, // computed externally by chord history
    };
  }

  return {
    start,
    pause,
    resume,
    stop,
    noteOn,
    noteOff,
    control,
    sustain,
    pitchWheel,
    modWheel,
    programChange,
    sysEx,
    getEvents,
    getStats,
    getCurrentTime: now,
    get isRecording() { return isRecording; },
    get isPaused() { return isPaused; },
  };
}
