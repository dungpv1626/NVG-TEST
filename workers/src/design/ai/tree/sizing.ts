/**
 * Căn lại vị trí vách theo DIỆN TÍCH chương trình yêu cầu — không tốn một token nào (13/09/2026).
 *
 * Mô hình khai tôpô (phòng nào cạnh phòng nào) và cả con số `at` của từng nhát cắt. Tôpô là phần nó
 * làm tốt; con số thì không — hai lượt thật hôm ấy lệch diện tích bình quân 26% (Claude Sonnet) và 37%
 * (gpt-5) so với chương trình, và phòng tắm, ban công hẹp dưới mức tối thiểu. Đó đúng là phép số học
 * mà T37 đã quyết giao cho chương trình.
 *
 * Với cây guillotine, một nhát cắt chia một chữ nhật thành hai nửa CÙNG bề ngang, nên tỉ lệ diện tích
 * hai nửa đúng bằng tỉ lệ độ dài dọc trục cắt. Đặt `at` theo tỉ lệ tổng diện tích yêu cầu của hai cây
 * con là cho mọi phòng cùng một hệ số co giãn — lệch đều, không phòng nào gánh hết phần thiếu.
 *
 * Bốn giới hạn, theo thứ tự ưu tiên:
 *  1. Nút KHOÁ giữ nguyên `at` — nút cắt ra ô thang / giếng trời phải chồng khít tầng dưới, và mọi
 *     nút tổ tiên của chúng (dời tổ tiên là dời luôn ô thang).
 *  2. Ô `unbuilt_N` / `void_N` giữ nguyên độ dài mô hình khai: sân bên, lỗ thông tầng là ý đồ, không
 *     có diện tích yêu cầu nào để so.
 *  3. Mỗi phòng giữ cạnh ngắn tối thiểu của loại phòng (gói kinh nghiệm, `min_dimension`) cộng phần
 *     tường; loại không có quy tắc thì không hẹp hơn mô hình đã khai hoặc 130 cm.
 *  4. Làm tròn 5 cm — mô-đun kiến trúc sư vẫn ghi kích thước.
 *
 * Cây phải ĐÃ duyệt thành công (`walkTree`). Không đạt được giới hạn nào thì trả `null`: giữ nguyên cây của mô hình. Tệp này KHÔNG quyết dùng cây
 * mới — `index.ts` dựng cả hai và chỉ lấy bản mới khi nó qua cổng và sát chương trình hơn.
 */

import type { AiPlanTree } from '@nvg/shared/design';
import type { Rect } from '../draw/geometry';
import { MIN_CELL_CM, UNBUILT_RE, VOID_RE } from './cells';

/** Phần tường cộng thêm vào cạnh tối thiểu lọt lòng để ra cạnh theo tim: tường bao 22 + nửa vách. */
const WALL_ALLOWANCE_CM = 33;

/** Cạnh tối thiểu theo tim của phòng mà gói quy tắc không nói gì — đủ một cửa đi và hai mép. */
const DEFAULT_ROOM_SIDE_CM = 130;

const MODULE_CM = 5;

/**
 * Vách căn xong lệch một vách song song đã đặt không quá chừng này thì kéo cho thẳng hàng. Không kéo
 * thì hai nhát cắt độc lập hai bên một bức vách vuông góc lệch nhau vài xen-ti-mét — trên tờ vẽ là
 * một khấc 7 cm và một mẩu tường thừa (cây gpt-5 13/09/2026, tầng 1).
 */
const ALIGN_SNAP_CM = 20;

export interface SizingInput {
  tree: Pick<AiPlanTree, 'footprint' | 'nodes' | 'also'>;
  /** Mã phòng → loại và diện tích yêu cầu, m² (chương trình không gian). */
  spaces: ReadonlyMap<string, { type: string; target: number }>;
  /** Cạnh ngắn tối thiểu LỌT LÒNG của một loại phòng, m. `null` = không có quy tắc. */
  minSideM: (roomType: string) => number | null;
  /** Mã lá phải đứng yên (ô thang, giếng trời bám mốc tầng dưới). */
  pinnedLeaves: ReadonlySet<string>;
  /**
   * Loại phòng KHÔNG co nhỏ hơn mô hình đã vẽ — giao thông. Chương trình không gian hay cấp hành lang
   * thiếu (lượt thật 13/09/2026: 12,9% cho một nhà vườn, khoảng đạt 18–25%); co hành lang về đúng số ấy
   * là đổi điểm A1 lấy điểm C2, và làm ngắn đoạn vách mọi phòng phải mở cửa vào.
   */
  noShrinkTypes?: ReadonlySet<string>;
  /**
   * 1 = đặt hẳn theo tỉ lệ diện tích; 0,5 = nửa đường giữa con số mô hình và tỉ lệ ấy. Căn hết cỡ có
   * thể làm đoạn vách chung mang cửa ngắn lại dưới bề rộng cửa (đo trên cây gpt-5: hành lang còn
   * chung 28 cm với phòng ngủ nó phải mở vào), nên `index.ts` thử nhiều mức.
   */
  strength?: number;
}

type Axis = 'x' | 'y';

export function resizeTree(input: SizingInput): AiPlanTree['nodes'] | null {
  const nodes = new Map(input.tree.nodes.map((node) => [node.id, node]));
  const children = new Set(input.tree.nodes.flatMap((node) => [node.a, node.b]));
  const root = input.tree.nodes.find((node) => !children.has(node.id));
  if (!root) return null;

  const alsoOf = new Map<string, string[]>();
  for (const merge of input.tree.also) alsoOf.set(merge.room, merge.with);

  // Chữ nhật GỐC của mọi nút và lá, theo cây mô hình khai.
  const original = new Map<string, Rect>();
  const parentOf = new Map<string, string>();
  const walk = (id: string, rect: Rect) => {
    original.set(id, rect);
    const node = nodes.get(id);
    if (!node) return;
    parentOf.set(node.a, id);
    parentOf.set(node.b, id);
    if (node.cut === 'x') {
      walk(node.a, { ...rect, x1: node.at });
      walk(node.b, { ...rect, x0: node.at });
    } else {
      walk(node.a, { ...rect, y1: node.at });
      walk(node.b, { ...rect, y0: node.at });
    }
  };
  const [fx0, fy0, fx1, fy1] = input.tree.footprint;
  walk(root.id, { x0: fx0!, y0: fy0!, x1: fx1!, y1: fy1! });

  const locked = new Set<string>();
  for (const leaf of input.pinnedLeaves) {
    for (let at = parentOf.get(leaf); at; at = parentOf.get(at)) locked.add(at);
  }

  const length = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.x1 - rect.x0 : rect.y1 - rect.y0);
  const isFixedLeaf = (id: string) => UNBUILT_RE.test(id) || VOID_RE.test(id);

  const weightMemo = new Map<string, number>();
  const weight = (id: string): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    const node = nodes.get(id);
    let value: number;
    if (node) {
      value = weight(node.a) + weight(node.b);
    } else {
      const rect = original.get(id)!;
      const current = length(rect, 'x') * length(rect, 'y');
      const target = [id, ...(alsoOf.get(id) ?? [])].reduce(
        (sum, room) => sum + (input.spaces.get(room)?.target ?? 0),
        0,
      );
      const keep = [id, ...(alsoOf.get(id) ?? [])].some((room) =>
        input.noShrinkTypes?.has(input.spaces.get(room)?.type ?? ''),
      );
      value =
        isFixedLeaf(id) || target <= 0
          ? current
          : keep
            ? Math.max(target * 10_000, current)
            : target * 10_000;
    }
    weightMemo.set(id, value);
    return value;
  };

  const fixed = (id: string): boolean => {
    const node = nodes.get(id);
    return node ? fixed(node.a) && fixed(node.b) : isFixedLeaf(id);
  };

  const minLength = (id: string, axis: Axis): number => {
    const node = nodes.get(id);
    if (node) {
      const a = minLength(node.a, axis);
      const b = minLength(node.b, axis);
      return node.cut === axis ? a + b : Math.max(a, b);
    }
    const rect = original.get(id)!;
    if (isFixedLeaf(id)) return length(rect, axis);
    const types = [id, ...(alsoOf.get(id) ?? [])]
      .map((room) => input.spaces.get(room)?.type)
      .filter((type): type is string => !!type);
    const rules = types.map((type) => input.minSideM(type)).filter((v): v is number => v !== null);
    const base = rules.length
      ? Math.round(Math.max(...rules) * 100) + WALL_ALLOWANCE_CM
      : Math.min(DEFAULT_ROOM_SIDE_CM, length(rect, axis));
    return Math.max(MIN_CELL_CM, base);
  };

  const out = new Map<string, number>();
  let feasible = true;
  // Vị trí đã đặt theo trục, và vị trí đã đặt cho từng NHÓM nhát cắt mô hình khai trùng một toạ độ:
  // mô hình cho hai nhát cắt cùng `at` là nó muốn một bức vách thẳng — căn xong vẫn phải thẳng.
  const placed: Record<Axis, number[]> = { x: [fx0!, fx1!], y: [fy0!, fy1!] };
  const byOriginal = new Map<string, number>();
  // Nhát cắt khoá đứng yên, nên nhóm của nó đã có vị trí trước khi duyệt: một nhát cắt khác mô hình
  // khai cùng toạ độ phải bám theo, dù được duyệt TRƯỚC nó.
  for (const id of locked) {
    const node = nodes.get(id)!;
    byOriginal.set(`${node.cut}|${node.at}`, node.at);
    placed[node.cut].push(node.at);
  }
  const assign = (id: string, rect: Rect) => {
    const node = nodes.get(id);
    if (!node || !feasible) return;
    const axis: Axis = node.cut;
    const lo = axis === 'x' ? rect.x0 : rect.y0;
    const hi = axis === 'x' ? rect.x1 : rect.y1;
    const before = original.get(id)!;
    const beforeLo = axis === 'x' ? before.x0 : before.y0;
    const beforeHi = axis === 'x' ? before.x1 : before.y1;

    let at: number;
    if (locked.has(id) || (fixed(node.a) && fixed(node.b))) {
      at = node.at;
    } else if (fixed(node.a)) {
      at = lo + (node.at - beforeLo);
    } else if (fixed(node.b)) {
      at = hi - (beforeHi - node.at);
    } else {
      const minA = minLength(node.a, axis);
      const minB = minLength(node.b, axis);
      const proportional = lo + ((hi - lo) * weight(node.a)) / (weight(node.a) + weight(node.b));
      const modelled = lo + ((hi - lo) * (node.at - beforeLo)) / (beforeHi - beforeLo);
      const ideal = modelled + (input.strength ?? 1) * (proportional - modelled);
      const floor = lo + (minA + minB <= hi - lo ? minA : MIN_CELL_CM);
      const ceil = hi - (minA + minB <= hi - lo ? minB : MIN_CELL_CM);
      const rounded = Math.round(ideal / MODULE_CM) * MODULE_CM;
      at = Math.min(ceil, Math.max(floor, rounded));
      if (at % 1 !== 0) at = Math.round(at);
      const within = (value: number) => value >= floor && value <= ceil;
      const sameWall = byOriginal.get(`${axis}|${node.at}`);
      const nearby = placed[axis]
        .filter((value) => within(value) && Math.abs(value - at) <= ALIGN_SNAP_CM)
        .sort((p, q) => Math.abs(p - at) - Math.abs(q - at))[0];
      if (sameWall !== undefined && within(sameWall)) at = sameWall;
      else if (nearby !== undefined) at = nearby;
    }
    placed[axis].push(at);
    if (!byOriginal.has(`${axis}|${node.at}`)) byOriginal.set(`${axis}|${node.at}`, at);
    if (at - lo < MIN_CELL_CM || hi - at < MIN_CELL_CM) {
      feasible = false;
      return;
    }
    out.set(id, at);
    if (axis === 'x') {
      assign(node.a, { ...rect, x1: at });
      assign(node.b, { ...rect, x0: at });
    } else {
      assign(node.a, { ...rect, y1: at });
      assign(node.b, { ...rect, y0: at });
    }
  };
  assign(root.id, original.get(root.id)!);
  if (!feasible) return null;
  if (input.tree.nodes.every((node) => out.get(node.id) === node.at)) return null;
  return input.tree.nodes.map((node) => ({ ...node, at: out.get(node.id) ?? node.at }));
}
