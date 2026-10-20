// Exécute les vrais branchements de main.js sans démarrer Electron ni le MIDI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('function initSettings()'), main.indexOf('function initPanelToggles()'));
const field = (value = '') => ({
  value, checked: false, listeners: {},
  addEventListener(type, listener) { this.listeners[type] = listener; },
});
const els = Object.fromEntries([
  'noteStart', 'noteEnd', 'notation', 'colorNote', 'transposeInput',
  'silentMode', 'pcKeyboardMidi', 'toleranceInput',
].map(name => [name, field()]));
const state = { noteStart: 'C0', noteEnd: 'C9', notation: 'english', transpose: 0, colorNote: '#2563eb' };
let refreshes = 0;
const changes = [];
const noop = () => {};
const ctx = vm.createContext({
  els, state, document: { getElementById: () => null },
  window: { addEventListener: noop, dispatchEvent: event => changes.push(event.detail) },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  readKeyColors: () => ({}), saveKeyColors: noop, applyYouColor: noop,
  refreshAppKeyColor: noop, setPcKeyboardToMidiEnabled: noop,
  shiftTransposedState: noop, noteGrouper: null,
  refreshKeyboard: () => { refreshes++; }, refreshChord: noop,
});
vm.runInContext(`${source}\ninitSettings();`, ctx);
assert.equal(els.noteStart.value, 'C0');
assert.equal(els.noteEnd.value, 'C9');
assert.equal('keyboardSize' in els, false);
els.noteStart.value = 'C2';
els.noteStart.listeners.change();
assert.equal(state.noteStart, 'C2');
assert.equal(refreshes, 1);
els.noteEnd.value = 'C7';
els.noteEnd.listeners.change();
assert.equal(state.noteEnd, 'C7');
assert.equal(refreshes, 2);
assert.equal(changes.length, 2);
els.transposeInput.value = '1';
els.transposeInput.listeners.change();
assert.equal(state.transpose, 1);
assert.equal(refreshes, 3);
console.log('Clavier : initialisation sans Étendue, Début, Fin, transposition et notifications OK.');
