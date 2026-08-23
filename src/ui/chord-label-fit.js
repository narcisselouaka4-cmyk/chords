/**
 * Adaptation d'un symbole d'accord à la largeur disponible.
 *
 * La timeline affichait `truncate` : à l'étroit, `F#m` devenait `F...`, plus
 * long que l'original et illisible. Tronquer un symbole d'accord n'a aucun sens
 * — il ne se lit pas de gauche à droite comme un mot, sa fin porte l'essentiel
 * de l'information harmonique.
 *
 * On choisit donc, dans un ordre de repli musical, la forme la plus complète
 * qui tient réellement : le symbole entier, puis la triade sans enrichissement,
 * puis la seule fondamentale, puis rien. Le nom complet reste toujours dans
 * l'infobulle et dans l'étiquette accessible.
 *
 * Module pur, sans DOM : testable en Node.
 */

/** Largeur moyenne d'un caractère, en fraction de la taille de police. */
const CHAR_WIDTH_RATIO = 0.62;
/** Marge intérieure horizontale totale d'une pastille, en pixels. */
const BLOCK_PADDING_PX = 6;

export const LABEL_MAX_FONT_PX = 16;
export const LABEL_MIN_FONT_PX = 10;

/** Découpe un symbole en fondamentale et suffixe : « F#m7 » → « F# », « m7 ». */
export function splitChordSymbol(symbol) {
  const match = /^([A-G][#b♯♭]?)(.*)$/.exec(String(symbol || '').trim());
  if (!match) return { root: String(symbol || ''), suffix: '' };
  return { root: match[1], suffix: match[2] || '' };
}

/**
 * Formes successives d'un symbole, de la plus complète à la plus réduite.
 * L'ordre est musical, pas typographique : on abandonne d'abord les
 * enrichissements, puis la couleur majeur/mineur, jamais la fondamentale avant
 * le reste.
 */
export function labelVariants(symbol) {
  const clean = String(symbol || '').trim();
  if (!clean || clean === 'N') return [''];
  const { root, suffix } = splitChordSymbol(clean);
  const variants = [clean];

  // Triade nue : on retire les enrichissements en gardant la couleur.
  //   F#m7 → F#m   ·   Cmaj7 → C   ·   G7 → G   ·   Adim7 → Adim
  const triad = suffix.startsWith('m') && !suffix.startsWith('maj')
    ? `${root}m`
    : (suffix.startsWith('dim') ? `${root}dim` : root);
  if (!variants.includes(triad)) variants.push(triad);

  // Fondamentale seule, dernier recours avant le vide.
  if (!variants.includes(root)) variants.push(root);
  variants.push('');
  return variants;
}

/** Largeur qu'occuperait un texte à une taille de police donnée. */
export function estimateTextWidth(text, fontPx) {
  return String(text).length * fontPx * CHAR_WIDTH_RATIO;
}

/**
 * Choisit la forme et la taille de police qui tiennent dans `availableWidth`.
 *
 * Retourne `{ text, fontPx, truncated }`. `truncated` indique que la forme
 * affichée n'est pas le symbole complet — l'appelant doit alors s'assurer que
 * le nom entier reste accessible autrement.
 */
export function fitChordLabel(symbol, availableWidth,
                              { maxFont = LABEL_MAX_FONT_PX, minFont = LABEL_MIN_FONT_PX } = {}) {
  const full = String(symbol || '').trim();
  const usable = Math.max(0, availableWidth - BLOCK_PADDING_PX);

  for (const variant of labelVariants(full)) {
    if (variant === '') break;
    // À forme donnée, on essaie d'abord la police la plus grande qui tient.
    for (let font = maxFont; font >= minFont; font -= 1) {
      if (estimateTextWidth(variant, font) <= usable) {
        return { text: variant, fontPx: font, truncated: variant !== full };
      }
    }
  }
  return { text: '', fontPx: minFont, truncated: full !== '' };
}
