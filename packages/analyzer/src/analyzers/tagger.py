"""Write analysis results to audio file metadata."""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from mutagen.flac import FLAC
from mutagen.id3 import COMM, TALB, TBPM, TCON, TDRC, TIT2, TKEY, TPE1, TPUB, TXXX
from mutagen.mp3 import MP3

# Version marker to identify files processed by this analyzer
ANALYZER_VERSION = "music-analyzer-1.0"


@dataclass
class TagData:
    """Data to write to audio tags."""

    bpm: Optional[int] = None
    key: Optional[str] = None  # Camelot notation like "8A"
    energy: Optional[int] = None  # 1-10
    genres: Optional[List[str]] = None
    artist: Optional[str] = None
    title: Optional[str] = None
    album: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    fingerprint: Optional[str] = None  # Chromaprint/AcoustID fingerprint
    fingerprint_duration: Optional[int] = None  # Duration used for fingerprint (seconds)
    analyzer_version: Optional[str] = None  # Marker for skip-analyzed


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

    @staticmethod
    def _update_comment_with_energy(existing_comment: Optional[str], energy: int) -> str:
        """Update comment field with energy value for Traktor visibility."""
        import re

        energy_str = f"Energy: {energy}"
        if not existing_comment:
            return energy_str
        # Remove any existing energy marker and add new one
        cleaned = re.sub(r"\s*Energy:\s*\d+\s*", "", existing_comment).strip()
        if cleaned:
            return f"{cleaned} | {energy_str}"
        return energy_str

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

        # Metadata tags
        if data.artist is not None:
            audio["ARTIST"] = data.artist

        if data.title is not None:
            audio["TITLE"] = data.title

        if data.album is not None:
            audio["ALBUM"] = data.album

        if data.label is not None:
            audio["LABEL"] = data.label
            audio["PUBLISHER"] = data.label  # Alternative tag for compatibility

        if data.year is not None:
            audio["DATE"] = str(data.year)
            audio["YEAR"] = str(data.year)

        # Analysis tags
        if data.bpm is not None:
            audio["BPM"] = str(data.bpm)

        if data.key is not None:
            # Write both KEY and INITIALKEY for compatibility
            audio["KEY"] = data.key
            audio["INITIALKEY"] = data.key

        if data.energy is not None:
            audio["ENERGY"] = str(data.energy)
            # Also add to COMMENT for Traktor visibility
            existing_comment = audio.get("COMMENT", [None])[0]
            audio["COMMENT"] = self._update_comment_with_energy(existing_comment, data.energy)

        if data.genres:
            audio["GENRE"] = self._format_genres(data.genres)

        if data.fingerprint is not None:
            audio["ACOUSTID_FINGERPRINT"] = data.fingerprint
            if data.fingerprint_duration is not None:
                audio["ACOUSTID_FINGERPRINT_DURATION"] = str(data.fingerprint_duration)

        # Always write analyzer version marker
        audio["ANALYZER"] = ANALYZER_VERSION

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

        # Metadata tags
        if data.artist is not None:
            tags.add(TPE1(encoding=3, text=[data.artist]))

        if data.title is not None:
            tags.add(TIT2(encoding=3, text=[data.title]))

        if data.album is not None:
            tags.add(TALB(encoding=3, text=[data.album]))

        if data.label is not None:
            tags.add(TPUB(encoding=3, text=[data.label]))

        if data.year is not None:
            tags.add(TDRC(encoding=3, text=[str(data.year)]))

        # Analysis tags
        if data.bpm is not None:
            tags.add(TBPM(encoding=3, text=[str(data.bpm)]))

        if data.key is not None:
            tags.add(TKEY(encoding=3, text=[data.key]))

        if data.energy is not None:
            # Store as custom TXXX frame
            tags.add(TXXX(encoding=3, desc="ENERGY", text=[str(data.energy)]))
            # Also add to COMM for Traktor visibility
            existing_comment = None
            for key in tags:
                if key.startswith("COMM"):
                    existing_comment = str(tags[key])
                    break
            new_comment = self._update_comment_with_energy(existing_comment, data.energy)
            tags.delall("COMM")
            tags.add(COMM(encoding=3, lang="eng", desc="", text=new_comment))

        if data.genres:
            tags.add(TCON(encoding=3, text=[self._format_genres(data.genres)]))

        # Always write analyzer version marker
        tags.add(TXXX(encoding=3, desc="ANALYZER", text=[ANALYZER_VERSION]))

        audio.save()
        return True

    def is_analyzed(self, file_path: str) -> bool:
        """Check if file has been processed by this analyzer."""
        path = Path(file_path)
        ext = path.suffix.lower()

        try:
            if ext == ".flac":
                audio = FLAC(file_path)
                marker = audio.get("ANALYZER", [None])[0]
                return marker is not None and marker.startswith("music-analyzer")
            elif ext == ".mp3":
                audio = MP3(file_path)
                tags = audio.tags or {}
                for key in tags:
                    if key.startswith("TXXX:ANALYZER"):
                        return True
                return False
        except Exception:
            return False
        return False

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
                album=audio.get("ALBUM", [None])[0],
                label=audio.get("LABEL", [None])[0] or audio.get("PUBLISHER", [None])[0],
                year=int(audio.get("DATE", [None])[0][:4]) if audio.get("DATE") else None,
                fingerprint=audio.get("ACOUSTID_FINGERPRINT", [None])[0],
                fingerprint_duration=(
                    int(audio.get("ACOUSTID_FINGERPRINT_DURATION", [None])[0])
                    if audio.get("ACOUSTID_FINGERPRINT_DURATION")
                    else None
                ),
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
