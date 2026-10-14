// [Claude] — 2026-10-14 — Pédagogie IA : le panneau « Guide du tuto », à côté du Copilote.
//
// Narcisse : « le problème de Pédagogie IA est que ça n'aide pas à comprendre directement le
// tutoriel. Il faudrait : (a) identifier les passages clés et les moments importants […] en
// précisant ce que chaque partie explique ; (b) regrouper toutes ces explications pour donner un
// rendu final (pas seulement écrit) : montrer à quoi ça ressemble concrètement une fois assemblé ;
// (c) repérer les mouvements harmoniques […] et savoir si le tuto le montre. Il faut que tout soit
// extrêmement simple et limpide […], en évitant les textes minuscules en gris ».
//
// Trois volets, dépliables (animés) :
//   1. LE RÉSULTAT FINAL — la progression de chaque partie, ses accords en grand (degré + nom),
//      « Écouter » (deux mains, ou une main) ; d'un clic sur un accord, ce que fait chaque main ;
//   2. LES ÉTAPES — ce que montre chaque moment du tuto, dans l'ordre ; un clic y amène la vidéo et
//      en fait le passage du Copilote ; « Explique » le lui demande ;
//   3. LES MOUVEMENTS — « Du [1] au [6] » : ce que le tuto montre, sinon le chemin de sa boucle.
// Tout vient du guide (tutorial-guide.js) : rien n'est inventé ici.
//
// createGuidePanel(callbacks) rend { root, render(guide), setNow(t), setPlaying(id, playing) }.

import { findMovements, movementKindText, noteFr, bareDegree, clock } from '../pedagogie/tutorial-guide.js';

const KIND_ICON = {
  both: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10"/><path d="M13 10V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.5-2.7L3 15a1.6 1.6 0 0 1 2.4-2l1.6 1.6"/></svg>',
  lh: '<span aria-hidden="true">G</span>',
  rh: '<span aria-hidden="true">D</span>',
  line: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  talk: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const EYE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ASK_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.29 1.29L3 12l5.81 1.9a2 2 0 0 1 1.29 1.29L12 21l1.9-5.81a2 2 0 0 1 1.29-1.29L21 12l-5.81-1.9a2 2 0 0 1-1.29-1.29z"/></svg>';
const CHEVRON = '<svg class="pedago-guide-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const DEGREES = ['1', '2', '3', '4', '5', '6', '7', 'b2', 'b3', '#4', 'b6', 'b7'];

/** « Fmaj9#11 » → « Fmaj9♯11 » : les altérations des extensions en signes (la fondamentale reste « Db »). */
const pretty = (name) => String(name || '').replace(/^([A-G][#b]?)(.*)$/, (m, root, rest) => root + rest.replace(/#(?=\d)/g, '♯').replace(/b(?=\d)/g, '♭'));
const OPEN_KEY = 'pjc.pedagogie.guide.open';

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

function readOpen() {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
    if (v && typeof v === 'object') return v;
  } catch (_) { /* stockage indisponible */ }
  return { final: true, steps: true, moves: false };
}

/**
 * @param {object} cb
 * @param {(t: number) => void} cb.onSeek
 * @param {(range: {start: number, end: number}) => void} cb.onRegion - le passage du Copilote
 * @param {(question: string, range?: {start: number, end: number}) => void} cb.onAsk
 * @param {(id: string, what: {kind: 'final', part: string, hand: string|null}|{kind: 'movement', start: number, end: number}) => void} cb.onPlay
 * @param {() => void} cb.onStop
 */
export function createGuidePanel({ onSeek = () => {}, onRegion = () => {}, onAsk = () => {}, onPlay = () => {}, onStop = () => {} } = {}) {
  const root = el('div', { className: 'pedago-guide', role: 'region', 'aria-label': 'Guide du tuto' });
  const open = readOpen();
  let guide = null;
  let playingId = null;
  let currentStep = null;
  let partShown = null;
  let search = { from: '1', to: '6' };

  const saveOpen = () => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch (_) { /* stockage indisponible */ } };

  /** Un volet dépliable : titre (bouton), corps animé (grille 0fr → 1fr). */
  function section(id, title, count, body) {
    const isOpen = open[id] !== false;
    const head = el('button', {
      type: 'button',
      className: 'pedago-guide-head',
      'aria-expanded': String(isOpen),
      onClick: () => {
        open[id] = !(open[id] !== false);
        saveOpen();
        wrap.classList.toggle('is-open', open[id]);
        head.setAttribute('aria-expanded', String(open[id]));
      },
    }, [el('span', { className: 'pedago-guide-title', text: title }), count != null ? el('span', { className: 'pedago-guide-count', text: String(count) }) : null]);
    head.insertAdjacentHTML('beforeend', CHEVRON);
    const wrap = el('section', { className: `pedago-guide-section is-${id}${isOpen ? ' is-open' : ''}` }, [
      head,
      el('div', { className: 'pedago-guide-body' }, [el('div', { className: 'pedago-guide-inner' }, [body])]),
    ]);
    return wrap;
  }

  function playButton(id, label, what, { big = false } = {}) {
    const on = playingId === id;
    const btn = el('button', {
      type: 'button',
      className: `pedago-guide-play${big ? ' is-big' : ''}${on ? ' is-playing' : ''}`,
      'data-play': id,
      'aria-pressed': String(on),
      onClick: () => (playingId === id ? onStop() : onPlay(id, what)),
    });
    btn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Arrêter' : label}</span>`;
    btn.dataset.label = label;
    return btn;
  }

  // ── 1. Le résultat final ───────────────────────────────────────────────────
  function finalBlock() {
    const parts = guide.parts.filter((p) => p.final);
    const box = el('div', { className: 'pedago-final' });
    if (!parts.length) {
      box.appendChild(el('p', { className: 'pedago-guide-empty', text: 'Pas assez d\'accords complets relevés pour reconstituer le résultat final de ce tuto.' }));
      return box;
    }
    if (!partShown || !parts.some((p) => p.id === partShown)) partShown = parts[parts.length - 1].id;
    if (parts.length > 1) {
      const tabs = el('div', { className: 'pedago-final-parts', role: 'tablist', 'aria-label': 'Les parties du tuto' });
      for (const p of parts) {
        tabs.appendChild(el('button', {
          type: 'button',
          role: 'tab',
          className: `pedago-final-part${p.id === partShown ? ' is-active' : ''}`,
          'aria-selected': String(p.id === partShown),
          onClick: () => { partShown = p.id; render(guide); },
        }, [el('span', { text: `En ${p.keyName.replace(/ majeur$/, '').replace(/ mineur$/, ' m')}` })]));
      }
      box.appendChild(tabs);
    }
    const part = parts.find((p) => p.id === partShown);
    const f = part.final;
    box.appendChild(el('p', {
      className: 'pedago-final-source',
      text: f.source === 'together'
        ? `Il la joue d'un trait à ${clock(f.start)}.`
        : 'Reconstitué à partir de ses explications : il ne la joue jamais d\'un trait.',
    }));
    if (part.sameAs) {
      const other = guide.parts.find((p) => p.id === part.sameAs);
      if (other) box.appendChild(el('p', { className: 'pedago-final-same', text: `La même progression qu'en ${other.keyName.replace(/ majeur$/, '')}.` }));
    }
    const chords = el('div', { className: 'pedago-final-chords', role: 'list' });
    const detail = el('div', { className: 'pedago-final-detail', 'aria-live': 'polite' });
    f.chords.forEach((c, i) => {
      const chip = el('button', {
        type: 'button',
        role: 'listitem',
        className: 'pedago-final-chord',
        style: `--i:${i}`,
        'aria-label': `${c.degree} : ${c.name}. Voir les deux mains`,
        onClick: () => {
          const was = chip.classList.contains('is-open');
          for (const x of chords.children) x.classList.remove('is-open');
          detail.textContent = '';
          detail.classList.remove('is-open');
          if (was) return;
          chip.classList.add('is-open');
          const hands = el('div', { className: 'pedago-hands' }, [
            el('div', { className: 'pedago-hand is-rh' }, [el('strong', { text: 'Main droite' }), el('span', { text: c.rh.map((m) => noteFr(m, { flats: part.key.flats })).join('  ') || '—' })]),
            el('div', { className: 'pedago-hand is-lh' }, [el('strong', { text: 'Main gauche' }), el('span', { text: c.lh.map((m) => noteFr(m, { flats: part.key.flats })).join('  ') || '—' })]),
          ]);
          detail.appendChild(el('p', { className: 'pedago-hands-title', text: pretty(c.name) }));
          detail.appendChild(hands);
          if (Number.isFinite(c.at)) {
            detail.appendChild(el('button', { type: 'button', className: 'pedago-guide-link', html: `${EYE_ICON}<span>Le voir dans la vidéo (${clock(c.at)})</span>`, onClick: () => onSeek(c.at) }));
          }
          void detail.offsetWidth;
          detail.classList.add('is-open');
        },
      }, [el('span', { className: 'pedago-final-degree', text: c.degree }), el('span', { className: 'pedago-final-name', text: pretty(c.name) })]);
      chords.appendChild(chip);
      if (i < f.chords.length - 1) chords.appendChild(el('span', { className: 'pedago-final-arrow', 'aria-hidden': 'true', text: '→' }));
    });
    box.appendChild(chords);
    box.appendChild(detail);
    const actions = el('div', { className: 'pedago-final-actions' }, [
      playButton(`guide-final-${part.id}`, 'Écouter le résultat', { kind: 'final', part: part.id, hand: null }, { big: true }),
      playButton(`guide-final-${part.id}-lh`, 'Main gauche', { kind: 'final', part: part.id, hand: 'LH' }),
      playButton(`guide-final-${part.id}-rh`, 'Main droite', { kind: 'final', part: part.id, hand: 'RH' }),
    ]);
    box.appendChild(actions);
    if (f.source === 'together') {
      box.appendChild(el('button', {
        type: 'button',
        className: 'pedago-guide-link',
        html: `${EYE_ICON}<span>Le passage dans la vidéo</span>`,
        onClick: () => { onRegion({ start: f.start, end: f.end }); onSeek(f.start); },
      }));
    }
    return box;
  }

  // ── 2. Les étapes ──────────────────────────────────────────────────────────
  function stepsBlock() {
    const list = el('ol', { className: 'pedago-steps' });
    let partId = null;
    guide.steps.forEach((s, i) => {
      if (guide.parts.length > 1 && s.part !== partId) {
        partId = s.part;
        const p = guide.parts.find((x) => x.id === s.part);
        list.appendChild(el('li', { className: 'pedago-steps-part', text: `Partie ${s.part.slice(1)} · ${p?.keyName || ''}` }));
      }
      const chords = s.chords.slice(0, 6).map((c) => el('span', { className: `pedago-step-chord${c.notes ? ' is-notes' : ''}`, text: c.notes ? c.name : pretty(c.name) }));
      const said = s.said?.length ? el('p', { className: 'pedago-step-said', text: `« ${s.said.join(' ').slice(0, 160)}${s.said.join(' ').length > 160 ? '…' : ''} »` }) : null;
      const item = el('li', {
        className: `pedago-step is-${s.kind}${s.complete ? ' is-complete' : ''}`,
        'data-step': s.id,
        style: `--i:${i}`,
      }, [
        el('button', {
          type: 'button',
          className: 'pedago-step-main',
          'aria-label': `${clock(s.start)} : ${s.title}. Aller à ce moment`,
          onClick: () => { onRegion({ start: s.start, end: s.end }); onSeek(s.start); },
        }, [
          el('span', { className: `pedago-step-icon is-${s.kind}`, html: KIND_ICON[s.kind] || '' }),
          el('span', { className: 'pedago-step-text' }, [
            el('span', { className: 'pedago-step-top' }, [el('span', { className: 'pedago-step-time', text: clock(s.start) }), el('strong', { className: 'pedago-step-title', text: s.title }), s.role ? el('span', { className: `pedago-step-role is-${s.role.id}`, title: `${s.role.guess ? 'Hypothèse : ' : ''}${s.role.why}`, text: s.role.guess ? `${s.role.label} ?` : s.role.label }) : null]),
            el('span', { className: 'pedago-step-summary', text: s.summary }),
            chords.length ? el('span', { className: 'pedago-step-chords' }, chords) : null,
            said,
          ]),
        ]),
        el('button', {
          type: 'button',
          className: 'pedago-step-ask',
          title: 'Demander au Copilote ce qu\'il explique ici',
          html: `${ASK_ICON}<span>Explique</span>`,
          onClick: () => onAsk(s.kind === 'talk'
            ? `Qu'est-ce qu'il explique entre ${clock(s.start)} et ${clock(s.end)} ?`
            : `Que montre-t-il entre ${clock(s.start)} et ${clock(s.end)} (${s.title.replace(/^En .* — /, '').toLowerCase()}) ?`, { start: s.start, end: s.end }),
        }),
      ]);
      list.appendChild(item);
    });
    return list;
  }

  // ── 3. Les mouvements ──────────────────────────────────────────────────────
  function movementCard(m, i) {
    const part = guide.parts.find((p) => p.id === m.part);
    const first = m.times[0];
    return el('li', { className: 'pedago-move', style: `--i:${i}` }, [
      el('div', { className: 'pedago-move-degrees' }, [
        el('span', { className: 'pedago-move-deg', text: m.from.degree }),
        el('span', { className: 'pedago-move-arrow', 'aria-hidden': 'true', text: '→' }),
        el('span', { className: 'pedago-move-deg', text: m.to.degree }),
      ]),
      el('div', { className: 'pedago-move-text' }, [
        el('strong', { text: pretty(`${m.from.name} → ${m.via.length ? `${m.via.map((v) => pretty(v.name)).join(' → ')} → ` : ''}`) + pretty(m.to.name) }),
        el('span', { text: `${pretty(movementKindText(m))}${guide.parts.length > 1 && part ? ` · en ${part.keyName.replace(/ majeur$/, '')}` : ''} · ${m.times.length > 1 ? `${m.times.length} fois` : clock(first.start)}` }),
      ]),
      el('div', { className: 'pedago-move-actions' }, [
        playButton(`guide-move-${m.id}`, 'Écouter', { kind: 'movement', start: first.start, end: first.end }),
        el('button', { type: 'button', className: 'pedago-guide-icon-btn', title: `Voir dans la vidéo (${clock(first.start)})`, 'aria-label': `Voir dans la vidéo (${clock(first.start)})`, html: EYE_ICON, onClick: () => { onRegion({ start: first.start, end: first.end }); onSeek(first.start); } }),
      ]),
    ]);
  }

  function movesBlock() {
    const box = el('div', { className: 'pedago-moves' });
    // La recherche : « Du [1] au [6] ».
    const select = (which) => {
      const s = el('select', { className: 'pedago-moves-select', 'aria-label': which === 'from' ? 'Degré de départ' : 'Degré d\'arrivée', onChange: (e) => { search[which] = e.target.value; renderResults(); } });
      for (const d of DEGREES) s.appendChild(el('option', { value: d, text: d, ...(search[which] === d ? { selected: true } : {}) }));
      return s;
    };
    box.appendChild(el('div', { className: 'pedago-moves-search' }, [
      el('span', { text: 'Aller du' }), select('from'), el('span', { text: 'au' }), select('to'),
    ]));
    const results = el('div', { className: 'pedago-moves-results', 'aria-live': 'polite' });
    box.appendChild(results);
    function renderResults() {
      results.textContent = '';
      const r = findMovements(guide, search.from, search.to);
      if (r.direct.length) {
        results.appendChild(el('p', { className: 'pedago-moves-answer is-yes', text: `Oui : le tuto va du ${search.from} au ${search.to}.` }));
        const ul = el('ul', { className: 'pedago-move-list' });
        r.direct.forEach((m, i) => ul.appendChild(movementCard(m, i)));
        results.appendChild(ul);
      } else {
        results.appendChild(el('p', { className: 'pedago-moves-answer is-no', text: `Le tuto ne va pas directement du ${search.from} au ${search.to}.` }));
        for (const route of r.routes) {
          results.appendChild(el('p', { className: 'pedago-moves-route' }, [
            el('span', { text: `Sa boucle${guide.parts.length > 1 ? ` (en ${route.keyName.replace(/ majeur$/, '')})` : ''} y va ainsi : ` }),
            el('strong', { text: route.path.map((c) => `${c.degree} ${pretty(c.name)}`).join('  →  ') }),
          ]));
        }
      }
    }
    renderResults();
    // Tout ce qu'il montre.
    if (guide.movements.length) {
      box.appendChild(el('p', { className: 'pedago-moves-all', text: 'Tous les mouvements du tuto' }));
      const ul = el('ul', { className: 'pedago-move-list' });
      guide.movements.forEach((m, i) => ul.appendChild(movementCard(m, i)));
      box.appendChild(ul);
    }
    return box;
  }

  /** @param {object|null} next - le guide ; `noNotes` : l'analyse est finie mais sans les notes du prof (lu au son). */
  function render(next, { noNotes = false } = {}) {
    guide = next;
    root.textContent = '';
    if (!guide) {
      root.appendChild(el('p', {
        className: 'pedago-guide-empty',
        text: noNotes
          ? 'Ce tuto a été lu au son : j\'ai ses accords, pas les notes exactes du prof. Le guide (étapes, résultat final, mouvements) a besoin des notes vues à l\'image. Le Copilote peut quand même t\'aider.'
          : 'Le guide apparaît dès que l\'analyse du tuto est finie.',
      }));
      return;
    }
    // Les degrés proposés par défaut : ceux de sa progression (du 1 au 6 s'il y sont).
    const degrees = new Set(guide.parts.flatMap((p) => p.progression.chords.map((c) => bareDegree(c.degree))));
    if (!degrees.has(search.from)) search.from = [...degrees][0] || '1';
    root.append(
      section('final', 'Le résultat final', null, finalBlock()),
      section('steps', 'Les étapes du tuto', guide.steps.length, stepsBlock()),
      section('moves', 'Les mouvements', guide.movements.length, movesBlock()),
    );
    root.classList.remove('is-entering');
    void root.offsetWidth;
    root.classList.add('is-entering');
    markStep();
  }

  function markStep() {
    for (const li of root.querySelectorAll('.pedago-step')) li.classList.toggle('is-current', li.dataset.step === currentStep);
  }

  /** L'étape où en est la vidéo s'éclaire. */
  function setNow(t) {
    if (!guide || !Number.isFinite(t)) return;
    const s = guide.steps.find((x) => t >= x.start && t < x.end);
    const id = s ? s.id : null;
    if (id === currentStep) return;
    currentStep = id;
    markStep();
  }

  /** Un exemple du guide joue (ou s'arrête) : son bouton le dit. */
  function setPlaying(id, playing) {
    playingId = playing ? id : (playingId === id ? null : playingId);
    for (const btn of root.querySelectorAll('[data-play]')) {
      const on = btn.dataset.play === playingId;
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML = `${on ? STOP_ICON : PLAY_ICON}<span>${on ? 'Arrêter' : btn.dataset.label}</span>`;
    }
  }

  return { root, render, setNow, setPlaying };
}
