#!/usr/bin/env node
// Extraction en direct du référentiel VoicingLab, ton par ton (12 racines).
//
// Source : serveur MCP public du site, https://voicinglab.com/api/mcp
//   - getChordInfo(<symbole>)          -> existence de l'accord + styles publiés et leur nombre
//   - getVoicing(<symbole>, <style>)   -> toutes les notes réelles de chaque voicing du style
//
// Usage : node scripts/voicinglab/extract-voicinglab.mjs [sortie.json]
// Sortie par défaut : data/voicinglab/voicinglab-extraction-12-tons.json (brut, horodaté)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { callVoicingLab } from './vl-client.mjs';

// Une racine par pitch class (0-11). VoicingLab privilégie les bémols (C#7 et
// F#maj7 sont refusés) mais écrit certaines familles en dièses (F#m7, F#dim7,
// alors que Gbm7 n'existe pas) : on essaie donc la forme bémol puis la forme dièse.
export const VL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_SPELLING = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

// Qualités publiées par VoicingLab pour C (sonde du 2026-09-23 : total 890 voicings).
const VL_QUALITIES = [
  'maj7', 'maj9', 'maj13', 'maj7#11', 'maj7#5', '6', '69', 'add9',
  'm7', 'm9', 'm11', 'm6', 'm69', 'm7#11', 'mMaj7', 'mMaj9', 'm7b5', 'dim7',
  '7', '9', '13', '7sus4', '9sus4', '13sus4', '7b9', '7#9', '7#11', '7b5', '7#5',
  '7b13', '7#9b13', '7b5b9', '7#5#9', '7alt',
  'aug', 'augMaj7', 'sus2', 'sus4', '5',
];
// Qualités utilisées par l'app mais à confirmer (absence attendue) : on les
// interroge quand même, ton par ton, pour documenter l'absence réelle.
const APP_ONLY_PROBES = [
  '', 'm', 'dim', 'm13', '11', 'maj11', '13#11', 'maj13#11', '7b9b13', '7#9#11',
  '7b9#9', 'm7b9', '7sus2', 'maj7sus2', 'maj7sus4', 'madd9', 'add11', '6add11',
];

const CONCURRENCY = 8;

async function pool(items, worker) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx]);
    }
  }));
  return out;
}

async function extractChord(pcRoot, quality) {
  let root = pcRoot;
  let symbol = `${root}${quality}`;
  let info = await callVoicingLab('getChordInfo', { chordSymbol: symbol });
  if ((info.error || info.chordSymbol !== symbol) && SHARP_SPELLING[pcRoot]) {
    const alt = `${SHARP_SPELLING[pcRoot]}${quality}`;
    const altInfo = await callVoicingLab('getChordInfo', { chordSymbol: alt });
    if (!altInfo.error && altInfo.chordSymbol === alt) {
      root = SHARP_SPELLING[pcRoot]; symbol = alt; info = altInfo;
    }
  }
  if (info.error || info.chordSymbol !== symbol) {
    return { symbol, root, pitchClassRoot: pcRoot, quality, exists: false, reason: info.error || `résolu en ${info.chordSymbol}` };
  }
  const styles = {};
  const issues = [];
  for (const s of info.availableStyles) {
    const r = await callVoicingLab('getVoicing', { chordSymbol: symbol, style: s.key });
    if (r.error) { issues.push(`${s.key}: ${r.error}`); continue; }
    const voicings = r.voicings.filter((v) => v.chordSymbol === symbol && v.style === s.key);
    if (voicings.length !== s.count) issues.push(`${s.key}: ${voicings.length} récupérés / ${s.count} annoncés (total ${r.totalAvailable})`);
    styles[s.key] = voicings.map((v) => ({
      midi: v.midiNotes, names: v.noteNames, intervals: v.intervals,
      hand: v.hand, span: v.handSpanSemitones, difficulty: v.difficulty,
    }));
  }
  return {
    symbol, root, pitchClassRoot: pcRoot, quality, exists: true,
    description: info.qualityDescription, totalVoicings: info.totalVoicings,
    styles, issues,
  };
}

const outPath = resolve(process.argv[2] || 'data/voicinglab/voicinglab-extraction-12-tons.json');
const jobs = VL_ROOTS.flatMap((root) => [...VL_QUALITIES, ...APP_ONLY_PROBES].map((q) => [root, q]));
const t0 = Date.now();
let done = 0;
const results = await pool(jobs, async ([root, q]) => {
  const r = await extractChord(root, q);
  done += 1;
  if (done % 50 === 0) console.error(`${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  return r;
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({
  source: 'https://voicinglab.com/api/mcp (getChordInfo + getVoicing par style)',
  extractedAt: new Date().toISOString(),
  roots: VL_ROOTS,
  chords: results,
}, null, 1));
const found = results.filter((r) => r.exists);
console.error(`OK ${found.length} accords, ${found.reduce((a, r) => a + Object.values(r.styles).flat().length, 0)} voicings, ${results.filter((r) => r.issues?.length).length} avec anomalies -> ${outPath}`);
