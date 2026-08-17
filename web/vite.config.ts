import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    // 开发环境下把 /api 请求代理到后端，避免跨域
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Element Plus 体积较大，调整告警阈值并手动拆分第三方库，提升首屏加载
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'axios'],
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
        },
      },
    },
  },
});
