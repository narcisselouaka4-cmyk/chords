// Grammaire de phrase issue des cas pédagogiques étudiés, pas une transcription
// des vidéos. Chaque détour désigne son arrivée et reste soumis aux voix jouées.
export const pitchClass = n => (n % 12 + 12) % 12;
const pc = pitchClass;
const dominant = q => /^(7|9|13)/.test(q) && !/sus/.test(q);
const minor = q => /^m(?!aj)/.test(q);

export function preparesChord(frame, next) {
  return Boolean(next && dominant(frame.chord.quality)
    && pc(next.chord.rootPc - frame.chord.rootPc) === 5);
}

/** Une résolution doit exister dans les voix réellement choisies, pas le texte. */
export function resolvingVoices(from, to) {
  if (!from.function || to.rootPc !== from.function.targetRootPc) return 0;
  const arrivals = [to.rootPc, pc(to.rootPc + (minor(to.quality) ? 3 : 4))];
  return from.notes.filter(n => [4, 10].includes(pc(n - from.rootPc))
    && to.notes.some(m => arrivals.includes(pc(m)) && Math.abs(m - n) >= 1 && Math.abs(m - n) <= 2)).length;
}

export function functionalProfiles(frames, palette, ownSpecs) {
  const profiles = [];
  for (const tritone of [false, true]) {
    const specs = frames.map((f, i) => ownSpecs(f, frames[i + 1]));
    const required = [];
    for (let i = 0; i < frames.length - 1 && required.length < 3; i++) {
      const from = frames[i], to = frames[i + 1];
      if (to.at - from.at < .7 || to.at - from.at > 6
        || from.chord.rootPc === to.chord.rootPc || /dim|aug|sus/.test(to.chord.quality)) continue;
      if (tritone && !preparesChord(from, to)) continue;
      const rootPc = pc(to.chord.rootPc + (tritone ? 1 : 7));
      specs[i] = (tritone ? ['13#11', '7b9', '9', '7#5'] : ['9', '13', '7b9', '7#5'])
        .map((quality, rank) => ({rootPc, quality, preserveBass: false, chromatic: true, rank,
          function: {kind: tritone ? 'tritone' : 'dominant', targetRootPc: to.chord.rootPc, targetAt: to.at,
            evidence: tritone ? 'amazing-grace:6:50-7:37' : 'above-all:1:37-1:54'}}));
      specs[i + 1] = specs[i + 1].map(s => ({...s, resolveLeading: true}));
      required.push(i);
      i++; // L'arrivée ne devient pas en même temps un autre détour.
    }
    if (required.length) profiles.push({id: tritone ? 'tritone' : 'arrivals',
      title: tritone ? 'Une autre tension, la même arrivée' : 'Préparer les arrivées',
      description: tritone ? 'Des dominantes remplacées, avec des voix qui rejoignent les accords suivants.'
        : 'Des accords qui préparent les arrivées de ta progression, sous ta mélodie.', specs, requireFunctions: required});
  }
  if (palette == null) return profiles;
  // Deux lignes descendantes vers V, transposables. Les octaves viennent de la
  // prise : aucun MIDI absolu issu d'un ancien cache de tutoriel n'est copié.
  for (let i = 0; i + 3 < frames.length; i++) {
    if (![7, 5, 4, 2].every((degree, j) => pc(frames[i + j].topMidi - palette) === degree)
      || pc(frames[i + 3].chord.rootPc - palette) !== 7) continue;
    const specs = frames.map((f, j) => ownSpecs(f, frames[j + 1]));
    const roots = [9, 2, 0, 7], basses = [4, 2, 0, 11], qualities = ['m7', 'm7', 'maj9', '9'];
    for (let j = 0; j < 4; j++) specs[i + j] = [{rootPc: pc(palette + roots[j]), bassPc: pc(palette + basses[j]),
      quality: qualities[j], preserveBass: false, rank: 0, phrase: 'above-all:7:04-7:09'}];
    profiles.push({id: 'two-lines', title: 'Mélodie et basse liées',
      description: 'Une basse descendante accompagne ta mélodie, avec des notes communes entre les accords.',
      specs, requireSlots: [i, i + 1, i + 2, i + 3]});
    break;
  }
  // Un détour parallèle est borné par un retour réellement présent dans la
  // prise : la quarte ne s'applique pas arbitrairement à toutes les mélodies.
  for (let i = 0; i + 2 < frames.length; i++) {
    if (pc(frames[i].topMidi - palette) !== 2 || pc(frames[i + 1].topMidi - frames[i].topMidi) !== 5
      || pc(frames[i + 2].chord.rootPc - palette) !== 2 || !minor(frames[i + 2].chord.quality)) continue;
    const specs = frames.map((f, j) => ownSpecs(f, frames[j + 1]));
    for (let j = 0; j < 2; j++) specs[i + j] = [{rootPc: pc(frames[i + j].topMidi - 4), quality: 'maj9',
      preserveBass: false, chromatic: true, rank: 0, phrase: 'amazing-grace:5:12-6:16'}];
    profiles.push({id: 'parallel-return', title: 'Un détour, puis le retour',
      description: 'Deux couleurs liées à ta mélodie, puis le retour sur ton accord suivant.',
      specs, requireSlots: [i, i + 1]});
    break;
  }
  return profiles;
}
