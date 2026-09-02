import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages has no SPA rewrite: a hard load of /graph/foo 404s because no
 * such file exists. Pages serves 404.html for any unmatched path, so shipping a
 * byte-for-byte copy of index.html under that name boots the app with the real
 * URL intact — no redirect dance, no lost path.
 */
function githubPagesSpaFallback() {
  return {
    name: 'gh-pages-spa-fallback',
    closeBundle() {
      const out = resolve(__dirname, 'dist')
      copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Apex domain (wushke.ca) serves from root, not a subpath.
  base: '/',
  plugins: [react(), githubPagesSpaFallback()],
})
