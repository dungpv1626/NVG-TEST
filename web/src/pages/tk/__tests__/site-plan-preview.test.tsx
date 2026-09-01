/**
 * `SitePlanPreview` — khung phác họa thửa đất, nền lưới ô.
 *
 * Đáng canh: component này chuyển thẳng SIGNAL từ `siteGeometry()` (chữ nhật/hình thang/đa
 * giác) sang một hình vẽ — sai ở bước "thiếu dữ liệu → nên hiện gì" là loại lỗi im lặng, vì
 * SVG rỗng và SVG lỗi trông giống nhau qua ảnh chụp màn hình.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitePlanPreview } from '../site-plan-preview';

describe('SitePlanPreview', () => {
  it('hình chữ nhật: đủ rộng/sâu thì vẽ được, hiện đúng diện tích', () => {
    render(<SitePlanPreview site={{ width_m: 5, depth_m: 18 }} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText(/diện tích 90 m²/)).toBeInTheDocument();
  });

  it('hình chữ nhật: thiếu chiều sâu thì hiện thông báo, KHÔNG vẽ SVG rỗng', () => {
    render(<SitePlanPreview site={{ width_m: 5 }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Nhập kích thước để xem hình thửa.')).toBeInTheDocument();
  });

  it('hình thang: dùng rear_width_m, vẫn vẽ được khi width/depth đủ', () => {
    render(
      <SitePlanPreview site={{ shape: 'hinh_thang', width_m: 10, depth_m: 20, rear_width_m: 6 }} />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('đa giác: chưa đủ ba đỉnh thì hiện thông báo riêng', () => {
    render(
      <SitePlanPreview
        site={{
          shape: 'da_giac',
          width_m: 1,
          depth_m: 1,
          boundary_m: [
            [0, 0],
            [5, 0],
          ],
        }}
      />,
    );
    expect(screen.getByText('Cần ít nhất ba đỉnh để phác họa hình thửa.')).toBeInTheDocument();
  });

  it('đa giác: đủ đỉnh thì vẽ được', () => {
    render(
      <SitePlanPreview
        site={{
          shape: 'da_giac',
          width_m: 1,
          depth_m: 1,
          boundary_m: [
            [0, 0],
            [8, 0],
            [8, 15],
            [0, 12],
          ],
        }}
      />,
    );
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('đa giác có toạ độ ÂM (ranh giới không bắt đầu ở gốc) — viewBox bao trọn hình, không cắt mất đỉnh nào', () => {
    // Đúng tình huống gây lỗi thật: `polygonFromCoordinates` tịnh tiến ranh giới về ĐỈNH ĐẦU
    // TIÊN (một điểm bất kỳ trên biên, không phải góc trước-trái), nên các đỉnh khác thường có
    // toạ độ âm — khác quy ước "gốc ở góc trước-trái" mà hình chữ nhật/hình thang tuân theo.
    const boundary_m: [number, number][] = [
      [-10, -10],
      [-4, -10],
      [-4, -4],
      [-10, -4],
    ];
    render(<SitePlanPreview site={{ shape: 'da_giac', width_m: 1, depth_m: 1, boundary_m }} />);
    const svg = screen.getByRole('img');
    const [minX, minY, viewWidth, viewHeight] = svg
      .getAttribute('viewBox')!
      .split(' ')
      .map(Number) as [number, number, number, number];
    for (const [x, y] of boundary_m) {
      expect(x).toBeGreaterThanOrEqual(minX);
      expect(x).toBeLessThanOrEqual(minX + viewWidth);
      expect(y).toBeGreaterThanOrEqual(minY);
      expect(y).toBeLessThanOrEqual(minY + viewHeight);
    }
  });

  it('đa giác suy biến (diện tích bằng 0) thì hiện thông báo lỗi thay vì vỡ trang', () => {
    render(
      <SitePlanPreview
        site={{
          shape: 'da_giac',
          width_m: 1,
          depth_m: 1,
          boundary_m: [
            [0, 0],
            [5, 0],
            [10, 0],
          ],
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/không tạo thành một hình có diện tích/)).toBeInTheDocument();
  });

  it('chưa có site nào thì hiện thông báo, không vỡ trang', () => {
    render(<SitePlanPreview site={undefined} />);
    expect(screen.getByText('Nhập kích thước để xem hình thửa.')).toBeInTheDocument();
  });
});
