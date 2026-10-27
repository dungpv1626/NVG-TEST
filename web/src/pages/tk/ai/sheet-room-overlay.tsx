/**
 * Ô bấm phủ lên tờ mặt bằng (việc C, 27/10/2026: «bấm vào phòng trên bản vẽ để nhờ sửa, đánh dấu chỗ có vấn đề trên
 * bản vẽ»). Tờ vẽ là `<img>`, nên mỗi phòng là một nút trong suốt đặt theo vùng `data-room` của chính tờ SVG
 * (`parseRoomHits`). Phòng đang bị trừ điểm (cùng danh sách «Đánh giá» nêu) có viền cam và dấu «!».
 *
 * Bấm phòng chỉ ĐIỀN SẴN câu vào ô «Yêu cầu sửa» — người dùng viết tiếp rồi bấm «Sửa lại» (tốn tiền) mới gọi mô hình.
 */

import type { SheetRoomHit } from '@/lib/sheet-hits';
import { cn } from '@/lib/utils';

export function SheetRoomOverlay({
  hits,
  nameOf,
  issues,
  onPick,
}: {
  hits: readonly SheetRoomHit[];
  nameOf: (id: string) => string;
  /** Mã phòng → các việc nên sửa ở phòng ấy. */
  issues: ReadonlyMap<string, string[]>;
  /** Vắng = chỉ đánh dấu, không bấm được (người chỉ xem, phương án không sửa được). */
  onPick?: (id: string) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {hits.map((hit) => {
        const problems = issues.get(hit.id) ?? [];
        const name = nameOf(hit.id);
        const title = problems.length ? `${name} — nên sửa: ${problems.join('; ')}` : name;
        const box = {
          left: `${hit.x * 100}%`,
          top: `${hit.y * 100}%`,
          width: `${hit.w * 100}%`,
          height: `${hit.h * 100}%`,
        };
        const shape = cn(
          'absolute rounded-sm',
          problems.length > 0 &&
            'border-2 border-dashed border-status-pending bg-status-pending/10',
        );
        const badge = problems.length > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-status-pending text-xs font-bold text-fg-inverse"
          >
            !
          </span>
        );
        return onPick ? (
          <button
            key={hit.id}
            type="button"
            style={box}
            title={`${title} · bấm để nhờ AI sửa phòng này`}
            aria-label={`Nhờ AI sửa ${title}`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(hit.id);
            }}
            className={cn(
              shape,
              'pointer-events-auto cursor-pointer transition-colors hover:bg-brand/10 hover:ring-2 hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
            )}
          >
            {badge}
          </button>
        ) : problems.length > 0 ? (
          <span key={hit.id} style={box} title={title} className={shape}>
            {badge}
          </span>
        ) : null;
      })}
    </div>
  );
}

/** Câu điền sẵn khi bấm một phòng: tên phòng, kèm việc nên sửa nếu thước chấm đã nêu. */
export function roomFixRequest(name: string, problems: readonly string[]): string {
  return problems.length
    ? `${name} — cải thiện ${problems.map((p) => `«${p}»`).join(', ')}: `
    : `${name}: `;
}
