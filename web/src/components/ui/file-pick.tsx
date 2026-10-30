/**
 * Chọn / chụp một tệp bằng nút tiếng Việt.
 *
 * Ô `<input type="file">` gốc tự sinh chữ theo NGÔN NGỮ TRÌNH DUYỆT («Choose File», «No file chosen»)
 * — không ép được bằng `lang` (CLAUDE.md 4.1). Ô gốc ẩn đi, nút và dòng tên tệp do trang tự viết.
 * Trước đây ba khung ký của phân hệ Cho thuê (phiếu giao, biên bản thu hồi, biên bản điều chuyển)
 * để lộ ô gốc (chạy thử NVS 30/10/2026).
 */

import { useRef } from 'react';
import { Camera, Paperclip } from 'lucide-react';
import { Button } from './button';

export function FilePick({
  accept,
  capture,
  file,
  onChange,
  label = 'Chụp hoặc chọn ảnh',
}: {
  accept?: string;
  /** `environment` mở thẳng camera sau trên điện thoại. */
  capture?: 'environment' | 'user';
  file: File | null;
  onChange: (file: File | null) => void;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()}>
        {capture ? (
          <Camera className="size-4" aria-hidden />
        ) : (
          <Paperclip className="size-4" aria-hidden />
        )}{' '}
        {label}
      </Button>
      <span className="text-sm text-fg-subtle">{file ? file.name : 'Chưa chọn tệp'}</span>
    </div>
  );
}
