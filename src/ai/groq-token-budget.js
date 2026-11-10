/** Une reprise bornée d'un refus TPM Groq, sans toucher au contenu envoyé. */
export function groqBudgetRetry(baseUrl, body, status, text) {
  try {
    if (new URL(baseUrl).hostname !== 'api.groq.com' || status !== 413) return null;
  } catch { return null; }
  let message = text;
  try { message = JSON.parse(text)?.error?.message || text; } catch { /* texte brut */ }
  if (!/tokens per minute|\bTPM\b/i.test(message)) return null;
  const counts = /Limit\s+(\d+)\s*,\s*Requested\s+(\d+)/i.exec(message);
  if (!counts) return null;
  const limit = Number(counts[1]), requested = Number(counts[2]);
  const field = Number.isInteger(body.max_completion_tokens) ? 'max_completion_tokens' : 'max_tokens';
  const current = body[field];
  if (!Number.isSafeInteger(current) || current <= 0 || requested <= limit || limit <= 0) return null;
  // Le refus chiffre le dépassement. On retire cet excédent de la réserve
  // de sortie, plus une marge ; aucune estimation locale ne coupe le MIDI.
  const reduced = current - (requested - limit) - 128;
  if (reduced < 512 || reduced >= current) return null;
  return { ...body, [field]: reduced };
}
