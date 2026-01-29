import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface TrackInfo {
  artist: string
  title: string
  duration?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { url } = body

  const validDomains = ['soundcloud.com', 'youtube.com', 'youtu.be', 'music.youtube.com']
  const isValidUrl = url && validDomains.some(domain => url.includes(domain))

  if (!isValidUrl) {
    throw createError({
      statusCode: 400,
      message: 'Invalid URL. Supported: SoundCloud, YouTube'
    })
  }

  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      '--no-playlist-reverse',
      url,
    ], { maxBuffer: 50 * 1024 * 1024, timeout: 120000 })

    const tracks: TrackInfo[] = []

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue

      try {
        const data = JSON.parse(line)
        const track = parseTrackInfo(data)
        if (track) {
          tracks.push(track)
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { tracks }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to extract playlist'
    })
  }
})

function parseTrackInfo(data: any): TrackInfo | null {
  let artist = data.artist || data.uploader || data.creator || ''
  let title = data.track || data.title || ''

  // If title contains " - ", it might be "Artist - Title" format
  if (!artist && title.includes(' - ')) {
    const parts = title.split(' - ')
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title = parts.slice(1).join(' - ').trim()
    }
  }

  // Clean up
  artist = artist.trim()
  title = title
    .trim()
    .replace(/\s*\[Free Download\]\s*/gi, '')
    .replace(/\s*\(Free Download\)\s*/gi, '')
    .replace(/\s*\[OUT NOW\]\s*/gi, '')
    .replace(/\s*\(OUT NOW\)\s*/gi, '')
    .trim()

  if (!title) return null

  return {
    artist: artist || 'Unknown Artist',
    title,
    duration: data.duration,
  }
}
