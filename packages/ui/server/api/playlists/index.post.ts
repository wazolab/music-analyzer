import { createPlaylist, getPlaylistByUrl } from '../../utils/db'
import type { CreatePlaylistInput } from '../../utils/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<CreatePlaylistInput>(event)

  if (!body.name?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Playlist name is required'
    })
  }

  if (!body.url?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Playlist URL is required'
    })
  }

  if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Tracks array is required and must not be empty'
    })
  }

  // Check for duplicate URL
  const existing = getPlaylistByUrl(body.url)
  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A playlist with this URL already exists'
    })
  }

  const playlist = createPlaylist(body.name.trim(), body.url.trim(), body.tracks)
  return playlist
})
