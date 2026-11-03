// Dictée locale : la voix remplit le brouillon, aucun envoi de message implicite.
export function createDictation({ onState, onText, onError, transcribe, mediaDevices = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder }) {
  let generation = 0;
  let recorder = null;
  let stream = null;
  let timer = null;
  let state = 'idle';
  const update = (value) => { state = value; onState?.(value); };
  const release = () => { clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const cancel = () => {
    generation += 1;
    if (recorder?.state === 'recording') recorder.stop();
    recorder = null;
    release();
    update('idle');
  };
  async function toggle() {
    if (state === 'recording') { recorder.stop(); return; }
    if (state !== 'idle') { cancel(); return; }
    if (!mediaDevices?.getUserMedia || !Recorder || !transcribe) {
      onError?.('La dictée n’est pas disponible ici. Tu peux écrire ta demande.');
      return;
    }
    const turn = ++generation;
    update('opening');
    try {
      const opened = await mediaDevices.getUserMedia({ audio: true, video: false });
      if (turn !== generation) { opened.getTracks().forEach((t) => t.stop()); return; }
      stream = opened;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => Recorder.isTypeSupported(m));
      recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { if (turn === generation) { cancel(); onError?.('L’enregistrement du micro a échoué. Réessaie.'); } };
      recorder.onstop = async () => {
        if (turn !== generation) return;
        release();
        update('transcribing');
        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          const result = await transcribe(await blob.arrayBuffer());
          if (turn !== generation) return;
          if (!result?.ok) throw new Error(result?.message || 'Je n’ai pas reconnu de paroles. Réessaie en parlant près du micro.');
          onText?.(result.text);
        } catch (err) {
          if (turn === generation) onError?.(err.message);
        } finally { if (turn === generation) { recorder = null; update('idle'); } }
      };
      recorder.start(1000);
      timer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 120000);
      update('recording');
    } catch (err) {
      if (turn !== generation) return;
      release();
      update('idle');
      onError?.(err.name === 'NotAllowedError' ? 'L’accès au micro a été refusé. Autorise-le pour dicter ta demande.' : 'Le micro est indisponible. Vérifie son branchement et réessaie.');
    }
  }
  return { toggle, cancel, state: () => state };
}
