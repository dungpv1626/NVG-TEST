import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-sm border border-border bg-surface',
        'px-3 text-fg placeholder:text-fg-subtle',
        'disabled:cursor-not-allowed disabled:opacity-60',
        // Viền lỗi dùng màu "Quá hạn" — cùng hệ 5 màu trạng thái, không tạo màu mới.
        'aria-[invalid=true]:border-status-overdue',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
