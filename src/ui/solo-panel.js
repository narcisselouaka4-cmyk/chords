// [Claude] — 2026-11-05 — Panneau du mode Solo.
//
// Il ne touche ni au moteur d'exercice ni à son état : le mode Solo ne juge pas
// « l'accord annoncé », donc il n'avait rien à gagner à passer par `setMode`.
// Les 549 vérifications du moteur d'exercice restent valables telles quelles.
//
// Le fond de jeu (montuno + batterie) est INJECTÉ depuis main.js, qui possède
// déjà le lecteur de démos, la fabrique de voicings et la boucle de batterie.
// Rien n'est dupliqué ici : ce module décide quoi jouer et quoi afficher, pas
// comment ça sonne.

import { SOLO_KIND_LABELS, SOLO_KIND_PROMISE } from '../solo/solo-session.js';
import { pcName } from '../solo/footing-judge.js';
import { MIN_TOLERANCE_MS, MAX_TOLERANCE_MS } from '../solo/rhythm-judge.js';

const MIN_TEMPO = 50;
const MAX_TEMPO = 200;
const TEMPO_STEP = 4;
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * @param {object} deps
 * @param {object[]} deps.entries - fiches du mode Solo
 * @param {object} deps.session - créée par createSoloSession
 * @param {(opts: object) => Promise<boolean>} deps.startBacking
 * @param {() => void} deps.stopBacking
 * @param {() => number} deps.getBeat - position du fond, en temps musicaux
 * @param {() => boolean} deps.isBackingPlaying
 * @param {Document} [deps.doc]
 */
export function createSoloPanel({
  entries = [], session, startBacking, stopBacking, getBeat,
  isBackingPlaying = () => false, doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!doc) return null;
  const el = (id) => doc.getElementById(id);
  const stage = el('solo-stage');
  if (!stage || !session) return null;

  const ui = {
    cards: el('solo-cards'),
    kindLabel: el('solo-kind-label'),
    title: el('solo-title'),
    promise: el('solo-promise'),
    brief: el('solo-brief'),
    startBtn: el('solo-start-btn'),
    startLabel: el('solo-start-label'),
    resetBtn: el('solo-reset-btn'),
    tempo: el('solo-tempo'),
    tempoDown: el('solo-tempo-down'),
    tempoUp: el('solo-tempo-up'),
    drumsBtn: el('solo-drums-btn'),
    verdict: el('solo-verdict'),
    detail: el('solo-detail'),
    settings: el('solo-settings'),
    tolerance: el('solo-tolerance'),
    toleranceValue: el('solo-tolerance-value'),
  };

  let selected = null;
  let tempo = 90;
  let drums = true;
  let running = false;
  let frame = null;

  // ------------------------------------------------------------- Les fiches

  function renderCards() {
    if (!ui.cards) return;
    ui.cards.innerHTML = '';
    for (const entry of entries) {
      const card = doc.createElement('button');
      card.type = 'button';
      card.className = 'solo-card';
      card.dataset.id = entry.id;
      card.setAttribute('aria-pressed', String(selected?.id === entry.id));
      if (selected?.id === entry.id) card.classList.add('is-selected');
      const kind = doc.createElement('span');
      kind.className = 'solo-card-kind';
      kind.textContent = SOLO_KIND_LABELS[entry.solo.kind] || entry.solo.kind;
      const name = doc.createElement('strong');
      name.className = 'solo-card-name';
      name.textContent = entry.name;
      const route = doc.createElement('span');
      route.className = 'solo-card-route';
      route.textContent = entry.route || '';
      card.append(kind, name, route);
      ui.cards.append(card);
    }
  }

  /** Charge une fiche. Le fond en cours s'arrête : on ne mélange pas deux grilles. */
  function select(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    if (running) stop();
    selected = entry;
    tempo = Number(entry.solo.tempo) || 90;
    session.load(entry);
    renderCards();
    renderHead();
    renderVerdict();
    return entry;
  }

  // ------------------------------------------------------------- L'en-tête

  function renderHead() {
    const kind = selected?.solo?.kind;
    if (ui.kindLabel) ui.kindLabel.textContent = (SOLO_KIND_LABELS[kind] || 'SOLO').toUpperCase();
    if (ui.title) ui.title.textContent = selected?.name || 'Choisis un exercice';
    // La promesse est affichée AVANT de jouer, et elle est tenue : c'est le
    // contrat du mode. Un pianiste doit savoir ce qui sera regardé.
    if (ui.promise) ui.promise.textContent = kind ? SOLO_KIND_PROMISE[kind] : '';
    if (ui.brief) {
      ui.brief.innerHTML = '';
      if (!selected) return;
      for (const [label, text] of [
        ['Ce que c\'est', selected.context],
        ['Ce que ça donne', selected.sound],
        ['Comment t\'y mettre', selected.use],
        ['Le détail', selected.description],
      ]) {
        if (!text) continue;
        const row = doc.createElement('div');
        row.className = 'solo-brief-row';
        const tag = doc.createElement('span');
        tag.className = 'solo-brief-label';
        tag.textContent = label;
        const p = doc.createElement('p');
        p.textContent = text;
        row.append(tag, p);
        ui.brief.append(row);
      }
    }
    if (ui.startBtn) ui.startBtn.disabled = !selected;
    if (ui.resetBtn) ui.resetBtn.disabled = !selected;
    if (ui.tempo) ui.tempo.textContent = String(tempo);
    // La tolérance ne concerne que ce qui est jugé sur le temps.
    const judged = kind === 'rhythm' || kind === 'footing';
    if (ui.settings) ui.settings.hidden = !judged;
  }

  // ------------------------------------------------------------- Le verdict

  function renderVerdict() {
    const verdict = session.verdict();
    if (ui.verdict) {
      ui.verdict.textContent = verdict?.text || '';
      ui.verdict.className = `solo-verdict${verdict?.judged ? ' is-judged' : ''}`;
    }
    renderDetail(verdict);
  }

  /**
   * Le détail chiffré. Il montre ce qui a été mesuré, sans note ni félicitation :
   * c'est au pianiste de décider ce qu'il en fait.
   */
  function renderDetail(verdict) {
    if (!ui.detail) return;
    ui.detail.innerHTML = '';
    if (!verdict?.judged) return;

    if (verdict.rhythm) {
      const r = verdict.rhythm;
      if (!r.expectedCount) return;
      stat('À leur place', `${r.matched} / ${r.expectedCount}`);
      if (r.missed) stat('Manquées', String(r.missed));
      if (r.extra) stat('En trop', String(r.extra));
      if (r.matched) {
        const sens = r.meanDeltaMs < 0 ? 'en avance' : 'en retard';
        stat('Décalage moyen', `${Math.abs(Math.round(r.meanDeltaMs))} ms ${sens}`);
        stat('Régularité', `± ${Math.round(r.precisionMs)} ms`);
        stat('Fenêtre serrée', `${r.tight} / ${r.matched}`);
      }
      return;
    }

    if (verdict.footing) {
      const f = verdict.footing;
      if (!f.total) return;
      stat('Dans l\'accord', `${f.onChord} / ${f.played}`);
      if (f.offChord) stat('Hors accord', String(f.offChord));
      if (f.silent) stat('Temps forts libres', String(f.silent));
      // Les atterrissages fautifs, nommés : c'est ce qui permet de corriger.
      const fautes = f.landings.filter((l) => !l.silent && !l.onChord).slice(-6);
      if (!fautes.length) return;
      const list = doc.createElement('ul');
      list.className = 'solo-landings';
      for (const l of fautes) {
        const li = doc.createElement('li');
        const note = l.outside[0];
        li.textContent = `Mesure ${Math.floor(l.beat / (f.barBeats || 4)) + 1}, temps ${round(l.beat % (f.barBeats || 4) + 1)} — ${pcName(note.pc)}${note.degree ? ` (${note.degree})` : ''} sur ${l.chord || '?'}`;
        list.append(li);
      }
      ui.detail.append(list);
    }
  }

  function stat(label, value) {
    const row = doc.createElement('div');
    row.className = 'solo-stat';
    const l = doc.createElement('span');
    l.className = 'solo-stat-label';
    l.textContent = label;
    const v = doc.createElement('strong');
    v.className = 'solo-stat-value';
    v.textContent = value;
    row.append(l, v);
    ui.detail.append(row);
  }

  // ------------------------------------------------------------- Le transport

  async function start() {
    if (!selected || running) return false;
    const state = session.state();
    const ok = await startBacking?.({
      kind: selected.solo.kind,
      chordNames: state.chordNames,
      pattern: selected.solo.pattern || null,
      beatsPerChord: selected.solo.beatsPerChord || 4,
      tempo,
      kit: selected.solo.kit,
      drums,
    });
    if (!ok) {
      if (ui.verdict) ui.verdict.textContent = 'Le fond de jeu n\'a pas pu démarrer.';
      return false;
    }
    running = true;
    session.reset();
    session.start();
    setStartLabel();
    loop();
    return true;
  }

  function stop() {
    running = false;
    session.stop();
    stopBacking?.();
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
    setStartLabel();
    renderVerdict();
  }

  function toggle() { return running ? (stop(), false) : start(); }

  function setStartLabel() {
    if (ui.startLabel) ui.startLabel.textContent = running ? 'Arrêter' : 'Démarrer le fond';
    if (ui.startBtn) ui.startBtn.classList.toggle('is-running', running);
  }

  /**
   * Boucle d'affichage. Elle avance l'horloge de la séance — indispensable :
   * sans tick, un passage joué sans aucune note ne saurait pas que le temps a
   * passé, et le verdict resterait vide.
   */
  function loop() {
    if (!running) return;
    // Le fond s'est arrêté tout seul (fin des tours) : on s'arrête avec lui.
    if (!isBackingPlaying()) { stop(); return; }
    session.tick(getBeat?.() ?? 0);
    renderVerdict();
    frame = requestAnimationFrame(loop);
  }

  /** Une note jouée par le pianiste. Ignorée si aucune séance ne tourne. */
  function noteOn(note) {
    if (!running) return null;
    const hit = session.noteOn(note, getBeat?.() ?? 0);
    renderVerdict();
    return hit;
  }

  function setTempo(next) {
    tempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Math.round(Number(next) || 90)));
    if (ui.tempo) ui.tempo.textContent = String(tempo);
    // Changer le tempo pendant le jeu ferait mentir les mesures déjà prises :
    // on repart proprement du fond au nouveau tempo.
    if (running) { stop(); start(); }
    return tempo;
  }

  function setTolerance(ms) {
    const applied = session.setTolerance(ms);
    if (ui.tolerance) ui.tolerance.value = String(applied);
    if (ui.toleranceValue) ui.toleranceValue.textContent = `${applied} ms`;
    renderVerdict();
    return applied;
  }

  function setDrums(on) {
    drums = !!on;
    ui.drumsBtn?.classList.toggle('is-on', drums);
    ui.drumsBtn?.setAttribute('aria-pressed', String(drums));
    if (running) { stop(); start(); }
    return drums;
  }

  function show(visible) {
    stage.hidden = !visible;
    if (!visible && running) stop();
    if (visible && !selected && entries.length) select(entries[0].id);
  }

  // ------------------------------------------------------------- Branchements

  ui.cards?.addEventListener('click', (e) => {
    const card = e.target.closest('.solo-card');
    if (card?.dataset.id) select(card.dataset.id);
  });
  ui.startBtn?.addEventListener('click', () => { toggle(); });
  ui.resetBtn?.addEventListener('click', () => { session.reset(); renderVerdict(); });
  ui.tempoDown?.addEventListener('click', () => setTempo(tempo - TEMPO_STEP));
  ui.tempoUp?.addEventListener('click', () => setTempo(tempo + TEMPO_STEP));
  ui.drumsBtn?.addEventListener('click', () => setDrums(!drums));
  ui.tolerance?.addEventListener('input', () => setTolerance(ui.tolerance.value));
  if (ui.tolerance) {
    ui.tolerance.min = String(MIN_TOLERANCE_MS);
    ui.tolerance.max = String(MAX_TOLERANCE_MS);
  }

  renderCards();
  renderHead();

  return {
    show, select, noteOn, start, stop, toggle, setTempo, setTolerance, setDrums,
    isRunning: () => running,
    selected: () => selected,
    tempo: () => tempo,
    render: renderVerdict,
  };
}
