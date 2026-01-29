# Test Single Track Analysis

Analyze a single FLAC file and display detailed results.

## Usage

```
/test-track <path-to-flac>
```

## Instructions

1. Build if needed:
   ```bash
   npm run build
   ```

2. Run analysis on the track using Node.js:
   ```javascript
   const { analyzeAudio } = require('./dist/analyzers/audio.js');

   async function test() {
     const result = await analyzeAudio('<path-to-flac>');
     console.log('BPM:', result.bpm);
     console.log('Key:', result.key, '(' + result.camelotKey + ')');
     console.log('Energy:', Math.round(result.energy * 100) + '%');
     console.log('Genres:', result.genres.join(', ') || 'None detected');
     console.log('Beat grid:', result.beatGrid.beatPositions.length, 'beats');
   }
   test();
   ```

3. Display results in a formatted table
