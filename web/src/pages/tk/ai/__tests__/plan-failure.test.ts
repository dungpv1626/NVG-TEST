/**
 * Lý do lượt xếp mặt bằng hỏng — dữ liệu là `result.failed` NGUYÊN VĂN của hai lượt chạy thật
 * 23/10/2026 (hồ sơ NVO-TK-2026-THU5): ef5fbffc (lượt cuối sai cấu trúc) và e5ec68a6 (cửa ra ngoài
 * giáp nhà hàng xóm).
 */

import { describe, expect, it } from 'vitest';
import { failureViews, readableMessage, type FailedVariant } from '../plan-failure';

const LABELS = { living: 'Phòng khách', wc: 'Khu vệ sinh', office: 'Phòng làm việc' };

const ef5fbffc: FailedVariant = {
  variantId: 'AI-A',
  error:
    'Chưa xếp được mặt bằng: Sai cấu trúc ở rooms: Array must contain at least 1 element(s) (và 1 lỗi khác)',
  reasons: [
    {
      codes: ['answer_unusable'],
      level: 0,
      retry: 'resample',
      attempts: 5,
      messages: [
        'Sai cấu trúc ở rooms: Array must contain at least 1 element(s)',
        'Sai cấu trúc ở sketches: Array must contain at least 1 element(s)',
      ],
    },
  ],
};

const e5ec68a6: FailedVariant = {
  variantId: 'AI-A',
  error: 'Chưa xếp được tầng 1: …',
  reasons: [
    {
      codes: ['door_outside_on_boundary', 'entrance_wrong_side'],
      level: 1,
      retry: 'unchanged',
      attempts: 4,
      messages: [
        'Cửa ra ngoài của "living_1" ở tầng 1 chỉ đặt được trên cạnh giáp nhà hàng xóm hoặc ranh đất — không đi ra được.',
        'Đầu bài đặt lối vào chính ở mặt trước, nhưng tầng 1 không có cửa ra ngoài nào (trừ cửa xe) ở mặt đó.',
      ],
      firstMessages: ['Phòng "wc_1" ở tầng 1 chỉ giáp ô thang "stair_1".'],
    },
  ],
};

describe('readableMessage', () => {
  it('mã phòng thành tên phòng, số thập phân dấu phẩy', () => {
    expect(
      readableMessage(
        'Phòng "office_1" rộng 8.96 m², ô 2.46 × 8.64 m; "stair_1" giữ nguyên',
        LABELS,
      ),
    ).toBe('Phòng «Phòng làm việc 1» rộng 8,96 m², ô 2,46 × 8,64 m; "stair_1" giữ nguyên');
  });
});

describe('failureViews', () => {
  it('lượt cuối có lý do thật: tên phòng, tầng, gợi ý lối vào', () => {
    const [view] = failureViews([e5ec68a6], LABELS);
    expect(view!.round).toBeNull();
    expect(view!.attempts).toBe(4);
    expect(view!.groups[0]!.title).toBe('Tầng 1');
    expect(view!.groups[0]!.messages[0]).toContain('«Phòng khách 1»');
    expect(view!.hints.join(' ')).toMatch(/Lối vào chính đặt ở mặt nào/);
    expect(view!.lastUnusable).toBe(false);
  });

  it('lượt chạy cũ, lượt cuối sai cấu trúc: nói thẳng ra và gợi ý chạy lại / đổi model', () => {
    const [view] = failureViews([ef5fbffc], LABELS);
    expect(view!.lastUnusable).toBe(true);
    expect(view!.hints.join(' ')).toMatch(/chọn model khác/);
  });

  it('có lượt chính (Worker mới): dùng lý do lượt ấy, không dùng câu sai cấu trúc', () => {
    const [view] = failureViews(
      [
        {
          ...ef5fbffc,
          main: {
            round: 3,
            levels: [
              {
                level: 1,
                messages: [
                  'Phòng "office_1" ở tầng 1 không có lối vào.',
                  'Phòng "office_1" ở tầng 1 rộng 8.96 m², dưới mức tối thiểu 10 m².',
                ],
                codes: ['requires_access', 'min_area'],
              },
            ],
          },
        },
      ],
      LABELS,
    );
    expect(view!.round).toBe(3);
    expect(view!.lastUnusable).toBe(false);
    const text = view!.groups.flatMap((g) => g.messages).join(' ');
    expect(text).toContain('«Phòng làm việc 1»');
    expect(text).toContain('8,96 m²');
    expect(text).not.toMatch(/Sai cấu trúc/);
    expect(view!.hints.some((h) => h.startsWith('Diện tích'))).toBe(true);
    expect(view!.hints.some((h) => h.startsWith('Lối đi'))).toBe(true);
  });
});
