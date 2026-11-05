/** Adapte la session confiée au même format que les prises, sans modifier la source. */
export function personalContext(context) {
  const session = context?.playing?.session || (context?.type === 'session' ? context : null);
  if (!session?.events?.length || context?.type !== 'session' && context?.playing?.passage?.events?.length) return context;
  const offset = Number(session.offset) || 0;
  const events = session.events.map(e => ({...e, ...((e.type === 'note_on' || e.type === 'note_off') ? {note:e.note + offset} : {})}));
  const take = {...session, offset:0, events, duration:Math.max(Number(session.duration)||0, ...events.map(e => Number(e.time)||0))};
  return {...context, playing:{...context?.playing, passage:take}};
}

export function samePlayingSource(a, b) {
  return Boolean(a?.events?.length && b?.events?.length && JSON.stringify(a.events) === JSON.stringify(b.events));
}
