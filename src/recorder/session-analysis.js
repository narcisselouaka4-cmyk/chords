// [Claude] — 2026-09-24 — Découpage harmonique refait (Narcisse : « les accords
// détectés et affichés ne sont pas toujours les bons […] il faut vraiment
// corriger cette détection »). L'ancien découpage ne formait un accord qu'avec
// des notes attaquées ensemble, sur deux octaves au plus : un accord à deux
// mains (C2 G2 | E4 G4 B4 D5) passait pour de la mélodie, une basse tenue
// pendant que la main droite changeait d'accord était oubliée, une note de
// mélodie jouée juste après l'accord y était avalée ; et le nom affiché venait
// du `fullName` du moteur, sans fondamentale (« Major 9 »).
//
// Désormais, à chaque attaque (notes à moins de 90 ms l'une de l'autre, accord
// roulé compris), l'accord est lu sur ce qui sonne : les touches tenues, plus la
// basse gardée par la pédale (frappée pendant la pression en cours, sous tout le
// reste). Une note seule attaquée au-dessus de tout (mélodie) ne change pas
// l'accord ; une nouvelle basse ou une voix intérieure, si. Un même accord
// rejoué prolonge son segment ; un arpège lent complète l'accord qu'il forme.
// Nom : nameMidiChord (fondamentale, qualité de l'application, basse).

import { MIN_SIMULTANEOUS, CONJUNCT_INTERVAL_SEMITONES } from '../note-grouper.js';
import { nameMidiChord } from './midi-chord-namer.js';

// Écart maximal entre deux attaques d'un même accord (s), accord roulé compris.
const CLUSTER_GAP = 0.09;
// Lecture de ce qui sonne juste après la dernière attaque (s).
const HOLD_EPSILON = 0.03;
// Un arpège lent complète son accord pendant ce délai après sa dernière note (s).
const ARPEGGIO_WINDOW = 0.6;
// Une note frappée sous Do3 est une nouvelle basse : elle remplace celle que garde la pédale.
const NEW_BASS_BELOW = 48;
// Une note seule est de la mélodie si elle est au moins à cette distance au-dessus
// de la basse de l'accord tenu, avec au moins MELODY_MIN_BELOW notes de l'accord
// en dessous d'elle.
//
// L'ancien critère — « la note jouée est le sommet de TOUT ce qui sonne » — rate
// la ligne legato : une note attaquée pendant que la précédente sonne encore
// au-dessus n'était pas reconnue, et ouvrait un accord. Mesuré sur Session_017
// de Narcisse : son mi mineur (Mi3 + Mi4 tenus, ligne descendante Si4 → La4 →
// Sol4) était coupé en trois, « Esus4 » puis « Emadd11 », parce que le La4
// (8,78 s) sonne sous le Si4 encore tenu et le Sol4 (9,38 s) sous le La4.
//
// Le critère géométrique garde les trois comportements à ne pas casser : une
// nouvelle basse n'a aucune note de l'accord en dessous d'elle, une voix
// intérieure n'en a qu'une, une note de mélodie en a au moins deux.
const MELODY_ABOVE_BASS = 7;
const MELODY_MIN_BELOW = 2;
// Deux notes attaquées à moins de CLUSTER_GAP mais distantes d'un ton ou moins :
// c'est un trait rapide, pas un intervalle plaqué. Mesuré sur Session_019 de
// Narcisse : Ré5 et Mi5 à 88 ms d'écart (sous les 90 ms du groupement) ouvraient
// un « Em7/G » au milieu d'un arpège.
const MELODY_RUN_INTERVAL = 2;
// Un accord roulé peut dépasser CLUSTER_GAP : sa dernière note le complète si
// elle arrive dans ce délai, près du sommet de l'accord, et que tout l'accord
// sonne encore. Mesuré : son Ré♭7 de 41,5 s est roulé sur 197 ms, et le Si4 —
// la septième — arrivait 158 ms après le reste, donc hors grappe. L'accord
// s'affichait « Db » au lieu de « Db7 ».
const ROLL_WINDOW = 0.25;
// … « près du sommet » : au-delà, c'est une note de mélodie jouée juste après
// l'accord (un Ré5 deux octaves au-dessus d'un Do3-Mi3-Sol3 n'en fait pas un Cadd9).
const ROLL_NEAR_TOP = 12;
// Durée au-delà de laquelle une note plaquée avec l'accord n'est plus un ornement
// mais fait partie de l'harmonie.
const ORNAMENT_MAX_DURATION = 0.2;

// Garde-fou "gamme sous pédale" — même logique que note-grouper.js (voir son commentaire) :
// un vrai accord n'a jamais TOUTES ses notes voisines d'un ton/demi-ton une fois triées par
// hauteur ; une gamme ou un trait conjoint, si.
function isMelodicRun(group) {
  if (group.length < MIN_SIMULTANEOUS) return false;
  const byPitch = group.map((w) => w.note).sort((a, b) => a - b);
  for (let i = 1; i < byPitch.length; i++) {
    if (byPitch[i] - byPitch[i - 1] > CONJUNCT_INTERVAL_SEMITONES) return false;
  }
  return true;
}

export function buildNoteWindows(events) {
  const noteOnMap = new Map();
  const sustainEvents = [];
  const noteWindows = [];

  for (const ev of events) {
    if (ev.type === 'note_on' && ev.velocity > 0) {
      const key = `${ev.channel}:${ev.note}`;
      const existing = noteOnMap.get(key);
      if (existing && existing.offTime !== null) {
        noteWindows.push({
          note: existing.note,
          channel: existing.channel,
          velocity: existing.velocity,
          onTime: existing.onTime,
          offTime: existing.offTime,
        });
        noteOnMap.set(key, { note: ev.note, channel: ev.channel, velocity: ev.velocity, onTime: ev.time, offTime: null });
      } else if (!existing) {
        noteOnMap.set(key, { note: ev.note, channel: ev.channel, velocity: ev.velocity, onTime: ev.time, offTime: null });
      }
    } else if ((ev.type === 'note_off' || (ev.type === 'note_on' && ev.velocity === 0)) && ev.note != null) {
      const key = `${ev.channel}:${ev.note}`;
      const window = noteOnMap.get(key);
      if (window && window.offTime === null) {
        window.offTime = ev.time;
      }
    } else if (ev.type === 'control' && ev.controller === 64) {
      sustainEvents.push({ time: ev.time, value: ev.value, channel: ev.channel });
    }
  }

  for (const [, window] of noteOnMap) {
    if (window.offTime !== null || window.onTime !== undefined) {
      noteWindows.push({
        note: window.note,
        channel: window.channel,
        velocity: window.velocity,
        onTime: window.onTime,
        offTime: window.offTime !== null ? window.offTime : window.onTime + 0.1,
      });
    }
  }

  sustainEvents.sort((a, b) => a.time - b.time);

  const sustainIntervals = [];
  let sustainStart = null;
  for (const se of sustainEvents) {
    if (se.value >= 64 && sustainStart === null) {
      sustainStart = se.time;
    } else if (se.value < 64 && sustainStart !== null) {
      sustainIntervals.push({ start: sustainStart, end: se.time, channel: se.channel });
      sustainStart = null;
    }
  }
  if (sustainStart !== null) {
    sustainIntervals.push({ start: sustainStart, end: Infinity, channel: sustainEvents[sustainEvents.length - 1].channel });
  }

  for (const window of noteWindows) {
    // Relâchement de la touche, avant la pédale : c'est lui qui dit ce que la main tient.
    window.keyOffTime = window.offTime;
    if (window.offTime !== null && isFinite(window.offTime)) {
      for (const si of sustainIntervals) {
        if (si.channel === window.channel && window.offTime >= si.start && window.offTime <= si.end) {
          window.offTime = si.end;
          break;
        }
      }
    }
  }

  noteWindows.sort((a, b) => a.onTime - b.onTime);
  return noteWindows;
}

function createMelodySegments(noteWindows, chordWindows) {
  const melodyNotes = noteWindows.filter((w) => !chordWindows.has(w));
  if (melodyNotes.length === 0) return [];

  const segments = [];
  let currentSegment = [];

  for (const w of melodyNotes) {
    if (currentSegment.length === 0) {
      currentSegment.push(w);
    } else {
      const prev = currentSegment[currentSegment.length - 1];
      if (w.onTime - prev.offTime < 0.5) {
        currentSegment.push(w);
      } else {
        segments.push({
          type: 'melody',
          start: currentSegment[0].onTime,
          end: currentSegment[currentSegment.length - 1].offTime,
          notes: currentSegment.map((x) => x.note),
        });
        currentSegment = [w];
      }
    }
  }
  if (currentSegment.length > 0) {
    segments.push({
      type: 'melody',
      start: currentSegment[0].onTime,
      end: currentSegment[currentSegment.length - 1].offTime,
      notes: currentSegment.map((x) => x.note),
    });
  }
  return segments;
}

/** Attaques rapprochées (moins de CLUSTER_GAP entre deux notes) : un accord, même roulé. */
export function clusterAttacks(windows) {
  const clusters = [];
  for (const w of windows) {
    const last = clusters[clusters.length - 1];
    if (last && w.onTime - last[last.length - 1].onTime <= CLUSTER_GAP) last.push(w);
    else clusters.push([w]);
  }
  return clusters;
}

/** Instants où la pédale est enfoncée (valeur ≥ 64 après un relâchement). */
function pedalPresses(events) {
  const presses = [];
  let down = false;
  for (const ev of events) {
    if (ev.type !== 'control' || ev.controller !== 64) continue;
    const on = ev.value >= 64;
    if (on && !down) presses.push(ev.time);
    down = on;
  }
  return presses;
}

/**
 * Découpe une session en accords et passages mélodiques (voir l'en-tête).
 * @returns {{type: 'chord'|'melody', start: number, end: number, notes: number[], chordName?: string, rootPc?: number, symbol?: string, bassPc?: number}[]}
 */
export function segmentSessionEvents(events) {
  if (!events || events.length === 0) return [];

  const sortedEvents = [...events].sort((a, b) => a.time - b.time);
  const windows = buildNoteWindows(sortedEvents);
  const presses = pedalPresses(sortedEvents);
  // Pression de pédale en cours à l'instant t (la dernière avant t), ou null.
  const pressBefore = (t) => {
    let found = null;
    for (const p of presses) if (p <= t) found = p;
    return found;
  };
  const chordWindows = new Set();
  const chordSegments = [];
  let current = null;
  // Début d'un accord qui se forme mais n'est pas encore nommable (voir plus bas).
  let pendingStart = null;

  for (const cluster of clusterAttacks(windows)) {
    const start = cluster[0].onTime;
    const lastAttackTime = cluster[cluster.length - 1].onTime;
    const t = lastAttackTime + HOLD_EPSILON;
    // Ce que la main tient : touches enfoncées (et les notes qu'on vient d'attaquer).
    const held = windows.filter((w) => w.onTime <= t && (cluster.includes(w) || w.keyOffTime > t));
    const lowestHeld = Math.min(...held.map((w) => w.note));
    // La basse gardée par la pédale : frappée pendant la pression en cours, sous
    // tout le reste. Sauf si la main gauche frappe elle-même une nouvelle basse
    // (sous Do3) : l'ancienne ne fait que traîner sous la pédale (Dm9 → G13
    // pédale tenue : Ré2 sonne encore, mais l'accord joué est G13, pas G13/D).
    const press = pressBefore(t);
    const newBass = cluster.some((w) => w.note < NEW_BASS_BELOW);
    const pedalBass = press == null || newBass ? null : windows
      .filter((w) => !held.includes(w) && w.onTime >= press && w.onTime < start && w.offTime > t && w.note < lowestHeld)
      .sort((a, b) => a.note - b.note)[0] || null;
    const sounding = pedalBass ? [pedalBass, ...held] : held;
    const top = Math.max(...sounding.map((w) => w.note));
    // Une note seule au-dessus de tout, pendant un accord plaqué : c'est la mélodie.
    const single = cluster.length === 1;
    const arpeggioGrows = current?.arpeggio && single && start - current.lastAttack <= ARPEGGIO_WINDOW
      && current.windows.every((w) => sounding.includes(w));
    // Fin d'un accord roulé : la note tardive complète l'accord au lieu d'être
    // lue comme une mélodie (voir ROLL_WINDOW).
    const chordTop = current ? Math.max(...current.windows.map((w) => w.note)) : -Infinity;
    const chordBottom = current ? Math.min(...current.windows.map((w) => w.note)) : Infinity;
    const rollCompletes = Boolean(current) && single && !current.arpeggio
      && start - current.lastAttack <= ROLL_WINDOW
      && cluster[0].note > chordBottom
      && cluster[0].note - chordTop <= ROLL_NEAR_TOP
      && current.windows.every((w) => sounding.includes(w));
    const grows = arpeggioGrows || rollCompletes;
    // Mélodie au-dessus de l'accord tenu : soit elle domine tout ce qui sonne,
    // soit elle poursuit une ligne legato au-dessus du corps de l'accord.
    const isMelodyNote = (note) => {
      if (note === top) return true;
      if (!current) return false;
      const below = current.windows.filter((w) => w.note < note && w.offTime > t);
      if (below.length < MELODY_MIN_BELOW) return false;
      return note - Math.min(...below.map((w) => w.note)) >= MELODY_ABOVE_BASS;
    };
    // Un trait rapide peut poser deux notes dans la même grappe : elles restent
    // de la mélodie si elles sont conjointes et toutes deux au-dessus de l'accord.
    const melodicPair = cluster.length === 2
      && Math.abs(cluster[1].note - cluster[0].note) <= MELODY_RUN_INTERVAL
      && cluster.every((w) => isMelodyNote(w.note));
    if (current && !grows && ((single && isMelodyNote(cluster[0].note)) || melodicPair)) {
      // Une note de mélodie n'ouvre pas d'accord — mais elle peut tout de même
      // APPARTENIR à celui qui sonne. Les deux questions étaient confondues :
      // la note était écartée du segment en même temps qu'elle était écartée
      // d'un nouveau découpage, et le nom restait figé sur la grappe d'attaque.
      //
      // Mesuré sur Session_017 de Narcisse : son mi mineur (Mi3 Mi4 tenus, ligne
      // Si4 → La4 → Sol4) s'ouvre sur {Mi, La, Si} et s'affichait « Esus4 » pour
      // toujours, parce que le Sol4 de 9,38 s — la tierce — est de la mélodie.
      // Il dit : « ce n'est pas un suspendu, c'est un mineur ».
      //
      // On ne complète que les accords SANS TIERCE : la quarte suspendue, la
      // seconde, la coquille. Une note qui apporte la tierce absente fait partie
      // de l'harmonie ; si l'accord a déjà sa tierce, rien n'est touché, et un
      // vrai sus4 (dont aucune note du segment n'apporte de tierce) le reste.
      if (current.named?.thirdless) {
        const grown = [...new Set([...current.notes, ...cluster.map((w) => w.note)])];
        const renamed = nameMidiChord(grown);
        if (renamed && !renamed.thirdless) {
          cluster.forEach((w) => chordWindows.add(w));
          Object.assign(current, { notes: grown, name: renamed.name, named: renamed });
          current.end = Math.max(current.end, ...cluster.map((w) => w.offTime));
        }
      }
      continue;
    }
    if (cluster.length >= MIN_SIMULTANEOUS && isMelodicRun(cluster)) continue;
    const named = nameMidiChord(sounding.map((w) => w.note));
    if (!named) {
      // Moins de trois hauteurs : rien à nommer encore. Mais si cette attaque
      // apporte une note ÉTRANGÈRE à l'accord tenu, l'harmonie a changé — et
      // l'accord qui vient commence ICI, même s'il lui manque des notes.
      //
      // Narcisse joue ses accords en arpège et en octaves : son Si bémol de
      // Session_013 commence à 19,11 s (« à la 19e seconde »), mais n'atteint
      // trois hauteurs qu'à 20,94 s. Pendant ces 1,8 s aucun segment ne
      // s'ouvrait, et le Fa mineur précédent s'étirait par-dessus : « le si
      // bémol a été absorbé par le fa mineur ». Même histoire pour son mi bémol
      // de 33,46 s, avalé par le Bb7b9/F.
      //
      // On ne crée pas de segment vide : on retient seulement ce début, et le
      // prochain segment nommable le reprendra. Si aucun ne vient, rien n'a
      // bougé — l'accord tenu garde toute sa durée.
      if (current && pendingStart == null && !single) pendingStart = start;
      else if (current && pendingStart == null) {
        const heldPcs = new Set(current.notes.map((n) => ((n % 12) + 12) % 12));
        if (cluster.some((w) => !heldPcs.has(((w.note % 12) + 12) % 12))) pendingStart = start;
      }
      continue;
    }
    // Notes de l'accord attaquées depuis le précédent (début d'un arpège, basse
    // gardée par la pédale) : elles lui appartiennent, pas à une mélodie.
    // `lastAttack` est la DERNIÈRE attaque de la grappe précédente, pas la
    // première : un accord roulé s'étale sur plusieurs dizaines de millisecondes,
    // et ses notes tardives comptaient comme « attaquées depuis l'accord
    // précédent », donc appartenant au suivant — qui reculait alors son début
    // jusqu'à elles. Mesuré sur Session_019 de Narcisse : son Cmaj9 de 17,43 s
    // (C3 17,43 · D4 17,45 · G3 17,45 · B3 17,47 · E4 17,52) était écrasé à
    // 0,04 s parce que le Si3, tenu jusqu'à 19,58, faisait commencer le Ddim7
    // de 18,61 s à 17,47. Le Cmaj9 disparaissait ensuite comme transitoire, et
    // le Ddim7 s'affichait à la place d'un accord jamais joué là.
    const since = current ? current.lastAttack : -Infinity;
    const own = sounding.filter((w) => w.onTime > since || cluster.includes(w));
    own.forEach((w) => chordWindows.add(w));
    if (grows || (current && current.name === named.name)) {
      // Arpège ou accord roulé qui se complète, ou même accord rejoué : un seul segment.
      if (grows) Object.assign(current, { name: named.name, named, windows: sounding, attackNotes: sounding.map((w) => w.note) });
      current.lastAttack = lastAttackTime;
      current.notes = [...new Set([...current.notes, ...sounding.map((w) => w.note)])];
      current.end = Math.max(current.end, ...sounding.map((w) => w.offTime));
      pendingStart = null;
      continue;
    }
    // L'accord qui naît reprend le début retenu plus haut, et borne le précédent :
    // c'est là que l'harmonie a changé, pas à l'instant où elle devient lisible.
    if (current && pendingStart != null && pendingStart > current.start) {
      current.end = Math.min(current.end, pendingStart);
    }
    const bornAt = pendingStart != null ? pendingStart : start;
    pendingStart = null;
    current = {
      // Un accord né d'un arpège commence à sa première note.
      start: Math.min(bornAt, start, ...own.map((w) => w.onTime)),
      end: Math.max(...sounding.map((w) => w.offTime)),
      name: named.name,
      named,
      windows: sounding,
      notes: sounding.map((w) => w.note),
      attackNotes: sounding.map((w) => w.note),
      lastAttack: lastAttackTime,
      // Accord né d'une note seule (troisième note d'un arpège) : il peut encore se compléter.
      arpeggio: single,
    };
    chordSegments.push(current);
  }

  // Relâcher des notes ne crée pas un nouvel accord. Quand les notes du segment
  // suivant sont toutes déjà dans le précédent, c'est le même accord qui se
  // dégarnit — on garde le plus fourni. Mesuré sur Session_019 de Narcisse :
  // son Sol add9 (Sol Ré La Si) devenait « Gadd9 » puis « Gsus2 » dès que le Si
  // cessait de sonner, et son Do majeur 7 (Do Mi Sol Si) se coupait en
  // « Cmaj7/G » puis « Em/G ».
  const pcOf = (n) => ((n % 12) + 12) % 12;
  const bassOf = (seg) => Math.min(...seg.notes);
  for (let i = chordSegments.length - 1; i > 0; i -= 1) {
    const previous = chordSegments[i - 1];
    const current = chordSegments[i];
    const pcs = new Set(previous.notes.map(pcOf));
    if (current.notes.every((n) => pcs.has(pcOf(n)))) {
      previous.end = Math.max(previous.end, current.end);
      chordSegments.splice(i, 1);
      continue;
    }
    // Appoggiature plaquée AVEC l'accord : un segment très court, même basse que
    // le suivant, qui n'en diffère que par une note relâchée aussitôt. L'accord
    // joué est celui qui suit, et il commence à l'attaque. Mesuré sur
    // Session_017 de Narcisse : son la mineur de 10,46 s s'ouvrait sur un
    // « Amadd11 » de 0,15 s, le Ré4 étant relâché à l'arrivée du Mi4.
    const nextPcs = new Set(current.notes.map(pcOf));
    const foreign = previous.notes.filter((n) => !nextPcs.has(pcOf(n))).length;
    // Durée AFFICHÉE du segment (un accord s'arrête où le suivant commence), et
    // non sa durée sonore : les notes tenues sous la pédale débordent largement.
    const shown = Math.min(previous.end, current.start) - previous.start;
    if (shown < ORNAMENT_MAX_DURATION
        && bassOf(previous) === bassOf(current)
        && foreign <= 1) {
      current.start = Math.min(current.start, previous.start);
      chordSegments.splice(i - 1, 1);
    }
  }

  // Un accord s'arrête quand le suivant commence.
  const chords = chordSegments.map((seg, i) => {
    const next = chordSegments[i + 1];
    return {
      type: 'chord',
      start: seg.start,
      end: next ? Math.min(seg.end, next.start) : seg.end,
      notes: [...seg.notes].sort((a, b) => a - b),
      chordName: seg.name,
      rootPc: seg.named.rootPc,
      symbol: seg.named.symbol,
      bassPc: seg.named.bassPc,
      // Faux si aucun accord connu n'explique toutes les notes (note étrangère ?).
      matched: seg.named.matched !== false,
      // Notes attaquées ou tenues au début de l'accord (voicing joué), sans ce qui s'y ajoute ensuite.
      attackNotes: [...new Set(seg.attackNotes)].sort((a, b) => a - b),
    };
  });

  const melodySegments = createMelodySegments(windows, chordWindows);
  return [...chords, ...melodySegments].sort((a, b) => a.start - b.start);
}

/**
 * Nom des accords (déjà posé par segmentSessionEvents) ; `latin` = Do, Ré, Mi.
 * @param {object[]} segments
 * @param {{latin?: boolean}} [options]
 */
export function nameChordSegments(segments, { latin = false, spelling = 'auto' } = {}) {
  for (const seg of segments) {
    if (seg.type !== 'chord' || !seg.notes?.length) continue;
    // Déjà nommé par segmentSessionEvents : on ne renomme que si l'orthographe
    // demandée (latin, dièses) diffère de celle posée par défaut.
    if (seg.chordName && !latin && spelling === 'auto') continue;
    const named = nameMidiChord(seg.notes, { latin, spelling });
    seg.chordName = named?.name || seg.chordName || null;
  }
  return segments;
}
