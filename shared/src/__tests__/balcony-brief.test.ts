/**
 * T91 (Haan 27/09/2026): ban công khai theo mặt bắt buộc / mặt có thể, độ đua từng mặt; đua sang đất
 * người khác bị CHẶN ở bước soát đầu bài, đua ra đường chỉ cảnh báo.
 */

import { describe, expect, it } from 'vitest';
import { BRIEF_FORM, balconySides, checkBriefConsistency, projectionOver } from '../design';
import type { DesignBriefDraft } from '../design';

describe('balconySides — một cách đọc cho đầu bài mới lẫn cũ', () => {
  it('đầu bài mới: bắt buộc, có thể (bỏ trùng), độ đua từng mặt; trống = chưa trả lời', () => {
    const view = balconySides({
      required_sides: ['front', 'left'],
      optional_sides: ['left', 'back'],
      projection_by_side: { front: 1.2, left: 0 },
    });
    expect(view.required).toEqual(['front', 'left']);
    expect(view.optional).toEqual(['back']);
    expect(view.projection).toEqual({ front: 1.2, left: 0, back: null });
    expect(view.legacy).toBe(false);
  });

  it('đầu bài cũ: `sides` đọc là bắt buộc, một con số chung cho mọi mặt đã khai', () => {
    expect(
      balconySides({ sides: ['front', 'back'], projection_over_boundary: true, projection_m: 1 }),
    ).toEqual({
      required: ['front', 'back'],
      optional: [],
      projection: { front: 1, back: 1 },
      legacy: true,
    });
    expect(balconySides({ sides: ['front'], projection_over_boundary: false }).projection).toEqual({
      front: 0,
    });
    expect(balconySides({ sides: ['left'] }).projection).toEqual({ left: null });
  });

  it('không có ban công nào khai thì rỗng', () => {
    expect(balconySides(null)).toEqual({
      required: [],
      optional: [],
      projection: {},
      legacy: false,
    });
  });

  it('hiện trạng phía đua sang: nhà hàng xóm, đất trống là đất người khác; đường, hẻm, ao hồ là công', () => {
    expect(projectionOver('nha_hang_xom')).toBe('private');
    expect(projectionOver('dat_trong')).toBe('private');
    expect(projectionOver('duong_lon')).toBe('public');
    expect(projectionOver('hem_3m')).toBe('public');
    expect(projectionOver('ao_ho')).toBe('public');
    expect(projectionOver(null)).toBeNull();
  });
});

describe('soát đầu bài: ban công đua vượt ranh đất (T91, sửa 27/09/2026)', () => {
  // Khoảng lùi: trước 4 m, trái 3 m (quy hoạch); sau 0; phải chưa khai. Sân mong muốn mặt sau 1,5 m.
  const draft = (projection: Record<string, number>): DesignBriefDraft =>
    ({
      // Biệt thự: ô khoảng lùi và chiều sâu sân chỉ hiện với biệt thự / nhà vườn.
      building_type: 'biet_thu',
      site: {
        adjacent: { front: 'duong_lon', back: 'dat_trong', left: 'hem_3m', right: 'nha_hang_xom' },
        road_width_m: 12,
        setback_required_m: { front: 4, left: 3, back: 0 },
      },
      massing: { yard_depth_m: { back: 1.5 } },
      balconies: {
        scope: 'theo_tung_phong',
        required_sides: ['front', 'back'],
        optional_sides: ['left', 'right'],
        projection_by_side: projection,
      },
    }) as DesignBriefDraft;
  const issues = (projection: Record<string, number>) =>
    checkBriefConsistency(draft(projection), BRIEF_FORM).filter((i) =>
      i.code.startsWith('ban_cong'),
    );

  it('đua không quá khoảng lùi thì vẫn trong đất nhà mình — không báo gì (Haan: phía trước còn khoảng lùi rộng)', () => {
    expect(issues({ front: 1, left: 1 })).toEqual([]);
  });

  it('đua vượt khoảng lùi sang đất trống phía sau → nghiêm trọng (chặn lượt chạy)', () => {
    const found = issues({ back: 2 });
    expect(found.map((i) => [i.code, i.severity])).toEqual([
      ['ban_cong_dua_sang_dat_khac', 'nghiem_trong'],
    ]);
    expect(found[0]!.message).toMatch(/vượt khoảng lùi 1.5 m nên lấn 0.5 m/);
  });

  it('đua vượt khoảng lùi ra đường → chỉ cảnh báo', () => {
    const found = issues({ front: 5 });
    expect(found.map((i) => [i.code, i.severity])).toEqual([['ban_cong_dua_ra_duong', 'canh_bao']]);
  });

  it('chưa khai khoảng lùi mặt ấy → cảnh báo chưa rõ, KHÔNG chặn', () => {
    const found = issues({ right: 1 });
    expect(found.map((i) => [i.code, i.severity])).toEqual([
      ['ban_cong_dua_chua_ro_khoang_lui', 'canh_bao'],
    ]);
  });

  it('khai độ đua cho mặt không có ban công → cảnh báo, không chặn', () => {
    const d = draft({ front: 1 });
    d.balconies!.optional_sides = [];
    d.balconies!.projection_by_side = { front: 1, left: 0.5 };
    const codes = checkBriefConsistency(d, BRIEF_FORM).map((i) => i.code);
    expect(codes).toContain('ban_cong_dua_mat_khong_co');
  });
});
