/**
 * `polygonFromEdges` — dựng ranh giới thửa đất từ danh sách cạnh có cấu trúc (kết quả Gemini
 * đọc ảnh trích lục, `SiteBoundaryExtraction`).
 *
 * Đáng canh nhất: hàm này là chỗ DUY NHẤT gán toạ độ sau khi mô hình ngôn ngữ đọc ảnh — sai
 * ở đây là sai âm thầm, vì kết quả vẫn là một đa giác "trông hợp lý" trên màn hình.
 */

import { describe, expect, it } from 'vitest';
import {
  polygonFromEdges,
  PolygonFromEdgesError,
  type EdgeSpec,
} from '../design/site-boundary-from-edges';
import { polygonArea } from '../design/site-geometry';

describe('polygonFromEdges', () => {
  it('hình chữ nhật, bốn góc vuông biết trước — khép kín chính xác', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: 90 },
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: 90 },
    ];
    const result = polygonFromEdges(edges);
    expect(result.closureErrorM).toBeCloseTo(0, 6);
    expect(result.closureErrorDeg).toBeCloseTo(0, 6);
    expect(result.assumedAngleIndices).toEqual([]);
    expect(polygonArea(result.boundaryM)).toBeCloseTo(96, 3);
  });

  it('tam giác đều, ba góc quay 120° biết trước — khép kín chính xác', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 10, turnDeg: 120 },
      { lengthM: 10, turnDeg: 120 },
      { lengthM: 10, turnDeg: 120 },
    ];
    const result = polygonFromEdges(edges);
    expect(result.closureErrorM).toBeCloseTo(0, 6);
    expect(result.closureErrorDeg).toBeCloseTo(0, 6);
    // Diện tích tam giác đều cạnh 10: (√3/4)·10² ≈ 43,301
    expect(polygonArea(result.boundaryM)).toBeCloseTo(43.301, 2);
  });

  it('thiếu một trong bốn góc — góc còn thiếu chia đều phần dư, vẫn khép kín', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: 90 },
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: null },
    ];
    const result = polygonFromEdges(edges);
    expect(result.assumedAngleIndices).toEqual([3]);
    // Ba góc đã biết cộng 270°, góc còn lại nhận đúng 90° — hình vẫn là chữ nhật, khép kín.
    expect(result.closureErrorM).toBeCloseTo(0, 6);
    expect(result.closureErrorDeg).toBeCloseTo(0, 6);
  });

  it('mọi góc đều thiếu — rơi về đa giác đều, không cần nhánh riêng', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 10, turnDeg: null },
      { lengthM: 10, turnDeg: null },
      { lengthM: 10, turnDeg: null },
      { lengthM: 10, turnDeg: null },
      { lengthM: 10, turnDeg: null },
    ];
    const result = polygonFromEdges(edges);
    expect(result.assumedAngleIndices).toEqual([0, 1, 2, 3, 4]);
    expect(result.closureErrorM).toBeCloseTo(0, 6);
    expect(result.closureErrorDeg).toBeCloseTo(0, 6);
    // Ngũ giác đều cạnh 10: diện tích ≈ 172,05
    expect(polygonArea(result.boundaryM)).toBeCloseTo(172.05, 1);
  });

  it('góc đã biết mâu thuẫn nhau — trả closureErrorDeg > 0, KHÔNG tự sửa, không ném lỗi', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 8, turnDeg: 85 },
      { lengthM: 8, turnDeg: 85 },
      { lengthM: 8, turnDeg: 85 },
      { lengthM: 8, turnDeg: 85 },
    ];
    const result = polygonFromEdges(edges);
    expect(result.closureErrorDeg).toBeCloseTo(20, 6);
    expect(result.closureErrorM).toBeGreaterThan(0);
    expect(result.assumedAngleIndices).toEqual([]);
  });

  it('dưới ba cạnh thì ném lỗi', () => {
    expect(() =>
      polygonFromEdges([
        { lengthM: 5, turnDeg: 90 },
        { lengthM: 5, turnDeg: 90 },
      ]),
    ).toThrow(PolygonFromEdgesError);
  });

  it('cạnh khai chiều dài không dương thì ném lỗi', () => {
    expect(() =>
      polygonFromEdges([
        { lengthM: 5, turnDeg: 90 },
        { lengthM: 0, turnDeg: 90 },
        { lengthM: 5, turnDeg: 90 },
      ]),
    ).toThrow(PolygonFromEdgesError);
  });

  it('ranh giới trả về theo đúng thứ tự cạnh 0 → 1 dọc trục +x (mặt tiền)', () => {
    const edges: EdgeSpec[] = [
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: 90 },
      { lengthM: 8, turnDeg: 90 },
      { lengthM: 12, turnDeg: 90 },
    ];
    const result = polygonFromEdges(edges);
    expect(result.boundaryM[0]).toEqual([0, 0]);
    expect(result.boundaryM[1]![0]).toBeCloseTo(8, 6);
    expect(result.boundaryM[1]![1]).toBeCloseTo(0, 6);
  });
});
