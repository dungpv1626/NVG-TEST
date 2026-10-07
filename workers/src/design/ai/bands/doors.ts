/**
 * Chọn CẶP PHÒNG có cửa cho một tầng bộ giải dải đã dựng (T116, handoff v6 B3 bước 5). Vị trí cửa trên vách, lề, chiều
 * mở và cửa sổ vẫn do cổng `ai/tree/openings.ts` đặt — ở đây chỉ quyết ai mở ra đâu, theo luật đi lại của loại nhà.
 *
 *  - phòng khép kín → phòng mẹ;
 *  - hai phòng đi xuyên được kề nhau → ô thông, không cánh (hành lang, thang, khách, ăn, bếp; gara khi loại nhà cho);
 *  - phòng khác → phòng đi xuyên được kề nó có vách chung DÀI NHẤT, đủ chỗ đặt cửa; cặp mô hình gợi ý được ưu tiên;
 *  - tầng 1: cửa ra ngoài của phòng lối vào và của gara.
 *
 * Hàm THUẦN.
 */
import type { AiPlanTree } from '@nvg/shared/design';
import type { Rect } from './solve';

export interface BandDoorsInput {
  level: number;
  rects: ReadonlyMap<string, Rect>;
  typeOf: (id: string) => string;
  parentOf: (id: string) => string | null;
  /** Loại phòng đi xuyên được trên tầng này (đã gồm gara nếu loại nhà cho). */
  through: ReadonlySet<string>;
  /** Vách chung tối thiểu để đặt cửa, cm (cửa + 2 × lề theo loại nhà) — so với cạnh chung ĐÃ TRỪ tường. */
  doorWallCm: number;
  /**
   * Vách chung tối thiểu giữa hai ô hành lang, cm (`circulation.corridor_pass_clear_m`) — chúng nối bằng ô thông suốt
   * cạnh, không cửa (handoff đợt 3 mục 1). Vắng = `doorWallCm`.
   */
  corridorPassCm?: number;
  /** Phần tường trừ khỏi cạnh chung theo tim tường để ra đoạn vách thông thuỷ, cm (tường ngoài + nửa vách — mép khối là mặt ngoài tường). */
  wallAllowanceCm?: number;
  /**
   * Trừ tường THEO TỪNG ĐẦU đoạn vách chung: đầu chạm mép khối trừ trọn tường ngoài, đầu trong nhà trừ nửa vách. Có thì
   * thay `wallAllowanceCm` (trừ 28 cm ở mọi vách — đầu hành lang 900 mm không bao giờ đủ chỗ đặt cửa, phát lại 93d212a2).
   */
  walls?: { footprint: Rect; exterior: number; partition: number };
  prefer: readonly (readonly [string, string])[];
  /** Loại phòng không cần cửa (giếng trời, sân trong…, `no_door_required`). */
  noDoor?: ReadonlySet<string>;
  /**
   * Ô thang chỉ mở ra các loại này (`passage.stair_opens_to`, T74) — phòng loại khác không lấy cửa từ ô thang.
   * Vắng = không giới hạn.
   */
  stairOpensTo?: ReadonlySet<string>;
  /** Loại ô thang (`stair`, `core`). */
  stairTypes?: ReadonlySet<string>;
  /** Phòng phụ được mở từ các loại này ngoài phòng đi xuyên được (`passage.served_from`: giặt ← sân thượng…). */
  servedFrom?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Vách bàn thờ dựa lưng theo hướng gia chủ chọn (T106) — phòng thờ ưu tiên mở cửa ở vách khác (T116). */
  altarBackSide?: 'x0' | 'x1' | 'y0' | 'y1' | null;
  entryRoom: string | null;
  garageRoom: string | null;
}

type Door = AiPlanTree['doors'][number];

export function chooseBandDoors(input: BandDoorsInput): Door[] {
  const ids = [...input.rects.keys()].sort();
  const doors: Door[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, kind: Door['kind'], full = false) => {
    const key = b === 'outside' ? `${a}|outside|${kind}` : [a, b].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    doors.push(full ? { a, b, kind, full: true } : { a, b, kind });
  };
  const shared = (a: string, b: string): number => {
    const p = input.rects.get(a)!;
    const q = input.rects.get(b)!;
    const edge = sharedEdge(p, q);
    if (!input.walls || edge <= 0) return edge - (input.wallAllowanceCm ?? 0);
    const { footprint, exterior, partition } = input.walls;
    const vertical = p.x1 === q.x0 || q.x1 === p.x0;
    const [lo, hi, min, max] = vertical
      ? [Math.max(p.y0, q.y0), Math.min(p.y1, q.y1), footprint.y0, footprint.y1]
      : [Math.max(p.x0, q.x0), Math.min(p.x1, q.x1), footprint.x0, footprint.x1];
    const cut = (end: number, rim: number) => (end === rim ? exterior : partition / 2);
    return edge - cut(lo, min) - cut(hi, max);
  };
  const passable = (id: string) => input.through.has(input.typeOf(id));
  const preferred = (a: string, b: string) =>
    input.prefer.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

  // Tầng 1: cửa ra ngoài. Gara mang lối vào chính có cả cửa cuốn lẫn cửa đi (nhà phố, Haan (a)).
  if (input.level === 1) {
    if (input.garageRoom && input.rects.has(input.garageRoom))
      add(input.garageRoom, 'outside', 'garage');
    if (input.entryRoom && input.rects.has(input.entryRoom)) {
      add(input.entryRoom, 'outside', input.entryRoom === input.garageRoom ? 'single' : 'double');
    }
  }
  for (const id of ids) {
    const parent = input.parentOf(id);
    if (
      parent &&
      input.rects.has(parent) &&
      sharedEdge(input.rects.get(id)!, input.rects.get(parent)!) > 0
    )
      add(id, parent, 'single');
  }
  // Ô thang là vế bậc (T74): ô thông giữa ô thang và phòng đi xuyên được chỉ khi loại phòng ấy nằm trong
  // `stairOpensTo` — gara kề ô thang không mở thẳng ra thang (phát lại 93d212a2 sau khi chương trình dựng lại tầng 1).
  const stairBlocks = (a: string, b: string) =>
    !!input.stairTypes &&
    !!input.stairOpensTo &&
    ((input.stairTypes.has(input.typeOf(a)) && !input.stairOpensTo.has(input.typeOf(b))) ||
      (input.stairTypes.has(input.typeOf(b)) && !input.stairOpensTo.has(input.typeOf(a))));
  // Các ô hành lang kề nhau là MỘT vùng giao thông (handoff sửa lỗi đợt 3 mục 1): ô thông bỏ vách suốt cạnh chung, không
  // cửa, chỉ cần đủ một lối đi — đòi đủ quy cách cửa đi thì hành lang 0,9 m nối hành lang không bao giờ đạt (lượt thật
  // affaf12b, f0c97c06: vách chung 87 cm).
  const corridor = (id: string) => input.typeOf(id) === 'circulation';
  for (const a of ids) {
    if (!passable(a)) continue;
    for (const b of ids) {
      if (b <= a || !passable(b) || stairBlocks(a, b)) continue;
      const zone = corridor(a) && corridor(b);
      if (shared(a, b) < (zone ? (input.corridorPassCm ?? input.doorWallCm) : input.doorWallCm))
        continue;
      add(a, b, 'opening', zone);
    }
  }
  for (const id of ids) {
    if (passable(id) || input.parentOf(id) || input.noDoor?.has(input.typeOf(id))) continue;
    const type = input.typeOf(id);
    const host = (other: string) => {
      const otherType = input.typeOf(other);
      // Ô thang là vế bậc: chỉ hành lang, khu chung, sân thượng… được mở từ nó (T74).
      if (input.stairTypes?.has(otherType) && input.stairOpensTo && !input.stairOpensTo.has(type))
        return false;
      return passable(other) || !!input.servedFrom?.get(type)?.has(otherType);
    };
    const back = type === 'altar_room' ? (input.altarBackSide ?? null) : null;
    const behind = (other: string) =>
      back !== null && sideOf(input.rects.get(id)!, input.rects.get(other)!) === back;
    const options = ids
      .filter((other) => other !== id && host(other) && shared(id, other) >= input.doorWallCm)
      .sort(
        (p, q) =>
          Number(behind(p)) - Number(behind(q)) ||
          Number(preferred(id, q)) - Number(preferred(id, p)) ||
          shared(id, q) - shared(id, p) ||
          p.localeCompare(q),
      );
    if (options[0]) add(id, options[0], 'single');
  }
  // Phòng làm nơi mở cửa cho phòng phụ mà bản thân không đi xuyên được (sân thượng cho phòng giặt — `served_from`) phải
  // nối về một phòng đi xuyên được, kể cả khi loại ấy «không cần cửa»; thiếu thì phòng phụ không đi tới được.
  for (const door of [...doors]) {
    const host = door.b;
    if (host === 'outside' || passable(host) || passable(door.a)) continue;
    if (
      doors.some(
        (d) => (d.a === host || d.b === host) && d !== door && (passable(d.a) || passable(d.b)),
      )
    )
      continue;
    const via = ids
      .filter((other) => passable(other) && shared(host, other) >= input.doorWallCm)
      .filter(
        (other) =>
          !(
            input.stairTypes?.has(input.typeOf(other)) &&
            input.stairOpensTo &&
            !input.stairOpensTo.has(input.typeOf(host))
          ),
      )
      .sort((p, q) => shared(host, q) - shared(host, p) || p.localeCompare(q))[0];
    if (via) add(host, via, 'single');
  }
  return doors;
}

/** Phía của `room` mà `other` kề vào; `null` khi không kề theo cạnh. */
function sideOf(room: Rect, other: Rect): 'x0' | 'x1' | 'y0' | 'y1' | null {
  if (other.x1 === room.x0) return 'x0';
  if (other.x0 === room.x1) return 'x1';
  if (other.y1 === room.y0) return 'y0';
  if (other.y0 === room.y1) return 'y1';
  return null;
}

/** Chiều dài đoạn cạnh chung của hai chữ nhật kề nhau (cm); 0 khi không kề. */
export function sharedEdge(p: Rect, q: Rect): number {
  const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
  const oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
  if ((p.x1 === q.x0 || q.x1 === p.x0) && oy > 0) return oy;
  if ((p.y1 === q.y0 || q.y1 === p.y0) && ox > 0) return ox;
  return 0;
}
