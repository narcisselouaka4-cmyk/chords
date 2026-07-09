import fs from 'fs';
import path from 'path';
import os from 'os';
import child_process from 'child_process';

/**
 * [Claude] — 2026-07-08 — Outil de Diagnostic Comparatif Multi-Pipeline.
 * Compare la sortie du moteur d'analyse Python avec une grille de référence manuelle
 * pour cinq modes : legacy, raw, grid_half, grid_norm, grid_full.
 * Le scoring est pondéré par exposition temporelle (pas un comptage de segments brut).
 */

function getVenvPythonPath() {
  const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python');
  if (process.platform === 'win32') {
    return path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  }
  return venvPython;
}

function getPythonCommand() {
  const venvPath = getVenvPythonPath();
  try {
    fs.accessSync(venvPath);
    return venvPath;
  } catch {
    return 'python3';
  }
}

function sanitizeAudioPath(rawPath) {
  const candidates = [];
  candidates.push(rawPath);
  const trimmed = rawPath.trim();
  if (trimmed !== rawPath) candidates.push(trimmed);
  const unquoted = trimmed.replace(/[\u201C\u201D\u0022]/g, '').replace(/[\u2018\u2019\u0027]/g, '').trim();
  if (unquoted !== trimmed) candidates.push(unquoted);
  for (let i = 0; i < candidates.length; i++) {
    let p = candidates[i];
    if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
    if (fs.existsSync(p)) return p;
  }
  return rawPath;
}

function runAudioProcessor(args) {
  return new Promise((resolve, reject) => {
    const pythonCmd = getPythonCommand();
    const scriptPath = path.join(process.cwd(), 'electron', 'audio-processor.py');
    const proc = child_process.spawn(pythonCmd, [scriptPath, ...args], { shell: false });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
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

// Utilitaires de parsing d'accords
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteNameToPc(name) {
  if (!name) return null;
  const normalized = name.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  const base = normalized.charAt(0).toUpperCase();
  const alter = normalized.slice(1);
  const baseIndex = NOTE_NAMES.indexOf(base);
  if (baseIndex === -1) return null;
  let offset = 0;
  for (const ch of alter) {
    if (ch === '#') offset += 1;
    else if (ch === 'b') offset -= 1;
  }
  return (baseIndex + offset + 12) % 12;
}

function parseChord(chordName) {
  if (!chordName || chordName === 'N' || chordName === '?') {
    return { root: null, isMinor: false, isSilence: true, raw: 'N' };
  }
  const rootMatch = chordName.match(/^([A-G][#b]?)/);
  if (!rootMatch) {
    return { root: null, isMinor: false, isSilence: false, raw: chordName };
  }
  const rootName = rootMatch[1];
  const root = noteNameToPc(rootName);
  const suffix = chordName.slice(rootName.length).trim();
  const isMinor = /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(suffix);
  return { root, isMinor, suffix, isSilence: false, raw: chordName };
}

function getChordAtTime(grids, t, field = 'chord') {
  const found = grids.find((g) => {
    const start = g.start !== undefined ? g.start : g.startTime;
    const end = g.end !== undefined ? g.end : g.endTime;
    return t >= start && t < end;
  });
  return found ? (found[field] || found.chord) : 'N';
}

function getStructuralChordAtTime(grids, t, field = 'structural_chord') {
  return getChordAtTime(grids, t, field);
}

function classifySimplification(raw, refRaw) {
  /**
   * Classe la nature de l'écart entre l'accord détecté et l'accord de référence,
   * quand la fondamentale et la qualité maj/min sont identiques.
   * Retourne : EXACT | SIMPLIFIED | EXTENSION | SUSPENSION | UNKNOWN
   */
  if (raw === refRaw) return 'EXACT';
  const det = parseChord(raw);
  const ref = parseChord(refRaw);

  const detHasExtension = /(7|maj7|m7|add9|9|11|13)$/i.test(det.suffix);
  const refHasExtension = /(7|maj7|m7|add9|9|11|13)$/i.test(ref.suffix);
  const detIsSus = /^(sus2|sus4)$/i.test(det.suffix);
  const refIsSus = /^(sus2|sus4)$/i.test(ref.suffix);

  if (detHasExtension || refHasExtension) return 'EXTENSION';
  if (detIsSus || refIsSus) return 'SUSPENSION';
  if (det.suffix.length === 0 && ref.suffix.length > 0) return 'SIMPLIFIED';
  if (det.suffix.length > 0 && ref.suffix.length === 0) return 'EXTENSION';
  return 'UNKNOWN';
}

function toStructuralChord(chordName) {
  if (!chordName || chordName === 'N') return 'N';
  const parsed = parseChord(chordName);
  if (parsed.root === null || parsed.isSilence) return 'N';
  return NOTE_NAMES[parsed.root] + (parsed.isMinor ? 'm' : '');
}

const HARMONIC_FAMILIES = {
  '': 'M', 'maj7': 'M', '6': 'M', 'add9': 'M',
  '7': 'D', '9': 'D', '13': 'D',
  'm': 'm', 'm7': 'm', 'm9': 'm',
  'dim': '°', 'm7b5': '°',
  'aug': '+',
  'sus2': 'S', 'sus4': 'S',
};

function toHarmonicKey(chordName) {
  if (!chordName || chordName === 'N') return null;
  const p = parseChord(chordName);
  if (p.root === null || p.isSilence) return null;
  const family = HARMONIC_FAMILIES[p.suffix || ''] || 'M';
  return `${NOTE_NAMES[p.root]}:${family}`;
}

function computeChordsPerMeasure(chords, bpm, beatsPerMeasure = 4) {
  const measureDur = (60 / bpm) * beatsPerMeasure;
  let changes = 0, prev = null;
  for (const seg of chords) {
    const key = toHarmonicKey(seg.chord || seg.structural_chord);
    if (key && prev !== null && key !== prev) changes++;
    prev = key;
  }
  const totalDur = chords.length ? chords[chords.length - 1].endTime : 0;
  const measures = totalDur / measureDur;
  return { changes, measures, perMeasure: measures > 0 ? changes / measures : 0 };
}

function needlemanWunsch(refSeq, detSeq) {
  const GAP = -1, MISMATCH = -1, MATCH_ROOT = 0, MATCH_STRUCTURAL = 1, MATCH_EXACT = 2;
  function substScore(a, b) {
    if (a === b) return MATCH_EXACT;
    const aStruct = toStructuralChord(a);
    const bStruct = toStructuralChord(b);
    if (aStruct === bStruct) return MATCH_STRUCTURAL;
    const aParsed = parseChord(a), bParsed = parseChord(b);
    if (aParsed.root !== null && aParsed.root === bParsed.root) return MATCH_ROOT;
    return MISMATCH;
  }
  const nx = refSeq.length, ny = detSeq.length;
  const score = Array.from({ length: nx + 1 }, () => Array(ny + 1).fill(0));
  const trace = Array.from({ length: nx + 1 }, () => Array(ny + 1).fill(''));
  for (let i = 1; i <= nx; i++) { score[i][0] = score[i - 1][0] + GAP; trace[i][0] = 'up'; }
  for (let j = 1; j <= ny; j++) { score[0][j] = score[0][j - 1] + GAP; trace[0][j] = 'left'; }
  for (let i = 1; i <= nx; i++) {
    for (let j = 1; j <= ny; j++) {
      const diag = score[i - 1][j - 1] + substScore(refSeq[i - 1], detSeq[j - 1]);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      if (diag >= up && diag >= left) { score[i][j] = diag; trace[i][j] = 'diag'; }
      else if (up >= left) { score[i][j] = up; trace[i][j] = 'up'; }
      else { score[i][j] = left; trace[i][j] = 'left'; }
    }
  }
  let i = nx, j = ny;
  const alignRef = [], alignDet = [];
  while (i > 0 || j > 0) {
    if (trace[i][j] === 'diag') { alignRef.unshift(refSeq[i - 1]); alignDet.unshift(detSeq[j - 1]); i--; j--; }
    else if (trace[i][j] === 'up') { alignRef.unshift(refSeq[i - 1]); alignDet.unshift(null); i--; }
    else { alignRef.unshift(null); alignDet.unshift(detSeq[j - 1]); j--; }
  }
  return { alignRef, alignDet };
}

function evaluateSequence(reference, result) {
  const refSeq = reference.chords_in_order;
  const detGrids = result.chords || [];
  const detDedup = [];
  for (const seg of detGrids) {
    const chord = seg.chord || seg.structural_chord || 'N';
    if (detDedup.length === 0 || detDedup[detDedup.length - 1] !== chord) detDedup.push(chord);
  }
  const alignment = needlemanWunsch(refSeq, detDedup);
  const totalPairs = alignment.alignRef.length;
  let matchFundamental = 0, matchQuality = 0, matchStructure = 0, matchExpert = 0;
  let matchExact = 0, matchSimplified = 0, matchExtension = 0, matchSuspension = 0;
  let wrongRoot = 0, wrongQuality = 0;
  for (let i = 0; i < totalPairs; i++) {
    const refChord = alignment.alignRef[i], detChord = alignment.alignDet[i];
    if (!refChord || !detChord) continue;
    const refParsed = parseChord(refChord), detParsed = parseChord(detChord);
    if (refParsed.isSilence && detParsed.isSilence) { matchExpert++; matchExact++; continue; }
    if (refParsed.isSilence || detParsed.isSilence) continue;
    if (refParsed.root !== null && refParsed.root === detParsed.root) {
      matchFundamental++;
      if (refParsed.isMinor === detParsed.isMinor) {
        matchQuality++;
        if (toStructuralChord(refChord) === toStructuralChord(detChord)) {
          matchStructure++;
          const cat = classifySimplification(detChord, refChord);
          if (cat === 'EXACT') { matchExpert++; matchExact++; }
          else if (cat === 'SIMPLIFIED') matchSimplified++;
          else if (cat === 'EXTENSION') matchExtension++;
          else if (cat === 'SUSPENSION') matchSuspension++;
          else matchExtension++;
        } else wrongQuality++;
      } else wrongQuality++;
    } else wrongRoot++;
  }
  return {
    scoreFundamental: totalPairs > 0 ? (matchFundamental / totalPairs) * 100 : 0,
    scoreQuality: totalPairs > 0 ? (matchQuality / totalPairs) * 100 : 0,
    scoreAccompagnement: totalPairs > 0 ? (matchStructure / totalPairs) * 100 : 0,
    scoreExpert: totalPairs > 0 ? (matchExpert / totalPairs) * 100 : 0,
    matchExact: totalPairs > 0 ? (matchExact / totalPairs) * 100 : 0,
    matchSimplified: totalPairs > 0 ? (matchSimplified / totalPairs) * 100 : 0,
    matchExtension: totalPairs > 0 ? (matchExtension / totalPairs) * 100 : 0,
    matchSuspension: totalPairs > 0 ? (matchSuspension / totalPairs) * 100 : 0,
    wrongRoot: totalPairs > 0 ? (wrongRoot / totalPairs) * 100 : 0,
    wrongQuality: totalPairs > 0 ? (wrongQuality / totalPairs) * 100 : 0,
    silenceMismatch: 'N/A', totalRefBlocks: 'N/A', fragmentedRefBlocks: 'N/A',
    totalFalseTransitions: 'N/A', timingStability: 'N/A',
    segmentsCount: detDedup.length,
    rawResult: result,
    simplificationExposure: { NONE: 0 },
    percentFormatter: (v) => v === 'N/A' ? 'N/A' : (typeof v === 'number' ? v.toFixed(1) : String(v)),
  };
}

function evaluateDetection(reference, result, duration) {
  const dt = 0.25; // pas d'échantillonnage de 250 ms
  let totalDuration = 0;

  // Scores harmoniques (pondérés par durée d'exposition)
  let matchExactDuration = 0;
  let matchSimplifiedDuration = 0;
  let matchExtensionDuration = 0;
  let matchSuspensionDuration = 0;
  let wrongRootDuration = 0;
  let wrongQualityDuration = 0;
  let silenceMismatchDuration = 0;

  // Scores 4 niveaux (structuraux)
  let matchFundamentalDuration = 0; // même fondamentale
  let matchQualityDuration = 0;     // même fondamentale + maj/min
  let matchStructureDuration = 0;   // même structure accompagnement
  let matchFullDuration = 0;        // accord exact

  // Répartition des simplifications (pondérée par durée)
  let simplificationExposure = {
    NONE: 0,
    EXTENSION: 0,
    SUSPENSION: 0,
    FUNDAMENTAL_QUALITY: 0,
    UNKNOWN: 0,
  };

  const refGrids = reference.chords || reference.grid || [];
  const detGrids = result.chords || [];

  for (let t = 0; t < duration; t += dt) {
    const tEnd = Math.min(t + dt, duration);
    const stepDuration = tEnd - t;
    totalDuration += stepDuration;

    const refRaw = getChordAtTime(refGrids, t);
    const detRaw = getChordAtTime(detGrids, t);
    const refStructural = getStructuralChordAtTime(refGrids, t);
    const detStructural = getStructuralChordAtTime(detGrids, t);

    const refParsed = parseChord(refRaw);
    const detParsed = parseChord(detRaw);
    const refStructuralParsed = parseChord(refStructural);
    const detStructuralParsed = parseChord(detStructural);

    // Agrégation des simplifications observées côté détecté
    detGrids.forEach((g) => {
      const start = g.startTime;
      const end = g.endTime;
      const overlapStart = Math.max(t, start);
      const overlapEnd = Math.min(tEnd, end);
      if (overlapEnd > overlapStart && g.simplification_exposure) {
        const overlap = overlapEnd - overlapStart;
        for (const [type, value] of Object.entries(g.simplification_exposure)) {
          simplificationExposure[type] = (simplificationExposure[type] || 0) + value * (overlap / stepDuration);
        }
      }
    });

    // --- Niveau 1 : Fondamentale ---
    if (!refParsed.isSilence && !detParsed.isSilence && refParsed.root === detParsed.root) {
      matchFundamentalDuration += stepDuration;
    }

    // --- Niveau 2 : Qualité (fondamentale + maj/min) ---
    if (!refParsed.isSilence && !detParsed.isSilence && refParsed.root === detParsed.root && refParsed.isMinor === detParsed.isMinor) {
      matchQualityDuration += stepDuration;
    }

    // --- Niveau 3 : Structure accompagnement (structural_chord) ---
    if (!refStructuralParsed.isSilence && !detStructuralParsed.isSilence &&
        refStructuralParsed.root === detStructuralParsed.root &&
        refStructuralParsed.isMinor === detStructuralParsed.isMinor) {
      matchStructureDuration += stepDuration;
    }

    // --- Niveau 4 : Accord exact ---
    if (refParsed.isSilence && detParsed.isSilence) {
      matchFullDuration += stepDuration;
      matchExactDuration += stepDuration;
    } else if (refParsed.isSilence || detParsed.isSilence) {
      silenceMismatchDuration += stepDuration;
    } else if (refParsed.root !== detParsed.root) {
      wrongRootDuration += stepDuration;
    } else if (refParsed.isMinor !== detParsed.isMinor) {
      wrongQualityDuration += stepDuration;
    } else {
      // Même fondamentale, même qualité maj/min
      const category = classifySimplification(detRaw, refRaw);
      if (category === 'EXACT') {
        matchExactDuration += stepDuration;
        matchFullDuration += stepDuration;
      } else if (category === 'SIMPLIFIED') {
        matchSimplifiedDuration += stepDuration;
      } else if (category === 'EXTENSION') {
        matchExtensionDuration += stepDuration;
      } else if (category === 'SUSPENSION') {
        matchSuspensionDuration += stepDuration;
      } else {
        matchExtensionDuration += stepDuration;
      }
    }
  }

  const pct = (val) => totalDuration > 0 ? ((val / totalDuration) * 100).toFixed(1) : '0.0';

  // Fragmentation : pour chaque bloc de référence, combien de segments détectés l'intersectent ?
  let totalRefBlocks = refGrids.length;
  let fragmentedRefBlocks = 0;
  let totalFalseTransitions = 0;
  const fragmentDurations = [];

  refGrids.forEach((refBlock) => {
    const refStart = refBlock.start !== undefined ? refBlock.start : refBlock.startTime;
    const refEnd = refBlock.end !== undefined ? refBlock.end : refBlock.endTime;

    const intersectingDet = detGrids.filter((detBlock) => {
      const dStart = detBlock.startTime;
      const dEnd = detBlock.endTime;
      const overlapStart = Math.max(refStart, dStart);
      const overlapEnd = Math.min(refEnd, dEnd);
      return (overlapEnd - overlapStart) > 0.3;
    });

    if (intersectingDet.length >= 2) {
      fragmentedRefBlocks++;
      totalFalseTransitions += (intersectingDet.length - 1);
      const totalDetDurationInBlock = intersectingDet.reduce((sum, d) => {
        const overlapStart = Math.max(refStart, d.startTime);
        const overlapEnd = Math.min(refEnd, d.endTime);
        return sum + Math.max(0, overlapEnd - overlapStart);
      }, 0);
      fragmentDurations.push({ refDuration: refEnd - refStart, detDuration: totalDetDurationInBlock });
    }
  });

  const timingStability = totalRefBlocks > 0
    ? (100 - (fragmentedRefBlocks / totalRefBlocks) * 100)
    : 100;

  return {
    scoreFundamental: (matchFundamentalDuration / totalDuration) * 100,
    scoreQuality: (matchQualityDuration / totalDuration) * 100,
    scoreAccompagnement: (matchStructureDuration / totalDuration) * 100,
    scoreExpert: (matchFullDuration / totalDuration) * 100,
    matchExact: (matchExactDuration / totalDuration) * 100,
    matchSimplified: (matchSimplifiedDuration / totalDuration) * 100,
    matchExtension: (matchExtensionDuration / totalDuration) * 100,
    matchSuspension: (matchSuspensionDuration / totalDuration) * 100,
    wrongRoot: (wrongRootDuration / totalDuration) * 100,
    wrongQuality: (wrongQualityDuration / totalDuration) * 100,
    silenceMismatch: (silenceMismatchDuration / totalDuration) * 100,
    totalRefBlocks,
    fragmentedRefBlocks,
    totalFalseTransitions,
    timingStability,
    segmentsCount: detGrids.length,
    rawResult: result,
    simplificationExposure,
    percentFormatter: pct,
  };
}

async function runDiagnostic(referencePath) {
  console.log(`=========================================================`);
  console.log(`🚀 DIAGNOSTIC COMPARATIF DE PIPELINE D'ANALYSE HARMONIQUE`);
  console.log(`=========================================================`);
  console.log(`Fichier de référence : ${referencePath}`);

  if (!fs.existsSync(referencePath)) {
    throw new Error(`Fichier référence inexistant : ${referencePath}`);
  }

  const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
  const rawAudioFile = reference.file;
  const audioFile = sanitizeAudioPath(rawAudioFile);

  if (!fs.existsSync(audioFile)) {
    throw new Error(`Fichier audio introuvable : ${audioFile}\n(chemin original : ${rawAudioFile})`);
  }

  console.log(`Fichier audio associé : ${audioFile}`);
  console.log(`Démarrage de l'analyse multi-pipelines en cours...`);
  console.log();

  const modes = [
    { key: 'legacy', label: 'LEGACY (baseline actuelle)' },
    { key: 'raw', label: 'RAW (HMM brut)' },
    { key: 'grid_half', label: 'GRID_HALF (baseline grille half_bar)' },
    { key: 'grid_norm', label: 'GRID_NORM (half_bar + normalisation structurelle)' },
    { key: 'grid_full', label: 'GRID_FULL (full_bar + normalisation structurelle)' },
  ];

  const results = {};
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    console.log(`⏳ [${i + 1}/${modes.length}] Exécution du pipeline ${mode.label}...`);
    const stdout = await runAudioProcessor(['analyze-chords', audioFile, mode.key]);
    results[mode.key] = JSON.parse(stdout.split('\n').filter(Boolean).pop());
  }

  console.log(`\nAnalyse terminée avec succès !`);

  const isSeqMode = reference.comparison_mode === 'sequence';
  const duration = reference.duration || results.legacy.duration || 60;
  const stats = {};
  for (const mode of modes) {
    stats[mode.key] = isSeqMode
      ? evaluateSequence(reference, results[mode.key])
      : evaluateDetection(reference, results[mode.key], duration);
  }

  // ─── MÉTRIQUES ADDITIONNELLES (segmentsPerMinute, chordsPerMeasure, qualityCounts) ───
  for (const mode of modes) {
    const result = results[mode.key];
    const detDuration = result.duration || duration;
    const bpm = result.tempo || 120;
    const s = stats[mode.key];
    s.segmentsPerMinute = s.segmentsCount / (detDuration / 60);
    const cpm = computeChordsPerMeasure(result.chords, bpm);
    s.structuralChanges = cpm.changes;
    s.chordsPerMeasure = cpm.perMeasure;
    const qc = { maj7: 0, m7: 0, dim: 0, aug: 0, m7b5: 0, dom7: 0, other: 0 };
    for (const seg of result.chords) {
      const chord = seg.chord || '';
      const sfx = parseChord(chord).suffix || '';
      if (sfx === 'maj7') qc.maj7++;
      else if (sfx === 'm7') qc.m7++;
      else if (sfx === 'dim') qc.dim++;
      else if (sfx === 'aug') qc.aug++;
      else if (sfx === 'm7b5') qc.m7b5++;
      else if (sfx === '7') qc.dom7++;
      else if (sfx) qc.other++;
    }
    s.qualityCounts = qc;
  }

  // ─── SAUVEGARDE PRÉ-RAPPORT ───
  const savePrePath = process.argv.find(a => a.startsWith('--save-pre='))?.split('=')[1];
  if (savePrePath) {
    const preData = {
      raw: { chords: results.raw.chords, duration: results.raw.duration, tempo: results.raw.tempo },
      rawStats: stats.raw,
    };
    fs.writeFileSync(savePrePath, JSON.stringify(preData, null, 2));
    console.log(`\n✅ Pré-rapport sauvegardé : ${savePrePath}`);
  }

  // ─── CHARGEMENT BENCHMARK PRÉ ───
  const benchmarkPrePath = process.argv.find(a => a.startsWith('--benchmark-pre='))?.split('=')[1];
  let benchmarkPre = null;
  if (benchmarkPrePath) {
    if (!fs.existsSync(benchmarkPrePath)) {
      console.error(`[Error] Fichier benchmark pré inexistant : ${benchmarkPrePath}`);
    } else {
      benchmarkPre = JSON.parse(fs.readFileSync(benchmarkPrePath, 'utf8'));
      console.log(`\n📂 Benchmark pré chargé : ${benchmarkPrePath}`);
    }
  }

  // ─── AFFICHAGE COMPARAISON ───
  console.log(`\n===================================================================`);
  if (isSeqMode) {
    console.log(`ALIGNEMENT DE SÉQUENCES (mode comparaison par séquence)`);
    console.log(`Référence : ${reference.chords_in_order.length} accords`);
    console.log(`===================================================================`);
    const modeLabels = modes.map(m => m.label.split(' ')[0]);
    const header = `#  | Référence           | ${modeLabels.map(l => l.padEnd(19)).join(' | ')}`;
    console.log(header);
    console.log(`-`.repeat(header.length));
    for (let i = 0; i < reference.chords_in_order.length && i < 65; i++) {
      const refChord = reference.chords_in_order[i];
      const detChords = modes.map(m => {
        const result = results[m.key];
        const detGrids = result.chords || [];
        const detDedup = [];
        for (const seg of detGrids) {
          const chord = seg.chord || seg.structural_chord || 'N';
          if (detDedup.length === 0 || detDedup[detDedup.length - 1] !== chord) detDedup.push(chord);
        }
        return (i < detDedup.length) ? detDedup[i] : '-';
      });
      console.log(`${String(i + 1).padEnd(3)}| ${refChord.padEnd(19)} | ${detChords.map(c => c.padEnd(19)).join(' | ')}`);
    }
    console.log(`⚠️  Les séquences détectées sont alignées par ordre (Needleman-Wunsch), pas par timestamp.`);
  } else {
    console.log(`COMPARAISON DE GRILLES D'ACCORDS (60 premières secondes)`);
    console.log(`===================================================================`);
    const header = `Temps (s)   | Référence           | ${modes.map(m => m.label.split(' ')[0]).map(l => l.padEnd(19)).join(' | ')}`;
    console.log(header);
    console.log(`-`.repeat(header.length));
    for (let t = 0; t < Math.min(duration, 60); t += 2.0) {
      const refRaw = getChordAtTime(reference.chords || reference.grid || [], t);
      const cells = [refRaw.padEnd(19)];
      for (const mode of modes) {
        const raw = getChordAtTime(stats[mode.key].rawResult.chords, t);
        cells.push(raw.padEnd(19));
      }
      console.log(`${t.toFixed(1).padEnd(11)} | ${cells.join(' | ')}`);
    }
  }
  console.log(`===================================================================`);

  // ─── TABLEAU COMPARATIF SCIENTIFIQUE FINAL ───
  console.log(`\n===================================================================`);
  console.log(`TABLEAU COMPARATIF DES PIPELINES HARMONIQUES`);
  console.log(`===================================================================`);
  const modeLabels = modes.map(m => m.label.split(' ')[0]);
  const tableHeader = `Indicateur               | ${modeLabels.map(l => l.padEnd(19)).join(' | ')}`;
  console.log(tableHeader);
  console.log(`-`.repeat(tableHeader.length));

  function printRow(label, key, fmt = (v) => v.toFixed(1)) {
    const cells = modeLabels.map(m => `${fmt(stats[m === 'GRID_HALF' ? 'grid_half' : m.toLowerCase()][key]).padEnd(18)}%`);
    console.log(`${label.padEnd(24)} | ${cells.join(' | ')}`);
  }

  const modeKeys = modes.map(m => m.key);
  function cell(key, fmt = (v) => v.toFixed(1)) {
    return modeKeys.map(k => {
      const val = stats[k][key];
      if (val === 'N/A') return 'N/A'.padEnd(19);
      return `${fmt(val).padEnd(18)}%`;
    });
  }

  function row(label, cells) {
    console.log(`${label.padEnd(24)} | ${cells.join(' | ')}`);
  }

  row('Nb segments détectés', cell('segmentsCount', (v) => v.toString()));
  row('Score Fondamentale', cell('scoreFundamental'));
  row('Score Qualité (M/m)', cell('scoreQuality'));
  row('Score Accompagnement', cell('scoreAccompagnement'));
  row('Score Expert', cell('scoreExpert'));
  row(' - Matchs parfaits', cell('matchExact'));
  row(' - Matchs simplifiés', cell('matchSimplified'));
  row(' - Extensions', cell('matchExtension'));
  row(' - Suspensions', cell('matchSuspension'));
  row('Stabilité (Timing)', cell('timingStability'));
  row('Mauvaises fondamentales', cell('wrongRoot'));
  row('Mauvaises qualités (M/m)', cell('wrongQuality'));
  row('Mismatchs silence (N)', cell('silenceMismatch'));
  row('Segments/min', cell('segmentsPerMinute'));
  row('Changements/mesure', cell('chordsPerMeasure'));

  console.log(`-------------------------------------------------------------------`);
  const blockVal = (key) => modeKeys.map(k => stats[k][key] === 'N/A' ? 'N/A'.padEnd(19) : String(stats[k][key]).padEnd(19));
  row('Blocs de référence', blockVal('totalRefBlocks'));
  row('Blocs fragmentés', blockVal('fragmentedRefBlocks'));
  row('Faux changements', blockVal('totalFalseTransitions'));

  console.log(`-------------------------------------------------------------------`);
  const simplificationLabels = { NONE: 'Aucune', EXTENSION: 'Extensions', SUSPENSION: 'Suspensions', FUNDAMENTAL_QUALITY: 'Qualité fond.', UNKNOWN: 'Inconnue' };
  if (isSeqMode) {
    const naCells = modeKeys.map(() => 'N/A'.padEnd(19));
    console.log(`⚠️  Mode comparaison par séquence — métriques temporelles non applicables`);
    for (const [, label] of Object.entries(simplificationLabels)) {
      console.log(`${label.padEnd(24)} | ${naCells.join(' | ')}`);
    }
  } else {
    for (const [type, label] of Object.entries(simplificationLabels)) {
      const total = modeKeys.reduce((sum, k) => sum + (stats[k].simplificationExposure[type] || 0), 0);
      if (total > 0) {
        const cells = modeKeys.map(k => {
          const seconds = stats[k].simplificationExposure[type] || 0;
          return `${seconds.toFixed(1)}s`.padEnd(19);
        });
        console.log(`${label.padEnd(24)} | ${cells.join(' | ')}`);
      }
    }
  }

  for (const mode of modes) {
    const agg = results[mode.key].aggregation;
    if (agg) {
      console.log(`-------------------------------------------------------------------`);
      console.log(`Détails agrégation ${mode.label.split(' ')[0]} :`);
      console.log(` - Subdivision : ${agg.method}`);
      console.log(` - Fenêtre d'intégration : ${agg.window ? agg.window.toFixed(2) : 'N/A'}s`);
      console.log(` - Réduction : ${agg.source_segments} segments source ➔ ${agg.output_segments} segments final`);
      console.log(` - Normalisation structurelle : ${agg.normalization ? 'OUI' : 'NON'}`);
    }
  }
  console.log(`===================================================================`);

  // ─── RAPPORT RAW — QUALITÉS ÉTENDUES + CANDIDATS ───
  const rawResult = results.raw;
  if (rawResult && rawResult.chords) {
    const qualityCount = { maj7: 0, m7: 0, dim: 0, aug: 0, m7b5: 0 };
    const tightCompetitions = [];
    for (const seg of rawResult.chords) {
      const chord = seg.chord || '';
      for (const q of Object.keys(qualityCount)) {
        if (chord.includes(q)) qualityCount[q]++;
      }
      const candidates = seg.observation_candidates || [];
      if (candidates.length >= 2) {
        const gap = candidates[0].emission_score - candidates[1].emission_score;
        if (gap < 0.05 && gap >= 0) {
          tightCompetitions.push({ time: seg.startTime, candidates, viterbi: seg.viterbi_choice || chord, gap });
        }
      }
    }
    console.log(`\n📊 RAPPORT RAW — HMM BRUT (qualités étendues)`);
    console.log(`-------------------------------------------------------------------`);
    const totalSeg = rawResult.chords.length;
    for (const [q, cnt] of Object.entries(qualityCount)) {
      const pct = totalSeg > 0 ? ((cnt / totalSeg) * 100).toFixed(1) : '0.0';
      console.log(`${q.padEnd(6)} : ${String(cnt).padStart(4)} segments (${pct}%)`);
    }
    if (tightCompetitions.length > 0) {
      console.log(`\n🔍 Top 3 candidats concurrents serrés (écart < 0.05) :`);
      const displayed = tightCompetitions.slice(0, 3);
      for (const tc of displayed) {
        console.log(`  Segment @ ${tc.time.toFixed(1)}s (écart #1↔#2 = ${tc.gap.toFixed(3)}) :`);
        tc.candidates.forEach((c, i) => {
          const marker = i === 0 ? '→' : ' ';
          console.log(`    ${marker} #${i + 1} ${c.chord.padEnd(14)} (${c.emission_score.toFixed(3)})`);
        });
        console.log(`    Choix Viterbi : ${tc.viterbi}`);
      }
    } else {
      console.log(`\n🔍 Aucun candidat serré (écart < 0.05) observé dans RAW.`);
    }
  }

  // ─── BILAN SCIENTIFIQUE PAR ÉTAPE ───
  console.log(`\n🔬 BILAN ET VALIDATION DES HYPOTHÈSES :`);
  console.log(`-------------------------------------------------------------------`);

  const half = stats.grid_half;
  const norm = stats.grid_norm;
  const full = stats.grid_full;
  const legacy = stats.legacy;
  const raw = stats.raw;

  if (isSeqMode) {
    console.log(`⚠️  Mode séquence — métriques basées sur alignement Needleman-Wunsch (${reference.chords_in_order.length} accords référence).`);
    console.log(`    Les métriques temporelles (fragmentation, stabilité, silence) ne sont pas applicables.`);

    console.log(`\n[1] Effet de l'agrégation (LEGACY → RAW) :`);
    const deltaRawSeq = raw.scoreAccompagnement === 'N/A' ? 0 : raw.scoreAccompagnement - legacy.scoreAccompagnement;
    console.log(`    Δ Score Accompagnement LEGACY → RAW : ${deltaRawSeq > 0 ? '+' : ''}${deltaRawSeq.toFixed(1)}%`);

    console.log(`\n[2] Effet isolé de la normalisation structurelle (GRID_HALF → GRID_NORM) :`);
    const deltaNormSeq = norm.scoreAccompagnement - half.scoreAccompagnement;
    console.log(`    Δ Score Accompagnement : ${deltaNormSeq > 0 ? '+' : ''}${deltaNormSeq.toFixed(1)}%`);
    if (deltaNormSeq > 0) {
      console.log(`    ✅ La normalisation structurelle améliore le score sur ce morceau.`);
    } else if (deltaNormSeq < 0) {
      console.log(`    📉 La normalisation dégrade le score — les votes groupés sont moins précis sur ce morceau.`);
    } else {
      console.log(`    ➡️  Aucun effet mesuré de la normalisation (Δ = 0).`);
    }

    console.log(`\n[3] Effet de full_bar vs half_bar (GRID_NORM → GRID_FULL) :`);
    const deltaFullSeq = full.scoreAccompagnement - norm.scoreAccompagnement;
    const deltaSegSeq = full.segmentsCount - norm.segmentsCount;
    console.log(`    Δ Score Accompagnement : ${deltaFullSeq > 0 ? '+' : ''}${deltaFullSeq.toFixed(1)}%`);
    console.log(`    Δ Nb accords dédupliqués : ${deltaSegSeq > 0 ? '+' : ''}${deltaSegSeq}`);
    if (deltaFullSeq > 0 && deltaSegSeq <= 0) {
      console.log(`    ✅ full_bar améliore la précision et réduit le nombre d'accords.`);
    } else if (deltaFullSeq > 0) {
      console.log(`    📈 full_bar améliore le score global.`);
    } else {
      console.log(`    📉 full_bar ne bénéficie pas à ce morceau en mode séquence.`);
    }

    console.log(`\n[4] Comparatif global vs LEGACY :`);
    const bestSeq = full.scoreAccompagnement >= norm.scoreAccompagnement ? full : norm;
    const bestKeySeq = full.scoreAccompagnement >= norm.scoreAccompagnement ? 'GRID_FULL' : 'GRID_NORM';
    console.log(`    Meilleur pipeline testé : ${bestKeySeq}`);
    console.log(`    Δ Score Accompagnement vs LEGACY : ${(bestSeq.scoreAccompagnement - legacy.scoreAccompagnement) > 0 ? '+' : ''}${(bestSeq.scoreAccompagnement - legacy.scoreAccompagnement).toFixed(1)}%`);
    console.log(`    Nb accords référence : ${reference.chords_in_order.length} | Nb accords dédupliqués (RAW) : ${raw.segmentsCount}`);
  } else {
    // Hypothèse 1 : la baseline grid_half reproduit bien les résultats historiques (482 → 332, 27.1%)
    console.log(`[1] Reproductibilité baseline grid_half :`);
    console.log(`    Segments source → sortie : ${results.grid_half.aggregation.source_segments} → ${half.segmentsCount}`);
    console.log(`    Score Accompagnement : ${half.scoreAccompagnement.toFixed(1)}%`);
    const reproOK = half.segmentsCount >= 320 && half.segmentsCount <= 360 && half.scoreAccompagnement >= 25 && half.scoreAccompagnement <= 32;
    console.log(`    ${reproOK ? '✅ Reproductibilité plausible (tolérance ± segments / ± score)' : '⚠️  Écart par rapport aux chiffres historiques (482 → 332, 27.1%) — possible dérive du pipeline'}`);

    // Hypothèse 2 : la normalisation structurelle améliore le score
    console.log(`\n[2] Effet isolé de la normalisation structurelle (GRID_HALF → GRID_NORM) :`);
    const deltaNormTim = norm.scoreAccompagnement - half.scoreAccompagnement;
    const deltaFragNormTim = norm.fragmentedRefBlocks - half.fragmentedRefBlocks;
    console.log(`    Δ Score Accompagnement : ${deltaNormTim > 0 ? '+' : ''}${deltaNormTim.toFixed(1)}%`);
    console.log(`    Δ Blocs fragmentés : ${deltaFragNormTim > 0 ? '+' : ''}${deltaFragNormTim}`);
    if (deltaNormTim > 0 && deltaFragNormTim <= 0) {
      console.log(`    ✅ La normalisation structurelle améliore ou stabilise à la fois la précision et la stabilité.`);
    } else if (deltaNormTim > 0) {
      console.log(`    📈 La normalisation améliore le score mais augmente la fragmentation — à creuser.`);
    } else {
      console.log(`    📉 La normalisation seule ne suffit pas ; le problème est ailleurs (séparation, beat tracking, HMM).`);
    }

    // Hypothèse 3 : full_bar ajoute un bénéfice additionnel
    console.log(`\n[3] Effet additionnel de full_bar (GRID_NORM → GRID_FULL) :`);
    const deltaFullTim = full.scoreAccompagnement - norm.scoreAccompagnement;
    const deltaFragFullTim = full.fragmentedRefBlocks - norm.fragmentedRefBlocks;
    const deltaSegFullTim = full.segmentsCount - norm.segmentsCount;
    console.log(`    Δ Score Accompagnement : ${deltaFullTim > 0 ? '+' : ''}${deltaFullTim.toFixed(1)}%`);
    console.log(`    Δ Blocs fragmentés : ${deltaFragFullTim > 0 ? '+' : ''}${deltaFragFullTim}`);
    console.log(`    Δ Nombre de segments : ${deltaSegFullTim > 0 ? '+' : ''}${deltaSegFullTim}`);
    if (deltaFullTim > 0 && deltaFragFullTim <= 0 && full.segmentsCount <= 80) {
      console.log(`    ✅ full_bar apporte un gain additionnel tout en restant dans la cible 20–80 segments.`);
    } else if (deltaFullTim > 0) {
      console.log(`    📈 full_bar améliore le score mais vérifiez que la grille reste musicalement utile.`);
    } else {
      console.log(`    📉 full_bar ne semble pas bénéfique sur ce morceau.`);
    }

    // Comparatif global
    console.log(`\n[4] Comparatif global vs LEGACY :`);
    const bestTim = full.scoreAccompagnement >= norm.scoreAccompagnement ? full : norm;
    const bestKeyTim = full.scoreAccompagnement >= norm.scoreAccompagnement ? 'GRID_FULL' : 'GRID_NORM';
    console.log(`    Meilleur pipeline testé : ${bestKeyTim}`);
    console.log(`    Δ Score Accompagnement vs LEGACY : ${(bestTim.scoreAccompagnement - legacy.scoreAccompagnement) > 0 ? '+' : ''}${(bestTim.scoreAccompagnement - legacy.scoreAccompagnement).toFixed(1)}%`);
    console.log(`    Δ Fragmentation vs LEGACY : ${bestTim.fragmentedRefBlocks - legacy.fragmentedRefBlocks}`);
  }
  // ─── FINAL HARMONIC ENGINE BENCHMARK ───
  if (benchmarkPre) {
    const preRaw = benchmarkPre.raw;
    const preStats = benchmarkPre.rawStats;
    const curRaw = stats.raw;
    const curGrid = stats.grid_half;
    const curRawResult = results.raw;
    const curGridResult = results.grid_half;

    const bpm = preRaw.tempo || results.raw.tempo || 120;
    const preCPM = computeChordsPerMeasure(preRaw.chords, bpm);
    const curCPM = computeChordsPerMeasure(curRawResult.chords, bpm);
    const gridCPM = computeChordsPerMeasure(curGridResult.chords, bpm);
    const preSPM = preStats.segmentsCount / ((preRaw.duration || 60) / 60);

    console.log(`\n=========================================================`);
    console.log(`FINAL HARMONIC ENGINE BENCHMARK`);
    console.log(`=========================================================`);
    const hdr = `Pipeline                   Score    Fond.    Segm.  Chg/m  Seg/min`;
    console.log(hdr);
    console.log(`-`.repeat(hdr.length));
    const rows = [
      ['RAW enrichi (avant régul.)', preStats.scoreAccompagnement, preStats.scoreFundamental, preStats.segmentsCount, preCPM.perMeasure, preSPM],
      ['RAW + régularisation',       curRaw.scoreAccompagnement,      curRaw.scoreFundamental,      curRaw.segmentsCount,      curCPM.perMeasure, curRaw.segmentsPerMinute],
      ['GRID_HALF + régul.',         curGrid.scoreAccompagnement,     curGrid.scoreFundamental,     curGrid.segmentsCount,     gridCPM.perMeasure, curGrid.segmentsPerMinute],
    ];
    for (const [n, sc, fd, sg, cp, sp] of rows) {
      console.log(`${n.padEnd(26)} ${sc.toFixed(1).padStart(6)}% ${fd.toFixed(1).padStart(6)}% ${String(sg).padStart(5)} ${cp.toFixed(2).padStart(5)} ${sp.toFixed(1).padStart(6)}`);
    }

    const qc = curRaw.qualityCounts || {};
    console.log(`\nQualités détectées (RAW + régul.) :`);
    console.log(`  maj7:${qc.maj7}  m7:${qc.m7}  dim:${qc.dim}  m7b5:${qc.m7b5}  dom7:${qc.dom7}  autres:${qc.other}`);
    console.log(`  Changements structurels totaux : ${curCPM.changes}`);

    console.log(`\nTIMELINE COMPARATIVE (15 premières secondes, RAW)`);
    console.log(`-----------------------------------------------------------------`);
    console.log(`AVANT (sans régularisation) :`);
    for (const s of preRaw.chords) {
      if (s.startTime < 16) console.log(`  ${s.startTime.toFixed(1).padStart(5)}-${s.endTime.toFixed(1).padStart(5)} : ${(s.chord||'N').padEnd(12)}`);
    }
    console.log(`\nAPRÈS (avec régularisation) :`);
    for (const s of curRawResult.chords) {
      if (s.startTime < 16) console.log(`  ${s.startTime.toFixed(1).padStart(5)}-${s.endTime.toFixed(1).padStart(5)} : ${(s.chord||'N').padEnd(12)}`);
    }

    console.log(`\n=================================================================`);
    console.log(`BASELINE OFFICIELLE — ${new Date().toISOString().split('T')[0]}`);
    console.log(`=================================================================`);
    console.log(`Moteur     : audio-processor.py (10 qualités, 109 états, régularisation)`);
    console.log(`Diagnostic : test-analysis-diagnostic.js`);
    console.log(`Cette version devient la référence pour toutes les futures évolutions.`);
    console.log(`=================================================================`);
  }
  console.log(`===================================================================`);
}

// Lancement à partir d'un argument (ignore les flags --save-pre et --benchmark-pre)
const refArg = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!refArg) {
  console.error('Usage : node scripts/test-analysis-diagnostic.js <chemin_reference.json> [--save-pre=<path>] [--benchmark-pre=<path>]');
  process.exit(1);
}

runDiagnostic(refArg).catch((err) => {
  console.error('[Error]', err.message);
  process.exit(1);
});
