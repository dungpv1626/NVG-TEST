/**
 * Phần dùng chung của Thư viện công trình mẫu (Đợt 1 — 1H): dòng thông số và thẻ mẫu.
 * Cùng một cách đọc thông số cho màn hình nội bộ và trang khách xem.
 */

import { ImageOff } from 'lucide-react';
import { SHOWCASE_KIND_LABELS, formatNumber, type ShowcaseKind } from '@nvg/shared';
import { cn } from '@/lib/utils';

export interface ShowcaseSpecs {
  kind: ShowcaseKind;
  style: string | null;
  floors: number | null;
  bedrooms: number | null;
  land_area: number | null;
  frontage: number | null;
  depth: number | null;
  building_area: number | null;
  span: number | null;
  location_area: string | null;
  completed_year: number | null;
}

/** «Nhà phố · 4 tầng · đất 90 m² · mặt tiền 5 × 18 m · Hiện đại» — chỉ những ô đã có số. */
export function specLine(s: ShowcaseSpecs): string {
  const parts: string[] = [SHOWCASE_KIND_LABELS[s.kind]];
  if (s.floors) parts.push(`${s.floors} tầng`);
  if (s.bedrooms) parts.push(`${s.bedrooms} phòng ngủ`);
  if (s.land_area) parts.push(`đất ${formatNumber(s.land_area)} m²`);
  if (s.frontage && s.depth)
    parts.push(`mặt tiền ${formatNumber(s.frontage)} × ${formatNumber(s.depth)} m`);
  else if (s.frontage) parts.push(`mặt tiền ${formatNumber(s.frontage)} m`);
  if (s.building_area) parts.push(`xây dựng ${formatNumber(s.building_area)} m²`);
  if (s.span) parts.push(`khẩu độ ${formatNumber(s.span)} m`);
  if (s.style) parts.push(s.style);
  return parts.join(' · ');
}

export function placeLine(s: ShowcaseSpecs): string | null {
  const parts = [
    s.location_area,
    s.completed_year ? `hoàn thành ${s.completed_year}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function CoverImage({
  src,
  alt,
  className,
}: {
  src: string | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-sunken text-fg-subtle',
          className,
        )}
        aria-label="Chưa có ảnh"
      >
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={cn('object-cover', className)} />;
}
