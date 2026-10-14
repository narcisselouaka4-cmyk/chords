// [Claude] — 2026-10-14 — Pédagogie IA : ce que dit le prof, étape par étape, EN FRANÇAIS.
//
// Narcisse : « on ne comprend pas toujours de quoi parle le pianiste, quels procédés il utilise
// (surtout avec la barrière de la langue) » ; « cela s'adresse […] à tous ceux qui ne comprennent pas
// la langue de la vidéo ». Le guide (tutorial-guide.js) découpe le tuto en étapes et garde ses
// paroles (transcription automatique, souvent en anglais). Une seule demande au modèle du Copilote
// donne, pour chaque étape, un titre et une phrase en français. Il ne reçoit que ce que l'application
// a relevé (mains, accords, paroles) et la consigne de ne rien ajouter : pas de note, pas d'accord.
//
// Module pur (testé par test-guide-summaries.js) : la requête, la lecture de la réponse, l'application
// au guide. L'appel lui-même est fait par pedagogie-tab.js.

const HAND_WORDS = { both: 'les deux mains', lh: 'main gauche seule', rh: 'main droite seule', line: 'notes du dessus, une par une', talk: 'il parle sans jouer' };
const MAX_SAID = 420;
const MAX_TITLE = 60;
const MAX_SUMMARY = 200;

/** La signature d'un guide : ses étapes (pour ne pas réutiliser des résumés d'un autre découpage). */
export function guideSignature(guide) {
  if (!guide?.steps?.length) return '';
  return guide.steps.map((s) => `${s.id}@${Math.round(s.start)}-${Math.round(s.end)}:${s.kind}`).join('|');
}

/** Faut-il demander des résumés ? Seulement s'il y a des paroles à comprendre. */
export function needsSummaries(guide) {
  return Boolean(guide?.steps?.some((s) => s.said?.length));
}

const clock = (t) => {
  const s = Math.max(0, Math.floor(Number(t) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Les messages de la demande (format chat/completions).
 * @returns {{role: string, content: string}[]}
 */
export function summaryMessages(guide) {
  const steps = (guide?.steps || []).map((s) => ({
    id: s.id,
    moment: `${clock(s.start)}–${clock(s.end)}`,
    ce_qu_il_joue: HAND_WORDS[s.kind] || s.kind,
    accords: s.chords.filter((c) => !c.notes).map((c) => c.name).slice(0, 8),
    complet: Boolean(s.complete),
    paroles: (s.said || []).join(' ').slice(0, MAX_SAID),
  }));
  const parts = (guide?.parts || []).map((p) => `${p.id} : ${p.keyName}, progression ${p.progression.chords.map((c) => `${c.degree} (${c.name})`).join(' – ')}`);
  return [
    {
      role: 'system',
      content: 'Tu aides un pianiste francophone, débutant ou intermédiaire, à suivre un tutoriel de piano filmé dans une autre langue. '
        + 'Pour chaque étape du tuto, écris en français simple : un titre court (7 mots au plus) qui dit ce que le prof montre, et une phrase (22 mots au plus) qui l\'explique. '
        + 'Appuie-toi UNIQUEMENT sur ce qui est donné : ce qu\'il joue (mains), les accords relevés par l\'application et ses paroles (transcription automatique, parfois fausse). '
        + 'N\'ajoute aucune note, aucun accord, aucune technique qui n\'y est pas. Sans paroles, décris seulement ce qu\'il joue. '
        + 'Réponds par un JSON seul, sans texte autour : {"steps":[{"id":"s1","titre":"…","resume":"…"}]}.',
    },
    {
      role: 'user',
      content: `Parties du tuto :\n${parts.join('\n')}\n\nÉtapes :\n${JSON.stringify(steps)}`,
    },
  ];
}

/** Le premier objet JSON d'un texte (le modèle l'entoure parfois de ```json … ```). */
function firstJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { return null; }
}

/**
 * La réponse du modèle → { id: { title, summary } } pour les étapes du guide seulement ; textes
 * nettoyés et bornés. Rien d'exploitable : {}.
 */
export function parseSummaries(text, guide) {
  const data = firstJson(text);
  const list = Array.isArray(data?.steps) ? data.steps : [];
  const ids = new Set((guide?.steps || []).map((s) => s.id));
  // Sans mise en forme (gras, titres, balises) ; le « # » d'un accord (A7#9) reste.
  const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').replace(/[*_`<>]/g, '').replace(/^#+\s*/, '').trim().slice(0, max);
  const out = {};
  for (const item of list) {
    if (!item || !ids.has(item.id)) continue;
    const title = clean(item.titre ?? item.title, MAX_TITLE);
    const summary = clean(item.resume ?? item.résumé ?? item.summary, MAX_SUMMARY);
    if (title || summary) out[item.id] = { title, summary };
  }
  return out;
}

/** Le guide avec les titres et phrases en français (les originaux restent dans autoTitle / autoSummary). */
export function applySummaries(guide, summaries) {
  if (!guide || !summaries || !Object.keys(summaries).length) return guide;
  return {
    ...guide,
    steps: guide.steps.map((s) => {
      const fr = summaries[s.id];
      if (!fr) return s;
      return { ...s, autoTitle: s.title, autoSummary: s.summary, title: fr.title || s.title, summary: fr.summary || s.summary, translated: true };
    }),
  };
}
