// L'étape 0 ne contient que le panneau des morceaux : il ne peut donc jamais
// rester replié. Le helper garde l'état logique et le DOM synchronisés.
export function applyStudioSidebarState(elements, stage, requestedCollapsed) {
  const canCollapse = stage !== 0;
  const collapsed = canCollapse && Boolean(requestedCollapsed);

  elements.sidebar?.classList.toggle('collapsed', collapsed);
  for (const control of [elements.collapseButton, elements.expandButton]) {
    if (!control) continue;
    control.disabled = !canCollapse;
    control.setAttribute('aria-hidden', String(!canCollapse));
  }

  return collapsed;
}
