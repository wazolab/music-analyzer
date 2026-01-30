import { createRequire } from 'module';
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs/promises';
import path from 'path';
import { GenrePrediction } from '../types.js';
import {
  refineGenrePredictions,
  getTopGenres,
  aggregateGenrePredictions,
} from './genre-heuristics.js';

const require = createRequire(import.meta.url);

const MODELS_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../models'
);

const TFJS_MODEL_URL =
  'https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/discogs-autotagging/views/src/audio/model-tfjs/model.json';

// Discogs 400 genre/style labels (subset shown, full list loaded from file)
const GENRE_LABELS: string[] = [];

let tfModel: tf.GraphModel | null = null;
let essentia: any = null;

async function downloadTFJSModel(): Promise<string> {
  const modelDir = path.join(MODELS_DIR, 'tfjs-genre');
  const modelJsonPath = path.join(modelDir, 'model.json');

  try {
    await fs.access(modelJsonPath);
    return modelDir;
  } catch {
    // Model doesn't exist, need to download
  }

  console.log('Downloading genre classification model...');
  await fs.mkdir(modelDir, { recursive: true });

  // Download model.json
  const modelResponse = await fetch(TFJS_MODEL_URL);
  if (!modelResponse.ok) {
    throw new Error(`Failed to download model.json: ${modelResponse.statusText}`);
  }
  const modelJson = await modelResponse.text();
  await fs.writeFile(modelJsonPath, modelJson);

  // Parse model.json to get weight shard URLs
  const modelConfig = JSON.parse(modelJson);
  const baseUrl = TFJS_MODEL_URL.replace('/model.json', '');

  // Download weight shards
  for (const group of modelConfig.weightsManifest) {
    for (const shardPath of group.paths) {
      const shardUrl = `${baseUrl}/${shardPath}`;
      const shardDestPath = path.join(modelDir, shardPath);

      console.log(`Downloading ${shardPath}...`);
      const shardResponse = await fetch(shardUrl);
      if (!shardResponse.ok) {
        throw new Error(`Failed to download ${shardPath}`);
      }
      const shardBuffer = await shardResponse.arrayBuffer();
      await fs.writeFile(shardDestPath, Buffer.from(shardBuffer));
    }
  }

  console.log('Genre model downloaded successfully');
  return modelDir;
}

async function loadGenreLabels(): Promise<void> {
  if (GENRE_LABELS.length > 0) return;

  const labelsPath = path.join(MODELS_DIR, 'genre-labels.json');

  try {
    await fs.access(labelsPath);
    const content = await fs.readFile(labelsPath, 'utf-8');
    GENRE_LABELS.push(...JSON.parse(content));
    return;
  } catch {
    // Download labels
  }

  const labelsUrl =
    'https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/discogs-autotagging/views/src/audio/labels.js';
  const response = await fetch(labelsUrl);
  if (!response.ok) {
    throw new Error('Failed to download genre labels');
  }
  const content = await response.text();

  // Parse JS module format: export const labels = ["label1", "label2", ...]
  const match = content.match(/\[([^\]]+)\]/);
  if (match) {
    const labels = match[1]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter((s) => s.length > 0);
    GENRE_LABELS.push(...labels);
    await fs.mkdir(MODELS_DIR, { recursive: true });
    await fs.writeFile(labelsPath, JSON.stringify(labels));
  }
}

async function loadTFModel(): Promise<tf.GraphModel> {
  if (tfModel) {
    return tfModel;
  }

  const modelDir = await downloadTFJSModel();
  const modelPath = `file://${modelDir}/model.json`;

  tfModel = await tf.loadGraphModel(modelPath);
  return tfModel;
}

function getEssentia(): any {
  if (essentia) {
    return essentia;
  }

  const essentiaModule = require('essentia.js');
  essentia = new essentiaModule.Essentia(essentiaModule.EssentiaWASM);
  return essentia;
}

// MusiCNN/Discogs model parameters
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const MEL_BANDS = 96;
const PATCH_SIZE = 128; // frames per patch (Discogs model expects 128x96)
const PATCH_HOP = 64;   // ~1 prediction/second at 16kHz
const TARGET_SR = 16000;

// Analysis coverage: 65% of track, evenly spaced (skip intro/outro)
const ANALYSIS_COVERAGE = 0.65;
const SKIP_RATIO = (1 - ANALYSIS_COVERAGE) / 2; // 17.5% skip at start/end

/**
 * Resample audio to target sample rate using simple linear interpolation
 */
function resampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === TARGET_SR) {
    return samples;
  }

  const ratio = sampleRate / TARGET_SR;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    resampled[i] = samples[Math.floor(i * ratio)];
  }

  return resampled;
}

/**
 * Compute mel-spectrogram for a patch of audio starting at a given frame offset.
 * Uses Essentia's TensorflowInputMusiCNN for exact preprocessing match.
 */
function computeMelPatch(
  audioData: Float32Array,
  frameOffset: number
): Float32Array | null {
  const ess = getEssentia();
  const melFrames: number[][] = [];

  // Calculate sample offset from frame offset
  const sampleOffset = frameOffset * HOP_SIZE;

  // Check if we have enough samples for a full patch
  const samplesNeeded = sampleOffset + FRAME_SIZE + (PATCH_SIZE - 1) * HOP_SIZE;
  if (samplesNeeded > audioData.length) {
    return null;
  }

  // Process PATCH_SIZE frames using TensorflowInputMusiCNN
  for (let f = 0; f < PATCH_SIZE; f++) {
    const sampleStart = sampleOffset + f * HOP_SIZE;
    const frame = audioData.slice(sampleStart, sampleStart + FRAME_SIZE);

    if (frame.length < FRAME_SIZE) {
      break;
    }

    const frameVector = ess.arrayToVector(frame);

    // Use TensorflowInputMusiCNN for exact preprocessing match
    const result = ess.TensorflowInputMusiCNN(frameVector);
    const bands = ess.vectorToArray(result.bands);

    melFrames.push(Array.from(bands));
  }

  if (melFrames.length < PATCH_SIZE) {
    return null;
  }

  // Convert to Float32Array
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

/**
 * Get patch frame offsets for analyzing 65% of the track, evenly spaced.
 * Skips intro (~17.5%) and outro (~17.5%) to focus on the main content.
 * Returns ~10 evenly spaced patches for fast analysis.
 */
function getAllPatchOffsets(totalSamples: number): number[] {
  // Calculate total frames available
  const totalFrames = Math.floor((totalSamples - FRAME_SIZE) / HOP_SIZE) + 1;

  // Calculate analysis window (65% of track, centered)
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

export interface GenreClassificationResult {
  genres: string[];
  genreConfidences: GenrePrediction[];
}

export interface AudioFeatures {
  bpm: number;
  key: string;
  energy: number;
}

/**
 * Run inference on a single patch and return raw predictions
 */
async function classifyPatch(
  model: tf.GraphModel,
  melPatch: Float32Array
): Promise<GenrePrediction[]> {
  // Create tensor with shape [1, 128, 96]
  const inputTensor = tf.tensor3d(melPatch, [1, PATCH_SIZE, MEL_BANDS]);

  // Run inference
  const predictions = model.predict(inputTensor) as tf.Tensor;
  const predictionData = await predictions.data();

  // Clean up tensors
  inputTensor.dispose();
  predictions.dispose();

  // Convert to GenrePrediction format
  return Array.from(predictionData).map((prob, idx) => ({
    genre: (GENRE_LABELS[idx] || `Genre ${idx}`).replace('---', ' - '),
    confidence: prob as number,
  }));
}

/**
 * Classify genre from audio samples using segment-level analysis.
 * Mirrors Essentia's discogs-autotagging approach:
 * - Process entire track with overlapping patches (PATCH_HOP = 64 frames, ~1 pred/sec)
 * - Aggregate all predictions using median for robustness
 *
 * @param samples - Audio samples as Float32Array
 * @param sampleRate - Sample rate
 * @param audioFeatures - Optional BPM/key/energy for heuristic refinement
 * @returns Genre classification result with top genres and confidence scores
 */
export async function classifyGenre(
  samples: Float32Array,
  sampleRate: number,
  audioFeatures?: AudioFeatures
): Promise<GenreClassificationResult> {
  try {
    await loadGenreLabels();
    if (GENRE_LABELS.length === 0) {
      return { genres: [], genreConfidences: [] };
    }

    const model = await loadTFModel();

    // Resample to 16kHz (required by model)
    const audioData = resampleTo16k(samples, sampleRate);

    // Get all patch offsets for full-track analysis
    const patchOffsets = getAllPatchOffsets(audioData.length);

    if (patchOffsets.length === 0) {
      return { genres: [], genreConfidences: [] };
    }

    // Process all patches and collect predictions
    const allPatchPredictions: GenrePrediction[][] = [];

    for (const frameOffset of patchOffsets) {
      const melPatch = computeMelPatch(audioData, frameOffset);
      if (melPatch) {
        const predictions = await classifyPatch(model, melPatch);
        allPatchPredictions.push(predictions);
      }
    }

    if (allPatchPredictions.length === 0) {
      return { genres: [], genreConfidences: [] };
    }

    // Aggregate all patch predictions using median (robust to intros/outros)
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

    // Return top 10 for debugging purposes
    const topConfidences = genrePredictions.slice(0, 10);

    // Debug output - show top 5 raw predictions
    console.log('Genre classification results:');
    topConfidences.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.genre}: ${(p.confidence * 100).toFixed(1)}%`);
    });
    console.log(`Selected genres: ${genres.length > 0 ? genres.join(', ') : '(none)'}`);

    return { genres, genreConfidences: topConfidences };
  } catch (error) {
    console.error('Genre classification failed:', error);
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    return { genres: [], genreConfidences: [] };
  }
}

export async function initGenreClassifier(): Promise<boolean> {
  try {
    await loadGenreLabels();
    await loadTFModel();
    getEssentia();
    return true;
  } catch (error) {
    console.warn('Failed to initialize genre classifier:', error);
    return false;
  }
}
