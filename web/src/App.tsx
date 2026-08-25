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
import { OpportunityCreatePage } from '@/pages/crm/opportunity-create';
import { OpportunityDetailPage } from '@/pages/crm/opportunity-detail';
import { OpportunityPipelinePage } from '@/pages/crm/opportunity-pipeline';
import { QuoteCreatePage } from '@/pages/crm/quote-create';
import { DashboardPage } from '@/pages/dashboard';
import { LoginPage } from '@/pages/login';
import { PlaceholderPage } from '@/pages/placeholder';
import { ApprovalInboxPage } from '@/pages/phe-duyet/approval-inbox-page';

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
const MODULE_PATHS: Record<Exclude<ModuleCode, 'BC' | 'CRM'>, string> = {
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

              {/* CRM — Cơ hội kinh doanh (CRM-02). Cùng dữ liệu, hai chế độ xem
                  Kanban/Danh sách đổi qua tham số `?che-do=`. */}
              <Route path="crm/co-hoi" element={<OpportunityPipelinePage />} />
              <Route path="crm/co-hoi/tao-moi" element={<OpportunityCreatePage />} />
              <Route path="crm/co-hoi/:id" element={<OpportunityDetailPage />} />
              <Route path="crm/co-hoi/:id/bao-gia/lap-moi" element={<QuoteCreatePage />} />

              {/* Hộp thư Phê duyệt — MỘT màn hình cho mọi module (Webapp Flow 4.6),
                  nên nằm ở gốc chứ không thuộc đường dẫn của module nào. */}
              <Route path="viec-can-lam" element={<ApprovalInboxPage />} />
              {MODULE_CODES.filter(
                (c): c is Exclude<ModuleCode, 'BC' | 'CRM'> => c !== 'BC' && c !== 'CRM',
              ).map(
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
