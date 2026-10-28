/**
 * Nút soạn hồ sơ dự thầu chỉ hiện khi CSDL cũng cho lập (gương `rls_bid_form_writable`, 0236) — hiện rồi báo lỗi là
 * điều CLAUDE.md 5.4 cấm.
 */

import { describe, expect, it } from 'vitest';
import { bidFormEditable } from '../bid-form-composer';

describe('bidFormEditable', () => {
  it('hồ sơ dự thầu: lập được khi chưa nộp; đã nộp / có kết quả thì chỉ xem', () => {
    expect(bidFormEditable('ho_so_du_thau', { stage: 'du_toan', submitted_at: null }, true)).toBe(
      true,
    );
    expect(
      bidFormEditable(
        'ho_so_du_thau',
        { stage: 'nop_thau', submitted_at: '2026-10-27T10:00:00Z' },
        true,
      ),
    ).toBe(false);
    expect(
      bidFormEditable('ho_so_du_thau', { stage: 'truot_thau', submitted_at: null }, true),
    ).toBe(false);
  });

  it('biên bản thương thảo: chỉ khi trúng thầu', () => {
    expect(bidFormEditable('thuong_thao', { stage: 'trung_thau', submitted_at: 'x' }, true)).toBe(
      true,
    );
    expect(bidFormEditable('thuong_thao', { stage: 'nop_thau', submitted_at: 'x' }, true)).toBe(
      false,
    );
  });

  it('không có quyền sửa Đấu thầu thì không bao giờ', () => {
    expect(bidFormEditable('ho_so_du_thau', { stage: 'du_toan', submitted_at: null }, false)).toBe(
      false,
    );
    expect(bidFormEditable('thuong_thao', { stage: 'trung_thau', submitted_at: 'x' }, false)).toBe(
      false,
    );
  });
});
