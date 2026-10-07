import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { one } from 'one/vite'

export default defineConfig({
  envPrefix: ['VITE_', 'ONE_PUBLIC_'],
  plugins: [
    tailwindcss(),
    one({
      web: { defaultRenderMode: 'spa', deploy: 'node' },
      native: { bundler: 'metro' },
      react: { compiler: 'web' },
      build: { securityScan: 'error' },
      router: { ignoredRouteFiles: ['**/*.test.*'] },
    }),
  ],
})
