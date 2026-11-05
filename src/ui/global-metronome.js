// [Claude] — 2026-11-04 — Métronome global, dans l'en-tête.
//
// Narcisse : « la batterie sert un peu de métronome, donc je voudrais que
// finalement ce ne soit pas réservé uniquement à l'onglet exercice […] tu vas
// mettre l'icône du métronome en haut à droite. Et quand tu cliques sur
// l'icône, plusieurs styles différents : salsa, jazz, blues, worship, R&B… »
//
// Il réutilise le lecteur de boucles des démonstrations (src/audio/drum-loop.js)
// et les mêmes fichiers audio. Les styles viennent du manifeste
// `src/public/drum-loops/kits.json`, qu'il peut modifier : ajouter un style ou
// remplacer une boucle ne demande aucune reconstruction en développement.

import { drumKitById, drumBeatsFor } from '../audio/drum-loop.js';

const STORAGE = 'global-metronome';
const STEP = 2;            // le pas des boutons − / +

/**
 * Familles de styles. Regrouper évite la grille de seize pastilles où l'on ne
 * retrouve rien ; l'ordre va du plus proche de ce que travaille Narcisse au
 * plus accessoire. Un style absent d'ici atterrit dans « Autres », donc ajouter
 * une entrée au manifeste n'oblige jamais à revenir toucher cette liste.
 */
const GROUPS = [
  { label: 'Latin', ids: ['salsa', 'salsa-montuno', 'salsa-latin', 'merengue', 'latin-jazz', 'bossa'] },
  { label: 'Jazz & blues', ids: ['jazz', 'blues'] },
  { label: 'Gospel & worship', ids: ['gospel', 'worship'] },
  { label: 'Groove', ids: ['rnb', 'funk', 'hip-hop', 'pop', 'rock', 'reggae'] },
  { label: 'Percussions seules', ids: ['shaker', 'tambourin'] },
];

export function initGlobalMetronome({ drumLoop, styles, resumeAudio = null }) {
  const root = document.getElementById('global-metronome');
  const button = document.getElementById('global-metronome-btn');
  const panel = document.getElementById('global-metronome-panel');
  const play = document.getElementById('global-metronome-play');
  const tempoInput = document.getElementById('global-metronome-tempo');
  const stylesHost = document.getElementById('global-metronome-styles');
  const currentName = document.getElementById('global-metronome-current');
  const beatsHost = document.getElementById('global-metronome-beats');
  const volume = document.getElementById('global-metronome-volume');
  const note = document.getElementById('global-metronome-note');
  if (!root || !button || !panel || !play || !stylesHost) return null;

  const state = { style: 'salsa', tempo: 96, volume: 0.7, running: false, touchedTempo: false };
  try {
    const saved = JSON.parse(window.localStorage?.getItem(STORAGE) || '{}');
    if (typeof saved.style === 'string') state.style = saved.style;
    if (Number.isFinite(saved.tempo)) state.tempo = saved.tempo;
    if (Number.isFinite(saved.volume)) state.volume = saved.volume;
    if (saved.touchedTempo === true) state.touchedTempo = true;
  } catch (e) { /* Réglages gardés pour cette séance seulement. */ }

  function save() {
    try {
      window.localStorage?.setItem(STORAGE, JSON.stringify({
        style: state.style, tempo: state.tempo, volume: state.volume, touchedTempo: state.touchedTempo,
      }));
    } catch (e) { /* Séance seulement. */ }
  }

  const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderStyles() {
    const list = styles();
    if (!list.some((s) => s.id === state.style)) state.style = list[0]?.id || '';
    const byId = new Map(list.map((s) => [s.id, s]));
    const placed = new Set();
    const chip = (s) => {
      const on = s.id === state.style;
      return `<button type="button" class="mt-style${on ? ' active' : ''}" role="radio" aria-checked="${on}" data-style="${escape(s.id)}" data-tempo="${s.tempo}" title="${escape(s.label)}">${escape(s.label)}</button>`;
    };
    let html = '';
    for (const group of GROUPS) {
      const found = group.ids.map((id) => byId.get(id)).filter(Boolean);
      if (!found.length) continue;
      found.forEach((s) => placed.add(s.id));
      html += `<p class="mt-group-label">${escape(group.label)}</p><div class="mt-group">${found.map(chip).join('')}</div>`;
    }
    const rest = list.filter((s) => !placed.has(s.id));
    if (rest.length) html += `<p class="mt-group-label">Autres</p><div class="mt-group">${rest.map(chip).join('')}</div>`;
    stylesHost.innerHTML = html;
    if (currentName) currentName.textContent = byId.get(state.style)?.label || state.style || '—';
  }

  // --- Témoins de temps : ils battent au tempo réglé, à partir de l'instant
  // où la boucle a démarré. Purement visuel — aucun son n'en dépend.
  let beatTimer = null;
  const dots = () => [...(beatsHost?.children || [])];
  function stopBeats() {
    if (beatTimer) cancelAnimationFrame(beatTimer);
    beatTimer = null;
    dots().forEach((d) => d.classList.remove('on', 'first'));
  }
  function runBeats(startedAt) {
    stopBeats();
    const loopBeats = drumBeatsFor(drumKitById(state.style));
    const perBeat = 60000 / Math.max(1, state.tempo);
    let shown = -1;
    const tick = () => {
      const beat = Math.floor((performance.now() - startedAt) / perBeat);
      if (beat !== shown && beat >= 0) {
        shown = beat;
        const index = beat % 4;
        dots().forEach((d, i) => {
          d.classList.toggle('on', i === index);
          d.classList.toggle('first', i === 0 && beat % loopBeats === 0);
        });
      }
      beatTimer = requestAnimationFrame(tick);
    };
    beatTimer = requestAnimationFrame(tick);
  }

  function renderState() {
    play.setAttribute('aria-pressed', String(state.running));
    play.setAttribute('aria-label', state.running ? 'Arrêter le métronome' : 'Démarrer le métronome');
    button.classList.toggle('is-playing', state.running);
    if (tempoInput && document.activeElement !== tempoInput) tempoInput.value = String(state.tempo);
    if (volume) volume.value = String(Math.round(state.volume * 100));
    if (!note) return;
    const why = drumLoop.lastError?.();
    // Un métronome muet sans explication est inutilisable : on dit pourquoi.
    note.textContent = state.running && why ? `Sans son — ${why}` : '';
    note.hidden = !note.textContent;
  }

  let startGeneration=0;
  async function start() {
    const generation=++startGeneration;
    state.running = true;
    renderState();
    if (resumeAudio) { try { await resumeAudio(); } catch (e) { /* le contexte se réveillera au clic suivant */ } }
    if(generation!==startGeneration||!state.running)return;
    const kit = drumKitById(state.style);
    // Le tempo du manifeste est une suggestion ; le réglage affiché fait foi.
    const ok = await drumLoop.start({ kit: kit ? { ...kit, tempo: state.tempo } : null, tempo: state.tempo });
    if(generation!==startGeneration||!state.running)return;
    if (ok) runBeats(performance.now()); else stopBeats();
    renderState();
  }

  function stop() {
    ++startGeneration;
    state.running = false;
    drumLoop.stop();
    stopBeats();
    renderState();
  }

  function setTempo(value) {
    const next = Math.max(40, Math.min(220, Math.round(Number(value) || state.tempo)));
    if (next === state.tempo) return;
    state.tempo = next;
    state.touchedTempo = true;
    save();
    renderState();
    if (state.running) start();
  }

  /**
   * [Claude] — 2026-11-04 — Le panneau est placé en coordonnées FIXES, calculées
   * ici. En `position: absolute` il dépendait de ses ancêtres, et `#app` est en
   * `overflow: hidden` : Narcisse l'a reçu tronqué, en-tête et bouton Lecture
   * coupés — donc impossible à démarrer. En `fixed`, aucun ancêtre ne peut plus
   * le rogner, et on le borne nous-mêmes à la fenêtre.
   */
  function place() {
    const b = button.getBoundingClientRect();
    const marge = 8;
    const largeur = panel.offsetWidth || 300;
    const left = Math.max(marge, Math.min(b.right - largeur, window.innerWidth - largeur - marge));
    const top = b.bottom + 10;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    // Ce qui reste sous le bouton, jamais moins que de quoi rester utilisable.
    panel.style.maxHeight = `${Math.max(240, Math.round(window.innerHeight - top - marge))}px`;
  }

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    if (open) { renderStyles(); place(); }
  }

  window.addEventListener('resize', () => { if (!panel.hidden) place(); });

  button.addEventListener('click', (e) => { e.stopPropagation(); setOpen(panel.hidden); });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !root.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); button.focus(); }
  });

  play.addEventListener('click', () => { if (state.running) stop(); else start(); });
  document.getElementById('global-metronome-slower')?.addEventListener('click', () => setTempo(state.tempo - STEP));
  document.getElementById('global-metronome-faster')?.addEventListener('click', () => setTempo(state.tempo + STEP));

  stylesHost.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-style]');
    if (!chip) return;
    // renderStyles remplace le bouton : le clic ne doit pas devenir un clic
    // « extérieur » quand il remonte ensuite vers document.
    e.stopPropagation();
    state.style = chip.dataset.style;
    // Le tempo suit le style tant que Narcisse n'en a pas choisi un lui-même :
    // une salsa et une ballade n'ont pas la même allure, et devoir régler le
    // tempo à chaque changement de style serait pénible.
    if (!state.touchedTempo) state.tempo = Number(chip.dataset.tempo) || state.tempo;
    save();
    renderStyles();
    renderState();
    if (state.running) start();
  });

  tempoInput?.addEventListener('change', () => setTempo(tempoInput.value));
  volume?.addEventListener('input', () => {
    state.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
    drumLoop.setVolume(state.volume);
    save();
  });

  drumLoop.setVolume(state.volume);
  renderStyles();
  renderState();

  return {
    /** Les styles ont pu changer (manifeste du disque lu après coup). */
    refresh: () => { renderStyles(); renderState(); },
    isRunning: () => state.running,
    /**
     * Reprend la boucle après qu'une démonstration a emprunté le lecteur.
     * L'état « en marche » n'a pas bougé : seule la boucle avait été coupée.
     */
    resume: () => { if (state.running) start(); },
    stop,
  };
}
