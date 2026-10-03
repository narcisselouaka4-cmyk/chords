// [Claude] — 2026-10-03 — Une seule conversation du Copilote, deux endroits : son onglet
// (Copilot IA) et le panneau de droite de Pédagogie IA. Narcisse : « pourquoi ne pas
// intégrer directement Copilot IA au sein de Pédagogie IA, plutôt que d'être redirigé
// vers un onglet séparé ? ».
//
// On DÉPLACE les éléments de la conversation (#copilot-chat-area, #copilot-no-key) au
// lieu d'en fabriquer une seconde : même moteur (src/pedagogie/copilot-tab.js), mêmes
// écouteurs, même historique. Un repère (commentaire HTML) garde leur place d'origine
// dans l'onglet Copilote pour les y remettre. Les styles du Copilote valent aux deux
// endroits (sélecteurs :is(#practice-view-copilot, #pedagogie-copilot-panel)).

const MOVABLE_IDS = ['copilot-chat-area', 'copilot-no-key'];
let homeMarker = null;

function movableNodes() {
  return MOVABLE_IDS.map((id) => document.getElementById(id)).filter(Boolean);
}

/** La conversation est-elle dans ce conteneur ? */
export function isCopilotDockedIn(slot) {
  const first = document.getElementById(MOVABLE_IDS[0]);
  return Boolean(slot && first && first.parentElement === slot);
}

/**
 * Amène la conversation du Copilote dans `slot` (le panneau de Pédagogie IA).
 * @param {HTMLElement} slot
 * @returns {boolean} vrai si la conversation y est
 */
export function dockCopilot(slot) {
  const nodes = movableNodes();
  if (!slot || !nodes.length) return false;
  if (!homeMarker) {
    homeMarker = document.createComment(' place de la conversation du Copilote (copilot-dock.js) ');
    nodes[0].before(homeMarker);
  }
  if (isCopilotDockedIn(slot)) return true;
  slot.append(...nodes);
  document.dispatchEvent(new CustomEvent('copilot-dock-change', { detail: { docked: true } }));
  return true;
}

/** Remet la conversation à sa place, dans l'onglet Copilote. */
export function undockCopilot() {
  const nodes = movableNodes();
  if (!homeMarker || !homeMarker.parentNode || !nodes.length) return false;
  if (homeMarker.nextSibling === nodes[0]) return true;
  homeMarker.after(...nodes);
  document.dispatchEvent(new CustomEvent('copilot-dock-change', { detail: { docked: false } }));
  return true;
}
