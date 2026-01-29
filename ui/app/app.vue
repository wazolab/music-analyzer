<template>
  <div class="dashboard">
    <aside class="sidebar">
      <div class="logo">
        <h1>Music Pipeline</h1>
      </div>

      <nav class="nav">
        <NuxtLink to="/" class="nav-item" :class="{ active: route.path === '/' }">
          <span class="nav-icon">📋</span>
          <span>Playlists</span>
        </NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div class="slskd-status" :class="slskdStatus">
          <div class="status-row">
            <span class="status-dot"></span>
            <span>slskd: {{ slskdStatus }}</span>
          </div>
          <div class="status-actions">
            <a v-if="slskdStatus === 'running'" href="http://localhost:5030" target="_blank" class="slskd-link">Open UI</a>
            <button v-if="slskdStatus === 'stopped'" @click="startSlskd" :disabled="loading" class="btn-small">Start</button>
            <button v-else-if="slskdStatus === 'running'" @click="stopSlskd" :disabled="loading" class="btn-small btn-danger">Stop</button>
          </div>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup>
const route = useRoute()
const slskdStatus = ref('checking')
const loading = ref(false)
const error = ref('')

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

.dashboard {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #16213e;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
}

.logo {
  padding: 24px 20px;
  border-bottom: 1px solid #333;
}

h1 {
  font-size: 1.3rem;
  color: #00dc82;
}

.nav {
  flex: 1;
  padding: 20px 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  color: #aaa;
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover {
  background: #1a2744;
  color: #eee;
  text-decoration: none;
}

.nav-item.active {
  background: #00dc8220;
  color: #00dc82;
}

.nav-icon {
  font-size: 1.1rem;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #333;
}

.slskd-status {
  font-size: 0.85rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.status-dot {
  width: 8px;
  height: 8px;
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

.status-actions {
  display: flex;
  gap: 8px;
}

.slskd-link {
  color: #00dc82;
  text-decoration: none;
  padding: 6px 10px;
  background: #1a1a2e;
  border-radius: 6px;
  font-size: 0.8rem;
}

.slskd-link:hover {
  background: #1a2744;
  text-decoration: none;
}

.btn-small {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.btn-danger {
  background: #ff4757;
}

.main-content {
  flex: 1;
  margin-left: 240px;
  padding: 30px 40px;
  max-width: 1200px;
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

input {
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

a {
  color: #00dc82;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>
