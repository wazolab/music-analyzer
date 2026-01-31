<template>
  <div class="flex flex-col gap-8">
    <!-- Import Section -->
    <UCard>
      <template #header>
        <h2 class="font-semibold">Import Playlist</h2>
      </template>
      <div class="flex gap-3 flex-wrap">
        <UInput
          v-model="playlistUrl"
          placeholder="Paste SoundCloud or YouTube playlist URL..."
          class="flex-1 min-w-64"
          @keyup.enter="extractPlaylist"
        />
        <UInput
          v-model="playlistName"
          placeholder="Playlist name"
          class="w-48"
          @keyup.enter="extractPlaylist"
        />
        <UButton
          icon="i-lucide-download"
          :disabled="extracting || !playlistUrl || !playlistName"
          :loading="extracting"
          @click="extractPlaylist"
        >
          Import
        </UButton>
      </div>
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="error"
        class="mt-4"
      />
    </UCard>

    <!-- Playlists Section -->
    <section>
      <div class="flex items-center gap-2 mb-5">
        <h2 class="text-lg text-muted">My Playlists</h2>
        <UBadge color="neutral" variant="subtle">{{ playlists.length }}</UBadge>
      </div>

      <div v-if="pending" class="text-muted text-center py-10">
        Loading playlists...
      </div>
      <div v-else-if="playlists.length === 0" class="text-muted text-center py-10">
        No playlists yet. Import one above!
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <PlaylistCard
          v-for="playlist in playlists"
          :key="playlist.id"
          :playlist="playlist"
          @delete="handleDelete"
          @updated="refresh"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ pageTitle: 'Online Playlists' })
useHead({ title: 'Online Playlists' })

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
    const extracted = await $fetch('/api/playlist/extract', {
      method: 'POST',
      body: { url: playlistUrl.value },
    })

    if (!extracted.tracks || extracted.tracks.length === 0) {
      throw new Error('No tracks found in playlist')
    }

    await $fetch('/api/playlists', {
      method: 'POST',
      body: {
        name: playlistName.value,
        url: playlistUrl.value,
        tracks: extracted.tracks,
      },
    })

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
