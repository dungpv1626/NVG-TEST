/**
 * Hàng rào chống mất dữ liệu đang nhập (Webapp Flow 6.3).
 *
 * Lỗi đã có thật: mỗi biểu mẫu chỉ tự bảo vệ được đúng nút Hủy của nó. Bấm breadcrumb, bấm mục
 * menu bên trái, bấm nút Lùi của trình duyệt — tất cả đều đi vòng qua nút đó và xoá sạch những
 * gì đã gõ, không hỏi một câu.
 *
 * Bộ test này cũng là chỗ canh cho `renderWithApp`: `useBlocker` chỉ chạy trong router dữ liệu,
 * nên nếu bộ khung test quay về `<MemoryRouter>` thì mọi test ở đây đỏ ngay.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUnsavedChangesGuard } from '../use-unsaved-changes-guard';
import { currentPath, renderWithApp } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Biểu mẫu tối giản mang đúng hình dạng của các màn hình Tạo mới thật.
 *
 * Nút Lưu hạ hàng rào rồi chuyển trang NGAY TRONG CÙNG một lần xử lý sự kiện — đúng như các
 * trang thật. Tách ra hai thao tác thì `setDirty(false)` đã kịp có hiệu lực ở lượt vẽ giữa
 * hai lần bấm, và test không còn kiểm được `release()` nữa.
 */
function FormScreen({ withRelease = true }: { withRelease?: boolean } = {}) {
  const [dirty, setDirty] = useState(false);
  const release = useUnsavedChangesGuard(dirty);
  const navigate = useNavigate();
  return (
    <>
      <label>
        Tên hồ sơ
        <input onChange={() => setDirty(true)} />
      </label>
      <Link to="/crm/co-hoi">Cơ hội kinh doanh</Link>
      <button
        type="button"
        onClick={() => {
          setDirty(false);
          if (withRelease) release();
          navigate('/crm/co-hoi/da-luu', { replace: true });
        }}
      >
        Lưu
      </button>
    </>
  );
}

function stubConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  vi.stubGlobal('confirm', confirm);
  return confirm;
}

describe('useUnsavedChangesGuard', () => {
  it('chưa gõ gì thì rời trang không bị hỏi', async () => {
    const confirm = stubConfirm(true);
    const user = userEvent.setup();
    const result = renderWithApp(<FormScreen />, { route: '/crm/co-hoi/tao-moi' });

    await user.click(screen.getByRole('link', { name: 'Cơ hội kinh doanh' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(currentPath(result)).toBe('/crm/co-hoi');
  });

  it('đang nhập dở mà bấm liên kết thì HỎI, và trả lời Không thì ở lại', async () => {
    const confirm = stubConfirm(false);
    const user = userEvent.setup();
    const result = renderWithApp(<FormScreen />, { route: '/crm/co-hoi/tao-moi' });

    await user.type(screen.getByRole('textbox', { name: /tên hồ sơ/i }), 'Nhà phố 3 tầng');
    await user.click(screen.getByRole('link', { name: 'Cơ hội kinh doanh' }));

    expect(confirm).toHaveBeenCalledWith(
      'Các thay đổi chưa lưu sẽ bị mất nếu rời trang. Tiếp tục?',
    );
    expect(currentPath(result)).toBe('/crm/co-hoi/tao-moi');
    expect(screen.getByRole('textbox', { name: /tên hồ sơ/i })).toHaveValue('Nhà phố 3 tầng');
  });

  it('trả lời Có thì đi tiếp — hàng rào không được biến thành cái bẫy', async () => {
    stubConfirm(true);
    const user = userEvent.setup();
    const result = renderWithApp(<FormScreen />, { route: '/crm/co-hoi/tao-moi' });

    await user.type(screen.getByRole('textbox', { name: /tên hồ sơ/i }), 'Nhà phố 3 tầng');
    await user.click(screen.getByRole('link', { name: 'Cơ hội kinh doanh' }));

    expect(currentPath(result)).toBe('/crm/co-hoi');
  });

  it('lưu xong rồi tự chuyển trang thì KHÔNG hỏi lại', async () => {
    const confirm = stubConfirm(true);
    const user = userEvent.setup();
    const result = renderWithApp(<FormScreen />, { route: '/crm/co-hoi/tao-moi' });

    await user.type(screen.getByRole('textbox', { name: /tên hồ sơ/i }), 'Nhà phố 3 tầng');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(currentPath(result)).toBe('/crm/co-hoi/da-luu');
  });

  it('thiếu `release()` thì người vừa bấm Lưu bị hỏi oan — đây là lý do nó tồn tại', async () => {
    const confirm = stubConfirm(true);
    const user = userEvent.setup();
    renderWithApp(<FormScreen withRelease={false} />, { route: '/crm/co-hoi/tao-moi' });

    await user.type(screen.getByRole('textbox', { name: /tên hồ sơ/i }), 'Nhà phố 3 tầng');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    // `setDirty(false)` chỉ có hiệu lực ở lượt vẽ sau, còn điều hướng chạy ngay trong cùng lượt.
    expect(confirm).toHaveBeenCalled();
  });
});
