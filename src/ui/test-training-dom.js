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

// [Claude] — 2026-09-24 — Contrat remis à jour sur l'interface réelle.
// Ce fichier est arrivé dans le dépôt par la sauvegarde 59dcf3e (05/09) avec le
// contrat d'une refonte « Hub → modes » à rail + tiroirs qui n'y a jamais été
// committée : ses ~3 200 lignes (index.html, style.css, main.js…) ont été mises
// de côté le 02/09 comme « direction de navigation explicitement révoquée »
// (JOURNAL-REFONTE.md, 2026-09-02 ; rail aussi écarté dans les deux skins). Les
// assertions de ce rail / de ces tiroirs / des vues Hub sont donc retirées ; celles
// dont la fonction existe ailleurs visent désormais l'élément réel (onglets,
// sous-navigation, vues dédiées Astra). Voir aussi « Fonctionnalités jamais
// branchées » plus bas.

// ── Contrat DOM : IDs présents dans index.html ──
function testDomContract() {
  const html = readText('src/index.html');

  // Fonctionnalités jamais branchées dans cette application : le panneau Suggestions
  // (src/ui/suggestions.js existe mais n'est importé nulle part) et l'affichage
  // de l'historique des accords (chord-history.js est alimenté mais jamais
  // rendu, depuis le premier commit ; VISION.md le prévoit au Module 1).
  // Décision de Narcisse (24/09) : Temps réel n'est pas modifié, et ces
  // vérifications restent VOLONTAIREMENT en échec, en attendant que les deux
  // panneaux trouvent leur place ailleurs. Ne pas les retirer.
  check(html.includes('id="suggestions-panel"'), 'DOM — #suggestions-panel présent');
  check(html.includes('id="suggestions-content"'), 'DOM — #suggestions-content présent');
  check(html.includes('id="suggestions-history-count"'), 'DOM — #suggestions-history-count présent');
  check(html.includes('id="chord-history-panel"'), 'DOM — #chord-history-panel présent');
  check(html.includes('id="chord-history-list"'), 'DOM — #chord-history-list présent');

  // Vues de l'Entraînement : les vues « Hub » (#training-view-*, en-tête de vue et
  // bouton Retour vers un tiroir) sont remplacées par la sous-navigation Astra
  // (#practice-subnav, data-view) et ses vues dédiées (#practice-view-*).
  check(html.includes('id="practice-subnav"'), 'DOM — sous-navigation Entraînement (#practice-subnav) présente');
  check(html.includes('data-view="realtime"'), 'DOM — entrée Temps réel (ex-« Jeu libre ») présente');
  check(html.includes('data-view="exercise"'), 'DOM — entrée Exercices présente');
  check(html.includes('data-view="midi-sessions"'), 'DOM — entrée Sessions MIDI (ex-item de tiroir) présente');
  check(html.includes('id="practice-view-exercices"'), 'DOM — vue Exercices dédiée (#practice-view-exercices) présente');
  check(html.includes('id="practice-view-midi-sessions"'), 'DOM — vue Sessions MIDI dédiée (#practice-view-midi-sessions) présente');
  // Les Techniques ne sont pas une vue mais un panneau repliable de Temps réel.
  check(html.includes('id="pedagogy-toggle"') && html.includes('id="pedagogy-panel-tab"'),
    'DOM — panneau Techniques repliable (#pedagogy-toggle, #pedagogy-panel-tab) présent');
  check(html.includes('id="midi-session-list"'), 'DOM — #midi-session-list présent');
  check(html.includes('id="midi-session-new-btn"'), 'DOM — #midi-session-new-btn présent');
  check(html.includes('id="midi-session-start-btn"'), 'DOM — #midi-session-start-btn présent');
  check(html.includes('id="midi-session-stop-btn"'), 'DOM — #midi-session-stop-btn présent');
  check(html.includes('id="midi-session-transport"'), 'DOM — #midi-session-transport présent');

  // Navigation entre domaines : barre d'onglets (le rail et ses boutons
  // data-domain, révoqués, n'ont jamais existé ici).
  check(html.includes('data-tab="practice"'), 'DOM — onglet Entraînement présent');
  check(html.includes('data-tab="analysis"'), 'DOM — onglet Analyse présent');
  check(html.includes('data-tab="studio"'), 'DOM — onglet Studio présent');

  // Composants déplacés, jamais recréés : chaque ID critique existe UNE seule
  // fois (sinon getElementById renvoie le premier = références muettes).
  // #exercise-content est devenu la vue dédiée #practice-view-exercices
  // (refonte Astra étape 4, b689f00).
  for (const id of [
    'chord-display', 'chord-name', 'chord-detail', 'notes-display',
    'pedagogy-panel', 'pedagogy-content', 'practice-exercise-panel',
    'practice-view-exercices', 'exercise-target', 'exercise-feedback',
    'suggestions-panel', 'chord-history-panel', 'practice-empty-hint',
    'midi-diagnostic-panel', 'midi-diagnostic-content',
  ]) {
    const count = html.split(`id="${id}"`).length - 1;
    check(count === 1, `DOM — #${id} unique (${count})`);
  }

  // Les anciens éléments retirés ne doivent plus exister nulle part. Le repli
  // du panneau Techniques (pedagogy-toggle, pedagogy-panel-tab) n'en fait plus
  // partie : sa suppression appartenait à la refonte révoquée, et il est branché
  // dans main.js depuis le premier commit.
  for (const gone of [
    'training-subnav', 'exercise-panel-toggle', 'exercise-panel-tab',
    'history-panel-toggle', 'training-realtime-view', 'training-hub',
  ]) {
    check(!html.includes(gone), `DOM — ${gone} retiré (plus de double navigation/repli/Hub)`);
  }

  // [Claude] — 2026-09-25 — Accord cible : les favoris vivent dans une fenêtre
  // temporaire, ouverte par un bouton placé juste après « Filtres » (Narcisse).
  const block = (id) => {
    const start = html.indexOf(`id="${id}"`);
    const open = html.lastIndexOf('<div', start);
    // Fin du bloc : on compte les <div> ouvrants / fermants depuis l'ouverture.
    let depth = 0;
    const tags = /<div\b|<\/div>/g;
    tags.lastIndex = open;
    for (let m = tags.exec(html); m; m = tags.exec(html)) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) return html.slice(open, m.index);
    }
    return '';
  };
  const targetChoice = block('exercise-target-choice');
  const chordSide = block('exercise-chord-side');
  const favoritesDialog = block('exercise-favorites-dialog');
  check(favoritesDialog.includes('class="tr-overlay"') && favoritesDialog.includes('id="exercise-favorites"')
    && favoritesDialog.includes('id="exercise-favorites-search"') && favoritesDialog.includes('data-astra-close'),
    'DOM — favoris dans leur fenêtre (#exercise-favorites-dialog, avec la recherche et une croix)');
  check(!targetChoice.includes('exercise-favorites') && !chordSide.includes('exercise-favorites'),
    'DOM — plus de favoris dans les colonnes (gauche : top note ; droite : voicings)');
  check(chordSide.includes('id="exercise-voicing-choices"'), 'DOM — colonne de droite (#exercise-chord-side) : voicings');
  const headControls = html.slice(html.indexOf('id="exercise-filters-btn"'), html.indexOf('id="exercise-chord-head"') > 0
    ? html.indexOf('</div>', html.indexOf('id="exercise-filters-btn"')) : 0);
  check(/id="exercise-filters-btn"[^]*?<\/button>\s*(<!--[^]*?-->\s*)?<button[^>]*id="exercise-favorites-btn"[^>]*data-astra-open="exercise-favorites-dialog"/.test(headControls),
    'DOM — bouton Favoris juste après Filtres, qui ouvre la fenêtre des favoris');

  // [Claude] — 2026-09-24 — Ma grille : accords choisis (fondamentale + qualité),
  // plus de saisie au clavier (Narcisse : « pas pratique d'écrire »).
  check(['exercise-grid-root', 'exercise-grid-quality', 'exercise-grid-add', 'exercise-grid-chips', 'exercise-grid-clear', 'exercise-grid-play']
    .every((id) => html.includes(`id="${id}"`)) && !html.includes('id="exercise-grid-input"'),
    'DOM — Ma grille : sélecteur fondamentale + qualité, pastilles, plus de champ texte');
  // [Claude] — 2026-09-24 — Note du dessus par accord, accord modifiable, grille
  // enregistrée sous un nom (catégorie Perso de la bibliothèque).
  check(['exercise-grid-top', 'exercise-grid-cancel', 'exercise-grid-name', 'exercise-grid-save', 'exercise-grid-status']
    .every((id) => html.includes(`id="${id}"`)),
    'DOM — Ma grille : note du dessus, modification d\'un accord, enregistrement nommé');
  // [Claude] — 2026-09-24 (nuit) — Niveau lu aux accords de passage (règle de Narcisse).
  check(['sans passage', 'passages diminués', 'passages 7b9, 7#5, 7b5', 'passages altérés'].every((label) => html.includes(label)),
    'DOM — Niveaux : accords de passage par niveau (diminués, 7b9 / 7#5 / 7b5, altérés)');

  // CSS : panneaux jamais branchés (voir plus haut) + navigation réelle. Les
  // styles du rail et des tiroirs (.app-rail, .rail-btn, .domain-drawer,
  // .drawer-*, .practice-toolbar, .training-back-btn) appartenaient à la refonte
  // révoquée ; la sous-navigation Astra est stylée dans src/ui/refonte/.
  const css = readText('src/style.css');
  check(css.includes('.suggestions-panel'), 'CSS — .suggestions-panel stylé');
  check(css.includes('.history-panel'), 'CSS — .history-panel stylé');
  check(css.includes('.tab-btn'), 'CSS — onglets stylés');
  const refonteCss = ['astra-bridge.css', 'astra-training.css', 'practice.css']
    .map((f) => readText(`src/ui/refonte/${f}`)).join('\n');
  check(refonteCss.includes('.practice-subnav'), 'CSS — sous-navigation Entraînement stylée');
}

// ── Contrat de branchement dans main.js ──
function testMainWiring() {
  const main = readText('src/main.js');

  // Fonctionnalités jamais branchées (voir testDomContract) : échec voulu.
  check(main.includes('createSuggestionsPanel'), 'main.js — createSuggestionsPanel importé/utilisé');
  check(main.includes('setRenderContainer'), 'main.js — historique rendu dans son container');
  check(main.includes('initRecordingTab'), 'main.js — initRecordingTab appelé');
  check(main.includes('initTabNavigation'), 'main.js — navigation par onglets appelée');
  // Ex-« machine d'états modes » (initTrainingModes, refonte révoquée) : la
  // sous-navigation Astra ouvre les vues via initPracticeSubnavViews et
  // l'évènement app-switch-training-view. Le branchement du rail et des tiroirs
  // (app-rail, drawer-*, data-drawer-close, training-back-btn,
  // practice-drawer-trigger) n'a plus d'objet.
  check(main.includes('initPracticeSubnavViews'), 'main.js — sous-navigation Entraînement branchée');
  check(main.includes('app-switch-training-view'), 'main.js — changement de vue Entraînement branché');
  check(main.includes('feedRecorderNoteOn'), 'main.js — notes MIDI alimentent le recorder');
  // La pédale n'est pas transmise au grouper par un horodatage « sustainUp »
  // (version révoquée) : une note relâchée pédale enfoncée reste ouverte
  // (noteOff « sustained », depuis fa24776) et le grouper écarte les gammes
  // jouées sous pédale (40aebce). Comportement vérifié dans testNoteGrouper.
  check(main.includes('sustained: true'), 'main.js — note relâchée pédale enfoncée transmise au grouper');
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

  // Pédale tenue : les notes relâchées restent ouvertes (noteOff « sustained »).
  // Une gamme jouée sous pédale ne doit pas devenir un accord ; un accord, si.
  const pedalScaleGroups = [];
  const pedalScale = createNoteGrouper({
    toleranceMs: 200,
    onGroupReady: (g) => pedalScaleGroups.push(g.map((n) => n.note)),
  });
  virtualNow = 20000;
  [60, 62, 64, 65, 67, 69, 71, 72].forEach((n) => {
    pedalScale.noteOn(n, 0.8);
    virtualNow += 60;
    pedalScale.noteOff(n, { sustained: true });
    virtualNow += 60;
  });
  virtualNow += 300;
  pedalScale.flush();
  check(pedalScaleGroups.length === 0, 'Grouper — gamme sous pédale : pas de faux accord');

  const pedalChordGroups = [];
  const pedalChord = createNoteGrouper({
    toleranceMs: 200,
    onGroupReady: (g) => pedalChordGroups.push(g.map((n) => n.note)),
  });
  virtualNow = 30000;
  [60, 64, 67].forEach((n) => pedalChord.noteOn(n, 0.8));
  virtualNow += 80;
  [60, 64, 67].forEach((n) => pedalChord.noteOff(n, { sustained: true }));
  virtualNow += 300;
  pedalChord.flush();
  check(pedalChordGroups.length === 1 && pedalChordGroups[0].length === 3, 'Grouper — accord relâché sous pédale : groupe de 3 notes émis');

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