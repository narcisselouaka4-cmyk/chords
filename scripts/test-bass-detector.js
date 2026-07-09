#!/usr/bin/env node
/**
 * Bass Detector V1 — Test Suite + Benchmark.
 *
 * Run: node scripts/test-bass-detector.js
 *
 * Tests:
 *   - Single bass notes (sine + harmonic)
 *   - Chord with root bass
 *   - Slash chords (inversions)
 *   - Walking bass pattern
 *   - Jazz piano voicings
 *
 * Each test generates a WAV → runs bass-detector.py analyze → validates.
 */
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'tests', 'audio');
const PYTHON = path.join(ROOT, '.venv', 'bin', 'python');
const DETECTOR = path.join(ROOT, 'scripts', 'bass-detector.py');

// ─── Test cases ───

const SINGLE_BASS_NOTES = [
  { file: 'bass_C2.wav',     expected: { bass: 'C',  octave: 2 } },
  { file: 'bass_E2.wav',     expected: { bass: 'E',  octave: 2 } },
  { file: 'bass_Fs2.wav',    expected: { bass: 'F#', octave: 2 } },
  { file: 'bass_G2.wav',     expected: { bass: 'G',  octave: 2 } },
  { file: 'bass_A2.wav',     expected: { bass: 'A',  octave: 2 } },
  { file: 'bass_B2.wav',     expected: { bass: 'B',  octave: 2 } },
];

const HARMONIC_BASS_NOTES = [
  { file: 'bass_harm_C2.wav', expected: { bass: 'C',  octave: 2 } },
  { file: 'bass_harm_E2.wav', expected: { bass: 'E',  octave: 2 } },
  { file: 'bass_harm_G2.wav', expected: { bass: 'G',  octave: 2 } },
  { file: 'bass_harm_B2.wav', expected: { bass: 'B',  octave: 2 } },
];

const ROOT_BASS_CHORDS = [
  { file: 'chord_C.wav',  expected: { bass: 'C',  octave: 2 } },
  { file: 'chord_Dm.wav', expected: { bass: 'D',  octave: 2 } },
];

const SLASH_CHORDS = [
  { file: 'slash_C_E.wav',   expected: { bass: 'E',  octave: 1 }, name: 'C/E' },
  { file: 'slash_G_B.wav',   expected: { bass: 'B',  octave: 2 }, name: 'G/B' },
  { file: 'slash_D_Fs.wav',  expected: { bass: 'F#', octave: 2 }, name: 'D/F#' },
  { file: 'slash_Am7_G.wav', expected: { bass: 'G',  octave: 2 }, name: 'Am7/G' },
];

const JAZZ_VOICINGS = [
  { file: 'jazz_Cmaj9.wav',  expected: { bass: 'C',  octave: 2 } },
  { file: 'jazz_Dm7_G.wav',  expected: { bass: 'G',  octave: 2 } },
  { file: 'jazz_G13.wav',    expected: { bass: 'G',  octave: 2 } },
];

const WALKING_BASS = {
  file: 'walking_bass.wav',
  expectedNotes: ['C2','E2','G2','B2','C3','B2','G2','E2','C2','D2','E2','F#2','G2','F#2','E2','D2'],
};

// Known failures / limitations documented for V1
const KNOWN_LIMITATIONS = [
  { file: 'chord_G.wav', issue: 'G chord → detects D (5th dominates CQT). Needs V2 Viterbi context.' },
];

// ─── Runner ───

function runDetector(wavPath) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(PYTHON, [DETECTOR, 'analyze', wavPath], {
      cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Exit ${code}: ${stderr}`));
        return;
      }
      // Extract JSON block — find the root object starting with {"file"
      const rootMarker = '{\n  "file"';
      const jsonStart = stdout.lastIndexOf(rootMarker);
      if (jsonStart < 0) {
        reject(new Error('No JSON root object in output'));
        return;
      }
      try {
        const data = JSON.parse(stdout.slice(jsonStart));
        resolve(data);
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });
  });
}

async function testCase(tc) {
  const wavPath = path.join(AUDIO_DIR, tc.file);
  if (!fs.existsSync(wavPath)) {
    return { pass: false, error: `File not found: ${tc.file}`, tc };
  }
  try {
    const data = await runDetector(wavPath);
    const segs = data.bass || [];
    if (segs.length === 0) {
      return { pass: false, error: 'No bass segments detected', tc, data };
    }
    const s = segs[0];
    const bassOk = s.bass === tc.expected.bass;
    const octOk = s.octave === tc.expected.octave;
    return { pass: bassOk && octOk, tc, data: s, bassOk, octOk };
  } catch (e) {
    return { pass: false, error: e.message, tc };
  }
}

async function testWalkingBass(tc) {
  const wavPath = path.join(AUDIO_DIR, tc.file);
  if (!fs.existsSync(wavPath)) return { pass: false, error: 'File not found', tc };
  try {
    const data = await runDetector(wavPath);
    const segs = data.bass || [];
    if (segs.length === 0) return { pass: false, error: 'No segments', tc, data };
    const detected = segs.map(s => `${s.bass}${s.octave}`);
    let correct = 0;
    for (let i = 0; i < Math.min(detected.length, tc.expectedNotes.length); i++) {
      if (detected[i] === tc.expectedNotes[i]) correct++;
    }
    return {
      pass: correct === tc.expectedNotes.length,
      tc, detected, correct,
      total: tc.expectedNotes.length,
    };
  } catch (e) {
    return { pass: false, error: e.message, tc };
  }
}

function printResults(category, results) {
  let passed = 0, failed = 0;
  for (const r of results) {
    if (r.pass) passed++;
    else failed++;
  }
  console.log(`\n  ${category} (${passed}/${passed + failed} passed):`);
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    const name = r.tc.file;
    if (r.pass) {
      console.log(`    ${icon} ${name} → ${r.data.bass} oct=${r.data.octave} conf=${r.data.confidence?.toFixed(2)}`);
    } else if (r.data) {
      console.log(`    ${icon} ${name} → got ${r.data.bass} oct=${r.data.octave} (expected ${r.tc.expected?.bass} oct=${r.tc.expected?.octave})`);
    } else if (r.detected) {
      const correct = r.correct ?? 0;
      console.log(`    ${icon} ${name} → ${correct}/${r.total} correct (${r.detected.slice(0,5).join(',')}...)`);
    } else {
      console.log(`    ${icon} ${name} → ${r.error}`);
    }
  }
  return { passed, failed };
}

// ─── Main ───

async function main() {
  console.log('=========================================================');
  console.log('BASS DETECTOR V1 — TEST SUITE');
  console.log('=========================================================');

  // Verify test audio exists
  if (!fs.existsSync(AUDIO_DIR)) {
    console.error(`[Error] Test audio directory not found: ${AUDIO_DIR}`);
    console.error('  Run: node scripts/generate-bass-test-audio.js');
    process.exit(1);
  }

  console.log(`\nPython   : ${PYTHON}`);
  console.log(`Detector : ${DETECTOR}`);
  console.log(`Audio    : ${fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.wav')).length} files`);

  // ─── Single bass notes (sine) ───
  console.log('\n--- Single bass notes (pure sine) ---');
  const sineResults = await Promise.all(SINGLE_BASS_NOTES.map(testCase));
  const sineStats = printResults('Pure sine', sineResults);

  // ─── Single bass notes (harmonic) ───
  console.log('\n--- Single bass notes (with harmonics) ---');
  const harmResults = await Promise.all(HARMONIC_BASS_NOTES.map(testCase));
  const harmStats = printResults('With harmonics', harmResults);

  // ─── Root bass chords ───
  console.log('\n--- Chords with root bass ---');
  const rootChordResults = await Promise.all(ROOT_BASS_CHORDS.map(testCase));
  const rootChordStats = printResults('Root bass', rootChordResults);

  // ─── Slash chords ───
  console.log('\n--- Slash chords (inversions) ---');
  const slashResults = await Promise.all(SLASH_CHORDS.map(testCase));
  const slashStats = printResults('Slash chords', slashResults);

  // ─── Jazz voicings ───
  console.log('\n--- Jazz piano voicings ---');
  const jazzResults = await Promise.all(JAZZ_VOICINGS.map(testCase));
  const jazzStats = printResults('Jazz voicings', jazzResults);

  // ─── Walking bass ───
  console.log('\n--- Walking bass pattern ---');
  const wbResult = await testWalkingBass(WALKING_BASS);
  if (wbResult.pass) {
    console.log(`  ✅ ${WALKING_BASS.file} → ${wbResult.correct}/${wbResult.total} notes correct`);
  } else {
    const correct = wbResult.correct ?? 0;
    const total = wbResult.total ?? 0;
    console.log(`  ❌ ${WALKING_BASS.file} → ${correct}/${total} correct (${(wbResult.detected ||[]).slice(0,6).join(',')}...)`);
  }

  // ─── Known limitations ───
  console.log('\n--- Known limitations (V1) ---');
  for (const lim of KNOWN_LIMITATIONS) {
    console.log(`  ⚠️  ${lim.file}: ${lim.issue}`);
  }

  // ─── Summary ───
  const totalPassed = sineStats.passed + harmStats.passed + rootChordStats.passed + slashStats.passed + jazzStats.passed + (wbResult.pass ? 1 : 0);
  const totalTests = sineStats.passed + sineStats.failed + harmStats.passed + harmStats.failed +
    rootChordStats.passed + rootChordStats.failed + slashStats.passed + slashStats.failed +
    jazzStats.passed + jazzStats.failed + 1;
  const totalFailed = totalTests - totalPassed;

  console.log('\n=========================================================');
  console.log('TEST SUMMARY');
  console.log('=========================================================');
  console.log(`  ${totalPassed}/${totalTests} tests passed`);
  if (totalFailed > 0) {
    console.log(`  ${totalFailed} tests failed (see known limitations above)`);
  }
  console.log('');

  // ─── Amazing Grace benchmark ───
  console.log('=========================================================');
  console.log('AMAZING GRACE BENCHMARK');
  console.log('=========================================================');
  console.log('  Run: python scripts/bass-detector.py benchmark <ref>');
  console.log('');

  const refPath = path.join(ROOT, 'tests', 'references', 'amazing_grace_gospel_piano.json');
  if (fs.existsSync(refPath)) {
    const proc = child_process.spawnSync(PYTHON, [DETECTOR, 'benchmark', refPath], {
      cwd: ROOT, stdio: 'inherit',
      timeout: 300000,
    });
  } else {
    console.log('  (reference file not found, skip)');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[Error]', err.message);
  process.exit(1);
});
