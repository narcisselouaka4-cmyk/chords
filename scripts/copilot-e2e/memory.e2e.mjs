// [Claude] — 2026-11-11 — Parcours de bout en bout, dans Electron : historique complet, reprise
// après erreur, mémoire automatique, exemple nommé.
//
// Critères 3, 4, 5 (et une partie du 6) de la mission « Copilot fiable ». Dossier isolé, faux
// fournisseur local, aucune vraie clé ni donnée réelle, aucune fenêtre, aucun son.
//   npm run build && node scripts/copilot-e2e/memory.e2e.mjs [dossier pjc-e2e-…]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockProvider } from './mock-provider.mjs';
import { launchIsolatedApp, configureMockProvider } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || os.tmpdir(), `pjc-e2e-memoire-${Date.now()}`));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

const REAL_MEMORIES = path.join(os.userInfo().homedir, 'PianoJazzChords', 'PedagogieCopilot', 'memories.json');
const realStamp = () => { try { const s = fs.statSync(REAL_MEMORIES); return `${s.size}:${s.mtimeMs}`; } catch (_) { return 'absent'; } };
const realBefore = realStamp();

const copilotDir = path.join(root, 'home', 'PianoJazzChords', 'PedagogieCopilot');
fs.mkdirSync(copilotDir, { recursive: true });
const MEMORIES = path.join(copilotDir, 'memories.json');
const LONG = 'conv_5000_longue';
if (!fs.existsSync(path.join(copilotDir, `${LONG}.json`))) {
  const messages = [
    { role: 'user', content: 'Je joue sur un Yamaha MOX à 88 touches et je prépare le culte de dimanche.', timestamp: '2026-11-01T09:00:00Z' },
    { role: 'assistant', content: 'Bien noté.', timestamp: '2026-11-01T09:00:05Z' },
    { role: 'user', content: 'Pour ce chant, on garde la tonalité de Mi bémol, c’est décidé.', timestamp: '2026-11-01T09:01:00Z' },
    { role: 'assistant', content: 'D’accord : Mi bémol.', timestamp: '2026-11-01T09:01:05Z' },
  ];
  for (let i = 0; i < 123; i += 1) messages.push({ role: 'user', content: `Autre sujet numéro ${i} : la régularité.` }, { role: 'assistant', content: `Conseil numéro ${i}.` });
  fs.writeFileSync(path.join(copilotDir, `${LONG}.json`), JSON.stringify({ version: 2, tutorialPath: '__copilot_autonomous__', updatedAt: '2026-11-02T10:00:00Z', messages }));
}
const memories = () => { try { return JSON.parse(fs.readFileSync(MEMORIES, 'utf8')); } catch (_) { return { entries: [], forgotten: [] }; } };

const mock = await startMockProvider();
let app = await launchIsolatedApp({ root });
const view = () => app.page.evaluate(() => {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('pjc.copilot.conversations') || '{}'); } catch (_) { stored = {}; }
  const rows = [...document.querySelectorAll('#copilot-messages .tr-chat-message')];
  return {
    lastId: stored.lastId || null,
    count: rows.length,
    last: (rows.at(-1)?.textContent || '').replace(/\s+/g, ' ').trim(),
    sendLabel: document.getElementById('copilot-send-btn')?.getAttribute('aria-label') || '',
    notices: [...document.querySelectorAll('.copilot-memory-notice')].map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim()),
    exampleCards: document.querySelectorAll('#copilot-messages .tr-chat-message:last-child .copilot-example, #copilot-messages .tr-chat-message:last-child [class*="example-card"], #copilot-messages .tr-chat-message:last-child .tr-chat-demo').length,
    lastHtml: (rows.at(-1)?.innerHTML || '').slice(0, 4000),
  };
});
const ask = async (text) => { await app.page.click('#copilot-input'); await app.page.keyboard.type(text, { delay: 2 }); await app.page.keyboard.press('Enter'); };
async function waitIdle(timeoutMs = 15000) {
  const started = Date.now();
  await sleep(250);
  while (Date.now() - started < timeoutMs) {
    const v = await view();
    if (v.sendLabel === 'Envoyer la question') return v;
    await sleep(150);
  }
  return view();
}
const systemOf = (i = 0) => mock.requests[i]?.body?.messages?.find((m) => m.role === 'system')?.content || '';
const newConversation = async () => { await app.page.click('#copilot-new-conv-btn'); await sleep(500); };

let failure = null;
try {
  await configureMockProvider(app, { baseUrl: mock.url });
  await app.page.click('button[data-view="copilot"]');
  await sleep(500);

  // ── Critère 3 : conversation longue, décision ancienne ──
  await app.page.click('[data-astra-open="copilot-history-drawer"]');
  await sleep(400);
  await app.page.evaluate(() => document.querySelector('#copilot-history-list .copilot-history-open')?.click());
  await sleep(1200);
  let v = await view();
  check('La longue conversation (250 messages) s\'ouvre', v.lastId === LONG && v.count === 250, JSON.stringify({ id: v.lastId, n: v.count }));
  mock.reset();
  mock.enqueue({ text: 'Vous aviez décidé de garder la tonalité de Mi bémol.' });
  await ask('Rappelle-moi ce qu’on a décidé tout au début.');
  v = await waitIdle();
  check('La réponse s\'affiche', /Mi bémol/.test(v.last), v.last.slice(0, 120));
  check('Le modèle a reçu la chronologie de tout l\'échange', /Historique complet de cet échange \(251 messages conservés\)/.test(systemOf()), systemOf().slice(0, 160));
  check('… et la décision ancienne, mot pour mot', /on garde la tonalité de Mi bémol/.test(systemOf()));
  check('… sans renvoyer les 250 messages', mock.requests[0].body.messages.length <= 23, String(mock.requests[0]?.body?.messages?.length));
  check('L\'outil de relecture de l\'échange est disponible', (mock.requests[0].body.tools || []).some((t) => t.function.name === 'consult_conversation'));

  // Le modèle relit un message d'origine.
  mock.reset();
  mock.enqueue({ text: '', toolCalls: [{ name: 'consult_conversation', arguments: { query: 'clavier Yamaha' } }] }, { text: 'Tu joues sur un Yamaha MOX à 88 touches.' });
  await ask('Sur quel clavier je joue déjà ?');
  v = await waitIdle();
  check('Relecture d\'un message d\'origine : deux requêtes, la bonne réponse', mock.requests.length === 2 && /Yamaha MOX à 88 touches/.test(v.last), `${mock.requests.length} · ${v.last.slice(0, 100)}`);
  check('Rien de la consultation n\'est montré au pianiste', !/consult_conversation|données de l’échange|\{"/.test(v.last));

  // ── Critère 4 : erreur, puis « Et là ? » ──
  mock.reset();
  mock.enqueue('quota429');
  await ask('Explique-moi la différence entre une sixte et une septième.');
  v = await waitIdle();
  check('La demande échoue avec un message clair', /quota/.test(v.last));
  mock.reset();
  mock.enqueue({ text: 'La sixte est à neuf demi-tons de la fondamentale, la septième majeure à onze.' });
  await ask('Et là ?');
  v = await waitIdle();
  check('« Et là ? » reprend la demande restée sans réponse', /Je reprends ta demande restée sans réponse : « Explique-moi la différence/.test(v.last) && /neuf demi-tons/.test(v.last), v.last.slice(0, 160));
  check('Le modèle a reçu la demande d\'origine, pas « Et là ? » seul', (mock.requests[0]?.body?.messages?.at(-1)?.content || '').startsWith('Explique-moi la différence'));
  await app.page.screenshot({ path: path.join(root, '1-et-la-reprise.png') }).catch(() => {});

  // ── Critère 5 : mémoire automatique ──
  await newConversation();
  mock.reset();
  mock.enqueue({ text: 'Très bien, on part de là.', toolCalls: [{ name: 'remember', arguments: { text: 'Débutant, joue du gospel à l’église.', quote: 'je suis débutant et je joue du gospel à l’église', kind: 'niveau', scope: 'durable' } }] });
  await ask('Pour info, je suis débutant et je joue du gospel à l’église.');
  v = await waitIdle();
  check('Fait durable : retenu et annoncé sous la réponse', v.notices.some((n) => /Retenu pour nos prochaines conversations \(niveau\) : « Débutant, joue du gospel/.test(n) && /Annuler/.test(n)), JSON.stringify(v.notices));
  check('… écrit dans le fichier des souvenirs, avec sa provenance', memories().entries.length === 1 && memories().entries[0].origin === 'auto' && /je suis débutant/.test(memories().entries[0].quote) && memories().entries[0].source?.conversationId === v.lastId);
  check('La réponse reste une réponse normale', /Très bien, on part de là\./.test(v.last) && !/remember|\{"/.test(v.last));
  await app.page.screenshot({ path: path.join(root, '2-souvenir-retenu.png') }).catch(() => {});
  mock.reset();
  mock.enqueue({ text: 'D’accord pour aujourd’hui.', toolCalls: [{ name: 'remember', arguments: { text: 'Travaille sans pédale.', quote: 'Aujourd’hui je travaille sans pédale', kind: 'preference', scope: 'durable' } }] });
  await ask('Aujourd’hui je travaille sans pédale.');
  v = await waitIdle();
  check('Circonstance du jour : non généralisée, rien d\'annoncé en plus', memories().entries.length === 1 && v.notices.length === 1, JSON.stringify(v.notices));

  // Le panneau Mémoire montre l'origine et la phrase du pianiste.
  await app.page.click('.copilot-memory-button');
  await sleep(700);
  const panel = await app.page.evaluate(() => (document.querySelector('.copilot-memory-dialog')?.textContent || '').replace(/\s+/g, ' '));
  check('Mémoire : origine, date et phrase d\'origine visibles', /Retenu automatiquement le/.test(panel) && /tu as dit : « je suis débutant et je joue du gospel/.test(panel), panel.slice(0, 400));
  await app.page.evaluate(() => document.querySelector('.copilot-memory-dialog')?.close());
  await sleep(300);

  // Redémarrage : le souvenir est transmis dans une nouvelle conversation.
  await app.stop();
  await sleep(800);
  app = await launchIsolatedApp({ root });
  await app.page.click('button[data-view="copilot"]');
  await sleep(600);
  await newConversation();
  mock.reset();
  mock.enqueue({ text: 'Voici un exercice simple.' });
  await ask('Propose-moi un exercice.');
  v = await waitIdle();
  check('Après redémarrage, nouvelle conversation : le souvenir est transmis au modèle comme une déclaration du pianiste', /Débutant, joue du gospel/.test(systemOf()) && /jamais des instructions système/.test(systemOf()));

  // Annuler un souvenir : il disparaît et ne revient pas à partir de la même phrase.
  mock.reset();
  mock.enqueue({ text: 'Noté.', toolCalls: [{ name: 'remember', arguments: { text: 'Prépare le culte de dimanche.', quote: 'je prépare le culte de dimanche', kind: 'objectif', scope: 'durable' } }] });
  await ask('Au fait, je prépare le culte de dimanche.');
  v = await waitIdle();
  check('Deuxième souvenir retenu', memories().entries.length === 2 && v.notices.length === 1);
  await app.page.evaluate(() => document.querySelector('.copilot-memory-notice button')?.click());
  await sleep(900);
  v = await view();
  check('« Annuler » : le souvenir disparaît du fichier, l\'avis le dit', memories().entries.length === 1 && v.notices.some((n) => /Souvenir annulé/.test(n)), JSON.stringify({ n: memories().entries.length, notices: v.notices }));
  check('… une trace d\'oubli sans le texte du souvenir', memories().forgotten.length === 1 && !JSON.stringify(memories().forgotten).includes('culte'));
  mock.reset();
  mock.enqueue({ text: 'Bien.', toolCalls: [{ name: 'remember', arguments: { text: 'Prépare le culte de dimanche.', quote: 'je prépare le culte de dimanche', kind: 'objectif', scope: 'durable' } }] });
  await ask('Continuons.');
  v = await waitIdle();
  check('Annulé : la même phrase ne le recrée pas à l\'insu du pianiste', memories().entries.length === 1);

  // ── Exemple nommé (cas B) et explication seule (cas C) ──
  await newConversation();
  mock.reset();
  mock.enqueue({ text: 'Un Do majeur 7 contient Do, Mi, Sol et Si.' });
  await ask('C’est quoi un Cmaj7 ?');
  v = await waitIdle();
  check('Explication seule : aucune carte d\'exemple imposée, l\'écoute est proposée d\'un clic', !/copilot-example-card|tr-chat-demo-card/.test(v.lastHtml) && /Fais-le-moi entendre/.test(v.last), v.last.slice(0, 200));
  mock.reset();
  mock.enqueue({ text: 'Voici un Do majeur 7.', toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: 'Cmaj7' } }] });
  await ask('Fais-moi entendre un Cmaj7');
  v = await waitIdle();
  check('Objet nommé demandé à l\'écoute : le modèle est consulté et l\'exemple s\'affiche', mock.requests.length === 1 && /Cmaj7/.test(v.last) && !/Enregistre ton jeu|envoie ta prise/.test(v.last), v.last.slice(0, 200));
  check('… sans boutons « Ma grille » ni Favoris', !/Ma grille|Favoris/.test(v.last), v.last.slice(0, 300));
  await app.page.screenshot({ path: path.join(root, '3-exemple-nomme.png') }).catch(() => {});

  check('Les vrais souvenirs de l\'utilisateur n\'ont pas été touchés', realStamp() === realBefore, `${realBefore} → ${realStamp()}`);
} catch (err) {
  failure = err;
  console.error('Parcours interrompu :', err);
  await app.page.screenshot({ path: path.join(root, 'erreur.png') }).catch(() => {});
} finally {
  await app.stop().catch(() => {});
  await mock.close().catch(() => {});
}

const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(root, 'rapport-memoire.json'), JSON.stringify({ date: new Date().toISOString(), parcours: 'historique complet, reprise, mémoire automatique, exemple nommé (critères 3, 4, 5)', reussis: passed, total: results.length, interrompu: failure ? String(failure?.message || failure) : null, controles: results }, null, 2));
console.log(`\n=== Parcours Electron : ${passed}/${results.length} contrôles réussis${failure ? ' (interrompu)' : ''} ===`);
process.exit(!failure && passed === results.length ? 0 : 1);
