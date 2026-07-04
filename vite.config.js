import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // relative base so the build works at any path (GitHub Pages serves from /<repo>/)
  base: './',
  plugins: [react()],
})
