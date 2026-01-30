// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },

  app: {
    head: {
      titleTemplate: '%s - Music Pipeline',
    },
  },
  compatibilityDate: '2025-07-15',

  eslint: {
    config: {
      stylistic: true,
    },
  },

  vite: {
    server: {
      hmr: {
        // Use client host for HMR WebSocket in Docker
        clientPort: 3000,
      },
      watch: {
        usePolling: true, // Needed for Docker volume mounts
      },
    },
  },
})
