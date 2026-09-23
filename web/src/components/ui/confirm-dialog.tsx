/**
 * Hộp thoại xác nhận NỔI GIỮA MÀN HÌNH — dùng cho việc phải hỏi lại trước khi làm.
 *
 * Vì sao tự dựng chứ không `window.confirm`: nút của hộp gốc là "OK"/"Cancel" theo ngôn ngữ của
 * TRÌNH DUYỆT, không ép sang tiếng Việt được (CLAUDE.md 4.1) — và nhân sự NVG có người không đọc
 * được tiếng Anh. Hộp này còn nói thêm được hệ quả của thao tác, thứ `window.confirm` không có chỗ.
 *
 * Bốn điều của một hộp thoại dùng được bằng bàn phím, cài sẵn ở đây để mỗi màn hình không phải nhớ:
 * Esc đóng · bấm ra ngoài đóng · mở lên thì con trỏ nhảy vào nút chính · đóng xong trả con trỏ về
 * đúng chỗ đã bấm. Nền phía sau khoá cuộn, nếu không trang dài vẫn trôi sau lưng hộp.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Huỷ',
  pending = false,
  danger = false,
  className,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** Hệ quả của thao tác — nói rõ cái gì mất, cái gì còn. */
  children: ReactNode;
  confirmLabel: string;
  /**
   * `null` = KHÔNG có nút thứ hai — hộp chỉ để báo một tin, không có gì để huỷ.
   *
   * Hai nút cho một lời báo là bắt người đọc chọn giữa hai thứ giống hệt nhau: «Huỷ» và
   * «Đã hiểu» cùng đóng hộp và cùng không làm gì. Bấm ra ngoài và Esc vẫn đóng như thường.
   */
  cancelLabel?: string | null;
  pending?: boolean;
  /** Việc không hoàn tác được: nút chính màu đỏ (CGD 4.5). */
  danger?: boolean;
  /** Lớp của tấm hộp — trang `/tk/*` truyền bộ token riêng của nó vào đây. */
  className?: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    confirmRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={cn(
          'w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-overlay',
          className,
        )}
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-sm opacity-80">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          {cancelLabel !== null && (
            <Button variant="subtle" onClick={onCancel} disabled={pending}>
              {cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmRef}
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
