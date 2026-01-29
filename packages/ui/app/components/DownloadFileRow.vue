<template>
  <div class="file-row" :class="{ selected, [file.status]: true }">
    <input
      type="checkbox"
      :checked="selected"
      @change="$emit('toggle-select')"
      class="file-checkbox"
    >
    <span class="file-name">{{ file.filename }}</span>
    <span class="file-size">{{ formatSize(file.size_bytes) }}</span>
    <span v-if="file.bpm" class="file-bpm">{{ Math.round(file.bpm) }} BPM</span>
    <span v-if="file.key_notation" class="file-key">{{ file.key_notation }}</span>
    <span class="file-status" :class="file.status">{{ statusLabel }}</span>
  </div>
</template>

<script setup>
const props = defineProps({
  file: {
    type: Object,
    required: true
  },
  selected: {
    type: Boolean,
    default: false
  }
})

defineEmits(['toggle-select'])

const statusLabel = computed(() => {
  switch (props.file.status) {
    case 'pending': return 'Pending'
    case 'queued': return 'Queued'
    case 'analyzing': return 'Analyzing...'
    case 'completed': return 'Done'
    case 'failed': return 'Failed'
    default: return props.file.status
  }
})

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a4a;
  transition: background 0.15s;
}

.file-row:last-child {
  border-bottom: none;
}

.file-row:hover {
  background: #1a1a2e;
}

.file-row.selected {
  background: rgba(0, 220, 130, 0.1);
}

.file-row.completed {
  opacity: 0.7;
}

.file-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.file-name {
  flex: 1;
  color: #eee;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  color: #666;
  font-size: 0.85rem;
  min-width: 70px;
  text-align: right;
}

.file-bpm {
  color: #ffa502;
  font-size: 0.8rem;
  padding: 2px 6px;
  background: rgba(255, 165, 2, 0.15);
  border-radius: 4px;
}

.file-key {
  color: #00dc82;
  font-size: 0.8rem;
  padding: 2px 6px;
  background: rgba(0, 220, 130, 0.15);
  border-radius: 4px;
  min-width: 30px;
  text-align: center;
}

.file-status {
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 4px;
  min-width: 70px;
  text-align: center;
}

.file-status.pending {
  color: #666;
  background: #333;
}

.file-status.queued {
  color: #ffa502;
  background: rgba(255, 165, 2, 0.15);
}

.file-status.analyzing {
  color: #3498db;
  background: rgba(52, 152, 219, 0.15);
}

.file-status.completed {
  color: #00dc82;
  background: rgba(0, 220, 130, 0.15);
}

.file-status.failed {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.15);
}
</style>
