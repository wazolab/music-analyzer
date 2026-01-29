import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { AudioAnalysis, keyToCamelot, formatKey } from '../types.js';
import { createRequire } from 'module';
import { classifyGenre } from './genre.js';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const MODELS_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../models'
);

// ML models for genre classification (optional - genre classification will be skipped if unavailable)
const MODEL_URLS = {
  'discogs-effnet-bs64-1.pb':
    'https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb',
  'genre_discogs400-discogs-effnet-1.pb':
    'https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb',
};

async function downloadModel(name: string, url: string): Promise<boolean> {
  const modelPath = path.join(MODELS_DIR, name);

  try {
    await fs.access(modelPath);
    return true;
  } catch {
    // Model doesn't exist, try to download it
  }

  try {
    await fs.mkdir(MODELS_DIR, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Warning: Could not download model ${name}: ${response.statusText}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(modelPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.warn(`Warning: Failed to download model ${name}:`, error);
    return false;
  }
}

export async function ensureModelsDownloaded(): Promise<void> {
  // Models are optional - genre classification will be skipped if unavailable
  for (const [name, url] of Object.entries(MODEL_URLS)) {
    await downloadModel(name, url);
  }
}

async function decodeFlacToRaw(
  flacPath: string
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const tempFile = `/tmp/music-analyzer-${Date.now()}.raw`;

  try {
    await execFileAsync('ffmpeg', [
      '-i',
      flacPath,
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-y',
      tempFile,
    ]);

    const rawData = await fs.readFile(tempFile);
    const samples = new Float32Array(rawData.buffer);

    return { samples, sampleRate: 44100 };
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let essentiaInstance: any = null;

async function getEssentia(): Promise<any> {
  if (essentiaInstance) {
    return essentiaInstance;
  }

  // essentia.js uses CommonJS exports
  const essentiaModule = require('essentia.js');
  const EssentiaWASM = essentiaModule.EssentiaWASM;
  const Essentia = essentiaModule.Essentia;

  essentiaInstance = new Essentia(EssentiaWASM);
  return essentiaInstance;
}

export async function analyzeAudio(flacPath: string): Promise<AudioAnalysis> {
  const { samples, sampleRate } = await decodeFlacToRaw(flacPath);
  const essentia = await getEssentia();

  // Convert samples to Essentia vector
  const inputSignal = essentia.arrayToVector(samples);

  // Key detection using KeyExtractor
  const keyResult = essentia.KeyExtractor(
    inputSignal,
    true,   // averageDetuningCorrection
    4096,   // frameSize
    4096,   // hopSize
    12,     // hpcpSize
    3500,   // maxFrequency
    60,     // maximumSpectralPeaks
    25,     // minFrequency
    0.2,    // pcpThreshold
    'edma', // profileType
    sampleRate,
    0.0001, // spectralPeaksThreshold
    440,    // tuningFrequency
    'cosine', // weightType
    'hann'  // windowType
  );
  const keyString = formatKey(keyResult.key, keyResult.scale);
  const camelotKey = keyToCamelot(keyString);

  // BPM detection using RhythmExtractor2013
  const rhythmResult = essentia.RhythmExtractor2013(
    inputSignal,
    208,      // maxTempo
    'degara', // method
    40        // minTempo
  );
  const bpm = Math.round(rhythmResult.bpm);

  // Energy calculation (RMS-based)
  const energyResult = essentia.Energy(inputSignal);
  const rmsEnergy = Math.sqrt(energyResult.energy / samples.length);
  const normalizedEnergy = Math.min(1, rmsEnergy * 10);

  // Beat grid from rhythm ticks
  const ticks = essentia.vectorToArray(rhythmResult.ticks);
  const beatPositions = ticks.map((t: number) => Math.round(t * 1000));
  const firstBeatMs = beatPositions.length > 0 ? beatPositions[0] : 0;

  // Genre classification using TensorFlow model
  let genres: string[] = [];
  try {
    genres = await classifyGenre(samples, sampleRate);
  } catch (error) {
    console.warn('Genre classification skipped:', error);
  }

  return {
    bpm,
    key: keyString,
    camelotKey,
    energy: normalizedEnergy,
    genres,
    beatGrid: {
      firstBeatMs,
      beatPositions,
    },
  };
}
