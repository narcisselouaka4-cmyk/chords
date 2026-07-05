// Test de chargement d'une session sans interface Electron
import { loadSession, listSessions } from '../recorder/session-manager.js';

async function main() {
  const sessions = await listSessions();
  console.log('Sessions:', sessions.map((s) => s.id));
  if (sessions.length === 0) {
    console.log('Aucune session à tester.');
    return;
  }
  const data = await loadSession(sessions[0].id);
  console.log('Session:', data.session);
  console.log('Events:', data.events.length);
  console.log('Metadata:', data.metadata);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
