"""Energy level analysis."""

from dataclasses import dataclass

from essentia.standard import Loudness

from .audio import AudioData


@dataclass
class EnergyResult:
    """Result of energy analysis."""

    level: int  # 1-10 scale
    loudness: float  # Raw loudness value in dB

    @property
    def label(self) -> str:
        """Human-readable energy label."""
        if self.level <= 3:
            return "Low"
        elif self.level <= 6:
            return "Medium"
        else:
            return "High"


class EnergyAnalyzer:
    """Analyze perceived energy level of audio."""

    MIN_LEVEL = 1
    MAX_LEVEL = 10
    LOUDNESS_SCALE = 3  # Divisor to convert loudness to 1-10 scale

    def __init__(self):
        self._loudness = Loudness()

    def analyze(self, audio: AudioData) -> EnergyResult:
        """
        Analyze audio and extract energy level.

        Energy is derived from loudness, mapped to a 1-10 scale.

        Args:
            audio: Audio data at 44.1kHz

        Returns:
            EnergyResult with energy level (1-10)
        """
        loudness = self._loudness(audio.samples)

        # Convert loudness (negative dB) to 1-10 scale
        # Louder (less negative) = higher energy
        raw_level = -loudness / self.LOUDNESS_SCALE
        level = int(min(self.MAX_LEVEL, max(self.MIN_LEVEL, round(raw_level))))

        return EnergyResult(level=level, loudness=float(loudness))
