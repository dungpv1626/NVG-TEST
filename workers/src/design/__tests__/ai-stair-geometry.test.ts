/**
 * Hình học 5 loại thang chính (T105) — số ở đây là số của tài liệu «Các loại thang bộ phổ biến — ký hiệu mặt bằng»
 * (tầng 3,6 m, cổ bậc 171 → 21 cổ bậc, mặt bậc 260, vế 1.000, tường 110 mỗi bên). KHÔNG chạm mạng.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { DesignBrief } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { renderStairs } from '../ai/draw/stairs';
import { parseSheetStyle } from '../ai/draw/style';
import { CLS } from '../ai/draw/svg';
import { paperFor } from '../ai/draw/units';
import { chooseStairShape, withStairShape } from '../ai/stair-choice';
import { parseConstructionNorms } from '../kb/construction';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';
import {
  stairArrival,
  stairLayout,
  stairNeed,
  stairSplit,
  type StairParams,
} from '../ai/stair-geometry';

const base = { risers: 21, going: 26, flightWidth: 100, landing: 100, gap: 0 };
const params: Record<string, StairParams> = {
  thang_thang: { ...base, shape: 'thang_thang' },
  chu_l: { ...base, shape: 'chu_l' },
  chu_u: { ...base, shape: 'chu_u', gap: 15 },
  ba_ve: { ...base, shape: 'ba_ve' },
  chu_u_rong: { ...base, shape: 'chu_u_rong', landing: 150, gap: 60 },
};
const WALLS = 22;

describe('chia bậc theo tài liệu', () => {
  it('U, L, thẳng: 10 bậc + chiếu nghỉ + 9 bậc; ba vế: 6 + CN + 6 + CN + 6', () => {
    expect(stairSplit('chu_u', 21)).toEqual([10, 9]);
    expect(stairSplit('chu_l', 21)).toEqual([10, 9]);
    expect(stairSplit('thang_thang', 21)).toEqual([10, 9]);
    expect(stairSplit('ba_ve', 21)).toEqual([6, 6, 6]);
  });
});

describe('kích thước ô thang = số của tài liệu (dọc vế đầu lọt lòng, ngang cả tường; sai số 5 cm)', () => {
  it.each([
    ['chu_u', 360, 237],
    ['chu_u_rong', 410, 282],
    ['chu_l', 360, 356],
    ['ba_ve', 256, 378],
  ])('%s ≈ %i × %i', (key, along, across) => {
    const need = stairNeed(params[key]!);
    expect(Math.abs(need.along - along)).toBeLessThanOrEqual(5);
    expect(Math.abs(need.across + WALLS - across)).toBeLessThanOrEqual(5);
  });

  it('thang thẳng dài ≈ 5,94 m, rộng một vế', () => {
    const need = stairNeed(params.thang_thang!);
    expect(Math.abs(need.along - 594)).toBeLessThanOrEqual(5);
    expect(need.across).toBe(100);
  });
});

describe('bố cục vẽ', () => {
  it('thang U: 20 số — 1–10 vế đầu, 11 chiếu nghỉ, 12–20 vế hai; ra ở cạnh sau lưng bậc 1', () => {
    const layout = stairLayout(params.chu_u!, [0, 0, 215, 360], '+y');
    expect(layout.pieces.map((piece) => piece.n)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(layout.pieces.filter((piece) => piece.landing).map((piece) => piece.n)).toEqual([11]);
    expect(layout.arrival).toBe('start');
    // Bậc 1 sát cạnh y = 0 (lối vào), bậc 12 ở dải bên kia sát chiếu nghỉ.
    expect(layout.pieces[0]!.centre[1]).toBeCloseTo(13, 5);
  });

  it('ba vế: hai chiếu nghỉ 7 và 14, có giếng', () => {
    const layout = stairLayout(params.ba_ve!, [0, 0, 356, 256], '+y');
    expect(layout.pieces.filter((piece) => piece.landing).map((piece) => piece.n)).toEqual([7, 14]);
    expect(layout.well).not.toBeNull();
  });

  it('phía bước ra ở tầng trên: thẳng → cạnh đối diện, L → cạnh ngang, U / ba vế → cạnh bậc 1', () => {
    expect(stairArrival('thang_thang')).toBe('end');
    expect(stairArrival('chu_l')).toBe('across');
    expect(stairArrival('chu_u')).toBe('start');
    expect(stairArrival('ba_ve')).toBe('start');
  });
});

describe('chọn loại thang của lượt (`chooseStairShape`)', () => {
  const norms = parseConstructionNorms(
    readFileSync(
      fileURLToPath(new URL('../../../../kb/construction_norms.yaml', import.meta.url)),
      'utf8',
    ),
  );
  const pick = (brief: DesignBrief) => chooseStairShape(digestOf(brief), norms)?.shape;

  it('gia chủ chọn thì dùng đúng loại ấy — kể cả khi quy tắc sẽ chọn khác', () => {
    expect(pick({ ...TOWNHOUSE, vertical: { stair_shape: 'chu_l' } } as DesignBrief)).toBe('chu_l');
    expect(pick({ ...VILLA, vertical: { stair_shape: 'ba_ve' } } as DesignBrief)).toBe('ba_ve');
  });

  it('chưa quyết: nhà có người từ 65 tuổi → U chiếu nghỉ rộng', () => {
    const family = [{ role: 'ong_ba', count: 2, ages: [70, 68] }, ...(VILLA.family ?? []).slice(1)];
    expect(pick({ ...VILLA, family, vertical: { stair_shape: 'chua_quyet' } } as DesignBrief)).toBe(
      'chu_u_rong',
    );
  });

  it('chưa quyết: khối xây hẹp dưới 4 m → thang thẳng; nhà phố đủ rộng → chữ U', () => {
    expect(pick({ ...TOWNHOUSE, site: { width_m: 3.5, depth_m: 18 } } as DesignBrief)).toBe(
      'thang_thang',
    );
    expect(pick({ ...TOWNHOUSE, site: { width_m: 8, depth_m: 18 } } as DesignBrief)).toBe('chu_u');
  });

  it('chưa quyết, nhà ống: loại thang chiếm ít diện tích nhất vừa khối (T116 — Haan: «diện tích cầu thang tối thiểu»)', () => {
    // TOWNHOUSE mặt tiền 5 m là nhà ống: thang thẳng 1,0 × 5,94 m (5,9 m²) nhỏ hơn chữ U 2,15 × 3,6 m (7,7 m²).
    expect(pick(TOWNHOUSE)).toBe('thang_thang');
  });

  it('`withStairShape` gắn loại vào `construction.stairs.shape`; kho không có bảng loại thì giữ nguyên', () => {
    expect(withStairShape(norms, digestOf(TOWNHOUSE)).stairs.shape).toBe('thang_thang');
    const bare = { ...norms, stairs: { ...norms.stairs, shapes: undefined } };
    expect(withStairShape(bare, digestOf(TOWNHOUSE)).stairs.shape).toBeUndefined();
  });

  it('kho: bảng loại thang đọc được; loại lạ hoặc thiếu thông số bị từ chối', () => {
    expect(norms.stairs.shapes?.chu_u?.gap_m).toBe(0.15);
    const text = readFileSync(
      fileURLToPath(new URL('../../../../kb/construction_norms.yaml', import.meta.url)),
      'utf8',
    );
    expect(() => parseConstructionNorms(text.replace('    chu_l: {', '    xoan_oc: {'))).toThrow(
      /loại thang lạ/,
    );
    expect(() =>
      parseConstructionNorms(
        text.replace(
          "chu_l: { vi: 'Thang chữ L (2 vế vuông góc)', flight_width_m: 1.0,",
          "chu_l: { vi: 'L',",
        ),
      ),
    ).toThrow(/thiếu hoặc sai/);
  });
});

describe('tờ vẽ thang theo loại (ký hiệu tài liệu)', () => {
  const style = parseSheetStyle(
    readFileSync(
      fileURLToPath(new URL('../../../../kb/sheet_style.yaml', import.meta.url)),
      'utf8',
    ),
  );
  const need = stairNeed(params.chu_u!);
  const stair = {
    id: 's',
    rect: [0, 0, need.across, need.along],
    up: '+y',
    flights: 2,
    treads: 21,
    going: 26,
    shape: 'chu_u',
    flight_width: 100,
    landing: 100,
    gap: 15,
  } as never;
  const paper = paperFor(
    { x0: 0, y0: 0, x1: need.across, y1: need.along },
    { plan: { x0: 10, y0: 10, x1: 190, y1: 190 } } as never,
    25,
  );

  it('tầng dưới: phần trên mặt cắt nét đứt, có chấm bậc 1, chữ LÊN, đủ số 1–20', () => {
    const svg = renderStairs([stair], paper, style);
    expect(svg).toContain(`class="${CLS.stairAbove}"`);
    expect(svg).toContain(`class="${CLS.stairArrowAbove}"`);
    expect(svg).toContain(`class="${CLS.stairDot}"`);
    expect(svg).toContain('LÊN');
    for (const n of [1, 11, 20]) expect(svg).toContain(`>${n}<`);
  });

  it('tầng trên cùng: nhìn từ trên thấy trọn thang — không nét đứt, chữ XUỐNG', () => {
    const svg = renderStairs([stair], paper, style, true);
    expect(svg).not.toContain(`class="${CLS.stairAbove}"`);
    expect(svg).toContain('XUỐNG');
  });
});
