/**
 * Tests de non-régression — Hiérarchie harmonique de la timeline Chordify.
 *
 * Le moteur qualifie chaque segment d'un rôle (structural / passing /
 * uncertain / silence) ; la timeline doit le traduire en poids visuel.
 *
 * Lecture structurelle par défaut ; les autres rôles sont consultables et
 * corrigibles dans la vue détaillée, sans modifier le résultat enregistré.
 *
 * Usage : node src/ui/test-chord-roles.js
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const ROLES = ['structural', 'passing', 'uncertain', 'silence'];

// ── A. Le moteur produit bien les quatre rôles ──

runTest('A. Moteur — les quatre rôles sont produits et documentés', () => {
  const py = read('electron/audio-processor.py');
  assert(
    py.includes('def _classify_chord_roles('),
    '_classify_chord_roles existe dans le moteur',
  );
  for (const role of ROLES) {
    assert(
      new RegExp(`'${role}'`).test(py),
      `le moteur peut émettre le rôle « ${role} »`,
    );
  }
  assert(
    py.includes('ENABLE_CHORD_ROLE_CLASSIFICATION'),
    'la classification est derrière un flag désactivable',
  );
});

runTest("A. Moteur — _detect_structural_loop n'écrit plus le champ role", () => {
  const py = read('electron/audio-processor.py');
  const start = py.indexOf('def _detect_structural_loop(');
  assert(start > 0, '_detect_structural_loop existe toujours');
  const end = py.indexOf('\ndef ', start + 10);
  const body = py.slice(start, end > 0 ? end : undefined);
  assert(
    !/seg\['role'\]\s*=/.test(body),
    "_detect_structural_loop n'assigne plus seg['role'] (le champ appartient à _classify_chord_roles)",
  );
  assert(
    /seg\['inStructuralLoop'\]\s*=/.test(body),
    "_detect_structural_loop écrit désormais seg['inStructuralLoop']",
  );
});

// ── B. La timeline traduit le rôle en classe CSS ──

runTest('B. Timeline — chaque rôle devient une classe CSS sur le bloc', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(
    js.includes('block.classList.add(`role-${role}`)'),
    'renderTimeline applique une classe role-* au bloc',
  );
  assert(
    js.includes('block.dataset.harmonicRole'),
    'le rôle est aussi exposé en data-harmonic-role (inspectable, testable)',
  );
  assert(
    js.includes('function segmentRole('),
    'segmentRole() centralise la lecture du rôle',
  );
});

runTest('B. Timeline — compatibilité des anciens projets et corrections', () => {
  const body = read('src/analyzer/structural-progression.js');
  assert(
    body.includes("return 'structural'"),
    'une analyse sans champ role reste affichée (compatibilité MIDI et anciens projets)',
  );
  assert(
    body.includes('manualOverride'),
    "un accord corrigé à la main n'est jamais présenté comme incertain",
  );
});

// ── C. La vue détaillée garde les rôles lisibles et corrigibles ──

runTest('C. CSS — aucun rôle ne masque le bloc', () => {
  const css = read('src/ui/components/analyzer-workspace.css');
  for (const role of ROLES) {
    const re = new RegExp(`\\.analyzer-timeline-block\\.role-${role}\\s*\\{([^}]*)\\}`, 's');
    const match = css.match(re);
    assert(match !== null, `la règle .analyzer-timeline-block.role-${role} existe`);
    if (!match) continue;
    const block = match[1];
    assert(
      !/display\s*:\s*none/.test(block),
      `role-${role} ne contient pas display:none`,
    );
    assert(
      !/visibility\s*:\s*hidden/.test(block),
      `role-${role} ne contient pas visibility:hidden`,
    );
    const opacity = block.match(/opacity\s*:\s*([\d.]+)/);
    if (opacity) {
      assert(
        parseFloat(opacity[1]) >= 0.3,
        `role-${role} reste lisible (opacité ${opacity[1]} ≥ 0.3)`,
      );
    }
  }
});

runTest('C. CSS — structurel et passage sont distingués par plus que la couleur', () => {
  const css = read('src/ui/components/analyzer-workspace.css');
  const structural = css.match(/\.analyzer-timeline-block\.role-structural\s*\{([^}]*)\}/s);
  const passing = css.match(/\.analyzer-timeline-block\.role-passing\s*\{([^}]*)\}/s);
  assert(structural !== null && passing !== null, 'les deux règles existent');
  if (!structural || !passing) return;
  assert(
    /box-shadow|border-color/.test(structural[1]),
    'le structurel porte un cadre ou un liseré propre',
  );
  assert(
    /border-style\s*:\s*dashed/.test(passing[1]),
    'le passage se distingue par le style de bordure, pas seulement par la couleur',
  );
});

runTest('C. CSS — sélection et lecture priment sur la hiérarchie', () => {
  const css = read('src/ui/components/analyzer-workspace.css');
  assert(
    /role-uncertain\.current/.test(css) && /role-uncertain\.selected/.test(css),
    "un segment incertain sélectionné ou en cours de lecture redevient pleinement visible",
  );
});

// ── D. L'utilisateur peut comprendre et désactiver ──

// [Claude] — 2026-11-13 — Refonte d'Analyse des 27-28/10 (4787af7, 7a7eead ; coffre :
// features/analyse-ia/2026-10-27-vue-ensemble-accords-principaux) : lecture structurelle seule,
// sans bascule « Vue détaillée », sans légende passage / incertain, sans ligne « Rôle » dans
// l'inspecteur. Les rôles restent calculés (parties A à C) ; l'interface ne les affiche plus.
runTest('D. Interface — lecture structurelle seule, sans bascule ni légende de détail', () => {
  const html = read('src/index.html');
  assert(html.includes('analyzer-timeline-legend'), 'la légende existe dans le DOM');
  assert(html.includes('Accords structurels'), 'la légende nomme « Accords structurels »');
  assert(!html.includes('analyzer-hierarchy-toggle') && !html.includes('Vue détaillée'), 'plus de bascule « Vue détaillée »');
  for (const label of ['Accord de passage', 'Incertain']) {
    assert(!html.includes(`</i>${label}</span>`), `plus d’entrée « ${label} » dans la légende`);
  }
});

runTest('D. Interface — aucun reste de la bascule ni de la ligne « Rôle »', () => {
  const js = read('src/ui/analyzer-tab.js');
  assert(!js.includes('bindHierarchyToggle'), 'bindHierarchyToggle a disparu avec la bascule');
  assert(!/rows\.push\(\['Rôle'/.test(js), 'l’inspecteur n’a plus de ligne « Rôle »');
});

// ── E. Accessibilité ──

runTest('E. Accessibilité — le rôle figure dans le libellé lu à voix haute', () => {
  const js = read('src/ui/analyzer-tab.js');
  const start = js.indexOf("block.setAttribute(\n      'aria-label'");
  assert(start > 0, "l'aria-label du bloc est construit explicitement");
  const body = js.slice(start, start + 300);
  assert(
    body.includes('ROLE_LABELS[segmentRole(chord)]'),
    "l'aria-label nomme le rôle : la hiérarchie n'est pas seulement visuelle",
  );
});

// ── Bilan ──

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log('✅ Tous les tests de hiérarchie harmonique sont passés.');
  process.exit(0);
} else {
  console.error(`❌ ${failures} test(s) en échec.`);
  process.exit(1);
}
