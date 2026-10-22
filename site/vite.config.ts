import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Версия на момент сборки — чтобы номер был виден сразу, не дожидаясь ответа GitHub
// (а если GitHub не ответит из-за лимита запросов, он останется виден вообще).
const version =
  JSON.parse(readFileSync(new URL('./changelog.json', import.meta.url), 'utf8')).releases[0]?.version ??
  `1.1.${execSync('git rev-list --count HEAD').toString().trim()}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __NOCTURNE_VERSION__: JSON.stringify(version) },
  build: {
    rollupOptions: {
      input: {
        index: new URL('./index.html', import.meta.url).pathname,
        start: new URL('./start.html', import.meta.url).pathname,
      },
    },
  },
})
