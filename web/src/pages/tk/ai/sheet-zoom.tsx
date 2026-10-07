/**
 * Xem tờ vẽ to hết màn hình (07/10/2026).
 *
 * Tự dựng lớp phủ chứ không gọi `requestFullscreen()`: chế độ toàn màn hình của trình duyệt tự chèn
 * dòng nhắc «Press Esc to exit full screen» theo ngôn ngữ của TRÌNH DUYỆT — đúng loại chữ tự sinh
 * CLAUDE.md 4.1 cấm. Ảnh vẫn qua `<img>` (tên phòng do mô hình sinh là nội dung không tin được).
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function SheetViewer({
  src,
  alt,
  title,
  onClose,
}: {
  src: string;
  alt: string;
  title: string;
  onClose: () => void;
}): React.ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  // Không dựng qua portal: phần AI chỉ dùng thành phần giao diện chung (`ai-independence.test.ts`),
  // và `fixed inset-0` đủ phủ cả màn hình.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      onClick={onClose}
    >
      <div className="flex items-center gap-3 px-4 py-2 text-white">
        <p className="mr-auto font-medium">{title}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-3 hover:bg-white/10"
        >
          <X className="size-4" aria-hidden />
          Đóng
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <img
          src={src}
          alt={alt}
          onClick={(event) => event.stopPropagation()}
          className="mx-auto max-h-full max-w-full rounded-md bg-white object-contain"
        />
      </div>
    </div>
  );
}
