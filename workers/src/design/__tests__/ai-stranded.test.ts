/**
 * Phòng phụ nhỏ kẹt trên bản phác — chương trình nhập vào phòng kề (T153, `ai/stranded.ts`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { absorbStranded, type StrandedRules } from '../ai/stranded';

const rules = (over: Partial<StrandedRules> = {}): StrandedRules => ({
  types: new Set(['storage', 'closet']),
  maxAreaM2: 4,
  through: new Set(['circulation', 'living', 'dining', 'kitchen', 'stair']),
  servedFrom: new Map([['storage', new Set(['kitchen'])]]),
  noHost: new Set(['stair', 'garage']),
  required: () => false,
  label: (type) => ({ storage: 'Kho', wc: 'WC', light_well: 'Giếng trời' })[type] ?? type,
  ...over,
});

const intent = (rows: string[], rooms: Array<[string, string, number]>): HouseIntent =>
  ({
    variant_label: 'thử',
    rationale: '',
    rooms: rooms.map(([id, type, area]) => ({
      id,
      type,
      level: 1,
      target_area_m2: area,
      ensuite_of: null,
    })),
    relationships: [{ a: 'sg', b: 'wc', kind: 'adjacent' }],
    sketches: [{ level: 1, rows }],
    entry_room: 'lv',
    garage_room: null,
  }) as unknown as HouseIntent;

const ROOMS: Array<[string, string, number]> = [
  ['lv', 'living', 16],
  ['st', 'stair', 8],
  ['wc', 'wc', 3],
  ['lw', 'light_well', 2],
  ['sg', 'storage', 2],
];

describe('nhập phòng phụ kẹt', () => {
  it('kho chỉ giáp WC và giếng trời: nhập vào phòng chung nhiều cạnh nhất (WC), bỏ khỏi danh mục và quan hệ', () => {
    const out = absorbStranded(intent(['lv lv lv', 'st wc wc', 'lw wc sg'], ROOMS), rules());
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]!.host).toBe('wc');
    expect(out.intent.sketches![0]!.rows).toEqual(['lv lv lv', 'st wc wc', 'lw wc wc']);
    expect(out.intent.rooms.map((r) => r.id)).not.toContain('sg');
    expect(out.intent.relationships).toEqual([]);
    // Phòng nhận ô mang thêm diện tích mục tiêu.
    expect(out.intent.rooms.find((r) => r.id === 'wc')!.target_area_m2).toBe(5);
  });

  it('kho giáp lối đi thì giữ nguyên', () => {
    const out = absorbStranded(intent(['lv lv sg', 'st st wc'], ROOMS), rules());
    expect(out.notes).toEqual([]);
  });

  it('kho đầu bài yêu cầu ở tầng ấy thì giữ — đó là lời gia chủ, vẫn báo về mô hình', () => {
    const out = absorbStranded(
      intent(['lv lv lv', 'st st wc', 'lw sg sg'], ROOMS),
      rules({ required: (type, level) => type === 'storage' && level === 1 }),
    );
    expect(out.notes).toEqual([]);
  });

  it('không nhập vào ô thang hay gara; không còn phòng nhận thì giữ', () => {
    const out = absorbStranded(
      intent(['lv lv lv', 'wc wc wc', 'st st sg'], ROOMS),
      rules({ noHost: new Set(['stair', 'wc']) }),
    );
    expect(out.notes).toEqual([]);
  });

  it('kho lớn hơn ngưỡng kb thì không nhập', () => {
    const big = ROOMS.map(([id, type, area]): [string, string, number] =>
      id === 'sg' ? [id, type, 6] : [id, type, area],
    );
    const out = absorbStranded(intent(['lv lv lv', 'st st wc', 'lw sg sg'], big), rules());
    expect(out.notes).toEqual([]);
  });
});
