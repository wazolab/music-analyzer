import { parentPort, workerData } from 'worker_threads';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

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

function computeMelSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  numFrames: number = 128,
  numBands: number = 96
): Float32Array {
  const ess = getEssentia();
  const frameSize = 512;
  const hopSize = 256;

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

  for (let i = 0; i + frameSize <= audioData.length && melFrames.length < numFrames; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const frameVector = ess.arrayToVector(frame);
    const windowed = ess.Windowing(frameVector, true, frameSize, 'hann', 0, true);
    const spectrum = ess.Spectrum(windowed.frame, frameSize);
    const spectrumSize = frameSize / 2 + 1;
    const melBands = ess.MelBands(
      spectrum.spectrum, sr / 2, spectrumSize, false, 0,
      'unit_sum', numBands, sr, 'power', 'htkMel', 'warping'
    );
    const bands = ess.vectorToArray(melBands.bands);
    const logBands = bands.map((b: number) => 10 * Math.log10(Math.max(b, 1e-10)));
    melFrames.push(logBands);
  }

  while (melFrames.length < numFrames) {
    melFrames.push(new Array(numBands).fill(-100));
  }

  const result = new Float32Array(numFrames * numBands);
  for (let i = 0; i < numFrames; i++) {
    for (let j = 0; j < numBands; j++) {
      const val = melFrames[i][j] || -100;
      result[i * numBands + j] = (val + 100) / 100;
    }
  }

  return result;
}

async function classifyGenre(samples: Float32Array, sampleRate: number): Promise<string[]> {
  try {
    await loadGenreLabels();
    if (genreLabels.length === 0) return [];

    const model = await loadTFModel();
    if (!model || !tf) return [];

    const melFeatures = computeMelSpectrogram(samples, sampleRate, 128, 96);
    const inputTensor = tf.tensor3d(melFeatures, [1, 128, 96]);
    const predictions = model.predict(inputTensor) as any;
    const predictionData = await predictions.data();

    inputTensor.dispose();
    predictions.dispose();

    const indexed = Array.from(predictionData).map((prob, idx) => ({
      label: genreLabels[idx] || `Genre ${idx}`,
      probability: prob as number,
    }));

    indexed.sort((a, b) => b.probability - a.probability);

    return indexed
      .filter((g) => g.probability > 0.05)
      .slice(0, 3)
      .map((g) => g.label.replace('---', ' - '));
  } catch {
    return [];
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

  // Genre classification
  const genres = await classifyGenre(samples, sampleRate);

  return {
    bpm,
    key: keyString,
    camelotKey,
    energy: normalizedEnergy,
    genres,
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
