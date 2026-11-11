/** Une batterie de démo appartient à sa lecture, jamais au lecteur suivant. */
export function bindPlaybackDrums({player,drumLoop,metronome=()=>null,enabled=()=>false,onChange=()=>{}}) {
  let kit=null;
  function release(forget=false) {
    if(forget)kit=null;
    // Le pianiste a pu démarrer le métronome explicitement pendant la lecture.
    if(!metronome()?.isRunning())drumLoop.stop();
  }
  function sync() {
    if(metronome()?.isRunning())return;
    if(!kit||!enabled()||!player.isPlaying()){drumLoop.stop();return;}
    void drumLoop.start({...kit,rate:player.rate(),getBeat:()=>player.position(),getSyncPoint:()=>player.syncPoint()}).then(onChange,onChange);
  }
  const play=player.play.bind(player);
  player.play=(...args)=>{
    // Une nouvelle écoute part sans métronome et oublie le kit de la précédente.
    metronome()?.stop();kit=null;drumLoop.stop();
    return play(...args);
  };
  for(const method of ['stop','pause']){
    const inner=player[method].bind(player);
    player[method]=(...args)=>{const result=inner(...args);release(method==='stop');return result;};
  }
  for(const method of ['resume','seek','setRate']){
    const inner=player[method].bind(player);
    player[method]=(...args)=>{const result=inner(...args);sync();return result;};
  }
  return {sync,end:()=>release(true),setKit:(name,tempo)=>{kit=name?{kit:name,tempo}:null;sync();}};
}
