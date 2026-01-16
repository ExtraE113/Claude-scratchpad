import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/edhrec': {
        target: 'https://edhrec.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/edhrec/, '/api'),
      },
      '/json/edhrec': {
        target: 'https://json.edhrec.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/json\/edhrec/, ''),
      },
    },
  },
})
