/**
 * Kiểm lối vào NGAY TRÊN DẢI, chưa cần toạ độ (handoff sửa lỗi đợt 2 mục 1.1). Lượt thật 41ffe1e5: phòng ngủ mặt tiền tầng
 * 2–3 nằm trước ô [WC / hành lang] — hành lang đứng SAU WC trong ô xếp chồng nên không chạm phòng ngủ, phòng không có lối
 * vào. Lỗi ấy bị lỗi chiều sâu che suốt bốn vòng: bộ giải hỏng thì cổng không chạy.
 *
 * Đồ thị kề suy từ dải:
 *  - hai ô liền nhau trong một dải kề nhau (mọi phần của ô xếp chồng đều kề ô bên cạnh);
 *  - các phần của ô xếp chồng kề nhau theo thứ tự; chỉ phần ĐẦU chạm dải phía trước, phần CUỐI chạm dải phía sau;
 *  - ô ở hai dải liền nhau kề nhau khi khoảng ngang chồng lên nhau — khoảng ngang ước theo thứ tự và bề rộng gợi ý (ô có
 *    `w` lấy `w`, ô thang lấy bề ngang ô thang, phần còn lại chia đều nhưng không dưới cạnh tối thiểu).
 *
 * Đi được: tầng 1 từ phòng lối vào (và gara), tầng trên từ ô thang. Từ một phòng đi xuyên được (hành lang, khách, ăn,
 * bếp…) vào được mọi phòng kề nó; ô thang chỉ mở sang loại `stairOpensTo`; phòng khép kín vào từ phòng mẹ. Phòng không
 * đi tới được là lỗi.
 *
 * Ước lượng — chỉ dùng khi bộ giải / bước dựng bố cục HỎNG (cổng không chạy); dựng được thì cổng là nơi kiểm thật.
 * Khoảng ngang chồng chỉ cần > 0 (cố ý dễ dãi: thà sót còn hơn bác oan).
 */
import type { AiHouseBands } from '@nvg/shared/design';
import { OPEN_CELL } from './solve';

export interface BandAccessInput {
  storeys: AiHouseBands['storeys'];
  widthCm: number;
  stairToken: string;
  stairWidthCm: number;
  typeOf: (id: string) => string | null;
  minSideCm: (type: string) => number;
  through: ReadonlySet<string>;
  stairOpensTo: ReadonlySet<string> | null;
  parentOf: (id: string) => string | null;
  /** `passage.served_from`: loại X mở được cửa từ các loại liệt kê dù loại ấy không đi xuyên được (giặt ← sân thượng). */
  servedFrom: ReadonlyMap<string, ReadonlySet<string>> | null;
  noDoor: ReadonlySet<string>;
  entryRooms: readonly string[];
}

export interface BandAccessIssue {
  level: string;
  room: string;
  /** Các ô phòng ấy chạm — để câu nhắc nói được nó đang kẹt giữa những gì. */
  neighbours: string[];
}

export function bandAccessIssues(input: BandAccessInput): BandAccessIssue[] {
  const issues: BandAccessIssue[] = [];
  for (const storey of input.storeys) {
    if (storey.level === 'roof') continue;
    const level = storey.level;
    const ids = (id: string) => (id === input.stairToken ? `${input.stairToken}@${level}` : id);
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!a || !b || a === b || a === OPEN_CELL || b === OPEN_CELL) return;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };
    // Khoảng ngang từng ô của từng dải.
    const spans = storey.bands.map((band) => {
      const fixed = band.cells.map((cell) => {
        const parts = cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id];
        if (parts.includes(input.stairToken)) return input.stairWidthCm;
        return cell.w > 0 ? Math.round(cell.w / 10) : 0;
      });
      const floorOf = (i: number) => {
        const cell = band.cells[i]!;
        const parts = cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id];
        return Math.max(
          0,
          ...parts
            .filter((id) => id && id !== OPEN_CELL)
            .map((id) => input.minSideCm(input.typeOf(id) ?? '')),
        );
      };
      const free = band.cells.map((_, i) => i).filter((i) => fixed[i] === 0);
      const rest = input.widthCm - fixed.reduce((sum, v) => sum + v, 0);
      const share = free.length ? rest / free.length : 0;
      const widths = fixed.map((v, i) => (v > 0 ? v : Math.max(share, floorOf(i))));
      // Dải không có ô tự do mà các ô cố định chưa kín bề ngang: bộ giải nới ô — phần dư cho ô cuối không phải thang.
      const gap = input.widthCm - widths.reduce((sum, v) => sum + v, 0);
      if (!free.length && gap > 0) {
        const at = [...band.cells.keys()].reverse().find((i) => {
          const cell = band.cells[i]!;
          return !(cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id]).includes(
            input.stairToken,
          );
        });
        if (at !== undefined) widths[at] = widths[at]! + gap;
      }
      let x = 0;
      return widths.map((w) => {
        const span = { x0: x, x1: x + w };
        x += w;
        return span;
      });
    });
    storey.bands.forEach((band, b) => {
      const partsOf = (c: number) => {
        const cell = band.cells[c]!;
        return (cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id]).map(ids);
      };
      band.cells.forEach((_, c) => {
        const parts = partsOf(c);
        for (let i = 1; i < parts.length; i += 1) link(parts[i - 1]!, parts[i]!);
        if (c > 0) for (const a of partsOf(c - 1)) for (const p of parts) link(a, p);
      });
      if (b === 0) return;
      const prev = storey.bands[b - 1]!;
      prev.cells.forEach((cellPrev, cp) => {
        const back = (cellPrev.stack.length ? cellPrev.stack.map((s) => s.id) : [cellPrev.id]).map(
          ids,
        );
        const last = back[back.length - 1]!;
        band.cells.forEach((_, c) => {
          const s = spans[b - 1]![cp]!;
          const t = spans[b]![c]!;
          if (Math.min(s.x1, t.x1) - Math.max(s.x0, t.x0) <= 0) return;
          link(last, partsOf(c)[0]!);
        });
      });
    });
    // Đi từ lối vào / ô thang.
    const stairId = ids(input.stairToken);
    const starts =
      level === '1'
        ? input.entryRooms.filter((id) => adj.has(id))
        : adj.has(stairId)
          ? [stairId]
          : [];
    if (!starts.length) continue;
    const typeOf = (id: string) => (id === stairId ? 'stair' : (input.typeOf(id) ?? ''));
    const reached = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
      const from = queue.shift()!;
      const fromType = typeOf(from);
      const opens = from === stairId || starts.includes(from) || input.through.has(fromType);
      for (const to of adj.get(from) ?? []) {
        if (reached.has(to)) continue;
        const toType = typeOf(to);
        const ok =
          to === stairId
            ? input.through.has(fromType) &&
              (!input.stairOpensTo || input.stairOpensTo.has(fromType))
            : from === stairId
              ? !input.stairOpensTo || input.stairOpensTo.has(toType)
              : opens ||
                input.parentOf(to) === from ||
                !!input.servedFrom?.get(toType)?.has(fromType);
        if (!ok) continue;
        reached.add(to);
        queue.push(to);
      }
    }
    for (const id of adj.keys()) {
      if (reached.has(id) || id === stairId) continue;
      if (input.noDoor.has(typeOf(id))) continue;
      issues.push({
        level,
        room: id,
        neighbours: [...(adj.get(id) ?? [])].map((n) => (n === stairId ? input.stairToken : n)),
      });
    }
  }
  return issues;
}
