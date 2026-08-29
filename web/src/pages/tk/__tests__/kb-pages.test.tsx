/**
 * Hai màn hình Knowledge Base — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Ngoài "không vỡ khi vẽ", mỗi phép thử khẳng định một điều NGƯỜI DÙNG thấy:
 *
 *  - Hàng chờ chú giải nói ngay còn bao nhiêu việc, và bản ghi chưa chú giải xếp lên trước.
 *  - Bản ghi không dựng được cây chia không gian hiện rõ "Chỉ thống kê" — nó vẫn có ích,
 *    chỉ là không dùng làm mẫu cho mô hình.
 *  - Trạng thái chú giải hiện bằng CHỮ, không chỉ bằng màu (CGD 6.8).
 *  - Màn hình chú giải nói TRƯỚC rằng chữ tự do không rời khỏi hệ thống — người nhập cần
 *    biết trước khi gõ, không phải sau khi bấm lưu.
 *  - Ô chữ tự do chỉ mở khi chọn "Khác": mục 6.1 Bước 3 nói thẳng "đừng bắt KTS viết luận".
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Lê Văn C', assignments: [], permissions: [] },
  }),
  useCan: () => true,
}));

vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({
    companyId: 'nvo-id',
    companyCode: 'NVO',
    isAggregate: false,
    isReady: true,
  }),
  withCompanyScope: <Q,>(q: Q) => q,
}));

const ROWS = [
  {
    id: 'kb-2',
    company_id: 'nvo-id',
    project_code: 'NVO-TK-2026-0002',
    building_type: 'nha_pho',
    floors: 3,
    quality_score: 0.91,
    site_width_m: 5,
    site_depth_m: 18,
    has_rationale: false,
    has_slicing_tree: false,
    created_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'kb-1',
    company_id: 'nvo-id',
    project_code: 'NVO-TK-2026-0001',
    building_type: 'nha_pho',
    floors: 4,
    quality_score: 0.84,
    site_width_m: 5,
    site_depth_m: 20,
    has_rationale: true,
    has_slicing_tree: true,
    created_at: '2026-08-02T00:00:00Z',
  },
];

const DETAIL = {
  ...ROWS[0]!,
  checks: [],
  source_files: [],
  payload: {
    project_code: 'NVO-TK-2026-0002',
    building_type: 'nha_pho',
    floors: 1,
    site: { width_m: 5, depth_m: 18 },
    floor_plans: [
      {
        level: 1,
        rooms: [
          {
            type: 'living',
            label_raw: 'PK',
            polygon: [
              [0, 0],
              [5, 0],
              [5, 6],
              [0, 6],
            ],
            area_m2: 30,
          },
        ],
      },
    ],
    slicing_tree: null,
    rationale: null,
    outcome: null,
    extraction_warnings: [{ code: 'nhan_thieu', detail: 'Một phòng không có nhãn.' }],
  },
};

vi.mock('@/hooks/use-kb-records', () => ({
  useKbRecords: () => ({ data: ROWS, isLoading: false, error: null, refetch: vi.fn() }),
  useKbRecord: () => ({ data: DETAIL, isLoading: false, error: null, refetch: vi.fn() }),
  useAnnotateKbRecord: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
  }),
}));

describe('Hàng chờ chú giải hồ sơ cũ', () => {
  it('nói ngay còn bao nhiêu hồ sơ chờ chú giải', async () => {
    const { KbListPage } = await import('../kb-list');
    renderWithApp(<KbListPage />);
    expect(await screen.findByText(/2 hồ sơ trong kho, 1 hồ sơ còn chờ chú giải/)).toBeTruthy();
  });

  it('hiện trạng thái chú giải bằng chữ, không chỉ bằng màu', async () => {
    const { KbListPage } = await import('../kb-list');
    renderWithApp(<KbListPage />);
    // Bảng vẽ hai lần — thẻ cho di động và bảng cho máy tính — nên dùng `findAllByText`.
    expect(await screen.findAllByText('Chờ chú giải')).not.toHaveLength(0);
    expect(screen.getAllByText('Đã chú giải')).not.toHaveLength(0);
  });

  it('bản ghi không dựng được cây chia không gian hiện rõ là chỉ dùng thống kê', async () => {
    const { KbListPage } = await import('../kb-list');
    renderWithApp(<KbListPage />);
    expect(await screen.findAllByText('Chỉ thống kê')).not.toHaveLength(0);
  });
});

describe('Màn hình chú giải', () => {
  it('vẽ mặt bằng đã trích và nêu chỗ trích chưa chắc chắn', async () => {
    const { KbAnnotatePage } = await import('../kb-annotate');
    renderWithApp(<KbAnnotatePage />);
    expect(await screen.findByRole('img', { name: /Mặt bằng tầng 1/ })).toBeTruthy();
    expect(screen.getByText('Một phòng không có nhãn.')).toBeTruthy();
  });

  it('nói TRƯỚC rằng chữ tự do không rời khỏi hệ thống', async () => {
    const { KbAnnotatePage } = await import('../kb-annotate');
    renderWithApp(<KbAnnotatePage />);
    expect(await screen.findByText(/chữ tự do chỉ lưu trong hệ thống/i)).toBeTruthy();
  });

  it('ô chữ tự do chỉ mở khi chọn "Khác"', async () => {
    // Bước 3 chỉ có ý nghĩa nếu nó mất 10–15 phút. Mở sẵn ô chữ cho cả năm câu là quay về
    // đúng thứ tài liệu bảo tránh: bắt kiến trúc sư viết luận.
    const { KbAnnotatePage } = await import('../kb-annotate');
    renderWithApp(<KbAnnotatePage />);
    const question = await screen.findByText('Vì sao cầu thang đặt ở vị trí này?');
    const group = question.closest('fieldset')!;

    expect(group.querySelector('input')).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: 'Khác' })[0]!);
    expect(group.querySelector('input')).not.toBeNull();
  });

  it('mọi nút chọn đạt vùng bấm 40px cho ngón tay', async () => {
    const { KbAnnotatePage } = await import('../kb-annotate');
    const { container } = renderWithApp(<KbAnnotatePage />);
    await screen.findByText('Vì sao cầu thang đặt ở vị trí này?');
    const chips = [...container.querySelectorAll('fieldset button')];
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) expect(chip.className).toContain('min-h-10');
  });
});
