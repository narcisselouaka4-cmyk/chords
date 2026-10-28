import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runDisplayGridBeats } from './display-grid-beats.js';

test('tempo invalide refusé avant tout lancement Python', async () => {
  for (const tempo of [0, -120, Infinity, NaN, 401, '120; echo test']) {
    await assert.rejects(runDisplayGridBeats('/absent.wav', { tempo }), /Tempo attendu/);
  }
});

test('IPC de calage : lecture autorisée, WAV et outil séparé du moteur harmonique', () => {
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('./preload.cjs', import.meta.url), 'utf8');
  const block = main.slice(main.indexOf("ipcMain.handle('analyzer:grid-beats'"), main.indexOf("ipcMain.handle('analyzer:prepare-playback'"));
  assert(block.includes('await assertAllowedPath(wavPath)'));
  assert(block.includes("!== '.wav'"));
  assert(block.includes('runDisplayGridBeats(safePath'));
  assert(!block.includes('analyze-chords'));
  assert(preload.includes("ipcRenderer.invoke('analyzer:grid-beats'"));
  const python = readFileSync(new URL('./display_grid_beats.py', import.meta.url), 'utf8');
  assert(!python.includes('audio-processor'));
  assert(!python.includes('ANALYSIS_ENGINE_VERSION'));
});
