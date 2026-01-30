import { addToPreparationList, getTrackById } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackId } = body

  if (!trackId) {
    throw createError({
      statusCode: 400,
      message: 'Track ID is required',
    })
  }

  const track = getTrackById(trackId)
  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found',
    })
  }

  const added = addToPreparationList(trackId)
  return { success: true, added }
})
