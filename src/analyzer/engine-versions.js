// Jumeau JS de ENGINE_VERSION (electron/audio-processor.py). Les deux
// doivent évoluer ensemble : dès que le moteur Python change la sortie
// d'analyse (accords, tonalités locales, modulations…), il réécrit
// ENGINE_VERSION ici en miroir. La restauration d'une analyse enregistrée
// (.pjc.json) refuse toute analyse portant une autre version : elle est
// recalculée, puis resauvegardée avec la bonne (chord-editor.js persiste
// analysis.engine via PERSISTED_ANALYSIS_FIELDS).
export const ANALYSIS_ENGINE_VERSION = 'ADR-061-triades-4';
