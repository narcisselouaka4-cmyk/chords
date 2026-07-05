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

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_PC_MAP = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, Fb: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

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

export async function generateReharmonization(chord, style) {
  const config = getApiConfig();
  if (!config) return null;

  const rootPc = typeof chord.rootPc === 'number' ? chord.rootPc : 0;
  const symbol = chord.symbol || '';
  const notes = chord.notes || [];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rootName = NOTE_NAMES[rootPc % 12] || '?';

  const styleDesc = {
    worship: 'ouverts, aérés, suspendus (sus4, add9, maj7), voix amples',
    gospel: 'riches, avec tensions (9, 13, #9, b9), block chords, voix serrées',
    jazz: 'voicings de type drop 2, drop 3, rootless, substitutions altérées, quartals',
    neoSoul: 'voicings étendus avec 9, 11, 13, couleurs Jazz modales, planing',
  };

  const libraryText = movementsLibrary.movements
    .map((m) => `- ${m.artist} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
    .join('\n');

  const systemPrompt = `Tu es un pianiste expert en harmonie jazz et gospel. Tu proposes des voicings piano réalistes.

MOUVEMENTS DE RÉFÉRENCE (utilise-les comme inspiration quand c'est pertinent) :
${libraryText}

RÈGLES STRICTES :
1. L'accord proposé DOIT garder la MÊME fondamentale que l'accord original. La fondamentale est la note MIDI la plus basse des notes reçues.
2. Tu ne dois JAMAIS halluciner une structure différente. Par exemple, C3-E3-G3-B3-D4 est un Cmaj9, PAS un Em9(#11) ou Em7(sus4).
3. Les notes MIDI DOIVENT contenir la fondamentale de l'accord (le nom de l'accord détermine la fondamentale)
4. Les notes doivent être jouables à la main gauche : 2 à 5 notes, tessiture C3-C6 (MIDI 48-84)
5. VÉRIFIE que les notes que tu génères correspondent bien au nom de l'accord que tu annonces
   Exemple : si tu dis "Dm7", les notes doivent contenir D (MIDI 50, 62, 74 ou 86)
6. Réponds UNIQUEMENT en JSON valide, sans aucun texte avant/après

Format attendu :
{ "name": "...", "notes": [60, 64, 67, 71, 74], "substitution": "enrichissement | tritonique | relatif | passage" }`;

  const userPrompt = `Accord original : ${rootName}${symbol} (fondamentale ${rootPc}, notes ${JSON.stringify(notes)})
Style : ${style} — ${styleDesc[style] || ''}

Propose un voicing piano ${style} pour ${rootName}${symbol}.`;

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
        max_tokens: 300,
        temperature: 0.3,
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
    if (!result || !Array.isArray(result.notes) || result.notes.length === 0) return null;

    const notes = result.notes.map((n) => Math.round(n));
    const name = result.name || `${rootName} ${style}`;

    // Valider que les notes correspondent au nom (sinon fallback algorithmique)
    if (!validateAINotes(name, notes)) {
      console.warn('[AI] Notes invalides pour le nom declare:', name, notes.map((n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`).join(', '));
      return null;
    }

    return {
      name,
      notes,
      style,
      substitution: result.substitution || '',
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

export async function generateMasterclass(analysis) {
  const config = getApiConfig();
  if (!config) return null;

  const chords = analysis.chords || [];
  const sections = analysis.sections || [];
  if (chords.length === 0) return null;

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
    .map((m) => `- ${m.artist} (${m.style}) : ${m.name} — ${m.pattern} — ${m.description}`)
    .join('\n');

  const systemPrompt = `Tu es un professeur de piano jazz et gospel de renom. Tu analyses des progressions harmoniques completes et tu donnes des conseils personnalises.

MOUVEMENTS DE RÉFÉRENCE (cite-les quand c'est pertinent et utilise leurs patterns comme base) :
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
        console.warn('[AI] Trop de requêtes (rate limit).');
      } else {
        console.warn('[AI] Erreur API Masterclass:', response.status);
      }
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const result = safeJsonParse(content);
    if (!result) {
      console.warn('[AI] Réponse Masterclass malformée (JSON invalide).');
      return null;
    }
    if (!result.masterclass || !Array.isArray(result.masterclass)) return null;

    return result.masterclass;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.message === 'AI_API_KEY_INVALID') {
      console.error('[AI] Clé API invalide ou refusée.');
      throw err;
    }
    console.warn('[AI] Erreur réseau Masterclass:', err);
    return null;
  }
}

function formatTime(seconds) {
  if (seconds == null) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
