import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.wrangler/**'],
    environment: 'node',
    // Dọn dữ liệu test một lần sau CẢ bộ, không phải sau từng tệp — xem `global-teardown.ts`.
    globalSetup: ['db/src/__tests__/global-teardown.ts'],
  },
});
