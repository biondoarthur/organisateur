import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? './' : '/',
  build: {
    rollupOptions: {
      input: mode === 'desktop' ? 'index.html' : 'download.html',
    },
  },
}))
