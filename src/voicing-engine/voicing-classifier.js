// [Claude] — 2026-09-25 — Reconnaître le voicing JOUÉ (« Qu'en penses-tu ? »,
// analyse d'une session) avec le vocabulaire de l'application : shell, rootless
// (A ou B), position serrée, drop 2, drop 3, drop 2-4, quartes, So What, upper
// structure, cluster, triade et son renversement, voicing écarté.
//
// Lecture par la structure des notes (pas de bibliothèque) : ce qui est joué au
// clavier n'est presque jamais exactement un voicing de VoicingLab.
//   - mains : la plus grande coupure (une quinte ou plus) sépare la main gauche
//     de la main droite ; sans coupure, tout est dans une main (au-dessus de Do4 :
//     main droite, sinon main gauche) ;
//   - rootless : ni fondamentale, ni en haut ni en bas, mais la 3ce et la 7e
//     (A : la 3ce en bas, B : la 7e en bas — Levine) ;
//   - quatre voix : on remonte d'une octave la ou les voix « lâchées » ; si on
//     retrouve une position serrée, c'est un drop 2, un drop 3 ou un drop 2-4.

const pcOf = (n) => ((n % 12) + 12) % 12;
const uniqueSorted = (notes) => [...new Set((notes || []).filter(Number.isFinite))].sort((a, b) => a - b);

/**
 * Mains probables d'un accord joué. Un accord de moins d'une dixième tient dans
 * une main ; sinon on coupe là où l'écart est grand (une quinte au moins), en
 * préférant une main gauche « de basse » (note seule, octave, quinte, dixième)
 * et une main droite qui tient dans la main (une dixième au plus).
 * @param {number[]} notes
 * @returns {{left: number[], right: number[], oneHand: boolean}}
 */
export function splitHands(notes) {
  const s = uniqueSorted(notes);
  if (s.length === 0) return { left: [], right: [], oneHand: true };
  const span = (list) => list[list.length - 1] - list[0];
  const oneHand = () => (s[0] >= 57 ? { left: [], right: s, oneHand: true } : { left: s, right: [], oneHand: true });
  if (span(s) <= 16 && !(s.length >= 2 && s[1] - s[0] >= 10)) return oneHand();
  let best = null;
  for (let i = 1; i < s.length; i += 1) {
    const gap = s[i] - s[i - 1];
    if (gap < 7) continue;
    const left = s.slice(0, i);
    const right = s.slice(i);
    if (left.length > 4) continue;
    const bassShape = left.length === 1 || (left.length === 2 && [7, 10, 11, 12, 15, 16].includes(left[1] - left[0]));
    const score = gap + (bassShape ? 5 : 0) - Math.max(0, span(right) - 12) * 2 - Math.max(0, span(left) - 16) * 2;
    if (!best || score > best.score) best = { score, left, right };
  }
  if (best) return { left: best.left, right: best.right, oneHand: false };
  // Grand accord sans coupure nette : sous Do4 à gauche.
  return { left: s.filter((n) => n < 60), right: s.filter((n) => n >= 60), oneHand: false };
}

const THIRDS = new Set([3, 4]);
const TRIADS = [
  { name: '', intervals: [0, 4, 7] },
  { name: 'm', intervals: [0, 3, 7] },
  { name: 'dim', intervals: [0, 3, 6] },
  { name: 'aug', intervals: [0, 4, 8] },
];
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Triade formée par trois notes (n'importe quel renversement), ou null. */
function triadOf(notes) {
  const pcs = [...new Set(notes.map(pcOf))];
  if (pcs.length !== 3) return null;
  for (const root of pcs) {
    const rel = pcs.map((pc) => pcOf(pc - root)).sort((a, b) => a - b);
    const found = TRIADS.find((t) => t.intervals.every((x, i) => x === rel[i]));
    if (found) return { rootPc: root, quality: found.name, name: `${NAMES[root]}${found.name}` };
  }
  return null;
}

/** Quatre voix en position serrée : toutes dans l'octave. */
const isClose = (four) => four[3] - four[0] < 12;

/** Type de drop d'un groupe de quatre voix, ou 'close', ou null. */
function dropType(four) {
  const [a, b, c, d] = four;
  if (isClose(four)) return 'close';
  const up = (list) => uniqueSorted(list);
  const drop2 = up([b, c, a + 12, d]);
  if (drop2.length === 4 && isClose(drop2) && a + 12 > c && a + 12 < d) return 'drop2';
  if (drop2.length === 4 && isClose(drop2) && a + 12 > b && a + 12 < c) return 'drop3';
  const drop24 = up([a + 12, b + 12, c, d]);
  if (drop24.length === 4 && isClose(drop24)) return 'drop2_4';
  return null;
}

const INVERSIONS = { 0: 'état fondamental', 3: '1er renversement', 4: '1er renversement', 7: '2e renversement', 10: '3e renversement', 11: '3e renversement' };

export const VOICING_LABELS = {
  shell: 'Shell',
  two_note_shell: 'Two-note shell',
  rootless: 'Rootless',
  close: 'Close position',
  drop2: 'Drop 2',
  drop3: 'Drop 3',
  drop2_4: 'Drop 2-4',
  quartal: 'Quartal (en quartes)',
  so_what: 'So What',
  upper_structure: 'Upper structure',
  cluster: 'Cluster',
  triad: 'Triade',
  spread: 'Spread (écarté)',
  open: 'Voicing ouvert',
};

/**
 * Voicing joué pour un accord connu.
 * @param {number[]} notes - MIDI
 * @param {number} rootPc - fondamentale de l'accord
 * @param {string} quality - qualité (« m9 », « 13 », « maj7#11 »)
 * @returns {{technique: string|null, label: string, detail: string, hands: {left: number[], right: number[], oneHand: boolean}, rootless: boolean, inversion: string}}
 */
export function classifyVoicing(notes, rootPc, quality = '') {
  const s = uniqueSorted(notes);
  const hands = splitHands(s);
  const rel = (n) => pcOf(n - rootPc);
  const q = String(quality || '');
  const sixth = /^m?6|dim7|°7|^o7/.test(q);
  const isSeventhPc = (i) => i === 10 || i === 11 || (sixth && i === 9);
  const isThirdPc = (i) => THIRDS.has(i) || (/sus/.test(q) && (i === 5 || i === 2));
  const inversion = s.length ? (INVERSIONS[rel(s[0])] || 'basse sur une autre note') : '';
  const out = (technique, detail = '') => ({
    technique, label: technique ? VOICING_LABELS[technique] : 'Voicing libre', detail, hands,
    rootless: !s.some((n) => rel(n) === 0), inversion,
  });
  if (s.length < 2) return out(null, 'une seule note');

  // 1. Shells : 1-3-7 / 1-7-3 (la basse est la fondamentale), ou 3-7 seuls.
  const rels = s.map(rel);
  if (s.length === 2 && rels.some(isThirdPc) && rels.some(isSeventhPc)) return out('two_note_shell', '3ce et 7e');
  if (s.length === 3 && rels[0] === 0 && rels.slice(1).some(isThirdPc) && rels.slice(1).some(isSeventhPc)) {
    return out('shell', isThirdPc(rels[1]) ? '1-3-7' : '1-7-3');
  }

  // Voix au-dessus d'une basse bien séparée (une quinte au moins) : c'est elles
  // qui font le voicing ; la basse (fondamentale, quinte, basse écrite) le porte.
  const separateBass = s.length >= 4 && s[1] - s[0] >= 7;
  const bassText = separateBass ? 'basse à part' : '';
  const voices = separateBass ? s.slice(1) : s;
  const withBass = (detail) => [detail, bassText].filter(Boolean).join(', ');

  // 2. Quartes empilées (So What : trois quartes et une tierce majeure).
  for (const group of separateBass ? [s, voices] : [s]) {
    const steps = group.slice(1).map((n, i) => n - group[i]);
    if (group.length === 5 && steps.slice(0, 3).every((d) => d === 5) && steps[3] === 4) return out('so_what', 'trois quartes et une tierce majeure');
    if (group.length >= 3 && steps.every((d) => d === 5 || d === 6) && steps.filter((d) => d === 6).length <= 1) {
      return out('quartal', `${group.length} notes empilées en quartes${group === voices && separateBass ? ', basse à part' : ''}`);
    }
  }

  // 3. Main droite quand les deux mains jouent ; sinon tout l'accord (une main).
  const upper = hands.right.length && hands.left.length ? hands.right : s;
  const upperRels = upper.map(rel);
  const leftRels = hands.left.map(rel);

  // 4. Rootless : ni fondamentale au-dessus de la basse, 3ce et 7e présentes.
  if (!upperRels.includes(0) && upper.length >= 3 && upperRels.some(isThirdPc) && upperRels.some(isSeventhPc)) {
    const lowest = upperRels[0];
    const type = isThirdPc(lowest) ? 'type A (3ce en bas)' : isSeventhPc(lowest) ? 'type B (7e en bas)' : 'renversé';
    const drop = upper.length === 4 ? dropType(upper) : null;
    const extra = drop && drop !== 'close' ? `en ${VOICING_LABELS[drop]}` : '';
    const under = upper !== s ? (hands.left.length ? 'basse à la main gauche' : bassText) : '';
    return out('rootless', [type, extra, under].filter(Boolean).join(', '));
  }

  // 5. Triade à la main droite sur 3ce + 7e à la main gauche : upper structure.
  if (hands.right.length === 3 && hands.left.length >= 2) {
    const triad = triadOf(hands.right);
    if (triad && triad.rootPc !== rootPc && leftRels.some(isThirdPc) && leftRels.some(isSeventhPc)) {
      return out('upper_structure', `triade de ${triad.name} sur la 3ce et la 7e`);
    }
  }

  // 6. Secondes serrées.
  const upperSteps = upper.slice(1).map((n, i) => n - upper[i]);
  if (upper.length >= 3 && upperSteps.filter((d) => d <= 2).length >= 2) return out('cluster', 'secondes serrées');

  // 7. Quatre voix : serrée ou drop (tout l'accord, ou les voix au-dessus de la basse).
  const four = s.length === 4 ? s : voices.length === 4 ? voices : null;
  if (four) {
    const type = dropType(four);
    if (type) return out(type, four === voices && separateBass ? 'basse à part' : '');
  }

  // 8. Triade (et son renversement), seule ou sur une basse.
  if (s.length === 3 && triadOf(s)) return out('triad', inversion);
  if (upper.length === 3 && triadOf(upper) && upper !== s) {
    const bass = hands.left.length ? hands.left : [s[0]];
    return out('triad', `triade à droite, ${bass.length > 1 && bass[1] - bass[0] === 12 ? 'basse en octave' : 'basse'} à gauche`);
  }

  // 9. Écarté, ouvert, serré.
  if (s[s.length - 1] - s[0] >= 24 && hands.left.length && hands.right.length) return out('spread', 'notes réparties sur plus de deux octaves');
  if (upper.length >= 3 && upper[upper.length - 1] - upper[0] >= 12) return out('open', withBass('plus d\'une octave au-dessus de la basse'));
  if (upper.length >= 3) return out('close', withBass(upper.length === 3 ? 'trois notes serrées' : ''));
  return out(null, '');
}
