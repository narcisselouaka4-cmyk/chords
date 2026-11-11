// [Claude] — 2026-11-10 — Continuité des conversations du Copilote.
//
// Narcisse : « j'ouvre une ancienne conversation, je passe par Pédagogie IA puis Exercices, je
// reviens dans le Copilote : ce n'est plus la même conversation ». Trois choses étaient
// confondues dans copilot-tab.js :
//   1. la conversation ouverte (son identifiant, ses messages, son brouillon) ;
//   2. sa SOURCE, c'est-à-dire ce dont elle parle (rien de précis, un tutoriel, une session
//      MIDI, un exercice) — enregistrée avec elle, elle ne change pas quand on change d'onglet ;
//   3. ce que les autres écrans montrent en ce moment.
// Changer d'onglet ne touche que le point 3. Ce module garde les points 1 et 2, et dit quoi faire
// quand un écran annonce ce qu'il montre : une annonce n'est pas une demande du pianiste.
//
// Sans DOM ni IPC : l'historique (fichiers) et le stockage local sont fournis par l'appelant.
// Testé en Node par test-conversation-continuity.js.

export const AUTONOMOUS_KEY = '__copilot_autonomous__';
const STATE_KEY = 'pjc.copilot.conversations';
const MAX_DRAFTS = 30;
const MAX_DRAFT_CHARS = 4000;
const MAX_DRAFT_TAKES = 6;

/** Source d'une conversation qui ne parle de rien de précis. */
export const autonomousSource = () => ({ kind: 'autonomous', key: AUTONOMOUS_KEY });

/**
 * La source d'une conversation à partir de la clé enregistrée dans son fichier (`tutorialPath`,
 * nom historique) : chemin d'un tutoriel, identifiant d'une session MIDI, « exercice:<titre> »
 * ou clé du mode autonome. Les anciens fichiers n'ont que cette clé.
 * @param {string} key
 * @param {object} [extra] détails connus par ailleurs (nom affiché, empreinte de la session)
 */
export function sourceFromKey(key, extra = {}) {
  const value = String(key || '');
  if (!value || value === AUTONOMOUS_KEY) return autonomousSource();
  if (value.startsWith('exercice:')) return { ...extra, kind: 'exercise', key: value };
  if (/^(?:\/|[A-Za-z]:[\\/])/.test(value)) return { ...extra, kind: 'tutorial', key: value };
  return { ...extra, kind: 'session', key: value };
}

export function sameSource(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.key === b.key);
}

/** Ce qu'on écrit de la source dans le fichier de la conversation (jamais les notes). */
function storedSource(source) {
  if (!source) return autonomousSource();
  const out = { kind: source.kind, key: source.key };
  if (source.label) out.label = String(source.label).slice(0, 200);
  if (source.fingerprint) out.fingerprint = String(source.fingerprint);
  return out;
}

/**
 * Empreinte d'une session MIDI : ses notes et leurs instants. Les numéros de session peuvent
 * être réattribués après une suppression (Session_017 d'aujourd'hui n'est pas forcément celle
 * d'il y a un mois) ; l'empreinte évite de rattacher une conversation à un autre enregistrement.
 */
export function sessionFingerprint(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  if (!events.length) return '';
  let hash = 5381;
  for (const e of events) {
    const part = `${e.type}|${e.note ?? e.controller ?? ''}|${Math.round((Number(e.time) || 0) * 1000)};`;
    for (let i = 0; i < part.length; i += 1) hash = ((hash << 5) + hash + part.charCodeAt(i)) | 0;
  }
  return `${events.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * Une conversation enregistrée parle-t-elle bien de CETTE session ? Vrai seulement s'il y a une
 * preuve : l'empreinte enregistrée, ou une prise gardée dans l'échange, identique à la session.
 * Sans preuve, on ne rattache pas (une nouvelle conversation s'ouvre).
 */
export function conversationMatchesSession(loaded, session) {
  const wanted = sessionFingerprint(session);
  if (!wanted) return false;
  if (loaded?.source?.fingerprint) return loaded.source.fingerprint === wanted;
  for (const message of loaded?.messages || []) {
    const take = message?.take || message?.toolResult?.originalTake;
    if (take?.events?.length && sessionFingerprint(take) === wanted) return true;
  }
  return false;
}

/**
 * Que faire de la conversation ouverte quand le contexte bouge ?
 *
 * `event.type` :
 *   - 'request'  : le pianiste a cliqué pour parler de cette source (« Demander au Copilote »,
 *                  « Copilote » d'une session, « Parler de ce tutoriel ») ;
 *   - 'announce' : un écran dit ce qu'il montre (on revient sur Pédagogie IA) — simple navigation ;
 *   - 'closed'   : la source n'est plus affichée (tutoriel fermé).
 *
 * Réponses :
 *   - 'attach' : c'est déjà la source de la conversation ; elle retrouve son contexte vivant ;
 *   - 'switch' : ouvrir la conversation de cette source (la précédente garde brouillon et messages) ;
 *   - 'offer'  : garder la conversation ouverte et PROPOSER la source, sans l'imposer ;
 *   - 'detach' : garder la conversation ; son contexte vivant n'est plus disponible ;
 *   - 'reset'  : rien n'était en cours, on revient à une conversation libre vide ;
 *   - 'ignore'.
 */
export function decideContextEvent(state = {}, event = {}) {
  const { source = null, hasMessages = false, hasDraft = false, busy = false, pinned = false, touched = false } = state;
  const next = event.source || null;
  const idle = !hasMessages && !hasDraft && !busy;
  if (event.type === 'closed') {
    if (!next || !sameSource(source, next)) return { action: 'ignore' };
    return { action: idle ? 'reset' : 'detach' };
  }
  if (!next) return { action: 'ignore' };
  if (sameSource(source, next)) return { action: 'attach' };
  if (event.type === 'request') return { action: 'switch' };
  if (event.type !== 'announce') return { action: 'ignore' };
  // Rien en cours : suivre l'écran ne fait rien perdre. C'est aussi le cas du dernier échange
  // simplement réaffiché au lancement, tant qu'on n'y a rien fait (ni message, ni brouillon, ni
  // ouverture voulue) : ouvrir un tutoriel dans Pédagogie IA y montre alors sa conversation.
  if (idle || (!touched && !pinned && !hasDraft && !busy)) return { action: 'switch' };
  // La conversation d'un tutoriel suit le tutoriel qu'on ouvre (Narcisse, 03/10 : « la
  // conversation reste avec le tuto ») — sauf si on l'a rouverte exprès depuis l'historique,
  // ou si une réponse y est attendue.
  if (!busy && !pinned && source?.kind === 'tutorial' && next.kind === 'tutorial') return { action: 'switch' };
  return { action: 'offer' };
}

function readState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(STATE_KEY) || 'null');
    const drafts = parsed?.drafts && typeof parsed.drafts === 'object' && !Array.isArray(parsed.drafts) ? parsed.drafts : {};
    return {
      lastId: typeof parsed?.lastId === 'string' ? parsed.lastId : null,
      lastSource: parsed?.lastSource?.key ? sourceFromKey(parsed.lastSource.key, parsed.lastSource) : null,
      drafts,
    };
  } catch (_) {
    return { lastId: null, lastSource: null, drafts: {} };
  }
}

function localId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Gardien des conversations : une seule est à l'écran, mais celles qui attendent une réponse
 * restent vivantes en mémoire pour que la réponse rejoigne SON échange.
 *
 * @param {object} deps
 * @param {{createConversation: Function, loadHistory: Function, saveHistory: Function, listAllConversations: Function}} deps.history
 * @param {{getItem: Function, setItem: Function}|null} [deps.storage] stockage local (dernier échange, brouillons)
 * @param {(messages: object[]) => object|null} [deps.lastTakeOf] dernière prise jointe d'un échange
 */
export function createConversationKeeper({ history, storage = null, lastTakeOf = () => null }) {
  const live = new Map();
  const draftTakes = new Map();
  const persisted = readState(storage);
  let current = null;
  // Chaque ouverture prend un numéro : une lecture lente, doublée par un choix plus récent, est ignorée.
  let token = 0;

  function persist() {
    const ids = Object.keys(persisted.drafts);
    if (ids.length > MAX_DRAFTS) {
      ids.sort((a, b) => (persisted.drafts[a]?.at || 0) - (persisted.drafts[b]?.at || 0));
      for (const id of ids.slice(0, ids.length - MAX_DRAFTS)) delete persisted.drafts[id];
    }
    try {
      storage?.setItem?.(STATE_KEY, JSON.stringify({
        lastId: current?.id || persisted.lastId || null,
        lastSource: current ? storedSource(current.source) : persisted.lastSource,
        drafts: persisted.drafts,
      }));
    } catch (_) { /* stockage plein ou indisponible : la conversation continue */ }
  }

  function show(entry) {
    current = entry;
    live.set(entry.id, entry);
    for (const [id, other] of live) if (other !== current && !other.busy && !other.unsettled) live.delete(id);
    persisted.lastId = entry.id;
    persisted.lastSource = storedSource(entry.source);
    persist();
    return entry;
  }

  function makeEntry(id, { messages = [], source = autonomousSource(), pinned = false, persistedOnDisk = false } = {}) {
    // pinned : rouverte exprès depuis l'historique. touched : on y a fait quelque chose depuis le lancement.
    return { id, messages, source, lastTake: lastTakeOf(messages) || null, busy: false, pinned, touched: pinned, persisted: persistedOnDisk, deleted: false, saving: null };
  }

  async function newId(source) {
    let id = null;
    try { id = await history.createConversation(source.key); } catch (_) { id = null; }
    // Sans dossier d'historique (hors Electron), la conversation vit quand même, en mémoire.
    return id || localId();
  }

  /** Nouvelle conversation, demandée par le pianiste ou faute d'échange à reprendre. */
  async function startNew(source = autonomousSource(), { pinned = false } = {}) {
    const mine = ++token;
    const id = await newId(source);
    if (mine !== token) return current;
    return show(makeEntry(id, { source, pinned }));
  }

  /**
   * Ouvre une conversation de l'historique. En cas d'échec de lecture, l'échange affiché ne
   * change pas.
   * @returns {Promise<{ok: boolean, entry?: object, reason?: 'missing'|'unreadable'|'superseded'}>}
   */
  async function open(id) {
    if (!id) return { ok: false, reason: 'missing' };
    if (current?.id === id) { current.pinned = true; current.touched = true; return { ok: true, entry: current }; }
    const alive = live.get(id);
    if (alive && !alive.deleted) {
      // Une réponse y est attendue : on retrouve l'échange vivant, pas une copie du disque.
      token += 1;
      alive.pinned = true;
      alive.touched = true;
      return { ok: true, entry: show(alive) };
    }
    const mine = ++token;
    let loaded = null;
    try { loaded = await history.loadHistory(id); } catch (_) { loaded = null; }
    if (mine !== token) return { ok: false, reason: 'superseded' };
    if (!loaded || !Array.isArray(loaded.messages)) return { ok: false, reason: 'unreadable' };
    const source = loaded.source?.key ? sourceFromKey(loaded.source.key, loaded.source) : sourceFromKey(loaded.tutorialPath);
    return { ok: true, entry: show(makeEntry(id, { messages: loaded.messages, source, pinned: true, persistedOnDisk: true })) };
  }

  /**
   * Ouvre la conversation d'une source : la dernière qui en parle, sinon une nouvelle.
   * `accept` permet de refuser un rattachement douteux (session dont le numéro a été réattribué).
   * @returns {Promise<{ok: boolean, entry?: object, resumed?: boolean, reason?: string}>}
   */
  async function openForSource(source, { accept = () => true } = {}) {
    if (current && !current.deleted && sameSource(current.source, source)) {
      current.source = { ...current.source, ...source };
      persist();
      return { ok: true, entry: current, resumed: true };
    }
    const mine = ++token;
    let found = null;
    try {
      for (const item of await history.listAllConversations()) {
        if (item.tutorialPath !== source.key || !item.messageCount || item.unreadable) continue;
        const alive = live.get(item.conversationId);
        if (alive?.deleted) continue;
        const loaded = alive ? { messages: alive.messages, source: alive.source } : await history.loadHistory(item.conversationId);
        if (!loaded?.messages?.length || !accept(loaded)) continue;
        found = { id: item.conversationId, loaded, alive };
        break;
      }
    } catch (_) { found = null; }
    if (mine !== token) return { ok: false, reason: 'superseded' };
    if (found) {
      const entry = found.alive || makeEntry(found.id, { messages: found.loaded.messages, persistedOnDisk: true });
      entry.source = { ...sourceFromKey(source.key, found.loaded.source || {}), ...source };
      entry.pinned = false;
      return { ok: true, entry: show(entry), resumed: true };
    }
    const id = await newId(source);
    if (mine !== token) return { ok: false, reason: 'superseded' };
    return { ok: true, entry: show(makeEntry(id, { source })), resumed: false };
  }

  /**
   * Au démarrage : le dernier échange ouvert et son brouillon. Si son fichier est illisible, on
   * ne réutilise PAS son identifiant (l'écrire écraserait un fichier peut-être récupérable).
   */
  async function restoreLast() {
    const id = persisted.lastId;
    if (!id) return startNew();
    const mine = ++token;
    let loaded = null;
    try { loaded = await history.loadHistory(id); } catch (_) { loaded = null; }
    if (mine !== token) return current;
    if (loaded && Array.isArray(loaded.messages) && loaded.messages.length) {
      const source = loaded.source?.key ? sourceFromKey(loaded.source.key, loaded.source) : sourceFromKey(loaded.tutorialPath);
      // Réaffiché, pas rouvert exprès : il ne retient pas l'écran tant qu'on n'y fait rien.
      return show(makeEntry(id, { messages: loaded.messages, source, pinned: false, persistedOnDisk: true }));
    }
    // Jamais écrite (rien n'avait été envoyé) ou illisible : nouvel identifiant, même brouillon.
    const draftText = persisted.drafts[id]?.text || '';
    const source = persisted.lastSource || autonomousSource();
    const fresh = await newId(source);
    if (mine !== token) return current;
    delete persisted.drafts[id];
    if (draftText) persisted.drafts[fresh] = { text: draftText, at: Date.now() };
    return show(makeEntry(fresh, { source }));
  }

  /** Enregistre un échange sous SA source, jamais sous celle de l'écran du moment. */
  function save(entry = current) {
    if (!entry || entry.deleted) return Promise.resolve(false);
    const run = async () => {
      if (entry.deleted) return false;
      const messages = entry.messages.filter((m) => !m.isTyping);
      if (!messages.length) return false;
      let ok = false;
      try { ok = await history.saveHistory(entry.id, entry.source.key, messages, { source: storedSource(entry.source) }); } catch (_) { ok = false; }
      if (ok) entry.persisted = true;
      return ok;
    };
    // Une écriture à la fois par conversation : la question puis la réponse, dans l'ordre.
    entry.saving = (entry.saving || Promise.resolve()).then(run, run);
    return entry.saving;
  }

  function setDraft(text, entry = current) {
    if (!entry) return;
    const value = String(text || '');
    if (value.trim()) { persisted.drafts[entry.id] = { text: value.slice(0, MAX_DRAFT_CHARS), at: Date.now() }; entry.touched = true; }
    else delete persisted.drafts[entry.id];
    persist();
  }

  function setDraftTake(take, entry = current) {
    if (!entry) return;
    if (take) {
      draftTakes.delete(entry.id);
      draftTakes.set(entry.id, take);
      while (draftTakes.size > MAX_DRAFT_TAKES) draftTakes.delete(draftTakes.keys().next().value);
    } else draftTakes.delete(entry.id);
  }

  /** L'écriture en cours de cette conversation (à attendre avant de supprimer son fichier). */
  function pendingWrite(id) {
    const entry = live.get(id) || (current?.id === id ? current : null);
    return (entry?.saving || Promise.resolve()).catch(() => {});
  }

  /** La conversation a été supprimée : son brouillon aussi ; une réponse tardive ne la recrée pas. */
  function forget(id) {
    const entry = live.get(id);
    if (entry) entry.deleted = true;
    live.delete(id);
    draftTakes.delete(id);
    delete persisted.drafts[id];
    if (persisted.lastId === id) persisted.lastId = null;
    if (current?.id === id) current = null;
    persist();
  }

  return {
    current: () => current,
    isLive: (id) => live.has(id),
    startNew,
    open,
    openForSource,
    restoreLast,
    save,
    forget,
    pendingWrite,
    setDraft,
    draft: (entry = current) => (entry ? persisted.drafts[entry.id]?.text || '' : ''),
    setDraftTake,
    draftTake: (entry = current) => (entry ? draftTakes.get(entry.id) || null : null),
    // Un tour : la réponse est attendue (busy), puis reste à enregistrer (unsettled). Tant que
    // l'un des deux est vrai, l'échange reste vivant : le rouvrir rend le même objet, à jour.
    beginTurn(entry) { if (entry) { entry.busy = true; entry.unsettled = true; entry.touched = true; live.set(entry.id, entry); } },
    endTurn(entry) { if (entry) entry.busy = false; },
    settle(entry) {
      if (!entry) return;
      entry.unsettled = false;
      if (entry !== current && !entry.busy) live.delete(entry.id);
    },
    stateFor(entry = current) {
      return {
        source: entry?.source || null,
        hasMessages: Boolean(entry?.messages.some((m) => !m.isTyping)),
        hasDraft: Boolean(entry && (persisted.drafts[entry.id]?.text?.trim() || draftTakes.get(entry.id))),
        busy: Boolean(entry?.busy),
        pinned: Boolean(entry?.pinned),
        touched: Boolean(entry?.touched),
      };
    },
  };
}
