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
          + "pouvez lire, corriger et travailler au piano. Ce tutoriel dure deux minutes "
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
        title: 'Revenir au tutoriel',
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
          "Formats acceptés : MP3, WAV, M4A. L'analyse porte toujours sur le fichier "
          + "d'origine — rien n'est modifié sur votre disque.",
      },
      {
        id: 'import-video',
        target: '#analyzer-import-video-btn',
        title: 'Ou une vidéo',
        body:
          "Un fichier MP4 fonctionne aussi : la bande son en est extraite pour l'analyse. "
          + "L'application vous demandera ensuite s'il s'agit d'un tutoriel pédagogique "
          + "ou d'un morceau, ce qui adapte l'interprétation.",
      },
      {
        id: 'import-library',
        target: '#analyzer-library-list',
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
      {
        id: 'chordify-legend',
        target: '#analyzer-timeline-legend',
        title: 'Tous les accords ne se valent pas',
        body:
          "Un **accord structurel** porte la progression : il est encadré nettement. "
          + "Un **accord de passage** est bref et relie deux piliers : il reste lisible "
          + "mais discret. Un accord **incertain** signale une détection peu sûre — "
          + "c'est souvent là qu'une correction est utile. La case « Hiérarchiser » "
          + "désactive ce codage si vous préférez une grille uniforme.",
      },
      {
        id: 'chordify-select',
        target: '#analyzer-inspector-empty',
        title: 'Sélectionner un accord',
        body:
          "Cliquez sur un bloc de la timeline : ses détails s'affichent ici — "
          + "fondamentale, qualité, basse, notes, degré, confiance, et son rôle "
          + "harmonique. La sélection est indépendante de la lecture : vous pouvez "
          + "examiner un accord pendant que le morceau tourne.",
      },
      {
        id: 'chordify-edit',
        target: '#analyzer-inspector-edit-btn',
        title: 'Corriger un accord',
        body:
          "Quand la détection se trompe, corrigez-la : bouton « Modifier », ou "
          + "double-clic sur le bloc, ou touche Entrée quand il a le focus. Vous "
          + "choisissez fondamentale, qualité et basse. L'accord corrigé porte un "
          + "crayon, et Ctrl+Z annule.",
      },
      {
        id: 'chordify-hero',
        target: '#analyzer-hero',
        title: "L'accord en cours",
        body:
          "Pendant la lecture, cette carte affiche l'accord du moment, ses notes et "
          + "leur position sur le clavier. C'est la vue à garder sous les yeux quand "
          + "vous rejouez le morceau.",
      },
      {
        id: 'chordify-sections',
        target: '#analyzer-section-tabs',
        title: 'Aller plus loin',
        body:
          "Ces sous-onglets ouvrent la vue d'ensemble du morceau, les propositions de "
          + "réharmonisation et la masterclass. Ils s'appuient tous sur la grille que "
          + "vous venez de lire — et donc sur vos corrections.",
      },
      {
        id: 'chordify-save',
        target: '#analyzer-reanalyze-btn',
        title: 'Vos corrections sont conservées',
        body:
          "L'analyse et vos corrections sont enregistrées automatiquement à côté du "
          + "fichier audio. Rouvrir le morceau les restitue sans recalcul — le badge "
          + "« ↺ Analyse enregistrée » vous l'indique. « ↻ Relancer l'analyse » "
          + "recalcule tout depuis l'audio si vous le souhaitez.",
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
