import assert from 'node:assert/strict';
import { createDictation } from './copilot-dictation.js';
let stopped = 0;
let instance;
let settle;
let text = '';
let errors = [];
const stream = { getTracks: () => [{ stop: () => stopped++ }] };
class Recorder {
  static isTypeSupported() { return true; }
  constructor() { instance = this; this.state = 'inactive'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['audio']) }); settle = this.onstop(); }
}
const dictation = createDictation({ mediaDevices: { getUserMedia: async () => stream }, Recorder,
  transcribe: async () => ({ ok: true, text: 'Garde mon rythme.' }), onText: (s) => { text = s; }, onError: (s) => errors.push(s) });
await dictation.toggle();
assert.equal(dictation.state(), 'recording');
await dictation.toggle(); await settle;
assert.equal(text, 'Garde mon rythme.'); assert.equal(stopped, 1); assert.equal(dictation.state(), 'idle');
console.log('✓ La dictée remplit le texte et libère le micro');
let resolve;
const late = createDictation({ mediaDevices: { getUserMedia: () => new Promise((r) => { resolve = r; }) }, Recorder, transcribe: async () => ({ ok: true, text: '' }) });
const opening = late.toggle(); late.cancel(); resolve(stream); await opening;
assert.equal(stopped, 2); assert.equal(late.state(), 'idle');
console.log('✓ Annulation pendant l’ouverture : micro rendu dès son arrivée');
let finish;
const pending = createDictation({ mediaDevices: { getUserMedia: async () => stream }, Recorder,
  transcribe: () => new Promise((r) => { finish = r; }), onText: () => { throw new Error('Résultat périmé ajouté'); } });
await pending.toggle(); await pending.toggle();
await new Promise((r) => setTimeout(r, 0));
pending.cancel(); finish({ ok: true, text: 'Ancienne conversation' }); await settle;
assert.equal(pending.state(), 'idle');
console.log('✓ Annulation pendant la transcription : aucun texte dans une autre conversation');
const denied = createDictation({ mediaDevices: { getUserMedia: async () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; } }, Recorder, transcribe: async () => ({}), onError: (s) => errors.push(s) });
await denied.toggle(); assert.match(errors.at(-1), /refusé/); assert.equal(denied.state(), 'idle');
console.log('✓ Refus du micro expliqué sans bloquer la saisie');
console.log('4/4 vérifications réussies');
