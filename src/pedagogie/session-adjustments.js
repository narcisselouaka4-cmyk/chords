import {reviewTake} from '../recorder/take-review.js';
import {notePairs,applyTakeEdit} from './take-edit.js';
import {comparedTakeExample} from './playing-diff.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Corrections concrètes sur les événements confiés ; aucun voicing de remplacement. */
export function sessionAdjustmentAnswer({message,context}) {
  const text=plain(message);
  if (/^\s*(?:comment|pourquoi|explique|detaille|que signifie)\b/.test(text)) return null;
  const goal=/plaqu|(?:accords?|attaques?).*(?:ensemble|simultane)|regroup.*attaqu/.test(text)?'align'
    :/aer.*grave|ecart.*(?:grave|basse|seconde)|grave.*(?:aer|ecart)/.test(text)?'space-bass':null;
  if(!goal)return null;
  const take=context?.playing?.passage;
  const base={played:[],ignored:0,suggestions:[],example:null,voicing:null};
  if(!take?.events?.length)return {ok:true,content:'Confie-moi la session dans Sessions MIDI avec « Analyser mon jeu avec le Copilot », ou joins une prise ici. Je pourrai modifier ses notes.',toolResult:base,suggestedActions:[],autoplay:false};
  const times=[...text.matchAll(/\b(\d{1,2}):(\d{2})(?:[,.](\d+))?\b/g)].map(m=>Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0')));
  const review=reviewTake(take.events),pairs=notePairs(take.events);
  const chords=(review?.chords||[]).filter(c=>!times.length||times.some(t=>Math.floor(t)===Math.floor(c.at)||Math.abs(c.at-t)<=.3));
  let edit=null,changed=null;
  if(goal==='align'){
    const groups=chords.map(c=>({at:c.at,ons:pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<c.at+.4).map(p=>p.on)})).filter(g=>g.ons.length>=2);
    if(groups.length){edit={type:'align-attacks',groups};changed=applyTakeEdit(take,edit);}
  }else{
    const edits=[];
    for(const c of chords){
      const played=pairs.filter(p=>p.event.time>=c.at-.025&&p.event.time<c.at+.4).sort((a,b)=>a.event.note-b.event.note);
      for(let i=1;i<played.length;i++){
        const low=played[i-1],upper=played[i],note=upper.event.note+12;
        if(upper.event.note>=60||upper.event.note-low.event.note>2||upper.event.note===low.event.note||note>Math.max(...c.notes))continue;
        const candidate={type:'replace',on:upper.on,note};
        const combined=[...edits,candidate];
        const plan=combined.length===1?candidate:{type:'plan',edits:combined};
        const result=applyTakeEdit(take,plan);
        if(result){edits.push(candidate);edit=plan;changed=result;break;}
      }
    }
  }
  if(!changed)return {ok:true,content:goal==='align'?'Je n’ai pas trouvé de groupe de notes que je puisse regrouper sans conflit aux moments demandés. Je conserve ta session.':'Je n’ai pas trouvé de position plus espacée compatible à cet endroit. Je conserve ta session.',toolResult:{...base,originalTake:take},suggestedActions:[],autoplay:false};
  const title=goal==='align'?'Accords joués ensemble':'Grave plus aéré';
  const content=goal==='align'?'J’ai regroupé les attaques des accords aux moments demandés, en gardant la durée de chaque note. Le reste de ta session est conservé.'
    :`J’ai espacé le grave en montant ${edit.type==='plan'?'les notes supérieures des petits intervalles serrés':'la note supérieure du petit intervalle serré'} d’une octave. Les autres notes et leurs instants restent identiques.`;
  const advice={version:7,id:`session-adjust:${goal}`,goal,take,edit,text:content,changes:[]};
  return {ok:true,content,toolResult:{...base,originalTake:take,example:{...comparedTakeExample(take,changed),title},playingAdvice:advice},suggestedActions:[],autoplay:false};
}
