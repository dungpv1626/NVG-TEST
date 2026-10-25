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
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatDeadline, type StatusGroup } from '@nvg/shared';
import { DetailAsideContext, useWideDetail } from '@/components/entity/detail-aside';
import { useDetailTabs } from '@/components/entity/use-detail-tabs';
import { Breadcrumb, type Crumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge, StatusWithLabel } from '@/components/ui/status-lozenge';
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
  /** Nhãn riêng của bước (vd «Báo giá») hiện cạnh nhóm trạng thái chuẩn. */
  statusLabel?: string;
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

  /**
   * Dải tiến trình (`StepTrack`) — đang ở đâu, ai giữ, bước tiếp theo, bước cuối. Đặt ngay dưới
   * header, KHÔNG dính khi cuộn: header dính đã đủ cao (review UX, vấn đề 4).
   */
  progress?: ReactNode;

  /** Tab mở khi URL chưa chọn tab — thường là tab nơi làm việc của bước hiện tại. */
  defaultTab?: string;
}

export function EntityDetail({
  breadcrumbs,
  title,
  code,
  status,
  statusLabel,
  responsiblePerson,
  deadline,
  actions,
  tabs,
  historyContent,
  related = [],
  progress,
  defaultTab,
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

  const { active, selectTab, onTabKeyDown } = useDetailTabs(allTabs, defaultTab);

  // Cột phải v2 (330px, từ xl): thẻ «Bước tiếp theo» + «Chuỗi hồ sơ» (cổng từ `DetailAside`) và hồ
  // sơ liên quan. Dưới xl không có cột này — các khối ấy nằm ngay trong cột chính.
  const wide = useWideDetail();
  const [asideUsers, setAsideUsers] = useState(0);
  const [nextEl, setNextEl] = useState<HTMLDivElement | null>(null);
  const [chainEl, setChainEl] = useState<HTMLDivElement | null>(null);
  const register = useCallback(() => {
    setAsideUsers((n) => n + 1);
    return () => setAsideUsers((n) => n - 1);
  }, []);
  const showAside = wide && (related.length > 0 || asideUsers > 0);
  const asideSlot = useMemo(
    () => ({
      targets: showAside ? { next: nextEl, chain: chainEl } : { next: null, chain: null },
      register,
    }),
    [showAside, nextEl, chainEl, register],
  );

  // Cột dính bên dưới header (vd bản xem trước hợp đồng) cần biết header cao bao nhiêu — chiều
  // cao đổi theo bề rộng, mức thu phóng, số dòng tiêu đề. Đặt cứng một con số thì lệch trên máy
  // khác (anh Dũng 21/10/2026). Hai biến CSS: `--detail-sticky-top` (mốc `top` trong <main>) và
  // `--detail-sticky-avail` (chiều cao còn lại của màn hình dưới header).
  const wrapRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const header = headerRef.current;
    if (!wrap || !header) return;
    const measure = () => {
      const offset = parseFloat(getComputedStyle(header).top) || 0;
      const top = header.offsetHeight + offset + 16;
      const scroller = header.closest('main');
      const scrollerTop = scroller
        ? scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(scroller).paddingTop)
        : 0;
      wrap.style.setProperty('--detail-sticky-top', `${top}px`);
      wrap.style.setProperty(
        '--detail-sticky-avail',
        `${Math.max(240, window.innerHeight - Math.max(0, scrollerTop) - top - 16)}px`,
      );
    };
    measure();
    // jsdom (phép thử) không có ResizeObserver.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    // Có gì đứng TRƯỚC khung này (dải bước duyệt, thông báo lỗi, «Đề nghị bị từ chối…») thì
    // bù đúng phần margin âm của header — nếu không header kéo lên đè mất nửa dưới thứ đó.
    <DetailAsideContext.Provider value={asideSlot}>
      <div
        ref={wrapRef}
        className="flex gap-4 [&:not(:first-child)]:pt-4 lg:[&:not(:first-child)]:pt-6"
      >
        <div className="min-w-0 flex-1">
          {/* Header cố định khi cuộn (Webapp Flow 4.3) — CHỈ trên máy tính. Trên điện thoại, tên,
            nút và thanh tab dính lại chiếm gần nửa màn hình (ảnh chụp hướng dẫn 30/09/2026), chỗ
            còn lại cho ô nhập nhật ký chỉ vài dòng; ở đó header cuộn đi cùng nội dung. */}
          {/* Margin âm phải khớp ĐÚNG padding của <main> (p-4, lg:p-6): lệch một nấc là
            header thò ra ngoài mép và cả trang cuộn ngang được. `top` cũng âm đúng bằng padding
            trên: `sticky` tính mốc từ mép TRONG phần đệm của <main>, nên `top-0` để hở 24px phía
            trên và nội dung cuộn qua lộ ra ở khe đó (ảnh chụp hướng dẫn 30/09/2026). */}
          <div
            ref={headerRef}
            className={cn(
              // v2: header nằm trên nền nội dung (canvas). Margin âm khớp padding của <main> (px-4 pt-2,
              // lg:px-6) — lệch một nấc là header thò ra ngoài mép.
              'z-10 mb-4 bg-canvas lg:sticky lg:-top-2',
              '-mx-4 -mt-2 px-4 pt-2',
              'lg:-mx-6 lg:mb-5 lg:px-6',
              // Có cột phải: mép phải của header là khe giữa hai cột, không phải phần đệm của <main> —
              // giữ margin âm bên phải thì header (z-10, nền canvas) thò sang đè mép thẻ «Bước tiếp theo».
              showAside && 'lg:mr-0 lg:pr-0',
            )}
          >
            <Breadcrumb items={effectiveBreadcrumbs} />
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-title font-bold text-pretty">{title}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-subtle">
                  <span className="font-mono text-xs">{code}</span>
                  {statusLabel ? (
                    <StatusWithLabel status={status} label={statusLabel} />
                  ) : (
                    <StatusLozenge status={status} />
                  )}
                  <span>
                    Người chịu trách nhiệm:{' '}
                    <span className="text-ink">{responsiblePerson ?? 'Chưa phân công'}</span>
                  </span>
                  {/* Hồ sơ đã xong thì thời hạn không còn là việc phải làm — «Còn 5 ngày» trên một
                    đơn đã giao đủ đọc như còn nợ việc. */}
                  {deadline && status !== 'completed' && (
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
              className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden pb-1"
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
                      // v2: tab dạng viên — đang chọn là viên trắng trên nền nội dung.
                      'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4',
                      isActive
                        ? 'bg-surface font-semibold text-ink'
                        : 'text-ink-subtle hover:bg-pill hover:text-ink',
                    )}
                  >
                    {tab.id === 'lich-su' && <History className="size-4" />}
                    {tab.label}
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className="rounded-full bg-pill px-1.5 text-xs">{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {progress}

          <div
            role="tabpanel"
            id={`panel-${active?.id ?? ''}`}
            aria-labelledby={`tab-${active?.id ?? ''}`}
          >
            {active?.content}
          </div>

          {related.length > 0 && !showAside && (
            <section className="mt-6 space-y-4" aria-label="Hồ sơ liên quan">
              <RelatedGroups related={related} from={fromForRelated} />
            </section>
          )}
        </div>

        {showAside && (
          <aside className="w-[330px] shrink-0" aria-label="Bước tiếp theo và hồ sơ liên quan">
            {/* Dính sát mép trên chứ không dưới header: header chỉ trải cột trái, nên mốc «dưới header»
                đẩy cột phải xuống lưng chừng ngay cả khi chưa cuộn (anh Dũng 25/10/2026). */}
            <div className="sticky top-0 space-y-4">
              <div ref={setNextEl} className="empty:hidden" />
              <div ref={setChainEl} className="empty:hidden" />
              {related.length > 0 && <RelatedGroups related={related} from={fromForRelated} />}
            </div>
          </aside>
        )}
      </div>
    </DetailAsideContext.Provider>
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
          // `min-w-0`: tên hồ sơ dài dùng `truncate` (không xuống dòng); thiếu nó thì ô lưới cột phải
          // giãn theo chữ và cả trang có thanh cuộn ngang (08/10/2026, tên cơ hội NVO dài 70 ký tự).
          className="min-w-0 rounded-card bg-surface p-4"
        >
          <h2 className="mb-2 text-xs font-semibold text-ink-subtle">{group.title}</h2>
          <dl className="space-y-2">
            {group.records.map((r) => (
              <div key={r.label}>
                <dt className="text-xs text-fg-subtle">{r.label}</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {/* Mọi tham chiếu tới hồ sơ khác là liên kết bấm được,
                      không phải chữ tĩnh (Webapp Flow 5.2). `state.from` để trang đích hiện
                      breadcrumb đúng đường đi thực tế (đã tới từ ĐÂY), không phải mắt xích
                      module mặc định của nó. */}
                  {r.to ? (
                    <Link
                      to={r.to}
                      state={{ from }}
                      className="truncate font-medium text-brand hover:underline"
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
