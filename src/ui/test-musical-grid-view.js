import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicalGridView } from './components/musical-grid-view.js';

// DOM minimal : on exerce le vrai rendu et ses gestionnaires, sans exécuter Electron.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {};
    this.className = ''; this.scrollTop = 0; this.textContent = '';
    this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    this.classList = {
      add: (s) => { if (!this.classList.contains(s)) this.className += ` ${s}`; },
      remove: (s) => { this.className = this.className.split(' ').filter((x) => x !== s).join(' '); },
      contains: (s) => this.className.split(' ').includes(s),
    };
  }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  replaceChildren(...children) { this.children = []; children.forEach((c) => this.appendChild(c)); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  getBoundingClientRect() { return { top: 0, bottom: 1000, left: 0, width: 400 }; }
  scrollTo({ top }) { this.scrollTop = top; }
  querySelectorAll(selector) {
    return this.children.flatMap((c) => [...(c.classList.contains(selector.slice(1)) ? [c] : []), ...c.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  focus() { this.focused = true; }
}
globalThis.document = { createElement: (tag) => new Element(tag) };
const chord = (symbol, from, to) => ({ chord: symbol, startTime: from, endTime: to, segmentId: `${symbol}-${from}` });
const analysis = { tempo: 120, duration: 24, chords: [chord('C', 0, 1.8), chord('D#dim', 1.8, 2), chord('F', 2, 24)] };

test('DOM : cellules fusionnées, une heure par ligne, détails sans cellule supplémentaire', () => {
  const host = new Element(), view = createMusicalGridView(host);
  view.render(analysis);
  const count = host.querySelectorAll('.mg-cell').length;
  assert.equal(host.querySelectorAll('.mg-row-time').length, 3);
  assert.equal(host.querySelectorAll('.mg-beat').length, 48);
  assert.equal(host.querySelectorAll('.mg-passages').length, 0);
  view.render(analysis, { detailed: true });
  assert.equal(host.querySelectorAll('.mg-cell').length, count);
  assert.equal(host.querySelector('.mg-passages').textContent, 'D#dim');
  assert.equal(host.querySelector('.mg-passages').parentElement.parentElement.tagName, 'button');
});

test('DOM : clic au temps pointé dans une cellule longue, clavier et édition par identité', () => {
  const host = new Element(), seeks = [], edits = [];
  const view = createMusicalGridView(host, { onSeek: (...args) => seeks.push(args), onEdit: (id) => edits.push(id) });
  view.render(analysis);
  const cell = host.querySelector('.mg-cell');
  cell.listeners.click({ detail: 1, clientX: 250 });
  assert.deepEqual(seeks[0], [1, 'C-0']);
  cell.listeners.click({ detail: 0 }); assert.equal(seeks[1][0], 0);
  cell.listeners.dblclick(); assert.equal(edits[0], 'C-0');
  cell.listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(host.querySelectorAll('.mg-cell')[1].focused, true);
});

test('DOM : seul le temps courant est surligné, suivi vertical et retour arrière', () => {
  const host = new Element(), view = createMusicalGridView(host); view.render(analysis);
  host.getBoundingClientRect = () => ({ top: 0, bottom: 120 });
  host.querySelectorAll('.mg-row').forEach((row, i) => {
    row.getBoundingClientRect = () => ({ top: i * 58 - host.scrollTop, bottom: i * 58 + 56 - host.scrollTop });
  });
  const beats = host.querySelectorAll('.mg-beat');
  view.update(17); assert.equal(beats[34].classList.contains('is-current'), true);
  assert(host.scrollTop > 0);
  view.update(.6); assert.equal(beats[34].classList.contains('is-current'), false);
  assert.equal(beats[1].classList.contains('is-current'), true); assert.equal(host.scrollTop, 0);
  assert.equal(beats.filter((b) => b.classList.contains('is-current')).length, 1);
  view.update(24); assert.equal(beats.filter((b) => b.classList.contains('is-current')).length, 0);
});

test('DOM : premier temps retardé au bon instant, sans faux temps fort à zéro', () => {
  const host = new Element(), view = createMusicalGridView(host);
  view.render(analysis, { rhythm: { beatTimes: Array.from({ length: 47 }, (_, i) => .3 + i * .5) } });
  assert.equal(host.querySelector('.mg-row-number').textContent, 'Levée');
  const beats = host.querySelectorAll('.mg-beat');
  assert.equal(beats[0].classList.contains('mg-downbeat'), false);
  assert.equal(beats[1].classList.contains('mg-downbeat'), true);
  view.update(.3); assert.equal(beats[1].classList.contains('is-current'), true);
});
