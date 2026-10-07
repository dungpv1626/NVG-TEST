/**
 * Dựng lại DẢI một tầng khi dải của mô hình sâu hơn khối nhà (T116, Haan chọn hướng (a) sau lượt thật 93d212a2). Giống
 * bộ «khung xương» T102 của đường bản phác: giữ đúng các phòng mô hình đặt trên tầng ấy, chương trình chọn cách GHÉP
 * phòng đứng cạnh nhau và thứ tự dải, rồi để chính bộ giải + chọn cửa kiểm (`attempt`).
 *
 *  - Ghép: mọi cách chia các ô (phòng + ô thang) thành dải mà tổng cạnh tối thiểu vừa bề ngang; giữ những cách có tổng
 *    chiều sâu tối thiểu (`bandMinDepth`, chưa tính hành lang) vừa khối, ít sâu trước.
 *  - Thứ tự: dải chứa phòng lối vào đứng đầu; còn lại thử mọi hoán vị, ưu tiên cách GIỐNG mô hình nhất (ít cặp phòng bị
 *    đảo trước–sau so với dải mô hình ghi), rồi ít sâu hơn.
 *  - Trong dải: ô theo thứ tự trái–phải mô hình ghi; ô thang giữ phía mô hình đặt (tầng trên chồng theo nó). Biến thể có
 *    hành lang cạnh ô thang để tới các phòng sau thang.
 *  - Hành lang mô hình ghi bị bỏ — chương trình tự thêm khi cần.
 *
 * Hàm THUẦN; `attempt` do nơi gọi cấp (bộ giải cả nhà + kiểm đi tới được).
 */
import type { AiHouseBands } from '@nvg/shared/design';
import { bandMinDepth, type DepthCell } from '../feasibility';
import { OPEN_CELL } from './solve';

type BandsStorey = AiHouseBands['storeys'][number];

export interface RebuildInput {
  storey: BandsStorey;
  /** Loại của mã phòng (danh mục hoặc tiền tố mã tự thêm); `null` = mã lạ. */
  typeOf: (id: string) => string | null;
  /** Diện tích cần (m²) — 0 với loại không đẩy chiều sâu. */
  needM2: (id: string) => number;
  minSideCm: (type: string) => number;
  stair: { width: number; length: number } | null;
  stairToken: string;
  widthCm: number;
  depthCm: number;
  wallCm: number;
  corridorClearCm: number;
  /** Mã hành lang chương trình thêm (tiền tố hành lang của `model_added`). */
  corridorId: string;
  entryRoom: string | null;
  /**
   * Chấm một tầng dựng lại: `null` = loại (bộ giải không dựng được, tầng ấy có phòng không đi tới được…); số = phạt
   * (0 = trọn vẹn, dừng tìm). Lấy cách phạt ít nhất trong các lần thử.
   */
  attempt: (storey: BandsStorey) => number | null;
  /** Số lần thử tối đa (mỗi lần là một lượt bộ giải cả nhà). */
  maxTries?: number;
  /**
   * Khoảng mép trước ô thang mà các TẦNG TRÊN chịu được (cm từ mặt đường; ước theo dải của chúng) — tầng 1 là mốc thang
   * của mọi tầng. Cách dựng lại có thang ngoài khoảng xếp sau (phát lại 822e699d: 80 lần thử đều giữ thứ tự mô hình, thang
   * nằm sau phòng khách, tầng trên không còn chỗ).
   */
  stairWindow?: { lo: number; hi: number } | null;
}

export interface RebuildResult {
  storey: BandsStorey;
  /** Dải dựng lại, trước ra sau — cho ghi chú. */
  bands: string[][];
  tries: number;
  /** Phạt của cách đã chọn (0 = trọn vẹn). */
  penalty: number;
}

const STEP = 10;
/** Giới hạn duyệt cách chia — tầng nhà ở thật có ≤ 10 ô, cắt sớm theo bề ngang nên thường dưới vài nghìn. */
const MAX_PARTITIONS = 50_000;
const KEEP_PARTITIONS = 40;

export function rebuildStorey(input: RebuildInput): RebuildResult | null {
  const { storey, stairToken } = input;
  // Thứ tự mô hình: dải (trước–sau) và vị trí trái–phải của từng phòng.
  const modelBand = new Map<string, number>();
  const modelX = new Map<string, number>();
  let stairRight = false;
  // Vị trí trái–phải của ô thang và hành lang cùng dải thang mô hình ghi: tầng trên chồng theo thang tầng 1, thang dời ra
  // mép thì ô cạnh thang tầng trên hết chỗ (lượt thật 41ffe1e5: mô hình đặt [giếng trời | THANG | hành lang], bản dựng lại
  // đẩy THANG sát tường trái — mọi tầng trên `band_cell_too_narrow`).
  let stairX: number | null = null;
  let corridorX: number | null = null;
  /** Khối → ô chồng mô hình ghi (`null` = một phòng). */
  const units = new Map<string, BandsStorey['bands'][number]['cells'][number]['stack'] | null>();
  let stairStack: BandsStorey['bands'][number]['cells'][number]['stack'] | null = null;
  storey.bands.forEach((band, b) => {
    const hasStair = band.cells.some(
      (cell) => cell.id === stairToken || cell.stack.some((s) => s.id === stairToken),
    );
    band.cells.forEach((cell, c) => {
      const x = (c + 0.5) / band.cells.length;
      const ids = cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id];
      if (ids.includes(stairToken)) {
        stairRight = c > (band.cells.length - 1) / 2;
        stairX = x;
        // Ô [THANG / WC gầm thang]: giữ nguyên ô chồng ấy cho ô thang.
        if (ids.length > 1) stairStack = cell.stack;
        return;
      }
      if (
        hasStair &&
        corridorX === null &&
        ids.some((id) => id && input.typeOf(id) === 'circulation')
      )
        corridorX = x;
      const real = ids.filter((id) => id && id !== OPEN_CELL && input.typeOf(id) !== 'circulation');
      if (!real.length) return;
      // Ô xếp chồng mô hình ghi là MỘT khối (handoff sửa lỗi đợt 2: bảng cạnh KTS — tách [WC / giếng trời] thành hai ô
      // đứng cạnh nhau thì nhà 5 m không còn bề ngang). Khoá của khối là các mã nối «/».
      const key = real.join('/');
      units.set(
        key,
        cell.stack.length ? cell.stack.filter((part) => real.includes(part.id)) : null,
      );
      modelBand.set(key, b);
      modelX.set(key, x);
    });
  });
  const rooms = [...modelBand.keys()];
  const partsOf = (key: string) => key.split('/');
  if (rooms.some((key) => partsOf(key).some((id) => input.typeOf(id) === null))) return null;
  const cells: DepthCell[] = [
    ...(input.stair
      ? [{ id: stairToken, side: input.stair.length, w: input.stair.width, area: 0 }]
      : []),
    ...rooms.map((key) => ({
      id: key,
      side: Math.max(...partsOf(key).map((id) => input.minSideCm(input.typeOf(id)!))),
      w: 0,
      area: partsOf(key).reduce((sum, id) => sum + input.needM2(id) * 1e4, 0),
    })),
  ];
  const n = cells.length;
  if (n < 2 || n > 10) return null;

  const depthMemo = new Map<number, number>();
  const depthOf = (mask: number) => {
    let d = depthMemo.get(mask);
    if (d === undefined) {
      d = bandMinDepth(
        cells.filter((_, i) => mask & (1 << i)),
        input.widthCm,
        input.wallCm,
        STEP,
        input.depthCm,
      );
      depthMemo.set(mask, d);
    }
    return d;
  };
  const sideOf = (c: DepthCell) => (c.w > 0 ? c.w : c.side);

  // ── Cách chia thành dải ─────────────────────────────────────────────────────────────────────
  const partitions: { groups: number[]; depth: number }[] = [];
  let visited = 0;
  const groups: number[] = [];
  const widths: number[] = [];
  const walk = (i: number) => {
    if ((visited += 1) > MAX_PARTITIONS) return;
    if (i === n) {
      const depth = groups.reduce((sum, mask) => sum + depthOf(mask), 0);
      if (depth <= input.depthCm) partitions.push({ groups: [...groups], depth });
      return;
    }
    const cell = cells[i]!;
    for (let g = 0; g < groups.length; g += 1) {
      if (widths[g]! + sideOf(cell) > input.widthCm) continue;
      groups[g] = groups[g]! | (1 << i);
      widths[g] = widths[g]! + sideOf(cell);
      walk(i + 1);
      groups[g] = groups[g]! & ~(1 << i);
      widths[g] = widths[g]! - sideOf(cell);
    }
    groups.push(1 << i);
    widths.push(sideOf(cell));
    walk(i + 1);
    groups.pop();
    widths.pop();
  };
  walk(0);
  partitions.sort((a, b) => a.depth - b.depth);

  // ── Thứ tự dải + ô trong dải → ứng viên ─────────────────────────────────────────────────────
  const entryIndex = input.entryRoom
    ? cells.findIndex((c) => partsOf(c.id).includes(input.entryRoom!))
    : -1;
  const candidates: { order: string[][]; corridor: boolean; score: number }[] = [];
  for (const partition of partitions.slice(0, KEEP_PARTITIONS)) {
    const head = entryIndex >= 0 ? partition.groups.filter((m) => m & (1 << entryIndex)) : [];
    const rest = partition.groups.filter((m) => !head.includes(m));
    for (const tail of permutations(rest)) {
      const order = [...head, ...tail].map((mask) =>
        cells
          .filter((_, i) => mask & (1 << i))
          .map((c) => c.id)
          .sort((a, b) => (modelX.get(a) ?? 0) - (modelX.get(b) ?? 0)),
      );
      // Đảo trước–sau so với mô hình: cặp (a, b) mô hình đặt a trước b mà ứng viên đặt b trước a.
      const bandOf = new Map(order.flatMap((ids, b) => ids.map((id) => [id, b] as const)));
      let inversions = 0;
      for (const a of rooms)
        for (const b of rooms)
          if (modelBand.get(a)! < modelBand.get(b)! && bandOf.get(a)! > bandOf.get(b)!)
            inversions += 1;
      // Thang tầng 1 ngoài khoảng tầng trên chịu được: xếp sau mọi cách trong khoảng.
      const stairAt = order.findIndex((ids) => ids.includes(stairToken));
      const maskOf = [...head, ...tail];
      const before = maskOf.slice(0, Math.max(stairAt, 0)).reduce((sum, m) => sum + depthOf(m), 0);
      const after = maskOf.slice(stairAt + 1).reduce((sum, m) => sum + depthOf(m), 0);
      const stairDepth = stairAt >= 0 ? depthOf(maskOf[stairAt]!) : 0;
      const window = input.stairWindow;
      const miss =
        window && stairAt >= 0
          ? Math.max(
              0,
              Math.max(before, window.lo) - Math.min(input.depthCm - stairDepth - after, window.hi),
            )
          : 0;
      const score = (miss > 0 ? 1_000_000 + miss : 0) + inversions * 1000 + partition.depth / 10;
      candidates.push({ order, corridor: false, score });
      candidates.push({ order, corridor: true, score: score + 1 });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const maxTries = input.maxTries ?? 80;
  let tries = 0;
  let best: { storey: BandsStorey; bands: string[][]; penalty: number } | null = null;
  for (const candidate of candidates) {
    const built = toStorey(candidate.order, candidate.corridor);
    if (!built) continue;
    if ((tries += 1) > maxTries) break;
    const penalty = input.attempt(built.storey);
    if (penalty === null || (best && best.penalty <= penalty)) continue;
    best = { ...built, penalty };
    if (penalty === 0) break;
  }
  return best ? { storey: best.storey, bands: best.bands, tries, penalty: best.penalty } : null;

  function toStorey(
    order: string[][],
    corridor: boolean,
  ): { storey: BandsStorey; bands: string[][] } | null {
    const bands = order.map((ids) => {
      if (!ids.includes(stairToken)) return ids;
      const others = ids.filter((id) => id !== stairToken);
      // Mô hình ghi chỗ thang: giữ đúng thứ tự trái–phải (hành lang ở chỗ mô hình ghi, không có thì sát thang phía các
      // phòng).
      if (stairX !== null && others.every((id) => modelX.has(id))) {
        const at = new Map<string, number>([...others.map((id) => [id, modelX.get(id)!] as const)]);
        at.set(stairToken, stairX);
        if (corridor) at.set(input.corridorId, corridorX ?? stairX + (stairRight ? -0.01 : 0.01));
        return [...at.keys()].sort((a, b) => at.get(a)! - at.get(b)!);
      }
      // Hành lang nằm sát ô thang, phía các phòng.
      const corr = corridor ? [input.corridorId] : [];
      return stairRight ? [...others, ...corr, stairToken] : [stairToken, ...corr, ...others];
    });
    if (corridor) {
      const band = bands.find((ids) => ids.includes(stairToken));
      if (!band) return null;
      const members = band.map((id) => {
        if (id === input.corridorId)
          return { id, side: input.corridorClearCm + input.wallCm, w: 0, area: 0 };
        return cells.find((c) => c.id === id)!;
      });
      if (!Number.isFinite(bandMinDepth(members, input.widthCm, input.wallCm, STEP, input.depthCm)))
        return null;
    }
    return {
      bands,
      storey: {
        level: storey.level,
        bands: bands.map((ids) => ({
          depth: 0,
          cells: ids.map((id) =>
            id === stairToken && stairStack
              ? { id: '', w: 0, stack: stairStack }
              : units.get(id)
                ? { id: '', w: 0, stack: units.get(id)! }
                : {
                    id,
                    w: id === input.corridorId ? input.corridorClearCm * 10 : 0,
                    stack: [],
                  },
          ),
        })),
      },
    };
  }
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i]!, ...tail];
  }
}
