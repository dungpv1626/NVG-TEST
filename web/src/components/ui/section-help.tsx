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
  className?: string;
}

export function SectionHelp({ title, steps, note, className }: SectionHelpProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

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
        </div>
      )}
    </span>
  );
}
