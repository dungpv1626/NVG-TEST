/**
 * Nút bấm.
 *
 * Content Guidelines 6.3: màu thương hiệu dành riêng cho DUY NHẤT MỘT hành động chính
 * trên mỗi màn hình — vì vậy `primary` phải dùng tiết chế, mặc định là `secondary`.
 *
 * Nhãn nút dùng động từ mệnh lệnh, lấy từ `@nvg/shared/content` (BUTTONS) thay vì gõ tay.
 */

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50 ' +
    'whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Hành động chính — chỉ MỘT trên mỗi màn hình. */
        primary: 'bg-brand text-fg-inverse hover:bg-brand-hover',
        secondary:
          'border border-border bg-surface text-fg ' +
          'hover:bg-surface-hover',
        subtle: 'text-fg hover:bg-surface-hover',
        /** Hành động không thể hoàn tác — luôn kèm hộp thoại xác nhận (Content Guidelines 4.5). */
        danger:
          'bg-status-overdue text-fg-inverse hover:brightness-95',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3',
        lg: 'h-10 px-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
