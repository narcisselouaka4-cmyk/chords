// [Claude] — 2026-11-12 — Banc d'essai RÉEL du Copilote : une trentaine de demandes variées, écrites
// comme un pianiste les tape (fautes comprises), dans tous les contextes (rien, exercice, tutoriel,
// session), avec relances et questions hors sujet. Chaque réponse est vérifiée automatiquement.
//
// Narcisse : « je suis sûr que je vais poser d'autres demandes, ça va encore poser problème ».
// Ce banc mesure un TAUX de réussite sur des familles de demandes, au lieu de corriger phrase par
// phrase. ESSAI MANUEL : vrais appels payants avec les clés de l'utilisateur (copie de profil,
// clés jamais lues en clair). Ne pas lancer dans une suite automatique.
//
//   node scripts/copilot-e2e/real-scenarios.mjs DOSSIER_pjc-e2e-… "baseUrl-contient|modèle" [filtre]
//   ex. node scripts/copilot-e2e/real-scenarios.mjs /tmp/pjc-e2e-banc anthropic\|claude-sonnet-5

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchIsolatedApp } from './isolated-electron.mjs';

const [root, target, filter = ''] = process.argv.slice(2);
if (!root || !target) throw new Error('Usage : node scripts/copilot-e2e/real-scenarios.mjs DOSSIER "hôte|modèle" [filtre]');
const [host, model] = target.split('|');
const home = os.userInfo().homedir;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Relevés de tutoriels : copiés en lecture seule dans le dossier isolé (la bibliothèque les lit).
const memoryFrom = path.join(home, 'PianoJazzChords', 'Pedagogie', 'memoire');
const memoryTo = path.join(root, 'home', 'PianoJazzChords', 'Pedagogie', 'memoire');
fs.mkdirSync(memoryTo, { recursive: true });
for (const f of fs.existsSync(memoryFrom) ? fs.readdirSync(memoryFrom) : []) if (f.endsWith('.json')) fs.copyFileSync(path.join(memoryFrom, f), path.join(memoryTo, f));
// Un tutoriel réel comme contexte (Amazing Grace, relevé le plus riche), et une session réelle.
const tutorialSaved = fs.readdirSync(memoryTo).filter((f) => f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(memoryTo, f), 'utf8')))
  .filter((m) => /Slow Gospel Blues/.test(m.path || '')).sort((a, b) => (b.analysis?.noteEvents?.length || 0) - (a.analysis?.noteEvents?.length || 0))[0];
const sessionEvents = JSON.parse(fs.readFileSync(path.join(home, 'PianoJazzChords', 'Sessions', 'Session_017', 'events.json'), 'utf8'));

// hear : true = un exemple doit être préparé ; false = une explication (aucune annonce d'exemple
// sans exemple) ; 'soft' = exemple OU explication honnête ; offtopic = déclinée en peu de mots.
const S = (id, context, turns, expect) => ({ id, context, turns, expect });
const SCENARIOS = [
  S('ii-v-i-sib', 'rien', ['joue moi un 2-5-1 en sib'], { hear: true }),
  S('so-what', 'rien', ['fais moi entendre un voicing so what en ré mineur'], { hear: true }),
  S('passage-dim', 'rien', ['c\'est quoi un accord de passage diminué ?'], { hear: false }),
  S('lick-blues', 'rien', ['joue un lick blues sur Do7'], { hear: true }),
  S('penta-la', 'rien', ['montre moi la gamme pentatonique mineure de La'], { hear: true }),
  S('lib-turnaround-blues', 'rien', ['enchaine le turnaround et le blues jazz en Fa'], { hear: true, kind: 'library' }),
  S('lib-overlay', 'rien', ['superpose la main droite du lick 2 sur la main gauche du montuno'], { hear: true, kind: 'library' }),
  S('drop2-drop3', 'rien', ['quelle est la différence entre un drop 2 et un drop 3 ?'], { hear: false }),
  S('vague-gospel', 'rien', ['joue moi quelque chose de gospel'], { hear: true }),
  S('impro-salsa', 'rien', ['comment je peux improviser sur une grille salsa ?'], { hear: false }),
  S('tokyo', 'rien', ['quelle heure est-il à Tokyo ?'], { offtopic: true }),
  S('lick3-joue-le', 'rien', ['parle moi du lick 3', 'joue le'], { hear: true, kind: 'library' }),
  S('tritonique-lent', 'rien', ['joue le passage tritonique en Mi', 'plus lent'], { hear: true }),
  S('exo-joue', 'exercice', ['joue l\'exercice'], { hear: true }),
  S('exo-pourquoi', 'exercice', ['pourquoi la 7e de Dm7 descend sur la 3ce de G7 ?'], { hear: false }),
  S('exo-lick-dessus', 'exercice', ['fais moi entendre ça avec le lick 1 par dessus'], { hear: 'soft' }),
  S('exo-histoire', 'exercice', ['qui a inventé le ii-V-I ?'], { hear: false }),
  S('tuto-rejoue', 'tutoriel', ['rejoue ce passage'], { hear: true }),
  S('tuto-accord', 'tutoriel', ['il joue quoi comme accord au début ?'], { hear: false }),
  S('tuto-lib', 'tutoriel', ['enchaine le début de ce tuto avec le turnaround'], { hear: true, kind: 'library' }),
  S('tuto-cory', 'tutoriel', ['c\'est qui Cory Henry ?'], { hear: false }),
  S('tuto-foot', 'tutoriel', ['parle moi de foot'], { offtopic: true }),
  S('session-rejoue', 'session', ['rejoue ma session'], { hear: true }),
  S('session-mg', 'session', ['joue la main gauche de ma session'], { hear: true }),
  S('session-jazz', 'session', ['comment rendre mes accords plus jazz ?'], { hear: 'soft' }),
  S('session-puis-lib', 'session', ['joue mon jeu puis le turnaround'], { hear: 'soft' }),
  S('251-entendre', 'rien', ['Explique-moi l\'harmonie d\'un 2-5-1.', 'Fais-le-moi entendre'], { hear: true }),
  S('bill-evans', 'rien', ['Qu\'en penses-tu de Bill Evans ?'], { hear: false }),
  S('crepes', 'rien', ['donne moi une recette de crêpes'], { offtopic: true }),
  S('lib-tempo', 'rien', ['enchaine le lick 1 et le lick 2', 'met les à 150', 'essaye'], { hear: true, kind: 'library' }),
].filter((s) => !filter || s.id.includes(filter));

const app = await launchIsolatedApp({ root, debugPort: 9363, profileCopyFrom: path.join(home, '.config', 'piano-jazz-chords'), devServer: true });
const results = [];
try {
  const switched = await app.page.evaluate(({ host, model }) => {
    const keys = JSON.parse(localStorage.getItem('piano-jazz-ai-keys') || '[]');
    const e = keys.find((k) => k.baseUrl.includes(host));
    if (!e) return false;
    localStorage.setItem('piano-jazz-ai-config', JSON.stringify({ baseUrl: e.baseUrl, apiKey: e.apiKey, model, monthlyCap: 50 }));
    return true;
  }, { host, model });
  if (!switched) throw new Error(`Aucune clé enregistrée pour ${host}`);
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => Boolean(window.electronAPI?.files?.homeDir), { timeout: 30000 });
  await sleep(2500);
  await app.page.evaluate(({ tutorial, events }) => {
    const take = { name: 'Session_017', duration: Math.max(...events.map((e) => e.time)), events };
    window.__contexts = {
      rien: { type: 'autonomous' },
      exercice: { type: 'exercise', mode: 'movement', id: 'mouvement:II-V-I:5', title: 'Mouvement 12 tons — II-V-I majeur en Do majeur', name: 'II-V-I majeur', description: '', contentKind: 'progression', technique: 'Automatique', attempts: [], key: 'Do majeur', keyProgress: '', stepProgress: '1 / 3 accords',
        chords: [{ name: 'Dm7', lh: [50], rh: [60, 64, 65, 69], current: true, roles: ['ii'] }, { name: 'G7', lh: [43], rh: [59, 62, 65, 69], current: false, roles: ['V7'] }, { name: 'Cmaj7', lh: [48], rh: [59, 64, 67, 72], current: false, roles: ['I'] }],
        expect: { chords: ['Dm7', 'G7', 'Cmaj7'] } },
      tutoriel: tutorial ? { type: 'tutorial', name: 'Amazing Grace - Slow Gospel Blues Piano', path: tutorial.path, key: tutorial.key || 'C', noteEvents: tutorial.analysis.noteEvents,
        chords: (tutorial.analysis.segments || []).map((s) => ({ start: s.start, end: s.end, label: s.chord?.label || null })).filter((s) => s.label), moment: { start: 0, end: 12 } } : { type: 'autonomous' },
      session: { type: 'autonomous', playing: { session: take } },
    };
  }, { tutorial: tutorialSaved || null, events: sessionEvents });

  for (const scenario of SCENARIOS) {
    const messages = [];
    let last = null;
    const started = Date.now();
    for (const [index, message] of scenario.turns.entries()) {
      if (host.includes('groq') && (results.length || index)) await sleep(62000); // 8 000 jetons par minute
      last = await app.page.evaluate(async ({ message, messages, context }) => {
        const { sendCopilotMessage } = await import('/pedagogie/copilot-client.js');
        try {
          const r = await sendCopilotMessage({ message, messages, context: window.__contexts[context] });
          return { ok: r.ok, error: r.error || null, content: r.content || '', example: r.toolResult?.example ? { kind: r.toolResult.example.kind, title: r.toolResult.example.title, subtitle: r.toolResult.example.subtitle || '', notes: (r.toolResult.example.events || []).filter((e) => e.type === 'noteOn').length } : null, toolResult: r.toolResult ? JSON.parse(JSON.stringify({ ...r.toolResult, originalTake: undefined })) : null };
        } catch (err) { return { ok: false, error: String(err?.message || err), content: '' }; }
      }, { message, messages, context: scenario.context });
      messages.push({ role: 'user', content: message }, { role: 'assistant', content: last.content, toolResult: last.toolResult });
    }
    const text = last.content || '';
    const problems = [];
    if (!last.ok) problems.push(`échec ${last.error}`);
    if (last.ok && !text.trim()) problems.push('réponse vide');
    if (/\b(?:play_\w+|combine_library|consult_\w+|suggest_actions)\b|undefined|\[object Object\]/.test(text)) problems.push('nom interne ou valeur brute affichée');
    const phantom = /(?:[ée]coute[sz]? (?:l['’]exemple|ci-dessous)|ci-dessous\s*:|\bje (?:vais )?(?:te )?(?:joue[rs]?|fais entendre|tente))/i.test(text);
    const refuses = /ne (?:peux|pourrai) pas (?:te |vous )?(?:le |la |les )?(?:jouer|faire entendre)|n['’]arrive (?:toujours )?pas à|je ne lance pas/i.test(text);
    const e = scenario.expect;
    if (e.offtopic) {
      if (last.example) problems.push('exemple pour une question hors sujet');
      if (text.length > 450) problems.push(`hors sujet traité (${text.length} caractères)`);
    } else if (e.hear === true) {
      if (!last.example?.notes) problems.push('aucun exemple alors que l’écoute est demandée');
      if (e.kind && last.example && last.example.kind !== e.kind) problems.push(`exemple de sorte « ${last.example.kind} » au lieu de « ${e.kind} »`);
      if (last.example && refuses) problems.push('texte qui dit ne pas pouvoir jouer, avec un exemple');
    } else if (e.hear === false) {
      if (!last.example && phantom) problems.push('annonce un exemple qui n’existe pas');
    } else if (e.hear === 'soft') {
      if (!last.example && phantom) problems.push('annonce un exemple qui n’existe pas');
      if (last.example && refuses) problems.push('texte qui dit ne pas pouvoir jouer, avec un exemple');
    }
    const result = { id: scenario.id, contexte: scenario.context, demandes: scenario.turns, secondes: Math.round((Date.now() - started) / 1000), reussi: !problems.length, problemes: problems,
      exemple: last.example ? `${last.example.kind} · ${last.example.title}` : null, reponse: text.replace(/\s+/g, ' ').slice(0, 300) };
    results.push(result);
    console.log(`${result.reussi ? 'OK   ' : 'ÉCHEC'} ${scenario.id.padEnd(22)} ${String(result.secondes).padStart(3)} s  ${result.exemple || '—'}${problems.length ? `  ⟶ ${problems.join(' ; ')}` : ''}`);
    fs.writeFileSync(path.join(root, 'banc-scenarios.json'), JSON.stringify({ modele: target, date: new Date().toISOString(), resultats: results }, null, 2));
  }
} finally {
  await app.stop();
  const ok = results.filter((r) => r.reussi).length;
  console.log(`\n=== Banc réel ${target} : ${ok}/${results.length} scénarios réussis ===`);
  console.log(`Rapport : ${path.join(root, 'banc-scenarios.json')}`);
}
