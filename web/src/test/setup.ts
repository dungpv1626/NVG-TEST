/**
 * Thiết lập chung cho test giao diện.
 *
 * `@testing-library/jest-dom` thêm các phép khẳng định đọc được thành câu tiếng Anh tự nhiên
 * (`toBeInTheDocument`, `toHaveAttribute`) — quan trọng vì test giao diện phải mô tả điều NGƯỜI
 * DÙNG thấy, không phải cấu trúc DOM bên dưới.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mỗi test dựng lại cây component từ đầu; không dọn thì test sau tìm thấy phần tử của test trước.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * jsdom không có `matchMedia`, mà mã giao diện dùng nó để tôn trọng `prefers-reduced-motion`
 * và để đổi bố cục theo bề ngang. Thiếu hàm này thì component nào đụng tới sẽ ném lỗi.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

/**
 * jsdom chưa có `HTMLInputElement.showPicker` (Chrome 99+, Safari 16+, Firefox 101+).
 *
 * Không bổ sung thì mọi test giao diện chạy trong một trình duyệt giả cũ hơn mọi máy thật, và
 * nhánh có bảng lịch của `DateInput` không bao giờ được kiểm. Đây là lỗ hổng của jsdom, không
 * phải hành vi sản phẩm — nên vá ở đây thay vì hạ yêu cầu của component.
 */
if (typeof HTMLInputElement !== 'undefined' && !HTMLInputElement.prototype.showPicker) {
  HTMLInputElement.prototype.showPicker = function showPicker() {
    /* jsdom không vẽ được bảng lịch thật; test chỉ cần lệnh này tồn tại và không ném lỗi. */
  };
}

/**
 * jsdom cũng chưa có `Element.scrollIntoView`.
 *
 * Thiếu nó, `brief-panel.tsx` gọi trong `requestAnimationFrame` nên lỗi rơi RA NGOÀI bài kiểm:
 * vitest báo «Unhandled Errors», thoát mã 1, mà dòng tổng kết vẫn ghi đủ bài xanh. Ai chỉ đọc
 * dòng tổng kết sẽ tưởng mọi thứ ổn — đúng cái bẫy đã làm bảng kiểm trước đây báo sai.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* Không có khung nhìn thật để cuộn; bài kiểm chỉ cần lệnh này tồn tại. */
  };
}
