// [OpenCode] — 2026-08-07 — Lot A : tests du rendu de la démonstration de
// réharmonisation. Exécutable avec : node tests/ui/test-reharmonization-view.js
// Aucun navigateur, jsdom ou dépendance supplémentaire : Node seul, avec un
// mini-mock DOM suffisant pour valider la logique de la vue.
//
// Ces tests valident :
//  - l'ouverture de la démonstration ;
//  - la présence du conteneur de résultats ;
//  - le nombre d'étapes identique au viewModel ;
//  - l'absence de l'accord retenu dans les alternatives ;
//  - l'absence de style bloquant connu sur le conteneur ;
//  - l'ouverture, fermeture et réouverture sans duplication ;
//  - l'absence de nouvelle exécution musicale lors d'un simple rendu.

import { buildDemoFixture } from '../../src/ui/reharmonization-demo-fixture.js';
import { buildReharmonizationViewModel } from '../../src/ui/reharmonization-orchestrator.js';
import {
  renderReharmonizationEmpty,
  renderReharmonizationLoading,
  renderReharmonizationError,
  renderReharmonizationSuccess,
} from '../../src/ui/reharmonization-view.js';
import { buildHarmonizationPlan } from '../../src/melody/harmonization-planner.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let total = 0;
let passed = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name} : ${err.message}`);
    process.exitCode = 1;
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'expected true');
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// --- Mini-mock DOM (suffisant pour reharmonization-view.js) ------------------
// On implémente uniquement la surface utilisée par la vue : createElement,
// appendChild, removeChild, textContent, setAttribute, classList, firstChild.

class MockNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.firstChild = null;
    this.textContent = '';
    this.attributes = {};
    this.classList = new Set();
    this.parentNode = null;
    this._innerHTML = null;
    this.title = '';
  }

  appendChild(child) {
    if (typeof child === 'string') {
      const txt = new MockNode('#text');
      txt.textContent = child;
      this.children.push(txt);
      txt.parentNode = this;
    } else {
      this.children.push(child);
      child.parentNode = this;
    }
    if (this.firstChild === null) this.firstChild = this.children[0];
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      child.parentNode = null;
      this.firstChild = this.children[0] || null;
      return child;
    }
    throw new Error('removeChild: child not found');
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') {
      this.classList = new Set(String(value).split(/\s+/).filter(Boolean));
    }
  }

  getAttribute(name) {
    return this.attributes[name] != null ? this.attributes[name] : null;
  }

  set className(v) {
    this.classList = new Set(String(v).split(/\s+/).filter(Boolean));
    this.attributes['class'] = String(v);
  }
  get className() {
    return this.attributes['class'] || '';
  }

  set innerHTML(v) {
    this._innerHTML = String(v);
    // Simuler des enfants : on ne parse pas le HTML, mais on marque le nœud.
    this.children = [];
    this.firstChild = null;
  }
  get innerHTML() {
    return this._innerHTML != null ? this._innerHTML : '';
  }
}

class MockDocument {
  constructor() {
    this.body = new MockNode('body');
  }
  createElement(tag) { return new MockNode(tag); }
  createTextNode(text) {
    const n = new MockNode('#text');
    n.textContent = String(text);
    return n;
  }
}

// Remplace global.document pour les modules qui l'utilisent au rendu.
const mockDoc = new MockDocument();
global.document = mockDoc;

// --- Source des fichiers (pour les gardes statiques) -----------------------
const viewSrc = fs.readFileSync(
  fileURLToPath(new URL('../../src/ui/reharmonization-view.js', import.meta.url)),
  'utf8',
);

// ===========================================================================
// Tests
// ===========================================================================

console.log('Tests reharmonization-view (Lot A — révélation des résultats)');

runTest('A1 — renderReharmonizationEmpty produit un conteneur d’état vide', () => {
  const container = new MockNode('div');
  renderReharmonizationEmpty(container);
  assertTrue(container.children.length > 0, 'le conteneur vide doit avoir un enfant');
  // Vérifie la classe d’état vide.
  const hasEmptyClass = container.children.some((c) => c.classList.has('reharm-empty'));
  assertTrue(hasEmptyClass, 'un élément .reharm-empty doit être présent');
});

runTest('A2 — renderReharmonizationLoading produit un état chargement', () => {
  const container = new MockNode('div');
  renderReharmonizationLoading(container);
  const hasLoading = container.children.some((c) => c.classList.has('reharm-loading'));
  assertTrue(hasLoading, 'un élément .reharm-loading doit être présent');
});

runTest('A3 — renderReharmonizationError produit un état erreur', () => {
  const container = new MockNode('div');
  renderReharmonizationError(container, 'boom', 'TypeError');
  const hasError = container.children.some((c) => c.classList.has('reharm-error'));
  assertTrue(hasError, 'un élément .reharm-error doit être présent');
});

runTest('A4 — renderReharmonizationSuccess rend un nombre d’étapes identique au viewModel', () => {
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  assertEqual(vm.status, 'success', 'le viewModel doit être un succès');

  const container = new MockNode('div');
  renderReharmonizationSuccess(container, vm, fixture.meta);

  // Le conteneur doit contenir : bannière + totaux + progression.
  // On cherche la progression (classe reharm-progression).
  const progression = container.children.find((c) => c.classList.has('reharm-progression'));
  assertTrue(progression, 'un élément .reharm-progression doit être présent');

  // Compter les cartes d’étape (.reharm-step) dans la progression.
  const steps = progression.children.filter((c) => c.classList.has('reharm-step'));
  assertEqual(steps.length, vm.steps.length, 'le nombre de cartes doit correspondre au viewModel');
});

runTest('A5 — le candidat retenu est absent des alternatives affichées', () => {
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  const container = new MockNode('div');
  renderReharmonizationSuccess(container, vm, fixture.meta);

  const progression = container.children.find((c) => c.classList.has('reharm-progression'));
  const steps = progression.children.filter((c) => c.classList.has('reharm-step'));

  for (let i = 0; i < vm.steps.length; i++) {
    const step = vm.steps[i];
    const card = steps[i];
    // Le symbole retenu doit être affiché dans l’en-tête de l’accord.
    const chordLine = card.children.find((c) => c.classList.has('reharm-step-chord'));
    assertTrue(chordLine, 'la carte doit contenir la ligne d’accord retenu');
    assertTrue(chordLine.textContent.includes(step.chordSymbol), 'le symbole retenu doit être affiché');

    // Les alternatives ne doivent pas contenir le symbole retenu.
    const altBox = card.children.find((c) => c.classList.has('reharm-step-alternatives'));
    assertTrue(altBox, 'la carte doit contenir un bloc alternatives');
    const altList = altBox.children.find((c) => c.classList.has('reharm-step-alternatives-list'));
    assertTrue(altList, 'la liste d’alternatives doit être présente');
    const chips = altList.children.filter((c) => c.classList.has('reharm-alt-chip'));
    assertEqual(chips.length, step.alternatives.length, 'le nombre de chips doit correspondre');
    for (const chip of chips) {
      assertTrue(!chip.textContent.includes(step.chordSymbol),
        `l’alternative « ${chip.textContent} » ne doit pas contenir le symbole retenu « ${step.chordSymbol} »`);
    }
  }
});

runTest('A6 — le conteneur de résultats ne porte aucun style bloquant connu', () => {
  // Garde statique : reharmonization-view.js ne doit pas appliquer de
  // max-height, height fixe, ou overflow:hidden sur le conteneur de résultats.
  assertTrue(!/max-height\s*:/.test(viewSrc), 'la vue ne doit pas définir max-height');
  assertTrue(!/overflow\s*:\s*hidden/.test(viewSrc), 'la vue ne doit pas appliquer overflow:hidden');
  // Garde aussi sur le rendu : le conteneur de succès ne reçoit pas de hauteur.
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  const container = new MockNode('div');
  renderReharmonizationSuccess(container, vm, fixture.meta);
  // Le conteneur lui-même ne doit pas recevoir de style hauteur/overflow.
  assertTrue(container.getAttribute('style') == null || !/height|overflow/.test(container.getAttribute('style')),
    'le conteneur de résultats ne doit pas recevoir de style height/overflow');
});

runTest('A7 — fermeture puis réouverture ne dupliquent pas les résultats', () => {
  // Simule : rendu succès, puis nouveau rendu (réouverture) — clearChildren
  // garantit qu’on ne duplique pas les étapes.
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  const container = new MockNode('div');

  renderReharmonizationSuccess(container, vm, fixture.meta);
  const progression1 = container.children.find((c) => c.classList.has('reharm-progression'));
  const steps1 = progression1.children.filter((c) => c.classList.has('reharm-step'));

  // Réouverture : nouveau rendu sur le même conteneur.
  renderReharmonizationSuccess(container, vm, fixture.meta);
  const progression2 = container.children.find((c) => c.classList.has('reharm-progression'));
  const steps2 = progression2.children.filter((c) => c.classList.has('reharm-step'));

  assertEqual(container.children.filter((c) => c.classList.has('reharm-progression')).length, 1,
    'il ne doit rester qu’un seul bloc progression (pas de duplication)');
  assertEqual(steps2.length, steps1.length, 'le nombre d’étapes doit être identique');
  assertEqual(steps2.length, vm.steps.length, 'et égal au viewModel');
});

runTest('A8 — un simple rendu n’invoque pas le moteur canonique', () => {
  // Garde statique : reharmonization-view.js ne doit pas importer ni appeler
  // buildHarmonizationPlan. La vue ne fait que rendre le viewModel.
  assertTrue(!/buildHarmonizationPlan/.test(viewSrc),
    'la vue ne doit pas référencer buildHarmonizationPlan (aucune décision musicale)');
  assertTrue(!/harmonization-planner/.test(viewSrc),
    'la vue ne doit pas importer harmonization-planner');

  // Vérifie aussi que le rendu préserve exactement les identifiants du viewModel
  // (aucun recalcul). On compare les symboles affichés aux symboles du vm.
  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  const container = new MockNode('div');
  renderReharmonizationSuccess(container, vm, fixture.meta);
  const progression = container.children.find((c) => c.classList.has('reharm-progression'));
  const steps = progression.children.filter((c) => c.classList.has('reharm-step'));
  for (let i = 0; i < vm.steps.length; i++) {
    const chordLine = steps[i].children.find((c) => c.classList.has('reharm-step-chord'));
    assertEqual(chordLine.textContent, `Accord retenu : ${vm.steps[i].chordSymbol} (qualité ${vm.steps[i].chordQualityId || '—'})`,
      `le symbole affiché doit être exactement celui du viewModel (étape ${i})`);
  }
});

runTest('A9 — le rendu préserve l’ordre du HarmonizationPlan', () => {
  const fixture = buildDemoFixture();
  const wrapper = { track: fixture.track, harmonicContext: fixture.harmonicContext };
  const plan = buildHarmonizationPlan(wrapper);
  const vm = buildReharmonizationViewModel(wrapper);
  const container = new MockNode('div');
  renderReharmonizationSuccess(container, vm, fixture.meta);
  const progression = container.children.find((c) => c.classList.has('reharm-progression'));
  const steps = progression.children.filter((c) => c.classList.has('reharm-step'));
  assertEqual(steps.length, plan.steps.length, 'le nombre d’étapes affichées == plan');
  for (let i = 0; i < plan.steps.length; i++) {
    const idx = plan.steps[i].index;
    assertEqual(vm.steps[i].index, idx, `l’index du vm ${i} doit correspondre au plan`);
  }
});

runTest('A10 — les états fermé, chargement, succès et erreur restent distincts', () => {
  const c0 = new MockNode('div');
  renderReharmonizationEmpty(c0);
  assertTrue(c0.children.some((c) => c.classList.has('reharm-empty')), 'état vide distinct');

  const c1 = new MockNode('div');
  renderReharmonizationLoading(c1);
  assertTrue(c1.children.some((c) => c.classList.has('reharm-loading')), 'état chargement distinct');

  const c2 = new MockNode('div');
  renderReharmonizationError(c2, 'x', 'Error');
  assertTrue(c2.children.some((c) => c.classList.has('reharm-error')), 'état erreur distinct');

  const fixture = buildDemoFixture();
  const vm = buildReharmonizationViewModel({
    track: fixture.track,
    harmonicContext: fixture.harmonicContext,
  });
  const c3 = new MockNode('div');
  renderReharmonizationSuccess(c3, vm, fixture.meta);
  // L’état succès contient la bannière de démonstration.
  assertTrue(c3.children.some((c) => c.classList.has('reharm-demo-banner')), 'état succès distinct (bannière démo)');
});

// ===========================================================================

console.log(`\n=== Résultat : ${passed}/${total} tests passés ===`);
if (passed === total) {
  console.log('LOT A : tests rendu réharmonisation OK');
} else {
  console.log('LOT A : ÉCHEC');
}