import { noteNameToPc } from '../../chord-engine/intervals.js';

export function tonalIdentity(context) {
  const name = String(context?.key || '').replaceAll('♯', '#').replaceAll('♭', 'b');
  const match = /^([A-G][#b]?)(m)?$/.exec(name);
  if (!match) return null;
  const pc = noteNameToPc(match[1]);
  return pc == null ? null : `${pc}:${match[2] || context.mode === 'minor' ? 'minor' : 'major'}`;
}

export function isModulation(previous, current) {
  const from = tonalIdentity(previous), to = tonalIdentity(current);
  return from != null && to != null && from !== to;
}

// Seule l'encre de l'accord courant change. L'interpolation est faite en CSS,
// sur une propriété couleur héritée : ni fond, ni halo, ni message supplémentaire.
export function createModulationFeedback({ region }) {
  let initialized = false, previousIdentity = null;
  function reset() {
    initialized = false; previousIdentity = null;
    delete region.dataset.harmonicTone;
    region.classList.remove('has-key-transition');
  }
  function update(context, { animate = true } = {}) {
    const identity = tonalIdentity(context);
    const changed = initialized && identity != null && previousIdentity != null && identity !== previousIdentity;
    if (!initialized || identity == null || changed && !animate) region.classList.remove('has-key-transition');
    else if (changed) region.classList.add('has-key-transition');
    initialized = true; previousIdentity = identity;
    if (identity == null) delete region.dataset.harmonicTone;
    else region.dataset.harmonicTone = String(((Number(context.color) || 0) % 5 + 5) % 5);
    return changed;
  }
  return { update, reset };
}
