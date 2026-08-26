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
 */

import { History } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDeadline, type StatusGroup } from '@nvg/shared';
import { Breadcrumb, type Crumb } from '@/components/layout/breadcrumb';
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
  const [searchParams, setSearchParams] = useSearchParams();

  const allTabs = useMemo<DetailTab[]>(
    () =>
      historyContent !== undefined
        ? [...tabs, { id: 'lich-su', label: 'Lịch sử', content: historyContent }]
        : tabs,
    [tabs, historyContent],
  );

  const activeId = searchParams.get('tab') ?? allTabs[0]?.id ?? '';
  const active = allTabs.find((t) => t.id === activeId) ?? allTabs[0];

  function selectTab(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    // `replace` để nút Back của trình duyệt quay về màn hình Danh sách,
    // không phải lùi qua từng tab đã xem.
    setSearchParams(next, { replace: true });
  }

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
          <Breadcrumb items={breadcrumbs} />
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
                  <span
                    className={cn(status === 'overdue' && 'font-medium text-status-overdue')}
                  >
                    {formatDeadline(deadline)}
                  </span>
                )}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>

          {/* Viền dưới đặt trên chính thanh tab để gạch chân tab đang chọn khớp đúng
              đường viền — không dùng margin âm, vì nó tràn xuống che nội dung bên dưới. */}
          <nav
            className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
            aria-label="Nội dung hồ sơ"
          >
            {allTabs.map((tab) => {
              const isActive = tab.id === active?.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
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

        <div>{active?.content}</div>

        {related.length > 0 && (
          <section className="mt-6 space-y-4 xl:hidden" aria-label="Hồ sơ liên quan">
            <RelatedGroups related={related} />
          </section>
        )}
      </div>

      {related.length > 0 && (
        <aside className="hidden w-72 shrink-0 xl:block" aria-label="Hồ sơ liên quan">
          <div className="sticky top-24 space-y-4">
            <RelatedGroups related={related} />
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
function RelatedGroups({ related }: { related: RelatedGroup[] }) {
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
                      không phải chữ tĩnh (Webapp Flow 5.2). */}
                  {r.to ? (
                    <Link to={r.to} className="truncate text-brand hover:underline">
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
export function DetailFields({
  fields,
}: {
  fields: { label: string; value: ReactNode }[];
}) {
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
