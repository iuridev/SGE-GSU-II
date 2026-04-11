import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Adiciona ou garante que a base seja esta para evitar problemas de path no Android
  base: './', 
  build: {
    outDir: 'dist',
  }
})
