import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    open: '/examples/'
  },
  build: {
    target: 'es2020'
  }
})
