import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/skill-graph': { target: 'http://localhost:3001', rewrite: (p) => p.replace('/api/skill-graph', '') },
      '/api/worksheet':   { target: 'http://localhost:3002', rewrite: (p) => p.replace('/api/worksheet', '') },
      '/api/evaluator':   { target: 'http://localhost:3003', rewrite: (p) => p.replace('/api/evaluator', '') },
    },
  },
})
