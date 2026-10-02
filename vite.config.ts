import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

import esbuild from 'esbuild'

function buildPreloadsPlugin() {
  function rebuild() {
    esbuild.buildSync({
      entryPoints: ['electron/preload.ts'],
      outfile: 'dist-electron/preload.cjs',
      bundle: true,
      format: 'cjs',
      platform: 'node',
      external: ['electron'],
    })
    esbuild.buildSync({
      entryPoints: ['electron/views/viewPreload.ts'],
      outfile: 'dist-electron/viewPreload.cjs',
      bundle: true,
      format: 'cjs',
      platform: 'node',
      external: ['electron'],
    })
  }

  return {
    name: 'build-preloads',
    buildStart() {
      rebuild()
    },
    handleHotUpdate({ file }) {
      if (file.includes('preload') || file.includes('viewPreload')) {
        rebuild()
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    buildPreloadsPlugin(),
    electron([
      {
        entry: 'electron/main.ts',
      },
    ]),
    renderer(),
  ],
})
