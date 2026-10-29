import { noteNameToPc } from '../../chord-engine/intervals.js';

// Une nouvelle boucle dans la même tonalité n'est pas une modulation.
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

/** État visuel commun aux cases et à la portée, piloté exclusivement par le lecteur. */
export function createModulationFeedback({ host, region, badge, describeKey,
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
}) {
  let initialized = false, previousIdentity = null, wash = null, caption = null;
  function cancel() { wash?.cancel(); caption?.cancel(); wash = null; caption = null; }
  function reset() {
    cancel(); initialized = false; previousIdentity = null;
    delete region.dataset.harmonicTone; badge.hidden = true; badge.textContent = '';
  }
  function update(context, { modulated = false, animate = true } = {}) {
    const identity = tonalIdentity(context);
    const changed = initialized && identity != null && previousIdentity != null && identity !== previousIdentity;
    initialized = true; previousIdentity = identity;
    if (identity == null) delete region.dataset.harmonicTone;
    else region.dataset.harmonicTone = String(((Number(context.color) || 0) % 5 + 5) % 5);
    const label = modulated && identity != null ? `Modulation · ${describeKey(context.key, context.mode)}` : '';
    if (badge.textContent !== label) badge.textContent = label;
    badge.hidden = !label;
    if (!changed) return false;
    cancel();
    if (!animate || reducedMotion()) return true;
    // Une seule respiration de couleur : pas de flash répété, de halo ou de rebond.
    wash = host.animate?.([
      { backgroundColor: 'color-mix(in srgb, var(--modulation-accent) 14%, transparent)', boxShadow: 'inset 0 0 0 2px var(--modulation-accent)' },
      { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 0 transparent' },
    ], { duration: 850, easing: 'ease-out' });
    if (!badge.hidden) caption = badge.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 400 });
    return true;
  }
  return { update, reset };
}
