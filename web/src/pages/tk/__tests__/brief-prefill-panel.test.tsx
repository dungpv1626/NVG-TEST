/**
 * «Điền sẵn từ khảo sát»: máy chỉ đề xuất; câu đã có câu trả lời không chọn sẵn; áp đúng những câu đã chọn.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/ai-api', () => ({
  prefillBrief: vi.fn(async () => ({
    accepted: [
      {
        path: 'site.width_m',
        label: 'Chiều rộng mặt tiền',
        sectionId: 'cong_trinh_khu_dat',
        sectionTitle: 'Công trình và khu đất',
        value: 5,
        display: '5 m',
        quote: 'Lô rộng 5 m',
      },
      {
        path: 'style',
        label: 'Phong cách kiến trúc',
        sectionId: 'mat_dung',
        sectionTitle: 'Phong cách, vật liệu và mặt ngoài',
        value: 'hien_dai',
        display: 'Hiện đại',
        quote: 'Thích hiện đại',
      },
    ],
    rejected: [{ path: 'floors', value: '40', reason: 'Số nằm ngoài khoảng của câu này.' }],
    used: { design_survey: true, transcripts: 2, crm_survey: false, crm_linked: true },
    fake: false,
  })),
}));

describe('BriefPrefillPanel', () => {
  it('không chọn sẵn câu đã có câu trả lời, áp đúng câu đã chọn', async () => {
    const { BriefPrefillPanel } = await import('../brief-prefill-panel');
    const { prefillBrief } = await import('@/lib/ai-api');
    const onApply = vi.fn();
    render(
      <BriefPrefillPanel
        request={prefillBrief('p1')}
        draft={{ style: 'tan_co_dien' }}
        onApply={onApply}
        onClose={() => {}}
      />,
    );
    const width = await screen.findByRole('checkbox', { name: /Chiều rộng mặt tiền/ });
    const style = screen.getByRole('checkbox', { name: /Phong cách kiến trúc/ });
    expect(width).toBeChecked();
    expect(style).not.toBeChecked();
    expect(screen.getByText(/Đầu bài đã có câu trả lời cho câu này/)).toBeTruthy();
    expect(screen.getByText(/2 đoạn ghi âm đã chép chữ/)).toBeTruthy();
    expect(screen.getByText(/chưa có báo cáo khảo sát đã duyệt/)).toBeTruthy();
    expect(screen.getByText(/1 đề xuất bị loại/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Áp 1 câu vào đầu bài' }));
    expect(onApply).toHaveBeenCalledWith([{ path: 'site.width_m', value: 5 }]);
  });
});
