import { createSpeedMenu, setSpeedMenuValue } from './speed-menu.js';

/** Même réglage de vitesse que le Copilote ; pause et recherche conservent
 * les touches de l'instant pour observer les mains. Le lecteur reste partagé. */
export function createExerciseTransport({ onRate, onToggle, onSeek, onBack }) {
  const root = document.createElement('div');
  root.className = 'exercise-transport';
  root.innerHTML = `<div class="exercise-transport-settings"><span>Vitesse</span><span data-speed-host></span><output data-tempo></output></div>
    <div class="exercise-transport-controls" hidden>
      <button type="button" class="tr-button" data-pause>Pause</button>
      <button type="button" class="tr-button" data-back aria-label="Revenir une mesure en arrière">↶ 1 mes.</button>
      <input type="range" min="0" max="1" step="0.05" value="0" aria-label="Position dans l’exercice" data-position>
      <output data-position-label></output>
    </div><p class="exercise-transport-section" data-section aria-live="off" hidden></p>`;
  const speed = createSpeedMenu({ value: 1, name: 'Vitesse de l’exercice', onChange: onRate });
  root.querySelector('[data-speed-host]').append(speed);
  const pause = root.querySelector('[data-pause]');
  const back = root.querySelector('[data-back]');
  const range = root.querySelector('[data-position]');
  pause.addEventListener('click', onToggle);
  back.addEventListener('click', onBack);
  // En pause, seek montre les notes sans les jouer, comme dans le Copilote.
  range.addEventListener('input', () => onSeek(Number(range.value)));
  return { root, update({ active, paused, at = 0, duration = 0, tempo, rate, pulseBeats = 1, section = '' }) {
    if (speed.dataset.value !== String(rate)) setSpeedMenuValue(speed, rate);
    root.querySelector('[data-tempo]').textContent = tempo ? `${Math.round(tempo * rate / pulseBeats)} BPM${pulseBeats === 2 ? ' · à la blanche' : ''}` : '';
    root.querySelector('.exercise-transport-controls').hidden = !active;
    pause.textContent = paused ? 'Reprendre' : 'Pause';
    pause.setAttribute('aria-label', paused ? 'Reprendre l’exercice' : 'Mettre l’exercice en pause');
    range.max = String(duration || 1);
    if (document.activeElement !== range) range.value = String(at);
    const bar = Math.floor(at / 4) + 1;
    const bars = Math.ceil(duration / 4);
    root.querySelector('[data-position-label]').textContent = `${Math.min(bar, bars || 1)}/${bars || 1}`;
    range.setAttribute('aria-valuetext', `Mesure ${Math.min(bar, bars || 1)} sur ${bars || 1}`);
    const caption = root.querySelector('[data-section]');
    caption.textContent = section;
    caption.hidden = !active || !section;
  } };
}
