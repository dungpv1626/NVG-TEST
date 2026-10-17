import { cn } from '@/lib/utils';

/**
 * Logo Nhà Việt Group — cắt nguyên từ ảnh logo gốc (Bước 0b), KHÔNG vẽ lại chữ: chữ vẽ lại
 * bằng phông khác là lệch nhận diện. NVG gửi bản vector thì thay tệp trong `public/brand/`.
 *
 * - `full`: ba ô + «NHÀ VIỆT GROUP» + khẩu hiệu — trang đăng nhập.
 * - `compact`: ba ô + «NHÀ VIỆT GROUP» — thanh bên khi mở rộng (nền trắng).
 * - `mark`: chỉ ba ô N · V · G — thanh bên thu gọn, nền tối của Module Thiết kế, thanh trên điện
 *   thoại. Ba ô tự mang màu nên đọc được trên cả nền sáng lẫn nền tối.
 */
const SOURCES = {
  full: { src: '/brand/nvg-logo.png', width: 720, height: 404 },
  compact: { src: '/brand/nvg-logo-compact.png', width: 400, height: 179 },
  mark: { src: '/brand/nvg-mark.png', width: 316, height: 96 },
} as const;

export function BrandLogo({
  variant,
  className,
}: {
  variant: keyof typeof SOURCES;
  className?: string;
}) {
  const { src, width, height } = SOURCES[variant];
  return (
    <img
      src={src}
      width={width}
      height={height}
      alt="Nhà Việt Group"
      draggable={false}
      className={cn('h-auto select-none', className)}
    />
  );
}
