/**
 * Cỡ xem tờ vẽ trên màn hình (Haan, 20/09/2026: «bản vẽ output hiện tại đang quá lớn»).
 *
 * Tờ vẽ trước đây luôn kéo kín bề ngang panel. Trên màn hình 1920 thì một tờ A3 ngang rộng gần
 * 1.400 px — phải cuộn dọc mới xem hết, và không nhìn được cả tờ một lúc để soát bố cục.
 *
 * Lựa chọn lưu ở `localStorage` chứ không vào hồ sơ người dùng: đây là sở thích theo MÁY, giống
 * thanh điều hướng thu gọn (`use-sidebar-collapsed.ts`). Cùng một kiến trúc sư ngồi màn hình lớn
 * và mở laptop ngoài công trường muốn hai cỡ khác nhau.
 *
 * Một kho dùng chung cho MỌI tờ trong bước: tờ vector và ảnh do mô hình vẽ nằm cạnh nhau trên
 * cùng màn hình, đổi cỡ một cái mà cái kia giữ nguyên thì không so sánh được nữa. Vì vậy dùng
 * `useSyncExternalStore` thay cho `useState` từng chỗ — mọi tờ đổi cùng lúc.
 */

import { useSyncExternalStore } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';

export const SHEET_SIZES = ['vua', 'lon', 'tran'] as const;
export type SheetSize = (typeof SHEET_SIZES)[number];

const LABELS: Record<SheetSize, string> = {
  vua: 'Vừa',
  lon: 'Lớn',
  tran: 'Tràn khung',
};

/**
 * Chặn TRÊN theo điểm ảnh CSS, không phải bề rộng cố định: màn hình hẹp thì tờ vẫn co theo panel.
 *
 * Mức «Vừa» lấy đúng 720 px của khung xem ảnh mặt bằng (`COMPACT_PX` trong `ai-plan-sheet-image`)
 * — hai khung nằm cạnh nhau trên cùng màn hình, lệch nhau vài chục điểm ảnh thì đọc ra như lỗi.
 */
const MAX_PX: Record<SheetSize, number | null> = {
  vua: 720,
  lon: 1080,
  tran: null,
};

const KEY = 'nvg.tk.ai.co-xem-to-ve';
const MAC_DINH: SheetSize = 'vua';

/** Cửa sổ riêng tư hoặc trình duyệt chặn lưu trữ thì `localStorage` NÉM lỗi — bắt lại. */
function stored(): SheetSize {
  try {
    const value = window.localStorage.getItem(KEY);
    return SHEET_SIZES.find((size) => size === value) ?? MAC_DINH;
  } catch {
    return MAC_DINH;
  }
}

let current: SheetSize = stored();
const listeners = new Set<() => void>();

export function setSheetSize(next: SheetSize): void {
  if (next === current) return;
  current = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // Không lưu được thì lựa chọn chỉ sống trong phiên này — không phải lỗi để báo.
  }
  for (const listener of listeners) listener();
}

export function useSheetSize(): SheetSize {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => MAC_DINH,
  );
}

/** Chặn trên theo điểm ảnh, `null` = không chặn. Dùng khi khung xem còn chặn thêm bằng cỡ gốc. */
export function sheetMaxPx(size: SheetSize): number | null {
  return MAX_PX[size];
}

/** Kiểu bề ngang cho thẻ `<img>` của tờ vẽ — dùng kèm lớp `w-full` sẵn có. */
export function sheetWidthStyle(size: SheetSize): React.CSSProperties {
  const max = MAX_PX[size];
  return max === null ? {} : { maxWidth: `${max}px` };
}

/**
 * Bộ chọn cỡ xem. Đặt MỘT lần cho mỗi bước, ngay trên tờ vector; ảnh do mô hình vẽ nằm dưới cùng
 * bước đi theo lựa chọn này, không có bộ chọn riêng.
 */
export function SheetSizeControl(): React.ReactElement {
  const size = useSheetSize();
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-subtle">Cỡ xem</span>
      <SegmentedControl
        options={SHEET_SIZES}
        value={size}
        onChange={setSheetSize}
        getLabel={(option) => LABELS[option]}
      />
    </div>
  );
}
