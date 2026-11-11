// [Claude] — 2026-09-09 — Classificateur d'intention pour le Copilot IA.
//
// Détermine l'intention derrière un message utilisateur sans appel réseau.
// Approche hybride : règles rapides + Naive Bayes entraînable.
// Sortie : { intent, params } avec params.chordSymbol, styleId, technique, etc.

import { extractChordSymbol, isChordSymbolRecognized } from './chord-parser-v2.js';

const INTENTS = Object.freeze([
  'play_progression',
  'play_voicing',
  'play_lick',
  'play_note',
  'explain',
  'suggest',
  'unknown',
]);

// Mots-racines par intention. Pas de phrases exactes : des familles de mots.
const INTENT_KEYWORDS = {
  play_progression: [
    'progression', 'enchaînement', 'enchainement', 'suite d\'accords', 'suite deaccords',
    'ii-v-i', 'ii v i', '2 5 1', '2-5-1', 'ii-v', 'ii v',
    'guide tone', 'guide tones', '7 vers 3', '7 → 3', '7 to 3', '3 vers 7',
    'résolution', 'resolution', 'mouvement harmonique', 'cycle', 'turnaround',
  ],
  play_voicing: [
    'accord', 'voicing', 'drop', 'rootless', 'quartal', 'plaqué', 'plaquer',
    'démonstration', 'démo', 'montre', 'montrez', 'joue', 'jouez', 'fais entendre',
    'harmonie', 'position', 'main gauche', 'main droite', 'accompagnement',
    'chord', 'voicings', 'position',
  ],
  play_lick: [
    'lick', 'riff', 'fill', 'phrase', 'mélodie', 'mélodique', 'solo',
    'ornement', 'passage', 'motif', 'pattern', 'impro', 'improviser',
    'riffs', 'licks', 'fills', 'sujet d\'un lick', 'idée de lick',
  ],
  explain: [
    'explique', 'explication', 'qu\'est-ce', 'questce', 'quest-ce', 'définition',
    'comment', 'pourquoi', 'différence', 'c\'est quoi', 'cest quoi', 'signifie',
    'theorie', 'théorie', 'notion', 'concept', 'comprendre', 'expliquer',
  ],
  suggest: [
    'suggère', 'suggestion', 'propose', 'proposition', 'idée', 'quoi faire',
    'ensuite', 'maintenant', 'par où', 'par ou', 'commencer',
  ],
  play_note: [
    'note', 'notes', 'intervalle', 'arpège', 'arpéger',
    'ton', 'midi', 'hauteur',
    'gamme de', 'échelle de', 'scale de', 'scale of', 'gamme majeure', 'gamme mineure',
    'do majeur', 'ré mineur', 'mi majeur', 'fa majeur', 'sol majeur', 'la mineur', 'si mineur',
  ],
};

// Déclencheurs très forts (boost immédiat).
const STRONG_TRIGGERS = {
  play_progression: [/\b(ii-v-i|ii\s+v\s+i|2-5-1|2\s+5\s+1|guide\s+tone|7\s*→\s*3|7\s+vers\s+3|7\s+to\s+3)\b/i],
  play_voicing: [/^\s*[A-G][#b]?[^\s]*\s*$/, /\b(voicing|drop\s*2|drop\s*3|rootless|quartal)\b/i],
  play_lick: [/\b(lick|riff|fill|solo)\b/i],
  explain: [/\b(qu'est-ce|questce|comment|pourquoi|différence)\b/i],
};

// Score minimal pour considérer l'intention comme ferme.
const CONFIDENCE_THRESHOLD = 0.15;

/**
 * Tokenise un texte en mots normalisés.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôöùûüç0-9\s#\-]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Calcule un score simple par famille de mots-clés.
 * @param {string} text
 * @returns {Record<string, number>}
 */
function keywordScores(text) {
  const tokens = tokenize(text);
  const scores = {};
  for (const intent of Object.keys(INTENT_KEYWORDS)) {
    let score = 0;
    for (const token of tokens) {
      for (const kw of INTENT_KEYWORDS[intent]) {
        if (kw.includes(' ')) {
          // Expression multi-mots : on la cherche dans le texte original.
          if (text.toLowerCase().includes(kw)) score += 1;
        } else if (token === kw || token.startsWith(kw)) {
          score += 1;
        }
      }
    }
    scores[intent] = score / Math.max(1, tokens.length);
  }
  return scores;
}

/**
 * Applique les déclencheurs forts pour booster un score.
 * @param {string} text
 * @param {Record<string, number>} scores
 */
function applyStrongTriggers(text, scores) {
  for (const [intent, patterns] of Object.entries(STRONG_TRIGGERS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        scores[intent] = (scores[intent] || 0) + 2;
      }
    }
  }
}

// [Claude] — 2026-09-24 — Accords écrits en solfège (« Rém7 », « Sol7 », « Mib7 »,
// « Domaj7 ») → notation des grilles (Dm7, G7, Eb7, Cmaj7). Un nom de note seul
// (« Do », « La », « Sib ») ou un mot (« la », « il y a ») n'est pas un accord :
// le parseur lisait « a » comme La majeur et « Do » comme Ré diminué.
const SOLFEGE_LETTERS = { do: 'C', re: 'D', 'ré': 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
function normalizeChordToken(token) {
  const m = String(token || '').match(/^(do|ré|re|mi|fa|sol|la|si)(#|b|♯|♭)?(.*)$/i);
  if (m) {
    const [, name, acc = '', rest] = m;
    if (!/^(maj|min|m|dim|aug|sus|add|[0-9]|[+°øΔ])/i.test(rest)) return null;
    return `${SOLFEGE_LETTERS[name.toLowerCase()]}${acc.replace('♯', '#').replace('♭', 'b')}${rest}`;
  }
  if (/^[a-g]$/.test(token)) return null;
  // « dm7 g7 cmaj7 » tapé en minuscules : la fondamentale en majuscule.
  return String(token).replace(/^[a-g](?=[#b]?(?:maj|min|m|dim|aug|sus|add|[0-9]|[+°øΔ]|$))/, (c) => c.toUpperCase());
}

// [Claude] — 2026-11-11 — Accord nommé en toutes lettres : « Do majeur 7 », « la mineur 7 »,
// « sol septième », « un ré mineur », « accord de Fa ». Un débutant n'écrit pas « Cmaj7 ».
// Une tonalité (« en Do majeur », « gamme de ré mineur ») n'est pas un accord : il faut une
// extension (7, 9…), ou un mot qui désigne l'accord (« accord de », « un », « le »).
const FR_QUALITY = { majeur: 'M', majeure: 'M', maj: 'M', mineur: 'm', mineure: 'm', min: 'm' };
const FR_EXTENSION = { 6: '6', 7: '7', 9: '9', 11: '11', 13: '13', sixte: '6', septieme: '7', sept: '7', '7e': '7', '7eme': '7', neuvieme: '9', '9e': '9', '9eme': '9' };
const FR_CHORD = /(?:\b(accords?|renversements?|voicings?|positions?|arpeges?)\s+(?:de|du|d un|en)\s+|\b(un|le|ce|du)\s+)?\b(do|re|mi|fa|sol|la|si)(?:\s?(#|b|diese|bemol)(?![a-z]))?(?![a-z])((?:\s*(?:majeure?|mineure?|maj|min|6|7|9|11|13|sixte|septieme|sept|7e|7eme|neuvieme|9e|9eme)(?![a-z0-9])){0,3})/g;

/**
 * Symbole de l'accord nommé en français dans un texte, ou null.
 * @param {string} text
 * @returns {string|null}
 */
export function frenchChordSymbol(text) {
  const folded = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase();
  for (const m of folded.matchAll(FR_CHORD)) {
    const [, noun, article, name, accidental = '', tail = ''] = m;
    const words = tail.trim().split(/\s+/).filter(Boolean);
    const quality = words.map((w) => FR_QUALITY[w]).find(Boolean) || '';
    const extension = words.map((w) => FR_EXTENSION[w]).find(Boolean) || '';
    // « en la mineur » (tonalité), « la » (article), « si » (conjonction) : pas un accord.
    if (!extension && !noun && !(article && quality)) continue;
    if (!noun && !article && !quality && AMBIGUOUS_KEY_WORDS.has(name)) continue;
    const before = folded.slice(Math.max(0, m.index - 14), m.index);
    if (!noun && /(?:gamme|tonalite|ton|mode)\s+(?:de\s+)?$|\b(?:en|in)\s+$/.test(before)) continue;
    const root = `${SOLFEGE_LETTERS[name]}${accidental === 'diese' ? '#' : accidental === 'bemol' ? 'b' : accidental}`;
    const suffix = quality === 'M' ? (extension === '7' ? 'maj7' : extension === '9' ? 'maj9' : extension) : `${quality}${extension}`;
    const symbol = `${root}${suffix}`;
    if (isChordSymbolRecognized(symbol)) return symbol;
  }
  return null;
}

/**
 * Détecte les paramètres musicaux dans le texte.
 * @param {string} text
 * @returns {{
 *   chordSymbol?: string,
 *   chords?: string[],
 *   focus?: string,
 *   styleId?: string,
 *   technique?: string,
 *   hand?: string,
 *   difficulty?: string,
 *   pattern?: string,
 *   lengthBeats?: number,
 * }}
 */
function extractParams(text) {
  const params = {};
  // [Claude] — 2026-11-11 — « II–V–I » tapé avec des tirets typographiques (clavier de téléphone,
  // copier-coller) n'était pas lu : aucune progression, donc aucun exemple.
  text = String(text || '').replace(/[‐‑‒–—−]/g, '-');
  // « Do majeur 7 », « un la mineur », « accord de Fa » : le nom français vaut le symbole.
  const chord = extractChordSymbol(text) || frenchChordSymbol(text);
  if (chord) params.chordSymbol = chord;

  // Extraction d'une liste d'accords pour play_progression.
  // Stratégie 1 : accords explicites séparés par espaces/virgules/tirets.
  const progressionTokens = String(text || '')
    .split(/[\s,;→|]+/)
    .map((t) => t.replace(/^[\-\u2013\u2014]+|[\-\u2013\u2014.!?]+$/g, ''))
    .filter(Boolean);
  const recognizedProgression = progressionTokens
    .map(normalizeChordToken)
    .filter((t) => t && isChordSymbolRecognized(t));
  if (recognizedProgression.length >= 2) {
    params.chords = recognizedProgression;
  } else {
    // Stratégie 2 : patterns ii-V-I, II-V-I, 2-5-1, etc.
    const lower = String(text || '').toLowerCase();
    const romanPattern = /(?:^|[^a-z0-9#b])(ii|iii|iv|vi|vii|ii|i|v)\s*(?:-|\s)\s*(v|iv|iii|ii|i|vii)\s*(?:-|\s)\s*(i|ii|iii|iv|v|vi|vii)(?![a-z0-9#b])/i;
    const numericPattern = /(?:^|[^a-z0-9#b])(2|3|4|5|6|7)\s*(?:-|\s)\s*(5|2|4|3|6|7)\s*(?:-|\s)\s*(1|2|3|4|5|6|7)(?![a-z0-9#b])/i;
    if (romanPattern.test(lower) || numericPattern.test(lower)) {
      // Tonalité par défaut : Do majeur si aucune mention.
      const key = extractKey(text);
      if (key) params.key = key;
      // [Claude] — 2026-09-25 — « II-V-I mineur en la », « 2-5-1 mineur » : le mode
      // écrit juste après la cadence compte aussi (avant, seul « en la mineur » le donnait).
      const minor = Boolean(key?.minor)
        || /(?:ii\s*-?\s*v\s*-?\s*i|2\s*-?\s*5\s*-?\s*1)\s+(?:mineur|minor)/.test(lower);
      const romanMap = minor
        ? { I: 'm7', II: 'm7b5', III: 'maj7', IV: 'm7', V: '7', VI: 'maj7', VII: '7' }
        : { I: 'maj7', II: 'm7', III: 'm7', IV: 'maj7', V: '7', VI: 'm7', VII: 'm7b5' };
      const numericMap = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].map((d) => romanMap[d]);
      let degrees;
      let suffixes;
      const romanMatch = lower.match(romanPattern);
      const numericMatch = lower.match(numericPattern);
      if (romanMatch) {
        degrees = romanMatch.slice(1).map((d) => d.toUpperCase());
        suffixes = degrees.map((d) => romanMap[d] || 'maj7');
      } else {
        degrees = numericMatch.slice(1).map((d) => parseInt(d, 10));
        suffixes = degrees.map((d) => numericMap[d - 1] || 'maj7');
      }
      const scalePcs = keyToScalePcs(key?.rootPc ?? 0, minor);
      params.chords = degrees.map((deg, i) => {
        const pc = typeof deg === 'number' ? scalePcs[deg - 1] : romanDegreeToPc(deg, scalePcs);
        const noteName = pcToNoteName(pc, key?.sharps);
        return `${noteName}${suffixes[i]}`;
      });
    }
  }

  const lower = text.toLowerCase();
  if (/(?:7\s*→\s*3|7\s+vers\s+3|7\s+to\s+3|7-3|guide\s+tone)/.test(lower)) params.focus = '7-to-3';
  else if (/(?:3\s*→\s*7|3\s+vers\s+7|3\s+to\s+7)/.test(lower)) params.focus = '3-to-7';
  else if (/guide\s+tones?\s+only|que\s+les\s+guide\s+tones?/.test(lower)) params.focus = 'guide-tones-only';

  if (/\b(worship|adoration|adore)\b/.test(lower)) params.styleId = 'worship';
  else if (/\b(gospel|gosp)\b/.test(lower)) params.styleId = 'gospel';
  else if (/\b(jazz)\b/.test(lower)) params.styleId = 'jazz';
  else if (/\b(neo\s*soul|neosoul)\b/.test(lower)) params.styleId = 'neoSoul';

  if (/\b(drop\s*2)\b/.test(lower)) params.technique = 'drop2';
  else if (/\b(drop\s*3)\b/.test(lower)) params.technique = 'drop3';
  else if (/\b(rootless)\b/.test(lower)) params.technique = 'rootless';
  else if (/\b(quartal)\b/.test(lower)) params.technique = 'quartal';
  else if (/\b(close)\b/.test(lower)) params.technique = 'close';

  if (/\b(main\s+gauche|left\s+hand|lh)\b/.test(lower)) params.hand = 'LH';
  else if (/\b(main\s+droite|right\s+hand|rh)\b/.test(lower)) params.hand = 'RH';
  else if (/\b(les\s+deux|both|deux\s+mains)\b/.test(lower)) params.hand = 'both';

  if (/\bdébutant|beginner|facile|simple\b/.test(lower)) params.difficulty = 'beginner';
  else if (/\bavancé|advanced|dur|difficile|pro\b/.test(lower)) params.difficulty = 'advanced';
  else if (/\bintermédiaire|intermediate\b/.test(lower)) params.difficulty = 'intermediate';

  if (/\barpège|arpégier|arpeggio\b/.test(lower)) params.pattern = 'arppegio-up';
  else if (/\b(roll|rolled|enroulé)\b/.test(lower)) params.pattern = 'rolled';
  else if (/\b(block|plaqué|plaquer)\b/.test(lower)) params.pattern = 'block';

  const beatsMatch = lower.match(/(\d+)\s*temps?\b/);
  if (beatsMatch) params.lengthBeats = parseInt(beatsMatch[1], 10);

  return params;
}

/**
 * Classifie l'intention d'un message utilisateur.
 * @param {string} text
 * @returns {{intent: string, confidence: number, params: object}}
 */
export function classifyIntent(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { intent: 'unknown', confidence: 0, params: {} };

  const params = extractParams(trimmed);
  const scores = keywordScores(trimmed);
  applyStrongTriggers(trimmed, scores);

  // Si le message est un symbole d'accord isolé → voicing direct.
  if (params.chordSymbol && trimmed.replace(params.chordSymbol, '').trim() === '') {
    return { intent: 'play_voicing', confidence: 1, params };
  }

  // Si une progression claire est détectée (plusieurs accords reconnus),
  // priorité progression. On considère aussi le cas "ii-V-I" sans accords
  // explicites mais avec des mots-clés forts.
  if (params.chords && params.chords.length >= 2 && scores.explain <= 0) {
    return { intent: 'play_progression', confidence: Math.min(1, (scores.play_progression || 0) + 0.5), params };
  }

  // Si aucun symbole d'accord n'est extrait et que le message contient "explique",
  // c'est une demande d'explication (ex. "explique un II-V-I").
  if (!params.chordSymbol && scores.explain > 0) {
    return { intent: 'explain', confidence: Math.min(1, scores.explain), params };
  }

  // "explique le II-V-I" reste une explication, pas une demande de jeu.
  if (scores.explain > 0 && (scores.play_progression || 0) <= scores.explain) {
    return { intent: 'explain', confidence: Math.min(1, scores.explain), params };
  }

  // Si un lick/riff est demandé explicitement, priorité lick.
  if (scores.play_lick >= scores.play_voicing + 0.5) {
    return { intent: 'play_lick', confidence: Math.min(1, scores.play_lick), params };
  }

  // Sinon, choisir l'intention au score max.
  let bestIntent = 'unknown';
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  const confidence = Math.min(1, bestScore);
  if (confidence < CONFIDENCE_THRESHOLD) {
    return { intent: 'unknown', confidence, params };
  }

  return { intent: bestIntent, confidence, params };
}

/**
 * Liste les intentions reconnues.
 * @returns {string[]}
 */
export function listIntents() {
  return [...INTENTS];
}

// Orthographe des grilles : bémols par défaut (Bb, Eb, Ab), dièses dans les tons diésés.
function pcToNoteName(pc, sharps = false) {
  const names = sharps
    ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return names[((pc % 12) + 12) % 12];
}

// Gamme majeure, ou mineure naturelle (la dominante reste 7 : V7 → i).
function keyToScalePcs(root, minor = false) {
  const steps = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return steps.map((s) => (root + s) % 12);
}

// [Claude] — 2026-09-24 — Tonalité écrite en français ou en anglais : « en Fa »,
// « en Sib majeur », « en la mineur », « en Do# », « in Eb », « Fa majeur ».
// Avant, seul « en C majeur » était compris : « un 2-5-1 en Fa » donnait
// Dm7 G7 Cmaj7, et l'exemple du Copilote ne correspondait pas à son explication.
const SOLFEGE_PCS = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
const LETTER_PCS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// « la », « si », « mi », « a » sont aussi des mots courants (« en la jouant »,
// « in a minute ») : sans altération ni mode, on ne les lit comme tonalité
// qu'en fin de phrase.
const AMBIGUOUS_KEY_WORDS = new Set(['la', 'si', 'mi', 'a', 'e', 'b']);
// Tons diésés : Sol, Ré, La, Mi, Si majeurs ; Mi, Si mineurs.
const SHARP_MAJOR = new Set([7, 2, 9, 4, 11]);
const SHARP_MINOR = new Set([4, 11]);

/**
 * Tonalité nommée dans un message, ou null.
 * @param {string} text
 * @returns {{rootPc: number, minor: boolean, sharps: boolean}|null}
 */
export function extractKey(text) {
  const lower = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const note = '(do|re|mi|fa|sol|la|si|[a-g])(#|b(?![a-z])|\\s*diese|\\s*bemol|\\s+b(?![a-z]))?(?![a-z])';
  const mode = '\\s*(majeur|major|mineur|minor|m(?![a-z]))?';
  const patterns = [
    new RegExp(`\\b(?:en|in|tonalite\\s+de|ton\\s+de)\\s+${note}${mode}`, 'g'),
    new RegExp(`\\b${note}\\s*(majeur|major|mineur|minor)\\b`, 'g'),
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(lower)) !== null) {
      const [whole, name, accidental, modeWord] = m;
      const after = lower.slice(m.index + whole.length);
      if (AMBIGUOUS_KEY_WORDS.has(name) && !accidental && !modeWord && !/^\s*(?:$|[.,;:!?)])/.test(after)) continue;
      let pc = SOLFEGE_PCS[name] ?? LETTER_PCS[name];
      const acc = (accidental || '').trim();
      if (acc === '#' || acc === 'diese') pc += 1;
      else if (acc) pc -= 1;
      const rootPc = ((pc % 12) + 12) % 12;
      const minor = /^(mineur|minor|m)$/.test(modeWord || '');
      const sharps = acc === '#' || acc === 'diese' || (!acc && (minor ? SHARP_MINOR : SHARP_MAJOR).has(rootPc));
      return { rootPc, minor, sharps };
    }
  }
  return null;
}

/**
 * Symboles d'accords d'un texte (réponse du Copilote), dans l'ordre, sans
 * doublon : « **Dm9** → **G13** → **Cmaj9** » → ['Dm9', 'G13', 'Cmaj9'].
 * Les noms de notes français (Do, La) et les lettres seules sont ignorés.
 * @param {string} text
 * @returns {string[]}
 */
export function chordSymbolsInText(text) {
  const found = [];
  const tokens = String(text || '').split(/[\s,;|→–—*_`()\[\]«»"]+/);
  for (const raw of tokens) {
    const token = raw.replace(/^[^A-G]+/, '').replace(/[.:!?'’]+$/, '').replace(/-+$/, '');
    if (token.length < 2 || /^(Do|Re|Ré|Mi|Fa|Sol|La|Si)(#|b)?$/i.test(token)) continue;
    if (!/^[A-G]/.test(token) || !isChordSymbolRecognized(token)) continue;
    if (!found.includes(token)) found.push(token);
  }
  return found;
}

// [Claude] — 2026-11-11 — Objet musical nommé dans une demande (accord, progression, gamme,
// intervalle, notes) : ce qui distingue « fais-moi entendre un Cmaj7 » de « fais-moi entendre
// un exemple ». Vocabulaire de l'objet lui-même (ses noms, ses qualités, la façon de le jouer) ;
// tout autre mot du message est rendu dans `rest`, pour que l'appelant sache si la demande dit
// autre chose que cet objet (« … à la fin », « … à la place »).
const OBJECT_WORDS = new Set(`do re mi fa sol la si a b c d e f g diese bemol majeur majeure mineur mineure maj min
 septieme neuvieme onzieme treizieme sixte diminue diminuee augmente augmentee suspendu sus dominante juste
 accord accords gamme gammes pentatonique arpege arpeges voicing voicings renversement renversements position positions
 intervalle intervalles seconde tierce quarte quinte octave triton progression cadence enchainement tonalite degre
 rootless drop quartal close shell ouvert ouverte ferme fermee gospel jazz worship neo soul blues
 plaque plaques arpegee lent lente lentement doucement vite rapide main mains gauche droite deux`.split(/\s+/));
const INTERVAL_WORD = /\b(?:tierce|quarte|quinte|sixte|septieme|neuvieme|octave|triton|seconde (?:majeure|mineure))\b/;
const NOTE_WORD = '(?:do|re|mi|fa|sol|la|si)(?:#|b)?\\d?';

/**
 * @param {string} text
 * @returns {{kind: 'progression'|'chord'|'scale'|'degree'|'interval'|'notes', label: string, rest: string[]}|null}
 */
export function namedMusicalObject(text) {
  const raw = String(text || '').replace(/[‐‑‒–—−]/g, '-');
  const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/♯/g, '#').replace(/♭/g, 'b').toLowerCase();
  const params = extractParams(raw);
  let found = null;
  if (params.chords?.length >= 2) found = { kind: 'progression', label: params.chords.join(' → ') };
  else if (params.chordSymbol) found = { kind: 'chord', label: params.chordSymbol };
  else if (/\b(?:gamme|pentatonique)\b/.test(folded) && (extractKey(raw) || new RegExp(`\\b(?:de|en)\\s+${NOTE_WORD}\\b`).test(folded))) found = { kind: 'scale', label: 'gamme' };
  else if (/\b(?:le|un|du|au)\s+(?:i|ii|iii|iv|v|vi|vii)\b/.test(folded) && extractKey(raw)) found = { kind: 'degree', label: 'degré' };
  else if (INTERVAL_WORD.test(folded)) found = { kind: 'interval', label: folded.match(INTERVAL_WORD)[0] };
  else if (new RegExp(`\\b${NOTE_WORD}(?:[\\s,-]+${NOTE_WORD}\\b){1,}`).test(folded) && !/\bsi\s+(?:la|le|tu|je|on)\b/.test(folded)) found = { kind: 'notes', label: 'notes' };
  if (!found) return null;
  const rest = folded.replace(/[’']/g, ' ').split(/[^a-z0-9#]+/).filter(Boolean).filter((word) => {
    if (OBJECT_WORDS.has(word) || /^\d+$/.test(word) || /^(?:i|ii|iii|iv|v|vi|vii)$/.test(word) || /^(?:do|re|mi|fa|sol|la|si)[#b]?\d?$/.test(word)) return false;
    const token = normalizeChordToken(word);
    return !(token && isChordSymbolRecognized(token));
  });
  return { ...found, rest };
}

function romanDegreeToPc(degree, scalePcs) {
  const map = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
  return scalePcs[map[degree] ?? 0];
}

/**
 * Retourne une description lisible de l'intention.
 * @param {string} intent
 * @returns {string}
 */
export function describeIntent(intent) {
  const map = {
    play_voicing: 'jouer un accord/voicing',
    play_lick: 'jouer un lick/riff',
    play_note: 'jouer une note/gamme',
    play_progression: 'jouer une progression',
    explain: 'expliquer un concept',
    suggest: 'suggérer une action',
    unknown: 'intention non claire',
  };
  return map[intent] || map.unknown;
}
