/**
 * Trang khách xem bộ ý tưởng (B5, 0259) — không đăng nhập.
 *
 * Canh: câu «Phương án ý tưởng — chưa phải thiết kế» luôn ở đầu trang và trên TỪNG ảnh (chữ của trang, không in vào
 * ảnh); ảnh không kéo được, không có nút tải; link hết hạn / không có / lỗi mạng nói rõ và chỉ người gửi.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  CONCEPT_CAPTION,
  ConceptView,
  PublicConceptPage,
  conceptSections,
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

  const PALETTE = { stroke: '#5B6470', text: '#1F2933', passage: '#F7F7F5' };
  const TOUR: ConceptPayload = {
    status: 'ok',
    title: 'Phương án ý tưởng nhà phố 6 × 16 m, 2 tầng',
    images: [
      { key: 'pc-oblique', group: 'phoi-canh', label: 'Góc nghiêng' },
      { key: 'pc-front_day', group: 'phoi-canh', label: 'Mặt tiền ban ngày', hero: true },
      { key: 'phong-a', group: 'phong', label: 'Phòng khách' },
      { key: 'phong-b', group: 'phong', label: 'Phòng ngủ có WC riêng' },
    ],
    tour: {
      diagrams: true,
      palette: PALETTE,
      floors: [
        {
          level: 1,
          summary: 'Tầng 1: chỗ để xe, phòng khách.',
          diagram: {
            aspect: 0.6,
            rows: [
              {
                share: 0.5,
                passage: 0,
                cells: [
                  { label: 'Để xe', fill: '#E5E7EB', share: 0.5, images: [] },
                  { label: 'Phòng khách', fill: '#FDE7C8', share: 0.5, images: ['phong-a'] },
                ],
              },
              {
                share: 0.5,
                passage: 0.3,
                cells: [{ label: 'Thang bộ', fill: '#EDE4F3', share: 0.7, images: [] }],
              },
            ],
          },
          images: ['phong-a'],
        },
        {
          level: 2,
          summary: 'Tầng 2 dành cho ông bà: phòng ngủ có WC riêng.',
          diagram: null,
          images: ['phong-b'],
        },
      ],
      others: [],
    },
  };

  it('đi xem theo tầng: bên ngoài trước (mặt tiền đứng đầu), mỗi tầng có câu tóm tắt và ảnh phòng', () => {
    renderView(TOUR);
    const outside = document.getElementById('ben-ngoai')!;
    const outsideImgs = within(outside).getAllByRole('img');
    expect(outsideImgs[0]).toHaveAttribute('alt', 'Mặt tiền ban ngày');
    expect(screen.getByRole('heading', { name: 'Tầng 1' })).toBeInTheDocument();
    expect(screen.getByText('Tầng 2 dành cho ông bà: phòng ngủ có WC riêng.')).toBeInTheDocument();
    expect(
      within(document.getElementById('tang-2')!).getByAltText('Phòng ngủ có WC riêng'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mặt đường')).toBeInTheDocument();
    expect(screen.getByText('Lối đi')).toBeInTheDocument();
    // Không số đo nào trên sơ đồ.
    expect(document.getElementById('tang-1')!.textContent).not.toMatch(/\d\s*(m²|m|cm)/);
    expect(screen.getAllByText(CONCEPT_CAPTION)).toHaveLength(4);
    expect(conceptSections(TOUR).map((s) => s.title)).toEqual(['Bên ngoài', 'Tầng 1', 'Tầng 2']);
  });

  it('bấm khối có ảnh trên sơ đồ: mở ảnh phòng kèm câu «chưa phải thiết kế»; khối không ảnh không bấm được', () => {
    renderView(TOUR);
    expect(screen.queryByRole('button', { name: /Để xe/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh Phòng khách' }));
    const dialog = screen.getByRole('dialog', { name: 'Phòng khách' });
    const img = within(dialog).getByRole('img');
    expect(img.getAttribute('src')).toMatch(new RegExp(`/public/concept/${TOKEN}/image/phong-a$`));
    expect(img).toHaveAttribute('draggable', 'false');
    expect(within(dialog).getByText(CONCEPT_CAPTION)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('đầu bài không vừa lô: không có sơ đồ, vẫn có câu tóm tắt và ảnh theo tầng', () => {
    renderView({
      ...TOUR,
      tour: {
        ...TOUR.tour!,
        diagrams: false,
        floors: TOUR.tour!.floors.map((f) => ({ ...f, diagram: null })),
      },
    });
    expect(screen.queryByText('Mặt đường')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Tầng 1: chỗ để xe, phòng khách.')).toBeInTheDocument();
    expect(
      within(document.getElementById('tang-1')!).getByAltText('Phòng khách'),
    ).toBeInTheDocument();
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
