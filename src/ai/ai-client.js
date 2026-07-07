// [OpenCode] — 2026-07-04 — Client API IA pour suggestions de réharmonisation.
// Compatible OpenAI (Groq, OpenRouter, Google AI Studio, etc.).
// Retourne null si aucune clé configurée → fallback algorithmique dans reharmonizer.js.
// La clé est cherchée dans :
//   1. localStorage (via openai-config.js / modal UI)
//   2. window.electronAPI.env.IA_API_KEY (exposé par preload depuis .env)
//
// NOTE : le modèle llama-3.1-8b ne maîtrise pas toujours la théorie musicale.
// Les notes générées sont validées avant d'être acceptées. Si invalides → fallback.

import { getAIConfig } from './openai-config.js';
import movementsLibrary from '../data/movements-library.json' with { type: 'json' };
import { classifyVoicing } from '../chord-engine/index.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_PC_MAP = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, Fb: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};
const OCTAVE_BASE = 12; // C4 = 60

function noteNameToMidi(name) {
  if (typeof name === 'number') return Math.round(name);
  if (!name || typeof name !== 'string') return null;
  const match = name.trim().match(/^([A-G][#b]?)(-?\d+)$/i);
  if (!match) return null;
  const pc = NOTE_PC_MAP[match[1]];
  if (pc == null) return null;
  const octave = parseInt(match[2], 10);
  return octave * 12 + pc + 12; // C4 = 60
}

export function midiToNoteName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

function parseVoicing(voicing) {
  if (!Array.isArray(voicing)) return [];
  return voicing.map(noteNameToMidi).filter((n) => n != null && n >= 24 && n <= 108);
}

// Normalise une suggestion en recalculant Top Note et type de voicing via le moteur harmonique.
// Le texte original (bibliothèque/IA) devient un label de style informatif, jamais la vérité technique.
function normalizeSuggestion(suggestion) {
  if (!suggestion || !Array.isArray(suggestion.voicingNotes) || suggestion.voicingNotes.length === 0) {
    return null;
  }
  const classification = classifyVoicing(suggestion.voicingNotes);
  return {
    ...suggestion,
    topNoteMidi: classification.topNote,
    topNoteName: midiToNoteName(classification.topNote),
    voicingType: classification.voicingType,
    // styleLabel conserve l'intention textuelle originale (ex. "Drop 2 / Substitution Diatonique")
    styleLabel: suggestion.technique || '',
    technique: classification.voicingType,
  };
}

function getApiConfig() {
  const local = getAIConfig();
  if (local.apiKey) return local;

  // Fallback : variable d'environnement exposée par le preload Electron
  try {
    const envKey = window.electronAPI?.env?.IA_API_KEY;
    const envBaseUrl = window.electronAPI?.env?.IA_BASE_URL;
    const envModel = window.electronAPI?.env?.IA_MODEL;
    if (envKey) {
      return {
        baseUrl: envBaseUrl || 'https://api.groq.com/openai/v1',
        apiKey: envKey,
        model: envModel || 'llama-3.1-8b-instant',
      };
    }
  } catch (e) { /* window.electronAPI non disponible */ }

  return null;
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;
  // Nettoyer les balises markdown et extraire le bloc JSON le plus profond
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .replace(/^\s*\n*/, '')
    .replace(/\s*\n*$/, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw = match[0];
  try {
    return JSON.parse(raw);
  } catch (_) {
    raw = raw
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,])\s*'([^']+)'\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']+)'\s*([,}])/g, ':"$1"$2')
      .replace(/\n\s*\/\/[^\n]*/g, '');
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[AI] safeJsonParse final failure:', err.message);
      return null;
    }
  }
}

// Valide que les notes MIDI contiennent la fondamentale declaree par l'IA.
function validateAINotes(name, notes) {
  if (!name || !Array.isArray(notes) || notes.length < 2) return false;
  if (notes.some((n) => n < 36 || n > 96)) return false;
  const pcs = new Set(notes.map((n) => n % 12));
  const rootMatch = name.match(/^([A-G][#b]?)/);
  if (!rootMatch) return true;
  const claimedRootPc = NOTE_PC_MAP[rootMatch[1]];
  if (claimedRootPc == null) return true;
  return pcs.has(claimedRootPc);
}

export async function generateReharmonization(chord, style, topNoteName = '—') {
  const config = getApiConfig();
  if (!config) return null;

  const rootPc = typeof chord.rootPc === 'number' ? chord.rootPc : 0;
  const symbol = chord.symbol || '';
  const notes = chord.notes || [];
  const rootName = NOTE_NAMES[rootPc % 12] || '?';
  const originalName = `${rootName}${symbol}`;

  const styleDesc = {
    worship: 'ouverts, aérés, suspendus (sus4, add9, maj7), voix amples',
    gospel: 'riches, avec tensions (9, 13, #9, b9), block chords, voix serrées',
    jazz: 'voicings de type drop 2, drop 3, rootless, substitutions altérées, quartals',
    neoSoul: 'voicings étendus avec 9, 11, 13, couleurs Jazz modales, planing',
  };

  const libraryText = movementsLibrary.movements
    .map((m) => `- ${m.artist} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
    .join('\n');

  const systemPrompt = `Tu es l'algorithme central de réharmonisation de l'application. Tu analyses la suite de mouvements jouée par l'utilisateur (Basse + Top Note). Au lieu de suggérer des accords théoriques isolés, tu fouilles dans la bibliothèque de mouvements locale extraite des vidéos précédemment analysées pour proposer 3 alternatives basées sur des signatures réelles.

BIBLIOTHÈQUE DE MOUVEMENTS LOCALE :
${libraryText}

RÈGLES STRICTES :
1. L'accord original DOIT garder sa fondamentale. Les suggestions sont des REHARMONISATIONS, pas des accords complètement différents.
2. Les voicings DOIVENT être jouables à la main gauche : 2 à 6 notes, tessiture C2-C6 (MIDI 36-84).
3. Chaque suggestion doit citer explicitement une catégorie stylistique (Walk-up Gospel, Montée diatonique Worship, Turnaround Gospel, Couleur Gospel moderne, Substitution Jazz, II-V-I Jazz mineur, ou Générique) plutôt qu'un nom d'artiste.
4. Le champ "voicing" est un tableau de notes au format "NoteOctave" (ex: "C#2", "B2", "E3").
5. La "technique" doit décrire le mouvement (Drop 2, Quartal, Rootless, Substitution tritonique, etc.).
6. Réponds UNIQUEMENT en JSON valide, sans aucun texte avant/après.

Format attendu :
{
  "accord_original": "Em7",
  "top_note": "G#",
  "suggestions": [
    { "inspiration": "Substitution Jazz", "voicing": ["C#2", "B2", "E3", "G#3", "B3"], "technique": "Drop 2 / Substitution Diatonique" },
    { "inspiration": "Couleur Gospel moderne", "voicing": ["A2", "E3", "G3", "B3", "D4", "G#4"], "technique": "La6/9 basse de Mi / Quartal" },
    { "inspiration": "II-V-I Jazz mineur", "voicing": ["D#2", "A#2", "C#3", "F#3", "A#3"], "technique": "2-5-1 Mineur Altéré / Rootless" }
  ]
}`;

  const userPrompt = `Accord original : ${originalName} (fondamentale ${rootPc}, top note ${topNoteName}, notes ${JSON.stringify(notes)})
Style cible : ${style} — ${styleDesc[style] || ''}

Propose 3 réharmonisations inspirées de la bibliothèque de mouvements locales pour ${originalName}.`;

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.35,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('AI_API_KEY_INVALID');
      }
      console.warn('[AI] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const result = safeJsonParse(content);
    if (!result || !Array.isArray(result.suggestions) || result.suggestions.length === 0) return null;

    // Normaliser, classifier et valider chaque suggestion
    const normalizedSuggestions = result.suggestions.map((s) => {
      const parsed = parseVoicing(s.voicing);
      const base = {
        inspiration: s.inspiration || 'Générique',
        voicingNotes: parsed,
        voicingNames: s.voicing || [],
        technique: s.technique || '',
      };
      return normalizeSuggestion(base);
    }).filter((s) => s != null && s.voicingNotes.length >= 2 && s.voicingNotes.every((n) => n >= 36 && n <= 84));

    if (normalizedSuggestions.length === 0) {
      console.warn('[AI] Aucune suggestion valide reçue pour', originalName);
      return null;
    }

    return {
      accord_original: result.accord_original || originalName,
      top_note: normalizedSuggestions[0]?.topNoteName || topNoteName,
      suggestions: normalizedSuggestions,
      style,
    };
  } catch (err) {
    if (err.message === 'AI_API_KEY_INVALID') {
      console.error('[AI] Clé API invalide ou refusée.');
      throw err;
    }
    console.warn('[AI] Request failed:', err);
    return null;
  }
}

const masterclassCache = new Map();
const RETRY_DELAYS = [1000, 3000, 9000];

function hashAnalysis(analysis) {
  const chords = analysis.chords || [];
  const key = `${analysis.sessionId || 'unknown'}-${chords.length}-${chords.map((c) => `${c.rootPc}${c.symbol || ''}`).join(',')}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0x7fffffff;
  return String(h);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFallbackMasterclass(analysis) {
  const chords = analysis.chords || [];
  const movements = movementsLibrary.movements || [];
  return chords.map((chord, i) => {
    const rootName = NOTE_NAMES[chord.rootPc % 12] || '?';
    const next = chords[i + 1];
    const movement = pickMovementForChord(chord, next, movements);
    const isActive = chord._arrangementActive !== false;
    return {
      index: i,
      top_note: `Top note ${midiToNoteName(getTopNoteMidi(chord))}. ${movement ? `Mouvement suggéré : ${movement.category}.` : 'Conservez la mélodie actuelle.'}`,
      worship: isActive ? [48, 52, 55, 59] : [],
      jazz: isActive ? [55, 59, 62, 65] : [],
      passing: movement ? `${movement.pattern} — ${movement.description}` : 'Aucun mouvement de référence trouvé.',
      commentaire: isActive
        ? (movement
          ? `Inspirez-vous du mouvement « ${movement.name} » pour enrichir ce passage.`
          : 'Aucune suggestion automatique disponible pour cet accord.')
        : 'Accord désactivé dans l\'arrangement.',
      skip: !isActive,
    };
  });
}

function getTopNoteMidi(chord) {
  if (!chord || !chord.notes || chord.notes.length === 0) return null;
  return Math.max(...chord.notes);
}

function pickMovementForChord(chord, nextChord, movements) {
  if (!movements || movements.length === 0) return null;
  const symbol = chord.symbol || '';
  const isDom = /^(7|9|13|dim|°)/i.test(symbol) || (/7/.test(symbol) && !/maj/i.test(symbol));
  const isMinor = /^(m(?=\d|\/|add|sus|$)|min|mi(?=\d|\/|add|sus|$)|-)/i.test(symbol);
  const hasNext = !!nextChord;

  // Score simple : préférer les mouvements dont le style correspond et qui traitent les dominantes / mineurs.
  const scored = movements.map((m) => {
    let score = 0;
    if (m.style === 'jazz' && isDom) score += 2;
    if (m.style === 'gospel' && isDom) score += 2;
    if (m.style === 'worship' && !isDom && !isMinor) score += 2;
    if (m.style === 'jazz' && isMinor && /m7b5|m9/.test(symbol)) score += 1;
    if (hasNext && m.pattern.includes('-')) score += 1; // mouvement de passage
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.m || null;
}

async function fetchMasterclass(config, systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('AI_API_KEY_INVALID');
      } else if (response.status === 429) {
        throw new Error('AI_RATE_LIMIT');
      }
      throw new Error(`AI_API_ERROR_${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const result = safeJsonParse(content);
    if (!result || !result.masterclass || !Array.isArray(result.masterclass)) return null;
    return result.masterclass;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function generateMasterclass(analysis) {
  const config = getApiConfig();
  if (!config) return null;

  const chords = analysis.chords || [];
  const sections = analysis.sections || [];
  if (chords.length === 0) return null;

  const cacheKey = hashAnalysis(analysis);
  if (masterclassCache.has(cacheKey)) {
    console.log('[AI] Masterclass servie depuis le cache.');
    return masterclassCache.get(cacheKey);
  }

  const chordList = chords.map((c, i) => {
    const rootName = NOTE_NAMES[c.rootPc % 12] || '?';
    const topNote = c.notes && c.notes.length > 0 ? Math.max(...c.notes) : null;
    const topNoteName = topNote != null ? `${NOTE_NAMES[topNote % 12]}${Math.floor(topNote / 12) - 1}` : '—';
    const notesStr = (c.notes || []).map((n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`).join(' ');
    const active = c._arrangementActive !== false;
    const bass = c._arrangementBass || 'auto';
    return `[${i}] ${active ? 'ACTIF' : 'INACTIF'} ${rootName}${c.symbol || ''} (voicing:${c.voicing || '—'}, notes:${notesStr}, top:${topNoteName}, basse:${bass})`;
  }).join('\n');

  const sectionList = sections.map((s) => {
    const labels = { Intro: 'Intro', Verse: 'Couplet', PreChorus: 'Pré-refrain', Chorus: 'Refrain', Bridge: 'Bridge', Outro: 'Outro', Interlude: 'Interlude' };
    return `${labels[s.label] || s.label} (${formatTime(s.start)} — ${formatTime(s.end)})`;
  }).join('\n');

  const libraryText = movementsLibrary.movements
    .map((m) => `- ${m.category || 'Générique'} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
    .join('\n');

  const systemPrompt = `Tu es un professeur de piano jazz et gospel de renom. Tu analyses des progressions harmoniques completes et tu donnes des conseils personnalises.

BIBLIOTHÈQUE DE MOUVEMENTS LOCALE (cite explicitement ces mouvements quand ils s'appliquent) :
${libraryText}

Pour chaque accord de la session, fournis :
1. **top_note** : analyse de la note de melodie actuelle. Est-elle adaptee au style ? Quelle alternative suggeres-tu ?
2. **worship** : un voicing Worship/Open (drop 2, sus2, doublages) sous forme de notes MIDI
3. **jazz** : un voicing Jazz/Advanced (rootless, enrichissements 9/11/#11/13) sous forme de notes MIDI
4. **passing** : un mouvement de passage vers l'accord suivant (substitution diatonique, turnaround 2-5-1 altere, chromatisme)
5. **commentaire** : un conseil pedagogique en une phrase en francais

Les accords marques INACTIF doivent avoir "skip": true et tu ne proposes pas de voicing pour eux (laisse worship et jazz vides).

REGLE STRICTE : les notes MIDI doivent etre entre 48 et 84 (C3 a C6), 2 a 5 notes par voicing, jouables a la main gauche.

Reponds UNIQUEMENT en JSON valide, sans aucun texte avant/apres. Format :
{ "masterclass": [
    { "index": 0, "top_note": "...", "worship": [60,64,67], "jazz": [57,60,64,67], "passing": "...", "commentaire": "...", "skip": false },
    ...
  ]
}`;

  const userPrompt = `Session complete :

Sections :
${sectionList}

Accords (format : [index] ACTIF/INACTIF nom (voicing, notes, top, basse)) :
${chordList}

Analyse chaque accord et donne des conseils de maître.`;

  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const result = await fetchMasterclass(config, systemPrompt, userPrompt);
      if (result) {
        masterclassCache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      lastErr = err;
      if (err.message === 'AI_API_KEY_INVALID') {
        console.error('[AI] Clé API invalide ou refusée.');
        throw err;
      }
      if (attempt < RETRY_DELAYS.length) {
        console.warn(`[AI] Masterclass tentative ${attempt + 1} échouée (${err.message}). Retry dans ${RETRY_DELAYS[attempt]}ms...`);
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  console.warn('[AI] Masterclass IA indisponible après retry. Fallback sur bibliothèque locale :', lastErr?.message);
  const fallback = buildFallbackMasterclass(analysis);
  masterclassCache.set(cacheKey, fallback);
  return fallback;
}

// ── Utilitaires publics ──

export function classifyAndLabel(notes, styleLabel = '') {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const base = { voicingNotes: notes, technique: styleLabel };
  return normalizeSuggestion(base);
}

function formatTime(seconds) {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
