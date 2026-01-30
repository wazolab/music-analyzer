"""Audio analysis modules."""

from .audio import AudioLoader
from .energy import EnergyAnalyzer
from .genre import GenreClassifier
from .key import KeyAnalyzer
from .metadata import (
    MetadataLookup,
    MetadataResult,
    get_fingerprint,
    lookup_by_musicbrainz_id,
    lookup_metadata,
    submit_fingerprint_to_acoustid,
)
from .rhythm import RhythmAnalyzer
from .tagger import AudioTagger, TagData

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
    "get_fingerprint",
    "lookup_by_musicbrainz_id",
    "lookup_metadata",
    "submit_fingerprint_to_acoustid",
]
