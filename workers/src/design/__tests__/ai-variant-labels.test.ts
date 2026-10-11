/**
 * Nhãn cố định của phương án / mặt đứng / bộ ảnh (Haan, 11/10/2026): xoá một bản không làm bản khác đổi tên; bản sửa
 * mang số gốc + lần sửa.
 */

import { describe, expect, it } from 'vitest';
import { lineageMaps, stableLabels } from '../ai/variant-labels';

const at = (minute: number) => `2026-10-11T10:${String(minute).padStart(2, '0')}:00Z`;

describe('stableLabels', () => {
  it('bản gốc đánh số theo thứ tự tạo; bản sửa = số gốc + lần sửa trong cả nhánh', () => {
    const items = [
      { id: 'c', createdAt: at(3) },
      { id: 'a', createdAt: at(1) },
      { id: 'b', createdAt: at(2) },
      { id: 'b1', createdAt: at(4) },
      // Sửa tiếp từ bản sửa: vẫn thuộc nhánh của «2», lần sửa thứ hai.
      { id: 'b2', createdAt: at(5) },
      { id: 'd', createdAt: at(6) },
    ];
    const parentOf = new Map([
      ['b1', 'b'],
      ['b2', 'b1'],
    ]);
    const labels = stableLabels(items, parentOf);
    expect(Object.fromEntries(labels)).toEqual({
      a: '1',
      b: '2',
      c: '3',
      b1: '2.1',
      b2: '2.2',
      d: '4',
    });
  });

  it('nhãn không phụ thuộc bản nào đang hiện — tính trên cả lịch sử, nên xoá một bản không đổi tên bản khác', () => {
    const all = [
      { id: 'a', createdAt: at(1) },
      { id: 'b', createdAt: at(2) },
      { id: 'c', createdAt: at(3) },
    ];
    const labels = stableLabels(all, new Map());
    // Dù «b» đã ẩn khỏi danh sách, «c» vẫn là 3 — màn hình chỉ lọc, không đánh lại.
    expect(labels.get('c')).toBe('3');
  });

  it('cạnh trỏ ra ngoài tập (bản gốc không còn trong lịch sử đọc được) thì bản ấy tự là gốc; cạnh vòng không treo', () => {
    const labels = stableLabels(
      [
        { id: 'x', createdAt: at(1) },
        { id: 'y', createdAt: at(2) },
      ],
      new Map([
        ['x', 'mất'],
        ['y', 'y'],
      ]),
    );
    expect(Object.fromEntries(labels)).toEqual({ x: '1', y: '2' });
  });
});

describe('lineageMaps', () => {
  it('mặt đứng dựng theo phương án; bản sửa mặt đứng không có cạnh sang phương án thì thừa hưởng của bản gốc', () => {
    const edges = [
      { from: 'program', to: 'p1' },
      { from: 'p1', to: 'p1e' },
      { from: 'p1', to: 'f1' },
      { from: 'brief', to: 'f1' },
      { from: 'f1', to: 'f1e' },
      { from: 'f1', to: 's1' },
      { from: 'p1', to: 's1' },
    ];
    const plans = new Set(['p1', 'p1e']);
    const facades = new Set(['f1', 'f1e']);
    expect(Object.fromEntries(lineageMaps(edges, plans, new Set()).parentOf)).toEqual({
      p1e: 'p1',
    });
    const facade = lineageMaps(edges, facades, plans);
    expect(Object.fromEntries(facade.parentOf)).toEqual({ f1e: 'f1' });
    expect(Object.fromEntries(facade.basisOf)).toEqual({ f1: 'p1', f1e: 'p1' });
    // Bộ ảnh có cạnh tới cả mặt đứng lẫn phương án — «theo» là mặt đứng.
    expect(lineageMaps(edges, new Set(['s1']), facades).basisOf.get('s1')).toBe('f1');
  });
});
