export interface BeatGrid {
  firstBeatMs: number;
  beatPositions: number[];
}

export interface GenrePrediction {
  genre: string;
  confidence: number;
}

export interface AudioAnalysis {
  bpm: number;
  key: string;
  camelotKey: string;
  energy: number;
  genres: string[];
  beatGrid: BeatGrid;
  genreConfidences?: GenrePrediction[]; // Top genre predictions with confidence scores
}

export interface MetadataLookup {
  title: string;
  artist: string;
  album?: string;
  label?: string;
  year?: number;
  mbRecordingId?: string;
}

export interface OutputPaths {
  byYear: string;
  byGenre: string;
  byLabel: string;
}

export interface TrackAnalysis {
  path: string;
  filename: string;
  analysis: AudioAnalysis;
  metadata: MetadataLookup;
  outputPaths: OutputPaths;
}

export interface AnalyzeOptions {
  output: string;
  dryRun: boolean;
  skipLookup: boolean;
  skipAnalysis: boolean;
  concurrency: number;
  useWorkers: boolean;
}

export interface ExistingTags {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string[];
  label?: string;
  bpm?: number;
  key?: string;
  musicbrainzTrackId?: string;
}

export const CAMELOT_MAP: Record<string, string> = {
  'C major': '8B',
  'C minor': '5A',
  'C# major': '3B',
  'Db major': '3B',
  'C# minor': '12A',
  'Db minor': '12A',
  'D major': '10B',
  'D minor': '7A',
  'D# major': '5B',
  'Eb major': '5B',
  'D# minor': '2A',
  'Eb minor': '2A',
  'E major': '12B',
  'E minor': '9A',
  'F major': '7B',
  'F minor': '4A',
  'F# major': '2B',
  'Gb major': '2B',
  'F# minor': '11A',
  'Gb minor': '11A',
  'G major': '9B',
  'G minor': '6A',
  'G# major': '4B',
  'Ab major': '4B',
  'G# minor': '1A',
  'Ab minor': '1A',
  'A major': '11B',
  'A minor': '8A',
  'A# major': '6B',
  'Bb major': '6B',
  'A# minor': '3A',
  'Bb minor': '3A',
  'B major': '1B',
  'B minor': '10A',
};

export function keyToCamelot(key: string): string {
  return CAMELOT_MAP[key] || key;
}

export function formatKey(key: string, scale: string): string {
  const formatted = `${key} ${scale}`;
  return formatted;
}
