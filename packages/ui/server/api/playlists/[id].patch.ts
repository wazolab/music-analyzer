import { updatePlaylistName, getPlaylistById } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: 'Invalid playlist ID' })
  }

  const body = await readBody(event)
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }

  const success = updatePlaylistName(id, body.name.trim())
  if (!success) {
    throw createError({ statusCode: 404, message: 'Playlist not found' })
  }

  return getPlaylistById(id)
})
