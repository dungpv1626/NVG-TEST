import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Hai nhóm test tách hẳn nhau vì chúng có bản chất khác nhau:
 *
 *  - `db` chạy trên CSDL thật — Supabase TẠI MÁY (`npm run db:start`), không bao giờ là bản demo
 *    trên cloud (`db/src/env.ts` chặn). Đó là cái giá phải trả để chứng minh phân quyền thật sự
 *    đứng vững — test RLS bằng dữ liệu giả không chứng minh được gì. Chạy TUẦN TỰ: 23 tệp dùng
 *    chung một CSDL và dọn dữ liệu theo tiền tố, chạy song song thì tệp này xoá dữ liệu tệp kia
 *    đang dùng (đo 30/09/2026: song song đỏ 23/480, tuần tự xanh 480/480, ~45 giây).
 *  - `logic` là logic thuần của `shared/` và `workers/`, không chạm CSDL, chạy song song.
 *  - `web` chạy hoàn toàn trong bộ nhớ, không chạm mạng, xong dưới một giây.
 *
 * Gộp chung thì mỗi lần sửa một dòng CSS cũng phải chờ toàn bộ vòng kiểm tra phân quyền, và máy
 * không có thông tin kết nối thì không chạy được test giao diện — cả hai đều vô lý.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.wrangler/**'],
    // Dọn dữ liệu test một lần sau CẢ bộ, không phải sau từng tệp — xem `global-teardown.ts`.
    globalSetup: ['db/src/__tests__/global-teardown.ts'],

    projects: [
      {
        extends: true,
        test: {
          name: 'db',
          include: ['db/**/*.test.ts'],
          environment: 'node',
          // `fileParallelism` khai ở cấp project KHÔNG có tác dụng (đo: vẫn xong trong 15 giây và
          // đỏ như chạy song song). Một tiến trình con duy nhất thì Vitest nhận ở cấp project.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'logic',
          include: ['shared/**/*.test.ts', 'workers/**/*.test.ts'],
          environment: 'node',
          /*
           * Hạn 5 giây mặc định của Vitest quá ngắn cho nhóm này.
           *
           * Một phép thử ở đây thường gọi 5–10 lượt RPC NỐI TIẾP nhau tới Supabase ở xa (lập
           * hồ sơ → ba bước kiểm → phê duyệt → ghi nhận chi), mỗi lượt vài trăm mili giây.
           * Mạng chậm hơn thường lệ một chút là vượt 5 giây và test đỏ — đỏ vì HẾT GIỜ, không
           * phải vì phân quyền hay nghiệp vụ sai.
           *
           * Loại đỏ đó tệ hơn không có test: nó tốn một lượt chạy lại mới biết là báo động
           * giả, và làm người đọc quen với việc "vài test đỏ là chuyện thường" — đúng lúc có
           * lỗi thật thì không ai để ý. Đã xác minh: cùng bộ test, cùng thời điểm, đỏ 6 chỗ
           * với hạn 5 giây và xanh toàn bộ với hạn 30 giây.
           */
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./web/src', import.meta.url)),
            // Module ảo do vite-plugin-pwa sinh lúc dựng bản thật — xem `stubs/pwa-register.ts`.
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./web/src/test/stubs/pwa-register.ts', import.meta.url),
            ),
          },
        },
        test: {
          name: 'web',
          include: ['web/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./web/src/test/setup.ts'],
          globals: true,
        },
      },
    ],
  },
});
