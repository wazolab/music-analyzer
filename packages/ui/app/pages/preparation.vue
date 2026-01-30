<template>
  <div class="flex gap-6">
    <!-- Main Content -->
    <div class="flex-1 flex flex-col gap-6 min-w-0">
      <!-- Action Button -->
      <div v-if="prepList.length > 0" class="flex justify-end">
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          :loading="clearing"
          @click="clearList"
        >
          Clear All
        </UButton>
      </div>

      <!-- Loading/Empty states -->
      <div v-if="pending" class="text-muted text-center py-16">
        Loading preparation list...
      </div>
      <UCard v-else-if="prepList.length === 0" class="text-center">
        <UIcon name="i-lucide-headphones" class="size-12 text-muted mx-auto mb-4" />
        <p class="text-muted mb-2">No tracks in your prep list yet.</p>
        <p class="text-sm text-muted">Browse playlists and click the + button to add tracks.</p>
      </UCard>

      <!-- Prep List -->
      <template v-else>
        <div class="flex items-center gap-2">
          <UBadge color="neutral" variant="subtle">{{ prepList.length }} tracks</UBadge>
          <span class="text-sm text-muted">selected for preparation</span>
        </div>

        <UCard :ui="{ body: 'p-0' }">
          <div class="divide-y divide-default">
            <div
              v-for="track in prepList"
              :key="track.id"
              class="flex items-center gap-3 py-4 px-5"
              :class="{ 'bg-primary/5 border-l-4 border-l-primary': currentTrack?.track_id === track.track_id }"
            >
              <!-- Actions -->
              <div class="flex gap-1.5">
                <UButton
                  v-if="track.source_url"
                  :icon="currentTrack?.track_id === track.track_id ? 'i-lucide-square' : 'i-lucide-play'"
                  size="sm"
                  :color="currentTrack?.track_id === track.track_id ? 'primary' : 'neutral'"
                  :variant="currentTrack?.track_id === track.track_id ? 'solid' : 'ghost'"
                  :title="currentTrack?.track_id === track.track_id ? 'Stop' : 'Play'"
                  @click="togglePlay(track)"
                />
                <UButton
                  :icon="copiedTrackId === track.track_id ? 'i-lucide-check' : 'i-lucide-copy'"
                  size="sm"
                  :color="copiedTrackId === track.track_id ? 'success' : 'neutral'"
                  :variant="copiedTrackId === track.track_id ? 'solid' : 'ghost'"
                  title="Copy for Soulseek search"
                  @click="copySearchText(track)"
                />
                <UButton
                  icon="i-lucide-x"
                  size="sm"
                  color="error"
                  variant="ghost"
                  title="Remove from Prep"
                  @click="removeTrack(track.track_id)"
                />
              </div>

              <!-- Track info -->
              <span class="text-primary font-semibold text-base">{{ track.artist }}</span>
              <span class="text-muted text-base">-</span>
              <span class="flex-1 truncate text-base">{{ track.title }}</span>

              <!-- Badges -->
              <UBadge v-if="track.bpm" color="warning" variant="subtle">
                {{ Math.round(track.bpm) }} BPM
              </UBadge>
              <UBadge v-if="track.key_notation" color="primary" variant="subtle" class="min-w-8 text-center">
                {{ track.key_notation }}
              </UBadge>
              <span v-if="track.duration" class="text-muted min-w-12 text-right">
                {{ formatDuration(track.duration) }}
              </span>
            </div>
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
import { formatDuration } from '~/composables/useFormatters'
import { getEmbedUrl } from '~/composables/useMedia'
import { cleanForSearch } from '~/composables/useSearch'

definePageMeta({ pageTitle: 'DJ Prep' })
useHead({ title: 'DJ Prep' })

const currentTrack = ref(null)
const clearing = ref(false)
const copiedTrackId = ref(null)

const { data: prepList, pending, refresh } = await useFetch('/api/preparation', {
  default: () => [],
})

const embedUrl = computed(() => getEmbedUrl(currentTrack.value?.source_url))

function togglePlay(track) {
  if (currentTrack.value?.track_id === track.track_id) {
    currentTrack.value = null
  }
  else {
    currentTrack.value = track
  }
}

function stopPlayback() {
  currentTrack.value = null
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
      body: { trackId },
    })
    await refresh()
  }
  catch (e) {
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
  }
  catch (e) {
    console.error('Failed to clear list:', e)
  }
  clearing.value = false
}
</script>
