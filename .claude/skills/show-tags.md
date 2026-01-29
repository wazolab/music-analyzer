# Show FLAC Tags

Display all tags written to a FLAC file after analysis.

## Usage

```
/show-tags <path-to-flac>
```

## Instructions

1. Read and display tags using Node.js:
   ```javascript
   const mm = require('music-metadata');

   async function showTags(filePath) {
     const m = await mm.parseFile(filePath);
     console.log('=== Standard Tags ===');
     console.log('Title:', m.common.title);
     console.log('Artist:', m.common.artist);
     console.log('Album:', m.common.album);
     console.log('Year:', m.common.year);
     console.log('Genre:', m.common.genre?.join(', '));
     console.log('');
     console.log('=== Analysis Tags ===');
     console.log('BPM:', m.common.bpm);
     console.log('Key:', m.common.key);
     console.log('Label:', m.common.label?.join(', '));
     console.log('MusicBrainz ID:', m.common.musicbrainz_trackid);
   }
   showTags('<path>');
   ```

2. Format output as a table
