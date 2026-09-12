import { playNote, releaseNote, resumeAudio } from './audio/simple-synth.js';

let noteOnHandler = null;
let noteOffHandler = null;
let keyboardKeydownHandler = null;
let keyboardKeyupHandler = null;

let pcKeyboardToMidiEnabled = true;
let pcKeyboardEnabledCallback = null;

export function setPcKeyboardToMidiEnabled(enabled) {
  pcKeyboardToMidiEnabled = Boolean(enabled);
  pcKeyboardEnabledCallback?.(pcKeyboardToMidiEnabled);
  // Relâcher toutes les notes actuellement enfoncées par le clavier PC
  // si on désactive en cours de jeu, pour éviter les notes bloquées.
  if (!pcKeyboardToMidiEnabled) {
    for (const midi of pressed) {
      if (noteOffHandler) noteOffHandler(midi, true);
    }
    pressed.clear();
  }
}

export function isPcKeyboardToMidiEnabled() {
  return pcKeyboardToMidiEnabled;
}

export function onPcKeyboardToMidiChange(callback) {
  pcKeyboardEnabledCallback = callback;
}

function getActiveTab() {
  const activeBtn = document.querySelector('.tab-btn.active');
  return activeBtn?.dataset?.tab || 'practice';
}

function shouldHandleKeyboardShortcuts() {
  // Only enable computer-keyboard shortcuts on the practice tab,
  // where the virtual keyboard is the primary input method.
  if (!pcKeyboardToMidiEnabled) return false;
  if (getActiveTab() !== 'practice') return false;

  // Ne jamais intercepter les touches quand l'utilisateur est dans un
  // champ de saisie (Copilot, réglages, etc.).
  const active = document.activeElement;
  if (!active) return true;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (active.isContentEditable) return false;

  return true;
}

export function initVirtualKeyboard({ onNoteOn, onNoteOff }) {
  noteOnHandler = onNoteOn;
  noteOffHandler = onNoteOff;

  const container = document.getElementById('keyboard-container');
  if (!container) return;

  // Remove any previous global keyboard shortcut listeners to avoid duplicates.
  if (keyboardKeydownHandler) {
    document.removeEventListener('keydown', keyboardKeydownHandler);
    document.removeEventListener('keyup', keyboardKeyupHandler);
  }

  const keys = container.querySelectorAll('.note');

  const startNote = (el) => {
    const midi = Number(el.getAttribute('data-midi'));
    if (Number.isFinite(midi) && midi >= 12 && midi <= 127 && noteOnHandler) {
      noteOnHandler(midi, 0.8, true);
    }
  };

  const endNote = (el) => {
    const midi = Number(el.getAttribute('data-midi'));
    if (Number.isFinite(midi) && midi >= 12 && midi <= 127 && noteOffHandler) {
      noteOffHandler(midi, true);
    }
  };

  for (const key of keys) {
    key.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startNote(key);
    });
    key.addEventListener('mouseup', () => endNote(key));
    key.addEventListener('mouseleave', () => endNote(key));

    key.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startNote(key);
    });
    key.addEventListener('touchend', () => endNote(key));
  }

  // Keyboard shortcuts (one octave starting at C4)
  const keyMap = {
    a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
    k: 72, o: 73, l: 74, p: 75,
  };

  const pressed = new Set();

  keyboardKeydownHandler = (e) => {
    if (e.code === 'Space') return; // Espace réservé au Play/Pause du lecteur.
    if (!shouldHandleKeyboardShortcuts()) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.repeat) return;
    const midi = keyMap[e.key.toLowerCase()];
    if (midi && !pressed.has(midi)) {
      pressed.add(midi);
      if (noteOnHandler) noteOnHandler(midi, 0.8, true);
    }
  };

  keyboardKeyupHandler = (e) => {
    if (!shouldHandleKeyboardShortcuts()) return;
    const midi = keyMap[e.key.toLowerCase()];
    if (midi) {
      pressed.delete(midi);
      if (noteOffHandler) noteOffHandler(midi, true);
    }
  };

  document.addEventListener('keydown', keyboardKeydownHandler);
  document.addEventListener('keyup', keyboardKeyupHandler);
}

export async function playVirtualNote(midi, velocity) {
  // Réveille l'AudioContext s'il a été suspendu par la politique d'autoplay
  // (notamment après une période d'inactivité dans une conversation Copilot).
  await resumeAudio();
  playNote(midi, velocity);
}

export function releaseVirtualNote(midi) {
  releaseNote(midi);
}
