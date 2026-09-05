/**
 * Phối cảnh — canh phần không cần mô hình: chưa có ảnh khối thì nút tắt và hướng dẫn; tuyến
 * tắt thì hiện lý do bằng tiếng Việt và ảnh khối vẫn còn; nhãn cảnh báo được vẽ lên ảnh.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  outcome: {
    status: 'unavailable',
    reason: 'Tuyến phối cảnh đang tắt — khoá Gemini gói miễn phí không có hạn mức sinh ảnh.',
    style: 'hien_dai',
    watermark: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công',
  } as unknown,
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useRenderFromMassing: () => ({
    mutateAsync: vi.fn(() => Promise.resolve(state.outcome)),
    isPending: false,
  }),
}));

const { RenderPanel, stampWatermark } = await import('../render-panel');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Phối cảnh tham khảo', () => {
  it('chưa có ảnh khối thì nút tắt và có hướng dẫn', () => {
    renderWithApp(
      <RenderPanel projectId="p" snapshot={null} style={null} variantLabel="Phương án A" />,
    );
    expect(screen.getByRole('button', { name: /Dựng ảnh phối cảnh/ })).toBeDisabled();
    expect(screen.getByText(/Chưa có ảnh khối/)).toBeInTheDocument();
  });

  it('tuyến tắt thì nói lý do bằng tiếng Việt và giữ ảnh khối', async () => {
    renderWithApp(
      <RenderPanel projectId="p" snapshot={PNG} style={null} variantLabel="Phương án A" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Dựng ảnh phối cảnh/ }));
    await waitFor(() => expect(screen.getByText(/đang tắt/)).toBeInTheDocument());
    expect(screen.getByText('Ảnh khối (luôn có)')).toBeInTheDocument();
    expect(screen.getByText('Chưa dựng')).toBeInTheDocument();
  });

  it('không có canvas (jsdom) thì đóng dấu trả về chính ảnh, không ném lỗi', async () => {
    const out = await stampWatermark(PNG, 'nhãn');
    expect(typeof out).toBe('string');
  });
});
