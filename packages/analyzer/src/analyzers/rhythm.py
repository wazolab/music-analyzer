"""Rhythm analysis (BPM detection)."""

from dataclasses import dataclass
from typing import List

import numpy as np
from essentia.standard import RhythmExtractor2013

from .audio import AudioData


@dataclass
class RhythmResult:
    """Result of rhythm analysis."""
    bpm: int
    confidence: float
    beats: List[float]  # Beat positions in seconds


class RhythmAnalyzer:
    """Analyze rhythm and extract BPM."""

    def __init__(self, method: str = "multifeature"):
        """
        Initialize rhythm analyzer.

        Args:
            method: Algorithm method ("multifeature", "degara", "singlebeat")
        """
        self.method = method
        self._extractor = RhythmExtractor2013(method=method)

    def analyze(self, audio: AudioData) -> RhythmResult:
        """
        Analyze audio and extract BPM.

        Args:
            audio: Audio data at 44.1kHz

        Returns:
            RhythmResult with BPM and beat positions
        """
        bpm, beats, confidence, _, _ = self._extractor(audio.samples)

        return RhythmResult(
            bpm=round(bpm),
            confidence=float(confidence),
            beats=beats.tolist() if isinstance(beats, np.ndarray) else list(beats)
        )
