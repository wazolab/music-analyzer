<template>
  <div
    class="file-row"
    :class="{ selected }"
  >
    <input
      type="checkbox"
      :checked="selected"
      class="file-checkbox"
      @change="$emit('toggle-select')"
    >
    <span class="file-name">{{ file.filename }}</span>
    <span
      v-if="topGenre"
      class="file-genre"
    >{{ topGenre }}</span>
    <span class="file-size">{{ formatSize(file.size_bytes) }}</span>
  </div>
</template>

<script setup>
const props = defineProps({
  file: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggle-select'])

// Parse genres and get the top one (simplified)
const topGenre = computed(() => {
  if (!props.file.genres) return null
  try {
    let genres = props.file.genres
    if (typeof genres === 'string') {
      genres = JSON.parse(genres)
    }
    if (!Array.isArray(genres) || genres.length === 0) return null
    // Simplify genre (e.g., "Hip Hop---Boom Bap" -> "Boom Bap")
    const genre = genres[0]
    if (genre.includes('---')) {
      return genre.split('---')[1]
    }
    return genre
  }
  catch {
    return null
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

.file-genre {
  color: #9b59b6;
  font-size: 0.75rem;
  padding: 2px 8px;
  background: rgba(155, 89, 182, 0.15);
  border-radius: 4px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: #666;
  font-size: 0.85rem;
  min-width: 70px;
  text-align: right;
}
</style>
