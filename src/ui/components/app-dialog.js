// [Claude] — 2026-10-13 — Fenêtres de question et d'information de l'application.
//
// Narcisse : « pour toutes les suppressions, ou quand je change de fonction dans Exercices, j'ai
// un message qui vient d'Electron ou de Linux… le message doit vraiment venir de l'application.
// On ne sait jamais quel type de PC l'utilisateur aura. » Les confirm() / alert() du navigateur
// ouvrent une fenêtre du système (titre « Electron », boutons et police du bureau Linux, Windows ou
// macOS). Celles-ci sont dessinées par l'application, aux couleurs du thème, identiques partout.
//
// Elles s'appuient sur <dialog>.showModal() : posée au-dessus de tout, le reste de l'écran est
// inactif tant qu'on n'a pas répondu, Échap vaut « Annuler », le focus revient où il était.
//
//   appConfirm({ title, message, confirmLabel, cancelLabel, danger }) → Promise<boolean>
//   appAlert({ title, message, tone })                               → Promise<void>
//   appDialog({ title, message, detail, buttons, cancelId, tone })   → Promise<id du bouton>
//
// Les textes passent par textContent : jamais de HTML injecté depuis un nom de fichier.

const ICONS = {
  question: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17v.4"/></svg>',
  danger: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 16.5v.5"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};

let queue = Promise.resolve();

/**
 * Fenêtre à plusieurs boutons. Les fenêtres demandées en même temps passent l'une après l'autre.
 * @param {{ title: string, message?: string, detail?: string,
 *           buttons?: Array<{ id: string, label: string, primary?: boolean, danger?: boolean }>,
 *           cancelId?: string|null, tone?: 'question'|'danger'|'error'|'info' }} options
 *   cancelId : la réponse donnée par Échap (et le bouton qui reçoit le focus si aucun n'est
 *   « primary ») ; sans cancelId, Échap est sans effet.
 * @returns {Promise<string|null>}
 */
export function appDialog(options) {
  const run = () => open(options);
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/** Question oui / non. `danger` : le bouton de confirmation est rouge (suppression). */
export async function appConfirm({ title, message = '', detail = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
  const id = await appDialog({
    title,
    message,
    detail,
    tone: danger ? 'danger' : 'question',
    cancelId: 'cancel',
    buttons: [
      { id: 'cancel', label: cancelLabel },
      { id: 'ok', label: confirmLabel, primary: true, danger },
    ],
  });
  return id === 'ok';
}

/** Information à lire, un seul bouton « OK ». */
export async function appAlert({ title, message = '', detail = '', tone = 'info', okLabel = 'OK' } = {}) {
  await appDialog({ title, message, detail, tone, cancelId: 'ok', buttons: [{ id: 'ok', label: okLabel, primary: true }] });
}

function open({ title, message = '', detail = '', buttons = [{ id: 'ok', label: 'OK', primary: true }], cancelId = null, tone = 'question' } = {}) {
  // Hors navigateur (tests Node) : pas de fenêtre, on répond comme Échap / le premier bouton.
  if (typeof document === 'undefined') return Promise.resolve(cancelId ?? buttons[0]?.id ?? null);

  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.className = `app-dialog is-${tone}`;
    dlg.setAttribute('role', cancelId && buttons.length > 1 ? 'alertdialog' : 'dialog');
    const titleId = `app-dialog-title-${Date.now().toString(36)}`;
    dlg.setAttribute('aria-labelledby', titleId);

    const head = document.createElement('div');
    head.className = 'app-dialog-head';
    const icon = document.createElement('span');
    icon.className = 'app-dialog-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[tone] || ICONS.question;
    const h = document.createElement('h2');
    h.className = 'app-dialog-title';
    h.id = titleId;
    h.textContent = title || '';
    head.append(icon, h);
    dlg.appendChild(head);

    for (const [cls, text] of [['app-dialog-message', message], ['app-dialog-detail', detail]]) {
      if (!text) continue;
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      dlg.appendChild(p);
    }

    const row = document.createElement('div');
    row.className = 'app-dialog-actions';
    let focusTarget = null;
    let cancelBtn = null;
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      dlg.classList.remove('is-visible');
      try { dlg.close(); } catch { /* déjà fermée */ }
      dlg.remove();
      try { previousFocus?.focus?.({ preventScroll: true }); } catch { /* élément retiré */ }
      resolve(id);
    };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `app-dialog-btn${b.primary ? ' is-primary' : ''}${b.danger ? ' is-danger' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.id));
      row.appendChild(btn);
      if (b.primary) focusTarget = btn;
      if (b.id === cancelId) cancelBtn = btn;
    }
    // Une suppression ne part pas sur un Entrée machinal : le focus va sur « Annuler ».
    if (buttons.some((b) => b.danger) && cancelBtn) focusTarget = cancelBtn;
    dlg.appendChild(row);

    // Échap : la réponse « Annuler » (ou rien, si la fenêtre n'en a pas). Traité ici, sans
    // remonter : les raccourcis Échap des onglets (fermer un panneau, quitter une vue) ne doivent
    // pas agir sous la fenêtre. L'évènement « cancel » du navigateur reste couvert par sécurité.
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (cancelId != null) finish(cancelId);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (cancelId != null) finish(cancelId);
    });
    // Clic sur le voile autour de la fenêtre : comme Échap.
    dlg.addEventListener('mousedown', (e) => {
      if (e.target !== dlg || cancelId == null) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) finish(cancelId);
    });

    document.body.appendChild(dlg);
    dlg.showModal();
    (focusTarget || row.querySelector('button'))?.focus();
    requestAnimationFrame(() => dlg.classList.add('is-visible'));
  });
}
