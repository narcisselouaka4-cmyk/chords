// [Refonte visuelle 2026-09-02] — Panneau Masterclass de l'onglet Analyse.
// Socle de fiches préécrites + IA optionnelle. L'IA ne calcule jamais d'accords :
// elle ne fait que reformuler / approfondir une explication pédagogique.

import { parseChordSymbol, getEffectiveChord, resolveCanonicalChordDefinition } from '../chord-engine/chord-display.js';
import { NOTE_NAMES } from './chord-editor.js';
import { miniKeyboardForNotes } from './mini-keyboard.js';
import { playNote, releaseNote, resumeAudio } from '../audio/simple-synth.js';
import { getAIConfig } from '../ai/openai-config.js';

const A_PLAY_MS = 1400;
const SILENCE_MS = 300;

// Génère un voicing proche de C4/C5 à partir d'un symbole d'accord.
function chordSymbolToMidi(chordStr) {
  const effective = typeof chordStr === 'string' ? getEffectiveChord({ chord: chordStr }) : chordStr;
  const parsed = parseChordSymbol(effective);
  if (!parsed) return [];
  const def = resolveCanonicalChordDefinition(parsed.quality);
  if (!def || !Array.isArray(def.intervals)) return [];
  const rootPc = parsed.root;
  const bassPc = parsed.bass ?? rootPc;
  const pcsSet = new Set([bassPc, rootPc]);
  for (const iv of def.intervals) pcsSet.add((rootPc + iv) % 12);
  const pcs = Array.from(pcsSet).sort((a, b) => a - b);
  // Attribuer des octaves : basse en C3, le reste en C4/C5 sans dépasser C6.
  const base = 48;
  const notes = [];
  let currentOctave = 0;
  let lastPc = -1;
  for (let i = 0; i < pcs.length; i++) {
    const pc = pcs[i];
    let midi = base + ((pc - (base % 12) + 12) % 12);
    if (pc < lastPc) currentOctave += 1;
    lastPc = pc;
    midi += currentOctave * 12;
    if (midi > 84) midi -= 12;
    notes.push(midi);
  }
  // Réorganiser pour que la basse slash soit bien la plus grave.
  notes.sort((a, b) => a - b);
  if (parsed.bass != null && parsed.bass !== rootPc) {
    const bassMidi = notes.find((n) => n % 12 === parsed.bass);
    if (bassMidi != null) {
      const filtered = notes.filter((n) => n !== bassMidi);
      notes.length = 0;
      notes.push(bassMidi, ...filtered);
    }
  }
  return notes;
}

function noteListText(notes) {
  if (!notes || notes.length === 0) return '—';
  return notes
    .map((n) => `${NOTE_NAMES[n % 12] || '?'}${Math.floor(n / 12) - 1}`)
    .join(' · ');
}

function chordNotesFromSymbol(chordStr) {
  const midi = chordSymbolToMidi(chordStr);
  return midi.map((n) => n % 12);
}

function sharedNotes(a, b) {
  const setA = new Set(a);
  return b.filter((pc) => setA.has(pc));
}

function isDominant7(chordStr) {
  const parsed = parseChordSymbol(chordStr);
  return parsed && parsed.quality === '7';
}

function isMajor7(chordStr) {
  const parsed = parseChordSymbol(chordStr);
  return parsed && (parsed.quality === 'maj7' || parsed.quality === 'maj' || parsed.quality === '');
}

function isMinor7(chordStr) {
  const parsed = parseChordSymbol(chordStr);
  return parsed && (parsed.quality === 'min7' || parsed.quality === 'm7' || parsed.quality === 'min' || parsed.quality === 'm');
}

function rootPcOf(chordStr) {
  const parsed = parseChordSymbol(chordStr);
  return parsed ? parsed.root : null;
}

function pcDistance(from, to) {
  return ((to - from + 12) % 12);
}

function detectConcept(segments, index) {
  const seg = segments[index];
  if (!seg) return null;
  const prev = segments[index - 1];
  const next = segments[index + 1];
  const nextNext = segments[index + 2];
  const chord = seg.chord;

  // Incertitude : confiance faible ou rôle marqué uncertain.
  const role = seg.role || 'structural';
  const confidence = typeof seg.confidence === 'number' ? seg.confidence : 1;
  if (confidence < 0.5 || role === 'uncertain') {
    return { type: 'lowConfidence', chord };
  }

  // Substitution de tonique : un accord mineur partage 3 hauteurs avec le majeur précédent.
  if (prev && isMajor7(prev.chord) && isMinor7(chord)) {
    const prevNotes = chordNotesFromSymbol(prev.chord);
    const curNotes = chordNotesFromSymbol(chord);
    const shared = sharedNotes(prevNotes, curNotes);
    if (shared.length >= 3) {
      return {
        type: 'tonicSubstitution',
        chord,
        prevChord: prev.chord,
        sharedNotes: shared,
      };
    }
  }

  // ii-V-I vers le V degré : m7 → 7 → maj7 dont la fondamentale est la quinte du majeur.
  if (isMinor7(chord) && next && isDominant7(next.chord) && nextNext && isMajor7(nextNext.chord)) {
    const iRoot = rootPcOf(chord);
    const vRoot = rootPcOf(next.chord);
    const targetRoot = rootPcOf(nextNext.chord);
    if (iRoot != null && vRoot != null && targetRoot != null) {
      const vIsFifthOfTarget = pcDistance(targetRoot, vRoot) === 7;
      const iiIsFourthOfV = pcDistance(vRoot, iRoot) === 7;
      if (vIsFifthOfTarget && iiIsFourthOfV) {
        return {
          type: 'secondaryDominant',
          chord,
          nextChord: next.chord,
          targetChord: nextNext.chord,
        };
      }
    }
  }

  // Cadence IV–V–I : maj7(ou 7) → 7 → maj7, racines IV→V→I.
  if (isMajor7(chord) && next && isDominant7(next.chord) && nextNext && isMajor7(nextNext.chord)) {
    const ivRoot = rootPcOf(chord);
    const vRoot = rootPcOf(next.chord);
    const iRoot = rootPcOf(nextNext.chord);
    if (ivRoot != null && vRoot != null && iRoot != null) {
      if (pcDistance(iRoot, ivRoot) === 5 && pcDistance(iRoot, vRoot) === 7) {
        return {
          type: 'cadenceIVVI',
          chord,
          nextChord: next.chord,
          targetChord: nextNext.chord,
        };
      }
    }
  }

  // Résolution inattendue d'une dominante : 7 qui ne descend pas d'une quinte.
  if (isDominant7(chord) && next) {
    const domRoot = rootPcOf(chord);
    const nextRoot = rootPcOf(next.chord);
    if (domRoot != null && nextRoot != null && pcDistance(domRoot, nextRoot) !== 7) {
      return {
        type: 'unexpectedResolution',
        chord,
        nextChord: next.chord,
      };
    }
  }

  return null;
}

const FICHES = {
  tonicSubstitution: {
    title: 'Substitution de tonique',
    whatYouHear: 'Le même groupe de notes change de nom : le majeur 7 et le mineur 7 partagent trois hauteurs.',
    play: (data) => ({
      notes: chordSymbolToMidi(data.chord),
      withoutTension: chordSymbolToMidi(data.prevChord),
      captionA: 'Accord original',
      captionB: 'Substitution de tonique',
    }),
    understand: (data) => `
      **La règle à voler** : un accord mineur 7 construit sur la tierce du majeur 7
      partage sa tierce, sa quinte et sa septième. On peut donc le substituer au
      majeur 7 sans toucher à la mélodie. Exemple : ${data.prevChord} → ${data.chord}.
    `,
  },
  secondaryDominant: {
    title: 'ii-V-I secondaire vers le V',
    whatYouHear: 'Une mini-cadence ii-V-I pousse vers le degré suivant, comme si ce degré devenait une tonalité temporaire.',
    play: (data) => ({
      notes: chordSymbolToMidi(data.chord),
      withoutTension: chordSymbolToMidi(data.nextChord),
      captionA: 'ii (mineur 7)',
      captionB: 'V (dominante)',
    }),
    understand: (data) => `
      **La règle à voler** : pour viser un accord-cible, placez devant lui un V7
      puis un ii7. La fondamentale du ii est une quinte au-dessus de celle du V.
      Exemple : ${data.chord} → ${data.nextChord} → ${data.targetChord}.
    `,
  },
  cadenceIVVI: {
    title: 'Cadence IV–V–I',
    whatYouHear: 'La progression la plus classique : le IV ouvre, le V tend, le I résout.',
    play: (data) => ({
      notes: chordSymbolToMidi(data.chord),
      withoutTension: chordSymbolToMidi(data.nextChord),
      captionA: 'IV (sous-dominante)',
      captionB: 'V (dominante)',
    }),
    understand: (data) => `
      **La règle à voler** : IV–V–I est la charpente harmonique occidentale.
      Le IV apporte la couleur, le V crée la tension, le I donne le repos.
      Exemple : ${data.chord} → ${data.nextChord} → ${data.targetChord}.
    `,
  },
  unexpectedResolution: {
    title: 'Résolution inattendue',
    whatYouHear: "Une dominante ne retombe pas où on l'attend ; l'oreille est déplacée vers une autre couleur.",
    play: (data) => ({
      notes: chordSymbolToMidi(data.chord),
      withoutTension: chordSymbolToMidi(data.nextChord),
      captionA: 'Dominante',
      captionB: 'Résolution inattendue',
    }),
    understand: (data) => `
      **La règle à voler** : une dominante peut résoudre par déplacement chromatique
      d'une note commune plutôt que par la quinte descendante. Analysez quelle note
      est partagée entre ${data.chord} et ${data.nextChord}.
    `,
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'innerHTML') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  children.forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  });
  return node;
}

let currentReleaseTimer = null;

function stopPreview() {
  if (currentReleaseTimer) {
    clearTimeout(currentReleaseTimer);
    currentReleaseTimer = null;
  }
}

function playNotes(notes, durationMs = A_PLAY_MS) {
  if (!Array.isArray(notes) || notes.length === 0) return;
  resumeAudio().catch(() => {});
  stopPreview();
  notes.forEach((midi) => playNote(midi, 0.75));
  currentReleaseTimer = setTimeout(() => {
    notes.forEach((midi) => releaseNote(midi));
    currentReleaseTimer = null;
  }, durationMs);
}

function buildBadge(label, variant = 'neutral') {
  return el('span', { className: `mc-badge mc-badge-${variant}` }, label);
}

function renderLowConfidence(container, data, options = {}) {
  container.innerHTML = '';
  const answerBox = el('div', { className: 'mc-ai-answer' });
  const card = el('div', { className: 'mc-card mc-card-uncertain' },
    el('div', { className: 'mc-card-title' }, '⚠ Détection incertaine sur ce passage'),
    el('p', { className: 'mc-card-text' },
      `Le segment « ${data.chord || '—'} » est signalé à confiance faible. Une explication construite ici pourrait être fausse.`
    ),
    el('div', { className: 'mc-card-actions' },
      el('button', {
        type: 'button',
        className: 'btn-secondary btn-sm',
        onClick: options.onCorrect,
      }, 'Corriger ce segment →'),
      el('button', {
        type: 'button',
        className: 'btn-primary btn-sm',
        onClick: async () => {
          const question = `Que peux-tu me dire sur l'accord ${data.chord || 'détecté ici'}, sachant que la détection automatique est incertaine à cet endroit ?`;
          await askAIQuestion(card, question, 'Détection incertaine', data, options);
        },
      }, '⚡ Demander à l’IA')
    ),
    answerBox
  );
  container.appendChild(card);
}

function renderFiche(container, concept, data, options) {
  container.innerHTML = '';
  const fiche = FICHES[concept];
  if (!fiche) return;

  const playData = fiche.play(data);
  const mode = options.mode || 'play';

  const header = el('div', { className: 'mc-header' },
    el('div', { className: 'mc-header-left' },
      el('div', { className: 'mc-moment' }, `${formatTime(options.segment.startTime)} — ${formatTime(options.segment.endTime)}`),
      el('h3', { className: 'mc-title' }, fiche.title)
    ),
    el('div', { className: 'mc-badges' },
      buildBadge('Fiche vérifiée', 'verified'),
      options.aiConnected ? buildBadge('⚡ IA connectée — ta clé', 'ai') : null
    )
  );

  const listenBlock = el('div', { className: 'mc-listen' },
    el('div', { className: 'mc-listen-label' }, 'Écoute A/B'),
    el('div', { className: 'mc-listen-row' },
      el('button', {
        type: 'button',
        className: 'btn-secondary btn-sm',
        onClick: () => playNotes(playData.notes),
      }, `▶ A — ${playData.captionA}`),
      el('button', {
        type: 'button',
        className: 'btn-secondary btn-sm',
        onClick: () => playNotes(playData.withoutTension),
      }, `▶ B — ${playData.captionB}`)
    ),
    el('p', { className: 'mc-listen-hint' }, fiche.whatYouHear)
  );

  const toggle = el('div', { className: 'mc-toggle segmented' },
    el('button', {
      type: 'button',
      'data-mode': 'play',
      'aria-pressed': mode === 'play',
    }, 'Jouer'),
    el('button', {
      type: 'button',
      'data-mode': 'understand',
      'aria-pressed': mode === 'understand',
    }, 'Comprendre')
  );
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    options.onModeChange(btn.dataset.mode);
  });

  let body;
  if (mode === 'play') {
    const notes = playData.notes;
    const { svg } = miniKeyboardForNotes(notes);
    body = el('div', { className: 'mc-body' },
      el('div', { className: 'mc-mini-kb', innerHTML: svg }),
      el('div', { className: 'mc-note-list' }, noteListText(notes)),
      el('button', {
        type: 'button',
        className: 'btn-primary mc-play-fiche',
        onClick: () => playNotes(notes),
      }, '▶ Jouer cet accord au piano')
    );
  } else {
    body = el('div', { className: 'mc-body' },
      el('div', { className: 'mc-rule' },
        el('h4', { className: 'mc-rule-title' }, 'Ce que tu viens d’entendre :'),
        el('p', { innerHTML: escapeHtml(fiche.whatYouHear).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') })
      ),
      el('div', { className: 'mc-rule' },
        el('h4', { className: 'mc-rule-title' }, 'La règle à voler'),
        el('p', { innerHTML: escapeHtml(fiche.understand(data)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') })
      )
    );
  }

  const aiZone = el('div', { className: 'mc-ai-zone' },
    el('label', { className: 'mc-ai-label', htmlFor: 'mc-ai-question' }, 'Question libre (ta clé API)'),
    el('input', {
      type: 'text',
      id: 'mc-ai-question',
      className: 'mc-ai-input',
      placeholder: 'Approfondir cette fiche…',
    }),
    el('button', {
      type: 'button',
      className: 'btn-secondary btn-sm mc-ai-btn',
      onClick: async () => {
        const input = aiZone.querySelector('.mc-ai-input');
        const question = input.value.trim();
        if (!question) return;
        await askAIQuestion(aiZone, question, concept, data, options);
      },
    }, '⚡ Approfondir'),
    el('div', { className: 'mc-ai-answer' })
  );

  container.appendChild(header);
  container.appendChild(listenBlock);
  container.appendChild(toggle);
  container.appendChild(body);
  if (options.aiConnected) container.appendChild(aiZone);
}

async function askAIQuestion(container, question, concept, data, options) {
  const answerBox = container.querySelector('.mc-ai-answer');
  if (!answerBox) return;

  // Garde-fou anti double-clic : désactiver le bouton déclencheur pendant
  // toute la durée de l'appel (réactivé dans le finally, quel que soit le résultat).
  const triggerBtn = container.querySelector('.mc-ai-btn, .btn-primary.btn-sm');
  if (triggerBtn) triggerBtn.disabled = true;
  try {
    const config = getAIConfig();
    if (!config || !config.apiKey) {
      answerBox.textContent = 'Aucune clé API configurée. Configure-la dans Réglages › Assistant IA.';
      answerBox.className = 'mc-ai-answer error';
      return;
    }

    const cap = getMonthlyCap();
    const used = getMonthlyUsage();
    if (used >= cap) {
      answerBox.textContent = `Plafond mensuel atteint (${used}/${cap}). Passez au mois prochain ou augmentez le plafond dans les Réglages IA.`;
      answerBox.className = 'mc-ai-answer error';
      return;
    }

    answerBox.textContent = 'Lecture de la réponse…';
    answerBox.className = 'mc-ai-answer';
    const messages = [
      {
        role: 'system',
        content: 'Tu es un professeur de piano jazz/gospel. Réponds de façon concise, exacte musicalement, en français. Ne calcule jamais un accord : reformule ou approfondis la fiche pédagogique fournie.',
      },
      {
        role: 'user',
        content: `Fiche : ${FICHES[concept]?.title || concept}. Contexte : accord ${data.chord}${data.nextChord ? `, suivi de ${data.nextChord}` : ''}. Question : ${question}`,
      },
    ];
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1536, temperature: 0.6, reasoning_effort: 'low' }),
    });
    if (!res.ok) throw new Error(`Erreur API ${res.status}`);
    const json = await res.json();
    const answer = json.choices?.[0]?.message?.content || 'Réponse vide.';
    answerBox.textContent = answer;
    answerBox.className = 'mc-ai-answer success';
    incrementMonthlyUsage();
  } catch (err) {
    answerBox.textContent = `❌ ${err.message}`;
    answerBox.className = 'mc-ai-answer error';
  } finally {
    if (triggerBtn) triggerBtn.disabled = false;
  }
}

const CAP_KEY = 'piano-jazz-ai-monthly-cap';
const USAGE_KEY = 'piano-jazz-ai-monthly-usage';

export function getMonthlyCap() {
  try {
    const raw = localStorage.getItem(CAP_KEY);
    const n = raw ? parseInt(raw, 10) : 50;
    return Number.isFinite(n) && n > 0 ? n : 50;
  } catch (_) { return 50; }
}

export function setMonthlyCap(value) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n) && n > 0) {
    localStorage.setItem(CAP_KEY, String(n));
  }
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthlyUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return data[currentMonthKey()] || 0;
  } catch (_) { return 0; }
}

export function incrementMonthlyUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    data[currentMonthKey()] = (data[currentMonthKey()] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(data));
  } catch (_) { /* ignore */ }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

let state = {
  mode: 'play',
  segmentId: null,
  aiConnected: false,
  onCorrect: null,
  onAskAI: null,
  sourceType: 'audio',
};

export function initMasterclassPanel(els, callbacks = {}) {
  state.onCorrect = callbacks.onCorrect;
  state.onAskAI = callbacks.onAskAI;
  state.sourceType = callbacks.sourceType || 'audio';
  updateAIConnected();
}

export function updateAIConnected() {
  const cfg = getAIConfig();
  state.aiConnected = !!(cfg && cfg.apiKey);
}

export function renderMasterclass(els, segment, analysis) {
  if (!els.masterclassContent) return;
  if (!segment || !analysis || !Array.isArray(analysis.chords)) {
    if (els.masterclassEmpty) els.masterclassEmpty.style.display = '';
    els.masterclassContent.style.display = 'none';
    return;
  }
  if (els.masterclassEmpty) els.masterclassEmpty.style.display = 'none';
  els.masterclassContent.style.display = '';

  const index = analysis.chords.findIndex((s) => s.segmentId === segment.segmentId);
  if (index < 0) {
    els.masterclassContent.innerHTML = '<p class="mc-empty">Sélectionnez un accord dans la timeline.</p>';
    return;
  }

  // Garde-fou silence : un segment "N" (aucun accord détecté) n'a rien à
  // expliquer — pas de fiche, pas de bouton IA (l'IA ne sait pas que N
  // signifie silence).
  if (!segment.chord || segment.chord === 'N') {
    els.masterclassContent.innerHTML = '<p class="mc-empty">Ce passage ne contient pas d’accord détecté (silence ou signal trop faible). Rien à expliquer ici.</p>';
    return;
  }

  const sourceType = state.sourceType || 'audio';
  const confidence = typeof segment.confidence === 'number' ? segment.confidence : 1;
  const role = segment.role || 'structural';
  // Sur source audio, on se montre plus prudent : abaisser le seuil d'avertissement.
  const lowConfidenceThreshold = sourceType === 'audio' ? 0.65 : 0.5;
  const isLowConfidence = confidence < lowConfidenceThreshold || role === 'uncertain';

  const concept = isLowConfidence ? { type: 'lowConfidence', chord: segment.chord } : detectConcept(analysis.chords, index);
  if (!concept) {
    els.masterclassContent.innerHTML = '<p class="mc-empty">Aucune fiche n’est disponible pour cet accord. Vous pouvez demander une explication à l’IA ci-dessous.</p>';
    return;
  }

  state.segmentId = segment.segmentId;

  if (concept.type === 'lowConfidence') {
    renderLowConfidence(els.masterclassContent, concept, {
      onCorrect: () => state.onCorrect && state.onCorrect(segment),
      onAskAI: () => state.onAskAI && state.onAskAI(segment),
    });
    return;
  }

  renderFiche(els.masterclassContent, concept.type, concept, {
    segment,
    aiConnected: state.aiConnected,
    mode: state.mode,
    onModeChange: (mode) => {
      state.mode = mode;
      renderMasterclass(els, segment, analysis);
    },
  });
}

export function setMasterclassSourceType(sourceType) {
  state.sourceType = sourceType;
}
