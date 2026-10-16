// Tests de guide-chapters.js : découper un tuto en chapitres, comme sur YouTube.
import { buildChapters, chapterCandidates, chaptersSignature, needsChapterTitles, chapterMessages, parseChapterTitles, applyChapterTitles, matchChapterTitles } from './guide-chapters.js';
import { ACTIVITY } from './teacher-activity.js';

let pass = 0; let fail = 0;
const check = (label, ok) => { if (ok) { pass += 1; console.log('  ✓', label); } else { fail += 1; console.log('  ✗', label); } };

const span = (start, end, kind) => ({ start, end, kind });
const say = (start, end, text) => ({ start, end, text });

{
  check('vidéo trop courte : pas de chapitres', buildChapters({ duration: 40, narration: [say(0, 5, 'hello')] }).length === 0);
  check('aucune donnée : rien', buildChapters({}).length === 0);
}
{
  // Un tuto de 19 min : il joue 80 s sans parler, puis explique ; plus loin il joue longuement.
  const spans = [span(0, 80, ACTIVITY.PLAYS), span(80, 400, ACTIVITY.SPEAKS), span(400, 520, ACTIVITY.PLAYS), span(520, 1140, ACTIVITY.SPEAKS)];
  const narration = [say(80, 90, 'what is up youtube today i want to show you a progression'), say(95, 110, 'it is a six five progression in the key of A')];
  const ch = buildChapters({ spans, narration, duration: 1140 });
  check('de 3 à 9 chapitres pour 19 min', ch.length >= 3 && ch.length <= 9);
  check('le 1er chapitre s\'arrête quand il se met à parler (≈ 80 s)', Math.abs(ch[0].end - 80) < 9);
  check('… et dit qu\'il joue sans parler (rien d\'inventé)', ch[0].kind === 'play' && ch[0].title === 'Il joue, sans parler');
  check('les chapitres se suivent sans trou', ch.every((c, i) => i === 0 || c.start === ch[i - 1].end) && ch[0].start === 0 && ch[ch.length - 1].end === 1140);
  check('aucun chapitre plus court que 30 s', ch.every((c) => c.end - c.start >= 30));
  const others = ch.filter((c) => c.kind !== 'play').map((c) => c.title);
  check('les chapitres qui parlent ont chacun un titre de secours différent (jamais le même partout)', new Set(others).size === others.length);
  check('le 1er chapitre muet dit qu\'il joue (aucune parole à reprendre)', ch[0].title === 'Il joue, sans parler' && ch[0].fromSpeech === false);
  check('un chapitre où il parle est titré par SES PREMIERS MOTS, jamais par un numéro',
    ch.filter((c) => c.text).every((c) => c.fromSpeech && !/^(Chapitre|Partie) \d/.test(c.title) && c.text.startsWith(c.title.replace(/…$/, ''))));
}
{
  // Sans notes lues : la parole seule, avec une pause de 12 s au milieu.
  const narration = [];
  for (let t = 0; t < 120; t += 10) narration.push(say(t, t + 8, `blah ${t}`));
  for (let t = 132; t < 300; t += 10) narration.push(say(t, t + 8, `autre ${t}`));
  const cands = chapterCandidates({ narration });
  check('une pause dans la parole est une coupure candidate', cands.some((c) => c.why.includes('pause') && Math.abs(c.t - 132) < 1));
  const ch = buildChapters({ narration, duration: 300 });
  check('sans notes, les chapitres viennent de la parole (kind talk)', ch.length >= 2 && ch.every((c) => c.kind === 'talk'));
}
{
  // Un changement de tonalité coupe.
  const parts = [{ start: 0, end: 200 }, { start: 200, end: 420 }];
  const ch = buildChapters({ parts, duration: 420, spans: [span(0, 420, ACTIVITY.PLAYS)] });
  check('un changement de tonalité est une coupure', ch.some((c) => Math.abs(c.start - 200) < 1));
}
{
  // Changement de sujet : la fin du vocabulaire. Deux thèmes, sans pause ni changement d'activité.
  const a = 'minor seventh chord voicing left hand fingers thumb root fifth chord voicing minor seventh';
  const b = 'swing rhythm drums groove tempo metronome bounce syncopation swing rhythm groove tempo';
  const narration = [];
  for (let i = 0; i < 18; i += 1) narration.push(say(i * 10, i * 10 + 9, a));
  for (let i = 18; i < 36; i += 1) narration.push(say(i * 10, i * 10 + 9, b));
  const cands = chapterCandidates({ narration });
  check('un changement de vocabulaire est une coupure candidate', cands.some((c) => c.why.includes('sujet') && Math.abs(c.t - 180) < 11));
  const ch = buildChapters({ narration, duration: 360, spans: [span(0, 360, ACTIVITY.SPEAKS)] });
  check('… et le tuto est coupé là', ch.some((c) => Math.abs(c.start - 180) < 12));
}
{
  // Mouvements rattachés au bon chapitre.
  const spans = [span(0, 100, ACTIVITY.PLAYS), span(100, 300, ACTIVITY.SPEAKS)];
  const highlights = [{ id: 'move:a', kind: 'movement', start: 150 }, { id: 'final:p1', kind: 'final', start: null }];
  const ch = buildChapters({ spans, highlights, duration: 300, narration: [say(100, 110, 'hello there')] });
  check('un mouvement va dans le chapitre où il est montré', ch.find((c) => c.start <= 150 && c.end > 150).moves.includes('move:a'));
  check('la progression complète (sans date) n\'est rattachée à aucun chapitre', ch.every((c) => !c.moves.includes('final:p1')));
}
{
  const ch = buildChapters({ spans: [span(0, 80, ACTIVITY.PLAYS), span(80, 300, ACTIVITY.SPEAKS)], duration: 300, narration: [say(80, 90, 'let us start now the lesson')] });
  check('la signature change avec le découpage', chaptersSignature(ch) !== chaptersSignature(ch.slice(1)) && chaptersSignature([]) === '');
  check('sans paroles, pas de demande à l\'IA', needsChapterTitles(ch) === true && needsChapterTitles([{ text: '' }]) === false);
  const msgs = chapterMessages(ch, { moveTitles: { 'move:a': '6 → 4' } });
  check('la demande ne parle pas de mains et interdit d\'inventer', !/main (gauche|droite)/i.test(msgs[1].content) && /N\'ajoute aucune note/.test(msgs[0].content) && /jamais de mains gauche ou droite/.test(msgs[0].content));
  check('la demande ne laisse pas l\'IA choisir les moments', /Ne change ni les identifiants ni les moments/.test(msgs[0].content));
  const reply = 'Voici : {"sujet":"Une progression 6-5 en La.","chapitres":[{"id":"c1","titre":"Il joue le morceau","resume":"Il joue sans parler."},{"id":"zz","titre":"Inventé","resume":"x"},{"id":"c2","titre":"","resume":"vide"}]} merci';
  const parsed = parseChapterTitles(reply, ch);
  check('la réponse de l\'IA est lue, même entourée de texte', parsed.subject === 'Une progression 6-5 en La.' && parsed.byId.c1.title === 'Il joue le morceau');
  check('un identifiant inconnu ou un titre vide est ignoré', !parsed.byId.zz && !parsed.byId.c2);
  const applied = applyChapterTitles(ch, parsed);
  check('le titre français remplace le titre factuel, qui est gardé', applied[0].title === 'Il joue le morceau' && applied[0].autoTitle === 'Il joue, sans parler' && applied[0].start === ch[0].start);
  check('une réponse illisible ne change rien', parseChapterTitles('pas du json', ch).subject === '' && applyChapterTitles(ch, parseChapterTitles('x', ch)).every((c, i) => c.title === ch[i].title));
}

{
  // Sous-repères : plusieurs changements de sujet dans un même (grand) chapitre, peu nombreux.
  const topics = [
    'left hand drop two voicing inner notes passing chord',
    'right hand melody line upper structure extension',
    'rhythm comping syncopation groove swing feel bounce',
    'left hand walking bass octave stride pattern motion',
    'right hand arpeggio run fill lick phrase ornament',
  ];
  const narration = [];
  topics.forEach((t, k) => { for (let i = 0; i < 13; i += 1) narration.push(say(k * 100 + i * 7.5, k * 100 + i * 7.5 + 6.5, t)); });
  const ch = buildChapters({ narration, duration: 500, spans: [span(0, 500, ACTIVITY.SPEAKS)] }, { perChapter: 250 });
  check('au moins un chapitre porte des sous-repères', ch.some((c) => c.subpoints.length > 0));
  check('jamais plus de 2 sous-repères par chapitre', ch.every((c) => c.subpoints.length <= 2));
  check('un sous-repère reste DANS son chapitre, loin des bords', ch.every((c) => c.subpoints.every((sp) => sp.t > c.start + 15 && sp.t < c.end - 15)));
  check('un sous-repère porte un court extrait de ce qui est dit là', ch.some((c) => c.subpoints.some((sp) => sp.label.length > 0)));
}
{
  // Peu de matière : pas de sous-repères forcés.
  const ch = buildChapters({ spans: [span(0, 80, ACTIVITY.PLAYS), span(80, 300, ACTIVITY.SPEAKS)], duration: 300, narration: [say(80, 90, 'let us start now the lesson')] });
  check('sans matière suffisante : aucun sous-repère inventé', ch.every((c) => c.subpoints.length === 0));
}

{
  // Les titres gardés survivent à une ré-analyse qui déplace les bornes de quelques secondes.
  const stored = [
    { start: 0, end: 170, title: 'Présentation du mouvement', summary: 'Il annonce le sujet.' },
    { start: 170, end: 300, title: 'La basse pas à pas', summary: 'Il construit la basse.' },
  ];
  const moved = [{ id: 'c1', start: 0, end: 176, title: 'Début', summary: '' }, { id: 'c2', start: 176, end: 300, title: 'Partie 2', summary: '' }];
  const out = matchChapterTitles(moved, stored);
  check('les titres gardés sont retrouvés malgré des bornes déplacées', out[0].title === 'Présentation du mouvement' && out[1].title === 'La basse pas à pas');
  check('… avec leurs phrases', out[0].summary === 'Il annonce le sujet.');
  // Un découpage qui n'a plus rien à voir ne récupère pas les titres d'un autre.
  const other = [{ id: 'c1', start: 0, end: 20, title: 'Début', summary: '' }, { id: 'c2', start: 280, end: 300, title: 'Partie 2', summary: '' }];
  const none = matchChapterTitles(other, stored);
  check('un découpage sans rapport ne récupère aucun titre', none.every((c) => /^(Début|Partie)/.test(c.title)));
  check('un titre n\'est jamais posé deux fois', new Set(out.map((c) => c.title)).size === out.length);
  check('sans titres gardés : rien ne change', matchChapterTitles(moved, []).every((c, i) => c === moved[i]));
}

console.log(`\n${pass} réussis, ${fail} échoués`);
if (fail) process.exit(1);
