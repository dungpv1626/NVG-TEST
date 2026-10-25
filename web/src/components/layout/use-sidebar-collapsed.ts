/**
 * Trạng thái thanh điều hướng trái: mở (kèm bề rộng), thu gọn thành dải biểu tượng, hoặc ẩn hẳn.
 *
 * Lưu ở `localStorage` chứ không vào hồ sơ người dùng: đây là sở thích theo MÁY. Cùng một
 * người ngồi màn hình 27 inch ở văn phòng thì muốn thanh mở, mở laptop 13 inch ngoài công
 * trường thì muốn thu — ghim vào tài khoản là bắt họ chỉnh lại mỗi lần đổi máy.
 *
 * Ẩn hẳn và kéo đổi bề rộng (anh Dũng 25/10/2026): «thanh nav dọc có thể ẩn đi và kéo ra thu vào để tăng diện tích
 * nhìn» — kéo mép phải để đổi bề rộng, kéo hẹp quá thì thu thành dải biểu tượng, kéo tiếp thì ẩn.
 *
 * Chỉ có nghĩa từ khổ `lg` trở lên: dưới mức đó thanh trái không hiện, điều hướng chuyển sang
 * thanh dưới (Webapp Flow 4.8).
 */

import { useCallback, useEffect, useState } from 'react';

export type SidebarMode = 'open' | 'rail' | 'hidden';

/** Bề rộng thanh khi mở, px. Mặc định = `w-62` cũ. */
export const SIDEBAR_WIDTH_DEFAULT = 248;
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 360;
/** Kéo hẹp dưới mức này thì thu thành dải biểu tượng; dưới mức sau thì ẩn hẳn. */
export const SIDEBAR_RAIL_BELOW = 160;
export const SIDEBAR_HIDE_BELOW = 56;

const KEY = 'nvg.sidebar';
/** Khoá cũ (chỉ có thu / mở) — đọc để người đã thu thanh không thấy nó bật ra sau khi cập nhật. */
const LEGACY_KEY = 'nvg.sidebar.collapsed';

interface SidebarState {
  mode: SidebarMode;
  width: number;
}

function clampWidth(w: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(w)));
}

/** Cửa sổ riêng tư hoặc trình duyệt chặn lưu trữ thì `localStorage` NÉM lỗi — bắt lại. */
function stored(): SidebarState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SidebarState>;
      const mode = s.mode === 'rail' || s.mode === 'hidden' ? s.mode : 'open';
      return {
        mode,
        width: typeof s.width === 'number' ? clampWidth(s.width) : SIDEBAR_WIDTH_DEFAULT,
      };
    }
    if (window.localStorage.getItem(LEGACY_KEY) === '1') {
      return { mode: 'rail', width: SIDEBAR_WIDTH_DEFAULT };
    }
  } catch {
    // dùng mặc định
  }
  return { mode: 'open', width: SIDEBAR_WIDTH_DEFAULT };
}

export function useSidebarLayout(): {
  mode: SidebarMode;
  width: number;
  setMode: (mode: SidebarMode) => void;
  /** Bề rộng đang kéo (px, chưa kẹp) — tự chuyển sang thu gọn / ẩn khi kéo đủ hẹp. */
  dragTo: (px: number) => void;
  /** Nút thu gọn: mở ↔ dải biểu tượng. */
  toggle: () => void;
} {
  const [state, setState] = useState<SidebarState>(stored);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Không lưu được thì lựa chọn chỉ sống trong phiên này — không phải lỗi để báo.
    }
  }, [state]);

  const setMode = useCallback((mode: SidebarMode) => setState((s) => ({ ...s, mode })), []);
  const dragTo = useCallback((px: number) => {
    setState((s) => {
      if (px < SIDEBAR_HIDE_BELOW) return { ...s, mode: 'hidden' };
      if (px < SIDEBAR_RAIL_BELOW) return { ...s, mode: 'rail' };
      return { mode: 'open', width: clampWidth(px) };
    });
  }, []);
  const toggle = useCallback(
    () => setState((s) => ({ ...s, mode: s.mode === 'open' ? 'rail' : 'open' })),
    [],
  );

  return { mode: state.mode, width: state.width, setMode, dragTo, toggle };
}
