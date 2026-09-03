/**
 * Tab Hồ sơ – Bản vẽ của công trình — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Bộ này canh đúng thứ khảo sát Chỉ huy – Giám sát công trường 02/09/2026 nêu là vướng mắc số
 * một: người mở màn hình phải biết ngay **bản nào đang dùng được để thi công**, và bản cũ
 * không được trông giống bản đang hiệu lực.
 *
 * Ba điều được canh:
 *  1. Bản đang hiệu lực nói rõ bằng CHỮ, không chỉ bằng màu (Content Guidelines 6.8);
 *  2. Bản cũ mang chữ "Không còn hiệu lực" — nhìn nhầm bản cũ chính là nguyên nhân lần phải
 *     tháo dỡ làm lại mà phiếu khảo sát kể;
 *  3. Phát hành bản điều chỉnh KHÔNG đi tiếp khi chưa nêu nguyên nhân thay đổi (NEN-05).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import { SiteDocumentPanel } from '../document-panel';

const publish = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ documents: [] as unknown[] }));

vi.mock('@/hooks/use-construction-sites', () => ({
  useSiteDocuments: () => ({ data: state.documents, isLoading: false }),
  usePublishSiteDocumentVersion: () => ({ mutateAsync: publish, isPending: false }),
}));

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    title: 'Bản vẽ kết cấu móng',
    category: 'ban_ve_thi_cong',
    description: null,
    versions: [
      {
        id: 'v2',
        version: 2,
        is_current_version: true,
        file_name: 'mong-r2.pdf',
        file_url: 'cong-trinh/s1/mong-r2.pdf',
        change_reason: 'Chủ đầu tư đổi cao độ đáy móng',
        published_at: '2026-09-01T03:00:00Z',
        publisher: { full_name: 'Hoàng Văn E' },
      },
      {
        id: 'v1',
        version: 1,
        is_current_version: false,
        file_name: 'mong-r1.pdf',
        file_url: 'cong-trinh/s1/mong-r1.pdf',
        change_reason: null,
        published_at: '2026-08-20T03:00:00Z',
        publisher: { full_name: 'Hoàng Văn E' },
      },
    ],
    ...over,
  };
}

function render(readOnly = false) {
  return renderWithApp(<SiteDocumentPanel siteId="s1" companyId="c1" readOnly={readOnly} />);
}

describe('Tab Hồ sơ – Bản vẽ của công trình', () => {
  beforeEach(() => {
    publish.mockReset();
    publish.mockResolvedValue('new-version');
    state.documents = [doc()];
  });

  it('nói rõ bằng chữ bản nào đang hiệu lực, và bản cũ mang chữ "Không còn hiệu lực"', () => {
    render();

    expect(screen.getByText(/Đang hiệu lực — bản 2/)).toBeInTheDocument();
    expect(screen.getByText(/mong-r2\.pdf/)).toBeInTheDocument();
    // Lý do đổi bản hiện ngay cạnh bản đang dùng — đó là câu trả lời cho "vì sao đổi".
    expect(screen.getByText(/Chủ đầu tư đổi cao độ đáy móng/)).toBeInTheDocument();

    const older = screen.getByText(/1 bản cũ/);
    expect(older).toBeInTheDocument();
    expect(within(older.closest('details')!).getByText(/Không còn hiệu lực/)).toBeInTheDocument();
  });

  it('không phát hành bản điều chỉnh khi chưa nêu nguyên nhân thay đổi (NEN-05)', async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: 'Phát hành bản mới' }));
    await user.type(screen.getByLabelText(/Tên tệp/), 'mong-r3.pdf');
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(publish).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/nguyên nhân thay đổi/i);
  });

  it('phát hành được khi đã nêu nguyên nhân, và gửi kèm đúng mã tài liệu đang sửa', async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: 'Phát hành bản mới' }));
    await user.type(screen.getByLabelText(/Tên tệp/), 'mong-r3.pdf');
    await user.type(screen.getByLabelText(/Nguyên nhân thay đổi/), 'Bổ sung thép chờ cột');
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toMatchObject({
      documentId: 'd1',
      fileName: 'mong-r3.pdf',
      changeReason: 'Bổ sung thép chờ cột',
    });
  });

  it('hồ sơ mới KHÔNG bắt nêu nguyên nhân — bản đầu tiên không có gì để so', async () => {
    const user = userEvent.setup();
    state.documents = [];
    render();

    await user.click(screen.getByRole('button', { name: 'Thêm hồ sơ' }));
    await user.type(screen.getByLabelText(/Tên hồ sơ/), 'Biện pháp thi công phần thân');
    await user.type(screen.getByLabelText(/Tên tệp/), 'bptc-than.pdf');
    await user.click(screen.getByRole('button', { name: 'Phát hành' }));

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toMatchObject({ documentId: null, changeReason: null });
  });

  it('công trình đã đóng thì không hiện nút phát hành nào', () => {
    render(true);

    expect(screen.queryByRole('button', { name: 'Thêm hồ sơ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phát hành bản mới' })).not.toBeInTheDocument();
    // Vẫn đọc được bản đang hiệu lực — đóng công trình không có nghĩa là mất hồ sơ.
    expect(screen.getByText(/Đang hiệu lực — bản 2/)).toBeInTheDocument();
  });
});
