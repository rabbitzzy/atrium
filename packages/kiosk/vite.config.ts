import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devApi } from './vite-dev-api'

export default defineConfig({
  plugins: [react(), devApi()],
  server: {
    port: 5173,
    // No proxies. skill-graph and worksheet-print are mounted inside the api
    // entry point now, so devApi() serves them along with everything else —
    // proxying them to ports nothing listens on is how local dev started
    // disagreeing with production in the first place.
  },
})
