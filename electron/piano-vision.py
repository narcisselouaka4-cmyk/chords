"""
piano-vision.py — Inference V2N sur UNE SEULE vidéo, sans dataset HDF5.

Usage:
    python piano-vision.py <chemin_video.mp4> --corners x1,y1 x2,y2 x3,y3 x4,y4

Sortie (une ligne JSON sur stdout, comme transcriber.py) :
    {
      "ok": true,
      "notes": [
        {"midi": 60, "onset": 0.12, "offset": 1.04, "velocity": 0.78},
        ...
      ],
      "fps": 25,
      "duration": 123.4,
      "source": "v2n"
    }

En cas d'erreur :
    {"ok": false, "reason": "MissingDependency|ModelNotFound|NoVideoStream|...", "message": "..."}

Le checkpoint publié v2n_pianovam.safetensors correspond à l'architecture
Transcriber_OnsetOffsetFrameVelocity du repo V2N :
  S2SVisualFeatureExtractor (grad_sampling=0.5) -> Linear proj 512 -> 512 ->
  ConformerLayer x3 -> heads Onset/Offset/Frame/Velocity (BiLSTM + Linear).

Les modules V2N (licence MIT github.com/yonghyunk1m/V2N) sont inlinés pour
rendre le script autonome et compatible avec le runtime Piano Jazz Chords.
"""

import argparse
import json
import sys
import time
from pathlib import Path


def fail(reason, message):
    print(json.dumps({"ok": False, "reason": reason, "message": message}), flush=True)
    sys.exit(0)


# Les dépendances sont optionnelles : si un module manque, on dit honnêtement
# pourquoi au lieu de planter avec une traceback.
try:
    import cv2
    import numpy as np
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from safetensors.torch import load_file as load_safetensors
    from scipy.ndimage import gaussian_filter
    from torchvision.models.resnet import BasicBlock, ResNet
except ImportError as e:
    fail("MissingDependency", f"Dépendance Python manquante : {e}")

# ──────────────────────────────────────────────────────────────────────────
# Configuration fixe du checkpoint v2n_pianovam (configs/oofv_1s).
# ──────────────────────────────────────────────────────────────────────────
DEFAULT_MODEL_PATH = Path(__file__).parent / "v2n-deps" / "v2n_pianovam.safetensors"
FPS = 25
MIN_MIDI = 21
MAX_MIDI = 108
N_KEYS = MAX_MIDI - MIN_MIDI + 1
TARGET_WIDTH = 800
TARGET_HEIGHT = 144
WINDOW_SIZE = 25  # 1 seconde à 25 fps
STRIDE = 12       # 0.5 seconde de recouvrement par défaut
NUM_CLASSES = 88
DIM = 512
DROPOUT = 0.5
CONFORMER_DEPTH = 3
CONFORMER_KERNEL_SIZE = 31




def check_dependencies():
    required = {
        "torch": "torch",
        "cv2": "opencv-python",
        "numpy": "numpy",
        "safetensors": "safetensors",
        "scipy": "scipy",
        "torchvision": "torchvision",
    }
    missing = []
    for mod, pkg in required.items():
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)
    if missing:
        fail("MissingDependency", "Dépendances Python manquantes : " + ", ".join(missing))


def parse_corners(s):
    parts = s.split(",")
    if len(parts) != 2:
        raise ValueError(f"coin invalide : {s}")
    return float(parts[0].strip()), float(parts[1].strip())


def get_perspective_transform(corners, target_width=TARGET_WIDTH, target_height=TARGET_HEIGHT, bottom_margin=0):
    """corners = [LT, RT, RB, LB] chacun (x, y)."""
    if bottom_margin:
        rb = list(corners[2]); lb = list(corners[3])
        rb[1] += bottom_margin; lb[1] += bottom_margin
        corners = [corners[0], corners[1], tuple(rb), tuple(lb)]
    src_pts = np.array(corners, dtype=np.float32)
    dst_pts = np.array([
        [0, 0],
        [target_width - 1, 0],
        [target_width - 1, target_height - 1],
        [0, target_height - 1],
    ], dtype=np.float32)
    return cv2.getPerspectiveTransform(src_pts, dst_pts)


def load_video_grayscale(video_path, target_fps=FPS, target_width=TARGET_WIDTH,
                         target_height=TARGET_HEIGHT, M=None, bottom_margin=0):
    """Charge une vidéo, redresse si M est fourni, retourne (frames, fps_in, duration)."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    try:
        fps_in = float(cap.get(cv2.CAP_PROP_FPS))
        if not np.isfinite(fps_in) or fps_in <= 0:
            raise RuntimeError(f"Invalid input FPS: {fps_in}")
        if fps_in + 1e-6 < float(target_fps):
            raise RuntimeError(
                f"Input FPS ({fps_in}) < target FPS ({target_fps}); only downsampling supported"
            )

        frames = []
        index_in = -1
        index_out = -1
        while True:
            ok = cap.grab()
            if not ok:
                break
            index_in += 1
            out_due = int(index_in / fps_in * target_fps)
            if out_due <= index_out:
                continue
            ok, frame = cap.retrieve()
            if not ok or frame is None:
                raise RuntimeError(f"Failed to retrieve frame {index_in}")
            index_out += 1
            if M is not None:
                frame = cv2.warpPerspective(frame, M, (target_width, target_height))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if gray.shape[1] != target_width or gray.shape[0] != target_height:
                gray = cv2.resize(gray, (target_width, target_height))
            frames.append(gray)
    finally:
        cap.release()

    if not frames:
        raise RuntimeError("No frames extracted")

    frames = np.stack(frames, axis=0)
    duration = frames.shape[0] / target_fps
    return frames, fps_in, duration


# ═══════════════════════════════════════════════════════════════════════════
# Modules V2N inlinés (licence MIT github.com/yonghyunk1m/V2N).
# Architecture requise par le checkpoint v2n_pianovam :
#   feature_extractor = S2SVisualFeatureExtractor(window_size=5, grad_sampling=0.5)
#   transcriber = Transcriber_OnsetOffsetFrameVelocity(dim=512, depth=3)
# ═══════════════════════════════════════════════════════════════════════════

class _BiLSTM(nn.Module):
    def __init__(self, input_features, recurrent_features):
        super().__init__()
        self.rnn = nn.LSTM(input_features, recurrent_features, batch_first=True, bidirectional=True)

    def forward(self, x):
        return self.rnn(x)[0]


class _RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x):
        return x * torch.rsqrt(x.float().pow(2).mean(-1, keepdim=True) + self.eps).type_as(x) * self.weight


class _FeedForward(nn.Module):
    def __init__(self, dim, mult=4, dropout=0.1):
        super().__init__()
        hidden_dim = int(2 * (dim * mult) / 3)
        hidden_dim = 256 * ((hidden_dim + 255) // 256)
        self.w1 = nn.Linear(dim, hidden_dim, bias=False)
        self.w2 = nn.Linear(hidden_dim, dim, bias=False)
        self.w3 = nn.Linear(dim, hidden_dim, bias=False)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        return self.dropout(self.w2(F.silu(self.w1(x)) * self.w3(x)))


class _ConformerConvModule(nn.Module):
    def __init__(self, dim, kernel_size=31, dropout=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(dim, 2 * dim, kernel_size=1),
            nn.GLU(dim=1),
            nn.Conv1d(dim, dim, kernel_size=kernel_size, groups=dim, padding="same"),
        )
        self.norm = nn.LayerNorm(dim)
        self.proj = nn.Conv1d(dim, dim, kernel_size=1)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        x = self.net(x)
        x = self.norm(x.transpose(1, 2)).transpose(1, 2)
        x = F.silu(x)
        x = self.proj(x)
        return self.dropout(x)


class _ConformerLayer(nn.Module):
    def __init__(self, dim, ffn_mult=4, conv_kernel_size=31, dropout=0.1):
        super().__init__()
        self.conv_norm = nn.LayerNorm(dim)
        self.conv = _ConformerConvModule(dim, kernel_size=conv_kernel_size, dropout=dropout)
        self.ffn_norm = nn.LayerNorm(dim)
        self.ffn = _FeedForward(dim, mult=ffn_mult, dropout=dropout)

    def forward(self, x):
        x = x + self.conv(self.conv_norm(x).transpose(1, 2)).transpose(1, 2)
        x = x + self.ffn(self.ffn_norm(x))
        return x


class _S2SAggregationModule(nn.Module):
    def __init__(self, window_size=5):
        super().__init__()
        self.window_size = window_size
        self.conv = nn.Conv3d(64, 64, kernel_size=(window_size, 1, 1), stride=1, padding=0, bias=False)

    def forward(self, x):
        return self.conv(x).squeeze(2)


class _S2SSlopeModule(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv11 = nn.Conv1d(1, 32, kernel_size=3, stride=1, padding=1, bias=False)
        self.conv12 = nn.Conv1d(32, 64, kernel_size=3, stride=1, padding=1, bias=False)
        self.conv2 = nn.Conv2d(320, 256, kernel_size=3, stride=1, padding=1, bias=False)

    def forward(self, x, slope):
        slope_features = self.conv12(self.conv11(slope)).unsqueeze(2)
        slope_features = F.interpolate(slope_features, size=x.shape[-2:], mode="bilinear", align_corners=False)
        return self.conv2(torch.cat([x, slope_features], dim=1))


class _S2SVisualFeatureExtractor(nn.Module):
    def __init__(self, window_size=5, pretrained=False, grad_sampling=1.0, layers=(2, 2, 2, 2)):
        super().__init__()
        if pretrained:
            raise ValueError("S2SVisualFeatureExtractor does not provide pretrained weights.")
        if window_size <= 0 or window_size % 2 == 0:
            raise ValueError("window_size must be a positive odd integer.")

        backbone = ResNet(BasicBlock, list(layers), num_classes=1000)
        backbone.conv1 = nn.Conv2d(1, 64, kernel_size=7, stride=2, padding=3, bias=False)

        self.window_size = window_size
        self.grad_sampling = grad_sampling
        self.pad = window_size // 2

        self.block0 = nn.Sequential(backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool)
        self.aggregation = _S2SAggregationModule(window_size=window_size)
        self.layer1 = backbone.layer1
        self.layer2 = backbone.layer2
        self.layer3 = backbone.layer3
        self.slope = _S2SSlopeModule()
        self.layer4 = backbone.layer4
        self.avgpool = backbone.avgpool
        self.output_dim = backbone.fc.in_features

    @staticmethod
    def _make_slope_vector(batch_size, device):
        slope = torch.arange(1, 89, device=device, dtype=torch.float32) / 88.0
        return slope.view(1, 1, 88).repeat(batch_size, 1, 1)

    def _extract_positions(self, x, positions):
        batch_size, _, height, width = x.shape
        num_positions = int(positions.numel())
        if num_positions == 0:
            return x.new_empty(batch_size, 1, 0, self.output_dim)

        padded = F.pad(x.unsqueeze(1), (0, 0, 0, 0, self.pad, self.pad), mode="replicate").squeeze(1)
        offsets = torch.arange(self.window_size, device=x.device)
        window_indices = positions.unsqueeze(1) + offsets.unsqueeze(0)
        windows = padded[:, window_indices].contiguous()

        windows = windows.view(batch_size * num_positions * self.window_size, 1, height, width)
        stem = self.block0(windows)
        _, channels, stem_height, stem_width = stem.shape

        stem = stem.view(batch_size, num_positions, self.window_size, channels, stem_height, stem_width)
        stem = stem.permute(0, 1, 3, 2, 4, 5).reshape(
            batch_size * num_positions, channels, self.window_size, stem_height, stem_width
        )

        features = self.aggregation(stem)
        features = self.layer1(features)
        features = self.layer2(features)
        features = self.layer3(features)
        features = self.slope(features, self._make_slope_vector(batch_size * num_positions, x.device))
        features = self.layer4(features)
        features = self.avgpool(features)
        features = torch.flatten(features, 1)
        return features.view(batch_size, num_positions, -1).unsqueeze(1)

    def forward(self, x):
        time_steps = x.shape[1]
        all_positions = torch.arange(time_steps, device=x.device)

        if not self.training or self.grad_sampling >= 1.0:
            return self._extract_positions(x, all_positions)

        num_grad = min(time_steps, max(1, int(time_steps * self.grad_sampling)))
        perm = torch.randperm(time_steps, device=x.device)
        grad_idx = perm[:num_grad]
        nograd_idx = perm[num_grad:]

        feat_grad = self._extract_positions(x, grad_idx)
        if nograd_idx.numel() == 0:
            return feat_grad

        with torch.no_grad():
            feat_nograd = self._extract_positions(x, nograd_idx)

        batch_size, channels, _, dim = feat_grad.shape
        output = torch.empty(batch_size, channels, time_steps, dim, device=x.device, dtype=feat_grad.dtype)
        output[:, :, grad_idx] = feat_grad
        output[:, :, nograd_idx] = feat_nograd
        return output


class _TranscriberOnsetOffsetFrameVelocity(nn.Module):
    """
    Copie exacte de Transcriber_OnsetOffsetFrameVelocity pour le checkpoint
    v2n_pianovam (dim=512, conformer_depth=3).
    """

    def __init__(self, feature_extractor=None, num_classes=NUM_CLASSES, dim=DIM,
                 dropout=DROPOUT, conformer_depth=CONFORMER_DEPTH,
                 conformer_kernel_size=CONFORMER_KERNEL_SIZE,
                 cascade_onset_to_frame=False, cascade_offset_to_frame=False):
        super().__init__()
        if feature_extractor is None:
            feature_extractor = _S2SVisualFeatureExtractor(window_size=5, grad_sampling=0.5)
        self.cascade_onset_to_frame = cascade_onset_to_frame
        self.cascade_offset_to_frame = cascade_offset_to_frame

        self.feature_extractor = feature_extractor
        visual_dim = self.feature_extractor.output_dim

        self.proj = nn.Linear(visual_dim, dim)
        self.proj_dropout = nn.Dropout(dropout)

        self.backbone = nn.Sequential(
            nn.LayerNorm(dim),
            *[_ConformerLayer(dim, conv_kernel_size=conformer_kernel_size) for _ in range(conformer_depth)],
        )

        lstm_hidden = dim // 2
        self.onset_head = nn.Sequential(
            _BiLSTM(dim, lstm_hidden),
            nn.Linear(lstm_hidden * 2, num_classes),
        )
        self.offset_head = nn.Sequential(
            _BiLSTM(dim, lstm_hidden),
            nn.Linear(lstm_hidden * 2, num_classes),
        )

        frame_input_dim = dim
        if self.cascade_onset_to_frame:
            frame_input_dim += num_classes
        if self.cascade_offset_to_frame:
            frame_input_dim += num_classes
        self.frame_head = nn.Sequential(
            _BiLSTM(frame_input_dim, lstm_hidden),
            nn.Linear(lstm_hidden * 2, num_classes),
        )
        self.velocity_head = nn.Sequential(
            _BiLSTM(dim, lstm_hidden),
            nn.Linear(lstm_hidden * 2, num_classes),
        )

    def forward(self, pixel_values):
        x = self.feature_extractor(pixel_values)  # (B, 1, T, D)
        x = x.squeeze(1)                            # (B, T, D)
        x = self.proj_dropout(self.proj(x))          # (B, T, dim)
        shared = self.backbone(x)

        onset = self.onset_head(shared)
        offset = self.offset_head(shared)
        velocity = self.velocity_head(shared)

        onset_probs = torch.sigmoid(onset)
        offset_probs = torch.sigmoid(offset)

        frame_inputs = [shared]
        if self.cascade_onset_to_frame:
            frame_inputs.append(onset_probs.detach())
        if self.cascade_offset_to_frame:
            frame_inputs.append(offset_probs.detach())
        frame = self.frame_head(torch.cat(frame_inputs, dim=-1) if len(frame_inputs) > 1 else shared)

        return {
            "onset_logits": onset,
            "onset_probs": onset_probs,
            "offset_logits": offset,
            "offset_probs": offset_probs,
            "frame_logits": frame,
            "frame_probs": torch.sigmoid(frame),
            "velocity": velocity,
        }


# ──────────────────────────────────────────────────────────────────────────
# NoteDecoder inliné (model/decoding.py)
# ──────────────────────────────────────────────────────────────────────────

class _NoteDecoder:
    """Décodage rising-edge onset + forward walk."""

    def __init__(self, onset_threshold=0.5, frame_threshold=0.5,
                 fps=FPS, prefer_onset_predictions=True, prefer_offset_predictions=True):
        self.onset_threshold = onset_threshold
        self.frame_threshold = frame_threshold
        self.fps = fps
        self.prefer_onset_predictions = prefer_onset_predictions
        self.prefer_offset_predictions = prefer_offset_predictions

    def _resolve_inputs(self, outputs):
        onsets = outputs.get("onset_probs", outputs.get("onset"))
        frame = outputs.get("frame_probs", outputs.get("frame"))
        offset = outputs.get("offset_probs", outputs.get("offset"))
        velocity = outputs.get("velocity")
        if onsets is None and frame is None:
            raise ValueError("Decoder requires onset or frame probabilities")
        if frame is None:
            ext = int(np.ceil(0.2 * self.fps))
            frame = self._onset_to_frame(onsets, ext)
        if onsets is None:
            onsets = self._frame_to_onset(frame, self.frame_threshold)
        if velocity is None:
            velocity = (frame > self.frame_threshold).float()
        return onsets, frame, velocity, offset

    @staticmethod
    def _onset_to_frame(onsets, extend_frames):
        T, _ = onsets.shape
        fp = onsets.clone()
        for shift in range(1, extend_frames + 1):
            shifted = torch.zeros_like(onsets)
            if shift < T:
                shifted[shift:] = onsets[:-shift]
            fp = torch.maximum(fp, shifted)
        return fp

    @staticmethod
    def _frame_to_onset(frame, threshold):
        onsets = torch.zeros_like(frame)
        active = frame > threshold
        prev_active = torch.zeros_like(active)
        prev_active[1:] = active[:-1]
        rising = active & ~prev_active
        onsets[rising] = frame[rising]
        return onsets

    def __call__(self, outputs):
        onsets, frame, velocity, offset = self._resolve_inputs(outputs)
        onsets_np = onsets.detach().cpu().numpy()
        frame_np = frame.detach().cpu().numpy()
        vel_np = velocity.detach().cpu().numpy()
        offset_np = offset.detach().cpu().numpy() if offset is not None else None

        onset_bin = (onsets_np > self.onset_threshold).astype(np.uint8)
        frame_bin = (frame_np > self.frame_threshold).astype(np.uint8)
        start_bin = onset_bin if self.prefer_onset_predictions else frame_bin

        offset_bin = None
        if self.prefer_offset_predictions and offset_np is not None:
            offset_bin = (offset_np > self.onset_threshold).astype(np.uint8)

        onset_diff = np.diff(start_bin, axis=0, prepend=0) == 1

        pitches, intervals, velocities = [], [], []
        T = onset_bin.shape[0]
        for frame_idx, pitch in zip(*onset_diff.nonzero()):
            onset = int(frame_idx)
            off = onset
            vel_samples = []

            while off < T:
                if offset_bin is not None and off > onset and offset_bin[off, pitch]:
                    break
                if not (onset_bin[off, pitch] or frame_bin[off, pitch]):
                    break
                if onset_bin[off, pitch]:
                    vel_samples.append(vel_np[off, pitch])
                off += 1

            if off > onset:
                pitches.append(pitch)
                intervals.append([onset, off])
                avg_vel = float(np.mean(vel_samples)) if vel_samples else 0.0
                velocities.append(float(np.clip(avg_vel, 0.0, 1.0)))

        return {
            "pitches": np.array(pitches, dtype=np.int64),
            "intervals": np.array(intervals, dtype=np.int64).reshape(-1, 2),
            "velocities": np.array(velocities, dtype=np.float64),
        }


# ──────────────────────────────────────────────────────────────────────────
# Chargement modèle, fenêtrage, stitching.
# ──────────────────────────────────────────────────────────────────────────

def build_model(checkpoint_path, device="cpu"):
    device = torch.device(device)
    model = _TranscriberOnsetOffsetFrameVelocity().to(device).eval()
    state = load_safetensors(str(checkpoint_path), device="cpu")
    # Les checkpoints d'entraînement portent un préfixe "transcriber." ; le
    # checkpoint publié aussi (transcriber.feature_extractor...). On l'enlève.
    if any(k.startswith("transcriber.") for k in state):
        state = {k.removeprefix("transcriber."): v for k, v in state.items() if k.startswith("transcriber.")}
    model.load_state_dict(state, strict=True)
    return model, device


def make_windows(frames, window_size=WINDOW_SIZE, stride=STRIDE):
    T = frames.shape[0]
    windows = []
    for start in range(0, T, stride):
        end = min(start + window_size, T)
        if end - start < window_size:
            pad = window_size - (end - start)
            chunk = np.concatenate([frames[start:end], np.repeat(frames[end - 1:end], pad, axis=0)], axis=0)
        else:
            chunk = frames[start:end]
        windows.append((start, end, chunk))
    return windows


def stitch_center(windows):
    windows = sorted(windows, key=lambda w: w[0])
    keys = list(windows[0][2].keys())
    n_keys = windows[0][2][keys[0]].shape[-1]
    covered_start = windows[0][0]
    covered_end = windows[-1][1]
    n_frames = covered_end - covered_start
    merged = {k: torch.zeros(n_frames, n_keys) for k in keys}

    for i, (fs, fe, logits) in enumerate(windows):
        if i == 0:
            keep_start = fs
        else:
            keep_start = (fs + windows[i - 1][1]) // 2
        if i == len(windows) - 1:
            keep_end = fe
        else:
            keep_end = (fe + windows[i + 1][0]) // 2
        local_s = keep_start - fs
        local_e = keep_end - fs
        merged_s = keep_start - covered_start
        merged_e = keep_end - covered_start
        for k in keys:
            merged[k][merged_s:merged_e] = logits[k][local_s:local_e]
    return merged, covered_start, covered_end


def run_inference(model, device, frames, window_size=WINDOW_SIZE, stride=STRIDE):
    windows = make_windows(frames, window_size, stride)
    window_logits = []
    for fs, fe, chunk in windows:
        tensor = torch.from_numpy(chunk).unsqueeze(0).float() / 255.0
        with torch.no_grad():
            out = model(tensor.to(device))
            out_cpu = {k: v[0, :fe - fs].cpu() for k, v in out.items()}
        window_logits.append((fs, fe, out_cpu))

    merged, covered_start, covered_end = stitch_center(window_logits)
    T = frames.shape[0]
    if covered_end < T:
        for k in merged:
            tail = merged[k][-1:].repeat(T - covered_end, 1)
            merged[k] = torch.cat([merged[k], tail], dim=0)
    elif covered_end > T:
        for k in merged:
            merged[k] = merged[k][:T]
    return merged


def notes_to_json(note_events, fps=FPS, min_midi=MIN_MIDI, duration=None):
    pitches = note_events["pitches"]
    intervals = note_events["intervals"]
    velocities = note_events["velocities"]
    notes = []
    for pitch, (onset, offset), vel in zip(pitches, intervals, velocities):
        notes.append({
            "midi": int(pitch + min_midi),
            "onset": round(onset / fps, 3),
            "offset": round(offset / fps, 3),
            "velocity": round(float(vel), 3),
        })
    notes.sort(key=lambda n: (n["onset"], n["midi"]))
    return {
        "ok": True,
        "source": "v2n",
        "fps": fps,
        "duration": round(duration, 3) if duration else None,
        "noteCount": len(notes),
        "notes": notes,
    }


def main():
    parser = argparse.ArgumentParser(description="V2N inference on a single video")
    parser.add_argument("video", help="Path to the video file")
    parser.add_argument("--model", type=str, default=str(DEFAULT_MODEL_PATH), help="Path to v2n_pianovam.safetensors")
    parser.add_argument("--corners", type=str, required=True, nargs=4, help="4 corners: LT RT RB LB as x,y")
    parser.add_argument("--onset-threshold", type=float, default=0.5)
    parser.add_argument("--frame-threshold", type=float, default=0.5)
    parser.add_argument("--device", type=str, default=None, help="cpu|cuda|mps ; auto-détecté par défaut")
    parser.add_argument("--bottom-margin", type=int, default=0, help="Pixels en plus sous le clavier")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    check_dependencies()

    model_path = Path(args.model)
    if not model_path.exists():
        fail("ModelNotFound", f"Poids V2N introuvables : {model_path}")

    try:
        corners = [parse_corners(c) for c in args.corners]
    except ValueError as e:
        fail("InvalidCorners", str(e))

    try:
        M = get_perspective_transform(corners, bottom_margin=args.bottom_margin)
    except Exception as e:
        fail("InvalidCorners", f"Transformation perspective impossible : {e}")

    try:
        frames, fps_in, duration = load_video_grayscale(args.video, M=M, bottom_margin=args.bottom_margin)
    except Exception as e:
        fail("NoVideoStream", f"Lecture vidéo impossible : {e}")

    if frames.shape[0] < WINDOW_SIZE:
        fail("VideoTooShort", f"La vidéo n'a que {frames.shape[0]} frames (minimum {WINDOW_SIZE})")

    try:
        device = args.device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        t0 = time.time()
        model, device = build_model(model_path, device=device)
        if args.verbose:
            print(json.dumps({"info": f"Modèle chargé en {round(time.time() - t0, 2)}s sur {device}"}), file=sys.stderr)
    except Exception as e:
        import traceback
        fail("ModelLoadError", f"Chargement du modèle impossible : {e}\n{traceback.format_exc()}")

    try:
        t0 = time.time()
        merged = run_inference(model, device, frames)
        if args.verbose:
            print(json.dumps({"info": f"Inférence terminée en {round(time.time() - t0, 2)}s"}), file=sys.stderr)
    except Exception as e:
        import traceback
        fail("InferenceError", f"Erreur pendant l'inférence : {e}\n{traceback.format_exc()}")

    try:
        decoder = _NoteDecoder(
            onset_threshold=args.onset_threshold,
            frame_threshold=args.frame_threshold,
            prefer_onset_predictions=True,
            prefer_offset_predictions=True,
        )
        note_events = decoder(merged)
        result = notes_to_json(note_events, duration=duration)
        print(json.dumps(result), flush=True)
    except Exception as e:
        import traceback
        fail("DecodeError", f"Erreur pendant le décodage : {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
