<template>
  <div class="playlists-page">
    <header class="page-header">
      <h1>Playlists</h1>
    </header>

    <section class="import-section">
      <h2>Import Playlist</h2>
      <div class="import-form">
        <input
          v-model="playlistUrl"
          type="text"
          placeholder="Paste SoundCloud or YouTube playlist URL..."
          @keyup.enter="extractPlaylist"
        >
        <input
          v-model="playlistName"
          type="text"
          placeholder="Playlist name"
          @keyup.enter="extractPlaylist"
        >
        <button
          :disabled="extracting || !playlistUrl || !playlistName"
          @click="extractPlaylist"
        >
          {{ extracting ? 'Importing...' : 'Import' }}
        </button>
      </div>
      <div
        v-if="error"
        class="error"
      >
        {{ error }}
      </div>
    </section>

    <section class="playlists-section">
      <h2>My Playlists ({{ playlists.length }})</h2>
      <div
        v-if="pending"
        class="loading"
      >
        Loading playlists...
      </div>
      <div
        v-else-if="playlists.length === 0"
        class="empty"
      >
        No playlists yet. Import one above!
      </div>
      <div
        v-else
        class="playlist-grid"
      >
        <PlaylistCard
          v-for="playlist in playlists"
          :key="playlist.id"
          :playlist="playlist"
          @delete="handleDelete"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
useHead({ title: 'Playlists' })

const playlistUrl = ref('')
const playlistName = ref('')
const extracting = ref(false)
const error = ref('')

const { data: playlists, pending, refresh } = await useFetch('/api/playlists', {
  default: () => [],
})

async function extractPlaylist() {
  if (!playlistUrl.value || !playlistName.value) return

  extracting.value = true
  error.value = ''

  try {
    // First extract tracks from URL
    const extracted = await $fetch('/api/playlist/extract', {
      method: 'POST',
      body: { url: playlistUrl.value },
    })

    if (!extracted.tracks || extracted.tracks.length === 0) {
      throw new Error('No tracks found in playlist')
    }

    // Then create the playlist
    await $fetch('/api/playlists', {
      method: 'POST',
      body: {
        name: playlistName.value,
        url: playlistUrl.value,
        tracks: extracted.tracks,
      },
    })

    // Reset form and refresh list
    playlistUrl.value = ''
    playlistName.value = ''
    await refresh()
  }
  catch (e) {
    error.value = e.data?.message || e.message || 'Failed to import playlist'
  }

  extracting.value = false
}

async function handleDelete(id) {
  if (!confirm('Delete this playlist?')) return

  try {
    await $fetch(`/api/playlists/${id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e) {
    error.value = e.data?.message || 'Failed to delete playlist'
  }
}
</script>

<style scoped>
.playlists-page {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.page-header h1 {
  font-size: 1.8rem;
  color: #eee;
  margin-bottom: 10px;
}

h2 {
  font-size: 1.2rem;
  margin-bottom: 20px;
  color: #aaa;
}

.import-section {
  background: #16213e;
  padding: 24px;
  border-radius: 12px;
}

.import-form {
  display: flex;
  gap: 10px;
}

.import-form input:first-child {
  flex: 2;
}

.import-form input:nth-child(2) {
  flex: 1;
}

.error {
  margin-top: 16px;
  padding: 12px 16px;
  background: #ff475722;
  border: 1px solid #ff4757;
  border-radius: 8px;
  color: #ff4757;
}

.loading, .empty {
  color: #666;
  text-align: center;
  padding: 40px;
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
</style>
