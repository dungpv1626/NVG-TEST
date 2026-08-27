/**
 * Điều hướng gốc.
 *
 * Đường dẫn dùng tiếng Việt không dấu để dễ đọc và dễ chia sẻ
 * (`/crm/co-hoi` thay vì `/crm/opportunities`) — nhất quán với giao diện tiếng Việt.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { MODULE_CODES, type ModuleCode } from '@nvg/shared';
import { AppShell } from '@/components/layout/app-shell';
import { ModuleGuard } from '@/components/layout/module-guard';
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
const PurchaseRequestListPage = lazy(() =>
  import('@/pages/mh/request-list').then((m) => ({ default: m.PurchaseRequestListPage })),
);
const PurchaseRequestCreatePage = lazy(() =>
  import('@/pages/mh/request-create').then((m) => ({ default: m.PurchaseRequestCreatePage })),
);
const PurchaseRequestDetailPage = lazy(() =>
  import('@/pages/mh/request-detail').then((m) => ({ default: m.PurchaseRequestDetailPage })),
);
const PurchaseOrderListPage = lazy(() =>
  import('@/pages/mh/order-list').then((m) => ({ default: m.PurchaseOrderListPage })),
);
const PurchaseOrderDetailPage = lazy(() =>
  import('@/pages/mh/order-detail').then((m) => ({ default: m.PurchaseOrderDetailPage })),
);
const SupplierListPage = lazy(() =>
  import('@/pages/mh/supplier-list').then((m) => ({ default: m.SupplierListPage })),
);
const SupplierDetailPage = lazy(() =>
  import('@/pages/mh/supplier-detail').then((m) => ({ default: m.SupplierDetailPage })),
);
const StockScanPage = lazy(() =>
  import('@/pages/kho/scan-page').then((m) => ({ default: m.StockScanPage })),
);
const InventoryListPage = lazy(() =>
  import('@/pages/kho/inventory-list').then((m) => ({ default: m.InventoryListPage })),
);
const StockMovementPage = lazy(() =>
  import('@/pages/kho/movement-page').then((m) => ({ default: m.StockMovementPage })),
);
const StocktakePage = lazy(() =>
  import('@/pages/kho/stocktake-page').then((m) => ({ default: m.StocktakePage })),
);
const ScaffoldingPage = lazy(() =>
  import('@/pages/kho/scaffolding-page').then((m) => ({ default: m.ScaffoldingPage })),
);
const MaterialListPage = lazy(() =>
  import('@/pages/kho/catalog-pages').then((m) => ({ default: m.MaterialListPage })),
);
const PaymentRequestListPage = lazy(() =>
  import('@/pages/kt/payment-list').then((m) => ({ default: m.PaymentRequestListPage })),
);
const PaymentRequestCreatePage = lazy(() =>
  import('@/pages/kt/payment-create').then((m) => ({ default: m.PaymentRequestCreatePage })),
);
const PaymentRequestDetailPage = lazy(() =>
  import('@/pages/kt/payment-detail').then((m) => ({ default: m.PaymentRequestDetailPage })),
);
const AdvanceListPage = lazy(() =>
  import('@/pages/kt/advance-page').then((m) => ({ default: m.AdvanceListPage })),
);
const ReceivablePage = lazy(() =>
  import('@/pages/kt/receivable-page').then((m) => ({ default: m.ReceivablePage })),
);
const CashFlowPage = lazy(() =>
  import('@/pages/kt/cash-flow-page').then((m) => ({ default: m.CashFlowPage })),
);
const AccountingPeriodPage = lazy(() =>
  import('@/pages/kt/period-page').then((m) => ({ default: m.AccountingPeriodPage })),
);
const WarehouseListPage = lazy(() =>
  import('@/pages/kho/catalog-pages').then((m) => ({ default: m.WarehouseListPage })),
);
const HrDashboardPage = lazy(() =>
  import('@/pages/ns/hr-dashboard').then((m) => ({ default: m.HrDashboardPage })),
);
const EmployeeListPage = lazy(() =>
  import('@/pages/ns/employee-list').then((m) => ({ default: m.EmployeeListPage })),
);
const EmployeeCreatePage = lazy(() =>
  import('@/pages/ns/employee-create').then((m) => ({ default: m.EmployeeCreatePage })),
);
const EmployeeDetailPage = lazy(() =>
  import('@/pages/ns/employee-detail').then((m) => ({ default: m.EmployeeDetailPage })),
);
const TimesheetPage = lazy(() =>
  import('@/pages/ns/timesheet-page').then((m) => ({ default: m.TimesheetPage })),
);
const LeavePage = lazy(() =>
  import('@/pages/ns/leave-page').then((m) => ({ default: m.LeavePage })),
);
const AssetPage = lazy(() =>
  import('@/pages/ns/asset-page').then((m) => ({ default: m.AssetPage })),
);
const HrDocumentPage = lazy(() =>
  import('@/pages/ns/document-page').then((m) => ({ default: m.HrDocumentPage })),
);
const RecruitmentPage = lazy(() =>
  import('@/pages/ns/recruitment-page').then((m) => ({ default: m.RecruitmentPage })),
);
const RentalAgreementListPage = lazy(() =>
  import('@/pages/sx/rental-list').then((m) => ({ default: m.RentalAgreementListPage })),
);
const RentalAgreementDetailPage = lazy(() =>
  import('@/pages/sx/rental-detail').then((m) => ({ default: m.RentalAgreementDetailPage })),
);
const ProductionOrderListPage = lazy(() =>
  import('@/pages/sx/production-order-list').then((m) => ({ default: m.ProductionOrderListPage })),
);
const ProductionOrderDetailPage = lazy(() =>
  import('@/pages/sx/production-order-detail').then((m) => ({
    default: m.ProductionOrderDetailPage,
  })),
);
const ProfitLossReportPage = lazy(() =>
  import('@/pages/bc/profit-loss').then((m) => ({ default: m.ProfitLossReportPage })),
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

/**
 * Dùng ROUTER DỮ LIỆU (`createBrowserRouter`), không phải `<BrowserRouter>`.
 *
 * Lý do duy nhất: `useBlocker` — thứ cho phép chặn một lần điều hướng lại để hỏi trước khi
 * bỏ dữ liệu đang nhập (Webapp Flow 6.3) — chỉ chạy trong router dữ liệu. Với
 * `<BrowserRouter>`, bấm breadcrumb hay mục menu giữa chừng một biểu mẫu là mất trắng những
 * gì đã gõ, không một lời hỏi. Xem `useUnsavedChangesGuard`.
 */
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/dang-nhap" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Dashboard KHÔNG bọc `ModuleGuard`: đây là nơi màn hình bị chặn đưa người
                  dùng quay về, nên nó phải là điểm đến chắc chắn vào được của mọi vai trò. */}
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route element={<ModuleGuard module="BC" />}>
          {/* BC-02 — báo cáo lãi/lỗ. Quyền XEM số liệu thật (Mẫu D `profit`) được CSDL chặn
                    thêm một lớp nữa bên trong hàm `project_profit_loss`; `ModuleGuard` chỉ chặn
                    việc mở màn hình cho vai trò không có `BC: view`. */}
          <Route path="bc/lai-lo" element={<ProfitLossReportPage />} />
        </Route>

        {/* Mỗi phân hệ bọc trong `ModuleGuard`: ẩn khỏi menu là chưa đủ, vì đường dẫn
                  vẫn gõ tay và dán qua Zalo được (Webapp Flow 6.5). Bọc ở tầng route thay vì
                  ở từng trang để màn hình mới thêm sau này không thể quên. */}
        <Route element={<ModuleGuard module="CRM" />}>
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
        </Route>

        {/* DA — Gói thầu và đơn giá (DA-01 → DA-09). */}
        <Route element={<ModuleGuard module="DA" />}>
          <Route path="da/goi-thau" element={<BiddingListPage />} />
          <Route path="da/goi-thau/tao-moi" element={<BiddingCreatePage />} />
          <Route path="da/goi-thau/:id" element={<BiddingDetailPage />} />
          <Route path="da/don-gia" element={<UnitPriceListPage />} />
        </Route>

        {/* TK — Thiết kế đa bộ môn (TK-01 → TK-08). TK-10 → TK-17 chưa làm. */}
        <Route element={<ModuleGuard module="TK" />}>
          <Route path="tk/du-an" element={<DesignListPage />} />
          <Route path="tk/du-an/tao-moi" element={<DesignCreatePage />} />
          <Route path="tk/du-an/:id" element={<DesignDetailPage />} />
        </Route>

        {/* HD — Hợp đồng (HD-01 → HD-05). Không có màn hình "tạo mới": hợp đồng soạn
                  từ hồ sơ nguồn ở CRM/DA/TK, không nhập lại dữ liệu đã có (PRD 2.3). */}
        <Route element={<ModuleGuard module="HD" />}>
          <Route path="hd/hop-dong" element={<ContractListPage />} />
          <Route path="hd/hop-dong/:id" element={<ContractDetailPage />} />
        </Route>

        {/* TC — Thi công và ngân sách công trình (TC-01 → TC-08). Không có màn hình
                  "tạo mới": công trình mở từ hợp đồng đã ký, hoặc tự mở khi hồ sơ thiết kế
                  được bàn giao cho Ban công trường (TK-08). */}
        <Route element={<ModuleGuard module="TC" />}>
          <Route path="tc/cong-trinh" element={<SiteListPage />} />
          <Route path="tc/cong-trinh/:id" element={<SiteDetailPage />} />
        </Route>

        {/* MH — Mua hàng và vật tư (MH-01 → MH-08). Không có màn hình "tạo đơn hàng":
                  đơn hàng lập từ đề nghị đã duyệt và báo giá đã chọn, không đặt trước rồi
                  trình duyệt sau (MH-02, MH-04). */}
        <Route element={<ModuleGuard module="MH" />}>
          <Route path="mh/de-nghi-mua" element={<PurchaseRequestListPage />} />
          <Route path="mh/de-nghi-mua/tao-moi" element={<PurchaseRequestCreatePage />} />
          <Route path="mh/de-nghi-mua/:id" element={<PurchaseRequestDetailPage />} />
          <Route path="mh/don-hang" element={<PurchaseOrderListPage />} />
          <Route path="mh/don-hang/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="mh/nha-cung-cap" element={<SupplierListPage />} />
          <Route path="mh/nha-cung-cap/:id" element={<SupplierDetailPage />} />
        </Route>

        {/* KHO — nhập, xuất, điều chuyển, kiểm kê (KHO-01 → KHO-09). Không có màn hình
                  sửa tồn: sổ kho chỉ đổi qua phiếu, và phiếu điều chỉnh kiểm kê chỉ sinh ra
                  sau khi biên bản được phê duyệt (KHO-07). */}
        <Route element={<ModuleGuard module="KHO" />}>
          <Route path="kho/quet-ma" element={<StockScanPage />} />
          <Route path="kho/ton-kho" element={<InventoryListPage />} />
          <Route path="kho/phieu" element={<StockMovementPage />} />
          <Route path="kho/kiem-ke" element={<StocktakePage />} />
          <Route path="kho/gian-giao" element={<ScaffoldingPage />} />
          <Route path="kho/vat-tu" element={<MaterialListPage />} />
          <Route path="kho/danh-muc-kho" element={<WarehouseListPage />} />
        </Route>

        {/* KT — kế toán và tài chính (KT-01 → KT-09). Không có màn hình "sửa số đã chi":
                  tiền chỉ ghi nhận trên một đề nghị đã đi hết bốn bước, và kỳ đã khóa thì
                  chính cơ sở dữ liệu từ chối mọi thay đổi mang ngày trong kỳ. */}
        <Route element={<ModuleGuard module="KT" />}>
          <Route path="kt/de-nghi-thanh-toan" element={<PaymentRequestListPage />} />
          <Route path="kt/de-nghi-thanh-toan/tao-moi" element={<PaymentRequestCreatePage />} />
          <Route path="kt/de-nghi-thanh-toan/:id" element={<PaymentRequestDetailPage />} />
          <Route path="kt/tam-ung" element={<AdvanceListPage />} />
          <Route path="kt/cong-no" element={<ReceivablePage />} />
          <Route path="kt/dong-tien" element={<CashFlowPage />} />
          <Route path="kt/ky-ke-toan" element={<AccountingPeriodPage />} />
        </Route>

        {/* NS — hành chính và nhân sự (NS-01 → NS-11). Chấm công ba khối là màn hình nặng
                  nhất: nó gom việc của ba người khác nhau, nên trạng thái từng khối phải đọc
                  được ngay chứ không nằm trong một danh sách phẳng. */}
        <Route element={<ModuleGuard module="NS" />}>
          <Route path="ns/viec-can-xu-ly" element={<HrDashboardPage />} />
          <Route path="ns/nhan-su" element={<EmployeeListPage />} />
          <Route path="ns/nhan-su/tao-moi" element={<EmployeeCreatePage />} />
          <Route path="ns/nhan-su/:id" element={<EmployeeDetailPage />} />
          <Route path="ns/cham-cong" element={<TimesheetPage />} />
          <Route path="ns/giay-to" element={<HrDocumentPage />} />
          <Route path="ns/tai-san" element={<AssetPage />} />
          <Route path="ns/nghi-phep" element={<LeavePage />} />
          <Route path="ns/tuyen-dung" element={<RecruitmentPage />} />
        </Route>

        {/* SX — sản xuất và cho thuê giàn giáo (SX-01 → SX-03, định hướng — PRD Mục 10).
                  Cho thuê giàn giáo (SX-03) đứng trước vì đã đủ thông tin triển khai; lệnh
                  sản xuất (SX-01) còn "cần xác nhận thêm". */}
        <Route element={<ModuleGuard module="SX" />}>
          <Route path="sx/tai-san-cho-thue" element={<RentalAgreementListPage />} />
          <Route path="sx/tai-san-cho-thue/:id" element={<RentalAgreementDetailPage />} />
          <Route path="sx/lenh-san-xuat" element={<ProductionOrderListPage />} />
          <Route path="sx/lenh-san-xuat/:id" element={<ProductionOrderDetailPage />} />
        </Route>

        {/* Hộp thư Phê duyệt — MỘT màn hình cho mọi module (Webapp Flow 4.6),
                  nên nằm ở gốc chứ không thuộc đường dẫn của module nào. KHÔNG bọc
                  `ModuleGuard`: nó gom hồ sơ từ mọi phân hệ, và mỗi dòng đã tự lọc theo
                  hạn mức phê duyệt của vai trò (Mẫu RLS C). */}
        <Route path="viec-can-lam" element={<ApprovalInboxPage />} />

        {/* Trang trưng bày thành phần giao diện — công cụ nội bộ của đội triển khai. */}
        <Route element={<ModuleGuard module="NEN" />}>
          <Route path="nen/giao-dien" element={<DesignShowcasePage />} />
        </Route>
        {MODULE_CODES.filter(
          (
            c,
          ): c is Exclude<
            ModuleCode,
            'BC' | 'CRM' | 'DA' | 'TK' | 'HD' | 'TC' | 'MH' | 'KHO' | 'KT' | 'NS' | 'SX'
          > =>
            c !== 'BC' &&
            c !== 'CRM' &&
            c !== 'DA' &&
            c !== 'TK' &&
            c !== 'HD' &&
            c !== 'TC' &&
            c !== 'MH' &&
            c !== 'KHO' &&
            c !== 'KT' &&
            c !== 'NS' &&
            c !== 'SX',
        ).map((code) => (
          <Route key={code} element={<ModuleGuard module={code} />}>
            <Route path={MODULE_PATHS[code]} element={<PlaceholderPage moduleCode={code} />} />
          </Route>
        ))}
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>,
  ),
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* `AuthProvider` nằm NGOÀI router: nó không dùng hook điều hướng nào, và để ngoài thì
          phiên đăng nhập không bị dựng lại mỗi lần router đổi trang. */}
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
