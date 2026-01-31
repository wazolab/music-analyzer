import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import {
  getLibraryTrackByFingerprint,
  upsertLibraryTrackFromScan,
  setDriveScanPath,
} from '../../utils/db'
import { needsConversion, convertToFlac } from '../../utils/converter'
import type { LibraryTrack, TrackSource } from '../../utils/types'

// All supported audio formats (FLAC native + convertible formats)
const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.m4a', '.aac', '.wav', '.aiff', '.ogg', '.opus', '.wma']

interface ScanResult {
  found: number
  matched: number
  new: number
  converted: number
  needsAnalysis: number
  errors: string[]
  tracks: LibraryTrack[]
}

async function readFingerprintFromFlac(filePath: string): Promise<{ fingerprint: string | null, duration: number | null }> {
  return new Promise((resolve) => {
    // Try to read ACOUSTID_FINGERPRINT tag using metaflac
    const proc = spawn('metaflac', ['--show-tag=ACOUSTID_FINGERPRINT', '--show-tag=ACOUSTID_FINGERPRINT_DURATION', filePath])

    let output = ''
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve({ fingerprint: null, duration: null })
        return
      }

      let fingerprint: string | null = null
      let duration: number | null = null

      for (const line of output.split('\n')) {
        if (line.startsWith('ACOUSTID_FINGERPRINT=')) {
          fingerprint = line.replace('ACOUSTID_FINGERPRINT=', '').trim()
        }
        if (line.startsWith('ACOUSTID_FINGERPRINT_DURATION=')) {
          const durStr = line.replace('ACOUSTID_FINGERPRINT_DURATION=', '').trim()
          duration = parseInt(durStr, 10) || null
        }
      }

      resolve({ fingerprint, duration })
    })

    proc.on('error', () => {
      resolve({ fingerprint: null, duration: null })
    })
  })
}

async function generateFingerprint(filePath: string): Promise<{ fingerprint: string | null, duration: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('fpcalc', ['-json', filePath])

    let output = ''
    proc.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    proc.on('exit', (code) => {
      if (code !== 0) {
        resolve({ fingerprint: null, duration: null })
        return
      }

      try {
        const data = JSON.parse(output)
        resolve({
          fingerprint: data.fingerprint || null,
          duration: data.duration ? Math.round(data.duration) : null,
        })
      }
      catch {
        resolve({ fingerprint: null, duration: null })
      }
    })

    proc.on('error', () => {
      resolve({ fingerprint: null, duration: null })
    })
  })
}

// Write fingerprint to FLAC tags for faster future scans
async function writeFingerprintToFlac(filePath: string, fingerprint: string, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn('metaflac', [
      '--remove-tag=ACOUSTID_FINGERPRINT',
      '--remove-tag=ACOUSTID_FINGERPRINT_DURATION',
      `--set-tag=ACOUSTID_FINGERPRINT=${fingerprint}`,
      `--set-tag=ACOUSTID_FINGERPRINT_DURATION=${duration}`,
      filePath,
    ])

    proc.on('exit', () => resolve())
    proc.on('error', () => resolve())
  })
}

async function scanDirectory(
  dir: string,
  source: TrackSource,
  storageDevice?: string,
  recursive: boolean = true,
): Promise<ScanResult> {
  const result: ScanResult = {
    found: 0,
    matched: 0,
    new: 0,
    converted: 0,
    needsAnalysis: 0,
    errors: [],
    tracks: [],
  }

  if (!existsSync(dir)) {
    result.errors.push(`Directory does not exist: ${dir}`)
    return result
  }

  const filesToProcess: string[] = []

  async function collectFiles(currentDir: string) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name)

        if (entry.isDirectory() && recursive) {
          await collectFiles(fullPath)
        }
        else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (AUDIO_EXTENSIONS.includes(ext)) {
            filesToProcess.push(fullPath)
          }
        }
      }
    }
    catch (e) {
      result.errors.push(`Error scanning ${currentDir}: ${e}`)
    }
  }

  await collectFiles(dir)
  result.found = filesToProcess.length

  // Process each file
  for (const filePath of filesToProcess) {
    try {
      let actualPath = filePath

      // Convert non-FLAC files to FLAC first
      if (needsConversion(filePath)) {
        console.log(`[Library Scan] Converting to FLAC: ${basename(filePath)}`)
        const conversionResult = await convertToFlac(filePath, true, true)
        if (!conversionResult.success) {
          result.errors.push(`Failed to convert ${basename(filePath)}: ${conversionResult.message}`)
          continue
        }
        actualPath = conversionResult.path
        result.converted++
      }

      // First try to read fingerprint from FLAC tags (instant)
      let { fingerprint, duration } = await readFingerprintFromFlac(actualPath)
      let wasGenerated = false

      // If not in tags, generate it (1-2 seconds)
      if (!fingerprint) {
        console.log(`[Library Scan] Generating fingerprint for: ${basename(actualPath)}`)
        const generated = await generateFingerprint(actualPath)
        fingerprint = generated.fingerprint
        duration = generated.duration
        wasGenerated = true
      }

      if (!fingerprint || !duration) {
        result.errors.push(`Could not get fingerprint for: ${actualPath}`)
        continue
      }

      // Write fingerprint to FLAC tags if we just generated it (for faster future scans)
      if (wasGenerated) {
        await writeFingerprintToFlac(actualPath, fingerprint, duration)
      }

      // Check if track exists in library
      const existing = getLibraryTrackByFingerprint(fingerprint)

      if (existing) {
        // Track already in library - update path if changed
        const track = upsertLibraryTrackFromScan({
          fingerprint,
          fingerprint_duration: duration,
          file_path: actualPath,
          source,
          storage_device: storageDevice,
        })

        result.matched++
        result.tracks.push(track)

        // Check if it needs analysis
        if (track.analysis_status !== 'analyzed') {
          result.needsAnalysis++
        }

        if (existing.file_path !== actualPath) {
          console.log(`[Library Scan] Updated path for: ${existing.artist || 'Unknown'} - ${existing.title || basename(actualPath)}`)
        }
      }
      else {
        // New track - add to library with pending analysis status
        const stats = await stat(actualPath)

        const track = upsertLibraryTrackFromScan({
          fingerprint,
          fingerprint_duration: duration,
          file_path: actualPath,
          file_size_bytes: stats.size,
          source,
          storage_device: storageDevice,
        })

        result.new++
        result.needsAnalysis++
        result.tracks.push(track)
        console.log(`[Library Scan] Added new track (pending analysis): ${basename(actualPath)}`)
      }
    }
    catch (e) {
      result.errors.push(`Error processing ${filePath}: ${e}`)
    }
  }

  return result
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { path, storageDevice, recursive = true, source = 'external' } = body as {
    path: string
    storageDevice?: string
    recursive?: boolean
    source?: TrackSource
  }

  if (!path) {
    throw createError({
      statusCode: 400,
      message: 'path is required',
    })
  }

  // Determine source based on path if not explicitly set
  const trackSource: TrackSource = source === 'downloads' || path.includes('/downloads') ? 'downloads' : 'external'

  console.log(`[Library Scan] Starting scan of: ${path} (source: ${trackSource}${storageDevice ? `, device: ${storageDevice}` : ''})`)

  const result = await scanDirectory(path, trackSource, storageDevice, recursive)

  // Save scan path per drive for future reference
  if (storageDevice) {
    setDriveScanPath(storageDevice, path)
  }

  console.log(`[Library Scan] Complete: ${result.found} found, ${result.converted} converted, ${result.matched} matched, ${result.new} new, ${result.needsAnalysis} need analysis`)

  return result
})
