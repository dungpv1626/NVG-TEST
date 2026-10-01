/**
 * Đổi mật khẩu của chính mình — mở từ menu tài khoản ở thanh trên cùng.
 *
 * Tài khoản mới được cấp với mật khẩu tạm (0150, màn hình Người dùng). Trước đây không có chỗ
 * nào đổi mật khẩu khi đã đăng nhập; «Quên mật khẩu» thì phụ thuộc thư gửi đi, mà bản chạy thử
 * chưa cấu hình máy chủ thư riêng. Đổi bằng phiên đang đăng nhập (`auth.updateUser`), không
 * qua Worker.
 */

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';

export const MIN_PASSWORD_LENGTH = 8;

function describeAuthError(code: string | undefined, message: string): string {
  if (code === 'same_password' || /different from the old/i.test(message)) {
    return 'Mật khẩu mới phải khác mật khẩu đang dùng.';
  }
  if (code === 'weak_password' || /weak|at least/i.test(message)) {
    return `Mật khẩu chưa đủ mạnh. Dùng ít nhất ${MIN_PASSWORD_LENGTH} ký tự, có cả chữ và số.`;
  }
  if (code === 'reauthentication_needed') {
    return 'Phiên đăng nhập đã lâu. Đăng xuất, đăng nhập lại rồi đổi mật khẩu.';
  }
  return 'Không đổi được mật khẩu. Vui lòng thử lại.';
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu mới cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirm) {
      setError('Hai lần nhập mật khẩu mới chưa khớp nhau.');
      return;
    }
    setPending(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (authError) {
      setError(describeAuthError(authError.code, authError.message));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <ConfirmDialog
        title="Đã đổi mật khẩu"
        confirmLabel="Đóng"
        cancelLabel={null}
        onConfirm={onClose}
        onCancel={onClose}
      >
        Lần đăng nhập sau dùng mật khẩu mới.
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title="Đổi mật khẩu"
      confirmLabel="Đổi mật khẩu"
      pending={pending}
      focusConfirm={false}
      onConfirm={() => void submit()}
      onCancel={onClose}
    >
      <div className="space-y-3">
        {error && (
          <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {error}
          </p>
        )}
        <Field label="Mật khẩu mới" hint={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`}>
          <Input
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
