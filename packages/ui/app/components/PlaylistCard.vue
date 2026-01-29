<template>
  <div class="playlist-card">
    <NuxtLink :to="`/playlists/${playlist.id}`" class="card-link">
      <h3>{{ playlist.name }}</h3>
      <div class="card-meta">
        <span class="track-count">{{ playlist.track_count }} tracks</span>
        <ClientOnly><span class="updated">Updated {{ formatDate(playlist.updated_at) }}</span></ClientOnly>
      </div>
    </NuxtLink>
    <button @click.prevent="$emit('delete', playlist.id)" class="delete-btn" title="Delete playlist">
      &times;
    </button>
  </div>
</template>

<script setup>
defineProps({
  playlist: {
    type: Object,
    required: true
  }
})

defineEmits(['delete'])

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'Z')
  const now = new Date()
  const diff = now - date

  // Less than 1 minute
  if (diff < 60000) return 'just now'
  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  // Less than 1 day
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  // Less than 7 days
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}
</script>

<style scoped>
.playlist-card {
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.playlist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.card-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

h3 {
  font-size: 1.1rem;
  color: #eee;
  margin-bottom: 12px;
  padding-right: 30px;
}

.card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: #666;
}

.track-count {
  color: #00dc82;
}

.delete-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  color: #666;
  font-size: 1.4rem;
  line-height: 1;
  border-radius: 4px;
}

.delete-btn:hover {
  background: #ff475733;
  color: #ff4757;
}
</style>
