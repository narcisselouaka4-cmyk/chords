import {reviewTake} from '../recorder/take-review.js';
import {extractKey} from './intent-classifier.js';
import {parseChordName} from './note-roles.js';
const pc=n=>(n%12+12)%12;
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Sol♭','Sol','La♭','La','Si♭','Si'];

/** Le mode d'une métadonnée ne doit pas remplacer la tierce réellement jouée. */
export function sourceKeyConflict(key,chords) {
  return Boolean(key&&chords.some(c=>c.rootPc===key.rootPc
    &&(/^m(?!aj)/.test(c.quality)?!key.minor
      :/^(?:maj|add|$)/.test(c.quality)&&key.minor)));
}

/** Repères pour le modèle, calculés et non présentés comme des ajouts obligatoires. */
export function playingHarmonyFacts(take) {
  if(!take?.events?.length)return [];
  const chords=(reviewTake(take.events)?.chords||[]).map(c=>parseChordName(c.name)).filter(Boolean);
  const unique=[...new Map(chords.map(c=>[c.name,c])).values()].slice(0,24);
  return unique.length?[
    '## Repères harmoniques calculés sur les accords du jeu',
    ...(sourceKeyConflict(extractKey(`en ${take.key||''}`),chords)?[`Le mode de la tonalité indiquée (${take.key}) est contredit par des accords de tonique joués. Ne le présente pas comme une certitude et ne force pas tous les accords dans cette gamme.`]:[]),
    'Ce sont des intervalles depuis la fondamentale, pas nécessairement les notes de l’accord ni des conseils automatiques. Une 13e naturelle est à neuf demi-tons de la fondamentale ; elle peut être hors de la gamme locale. Vérifie la mélodie et la couleur avant de la conseiller. Ne confonds pas une quinte avec une 13e.',
    ...unique.map(c=>`${c.name} : quinte juste ${names[pc(c.rootPc+7)]} ; 9e naturelle ${names[pc(c.rootPc+2)]} ; 11e juste ${names[pc(c.rootPc+5)]} ; 13e naturelle ${names[pc(c.rootPc+9)]}.`),
  ]:[];
}
