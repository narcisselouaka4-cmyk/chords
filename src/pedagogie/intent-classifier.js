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
  const chord = extractChordSymbol(text);
  if (chord) params.chordSymbol = chord;

  // Extraction d'une liste d'accords pour play_progression.
  // Stratégie 1 : accords explicites séparés par espaces/virgules/tirets.
  const progressionTokens = String(text || '')
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^[\-\u2013\u2014]+|[\-\u2013\u2014]+$/g, ''))
    .filter(Boolean);
  const recognizedProgression = progressionTokens.filter((t) => isChordSymbolRecognized(t));
  if (recognizedProgression.length >= 2) {
    params.chords = recognizedProgression;
  } else {
    // Stratégie 2 : patterns ii-V-I, II-V-I, 2-5-1, etc.
    const lower = String(text || '').toLowerCase();
    const romanPattern = /(?:^|[^a-z0-9#b])(ii|iii|iv|vi|vii|ii|i|v)\s*(?:-|\s)\s*(v|iv|iii|ii|i|vii)\s*(?:-|\s)\s*(i|ii|iii|iv|v|vi|vii)(?![a-z0-9#b])/i;
    const numericPattern = /(?:^|[^a-z0-9#b])(2|3|4|5|6|7)\s*(?:-|\s)\s*(5|2|4|3|6|7)\s*(?:-|\s)\s*(1|2|3|4|5|6|7)(?![a-z0-9#b])/i;
    if (romanPattern.test(lower) || numericPattern.test(lower)) {
      // Tonalité par défaut : Do majeur si aucune mention.
      const keyMatch = lower.match(/en\s+([a-g][#b]?)\s*majeur/i) || lower.match(/in\s+([a-g][#b]?)\s*major/i);
      const key = keyMatch ? keyMatch[1].toUpperCase() : 'C';
      const romanMap = { I: 'maj7', II: 'm7', III: 'm7', IV: 'maj7', V: '7', VI: 'm7', VII: 'm7b5' };
      const numericMap = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
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
      const scalePcs = keyToScalePcs(key);
      params.chords = degrees.map((deg, i) => {
        const pc = typeof deg === 'number' ? scalePcs[deg - 1] : romanDegreeToPc(deg, scalePcs);
        const noteName = pcToNoteName(pc);
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

function pcToNoteName(pc) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[((pc % 12) + 12) % 12];
}

function keyToScalePcs(keyName) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
    G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const root = map[keyName] ?? 0;
  return [root, (root + 2) % 12, (root + 4) % 12, (root + 5) % 12, (root + 7) % 12, (root + 9) % 12, (root + 11) % 12];
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
