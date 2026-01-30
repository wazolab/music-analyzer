"""Musical key detection with Camelot notation."""

from dataclasses import dataclass
from typing import Tuple

from essentia.standard import KeyExtractor as EssentiaKeyExtractor

from .audio import AudioData


# Camelot wheel mapping: (key, scale) -> Camelot notation
CAMELOT_WHEEL = {
    # Minor keys (A column)
    ("A", "minor"): "8A",
    ("E", "minor"): "9A",
    ("B", "minor"): "10A",
    ("F#", "minor"): "11A",
    ("C#", "minor"): "12A",
    ("G#", "minor"): "1A",
    ("D#", "minor"): "2A",
    ("A#", "minor"): "3A",
    ("F", "minor"): "4A",
    ("C", "minor"): "5A",
    ("G", "minor"): "6A",
    ("D", "minor"): "7A",
    # Major keys (B column)
    ("C", "major"): "8B",
    ("G", "major"): "9B",
    ("D", "major"): "10B",
    ("A", "major"): "11B",
    ("E", "major"): "12B",
    ("B", "major"): "1B",
    ("F#", "major"): "2B",
    ("C#", "major"): "3B",
    ("G#", "major"): "4B",
    ("D#", "major"): "5B",
    ("A#", "major"): "6B",
    ("F", "major"): "7B",
}


@dataclass
class KeyResult:
    """Result of key analysis."""
    key: str  # e.g., "A", "F#"
    scale: str  # "major" or "minor"
    camelot: str  # e.g., "8A", "11B"
    confidence: float

    @property
    def notation(self) -> str:
        """Full notation like 'A minor'."""
        return f"{self.key} {self.scale}"


class KeyAnalyzer:
    """Analyze musical key and convert to Camelot notation."""

    def __init__(self):
        self._extractor = EssentiaKeyExtractor()

    def analyze(self, audio: AudioData) -> KeyResult:
        """
        Analyze audio and extract musical key.

        Args:
            audio: Audio data at 44.1kHz

        Returns:
            KeyResult with key, scale, and Camelot notation
        """
        key, scale, confidence = self._extractor(audio.samples)

        camelot = self._to_camelot(key, scale)

        return KeyResult(
            key=key,
            scale=scale,
            camelot=camelot,
            confidence=float(confidence)
        )

    @staticmethod
    def _to_camelot(key: str, scale: str) -> str:
        """Convert key/scale to Camelot notation."""
        return CAMELOT_WHEEL.get((key, scale), f"{key}{scale[0].upper()}")

    @staticmethod
    def get_compatible_keys(camelot: str) -> list[str]:
        """
        Get harmonically compatible Camelot keys.

        Compatible keys are:
        - Same key (e.g., 8A)
        - +/- 1 on the wheel (e.g., 7A, 9A)
        - Same number, different letter (e.g., 8B)
        """
        if len(camelot) < 2:
            return [camelot]

        try:
            num = int(camelot[:-1])
            letter = camelot[-1]
        except ValueError:
            return [camelot]

        compatible = [camelot]

        # Adjacent numbers (wrap around 1-12)
        prev_num = 12 if num == 1 else num - 1
        next_num = 1 if num == 12 else num + 1
        compatible.append(f"{prev_num}{letter}")
        compatible.append(f"{next_num}{letter}")

        # Same number, different letter
        other_letter = "B" if letter == "A" else "A"
        compatible.append(f"{num}{other_letter}")

        return compatible
