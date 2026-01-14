import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Planning-Poker/'  // ⚠️ Remplacez par le nom exact de votre repo
})