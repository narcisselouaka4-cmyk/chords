// [Claude] — 2026-11-11 — Parcours de bout en bout, dans Electron : continuité des conversations.
//
// Critères 1 et 2 de la mission « Copilot fiable » : ancienne conversation rouverte, passage par
// Pédagogie IA, Exercices et Sessions MIDI, retour ; réponse lente pendant qu'on ouvre un autre
// échange ; changement de réglages ; fermeture et réouverture ; fichier illisible.
//
// Tout se passe dans un dossier isolé (voir isolated-electron.mjs) avec un faux fournisseur local :
// aucune vraie clé, aucune donnée réelle, aucune fenêtre sur le bureau, aucun son.
//   npm run build && node scripts/copilot-e2e/continuity.e2e.mjs [dossier pjc-e2e-…]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { startMockProvider } from './mock-provider.mjs';
import { launchIsolatedApp, configureMockProvider } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || os.tmpdir(), `pjc-e2e-continuite-${Date.now()}`));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

// ── Témoin : les vraies données ne doivent pas bouger à cause de l'essai ─────
const REAL_DIR = path.join(os.userInfo().homedir, 'PianoJazzChords', 'PedagogieCopilot');
function realSnapshot() {
  if (!fs.existsSync(REAL_DIR)) return {};
  const out = {};
  for (const name of fs.readdirSync(REAL_DIR)) {
    const stat = fs.statSync(path.join(REAL_DIR, name));
    out[name] = `${stat.size}:${stat.mtimeMs}`;
  }
  return out;
}
const realBefore = realSnapshot();

// ── Données d'essai, synthétiques ───────────────────────────────────────────
const home = path.join(root, 'home');
const copilotDir = path.join(home, 'PianoJazzChords', 'PedagogieCopilot');
fs.mkdirSync(copilotDir, { recursive: true });
const TUTO = path.join(home, 'PianoJazzChords', 'Pedagogie', 'bibliotheque', 'grace-essai.mp4');
const notes = (list) => list.flatMap((note, i) => [
  { type: 'note_on', note, velocity: 80, time: i * 0.5 },
  { type: 'note_off', note, velocity: 0, time: i * 0.5 + 0.4 },
]);
const seed = (id, key, messages, updatedAt) => fs.writeFileSync(path.join(copilotDir, `${id}.json`), JSON.stringify({ version: 2, tutorialPath: key, updatedAt, messages }));
const OLD = 'conv_1000_ancienne';
const FREE = 'conv_3000_libre';
if (!fs.existsSync(path.join(copilotDir, `${OLD}.json`))) {
  seed(OLD, 'Session_010', [
    { role: 'user', content: 'Que penses-tu de ma session d\'essai ?', take: { id: 'take-essai', events: notes([60, 64, 67, 72]), duration: 2 }, timestamp: '2026-11-01T10:00:00Z' },
    { role: 'assistant', content: 'Ta ligne monte bien vers le Do aigu.', timestamp: '2026-11-01T10:00:05Z' },
  ], '2026-11-01T10:00:05Z');
  seed('conv_2000_tuto', TUTO, [
    { role: 'user', content: 'Que joue-t-il au début du tutoriel ?', timestamp: '2026-11-03T10:00:00Z' },
    { role: 'assistant', content: 'Il pose un accord de Do.', timestamp: '2026-11-03T10:00:05Z' },
  ], '2026-11-03T10:00:05Z');
  seed(FREE, '__copilot_autonomous__', [
    { role: 'user', content: 'Par où commencer au piano ?', timestamp: '2026-11-05T10:00:00Z' },
    { role: 'assistant', content: 'Commence par repérer le Do du milieu.', timestamp: '2026-11-05T10:00:05Z' },
  ], '2026-11-05T10:00:05Z');
  fs.writeFileSync(path.join(copilotDir, 'conv_4000_abimee.json'), '{"version":2,"tutorialPath":"__copilot_autonomous__","messages":[{"role":"user","content":"un échange coup');
}
const BROKEN_RAW = fs.readFileSync(path.join(copilotDir, 'conv_4000_abimee.json'), 'utf8');
const convFiles = () => fs.readdirSync(copilotDir).filter((name) => /^conv_.*\.json$/.test(name)).sort();
const readConv = (id) => JSON.parse(fs.readFileSync(path.join(copilotDir, `${id}.json`), 'utf8'));
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const mock = await startMockProvider();
let app = await launchIsolatedApp({ root });
const shot = async (name) => { try { await app.page.screenshot({ path: path.join(root, `${name}.png`) }); } catch (_) { /* capture facultative */ } };

/** Ce que montre le Copilote, lu dans la page. */
async function view() {
  return app.page.evaluate(() => {
    const visible = (node) => Boolean(node && node.getClientRects().length);
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('pjc.copilot.conversations') || '{}'); } catch (_) { stored = {}; }
    const rows = [...document.querySelectorAll('#copilot-messages .tr-chat-message')];
    return {
      lastId: stored.lastId || null,
      drafts: stored.drafts || {},
      texts: rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90)),
      typing: Boolean(document.querySelector('#copilot-messages .copilot-typing, #copilot-messages .is-typing, #copilot-messages .tr-typing')),
      input: document.getElementById('copilot-input')?.value || '',
      header: document.getElementById('copilot-selected-name')?.textContent || '',
      offer: document.querySelector('.copilot-context-offer')?.textContent || '',
      chatVisible: visible(document.getElementById('copilot-chat-area')),
      docked: Boolean(document.getElementById('copilot-chat-area')?.closest('#pedagogie-copilot-panel')),
      notifications: [...document.querySelectorAll('.app-notify')].map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()),
      history: [...document.querySelectorAll('#copilot-history-list .copilot-history-card')].map((card) => ({ title: card.querySelector('.copilot-history-title')?.textContent || '', current: card.classList.contains('is-current'), chip: card.querySelector('.copilot-history-count-chip')?.textContent || '' })),
    };
  });
}
const nav = async (name) => { await app.page.click(`button[data-view="${name}"]`); await sleep(350); };
async function openFromHistory(titleStart) {
  await app.page.click('[data-astra-open="copilot-history-drawer"]');
  await sleep(400);
  const clicked = await app.page.evaluate((start) => {
    const card = [...document.querySelectorAll('#copilot-history-list .copilot-history-card')].find((c) => (c.querySelector('.copilot-history-title')?.textContent || '').startsWith(start));
    card?.querySelector('.copilot-history-open')?.click();
    return Boolean(card);
  }, titleStart);
  await sleep(700);
  return clicked;
}
const typeDraft = async (text) => { await app.page.click('#copilot-input'); await app.page.keyboard.type(text, { delay: 5 }); };
const clearInput = async () => {
  await app.page.click('#copilot-input');
  await app.page.keyboard.down('Control');
  await app.page.keyboard.press('KeyA');
  await app.page.keyboard.up('Control');
  await app.page.keyboard.press('Backspace');
};
const announceTutorial = () => app.page.evaluate((p) => document.dispatchEvent(new CustomEvent('copilot-open-tutorial', { detail: { path: p } })), TUTO);

let failure = null;
try {
  await configureMockProvider(app, { baseUrl: mock.url });
  await nav('copilot');
  let v = await view();
  check('Le Copilote s\'affiche avec le faux fournisseur local', v.chatVisible);
  const filesAtStart = convFiles();
  check('Au premier lancement, aucune conversation n\'est créée sur le disque', filesAtStart.length === 4, filesAtStart.join(','));

  // ── Critère 1 : ancienne conversation → Pédagogie → Exercices → Sessions → retour ──
  check('L\'ancienne conversation est dans l\'historique', await openFromHistory('Que penses-tu de ma session'));
  v = await view();
  check('Elle s\'ouvre : identifiant et deux messages', v.lastId === OLD && v.texts.length === 2, JSON.stringify({ id: v.lastId, n: v.texts.length }));
  check('Sa source (une session) est gardée à l\'ouverture', /Session/.test(v.header), v.header);
  await typeDraft('Et si je gardais le début ?');
  await shot('1-ancienne-conversation-avec-brouillon');

  await nav('pedagogie');
  await announceTutorial(); // ce que Pédagogie IA émet à chaque affichage d'un tutoriel analysé
  await sleep(500);
  v = await view();
  check('Pédagogie IA annonce un tutoriel : la conversation n\'est pas remplacée', v.lastId === OLD, v.lastId);
  await nav('exercise');
  await nav('midi-sessions');
  await nav('pedagogie');
  await announceTutorial();
  await sleep(500);
  await nav('copilot');
  v = await view();
  check('Retour au Copilote : même identifiant', v.lastId === OLD, v.lastId);
  check('… mêmes messages', v.texts.length === 2 && v.texts[1].includes('Do aigu'), JSON.stringify(v.texts));
  check('… même brouillon dans la case', v.input === 'Et si je gardais le début ?', v.input);
  check('… même source', /Session/.test(v.header), v.header);
  check('Le tutoriel est proposé, pas imposé (« Parler de ce tutoriel »)', /Parler de ce tutoriel/.test(v.offer), v.offer);
  check('Aucune conversation créée par la navigation', convFiles().length === 4, convFiles().join(','));
  check('Le fichier de l\'ancienne conversation n\'a pas été réécrit', readConv(OLD).messages.length === 2 && readConv(OLD).updatedAt === '2026-11-01T10:00:05Z');
  await shot('2-retour-meme-conversation');

  // ── Critère 2 : réponse lente, on ouvre un autre échange pendant l'attente ──
  await clearInput();
  mock.enqueue({ text: 'Oui : garde les quatre premières notes, on ne change que la fin.', delayMs: 3500 });
  await typeDraft('Garde le début, change la fin.');
  await app.page.keyboard.press('Enter');
  await sleep(900);
  check('La question est écrite sur le disque dès l\'envoi', readConv(OLD).messages.length === 3 && readConv(OLD).messages[2].content === 'Garde le début, change la fin.', JSON.stringify(readConv(OLD).messages[2]?.content));
  check('Une fois envoyé, ce n\'est plus un brouillon', (await view()).input === '' && !(await view()).drafts[OLD], JSON.stringify((await view()).drafts));
  check('Enregistrée sous sa source (session), pas en conversation libre', readConv(OLD).tutorialPath === 'Session_010' && readConv(OLD).source?.kind === 'session', JSON.stringify(readConv(OLD).source));
  check('Pendant l\'attente, une autre conversation s\'ouvre', await openFromHistory('Par où commencer'));
  v = await view();
  check('… et c\'est bien elle qui est affichée', v.lastId === FREE && v.texts.length === 2, JSON.stringify({ id: v.lastId, n: v.texts.length }));
  await sleep(4200);
  v = await view();
  check('La réponse tardive n\'atterrit pas dans la conversation ouverte entre-temps', v.lastId === FREE && v.texts.length === 2 && readConv(FREE).messages.length === 2, JSON.stringify(v.texts));
  check('Elle rejoint son échange d\'origine (question + réponse enregistrées)', readConv(OLD).messages.length === 4 && readConv(OLD).messages[3].content.includes('quatre premières notes'), String(readConv(OLD).messages.length));
  check('Le pianiste est prévenu qu\'une réponse est arrivée', v.notifications.some((n) => /réponse est arrivée/i.test(n)), JSON.stringify(v.notifications));
  check('Une seule requête est partie au fournisseur', mock.requests.length === 1, String(mock.requests.length));
  await shot('3-reponse-tardive-autre-conversation');
  const opened = await app.page.evaluate(() => { const btn = document.querySelector('.app-notify .app-notify-action'); btn?.click(); return Boolean(btn); });
  await sleep(900);
  v = await view();
  check('« Ouvrir » ramène à l\'échange d\'origine, avec la réponse', opened && v.lastId === OLD && v.texts.length === 4, JSON.stringify({ opened, id: v.lastId, n: v.texts.length }));

  // ── Changement de modèle : la conversation reste ──
  await app.page.evaluate((baseUrl) => {
    localStorage.setItem('piano-jazz-ai-config', JSON.stringify({ baseUrl, apiKey: 'cle-de-test-locale', model: 'mock-model-2', monthlyCap: 50 }));
    document.dispatchEvent(new CustomEvent('app-ai-config-saved', { detail: { baseUrl, model: 'mock-model-2' } }));
  }, mock.url);
  await sleep(700);
  v = await view();
  check('Réglages d\'IA enregistrés (autre modèle) : la conversation reste ouverte', v.lastId === OLD && v.texts.length === 4, JSON.stringify({ id: v.lastId, n: v.texts.length }));

  // ── Fichier illisible : signalé, jamais supprimé ──
  await app.page.click('[data-astra-open="copilot-history-drawer"]');
  await sleep(500);
  v = await view();
  check('La conversation abîmée est dite illisible (pas « vide »)', v.history.some((h) => h.chip === 'illisible'), JSON.stringify(v.history));
  check('Elle est toujours sur le disque après l\'affichage de l\'historique', fs.existsSync(path.join(copilotDir, 'conv_4000_abimee.json')) && fs.readFileSync(path.join(copilotDir, 'conv_4000_abimee.json'), 'utf8') === BROKEN_RAW);
  await app.page.evaluate(() => { const card = [...document.querySelectorAll('#copilot-history-list .copilot-history-card')].find((c) => c.querySelector('.copilot-history-count-chip')?.textContent === 'illisible'); card?.querySelector('.copilot-history-open')?.click(); });
  await sleep(800);
  v = await view();
  check('L\'ouvrir prévient, sans changer la conversation affichée', v.lastId === OLD && v.notifications.some((n) => /n'a pas pu être ouverte/.test(n)), JSON.stringify({ id: v.lastId, n: v.notifications }));
  await app.page.keyboard.press('Escape');

  // ── Fermeture et réouverture ──
  await nav('copilot');
  await clearInput();
  await typeDraft('phrase commencée avant de fermer');
  await sleep(300);
  await app.stop();
  await sleep(800);
  app = await launchIsolatedApp({ root });
  await nav('copilot');
  await sleep(600);
  v = await view();
  check('Après fermeture et réouverture : la même conversation', v.lastId === OLD && v.texts.length === 4, JSON.stringify({ id: v.lastId, n: v.texts.length }));
  check('… et le brouillon écrit avant de fermer', v.input === 'phrase commencée avant de fermer', v.input);
  await shot('4-apres-redemarrage');

  // ── Tutoriel ouvert alors que rien n'a été fait depuis le lancement : on suit l'écran ──
  await clearInput();
  await sleep(200);
  await nav('pedagogie');
  await announceTutorial();
  await sleep(900);
  v = await view();
  check('Rien fait depuis le lancement : ouvrir un tutoriel montre SA conversation', v.lastId === 'conv_2000_tuto', v.lastId);
  await nav('copilot');

  // ── Bilan des fichiers ──
  const files = convFiles();
  check('Aucune conversation vide ni en double sur le disque', files.length === 4, files.join(','));
  check('La conversation abîmée est restée intacte jusqu\'au bout', fs.readFileSync(path.join(copilotDir, 'conv_4000_abimee.json'), 'utf8') === BROKEN_RAW);
  const realAfter = realSnapshot();
  const changed = [...new Set([...Object.keys(realBefore), ...Object.keys(realAfter)])].filter((name) => realBefore[name] !== realAfter[name]);
  check('Les vraies conversations de l\'utilisateur n\'ont pas bougé pendant l\'essai', changed.length === 0, `modifiées (peut-être par l'application réelle ouverte en même temps) : ${changed.join(', ')}`);
} catch (err) {
  failure = err;
  console.error('Parcours interrompu :', err);
  await shot('erreur');
} finally {
  await app.stop().catch(() => {});
  await mock.close().catch(() => {});
}

const passed = results.filter((r) => r.ok).length;
const report = {
  date: new Date().toISOString(),
  parcours: 'continuité des conversations (critères 1 et 2)',
  dossierIsole: root,
  reussis: passed,
  total: results.length,
  interrompu: failure ? String(failure?.message || failure) : null,
  controles: results,
  requetesFournisseur: mock.requests.map((r) => ({ modele: r.body?.model, messages: r.body?.messages?.length, outils: r.body?.tools?.length || 0, autorisation: r.headers.authorization || r.headers['x-api-key'] || 'absente' })),
  empreintes: Object.fromEntries(convFiles().map((name) => [name, sha(path.join(copilotDir, name))])),
};
fs.writeFileSync(path.join(root, 'rapport-continuite.json'), JSON.stringify(report, null, 2));
console.log(`\n=== Parcours Electron : ${passed}/${results.length} contrôles réussis${failure ? ' (interrompu)' : ''} ===`);
console.log(`Rapport : ${path.join(root, 'rapport-continuite.json')}`);
process.exit(!failure && passed === results.length ? 0 : 1);
