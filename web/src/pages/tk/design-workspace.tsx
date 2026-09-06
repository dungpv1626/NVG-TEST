/**
 * Vỏ màn hình "Trang dự án thiết kế" — dựng theo bộ bàn giao thiết kế (README §5.1–5.4).
 *
 * Vì sao Module Thiết kế có vỏ riêng thay vì dùng `EntityDetail` như 11 module còn lại:
 * `EntityDetail` bày MỌI khía cạnh của hồ sơ thành các tab ngang hàng nhau. Đúng cho một
 * module hồ sơ, nhưng ở đây nó biến bốn bước của engine (đầu bài → không gian → phương án →
 * hồ sơ kỹ thuật) thành bốn tab ngang hàng với tab Lịch sử, và không chỗ nào nói cho biết dự
 * án đang ở đâu trong quy trình.
 *
 * Bố cục HAI CẤP, đúng như bản mẫu chốt (README §5.4: "Năm bước quy trình không là tab —
 * chúng nằm trong Tổng quan dưới dạng thẻ"):
 *
 *  · **Cấp 1** — thanh tab: Tổng quan · Phiên bản bản vẽ · Yêu cầu thay đổi · Lịch sử.
 *  · **Cấp 2** — màn hình con mở từ thẻ công cụ ở Tổng quan. Khi ở đây thì ẨN thanh tab và
 *    hiện header riêng có link "← Tổng quan" (bản mẫu §5.6).
 *
 * Màn hình con KHÔNG giả làm tab. Để nó trong `role="tablist"` mà không có nút tương ứng là
 * nói dối trình đọc màn hình: nó sẽ đọc "tab 1 trên 4" trong khi nội dung đang hiện không
 * thuộc tab nào trong bốn.
 *
 * `?tab=<id>` giữ nguyên cho cả hai cấp, nên mọi đường dẫn cũ, dấu trang và `autoOpenKey` của
 * `SectionHelp` vẫn trỏ đúng chỗ.
 *
 * Cơ chế tab (phím mũi tên, roving tabindex, `replace`) dùng chung `useDetailTabs` với
 * `EntityDetail` — một hành vi, hai lớp áo.
 */

import { ArrowLeft, History } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { formatDeadline, type StatusGroup } from '@nvg/shared';
import {
  RelatedGroups,
  type BreadcrumbFrom,
  type RelatedGroup,
} from '@/components/entity/entity-detail';
import { useDetailTabs } from '@/components/entity/use-detail-tabs';
import { Breadcrumb, type Crumb } from '@/components/layout/breadcrumb';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { cn } from '@/lib/utils';
import { useTkTheme } from './tk-theme';

export interface WorkspaceTab {
  /** Định danh trong URL (`?tab=dau-bai`) — tiếng Việt không dấu. */
  id: string;
  label: string;
  content: ReactNode;
  /** Câu phụ đề của màn hình con. Không dùng cho tab cấp một. */
  subtitle?: string;
  /** Chấm cảnh báo cạnh nhãn tab cấp một (bản mẫu §5.4). Luôn kèm nhãn chữ, không đứng một mình. */
  alert?: boolean;
}

export interface DesignWorkspaceProps {
  breadcrumbs: Crumb[];
  title: string;
  code: string;
  status: StatusGroup;
  /** Dòng thông tin dưới tên, phân cách bằng vạch dọc (bản mẫu §5.4). Bỏ qua phần tử rỗng. */
  meta: ReactNode[];
  deadline?: string | null;
  /** Nút hành động ở góc phải header. */
  actions?: ReactNode;
  /** Toàn bộ tab, cả cấp một lẫn màn hình con. */
  tabs: WorkspaceTab[];
  /** Những `id` hiện trên thanh tab. Còn lại là màn hình con. */
  primaryTabIds: string[];
  /** Tab Lịch sử — luôn thêm vào cuối thanh tab (Webapp Flow 4.3, NEN-03). */
  historyContent?: ReactNode;
  /** Hồ sơ liên quan ở module khác (Webapp Flow 5.1). */
  related?: RelatedGroup[];
}

/**
 * Provider của chế độ sáng/tối nằm ở KHUNG ứng dụng (`app-shell.tsx`), không ở đây: thanh
 * trái và thanh trên cũng đổi màu theo nó. Ở đây chỉ ĐỌC, và vẫn tự đặt `data-tk-theme` cho
 * chính mình để component đứng một mình vẫn ra đúng màu (kiểm thử dựng thẳng nó, không qua khung).
 */
export function DesignWorkspace(props: DesignWorkspaceProps): React.ReactElement {
  return <WorkspaceBody {...props} />;
}

function WorkspaceBody({
  breadcrumbs,
  title,
  code,
  status,
  meta,
  deadline,
  actions,
  tabs,
  primaryTabIds,
  historyContent,
  related = [],
}: DesignWorkspaceProps): React.ReactElement {
  const location = useLocation();
  const { theme } = useTkTheme();
  const scrollRef = useRef<HTMLDivElement>(null);

  const allTabs = useMemo<WorkspaceTab[]>(
    () =>
      historyContent !== undefined
        ? [...tabs, { id: 'lich-su', label: 'Lịch sử', content: historyContent }]
        : tabs,
    [tabs, historyContent],
  );
  const primary = useMemo(
    () => allTabs.filter((t) => primaryTabIds.includes(t.id) || t.id === 'lich-su'),
    [allTabs, primaryTabIds],
  );

  // Cơ chế phím mũi tên chỉ chạy trên thanh tab cấp một — đó là bộ tab thật.
  const { active: activePrimary, selectTab, onTabKeyDown } = useDetailTabs(primary);
  const { active: activeAny } = useDetailTabs(allTabs);

  // Đang ở màn hình con khi `?tab=` trỏ vào một tab không nằm trên thanh.
  const sub = activeAny && !primary.some((t) => t.id === activeAny.id) ? activeAny : null;
  const shown = sub ?? activePrimary;

  // Đường đi thực tế thắng breadcrumb mặc định — cùng quy tắc với `EntityDetail`.
  const from = (location.state as { from?: BreadcrumbFrom } | null)?.from ?? null;
  const currentCrumb = breadcrumbs[breadcrumbs.length - 1];
  const crumbs: Crumb[] = from && currentCrumb ? [from, currentCrumb] : breadcrumbs;
  const fromForRelated: BreadcrumbFrom = { label: title, to: location.pathname };

  /**
   * Đổi phần đang xem thì đưa vùng cuộn về đầu.
   *
   * `?tab=` đổi bằng `replace` nên trình duyệt không khôi phục vị trí cuộn, mà cũng không đưa
   * về đầu — người dùng bấm một thẻ ở cuối trang Tổng quan sẽ rơi vào GIỮA màn hình con vừa
   * mở, không thấy tiêu đề lẫn lối quay lại.
   */
  const shownId = sub?.id ?? activePrimary?.id;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scrollRef.current?.closest('main')?.scrollTo({ top: 0 });
  }, [shownId]);

  const overdue = status === 'overdue';
  const countdown = deadline ? formatDeadline(deadline) : '';

  return (
    <>
      {/* Margin âm khớp ĐÚNG padding của <main> (p-4, lg:p-6) để nền của workspace tràn kín
          vùng nội dung — lệch một nấc là mép nền thò ra và cả trang cuộn ngang được.
          Gốc KHÔNG tự đệm: header và thân tự lo phần đệm của mình, để header nằm đúng đầu dòng
          cuộn. Đệm ở cả hai chỗ thì header bị kéo lên trên mép vùng cuộn, và nội dung cuộn qua
          sẽ hiện ra Ở TRÊN nó thay vì trượt xuống dưới (thấy tận mắt 06/09/2026). */}
      <div
        ref={scrollRef}
        data-tk-theme={theme}
        className={cn('min-h-full bg-tk-bg text-tk-tx', 'tabular-nums', '-m-4 lg:-m-6')}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 border-b border-tk-line bg-tk-bg px-4 pt-4 lg:px-6 lg:pt-6">
          <Breadcrumb items={crumbs} />

          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <h1 className="truncate text-page-title font-semibold tracking-tight">{title}</h1>
                <div className="flex items-center gap-2">
                  {/* Trạng thái nghiệp vụ dùng nhãn CHUNG: sáu màu trạng thái là hàng rào
                        cứng nhất của hệ màu, không có bản riêng cho module nào. */}
                  <StatusLozenge status={status} />
                  {countdown && (
                    // Đếm ngược KHÔNG phải một trạng thái thứ bảy — nó là thời gian còn lại,
                    // và nhãn trạng thái thật đứng ngay bên trái nên không đọc nhầm được.
                    <span
                      className={cn(
                        'inline-flex h-6 items-center rounded-sm border px-2.5 text-xs',
                        overdue
                          ? 'border-status-overdue-bg bg-status-overdue-bg text-status-overdue'
                          : 'border-tk-am-line2 bg-tk-am-chip text-tk-am-fg',
                      )}
                    >
                      {countdown}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-tk-t2">
                <span className="font-mono text-tk-t3">{code}</span>
                {meta.filter(Boolean).map((item, index) => (
                  // Khoá theo vị trí: các mảnh này là chỗ cố định của header, không phải
                  // danh sách sắp xếp lại được.
                  <span key={index} className="flex items-center gap-3">
                    <span aria-hidden className="h-3 w-px bg-tk-line2" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>

          {/* Thanh tab chỉ thuộc cấp một. Ở màn hình con thì không hiện — xem chú thích đầu tệp. */}
          {!sub && (
            <nav
              role="tablist"
              aria-label="Nội dung hồ sơ thiết kế"
              className="mt-5 flex gap-0.5 overflow-x-auto overflow-y-hidden"
            >
              {primary.map((tab) => {
                const isActive = tab.id === activePrimary?.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onKeyDown={onTabKeyDown}
                    onClick={() => selectTab(tab.id)}
                    className={cn(
                      'flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3.5 transition-colors duration-(--motion-fast) ease-(--ease-out)',
                      isActive
                        ? 'border-tk-acc font-medium text-tk-tx'
                        : 'border-transparent text-tk-t2 hover:text-tk-tx',
                    )}
                  >
                    {tab.id === 'lich-su' && <History className="size-4" aria-hidden />}
                    {tab.label}
                    {tab.alert && (
                      <span aria-hidden className="size-1.5 rounded-full bg-tk-am-fg" />
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </header>

        {/* ── Nội dung ───────────────────────────────────────────────────────── */}
        {sub ? (
          <section aria-labelledby="tieu-de-man-hinh-con" className="px-4 pt-5 pb-7 lg:px-6">
            <button
              type="button"
              onClick={() => selectTab('tong-quan')}
              className="inline-flex h-10 items-center gap-1.5 text-xs text-tk-t2 transition-colors duration-(--motion-fast) ease-(--ease-out) hover:text-tk-tx"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Tổng quan
            </button>
            <h2 id="tieu-de-man-hinh-con" className="mt-1 text-md font-semibold">
              {sub.label}
            </h2>
            {sub.subtitle && <p className="mt-1 text-xs text-tk-t2">{sub.subtitle}</p>}
            <div className="mt-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">{sub.content}</div>
              {related.length > 0 && (
                <aside className="grid gap-3" aria-label="Hồ sơ liên quan">
                  <RelatedGroups related={related} from={fromForRelated} />
                </aside>
              )}
            </div>
          </section>
        ) : (
          <div
            role="tabpanel"
            id={`panel-${shown?.id ?? ''}`}
            aria-labelledby={`tab-${shown?.id ?? ''}`}
            tabIndex={0}
            className="px-4 pt-5 pb-7 lg:px-6"
          >
            {shown?.content}
          </div>
        )}
      </div>
    </>
  );
}
