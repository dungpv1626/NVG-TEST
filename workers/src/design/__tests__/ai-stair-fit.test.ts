/**
 * `ai/tree/stair-fit.ts` — ô thang đủ dài cho số bậc (Q-45d, 15/09/2026).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stairFlights, stairRunNeedCm, stairShortfall, stairTreads } from '../ai/tree/stair-fit';
import { parseConstructionNorms } from '../kb/construction';

const norms = parseConstructionNorms(
  readFileSync(
    fileURLToPath(new URL('../../../../kb/construction_norms.yaml', import.meta.url)),
    'utf8',
  ),
);

describe('thang dựng từ tham số', () => {
  it('số bậc và số vế suy từ cao tầng và bề ngang ô thang', () => {
    expect(stairTreads(norms, 360)).toBe(21);
    expect(stairFlights(norms, 159)).toBe(1);
    expect(stairFlights(norms, 160)).toBe(2);
  });

  it('một vế: (bậc − 1) × bề sâu bậc; hai vế: nửa số bậc mỗi vế + chiếu nghỉ bằng vế hẹp nhất', () => {
    const going = norms.stairs.going_m! * 100;
    const narrowest = (norms.stairs.two_flights_min_width_m * 100) / 2;
    expect(stairRunNeedCm(norms, { flights: 1, treads: 21, acrossCm: 120 })).toBe(
      Math.ceil(20 * going),
    );
    // Ô rộng 2,4 m: vế hẹp nhất 0,8 m đủ làm chiếu nghỉ, không đòi 1,2 m.
    expect(stairRunNeedCm(norms, { flights: 2, treads: 21, acrossCm: 240 })).toBe(
      Math.ceil(10 * going + narrowest),
    );
  });

  it('đo dọc chiều đi lên, không dọc cạnh dài', () => {
    const need = stairRunNeedCm(norms, { flights: 2, treads: 21, acrossCm: 250 })!;
    // Ô 2,5 × 5 m: đi lên dọc 5 m thì đủ; đi lên dọc 2,5 m (bề ngang 5 m) thì thiếu.
    expect(
      stairShortfall(norms, { rect: [0, 0, 250, 500], up: '+y', flights: 2, treads: 21 }),
    ).toBe(null);
    expect(need).toBeLessThanOrEqual(500);
    expect(
      stairShortfall(norms, { rect: [0, 0, 500, 250], up: '+y', flights: 2, treads: 21 }),
    ).toEqual({ needCm: expect.any(Number), haveCm: 250 });
  });

  it('sát ngưỡng thì đạt — đúng bằng chiều dài cần', () => {
    const need = stairRunNeedCm(norms, { flights: 1, treads: 21, acrossCm: 120 })!;
    expect(
      stairShortfall(norms, { rect: [0, 0, 120, need], up: '-y', flights: 1, treads: 21 }),
    ).toBe(null);
    expect(
      stairShortfall(norms, { rect: [0, 0, 120, need - 1], up: '-y', flights: 1, treads: 21 }),
    ).not.toBe(null);
  });

  it('quy cách không có bề sâu bậc thì không kiểm', () => {
    const bare = { ...norms, stairs: { riser_m: 0.17, two_flights_min_width_m: 1.6 } };
    expect(stairShortfall(bare, { rect: [0, 0, 100, 100], up: '+y', flights: 1, treads: 21 })).toBe(
      null,
    );
  });
});
