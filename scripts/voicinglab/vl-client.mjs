// Client minimal du serveur MCP public de VoicingLab (https://voicinglab.com/api/mcp).
// Appelle un outil et renvoie le JSON du premier contenu texte (ou {error}).
export async function callVoicingLab(name, args, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch('https://voicinglab.com/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      });
      const raw = await res.text();
      const line = raw.split('\n').find((l) => l.startsWith('data: '));
      const msg = JSON.parse(line ? line.slice(6) : raw);
      if (msg.error) return { error: msg.error.message || JSON.stringify(msg.error) };
      const text = msg.result?.content?.[0]?.text ?? '';
      try { return JSON.parse(text); } catch { return { error: text }; }
    } catch (err) {
      if (attempt >= retries) return { error: String(err) };
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}
