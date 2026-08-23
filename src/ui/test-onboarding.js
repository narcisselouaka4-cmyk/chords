/**
 * Tests de non-régression — Tutoriel / onboarding.
 *
 * L'enjeu principal n'est pas le moteur de visite, c'est la **cohérence avec
 * l'interface** : un tutoriel qui désigne des boutons disparus est pire que pas
 * de tutoriel. Chaque étape est donc confrontée à `src/index.html`.
 *
 * Usage : node src/ui/test-onboarding.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CHAPTERS,
  VALID_TABS,
  allSteps,
  defaultProgress,
  getChapter,
  parseProgress,
  shouldAutoStart,
} from './onboarding-content.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(projectRoot, rel), 'utf-8');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    failures++;
  } else {
    console.log(`  ✅ ${message}`);
  }
}

function runTest(name, fn) {
  console.log(`\n📋 ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Exception: ${err.message}`);
    failures++;
  }
}

// ── A. Le tutoriel désigne des éléments qui existent ──

runTest("A. Ancrage — chaque étape vise un élément réel de l'interface", () => {
  const html = read('src/index.html');
  const steps = allSteps().filter((step) => step.target);
  assert(steps.length >= 10, `au moins dix étapes sont ancrées (${steps.length})`);

  for (const step of steps) {
    assert(
      /^#[A-Za-z][\w-]*$/.test(step.target),
      `${step.id} : la cible « ${step.target} » est un identifiant simple`,
    );
    const id = step.target.slice(1);
    assert(
      html.includes(`id="${id}"`),
      `${step.id} : #${id} existe dans index.html`,
    );
  }
});

runTest("A. Ancrage — les onglets visés existent", () => {
  const html = read('src/index.html');
  for (const chapter of CHAPTERS) {
    if (!chapter.tab) continue;
    assert(
      VALID_TABS.includes(chapter.tab),
      `${chapter.id} : l'onglet « ${chapter.tab} » est connu`,
    );
    assert(
      html.includes(`data-tab="${chapter.tab}"`),
      `${chapter.id} : l'onglet « ${chapter.tab} » existe dans la navigation`,
    );
  }
});

// ── B. Structure du contenu ──

runTest('B. Structure — chapitres et étapes bien formés', () => {
  const chapterIds = new Set();
  const stepIds = new Set();
  for (const chapter of CHAPTERS) {
    assert(!chapterIds.has(chapter.id), `identifiant de chapitre unique : ${chapter.id}`);
    chapterIds.add(chapter.id);
    assert(typeof chapter.title === 'string' && chapter.title.length > 3,
           `${chapter.id} : titre lisible`);
    assert(typeof chapter.summary === 'string' && chapter.summary.length > 10,
           `${chapter.id} : résumé exploitable dans le menu`);
    assert(Array.isArray(chapter.steps) && chapter.steps.length >= 3,
           `${chapter.id} : au moins trois étapes (${chapter.steps.length})`);
    for (const step of chapter.steps) {
      assert(!stepIds.has(step.id), `identifiant d'étape unique : ${step.id}`);
      stepIds.add(step.id);
      assert(typeof step.title === 'string' && step.title.length > 3,
             `${step.id} : titre lisible`);
      assert(typeof step.body === 'string' && step.body.length > 60,
             `${step.id} : le texte explique vraiment (${step.body.length} car.)`);
    }
  }
});

runTest('B. Structure — les sujets exigés par la mission sont couverts', () => {
  const texte = CHAPTERS
    .flatMap((c) => [c.title, c.summary, ...c.steps.map((s) => `${s.title} ${s.body}`)])
    .join(' ')
    .toLowerCase();
  const sujets = {
    "ce qu'est l'application": /piano jazz chords/,
    'importer un morceau': /import/,
    'le Studio': /studio/,
    "l'Analyse": /analyse/,
    'lire Chordify': /timeline/,
    'sélectionner un accord': /sélection|cliquez sur un bloc/,
    'modifier un accord': /corrig|modifier/,
    'la séparation des pistes': /pistes|stems|séparé/,
    'la transposition': /transpos/,
  };
  for (const [sujet, motif] of Object.entries(sujets)) {
    assert(motif.test(texte), `le tutoriel traite : ${sujet}`);
  }
});

runTest('B. Structure — chaque chapitre est atteignable', () => {
  for (const chapter of CHAPTERS) {
    assert(getChapter(chapter.id) === chapter, `${chapter.id} est retrouvable par son id`);
  }
  const withTrigger = CHAPTERS.filter((c) => c.autoStart);
  assert(
    withTrigger.length === CHAPTERS.length,
    'tous les chapitres ont un moment de proposition défini',
  );
});

// ── C. Une proposition automatique reste discrète ──

runTest('C. Proposition — jamais deux fois le même chapitre', () => {
  const vierge = defaultProgress();
  assert(shouldAutoStart('welcome', 'first-run', vierge) === true,
         'le chapitre de découverte est proposé au premier lancement');
  const vu = { ...vierge, seen: ['welcome'] };
  assert(shouldAutoStart('welcome', 'first-run', vu) === false,
         'il ne revient pas une fois parcouru');
});

runTest('C. Proposition — « ne plus proposer » est respecté', () => {
  const refus = { ...defaultProgress(), dismissed: true };
  for (const chapter of CHAPTERS) {
    assert(shouldAutoStart(chapter.id, chapter.autoStart, refus) === false,
           `${chapter.id} n'est plus proposé automatiquement`);
  }
});

runTest('C. Proposition — le bon moment, et lui seul', () => {
  const vierge = defaultProgress();
  assert(shouldAutoStart('chordify', 'first-run', vierge) === false,
         "Chordify n'est pas expliqué avant qu'une analyse existe");
  assert(shouldAutoStart('chordify', 'first-results', vierge) === true,
         "Chordify est proposé à la première grille affichée");
  assert(shouldAutoStart('studio', 'first-studio', vierge) === true,
         'le Studio est proposé à sa première ouverture');
});

runTest("C. Proposition — l'enchaînement du premier lancement attend son tour", () => {
  const vierge = defaultProgress();
  assert(shouldAutoStart('import', 'after:welcome', vierge) === false,
         "l'import n'enchaîne pas si la découverte n'a pas été faite");
  const apres = { ...vierge, seen: ['welcome'] };
  assert(shouldAutoStart('import', 'after:welcome', apres) === true,
         "l'import enchaîne une fois la découverte terminée");
});

// ── D. Un état corrompu ne casse pas le démarrage ──

runTest('D. Robustesse — la progression se relit défensivement', () => {
  assert(parseProgress(null).seen.length === 0, 'absence de données');
  assert(parseProgress('pas du json').seen.length === 0, 'JSON invalide');
  assert(parseProgress('{"version":999,"seen":["welcome"]}').seen.length === 0,
         'version inconnue : on repart d’un état propre');
  assert(parseProgress('{"version":1,"seen":"welcome"}').seen.length === 0,
         'champ seen mal typé');
  assert(parseProgress('{"version":1,"seen":["welcome",42]}').seen.length === 1,
         'entrées non conformes filtrées');
  assert(parseProgress('{"version":1,"dismissed":"oui"}').dismissed === false,
         'dismissed n’est vrai que s’il vaut exactement true');
});

// ── E. Le moteur ne bloque jamais l'application ──

runTest("E. Moteur — une cible absente n'interrompt pas la visite", () => {
  const js = read('src/ui/onboarding.js');
  assert(js.includes('function resolveTarget('), 'la résolution de cible est isolée');
  assert(js.includes('isVisible(el) ? el : null'),
         'un élément masqué est traité comme absent');
  assert(js.includes("centerCard(tour.card)"),
         'sans cible, la carte se recentre au lieu de pointer dans le vide');
  assert(js.includes("tour.spotlight.style.display = 'none'"),
         'le projecteur est masqué plutôt que placé au hasard');
});

runTest('E. Moteur — sortie possible par tous les chemins', () => {
  const js = read('src/ui/onboarding.js');
  assert(js.includes("e.key === 'Escape'"), 'Échap ferme la visite');
  assert(js.includes('onboarding-skip'), 'un bouton « Passer » existe');
  assert(js.includes("root.querySelector('.onboarding-veil').addEventListener"),
         'cliquer hors de la carte ferme la visite');
});

runTest('E. Moteur — navigation clavier', () => {
  const js = read('src/ui/onboarding.js');
  assert(js.includes("e.key === 'ArrowRight'") && js.includes("e.key === 'ArrowLeft'"),
         'les flèches naviguent entre les étapes');
  assert(js.includes("role=\"dialog\"") && js.includes('aria-modal="true"'),
         'la carte est un dialogue accessible');
  assert(js.includes('restoreFocus'), 'le focus revient à son point de départ');
});

runTest("E. Moteur — le stockage indisponible n'est pas une erreur", () => {
  const js = read('src/ui/onboarding.js');
  const start = js.indexOf('function saveProgress()');
  const body = js.slice(start, js.indexOf('\n}', start));
  assert(body.includes('try') && body.includes('catch'),
         'l’écriture de la progression est protégée');
});

// ── F. Câblage dans l'application ──

runTest("F. Câblage — point d'entrée permanent dans l'en-tête", () => {
  const html = read('src/index.html');
  assert(html.includes('id="onboarding-help-btn"'), 'le bouton « ? » existe');
  assert(html.includes('aria-label="Ouvrir le tutoriel"'), 'il est correctement étiqueté');

  const main = read('src/main.js');
  assert(main.includes('initOnboarding()'), 'le tutoriel est initialisé au démarrage');
});

runTest('F. Câblage — les déclencheurs contextuels sont posés', () => {
  const main = read('src/main.js');
  assert(
    main.includes("notifyOnboarding('studio', 'first-studio')"),
    'ouvrir le Studio propose son chapitre',
  );
  const analyzer = read('src/ui/analyzer-tab.js');
  assert(
    analyzer.includes("notifyOnboarding('chordify', 'first-results')"),
    'afficher une première grille propose le chapitre Chordify',
  );
});

runTest('F. Câblage — le tutoriel pilote les onglets sans les connaître', () => {
  const js = read('src/ui/onboarding.js');
  assert(
    js.includes("new CustomEvent('app-switch-tab'"),
    "le changement d'onglet passe par l'évènement existant de l'application",
  );
});

// ── G. Styles ──

runTest('G. Styles — les classes du tutoriel sont définies', () => {
  const css = read('src/ui/components/onboarding.css');
  for (const cls of ['.onboarding-root', '.onboarding-veil', '.onboarding-spotlight',
                     '.onboarding-card', '.onboarding-card.centered', '.onboarding-picker',
                     '.onboarding-help-toggle']) {
    assert(css.includes(cls), `${cls} est défini`);
  }
  assert(
    css.includes('prefers-reduced-motion'),
    'les animations respectent la préférence système de mouvement réduit',
  );
  assert(
    !/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b(?![^{]*--)/i.test(
      css.replace(/rgba?\([^)]*\)/g, ''),
    ) || css.includes('var(--'),
    'le tutoriel s’appuie sur les variables de thème',
  );
});

// ── Bilan ──

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('✅ Tous les tests du tutoriel sont passés.');
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exit(1);
}
