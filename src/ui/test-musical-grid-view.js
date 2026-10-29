import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { formatMusicChord } from './music-notation.js';
import { createMusicalGridView } from './components/musical-grid-view.js';
import { initGridDesignToggle } from './components/grid-design-toggle.js';

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
  getBoundingClientRect() {
    if (this.classList.contains('mg-beat')) {
      const pulses = this.parentElement.children.filter((c) => c.classList.contains('mg-beat'));
      const width = 380 / pulses.length, left = 8 + pulses.indexOf(this) * width;
      return { top: 0, bottom: 60, left, right: left + width, width };
    }
    return { top: 0, bottom: 1000, left: 0, right: 400, width: 400 };
  }
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
  assert.equal(host.querySelectorAll('.mg-surface').length, count);
  assert.equal(host.querySelectorAll('.mg-fill').length, count);
  assert.equal(host.querySelectorAll('.mg-duration').length, 0);
  assert.equal(host.querySelectorAll('.mg-section-title').length, 0);
  assert(host.querySelectorAll('.mg-section').every((group) => !group.attrs['aria-label']));
  view.render(analysis, { detailed: true });
  assert.equal(host.querySelectorAll('.mg-cell').length, count);
  assert.equal(host.querySelector('.mg-passages').textContent, 'D#dim');
  assert.equal(host.querySelector('.mg-passages').parentElement.parentElement.parentElement.tagName, 'button');
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
  view.update(.1);
  const startPosition = Number(beats[0].parentElement.style['--playhead']);
  view.update(.2);
  assert(Number(beats[0].parentElement.style['--playhead']) > startPosition, 'le remplissage avance aussi entre deux pulsations');
  assert.equal(beats[0].classList.contains('is-current'), true);
  view.update(17); assert.equal(beats[34].classList.contains('is-current'), true);
  assert(host.scrollTop > 0);
  view.update(.6); assert.equal(beats[34].classList.contains('is-current'), false);
  assert.equal(beats[1].classList.contains('is-current'), true); assert.equal(host.scrollTop, 0);
  assert.equal(beats.filter((b) => b.classList.contains('is-current')).length, 1);
  view.update(24); assert.equal(beats.filter((b) => b.classList.contains('is-current')).length, 0);
  assert(host.querySelectorAll('.mg-cell').every((cell) => !cell.attrs['aria-current']));
});

test('DOM : premier temps retardé au bon instant, sans faux temps fort à zéro', () => {
  const host = new Element(), view = createMusicalGridView(host);
  view.render(analysis, { rhythm: { beatTimes: Array.from({ length: 47 }, (_, i) => .3 + i * .5) } });
  // Plus de numéro de mesure à gauche : la levée se lit au temps fort, pas à l'étiquette.
  assert.ok(!host.querySelector('.mg-row-number'));
  assert.equal(host.querySelector('.mg-row-time').textContent, '0:00');
  const beats = host.querySelectorAll('.mg-beat');
  assert.equal(beats[0].classList.contains('mg-downbeat'), false);
  assert.equal(beats[1].classList.contains('mg-downbeat'), true);
  view.update(.3); assert.equal(beats[1].classList.contains('is-current'), true);
});

test('DOM : une mesure irrégulière ne coupe pas les accords en fin de ligne', () => {
  const host = new Element(), view = createMusicalGridView(host);
  view.render(analysis, { rhythm: {
    beatTimes: Array.from({ length: 48 }, (_, i) => i * .5),
    downbeatTimes: [0, 2, 4.5, 6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 18.5, 20.5, 22.5],
  } });
  const row = host.querySelector('.mg-row');
  assert.equal(row.querySelectorAll('.mg-beat').length, 17);
  assert.equal(row.querySelector('.mg-row-track').style['--row-beats'], '17');
});

test('DOM : remplissage calé sur les temps réels, même à tempo variable et au retour arrière', () => {
  const host = new Element(), clicks = [];
  const view = createMusicalGridView(host, { onSeek: (time) => clicks.push(time) });
  view.render({ tempo: 120, duration: 4, chords: [chord('C', 0, 4)] }, {
    rhythm: { beatTimes: [0, .25, .8, 1.5, 2, 2.5, 3, 3.5] },
  });
  const cell = host.querySelector('.mg-cell');
  view.update(.8); assert.equal(Number(cell.style['--playhead']), .25);
  view.update(1.15); assert.equal(Number(cell.style['--playhead']), .3125);
  view.update(.25); assert.equal(Number(cell.style['--playhead']), .125);
  const pulses = host.querySelectorAll('.mg-beat');
  assert.equal(pulses[1].classList.contains('is-current'), true);
  // Un clic sur un repère retrouve ce même temps, sans décalage dû aux marges de la capsule.
  const second = pulses[1].getBoundingClientRect();
  cell.listeners.click({ detail: 1, clientX: second.left + 1 });
  assert.equal(clicks[0], .25);
});


test('DOM : saut direct, changement de capsule et retour arrière sans remplissage périmé', () => {
  const host = new Element(), view = createMusicalGridView(host);
  const source = structuredClone(analysis);
  view.render(source);
  const cells = host.querySelectorAll('.mg-cell');
  view.update(5);
  assert.equal(cells[1].attrs['aria-current'], 'true');
  assert.equal(Number(cells[1].style['--playhead']), .5);
  view.update(1);
  assert.equal(cells[0].attrs['aria-current'], 'true');
  assert.equal(Number(cells[0].style['--playhead']), .5);
  assert.equal(cells[1].attrs['aria-current'], undefined);
  view.update(3.5);
  assert.equal(Number(cells[1].style['--playhead']), .25);
  assert.equal(cells[0].attrs['aria-current'], undefined);
  view.render(source); view.update(3.5);
  assert.equal(Number(host.querySelectorAll('.mg-cell')[1].style['--playhead']), .25);
  assert.deepEqual(source, analysis, 'la présentation ne modifie pas les accords sources');
});

test('DOM : comparaison Cases/Capsules mémorisée, sans reconstruire la grille ni perdre la position', () => {
  const saved = new Map(), storage = { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v) };
  const host = new Element(), button = new Element('button'), view = createMusicalGridView(host);
  view.render(analysis); view.update(5); host.scrollTop = 100;
  const cells = host.querySelectorAll('.mg-cell'), active = cells[1];
  initGridDesignToggle(button, host, storage);
  assert.equal(host.dataset.gridDesign, 'classic');
  assert.equal(button.textContent, 'Design : Cases');
  button.listeners.click();
  assert.equal(host.dataset.gridDesign, 'capsules');
  assert.equal(button.textContent, 'Design : Capsules');
  assert.equal(host.querySelectorAll('.mg-cell')[1], active);
  assert.equal(active.attrs['aria-current'], 'true');
  assert.equal(Number(active.style['--playhead']), .5);
  assert.equal(host.scrollTop, 100);
  const reopened = new Element();
  initGridDesignToggle(new Element('button'), reopened, storage);
  assert.equal(reopened.dataset.gridDesign, 'capsules');
  button.listeners.click();
  assert.equal(host.dataset.gridDesign, 'classic');
  assert.equal(host.scrollTop, 100);
});

test('DOM : comparaison utilisable même sans stockage de préférence', () => {
  const host = new Element(), button = new Element('button');
  initGridDesignToggle(button, host, { getItem() { throw Error('bloqué'); }, setItem() { throw Error('bloqué'); } });
  assert.equal(host.dataset.gridDesign, 'classic');
  button.listeners.click(); assert.equal(host.dataset.gridDesign, 'capsules');
  button.listeners.click(); assert.equal(host.dataset.gridDesign, 'classic');
});

test('DOM : une vraie case par temps, accords aux attaques et clic dans une tenue', () => {
  const host = new Element(), seeks = [], edits = [];
  const view = createMusicalGridView(host, { onSeek: (...args) => seeks.push(args), onEdit: (id) => edits.push(id) });
  const before = structuredClone(analysis); view.render(analysis);
  const cells = host.querySelectorAll('.mg-time-cell');
  assert.equal(cells.length, 48);
  assert(cells.every((cell) => cell.tagName === 'button'));
  assert.deepEqual(cells.filter((cell) => cell.textContent).map((cell) => cell.textContent), ['C', 'F']);
  cells[5].listeners.click(); assert.deepEqual(seeks[0], [2.5, 'F-2']);
  cells[5].listeners.dblclick(); assert.equal(edits[0], 'F-2');
  cells[5].listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(cells[6].focused, true);
  assert.deepEqual(analysis, before);
});

test('DOM : la sélection avance dans une tenue, change de ligne et revient après recul', () => {
  const host = new Element(), view = createMusicalGridView(host); view.render(analysis);
  const cells = host.querySelectorAll('.mg-time-cell');
  for (const [time, beat] of [[1, 2], [1.5, 3], [8.5, 17], [.5, 1]]) {
    view.update(time);
    assert.equal(cells[beat].attrs['aria-current'], 'true');
    assert.equal(cells[beat].classList.contains('is-current'), true);
    assert.equal(cells.filter((cell) => cell.classList.contains('is-current')).length, 1);
  }
  view.update(24);
  assert.equal(cells.filter((cell) => cell.classList.contains('is-current')).length, 0);
});

test('lecture : la grille reçoit le temps même si un autre panneau échoue ensuite', () => {
  const source = readFileSync(new URL('./analyzer-tab.js', import.meta.url), 'utf8');
  const start = source.indexOf('function updatePlaybackPosition(');
  const body = source.slice(start, source.indexOf('\n}\n', start) + 3);
  const received = [];
  const context = vm.createContext({
    currentAnalysis: { duration: 24 }, currentPlayer: { getDuration: () => 24 },
    chordGridExpanded: true, musicalGridView: { update: (time) => received.push(time) },
    updateMusicContext() { throw Error('panneau indisponible'); },
  });
  vm.runInContext(body, context);
  assert.throws(() => context.updatePlaybackPosition(1.5), /panneau indisponible/);
  assert.throws(() => context.updatePlaybackPosition(2.5), /panneau indisponible/);
  assert.deepEqual(received, [1.5, 2.5]);
});

test('DOM : notation latine sans modifier les symboles ni les identités de la grille', () => {
  const host = new Element(), calls = [];
  const source = { tempo: 120, duration: 2, chords: [chord('F#m7/C#', 0, 2)] };
  const before = JSON.stringify(source);
  const view = createMusicalGridView(host, { onSeek: (...args) => calls.push(args) });
  view.render(source, { formatChord: (symbol) => formatMusicChord(symbol, { latin: true, spelling: 'auto' }) });
  const first = host.querySelectorAll('.mg-time-cell')[0];
  assert.equal(first.textContent, 'Fa♯m7/Do♯');
  assert.equal(first.dataset.symbol, 'F#m7/C#');
  first.listeners.click();
  assert.equal(calls[0][1], source.chords[0].segmentId);
  assert.equal(JSON.stringify(source), before);
});
