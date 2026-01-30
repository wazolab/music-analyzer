"""Write analysis results to audio file metadata."""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TBPM, TKEY, TCON, TXXX


@dataclass
class TagData:
    """Data to write to audio tags."""
    bpm: Optional[int] = None
    key: Optional[str] = None  # Camelot notation like "8A"
    energy: Optional[int] = None  # 1-10
    genres: Optional[List[str]] = None
    artist: Optional[str] = None
    title: Optional[str] = None


class AudioTagger:
    """Write metadata tags to audio files."""

    @staticmethod
    def _format_genres(genres: List[str], max_count: int = 3) -> str:
        """Format genres for tagging: extract subgenres and join with ' / '."""
        result = []
        for genre in genres[:max_count]:
            # Extract subgenre (part after "---")
            if "---" in genre:
                result.append(genre.split("---")[1])
            else:
                result.append(genre)
        return " / ".join(result)

    def write(self, file_path: str, data: TagData) -> bool:
        """
        Write analysis data to audio file tags.

        Args:
            file_path: Path to audio file
            data: Tag data to write

        Returns:
            True if successful, False otherwise
        """
        path = Path(file_path)
        ext = path.suffix.lower()

        try:
            if ext == ".flac":
                return self._write_flac(file_path, data)
            elif ext == ".mp3":
                return self._write_mp3(file_path, data)
            else:
                print(f"Unsupported format for tagging: {ext}")
                return False
        except Exception as e:
            print(f"Failed to write tags: {e}")
            return False

    def _write_flac(self, file_path: str, data: TagData) -> bool:
        """Write tags to FLAC file using Vorbis comments."""
        audio = FLAC(file_path)

        if data.bpm is not None:
            audio["BPM"] = str(data.bpm)

        if data.key is not None:
            # Write both KEY and INITIALKEY for compatibility
            audio["KEY"] = data.key
            audio["INITIALKEY"] = data.key

        if data.energy is not None:
            # Store as custom tag (Traktor can read TXXX tags)
            audio["ENERGY"] = str(data.energy)

        if data.genres:
            audio["GENRE"] = self._format_genres(data.genres)

        audio.save()
        return True

    def _write_mp3(self, file_path: str, data: TagData) -> bool:
        """Write tags to MP3 file using ID3."""
        try:
            audio = MP3(file_path)
            if audio.tags is None:
                audio.add_tags()
        except Exception:
            audio = MP3(file_path)
            audio.add_tags()

        tags = audio.tags

        if data.bpm is not None:
            tags.add(TBPM(encoding=3, text=[str(data.bpm)]))

        if data.key is not None:
            tags.add(TKEY(encoding=3, text=[data.key]))

        if data.energy is not None:
            # Store as custom TXXX frame
            tags.add(TXXX(encoding=3, desc="ENERGY", text=[str(data.energy)]))

        if data.genres:
            tags.add(TCON(encoding=3, text=[self._format_genres(data.genres)]))

        audio.save()
        return True

    def read_existing(self, file_path: str) -> TagData:
        """Read existing tags from audio file."""
        path = Path(file_path)
        ext = path.suffix.lower()

        if ext == ".flac":
            return self._read_flac(file_path)
        elif ext == ".mp3":
            return self._read_mp3(file_path)
        else:
            return TagData()

    def _read_flac(self, file_path: str) -> TagData:
        """Read tags from FLAC file."""
        try:
            audio = FLAC(file_path)
            return TagData(
                bpm=int(audio.get("BPM", [None])[0]) if audio.get("BPM") else None,
                key=audio.get("KEY", [None])[0] or audio.get("INITIALKEY", [None])[0],
                energy=int(audio.get("ENERGY", [None])[0]) if audio.get("ENERGY") else None,
                genres=audio.get("GENRE", []),
                artist=audio.get("ARTIST", [None])[0],
                title=audio.get("TITLE", [None])[0],
            )
        except Exception:
            return TagData()

    def _read_mp3(self, file_path: str) -> TagData:
        """Read tags from MP3 file."""
        try:
            audio = MP3(file_path)
            tags = audio.tags or {}

            bpm = None
            if "TBPM" in tags:
                try:
                    bpm = int(float(str(tags["TBPM"])))
                except (ValueError, TypeError):
                    pass

            key = str(tags.get("TKEY", "")) or None

            genres = []
            if "TCON" in tags:
                genres = [str(tags["TCON"])]

            return TagData(
                bpm=bpm,
                key=key if key else None,
                genres=genres if genres else None,
            )
        except Exception:
            return TagData()
