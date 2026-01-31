import {
  getLibraryTrackById,
  updateLibraryTrackMetadata,
} from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Track ID is required',
    })
  }

  const trackId = parseInt(id, 10)
  const track = getLibraryTrackById(trackId)

  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found',
    })
  }

  const body = await readBody(event)
  const {
    artist,
    title,
    album,
    label,
    year,
    bpm,
    key_notation,
    energy,
    genres,
  } = body as {
    artist?: string
    title?: string
    album?: string
    label?: string
    year?: number | null
    bpm?: number | null
    key_notation?: string | null
    energy?: number | null
    genres?: string[]
  }

  // Validate energy range
  if (energy !== undefined && energy !== null && (energy < 1 || energy > 10)) {
    throw createError({
      statusCode: 400,
      message: 'Energy must be between 1 and 10',
    })
  }

  // Validate BPM
  if (bpm !== undefined && bpm !== null && bpm < 0) {
    throw createError({
      statusCode: 400,
      message: 'BPM must be positive',
    })
  }

  // Update database
  const updatedTrack = updateLibraryTrackMetadata(trackId, {
    artist,
    title,
    album,
    label,
    year,
    bpm,
    key_notation,
    energy,
    genres,
  })

  if (!updatedTrack) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update track',
    })
  }

  // Write tags to file if track has a file path
  let fileUpdated = false
  if (updatedTrack.file_path) {
    const analyzerUrl = process.env.ANALYZER_URL
    if (analyzerUrl) {
      // Convert file path for analyzer container
      const downloadsDir = process.env.DOWNLOADS_DIR || '/app/downloads'
      const libraryDir = process.env.LIBRARY_DIR || '/app/library'
      const analyzerInputDir = '/input'
      const analyzerLibraryDir = '/library'

      let analyzerFilePath = updatedTrack.file_path
      if (analyzerFilePath.startsWith(downloadsDir)) {
        analyzerFilePath = analyzerFilePath.replace(downloadsDir, analyzerInputDir)
      }
      else if (analyzerFilePath.startsWith(libraryDir)) {
        analyzerFilePath = analyzerFilePath.replace(libraryDir, analyzerLibraryDir)
      }

      try {
        const response = await fetch(`${analyzerUrl}/tags/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: analyzerFilePath,
            artist: updatedTrack.artist,
            title: updatedTrack.title,
            album: updatedTrack.album,
            label: updatedTrack.label,
            year: updatedTrack.year,
            bpm: updatedTrack.bpm,
            key: updatedTrack.key_notation,
            energy: updatedTrack.energy,
            genres: updatedTrack.genres ? JSON.parse(updatedTrack.genres) : undefined,
          }),
        })

        if (response.ok) {
          const result = await response.json()
          fileUpdated = result.success
        }
        else {
          console.error('Failed to write tags to file:', await response.text())
        }
      }
      catch (e) {
        console.error('Error writing tags to file:', e)
      }
    }
  }

  return {
    success: true,
    track: updatedTrack,
    fileUpdated,
  }
})
