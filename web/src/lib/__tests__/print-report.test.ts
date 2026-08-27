/**
 * Xuất PDF (BC-06) — mở cửa sổ in với nội dung báo cáo, không dùng thư viện dựng PDF (xem lý do
 * ở đầu `print-report.ts`). Test này khẳng định cửa sổ in nhận đúng tiêu đề/nội dung, chữ động
 * được escape (không lọt HTML thô của dữ liệu người dùng nhập), và không throw khi popup bị
 * chặn — CHỦ Ý không gọi `win.print()` thật trong môi trường test (jsdom không có, và trên trình
 * duyệt thật đây là hộp thoại có thể chặn thao tác tiếp theo — không kiểm bằng browser tự động).
 */

import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, openPrintReport } from '../print-report';

describe('escapeHtml', () => {
  it('escape các ký tự HTML đặc biệt để chữ động không lọt thẻ thô vào trang in', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeHtml('Công ty "ABC" & con')).toBe('Công ty &quot;ABC&quot; &amp; con');
  });

  it('giữ nguyên tiếng Việt có dấu', () => {
    expect(escapeHtml('Nhà xưởng Long An')).toBe('Nhà xưởng Long An');
  });
});

describe('openPrintReport', () => {
  it('ghi đúng tiêu đề và nội dung vào cửa sổ mới, rồi gọi in khi tải xong', () => {
    const write = vi.fn();
    const close = vi.fn();
    const focus = vi.fn();
    const print = vi.fn();
    const fakeWindow = { document: { write, close }, focus, print } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow);

    openPrintReport('Báo cáo lãi/lỗ theo công trình', '<table><tr><td>A</td></tr></table>');

    expect(openSpy).toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('Báo cáo lãi/lỗ theo công trình');
    expect(html).toContain('<table><tr><td>A</td></tr></table>');
    expect(html).toContain('Nhà Việt Group');
    expect(close).toHaveBeenCalledTimes(1);

    // `onload` chỉ được GÁN, chưa gọi — mô phỏng trình duyệt tải xong rồi mới in.
    expect(print).not.toHaveBeenCalled();
    (fakeWindow as unknown as { onload: () => void }).onload();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(print).toHaveBeenCalledTimes(1);

    openSpy.mockRestore();
  });

  it('popup bị chặn (`window.open` trả về null) thì không throw', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openPrintReport('Báo cáo', '<p>nội dung</p>')).not.toThrow();
    openSpy.mockRestore();
  });

  it('tiêu đề có ký tự HTML đặc biệt vẫn được escape trong `<title>`', () => {
    const write = vi.fn();
    const fakeWindow = {
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow);

    openPrintReport('Báo cáo <A & B>', '<p></p>');

    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('<title>Báo cáo &lt;A &amp; B&gt;</title>');

    openSpy.mockRestore();
  });
});
