import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the admin UI proxies API, OAuth and webhook paths to the backend (apps/api).
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': apiTarget,
      '/oauth': apiTarget,
      '/healthz': apiTarget,
    },
  },
})
