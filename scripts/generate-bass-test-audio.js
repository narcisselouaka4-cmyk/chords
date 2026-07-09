#!/usr/bin/env node
/**
 * Regenerate bass test WAVs.
 * Run: node scripts/generate-bass-test-audio.js
 *
 * Calls the Python generator which produces tests/audio/*.wav.
 * This script exists so the JS test pipeline has a single entry point
 * for regenerating the test corpus.
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const script = path.join(projectRoot, 'scripts', 'generate-bass-test-audio.py');

const proc = spawn('python3', [script], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, PIP_REQUIRE_VIRTUALENV: 'false' },
});

proc.on('exit', (code) => {
  process.exit(code || 0);
});
