// Quelques choix musicaux confirmés, conservés dans la conversation : aucune
// « vraie grille » n'est déduite d'une mélodie seule, aucune inférence réseau.
import {melodySource} from './melody-accompaniment.js';
import {buildDegreeAccompaniment,requestedDegreeProgression} from './melody-progression.js';
import {melodyArrivalPlan} from './melody-arrivals.js';
import {extractKey} from './intent-classifier.js';
import {reviewTake} from '../recorder/take-review.js';
import {samePlayingSource} from './personal-source.js';
import {isExplanationQuestion} from './proposal-explanation.js';
import {harmonyStyleFamilies,harmonyColors,findHarmonyStyle,findHarmonyColors,withoutStyleWords} from './harmony-preferences.js';
import {requestedPersonalStyle} from './style-capabilities.js';
import {melodyHarmonicPlans,accompanimentPlanCost} from './melody-harmonic-plan.js';
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
const familyActions=()=>[...harmonyStyleFamilies.map(f=>action(f.label,`Voir les styles : ${f.label}.`)),action('Autre style…','Je veux écrire un autre style.'),action('Choisis pour moi','Choisis une couleur pour moi.')];
const profileActions=()=>[action('Palette chaleureuse','Essayer seulement la palette chaleureuse.'),action('Palette jazz','Essayer seulement la palette jazz.'),action('Sans couleur imposée','Essayer sans couleur imposée.'),action('Choisir un autre style','Revenir aux familles de styles.')];
const colorActions=()=>[...harmonyColors.slice(0,5).map(c=>action(c.label,`Ma couleur : ${c.label}`)),action('Autres nuances','Voir les autres nuances.'),action('Garder cet équilibre','Garder la couleur de ce style.')];
function styleQuestion(state,take){
 state.stage='style';
 const family=harmonyStyleFamilies.find(f=>f.id===state.styleFamily);
 if(family)return result(state,take,`${family.label} : quelle direction préfères-tu ?${family.id==='gospel'?' Le worship (aussi appelé CCM) désigne ici la louange contemporaine.':''} Tu peux aussi écrire ton propre style.`,[...family.styles.map(s=>action(s.label,`Mon style : ${s.label}`)),action('Toutes les familles','Revenir aux familles de styles.')]);
 return result(state,take,'Dans quel style veux-tu travailler ? Choisis une famille, écris un style ou cite un morceau de référence. Tu peux aussi me laisser choisir. Le rythme de ta prise sera conservé ; je préciserai ce que je sais réellement réaliser.',familyActions());
}
function selectStyle(state,take,choice,text){
 state.requestedStyle={id:choice?.id||'custom',label:choice?.label||text.slice(0,180),text};delete state.styleFamily;
 state.colorConfirmed=false;delete state.requestedColor;delete state.colorPassages;delete state.colorScope;delete state.styleScope;
 if(!choice?.profile){
  state.stage='style-scope';delete state.style;
  return result(state,take,`Je garde ton souhait : « ${state.requestedStyle.label} ». Je ne sais pas encore en réaliser un accompagnement fidèle. Je peux essayer une harmonisation avec la palette chaleureuse ou jazz, en gardant ta mélodie et ton rythme. Ce sera une alternative, pas une version de ce style. Veux-tu l’essayer ?`,profileActions());
 }
 state.style=choice.profile;state.styleScope='harmonic-palette';return next(state,take);
}
function colorQuestion(state,take,other=false){
 state.stage='color';
 return result(state,take,`Style souhaité : ${state.requestedStyle?.label||'sans style imposé'}. Quelle couleur veux-tu lui donner ? Tu peux combiner les mots, par exemple « chaleureux et aéré », ou écrire une autre nuance.`,other?
  [...harmonyColors.slice(5).map(c=>action(c.label,`Ma couleur : ${c.label}`)),action('Écrire une nuance','Je veux écrire une autre nuance.'),action('Premières couleurs','Voir les premières couleurs.'),action('Garder cet équilibre','Garder la couleur de ce style.')]:colorActions());
}
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
 const original=withoutStyleWords(state.request,state.requestedStyle?.id==='custom'?state.requestedStyle.text:null).replace(/appuis(?: valid[eé]s)?\s*:[^\n.]+/gi,'');
 return `Fais-moi entendre ma mélodie harmonisée sur ${state.degrees.join('-')} en ${key}. Avec quelques accords de passage.\n${original}\n${styleText[state.style]}.`
  +(state.colorPassages===false?' Sans accords de passage.':state.colorPassages===true?' Avec quelques accords de passage.':'')
  +(state.arrivals?.length?`\nAppuis validés : ${state.arrivals.map(a=>`${a.degree} à ${stamp(a.at)}`).join(' ; ')}.`:'')
  +'\nConserve toutes les notes et le rythme de ma mélodie. Maintiens les voicings entre les appuis.'
  +(state.planning?' Évite les frottements avec les notes tenues de toute la phrase.':'')
  +(!/appoggiature|ornement|grace notes?/.test(plain(state.request))?' Sans appoggiature.':'');
}
function planFor(state,take){
 const source=melodySource(take);if(!source)return null;
 const pairs=[...source.pairs].sort((a,b)=>a.event.time-b.event.time);
 const plan=melodyArrivalPlan(pairs,{degrees:state.degrees},state.key,state.request);
 return plan.anchors.length>=3?plan.anchors.map(a=>({at:a.at,degree:a.degree,melody:a.melody,sourceOn:a.sourceOn})):null;
}
function proposeProgression(state,take){
 const possible=[];
 for(const plan of melodyHarmonicPlans(take,{key:state.key,profile:state.style,exclude:state.excludedProgressions})){
  const candidate={...state,degrees:plan.degrees,arrivals:plan.arrivals,planning:plan.analysis};
  const rendered=buildDegreeAccompaniment(take,{message:requestFor(candidate)});if(!rendered)continue;
  possible.push({...candidate,progressionOrigin:'proposal',score:plan.cost+accompanimentPlanCost(rendered,take)});
 }
 return possible.sort((a,b)=>a.score-b.score)[0]||null;
}
function next(state,take){
 if(!state.style)return styleQuestion(state,take);
 if(state.colorConfirmed===false)return colorQuestion(state,take);
 if(!state.melodyConfirmed){state.stage='melody';return result(state,take,'J’ai repéré une ligne surtout mélodique. Est-ce que toutes les notes de cette prise sont la mélodie à conserver ?',[
  action('Oui, toutes les notes','Oui, toutes ces notes sont ma mélodie.'),action('Il y a aussi un accompagnement','Il y a aussi des notes d’accompagnement.')],true);}
 if(!state.key){state.stage='key';return result(state,take,'Je n’ai pas assez de repères pour choisir une tonalité. La connais-tu ? Tu peux écrire par exemple « Do majeur », ou me laisser essayer une couleur.',[
  action('Choisis une tonalité','Je ne sais pas, choisis une tonalité à essayer.')]);}
 if(!state.degrees){state.stage='progression';return result(state,take,'As-tu une progression à garder ? Tu peux écrire les accords, comme « Do → Sol → La mineur → Fa », ou les degrés. Si tu ne la connais pas, je proposerai un parcours à essayer.',degreeActions);}
 if(!state.arrivals)state.arrivals=planFor(state,take);
 if(!state.arrivals){state.stage='progression';delete state.degrees;return result(state,take,'Je n’arrive pas à placer cette progression sur ta mélodie avec assez de repères. Je peux chercher un autre parcours, ou tu peux indiquer les changements d’accords.',degreeActions);}
 state.stage='arrivals';
 const summary=harmonyBriefLines(state).slice(0,4).join('\n');
 const wishes=state.requestedStyle?`Souhait : ${state.requestedStyle.label}${state.requestedColor?`, ${state.requestedColor.label}`:''}. Essai : ${state.style==='ccm'?'palette chaleureuse':state.style==='jazz'?'palette jazz':'couleurs libres'}, rythme conservé.${state.styleScope==='alternative'?' Le style demandé n’est pas reproduit.':''}${state.colorScope==='alternative'?' La nuance demandée n’a pas de réglage dédié.':''}\n\n`:'';
 return result(state,take,`${wishes}${state.progressionOrigin==='proposal'?'Voici un parcours possible, pas une progression détectée dans tes notes.':''}${state.planning?' Je l’ai choisi en comparant plusieurs chemins sous les notes tenues de ta mélodie, puis en vérifiant les voicings.':state.progressionOrigin!=='proposal'?'Je garde la progression que tu as donnée.':''}\n\nAu début, je propose ces changements :\n${summary}\n\nTu peux vérifier tous les appuis ci-dessous. Ces moments te conviennent-ils ? Tu peux aussi écrire une correction, par exemple « Sol à 0:04 ; La mineur à 0:07 ».`,[
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
   action('Le style','Changer le style de cette harmonisation.'),action('La couleur','Changer la couleur de cette harmonisation.'),action('La progression','Changer la progression de cette harmonisation.'),action('Les appuis','Revoir les appuis de cette harmonisation.')]);
 }
 const review=reviewTake(take.events),declared=keyFrom(message),stored=keyFrom(`en ${take.key||''}`),key=declared||stored||
  (review.key?.confidence>=.7?{rootPc:review.key.pc,minor:review.key.mode==='minor'}:null);
 const declaredStyle=findHarmonyStyle(message),legacyColor=(!declaredStyle||Boolean(declaredStyle.profile))&&/des couleurs?\s+(?:ccm|jazz)|\bcouleurs? ccm\b/.test(t);
 let state=pending&&!restart?JSON.parse(JSON.stringify(pending)):{version:1,status:'pending',request:message,stage:'style',key,keyOrigin:declared?'user':stored?'source':key?'hypothesis':null,
  degrees:suppliedProgression(message,key)?.valid?suppliedProgression(message,key).degrees:null,progressionOrigin:'user',style:legacyColor?(/\bccm\b/.test(t)?'ccm':'jazz'):null,
  colorConfirmed:legacyColor,
  melodyConfirmed:/uniquement.*melodi|seulement.*melodi|que.*melodi|que des notes/.test(t)};
 if(/annul.*guidage|annul.*harmonis/.test(t)){
  state.status='cancelled';return result(state,take,'D’accord, je garde ta prise et j’arrête ce guidage.',[action('Rejouer ma prise','Rejoue mon jeu.')]);
 }
 if(pending&&!restart){
  if(state.stage==='color-scope'&&!/^essayer\b/.test(t)&&(/revoir les couleurs/.test(t)||findHarmonyColors(message).length))state.stage='color';
  if(state.stage==='review'){
   if(/style/.test(t)){delete state.style;delete state.styleFamily;state.colorConfirmed=false;return next(state,take);}
   if(/couleur/.test(t)){state.colorConfirmed=false;return colorQuestion(state,take);}
   if(/progression|parcours/.test(t)){delete state.degrees;delete state.arrivals;delete state.planning;return next(state,take);}
   if(/appuis|moments/.test(t))return next(state,take);
   return result(state,take,'Tu peux revoir le style, la couleur, la progression ou les moments où les accords changent.',[
    action('Le style','Changer le style de cette harmonisation.'),action('La couleur','Changer la couleur de cette harmonisation.'),action('La progression','Changer la progression de cette harmonisation.'),action('Les appuis','Revoir les appuis de cette harmonisation.')]);
  }
  if(state.stage==='arrivals'&&/propose.*parcours|change.*progression/.test(t)){
   if(state.degrees)state.excludedProgressions=[...new Set([...(state.excludedProgressions||[]),state.degrees.join('-')])];
   state.stage='progression';delete state.arrivals;delete state.degrees;
  }
  if(['style','style-scope','color','color-scope'].includes(state.stage)){
   if(/revenir aux familles|toutes les familles/.test(t)){delete state.style;delete state.styleFamily;return styleQuestion(state,take);}
   if(state.stage==='style-scope'||state.stage==='color-scope'){
    const accepted=/^essayer seulement la palette chaleureuse\.?$/.test(t)?'ccm':/^essayer seulement la palette jazz\.?$/.test(t)?'jazz':/^essayer sans couleur imposee\.?$/.test(t)?'neutral':null;
    if(!accepted&&state.stage==='style-scope'&&(declaredStyle||legacyColor)){
     if(legacyColor){state.style=/ccm/.test(t)?'ccm':'jazz';state.styleScope='alternative';state.colorConfirmed=true;return next(state,take);}
     return selectStyle(state,take,declaredStyle,message.replace(/^mon style\s*:\s*/i,''));
    }
    if(!accepted)return state.stage==='style-scope'?selectStyle(state,take,null,state.requestedStyle.text):result(state,take,'Cette nuance n’a pas encore de réglage dédié. Choisis une alternative, ou reviens aux styles.',profileActions());
    state.style=accepted;
    if(state.stage==='color-scope'){state.colorScope='alternative';state.colorConfirmed=true;}
    else state.styleScope='alternative';
   }else if(state.stage==='style'){
    const family=harmonyStyleFamilies.find(f=>t.replace(/[.!]+$/,'')===`voir les styles : ${plain(f.label)}`||t===`voir les styles : ${f.id}`||t===plain(f.label));
    if(family){state.styleFamily=family.id;return styleQuestion(state,take);}
    if(/autre style|ecrire.*style/.test(t))return result(state,take,'Écris le style, un mélange de styles, un artiste ou un morceau de référence. Je conserverai ta demande et te dirai si je peux la réaliser.',[action('Toutes les familles','Revenir aux familles de styles.')]);
    if(/choisis|sans style|comme tu veux|pas de preference/.test(t)){state.style='neutral';state.requestedStyle={id:'auto',label:'Sans style imposé',text:message};state.colorConfirmed=true;}
    else if(legacyColor){state.style=/ccm/.test(t)?'ccm':'jazz';state.requestedStyle={id:state.style,label:state.style==='ccm'?'Gospel doux / worship':'Jazz, couleurs d’accords',text:message};state.colorConfirmed=true;}
    else return selectStyle(state,take,declaredStyle,message.replace(/^mon style\s*:\s*/i,''));
   }else if(state.stage==='color'){
    if(/revoir les couleurs/.test(t))return colorQuestion(state,take);
    if(/voir les autres nuances/.test(t))return colorQuestion(state,take,true);
    if(/voir les premieres couleurs/.test(t))return colorQuestion(state,take);
    if(/ecrire.*nuance/.test(t))return result(state,take,'Écris la couleur que tu souhaites. Par exemple : « chaleureux mais sobre », « mystérieux », ou une nuance que tu ne trouves pas dans la liste.',[action('Voir les nuances','Voir les autres nuances.')]);
    if(/garder la couleur|choisis|comme tu veux|pas de preference/.test(t)){state.colorConfirmed=true;delete state.requestedColor;delete state.colorPassages;delete state.colorScope;}
    else{
     const colors=findHarmonyColors(message);
     state.requestedColor={label:message.replace(/^ma couleur\s*:\s*/i,'').slice(0,180),ids:colors.map(c=>c.id),text:message};
     if(!colors.length||colors.some(c=>!c.detail)){
      state.stage='color-scope';return result(state,take,`Je garde la nuance « ${state.requestedColor.label} ». Elle n’a pas encore de réglage dédié. Je peux essayer une palette chaleureuse ou jazz, sans prétendre reproduire exactement cette nuance.`,[...profileActions(),action('Autre couleur','Revoir les couleurs.')]);
     }
     const profiles=[...new Set(colors.map(c=>c.profile).filter(Boolean))];
     if(profiles.length>1)return result(state,take,'Tu demandes à la fois la palette douce et la palette jazz. Je ne sais pas encore les combiner de façon fiable. Quelle direction veux-tu privilégier ?',colorActions());
     if(profiles.length)state.style=profiles[0];
     const passages=colors.map(c=>c.passages).filter(v=>v!==undefined);state.colorPassages=passages.at(-1);
     state.colorConfirmed=true;state.colorScope='harmonic-palette';
    }
   }
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
   if(supplied?.valid){state.degrees=supplied.degrees;state.progressionOrigin='user';delete state.arrivals;delete state.planning;}
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
     const adding=/ajout\w*.*(?:appui|changement)|nouvel appui|nouveau changement/.test(t);
     const index=!adding&&closest?.distance<1.5?closest.i:state.arrivals.length;
     const degree=/^[1-7]$/.test(m[1])?Number(m[1]):rootDegree(m[1],state.key);
     if(!degree)return result(pending,take,'Cet accord ne fait pas partie du parcours tonal proposé. Pour changer de tonalité ou choisir un autre parcours, reprends le guidage ; les appuis précédents sont conservés.',[action('Reprendre le guidage','Reprendre le guidage de cette harmonisation.')],true);
     state.arrivals[index]={at:pair.event.time,degree,melody:pair.event.note,sourceOn:pair.on};
    }
    state.arrivals.sort((a,b)=>a.at-b.at);
    if(state.arrivals.length<3||state.arrivals.some((a,i)=>i&&a.at<=state.arrivals[i-1].at))return result(pending,take,'Il faut garder des appuis distincts pour préparer la phrase. Je conserve les appuis précédents ; vérifie leurs moments.',[action('Réécouter ma prise','Rejoue mon jeu.')],true);
    if(state.planning)state.planning={...state.planning,correctedByUser:true,
     evidence:state.planning.evidence.filter(e=>state.arrivals.some(a=>a.at===e.at&&a.degree===e.degree))};
   }
  }
 }else if(declaredStyle&&!legacyColor)return selectStyle(state,take,declaredStyle,message);
 else if(!state.style){
  const family=harmonyStyleFamilies.find(f=>new RegExp(`\\b${f.id}\\b`).test(t));
  if(family){state.styleFamily=family.id;return styleQuestion(state,take);}
  const custom=requestedPersonalStyle(message)||/(?:en style|dans le style|style souhaité\s*:)\s+([^.!?\n]+)/i.exec(message)?.[1];
  if(custom)return selectStyle(state,take,null,custom);
 }
 return next(state,take);
}
