import { getAllPlaylists } from '../../utils/db'

export default defineEventHandler(() => {
  return getAllPlaylists()
})
