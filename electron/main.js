import { app, BrowserWindow, ipcMain, session, dialog, desktopCapturer, safeStorage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import midi from '@julusian/midi';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
// [Claude 05/09] — Pédagogie IA : lecture d'un tutoriel à l'image. Les briques
// sont pures et partagées avec le rendu ; seule l'extraction des images vit ici,
// parce qu'elle a besoin de ffmpeg et doit travailler en flux pour que la
// mémoire n'enfle pas sur une vidéo longue.
import { createFrame } from '../src/pedagogie/frame.js';
import { detectVideoFormat } from '../src/pedagogie/format-detector.js';
import { readLitKeys } from '../src/pedagogie/key-detection.js';

// [OpenCode] — 2026-07-04 — Charge .env s'il existe (sans dépendance dotenv)
try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (fsSync.existsSync(envPath)) {
    const content = fsSync.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && value && !process.env[key]) {
        process.env[key] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch (e) { /* .env silencieux */ }

// [OpenCode] — 2026-07-04 — Désactivation de l'accélération GPU pour éviter les crashes sur certains environnements Linux.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
// [Refonte 2026-09-02] — Analyse en cours (verrou global, voir analyzer:process-file).
let analysisInFlight = null;
// Processus Python vivants : suivis pour être tués à la fermeture, afin qu'aucune
// analyse ne continue à consommer le CPU après la fermeture de la fenêtre.
const liveChildren = new Set();
let midiPollTimer = null;
let midiInput = null;
let currentInputId = null; // currently opened input port id
let currentInputName = null; // name used to reconnect after hot-plug

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f1117',
    title: 'Piano Jazz Chords',
    icon: path.join(__dirname, '../assets/icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // [Claude] — 2026-07-07 — Autorise la capture d'écran pour la fenêtre de l'application elle-même.
  // Sans ce gestionnaire, navigator.mediaDevices.getUserMedia({ chromeMediaSource: 'desktop' })
  // échoue avec NotAllowedError dans le renderer.
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const isOwnWindow = webContents.id === mainWindow.webContents.id;
    const isMedia = permission === 'media' || permission === 'display-capture' || permission === 'clipboard-sanitized-write';
    if (isOwnWindow && isMedia) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // [OpenCode] — 2026-07-04 — En développement, charge Vite HMR ; en production, charge le build dist.
  const isDev = process.env.NODE_ENV === 'development';
  const indexPath = path.join(__dirname, '../dist/index.html');
  const devUrl = 'http://localhost:5173/';
  if (isDev) {
    console.log('Loading renderer from Vite dev server:', devUrl);
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error('Failed to load Vite dev URL:', err.message);
    });
  } else {
    console.log('Loading renderer from:', indexPath);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load renderer:', err.message);
    });
  }

  // [Refonte 2026-09-02] — DevTools ne s'ouvrent PLUS automatiquement au
  // lancement, même en développement. Ils restent accessibles via le
  // raccourci clavier standard (Ctrl+Shift+I / Cmd+Option+I).

  mainWindow.on('close', async (e) => {
    try {
      const dirty = await mainWindow.webContents.executeJavaScript('window.__projectDirty || false');
      if (!dirty) return;
    } catch {
      return; // renderer not ready
    }
    e.preventDefault();
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Enregistrer', 'Ignorer', 'Annuler la fermeture'],
      defaultId: 0,
      cancelId: 2,
      title: 'Modifications non enregistrées',
      message: 'Des modifications d\'accords n\'ont pas été enregistrées.',
      detail: 'Les corrections manuelles seront perdues si vous ne les enregistrez pas.',
    });
    if (result.response === 0) {
      try {
        await mainWindow.webContents.executeJavaScript('window.__saveProjectBeforeClose()');
      } catch (saveErr) {
        console.error('[Main] save before close failed:', saveErr);
      }
      mainWindow.destroy();
    } else if (result.response === 1) {
      mainWindow.destroy();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    closeMidiInput();
  });
}

function sendMidiLog(type, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('midi-log', { type, data, time: Date.now() });
  }
}

let midiInputEnumerator = null;

// [Claude] — 2026-09-24 — Sortie MIDI (voir midi:open-output).
const VIRTUAL_OUTPUT_ID = 'virtual';
const VIRTUAL_OUTPUT_NAME = 'Piano Jazz Chords';
let midiOutput = null;

function getMidiOutputs() {
  if (nativeMidiFailed) return [];
  let enumerator = null;
  try {
    enumerator = new midi.Output();
    const outputs = [];
    for (let i = 0; i < enumerator.getPortCount(); i += 1) {
      const name = enumerator.getPortName(i);
      // Notre propre port virtuel ne doit pas se proposer à lui-même.
      if (!name.includes(VIRTUAL_OUTPUT_NAME)) outputs.push({ id: String(i), name });
    }
    if (process.platform !== 'win32') outputs.push({ id: VIRTUAL_OUTPUT_ID, name: `Port virtuel « ${VIRTUAL_OUTPUT_NAME} »`, virtual: true });
    return outputs;
  } catch (err) {
    console.error('[MIDI] sorties indisponibles :', err.message);
    return [];
  } finally {
    try { enumerator?.closePort(); } catch (e) { /* rien d'ouvert */ }
  }
}

/** Relâche tout sur la sortie (notes, pédale) puis la ferme. */
function closeMidiOutput() {
  if (!midiOutput) return;
  try {
    for (let channel = 0; channel < 16; channel += 1) {
      midiOutput.sendMessage([0xb0 + channel, 64, 0]);
      midiOutput.sendMessage([0xb0 + channel, 123, 0]);
    }
    midiOutput.closePort();
  } catch (e) {
    // Port déjà disparu : rien à relâcher.
  }
  midiOutput = null;
}

/** Ouvre la sortie `outputId` (index de port ou « virtual ») ; null ferme. */
function openMidiOutput(outputId) {
  closeMidiOutput();
  if (outputId == null || outputId === '') return { ok: true, id: null, name: null };
  try {
    midiOutput = new midi.Output();
    if (outputId === VIRTUAL_OUTPUT_ID) {
      midiOutput.openVirtualPort(VIRTUAL_OUTPUT_NAME);
      return { ok: true, id: outputId, name: `Port virtuel « ${VIRTUAL_OUTPUT_NAME} »` };
    }
    const index = Number(outputId);
    const name = midiOutput.getPortName(index);
    midiOutput.openPort(index);
    return { ok: true, id: outputId, name };
  } catch (err) {
    midiOutput = null;
    return { ok: false, id: null, error: err.message };
  }
}

let nativeMidiFailed = false;

// [OpenCode] — 2026-07-04 — Heuristic to skip internal/virtual ALSA ports when auto-connecting.
const VIRTUAL_PORT_NAMES = ['midi through', 'through', 'virmidi', 'client-', 'timidity', 'fluidsynth', 'pipewire'];
function isLikelyHardware(name) {
  const lower = name.toLowerCase();
  return !VIRTUAL_PORT_NAMES.some((v) => lower.includes(v));
}

function getMidiInputEnumerator() {
  if (nativeMidiFailed) return null;
  if (!midiInputEnumerator) {
    try {
      midiInputEnumerator = new midi.Input();
    } catch (err) {
      console.error('[MIDI] Failed to initialize native MIDI:', err.message);
      nativeMidiFailed = true;
      return null;
    }
  }
  return midiInputEnumerator;
}

function closeMidiInputEnumerator() {
  if (midiInputEnumerator) {
    try {
      midiInputEnumerator.closePort();
      midiInputEnumerator = null;
    } catch (e) {
      // ignore
    }
  }
}

// [Refonte 2026-09-02] — `quiet` : le scrutateur tourne toutes les 2 secondes.
// Sans ce drapeau il envoyait trois messages IPC par tour, en continu, pour
// répéter une liste de ports inchangée. On ne journalise plus que les scans
// demandés explicitement (rafraîchissement manuel, ouverture de port).
function getMidiInputs(quiet = false) {
  const input = getMidiInputEnumerator();
  if (!input) return [];
  const ports = [];
  const count = input.getPortCount();
  if (!quiet) sendMidiLog('scan', { count });
  for (let i = 0; i < count; i++) {
    const name = input.getPortName(i);
    if (!quiet) sendMidiLog('port', { id: i, name });
    ports.push({
      id: i,
      name,
    });
  }
  return ports;
}

// [Claude] — 2026-07-03 — Fermeture propre du port MIDI natif courant
function closeMidiInput() {
  if (midiInput) {
    try {
      midiInput.closePort();
    } catch (e) {
      // ignore
    }
    midiInput = null;
    currentInputId = null;
    currentInputName = null;
  }
}

// [Claude] — 2026-07-03 — Ouverture d'un port MIDI natif avec suivi de l'id courant
// [OpenCode] — 2026-07-04 — Retourne maintenant { success, portId, name } pour que le renderer
// puisse afficher le bon périphérique et reconnecter par nom en cas de hot-plug.
function openMidiInput(portId) {
  console.log('[MIDI] openMidiInput called for port', portId);
  closeMidiInput();
  // [OpenCode] — 2026-07-03 — Close the enumerator while a port is open to avoid ALSA conflicts
  // where the enumerator cannot see the same port that is currently in use.
  closeMidiInputEnumerator();
  const candidate = new midi.Input();
  let name = '';
  try {
    candidate.openPort(portId);
    name = candidate.getPortName(portId) || '';
    console.log('[MIDI] port opened successfully:', portId, name);
  } catch (err) {
    // [OpenCode] — 2026-09-05 — Fuite ALSA corrigée : le constructeur de midi.Input ouvre
    // un client ALSA séquenceur DÈS SA CRÉATION. Si openPort échoue, poser `midiInput = null`
    // sans refermer laissait un client « RtMidi Input Client » orphelin. Le scrutateur
    // réessaie toutes les 2 s : les clients s'accumulaient jusqu'à l'ENOMEM du séquenceur
    // (« Cannot allocate memory » sur /dev/snd/seq) et PLUS AUCUN périphérique n'était
    // détecté, même rebranché — mesuré : 61 fds /dev/snd/seq ouverts par le processus
    // principal après quelques heures. On referme donc le client à chaque échec.
    console.error('[MIDI] openPort failed:', err.message);
    try { candidate.closePort(); } catch (_) { /* déjà fermé */ }
    return { success: false, error: err.message };
  }
  midiInput = candidate;
  midiInput.on('message', (deltaTime, message) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [status, data1, data2] = message;
    const cmd = status >> 4;
    const channel = status & 0x0f;

    sendMidiLog('message', { status, data1, data2, cmd, channel });

    if (channel === 9) return; // ignore drums channel

    if (cmd === 0x8 || (cmd === 0x9 && data2 === 0)) {
      mainWindow.webContents.send('midi-note-off', { note: data1 });
    } else if (cmd === 0x9) {
      mainWindow.webContents.send('midi-note-on', { note: data1, velocity: data2 / 127 });
    } else if (cmd === 0xb && data1 === 64) {
      mainWindow.webContents.send('midi-sustain', { value: data2 >= 64 });
    } else if (cmd === 0xb && data1 === 1) {
      mainWindow.webContents.send('midi-mod-wheel', { value: data2 / 127 });
    } else if (cmd === 0xe) {
      const bend = (data2 * 128 + data1 - 8192) / 8192;
      mainWindow.webContents.send('midi-pitch-wheel', { value: bend });
    }
  });
  currentInputId = portId;
  currentInputName = name;
  sendMidiLog('open', { portId, name });
  return { success: true, portId, name };
}

// [OpenCode] — 2026-07-04 — Auto-connect to a real hardware input if none is open yet.
function autoOpenHardwareInput(inputs) {
  if (midiInput) return null; // already connected
  const hardware = inputs.filter((i) => isLikelyHardware(i.name));
  const preferred = hardware.find((i) =>
    /usb|piano|keyboard|mpk|midi|key|synth|controller/i.test(i.name),
  ) || hardware[0];
  if (preferred) {
    console.log('[MIDI] auto-connecting to', preferred.id, preferred.name);
    const result = openMidiInput(preferred.id);
    if (result.success) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('midi-device-connected', { portId: preferred.id, name: preferred.name });
      }
      return result;
    }
  }
  return null;
}

// [OpenCode] — 2026-07-04 — When the current port disappears, try to reconnect to a port with the same name.
function reconnectByName(inputs) {
  if (!currentInputName || midiInput) return null;
  const match = inputs.find((i) => i.name === currentInputName && i.id !== currentInputId);
  if (match) {
    console.log('[MIDI] reconnecting by name to', match.id, match.name);
    const result = openMidiInput(match.id);
    if (result.success && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('midi-device-connected', { portId: match.id, name: match.name });
    }
    return result;
  }
  return null;
}

function userAudioGroups() {
  const userInfo = os.userInfo();
  const groups = process.getgroups?.() || [];
  const names = groups.map((gid) => {
    try { return os.userInfo({ gid }).username; } catch { return String(gid); }
  });
  return {
    username: userInfo.username,
    groups: names,
    inAudio: names.includes('audio') || groups.includes(29),
  };
}

function requestMidiPermission() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'midi' || permission === 'midiSysex';
  });
}

let lastSeenInputs = [];

function inputsChanged(a, b) {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return true;
  }
  return false;
}

// [Claude] — 2026-07-03 — API système de fichiers pour le Module 2 (sessions d'enregistrement)
function setupFileSystemIPC() {
  const homeDir = os.homedir();

  ipcMain.handle('files:home-dir', () => homeDir);

  ipcMain.handle('files:ensure-dir', async (event, dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  });

  ipcMain.handle('files:read-dir', async (event, dirPath) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() }));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  });

  ipcMain.handle('files:write-file', async (event, filePath, content) => {
    let data = content;
    if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content);
    } else if (typeof content === 'object' && content !== null && !(content instanceof Uint8Array)) {
      data = JSON.stringify(content);
    }
    await fs.writeFile(filePath, data);
    return true;
  });

  ipcMain.handle('files:read-file', async (event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  });

  ipcMain.handle('files:read-binary', async (event, filePath) => {
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  });

  ipcMain.handle('files:write-binary', async (event, filePath, data) => {
    let buffer = data;
    if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (Array.isArray(data)) {
      buffer = Buffer.from(data);
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    await fs.writeFile(filePath, buffer);
    return true;
  });

  ipcMain.handle('files:exists', async (event, filePath) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('files:delete-dir', async (event, dirPath) => {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle('files:delete-file', async (event, filePath) => {
    await fs.rm(filePath, { force: true });
    return true;
  });

  ipcMain.handle('files:save-dialog', async (event, options = {}) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.defaultPath || 'analysis.mid',
      filters: options.filters || [
        { name: 'Fichier MIDI', extensions: ['mid'] },
        { name: 'Tous les fichiers', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('files:stat', async (event, filePath) => {
    try {
      const st = await fs.stat(filePath);
      return { size: st.size, mtimeMs: st.mtimeMs, isFile: st.isFile(), isDirectory: st.isDirectory() };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  });

  ipcMain.handle('files:rename', async (event, oldPath, newPath) => {
    await fs.rename(oldPath, newPath);
    return true;
  });
}

const STUDIO_DIR_NAME = 'PianoJazzChords/Studio';
const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];

// [Refonte 2026-09-02] — Dossier de travail de l'analyse et de la lecture.
//
// Ces dossiers contenaient des WAV décompressés (37 Mo pour 1 min 26 d'audio)
// écrits dans os.tmpdir(). Sur cette machine — et sur la plupart des Linux
// récents — /tmp est un **tmpfs, donc de la RAM** : 69 dossiers oubliés
// pesaient 3,2 Go de mémoire vive, ce qui explique à lui seul le
// « le PC devient extrêmement lent ». On écrit désormais sur le disque réel,
// à côté des données de l'application, et on ne conserve que le dossier
// courant.
const WORK_DIR_NAME = 'PianoJazzChords/.work';

function getWorkRoot() {
  return path.join(os.homedir(), WORK_DIR_NAME);
}

/**
 * Crée un dossier de travail et supprime tous les précédents.
 * Un seul dossier vit à la fois : celui du morceau en cours.
 * @param {string} prefix — 'analyze' ou 'playback'
 */
async function createWorkDir(prefix) {
  const root = getWorkRoot();
  await fs.mkdir(root, { recursive: true });
  const dir = path.join(root, `${prefix}-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  await purgeWorkDirs(dir);
  return dir;
}

/** Supprime les dossiers de travail sauf celui qu'on vient de créer. */
async function purgeWorkDirs(keepDir = null) {
  const root = getWorkRoot();
  try {
    const entries = await fs.readdir(root);
    await Promise.all(entries.map(async (name) => {
      const full = path.join(root, name);
      if (keepDir && full === keepDir) return;
      await fs.rm(full, { recursive: true, force: true }).catch(() => {});
    }));
  } catch {
    /* dossier absent : rien à purger */
  }
}

/**
 * Purge les dossiers temporaires laissés par les versions précédentes dans
 * os.tmpdir() (`pjc-analyze-*`, `pjc-playback-*`). Ils n'étaient jamais
 * supprimés ; sur un /tmp en tmpfs ils immobilisent de la RAM tant que la
 * machine n'a pas redémarré.
 */
async function purgeLegacyTempDirs() {
  const tmp = os.tmpdir();
  try {
    const entries = await fs.readdir(tmp);
    const stale = entries.filter((n) => n.startsWith('pjc-analyze-') || n.startsWith('pjc-playback-'));
    if (!stale.length) return;
    let freed = 0;
    for (const name of stale) {
      const full = path.join(tmp, name);
      try {
        for (const f of await fs.readdir(full)) {
          const st = await fs.stat(path.join(full, f)).catch(() => null);
          if (st?.isFile()) freed += st.size;
        }
      } catch { /* taille indisponible : on supprime quand même */ }
      await fs.rm(full, { recursive: true, force: true }).catch(() => {});
    }
    console.log(`[Cleanup] ${stale.length} dossier(s) temporaire(s) hérité(s) supprimé(s)`
      + ` (${(freed / 1024 / 1024).toFixed(0)} Mo).`);
  } catch {
    /* ignore */
  }
}

// [Claude] — 2026-07-08 — Si un fichier importé dans l'onglet Analyse correspond
// à un morceau déjà séparé dans le Studio, on utilise le stem piano isolé pour
// l'analyse. Cela améliore nettement la qualité par rapport au mix complet.
async function findStudioPianoStemForFile(filePath) {
  const studioDir = getStudioDir();
  try {
    const entries = await fs.readdir(studioDir, { withFileTypes: true });
    const realFilePath = await fs.realpath(filePath).catch(() => filePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const trackDir = path.join(studioDir, entry.name);
      const files = await fs.readdir(trackDir);
      const originalFile = files.find((f) => f.startsWith('original.'));
      if (!originalFile) continue;
      const originalPath = path.join(trackDir, originalFile);
      const realOriginalPath = await fs.realpath(originalPath).catch(() => originalPath);
      if (realFilePath !== realOriginalPath) continue;
      const pianoStem = path.join(trackDir, 'stems', 'piano.wav');
      try {
        await fs.access(pianoStem);
        return pianoStem;
      } catch {
        return null;
      }
    }
  } catch (e) {
    // ignore: le dossier Studio peut ne pas exister.
  }
  return null;
}

async function findStudioBassStemForFile(filePath) {
  const studioDir = getStudioDir();
  try {
    const entries = await fs.readdir(studioDir, { withFileTypes: true });
    const realFilePath = await fs.realpath(filePath).catch(() => filePath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const trackDir = path.join(studioDir, entry.name);
      const files = await fs.readdir(trackDir);
      const originalFile = files.find((f) => f.startsWith('original.'));
      if (!originalFile) continue;
      const originalPath = path.join(trackDir, originalFile);
      const realOriginalPath = await fs.realpath(originalPath).catch(() => originalPath);
      if (realFilePath !== realOriginalPath) continue;
      const bassStem = path.join(trackDir, 'stems', 'bass.wav');
      try {
        await fs.access(bassStem);
        return bassStem;
      } catch {
        return null;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// [OpenCode] — 2026-07-04 — Utilise le venv local s'il existe, sinon python3.
function getVenvPythonPath() {
  const venvPython = path.join(__dirname, '..', '.venv', 'bin', 'python');
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  }
  return venvPython;
}

function getPythonCommand() {
  const venvPath = getVenvPythonPath();
  try {
    fsSync.accessSync(venvPath);
    return venvPath;
  } catch {
    return 'python3';
  }
}

/**
 * Suit un processus enfant pour pouvoir le tuer à la fermeture de l'application.
 * Sans cela, une analyse lancée puis abandonnée continue à saturer un cœur.
 */
function trackChild(proc) {
  liveChildren.add(proc);
  const forget = () => liveChildren.delete(proc);
  proc.on('exit', forget);
  proc.on('error', forget);
  return proc;
}

/** Tue tous les processus Python encore vivants (fermeture de l'application). */
function killLiveChildren() {
  for (const proc of liveChildren) {
    try { proc.kill('SIGTERM'); } catch { /* déjà mort */ }
  }
  liveChildren.clear();
}

function runAudioProcessor(args, onProgress = null) {
  return new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [
      path.join(__dirname, 'audio-processor.py'),
      ...args,
    ], { shell: false }));

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      if (onProgress && mainWindow && !mainWindow.isDestroyed()) {
        const match = text.match(/waveform progress:\s*(\d{1,3})%/);
        if (match) onProgress(Number(match[1]));
      }
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `audio-processor exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function extractTrackAudio(inputPath, outputWav) {
  await runAudioProcessor(['extract', inputPath, outputWav]);
  return outputWav;
}

async function generateWaveform(wavPath, onProgress = null) {
  const json = await runAudioProcessor(['waveform', wavPath], onProgress);
  return JSON.parse(json.split('\n').filter(Boolean).pop());
}

// [OpenCode] — 2026-08-24 — EXP-027 Tâche 4 : IPC pour l'extraction de mélodie
// depuis un stem audio (vocals/piano/other) via melody_extractor.py (librosa.pyin).
// Retourne {notes: [{midi, start, end, confidence}], sr, duration, n_notes}.
function runMelodyExtractor(stemPath, options = {}) {
  return new Promise((resolve, reject) => {
    const args = [path.join(__dirname, 'melody_extractor.py'), stemPath];
    if (options.fmin) args.push('--fmin', String(options.fmin));
    if (options.fmax) args.push('--fmax', String(options.fmax));
    const proc = trackChild(spawn(getPythonCommand(), args, { shell: false }));
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `melody_extractor exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (err) {
        reject(new Error(`melody_extractor: JSON invalide — ${err.message}`));
      }
    });
  });
}

async function pitchShiftRegion(inputWav, outputWav, semitones, startSec, endSec) {
  await runAudioProcessor([
    'pitch-shift',
    inputWav,
    outputWav,
    String(semitones),
    String(startSec),
    endSec !== null ? String(endSec) : '',
  ]);
  return outputWav;
}

async function mixStemsToMaster(stemPaths, outputWav) {
  await runAudioProcessor(['mix-stems', stemPaths.join(','), outputWav]);
  return outputWav;
}

async function runBassAnalysis(analysisWav, chordsData, tmpDir) {
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const paramsPath = path.join(__dirname, '..', 'fusion_params.json');
  const candidatesJson = path.join(tmpDir, 'candidates.json');
  const chordsJson = path.join(tmpDir, 'chords.json');
  const segmentsJson = path.join(tmpDir, 'fusion_segments.json');

  // Save chords data to temp file for Fusion Engine
  await fs.writeFile(chordsJson, JSON.stringify(chordsData));

  // Step 1: export BE candidates
  await new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [
      path.join(scriptsDir, 'export_bass_candidates.py'),
      '--wav', analysisWav,
      '--output', candidatesJson,
    ], { shell: false }));
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) return reject(new Error(stderr || `export_bass_candidates failed (code ${code})`));
      resolve();
    });
  });

  // Step 2: run Fusion Engine
  await new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [
      path.join(scriptsDir, 'fusion_bass_chord.py'),
      '--candidates', candidatesJson,
      '--chords', chordsJson,
      '--params', paramsPath,
      '--output-segments', segmentsJson,
    ], { shell: false }));
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) return reject(new Error(stderr || `fusion_bass_chord failed (code ${code})`));
      resolve();
    });
  });

  // Parse and return segments
  const segContent = await fs.readFile(segmentsJson, 'utf-8');
  return JSON.parse(segContent).segments || [];
}

async function convertWebmToMp4(inputWebm, outputMp4) {
  await runAudioProcessor(['convert-webm-to-mp4', inputWebm, outputMp4]);
  return outputMp4;
}

function getStudioDir() {
  return path.join(os.homedir(), STUDIO_DIR_NAME);
}

async function ensureStudioDir() {
  const dir = getStudioDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function createSilentWav(durationSec = 1) {
  // Minimal valid WAV file : PCM 16-bit 44100 Hz mono silence
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function createBeepWav(durationSec = 1, freq = 440) {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  const view = new DataView(buffer.buffer, buffer.byteOffset + 44, dataSize);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
    view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }
  return buffer;
}

async function demucsInstalled() {
  return new Promise((resolve) => {
    const proc = spawn(getPythonCommand(), ['-c', 'import demucs'], { shell: false });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

// [Claude] — 2026-09-06 — Pédagogie IA v2 : reconnaissance vocale locale.
//
// Même principe que Demucs : une dépendance Python facultative, téléchargée une
// fois, qui tourne hors ligne. UNE DIFFÉRENCE ESSENTIELLE avec Demucs, et elle
// est délibérée : quand Demucs manque, l'application fabrique des stems simulés
// (des bips) pour que la chaîne ne casse pas — c'est acceptable pour un signal
// de test. Ici, un texte fabriqué serait un mensonge pédagogique. Quand
// faster-whisper manque, on le DIT ; on n'invente pas la parole du professeur.

/** faster-whisper est-il installé dans l'interpréteur Python utilisé ? */
async function transcriberInstalled() {
  return new Promise((resolve) => {
    const proc = spawn(getPythonCommand(), ['-c', 'import faster_whisper'], { shell: false });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

// [OpenCode] — 2026-09-07 — V2N (visual piano transcription) : optionnel.
// V2N dépend d'un venv spécifique (.venv) ET du fichier poids
// electron/v2n-deps/v2n_pianovam.safetensors. On vérifie les deux.
const V2N_MODEL_PATH = path.join(__dirname, 'v2n-deps', 'v2n_pianovam.safetensors');

// [Claude] — 2026-09-25 — Narcisse : « l'application ne peut pas analyser l'image, et je
// ne sais pas pourquoi ; pourtant j'ai installé ce qu'il fallait ». La raison
// n'était jamais dite. Diagnostic précis : poids absents, poids restés à l'état
// de pointeur Git LFS (134 octets au lieu de 113 Mo : `git lfs pull`), paquets
// Python manquants (nommés, avec la commande d'installation).
const V2N_PACKAGES = { torch: 'torch', torchvision: 'torchvision', cv2: 'opencv-python-headless', numpy: 'numpy', safetensors: 'safetensors', scipy: 'scipy' };

function missingPythonModules(modules) {
  const script = `import importlib.util, json; print(json.dumps([m for m in ${JSON.stringify(modules)} if importlib.util.find_spec(m) is None]))`;
  return new Promise((resolve) => {
    let out = '';
    const proc = spawn(getPythonCommand(), ['-c', script], { shell: false });
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('error', () => resolve({ python: false, missing: modules }));
    proc.on('exit', () => {
      try { resolve({ python: true, missing: JSON.parse(out.trim().split('\n').pop() || '[]') }); } catch { resolve({ python: true, missing: modules }); }
    });
  });
}

async function v2nStatus() {
  let size = 0;
  try {
    size = fsSync.statSync(V2N_MODEL_PATH).size;
  } catch {
    return { available: false, reason: 'model-missing', detail: V2N_MODEL_PATH };
  }
  if (size < 1024 * 1024) {
    let head = '';
    try { head = fsSync.readFileSync(V2N_MODEL_PATH, 'utf8').slice(0, 60); } catch { /* lecture impossible */ }
    if (/git-lfs/.test(head)) return { available: false, reason: 'model-lfs-pointer', detail: `${size} octets` };
    return { available: false, reason: 'model-missing', detail: `${size} octets` };
  }
  const { python, missing } = await missingPythonModules(Object.keys(V2N_PACKAGES));
  if (!python) return { available: false, reason: 'python-missing', detail: getPythonCommand() };
  if (missing.length) {
    const packages = missing.map((m) => V2N_PACKAGES[m] || m);
    return { available: false, reason: 'missing-packages', detail: packages.join(', '), packages };
  }
  return { available: true };
}

async function v2nInstalled() {
  return (await v2nStatus()).available;
}

/**
 * [Claude] — 2026-09-25 — Lance un script Python de electron/ et lit le JSON de la
 * dernière ligne de stdout (même contrat que piano-vision.py et transcriber.py).
 */
function runPythonJson(script, args) {
  return new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [path.join(__dirname, script), ...args], { shell: false }));
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error(stderr || `${script} exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new Error(`${script} : JSON invalide — ${err.message}`));
      }
    });
  });
}

/**
 * Lance electron/piano-vision.py et lit le JSON de sa dernière ligne de stdout.
 * Le script sort toujours avec le code 0 ; la raison métier est dans le JSON.
 */
function runPianoVision(args) {
  return new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [
      path.join(__dirname, 'piano-vision.py'),
      ...args,
    ], { shell: false }));

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error(stderr || `piano-vision exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new Error(`piano-vision: JSON invalide — ${err.message}`));
      }
    });
  });
}

/**
 * Lance electron/transcriber.py et lit le JSON de sa dernière ligne de stdout.
 * Même contrat que runAudioProcessor, avec une tolérance en plus : le script
 * sort avec le code 0 même en cas d'échec métier, la raison étant portée par le
 * JSON. On lit donc le JSON avant de conclure à une panne.
 */
function runTranscriber(args) {
  return new Promise((resolve, reject) => {
    const proc = trackChild(spawn(getPythonCommand(), [
      path.join(__dirname, 'transcriber.py'),
      ...args,
    ], { shell: false }));

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error(stderr || `transcriber exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new Error(`transcriber: JSON invalide — ${err.message}`));
      }
    });
  });
}

// Dossier de travail PROPRE à la transcription, et c'est volontaire.
// createWorkDir() purge tous les autres dossiers du même racine à chaque appel
// (« un seul dossier vit à la fois »). La transcription tourne en parallèle de
// l'analyse d'accords : partager la racine reviendrait à ce que l'une efface le
// WAV de l'autre en pleine lecture. Deux racines, deux purges indépendantes.
const TRANSCRIBE_DIR_NAME = 'PianoJazzChords/.work-transcribe';

async function createTranscribeDir() {
  const root = path.join(os.homedir(), TRANSCRIBE_DIR_NAME);
  await fs.mkdir(root, { recursive: true });
  const dir = path.join(root, `transcribe-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const entries = await fs.readdir(root);
    await Promise.all(entries.map(async (name) => {
      const full = path.join(root, name);
      if (full === dir) return;
      await fs.rm(full, { recursive: true, force: true }).catch(() => {});
    }));
  } catch {
    /* dossier absent : rien à purger */
  }
  return dir;
}

async function runDemucs(trackId, inputPath) {
  const studioDir = await ensureStudioDir();
  const trackDir = path.join(studioDir, trackId);
  const stemsDir = path.join(trackDir, 'stems');
  await fs.mkdir(stemsDir, { recursive: true });

  const outputDir = path.join(trackDir, 'demucs_out');
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn(getPythonCommand(), [
      path.join(__dirname, 'demucs-wrapper.py'),
      outputDir,
      inputPath,
    ], { shell: false });

    let stderr = '';
    let lastPercent = 0;
    let startTime = Date.now();

    function sendProgress(percent, fallback = false) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('studio:separation-progress', { trackId, percent, fallback });
      }
    }

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      stderr += line;
      // tqdm progress bars are printed to stderr, e.g.:
      // "  45%|█████     | 45.0/100.0 [00:14<00:17, 3.5seconds/s]"
      const match = line.match(/\s*(\d{1,3})%\|.*?\|\s*[\d.]+\/([\d.]+)/);
      if (match) {
        const percent = Math.min(100, Math.max(0, Number(match[1])));
        if (percent > lastPercent) {
          lastPercent = percent;
          sendProgress(percent);
        }
      }
    });

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      console.log('[Demucs]', line.trim());
      const match = line.match(/\s*(\d{1,3})%\|.*?\|\s*[\d.]+\/([\d.]+)/);
      if (match) {
        const percent = Math.min(100, Math.max(0, Number(match[1])));
        if (percent > lastPercent) {
          lastPercent = percent;
          sendProgress(percent);
        }
      }
    });

    // Fallback progress: send elapsed time as a fake percent so the UI
    // never appears frozen when Demucs does not emit tqdm lines.
    const fallbackInterval = setInterval(() => {
      if (lastPercent < 100) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        sendProgress(lastPercent, true);
      }
    }, 1000);

    proc.on('error', (err) => {
      clearInterval(fallbackInterval);
      reject(err);
    });
    proc.on('exit', async (code) => {
      clearInterval(fallbackInterval);
      if (code !== 0) {
        reject(new Error(stderr || `Demucs exited with code ${code}`));
        return;
      }
      try {
        // The wrapper uses htdemucs_6s, which produces 6 stems.
        // htdemucs_6s writes files directly under outputDir/\u003cmodel\u003e/\u003cstem\u003e.wav
        const modelDir = path.join(outputDir, 'htdemucs_6s');
        const files = await fs.readdir(modelDir);
        // Clean old stems first so simulated files don't shadow real ones.
        for (const stem of STEMS) {
          try {
            await fs.rm(path.join(stemsDir, `${stem}.wav`), { force: true });
          } catch (e) {
            // ignore
          }
        }
        for (const file of files) {
          const rawStem = file.replace(/\.wav$/i, '');
          // htdemucs_6s has 6 stems; guitar is merged into other for our UI.
          const stem = rawStem === 'guitar' ? 'other' : rawStem;
          if (STEMS.includes(stem)) {
            const src = path.join(modelDir, file);
            const dst = path.join(stemsDir, `${stem}.wav`);
            await fs.copyFile(src, dst);
          }
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function createSimulatedStems(trackId) {
  const studioDir = await ensureStudioDir();
  const stemsDir = path.join(studioDir, trackId, 'stems');
  await fs.mkdir(stemsDir, { recursive: true });

  const freqs = { bass: 80, drums: 200, vocals: 440, other: 660, piano: 880 };
  for (const stem of STEMS) {
    const wav = await createBeepWav(2, freqs[stem]);
    await fs.writeFile(path.join(stemsDir, `${stem}.wav`), wav);
  }
}

function setupStudioIPC() {
  console.log('[StudioIPC] registering studio handlers...');
  ipcMain.handle('studio:select-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer un morceau',
      properties: ['openFile'],
      filters: [
        { name: 'Formats supportés (MP3, WAV, M4A, MP4)', extensions: ['mp3', 'wav', 'm4a', 'mp4'] },
      ],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  // [OpenCode] — Filtres stricts Audio / Vidéo pour l'onglet Analyse.
  ipcMain.handle('studio:select-audio-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer un fichier audio',
      properties: ['openFile'],
      filters: [
        { name: 'Fichiers audio (MP3, WAV, M4A)', extensions: ['mp3', 'wav', 'm4a'] },
      ],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('studio:select-video-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer une vidéo',
      properties: ['openFile'],
      filters: [
        { name: 'Fichiers vidéo (MP4)', extensions: ['mp4'] },
      ],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('studio:separate', async (event, trackId, inputPath) => {
    console.log('[Studio] separation requested for', trackId, inputPath);
    try {
      const installed = await demucsInstalled();
      console.log('[Studio] demucs installed:', installed);
      if (installed) {
        await runDemucs(trackId, inputPath);
        console.log('[Studio] demucs separation done for', trackId);
        return { success: true, simulated: false };
      }
      await createSimulatedStems(trackId);
      return { success: true, simulated: true };
    } catch (err) {
      console.error('[Studio] separation failed:', err);
      // Fallback to simulated stems so tests can continue
      await createSimulatedStems(trackId);
      return { success: true, simulated: true, error: err.message };
    }
  });

  ipcMain.handle('studio:is-separated', async (event, trackId) => {
    const studioDir = await ensureStudioDir();
    for (const stem of STEMS) {
      try {
        await fs.access(path.join(studioDir, trackId, 'stems', `${stem}.wav`));
      } catch {
        return false;
      }
    }
    return true;
  });

  ipcMain.handle('studio:get-stems', async (event, trackId) => {
    const studioDir = await ensureStudioDir();
    const paths = {};
    for (const stem of STEMS) {
      const p = path.join(studioDir, trackId, 'stems', `${stem}.wav`);
      try {
        await fs.access(p);
        paths[stem] = p;
      } catch {
        paths[stem] = null;
      }
    }
    return paths;
  });

  // [OpenCode] — 2026-07-04 — Audio extraction, waveform and pitch-shift IPCs.
  ipcMain.handle('studio:extract-audio', async (event, trackId, inputPath) => {
    const studioDir = await ensureStudioDir();
    const trackDir = path.join(studioDir, trackId);
    await fs.mkdir(trackDir, { recursive: true });
    const outputWav = path.join(trackDir, 'audio.wav');
    await extractTrackAudio(inputPath, outputWav);
    return outputWav;
  });

  console.log('[StudioIPC] registering studio:trim-region handler');
  ipcMain.handle('studio:trim-region', async (event, trackId, inputPath, startSec, endSec) => {
    console.log('[StudioIPC] trim-region called for', trackId, inputPath, startSec, endSec);
    const studioDir = await ensureStudioDir();
    const tempDir = path.join(studioDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const outputWav = path.join(tempDir, `${trackId}_region_${Date.now()}.wav`);
    await runAudioProcessor(['trim', inputPath, outputWav, String(startSec), String(endSec)]);
    return outputWav;
  });

  ipcMain.handle('studio:generate-waveform', async (event, wavPath) => {
    const trackId = path.basename(path.dirname(wavPath));
    return await generateWaveform(wavPath, (percent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('studio:waveform-progress', { trackId, percent });
      }
    });
  });

  ipcMain.handle('studio:pitch-shift', async (event, trackId, semitones, startSec, endSec, useStems) => {
    const studioDir = await ensureStudioDir();
    const trackDir = path.join(studioDir, trackId);
    const tempWav = path.join(trackDir, `shifted_${Date.now()}.wav`);

    let inputWav = path.join(trackDir, 'audio.wav');
    if (useStems) {
      const stemPaths = [];
      for (const stem of STEMS) {
        const p = path.join(trackDir, 'stems', `${stem}.wav`);
        try {
          await fs.access(p);
          stemPaths.push(p);
        } catch {
          // missing stem
        }
      }
      if (stemPaths.length > 0) {
        inputWav = path.join(trackDir, 'stems_master.wav');
        await mixStemsToMaster(stemPaths, inputWav);
      }
    }

    await pitchShiftRegion(inputWav, tempWav, semitones, startSec, endSec);
    return tempWav;
  });

  ipcMain.handle('studio:pitch-shift-stems', async (event, trackId, semitones, startSec, endSec, stemPathsMap) => {
    const studioDir = await ensureStudioDir();
    const trackDir = path.join(studioDir, trackId);
    const outputDir = path.join(trackDir, `shifted_stems_${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Clean up older shifted stem folders to avoid accumulation.
    try {
      const entries = await fs.readdir(trackDir);
      for (const entry of entries) {
        if (entry.startsWith('shifted_stems_')) {
          const fullPath = path.join(trackDir, entry);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          }
        }
      }
    } catch (e) {
      // ignore cleanup errors
    }

    const json = JSON.stringify(stemPathsMap);
    const resultJson = await runAudioProcessor([
      'pitch-shift-stems',
      json,
      outputDir,
      String(semitones),
      String(startSec),
      endSec !== null ? String(endSec) : '',
    ]);

    const resultLines = resultJson.split('\n').filter(Boolean);
    const result = JSON.parse(resultLines[resultLines.length - 1]);
    return result;
  });

  ipcMain.handle('studio:cleanup-shifted', async (event, trackId) => {
    const studioDir = await ensureStudioDir();
    const trackDir = path.join(studioDir, trackId);
    try {
      const entries = await fs.readdir(trackDir);
      for (const entry of entries) {
        if (entry.startsWith('shifted_') && entry.endsWith('.wav')) {
          await fs.rm(path.join(trackDir, entry), { force: true });
        }
      }
    } catch (e) {
      // ignore
    }
    return true;
  });

  // [Claude] — 2026-07-08 — Analyse audio automatique pour l'onglet Analyse.
  // Extrait la piste audio du fichier importé, lance analyze-chords, retourne la grille enrichie.
  // Si le fichier a déjà été séparé dans le Studio, on analyse le stem piano isolé
  // pour plus de précision, tout en conservant le mix original pour la lecture.
  // Prépare uniquement l'audio de lecture, sans analyse harmonique.
  // Utilisé au rechargement d'un morceau déjà analysé : le résultat d'analyse
  // vient du fichier .pjc.json, seul le WAV de lecture doit être régénéré
  // (quelques secondes d'ffmpeg contre une analyse complète bien plus longue).
  ipcMain.handle('analyzer:prepare-playback', async (event, filePath) => {
    const tmpDir = await createWorkDir('playback');
    const playbackWav = path.join(tmpDir, 'audio.wav');

    let duration = null;
    try {
      const probeJson = await runAudioProcessor(['probe', filePath]);
      const probeLines = probeJson.split('\n').filter(Boolean);
      duration = JSON.parse(probeLines[probeLines.length - 1]).duration;
    } catch (probeErr) {
      console.warn('[Analyzer] probe duration failed:', probeErr.message);
    }

    await extractTrackAudio(filePath, playbackWav);
    return { wavPath: playbackWav, duration };
  });

  // [OpenCode] — 2026-08-24 — EXP-027 Tâche 4 : extraction de mélodie depuis un
  // stem audio séparé (Demucs). Reçoit un chemin de stem WAV (typiquement
  // vocals.wav d'un morceau déjà séparé dans le Studio) et retourne les notes
  // de la mélodie. Le branchement vers MelodyTrack se fait côté renderer.
  ipcMain.handle('reharm:extract-melody', async (event, stemPath, options = {}) => {
    if (!stemPath || typeof stemPath !== 'string') {
      throw new Error('reharm:extract-melody : chemin de stem requis');
    }
    try {
      await fs.access(stemPath);
    } catch {
      throw new Error(`reharm:extract-melody : stem introuvable : ${stemPath}`);
    }
    return await runMelodyExtractor(stemPath, options);
  });

  // [Refonte 2026-09-02] — Verrou d'analyse : une seule analyse à la fois.
  //
  // Sans ce verrou, chaque déclenchement lançait un pipeline complet — ffmpeg,
  // librosa, le moteur de basse, trois processus Python et un WAV décompressé.
  // Les traces laissées dans /tmp montrent jusqu'à 25 analyses démarrées en
  // 30 secondes (18 ms d'écart entre deux : la répétition clavier d'un bouton
  // resté focusable sous l'overlay). Le renderer se garde aussi de son côté ;
  // ce verrou-ci est le filet de sécurité, il ne peut pas être contourné.
  // [Claude 05/09] — Pédagogie IA : analyse d'un tutoriel vidéo à l'image.
  //
  // Deux passes ffmpeg, sur le même patron de spawn que le remux
  // d'enregistrement Studio plus bas (même binaire, même mécanisme éprouvé) :
  //
  //   1. sondage — quelques images réparties sur toute la durée, pour
  //      reconnaître le format. Réparties, et non prises au début : beaucoup de
  //      tutoriels s'ouvrent sur un titre ou un visage avant l'instrument.
  //   2. relevé — flux d'images à la cadence d'échantillonnage. Chaque image est
  //      lue puis JETÉE : seules les touches allumées sont conservées. C'est ce
  //      qui permet d'analyser une vidéo longue sans faire enfler la mémoire
  //      (une image 640×360 pèse 691 ko ; dix minutes à 4 i/s en pèseraient 1,6 Go).
  //
  // Rien n'est écrit sur le disque : ni PNG intermédiaires, ni WAV. Le dossier
  // de travail du projet reste réservé à l'audio.
  ipcMain.handle('pedagogie:analyze-video', async (event, filePath, options = {}) => {
    const sampleFps = Number(options.sampleFps) || 4;

    const dims = await probeVideoDimensions(filePath);
    if (dims?.toolsMissing) {
      return {
        ok: false,
        reason: 'ToolsMissing',
        message: 'ffmpeg est introuvable sur cette machine (ni celui du système, ni celui du paquet Python imageio-ffmpeg) : '
          + 'l\'image ne peut pas être lue, le relevé se fera au son. Installez ffmpeg, ou lancez « .venv/bin/pip install imageio-ffmpeg ».',
      };
    }
    if (!dims) {
      return {
        ok: false,
        reason: 'NoVideoStream',
        message: 'Ce fichier ne contient pas de piste vidéo exploitable : le relevé se fera au son.',
      };
    }
    const { width, height, duration } = dims;
    const frameBytes = width * height * 3;

    // Plafond de durée : au-delà de 30 minutes, l'analyse à l'image n'est pas
    // garantie fiable (espacement des sondages, temps de traitement linéaire,
    // transcription d'un seul bloc). Voir décision produit / vault EXP-040.
    const MAX_DURATION_SECONDS = 30 * 60;
    if (duration > MAX_DURATION_SECONDS) {
      return {
        ok: false,
        reason: 'VideoTooLong',
        message: 'Cette vidéo dépasse 30 minutes. L\'analyse à l\'image de Pédagogie IA '
          + 'n\'est pas conçue pour des fichiers aussi longs. Réessayez avec un extrait '
          + 'plus court.',
      };
    }

    // 1. Sondage. Garde un espacement d'environ 30 s entre deux sondages
    // (comportement actuel sur un tutoriel de 12 min), plafonné à 60 sondages
    // pour ne pas alourdir la passe sur les vidéos les plus longues autorisées.
    const maxProbes = Number(options.maxProbes) || Math.min(60, Math.max(24, Math.ceil(duration / 30)));
    const probeFps = duration > 0 ? Math.min(1, maxProbes / duration) : 1;
    const probeBuffers = await collectFrames(filePath, probeFps, frameBytes, maxProbes);
    const probes = probeBuffers.map((b) => createFrame(b, width, height, 3));
    const format = detectVideoFormat(probes);

    if (!format.implemented) {
      return {
        ok: true,
        format: format.format,
        implemented: false,
        fallback: format.fallback,
        reason: format.reason,
        confidence: format.confidence,
        video: { width, height, duration },
      };
    }

    // 2. Relevé en flux.
    const geometry = format.geometry;
    const samples = [];
    await streamFrames(filePath, sampleFps, frameBytes, (buf, index) => {
      const frame = createFrame(buf, width, height, 3);
      samples.push({ t: index / sampleFps, keys: readLitKeys(frame, geometry) });
    });

    return {
      ok: true,
      format: format.format,
      implemented: true,
      confidence: format.confidence,
      sampleInterval: 1 / sampleFps,
      samples,
      video: { width, height, duration },
      geometry: {
        lowestMidi: geometry.lowestMidi,
        highestMidi: geometry.highestMidi,
        anchorIsHeuristic: geometry.anchorIsHeuristic,
        whiteKeyCount: geometry.whiteKeys.length,
        blackKeyCount: geometry.blackKeys.length,
      },
    };
  });

  // [Claude] — 2026-09-06 — Pédagogie IA v2 : transcrire ce que DIT le professeur.
  //
  // Indépendant de `pedagogie:analyze-video` : la parole ne dépend pas de ce que
  // l'image a donné, les deux tournent en parallèle depuis l'écran.
  //
  // L'extraction audio réutilise extractTrackAudio(), la même que le Studio et
  // l'Analyse — il n'y a pas deux façons de sortir un WAV d'une vidéo dans ce
  // dépôt, et il ne doit pas y en avoir.
  //
  // TROIS INDISPONIBILITÉS DISTINCTES sont remontées, jamais confondues :
  //   - dependency-missing : faster-whisper absent de cette machine ;
  //   - no-speech          : le modèle a tourné et n'a trouvé aucune parole ;
  //   - failed             : échec technique (fichier illisible, modèle en erreur).
  // L'écran en fait trois messages différents. Aucun texte n'est fabriqué.
  ipcMain.handle('pedagogie:transcribe-video', async (event, filePath, options = {}) => {
    if (!(await transcriberInstalled())) {
      return { available: false, reason: 'dependency-missing' };
    }

    let workDir = null;
    try {
      workDir = await createTranscribeDir();
      const wavPath = path.join(workDir, 'speech.wav');
      await extractTrackAudio(filePath, wavPath);

      const args = ['transcribe', wavPath];
      if (options.model) args.push(`--model=${options.model}`);
      if (options.language) args.push(`--language=${options.language}`);
      const raw = await runTranscriber(args);

      if (!raw?.ok) {
        // Le script sait lui aussi dire que la dépendance manque : ce cas ne
        // devrait pas arriver après le contrôle ci-dessus, mais s'il arrive on
        // garde la bonne raison plutôt que de la ranger dans « échec ».
        const reason = raw?.reason === 'MissingDependency' ? 'dependency-missing' : 'failed';
        return { available: false, reason, detail: raw?.message || null };
      }

      if (!Array.isArray(raw.segments) || raw.segments.length === 0) {
        return {
          available: false,
          reason: 'no-speech',
          language: raw.language ?? null,
          model: raw.model ?? null,
        };
      }

      return {
        available: true,
        segments: raw.segments,
        language: raw.language ?? null,
        model: raw.model ?? null,
      };
    } catch (err) {
      console.error('[Pedagogie] transcription échouée :', err);
      return { available: false, reason: 'failed', detail: err.message };
    } finally {
      if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // [Claude] — 2026-09-25 — Pédagogie IA : notes d'un pianiste filmé de côté ou de face
  // (l'image ne montre pas le clavier), transcrites depuis le son par
  // electron/piano-transcriber.py (piano-transcription-inference, licence MIT).
  // Même contrat honnête que la parole : si le paquet manque, on le dit.
  ipcMain.handle('pedagogie:transcribe-piano', async (event, filePath) => {
    const { python, missing } = await missingPythonModules(['piano_transcription_inference', 'torch', 'librosa']);
    if (!python || missing.length) {
      return { available: false, reason: 'dependency-missing', detail: python ? missing.join(', ') : getPythonCommand() };
    }
    let workDir = null;
    try {
      workDir = await createTranscribeDir();
      const wavPath = path.join(workDir, 'piano.wav');
      await extractTrackAudio(filePath, wavPath);
      const raw = await runPythonJson('piano-transcriber.py', ['transcribe', wavPath]);
      if (!raw?.ok) {
        return { available: false, reason: raw?.reason === 'MissingDependency' ? 'dependency-missing' : 'failed', detail: raw?.message || null };
      }
      return { available: true, notes: raw.notes || [], pedals: raw.pedals || [], duration: raw.duration ?? null };
    } catch (err) {
      console.error('[Pedagogie] transcription piano échouée :', err);
      return { available: false, reason: 'failed', detail: err.message };
    } finally {
      if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // [OpenCode] — 2026-09-07 — Pédagogie IA V2N : disponibilité du modèle.
  ipcMain.handle('pedagogie:check-v2n', async () => {
    return { ...(await v2nStatus()), modelPath: V2N_MODEL_PATH };
  });

  // [OpenCode] — 2026-09-07 — Pédagogie IA V2N : transcription visuelle d'une
  // vidéo réelle de clavier, à partir d'une calibration 4 coins fournie par le
  // renderer. Même contrat honnête que la transcription vocale : si V2N manque,
  // on le dit, on n'invente pas une grille d'accords.
  ipcMain.handle('pedagogie:analyze-video-vision', async (event, filePath, options = {}) => {
    const status = await v2nStatus();
    if (!status.available) {
      return { available: false, reason: status.reason, detail: status.detail || null };
    }

    const corners = options.corners;
    if (!Array.isArray(corners) || corners.length !== 4) {
      return {
        available: false,
        reason: 'invalid-corners',
        message: 'Une calibration 4 coins est requise avant de lancer V2N.',
      };
    }

    const cornerArgs = corners.map((p) => `${Number(p.x)},${Number(p.y)}`);
    const args = [filePath, '--corners', ...cornerArgs];
    if (options.onsetThreshold) {
      args.push('--onset-threshold', String(options.onsetThreshold));
    }
    if (options.frameThreshold) {
      args.push('--frame-threshold', String(options.frameThreshold));
    }
    if (options.bottomMargin) {
      args.push('--bottom-margin', String(options.bottomMargin));
    }

    try {
      const raw = await runPianoVision(args);
      if (!raw?.ok) {
        const reason = raw?.reason === 'MissingDependency' ? 'dependency-missing' : 'failed';
        return { available: false, reason, detail: raw?.message || null };
      }
      return {
        available: true,
        notes: raw.notes || [],
        fps: raw.fps,
        duration: raw.duration,
      };
    } catch (err) {
      console.error('[Pedagogie] V2N a échoué :', err);
      return { available: false, reason: 'failed', detail: err.message };
    }
  });

  // [Claude] — 2026-09-06 — Pédagogie IA refonte Phase 1 : dossier des tutoriels.
  //
  // Pédagogie IA a sa propre bibliothèque, indépendante du magasin Studio :
  // un tutoriel EST un fichier .mp4 à son emplacement réel. Ce sélecteur
  // retourne un DOSSIER (pas un fichier) — même patron que les sélecteurs
  // ci-dessus, avec properties: ['openDirectory'].
  ipcMain.handle('pedagogie:select-tutorial-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Dossier des tutoriels',
      properties: ['openDirectory'],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  // [Claude] — 2026-09-25 — Binaire ffmpeg : celui du système, sinon celui
  // d'imageio-ffmpeg (paquet Python déjà requis pour l'audio). Sans ffprobe, la
  // sonde passe par ffmpeg ; sans aucun des deux, l'écran le dit et se rabat sur
  // le son (avant : « pas de piste vidéo » et arrêt).
  let ffmpegBinaryPromise = null;
  function resolveFfmpeg() {
    if (!ffmpegBinaryPromise) {
      ffmpegBinaryPromise = new Promise((resolve) => {
        const fromImageio = () => {
          let out = '';
          const py = spawn(getPythonCommand(), ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { shell: false });
          py.stdout.on('data', (d) => { out += d.toString(); });
          py.on('error', () => resolve(null));
          py.on('exit', (code) => resolve(code === 0 && out.trim() ? out.trim().split('\n').pop() : null));
        };
        const probe = spawn('ffmpeg', ['-version'], { shell: false });
        let settled = false;
        probe.on('error', () => { if (!settled) { settled = true; fromImageio(); } });
        probe.on('exit', (code) => {
          if (settled) return;
          settled = true;
          if (code === 0) resolve('ffmpeg');
          else fromImageio();
        });
      });
    }
    return ffmpegBinaryPromise;
  }

  /** Sonde de secours sans ffprobe : ffmpeg -i écrit les dimensions et la durée. */
  async function probeWithFfmpeg(filePath) {
    const ffmpeg = await resolveFfmpeg();
    if (!ffmpeg) return { toolsMissing: true };
    return new Promise((resolve) => {
      let err = '';
      const proc = spawn(ffmpeg, ['-hide_banner', '-i', filePath], { shell: false });
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('error', () => resolve({ toolsMissing: true }));
      proc.on('exit', () => {
        const size = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(err);
        if (!size) { resolve(null); return; }
        const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(err);
        const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
        resolve({ width: Number(size[1]), height: Number(size[2]), duration });
      });
    });
  }

  /** Dimensions et durée de la piste vidéo, via ffprobe (compagnon de ffmpeg). */
  async function probeVideoDimensions(filePath) {
    const viaFfprobe = await probeWithFfprobe(filePath);
    if (viaFfprobe && !viaFfprobe.unavailable) return viaFfprobe;
    // ffprobe absent (ou en échec) : ffmpeg donne les mêmes informations.
    return probeWithFfmpeg(filePath);
  }

  function probeWithFfprobe(filePath) {
    return new Promise((resolve) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-show_entries', 'format=duration',
        '-of', 'json',
        filePath,
      ], { shell: false });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('error', () => resolve({ unavailable: true }));
      proc.on('exit', (code) => {
        if (code !== 0) { resolve({ unavailable: true }); return; }
        try {
          const json = JSON.parse(out);
          const stream = json.streams?.[0];
          if (!stream?.width || !stream?.height) { resolve(null); return; }
          resolve({
            width: stream.width,
            height: stream.height,
            duration: Number(json.format?.duration) || 0,
          });
        } catch (_) { resolve(null); }
      });
    });
  }

  /** Diffuse les images décodées, une par une, sans jamais toutes les garder. */
  async function streamFrames(filePath, fps, frameBytes, onFrame) {
    const ffmpeg = (await resolveFfmpeg()) || 'ffmpeg';
    return new Promise((resolve, reject) => {
      const proc = trackChild(spawn(ffmpeg, [
        '-v', 'error',
        '-i', filePath,
        '-vf', `fps=${fps}`,
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-',
      ], { shell: false }));
      let pending = Buffer.alloc(0);
      let index = 0;
      let stderr = '';
      proc.stdout.on('data', (chunk) => {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
        while (pending.length >= frameBytes) {
          const frame = pending.subarray(0, frameBytes);
          pending = pending.subarray(frameBytes);
          try { onFrame(frame, index); } catch (err) {
            console.warn('[Pedagogie] lecture d\'image échouée:', err.message);
          }
          index++;
        }
      });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0 && index === 0) reject(new Error(stderr || `ffmpeg exit ${code}`));
        else resolve(index);
      });
    });
  }

  /** Collecte au plus `limit` images, pour le sondage de format. */
  async function collectFrames(filePath, fps, frameBytes, limit) {
    const out = [];
    await streamFrames(filePath, fps, frameBytes, (buf) => {
      if (out.length < limit) out.push(Buffer.from(buf));
    });
    return out;
  }

  ipcMain.handle('analyzer:process-file', async (event, filePath, options = {}) => {
    const key = JSON.stringify([filePath, options]);
    if (analysisInFlight) {
      // Même demande relancée pendant qu'elle tourne : on rend la même
      // promesse plutôt qu'un second pipeline.
      if (analysisInFlight.key === key) return analysisInFlight.promise;
      throw new Error('Une analyse est déjà en cours. Attendez qu’elle se termine.');
    }
    const promise = runAnalysisPipeline(filePath, options);
    analysisInFlight = { key, promise };
    try {
      return await promise;
    } finally {
      analysisInFlight = null;
    }
  });

  async function runAnalysisPipeline(filePath, options = {}) {
    const tmpDir = await createWorkDir('analyze');
    const playbackWav = path.join(tmpDir, 'audio.wav');

    try {
      const pianoStem = await findStudioPianoStemForFile(filePath);
      if (pianoStem) {
        console.log('[Analyzer] using Studio piano stem:', pianoStem);
      }

      // Find bass stem if requested
      const bassStem = options.analyzeBass !== false
        ? await findStudioBassStemForFile(filePath) : null;
      if (bassStem) {
        console.log('[Analyzer] using Studio bass stem for bass detection:', bassStem);
      }

      // Durée du fichier original importé, indépendamment du stem utilisé pour l'analyse.
      let duration = null;
      try {
        const probeJson = await runAudioProcessor(['probe', filePath]);
        const probeLines = probeJson.split('\n').filter(Boolean);
        const probeResult = JSON.parse(probeLines[probeLines.length - 1]);
        duration = probeResult.duration;
      } catch (probeErr) {
        console.warn('[Analyzer] probe duration failed:', probeErr.message);
      }

      // La lecture utilise toujours le mix original.
      await extractTrackAudio(filePath, playbackWav);

      // L'analyse des accords utilise le piano isolé si disponible, sinon le mix.
      const analysisWav = pianoStem || playbackWav;
      const chordArgs = ['analyze-chords', analysisWav];
      if (options.observationMode && options.observationMode !== 'baseline') {
        chordArgs.push(`--observation-mode=${options.observationMode}`);
      }
      if (options.contradictionWeight != null) {
        chordArgs.push(`--contradiction-weight=${options.contradictionWeight}`);
      }
      if (options.discriminatorThreshold != null) {
        chordArgs.push(`--discriminator-threshold=${options.discriminatorThreshold}`);
      }
      if (options.discriminatorStrength != null) {
        chordArgs.push(`--discriminator-strength=${options.discriminatorStrength}`);
      }
      if (options.diagnostics) {
        chordArgs.push('--diagnostics');
      }
      const chordJson = await runAudioProcessor(chordArgs);
      const lines = chordJson.split('\n').filter(Boolean);
      const result = JSON.parse(lines[lines.length - 1]);

      // Analyse de la basse via Fusion Engine
      let bassSegments = [];
      if (options.analyzeBass !== false) {
        try {
          const bassWav = bassStem || playbackWav;
          console.log('[Analyzer] running bass analysis on:', bassWav);
          bassSegments = await runBassAnalysis(bassWav, result, tmpDir);
          console.log(`[Analyzer] bass analysis done: ${bassSegments.length} segments`);
        } catch (bassErr) {
          console.warn('[Analyzer] bass analysis failed (fallback to chords only):', bassErr.message);
        }
      }

      return {
        wavPath: playbackWav,
        analysisWavPath: analysisWav,
        usedPianoStem: Boolean(pianoStem),
        usedBassStem: Boolean(bassStem),
        duration: duration ?? result.duration ?? 0,
        tempo: result.tempo ?? null,
        timeSignature: result.timeSignature ?? '4/4',
        key: result.key ?? null,
        keyConfidence: result.keyConfidence ?? 0,
        confidence: result.confidence ?? 0,
        chords: result.chords ?? [],
        diagnostics: result.diagnostics ?? null,
        bassSegments: bassSegments,
      };
    } catch (err) {
      console.error('[Analyzer] process-file failed:', err);
      // Le dossier de travail n'a plus d'utilité si l'analyse a échoué.
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  // [Claude] — 2026-07-07 — Screen Recorder : source vidéo via desktopCapturer.
  // Le renderer demande l'id de la source de la fenêtre de l'application.
  ipcMain.handle('studio:get-screen-source-id', async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return { error: 'Fenêtre principale indisponible' };
      }
      // Utilise l'API fiable de la fenêtre plutôt qu'une recherche par titre
      // dans desktopCapturer.getSources(), qui peut échouer si le titre change
      // ou si la source n'est pas encore listée.
      const sourceId = mainWindow.getMediaSourceId();
      if (!sourceId) {
        return { error: 'Source d\'écran introuvable' };
      }
      return { id: sourceId };
    } catch (err) {
      console.error('[Studio] getMediaSourceId failed:', err);
      return { error: err.message };
    }
  });

  // [Claude] — 2026-07-07 — Screen Recorder : dialogue de sauvegarde du Blob enregistré.
  ipcMain.handle('studio:save-recording', async (event, arrayBuffer) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { canceled: true };
    const home = os.homedir();
    const desktopCandidates = ['Desktop', 'Bureau', 'Schreibtisch', 'Escritorio', 'Scrivania', 'Рабочий стол'];
    let desktopDir = null;
    for (const name of desktopCandidates) {
      const candidate = path.join(home, name);
      try {
        await fs.access(candidate);
        desktopDir = candidate;
        break;
      } catch (_) {}
    }
    const defaultPath = path.join(desktopDir || home, `studio-record-${Date.now()}.mp4`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Enregistrer la vidéo',
      defaultPath,
      filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }],
    });
    if (result.canceled) return { canceled: true };

    try {
      // MediaRecorder produit un WebM. On le remux en MP4 H.264 + AAC via ffmpeg.
      const tmpWebm = path.join(os.tmpdir(), `studio-record-${Date.now()}.webm`);
      await fs.writeFile(tmpWebm, Buffer.from(arrayBuffer));
      await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-y',
          '-i', tmpWebm,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          result.filePath,
        ], { shell: false });
        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('error', reject);
        proc.on('exit', (code) => {
          fs.rm(tmpWebm, { force: true }).catch(() => {});
          code !== 0 ? reject(new Error(stderr || `ffmpeg exit ${code}`)) : resolve();
        });
      });
      return { canceled: false, path: result.filePath };
    } catch (err) {
      console.error('[Studio] save recording failed:', err);
      throw err;
    }
  });

  // Legacy handlers supprimés / inactifs.
  ipcMain.handle('studio:get-window-source', async () => null);
  ipcMain.handle('studio:save-video', async () => null);
  ipcMain.handle('studio:start-screen-record', async () => ({ error: 'deprecated' }));
  ipcMain.handle('studio:stop-screen-record', async () => ({ error: 'deprecated' }));
  ipcMain.handle('studio:save-dialog', async () => ({ canceled: true }));
  ipcMain.handle('studio:save-recorded-video', async () => ({ error: 'deprecated' }));
}

// [Refonte 2026-09-02] — safeStorage pour la clé API IA.
ipcMain.handle('safe-storage:is-available', () => safeStorage.isEncryptionAvailable());
ipcMain.handle('safe-storage:encrypt', (event, plainText) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage non disponible');
  }
  return safeStorage.encryptString(plainText).toString('base64');
});
ipcMain.handle('safe-storage:decrypt', (event, encryptedBase64) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage non disponible');
  }
  return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
});

// [OpenCode] — 2026-09-08 — Fait passer les appels IA OpenAI-compatible par le
// processus principal pour contourner les restrictions CORS du renderer
// (en particulier Ollama Cloud qui ne déclare pas Authorization dans
// Access-Control-Allow-Headers). Le renderer continue de bénéficier du
// repli fetch() direct dans les environnements sans electronAPI (tests Node).
ipcMain.handle('ai:chat-completion', async (event, { baseUrl, apiKey, body, timeoutMs }) => {
  const controller = new AbortController();
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null;
  const timer = effectiveTimeout ? setTimeout(() => controller.abort(), effectiveTimeout) : null;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn('[Main:ai:chat-completion] Erreur API', res.status, 'modèle', body.model, '—', text.slice(0, 500));
    }
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Request timeout after ${effectiveTimeout}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
});

app.whenReady().then(() => {
  requestMidiPermission();
  setupFileSystemIPC();
  setupStudioIPC();
  createWindow();

  // [Refonte 2026-09-02] — Ménage au démarrage : les dossiers de travail des
  // sessions précédentes (y compris ceux laissés dans /tmp par les versions
  // antérieures) sont supprimés. Sur un /tmp en tmpfs, ils occupaient de la RAM.
  purgeWorkDirs().catch(() => {});
  purgeLegacyTempDirs().catch(() => {});

  // Poll native MIDI ports so hot-plugged keyboards/synths are detected automatically.
  // [OpenCode] — 2026-07-04 — Even when a port is open we still scan to detect hot-unplug.
  midiPollTimer = setInterval(() => {
    if (nativeMidiFailed) return;
    const inputs = getMidiInputs(true);

    // [Claude] — 2026-07-03 — Hot-plug handling : if the currently opened port disappeared, close it and notify renderer.
    if (currentInputId !== null) {
      const stillAvailable = inputs.some((input) => input.id === currentInputId);
      if (!stillAvailable) {
        console.log('[MIDI] current port lost, closing input');
        closeMidiInput();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('midi-port-lost', { previousId: currentInputId, previousName: currentInputName });
        }
      }
    }

    // [OpenCode] — 2026-07-04 — If current port vanished but same name came back with a new id, reconnect.
    if (!midiInput && currentInputName) {
      reconnectByName(inputs);
    }

    if (inputsChanged(inputs, lastSeenInputs)) {
      console.log('[MIDI] ports changed:', inputs.map((i) => i.name).join(', ') || 'none');
      lastSeenInputs = inputs;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('midi-devices-changed', inputs);
      }
    }

    // [OpenCode] — 2026-07-04 — Auto-connect a hardware device if nothing is open yet.
    if (!midiInput && inputs.length > 0) {
      autoOpenHardwareInput(inputs);
    }
  }, 2000);

  ipcMain.handle('midi:get-inputs', () => {
    return getMidiInputs();
  });

  ipcMain.handle('midi:refresh-inputs', () => {
    // Close the active input before re-enumerating to avoid ALSA 'port in use' issues
    closeMidiInput();
    closeMidiInputEnumerator();
    const inputs = getMidiInputs();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('midi-devices-changed', inputs);
    }
    // [OpenCode] — 2026-07-04 — After a manual refresh, try to auto-connect a hardware device.
    const auto = autoOpenHardwareInput(inputs);
    if (auto) {
      inputs.forEach((input) => sendMidiLog('port', { id: input.id, name: input.name }));
    }
    return inputs;
  });

  // [Claude] — 2026-07-03 — Return the actually opened port id so the renderer can track the current input
  ipcMain.handle('midi:open-input', (event, portId) => {
    const result = openMidiInput(portId);
    return result;
  });

  ipcMain.handle('midi:close-input', () => {
    closeMidiInput();
    return true;
  });

  // [Claude] — 2026-09-24 — Sortie MIDI : la démo des mouvements et « Écouter »
  // jouent sur le VST de l'utilisateur (Narcisse : « le rendu serait bien
  // meilleur »). Ports existants, plus un port virtuel hors Windows (RtMidi) :
  // l'hôte du VST s'y branche sans câble MIDI virtuel à installer.
  ipcMain.handle('midi:get-outputs', () => getMidiOutputs());
  ipcMain.handle('midi:open-output', (event, outputId) => openMidiOutput(outputId));
  ipcMain.on('midi:send', (event, bytes) => {
    if (!midiOutput || !Array.isArray(bytes)) return;
    try {
      midiOutput.sendMessage(bytes);
    } catch (err) {
      console.warn('[MIDI] envoi impossible :', err.message);
    }
  });

  ipcMain.handle('system:audio-groups', () => {
    return userAudioGroups();
  });

  // [Claude] — 2026-09-05 — Sampler piano : résout le dossier des échantillons
  // (assets/piano-samples) pour le renderer, qui les lit par files:read-binary
  // puis decodeAudioData — la CSP bloque fetch(blob:), cf. CLAUDE.md. En dev
  // comme en build, __dirname pointe sur electron/, donc ../assets.
  ipcMain.handle('assets:piano-samples-dir', () => {
    return path.join(__dirname, '..', 'assets', 'piano-samples');
  });

  ipcMain.handle('app:log', (event, msg) => {
    console.log(`[RENDERER] ${msg}`);
  });

  // Forward renderer console messages to terminal for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER-CONSOLE ${sourceId}:${line}] ${message}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeMidiInput();
  closeMidiInputEnumerator();
  closeMidiOutput();
  if (process.platform !== 'darwin') app.quit();
});

// [Refonte 2026-09-02] — Arrêt propre.
//
// Le scrutateur MIDI continuait d'émettre vers un renderer détruit, d'où les
// « Render frame was disposed before WebFrameMain could be accessed » en boucle
// au moment de quitter. Et une analyse en cours survivait à la fermeture de la
// fenêtre : un cœur saturé sans plus aucune fenêtre pour le montrer.
app.on('before-quit', () => {
  if (midiPollTimer) {
    clearInterval(midiPollTimer);
    midiPollTimer = null;
  }
  killLiveChildren();
});
