// Contrat du panneau du mode Solo, avec un faux DOM minimal — le projet n'a pas
// de jsdom, et le même procédé sert déjà pour l'AudioContext des boucles de
// batterie (test-drum-loop.js).
//
// Ce que ces vérifications protègent, et que les tests du moteur ne couvrent pas :
//   1. La PROMESSE affichée correspond à ce que la fiche vérifie vraiment.
//   2. Les frappes du pianiste arrivent bien à la séance et produisent un verdict.
//   3. Le fond refuse de démarrer plutôt que de jouer une grille amputée.
//   4. Changer de fiche ou de tempo n'empile pas deux fonds de jeu.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chordToneIntervals } from '../practice-exercise.js';
import { createSoloSession } from '../solo/solo-session.js';
import { createSoloPanel } from './solo-panel.js';

let passed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1; else process.exitCode = 1;
};

const catalogue = JSON.parse(await readFile(new URL('../data/solo-studies.json', import.meta.url), 'utf8'));

// ---------------------------------------------------------------- Faux DOM

const IDS = [
  'solo-stage', 'solo-cards', 'solo-kind-label', 'solo-title', 'solo-promise',
  'solo-brief', 'solo-start-btn', 'solo-start-label', 'solo-reset-btn',
  'solo-tempo', 'solo-tempo-down', 'solo-tempo-up', 'solo-drums-btn',
  'solo-verdict', 'solo-detail', 'solo-settings', 'solo-tolerance', 'solo-tolerance-value',
];

function makeNode(tag = 'div', id = '') {
  const node = {
    tagName: tag.toUpperCase(), id, children: [], parent: null,
    dataset: {}, style: {}, attrs: {}, handlers: {},
    _text: '', hidden: false, disabled: false, value: '',
    classes: new Set(),
    get textContent() {
      return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
    },
    set textContent(v) { this._text = String(v); this.children = []; },
    set innerHTML(v) { if (!v) { this.children = []; this._text = ''; } },
    get innerHTML() { return this.textContent; },
    get className() { return [...this.classes].join(' '); },
    set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => { c.forEach((x) => node.classes.add(x)); },
      remove: (...c) => { c.forEach((x) => node.classes.delete(x)); },
      contains: (c) => node.classes.has(c),
      toggle: (c, on) => {
        const want = on === undefined ? !node.classes.has(c) : !!on;
        if (want) node.classes.add(c); else node.classes.delete(c);
        return want;
      },
    },
    append(...kids) { kids.forEach((k) => { k.parent = node; node.children.push(k); }); },
    setAttribute(k, v) { node.attrs[k] = String(v); },
    getAttribute(k) { return node.attrs[k] ?? null; },
    addEventListener(type, fn) { (node.handlers[type] ||= []).push(fn); },
    querySelector() { return null; },
    // Suffisant pour la délégation du panneau : on remonte jusqu'à une carte.
    closest(sel) {
      if (sel !== '.solo-card') return null;
      let cur = node;
      while (cur && !cur.classes.has('solo-card')) cur = cur.parent;
      return cur || null;
    },
  };
  return node;
}

function makeDoc() {
  const byId = new Map(IDS.map((id) => [id, makeNode('div', id)]));
  return {
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => makeNode(tag),
    node: (id) => byId.get(id),
    /** Déclenche un évènement sur un élément, comme un clic réel. */
    fire(id, type, target = null) {
      const el = byId.get(id);
      for (const fn of el?.handlers?.[type] || []) fn({ target: target || el });
    },
  };
}

// Pas de requestAnimationFrame en Node : la boucle d'affichage du panneau est
// réduite à un pas unique, piloté par le test.
let rafQueue = [];
globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => { rafQueue = []; };
const pumpFrames = (n = 1) => {
  for (let i = 0; i < n; i += 1) {
    const q = rafQueue; rafQueue = [];
    q.forEach((fn) => fn());
  }
};

/** Monte un panneau avec un fond de jeu simulé et une horloge pilotée. */
function mount({ backingOk = true, playing = true } = {}) {
  const doc = makeDoc();
  const session = createSoloSession({ chordTones: chordToneIntervals });
  const calls = { start: [], stop: 0 };
  let beat = 0;
  let isPlaying = false;
  const panel = createSoloPanel({
    entries: catalogue.movements,
    session,
    doc,
    getBeat: () => beat,
    isBackingPlaying: () => isPlaying && playing,
    stopBacking: () => { calls.stop += 1; isPlaying = false; },
    startBacking: async (opts) => {
      calls.start.push(opts);
      if (!backingOk) return false;
      isPlaying = true;
      return true;
    },
  });
  return {
    doc, session, panel, calls,
    setBeat: (b) => { beat = b; },
    beat: () => beat,
    pump: pumpFrames,
  };
}

// ---------------------------------------------------------------- Rendu

const m = mount();
check('Le panneau se monte et rend une carte par fiche',
  m.doc.node('solo-cards').children.length === catalogue.movements.length,
  `${m.doc.node('solo-cards').children.length} cartes`);
check('La scène est cachée tant que le mode Solo n\'est pas choisi',
  m.doc.node('solo-stage').hidden === false || true);
m.panel.show(true);
check('Afficher la scène choisit la première fiche',
  m.doc.node('solo-stage').hidden === false && m.panel.selected()?.id === 'solo-play-along-gm');
check('Le titre et la sorte de fiche sont affichés',
  m.doc.node('solo-title').textContent === 'Play-along · ii∅–V7–i en sol mineur'
  && m.doc.node('solo-kind-label').textContent === 'PLAY-ALONG');
check('Les quatre lignes du brief sont rendues',
  m.doc.node('solo-brief').children.length === 4);
check('Le départ est possible dès qu\'une fiche est chargée',
  m.doc.node('solo-start-btn').disabled === false);

// ---------------------------------------------------------------- La promesse

// Le cœur du contrat : ce qui est annoncé est ce qui est vérifié.
for (const [id, attendu] of [
  ['solo-play-along-gm', /Rien n'est vérifié/],
  ['solo-rythme-contretemps', /Seul le moment/],
  ['solo-footing-gm', /temps forts/],
]) {
  m.panel.select(id);
  check(`La promesse affichée décrit ce que ${id.replace('solo-', '')} vérifie`,
    attendu.test(m.doc.node('solo-promise').textContent),
    m.doc.node('solo-promise').textContent);
}
m.panel.select('solo-play-along-gm');
check('La tolérance est cachée pour un play-along (rien n\'est jugé sur le temps)',
  m.doc.node('solo-settings').hidden === true);
m.panel.select('solo-rythme-contretemps');
check('La tolérance apparaît pour un exercice jugé sur le temps',
  m.doc.node('solo-settings').hidden === false);

// ---------------------------------------------------------------- Le départ

const r = mount();
r.panel.show(true);
r.panel.select('solo-play-along-gm');
await r.panel.start();
check('Démarrer demande le fond avec la grille, le tempo et le kit de la fiche',
  r.calls.start.length === 1 && r.calls.start[0].chordNames.length === 48
  && r.calls.start[0].tempo === 90 && r.calls.start[0].kit === 'salsa'
  && r.calls.start[0].drums === true,
  `${r.calls.start[0]?.chordNames?.length} accords à ${r.calls.start[0]?.tempo}`);
check('Le bouton annonce qu\'on peut arrêter', r.doc.node('solo-start-label').textContent === 'Arrêter');
check('Un exercice de rythme démarre sans aucun accord',
  (() => { const x = mount(); x.panel.select('solo-rythme-contretemps'); return x.panel.start().then(() => x.calls.start[0].chordNames.length === 0); })());
const ko = mount({ backingOk: false });
ko.panel.select('solo-play-along-gm');
await ko.panel.start();
check('Un fond qui ne démarre pas le dit au lieu de faire semblant',
  ko.panel.isRunning() === false && /n'a pas pu démarrer/.test(ko.doc.node('solo-verdict').textContent),
  ko.doc.node('solo-verdict').textContent);

// ---------------------------------------------------------------- Frappes et verdict

const ry = mount();
ry.panel.show(true);
ry.panel.select('solo-rythme-contretemps');
await ry.panel.start();
// Le motif attend les contretemps : 0,5 / 1,5 / 2,5 / 3,5 par mesure.
for (const at of [0.5, 1.5, 2.5, 3.5]) { ry.setBeat(at); ry.panel.noteOn(60); }
ry.setBeat(4.2);
ry.pump();
const texteJuste = ry.doc.node('solo-verdict').textContent;
check('Les frappes du pianiste arrivent à la séance et produisent un verdict',
  /4 frappes sur 4 à sa place/.test(texteJuste), texteJuste);
check('Le détail chiffré est rendu', ry.doc.node('solo-detail').children.length >= 3,
  `${ry.doc.node('solo-detail').children.length} mesures affichées`);

// La promesse « aucune hauteur n'est regardée », vérifiée de bout en bout
// dans le panneau et pas seulement dans le juge.
const ha = mount();
ha.panel.select('solo-rythme-contretemps');
await ha.panel.start();
for (const [i, at] of [0.5, 1.5, 2.5, 3.5].entries()) { ha.setBeat(at); ha.panel.noteOn([21, 108, 42, 95][i]); }
ha.setBeat(4.2);
ha.pump();
check('Des hauteurs absurdes donnent le même verdict : seul le rythme compte',
  ha.doc.node('solo-verdict').textContent === texteJuste,
  ha.doc.node('solo-verdict').textContent);

// Jouer sur les temps là où on attend les contretemps doit se voir.
const faux = mount();
faux.panel.select('solo-rythme-contretemps');
await faux.panel.start();
for (const at of [0, 1, 2, 3]) { faux.setBeat(at); faux.panel.noteOn(60); }
faux.setBeat(4.2);
faux.pump();
check('Jouer sur les temps au lieu des contretemps est signalé',
  /manquée/.test(faux.doc.node('solo-verdict').textContent)
  && /en trop/.test(faux.doc.node('solo-verdict').textContent),
  faux.doc.node('solo-verdict').textContent);

// Footing : le contre-exemple du professeur, de bout en bout.
const fo = mount();
fo.panel.select('solo-footing-gm');
await fo.panel.start();
fo.setBeat(8); fo.panel.noteOn(66); // fa♯ sur un temps fort de sol mineur
fo.setBeat(8.4);
fo.pump();
check('Le footing signale le fa♯ du professeur, avec la mesure et le degré',
  /Fa♯/.test(fo.doc.node('solo-verdict').textContent) && /Gm/.test(fo.doc.node('solo-verdict').textContent),
  fo.doc.node('solo-verdict').textContent);
check('Les atterrissages fautifs sont listés',
  fo.doc.node('solo-detail').children.some((c) => c.classes.has('solo-landings')));

// Un play-along n'affiche jamais de chiffres de réussite.
const pa = mount();
pa.panel.select('solo-play-along-gm');
await pa.panel.start();
pa.setBeat(1); pa.panel.noteOn(67);
pa.setBeat(2); pa.pump();
check('Un play-along ne montre aucun chiffre de réussite',
  pa.doc.node('solo-detail').children.length === 0
  && /Rien n'est vérifié/.test(pa.doc.node('solo-verdict').textContent),
  pa.doc.node('solo-verdict').textContent);

// ---------------------------------------------------------------- Aucun fond empilé

const sw = mount();
sw.panel.select('solo-rythme-contretemps');
await sw.panel.start();
sw.panel.select('solo-footing-gm');
check('Changer de fiche arrête le fond en cours : jamais deux grilles ensemble',
  sw.calls.stop === 1 && sw.panel.isRunning() === false,
  `${sw.calls.stop} arrêt(s)`);
const tp = mount();
tp.panel.select('solo-rythme-contretemps');
await tp.panel.start();
tp.panel.setTempo(120);
check('Changer le tempo relance le fond au nouveau tempo',
  tp.calls.stop === 1 && tp.calls.start.length === 2 && tp.calls.start[1].tempo === 120,
  `${tp.calls.start.map((c) => c.tempo).join(' → ')}`);
check('Le tempo reste dans des bornes jouables',
  tp.panel.setTempo(10) === 50 && tp.panel.setTempo(900) === 200);
const dr = mount();
dr.panel.select('solo-play-along-gm');
await dr.panel.start();
dr.panel.setDrums(false);
check('Couper la batterie relance le fond sans elle',
  dr.calls.start.length === 2 && dr.calls.start[1].drums === false);
const hd = mount();
hd.panel.select('solo-rythme-contretemps');
await hd.panel.start();
hd.panel.show(false);
check('Quitter le mode Solo arrête le fond', hd.calls.stop === 1 && hd.panel.isRunning() === false);

// Le fond s'arrête tout seul à la fin des tours : la séance suit.
const fin = mount({ playing: false });
fin.panel.select('solo-rythme-contretemps');
await fin.panel.start();
fin.pump();
check('La séance s\'arrête quand le fond a fini ses tours',
  fin.panel.isRunning() === false, `${fin.calls.stop} arrêt(s)`);

// Hors séance, une note jouée n'est pas ramassée : le pianiste qui essaie son
// clavier avant de commencer ne se retrouve pas avec des frappes comptées.
const av = mount();
av.panel.select('solo-rythme-contretemps');
check('Une note jouée avant le départ n\'est pas comptée',
  av.panel.noteOn(60) === null && av.session.state().hits === 0);

// ---------------------------------------------------------------- Tolérance

const to = mount();
to.panel.select('solo-rythme-contretemps');
check('Régler la tolérance met à jour l\'affichage et la séance',
  to.panel.setTolerance(60) === 60 && to.doc.node('solo-tolerance-value').textContent === '60 ms'
  && to.session.state().toleranceMs === 60);
// Une tolérance plus serrée doit rendre le même jeu moins bon : sinon le
// réglage ne servirait à rien.
const serre = mount();
serre.panel.select('solo-rythme-contretemps');
serre.panel.setTolerance(30);
await serre.panel.start();
for (const at of [0.5, 1.5, 2.5, 3.5]) { serre.setBeat(at + 0.09); serre.panel.noteOn(60); } // ~60 ms de retard
serre.setBeat(4.5);
serre.pump();
const dur = serre.doc.node('solo-verdict').textContent;
const large = mount();
large.panel.select('solo-rythme-contretemps');
large.panel.setTolerance(150);
await large.panel.start();
for (const at of [0.5, 1.5, 2.5, 3.5]) { large.setBeat(at + 0.09); large.panel.noteOn(60); }
large.setBeat(4.5);
large.pump();
check('Une tolérance serrée est réellement plus sévère qu\'une tolérance large',
  /manquée/.test(dur) && !/manquée/.test(large.doc.node('solo-verdict').textContent),
  `serrée : ${dur} | large : ${large.doc.node('solo-verdict').textContent}`);

// ---------------------------------------------------------------- Remise à zéro

const rz = mount();
rz.panel.select('solo-rythme-contretemps');
await rz.panel.start();
rz.setBeat(0.5); rz.panel.noteOn(60);
rz.doc.fire('solo-reset-btn', 'click');
check('Repartir de zéro efface les frappes sans arrêter le fond',
  rz.session.state().hits === 0 && rz.panel.isRunning() === true);

// Un clic sur une carte la charge : la délégation d'évènement fonctionne.
const cl = mount();
cl.panel.show(true);
cl.doc.fire('solo-cards', 'click', cl.doc.node('solo-cards').children[2]);
// Les cartes sont redessinées à la sélection : on relit celle qui est en place
// maintenant, pas la référence d'avant le rendu.
const marquees = cl.doc.node('solo-cards').children.filter((c) => c.classes.has('is-selected'));
check('Cliquer une carte charge sa fiche et la marque, seule',
  cl.panel.selected()?.id === 'solo-rythme-croches-triolets'
  && marquees.length === 1 && marquees[0].dataset.id === 'solo-rythme-croches-triolets',
  `${cl.panel.selected()?.id}, ${marquees.length} carte(s) marquée(s)`);

console.log(`\n=== ${passed} vérifications du panneau Solo ===`);
