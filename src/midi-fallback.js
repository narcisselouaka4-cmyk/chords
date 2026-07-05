// Web MIDI fallback when native MIDI bridge is unavailable or empty.
// This mirrors the behavior of chord-display.rednet.io.

let midiAccess = null;
let currentInput = null;

export async function initWebMidi({
  onNoteOn,
  onNoteOff,
  onSustain,
  onPitchWheel,
  onModWheel,
  onStateChange,
}) {
  if (!navigator.requestMIDIAccess) {
    return { available: false, error: 'Web MIDI API non supportée' };
  }

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });

    midiAccess.onstatechange = () => {
      onStateChange?.(getWebMidiInputs());
    };

    return { available: true, inputs: getWebMidiInputs() };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

export function getWebMidiInputs() {
  if (!midiAccess) return [];
  const inputs = [];
  let id = 0;
  for (const input of midiAccess.inputs.values()) {
    inputs.push({ id, name: input.name, device: input });
    id++;
  }
  return inputs;
}

export function openWebMidiInput(inputId, callbacks) {
  if (!midiAccess) return false;
  let id = 0;
  for (const input of midiAccess.inputs.values()) {
    if (id === inputId) {
      if (currentInput) {
        currentInput.onmidimessage = null;
      }
      currentInput = input;
      currentInput.onmidimessage = (event) => handleMidiMessage(event.data, callbacks);
      return true;
    }
    id++;
  }
  return false;
}

function handleMidiMessage(data, { onNoteOn, onNoteOff, onSustain, onPitchWheel, onModWheel }) {
  const [status, d1, d2] = data;
  const cmd = status >> 4;
  const channel = status & 0x0f;
  if (channel === 9) return;

  if (cmd === 0x8 || (cmd === 0x9 && d2 === 0)) {
    onNoteOff?.({ note: d1 });
  } else if (cmd === 0x9) {
    onNoteOn?.({ note: d1, velocity: d2 / 127 });
  } else if (cmd === 0xb && d1 === 64) {
    onSustain?.({ value: d2 >= 64 });
  } else if (cmd === 0xb && d1 === 1) {
    onModWheel?.({ value: d2 / 127 });
  } else if (cmd === 0xe) {
    const bend = (d2 * 128 + d1 - 8192) / 8192;
    onPitchWheel?.({ value: bend });
  }
}
