/**
 * `polygonFromCoordinates` — dựng ranh giới thửa đất trực tiếp từ bảng toạ độ đã chép nguyên
 * văn (kết quả Gemini đọc ảnh trích lục có kèm "BẢNG KÊ TOẠ ĐỘ").
 *
 * Bộ dữ liệu ở test đầu tiên chép nguyên văn từ một trích lục thật (thửa số 69, diện tích in
 * trên ảnh là 66,3 m²) — dùng để canh không cho việc quy đổi tất định này lệch khỏi số liệu đo
 * đạc gốc, kể cả với hình LÕM (đây đúng là trường hợp gây lỗi: pipeline cũ chỉ đọc hình vẽ sơ
 * đồ bằng mắt, ra diện tích 506,2 m² — sai lệch 7,6 lần và mất hẳn phần lõm).
 */

import { describe, expect, it } from 'vitest';
import {
  polygonFromCoordinates,
  PolygonFromCoordinatesError,
  type VertexCoordinateSpec,
} from '../design/site-boundary-from-coordinates';
import { polygonArea } from '../design/site-geometry';

describe('polygonFromCoordinates', () => {
  it('bảng toạ độ thật (10 đỉnh, thửa lõm) — diện tích khớp đúng số in trên ảnh (66,3 m²)', () => {
    const vertices: VertexCoordinateSpec[] = [
      { index: 1, x: 1191661.37, y: 601544.78 },
      { index: 2, x: 1191660.96, y: 601545.06 },
      { index: 3, x: 1191653.03, y: 601550.79 },
      { index: 4, x: 1191657.77, y: 601556.63 },
      { index: 5, x: 1191660.24, y: 601554.55 },
      { index: 6, x: 1191660.96, y: 601553.97 },
      { index: 7, x: 1191662.99, y: 601550.75 },
      { index: 8, x: 1191662.75, y: 601550.37 },
      { index: 9, x: 1191664.2, y: 601549.37 },
      { index: 10, x: 1191663.84, y: 601548.36 },
      // Bảng gốc lặp lại đỉnh 1 ở hàng cuối để khép vòng — hàm phải tự loại, không tạo cạnh
      // dài 0m.
      { index: 11, x: 1191661.37, y: 601544.78 },
    ];
    const result = polygonFromCoordinates(vertices);
    expect(result.boundaryM).toHaveLength(10);
    expect(result.assumedAngleIndices).toEqual([]);
    expect(result.closureErrorM).toBe(0);
    expect(result.closureErrorDeg).toBe(0);
    expect(polygonArea(result.boundaryM)).toBeCloseTo(66.3, 1);
  });

  it('không khép vòng lặp lại đỉnh đầu — vẫn dựng đúng, không mất đỉnh', () => {
    const vertices: VertexCoordinateSpec[] = [
      { index: 1, x: 0, y: 0 },
      { index: 2, x: 10, y: 0 },
      { index: 3, x: 10, y: 8 },
      { index: 4, x: 0, y: 8 },
    ];
    const result = polygonFromCoordinates(vertices);
    expect(result.boundaryM).toHaveLength(4);
    expect(polygonArea(result.boundaryM)).toBeCloseTo(80, 6);
  });

  it('đỉnh không theo thứ tự tăng dần trong mảng — sắp lại theo index trước khi dựng', () => {
    const vertices: VertexCoordinateSpec[] = [
      { index: 3, x: 10, y: 8 },
      { index: 1, x: 0, y: 0 },
      { index: 4, x: 0, y: 8 },
      { index: 2, x: 10, y: 0 },
    ];
    const result = polygonFromCoordinates(vertices);
    expect(polygonArea(result.boundaryM)).toBeCloseTo(80, 6);
  });

  it('dưới ba đỉnh — ném lỗi không thử lại', () => {
    expect(() =>
      polygonFromCoordinates([
        { index: 1, x: 0, y: 0 },
        { index: 2, x: 10, y: 0 },
      ]),
    ).toThrow(PolygonFromCoordinatesError);
  });

  it('đỉnh đầu tịnh tiến về gốc (0,0)', () => {
    const vertices: VertexCoordinateSpec[] = [
      { index: 1, x: 100, y: 200 },
      { index: 2, x: 110, y: 200 },
      { index: 3, x: 110, y: 210 },
      { index: 4, x: 100, y: 210 },
    ];
    const result = polygonFromCoordinates(vertices);
    expect(result.boundaryM).toContainEqual([0, 0]);
  });
});
