import { stat } from 'fs/promises'
import { getDownloadFileById, upsertLibraryTrack } from '../../utils/db'
import type { LibraryTrack } from '../../utils/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fileIds } = body as { fileIds: number[] }

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'fileIds array is required',
    })
  }

  const added: LibraryTrack[] = []
  const errors: { id: number, error: string }[] = []

  for (const fileId of fileIds) {
    const file = getDownloadFileById(fileId)

    if (!file) {
      errors.push({ id: fileId, error: 'File not found' })
      continue
    }

    if (!file.fingerprint) {
      errors.push({ id: fileId, error: 'File has no fingerprint - analysis may not have completed' })
      continue
    }

    // Get file size
    let fileSize: number | null = file.size_bytes
    if (!fileSize && file.path) {
      try {
        const stats = await stat(file.path)
        fileSize = stats.size
      }
      catch {
        // File might not be accessible
      }
    }

    // Parse genres from JSON string
    let genres: string[] | undefined
    if (file.genres) {
      try {
        genres = JSON.parse(file.genres)
      }
      catch {
        genres = [file.genres]
      }
    }

    // Upsert into library
    const track = upsertLibraryTrack({
      fingerprint: file.fingerprint,
      fingerprint_duration: file.fingerprint_duration || 0,
      artist: file.artist || undefined,
      title: file.title || undefined,
      album: file.album || undefined,
      label: file.label || undefined,
      year: file.year || undefined,
      bpm: file.bpm || undefined,
      key_notation: file.key_notation || undefined,
      energy: file.energy || undefined,
      genres,
      file_path: file.path,
      file_size_bytes: fileSize || undefined,
    })

    added.push(track)
  }

  return {
    added: added.length,
    errors: errors.length,
    tracks: added,
    errorDetails: errors,
  }
})
