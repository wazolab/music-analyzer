import { MetadataLookup, AudioAnalysis } from '../types.js';
import { sleep } from '../utils.js';

const BEATPORT_API_URL = 'https://api.beatport.com/v4';
const USER_AGENT = 'MusicAnalyzer/1.0.0';

// Beatport OAuth2 credentials (optional - set in .env)
const BEATPORT_CLIENT_ID = process.env.BEATPORT_CLIENT_ID;
const BEATPORT_CLIENT_SECRET = process.env.BEATPORT_CLIENT_SECRET;
const BEATPORT_USERNAME = process.env.BEATPORT_USERNAME;
const BEATPORT_PASSWORD = process.env.BEATPORT_PASSWORD;

let accessToken: string | null = null;
let tokenExpiry: number = 0;

interface BeatportTrack {
  id: number;
  name: string;
  mix_name?: string;
  bpm?: number;
  key?: { name: string; shortName: string };
  genre?: { name: string };
  sub_genre?: { name: string };
  release?: {
    name: string;
    label?: { name: string };
    date?: string;
  };
  artists?: Array<{ name: string }>;
}

interface BeatportSearchResponse {
  results?: BeatportTrack[];
  tracks?: BeatportTrack[];
}

async function getAccessToken(): Promise<string | null> {
  if (!BEATPORT_CLIENT_ID || !BEATPORT_CLIENT_SECRET) {
    return null;
  }

  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', BEATPORT_CLIENT_ID);
    params.append('client_secret', BEATPORT_CLIENT_SECRET);
    if (BEATPORT_USERNAME) params.append('username', BEATPORT_USERNAME);
    if (BEATPORT_PASSWORD) params.append('password', BEATPORT_PASSWORD);

    const response = await fetch('https://api.beatport.com/v4/auth/o/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.warn('Beatport auth failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return accessToken;
  } catch (error) {
    console.warn('Beatport auth error:', error);
    return null;
  }
}

export async function searchBeatport(
  title: string,
  artist: string
): Promise<(MetadataLookup & Partial<AudioAnalysis>) | null> {
  const token = await getAccessToken();

  if (!token) {
    // Fall back to web scraping if no API credentials
    return searchBeatportWeb(title, artist);
  }

  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const response = await fetch(
      `${BEATPORT_API_URL}/catalog/tracks/?q=${query}&per_page=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      console.warn('Beatport search failed:', response.statusText);
      return null;
    }

    const data: BeatportSearchResponse = await response.json();
    const tracks = data.results || data.tracks;

    if (!tracks || tracks.length === 0) {
      return null;
    }

    // Find best match
    const track = tracks.find((t) => {
      const titleMatch = t.name.toLowerCase().includes(title.toLowerCase());
      const artistMatch = t.artists?.some((a) =>
        a.name.toLowerCase().includes(artist.toLowerCase())
      );
      return titleMatch || artistMatch;
    }) || tracks[0];

    return parseBeatportTrack(track);
  } catch (error) {
    console.warn('Beatport API error:', error);
    return null;
  }
}

function parseBeatportTrack(
  track: BeatportTrack
): (MetadataLookup & Partial<AudioAnalysis>) | null {
  const metadata: MetadataLookup & Partial<AudioAnalysis> = {
    title: track.mix_name ? `${track.name} (${track.mix_name})` : track.name,
    artist: track.artists?.map((a) => a.name).join(', ') || 'Unknown',
  };

  if (track.release?.name) {
    metadata.album = track.release.name;
  }

  if (track.release?.label?.name) {
    metadata.label = track.release.label.name;
  }

  if (track.release?.date) {
    const year = parseInt(track.release.date.substring(0, 4), 10);
    if (!isNaN(year)) {
      metadata.year = year;
    }
  }

  // Beatport provides audio analysis data!
  if (track.bpm) {
    metadata.bpm = track.bpm;
  }

  if (track.key?.shortName) {
    metadata.key = track.key.shortName;
  }

  // Use sub_genre if available, otherwise genre
  if (track.sub_genre?.name) {
    metadata.genres = [track.sub_genre.name];
  } else if (track.genre?.name) {
    metadata.genres = [track.genre.name];
  }

  return metadata;
}

// Web scraping fallback for when API credentials aren't available
async function searchBeatportWeb(
  title: string,
  artist: string
): Promise<(MetadataLookup & Partial<AudioAnalysis>) | null> {
  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const url = `https://www.beatport.com/search?q=${query}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Parse JSON-LD data if available
    const jsonLdMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd['@type'] === 'MusicRecording' || jsonLd.tracks) {
          // Extract metadata from JSON-LD
          const track = jsonLd.tracks?.[0] || jsonLd;
          return {
            title: track.name || title,
            artist: track.byArtist?.name || artist,
            album: track.inAlbum?.name,
          };
        }
      } catch {
        // JSON parse failed, continue with HTML parsing
      }
    }

    // Basic HTML parsing for track info
    const titleMatch = html.match(/<h1[^>]*class="[^"]*track-title[^"]*"[^>]*>([^<]+)</);
    const artistMatch = html.match(/<span[^>]*class="[^"]*artist[^"]*"[^>]*>([^<]+)</);
    const bpmMatch = html.match(/(\d{2,3})\s*BPM/i);
    const keyMatch = html.match(/([A-G][#b]?\s*(?:maj|min|Major|Minor))/i);

    if (titleMatch || artistMatch) {
      const metadata: MetadataLookup & Partial<AudioAnalysis> = {
        title: titleMatch?.[1]?.trim() || title,
        artist: artistMatch?.[1]?.trim() || artist,
      };

      if (bpmMatch) {
        metadata.bpm = parseInt(bpmMatch[1], 10);
      }

      if (keyMatch) {
        metadata.key = keyMatch[1];
      }

      return metadata;
    }

    return null;
  } catch (error) {
    console.warn('Beatport web search failed:', error);
    return null;
  }
}

export function isBeatportConfigured(): boolean {
  return !!(BEATPORT_CLIENT_ID && BEATPORT_CLIENT_SECRET);
}
