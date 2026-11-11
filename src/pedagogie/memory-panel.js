import {buildConversationMemory,loadPersonalMemories,updatePersonalMemory} from './copilot-memory.js';
import {memoryProvenance} from './auto-memory.js';

const el=(tag,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};

/** Mémoire consultable et contrôlée par le pianiste, indépendante des conversations. */
export function mountMemoryPanel(root,getMessages,{getConversationId = ()=>null,onOpenConversation = null} = {}) {
  const actions=root.querySelector('.tr-heading-actions');
  if(!actions||root.querySelector('.copilot-memory-button'))return;
  const button=el('button','Mémoire','tr-button copilot-memory-button');button.type='button';
  actions.insertBefore(button,actions.querySelector('#copilot-new-conv-btn'));
  const dialog=el('dialog','','copilot-memory-dialog');dialog.setAttribute('aria-label','Mémoire du Copilot');
  root.append(dialog);
  async function render(){
    dialog.replaceChildren();
    const header=el('div','','copilot-memory-heading'),title=el('h2','Mémoire'),close=el('button','Fermer','tr-button');close.type='button';close.onclick=()=>dialog.close();
    header.append(title,close);dialog.append(header);
    dialog.append(el('h3','Dans cet échange'));
    const memory=buildConversationMemory(getMessages(),{conversationId:getConversationId()});
    dialog.append(el('p',memory.source?`Jeu conservé : ${memory.source.name}. Il reste associé à cet échange.`:'Aucun jeu confié dans cet échange.'));
    const latest=memory.proposals.at(-1);
    if(latest)dialog.append(el('p',`Propositions retrouvées : ${latest.variants.map(v=>v.title).join(' ; ')}.`));
    if(memory.decisions.length){const list=el('ul');for(const text of memory.decisions.slice(-3))list.append(el('li',text));dialog.append(list);}
    dialog.append(el('h3','Souvenirs entre les conversations'));
    dialog.append(el('p','Ils sont conservés sur cet ordinateur. Le Copilot retient de lui-même ce que tu dis de durable sur toi (niveau, instrument, objectif, préférence) ; tu peux aussi écrire « Retiens que… » ou ajouter une préférence ici. Chaque souvenir se corrige ou s’oublie. Les éléments utiles sont transmis au service IA configuré pour répondre.'));
    const state=await loadPersonalMemories();
    const status=el('p','','copilot-memory-status');status.setAttribute('role','status');
    // [Claude] — 2026-11-11 — Un fichier de souvenirs illisible est dit comme tel : il n'est ni écrasé ni vidé.
    if(!state.ok){status.textContent=state.corrupt?'Le fichier des souvenirs est illisible. Il n’a pas été modifié et une copie de sûreté a été mise de côté. Rien ne sera enregistré tant qu’il n’est pas réparé.':'La mémoire n’est pas accessible pour le moment.';dialog.append(status);return;}
    if(!state.entries.length)dialog.append(el('p','Aucun souvenir enregistré.'));
    for(const entry of state.entries){
      const row=el('div','','copilot-memory-entry');
      if(entry.reference?.variants?.length)row.append(el('p',`Référence : ${entry.reference.variants.map(v=>v.title).join(' ; ')}`));
      // D'où vient ce souvenir : retenu automatiquement ou ajouté par le pianiste, quand, et sa phrase d'origine.
      row.append(el('p',memoryProvenance(entry),'copilot-memory-provenance'));
      const input=el('textarea');input.value=entry.text;input.maxLength=500;input.rows=2;input.setAttribute('aria-label','Souvenir enregistré');
      const buttons=el('div','','copilot-memory-entry-actions');
      const save=el('button','Enregistrer','tr-button'),forget=el('button','Oublier','tr-button');save.type=forget.type='button';
      save.onclick=async()=>{save.disabled=true;const r=await updatePersonalMemory({id:entry.id,text:input.value});if(r.ok)await render();else{save.disabled=false;status.textContent=r.error;}};
      forget.onclick=async()=>{forget.disabled=true;const r=await updatePersonalMemory({id:entry.id,remove:true});if(r.ok)await render();else{forget.disabled=false;status.textContent=r.error;}};
      buttons.append(save,forget);
      const sourceId=entry.reference?.conversationId || entry.source?.conversationId || '';
      if(onOpenConversation&&/^conv_[a-zA-Z0-9_]+$/.test(sourceId)){
        const open=el('button','Ouvrir l’échange','tr-button');open.type='button';
        open.onclick=async()=>{if(await onOpenConversation(sourceId))dialog.close();else status.textContent='Cette conversation n’est plus disponible. Le souvenir, lui, est conservé.';};buttons.append(open);
      }
      row.append(input,buttons);dialog.append(row);
    }
    // Les souvenirs remplacés par une consigne plus récente restent consultables.
    if(state.superseded?.length){
      const old=el('details','','copilot-memory-superseded');old.append(el('summary',`Souvenirs remplacés (${state.superseded.length})`));
      for(const entry of state.superseded){const active=state.entries.find(e=>e.id===entry.supersededBy);old.append(el('p',`« ${entry.text} »${active?` — remplacé par « ${active.text} »`:''}`));}
      dialog.append(old);
    }
    const form=el('form','','copilot-memory-add'),input=el('textarea');input.rows=2;input.maxLength=500;input.required=true;input.setAttribute('aria-label','Nouveau souvenir');input.placeholder='Ex. : je préfère garder la mélodie au-dessus des accords.';
    const add=el('button','Retenir cette préférence','tr-button');add.type='submit';
    form.append(input,add);form.onsubmit=async e=>{e.preventDefault();add.disabled=true;const r=await updatePersonalMemory({text:input.value});if(r.ok)await render();else{add.disabled=false;status.textContent=r.error;}};
    dialog.append(form,status);
  }
  button.onclick=async()=>{button.disabled=true;try{await render();if(!dialog.open)dialog.showModal();}finally{button.disabled=false;}};
  dialog.addEventListener('close',()=>button.focus());
}
