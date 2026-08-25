/**
 * Điều hướng gốc.
 *
 * Đường dẫn dùng tiếng Việt không dấu để dễ đọc và dễ chia sẻ
 * (`/crm/co-hoi` thay vì `/crm/opportunities`) — nhất quán với giao diện tiếng Việt.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MODULE_CODES, type ModuleCode } from '@nvg/shared';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { AuthProvider } from '@/lib/auth';
import { CustomerCreatePage } from '@/pages/crm/customer-create';
import { CustomerDetailPage } from '@/pages/crm/customer-detail';
import { CustomerListPage } from '@/pages/crm/customer-list';
import { DashboardPage } from '@/pages/dashboard';
import { LoginPage } from '@/pages/login';
import { PlaceholderPage } from '@/pages/placeholder';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu quản trị đổi không quá nhanh; tránh gọi lại mỗi lần chuyển tab.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** Đường dẫn của từng module — khớp `MODULE_ROUTES` trong sidebar. */
const MODULE_PATHS: Record<Exclude<ModuleCode, 'BC'>, string> = {
  CRM: 'crm/co-hoi', // trang tạm cho pipeline cơ hội, dựng ở Phase 2A
  DA: 'da/goi-thau',
  TK: 'tk/du-an',
  HD: 'hd/hop-dong',
  TC: 'tc/cong-trinh',
  MH: 'mh/de-nghi-mua',
  KHO: 'kho/ton-kho',
  KT: 'kt/de-nghi-thanh-toan',
  NS: 'ns/nhan-su',
  SX: 'sx/tai-san-cho-thue',
  NEN: 'nen/quan-tri',
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />

            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* CRM — Khách hàng (CRM-01). Thứ tự quan trọng: `tao-moi` phải đứng
                  TRƯỚC `:id`, nếu không nó sẽ bị khớp như một id. */}
              <Route path="crm/khach-hang" element={<CustomerListPage />} />
              <Route path="crm/khach-hang/tao-moi" element={<CustomerCreatePage />} />
              <Route path="crm/khach-hang/:id" element={<CustomerDetailPage />} />
              {MODULE_CODES.filter((c): c is Exclude<ModuleCode, 'BC'> => c !== 'BC').map(
                (code) => (
                  <Route
                    key={code}
                    path={MODULE_PATHS[code]}
                    element={<PlaceholderPage moduleCode={code} />}
                  />
                ),
              )}
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
