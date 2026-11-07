import {gridChordName,gridMoment} from './proposal-chord-grid.js';
import {parseChordName} from './note-roles.js';
import {resolvingVoices} from './harmonic-intentions.js';

const plain=s=>String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const pc=n=>(n%12+12)%12;
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];

export function isExplanationQuestion(message) {
  return /\bpourquoi\b|\bcomment\b|explique|explication|\bquel(?:le|s|les)?\b.*(?:role|raison|difference|note|accord|couleur|technique|voicing|morceau)|a quoi sert|c'est quoi|qu['’]est.ce|^(?:plus de )?d[eé]tails[.!?\s]*$/i.test(plain(message));
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
  if(/(?:quel.*morceau|r[eé]f[eé]rence.*morceau|inspir[eé].*(?:morceau|artiste))/i.test(message))return {
    ok:true,content:'Le plan de cette proposition ne cite pas de morceau de référence. Je peux expliquer ce que les notes font ici, sans lui inventer une origine.',
    toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null},suggestedActions:[],autoplay:false};
  const detailed=/d[eé]tails|technique|voicing|substitution|quelles notes|r[oô]le des notes/i.test(message);
  let focusQuestion=message,wanted=mentions(message);
  if(!wanted.length&&/detail|cet accord|ce passage|cette couleur/.test(plain(message))){
    focusQuestion=[...(memory.questions || [])].reverse().find(q=>mentions(q).length) || message;
    wanted=mentions(focusQuestion);
  }
  const direction=/\bvers\b/i.exec(focusQuestion);
  if(direction){const departure=mentions(focusQuestion.slice(0,direction.index));if(departure.length)wanted=departure;}
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
        const chosen=gridChordName(h.chord,'latin'),destination=after&&gridChordName(after.chord,'latin');
        const heading=`À ${gridMoment(h.at)}, `;
        let content;
        if(h.function?.kind==='leading-tone'&&chord&&next&&resolvingVoices(h,after)){
          content=`${heading}le ${chosen} prépare le ${destination}. Sa tension rend l’arrivée sur l’accord mineur plus nette, en gardant ta mélodie.`;
          const move=(h.notes||[]).flatMap(n=>(after.notes||[]).filter(m=>[next.rootPc,pc(next.rootPc+3)].includes(pc(m))&&Math.abs(m-n)>=1&&Math.abs(m-n)<=2).map(m=>[n,m]))[0];
          if(move)content+=` Le ${names[pc(move[0])]} rejoint le ${names[pc(move[1])]} : écoute ce petit mouvement à l’intérieur.`;
        }else if(h.goal==='passing'&&chord&&next){
          content=`${heading}le ${chosen} prépare le ${destination} qui suit.`;
          const bass=h.notes?.length?Math.min(...h.notes):null,target=after.notes?.length?Math.min(...after.notes):null;
          if(bass!=null&&target!=null&&bass-target===1)content+=` La basse descend d’un demi-ton : cela relie les deux accords.`;
          else content+=' Il apporte une tension pour faire entendre plus nettement l’arrivée suivante.';
          const substitute=/^(7|9|13)/.test(chord.quality)&&pc(chord.rootPc-next.rootPc)===1;
          if(substitute)content+=` Il joue ici le même rôle de préparation qu’un ${names[pc(next.rootPc+7)]}7.`;
          content+=`\n\nÉcoute surtout la liaison vers ${destination}.`;
          if(detailed&&substitute)content+=' On appelle ce remplacement une substitution tritonique : un autre accord prépare la même arrivée.';
          if(detailed){
            const common=(h.notes || []).find(n=>(after.notes || []).includes(n));
            if(common!=null)content+=` Le ${names[pc(common)]} reste commun aux deux accords.`;
          }
        }else if(chord&&/^sus[24]$/.test(chord.quality)){
          content=`${heading}le ${chosen} laisse une couleur ouverte sous ta mélodie. La ${chord.quality==='sus2'?'seconde':'quarte'} remplace la tierce de l’accord : c’est ce qui donne ce son suspendu.`;
        }else{
          const source=h.source&&parseChordName(gridChordName(h.source));
          content=`${heading}j’ai proposé ${chosen} sous ta mélodie.`;
          if(source&&chord){
            content+=source.rootPc===chord.rootPc
              ? ' J’ai changé la disposition ou la couleur de l’accord, en gardant ta note du dessus comme repère.'
              : ` Il remplace ici ${gridChordName(h.source,'latin')} : l’accompagnement change de couleur sous la même mélodie.`;
            content+='\n\nCompare surtout la couleur de l’accord avec celle de ton jeu original.';
          }else content+=' Le plan permet de retrouver ses notes, mais ne précise pas la raison de ce choix.';
          if(detailed&&h.technique==='drop2')content+=' La position utilisée est un drop 2 : une voix intérieure descend d’une octave pour ouvrir l’accord.';
        }
        return {ok:true,content,toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null,proposalReference:{messageIndex:p.messageIndex,variantId:v.id,at:h.at}},
          suggestedActions:[{label:'Réécouter la proposition',message:'Réécouter cette proposition.'}],autoplay:false};
      }
    }
  }
  return null;
}
