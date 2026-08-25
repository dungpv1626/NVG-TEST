import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Tech Stack Mục 2.1: SPA tĩnh, KHÔNG dùng Server-Side Rendering —
 * đây là ứng dụng quản trị nội bộ, không cần SEO; toàn bộ trang tĩnh phục vụ
 * qua CDN của Cloudflare Pages, không cần máy chủ Node.js riêng để render.
 */
export default defineConfig(({ mode }) => {
  // Biến môi trường nằm ở GỐC repo (một .env dùng chung cho cả workspace),
  // không phải trong web/.
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), 'VITE_');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      // Chỉ đưa ra trình duyệt khóa CÔNG KHAI (anon key) — bị RLS giới hạn hoàn toàn.
      // Khóa service_role KHÔNG BAO GIỜ xuất hiện ở đây (Tech Stack 5.6).
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
    server: { port: 5173 },
    build: { outDir: 'dist', sourcemap: true },
  };
});
