import {lastPlayingTake} from './take-attachment.js';
import {extractKey} from './intent-classifier.js';
/** Adapte la session confiée au même format que les prises, sans modifier la source. */
export function personalContext(context) {
  const session = context?.playing?.session || (context?.type === 'session' ? context : null);
  if (!session?.events?.length || context?.type !== 'session' && context?.playing?.passage?.events?.length) return context;
  const offset = Number(session.offset) || 0;
  const events = session.events.map(e => ({...e, ...((e.type === 'note_on' || e.type === 'note_off') ? {note:e.note + offset} : {})}));
  const parsed=extractKey(`en ${session.key||''}`);
  const heardKey=parsed&&offset?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'][((parsed.rootPc+offset)%12+12)%12]+(parsed.minor?' mineur':' majeur'):session.key;
  const take = {...session, key:heardKey, offset:0, events, duration:Math.max(Number(session.duration)||0, ...events.map(e => Number(e.time)||0))};
  return {...context, playing:{...context?.playing, passage:take}};
}

export function samePlayingSource(a, b) {
  return Boolean(a?.events?.length && b?.events?.length && JSON.stringify(a.events) === JSON.stringify(b.events));
}

/** Rouvre le jeu de cette conversation sans remplacer un contexte actif explicite. */
export function restoreConversationPlaying(context,messages=[]) {
  if(context?.type&&context.type!=='autonomous')return context;
  if(context?.playing?.passage?.events?.length||context?.playing?.session?.events?.length)return context;
  const take=lastPlayingTake(messages);
  return take?{...(context||{type:'autonomous'}),playing:{...context?.playing,passage:take}}:context;
}
