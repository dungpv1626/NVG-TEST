/**
 * Yêu cầu làm rõ (RFI, 0154) và bản vẽ điều chỉnh sau bàn giao — phía giao diện.
 *
 * CSDL mới là nơi quyết (phép thử `db/src/__tests__/tk-tc-lam-ro.test.ts`); ở đây canh những gì
 * người dùng thấy: không mời gửi tới Thiết kế khi công trình không gắn hồ sơ thiết kế, hạn trả lời là
 * bắt buộc, câu trả lời chủ đầu tư phải có tên người trả lời, và sau bàn giao chỉ còn đường ra bản
 * điều chỉnh gắn yêu cầu thay đổi đã chấp thuận.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  create: vi.fn(),
  answer: vi.fn(),
  canEdit: true,
  changeRequests: [] as unknown[],
  versions: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useCan: () => state.canEdit,
  useAuth: () => ({ profile: { id: 'u1' } }),
}));

vi.mock('@/hooks/use-rfis', () => ({
  useCreateRfi: () => ({ mutateAsync: state.create, isPending: false }),
  useAnswerRfi: () => ({ mutateAsync: state.answer, isPending: false }),
  useSiteDesignDrawings: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/use-design-projects', () => ({
  useDesignVersions: () => ({ data: state.versions }),
  useChangeRequests: () => ({ data: state.changeRequests }),
  useCreateDesignVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishDesignVersion: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDesignReviews: () => ({ data: {} }),
  useRecordDesignReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { RfiCreateForm, RfiCard } = await import('../rfi-ui');
const { VersionPanel } = await import('@/pages/tk/version-panel');

function rfi(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    code: 'NVC-RFI-2026-0001',
    title: 'Cao độ dầm D3',
    question: 'Thi công theo số nào?',
    location: null,
    measurements: null,
    photo_urls: null,
    route: 'chu_dau_tu',
    due_date: '2099-01-01',
    status: 'cho_tra_loi',
    answer: null,
    answered_at: null,
    answerer_name: null,
    created_at: '2026-10-08T01:00:00Z',
    construction_site_id: 's1',
    design_project_id: null,
    design_version_id: null,
    company_id: 'c1',
    site: { code: 'NVC-CT-2026-0001', name: 'Công trình A' },
    requester: { full_name: 'Đỗ Văn K' },
    answerer: null,
    drawing: null,
    ...over,
  } as never;
}

describe('Gửi yêu cầu làm rõ', () => {
  beforeEach(() => {
    state.create.mockReset();
    state.create.mockResolvedValue({ id: 'r1', code: 'NVC-RFI-2026-0001' });
  });

  it('công trình không gắn hồ sơ thiết kế thì KHÔNG mời gửi tới Phòng Thiết kế', () => {
    renderWithApp(<RfiCreateForm siteId="s1" hasDesignProject={false} onDone={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: 'Phòng Thiết kế' })).toBeNull();
    expect(screen.getByText(/không gắn hồ sơ thiết kế/)).toBeInTheDocument();
  });

  it('thiếu hạn trả lời thì không gửi', async () => {
    renderWithApp(<RfiCreateForm siteId="s1" hasDesignProject onDone={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Tiêu đề/ }), 'Cao độ dầm');
    await userEvent.type(screen.getByRole('textbox', { name: /Nội dung cần làm rõ/ }), 'Số nào?');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng chọn hạn trả lời.');
    expect(state.create).not.toHaveBeenCalled();
  });
});

describe('Trả lời yêu cầu làm rõ', () => {
  it('tuyến chủ đầu tư: công trường ghi lại, phải có tên người trả lời phía chủ đầu tư', async () => {
    renderWithApp(
      <ul>
        <RfiCard rfi={rfi()} />
      </ul>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ghi trả lời của chủ đầu tư' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Nội dung trả lời/ }), 'Theo 3,30 m');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi trả lời' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tên người trả lời');
    expect(state.answer).not.toHaveBeenCalled();
  });

  it('đã trả lời thì hiện câu trả lời, không còn nút trả lời', () => {
    renderWithApp(
      <ul>
        <RfiCard
          rfi={rfi({
            status: 'da_tra_loi',
            answer: 'Theo kết cấu 3,30 m.',
            answered_at: '2026-10-08T03:00:00Z',
            route: 'thiet_ke',
            answerer: { full_name: 'Phạm Thị D' },
          })}
        />
      </ul>,
    );
    expect(screen.getByText('Theo kết cấu 3,30 m.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Trả lời/ })).toBeNull();
  });
});

describe('Bản vẽ điều chỉnh sau bàn giao (TK-08)', () => {
  it('chưa có yêu cầu thay đổi đã chấp thuận thì nói rõ phải làm gì, không mở biểu mẫu', () => {
    state.changeRequests = [{ id: 'cr1', code: 'X', title: 'Đổi dầm', status: 'dang_danh_gia' }];
    renderWithApp(
      <VersionPanel
        projectId="p1"
        companyId="c1"
        disciplines={['phuong_an', 'kien_truc', 'ket_cau', 'dien_nuoc']}
        readOnly
        revisionOnly
        emptyMessage="Trống"
      />,
    );
    expect(
      screen.getByText(/Chưa có yêu cầu thay đổi nào ở trạng thái «Chấp thuận»/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm bản điều chỉnh' })).toBeNull();
  });

  it('có yêu cầu đã chấp thuận: biểu mẫu bắt chọn yêu cầu, không có bộ môn «phương án»', async () => {
    state.changeRequests = [
      { id: 'cr1', code: 'NVC-TD-2026-0001', title: 'Nâng dầm D3', status: 'chap_thuan' },
    ];
    renderWithApp(
      <VersionPanel
        projectId="p1"
        companyId="c1"
        disciplines={['phuong_an', 'kien_truc', 'ket_cau', 'dien_nuoc']}
        readOnly
        revisionOnly
        emptyMessage="Trống"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Thêm bản điều chỉnh' }));
    expect(
      screen.getByRole('option', { name: 'NVC-TD-2026-0001 — Nâng dầm D3' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Phương án/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vui lòng nhập tên phiên bản.');
  });
});
