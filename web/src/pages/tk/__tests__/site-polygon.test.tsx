/**
 * Bảng vẽ thửa đa giác (anh Dũng 27/10/2026): phép toán kéo / chèn / tự cắt và cách nhập theo chiều dài cạnh.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { polygonFromEdges, type Point } from '@nvg/shared/design';
import {
  edgeLengths,
  insertMidpoint,
  interiorAngles,
  selfIntersects,
  snap,
  snapAngle,
} from '../site-polygon-math';
import { SitePolygonEditor } from '../site-polygon-editor';

const rect: Point[] = [
  [0, 0],
  [10, 0],
  [10, 20],
  [0, 20],
];

describe('site-polygon-math', () => {
  it('bắt lưới 0,1 m không để lọt số lẻ dấu phẩy động', () => {
    expect(snap(0.30000000000000004)).toBe(0.3);
    expect(snap(4.96)).toBe(5);
  });

  it('chiều dài cạnh, góc trong, chèn đỉnh giữa cạnh', () => {
    expect(edgeLengths(rect)).toEqual([10, 20, 10, 20]);
    expect(interiorAngles(rect)).toEqual([90, 90, 90, 90]);
    expect(insertMidpoint(rect, 0)).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ]);
  });

  it('nhận ra hình tự cắt (kéo một đỉnh qua cạnh đối diện)', () => {
    expect(selfIntersects(rect)).toBe(false);
    expect(
      selfIntersects([
        [0, 0],
        [10, 0],
        [0, 20],
        [10, 20],
      ]),
    ).toBe(true);
  });

  it('giữ Shift: cạnh bắt về bội số 45°', () => {
    expect(snapAngle([0, 0], [10, 0.4])).toEqual([10, 0]);
    const [x, y] = snapAngle([0, 0], [7, 7.3]);
    expect(Math.abs(x - y)).toBeLessThanOrEqual(0.1);
  });

  it('góc trong suy từ hình dựng lại đúng hình qua polygonFromEdges', () => {
    const shape: Point[] = [
      [0, 0],
      [12, 0],
      [14, 18],
      [2, 20],
      [0, 10],
    ];
    const lengths = edgeLengths(shape);
    const angles = interiorAngles(shape);
    const back = polygonFromEdges(
      lengths.map((lengthM, i) => ({ lengthM, turnDeg: 180 - angles[(i + 1) % shape.length]! })),
    );
    expect(back.closureErrorM).toBeLessThan(0.05);
  });
});

describe('SitePolygonEditor', () => {
  it('chưa có đỉnh: bắt đầu từ hình chữ nhật', () => {
    const onChange = vi.fn();
    render(<SitePolygonEditor points={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu từ hình chữ nhật/ }));
    expect(onChange).toHaveBeenCalledWith(rect);
  });

  it('ghi chiều dài cạnh, chèn đỉnh khi bấm dấu cộng, bỏ đỉnh khi bấm đúp', () => {
    const onChange = vi.fn();
    render(<SitePolygonEditor points={rect} onChange={onChange} certificateAreaM2={250} />);
    expect(screen.getAllByText('10 m')).toHaveLength(2);
    expect(screen.getByText(/giấy chứng nhận ghi 250 m², lệch 50 m²/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm đỉnh giữa đỉnh 1 và đỉnh 2' }));
    expect(onChange).toHaveBeenLastCalledWith([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ]);

    fireEvent.doubleClick(screen.getByRole('button', { name: /^Đỉnh 3:/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      [0, 0],
      [10, 0],
      [0, 20],
    ]);
  });

  it('hình tự cắt thì cảnh báo bằng chữ', () => {
    render(
      <SitePolygonEditor
        points={[
          [0, 0],
          [10, 0],
          [0, 20],
          [10, 20],
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/tự cắt/);
  });
});
