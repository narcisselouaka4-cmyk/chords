// Catalogue de demandes, distinct du registre des capacités du générateur.
// Un style proposé à la sélection n'est jamais une promesse de rendu musical.
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const entry=(id,label,aliases=[],profile=null)=>({id,label,aliases:[label,...aliases],profile});
export const harmonyStyleFamilies=[
 {id:'gospel',label:'Gospel',styles:[
  entry('worship','Gospel doux / worship',['ccm','worship','louange contemporaine','christian contemporary music','contemporary christian music'],'ccm'),
  entry('traditional-gospel','Gospel traditionnel'),entry('black-gospel','Black gospel'),entry('gospel-jazz','Gospel jazz'),entry('gospel-blues','Gospel blues')]},
 {id:'jazz',label:'Jazz',styles:[entry('jazz','Jazz, couleurs d’accords',['couleurs jazz','jazz'],'jazz'),entry('swing','Swing'),entry('bebop','Bebop'),entry('jazz-ballad','Ballade jazz'),entry('modal-jazz','Jazz modal'),entry('jazz-fusion','Jazz fusion')]},
 {id:'soul',label:'Soul / R&B',styles:[entry('soul','Soul'),entry('neo-soul','Néo-soul',['neo soul','neosoul']),entry('rnb','R&B',['rnb','r and b','r n b']),entry('funk','Funk'),entry('blues','Blues')]},
 {id:'pop',label:'Pop / rock',styles:[entry('pop','Pop'),entry('pop-ballad','Ballade pop'),entry('rock','Rock'),entry('soul-pop','Pop soul'),entry('chanson','Chanson française')]},
 {id:'latin',label:'Salsa et musiques latines',styles:[entry('salsa','Salsa'),entry('montuno','Montuno'),entry('merengue','Merengue'),entry('bachata','Bachata'),entry('bolero','Boléro'),entry('latin-jazz','Latin jazz'),entry('tango','Tango')]},
 {id:'brazil',label:'Musiques brésiliennes',styles:[entry('bossa','Bossa nova',['bossa']),entry('samba','Samba'),entry('mpb','Chanson brésilienne (MPB)',['mpb']),entry('choro','Choro')]},
 {id:'afro-caribbean',label:'Afrique et Caraïbes',styles:[entry('afrobeat','Afrobeat'),entry('afrobeats','Afrobeats'),entry('rumba','Rumba congolaise',['rumba']),entry('soukous','Soukous'),entry('makossa','Makossa'),entry('zouk','Zouk'),entry('kompa','Kompa / compas',['kompa','konpa','compas']),entry('reggae','Reggae'),entry('dancehall','Dancehall')]},
 {id:'classical',label:'Classique / musique de film',styles:[entry('classical','Classique'),entry('romantic','Romantique'),entry('impressionist','Impressionniste'),entry('film','Musique de film'),entry('minimalist','Minimaliste')]},
 {id:'electronic',label:'Hip-hop / musiques électroniques',styles:[entry('hiphop','Hip-hop',['hip hop']),entry('lofi','Lo-fi',['lofi','lo fi']),entry('house','House'),entry('ambient','Ambient'),entry('electro','Électro')]},
 {id:'folk',label:'Folk et autres traditions',styles:[entry('folk','Folk'),entry('country','Country'),entry('flamenco','Flamenco'),entry('celtic','Celtique')]},
];
export const harmonyColors=[
 {id:'warm',label:'Chaleureux',aliases:['chaleureuse','chaleureuses'],profile:'ccm',detail:'Des accords suspendus et des couleurs douces.'},
 {id:'airy',label:'Aéré',aliases:['aerienne','aerien','aeree'],profile:'ccm',detail:'La palette douce, avec la mélodie et les accords tenus.'},
 {id:'jazzy',label:'Jazzy',aliases:['jazze'],profile:'jazz',detail:'La palette jazz, avec des accords enrichis.'},
 {id:'tension',label:'Plus de tension',aliases:['tendu','tendue'],profile:'jazz',passages:true,detail:'La palette jazz et des préparations vers les accords suivants.'},
 {id:'simple',label:'Sobre',aliases:['epure','simple','discret'],passages:false,detail:'Des accords tenus, sans accords de passage.'},
 {id:'bright',label:'Lumineux',aliases:['lumineuse']},
 {id:'melancholy',label:'Mélancolique',aliases:['nostalgique']},
 {id:'dark',label:'Sombre',aliases:['mysterieux','mysterieuse']},
 {id:'dreamy',label:'Rêveur',aliases:['reveuse','planant','planante']},
 {id:'bluesy',label:'Bluesy',aliases:[]},
 {id:'dramatic',label:'Dramatique',aliases:['cinematique']},
 {id:'meditative',label:'Méditatif',aliases:['meditative']},
];
const matches=(text,alias)=>{
 const a=plain(alias),t=plain(text);let i=t.indexOf(a);
 while(i>=0){
  if(!/[a-z0-9]/.test(t[i-1]||'')&&!/[a-z0-9]/.test(t[i+a.length]||'')&&!/(?:sans|pas de|pas du|evite le)\s*$/.test(t.slice(0,i)))return true;
  i=t.indexOf(a,i+1);
 }
 return false;
};
export function findHarmonyStyle(text){
 const found=harmonyStyleFamilies.flatMap(f=>f.styles).flatMap(s=>s.aliases.map(a=>({s,a})))
  .sort((a,b)=>b.a.length-a.a.length).filter(({a})=>matches(text,a));
 // « Salsa avec des couleurs jazz » reste une demande de salsa. Une palette
 // disponible ne doit pas masquer une autre demande qui ne l'est pas.
 return (found.find(({s})=>!s.profile)||found[0])?.s||null;
}
export const findHarmonyColors=text=>harmonyColors.filter(c=>[c.label,...c.aliases].some(a=>matches(text,a)));
export function withoutStyleWords(text,custom){
 // Seule la demande compilée pour le moteur est normalisée. La demande exacte
 // et les préférences restent conservées intégralement dans le brief/mémoire.
 const aliases=[...harmonyStyleFamilies.flatMap(f=>[f.label,...f.styles.flatMap(s=>s.aliases)]),'jazz','gospel',custom].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const a of aliases){
  const escaped=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  text=text.replace(new RegExp(`(?<![\\p{L}0-9])${escaped}(?![\\p{L}0-9])`,'giu'),'');
 }
 return text;
}
