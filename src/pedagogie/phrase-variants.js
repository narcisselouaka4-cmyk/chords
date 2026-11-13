import {melodySource,buildMelodyAccompaniment} from './melody-accompaniment.js';
import {buildPhraseArrangement,arrangementFrames} from './phrase-arrangement.js';
import {notePairs} from './take-edit.js';
import {buildFixedHarmonyVariants} from './fixed-harmony.js';
import {applyTakeEdit} from './take-edit.js';
import {comparedTakeExample} from './playing-diff.js';
import {analyzePlayingStyle} from './playing-style.js';
import {planPhraseMotions} from './phrase-motion.js';
import {selectDistinctProposals} from './proposal-diversity.js';

const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Intentions différentes sur le même original ; chaque carte a son propre plan. */
export function buildPhraseVariants(take, {message = '', exclude = [], constraints = null} = {}) {
  const text = plain(message);
  if(melodySource(take)){
    const accompanied=buildMelodyAccompaniment(take,{message,constraints});
    return selectDistinctProposals(accompanied?[accompanied]:[],take.events,{exclude});
  }
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
  // Une proposition de progression doit travailler la majorité de ses accords.
  // Les prises sans repères suffisants restent du ressort des corrections ciblées.
  const frames=arrangementFrames(take);
  const covers=v=>{
    const coverage=harmonicRewriteCoverage(take,v,frames);
    v.rewrite=coverage;
    return !(frames.length>=3 && (coverage.ratio<.8 || !coverage.topPreserved));
  };
  // [Claude] — 2026-11-13 — L'arrangement remplace les accords de passage, mais seulement s'il est
  // gardé. Écarté par la règle de couverture ci-dessus (3 accords retravaillés sur 4, par exemple),
  // il empêchait quand même la carte de passages : à « améliore avec des mouvements et des accords
  // de passage », aucune carte de mouvement ne sortait (test-harmonic-phrases.js).
  const arrangedKept=[arranged,linked].some(v=>v&&covers(v));
  if (source && movement) {
    // [Claude] — 2026-11-13 — Depuis le 08/11, la carte enrichie pose SA pédale sur chaque accord ;
    // le planificateur, qui n'écrit pas de passage sous une pédale tenue, la prenait pour celle du
    // pianiste : plus aucun passage dans un accord tenu. Quand la pédale vient de l'application
    // (la prise n'en a pas), les passages sont planifiés sans elle, puis elle est relevée juste
    // avant chaque accord de passage et reprise dessus. La pédale du pianiste reste une contrainte.
    const ownPedal = take.events.some(e => e.type === 'control' && e.controller === 64);
    const appPedal = !ownPedal && source.advice.edit?.type === 'fixed-harmony' && source.advice.edit.pedal?.length > 0;
    const changed = applyTakeEdit(take, appPedal ? {...source.advice.edit, pedal: []} : source.advice.edit);
    for (const kind of changed && !arrangedKept ? noPassing?[]:['passing'] : []) {
      const plan = planPhraseMotions(changed, {kind, changes: source.harmony});
      if (!plan.edits.length) continue;
      const title = kind === 'connection' ? 'Approches et liaisons' : 'Des accords pour conduire la phrase';
      const description = kind === 'connection' ? 'Des voix intérieures relient les accords dans les respirations de ta prise.'
        : plan.motions.some(m=>m.placement==='held-phrase')
          ? 'La fin de certains accords est relayée par un passage. Ta mélodie et tes arrivées restent en place.'
          : 'Des accords de passage préparent les arrivées, dans les espaces disponibles.';
      // La pédale vient en dernier : les passages désignent leurs notes par leur position.
      const edit = appPedal
        ? {type: 'sequence', edits: [{...source.advice.edit, pedal: []}, ...plan.edits, {type: 'pedal', pedal: retakePedal(source.advice.edit.pedal, plan.motions.map(m => m.at))}]}
        : {type: 'sequence', edits: [source.advice.edit, ...plan.edits]};
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
  const eligible = variants.filter(v => {
    if(!covers(v))return false;
    const key = JSON.stringify(v.example.events);
    if (seen.has(key) || exclude.includes(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => {
    const order = ['arrangement','arrangement-linked','enrich','two-lines','parallel-return','resolution','tritone','arrivals','relative','soft'];
    // [Claude] — 2026-11-13 — Mouvements demandés : la carte de passages (l'enrichissement plus ses
    // accords de passage) passe avant l'enrichissement seul. Sinon le tri des quasi-doublons
    // (proposal-diversity.js) gardait l'enrichissement et écartait la seule carte qui répond.
    const rank = v => ['connection','passing'].includes(v.id) ? (movement ? 1.5 : 2.5) : order.indexOf(v.id) < 0 ? 20 : order.indexOf(v.id);
    return rank(a) - rank(b);
  }).filter(v => v.id !== 'soft' || variants.length < 3);
  return selectDistinctProposals(eligible, take.events, {exclude});
}

/**
 * La pédale de l'application, relevée juste avant chaque accord de passage (25 ms) et reprise
 * dessus (35 ms après) : le passage ne se mêle pas à l'accord qu'il quitte.
 */
export function retakePedal(pedal, starts) {
  const windows = [];
  for (let i = 0; i + 1 < pedal.length; i += 2) windows.push({on: pedal[i].time, off: pedal[i + 1].time});
  for (const at of [...starts].sort((a, b) => a - b)) {
    const k = windows.findIndex(w => w.on < at && w.off > at);
    if (k < 0) continue;
    const w = windows[k];
    windows.splice(k, 1, {on: w.on, off: at - .025}, {on: at + .035, off: w.off});
  }
  return windows.filter(w => w.off - w.on >= .06).flatMap(w => [{time: w.on, value: 127}, {time: w.off, value: 0}]);
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
