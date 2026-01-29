import { parentPort, workerData } from 'worker_threads';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import {
  refineGenrePredictions,
  getTopGenres,
  aggregateGenrePredictions,
  GenrePrediction,
} from '../analyzers/genre-heuristics.js';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

// Worker-local instances
let essentiaInstance: any = null;
let tfModel: any = null;
let tf: any = null;
let genreLabels: string[] = [];

const MODELS_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../models'
);

interface AnalysisRequest {
  id: number;
  type: 'analyze';
  flacPath: string;
}

interface AnalysisResponse {
  id: number;
  success: boolean;
  result?: AudioAnalysisResult;
  error?: string;
}

interface AudioAnalysisResult {
  bpm: number;
  key: string;
  camelotKey: string;
  energy: number;
  genres: string[];
  genreConfidences?: GenrePrediction[];
  beatGrid: {
    firstBeatMs: number;
    beatPositions: number[];
  };
}

const CAMELOT_MAP: Record<string, string> = {
  'C major': '8B', 'C minor': '5A',
  'C# major': '3B', 'Db major': '3B', 'C# minor': '12A', 'Db minor': '12A',
  'D major': '10B', 'D minor': '7A',
  'D# major': '5B', 'Eb major': '5B', 'D# minor': '2A', 'Eb minor': '2A',
  'E major': '12B', 'E minor': '9A',
  'F major': '7B', 'F minor': '4A',
  'F# major': '2B', 'Gb major': '2B', 'F# minor': '11A', 'Gb minor': '11A',
  'G major': '9B', 'G minor': '6A',
  'G# major': '4B', 'Ab major': '4B', 'G# minor': '1A', 'Ab minor': '1A',
  'A major': '11B', 'A minor': '8A',
  'A# major': '6B', 'Bb major': '6B', 'A# minor': '3A', 'Bb minor': '3A',
  'B major': '1B', 'B minor': '10A',
};

function keyToCamelot(key: string): string {
  return CAMELOT_MAP[key] || key;
}

function formatKey(key: string, scale: string): string {
  return `${key} ${scale}`;
}

function getEssentia(): any {
  if (essentiaInstance) return essentiaInstance;
  const essentiaModule = require('essentia.js');
  essentiaInstance = new essentiaModule.Essentia(essentiaModule.EssentiaWASM);
  return essentiaInstance;
}

let tempFileCounter = 0;

async function decodeFlacToRaw(
  flacPath: string
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const uniqueId = `${Date.now()}-${process.pid}-w${workerData?.workerId || 0}-${tempFileCounter++}`;
  const tempFile = `/tmp/music-analyzer-${uniqueId}.raw`;

  try {
    await execFileAsync('ffmpeg', [
      '-i', flacPath,
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      '-ac', '1',
      '-ar', '44100',
      '-y', tempFile,
    ]);

    const rawData = await fs.readFile(tempFile);
    const samples = new Float32Array(rawData.buffer);
    return { samples, sampleRate: 44100 };
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {}
  }
}

async function loadGenreLabels(): Promise<void> {
  if (genreLabels.length > 0) return;

  const labelsPath = path.join(MODELS_DIR, 'genre-labels.json');
  try {
    const content = await fs.readFile(labelsPath, 'utf-8');
    genreLabels = JSON.parse(content);
  } catch {
    // Labels not available
  }
}

async function loadTFModel(): Promise<any> {
  if (tfModel) return tfModel;

  try {
    tf = await import('@tensorflow/tfjs-node');
    const modelDir = path.join(MODELS_DIR, 'tfjs-genre');
    const modelPath = `file://${modelDir}/model.json`;
    tfModel = await tf.loadGraphModel(modelPath);
    return tfModel;
  } catch {
    return null;
  }
}

// MusiCNN/Discogs model parameters
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const MEL_BANDS = 96;
const PATCH_SIZE = 128; // frames per patch (Discogs model expects 128x96)
const PATCH_HOP = 64;   // ~1 prediction/second at 16kHz
const TARGET_SR = 16000;

// Analysis coverage: 65% of track, evenly spaced
const ANALYSIS_COVERAGE = 0.65;
const SKIP_RATIO = (1 - ANALYSIS_COVERAGE) / 2;

function resampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === TARGET_SR) return samples;

  const ratio = sampleRate / TARGET_SR;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    resampled[i] = samples[Math.floor(i * ratio)];
  }
  return resampled;
}

function computeMelPatch(audioData: Float32Array, frameOffset: number): Float32Array | null {
  const ess = getEssentia();
  const melFrames: number[][] = [];
  const sampleOffset = frameOffset * HOP_SIZE;
  const samplesNeeded = sampleOffset + FRAME_SIZE + (PATCH_SIZE - 1) * HOP_SIZE;

  if (samplesNeeded > audioData.length) return null;

  for (let f = 0; f < PATCH_SIZE; f++) {
    const sampleStart = sampleOffset + f * HOP_SIZE;
    const frame = audioData.slice(sampleStart, sampleStart + FRAME_SIZE);
    if (frame.length < FRAME_SIZE) break;

    const frameVector = ess.arrayToVector(frame);
    // Use TensorflowInputMusiCNN for exact preprocessing match
    const result = ess.TensorflowInputMusiCNN(frameVector);
    const bands = ess.vectorToArray(result.bands);
    melFrames.push(Array.from(bands));
  }

  if (melFrames.length < PATCH_SIZE) return null;

  const result = new Float32Array(PATCH_SIZE * MEL_BANDS);
  for (let i = 0; i < PATCH_SIZE; i++) {
    for (let j = 0; j < MEL_BANDS; j++) {
      result[i * MEL_BANDS + j] = melFrames[i][j] || 0;
    }
  }
  return result;
}

// Number of patches to analyze (fewer = faster, more = accurate)
const TARGET_PATCHES = 10;

function getAllPatchOffsets(totalSamples: number): number[] {
  const totalFrames = Math.floor((totalSamples - FRAME_SIZE) / HOP_SIZE) + 1;
  const startFrame = Math.floor(totalFrames * SKIP_RATIO);
  const endFrame = Math.floor(totalFrames * (1 - SKIP_RATIO)) - PATCH_SIZE;

  if (endFrame <= startFrame) {
    return startFrame + PATCH_SIZE <= totalFrames ? [startFrame] : [];
  }

  // Evenly space TARGET_PATCHES patches across the analysis window
  const offsets: number[] = [];
  const step = (endFrame - startFrame) / (TARGET_PATCHES - 1);

  for (let i = 0; i < TARGET_PATCHES; i++) {
    const frameOffset = Math.floor(startFrame + i * step);
    if (frameOffset + PATCH_SIZE <= totalFrames) {
      offsets.push(frameOffset);
    }
  }

  return offsets;
}

interface GenreClassificationResult {
  genres: string[];
  genreConfidences: GenrePrediction[];
}

async function classifyPatch(model: any, melPatch: Float32Array): Promise<GenrePrediction[]> {
  const inputTensor = tf.tensor3d(melPatch, [1, PATCH_SIZE, MEL_BANDS]);
  const predictions = model.predict(inputTensor) as any;
  const predictionData = await predictions.data();

  inputTensor.dispose();
  predictions.dispose();

  return Array.from(predictionData).map((prob, idx) => ({
    genre: (genreLabels[idx] || `Genre ${idx}`).replace('---', ' - '),
    confidence: prob as number,
  }));
}

/**
 * Classify genre using segment-level analysis with median aggregation.
 * Mirrors Essentia's discogs-autotagging approach.
 */
async function classifyGenre(
  samples: Float32Array,
  sampleRate: number,
  audioFeatures?: { bpm: number; key: string; energy: number }
): Promise<GenreClassificationResult> {
  try {
    await loadGenreLabels();
    if (genreLabels.length === 0) return { genres: [], genreConfidences: [] };

    const model = await loadTFModel();
    if (!model || !tf) return { genres: [], genreConfidences: [] };

    // Resample to 16kHz
    const audioData = resampleTo16k(samples, sampleRate);

    // Get all patch offsets
    const patchOffsets = getAllPatchOffsets(audioData.length);
    if (patchOffsets.length === 0) return { genres: [], genreConfidences: [] };

    // Process all patches
    const allPatchPredictions: GenrePrediction[][] = [];
    for (const frameOffset of patchOffsets) {
      const melPatch = computeMelPatch(audioData, frameOffset);
      if (melPatch) {
        const predictions = await classifyPatch(model, melPatch);
        allPatchPredictions.push(predictions);
      }
    }

    if (allPatchPredictions.length === 0) return { genres: [], genreConfidences: [] };

    // Aggregate using median
    let genrePredictions = aggregateGenrePredictions(allPatchPredictions);

    // Apply heuristic refinement if audio features provided
    if (audioFeatures) {
      genrePredictions = refineGenrePredictions(
        genrePredictions,
        audioFeatures.bpm,
        audioFeatures.key,
        audioFeatures.energy
      );
    }

    // Get top genres
    const genres = getTopGenres(genrePredictions, 3, 0.05);
    const topConfidences = genrePredictions.slice(0, 10);

    return { genres, genreConfidences: topConfidences };
  } catch {
    return { genres: [], genreConfidences: [] };
  }
}

async function analyzeAudio(flacPath: string): Promise<AudioAnalysisResult> {
  const { samples, sampleRate } = await decodeFlacToRaw(flacPath);
  const essentia = getEssentia();

  const inputSignal = essentia.arrayToVector(samples);

  // Key detection
  const keyResult = essentia.KeyExtractor(
    inputSignal, true, 4096, 4096, 12, 3500, 60, 25, 0.2,
    'edma', sampleRate, 0.0001, 440, 'cosine', 'hann'
  );
  const keyString = formatKey(keyResult.key, keyResult.scale);
  const camelotKey = keyToCamelot(keyString);

  // BPM detection
  const rhythmResult = essentia.RhythmExtractor2013(inputSignal, 208, 'degara', 40);
  const bpm = Math.round(rhythmResult.bpm);

  // Energy calculation
  const energyResult = essentia.Energy(inputSignal);
  const rmsEnergy = Math.sqrt(energyResult.energy / samples.length);
  const normalizedEnergy = Math.min(1, rmsEnergy * 10);

  // Beat grid
  const ticks = essentia.vectorToArray(rhythmResult.ticks);
  const beatPositions = ticks.map((t: number) => Math.round(t * 1000));
  const firstBeatMs = beatPositions.length > 0 ? beatPositions[0] : 0;

  // Genre classification with heuristic refinement
  const genreResult = await classifyGenre(samples, sampleRate, {
    bpm,
    key: keyString,
    energy: normalizedEnergy,
  });

  return {
    bpm,
    key: keyString,
    camelotKey,
    energy: normalizedEnergy,
    genres: genreResult.genres,
    genreConfidences: genreResult.genreConfidences,
    beatGrid: { firstBeatMs, beatPositions },
  };
}

// Message handler
parentPort?.on('message', async (message: AnalysisRequest) => {
  if (message.type === 'analyze') {
    try {
      const result = await analyzeAudio(message.flacPath);
      const response: AnalysisResponse = {
        id: message.id,
        success: true,
        result,
      };
      parentPort?.postMessage(response);
    } catch (error) {
      const response: AnalysisResponse = {
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      parentPort?.postMessage(response);
    }
  }
});

// Signal ready
parentPort?.postMessage({ type: 'ready' });
