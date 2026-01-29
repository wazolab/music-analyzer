# Analyze Music Folder

Analyze FLAC files in a folder, extract audio features, and organize by year/genre/label.

## Usage

```
/analyze <input-folder> [output-folder]
```

## Instructions

1. Build the project if dist/ is outdated:
   ```bash
   npm run build
   ```

2. Run the analyzer:
   ```bash
   node dist/index.js analyze <input-folder> -o <output-folder>
   ```

   If output folder not specified, use `./output`

3. Common options:
   - `--dry-run` - Preview without copying
   - `--skip-lookup` - Skip MusicBrainz (faster)
   - `--skip-analysis` - Only organize by existing tags

4. Show summary of results after completion
