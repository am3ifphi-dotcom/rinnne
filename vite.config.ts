import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vercel / ローカル / サンドボックスのプレビュー (0.0.0.0 バインド) の
// いずれのホスト名からでも配信できるよう、host 検査は緩めない範囲で許可する。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: { target: 'es2020', outDir: 'dist' },
});
