/**
 * Canh hai quy tắc của hệ thống thiết kế mà không thao tác người dùng nào phát hiện được.
 *
 * Cả hai đều thuộc loại "mòn dần": không lần sửa nào phá vỡ chúng một cách rõ ràng, nhưng sau
 * mười lần sửa nhỏ thì quy tắc biến mất mà không ai nhận ra thời điểm nó mất. Test đọc thẳng mã
 * nguồn và token màu là cách duy nhất giữ được chúng.
 *
 * Xem `DESIGN_SYSTEM.md` mục 2.
 */

import { readdirSync, readFileSync } from 'node:fs';
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

describe('Vùng bấm cho ngón tay', () => {
  /**
   * Tối thiểu ~40×40px (Content Guidelines 6.8). Đây là loại quy tắc mòn dần điển hình: nút
   * lịch trong ô nhập ngày lúc đầu được đặt bằng `p-1.5` quanh một biểu tượng 16px — ra đúng
   * 28×28, nhìn trên máy tính thì gọn gàng, còn ngón tay ở công trường thì bấm trượt.
   *
   * Ô nhập chỉ cao 36px nên vùng bấm phải nhô ra khỏi ô; nó nằm ở lớp tuyệt đối nên không đẩy
   * bố cục, và phần nhô ra là vùng bấm trong suốt chứ không phải hình vẽ.
   */
  it('nút mở lịch có vùng bấm 40×40, không co theo kích thước biểu tượng', () => {
    const code = source('components/ui/date-input.tsx');
    const button = code.slice(code.indexOf('aria-label="Chọn ngày trên lịch"'));
    expect(button).toContain('size-10');
  });
});

describe('Không để trình duyệt tự sinh chữ tiếng Anh', () => {
  /**
   * Ba điều khiển gốc của trình duyệt tự sinh chữ theo NGÔN NGỮ CỦA TRÌNH DUYỆT, không theo
   * `lang` của trang, và không thuộc tính HTML nào ép được:
   *
   *  - `<input type="date">` — ô hiện `mm/dd/yyyy`, bảng lịch hiện "September", "Su Mo Tu".
   *    KHÔNG ép được bằng cách nào, nên phải thay hẳn bằng `DateInput`.
   *  - Ràng buộc biểu mẫu (`required`, `min`, `pattern`…) — "Please fill out this field."
   *    Ép được bằng `setCustomValidity`, nên chỉ cần chốt ở `main.tsx` là phủ hết, kể cả
   *    `<input type="number">`.
   *
   * Chữ này không nằm trong mã nguồn nên đọc code không thấy, và trên máy người lập trình nó
   * trông vẫn bình thường. Chỉ có test đọc thẳng mã nguồn mới giữ được ranh giới.
   */
  const PAGES = 'web/src/pages';

  function allPageSources(): { file: string; code: string }[] {
    const out: { file: string; code: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
        } else if (entry.name.endsWith('.tsx')) {
          out.push({ file: path, code: readFileSync(resolve(process.cwd(), path), 'utf8') });
        }
      }
    };
    walk(dir(PAGES));
    return out;
  }
  const dir = (d: string) => d;

  it('không màn hình nào dùng `<input type="date">` — phải dùng `DateInput`', () => {
    const offenders = allPageSources()
      .filter(({ code }) => /type="date"/.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('chốt dịch lời thoại ràng buộc được gắn ngay khi ứng dụng khởi động', () => {
    // Thiếu dòng này thì mọi ô `required` ngoài `Input` lại báo tiếng Anh.
    expect(source('main.tsx')).toContain('installVietnameseValidation()');
  });
});
