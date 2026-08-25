/**
 * Nút bấm.
 *
 * Content Guidelines 6.3: màu thương hiệu dành riêng cho DUY NHẤT MỘT hành động chính
 * trên mỗi màn hình — vì vậy `primary` phải dùng tiết chế, mặc định là `secondary`.
 *
 * Nhãn nút dùng động từ mệnh lệnh, lấy từ `@nvg/shared/content` (BUTTONS) thay vì gõ tay.
 */
import { type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes } from 'react';
declare const buttonVariants: (props?: ({
    variant?: "link" | "primary" | "secondary" | "subtle" | "danger" | null | undefined;
    size?: "sm" | "md" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}
export declare const Button: import("react").ForwardRefExoticComponent<ButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
export {};
//# sourceMappingURL=button.d.ts.map