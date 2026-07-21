import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // recharts は d3 系を大量に引き込むため独立チャンクに分離
          // → Rankings ページを開いたときだけ遅延ロードされる
          if (id.includes('recharts') || id.includes('d3-') || id.includes('d3/')) {
            return 'vendor-recharts'
          }
          if (id.includes('firebase')) return 'vendor-firebase'
          // react-router が依存する @remix-run/router も同チャンクに含める
          if (id.includes('react') || id.includes('scheduler') || id.includes('remix-run')) {
            return 'vendor-react'
          }
          // papaparse など残りは動的 import の用途に応じて Rollup が自動分割
        },
      },
    },
  },
})
