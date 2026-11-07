// Quelques choix musicaux confirmés, conservés dans la conversation : aucune
// « vraie grille » n'est déduite d'une mélodie seule, aucune inférence réseau.
import {melodySource} from './melody-accompaniment.js';
import {buildDegreeAccompaniment,requestedDegreeProgression} from './melody-progression.js';
import {melodyArrivalPlan} from './melody-arrivals.js';
import {extractKey} from './intent-classifier.js';
import {reviewTake} from '../recorder/take-review.js';
import {samePlayingSource} from './personal-source.js';
import {isExplanationQuestion} from './proposal-explanation.js';
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const pc=n=>(n%12+12)%12;
const names=['Do','Ré♭','Ré','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const scale=k=>k.minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
const clock=t=>{const n=Math.round(t*10);return `${Math.floor(n/600)}:${String(Math.floor(n%600/10)).padStart(2,'0')},${n%10}`;};
const stamp=t=>`${Math.floor(t/60)}:${(t%60).toFixed(6).padStart(9,'0').replace('.',',')}`;
const keyFrom=s=>extractKey(String(s||'').replace(/♭/g,'b').replace(/♯/g,'#'));
const action=(label,message=label)=>({label,message});
const chord=(degree,k)=>names[pc(k.rootPc+scale(k)[degree-1])]+(k.minor?[' mineur',' diminué','',' mineur',' mineur','','']:['',' mineur',' mineur','','',' mineur',' diminué'])[degree-1];
const styleText={ccm:'couleurs CCM',jazz:'couleurs jazz',neutral:'couleurs libres'};
const unsupported=/\b(salsa|montuno|merengue|bossa|reggae|zouk|compas|bachata|rumba|rock|blues|funk|classique)\b/i;
const degreeActions=[action('Propose un parcours','Je ne connais pas la progression, propose un parcours.')];
const roots={do:0,re:2,mi:4,fa:5,sol:7,la:9,si:11,c:0,d:2,e:4,f:5,g:7,a:9,b:11};
function rootDegree(token,key){
 const m=/^(sol|do|re|mi|fa|la|si|[a-g])\s*([#b♯♭]?)/.exec(plain(token));
 return m?scale(key).indexOf(pc(roots[m[1]]+(/[#♯]/.test(m[2])?1:/[b♭]/.test(m[2])?-1:0)-key.rootPc))+1:0;
}

function suppliedProgression(message,key){
 const numeric=requestedDegreeProgression(message);if(numeric||!key)return numeric;
 const body=plain(message).split(':').at(-1).trim().replace(/[.!?]+$/,'');
 const tokens=body.split(/\s*(?:→|[-–—]|;|,)\s*/);if(tokens.length<3||tokens.length>8)return null;
 const degrees=[];
 for(const token of tokens){
  const m=/^(sol|do|re|mi|fa|la|si|[a-g])\s*([#b♯♭]?)\s*(majeur|mineur|major|minor|m|diminue|dim)?$/.exec(token);if(!m)return null;
  const root=pc(roots[m[1]]+(/[#♯]/.test(m[2])?1:/[b♭]/.test(m[2])?-1:0)),degree=scale(key).indexOf(pc(root-key.rootPc))+1;
  if(!degree)return null;
  const expected=(key.minor?[1,4,5]:[2,3,6]).includes(degree)?'minor':degree===(key.minor?2:7)?'dim':'major';
  if(m[3]&&((/^(m|mineur|minor)$/.test(m[3])?'minor':/^dim/.test(m[3])?'dim':'major')!==expected))return null;
  degrees.push(degree);
 }
 return {degrees,valid:true};
}

export function harmonyBriefLines(state){
 return state?.key?(state.arrivals||[]).map(a=>`${clock(a.at)} : ${chord(a.degree,state.key)}, sur ${names[pc(a.melody)]}`):[];
}

function result(state,take,content,actions,preview=false){
 return {reply:{ok:true,content,toolResult:{played:[],ignored:0,suggestions:[],voicing:null,
  originalTake:take,harmonyBrief:state,harmonyBriefPreview:preview,example:null},
  suggestedActions:state.status==='pending'?[...actions,action('Annuler le guidage','Annuler le guidage de cette harmonisation.')]:actions,autoplay:false}};
}
function requestFor(state){
 const key=names[state.key.rootPc].replace(/♭/g,'b').replace(/♯/g,'#')+(state.key.minor?' mineur':' majeur');
 const original=state.request.replace(/\b(?:ccm|jazz|worship|gospel|salsa|montuno|merengue|bossa|reggae|zouk|compas|bachata|rumba|rock|blues|funk|classique)\b/gi,'').replace(/appuis(?: valid[eé]s)?\s*:[^\n.]+/gi,'');
 return `Fais-moi entendre ma mélodie harmonisée sur ${state.degrees.join('-')} en ${key}. Avec quelques accords de passage.\n${original}\n${styleText[state.style]}.`
  +(state.arrivals?.length?`\nAppuis validés : ${state.arrivals.map(a=>`${a.degree} à ${stamp(a.at)}`).join(' ; ')}.`:'')
  +'\nConserve toutes les notes et le rythme de ma mélodie. Maintiens les voicings entre les appuis.'
  +(!/appoggiature|ornement|grace notes?/.test(plain(state.request))?' Sans appoggiature.':'');
}
function planFor(state,take){
 const source=melodySource(take);if(!source)return null;
 const pairs=[...source.pairs].sort((a,b)=>a.event.time-b.event.time);
 const plan=melodyArrivalPlan(pairs,{degrees:state.degrees},state.key,state.request);
 return plan.anchors.length>=3?plan.anchors.map(a=>({at:a.at,degree:a.degree,melody:a.melody,sourceOn:a.sourceOn})):null;
}
function proposeProgression(state,take){
 const first=Math.min(...take.events.filter(e=>e.type==='note_on'&&e.velocity>0).map(e=>e.time)),possible=[];
 for(const degrees of [[4,5,3,6],[1,5,6,4],[2,5,1],[1,4,5,1]]){
  if(state.excludedProgressions?.includes(degrees.join('-')))continue;
  const s={...state,degrees},arrivals=planFor(s,take);if(!arrivals)continue;
  const candidate={...s,arrivals};
  if(!buildDegreeAccompaniment(take,{message:requestFor(candidate)}))continue;
  const last=arrivals.at(-1).at,score=(arrivals[0].at-first)*4+(take.duration-last)*.2-arrivals.length*.1;
  possible.push({...candidate,progressionOrigin:'proposal',score});
 }
 return possible.sort((a,b)=>a.score-b.score)[0]||null;
}
function next(state,take){
 if(!state.style){state.stage='style';return result(state,take,(state.unsupportedStyle?`Je ne sais pas encore réaliser une version ${state.unsupportedStyle}. `:'')+'Quelle couleur veux-tu pour cette harmonisation ? Je garderai ton rythme : il s’agit de couleurs d’accords, pas d’une conversion complète de style.',[
  action('CCM chaleureux','Des couleurs CCM.'),action('Jazz','Des couleurs jazz.'),action('Choisis pour moi','Choisis une couleur pour moi.')]);}
 if(!state.melodyConfirmed){state.stage='melody';return result(state,take,'J’ai repéré une ligne surtout mélodique. Est-ce que toutes les notes de cette prise sont la mélodie à conserver ?',[
  action('Oui, toutes les notes','Oui, toutes ces notes sont ma mélodie.'),action('Il y a aussi un accompagnement','Il y a aussi des notes d’accompagnement.')],true);}
 if(!state.key){state.stage='key';return result(state,take,'Je n’ai pas assez de repères pour choisir une tonalité. La connais-tu ? Tu peux écrire par exemple « Do majeur », ou me laisser essayer une couleur.',[
  action('Choisis une tonalité','Je ne sais pas, choisis une tonalité à essayer.')]);}
 if(!state.degrees){state.stage='progression';return result(state,take,'As-tu une progression à garder ? Tu peux écrire les accords, comme « Do → Sol → La mineur → Fa », ou les degrés. Si tu ne la connais pas, je proposerai un parcours à essayer.',degreeActions);}
 if(!state.arrivals)state.arrivals=planFor(state,take);
 if(!state.arrivals){state.stage='progression';delete state.degrees;return result(state,take,'Je n’arrive pas à placer cette progression sur ta mélodie avec assez de repères. Je peux chercher un autre parcours, ou tu peux indiquer les changements d’accords.',degreeActions);}
 state.stage='arrivals';
 const summary=harmonyBriefLines(state).slice(0,4).join('\n');
 return result(state,take,`${state.progressionOrigin==='proposal'?'Voici un parcours possible, pas une progression détectée dans tes notes.':'Je garde la progression que tu as donnée.'}\n\nAu début, je propose ces changements :\n${summary}\n\nTu peux vérifier tous les appuis ci-dessous. Ces moments te conviennent-ils ? Tu peux aussi écrire une correction, par exemple « Sol à 0:04 ; La mineur à 0:07 ».`,[
  action('Ces appuis me conviennent','Ces appuis me conviennent, fais-moi entendre cette harmonisation.'),action('Modifier les appuis','Je veux modifier les moments des changements d’accords.'),action('Un autre parcours','Propose un autre parcours harmonique.')],true);
}

/** Retourne soit une question, soit une demande complète pour le moteur normal.
 * Les informations restent dans toolResult : relecture du JSON, pas d'état global. */
export function harmonyBriefTurn({message,messages=[],context}){
 const take=context?.playing?.passage;if(!take||!['autonomous','session',undefined].includes(context?.type)||!melodySource(take))return null;
 const t=plain(message),latest=[...messages].reverse().find(m=>m.role==='assistant'&&m.toolResult?.harmonyBrief?.version===1&&samePlayingSource(m.toolResult.originalTake,take));
 const pending=latest?.toolResult.harmonyBrief.status==='pending'?latest.toolResult.harmonyBrief:null;
 const restart=/reprendre le guidage|recommencer le guidage|guide.*harmonis|pose.*questions.*harmonis/.test(t);
 // Une prise nouvelle constitue une frontière. Une grille explicitement
 // renseignée ou une ancienne proposition continue de suivre le chemin direct.
 const previousProposal=messages.some(m=>m.role==='assistant'&&m.toolResult?.variants?.length&&samePlayingSource(m.toolResult.originalTake,take));
 const intent=/harmonis|accompagn.*melodi|accords?.*sous.*melodi|version enrichie.*(?:jeu|session)|enrich.*(?:jeu|session|melodi)|fait comme tu veux|fais comme tu veux/.test(t);
 const placed=/(?:arrivees|reperes|appuis(?: valides)?)\s*:|une mesure par accord|(?:4|quatre) temps par accord/.test(t);
 if(!pending&&!restart&&(!intent||requestedDegreeProgression(message)&&placed||previousProposal))return null;
 if(pending&&placed&&requestedDegreeProgression(message)?.valid)return {request:message,brief:{...pending,status:'superseded'}};
 if(/hasard|n'importe quoi|aleatoire|sans intention|test des touches/.test(t))return null;
 if(pending&&(/rejoue|reecoute|pourquoi|explique|c'est quoi/.test(t)||isExplanationQuestion(message)))return null;
 if(restart&&latest?.toolResult.harmonyBrief.status==='ready'){
  const state={...JSON.parse(JSON.stringify(latest.toolResult.harmonyBrief)),status:'pending',stage:'review'};
  return result(state,take,'Je garde les choix de cette harmonisation. Que veux-tu revoir ?',[
   action('La couleur','Changer la couleur de cette harmonisation.'),action('La progression','Changer la progression de cette harmonisation.'),action('Les appuis','Revoir les appuis de cette harmonisation.')]);
 }
 const review=reviewTake(take.events),declared=keyFrom(message),stored=keyFrom(`en ${take.key||''}`),key=declared||stored||
  (review.key?.confidence>=.7?{rootPc:review.key.pc,minor:review.key.mode==='minor'}:null);
 let state=pending&&!restart?JSON.parse(JSON.stringify(pending)):{version:1,status:'pending',request:message,stage:'style',key,keyOrigin:declared?'user':stored?'source':key?'hypothesis':null,
  degrees:suppliedProgression(message,key)?.valid?suppliedProgression(message,key).degrees:null,progressionOrigin:'user',style:/\bccm\b/.test(t)?'ccm':/\bjazz\b/.test(t)?'jazz':null,
  unsupportedStyle:unsupported.exec(t)?.[1],
  melodyConfirmed:/uniquement.*melodi|seulement.*melodi|que.*melodi|que des notes/.test(t)};
 if(/annul.*guidage|annul.*harmonis/.test(t)){
  state.status='cancelled';return result(state,take,'D’accord, je garde ta prise et j’arrête ce guidage.',[action('Rejouer ma prise','Rejoue mon jeu.')]);
 }
 if(pending&&!restart){
  if(state.stage==='review'){
   if(/couleur|style/.test(t)){delete state.style;return next(state,take);}
   if(/progression|parcours/.test(t)){delete state.degrees;delete state.arrivals;return next(state,take);}
   if(/appuis|moments/.test(t))return next(state,take);
   return result(state,take,'Tu peux revoir la couleur, la progression ou les moments où les accords changent.',[
    action('La couleur','Changer la couleur de cette harmonisation.'),action('La progression','Changer la progression de cette harmonisation.'),action('Les appuis','Revoir les appuis de cette harmonisation.')]);
  }
  if(state.stage==='arrivals'&&/propose.*parcours|change.*progression/.test(t)){
   if(state.degrees)state.excludedProgressions=[...new Set([...(state.excludedProgressions||[]),state.degrees.join('-')])];
   state.stage='progression';delete state.arrivals;delete state.degrees;
  }
  if(state.stage==='style'){
   if(/ccm|worship/.test(t))state.style='ccm';else if(/jazz/.test(t))state.style='jazz';else if(/choisis|sans style|comme tu veux|pas de preference/.test(t))state.style='neutral';
   else return result(state,take,'Je ne sais pas encore réaliser toutes les harmonisations de style. Pour cette prise, je peux essayer des couleurs CCM, jazz, ou sans style imposé en gardant ton rythme.',[
    action('CCM chaleureux','Des couleurs CCM.'),action('Jazz','Des couleurs jazz.'),action('Choisis pour moi','Choisis une couleur pour moi.')]);
   delete state.unsupportedStyle;
  }else if(state.stage==='melody'){
   if(/^oui\b|toutes.*melodi|toutes.*notes.*garder/.test(t))state.melodyConfirmed=true;
   else return result(state,take,'Je n’ai pas encore de sélection fiable pour séparer ces voix dans cette prise. Je garde tes notes intactes ; je peux te les faire réécouter. Je ne vais pas choisir à ta place des notes à supprimer.',[
    action('Réécouter ma prise','Rejoue mon jeu.'),action('Conserver toutes les notes','Oui, toutes ces notes sont ma mélodie.')],true);
  }else if(state.stage==='key'){
   state.key=keyFrom('en '+message);
   if(state.key)state.keyOrigin='user';
   if(!state.key&&/choisis|ne sais pas/.test(t)&&review.key){state.key={rootPc:review.key.pc,minor:review.key.mode==='minor'};state.keyOrigin='proposal';}
  }else if(state.stage==='progression'){
   const supplied=suppliedProgression(message,state.key);
   if(supplied?.valid){state.degrees=supplied.degrees;state.progressionOrigin='user';delete state.arrivals;}
   else if(/propose|choisis|ne (?:la )?connais pas|ne sais pas|comme tu veux/.test(t)){
    const proposed=proposeProgression(state,take);
    if(!proposed)return pending.arrivals?.length?result(pending,take,'Je n’ai pas trouvé d’autre parcours vérifiable avec ces contraintes. Je garde le précédent et ta prise.',[action('Garder ce parcours','Ces appuis me conviennent, fais-moi entendre cette harmonisation.')],true):result(state,take,'Je n’ai pas trouvé de parcours vérifiable pour cette mélodie. Je garde la prise ; je peux la rejouer, ou travailler une progression que tu indiques.',[action('Rejouer ma prise','Rejoue mon jeu.')]);
    state=proposed;
   }
  }else if(state.stage==='arrivals'){
   if(/appuis me conviennent|confirme|^oui\b|essaie ces appuis/.test(t)){
    const request=requestFor(state);
    if(!buildDegreeAccompaniment(take,{message:request}))return result(state,take,'Ces appuis ne donnent pas encore un accompagnement vérifiable. Je garde tes notes ; tu peux modifier les changements d’accords ou demander un autre parcours.',degreeActions);
    state.status='ready';return {request,brief:state};
   }
   if(/modifier.*(?:moments|appuis)/.test(t))return result(state,take,'Indique seulement les changements à corriger : par exemple « Sol à 0:04 ; La mineur à 0:07 ». Les degrés fonctionnent aussi. Je les recalerai sur les notes réellement jouées et te montrerai le placement avant de jouer.',[action('Garder les appuis proposés','Ces appuis me conviennent, fais-moi entendre cette harmonisation.')],true);
   const changes=[...t.matchAll(/\b([1-7]|(?:sol|do|re|mi|fa|la|si|[a-g])\s*[#b♯♭]?(?:\s+(?:mineur|majeur))?)\s+a\s*(\d{1,2}):(\d{2})(?:[,.](\d+))?/g)];
   const removals=[...t.matchAll(/(?:retire|enleve|supprime)\s+(?:l[' ]|le )?(?:appui|changement)\s+(?:a\s+)?(\d{1,2}):(\d{2})(?:[,.](\d+))?/g)];
   if(changes.length||removals.length){
    const pairs=melodySource(take).pairs;
    for(const m of removals){
     const at=Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||0));
     const closest=state.arrivals.map((a,i)=>({i,distance:Math.abs(a.at-at)})).sort((a,b)=>a.distance-b.distance)[0];
     if(!closest||closest.distance>.35)return result(pending,take,'Je ne retrouve pas cet appui. Aucun changement n’est appliqué ; vérifie son moment dans le placement proposé.',[action('Réécouter ma prise','Rejoue mon jeu.')],true);
     state.arrivals.splice(closest.i,1);
    }
    for(const m of changes){
     const at=Number(m[2])*60+Number(m[3])+Number('0.'+(m[4]||0));
     const pair=[...pairs].sort((a,b)=>Math.abs(a.event.time-at)-Math.abs(b.event.time-at))[0];
     if(!pair||Math.abs(pair.event.time-at)>.35)return result(pending,take,'Je ne retrouve pas de note jouée assez près de ce moment. Vérifie le moment dans la prise ; je garde le placement précédent.',[action('Réécouter ma prise','Rejoue mon jeu.')],true);
     const closest=state.arrivals.map((a,i)=>({i,distance:Math.abs(a.at-at)})).sort((a,b)=>a.distance-b.distance)[0];
     const index=closest?.distance<1.5?closest.i:state.arrivals.length;
     const degree=/^[1-7]$/.test(m[1])?Number(m[1]):rootDegree(m[1],state.key);
     if(!degree)return result(pending,take,'Cet accord ne fait pas partie du parcours tonal proposé. Pour changer de tonalité ou choisir un autre parcours, reprends le guidage ; les appuis précédents sont conservés.',[action('Reprendre le guidage','Reprendre le guidage de cette harmonisation.')],true);
     state.arrivals[index]={at:pair.event.time,degree,melody:pair.event.note,sourceOn:pair.on};
    }
    state.arrivals.sort((a,b)=>a.at-b.at);
    if(state.arrivals.length<3||state.arrivals.some((a,i)=>i&&a.at<=state.arrivals[i-1].at))return result(pending,take,'Il faut garder des appuis distincts pour préparer la phrase. Je conserve les appuis précédents ; vérifie leurs moments.',[action('Réécouter ma prise','Rejoue mon jeu.')],true);
   }
  }
 }
 return next(state,take);
}
