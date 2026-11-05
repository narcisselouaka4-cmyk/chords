import {buildFixedHarmonyVariants} from './fixed-harmony.js';
import {applyTakeEdit} from './take-edit.js';
import {comparedTakeExample} from './playing-diff.js';
import {analyzePlayingStyle} from './playing-style.js';
import {planPhraseMotions} from './phrase-motion.js';

const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Intentions différentes sur le même original ; chaque carte a son propre plan. */
export function buildPhraseVariants(take, {message = '', exclude = []} = {}) {
  const text = plain(message);
  const latin = analyzePlayingStyle(take).hypothesis === 'latin-montuno';
  const bassConstraint = /basses?\s*:|(?:basse|cycle|parcours).*quartes/.test(text);
  const fixedOnly = /sans (?:aucun )?(?:mouvement|passage|ajout rythmique)|(?:uniquement|seulement).*accords? (?:fixes|enrichis)|pas de mouvements?/.test(text);
  const noPassing=/sans (?:accords? de )?passages?|pas d['’]accords? de passage|(?:garde|conserv|ne change pas|sans changer).*(?:basse|basses)|bassiste|sans ajouter de basse/.test(text);
  const movement = !fixedOnly && !bassConstraint && !latin
    && /mouv|liaison|passage|developp|ameliore|plus loin|autre chose/.test(text);
  const fixed = buildFixedHarmonyVariants(take, {message, functional: !latin});
  const harmonious = latin ? fixed.filter(v => ['enrich','soft','bass'].includes(v.id)) : fixed;
  const variants = [...harmonious];
  const source = harmonious.find(v => v.id === 'enrich') || harmonious[0];
  if (source && movement) {
    const changed = applyTakeEdit(take, source.advice.edit);
    for (const kind of changed ? noPassing?['connection']:['connection','passing'] : []) {
      const plan = planPhraseMotions(changed, {kind, changes: source.harmony});
      if (!plan.edits.length) continue;
      const title = kind === 'connection' ? 'Approches et liaisons' : 'Des accords pour conduire la phrase';
      const description = kind === 'connection' ? 'Des voix intérieures relient les accords dans les respirations de ta prise.'
        : plan.motions.some(m=>m.placement==='held-phrase')
          ? 'La fin de certains accords est relayée par un passage. Ta mélodie et tes arrivées restent en place.'
          : 'Des accords de passage préparent les arrivées, dans les espaces disponibles.';
      const edit = {type: 'sequence', edits: [source.advice.edit, ...plan.edits]};
      const combined = applyTakeEdit(take, edit);
      if (!combined) continue;
      const example = comparedTakeExample(take, combined);
      if (!example) continue;
      const advice = {version: 5, id: `phrase:${kind}`, goal: 'develop', take, edit,
        changes: [...source.advice.changes, ...plan.motions], text: description};
      variants.push({id: kind, title, description, advice, harmony: source.harmony,
        example: {...example, title, subtitle: description}});
    }
  }
  // Les cartes se différencient par leurs événements, pas uniquement par leur nom.
  const seen = new Set();
  return variants.filter(v => {
    const key = JSON.stringify(v.example.events);
    if (seen.has(key) || exclude.includes(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => {
    const order = ['enrich','two-lines','parallel-return','resolution','tritone','arrivals','relative','soft'];
    const rank = v => ['connection','passing'].includes(v.id) ? 2.5 : order.indexOf(v.id) < 0 ? 20 : order.indexOf(v.id);
    return rank(a) - rank(b);
  }).filter(v => v.id !== 'soft' || variants.length < 3).slice(0,5);
}
