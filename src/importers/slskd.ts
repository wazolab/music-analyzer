import { TrackInfo } from './playlist.js';

export interface SlskdConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface SearchResult {
  username: string;
  filename: string;
  size: number;
  bitRate?: number;
  sampleRate?: number;
  bitDepth?: number;
  length?: number;
  isLocked: boolean;
  hasFreeUploadSlot: boolean;
  queueLength: number;
}

export interface SearchResponse {
  id: string;
  searchText: string;
  state: string;
  responseCount: number;
  fileCount: number;
}

export class SlskdClient {
  private baseUrl: string;
  private token: string | null = null;
  private apiKey: string | null = null;
  private username: string | null = null;
  private password: string | null = null;

  constructor(config: SlskdConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey || null;
    this.username = config.username || null;
    this.password = config.password || null;
  }

  private async authenticate(): Promise<boolean> {
    if (this.token) return true;
    if (!this.username || !this.password) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/v0/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.username, password: this.password }),
      });

      if (response.ok) {
        const data = await response.json();
        this.token = data.token;
        return true;
      }
    } catch {
      // Auth failed
    }
    return false;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    } else if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Check if slskd is reachable and authenticate
   */
  async ping(): Promise<boolean> {
    try {
      // Try to authenticate if we have credentials
      if (this.username && this.password && !this.token) {
        await this.authenticate();
      }

      const response = await fetch(`${this.baseUrl}/api/v0/application`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Start a search for a track
   */
  async search(query: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/v0/searches`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ searchText: query }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.id;
  }

  /**
   * Get search status
   */
  async getSearchStatus(searchId: string): Promise<SearchResponse> {
    const response = await fetch(`${this.baseUrl}/api/v0/searches/${searchId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get search status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get search results
   */
  async getSearchResults(searchId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/v0/searches/${searchId}/responses`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get search results: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Wait for search to complete (with timeout)
   */
  async waitForSearch(searchId: string, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getSearchStatus(searchId);

      if (status.state === 'Completed' || status.state === 'Cancelled') {
        return;
      }

      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Stop the search after timeout
    await this.stopSearch(searchId);
  }

  /**
   * Stop a search
   */
  async stopSearch(searchId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/v0/searches/${searchId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ state: 'Completed' }),
    });
  }

  /**
   * Delete a search
   */
  async deleteSearch(searchId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/v0/searches/${searchId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
  }

  /**
   * Queue a file for download
   */
  async download(username: string, filename: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v0/transfers/downloads/${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ filename }),
    });

    if (!response.ok) {
      throw new Error(`Download queue failed: ${response.statusText}`);
    }
  }

  /**
   * Search for a track and return FLAC results only
   */
  async searchFlac(track: TrackInfo, timeoutMs: number = 30000): Promise<SearchResult[]> {
    // Build search query
    const query = `${track.artist} ${track.title}`;

    // Start search
    const searchId = await this.search(query);

    try {
      // Wait for results
      await this.waitForSearch(searchId, timeoutMs);

      // Get results
      const responses = await this.getSearchResults(searchId);

      // Filter for FLAC files only
      const flacResults: SearchResult[] = [];

      for (const response of responses) {
        const username = response.username;
        const files = response.files || [];

        for (const file of files) {
          const filename = file.filename || '';

          // Only FLAC files
          if (!filename.toLowerCase().endsWith('.flac')) continue;

          // Check if filename contains artist or title (fuzzy match)
          const lowerFilename = filename.toLowerCase();
          const hasArtist = track.artist.toLowerCase().split(' ').some(
            (word: string) => word.length > 2 && lowerFilename.includes(word)
          );
          const hasTitle = track.title.toLowerCase().split(' ').some(
            (word: string) => word.length > 2 && lowerFilename.includes(word)
          );

          if (hasArtist || hasTitle) {
            flacResults.push({
              username,
              filename,
              size: file.size || 0,
              bitRate: file.bitRate,
              sampleRate: file.sampleRate,
              bitDepth: file.bitDepth,
              length: file.length,
              isLocked: file.isLocked || false,
              hasFreeUploadSlot: response.hasFreeUploadSlot || false,
              queueLength: response.queueLength || 0,
            });
          }
        }
      }

      // Sort by: free slot first, then by queue length, then by size (larger = better quality)
      flacResults.sort((a, b) => {
        if (a.hasFreeUploadSlot !== b.hasFreeUploadSlot) {
          return a.hasFreeUploadSlot ? -1 : 1;
        }
        if (a.queueLength !== b.queueLength) {
          return a.queueLength - b.queueLength;
        }
        return b.size - a.size;
      });

      return flacResults;
    } finally {
      // Clean up search
      await this.deleteSearch(searchId).catch(() => {});
    }
  }
}

/**
 * Search and download tracks from a playlist
 */
export async function downloadPlaylist(
  client: SlskdClient,
  tracks: TrackInfo[],
  options: {
    onProgress?: (current: number, total: number, track: TrackInfo, status: string) => void;
    onResult?: (track: TrackInfo, results: SearchResult[]) => void;
    autoDownload?: boolean;
    searchTimeout?: number;
  } = {}
): Promise<Map<TrackInfo, SearchResult[]>> {
  const results = new Map<TrackInfo, SearchResult[]>();
  const { onProgress, onResult, autoDownload = false, searchTimeout = 30000 } = options;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    onProgress?.(i + 1, tracks.length, track, 'searching');

    try {
      const flacResults = await client.searchFlac(track, searchTimeout);
      results.set(track, flacResults);

      onResult?.(track, flacResults);

      // Auto-download best result if enabled
      if (autoDownload && flacResults.length > 0) {
        const best = flacResults[0];
        onProgress?.(i + 1, tracks.length, track, 'downloading');

        try {
          await client.download(best.username, best.filename);
          onProgress?.(i + 1, tracks.length, track, 'queued');
        } catch (err) {
          onProgress?.(i + 1, tracks.length, track, 'download failed');
        }
      } else if (flacResults.length === 0) {
        onProgress?.(i + 1, tracks.length, track, 'not found');
      } else {
        onProgress?.(i + 1, tracks.length, track, `found ${flacResults.length} results`);
      }
    } catch (err) {
      onProgress?.(i + 1, tracks.length, track, 'search failed');
      results.set(track, []);
    }

    // Small delay between searches to avoid overwhelming the network
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}
