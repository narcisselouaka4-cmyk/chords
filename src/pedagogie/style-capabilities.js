// Reconnaître un motif et convertir un arrangement dans un genre sont deux capacités.
// Aucun arrangeur de genre n'est actuellement validé sur une prise personnelle.
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'").toLowerCase();
const STYLES=[['bossa nova',/\bbossa(?: nova)?\b/],['salsa',/\bsalsa\b/],['montuno',/\bmontuno\b/],
 ['merengue',/\bmerengue\b/],['gospel',/\bgospel\b/],['worship',/\bworship\b/],['jazz',/\bjazz\b/],
 ['néo-soul',/\bneo[- ]?soul\b/],['R&B',/\br\s*(?:&|and|n)\s*b\b/],['funk',/\bfunk\b/],
 ['blues',/\bblues\b/],['swing',/\bswing\b/],['classique',/\bclassique\b/],['pop',/\bpop\b/],
 ['rock',/\brock\b/],['reggae',/\breggae\b/],['zouk',/\bzouk\b/],['compas',/\b(?:compas|konpa)\b/],
 ['bachata',/\bbachata\b/],['rumba',/\brumba\b/]];

export function requestedPersonalStyle(message) {
 const text=plain(message);
 if(/\b(?:explique|apprends|definis)|c'est quoi|qu'est.ce que|quoi comme (?:style|genre)|quel.*style|(?:detect|identif|reconn).*(?:style|genre)/.test(text))return null;
 const cue=/\b(?:version|style|facon|maniere|en mode|a la)\s+(?:de\s+|du\s+)?([^.!?\n,]+)/.exec(text)
   ||/\ben\s+([^.!?\n,]+)/.exec(text);
 if(!cue)return null;
 const found=STYLES.find(([,re])=>re.test(cue[1]));
 if(!found){
   const target=cue[1].trim().replace(/\s+(?:de ma|de mon|pour|avec|sans)\b.*$/,'');
   if(/^(?:(?:de|du)\s+)?(?:mon|ma|mes|ton|ta|tes|notre|votre|ce|cet|cette|musique|jeu|accompagnement|voicing)\b/.test(target))return null;
   if(/\b(?:enrich\w*|simpl\w*|douc\w*|lent\w*|ralenti\w*|rapid\w*|acceler\w*|autre\w*|different\w*|original\w*|arpeg\w*|plaqu\w*|rythm\w*|drop|accord[- ]melodie|suivant\w*|prochain\w*|contre[- ]?temps|syncope\w*|rootless|quartal|transpos\w*|tonalite|majeur|mineur)\b/.test(target)
     ||/^(?:do|re|mi|fa|sol|la|si|[a-g])(?:[#b♯♭]|$)/.test(target))return null;
   if(/^[a-z-]+(?: [a-z-]+){0,2}$/.test(target)
     &&/\b(?:joue|jouer|rejoue|fais|faire|propose|transforme|adapte|arrange|version)\b/.test(text))return target;
   return null;
 }
 if(new RegExp(`(?:pas|sans|evite)\\s+(?:de |du |la |une version |un style )?${found[1].source.replace(/^\\b|\\b$/g,'')}`).test(text))return null;
 if(!/\b(?:joue|jouer|rejoue|rejouer|fais|faire|propose|donne|transforme|transformer|adapte|adapter|arrange|arranger|ameliore|enrichis|version)\b/.test(text)
   && !/^(?:et\s+)?(?:en\s+|version\s+|style\s+)/.test(text))return null;
 return found[0];
}

export function personalStyleCapabilityAnswer({message,context}) {
 const requested=requestedPersonalStyle(message);
 if(!requested||!context?.playing?.passage?.events?.length)return null;
 return {ok:true,
  content:`Je ne peux pas encore transformer ta prise en une vraie version ${requested}. Cela demande aussi un rythme et un accompagnement propres à ce style.\n\nJe peux enrichir tes accords en gardant ton rythme, ou t’expliquer une façon de travailler ce style.`,
  toolResult:{played:[],ignored:0,suggestions:[],example:null,voicing:null,
   styleCapability:{requested,status:'unavailable',scope:'personal-arrangement'}},
  suggestedActions:[{label:'Enrichir mes accords',message:'Enrichis mes accords en gardant mon rythme.'},
   {label:'Comprendre ce style',message:`Explique-moi simplement comment accompagner dans le style ${requested}.`}],autoplay:false};
}
