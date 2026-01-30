import { removeFromPreparationList } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { trackId } = body

  if (!trackId) {
    throw createError({
      statusCode: 400,
      message: 'Track ID is required',
    })
  }

  const removed = removeFromPreparationList(trackId)
  return { success: removed }
})
