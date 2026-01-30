import { basename } from 'path'
import {
  getLibraryTracksByIds,
  updateLibraryTrackAnalysisResults,
} from '../../utils/db'
import { renameTrackFile } from '../../utils/filename'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackId, recordingId, submitFingerprint = false } = body as {
    trackId: number
    recordingId: string
    submitFingerprint?: boolean
  }

  if (!trackId || !recordingId) {
    throw createError({
      statusCode: 400,
      message: 'trackId and recordingId are required',
    })
  }

  // Validate MusicBrainz ID format
  const mbidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!mbidRegex.test(recordingId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid MusicBrainz recording ID format',
    })
  }

  // Get track from library
  const tracks = getLibraryTracksByIds([trackId])
  if (tracks.length === 0) {
    throw createError({
      statusCode: 404,
      message: 'Track not found',
    })
  }

  const track = tracks[0]

  // Get analyzer URL from environment
  const analyzerUrl = process.env.ANALYZER_URL
  if (!analyzerUrl) {
    throw createError({
      statusCode: 500,
      message: 'ANALYZER_URL not configured',
    })
  }

  // Call analyzer to lookup metadata from MusicBrainz
  const lookupResponse = await fetch(`${analyzerUrl}/lookup/musicbrainz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording_id: recordingId }),
  })

  if (!lookupResponse.ok) {
    const error = await lookupResponse.text()
    throw createError({
      statusCode: lookupResponse.status,
      message: `MusicBrainz lookup failed: ${error}`,
    })
  }

  const metadata = await lookupResponse.json()

  if (!metadata.title) {
    throw createError({
      statusCode: 404,
      message: 'No metadata found for this MusicBrainz recording ID',
    })
  }

  // Update track with metadata
  const updateData: {
    artist?: string
    title?: string
    album?: string
    label?: string
    year?: number
    musicbrainz_id?: string
    file_path?: string
  } = {
    artist: metadata.artist,
    title: metadata.title,
    album: metadata.album,
    label: metadata.label,
    year: metadata.year,
    musicbrainz_id: recordingId,
  }

  // Rename file to standardized format if we have artist and title
  let renamed = false
  if (metadata.artist && metadata.title && track.file_path) {
    const newPath = renameTrackFile(track.file_path, metadata.artist, metadata.title)
    if (newPath !== track.file_path) {
      updateData.file_path = newPath
      renamed = true
    }
  }

  const updated = updateLibraryTrackAnalysisResults(track.fingerprint, updateData)

  if (!updated) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update track in database',
    })
  }

  // Optionally submit fingerprint to AcoustID
  let fingerprintSubmitted = false
  if (submitFingerprint && track.file_path) {
    const downloadsDir = process.env.DOWNLOADS_DIR || '/app/downloads'
    const analyzerInputDir = '/input'

    let analyzerFilePath = track.file_path
    if (analyzerFilePath.startsWith(downloadsDir)) {
      analyzerFilePath = analyzerFilePath.replace(downloadsDir, analyzerInputDir)
    }

    try {
      const submitResponse = await fetch(`${analyzerUrl}/submit/fingerprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: analyzerFilePath,
          musicbrainz_id: recordingId,
        }),
      })

      if (submitResponse.ok) {
        const submitResult = await submitResponse.json()
        fingerprintSubmitted = submitResult.success
      }
    }
    catch (e) {
      console.error('Fingerprint submission error:', e)
    }
  }

  return {
    success: true,
    track: {
      id: track.id,
      artist: metadata.artist,
      title: metadata.title,
      album: metadata.album,
      label: metadata.label,
      year: metadata.year,
      musicbrainz_id: recordingId,
    },
    renamed,
    newFilename: renamed ? basename(updateData.file_path!) : null,
    fingerprintSubmitted,
  }
})
