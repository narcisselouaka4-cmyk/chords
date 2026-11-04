import { applyTakeEdit } from './take-edit.js';

/** Un plan est toujours calculé sur la source ; la relance ajoute des endroits, sans déplacer les indices. */
export function planPlayingChanges(take, proposals, { goal, previous = null, more = false, alternative = false, broad = false, technique = null } = {}) {
  const previousChanges = previous?.changes || (previous ? [previous] : []);
  const used = new Set(previousChanges.map((p) => p.id));
  const selected = more && !alternative ? [...previousChanges] : [];
  const regions = new Set(selected.map((p) => p.region));
  let added = 0;
  const limit = more ? 2 : broad ? 6 : 1;
  const canUse = (p) => !regions.has(p.region) && !(more || alternative ? used.has(p.id) : false);
  function include(p) {
    if (!canUse(p)) return false;
    const changed = applyTakeEdit(take, { type: 'plan', edits: [...selected, p].map((c) => c.edit) });
    if (!changed) return false;
    const count = (events) => events.filter((e) => e.type === 'note_on' && e.velocity > 0).length;
    // Développer l'idée, sans doubler sa densité. Le flux source reste la référence.
    if (!technique && count(changed.events)-count(take.events) > Math.max(4,Math.floor(count(take.events)*.3))) return false;
    selected.push(p); regions.add(p.region); added++;
    return true;
  }
  // Un mouvement réel dans une demande large ; les couleurs se répartissent ensuite sur la phrase.
  if (!technique && (goal === 'develop' || goal === 'passing')) {
    for (const p of proposals.filter((p) => p.goal === 'passing')) if (include(p)) break;
  }
  const pool = proposals.filter((p) => p.goal === (goal === 'lighten' ? 'lighten' : 'enrich')
    && (technique ? technique.includes(p.technique) : !p.technique || p.technique === 'colors'));
  if (goal !== 'passing') {
    // Couvrir le début, le milieu et la fin avant de densifier une même zone.
    while (added < limit) {
      const available = pool.filter(canUse);
      if (!available.length) break;
      const enrichSelected = selected.filter((p) => p.goal !== 'passing');
      available.sort((a, b) => {
        if (a.region === b.region && Boolean(a.technique) !== Boolean(b.technique)) return a.technique ? -1 : 1;
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
    text: `${lead}\n\n${details}\n\nJe garde ton rythme, ta ligne de basse et ton dessus. ${changes.some((p) => p.goal === 'passing') ? 'Seul le passage annoncé raccourcit l’accompagnement précédent.' : technique ? 'La disposition des voix intérieures change aux endroits indiqués.' : 'La conduite de tes voix est conservée.'}`,
  };
}
