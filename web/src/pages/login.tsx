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
import { BrandLogo } from '@/components/layout/brand-logo';
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
    // v2 (màn 1.1): khung xanh rừng; máy tính chia hai nửa — câu giới thiệu bên trái, biểu mẫu trong
    // bảng sáng bên phải; điện thoại câu giới thiệu ở trên, biểu mẫu trong bảng sáng bên dưới.
    <div className="flex min-h-[100dvh] flex-col bg-shell text-fg-inverse lg:p-3.5">
      {/* Mất mạng ở màn hình này là nguyên nhân thường gặp nhất của "đăng nhập mãi không
          được" — nói thẳng thay vì để người dùng nghi ngờ mật khẩu của mình. */}
      <OfflineBar />
      <div className="flex flex-1 flex-col lg:flex-row">
        <section className="flex flex-col gap-6 px-6 pt-8 pb-6 lg:flex-1 lg:justify-between lg:p-12">
          <div className="flex items-center gap-2.5">
            <BrandLogo variant="mark" className="w-20" />
            <span className="text-md font-bold">Nhà Việt Group</span>
          </div>
          <div className="max-w-lg">
            <p className="text-title font-bold lg:text-hero lg:leading-tight">
              Một hệ thống cho cả chuỗi công trình
            </p>
            <p className="mt-3 hidden text-shell-fg lg:block">
              Từ đầu mối, thiết kế, hợp đồng đến thi công, kho và thu tiền — cho NVC, NVO và NVS.
            </p>
          </div>
          <p className="hidden text-xs text-shell-fg-subtle lg:block">
            Hệ thống Quản trị NVG · nội bộ
          </p>
        </section>

        <div className="flex flex-1 items-start justify-center rounded-t-shell-mobile bg-canvas px-6 py-8 text-ink lg:items-center lg:rounded-canvas lg:p-12">
          <div className="w-full max-w-sm">
            <div className="mb-6">
              <h1 className="text-xl font-bold">Đăng nhập</h1>
              <p className="mt-1 text-ink-subtle">Dùng email công ty được cấp.</p>
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
                  className={cn(
                    'rounded-sm bg-status-progress-bg px-3 py-2',
                    'text-status-progress',
                  )}
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

            <p className="mt-6 text-center text-xs text-ink-subtle">
              Tài khoản do quản trị hệ thống cấp. Liên hệ quản trị hệ thống nếu chưa có tài khoản.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
