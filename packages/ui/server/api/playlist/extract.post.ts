import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface TrackInfo {
  artist: string
  title: string
  duration?: number
  source_url?: string
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
    const args = [
      '--dump-json',
      '--no-warnings',
      '--skip-download',
      '--no-playlist-reverse',
      '--no-cookies-from-browser',
      url
    ]

    // Use spawn to capture both stdout and stderr separately
    const { spawn } = await import('child_process')

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn('yt-dlp', args)
      let stdout = ''
      let stderr = ''

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

      proc.on('close', (_code: number | null) => {
        // Accept exit code 0 or 1 (some videos may fail but others succeed)
        resolve({ stdout, stderr })
      })

      proc.on('error', reject)

      setTimeout(() => {
        proc.kill()
        reject(new Error('Timeout'))
      }, 120000)
    })

    const tracks: TrackInfo[] = []

    for (const line of result.stdout.trim().split('\n')) {
      if (!line || line.startsWith('ERROR')) continue

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

    if (tracks.length === 0 && result.stderr) {
      throw new Error(result.stderr.split('\n')[0] || 'No tracks found')
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
    source_url: data.webpage_url || data.url,
  }
}
