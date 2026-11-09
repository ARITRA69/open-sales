import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// Workspace packages ship TypeScript source, so bundle them instead of
// leaving them for Node to load at runtime.
const bundleWorkspacePackages = {
  build: { externalizeDeps: { exclude: ['@open-sales/shared'] } }
}

export default defineConfig({
  main: bundleWorkspacePackages,
  preload: bundleWorkspacePackages,
  renderer: {
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') }
    },
    plugins: [react(), tailwindcss()]
  }
})
