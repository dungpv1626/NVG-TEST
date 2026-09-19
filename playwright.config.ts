/**
 * Playwright — kịch bản demo mười cảnh của Module Thiết kế (doc/design/14-phuong-an-demo.md 14.2).
 *
 * Không tự khởi động máy chủ: bài chạy trên đúng bộ đang dùng để trình diễn (Vite 5173, Wrangler
 * 8788, Container 8080, dự án demo đã nạp bằng `workers/scripts/seed-demo-design.ts`). Thiếu
 * thứ nào thì bài nói rõ thiếu gì thay vì dựng một bản khác rồi xanh trên bản đó.
 *
 *     npx playwright test            # từ gốc repo
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'web/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'vi-VN',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
