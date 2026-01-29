<template>
  <div class="app">
    <header>
      <NuxtLink to="/" class="logo">
        <h1>Music Pipeline</h1>
      </NuxtLink>
      <div class="slskd-status" :class="slskdStatus">
        <span class="status-dot"></span>
        <span>slskd: {{ slskdStatus }}</span>
        <a v-if="slskdStatus === 'running'" href="http://localhost:5030" target="_blank" class="slskd-link">Open UI</a>
        <button v-if="slskdStatus === 'stopped'" @click="startSlskd" :disabled="loading">Start</button>
        <button v-else-if="slskdStatus === 'running'" @click="stopSlskd" :disabled="loading">Stop</button>
      </div>
    </header>

    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<script setup>
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

.app {
  max-width: 1100px;
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

.logo {
  text-decoration: none;
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
