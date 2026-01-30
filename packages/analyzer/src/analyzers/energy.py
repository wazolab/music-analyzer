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

    # Loudness range for mapping (typical music ranges from -30 to -6 LUFS)
    LOUDNESS_MIN = -30.0  # Quiet tracks
    LOUDNESS_MAX = -6.0  # Very loud/compressed tracks

    def __init__(self):
        self._loudness = Loudness()

    def analyze(self, audio: AudioData) -> EnergyResult:
        """
        Analyze audio and extract energy level.

        Energy is derived from loudness, mapped to a 1-10 scale.
        Louder tracks = higher energy.

        Args:
            audio: Audio data at 44.1kHz

        Returns:
            EnergyResult with energy level (1-10)
        """
        loudness = self._loudness(audio.samples)

        # Map loudness to 1-10 scale
        # Louder (closer to 0 / less negative) = higher energy
        # Normalize to 0-1 range, then scale to 1-10
        normalized = (loudness - self.LOUDNESS_MIN) / (self.LOUDNESS_MAX - self.LOUDNESS_MIN)
        normalized = max(0.0, min(1.0, normalized))  # Clamp to 0-1
        level = int(round(normalized * 9 + 1))  # Scale to 1-10

        return EnergyResult(level=level, loudness=float(loudness))
