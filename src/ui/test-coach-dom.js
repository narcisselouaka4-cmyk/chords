// [Claude] — 2026-09-05 — Test de contrat DOM pour le Coach d'accompagnement.
// Exécutable avec : node src/ui/test-coach-dom.js
//
// Ce test ne rend rien : il vérifie que le contrat entre index.html, main.js,
// coach-tab.js et practice.css tient. C'est exactement la classe de panne déjà
// vécue sur ce projet — un identifiant ou un import qui dérive d'un fichier à
// l'autre et éteint silencieusement une partie de l'interface (cf. l'import
// mort de recording-tab.js qui avait fait tomber main.js tout entier).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');

function readText(relPath) {
  return readFileSync(resolve(projectRoot, relPath), 'utf-8');
}

const html = readText('src/index.html');
const mainJs = readText('src/main.js');
const coachJs = readText('src/ui/coach-tab.js');
const practiceCss = readText('src/ui/refonte/practice.css');

/**
 * Retire commentaires de ligne et de bloc. Les contrôles d'invariants portent
 * sur le CODE : un commentaire qui cite une API interdite pour expliquer
 * pourquoi elle est interdite ne doit pas déclencher d'alerte.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const coachCode = stripComments(coachJs);

let total = 0;
let passed = 0;

function check(name, condition, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// 1. La pilule est réelle, plus un placeholder
// ---------------------------------------------------------------------------

const pillMatch = html.match(/<button[^>]*>Coach d'accompagnement<\/button>/);
check('La pilule « Coach d\'accompagnement » existe', !!pillMatch);
if (pillMatch) {
  const pill = pillMatch[0];
  check('La pilule porte data-view="coach"', pill.includes('data-view="coach"'), pill);
  check('La pilule n\'est plus désactivée', !pill.includes('disabled'), pill);
  check('La pilule n\'est plus un placeholder', !pill.includes('is-placeholder'), pill);
}

// ---------------------------------------------------------------------------
// 2. La vue sœur existe, sur le même patron que Sessions MIDI
// ---------------------------------------------------------------------------

check('La vue #practice-view-coach existe', html.includes('id="practice-view-coach"'));
check('La vue est cachée par défaut',
  /id="practice-view-coach"[^>]*style="display: none;"/.test(html));

// ---------------------------------------------------------------------------
// 3. Tout identifiant lu par coach-tab.js existe dans index.html
//    (le contrôle le plus utile : il attrape la dérive d'identifiants)
// ---------------------------------------------------------------------------

const referencedIds = [...coachJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
check('coach-tab.js référence bien des identifiants', referencedIds.length > 0);
const missing = referencedIds.filter((id) => !html.includes(`id="${id}"`));
check('Tous les identifiants lus par coach-tab.js existent dans index.html',
  missing.length === 0, missing.join(', '));

// ---------------------------------------------------------------------------
// 4. La bascule de vue est généralisée, pas codée en dur sur Sessions MIDI
// ---------------------------------------------------------------------------

check('main.js expose la vue Coach dans ses références DOM',
  mainJs.includes("practiceViewCoach: document.getElementById('practice-view-coach')"));
check('applyView utilise une table de vues plutôt qu\'une vue codée en dur',
  mainJs.includes('dedicatedViews'));
check('La table de vues contient Coach',
  /dedicatedViews\s*=\s*\{[^}]*coach:/s.test(mainJs));
check('La table de vues contient toujours Sessions MIDI',
  /dedicatedViews\s*=\s*\{[^}]*'midi-sessions':/s.test(mainJs));
check('main.js importe initCoachTab', mainJs.includes("from './ui/coach-tab.js'"));
check('main.js appelle initCoachTab()', mainJs.includes('initCoachTab();'));

// ---------------------------------------------------------------------------
// 5. Les deux skins sont couverts — règle du projet depuis le 02/09
// ---------------------------------------------------------------------------

const globalRules = (practiceCss.match(/:root\[data-skin='global'\] #practice-view-coach/g) || []).length;
const v2Rules = (practiceCss.match(/:root\[data-skin='v2'\] #practice-view-coach/g) || []).length;
check('practice.css habille la vue Coach en skin Global', globalRules > 20, `${globalRules} règles`);
check('practice.css habille la vue Coach en skin v2', v2Rules > 20, `${v2Rules} règles`);

for (const selector of ['.coach-layout', '.coach-card', '.segmented', '.coach-countdown', '.coach-track-item']) {
  const inGlobal = practiceCss.includes(`:root[data-skin='global'] #practice-view-coach ${selector}`);
  const inV2 = practiceCss.includes(`:root[data-skin='v2'] #practice-view-coach ${selector}`);
  check(`« ${selector} » est stylé dans les deux skins`, inGlobal && inV2,
    `global=${inGlobal} v2=${inV2}`);
}

// ---------------------------------------------------------------------------
// 6. Invariants audio du projet
// ---------------------------------------------------------------------------

check('Le Coach n\'appelle jamais fetch() — la CSP bloque fetch(blob:)',
  !/\bfetch\s*\(/.test(coachCode));
check('Le Coach lit ses fichiers par l\'IPC files.readBinary',
  coachCode.includes('files.readBinary'));
check('Le Coach décode en AudioBuffer avant de jouer',
  coachCode.includes('decodeAudioData'));
check('Le Coach ne crée aucun MediaElementSource',
  !coachCode.includes('createMediaElementSource'));
check('Le Coach ne joue aucun son par un élément <audio> ou <video>',
  !/createElement\(\s*'(audio|video)'\s*\)/.test(coachCode));
check('Le Coach s\'enregistre auprès du gestionnaire de focus audio',
  coachCode.includes('globalAudioFocusManager.register'));

// ---------------------------------------------------------------------------
// 7. Frontière avec Sessions MIDI — décision du 03/09, non rouverte
// ---------------------------------------------------------------------------

check('Le Coach n\'importe rien de recording-tab.js (flux séparés, sans pont)',
  !coachCode.includes('recording-tab.js'));
check('Le bouton « Analyser cette session » de Sessions MIDI est intact',
  html.includes('id="midi-session-analyze-btn"'));

// ---------------------------------------------------------------------------
// 8. Le clavier virtuel existant n'a pas été redessiné
// ---------------------------------------------------------------------------

check('Le Coach ne touche pas au clavier virtuel MIDI',
  !coachCode.includes('keyboard-svg') && !coachCode.includes('hero-mini-kb'));

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
