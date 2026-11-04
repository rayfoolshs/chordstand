import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/. Set PAGES_BASE in CI;
  // local dev and root deployments stay at /.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
})
