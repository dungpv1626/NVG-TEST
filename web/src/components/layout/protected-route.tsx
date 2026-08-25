/**
 * Chặn truy cập khi chưa đăng nhập.
 *
 * Trong lúc còn đang khôi phục phiên (`loading`) thì hiển thị khung xám placeholder,
 * KHÔNG dùng vòng xoay toàn màn hình gây cảm giác treo máy (Webapp Flow 6.7).
 * Cũng không được chuyển hướng vội về trang đăng nhập trong lúc chờ — người dùng đã
 * đăng nhập sẽ bị đá ra oan mỗi lần tải lại trang.
 */

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

function ShellSkeleton() {
  return (
    <div className="flex h-screen animate-pulse bg-surface-sunken">
      <div className="w-60 border-r border-border bg-surface p-2">
        <div className="mb-4 h-12 rounded-sm bg-surface-hover" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-1 h-9 rounded-sm bg-surface-hover" />
        ))}
      </div>
      <div className="flex-1">
        <div className="h-12 border-b border-border bg-surface" />
        <div className="p-6">
          <div className="mb-6 h-8 w-64 rounded-sm bg-surface-hover" />
          <div className={cn('grid gap-4', 'sm:grid-cols-2 lg:grid-cols-3')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-surface-hover" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <ShellSkeleton />;
  if (!session) return <Navigate to="/dang-nhap" replace />;

  // Có tài khoản đăng nhập nhưng chưa có hồ sơ nghiệp vụ tương ứng trong bảng `users`,
  // hoặc chưa được gán vào pháp nhân nào — nêu rõ cần làm gì (Content Guidelines 4.6),
  // không để màn hình trắng.
  if (!profile || profile.assignments.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className={cn(
            'max-w-md rounded-lg border border-border',
            'bg-surface p-6 text-center shadow-card',
          )}
        >
          <h1 className="mb-2 font-semibold">Tài khoản chưa được gán quyền</h1>
          <p className="text-fg-subtle">
            Tài khoản đã đăng nhập nhưng chưa được gán vào pháp nhân nào. Liên hệ quản trị hệ
            thống để được cấp quyền truy cập.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
