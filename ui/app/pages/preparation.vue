<template>
  <div class="preparation-page">
    <header class="page-header">
      <h1>DJ Prep List</h1>
      <button
        v-if="prepList.length > 0"
        @click="clearList"
        class="clear-btn"
        :disabled="clearing"
      >
        {{ clearing ? 'Clearing...' : 'Clear All' }}
      </button>
    </header>

    <div v-if="pending" class="loading">Loading preparation list...</div>
    <div v-else-if="prepList.length === 0" class="empty">
      <p>No tracks in your prep list yet.</p>
      <p class="hint">Browse playlists and click the + button to add tracks.</p>
    </div>
    <div v-else class="prep-list">
      <div class="prep-stats">
        {{ prepList.length }} tracks selected for preparation
      </div>

      <div class="tracks-list">
        <div
          v-for="track in prepList"
          :key="track.id"
          class="prep-track"
        >
          <div class="track-actions">
            <button
              v-if="track.source_url"
              class="action-btn play-btn"
              :class="{ playing: currentTrack?.track_id === track.track_id }"
              @click="togglePlay(track)"
              :title="currentTrack?.track_id === track.track_id ? 'Stop' : 'Play'"
            >
              {{ currentTrack?.track_id === track.track_id ? '⏹' : '▶' }}
            </button>
            <button
              class="action-btn copy-btn"
              :class="{ copied: copiedTrackId === track.track_id }"
              @click="copySearchText(track)"
              title="Copy for Soulseek search"
            >
              {{ copiedTrackId === track.track_id ? '✓' : '⎘' }}
            </button>
            <button
              class="action-btn remove-btn"
              @click="removeTrack(track.track_id)"
              title="Remove from Prep"
            >
              ✕
            </button>
          </div>
          <span class="track-artist">{{ track.artist }}</span>
          <span class="track-separator">-</span>
          <span class="track-title">{{ track.title }}</span>
          <span v-if="track.duration" class="track-duration">{{ formatDuration(track.duration) }}</span>
        </div>
      </div>
    </div>

    <!-- Audio Player -->
    <div v-if="currentTrack" class="audio-player">
      <div class="player-info">
        <span class="player-artist">{{ currentTrack.artist }}</span>
        <span class="player-separator">-</span>
        <span class="player-title">{{ currentTrack.title }}</span>
      </div>
      <button class="player-close" @click="stopPlayback">✕</button>
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        class="player-embed"
        allow="autoplay"
        frameborder="0"
      ></iframe>
    </div>
  </div>
</template>

<script setup>
useHead({ title: 'DJ Prep' })

const currentTrack = ref(null)
const clearing = ref(false)
const copiedTrackId = ref(null)

const { data: prepList, pending, refresh } = await useFetch('/api/preparation', {
  default: () => []
})

const embedUrl = computed(() => {
  if (!currentTrack.value?.source_url) return null
  const url = currentTrack.value.source_url

  if (url.includes('soundcloud.com')) {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
  }

  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = extractYouTubeId(url)
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`
    }
  }

  return null
})

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/)
  return match ? match[1] : null
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function togglePlay(track) {
  if (currentTrack.value?.track_id === track.track_id) {
    currentTrack.value = null
  } else {
    currentTrack.value = track
  }
}

function stopPlayback() {
  currentTrack.value = null
}

function cleanForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function copySearchText(track) {
  const searchText = cleanForSearch(`${track.artist} ${track.title}`)
  await navigator.clipboard.writeText(searchText)
  copiedTrackId.value = track.track_id
  setTimeout(() => { copiedTrackId.value = null }, 1500)
}

async function removeTrack(trackId) {
  try {
    await $fetch('/api/preparation/remove', {
      method: 'POST',
      body: { trackId }
    })
    await refresh()
  } catch (e) {
    console.error('Failed to remove track:', e)
  }
}

async function clearList() {
  if (!confirm('Clear all tracks from your prep list?')) return

  clearing.value = true
  try {
    await $fetch('/api/preparation/clear', { method: 'POST' })
    currentTrack.value = null
    await refresh()
  } catch (e) {
    console.error('Failed to clear list:', e)
  }
  clearing.value = false
}
</script>

<style scoped>
.preparation-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  font-size: 1.8rem;
  color: #eee;
}

.clear-btn {
  padding: 10px 20px;
  background: #ff4757;
  color: #fff;
}

.clear-btn:hover {
  opacity: 0.9;
}

.loading, .empty {
  color: #666;
  text-align: center;
  padding: 60px 20px;
}

.empty p {
  margin-bottom: 8px;
}

.hint {
  font-size: 0.9rem;
  color: #555;
}

.prep-stats {
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.tracks-list {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.prep-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a4a;
}

.prep-track:last-child {
  border-bottom: none;
}

.track-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: #1a1a2e;
  color: #888;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.action-btn:hover {
  background: #2a2a4a;
  color: #eee;
}

.play-btn:hover,
.play-btn.playing {
  background: #00dc82;
  color: #1a1a2e;
}

.copy-btn:hover {
  background: #3498db;
  color: #fff;
}

.copy-btn.copied {
  background: #00dc82;
  color: #1a1a2e;
}

.remove-btn:hover {
  background: #ff4757;
  color: #fff;
}

.track-artist {
  color: #00dc82;
  font-weight: 500;
}

.track-separator {
  color: #666;
}

.track-title {
  color: #eee;
  flex: 1;
}

.track-duration {
  color: #666;
  font-size: 0.85rem;
  min-width: 45px;
  text-align: right;
}

.audio-player {
  position: fixed;
  bottom: 0;
  left: 240px;
  right: 0;
  background: #16213e;
  border-top: 1px solid #333;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 100;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
}

.player-artist {
  color: #00dc82;
  font-weight: 500;
}

.player-separator {
  color: #666;
}

.player-title {
  color: #eee;
}

.player-close {
  padding: 6px 10px;
  background: #333;
  color: #888;
  font-size: 0.85rem;
}

.player-close:hover {
  background: #ff4757;
  color: #fff;
}

.player-embed {
  flex: 1;
  height: 80px;
  border-radius: 8px;
  max-width: 500px;
}
</style>
