// [Claude] — 2026-09-06 — Copilot IA : client de chat avec outil clavier.
//
// Ce module encapsule l'appel au modèle OpenAI-compatible (Groq via la config
// existante) et l'exécution des tool_calls. Il ne connaît pas l'UI : il reçoit
// un contexte (transcription + grille d'accords) et un historique de messages,
// et renvoie un résultat structuré.
//
// Contraintes respectées :
//   - sans clé configurée, pas d'appel réseau (gating dans l'appelant) ;
//   - les tool_calls jouent sur le clavier virtuel existant (playVirtualNote /
//     releaseVirtualNote) et ne créent jamais un AudioContext séparé ;
//   - les notes hors tessiture (MIDI 21–108) sont ignorées, sans bloquer le chat ;
//   - les erreurs réseau/clé sont propagées comme dans ai-client.js.

import { getAIConfig, callChatCompletions } from '../ai/openai-config.js';
import { playVirtualNote, releaseVirtualNote } from '../virtual-keyboard.js';
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
} from './copilot-progression.js';
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
import { classifyIntent } from './intent-classifier.js';

const COPILOT_SYSTEM_PROMPT = `Tu es l'assistant d'analyse musicale intégré à l'application Piano Jazz Chords. Ton rôle est d'aider le pianiste à décortiquer objectivement la musique, à comprendre les harmonies et à explorer de nouvelles sonorités, quel que soit son style. Adapte-toi toujours au style du morceau et reste factuel, neutre et précis. Tu n'es pas là pour juger la performance, mais pour agir comme un partenaire d'exploration. Garde tes explications concises.\n\nContexte fourni :\n- s'il s'agit d'un tutoriel vidéo : la transcription de ce que dit le professeur (ou sa traduction en français), la grille d'accords relevée par l'application sur la même vidéo, la tonalité détectée si elle est connue ;\n- s'il s'agit d'une session MIDI enregistrée : le nom de la session, sa durée, son tempo, la tonalité si elle est connue, le nombre de notes et d'accords joués, ainsi qu'une liste simplifiée des notes/accords détectés ;\n- l'état du clavier MIDI virtuel : visible ou masqué/réduit.\n\nRègles :\n1. Réponds toujours en français, de façon concise et pédagogique.\n2. Ne dis jamais ce que l'application n'a PAS relevé : n'invente aucun accord, aucune note, aucun concept.\n3. N'utilise play_note que quand l'élève te demande explicitement d'entendre quelque chose au clavier (un intervalle, une note isolée, une ligne mélodique). Ne joue jamais de notes de ton propre chef pour « illustrer » une réponse qui n'a pas sollicité d'audio.\n4. **Un appel play_note = une seule note.** Pour jouer un accord de 4 notes, tu dois faire 4 appels play_note, chacun avec un midi différent. Tu ne peux pas mettre plusieurs notes dans un seul appel play_note : la propriété 'midi' n'accepte qu'un seul entier.\n5. Quand tu joues UN accord isolé à la demande de l'élève, décompose-le en arpège par défaut : envoie les notes avec des startOffsetMs échelonnés d'environ 300 à 450 ms entre chaque note, plutôt que toutes au même instant. Cet espacement pédagogique laisse le temps à l'élève de reconnaître chaque note. Si l'élève demande explicitement que les notes soient jouées « en même temps », « plaquées », ou une formulation équivalente, alors utilise le même startOffsetMs pour toutes les notes de l'accord.\n6. Quand tu démontres un mouvement, une progression ou un enchaînement (plusieurs accords), envoie PLUSIEURS appels play_note avec des startOffsetMs croissants pour respecter l'ordre et le rythme du passage — ne te limite pas à une seule note. Les notes d'un même accord, au sein de ce mouvement, partagent le même startOffsetMs (ou suivent la règle 5 si tu les arpèges). Espace les éléments d'environ 700 à 900 millisecondes pour un tempo pédagogique clair, sauf si l'élève demande explicitement d'aller plus vite. Limite une démonstration à une quinzaine d'événements maximum pour rester écoutable.\n\nExemple concret pour un ii-V-I en C majeur (Dm7 - G7 - Cmaj7), arpégé de bas en haut :\n- Dm7 : play_note(midi=50, startOffsetMs=0), play_note(midi=53, startOffsetMs=350), play_note(midi=57, startOffsetMs=700), play_note(midi=60, startOffsetMs=1050)\n- G7 : play_note(midi=55, startOffsetMs=1750), play_note(midi=59, startOffsetMs=2100), play_note(midi=62, startOffsetMs=2450), play_note(midi=65, startOffsetMs=2800)\n- Cmaj7 : play_note(midi=48, startOffsetMs=3500), play_note(midi=52, startOffsetMs=3850), play_note(midi=55, startOffsetMs=4200), play_note(midi=59, startOffsetMs=4550)\nChaque accord utilise donc 4 appels play_note distincts, un par note.\n7. Si l'élève te dit « ralentis », « recommence », « plus lent », « arpèges » ou toute formulation équivalente, applique strictement sa demande à ta prochaine démonstration : ralentis l'espacement (jusqu'à 500–700 ms entre notes d'un arpège, 1000 ms entre accords), reprends le même passage note par note, ou arpège l'accord selon ce qu'il a demandé. N'augmente jamais la vitesse après une demande de ralentissement.\n8. N'hésite pas à enrichir tes accords et tes mouvements avec des tensions (9e, 11e, 13e) et des voicings de jazz/gospel (drop 2, rootless, quartal) quand le contexte le permet, plutôt que de rester sur des triades de base. Varie la couleur harmonique pour montrer des sonorités professionnelles, sans surcharger si l'élève semble débutant.\n9. Si l'élève pose une question sans rapport avec le tutoriel, recentre-le gentiment sur la vidéo.\n10. Quand tu cites un moment de la vidéo, utilise le format mm:ss.\n11. Si tu dois jouer ou annoter le clavier virtuel alors que le contexte indique qu'il est masqué, réponds EXACTEMENT : « Le clavier MIDI virtuel est masqué. Pour voir la démonstration, veuillez l'afficher. » — ne joue pas silencieusement des notes dans un clavier invisible.\n12. Distinction entre deux types de correction de l'élève. (a) S'il corrige un raisonnement que tu as toi-même avancé (intervalle, degré, accord diatonique), prends le temps de vérifier ton raisonnement avant de répondre plutôt que de donner la première réponse venue. Si sa correction est cohérente, accepte-la sans discuter plutôt que de t'entêter. (b) S'il affirme une tonalité, un accord ou une note qui contredisent les données déjà calculées par l'application (tonalité fournie dans le contexte, grille d'accords relevée, notes détectées), ne cède pas par politesse. Explique pourquoi les données ne soutiennent pas son hypothèse, ou accepte explicitement de 'raisonner comme si' à sa demande sans jamais prétendre que l'analyse initiale était fausse.\n13. Pour varier tes démonstrations et rendre ton jeu plus riche, ne répète pas systématiquement le même sens d'arpège (grave vers aigu) : varie parfois la direction (aigu vers grave, ou en éventail depuis une note centrale). Tu peux aussi ajouter une appoggiature : une note d'approche (souvent voisine par degré conjoint ou chromatique de la note cible) jouée juste avant elle, avec un startOffsetMs très proche (quelques dizaines de millisecondes avant) et une durationMs courte, avant que la note cible ne soit jouée à son tour avec sa durée normale. Utilise ces techniques avec discernement, pas systématiquement sur chaque note.\n14. Quand c'est pertinent (illustrer une progression, un enchaînement gospel/jazz, ou répondre à une question de style), appuie-toi sur la bibliothèque de mouvements de référence fournie dans ce message plutôt que d'improviser sans repère — cite le mouvement dont tu t'inspires si tu t'en sers.\n15. RÈGLE STRICTE : pour jouer UN SEUL accord, un voicing ou une position pianistique, utilise l'outil play_voicing. L'outil play_note est INTERDIT pour les accords complets : il ne sert qu'aux intervalles, aux notes isolées et aux lignes mélodiques pures.\n16. Quand l'élève demande un lick, un riff, un fill ou une phrase mélodique courte, utilise IMPÉRATIVEMENT l'outil play_lick en précisant l'accord cible, le style, la main (RH/LH/both) et le niveau de difficulté. N'utilise pas play_note pour ça. L'application générera une phrase rythmiquement adaptée et réellement jouable.\n17. Quand l'élève demande une PROGRESSION, un enchaînement d'accords, une résolution (par exemple "ii-V-I", "7 vers 3", "guide tones sur ii-V-I", "enchaînement Dm7 G7 Cmaj7"), tu dois IMPÉRATIVEMENT utiliser l'outil play_progression. Tu lui passeras la liste d'accords, le focus pédagogique ('7-to-3' pour entendre la résolution 7→3, 'full' pour les accords complets, 'guide-tones-only' pour seulement la ligne de guide tones), le style et le pattern. Tu ne dois PAS utiliser play_voicing ni play_note pour une progression.\n18. Structure toujours une démonstration pianistique en distinguant : (a) l'accord (son nom), (b) le voicing choisi (main gauche / main droite), (c) la technique (drop 2, rootless, etc.), (d) le pattern rythmique (block, arpège, syncopé), (e) la justification musicale. Ne te contente pas de jouer les notes de l'accord : montre comment un pianiste les répartit réellement. Conventions réelles du moteur de voicing : close = main gauche fondamentale (+ basse si accord renversé/slash), main droite le reste de l'accord resserré dans une octave ; drop2 = empilement fermé à 4 voix dont la 2e voix depuis le haut (le plus souvent la quinte) descend d'une octave à la main gauche, les 3 autres voix restant à la main droite — la fondamentale est donc à la MAIN DROITE, pas à la main gauche, et drop2 exige un accord de 4 sons minimum ; rootless = main gauche 3ce + 7e seulement (la fondamentale n'est jamais à la basse) ; quartal = main gauche shell fondamentale + tierce (+ 7e), main droite empilement de quartes. Décris toujours la répartition réelle sans inventer de notes.\n19. Après une réponse qui ouvre naturellement une suite (explication d'un accord, d'un concept, d'une technique), appelle l'outil suggest_actions pour proposer 2 à 4 actions rapides cliquables (ex. : "Démontrer au clavier", "Main gauche", "Voicing drop 2", "Appliquer sur II-V-I"). Le texte affiché doit être concis (3–25 caractères) et le message associé doit être prêt à être envoyé tel quel au Copilot.\n20. Quand tu joues les notes d'un accord identifiable (isolé ou au sein d'une démonstration), tu peux préciser sur les appels play_note concernés les champs optionnels impliedChordName (nom de l'accord), impliedRomanNumeral (son degré en chiffre romain si la tonalité est connue) et impliedKey (la tonalité de référence) — cela nous aide à vérifier automatiquement la cohérence de ce que tu joues. Ne remplis ces champs que quand tu es sûr de l'accord et du degré, laisse-les vides sinon plutôt que de deviner. Ne change rien à ta façon de jouer (arpège, appoggiature, direction, mouvement) à cause de cette règle : elle ne concerne que ces trois champs.\n21. N'oublie jamais qu'une progression est UN SEUL outil play_progression : tu ne dois pas la découper en plusieurs play_voicing ou play_note.\n22. Formate tes explications en texte brut lisible. N'utilise JAMAIS de syntaxe LaTeX (par exemple \\$\\rightarrow\\$, \\$\\to\\$, \\$\\mapsto\\$) pour les flèches, les intervalles ou les degrés. Utilise des flèches Unicode simples comme → ou des tirets —, et écris les notes et accords directement (ex. : « Do (7e de Dm7) → Si (3e de G7) »).\n23. Quand tu annonces les notes jouées, donne-les sous forme de noms de notes français (Do, Ré, Mi, Fa, Sol, La, Si) avec l'octave si possible, et non sous forme de liste de numéros MIDI. Par exemple : « Notes : Do3, Mi4, Sol4 ».\n`;
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
    description: 'Met en évidence des touches du clavier MIDI virtuel avec une flèche ou un repère visuel. À utiliser pour montrer visuellement où se trouvent les notes d\'un accord ou d\'un passage. Toute annotation précédente est effacée avant de poser la nouvelle.',
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
                description: 'Numéro MIDI de la touche à mettre en évidence, entre 21 et 108.',
              },
              label: {
                type: 'string',
                description: 'Texte court affiché au-dessus de la touche (optionnel), 20 caractères maximum.',
              },
            },
            required: ['midi'],
          },
          description: 'Liste des touches à annoter. 1 à 12 éléments.',
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

function clampMidi(midi) {
  const n = Number.isFinite(midi) ? Math.round(midi) : NaN;
  if (Number.isNaN(n)) return null;
  return Math.max(21, Math.min(108, n));
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
  if (typeof document === 'undefined' || !document.getElementById) return;
  const layer = document.getElementById('keyboard-annotation-layer');
  if (layer) layer.innerHTML = '';
}

function annotateKeyboard(notes) {
  clearKeyboardAnnotations();
  if (typeof document === 'undefined' || !document.getElementById || !document.querySelector) return [];
  const layer = document.getElementById('keyboard-annotation-layer');
  const svg = document.querySelector('#keyboard-container svg');
  if (!layer || !svg) return [];

  const svgRect = svg.getBoundingClientRect();
  const annotated = [];

  for (const note of notes) {
    const midi = clampMidi(note.midi);
    if (midi === null) continue;
    const key = document.getElementById(`note-${midi}`);
    if (!key) continue;
    const rect = key.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - svgRect.left;
    const y = rect.top - svgRect.top;

    const marker = document.createElement('div');
    marker.className = 'keyboard-annotation-marker';
    marker.style.position = 'absolute';
    marker.style.left = `${x}px`;
    marker.style.top = `${Math.max(0, y - 28)}px`;
    marker.style.transform = 'translate(-50%, 0)';
    marker.innerHTML = `<div class="keyboard-annotation-arrow">&#8595;</div>
      <div class="keyboard-annotation-label">${(note.label || midiToName(midi)).replace(/</g, '&lt;')}</div>`;
    layer.appendChild(marker);
    annotated.push({ midi, name: midiToName(midi) });
  }
  return annotated;
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

function parsePlayNoteAnnotations(content) {
  const played = [];
  const annotated = [];
  const regex = /\[PLAY_NOTE:\s*([^\]]+)\]/gi;
  let match;
  let groupStartOffsetMs = 0;
  while ((match = regex.exec(content)) !== null) {
    const rawNames = match[1] || '';
    const names = rawNames.split(',').map((n) => n.trim()).filter(Boolean);
    const groupSize = names.length;
    names.forEach((name, index) => {
      const midi = noteNameToMidi(name);
      if (midi === null) return;
      const velocity = 0.8;
      const durationMs = 600;
      // Au sein d'un même groupe, les notes sont espacées comme un arpège
      // pédagogique (300–450 ms). Entre groupes, on laisse 700–900 ms.
      const noteStartOffsetMs = groupStartOffsetMs + index * 375;
      try {
        const timer = setTimeout(() => {
          pendingCopilotTimers.delete(timer);
          playVirtualNote(midi, velocity);
          if (typeof document !== 'undefined' && document.dispatchEvent) {
            document.dispatchEvent(new CustomEvent('copilot-note-on', { detail: { midi } }));
          }
          const releaseTimer = setTimeout(() => {
            releaseVirtualNote(midi);
            if (typeof document !== 'undefined' && document.dispatchEvent) {
              document.dispatchEvent(new CustomEvent('copilot-note-off', { detail: { midi } }));
            }
          }, durationMs);
          pendingCopilotTimers.add(releaseTimer);
        }, noteStartOffsetMs);
        pendingCopilotTimers.add(timer);
        played.push({ midi, name: midiToName(midi), startOffsetMs: noteStartOffsetMs, startTimer: timer });
      } catch (err) {
        console.warn('[CopilotClient] Impossible de programmer une note textuelle :', name, err);
      }
    });
    groupStartOffsetMs += (groupSize > 1 ? 450 : 0) + 700;
  }
  return { played, ignored: 0, annotated };
}

let pendingCopilotTimers = new Set();

export function cancelPendingCopilotNotes() {
  for (const timer of pendingCopilotTimers) {
    clearTimeout(timer);
  }
  pendingCopilotTimers.clear();
  clearKeyboardAnnotations();
  console.log('[CopilotClient] Démonstration précédente annulée avant nouvelle réponse.');
}

export function executeToolCalls(toolCalls, assistantContent = '') {
  const played = [];
  const annotated = [];
  const suggestions = [];
  let ignored = 0;
  let capturedVoicing = null;
  if (!Array.isArray(toolCalls)) return { played, ignored, annotated, suggestions, voicing: capturedVoicing };

  // Si on a forcé un outil, on laisse le contenu textuel intact (pas de correction
  // de nom d'accord déclenchée par l'exécution forcée).

  // Stratégie : un seul outil audio dominant par réponse.
  // Ordre de priorité : play_progression > play_voicing > play_lick > play_note.
  // Si le modèle envoie plusieurs outils audio, seul le premier selon cette
  // priorité est exécuté ; les autres sont ignorés.
  const audioPriorities = { play_progression: 0, play_voicing: 1, play_lick: 2, play_note: 3 };
  let dominantAudioTool = null;
  let dominantPriority = Infinity;
  for (const call of toolCalls) {
    const fn = call?.function?.name;
    const p = audioPriorities[fn];
    if (p != null && p < dominantPriority) {
      dominantPriority = p;
      dominantAudioTool = fn;
    }
  }

  const collapsed = isVirtualKeyboardCollapsed();

  for (const call of toolCalls) {
    const fn = call?.function?.name;
    if (fn === 'play_note') {
      if (collapsed) continue;
      // Si un outil structuré est prioritaire, ignorer play_note.
      if (dominantAudioTool && dominantAudioTool !== 'play_note') {
        ignored += 1;
        continue;
      }
      // Sinon, seul le premier play_note est exécuté (traité via alreadyPlayed plus loin).
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const midi = clampMidi(args.midi);
      if (midi === null) {
        ignored += 1;
        continue;
      }
      const velocity = safeVelocity(args.velocity);
      const durationMs = safeDuration(args.durationMs);
      const startOffsetMs = safeStartOffset(args.startOffsetMs);
      try {
        const startTimer = setTimeout(() => {
          pendingCopilotTimers.delete(startTimer);
          playVirtualNote(midi, velocity);
          if (typeof document !== 'undefined' && document.dispatchEvent) {
            document.dispatchEvent(new CustomEvent('copilot-note-on', { detail: { midi } }));
          }
          const releaseTimer = setTimeout(() => {
            releaseVirtualNote(midi);
            if (typeof document !== 'undefined' && document.dispatchEvent) {
              document.dispatchEvent(new CustomEvent('copilot-note-off', { detail: { midi } }));
            }
          }, durationMs);
          pendingCopilotTimers.add(releaseTimer);
        }, startOffsetMs);
        pendingCopilotTimers.add(startTimer);
        const noteEvent = { midi, name: midiToName(midi), startOffsetMs, startTimer };
        if (args.impliedChordName) noteEvent.impliedChordName = String(args.impliedChordName);
        if (args.impliedRomanNumeral) noteEvent.impliedRomanNumeral = String(args.impliedRomanNumeral);
        if (args.impliedKey) noteEvent.impliedKey = String(args.impliedKey);
        played.push(noteEvent);
      } catch (err) {
        console.warn('[CopilotClient] Échec du jeu de la note', midi, err);
        ignored += 1;
      }
    } else if (fn === 'annotate_keyboard') {
      if (collapsed) continue;
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const list = Array.isArray(args.notes) ? args.notes : [];
      const ok = annotateKeyboard(list);
      annotated.push(...ok);
      if (ok.length === 0) ignored += 1;
    } else if (fn === 'suggest_actions') {
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const list = Array.isArray(args.actions) ? args.actions : [];
      if (list.length > 0) {
        suggestions.push(...list.filter((a) => a && typeof a.label === 'string' && typeof a.message === 'string'));
      } else {
        ignored += 1;
      }
    } else if (fn === 'play_voicing') {
      if (collapsed) continue;
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const alreadyPlayed = played.length > 0 || annotated.length > 0;
      if (alreadyPlayed || (dominantAudioTool && dominantAudioTool !== 'play_voicing')) {
        // Un seul outil audio dominant par tour.
        ignored += 1;
        continue;
      }
      const chordSymbol = String(args.chordSymbol || '').trim();
      if (!chordSymbol) {
        ignored += 1;
        continue;
      }
      const durationMs = Math.max(200, Math.min(3000, Number.isFinite(args.durationMs) ? args.durationMs : 1200));
      const startOffsetMs = safeStartOffset(args.startOffsetMs);
      const pattern = ['block', 'arppegio-up', 'arppegio-down', 'rolled'].includes(args.pattern) ? args.pattern : 'block';
      const context = args.context === 'solo' ? 'solo' : 'accompaniment';
      const voicing = generateCopilotVoicing(chordSymbol, {
        styleId: args.styleId || 'auto',
        technique: args.technique || undefined,
        context,
      });
      capturedVoicing = voicing;
      if (!voicing.isPlayable) {
        const diag = voicing.diagnostics.join(' ; ');
        console.warn('[CopilotClient] play_voicing invalide :', diag);
        ignored += 1;
        // On garde un message explicite pour l'utilisateur au lieu du silence.
        content = content
          ? `${content}\n\n_(Je n'ai pas trouvé de voicing jouable pour **${chordSymbol}** : ${diag}. Essaie avec un autre accord ou un style différent.)_`
          : `_(Je n'ai pas trouvé de voicing jouable pour **${chordSymbol}** : ${diag}. Essaie avec un autre accord ou un style différent.)_`;
        continue;
      }
      const sequence = voicingToNoteSequence(voicing, { pattern, startOffsetMs, durationMs });
      for (const note of sequence) {
        try {
          const startTimer = setTimeout(() => {
            pendingCopilotTimers.delete(startTimer);
            playVirtualNote(note.midi, note.velocity || 0.8);
            if (typeof document !== 'undefined' && document.dispatchEvent) {
              document.dispatchEvent(new CustomEvent('copilot-note-on', { detail: { midi: note.midi } }));
            }
            const releaseTimer = setTimeout(() => {
              releaseVirtualNote(note.midi);
              if (typeof document !== 'undefined' && document.dispatchEvent) {
                document.dispatchEvent(new CustomEvent('copilot-note-off', { detail: { midi: note.midi } }));
              }
            }, note.durationMs);
            pendingCopilotTimers.add(releaseTimer);
          }, note.startOffsetMs);
          pendingCopilotTimers.add(startTimer);
          const noteEvent = {
            midi: note.midi,
            name: midiToName(note.midi),
            startOffsetMs: note.startOffsetMs,
            hand: note.hand,
            role: note.role,
            startTimer,
          };
          if (args.impliedChordName) noteEvent.impliedChordName = String(args.impliedChordName);
          if (args.impliedRomanNumeral) noteEvent.impliedRomanNumeral = String(args.impliedRomanNumeral);
          if (args.impliedKey) noteEvent.impliedKey = String(args.impliedKey);
          played.push(noteEvent);
        } catch (err) {
          console.warn('[CopilotClient] Échec du jeu de la note', note.midi, err);
          ignored += 1;
        }
      }
    } else if (fn === 'play_lick') {
      if (collapsed) continue;
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const alreadyPlayed = played.length > 0 || annotated.length > 0;
      if (alreadyPlayed || (dominantAudioTool && dominantAudioTool !== 'play_lick')) {
        // Un seul outil audio dominant par tour.
        ignored += 1;
        continue;
      }
      const target = String(args.target || '').trim();
      if (!target) {
        ignored += 1;
        continue;
      }
      const styleId = args.styleId || 'auto';
      const hand = ['RH', 'LH', 'both'].includes(args.hand) ? args.hand : 'RH';
      const difficulty = ['beginner', 'intermediate', 'advanced'].includes(args.difficulty) ? args.difficulty : 'intermediate';
      const lengthBeats = Math.max(2, Math.min(8, Number.isFinite(args.lengthBeats) ? args.lengthBeats : 4));
      const startOffsetMs = safeStartOffset(args.startOffsetMs);
      const lick = generateCopilotLick(target, {
        styleId,
        hand,
        difficulty,
        lengthBeats,
        startOffsetMs,
      });
      if (!lick.isPlayable) {
        const diag = lick.diagnostics.join(' ; ');
        console.warn('[CopilotClient] play_lick invalide :', diag);
        ignored += 1;
        content = content
          ? `${content}\n\n_(Je n'ai pas trouvé de lick jouable pour **${target}** : ${diag}. Essaie avec un autre accord ou un niveau de difficulté différent.)_`
          : `_(Je n'ai pas trouvé de lick jouable pour **${target}** : ${diag}. Essaie avec un autre accord ou un niveau de difficulté différent.)_`;
        continue;
      }
      for (const note of lick.notes) {
        try {
          const startTimer = setTimeout(() => {
            pendingCopilotTimers.delete(startTimer);
            playVirtualNote(note.midi, note.velocity || 0.8);
            if (typeof document !== 'undefined' && document.dispatchEvent) {
              document.dispatchEvent(new CustomEvent('copilot-note-on', { detail: { midi: note.midi } }));
            }
            const releaseTimer = setTimeout(() => {
              releaseVirtualNote(note.midi);
              if (typeof document !== 'undefined' && document.dispatchEvent) {
                document.dispatchEvent(new CustomEvent('copilot-note-off', { detail: { midi: note.midi } }));
              }
            }, note.durationMs);
            pendingCopilotTimers.add(releaseTimer);
          }, note.startOffsetMs);
          pendingCopilotTimers.add(startTimer);
          played.push({
            midi: note.midi,
            name: midiToName(note.midi),
            startOffsetMs: note.startOffsetMs,
            hand: note.hand,
            role: note.role,
            startTimer,
          });
        } catch (err) {
          console.warn('[CopilotClient] Échec du jeu de la note', note.midi, err);
          ignored += 1;
        }
      }
    } else if (fn === 'play_progression') {
      if (collapsed) continue;
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        ignored += 1;
        continue;
      }
      const alreadyPlayed = played.length > 0 || annotated.length > 0;
      if (alreadyPlayed || (dominantAudioTool && dominantAudioTool !== 'play_progression')) {
        // Un seul outil audio dominant par tour.
        ignored += 1;
        continue;
      }
      const chords = Array.isArray(args.chords) ? args.chords.filter((c) => typeof c === 'string' && c.trim()) : [];
      if (chords.length === 0) {
        ignored += 1;
        continue;
      }
      const focus = ['7-to-3', '3-to-7', 'guide-tones-only', 'full'].includes(args.focus) ? args.focus : 'full';
      const styleId = args.styleId || 'auto';
      const pattern = ['block', 'arppegio-up', 'arppegio-down', 'rolled'].includes(args.pattern) ? args.pattern : 'rolled';
      const durationMs = Math.max(500, Math.min(6000, Number.isFinite(args.durationMs) ? args.durationMs : 2000));
      const startOffsetMs = safeStartOffset(args.startOffsetMs);
      const progression = generateCopilotProgression(chords, {
        focus,
        styleId,
        durationMs,
        startOffsetMs,
      });
      if (!progression.isPlayable) {
        const diag = progression.diagnostics.join(' ; ');
        console.warn('[CopilotClient] play_progression invalide :', diag);
        ignored += 1;
        content = content
          ? `${content}\n\n_(Je n'ai pas trouvé de progression jouable pour **${chords.join(' → ')}** : ${diag}. Essaie avec d'autres accords.)_`
          : `_(Je n'ai pas trouvé de progression jouable pour **${chords.join(' → ')}** : ${diag}. Essaie avec d'autres accords.)_`;
        continue;
      }
      const sequence = progressionToNoteSequence(progression, { pattern });
      for (const note of sequence) {
        try {
          const startTimer = setTimeout(() => {
            pendingCopilotTimers.delete(startTimer);
            playVirtualNote(note.midi, note.velocity || 0.8);
            if (typeof document !== 'undefined' && document.dispatchEvent) {
              document.dispatchEvent(new CustomEvent('copilot-note-on', { detail: { midi: note.midi } }));
            }
            const releaseTimer = setTimeout(() => {
              releaseVirtualNote(note.midi);
              if (typeof document !== 'undefined' && document.dispatchEvent) {
                document.dispatchEvent(new CustomEvent('copilot-note-off', { detail: { midi: note.midi } }));
              }
            }, note.durationMs);
            pendingCopilotTimers.add(releaseTimer);
          }, note.startOffsetMs);
          pendingCopilotTimers.add(startTimer);
          const noteEvent = {
            midi: note.midi,
            name: midiToName(note.midi),
            startOffsetMs: note.startOffsetMs,
            hand: note.hand,
            role: note.role,
            startTimer,
          };
          played.push(noteEvent);
        } catch (err) {
          console.warn('[CopilotClient] Échec du jeu de la note', note.midi, err);
          ignored += 1;
        }
      }
    } else {
      ignored += 1;
    }
  }

  if (collapsed && toolCalls.length > 0) {
    return { played, ignored, annotated, keyboardCollapsed: true, voicing: capturedVoicing };
  }
  return { played, ignored, annotated, suggestions, voicing: capturedVoicing };
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
    if (context.duration != null) lines.push(`Durée : ${formatDuration(context.duration)}`);
    if (context.tempo) lines.push(`Tempo : ${context.tempo} BPM`);
    if (context.key) lines.push(`Tonalité : ${context.key}`);
    if (Number.isFinite(context.noteCount)) lines.push(`Notes jouées : ${context.noteCount}`);
    if (Number.isFinite(context.chordCount)) lines.push(`Accords détectés : ${context.chordCount}`);
    if (context.chords?.length) {
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
  if (requestedDemo && toolResult.keyboardCollapsed) {
    return 'Le clavier MIDI virtuel est masqué. Pour voir la démonstration, veuillez l\'afficher.';
  }
  if (!content && toolResult.played.length > 0) {
    const names = toolResult.played.map((p) => p.name).join(', ');
    return `J'ai joué ces notes au clavier : ${names}.`;
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
export async function sendCopilotMessage({ message, messages, context, copilotStyleId = 'auto' }) {
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
    cancelPendingCopilotNotes();

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
    if (toolsMode && noAudioToolCalled && message) {
      const intent = classifyIntent(message);
      if (intent.intent === 'play_progression' && intent.params.chords && intent.params.chords.length > 0) {
        forcedToolCalls = [{
          function: {
            name: 'play_progression',
            arguments: JSON.stringify({
              chords: intent.params.chords,
              focus: intent.params.focus || 'full',
              styleId: intent.params.styleId || copilotStyleId || 'auto',
              pattern: intent.params.pattern || 'rolled',
            }),
          },
        }];
      } else if (intent.intent === 'play_voicing' && intent.params.chordSymbol) {
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
      ? executeToolCalls(effectiveToolCalls, content)
      : parsePlayNoteAnnotations(content);
    const suggestedActions = (toolResult.suggestions || []).slice(0, 4);
    // Quand le fallback textuel est utilisé, enrichir avec les suggestions IA
    // n'est pas possible (pas d'outil) ; les suggestions restent vides.

    const keyboardCollapsed = toolResult.keyboardCollapsed;

    const noExecution = !keyboardCollapsed && toolResult.played.length === 0 && toolResult.annotated.length === 0;
    const announcedDemo = looksLikeDemoAnnouncement(content);
    const requestedDemo = looksLikeDemoRequest(message);
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

    if (shouldRetryDemo || (requestedDemo && toolResult.played.length <= 1 && !keyboardCollapsed) || shouldRetryVoicing || shouldRetryLick || shouldRetryProgression) {
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
        content += "\n\n_(Remarque : je n'ai pas réussi à déclencher la démonstration automatiquement — n'hésite pas à redemander.)_";
        return { ok: true, content, toolResult, suggestedActions };
      }

      const retryToolResult = toolsMode
        ? executeToolCalls(second.choice.tool_calls)
        : parsePlayNoteAnnotations(second.choice.content || '');
      const retryWorked = retryToolResult.played.length > 0 || retryToolResult.annotated.length > 0 || (retryToolResult.suggestions || []).length > 0;

      if (retryWorked) {
        // On garde le texte original (qui était correct) mais on expose le
        // toolResult de la seconde tentative qui a effectivement exécuté.
        toolResult = retryToolResult;
      } else {
        content += "\n\n_(Remarque : je n'ai pas réussi à déclencher la démonstration automatiquement — n'hésite pas à redemander.)_";
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
            toolResult = executeToolCalls(second.choice.tool_calls);
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
            toolResult = executeToolCalls(second.choice.tool_calls);
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
            toolResult = executeToolCalls(second.choice.tool_calls);
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
            toolResult = executeToolCalls(second.choice.tool_calls);
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

    return { ok: true, content, toolResult };
  } catch (err) {
    console.warn('[CopilotClient] Appel échoué :', err);
    return { ok: false, error: err.message || 'Appel au modèle impossible.' };
  }
}
