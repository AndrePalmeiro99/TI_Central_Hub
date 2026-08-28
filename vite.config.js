import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: {
    host: true,
    proxy: {
      '/onety-proxy': {
        target: 'https://back.cfonety.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/onety-proxy/, ''),
        secure: false,
        headers: {
          'x-api-key': '1292d747a0e28f7b1b2c1f81f74af2c492c8fde4999cb34b5107b2f1a4e62290'
        }
      }
    }
  }
})

