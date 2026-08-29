/**
 * Vẽ mặt bằng đã trích từ bản vẽ cũ.
 *
 * Chỉ ĐỌC hình học có sẵn, không dựng thêm gì: một nguồn hình học duy nhất là nguyên tắc bất
 * biến số 5 (CLAUDE.md 8.2). Ở đây là SVG chứ không phải glTF vì đây là mặt bằng hai chiều
 * lấy thẳng từ đa giác phòng — không có bước dựng hình nào.
 *
 * Mục đích duy nhất: cho kiến trúc sư nhìn thấy mặt bằng trong khi trả lời năm câu hỏi. Nếu
 * phải mở AutoCAD ở cửa sổ khác thì "10–15 phút mỗi công trình" (mục 6.1 Bước 3) không thành.
 */

import type { KbRecordPayload } from '@/hooks/use-kb-records';

interface Props {
  plan: KbRecordPayload['floor_plans'][number];
}

const PADDING = 0.6;

export function KbFloorPlan({ plan }: Props) {
  const points = plan.rooms.flatMap((r) => r.polygon);
  if (points.length === 0) {
    return (
      <p className="rounded border border-border bg-surface-sunken p-4 text-fg-subtle">
        Tầng {plan.level} không trích được phòng nào. Bản vẽ có thể dùng quy ước lớp chưa có trong
        bảng ánh xạ.
      </p>
    );
  }

  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  const minX = Math.min(...xs) - PADDING;
  const minY = Math.min(...ys) - PADDING;
  const width = Math.max(...xs) - minX + PADDING;
  const height = Math.max(...ys) - minY + PADDING;

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="h-auto w-full rounded border border-border bg-surface"
      // Bản vẽ kiến trúc có gốc toạ độ ở dưới, SVG có gốc ở trên — lật trục Y để mặt tiền
      // nằm đúng phía dưới màn hình như trên bản vẽ giấy.
      style={{ transform: 'scaleY(-1)', maxHeight: '60vh' }}
      role="img"
      aria-label={`Mặt bằng tầng ${plan.level}, ${plan.rooms.length} phòng`}
    >
      {plan.rooms.map((room, i) => {
        const cx = room.polygon.reduce((s, p) => s + p[0]!, 0) / room.polygon.length;
        const cy = room.polygon.reduce((s, p) => s + p[1]!, 0) / room.polygon.length;
        // Nhãn phòng dùng mã đã chuẩn hoá khi có, nếu không thì nguyên văn trong bản vẽ —
        // người xác nhận cần đối chiếu được hai thứ đó.
        const label = room.type ?? room.label_raw ?? '';
        return (
          <g key={i}>
            <polygon
              points={room.polygon.map((p) => `${p[0]},${p[1]}`).join(' ')}
              className={
                room.type ? 'fill-brand-subtle stroke-fg' : 'fill-surface-sunken stroke-fg'
              }
              strokeWidth={0.06}
            />
            {label ? (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                // Lật ngược riêng phần chữ, nếu không chữ sẽ hiện ngược theo trục Y ở trên.
                transform={`scale(1,-1) translate(0, ${-2 * cy})`}
                className="fill-fg"
                style={{ fontSize: 0.35 }}
              >
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
