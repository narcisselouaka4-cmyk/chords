import {gridChordName,gridMoment} from './proposal-chord-grid.js';
import {parseChordName} from './note-roles.js';

const plain=s=>String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const pc=n=>(n%12+12)%12;
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];

export function isExplanationQuestion(message) {
  return /\bpourquoi\b|\bcomment\b|explique|explication|quel.*(?:role|raison|difference|note|accord|couleur)|a quoi sert|c'est quoi|qu['’]est.ce|^(?:plus de )?d[eé]tails[.!?\s]*$/i.test(plain(message));
}

export function personalInterpretationRequest(message) {
  return /\b(?:toi\s*[,，]?\s*)?(?:tu|vous)\b.{0,30}\b(?:jouerais|joueriez|ferais|feriez)\b.{0,30}\bcomment\b|\bcomment\b.{0,25}\b(?:tu|vous)\b.{0,25}\b(?:jouerais|joueriez|ferais|feriez)\b/.test(plain(message));
}

export function explicitPlaybackRequest(message) {
  const t=plain(message);
  return personalInterpretationRequest(message)||/(?:fais|fait|faire)[- ]moi (?:re)?(?:entendre|ecouter)|(?:re)?joue[- ]moi|(?:^|[.!?]\s*|(?:et|puis)\s+)rejoue\b|\b(?:re)?ecoute(?:r)?\b|(?:peux|pourrais)[- ]tu.*(?:jouer|entendre)|tu peux.*(?:jouer|entendre)/.test(t);
}

function identity(label) {
  const c=parseChordName(gridChordName(label).split(' (')[0]);
  return c?`${c.rootPc}:${plain(c.quality).replace(/♭/g,'b').replace(/♯/g,'#')}`:null;
}

function mentions(message) {
  const french=String(message || '').replace(/\b(?:Sol|Do|Ré|Re|Mi|Fa|La|Si)[♯♭#b]?\s*(?:(?:majeur|mineur|maj|m)\s*)?\d+(?:[♯♭#b]\d+)*/giu,m=>gridChordName(m));
  const tokens=[...french.replace(/♭/g,'b').replace(/♯/g,'#').matchAll(/\b([A-G][#b]?(?:(?:maj|min|m|dim|aug|sus|add)?\d+(?:[#b]\d+)*(?:\/[A-G][#b]?)?|m|dim|aug|sus)?)(?=$|[\s,;?!:.)])/gi)];
  return tokens.map(m=>identity(m[1][0].toUpperCase()+m[1].slice(1))).filter(Boolean);
}

/** Expliquer une fonction seulement si le plan conservé en fournit les preuves. */
export function proposalExplanationAnswer({message,memory}) {
  if(!isExplanationQuestion(message)||explicitPlaybackRequest(message)||!memory?.proposals?.length)return null;
  let focusQuestion=message,wanted=mentions(message);
  if(!wanted.length&&/detail|cet accord|ce passage|cette couleur/.test(plain(message))){
    focusQuestion=[...(memory.questions || [])].reverse().find(q=>mentions(q).length) || message;
    wanted=mentions(focusQuestion);
  }
  const clock=/(\d{1,2}):(\d{2})(?:[,.](\d+))?/.exec(focusQuestion);
  const at=clock?Number(clock[1])*60+Number(clock[2])+Number(`0.${clock[3] || 0}`):null;
  const proposals=[...memory.proposals].reverse();
  const variantIndex=/deuxi[eè]me|seconde|proposition\s*2/i.test(message)?1:/troisi[eè]me|proposition\s*3/i.test(message)?2:0;
  for(const p of proposals){
    const variants=variantIndex?[p.variants[variantIndex]].filter(Boolean):p.variants;
    for(const v of variants){
      for(const id of [...wanted].reverse()){
        const candidates=v.harmony.map((h,i)=>({h,i})).filter(x=>identity(x.h.chord)===id);
        if(at!=null)candidates.sort((a,b)=>Math.abs(a.h.at-at)-Math.abs(b.h.at-at));
        const index=candidates[0]?.i ?? -1;if(index<0)continue;
        const h=v.harmony[index],after=v.harmony.find(x=>h.targetAt!=null&&Math.abs(x.at-h.targetAt)<.1)||v.harmony[index+1];
        const chord=parseChordName(gridChordName(h.chord)),next=after&&parseChordName(gridChordName(after.chord));
        const heading=`Dans « ${v.title} », à ${gridMoment(h.at)}, `;
        let content;
        if(h.goal==='passing'&&chord&&next){
          content=`${heading}le ${gridChordName(h.chord,'latin')} prépare le ${gridChordName(after.chord,'latin')} qui suit.`;
          const bass=h.notes?.length?Math.min(...h.notes):null,target=after.notes?.length?Math.min(...after.notes):null;
          if(bass!=null&&target!=null&&bass-target===1)content+=` La basse descend de ${names[pc(bass)]} à ${names[pc(target)]}, d’un demi-ton : cela lie les deux accords.`;
          if(/^(7|9|13)/.test(chord.quality)&&pc(chord.rootPc-next.rootPc)===1){
            content+=` Il remplace ici un ${names[pc(next.rootPc+7)]}7 : c’est une autre couleur de tension pour la même arrivée, appelée substitution tritonique.`;
            const common=(h.notes || []).find(n=>(after.notes || []).includes(n));
            if(common!=null)content+=` Le ${names[pc(common)]} reste commun aux deux accords.`;
          }
        }else{
          content=`${heading}j’ai proposé ${gridChordName(h.chord,'latin')} sous ta mélodie.`;
          if(after)content+=` L’accord suivant est ${gridChordName(after.chord,'latin')}.`;
          content+=' Ce sont les accords du plan conservé dans cette conversation.';
        }
        return {ok:true,content,toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null,proposalReference:{messageIndex:p.messageIndex,variantId:v.id,at:h.at}},
          suggestedActions:[{label:'Réécouter la proposition',message:'Réécouter cette proposition.'}],autoplay:false};
      }
    }
  }
  return null;
}
