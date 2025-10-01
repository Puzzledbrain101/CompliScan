import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  esbuild: {
    jsx: 'automatic'
  },
  css: {
    postcss: {
      plugins: [] // Disable auto-loaded PostCSS/Tailwind config
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'https://compliscan-backend.onrender.com',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})
