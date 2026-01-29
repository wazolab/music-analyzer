import * as mm from 'music-metadata';
import { ExistingTags } from '../types.js';

export async function readFlacTags(filePath: string): Promise<ExistingTags> {
  const metadata = await mm.parseFile(filePath);
  const { common } = metadata;

  return {
    title: common.title,
    artist: common.artist,
    album: common.album,
    year: common.year,
    genre: common.genre,
    label: common.label?.[0],
    bpm: common.bpm,
    key: common.key,
    musicbrainzTrackId: common.musicbrainz_trackid,
  };
}

export async function getAudioDuration(filePath: string): Promise<number> {
  const metadata = await mm.parseFile(filePath);
  return metadata.format.duration || 0;
}

export async function getBasicInfo(
  filePath: string
): Promise<{
  duration: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}> {
  const metadata = await mm.parseFile(filePath);
  const { format } = metadata;

  return {
    duration: format.duration || 0,
    sampleRate: format.sampleRate || 44100,
    bitsPerSample: format.bitsPerSample || 16,
    channels: format.numberOfChannels || 2,
  };
}
