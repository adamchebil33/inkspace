import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Cloudflare plugin runs the Worker (API + Durable Objects) inside the
// Vite dev server, so `npm run dev` is the whole app on one port.
export default defineConfig({
  plugins: [react(), cloudflare()],
})
