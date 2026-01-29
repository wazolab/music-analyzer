<template>
  <div class="track-row" :class="track.status">
    <span class="track-number">{{ index }}.</span>
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
  }
})

const emit = defineEmits(['update-status'])

function handleStatusChange(event) {
  emit('update-status', {
    trackId: props.track.id,
    status: event.target.value
  })
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

.track-number {
  color: #666;
  min-width: 35px;
  font-size: 0.9rem;
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
