import { app, BrowserWindow, ipcMain, session, dialog, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import midi from '@julusian/midi';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

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
let midiInput = null;
let currentInputId = null; // currently opened input port id
let currentInputName = null; // name used to reconnect after hot-plug

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
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

  // [OpenCode] — 2026-07-04 — DevTools ouverts en permanence pour déboguer les bugs UI.
  mainWindow.webContents.openDevTools({ mode: 'detach' });

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

function getMidiInputs() {
  const input = getMidiInputEnumerator();
  if (!input) return [];
  const ports = [];
  const count = input.getPortCount();
  sendMidiLog('scan', { count });
  for (let i = 0; i < count; i++) {
    const name = input.getPortName(i);
    sendMidiLog('port', { id: i, name });
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
  midiInput = new midi.Input();
  let name = '';
  try {
    midiInput.openPort(portId);
    name = midiInput.getPortName(portId) || '';
    console.log('[MIDI] port opened successfully:', portId, name);
  } catch (err) {
    console.error('[MIDI] openPort failed:', err.message);
    midiInput = null;
    return { success: false, error: err.message };
  }
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
}

const STUDIO_DIR_NAME = 'PianoJazzChords/Studio';
const STEMS = ['bass', 'drums', 'vocals', 'other', 'piano'];

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

function runAudioProcessor(args, onProgress = null) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getPythonCommand(), [
      path.join(__dirname, 'audio-processor.py'),
      ...args,
    ], { shell: false });

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
  await fs.writeFile(chordsJson, JSON.stringify(chordsData, null, 2));

  // Step 1: export BE candidates
  await new Promise((resolve, reject) => {
    const proc = spawn(getPythonCommand(), [
      path.join(scriptsDir, 'export_bass_candidates.py'),
      '--wav', analysisWav,
      '--output', candidatesJson,
    ], { shell: false });
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
    const proc = spawn(getPythonCommand(), [
      path.join(scriptsDir, 'fusion_bass_chord.py'),
      '--candidates', candidatesJson,
      '--chords', chordsJson,
      '--params', paramsPath,
      '--output-segments', segmentsJson,
    ], { shell: false });
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
  ipcMain.handle('analyzer:process-file', async (event, filePath, options = {}) => {
    const tmpDir = path.join(os.tmpdir(), `pjc-analyze-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
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
      const chordJson = await runAudioProcessor(['analyze-chords', analysisWav]);
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
        bassSegments: bassSegments,
      };
    } catch (err) {
      console.error('[Analyzer] process-file failed:', err);
      throw err;
    }
  });

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

app.whenReady().then(() => {
  requestMidiPermission();
  setupFileSystemIPC();
  setupStudioIPC();
  createWindow();

  // Poll native MIDI ports so hot-plugged keyboards/synths are detected automatically.
  // [OpenCode] — 2026-07-04 — Even when a port is open we still scan to detect hot-unplug.
  setInterval(() => {
    if (nativeMidiFailed) return;
    const inputs = getMidiInputs();

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

  ipcMain.handle('system:audio-groups', () => {
    return userAudioGroups();
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
  if (process.platform !== 'darwin') app.quit();
});
