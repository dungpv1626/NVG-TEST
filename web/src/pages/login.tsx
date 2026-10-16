/**
 * Màn hình đăng nhập.
 *
 * Backend Schema Mục 3.1: hệ thống nội bộ, KHÔNG có luồng tự đăng ký công khai —
 * tài khoản do quản trị viên cấp. Vì vậy màn hình này chỉ có đăng nhập và quên mật khẩu.
 *
 * Giọng nói theo Content Guidelines 2.1–2.3: rõ ràng, trực tiếp, hỗ trợ chứ không phán xét.
 * Không dùng đại từ nhân xưng (4.2). Lỗi nêu việc gì không làm được + cần làm gì (4.6),
 * không lộ mã lỗi kỹ thuật.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { OfflineBar } from '@/components/layout/pwa-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth, useDefaultRoute } from '@/lib/auth';
import { cn } from '@/lib/utils';

const PROFILE_WAIT_MS = 5000;

export function LoginPage() {
  const { session, profile, loading, signIn, requestPasswordReset } = useAuth();
  const defaultRoute = useDefaultRoute();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đăng nhập xong về trang mặc định của vai trò (Webapp Flow 2.3). Ngay sau khi đăng nhập, phiên
  // có trước, hồ sơ (vai trò) tải sau — chuyển ngay là đưa lãnh đạo về /dashboard. Chờ hồ sơ, tối
  // đa PROFILE_WAIT_MS; hồ sơ không tải được thì vẫn về Dashboard như trước, không kẹt ở đây.
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    if (!session || profile) return;
    const t = window.setTimeout(() => setWaitedTooLong(true), PROFILE_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [session, profile]);

  if (!loading && session && profile) return <Navigate to={defaultRoute} replace />;
  if (!loading && session && waitedTooLong) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) return setError('Vui lòng nhập địa chỉ email.');
    if (!password) return setError('Vui lòng nhập mật khẩu.');

    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  async function handleForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      return setError('Vui lòng nhập địa chỉ email trước khi yêu cầu đặt lại mật khẩu.');
    }
    const { error: resetError } = await requestPasswordReset(email.trim());
    if (resetError) return setError(resetError);
    // Không tiết lộ email có tồn tại trong hệ thống hay không.
    setNotice('Nếu địa chỉ email này có trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.');
  }

  return (
    // `100dvh` để trên điện thoại thanh địa chỉ tự ẩn không làm khung đăng nhập nhảy.
    <div className="flex min-h-[100dvh] flex-col bg-surface-sunken">
      {/* Mất mạng ở màn hình này là nguyên nhân thường gặp nhất của "đăng nhập mãi không
          được" — nói thẳng thay vì để người dùng nghi ngờ mật khẩu của mình. */}
      <OfflineBar />
      <div className="flex flex-1 items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-sm rounded-lg border border-border',
            'bg-surface p-6 shadow-card',
          )}
        >
          <div className="mb-6">
            <h1 className="text-lg font-semibold">Hệ thống Quản trị NVG</h1>
            <p className="mt-1 text-fg-subtle">Đăng nhập để tiếp tục.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block font-medium">
                Mật khẩu
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
              />
            </div>

            {error && (
              <p
                role="alert"
                className={cn('rounded-sm bg-status-overdue-bg px-3 py-2', 'text-status-overdue')}
              >
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                className={cn('rounded-sm bg-status-progress-bg px-3 py-2', 'text-status-progress')}
              >
                {notice}
              </p>
            )}

            {/* Hành động chính DUY NHẤT trên màn hình này — dùng màu thương hiệu
              (Content Guidelines 6.3). */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>

            <Button
              type="button"
              variant="link"
              size="sm"
              className="w-full"
              onClick={() => void handleForgotPassword()}
            >
              Quên mật khẩu
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-fg-subtle">
            Tài khoản do quản trị hệ thống cấp. Liên hệ quản trị hệ thống nếu chưa có tài khoản.
          </p>
        </div>
      </div>
    </div>
  );
}
