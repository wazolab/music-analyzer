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
      <UTabs v-model="activeTab" :items="tabs" class="mb-5" />

      <div v-if="pending" class="text-muted text-center py-10">
        Loading playlists...
      </div>
      <div v-else-if="filteredPlaylists.length === 0" class="text-muted text-center py-10">
        No {{ activeTab === 'youtube' ? 'YouTube' : 'SoundCloud' }} playlists yet. Import one above!
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <PlaylistCard
          v-for="playlist in filteredPlaylists"
          :key="playlist.id"
          :playlist="playlist"
          @delete="handleDelete"
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

const route = useRoute()
const router = useRouter()

const { data: playlists, pending, refresh } = await useFetch('/api/playlists', {
  default: () => [],
})

const activeTab = computed({
  get: () => route.query.source === 'youtube' ? 'youtube' : 'soundcloud',
  set: (value) => {
    router.push({ query: { ...route.query, source: value } })
  },
})

const soundcloudCount = computed(() => playlists.value.filter(p => p.url?.includes('soundcloud.com')).length)
const youtubeCount = computed(() => playlists.value.filter(p => p.url?.includes('youtube.com') || p.url?.includes('youtu.be')).length)

const tabs = computed(() => [
  { label: `SoundCloud (${soundcloudCount.value})`, value: 'soundcloud' },
  { label: `YouTube (${youtubeCount.value})`, value: 'youtube' },
])

const filteredPlaylists = computed(() => {
  if (activeTab.value === 'youtube') {
    return playlists.value.filter(p => p.url?.includes('youtube.com') || p.url?.includes('youtu.be'))
  }
  return playlists.value.filter(p => p.url?.includes('soundcloud.com'))
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
