// Lot D — Description réutilisable de l'état du clavier repliable.
// Pur de tout DOM : main.js applique cet état, les tests le vérifient sans
// navigateur. Le clavier reste intégralement C0-C9 : replier ne retire ni ne
// cache une touche, le conteneur conserve son propre défilement horizontal.
export function keyboardCompactState(isCompact) {
  if (isCompact) {
    return {
      isCompact: true,
      text: '[v]',
      title: 'Développer le clavier',
      ariaLabel: 'Développer le clavier',
      ariaExpanded: 'false',
      className: 'keyboard-compact',
    };
  }
  return {
    isCompact: false,
    text: '[^]',
    title: 'Réduire le clavier',
    ariaLabel: 'Réduire le clavier',
    ariaExpanded: 'true',
    className: '',
  };
}

// Applique l'état compact aux éléments DOM du clavier. Sépare dans un module
// testable en Node avec un mini-mock (main.js l'appelle directement).
export function applyKeyboardCompactState(tree, isCompact) {
  const panel = tree.panel;
  const toggle = tree.toggle;
  const state = keyboardCompactState(isCompact);
  if (panel) {
    if (isCompact) {
      panel.classList.add(state.className);
    } else {
      panel.classList.remove('keyboard-compact');
    }
  }
  if (toggle) {
    toggle.textContent = state.text;
    toggle.title = state.title;
    toggle.setAttribute('aria-label', state.ariaLabel);
    toggle.setAttribute('aria-expanded', state.ariaExpanded);
  }
  return state;
}