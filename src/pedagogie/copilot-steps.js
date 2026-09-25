// [Claude] — 2026-09-25 — Pas à pas au clavier, à ton rythme.
//
// Narcisse a choisi : « Pas à pas, à mon rythme » (l'accord ou les notes allumés
// avec leur rôle ; je joue ; l'application vérifie et passe à la suite) et
// « Montrer tes erreurs ». Valable pour tout exemple du Copilote : un accord =
// une étape (notes ensemble) ; une gamme, un lick, un run, un arpège = des
// étapes de quelques notes à jouer dans l'ordre. Et pour le passage joué
// (« Essayer les suggestions ») : une étape par suggestion, avec la version
// proposée à rejouer quand l'application la connaît.
//
// Le jugement se fait à la classe de hauteur (une autre octave est acceptée et
// signalée) ; une note de l'accord ou une tension disponible jouée en plus est
// acceptée pour un accord ; une note étrangère ne l'est pas.
// [Claude] — 2026-09-25 — Ton « assistant, pas coach » : le retour propose
// (« Ajoute Do (7e) », « Essaie Fa à la place de Fa# »), il ne juge pas.

import { noteRoles, parseChordName } from './note-roles.js';
import { frenchPitchName, degreeWord } from './example-guide.js';

const pcOf = (n) => ((n % 12) + 12) % 12;
const SEQUENCE_SIZE = 4;

/** Marques d'un accord à jouer : rôle de chaque note (ou « à jouer »). */
function chordMarks(name, notes) {
  const roles = name ? noteRoles(name, notes) : [];
  if (roles.length) return roles.map((r) => ({ midi: r.midi, kind: r.kind, label: r.degree }));
  return notes.map((midi) => ({ midi, kind: 'target', label: frenchPitchName(midi) }));
}

/**
 * Étapes d'un exemple du Copilote (accords : une étape par accord ; notes : des
 * groupes de quelques notes dans l'ordre, un accord plaqué restant une étape).
 * @param {object} example - exemple de copilot-demo.js ({chords, events, steps})
 * @returns {{kind: 'chord'|'sequence', name: string|null, notes: number[], marks: object[], caption: string}[]}
 */
export function stepsFromExample(example) {
  if (!example) return [];
  if (example.chords?.length) {
    return example.chords.map((c, i) => {
      const notes = [...new Set([...(c.leftHand || []), ...(c.rightHand || [])])].sort((a, b) => a - b);
      const caption = example.steps?.[i]?.caption || c.name;
      return { kind: 'chord', name: c.name, notes, marks: chordMarks(c.name, notes), caption };
    }).filter((s) => s.notes.length);
  }
  // Exemple de notes : attaques dans l'ordre (notes attaquées ensemble = un accord).
  const ons = (example.events || []).filter((e) => e.type === 'noteOn').sort((a, b) => a.time - b.time || a.note - b.note);
  const groups = [];
  for (const e of ons) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(e.time - last.time) < 0.03) last.notes.push(e.note);
    else groups.push({ time: e.time, notes: [e.note] });
  }
  const stepCaptions = example.steps || [];
  const steps = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const notes = run.map((g) => g.notes[0]);
    const caption = run.map((g) => stepCaptions[g.index]?.caption?.split(' : ')[0] || frenchPitchName(g.notes[0])).join(' ');
    steps.push({ kind: 'sequence', name: null, notes, marks: [], caption, captions: run.map((g) => stepCaptions[g.index]?.caption || '') });
    run = [];
  };
  groups.forEach((g, index) => {
    if (g.notes.length > 1) {
      flush();
      const caption = stepCaptions[index]?.caption || g.notes.map((n) => frenchPitchName(n)).join(' ');
      const name = /^([A-G][#b]?[^\s:]*)\s*:/.exec(caption)?.[1] || null;
      const notes = [...g.notes].sort((a, b) => a - b);
      steps.push({ kind: 'chord', name: parseChordName(name) ? name : null, notes, marks: chordMarks(parseChordName(name) ? name : null, notes), caption });
      return;
    }
    run.push({ ...g, index });
    if (run.length >= SEQUENCE_SIZE) flush();
  });
  flush();
  // Marques d'une suite : les notes à jouer, avec le rôle donné par la légende de l'exemple.
  for (const step of steps) {
    if (step.kind !== 'sequence') continue;
    step.marks = step.notes.map((midi, i) => {
      const label = /^([^\s:]+)\s*:\s*(.*)$/.exec(step.captions[i] || '');
      return { midi, kind: 'target', label: String(i + 1), note: label ? label[2] : '' };
    });
  }
  return steps;
}

/**
 * Étapes « Essayer les suggestions » d'un passage joué : une suggestion = une
 * étape. Quand l'application sait quelle note essayer (Fa# → Fa), l'étape
 * propose de rejouer l'accord avec elle ; sinon elle montre seulement.
 * @param {object[]} moments - review.moments (take-review.js)
 */
export function stepsFromMoments(moments, { marksOf } = {}) {
  return (moments || []).map((m) => {
    const view = marksOf ? marksOf(m) : { marks: [], caption: m.text };
    const played = m.notes || [];
    const problems = new Set(m.problemNotes || []);
    let corrected = null;
    const swaps = (m.suggestions || []).filter((x) => Number.isFinite(x?.from) && Number.isFinite(x?.to));
    if (played.length && swaps.length && !['pedal-blur', 'gaps', 'intent-scale'].includes(m.issueId)) {
      // Notes à essayer connues (accord que l'application ne sait pas nommer) : chacune à sa place.
      const swapOf = new Map(swaps.map((x) => [x.from, x.to]));
      corrected = [...new Set(played.map((n) => swapOf.get(n) ?? n))].sort((a, b) => a - b);
    } else if (played.length && ((m.missing || []).length || problems.size) && !['pedal-blur', 'gaps', 'intent-scale'].includes(m.issueId)) {
      const kept = played.filter((n) => !problems.has(n));
      const added = (m.missing || []).map((pc) => {
        // La note suggérée à la place de celle qu'elle remplace (même registre), sinon au milieu de l'accord.
        const anchor = [...problems][0] ?? Math.round(played.reduce((a, b) => a + b, 0) / played.length);
        let best = null;
        for (let n = anchor - 6; n <= anchor + 6; n += 1) if (pcOf(n) === pc && (best == null || Math.abs(n - anchor) < Math.abs(best - anchor))) best = n;
        return best;
      }).filter(Number.isFinite);
      corrected = [...new Set([...kept, ...added])].sort((a, b) => a - b);
    }
    return {
      kind: corrected ? 'chord' : 'show',
      name: m.chord || null,
      notes: corrected || played,
      marks: view.marks,
      caption: view.caption,
      correction: Boolean(corrected),
      at: m.at,
    };
  });
}

/**
 * Accord joué contre l'étape : `ok` (toutes les notes, rien d'étranger),
 * `partial` (il en manque), `wrong` (une note étrangère).
 * @param {number[]} played - notes tenues (MIDI)
 * @param {{notes: number[], name?: string|null}} step
 * @returns {{status: 'ok'|'partial'|'wrong'|'idle', missing: number[], extra: number[], good: number[], exact: boolean}}
 */
export function judgeChordStep(played, step) {
  const held = [...new Set(played || [])];
  const target = step.notes || [];
  if (held.length === 0) return { status: 'idle', missing: target, extra: [], good: [], exact: false };
  const targetPcs = new Set(target.map(pcOf));
  const heldPcs = new Set(held.map(pcOf));
  // Notes de l'accord (ou tensions) jouées en plus : pas une faute.
  const allowed = new Set(targetPcs);
  if (step.name) noteRoles(step.name, held).forEach((r) => { if (r.inChord || r.tension) allowed.add(r.pc); });
  const extra = held.filter((n) => !allowed.has(pcOf(n)));
  const good = held.filter((n) => targetPcs.has(pcOf(n)));
  const missing = target.filter((n) => !heldPcs.has(pcOf(n)));
  const exact = missing.length === 0 && extra.length === 0 && target.every((n) => held.includes(n));
  const status = extra.length ? 'wrong' : missing.length ? 'partial' : 'ok';
  return { status, missing, extra, good, exact };
}

/**
 * Suite de notes jouée contre l'étape (dans l'ordre, octave libre).
 * @param {number[]} played - notes attaquées depuis le début de l'étape, dans l'ordre
 * @param {{notes: number[]}} step
 * @returns {{status: 'ok'|'partial'|'wrong'|'idle', matched: number, wrongNote: number|null, wrongOrder: boolean, expected: number|null}}
 */
export function judgeSequenceStep(played, step) {
  const target = step.notes || [];
  const list = played || [];
  if (list.length === 0) return { status: 'idle', matched: 0, wrongNote: null, wrongOrder: false, expected: target[0] ?? null };
  let matched = 0;
  for (const n of list) {
    if (matched < target.length && pcOf(n) === pcOf(target[matched])) {
      matched += 1;
      continue;
    }
    // Note fausse : attendue plus loin dans la suite (ordre) ou absente.
    const later = target.slice(matched + 1).some((t) => pcOf(t) === pcOf(n));
    return { status: 'wrong', matched, wrongNote: n, wrongOrder: later, expected: target[matched] ?? null };
  }
  return { status: matched >= target.length ? 'ok' : 'partial', matched, wrongNote: null, wrongOrder: false, expected: target[matched] ?? null };
}

/**
 * Marques d'une étape pendant qu'on joue : notes justes en vert, note à
 * remplacer en orange (↔), note à essayer en pointillé ; pour une suite, la
 * prochaine note à jouer pulse. Et la phrase de la légende, toujours une
 * suggestion (« Ajoute Do (7e) », « Essaie Do à la place de Réb »).
 */
export function stepFeedback(step, judge) {
  if (step.kind === 'show') return { marks: step.marks, caption: step.caption, tone: 'tip' };
  if (step.kind === 'chord') {
    const marks = [];
    const roleOf = new Map(step.marks.map((m) => [m.midi, m]));
    const goodPcs = new Set((judge.good || []).map(pcOf));
    for (const n of step.notes) {
      const base = roleOf.get(n) || { kind: 'target', label: '' };
      marks.push(goodPcs.has(pcOf(n)) ? { midi: n, kind: 'ok', label: base.label } : { ...base, midi: n, kind: judge.status === 'idle' ? base.kind : 'suggest' });
    }
    for (const n of judge.extra || []) marks.push({ midi: n, kind: 'swap', label: '↔' });
    const named = (n) => {
      const role = roleOf.get(n);
      return `${frenchPitchName(n, step.name)}${role?.label && role.kind !== 'target' ? ` (${degreeWord(role.label)})` : ''}`;
    };
    let caption = step.caption;
    let tone = '';
    if (judge.status === 'ok') {
      caption = `Juste !${judge.exact ? '' : ' (même accord, autre position)'}`;
      tone = 'ok';
    } else if (judge.status === 'wrong') {
      // Chaque note en plus → la note de l'étape la plus proche qui reste à jouer.
      const open = [...(judge.missing || [])];
      const pairs = judge.extra.map((n) => {
        const near = open.filter((m) => Math.abs(m - n) <= 2).sort((a, b) => Math.abs(a - n) - Math.abs(b - n))[0];
        if (near != null) open.splice(open.indexOf(near), 1);
        return { from: n, to: near ?? null };
      });
      const swaps = pairs.filter((p) => p.to != null).map((p) => `${named(p.to)} à la place de ${frenchPitchName(p.from)}`);
      const without = pairs.filter((p) => p.to == null).map((p) => frenchPitchName(p.from));
      caption = [
        swaps.length ? `Essaie ${swaps.join(', ')}` : '',
        without.length ? `${swaps.length ? 'et ' : 'Essaie '}sans ${without.join(', ')}` : '',
      ].filter(Boolean).join(' ');
      tone = 'tip';
    } else if (judge.status === 'partial') {
      caption = `Ajoute ${judge.missing.map(named).join(', ')}`;
      tone = 'tip';
    }
    return { marks, caption, tone };
  }
  // Suite de notes.
  const marks = step.notes.map((n, i) => {
    if (i < judge.matched) return { midi: n, kind: 'ok', label: String(i + 1) };
    return { midi: n, kind: 'target', label: String(i + 1), moving: i === judge.matched };
  });
  let caption = step.caption;
  let tone = '';
  if (judge.status === 'ok') {
    caption = 'Juste !';
    tone = 'ok';
  } else if (judge.status === 'wrong') {
    marks.push({ midi: judge.wrongNote, kind: 'swap', label: '↔' });
    caption = judge.wrongOrder
      ? `D'abord ${frenchPitchName(judge.expected)} : ${frenchPitchName(judge.wrongNote)} vient plus tard`
      : `La suite continue sur ${frenchPitchName(judge.expected)}`;
    tone = 'tip';
  } else if (judge.status === 'partial') {
    caption = `${judge.matched} / ${step.notes.length} — ensuite ${frenchPitchName(judge.expected)}`;
  }
  return { marks, caption, tone };
}
