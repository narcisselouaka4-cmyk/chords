// [Refonte 02/10] — Écran d'attente commun à toute l'application.
//
// Une analyse d'accords ou une séparation de pistes occupe la machine plusieurs
// minutes. Le rond qui tournait pendant ce temps ne disait rien : ni ce qui
// travaille, ni où l'on en est. Cette scène montre la forme réelle du calcul —
// les moteurs lisent l'énergie des douze demi-tons, image par image, et avancent
// dans le morceau.
//
// Les douze colonnes sont rangées comme une octave de piano : les cinq
// « touches noires » sont plus étroites et plus sombres. La scène est posée dans
// une vraie perspective (rotateY + rotateX sur un plan en preserve-3d) et la
// ligne qui balaye est la tête de lecture.
//
// DÉCOR, et rien d'autre : aucune des hauteurs affichées ne vient de l'analyse
// en cours. C'est pour cela que la scène est marquée aria-hidden — elle occupe
// l'attente, elle ne prétend pas la mesurer. Le texte d'état et le compteur de
// temps écoulé, eux, disent la vérité, et ce sont eux que lisent les lecteurs
// d'écran.
//
// Usage : poser `<div data-chroma-stage></div>` dans le markup, puis appeler
// mountChromaStages() une fois au démarrage.

/** Indices des « touches noires » dans une octave, à partir de do. */
const SHARPS = new Set([1, 3, 6, 8, 10]);

/** Markup de la scène. Pure chaîne : aucun état, aucun écouteur. */
export function chromaStageMarkup() {
  const columns = Array.from({ length: 12 }, (_, i) => {
    const cls = SHARPS.has(i) ? 'pjc-chroma-col is-sharp' : 'pjc-chroma-col';
    return `<span class="${cls}" style="--i:${i}"><i></i></span>`;
  }).join('');

  return `<div class="pjc-chroma-stage" aria-hidden="true">`
    + `<div class="pjc-chroma-grid">`
    + `<span class="pjc-chroma-floor"></span>`
    + columns
    + `<span class="pjc-chroma-scan"></span>`
    + `</div></div>`;
}

/**
 * Remplit tous les emplacements `[data-chroma-stage]` du document.
 * Idempotent : un emplacement déjà rempli est laissé tel quel, pour que
 * l'appeler deux fois ne reconstruise pas des scènes en pleine animation.
 * @param {ParentNode} [root=document]
 */
export function mountChromaStages(root = document) {
  root.querySelectorAll('[data-chroma-stage]').forEach((slot) => {
    if (slot.firstElementChild) return;
    slot.innerHTML = chromaStageMarkup();
  });
}
