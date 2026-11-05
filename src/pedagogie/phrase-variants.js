import {buildPhraseArrangement,arrangementFrames} from './phrase-arrangement.js';
import {notePairs} from './take-edit.js';
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
  // Nouvelle grammaire corrigée : version 8 distincte des cartes version 6 rejetées.
  const arranged=!bassConstraint&&!latin?buildPhraseArrangement(take,{message,latin}):null;
  const linked=arranged?buildPhraseArrangement(take,{message,latin,voicingMode:'linked'}):null;
  const variants = [...(arranged?[arranged]:[]),...(linked?[linked]:[]),...harmonious];
  const source = harmonious.find(v => v.id === 'enrich') || harmonious[0];
  if (source && movement) {
    const changed = applyTakeEdit(take, source.advice.edit);
    for (const kind of changed && !arranged ? noPassing?[]:['passing'] : []) {
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
  const frames=arrangementFrames(take);
  const seen = new Set();
  return variants.filter(v => {
    // Une proposition de progression doit travailler la majorité de ses accords.
    // Les prises sans repères suffisants restent du ressort des corrections ciblées.
    const coverage=harmonicRewriteCoverage(take,v,frames);
    if(frames.length>=3 && (coverage.ratio<.8 || !coverage.topPreserved))return false;
    v.rewrite=coverage;
    const key = JSON.stringify(v.example.events);
    if (seen.has(key) || exclude.includes(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => {
    const order = ['arrangement','arrangement-linked','enrich','two-lines','parallel-return','resolution','tritone','arrivals','relative','soft'];
    const rank = v => ['connection','passing'].includes(v.id) ? 2.5 : order.indexOf(v.id) < 0 ? 20 : order.indexOf(v.id);
    return rank(a) - rank(b);
  }).filter(v => v.id !== 'soft' || variants.length < 3).slice(0,5);
}

/** Mesure des positions réellement jouées, indépendante des titres des cartes. */
export function harmonicRewriteCoverage(take,variant,frames=arrangementFrames(take)) {
  const changed=applyTakeEdit(take,variant.advice.edit);
  if(!changed)return {total:frames.length,transformed:0,ratio:0,topPreserved:false};
  const pairs=notePairs(changed.events);
  const sourceEvents=new Set(take.events.map(e=>JSON.stringify(e)));
  const added=pairs.filter(p=>!sourceEvents.has(JSON.stringify(p.event)));
  let transformed=0,topPreserved=true;
  for(const f of frames){
    const top=f.top;
    if(top)topPreserved&&=changed.events.some(e=>JSON.stringify(e)===JSON.stringify(top.event))
      &&changed.events.some(e=>JSON.stringify(e)===JSON.stringify(take.events[top.off]))
      &&!added.some(p=>p.event.time<top.end&&p.end>top.event.time&&p.event.note>f.topMidi);
    const at=Math.max(...f.source.map(p=>p.event.time))+.025;
    const old=new Set(f.source.filter(p=>p.end>at).map(p=>p.event.note));
    const now=new Set(pairs.filter(p=>p.event.time<=at&&p.end>at).map(p=>p.event.note));
    const differences=[...old].filter(n=>!now.has(n)).length+[...now].filter(n=>!old.has(n)).length;
    if(differences>=2)transformed++;
  }
  return {total:frames.length,transformed,ratio:frames.length?transformed/frames.length:0,topPreserved};
}
