import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Apex domain (wushke.ca) serves from root, not a subpath.
  base: '/',
  plugins: [react()],
})
