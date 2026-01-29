import { updateTrackTags, getTrackById } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid track ID'
    })
  }

  const track = getTrackById(id)
  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found'
    })
  }

  const body = await readBody(event)
  const { tags } = body

  if (!Array.isArray(tags)) {
    throw createError({
      statusCode: 400,
      message: 'Tags must be an array'
    })
  }

  const updated = updateTrackTags(id, tags)

  return { success: updated, tags }
})
