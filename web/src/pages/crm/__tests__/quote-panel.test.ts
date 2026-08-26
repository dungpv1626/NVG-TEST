/**
 * Bản báo giá nào đang HIỆU LỰC với khách hàng.
 *
 * Lỗi đã có thật: nhãn "Đang hiệu lực" gắn theo `is_current_version`, tức là "bản mới nhất".
 * Content Guidelines 4.4 ghi thẳng rằng "Đang hiệu lực" KHÔNG được dùng theo nghĩa "Mới nhất",
 * và đây là lý do: khi đang soạn phiên bản kế tiếp, bản mới nhất là tờ nháp chưa ai ngoài công
 * ty nhìn thấy, còn con số khách hàng đang cầm vẫn là bản gửi trước đó. Trên một hồ sơ thật,
 * nhãn đó đã chỉ vào 8,35 tỷ trong khi giá khách đã chấp thuận là 8,5 tỷ.
 */

import { describe, expect, it } from 'vitest';
import { findEffectiveQuoteId } from '../quote-panel';

const quote = (id: string, version: number, sentAt: string | null) => ({
  id,
  version,
  sent_to_customer_at: sentAt,
});

describe('findEffectiveQuoteId', () => {
  it('bản nháp mới nhất KHÔNG cướp nhãn của bản đã gửi khách', () => {
    const list = [quote('v2-nhap', 2, null), quote('v1-da-gui', 1, '2026-08-25T14:26:00Z')];
    expect(findEffectiveQuoteId(list)).toBe('v1-da-gui');
  });

  it('gửi bản mới cho khách thì hiệu lực chuyển sang bản đó', () => {
    const list = [
      quote('v2-da-gui', 2, '2026-08-26T09:00:00Z'),
      quote('v1-da-gui', 1, '2026-08-25T14:26:00Z'),
    ];
    expect(findEffectiveQuoteId(list)).toBe('v2-da-gui');
  });

  it('chưa gửi bản nào thì chưa có giá nào có hiệu lực', () => {
    expect(findEffectiveQuoteId([quote('v1-nhap', 1, null)])).toBeNull();
    expect(findEffectiveQuoteId([])).toBeNull();
  });

  it('chọn theo SỐ PHIÊN BẢN, không phụ thuộc thứ tự danh sách trả về', () => {
    const list = [
      quote('v1', 1, '2026-08-20T00:00:00Z'),
      quote('v3', 3, '2026-08-26T00:00:00Z'),
      quote('v2', 2, '2026-08-22T00:00:00Z'),
    ];
    expect(findEffectiveQuoteId(list)).toBe('v3');
  });
});
