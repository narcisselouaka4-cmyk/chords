// Corrections locales du pianiste : rattachement aux attaques source, sans
// réécrire une fin entière ni effacer les choix déjà approuvés ailleurs.
import {notePairs} from './take-edit.js';
const time=(m,offset=1)=>Number(m[offset])*60+Number(m[offset+1])+Number('0.'+(m[offset+2]||0));
const clock='(\\d{1,2}):(\\d{2})(?:[,.](\\d+))?';
const chord='([1-7]|(?:sol|do|re|mi|fa|la|si|[a-g])\\s*[#b♯♭]?(?:\\s+(?:mineur|majeur))?)';
export const hasHarmonyRevision=text=>new RegExp(`${chord}\\s*(?:sus[24]|add9|maj[79]|m[79]|[679])?\\s+a\\s*${clock}`).test(text)
 ||new RegExp(`(?:retire|enleve|supprime).*appui.*${clock}`).test(text)
 ||/(?:garde|conserve).*voicings?.*avant\s+\d+:\d+/.test(text);

/** Un échec est atomique : l'appelant conserve l'état d'avant le message. */
export function reviseHarmonyBrief(state,take,text,degreeFor,previous){
 const updated=JSON.parse(JSON.stringify(state)),pairs=notePairs(take.events);
 const changes=[...text.matchAll(new RegExp(`\\b${chord}\\s*(sus[24]|add9|maj[79]|m[79]|[679])?\\s+a\\s*${clock}`,'g'))];
 const removals=[...text.matchAll(new RegExp(`(?:retire|enleve|supprime)\\s+(?:l[' ]|le )?(?:appui|changement)\\s+(?:a\\s+)?${clock}`,'g'))];
 const keep=new RegExp(`(?:garde|conserve)[^;\\n.]*voicings?[^;\\n.]*avant\\s+${clock}`).exec(text);
 if(!changes.length&&!removals.length&&!keep)return null;
 updated.revision??={lockedHarmony:[]};
 updated.revision.changedSourceOns=[];updated.revision.removedAt=[];
 if(keep){
  if(!previous?.harmony?.length)return {error:'Je n’ai pas de proposition à conserver dans cette conversation. Fais d’abord écouter une version.'};
  const until=time(keep);
  updated.revision={lockedHarmony:previous.harmony.filter(h=>h.at<until),lockedUntil:until,changedSourceOns:[],removedAt:[]};
  for(const a of updated.arrivals)if(a.at<until)a.userConfirmed=true;
 }
 for(const m of removals){
  const at=time(m),closest=updated.arrivals.map((a,i)=>({i,distance:Math.abs(a.at-at)})).sort((a,b)=>a.distance-b.distance)[0];
  if(!closest||closest.distance>.35)return {error:'Je ne retrouve pas cet appui. Aucun changement n’est appliqué ; vérifie son moment dans le placement proposé.'};
  if(updated.revision?.lockedHarmony.some(h=>h.kind==='arrival'&&h.at===updated.arrivals[closest.i].at))return {error:'Ce changement appartient au passage que tu demandes de conserver. Pour le modifier, reprends le guidage et change la progression.'};
  updated.revision.removedAt.push(updated.arrivals[closest.i].at);updated.arrivals.splice(closest.i,1);
 }
 for(const m of changes){
  const at=time(m,3),pair=[...pairs].sort((a,b)=>Math.abs(a.event.time-at)-Math.abs(b.event.time-at))[0];
  if(!pair||Math.abs(pair.event.time-at)>.35)return {error:'Je ne retrouve pas de note jouée assez près de ce moment. Vérifie le moment dans la prise ; je garde le placement précédent.'};
  const closest=updated.arrivals.map((a,i)=>({i,distance:Math.abs(a.at-at)})).sort((a,b)=>a.distance-b.distance)[0];
  const adding=/ajout\w*.*(?:appui|changement)|nouvel appui|nouveau changement/.test(text);
  const index=!adding&&closest?.distance<1.5?closest.i:updated.arrivals.length;
  const degree=/^[1-7]$/.test(m[1])?Number(m[1]):degreeFor(m[1],state.key);
  if(!degree)return {error:'Cet accord ne fait pas partie du parcours tonal proposé. Reprends le guidage pour changer de tonalité ; les appuis précédents sont conservés.'};
  if(updated.revision?.lockedHarmony.some(h=>h.kind==='arrival'&&(h.at===pair.event.time||h.at===updated.arrivals[index]?.at)))return {error:'Ce changement appartient au passage que tu demandes de conserver. Pour le modifier, reprends le guidage et change la progression.'};
  const clause=text.slice(m.index,m.index+m[0].length+80).split(/[;\n]/)[0];
  updated.arrivals[index]={at:pair.event.time,degree,melody:pair.event.note,sourceOn:pair.on,userConfirmed:true,
   ...(m[2]?{color:m[2]}:{}),...(/(?:basse fondamentale|fondamentale a la basse|avec la fondamentale)/.test(clause)?{rootBass:true}:{})};
  updated.revision.changedSourceOns.push(pair.on);
 }
 updated.arrivals.sort((a,b)=>a.at-b.at);
 if(updated.arrivals.length<3||updated.arrivals.some((a,i)=>i&&a.at<=updated.arrivals[i-1].at))return {error:'Il faut garder des appuis distincts. Je conserve le placement précédent ; vérifie leurs moments.'};
 if(updated.planning)updated.planning={...updated.planning,correctedByUser:true,
  evidence:updated.planning.evidence.filter(e=>updated.arrivals.some(a=>a.at===e.at&&a.degree===e.degree))};
 return {state:updated};
}

export const harmonyConstraints=state=>({arrivals:state.arrivals,lockedHarmony:state.revision?.lockedHarmony||[]});
