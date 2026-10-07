import { defineConfig } from 'vite'
import { one } from 'one/vite'

export default defineConfig({
  plugins: [
    one({
      web: {
        defaultRenderMode: 'spa',
        deploy: 'node',
      },
      native: {
        bundler: 'metro',
      },
      react: {
        compiler: 'web',
      },
      build: {
        securityScan: 'error',
      },
      router: {
        ignoredRouteFiles: ['**/*.test.*'],
      },
    }),
  ],
})
