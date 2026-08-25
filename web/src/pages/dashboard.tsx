/**
 * Dashboard cá nhân — mẫu bố cục Dashboard (Webapp Flow Mục 4.1).
 *
 * Đây là khung Phase 0: xác nhận App Shell, phân quyền và bộ chọn pháp nhân chạy đúng.
 * Các chỉ số thật (BC-01) bổ sung ở Phase 2E và Phase 3G khi đã có dữ liệu nghiệp vụ.
 *
 * Quy tắc mẫu Dashboard: mỗi thẻ PHẢI bấm được, dẫn thẳng đến danh sách đã lọc sẵn theo
 * đúng điều kiện của thẻ — không phải màn hình chỉ để xem.
 */

import { MODULES, dashboardGreeting, type ModuleCode } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useAuth } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const { profile } = useAuth();
  const { selectedCompanyId } = useCompanyStore();

  const currentCompany =
    profile?.assignments.find((a) => a.companyId === selectedCompanyId) ??
    profile?.assignments[0];

  const visibleModules = profile?.permissions.filter((p) => p.canView) ?? [];
  const approvableModules = profile?.permissions.filter((p) => p.canApprove) ?? [];

  // Lời chào cá nhân hoá bằng TÊN là NGOẠI LỆ DUY NHẤT của quy tắc không dùng đại từ
  // nhân xưng (Content Guidelines 4.2) — dùng tên, không dùng anh/chị.
  const greeting = dashboardGreeting(profile?.fullName?.trim().split(/\s+/).slice(-2).join(' ') ?? '');

  return (
    <>
      <PageHeader
        title={greeting}
        description={
          currentCompany
            ? `${currentCompany.companyShortName} · ${currentCompany.roleLabel}`
            : undefined
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Việc cần xử lý" hint="Hồ sơ đang chờ thao tác của bạn">
          <EmptyMetric label="Không có việc nào cần xử lý. Mọi thứ đã được cập nhật." />
        </Card>

        <Card title="Chờ phê duyệt" hint="Hồ sơ nằm trong hạn mức phê duyệt của bạn">
          {approvableModules.length > 0 ? (
            <EmptyMetric label="Không có hồ sơ nào đang chờ phê duyệt." />
          ) : (
            <EmptyMetric label="Vai trò hiện tại không có quyền phê duyệt." />
          )}
        </Card>

        <Card title="Quá hạn" hint="Việc vượt thời hạn xử lý">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">0</span>
            <StatusLozenge status="overdue" />
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Phân hệ đang có quyền truy cập</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((p) => {
            const meta = MODULES[p.moduleCode as ModuleCode];
            return (
              <div
                key={p.moduleCode}
                className={cn(
                  'rounded-lg border border-border',
                  'bg-surface p-3 shadow-card',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{meta.label}</span>
                  <span className="text-xs text-fg-subtle">{p.moduleCode}</span>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">{meta.description}</p>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-fg-subtle">
                  {p.canCreate && <Tag>Tạo</Tag>}
                  {p.canEdit && <Tag>Sửa</Tag>}
                  {p.canApprove && <Tag>Phê duyệt</Tag>}
                  {!p.canCreate && !p.canEdit && !p.canApprove && <Tag>Chỉ xem</Tag>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
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
    <div
      className={cn(
        'rounded-lg border border-border',
        'bg-surface p-4 shadow-card',
      )}
    >
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5">
      {children}
    </span>
  );
}
