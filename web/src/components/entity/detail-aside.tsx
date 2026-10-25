/**
 * Cột phải của trang chi tiết v2 (`NvgDetail`, DESIGN_SYSTEM.md §8): thẻ tối «Bước tiếp theo» và
 * «Chuỗi hồ sơ» đứng cạnh nội dung trên màn hình rộng.
 *
 * Hai khối ấy do `StepTrack` / `RecordChain` dựng, mà hai component này được trang đặt vào khe
 * `progress` của `EntityDetail` — tức là ở cột CHÍNH. Thay vì bắt từng trang truyền thêm một prop,
 * khối nào bọc trong `DetailAside` sẽ được cổng (portal) sang cột phải khi `EntityDetail` có cột ấy
 * (từ `xl`), còn dưới `xl` hoặc ngoài trang chi tiết thì nằm ngay tại chỗ.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Hai chỗ trong cột phải, theo thứ tự trên xuống: thẻ «Bước tiếp theo» rồi «Chuỗi hồ sơ». */
export type AsidePlace = 'next' | 'chain';

interface AsideSlot {
  /** Phần tử đích trong cột phải; `null` khi cột phải không hiện (màn hình hẹp, đang dựng). */
  targets: Record<AsidePlace, HTMLElement | null>;
  /** Báo cho `EntityDetail` biết có khối muốn sang cột phải — để dựng cột khi chưa có hồ sơ liên quan. */
  register: () => () => void;
  /**
   * Tab đang mở cần cả bề ngang (`DetailTab.fullWidth`) — khối của cột phải ẩn hẳn chứ không dồn về đầu
   * cột chính, nơi nó đẩy phần soạn thảo xuống dưới nửa màn hình. Thanh bước vẫn ở trên.
   */
  hidden?: boolean;
}

export const DetailAsideContext = createContext<AsideSlot | null>(null);

/** Màn hình đủ rộng cho cột phải (`xl`, 1280px) — đổi theo khi kéo cửa sổ. */
export function useWideDetail(): boolean {
  const query = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return wide;
}

export function DetailAside({ place, children }: { place: AsidePlace; children: ReactNode }) {
  const slot = useContext(DetailAsideContext);
  const register = slot?.register;
  useEffect(() => register?.(), [register]);
  if (slot?.hidden) return null;
  const target = slot?.targets[place];
  if (target) return createPortal(children, target);
  return <>{children}</>;
}
