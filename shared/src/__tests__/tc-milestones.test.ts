import { describe, expect, it } from 'vitest';
import { MILESTONE_SET_SEEDS, NVO_MILESTONE_SET, milestoneDisplayStatus } from '../tc-milestones';

describe('Bộ mốc thi công (2A)', () => {
  it('NVO đúng 7 mốc theo công thức vận hành của Quy chuẩn, khoá không trùng', () => {
    expect(NVO_MILESTONE_SET.steps.map((s) => s.key)).toEqual([
      'dinh_vi',
      'mong',
      'ket_cau',
      'xay_trat_mep',
      'chong_tham',
      'hoan_thien',
      'kiem_tra_cl',
    ]);
    for (const set of MILESTONE_SET_SEEDS) {
      const names = set.steps.map((s) => s.checklistName);
      expect(new Set(names).size).toBe(names.length);
      for (const step of set.steps) {
        const keys = step.items.map((i) => i.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(step.items.length).toBeGreaterThan(0);
      }
    }
  });

  it('móng, kết cấu, MEP âm, chống thấm, hoàn thiện cần lớp kỹ thuật (chuẩn 05) và có mục cần ảnh', () => {
    for (const key of ['mong', 'ket_cau', 'xay_trat_mep', 'chong_tham', 'hoan_thien']) {
      const step = NVO_MILESTONE_SET.steps.find((s) => s.key === key)!;
      expect(step.requiresTechnicalCheck).toBe(true);
      expect(step.items.some((i) => i.requires_photo)).toBe(true);
    }
  });

  it('trạng thái hiển thị: quá hạn khi qua ngày dự kiến mà chưa đạt; mốc chưa tới không quá hạn', () => {
    const today = '2026-10-18';
    expect(milestoneDisplayStatus('dat', '2026-01-01', today)).toBe('completed');
    expect(milestoneDisplayStatus('dang_lam', '2026-10-17', today)).toBe('overdue');
    expect(milestoneDisplayStatus('cho_ky_thuat', '2026-10-17', today)).toBe('overdue');
    expect(milestoneDisplayStatus('cho_ky_thuat', '2026-10-30', today)).toBe('pending_approval');
    expect(milestoneDisplayStatus('dang_lam', null, today)).toBe('in_progress');
    expect(milestoneDisplayStatus('cho_lam', '2026-10-01', today)).toBe('draft');
  });
});
