/**
 * Danh sách `exposeHeaders` của CORS phải phủ hết header mà các tuyến thật sự đặt.
 *
 * Vì sao cần một phép thử cho một danh sách chuỗi: giao diện và API khác nguồn nhau (Worker `nvg`
 * so với `nvg-api`), nên một header không khai ở đó **không gây lỗi nào** — trình duyệt chỉ đọc ra
 * `null`. Chip «Tỷ lệ 1:50» biến mất mà không ai biết vì sao.
 *
 * Đã sập thật ngày 19/09/2026: `X-Anchor-Width`/`X-Anchor-Height` của T57 thiếu trong danh sách, và
 * lượt vẽ dừng ngay trước khi gọi mô hình. Lần ấy lộ ra nhanh vì chỗ gọi kiểm giá trị rồi ném lỗi
 * đọc được — nhưng đó là may, không phải thiết kế.
 *
 * Phép thử đọc MÃ NGUỒN chứ không gọi HTTP: nó hỏi «hai danh sách này có khớp nhau không», và câu
 * hỏi ấy trả lời được bằng chữ. Dựng cả một request giả qua Hono chỉ để đọc lại một hằng số là đắt
 * hơn mà không chắc hơn.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/** Tên header tuỳ chỉnh mà một tệp nguồn đặt vào phản hồi — mọi khoá `'X-...':` trong tệp. */
function customHeadersSetIn(source: string): string[] {
  return [...source.matchAll(/'(X-[A-Za-z-]+)':/g)].map((match) => match[1]!);
}

describe('CORS — header tuỳ chỉnh phải được khai lộ', () => {
  const entry = read('../../index.ts');
  const exposed = /exposeHeaders:\s*\[([^\]]*)\]/s.exec(entry)?.[1] ?? '';

  // Quét CẢ BA tệp tuyến của nhánh AI, không riêng `routes.ts`. Tuyến tách ra tệp mới (mặt đứng
  // T59, phối cảnh T67) là đúng lúc một header mới lọt khỏi tầm phép thử này mà vẫn xanh.
  const ROUTE_FILES = ['../ai/routes.ts', '../ai/facade-routes.ts', '../ai/perspective-routes.ts'];

  it.each(ROUTE_FILES)('mọi header tuỳ chỉnh của %s đều nằm trong `exposeHeaders`', (file) => {
    const set = customHeadersSetIn(read(file));
    expect(set.length, `${file} phải đặt ít nhất một header tuỳ chỉnh`).toBeGreaterThan(0);
    for (const header of set) {
      expect(exposed, `thiếu ${header} trong exposeHeaders`).toContain(`'${header}'`);
    }
  });

  it('khai đủ hai nhóm đang dùng: tờ mặt bằng và ảnh neo', () => {
    for (const header of [
      'X-Sheet-Scale',
      'X-Sheet-Orientation',
      'X-Anchor-Width',
      'X-Anchor-Height',
    ]) {
      expect(exposed).toContain(`'${header}'`);
    }
  });

  /*
   * `X-NVG-Contracts` không do một tuyến nào đặt mà do middleware của `design/index.ts` gắn vào
   * MỌI phản hồi, nên phép quét tuyến ở trên không nhìn thấy nó. Kiểm riêng: quên khai thì giao
   * diện đọc ra `null`, coi như «chưa đo được» và im lặng — đúng thứ nó sinh ra để bắt.
   */
  it('khai dấu vân tay hợp đồng — thứ middleware gắn vào mọi phản hồi', () => {
    expect(read('../index.ts')).toContain("c.header('X-NVG-Contracts'");
    expect(exposed).toContain("'X-NVG-Contracts'");
  });
});
