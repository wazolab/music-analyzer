"""Audio analysis modules."""

from .audio import AudioLoader
from .rhythm import RhythmAnalyzer
from .key import KeyAnalyzer
from .energy import EnergyAnalyzer
from .genre import GenreClassifier
from .tagger import AudioTagger, TagData
from .metadata import MetadataLookup, MetadataResult, lookup_metadata

__all__ = [
    "AudioLoader",
    "RhythmAnalyzer",
    "KeyAnalyzer",
    "EnergyAnalyzer",
    "GenreClassifier",
    "AudioTagger",
    "TagData",
    "MetadataLookup",
    "MetadataResult",
    "lookup_metadata",
]
