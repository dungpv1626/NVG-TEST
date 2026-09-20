// @ts-check
/**
 * Cấu hình eslint của NVG (20/09/2026).
 *
 * Trước hôm nay `package.json` khai `"lint": "eslint ."` mà kho KHÔNG có eslint lẫn tệp cấu hình
 * nào — câu lệnh chạy ra đúng một dòng «eslint: not found». Tức là suốt thời gian ấy không ai bị
 * chặn bởi một luật nào, trong khi bảng kiểm trước commit vẫn ghi «lint».
 *
 * Chọn luật theo một tiêu chí: luật phải bắt được LỖI, không phải bắt cách viết. Việc định dạng đã
 * có prettier lo, nên ở đây không có luật nào về dấu cách, dấu chấm phẩy hay thứ tự import.
 *
 * Nhóm luật đắt nhất của dự án này là nhóm bất đồng bộ (`no-floating-promises`,
 * `no-misused-promises`, `await-thenable`): Worker, Supabase và Workflow đều trả Promise, và một
 * `await` bị quên KHÔNG làm test đỏ — nó chỉ làm dòng dữ liệu ghi thiếu lúc chạy thật.
 *
 * Nhóm `no-unsafe-*` cố ý TẮT: `@supabase/supabase-js` trả `any` cho mọi truy vấn, nên bật lên là
 * hàng trăm cảnh báo ở đúng chỗ code vốn đã phải tự kiểm bằng tay. Bật lại được khi nào sinh type
 * cho CSDL (`supabase gen types`) — lúc ấy cảnh báo mới chỉ đúng chỗ thật sự mất kiểu.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Sinh tự động, tải về, hoặc không phải mã của kho này.
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'compute/**',
      'doc/**',
      'web/dev-dist/**',
      'shared/src/design/*.generated.ts',
      'shared/src/design/index.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // ── Tắt: nhiễu vì CSDL chưa có type sinh ra (xem đầu tệp) ─────────────────────────
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // `String(x)` với `x: unknown` là CÁCH CỐ Ý của kho này khi dựng câu lỗi cho người dùng
      // (`use-error-message.ts`), và `FormData.get()` trả `string | File` nên cũng rơi vào đây.
      // Biến thể hay gặp nhất — nhét vật thể vào chuỗi khuôn — vẫn bị
      // `restrict-template-expressions` bắt. Phần KHÔNG còn ai canh sau khi tắt: `String(x)` với
      // `x` là vật thể, ví dụ `FormData.get()` trả `File` thì ghi xuống CSDL chuỗi «[object File]».
      // Bật lại được khi nào có type sinh cho CSDL.
      '@typescript-eslint/no-base-to-string': 'off',
      // TẮT vì luật này sai ở đúng chỗ nó hay kêu nhất: `res.json()` và `step.do()` trả `any` hoặc
      // một kiểu hợp rộng, nên `as {…}` bị coi là «thừa» trong khi nó chính là chỗ duy nhất khai
      // kiểu. Thử bật và cho máy tự sửa 244 chỗ ngày 20/09/2026: `tsc` đỏ ngay ở
      // `artifact-store.ts` và `workflows/ai-design.ts`. Kiểu thừa thật thì `tsc` không kêu, còn
      // kiểu bị xoá nhầm thì hỏng lúc chạy — đổi ngược hẳn với thứ cần canh.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // TẮT: năm chỗ còn lại đều là hàm khai `async` để khớp chữ ký của giao diện hoặc của runtime
      // (`ComputeBackend`, `scheduled` của Worker, hàm truyền vào `step.do`), chứ không phải quên
      // `await`. Chỗ quên `await` thật thì `no-floating-promises` bắt, và luật đó vẫn bật.
      '@typescript-eslint/require-await': 'off',
      // Hàm bất đồng bộ truyền vào thuộc tính JSX (`onClick={async () => …}`) là cách viết thường
      // của React; phần còn lại của luật — truyền vào chỗ đợi giá trị, hoặc vào điều kiện — vẫn giữ.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // ── Giữ nhưng nới: biến bỏ đi đặt tên `_` là cách bỏ trường có chủ đích ───────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tệp cấu hình của công cụ: cố ý nằm ngoài mọi tsconfig của kho, nên không kiểm theo kiểu được.
    files: [
      '*.config.ts',
      'web/*.config.ts',
      'db/*.config.ts',
      'playwright.config.ts',
      'web/e2e/**/*.ts',
      // Script chạy bằng `npx tsx`, cố ý ngoài mọi tsconfig của kho.
      'scripts/**/*.ts',
    ],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Tệp cấu hình và script chạy bằng Node: không nằm trong tsconfig nào nên không kiểm theo kiểu.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Dependency thiếu trong `useEffect` là lỗi dữ liệu cũ nằm lại trên màn hình — đúng loại lỗi
      // không ai thấy khi bấm thử một lần.
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Bài kiểm được phép dựng dữ liệu sai kiểu có chủ đích để kiểm hàng rào.
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', '**/e2e/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
