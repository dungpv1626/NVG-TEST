/**
 * Tải ảnh trích lục/sổ đỏ — Gemini đọc thành cấu trúc cạnh, hệ thống dựng ranh giới rồi điền
 * thẳng vào bảng đỉnh (`case 'polygon'` ở `brief-field.tsx`). Người dùng vẫn xem/sửa từng
 * đỉnh trước khi lưu — đây là bản NHÁP, không phải kết quả cuối.
 *
 * Một request đồng bộ duy nhất (Gemini rồi một phép tính thuần) — chỉ ba trạng thái, không
 * bịa thêm "đang tải/đang phân tích" hai giai đoạn vì không có tín hiệu tiến trình trung gian
 * nào để hiện cho đúng.
 */

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useExtractSiteBoundary,
  type SiteBoundaryExtractionResult,
} from '@/hooks/use-site-boundary-extraction';

interface Props {
  projectId: string;
  onExtract: (result: SiteBoundaryExtractionResult) => void;
}

export function SiteImageUpload({ projectId, onExtract }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const extract = useExtractSiteBoundary();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const result = await extract.mutateAsync({ projectId, file });
      onExtract(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được ảnh. Thử lại sau ít phút.');
    } finally {
      // Cho phép chọn lại đúng tệp vừa rồi (ví dụ sau khi lỗi) — trình duyệt không bắn lại sự
      // kiện `change` nếu giá trị ô không đổi.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={extract.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {extract.isPending ? 'Đang đọc ảnh…' : 'Tải ảnh trích lục'}
      </Button>
      {extract.isPending && <p className="text-fg-subtle">Đang đọc ảnh — có thể mất 15–30 giây.</p>}
      {error && <p className="text-status-overdue">{error}</p>}
    </div>
  );
}
