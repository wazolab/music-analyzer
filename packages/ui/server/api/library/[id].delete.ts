import { deleteLibraryTrack, getLibraryTrackById } from '../../utils/db'

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

  const deleted = deleteLibraryTrack(trackId)

  return {
    success: deleted,
    message: deleted ? 'Track removed from library' : 'Failed to remove track',
  }
})
