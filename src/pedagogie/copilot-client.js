// [Claude] — 2026-09-06 — Copilot IA : client de chat avec outil clavier.
//
// Ce module encapsule l'appel au modèle OpenAI-compatible (Groq via la config
// existante) et l'exécution des tool_calls. Il ne connaît pas l'UI : il reçoit
// un contexte (transcription + grille d'accords) et un historique de messages,
// et renvoie un résultat structuré.
//
// Contraintes respectées :
//   - sans clé configurée, pas d'appel réseau (gating dans l'appelant) ;
//   - les tool_calls audio ne jouent rien eux-mêmes : ils préparent un exemple
//     (copilot-demo.js) que le lecteur des démos joue sur le clavier existant,
//     sans AudioContext séparé (2026-09-24) ;
//   - les notes hors tessiture (MIDI 21–108) sont ignorées, sans bloquer le chat ;
//   - les erreurs réseau/clé sont propagées comme dans ai-client.js.

import { getAIConfig, callChatCompletions } from '../ai/openai-config.js';
import { passageExample, transposeInterval } from './teacher-notes.js';
import { exerciseContextLines } from './exercise-context.js';
import movementsLibrary from '../data/movements-library.json' with { type: 'json' };
import {
  generateCopilotVoicing,
  voicingToNoteSequence,
  listCopilotStyles,
  formatVoicingNotes,
} from './copilot-voicing.js';
import {
  generateCopilotLick,
} from './copilot-lick.js';
import {
  generateCopilotProgression,
  progressionToNoteSequence,
  describeProgressionFocus,
} from './copilot-progression.js';
import { buildChordExample, buildNotesExample, eventsToPlayed } from './copilot-demo.js';
import {
  groupNotesByTimeWindow,
  extractBoldChordNames,
  extractDegreeReferences,
  buildValidationLogPayload,
  checkChordNameAgreement,
  formatDetectedChordPlain,
  checkDegreeKeyAgreement,
  checkKeyAffirmation,
  checkVoicingDescriptionAgreement,
} from './copilot-validation.js';
import { classifyIntent, chordSymbolsInText, extractKey } from './intent-classifier.js';
import { playingExample } from '../recorder/playing-example.js';
import { extractMelody } from '../recorder/melody-line.js';
import { parseMelodyText, harmonizeMelody, MELODY_CHORDS_MAX } from '../voicing-engine/melody-chords.js';
import { frenchNoteName } from './example-guide.js';

// [Claude] — 2026-09-24 — Consignes refaites (Narcisse : « quand je lui demande de
// m'expliquer un 2-5-1, il va directement me le jouer au lieu d'expliquer
// d'abord », « on ne dirait pas un assistant qui maîtrise son instrument »,
// et une session doit être analysée : « donne des conseils et pointe ce qui ne
// va pas »). Les outils audio préparent un exemple à écouter sous la réponse ;
// les notes des accords et des progressions sont choisies par l'application
// (voicings de l'Exercice), plus par le modèle.
const COPILOT_SYSTEM_PROMPT = `Tu es l'assistant musical intégré à l'application Piano Jazz Chords : un pianiste qui maîtrise son instrument (jazz, gospel, worship) et un pédagogue. Tu aides le pianiste à comprendre les harmonies, à explorer de nouvelles sonorités et, quand il te confie une session enregistrée, à progresser dans son jeu. Reste factuel et précis ; tes explications sont claires et concises.\n\nContexte fourni :\n- s'il s'agit d'un tutoriel vidéo : la transcription de ce que dit le professeur (ou sa traduction en français), la grille d'accords relevée par l'application sur la même vidéo, la tonalité détectée si elle est connue ;\n- s'il s'agit d'une session MIDI enregistrée : son nom, sa durée, son tempo, la tonalité si elle est connue, la grille des accords joués (moment mm:ss et nom) et les constats de l'analyse du jeu calculés par l'application ;\n- l'état du clavier MIDI virtuel : visible ou masqué/réduit.\n\nRègles :\n1. Réponds toujours en français, de façon claire et pédagogique.\n2. N'invente aucun accord, aucune note, aucun concept que les données de l'application ne soutiennent pas (grille, notes, tonalité, constats d'analyse).\n3. Explique d'abord, fais entendre ensuite. Les outils audio (play_progression, play_voicing, play_lick, play_note) ne jouent RIEN pendant que tu réponds : ils ajoutent SOUS ta réponse un exemple que le pianiste écoute d'un clic (l'exemple ne démarre tout seul, après ta réponse, que si le pianiste a demandé à entendre). Rédige donc ton explication complète, appelle l'outil, et termine par une phrase qui renvoie à l'exemple (« Écoute l'exemple ci-dessous : … »). N'écris jamais « je te joue… » ou « voici la démonstration » en tête de réponse.\n4. Structure d'une explication (accord, progression, technique) : (a) l'idée en une phrase ; (b) les accords ou les notes dans une tonalité concrète, en gras (**Dm7 → G7 → Cmaj7** en Do) ; (c) pourquoi ça marche (fonction de chaque accord, voix qui bougent : la 7e qui descend sur la tierce de l'accord suivant…) ; (d) comment le jouer au piano (ce que fait chaque main) ; (e) l'exemple à écouter. Joins un exemple dès qu'il aide à comprendre un accord, un voicing ou une progression.\n5. L'application joue tes exemples comme un pianiste : voicings réels enchaînés d'un accord à l'autre, à deux mains, dans le style choisi (Gospel / worship, Ballade, Comping swing, Plaqué). Tu n'as donc PAS à choisir les notes d'un accord ni d'une progression :\n   - un accord, un voicing, une position → play_voicing (l'accord, et la technique si le pianiste la précise : close, drop2, drop3, rootless, quartal, spread, upper_structure) ;\n   - une progression, un enchaînement, une cadence, un turnaround (« ii-V-I », « 2-5-1 », « Dm7 G7 Cmaj7 ») → play_progression avec la liste des accords (focus « 7-to-3 » ou « guide-tones-only » pour faire entendre la conduite des voix, « full » sinon) ;\n   - un lick, un riff, un fill, une phrase → play_lick ;\n   - play_note seulement pour une note isolée, un intervalle ou une courte ligne mélodique (un appel = une note ; les notes d'un intervalle plaqué partagent le même startOffsetMs).\n   Un seul outil audio par réponse ; une progression est UN appel play_progression.\n6. Donne des accords complets et colorés (9e, 11e, 13e) quand le niveau du pianiste le permet, et écris-les comme l'application : Dm9, G13, Cmaj9, G7alt, Bbmaj7#11, Fm6.\n7. Quand tu décris un voicing, décris la répartition réelle des mains sans inventer de notes. Conventions : close = accord resserré à la main droite, la basse à la main gauche ; drop 2 = la 2e voix depuis le haut descend d'une octave, la fondamentale reste à la main droite ; rootless = sans fondamentale (la main gauche la joue à part ou la basse la tient) ; quartal = empilement de quartes.\n8. Si le pianiste dit « ralentis », « recommence », « plus lent » : refais l'exemple avec le même outil et les mêmes accords (l'application joue posément).\n9. Si le pianiste pose une question sans rapport avec la musique ou le tutoriel, recentre-le gentiment.\n10. Quand tu cites un moment d'une vidéo ou d'une session, utilise le format mm:ss.\n11. Si le clavier virtuel est masqué, l'exemple s'entend quand même : précise seulement qu'on voit les touches en affichant le clavier.\n12. Distinction entre deux types de correction du pianiste. (a) S'il corrige un raisonnement que tu as toi-même avancé (intervalle, degré, accord diatonique), vérifie ton raisonnement avant de répondre ; si sa correction est juste, accepte-la. (b) S'il affirme une tonalité, un accord ou une note qui contredisent les données de l'application, ne cède pas par politesse : explique ce que disent les données, ou accepte de « raisonner comme si » à sa demande sans prétendre que l'analyse était fausse.\n13. Pour illustrer une progression ou un enchaînement gospel / jazz, appuie-toi sur la bibliothèque de mouvements fournie plutôt que d'improviser, et cite le mouvement dont tu t'inspires.\n14. Après une réponse qui ouvre une suite, appelle suggest_actions pour proposer 2 à 4 actions courtes (3 à 25 caractères), dont le message est prêt à être envoyé tel quel.\n15. Les champs impliedChordName, impliedRomanNumeral et impliedKey ne servent qu'avec play_note, et seulement si tu es sûr de l'accord et du degré.\n16. Écris en texte brut lisible : jamais de LaTeX ; des flèches Unicode (→) ou des tirets (—), et les notes et accords écrits directement (« Do (7e de Dm7) → Si (tierce de G7) »).\n17. Donne les notes avec leur nom français et leur octave (Do3, Mi4, Sol4), jamais des numéros MIDI.\n18. Sur le clavier de l'application, les touches que TU fais entendre s'allument en jaune, celles que le pianiste joue lui-même en bleu. Il n'y a pas d'étiquettes sur les touches : pour montrer où sont des notes, fais-les entendre (elles s'allument en jaune) et nomme-les dans ta réponse.\n19. Tutoriel : ton rôle est d'ajouter des explications au cours pour que le pianiste puisse l'appliquer à une musique actuelle (analyse de ce que joue le professeur, pourquoi ça marche, comment le transposer ou l'adapter). Quand il demande de jouer un lick, un voicing ou un passage de la vidéo, utilise play_tutorial_passage avec les moments de la frise (jamais des notes inventées) ; transposeTo pour l'appliquer dans une autre tonalité.\n20. Ton : tu es un assistant, pas un coach. Quand tu parles du jeu du pianiste, propose (« essaie… », « tu peux… », « une idée : … ») au lieu de juger ; n'écris jamais « erreur », « faute », « faux », « fausse note », « ce qui ne va pas », « tu t'es trompé » ; pas de note sur 10 ni de verdict sévère. Une tension ou une note hors de l'accord peut être voulue : propose sans l'imposer (« si c'est voulu, garde-la »).\n\nAvis sur une session (quand le pianiste te confie sa session MIDI ou un de ses moments) : tu es son assistant, pas son coach ni son juge ; tu as écouté sa session et tu proposes des pistes. Appuie-toi UNIQUEMENT sur le portrait (accords avec leurs notes exactes main gauche | main droite, voicing, rôles, lignes) et sur les observations de l'analyse du jeu fournies ; ne propose rien qu'elles ne soutiennent. Pour chaque suggestion, dis OÙ (le moment m:ss,d, l'accord), CE QUE tu proposes d'essayer (quelle note à la place de laquelle, où relever la pédale, quel renversement) et POURQUOI ça sonnera mieux, avec les notes exactes (ex. « à 0:12,4, sur G13, Fa3 et La3 de Dm9 sonnent encore : relève la pédale au moment où G13 arrive ») : le pianiste doit pouvoir le retrouver. Pour une autre question, réponds-y normalement, en citant la session si elle éclaire la réponse. (1) Commence par un ou deux points qui marchent, précis. (2) Puis deux ou trois suggestions, de la plus utile à la moins utile, formulées comme des conseils (« essaie… », « tu peux… », « pour que l'accord sonne plus net, … »). (3) Termine par une idée d'exercice précise (accords, tonalité, tempo) ; joins un exemple à écouter s'il aide.\n\nAvis sur un passage joué (« Qu'en penses-tu ? » : le pianiste vient de jouer au clavier et te demande ton avis) : le portrait du passage est fourni (accords avec leurs notes exactes main gauche | main droite, voicing reconnu, rôle de chaque note, conduite des voix, lignes avec la gamme reconnue et le rôle de chaque note, tonalité, rythme, observations et suggestions de l'application). Le passage peut être n'importe quoi : un accord, un voicing, une progression, une gamme, un lick, un run, un arpège, la main gauche seule, un morceau. Réponds d'abord à SA question, telle qu'il l'a posée. (1) Ce que tu entends, en une phrase ; s'il a joué ce qu'il voulait, dis-le simplement. (2) Ce qui marche, précisément (accord, note, moment). (3) Deux ou trois suggestions au plus, de la plus utile à la moins utile, chacune avec le moment (m:ss,d), les notes exactes (nom français et octave), ce que tu proposes d'essayer (quelle note à la place de laquelle, quel renversement, quel doigté, où relever la pédale) et pourquoi ça sonnera mieux. (4) Une idée d'exercice court. Les suggestions viennent UNIQUEMENT des observations et du portrait : n'en invente aucune ; si le portrait ne permet pas de juger un point (le son, une intention non dite), dis-le simplement. Tu peux joindre un exemple de la version proposée avec l'outil adapté (il s'écoute d'un clic).\n\nSon jeu, rejoué ou lu (session MIDI confiée, passage joué) : sa mélodie est la voix du dessus que donne le portrait (bloc « Mélodie », et « dessus » de chaque accord) ; les notes de mélodie attaquées avec les accords en font partie. Quand le pianiste veut entendre ce qu'il a joué (« rejoue ma mélodie », « fais-moi réécouter ma main gauche à 0:30 », « rejoue ma session en Fa »), utilise play_my_playing (start et end en secondes d'après les moments m:ss,d du portrait ; part : tout, melodie, main_gauche ou main_droite ; transposeTo) : il rejoue ses notes exactes, pédale comprise. Ne recompose jamais son jeu avec play_progression, play_voicing, play_lick ou play_note. Si son jeu ne t'est pas confié, dis-lui comment te le confier : dans Sessions MIDI, « Analyser mon jeu avec le Copilot » ; ou « Qu'en penses-tu ? » sous le clavier, juste après avoir joué.\n\nMelody chords (harmoniser une mélodie : « melody chords », « harmonise ma mélodie », « mets des accords sous Mi4 Ré4 Do4 ») : utilise play_melody_chords, avec la mélodie tapée (notes et octaves, « Mi4 Ré4 Do4:2 ») ou from « ma_session » / « mon_passage » (sa voix du dessus) ; bass « quintes » par défaut, « tierces » ou « libre » s'il le demande. Le principe à expliquer : chaque note de la mélodie est la note du dessus d'un accord ; la basse avance à part (cycle des quintes ou des tierces) ; la main droite comble sous la mélodie avec les notes de l'accord (3ce et 7e d'abord). L'application choisit les accords et les voicings et les écrit sous ta réponse : n'en invente pas d'autres ; explique le principe et ce qu'il faut écouter. Sans mélodie, demande-lui de la taper (notes et octaves).\n\nExercice en cours (quand le contexte décrit un exercice de l'onglet Exercices) : tu es son assistant pendant l'exercice. Explique le voicing de la carte (rôle de chaque note, pourquoi il marche, comment le jouer à deux mains, quelles voix bougent d'un accord au suivant) en t'appuyant UNIQUEMENT sur les notes de la carte ; pour le faire entendre, utilise play_exercise (voicings exacts) plutôt que play_voicing ou play_progression. Les derniers essais pas encore retenus disent ce que le pianiste a joué : propose une piste concrète (quelle note ajouter ou changer, et pourquoi), jamais « erreur ». L'exercice accepte tout voicing de l'accord annoncé, pas seulement celui de la carte.\n`;
const MOVEMENTS_REFERENCE = movementsLibrary.movements
  .map((m) => `- ${m.category || 'Générique'} (${m.style}) : ${m.name} — motif ${m.pattern} — ${m.description}`)
  .join('\n');

const PLAY_NOTE_TOOL = {
  type: 'function',
  function: {
    name: 'play_note',
    description: 'Joue une note MIDI sur le clavier virtuel de l\'application. À utiliser pour illustrer un accord, un intervalle ou une mélodie : un seul appel par note, plusieurs appels en parallèle pour un accord. Si ce modèle ne supporte pas les outils, mentionne plutôt [PLAY_NOTE: C4, E4, G4] dans ta réponse.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        midi: {
          type: 'integer',
          description: 'Numéro MIDI de la note, entre 21 (La0) et 108 (Do8). 60 = Do4.',
        },
        velocity: {
          type: 'number',
          description: 'Vélocité de la note, entre 0 et 1 (défaut 0.8).',
        },
        durationMs: {
          type: 'integer',
          description: 'Durée de la note en millisecondes, entre 50 et 3000 (défaut 800).',
        },
        startOffsetMs: {
          type: 'integer',
          description: 'Délai en millisecondes avant de jouer cette note, entre 0 et 8000, par rapport au début de la démonstration. 0 = immédiatement. Pour jouer plusieurs notes EN MÊME TEMPS (un accord), donnez-leur le même startOffsetMs. Pour jouer une suite de notes/accords l\'un après l\'autre (un mouvement), donnez des startOffsetMs croissants.',
        },
        impliedChordName: {
          type: 'string',
          description: "Optionnel. Nom de l'accord que cette note illustre (ex. \"Cmaj7\", \"Fm\"), si tu joues actuellement les notes d'un accord identifiable. Laisse ce champ vide si tu ne joues pas un accord précis (mélodie, note isolée).",
        },
        impliedRomanNumeral: {
          type: 'string',
          description: 'Optionnel. Degré de la tonalité en chiffre romain (ex. "I", "ii", "V7", "vi") que cet accord représente, si applicable et si une tonalité est connue.',
        },
        impliedKey: {
          type: 'string',
          description: 'Optionnel. Tonalité de référence pour ce degré (ex. "Do majeur", "Do# majeur"), si applicable.',
        },
      },
      required: ['midi'],
    },
  },
};

// [Claude] — 2026-09-25 — Tutoriel : rejouer les notes EXACTES du
// professeur (Narcisse : « quand je demande à Copilot de me jouer un lick joué
// dans le tutoriel, il n'est pas capable de le faire »).
const PLAY_TUTORIAL_PASSAGE_TOOL = {
  type: 'function',
  function: {
    name: 'play_tutorial_passage',
    description: 'Rejoue les notes EXACTES jouées par le professeur dans la vidéo du tutoriel entre deux instants (un lick, un voicing, un enchaînement), une main au choix, transposées si le pianiste veut l\'appliquer dans une autre tonalité. Prépare un exemple sous ta réponse (Écouter ; ses touches s\'allument en jaune). Pour un passage du tutoriel, n\'invente jamais les notes : utilise cet outil avec les moments de la frise des notes du professeur.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        start: { type: 'number', description: 'Début du passage dans la vidéo, en secondes.' },
        end: { type: 'number', description: 'Fin du passage, en secondes (30 s au plus après le début).' },
        hand: { type: 'string', enum: ['LH', 'RH', 'both'], description: 'Main à rejouer (both par défaut).' },
        transposeTo: { type: 'string', description: 'Tonalité d\'arrivée pour appliquer le passage à une autre chanson (ex. « F », « Sib »), depuis la tonalité du tutoriel.' },
        title: { type: 'string', description: 'Titre court de l\'exemple (ex. « Le lick de 1:12 »).' },
      },
      required: ['start', 'end'],
    },
  },
};

// [Claude] — 2026-09-25 — Exercice : faire entendre les voicings EXACTS de la carte
// (play_voicing et play_progression choisiraient d'autres voicings).
const PLAY_EXERCISE_TOOL = {
  type: 'function',
  function: {
    name: 'play_exercise',
    description: 'Fait entendre les accords de l\'exercice affiché avec les voicings EXACTS de la carte (main gauche et main droite), enchaînés comme à l\'exercice. Prépare un exemple sous ta réponse (Écouter). Pour l\'exercice en cours, utilise cet outil plutôt que play_voicing ou play_progression, qui choisiraient d\'autres voicings.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        chords: { type: 'string', description: '« current » (l\'accord à jouer maintenant, par défaut), « all » (tous les accords de la tonalité en cours), ou des noms d\'accords de la carte séparés par des espaces (ex. « Dm9 G13 »).' },
        title: { type: 'string', description: 'Titre court de l\'exemple.' },
      },
    },
  },
};

// [Claude] — 2026-09-25 — Rejouer le jeu EXACT du pianiste (Narcisse : « Copilot
// n'est pas capable de reproduire les morceaux que je joue dans la session MIDI »).
// Avant, il le recomposait avec ses propres voicings (play_progression…).
const PLAY_MY_PLAYING_TOOL = {
  type: 'function',
  function: {
    name: 'play_my_playing',
    description: 'Rejoue le jeu EXACT du pianiste : la session MIDI qu\'il t\'a confiée, ou le dernier passage qu\'il a joué au clavier (« Qu\'en penses-tu ? »). Mêmes notes, mêmes moments, même pédale, entre deux instants ; tout, la mélodie seule (voix du dessus), la main gauche ou la main droite ; transposable. Prépare un exemple sous ta réponse (Écouter ; ses touches s\'allument en jaune). Pour lui faire entendre SON jeu, utilise toujours cet outil : ne le recompose jamais avec play_progression, play_voicing ou play_note.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string', enum: ['session', 'passage'], description: 'session : la session MIDI confiée ; passage : le dernier passage joué au clavier. Par défaut : le passage s\'il y en a un dans la conversation, sinon la session.' },
        start: { type: 'number', description: 'Début, en secondes depuis le début de la session ou du passage (les moments m:ss,d du portrait : 1:12,4 = 72.4). 0 par défaut.' },
        end: { type: 'number', description: 'Fin, en secondes (60 s au plus après le début). Sans fin : jusqu\'à 60 s plus loin.' },
        part: { type: 'string', enum: ['tout', 'melodie', 'main_gauche', 'main_droite'], description: 'Ce qu\'on rejoue : tout (par défaut), la mélodie seule (la note la plus haute de chaque attaque, comme dans le bloc « Mélodie » du portrait), la main gauche ou la main droite.' },
        transposeTo: { type: 'string', description: 'Tonalité d\'arrivée pour l\'entendre ailleurs (ex. « F », « Sib »), depuis la tonalité du jeu.' },
        semitones: { type: 'integer', description: 'Ou un décalage en demi-tons, de -12 à 12.' },
        title: { type: 'string', description: 'Titre court de l\'exemple (ex. « Ta mélodie de 0:12 »).' },
      },
    },
  },
};

// [Claude] — 2026-09-26 — Melody chords (Narcisse : « la top note porte la mélodie,
// la basse est indépendante (cycle de quintes ou de tierces), on comble avec des
// notes de l'accord ») : l'application choisit les accords (melody-chords.js).
const PLAY_MELODY_CHORDS_TOOL = {
  type: 'function',
  function: {
    name: 'play_melody_chords',
    description: 'Harmonise une mélodie en « melody chords » : chaque note de la mélodie devient la note du dessus d\'un accord, la basse avance à part (cycle des quintes, des tierces, ou libre), la main droite comble sous la mélodie avec les notes de l\'accord (3ce et 7e d\'abord). L\'application choisit les accords et les voicings (main gauche et main droite), écrit l\'harmonisation sous ta réponse et prépare un exemple à écouter (touches en jaune). N\'invente pas d\'autres accords.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        melody: { type: 'string', description: 'La mélodie tapée : notes avec leur octave, durée en temps après « : » (1 par défaut). Ex. « Mi4 Ré4 Do4:2 » ou « E4 D4 C4:2 ».' },
        from: { type: 'string', enum: ['ma_session', 'mon_passage'], description: 'Ou la mélodie jouée par le pianiste : la voix du dessus de sa session confiée, ou de son dernier passage (« Qu\'en penses-tu ? »).' },
        start: { type: 'number', description: 'Avec from : début, en secondes (moments m:ss,d du portrait).' },
        end: { type: 'number', description: 'Avec from : fin, en secondes.' },
        key: { type: 'string', description: 'Tonalité (ex. « C », « Fa », « La mineur ») ; sinon celle du jeu, ou devinée d\'après la mélodie.' },
        bass: { type: 'string', enum: ['quintes', 'tierces', 'libre'], description: 'Mouvement de la basse : cycle des quintes (par défaut), des tierces, ou libre.' },
        every: { type: 'string', enum: ['note', 'temps-fort'], description: 'Un accord sous chaque note (par défaut), ou sous les notes longues seulement (les notes brèves passent sur l\'accord tenu).' },
        title: { type: 'string', description: 'Titre court de l\'exemple.' },
      },
    },
  },
};

/**
 * Exemple des accords de l'exercice (voicings de la carte), un accord toutes les
 * 1,6 s, chaque note avec son accord.
 * @param {object} exercise - contexte de l'exercice (exercise-context.js)
 * @param {{chords?: string, title?: string}} args
 */
export function exerciseExample(exercise, { chords = 'current', title = '' } = {}) {
  const list = exercise?.chords || [];
  if (!list.length) return null;
  const want = String(chords || 'current').trim();
  let picked;
  if (/^all$/i.test(want)) picked = list;
  else if (/^current$/i.test(want) || !want) picked = list.filter((c) => c.current);
  else {
    const names = want.split(/[\s,→>-]+/).filter(Boolean);
    picked = names.map((n) => list.find((c) => c.name === n)).filter(Boolean);
  }
  if (!picked.length) picked = list.filter((c) => c.current).length ? list.filter((c) => c.current) : list.slice(0, 1);
  const notes = picked.flatMap((c, i) => [
    ...c.lh.map((midi) => ({ midi, hand: 'LH', chord: c.name, startOffsetMs: i * 1600, durationMs: 1500, velocity: 0.7 })),
    ...c.rh.map((midi) => ({ midi, hand: 'RH', chord: c.name, startOffsetMs: i * 1600, durationMs: 1500, velocity: 0.72 })),
  ]);
  const example = buildNotesExample(notes, {
    kind: 'exercise',
    title: title || picked.map((c) => c.name).join(' → '),
    subtitle: `Voicings de la carte · ${exercise.title}`,
  });
  return example;
}

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * [Claude] — 2026-09-25 — Exemple du jeu exact du pianiste (play_my_playing).
 * @param {{session?: {events: object[], key?: string|null, offset?: number}, passage?: {events: object[], key?: string|null}}|null} playing
 *   session : évènements bruts de la session et transposition du clavier (offset),
 *   pour sonner comme sa relecture ; passage : notes entendues du dernier passage.
 * @param {{source?: string, start?: number, end?: number, part?: string, transposeTo?: string, semitones?: number, title?: string}} args
 * @returns {{example: object|null, note: string|null}} note : ce qu'il faut dire au pianiste
 */
export function myPlayingExample(playing, args = {}) {
  const wanted = args.source === 'session' || args.source === 'passage' ? args.source : null;
  const source = wanted && playing?.[wanted]?.events?.length ? wanted
    : playing?.passage?.events?.length ? 'passage'
      : playing?.session?.events?.length ? 'session' : null;
  if (!source) {
    return {
      example: null,
      note: wanted === 'passage' || !playing?.session
        ? '_(Je n\'ai pas ton jeu sous la main : pour une session, ouvre-la dans Sessions MIDI et clique sur « Analyser mon jeu avec le Copilot » ; pour ce que tu viens de jouer, clique sur « Qu\'en penses-tu ? » sous le clavier.)_'
        : '_(Je n\'ai pas de passage joué dans cette conversation : clique sur « Qu\'en penses-tu ? » sous le clavier après avoir joué.)_',
    };
  }
  const data = playing[source];
  let semitones = Number.isFinite(Number(args.semitones)) ? Math.round(Number(args.semitones)) : 0;
  let note = null;
  if (args.transposeTo) {
    if (data.key) semitones = transposeInterval(data.key, args.transposeTo);
    else note = '_(La tonalité de ton jeu n\'est pas connue : il est rejoué dans sa tonalité d\'origine.)_';
  }
  const start = Number.isFinite(Number(args.start)) ? Number(args.start) : 0;
  const end = args.end != null && Number.isFinite(Number(args.end)) ? Number(args.end) : null;
  const example = playingExample(data.events, {
    start, end, part: args.part, offset: source === 'session' ? data.offset || 0 : 0, semitones, title: args.title ? String(args.title) : '',
  });
  if (!example) {
    const where = end != null ? `entre ${formatTime(start)} et ${formatTime(end)}` : `après ${formatTime(start)}`;
    return { example: null, note: `_(Je ne trouve rien de joué ${where}${args.part && args.part !== 'tout' ? ' pour cette partie' : ''} dans ${source === 'session' ? 'ta session' : 'ton passage'}.)_` };
  }
  example.source = source;
  return { example, note };
}

// « Rejoue ma mélodie », « fais-moi réécouter ma main gauche », « peux-tu rejouer
// ce que j'ai joué à 0:30 » : une demande d'écoute (pas « je joue ma mélodie
// trop vite ? ») qui parle de SON jeu (message sans accents).
const REPLAY_VERB = /\b(?:rejoue[sz]?|rejouer|reecoute[sz]?|reecouter|reentendre|joue[sz]?[- ]moi|ecoute[sz]?[- ]moi|fais[- ]moi (?:re)?(?:entendre|ecouter)|(?:je veux|je voudrais|j'aimerais) (?:re)?(?:entendre|ecouter)|(?:peux|pourrais|pourriez)[- ](?:tu|vous) (?:me )?(?:re)?(?:jouer|faire (?:re)?(?:entendre|ecouter)))\b|(?:^|[.!?,;:]\s*)joue[sz]?\b/;
const MY_PLAYING = /\b(?:ma|mon|mes)\s+(?:session|passage|jeu|melodie|main|mains|morceau|phrase|ligne|accords?|impro(?:visation)?|intro|version|voicings?|basse|dessus|top notes?)\b|\bce que (?:j'ai|j ai|je viens de|je viens d'|je jouais)\b/;

/**
 * Demande d'entendre son propre jeu, et ce qu'elle précise (partie, moments,
 * tonalité), pour le routage hors IA vers play_my_playing ; null sinon.
 * @param {string} message
 * @param {{session?: boolean}} [options] - session confiée : « rejoue 0:30 » suffit
 * @returns {{part: string, start?: number, end?: number, transposeTo?: string}|null}
 */
export function myPlayingRequest(message, { session = false } = {}) {
  const text = String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
  const times = [...text.matchAll(/\b(\d{1,2}):(\d{2})(?:,(\d))?\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0));
  const asks = (REPLAY_VERB.test(text) && MY_PLAYING.test(text))
    || (session && times.length > 0 && /\b(?:rejoue[sz]?|rejouer|reecoute[sz]?|reecouter)\b/.test(text));
  if (!asks) return null;
  const part = /\b(?:melodie|voix du dessus|dessus|top notes?)\b/.test(text) ? 'melodie'
    : /\bmain gauche\b|\b(?:ma|la) basse\b/.test(text) ? 'main_gauche'
      : /\bmain droite\b/.test(text) ? 'main_droite' : 'tout';
  const request = { part };
  if (times.length >= 2) Object.assign(request, { start: times[0], end: times[1] });
  else if (times.length === 1) Object.assign(request, { start: Math.max(0, times[0] - 0.3), end: times[0] + 10 });
  if (/\b(?:transpos\w*|tonalite)\b/.test(text)) {
    const key = extractKey(text);
    if (key) request.transposeTo = `${KEY_NAMES[key.rootPc]}${key.minor ? 'm' : ''}`;
  }
  return request;
}

const BASS_WORDS = { quintes: 'en quintes', tierces: 'en tierces', libre: 'libre' };
const NO_MELODY_NOTE = '_(Je n\'ai pas trouvé de mélodie à harmoniser : écris ses notes avec leur octave, par exemple « Mi4 Ré4 Do4:2 » (« :2 » = deux temps), ou confie-moi ton jeu (Sessions MIDI : « Analyser mon jeu avec le Copilot » ; ou « Qu\'en penses-tu ? » sous le clavier) et demande « harmonise ma mélodie ».)_';

/**
 * [Claude] — 2026-09-26 — Melody chords (play_melody_chords) : la mélodie tapée, ou
 * la voix du dessus du jeu du pianiste (session : touches brutes + transposition du
 * clavier, comme sa relecture ; passage : notes entendues), harmonisée note par
 * note. L'harmonisation est écrite par l'application sous la réponse (le modèle ne
 * l'invente pas) ; l'exemple joue chaque accord tenu jusqu'au suivant, la mélodie
 * dessus.
 * @param {{melody?: string, from?: string, start?: number, end?: number, key?: string, bass?: string, every?: string, title?: string}} args
 * @param {object|null} playing - jeu du pianiste (voir myPlayingExample)
 * @returns {{example: object|null, text: string|null, note: string|null}}
 */
export function melodyChordsExample(args = {}, playing = null) {
  let melody = [];
  let key = args.key ? String(args.key) : null;
  let mine = false;
  if (args.melody) {
    melody = parseMelodyText(args.melody);
  } else if (args.from === 'ma_session' || args.from === 'mon_passage') {
    const data = args.from === 'ma_session' ? playing?.session : playing?.passage;
    if (!data?.events?.length) return { example: null, text: null, note: NO_MELODY_NOTE };
    const start = Number.isFinite(Number(args.start)) ? Number(args.start) : 0;
    const end = args.end != null && Number.isFinite(Number(args.end)) ? Number(args.end) : Infinity;
    const offset = args.from === 'ma_session' ? data.offset || 0 : 0;
    const notes = extractMelody(data.events).filter((n) => n.start >= start - 0.02 && n.start < end).slice(0, MELODY_CHORDS_MAX);
    const t0 = notes.length ? notes[0].start : 0;
    melody = notes.map((n) => ({ midi: n.midi + offset, beats: Math.max(0.2, n.end - n.start), start: n.start - t0 }));
    if (!key && data.key) key = data.key;
    mine = true;
  }
  const result = melody.length ? harmonizeMelody(melody, { key, bass: args.bass, every: args.every === 'temps-fort' ? 'temps-fort' : 'note' }) : null;
  if (!result) return { example: null, text: null, note: NO_MELODY_NOTE };
  const harmonized = result.chords.filter((c) => !c.passing);
  const ms = (seconds) => Math.round(seconds * 1000);
  const notes = [];
  result.chords.forEach((c, i) => {
    if (!c.passing) {
      // L'accord tenu jusqu'au suivant, la mélodie avec sa durée.
      const next = result.chords.slice(i + 1).find((x) => !x.passing);
      const hold = Math.max(0.3, (next ? next.start : c.start + c.beats) - c.start);
      c.leftHand.forEach((midi) => notes.push({ midi, startOffsetMs: ms(c.start), durationMs: ms(hold), velocity: 0.6, hand: 'LH' }));
      c.rightHand.filter((midi) => midi !== c.melody).forEach((midi) => notes.push({ midi, startOffsetMs: ms(c.start), durationMs: ms(hold), velocity: 0.56, hand: 'RH' }));
    }
    notes.push({ midi: c.melody, startOffsetMs: ms(c.start), durationMs: ms(Math.max(0.2, c.beats)), velocity: 0.8, hand: 'RH' });
  });
  const grid = harmonized.slice(0, 4).map((c) => c.chord).join(' → ') + (harmonized.length > 4 ? ' …' : '');
  const example = buildNotesExample(notes, {
    kind: 'melody-chords',
    title: args.title ? String(args.title) : `Melody chords · ${grid}`,
    subtitle: `${mine ? 'Ta mélodie' : 'La mélodie'} au-dessus · basse ${BASS_WORDS[result.bass]} · ${result.key.label}${result.key.guessed ? ' (devinée)' : ''}`,
  });
  if (!example) return { example: null, text: null, note: NO_MELODY_NOTE };
  example.chords = harmonized.map((c) => ({ name: c.chord, leftHand: c.leftHand, rightHand: c.rightHand }));
  // Écrit sans « en <tonalité> » ni « tonalité : » (voir checkKeyAffirmation).
  const shown = harmonized.slice(0, 12).map((c) => `${frenchNoteName(c.melody, c.chord)} sur **${c.chord}** (${c.role})`);
  const more = harmonized.length > 12 ? ` → … (${harmonized.length - 12} accords de plus dans l'exemple)` : '';
  const text = `**Melody chords** (basse ${BASS_WORDS[result.bass]} · ${result.key.label}${result.key.guessed ? ', devinée' : ''}) : ${shown.join(' → ')}${more}.`;
  return { example, text, note: null };
}

const TYPED_NOTE = /^(?:do|ré|re|mi|fa|sol|la|si|[a-g])(?:#|b|♯|♭)?\d(?::\d+(?:[.,]\d+)?)?$/i;
// Son jeu à lui : « ma mélodie », « ma session », « ce que j'ai joué » (message sans accents).
const MY_MELODY = /\b(?:ma|mon|mes)\s+(?:melodie|jeu|session|passage|notes|dessus|top notes?)\b|\bce que (?:j'ai|j ai|je viens de|je viens d')/;
const normalized = (message) => String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
/** Notes tapées avec leur octave (« la » seul est un article, pas une note). */
const typedNotes = (message) => String(message || '').split(/[\s;|→>]+|,(?!\d)/)
  .map((t) => t.replace(/[.!?)(«»"]+$|^[(«»"]+/g, '')).filter((t) => TYPED_NOTE.test(t));

/**
 * Vrai si le message demande des melody chords : « melody chords », « mets des
 * accords sous… », ou « harmonise » avec une mélodie (tapée, ou la sienne). Pas
 * « explique-moi l'harmonisation d'un 2-5-1 ».
 */
export function wantsMelodyChords(message) {
  const text = normalized(message);
  if (/\bmelody[- ]?chords?\b/.test(text)) return true;
  if (/\b(?:mets?|mettre|ajoute[rsz]?)\b[^?.!]*\baccords?\b[^?.!]*\bsous\b/.test(text)) return true;
  return /\bharmonis\w*\b/.test(text) && (/\bmelodie\b/.test(text) || MY_MELODY.test(text) || typedNotes(message).length >= 3);
}

/**
 * Demande de melody chords et ce qu'elle précise (mélodie tapée, ou jeu du
 * pianiste ; basse ; tonalité), pour le routage hors IA vers play_melody_chords ;
 * null si ce n'est pas une demande de melody chords ou s'il n'y a pas de mélodie.
 * @param {string} message
 * @param {{playing?: object|null}} [options]
 * @returns {{melody?: string, from?: string, bass?: string, key?: string, every?: string}|null}
 */
export function melodyChordsRequest(message, { playing = null } = {}) {
  if (!wantsMelodyChords(message)) return null;
  const text = normalized(message);
  const request = {};
  // Mélodie tapée (trois notes au moins), ou la sienne quand il en parle (« ma mélodie »).
  const typed = typedNotes(message);
  if (typed.length >= 3) request.melody = typed.join(' ');
  else if (MY_MELODY.test(text) && (playing?.session?.events?.length || playing?.passage?.events?.length)) {
    const session = /\b(?:ma|la) session\b/.test(text) || !playing.passage?.events?.length;
    request.from = session && playing.session?.events?.length ? 'ma_session' : 'mon_passage';
  } else return null;
  if (/\btierces?\b/.test(text)) request.bass = 'tierces';
  else if (/\blibre\b/.test(text)) request.bass = 'libre';
  else if (/\bquintes?\b/.test(text)) request.bass = 'quintes';
  if (/\btemps[- ]forts?\b|\bnotes longues\b/.test(text)) request.every = 'temps-fort';
  const key = extractKey(text);
  if (key) request.key = `${KEY_NAMES[key.rootPc]}${key.minor ? 'm' : ''}`;
  return request;
}

const SUGGEST_ACTIONS_TOOL = {
  type: 'function',
  function: {
    name: 'suggest_actions',
    description: 'Propose 2 à 4 actions contextuelles cliquables pour poursuivre la conversation. À utiliser quand la réponse ouvre naturellement une suite (exemple : après avoir expliqué un accord, proposer "Démontrer au clavier", "Main gauche", "Voicing drop 2", "Appliquer sur II-V-I"). Ne pas utiliser pour reformuler la réponse.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: {
                type: 'string',
                description: 'Texte court du bouton (3 à 25 caractères).',
              },
              message: {
                type: 'string',
                description: 'Message exact à envoyer au Copilot quand l\'utilisateur clique sur le bouton.',
              },
            },
            required: ['label', 'message'],
          },
          description: 'Liste de 2 à 4 suggestions.',
        },
      },
      required: ['actions'],
    },
  },
};

const PLAY_VOICING_TOOL = {
  type: 'function',
  function: {
    name: 'play_voicing',
    description: 'Joue UN SEUL accord avec une intention pianistique complète (main gauche / main droite / technique / pattern). À utiliser pour montrer un accord isolé, un voicing ou une position pianistique réelle. Tu ne peux appeler play_voicing qu\'UNE SEULE FOIS par réponse : choisis l\'accord le plus représentatif ou le plus demandé par le pianiste. Pour une progression entière, utilise play_voicing une seule fois sur l\'accord principal, puis explique la suite.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        chordSymbol: {
          type: 'string',
          description: 'Symbole d\'accord, ex. "Cmaj7", "Dm9", "G13", "C#13b9", "G7alt".',
        },
        styleId: {
          type: 'string',
          description: 'Style musical : "auto", "worship", "gospel", "jazz", "neoSoul". Laisse "auto" si tu n\'as pas de préférence.',
        },
        technique: {
          type: 'string',
          description: 'Technique de voicing préférée : "close", "drop2", "rootless", "quartal". Laisse vide pour laisser le style décider.',
        },
        context: {
          type: 'string',
          description: 'Contexte pianistique : "accompaniment" (accompagnement, par défaut) ou "solo".',
        },
        pattern: {
          type: 'string',
          description: 'Pattern rythmique : "block" (plaqué), "arppegio-up" (arpège grave→aigu), "arppegio-down" (aigu→grave), "rolled" (enroulé).',
        },
        durationMs: {
          type: 'integer',
          description: 'Durée totale de l\'accord en millisecondes, entre 200 et 3000 (défaut 1200).',
        },
        startOffsetMs: {
          type: 'integer',
          description: 'Délai avant le début de cet accord dans une démonstration, entre 0 et 8000.',
        },
        impliedChordName: {
          type: 'string',
          description: 'Nom de l\'accord pour validation interne.',
        },
        impliedRomanNumeral: {
          type: 'string',
          description: 'Degré en chiffres romains, si applicable.',
        },
        impliedKey: {
          type: 'string',
          description: 'Tonalité de référence, si applicable.',
        },
      },
      required: ['chordSymbol'],
    },
  },
};

const PLAY_LICK_TOOL = {
  type: 'function',
  function: {
    name: 'play_lick',
    description: 'Génère et joue UN SEUL lick, riff ou fill pianistique sur un accord cible. Tu ne peux appeler play_lick qu\'UNE SEULE FOIS par réponse. À utiliser quand le pianiste demande un lick, un riff, une phrase mélodique courte ou un ornement. L\'application produira automatiquement des notes MIDI réellement jouables.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: {
          type: 'string',
          description: 'Symbole d\'accord cible, ex. "Cmaj7", "Dm7", "G7", "C7alt".',
        },
        styleId: {
          type: 'string',
          description: 'Style musical : "auto", "worship", "gospel", "jazz", "neoSoul".',
        },
        hand: {
          type: 'string',
          description: 'Main qui joue le lick : "RH" (main droite, défaut), "LH" (main gauche), "both" (les deux mains).',
        },
        difficulty: {
          type: 'string',
          description: 'Niveau de difficulté : "beginner", "intermediate" (défaut), "advanced".',
        },
        lengthBeats: {
          type: 'integer',
          description: 'Longueur du lick en temps, entre 2 et 8 (défaut 4).',
        },
        startOffsetMs: {
          type: 'integer',
          description: 'Délai avant le début du lick dans une démonstration, entre 0 et 8000.',
        },
      },
      required: ['target'],
    },
  },
};

const PLAY_PROGRESSION_TOOL = {
  type: 'function',
  function: {
    name: 'play_progression',
    description: 'Joue une progression ou un enchaînement d\'accords (ex. ii-V-I, 7→3, guide tones). Tu ne peux appeler play_progression qu\'UNE SEULE FOIS par réponse. L\'application génère automatiquement les notes de chaque accord avec main gauche (basse) et main droite (accord / guide tone).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        chords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Liste des symboles d\'accords à enchaîner, ex. ["Dm7", "G7", "Cmaj7"].',
        },
        focus: {
          type: 'string',
          description: 'Focus pédagogique : "7-to-3" pour entendre la résolution 7→3, "3-to-7" pour l\'inverse, "guide-tones-only" pour seulement 3e/7e, "full" pour les accords complets (défaut).',
        },
        styleId: {
          type: 'string',
          description: 'Style musical : "auto", "worship", "gospel", "jazz" (défaut), "neoSoul".',
        },
        pattern: {
          type: 'string',
          description: 'Pattern rythmique : "block" (plaqué, défaut), "arppegio-up", "arppegio-down", "rolled".',
        },
        durationMs: {
          type: 'integer',
          description: 'Durée totale de la progression en millisecondes, entre 500 et 6000 (défaut 2000).',
        },
        startOffsetMs: {
          type: 'integer',
          description: 'Délai avant le début de la progression dans une démonstration, entre 0 et 8000.',
        },
      },
      required: ['chords'],
    },
  },
};

/** Numéro MIDI valide (21–108), sinon null : une note hors du clavier est ignorée. */
function clampMidiStrict(midi) {
  const n = Number.isFinite(midi) ? Math.round(midi) : NaN;
  if (Number.isNaN(n) || n < 21 || n > 108) return null;
  return n;
}

function safeDuration(durationMs) {
  const n = Number.isFinite(durationMs) ? Math.round(durationMs) : NaN;
  if (Number.isNaN(n)) return 800;
  return Math.max(50, Math.min(3000, n));
}

function safeVelocity(velocity) {
  const n = Number.isFinite(velocity) ? velocity : NaN;
  if (Number.isNaN(n)) return 0.8;
  return Math.max(0, Math.min(1, n));
}

function safeStartOffset(startOffsetMs) {
  const n = Number.isFinite(startOffsetMs) ? Math.round(startOffsetMs) : NaN;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(8000, n));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToName(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

const NOTE_NAME_TO_MIDI = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function noteNameToMidi(name) {
  const normalized = String(name || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/^([A-G])(#|b)?(-?\d+)$/i);
  if (!match) return null;
  const letter = match[1].toUpperCase();
  const accidental = match[2] || '';
  const octave = parseInt(match[3], 10);
  const pc = NOTE_NAME_TO_MIDI[`${letter}${accidental}`];
  if (pc === undefined) return null;
  const midi = (octave + 1) * 12 + pc;
  if (midi < 21 || midi > 108) return null;
  return midi;
}

/**
 * Repli sans outils : balises [PLAY_NOTE: C4, E4, G4] du texte. Comme les
 * outils, elles préparent un exemple (rien ne joue avant l'affichage) ; une
 * balise = un accord plaqué, tenu, puis le suivant.
 */
function parsePlayNoteAnnotations(content) {
  const notes = [];
  const regex = /\[PLAY_NOTE:\s*([^\]]+)\]/gi;
  let match;
  let groupStartOffsetMs = 0;
  while ((match = regex.exec(content)) !== null) {
    const names = (match[1] || '').split(',').map((n) => n.trim()).filter(Boolean);
    const midis = names.map(noteNameToMidi).filter((m) => m !== null);
    midis.forEach((midi) => notes.push({ midi, velocity: 0.7, durationMs: 1400, startOffsetMs: groupStartOffsetMs }));
    if (midis.length) groupStartOffsetMs += 1600;
  }
  const example = buildNotesExample(notes, { kind: 'notes', title: `${notes.length} note${notes.length > 1 ? 's' : ''}`, subtitle: 'Notes citées dans la réponse' });
  const played = notes.map((n) => ({ midi: n.midi, name: midiToName(n.midi), startOffsetMs: n.startOffsetMs }));
  return { played, ignored: 0, suggestions: [], example };
}

/**
 * Nouvelle question : l'exemple en cours s'arrête (les exemples ne jouent plus
 * d'eux-mêmes, voir executeToolCalls).
 */
export function cancelPendingCopilotNotes() {
  if (typeof document !== 'undefined' && document.dispatchEvent && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('copilot-stop-example'));
  }
}

// [Claude] — 2026-09-24 — Le pianiste demande à entendre (« joue-moi », « fais-moi
// écouter », « je veux entendre », « démo »…) : l'exemple démarre tout seul, une
// fois la réponse affichée. Une question (« explique-moi un 2-5-1 », « comment
// jouer un 2-5-1 ? ») n'en est pas une : l'exemple attend son clic sous le texte.
// Le message est lu sans accents (« écoute » → « ecoute ») : en JavaScript, \b ne
// voit pas de frontière de mot devant un « é ».
const HEAR_PATTERNS = [
  /(?<!\b(?:je|on) )\b(?:re)?joue[sz]?\b/, // joue-moi, rejoue, jouez (pas « je joue »)
  /\b(?:peux|pourrais|pourriez|veux|voudrais)[- ](?:tu|vous)\b[^?.!]*\bjouer\b/, // peux-tu me jouer…
  /\btu (?:peux|pourrais|veux)\b[^?.!]*\bjouer\b/,
  /\b(?:re)?(?:entendre|ecouter|ecoute[sz]?)\b/, // écoute, fais-moi entendre, réécoute
  /\bdemo(?:nstration)?s?\b/,
  /\b(?:montre|plaque)[sz]?[- ]moi\b/,
  /\bfais[- ]moi (?:un|une|des|le|la|les) (?:lick|riff|fill|arpege|exemple|demo)/,
];

/** Vrai si le message demande d'entendre l'exemple tout de suite. */
export function wantsToHear(message) {
  const text = String(message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/’/g, "'").toLowerCase();
  return HEAR_PATTERNS.some((re) => re.test(text));
}

/**
 * Accords de l'exemple préparé à partir de la question : ceux que la réponse
 * écrit, s'ils forment la même suite (« **Dm9 → G13 → Cmaj9** » pour « un
 * 2-5-1 ») ; l'exemple entendu est alors celui qu'on lit. Sinon, ceux de la
 * question.
 * @param {string[]} chords - accords tirés de la question
 * @param {string} reply - texte de la réponse
 * @param {{keyGiven?: boolean}} [options] - tonalité donnée par le pianiste
 */
export function exampleChordsFromReply(chords, reply, { keyGiven = false } = {}) {
  const written = chordSymbolsInText(reply);
  if (written.length !== chords.length) return chords;
  if (written.every((c, i) => chordRootPc(c) === chordRootPc(chords[i]))) return written;
  // La réponse a choisi une autre tonalité : on suit la réponse, sauf si
  // le pianiste en avait demandé une.
  return keyGiven ? chords : written;
}

const LETTER_PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function chordRootPc(symbol) {
  const m = String(symbol || '').match(/^([A-G])([#b]?)/);
  if (!m) return null;
  return (LETTER_PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** Un résultat de relance sans exemple garde celui de la première réponse. */
function keepExample(next, previous) {
  if (next?.example || !previous?.example) return next;
  return { ...next, example: previous.example, played: previous.played, voicing: next.voicing || previous.voicing };
}

// Techniques demandées au Copilote → techniques de l'Exercice.
const TECHNIQUE_TO_EXERCISE = {
  close: 'close', drop2: 'drop2', drop3: 'drop3', 'drop2-4': 'drop2_4', drop2_4: 'drop2_4',
  rootless: 'rootless', quartal: 'quartal', shell: 'shell', spread: 'spread', open: 'open',
  block: 'block', upper_structure: 'upper_structure', 'upper-structure': 'upper_structure', cluster: 'cluster',
};

/**
 * Exécute les tool_calls du modèle. [Claude] — 2026-09-24 — Rien n'est joué ici :
 * les outils audio préparent un EXEMPLE (voir copilot-demo.js) que l'onglet
 * affiche sous la réponse et fait écouter d'un clic (ou tout seul, une fois le
 * texte affiché, si le pianiste a demandé à entendre). Avant, les notes partaient
 * pendant que la réponse se préparait, avant l'explication.
 *
 * Un seul outil audio par réponse : play_progression > play_voicing > play_lick
 * > play_note. suggest_actions s'exécute tel quel.
 *
 * @param {object[]} toolCalls
 * @param {string} [assistantContent]
 * @param {{styleId?: string}} [options] - style choisi dans le Copilote
 * @returns {{played: object[], ignored: number, suggestions: object[], voicing: object|null, example: object|null, content?: string}}
 */
export function executeToolCalls(toolCalls, assistantContent = '', { styleId = 'auto', tutorial = null, exercise = null, playing = null } = {}) {
  const suggestions = [];
  let played = [];
  let ignored = 0;
  let capturedVoicing = null;
  let example = null;
  let content = assistantContent;
  const noteCalls = [];
  if (!Array.isArray(toolCalls)) return { played, ignored, suggestions, voicing: capturedVoicing, example };

  const audioPriorities = { play_my_playing: -1, play_melody_chords: -1, play_tutorial_passage: -1, play_exercise: -1, play_progression: 0, play_voicing: 1, play_lick: 2, play_note: 3 };
  let dominantAudioTool = null;
  let dominantPriority = Infinity;
  for (const call of toolCalls) {
    const p = audioPriorities[call?.function?.name];
    if (p != null && p < dominantPriority) {
      dominantPriority = p;
      dominantAudioTool = call.function.name;
    }
  }

  const collapsed = isVirtualKeyboardCollapsed();
  const parseArgs = (call) => {
    try {
      return JSON.parse(call.function.arguments || '{}');
    } catch (_) {
      return null;
    }
  };
  const unplayable = (what, diag) => {
    const note = `_(Je n'ai pas trouvé d'exemple jouable pour **${what}**${diag ? ` : ${diag}` : ''}. Essaie avec un autre accord.)_`;
    content = content ? `${content}\n\n${note}` : note;
  };

  for (const call of toolCalls) {
    const fn = call?.function?.name;
    if (audioPriorities[fn] != null && fn !== dominantAudioTool) {
      ignored += 1;
      continue;
    }
    if (fn === 'play_tutorial_passage') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const notes = tutorial?.noteEvents || [];
      if (!args || !notes.length) {
        ignored += 1;
        const note = '_(Je n\'ai pas les notes exactes jouées par le professeur dans cette vidéo : l\'application n\'a pas pu lire son clavier. Je peux te faire entendre un exemple équivalent de l\'application.)_';
        content = content ? `${content}\n\n${note}` : note;
        continue;
      }
      let semitones = 0;
      if (args.transposeTo) {
        semitones = tutorial.key ? transposeInterval(tutorial.key, args.transposeTo) : 0;
        if (!tutorial.key) content = `${content || ''}\n\n_(Tonalité du tutoriel inconnue : le passage est joué dans sa tonalité d'origine.)_`;
      }
      example = passageExample(notes, {
        start: Number(args.start), end: Number(args.end), hand: args.hand === 'both' ? null : args.hand, semitones, title: args.title ? String(args.title) : '',
      });
      if (!example) {
        ignored += 1;
        const note = `_(Aucune note du professeur n'a été lue entre ${formatTime(Number(args.start))} et ${formatTime(Number(args.end))}.)_`;
        content = content ? `${content}\n\n${note}` : note;
      }
    } else if (fn === 'play_my_playing') {
      // [Claude] — 2026-09-25 — Le jeu exact du pianiste (session ou dernier passage).
      if (example) { ignored += 1; continue; }
      const mine = myPlayingExample(playing, parseArgs(call) || {});
      example = mine.example;
      if (!example) ignored += 1;
      if (mine.note) content = content ? `${content}\n\n${mine.note}` : mine.note;
    } else if (fn === 'play_melody_chords') {
      // [Claude] — 2026-09-26 — Melody chords : accords choisis et écrits par l'application.
      if (example) { ignored += 1; continue; }
      const chords = melodyChordsExample(parseArgs(call) || {}, playing);
      example = chords.example;
      if (!example) ignored += 1;
      const extra = chords.text || chords.note;
      if (extra) content = content ? `${content}\n\n${extra}` : extra;
    } else if (fn === 'play_exercise') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call) || {};
      example = exercise ? exerciseExample(exercise, { chords: args.chords, title: args.title ? String(args.title) : '' }) : null;
      if (!example) {
        ignored += 1;
        const note = '_(Aucun exercice n\'est affiché : ouvre l\'onglet Exercices pour que je fasse entendre ses voicings.)_';
        content = content ? `${content}\n\n${note}` : note;
      }
    } else if (fn === 'suggest_actions') {
      const args = parseArgs(call);
      const list = Array.isArray(args?.actions) ? args.actions : [];
      if (list.length > 0) suggestions.push(...list.filter((a) => a && typeof a.label === 'string' && typeof a.message === 'string'));
      else ignored += 1;
    } else if (fn === 'play_note') {
      const args = parseArgs(call);
      const midi = args ? clampMidiStrict(args.midi) : null;
      if (midi === null) { ignored += 1; continue; }
      const note = {
        midi,
        velocity: safeVelocity(args.velocity),
        durationMs: safeDuration(args.durationMs),
        startOffsetMs: safeStartOffset(args.startOffsetMs),
      };
      if (args.impliedChordName) note.impliedChordName = String(args.impliedChordName);
      if (args.impliedRomanNumeral) note.impliedRomanNumeral = String(args.impliedRomanNumeral);
      if (args.impliedKey) note.impliedKey = String(args.impliedKey);
      noteCalls.push(note);
    } else if (fn === 'play_voicing') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const chordSymbol = String(args?.chordSymbol || '').trim();
      if (!chordSymbol) { ignored += 1; continue; }
      const technique = TECHNIQUE_TO_EXERCISE[String(args.technique || '').toLowerCase()] || 'auto';
      // Rootless demandé : le voicing tel quel, plaqué, sans la basse que la démo lui ajouterait.
      const pattern = technique === 'rootless' ? 'block' : args.pattern;
      example = buildChordExample([chordSymbol], { styleId: args.styleId && args.styleId !== 'auto' ? args.styleId : styleId, technique, pattern });
      if (example) {
        const hands = example.chords[0];
        capturedVoicing = { isPlayable: true, chordSymbol: hands.name || chordSymbol, leftHand: hands.leftHand, rightHand: hands.rightHand, technique: hands.technique, diagnostics: [] };
        continue;
      }
      // Accord inconnu du moteur de l'Exercice : l'ancien générateur, rythmé posément.
      const voicing = generateCopilotVoicing(chordSymbol, { styleId: args.styleId || 'auto', technique: args.technique || undefined, context: args.context === 'solo' ? 'solo' : 'accompaniment' });
      capturedVoicing = voicing;
      if (!voicing.isPlayable) {
        ignored += 1;
        unplayable(chordSymbol, voicing.diagnostics.join(' ; '));
        continue;
      }
      example = buildNotesExample(voicingToNoteSequence(voicing, { pattern: 'rolled', startOffsetMs: 0, durationMs: 2600 }), {
        kind: 'voicing', title: chordSymbol, subtitle: 'Voicing à deux mains',
      });
    } else if (fn === 'play_lick') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const target = String(args?.target || '').trim();
      if (!target) { ignored += 1; continue; }
      const lick = generateCopilotLick(target, {
        styleId: args.styleId || styleId || 'auto',
        hand: ['RH', 'LH', 'both'].includes(args.hand) ? args.hand : 'RH',
        difficulty: ['beginner', 'intermediate', 'advanced'].includes(args.difficulty) ? args.difficulty : 'intermediate',
        lengthBeats: Math.max(2, Math.min(8, Number.isFinite(args.lengthBeats) ? args.lengthBeats : 4)),
        startOffsetMs: 0,
      });
      if (!lick.isPlayable) {
        ignored += 1;
        unplayable(target, lick.diagnostics.join(' ; '));
        continue;
      }
      example = buildNotesExample(lick.notes, { kind: 'lick', title: `Lick sur ${target}`, subtitle: 'Phrase générée pour l\'accord' });
    } else if (fn === 'play_progression') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const chords = Array.isArray(args?.chords) ? args.chords.filter((c) => typeof c === 'string' && c.trim()) : [];
      if (chords.length === 0) { ignored += 1; continue; }
      const focus = ['7-to-3', '3-to-7', 'guide-tones-only', 'full'].includes(args.focus) ? args.focus : 'full';
      const chosenStyle = args.styleId && args.styleId !== 'auto' ? args.styleId : styleId;
      if (focus === 'full') {
        example = buildChordExample(chords, { styleId: chosenStyle, pattern: args.pattern });
        if (example) continue;
      }
      // Guide tones (ou accords inconnus du moteur) : le générateur pédagogique,
      // une mesure posée par accord (1,6 s) au lieu de 2 s pour toute la grille.
      const durationMs = Math.max(1600 * chords.length, Number.isFinite(args.durationMs) ? args.durationMs : 0);
      const progression = generateCopilotProgression(chords, { focus, styleId: chosenStyle || 'auto', durationMs: Math.min(8000, durationMs), startOffsetMs: 0 });
      if (!progression.isPlayable) {
        ignored += 1;
        unplayable(chords.join(' → '), progression.diagnostics.join(' ; '));
        continue;
      }
      example = buildNotesExample(progressionToNoteSequence(progression, { pattern: 'block' }), {
        kind: 'progression',
        title: chords.join(' → '),
        subtitle: focus === 'full' ? 'Accords à deux mains' : `Focus : ${describeProgressionFocus(focus)}`,
      });
    } else {
      ignored += 1;
    }
  }

  if (!example && noteCalls.length > 0) {
    example = buildNotesExample(noteCalls, { kind: 'notes', title: noteCalls.length === 1 ? 'Une note' : `${noteCalls.length} notes`, subtitle: 'Notes demandées au clavier' });
    // Notes jouées telles quelles, métadonnées comprises (contrôles de cohérence).
    played = noteCalls.map((n) => ({ ...n, name: midiToName(n.midi) }));
  } else if (example) {
    played = eventsToPlayed(example.events, example.tempo);
  }

  const result = { played, ignored, suggestions, voicing: capturedVoicing, example };
  if (content !== assistantContent) result.content = content;
  if (collapsed && toolCalls.length > 0) result.keyboardCollapsed = true;
  return result;
}

function isVirtualKeyboardCollapsed() {
  try {
    const panel = document.getElementById('keyboard-panel');
    return Boolean(panel?.classList.contains('collapsed'));
  } catch (_) {
    return false;
  }
}

function formatContext(context, options = {}) {
  const lines = [];
  const type = context?.type;

  if (type === 'session') {
    lines.push('## Session MIDI en cours');
    lines.push(`Nom : ${context.name || 'inconnue'}`);
    if (context.source) lines.push(`Origine : ${context.source}`);
    if (context.duration != null) lines.push(`Durée : ${formatDuration(context.duration)}`);
    if (context.tempo) lines.push(`Tempo : ${context.tempo} BPM`);
    if (context.key) lines.push(`Tonalité : ${context.key}`);
    if (Number.isFinite(context.noteCount)) lines.push(`Notes jouées : ${context.noteCount}`);
    if (Number.isFinite(context.chordCount)) lines.push(`Accords détectés : ${context.chordCount}`);
    // [Claude] — 2026-09-25 — Portrait de la session (notes exactes, voicings,
    // constats détaillés) : il remplace la grille seule et les constats en bloc.
    const hasPortrait = Array.isArray(context.portrait) && context.portrait.length > 0;
    if (hasPortrait) {
      lines.push('');
      lines.push(...context.portrait);
    }
    if (!hasPortrait && context.chords?.length) {
      lines.push('');
      lines.push('## Accords / notes détectés dans la session');
      for (const c of context.chords.slice(0, 32)) {
        const start = formatTime(c.start);
        const label = c.label || '?';
        lines.push(`- ${start} : ${label}`);
      }
      if (context.chords.length > 32) {
        lines.push(`... et ${context.chords.length - 32} éléments supplémentaires.`);
      }
    }
    if (context.comments) {
      lines.push('');
      lines.push('## Commentaires de la session');
      lines.push(context.comments);
    }
    // [Claude] — 2026-09-24 — Analyse du jeu : ce que l'application a mesuré.
    if (!hasPortrait && context.performance?.lines?.length) {
      lines.push('');
      lines.push("## Constats de l'analyse du jeu (mesurés par l'application sur le MIDI)");
      lines.push(...context.performance.lines);
    }
    // [Claude] — 2026-09-25 — Son jeu exact, à rejouer (play_my_playing).
    if (context.playing?.session?.events?.length) {
      lines.push('');
      lines.push('Pour lui faire entendre son jeu (tout, sa mélodie, une main, un moment, transposé) : play_my_playing (source « session »).');
      const offset = context.playing.session.offset || 0;
      if (offset) lines.push(`Transposition du clavier en cours : ${offset > 0 ? '+' : ''}${offset} demi-ton${Math.abs(offset) > 1 ? 's' : ''} (la relecture et play_my_playing sonnent ${Math.abs(offset)} demi-ton${Math.abs(offset) > 1 ? 's' : ''} plus ${offset > 0 ? 'haut' : 'bas'} que les notes écrites ici).`);
    }
  } else if (type === 'tutorial') {
    lines.push('## Tutoriel en cours');
    lines.push(`Fichier : ${context?.name || 'inconnu'}`);
    if (context?.key) lines.push(`Tonalité détectée : ${context.key}`);
    // [Claude] — 2026-09-25 — D'où vient le relevé, et ce que le Copilote peut en faire.
    if (context?.sourceLabel) lines.push(`Relevé : ${context.sourceLabel}`);
    if (context?.summary) {
      lines.push('');
      lines.push("## Résumé du cours (déjà montré au pianiste)");
      lines.push(String(context.summary));
    }

    if (context?.chords?.length) {
      lines.push('');
      lines.push('## Grille relevée');
      for (const c of context.chords) {
        const start = formatTime(c.start);
        const label = c.label || '?';
        lines.push(`- ${start} : ${label}`);
      }
    }

    if (context?.transcript?.length) {
      lines.push('');
      lines.push('## Transcription');
      for (const line of context.transcript) {
        const time = formatTime(line.start);
        lines.push(`[${time}] ${line.text || ''}`);
      }
    }
    lines.push('');
    if (context?.notesTimeline?.length) {
      lines.push('## Notes jouées par le professeur (moment accord : main gauche | main droite · puis la ligne jouée)');
      lines.push(...context.notesTimeline);
      lines.push("Pour faire entendre un passage, un lick ou un voicing du professeur : play_tutorial_passage (start, end en secondes ; hand ; transposeTo pour l'appliquer dans une autre tonalité).");
    } else {
      lines.push(`Notes jouées par le professeur : non disponibles (${context?.notesUnavailable || "le clavier de la vidéo n'a pas pu être lu"}). Tu ne peux pas rejouer ses licks à l'identique : dis-le simplement et propose un exemple de l'application.`);
    }
  } else if (type === 'exercise') {
    // [Claude] — 2026-09-25 — L'exercice affiché (onglet Exercices) : voicings exacts, étape, essais.
    lines.push(...exerciseContextLines(context));
    lines.push("Pour faire entendre les accords de la carte tels quels : play_exercise (chords : « current », « all » ou leurs noms).");
  }

  // [Claude] — 2026-09-25 — « Qu'en penses-tu ? » : portrait du passage joué.
  if (Array.isArray(context?.take) && context.take.length) {
    lines.push('');
    lines.push(...context.take);
    if (context.playing?.passage?.events?.length) lines.push('Pour lui faire réentendre ce passage (ou une partie : sa mélodie, une main, un moment) : play_my_playing (source « passage »).');
    lines.push('');
  }

  lines.push(`Clavier MIDI virtuel : ${isVirtualKeyboardCollapsed() ? 'masqué' : 'visible'}`);
  if (options.copilotStyleId) {
    const styleLabel = listCopilotStyles().find((s) => s.id === options.copilotStyleId)?.label || options.copilotStyleId;
    lines.push(`Style pianistique demandé par l'utilisateur : ${styleLabel}`);
  }

  return lines.join('\n');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const DEMO_ANNOUNCEMENT_PATTERNS = [
  /voici la démonstration/i,
  /je vais te (jouer|montrer|faire entendre)/i,
  /je vais vous (jouer|montrer|faire entendre)/i,
  /je te joue/i,
  /laisse-moi te (jouer|montrer)/i,
  /laisse-moi vous (jouer|montrer)/i,
  /voici comment ça sonne/i,
  /on va (le|la|les) jouer/i,
];

const DEMO_REQUEST_PATTERNS = [
  /\bd[eéè]mo\b/i,
  /\bjoue?\b/i,
  /\bmontre?\b/i,
  /\bplaque?\b/i,
  /\bfais entendre\b/i,
  /\bexemple\b/i,
  /\billustre\b/i,
  /\bcomment .* (fait|joue|sonne)\b/i,
  /\bpeux-tu .* (jouer|montrer)\b/i,
  /\btu peux .* (jouer|montrer)\b/i,
];

function looksLikeDemoAnnouncement(content) {
  if (!content) return false;
  return DEMO_ANNOUNCEMENT_PATTERNS.some((re) => re.test(content));
}

export function looksLikeDemoRequest(message) {
  if (!message) return false;
  return DEMO_REQUEST_PATTERNS.some((re) => re.test(message));
}

const TOOLS_UNAVAILABLE_PROMPT_ADDENDUM = `

⚠️ Le modèle connecté ne supporte pas les outils spéciaux. Quand tu veux
jouer des notes au clavier virtuel, écris-les explicitement dans ta réponse
sous la forme : [PLAY_NOTE: C4, E4, G4] (noms de notes anglais, de C0 à C8,
séparés par des virgules). L'application les interprétera et les jouera.
`;

function buildChatCompletionPayload(config, payloadMessages, { includeTools = true, useMaxTokens = false, tutorialTools = false, exerciseTools = false, playingTools = false } = {}) {
  const body = {
    model: config.model,
    messages: payloadMessages,
    temperature: 0.4,
  };
  if (useMaxTokens) {
    body.max_tokens = 1200;
  } else {
    body.max_completion_tokens = 1200;
  }
  if (includeTools) {
    body.tools = [PLAY_NOTE_TOOL, SUGGEST_ACTIONS_TOOL, PLAY_VOICING_TOOL, PLAY_LICK_TOOL, PLAY_PROGRESSION_TOOL, PLAY_MELODY_CHORDS_TOOL];
    // Outils du tutoriel seulement quand ses notes sont connues.
    if (tutorialTools) body.tools.push(PLAY_TUTORIAL_PASSAGE_TOOL);
    if (exerciseTools) body.tools.push(PLAY_EXERCISE_TOOL);
    // Jeu du pianiste (session confiée, dernier passage) : seulement quand on l'a.
    if (playingTools) body.tools.push(PLAY_MY_PLAYING_TOOL);
    body.tool_choice = 'auto';
  }
  return body;
}

function isOllamaCloudUrl(baseUrl = '') {
  return /api\.ollama\.ai|ollama\.ai\/v1/i.test(baseUrl);
}

async function callChatCompletionOnce(config, body) {
  const response = await callChatCompletions(config.baseUrl, config.apiKey, body);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'AI_API_KEY_INVALID', responseText: text };
    }
    return { ok: false, error: `AI_API_ERROR_${response.status}`, responseText: text, status: response.status };
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message;
  if (!choice) {
    return { ok: false, error: 'Réponse vide du modèle.' };
  }
  return { ok: true, choice };
}

function normalizePayloadMessages(messages) {
  return messages
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
    }))
    .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant');
}

async function retryWithInternalReminder(config, payloadMessages, originalAssistantContent, reminderText, { includeTools = true, tutorialTools = false, exerciseTools = false, playingTools = false } = {}) {
  const retryMessages = normalizePayloadMessages([
    ...payloadMessages,
    { role: 'assistant', content: originalAssistantContent },
    { role: 'user', content: reminderText },
  ]);
  const ollamaCloud = !includeTools && isOllamaCloudUrl(config.baseUrl);
  // [Claude] — 2026-09-25 — La relance garde les outils du tutoriel (rejouer un passage du professeur).
  return callChatCompletionOnce(config, buildChatCompletionPayload(config, retryMessages, { includeTools, useMaxTokens: ollamaCloud, tutorialTools: includeTools && tutorialTools, exerciseTools: includeTools && exerciseTools, playingTools: includeTools && playingTools }));
}

function finalizeContent(content, toolResult, requestedDemo = false) {
  // [Claude] — 2026-09-24 — Un exemple s'entend même clavier masqué : on garde
  // l'explication et on précise seulement comment voir les touches (avant, la
  // réponse entière était remplacée par « Le clavier MIDI virtuel est masqué »).
  if (toolResult.example) {
    let text = content || `Écoute l'exemple ci-dessous : ${toolResult.example.title}.`;
    if (requestedDemo && toolResult.keyboardCollapsed) text += '\n\n_(Le clavier virtuel est masqué : affiche-le pour voir les touches pendant l\'exemple.)_';
    return text;
  }
  if (requestedDemo && toolResult.keyboardCollapsed) {
    return 'Le clavier MIDI virtuel est masqué. Pour voir la démonstration, veuillez l\'afficher.';
  }
  return content;
}

/**
 * Envoie une conversation au modèle et exécute les tool_calls éventuels.
 *
 * @param {object} params
 * @param {string} params.message - message de l'utilisateur
 * @param {object[]} params.messages - historique complet ({role, content})
 * @param {{type: 'tutorial'|'session', name: string, key?: string, chords?: {start, end, label}[], transcript?: {start, text}[]}|null} params.context
 * @param {string} [params.copilotStyleId='auto']
 * @returns {Promise<{ok: true, content: string, toolResult: {played: object[], ignored: number}} | {ok: false, error: string}>}
 */
export async function sendCopilotMessage({ message, messages, context, copilotStyleId = 'auto', review = false }) {
  const config = getAIConfig();
  if (!config?.apiKey) {
    return { ok: false, error: 'Aucune clé API configurée.' };
  }

  const contextText = formatContext(context || {}, { copilotStyleId });
  // [Claude] — 2026-09-25 — Notes du professeur (tutoriel) : pour ses outils, pas pour le texte.
  const tutorialData = context?.type === 'tutorial' && Array.isArray(context.noteEvents) && context.noteEvents.length
    ? { noteEvents: context.noteEvents, key: context.key || null }
    : null;
  // [Claude] — 2026-09-25 — Exercice affiché : ses voicings pour play_exercise.
  const exerciseData = context?.type === 'exercise' && Array.isArray(context.chords) && context.chords.length ? context : null;
  // [Claude] — 2026-09-25 — Jeu du pianiste (session confiée, dernier passage joué) :
  // ses évènements exacts, pour play_my_playing ; jamais dans le texte envoyé.
  const playingData = context?.playing?.session?.events?.length || context?.playing?.passage?.events?.length ? context.playing : null;
  const toolOptions = { tutorialTools: Boolean(tutorialData), exerciseTools: Boolean(exerciseData), playingTools: Boolean(playingData) };
  const toolContext = { styleId: copilotStyleId, tutorial: tutorialData, exercise: exerciseData, playing: playingData };
  // Groq rejette tout champ inconnu dans les messages (timestamp, toolResult,
  // etc.). On ne garde que role et content pour la requête réseau.
  const sanitized = (Array.isArray(messages) ? messages : [])
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }));
  const payloadMessages = normalizePayloadMessages([
    { role: 'system', content: `${COPILOT_SYSTEM_PROMPT}\n\n## Bibliothèque de mouvements de référence\n${MOVEMENTS_REFERENCE}\n\n${contextText}` },
    ...sanitized,
  ]);
  if (message) {
    payloadMessages.push({ role: 'user', content: message });
  }

  try {
    cancelPendingCopilotNotes();

    // Premier essai : requête complète avec outils (function calling).
    let first = await callChatCompletionOnce(config, buildChatCompletionPayload(config, payloadMessages, toolOptions));

    // Si le modèle rejette la présence des outils (erreur 400 liée à tools),
    // on tente un second appel sans outils, en ajoutant au prompt des
    // instructions textuelles pour jouer les notes. Cela garantit le
    // fonctionnement avec n'importe quel modèle OpenAI-compatible.
    let toolsMode = true;
    if (!first.ok && first.status === 400) {
      const ollamaCloud = isOllamaCloudUrl(config.baseUrl);
      const payloadMessagesWithoutTools = payloadMessages.map((m) => {
        if (m.role !== 'system') return m;
        return { ...m, content: `${m.content}\n${TOOLS_UNAVAILABLE_PROMPT_ADDENDUM}` };
      });
      let second = await callChatCompletionOnce(config, buildChatCompletionPayload(config, payloadMessagesWithoutTools, { includeTools: false, useMaxTokens: ollamaCloud }));
      if (!second.ok && second.status === 400 && !ollamaCloud) {
        // Certains endpoints Ollama Cloud ne supportent pas max_completion_tokens.
        second = await callChatCompletionOnce(config, buildChatCompletionPayload(config, payloadMessagesWithoutTools, { includeTools: false, useMaxTokens: true }));
      }
      if (second.ok) {
        first = second;
        toolsMode = false;
      }
    }

    if (!first.ok) return first;

    let content = first.choice.content || '';
    const rawToolCalls = toolsMode ? first.choice.tool_calls : undefined;
    console.log('[CopilotClient] toolsMode=', toolsMode, 'tool_calls=', JSON.stringify(rawToolCalls?.map((c) => c.function?.name)));

    // Routage d'intention offline : si le modèle n'a pas appelé d'outil audio
    // mais que le message utilisateur est clair, on exécute directement l'outil
    // adapté côté client sans attendre le LLM.
    let forcedToolCalls = null;
    const noAudioToolCalled = !Array.isArray(rawToolCalls) || !rawToolCalls.some((c) => ['play_voicing', 'play_lick', 'play_progression', 'play_note', 'play_tutorial_passage', 'play_exercise', 'play_my_playing', 'play_melody_chords'].includes(c?.function?.name));
    // [Claude] — 2026-09-25 — Avis sur un passage joué (« je joue un 2-5-1, c'est
    // bon ? ») : c'est son jeu qu'on commente ; aucun exemple n'est imposé (le
    // modèle en joint un s'il aide), aucune relance.
    // [Claude] — 2026-09-25 — « Rejoue ma mélodie », « fais-moi réécouter ma main
    // gauche » : son propre jeu, rejoué à l'identique, jamais un lick inventé.
    const mine = !review && message ? myPlayingRequest(message, { session: Boolean(playingData?.session) }) : null;
    // [Claude] — 2026-09-26 — « Harmonise Mi4 Ré4 Do4 en melody chords », « harmonise ma
    // mélodie » : les accords de l'application (avant la relecture : « joue-moi ma
    // mélodie en melody chords » demande des accords).
    const chordsAsked = !review && message && wantsMelodyChords(message);
    const chordsRequest = chordsAsked ? melodyChordsRequest(message, { playing: playingData }) : null;
    if (toolsMode && noAudioToolCalled && chordsRequest) {
      forcedToolCalls = [{ function: { name: 'play_melody_chords', arguments: JSON.stringify(chordsRequest) } }];
    } else if (toolsMode && noAudioToolCalled && mine && playingData && !chordsAsked) {
      forcedToolCalls = [{ function: { name: 'play_my_playing', arguments: JSON.stringify(mine) } }];
    } else if (toolsMode && noAudioToolCalled && message && !review && !mine && !chordsAsked) {
      const intent = classifyIntent(message);
      // [Claude] — 2026-09-24 — Une question (« explique-moi un 2-5-1 ») reçoit
      // aussi son exemple : il attend sous l'explication qu'on clique sur Écouter
      // (lecture automatique seulement si le pianiste demande à entendre). Plus besoin
      // de relancer le modèle pour qu'il appelle l'outil.
      const explains = intent.intent === 'explain';
      if ((intent.intent === 'play_progression' || explains) && intent.params.chords && intent.params.chords.length > 1) {
        forcedToolCalls = [{
          function: {
            name: 'play_progression',
            arguments: JSON.stringify({
              chords: exampleChordsFromReply(intent.params.chords, content, { keyGiven: Boolean(intent.params.key) }),
              focus: intent.params.focus || 'full',
              styleId: intent.params.styleId || copilotStyleId || 'auto',
              pattern: intent.params.pattern || 'rolled',
            }),
          },
        }];
      } else if ((intent.intent === 'play_voicing' || explains) && intent.params.chordSymbol) {
        forcedToolCalls = [{
          function: {
            name: 'play_voicing',
            arguments: JSON.stringify({
              chordSymbol: intent.params.chordSymbol,
              styleId: intent.params.styleId || copilotStyleId || 'auto',
              technique: intent.params.technique || undefined,
              pattern: intent.params.pattern || undefined,
            }),
          },
        }];
      } else if (intent.intent === 'play_lick' && intent.params.chordSymbol) {
        forcedToolCalls = [{
          function: {
            name: 'play_lick',
            arguments: JSON.stringify({
              target: intent.params.chordSymbol,
              styleId: intent.params.styleId || copilotStyleId || 'auto',
              hand: intent.params.hand || 'RH',
              difficulty: intent.params.difficulty || 'intermediate',
              lengthBeats: intent.params.lengthBeats || 4,
            }),
          },
        }];
      }
    }

    const effectiveToolCalls = forcedToolCalls || rawToolCalls;
    let toolResult = toolsMode
      ? executeToolCalls(effectiveToolCalls, content, toolContext)
      : parsePlayNoteAnnotations(content);
    if (toolResult.content) content = toolResult.content;
    // Son jeu demandé, mais pas confié au Copilote : comment le lui confier.
    if (mine && !playingData && !chordsAsked && !toolResult.example) {
      const { note } = myPlayingExample(null);
      content = content ? `${content}\n\n${note}` : note;
    }
    const suggestedActions = (toolResult.suggestions || []).slice(0, 4);
    // Quand le fallback textuel est utilisé, enrichir avec les suggestions IA
    // n'est pas possible (pas d'outil) ; les suggestions restent vides.

    const keyboardCollapsed = toolResult.keyboardCollapsed;

    const noExecution = !keyboardCollapsed && toolResult.played.length === 0;
    const announcedDemo = looksLikeDemoAnnouncement(content);
    const requestedDemo = !review && looksLikeDemoRequest(message);
    const requestedVoicing = /\b(voicing|drop\s*2|drop\s*3|rootless|quartal|main gauche|main droite)\b/i.test(message);
    const requestedLick = /\b(lick|riff|fill|phrase|mélodique)\b/i.test(message);
    const requestedProgression = /\b(ii-v-i|ii\s+v\s+i|2-5-1|2\s+5\s+1|progression|enchaînement|résolution|resolution|guide\s+tone|7\s*→\s*3|7\s+vers\s+3|7\s+to\s+3)\b/i.test(message);
    const usedPlayVoicing = toolsMode && Array.isArray(rawToolCalls) && rawToolCalls.some((c) => c?.function?.name === 'play_voicing');
    const usedPlayLick = toolsMode && Array.isArray(rawToolCalls) && rawToolCalls.some((c) => c?.function?.name === 'play_lick');
    const usedPlayProgression = toolsMode && Array.isArray(rawToolCalls) && rawToolCalls.some((c) => c?.function?.name === 'play_progression');

    let retryConsumedThisTurn = false;

    // On ne relance une démo audio que si l'utilisateur l'a explicitement
    // demandée. Une annonce spontanée du modèle ne suffit plus (règle 3 du
    // prompt interdit l'initiative audio non sollicitée).
    const shouldRetryDemo = noExecution && requestedDemo;
    const shouldRetryVoicing = toolsMode && requestedVoicing && !usedPlayVoicing && !keyboardCollapsed;
    const shouldRetryLick = toolsMode && requestedLick && !usedPlayLick && !keyboardCollapsed;
    const shouldRetryProgression = toolsMode && requestedProgression && !usedPlayProgression && !keyboardCollapsed;

    // Un exemple est déjà prêt (outil du modèle ou routage d'intention) : pas de relance.
    // Son propre jeu demandé : jamais de relance vers un exemple recomposé.
    const hasExample = Boolean(toolResult.example);
    if (!review && !mine && !chordsAsked && !hasExample && (shouldRetryDemo || (requestedDemo && toolResult.played.length <= 1 && !keyboardCollapsed) || shouldRetryVoicing || shouldRetryLick || shouldRetryProgression)) {
      const playedCount = toolResult.played.length;
      let reminder = "";
      if (shouldRetryVoicing) {
        reminder = "[Rappel interne, ne pas mentionner au pianiste] L'utilisateur a demandé un voicing. " +
          "Tu dois impérativement utiliser l'outil play_voicing (pas play_note) pour montrer l'accord " +
          "avec sa répartition main gauche / main droite. Appelle play_voicing maintenant.";
      } else if (shouldRetryLick) {
        reminder = "[Rappel interne, ne pas mentionner au pianiste] L'utilisateur a demandé un lick/riff/phrase. " +
          "Tu dois impérativement utiliser l'outil play_lick (pas play_note) pour générer une phrase mélodique. " +
          "Appelle play_lick maintenant.";
      } else if (shouldRetryProgression) {
        reminder = "[Rappel interne, ne pas mentionner au pianiste] L'utilisateur a demandé une progression ou une résolution (ex. ii-V-I, 7→3). " +
          "Tu dois impérativement utiliser l'outil play_progression (pas play_voicing ni play_note) en passant la liste d'accords. " +
          "Appelle play_progression maintenant.";
      } else {
        reminder = "[Rappel interne, ne pas mentionner au pianiste] " +
          (playedCount > 0
            ? `Tu as appelé play_note, mais tu n'as envoyé qu'une seule note (${toolResult.played[0]?.name || 'note'}). ` +
              "Rappel : un accord = plusieurs appels play_note distincts, un par note MIDI. " +
              "Recommence la démonstration complète avec le bon nombre de notes."
            : "Tu viens d'annoncer vouloir jouer ou démontrer quelque chose, mais aucun outil " +
              "audio (play_note, play_voicing, play_progression, play_lick) n'a été appelé. Appelle " +
              "maintenant les tool_calls nécessaires pour exécuter concrètement " +
              "ce que tu viens de décrire.") +
          " Ne reformule pas ton explication, n'évoque pas ce rappel.";
      }

      const noToolsReminder = "[Rappel interne, ne pas mentionner au pianiste] " +
        (playedCount > 0
          ? `Tu as inclus une balise [PLAY_NOTE: ...] mais avec une seule note (${toolResult.played[0]?.name || 'note'}). ` +
            "Rappel : un accord = une balise [PLAY_NOTE: ...] avec plusieurs noms de notes séparés par des virgules. " +
            "Recommence la démonstration complète."
          : "Tu viens d'annoncer vouloir jouer ou démontrer quelque chose, mais tu n'as pas inclus " +
            "de balise [PLAY_NOTE: ...] dans ta réponse. Ajoute maintenant " +
            "les balises nécessaires pour que l'application puisse jouer les notes.") +
        " Ne reformule pas ton explication, n'évoque pas ce rappel.";

      const second = await retryWithInternalReminder(
        config,
        payloadMessages,
        content,
        toolsMode ? reminder : noToolsReminder,
        { includeTools: toolsMode, ...toolOptions },
      );
      retryConsumedThisTurn = true;
      if (!second.ok) {
        // La relance a échoué côté réseau : on revient au résultat original.
        content += "\n\n_(Remarque : je n'ai pas réussi à préparer l'exemple — n'hésite pas à redemander.)_";
        return { ok: true, content, toolResult, suggestedActions, autoplay: false };
      }

      const retryToolResult = toolsMode
        ? executeToolCalls(second.choice.tool_calls, '', toolContext)
        : parsePlayNoteAnnotations(second.choice.content || '');
      const retryWorked = retryToolResult.played.length > 0 || (retryToolResult.suggestions || []).length > 0;

      if (retryWorked) {
        // On garde le texte original (qui était correct) mais on expose le
        // toolResult de la seconde tentative qui a effectivement exécuté.
        toolResult = retryToolResult;
      } else {
        content += "\n\n_(Remarque : je n'ai pas réussi à préparer l'exemple — n'hésite pas à redemander.)_";
      }
    }

    content = finalizeContent(content, toolResult, requestedDemo);

    // Sous-chantier 3.3 : correction active si le nom annoncé ne correspond
    // pas aux notes réellement jouées. Désactivé en mode texte (pas de tools).
    if (toolsMode) {
      let groups = groupNotesByTimeWindow(toolResult.played);
      const chordChecks = checkChordNameAgreement(groups);
      const mismatch = chordChecks.find((c) => !c.match);

      if (mismatch) {
        const correctName = formatDetectedChordPlain(mismatch.detected);
        if (!retryConsumedThisTurn) {
          const chordReminderText =
            "[Rappel interne, ne pas mentionner au pianiste] Tu as annoncé " +
            `l'accord ${mismatch.impliedChordName}, mais les notes que tu as ` +
            `réellement jouées correspondent en réalité à ${correctName}. ` +
            "Corrige ton explication en conséquence, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, chordReminderText, { includeTools: true, ...toolOptions });
          retryConsumedThisTurn = true;
          if (second.ok) {
            // La première explication reposait sur un nom faux ; on remplace
            // entièrement par la seconde réponse.
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', toolContext), toolResult);
            content = finalizeContent(content, toolResult, requestedDemo);
          } else {
            // Échec réseau : repli déterministe sans second appel.
            content = `${content}\n\n_(Précision : les notes jouées correspondent en réalité à **${correctName}**, pas à ${mismatch.impliedChordName} comme annoncé.)_`;
          }
        } else {
          // Le retry 3.1 ou 3.3 a déjà été consommé sur ce tour : pas de second appel.
          content = `${content}\n\n_(Précision : les notes jouées correspondent en réalité à **${correctName}**, pas à ${mismatch.impliedChordName} comme annoncé.)_`;
        }
      }
    }

    // Sous-chantier 3.4 : validation active des degrés annoncés vs tonalité.
    // Désactivé en mode texte.
    if (toolsMode) {
      const groups = groupNotesByTimeWindow(toolResult.played);
      const degreeChecks = checkDegreeKeyAgreement(groups);
      const degreeMismatch = degreeChecks.find((c) => !c.match);

      if (degreeMismatch) {
        const expectedText = degreeMismatch.expectedTriad;
        if (!retryConsumedThisTurn) {
          const degreeReminderText =
            "[Rappel interne, ne pas mentionner au pianiste] Tu as annoncé " +
            `le degré ${degreeMismatch.impliedRomanNumeral} en ${degreeMismatch.impliedKey}, ` +
            `mais les notes que tu as réellement jouées ne correspondent pas ` +
            `à l'accord attendu pour ce degré (${expectedText}). Corrige ton ` +
            "explication en conséquence, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, degreeReminderText, { includeTools: true, ...toolOptions });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', toolContext), toolResult);
            content = finalizeContent(content, toolResult, requestedDemo);
          } else {
            content = `${content}\n\n_(Précision : pour le degré ${degreeMismatch.impliedRomanNumeral} en ${degreeMismatch.impliedKey}, l'accord théoriquement attendu est plutôt **${expectedText}** — les notes jouées ne correspondent pas à sa fondamentale.)_`;
          }
        } else {
          content = `${content}\n\n_(Précision : pour le degré ${degreeMismatch.impliedRomanNumeral} en ${degreeMismatch.impliedKey}, l'accord théoriquement attendu est plutôt **${expectedText}** — les notes jouées ne correspondent pas à sa fondamentale.)_`;
        }
      }
    }

    // Sous-chantier 3.5 : anti-sycophancie sur la tonalité. Si le modèle
    // affirme une tonalité différente de celle calculée par l'application sans
    // la présenter comme une hypothèse alternative, on corrige.
    const expectedKey = context?.key || context?.melody?.scale;
    if (toolsMode && expectedKey) {
      const keyChecks = checkKeyAffirmation(content, expectedKey);
      const keyMismatch = keyChecks.find((c) => !c.match);
      if (keyMismatch) {
        if (!retryConsumedThisTurn) {
          const keyReminderText =
            "[Rappel interne, ne pas mentionner au pianiste] " +
            `La tonalité détectée par l'application est ${keyMismatch.expectedKey}, ` +
            `pas ${keyMismatch.affirmedKey}. Si le pianiste demande explicitement de ` +
            "raisonner dans une autre tonalité, accepte en précisant 'comme si', " +
            "mais ne dis jamais que l'analyse initiale était fausse. Corrige ta réponse.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, keyReminderText, { includeTools: true, ...toolOptions });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', toolContext), toolResult);
            content = finalizeContent(content, toolResult, requestedDemo);
          } else {
            content = `${content}\n\n_(Précision : ${keyMismatch.correction})_`;
          }
        } else {
          content = `${content}\n\n_(Précision : ${keyMismatch.correction})_`;
        }
      }
    }

    // Sous-chantier 3.6 : vérification que le texte décrit bien la répartition
    // main gauche / main droite du voicing réellement joué.
    if (toolsMode && toolResult.voicing?.isPlayable) {
      const voicingChecks = checkVoicingDescriptionAgreement(content, toolResult.voicing, toolResult.voicing.chordSymbol);
      const voicingMismatch = voicingChecks.find((c) => !c.match);
      if (voicingMismatch) {
        if (!retryConsumedThisTurn) {
          const voicingReminderText =
            "[Rappel interne, ne pas mentionner au pianiste] " +
            `Tu as écrit : "${voicingMismatch.claim}", mais la répartition réelle du voicing est : ${formatVoicingNotes(toolResult.voicing)}. ` +
            "Corrige ta description pour qu'elle corresponde exactement aux notes jouées, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, voicingReminderText, { includeTools: true, ...toolOptions });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', toolContext), toolResult);
            content = finalizeContent(content, toolResult, requestedDemo);
          } else {
            content = `${content}\n\n_(Précision : ${voicingMismatch.correction})_`;
          }
        } else {
          content = `${content}\n\n_(Précision : ${voicingMismatch.correction})_`;
        }
      }
    }

    // Journalisation de validation musicale : lecture seule, jamais de
    // modification du résultat utilisateur (sous-chantier 3.2).
    const groups = groupNotesByTimeWindow(toolResult.played);
    const extractedChordNames = extractBoldChordNames(content);
    const extractedDegreeRefs = extractDegreeReferences(content);
    const logPayload = buildValidationLogPayload({ groups, extractedChordNames, extractedDegreeRefs });
    if (logPayload) {
      console.log('[CopilotValidation]', JSON.stringify(logPayload, null, 2));
    }

    return {
      ok: true,
      content,
      toolResult,
      suggestedActions: (toolResult.suggestions || []).slice(0, 4),
      // L'exemple démarre seul, après l'affichage de la réponse, si le pianiste a demandé à entendre.
      autoplay: Boolean(toolResult.example) && wantsToHear(message),
    };
  } catch (err) {
    console.warn('[CopilotClient] Appel échoué :', err);
    return { ok: false, error: err.message || 'Appel au modèle impossible.' };
  }
}
