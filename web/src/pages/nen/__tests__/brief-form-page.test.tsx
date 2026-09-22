/**
 * «Biểu mẫu đầu bài» — màn hình quản trị viên sửa mục khảo sát (21/09/2026).
 *
 * Bốn ranh giới được canh ở đây, tất cả đều là thứ hỏng mà màn hình vẫn trông bình thường:
 *
 *  - Câu hỏi BẮT BUỘC của hợp đồng không được có nút ẩn. Ẩn được nó thì mọi đầu bài mới sau
 *    đó không chốt nổi, và không màn hình nào nói vì sao.
 *  - Người không có quyền `design.settings.write` thấy ô nhập KHOÁ, không phải thấy nút rồi
 *    bấm vào mới bị chặn (CLAUDE.md 5.4).
 *  - Câu hỏi tự thêm phải gửi lên đúng hình dạng lớp phủ — sai một khoá thì Worker bác, và
 *    người dùng mất cả phần vừa soạn.
 *  - Ẩn một câu hỏi phải để lại lối hiện lại. Không có thì ẩn là một chiều, và lối duy nhất
 *    lấy lại là «Trả về bản gốc», thứ xoá luôn mọi chỉnh sửa khác.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  capability: true,
  saved: null as unknown,
  save: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', fullName: 'Quản trị viên', assignments: [] } }),
  useCan: () => true,
}));

vi.mock('@/hooks/use-design-projects', async () => {
  const { BRIEF_FORM } = await import('@nvg/shared/design');
  return {
    useDesignCapabilities: () => ({ has: () => state.capability }),
    useBriefFormConfig: () => ({
      config: BRIEF_FORM,
      overlay: null,
      broken: false,
      isLoading: false,
    }),
    useSaveBriefFormOverlay: () => ({
      mutateAsync: state.save,
      isPending: false,
    }),
  };
});

async function open() {
  const { BriefFormAdminPage } = await import('../brief-form-page');
  renderWithApp(<BriefFormAdminPage />);
}

beforeEach(() => {
  state.capability = true;
  state.saved = null;
  state.save = vi.fn(async (payload: unknown) => {
    state.saved = payload;
    return { ok: true };
  });
});

describe('Biểu mẫu đầu bài', () => {
  it('liệt kê các mục của biểu mẫu gốc', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Biểu mẫu đầu bài' })).toBeTruthy();
    expect(screen.getByDisplayValue('Công trình và khu đất')).toBeTruthy();
    expect(screen.getByDisplayValue('Gia đình và nếp sinh hoạt')).toBeTruthy();
  });

  it('câu hỏi bắt buộc của hợp đồng KHÔNG có nút ẩn', async () => {
    await open();
    // «Số tầng» nằm trong `LOCKED_PATHS`; «Phong cách kiến trúc» thì không.
    const locked = screen.getByDisplayValue('Số tầng').closest('li')!;
    expect(within(locked).queryByRole('button', { name: 'Ẩn' })).toBeNull();
    expect(within(locked).getByText(/không ẩn được/)).toBeTruthy();

    const style = screen.getByDisplayValue('Phong cách kiến trúc').closest('li')!;
    expect(within(style).getByRole('button', { name: 'Ẩn' })).toBeTruthy();
  });

  it('ẩn một câu hỏi thì nó rời danh sách và hiện ở mục «Đang ẩn»', async () => {
    await open();
    const style = screen.getByDisplayValue('Phong cách kiến trúc').closest('li')!;
    await userEvent.click(within(style).getByRole('button', { name: 'Ẩn' }));

    expect(screen.queryByDisplayValue('Phong cách kiến trúc')).toBeNull();
    const hidden = screen.getByRole('heading', { name: 'Đang ẩn' }).closest('section')!;
    expect(within(hidden).getByText('Phong cách kiến trúc')).toBeTruthy();
    expect(within(hidden).getByRole('button', { name: 'Hiện lại' })).toBeTruthy();
  });

  it('thêm câu hỏi tự soạn rồi lưu — gửi lên đúng hình dạng lớp phủ', async () => {
    await open();
    await userEvent.click(screen.getAllByRole('button', { name: /Thêm câu hỏi/ })[0]!);
    await userEvent.type(screen.getByLabelText('Tên câu hỏi'), 'Có bếp nướng ngoài trời không');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm vào mục' }));

    // Mã gợi ý từ tên: bỏ dấu, gạch dưới thay khoảng trắng.
    expect(screen.getByDisplayValue('Có bếp nướng ngoài trời không')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Lưu biểu mẫu' }));
    const payload = state.saved as {
      overlay: { sections: { fields?: { path: string }[] }[] };
    };
    const paths = payload.overlay.sections.flatMap((s) => (s.fields ?? []).map((f) => f.path));
    expect(paths).toContain('custom.co_bep_nuong_ngoai_troi_khong');
  });

  it('không có quyền sửa thì ô nhập khoá và nói ai làm được', async () => {
    state.capability = false;
    await open();
    expect(screen.getByText(/chỉ xem được cấu hình này/)).toBeTruthy();
    expect(screen.getByDisplayValue('Công trình và khu đất').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Lưu biểu mẫu' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
