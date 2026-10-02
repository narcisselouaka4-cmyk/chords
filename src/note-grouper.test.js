// [Claude] — 2026-10-02 — Grace notes (src/note-grouper.js) : le Ré frotté vers le Mi
// d'un Cmaj7 ne compte pas dans l'accord ; un vrai Ré, un cluster ou un accord plaqué
// staccato, si. Temps simulé (performance.now remplacé), aucun DOM.
import { createNoteGrouper, isGraceNote, GRACE_MAX_MS } from './note-grouper.js';

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✅ ${label}`); } else { failed += 1; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

let clock = 0;
globalThis.performance = { now: () => clock };

/** Rejoue une suite d'événements [ms, 'on'|'off', note, sustained?] et rend le groupe retenu. */
function play(events, { flushAt = null } = {}) {
  clock = 0;
  let group = null;
  const grouper = createNoteGrouper({ toleranceMs: 200, onGroupReady: (g) => { group = g.map((n) => n.note).sort((a, b) => a - b); } });
  for (const [t, kind, note, sustained = false] of events) {
    clock = t;
    if (kind === 'on') grouper.noteOn(note);
    else grouper.noteOff(note, { sustained });
  }
  clock = flushAt ?? events[events.length - 1][0] + 200;
  grouper.flush();
  grouper.clear();
  return group?.join(' ') ?? null;
}

const C = 60; const D = 62; const E = 64; const G = 67; const B = 71; const DS = 63;

console.log('Grace notes');
check('Cmaj7 + Ré frotté (60 ms) vers le Mi : le Ré sort de l\'accord',
  play([[0, 'on', C], [5, 'on', G], [8, 'on', B], [10, 'on', D], [70, 'off', D], [75, 'on', E]]) === '60 64 67 71');
check('… idem quand le Mi est enfoncé avant que le Ré se relève',
  play([[0, 'on', C], [5, 'on', G], [8, 'on', B], [10, 'on', D], [55, 'on', E], [80, 'off', D]]) === '60 64 67 71');
check('… idem pédale enfoncée (le Ré sonne encore)',
  play([[0, 'on', C], [5, 'on', G], [8, 'on', B], [10, 'on', D], [70, 'off', D, true], [75, 'on', E]]) === '60 64 67 71');
check('Ré tenu 400 ms puis Mi : vraie note, gardée',
  play([[0, 'on', C], [5, 'on', G], [8, 'on', B], [10, 'on', D], [150, 'on', E], [410, 'off', D]], { flushAt: 600 }) === '60 62 64 67 71');
check('cluster Do Ré Mi Sol plaqué staccato : tout est gardé',
  play([[0, 'on', C], [6, 'on', D], [10, 'on', E], [14, 'on', G], [110, 'off', C], [112, 'off', D], [114, 'off', E], [116, 'off', G]]) === '60 62 64 67');
check('Cmaj7 plaqué staccato : tout est gardé',
  play([[0, 'on', C], [4, 'on', E], [8, 'on', G], [12, 'on', B], [100, 'off', C], [100, 'off', E], [100, 'off', G], [100, 'off', B]]) === '60 64 67 71');
check('C7♯9 : Ré♯ tenu avec le Mi, gardé',
  play([[0, 'on', C], [4, 'on', E], [8, 'on', 70], [12, 'on', DS + 12]]) === '60 64 70 75');
check('Ré♯ frotté vers le Mi (demi-ton) : retiré',
  play([[0, 'on', C], [5, 'on', G], [8, 'on', B], [10, 'on', DS], [60, 'off', DS], [70, 'on', E]]) === '60 64 67 71');
check('Ré lâché, Mi joué bien plus tard (300 ms) : pas une grace note',
  !isGraceNote({ note: D, onTime: 0, keyOffTime: 100 }, [{ note: E, onTime: 400, keyOffTime: null }]));
check('note encore tenue : jamais une grace note', !isGraceNote({ note: D, onTime: 0, keyOffTime: null }, [{ note: E, onTime: 50, keyOffTime: null }]));
check(`seuil : touche tenue plus de ${GRACE_MAX_MS} ms → gardée`,
  !isGraceNote({ note: D, onTime: 0, keyOffTime: GRACE_MAX_MS + 10 }, [{ note: E, onTime: 120, keyOffTime: null }]));
check('voisine trop éloignée (tierce) : gardée', !isGraceNote({ note: C, onTime: 0, keyOffTime: 60 }, [{ note: E, onTime: 70, keyOffTime: null }]));

console.log(`\n=== Résultat : ${passed}/${passed + failed} contrôles passés ===`);
if (failed) process.exit(1);
