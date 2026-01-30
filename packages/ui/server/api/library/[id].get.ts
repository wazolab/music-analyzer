import { getLibraryTrackById } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Track ID is required',
    })
  }

  const track = getLibraryTrackById(parseInt(id, 10))

  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found',
    })
  }

  return track
})
