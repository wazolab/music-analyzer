import { unlink } from 'fs/promises'
import { getLibraryTracksByIds, deleteLibraryTrack } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackIds } = body as { trackIds: number[] }

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'trackIds array is required',
    })
  }

  const tracks = getLibraryTracksByIds(trackIds)

  let deleted = 0
  let failed = 0
  const errors: string[] = []

  for (const track of tracks) {
    try {
      // Delete file if it exists
      if (track.file_path) {
        try {
          await unlink(track.file_path)
        }
        catch (e: any) {
          // File might already be deleted or moved
          if (e.code !== 'ENOENT') {
            console.warn(`Failed to delete file ${track.file_path}:`, e.message)
          }
        }
      }

      // Delete from database
      deleteLibraryTrack(track.id)
      deleted++
    }
    catch (e: any) {
      failed++
      errors.push(`${track.artist || 'Unknown'} - ${track.title || track.file_path}: ${e.message}`)
    }
  }

  return {
    deleted,
    failed,
    errors,
  }
})
