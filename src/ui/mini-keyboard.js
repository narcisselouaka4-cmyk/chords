// [OpenCode] — 2026-07-04 — Mini-clavier SVG pédagogique pour un accord.
// Affiche environ 2 octaves (C4–B5 par défaut), touches blanches alignées,
// touches noires positionnées réalistes entre les blanches, notes actives en couleur.
// Retourne aussi la liste textuelle des notes pour affichage en dessous.

const WHITE_WIDTH = 20;
const WHITE_HEIGHT = 80;
const BLACK_WIDTH = 12;
const BLACK_HEIGHT = 50;
const START_MIDI = 60;    // C4
const END_MIDI = 83;      // B5
const WHITE_RADIUS = 3;
const BLACK_RADIUS = 2;
// Bande des repères d'octave, sous les touches (option `captions`).
const CAPTION_HEIGHT = 11;

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LATIN_SHARP = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LATIN_FLAT = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

function midiToNoteName(midi, useSharps = true, latin = false) {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const names = latin
    ? (useSharps ? LATIN_SHARP : LATIN_FLAT)
    : (useSharps ? NOTE_NAMES_SHARP : NOTE_NAMES_FLAT);
  return `${names[pc]}${octave}`;
}

function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

function whiteKeyIndex(midi, startMidi) {
  let count = 0;
  for (let i = startMidi; i < midi; i++) {
    if (!isBlackKey(i)) count++;
  }
  return count;
}

function blackKeyX(midi, startMidi) {
  const pc = midi % 12;
  const prevWhiteIndex = whiteKeyIndex(midi, startMidi) - 1; // index de la blanche précédente
  const baseX = (prevWhiteIndex + 1) * WHITE_WIDTH; // bord droit de la blanche précédente
  const offsets = {
    1: -BLACK_WIDTH * 0.35, // C# proche de D
    3: -BLACK_WIDTH * 0.65, // D# proche de E
    6: -BLACK_WIDTH * 0.30, // F# proche de G
    8: -BLACK_WIDTH * 0.50, // G# centré
    10: -BLACK_WIDTH * 0.70, // A# proche de B
  };
  return baseX + offsets[pc];
}

// Dégradés des touches.
// [Claude] — 2026-10-09 — Narcisse : le mini-clavier de « Accord à l'écoute » (Analyse) était
// « totalement cassé » : touches noires transparentes, notes jouées sans couleur. Les dégradés
// portaient les MÊMES id dans tous les mini-claviers de la page (« un id répété désigne le même
// rendu », pensait-on). Mais `url(#id)` désigne le PREMIER élément de ce nom dans le document ;
// quand ce premier mini-clavier est dans un panneau caché (display:none), Chromium ne peint pas
// le dégradé, et toutes les touches qui y renvoient restent vides. Chaque SVG a donc ses propres
// id (suffixe unique).
const vertical = (id, top, bottom) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
const horizontal = (id, left, right) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${left}"/><stop offset="0.8" stop-color="${right}"/></linearGradient>`;
let gradientSerial = 0;
function gradients(suffix) {
  return `<defs>${[
    vertical(`mk-off-w${suffix}`, '#fdfcfe', '#f0edf3'),
    horizontal(`mk-off-b${suffix}`, '#3f3c43', '#212027'),
    vertical(`mk-on-w${suffix}`, 'color-mix(in srgb, var(--vk-accent-deep) 55%, #ffffff)', 'color-mix(in srgb, var(--vk-accent-deep) 85%, #ffffff)'),
    horizontal(`mk-on-b${suffix}`, 'color-mix(in srgb, var(--vk-accent-deep) 80%, #000000)', 'color-mix(in srgb, var(--vk-accent-deep) 55%, #000000)'),
    // [Claude] — 2026-10-13 — Mains : couleurs propres, jamais confondues avec celle de l'application
    // (ui/hand-colors.js pose --hand-lh / --hand-rh).
    vertical(`mk-lh-w${suffix}`, 'color-mix(in srgb, var(--hand-lh, #a583e2) 55%, #ffffff)', 'var(--hand-lh, #a583e2)'),
    horizontal(`mk-lh-b${suffix}`, 'color-mix(in srgb, var(--hand-lh, #a583e2) 85%, #000000)', 'color-mix(in srgb, var(--hand-lh, #a583e2) 55%, #000000)'),
    vertical(`mk-rh-w${suffix}`, 'color-mix(in srgb, var(--hand-rh, #8ccdb7) 55%, #ffffff)', 'var(--hand-rh, #8ccdb7)'),
    horizontal(`mk-rh-b${suffix}`, 'color-mix(in srgb, var(--hand-rh, #8ccdb7) 85%, #000000)', 'color-mix(in srgb, var(--hand-rh, #8ccdb7) 55%, #000000)'),
    vertical(`mk-add-w${suffix}`, '#f6ddb0', '#e8b86a'),
    horizontal(`mk-add-b${suffix}`, '#e0aa55', '#a8742a'),
  ].join('')}</defs>`;
}

export function generateMiniKeyboard(activeNotes = [], options = {}) {
  const start = options.startMidi ?? START_MIDI;
  const end = options.endMidi ?? END_MIDI;
  const activeSet = new Set(activeNotes.map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const leftHandSet = new Set((options.leftHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  const rightHandSet = new Set((options.rightHand || []).map((n) => (typeof n === 'number' ? n : null)).filter(Boolean));
  // Notes ajoutées (doublures d'octave) : couleur distincte.
  const addedSet = new Set((options.added || []).filter((n) => typeof n === 'number'));

  // S'assurer que start est une note blanche pour l'alignement
  let firstWhite = start;
  while (isBlackKey(firstWhite) && firstWhite <= end) firstWhite++;
  let lastWhite = end;
  while (isBlackKey(lastWhite) && lastWhite >= start) lastWhite--;

  const whites = [];
  for (let midi = firstWhite; midi <= lastWhite; midi++) {
    if (!isBlackKey(midi)) whites.push(midi);
  }
  const whiteCount = whites.length || 1;

  const width = whiteCount * WHITE_WIDTH;
  const height = WHITE_HEIGHT;

  let markup = '';

  /**
   * [Claude] — 2026-11-05 — La MAIN décide de la couleur, l'ajout est une
   * marque en plus. Avant, `is-added` remplaçait `is-lh`/`is-rh` : une note
   * doublée à la main droite se peignait dans la teinte des ajouts, que la
   * légende lit comme « main gauche ». Narcisse : « ce qui est en jaune, c'est
   * censé être la main gauche ; la main gauche ne peut pas être à la fois à
   * gauche et à droite ». Les deux informations cohabitent désormais au lieu
   * de se contredire.
   */
  function activeClasses(midi) {
    const classes = ['mini-key'];
    if (activeSet.has(midi)) {
      classes.push('is-active');
      if (leftHandSet.has(midi)) classes.push('is-lh');
      else if (rightHandSet.has(midi)) classes.push('is-rh');
      if (addedSet.has(midi)) classes.push('is-added');
    }
    return classes.join(' ');
  }

  // [Claude] — 2026-09-24 — Style Astra (maquette .tr-mini-keyboard) : touches
  // nacrées / anthracite en dégradé ; notes jouées en violet d'accent, main
  // droite en vert sauge (--tr-green), notes ajoutées en ambre adouci.
  function tone(midi) {
    if (!activeSet.has(midi)) return 'off';
    // La main l'emporte sur l'ajout : une note doublée à la main droite reste
    // de la couleur de la main droite. L'ajout se voit à son contour.
    if (rightHandSet.has(midi)) return 'rh';
    if (leftHandSet.has(midi)) return 'lh';
    if (addedSet.has(midi)) return 'add';
    return 'on'; // note jouée sans main précisée : couleur de l'application
  }
  const suffix = `-${++gradientSerial}`;
  const fillOf = (midi) => `url(#mk-${tone(midi)}-${isBlackKey(midi) ? 'b' : 'w'}${suffix})`;
  /**
   * Contour d'une touche. Une note AJOUTÉE (doublure, main gauche d'un style,
   * basse de la démo) garde la couleur de sa main et reçoit un contour ambre
   * pointillé : on la repère sans lui inventer une main à elle.
   */
  function strokeOf(midi, kind) {
    if (activeSet.has(midi) && addedSet.has(midi)) return STROKES[kind].add;
    return STROKES[kind][tone(midi)];
  }
  const dashOf = (midi) => (activeSet.has(midi) && addedSet.has(midi) ? ' stroke-dasharray="2.4 1.6"' : '');

  const STROKES = {
    w: { off: '#bdb7c5', on: 'var(--vk-accent-deep)', lh: 'color-mix(in srgb, var(--hand-lh, #a583e2) 75%, #000000)', rh: 'color-mix(in srgb, var(--hand-rh, #8ccdb7) 70%, #000000)', add: '#c8923f' },
    b: { off: '#141318', on: 'color-mix(in srgb, var(--vk-accent-deep) 60%, #000000)', lh: 'color-mix(in srgb, var(--hand-lh, #a583e2) 50%, #000000)', rh: 'color-mix(in srgb, var(--hand-rh, #8ccdb7) 50%, #000000)', add: '#9a6a22' },
  };

  // Touches blanches
  whites.forEach((midi, index) => {
    const x = index * WHITE_WIDTH;
    const active = activeSet.has(midi);
    const title = active ? ` title="${(options.formatNote || ((name) => name))(midiToNoteName(midi, true, false))}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="0" width="${WHITE_WIDTH}" height="${WHITE_HEIGHT}" rx="${WHITE_RADIUS}" fill="${fillOf(midi)}" stroke="${strokeOf(midi, 'w')}" stroke-width="${addedSet.has(midi) && active ? 1.8 : (active ? 1 : 0.6)}"${dashOf(midi)}${title}/>`;
  });

  // Touches noires
  for (let midi = firstWhite; midi <= lastWhite; midi++) {
    if (!isBlackKey(midi)) continue;
    const x = blackKeyX(midi, firstWhite);
    if (x < 0 || x + BLACK_WIDTH > width) continue;
    const active = activeSet.has(midi);
    const title = active ? ` title="${(options.formatNote || ((name) => name))(midiToNoteName(midi, true, false))}"` : '';
    markup += `<rect class="${activeClasses(midi)}" data-midi="${midi}" x="${x}" y="-1" width="${BLACK_WIDTH}" height="${BLACK_HEIGHT}" rx="${BLACK_RADIUS}" fill="${fillOf(midi)}" stroke="${strokeOf(midi, 'b')}" stroke-width="${addedSet.has(midi) && activeSet.has(midi) ? 1.5 : 0.8}"${dashOf(midi)}${title}/>`;
  }

  // [Claude] — 2026-11-05 — Repères sous les touches blanches : les Do de
  // chaque octave, et les notes réellement jouées. Ils situent le voicing sur
  // le clavier — sans eux, un dessin de deux octaves ne dit pas DANS QUEL
  // registre on joue. Posés hors de la touche, sous le clavier, pour ne jamais
  // recouvrir une couleur de main.
  let captionHeight = 0;
  if (options.captions) {
    captionHeight = CAPTION_HEIGHT;
    whites.forEach((midi, index) => {
      const estDo = midi % 12 === 0;
      if (!estDo && !activeSet.has(midi)) return;
      const nom = midiToNoteName(midi, true, false);
      const cls = activeSet.has(midi) ? 'mini-caption is-active' : 'mini-caption';
      markup += `<text class="${cls}" x="${index * WHITE_WIDTH + WHITE_WIDTH / 2}" y="${WHITE_HEIGHT + CAPTION_HEIGHT - 3}" text-anchor="middle" font-size="7.5">${nom}</text>`;
    });
  }

  const svg = `\n<svg class="mini-keyboard" viewBox="0 0 ${width} ${height + captionHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${gradients(suffix)}${markup}</svg>\n`;
  const noteNames = activeNotes
    .filter((n) => typeof n === 'number')
    .sort((a, b) => a - b)
    .map((n) => (options.formatNote || ((name) => name))(midiToNoteName(n, true, false)));
  return { svg, noteNames };
}

export function miniKeyboardForNotes(activeNotes, options = {}) {
  // Fenêtre dimensionnée sur l'étendue réelle des notes actives (avec une
  // marge d'une touche de part et d'autre), et non plus une fenêtre fixe de
  // 24 demi-tons : un voicing réel (main gauche + main droite) peut dépasser
  // 2 octaves (ex. Sol#2 à Fa#5 = 34 demi-tons observés), et les notes hors
  // fenêtre n'étaient tout simplement jamais dessinées. Le SVG s'élargit en
  // conséquence ; le viewBox + preserveAspectRatio du côté CSS gèrent déjà la
  // mise à l'échelle.
  // Le deuxième argument peut être un nombre (ancien centerMidi) ou un objet
  // d'options { centerMidi, leftHand, rightHand, startMidi, endMidi }.
  const opts = typeof options === 'number' ? { centerMidi: options } : options;
  const startMidiOverride = opts.startMidi ?? (opts.centerMidi != null && opts.centerMidi < 60 ? 48 : undefined);
  const kbOptions = {
    leftHand: opts.leftHand,
    rightHand: opts.rightHand,
    added: opts.added,
    captions: opts.captions,
    formatNote: opts.formatNote,
  };
  if (!Array.isArray(activeNotes) || activeNotes.length === 0) {
    const fallbackStart = startMidiOverride ?? 60;
    return {
      svg: generateMiniKeyboard([], { ...kbOptions, startMidi: fallbackStart, endMidi: opts.endMidi ?? fallbackStart + 23 }).svg,
      noteNames: [],
    };
  }
  const min = Math.min(...activeNotes);
  const max = Math.max(...activeNotes);
  const MARGIN = 2;
  const finalStart = startMidiOverride ?? Math.max(21, min - MARGIN);
  const finalEnd = opts.endMidi ?? Math.max(finalStart + 23, Math.min(108, max + MARGIN));
  return generateMiniKeyboard(activeNotes, { ...kbOptions, startMidi: finalStart, endMidi: finalEnd });
}

/**
 * [Claude] — 2026-11-05 — Le clavier de la carte, porté du code du candidat.
 *
 * Narcisse a fourni les sources de la maquette qu'il veut (« je savais que
 * t'allais rater, voilà pourquoi j'ai pris le code du candidat ») : ma première
 * tentative habillait le dessin SVG existant, et ne pouvait pas y ressembler.
 * Son clavier n'est PAS un SVG — ce sont des touches HTML en pourcentage, dont
 * le relief vient de dégradés et d'ombres internes. C'est ce qui fait le rendu,
 * et c'est ce qui est repris ici tel quel.
 *
 * Le corps du clavier reste SOMBRE dans les deux thèmes : c'est un piano, pas
 * une surface d'interface. Sa bordure, elle, est claire — `rgba(255,255,255,.09)`
 * dans l'original — ce qui répond à la consigne « en mode clair les bordures
 * doivent être claires et pas sombres ».
 *
 * Les touches ne sont pas des boutons : c'est un aperçu, pas un instrument. Le
 * vrai clavier jouable est celui du bas, auquel on ne touche pas. Cinquante
 * boutons de plus dans l'ordre de tabulation n'apporteraient rien.
 *
 * @param {object} options
 * @param {number[]} [options.leftHand]
 * @param {number[]} [options.rightHand]
 * @param {number[]} [options.added] - doublures et notes ajoutées
 * @param {number} [options.startMidi]
 * @param {number} [options.endMidi]
 * @param {(midi: number) => string} [options.formatNote]
 * @returns {string}
 */
export function keybedMarkup({
  leftHand = [], rightHand = [], added = [],
  startMidi = 36, endMidi = 84, formatNote = null,
} = {}) {
  const lh = new Set(leftHand.filter((n) => Number.isFinite(n)));
  const rh = new Set(rightHand.filter((n) => Number.isFinite(n)));
  const plus = new Set(added.filter((n) => Number.isFinite(n)));
  const actives = [...new Set([...lh, ...rh])].sort((a, b) => a - b);
  const nom = (midi) => (formatNote ? formatNote(midi) : midiToNoteName(midi, true, false));

  // La fenêtre couvre au moins les notes jouées : un voicing qui sort de la
  // plage par défaut serait invisible, ce qui est arrivé avec l'ancien dessin.
  let debut = Math.min(startMidi, actives.length ? actives[0] - 2 : startMidi);
  let fin = Math.max(endMidi, actives.length ? actives[actives.length - 1] + 2 : endMidi);
  while (isBlackKey(debut)) debut -= 1;
  while (isBlackKey(fin)) fin += 1;

  const blanches = [];
  for (let midi = debut; midi <= fin; midi += 1) if (!isBlackKey(midi)) blanches.push(midi);
  if (!blanches.length) return '';
  const largeurBlanche = 100 / blanches.length;
  const largeurNoire = largeurBlanche * 0.62;

  const mainDe = (midi) => (lh.has(midi) ? 'lh' : (rh.has(midi) ? 'rh' : null));
  const classesDe = (midi, base) => {
    const main = mainDe(midi);
    return [base, main ? `is-${main}` : '', plus.has(midi) && main ? 'is-added' : ''].filter(Boolean).join(' ');
  };
  const titreDe = (midi) => {
    const main = mainDe(midi);
    const suite = main ? `, ${main === 'lh' ? 'main gauche' : 'main droite'}` : '';
    return escapeAttribute(`${nom(midi)}${suite}${plus.has(midi) && main ? ', ajoutée' : ''}`);
  };

  let touches = '';
  blanches.forEach((midi) => {
    // Un repère sous la touche : les Do, qui situent l'octave, et les notes
    // jouées. Tout étiqueter rendrait le clavier illisible.
    const montrer = midi % 12 === 0 || mainDe(midi);
    const caption = montrer ? `<span class="key-caption">${escapeHtmlText(nom(midi))}</span>` : '';
    touches += `<span class="${classesDe(midi, 'white-key')}" title="${titreDe(midi)}" aria-hidden="true">${caption}</span>`;
  });
  for (let midi = debut; midi <= fin; midi += 1) {
    if (!isBlackKey(midi)) continue;
    const avant = blanches.filter((b) => b < midi).length;
    const gauche = avant * largeurBlanche - largeurNoire / 2;
    const caption = mainDe(midi) ? `<span class="key-caption">${escapeHtmlText(nom(midi))}</span>` : '';
    touches += `<span class="${classesDe(midi, 'black-key')}" style="left:${round2(gauche)}%;width:${round2(largeurNoire)}%" title="${titreDe(midi)}" aria-hidden="true">${caption}</span>`;
  }

  // La légende ne nomme une main que si elle joue : l'annoncer sur un voicing
  // qui n'en a pas serait une information fausse.
  const legende = [
    lh.size ? '<span class="keybed-legend-item is-lh"><i></i>Main gauche</span>' : '',
    rh.size ? '<span class="keybed-legend-item is-rh"><i></i>Main droite</span>' : '',
    plus.size ? '<span class="keybed-legend-item is-added"><i></i>Ajoutée</span>' : '',
  ].filter(Boolean).join('');

  // [Claude] — 2026-11-06 — Plus de titre « Aperçu du voicing » ni de pied
  // (étendue, compte de notes actives) : Narcisse les a annotés à retirer.
  // La légende des mains reste seule, si une main joue vraiment.
  return `<div class="keybed">
      ${legende ? `<div class="keybed-head"><span class="keybed-legend">${legende}</span></div>` : ''}
      <div class="piano-keys" role="img" aria-label="${escapeAttribute(ariaDuVoicing(actives, lh, rh, nom))}">${touches}</div>
    </div>`;
}

/** Le voicing en une phrase, pour qui n'a que la lecture d'écran. */
function ariaDuVoicing(actives, lh, rh, nom) {
  if (!actives.length) return 'Clavier, aucune note';
  const gauche = actives.filter((n) => lh.has(n)).map(nom);
  const droite = actives.filter((n) => rh.has(n)).map(nom);
  const bouts = [];
  if (gauche.length) bouts.push(`main gauche ${gauche.join(', ')}`);
  if (droite.length) bouts.push(`main droite ${droite.join(', ')}`);
  return bouts.length ? `Clavier : ${bouts.join(' ; ')}` : `Clavier : ${actives.map(nom).join(', ')}`;
}

const round2 = (n) => Math.round(n * 100) / 100;
const escapeHtmlText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (s) => escapeHtmlText(s).replace(/"/g, '&quot;');
