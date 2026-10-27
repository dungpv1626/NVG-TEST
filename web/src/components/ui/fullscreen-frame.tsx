/**
 * Khung «Toàn màn hình» dùng chung cho các khung làm việc hai ngăn (anh Dũng 25/10/2026, tab «Soạn hợp đồng»: khung
 * soạn thấp, chữ nhỏ khó đọc; 27/10/2026 áp thêm cho AI Design — bước Mặt bằng, Mặt ngoài).
 *
 * Bấm nút thì khung phủ cả cửa sổ, che header hồ sơ và thanh điều hướng; Esc (khi không gõ trong ô nhập / hộp thoại)
 * hoặc bấm lại để thu về. Hộp thoại (z-50) vẫn nổi trên khung (z-40). Chỉ có từ lg — điện thoại vốn đã một ngăn
 * chiếm trọn bề ngang.
 */

import { Expand, Shrink } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FullscreenFrame({
  top,
  idleClassName,
  className,
  children,
}: {
  /** Phần đầu khung, cạnh nút (mẫu, nút, thông báo…). Vắng thì nút đứng một mình bên phải. */
  top?: ReactNode;
  /** Lớp khi KHÔNG toàn màn hình — thường là chiều cao của khung trong trang. */
  idleClassName?: string;
  className?: string;
  /** Nội dung chính; nên mang `lg:min-h-0 lg:flex-1` để chiếm phần còn lại của khung. */
  children: ReactNode;
}) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!full) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [role="dialog"]')) return;
      setFull(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        full ? 'fixed inset-0 z-40 bg-canvas p-4' : idleClassName,
        className,
      )}
    >
      <div className="flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1">{top}</div>
        <Button
          variant="secondary"
          size="sm"
          className="hidden shrink-0 lg:inline-flex"
          onClick={() => setFull((v) => !v)}
          title={full ? 'Thu về (Esc)' : 'Mở khung phủ cả màn hình'}
        >
          {full ? (
            <>
              <Shrink className="size-4" aria-hidden /> Thu về
            </>
          ) : (
            <>
              <Expand className="size-4" aria-hidden /> Toàn màn hình
            </>
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}
