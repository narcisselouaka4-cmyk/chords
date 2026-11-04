// Indices de style d'une prise personnelle. Ce n'est pas un classifieur de genres
// entraîné : les accords et le nombre d'attaques par minute ne prouvent aucun style.
// Repères musicaux : Yamaha / Jerry Kovarsky, « Exploring Latin Rhythms » (2022),
// https://hub.yamaha.com/keyboards/k-how-to/exploring-latin-rhythms/
// et Berklee ILPN-246, https://college.berklee.edu/courses/ilpn-246
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
const median = (xs) => [...xs].sort((a,b) => a-b)[Math.floor(xs.length / 2)] || 0;

function attackGroups(events) {
  const groups = [];
  for (const e of events.filter((e) => e.type === 'note_on' && e.velocity > 0 && Number.isFinite(e.time)
    && e.time >= 0 && Number.isInteger(e.note) && e.note >= 21 && e.note <= 108).sort((a,b) => a.time-b.time)) {
    let group = groups.at(-1);
    if (!group || e.time - group.time > .045) { group = { time: e.time, notes: [] }; groups.push(group); }
    if (!group.notes.includes(e.note)) group.notes.push(e.note);
  }
  return groups;
}

// Même geste transposé : comparer les intervalles internes, pas la tonalité.
const shape = (g) => {
  if (g.notes.some((n) => g.notes.includes(n+12))) return 'octaves';
  return g.notes.length > 1 ? 'accord' : 'note';
};

function repetition(groups) {
  let best = { score: 0, cycles: 0 };
  for (let lag = 4; lag <= Math.min(20, Math.floor(groups.length / 3)); lag++) {
    const periods = groups.slice(lag).map((g,i) => g.time-groups[i].time);
    const period = median(periods);
    const score = groups.slice(lag).filter((g,i) => shape(g) === shape(groups[i])
      && Math.abs(g.time-groups[i].time-period) < period*.12).length / periods.length;
    if (score > best.score) best = { score, cycles: groups.length / lag };
  }
  return best;
}

// La grille est relative. Sans clic ni mesure fournie, sa phase ne permet pas
// d'affirmer où est le premier temps, ni de nommer une clave 2-3 ou 3-2.
function pulseGrid(groups) {
  const gaps = groups.slice(1).map((g,i) => g.time-groups[i].time).filter((n) => n > .07 && n < 1);
  if (gaps.length < 12) return null;
  const typical = median(gaps);
  let best = null;
  const minStep = Math.max(.04, typical/3);
  const maxStep = Math.min(.6, typical*.7);
  for (let step = minStep; step <= maxStep; step += Math.max(.0005,(maxStep-minStep)/80)) {
    for (let phase = 0; phase < 12; phase++) {
      const offset = groups[0].time + step*phase/12;
      const positions = groups.map((g) => (g.time-offset)/step);
      const quality = positions.reduce((s,x) => s + Math.max(0, 1-Math.abs(x-Math.round(x))/.3), 0) / groups.length;
      // Éviter de « reconnaître » une subdivision de plus en plus fine.
      const score = quality - Math.max(0, typical/step-2.2)*.08;
      if (!best || score > best.score) {
        const cells = positions.map(Math.round);
        const parity = cells.filter((n) => Math.abs(n % 2) === 1).length/groups.length;
        const distances = cells.slice(1).map((n,i) => n-cells[i]);
        best = { score, quality, step, parity: Math.max(parity,1-parity),
          adjacent: distances.filter((n) => n === 1).length/distances.length,
          spaced: distances.filter((n) => n === 2).length/distances.length };
      }
    }
  }
  return best;
}

export function analyzePlayingStyle(take) {
  const all = attackGroups(take?.events || []);
  // Un registre, pas une prétendue détection des mains.
  const pitches = all.flatMap((g) => g.notes);
  const low = Math.min(...pitches);
  const threshold = Math.max(...pitches)-low >= 19 ? low+12 : low;
  const upper = all.map((g) => ({ ...g, notes: g.notes.filter((n) => n >= threshold) })).filter((g) => g.notes.length);
  const duration = all.length > 1 ? all.at(-1).time-all[0].time : 0;
  const repeated = repetition(upper);
  const grid = pulseGrid(upper);
  const octaves = upper.filter((g) => g.notes.some((n) => g.notes.includes(n+12))).length / Math.max(1,upper.length);
  const enough = duration >= 5 && upper.length >= 24;
  const loop = enough && repeated.score >= .5;
  // Indices convergents et volontairement limités : cellule répétée en octaves,
  // alternance de valeurs courtes et longues, décalage récurrent sur la grille.
  // Un arpège égal, des accords plaqués ou des octaves seuls ne suffisent pas.
  const latin = loop && octaves >= .25 && grid?.quality >= .5 && grid.parity >= .64
    && grid.parity <= .92 && grid.adjacent >= .12 && grid.spaced >= .35;
  return { version: 1, hypothesis: latin ? 'latin-montuno' : 'undetermined',
    enough, loop, octaves, duration, attacks: all.length, repeated, grid };
}

function styleQuestion(text) {
  if (/prof|tutoriel|video|bibliotheque|disponible|style de voicing|comment jouer|explique|apprends/.test(text)) return false;
  return /(?:quel|quoi comme|detect|identifi|reconn|devin).*(?:style|genre)|(?:style|genre).*(?:je joue|mon jeu|ma prise|musique|de jeu)|(?:est.ce.*(?:je joue|mon jeu|cette prise|du|de la)|c'est (?:du|de la|un|une)).*(?:salsa|montuno|merengue|jazz|pop|gospel|classique)/.test(text);
}

export function playingStyleAnswer({ message, messages = [], context }) {
  const text = plain(message);
  const current = messages.findLastIndex((m) => m.role === 'user');
  const history = current >= 0 && messages[current].content === message ? messages.slice(0,current) : messages;
  const previousUser = [...history].reverse().find((m) => m.role === 'user');
  const previousReply = [...history].reverse().find((m) => m.role === 'assistant' && !m.isTyping);
  const followup = /^(?:ok[, .]*)?(?:et )?(?:maintenant|cette fois|la|celui.la)[ ?.!]*$/.test(text)
    && (styleQuestion(plain(previousUser?.content)) || Boolean(previousReply?.toolResult?.playingStyle));
  if (!styleQuestion(text) && !followup) return null;
  const take = context?.playing?.passage;
  if (!take?.events?.length) return null;
  const analysis = analyzePlayingStyle(take);
  let content;
  if (analysis.hypothesis === 'latin-montuno') {
    content = 'Ça évoque un jeu latin, proche d’un montuno de salsa. La figure revient en boucle, avec des notes en octaves et un rythme décalé qui donne le rebond.\n\nC’est une piste, pas une identification certaine : le piano seul ne suffit pas à confirmer le genre ni le sens de la clave.';
  } else if (analysis.loop) {
    content = 'Je repère une figure d’accompagnement qui revient en boucle. Ce geste existe dans plusieurs styles : les accords seuls ne permettent pas de choisir entre salsa, pop ou autre.\n\nPour préciser le groove, garde cette figure sur plusieurs tours et indique où tu comptes le premier temps.';
  } else {
    content = analysis.enough
      ? 'Je ne reconnais pas encore un motif assez caractéristique pour nommer le style de cette prise. Les accords et la vitesse ne suffisent pas à dire « jazz », « pop » ou « salsa ».\n\nJoue la même figure sur plusieurs tours : je pourrai comparer son rythme.'
      : 'La prise est trop courte ou trop peu répétée pour reconnaître un style. Joue la même figure sur plusieurs tours : le rythme aidera davantage que le nom des accords.';
  }
  return { ok: true, content, toolResult: { played: [], ignored: 0, suggestions: [], example: null, voicing: null,
    playingStyle: { ...analysis, sourceId: take.id || null } }, suggestedActions: [], autoplay: false };
}
