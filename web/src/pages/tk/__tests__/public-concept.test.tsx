/**
 * Trang khách xem bộ ý tưởng (B5, 0259) — không đăng nhập.
 *
 * Canh: câu «Phương án ý tưởng — chưa phải thiết kế» luôn ở đầu trang và trên TỪNG ảnh (chữ của trang, không in vào
 * ảnh); ảnh không kéo được, không có nút tải; link hết hạn / không có / lỗi mạng nói rõ và chỉ người gửi.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  CONCEPT_CAPTION,
  ConceptView,
  PublicConceptPage,
  type ConceptPayload,
} from '../public-concept';

const TOKEN = 'a'.repeat(36);

function renderView(data: ConceptPayload | null) {
  return render(<ConceptView token={TOKEN} data={data} />);
}

afterEach(() => vi.unstubAllGlobals());

describe('Trang khách xem bộ ý tưởng', () => {
  it('link còn hạn: mỗi ảnh có câu «chưa phải thiết kế», ảnh không kéo được, không có nút tải', () => {
    renderView({
      status: 'ok',
      title: 'Phương án ý tưởng nhà phố 6 × 16 m, 4 tầng',
      expires_at: '2026-11-13T10:00:00Z',
      sender_name: 'Trần Thị B',
      sender_phone: '0912000259',
      images: [
        { key: 'pc-front', group: 'phoi-canh', label: 'Mặt tiền' },
        { key: 'mat-dung', group: 'mat-dung', label: 'Mặt đứng mặt tiền' },
        { key: 'phong-abc', group: 'phong', label: 'Phòng khách' },
      ],
    });
    expect(screen.getByRole('heading', { name: /nhà phố 6 × 16 m, 4 tầng/ })).toBeInTheDocument();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);
    for (const img of images) {
      expect(img).toHaveAttribute('draggable', 'false');
      expect(img.getAttribute('src')).toMatch(new RegExp(`/public/concept/${TOKEN}/image/`));
    }
    expect(screen.getAllByText(CONCEPT_CAPTION)).toHaveLength(3);
    expect(screen.queryByText(/tải về/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /0912000259/ })).toHaveAttribute(
      'href',
      'tel:0912000259',
    );
  });

  it('link hết hạn hoặc đã thu hồi: nói rõ và chỉ người gửi', () => {
    renderView({ status: 'expired', sender_name: 'Trần Thị B', sender_phone: '0912000259' });
    expect(screen.getByText('Link xem phương án đã hết hạn')).toBeInTheDocument();
    expect(screen.getByText(/nhận link mới/)).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('không tìm thấy / lỗi mạng: câu riêng cho từng trường hợp', () => {
    const { unmount } = renderView({ status: 'not_found' });
    expect(screen.getByText('Không tìm thấy phương án')).toBeInTheDocument();
    unmount();
    renderView({ status: 'error' });
    expect(screen.getByText(/Kiểm tra kết nối mạng/)).toBeInTheDocument();
  });

  it('trang đầy đủ: dải «chưa phải thiết kế» luôn hiện, kể cả khi link đã hết hạn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ status: 'expired' }) })),
    );
    render(
      <MemoryRouter initialEntries={[`/xem-y-tuong/${TOKEN}`]}>
        <Routes>
          <Route path="/xem-y-tuong/:token" element={<PublicConceptPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Link xem phương án đã hết hạn')).toBeInTheDocument();
    expect(screen.getByText(CONCEPT_CAPTION)).toBeInTheDocument();
  });
});
