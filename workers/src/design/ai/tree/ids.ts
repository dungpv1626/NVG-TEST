/**
 * Chuẩn hoá MÃ trong cây chia mô hình trả về — trước khi kiểm hợp đồng.
 *
 * Vì sao có (13/09/2026): hợp đồng chỉ nhận mã `^[a-z0-9_]+$`, nhưng chế độ `strict` của OpenAI
 * không nhận `pattern` nên luật ấy bị lược khỏi lược đồ gửi đi (`schema-dialect.ts`). Lượt xếp
 * tầng 1 của biệt thự demo hỏng HAI lần liền, 37.899 token ra, 0,39 USD, với cùng một kiểu lỗi:
 * `nodes.0.a`, `nodes.1.id`, `nodes.1.b`… «Invalid» — đúng hình của mã phân cấp kiểu `root.a`,
 * `root.a.b`. Mã chỉ cần DUY NHẤT và KHỚP NHAU giữa các chỗ tham chiếu; viết hoa hay dấu chấm
 * không làm cây sai đi, nên bác cả tầng vì nó là mua lại đúng lượt đắt vừa hỏng.
 *
 * Luật: chữ thường; mọi ký tự ngoài `a–z 0–9 _` thành `_`. Áp CÙNG một phép cho mọi trường mang
 * mã (nút, con, cửa, thang, gộp phòng, không cửa sổ), nên tham chiếu vẫn khớp. Hai mã KHÁC nhau
 * mà chuẩn hoá ra cùng một mã thì KHÔNG đổi mã nào trong hai — để bộ kiểm bác và nói ra, thay vì
 * lặng lẽ gộp hai nút làm một.
 */

const VALID = /^[a-z0-9_]+$/;

function normalise(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

/** Bảng đổi mã: chỉ mã sai khuôn, và bỏ qua khi hai mã khác nhau đổ về cùng một đích. */
function renameMap(ids: readonly string[]): Map<string, string> {
  const unique = [...new Set(ids)];
  const byTarget = new Map<string, Set<string>>();
  for (const id of unique) {
    const target = VALID.test(id) ? id : normalise(id);
    byTarget.set(target, (byTarget.get(target) ?? new Set()).add(id));
  }
  const map = new Map<string, string>();
  for (const id of unique) {
    if (VALID.test(id)) continue;
    const target = normalise(id);
    if (!target || !VALID.test(target)) continue;
    if ((byTarget.get(target)?.size ?? 0) > 1) continue;
    map.set(id, target);
  }
  return map;
}

/** Mọi chuỗi mã xuất hiện trong cây, theo đúng các trường mang mã của hợp đồng `ai-plan-tree`. */
function collectIds(tree: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
  };
  for (const node of asArray(tree.nodes)) {
    push(node.id);
    push(node.a);
    push(node.b);
  }
  for (const merge of asArray(tree.also)) {
    push(merge.room);
    for (const w of Array.isArray(merge.with) ? merge.with : []) push(w);
  }
  for (const door of asArray(tree.doors)) {
    push(door.a);
    push(door.b);
  }
  const stair = tree.stair as Record<string, unknown> | null | undefined;
  if (stair && typeof stair === 'object') push(stair.room);
  for (const id of Array.isArray(tree.no_window) ? tree.no_window : []) push(id);
  return out;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    : [];
}

export interface NormalisedTreeIds {
  json: unknown;
  /** Các cặp mã đã đổi — ghi chú cho người đọc, và cho phép thử. */
  renamed: Array<[string, string]>;
}

export function normaliseTreeIds(json: unknown): NormalisedTreeIds {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { json, renamed: [] };
  const tree = json as Record<string, unknown>;
  const map = renameMap(collectIds(tree));
  if (map.size === 0) return { json, renamed: [] };

  const fix = (v: unknown) => (typeof v === 'string' ? (map.get(v) ?? v) : v);
  const copy = structuredClone(tree);
  for (const node of asArray(copy.nodes)) {
    node.id = fix(node.id);
    node.a = fix(node.a);
    node.b = fix(node.b);
  }
  for (const merge of asArray(copy.also)) {
    merge.room = fix(merge.room);
    if (Array.isArray(merge.with)) merge.with = merge.with.map(fix);
  }
  for (const door of asArray(copy.doors)) {
    door.a = fix(door.a);
    door.b = fix(door.b);
  }
  const stair = copy.stair as Record<string, unknown> | null | undefined;
  if (stair && typeof stair === 'object') stair.room = fix(stair.room);
  if (Array.isArray(copy.no_window)) copy.no_window = copy.no_window.map(fix);
  return { json: copy, renamed: [...map] };
}

/**
 * Cùng phép chuẩn hoá cho Ý ĐỊNH BỐ CỤC một tầng (T43): `rooms[].id`, `relationships[].a/b`,
 * `entry_room`, `garage_room`.
 */
export function normaliseIntentIds(json: unknown): NormalisedTreeIds {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { json, renamed: [] };
  const intent = json as Record<string, unknown>;
  const ids: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') ids.push(v);
  };
  for (const room of asArray(intent.rooms)) push(room.id);
  for (const rel of asArray(intent.relationships)) {
    push(rel.a);
    push(rel.b);
  }
  push(intent.entry_room);
  push(intent.garage_room);
  const map = renameMap(ids);
  if (map.size === 0) return { json, renamed: [] };
  const fix = (v: unknown) => (typeof v === 'string' ? (map.get(v) ?? v) : v);
  const copy = structuredClone(intent);
  for (const room of asArray(copy.rooms)) room.id = fix(room.id);
  for (const rel of asArray(copy.relationships)) {
    rel.a = fix(rel.a);
    rel.b = fix(rel.b);
  }
  copy.entry_room = fix(copy.entry_room);
  copy.garage_room = fix(copy.garage_room);
  // Ô bản phác (T48) trỏ cùng mã phòng — đổi theo, không thì mọi ô thành mã lạ.
  for (const sketch of asArray(copy.sketches)) {
    if (!Array.isArray(sketch.rows)) continue;
    sketch.rows = sketch.rows.map((row: unknown) =>
      typeof row === 'string'
        ? row
            .trim()
            .split(/\s+/)
            .map((token) => map.get(token) ?? token)
            .join(' ')
        : row,
    );
  }
  return { json: copy, renamed: [...map] };
}

/**
 * Cùng phép chuẩn hoá cho Ý ĐỊNH CẢ NHÀ (T45): `rooms[].id`, `rooms[].ensuite_of`,
 * `relationships[].a/b`, `entry_room`, `garage_room`.
 */
export function normaliseHouseIds(json: unknown): NormalisedTreeIds {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { json, renamed: [] };
  const intent = json as Record<string, unknown>;
  const ids: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') ids.push(v);
  };
  for (const room of asArray(intent.rooms)) {
    push(room.id);
    push(room.ensuite_of);
  }
  for (const rel of asArray(intent.relationships)) {
    push(rel.a);
    push(rel.b);
  }
  push(intent.entry_room);
  push(intent.garage_room);
  const map = renameMap(ids);
  if (map.size === 0) return { json, renamed: [] };
  const fix = (v: unknown) => (typeof v === 'string' ? (map.get(v) ?? v) : v);
  const copy = structuredClone(intent);
  for (const room of asArray(copy.rooms)) {
    room.id = fix(room.id);
    room.ensuite_of = fix(room.ensuite_of);
  }
  for (const rel of asArray(copy.relationships)) {
    rel.a = fix(rel.a);
    rel.b = fix(rel.b);
  }
  copy.entry_room = fix(copy.entry_room);
  copy.garage_room = fix(copy.garage_room);
  // Ô bản phác (T48) trỏ cùng mã phòng — đổi theo, không thì mọi ô thành mã lạ.
  for (const sketch of asArray(copy.sketches)) {
    if (!Array.isArray(sketch.rows)) continue;
    sketch.rows = sketch.rows.map((row: unknown) =>
      typeof row === 'string'
        ? row
            .trim()
            .split(/\s+/)
            .map((token) => map.get(token) ?? token)
            .join(' ')
        : row,
    );
  }
  return { json: copy, renamed: [...map] };
}

/**
 * Cùng phép chuẩn hoá cho ĐỀ XUẤT chương trình không gian: `spaces[].id` và `ensuite_of`.
 *
 * Lượt thật 13/09/2026 22:14 (gpt-5, mức Vừa): lượt 1 bị bác vì `spaces.0.id` … `spaces.7.id`
 * «Invalid», 9.427 token ra, 0,10 USD — trong khi Worker đánh lại MỌI mã theo khuôn `type_n` ngay
 * sau khi kiểm (`programFromProposal`). Mã của mô hình chỉ cần duy nhất và khớp `ensuite_of`.
 */
export function normaliseProgramIds(json: unknown): NormalisedTreeIds {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { json, renamed: [] };
  const proposal = json as Record<string, unknown>;
  const ids: string[] = [];
  for (const space of asArray(proposal.spaces)) {
    if (typeof space.id === 'string') ids.push(space.id);
    if (typeof space.ensuite_of === 'string') ids.push(space.ensuite_of);
  }
  const map = renameMap(ids);
  if (map.size === 0) return { json, renamed: [] };
  const copy = structuredClone(proposal);
  for (const space of asArray(copy.spaces)) {
    if (typeof space.id === 'string') space.id = map.get(space.id) ?? space.id;
    if (typeof space.ensuite_of === 'string') {
      space.ensuite_of = map.get(space.ensuite_of) ?? space.ensuite_of;
    }
  }
  return { json: copy, renamed: [...map] };
}

/**
 * Cắt chữ tự do vượt trần của hợp đồng — ở MỘT chỗ, trước khi kiểm.
 *
 * Lượt thật 13/09/2026 22:21: cây tầng 2 bị bác CHỈ vì `rationale` dài hơn 300 ký tự — 32.218
 * token ra, 294 giây, 0,33 USD — rồi lượt xếp lại dựng cây mới từ đầu tốn thêm chừng ấy. Lời giải
 * thích dài hơn một chút không làm bố cục sai đi; bác cả tầng vì nó là đổi cây tốt lấy chữ ngắn.
 * `strict` của OpenAI không nhận `maxLength` nên mô hình không thấy trần này.
 */
export function clampText(
  json: unknown,
  limits: Readonly<Record<string, number>>,
): { json: unknown; clamped: string[] } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { json, clamped: [] };
  const record = json as Record<string, unknown>;
  const clamped = Object.entries(limits).filter(
    ([key, max]) => typeof record[key] === 'string' && (record[key] as string).length > max,
  );
  if (!clamped.length) return { json, clamped: [] };
  const copy = { ...record };
  for (const [key, max] of clamped) {
    const text = (copy[key] as string).slice(0, max - 1);
    const cut = text.lastIndexOf(' ');
    copy[key] = `${(cut > max * 0.6 ? text.slice(0, cut) : text).trimEnd()}…`;
  }
  return { json: copy, clamped: clamped.map(([key]) => key) };
}
