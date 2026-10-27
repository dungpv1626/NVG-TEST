/**
 * Quay lui dời ô thang tầng 1 khi tầng trên hỏng (T172). Hiệu quả đo bằng phát lại 243 vòng (doc/design/QUYET_DINH_AI.md
 * T172); ở đây chỉ canh thứ tự bước thử và cách đọc cấu hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groundShifts } from '../ai/plan';
import { parseConstructionNorms } from '../kb/construction';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

describe('Dời ô thang tầng 1 (T172)', () => {
  it('mỗi bước một ô lưới bản phác, gần trước xa sau, chiều sâu trước bề ngang', () => {
    // Khối 500 × 1800 cm, bản phác 5 cột × 18 hàng → ô 100 cm mỗi trục.
    const rows = Array.from({ length: 18 }, () => 'a a a a a');
    const steps = groundShifts({ x0: 0, y0: 0, x1: 500, y1: 1800 }, rows, 2);
    expect(steps).toEqual([
      { axis: 'y', by: -100 },
      { axis: 'y', by: 100 },
      { axis: 'y', by: -200 },
      { axis: 'y', by: 200 },
      { axis: 'x', by: -100 },
      { axis: 'x', by: 100 },
      { axis: 'x', by: -200 },
      { axis: 'x', by: 200 },
    ]);
  });

  it('0 bước hoặc bản phác rỗng thì không thử gì', () => {
    expect(groundShifts({ x0: 0, y0: 0, x1: 500, y1: 1800 }, ['a a'], 0)).toEqual([]);
    expect(groundShifts({ x0: 0, y0: 0, x1: 500, y1: 1800 }, [], 2)).toEqual([]);
  });

  it('cấu hình đang dùng: 1 bước (2 bước gấp đôi thời gian xếp mà không thêm vòng qua)', () => {
    const norms = parseConstructionNorms(read('kb/construction_norms.yaml'));
    expect(norms.sketch?.ground_core_shift).toEqual({ max_steps: 1 });
  });

  it('số bước sai kiểu thì báo lỗi cấu hình, không lặng lẽ tắt', () => {
    const yaml = read('kb/construction_norms.yaml').replace(/max_steps: \d+/, 'max_steps: -1');
    expect(() => parseConstructionNorms(yaml)).toThrow(/ground_core_shift/);
  });
});
