import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    plugins: [
      react(),
      tailwindcss(),

      /**
       * Progressive Web App — cài được lên màn hình chính điện thoại và chạy toàn màn hình.
       *
       * ⚠️ PHẠM VI ĐÃ MỞ RỘNG so với Tech Stack 3.2 (chỉ định PWA cho Kho/công trường):
       * theo yêu cầu của Haan, TOÀN BỘ ứng dụng phải đạt chuẩn PWA để nhân sự dùng được
       * trên điện thoại. Xem CLAUDE.md Mục 6.5.
       */
      VitePWA({
        // 'prompt' chứ KHÔNG 'autoUpdate': tự nạp lại giữa chừng là mất trắng biểu mẫu
        // người dùng đang nhập dở (Webapp Flow 6.3). Hỏi trước, họ chọn lúc nào tải lại.
        registerType: 'prompt',
        injectRegister: null,

        includeAssets: ['favicon.svg', 'favicon-32.png', 'icons/apple-touch-icon-180.png'],

        manifest: {
          id: '/',
          name: 'Hệ thống Quản trị Nhà Việt Group',
          // Tên hiển thị dưới biểu tượng trên màn hình chính — Android cắt sau ~12 ký tự.
          short_name: 'Quản trị NVG',
          description:
            'Hệ thống quản trị nội bộ Nhà Việt Group: khách hàng, dự án, thi công, kho, kế toán, nhân sự.',
          lang: 'vi',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // Trình duyệt nào không hỗ trợ 'standalone' thì lùi dần, không rơi thẳng về tab.
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          theme_color: '#0C66E4',
          background_color: '#FFFFFF',
          categories: ['business', 'productivity'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Bản riêng cho maskable: hệ điều hành cắt biểu tượng theo hình dạng của nó,
            // dùng chung một tệp là bị cắt mất chữ ở máy Android bo tròn mạnh.
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          // Bấm giữ biểu tượng trên màn hình chính là vào thẳng việc, không qua Dashboard.
          shortcuts: [
            {
              name: 'Việc cần làm',
              short_name: 'Việc cần làm',
              url: '/viec-can-lam',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Cơ hội kinh doanh',
              short_name: 'Cơ hội',
              url: '/crm/co-hoi',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Khách hàng',
              short_name: 'Khách hàng',
              url: '/crm/khach-hang',
              icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },

        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
          // SPA: mọi đường dẫn đều do React Router xử lý, nên khi ngoại tuyến phải trả về
          // khung ứng dụng thay vì trang lỗi của trình duyệt.
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // Đi cùng registerType 'prompt': bản mới chỉ tiếp quản khi người dùng đồng ý.
          skipWaiting: false,
          // Bản đồ mã nguồn nặng gấp nhiều lần mã thật, không có lý do nằm trong cache máy người dùng.
          globIgnores: ['**/*.map'],

          runtimeCaching: [
            {
              // Phông chữ Inter tải từ Google Fonts — không cache thì mở ngoại tuyến là
              // chữ nhảy sang phông dự phòng, cả giao diện lệch đi.
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          // ⚠️ CỐ Ý KHÔNG cache phản hồi của Supabase.
          // Dữ liệu ở đây được RLS bảo vệ theo từng người dùng; để một bản sao nằm trong
          // cache của trình duyệt là dữ liệu vẫn đọc được sau khi đăng xuất, trên chính
          // chiếc điện thoại đó (PRD 5.2, NEN-07). Ngoại tuyến THẬT cho Kho/công trường là
          // quyết định còn treo (KHO-09) và phải làm bằng Dexie + hàng đợi đồng bộ có kiểm
          // soát, không phải bằng một dòng cấu hình cache ở đây.
        },

        devOptions: {
          // Bật service worker ở chế độ dev gây nhầm lẫn khi gỡ lỗi (mã cũ bị phục vụ lại).
          // Kiểm thử PWA bằng `npm run build && npm run preview`.
          enabled: false,
        },
      }),
    ],
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
