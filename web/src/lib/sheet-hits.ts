/**
 * Đọc vùng bấm của từng phòng (`<rect data-room>` trong nhóm `data-room-hits`, Worker `ai/draw/plan-sheet.ts`) từ chữ
 * SVG của tờ mặt bằng. Tờ vẽ hiện qua `<img>` (không nhúng SVG vì tên phòng do mô hình sinh), nên trang phủ nút bấm
 * lên ảnh theo các ô này. Chỉ đọc số — không đưa SVG vào DOM.
 *
 * Toạ độ trả về là PHẦN của tờ (0–1), để đặt `left / top / width / height` theo % của ảnh dù ảnh co giãn bao nhiêu.
 */

export interface SheetRoomHit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1]!.replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENTITIES[e]!) : null;
}

export function parseRoomHits(svg: string): SheetRoomHit[] {
  const view = /<svg\b[^>]*\sviewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!view) return [];
  const [vx, vy, vw, vh] = view.slice(1).map(Number) as [number, number, number, number];
  if (!(vw > 0 && vh > 0)) return [];
  const group = /<g\s+data-room-hits=""[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  if (!group) return [];
  const out: SheetRoomHit[] = [];
  for (const m of group[1]!.matchAll(/<rect\b[^>]*\/>/g)) {
    const tag = m[0];
    const id = attr(tag, 'data-room');
    const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((n) => Number(attr(tag, n)));
    if (!id || ![x, y, w, h].every((v) => Number.isFinite(v)) || !(w! > 0 && h! > 0)) continue;
    out.push({ id, x: (x! - vx) / vw, y: (y! - vy) / vh, w: w! / vw, h: h! / vh });
  }
  return out;
}
