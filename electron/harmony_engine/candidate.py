from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ObservationInput:
    chroma: list[float]
    bass_chroma: list[float]
    chroma_corr: Optional[list[float]] = None
    key_context: Optional[int] = None


@dataclass
class ChordCandidate:
    root: int
    triad: str
    seventh: str
    quality: str
    bass_pc: int
    voicing_type: str

    expected_pcs: list[int] = field(default_factory=list)
    observed_pcs: list[int] = field(default_factory=list)
    missing_pcs: list[int] = field(default_factory=list)
    extra_pcs: list[int] = field(default_factory=list)
    tension_pcs: list[int] = field(default_factory=list)

    acoustic_score: float = 0.0
    bass_score: float = 0.0
    tonal_score: float = 0.0
    style_factor: float = 1.0
    total_score: float = 0.0

    inversion: bool = False
    explanation: dict = field(default_factory=dict)

    @property
    def chord_symbol(self) -> str:
        NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        root_name = NOTE_NAMES[self.root]
        quality_map = {
            ('major', 'none'): '',
            ('major', 'b7'): '7',
            ('major', 'maj7'): 'maj7',
            ('minor', 'none'): 'm',
            ('minor', 'b7'): 'm7',
            ('dim', 'none'): 'dim',
            ('dim', 'b7'): 'm7b5',
            ('sus2', 'none'): 'sus2',
            ('sus4', 'none'): 'sus4',
        }
        q = quality_map.get((self.triad, self.seventh), self.quality)
        return f"{root_name}{q}"
