<template>
  <UApp>
    <UDashboardGroup>
      <UDashboardSidebar class="bg-elevated/25" collapsible>
        <template #header="{ collapsed }">
          <div class="flex items-center gap-2" :class="{ 'justify-center': collapsed }">
            <UIcon name="i-lucide-music" class="size-6 text-primary" />
            <span v-if="!collapsed" class="font-bold text-lg">Music Pipeline</span>
          </div>
        </template>

        <template #default="{ collapsed }">
          <UNavigationMenu
            :items="navItems"
            orientation="vertical"
            :ui="collapsed ? { link: 'justify-center', linkLabel: 'hidden', linkLeadingIcon: 'size-5' } : {}"
          />
        </template>

        <template #footer="{ collapsed }">
          <div class="p-4 text-sm">
            <div class="flex items-center gap-2" :class="{ 'justify-center': collapsed, 'mb-2': !collapsed }">
              <span
                class="size-2 rounded-full shrink-0"
                :class="{
                  'bg-green-500': slskdStatus === 'running',
                  'bg-red-500': slskdStatus === 'stopped',
                  'bg-yellow-500': slskdStatus === 'checking',
                }"
                :title="collapsed ? `slskd: ${slskdStatus}` : undefined"
              />
              <span v-if="!collapsed" class="text-muted">slskd: {{ slskdStatus }}</span>
            </div>
            <div v-if="!collapsed" class="flex gap-2">
              <UButton
                v-if="slskdStatus === 'running'"
                to="http://localhost:5030"
                target="_blank"
                size="xs"
                variant="soft"
              >
                Open UI
              </UButton>
              <UButton
                v-if="slskdStatus === 'stopped'"
                size="xs"
                :loading="loading"
                @click="startSlskd"
              >
                Start
              </UButton>
              <UButton
                v-else-if="slskdStatus === 'running'"
                size="xs"
                color="error"
                variant="soft"
                :loading="loading"
                @click="stopSlskd"
              >
                Stop
              </UButton>
            </div>
          </div>
        </template>
      </UDashboardSidebar>

      <UDashboardPanel>
        <template #header>
          <UDashboardNavbar>
            <template #leading>
              <UDashboardSidebarCollapse />
              <ClientOnly>
                <span class="text-lg font-semibold ml-2">{{ pageTitle }}</span>
                <template #fallback>
                  <span class="text-lg font-semibold ml-2">&nbsp;</span>
                </template>
              </ClientOnly>
            </template>

            <template #right>
              <UColorModeButton />
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <NuxtPage />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>

<script setup>
const route = useRoute()
const slskdStatus = ref('checking')
const loading = ref(false)

const pageTitle = computed(() => {
  return route.meta.pageTitle || route.meta.title || 'Music Pipeline'
})

const navItems = computed(() => [
  [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/',
      active: route.path === '/',
    },
    {
      label: 'Online Playlists',
      icon: 'i-lucide-list-music',
      to: '/online-playlists',
      active: route.path === '/online-playlists' || route.path.startsWith('/playlists'),
    },
    {
      label: 'DJ Prep',
      icon: 'i-lucide-headphones',
      to: '/preparation',
      active: route.path === '/preparation',
    },
    {
      label: 'Library',
      icon: 'i-lucide-library',
      to: '/library',
      active: route.path === '/library',
    },
  ],
])

onMounted(async () => {
  await checkSlskdStatus()
})

async function checkSlskdStatus() {
  try {
    const res = await $fetch('/api/slskd/status')
    slskdStatus.value = res.status
  }
  catch {
    slskdStatus.value = 'stopped'
  }
}

async function startSlskd() {
  loading.value = true
  try {
    await $fetch('/api/slskd/start', { method: 'POST' })
    await new Promise(r => setTimeout(r, 3000))
    await checkSlskdStatus()
  }
  catch {
    // Status will remain as-is on failure
  }
  loading.value = false
}

async function stopSlskd() {
  loading.value = true
  try {
    await $fetch('/api/slskd/stop', { method: 'POST' })
    await new Promise(r => setTimeout(r, 1000))
    await checkSlskdStatus()
  }
  catch {
    // Status will remain as-is on failure
  }
  loading.value = false
}
</script>
