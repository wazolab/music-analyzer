import { BeatGrid } from '../types.js';

export interface BeatGridAnalysis extends BeatGrid {
  beatsPerBar: number;
  estimatedTimeSignature: string;
}

export function analyzeBeatGrid(
  beatPositions: number[],
  bpm: number
): BeatGridAnalysis {
  if (beatPositions.length === 0) {
    return {
      firstBeatMs: 0,
      beatPositions: [],
      beatsPerBar: 4,
      estimatedTimeSignature: '4/4',
    };
  }

  const firstBeatMs = beatPositions[0];

  // Calculate beat intervals
  const intervals: number[] = [];
  for (let i = 1; i < beatPositions.length; i++) {
    intervals.push(beatPositions[i] - beatPositions[i - 1]);
  }

  // Estimate time signature based on beat groupings
  // Most electronic music is 4/4, but we can detect patterns
  const expectedBeatDuration = 60000 / bpm;
  const beatsPerBar = estimateBeatsPerBar(intervals, expectedBeatDuration);

  return {
    firstBeatMs,
    beatPositions,
    beatsPerBar,
    estimatedTimeSignature: `${beatsPerBar}/4`,
  };
}

function estimateBeatsPerBar(
  intervals: number[],
  expectedBeatDuration: number
): number {
  if (intervals.length < 8) {
    return 4; // Default to 4/4
  }

  // Look for accent patterns (stronger beats typically have slightly different intervals)
  // This is a simplified heuristic - real downbeat detection would use spectral analysis

  // Calculate variance in groups of 3, 4, and 6
  const variance3 = calculateGroupVariance(intervals, 3);
  const variance4 = calculateGroupVariance(intervals, 4);
  const variance6 = calculateGroupVariance(intervals, 6);

  // The grouping with lowest variance is likely the correct one
  if (variance3 < variance4 && variance3 < variance6) {
    return 3; // 3/4 time
  } else if (variance6 < variance4) {
    return 6; // 6/8 time
  }

  return 4; // 4/4 time (most common)
}

function calculateGroupVariance(intervals: number[], groupSize: number): number {
  const groups: number[][] = [];

  for (let i = 0; i < intervals.length - groupSize; i += groupSize) {
    groups.push(intervals.slice(i, i + groupSize));
  }

  if (groups.length < 2) {
    return Infinity;
  }

  // Calculate sum of each group
  const groupSums = groups.map((g) => g.reduce((a, b) => a + b, 0));

  // Calculate variance of group sums
  const mean = groupSums.reduce((a, b) => a + b, 0) / groupSums.length;
  const variance =
    groupSums.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    groupSums.length;

  return variance;
}

export function findDownbeats(
  beatPositions: number[],
  beatsPerBar: number
): number[] {
  const downbeats: number[] = [];

  for (let i = 0; i < beatPositions.length; i += beatsPerBar) {
    downbeats.push(beatPositions[i]);
  }

  return downbeats;
}

export function snapToGrid(
  position: number,
  beatPositions: number[]
): number {
  if (beatPositions.length === 0) {
    return position;
  }

  let closest = beatPositions[0];
  let minDiff = Math.abs(position - closest);

  for (const beat of beatPositions) {
    const diff = Math.abs(position - beat);
    if (diff < minDiff) {
      minDiff = diff;
      closest = beat;
    }
  }

  return closest;
}
