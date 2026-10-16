// [Claude] — 2026-10-02 — Entrées MIDI : qui est un vrai clavier, et que faire à
// chaque scan.
//
// Narcisse : « mon synthé, par moment, n'interagit plus avec l'app alors qu'il y a
// marqué Connecté ; je suis obligé de le débrancher et de le rebrancher ». Deux
// causes trouvées dans electron/main.js :
//   - le port ouvert était suivi par sa POSITION dans la liste. Un synthé
//     ré-énuméré (veille du PC, synthé éteint puis rallumé vite) garde sa place mais
//     change de numéro ALSA (« … 20:0 » → « … 24:0 ») : l'ancienne connexion est
//     morte, rien ne la rouvrait, et l'app affichait toujours « Connecté » ;
//   - notre propre port virtuel « Piano Jazz Chords » (sortie vers un VST) apparaît
//     aussi parmi les ENTRÉES, et son nom contient « piano » : l'auto-connexion
//     pouvait s'y brancher (l'app s'écoutait elle-même) et ne regardait plus le
//     vrai synthé ensuite.
// Désormais le port est suivi par son NOM ; même appareil revenu sous un autre
// numéro → on le rouvre ; nos ports et les ports logiciels ne sont jamais choisis
// d'office (on peut toujours les choisir à la main).
//
// Module pur, sans Electron : electron/main.js s'en sert pour son scan toutes les
// 2 s (createInputWatcher), src/main.js pour le repli Web MIDI
// (pickPreferredInput). Testé dans midi-ports.test.js.

/** Nom de notre port virtuel de sortie (VIRTUAL_OUTPUT_NAME dans electron/main.js). */
export const OWN_PORT_NAME = 'Piano Jazz Chords';

// Ports logiciels : passerelles, synthés logiciels, clients RtMidi (le nôtre compris).
const SOFTWARE_PORTS = [
  'midi through', 'through port', 'virmidi', 'rtmidi', 'timidity', 'fluidsynth',
  'pipewire', 'client-', OWN_PORT_NAME.toLowerCase(),
];

// À plusieurs claviers, on préfère dans cet ordre ; sinon le premier port matériel.
const KEYBOARD_WORDS = ['piano', 'keyboard', 'synth', 'key', 'digital', 'mpk', 'controller', 'usb', 'midi'];

/** Le nom sans le numéro de client ALSA (« Synth:Synth MIDI 1 20:0 » → « Synth:Synth MIDI 1 »). */
export function baseName(name) {
  return String(name || '').replace(/\s+\d+:\d+\s*$/, '').trim();
}

/** Vrai pour un appareil réel (clavier, synthé, interface), faux pour un port logiciel. */
export function isHardwarePort(name) {
  const lower = String(name || '').toLowerCase().trim();
  return lower.length > 0 && !SOFTWARE_PORTS.some((word) => lower.includes(word));
}

/** Le port à ouvrir d'office : un appareil réel, jamais un port logiciel ; null sinon. */
export function pickPreferredInput(inputs) {
  let best = null;
  let bestRank = Infinity;
  for (const input of Array.isArray(inputs) ? inputs : []) {
    if (!isHardwarePort(input?.name)) continue;
    const lower = input.name.toLowerCase();
    const index = KEYBOARD_WORDS.findIndex((word) => lower.includes(word));
    const rank = index === -1 ? KEYBOARD_WORDS.length : index;
    if (rank < bestRank) {
      best = input;
      bestRank = rank;
    }
  }
  return best;
}

const sameDevice = (a, b) => baseName(a) === baseName(b);

/**
 * Que faire à ce scan ?
 * @param {object} scan
 * @param {{id: *, name: string}|null} scan.open - le port ouvert (null : aucun)
 * @param {{id: *, name: string}[]} scan.inputs - les ports présents
 * @param {string|null} [scan.wanted] - le nom choisi à la main (null : choix automatique)
 * @returns {{action: 'keep'|'reindex'|'reopen'|'switch'|'lost'|'open'|'none', port?: {id: *, name: string}}}
 *   keep : rien à faire ; reindex : même connexion, autre place dans la liste ;
 *   reopen : même appareil revenu sous un autre numéro, l'ancienne connexion est
 *   morte ; switch : passer sur un meilleur port ; lost : l'appareil est parti ;
 *   open : rien n'est ouvert, ouvrir celui-ci ; none : rien à ouvrir.
 */
export function decideInputAction({ open = null, inputs = [], wanted = null } = {}) {
  const list = Array.isArray(inputs) ? inputs.filter((i) => i && typeof i.name === 'string') : [];
  const wantedPort = wanted
    ? list.find((i) => i.name === wanted) || list.find((i) => sameDevice(i.name, wanted)) || null
    : null;

  if (!open) {
    const target = wantedPort || pickPreferredInput(list);
    return target ? { action: 'open', port: target } : { action: 'none' };
  }

  const exact = list.find((i) => i.name === open.name);
  if (!exact) {
    const back = list.find((i) => sameDevice(i.name, open.name));
    return back ? { action: 'reopen', port: back } : { action: 'lost' };
  }
  // Toujours là sous le même nom : la connexion est vivante. Reste à savoir si
  // c'est le bon port.
  if (wantedPort && !sameDevice(wantedPort.name, open.name)) return { action: 'switch', port: wantedPort };
  if (!wanted && !isHardwarePort(open.name)) {
    const hardware = pickPreferredInput(list);
    if (hardware) return { action: 'switch', port: hardware };
  }
  if (exact.id !== open.id) return { action: 'reindex', port: exact };
  return { action: 'keep' };
}

/**
 * Le suivi des entrées, sans Electron. electron/main.js fournit de quoi lister,
 * ouvrir et fermer les ports, et prévenir l'interface ; il appelle tick() à
 * chaque scan.
 * @param {object} io
 * @param {() => {id: *, name: string}[]} io.listPorts
 * @param {(id: *) => {success: boolean, name?: string, error?: string}} io.openPort
 * @param {() => void} io.closePort
 * @param {() => void} [io.resetScanner] - avant une reconnexion forcée
 * @param {(type: 'connected'|'lost'|'devices', data: object) => void} [io.notify]
 */
export function createInputWatcher({ listPorts, openPort, closePort, resetScanner = () => {}, notify = () => {} }) {
  let open = null; // {id, name}
  let wanted = null; // nom choisi à la main
  let lastNames = null;

  const status = () => ({
    connected: Boolean(open),
    portId: open ? open.id : null,
    name: open ? open.name : null,
    manual: Boolean(wanted),
  });

  function connect(port, reason) {
    const result = openPort(port.id);
    if (!result?.success) {
      open = null;
      return { success: false, error: result?.error || 'ouverture impossible' };
    }
    open = { id: port.id, name: result.name || port.name };
    notify('connected', { portId: open.id, name: open.name, reason });
    return { success: true, portId: open.id, name: open.name };
  }

  function drop() {
    const previous = open;
    if (open) closePort();
    open = null;
    return previous;
  }

  function tick(reason = 'poll') {
    const inputs = listPorts() || [];
    const names = inputs.map((i) => i.name).join('\n');
    if (names !== lastNames) {
      lastNames = names;
      notify('devices', inputs);
    }
    const decision = decideInputAction({ open, inputs, wanted });
    switch (decision.action) {
      case 'reindex':
        open = { ...open, id: decision.port.id };
        break;
      case 'open':
        connect(decision.port, reason);
        break;
      case 'reopen':
      case 'switch': {
        const previous = drop();
        const result = connect(decision.port, decision.action);
        if (!result.success && previous) notify('lost', { previousId: previous.id, previousName: previous.name });
        break;
      }
      case 'lost': {
        const previous = drop();
        notify('lost', { previousId: previous.id, previousName: previous.name });
        break;
      }
      default:
        break;
    }
    return decision;
  }

  return {
    tick,
    status,
    /** Choix à la main (menu du pied de page) : ce port devient celui qu'on veut. */
    choose(portId) {
      const port = (listPorts() || []).find((i) => String(i.id) === String(portId));
      if (!port) return { success: false, error: 'port introuvable' };
      drop();
      const result = connect(port, 'manual');
      if (result.success) wanted = result.name;
      return result;
    },
    /**
     * Reconnexion forcée (pastille « Reconnecter », réveil de veille) : on ferme,
     * on rescanne et on rouvre le même appareil, comme un débranchement.
     */
    reconnect(reason = 'reconnect') {
      const previous = drop();
      resetScanner();
      lastNames = null;
      tick(reason);
      if (previous && !open) notify('lost', { previousId: previous.id, previousName: previous.name });
      return status();
    },
    close() {
      drop();
    },
  };
}
