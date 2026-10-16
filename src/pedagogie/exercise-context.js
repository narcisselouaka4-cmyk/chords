// [Claude] — 2026-09-25 — L'exercice en cours, décrit pour le Copilote.
//
// Narcisse : « j'avais pensé aussi à utiliser Copilot IA pour l'onglet
// d'exercices […] je ne sais pas du tout comment faire ce lien ». Il a choisi :
// « Demander au Copilote » depuis l'exercice, et « Qu'en penses-tu ? » qui
// connaît l'exercice en cours. Le Copilote reçoit ici ce que l'écran montre :
// l'accord cible ou le mouvement, la tonalité et l'étape, les voicings EXACTS de
// la carte (main gauche | main droite), et les derniers essais pas encore
// retenus (notes jouées, accord entendu) — pour expliquer ce voicing-là, le faire
// entendre tel quel, et proposer des pistes à partir de ce qui a été joué.
// Module pur (testé en Node) : l'état vient de practiceExercise.getState().

import { TECHNIQUE_LABELS } from '../practice-exercise.js';
import { frenchNoteName } from './example-guide.js';
import { noteRoles } from './note-roles.js';

// Techniques que « Qu'en penses-tu ? » sait reconnaître dans le jeu (voicing-classifier.js).
const COMPARABLE_TECHNIQUES = new Set(['close', 'drop2', 'drop3', 'rootless', 'quartal']);

// Notes écrites d'après l'accord (Sib dans Bbm11) ; une note étrangère à l'accord
// voulu s'écrit d'après l'accord entendu (Fa# pour un D7 joué à la place de Dm9).
const names = (notes, chord = null, heard = null) => {
  const outside = new Set(chord ? noteRoles(chord, notes || []).filter((r) => r.kind === 'outside').map((r) => r.midi) : []);
  return (notes || []).map((n) => frenchNoteName(n, outside.has(n) ? heard : chord)).join(' ');
};

/** Un accord de la carte : nom, voicing exact, rôles, degré. */
function describeChord(target, { current = false } = {}) {
  const lh = [...(target.voicing?.leftHand || [])].sort((a, b) => a - b);
  const rh = [...(target.voicing?.rightHand || [])].sort((a, b) => a - b);
  const roles = noteRoles({ rootPc: target.rootPc, quality: target.symbol ?? target.quality ?? '' }, [...lh, ...rh]);
  return {
    name: target.name,
    rootPc: target.rootPc,
    quality: target.symbol ?? target.quality ?? '',
    degree: target.degree || null,
    passing: Boolean(target.passing),
    technique: target.voicing?.technique || null,
    lh,
    rh,
    roles: roles.map((r) => r.degree),
    current,
  };
}

/**
 * Contexte de l'exercice affiché.
 * @param {object} state - practiceExercise.getState()
 * @param {{expected: string, notes: number[], heard: string|null, at?: number}[]} [attempts] - essais pas encore retenus
 * @returns {object|null}
 */
export function exerciseContext(state, attempts = []) {
  if (!state?.target) return null;
  const technique = state.technique || 'auto';
  const techniqueLabel = TECHNIQUE_LABELS[technique] || technique;
  const expectTechnique = COMPARABLE_TECHNIQUES.has(technique) ? technique : null;
  const prog = state.mode === 'movement' && state.progression?.type === 'movement' ? state.progression : null;
  let base;
  if (prog) {
    const chords = [];
    prog.chords.forEach((c, i) => {
      chords.push(describeChord(c, { current: i === (prog.stepIndex || 0) && !prog.onPassing }));
      if (c.passingChord) chords.push(describeChord(c.passingChord, { current: i === (prog.stepIndex || 0) && Boolean(prog.onPassing) }));
    });
    const key = state.target.keyName || '';
    base = {
      mode: 'movement',
      id: `mouvement:${prog.name}:${prog.currentKey}`,
      title: `Mouvement 12 tons — ${prog.name}${key ? ` en ${key}` : ''}`,
      name: prog.name,
      description: prog.description || '',
      key,
      keyProgress: state.target.keyProgress || '',
      stepProgress: state.target.stepProgress || '',
      chords,
      // Accords principaux attendus dans la tonalité en cours (les passages sont facultatifs au jeu).
      expect: { chords: prog.chords.map((c) => c.name), technique: expectTechnique, keyPc: prog.currentKey ?? null, minor: Boolean(prog.minor) },
    };
  } else {
    const t = state.target;
    base = {
      mode: 'chord',
      id: `accord:${t.name}:${technique}`,
      title: `Accord cible — ${t.name}`,
      name: t.name,
      description: '',
      key: '',
      keyProgress: '',
      stepProgress: '',
      chords: [describeChord(t, { current: true })],
      expect: { chords: [t.name], technique: expectTechnique, keyPc: null, minor: false },
    };
  }
  const known = new Set(base.chords.map((c) => c.name));
  const tries = (attempts || [])
    .filter((a) => a && known.has(a.expected) && Array.isArray(a.notes) && a.notes.length)
    .slice(-3)
    .map((a) => ({ expected: a.expected, notes: [...a.notes].sort((x, y) => x - y), heard: a.heard || null }));
  return {
    type: 'exercise',
    ...base,
    technique: techniqueLabel,
    level: state.mode === 'movement' ? state.difficulty ?? null : null,
    attempts: tries,
  };
}

/**
 * Lignes de contexte pour le modèle (voicings exacts, étape en cours, essais).
 * @param {ReturnType<typeof exerciseContext>} ctx
 * @returns {string[]}
 */
export function exerciseContextLines(ctx) {
  if (!ctx) return [];
  const out = [];
  out.push(`## Exercice en cours : ${ctx.title}`);
  if (ctx.description) out.push(ctx.description);
  const facts = [
    `technique demandée : ${ctx.technique}`,
    ctx.level != null ? `niveau ${ctx.level}` : null,
    ctx.keyProgress ? `tonalités : ${ctx.keyProgress}` : null,
    ctx.stepProgress ? `étape : ${ctx.stepProgress}` : null,
  ].filter(Boolean);
  out.push(facts.join(' · '));
  out.push('');
  out.push('### Accords de la carte (voicing affiché : main gauche | main droite · degrés)');
  for (const c of ctx.chords) {
    out.push(`- ${c.current ? '▶ ' : ''}${c.name}${c.degree ? ` [${c.degree}]` : ''}${c.passing ? ' (accord de passage)' : ''} : ${names(c.lh, c.name) || '—'} | ${names(c.rh, c.name) || '—'} · ${c.roles.join(' ')}${c.technique ? ` · ${TECHNIQUE_LABELS[c.technique] || c.technique}` : ''}`);
  }
  out.push('(▶ = l\'accord à jouer maintenant. L\'exercice accepte tout voicing de l\'accord annoncé, pas seulement celui de la carte.)');
  out.push('');
  if (ctx.attempts.length) {
    out.push('### Derniers essais pas encore retenus');
    for (const a of ctx.attempts) out.push(`- pour ${a.expected} : ${names(a.notes, a.expected, a.heard)}${a.heard ? ` (entendu : ${a.heard})` : ''}`);
  } else {
    out.push('Derniers essais : aucun essai pas encore retenu.');
  }
  return out;
}
