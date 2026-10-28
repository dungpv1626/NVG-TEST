/**
 * Vị trí cho ô nổi tự dựng (bảng lịch, menu nhỏ…) neo theo một phần tử — dùng chung một cách tính.
 *
 * Vì sao cần: ô nổi định vị `absolute` so với ô nhập thì bị khung `overflow` của cột nội dung cắt
 * mất (anh Dũng 28/10/2026, màn ~1.300 px: bảng lịch mất cột T2 / T3 vì ô ngày nằm sát mép trái
 * cột). Ở đây ô nổi được dựng ra `document.body` (portal) và đặt `position: fixed` theo khung nhìn:
 *  - ngang: căn theo mép neo (`align`), rồi kẹp vào trong khung nhìn, chừa lề `margin`;
 *  - dọc: mở xuống dưới neo; dưới không đủ chỗ mà trên đủ thì LẬT lên trên; cả hai không đủ thì
 *    chọn phía rộng hơn và kẹp vào khung nhìn.
 * Cuộn (bất kỳ khung nào) hoặc đổi cỡ cửa sổ thì tính lại.
 *
 * Phần toán (`placeAnchored`) tách riêng, không chạm DOM — có phép thử.
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface PlaceOptions {
  /** Căn mép nào của ô nổi theo mép nào của neo: `start` = mép trái, `end` = mép phải. */
  align?: 'start' | 'end';
  /** Khoảng cách giữa neo và ô nổi, px. */
  gap?: number;
  /** Lề tối thiểu tới mép khung nhìn, px. */
  margin?: number;
}

export interface Placement {
  top: number;
  left: number;
  side: 'below' | 'above';
}

export function placeAnchored(
  anchor: Rect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  { align = 'end', gap = 4, margin = 8 }: PlaceOptions = {},
): Placement {
  // Ngang
  let left = align === 'end' ? anchor.right - panel.width : anchor.left;
  const maxLeft = viewport.width - margin - panel.width;
  left = Math.max(margin, Math.min(left, maxLeft));
  // Ô nổi rộng hơn cả khung nhìn: bám lề trái.
  if (maxLeft < margin) left = margin;

  // Dọc
  const spaceBelow = viewport.height - margin - (anchor.bottom + gap);
  const spaceAbove = anchor.top - gap - margin;
  let side: Placement['side'] = 'below';
  if (panel.height > spaceBelow && (panel.height <= spaceAbove || spaceAbove > spaceBelow)) {
    side = 'above';
  }
  let top = side === 'below' ? anchor.bottom + gap : anchor.top - gap - panel.height;
  top = Math.max(margin, Math.min(top, viewport.height - margin - panel.height));
  if (viewport.height - 2 * margin < panel.height) top = margin;
  return { top: Math.round(top), left: Math.round(left), side };
}

/**
 * Trả `style` cho ô nổi (`position: fixed` + toạ độ). Lần dựng đầu chưa đo được thì ô nổi ẩn
 * (`visibility: hidden`) để không chớp ở chỗ sai.
 */
export function useAnchoredPosition(
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  options: PlaceOptions = {},
): CSSProperties {
  const { align, gap, margin } = options;
  const [pos, setPos] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const update = () => {
      const a = anchor.getBoundingClientRect();
      const next = placeAnchored(
        a,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        { align, gap, margin },
      );
      setPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.side === next.side
          ? prev
          : next,
      );
    };
    update();
    // `capture`: cuộn của MỌI khung (vd <main>), không chỉ cửa sổ.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    // jsdom (phép thử) không có ResizeObserver.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(panel);
    observer?.observe(anchor);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [anchorRef, panelRef, align, gap, margin]);

  return pos
    ? { position: 'fixed', top: pos.top, left: pos.left }
    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' };
}
