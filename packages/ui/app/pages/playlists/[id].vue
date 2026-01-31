<template>
  <div class="flex gap-6">
    <!-- Main Content -->
    <div class="flex-1 flex flex-col gap-6 min-w-0">
      <div v-if="pending" class="text-muted text-center py-10">
        Loading playlist...
      </div>
      <UAlert
        v-else-if="fetchError"
        color="error"
        icon="i-lucide-alert-circle"
        title="Error"
        :description="fetchError.data?.message || 'Failed to load playlist'"
      />
      <template v-else-if="playlist">
        <!-- Header -->
        <div class="flex justify-between items-start gap-5">
          <div class="flex-1">
            <UButton
              to="/online-playlists"
              variant="link"
              color="neutral"
              icon="i-lucide-arrow-left"
              class="mb-3 -ml-2"
            >
              Back to playlists
            </UButton>
            <div v-if="!editingTitle" class="flex items-center gap-2 mb-2">
              <h2 class="text-2xl font-bold">{{ playlist.name }}</h2>
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                title="Edit name"
                @click="startTitleEdit"
              />
            </div>
            <div v-else class="flex items-center gap-2 mb-2">
              <UInput
                ref="titleInput"
                v-model="editTitleValue"
                class="text-2xl font-bold w-64"
                @keyup.enter="saveTitleEdit"
                @keyup.escape="cancelTitleEdit"
              />
              <UButton size="xs" :loading="savingTitle" @click="saveTitleEdit">Save</UButton>
              <UButton size="xs" color="neutral" variant="ghost" :disabled="savingTitle" @click="cancelTitleEdit">Cancel</UButton>
            </div>
            <div class="text-muted text-sm flex items-center gap-2 flex-wrap">
              <UBadge color="neutral" variant="subtle">{{ playlist.track_count }} tracks</UBadge>
              <UButton
                :href="playlist.url"
                target="_blank"
                variant="link"
                color="primary"
                size="xs"
                icon="i-lucide-external-link"
              >
                View source
              </UButton>
              <ClientOnly>
                <span class="text-muted">Updated {{ formatDateFull(playlist.updated_at) }}</span>
              </ClientOnly>
            </div>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            :loading="syncing"
            color="neutral"
            variant="soft"
            @click="syncPlaylist"
          >
            Re-sync
          </UButton>
        </div>

        <UAlert
          v-if="error"
          color="error"
          icon="i-lucide-alert-circle"
          :description="error"
          closeable
          @close="error = ''"
        />

        <!-- Tracks List -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="divide-y divide-default">
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
          <div
            v-if="playlist.tracks?.length === 0"
            class="text-muted text-center py-10"
          >
            No tracks in this playlist
          </div>
        </UCard>
      </template>
    </div>

    <!-- Right Panel Player -->
    <aside v-if="currentTrack" class="w-80 shrink-0">
      <UCard class="sticky top-8">
        <template #header>
          <div class="flex justify-between items-center">
            <span class="text-muted text-xs uppercase tracking-wide">Now Playing</span>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="stopPlayback"
            />
          </div>
        </template>
        <div class="space-y-4">
          <div>
            <div class="text-primary font-medium">{{ currentTrack.artist }}</div>
            <div>{{ currentTrack.title }}</div>
          </div>
          <iframe
            v-if="embedUrl"
            :src="embedUrl"
            class="w-full h-42 rounded-lg"
            allow="autoplay"
            frameborder="0"
          />
        </div>
      </UCard>
    </aside>
  </div>
</template>

<script setup>
import { formatDateFull } from '~/composables/useFormatters'
import { getEmbedUrl } from '~/composables/useMedia'

definePageMeta({ pageTitle: 'Playlist Details' })

const route = useRoute()
const playlistId = computed(() => route.params.id)

const syncing = ref(false)
const error = ref('')
const currentTrack = ref(null)
const prepTrackIds = ref(new Set())

// Title editing state
const editingTitle = ref(false)
const editTitleValue = ref('')
const savingTitle = ref(false)
const titleInput = ref(null)

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

const embedUrl = computed(() => getEmbedUrl(currentTrack.value?.source_url))

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

function startTitleEdit() {
  editTitleValue.value = playlist.value.name
  editingTitle.value = true
  nextTick(() => {
    titleInput.value?.$el?.querySelector('input')?.focus()
  })
}

function cancelTitleEdit() {
  editingTitle.value = false
  editTitleValue.value = ''
}

async function saveTitleEdit() {
  if (!editTitleValue.value.trim() || editTitleValue.value.trim() === playlist.value.name) {
    cancelTitleEdit()
    return
  }

  savingTitle.value = true
  try {
    await $fetch(`/api/playlists/${playlistId.value}`, {
      method: 'PATCH',
      body: { name: editTitleValue.value.trim() },
    })
    await refresh()
    editingTitle.value = false
  }
  catch (e) {
    error.value = e.data?.message || 'Failed to update playlist name'
  }
  savingTitle.value = false
}
</script>
