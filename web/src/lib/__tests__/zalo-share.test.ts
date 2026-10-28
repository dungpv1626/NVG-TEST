/**
 * Gửi qua Zalo cá nhân (0238) — phần tính toán: chuẩn hoá số, địa chỉ zalo.me, chọn đường điện thoại / máy
 * tính, lời nhắn có hạn link.
 */

import { describe, expect, it } from 'vitest';
import { composeZaloMessage, normalizeZaloPhone, zaloChatUrl, zaloSendMode } from '../zalo-share';

describe('normalizeZaloPhone', () => {
  it('đưa mọi cách viết về 0 + 9 chữ số', () => {
    expect(normalizeZaloPhone('0912 345 678')).toBe('0912345678');
    expect(normalizeZaloPhone('0912.345.678')).toBe('0912345678');
    expect(normalizeZaloPhone('+84 912 345 678')).toBe('0912345678');
    expect(normalizeZaloPhone('84912345678')).toBe('0912345678');
    expect(normalizeZaloPhone('0084912345678')).toBe('0912345678');
    // Excel rơi số 0 đầu.
    expect(normalizeZaloPhone('912345678')).toBe('0912345678');
  });

  it('số không hợp lệ thì null — không mở nhầm người', () => {
    expect(normalizeZaloPhone(null)).toBeNull();
    expect(normalizeZaloPhone('')).toBeNull();
    expect(normalizeZaloPhone('12345')).toBeNull();
    expect(normalizeZaloPhone('00912345678')).toBeNull();
    expect(normalizeZaloPhone('091234567890')).toBeNull();
  });
});

describe('zaloChatUrl', () => {
  it('có số thì mở đúng cửa sổ chat, không có thì trang chính', () => {
    expect(zaloChatUrl('+84 912 345 678')).toBe('https://zalo.me/0912345678');
    expect(zaloChatUrl(null)).toBe('https://zalo.me/');
    expect(zaloChatUrl('abc')).toBe('https://zalo.me/');
  });
});

describe('zaloSendMode', () => {
  it('chỉ máy cảm ứng có bảng chia sẻ mới đi bảng chia sẻ', () => {
    expect(zaloSendMode({ coarsePointer: true, hasShare: true })).toBe('touch');
    // Chrome trên Windows có navigator.share nhưng là máy tính.
    expect(zaloSendMode({ coarsePointer: false, hasShare: true })).toBe('desktop');
    expect(zaloSendMode({ coarsePointer: true, hasShare: false })).toBe('desktop');
  });
});

describe('composeZaloMessage', () => {
  it('lời nhắn có tên khách, pháp nhân, link và ngày hết hạn dd/mm/yyyy', () => {
    const text = composeZaloMessage({
      recipientName: 'Ông Trần Văn Phát',
      companyName: 'Nhà Việt Cons',
      subject: 'bản hợp đồng đã ký số 12/2026',
      link: { url: 'https://x/xem-ban-ky/abc', expiresAt: '2026-11-05T16:59:59.000Z' },
    });
    expect(text).toBe(
      [
        'Kính gửi Ông Trần Văn Phát,',
        'Nhà Việt Cons gửi bản hợp đồng đã ký số 12/2026.',
        'Xem tại: https://x/xem-ban-ky/abc (link có hiệu lực tới 05/11/2026).',
        'Trân trọng.',
      ].join('\n'),
    );
  });

  it('thiếu tên thì «Quý khách»; kèm tệp thì nhắc tệp đính kèm; không đại từ nhân xưng', () => {
    const text = composeZaloMessage({
      recipientName: null,
      companyName: null,
      subject: 'báo giá NVC-BG-2026-0001',
      details: 'Giá trị báo giá: 1.000.000 đồng.',
      withFile: true,
    });
    expect(text.startsWith('Kính gửi Quý khách,')).toBe(true);
    expect(text).toContain('Nhà Việt Group gửi báo giá NVC-BG-2026-0001.');
    expect(text).toContain('Tệp đính kèm');
    expect(text.toLowerCase()).not.toMatch(/chúng tôi|\btôi\b|\bbạn\b/);
  });
});
