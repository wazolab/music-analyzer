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

// Circuit breaker state
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const MAX_FAILURES = 3;
const CIRCUIT_RESET_TIME = 30000; // 30 seconds

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries: number = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      consecutiveFailures = 0; // Reset on success
      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort or if it's the last attempt
      if (attempt === maxRetries) break;

      // Exponential backoff: 1s, 2s, 4s...
      const backoffMs = Math.pow(2, attempt) * 1000;
      await sleep(backoffMs);
    }
  }

  consecutiveFailures++;
  if (consecutiveFailures >= MAX_FAILURES) {
    circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIME;
  }

  throw lastError;
}

async function rateLimitedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // Check circuit breaker
  if (Date.now() < circuitOpenUntil) {
    throw new Error('Circuit breaker open - too many failures');
  }

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

  return fetchWithRetry(url, { ...options, headers });
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

/**
 * Escape special characters for MusicBrainz Lucene query syntax.
 * Characters that need escaping: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
 */
function escapeLuceneQuery(str: string): string {
  return str
    // Remove or escape characters that cause issues in Lucene queries
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ')
    // Remove underscores (often used as separators)
    .replace(/_/g, ' ')
    // Remove non-ASCII characters that might cause issues
    .replace(/[^\x20-\x7E]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean search terms for better matching
 */
function cleanSearchTerm(str: string): string {
  return str
    // Remove common suffixes that hurt matching
    .replace(/\s*\(.*?\)\s*$/g, '') // Remove trailing (Remix), (Original Mix), etc.
    .replace(/\s*\[.*?\]\s*$/g, '') // Remove trailing [Label], etc.
    .replace(/\s*-\s*(Original|Remix|Edit|Mix|Version|Extended|Radio).*$/i, '')
    .trim();
}

export async function searchByMetadata(
  title: string,
  artist: string
): Promise<MetadataLookup | null> {
  try {
    // Clean and escape search terms
    const cleanTitle = cleanSearchTerm(title);
    const cleanArtist = cleanSearchTerm(artist);
    const safeTitle = escapeLuceneQuery(cleanTitle);
    const safeArtist = escapeLuceneQuery(cleanArtist);

    // Skip search if we don't have meaningful search terms
    if (!safeTitle || safeTitle.length < 2) {
      return null;
    }
    if (!safeArtist || safeArtist.length < 2 || safeArtist === 'Unknown Artist') {
      return null;
    }

    const query = encodeURIComponent(
      `recording:"${safeTitle}" AND artist:"${safeArtist}"`
    );
    const params = new URLSearchParams({
      fmt: 'json',
      limit: '1',
    });

    const response = await rateLimitedFetch(
      `${MUSICBRAINZ_API_URL}/recording?query=${query}&${params.toString()}`
    );

    if (!response.ok) {
      // Silently ignore 400 errors (query syntax issues with edge cases)
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
