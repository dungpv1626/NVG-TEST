/**
 * Khung phác họa thửa đất — nền lưới ô, cạnh các trường kích thước trong mục Khu đất.
 *
 * Dùng CHUNG một nguồn hình học cho cả ba hình dạng (`siteGeometry`, `@nvg/shared/design`) —
 * không viết lại logic dựng ranh giới ở đây (nguyên tắc bất biến số 5, CLAUDE.md 8.2). Đây là
 * hình học TẤT ĐỊNH vẽ lại đúng số người dùng đang gõ, không phải nội dung AI sinh, nên không
 * cần nhãn cảnh báo kiểu "Đề xuất".
 */

import { formatNumber } from '@nvg/shared/format';
import {
  siteGeometry,
  SiteGeometryError,
  type DesignBriefDraft,
  type Point,
} from '@nvg/shared/design';
import { cn } from '@/lib/utils';

interface Props {
  site: DesignBriefDraft['site'];
  className?: string;
}

/** Bước lưới đẹp: số đường lưới dọc thửa nằm khoảng 4–10, không phụ thuộc kích thước thật. */
const GRID_STEPS = [0.5, 1, 2, 5, 10, 20, 50];

function niceGridStep(maxDimM: number): number {
  const target = maxDimM / 8;
  return GRID_STEPS.find((step) => step >= target) ?? GRID_STEPS[GRID_STEPS.length - 1]!;
}

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-3', className)}>
      <p className="mb-2 font-semibold">Phác họa thửa đất</p>
      {children}
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded border border-dashed border-border-dashed bg-surface-empty p-4 text-center text-fg-subtle">
      {children}
    </div>
  );
}

export function SitePlanPreview({ site, className }: Props) {
  const shape =
    (site?.shape as 'chu_nhat' | 'hinh_thang' | 'da_giac' | null | undefined) ?? 'chu_nhat';

  let geometry: ReturnType<typeof siteGeometry>;
  try {
    if (shape === 'da_giac') {
      const boundary = site?.boundary_m;
      if (!boundary || boundary.length < 3) {
        return (
          <Frame className={className}>
            <EmptyMessage>Cần ít nhất ba đỉnh để phác họa hình thửa.</EmptyMessage>
          </Frame>
        );
      }
      geometry = siteGeometry({ width_m: 1, depth_m: 1, shape, boundary_m: boundary });
    } else {
      const width = site?.width_m;
      const depth = site?.depth_m;
      if (!width || width <= 0 || !depth || depth <= 0) {
        return (
          <Frame className={className}>
            <EmptyMessage>Nhập kích thước để xem hình thửa.</EmptyMessage>
          </Frame>
        );
      }
      geometry = siteGeometry({
        width_m: width,
        depth_m: depth,
        shape,
        rear_width_m: site?.rear_width_m ?? null,
      });
    }
  } catch (error) {
    return (
      <Frame className={className}>
        <EmptyMessage>
          {error instanceof SiteGeometryError
            ? error.message
            : 'Chưa dựng được hình thửa từ số liệu đã nhập.'}
        </EmptyMessage>
      </Frame>
    );
  }

  const { boundary, buildable, bboxWidthM, bboxDepthM, areaM2, unusedM2 } = geometry;
  const maxDim = Math.max(bboxWidthM, bboxDepthM);
  const pad = Math.max(0.5, 0.08 * maxDim);
  // KHÔNG giả định ranh giới bắt đầu ở (0,0): đúng với chữ nhật/hình thang (`boundaryOf` dựng
  // từ gốc), nhưng đa giác đọc từ ảnh trích lục (`polygonFromCoordinates`) tịnh tiến về ĐỈNH
  // ĐẦU TIÊN — một điểm bất kỳ trên biên — nên các đỉnh khác có thể mang toạ độ ÂM. Giả định
  // sai chỗ này từng cắt mất phần thửa nằm ngoài viewBox mà không có cảnh báo gì (SVG mặc định
  // clip nội dung tràn ra ngoài `viewBox`).
  const boundaryXs = boundary.map(([x]: Point) => x);
  const boundaryYs = boundary.map(([, y]: Point) => y);
  const minX = Math.min(...boundaryXs) - pad;
  const minY = Math.min(...boundaryYs) - pad;
  const viewWidth = bboxWidthM + 2 * pad;
  const viewHeight = bboxDepthM + 2 * pad;
  const gridStep = niceGridStep(maxDim);

  const gridLinesX: number[] = [];
  for (let x = Math.ceil(minX / gridStep) * gridStep; x <= minX + viewWidth; x += gridStep) {
    gridLinesX.push(x);
  }
  const gridLinesY: number[] = [];
  for (let y = Math.ceil(minY / gridStep) * gridStep; y <= minY + viewHeight; y += gridStep) {
    gridLinesY.push(y);
  }

  const boundaryPoints = boundary.map(([x, y]: Point) => `${x},${y}`).join(' ');

  return (
    <Frame className={className}>
      <svg
        viewBox={`${minX} ${minY} ${viewWidth} ${viewHeight}`}
        className="h-auto w-full rounded border border-border bg-surface-sunken"
        // Hệ toạ độ của thửa: mặt tiền ở y = 0, chiều sâu tăng dần. SVG có gốc ở trên — lật
        // trục Y để mặt tiền nằm đúng phía dưới khung, giống quy ước ở KbFloorPlan.
        style={{ transform: 'scaleY(-1)', maxHeight: '16rem' }}
        role="img"
        aria-label={`Phác họa hình thửa đất, diện tích ${formatNumber(areaM2)} mét vuông`}
      >
        {gridLinesX.map((x) => (
          <line
            key={`gx-${x}`}
            x1={x}
            y1={minY}
            x2={x}
            y2={minY + viewHeight}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {gridLinesY.map((y) => (
          <line
            key={`gy-${y}`}
            x1={minX}
            y1={y}
            x2={minX + viewWidth}
            y2={y}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <polygon
          points={boundaryPoints}
          className="fill-brand-subtle stroke-brand"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />

        <rect
          x={buildable.xM}
          y={buildable.yM}
          width={buildable.widthM}
          height={buildable.depthM}
          fill="none"
          className="stroke-fg-subtle"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="mt-2 text-fg-subtle">
        Mỗi ô lưới {formatNumber(gridStep)} m · diện tích {formatNumber(areaM2)} m² · hình bao{' '}
        {formatNumber(bboxWidthM)} × {formatNumber(bboxDepthM)} m
        {unusedM2 > 0.5 ? ` · còn ${formatNumber(unusedM2)} m² ngoài ô xây được (nét đứt)` : ''}
      </p>
    </Frame>
  );
}
