import { access, mkdir, constants } from 'fs/promises'
import { dirname } from 'path'
import { getLibraryTracksByIds, setDriveLibraryRoot } from '../../utils/db'
import { publishTracks } from '../../utils/publish'

/**
 * Check if we have write access to a directory (or its parent)
 */
async function checkWriteAccess(path: string): Promise<{ canWrite: boolean, error?: string }> {
  try {
    // Try to access the directory
    await access(path, constants.W_OK)
    return { canWrite: true }
  }
  catch {
    // Directory doesn't exist, check parent
    const parent = dirname(path)
    try {
      await access(parent, constants.W_OK)
      return { canWrite: true }
    }
    catch {
      return {
        canWrite: false,
        error: `No write permission to "${path}". For exFAT/FAT32 drives, remount with: sudo mount -o uid=$(id -u),gid=$(id -g),umask=0022 <device> "${parent}"`,
      }
    }
  }
}

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

  // Check write permissions before proceeding
  const permCheck = await checkWriteAccess(destinationRoot)
  if (!permCheck.canWrite) {
    throw createError({
      statusCode: 403,
      message: permCheck.error || 'No write permission to destination',
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

  // Save library root per drive for future reference
  setDriveLibraryRoot(storageDevice, destinationRoot)

  console.log(`[Publish] Complete: ${result.success} published, ${result.errors.length} errors`)

  return {
    success: result.success,
    errors: result.errors,
    published: result.published,
    skipped: tracks.length - analyzedTracks.length,
  }
})
