// Style Close-v1 du Two-Hand Piano Voicing Engine.
// Re-exporte le générateur close et ses utilitaires pour permettre une
// organisation modulaire des styles futurs.

export {
  CLOSE_GENERATOR_ID,
  CLOSE_CANDIDATE_BUDGET,
  RH_TARGET_CENTER,
  midiInstancesInRange,
  generateRotations,
  generateRightHandCandidates,
  rankCandidate,
  generateCloseVoicing,
} from '../candidate-generator.js';

export { generateCloseVoicing as default } from '../candidate-generator.js';
