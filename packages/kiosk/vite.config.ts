import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApi } from './vite-dev-api'

export default defineConfig({
  plugins: [react(), devApi()],
  server: {
    port: 5173,
    // devApi() handles anything with a matching file in api/. These proxies
    // cover the standalone services that are still separate processes.
    proxy: {
      '/api/skill-graph': { target: 'http://localhost:3001', rewrite: (p) => p.replace('/api/skill-graph', '') },
      '/api/worksheet':   { target: 'http://localhost:3002', rewrite: (p) => p.replace('/api/worksheet', '') },
    },
  },
})
