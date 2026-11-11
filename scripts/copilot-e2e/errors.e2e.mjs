// [Claude] — 2026-11-11 — Parcours de bout en bout, dans Electron : erreurs des fournisseurs d'IA.
//
// Critère 10 de la mission « Copilot fiable » : pour chaque catégorie d'erreur, le pianiste lit le
// bon message, sa question reste dans l'échange (et sur le disque), aucune boucle de requêtes ne
// part ; le bouton « Arrêter » abandonne une réponse trop lente ; une réponse suit normalement.
// Le chemin réel est exercé : renderer → IPC → processus principal → HTTP (faux fournisseur local).
//   npm run build && node scripts/copilot-e2e/errors.e2e.mjs [dossier pjc-e2e-…]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockProvider } from './mock-provider.mjs';
import { launchIsolatedApp, configureMockProvider } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || os.tmpdir(), `pjc-e2e-erreurs-${Date.now()}`));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

const copilotDir = path.join(root, 'home', 'PianoJazzChords', 'PedagogieCopilot');
const mock = await startMockProvider();
const app = await launchIsolatedApp({ root });
const view = () => app.page.evaluate(() => {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('pjc.copilot.conversations') || '{}'); } catch (_) { stored = {}; }
  const rows = [...document.querySelectorAll('#copilot-messages .tr-chat-message')];
  const btn = document.getElementById('copilot-send-btn');
  return {
    lastId: stored.lastId || null,
    texts: rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()),
    sendLabel: btn?.getAttribute('aria-label') || '',
    sendDisabled: Boolean(btn?.disabled),
    input: document.getElementById('copilot-input')?.value || '',
  };
});
const ask = async (text) => { await app.page.click('#copilot-input'); await app.page.keyboard.type(text, { delay: 2 }); await app.page.keyboard.press('Enter'); };
async function waitIdle(timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const v = await view();
    if (v.sendLabel === 'Envoyer la question') return v;
    await sleep(150);
  }
  return view();
}
const savedMessages = (id) => { try { return JSON.parse(fs.readFileSync(path.join(copilotDir, `${id}.json`), 'utf8')).messages; } catch (_) { return []; } };

const CASES = [
  ['401 clé refusée', 'auth401', /clé API a été refusée/, 1],
  ['402 crédit', 'credit402', /crédit ou de budget.*pas un problème de clé/, 1],
  ['403 accès', 'forbidden403', /refuse l’accès à ce modèle.*pas forcément en cause/, 1],
  ['404 modèle', 'notFound404', /introuvable ou inaccessible/, 1],
  ['400 contexte trop long', 'context400', /dépasse la taille autorisée/, 1],
  ['413 trop volumineux', 'tooLarge413', /dépasse la taille autorisée/, 1],
  ['429 quota avec délai', 'quota429', /quota.*environ 12 secondes/, 1],
  ['429 hébergeur saturé', 'busy429', /temporairement saturé.*clé n’est pas en cause/, 1],
  ['500 panne', 'server500', /problème de son côté/, 1],
  ['200 avec erreur embarquée', 'embedded200', /problème de son côté/, 1],
  ['JSON invalide', 'invalidJson200', /arrivée abîmée/, 1],
  ['connexion coupée', { drop: true }, /connexion au service d’IA a échoué/, 1],
];

let failure = null;
try {
  await configureMockProvider(app, { baseUrl: mock.url });
  await app.page.click('button[data-view="copilot"]');
  await sleep(500);
  let turn = 0;
  for (const [name, scenario, expected, requests] of CASES) {
    mock.reset();
    mock.enqueue(scenario);
    turn += 1;
    const question = `Question d'essai numéro ${turn} : à quoi sert la tierce ?`;
    await ask(question);
    const v = await waitIdle();
    const last = v.texts.at(-1) || '';
    const id = v.lastId;
    const onDisk = savedMessages(id);
    check(`${name} : le bon message`, expected.test(last), last.slice(0, 160));
    check(`${name} : ${requests} requête, pas de boucle`, mock.requests.length === requests, String(mock.requests.length));
    check(`${name} : la question reste à l'écran et sur le disque`, v.texts.some((t) => t.includes(`numéro ${turn}`)) && onDisk.some((m) => m.role === 'user' && m.content === question), `${onDisk.length} messages enregistrés`);
    check(`${name} : ni JSON ni texte d'exception sous les yeux du pianiste`, !/[{}]|Error|fetch failed|ECONN|Unexpected|invoking remote/i.test(last), last.slice(0, 160));
  }
  await app.page.screenshot({ path: path.join(root, '1-messages-d-erreur.png') }).catch(() => {});

  // Paramètre refusé puis accepté : une reprise, réponse normale.
  mock.reset();
  mock.enqueue('badParam400', { text: 'La tierce dit si l’accord est majeur ou mineur.' });
  await ask('Et avec un paramètre refusé ?');
  let v = await waitIdle();
  check('Paramètre refusé : reprise sans lui, la réponse arrive', /majeur ou mineur/.test(v.texts.at(-1) || '') && mock.requests.length === 2 && !('temperature' in mock.requests[1].body), `${mock.requests.length} requêtes · ${(v.texts.at(-1) || '').slice(0, 80)}`);

  // Bouton « Arrêter » : la réponse lente est abandonnée, la question reste.
  mock.reset();
  mock.enqueue({ text: 'jamais affichée', delayMs: 6000 });
  await ask('Question que je vais arrêter.');
  await sleep(700);
  v = await view();
  check('Pendant l\'attente, le bouton d\'envoi devient « Arrêter »', v.sendLabel === 'Arrêter la réponse' && !v.sendDisabled, v.sendLabel);
  const before = Date.now();
  await app.page.click('#copilot-send-btn');
  v = await waitIdle(4000);
  check('« Arrêter » rend la main tout de suite', Date.now() - before < 3000 && /Tu as arrêté cette demande/.test(v.texts.at(-1) || ''), `${Date.now() - before} ms · ${(v.texts.at(-1) || '').slice(0, 80)}`);
  check('La question arrêtée reste dans l\'échange', v.texts.some((t) => t.includes('Question que je vais arrêter.')));
  await sleep(6200); // la réponse tardive du fournisseur ne doit rien ajouter
  const afterLate = await view();
  check('La réponse arrivée après l\'arrêt n\'est pas affichée', !afterLate.texts.some((t) => t.includes('jamais affichée')) && afterLate.texts.length === v.texts.length);

  // Après toutes ces erreurs : une réponse normale, dans le même échange.
  mock.reset();
  mock.enqueue({ text: 'Tout fonctionne de nouveau.' });
  await ask('Et là ?');
  v = await waitIdle();
  check('Après les erreurs, la conversation continue dans le même échange', /Tout fonctionne de nouveau/.test(v.texts.at(-1) || '') && mock.requests.length === 1);
  const sent = mock.requests[0]?.body?.messages || [];
  check('Les messages d\'erreur de l\'application ne sont pas renvoyés au modèle comme des réponses', !sent.some((m) => m.role === 'assistant' && /clé API a été refusée|problème de son côté/.test(m.content || '')), String(sent.length));
  check('Le modèle demandé est toujours celui des réglages', mock.requests.every((r) => r.body.model === 'mock-model'));
  const files = fs.readdirSync(copilotDir).filter((n) => /^conv_.*\.json$/.test(n));
  check('Un seul fichier de conversation pour tout le parcours', files.length === 1, files.join(','));
  await app.page.screenshot({ path: path.join(root, '2-apres-les-erreurs.png') }).catch(() => {});
} catch (err) {
  failure = err;
  console.error('Parcours interrompu :', err);
} finally {
  await app.stop().catch(() => {});
  await mock.close().catch(() => {});
}

const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(root, 'rapport-erreurs.json'), JSON.stringify({ date: new Date().toISOString(), parcours: 'erreurs des fournisseurs (critère 10)', reussis: passed, total: results.length, interrompu: failure ? String(failure?.message || failure) : null, controles: results }, null, 2));
console.log(`\n=== Parcours Electron : ${passed}/${results.length} contrôles réussis${failure ? ' (interrompu)' : ''} ===`);
process.exit(!failure && passed === results.length ? 0 : 1);
