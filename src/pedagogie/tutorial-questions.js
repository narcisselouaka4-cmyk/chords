// [Claude] — 2026-10-03 — Pédagogie IA : les questions toutes prêtes du Copilote, à côté
// de la vidéo du prof. Narcisse : « Qu'est-ce qu'il a voulu dire à ce moment-là ? »,
// « C'est quoi ce voicing ? », « Que donnerait ce voicing en Fa dièse alors qu'il est en
// Do ? » et surtout « Comment appliquerait-on ce qu'il vient de faire dans une
// progression 4-5-3-6-2-5-1 ? ». Ce qu'on transfère : ses voicings, ses enchaînements
// (accords de passage), ses licks / runs / fills — pas son rythme (ses choix).
//
// Textes seuls, sans DOM : copilot-tab.js en fait les boutons ; testé dans
// test-tutorial-moment.js.

/** Les douze tonalités, nom anglais (pour l'application) et nom français (affiché). */
export const TUTORIAL_KEYS = [
  { id: 'C', label: 'Do' }, { id: 'Db', label: 'Ré♭' }, { id: 'D', label: 'Ré' },
  { id: 'Eb', label: 'Mi♭' }, { id: 'E', label: 'Mi' }, { id: 'F', label: 'Fa' },
  { id: 'F#', label: 'Fa♯' }, { id: 'G', label: 'Sol' }, { id: 'Ab', label: 'La♭' },
  { id: 'A', label: 'La' }, { id: 'Bb', label: 'Si♭' }, { id: 'B', label: 'Si' },
];

/** Ce que le pianiste veut reprendre du professeur. */
export const TRANSFER_KINDS = [
  { id: 'voicing', label: 'Ses voicings', text: 'ses voicings' },
  { id: 'enchainement', label: 'Son enchaînement', text: 'son enchaînement (ses accords de passage)' },
  { id: 'lick', label: 'Son lick', text: 'son lick (son run, son fill)' },
];

/** Progressions proposées, en degrés (la tonalité est choisie à côté). */
export const TUTORIAL_PROGRESSIONS = ['4-5-3-6-2-5-1', '2-5-1', '1-6-2-5', '3-6-2-5-1', '1-4-5-1'];

/** Nom français d'une tonalité (« F# » → « Fa♯ ») ; texte libre rendu tel quel. */
export function keyLabel(id) {
  const raw = String(id || '').trim();
  const found = TUTORIAL_KEYS.find((k) => k.id.toLowerCase() === raw.toLowerCase() || k.label.toLowerCase() === raw.toLowerCase());
  return found ? found.label : raw;
}

/** Tonalité de la liste la plus proche d'un nom de tonalité détectée (« G major », « Sol »). */
export function keyIdFrom(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const m = raw.match(/^([A-G])([#b♯♭]?)/);
  if (m) {
    const id = `${m[1]}${m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2]}`;
    const enharmonic = { 'C#': 'Db', 'D#': 'Eb', Gb: 'F#', 'G#': 'Ab', 'A#': 'Bb', Cb: 'B', Fb: 'E', 'E#': 'F', 'B#': 'C' };
    const fixed = enharmonic[id] || id;
    return TUTORIAL_KEYS.some((k) => k.id === fixed) ? fixed : null;
  }
  const fr = TUTORIAL_KEYS.find((k) => raw.toLowerCase().startsWith(k.label.toLowerCase()));
  return fr ? fr.id : null;
}

/** « Qu'a-t-il voulu dire ici ? » */
export function whatHeMeantQuestion() {
  return 'Qu\'est-ce que le prof a voulu dire ou montrer dans ce passage ? Explique-le simplement, en partant de ce qu\'il joue.';
}

/** « C'est quoi ce voicing ? » */
export function voicingQuestion() {
  return 'C\'est quoi le voicing qu\'il joue dans ce passage ? Donne le rôle de chaque note, main par main, et pourquoi il sonne comme ça.';
}

/** « Dans une autre tonalité… » */
export function otherKeyQuestion(keyId) {
  return `Que donnerait ce passage en ${keyLabel(keyId)} ? Fais-le-moi entendre et explique ce qui change.`;
}

/**
 * « Applique-le à une progression… »
 * @param {{kind?: string, progression?: string, key?: string}} choice
 */
export function applyQuestion({ kind = 'voicing', progression = '4-5-3-6-2-5-1', key = 'C' } = {}) {
  const what = (TRANSFER_KINDS.find((k) => k.id === kind) || TRANSFER_KINDS[0]).text;
  const prog = String(progression || '').trim() || '4-5-3-6-2-5-1';
  const isDegrees = /^\d(\s*-\s*\d)+$/.test(prog);
  return `Comment appliquer ${what} de ce passage à une progression ${prog}${isDegrees ? ` en ${keyLabel(key)}` : ''} ? Fais-la-moi entendre.`;
}

/**
 * Les questions rapides du mode tutoriel : deux qui partent d'un clic, deux qui
 * ouvrent un petit choix (tonalité ; quoi, quelle progression, quelle tonalité).
 */
export const TUTORIAL_QUICK_ACTIONS = [
  { label: 'Qu\'a-t-il voulu dire ?', message: whatHeMeantQuestion() },
  { label: 'Ce voicing ?', message: voicingQuestion() },
  { label: 'Autre tonalité…', chooser: 'key' },
  { label: 'Appliquer à une progression…', chooser: 'apply' },
];
