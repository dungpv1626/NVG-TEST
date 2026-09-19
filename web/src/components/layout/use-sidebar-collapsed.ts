/**
 * Trạng thái thu gọn của thanh điều hướng trái.
 *
 * Lưu ở `localStorage` chứ không vào hồ sơ người dùng: đây là sở thích theo MÁY. Cùng một
 * người ngồi màn hình 27 inch ở văn phòng thì muốn thanh mở, mở laptop 13 inch ngoài công
 * trường thì muốn thu — ghim vào tài khoản là bắt họ chỉnh lại mỗi lần đổi máy.
 *
 * Chỉ có nghĩa từ khổ `lg` trở lên: dưới mức đó thanh trái không hiện, điều hướng chuyển sang
 * thanh dưới (Webapp Flow 4.8).
 */

import { useCallback, useEffect, useState } from 'react';

const KEY = 'nvg.sidebar.collapsed';

/** Cửa sổ riêng tư hoặc trình duyệt chặn lưu trữ thì `localStorage` NÉM lỗi — bắt lại. */
function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(stored);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      // Không lưu được thì lựa chọn chỉ sống trong phiên này — không phải lỗi để báo.
    }
  }, [collapsed]);

  return { collapsed, toggle: useCallback(() => setCollapsed((v) => !v), []) };
}
