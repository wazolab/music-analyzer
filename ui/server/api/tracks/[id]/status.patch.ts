import { getTrackById, updateTrackStatus } from '../../../utils/db'
import type { TrackStatus } from '../../../utils/types'

const validStatuses: TrackStatus[] = ['downloaded', 'not_downloaded', 'need_to_buy']

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid track ID'
    })
  }

  const body = await readBody<{ status: TrackStatus }>(event)

  if (!body.status || !validStatuses.includes(body.status)) {
    throw createError({
      statusCode: 400,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    })
  }

  const track = getTrackById(id)
  if (!track) {
    throw createError({
      statusCode: 404,
      message: 'Track not found'
    })
  }

  updateTrackStatus(id, body.status)

  return { ...track, status: body.status }
})
