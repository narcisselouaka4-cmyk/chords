const { contextBridge, ipcRenderer } = require('electron');

// Expose les variables d'environnement IA_* définies dans .env
function getIAEnvVars() {
  const env = {};
  try {
    for (const key of Object.keys(process.env || {})) {
      if (key.startsWith('IA_')) env[key] = process.env[key];
    }
  } catch (e) {
    // process.env inaccessible selon le sandboxing
  }
  return env;
}

contextBridge.exposeInMainWorld('electronAPI', {
  env: getIAEnvVars(),
  midi: {
    getInputs: () => ipcRenderer.invoke('midi:get-inputs'),
    refreshInputs: () => ipcRenderer.invoke('midi:refresh-inputs'),
    openInput: (portId) => ipcRenderer.invoke('midi:open-input', portId),
    closeInput: () => ipcRenderer.invoke('midi:close-input'),
    onNoteOn: (callback) => ipcRenderer.on('midi-note-on', (event, data) => callback(data)),
    onNoteOff: (callback) => ipcRenderer.on('midi-note-off', (event, data) => callback(data)),
    onSustain: (callback) => ipcRenderer.on('midi-sustain', (event, data) => callback(data)),
    onModWheel: (callback) => ipcRenderer.on('midi-mod-wheel', (event, data) => callback(data)),
    onPitchWheel: (callback) => ipcRenderer.on('midi-pitch-wheel', (event, data) => callback(data)),
    onMidiLog: (callback) => ipcRenderer.on('midi-log', (event, data) => callback(data)),
    onDevicesChanged: (callback) => ipcRenderer.on('midi-devices-changed', (event, data) => callback(data)),
    onPortLost: (callback) => ipcRenderer.on('midi-port-lost', (event, data) => callback(data)),
    onDeviceConnected: (callback) => ipcRenderer.on('midi-device-connected', (event, data) => callback(data)),
  },
  system: {
    getAudioGroups: () => ipcRenderer.invoke('system:audio-groups'),
  },
  log: (msg) => ipcRenderer.invoke('app:log', msg),
  files: {
    homeDir: () => ipcRenderer.invoke('files:home-dir'),
    ensureDir: (dirPath) => ipcRenderer.invoke('files:ensure-dir', dirPath),
    readDir: (dirPath) => ipcRenderer.invoke('files:read-dir', dirPath),
    writeFile: (filePath, content) => ipcRenderer.invoke('files:write-file', filePath, content),
    writeBinary: (filePath, data) => ipcRenderer.invoke('files:write-binary', filePath, data),
    readFile: (filePath) => ipcRenderer.invoke('files:read-file', filePath),
    readBinary: (filePath) => ipcRenderer.invoke('files:read-binary', filePath),
    exists: (filePath) => ipcRenderer.invoke('files:exists', filePath),
    deleteDir: (dirPath) => ipcRenderer.invoke('files:delete-dir', dirPath),
    deleteFile: (filePath) => ipcRenderer.invoke('files:delete-file', filePath),
    saveDialog: (options) => ipcRenderer.invoke('files:save-dialog', options),
    stat: (filePath) => ipcRenderer.invoke('files:stat', filePath),
    rename: (oldPath, newPath) => ipcRenderer.invoke('files:rename', oldPath, newPath),
  },
  analyzer: {
    processFile: (filePath, options = {}) => ipcRenderer.invoke('analyzer:process-file', filePath, options),
  },
  studio: {
    selectFile: () => ipcRenderer.invoke('studio:select-file'),
    selectAudioFile: () => ipcRenderer.invoke('studio:select-audio-file'),
    selectVideoFile: () => ipcRenderer.invoke('studio:select-video-file'),
    separate: (trackId, inputPath) => ipcRenderer.invoke('studio:separate', trackId, inputPath),
    isSeparated: (trackId) => ipcRenderer.invoke('studio:is-separated', trackId),
    getStems: (trackId) => ipcRenderer.invoke('studio:get-stems', trackId),
    onSeparationProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('studio:separation-progress', handler);
      return () => ipcRenderer.removeListener('studio:separation-progress', handler);
    },
    extractAudio: (trackId, inputPath) => ipcRenderer.invoke('studio:extract-audio', trackId, inputPath),
    trimRegion: (trackId, inputPath, startSec, endSec) => ipcRenderer.invoke('studio:trim-region', trackId, inputPath, startSec, endSec),
    generateWaveform: (wavPath) => ipcRenderer.invoke('studio:generate-waveform', wavPath),
    onWaveformProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('studio:waveform-progress', handler);
      return () => ipcRenderer.removeListener('studio:waveform-progress', handler);
    },
    pitchShift: (trackId, semitones, startSec, endSec, useStems) => ipcRenderer.invoke('studio:pitch-shift', trackId, semitones, startSec, endSec, useStems),
    pitchShiftStems: (trackId, semitones, startSec, endSec, stemPaths) => ipcRenderer.invoke('studio:pitch-shift-stems', trackId, semitones, startSec, endSec, stemPaths),
    cleanupShifted: (trackId) => ipcRenderer.invoke('studio:cleanup-shifted', trackId),
    getWindowSource: () => ipcRenderer.invoke('studio:get-window-source'),
    saveVideo: (arrayBuffer) => ipcRenderer.invoke('studio:save-video', arrayBuffer),
    getScreenSourceId: () => ipcRenderer.invoke('studio:get-screen-source-id'),
    saveRecording: (arrayBuffer) => ipcRenderer.invoke('studio:save-recording', arrayBuffer),
  },
});
