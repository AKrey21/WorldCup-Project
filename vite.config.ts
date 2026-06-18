import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// On GitHub Pages the app is served from /<repo>/, so the deploy workflow sets
// GITHUB_PAGES=true to emit assets under that base. Local dev/preview use '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/WorldCup-Project/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
