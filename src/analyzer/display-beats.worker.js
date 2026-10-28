import { displayRhythmFromWav } from './display-beats.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ rhythm: displayRhythmFromWav(data.buffer, data.tempo) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
