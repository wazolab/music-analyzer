<template>
  <div class="track-row" :class="[track.status, { 'in-prep': inPrep }]">
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
    <span v-if="track.duration" class="track-duration">{{ formatDuration(track.duration) }}</span>
    <select
      :value="track.status"
      @change="handleStatusChange"
      class="status-select"
    >
      <option value="not_downloaded">Not Downloaded</option>
      <option value="downloaded">Downloaded</option>
      <option value="need_to_buy">Need to Buy</option>
    </select>
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

const emit = defineEmits(['update-status', 'toggle-prep', 'toggle-play'])

function handleStatusChange(event) {
  emit('update-status', {
    trackId: props.track.id,
    status: event.target.value
  })
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

.track-row.downloaded {
  background: #00dc8210;
}

.track-row.need_to_buy {
  background: #ffa50210;
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

.track-duration {
  color: #666;
  font-size: 0.85rem;
  min-width: 45px;
  text-align: right;
}

.status-select {
  padding: 6px 10px;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 6px;
  color: #eee;
  font-size: 0.85rem;
  cursor: pointer;
}

.status-select:focus {
  outline: none;
  border-color: #00dc82;
}

.downloaded .status-select {
  border-color: #00dc82;
  color: #00dc82;
}

.need_to_buy .status-select {
  border-color: #ffa502;
  color: #ffa502;
}
</style>
