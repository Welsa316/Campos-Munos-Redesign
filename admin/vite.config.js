import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// ADMIN_BASE is '/' for the standalone deployment at admin.camulaw.com and
// '/admin/' for the transitional single-service deployment, where the API
// serves this build under camulaw.com/admin (see docs/architecture-split.md).
const base = process.env.ADMIN_BASE || '/'

export default defineConfig({
  base,
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // No source maps in production: the staff portal's code has no reason to
    // be browsable from devtools on a shared office machine.
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
