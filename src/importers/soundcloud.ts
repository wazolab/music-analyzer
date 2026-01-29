import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface TrackInfo {
  artist: string;
  title: string;
  duration?: number;
  url?: string;
}

/**
 * Extract track list from a SoundCloud playlist using yt-dlp
 */
export async function extractPlaylist(playlistUrl: string): Promise<TrackInfo[]> {
  // Check if yt-dlp is available
  try {
    await execFileAsync('yt-dlp', ['--version']);
  } catch {
    throw new Error('yt-dlp is not installed. Install with: pip install yt-dlp');
  }

  // Extract full playlist metadata (not --flat-playlist to get titles)
  const { stdout } = await execFileAsync('yt-dlp', [
    '--dump-json',
    '--no-warnings',
    '--skip-download',
    '--no-playlist-reverse',
    playlistUrl,
  ], { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }); // 50MB buffer, 2min timeout

  const tracks: TrackInfo[] = [];

  // Each line is a JSON object for one track
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue;

    try {
      const data = JSON.parse(line);
      const track = parseTrackInfo(data);
      if (track) {
        tracks.push(track);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return tracks;
}

/**
 * Parse track info from yt-dlp JSON output
 */
function parseTrackInfo(data: any): TrackInfo | null {
  // SoundCloud format: "Artist - Title" in the title field, or separate fields
  let artist = data.artist || data.uploader || data.creator || '';
  let title = data.track || data.title || '';

  // If title contains " - ", it might be "Artist - Title" format
  if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  }

  // Clean up
  artist = artist.trim();
  title = title.trim();

  // Remove common suffixes
  title = title
    .replace(/\s*\[Free Download\]\s*/gi, '')
    .replace(/\s*\(Free Download\)\s*/gi, '')
    .replace(/\s*\[OUT NOW\]\s*/gi, '')
    .replace(/\s*\(OUT NOW\)\s*/gi, '')
    .trim();

  if (!title) return null;

  return {
    artist: artist || 'Unknown Artist',
    title,
    duration: data.duration,
    url: data.url || data.webpage_url,
  };
}

/**
 * Format track list for display or file output
 */
export function formatTrackList(tracks: TrackInfo[]): string {
  return tracks
    .map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`)
    .join('\n');
}

/**
 * Format track list as JSON for slskd import
 */
export function formatTrackListJson(tracks: TrackInfo[]): string {
  return JSON.stringify(tracks, null, 2);
}
