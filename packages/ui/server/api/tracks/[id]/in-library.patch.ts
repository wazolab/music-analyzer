import { getTrackById, updateTrackInLibrary } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid track ID',
    })
  }

  const track = getTrackById(id)
  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found',
    })
  }

  const body = await readBody(event)
  const inLibrary = body.in_library as boolean | null

  if (typeof inLibrary !== 'boolean' && inLibrary !== null) {
    throw createError({
      statusCode: 400,
      message: 'in_library must be a boolean or null',
    })
  }

  updateTrackInLibrary(id, inLibrary)

  return { success: true, in_library: inLibrary }
})
