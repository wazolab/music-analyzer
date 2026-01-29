import { createRequire } from 'module';
import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs/promises';
import path from 'path';

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

function computeMelSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  numFrames: number = 128,
  numBands: number = 96
): Float32Array {
  const ess = getEssentia();

  const frameSize = 512;
  const hopSize = 256;

  // Resample to 16kHz if needed
  let audioData = samples;
  let sr = sampleRate;
  if (sampleRate !== 16000) {
    const ratio = sampleRate / 16000;
    const newLength = Math.floor(samples.length / ratio);
    audioData = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      audioData[i] = samples[Math.floor(i * ratio)];
    }
    sr = 16000;
  }

  const melFrames: number[][] = [];

  // Process audio in overlapping frames
  for (let i = 0; i + frameSize <= audioData.length && melFrames.length < numFrames; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const frameVector = ess.arrayToVector(frame);

    // Apply windowing
    const windowed = ess.Windowing(frameVector, true, frameSize, 'hann', 0, true);

    // Compute spectrum
    const spectrum = ess.Spectrum(windowed.frame, frameSize);

    // Compute mel bands (without log - we'll apply log manually)
    const spectrumSize = frameSize / 2 + 1;
    const melBands = ess.MelBands(
      spectrum.spectrum,
      sr / 2,         // highFrequencyBound
      spectrumSize,   // inputSize (spectrum size)
      false,          // log=false, we'll compute log manually
      0,              // lowFrequencyBound
      'unit_sum',     // normalize
      numBands,       // numberBands
      sr,             // sampleRate
      'power',        // type
      'htkMel',       // warpingFormula
      'warping'       // weighting
    );

    const bands = ess.vectorToArray(melBands.bands);

    // Apply log scaling manually: 10 * log10(max(x, 1e-10))
    const logBands = bands.map((b: number) => {
      const val = Math.max(b, 1e-10);
      return 10 * Math.log10(val);
    });

    melFrames.push(logBands);
  }

  // Pad to numFrames if needed
  while (melFrames.length < numFrames) {
    melFrames.push(new Array(numBands).fill(-100)); // Silence in dB
  }

  // Normalize: scale to roughly 0-1 range
  // Typical log mel values range from -100 to 0 dB
  // Normalize to [0, 1] for neural network input
  const result = new Float32Array(numFrames * numBands);
  for (let i = 0; i < numFrames; i++) {
    for (let j = 0; j < numBands; j++) {
      const val = melFrames[i][j] || -100;
      // Normalize from [-100, 0] to [0, 1]
      result[i * numBands + j] = (val + 100) / 100;
    }
  }

  return result;
}

export async function classifyGenre(
  samples: Float32Array,
  sampleRate: number
): Promise<string[]> {
  try {
    await loadGenreLabels();
    if (GENRE_LABELS.length === 0) {
      return [];
    }

    const model = await loadTFModel();

    // Compute mel-spectrogram features
    const melFeatures = computeMelSpectrogram(samples, sampleRate, 128, 96);

    // Create tensor with shape [1, 128, 96]
    const inputTensor = tf.tensor3d(melFeatures, [1, 128, 96]);

    // Run inference
    const predictions = model.predict(inputTensor) as tf.Tensor;
    const predictionData = await predictions.data();

    // Clean up tensors
    inputTensor.dispose();
    predictions.dispose();

    // Get top 3 genres with confidence > 5%
    const indexed = Array.from(predictionData).map((prob, idx) => ({
      label: GENRE_LABELS[idx] || `Genre ${idx}`,
      probability: prob as number,
    }));

    indexed.sort((a, b) => b.probability - a.probability);

    // Return top 3 genres (format: remove "---" separator for cleaner display)
    const topGenres = indexed
      .filter((g) => g.probability > 0.05)
      .slice(0, 3)
      .map((g) => g.label.replace('---', ' - '));

    return topGenres;
  } catch (error) {
    console.warn('Genre classification failed:', error);
    return [];
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
