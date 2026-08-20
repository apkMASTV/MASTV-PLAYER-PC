import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Un sourcemap devolvería el código original legible, anulando la ofuscación
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Todo lo de terceros va a un chunk aparte que NO se ofusca:
          // hls.js y mpegts.js construyen sus workers a partir del código
          // fuente en tiempo de ejecución y la ofuscación los rompería.
          // Así el chunk de entrada queda con código propio únicamente.
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
