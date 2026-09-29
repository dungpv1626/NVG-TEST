/**
 * Bậc tam cấp và mặt bậc thang (T70, Q-51, 23/09/2026).
 *
 * Số liệu đo trên hồ sơ NVG (`doc/design/13-ho-so-thuc-te.md` 13.16.1–13.16.2): mặt bậc thang 250,
 * mặt bậc tam cấp 300, số bậc = chênh cốt ÷ ~150 làm tròn lên (430 → 3, 450 → 3, 730 → 5).
 *
 * Bộ này canh năm điều:
 *  1. Số bậc khớp ba hồ sơ đo được, và số gia chủ khai thắng phép chia.
 *  2. Đầu bài KHÔNG cho số thì không vẽ — «chưa hỏi» không thành một dãy bậc bịa ra.
 *  3. Bậc nằm ngay ngoài cửa chính, không ra ngoài thửa; thiếu sân thì nói ra, không vẽ lấn.
 *  4. Tờ vẽ đánh số bậc đúng thứ tự: tam cấp từ bậc ngoài cùng vào, thang từ chân vế đầu lên.
 *  5. Thang có `going` giữ đúng mặt bậc, phần dư của ô thang vào chiếu nghỉ.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan, AiFloorPlanLevel, DesignBrief } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { briefDemands, type EntryStepsDemand } from '../ai/brief-demands';
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { stairTreadZones } from '../ai/draw/stairs';
import { parseSheetStyle } from '../ai/draw/style';
import { entryStepCount, placeEntrySteps } from '../ai/entry-steps';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { digestOf, TOWNHOUSE } from './ai-digest-fixtures';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const norms = construction.entry_steps!;
const fidelity = parseBriefFidelity(read('kb/brief_fidelity.yaml'));
const style = parseSheetStyle(read('kb/sheet_style.yaml'));

const villa1 = VILLA_PLAN.levels[0]!;
const townhouse1 = TOWNHOUSE_PLAN.levels[0]!;
/** Thửa biệt thự có sân trước sâu 3 m — hình bao nhà bắt đầu ở y = 0. */
const VILLA_LOT = { x0: 0, y0: -300, x1: 1000, y1: 1400 };

const drop = (m: number): EntryStepsDemand => ({ count: null, dropM: m });

function textsOfClass(svg: string, cls: string): string[] {
  return [...svg.matchAll(new RegExp(`<text[^>]*class="${cls}"[^>]*>([^<]*)</text>`, 'g'))].map(
    (m) => m[1] ?? '',
  );
}

describe('số bậc tam cấp', () => {
  it('khớp ba hồ sơ đo được: 430 → 3, 450 → 3, 730 → 5', () => {
    expect(norms.going_m).toBe(0.3);
    expect(entryStepCount(drop(0.43), norms)).toBe(3);
    expect(entryStepCount(drop(0.45), norms)).toBe(3);
    expect(entryStepCount(drop(0.73), norms)).toBe(5);
  });

  it('số bậc gia chủ khai thắng phép chia (nhiều nhà kiêng số bậc)', () => {
    expect(entryStepCount({ count: 5, dropM: 0.45 }, norms)).toBe(5);
  });
});

describe('đầu bài → đòi hỏi bậc tam cấp', () => {
  const demandOf = (entrance: Record<string, unknown> | undefined) =>
    briefDemands(digestOf({ ...TOWNHOUSE, entrance } as DesignBrief), fidelity);

  it('không khai gì thì không có đòi hỏi, không có cảnh báo', () => {
    const d = demandOf(undefined);
    expect(d.entrySteps).toBeNull();
    expect(d.warnings.join(' ')).not.toMatch(/bậc tam cấp/);
  });

  it('khai «không có bậc» là câu trả lời, kể cả khi có chênh cốt', () => {
    expect(demandOf({ steps_from_yard: false, floor_above_road_m: 0.45 }).entrySteps).toBeNull();
  });

  it('khai chênh cốt thì có đòi hỏi, dù chưa trả lời câu «có bậc không»', () => {
    expect(demandOf({ floor_above_road_m: 0.45 }).entrySteps).toEqual({ count: null, dropM: 0.45 });
  });

  it('khai có bậc mà không có số nào thì không bịa — nhắc kiến trúc sư', () => {
    const d = demandOf({ steps_from_yard: true });
    expect(d.entrySteps).toBeNull();
    expect(d.warnings.join(' ')).toMatch(/chưa vẽ bậc/);
  });
});

describe('đặt bậc tam cấp ngoài cửa chính', () => {
  const place = (over: Partial<Parameters<typeof placeEntrySteps>[0]> = {}) =>
    placeEntrySteps({
      level: villa1,
      demand: drop(0.45),
      norms,
      lotCm: VILLA_LOT,
      mainFace: 'front',
      ...over,
    });

  it('ba bậc sâu 90 ngay trước cửa chính, rộng hơn cửa 60, đi xuống ra sân trước', () => {
    const { steps, notes } = place();
    // Cửa chính `d_main` trên tường trước: tim x = 512 + 165/2 = 594,5; mặt ngoài tường ở y = 0.
    expect(steps).toEqual([
      { id: 'es1', rect: [482, -90, 707, 0], down: '-y', risers: 3, going: 30 },
    ]);
    expect(notes.map((n) => n.code)).toEqual(['entry_steps_from_road']);
  });

  it('không có đòi hỏi thì không vẽ và không ghi chú gì', () => {
    expect(place({ demand: null })).toEqual({ steps: [], notes: [] });
  });

  it('sân trước không đủ sâu thì không vẽ lấn ra ngoài thửa — nói ra', () => {
    const { steps, notes } = place({ lotCm: { ...VILLA_LOT, y0: 0 } });
    expect(steps).toEqual([]);
    expect(notes.map((n) => n.code)).toEqual(['entry_steps_no_room']);
  });

  it('chênh cốt quá trần một dãy bậc thì không vẽ', () => {
    const { steps, notes } = place({ demand: drop(1.5) });
    expect(steps).toEqual([]);
    expect(notes[0]?.message).toMatch(/10 bậc/);
  });

  it('chỉ có cửa để xe mở ra ngoài thì không đặt bậc vào cửa gara', () => {
    const { steps, notes } = place({ level: townhouse1, lotCm: null });
    expect(steps).toEqual([]);
    expect(notes.map((n) => n.code)).toEqual(['entry_steps_no_door']);
  });

  it('cửa sát ranh bên thì trượt dãy bậc vào trong thửa', () => {
    const { steps } = place({ lotCm: { x0: 560, y0: -300, x1: 1000, y1: 1400 } });
    expect(steps[0]?.rect).toEqual([560, -90, 785, 0]);
  });
});

describe('tờ vẽ — đánh số bậc và giữ mặt bậc', () => {
  const withSteps: AiFloorPlan = {
    ...VILLA_PLAN,
    levels: [
      {
        ...villa1,
        entry_steps: [{ id: 'es1', rect: [482, -90, 707, 0], down: '-y', risers: 3, going: 30 }],
      },
      ...VILLA_PLAN.levels.slice(1),
    ],
  };

  it('bậc tam cấp đánh số 1 ở bậc ngoài cùng, và tờ vẽ không cắt mất phần chìa ra', () => {
    const svg = renderPlanSheet(withSteps, 1, { style, labels: {} }).svg;
    const numbers = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" class="tsn">(\d+)<\/text>/g)];
    // Bậc tam cấp vẽ SAU thang, nên ba số cuối cùng của lớp này là của nó.
    const tail = numbers.slice(-3).map((m) => ({ y: Number(m[1]), n: m[2] }));
    expect(tail.map((entry) => entry.n)).toEqual(['1', '2', '3']);
    // Trên giấy y chạy xuống; mặt trước nhà (y thật nhỏ) nằm DƯỚI tờ nên bậc 1 — ngoài cùng — thấp nhất.
    expect(tail[0]!.y).toBeGreaterThan(tail[2]!.y);
  });

  it('thang có mặt bậc: phần có bậc dài đúng số bậc × mặt bậc, phần dư vào chiếu nghỉ', () => {
    const stair = { ...villa1.stairs![0]!, going: 25 };
    // 21 bậc hai vế → 11 bậc mỗi vế (làm tròn) × 25 = 275, trên ô thang dài 467.
    const [zone] = stairTreadZones([stair]);
    expect(zone!.y1 - zone!.y0).toBe(275);
    const [old] = stairTreadZones([villa1.stairs![0]!]);
    expect(old!.y1 - old!.y0).toBeGreaterThan(275);
  });

  it('số bậc thang in 1…treads, không dư bậc làm tròn', () => {
    const level: AiFloorPlanLevel = {
      ...villa1,
      stairs: [{ ...villa1.stairs![0]!, going: 25 }],
    };
    const svg = renderPlanSheet(
      { ...VILLA_PLAN, levels: [level, ...VILLA_PLAN.levels.slice(1)] },
      1,
      {
        style,
        labels: {},
      },
    ).svg;
    const numbers = textsOfClass(svg, 'tsn').map(Number);
    expect(numbers).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });
});
