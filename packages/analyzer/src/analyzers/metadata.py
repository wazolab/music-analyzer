"""Metadata lookup via AcoustID fingerprinting and MusicBrainz."""

import os
import re
import subprocess
from dataclasses import dataclass
from typing import Optional, List, Tuple
import json
import urllib.request
import urllib.parse
import time


@dataclass
class MetadataResult:
    """Metadata from MusicBrainz lookup."""
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    label: Optional[str] = None
    year: Optional[int] = None
    musicbrainz_id: Optional[str] = None
    confidence: float = 0.0


def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, remove punctuation, extra spaces."""
    if not text:
        return ""
    # Lowercase
    text = text.lower()
    # Remove common suffixes like (remix), (feat. X), etc.
    text = re.sub(r'\s*\([^)]*\)', '', text)
    text = re.sub(r'\s*\[[^\]]*\]', '', text)
    # Remove punctuation
    text = re.sub(r'[^\w\s]', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def text_similarity(a: str, b: str) -> float:
    """Calculate similarity between two strings (0.0 to 1.0)."""
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)

    if not a_norm or not b_norm:
        return 0.0

    # Word-based Jaccard similarity
    words_a = set(a_norm.split())
    words_b = set(b_norm.split())

    if not words_a or not words_b:
        return 0.0

    intersection = words_a & words_b
    union = words_a | words_b

    return len(intersection) / len(union)


class MetadataLookup:
    """Look up track metadata using AcoustID fingerprinting and MusicBrainz."""

    ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
    MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2"
    USER_AGENT = "MusicAnalyzer/1.0 (https://github.com/music-analyzer)"

    def __init__(self, acoustid_api_key: Optional[str] = None):
        """
        Initialize metadata lookup.

        Args:
            acoustid_api_key: AcoustID API key. If not provided, uses ACOUSTID_API_KEY env var.
        """
        self.api_key = acoustid_api_key or os.environ.get("ACOUSTID_API_KEY")
        if not self.api_key:
            raise ValueError(
                "AcoustID API key required. Set ACOUSTID_API_KEY environment variable "
                "or get a free key at https://acoustid.org/api-key"
            )

    def lookup(
        self,
        file_path: str,
        hint_artist: Optional[str] = None,
        hint_title: Optional[str] = None
    ) -> MetadataResult:
        """
        Look up metadata for an audio file.

        Args:
            file_path: Path to audio file
            hint_artist: Artist name from filename (for better matching)
            hint_title: Title from filename (for better matching)

        Returns:
            MetadataResult with track metadata
        """
        # Generate fingerprint
        fingerprint, duration = self._get_fingerprint(file_path)
        if not fingerprint:
            return MetadataResult()

        # Query AcoustID - get all recordings
        recordings, confidence = self._query_acoustid(fingerprint, duration)
        if not recordings:
            return MetadataResult()

        # Find best matching recording based on filename hints
        recording_id = self._find_best_recording(recordings, hint_artist, hint_title)
        if not recording_id:
            return MetadataResult()

        # Query MusicBrainz for full metadata
        result = self._query_musicbrainz(recording_id)
        result.confidence = confidence
        result.musicbrainz_id = recording_id

        return result

    def _find_best_recording(
        self,
        recordings: List[dict],
        hint_artist: Optional[str],
        hint_title: Optional[str]
    ) -> Optional[str]:
        """Find the recording that best matches the filename hints."""
        if not recordings:
            return None

        # If no hints, return first recording
        if not hint_artist and not hint_title:
            return recordings[0].get("id")

        best_score = -1.0
        best_id = recordings[0].get("id")

        for rec in recordings:
            rec_id = rec.get("id")
            rec_title = rec.get("title", "")

            # Get artist names from the recording
            rec_artists = []
            for artist in rec.get("artists", []):
                rec_artists.append(artist.get("name", ""))
            rec_artist = " ".join(rec_artists)

            # Calculate similarity scores
            title_sim = text_similarity(hint_title or "", rec_title) if hint_title else 0.5
            artist_sim = text_similarity(hint_artist or "", rec_artist) if hint_artist else 0.5

            # Combined score (title is more important)
            score = (title_sim * 0.6) + (artist_sim * 0.4)

            if score > best_score:
                best_score = score
                best_id = rec_id

        return best_id

    def _get_fingerprint(self, file_path: str) -> tuple[Optional[str], Optional[int]]:
        """Generate audio fingerprint using fpcalc (Chromaprint)."""
        try:
            result = subprocess.run(
                ["fpcalc", "-json", file_path],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode != 0:
                print(f"fpcalc error: {result.stderr}")
                return None, None

            data = json.loads(result.stdout)
            return data.get("fingerprint"), int(data.get("duration", 0))

        except FileNotFoundError:
            print("fpcalc not found. Install chromaprint-tools.")
            return None, None
        except subprocess.TimeoutExpired:
            print("fpcalc timed out")
            return None, None
        except Exception as e:
            print(f"Fingerprint error: {e}")
            return None, None

    def _query_acoustid(self, fingerprint: str, duration: int) -> Tuple[List[dict], float]:
        """Query AcoustID API to get all MusicBrainz Recording matches."""
        params = {
            "client": self.api_key,
            "fingerprint": fingerprint,
            "duration": str(duration),
            "meta": "recordings"
        }

        url = f"{self.ACOUSTID_URL}?{urllib.parse.urlencode(params)}"

        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get("status") != "ok":
                print(f"AcoustID error: {data.get('error', {}).get('message', 'Unknown error')}")
                return [], 0.0

            results = data.get("results", [])
            if not results:
                return [], 0.0

            # Get best match
            best = results[0]
            confidence = best.get("score", 0.0)

            recordings = best.get("recordings", [])
            return recordings, confidence

        except Exception as e:
            print(f"AcoustID query error: {e}")
            return [], 0.0

    def _get_release_label(self, release_id: str) -> Optional[str]:
        """Query MusicBrainz for release label info."""
        url = f"{self.MUSICBRAINZ_URL}/release/{release_id}?inc=labels&fmt=json"

        try:
            # MusicBrainz rate limit: 1 request per second
            time.sleep(1)
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            label_info = data.get("label-info", [])
            if label_info and label_info[0].get("label"):
                return label_info[0]["label"].get("name")

            return None

        except Exception as e:
            print(f"Release label query error: {e}")
            return None

    def _query_musicbrainz(self, recording_id: str) -> MetadataResult:
        """Query MusicBrainz API for full metadata."""
        # Include releases to get album and year
        # Note: labels requires a separate release query
        url = (
            f"{self.MUSICBRAINZ_URL}/recording/{recording_id}"
            f"?inc=artist-credits+releases&fmt=json"
        )

        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            # Extract artist
            artist = None
            artist_credits = data.get("artist-credit", [])
            if artist_credits:
                artist_names = []
                for credit in artist_credits:
                    artist_names.append(credit.get("name", ""))
                    if credit.get("joinphrase"):
                        artist_names.append(credit["joinphrase"])
                artist = "".join(artist_names)

            # Extract title
            title = data.get("title")

            # Find best release (prefer earliest with label info)
            album = None
            label = None
            year = None

            releases = data.get("releases", [])
            if releases:
                # Sort by date to get earliest release
                releases_with_date = [
                    r for r in releases
                    if r.get("date")
                ]
                releases_with_date.sort(key=lambda r: r.get("date", "9999"))

                # Prefer release with label
                best_release = None
                for release in releases_with_date:
                    if release.get("label-info"):
                        best_release = release
                        break

                if not best_release and releases_with_date:
                    best_release = releases_with_date[0]

                if not best_release and releases:
                    best_release = releases[0]

                if best_release:
                    album = best_release.get("title")

                    # Extract year from date
                    date_str = best_release.get("date", "")
                    if date_str and len(date_str) >= 4:
                        try:
                            year = int(date_str[:4])
                        except ValueError:
                            pass

                    # Query release for label info
                    release_id = best_release.get("id")
                    if release_id:
                        label = self._get_release_label(release_id)

            return MetadataResult(
                title=title,
                artist=artist,
                album=album,
                label=label,
                year=year
            )

        except Exception as e:
            print(f"MusicBrainz query error: {e}")
            return MetadataResult()


def lookup_metadata(
    file_path: str,
    hint_artist: Optional[str] = None,
    hint_title: Optional[str] = None,
    api_key: Optional[str] = None
) -> MetadataResult:
    """
    Convenience function to look up metadata for a file.

    Args:
        file_path: Path to audio file
        hint_artist: Artist name from filename (for better matching)
        hint_title: Title from filename (for better matching)
        api_key: AcoustID API key (optional, uses env var if not provided)

    Returns:
        MetadataResult with track metadata
    """
    try:
        lookup = MetadataLookup(api_key)
        return lookup.lookup(file_path, hint_artist, hint_title)
    except ValueError as e:
        print(f"Metadata lookup disabled: {e}")
        return MetadataResult()
