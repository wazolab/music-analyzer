import { getLibraryTracksByIds, setLibrarySetting } from '../../utils/db'
import { publishTracks } from '../../utils/publish'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackIds, destinationRoot, storageDevice, deleteSource = false } = body as {
    trackIds: number[]
    destinationRoot: string
    storageDevice: string
    deleteSource?: boolean
  }

  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'trackIds is required and must be a non-empty array',
    })
  }

  if (!destinationRoot) {
    throw createError({
      statusCode: 400,
      message: 'destinationRoot is required (e.g., /media/user/SSD/Music)',
    })
  }

  if (!storageDevice) {
    throw createError({
      statusCode: 400,
      message: 'storageDevice is required (e.g., "Music-SSD")',
    })
  }

  // Get tracks from database
  const tracks = getLibraryTracksByIds(trackIds)

  if (tracks.length === 0) {
    throw createError({
      statusCode: 404,
      message: 'No tracks found with the provided IDs',
    })
  }

  // Filter to only analyzed tracks
  const analyzedTracks = tracks.filter(t => t.analysis_status === 'analyzed')

  if (analyzedTracks.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'All selected tracks must be analyzed before publishing',
    })
  }

  console.log(`[Publish] Publishing ${analyzedTracks.length} tracks to ${destinationRoot} (device: ${storageDevice})`)

  // Publish tracks
  const result = await publishTracks({
    tracks: analyzedTracks,
    destinationRoot,
    storageDevice,
    deleteSource,
  })

  // Save library root as setting for future reference
  setLibrarySetting('library_root', destinationRoot)
  setLibrarySetting('storage_device_name', storageDevice)

  console.log(`[Publish] Complete: ${result.success} published, ${result.errors.length} errors`)

  return {
    success: result.success,
    errors: result.errors,
    published: result.published,
    skipped: tracks.length - analyzedTracks.length,
  }
})
