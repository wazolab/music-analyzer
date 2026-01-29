# Check System Status

Verify all dependencies are installed and configured.

## Instructions

1. Run the status command:
   ```bash
   cd ~/Documents/sources/music-analyzer && node dist/index.js status
   ```

2. If dependencies are missing, provide installation commands:
   - ffmpeg: `sudo apt install ffmpeg`
   - fpcalc: `sudo apt install libchromaprint-tools`
   - AcoustID key: Edit `.env` file

3. Check if models are downloaded:
   ```bash
   ls -la ~/Documents/sources/music-analyzer/models/
   ```
