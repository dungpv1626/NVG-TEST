/**
 * Dạng GỌN của bộ dải ở ranh giới với mô hình (handoff sửa lỗi đợt 2 mục 4.2; `contracts/ai-house-bands-compact`): mỗi ô là
 * một chuỗi thay cho `{id, w, stack}` — mã phòng, ô xếp chồng nối `/` (phía đường trước), bề rộng lọt lòng sau `:`.
 *
 *   "living_1"            → { id: "living_1", w: 0, stack: [] }
 *   "gt_1:900"            → { id: "gt_1", w: 900, stack: [] }
 *   "wc_1/light_well_1"   → { id: "", w: 0, stack: [{ id: "wc_1", d: 0 }, { id: "light_well_1", d: 0 }] }
 *
 * Bên trong chương trình (bộ giải, artifact) vẫn dùng `ai-house-bands`. Hàm thuần; ô đã là đối tượng thì giữ nguyên (câu trả
 * lời ghi trước dạng gọn vẫn phát lại được).
 */
import type { AiHouseBands } from '@nvg/shared/design';

type Cell = AiHouseBands['storeys'][number]['bands'][number]['cells'][number];

/** Một ô chuỗi → ô đối tượng. */
export function expandCell(text: string): Cell {
  const at = text.lastIndexOf(':');
  const w = at >= 0 && /^\d+$/.test(text.slice(at + 1)) ? Number(text.slice(at + 1)) : 0;
  const body = at >= 0 && w > 0 ? text.slice(0, at) : text;
  const parts = body.split('/').filter((part) => part.length > 0);
  if (parts.length <= 1) return { id: parts[0] ?? '', w, stack: [] };
  return { id: '', w, stack: parts.map((id) => ({ id, d: 0 })) };
}

/** Một ô đối tượng → chuỗi gọn (độ sâu ô con `d` không có trong dạng gọn — chương trình tính). */
export function compactCell(cell: Cell): string {
  const body = cell.stack.length ? cell.stack.map((part) => part.id).join('/') : cell.id;
  return cell.w > 0 ? `${body}:${cell.w}` : body;
}

/** Bung câu trả lời gọn (cả nhà hay vòng sửa) sang dạng `ai-house-bands`; phần khác giữ nguyên để hợp đồng kiểm. */
export function expandCompact(json: unknown): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.storeys)) return json;
  return {
    ...obj,
    storeys: obj.storeys.map((storey) => {
      if (!storey || typeof storey !== 'object') return storey;
      const s = storey as Record<string, unknown>;
      if (!Array.isArray(s.bands)) return storey;
      return {
        ...s,
        bands: s.bands.map((band) => {
          if (!band || typeof band !== 'object') return band;
          const b = band as Record<string, unknown>;
          if (!Array.isArray(b.cells)) return band;
          return {
            ...b,
            cells: b.cells.map((cell) => (typeof cell === 'string' ? expandCell(cell) : cell)),
          };
        }),
      };
    }),
  };
}

/**
 * Bộ dải gửi lại mô hình ở vòng sửa (`<plan>`), dạng gọn và CHỈ phần mô hình sửa: tầng / dải / ô, cặp cửa, ban công, lối
 * vào. Chữ của chính mô hình (lý giải, ghi chú, giả định) không gửi lại — không ảnh hưởng việc sửa, chỉ tốn token.
 */
export function compactBands(bands: AiHouseBands): Record<string, unknown> {
  return {
    storeys: bands.storeys.map((storey) => ({
      level: storey.level,
      bands: storey.bands.map((band) => ({
        depth: band.depth,
        cells: band.cells.map(compactCell),
      })),
    })),
    doors_prefer: bands.doors_prefer,
    cantilevers: bands.cantilevers,
    entry_room: bands.entry_room,
    garage_room: bands.garage_room,
  };
}
