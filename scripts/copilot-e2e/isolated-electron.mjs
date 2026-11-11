// [Claude] — 2026-11-11 — Lance l'application Electron dans un bac à sable de données, pour les
// essais de bout en bout pilotés par le protocole de débogage (puppeteer-core).
//
// INCIDENT À NE PAS REPRODUIRE (10/11/2026) : des essais lancés sur le profil réel ont écrasé les
// vraies clés d'API par des valeurs factices. Ici, RIEN ne touche au profil ni aux données réels :
//   - HOME est remplacé : `os.homedir()` rend le dossier isolé, donc `~/PianoJazzChords`
//     (conversations, souvenirs, sessions, tutoriels) est un dossier neuf ;
//   - `--user-data-dir` : le profil Electron (localStorage, clés enregistrées) est un dossier neuf ;
//   - `--password-store=basic` : le trousseau du système n'est pas utilisé ;
//   - `--mute-audio` : aucun son ne sort pendant les essais ;
//   - un affichage virtuel (weston sans écran) : aucune fenêtre n'apparaît sur le bureau ;
//   - avant toute écriture, on DEMANDE à l'application où elle range ses données, et on arrête
//     tout si la réponse n'est pas le dossier isolé.
// L'application charge le build (`dist/`) : lancer `npm run build` avant un essai.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL_HOME = os.userInfo().homedir;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Refuse tout dossier qui pourrait être, contenir ou toucher les données réelles. */
export function assertIsolatedRoot(root) {
  // Chemin réel (revue indépendante) : un lien symbolique vers les données réelles est détecté.
  let resolved = path.resolve(root);
  let existing = resolved;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  try { resolved = path.join(fs.realpathSync(existing), path.relative(existing, resolved)); } catch (_) { /* chemin tel quel */ }
  const forbidden = [
    REAL_HOME,
    path.join(REAL_HOME, 'PianoJazzChords'),
    path.join(REAL_HOME, '.config'),
    path.join(REAL_HOME, '.config', 'piano-jazz-chords'),
    path.join(REAL_HOME, 'Documents'),
    REPO,
  ];
  for (const real of forbidden) {
    if (resolved === real) throw new Error(`Dossier d'essai refusé (dossier réel) : ${resolved}`);
  }
  for (const real of [path.join(REAL_HOME, 'PianoJazzChords'), path.join(REAL_HOME, '.config'), path.join(REAL_HOME, 'Documents'), REPO]) {
    if (resolved.startsWith(`${real}${path.sep}`)) throw new Error(`Dossier d'essai refusé (dans ${real}) : ${resolved}`);
  }
  if (!path.basename(resolved).startsWith('pjc-e2e')) throw new Error(`Le dossier d'essai doit s'appeler pjc-e2e… : ${resolved}`);
  return resolved;
}

async function waitForDebugger(port, child, timeoutMs = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Electron s'est arrêté au lancement (code ${child.exitCode}).`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (_) { /* pas encore prêt */ }
    await sleep(250);
  }
  throw new Error('Le port de débogage d\'Electron ne répond pas.');
}

/** Affichage virtuel : un compositeur Wayland sans écran, pour ne rien afficher sur le bureau réel. */
async function startVirtualDisplay({ base, width, height }) {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (!runtime) throw new Error('XDG_RUNTIME_DIR absent : affichage virtuel impossible.');
  const socket = `pjc-e2e-${process.pid}-${Date.now() % 100000}`;
  const out = fs.openSync(path.join(base, 'weston.log'), 'a');
  const weston = spawn('weston', ['--backend=headless', '--renderer=pixman', `--socket=${socket}`, `--width=${width}`, `--height=${height}`, '--idle-time=0'], { stdio: ['ignore', out, out] });
  const started = Date.now();
  while (!fs.existsSync(path.join(runtime, socket))) {
    if (weston.exitCode !== null) throw new Error(`L'affichage virtuel s'est arrêté (code ${weston.exitCode}) : voir weston.log.`);
    if (Date.now() - started > 10000) { weston.kill('SIGKILL'); throw new Error('L\'affichage virtuel ne démarre pas.'); }
    await sleep(100);
  }
  return { socket, stop: () => { if (weston.exitCode === null) weston.kill('SIGTERM'); fs.closeSync(out); } };
}

/**
 * Lance Electron isolé et rend la page de l'application.
 * @param {{root: string, debugPort?: number, headless?: boolean, width?: number, height?: number}} options
 *   headless : vrai (défaut) = affichage virtuel, aucune fenêtre sur le bureau ; faux = fenêtre réelle.
 */
export async function launchIsolatedApp({ root, debugPort = 9357, headless = true, width = 1920, height = 1080, profileCopyFrom = null, devServer = false } = {}) {
  const base = assertIsolatedRoot(root);
  const home = path.join(base, 'home');
  const profile = path.join(base, 'profile');
  fs.mkdirSync(home, { recursive: true });
  // [Claude] — 2026-11-12 — Essais avec les vraies clés, autorisés par Narcisse : on travaille sur une
  // COPIE de son profil (lecture seule de l'original), jamais sur le profil lui-même. Les clés y
  // restent chiffrées ; l'application les déchiffre par le trousseau du système, comme d'habitude.
  if (profileCopyFrom && !fs.existsSync(path.join(profile, 'Local Storage'))) {
    const skip = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'blob_storage', 'Shared Dictionary']);
    fs.cpSync(profileCopyFrom, profile, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !/Singleton/.test(path.basename(src)) });
    fs.writeFileSync(path.join(base, '.config-ecrite-par-essai'), 'copie du profil réel');
    fs.writeFileSync(path.join(base, '.copie-de-profil'), new Date().toISOString());
  }
  fs.mkdirSync(profile, { recursive: true });
  const copied = fs.existsSync(path.join(base, '.copie-de-profil'));
  if (!fs.existsSync(path.join(REPO, 'dist', 'index.html'))) throw new Error('dist/index.html absent : lancer `npm run build` d\'abord.');

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    // L'affichage reste celui de la session ; son autorisation se lit dans le vrai dossier personnel.
    XAUTHORITY: process.env.XAUTHORITY || path.join(REAL_HOME, '.Xauthority'),
    // devServer : pages servies par Vite (http://localhost:5173), l'origine où l'application de
    // développement range ses réglages ; nécessaire pour retrouver ceux d'une copie de profil.
    NODE_ENV: devServer ? 'development' : 'production',
    PJC_E2E: '1',
  };
  const display = headless ? await startVirtualDisplay({ base, width, height }) : null;
  if (display) { env.WAYLAND_DISPLAY = display.socket; delete env.DISPLAY; }
  const args = [
    '.',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    ...(copied ? [] : ['--password-store=basic']),
    '--mute-audio',
    '--no-first-run',
    ...(display ? ['--ozone-platform=wayland', '--disable-gpu'] : []),
  ];
  const log = fs.createWriteStream(path.join(base, 'electron.log'), { flags: 'a' });
  const child = spawn(path.join(REPO, 'node_modules', '.bin', 'electron'), args, { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      for (let i = 0; i < 20 && child.exitCode === null; i += 1) await sleep(150);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    display?.stop();
    log.end();
  };
  // Si le script d'essai est interrompu, l'application d'essai ne reste pas ouverte.
  const onExit = () => { try { child.kill('SIGKILL'); } catch (_) { /* déjà arrêtée */ } try { display?.stop(); } catch (_) { /* idem */ } };
  process.once('exit', onExit);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { onExit(); process.exit(1); });

  try {
    await waitForDebugger(debugPort, child);
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}`, defaultViewport: null });
    let page = null;
    for (let i = 0; i < 80 && !page; i += 1) {
      page = (await browser.pages()).find((p) => /index\.html|localhost:5173/.test(p.url())) || null;
      if (!page) await sleep(250);
    }
    if (!page) throw new Error('Fenêtre de l\'application introuvable.');
    await page.waitForFunction(() => Boolean(window.electronAPI?.files?.homeDir), { timeout: 30000 });

    // Garde-fou : où l'application range-t-elle ses données ? Rien n'a encore été écrit par l'essai.
    const reportedHome = await page.evaluate(() => window.electronAPI.files.homeDir());
    if (path.resolve(reportedHome) !== home) throw new Error(`ARRÊT : l'application utilise ${reportedHome} et non le dossier isolé ${home}.`);
    const storedConfig = await page.evaluate(() => localStorage.getItem('piano-jazz-ai-config'));
    const storedKeys = await page.evaluate(() => localStorage.getItem('piano-jazz-ai-keys'));
    if (storedConfig && !fs.existsSync(path.join(base, '.config-ecrite-par-essai'))) {
      throw new Error('ARRÊT : ce profil contient déjà une configuration d\'IA que l\'essai n\'a pas écrite.');
    }
    // Des clés enregistrées dans un profil d'essai ne viennent jamais de l'essai : on s'arrête.
    if (storedKeys && !copied) throw new Error('ARRÊT : ce profil d\'essai contient des clés enregistrées ; il ne vient pas de l\'essai.');
    await page.setViewport({ width, height }).catch(() => {});
    return { browser, page, child, home, profile, root: base, stop, hadKeys: Boolean(storedKeys) };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** Configure le faux fournisseur dans le profil isolé (clé de test en clair, jamais une vraie clé). */
export async function configureMockProvider(app, { baseUrl, model = 'mock-model' }) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(`${baseUrl}/`)) throw new Error('Le fournisseur d\'essai doit être local (127.0.0.1).');
  fs.writeFileSync(path.join(app.root, '.config-ecrite-par-essai'), new Date().toISOString());
  await app.page.evaluate((config) => {
    localStorage.setItem('piano-jazz-ai-config', JSON.stringify(config));
  }, { baseUrl, apiKey: 'cle-de-test-locale', model, monthlyCap: 50 });
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => Boolean(window.electronAPI?.files?.homeDir), { timeout: 30000 });
}
