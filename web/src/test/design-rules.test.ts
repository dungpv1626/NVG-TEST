/**
 * Canh hai quy tắc của hệ thống thiết kế mà không thao tác người dùng nào phát hiện được.
 *
 * Cả hai đều thuộc loại "mòn dần": không lần sửa nào phá vỡ chúng một cách rõ ràng, nhưng sau
 * mười lần sửa nhỏ thì quy tắc biến mất mà không ai nhận ra thời điểm nó mất. Test đọc thẳng mã
 * nguồn và token màu là cách duy nhất giữ được chúng.
 *
 * Xem `DESIGN_SYSTEM.md` mục 2.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Đọc theo đường dẫn từ gốc repo, không theo `import.meta.url`: ở môi trường jsdom, Vite gán cho
 * `import.meta.url` một địa chỉ http chứ không phải đường dẫn tệp, nên `fileURLToPath` sẽ hỏng.
 */
function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), 'web/src', relative), 'utf8');
}

describe('Ranh giới màu nhận diện (cam an toàn)', () => {
  /**
   * Cam `#EA580C` nằm giữa vàng "Chờ duyệt" `#906C00` và đỏ "Quá hạn" `#CA3521`.
   *
   * Người dùng quét một bảng 50 dòng phải phân biệt trạng thái trong nửa giây. Thêm một sắc cam
   * vào đúng vùng đó là buộc họ phân biệt ba màu ấm gần nhau thay vì hai — và hệ thống 5 màu
   * trạng thái mất tác dụng mà không có triệu chứng nào báo trước.
   */
  it.each([
    ['components/ui/status-lozenge.tsx', 'nhãn trạng thái'],
    ['components/ui/button.tsx', 'nút bấm'],
  ])('%s KHÔNG dùng màu nhận diện (%s)', (file) => {
    expect(source(file)).not.toMatch(/\baccent\b/);
  });

  it('dòng dữ liệu của bảng KHÔNG tô nền bằng màu nhận diện', () => {
    const table = source('components/entity/entity-table.tsx');
    expect(table).not.toMatch(/bg-accent/);
  });
});

describe('Nạp phông cho tiếng Việt', () => {
  const css = source('index.css');

  /**
   * Tệp phông theo BỘ KÝ TỰ của fontsource (`vietnamese-400.css`, `latin-400.css`) không có
   * `unicode-range`. Nạp cả hai là khai hai `@font-face` cùng family, cùng nét, cùng kiểu, không
   * phân định phạm vi — theo quy tắc CSS thì khai báo SAU đè khai báo trước.
   *
   * Hệ quả đã gặp thật: `latin` thắng, toàn bộ chữ có dấu (ă â đ ê ô ơ ư và mọi dấu thanh) rơi về
   * phông hệ thống, chữ Việt hiện ra lẫn hai phông ngay giữa một từ. Với sản phẩm 100% tiếng Việt
   * thì đây là lỗi thấy ngay ở mọi màn hình — nhưng chỉ thấy khi MỞ TRÌNH DUYỆT, còn typecheck và
   * build đều xanh.
   */
  it('nạp theo NÉT chứ không theo bộ ký tự — tệp theo bộ ký tự thiếu unicode-range', () => {
    expect(css).not.toMatch(/@fontsource\/[^']*\/(vietnamese|latin|latin-ext|cyrillic)-\d/);
    expect(css).toMatch(/@fontsource\/be-vietnam-pro\/400\.css/);
  });

  it('khai phông tiếng Việt làm họ chữ chính', () => {
    expect(css).toMatch(/--font-sans:\s*\n?\s*'Be Vietnam Pro'/);
  });
});

describe('Tương phản màu đạt WCAG AA', () => {
  const css = source('index.css');

  function token(name: string): string {
    const found = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!found) throw new Error(`Không tìm thấy token --color-${name} trong index.css`);
    return found[1]!;
  }

  function channel(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  }

  /**
   * 4.5:1 cho chữ thường. Nhãn trạng thái là chữ 12px nên KHÔNG được tính là "chữ lớn" của WCAG
   * — đây chính là chỗ bảng màu gốc của CGD 6.3 không đạt và đã phải sửa.
   */
  it.each([
    ['chữ chính trên nền trắng', 'fg', 'surface'],
    ['chữ chính trên nền trũng', 'fg', 'surface-sunken'],
    ['chữ phụ trên nền trắng', 'fg-subtle', 'surface'],
    ['chữ phụ trên nền trũng', 'fg-subtle', 'surface-sunken'],
    ['nhãn Nháp', 'status-draft', 'status-draft-bg'],
    ['nhãn Chờ duyệt', 'status-pending', 'status-pending-bg'],
    ['nhãn Đang xử lý', 'status-progress', 'status-progress-bg'],
    ['nhãn Hoàn thành', 'status-completed', 'status-completed-bg'],
    ['nhãn Quá hạn', 'status-overdue', 'status-overdue-bg'],
  ])('%s đạt ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('chữ trắng trên nút hành động chính đạt ≥ 4.5:1', () => {
    expect(contrast(token('fg-inverse'), token('brand'))).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * WCAG 1.4.11: viền của ô nhập cần ≥3:1. Viền là thứ DUY NHẤT cho biết đâu là chỗ gõ được —
   * viền mờ quá thì ô nhập trông như một dòng chữ thường.
   */
  it('viền ô nhập đạt ≥ 3:1 trên nền trắng', () => {
    expect(contrast(token('border-strong'), token('surface'))).toBeGreaterThanOrEqual(3);
  });
});
