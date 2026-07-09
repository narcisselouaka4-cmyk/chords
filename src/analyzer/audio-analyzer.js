// [Claude] — 2026-07-08 — Abstraction du moteur d'analyse audio d'accords.
// L'objectif est de pouvoir remplacer l'algorithme simple (templates chromagramme)
// par un modèle plus avancé (Basic Pitch, transcription ML, etc.) sans modifier
// le reste de l'application.

/**
 * Résultat d'analyse d'un accord :
 * {
 *   startTime: number,
 *   endTime: number,
 *   chord: string,
 *   confidence: number,
 *   analysis: {},        // réservé pour données enrichies futures
 *   suggestions: [],     // réservé pour suggestions futures
 *   reharmonizations: [],// réservé pour réharmonisations futures
 *   voiceLeading: {},    // réservé pour voice leading futur
 *   techniques: []       // réservé pour techniques futures
 * }
 */

export class AudioAnalyzer {
  /**
   * Analyse un fichier media et retourne un objet enrichi.
   * @param {string} filePath — chemin vers le fichier original (mp3, mp4, wav, m4a...)
   * @returns {Promise<{
   *   wavPath: string,
   *   duration: number,
   *   tempo: number|null,
   *   timeSignature: string,
   *   key: string|null,
   *   keyConfidence: number,
   *   confidence: number,
   *   chords: Array
   * }>}
   */
  async analyze(filePath) {
    throw new Error('AudioAnalyzer.analyze() must be implemented by subclass');
  }
}

/**
 * Implémentation par défaut : analyse via le processeur Python (chromagramme + templates).
 */
export class TemplateAudioAnalyzer extends AudioAnalyzer {
  async analyze(filePath, options = {}) {
    if (!window.electronAPI?.analyzer?.processFile) {
      throw new Error('processFile IPC non disponible');
    }
    const opts = { analyzeBass: true, ...options };
    const result = await window.electronAPI.analyzer.processFile(filePath, opts);
    const keyCandidates = (result.keyCandidates || [])
      .filter((c) => c.name !== result.key)
      .slice(0, 3)
      .map((c) => ({
        name: c.name ?? '?',
        mode: c.mode ?? 'major',
        confidence: c.confidence ?? 0,
      }));

    return {
      wavPath: result.wavPath || '',
      analysisWavPath: result.analysisWavPath || result.wavPath || '',
      usedPianoStem: result.usedPianoStem ?? false,
      usedBassStem: result.usedBassStem ?? false,
      duration: result.duration ?? 0,
      tempo: result.tempo ?? null,
      timeSignature: result.timeSignature ?? '4/4',
      key: result.key ?? null,
      keyMode: result.keyMode ?? 'major',
      keyConfidence: result.keyConfidence ?? 0,
      keyCandidates,
      confidence: result.confidence ?? 0,
      chords: (result.chords || []).map((c) => ({
        startTime: c.startTime ?? 0,
        endTime: c.endTime ?? 0,
        chord: c.chord || '?',
        structuralChord: c.structural_chord || c.structuralChord || null,
        confidence: c.confidence ?? 0,
        analysis: c.analysis || {},
        techniques: c.techniques || [],
        suggestions: c.suggestions || [],
        reharmonizations: c.reharmonizations || [],
        voiceLeading: c.voiceLeading || {},
      })),
      bassSegments: (result.bassSegments || []).map((s) => ({
        startTime: s.startTime ?? 0,
        endTime: s.endTime ?? 0,
        midi: s.midi ?? 0,
        note: s.bass || s.note || '?',
        octave: s.octave ?? 0,
        confidence: s.confidence ?? 0,
        source: s.source || 'bass_engine',
        isVirtual: s.isVirtual ?? false,
      })),
    };
  }
}

/**
 * Factory : retourne l'analyseur actif du projet.
 * Pour l'instant, c'est toujours TemplateAudioAnalyzer.
 */
export function createAudioAnalyzer() {
  return new TemplateAudioAnalyzer();
}
