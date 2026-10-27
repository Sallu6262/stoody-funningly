import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    reportCompressedSize: true
  }
})
