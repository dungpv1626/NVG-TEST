/**
 * Đi tới một phòng mà KHÔNG đi xuyên phòng riêng của ai (V-27, 13/09/2026).
 *
 * «Mọi phòng đi tới được» chỉ hỏi có đường hay không. Lượt chạy thật hôm ấy, cả Claude Sonnet lẫn
 * gpt-5 đều cho qua cổng những mặt bằng mà vào kho phải đi qua WC, vào phòng ngủ 4 phải đi qua phòng
 * ngủ 5 — có đường thật, nhưng không kiến trúc sư nào vẽ thế. Tệp này hỏi thêm: đường ấy đi xuyên
 * NHỮNG GÌ.
 *
 * Luật là dữ liệu (`kb/room_vocabulary.yaml` mục `passage`). Một bước từ phòng `u` sang phòng `v`
 * qua một cửa là hợp lệ khi một trong các điều sau đúng:
 *
 *  1. `u` đi xuyên được — một loại của `u` (kể cả loại ghép qua `also`) nằm trong `through`;
 *  2. `u` là lối vào (có cửa ra ngoài nhà), thuộc `entry_through`, và `v` thuộc `through` — vào nhà
 *     qua gara rồi tới phòng khách, không phải từ gara vào thẳng phòng ngủ;
 *  3. `v` là phòng khép kín của `u`;
 *  4. `v` thuộc nhóm không cần cửa (ban công, sân thượng) — vào từ phòng nào cũng được;
 *  5. loại của `v` khai `served_from` chứa một loại của `u` — kho mở từ bếp.
 *
 * Hàm THUẦN, tất định: cùng tôpô cho cùng kết quả.
 */

import type { PassageRules } from '../../kb/vocabulary';

export interface PassageInput {
  /** Phòng xuất phát: phòng có cửa ra ngoài ở tầng 1, ô thang ở tầng trên. */
  starts: readonly string[];
  /** Phòng có cửa ra ngoài nhà — chỉ để nhận ra lối vào (điều 2). */
  entries: ReadonlySet<string>;
  links: readonly (readonly [string, string])[];
  /** Mã lá → mọi loại phòng lá ấy mang (loại riêng + loại ghép qua `also`). */
  typesOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** Lá phòng khép kín → lá phòng mẹ. */
  parentOf: ReadonlyMap<string, string>;
  noDoorRequired: ReadonlySet<string>;
  rules: PassageRules;
}

export interface PassageViolation {
  room: string;
  /** Phòng mà đường vào buộc phải đi xuyên. */
  via: string;
}

/** Có được bước từ `u` sang `v` không — năm điều ở đầu tệp. */
export function mayEnter(input: PassageInput, u: string, v: string): boolean {
  const from = input.typesOf.get(u) ?? new Set<string>();
  const to = input.typesOf.get(v) ?? new Set<string>();
  const { rules } = input;
  const any = (types: ReadonlySet<string>, allowed: ReadonlySet<string> | undefined) =>
    !!allowed && [...types].some((type) => allowed.has(type));
  if (any(from, rules.through)) return true;
  if (input.entries.has(u) && any(from, rules.entryThrough) && any(to, rules.through)) return true;
  if (input.parentOf.get(v) === u) return true;
  if (any(to, input.noDoorRequired)) return true;
  return [...to].some((type) => any(from, rules.servedFrom.get(type)));
}

/** Tập phòng tới được mà mọi bước đều hợp lệ. */
export function properlyReached(input: PassageInput): Set<string> {
  const reached = new Set<string>();
  const queue = [...input.starts];
  while (queue.length) {
    const current = queue.shift()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const [p, q] of input.links) {
      const next = p === current ? q : q === current ? p : null;
      if (next !== null && !reached.has(next) && mayEnter(input, current, next)) queue.push(next);
    }
  }
  return reached;
}

/**
 * Phòng CÓ đường tới (theo mọi cửa) nhưng KHÔNG có đường hợp lệ, kèm phòng buộc phải đi xuyên.
 *
 * Phòng không có đường tới nào thì không nằm ở đây — đó là `room_unreachable_on_level`, một lỗi khác.
 */
export function passageViolations(input: PassageInput): PassageViolation[] {
  const plain = new Set<string>();
  const queue = [...input.starts];
  while (queue.length) {
    const current = queue.shift()!;
    if (plain.has(current)) continue;
    plain.add(current);
    for (const [p, q] of input.links) {
      if (p === current && !plain.has(q)) queue.push(q);
      if (q === current && !plain.has(p)) queue.push(p);
    }
  }
  const proper = properlyReached(input);
  const out: PassageViolation[] = [];
  for (const room of [...plain].sort()) {
    if (proper.has(room)) continue;
    // Chỉ nêu phòng mà BƯỚC CUỐI sai. Ban công của một phòng ngủ đang bị đi xuyên thì bước vào ban
    // công vẫn đúng — lỗi nằm ở phòng ngủ, nêu cả hai là bắt lượt sửa sửa một thứ không sai.
    const blocked = input.links
      .map(([p, q]) => (p === room ? q : q === room ? p : null))
      .filter((id): id is string => id !== null && plain.has(id) && !mayEnter(input, id, room))
      .sort();
    // Nêu phòng kề ĐÃ tới hợp lệ trước: đó đúng là chỗ đường vào phải đi xuyên.
    const via = blocked.find((id) => proper.has(id)) ?? blocked[0];
    if (via) out.push({ room, via });
  }
  return out;
}

export interface EverydayRouteInput extends PassageInput {
  /** Loại phòng được coi là KHU SINH HOẠT CHUNG — chỗ người trong nhà xuất phát mỗi ngày. */
  shared: ReadonlySet<string>;
}

/**
 * Đường đi HẰNG NGÀY không được xuyên khu phục vụ (T48, 16/09/2026 — Haan chốt «chặn, cho mô hình sửa»).
 *
 * `passageViolations` hỏi «đường vào phòng này có xuyên phòng riêng của ai không». Câu hỏi ở đây khác:
 * từ chỗ cả nhà ngồi — phòng khách, phòng ăn, hành lang, thang — có tới được WC chung, bếp, chân thang
 * mà KHÔNG phải đi qua gara hay ra ngoài sảnh không.
 *
 * Vì sao cần: lượt đo 58d9ff66 cho ra tầng 1 hợp lệ theo mọi phép kiểm cũ — phòng nào cũng có cửa,
 * phòng nào cũng tới được từ lối vào — nhưng đường thật từ phòng khách tới WC chung là khách → sảnh
 * ngoài → thang → GARA → hành lang → WC. Haan chấm «chưa đạt, giao thông bất tiện».
 *
 * Phòng khép kín không xét: WC của phòng ngủ là chuyện riêng của phòng ấy. Tầng không có khu sinh hoạt
 * chung nào (chỉ gara và thang) cũng không xét — không có chỗ nào để xuất phát.
 */
export function everydayRouteViolations(input: EverydayRouteInput): PassageViolation[] {
  const { rules } = input;
  const typesOf = (id: string) => input.typesOf.get(id) ?? new Set<string>();
  const any = (id: string, allowed: ReadonlySet<string>) =>
    [...typesOf(id)].some((type) => allowed.has(type));

  const rooms = [...input.typesOf.keys()].sort();
  const service = rooms.filter((id) => any(id, rules.notARoute));
  if (service.length === 0) return [];
  const starts = rooms.filter((id) => any(id, input.shared) && !any(id, rules.notARoute));
  if (starts.length === 0) return [];

  // Đi từ khu sinh hoạt chung, bỏ qua mọi phòng thuộc khu phục vụ.
  const blocked = new Set(service);
  const reached = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const current = queue.shift()!;
    if (reached.has(current) || blocked.has(current)) continue;
    reached.add(current);
    for (const [p, q] of input.links) {
      const next = p === current ? q : q === current ? p : null;
      if (
        next !== null &&
        !reached.has(next) &&
        !blocked.has(next) &&
        mayEnter(input, current, next)
      ) {
        queue.push(next);
      }
    }
  }

  const proper = properlyReached(input);
  const out: PassageViolation[] = [];
  for (const room of rooms) {
    if (!any(room, rules.everyday) || reached.has(room)) continue;
    if (input.parentOf.has(room)) continue;
    // Phòng vốn đã không có đường hợp lệ nào là lỗi KHÁC (`room_through_private`, `room_unreachable`)
    // — nói thêm ở đây chỉ làm lượt sửa chữa hai chỗ cho một nguyên nhân.
    if (!proper.has(room)) continue;
    const via = input.links
      .map(([p, q]) => (p === room ? q : q === room ? p : null))
      .filter((id): id is string => id !== null && blocked.has(id))
      .sort()[0];
    out.push({ room, via: via ?? service[0]! });
  }
  return out;
}
