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
import { setKeyboardMarks, clearKeyboardMarks } from '../ui/keyboard-marks.js';
import { noteRoles } from './note-roles.js';
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
import { classifyIntent, chordSymbolsInText } from './intent-classifier.js';

// [Claude] — 2026-09-24 — Consignes refaites (Narcisse : « quand je lui demande de
// m'expliquer un 2-5-1, il va directement me le jouer au lieu d'expliquer
// d'abord », « on ne dirait pas un assistant qui maîtrise son instrument »,
// et une session doit être analysée : « donne des conseils et pointe ce qui ne
// va pas »). Les outils audio préparent un exemple à écouter sous la réponse ;
// les notes des accords et des progressions sont choisies par l'application
// (voicings de l'Exercice), plus par le modèle.
const COPILOT_SYSTEM_PROMPT = `Tu es l'assistant musical intégré à l'application Piano Jazz Chords : un pianiste qui maîtrise son instrument (jazz, gospel, worship) et un pédagogue. Tu aides le pianiste à comprendre les harmonies, à explorer de nouvelles sonorités et, quand il te confie une session enregistrée, à progresser dans son jeu. Reste factuel et précis ; tes explications sont claires et concises.\n\nContexte fourni :\n- s'il s'agit d'un tutoriel vidéo : la transcription de ce que dit le professeur (ou sa traduction en français), la grille d'accords relevée par l'application sur la même vidéo, la tonalité détectée si elle est connue ;\n- s'il s'agit d'une session MIDI enregistrée : son nom, sa durée, son tempo, la tonalité si elle est connue, la grille des accords joués (moment mm:ss et nom) et les constats de l'analyse du jeu calculés par l'application ;\n- l'état du clavier MIDI virtuel : visible ou masqué/réduit.\n\nRègles :\n1. Réponds toujours en français, de façon claire et pédagogique.\n2. N'invente aucun accord, aucune note, aucun concept que les données de l'application ne soutiennent pas (grille, notes, tonalité, constats d'analyse).\n3. Explique d'abord, fais entendre ensuite. Les outils audio (play_progression, play_voicing, play_lick, play_note) ne jouent RIEN pendant que tu réponds : ils ajoutent SOUS ta réponse un exemple que l'élève écoute d'un clic (l'exemple ne démarre tout seul, après ta réponse, que si l'élève a demandé à entendre). Rédige donc ton explication complète, appelle l'outil, et termine par une phrase qui renvoie à l'exemple (« Écoute l'exemple ci-dessous : … »). N'écris jamais « je te joue… » ou « voici la démonstration » en tête de réponse.\n4. Structure d'une explication (accord, progression, technique) : (a) l'idée en une phrase ; (b) les accords ou les notes dans une tonalité concrète, en gras (**Dm7 → G7 → Cmaj7** en Do) ; (c) pourquoi ça marche (fonction de chaque accord, voix qui bougent : la 7e qui descend sur la tierce de l'accord suivant…) ; (d) comment le jouer au piano (ce que fait chaque main) ; (e) l'exemple à écouter. Joins un exemple dès qu'il aide à comprendre un accord, un voicing ou une progression.\n5. L'application joue tes exemples comme un pianiste : voicings réels enchaînés d'un accord à l'autre, à deux mains, dans le style choisi (Gospel / worship, Ballade, Comping swing, Plaqué). Tu n'as donc PAS à choisir les notes d'un accord ni d'une progression :\n   - un accord, un voicing, une position → play_voicing (l'accord, et la technique si l'élève la précise : close, drop2, drop3, rootless, quartal, spread, upper_structure) ;\n   - une progression, un enchaînement, une cadence, un turnaround (« ii-V-I », « 2-5-1 », « Dm7 G7 Cmaj7 ») → play_progression avec la liste des accords (focus « 7-to-3 » ou « guide-tones-only » pour faire entendre la conduite des voix, « full » sinon) ;\n   - un lick, un riff, un fill, une phrase → play_lick ;\n   - play_note seulement pour une note isolée, un intervalle ou une courte ligne mélodique (un appel = une note ; les notes d'un intervalle plaqué partagent le même startOffsetMs).\n   Un seul outil audio par réponse ; une progression est UN appel play_progression.\n6. Donne des accords complets et colorés (9e, 11e, 13e) quand le niveau de l'élève le permet, et écris-les comme l'application : Dm9, G13, Cmaj9, G7alt, Bbmaj7#11, Fm6.\n7. Quand tu décris un voicing, décris la répartition réelle des mains sans inventer de notes. Conventions : close = accord resserré à la main droite, la basse à la main gauche ; drop 2 = la 2e voix depuis le haut descend d'une octave, la fondamentale reste à la main droite ; rootless = sans fondamentale (la main gauche la joue à part ou la basse la tient) ; quartal = empilement de quartes.\n8. Si l'élève dit « ralentis », « recommence », « plus lent » : refais l'exemple avec le même outil et les mêmes accords (l'application joue posément).\n9. Si l'élève pose une question sans rapport avec la musique ou le tutoriel, recentre-le gentiment.\n10. Quand tu cites un moment d'une vidéo ou d'une session, utilise le format mm:ss.\n11. Si le clavier virtuel est masqué, l'exemple s'entend quand même : précise seulement qu'on voit les touches en affichant le clavier.\n12. Distinction entre deux types de correction de l'élève. (a) S'il corrige un raisonnement que tu as toi-même avancé (intervalle, degré, accord diatonique), vérifie ton raisonnement avant de répondre ; si sa correction est juste, accepte-la. (b) S'il affirme une tonalité, un accord ou une note qui contredisent les données de l'application, ne cède pas par politesse : explique ce que disent les données, ou accepte de « raisonner comme si » à sa demande sans prétendre que l'analyse était fausse.\n13. Pour illustrer une progression ou un enchaînement gospel / jazz, appuie-toi sur la bibliothèque de mouvements fournie plutôt que d'improviser, et cite le mouvement dont tu t'inspires.\n14. Après une réponse qui ouvre une suite, appelle suggest_actions pour proposer 2 à 4 actions courtes (3 à 25 caractères), dont le message est prêt à être envoyé tel quel.\n15. Les champs impliedChordName, impliedRomanNumeral et impliedKey ne servent qu'avec play_note, et seulement si tu es sûr de l'accord et du degré.\n16. Écris en texte brut lisible : jamais de LaTeX ; des flèches Unicode (→) ou des tirets (—), et les notes et accords écrits directement (« Do (7e de Dm7) → Si (tierce de G7) »).\n17. Donne les notes avec leur nom français et leur octave (Do3, Mi4, Sol4), jamais des numéros MIDI.\n18. Pour faire VOIR où sont les notes sans les jouer (« montre-moi où… », « quelles touches… »), appelle annotate_keyboard avec l'accord de référence (chord) : chaque touche prend la couleur de son rôle (fondamentale, 3ce / 7e, quinte, couleurs) et son degré, et ta phrase (caption) s'affiche sous le clavier.\n\nAnalyse d'une session (quand l'élève te demande d'analyser sa session MIDI ou un de ses moments) : tu es son coach, tu as écouté sa session. Appuie-toi UNIQUEMENT sur le portrait (accords avec leurs notes exactes main gauche | main droite, voicing, rôles, lignes) et sur les constats de l'analyse du jeu fournis ; n'invente aucun défaut qu'ils ne mentionnent pas. Pour chaque problème, dis OÙ (le moment m:ss,d, l'accord) et POURQUOI, avec les notes exactes en cause (ex. « à 0:12,4, sur G13, Fa3 et La3 de Dm9 traînent sous la pédale ») : l'élève doit pouvoir le retrouver ; chaque moment que tu écris devient un lien qui le rejoue et le montre au clavier. Pour une autre question, réponds-y normalement, en citant la session si elle éclaire la réponse. (1) Commence par un ou deux points forts précis. (2) Puis ce qui ne va pas, du plus important au moins important (trois points au plus), avec le moment (mm:ss) et une explication simple. (3) Termine par deux ou trois conseils concrets, dont un exercice précis (accords, tonalité, tempo) ; joins un exemple à écouter s'il aide. Sois honnête et bienveillant : si quelque chose ne va pas, dis-le clairement.\n\nAvis sur un passage joué (« Qu'en penses-tu ? » : l'élève vient de jouer au clavier et te demande si c'est bon) : le portrait du passage est fourni (accords avec leurs notes exactes main gauche | main droite, voicing reconnu, rôle de chaque note, conduite des voix, lignes avec la gamme reconnue et le rôle de chaque note, tonalité, rythme, constats de l'application). Le passage peut être n'importe quoi : un accord, un voicing, une progression, une gamme, un lick, un run, un arpège, la main gauche seule, un morceau. Réponds d'abord à SA question, telle qu'il l'a posée. (1) Le verdict en une phrase (juste, presque, pas encore) et pourquoi. (2) Ce qui est réussi, précisément (accord, note, moment). (3) Ce qui ne va pas, du plus important au moins important (trois points au plus), avec le moment (m:ss,d), les notes exactes (nom français et octave) et la correction concrète (quelle note changer, quel renversement, quel doigté, où relever la pédale). (4) Un exercice court pour progresser. Les défauts viennent UNIQUEMENT des constats et du portrait : n'invente aucun défaut ; si le portrait ne permet pas de juger un point (le son, une intention non dite), dis-le simplement. Tu peux joindre un exemple de la version corrigée avec l'outil adapté (il s'écoute d'un clic) et montrer une correction au clavier avec annotate_keyboard (accord de référence + phrase).\n`;
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

const ANNOTATE_KEYBOARD_TOOL = {
  type: 'function',
  function: {
    name: 'annotate_keyboard',
    description: 'Montre des touches sur le clavier MIDI virtuel, sans les jouer : une pastille colorée sur chaque touche (couleur = rôle dans l\'accord si tu donnes l\'accord) et une phrase sous le clavier. À utiliser pour faire voir où sont les notes d\'un accord, d\'un voicing ou d\'un passage. Les marques précédentes sont effacées.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        notes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              midi: {
                type: 'integer',
                description: 'Numéro MIDI de la touche à montrer, entre 21 et 108.',
              },
              label: {
                type: 'string',
                description: 'Étiquette très courte posée sur la touche (4 caractères au plus : « 1 », « b7 », « 9 », « #11 »). Optionnelle : avec l\'accord, le degré est mis tout seul.',
              },
            },
            required: ['midi'],
          },
          description: 'Liste des touches à montrer. 1 à 12 éléments.',
        },
        chord: {
          type: 'string',
          description: 'Accord de référence (ex. « Dm9 », « G13 », « C/E ») : chaque touche prend la couleur de son rôle (fondamentale, 3ce/7e, quinte, couleurs, note étrangère) et son degré.',
        },
        caption: {
          type: 'string',
          description: 'Phrase courte affichée sous le clavier (ce que l\'élève doit regarder), 90 caractères au plus.',
        },
      },
      required: ['notes'],
    },
  },
};

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
    description: 'Joue UN SEUL accord avec une intention pianistique complète (main gauche / main droite / technique / pattern). À utiliser pour montrer un accord isolé, un voicing ou une position pianistique réelle. Tu ne peux appeler play_voicing qu\'UNE SEULE FOIS par réponse : choisis l\'accord le plus représentatif ou le plus demandé par l\'élève. Pour une progression entière, utilise play_voicing une seule fois sur l\'accord principal, puis explique la suite.',
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
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optionnel : légendes courtes du pas à pas au clavier, une par accord (ou par note pour une ligne), dans l\'ordre (ex. « Dm9 : la 7e Do va descendre sur Si »). 90 caractères au plus chacune.',
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
    description: 'Génère et joue UN SEUL lick, riff ou fill pianistique sur un accord cible. Tu ne peux appeler play_lick qu\'UNE SEULE FOIS par réponse. À utiliser quand l\'élève demande un lick, un riff, une phrase mélodique courte ou un ornement. L\'application produira automatiquement des notes MIDI réellement jouables.',
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
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optionnel : légendes courtes du pas à pas au clavier, une par accord (ou par note pour une ligne), dans l\'ordre (ex. « Dm9 : la 7e Do va descendre sur Si »). 90 caractères au plus chacune.',
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
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optionnel : légendes courtes du pas à pas au clavier, une par accord (ou par note pour une ligne), dans l\'ordre (ex. « Dm9 : la 7e Do va descendre sur Si »). 90 caractères au plus chacune.',
        },
      },
      required: ['chords'],
    },
  },
};

function clampMidi(midi) {
  const n = Number.isFinite(midi) ? Math.round(midi) : NaN;
  if (Number.isNaN(n)) return null;
  return Math.max(21, Math.min(108, n));
}

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

/**
 * Exécute un appel tool_calls reçu du modèle. Seul l'outil 'play_note' est
 * supporté ; les autres sont ignorés proprement.
 *
 * @param {object[]} toolCalls
 * @returns {{played: {midi: number, name: string}[], ignored: number}}
 */
function clearKeyboardAnnotations() {
  clearKeyboardMarks();
}

/**
 * [Claude] — 2026-09-25 — Touches montrées par le Copilote : marques posées DANS
 * le SVG du clavier (keyboard-marks.js), plus de flèches par-dessus qui se
 * décalaient. Avec un accord, chaque touche prend la couleur et le degré de son
 * rôle ; une étiquette trop longue pour la pastille passe dans la légende.
 * @param {{midi: number, label?: string}[]} notes
 * @param {{chord?: string, caption?: string}} [options]
 * @returns {{midi: number, name: string}[]} touches marquées
 */
function annotateKeyboard(notes, { chord = '', caption = '' } = {}) {
  const list = [];
  for (const note of notes || []) {
    const midi = clampMidi(note?.midi);
    if (midi === null || list.some((n) => n.midi === midi)) continue;
    list.push({ midi, label: String(note.label || '').trim() });
  }
  if (list.length === 0) {
    clearKeyboardMarks();
    return [];
  }
  const roles = new Map(chord ? noteRoles(String(chord), list.map((n) => n.midi)).map((r) => [r.midi, r]) : []);
  const longLabels = list.filter((n) => n.label.length > 4).map((n) => `${midiToName(n.midi)} : ${n.label}`);
  const marks = list.map((n) => {
    const role = roles.get(n.midi);
    const label = n.label && n.label.length <= 4 ? n.label : role?.degree || '';
    return { midi: n.midi, kind: role ? role.kind : 'target', label };
  });
  const text = [String(caption || '').trim().slice(0, 140), longLabels.join(' · ')].filter(Boolean).join(' — ')
    || (chord ? `${chord} : ${list.map((n) => midiToName(n.midi)).join(' ')}` : '');
  setKeyboardMarks(marks, { caption: text });
  return list.map((n) => ({ midi: n.midi, name: midiToName(n.midi) }));
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
  return { played, ignored: 0, annotated: [], suggestions: [], example };
}

/**
 * Nouvelle question : l'exemple en cours s'arrête et les annotations du clavier
 * s'effacent (les exemples ne jouent plus d'eux-mêmes, voir executeToolCalls).
 * « Qu'en penses-tu ? » garde les marques qu'il vient de poser (keepMarks).
 */
export function cancelPendingCopilotNotes({ keepMarks = false } = {}) {
  if (!keepMarks) clearKeyboardAnnotations();
  if (typeof document !== 'undefined' && document.dispatchEvent && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('copilot-stop-example'));
  }
}

// [Claude] — 2026-09-24 — L'élève demande à entendre (« joue-moi », « fais-moi
// écouter », « je veux entendre », « démo »…) : l'exemple démarre tout seul, une
// fois la réponse affichée. Une question (« explique-moi un 2-5-1 », « comment
// jouer un 2-5-1 ? ») n'en est pas une : l'exemple attend son clic sous le texte.
// Le message est lu sans accents (« écoute » → « ecoute ») : en JavaScript, \b ne
// voit pas de frontière de mot devant un « é ».
const HEAR_PATTERNS = [
  /(?<!\b(?:je|on) )\b(?:re)?joue[sz]?\b/, // joue-moi, rejoue, jouez (pas « je joue »)
  /\b(?:peux|pourrais|pourriez|veux|voudrais)[- ](?:tu|vous)\b[^?.!]*\bjouer\b/, // peux-tu me jouer…
  /\btu (?:peux|pourrais|veux)\b[^?.!]*\bjouer\b/,
  /\b(?:entendre|ecouter|ecoute[sz]?)\b/,
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
 * @param {{keyGiven?: boolean}} [options] - tonalité donnée par l'élève
 */
export function exampleChordsFromReply(chords, reply, { keyGiven = false } = {}) {
  const written = chordSymbolsInText(reply);
  if (written.length !== chords.length) return chords;
  if (written.every((c, i) => chordRootPc(c) === chordRootPc(chords[i]))) return written;
  // La réponse a choisi une autre tonalité : on suit la réponse, sauf si
  // l'élève en avait demandé une.
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
 * texte affiché, si l'élève a demandé à entendre). Avant, les notes partaient
 * pendant que la réponse se préparait, avant l'explication.
 *
 * Un seul outil audio par réponse : play_progression > play_voicing > play_lick
 * > play_note. annotate_keyboard (visuel) et suggest_actions s'exécutent tels quels.
 *
 * @param {object[]} toolCalls
 * @param {string} [assistantContent]
 * @param {{styleId?: string}} [options] - style choisi dans le Copilote
 * @returns {{played: object[], ignored: number, annotated: object[], suggestions: object[], voicing: object|null, example: object|null, content?: string}}
 */
export function executeToolCalls(toolCalls, assistantContent = '', { styleId = 'auto' } = {}) {
  const annotated = [];
  const suggestions = [];
  let played = [];
  let ignored = 0;
  let capturedVoicing = null;
  let example = null;
  let content = assistantContent;
  const noteCalls = [];
  let stepCaptions = null;
  if (!Array.isArray(toolCalls)) return { played, ignored, annotated, suggestions, voicing: capturedVoicing, example };

  const audioPriorities = { play_progression: 0, play_voicing: 1, play_lick: 2, play_note: 3 };
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
    if (fn === 'annotate_keyboard') {
      if (collapsed) continue;
      const args = parseArgs(call);
      if (!args) { ignored += 1; continue; }
      const ok = annotateKeyboard(Array.isArray(args.notes) ? args.notes : [], { chord: args.chord, caption: args.caption });
      annotated.push(...ok);
      if (ok.length === 0) ignored += 1;
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
      if (Array.isArray(args.steps)) stepCaptions = args.steps;
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
        kind: 'voicing', title: chordSymbol, subtitle: 'Voicing à deux mains', chord: chordSymbol,
      });
    } else if (fn === 'play_lick') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const target = String(args?.target || '').trim();
      if (!target) { ignored += 1; continue; }
      if (Array.isArray(args.steps)) stepCaptions = args.steps;
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
      example = buildNotesExample(lick.notes, { kind: 'lick', title: `Lick sur ${target}`, subtitle: 'Phrase générée pour l\'accord', chord: target });
    } else if (fn === 'play_progression') {
      if (example) { ignored += 1; continue; }
      const args = parseArgs(call);
      const chords = Array.isArray(args?.chords) ? args.chords.filter((c) => typeof c === 'string' && c.trim()) : [];
      if (chords.length === 0) { ignored += 1; continue; }
      if (Array.isArray(args.steps)) stepCaptions = args.steps;
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
    // L'accord sous-entendu d'une note (impliedChordName) donne son rôle au clavier.
    const withChords = noteCalls.map((n) => (n.impliedChordName ? { ...n, chord: n.impliedChordName } : n));
    example = buildNotesExample(withChords, { kind: 'notes', title: noteCalls.length === 1 ? 'Une note' : `${noteCalls.length} notes`, subtitle: 'Notes demandées au clavier' });
    // Notes jouées telles quelles, métadonnées comprises (contrôles de cohérence).
    played = noteCalls.map((n) => ({ ...n, name: midiToName(n.midi) }));
  } else if (example) {
    played = eventsToPlayed(example.events, example.tempo);
  }

  // [Claude] — 2026-09-25 — Légendes d'étapes écrites par le Copilote (outil audio,
  // paramètre `steps`) : elles remplacent celles que l'application a calculées.
  if (example?.steps?.length && Array.isArray(stepCaptions) && stepCaptions.length) {
    stepCaptions.slice(0, example.steps.length).forEach((text, i) => {
      if (typeof text === 'string' && text.trim()) example.steps[i] = { ...example.steps[i], caption: text.trim().slice(0, 140) };
    });
  }
  const result = { played, ignored, annotated, suggestions, voicing: capturedVoicing, example };
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
  } else if (type === 'tutorial') {
    lines.push('## Tutoriel en cours');
    lines.push(`Fichier : ${context?.name || 'inconnu'}`);
    if (context?.key) lines.push(`Tonalité détectée : ${context.key}`);

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
  }

  // [Claude] — 2026-09-25 — « Qu'en penses-tu ? » : portrait du passage joué.
  if (Array.isArray(context?.take) && context.take.length) {
    lines.push('');
    lines.push(...context.take);
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

const TOOLS_AVAILABLE_PROMPT_ADDENDUM = `

Tu as accès à deux outils spéciaux :
- play_note : pour jouer une ou plusieurs notes MIDI sur le clavier virtuel.
- annotate_keyboard : pour mettre en évidence des touches sans les jouer.
Utilise-les quand tu veux vraiment démontrer quelque chose au piano.
`;

const TOOLS_UNAVAILABLE_PROMPT_ADDENDUM = `

⚠️ Le modèle connecté ne supporte pas les outils spéciaux. Quand tu veux
jouer des notes au clavier virtuel, écris-les explicitement dans ta réponse
sous la forme : [PLAY_NOTE: C4, E4, G4] (noms de notes anglais, de C0 à C8,
séparés par des virgules). L'application les interprétera et les jouera.
`;

function buildChatCompletionPayload(config, payloadMessages, { includeTools = true, useMaxTokens = false } = {}) {
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
    body.tools = [PLAY_NOTE_TOOL, ANNOTATE_KEYBOARD_TOOL, SUGGEST_ACTIONS_TOOL, PLAY_VOICING_TOOL, PLAY_LICK_TOOL, PLAY_PROGRESSION_TOOL];
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

async function retryWithInternalReminder(config, payloadMessages, originalAssistantContent, reminderText, { includeTools = true } = {}) {
  const retryMessages = normalizePayloadMessages([
    ...payloadMessages,
    { role: 'assistant', content: originalAssistantContent },
    { role: 'user', content: reminderText },
  ]);
  const ollamaCloud = !includeTools && isOllamaCloudUrl(config.baseUrl);
  return callChatCompletionOnce(config, buildChatCompletionPayload(config, retryMessages, { includeTools, useMaxTokens: ollamaCloud }));
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
  if (!content && toolResult.annotated.length > 0) {
    const names = toolResult.annotated.map((a) => a.name).join(', ');
    return `J'ai mis en évidence ces touches : ${names}.`;
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
    cancelPendingCopilotNotes({ keepMarks: review });

    // Premier essai : requête complète avec outils (function calling).
    let first = await callChatCompletionOnce(config, buildChatCompletionPayload(config, payloadMessages));

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
    const noAudioToolCalled = !Array.isArray(rawToolCalls) || !rawToolCalls.some((c) => ['play_voicing', 'play_lick', 'play_progression', 'play_note'].includes(c?.function?.name));
    // [Claude] — 2026-09-25 — Avis sur un passage joué (« je joue un 2-5-1, c'est
    // bon ? ») : c'est son jeu qu'on commente ; aucun exemple n'est imposé (le
    // modèle en joint un s'il aide), aucune relance.
    if (toolsMode && noAudioToolCalled && message && !review) {
      const intent = classifyIntent(message);
      // [Claude] — 2026-09-24 — Une question (« explique-moi un 2-5-1 ») reçoit
      // aussi son exemple : il attend sous l'explication qu'on clique sur Écouter
      // (lecture automatique seulement si l'élève demande à entendre). Plus besoin
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
      ? executeToolCalls(effectiveToolCalls, content, { styleId: copilotStyleId })
      : parsePlayNoteAnnotations(content);
    if (toolResult.content) content = toolResult.content;
    const suggestedActions = (toolResult.suggestions || []).slice(0, 4);
    // Quand le fallback textuel est utilisé, enrichir avec les suggestions IA
    // n'est pas possible (pas d'outil) ; les suggestions restent vides.

    const keyboardCollapsed = toolResult.keyboardCollapsed;

    const noExecution = !keyboardCollapsed && toolResult.played.length === 0 && toolResult.annotated.length === 0;
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
    const hasExample = Boolean(toolResult.example);
    if (!review && !hasExample && (shouldRetryDemo || (requestedDemo && toolResult.played.length <= 1 && !keyboardCollapsed) || shouldRetryVoicing || shouldRetryLick || shouldRetryProgression)) {
      const playedCount = toolResult.played.length;
      let reminder = "";
      if (shouldRetryVoicing) {
        reminder = "[Rappel interne, ne pas mentionner à l'élève] L'utilisateur a demandé un voicing. " +
          "Tu dois impérativement utiliser l'outil play_voicing (pas play_note) pour montrer l'accord " +
          "avec sa répartition main gauche / main droite. Appelle play_voicing maintenant.";
      } else if (shouldRetryLick) {
        reminder = "[Rappel interne, ne pas mentionner à l'élève] L'utilisateur a demandé un lick/riff/phrase. " +
          "Tu dois impérativement utiliser l'outil play_lick (pas play_note) pour générer une phrase mélodique. " +
          "Appelle play_lick maintenant.";
      } else if (shouldRetryProgression) {
        reminder = "[Rappel interne, ne pas mentionner à l'élève] L'utilisateur a demandé une progression ou une résolution (ex. ii-V-I, 7→3). " +
          "Tu dois impérativement utiliser l'outil play_progression (pas play_voicing ni play_note) en passant la liste d'accords. " +
          "Appelle play_progression maintenant.";
      } else {
        reminder = "[Rappel interne, ne pas mentionner à l'élève] " +
          (playedCount > 0
            ? `Tu as appelé play_note, mais tu n'as envoyé qu'une seule note (${toolResult.played[0]?.name || 'note'}). ` +
              "Rappel : un accord = plusieurs appels play_note distincts, un par note MIDI. " +
              "Recommence la démonstration complète avec le bon nombre de notes."
            : "Tu viens d'annoncer vouloir jouer ou démontrer quelque chose, mais aucun outil " +
              "(play_note ou annotate_keyboard) n'a été appelé. Appelle " +
              "maintenant les tool_calls nécessaires pour exécuter concrètement " +
              "ce que tu viens de décrire.") +
          " Ne reformule pas ton explication, n'évoque pas ce rappel.";
      }

      const noToolsReminder = "[Rappel interne, ne pas mentionner à l'élève] " +
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
        { includeTools: toolsMode },
      );
      retryConsumedThisTurn = true;
      if (!second.ok) {
        // La relance a échoué côté réseau : on revient au résultat original.
        content += "\n\n_(Remarque : je n'ai pas réussi à préparer l'exemple — n'hésite pas à redemander.)_";
        return { ok: true, content, toolResult, suggestedActions, autoplay: false };
      }

      const retryToolResult = toolsMode
        ? executeToolCalls(second.choice.tool_calls, '', { styleId: copilotStyleId })
        : parsePlayNoteAnnotations(second.choice.content || '');
      const retryWorked = retryToolResult.played.length > 0 || retryToolResult.annotated.length > 0 || (retryToolResult.suggestions || []).length > 0;

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
            "[Rappel interne, ne pas mentionner à l'élève] Tu as annoncé " +
            `l'accord ${mismatch.impliedChordName}, mais les notes que tu as ` +
            `réellement jouées correspondent en réalité à ${correctName}. ` +
            "Corrige ton explication en conséquence, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, chordReminderText, { includeTools: true });
          retryConsumedThisTurn = true;
          if (second.ok) {
            // La première explication reposait sur un nom faux ; on remplace
            // entièrement par la seconde réponse.
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', { styleId: copilotStyleId }), toolResult);
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
            "[Rappel interne, ne pas mentionner à l'élève] Tu as annoncé " +
            `le degré ${degreeMismatch.impliedRomanNumeral} en ${degreeMismatch.impliedKey}, ` +
            `mais les notes que tu as réellement jouées ne correspondent pas ` +
            `à l'accord attendu pour ce degré (${expectedText}). Corrige ton ` +
            "explication en conséquence, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, degreeReminderText, { includeTools: true });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', { styleId: copilotStyleId }), toolResult);
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
            "[Rappel interne, ne pas mentionner à l'élève] " +
            `La tonalité détectée par l'application est ${keyMismatch.expectedKey}, ` +
            `pas ${keyMismatch.affirmedKey}. Si l'élève demande explicitement de ` +
            "raisonner dans une autre tonalité, accepte en précisant 'comme si', " +
            "mais ne dis jamais que l'analyse initiale était fausse. Corrige ta réponse.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, keyReminderText, { includeTools: true });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', { styleId: copilotStyleId }), toolResult);
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
            "[Rappel interne, ne pas mentionner à l'élève] " +
            `Tu as écrit : "${voicingMismatch.claim}", mais la répartition réelle du voicing est : ${formatVoicingNotes(toolResult.voicing)}. ` +
            "Corrige ta description pour qu'elle corresponde exactement aux notes jouées, sans t'excuser ni évoquer ce rappel.";

          const second = await retryWithInternalReminder(config, payloadMessages, content, voicingReminderText, { includeTools: true });
          retryConsumedThisTurn = true;
          if (second.ok) {
            content = second.choice.content || '';
            toolResult = keepExample(executeToolCalls(second.choice.tool_calls, '', { styleId: copilotStyleId }), toolResult);
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
      // L'exemple démarre seul, après l'affichage de la réponse, si l'élève a demandé à entendre.
      autoplay: Boolean(toolResult.example) && wantsToHear(message),
    };
  } catch (err) {
    console.warn('[CopilotClient] Appel échoué :', err);
    return { ok: false, error: err.message || 'Appel au modèle impossible.' };
  }
}
