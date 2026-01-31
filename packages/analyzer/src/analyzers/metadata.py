"""Metadata lookup via AcoustID fingerprinting and MusicBrainz."""

import json
import os
import re
import subprocess
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass


@dataclass
class MetadataResult:
    """Metadata from MusicBrainz lookup."""

    title: str | None = None
    artist: str | None = None
    album: str | None = None
    label: str | None = None
    year: int | None = None
    musicbrainz_id: str | None = None
    confidence: float = 0.0


def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase, remove punctuation, extra spaces."""
    if not text:
        return ""
    # Lowercase
    text = text.lower()
    # Remove common suffixes like (remix), (feat. X), etc.
    text = re.sub(r"\s*\([^)]*\)", "", text)
    text = re.sub(r"\s*\[[^\]]*\]", "", text)
    # Remove punctuation
    text = re.sub(r"[^\w\s]", " ", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
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


def get_fingerprint(file_path: str) -> tuple[str | None, int | None]:
    """
    Generate audio fingerprint using fpcalc (Chromaprint).

    Args:
        file_path: Path to audio file

    Returns:
        Tuple of (fingerprint string, duration in seconds) or (None, None) on error
    """
    try:
        result = subprocess.run(
            ["fpcalc", "-json", file_path], capture_output=True, text=True, timeout=60
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


class MetadataLookup:
    """Look up track metadata using AcoustID fingerprinting, MusicBrainz, Discogs, and Bandcamp."""

    ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
    MUSICBRAINZ_URL = "https://musicbrainz.org/ws/2"
    DISCOGS_URL = "https://api.discogs.com"
    BANDCAMP_SEARCH_URL = "https://bandcamp.com/search"
    USER_AGENT = "MusicAnalyzer/1.0 (https://github.com/music-analyzer)"

    def __init__(self, acoustid_api_key: str | None = None, discogs_token: str | None = None):
        """
        Initialize metadata lookup.

        Args:
            acoustid_api_key: AcoustID API key. If not provided, uses ACOUSTID_API_KEY env var.
            discogs_token: Discogs personal access token. If not provided, uses DISCOGS_TOKEN env var.
        """
        self.api_key = acoustid_api_key or os.environ.get("ACOUSTID_API_KEY")
        if not self.api_key:
            raise ValueError(
                "AcoustID API key required. Set ACOUSTID_API_KEY environment variable "
                "or get a free key at https://acoustid.org/api-key"
            )
        self.discogs_token = discogs_token or os.environ.get("DISCOGS_TOKEN")

    def lookup(
        self, file_path: str, hint_artist: str | None = None, hint_title: str | None = None
    ) -> MetadataResult:
        """
        Look up metadata for an audio file.

        Lookup chain:
        1. AcoustID + MusicBrainz (audio fingerprint) - most reliable
        2. Discogs search (artist + title) - fallback for niche tracks
        3. Bandcamp search (artist + title) - fallback for very niche electronic releases
        4. Returns empty result if all fail

        Args:
            file_path: Path to audio file
            hint_artist: Artist name from filename (for better matching)
            hint_title: Title from filename (for better matching)

        Returns:
            MetadataResult with track metadata
        """
        # Generate fingerprint (also gives us exact duration)
        print(f"[METADATA] Generating fingerprint for: {file_path}")
        fingerprint, duration = get_fingerprint(file_path)
        print(f"[METADATA] Fingerprint: {'found' if fingerprint else 'NOT FOUND'}, duration: {duration}s")

        # Try AcoustID + MusicBrainz first (most reliable - uses audio fingerprint)
        if fingerprint:
            print(f"[METADATA] Querying AcoustID...")
            recordings, confidence = self._query_acoustid(fingerprint, duration)
            print(f"[METADATA] AcoustID returned {len(recordings)} recordings (confidence: {confidence:.2f})")
            if recordings:
                for i, rec in enumerate(recordings[:3]):
                    print(f"[METADATA]   Recording {i+1}: {rec.get('title', 'Unknown')} by {', '.join(a.get('name', '') for a in rec.get('artists', []))}")
                recording_id = self._find_best_recording(
                    recordings, duration, hint_artist, hint_title
                )
                print(f"[METADATA] Best recording ID: {recording_id}")
                if recording_id:
                    result = self._query_musicbrainz(recording_id)
                    print(f"[METADATA] MusicBrainz result: {result.artist} - {result.title}")
                    if result.title:  # Got valid metadata
                        result.confidence = confidence
                        result.musicbrainz_id = recording_id
                        return result
            else:
                print(f"[METADATA] No recordings found in AcoustID")
        else:
            print(f"[METADATA] No fingerprint - skipping AcoustID lookup")

        # Fallback to Discogs search (text-based, for niche tracks)
        if hint_artist and hint_title and self.discogs_token:
            print("AcoustID/MusicBrainz failed, trying Discogs...")
            result = self._query_discogs(hint_artist, hint_title)
            if result.title:
                return result

        # Fallback to Bandcamp search (for very niche electronic releases)
        if hint_artist and hint_title:
            print("Discogs failed, trying Bandcamp...")
            result = self._query_bandcamp(hint_artist, hint_title)
            if result.title:
                return result

        return MetadataResult()

    def _find_best_recording(
        self,
        recordings: list[dict],
        file_duration: int | None,
        hint_artist: str | None,
        hint_title: str | None,
    ) -> str | None:
        """
        Find the recording that best matches using:
        1. Duration (primary) - from audio analysis, objective
        2. Filename hints (secondary) - as tiebreaker
        """
        if not recordings:
            return None

        best_score = -1.0
        best_id = recordings[0].get("id")

        for rec in recordings:
            rec_id = rec.get("id")
            rec_title = rec.get("title", "")
            rec_duration = rec.get("duration", 0)  # Duration in seconds from AcoustID

            # Get artist names from the recording
            rec_artists = []
            for artist in rec.get("artists", []):
                rec_artists.append(artist.get("name", ""))
            rec_artist = " ".join(rec_artists)

            # Duration score (0.0 to 1.0) - penalize recordings with different duration
            # Allow 5 seconds tolerance, then linear decrease
            if rec_duration > 0 and file_duration is not None and file_duration > 0:
                duration_diff = abs(rec_duration - file_duration)
                if duration_diff <= 5:
                    duration_score = 1.0
                elif duration_diff <= 30:
                    # Linear decrease from 1.0 to 0.5 over 25 seconds
                    duration_score = 1.0 - (duration_diff - 5) * 0.02
                else:
                    # Significantly different duration - likely a remix/edit
                    duration_score = max(0.0, 0.5 - (duration_diff - 30) * 0.01)
            else:
                # No duration info available
                duration_score = 0.5

            # Text similarity scores (as tiebreaker)
            title_sim = text_similarity(hint_title or "", rec_title) if hint_title else 0.5
            artist_sim = text_similarity(hint_artist or "", rec_artist) if hint_artist else 0.5
            text_score = (title_sim * 0.6) + (artist_sim * 0.4)

            # Combined score: duration is primary (70%), text is secondary (30%)
            score = (duration_score * 0.7) + (text_score * 0.3)

            if score > best_score:
                best_score = score
                best_id = rec_id

        return best_id

    def _query_acoustid(self, fingerprint: str, duration: int | None) -> tuple[list[dict], float]:
        """Query AcoustID API to get all MusicBrainz Recording matches with metadata."""
        params: dict[str, str] = {
            "client": self.api_key or "",
            "fingerprint": fingerprint,
            # Request recordings with full metadata for better matching
            "meta": "recordings",
        }
        if duration is not None:
            params["duration"] = str(duration)

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

    def _get_release_label(self, release_id: str) -> str | None:
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
            f"{self.MUSICBRAINZ_URL}/recording/{recording_id}?inc=artist-credits+releases&fmt=json"
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
                releases_with_date = [r for r in releases if r.get("date")]
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

            # Clear album if it matches the title (likely a single release)
            if album and title and text_similarity(album, title) > 0.8:
                album = None

            return MetadataResult(title=title, artist=artist, album=album, label=label, year=year)

        except Exception as e:
            print(f"MusicBrainz query error: {e}")
            return MetadataResult()

    def _query_discogs(self, artist: str, title: str) -> MetadataResult:
        """
        Query Discogs API to search for a track by artist and title.

        This is a fallback for niche tracks not found in MusicBrainz.
        """
        if not self.discogs_token:
            return MetadataResult()

        # Search for the track
        query = f"{artist} {title}"
        params = {"q": query, "type": "release", "per_page": "10"}

        url = f"{self.DISCOGS_URL}/database/search?{urllib.parse.urlencode(params)}"

        try:
            # Discogs rate limit: 60 requests per minute
            time.sleep(1)
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": self.USER_AGENT,
                    "Authorization": f"Discogs token={self.discogs_token}",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            results = data.get("results", [])
            if not results:
                return MetadataResult()

            # Find best match using text similarity
            best_score = 0.0
            best_result = None

            for result in results:
                result_title = result.get("title", "")  # Format: "Artist - Title"

                # Parse "Artist - Title" format
                if " - " in result_title:
                    parts = result_title.split(" - ", 1)
                    result_artist = parts[0]
                    result_track = parts[1] if len(parts) > 1 else ""
                else:
                    result_artist = ""
                    result_track = result_title

                # Calculate similarity
                artist_sim = text_similarity(artist, result_artist)
                title_sim = text_similarity(title, result_track)
                score = (artist_sim * 0.4) + (title_sim * 0.6)

                if score > best_score:
                    best_score = score
                    best_result = result

            if not best_result or best_score < 0.3:
                return MetadataResult()

            # Extract metadata from best match
            release_title = best_result.get("title", "")
            if " - " in release_title:
                parts = release_title.split(" - ", 1)
                found_artist = parts[0]
                found_title = parts[1] if len(parts) > 1 else title
            else:
                found_artist = artist
                found_title = release_title or title

            # Extract year from release
            year = None
            year_str = best_result.get("year")
            if year_str:
                try:
                    year = int(year_str)
                except ValueError:
                    pass

            # Extract label
            label = None
            labels = best_result.get("label", [])
            if labels:
                label = labels[0]

            # Get release details for more info (optional - makes another API call)
            resource_url = best_result.get("resource_url")
            album = None
            if resource_url:
                try:
                    time.sleep(1)  # Rate limit
                    req = urllib.request.Request(
                        resource_url,
                        headers={
                            "User-Agent": self.USER_AGENT,
                            "Authorization": f"Discogs token={self.discogs_token}",
                        },
                    )
                    with urllib.request.urlopen(req, timeout=10) as response:
                        release_data = json.loads(response.read().decode())

                    # Get album title (release title without artist prefix)
                    album = release_data.get("title")

                    # Get more accurate year if available
                    if not year and release_data.get("year"):
                        try:
                            year = int(release_data["year"])
                        except ValueError:
                            pass

                    # Get label from release details
                    release_labels = release_data.get("labels", [])
                    if release_labels:
                        label = release_labels[0].get("name")

                except Exception as e:
                    print(f"Discogs release details error: {e}")

            # Clear album if it matches the title (likely a single release)
            if album and found_title and text_similarity(album, found_title) > 0.8:
                album = None

            return MetadataResult(
                title=found_title,
                artist=found_artist,
                album=album,
                label=label,
                year=year,
                confidence=best_score,
            )

        except Exception as e:
            print(f"Discogs query error: {e}")
            return MetadataResult()

    def _query_bandcamp(self, artist: str, title: str) -> MetadataResult:
        """
        Query Bandcamp by scraping search results.

        This is a fallback for very niche electronic releases not found elsewhere.
        """
        # Clean up artist and title for better search
        # Remove years like (2025), [2025]
        clean_title = re.sub(r"\s*[\(\[]?\d{4}[\)\]]?\s*$", "", title).strip()
        # Split multiple artists and get the first/main one
        # Handle separators: ", ", " & ", " x ", " feat. ", " ft. "
        main_artist = re.split(
            r"\s*[,&x]\s*|\s+feat\.?\s+|\s+ft\.?\s+", artist, flags=re.IGNORECASE
        )[0].strip()
        # Normalize remaining artist separators
        clean_artist = artist.replace(",", " ").replace("&", " ")
        clean_artist = re.sub(r"\s+", " ", clean_artist).strip()

        # Try multiple search queries in order of specificity
        search_queries = [
            f"{main_artist} {clean_title}",  # Main artist + title (best for collabs)
            f"{clean_artist} {clean_title}",  # All artists + title
            clean_title,  # Just title (often works for EP/album names)
        ]

        album_matches = []
        for query in search_queries:
            params = {
                "q": query,
                "item_type": "a",  # Search for albums
            }

            url = f"{self.BANDCAMP_SEARCH_URL}?{urllib.parse.urlencode(params)}"

            try:
                time.sleep(0.5)  # Be respectful
                req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
                with urllib.request.urlopen(req, timeout=10) as response:
                    html = response.read().decode()

                # Find album or track URLs from search results
                album_pattern = r'href="(https://[^"]+\.bandcamp\.com/album/[^"?]+)'
                track_pattern = r'href="(https://[^"]+\.bandcamp\.com/track/[^"?]+)'
                album_matches = list(set(re.findall(album_pattern, html)))
                track_matches = list(set(re.findall(track_pattern, html)))

                if album_matches:
                    break

                # Try track search if no albums found
                params["item_type"] = "t"
                url = f"{self.BANDCAMP_SEARCH_URL}?{urllib.parse.urlencode(params)}"
                req = urllib.request.Request(url, headers={"User-Agent": self.USER_AGENT})
                with urllib.request.urlopen(req, timeout=10) as response:
                    html = response.read().decode()

                album_matches = list(set(re.findall(album_pattern, html)))
                track_matches = list(set(re.findall(track_pattern, html)))

                # Convert track URLs to album URLs by fetching track page
                if track_matches and not album_matches:
                    for track_url in track_matches[:3]:
                        try:
                            time.sleep(0.3)
                            req = urllib.request.Request(
                                track_url, headers={"User-Agent": self.USER_AGENT}
                            )
                            with urllib.request.urlopen(req, timeout=10) as response:
                                track_html = response.read().decode()

                            # Extract base URL from track URL (e.g., https://wajang.bandcamp.com)
                            base_url_match = re.match(r"(https://[^/]+)", track_url)
                            if not base_url_match:
                                continue
                            base_url = base_url_match.group(1)

                            # First try to find album URL in JSON-LD data
                            json_album_match = re.search(
                                r'"album_url"\s*:\s*"(/album/[^"]+)"', track_html
                            )
                            if json_album_match:
                                album_url = base_url + json_album_match.group(1)
                                album_matches.append(album_url)
                                continue

                            # Try relative album link on same page
                            relative_album_match = re.search(r'href="(/album/[^"]+)"', track_html)
                            if relative_album_match:
                                album_url = base_url + relative_album_match.group(1)
                                album_matches.append(album_url)
                                continue

                        except Exception:
                            continue

                if album_matches:
                    break

            except Exception as e:
                print(f"Bandcamp search error for '{query}': {e}")
                continue

        if not album_matches:
            return MetadataResult()

        try:
            # Try first few results to find best match
            best_result = None
            best_score = 0.0

            for album_url in album_matches[:5]:
                time.sleep(0.5)  # Rate limit
                try:
                    req = urllib.request.Request(album_url, headers={"User-Agent": self.USER_AGENT})
                    with urllib.request.urlopen(req, timeout=10) as response:
                        album_html = response.read().decode()

                    # Extract metadata from album page
                    # Artist name
                    artist_match = re.search(
                        r"<span[^>]*>by\s*</span>\s*<a[^>]*>([^<]+)</a>", album_html
                    )
                    found_artist = artist_match.group(1).strip() if artist_match else None

                    # Album title
                    album_match = re.search(
                        r'<h2[^>]*class="trackTitle"[^>]*>([^<]+)</h2>', album_html
                    )
                    if not album_match:
                        album_match = re.search(r'"name"\s*:\s*"([^"]+)"', album_html)
                    found_album = album_match.group(1).strip() if album_match else None

                    # Track titles - check if our track is on this album
                    track_pattern = r'<span[^>]*class="track-title"[^>]*>([^<]+)</span>'
                    tracks = re.findall(track_pattern, album_html)

                    # Also try JSON-LD format
                    if not tracks:
                        track_json_pattern = r'"track"[^}]*"name"\s*:\s*"([^"]+)"'
                        tracks = re.findall(track_json_pattern, album_html)

                    # Check if title matches any track
                    title_score = 0.0
                    found_title = title
                    for track in tracks:
                        sim = text_similarity(title, track.strip())
                        if sim > title_score:
                            title_score = sim
                            found_title = track.strip()

                    # Calculate overall match score
                    artist_score = text_similarity(artist, found_artist or "")
                    score = (artist_score * 0.4) + (title_score * 0.6)

                    # Release date
                    date_match = re.search(
                        r"release[sd]?\s+(\w+\s+\d{1,2},?\s+)?(\d{4})", album_html, re.IGNORECASE
                    )
                    year = None
                    if date_match:
                        try:
                            year = int(date_match.group(2))
                        except (ValueError, TypeError):
                            pass

                    # Label - Bandcamp shows label in "credits" section
                    label_match = re.search(
                        r'<a[^>]*href="https://([^"]+)\.bandcamp\.com"[^>]*>([^<]+)</a>\s*</p>',
                        album_html,
                    )
                    label = None
                    if label_match:
                        potential_label = label_match.group(2).strip()
                        # Check if it's not the artist name
                        if potential_label.lower() != (found_artist or "").lower():
                            label = potential_label

                    # Also try to find label from page title or meta
                    if not label:
                        label_meta = re.search(r'"recordLabel"\s*:\s*"([^"]+)"', album_html)
                        if label_meta:
                            label = label_meta.group(1)

                    # Extract label from subdomain if it differs from artist
                    subdomain_match = re.search(r"https://([^.]+)\.bandcamp\.com", album_url)
                    if subdomain_match and not label:
                        subdomain = subdomain_match.group(1)
                        # If subdomain differs significantly from artist, it might be a label
                        if text_similarity(subdomain.replace("-", " "), found_artist or "") < 0.5:
                            label = subdomain.replace("-", " ").title()

                    if score > best_score:
                        best_score = score
                        best_result = {
                            "title": found_title,
                            "artist": found_artist,
                            "album": found_album,
                            "label": label,
                            "year": year,
                        }

                except Exception as e:
                    print(f"Bandcamp album fetch error: {e}")
                    continue

            if not best_result or best_score < 0.3:
                return MetadataResult()

            # Clear album if it matches the title (likely a single release)
            album = best_result["album"]
            if album and best_result["title"] and text_similarity(album, best_result["title"]) > 0.8:
                album = None

            return MetadataResult(
                title=best_result["title"],
                artist=best_result["artist"],
                album=album,
                label=best_result["label"],
                year=best_result["year"],
                confidence=best_score,
            )

        except Exception as e:
            print(f"Bandcamp query error: {e}")
            return MetadataResult()


def lookup_metadata(
    file_path: str,
    hint_artist: str | None = None,
    hint_title: str | None = None,
    api_key: str | None = None,
    discogs_token: str | None = None,
) -> MetadataResult:
    """
    Convenience function to look up metadata for a file.

    Lookup chain:
    1. AcoustID + MusicBrainz (audio fingerprint) - most reliable
    2. Discogs search (artist + title) - fallback for niche tracks
    3. Bandcamp search (artist + title) - fallback for very niche electronic releases

    Args:
        file_path: Path to audio file
        hint_artist: Artist name from filename (for better matching)
        hint_title: Title from filename (for better matching)
        api_key: AcoustID API key (optional, uses env var if not provided)
        discogs_token: Discogs personal access token (optional, uses env var if not provided)

    Returns:
        MetadataResult with track metadata
    """
    try:
        lookup = MetadataLookup(api_key, discogs_token)
        return lookup.lookup(file_path, hint_artist, hint_title)
    except ValueError as e:
        print(f"Metadata lookup disabled: {e}")
        return MetadataResult()


def lookup_by_musicbrainz_id(recording_id: str, api_key: str | None = None) -> MetadataResult:
    """
    Look up metadata directly from MusicBrainz using a recording ID.

    Args:
        recording_id: MusicBrainz recording UUID (e.g., '943e90e3-0665-4b96-8163-b528eaef22cc')
        api_key: AcoustID API key (needed for MetadataLookup initialization)

    Returns:
        MetadataResult with track metadata
    """
    try:
        lookup = MetadataLookup(api_key)
        result = lookup._query_musicbrainz(recording_id)
        result.musicbrainz_id = recording_id
        result.confidence = 1.0  # Manual link = full confidence
        return result
    except Exception as e:
        print(f"MusicBrainz lookup error: {e}")
        return MetadataResult()


def submit_fingerprint_to_acoustid(
    fingerprint: str,
    duration: int,
    musicbrainz_id: str,
    api_key: str | None = None,
    user_key: str | None = None,
) -> bool:
    """
    Submit a fingerprint to AcoustID linked to a MusicBrainz recording.

    This helps future lookups find the track automatically.

    Args:
        fingerprint: Audio fingerprint from fpcalc
        duration: Duration in seconds
        musicbrainz_id: MusicBrainz recording UUID
        api_key: AcoustID API key (uses env var if not provided)
        user_key: AcoustID user submission key (uses env var if not provided)

    Returns:
        True if submission succeeded, False otherwise
    """
    api_key = api_key or os.environ.get("ACOUSTID_API_KEY")
    user_key = user_key or os.environ.get("ACOUSTID_USER_KEY")

    if not api_key or not user_key:
        print("AcoustID API key and user key required for submission")
        return False

    SUBMIT_URL = "https://api.acoustid.org/v2/submit"

    params = {
        "client": api_key,
        "user": user_key,
        "fingerprint": fingerprint,
        "duration": str(duration),
        "mbid": musicbrainz_id,
    }

    try:
        data = urllib.parse.urlencode(params).encode("utf-8")
        req = urllib.request.Request(
            SUBMIT_URL,
            data=data,
            headers={"User-Agent": "MusicAnalyzer/1.0 (https://github.com/music-analyzer)"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())

        if result.get("status") == "ok":
            print(f"Successfully submitted fingerprint to AcoustID for recording {musicbrainz_id}")
            return True
        else:
            print(f"AcoustID submission error: {result.get('error', {}).get('message', 'Unknown error')}")
            return False

    except Exception as e:
        print(f"AcoustID submission failed: {e}")
        return False
