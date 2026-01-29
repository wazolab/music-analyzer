<template>
  <div class="playlist-detail">
    <div v-if="pending" class="loading">Loading playlist...</div>
    <div v-else-if="fetchError" class="error">{{ fetchError.data?.message || 'Failed to load playlist' }}</div>
    <template v-else-if="playlist">
      <div class="playlist-header">
        <div class="playlist-info">
          <NuxtLink to="/" class="back-link">&larr; Back to playlists</NuxtLink>
          <h2>{{ playlist.name }}</h2>
          <div class="meta">
            <span>{{ playlist.track_count }} tracks</span>
            <span class="separator">|</span>
            <a :href="playlist.url" target="_blank" class="source-link">View source</a>
            <span class="separator">|</span>
            <span>Updated {{ formatDate(playlist.updated_at) }}</span>
          </div>
        </div>
        <button @click="syncPlaylist" :disabled="syncing" class="sync-btn">
          {{ syncing ? 'Syncing...' : 'Re-sync' }}
        </button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="filter-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          :class="['tab', { active: activeFilter === tab.value }]"
          @click="activeFilter = tab.value"
        >
          {{ tab.label }} ({{ getCountForStatus(tab.value) }})
        </button>
      </div>

      <div class="tracks-list">
        <div v-if="filteredTracks.length === 0" class="empty">
          No tracks match this filter.
        </div>
        <TrackRow
          v-for="(track, index) in filteredTracks"
          :key="track.id"
          :track="track"
          :index="getTrackIndex(track)"
          @update-status="handleStatusUpdate"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
const route = useRoute()
const playlistId = computed(() => route.params.id)

const activeFilter = ref('all')
const syncing = ref(false)
const error = ref('')

const tabs = [
  { value: 'all', label: 'All' },
  { value: 'not_downloaded', label: 'Not Downloaded' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'need_to_buy', label: 'Need to Buy' }
]

const { data: playlist, pending, error: fetchError, refresh } = await useFetch(
  () => `/api/playlists/${playlistId.value}`,
  { default: () => null }
)

const filteredTracks = computed(() => {
  if (!playlist.value?.tracks) return []
  if (activeFilter.value === 'all') return playlist.value.tracks
  return playlist.value.tracks.filter(t => t.status === activeFilter.value)
})

function getCountForStatus(status) {
  if (!playlist.value?.tracks) return 0
  if (status === 'all') return playlist.value.tracks.length
  return playlist.value.tracks.filter(t => t.status === status).length
}

function getTrackIndex(track) {
  if (!playlist.value?.tracks) return 0
  return playlist.value.tracks.findIndex(t => t.id === track.id) + 1
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'Z')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function syncPlaylist() {
  syncing.value = true
  error.value = ''

  try {
    await $fetch(`/api/playlists/${playlistId.value}/sync`, { method: 'POST' })
    await refresh()
  } catch (e) {
    error.value = e.data?.message || 'Failed to sync playlist'
  }

  syncing.value = false
}

async function handleStatusUpdate({ trackId, status }) {
  try {
    await $fetch(`/api/tracks/${trackId}/status`, {
      method: 'PATCH',
      body: { status }
    })
    // Update local state
    const track = playlist.value.tracks.find(t => t.id === trackId)
    if (track) {
      track.status = status
    }
  } catch (e) {
    error.value = e.data?.message || 'Failed to update track status'
  }
}
</script>

<style scoped>
.playlist-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
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

.filter-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab {
  padding: 8px 16px;
  background: #16213e;
  color: #888;
  border-radius: 6px;
  font-size: 0.9rem;
}

.tab:hover {
  background: #1a2744;
}

.tab.active {
  background: #00dc82;
  color: #1a1a2e;
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
</style>
