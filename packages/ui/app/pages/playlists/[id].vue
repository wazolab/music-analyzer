<template>
  <div
    class="playlist-detail"
    :class="{ 'has-player': currentTrack }"
  >
    <div class="playlist-content">
      <div
        v-if="pending"
        class="loading"
      >
        Loading playlist...
      </div>
      <div
        v-else-if="fetchError"
        class="error"
      >
        {{ fetchError.data?.message || 'Failed to load playlist' }}
      </div>
      <template v-else-if="playlist">
        <div class="playlist-header">
          <div class="playlist-info">
            <NuxtLink
              to="/"
              class="back-link"
            >&larr; Back to playlists</NuxtLink>
            <h2>{{ playlist.name }}</h2>
            <div class="meta">
              <span>{{ playlist.track_count }} tracks</span>
              <span class="separator">|</span>
              <a
                :href="playlist.url"
                target="_blank"
                class="source-link"
              >View source</a>
              <span class="separator">|</span>
              <ClientOnly><span>Updated {{ formatDate(playlist.updated_at) }}</span></ClientOnly>
            </div>
          </div>
          <button
            :disabled="syncing"
            class="sync-btn"
            @click="syncPlaylist"
          >
            {{ syncing ? 'Syncing...' : 'Re-sync' }}
          </button>
        </div>

        <div
          v-if="error"
          class="error"
        >
          {{ error }}
        </div>

        <div class="tracks-list">
          <TrackRow
            v-for="(track, index) in playlist.tracks"
            :key="track.id"
            :track="track"
            :index="index + 1"
            :in-prep="prepTrackIds.has(track.id)"
            :is-playing="currentTrack?.id === track.id"
            @toggle-prep="handleTogglePrep"
            @toggle-play="handleTogglePlay"
          />
        </div>
      </template>
    </div>

    <!-- Audio Player (Right Panel) -->
    <aside
      v-if="currentTrack"
      class="player-panel"
    >
      <div class="player-header">
        <span class="player-label">Now Playing</span>
        <button
          class="player-close"
          @click="stopPlayback"
        >
          ✕
        </button>
      </div>
      <div class="player-info">
        <div class="player-artist">
          {{ currentTrack.artist }}
        </div>
        <div class="player-title">
          {{ currentTrack.title }}
        </div>
      </div>
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        class="player-embed"
        allow="autoplay"
        frameborder="0"
      />
    </aside>
  </div>
</template>

<script setup>
const route = useRoute()
const playlistId = computed(() => route.params.id)

const syncing = ref(false)
const error = ref('')
const currentTrack = ref(null)
const prepTrackIds = ref(new Set())

const { data: playlist, pending, error: fetchError, refresh } = await useFetch(
  () => `/api/playlists/${playlistId.value}`,
  { default: () => null },
)

useHead({
  title: computed(() => playlist.value?.name || 'Playlist'),
})

// Load preparation list
const { data: prepList } = await useFetch('/api/preparation', {
  default: () => [],
})

watch(prepList, (list) => {
  prepTrackIds.value = new Set(list.map(t => t.track_id))
}, { immediate: true })

// Generate embed URL for playback
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

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'Z')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function syncPlaylist() {
  syncing.value = true
  error.value = ''

  try {
    await $fetch(`/api/playlists/${playlistId.value}/sync`, { method: 'POST' })
    await refresh()
  }
  catch (e) {
    error.value = e.data?.message || 'Failed to sync playlist'
  }

  syncing.value = false
}

async function handleTogglePrep(trackId) {
  const inPrep = prepTrackIds.value.has(trackId)

  try {
    if (inPrep) {
      await $fetch('/api/preparation/remove', {
        method: 'POST',
        body: { trackId },
      })
      prepTrackIds.value.delete(trackId)
    }
    else {
      await $fetch('/api/preparation/add', {
        method: 'POST',
        body: { trackId },
      })
      prepTrackIds.value.add(trackId)
    }
    // Trigger reactivity
    prepTrackIds.value = new Set(prepTrackIds.value)
  }
  catch (e) {
    error.value = e.data?.message || 'Failed to update preparation list'
  }
}

function handleTogglePlay(track) {
  if (currentTrack.value?.id === track.id) {
    currentTrack.value = null
  }
  else {
    currentTrack.value = track
  }
}

function stopPlayback() {
  currentTrack.value = null
}
</script>

<style scoped>
.playlist-detail {
  display: flex;
  gap: 24px;
}

.playlist-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.loading {
  color: #666;
  text-align: center;
  padding: 40px;
}

.error {
  padding: 12px 16px;
  background: #ff475722;
  border: 1px solid #ff4757;
  border-radius: 8px;
  color: #ff4757;
}

.playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.playlist-info {
  flex: 1;
}

.back-link {
  display: inline-block;
  margin-bottom: 12px;
  color: #666;
  font-size: 0.9rem;
}

.back-link:hover {
  color: #00dc82;
}

h2 {
  font-size: 1.5rem;
  color: #eee;
  margin-bottom: 8px;
}

.meta {
  color: #666;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.separator {
  color: #444;
}

.source-link {
  color: #00dc82;
}

.sync-btn {
  padding: 10px 20px;
  background: #333;
  color: #eee;
}

.sync-btn:hover {
  background: #444;
}

.tracks-list {
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.empty {
  color: #666;
  text-align: center;
  padding: 40px;
}

/* Right Panel Player */
.player-panel {
  width: 320px;
  flex-shrink: 0;
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: fit-content;
  position: sticky;
  top: 30px;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-label {
  color: #666;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

.player-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-artist {
  color: #00dc82;
  font-weight: 500;
}

.player-title {
  color: #eee;
}

.player-embed {
  width: 100%;
  height: 166px;
  border-radius: 8px;
}
</style>
