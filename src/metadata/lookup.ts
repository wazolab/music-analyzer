import { MetadataLookup, AudioAnalysis } from '../types.js';
import { lookupByFingerprint, searchByMetadata } from './musicbrainz.js';
import { searchBandcamp } from './bandcamp.js';
import { searchBeatport, isBeatportConfigured } from './beatport.js';
import { checkFpcalcInstalled } from '../analyzers/fingerprint.js';

export type MetadataSource = 'musicbrainz' | 'bandcamp' | 'beatport';

export interface LookupResult extends MetadataLookup {
  source: MetadataSource;
  // Additional audio data from Beatport
  bpm?: number;
  key?: string;
  genres?: string[];
}

export interface LookupOptions {
  sources?: MetadataSource[];
  audioPath?: string; // For fingerprint lookup
  skipFingerprint?: boolean;
}

const DEFAULT_SOURCES: MetadataSource[] = ['beatport', 'bandcamp', 'musicbrainz'];

/**
 * Unified metadata lookup that tries multiple sources
 * Order: Beatport (best for electronic) -> Bandcamp (indie/underground) -> MusicBrainz (fingerprint)
 */
export async function lookupMetadata(
  title: string,
  artist: string,
  options: LookupOptions = {}
): Promise<LookupResult | null> {
  const sources = options.sources || DEFAULT_SOURCES;

  for (const source of sources) {
    let result: (MetadataLookup & Partial<AudioAnalysis>) | null = null;

    try {
      switch (source) {
        case 'beatport':
          result = await searchBeatport(title, artist);
          break;

        case 'bandcamp':
          result = await searchBandcamp(title, artist);
          break;

        case 'musicbrainz':
          // Try fingerprint first if audio path provided
          if (options.audioPath && !options.skipFingerprint) {
            const hasFpcalc = await checkFpcalcInstalled();
            if (hasFpcalc) {
              result = await lookupByFingerprint(options.audioPath);
            }
          }
          // Fall back to metadata search
          if (!result) {
            result = await searchByMetadata(title, artist);
          }
          break;
      }

      if (result) {
        return {
          ...result,
          source,
        };
      }
    } catch (error) {
      console.warn(`${source} lookup failed:`, error);
    }
  }

  return null;
}

/**
 * Get status of available metadata sources
 */
export async function getMetadataSourcesStatus(): Promise<
  Record<MetadataSource, { available: boolean; reason?: string }>
> {
  const hasFpcalc = await checkFpcalcInstalled();
  const hasAcoustId = !!(
    process.env.ACOUSTID_API_KEY &&
    process.env.ACOUSTID_API_KEY !== 'xxxxxxxx'
  );

  return {
    beatport: {
      available: true, // Web scraping always available
      reason: isBeatportConfigured()
        ? 'API configured'
        : 'Using web scraping (API credentials not set)',
    },
    bandcamp: {
      available: true,
      reason: 'Web scraping available',
    },
    musicbrainz: {
      available: hasFpcalc && hasAcoustId,
      reason: !hasFpcalc
        ? 'fpcalc not installed'
        : !hasAcoustId
          ? 'ACOUSTID_API_KEY not set'
          : 'Fingerprint + API configured',
    },
  };
}
