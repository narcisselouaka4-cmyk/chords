import { chordName, slashName, formatNoteList, inversionName } from '../chord-engine/naming.js';
import { getVoicingLabel, getAlias } from '../chord-engine/voicing.js';

export function updateDisplay(els, result, notes, latin = false) {
  if (!result) {
    clearDisplay(els);
    return;
  }

  const { rootPc, symbol, fullName, bassPc, isSlash, inversion, confidence, rootless, voicing } = result;
  const displayName = rootless
    ? chordName(rootPc, symbol, latin)
    : isSlash
      ? slashName(rootPc, symbol, bassPc, latin)
      : chordName(rootPc, symbol, latin);

  els.chordName.innerHTML = displayName || '—';
  els.chordName.classList.remove('chord-name-empty');
  if (els.chordDisplay) els.chordDisplay.classList.remove('is-empty');

  const detailParts = [];
  if (fullName && displayName !== fullName) detailParts.push(fullName);
  detailParts.push(inversionName(inversion));


  els.chordDetail.textContent = detailParts.join(' — ');

  const notePills = formatNoteList(notes.map((n) => n % 12), latin)
    .map((name) => `<span class="note-pill">${name}</span>`)
    .join('');
  els.notesDisplay.innerHTML = notePills;

  // Voicing label and alias
  const voicingLabel = els.voicingLabel;
  const aliasLabel = els.aliasLabel;
  if (voicingLabel) {
    const label = getVoicingLabel(voicing);
    voicingLabel.textContent = label || '';
    voicingLabel.style.display = label ? 'inline-flex' : 'none';
  }
  if (aliasLabel) {
    const alias = getAlias(symbol);
    aliasLabel.textContent = alias ? `aussi : ${alias}` : '';
    aliasLabel.style.display = alias ? 'inline-flex' : 'none';
  }

  // [OpenCode] — 2026-08-05 — Nouveau format compact du panneau Techniques
  els.pedagogy.innerHTML = buildTechniquesHtml(result, notes, latin);

  // Mark tonic on keyboard
  document.querySelectorAll('.tonic').forEach((el) => el.classList.remove('tonic'));
  document.getElementById(`note-${findTonicMidi(notes, rootPc)}`)?.classList.add('tonic');
}

function buildTechniquesHtml(result, notes, latin) {
  if (!result) {
    return '<p>Jouez des notes pour voir les techniques...</p>';
  }

  const { rootPc, symbol, fullName, inversion, bassPc, isSlash, voicing } = result;
  const name = isSlash
    ? slashName(rootPc, symbol, bassPc, latin)
    : chordName(rootPc, symbol, latin);

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

export function clearDisplay(els) {
  // [OpenCode] — 2026-08-05 — État vide : pas de faux titre, pas de barre noire.
  els.chordName.innerHTML = '';
  els.chordName.classList.add('chord-name-empty');
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
