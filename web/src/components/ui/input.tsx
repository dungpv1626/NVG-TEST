import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // Viền dùng `border-strong`: viền mảnh quá thì ô nhập trông như một dòng chữ thường,
        // người dùng không nhận ra là chỗ gõ được cho tới khi thử bấm vào.
        'h-9 w-full rounded-sm border border-border-strong bg-surface',
        'px-3 text-fg placeholder:text-fg-subtle',
        'transition-[border-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
        'hover:border-fg-subtle',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
        // Viền lỗi dùng màu "Quá hạn" — cùng hệ 5 màu trạng thái, không tạo màu mới.
        'aria-[invalid=true]:border-status-overdue',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
