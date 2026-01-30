/**
 * Utility functions for media URL handling (YouTube, SoundCloud embeds)
 */

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/)
  return match ? match[1] : null
}

/**
 * Generate an embed URL for playback from a source URL
 * Supports YouTube and SoundCloud
 */
export function getEmbedUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null

  if (sourceUrl.includes('soundcloud.com')) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(sourceUrl)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
  }

  if (sourceUrl.includes('youtube.com') || sourceUrl.includes('youtu.be')) {
    const videoId = extractYouTubeId(sourceUrl)
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`
    }
  }

  return null
}
