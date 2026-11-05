import {realizesChord} from '../practice-exercise.js';
const pc = n => (n % 12 + 12) % 12;

/** Le validateur d'Exercices privilégie certaines basses. Copilot admet aussi
 * le renversement à la septième, sans ajouter une fondamentale absente. */
export function realizesHarmony(notes, rootPc, quality) {
  if (realizesChord(notes, rootPc, quality)) return true;
  const bass = Math.min(...notes);
  if (!notes.some(n => pc(n) === rootPc) || ![10,11].includes(pc(bass-rootPc))
    || !/7|9|11|13/.test(quality)) return false;
  let rootBelow = bass - 1;
  while (pc(rootBelow) !== rootPc) rootBelow--;
  // Le jeu de classes de hauteur est inchangé : seul le contrôle de basse du
  // validateur partagé est neutralisé, sa définition de l'accord est conservée.
  return realizesChord([...notes, rootBelow], rootPc, quality);
}
