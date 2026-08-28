/**
 * Dashboard — mẫu bố cục 1 (Webapp Flow Mục 4.1), Module BC mức cơ bản (PRD BC-01).
 *
 * Ba quy tắc của mẫu này, và cách màn hình tuân thủ:
 *
 *  1. "Mỗi thẻ đều bấm được, dẫn thẳng đến danh sách đã lọc sẵn theo đúng điều kiện của thẻ
 *     đó — không phải màn hình chỉ để xem." Vì vậy mỗi con số ở đây là một liên kết tới
 *     danh sách kèm tham số `trang-thai`, và con số đó ĐƯỢC ĐẾM THEO ĐÚNG hàm mà danh sách
 *     dùng để hiển thị trạng thái (`contractDisplayStatus`, `biddingDisplayStatus`…). Đây là
 *     lý do màn hình dùng lại đúng các hook của danh sách thay vì tự viết truy vấn đếm: hai
 *     truy vấn khác nhau sẽ lệch nhau vào đúng ngày một hồ sơ quá hạn. Cùng lý do đó, đường
 *     dẫn PHẢI mang theo cả kỳ báo cáo đang chọn — thẻ đếm trong kỳ mà danh sách hiện mọi hồ
 *     sơ từ trước tới nay thì hai con số khác nhau ngay ở trạng thái mặc định.
 *  2. "Vùng trên cùng luôn có bộ lọc nhanh theo pháp nhân/khoảng thời gian, giữ trạng thái
 *     khi quay lại." Pháp nhân là bộ chọn ở thanh bên (Webapp Flow 2.2); khoảng thời gian là
 *     bộ lọc ở đây, lưu trên thanh địa chỉ nên quay lại không mất.
 *  3. Webapp Flow 6.1: tác vụ lặp hằng ngày có nút truy cập nhanh ngay trên Dashboard.
 *
 * Chỉ hiện chỉ số của module người dùng ĐƯỢC XEM (Webapp Flow 6.5 — ẩn, không hiện rồi báo
 * lỗi), và chỉ của phần nghiệp vụ đã có dữ liệu thật. Phần BC-01 còn thiếu được nói thẳng ở
 * cuối trang thay vì dựng thẻ rỗng: trên màn hình điều hành, số 0 và "chưa có dữ liệu" nhìn
 * giống hệt nhau nhưng dẫn tới hai quyết định trái ngược (PRD BC-06).
 *
 * Lớp vỏ thị giác theo "dashboard soft light style" (DESIGN_SYSTEM.md) — KpiCard/PillBadge/
 * SegmentedControl là component dùng chung, sẽ tái dùng dần ở các module khác.
 */

import {
  AlertTriangle,
  Boxes,
  Clock,
  Compass,
  FileSignature,
  FileText,
  Info,
  Percent,
  Receipt,
  Scale,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BUTTONS,
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  DEFAULT_DASHBOARD_PERIOD,
  OPPORTUNITY_STAGE_META,
  PENDING_APPROVAL_AGING_DAYS,
  STATUS_GROUPS,
  biddingDisplayStatus,
  contractDisplayStatus,
  conversionRate,
  countByStatus,
  dashboardGreeting,
  designDisplayStatus,
  formatCurrency,
  formatPercent,
  isDashboardPeriod,
  isStalePendingApproval,
  isWithinPeriod,
  periodStartDate,
  shortNameFromFullName,
  statusLabel,
  sumMoney,
  toMoney,
  toNvgDateInput,
  type DashboardPeriod,
  type MoneyValue,
  type StatusGroup,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { PERIOD_FILTER_PARAM, listPathFiltered } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { KpiCard, KpiEmptyBlock, PillBadge } from '@/components/ui/kpi-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useCashFlow, useReceivables } from '@/hooks/use-accounting';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { useBiddingProjects } from '@/hooks/use-bidding-projects';
import { useContracts } from '@/hooks/use-contracts';
import { useDesignProjects } from '@/hooks/use-design-projects';
import { useTimesheets } from '@/hooks/use-hr';
import { useOpportunities } from '@/hooks/use-opportunities';
import { useSitesBudgetStatus } from '@/hooks/use-reports';
import { useRentalAgreements } from '@/hooks/use-sx';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';

/** Mốc xa nhất khi kỳ đang chọn là "Tất cả" — dòng tiền cần một mốc bắt đầu thật, không phải null. */
const CASH_FLOW_EPOCH = '2000-01-01';

/** Một hồ sơ đã quy về dạng tối thiểu mà Dashboard cần: trạng thái, tiền, ngày lập. */
interface MetricRecord {
  status: StatusGroup;
  value: MoneyValue | null;
  createdAt: string;
}

/**
 * Icon + màu tint riêng cho ô icon của từng thẻ module trên Dashboard — trang trí, KHÔNG phải
 * icon nhận diện module ở sidebar (`module-nav.ts`: MODULE_ICONS phục vụ mục đích khác, một
 * khái niệm luôn một icon xuyên suốt điều hướng — Content Guidelines 6.6). Bốn tint lấy từ bản
 * demo: mint (CRM), amber (DA), teal (TK), forest-tint (HD).
 */
const MODULE_KPI_ICON: Record<string, { icon: LucideIcon; well: string }> = {
  CRM: { icon: TrendingUp, well: 'bg-brand-subtle text-brand-hover' },
  DA: { icon: FileText, well: 'bg-tint-amber-bg text-tint-amber' },
  TK: { icon: Compass, well: 'bg-tint-teal-bg text-tint-teal' },
  HD: { icon: FileSignature, well: 'bg-tint-forest-bg text-brand' },
};

export function DashboardPage() {
  const { profile } = useAuth();
  const scope = useCompanyScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodParam = searchParams.get(PERIOD_FILTER_PARAM);
  const period: DashboardPeriod = isDashboardPeriod(periodParam)
    ? periodParam
    : DEFAULT_DASHBOARD_PERIOD;

  function setPeriod(value: DashboardPeriod) {
    const next = new URLSearchParams(searchParams);
    if (value === DEFAULT_DASHBOARD_PERIOD) next.delete(PERIOD_FILTER_PARAM);
    else next.set(PERIOD_FILTER_PARAM, value);
    setSearchParams(next, { replace: true });
  }

  const canViewCrm = useCan('CRM');
  const canViewDa = useCan('DA');
  const canViewTk = useCan('TK');
  const canViewHd = useCan('HD');
  const canViewBc = useCan('BC');
  const canViewKt = useCan('KT');
  const canViewSx = useCan('SX');
  const canViewNs = useCan('NS');

  const opportunities = useOpportunities({ enabled: canViewCrm });
  const biddingProjects = useBiddingProjects({ enabled: canViewDa });
  const designProjects = useDesignProjects({ enabled: canViewTk });
  const contracts = useContracts({ enabled: canViewHd });

  // Cùng nguồn dữ liệu với Hộp thư Phê duyệt và huy hiệu trên thanh trên cùng — ba chỗ hiển
  // thị cùng một con số thì phải đọc từ cùng một truy vấn, nếu không sẽ có lúc lệch nhau.
  const { data: pendingApprovals } = usePendingApprovals();

  // Bốn thẻ dưới đây lấp phần BC-01 còn thiếu (dòng tiền, công nợ, giàn giáo cho thuê, chấm
  // công) — dùng thẳng hook đã có của từng module, KHÔNG tạo endpoint tổng hợp riêng, để một
  // con số không bao giờ nói khác với danh sách nó dẫn tới.
  const today = toNvgDateInput(new Date());
  const cashFlow = useCashFlow(periodStartDate(period) ?? CASH_FLOW_EPOCH, today, {
    enabled: canViewKt,
  });
  const receivables = useReceivables('phai_thu', { enabled: canViewKt });
  const rentalAgreements = useRentalAgreements({ enabled: canViewSx });
  const now = new Date();
  const timesheets = useTimesheets(now.getFullYear(), now.getMonth() + 1, undefined, {
    enabled: canViewNs,
  });

  // Nguồn rủi ro "vượt ngân sách" của thẻ Quá hạn (BC-05) — một lượt gọi tổng hợp CẢ công
  // trình (0058_bc_over_budget.sql), không lặp `useSiteBudgetStatus` theo từng site (N+1).
  const sitesBudgetStatus = useSitesBudgetStatus(canViewBc);

  const inPeriod = (r: MetricRecord) => isWithinPeriod(r.createdAt, period);

  const opportunityRecords: MetricRecord[] = (opportunities.data ?? [])
    .map((o) => ({
      status: OPPORTUNITY_STAGE_META[o.stage].statusGroup,
      value: o.estimated_value,
      createdAt: o.created_at,
    }))
    .filter(inPeriod);

  const biddingRecords: MetricRecord[] = (biddingProjects.data ?? [])
    .map((p) => ({
      status: biddingDisplayStatus(p.stage, p.submission_deadline),
      value: p.estimated_value,
      createdAt: p.created_at,
    }))
    .filter(inPeriod);

  const designRecords: MetricRecord[] = (designProjects.data ?? [])
    .map((p) => ({
      status: designDisplayStatus(p.stage, p.handover_deadline),
      value: null,
      createdAt: p.created_at,
    }))
    .filter(inPeriod);

  const contractRecords: MetricRecord[] = (contracts.data ?? [])
    .map((c) => ({
      status: contractDisplayStatus(c.stage, c.end_date),
      value: c.value,
      createdAt: c.created_at,
    }))
    .filter(inPeriod);

  // Tỷ lệ chuyển đổi tính trên TOÀN BỘ cơ hội trong kỳ, kể cả cơ hội đã mất — bỏ cơ hội mất
  // ra khỏi mẫu số thì tỷ lệ luôn đẹp và không còn nói lên điều gì (PRD CRM-09).
  const wonOpportunities = (opportunities.data ?? []).filter(
    (o) => o.stage === 'ky_hop_dong' && isWithinPeriod(o.created_at, period),
  ).length;
  const conversion = conversionRate(wonOpportunities, opportunityRecords.length);

  // Giá trị pipeline = cơ hội CHƯA kết thúc. Cộng cả cơ hội đã ký lẫn đã mất vào đây là tự
  // báo cáo một con số không còn thật (PRD CRM-02).
  const pipelineValue = sumMoney(
    (opportunities.data ?? [])
      .filter(
        (o) => !OPPORTUNITY_STAGE_META[o.stage].isTerminal && isWithinPeriod(o.created_at, period),
      )
      .map((o) => o.estimated_value),
  );

  const signedContractValue = sumMoney(
    (contracts.data ?? [])
      .filter((c) => c.signed_date !== null && isWithinPeriod(c.signed_date, period))
      .map((c) => c.value),
  );

  const modules: ModuleMetric[] = [
    canViewCrm && {
      key: 'CRM',
      title: 'Cơ hội kinh doanh',
      hint: 'Cơ hội lập trong kỳ, theo giai đoạn của phễu bán hàng',
      basePath: '/crm/co-hoi',
      records: opportunityRecords,
      isLoading: opportunities.isLoading,
      // Thẻ có nhiều chỉ số phụ nhất — số liệu chính dùng cỡ hero (34px/800) để nổi bật, giống
      // đúng vai trò "thẻ chi tiết nhất" của nó trong bản demo tham chiếu.
      hero: true,
      highlights: [
        { label: 'Giá trị đang theo đuổi', text: formatCurrency(pipelineValue) },
        {
          label: 'Tỷ lệ chốt hợp đồng',
          text: conversion === null ? 'Chưa có cơ hội nào trong kỳ' : formatPercent(conversion),
        },
      ],
    },
    canViewDa && {
      key: 'DA',
      title: 'Gói thầu',
      hint: 'Gói thầu lập trong kỳ',
      basePath: '/da/goi-thau',
      records: biddingRecords,
      isLoading: biddingProjects.isLoading,
      highlights: [],
    },
    canViewTk && {
      key: 'TK',
      title: 'Dự án thiết kế',
      hint: 'Dự án thiết kế lập trong kỳ',
      basePath: '/tk/du-an',
      records: designRecords,
      isLoading: designProjects.isLoading,
      highlights: [],
    },
    canViewHd && {
      key: 'HD',
      title: 'Hợp đồng',
      hint: 'Hợp đồng lập trong kỳ',
      basePath: '/hd/hop-dong',
      records: contractRecords,
      isLoading: contracts.isLoading,
      highlights: [{ label: 'Giá trị đã ký trong kỳ', text: formatCurrency(signedContractValue) }],
    },
  ].filter(Boolean) as ModuleMetric[];

  const pendingCount = pendingApprovals?.length ?? 0;
  const pendingValue = sumMoney((pendingApprovals ?? []).map((a) => a.amount));
  const canApproveAnything = (profile?.permissions ?? []).some((p) => p.canApprove);
  const staleApprovals = (pendingApprovals ?? []).filter((a) =>
    isStalePendingApproval(a.requested_at),
  );

  const cashFlowRows = cashFlow.data ?? [];
  const cashFlowTotal = sumMoney(cashFlowRows.map((r) => r.closing_balance));
  const cashFlowShortfallCount = cashFlowRows.filter((r) => toMoney(r.closing_balance) < 0n).length;

  // Chỉ đếm khoản CÒN NỢ (chưa thu hết), đúng vế "phần CÒN LẠI" mà bảng tuổi nợ dùng — cộng
  // theo giá trị gốc sẽ báo một khoản nợ xấu không tồn tại (CLAUDE.md 3.4).
  const outstandingReceivables = (receivables.data ?? []).filter(
    (r) => toMoney(r.amount) - toMoney(r.settled_amount) > 0n,
  );
  const receivableRemainingTotal = sumMoney(
    outstandingReceivables.map((r) => toMoney(r.amount) - toMoney(r.settled_amount)),
  );
  const receivableOverdueCount = outstandingReceivables.filter(
    (r) => r.due_date !== null && r.due_date < today,
  ).length;

  const activeRentals = (rentalAgreements.data ?? []).filter((r) => r.status === 'dang_thue');

  // Số công trình vượt ngân sách — `health` đã tính sẵn ở CSDL (0071), cùng công thức
  // summarizeBudget()/BudgetPanel (TC-05). KHÔNG tự tính lại từ ba cột tiền: với vai trò
  // không xem được giá vốn, ba cột đó là null (Mẫu D) nên tự tính sẽ luôn ra "trong ngân sách".
  const overBudgetSiteCount = (sitesBudgetStatus.data ?? []).filter(
    (s) => s.health === 'vuot_ngan_sach',
  ).length;

  // Thẻ "Quá hạn" gộp mọi nguồn rủi ro thời hạn về một chỗ (BC-05) — hồ sơ 4 module gốc, công
  // nợ quá hạn thu, phê duyệt bị để lâu, và công trình vượt ngân sách. Đích của mục vượt ngân
  // sách trỏ tới danh sách Công trình (TC-01) đã lọc `?ngan-sach=vuot` — cùng
  // `useSitesBudgetStatus` với ở đây, nên con số trên thẻ và trên danh sách không thể lệch.
  const overdueByModule = modules
    .map((m) => ({
      key: m.key,
      title: m.title,
      count: countByStatus(m.records).overdue,
      to: listPathFiltered(m.basePath, { status: 'overdue', period }),
    }))
    .filter((m) => m.count > 0);
  const overdueRisks = [
    ...overdueByModule,
    canViewKt &&
      receivableOverdueCount > 0 && {
        key: 'KT-receivables',
        title: 'Công nợ phải thu',
        count: receivableOverdueCount,
        to: '/kt/cong-no',
      },
    canApproveAnything &&
      staleApprovals.length > 0 && {
        key: 'approvals-stale',
        title: `Chờ phê duyệt quá ${PENDING_APPROVAL_AGING_DAYS} ngày`,
        count: staleApprovals.length,
        to: '/viec-can-lam',
      },
    canViewBc &&
      overBudgetSiteCount > 0 && {
        key: 'TC-over-budget',
        title: 'Công trình vượt ngân sách',
        count: overBudgetSiteCount,
        to: '/tc/cong-trinh?ngan-sach=vuot',
      },
  ].filter(Boolean) as { key: string; title: string; count: number; to: string }[];
  const overdueTotal = overdueRisks.reduce((sum, m) => sum + m.count, 0);

  const timesheetMonthLabel = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const closedTimesheetCount = timesheets.data?.length ?? 0;

  const currentCompany =
    profile?.assignments.find((a) => a.companyId === scope.companyId) ?? profile?.assignments[0];

  // Lời chào cá nhân hoá bằng TÊN là NGOẠI LỆ DUY NHẤT của quy tắc không dùng đại từ
  // nhân xưng (Content Guidelines 4.2) — dùng tên, không dùng anh/chị.
  const greeting = dashboardGreeting(shortNameFromFullName(profile?.fullName));

  return (
    <>
      <PageHeader
        title={greeting}
        size="hero"
        description={
          currentCompany
            ? `${currentCompany.companyShortName} · ${currentCompany.roleLabel}`
            : undefined
        }
        actions={<QuickActions />}
      />

      {/* Bộ lọc nhanh theo khoảng thời gian — Webapp Flow 4.1. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold tracking-wide text-fg-subtle">KỲ BÁO CÁO</span>
        <SegmentedControl
          options={DASHBOARD_PERIODS}
          value={period}
          onChange={setPeriod}
          getLabel={(p) => DASHBOARD_PERIOD_LABELS[p]}
        />
        {scope.isAggregate && (
          // Dấu hiệu chế độ gộp — thông tin về PHẠM VI đang xem, không phải tình trạng của hồ
          // sơ nào, nên tái dùng tông "Chờ duyệt" (chú ý, chưa khẩn cấp) thay vì màu thương hiệu.
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-status-pending-bg',
              'bg-status-pending-bg px-3 py-1.5 text-xs font-medium text-status-pending',
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-status-pending" />
            Đang gộp số liệu mọi pháp nhân. Chọn một pháp nhân ở thanh bên để xem riêng.
          </span>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          title="Chờ phê duyệt"
          hint="Hồ sơ nằm trong hạn mức phê duyệt của vai trò hiện tại"
          icon={Clock}
        >
          {!canApproveAnything ? (
            <KpiEmptyBlock label="Vai trò hiện tại không có quyền phê duyệt." />
          ) : pendingCount === 0 ? (
            <KpiEmptyBlock label="Không có hồ sơ nào đang chờ phê duyệt." />
          ) : (
            <Link to="/viec-can-lam" className="mt-auto block hover:underline">
              <span className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight tabular-nums">
                  {pendingCount}
                </span>
                <StatusLozenge status="pending_approval" />
              </span>
              {pendingValue > 0n && (
                <span className="mt-1 block text-xs text-fg-subtle">
                  Tổng giá trị {formatCurrency(pendingValue)}
                </span>
              )}
            </Link>
          )}
        </KpiCard>

        <KpiCard
          title="Quá hạn"
          hint="Hồ sơ vượt thời hạn xử lý, công nợ quá hạn thu và phê duyệt bị để lâu — gộp mọi phân hệ"
          icon={AlertTriangle}
          iconWellClassName="bg-status-overdue-bg text-status-overdue"
        >
          {overdueTotal === 0 ? (
            <KpiEmptyBlock label="Không có rủi ro nào đang quá hạn." />
          ) : (
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight tabular-nums text-status-overdue">
                  {overdueTotal}
                </span>
                <StatusLozenge status="overdue" />
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {overdueRisks.map((m) => (
                  <li key={m.key}>
                    <Link to={m.to} className="font-medium text-brand hover:underline">
                      {m.title}: {m.count}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </KpiCard>

        {canViewBc && (
          <KpiCard
            title="Lãi/lỗ theo công trình"
            hint="Doanh thu hợp đồng so với chi phí đã phát sinh, truy ngược tới chứng từ gốc"
            icon={Scale}
            iconWellClassName="bg-tint-teal-bg text-tint-teal"
          >
            <Link to="/bc/lai-lo" className="mt-auto block font-medium text-brand hover:underline">
              Xem báo cáo lãi/lỗ →
            </Link>
          </KpiCard>
        )}

        {canViewBc && (
          <KpiCard
            title="Hiệu quả kinh doanh"
            hint="Nguồn khách, phễu bán hàng, tỷ lệ trúng thầu và nguyên nhân trượt thầu"
            icon={Percent}
            iconWellClassName="bg-tint-amber-bg text-tint-amber"
          >
            <Link
              to="/bc/hieu-qua-kinh-doanh"
              className="mt-auto block font-medium text-brand hover:underline"
            >
              Xem báo cáo hiệu quả kinh doanh →
            </Link>
          </KpiCard>
        )}

        {canViewKt && (
          <KpiCard
            title="Dòng tiền"
            hint="Số dư cuối kỳ dự kiến, cộng cả khoản đã duyệt chưa chi — từ đầu kỳ báo cáo tới hôm nay"
            icon={Wallet}
            iconWellClassName="bg-tint-amber-bg text-tint-amber"
          >
            {cashFlow.isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded-sm bg-surface-hover" />
            ) : cashFlowRows.length === 0 ? (
              <KpiEmptyBlock label="Chưa có số liệu dòng tiền." />
            ) : (
              <Link to="/kt/dong-tien" className="mt-auto block hover:underline">
                <span
                  className={cn(
                    'text-3xl font-extrabold tracking-tight tabular-nums',
                    cashFlowTotal < 0n && 'text-status-overdue',
                  )}
                >
                  {formatCurrency(cashFlowTotal)}
                </span>
                {cashFlowShortfallCount > 0 && (
                  <span className="mt-1 block text-xs text-status-overdue">
                    {cashFlowShortfallCount} pháp nhân dự kiến thiếu hụt
                  </span>
                )}
              </Link>
            )}
          </KpiCard>
        )}

        {canViewKt && (
          <KpiCard
            title="Công nợ phải thu"
            hint="Phần CÒN LẠI của các khoản khách hàng chưa trả hết, không tính giá trị gốc"
            icon={Receipt}
            iconWellClassName="bg-tint-teal-bg text-tint-teal"
          >
            {receivables.isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded-sm bg-surface-hover" />
            ) : outstandingReceivables.length === 0 ? (
              <KpiEmptyBlock label="Không còn khoản nào phải thu." />
            ) : (
              <Link to="/kt/cong-no" className="mt-auto block hover:underline">
                <span className="text-3xl font-extrabold tracking-tight tabular-nums">
                  {formatCurrency(receivableRemainingTotal)}
                </span>
                {receivableOverdueCount > 0 && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-status-overdue">
                    {receivableOverdueCount} khoản đã quá hạn
                  </span>
                )}
              </Link>
            )}
          </KpiCard>
        )}

        {canViewSx && (
          <KpiCard
            title="Giàn giáo đang cho thuê"
            hint="Hợp đồng cho thuê chưa thu hồi"
            icon={Boxes}
            iconWellClassName="bg-tint-forest-bg text-brand"
          >
            {rentalAgreements.isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded-sm bg-surface-hover" />
            ) : activeRentals.length === 0 ? (
              <KpiEmptyBlock label="Không có hợp đồng cho thuê nào đang mở." />
            ) : (
              <Link
                to="/sx/tai-san-cho-thue"
                className="mt-auto flex items-baseline gap-2 hover:underline"
              >
                <span className="text-3xl font-extrabold tracking-tight tabular-nums">
                  {activeRentals.length}
                </span>
                <span className="text-xs font-medium text-fg-subtle">hợp đồng</span>
              </Link>
            )}
          </KpiCard>
        )}

        {canViewNs && (
          <KpiCard
            title="Chấm công đã chốt"
            hint={`Bảng công tháng ${timesheetMonthLabel} đã chuyển sang Kế toán`}
            icon={Users}
            iconWellClassName="bg-brand-subtle text-brand-hover"
          >
            {timesheets.isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded-sm bg-surface-hover" />
            ) : closedTimesheetCount === 0 ? (
              <KpiEmptyBlock label={`Tháng ${timesheetMonthLabel} chưa chốt bảng công nào.`} />
            ) : (
              <Link
                to="/ns/cham-cong"
                className="mt-auto flex items-baseline gap-2 hover:underline"
              >
                <span className="text-3xl font-extrabold tracking-tight tabular-nums">
                  {closedTimesheetCount}
                </span>
                <span className="text-xs font-medium text-fg-subtle">nhân sự</span>
              </Link>
            )}
          </KpiCard>
        )}

        {modules.map((m) => (
          <ModuleCard key={m.key} metric={m} period={period} />
        ))}
      </section>

      <DataCompletenessNote />
    </>
  );
}

interface ModuleMetric {
  key: string;
  title: string;
  hint: string;
  /** Danh sách mà mọi con số trên thẻ dẫn tới. */
  basePath: string;
  records: MetricRecord[];
  isLoading: boolean;
  /** Chỉ số riêng của module, đặt dưới phần đếm theo trạng thái. */
  highlights: { label: string; text: string }[];
  /** Thẻ nhiều chỉ số phụ nhất — số liệu chính dùng cỡ hero (34px/800). */
  hero?: boolean;
}

/**
 * Một thẻ chỉ số của module.
 *
 * Đếm theo ĐÚNG 5 nhóm trạng thái chuẩn chứ không tự gộp thành "đang xử lý" cho gọn: mỗi con
 * số phải tương ứng với đúng MỘT bộ lọc trên danh sách đích, nếu không thì bấm vào thẻ sẽ ra
 * số khác với số trên thẻ — đúng cái mà Webapp Flow 4.1 cấm.
 */
function ModuleCard({ metric, period }: { metric: ModuleMetric; period: DashboardPeriod }) {
  const counts = countByStatus(metric.records);
  const present = STATUS_GROUPS.filter((s) => counts[s] > 0);
  const iconMeta = MODULE_KPI_ICON[metric.key];

  return (
    <KpiCard
      title={metric.title}
      hint={metric.hint}
      icon={iconMeta?.icon ?? FileText}
      iconWellClassName={iconMeta?.well}
    >
      {metric.isLoading ? (
        <div className="h-8 w-24 animate-pulse rounded-sm bg-surface-hover" />
      ) : metric.records.length === 0 ? (
        <KpiEmptyBlock label="Chưa có hồ sơ nào trong kỳ này." />
      ) : (
        <div className="mt-auto flex flex-col gap-2.5">
          <Link
            to={listPathFiltered(metric.basePath, { period })}
            className="flex items-baseline gap-2 hover:underline"
          >
            <span
              className={cn(
                'font-extrabold tracking-tight tabular-nums',
                metric.hero
                  ? 'text-(length:--text-hero) leading-(--text-hero--line-height)'
                  : 'text-3xl',
              )}
            >
              {metric.records.length}
            </span>
            <span className="text-xs font-medium text-fg-subtle">hồ sơ</span>
          </Link>

          <div className="flex flex-wrap gap-1.5">
            {present.map((s) => (
              <Link key={s} to={listPathFiltered(metric.basePath, { status: s, period })}>
                <PillBadge tone={s === 'completed' ? 'positive' : 'neutral'}>
                  {statusLabel(s)}: {counts[s]}
                </PillBadge>
              </Link>
            ))}
          </div>

          {metric.highlights.length > 0 && (
            <dl className="flex flex-col gap-1.5 border-t border-border pt-2.5 text-xs">
              {metric.highlights.map((h) => (
                <div key={h.label} className="flex items-baseline justify-between gap-2">
                  <dt className="text-fg-subtle">{h.label}</dt>
                  <dd className="font-bold tabular-nums">{h.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </KpiCard>
  );
}

/**
 * Nút truy cập nhanh cho tác vụ lặp hằng ngày — Webapp Flow 6.1.
 *
 * Chỉ hiện đúng những gì vai trò hiện tại được tạo. Hợp đồng KHÔNG có mặt ở đây là có chủ ý:
 * hợp đồng soạn TỪ hồ sơ nguồn chứ không tạo từ màn hình trắng (PRD HD-01).
 */
function QuickActions() {
  const canCreateCrm = useCan('CRM', 'create');
  const canCreateDa = useCan('DA', 'create');
  const canCreateTk = useCan('TK', 'create');

  return (
    <>
      {canCreateCrm && (
        <Button variant="secondary" asChild>
          <Link to="/crm/co-hoi/tao-moi">{BUTTONS.create('cơ hội')}</Link>
        </Button>
      )}
      {canCreateDa && (
        <Button variant="secondary" asChild>
          <Link to="/da/goi-thau/tao-moi">{BUTTONS.create('gói thầu')}</Link>
        </Button>
      )}
      {canCreateTk && (
        <Button variant="secondary" asChild>
          <Link to="/tk/du-an/tao-moi">{BUTTONS.create('dự án thiết kế')}</Link>
        </Button>
      )}
    </>
  );
}

/**
 * Mức độ hoàn thiện của dữ liệu — PRD BC-06.
 *
 * BC-01 liệt kê mười nhóm chỉ số cho màn hình buổi sáng của Ban Giám đốc. Dòng tiền, công nợ
 * phải thu, giàn giáo cho thuê, chấm công và (từ 0058_bc_over_budget.sql) công trình vượt
 * ngân sách đã lên thẻ. Phần còn thiếu vẫn nói thẳng ra thay vì dựng thẻ hiện số 0 — số 0 đọc
 * ra là "không có việc gì", còn sự thật là "chưa đo được".
 */
function DataCompletenessNote() {
  return (
    <section className="mt-6 flex items-start gap-3.5 rounded-lg border border-border bg-surface p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand-subtle text-brand-forest">
        <Info className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-md font-bold tracking-tight">Phần chưa có trên Dashboard</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-subtle">
          Tồn kho vật tư, hiệu quả kinh doanh (nguồn khách, phễu bán hàng, tỷ lệ trúng thầu) và báo
          cáo tổng hợp toàn NVG truy ngược xuống từng pháp nhân/phòng ban chưa có trên Dashboard.
          Các chỉ số đang hiển thị lấy trực tiếp từ hồ sơ nghiệp vụ, không phải số liệu mẫu.
        </p>
      </div>
    </section>
  );
}
