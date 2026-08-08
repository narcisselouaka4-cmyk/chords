// Phase 1.5A — Read-Only Close Voicing Text Preview.
// Phase 2B — Close/Simple style selector.
// Ce module UI est la seule couche autorisée à importer le moteur de voicing.
// Aucune règle musicale n’est déplacée ici : l’UI se contente d’adapter,
// formater et rendre le résultat immuable produit par generateVoicing().

import { parseChordSymbol } from '../chord-engine/chord-display.js';
import { midiToNoteName, NOTE_NAMING_POLICY } from '../voicing-engine/midi-convention.js';
import { generateVoicing } from '../voicing-engine/generate-voicing.js';

/**
 * @typedef {import('../voicing-engine/generate-voicing.js').VoicingResult} VoicingResult
 */

const CONTAINER_ID = 'analyzer-voicing-preview';
const SELECTOR_CONTAINER_ID = 'analyzer-voicing-style-selector';
const CONTENT_ID = 'analyzer-voicing-content';
const STORAGE_KEY = 'piano-jazz-chords:notation-sharps';
const VOICING_STYLE_KEY = 'piano-jazz-chords.voicing-style';

let currentVoicingStyle = 'close';
let voicingStyleInitialized = false;

function getLocalStorage() {
  return (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;
}

export function normalizeVoicingStyle(raw) {
  if (raw === 'simple') return 'simple';
  return 'close';
}

export function getVoicingStyle() {
  return currentVoicingStyle;
}

export function setVoicingStyle(rawStyle) {
  const normalizedStyle = normalizeVoicingStyle(rawStyle);
  currentVoicingStyle = normalizedStyle;

  try {
    getLocalStorage()?.setItem(VOICING_STYLE_KEY, normalizedStyle);
  } catch {
    // La préférence reste active pour la session courante.
  }

  return normalizedStyle;
}

export function selectVoicingStyle(rawStyle) {
  const newStyle = normalizeVoicingStyle(rawStyle);
  const previousStyle = currentVoicingStyle;

  if (newStyle === previousStyle) {
    updateVoicingStyleSelector(previousStyle);
    return false;
  }

  setVoicingStyle(newStyle);
  updateVoicingStyleSelector(newStyle);
  rerenderActiveVoicing();
  return true;
}

export function updateVoicingStyleSelector(selectedStyle) {
  const container = document.getElementById(SELECTOR_CONTAINER_ID);
  if (!container) return;
  const buttons = container.querySelectorAll('[data-voicing-style]');
  buttons.forEach((btn) => {
    const isActive = btn.dataset.voicingStyle === selectedStyle;
    btn.setAttribute('aria-pressed', String(isActive));
    btn.classList.toggle('active', isActive);
  });
}

export function renderVoicingStyleSelector(container, currentStyle, onChange) {
  const selectorContainer = document.getElementById(SELECTOR_CONTAINER_ID);
  if (!selectorContainer) return;
  if (selectorContainer.dataset.voicingListenersAttached === 'true') return;

  selectorContainer.dataset.voicingListenersAttached = 'true';

  const buttons = selectorContainer.querySelectorAll('[data-voicing-style]');
  buttons.forEach((btn) => {
    const style = btn.dataset.voicingStyle;
    if (!style) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onChange(style);
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.stopPropagation();
      }
    });
  });
}

export function initVoicingStyle() {
  if (voicingStyleInitialized) return;

  let stored = 'close';
  try {
    const raw = getLocalStorage()?.getItem(VOICING_STYLE_KEY);
    if (raw !== null && raw !== undefined) {
      stored = raw;
    }
  } catch {
    // localStorage inaccessible : utiliser close par défaut
  }

  currentVoicingStyle = normalizeVoicingStyle(stored);

  const selectorContainer = document.getElementById(SELECTOR_CONTAINER_ID);
  if (!selectorContainer) return;

  voicingStyleInitialized = true;

  renderVoicingStyleSelector(null, currentVoicingStyle, (style) => {
    selectVoicingStyle(style);
  });
  updateVoicingStyleSelector(currentVoicingStyle);
}

// Re-rend le segment actif via le cache de l'analyseur.
// Cette fonction est appelée depuis selectVoicingStyle et doit être
// définie après l'export ; elle est remplacée par l'analyseur.
export let rerenderActiveVoicing = () => {};

export function setRerenderActiveVoicing(fn) {
  rerenderActiveVoicing = fn;
}

/**
 * Détermine la préférence enharmonique pour l’affichage des noms de notes.
 * Ordre de priorité :
 * 1. option explicite `useSharps` ;
 * 2. préférence persistée dans localStorage (s’il en existe une) ;
 * 3. famille enharmonique déduite du symbole d’accord effectif ;
 * 4. politique par défaut du moteur (bémols).
 * @param {{ useSharps?: boolean, effectiveChord?: string }} [options]
 * @returns {boolean}
 */
export function resolveUseSharps(options = {}) {
  if (options.useSharps != null) return Boolean(options.useSharps);

  const stored = getLocalStorage()?.getItem(STORAGE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;

  if (options.effectiveChord) {
    const inferred = inferUseSharpsFromSymbol(options.effectiveChord);
    if (inferred != null) return inferred;
  }

  // Fallback sur la politique par défaut du moteur (bémols).
  return NOTE_NAMING_POLICY.defaultUseSharps;
}

/**
 * Déduit la famille enharmonique attendue d’après le symbole d’accord effectif.
 * Les altérations explicites (# ou b) dans la fondamentale ou la basse slash sont
 * prioritaires. Ensuite, certaines qualités imposent une famille (m7b5/dim sont
 * naturellement bémolées ; aug est naturellement diésée). Sinon, la fondamentale
 * détermine la convention d’écriture usuelle.
 * @param {string} effectiveChord
 * @returns {boolean | null} true = dièses, false = bémols, null = indéterminé
 */
export function inferUseSharpsFromSymbol(effectiveChord) {
  if (!effectiveChord || effectiveChord === 'N') return null;

  const slashIdx = effectiveChord.indexOf('/');
  const chordPart = slashIdx >= 0 ? effectiveChord.slice(0, slashIdx) : effectiveChord;
  const bassPart = slashIdx >= 0 ? effectiveChord.slice(slashIdx + 1).trim() : '';

  // Altérations explicites dans le symbole : prioritaires.
  if (/#/.test(chordPart) || /#/.test(bassPart)) return true;
  if (/b/.test(chordPart) || /b/.test(bassPart)) return false;

  // Extraction de la fondamentale textuelle et de la qualité.
  const rootMatch = chordPart.match(/^([A-G][#b]?)(.*)/);
  const rootName = rootMatch ? rootMatch[1] : '';
  const quality = rootMatch ? rootMatch[2].trim() : '';

  // Qualités avec altération implicite prédominante.
  if (quality === 'm7b5' || quality === 'dim') return false;
  if (quality === 'aug' || quality === '7#5' || quality === 'maj7#5') return true;

  // Fondamentales conventionnellement diésées (gamme majeure avec dièses).
  const sharpRoots = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);
  const flatRoots = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

  if (sharpRoots.has(rootName)) return true;
  if (flatRoots.has(rootName)) return false;

  // C et cas non reconnus : indéterminé → fallback sur la politique par défaut.
  return null;
}

/**
 * Persiste la préférence dièses/bémols pour le preview de voicing.
 * @param {boolean} useSharps
 */
export function setUseSharps(useSharps) {
  getLocalStorage()?.setItem(STORAGE_KEY, String(Boolean(useSharps)));
}

/**
 * Libellé français d'une main pour l'affichage.
 * Les identifiants internes (LH / RH) restent invariants : seule la valeur
 * réellement rendue en français (MG / MD) change.
 * @param {'LH' | 'RH' | string} hand
 * @returns {string} 'MG', 'MD' ou la valeur inchangée si non reconnue
 */
export function frHandLabel(hand) {
  if (hand === 'LH') return 'MG';
  if (hand === 'RH') return 'MD';
  return hand;
}

/**
 * Convertit un symbole d’accord effectif (ex: "Fm7/D") en entrée normalisée
 * pour le générateur Close.
 * @param {string} effectiveChord
 * @returns {{ rootPc: number, quality: string, bassPc: number | null } | null}
 */
export function effectiveChordToVoicingInput(effectiveChord) {
  if (!effectiveChord || effectiveChord === 'N') return null;
  const parsed = parseChordSymbol(effectiveChord);
  if (parsed.isN) return null;
  if (parsed.root == null) return null;
  return {
    rootPc: parsed.root,
    quality: parsed.quality,
    bassPc: parsed.bass,
  };
}

/**
 * Modèle textuel d’une main.
 * @typedef {{ hand: 'LH' | 'RH', names: string[], midis: number[] }} HandTextModel
 */

/**
 * Modèle textuel complet du voicing pour le rendu.
 * @typedef {{
 *   title: string,
 *   hands: HandTextModel[],
 *   state: 'ok' | 'unsupported' | 'no-valid' | 'no-chord',
 *   reason?: string,
 *   metadata?: object
 * }} VoicingTextModel
 */

/**
 * Construit le modèle textuel à partir du résultat du moteur.
 * L’ordre des notes suit strictement l’ordre MIDI retourné.
 * @param {VoicingResult|null} result
 * @param {{ useSharps?: boolean, effectiveChord?: string, style?: string }} [options]
 * @returns {VoicingTextModel}
 */
export function buildVoicingTextModel(result, options = {}) {
  const useSharps = resolveUseSharps(options);
  const style = options.style || 'close';
  const titlePrefix = style === 'simple' ? 'VOICING SIMPLE' : 'VOICING CLOSE';

  if (!result) {
    return { title: titlePrefix, hands: [], state: 'no-chord' };
  }

  if (!result.ok) {
    const reasons = result.rejectionReasons || [];
    const isUnsupported = reasons.includes('UNSUPPORTED_QUALITY');
    return {
      title: titlePrefix,
      hands: [],
      state: isUnsupported ? 'unsupported' : 'no-valid',
      reason: isUnsupported ? 'Qualité non supportée en V1' : (reasons[0] || 'Aucun voicing valide'),
    };
  }

  const candidate = result.selectedCandidate;
  const formatNotes = (notes) => notes.map((midi) => midiToNoteName(midi, { useSharps }));

  return {
    title: titlePrefix,
    hands: [
      { hand: 'LH', names: formatNotes(candidate.lh.notes), midis: [...candidate.lh.notes] },
      { hand: 'RH', names: formatNotes(candidate.rh.notes), midis: [...candidate.rh.notes] },
    ],
    state: 'ok',
  };
}

/**
 * Rend le preview textuel dans le conteneur dédié.
 * @param {VoicingResult|null} result
 * @param {{ useSharps?: boolean, separator?: string, effectiveChord?: string, style?: string }} [options]
 */
export function renderVoicingTextPreview(result, options = {}) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const content = document.getElementById(CONTENT_ID);
  const model = buildVoicingTextModel(result, options);

  // Ne jamais toucher au sélecteur : vider uniquement la zone de contenu.
  if (content) {
    content.innerHTML = '';
  }
  container.style.display = 'none';

  const title = document.createElement('div');
  title.className = 'voicing-preview-title';
  title.textContent = model.title;
  appendToPreview(container, content, title);

  if (model.state === 'no-chord') {
    container.style.display = '';
    return;
  }

  if (model.state === 'unsupported' || model.state === 'no-valid') {
    const status = document.createElement('div');
    status.className = 'voicing-preview-status voicing-preview-unavailable';
    status.textContent = model.state === 'unsupported'
      ? 'Indisponible pour cet accord'
      : 'Aucun voicing valide';
    const reason = document.createElement('div');
    reason.className = 'voicing-preview-reason';
    reason.textContent = model.reason || '';
    appendToPreview(container, content, status);
    appendToPreview(container, content, reason);
    container.style.display = '';
    return;
  }

  const separator = options.separator ?? ' · ';

  for (const hand of model.hands) {
    const row = document.createElement('div');
    row.className = `voicing-preview-hand voicing-preview-${hand.hand.toLowerCase()}`;

    const label = document.createElement('span');
    label.className = 'voicing-preview-label';
    label.textContent = frHandLabel(hand.hand);

    const notes = document.createElement('span');
    notes.className = 'voicing-preview-notes';
    notes.textContent = hand.names.join(separator);
    notes.setAttribute('aria-label', hand.names.join(', '));

    row.appendChild(label);
    row.appendChild(notes);
    appendToPreview(container, content, row);
  }

  container.style.display = '';
}

/**
 * Ajoute un nœud dans la zone de contenu si elle existe, sinon dans le conteneur.
 * Préserve le sélecteur de style qui vit en dehors de la zone de contenu.
 */
function appendToPreview(container, content, node) {
  if (content) {
    content.appendChild(node);
  } else {
    container.appendChild(node);
  }
}

/**
 * Vide et masque proprement le preview.
 */
export function clearVoicingTextPreview() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const content = document.getElementById(CONTENT_ID);
  if (content) {
    content.innerHTML = '';
  }
  container.style.display = 'none';
}

/**
 * Génère le voicing pour un accord effectif et rend le preview textuel.
 * Cette fonction est le point d’entrée principal pour l’analyseur.
 * @param {string|null} effectiveChord
 * @param {{ useSharps?: boolean, style?: string }} [options]
 * @returns {VoicingResult|null}
 */
export function updateVoicingPreviewForChord(effectiveChord, options = {}) {
  const input = effectiveChordToVoicingInput(effectiveChord);
  if (!input) {
    clearVoicingTextPreview();
    return null;
  }

  const style = options.style || getVoicingStyle();
  const result = generateVoicing(input, { style });
  renderVoicingTextPreview(result, {
    ...options,
    style,
    effectiveChord,
  });
  return result;
}
