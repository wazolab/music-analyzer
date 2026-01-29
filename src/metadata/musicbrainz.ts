import { MetadataLookup } from '../types.js';
import { generateFingerprint } from '../analyzers/fingerprint.js';
import { sleep } from '../utils.js';

const ACOUSTID_API_URL = 'https://api.acoustid.org/v2/lookup';
const MUSICBRAINZ_API_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicAnalyzer/1.0.0 (https://github.com/music-analyzer)';

// AcoustID API key - users should register their own at https://acoustid.org/
const ACOUSTID_API_KEY = process.env.ACOUSTID_API_KEY || 'xxxxxxxx';

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to respect rate limits

async function rateLimitedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();

  const headers = {
    'User-Agent': USER_AGENT,
    ...options?.headers,
  };

  return fetch(url, { ...options, headers });
}

interface AcoustIDResult {
  id: string;
  score: number;
  recordings?: Array<{
    id: string;
    title: string;
    artists?: Array<{ id: string; name: string }>;
    releasegroups?: Array<{
      id: string;
      title: string;
      type: string;
      secondarytypes?: string[];
    }>;
  }>;
}

interface AcoustIDResponse {
  status: string;
  results?: AcoustIDResult[];
}

export async function lookupByFingerprint(
  audioPath: string
): Promise<MetadataLookup | null> {
  try {
    const { fingerprint, duration } = await generateFingerprint(audioPath);

    const params = new URLSearchParams({
      client: ACOUSTID_API_KEY,
      duration: String(Math.round(duration)),
      fingerprint,
      meta: 'recordings releasegroups',
    });

    const response = await rateLimitedFetch(
      `${ACOUSTID_API_URL}?${params.toString()}`
    );

    if (!response.ok) {
      console.error(`AcoustID API error: ${response.statusText}`);
      return null;
    }

    const data: AcoustIDResponse = await response.json();

    if (data.status !== 'ok' || !data.results || data.results.length === 0) {
      return null;
    }

    // Get the best match
    const bestMatch = data.results[0];
    if (!bestMatch.recordings || bestMatch.recordings.length === 0) {
      return null;
    }

    const recording = bestMatch.recordings[0];
    const mbRecordingId = recording.id;

    // Fetch additional details from MusicBrainz
    return await lookupRecording(mbRecordingId);
  } catch (error) {
    console.error('Fingerprint lookup failed:', error);
    return null;
  }
}

interface MBRecording {
  id: string;
  title: string;
  'artist-credit'?: Array<{
    name: string;
    artist: { id: string; name: string };
  }>;
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    'release-group'?: {
      id: string;
      title: string;
      'primary-type'?: string;
    };
    'label-info'?: Array<{
      label?: { id: string; name: string };
    }>;
  }>;
}

export async function lookupRecording(
  recordingId: string
): Promise<MetadataLookup | null> {
  try {
    const params = new URLSearchParams({
      fmt: 'json',
      inc: 'artists releases labels',
    });

    const response = await rateLimitedFetch(
      `${MUSICBRAINZ_API_URL}/recording/${recordingId}?${params.toString()}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      console.error(`MusicBrainz API error: ${response.statusText}`);
      return null;
    }

    const data: MBRecording = await response.json();

    const result: MetadataLookup = {
      title: data.title,
      artist:
        data['artist-credit']?.map((ac) => ac.name).join(', ') || 'Unknown',
      mbRecordingId: data.id,
    };

    // Get release info
    if (data.releases && data.releases.length > 0) {
      const release = data.releases[0];
      result.album = release.title;

      if (release.date) {
        const year = parseInt(release.date.substring(0, 4), 10);
        if (!isNaN(year)) {
          result.year = year;
        }
      }

      if (release['label-info'] && release['label-info'].length > 0) {
        const labelInfo = release['label-info'][0];
        if (labelInfo.label) {
          result.label = labelInfo.label.name;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('MusicBrainz lookup failed:', error);
    return null;
  }
}

export async function searchByMetadata(
  title: string,
  artist: string
): Promise<MetadataLookup | null> {
  try {
    const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
    const params = new URLSearchParams({
      fmt: 'json',
      limit: '1',
    });

    const response = await rateLimitedFetch(
      `${MUSICBRAINZ_API_URL}/recording?query=${query}&${params.toString()}`
    );

    if (!response.ok) {
      console.error(`MusicBrainz search error: ${response.statusText}`);
      return null;
    }

    interface MBSearchResponse {
      recordings?: MBRecording[];
    }

    const data: MBSearchResponse = await response.json();

    if (!data.recordings || data.recordings.length === 0) {
      return null;
    }

    const recording = data.recordings[0];
    return await lookupRecording(recording.id);
  } catch (error) {
    console.error('MusicBrainz search failed:', error);
    return null;
  }
}
