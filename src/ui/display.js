import { formatNoteList, inversionName, jazzChordName } from '../chord-engine/naming.js';
import { getVoicingLabel } from '../chord-engine/voicing.js';
import { renderLiveReading, clearLiveReading } from './live-reading.js';

// [Claude] — 2026-10-02 — Temps réel : la « Lecture en direct » (roue des 12 notes,
// lectures à droite ; src/ui/live-reading.js) remplace l'affichage d'avant. Les
// identifiants restent : #chord-name porte le nom (le miroir du clavier le lit),
// #notes-display les notes (masqué : la roue les montre), #chord-detail, les
// étiquettes de voicing et d'alias (masquées : voir les lectures et « Aussi »).
// Nom à la manière jazz (B♭7, D/F♯) ; une note : « Do4 » ; deux notes :
// l'intervalle (« Tierce mineure ») plutôt qu'un faux accord majeur.

export function updateDisplay(els, result, notes, latin = false) {
  if (!result) {
    clearDisplay(els, latin);
    return;
  }

  const { rootPc, voicing } = result;
  const view = renderLiveReading(notes, result, latin);
  const displayName = view.titleIsChord ? jazzChordName(result, latin) : escapeHtml(view.title);

  els.chordName.innerHTML = displayName || '—';
  els.chordName.classList.remove('chord-name-empty');
  els.chordName.classList.toggle('is-label', !view.titleIsChord);
  if (els.chordDisplay) els.chordDisplay.classList.remove('is-empty');

  els.chordDetail.textContent = view.titleIsChord ? `${view.quality} — ${view.position}` : view.quality;

  // Notes entendues, avec leur orthographe dans l'accord (le miroir du clavier les lit).
  els.notesDisplay.innerHTML = [...view.wheel.names.values()]
    .map((name) => `<span class="note-pill">${escapeHtml(name)}</span>`)
    .join('');

  const voicingLabel = els.voicingLabel;
  const aliasLabel = els.aliasLabel;
  if (voicingLabel) {
    const label = view.voicing !== '—' ? view.voicing : getVoicingLabel(voicing);
    voicingLabel.textContent = label || '';
    voicingLabel.style.display = label ? 'inline-flex' : 'none';
  }
  if (aliasLabel) {
    aliasLabel.textContent = view.also.length ? `aussi : ${view.also[0]}` : '';
    aliasLabel.style.display = view.also.length ? 'inline-flex' : 'none';
  }

  // [OpenCode] — 2026-08-05 — Nouveau format compact du panneau Techniques
  els.pedagogy.innerHTML = buildTechniquesHtml(result, notes, latin);

  // Mark tonic on keyboard
  document.querySelectorAll('.tonic').forEach((el) => el.classList.remove('tonic'));
  if (view.titleIsChord && !result.rootless) {
    document.getElementById(`note-${findTonicMidi(notes, rootPc)}`)?.classList.add('tonic');
  }
}

function buildTechniquesHtml(result, notes, latin) {
  if (!result) {
    return '<p>Jouez des notes pour voir les techniques...</p>';
  }

  const { inversion, voicing } = result;

  const sections = [];

  // Fonction : pas de contexte tonal calculé, on affiche une valeur neutre.
  sections.push({
    title: 'Fonction',
    value: '—',
    muted: true,
  });

  // Résolution : pas de contexte tonal calculé, on affiche une valeur neutre.
  sections.push({
    title: 'Résolution',
    value: '—',
    muted: true,
  });

  // Mouvement : pas de données de mouvement réel calculées.
  sections.push({
    title: 'Mouvement',
    value: '—',
    muted: true,
  });

  const voicingLabel = getVoicingLabel(voicing) || 'Voicing détecté';
  const inversionLabel = inversionName(inversion);
  const noteNames = formatNoteList(notes.map((n) => n % 12), latin).join(' — ');

  return `
    ${sections
      .map(
        (s) => `
      <div class="pedagogy-section">
        <div class="pedagogy-section-title">${escapeHtml(s.title)}</div>
        <div class="pedagogy-section-value${s.muted ? ' muted' : ''}">${escapeHtml(s.value)}</div>
      </div>
    `,
      )
      .join('')}
    <div class="pedagogy-voicing">
      <div class="pedagogy-voicing-title">Voicing actuel</div>
      <div class="pedagogy-voicing-name">${escapeHtml(voicingLabel)} — ${escapeHtml(inversionLabel)}</div>
      <div class="pedagogy-voicing-notes">${escapeHtml(noteNames)}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findTonicMidi(notes, rootPc) {
  if (!notes.length) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  for (const note of sorted) {
    if (note % 12 === rootPc) return note;
  }
  return sorted[0];
}

export function clearDisplay(els, latin = false) {
  // [OpenCode] — 2026-08-05 — État vide : pas de faux titre, pas de barre noire.
  clearLiveReading(latin);
  els.chordName.innerHTML = '';
  els.chordName.classList.add('chord-name-empty');
  els.chordName.classList.remove('is-label');
  if (els.chordDisplay) els.chordDisplay.classList.add('is-empty');
  els.chordDetail.textContent = '';
  if (els.voicingLabel) els.voicingLabel.style.display = 'none';
  if (els.aliasLabel) els.aliasLabel.style.display = 'none';
  els.notesDisplay.innerHTML = '';
  // [OpenCode] — 2026-08-05 — Le panneau Techniques reste visible en état neutre,
  // centré en haut à droite, sans carte verte « Accord reconnu ».
  els.pedagogy.innerHTML = buildTechniquesHtml(null, [], false);
  document.querySelectorAll('.tonic').forEach((el) => el.classList.remove('tonic'));
}
