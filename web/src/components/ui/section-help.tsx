/**
 * Hướng dẫn ngắn cho một phần màn hình — nút dấu hỏi mở ra một bảng nhỏ.
 *
 * Vì sao cần: Module Thiết kế có nhiều phần mà thao tác đúng KHÔNG suy ra được từ giao diện
 * ("chốt chương trình không gian rồi mới dựng được phương án", "chọn phương án là đổi bản
 * đang hiệu lực"). Trước đây những điều đó chỉ nằm trong tài liệu, nên người dùng lần đầu
 * phải đoán. Bảng này viết thẳng ba điều: phần này là gì · cần làm gì · lưu ý gì.
 *
 * Nội dung do nơi gọi truyền vào và giữ NGẮN — ba tới bốn dòng. Đây là chỉ dẫn thao tác, không
 * phải tài liệu; dài hơn thế thì người dùng đóng lại mà không đọc.
 *
 * Không dùng `title` của trình duyệt: chữ đó chỉ hiện khi rê chuột (điện thoại không có), hiện
 * chậm, và không xuống dòng được.
 *
 * ## Tự mở lần đầu (`autoOpenKey`)
 *
 * Khai `autoOpenKey` thì bảng TỰ mở ngay khi phần đó hiện ra, không chờ ai bấm dấu hỏi — người
 * chưa dùng bao giờ không biết có hướng dẫn để mà tìm. Chỉ tự mở MỘT lần cho mỗi phần trên mỗi
 * trình duyệt (ghi vào `localStorage`); lần sau bấm dấu hỏi để mở lại. Bật lên mỗi lần vào tab
 * là thành thứ người dùng bấm bỏ theo phản xạ, và khi đó nó không còn được đọc nữa.
 *
 * Chỉ khai ở phần lấp đầy MỘT tab. Bốn khối con của tab Phương án cùng hiện một lúc, tự mở cả
 * bốn là bốn bảng đè lên nhau.
 */

import { HelpCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SectionHelpProps {
  /** Tên phần — hiện làm tiêu đề bảng và dùng cho nhãn trợ năng của nút. */
  title: string;
  /** Việc cần làm, mỗi ý một dòng. Câu mệnh lệnh, không đại từ nhân xưng (CGD 4.4). */
  steps: string[];
  /** Một lưu ý duy nhất, nếu có — thứ dễ làm sai nhất ở phần này. */
  note?: string;
  /**
   * Khai để bảng tự mở lần ĐẦU người dùng vào phần này. Chuỗi phải ổn định giữa các lần triển
   * khai — nó là khoá ghi nhớ, đổi chuỗi là bảng tự mở lại với người đã đọc rồi.
   */
  autoOpenKey?: string;
  className?: string;
}

/** Khoá ghi nhớ "đã tự mở rồi" trong `localStorage`. */
const SEEN_PREFIX = 'nvg.huong-dan.';

/**
 * Đã tự mở bảng này bao giờ chưa.
 *
 * Bọc try/catch vì `localStorage` NÉM lỗi chứ không trả rỗng ở chế độ ẩn danh và khi trình duyệt
 * chặn lưu dữ liệu trang. Đọc hỏng thì coi như chưa từng mở: thà hiện thừa một lần còn hơn nuốt
 * mất hướng dẫn của người lần đầu dùng.
 */
function alreadySeen(key: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_PREFIX + key) !== null;
  } catch {
    return false;
  }
}

function rememberSeen(key: string): void {
  try {
    window.localStorage.setItem(SEEN_PREFIX + key, '1');
  } catch {
    // Không ghi được thì bảng sẽ tự mở lại lần sau — phiền, nhưng không hỏng gì.
  }
}

export function SectionHelp({ title, steps, note, autoOpenKey, className }: SectionHelpProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!autoOpenKey || alreadySeen(autoOpenKey)) return;
    rememberSeen(autoOpenKey);
    setOpen(true);
  }, [autoOpenKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // `setTimeout` để không bắt luôn chính cú bấm vừa mở bảng.
    const id = window.setTimeout(() => document.addEventListener('pointerdown', onPointerDown));
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Hướng dẫn: ${title}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full text-fg-subtle',
          'hover:bg-surface-sunken hover:text-fg focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand',
          open && 'bg-surface-sunken text-fg',
        )}
      >
        <HelpCircle className="size-4" aria-hidden />
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`Hướng dẫn: ${title}`}
          className={cn(
            'absolute left-0 top-8 z-30 w-80 max-w-[calc(100vw-2rem)] rounded border',
            'border-border bg-surface p-3 shadow-overlay',
          )}
        >
          <p className="font-medium">{title}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-fg-subtle">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {note && <p className="mt-2 text-status-pending">{note}</p>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(
              'mt-3 text-brand hover:underline focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            Đã hiểu
          </button>
        </div>
      )}
    </span>
  );
}
