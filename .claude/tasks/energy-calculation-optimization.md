# Energy Calculation Optimization

**Status:** Planned
**Priority:** Low
**Created:** 2026-01-30

## Current Implementation

Uses Essentia's emomusic arousal model (MSD-MusiCNN + emomusic classification head) which predicts arousal on a 1-9 scale. Simple and relies on pre-trained ML model.

## Proposed Enhancement

Build a custom energy calculator combining multiple audio features for more control and tunability.

---

## Phase 1: Feature Extraction

Extract these core audio features per track (or per segment for more granularity):

### Loudness & Dynamics
- Integrated loudness (RMS or LUFS approximation)
- Dynamic range / loudness range
- Peak-to-average ratio

### Spectral Characteristics
- Spectral centroid (brightness)
- Spectral flux (rate of change)
- Spectral energy bands (low/mid/high ratios)
- High-frequency content (HFC)

### Rhythmic Features
- BPM (already have this)
- Onset rate / onset density
- Beat loudness / accent strength
- Danceability if available in Essentia.js

### Tonal/Harmonic
- Dissonance
- Key strength (weaker key = often more chaotic/energetic in electronic music)

---

## Phase 2: Segmentation Strategy

Rather than whole-track analysis, consider:
- Split track into 30-second segments
- Calculate features per segment
- Use the **peak segment** or **average of top quartile** for final energy — this captures drops/climaxes better than full-track averaging

---

## Phase 3: Normalisation

Each feature operates on different scales, so:
- Collect feature values across your entire library first
- Calculate min/max or percentile ranges (using 5th-95th percentile avoids outliers)
- Normalise each feature to 0-1 scale

---

## Phase 4: Weighted Combination

Combine normalised features with weights tuned to your taste:

```javascript
const weights = {
  loudness: 0.25,
  spectralCentroid: 0.15,
  spectralFlux: 0.15,
  onsetRate: 0.20,
  hfc: 0.10,
  bpmNormalised: 0.10,
  dissonance: 0.05
}

const energy = Object.entries(weights).reduce((sum, [feature, weight]) => {
  return sum + (normalisedFeatures[feature] * weight)
}, 0)

// Scale to 1-10
const energyLevel = Math.round(energy * 9) + 1
```

---

## Phase 5: Calibration & Tuning

1. **Reference tracks** — Pick 10-20 tracks you'd manually rate at different energy levels (2, 4, 6, 8, 10)
2. **Compare outputs** — Run your algorithm and compare to your intuition
3. **Adjust weights** — If ambient tracks score too high, reduce BPM weight; if aggressive tracks score low, increase spectral flux or HFC
4. **Genre-aware tuning** (optional) — Different weight presets for DnB vs house vs techno

---

## Phase 6: Implementation Order

1. Get basic extraction working for loudness + spectral centroid + onset rate
2. Test on 20 tracks, sense-check results
3. Add remaining features incrementally
4. Build normalisation pass across full library
5. Implement weighted scoring
6. Calibrate with reference tracks
7. Add segmentation for better accuracy on tracks with big dynamic shifts

---

## Notes

- This approach gives more control than the ML model but requires calibration
- Could potentially combine: use ML arousal as one input feature alongside extracted features
- Consider storing raw feature values in DB for later recalculation without re-analysis
