import path from 'node:path'
import { defineConfig } from 'vite'
export default defineConfig({
  root: process.cwd(),
  // Runtime bytes must be served unchanged: Vite transforms would invalidate pinned hashes.
  publicDir:path.resolve('test-results/python-assets'),
  resolve: { alias: [
    { find: '@/platform', replacement: path.resolve('scripts/ui-simulation/platform.ts') },
    { find: '@shared', replacement: path.resolve('src/shared') },
    { find: '@', replacement: path.resolve('src/renderer') },
  ] },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
})
