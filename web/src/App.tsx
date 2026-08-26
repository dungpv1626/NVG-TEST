/**
 * Điều hướng gốc.
 *
 * Đường dẫn dùng tiếng Việt không dấu để dễ đọc và dễ chia sẻ
 * (`/crm/co-hoi` thay vì `/crm/opportunities`) — nhất quán với giao diện tiếng Việt.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MODULE_CODES, type ModuleCode } from '@nvg/shared';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { AuthProvider } from '@/lib/auth';
import { LoginPage } from '@/pages/login';

/**
 * Mỗi màn hình là một gói tải riêng.
 *
 * Quan trọng với người dùng điện thoại: mạng 3G/4G ở công trường tải một gói duy nhất chứa
 * cả 12 module là chờ rất lâu trước khi thấy gì. Tách theo màn hình thì lần mở đầu chỉ tải
 * đúng phần đang cần, phần còn lại tải dần khi bấm sang.
 *
 * Đăng nhập KHÔNG tách: đó luôn là màn hình đầu tiên, tách ra chỉ thêm một vòng chờ mạng.
 */
const DashboardPage = lazy(() =>
  import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })),
);
const PlaceholderPage = lazy(() =>
  import('@/pages/placeholder').then((m) => ({ default: m.PlaceholderPage })),
);
const DesignShowcasePage = lazy(() =>
  import('@/pages/nen/design-showcase').then((m) => ({ default: m.DesignShowcasePage })),
);
const ApprovalInboxPage = lazy(() =>
  import('@/pages/phe-duyet/approval-inbox-page').then((m) => ({ default: m.ApprovalInboxPage })),
);
const CustomerListPage = lazy(() =>
  import('@/pages/crm/customer-list').then((m) => ({ default: m.CustomerListPage })),
);
const CustomerCreatePage = lazy(() =>
  import('@/pages/crm/customer-create').then((m) => ({ default: m.CustomerCreatePage })),
);
const CustomerDetailPage = lazy(() =>
  import('@/pages/crm/customer-detail').then((m) => ({ default: m.CustomerDetailPage })),
);
const CustomerEditPage = lazy(() =>
  import('@/pages/crm/customer-edit').then((m) => ({ default: m.CustomerEditPage })),
);
const OpportunityPipelinePage = lazy(() =>
  import('@/pages/crm/opportunity-pipeline').then((m) => ({ default: m.OpportunityPipelinePage })),
);
const OpportunityCreatePage = lazy(() =>
  import('@/pages/crm/opportunity-create').then((m) => ({ default: m.OpportunityCreatePage })),
);
const OpportunityDetailPage = lazy(() =>
  import('@/pages/crm/opportunity-detail').then((m) => ({ default: m.OpportunityDetailPage })),
);
const QuoteCreatePage = lazy(() =>
  import('@/pages/crm/quote-create').then((m) => ({ default: m.QuoteCreatePage })),
);
const ComplaintListPage = lazy(() =>
  import('@/pages/crm/complaint-list').then((m) => ({ default: m.ComplaintListPage })),
);
const ComplaintCreatePage = lazy(() =>
  import('@/pages/crm/complaint-create').then((m) => ({ default: m.ComplaintCreatePage })),
);
const ComplaintDetailPage = lazy(() =>
  import('@/pages/crm/complaint-detail').then((m) => ({ default: m.ComplaintDetailPage })),
);
const BiddingListPage = lazy(() =>
  import('@/pages/da/bidding-list').then((m) => ({ default: m.BiddingListPage })),
);
const BiddingCreatePage = lazy(() =>
  import('@/pages/da/bidding-create').then((m) => ({ default: m.BiddingCreatePage })),
);
const BiddingDetailPage = lazy(() =>
  import('@/pages/da/bidding-detail').then((m) => ({ default: m.BiddingDetailPage })),
);
const UnitPriceListPage = lazy(() =>
  import('@/pages/da/unit-price-list').then((m) => ({ default: m.UnitPriceListPage })),
);
const DesignListPage = lazy(() =>
  import('@/pages/tk/design-list').then((m) => ({ default: m.DesignListPage })),
);
const DesignCreatePage = lazy(() =>
  import('@/pages/tk/design-create').then((m) => ({ default: m.DesignCreatePage })),
);
const DesignDetailPage = lazy(() =>
  import('@/pages/tk/design-detail').then((m) => ({ default: m.DesignDetailPage })),
);
const ContractListPage = lazy(() =>
  import('@/pages/hd/contract-list').then((m) => ({ default: m.ContractListPage })),
);
const ContractDetailPage = lazy(() =>
  import('@/pages/hd/contract-detail').then((m) => ({ default: m.ContractDetailPage })),
);
const SiteListPage = lazy(() =>
  import('@/pages/tc/site-list').then((m) => ({ default: m.SiteListPage })),
);
const SiteDetailPage = lazy(() =>
  import('@/pages/tc/site-detail').then((m) => ({ default: m.SiteDetailPage })),
);

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
const MODULE_PATHS: Record<Exclude<ModuleCode, 'BC' | 'CRM' | 'DA'>, string> = {
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
              <Route path="crm/khach-hang/:id/chinh-sua" element={<CustomerEditPage />} />

              {/* CRM — Cơ hội kinh doanh (CRM-02). Cùng dữ liệu, hai chế độ xem
                  Kanban/Danh sách đổi qua tham số `?che-do=`. */}
              <Route path="crm/co-hoi" element={<OpportunityPipelinePage />} />
              <Route path="crm/co-hoi/tao-moi" element={<OpportunityCreatePage />} />
              <Route path="crm/co-hoi/:id" element={<OpportunityDetailPage />} />
              <Route path="crm/co-hoi/:id/bao-gia/lap-moi" element={<QuoteCreatePage />} />

              {/* CRM — Khiếu nại khách hàng (CRM-08). */}
              <Route path="crm/khieu-nai" element={<ComplaintListPage />} />
              <Route path="crm/khieu-nai/tao-moi" element={<ComplaintCreatePage />} />
              <Route path="crm/khieu-nai/:id" element={<ComplaintDetailPage />} />

              {/* DA — Gói thầu và đơn giá (DA-01 → DA-09). */}
              <Route path="da/goi-thau" element={<BiddingListPage />} />
              <Route path="da/goi-thau/tao-moi" element={<BiddingCreatePage />} />
              <Route path="da/goi-thau/:id" element={<BiddingDetailPage />} />
              <Route path="da/don-gia" element={<UnitPriceListPage />} />

              {/* TK — Thiết kế đa bộ môn (TK-01 → TK-08). TK-10 → TK-17 chưa làm. */}
              <Route path="tk/du-an" element={<DesignListPage />} />
              <Route path="tk/du-an/tao-moi" element={<DesignCreatePage />} />
              <Route path="tk/du-an/:id" element={<DesignDetailPage />} />

              {/* HD — Hợp đồng (HD-01 → HD-05). Không có màn hình "tạo mới": hợp đồng soạn
                  từ hồ sơ nguồn ở CRM/DA/TK, không nhập lại dữ liệu đã có (PRD 2.3). */}
              <Route path="hd/hop-dong" element={<ContractListPage />} />
              <Route path="hd/hop-dong/:id" element={<ContractDetailPage />} />

              {/* TC — Thi công và ngân sách công trình (TC-01 → TC-08). Không có màn hình
                  "tạo mới": công trình mở từ hợp đồng đã ký, hoặc tự mở khi hồ sơ thiết kế
                  được bàn giao cho Ban công trường (TK-08). */}
              <Route path="tc/cong-trinh" element={<SiteListPage />} />
              <Route path="tc/cong-trinh/:id" element={<SiteDetailPage />} />

              {/* Hộp thư Phê duyệt — MỘT màn hình cho mọi module (Webapp Flow 4.6),
                  nên nằm ở gốc chứ không thuộc đường dẫn của module nào. */}
              <Route path="viec-can-lam" element={<ApprovalInboxPage />} />

              {/* Trang trưng bày thành phần giao diện — công cụ nội bộ của đội triển khai.
                  Đặt trong nhánh `nen/` nên chỉ vai trò xem được phân hệ Nền tảng mới tới được;
                  hàng rào thật vẫn là RLS, đây chỉ là điều hướng (Webapp Flow 6.5). */}
              <Route path="nen/giao-dien" element={<DesignShowcasePage />} />
              {MODULE_CODES.filter(
                (c): c is Exclude<ModuleCode, 'BC' | 'CRM' | 'DA' | 'TK' | 'HD' | 'TC'> =>
                  c !== 'BC' &&
                  c !== 'CRM' &&
                  c !== 'DA' &&
                  c !== 'TK' &&
                  c !== 'HD' &&
                  c !== 'TC',
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
