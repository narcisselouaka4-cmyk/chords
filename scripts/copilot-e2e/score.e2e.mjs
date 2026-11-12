// [Claude] — 2026-11-11 — Parcours de bout en bout, dans Electron : la partition du Copilote.
//
// Critère 11 de la mission « Copilot fiable » : hauteurs, durées, altérations, silences, accords
// au-dessus, incertitude dite pour une prise libre, suivi de la lecture, affichage stable à deux
// tailles de fenêtre. Dossier isolé, faux fournisseur local, aucune vraie clé, aucun son.
//   npm run build && node scripts/copilot-e2e/score.e2e.mjs [dossier pjc-e2e-…]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockProvider } from './mock-provider.mjs';
import { launchIsolatedApp, configureMockProvider } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || os.tmpdir(), `pjc-e2e-partition-${Date.now()}`));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

// ── Une vraie proposition, fabriquée par le vrai parcours d'harmonisation (hors Electron) ──
globalThis.window = { AudioContext: class { constructor() { this.state = 'suspended'; } } };
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent: () => true };
globalThis.CustomEvent ||= class { constructor(type) { this.type = type; } };
const mock = await startMockProvider();
const settings = new Map([['piano-jazz-ai-config', JSON.stringify({ apiKey: 'cle-de-test-locale', baseUrl: mock.url, model: 'mock-model' })]]);
globalThis.localStorage = { getItem: (k) => settings.get(k) ?? null, setItem: (k, v) => settings.set(k, v) };
const { sendCopilotMessage } = await import('../../src/pedagogie/copilot-client.js');
const quiet = async (fn) => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const chordTake = { name: 'Prise d’essai', key: 'Do majeur', duration: 6, events: [[48, 55, 60, 64], [50, 57, 60, 65], [52, 59, 62, 67]].flatMap((ns, i) => ns.flatMap((note) => [
  { type: 'note_on', note, time: i * 2, velocity: 0.7, channel: 0 }, { type: 'note_off', note, time: i * 2 + 1.8, velocity: 0, channel: 0 },
])).sort((a, b) => a.time - b.time) };
mock.enqueue({ text: JSON.stringify({ variants: [{ title: 'Accords liés', segments: [[0, 'maj7', [48, 55, 59, 64]], [2, 'm7', [50, 57, 60, 65]], [4, 'm7', [52, 59, 62, 67]]].map(([rootPc, quality, notes], anchor) => ({ anchor, rootPc, quality, notes, reason: 'Cette couleur soutient la mélodie avec une basse proche.' })) }] }) });
const proposal = await quiet(() => sendCopilotMessage({ message: 'Rends mes accords plus beaux.', messages: [{ role: 'user', content: 'Rends mes accords plus beaux.', take: chordTake }], context: { type: 'autonomous', playing: { passage: chordTake } } }));
if (!proposal.ok || !proposal.toolResult?.variants?.length) throw new Error(`La proposition d'essai n'a pas pu être fabriquée : ${proposal.error || proposal.content}`);
delete globalThis.window; delete globalThis.document;

const copilotDir = path.join(root, 'home', 'PianoJazzChords', 'PedagogieCopilot');
fs.mkdirSync(copilotDir, { recursive: true });
const freeTake = { name: 'Prise libre', duration: 8, events: [[0, 60], [0.37, 64], [1.21, 67], [1.9, 62], [3.33, 60], [3.41, 67], [5.02, 59], [5.9, 65], [7.13, 72]].flatMap(([t, n]) => [{ type: 'note_on', note: n, time: t, velocity: 0.7, channel: 0 }, { type: 'note_off', note: n, time: t + 0.6, velocity: 0, channel: 0 }]) };
fs.writeFileSync(path.join(copilotDir, 'conv_7000_proposition.json'), JSON.stringify({ version: 2, tutorialPath: '__copilot_autonomous__', updatedAt: '2026-11-10T10:00:00Z', messages: [
  { role: 'user', content: 'Rends mes accords plus beaux.', take: chordTake, timestamp: '2026-11-10T10:00:00Z' },
  { role: 'assistant', content: proposal.content, toolResult: proposal.toolResult, timestamp: '2026-11-10T10:00:05Z' },
] }));
fs.writeFileSync(path.join(copilotDir, 'conv_6000_libre.json'), JSON.stringify({ version: 2, tutorialPath: '__copilot_autonomous__', updatedAt: '2026-11-09T10:00:00Z', messages: [
  { role: 'user', content: 'Voici une prise libre.', take: freeTake, timestamp: '2026-11-09T10:00:00Z' },
  { role: 'assistant', content: 'Voici ton jeu, rejoué à partir de ses notes MIDI.', toolResult: { played: [], ignored: 0, suggestions: [], voicing: null, originalTake: freeTake, example: { kind: 'playing', source: 'passage', title: 'Ton jeu', subtitle: '', tempo: 60, beats: 8, chords: [], events: freeTake.events.map((e) => ({ time: e.time, type: e.type === 'note_on' ? 'noteOn' : 'noteOff', note: e.note, velocity: 0.7 })) } }, timestamp: '2026-11-09T10:00:05Z' },
] }));

const app = await launchIsolatedApp({ root });
const openHistory = async (titleStart) => {
  await app.page.click('[data-astra-open="copilot-history-drawer"]');
  await sleep(400);
  await app.page.evaluate((start) => [...document.querySelectorAll('#copilot-history-list .copilot-history-card')].find((c) => (c.querySelector('.copilot-history-title')?.textContent || '').startsWith(start))?.querySelector('.copilot-history-open')?.click(), titleStart);
  await sleep(900);
};
/** Ouvre « Partition » de la dernière réponse et lit ce qui est gravé. */
async function openScore({ tab = null } = {}) {
  await app.page.evaluate((wanted) => {
    const details = [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1);
    if (!details) return;
    if (!details.open) details.querySelector('summary').click();
    if (wanted) [...details.querySelectorAll('.copilot-score-tab')].find((b) => b.textContent === wanted)?.click();
  }, tab);
  await app.page.waitForFunction(() => { const d = [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1); return d && d.querySelector('.copilot-score-sheet svg'); }, { timeout: 12000 }).catch(() => {});
  await sleep(500);
  return app.page.evaluate(() => {
    const details = [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1);
    if (!details) return null;
    details.scrollIntoView({ block: 'center' });
    const sheet = details.querySelector('.copilot-score-sheet');
    const message = details.closest('.tr-chat-message');
    return {
      systems: sheet.querySelectorAll('.copilot-score-system svg').length,
      notes: sheet.querySelectorAll('.vf-stavenote').length,
      heads: sheet.querySelectorAll('.vf-notehead').length,
      staves: sheet.querySelectorAll('.vf-stave').length,
      chords: [...sheet.querySelectorAll('.copilot-score-chord')].map((t) => t.textContent),
      tabs: [...details.querySelectorAll('.copilot-score-tab')].map((b) => `${b.textContent}${b.classList.contains('is-active') ? '*' : ''}`),
      caption: details.querySelector('.copilot-score-caption')?.textContent || '',
      overflow: sheet.scrollWidth - sheet.clientWidth,
      insideMessage: sheet.getBoundingClientRect().right <= (message?.getBoundingClientRect().right || 0) + 2,
      current: sheet.querySelectorAll('.copilot-score-current').length,
      errors: sheet.textContent.includes('n’a pas pu être affichée'),
    };
  });
}

let failure = null;
try {
  await configureMockProvider(app, { baseUrl: mock.url });
  await app.page.click('button[data-view="copilot"]');
  await sleep(500);

  // ── 1. Une proposition structurée : le jeu d'origine et la proposition ──
  await openHistory('Rends mes accords plus beaux');
  let s = await openScore();
  check('« Partition » est proposée sous la proposition, avec deux onglets', Boolean(s) && s.tabs.length === 2 && s.tabs[0].startsWith('Ton jeu') && s.tabs[1] === 'Proposition*', JSON.stringify(s?.tabs));
  check('Proposition gravée : deux portées par mesure, sans erreur', s.systems >= 1 && s.staves >= 4 && !s.errors, JSON.stringify(s));
  check('Partition sur une seule ligne horizontale (pas de lignes empilées)', s.systems === 1, JSON.stringify({ systems: s.systems }));
  check('Les trois accords tenus sont écrits (têtes de notes aux deux portées)', s.heads >= 12, `${s.heads} têtes de notes`);
  check('Les accords sont écrits au-dessus de la portée', s.chords.length >= 3, JSON.stringify(s.chords));
  check('Ce qui est estimé est dit : pulsation, barres supposées, arrondi, portées, rythme exact à la lecture', /Pulsation estimée|Rythme libre|Trop peu de notes/.test(s.caption) && /Barres de mesure supposées/.test(s.caption) && /arrondies à la double croche/.test(s.caption) && /pas la détection des mains/.test(s.caption) && /La lecture garde le rythme exact/.test(s.caption), s.caption);
  check('La partition tient dans la réponse à 1920×1080 (pas de débordement)', s.overflow <= 2 && s.insideMessage, JSON.stringify({ overflow: s.overflow, inside: s.insideMessage }));
  await app.page.screenshot({ path: path.join(root, '1-partition-proposition.png') }).catch(() => {});
  const original = await openScore({ tab: 'Ton jeu' });
  check('Onglet « Ton jeu » : la prise d\'origine est gravée elle aussi', original.tabs[0] === 'Ton jeu*' && original.heads >= 12 && !original.errors, JSON.stringify({ tabs: original.tabs, heads: original.heads }));
  await openScore({ tab: 'Proposition' });

  // Suivi de la lecture : la note en cours est mise en valeur pendant l'écoute.
  const started = await app.page.evaluate(() => {
    // Le bouton de lecture de la carte de la proposition (pas une étiquette de relance).
    const buttons = [...document.querySelectorAll('#copilot-messages button')].filter((b) => /^\s*Écouter l[’']exemple\s*$/.test(b.textContent || ''));
    buttons.at(-1)?.click();
    return buttons.length;
  });
  let followed = 0;
  for (let i = 0; i < 30 && !followed; i += 1) { await sleep(200); followed = await app.page.evaluate(() => document.querySelectorAll('#copilot-messages .copilot-score-current').length); }
  check('Pendant la lecture, la partition suit (note en cours mise en valeur)', started > 0 && followed > 0, `boutons d'écoute : ${started}, notes en valeur : ${followed}`);
  await app.page.evaluate(() => document.dispatchEvent(new CustomEvent('copilot-stop-example')));
  await sleep(400);

  // ── 2. Une prise libre : l'incertitude est dite ──
  await openHistory('Voici une prise libre');
  s = await openScore();
  check('Prise libre : la partition est gravée', Boolean(s) && s.heads >= 9 && !s.errors, JSON.stringify(s && { heads: s.heads, tabs: s.tabs }));
  check('Prise libre : une seule partition « Ton jeu », pas deux onglets jumeaux', s.tabs.length <= 1, JSON.stringify(s.tabs));
  check('Prise libre : « Rythme libre… une approximation » est écrit sous la partition', /^Rythme libre : la pulsation n’est pas assez régulière pour être certaine\. Les durées écrites sont une approximation\./.test(s.caption), s.caption);
  await app.page.screenshot({ path: path.join(root, '2-partition-prise-libre.png') }).catch(() => {});

  // ── 3. Un accord nommé : exemple écrit par l'application ──
  await app.page.click('#copilot-new-conv-btn');
  await sleep(500);
  mock.reset();
  mock.enqueue({ text: 'Voici un Mi bémol majeur 7.', toolCalls: [{ name: 'play_voicing', arguments: { chordSymbol: 'Ebmaj7' } }] });
  await app.page.click('#copilot-input');
  await app.page.keyboard.type('Fais-moi entendre un Ebmaj7', { delay: 2 });
  await app.page.keyboard.press('Enter');
  for (let i = 0; i < 60; i += 1) { await sleep(200); if (await app.page.evaluate(() => document.getElementById('copilot-send-btn')?.getAttribute('aria-label') === 'Envoyer la question' && document.querySelectorAll('#copilot-messages .copilot-score').length > 0)) break; }
  await app.page.evaluate(() => document.dispatchEvent(new CustomEvent('copilot-stop-example')));
  s = await openScore();
  check('Accord nommé : sa partition est proposée', Boolean(s) && s.heads >= 4 && !s.errors, JSON.stringify(s));
  check('Son nom est écrit au-dessus de la portée', s.chords.includes('Ebmaj7'), JSON.stringify(s.chords));
  check('Exemple écrit par l\'application : rien n\'est présenté comme estimé', /Exemple écrit par l’application/.test(s.caption) && !/supposées|estimée/.test(s.caption), s.caption);
  const described = await app.page.evaluate(() => [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1).querySelector('.copilot-score-sheet svg')?.getAttribute('aria-label') || '');
  check('Les notes écrites sont celles de l\'accord, avec leurs bémols (Mi♭ en clé de fa ; Mi♭, Sol, Si♭, Ré en clé de sol)', /clé de fa E♭3/.test(described) && /E♭4\+G4\+B♭4\+D5/.test(described) && !/[A-G]♯/.test(described), described.slice(0, 260));
  const barBox = await app.page.evaluate(() => { const svg = [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1).querySelector('.copilot-score-sheet svg'); const stave = svg.querySelector('.vf-stave'); return { sheet: svg.getBoundingClientRect().width, stave: stave.getBoundingClientRect().width }; });
  // 12/11 : partition sur une ligne compacte qui défile (Narcisse : « horizontale, plus légère ») ;
  // une mesure d'un accord reste lisible à partir de 200 px, sans être écrasée dans un coin.
  check('Une mesure seule n\'est pas tassée dans un coin (au moins 200 px de large, ligne compacte)', barBox.stave >= 200 && barBox.sheet >= barBox.stave, JSON.stringify(barBox));
  await app.page.screenshot({ path: path.join(root, '3-partition-accord-nomme.png') }).catch(() => {});

  // ── 4. Fenêtre plus étroite : l'affichage reste stable ──
  await app.page.setViewport({ width: 1280, height: 800 });
  await sleep(500);
  await openHistory('Rends mes accords plus beaux');
  s = await openScore();
  check('À 1280×800 : la partition se regrave et tient dans la réponse', Boolean(s) && s.heads >= 12 && s.overflow <= 2 && s.insideMessage && !s.errors, JSON.stringify(s && { heads: s.heads, overflow: s.overflow, inside: s.insideMessage, systems: s.systems }));
  await app.page.screenshot({ path: path.join(root, '4-partition-1280.png') }).catch(() => {});
  const consoleErrors = await app.page.evaluate(() => window.__pjcErrors || []);
  check('Aucune erreur de script relevée pendant le parcours', consoleErrors.length === 0, JSON.stringify(consoleErrors).slice(0, 300));
} catch (err) {
  failure = err;
  console.error('Parcours interrompu :', err);
  await app.page.screenshot({ path: path.join(root, 'erreur.png') }).catch(() => {});
} finally {
  await app.stop().catch(() => {});
  await mock.close().catch(() => {});
}

const passed = results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(root, 'rapport-partition.json'), JSON.stringify({ date: new Date().toISOString(), parcours: 'partition du Copilote (critère 11)', reussis: passed, total: results.length, interrompu: failure ? String(failure?.message || failure) : null, controles: results }, null, 2));
console.log(`\n=== Parcours Electron : ${passed}/${results.length} contrôles réussis${failure ? ' (interrompu)' : ''} ===`);
process.exit(!failure && passed === results.length ? 0 : 1);
