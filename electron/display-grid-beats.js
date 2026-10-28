import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let activeJob = null;

export function runDisplayGridBeats(wavPath, { tempo = 120, manual = false } = {}, { python = 'python3', trackChild = (proc) => proc } = {}) {
  tempo = Number(tempo);
  if (!Number.isFinite(tempo) || tempo < 20 || tempo > 400) return Promise.reject(new Error('Tempo attendu entre 20 et 400 BPM'));
  activeJob?.kill();
  return new Promise((resolve, reject) => {
    const args = [fileURLToPath(new URL('./display_grid_beats.py', import.meta.url)), wavPath, '--tempo', String(tempo)];
    if (manual === true) args.push('--manual');
    const proc = trackChild(spawn(python, args, { shell: false, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
    activeJob = proc;
    let stdout = '', stderr = '', expired = false;
    // [Claude] — 2026-10-28 — beat-this met 13 à 31 s sur un morceau de 5 min, et son
    // modèle (77 Mo) se télécharge au premier appel : 90 s ne suffisaient plus.
    const timer = setTimeout(() => { expired = true; proc.kill(); }, 240000);
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    proc.once('error', (error) => { clearTimeout(timer); if (activeJob === proc) activeJob = null; reject(error); });
    proc.once('close', (code) => {
      clearTimeout(timer); if (activeJob === proc) activeJob = null;
      if (code !== 0) { reject(new Error(expired ? 'Calage des pulsations trop long' : stderr || 'Calage des pulsations interrompu')); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Pulsations illisibles')); }
    });
  });
}
