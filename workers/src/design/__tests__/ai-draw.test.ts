/**
 * Bộ vẽ SVG tất định của nhánh AI — tờ mặt bằng dựng từ fixture viết tay.
 *
 * Hai loại phép thử, và chúng bù cho nhau:
 *
 *  · **Ảnh chụp vàng** (`toMatchFileSnapshot`) giữ nguyên văn tờ vẽ. Nó không nói tờ vẽ ĐÚNG,
 *    nó nói tờ vẽ KHÔNG ĐỔI — nên mỗi lần sửa bộ vẽ, khác biệt hiện ra thành một đoạn đọc
 *    được thay vì phải mở lại năm tờ bằng mắt. Tệp `.svg` ấy cũng chính là thứ đem cho Haan
 *    chấm qua `python3 -m http.server`.
 *  · **Khẳng định hình học** đo trên chính chuỗi đầu ra: đủ cung cửa, đủ tên phòng, chuỗi kích
 *    thước cộng đúng bằng tổng. Ảnh chụp vàng một mình không bắt được lỗi loại này — nó vui vẻ
 *    đóng băng một tờ vẽ sai.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình. Đây là điều kiện của Đợt 2: tờ vẽ phải được chấm trước
 * khi tiêu một đồng nào cho model.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlan } from '@nvg/shared/design';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseSheetStyle, SheetStyleError } from '../ai/draw/style';
import { renderPlanSheet, PlanSheetError } from '../ai/draw/plan-sheet';
import { parseVocabulary } from '../kb/vocabulary';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const style = parseSheetStyle(read('../../../../kb/sheet_style.yaml'));
const vocabulary = parseVocabulary(read('../../../../kb/room_vocabulary.yaml'));
const labels: Record<string, string> = Object.fromEntries(
  vocabulary.types.map((type) => [type.code, type.vi]),
);

const sheet = (plan: AiFloorPlan, level: number) => renderPlanSheet(plan, level, { style, labels });

/** Mọi chữ nằm trong một lớp cho trước, theo thứ tự xuất hiện. */
function textsOfClass(svg: string, cls: string): string[] {
  const matches = svg.matchAll(new RegExp(`<text[^>]*class="${cls}"[^>]*>([^<]*)</text>`, 'g'));
  return [...matches].map((match) => match[1] ?? '');
}

/** Số cung tròn trong tệp — mỗi lệnh `A` của thuộc tính `d` là một cung. */
function arcCount(svg: string): number {
  return (svg.match(/ A /g) ?? []).length;
}

describe('kb/sheet_style.yaml', () => {
  it('nạp được và có đủ các khoá bộ vẽ dùng tới', () => {
    expect(style.scales.length).toBeGreaterThan(0);
    expect(style.orientations).toContain('portrait');
    expect(style.line_mm.wall_cut).toBeGreaterThan(0);
    expect(style.colour.ink).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('thiếu khoá hoặc màu không phải mã hex thì báo lỗi ngay lúc nạp, không để tờ vẽ hỏng câm', () => {
    expect(() => parseSheetStyle('version: "1.0.0"')).toThrow(SheetStyleError);
    const badColour = read('../../../../kb/sheet_style.yaml').replace(
      "ink: '#172B4D'",
      "ink: 'url(#x)'",
    );
    expect(() => parseSheetStyle(badColour)).toThrow(/mã hex/);
  });
});

describe('bộ vẽ mặt bằng — ảnh chụp vàng', () => {
  const sheets: Array<[string, AiFloorPlan, number]> = [
    ['nha-pho-tang-1', TOWNHOUSE_PLAN, 1],
    ['nha-pho-tang-2', TOWNHOUSE_PLAN, 2],
    ['nha-pho-tang-3', TOWNHOUSE_PLAN, 3],
    ['biet-thu-tang-1', VILLA_PLAN, 1],
    ['biet-thu-tang-2', VILLA_PLAN, 2],
  ];

  for (const [name, plan, level] of sheets) {
    it(`giữ nguyên tờ "${name}"`, async () => {
      const result = sheet(plan, level);
      expect(result.notes).toEqual([]);
      await expect(result.svg).toMatchFileSnapshot(`./__snapshots__/${name}.svg`);
    });
  }
});

describe('bộ vẽ mặt bằng — hình học', () => {
  it('mỗi cửa mở quay có đúng một cung quét, cửa hai cánh có hai', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const expected = (level.doors ?? []).reduce(
          (total, door) => total + (door.kind === 'double' ? 2 : door.kind === 'single' ? 1 : 0),
          0,
        );
        expect(arcCount(sheet(plan, level.level).svg)).toBe(expected);
      }
    }
  });

  it('cửa sổ chỉ nằm trên tường bao', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        for (const window of level.windows ?? []) {
          const wall = level.walls.find((item) => item.id === window.wall);
          expect(wall?.k, `${plan.variant_id} tầng ${level.level} — ${window.id}`).toBe('e');
        }
      }
    }
  });

  it('mọi phòng đều có tên và diện tích in trong phòng', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const svg = sheet(plan, level.level).svg;
        const names = textsOfClass(svg, 'tn');
        const areas = textsOfClass(svg, 'ta');
        expect(names).toHaveLength(level.rooms.length);
        expect(areas).toHaveLength(level.rooms.length);
        for (const room of level.rooms) {
          const expected = room.label ?? labels[room.type] ?? room.type;
          expect(names).toContain(expected);
        }
      }
    }
  });

  it('chuỗi kích thước chi tiết cộng đúng bằng chuỗi tổng, cả hai phương', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const numbers = textsOfClass(sheet(plan, level.level).svg, 'td').map(Number);
        const rows = closedChains(numbers);
        // Đúng hai hàng — ngang và dọc — và mỗi hàng chỉ "đóng" được khi con số cuối bằng đúng
        // tổng các đoạn trước nó. Đó là toàn bộ điều cần chứng minh: tổng không thể lệch, vì
        // nó được ĐO từ cùng bộ toạ độ chứ không do ai khai riêng.
        expect(rows, `${plan.variant_id} tầng ${level.level}: ${numbers.join(' ')}`).toHaveLength(
          2,
        );
        for (const row of rows) {
          expect(row.detail.reduce((a, b) => a + b, 0)).toBe(row.total);
        }
      }
    }
  });

  it('nhãn phòng do mô hình đặt được thoát ký tự, không thành thẻ', () => {
    const hostile: AiFloorPlan = {
      ...VILLA_PLAN,
      levels: [
        {
          ...VILLA_PLAN.levels[0]!,
          rooms: VILLA_PLAN.levels[0]!.rooms.map((room, index) =>
            index === 0 ? { ...room, label: '<script>alert(1)</script>' } : room,
          ),
        },
      ],
    };
    const svg = sheet(hostile, 1).svg;
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('không có tờ nào chứa kịch bản, liên kết ngoài hay bộ bắt sự kiện', () => {
    for (const plan of [TOWNHOUSE_PLAN, VILLA_PLAN]) {
      for (const level of plan.levels) {
        const svg = sheet(plan, level.level).svg;
        expect(svg).not.toMatch(/<script/i);
        expect(svg).not.toMatch(/href\s*=/i);
        expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
      }
    }
  });

  it('chọn tỷ lệ lớn nhất còn vừa giấy, và xoay giấy khi cần', () => {
    // Biệt thự 10 × 14 m: 1:50 vừa tờ A3 DỌC, không vừa tờ ngang — nên phải ra tờ dọc.
    const villa = sheet(VILLA_PLAN, 1);
    expect(villa.scale).toBe(50);
    expect(villa.orientation).toBe('portrait');

    // Gấp đôi kích thước thì 1:50 không còn vừa hướng nào, phải hạ xuống 1:100.
    expect(sheet(scalePlan(VILLA_PLAN, 2), 1).scale).toBe(100);

    // Gấp bốn thì xuống tiếp 1:200 và vẫn ra tờ, không ném.
    const huge = sheet(scalePlan(VILLA_PLAN, 4), 1);
    expect(huge.scale).toBe(200);
    expect(huge.notes).toEqual([]);
  });

  it('lỗ mở lòi ra ngoài đầu tường bị kẹp lại và được ghi rõ', () => {
    const level = TOWNHOUSE_PLAN.levels[0]!;
    const broken: AiFloorPlan = {
      ...TOWNHOUSE_PLAN,
      levels: [
        {
          ...level,
          doors: (level.doors ?? []).map((door) =>
            door.id === 'd1' ? { ...door, at: 900 } : door,
          ),
        },
      ],
    };
    const result = sheet(broken, 1);
    expect(result.notes.map((note) => note.code)).toContain('opening_clamped');
    expect(result.notes[0]?.message).toContain('d1');
  });

  it('tầng không có trong phương án thì báo lỗi nói rõ tầng nào', () => {
    expect(() => sheet(TOWNHOUSE_PLAN, 9)).toThrow(PlanSheetError);
    expect(() => sheet(TOWNHOUSE_PLAN, 9)).toThrow(/tầng 9/i);
  });
});

/**
 * Tách dãy số kích thước thành các hàng đã "đóng": một hàng đóng khi gặp con số bằng đúng tổng
 * các đoạn đứng trước nó — tức là chuỗi tổng của hàng đó.
 */
function closedChains(numbers: number[]): Array<{ detail: number[]; total: number }> {
  const rows: Array<{ detail: number[]; total: number }> = [];
  let detail: number[] = [];
  let sum = 0;
  for (const value of numbers) {
    if (detail.length > 1 && value === sum) {
      rows.push({ detail, total: value });
      detail = [];
      sum = 0;
      continue;
    }
    detail.push(value);
    sum += value;
  }
  return rows;
}

/** Phóng to mọi toạ độ của một phương án — dùng để ép bộ vẽ phải hạ tỷ lệ. */
function scalePlan(plan: AiFloorPlan, factor: number): AiFloorPlan {
  const point = (p: number[]): number[] => p.map((value) => Math.round(value * factor));
  return {
    ...plan,
    levels: plan.levels.slice(0, 1).map((level) => ({
      ...level,
      outline: level.outline.map(point) as typeof level.outline,
      walls: level.walls.map((wall) => ({ ...wall, a: point(wall.a), b: point(wall.b) })),
      rooms: level.rooms.map((room) => ({
        ...room,
        rect: point(room.rect),
        area_m2: room.area_m2 * factor * factor,
      })),
      doors: (level.doors ?? []).map((door) => ({
        ...door,
        at: Math.round(door.at * factor),
        w: Math.round(door.w * factor),
      })),
      windows: (level.windows ?? []).map((window) => ({
        ...window,
        at: Math.round(window.at * factor),
        w: Math.round(window.w * factor),
      })),
      stairs: (level.stairs ?? []).map((stair) => ({ ...stair, rect: point(stair.rect) })),
      voids: (level.voids ?? []).map((item) => ({ ...item, rect: point(item.rect) })),
    })),
  };
}
