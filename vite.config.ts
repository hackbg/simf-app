import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { alias } from './fadroma/vite.config.ts';

export default defineConfig({
  resolve: { alias },
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
