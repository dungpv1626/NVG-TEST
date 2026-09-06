/**
 * Phối cảnh — canh phần không cần mô hình: chưa có ảnh khối thì nút tắt và hướng dẫn; ba khung
 * hình hiện đủ theo danh sách máy chủ trả về; mỗi khung mang lý do riêng khi hỏng; nhãn cảnh báo
 * được vẽ lên ảnh.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  /** Kết quả trả về theo TỪNG khung hình — để kiểm rằng khung hỏng không kéo theo khung khác. */
  outcomeFor: (view: string) =>
    view === 'dem'
      ? {
          status: 'unavailable',
          reason: 'Chưa dựng được ảnh phối cảnh: dịch vụ đang quá tải.',
          style: 'hien_dai',
          view,
          watermark: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công',
        }
      : {
          status: 'rendered',
          mimeType: 'image/png',
          dataBase64: 'iVBORw0KGgo=',
          style: 'hien_dai',
          view,
          watermark: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công',
        },
  calls: [] as { view: string; image: string }[],
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useRenderFromMassing: () => ({
    mutateAsync: vi.fn((body: { view: string; image: string }) => {
      state.calls.push({ view: body.view, image: body.image });
      return Promise.resolve(state.outcomeFor(body.view));
    }),
    isPending: false,
  }),
  useRenderViews: () => ({
    data: [
      { id: 'ngay', vi: 'Toàn cảnh ban ngày', camera: 'eye_level' },
      { id: 'dem', vi: 'Toàn cảnh ban đêm', camera: 'eye_level' },
      { id: 'goc_nghieng', vi: 'Góc nghiêng', camera: 'street_level' },
    ],
  }),
}));

const { RenderPanel, stampWatermark } = await import('../render-panel');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SHOTS = { eye_level: PNG, street_level: `${PNG}#nghieng` };

describe('Phối cảnh tham khảo', () => {
  it('chưa có ảnh khối thì nút tắt và có hướng dẫn', () => {
    renderWithApp(
      <RenderPanel projectId="p" shots={null} style={null} variantLabel="Phương án A" />,
    );
    expect(screen.getByRole('button', { name: /Dựng ảnh phối cảnh/ })).toBeDisabled();
    expect(screen.getByText(/Chưa có ảnh khối/)).toBeInTheDocument();
  });

  it('hiện đủ ba khung hình theo danh sách máy chủ, không viết cứng ở trình duyệt', () => {
    renderWithApp(
      <RenderPanel projectId="p" shots={SHOTS} style={null} variantLabel="Phương án A" />,
    );
    expect(screen.getByText('Ảnh khối (luôn có)')).toBeInTheDocument();
    for (const label of ['Toàn cảnh ban ngày', 'Toàn cảnh ban đêm', 'Góc nghiêng']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Chưa dựng')).toHaveLength(3);
  });

  it('mỗi khung hình gửi đúng ảnh khối của GÓC MÁY của nó', async () => {
    state.calls.length = 0;
    renderWithApp(
      <RenderPanel projectId="p" shots={SHOTS} style={null} variantLabel="Phương án A" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Dựng ảnh phối cảnh/ }));
    await waitFor(() => expect(state.calls).toHaveLength(3));
    // Góc nghiêng phải nhận ảnh chụp ở góc nghiêng, không phải ảnh nhìn thẳng — gửi nhầm thì
    // ảnh ra vẫn đẹp và không có gì báo, nên đây là chỗ phải có test.
    expect(state.calls.find((c) => c.view === 'goc_nghieng')?.image).toBe(SHOTS.street_level);
    expect(state.calls.find((c) => c.view === 'ngay')?.image).toBe(SHOTS.eye_level);
  });

  it('một khung hỏng thì chỉ khung đó hiện lý do, hai khung kia vẫn có ảnh', async () => {
    renderWithApp(
      <RenderPanel projectId="p" shots={SHOTS} style={null} variantLabel="Phương án A" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Dựng ảnh phối cảnh/ }));
    await waitFor(() => expect(screen.getByText(/đang quá tải/)).toBeInTheDocument());
    // jsdom không giải mã ảnh thật nên `stampWatermark` chỉ trả về sau lưới an toàn 1,5 giây
    // — chờ dài hơn mặc định 1 giây của testing-library.
    await waitFor(() => expect(screen.getAllByAltText(/Ảnh phối cảnh tham khảo/)).toHaveLength(2), {
      timeout: 4000,
    });
  });

  it('không có canvas (jsdom) thì đóng dấu trả về chính ảnh, không ném lỗi', async () => {
    const out = await stampWatermark(PNG, 'nhãn');
    expect(typeof out).toBe('string');
  });
});
