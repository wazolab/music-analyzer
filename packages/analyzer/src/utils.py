"""Utility functions for the analyzer."""

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TrackInfo:
    """Parsed track information from filename."""

    artist: str
    title: str
    filename: str

    @property
    def has_artist(self) -> bool:
        return bool(self.artist)

    @property
    def display_name(self) -> str:
        if self.artist:
            return f"{self.artist} - {self.title}"
        return self.title


def parse_filename(filename: str) -> TrackInfo:
    """
    Extract artist and title from filename.

    Handles formats like:
    - "Artist - Title.flac"
    - "01 - Title.flac" (track number prefix)
    - "01. Artist - Title.flac"
    - "Artist - Title (feat. Someone).flac"

    Args:
        filename: Audio filename (with or without path)

    Returns:
        TrackInfo with parsed artist/title
    """
    # Get just the filename without path
    name = Path(filename).stem

    # Remove common prefixes like "01 - ", "01. ", etc.
    name = re.sub(r"^\d+[\.\-\s]+", "", name).strip()

    # Try to split by " - "
    if " - " in name:
        parts = name.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

        # Check if first part is a track number
        if re.match(r"^\d+$", artist):
            return TrackInfo(artist="", title=title, filename=filename)

        return TrackInfo(artist=artist, title=title, filename=filename)

    # No separator, use filename as title
    return TrackInfo(artist="", title=name, filename=filename)


def find_audio_files(directory: Path, recursive: bool = True) -> list[Path]:
    """
    Find all audio files in a directory.

    Args:
        directory: Directory to search
        recursive: Whether to search subdirectories

    Returns:
        List of audio file paths
    """
    # Include all formats: FLAC (native) + convertible formats
    extensions = [
        "*.flac",  # Native format
        "*.mp3",
        "*.m4a",
        "*.aac",  # Lossy compressed
        "*.wav",
        "*.aiff",  # Lossless uncompressed
        "*.ogg",
        "*.opus",  # Lossy (Vorbis/Opus)
        "*.wma",  # Windows Media
    ]
    pattern = "**/*" if recursive else "*"

    files = []
    for ext in extensions:
        files.extend(directory.glob(f"{pattern}{ext[1:]}"))  # Remove * from ext

    return sorted(files)
