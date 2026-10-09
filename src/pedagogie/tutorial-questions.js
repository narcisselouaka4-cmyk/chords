// [Claude] — 2026-10-03 — Pédagogie IA : les questions toutes prêtes du Copilote, à côté
// de la vidéo du prof. Narcisse : « Qu'est-ce qu'il a voulu dire à ce moment-là ? »,
// « C'est quoi ce voicing ? », « Que donnerait ce voicing en Fa dièse alors qu'il est en
// Do ? » et surtout « Comment appliquerait-on ce qu'il vient de faire dans une
// progression 4-5-3-6-2-5-1 ? ». Ce qu'on transfère : ses voicings, ses enchaînements
// (accords de passage), ses licks / runs / fills — pas son rythme (ses choix).
//
// Textes seuls, sans DOM : copilot-tab.js en fait les boutons ; testé dans
// test-tutorial-moment.js.
//
// [Claude] — 2026-10-04 — Narcisse : « pour chaque étiquette, il y a une question » qu'on ne
// voit pas, « ça se trouve, ça ne colle pas du tout à ce que je pense ». Son choix : ce qui
// est écrit part. Une étiquette envoie son propre texte ; un choix (tonalité, progression)
// complète la phrase dans la case, qu'on lit avant de l'envoyer.

/** Les douze tonalités, nom anglais (pour l'application) et nom français (affiché). */
export const TUTORIAL_KEYS = [
  { id: 'C', label: 'Do' }, { id: 'Db', label: 'Ré♭' }, { id: 'D', label: 'Ré' },
  { id: 'Eb', label: 'Mi♭' }, { id: 'E', label: 'Mi' }, { id: 'F', label: 'Fa' },
  { id: 'F#', label: 'Fa♯' }, { id: 'G', label: 'Sol' }, { id: 'Ab', label: 'La♭' },
  { id: 'A', label: 'La' }, { id: 'Bb', label: 'Si♭' }, { id: 'B', label: 'Si' },
];

/** Ce que le pianiste veut reprendre du professeur (le libellé est dans la phrase envoyée). */
export const TRANSFER_KINDS = [
  { id: 'voicing', label: 'Ses voicings', text: 'ses voicings' },
  { id: 'enchainement', label: 'Ses accords de passage', text: 'ses accords de passage' },
  { id: 'lick', label: 'Son lick', text: 'son lick' },
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

/** « Rejoue-le en… » : « Rejoue ce passage en Fa. » */
export function otherKeyQuestion(keyId) {
  return `Rejoue ce passage en ${keyLabel(keyId)}.`;
}

/**
 * « Applique-le à… » : « Applique ses voicings à 4-5-3-6-2-5-1 en Sol. » ; une progression
 * tapée en accords n'a pas de tonalité ajoutée (« Applique son lick à Fmaj7 E7 Am7 D9. »).
 * @param {{kind?: string, progression?: string, key?: string}} choice
 */
export function applyQuestion({ kind = 'voicing', progression = '4-5-3-6-2-5-1', key = 'C' } = {}) {
  const what = (TRANSFER_KINDS.find((k) => k.id === kind) || TRANSFER_KINDS[0]).text;
  const prog = String(progression || '').trim() || '4-5-3-6-2-5-1';
  const isDegrees = /^\d(\s*-\s*\d)+$/.test(prog);
  return `Applique ${what} à ${prog}${isDegrees ? ` en ${keyLabel(key)}` : ''}.`;
}

/**
 * Les étiquettes du mode tutoriel : deux qui envoient leur propre texte, deux qui ouvrent
 * un petit choix (une tonalité ; quoi, quelle progression, quelle tonalité) dont la phrase
 * s'écrit dans la case.
 */
export const TUTORIAL_QUICK_ACTIONS = [
  { label: 'Explique ce passage', message: 'Explique ce passage.' },
  { label: 'Rejoue ce passage', message: 'Rejoue ce passage.' },
  { label: 'Rejoue-le en…', chooser: 'key' },
  { label: 'Applique-le à…', chooser: 'apply' },
];

// ── Ce que demande le pianiste (repli déterministe du Copilote) ─────────────────
// [Claude] — 2026-10-03 — Les questions sur le passage du prof doivent toujours
// recevoir l'outil qui reprend SES notes (apply_tutorial_passage, play_tutorial_passage),
// même quand le modèle n'appelle aucun outil ou en choisit un autre (play_progression
// jouerait des voicings de l'application, pas ceux du prof).

// Une tonalité écrite : « Fa♯ », « Fa dièse », « Si bémol », « Sol mineur », « F# », « Bb », « Am ».
const KEY_TEXT = String.raw`(?:(?:[Dd]o|[Rr][ée]|[Mm]i|[Ff]a|[Ss]ol|[Ll]a|[Ss]i)(?:\s*(?:dièse|diese|bémol|bemol)|[#♯♭]|b(?![a-zé]))?|[A-G][#♯b♭]?)(?:\s*(?:mineur|majeur|minor|major)|m(?![a-zé]))?(?![a-zA-Zé#♯♭])`;
const KEY_AFTER = new RegExp(String.raw`(?:^|[\s'’(])(?:en|dans la (?:gamme|tonalité) d[e'’]\s*|dans le ton d[e'’]\s*|vers)\s*(${KEY_TEXT})`);
// Une progression en degrés : « 4-5-3-6-2-5-1 », « ii-V-I », « IV-V-iii-vi ».
const DEGREES = /(?:^|[^\w-])((?:[1-7]|[iv]{1,3}|[IV]{1,3})(?:\s*-\s*(?:[1-7]|[iv]{1,3}|[IV]{1,3})){1,11})(?![\w-])/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
// Un accord écrit : « Fmaj7 », « E7 », « Am7 », « D9 », « Bb13 », « F#m7b5 », « G7/B ».
const CHORD_TOKEN = /^[A-G][#♯b♭]?(?:maj|M|m|min|dim|aug|sus|ø|°|\+|add)?[0-9]{0,2}(?:(?:maj|sus|add|alt|[#♯b♭])?[0-9]{0,2})*(?:\/[A-G][#♯b♭]?)?$/;

// Rejouer ce que le prof vient de jouer (pas le jeu du pianiste : « ma », « mon », « mes »).
const REPLAY = /reprodui\w*\b(?!(?:-moi)?\s+(?:ma|mon|mes)\b)|rejou\w*\b(?!(?:-moi)?\s+(?:ma|mon|mes)\b)|ce que (?:j'ai|je vien[st]? d'|on vient d')entend|ce qu'il (?:vient de|a) jou|(?:joue|fais)(?:[- ]moi)?(?:[- ]entendre)? ce qu'il/i;

/** « IV-V-iii » → « 4-5-3 » ; « 4 - 5 - 1 » → « 4-5-1 ». */
export function normalizeDegrees(text) {
  const parts = String(text || '').split('-').map((p) => p.trim());
  const nums = parts.map((p) => (/^[1-7]$/.test(p) ? Number(p) : ROMAN[p.toLowerCase()] || null));
  return nums.every(Boolean) ? nums.join('-') : null;
}

/** Ce qu'il veut reprendre du prof, d'après ses mots ; null s'il ne le dit pas. */
function transferKind(text) {
  if (/\b(licks?|runs?|fills?|riffs?|phrases?|traits?|impro)\b/i.test(text)) return 'lick';
  if (/encha[iî]n|accords? de passage|passing|marche|walk|transition|turnaround|cadence/i.test(text)) return 'enchainement';
  if (/voicings?|positions?|renversements?|\baccords?\b|plaqu/i.test(text)) return 'voicing';
  return null;
}

/** La progression cible écrite en accords, après « progression », « grille » ou « sur ». */
function chordListIn(text) {
  const m = /(?:progression|grille|suite d'accords|sur|à|pour)\s*:?\s*([^?.!;\n]+)/i.exec(text);
  if (!m) return null;
  const tokens = m[1].split(/[\s,→>|]+|\s-\s/).map((t) => t.trim()).filter(Boolean);
  const chords = [];
  for (const t of tokens) {
    if (CHORD_TOKEN.test(t)) chords.push(t.replace(/♯/g, '#').replace(/♭/g, 'b'));
    else if (chords.length) break;
  }
  return chords.length >= 2 ? chords : null;
}

/**
 * La demande du pianiste sur le passage du prof, quand elle est claire :
 * - apply : appliquer ses voicings / son enchaînement / son lick à une autre progression ;
 * - otherKey : le passage dans une autre tonalité ;
 * - voicing : « c'est quoi ce voicing ? » ;
 * - meaning : « qu'a-t-il voulu dire ? » (explication seule) ;
 * - replay : « reproduis ce qu'il a joué », « ce que je viens d'entendre » (ses notes, le passage affiché) ;
 * null sinon (le modèle choisit). `at` : le moment cité (« le lick de 1:12 »), en secondes.
 * @param {string} message
 * @returns {({kind: 'apply', what: string|null, progression: string|null, chords: string[]|null, key: string|null}
 *   |{kind: 'otherKey', key: string}|{kind: 'voicing'}|{kind: 'meaning'}|{kind: 'replay'}) & {at?: number}|null}
 */
export function parseTutorialRequest(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const ask = classifyTutorialRequest(text);
  if (!ask) return null;
  const clockMatch = /(?:^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/.exec(text);
  return clockMatch ? { ...ask, at: Number(clockMatch[1]) * 60 + Number(clockMatch[2]) } : ask;
}

function classifyTutorialRequest(text) {
  const keyMatch = KEY_AFTER.exec(text);
  const key = keyMatch ? keyMatch[1].trim() : null;
  const degreesMatch = DEGREES.exec(text);
  const progression = degreesMatch ? normalizeDegrees(degreesMatch[1]) : null;
  const chords = progression ? null : chordListIn(text);
  const transfer = /appliqu|repren|utilis|transf[eéè]r|adapt|r[ée]utilis|mettre|placer|ferai[st]?|donnerai[st]?|jouerai[st]?|serai[st]?|marcherai[st]?/i.test(text)
    || /(?:dans|sur|à|a|pour) (?:une|un|la|le|ma|mon) (?:progression|grille|suite)/i.test(text);
  if ((progression || chords) && transfer) {
    return { kind: 'apply', what: transferKind(text), progression, chords, key };
  }
  // Une progression nommée sans « appliquer » (« joue-moi un 2-5-1 en Do ») : une
  // question générale, pas ce passage dans une autre tonalité.
  // [Claude] — 2026-10-04 — « Rejoue ce passage en Fa » (l'étiquette « Rejoue-le en… ») : ce
  // passage dans une autre tonalité, pas un simple rejeu.
  if (key && !progression && !chords && (REPLAY.test(text) || /donnerai|transpos|autre tonalit|dans la (?:gamme|tonalité)|dans le ton|jou(?:e|er)[- ](?:le|la|les|moi)|(?:le|la|les|l')\s*jouer|fais[- ](?:le|la|les)[- ]moi|entendre/i.test(text))) {
    return { kind: 'otherKey', key };
  }
  // [Claude] — 2026-10-03 — « Reproduis ce qu'il a joué », « peux-tu reproduire ce que je viens
  // d'entendre ? » (vidéo de Narcisse), « rejoue ce passage » : SES notes, sur le passage
  // affiché. « Rejoue ma mélodie » parle du jeu du pianiste (play_my_playing) : exclu.
  if (REPLAY.test(text)) return { kind: 'replay' };
  if (/c'est quoi (?:ce|le|son|cet|cette) (?:voicing|accord)|quel (?:est )?(?:ce |le |son )?voicing|(?:ce|son) voicing ?\?|comment (?:il|le prof) (?:pose|construit|joue|voice) (?:cet? accord|ce voicing)/i.test(text)) {
    return { kind: 'voicing' };
  }
  if (/voulu (?:dire|montrer)|qu'est-ce qu'il (?:dit|veut dire|montre|explique)|que (?:dit|veut dire|montre)-t-il|(?:explique|r[ée]explique)(?:-moi)? (?:ce qu'il|ce passage|ce moment)/i.test(text)) {
    return { kind: 'meaning' };
  }
  return null;
}
