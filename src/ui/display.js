import { chordName, slashName, formatNoteList, inversionName } from '../chord-engine/naming.js';
import { getPedagogyHtml } from '../chord-engine/pedagogy.js';
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
    voicingLabel.style.display = label ? 'inline-block' : 'none';
  }
  if (aliasLabel) {
    const alias = getAlias(symbol);
    aliasLabel.textContent = alias ? `aussi : ${alias}` : '';
    aliasLabel.style.display = alias ? 'inline-block' : 'none';
  }

  els.pedagogy.innerHTML = getPedagogyHtml(result, latin);

  // Mark tonic on keyboard
  document.querySelectorAll('.tonic').forEach((el) => el.classList.remove('tonic'));
  document.getElementById(`note-${findTonicMidi(notes, rootPc)}`)?.classList.add('tonic');
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
  els.chordName.innerHTML = '—';
  els.chordDetail.textContent = '';
  if (els.voicingLabel) els.voicingLabel.style.display = 'none';
  if (els.aliasLabel) els.aliasLabel.style.display = 'none';
  els.notesDisplay.innerHTML = '';
  els.pedagogy.innerHTML = '<p>Jouez des notes pour voir les techniques...</p>';
  document.querySelectorAll('.tonic').forEach((el) => el.classList.remove('tonic'));
}
