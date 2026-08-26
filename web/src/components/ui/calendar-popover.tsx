/**
 * Bảng lịch chọn ngày, viết bằng TIẾNG VIỆT.
 *
 * Vì sao không dùng bảng lịch gốc của trình duyệt: nó hiển thị theo NGÔN NGỮ CỦA TRÌNH DUYỆT,
 * không theo `lang` của trang. Trên Chrome cài tiếng Anh — rất phổ biến trên máy văn phòng ở
 * Việt Nam — nó hiện "September 2026" và hàng thứ "Su Mo Tu We Th Fr Sa", và không có thuộc
 * tính nào ép được. Nhân sự NVG có người không đọc được tiếng Anh; một bảng lịch như vậy là
 * không dùng được, chứ không phải chỉ khó nhìn (PRD 6, CGD 4.1).
 *
 * Tuần bắt đầu từ THỨ HAI theo lịch Việt Nam, không phải Chủ nhật như mặc định của Mỹ.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isoDateToDisplay } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Nhãn cột, bắt đầu từ Thứ Hai. Viết tắt vì cột chỉ rộng ~36px. */
const WEEKDAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

/** Ngày trong tuần theo lịch Việt: Thứ Hai = 0 … Chủ nhật = 6. */
function vietnameseWeekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

function toIso(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export interface CalendarPopoverProps {
  /** Ngày đang chọn, dạng ISO `yyyy-mm-dd`. Rỗng thì mở ở tháng hiện tại. */
  selected: string;
  /** Cận dưới/cận trên dạng ISO — ngày ngoài khoảng bị khoá ngay trên lịch. */
  min?: string;
  max?: string;
  /** Hôm nay dạng ISO — truyền vào để test không phụ thuộc đồng hồ máy. */
  today: string;
  onSelect: (isoValue: string) => void;
  onClose: () => void;
}

export function CalendarPopover({
  selected,
  min,
  max,
  today,
  onSelect,
  onClose,
}: CalendarPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Tháng đang xem: mở ở tháng của ngày đã chọn, chưa chọn gì thì mở ở tháng hiện tại.
  const [view, setView] = useState(() => {
    const anchor = selected || today;
    return { year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 };
  });

  // Đóng bằng phím Esc: bàn phím ngoài cắm vào máy tính bảng vẫn phải dùng được.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bấm ra ngoài thì đóng — thao tác quen thuộc, và tránh bảng lịch che mất phần biểu mẫu
  // phía dưới khi người dùng đã chuyển sang ô khác.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    // `setTimeout` để không bắt luôn chính cú bấm vừa mở bảng.
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onPointerDown));
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const firstOfMonth = new Date(Date.UTC(view.year, view.month, 1));
  const leadingBlanks = vietnameseWeekday(firstOfMonth);
  const total = daysInMonth(view.year, view.month);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chọn ngày"
      className={cn(
        'absolute top-full right-0 z-20 mt-1 w-72 rounded-lg border border-border',
        'bg-surface p-3 shadow-overlay',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="subtle"
          size="sm"
          type="button"
          aria-label="Tháng trước"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        {/* "Tháng 9 năm 2026" chứ không "September 2026" — và không viết tắt tháng bằng số La Mã. */}
        <span aria-live="polite" className="font-medium">
          Tháng {view.month + 1} năm {view.year}
        </span>
        <Button
          variant="subtle"
          size="sm"
          type="button"
          aria-label="Tháng sau"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1 text-xs font-medium text-fg-subtle">
            {label}
          </span>
        ))}

        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}

        {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
          const iso = toIso(view.year, view.month, day);
          const outOfRange = (min !== undefined && iso < min) || (max !== undefined && iso > max);
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <button
              key={day}
              type="button"
              disabled={outOfRange}
              // Trình đọc màn hình đọc đủ ngày tháng năm, không chỉ con số trơ trọi.
              aria-label={isoDateToDisplay(iso)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              onClick={() => {
                onSelect(iso);
                onClose();
              }}
              className={cn(
                'flex h-9 items-center justify-center rounded-sm text-sm tabular-nums',
                'transition-colors duration-(--motion-fast)',
                'hover:bg-surface-hover',
                'focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
                'disabled:pointer-events-none disabled:opacity-40',
                isSelected && 'bg-brand text-white hover:bg-brand',
                // Hôm nay chỉ viền, không tô nền — nền là dấu hiệu của ngày ĐANG CHỌN.
                !isSelected && isToday && 'ring-1 ring-border-strong ring-inset',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <Button
          variant="subtle"
          size="sm"
          type="button"
          disabled={(min !== undefined && today < min) || (max !== undefined && today > max)}
          onClick={() => {
            onSelect(today);
            onClose();
          }}
        >
          Hôm nay
        </Button>
        <Button variant="subtle" size="sm" type="button" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </div>
  );
}
