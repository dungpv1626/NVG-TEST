/**
 * Bảng vẽ thửa «Đa giác không đều» — kéo đỉnh trên lưới (anh Dũng 27/10/2026: «có thể là một bảng kéo, vì đã có
 * ô rồi thì khi kéo đã biết được kích thước»).
 *
 * Bảng toạ độ bên dưới vẫn là nơi gõ số chính xác; hình vẽ và bảng cùng đọc / ghi một mảng đỉnh nên luôn khớp.
 * Đây là hình học TẤT ĐỊNH người dùng tự vẽ, không phải nội dung AI.
 *
 * - Kéo đỉnh: bắt lưới 0,1 m; giữ Shift thì cạnh từ đỉnh trước bắt theo bội số 45°.
 * - Bấm dấu «+» giữa cạnh: chèn đỉnh. Bấm đúp vào đỉnh: bỏ đỉnh (giữ tối thiểu ba đỉnh).
 * - Mặt tiền (y = 0) nằm phía dưới hình, cạnh đỉnh 1 → đỉnh 2 là cạnh giáp đường, tô riêng.
 */

import { useRef, useState } from 'react';
import { formatNumber } from '@nvg/shared/format';
import { polygonArea, siteGeometry, type Point } from '@nvg/shared/design';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { edgeLengths, insertMidpoint, selfIntersects, snap, snapAngle } from './site-polygon-math';

interface Props {
  points: Point[];
  onChange: (points: Point[]) => void;
  /** Diện tích theo giấy chứng nhận, nếu đã khai — để đối chiếu với hình vẽ. */
  certificateAreaM2?: number;
}

/** Khung nhìn: hình bao các đỉnh + lề, tối thiểu 10 m để thửa nhỏ vẫn đủ chỗ kéo. */
function frameOf(points: readonly Point[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(10, ...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(10, ...ys);
  const pad = Math.max(2, 0.15 * Math.max(maxX - minX, maxY - minY));
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

export function SitePolygonEditor({ points, onChange, certificateAreaM2 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  // Khung đứng yên trong lúc kéo — khung co giãn theo đỉnh đang kéo làm đỉnh trôi khỏi con trỏ.
  const frozen = useRef<ReturnType<typeof frameOf> | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded border border-dashed border-border-dashed bg-surface-empty p-4 text-center text-fg-subtle">
        <p>Chưa có đỉnh nào. Bắt đầu từ một hình chữ nhật rồi kéo các đỉnh cho khớp trích lục.</p>
        <Button
          variant="secondary"
          onClick={() =>
            onChange([
              [0, 0],
              [10, 0],
              [10, 20],
              [0, 20],
            ])
          }
        >
          Bắt đầu từ hình chữ nhật 10 × 20 m
        </Button>
      </div>
    );
  }

  const frame = frozen.current ?? frameOf(points);
  const width = frame.maxX - frame.minX;
  const height = frame.maxY - frame.minY;
  const extent = Math.max(width, height);
  const gridStep = extent > 60 ? 5 : 1;
  const r = extent * 0.014;
  const font = extent * 0.026;
  // SVG có gốc ở trên: vẽ y đảo dấu để mặt tiền nằm dưới, chữ vẫn đứng thẳng.
  const sy = (y: number) => -y;

  const toMetres = (event: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [snap(pt.x), snap(-pt.y)];
  };

  const move = (event: React.PointerEvent) => {
    if (dragging === null) return;
    const at = toMetres(event);
    if (!at) return;
    const prev = points[(dragging - 1 + points.length) % points.length];
    const next = event.shiftKey ? snapAngle(prev, at) : at;
    const current = points[dragging]!;
    if (next[0] === current[0] && next[1] === current[1]) return;
    onChange(points.map((p, i) => (i === dragging ? next : p)));
  };

  const endDrag = () => {
    setDragging(null);
    frozen.current = null;
  };

  const lengths = edgeLengths(points);
  const area = points.length >= 3 ? Math.round(polygonArea(points) * 100) / 100 : null;
  const crossed = selfIntersects(points);
  let buildable: ReturnType<typeof siteGeometry>['buildable'] | null = null;
  if (points.length >= 3 && !crossed) {
    try {
      buildable = siteGeometry({
        width_m: 1,
        depth_m: 1,
        shape: 'da_giac',
        boundary_m: points.map(([x, y]) => [x, y]),
      }).buildable;
    } catch {
      buildable = null;
    }
  }

  const gridX: number[] = [];
  for (let x = Math.ceil(frame.minX / gridStep) * gridStep; x <= frame.maxX; x += gridStep)
    gridX.push(x);
  const gridY: number[] = [];
  for (let y = Math.ceil(frame.minY / gridStep) * gridStep; y <= frame.maxY; y += gridStep)
    gridY.push(y);

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`${frame.minX} ${-frame.maxY} ${width} ${height}`}
        className="h-auto max-h-[28rem] w-full touch-none rounded border border-border bg-surface-sunken select-none"
        role="group"
        aria-label="Bảng vẽ thửa đất — kéo đỉnh để chỉnh, bấm dấu cộng giữa cạnh để thêm đỉnh"
        onPointerMove={move}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {gridX.map((x) => (
          <line
            key={`gx${x}`}
            x1={x}
            x2={x}
            y1={sy(frame.minY)}
            y2={sy(frame.maxY)}
            className={x === 0 ? 'stroke-fg-subtle' : 'stroke-border'}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {gridY.map((y) => (
          <line
            key={`gy${y}`}
            x1={frame.minX}
            x2={frame.maxX}
            y1={sy(y)}
            y2={sy(y)}
            className={y === 0 ? 'stroke-fg-subtle' : 'stroke-border'}
            strokeWidth={1}
            strokeDasharray={y === 0 ? '6 4' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <text
          x={frame.maxX - r}
          y={sy(0) + font * 1.4}
          fontSize={font}
          textAnchor="end"
          className="fill-fg-subtle"
        >
          Đường (y = 0)
        </text>

        <polygon
          points={points.map(([x, y]) => `${x},${sy(y)}`).join(' ')}
          className={cn(crossed ? 'fill-status-overdue-bg' : 'fill-brand-subtle', 'stroke-brand')}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {buildable && (
          <rect
            x={buildable.xM}
            y={sy(buildable.yM + buildable.depthM)}
            width={buildable.widthM}
            height={buildable.depthM}
            fill="none"
            className="stroke-fg-subtle"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {points.map((p, i) => {
          const q = points[(i + 1) % points.length]!;
          const mx = (p[0] + q[0]) / 2;
          const my = (p[1] + q[1]) / 2;
          // Nhãn chiều dài đặt lệch ra ngoài hình (đa giác CCW → pháp tuyến ngoài là bên phải hướng đi).
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const nx = (q[1] - p[1]) / len;
          const ny = -(q[0] - p[0]) / len;
          return (
            <g key={`e${i}`}>
              {i === 0 && (
                <line
                  x1={p[0]}
                  y1={sy(p[1])}
                  x2={q[0]}
                  y2={sy(q[1])}
                  className="stroke-brand-accent"
                  strokeWidth={5}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>Cạnh giáp đường (đỉnh 1 → đỉnh 2)</title>
                </line>
              )}
              <text
                x={mx + nx * font * 1.2}
                y={sy(my + ny * font * 1.2)}
                fontSize={font}
                // Cạnh dọc: chữ bám ra ngoài theo phía pháp tuyến, không nằm đè dấu «+» giữa cạnh.
                textAnchor={nx > 0.5 ? 'start' : nx < -0.5 ? 'end' : 'middle'}
                dominantBaseline="middle"
                className="fill-fg"
              >
                {formatNumber(lengths[i]!)} m
              </text>
              <g
                role="button"
                aria-label={`Thêm đỉnh giữa đỉnh ${i + 1} và đỉnh ${((i + 1) % points.length) + 1}`}
                className="cursor-copy"
                onClick={() => onChange(insertMidpoint(points, i))}
              >
                <circle
                  cx={mx}
                  cy={sy(my)}
                  r={r * 0.8}
                  className="fill-surface stroke-brand"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={mx}
                  y={sy(my)}
                  fontSize={font}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none fill-brand"
                >
                  +
                </text>
              </g>
            </g>
          );
        })}

        {points.map(([x, y], i) => (
          <g key={`v${i}`}>
            <circle
              cx={x}
              cy={sy(y)}
              r={r}
              role="button"
              aria-label={`Đỉnh ${i + 1}: ngang ${formatNumber(x)} m, sâu ${formatNumber(y)} m — kéo để chỉnh, bấm đúp để bỏ`}
              className={cn(
                'cursor-grab stroke-brand',
                dragging === i ? 'fill-brand' : 'fill-surface',
              )}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => {
                event.preventDefault();
                (event.target as Element).setPointerCapture?.(event.pointerId);
                frozen.current = frame;
                setDragging(i);
              }}
              onDoubleClick={() => {
                if (points.length > 3) onChange(points.filter((_, j) => j !== i));
              }}
            />
            <text
              x={x}
              y={sy(y) - r * 1.6}
              fontSize={font}
              textAnchor="middle"
              className="pointer-events-none fill-fg font-semibold"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>

      <p className="text-fg-subtle">
        Kéo đỉnh để chỉnh (bắt theo 0,1 m; giữ Shift để cạnh thẳng hoặc chéo 45°). Bấm dấu «+» giữa
        cạnh để thêm đỉnh, bấm đúp vào đỉnh để bỏ. Mỗi ô lưới {formatNumber(gridStep)} m; nét đứt là
        phần xây được.
      </p>
      {area !== null && (
        <p>
          Diện tích hình vẽ <strong>{formatNumber(area)} m²</strong>
          {certificateAreaM2 ? (
            <span
              className={cn(
                Math.abs(area - certificateAreaM2) > 0.02 * certificateAreaM2
                  ? 'text-status-pending'
                  : 'text-fg-subtle',
              )}
            >
              {' '}
              — giấy chứng nhận ghi {formatNumber(certificateAreaM2)} m²
              {Math.abs(area - certificateAreaM2) > 0.02 * certificateAreaM2
                ? `, lệch ${formatNumber(Math.round(Math.abs(area - certificateAreaM2) * 100) / 100)} m². Kiểm tra lại các đỉnh.`
                : '.'}
            </span>
          ) : null}
        </p>
      )}
      {crossed && (
        <p role="alert" className="text-status-overdue">
          Hình đang tự cắt: hai cạnh cắt nhau. Kéo đỉnh về đúng thứ tự đi quanh thửa đất.
        </p>
      )}
    </div>
  );
}
