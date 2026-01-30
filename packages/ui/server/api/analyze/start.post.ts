import { spawn } from 'child_process'
import {
  createAnalysisJob,
  setAnalysisJobFiles,
  updateAnalysisJobStatus,
  updateAnalysisJobProgress,
  updateAnalysisJobLogs,
  getDownloadFileById,
  updateDownloadFileStatus,
  updateDownloadFileAnalysis,
  matchAndUpdateTrackAnalysis
} from '../../utils/db'

// Store running processes for cancellation
const runningJobs = new Map<number, ReturnType<typeof spawn>>()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fileIds } = body as { fileIds: number[] }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'fileIds array is required'
    })
  }

  // Create job in database (output dir not needed for genre-only analysis)
  const job = createAnalysisJob('/tmp/analysis')
  setAnalysisJobFiles(job.id, fileIds)

  // Get file paths
  const files = fileIds.map(id => getDownloadFileById(id)).filter(Boolean)
  if (files.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No valid files found'
    })
  }

  // For docker-in-docker, we need the HOST path (not the container path)
  // HOST_DOWNLOADS_DIR is passed from docker-compose with the actual host path
  const hostDownloadsDir = process.env.HOST_DOWNLOADS_DIR
  if (!hostDownloadsDir) {
    throw createError({
      statusCode: 500,
      message: 'HOST_DOWNLOADS_DIR not configured. Cannot run analyzer.'
    })
  }

  // Start the analyzer via docker run
  // Mount as read-write to allow tag writing
  const args = [
    'run', '--rm',
    '--name', `analyzer-job-${job.id}`,
    '-v', `${hostDownloadsDir}:/input`,
    'music-analyzer',
    '--write-tags',
    '/input'
  ]

  console.log(`Starting analysis job ${job.id}: docker ${args.join(' ')}`)

  const proc = spawn('docker', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  runningJobs.set(job.id, proc)

  // Update job status to running
  updateAnalysisJobStatus(job.id, 'running')

  let completed = 0
  let failed = 0
  let totalFiles = 0
  let currentFile = ''
  const logs: string[] = []

  // Helper to add log and update job
  function addLog(line: string) {
    // Clean up the line
    const cleanLine = line.trim()
    if (!cleanLine) return

    logs.push(cleanLine)
    // Keep only last 50 log lines
    if (logs.length > 50) logs.shift()

    // Update job with latest logs
    updateAnalysisJobLogs(job.id, logs.join('\n'))
  }

  // Parse output for progress (both stdout and stderr - CLI uses both)
  function parseOutput(output: string, isError: boolean) {
    const lines = output.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      // Log everything for visibility
      addLog(line)

      // Match "Found X FLAC files"
      const foundMatch = line.match(/Found (\d+) FLAC files?/i)
      if (foundMatch && foundMatch[1]) {
        totalFiles = parseInt(foundMatch[1], 10)
        updateAnalysisJobProgress(job.id, completed, failed, totalFiles)
      }

      // Match processing file (various formats)
      // "Processing: filename.flac" or "[1/10] filename.flac" or "Analyzing filename.flac"
      const fileMatch = line.match(/(?:Processing|Analyzing)[:\s]+(.+\.flac)/i) ||
                        line.match(/\[(\d+)\/(\d+)\]\s*(.+\.flac)/i)
      if (fileMatch) {
        if (fileMatch[3]) {
          // Format: [1/10] filename.flac
          completed = parseInt(fileMatch[1] || '0', 10)
          totalFiles = parseInt(fileMatch[2] || '0', 10)
          currentFile = fileMatch[3]
        } else if (fileMatch[1]) {
          currentFile = fileMatch[1]
        }
        updateAnalysisJobStatus(job.id, 'running', currentFile)
      }

      // Match completion markers
      // "✔ Processed filename.flac" or "Done: filename.flac"
      const doneMatch = line.match(/[✔✓]\s*(?:Processed|Done|Completed)/i) ||
                        line.match(/Successfully (?:processed|analyzed)/i)
      if (doneMatch) {
        completed++
        updateAnalysisJobProgress(job.id, completed, failed, totalFiles)
      }

      // Match "Total files processed: X"
      const summaryMatch = line.match(/Total files processed:\s*(\d+)/i)
      if (summaryMatch && summaryMatch[1]) {
        completed = parseInt(summaryMatch[1], 10)
        updateAnalysisJobProgress(job.id, completed, failed, totalFiles)
      }

      // Match errors (but not TensorFlow info messages)
      if (isError && !line.includes('tensorflow') && !line.includes('oneDNN')) {
        if (line.match(/error|failed|exception/i) && !line.match(/^[✔✓-]/)) {
          failed++
          updateAnalysisJobProgress(job.id, completed, failed, totalFiles)
        }
      }

      // Try to parse JSON output for analysis results
      // Format: __RESULT__: {"artist": "...", "title": "...", "genres": [...], "file": "..."}
      if (line.includes('__RESULT__:')) {
        try {
          const jsonStr = line.split('__RESULT__:')[1].trim()
          const result = JSON.parse(jsonStr)
          if (result.file) {
            // Update download_file by matching filename
            const downloadFile = files.find(f => f?.filename === result.file)
            if (downloadFile) {
              updateDownloadFileAnalysis(downloadFile.id, {
                genres: result.genres,
                artist: result.artist,
                title: result.title,
                bpm: result.bpm,
                key_notation: result.key,
                energy: result.energy
              })
              console.log(`[Job ${job.id}] Updated download file: ${result.file} -> BPM:${result.bpm} Key:${result.key} Energy:${result.energy}`)
            }
          }
          if (result.genres) {
            // Also update matching tracks in playlists
            if (result.artist && result.title) {
              const updated = matchAndUpdateTrackAnalysis(result.artist, result.title, {
                tags: result.genres
              })
              if (updated > 0) {
                console.log(`[Job ${job.id}] Updated ${updated} track(s): ${result.artist} - ${result.title}`)
              }
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Legacy: Try to parse old JSON format with bpm/key
      if (line.includes('"bpm"') || line.includes('"key"')) {
        try {
          const jsonMatch = line.match(/\{[^{}]*"bpm"[^{}]*\}/g)
          if (jsonMatch) {
            for (const jsonStr of jsonMatch) {
              try {
                const result = JSON.parse(jsonStr)
                if (result.artist && result.title) {
                  matchAndUpdateTrackAnalysis(result.artist, result.title, {
                    bpm: result.bpm,
                    key_notation: result.camelotKey || result.key,
                    energy: result.energy,
                    tags: result.genres
                  })
                }
              } catch {
                // Not valid JSON, ignore
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  proc.stdout?.on('data', (data: Buffer) => {
    const output = data.toString()
    console.log(`[Job ${job.id}] ${output}`)
    parseOutput(output, false)
  })

  proc.stderr?.on('data', (data: Buffer) => {
    const output = data.toString()
    console.error(`[Job ${job.id}] ${output}`)
    parseOutput(output, true)
  })

  proc.on('exit', (code) => {
    runningJobs.delete(job.id)

    if (code === 0) {
      updateAnalysisJobStatus(job.id, 'completed')
      // Mark all files as completed
      for (const file of files) {
        if (file) {
          updateDownloadFileStatus(file.id, 'completed')
        }
      }
    } else if (code === null) {
      // Process was killed (cancelled)
      updateAnalysisJobStatus(job.id, 'cancelled')
    } else {
      updateAnalysisJobStatus(job.id, 'failed')
    }

    console.log(`[Job ${job.id}] Finished with code ${code}`)
  })

  return {
    job,
    message: 'Analysis started'
  }
})

// Export for cancellation
export { runningJobs }
