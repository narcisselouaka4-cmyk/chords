import { applyTakeEdit } from './take-edit.js';

/** Un plan est toujours calculé sur la source ; la relance ajoute des endroits, sans déplacer les indices. */
export function planPlayingChanges(take, proposals, { goal, previous = null, more = false, alternative = false, broad = false } = {}) {
  const previousChanges = previous?.changes || (previous ? [previous] : []);
  const used = new Set(previousChanges.map((p) => p.id));
  const selected = more && !alternative ? [...previousChanges] : [];
  const regions = new Set(selected.map((p) => p.region));
  let added = 0;
  const limit = more ? 2 : broad ? 4 : 1;
  const canUse = (p) => !regions.has(p.region) && !(more || alternative ? used.has(p.id) : false);
  function include(p) {
    if (!canUse(p) || !applyTakeEdit(take, { type: 'plan', edits: [...selected, p].map((c) => c.edit) })) return false;
    selected.push(p); regions.add(p.region); added++;
    return true;
  }
  // Un mouvement réel dans une demande large ; les couleurs se répartissent ensuite sur la phrase.
  if (goal === 'develop' || goal === 'passing') {
    for (const p of proposals.filter((p) => p.goal === 'passing')) if (include(p)) break;
  }
  const pool = proposals.filter((p) => p.goal === (goal === 'lighten' ? 'lighten' : 'enrich'));
  if (goal !== 'passing') {
    // Couvrir le début, le milieu et la fin avant de densifier une même zone.
    while (added < limit) {
      const available = pool.filter(canUse);
      if (!available.length) break;
      const enrichSelected = selected.filter((p) => p.goal !== 'passing');
      available.sort((a, b) => {
        if (!enrichSelected.length) return a.at - b.at;
        const distance = (p) => Math.min(...enrichSelected.map((q) => Math.abs(p.at - q.at)));
        return distance(b) - distance(a) || a.at - b.at;
      });
      let accepted = false;
      for (const p of available) if (include(p)) { accepted = true; break; }
      if (!accepted) break;
    }
  }
  if (!added) return null;
  const ordered = [...selected].sort((a, b) => a.at - b.at);
  if (ordered.length === 1) return { ...ordered[0], take };
  const changes = ordered.map((p) => { const { take: _take, changes: _changes, ...change } = p; return change; });
  const lead = more && !alternative ? `J’ajoute ${added === 1 ? 'un autre endroit' : 'deux autres endroits'} à la version précédente.`
    : alternative ? 'Voici une autre version, repartie de ton jeu original.' : 'Voici une version enrichie à plusieurs endroits de ta progression.';
  const described = more && !alternative ? changes.filter((p) => !used.has(p.id)) : changes;
  const details = described.map((p) => `- ${p.at === 0 ? 'Au début : ' : p.at > take.duration * .7 ? 'Vers la fin : ' : ''}${p.summary || p.text.split('. ')[0]}.`).join('\n');
  return { version: 3, id: `plan:${changes.map((p) => p.id).join('|')}`, goal,
    take, changes, addedCount: added, edit: { type: 'plan', edits: changes.map((p) => p.edit) },
    text: `${lead}\n\n${details}\n\nJe garde ton rythme et ton dessus. ${changes.some((p) => p.goal === 'passing') ? 'Seul le passage annoncé ajuste l’accompagnement précédent.' : 'Tes appuis graves restent en place.'}`,
  };
}
