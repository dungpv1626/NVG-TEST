import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { updateUser } } }));

const { ChangePasswordDialog } = await import('../change-password-dialog');

describe('Đổi mật khẩu', () => {
  it('chặn mật khẩu ngắn và hai lần nhập lệch, không gọi máy chủ', async () => {
    updateUser.mockReset();
    render(<ChangePasswordDialog onClose={vi.fn()} />);
    const [first, second] = screen.getAllByLabelText(/mật khẩu mới/i);

    await userEvent.type(first!, 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ít nhất 8 ký tự');

    await userEvent.clear(first!);
    await userEvent.type(first!, 'MatKhauMoi2026');
    await userEvent.type(second!, 'MatKhauMoi2025');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(screen.getByRole('alert')).toHaveTextContent('chưa khớp');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('đổi thành công thì báo đã đổi; lỗi của Auth hiện bằng tiếng Việt', async () => {
    updateUser.mockReset();
    updateUser.mockResolvedValueOnce({
      error: {
        code: 'same_password',
        message: 'New password should be different from the old password.',
      },
    });
    updateUser.mockResolvedValueOnce({ error: null });
    render(<ChangePasswordDialog onClose={vi.fn()} />);
    const [first, second] = screen.getAllByLabelText(/mật khẩu mới/i);
    await userEvent.type(first!, 'MatKhauMoi2026');
    await userEvent.type(second!, 'MatKhauMoi2026');

    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('phải khác mật khẩu đang dùng');
    expect(screen.queryByText(/different/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Đã đổi mật khẩu')).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ password: 'MatKhauMoi2026' });
  });
});
