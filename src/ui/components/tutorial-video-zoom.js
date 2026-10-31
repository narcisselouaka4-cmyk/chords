/**
 * Agrandit le cadre en place : le même lecteur conserve sa source, sa lecture et
 * ses écouteurs. Le Copilote et le clavier MIDI restent en dehors du cadre.
 */
export function bindTutorialVideoZoom({ root, frame, column, button }) {
  let expanded = false;
  const label = button.querySelector('span');

  function close({ focus = false } = {}) {
    if (!expanded) return;
    expanded = false;
    frame.classList.remove('is-enlarged');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Agrandir la vidéo');
    button.title = 'Agrandir la vidéo';
    label.textContent = 'Agrandir';
    if (focus) button.focus({ preventScroll: true });
  }

  function place() {
    if (!expanded) return;
    const bounds = root.getBoundingClientRect();
    const left = column.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !left.width) { close(); return; }
    // Le cadre reste dans la vue, au-dessus du clavier, même après un redimensionnement.
    const top = Math.max(8, bounds.top + 8);
    const bottom = Math.min(window.innerHeight - 8, bounds.bottom - 8);
    if (bottom <= top) { close(); return; }
    frame.style.setProperty('--video-zoom-left', `${Math.max(8, left.left)}px`);
    frame.style.setProperty('--video-zoom-top', `${top}px`);
    frame.style.setProperty('--video-zoom-width', `${Math.min(left.width, window.innerWidth - left.left - 8)}px`);
    frame.style.setProperty('--video-zoom-height', `${bottom - top}px`);
  }

  button.addEventListener('click', () => {
    if (expanded) { close(); return; }
    expanded = true;
    frame.classList.add('is-enlarged');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', 'Réduire la vidéo');
    button.title = 'Réduire la vidéo (Échap)';
    label.textContent = 'Réduire';
    place();
  });
  document.addEventListener('keydown', (event) => {
    if (expanded && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close({ focus: true });
    }
  });
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
  const observer = new ResizeObserver(place);
  observer.observe(root);
  observer.observe(column);
  return { close };
}
