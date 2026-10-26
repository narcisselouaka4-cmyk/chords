// Molettes partagées par le clavier virtuel, l'entrée MIDI et les relectures.
let pitch = 0;
let modulation = 0;
let controls = null;

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
}

export function setPitchWheel(value) {
  pitch = clamp(value, -1, 1);
  if (!controls) return;
  controls.pitch.value = pitch;
  const semitones = pitch * 2;
  controls.pitchOutput.textContent = `${semitones > 0 ? '+' : ''}${semitones.toFixed(1)}`;
  controls.pitch.setAttribute('aria-valuetext', `${semitones.toFixed(1)} demi-tons`);
}

export function setModWheel(value) {
  modulation = clamp(value, 0, 1);
  if (!controls) return;
  controls.mod.value = modulation;
  controls.modOutput.textContent = `${Math.round(modulation * 100)} %`;
  controls.mod.setAttribute('aria-valuetext', `${Math.round(modulation * 100)} pour cent`);
}

export function initKeyboardWheels({ onPitch, onMod }) {
  const panel = document.getElementById('keyboard-wheels');
  const toggle = document.getElementById('keyboard-wheels-toggle');
  const pitchInput = document.getElementById('keyboard-pitch');
  const modInput = document.getElementById('keyboard-mod');
  if (!panel || !toggle || !pitchInput || !modInput) return;
  controls = {
    pitch: pitchInput, mod: modInput,
    pitchOutput: document.getElementById('keyboard-pitch-value'),
    modOutput: document.getElementById('keyboard-mod-value'),
  };
  const resetPitch = () => { if (pitch !== 0) onPitch(0); };
  const applyVisibility = (visible) => {
    panel.hidden = !visible;
    toggle.checked = visible;
    // Masquer les contrôles ne laisse pas un effet invisible actif.
    if (!visible) { resetPitch(); if (modulation !== 0) onMod(0); }
  };
  let visible = true;
  try { visible = localStorage.getItem('keyboard-wheels-visible') !== '0'; } catch (_) { /* réglage facultatif */ }
  applyVisibility(visible);
  toggle.addEventListener('change', () => {
    applyVisibility(toggle.checked);
    try { localStorage.setItem('keyboard-wheels-visible', toggle.checked ? '1' : '0'); } catch (_) { /* ignore */ }
  });
  pitchInput.addEventListener('input', () => onPitch(Number(pitchInput.value)));
  modInput.addEventListener('input', () => onMod(Number(modInput.value)));
  pitchInput.addEventListener('pointerdown', (event) => pitchInput.setPointerCapture(event.pointerId));
  pitchInput.addEventListener('pointerup', resetPitch);
  pitchInput.addEventListener('pointercancel', resetPitch);
  pitchInput.addEventListener('lostpointercapture', resetPitch);
  pitchInput.addEventListener('blur', resetPitch);
  pitchInput.addEventListener('keyup', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) resetPitch();
  });
  for (const [input, reset] of [[pitchInput, resetPitch], [modInput, () => onMod(0)]]) {
    input.addEventListener('dblclick', reset);
    input.addEventListener('keydown', (event) => {
      // Les lettres du clavier PC ne doivent pas jouer des notes pendant un réglage.
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); reset(); }
    });
  }
  window.addEventListener('blur', resetPitch);
  setPitchWheel(pitch);
  setModWheel(modulation);
}
