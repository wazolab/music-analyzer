<template>
  <div class="app">
    <header>
      <h1>Music Pipeline</h1>
      <div class="slskd-status" :class="slskdStatus">
        <span class="status-dot"></span>
        <span>slskd: {{ slskdStatus }}</span>
        <a v-if="slskdStatus === 'running'" href="http://localhost:5030" target="_blank" class="slskd-link">Open UI</a>
        <button v-if="slskdStatus === 'stopped'" @click="startSlskd" :disabled="loading">Start</button>
        <button v-else-if="slskdStatus === 'running'" @click="stopSlskd" :disabled="loading">Stop</button>
      </div>
    </header>

    <main>
      <section class="soundcloud-section">
        <h2>Import from SoundCloud</h2>
        <div class="input-group">
          <input
            v-model="soundcloudUrl"
            type="text"
            placeholder="Paste SoundCloud playlist URL..."
            @keyup.enter="extractPlaylist"
          />
          <button @click="extractPlaylist" :disabled="extracting || !soundcloudUrl">
            {{ extracting ? 'Extracting...' : 'Extract' }}
          </button>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <div v-if="tracks.length > 0" class="tracks">
          <div class="tracks-header">
            <h3>{{ tracks.length }} tracks found</h3>
            <button @click="copyTrackList" class="copy-btn">Copy List</button>
          </div>
          <ul>
            <li v-for="(track, index) in tracks" :key="index">
              <span class="track-number">{{ index + 1 }}.</span>
              <span class="track-artist">{{ track.artist }}</span>
              <span class="track-separator">-</span>
              <span class="track-title">{{ track.title }}</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
const soundcloudUrl = ref('')
const tracks = ref([])
const extracting = ref(false)
const error = ref('')
const slskdStatus = ref('checking')
const loading = ref(false)

// Check slskd status on mount
onMounted(async () => {
  await checkSlskdStatus()
})

async function checkSlskdStatus() {
  try {
    const res = await $fetch('/api/slskd/status')
    slskdStatus.value = res.status
  } catch {
    slskdStatus.value = 'stopped'
  }
}

async function startSlskd() {
  loading.value = true
  try {
    await $fetch('/api/slskd/start', { method: 'POST' })
    await new Promise(r => setTimeout(r, 3000))
    await checkSlskdStatus()
  } catch (e) {
    error.value = 'Failed to start slskd'
  }
  loading.value = false
}

async function stopSlskd() {
  loading.value = true
  try {
    await $fetch('/api/slskd/stop', { method: 'POST' })
    await new Promise(r => setTimeout(r, 1000))
    await checkSlskdStatus()
  } catch (e) {
    error.value = 'Failed to stop slskd'
  }
  loading.value = false
}

async function extractPlaylist() {
  if (!soundcloudUrl.value) return

  extracting.value = true
  error.value = ''
  tracks.value = []

  try {
    const res = await $fetch('/api/soundcloud/extract', {
      method: 'POST',
      body: { url: soundcloudUrl.value }
    })
    tracks.value = res.tracks
  } catch (e) {
    error.value = e.data?.message || 'Failed to extract playlist'
  }

  extracting.value = false
}

function copyTrackList() {
  const text = tracks.value
    .map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`)
    .join('\n')
  navigator.clipboard.writeText(text)
}
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #eee;
  min-height: 100vh;
}

.app {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 30px;
}

h1 {
  font-size: 1.5rem;
  color: #00dc82;
}

.slskd-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #666;
}

.slskd-status.running .status-dot {
  background: #00dc82;
}

.slskd-status.stopped .status-dot {
  background: #ff4757;
}

.slskd-status.checking .status-dot {
  background: #ffa502;
}

.slskd-link {
  color: #00dc82;
  text-decoration: none;
  padding: 8px 12px;
  background: #16213e;
  border-radius: 6px;
  font-size: 0.85rem;
}

.slskd-link:hover {
  background: #1a2744;
}

h2 {
  font-size: 1.2rem;
  margin-bottom: 20px;
  color: #aaa;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #333;
  border-radius: 8px;
  background: #16213e;
  color: #eee;
  font-size: 1rem;
}

input:focus {
  outline: none;
  border-color: #00dc82;
}

button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  background: #00dc82;
  color: #1a1a2e;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:hover {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  padding: 12px 16px;
  background: #ff475722;
  border: 1px solid #ff4757;
  border-radius: 8px;
  color: #ff4757;
  margin-bottom: 20px;
}

.tracks {
  background: #16213e;
  border-radius: 12px;
  padding: 20px;
}

.tracks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.tracks-header h3 {
  font-size: 1rem;
  color: #00dc82;
}

.copy-btn {
  padding: 8px 16px;
  font-size: 0.85rem;
  background: #333;
  color: #eee;
}

ul {
  list-style: none;
}

li {
  padding: 10px 0;
  border-bottom: 1px solid #2a2a4a;
  display: flex;
  gap: 8px;
}

li:last-child {
  border-bottom: none;
}

.track-number {
  color: #666;
  min-width: 30px;
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
}
</style>
