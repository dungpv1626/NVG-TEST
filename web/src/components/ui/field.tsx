/**
 * Nhãn + ô nhập của một trường biểu mẫu.
 *
 * Bọc ô nhập BÊN TRONG `<label>` để trình đọc màn hình tự liên kết nhãn với ô nhập mà không
 * cần `id`/`htmlFor` — quên cặp id ở một chỗ là ô đó mất tên trong cây trợ năng
 * (Content Guidelines 6.8).
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  /**
   * Giải thích ngắn — dùng khi quy tắc nghiệp vụ không hiển nhiên.
   *
   * Đặt DƯỚI ô nhập, không phải dưới nhãn: nếu nằm trên, trường có chú thích sẽ đẩy ô nhập
   * của nó xuống thấp hơn các trường cùng hàng và cả hàng trông lệch nhau.
   */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="block font-medium">
        {label}
        {required && <span className="ml-0.5 text-status-overdue">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs font-normal text-fg-subtle">{hint}</span>}
    </label>
  );
}
