/**
 * Lưới trục — SUY từ tim tường của phương án, dùng chung cho tờ mặt bằng và tờ mặt đứng (T147).
 *
 * Hồ sơ NVG ghi trục trên mọi tờ: tờ KT07 của M5 «mặt đứng trục 1-4», tờ KT08 «trục A-C», và chuỗi
 * kích thước trục «110 / 4500 / 2720 / 4500 / 2510». Mặt bằng của nhánh AI không có cột, nên trục lấy
 * từ tường: hai tường bao luôn là trục, tường trong chỉ thành trục khi đủ dài để là một đường kết cấu
 * (`kb/facade_detail.yaml` mục `axes`). Một hàm cho cả hai tờ — hai hàm thì sớm muộn trục 2 của mặt
 * bằng sẽ là trục 3 của mặt đứng.
 *
 * Trục dọc (x không đổi) đánh số 1, 2, 3… từ trái sang phải; trục ngang (y không đổi) đánh chữ từ mặt
 * tiền (y nhỏ nhất) vào sâu.
 */

import type { AiFloorPlan } from '@nvg/shared/design';
import type { FacadeDetail } from '../../kb/facade-detail';
import { CLS, tag, textEl } from './svg';

export interface GridAxis {
  label: string;
  /** Toạ độ tim trục, cm. */
  at: number;
}

export interface GridAxes {
  /** Trục dọc — cắt mặt tiền, đánh số. */
  x: GridAxis[];
  /** Trục ngang — chạy song song mặt tiền, đánh chữ. */
  y: GridAxis[];
}

/** Sai lệch cho phép khi hỏi «bức tường này có thẳng theo trục không», cm. */
const STRAIGHT_TOLERANCE_CM = 1;

interface Candidate {
  at: number;
  /** Tỷ lệ chiều dài tường trên đường này so với bề sâu tầng, lấy tầng lớn nhất. */
  share: number;
  exterior: boolean;
}

function candidates(plan: AiFloorPlan, axis: 'x' | 'y'): Candidate[] {
  const along = axis === 'x' ? 0 : 1; // toạ độ không đổi dọc tường
  const across = 1 - along;
  const byAt = new Map<number, Candidate>();
  for (const level of plan.levels) {
    const span =
      Math.max(...level.outline.map((p) => p[across] ?? 0)) -
      Math.min(...level.outline.map((p) => p[across] ?? 0));
    if (!(span > 0)) continue;
    const sums = new Map<number, { at: number; length: number; exterior: boolean }>();
    for (const wall of level.walls) {
      if (wall.k === 'r') continue;
      const a = wall.a[along] ?? 0;
      const b = wall.b[along] ?? 0;
      if (Math.abs(a - b) > STRAIGHT_TOLERANCE_CM) continue;
      // Gom theo cm nguyên nhưng GIỮ toạ độ tim thật (483,5 chứ không 484): chuỗi trục phải cộng
      // khớp với chuỗi chi tiết đo từ cùng bức tường.
      const exact = (a + b) / 2;
      const key = Math.round(exact);
      const length = Math.abs((wall.b[across] ?? 0) - (wall.a[across] ?? 0));
      const entry = sums.get(key) ?? { at: exact, length: 0, exterior: false };
      entry.length += length;
      entry.exterior ||= wall.k === 'e';
      sums.set(key, entry);
    }
    for (const { at, length, exterior } of sums.values()) {
      const key = Math.round(at);
      const prev = byAt.get(key);
      const share = length / span;
      byAt.set(key, {
        at: prev?.at ?? at,
        share: Math.max(prev?.share ?? 0, share),
        exterior: (prev?.exterior ?? false) || exterior,
      });
    }
  }
  return [...byAt.values()].sort((p, q) => p.at - q.at);
}

/** Một phương: giữ hai mép, giữ trục trong đủ dài, gộp trục sát nhau (giữ trục dài hơn). */
function pick(list: Candidate[], detail: FacadeDetail): number[] {
  const outer = list.filter((c) => c.exterior);
  if (outer.length === 0) return [];
  const min = outer[0]!.at;
  const max = outer[outer.length - 1]!.at;
  const kept = list.filter(
    (c) =>
      c.at === min ||
      c.at === max ||
      (c.at > min && c.at < max && c.share >= detail.axes.minSpanShare),
  );
  const out: Candidate[] = [];
  for (const c of kept) {
    const last = out[out.length - 1];
    if (!last || c.at - last.at >= detail.axes.mergeCm) {
      out.push(c);
      continue;
    }
    // Hai mép không bao giờ nhường chỗ cho trục trong.
    const lastPinned = last.at === min || last.at === max;
    const pinned = c.at === min || c.at === max;
    if (pinned && !lastPinned) out[out.length - 1] = c;
    else if (!pinned && !lastPinned && c.share > last.share) out[out.length - 1] = c;
  }
  return out.map((c) => c.at);
}

export function deriveAxes(plan: AiFloorPlan, detail: FacadeDetail): GridAxes {
  const xs = pick(candidates(plan, 'x'), detail);
  const ys = pick(candidates(plan, 'y'), detail);
  const letters = detail.axes.letters;
  return {
    x: xs.map((at, i) => ({ label: String(i + 1), at })),
    y: ys.map((at, i) => ({
      label: letters[i] ?? `${letters[letters.length - 1] ?? 'Z'}${i - letters.length + 2}`,
      at,
    })),
  };
}

/** Bóng trục: vòng tròn và tên trục ở tâm `(cx, cy)`, mm giấy. */
export function renderAxisBubble(
  cx: number,
  cy: number,
  label: string,
  detail: FacadeDetail,
): string {
  return [
    tag('circle', { cx, cy, r: detail.annotation.bubbleD / 2, class: CLS.axisBubble }),
    textEl(label, { x: cx, y: cy, class: CLS.textAxis }),
  ].join('');
}

/** Bề dày dải dành cho bóng trục bên ngoài hàng kích thước, mm giấy. */
export function bubbleBandMm(detail: FacadeDetail): number {
  return detail.annotation.bubbleGap + detail.annotation.bubbleD;
}
