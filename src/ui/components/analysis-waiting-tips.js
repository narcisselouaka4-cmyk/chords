const tips = [
  {
    title: 'Trois accords, une résolution.',
    copy: 'Jouez chaque accord lentement. Écoutez comment le Sol7 crée une tension que le Do majeur apaise.',
    chords: [['Dm7', 'Ré · Fa · La · Do'], ['G7', 'Sol · Si · Ré · Fa'], ['Cmaj7', 'Do · Mi · Sol · Si']],
    challenge: 'Au clavier : gardez un tempo lent et régulier, puis recommencez les yeux fermés.',
  },
  {
    title: 'Moins de notes, plus de mouvement.',
    copy: 'Les tierces et les septièmes donnent déjà la couleur d’un accord. Avec deux notes par accord, écoutez les voix se rapprocher.',
    chords: [['Dm7', 'Fa · Do'], ['G7', 'Fa · Si'], ['Cmaj7', 'Mi · Si']],
    challenge: 'Au clavier : gardez le Fa entre les deux premiers accords, puis le Si entre les deux suivants.',
  },
  {
    title: 'Une même couleur, trois positions.',
    copy: 'Un accord garde son nom quand vous changez l’ordre de ses notes. Les renversements permettent de déplacer la main plus doucement.',
    chords: [['Do majeur', 'Do · Mi · Sol'], ['1er renv.', 'Mi · Sol · Do'], ['2e renv.', 'Sol · Do · Mi']],
    challenge: 'Au clavier : jouez ces trois positions avec une seule main. Cherchez un son équilibré, sans accélérer.',
  },
];

let mounted = false;
export function initAnalysisWaitingTips() {
  if (mounted) return;
  const previous = document.getElementById('analysis-waiting-tip-prev');
  const next = document.getElementById('analysis-waiting-tip-next');
  if (!previous || !next) return;
  mounted = true;
  let index = 0;
  const render = () => {
    const tip = tips[index];
    document.getElementById('analysis-waiting-tip-title').textContent = tip.title;
    document.getElementById('analysis-waiting-tip-copy').textContent = tip.copy;
    document.getElementById('analysis-waiting-challenge').textContent = tip.challenge;
    document.getElementById('analysis-waiting-tip-count').textContent = `${String(index + 1).padStart(2, '0')} / 03`;
    const chords = document.getElementById('analysis-waiting-chords');
    chords.replaceChildren(...tip.chords.map(([name, notes]) => {
      const group = document.createElement('div');
      const title = document.createElement('strong');
      const detail = document.createElement('span');
      title.textContent = name;
      detail.textContent = notes;
      group.append(title, detail);
      return group;
    }));
  };
  previous.addEventListener('click', () => { index = (index + tips.length - 1) % tips.length; render(); });
  next.addEventListener('click', () => { index = (index + 1) % tips.length; render(); });
}
