// Une palette harmonique demandée, pas une promesse d'arranger tout un genre.
const plain=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function melodyColorProfile(message){
 const t=plain(message),matches=[...t.matchAll(/\bccm\b|\b(?:christian contemporary|contemporary christian) music\b|couleurs? jazz\b/g)];
 const last=matches.at(-1);if(!last)return null;
 return /(?:sans|pas de|oublie le|plus de)\s*$/.test(t.slice(0,last.index))?null:/jazz/.test(last[0])?'jazz':'ccm';
}
