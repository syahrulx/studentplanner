import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bind explicitly to IPv4 localhost. Some macOS/sandbox environments
  // reject Vite's default IPv6 (::1) listener with EPERM before the server
  // can open port 5173.
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Let Vite select the next available port when a stale process still owns
    // 5173. This keeps `npm run dev` usable instead of failing outright.
    strictPort: false,
  },
})
