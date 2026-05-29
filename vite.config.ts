import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    open: '/examples/'
  },
  build: {
    target: 'es2020'
  }
})
