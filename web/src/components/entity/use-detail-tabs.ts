/**
 * Cơ chế bộ tab của màn hình Chi tiết — phần KHÔNG có giao diện.
 *
 * Tách ra khỏi `entity-detail.tsx` khi Module Thiết kế có vỏ riêng (06/09/2026): hai màn hình
 * bày tab khác nhau nhưng phải cư xử GIỐNG HỆT nhau — cùng tham số `?tab=`, cùng phím mũi
 * tên, cùng cách `replace` để nút Back quay về màn hình Danh sách chứ không lùi qua từng tab.
 * Chép đoạn này sang tệp thứ hai là tạo ra hai bản sẽ trôi khỏi nhau, và bản trôi trước
 * thường là bản trợ năng vì không ai nhìn thấy nó hỏng.
 */

import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface TabLike {
  /** Định danh trong URL (`?tab=khoi-luong`) — dùng tiếng Việt không dấu. */
  id: string;
}

export interface DetailTabsApi<T extends TabLike> {
  /** Định danh đang đọc từ URL — có thể không khớp tab nào (xem `active`). */
  activeId: string;
  /** Tab đang mở; rơi về tab đầu khi `?tab=` trỏ vào chỗ không có. */
  active: T | undefined;
  selectTab: (id: string) => void;
  onTabKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export function useDetailTabs<T extends TabLike>(tabs: T[]): DetailTabsApi<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeId = searchParams.get('tab') ?? tabs[0]?.id ?? '';
  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? tabs[0], [tabs, activeId]);

  function selectTab(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    // `replace` để nút Back của trình duyệt quay về màn hình Danh sách,
    // không phải lùi qua từng tab đã xem.
    setSearchParams(next, { replace: true });
  }

  /**
   * Điều hướng bằng phím mũi tên giữa các tab — bắt buộc của mẫu ARIA tablist.
   *
   * Gán `role="tab"` là nói với trình đọc màn hình "đây là bộ tab", và người dùng bàn phím sẽ
   * lập tức thử phím mũi tên. Khai vai trò mà không cài hành vi thì tệ hơn không khai: người
   * dùng bấm mũi tên, không có gì xảy ra, và họ không biết mình làm sai hay màn hình hỏng.
   *
   * Chọn kiểu KÍCH HOẠT TỰ ĐỘNG (mũi tên là đổi tab luôn) vì `selectTab` dùng `replace` nên
   * không đẩy thêm mục vào lịch sử trình duyệt — người dùng lướt qua các tab bằng mũi tên xong
   * bấm Back vẫn về thẳng màn hình Danh sách.
   */
  function onTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((t) => t.id === active?.id);
    if (index < 0) return;

    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;

    if (target < 0) return;
    event.preventDefault();
    const next = tabs[target];
    if (!next) return;
    selectTab(next.id);
    // Con trỏ bàn phím phải đi theo tab vừa chọn, nếu không lần bấm mũi tên kế tiếp
    // lại tính từ tab cũ.
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return { activeId, active, selectTab, onTabKeyDown };
}
