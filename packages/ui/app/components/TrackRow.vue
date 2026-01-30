<template>
  <div class="track-row" :class="{ 'in-prep': inPrep }">
    <span class="track-number">{{ index }}.</span>
    <div class="track-actions">
      <button
        v-if="track.source_url"
        class="action-btn play-btn"
        :class="{ playing: isPlaying }"
        @click="togglePlay"
        :title="isPlaying ? 'Stop' : 'Play'"
      >
        {{ isPlaying ? '⏹' : '▶' }}
      </button>
      <button
        class="action-btn copy-btn"
        :class="{ copied }"
        @click="copySearchText"
        title="Copy for Soulseek search"
      >
        {{ copied ? '✓' : '⎘' }}
      </button>
      <button
        class="action-btn prep-btn"
        :class="{ active: inPrep }"
        @click="togglePrep"
        :title="inPrep ? 'Remove from Prep' : 'Add to Prep'"
      >
        {{ inPrep ? '✓' : '+' }}
      </button>
    </div>
    <span class="track-artist">{{ track.artist }}</span>
    <span class="track-separator">-</span>
    <span class="track-title">{{ track.title }}</span>
    <span v-if="topGenre" class="track-genre">{{ topGenre }}</span>
    <span v-if="track.bpm" class="track-bpm">{{ Math.round(track.bpm) }} BPM</span>
    <span v-if="track.key_notation" class="track-key">{{ track.key_notation }}</span>
    <span v-if="track.duration" class="track-duration">{{ formatDuration(track.duration) }}</span>
  </div>
</template>

<script setup>
const props = defineProps({
  track: {
    type: Object,
    required: true
  },
  index: {
    type: Number,
    required: true
  },
  inPrep: {
    type: Boolean,
    default: false
  },
  isPlaying: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-prep', 'toggle-play'])

const copied = ref(false)

// Get top genre, simplified for display
const topGenre = computed(() => {
  if (!props.track.tags || props.track.tags.length === 0) return null
  // Tags are stored as JSON string or array
  let tags = props.track.tags
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags)
    } catch {
      return null
    }
  }
  if (!Array.isArray(tags) || tags.length === 0) return null
  // Get first genre and simplify (e.g., "Hip Hop---Boom Bap" -> "Boom Bap")
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

<style scoped>
.track-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a4a;
}

.track-row:last-child {
  border-bottom: none;
}

.track-row.in-prep {
  border-left: 3px solid #00dc82;
}

.track-number {
  color: #666;
  min-width: 30px;
  font-size: 0.9rem;
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

.prep-btn:hover {
  background: #ffa502;
  color: #1a1a2e;
}

.prep-btn.active {
  background: #00dc82;
  color: #1a1a2e;
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

.track-genre {
  color: #9b59b6;
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(155, 89, 182, 0.15);
  border-radius: 4px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-bpm {
  color: #ffa502;
  font-size: 0.8rem;
  padding: 2px 6px;
  background: rgba(255, 165, 2, 0.15);
  border-radius: 4px;
}

.track-key {
  color: #00dc82;
  font-size: 0.8rem;
  padding: 2px 6px;
  background: rgba(0, 220, 130, 0.15);
  border-radius: 4px;
  min-width: 28px;
  text-align: center;
}

.track-duration {
  color: #666;
  font-size: 0.85rem;
  min-width: 45px;
  text-align: right;
}
</style>
