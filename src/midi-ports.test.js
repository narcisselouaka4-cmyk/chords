// [Claude] — 2026-10-02 — « Connecté » doit vouloir dire connecté (midi-ports.js).
// Scénarios de Narcisse : synthé « Connecté » mais muet jusqu'à débrancher et
// rebrancher. Les décisions pures, puis une simulation du scan d'electron/main.js
// avec un faux système MIDI (ports qui changent de numéro, notre port virtuel…).
import {
  OWN_PORT_NAME, baseName, isHardwarePort, pickPreferredInput, decideInputAction, createInputWatcher,
} from './midi-ports.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const THROUGH = 'Midi Through:Midi Through Port-0 14:0';
const SYNTH = 'Digital Piano:Digital Piano MIDI 1 20:0';
const SYNTH_BACK = 'Digital Piano:Digital Piano MIDI 1 24:0';
const OWN = `RtMidi Output Client:${OWN_PORT_NAME} 129:0`;
const OTHER = 'Arturia KeyStep 32:Arturia KeyStep 32 MIDI 1 28:0';

console.log('Noms et ports');
check('baseName retire le numéro ALSA', baseName(SYNTH) === 'Digital Piano:Digital Piano MIDI 1' && baseName(SYNTH_BACK) === baseName(SYNTH));
check('baseName laisse un nom Windows intact', baseName('Digital Piano') === 'Digital Piano');
check('Midi Through n\'est pas un clavier', !isHardwarePort(THROUGH));
check('notre port virtuel n\'est pas un clavier (il contient « piano »)', !isHardwarePort(OWN) && !isHardwarePort(`Port virtuel « ${OWN_PORT_NAME} »`));
check('un client RtMidi quelconque n\'est pas un clavier', !isHardwarePort('RtMidi Input Client:RtMidi 130:0'));
check('le synthé est un clavier', isHardwarePort(SYNTH) && isHardwarePort('CASIO USB-MIDI:CASIO USB-MIDI MIDI 1 24:0'));
check('choix d\'office : jamais notre port ni Midi Through', pickPreferredInput([{ id: 0, name: THROUGH }, { id: 1, name: OWN }]) === null);
check('choix d\'office : le synthé', pickPreferredInput([{ id: 0, name: THROUGH }, { id: 1, name: OWN }, { id: 2, name: SYNTH }])?.id === 2);
check('choix d\'office : un « piano » passe devant une interface USB générique',
  pickPreferredInput([{ id: 0, name: 'USB MIDI Interface 20:0' }, { id: 1, name: SYNTH_BACK }])?.id === 1);

console.log('Décisions');
const d = (open, inputs, wanted = null) => decideInputAction({ open, inputs, wanted });
let r = d(null, [{ id: 0, name: THROUGH }, { id: 1, name: SYNTH }, { id: 2, name: OWN }]);
check('démarrage : ouvre le synthé', r.action === 'open' && r.port.id === 1, JSON.stringify(r));
r = d({ id: 1, name: SYNTH }, [{ id: 0, name: THROUGH }, { id: 1, name: SYNTH_BACK }]);
check('synthé ré-énuméré (même place, autre numéro) : ROUVRIR', r.action === 'reopen' && r.port.id === 1, JSON.stringify(r));
r = d({ id: 1, name: SYNTH }, [{ id: 0, name: THROUGH }, { id: 1, name: OTHER }, { id: 2, name: SYNTH }]);
check('le synthé a changé de place : réindexer sans couper', r.action === 'reindex' && r.port.id === 2, JSON.stringify(r));
r = d({ id: 1, name: SYNTH }, [{ id: 0, name: THROUGH }, { id: 1, name: SYNTH }]);
check('rien n\'a changé : garder', r.action === 'keep');
r = d({ id: 1, name: SYNTH }, [{ id: 0, name: THROUGH }, { id: 1, name: OWN }]);
check('synthé débranché : perdu (même si un port prend sa place)', r.action === 'lost', JSON.stringify(r));
r = d({ id: 1, name: OWN }, [{ id: 0, name: THROUGH }, { id: 1, name: OWN }, { id: 2, name: SYNTH }]);
check('branché sur notre propre port (ancien défaut) : passer au synthé', r.action === 'switch' && r.port.id === 2, JSON.stringify(r));
r = d({ id: 0, name: THROUGH }, [{ id: 0, name: THROUGH }, { id: 1, name: SYNTH }], THROUGH);
check('Midi Through choisi à la main : on le garde', r.action === 'keep');
r = d({ id: 2, name: OTHER }, [{ id: 0, name: THROUGH }, { id: 1, name: SYNTH_BACK }, { id: 2, name: OTHER }], SYNTH);
check('le clavier choisi à la main revient : on y retourne', r.action === 'switch' && r.port.id === 1, JSON.stringify(r));
r = d(null, [{ id: 0, name: THROUGH }, { id: 1, name: OWN }]);
check('aucun clavier : ne rien ouvrir', r.action === 'none');
r = d({ id: 0, name: 'Digital Piano' }, [{ id: 0, name: 'Digital Piano' }]);
check('nom sans numéro (Windows) : garder', r.action === 'keep');

console.log('Simulation du scan (faux système MIDI)');
function fakeSystem(names) {
  const sys = { ports: [...names], opened: null, opens: 0, closes: 0, events: [] };
  sys.watcher = createInputWatcher({
    listPorts: () => sys.ports.map((name, id) => ({ id, name })),
    openPort: (id) => {
      const name = sys.ports[id];
      if (name === undefined) return { success: false, error: 'absent' };
      sys.opened = name;
      sys.opens += 1;
      return { success: true, name };
    },
    closePort: () => { sys.opened = null; sys.closes += 1; },
    notify: (type, data) => sys.events.push({ type, data }),
  });
  return sys;
}

let sys = fakeSystem([THROUGH, SYNTH]);
sys.watcher.tick('startup');
check('démarrage : connecté au synthé', sys.opened === SYNTH && sys.watcher.status().connected && sys.watcher.status().name === SYNTH);
// Veille du PC : au réveil, le synthé est revenu sous un autre numéro, à la même place.
sys.ports = [THROUGH, SYNTH_BACK];
sys.watcher.tick();
check('après la veille : la connexion est ROUVERTE (avant : « Connecté » mais muet)', sys.opened === SYNTH_BACK && sys.opens === 2 && sys.closes === 1);
check('l\'interface est prévenue (connected, reopen)', sys.events.some((e) => e.type === 'connected' && e.data.reason === 'reopen'));

sys = fakeSystem([THROUGH, OWN]);
sys.watcher.tick('startup');
check('seul notre port virtuel : on ne s\'écoute pas soi-même', sys.opened === null && !sys.watcher.status().connected);
sys.ports = [THROUGH, SYNTH, OWN];
sys.watcher.tick();
check('le synthé arrive : il est ouvert d\'office', sys.opened === SYNTH);
sys.ports = [THROUGH, OWN];
sys.watcher.tick();
check('synthé débranché : « perdu », et pas de repli sur notre port', sys.opened === null && sys.events.some((e) => e.type === 'lost'));
sys.ports = [THROUGH, SYNTH_BACK, OWN];
sys.watcher.tick();
check('rebranché : rouvert', sys.opened === SYNTH_BACK);

sys = fakeSystem([THROUGH, SYNTH, OTHER]);
sys.watcher.tick('startup');
const chosen = sys.watcher.choose(2);
check('choix à la main : ouvert et retenu', chosen.success && sys.opened === OTHER && sys.watcher.status().manual);
sys.watcher.tick();
check('le scan suivant garde le choix à la main', sys.opened === OTHER);

sys = fakeSystem([THROUGH, SYNTH]);
sys.watcher.tick('startup');
const opensBefore = sys.opens;
const after = sys.watcher.reconnect();
check('« Reconnecter » : fermé puis rouvert, sans débrancher', after.connected && sys.opens === opensBefore + 1 && sys.closes === 1);
sys.ports = [THROUGH];
const gone = sys.watcher.reconnect();
check('« Reconnecter » sans clavier : l\'interface apprend la perte', !gone.connected && sys.events.some((e) => e.type === 'lost'));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
