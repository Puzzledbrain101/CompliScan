import { defineConfig } from 'vite'

export default defineConfig({
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
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})