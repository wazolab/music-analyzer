<template>
  <div
    class="flex items-center gap-3 py-4 px-5"
    :class="{ 'border-l-4 border-l-primary bg-primary/5': inPrep }"
  >
    <span class="text-muted min-w-10 text-base">{{ index }}.</span>

    <!-- Action buttons -->
    <div class="flex gap-1.5">
      <UButton
        v-if="track.source_url"
        :icon="isPlaying ? 'i-lucide-square' : 'i-lucide-play'"
        size="sm"
        :color="isPlaying ? 'primary' : 'neutral'"
        :variant="isPlaying ? 'solid' : 'ghost'"
        :title="isPlaying ? 'Stop' : 'Play'"
        @click="togglePlay"
      />
      <UButton
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        size="sm"
        :color="copied ? 'success' : 'neutral'"
        :variant="copied ? 'solid' : 'ghost'"
        title="Copy for Soulseek search"
        @click="copySearchText"
      />
      <UButton
        :icon="inPrep ? 'i-lucide-check' : 'i-lucide-plus'"
        size="sm"
        :color="inPrep ? 'primary' : 'neutral'"
        :variant="inPrep ? 'solid' : 'ghost'"
        :title="inPrep ? 'Remove from Prep' : 'Add to Prep'"
        @click="togglePrep"
      />
    </div>

    <!-- Track info -->
    <span class="text-primary font-semibold text-base">{{ track.artist }}</span>
    <span class="text-muted text-base">-</span>
    <span class="flex-1 truncate text-base">{{ track.title }}</span>

    <!-- Badges -->
    <UBadge
      v-if="topGenre"
      color="neutral"
      variant="subtle"
      class="max-w-36 truncate"
    >
      {{ topGenre }}
    </UBadge>
    <UBadge
      v-if="track.bpm"
      color="warning"
      variant="subtle"
    >
      {{ Math.round(track.bpm) }} BPM
    </UBadge>
    <UBadge
      v-if="track.key_notation"
      color="primary"
      variant="subtle"
      class="min-w-8 text-center"
    >
      {{ track.key_notation }}
    </UBadge>
    <span
      v-if="track.duration"
      class="text-muted min-w-12 text-right"
    >
      {{ formatDuration(track.duration) }}
    </span>
  </div>
</template>

<script setup>
const props = defineProps({
  track: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  inPrep: {
    type: Boolean,
    default: false,
  },
  isPlaying: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-prep', 'toggle-play'])

const copied = ref(false)

const topGenre = computed(() => {
  if (!props.track.tags || props.track.tags.length === 0) return null
  let tags = props.track.tags
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags)
    }
    catch {
      return null
    }
  }
  if (!Array.isArray(tags) || tags.length === 0) return null
  const genre = tags[0]
  if (genre.includes('---')) {
    return genre.split('---')[1]
  }
  return genre
})

function cleanForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function copySearchText() {
  const searchText = cleanForSearch(`${props.track.artist} ${props.track.title}`)
  await navigator.clipboard.writeText(searchText)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function togglePrep() {
  emit('toggle-prep', props.track.id)
}

function togglePlay() {
  emit('toggle-play', props.track)
}

function formatDuration(seconds) {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>
