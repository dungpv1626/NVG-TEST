/**
 * Mặt bằng mái (Haan chốt 04/10/2026: «luôn vẽ tầng mái»). Đo trên phương án ĐÃ LƯU của lượt thật 182665ea —
 * biệt thự Hưng Yên: cục nóng ở sân thượng, bồn trên mái, năng lượng mặt trời, phơi cả hai cách, không ban công
 * phơi riêng → đủ bốn khu.
 */
import { describe, expect, it } from 'vitest';
import { aiFloorPlanSchema, type AiFloorPlan } from '@nvg/shared/design';
import { renderPlanDxf } from '../ai/dxf/plan-dxf';
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { toRect } from '../ai/draw/geometry';
import { buildRoof } from '../ai/roof';
import { parseRoofPlan, requiredRoofZones, roofConditionHolds } from '../kb/roof-plan';
import { loadRun, read } from './ai-real-context';
import { parseVocabulary } from '../kb/vocabulary';
import { parseLayerExport } from '../ai/dxf/layers';

const spec = parseRoofPlan(read('kb/roof_plan.yaml'));
const saved = JSON.parse(read('workers/src/design/__tests__/fixtures/ai-plan-182665ea.json')) as {
  plan: AiFloorPlan;
};
const run = loadRun('182665ea');
const OUTDOOR = new Set(['balcony', 'terrace', 'porch', 'courtyard']);
const WET = new Set(['wc', 'laundry', 'kitchen']);

const area = (r: number[]) => (r[2]! - r[0]!) * (r[3]! - r[1]!);
const overlap = (a: number[], b: number[]) =>
  Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!)) *
  Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));

describe('kb/roof_plan.yaml', () => {
  it('đầu bài Hưng Yên đòi đủ bốn khu', () => {
    expect(requiredRoofZones(spec, run.digest)).toEqual([
      'terrace',
      'ac_yard',
      'tank_solar',
      'drying_yard',
    ]);
  });

  it('câu CHƯA trả lời không khớp — kể cả `equals: false`', () => {
    expect(roofConditionHolds({}, { path: 'balconies.drying_balcony', equals: false })).toBe(false);
    expect(
      roofConditionHolds(
        { balconies: { drying_balcony: false } },
        { path: 'balconies.drying_balcony', equals: false },
      ),
    ).toBe(true);
  });
});

describe('buildRoof trên phương án đã lưu 182665ea', () => {
  const top = saved.plan.levels.at(-1)!;
  const roof = buildRoof({
    top,
    spec,
    required: requiredRoofZones(spec, run.digest),
    modelRooms: [],
    origin: { x: 0, y: 0 },
    outdoor: OUTDOOR,
    wet: WET,
  });

  it('tum trùm đúng ô thang tầng trên cùng, cộng chiếu tới; cửa tum quay ra phía mái rộng nhất', () => {
    expect(roof.level).toBe(top.level + 1);
    expect(roof.stair_head).not.toBeNull();
    // Tầng trên cùng chỉ có «vế tới»: ô thang là phòng loại `stair`, nới nửa bề dày vách ra tim tường.
    const stairRoom = top.rooms.find((room) => room.type === 'stair')!.rect;
    const stair = roof.stair_head!.stair;
    expect(overlap(stair, stairRoom)).toBe(area(stairRoom));
    expect(area(stair) - area(stairRoom)).toBeLessThan(area(stairRoom) * 0.1);
    const head = roof.stair_head!.rect;
    expect(area(head)).toBeGreaterThan(area(stair));
  });

  it('chương trình tự đặt đủ bốn khu, không chồng nhau, không đè tum, nằm trên phòng KHÔNG ngoài trời', () => {
    expect(roof.zones.map((zone) => zone.type).sort()).toEqual(
      ['ac_yard', 'drying_yard', 'tank_solar', 'terrace'].sort(),
    );
    expect(roof.zones.every((zone) => zone.placed_by === 'program')).toBe(true);
    const balconies = top.rooms.filter((room) => OUTDOOR.has(room.type)).map((room) => room.rect);
    const xs = top.outline.map((p) => p[0]!);
    const ys = top.outline.map((p) => p[1]!);
    for (const zone of roof.zones) {
      expect(overlap(zone.rect, roof.stair_head!.rect), zone.id).toBe(0);
      for (const balcony of balconies) expect(overlap(zone.rect, balcony), zone.id).toBe(0);
      expect(zone.rect[0]).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(zone.rect[2]).toBeLessThanOrEqual(Math.max(...xs));
      expect(zone.rect[1]).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(zone.rect[3]).toBeLessThanOrEqual(Math.max(...ys));
      for (const other of roof.zones)
        if (other !== zone)
          expect(overlap(zone.rect, other.rect), `${zone.id}/${other.id}`).toBe(0);
    }
  });

  it('bồn nước + năng lượng mặt trời đè lên khu ướt tầng dưới; sân thượng chạm trước cửa tum', () => {
    const tank = roof.zones.find((zone) => zone.type === 'tank_solar')!;
    const wet = top.rooms.filter((room) => WET.has(room.type)).map((room) => room.rect);
    expect(wet.reduce((sum, rect) => sum + overlap(tank.rect, rect), 0)).toBeGreaterThan(0);
    const terrace = toRect(roof.zones.find((zone) => zone.type === 'terrace')!.rect);
    const head = toRect(roof.stair_head!.rect);
    const touches =
      terrace.x0 === head.x1 ||
      terrace.x1 === head.x0 ||
      terrace.y0 === head.y1 ||
      terrace.y1 === head.y0;
    expect(touches).toBe(true);
  });

  it('khu mô hình vẽ được giữ, cắt gọn vào sàn mái; khu mô hình vẽ ra ngoài thì chương trình đặt lại', () => {
    const tankRect = roof.zones.find((zone) => zone.type === 'tank_solar')!.rect;
    const withModel = buildRoof({
      top,
      spec,
      required: ['terrace', 'tank_solar'],
      modelRooms: [
        {
          id: 'tank_1',
          type: 'tank_solar',
          level: 3,
          target_area_m2: 1,
          ensuite_of: null,
          rect: [tankRect[0]! * 10, tankRect[1]! * 10, 2000, 2000],
        },
        {
          id: 'ac_far',
          type: 'ac_yard',
          level: 3,
          target_area_m2: 1,
          ensuite_of: null,
          rect: [90_000, 90_000, 2000, 2000],
        },
      ],
      origin: { x: 0, y: 0 },
      outdoor: OUTDOOR,
      wet: WET,
    });
    expect(withModel.zones.find((zone) => zone.type === 'tank_solar')!.placed_by).toBe('model');
    expect(withModel.zones.some((zone) => zone.type === 'ac_yard')).toBe(false);
    expect(withModel.notes?.some((note) => note.includes('Cục nóng điều hoà'))).toBe(true);
  });

  const plan: AiFloorPlan = { ...saved.plan, roof };

  it('artifact có mái qua hợp đồng', () => {
    expect(aiFloorPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('tờ «Mái» vẽ được: tường chắn, tum có cửa, nhãn khu; DXF có thêm mái', () => {
    const style = parseSheetStyle(read('kb/sheet_style.yaml'));
    const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
    const labels = Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi]));
    const sheet = renderPlanSheet(plan, roof.level, { style, labels });
    expect(sheet.svg).toContain('Mặt bằng — Mái');
    expect(sheet.svg).toContain('TUM THANG');
    expect(sheet.svg).toContain('SÂN THƯỢNG');
    expect(sheet.svg).toContain('CỤC NÓNG ĐIỀU HOÀ');
    const layers = parseLayerExport(read('kb/layer_mapping.yaml'));
    const withRoof = renderPlanDxf(plan, { style, labels, layers });
    const without = renderPlanDxf(saved.plan, { style, labels, layers });
    expect(withRoof.dxf.length).toBeGreaterThan(without.dxf.length);
  });
});
