import { BandcampFetch } from 'bandcamp-fetch';
import { MetadataLookup } from '../types.js';

const bc = new BandcampFetch();

interface BandcampTrackResult {
  type: string;
  name: string;
  url: string;
  artist: string;
  album?: string;
  releaseDate?: string;
}

interface BandcampTrackInfo {
  name: string;
  url: string;
  artist?: { name: string; url: string };
  label?: { name: string; url: string };
  album?: { name: string; url: string; releaseDate?: string };
  releaseDate?: string;
  duration?: number;
}

export async function searchBandcamp(
  title: string,
  artist: string
): Promise<MetadataLookup | null> {
  try {
    // Search for tracks matching title and artist
    const query = `${artist} ${title}`.trim();
    const results = await bc.search.tracks({ query, page: 0 });

    if (!results.items || results.items.length === 0) {
      return null;
    }

    // Find best match
    const items = results.items as BandcampTrackResult[];
    const match = items.find((item) => {
      const titleMatch = item.name.toLowerCase().includes(title.toLowerCase());
      const artistMatch = item.artist?.toLowerCase().includes(artist.toLowerCase());
      return titleMatch || artistMatch;
    }) || items[0];

    if (!match?.url) {
      return null;
    }

    // Get detailed track info
    const trackInfo = await bc.track.getInfo({ trackUrl: match.url }) as BandcampTrackInfo;

    const metadata: MetadataLookup = {
      title: trackInfo.name,
      artist: trackInfo.artist?.name || match.artist,
    };

    if (trackInfo.album?.name) {
      metadata.album = trackInfo.album.name;
    }

    if (trackInfo.label?.name) {
      metadata.label = trackInfo.label.name;
    }

    // Parse release date for year
    const releaseDate = trackInfo.releaseDate || trackInfo.album?.releaseDate;
    if (releaseDate) {
      const yearMatch = releaseDate.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        metadata.year = parseInt(yearMatch[0], 10);
      }
    }

    return metadata;
  } catch (error) {
    console.warn('Bandcamp search failed:', error);
    return null;
  }
}

export async function getBandcampTrackByUrl(
  url: string
): Promise<MetadataLookup | null> {
  try {
    const trackInfo = await bc.track.getInfo({ trackUrl: url }) as BandcampTrackInfo;

    const metadata: MetadataLookup = {
      title: trackInfo.name,
      artist: trackInfo.artist?.name || 'Unknown',
    };

    if (trackInfo.album?.name) {
      metadata.album = trackInfo.album.name;
    }

    if (trackInfo.label?.name) {
      metadata.label = trackInfo.label.name;
    }

    const releaseDate = trackInfo.releaseDate || trackInfo.album?.releaseDate;
    if (releaseDate) {
      const yearMatch = releaseDate.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        metadata.year = parseInt(yearMatch[0], 10);
      }
    }

    return metadata;
  } catch (error) {
    console.warn('Bandcamp track fetch failed:', error);
    return null;
  }
}
