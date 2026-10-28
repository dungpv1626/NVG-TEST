/**
 * Lý do lượt xếp mặt bằng hỏng — dữ liệu là `result.failed` NGUYÊN VĂN của hai lượt chạy thật
 * 23/10/2026 (hồ sơ NVO-TK-2026-THU5): ef5fbffc (lượt cuối sai cấu trúc) và e5ec68a6 (cửa ra ngoài
 * giáp nhà hàng xóm).
 */

import { describe, expect, it } from 'vitest';
import {
  costStopMessage,
  failureViews,
  readableMessage,
  type FailedVariant,
} from '../plan-failure';

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

describe('Dừng vì mức chi phí (T164)', () => {
  it('có `costCap` thì có câu dừng — số kiểu Việt Nam, đúng câu Worker viết; lý do lượt chính vẫn còn', () => {
    const [view] = failureViews(
      [{ ...e5ec68a6, costCap: { capUsd: 0.5, spentUsd: 0.46, reason: 'over' } }],
      LABELS,
    );
    expect(view!.costStop).toBe('Đã dừng vì chạm mức chi phí 0,50 USD (đã tiêu 0,46 USD).');
    expect(view!.groups.length).toBeGreaterThan(0);
  });

  it('không tính được giá lượt trước: câu nói rõ vì sao dừng', () => {
    expect(costStopMessage({ capUsd: 0.5, spentUsd: 0.04, reason: 'unpriced' })).toMatch(
      /không tính được chi phí.*mức chi phí 0,50 USD \(đã tiêu 0,040 USD\)/,
    );
  });

  it('không có `costCap` thì không có câu dừng', () => {
    const [view] = failureViews([e5ec68a6], LABELS);
    expect(view!.costStop).toBeNull();
  });
});

describe('Dừng vì cùng một lỗi chính lặp lại (T174)', () => {
  it('có `earlyStop` thì có câu dừng — mã phòng đổi sang tên, số dấu phẩy', () => {
    const [view] = failureViews(
      [
        {
          ...e5ec68a6,
          earlyStop: {
            reason: 'same_main_issue',
            rounds: 3,
            level: 2,
            message:
              'Đã dừng gọi lại mô hình: 3 lượt liền hỏng cùng một lỗi chính ở tầng 2 — Bản phác tầng 2 vẽ phòng "office_1" chỉ đủ khoảng 14.13 m² — đầu bài khai tối thiểu 17 m². Gọi thêm khó gỡ được mà vẫn tốn tiền; xem lại đầu bài ở chỗ này rồi chạy lại.',
          },
        },
      ],
      LABELS,
    );
    expect(view!.earlyStop).toMatch(/^Đã dừng gọi lại mô hình: 3 lượt liền/);
    expect(view!.earlyStop).toContain('«Phòng làm việc 1»');
    expect(view!.earlyStop).toContain('14,13 m²');
  });

  it('không có `earlyStop` thì không có câu dừng', () => {
    const [view] = failureViews([e5ec68a6], LABELS);
    expect(view!.earlyStop).toBeNull();
  });
});
