/**
 * Nới phòng hẹp hơn mức nghề (T113, `arrange/room-widen.ts`) — mô hình vẽ WC một ô lưới (~0,95 m lọt lòng), dưới
 * mức kinh nghiệm 1,25 m; bộ xếp lấy phần thiếu từ cụm kề còn dư bề ngang.
 */

import { describe, expect, it } from 'vitest';
import { chain, leaf, leaves, type Placed } from '../ai/arrange/placed';
import { widenRooms } from '../ai/arrange/room-widen';

const MIN: Record<string, number> = { wc: 136, bedroom: 281, stair: 0 };
const typeOf = (id: string) => id.replace(/_\d+$/, '');
const input = (fixed: string[] = []) => ({
  minCentre: (id: string) => MIN[typeOf(id)] ?? null,
  isFixed: (id: string) => fixed.includes(id),
});
const rectOf = (placed: Placed, id: string) => leaves(placed).find((cell) => cell.id === id)!.rect;

/** Dãy theo trục x, cao 300: các ô rộng `widths`. */
function row(cells: [string, number][]): Placed {
  let x = 0;
  const parts = cells.map(([id, w]) => {
    const part = leaf(id, { x0: x, y0: 0, x1: x + w, y1: 300 });
    x += w;
    return part;
  });
  return chain({ x0: 0, y0: 0, x1: x, y1: 300 }, 'x', parts);
}

describe('widenRooms', () => {
  it('WC 95 cm cạnh phòng ngủ 400 cm → WC 140 cm, phòng ngủ còn 355 cm', () => {
    const { placed, widened } = widenRooms(
      row([
        ['wc_1', 95],
        ['bedroom_1', 400],
      ]),
      input(),
    );
    expect(widened).toEqual([{ id: 'wc_1', from: 95, to: 140 }]);
    expect(rectOf(placed, 'wc_1')).toMatchObject({ x0: 0, x1: 140 });
    expect(rectOf(placed, 'bedroom_1')).toMatchObject({ x0: 140, x1: 495 });
  });

  it('không lấy của ô cố định (thang) — lấy sang phía bên kia', () => {
    const { placed } = widenRooms(
      row([
        ['stair_1', 300],
        ['wc_1', 95],
        ['bedroom_1', 400],
      ]),
      input(['stair_1']),
    );
    expect(rectOf(placed, 'stair_1')).toMatchObject({ x0: 0, x1: 300 });
    expect(rectOf(placed, 'wc_1')).toMatchObject({ x0: 300, x1: 440 });
  });

  it('không làm phòng kề hẹp dưới mức của nó — không nới được thì giữ nguyên', () => {
    const { placed, widened } = widenRooms(
      row([
        ['wc_1', 95],
        ['bedroom_1', 300],
      ]),
      input(),
    );
    expect(widened).toEqual([]);
    expect(rectOf(placed, 'wc_1')).toMatchObject({ x0: 0, x1: 95 });
  });

  it('chỉ nới theo bề HẸP — WC dài theo trục chuỗi thì không đụng', () => {
    // Dãy theo trục x, WC rộng 400 > cao 300: bề hẹp của nó chạy theo trục kia, nới theo x không làm nó rộng ra.
    const { widened } = widenRooms(
      row([
        ['wc_1', 400],
        ['bedroom_1', 400],
      ]),
      input(),
    );
    expect(widened).toEqual([]);
  });
});
