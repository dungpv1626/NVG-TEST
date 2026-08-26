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
 *     truy vấn khác nhau sẽ lệch nhau vào đúng ngày một hồ sơ quá hạn.
 *  2. "Vùng trên cùng luôn có bộ lọc nhanh theo pháp nhân/khoảng thời gian, giữ trạng thái
 *     khi quay lại." Pháp nhân là bộ chọn ở thanh bên (Webapp Flow 2.2); khoảng thời gian là
 *     bộ lọc ở đây, lưu trên thanh địa chỉ nên quay lại không mất.
 *  3. Webapp Flow 6.1: tác vụ lặp hằng ngày có nút truy cập nhanh ngay trên Dashboard.
 *
 * Chỉ hiện chỉ số của module người dùng ĐƯỢC XEM (Webapp Flow 6.5 — ẩn, không hiện rồi báo
 * lỗi), và chỉ của phần nghiệp vụ đã có dữ liệu thật. Phần BC-01 còn thiếu được nói thẳng ở
 * cuối trang thay vì dựng thẻ rỗng: trên màn hình điều hành, số 0 và "chưa có dữ liệu" nhìn
 * giống hệt nhau nhưng dẫn tới hai quyết định trái ngược (PRD BC-06).
 */

import { Link, useSearchParams } from 'react-router-dom';
import {
  BUTTONS,
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  DEFAULT_DASHBOARD_PERIOD,
  OPPORTUNITY_STAGE_META,
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
  isWithinPeriod,
  statusLabel,
  sumMoney,
  type DashboardPeriod,
  type MoneyValue,
  type StatusGroup,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { listPathByStatus } from '@/components/entity/entity-table';
import { Button } from '@/components/ui/button';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { useBiddingProjects } from '@/hooks/use-bidding-projects';
import { useContracts } from '@/hooks/use-contracts';
import { useDesignProjects } from '@/hooks/use-design-projects';
import { useOpportunities } from '@/hooks/use-opportunities';
import { useAuth, useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';

/** Một hồ sơ đã quy về dạng tối thiểu mà Dashboard cần: trạng thái, tiền, ngày lập. */
interface MetricRecord {
  status: StatusGroup;
  value: MoneyValue | null;
  createdAt: string;
}

const PERIOD_PARAM = 'ky';

export function DashboardPage() {
  const { profile } = useAuth();
  const scope = useCompanyScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodParam = searchParams.get(PERIOD_PARAM);
  const period: DashboardPeriod = isDashboardPeriod(periodParam)
    ? periodParam
    : DEFAULT_DASHBOARD_PERIOD;

  function setPeriod(value: DashboardPeriod) {
    const next = new URLSearchParams(searchParams);
    if (value === DEFAULT_DASHBOARD_PERIOD) next.delete(PERIOD_PARAM);
    else next.set(PERIOD_PARAM, value);
    setSearchParams(next, { replace: true });
  }

  const canViewCrm = useCan('CRM');
  const canViewDa = useCan('DA');
  const canViewTk = useCan('TK');
  const canViewHd = useCan('HD');

  const opportunities = useOpportunities({ enabled: canViewCrm });
  const biddingProjects = useBiddingProjects({ enabled: canViewDa });
  const designProjects = useDesignProjects({ enabled: canViewTk });
  const contracts = useContracts({ enabled: canViewHd });

  // Cùng nguồn dữ liệu với Hộp thư Phê duyệt và huy hiệu trên thanh trên cùng — ba chỗ hiển
  // thị cùng một con số thì phải đọc từ cùng một truy vấn, nếu không sẽ có lúc lệch nhau.
  const { data: pendingApprovals } = usePendingApprovals();

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
      .filter((o) => !OPPORTUNITY_STAGE_META[o.stage].isTerminal && isWithinPeriod(o.created_at, period))
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

  const overdueByModule = modules
    .map((m) => ({ ...m, count: countByStatus(m.records).overdue }))
    .filter((m) => m.count > 0);
  const overdueTotal = overdueByModule.reduce((sum, m) => sum + m.count, 0);

  const pendingCount = pendingApprovals?.length ?? 0;
  const pendingValue = sumMoney((pendingApprovals ?? []).map((a) => a.amount));
  const canApproveAnything = (profile?.permissions ?? []).some((p) => p.canApprove);

  const currentCompany =
    profile?.assignments.find((a) => a.companyId === scope.companyId) ?? profile?.assignments[0];

  // Lời chào cá nhân hoá bằng TÊN là NGOẠI LỆ DUY NHẤT của quy tắc không dùng đại từ
  // nhân xưng (Content Guidelines 4.2) — dùng tên, không dùng anh/chị.
  const greeting = dashboardGreeting(
    profile?.fullName?.trim().split(/\s+/).slice(-2).join(' ') ?? '',
  );

  return (
    <>
      <PageHeader
        title={greeting}
        description={
          currentCompany
            ? `${currentCompany.companyShortName} · ${currentCompany.roleLabel}`
            : undefined
        }
        actions={<QuickActions />}
      />

      {/* Bộ lọc nhanh theo khoảng thời gian — Webapp Flow 4.1. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-fg-subtle">Kỳ báo cáo</span>
        {DASHBOARD_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={p === period}
            className={cn(
              'h-10 rounded-sm border px-3 sm:h-8',
              p === period
                ? 'border-brand bg-brand-subtle font-medium text-brand'
                : 'border-border bg-surface hover:bg-surface-hover',
            )}
          >
            {DASHBOARD_PERIOD_LABELS[p]}
          </button>
        ))}
        {scope.isAggregate && (
          <span className="text-xs text-fg-subtle">
            Đang gộp số liệu mọi pháp nhân. Chọn một pháp nhân ở thanh bên để xem riêng.
          </span>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Chờ phê duyệt" hint="Hồ sơ nằm trong hạn mức phê duyệt của vai trò hiện tại">
          {!canApproveAnything ? (
            <EmptyMetric label="Vai trò hiện tại không có quyền phê duyệt." />
          ) : pendingCount === 0 ? (
            <EmptyMetric label="Không có hồ sơ nào đang chờ phê duyệt." />
          ) : (
            <Link to="/viec-can-lam" className="block hover:underline">
              <span className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{pendingCount}</span>
                <StatusLozenge status="pending_approval" />
              </span>
              {pendingValue > 0n && (
                <span className="mt-1 block text-xs text-fg-subtle">
                  Tổng giá trị {formatCurrency(pendingValue)}
                </span>
              )}
            </Link>
          )}
        </Card>

        <Card title="Quá hạn" hint="Hồ sơ đã vượt thời hạn xử lý, theo từng phân hệ">
          {overdueTotal === 0 ? (
            <EmptyMetric label="Không có hồ sơ nào quá hạn trong kỳ này." />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold text-status-overdue">{overdueTotal}</span>
                <StatusLozenge status="overdue" />
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {overdueByModule.map((m) => (
                  <li key={m.key}>
                    <Link
                      to={listPathByStatus(m.basePath, 'overdue')}
                      className="text-brand hover:underline"
                    >
                      {m.title}: {m.count}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {modules.map((m) => (
          <ModuleCard key={m.key} metric={m} />
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
}

/**
 * Một thẻ chỉ số của module.
 *
 * Đếm theo ĐÚNG 5 nhóm trạng thái chuẩn chứ không tự gộp thành "đang xử lý" cho gọn: mỗi con
 * số phải tương ứng với đúng MỘT bộ lọc trên danh sách đích, nếu không thì bấm vào thẻ sẽ ra
 * số khác với số trên thẻ — đúng cái mà Webapp Flow 4.1 cấm.
 */
function ModuleCard({ metric }: { metric: ModuleMetric }) {
  const counts = countByStatus(metric.records);
  const present = STATUS_GROUPS.filter((s) => counts[s] > 0);

  return (
    <Card title={metric.title} hint={metric.hint}>
      {metric.isLoading ? (
        <div className="h-6 w-24 animate-pulse rounded-sm bg-surface-sunken" />
      ) : metric.records.length === 0 ? (
        <EmptyMetric label="Chưa có hồ sơ nào trong kỳ này." />
      ) : (
        <>
          <Link to={metric.basePath} className="flex items-baseline gap-2 hover:underline">
            <span className="text-2xl font-semibold">{metric.records.length}</span>
            <span className="text-fg-subtle">hồ sơ</span>
          </Link>

          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {present.map((s) => (
              <li key={s}>
                <Link
                  to={listPathByStatus(metric.basePath, s)}
                  className="text-brand hover:underline"
                >
                  {statusLabel(s)}: {counts[s]}
                </Link>
              </li>
            ))}
          </ul>

          {metric.highlights.length > 0 && (
            <dl className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
              {metric.highlights.map((h) => (
                <div key={h.label} className="flex justify-between gap-2">
                  <dt className="text-fg-subtle">{h.label}</dt>
                  <dd className="tabular-nums">{h.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </Card>
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
 * BC-01 liệt kê mười nhóm chỉ số cho màn hình buổi sáng của Ban Giám đốc. Bốn nhóm còn lại
 * thuộc module chưa xây, và nói thẳng ra thì tốt hơn nhiều so với dựng thẻ hiện số 0 —
 * số 0 đọc ra là "không có việc gì", còn sự thật là "chưa đo được".
 */
function DataCompletenessNote() {
  return (
    <section className="mt-6 rounded-lg border border-border bg-surface-sunken p-4">
      <h2 className="font-semibold">Phần chưa có trên Dashboard</h2>
      <p className="mt-1 text-fg-subtle">
        Dòng tiền vào – ra, công nợ phải thu, tiến độ và chi phí từng công trình, tồn kho và
        giàn giáo đang cho thuê, nhân sự – chấm công sẽ xuất hiện khi các phân hệ Thi công,
        Mua hàng, Kho, Kế toán và Nhân sự đi vào vận hành. Các chỉ số đang hiển thị lấy trực
        tiếp từ hồ sơ nghiệp vụ, không phải số liệu mẫu.
      </p>
    </section>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border border-border', 'bg-surface p-4 shadow-card')}>
      <div className="mb-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-fg-subtle">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Trạng thái rỗng: tình trạng + gợi ý, không để trống trơn (Content Guidelines 4.7). */
function EmptyMetric({ label }: { label: string }) {
  return <p className="text-fg-subtle">{label}</p>;
}
