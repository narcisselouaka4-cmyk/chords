// [Claude] — 2026-10-15 — Pédagogie IA : le panneau « Guide du tuto » = les CHAPITRES de la vidéo.
//
// Narcisse : « il y a vraiment trop d'options dans le guide du tuto, c'est beaucoup trop long, il faut
// scroller tout en bas de la sidebar […] nos guides tutos devraient ressembler un peu à ce que font les
// youtubeurs sur YouTube, avec une sorte de timeline : de gros chapitres, une à trois minutes pour
// l'introduction, puis un par sujet. Je veux que l'application les détecte d'elle-même. »
// Décisions : ADR-052 (des procédés rejouables, pas la leçon commentée), ADR-054 (pas de mains).
//
// Le panneau montre, de haut en bas :
//   1. DE QUOI ÇA PARLE — une phrase de l'IA, fondée sur ce que dit le prof (rien sans elle) ;
//   2. LA PROGRESSION COMPLÈTE — si le moteur l'a reconstituée : « Écouter » ;
//   3. LES CHAPITRES — repliés (l'heure, un titre) ; le chapitre en cours s'ouvre : sa phrase et les
//      mouvements qu'il montre, à écouter d'un clic. Un clic amène la vidéo au chapitre et en fait le
//      passage du Copilote ;
//   4. VITESSE ET TRANSPOSITION — pour bien observer un geste, ou se l'approprier dans une autre tonalité.
//
// Les chapitres viennent de guide-chapters.js (bornes décidées par le moteur, jamais par l'IA), les
// mouvements de guide-highlights.js : rien n'est inventé ici. Sans chapitres (vidéo courte, rien de lu),
// le panneau retombe sur les seuls mouvements.
//
// createGuidePanel(callbacks) rend { root, render(guide, options), setNow(t), setPlaying(id, playing) }.

import { buildHighlights, highlightAt, clock } from '../pedagogie/guide-highlights.js';

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

const NOTES = {
  pending: 'Titres en français en cours…',
  nokey: 'Les titres en français demandent la clé IA (réglages).',
};

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
  let chapters = [];
  let playingId = null;
  let currentId = null;
  let openId = null;

  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) { /* stockage indisponible */ } };
  const playWhat = (h) => ({ ...h.play, rate: view.rate, semitones: view.semitones });

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

  function playButton(h, { small = false } = {}) {
    if (h.check?.state === 'non exploitable') {
      const why = el('span', { className: 'pedago-hl-unplayable', text: 'Pas d\'écoute fiable pour ce passage' });
      why.title = h.check.problems.join(' ; ');
      return why;
    }
    const on = playingId === h.id;
    const btn = el('button', {
      type: 'button',
      className: `${small ? 'pedago-ch-move' : 'pedago-hl-play'}${on ? ' is-playing' : ''}`,
      'data-play': h.id,
      'aria-pressed': String(on),
      'aria-label': `Écouter : ${h.title}`,
      onClick: () => (playingId === h.id ? onStop() : onPlay(h.id, playWhat(h))),
    });
    btn.dataset.small = small ? '1' : '';
    btn.dataset.title = h.title;
    btn.dataset.detail = h.detail || '';
    paintPlay(btn, on);
    return btn;
  }

  function paintPlay(btn, on) {
    if (btn.dataset.small) {
      const label = `${btn.dataset.title}${btn.dataset.detail ? ` · ${btn.dataset.detail}` : ''}`.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      btn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${label}</span>`;
    } else {
      btn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Arrêter' : 'Écouter'}</span>`;
    }
  }

  /** Les accords de la progression complète, écrits (degré + nom), avec la tonalité (Narcisse : « on voit
   * quels sont les accords [au son], mais pas ce qui est dit à l'écrit »). */
  function writtenChords(h) {
    if (!h.chords?.length) return null;
    const row = el('div', { className: 'pedago-hl-chords' }, h.chords.map((c, i) => el('span', { className: 'pedago-hl-chord' }, [
      c.degree ? el('span', { className: 'pedago-hl-chord-degree', text: c.degree }) : null,
      el('span', { className: 'pedago-hl-chord-name', text: c.name }),
    ])));
    // [Claude] — 2026-10-16 — Quand le prof annonce sa tonalité, c'est la sienne qui s'affiche et non
    // celle devinée : dit au survol, sans alourdir la case (« Drop 2 » : « the key of C sharp »).
    const keyChip = h.keyName ? el('span', { className: `pedago-hl-key${h.keySaid ? ' is-said' : ''}`, text: h.keyName }) : null;
    if (keyChip && h.keySaid) keyChip.title = `La tonalité que le prof annonce : « ${h.keySaid} »`;
    return el('div', { className: 'pedago-hl-written' }, [keyChip, row]);
  }

  /** Une case « enseignement » (la progression complète, ou un mouvement quand il n'y a pas de chapitres). */
  function card(h, i) {
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
    return el('li', { className: `pedago-hl is-${h.kind}`, 'data-hl': h.id, style: `--i:${i}` }, [main, writtenChords(h), playButton(h)]);
  }

  /** Un chapitre, replié : l'heure et le titre. Ouvert (en cours ou cliqué) : sa phrase et ses mouvements. */
  function chapterRow(c, i) {
    const moves = c.moves.map((id) => highlights.find((h) => h.id === id)).filter(Boolean);
    const open = openId === c.id;
    const main = el('button', {
      type: 'button',
      className: 'pedago-ch-main',
      'aria-expanded': String(open),
      'aria-label': `${clock(c.start)} : ${c.title}. Aller à ce chapitre`,
      onClick: () => { openId = openId === c.id ? null : c.id; paintOpen(); onRegion({ start: c.start, end: c.end }); onSeek(c.start); },
    }, [
      el('span', { className: 'pedago-ch-time', text: clock(c.start) }),
      el('strong', { className: 'pedago-ch-title', text: c.title }),
      moves.length ? el('span', { className: 'pedago-ch-badge', title: `${moves.length} mouvement${moves.length > 1 ? 's' : ''} à écouter`, text: `▶ ${moves.length}` }) : null,
    ]);
    const subpoints = c.subpoints?.length ? el('div', { className: 'pedago-ch-subpoints' }, c.subpoints.map((sp) => el('button', {
      type: 'button',
      className: 'pedago-ch-subpoint',
      'aria-label': `${clock(sp.t)}${sp.label ? ` : ${sp.label}` : ''}. Aller à ce moment`,
      onClick: (e) => { e.stopPropagation(); onRegion({ start: sp.t, end: c.end }); onSeek(sp.t); },
    }, [
      el('span', { className: 'pedago-ch-subpoint-time', text: clock(sp.t) }),
      sp.label ? el('span', { className: 'pedago-ch-subpoint-label', text: sp.label }) : null,
    ]))) : null;
    const detail = (c.summary || moves.length || subpoints) ? el('div', { className: 'pedago-ch-detail' }, [
      c.summary ? el('p', { className: 'pedago-ch-summary', text: c.summary }) : null,
      subpoints,
      moves.length ? el('div', { className: 'pedago-ch-moves' }, moves.map((h) => playButton(h, { small: true }))) : null,
    ]) : null;
    return el('li', { className: `pedago-ch is-ch-${c.kind}${open ? ' is-open' : ''}`, 'data-ch': c.id, style: `--i:${i}` }, [main, detail]);
  }

  function paintOpen() {
    for (const li of root.querySelectorAll('.pedago-ch')) {
      const on = li.dataset.ch === openId;
      li.classList.toggle('is-open', on);
      li.querySelector('.pedago-ch-main')?.setAttribute('aria-expanded', String(on));
    }
  }

  /**
   * @param {object|null} next - le guide ; `noNotes` : analyse finie mais sans les notes du prof (lu au son).
   * @param {object} [opts]
   * @param {string} [opts.subject] - « de quoi parle le tuto » (IA) ; sinon ce que le moteur a relevé
   * @param {object[]} [opts.chapters] - les chapitres (guide-chapters.js)
   * @param {'pending'|'nokey'|null} [opts.titles] - l'état des titres en français
   */
  function render(next, { noNotes = false, subject = '', chapters: nextChapters = [], titles = null, check = null } = {}) {
    guide = next;
    chapters = nextChapters || [];
    root.textContent = '';
    highlights = guide ? buildHighlights(guide) : [];
    // [Claude] — 2026-10-16 — Le contrôle de cohérence (demo-check.js) : une case qui ne peut pas être jouée
    // fidèlement n'a pas de bouton « Écouter » — jamais un rejeu qui ne correspond pas à ce qu'elle annonce.
    for (const h of highlights) h.check = typeof check === 'function' ? check(h) : null;
    if (!guide && !chapters.length) {
      root.appendChild(el('p', {
        className: 'pedago-guide-empty',
        text: noNotes
          ? 'Ce tuto a été lu au son : je n\'ai pas les notes exactes du prof, donc rien à te montrer ici. Le Copilote peut quand même t\'aider.'
          : 'Le guide apparaît dès que l\'analyse du tuto est finie.',
      }));
      return;
    }
    // « De quoi ça parle » : seulement la phrase de l'IA, fondée sur ce que dit le prof. Pas de phrase tirée
    // des accords relevés : trop peu fiables pour affirmer quoi que ce soit (Narcisse).
    const about = subject;
    if (about) root.appendChild(el('p', { className: 'pedago-guide-about', text: about }));

    const final = highlights.find((h) => h.kind === 'final');
    if (final) root.appendChild(el('ol', { className: 'pedago-hl-list is-final' }, [card(final, 0)]));

    if (chapters.length) {
      root.appendChild(el('h3', { className: 'pedago-guide-heading', text: 'Chapitres' }));
      if (titles && NOTES[titles]) root.appendChild(el('p', { className: 'pedago-guide-note', text: NOTES[titles] }));
      root.appendChild(el('ol', { className: 'pedago-ch-list' }, chapters.map(chapterRow)));
    } else {
      const rest = highlights.filter((h) => h.kind !== 'final');
      if (rest.length) {
        root.appendChild(el('h3', { className: 'pedago-guide-heading', text: 'Ce qu\'il montre' }));
        root.appendChild(el('ol', { className: 'pedago-hl-list' }, rest.map(card)));
      } else if (!final) {
        root.appendChild(el('p', { className: 'pedago-guide-empty', text: 'Je n\'ai pas relevé de mouvement net dans ce tuto. Trace un passage sous la vidéo : le Copilote l\'analyse.' }));
      }
    }
    if (highlights.length) root.appendChild(controls());
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    markCurrent();
  }

  function markCurrent() {
    for (const li of root.querySelectorAll('.pedago-ch')) li.classList.toggle('is-current', li.dataset.ch === currentId);
    for (const li of root.querySelectorAll('.pedago-hl')) li.classList.toggle('is-current', li.dataset.hl === currentId);
  }

  /** Le chapitre où en est la vidéo s'éclaire (ou, sans chapitres, la case de son mouvement). */
  function setNow(t) {
    if (!Number.isFinite(t) || (!guide && !chapters.length)) return;
    const chapter = chapters.find((c) => t >= c.start && t < c.end);
    const id = chapter ? chapter.id : highlightAt(highlights, t);
    if (id === currentId) return;
    currentId = id;
    if (chapter) { openId = chapter.id; paintOpen(); }
    markCurrent();
  }

  /** Un exemple du guide joue (ou s'arrête) : son bouton le dit. */
  function setPlaying(id, playing) {
    playingId = playing ? id : (playingId === id ? null : playingId);
    for (const btn of root.querySelectorAll('[data-play]')) {
      const on = btn.dataset.play === playingId;
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-pressed', String(on));
      paintPlay(btn, on);
    }
  }

  return { root, render, setNow, setPlaying };
}
