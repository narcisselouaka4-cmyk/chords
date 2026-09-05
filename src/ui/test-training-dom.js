// [Cowork] — 2026-08-31 — Test de contrat DOM pour les chantiers Entraînement.
// [OpenCode] — 2026-09-01 — Étendu à la refonte Hub → modes : Hub à cartes,
// vues dédiées, IDs des composants conservés (références DOM intactes),
// plus d'IDs orphelins (subnav, toggles de repli supprimés).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');

function readText(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8');
}

let failures = 0;
function check(cond, label) {
  if (cond) {
    console.log(`✅ ${label}`);
  } else {
    failures++;
    console.error(`❌ ${label}`);
  }
}

// ── Contrat DOM : IDs présents dans index.html ──
function testDomContract() {
  const html = readText('src/index.html');

  check(html.includes('id="suggestions-panel"'), 'DOM — #suggestions-panel présent');
  check(html.includes('id="suggestions-content"'), 'DOM — #suggestions-content présent');
  check(html.includes('id="suggestions-history-count"'), 'DOM — #suggestions-history-count présent');
  check(html.includes('id="chord-history-panel"'), 'DOM — #chord-history-panel présent');
  check(html.includes('id="chord-history-list"'), 'DOM — #chord-history-list présent');
  check(html.includes('id="training-mode-header"'), 'DOM — header de vue dédiée présent');
  check(html.includes('id="training-back-btn"'), 'DOM — bouton Retour/Navigation présent');
  check(html.includes('id="training-view-free-play"'), 'DOM — vue Jeu libre présente');
  check(html.includes('id="training-view-techniques"'), 'DOM — vue Techniques présente');
  check(html.includes('id="training-view-exercises"'), 'DOM — vue Exercices présente');
  check(html.includes('id="training-view-history"'), 'DOM — vue Historique présente');
  check(html.includes('id="training-midi-sessions-view"'), 'DOM — #training-midi-sessions-view présent');
  check(html.includes('id="midi-session-list"'), 'DOM — #midi-session-list présent');
  check(html.includes('id="midi-session-new-btn"'), 'DOM — #midi-session-new-btn présent');
  check(html.includes('id="midi-session-start-btn"'), 'DOM — #midi-session-start-btn présent');
  check(html.includes('id="midi-session-stop-btn"'), 'DOM — #midi-session-stop-btn présent');
  check(html.includes('id="midi-session-transport"'), 'DOM — #midi-session-transport présent');

  // Nouveaux éléments : rail + tiroirs
  check(html.includes('id="app-rail"'), 'DOM — rail permanent #app-rail présent');
  check(html.includes('id="drawer-practice"'), 'DOM — tiroir Entraînement présent');
  check(html.includes('id="drawer-analysis"'), 'DOM — tiroir Analyse présent');
  check(html.includes('id="drawer-studio"'), 'DOM — tiroir Studio présent');
  check(html.includes('id="practice-drawer-trigger"'), 'DOM — déclencheur tiroir Entraînement présent');
  check(html.includes('data-domain="practice"'), 'DOM — bouton rail Entraînement présent');
  check(html.includes('data-domain="analysis"'), 'DOM — bouton rail Analyse présent');
  check(html.includes('data-domain="studio"'), 'DOM — bouton rail Studio présent');
  check(html.includes('data-mode="midi-sessions"'), 'DOM — item tiroir Sessions MIDI présent');

  // Composants déplacés, jamais recréés : chaque ID critique existe UNE seule
  // fois (sinon getElementById renvoie le premier = références muettes).
  for (const id of [
    'chord-display', 'chord-name', 'chord-detail', 'notes-display',
    'pedagogy-panel', 'pedagogy-content', 'practice-exercise-panel',
    'exercise-content', 'exercise-target', 'exercise-feedback',
    'suggestions-panel', 'chord-history-panel', 'practice-empty-hint',
    'midi-diagnostic-panel', 'midi-diagnostic-content',
  ]) {
    const count = html.split(`id="${id}"`).length - 1;
    check(count === 1, `DOM — #${id} unique (${count})`);
  }

  // Les anciens éléments retirés ne doivent plus exister nulle part.
  for (const gone of [
    'training-subnav', 'exercise-panel-toggle', 'exercise-panel-tab',
    'pedagogy-toggle', 'pedagogy-panel-tab', 'history-panel-toggle',
    'training-realtime-view', 'training-hub',
  ]) {
    check(!html.includes(gone), `DOM — ${gone} retiré (plus de double navigation/repli/Hub)`);
  }

  // CSS des panneaux + rail/tiroirs présents
  const css = readText('src/style.css');
  check(css.includes('.suggestions-panel'), 'CSS — .suggestions-panel stylé');
  check(css.includes('.history-panel'), 'CSS — .history-panel stylé');
  check(css.includes('.app-rail'), 'CSS — rail permanent stylé');
  check(css.includes('.rail-btn'), 'CSS — boutons rail stylés');
  check(css.includes('.domain-drawer'), 'CSS — tiroirs d\'overlay stylés');
  check(css.includes('.drawer-panel'), 'CSS — panneaux tiroir stylés');
  check(css.includes('.drawer-nav'), 'CSS — navigation tiroir stylée');
  check(css.includes('.drawer-item'), 'CSS — items tiroir stylés');
  check(css.includes('.practice-toolbar'), 'CSS — toolbar Entraînement stylée');
  check(css.includes('.drawer-trigger-btn'), 'CSS — déclencheur tiroir stylé');
  check(css.includes('.training-back-btn'), 'CSS — bouton Navigation stylé');
}

// ── Contrat de branchement dans main.js ──
function testMainWiring() {
  const main = readText('src/main.js');

  check(main.includes('createSuggestionsPanel'), 'main.js — createSuggestionsPanel importé/utilisé');
  check(main.includes('setRenderContainer'), 'main.js — historique rendu dans son container');
  check(main.includes('initRecordingTab'), 'main.js — initRecordingTab appelé');
  check(main.includes('initTabNavigation'), 'main.js — rail + tiroirs appelé');
  check(main.includes('initTrainingModes'), 'main.js — machine d\'états modes appelée');
  check(main.includes('app-rail'), 'main.js — rail branché');
  check(main.includes('drawer-practice'), 'main.js — tiroir Entraînement branché');
  check(main.includes('data-drawer-close'), 'main.js — fermeture tiroir branchée');
  check(main.includes('drawer-nav-practice'), 'main.js — navigation tiroir Entraînement branchée');
  check(main.includes('training-back-btn'), 'main.js — Navigation vers tiroir branchée');
  check(main.includes('practice-drawer-trigger'), 'main.js — déclencheur tiroir Entraînement branché');
  check(main.includes('feedRecorderNoteOn'), 'main.js — notes MIDI alimentent le recorder');
  check(main.includes('sustainUp'), 'main.js — levée de pédale horodatée pour le grouper');
}

// ── Comportement du note-grouper (bug glissando) ──
async function testNoteGrouper() {
  const { createNoteGrouper } = await import('../note-grouper.js');

  let virtualNow = 0;
  const originalNow = globalThis.performance?.now?.bind(globalThis.performance);
  globalThis.performance = { now: () => virtualNow };

  // Glissando complet C1→C7, notes de 60 ms d'intervalle, 80 ms tenues.
  const glissandoGroups = [];
  const glissando = createNoteGrouper({
    toleranceMs: 200,
    maxWindowMs: 500,
    onGroupReady: (g) => glissandoGroups.push(g.map((n) => n.note)),
  });
  for (let n = 24; n <= 96; n++) {
    glissando.noteOn(n, 0.8);
    virtualNow += 60;
    glissando.noteOff(n);
  }
  virtualNow += 300;
  glissando.flush();
  const glissandoBig = glissandoGroups.find((g) => new Set(g).size >= 5);
  check(!glissandoBig, 'Grouper — glissando : aucun groupe ≥ 5 notes distinctes (plus de C13 possible)');

  // Accord tenu simultané : toujours détecté comme groupe.
  const chordGroups = [];
  const chord = createNoteGrouper({
    toleranceMs: 200,
    maxWindowMs: 500,
    onGroupReady: (g) => chordGroups.push(g.map((n) => n.note)),
  });
  virtualNow = 1000;
  [60, 64, 67].forEach((n) => chord.noteOn(n, 0.8));
  virtualNow += 600;
  [60, 64, 67].forEach((n) => chord.noteOff(n));
  virtualNow += 300;
  chord.flush();
  check(
    chordGroups.length === 1 && chordGroups[0].length === 3,
    'Grouper — accord tenu simultané : groupe de 3 notes émis'
  );

  // Cascade tenue (arpège, touches maintenues) : toujours reconstituée.
  const arpGroups = [];
  const arp = createNoteGrouper({
    toleranceMs: 200,
    maxWindowMs: 500,
    onGroupReady: (g) => arpGroups.push(g.map((n) => n.note)),
  });
  virtualNow = 5000;
  [60, 64, 67, 71].forEach((n) => {
    arp.noteOn(n, 0.8);
    virtualNow += 120;
  });
  virtualNow += 300;
  arp.flush();
  check(
    arpGroups.length === 1 && arpGroups[0].length === 4,
    'Grouper — cascade tenue 120 ms : accord de 4 notes reconstitué'
  );

  // Deux notes successives sans chevauchement (mouvement 7-3) : pas de groupe.
  const moveGroups = [];
  const move = createNoteGrouper({
    toleranceMs: 200,
    maxWindowMs: 500,
    onGroupReady: (g) => moveGroups.push(g.map((n) => n.note)),
  });
  virtualNow = 10000;
  move.noteOn(59, 0.8);
  virtualNow += 10;
  move.noteOff(59);
  virtualNow += 30;
  move.noteOn(64, 0.8);
  virtualNow += 300;
  move.flush();
  check(moveGroups.length === 0, 'Grouper — mouvement 7-3 sans chevauchement : pas de faux accord');

  if (originalNow) {
    globalThis.performance.now = originalNow;
  }
}

// ── Contrat suggestions : 4 catégories présentes ──
async function testSuggestionsContract() {
  const src = readText('src/ui/suggestions.js');
  check(src.includes('approach-sixth'), 'Suggestions — catégorie « avant le 6e degré » présente');
  check(src.includes('top-notes-voicing'), 'Suggestions — catégorie « voicing top notes » présente');
  check(src.includes('inner-movements'), 'Suggestions — catégorie « mouvements internes » présente');
  check(src.includes('bass-role'), 'Suggestions — catégorie « rôle de la basse » présente');

  // Le module ne couple pas l'historique à un seul consommateur : il accepte
  // n'importe quel objet avec getAll().
  const { createSuggestionsPanel } = await import('../ui/suggestions.js');
  const panel = createSuggestionsPanel({ getAll: () => [{ name: 'Cmaj7', notes: [60, 64, 67, 71], result: { bassPc: 0 }, timestamp: 0 }] });
  const html = panel.build();
  check(html.includes('Avant le 6e degré'), 'Suggestions — rendu contient la catégorie 6e degré');
  check(html.includes('Cmaj7'), 'Suggestions — rendu alimenté par l\'historique');
}

testDomContract();
testMainWiring();
await testNoteGrouper();
await testSuggestionsContract();

console.log(failures === 0 ? '\n=== Tous les tests Entraînement passent ===' : `\n=== ${failures} échec(s) ===`);
process.exit(failures === 0 ? 0 : 1);