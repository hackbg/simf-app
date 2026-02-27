import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["vite.dev.hack.bg"],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8940',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
