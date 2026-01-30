import { basename } from 'path'
import type { H3Event } from 'h3'
import {
  createAnalysisJob,
  updateAnalysisJobStatus,
  updateAnalysisJobProgress,
  updateAnalysisJobLogs,
  addTrackNeedingLink,
  matchAndUpdateTrackAnalysis,
  getLibraryTracksByIds,
  updateLibraryTrackAnalysisStatus,
  updateLibraryTrackAnalysisResults,
} from '../../utils/db'
import { renameTrackFile } from '../../utils/filename'
import type { LibraryTrack } from '../../utils/types'

// Store running job IDs for cancellation
const runningJobs = new Set<number>()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackIds, forceReanalyze = false } = body as { trackIds: number[], forceReanalyze?: boolean }

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'trackIds array is required',
    })
  }

  // Get tracks from library_tracks
  const tracks = getLibraryTracksByIds(trackIds)
  if (tracks.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No valid tracks found',
    })
  }

  // Filter tracks that have file paths
  const tracksWithFiles = tracks.filter(t => t.file_path)
  if (tracksWithFiles.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No tracks with valid file paths found',
    })
  }

  // Get analyzer URL from environment
  const analyzerUrl = process.env.ANALYZER_URL
  if (!analyzerUrl) {
    throw createError({
      statusCode: 500,
      message: 'ANALYZER_URL not configured',
    })
  }

  // Create job in database
  const job = createAnalysisJob('/tmp/analysis')

  // Store original status for each track (to restore on cancel)
  const originalStatus = new Map<number, string>()
  for (const track of tracksWithFiles) {
    originalStatus.set(track.id, track.analysis_status || 'pending')
  }

  // Mark tracks as analyzing
  for (const track of tracksWithFiles) {
    updateLibraryTrackAnalysisStatus(track.id, 'analyzing')
  }

  // Update job status to running
  updateAnalysisJobStatus(job.id, 'running')
  updateAnalysisJobProgress(job.id, 0, 0, tracksWithFiles.length)

  // Mark job as running
  runningJobs.add(job.id)

  // Process tracks in background
  processTracksAsync(
    job.id,
    tracksWithFiles,
    analyzerUrl,
    forceReanalyze,
    originalStatus,
  )

  return {
    job,
    message: 'Analysis started',
    trackCount: tracksWithFiles.length,
  }
})

async function processTracksAsync(
  jobId: number,
  tracks: LibraryTrack[],
  analyzerUrl: string,
  forceReanalyze: boolean,
  originalStatus: Map<number, string>,
) {
  let completed = 0
  let failed = 0
  const logs: string[] = []

  function addLog(line: string) {
    logs.push(line)
    if (logs.length > 50) logs.shift()
    updateAnalysisJobLogs(jobId, logs.join('\n'))
  }

  addLog(`Starting analysis of ${tracks.length} tracks`)
  addLog(`Analyzer service: ${analyzerUrl}`)

  // Map downloads path to analyzer input path
  const downloadsDir = process.env.DOWNLOADS_DIR || '/app/downloads'
  const analyzerInputDir = '/input'

  for (const track of tracks) {
    // Check if job was cancelled
    if (!runningJobs.has(jobId)) {
      addLog('Job cancelled')
      // Restore original status for all tracks (they were all marked as 'analyzing')
      for (const t of tracks) {
        const original = originalStatus.get(t.id) || 'pending'
        updateLibraryTrackAnalysisStatus(t.id, original as any)
      }
      return
    }

    const filename = basename(track.file_path!)
    updateAnalysisJobStatus(jobId, 'running', filename)
    addLog(`Analyzing: ${filename}`)

    try {
      // Map file path from UI container to analyzer container
      // UI sees: /app/downloads/file.flac
      // Analyzer sees: /input/file.flac
      let analyzerFilePath = track.file_path!
      if (analyzerFilePath.startsWith(downloadsDir)) {
        analyzerFilePath = analyzerFilePath.replace(downloadsDir, analyzerInputDir)
      }

      // Only allow skipping if the DB already has analysis data for this track
      // Otherwise we need to analyze even if FLAC tags exist (to populate DB)
      const trackHasData = !!(track.bpm && track.key_notation && track.energy)
      const shouldSkip = !forceReanalyze && trackHasData

      const response = await fetch(`${analyzerUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: analyzerFilePath,
          write_tags: true,
          metadata_lookup: true,
          convert: true,
          skip_analyzed: shouldSkip,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Analyzer returned ${response.status}: ${error}`)
      }

      // Check if job was cancelled while we were waiting for analyzer
      if (!runningJobs.has(jobId)) {
        // Restore this track's status since we're aborting
        const original = originalStatus.get(track.id) || 'pending'
        updateLibraryTrackAnalysisStatus(track.id, original as any)
        addLog('Job cancelled')
        return
      }

      const result = await response.json()

      // Check if skipped (only happens if we set skip_analyzed AND track was analyzed)
      if (result.skipped) {
        addLog(`⏭ Skipped: ${filename} (already analyzed)`)
        completed++
        updateAnalysisJobProgress(jobId, completed, failed, tracks.length)
        // Only mark as analyzed if we actually have data
        if (trackHasData) {
          updateLibraryTrackAnalysisStatus(track.id, 'analyzed')
        }
        continue
      }

      // Update library_tracks with analysis results
      const updateData: any = {
        artist: result.artist,
        title: result.title,
        album: result.album,
        label: result.label,
        year: result.year,
        bpm: result.bpm,
        key_notation: result.key,
        energy: result.energy,
        genres: result.genres,
        musicbrainz_id: result.musicbrainz_id,
      }

      // Rename file to standardized format if we have artist and title
      if (result.artist && result.title && track.file_path) {
        const newPath = renameTrackFile(track.file_path, result.artist, result.title)
        if (newPath !== track.file_path) {
          updateData.file_path = newPath
          addLog(`Renamed: ${filename} -> ${basename(newPath)}`)
        }
      }

      updateLibraryTrackAnalysisResults(track.fingerprint, updateData)
      updateLibraryTrackAnalysisStatus(track.id, 'analyzed')

      addLog(`✔ ${result.artist} - ${result.title} (BPM:${result.bpm} Key:${result.key} Energy:${result.energy})`)

      // Log debug info if available
      if (result.debug) {
        addLog(`[DEBUG] Parsed: ${result.debug.parsed_artist} - ${result.debug.parsed_title}`)
        if (result.debug.metadata_result) {
          const meta = result.debug.metadata_result
          if (meta.title) {
            addLog(`[DEBUG] Metadata found: ${meta.artist} - ${meta.title} (confidence: ${(meta.confidence * 100).toFixed(0)}%)`)
            if (meta.album) addLog(`[DEBUG]   Album: ${meta.album}`)
            if (meta.label) addLog(`[DEBUG]   Label: ${meta.label}`)
            if (meta.year) addLog(`[DEBUG]   Year: ${meta.year}`)
          }
          else {
            // No metadata found - track it for user notification
            if (result.debug.fingerprint_found) {
              // Track needs manual MusicBrainz linking
              addTrackNeedingLink(jobId, { filename, trackId: track.id })
            }
          }
        }
      }

      // Also update matching tracks in playlists
      if (result.artist && result.title && result.genres) {
        const updated = matchAndUpdateTrackAnalysis(result.artist, result.title, {
          bpm: result.bpm,
          key_notation: result.key,
          energy: result.energy,
          tags: result.genres,
        })
        if (updated > 0) {
          addLog(`Updated ${updated} playlist track(s)`)
        }
      }

      completed++
      updateAnalysisJobProgress(jobId, completed, failed, tracks.length)
    }
    catch (e: any) {
      failed++
      addLog(`✗ Failed: ${filename} - ${e.message}`)
      updateAnalysisJobProgress(jobId, completed, failed, tracks.length)
      updateLibraryTrackAnalysisStatus(track.id, 'failed')
    }
  }

  // Job complete
  runningJobs.delete(jobId)

  if (failed === tracks.length) {
    updateAnalysisJobStatus(jobId, 'failed')
    addLog('Analysis failed - all tracks failed')
  }
  else {
    updateAnalysisJobStatus(jobId, 'completed')
    addLog(`Analysis complete: ${completed} succeeded, ${failed} failed`)
  }
}

// Export for cancellation
export function cancelJob(jobId: number): boolean {
  if (runningJobs.has(jobId)) {
    runningJobs.delete(jobId)
    return true
  }
  return false
}

export { runningJobs }
