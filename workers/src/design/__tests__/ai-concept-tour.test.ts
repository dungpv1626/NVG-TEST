/**
 * Trang khách «đi xem nhà theo tầng» (link gửi khách B5, «Cách 1» 31/10/2026) — phần thuần `concept-tour.ts`.
 *
 * Canh: câu tóm tắt tầng ghép từ đầu bài theo câu mẫu ở kb (không tên người, không số đo); khối sơ đồ nối đúng ảnh
 * nội thất qua thứ tự phòng trong đầu bài; tầng nào không vừa lô thì không trả sơ đồ nào, ảnh vẫn theo tầng.
 */

import { describe, expect, it } from 'vitest';
import type { AiBriefDigest } from '@nvg/shared/design';
import { conceptZoning } from '../ai/concept-zoning';
import {
  buildConceptTour,
  floorSummary,
  orderPerspectives,
  parseRoomKey,
} from '../ai/concept-tour';
import { planContext } from '../ai/plan';
import { parseConceptZoning } from '../kb/concept-zoning';
import { loadRun, read, realContextInput } from './ai-real-context';

const table = parseConceptZoning(read('kb/concept_zoning.yaml'));
const tour = table.tour!;
const AT01 = loadRun('7fe3cf7b').digest; // nhà ống 4 × 15 m — tầng 1 không vừa
const VILLA = loadRun('46d6eff3').digest; // biệt thự 15 × 20 m — vừa

function zoningOf(digest: AiBriefDigest) {
  const input = realContextInput(digest, {
    stairShape: true,
    houseProfile: true,
    openSetback: true,
  });
  return {
    labels: input.labels,
    zoning: conceptZoning({
      table,
      knowledge: planContext(input).knowledge,
      construction: input.construction,
      digest,
      labels: input.labels,
      ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
    }),
  };
}

const LABELS: Record<string, string> = {
  bedroom: 'Phòng ngủ',
  master_bedroom: 'Phòng ngủ chính',
  study: 'Phòng làm việc',
  wc: 'WC',
  stair: 'Thang bộ',
  balcony: 'Ban công',
  garage: 'Để xe',
  living: 'Phòng khách',
};

type Family = AiBriefDigest['family'];
type Spaces = AiBriefDigest['required_spaces'];

describe('câu tóm tắt từng tầng', () => {
  it('tầng ông bà: «dành cho ông bà», phòng ngủ có WC riêng, bỏ ô thang', () => {
    const digest = {
      family: [{ role: 'ong_ba', count: 2, floor: 2 }] as Family,
      required_spaces: [
        { type: 'bedroom', floor: 2, ensuite: true },
        { type: 'study', floor: 2, area_m2: 10 },
        { type: 'stair', floor: 2 },
      ] as Spaces,
    };
    expect(floorSummary(digest, 2, tour, LABELS)).toBe(
      'Tầng 2 dành cho ông bà: phòng ngủ có WC riêng, phòng làm việc.',
    );
  });

  it('tầng vợ chồng và con: gộp vai, đếm phòng trùng, kèm ban công', () => {
    const digest = {
      family: [
        { role: 'vo_chong', count: 2, floor: 3 },
        { role: 'con', count: 1, floor: 3 },
        { role: 'con', count: 1, floor: 3 },
        { role: 'con', count: 1, floor: 4 },
      ] as Family,
      required_spaces: [
        { type: 'master_bedroom', floor: 3, ensuite: true },
        { type: 'bedroom', floor: 3 },
        { type: 'bedroom', floor: 3 },
        { type: 'balcony', floor: 3 },
        { type: 'bedroom', floor: 4 },
      ] as Spaces,
    };
    expect(floorSummary(digest, 3, tour, LABELS)).toBe(
      'Tầng 3 dành cho vợ chồng gia chủ và các con: phòng ngủ chính có WC riêng, 2 phòng ngủ, ban công.',
    );
  });

  it('không ai ghim tầng: chỉ kể phòng; để xe chưa ghim tầng vẫn vào tầng 1', () => {
    const digest = {
      family: [] as Family,
      required_spaces: [
        { type: 'garage' },
        { type: 'living', floor: 1 },
        { type: 'wc', floor: 1 },
      ] as Spaces,
    };
    expect(floorSummary(digest, 1, tour, LABELS)).toBe('Tầng 1: chỗ để xe, phòng khách, WC.');
    expect(floorSummary(digest, 2, tour, LABELS)).toBeNull();
  });

  it('câu mẫu là dữ liệu: đổi ở kb thì câu đổi theo', () => {
    const changed = parseConceptZoning(
      read('kb/concept_zoning.yaml').replace(
        "rooms_only: 'Tầng {floor}: {rooms}.'",
        "rooms_only: 'Ở tầng {floor} có {rooms}.'",
      ),
    ).tour!;
    const digest = {
      family: [] as Family,
      required_spaces: [{ type: 'living', floor: 1 }] as Spaces,
    };
    expect(floorSummary(digest, 1, changed, LABELS)).toBe('Ở tầng 1 có phòng khách.');
  });

  it('câu mẫu thiếu chỗ trống thì không đọc bảng', () => {
    expect(() =>
      parseConceptZoning(
        read('kb/concept_zoning.yaml').replace(
          "with_residents: 'Tầng {floor} dành cho {who}: {rooms}.'",
          "with_residents: 'Tầng {floor}: {rooms}.'",
        ),
      ),
    ).toThrow(/\{who\}/);
  });
});

describe('khối sơ đồ ↔ ảnh nội thất', () => {
  it('khoá phòng tách đúng loại / tầng / thứ tự', () => {
    expect(parseRoomKey('living:1:1')).toEqual({ type: 'living', floor: 1, index: 1 });
    expect(parseRoomKey('rác')).toBeNull();
  });

  it('biệt thự vừa lô: mỗi ảnh nằm đúng khối chứa dòng đầu bài của nó, không lộ số đo', () => {
    const { zoning, labels } = zoningOf(VILLA);
    const spaces = VILLA.required_spaces ?? [];
    const rooms = spaces
      .map((s, i) => ({ s, i }))
      .filter(
        ({ s }) =>
          typeof s.floor === 'number' &&
          ['living', 'bedroom', 'kitchen', 'master_bedroom'].includes(s.type),
      )
      .map(({ s, i }) => ({
        imageKey: `phong-${i}`,
        roomKey: `${s.type}:${s.floor}:${i}`,
        type: s.type,
      }));
    expect(rooms.length).toBeGreaterThan(2);
    const t = buildConceptTour({ digest: VILLA, zoning, table, labels, rooms });
    expect(t.diagrams).toBe(true);
    for (const room of rooms) {
      const index = Number(room.roomKey.split(':')[2]);
      const floor = Number(room.roomKey.split(':')[1]);
      const tf = t.floors.find((f) => f.level === floor)!;
      const block = tf
        .diagram!.rows.flatMap((r) => r.cells)
        .find((c) => c.images.includes(room.imageKey));
      const zcell = zoning.floors
        .find((f) => f.level === floor)!
        .rows.flatMap((r) => r.cells)
        .find((c) => c.spaces.includes(index));
      expect(block?.label).toBe(zcell?.label);
      expect(tf.images).toContain(room.imageKey);
    }
    // Ảnh của tầng xếp từ mặt đường vào = thứ tự khối trong sơ đồ.
    for (const tf of t.floors) {
      const fromDiagram = tf.diagram!.rows.flatMap((r) => r.cells.flatMap((c) => c.images));
      expect(tf.images.slice(0, fromDiagram.length)).toEqual(fromDiagram);
      for (const row of tf.diagram!.rows) {
        const sum = row.cells.reduce((s, c) => s + c.share, 0) + row.passage;
        expect(sum).toBeGreaterThan(0.98);
        expect(sum).toBeLessThan(1.02);
      }
    }
    // Không cm / m² nào ra trang khách.
    expect(JSON.stringify(t)).not.toMatch(/Cm|M2|depth|width/);
  });

  it('đầu bài không vừa lô (AT01): không trả sơ đồ nào, ảnh vẫn theo tầng và thứ tự đầu bài', () => {
    const { zoning, labels } = zoningOf(AT01);
    expect(zoning.verdict).toBe('over');
    const spaces = AT01.required_spaces ?? [];
    const rooms = spaces
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => typeof s.floor === 'number')
      .map(({ s, i }) => ({
        imageKey: `phong-${i}`,
        roomKey: `${s.type}:${s.floor}:${i}`,
        type: s.type,
      }))
      .reverse();
    const t = buildConceptTour({ digest: AT01, zoning, table, labels, rooms });
    expect(t.diagrams).toBe(false);
    expect(t.floors.every((f) => f.diagram === null)).toBe(true);
    for (const tf of t.floors) {
      const expected = rooms
        .filter((r) => r.roomKey.split(':')[1] === String(tf.level))
        .map((r) => r.imageKey)
        .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
      expect(tf.images).toEqual(expected);
    }
    expect(t.floors[0]!.summary).toMatch(/^Tầng 1/);
  });

  it('phòng chưa ghim tầng vào nhóm «khác»', () => {
    const { zoning, labels } = zoningOf(VILLA);
    const t = buildConceptTour({
      digest: VILLA,
      zoning,
      table,
      labels,
      rooms: [{ imageKey: 'phong-x', roomKey: 'living:0:99', type: 'living' }],
    });
    expect(t.others).toEqual(['phong-x']);
    expect(t.labels['phong-x']).toBe(labels.living);
  });
});

describe('phần bên ngoài', () => {
  it('mặt tiền ngày / tối đứng đầu, rồi theo thứ tự góc ở kb', () => {
    const out = orderPerspectives(
      [{ view: 'aerial' }, { view: 'front_night' }, { view: 'oblique' }, { view: 'front_day' }],
      tour.heroViews,
      ['front_day', 'front_night', 'oblique', 'aerial'],
    );
    expect(out.map((o) => [o.view, o.hero])).toEqual([
      ['front_day', true],
      ['front_night', true],
      ['oblique', false],
      ['aerial', false],
    ]);
  });
});
