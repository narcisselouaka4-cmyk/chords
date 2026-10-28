// Quota mensuel d'appels IA, partagé par tous les consommateurs d'IA
// (Réglages, Copilote…). Anciennement porté par masterclass-panel.js,
// déplacé ici lors du retrait du sous-onglet Masterclass (2026-10-28).
const CAP_KEY = 'piano-jazz-ai-monthly-cap';
const USAGE_KEY = 'piano-jazz-ai-monthly-usage';

export function getMonthlyCap() {
  try {
    const raw = localStorage.getItem(CAP_KEY);
    const n = raw ? parseInt(raw, 10) : 50;
    return Number.isFinite(n) && n > 0 ? n : 50;
  } catch (_) { return 50; }
}

export function setMonthlyCap(value) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n) && n > 0) {
    localStorage.setItem(CAP_KEY, String(n));
  }
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthlyUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return data[currentMonthKey()] || 0;
  } catch (_) { return 0; }
}

export function incrementMonthlyUsage() {
  try {
    const data = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    data[currentMonthKey()] = (data[currentMonthKey()] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(data));
  } catch (_) { /* ignore */ }
}
