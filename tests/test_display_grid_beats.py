"""Calage d'affichage : pulsation sonore connue, sans moteur harmonique."""
import importlib.util
from pathlib import Path

import numpy as np
import tempfile
import unittest
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('display_grid_beats', ROOT / 'electron/display_grid_beats.py')
grid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grid)


class DisplayGridBeatsTests(unittest.TestCase):
    def test_octave_alignment_interpolates_real_intervals_not_a_fixed_clock(self):
        times, tempo = grid.octave_aligned_times([.2, 1.2, 2.3, 3.5], 60, 120)
        assert tempo == 120
        np.testing.assert_allclose(times, [.2, .7, 1.2, 1.75, 2.3, 2.9, 3.5])
        slow, tempo = grid.octave_aligned_times(times, 120, 60)
        assert tempo == 60
        np.testing.assert_allclose(slow, [.2, 1.2, 2.3, 3.5])


    def test_changing_tempo_follows_real_attack_times(self):
        envelope = np.zeros(6000)
        truth, time = [], .2
        for i in range(125):
            if time >= 59:
                break
            truth.append(time)
            envelope[round(time * 100)] = 1
            time += .52 - min(i, 110) * .001
        _, times = grid.track_pulses(envelope, 100, 1, tempo=129)
        inner = times[(times > 1) & (times < 57)]
        errors = np.min(abs(inner[:, None] - np.array(truth)[None, :]), axis=1)
        assert np.mean(errors < .025) > .95
        assert np.median(np.diff(times)[-15:]) < np.median(np.diff(times)[:15]) - .06


    def test_real_wav_clicks_match_known_pulse_and_manual_bpm(self):
        sr, duration = 22050, 20
        audio = np.zeros(sr * duration)
        truth = np.arange(.3, duration - .5, .5)
        wave_time = np.arange(round(sr * .04)) / sr
        click = np.sin(2 * np.pi * 150 * wave_time) * np.exp(-wave_time * 120)
        for time in truth:
            start = round(time * sr)
            audio[start:start + len(click)] += click
            offbeat = start + round(.25 * sr)
            audio[offbeat:offbeat + len(click)] += click * .25
        with tempfile.TemporaryDirectory() as folder:
            wav = Path(folder) / 'known-pulse.wav'
            sf.write(wav, audio, sr)
            result = grid.display_rhythm(str(wav), 120, manual=True)
            automatic = grid.display_rhythm(str(wav), 110, manual=False)
        assert abs(automatic['tempo'] - 120) < 4
        assert automatic['sourceTempo'] == 110
        assert automatic['tempo'] != 110
        assert result['version'] == 2
        assert result['source'] == 'librosa-display'
        assert result['tempo'] == 120
        beats = np.array(result['beatTimes'])
        errors = np.min(abs(beats[:, None] - truth[None, :]), axis=1)
        assert np.quantile(errors, .95) < .04
        self.assertAlmostEqual(np.median(np.diff(beats)), .5, delta=.015)


    def test_invalid_tempo_rejected_before_reading_audio(self):
        for tempo in [0, -120, float('inf'), float('nan'), 401]:
            with self.subTest(tempo=tempo), self.assertRaises(ValueError):
                grid.display_rhythm('/absent.wav', tempo)


if __name__ == '__main__':
    unittest.main()
