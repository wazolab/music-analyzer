/**
 * BPM/key-based heuristics for refining electronic music genre classification.
 * Applied after ML inference to boost or demote genre predictions based on
 * audio feature compatibility.
 */

export interface GenrePrediction {
  genre: string;
  confidence: number;
}

export interface GenreHeuristic {
  genre: string;
  bpmRange: [number, number];
  preferredKeys?: 'major' | 'minor';
  boost: number;
}

/**
 * Heuristics for electronic music subgenres based on typical BPM ranges and keys.
 * Boost values are multiplied with ML confidence when BPM falls within range.
 */
export const ELECTRONIC_HEURISTICS: GenreHeuristic[] = [
  // Trance (138-150 BPM, often minor keys for emotional intensity)
  { genre: 'Trance', bpmRange: [138, 150], preferredKeys: 'minor', boost: 1.5 },
  { genre: 'Psy-Trance', bpmRange: [140, 150], preferredKeys: 'minor', boost: 1.6 },
  { genre: 'Psytrance', bpmRange: [140, 150], preferredKeys: 'minor', boost: 1.6 },
  { genre: 'Hard Trance', bpmRange: [140, 155], boost: 1.4 },
  { genre: 'Progressive Trance', bpmRange: [128, 140], boost: 1.4 },
  { genre: 'Uplifting Trance', bpmRange: [136, 145], preferredKeys: 'minor', boost: 1.5 },

  // House (118-132 BPM)
  { genre: 'House', bpmRange: [118, 132], boost: 1.3 },
  { genre: 'Deep House', bpmRange: [118, 128], boost: 1.4 },
  { genre: 'Tech House', bpmRange: [124, 132], boost: 1.3 },
  { genre: 'Progressive House', bpmRange: [120, 130], boost: 1.3 },
  { genre: 'Minimal House', bpmRange: [120, 130], boost: 1.3 },

  // Techno (125-150 BPM)
  { genre: 'Techno', bpmRange: [125, 145], boost: 1.3 },
  { genre: 'Hard Techno', bpmRange: [140, 160], boost: 1.4 },
  { genre: 'Minimal Techno', bpmRange: [125, 135], boost: 1.3 },
  { genre: 'Industrial Techno', bpmRange: [130, 150], boost: 1.3 },

  // Drum and Bass (160-180 BPM)
  { genre: 'Drum n Bass', bpmRange: [160, 180], boost: 1.5 },
  { genre: 'Drum & Bass', bpmRange: [160, 180], boost: 1.5 },
  { genre: 'DnB', bpmRange: [160, 180], boost: 1.5 },
  { genre: 'Jungle', bpmRange: [160, 180], boost: 1.5 },
  { genre: 'Liquid DnB', bpmRange: [165, 178], boost: 1.4 },

  // Dubstep (140 BPM, half-time feel)
  { genre: 'Dubstep', bpmRange: [138, 145], boost: 1.4 },
  { genre: 'Brostep', bpmRange: [138, 145], boost: 1.4 },

  // Breakbeat/Breaks (125-145 BPM)
  { genre: 'Breaks', bpmRange: [125, 145], boost: 1.3 },
  { genre: 'Breakbeat', bpmRange: [125, 145], boost: 1.3 },

  // Hardcore/Gabber (150-200+ BPM)
  { genre: 'Hardcore', bpmRange: [150, 200], boost: 1.5 },
  { genre: 'Gabber', bpmRange: [160, 200], boost: 1.5 },
  { genre: 'Frenchcore', bpmRange: [180, 220], boost: 1.6 },

  // Ambient/Downtempo (low BPM, low energy)
  { genre: 'Ambient', bpmRange: [60, 100], boost: 1.5 },
  { genre: 'Downtempo', bpmRange: [80, 115], boost: 1.4 },
  { genre: 'Chillout', bpmRange: [80, 115], boost: 1.4 },
];

export interface DemoteRule {
  pattern: RegExp;
  demoteWhenSpecificMatch?: boolean;
  demoteWhenBpmRange?: [number, number];
  factor: number;
}

/**
 * Rules to demote overly generic or commonly mismatched genres.
 * Lower factor = more demotion (e.g., 0.4 = 40% of original confidence).
 */
export const DEMOTE_RULES: DemoteRule[] = [
  // Strongly demote "Experimental" - it's overused by the classifier
  { pattern: /experimental/i, demoteWhenSpecificMatch: true, factor: 0.2 },
  // Also demote Experimental based on BPM (electronic music range = likely misclassified)
  { pattern: /experimental/i, demoteWhenBpmRange: [120, 180], factor: 0.3 },

  // Demote rock/country when BPM is in electronic music range (likely misclassification)
  { pattern: /rock.*country/i, demoteWhenBpmRange: [120, 180], factor: 0.1 },
  { pattern: /country.*rock/i, demoteWhenBpmRange: [120, 180], factor: 0.1 },
  { pattern: /^rock$/i, demoteWhenBpmRange: [130, 180], factor: 0.2 },
  { pattern: /^country$/i, demoteWhenBpmRange: [120, 180], factor: 0.1 },
  { pattern: /folk/i, demoteWhenBpmRange: [130, 180], factor: 0.2 },

  // Demote broad categories when we have specific electronic matches
  { pattern: /^electronic$/i, demoteWhenSpecificMatch: true, factor: 0.5 },
  { pattern: /^dance$/i, demoteWhenSpecificMatch: true, factor: 0.5 },

  // Demote genres that are often misclassified for electronic music
  { pattern: /noise/i, demoteWhenBpmRange: [120, 160], factor: 0.4 },
  { pattern: /avant.*garde/i, demoteWhenBpmRange: [120, 180], factor: 0.3 },
];

/**
 * Check if key string indicates minor key
 */
function isMinorKey(key: string): boolean {
  return key.toLowerCase().includes('minor') || key.endsWith('A');
}

/**
 * Check if key string indicates major key
 */
function isMajorKey(key: string): boolean {
  return key.toLowerCase().includes('major') || key.endsWith('B');
}

/**
 * Normalize genre string for comparison
 */
function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Check if a prediction matches a heuristic by genre name (fuzzy match)
 */
function matchesHeuristic(prediction: GenrePrediction, heuristic: GenreHeuristic): boolean {
  const normalizedPrediction = normalizeGenre(prediction.genre);
  const normalizedHeuristic = normalizeGenre(heuristic.genre);

  // Exact match
  if (normalizedPrediction === normalizedHeuristic) {
    return true;
  }

  // Partial match (prediction contains heuristic genre)
  if (normalizedPrediction.includes(normalizedHeuristic)) {
    return true;
  }

  // Handle variations like "Psy-Trance" vs "Psytrance"
  const predictWords = prediction.genre.toLowerCase().split(/[-\s]+/);
  const heuristicWords = heuristic.genre.toLowerCase().split(/[-\s]+/);

  return heuristicWords.every((hw) =>
    predictWords.some((pw) => pw.includes(hw) || hw.includes(pw))
  );
}

/**
 * Check if we have a specific electronic genre match (for demoting generic genres)
 */
function hasSpecificElectronicMatch(
  predictions: GenrePrediction[],
  threshold: number = 0.1
): boolean {
  const specificGenres = [
    'trance',
    'house',
    'techno',
    'drum',
    'bass',
    'dubstep',
    'breaks',
    'hardcore',
    'ambient',
  ];

  return predictions.some(
    (p) =>
      p.confidence >= threshold &&
      specificGenres.some((g) => p.genre.toLowerCase().includes(g))
  );
}

/**
 * Refine genre predictions using BPM/key heuristics.
 *
 * @param predictions - Raw ML predictions with confidence scores
 * @param bpm - Detected BPM
 * @param key - Detected key (e.g., "A minor", "C major", or Camelot notation)
 * @param energy - Normalized energy level (0-1)
 * @returns Refined predictions, sorted by adjusted confidence
 */
export function refineGenrePredictions(
  predictions: GenrePrediction[],
  bpm: number,
  key: string,
  energy: number
): GenrePrediction[] {
  if (predictions.length === 0) {
    return predictions;
  }

  // Deep copy predictions to avoid mutation
  let refined = predictions.map((p) => ({ ...p }));

  // Apply boost heuristics
  for (const prediction of refined) {
    for (const heuristic of ELECTRONIC_HEURISTICS) {
      if (!matchesHeuristic(prediction, heuristic)) {
        continue;
      }

      // Check if BPM falls within heuristic range
      if (bpm >= heuristic.bpmRange[0] && bpm <= heuristic.bpmRange[1]) {
        let boost = heuristic.boost;

        // Additional boost for key preference match
        if (heuristic.preferredKeys) {
          const keyMatches =
            (heuristic.preferredKeys === 'minor' && isMinorKey(key)) ||
            (heuristic.preferredKeys === 'major' && isMajorKey(key));

          if (keyMatches) {
            boost *= 1.1; // Extra 10% boost for matching key type
          }
        }

        prediction.confidence *= boost;
      } else {
        // BPM is outside expected range - slight penalty
        prediction.confidence *= 0.8;
      }
    }
  }

  // Apply demote rules
  const hasSpecificMatch = hasSpecificElectronicMatch(refined);

  for (const prediction of refined) {
    for (const rule of DEMOTE_RULES) {
      if (!rule.pattern.test(prediction.genre)) {
        continue;
      }

      let shouldDemote = false;

      // Check demotion conditions
      if (rule.demoteWhenSpecificMatch && hasSpecificMatch) {
        shouldDemote = true;
      }

      if (rule.demoteWhenBpmRange) {
        const [minBpm, maxBpm] = rule.demoteWhenBpmRange;
        if (bpm >= minBpm && bpm <= maxBpm) {
          shouldDemote = true;
        }
      }

      if (shouldDemote) {
        prediction.confidence *= rule.factor;
      }
    }
  }

  // Sort by confidence descending
  refined.sort((a, b) => b.confidence - a.confidence);

  // Normalize confidences so top genre doesn't exceed 1.0
  const maxConfidence = refined[0]?.confidence || 1;
  if (maxConfidence > 1) {
    const normFactor = 1 / maxConfidence;
    refined = refined.map((p) => ({
      ...p,
      confidence: p.confidence * normFactor,
    }));
  }

  return refined;
}

/**
 * Generic parent genres that should be replaced by their specific subgenres
 */
const GENERIC_GENRES = new Set([
  'electronic',
  'rock',
  'pop',
  'hip hop',
  'dance',
  'experimental',
  'indie',
  'alternative',
]);

/**
 * Extract the most specific part of a genre string.
 * "Electronic - House" -> "House"
 * "Electronic - Experimental" -> "Experimental" (kept as-is since it's the only specific part)
 * "Rock - Alternative Rock" -> "Alternative Rock"
 */
export function extractSpecificGenre(genre: string): string {
  // Split by common separators
  const parts = genre.split(/\s*[-–—]\s*/);

  if (parts.length === 1) {
    return formatGenreName(genre);
  }

  // Find the most specific (non-generic) part
  // Prefer later parts as they tend to be more specific
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim().toLowerCase();
    if (!GENERIC_GENRES.has(part)) {
      return formatGenreName(parts[i]);
    }
  }

  // If all parts are generic, return the last one
  return formatGenreName(parts[parts.length - 1]);
}

/**
 * Format genre name with proper capitalization
 */
function formatGenreName(genre: string): string {
  return genre
    .trim()
    .split(/\s+/)
    .map((word) => {
      // Keep common acronyms/abbreviations uppercase
      if (['dj', 'edm', 'uk', 'dnb', 'd&b'].includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      // Handle "n" in "Drum n Bass"
      if (word.toLowerCase() === 'n' || word.toLowerCase() === '&') {
        return word.toLowerCase();
      }
      // Title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Get the top genres from refined predictions as string array.
 * Extracts specific subgenres and removes duplicates.
 */
export function getTopGenres(
  predictions: GenrePrediction[],
  count: number = 3,
  minConfidence: number = 0.05
): string[] {
  const validPredictions = predictions.filter((p) => p.confidence >= minConfidence);

  // Extract specific genres and track seen ones to avoid duplicates
  const seen = new Set<string>();
  const result: string[] = [];

  for (const p of validPredictions) {
    if (result.length >= count) break;

    const specific = extractSpecificGenre(p.genre);
    const normalizedKey = specific.toLowerCase();

    // Skip if we've already added this genre (or a very similar one)
    if (seen.has(normalizedKey)) continue;

    // Skip overly generic standalone genres if we already have specific ones
    if (GENERIC_GENRES.has(normalizedKey) && result.length > 0) continue;

    seen.add(normalizedKey);
    result.push(specific);
  }

  return result;
}

/**
 * Aggregate multiple genre predictions (from different segments) using median.
 * This provides more robust classification across the whole track.
 */
export function aggregateGenrePredictions(
  segmentPredictions: GenrePrediction[][]
): GenrePrediction[] {
  if (segmentPredictions.length === 0) return [];
  if (segmentPredictions.length === 1) return segmentPredictions[0];

  // Collect all genres and their confidences across segments
  const genreConfidences = new Map<string, number[]>();

  for (const segment of segmentPredictions) {
    for (const pred of segment) {
      const existing = genreConfidences.get(pred.genre) || [];
      existing.push(pred.confidence);
      genreConfidences.set(pred.genre, existing);
    }
  }

  // Calculate median confidence for each genre
  const aggregated: GenrePrediction[] = [];
  const numSegments = segmentPredictions.length;

  for (const [genre, confidences] of genreConfidences) {
    // Pad with zeros for segments where this genre wasn't detected
    while (confidences.length < numSegments) {
      confidences.push(0);
    }

    // Sort and get median
    confidences.sort((a, b) => a - b);
    const mid = Math.floor(confidences.length / 2);
    const median =
      confidences.length % 2 === 0
        ? (confidences[mid - 1] + confidences[mid]) / 2
        : confidences[mid];

    aggregated.push({ genre, confidence: median });
  }

  // Sort by confidence descending
  aggregated.sort((a, b) => b.confidence - a.confidence);

  return aggregated;
}
