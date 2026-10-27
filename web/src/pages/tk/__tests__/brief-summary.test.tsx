/**
 * «Tóm tắt đầu bài» chỉ nêu câu nặng điểm, đọc giá trị bằng chữ, nói rõ câu chưa trả lời và bấm được để tới câu ấy.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BRIEF_FORM, type DesignBriefDraft } from '@nvg/shared/design';
import { BriefSummary, KEY_WEIGHT, briefKeyFacts } from '../brief-summary';

const draft: DesignBriefDraft = {
  building_type: 'nha_pho',
  floors: 4,
  site: { width_m: 5, depth_m: 18 },
};

describe('Tóm tắt đầu bài', () => {
  it('chỉ lấy câu nặng điểm đang hiện, theo cấu hình biểu mẫu', () => {
    const facts = briefKeyFacts(BRIEF_FORM, draft);
    expect(facts.length).toBeGreaterThan(0);
    const weights = new Map(
      BRIEF_FORM.sections.flatMap((s) => s.fields.map((f) => [f.path, f.weight] as const)),
    );
    for (const f of facts) expect(weights.get(f.path)).toBeGreaterThanOrEqual(KEY_WEIGHT);
    // Biệt thự mới hỏi số cánh nhà — nhà phố thì không nêu.
    expect(facts.some((f) => f.path === 'massing.wings_preferred')).toBe(false);
  });

  it('giá trị bằng chữ, câu thiếu ghi «chưa trả lời», bấm thì tới đúng câu', async () => {
    const onJump = vi.fn();
    render(<BriefSummary form={BRIEF_FORM} draft={draft} onJump={onJump} />);
    expect(screen.getByText('Nhà phố')).toBeInTheDocument();
    expect(screen.queryByText('nha_pho')).not.toBeInTheDocument();
    expect(screen.getAllByText('chưa trả lời').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /Loại hình công trình/ }));
    expect(onJump).toHaveBeenCalledWith('cong_trinh_khu_dat', 'building_type');
  });
});
