import { formatMediaDuration, isValidMediaDuration } from '../media-format.js';

// Présentation seulement : aucune donnée musicale ni durée n'est inventée.
export function libraryTrackLabel(metadata = {}, fallback = '') {
  const original = String(metadata.name || fallback);
  const candidate = String(metadata.format || original.match(/\.([a-z0-9]+)$/i)?.[1]
    || metadata.sourcePath?.match(/\.([a-z0-9]+)$/i)?.[1] || '').toUpperCase();
  const format = /^(MP3|WAV|M4A|FLAC|OGG|AAC|MP4|WEBM|MOV|MKV|MID|MIDI|AIF|AIFF|OPUS|WMA)$/.test(candidate) ? candidate : '';
  const title = original.replace(/\.(mp3|wav|m4a|flac|ogg|aac|mp4|webm|mov|mkv|midi?|aiff?)$/i, '') || original;
  const duration = isValidMediaDuration(metadata.duration) ? formatMediaDuration(metadata.duration) : '';
  return { original, title, format, duration };
}

export function fillLibraryTrackButton(button, metadata, fallback) {
  const doc = button.ownerDocument;
  const label = libraryTrackLabel(metadata, fallback);
  button.title = label.original;
  button.setAttribute('aria-label', `Ouvrir ${label.title}${label.format ? `, ${label.format}` : ''}`);
  const icon = doc.createElement('span');
  icon.className = 'library-track-icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/></svg>';
  const copy = doc.createElement('span');
  copy.className = 'library-track-copy';
  const name = doc.createElement('span');
  name.className = 'analyzer-library-name';
  name.textContent = label.title;
  const detail = doc.createElement('span');
  detail.className = 'library-track-detail';
  detail.textContent = [label.format, label.duration].filter(Boolean).join(' · ');
  copy.append(name, detail);
  const arrow = doc.createElement('span');
  arrow.className = 'library-track-open';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  button.replaceChildren(icon, copy, arrow);
}
