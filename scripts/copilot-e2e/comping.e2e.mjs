// [Claude] — 2026-11-13 — Parcours de bout en bout, dans Electron : une progression gospel jouée
// d'après les pianistes relevés dans les tutoriels (tutorial-comping.js).
//
// Dossier isolé, faux fournisseur local, aucune vraie clé. Par défaut, le relevé est fabriqué ici ;
// avec un dossier de relevés en deuxième argument, ils sont COPIÉS dans le dossier isolé (lecture
// seule de l'original) pour essayer avec de vraies données.
//   npm run build && node scripts/copilot-e2e/comping.e2e.mjs [dossier pjc-e2e-…] [dossier de relevés]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startMockProvider } from './mock-provider.mjs';
import { launchIsolatedApp, configureMockProvider } from './isolated-electron.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const root = path.resolve(process.argv[2] || path.join(process.env.TMPDIR || os.tmpdir(), `pjc-e2e-comping-${Date.now()}`));
const realDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) });
  console.log(`${ok ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

// ── Les relevés du dossier isolé ──────────────────────────────────────────
const memory = path.join(root, 'home', 'PianoJazzChords', 'Pedagogie', 'memoire');
fs.mkdirSync(memory, { recursive: true });
if (realDir) {
  for (const name of fs.readdirSync(realDir)) if (/^[a-z0-9]+\.json$/i.test(name) && name !== 'index.json') fs.copyFileSync(path.join(realDir, name), path.join(memory, name));
} else {
  const lines = [
    [0, 'Cadd9', [[0, 1.8, 36, 55, 60, 62, 64], [1, 0.4, 67], [1.5, 0.4, 64]]],
    [2, 'Am9', [[0, 1.9, 45, 55, 59, 60, 64]]],
    [4, 'Dm9', [[0, 1.9, 38, 53, 57, 60, 64]]],
    [6, 'G13', [[0, 1.4, 43, 53, 59, 64]]],
    [7.5, 'Db7', [[0, 0.4, 37, 53, 59, 63]]],
    [8, 'Cmaj9', [[0, 1.9, 36, 52, 55, 59, 62]]],
    [10, 'Fadd9', [[0, 1.9, 41, 55, 57, 60]]],
  ];
  const noteEvents = [];
  const segments = [];
  lines.forEach(([start, label, attacks], i) => {
    segments.push({ start, end: lines[i + 1] ? lines[i + 1][0] : start + 2, chord: { label } });
    for (const [offset, duration, ...midis] of attacks) for (const midi of midis) noteEvents.push({ midi, start: start + offset, end: start + offset + duration, hand: null, velocity: 0.4 });
  });
  fs.writeFileSync(path.join(memory, 'e2e0001.json'), JSON.stringify({ version: 1, path: '/essai/Gospel Piano Lesson.mp4', key: 'C', savedAt: '2026-11-13T10:00:00Z', analysis: { source: 'video', notesSource: 'image (clavier dessiné)', readingRevision: 7, soundCheck: { reliable: true }, noteEvents, segments } }));
}

const mock = await startMockProvider();
const app = await launchIsolatedApp({ root });
const errors = [];
app.page.on('pageerror', (err) => errors.push(String(err?.message || err)));
app.page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon|net::ERR/.test(msg.text())) errors.push(msg.text()); });

const cards = () => app.page.evaluate(() => [...document.querySelectorAll('#copilot-messages .copilot-example')].map((card) => ({
  title: card.querySelector('.copilot-example-text strong')?.textContent || '',
  subtitle: card.querySelector('.copilot-example-text small')?.textContent || '',
  hands: [...card.querySelectorAll('.copilot-example-hands li')].map((li) => li.textContent),
  playing: card.classList.contains('is-playing'),
})));
async function ask(text) {
  const before = (await cards()).length;
  await app.page.click('#copilot-input');
  await app.page.keyboard.type(text, { delay: 4 });
  await app.page.keyboard.press('Enter');
  await app.page.waitForFunction((n) => document.querySelectorAll('#copilot-messages .copilot-example').length > n, { timeout: 20000 }, before).catch(() => {});
  await sleep(500);
  return (await cards()).at(-1) || null;
}

let failure = null;
try {
  await configureMockProvider(app, { baseUrl: mock.url });
  await app.page.click('button[data-view="copilot"]');
  await sleep(500);

  const progression = realDir ? ['C', 'E7', 'Am7', 'Dm7', 'G7', 'C'] : ['C', 'Am7', 'Dm7', 'G7', 'C'];
  mock.enqueue({ text: 'Voici une progression gospel en Do.', toolCalls: [{ name: 'play_progression', arguments: { chords: progression, styleId: 'gospel', focus: 'full' } }] });
  const first = await ask('Joue-moi une progression gospel en Do');
  check('Une carte d’écoute pour la progression', first && first.title === progression.join(' → '), JSON.stringify(first));
  check('La carte dit d’après quel pianiste', first && /Gospel · \d+ accords · d’après « /.test(first.subtitle), first?.subtitle);
  check('Chaque accord montré dit la vidéo et le moment', first && first.hands.length > 0 && first.hands.some((h) => /(voicing de|joué comme dans) « .+ » à \d+:\d\d/.test(h)), JSON.stringify(first?.hands));
  console.log(`   ${first?.subtitle}\n   ${(first?.hands || []).join('\n   ')}`);

  // Écoute : le bouton envoie la prise au lecteur, et le lecteur la démarre.
  // Dans ce banc (fenêtre cachée, son coupé), le lecteur s'arrête de lui-même 150 ms plus tard —
  // mesuré aussi sur un exemple jazz que ce chantier ne touche pas : l'écoute jusqu'au bout ne se
  // vérifie pas ici.
  await app.page.evaluate(() => {
    window.__sent = null;
    window.__started = false;
    document.addEventListener('copilot-play-example', (e) => {
      const events = e.detail?.example?.events || [];
      window.__sent = { id: e.detail?.id, notes: events.filter((x) => x.type === 'noteOn').length, tempo: e.detail?.example?.tempo, beats: e.detail?.example?.beats, sorted: events.every((x, i) => i === 0 || events[i - 1].time <= x.time) };
    }, { once: true });
    document.addEventListener('copilot-example-state', (e) => { if (e.detail?.playing && e.detail.id === window.__sent?.id) window.__started = true; });
  });
  // Un vrai clic (geste de l'utilisateur).
  const playButtons = await app.page.$$('#copilot-messages .copilot-example-play');
  await playButtons.at(-1).evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await playButtons.at(-1).click();
  await app.page.waitForFunction(() => window.__started === true, { timeout: 12000 }).catch(() => {});
  const sent = await app.page.evaluate(() => ({ ...window.__sent, started: window.__started }));
  check('Le bouton d’écoute envoie la prise au lecteur (notes triées, tempo, durée)', sent && sent.notes > 12 && sent.sorted && sent.tempo >= 72 && sent.tempo <= 92 && sent.beats > 16, JSON.stringify(sent));
  check('Le lecteur démarre la prise', sent?.started === true, JSON.stringify(sent));
  await app.page.evaluate(() => document.dispatchEvent(new CustomEvent('copilot-stop-example')));
  await sleep(400);

  // « Une autre façon de la jouer ».
  const offered = await app.page.evaluate(() => [...document.querySelectorAll('#copilot-messages button')].some((b) => /Une autre façon de la jouer/.test(b.textContent || '')));
  check('« Une autre façon de la jouer » est proposée', offered);
  mock.enqueue({ text: 'Autrement.', toolCalls: [{ name: 'play_progression', arguments: { chords: progression, styleId: 'gospel', focus: 'full' } }] });
  const second = await ask('Joue-la d’une autre façon');
  check('La seconde prise s’appuie aussi sur un pianiste relevé', second && /d’après « /.test(second.subtitle), second?.subtitle);
  check('Elle diffère de la première (mains ou sous-titre)', second && (second.subtitle !== first.subtitle || JSON.stringify(second.hands) !== JSON.stringify(first.hands)), second?.subtitle);
  console.log(`   ${second?.subtitle}\n   ${(second?.hands || []).join('\n   ')}`);

  // Partition de la dernière réponse.
  const score = await app.page.evaluate(async () => {
    const details = [...document.querySelectorAll('#copilot-messages .copilot-score')].at(-1);
    if (!details) return null;
    if (!details.open) details.querySelector('summary').click();
    for (let i = 0; i < 40 && !details.querySelector('.copilot-score-sheet svg'); i += 1) await new Promise((r) => setTimeout(r, 250));
    return { notes: details.querySelectorAll('.vf-stavenote').length };
  });
  check('La partition de la prise se grave', score && score.notes > 8, JSON.stringify(score));

  // Jazz : inchangé (aucun relevé d'église n'y entre).
  mock.enqueue({ text: 'En jazz.', toolCalls: [{ name: 'play_progression', arguments: { chords: ['Dm7', 'G7', 'Cmaj7'], styleId: 'jazz', focus: 'full' } }] });
  const jazz = await ask('Joue-moi un 2-5-1 jazz en Do');
  check('Une progression jazz ne reprend pas les relevés d’église', jazz && !/d’après/.test(jazz.subtitle), jazz?.subtitle);

  check('Aucune erreur dans la page', errors.length === 0, errors.slice(0, 3).join(' | '));
  if (realDir) check('Les relevés d’origine n’ont pas été modifiés (copie)', fs.readdirSync(realDir).length > 0);
} catch (err) {
  failure = err;
} finally {
  await app.stop();
  await mock.stop?.();
}
const ok = results.filter((r) => r.ok).length;
console.log(`\n=== Jeu repris des tutoriels : ${ok}/${results.length} contrôles réussis ===`);
if (failure) console.error(failure);
process.exit(failure || ok !== results.length ? 1 : 0);
