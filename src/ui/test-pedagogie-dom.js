// [Claude] — 2026-09-05 — Test de contrat DOM pour Pédagogie IA.
// Exécutable avec : node src/ui/test-pedagogie-dom.js
//
// Même rôle que test-coach-dom.js : vérifier que le contrat entre index.html,
// main.js, pedagogie-tab.js, preload.cjs, electron/main.js et practice.css
// tient. C'est la classe de panne déjà vécue sur ce projet — un identifiant ou
// un import qui dérive d'un fichier à l'autre et éteint une partie de
// l'interface sans le dire.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..');
const readText = (p) => readFileSync(resolve(projectRoot, p), 'utf-8');

const html = readText('src/index.html');
const mainJs = readText('src/main.js');
const tabJs = readText('src/ui/pedagogie-tab.js');
const practiceCss = readText('src/ui/refonte/practice.css');
const preload = readText('electron/preload.cjs');
const electronMain = readText('electron/main.js');

/** Retire les commentaires : un invariant porte sur le code, pas sur sa doc. */
function stripComments(source) {
  // Les commentaires de LIGNE sont retirés d'abord, et les blocs ensuite.
  // L'ordre inverse est un piège réel, rencontré ici : un commentaire de ligne
  // qui cite un chemin comme « src/pedagogie/* » contient la séquence
  // d'ouverture d'un bloc, et le motif de bloc avalait alors tout le fichier
  // jusqu'au prochain « */ » — faisant échouer des contrôles portant sur du
  // code parfaitement présent.
  return source
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
const tabCode = stripComments(tabJs);

let total = 0;
let passed = 0;
function check(name, condition, detail = '') {
  total++;
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// 1. La pilule est réelle
// ---------------------------------------------------------------------------

const pill = html.match(/<button[^>]*>Pédagogie IA<\/button>/)?.[0];
check('La pilule « Pédagogie IA » existe', !!pill);
if (pill) {
  check('La pilule porte data-view="pedagogie"', pill.includes('data-view="pedagogie"'), pill);
  check('La pilule n\'est plus désactivée', !pill.includes('disabled'), pill);
  check('La pilule n\'est plus un placeholder', !pill.includes('is-placeholder'), pill);
}
check('Plus aucune pilule d\'Entraînement n\'est un placeholder',
  !/practice-mode-btn is-placeholder/.test(html));

// ---------------------------------------------------------------------------
// 2. La vue sœur existe
// ---------------------------------------------------------------------------

check('La vue #practice-view-pedagogie existe', html.includes('id="practice-view-pedagogie"'));
check('La vue est cachée par défaut',
  /id="practice-view-pedagogie"[^>]*style="display: none;"/.test(html));

// ---------------------------------------------------------------------------
// 3. Contrat d'identifiants entre le JS et le HTML
// ---------------------------------------------------------------------------

const ids = [...tabJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
check('pedagogie-tab.js référence des identifiants', ids.length > 0);
const missing = ids.filter((id) => !html.includes(`id="${id}"`));
check('Tous les identifiants lus par pedagogie-tab.js existent dans index.html',
  missing.length === 0, missing.join(', '));

// ---------------------------------------------------------------------------
// 4. Bascule de vue et initialisation
// ---------------------------------------------------------------------------

check('main.js expose la vue dans ses références DOM',
  mainJs.includes("practiceViewPedagogie: document.getElementById('practice-view-pedagogie')"));
check('La table de vues contient pedagogie', /dedicatedViews\s*=\s*\{[^}]*pedagogie:/s.test(mainJs));
check('La table de vues contient toujours coach', /dedicatedViews\s*=\s*\{[^}]*coach:/s.test(mainJs));
check('La table de vues contient toujours Sessions MIDI',
  /dedicatedViews\s*=\s*\{[^}]*'midi-sessions':/s.test(mainJs));
check('main.js importe initPedagogieTab', mainJs.includes("from './ui/pedagogie-tab.js'"));
check('main.js appelle initPedagogieTab()', mainJs.includes('initPedagogieTab();'));

// ---------------------------------------------------------------------------
// 5. Chaîne IPC complète
// ---------------------------------------------------------------------------

check('Le handler IPC pedagogie:analyze-video existe',
  electronMain.includes("ipcMain.handle('pedagogie:analyze-video'"));
check('Le preload actif expose analyzeVideo',
  preload.includes("ipcRenderer.invoke('pedagogie:analyze-video'"));
check('Le contrôleur appelle bien cet IPC', tabCode.includes('pedagogie.analyzeVideo'));
check('L\'extraction d\'images réutilise ffmpeg, comme le remux Studio',
  /spawn\('ffmpeg'/.test(electronMain));
check('Les images sont lues en flux, jamais toutes gardées en mémoire',
  electronMain.includes('streamFrames'));

// ---------------------------------------------------------------------------
// 6. Le repli audio réutilise le pipeline existant
// ---------------------------------------------------------------------------

check('Le repli audio passe par analyzer.processFile, pas par un second moteur',
  tabCode.includes('analyzer.processFile'));
check('Le repli audio demande le mode posthoc_discriminator',
  tabCode.includes('posthoc_discriminator'));
check('Le repli audio traduit les bornes par le module pur, pas à la main',
  tabCode.includes('normalizeAnalyzerChords'));
check('La traduction lit bien startTime/endTime, les noms du moteur',
  readText('src/pedagogie/audio-fallback.js').includes('c?.startTime')
  && readText('src/pedagogie/audio-fallback.js').includes('c?.endTime'));

// ---------------------------------------------------------------------------
// 6 bis. Ce que DIT le professeur : transcription locale de la bande son
// ---------------------------------------------------------------------------

const transcriber = readText('electron/transcriber.py');

check('La carte « Ce que dit le professeur » existe',
  html.includes('id="pedagogie-narration-card"'));
check('Le texte transcrit a sa zone dédiée', html.includes('id="pedagogie-transcript"'));
check('L\'état d\'indisponibilité a sa propre place, distincte du texte',
  html.includes('id="pedagogie-narration-state"'));

check('Le handler IPC pedagogie:transcribe-video existe',
  electronMain.includes("ipcMain.handle('pedagogie:transcribe-video'"));
check('Le preload actif expose transcribeVideo',
  preload.includes("ipcRenderer.invoke('pedagogie:transcribe-video'"));
check('Le contrôleur appelle bien cet IPC', tabCode.includes('pedagogie.transcribeVideo'));

check('La transcription réutilise l\'extraction audio existante, pas une seconde',
  /extractTrackAudio\([^)]*wavPath/.test(electronMain));
check('La disponibilité de faster-whisper est vérifiée avant de lancer quoi que ce soit',
  electronMain.includes("'import faster_whisper'"));
check('Les trois indisponibilités sont distinguées par l\'IPC',
  electronMain.includes("'dependency-missing'")
  && electronMain.includes("'no-speech'")
  && electronMain.includes("reason: 'failed'"));
check('Le contrôleur traduit le retour par le module pur',
  tabCode.includes('normalizeTranscription') && tabCode.includes('alignNarration'));

check('Le script Python suit le contrat du dépôt : JSON sur stdout, journaux sur stderr',
  transcriber.includes('print(json.dumps(') && transcriber.includes('file=sys.stderr'));
check('La taille de modèle est une constante nommée, pas une valeur enfouie',
  /DEFAULT_MODEL\s*=\s*"/.test(transcriber));
check('Le garde-fou anti-hallucination est en place (VAD + seuil de silence)',
  transcriber.includes('vad_filter=True') && transcriber.includes('no_speech_prob'));
check('Aucun texte n\'est simulé quand la dépendance manque (contrairement aux stems Demucs)',
  !/simulated.*transcri|fake.*transcript/i.test(electronMain));

check('La transcription a son propre dossier de travail, pour ne pas purger celui de l\'analyse',
  electronMain.includes('createTranscribeDir'));

// La couche IA reste facultative : le texte brut s'affiche sans clé.
check('Le bouton IA n\'apparaît que si une clé est réellement configurée',
  tabCode.includes('hasAIKey()') && tabCode.includes('getAIConfig'));
check('L\'affichage du texte transcrit ne dépend pas de la clé IA',
  /els\.transcript\.innerHTML\s*=\s*''/.test(tabCode));
check('L\'approfondissement passe par la fonction dédiée de la couche IA',
  tabCode.includes('explainNarration'));
check('explainNarration suit le patron des autres appels IA (401/403 et 429 nommés)',
  readText('src/ai/ai-client.js').includes('fetchNarrationExplanation'));
check('Masterclass et Réharmonisation ne sont pas touchées',
  readText('src/ai/ai-client.js').includes('export async function generateMasterclass')
  && readText('src/ai/ai-client.js').includes('export async function generateReharmonization'));

// ---------------------------------------------------------------------------
// 7. Garde-fous du projet
// ---------------------------------------------------------------------------

check('Le contrôleur ne redessine pas le clavier virtuel',
  !tabCode.includes('keyboard-svg') && !tabCode.includes('virtual-keyboard')
  && !tabCode.includes('hero-mini-kb'));
check('Le contrôleur ne touche pas au chantier Coach',
  !tabCode.includes('coach-tab.js') && !tabCode.includes('/coach/'));
check('Aucune décision musicale dans le contrôleur : pas d\'appel direct au moteur d\'accords',
  !tabCode.includes('detectChord'));
check('Le nommage passe par le moteur d\'accords existant, pas par un second',
  readText('src/pedagogie/chord-labeling.js').includes("from '../chord-engine/index.js'"));
check('Le faux ami chord-engine/pedagogy.js n\'est pas réutilisé par erreur',
  !tabCode.includes('chord-engine/pedagogy'));

// ---------------------------------------------------------------------------
// 8. Les deux skins
// ---------------------------------------------------------------------------

const g = (practiceCss.match(/:root\[data-skin='global'\] #practice-view-pedagogie/g) || []).length;
const v = (practiceCss.match(/:root\[data-skin='v2'\] #practice-view-pedagogie/g) || []).length;
check('practice.css habille la vue en skin Global', g > 20, `${g} règles`);
check('practice.css habille la vue en skin v2', v > 20, `${v} règles`);
for (const sel of ['.pedagogie-layout', '.pedagogie-card', '.pedagogie-chip', '.pedagogie-track-item',
  '.pedagogie-transcript', '.pedagogie-line', '.pedagogie-secondary-btn']) {
  check(`« ${sel} » est stylé dans les deux skins`,
    practiceCss.includes(`:root[data-skin='global'] #practice-view-pedagogie ${sel}`)
    && practiceCss.includes(`:root[data-skin='v2'] #practice-view-pedagogie ${sel}`));
}

// ---------------------------------------------------------------------------
// 9. Honnêteté de l'affichage
// ---------------------------------------------------------------------------

check('L\'écran affiche la provenance du relevé (image ou son)',
  html.includes('id="pedagogie-format"') && tabCode.includes('is-audio'));
check('L\'écran réserve une place à ce qui n\'est pas garanti',
  html.includes('id="pedagogie-notes"'));
check('Un accord non résolu est marqué, pas deviné',
  tabCode.includes('is-unresolved'));
check('Un accord sans tierce est distingué visuellement',
  tabCode.includes('is-partial')
  && practiceCss.includes('.pedagogie-chip.is-partial'));

console.log(`\n=== Résultat : ${passed}/${total} contrôles passés ===`);
if (passed < total) process.exitCode = 1;
