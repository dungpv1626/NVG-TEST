/**
 * Màn hình Chi tiết "Hồ sơ 360°" — mẫu bố cục 3, QUAN TRỌNG NHẤT (Webapp Flow Mục 4.3).
 *
 * "Đây là mẫu quan trọng nhất vì là nơi diễn ra phần lớn thao tác và điều hướng liên kết
 * chéo module."
 *
 * Quy tắc bắt buộc:
 *  - Header CỐ ĐỊNH khi cuộn: tên, mã, trạng thái, người chịu trách nhiệm, nút hành động chính.
 *  - Nội dung chia theo TAB — mỗi tab là một khía cạnh của CÙNG MỘT hồ sơ, KHÔNG phải các
 *    trang riêng biệt. Giữ nguyên URL gốc, chỉ đổi tham số `tab` (Webapp Flow 4.3).
 *  - Panel bên PHẢI hiển thị hồ sơ liên quan ở module khác — đây là cách chính để di chuyển
 *    giữa các phần mà không cần quay lại menu (Webapp Flow 5.1).
 *  - Tab "Lịch sử" LUÔN có ở mọi hồ sơ, phục vụ truy vết theo NEN-03 và NEN-07.
 *  - Mọi trường tham chiếu tới hồ sơ khác là LIÊN KẾT BẤM ĐƯỢC, không phải chữ tĩnh
 *    (Webapp Flow 5.2).
 *  - Breadcrumb phản ánh ĐƯỜNG ĐI THỰC TẾ, không phải cấu trúc menu cố định (Webapp Flow 5.2):
 *    đến từ panel "Hồ sơ liên quan" của một hồ sơ khác thì hiện `<hồ sơ đó> › <hồ sơ này>`,
 *    KHÔNG phải mắt xích module/danh sách mặc định mà `breadcrumbs` truyền vào khai — xem
 *    `RelatedGroups` (đính `state.from` vào link) và biến `from` bên dưới (đọc lại state đó).
 *    Vào thẳng bằng URL/tải lại trang thì không có `state`, breadcrumb quay về mặc định.
 */

import { History } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatDeadline, type StatusGroup } from '@nvg/shared';
import { useDetailTabs } from '@/components/entity/use-detail-tabs';
import { Breadcrumb, type Crumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { cn } from '@/lib/utils';

export interface DetailTab {
  /** Định danh trong URL (`?tab=khoi-luong`) — dùng tiếng Việt không dấu. */
  id: string;
  label: string;
  content: ReactNode;
  /** Số hiệu hiển thị cạnh nhãn tab (ví dụ số phiên bản, số chứng từ). */
  badge?: number;
}

/** Breadcrumb mắt xích "vừa đi qua" — đính vào `state` của link khi điều hướng sang hồ sơ
 * khác, để trang đích hiện đúng đường đi thực tế thay vì mắt xích module mặc định. */
export interface BreadcrumbFrom {
  label: string;
  to: string;
}

/** Một hồ sơ liên quan ở module khác — hiển thị trong panel ngữ cảnh. */
export interface RelatedRecord {
  label: string;
  value: string;
  to?: string;
  /** Trạng thái của hồ sơ liên quan, nếu có. */
  status?: StatusGroup;
}

export interface RelatedGroup {
  title: string;
  records: RelatedRecord[];
}

export interface EntityDetailProps {
  breadcrumbs: Crumb[];
  title: string;
  code: string;
  status: StatusGroup;
  responsiblePerson: string | null;
  deadline?: string | null;

  /** Nút hành động chính (Phê duyệt, Bàn giao, Gửi phê duyệt…). */
  actions?: ReactNode;

  tabs: DetailTab[];

  /**
   * Tab Lịch sử — LUÔN được thêm vào cuối, không cần khai báo trong `tabs`.
   * Truyền `undefined` chỉ khi hồ sơ chưa có bảng lịch sử (hiếm).
   */
  historyContent?: ReactNode;

  /** Hồ sơ liên quan ở module khác — panel ngữ cảnh bên phải (Webapp Flow 5.1). */
  related?: RelatedGroup[];
}

export function EntityDetail({
  breadcrumbs,
  title,
  code,
  status,
  responsiblePerson,
  deadline,
  actions,
  tabs,
  historyContent,
  related = [],
}: EntityDetailProps) {
  const location = useLocation();

  // Đường đi thực tế thắng breadcrumb mặc định khi có — xem ghi chú đầu file.
  const from = (location.state as { from?: BreadcrumbFrom } | null)?.from ?? null;
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const effectiveBreadcrumbs: Crumb[] = from && currentCrumb ? [from, currentCrumb] : breadcrumbs;
  const fromForRelated: BreadcrumbFrom = { label: title, to: location.pathname };

  const allTabs = useMemo<DetailTab[]>(
    () =>
      historyContent !== undefined
        ? [...tabs, { id: 'lich-su', label: 'Lịch sử', content: historyContent }]
        : tabs,
    [tabs, historyContent],
  );

  const { active, selectTab, onTabKeyDown } = useDetailTabs(allTabs);

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        {/* Header cố định khi cuộn (Webapp Flow 4.3). */}
        {/* Margin âm phải khớp ĐÚNG padding của <main> (p-4, lg:p-6): lệch một nấc là
            header thò ra ngoài mép và cả trang cuộn ngang được. */}
        <div
          className={cn(
            'sticky top-0 z-10 mb-4 bg-surface',
            '-mx-4 -mt-4 px-4 pt-4',
            'lg:-mx-6 lg:-mt-6 lg:mb-6 lg:px-6 lg:pt-6',
          )}
        >
          <Breadcrumb items={effectiveBreadcrumbs} />
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-fg-subtle">
                <span className="font-mono text-xs">{code}</span>
                <StatusLozenge status={status} />
                <span>
                  Người chịu trách nhiệm:{' '}
                  <span className="text-fg">{responsiblePerson ?? 'Chưa phân công'}</span>
                </span>
                {deadline && (
                  <span className={cn(status === 'overdue' && 'font-medium text-status-overdue')}>
                    {formatDeadline(deadline)}
                  </span>
                )}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>

          {/* Viền dưới đặt trên chính thanh tab để gạch chân tab đang chọn khớp đúng
              đường viền — không dùng margin âm, vì nó tràn xuống che nội dung bên dưới. */}
          {/* Dùng đúng mẫu ARIA cho bộ tab: `tablist` / `tab` / `tabpanel`.
              Trước đây đây chỉ là một dãy nút, nên trình đọc màn hình đọc ra "nút Điều khoản"
              mà không cho biết đang có mấy tab, đang ở tab thứ mấy — người dùng bàn phím không
              có cách nào nắm được cấu trúc màn hình (Content Guidelines 6.8). */}
          <nav
            role="tablist"
            className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
            aria-label="Nội dung hồ sơ"
          >
            {allTabs.map((tab) => {
              const isActive = tab.id === active?.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  // Roving tabindex: cả bộ tab chỉ chiếm MỘT chặng Tab, đúng mẫu ARIA. Không có
                  // nó thì màn hình 6 tab bắt người dùng bàn phím bấm Tab sáu lần mới tới nội dung.
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={onTabKeyDown}
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 -mb-px',
                    isActive
                      ? 'border-brand font-semibold text-brand'
                      : 'border-transparent text-fg-subtle hover:text-fg',
                  )}
                >
                  {tab.id === 'lich-su' && <History className="size-4" />}
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="rounded-full bg-surface-sunken px-1.5 text-xs">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div
          role="tabpanel"
          id={`panel-${active?.id ?? ''}`}
          aria-labelledby={`tab-${active?.id ?? ''}`}
        >
          {active?.content}
        </div>

        {related.length > 0 && (
          <section className="mt-6 space-y-4 xl:hidden" aria-label="Hồ sơ liên quan">
            <RelatedGroups related={related} from={fromForRelated} />
          </section>
        )}
      </div>

      {related.length > 0 && (
        <aside className="hidden w-72 shrink-0 xl:block" aria-label="Hồ sơ liên quan">
          <div className="sticky top-24 space-y-4">
            <RelatedGroups related={related} from={fromForRelated} />
          </div>
        </aside>
      )}
    </div>
  );
}

/**
 * Danh sách hồ sơ liên quan ở module khác (Webapp Flow 5.1).
 *
 * Dùng ở hai chỗ với cùng một nội dung: panel bên phải trên màn hình rộng, và khối cuối
 * trang trên màn hình hẹp. Màn hình hẹp mà ẩn hẳn là mất luôn đường đi sang module khác —
 * mà "không quá 3 cú nhấp tới một hồ sơ" (Webapp Flow 1.3) tính cả trên điện thoại.
 */
export function RelatedGroups({
  related,
  from,
}: {
  related: RelatedGroup[];
  from: BreadcrumbFrom;
}) {
  return (
    <>
      {related.map((group) => (
        <div
          key={group.title}
          className="rounded-lg border border-border bg-surface p-3 shadow-card"
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {group.title}
          </h2>
          <dl className="space-y-2">
            {group.records.map((r) => (
              <div key={r.label}>
                <dt className="text-xs text-fg-subtle">{r.label}</dt>
                <dd className="flex items-center gap-2">
                  {/* Mọi tham chiếu tới hồ sơ khác là liên kết bấm được,
                      không phải chữ tĩnh (Webapp Flow 5.2). `state.from` để trang đích hiện
                      breadcrumb đúng đường đi thực tế (đã tới từ ĐÂY), không phải mắt xích
                      module mặc định của nó. */}
                  {r.to ? (
                    <Link
                      to={r.to}
                      state={{ from }}
                      className="truncate text-brand hover:underline"
                    >
                      {r.value}
                    </Link>
                  ) : (
                    <span className="truncate">{r.value}</span>
                  )}
                  {r.status && <StatusLozenge status={r.status} />}
                </dd>
              </div>
            ))}
            {group.records.length === 0 && (
              <p className="text-xs text-fg-subtle">Chưa có hồ sơ liên quan.</p>
            )}
          </dl>
        </div>
      ))}
    </>
  );
}

/**
 * Bảng thông tin dạng nhãn – giá trị, dùng trong tab Tổng quan.
 * Nhãn KHÔNG có dấu hai chấm ở cuối (Content Guidelines 4.9).
 */
export function DetailFields({ fields }: { fields: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.label}>
          <dt className="text-xs text-fg-subtle">{f.label}</dt>
          <dd className="mt-0.5">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Màn hình Chi tiết mở một hồ sơ không đọc được — đã xóa, hoặc ngoài phạm vi RLS của vai trò.
 *
 * Luôn kèm đường quay lại danh sách. Trạng thái rỗng phải có hành động gợi ý chứ không để
 * người dùng mắc kẹt (Content Guidelines 4.7); ở đây điều đó đặc biệt quan trọng vì màn hình
 * này thường tới từ một đường dẫn dán qua Zalo — người mở nó không có sẵn ngữ cảnh nào để tự
 * tìm đường ra, và không có thanh bên nào đang sáng để bấm.
 *
 * Nội dung thông điệp cố ý nêu CẢ HAI khả năng và không nói rõ là khả năng nào: khẳng định
 * "hồ sơ này tồn tại nhưng bạn không được xem" là đã tiết lộ sự tồn tại của hồ sơ cho người
 * không có quyền biết.
 */
export function RecordNotFound({
  entity,
  listPath,
  listLabel,
}: {
  /** Tên loại hồ sơ trong câu — ví dụ `'gói thầu'`, `'cơ hội kinh doanh'`. */
  entity: string;
  listPath: string;
  listLabel: string;
}) {
  return (
    <EmptyState
      message={`Không tìm thấy ${entity} này. Có thể hồ sơ đã được xóa hoặc vai trò hiện tại chưa được cấp quyền xem.`}
      action={
        <Button variant="secondary" asChild>
          <Link to={listPath}>{listLabel}</Link>
        </Button>
      }
    />
  );
}
