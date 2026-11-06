"""Rendu d'écoute commun : piano identique et gain constant mesuré par fichier.

Usage : python3 scripts/copilot-render.py DOSSIER
Aucune inférence ni donnée réseau. Dépendances locales : FluidSynth, ffmpeg,
numpy et soundfile. Les événements JSON d'origine ne sont jamais réécrits.
"""
import argparse
import ctypes as c
import ctypes.util
import gc
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
import soundfile as sf


def measure(file):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(file),
                             '-af', 'loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json',
                             '-f', 'null', '-'], capture_output=True, text=True, check=True)
    return json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr, re.S)[-1])


def render_pack(directory, soundfont):
    manifest = json.loads((directory / 'comparison-private.json').read_text())
    target_dir = directory / 'audio'
    target_dir.mkdir(exist_ok=False)
    lib = c.CDLL(ctypes.util.find_library('fluidsynth'))
    ptr, integer, string = c.c_void_p, c.c_int, c.c_char_p

    def function(name, result, args):
        value = getattr(lib, name)
        value.restype, value.argtypes = result, args
        return value

    new_settings = function('new_fluid_settings', ptr, [])
    delete_settings = function('delete_fluid_settings', None, [ptr])
    set_num = function('fluid_settings_setnum', integer, [ptr, string, c.c_double])
    set_int = function('fluid_settings_setint', integer, [ptr, string, integer])
    new_synth = function('new_fluid_synth', ptr, [ptr])
    delete_synth = function('delete_fluid_synth', None, [ptr])
    load = function('fluid_synth_sfload', integer, [ptr, string, integer])
    program = function('fluid_synth_program_select', integer, [ptr, integer, integer, integer, integer])
    on = function('fluid_synth_noteon', integer, [ptr, integer, integer, integer])
    off = function('fluid_synth_noteoff', integer, [ptr, integer, integer])
    control = function('fluid_synth_cc', integer, [ptr, integer, integer, integer])
    bend = function('fluid_synth_pitch_bend', integer, [ptr, integer, integer])
    samples = function('fluid_synth_write_float', integer, [ptr, integer, ptr, integer, integer, ptr, integer, integer])
    settings = new_settings()
    if not settings:
        raise RuntimeError('FluidSynth : réglages indisponibles')
    rate = 44100
    set_num(settings, b'synth.sample-rate', rate)
    set_num(settings, b'synth.gain', .7)
    set_int(settings, b'synth.chorus.active', 0)
    set_int(settings, b'synth.reverb.active', 1)
    set_int(settings, b'synth.cpu-cores', 1)
    report = {'schema': 1, 'packId': manifest['packId'], 'sampleRate': rate,
              'soundfont': soundfont.name, 'soundfontSha256': hashlib.sha256(soundfont.read_bytes()).hexdigest(),
              'pianoProgram': 0, 'chorus': False, 'reverb': True, 'tailSeconds': 3,
              'normalization': 'gain constant par fichier, même sonie intégrée, sans compression', 'files': []}
    try:
        with tempfile.TemporaryDirectory(prefix='pjc-listening-render-') as temp:
            raws = []
            for item in manifest['media']:
                media_id = item['id']
                if not re.fullmatch(r'p\d+-(?:original|A|B)', media_id):
                    raise ValueError('Identifiant de rendu invalide')
                take, parts, cursor = item['take'], [], 0
                synth = new_synth(settings)
                if not synth:
                    raise RuntimeError('FluidSynth : synthétiseur indisponible')
                try:
                    sfid = load(synth, str(soundfont).encode(), 1)
                    if sfid < 0:
                        raise RuntimeError('SoundFont impossible à charger')
                    for channel in range(16):
                        program(synth, channel, sfid, 0, 0)

                    def render(count):
                        if count <= 0:
                            return
                        left = np.zeros(count, dtype=np.float32)
                        right = np.zeros(count, dtype=np.float32)
                        if samples(synth, count, left.ctypes.data, 0, 1, right.ctypes.data, 0, 1) != 0:
                            raise RuntimeError('Erreur de synthèse')
                        parts.append(np.column_stack([left, right]))

                    for event in sorted(take['events'], key=lambda e: e['time']):
                        if not math.isfinite(event['time']) or event['time'] < 0:
                            raise ValueError('Temps MIDI invalide')
                        frame = round(event['time'] * rate)
                        render(frame - cursor)
                        cursor = frame
                        channel = min(15, max(0, int(event.get('channel', 0))))
                        kind = event['type']
                        if kind == 'note_on' and event.get('velocity', 0) > 0:
                            velocity = event['velocity']
                            velocity = round(velocity * 127 if velocity <= 1 else velocity)
                            on(synth, channel, event['note'], max(1, min(127, velocity)))
                        elif kind in ['note_off', 'note_on']:
                            off(synth, channel, event['note'])
                        elif kind == 'control':
                            control(synth, channel, event['controller'], max(0, min(127, round(event['value']))))
                        elif kind == 'pitch_bend':
                            bend(synth, channel, max(0, min(16383, round((event['value'] + 1) * 8192))))
                        # Les changements de programme sont ignorés : même piano pour tous.
                    render(max(0, round(take['duration'] * rate) - cursor))
                    for channel in range(16):
                        control(synth, channel, 64, 0)
                        control(synth, channel, 123, 0)
                    render(3 * rate)
                    audio = np.concatenate(parts)
                    if not np.isfinite(audio).all() or np.max(np.abs(audio)) >= 1:
                        raise ValueError('Rendu invalide ou écrêté')
                    raw = Path(temp) / (media_id + '.wav')
                    sf.write(raw, audio, rate, subtype='PCM_24')
                    analysis = measure(raw)
                    integrated, true_peak = float(analysis['input_i']), float(analysis['input_tp'])
                    if not all(math.isfinite(x) for x in [integrated, true_peak]):
                        raise ValueError('Rendu silencieux ou sonie non mesurable')
                    raws.append((media_id, raw, analysis))
                    del audio, parts
                    gc.collect()
                finally:
                    delete_synth(synth)
            # Une cible commune permet d'égaliser la sonie sans limiter les crêtes
            # ni modifier le phrasé ou les nuances à l'intérieur d'une version.
            target = min([-20] + [float(a['input_i']) - 1.5 - float(a['input_tp']) for _, _, a in raws])
            report['targetLufs'] = target
            for media_id, raw, analysis in raws:
                gain = target - float(analysis['input_i'])
                output = target_dir / (media_id + '.wav')
                subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(raw), '-af', f'volume={gain:.6f}dB',
                                '-c:a', 'pcm_s16le', str(output)], check=True)
                final = measure(output)
                if abs(float(final['input_i']) - target) > .3 or float(final['input_tp']) > -1.3:
                    raise ValueError('Égalisation de niveau hors tolérance : ' + media_id)
                entry = {'id': media_id, 'gainDb': gain, 'before': analysis, 'after': final,
                         'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
                report['files'].append(entry)
                print(media_id, f"{float(final['input_i']):.2f} LUFS", flush=True)
    finally:
        delete_settings(settings)
    (directory / 'render-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Rendus terminés ; aucune qualité musicale déduite des mesures.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--soundfont', type=Path, default=Path('/usr/share/sounds/sf2/FluidR3_GM.sf2'))
    args = parser.parse_args()
    render_pack(args.directory.resolve(), args.soundfont.resolve())
