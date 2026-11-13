/**
 * Contenu du tutoriel — données pures, sans DOM ni CSS.
 *
 * Séparé du moteur de visite (onboarding.js) pour deux raisons :
 *   1. le contenu est ce qui vieillit le plus vite, il doit être relisible seul ;
 *   2. il devient testable en Node — `test-onboarding.js` vérifie que chaque
 *      sélecteur visé existe réellement dans `src/index.html`. C'est ce qui
 *      empêche le tutoriel de dériver silencieusement de l'interface.
 *
 * Principe pédagogique : quatre chapitres proposés **au moment où ils servent**,
 * pas une visite unique de vingt étapes au premier lancement. On n'explique
 * Chordify qu'une fois qu'une analyse est à l'écran.
 */

export const ONBOARDING_VERSION = 1;
export const STORAGE_KEY = `pjc.onboarding.v${ONBOARDING_VERSION}`;

/** Onglets de l'application vers lesquels un chapitre peut basculer. */
export const VALID_TABS = ['practice', 'analysis', 'studio'];

export const CHAPTERS = [
  {
    id: 'welcome',
    title: 'Découvrir Piano Jazz Chords',
    summary: "Ce que fait l'application et par où commencer.",
    autoStart: 'first-run',
    steps: [
      {
        id: 'welcome-intro',
        title: 'Bienvenue',
        body:
          "Piano Jazz Chords transforme un morceau en une grille d'accords que vous "
          + "pouvez lire, corriger et travailler au piano. Ce didacticiel dure deux minutes "
          + "et reste accessible à tout moment par le bouton « ? » en haut à droite.",
      },
      {
        id: 'welcome-tabs',
        target: '#tab-nav',
        title: 'Trois espaces de travail',
        body:
          "**Analyse** détecte les accords d'un morceau et les affiche sur une timeline. "
          + "**Studio** sépare un morceau en pistes et le transpose pour le travailler. "
          + "**Entraînement** affiche en temps réel ce que vous jouez au clavier MIDI.",
      },
      {
        id: 'welcome-help',
        target: '#onboarding-help-btn',
        title: 'Revenir au didacticiel',
        body:
          "Ce bouton rouvre ce menu à tout moment et permet de reprendre un chapitre "
          + "précis — par exemple « Lire et corriger Chordify » quand vous aurez une "
          + "analyse à l'écran.",
      },
    ],
  },

  {
    id: 'import',
    title: 'Importer et analyser un morceau',
    summary: "De votre fichier audio à une grille d'accords.",
    tab: 'analysis',
    autoStart: 'after:welcome',
    steps: [
      {
        id: 'import-audio',
        target: '#analyzer-import-audio-btn',
        title: 'Importer un fichier audio',
        body:
          "Formats acceptés : MP3, WAV, M4A, MP4 et MIDI. L'analyse porte toujours sur le fichier "
          + "d'origine — rien n'est modifié sur votre disque.",
      },
      {
        id: 'import-library',
        target: '#analyzer-library-open',
        title: 'Votre bibliothèque',
        body:
          "Tout morceau importé revient ici. Le menu « ⋮ » de chaque ligne permet de le "
          + "renommer ou de le supprimer. Un morceau déjà analysé se rouvre "
          + "instantanément : ses accords sont enregistrés, rien n'est recalculé.",
      },
      {
        id: 'import-launch',
        title: "Lancer l'analyse",
        body:
          "Après le choix du fichier, un écran de préparation résume ce qui va être "
          + "détecté — accords, tonalité, tempo, structure. Le bouton "
          + "« ▶ Lancer l'analyse » démarre le calcul. Comptez une dizaine de secondes "
          + "par minute de musique ; vous pouvez changer d'onglet pendant ce temps.",
      },
    ],
  },

  {
    id: 'chordify',
    title: 'Lire et corriger Chordify',
    summary: 'La timeline d\'accords, la sélection, la correction manuelle.',
    tab: 'analysis',
    requires: 'analysis-results',
    autoStart: 'first-results',
    steps: [
      {
        id: 'chordify-timeline',
        target: '#analyzer-chord-timeline',
        title: "La timeline d'accords",
        body:
          "Chaque bloc est un accord détecté ; sa largeur est sa durée réelle. La "
          + "timeline défile horizontalement et suit la lecture : l'accord en cours est "
          + "mis en avant automatiquement. Le curseur de zoom, au-dessus, étale ou "
          + "resserre la grille.",
      },
      // [Claude] — 2026-11-13 — Étapes réécrites d'après l'onglet Analyse actuel. Depuis la refonte
      // des 27-28/10 (4787af7, 7a7eead, adc803c), il n'y a plus de légende passage / incertain ni
      // de case « Hiérarchiser », ni d'inspecteur sous la frise : la visite décrivait des éléments
      // disparus et deux de ses étapes ne montraient plus rien (#analyzer-inspector-empty,
      // #analyzer-inspector-edit-btn). Les sous-onglets restants sont « Grille d'accords » et
      // « Corriger ».
      {
        id: 'chordify-select',
        target: '#analyzer-chord-timeline',
        title: 'Sélectionner un accord',
        body:
          "Cliquez sur un bloc : la lecture se place sur cet accord, et le sous-onglet "
          + "« Corriger » affiche ses détails — les notes détectées et les candidats "
          + "proposés par le moteur. Un accord que vous avez corrigé porte un crayon ✏.",
      },
      {
        id: 'chordify-edit',
        target: '#analyzer-section-tabs',
        title: 'Corriger un accord',
        body:
          "Quand la détection se trompe : double-clic sur le bloc (ou Entrée quand il a "
          + "le focus), ou le sous-onglet « Corriger » — symbole corrigé, « Écouter en "
          + "boucle », puis « Appliquer la correction ». Ctrl+Z annule. « Grille "
          + "d'accords » montre la même grille en entier, mesure par mesure.",
      },
      {
        id: 'chordify-save',
        target: '#analyzer-reanalyze-btn',
        title: 'Vos corrections sont conservées',
        body:
          // [Claude] — 2026-11-13 — Plus de badge « Analyse enregistrée » depuis le 28/10 (demande de
          // Narcisse) : un message le dit à la réouverture ; Ctrl+S enregistre aussi.
          "L'analyse et vos corrections sont enregistrées automatiquement à côté du "
          + "fichier audio (Ctrl+S le fait aussi). Rouvrir le morceau les restitue sans "
          + "recalcul : un message vous le confirme. Ce bouton recalcule tout depuis "
          + "l'audio si vous le souhaitez.",
      },
    ],
  },

  {
    id: 'studio',
    title: 'Travailler un morceau dans le Studio',
    summary: 'Séparer les pistes, isoler le piano, transposer.',
    tab: 'studio',
    autoStart: 'first-studio',
    steps: [
      {
        id: 'studio-import',
        target: '#studio-tracks-panel',
        title: 'Les morceaux du Studio',
        body:
          "« Importer un fichier » ajoute un morceau audio ou vidéo ; la liste en "
          + "dessous garde tout ce que vous avez importé. Tant qu'aucun morceau n'est "
          + "choisi, seule cette liste est affichée : c'est le point de départ.",
      },
      {
        id: 'studio-region',
        target: '#studio-waveform-wrap',
        title: 'Choisir la portion à travailler',
        body:
          "Écoutez le morceau, puis tracez sur la forme d'onde la portion qui vous "
          + "intéresse — cinq minutes au maximum. La séparation des pistes est un "
          + "calcul lourd : la limiter à un refrain ou un couplet fait gagner beaucoup "
          + "de temps.",
      },
      {
        id: 'studio-confirm',
        target: '#studio-separate-btn',
        title: 'Séparer les pistes',
        body:
          "Une fois la région confirmée, le morceau est décomposé en basse, batterie, "
          + "voix, piano et autres instruments. Le calcul se poursuit en arrière-plan : "
          + "les onglets Analyse et Entraînement restent utilisables pendant ce temps.",
      },
      {
        id: 'studio-stems',
        target: '#studio-stems-list',
        title: 'Isoler ce que vous voulez entendre',
        body:
          "Chaque piste a son volume, son mute et son solo, applicables en pleine "
          + "lecture. Isoler le piano pour relever un voicing, couper la voix pour "
          + "jouer par-dessus : c'est ici que ça se passe.",
      },
      {
        id: 'studio-transpose',
        target: '#studio-transpose-control',
        title: 'Transposer',
        body:
          "Douze demi-tons vers le haut ou vers le bas, y compris pendant la lecture "
          + "et sans coupure. La transposition est toujours recalculée depuis l'audio "
          + "d'origine : enchaîner les changements ne dégrade pas le son.",
      },
      {
        id: 'studio-to-analysis',
        target: '#tab-nav',
        title: 'Studio et Analyse se complètent',
        body:
          "Quand un morceau a été séparé dans le Studio, l'onglet Analyse détecte les "
          + "accords sur le **piano isolé** plutôt que sur le mixage complet. C'est "
          + "souvent nettement plus fiable sur un morceau dense.",
      },
    ],
  },
];

/** Chapitre par identifiant, ou undefined. */
export function getChapter(id) {
  return CHAPTERS.find((chapter) => chapter.id === id);
}

/** Toutes les étapes de tous les chapitres, à plat. */
export function allSteps() {
  return CHAPTERS.flatMap((chapter) =>
    chapter.steps.map((step) => ({ ...step, chapterId: chapter.id })));
}

/**
 * État de progression par défaut. `seen` liste les chapitres déjà terminés ou
 * explicitement passés ; `dismissed` coupe toute proposition automatique.
 */
export function defaultProgress() {
  return { version: ONBOARDING_VERSION, seen: [], dismissed: false };
}

/** Lecture défensive : un état corrompu ne doit jamais casser le démarrage. */
export function parseProgress(raw) {
  if (!raw) return defaultProgress();
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return defaultProgress();
  }
  if (!data || typeof data !== 'object') return defaultProgress();
  if (data.version !== ONBOARDING_VERSION) return defaultProgress();
  return {
    version: ONBOARDING_VERSION,
    seen: Array.isArray(data.seen) ? data.seen.filter((id) => typeof id === 'string') : [],
    dismissed: data.dismissed === true,
  };
}

/**
 * Un chapitre doit-il être proposé automatiquement pour ce déclencheur ?
 *
 * Règle : jamais deux fois, jamais après un refus global, et uniquement au
 * moment prévu. `after:x` attend que le chapitre `x` soit terminé.
 */
export function shouldAutoStart(chapterId, trigger, progress) {
  const chapter = getChapter(chapterId);
  if (!chapter || !chapter.autoStart) return false;
  if (progress.dismissed) return false;
  if (progress.seen.includes(chapterId)) return false;
  if (chapter.autoStart.startsWith('after:')) {
    const previous = chapter.autoStart.slice('after:'.length);
    return trigger === chapter.autoStart && progress.seen.includes(previous);
  }
  return chapter.autoStart === trigger;
}
