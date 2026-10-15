// [Claude] — 2026-10-15 — Pédagogie IA : le panneau « Guide du tuto », réduit à l'essentiel.
//
// Narcisse : « il y a vraiment trop d'options dans le guide du tuto, c'est beaucoup trop long, il faut
// scroller tout en bas de la sidebar […] j'avais moi-même envie de suivre sa vidéo directement sur
// YouTube ». Décisions : ADR-052 (des procédés rejouables, pas la leçon commentée), ADR-054 (pas de mains).
//
// Deux blocs seulement :
//   1. DE QUOI ÇA PARLE — une phrase, ce que le moteur a relevé (la boucle, la tonalité) ;
//   2. CE QU'IL MONTRE — six cases au plus pour toute la vidéo. Un clic amène la vidéo au bon moment et
//      en fait le passage du Copilote ; « Écouter » le rejoue, à la vitesse et dans la tonalité choisies.
//
// Disparus : les étapes une à une, les accords en puces, les mains, la mélodie, les paroles, le rôle
// supposé (« Intro ? »), la recherche « du 1 au 6 ». Tout vient du guide du moteur (tutorial-guide.js) :
// rien n'est inventé ici. Le choix des cases est dans guide-highlights.js (pur, testé).
//
// createGuidePanel(callbacks) rend { root, render(guide), setNow(t), setPlaying(id, playing) }.

import { buildHighlights, describeSubject, highlightAt, clock } from '../pedagogie/guide-highlights.js';

const PLAY_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

const RATES = [{ value: 1, label: '1×' }, { value: 0.75, label: '¾' }, { value: 0.5, label: '½' }, { value: 0.25, label: '¼' }];
const TRANSPOSE = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];
const VIEW_KEY = 'pjc.pedagogie.guide.view';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function readView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (v && typeof v === 'object') return { rate: RATES.some((r) => r.value === v.rate) ? v.rate : 1, semitones: TRANSPOSE.includes(v.semitones) ? v.semitones : 0 };
  } catch (_) { /* stockage indisponible */ }
  return { rate: 1, semitones: 0 };
}

/**
 * @param {object} cb
 * @param {(t: number) => void} cb.onSeek
 * @param {(range: {start: number, end: number}) => void} cb.onRegion - le passage du Copilote
 * @param {(id: string, what: object) => void} cb.onPlay - what : {kind, …, rate, semitones}
 * @param {() => void} cb.onStop
 */
export function createGuidePanel({ onSeek = () => {}, onRegion = () => {}, onPlay = () => {}, onStop = () => {} } = {}) {
  const root = el('div', { className: 'pedago-guide', role: 'region', 'aria-label': 'Guide du tuto' });
  const view = readView();
  let guide = null;
  let highlights = [];
  let playingId = null;
  let currentId = null;

  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) { /* stockage indisponible */ } };

  function controls() {
    const speed = el('div', { className: 'pedago-hl-speed', role: 'group', 'aria-label': 'Vitesse d\'écoute' }, RATES.map((r) => el('button', {
      type: 'button',
      className: `pedago-hl-rate${view.rate === r.value ? ' is-active' : ''}`,
      'aria-pressed': String(view.rate === r.value),
      onClick: () => { view.rate = r.value; saveView(); for (const b of speed.children) { const on = b.textContent === r.label; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on)); } },
    }, [r.label])));
    const select = el('select', {
      className: 'pedago-hl-transpose',
      'aria-label': 'Transposer',
      onChange: (e) => { view.semitones = Number(e.target.value); saveView(); },
    }, TRANSPOSE.map((n) => el('option', { value: String(n), text: n === 0 ? 'Tonalité d\'origine' : `${n > 0 ? '+' : '−'}${Math.abs(n)} demi-ton${Math.abs(n) > 1 ? 's' : ''}`, ...(view.semitones === n ? { selected: true } : {}) })));
    return el('div', { className: 'pedago-hl-controls' }, [
      el('label', {}, [el('span', { text: 'Vitesse' }), speed]),
      el('label', {}, [el('span', { text: 'Transposer' }), select]),
    ]);
  }

  function card(h, i) {
    const on = playingId === h.id;
    const main = el('button', {
      type: 'button',
      className: 'pedago-hl-main',
      disabled: !Number.isFinite(h.start),
      'aria-label': `${h.title}${Number.isFinite(h.start) ? ` à ${clock(h.start)}. Aller à ce moment` : ''}`,
      onClick: () => { if (!Number.isFinite(h.start)) return; onRegion({ start: h.start, end: h.end }); onSeek(h.start); },
    }, [
      el('span', { className: 'pedago-hl-title', text: h.title }),
      h.detail ? el('span', { className: 'pedago-hl-detail', text: h.detail }) : null,
      Number.isFinite(h.start) ? el('span', { className: 'pedago-hl-time', text: clock(h.start) }) : null,
    ]);
    const play = el('button', {
      type: 'button',
      className: `pedago-hl-play${on ? ' is-playing' : ''}`,
      'data-play': h.id,
      'aria-pressed': String(on),
      onClick: () => (playingId === h.id ? onStop() : onPlay(h.id, { ...h.play, rate: view.rate, semitones: view.semitones })),
    });
    play.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Arrêter' : 'Écouter'}</span>`;
    return el('li', { className: `pedago-hl is-${h.kind}`, 'data-hl': h.id, style: `--i:${i}` }, [main, play]);
  }

  /** @param {object|null} next - le guide ; `noNotes` : analyse finie mais sans les notes du prof (lu au son). */
  function render(next, { noNotes = false, subject = '' } = {}) {
    guide = next;
    root.textContent = '';
    if (!guide) {
      root.appendChild(el('p', {
        className: 'pedago-guide-empty',
        text: noNotes
          ? 'Ce tuto a été lu au son : je n\'ai pas les notes exactes du prof, donc rien à te montrer ici. Le Copilote peut quand même t\'aider.'
          : 'Le guide apparaît dès que l\'analyse du tuto est finie.',
      }));
      return;
    }
    highlights = buildHighlights(guide);
    const about = subject || describeSubject(guide);
    if (about) root.appendChild(el('p', { className: 'pedago-guide-about', text: about }));
    if (!highlights.length) {
      root.appendChild(el('p', { className: 'pedago-guide-empty', text: 'Je n\'ai pas relevé de mouvement net dans ce tuto. Trace un passage sous la vidéo : le Copilote l\'analyse.' }));
      return;
    }
    root.appendChild(el('h3', { className: 'pedago-guide-heading', text: 'Ce qu\'il montre' }));
    root.appendChild(el('ol', { className: 'pedago-hl-list' }, highlights.map(card)));
    root.appendChild(controls());
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    markCurrent();
  }

  function markCurrent() {
    for (const li of root.querySelectorAll('.pedago-hl')) li.classList.toggle('is-current', li.dataset.hl === currentId);
  }

  /** La case où en est la vidéo s'éclaire. */
  function setNow(t) {
    if (!guide || !Number.isFinite(t)) return;
    const id = highlightAt(highlights, t);
    if (id === currentId) return;
    currentId = id;
    markCurrent();
  }

  /** Un exemple du guide joue (ou s'arrête) : son bouton le dit. */
  function setPlaying(id, playing) {
    playingId = playing ? id : (playingId === id ? null : playingId);
    for (const btn of root.querySelectorAll('[data-play]')) {
      const on = btn.dataset.play === playingId;
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Arrêter' : 'Écouter'}</span>`;
    }
  }

  return { root, render, setNow, setPlaying };
}
