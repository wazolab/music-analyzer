declare module 'essentia.js' {
  export interface EssentiaInstance {
    KeyExtractor(
      samples: Float32Array,
      averageDetuningCorrection: boolean,
      frameSize: number,
      hopSize: number,
      hpcpSize: number,
      maxFrequency: number,
      maximumSpectralPeaks: number,
      minFrequency: number,
      pcpThreshold: number,
      profileType: string,
      sampleRate: number,
      spectralPeaksThreshold: number,
      tuningFrequency: number,
      weightType: string,
      windowType: string
    ): { key: string; scale: string; strength: number };

    RhythmExtractor2013(
      samples: Float32Array,
      maxTempo: number,
      method: string,
      minTempo: number
    ): {
      bpm: number;
      ticks: Float32Array;
      confidence: number;
      estimates: Float32Array;
      bpmIntervals: Float32Array;
    };

    Energy(samples: Float32Array): { energy: number };

    arrayToVector(arr: Float32Array): Float32Array;
    vectorToArray(vec: Float32Array): number[];
  }

  export function EssentiaWASM(): Promise<EssentiaInstance>;
}
