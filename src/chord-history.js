const MAX_HISTORY = 50;

export function createChordHistory(onSelect) {
  const history = [];

  function add(item) {
    history.unshift(item);
    if (history.length > MAX_HISTORY) history.pop();
    render();
    return history;
  }

  function clear() {
    history.length = 0;
    render();
  }

  function getAll() {
    return [...history];
  }

  function render(container) {
    if (!container) return;
    container.innerHTML = '';

    if (history.length === 0) {
      container.innerHTML = '<p style="color: var(--muted); font-size: 0.8rem;">Aucun accord joué pour le moment.</p>';
      return;
    }

    for (const item of history) {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <span class="history-chord">${item.display || item.name}</span>
        <span class="time">${formatTime(item.timestamp)}</span>
      `;
      el.addEventListener('click', () => onSelect?.(item));
      container.appendChild(el);
    }
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return { add, clear, getAll, render };
}
