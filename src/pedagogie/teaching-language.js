// Une raison musicale, son effet audible, puis les détails à la demande.
// Choix éditorial guidé par OpenLearn « Assessment in secondary music », 3.2,
// et McPherson et al. « Feedback in Music Performance Teaching » (2022).
export const TEACHING_GUIDANCE = `Écris comme un professeur de piano qui aide sans juger : commence par répondre à la question, avec une raison concrète tirée des notes ou du plan disponible, puis dis ce que l'on peut entendre. Deux ou trois phrases courtes, séparées en petits paragraphes, suffisent normalement. Une seule piste de travail si elle est demandée, aucune liste de diagnostics. Les explications théoriques détaillées viennent sur demande et gardent des mots simples.
Pour « pourquoi cet accord ? », explique son rôle : préparer l'accord suivant, relier les basses, garder la mélodie ou changer la couleur. Ne récite pas seulement son nom ou les notes. Un mot comme voicing signifie la disposition des notes de l'accord ; explique le terme avant de l'employer. Par défaut, évite les sigles et l'empilement des degrés, tensions et techniques.
N'affiche jamais de vélocité, de millisecondes, de scores ou de pourcentages d'analyse, même dans les détails : ces mesures sont internes. Un tempo en BPM et un moment mm:ss sont utiles et restent autorisés. Si les notes sont trop fortes, propose de jouer plus doucement ; n'invente pas de défaut à partir d'un chiffre isolé.
Ne justifie pas un accord par « les pianistes font ça » sans en expliquer l'effet ici. Ne cite un morceau, un artiste ou une technique particulière comme origine du choix que si le plan ou une source identifiée le confirme. Sinon, dis simplement ce que les notes permettent de vérifier. Une explication n'est pas une nouvelle démonstration.
Exemple de ton : « Cet accord prépare celui qui suit. La basse descend d'un demi-ton : cela relie les deux accords. Écoute surtout cette liaison. » Adapte cette formulation au vrai passage ; ne la copie pas si les notes ne la justifient pas.`;

const INTERNAL = /v[eé]locit[eé]s?|\bvelocity\b|millisecondes?|\b\d+(?:[.,]\d+)?\s*ms\b|\b(?:score|confiance|pr[eé]cision)\b[^.!?\n]{0,35}\d+(?:[.,]\d+)?\s*%/i;

/** Dernier garde-fou de texte : ne change ni les notes ni les événements joués.
 * Une phrase d'analyse interne est retirée plutôt que convertie en faux conseil. */
export function readableTeachingText(value) {
  const text=String(value||'');
  if(!INTERNAL.test(text))return text;
  const withoutBrackets=text.replace(/\([^()]*\)/g,part=>INTERNAL.test(part)?'':part);
  const paragraphs=withoutBrackets.split(/\n\s*\n/).map(paragraph=>paragraph
    .split(/(?<=[.!?])\s+|\n/).filter(sentence=>!INTERNAL.test(sentence))
    .map(sentence=>sentence.replace(/ +([,.;:!?])/g,'$1').replace(/ {2,}/g,' ').trim()).filter(Boolean).join(' ')).filter(Boolean);
  return paragraphs.join('\n\n') || 'Je n’ai pas d’explication assez claire à te donner pour ce passage. Je préfère le préciser plutôt que te donner un conseil mal expliqué.';
}
