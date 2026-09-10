/**
 * Khối dựng chung theo ngôn ngữ thị giác của Module Thiết kế — panel, chip, thẻ công cụ.
 *
 * Dùng cho cả Tổng quan lẫn các màn hình con, nên nằm ở gốc `pages/tk/` chứ không trong
 * `overview/`.
 *
 * ⚠️ Tên lớp Tailwind phải viết ĐỦ, không ghép chuỗi. Tailwind quét mã nguồn ở dạng văn bản
 * tĩnh, nên `bg-tk-${family}-bg` không sinh ra lớp nào và thẻ ra màu trong suốt — hỏng im
 * lặng, chỉ thấy khi mở trình duyệt. Vì vậy có bảng `FAMILY` dưới đây thay cho phép ghép.
 */

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Năm họ màu PHÂN LOẠI THẺ của bản mẫu §4.2 — không phải màu trạng thái, xem index.css. */
export type Family = 'bl' | 'gr' | 'am' | 'pu' | 'rd';

export const FAMILY: Readonly<Record<Family, { card: string; tile: string; deep: string }>> = {
  bl: {
    card: 'border-tk-bl-line bg-tk-bl-bg',
    tile: 'bg-tk-bl-tile text-tk-bl-fg',
    deep: 'bg-tk-bl-deep',
  },
  gr: {
    card: 'border-tk-gr-line bg-tk-gr-bg',
    tile: 'bg-tk-gr-tile text-tk-gr-fg',
    deep: 'bg-tk-gr-deep',
  },
  am: {
    card: 'border-tk-am-line bg-tk-am-bg',
    tile: 'bg-tk-am-chip text-tk-am-fg',
    deep: 'bg-tk-am-bg2',
  },
  pu: {
    card: 'border-tk-pu-line bg-tk-pu-bg',
    tile: 'bg-tk-pu-tile text-tk-pu-fg',
    deep: 'bg-tk-pu-deep',
  },
  rd: {
    card: 'border-tk-rd-line bg-tk-rd-bg',
    tile: 'bg-tk-rd-tile text-tk-rd-fg',
    deep: 'bg-tk-rd-deep',
  },
};

/** Mũi tên "đi tiếp" ở đầu thẻ, màu theo họ. Viết đủ lớp vì lý do ở đầu tệp. */
const ARROW: Readonly<Record<Family, string>> = {
  bl: 'text-tk-bl-fg',
  gr: 'text-tk-gr-fg',
  am: 'text-tk-am-fg',
  pu: 'text-tk-pu-fg',
  rd: 'text-tk-rd-fg',
};

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section
      className={cn('rounded-lg border border-tk-line bg-tk-panel p-4 lg:px-[18px]', className)}
    >
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Nhãn nhóm nhỏ in hoa của cột phải (bản mẫu §5.5d). */
export function GroupLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <h3 className="text-xs font-medium tracking-[0.04em] text-tk-t3 uppercase">{children}</h3>;
}

export function Chip({
  children,
  tone = 'mute',
}: {
  children: React.ReactNode;
  tone?: 'mute' | 'bl' | 'gr' | 'am' | 'rd';
}): React.ReactElement {
  const tones = {
    mute: 'bg-tk-chip-mute text-tk-t2',
    bl: 'bg-tk-bl-tile text-tk-bl-chipfg',
    gr: 'bg-tk-gr-badge text-tk-gr-fg2',
    am: 'bg-tk-am-chip text-tk-am-fg',
    // Đỏ thêm ngày 10/09/2026 cho một lượt chạy nền HỎNG. Vàng đã mang nghĩa «chờ duyệt» và
    // «có cảnh báo», nên dùng vàng cho việc hỏng là xoá mất khác biệt giữa hai chuyện.
    rd: 'bg-tk-rd-tile text-tk-rd-fg2',
  } as const;
  return (
    <span className={cn('inline-flex h-6 items-center rounded-sm px-2.5 text-xs', tones[tone])}>
      {children}
    </span>
  );
}

/**
 * Thẻ công cụ — cửa vào một màn hình con (bản mẫu §5.5b).
 *
 * ⚠️ Cả thẻ KHÔNG còn là một `<a>` bọc ngoài. Bản mẫu đặt một nút hành động ở chân ba thẻ, mà
 * `<button>` lồng trong `<a>` là HTML không hợp lệ: trình duyệt tự gỡ lồng nhau, và cái còn
 * lại thì bấm ra kết quả không đoán trước được.
 *
 * Thay bằng kiểu "liên kết phủ": tiêu đề là liên kết thật, `after:absolute after:inset-0` kéo
 * vùng bấm của nó ra cả thẻ. Nút hành động nằm SAU trong DOM và có `relative`, nên nó nổi trên
 * lớp phủ đó và nhận được cú bấm của chính nó.
 *
 * Được thêm: cả thẻ chỉ còn MỘT điểm dừng Tab thay vì hai, và tiêu đề — chứ không phải cả khối
 * chữ trong thẻ — là tên đọc được của liên kết.
 */
export function ToolCard({
  family,
  icon,
  title,
  description,
  to,
  children,
  action,
}: {
  family: Family;
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
  children?: React.ReactNode;
  /** Nút ở chân thẻ (bản mẫu §5.5b). Bấm được dù nằm trong vùng phủ của liên kết tiêu đề. */
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border p-4',
        FAMILY[family].card,
        'transition-[transform,box-shadow,filter] duration-(--motion-base) ease-(--ease-out)',
        // `shadow-tk-card` chứ không phải `shadow-overlay`: bộ bóng chung tính cho nền sáng
        // (đen 6–14%) nên trên nền tối không tách được lớp nào — xem index.css.
        'hover:-translate-y-[3px] hover:brightness-[1.06] hover:shadow-tk-card',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn('grid size-9 shrink-0 place-items-center rounded-md', FAMILY[family].tile)}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate font-semibold text-tk-tx">
              <Link
                to={to}
                className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand"
              >
                {title}
              </Link>
            </h3>
            <ArrowRight aria-hidden className={cn('size-4 shrink-0', ARROW[family])} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-tk-t2">{description}</p>
        </div>
      </div>
      {children}
      {action && <div className="relative mt-auto">{action}</div>}
    </div>
  );
}

/** Kiểu nút ở chân thẻ, theo họ màu của thẻ (bản mẫu §5.5b). */
const CARD_ACTION: Readonly<Record<'pu' | 'gr' | 'rd', string>> = {
  pu: 'bg-tk-pu-solid text-white hover:bg-tk-pu-solid2',
  gr: 'border border-tk-gr-line3 bg-tk-gr-deep2 text-tk-gr-fg2 hover:bg-tk-gr-hover',
  rd: 'border border-tk-rd-line2 bg-tk-rd-tile text-tk-rd-fg2 hover:bg-tk-rd-hover',
};

export function CardAction({
  tone,
  to,
  onClick,
  disabled,
  title,
  children,
}: {
  tone: keyof typeof CARD_ACTION;
  /** Có `to` thì là liên kết, không thì là nút bấm. Không nhận cả hai. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const className = cn(
    'flex h-10 w-full items-center justify-center rounded-sm px-3 font-medium',
    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
    CARD_ACTION[tone],
    disabled && 'cursor-not-allowed opacity-60',
  );
  if (to) {
    return (
      <Link to={to} title={title} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={className}>
      {children}
    </button>
  );
}

/**
 * Ô số liệu chưa có dữ liệu.
 *
 * Hiện `0` ở đây là báo cáo sai theo hướng lạc quan nhất — "0 phương án" đọc như đã sinh xong
 * và không ra kết quả nào, chứ không đọc như chưa chạy (CLAUDE.md 5.2).
 */
export function NotYet({ children }: { children: React.ReactNode }): React.ReactElement {
  return <span className="text-tk-t3">{children}</span>;
}
