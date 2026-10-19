import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    // Expose VITE_API_BASE_URL to the app bundle
    define: {
      __API_BASE_URL__: JSON.stringify(apiBase)
    },
    server: {
      port: 5173,
      host: true,
      // Dev proxy — only used locally
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true
        }
      }
    }
  }
})
