import {
  readFlacTags as readTags,
  writeFlacTags as writeTags,
  FlacTagMap,
} from 'flac-tagger';
import { AudioAnalysis, MetadataLookup } from '../types.js';

export interface TagsToWrite {
  // Standard tags
  TITLE?: string;
  ARTIST?: string;
  ALBUM?: string;
  DATE?: string;
  GENRE?: string;
  LABEL?: string;

  // Analysis tags
  BPM?: string;
  INITIALKEY?: string;
  KEY?: string;
  ENERGY?: string;

  // MusicBrainz tags
  MUSICBRAINZ_TRACKID?: string;
}

export async function writeFlacTags(
  filePath: string,
  analysis: AudioAnalysis,
  metadata: MetadataLookup
): Promise<void> {
  const tags: FlacTagMap = {};

  // Analysis results
  tags.BPM = String(Math.round(analysis.bpm));
  tags.INITIALKEY = analysis.key;
  tags.KEY = analysis.camelotKey;
  tags.ENERGY = String(Math.round(analysis.energy * 100));

  if (analysis.genres.length > 0) {
    tags.GENRE = analysis.genres[0];
  }

  // Metadata from lookup
  if (metadata.title) {
    tags.TITLE = metadata.title;
  }
  if (metadata.artist) {
    tags.ARTIST = metadata.artist;
  }
  if (metadata.album) {
    tags.ALBUM = metadata.album;
  }
  if (metadata.year) {
    tags.DATE = String(metadata.year);
  }
  if (metadata.label) {
    tags.LABEL = metadata.label;
  }
  if (metadata.mbRecordingId) {
    tags.MUSICBRAINZ_TRACKID = metadata.mbRecordingId;
  }

  // Read existing tags to preserve them
  const existingFlacTags = await readTags(filePath);
  const existingTagMap = existingFlacTags.tagMap || {};

  // Merge new tags with existing ones (new tags take precedence)
  const mergedTagMap: FlacTagMap = { ...existingTagMap, ...tags };

  // Write merged tags, preserving picture if it exists
  await writeTags(
    {
      tagMap: mergedTagMap,
      picture: existingFlacTags.picture,
    },
    filePath
  );
}

export async function writeAnalysisTags(
  filePath: string,
  analysis: AudioAnalysis
): Promise<void> {
  const tags: FlacTagMap = {
    BPM: String(Math.round(analysis.bpm)),
    INITIALKEY: analysis.key,
    KEY: analysis.camelotKey,
    ENERGY: String(Math.round(analysis.energy * 100)),
  };

  if (analysis.genres.length > 0) {
    tags.GENRE = analysis.genres[0];
  }

  const existingFlacTags = await readTags(filePath);
  const existingTagMap = existingFlacTags.tagMap || {};
  const mergedTagMap: FlacTagMap = { ...existingTagMap, ...tags };

  await writeTags(
    {
      tagMap: mergedTagMap,
      picture: existingFlacTags.picture,
    },
    filePath
  );
}
