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

import { AlertTriangle, ArrowLeft, ArrowRight, History } from 'lucide-react';
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
import { useDesignVersionSkew, VERSION_SKEW_MESSAGE } from '@/lib/design-version';
import { cn } from '@/lib/utils';

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
  /** Trạng thái nghiệp vụ của hồ sơ. Bỏ trống ở trang AI Design — công cụ hỗ trợ không mang bước quy trình. */
  status?: StatusGroup;
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
  /**
   * Đầu trang GỌN (07/10/2026, trang AI Design): tên cỡ nhỏ, mã và dòng thông tin cùng hàng, bỏ
   * thanh tab khi chỉ có một tab — nhường chiều cao cho bản vẽ.
   */
  compact?: boolean;
}

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
  compact = false,
}: DesignWorkspaceProps): React.ReactElement {
  const location = useLocation();
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

  /**
   * Bước trước / bước sau của màn hình con đang mở.
   *
   * Thứ tự bước CHÍNH LÀ thứ tự các màn hình con trong `tabs` — trang gọi đã khai chúng theo
   * đúng mạch quy trình (đầu bài → khảo sát → không gian → phương án → …). Không có danh sách
   * thứ hai để hai bản trôi khỏi nhau.
   *
   * Trước đó lối ra duy nhất của màn hình con là «← Tổng quan»: làm xong đầu bài muốn sang
   * khảo sát phải quay ra Tổng quan, cuộn tìm thẻ, bấm lại (Haan góp ý 13/09/2026).
   */
  const steps = useMemo(
    () => allTabs.filter((t) => !primary.some((p) => p.id === t.id)),
    [allTabs, primary],
  );
  const stepIndex = sub ? steps.findIndex((t) => t.id === sub.id) : -1;
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : undefined;
  const nextStep = stepIndex >= 0 ? steps[stepIndex + 1] : undefined;

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

  /** Nhóm rỗng KHÔNG tính: xem chú thích ở chỗ dựng cột phải của màn hình con. */
  const filledRelated = related.filter((group) => group.records.length > 0);

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
        className={cn('min-h-full bg-tk-bg text-tk-tx', 'tabular-nums', '-m-4 lg:-m-6')}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        {/*
          Header CHỈ dính trên máy tính (`lg:`), cùng quy tắc với `EntityDetail`. Trên điện thoại
          breadcrumb, tên, dòng thông tin, ba nút và thanh tab dính lại chiếm gần 2/3 màn hình,
          chỉ còn 1/3 dưới để cuộn (ảnh iPhone của Haan, 10/10/2026); ở đó header cuộn đi cùng
          nội dung — màn hình con vẫn có nút «← Tổng quan» ngay trong thân.

          `lg:-top-6` bù ĐÚNG phần đệm của `<main>` — không phải một con số canh mắt.

          Vùng cuộn là `<main>`, và nó có `p-4 lg:p-6`. Chrome tính mốc dính của `sticky` theo
          HỘP NỘI DUNG của vùng cuộn, tức là thấp hơn mép nhìn thấy đúng bằng phần đệm ấy. Nên
          `top-0` làm header dừng lại ở dưới mép 24px, chừa một dải 24px mà nội dung đang cuộn
          hiện xuyên qua: bấm vào màn hình con rồi cuộn thì phụ đề và nút «← Tổng quan» trồi lên
          NẰM ĐÈ dòng mã hồ sơ của header (Haan bắt được 07/09/2026).

          Bọc ngoài đã có `-m-4 lg:-m-6` để nền tràn kín; đây là vế còn lại của cùng phép bù đó.
          Sửa đệm của `<main>` thì phải sửa cả hai chỗ.
        */}
        <header
          className={cn(
            'z-10 border-b border-tk-line bg-tk-bg px-4 pt-4 lg:sticky lg:-top-6 lg:px-6',
            compact ? 'pb-3 lg:pt-5' : 'lg:pt-6',
          )}
        >
          <Breadcrumb items={crumbs} />

          <div
            className={cn(
              'flex flex-wrap items-end justify-between gap-x-5 gap-y-3',
              compact ? 'mt-1.5' : 'mt-3',
            )}
          >
            <div className={cn('min-w-0', compact && 'flex flex-wrap items-baseline gap-x-4')}>
              <div className="flex max-w-full min-w-0 flex-wrap items-end gap-x-5 gap-y-2">
                <h1
                  className={cn(
                    'max-w-full min-w-0 truncate font-semibold tracking-tight',
                    compact ? 'text-lg' : 'text-page-title',
                  )}
                >
                  {title}
                </h1>
                <div className="flex items-center gap-2">
                  {/* Trạng thái nghiệp vụ dùng nhãn CHUNG: sáu màu trạng thái là hàng rào
                        cứng nhất của hệ màu, không có bản riêng cho module nào. */}
                  {status && <StatusLozenge status={status} />}
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

              <div
                className={cn(
                  'flex flex-wrap items-center gap-3 text-xs text-tk-t2',
                  !compact && 'mt-2',
                )}
              >
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
          {!sub && !(compact && primary.length === 1) && (
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

        <VersionSkewNotice />

        {/* ── Nội dung ───────────────────────────────────────────────────────── */}
        {sub ? (
          <section aria-labelledby="tieu-de-man-hinh-con" className="px-4 pt-5 pb-7 lg:px-6">
            {/*
              Đường quay lại là lối ra DUY NHẤT của màn hình con — thanh tab bị ẩn khi ở đây
              (bản mẫu §5.6). Bản đầu vẽ nó bằng cỡ chữ nhỏ nhất và màu chữ phụ, tức là mờ
              hơn mọi thứ khác trên trang, trong khi nó là thứ người dùng cần thấy trước
              tiên khi muốn đi tiếp. Nay là một nút có viền và nền, cỡ chữ thân bài.
            */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <OverviewButton onClick={() => selectTab('tong-quan')} />
              <StepNav
                label="Chuyển bước"
                prev={prevStep}
                next={nextStep}
                index={stepIndex}
                total={steps.length}
                onSelect={selectTab}
              />
            </div>
            <h2 id="tieu-de-man-hinh-con" className="mt-3 text-lg font-semibold">
              {sub.label}
            </h2>
            {sub.subtitle && <p className="mt-1 text-xs text-tk-t2">{sub.subtitle}</p>}
            {/*
              Cột thứ hai chỉ khai khi THẬT SỰ có hồ sơ để liệt kê.

              Hai chỗ đều phải xét, và chỗ hay quên là chỗ thứ hai:

               1. Khai cứng `xl:grid-cols-[1fr_20rem]` thì lưới vẫn giữ chỗ 20rem dù
                  `<aside>` không dựng ra.
               2. Trang gọi luôn truyền một NHÓM «Hồ sơ liên quan», và nhóm đó rỗng khi dự án
                  chưa nối với cơ hội nào. `related.length > 0` vẫn đúng, nên cột vẫn được
                  dành chỗ để hiện đúng một câu «Chưa có hồ sơ liên quan» — 320px để nói rằng
                  không có gì.

              Cộng lại thành một dải trắng chạy dọc bên phải mọi màn hình con, và nội dung bên
              trái bị bó lại vô cớ (Haan bắt được 07/09/2026).
            */}
            <div
              data-testid="luoi-man-hinh-con"
              className={cn(
                'mt-4 grid items-start gap-5',
                filledRelated.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_20rem]',
              )}
            >
              <div className="min-w-0">{sub.content}</div>
              {filledRelated.length > 0 && (
                <aside className="grid min-w-0 gap-3" aria-label="Hồ sơ liên quan">
                  <RelatedGroups related={filledRelated} from={fromForRelated} />
                </aside>
              )}
            </div>
            {/* Cặp nút ở CUỐI trang đã gỡ (Haan, 07/10/2026: «các nút điều hướng đang thừa») — trùng
                với thanh ở đầu trang; biểu mẫu đầu bài có sẵn thanh «Tiếp» dính đáy riêng. */}
          </section>
        ) : (
          <div
            role="tabpanel"
            id={`panel-${shown?.id ?? ''}`}
            aria-labelledby={compact && primary.length === 1 ? undefined : `tab-${shown?.id ?? ''}`}
            aria-label={compact && primary.length === 1 ? shown?.label : undefined}
            tabIndex={0}
            className={cn('px-4 pb-7 lg:px-6', compact ? 'pt-4' : 'pt-5')}
          >
            {shown?.content}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Dải báo giao diện và dịch vụ thiết kế đang chạy hai phiên bản hợp đồng dữ liệu khác nhau.
 *
 * Đặt ngay dưới header của cả vỏ màn hình, không trong một bước cụ thể: lệch phiên bản ảnh
 * hưởng mọi bước, và thứ nó thay thế là một câu lỗi kiểm kiểu bằng tiếng Anh nằm giữa bước
 * đang mở, không nói được nguyên nhân lẫn người xử lý (21/09/2026 — xem `design-version.ts`).
 *
 * Không phải `alert`: chuyện này không đòi người dùng phản ứng ngay, nó giải thích vì sao một
 * số bản ghi không mở được. `status` để trình đọc màn hình đọc khi rảnh, không cắt ngang.
 */
function VersionSkewNotice(): React.ReactElement | null {
  const skew = useDesignVersionSkew();
  if (!skew) return null;
  return (
    <div
      role="status"
      className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-tk-am-line bg-tk-am-bg px-3 py-2.5 text-tk-am-fg2 lg:mx-6"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tk-am-fg" aria-hidden />
      <p className="text-xs leading-relaxed">
        {VERSION_SKEW_MESSAGE}{' '}
        {/* Hai mã cho Quản trị hệ thống đối chiếu — không có chúng thì câu trên không kiểm
            chứng được, và người nhận tin báo không biết bên nào cũ hơn. */}
        <span className="text-tk-t2">
          Giao diện {skew.ui} · dịch vụ {skew.api}.
        </span>
      </p>
    </div>
  );
}

/**
 * Thanh điều hướng của màn hình con (Haan, 07/10/2026: «hiện đại và mang tính công nghệ»).
 *
 * Trái: «Tổng quan» — nút trong suốt, mũi tên nằm trong một ô vuông bo góc, trượt sang trái khi
 * rê chuột. Phải: MỘT khối điều khiển gộp ba phần — bước trước · bộ đếm «Bước n trên m» kèm vạch tiến
 * trình · bước tiếp theo. Bước tiếp theo tô màu nhấn nhạt (không phải nút chính tô đặc: màn hình
 * con đã có hành động chính riêng, mỗi màn hình chỉ MỘT nút chính — CGD 6.3).
 *
 * Mỗi nút hai dòng: dòng chú nhỏ («Bước trước» / «Tiếp theo») và tên bước — mắt đọc tên bước
 * trước, không phải đọc hết cả câu «Bước tiếp theo: …». Trên điện thoại chỉ còn biểu tượng cho
 * bước trước và bộ đếm ẩn đi; tên bước tiếp theo vẫn hiện.
 */
function OverviewButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex h-11 items-center gap-2.5 rounded-xl pr-3.5 pl-1.5 font-medium text-tk-tx transition-colors duration-(--motion-fast) ease-(--ease-out) hover:bg-tk-hover"
    >
      <span className="grid size-8 place-items-center rounded-lg border border-tk-line2 bg-tk-card shadow-xs transition-[transform,border-color,color] duration-(--motion-fast) ease-(--ease-out) group-hover:-translate-x-0.5 group-hover:border-tk-acc group-hover:text-tk-acc">
        <ArrowLeft className="size-4" aria-hidden />
      </span>
      Tổng quan
    </button>
  );
}

const PAGER_BUTTON =
  'group flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-3 py-1.5 text-left transition-colors duration-(--motion-fast) ease-(--ease-out) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-acc';

function StepNav({
  label,
  prev,
  next,
  index,
  total,
  onSelect,
}: {
  label: string;
  prev: WorkspaceTab | undefined;
  next: WorkspaceTab | undefined;
  /** Vị trí bước đang xem, đếm từ 0. */
  index: number;
  total: number;
  onSelect: (id: string) => void;
}): React.ReactElement | null {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label={label}
      className="flex min-w-0 items-stretch gap-1 rounded-2xl border border-tk-line2 bg-tk-card/80 p-1 shadow-xs backdrop-blur"
    >
      {prev && (
        <button
          type="button"
          onClick={() => onSelect(prev.id)}
          className={cn(PAGER_BUTTON, 'text-tk-tx hover:bg-tk-hover')}
          aria-label={`Bước trước: ${prev.label}`}
        >
          <ArrowLeft
            className="size-4 shrink-0 text-tk-t3 transition-transform duration-(--motion-fast) group-hover:-translate-x-0.5 group-hover:text-tk-acc"
            aria-hidden
          />
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="text-xs text-tk-t3">Bước trước</span>
            <span className="truncate text-sm font-medium">{prev.label}</span>
          </span>
        </button>
      )}

      {total > 1 && (
        <span className="hidden flex-col items-center justify-center gap-1.5 border-x border-tk-line px-3 md:flex">
          <span className="font-mono text-xs text-tk-t3 tabular-nums">
            Bước <span className="font-semibold text-tk-tx">{index + 1}</span> trên {total}
          </span>
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-[width,background-color] duration-(--motion-base)',
                  i === index
                    ? 'w-4 bg-tk-acc'
                    : i < index
                      ? 'w-1.5 bg-tk-acc/50'
                      : 'w-1.5 bg-tk-line2',
                )}
              />
            ))}
          </span>
        </span>
      )}

      {next && (
        <button
          type="button"
          onClick={() => onSelect(next.id)}
          className={cn(PAGER_BUTTON, 'bg-tk-acc-dim text-tk-gr-fg hover:bg-tk-gr-tile')}
          aria-label={`Bước tiếp theo: ${next.label}`}
        >
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-xs opacity-80">Tiếp theo</span>
            <span className="truncate text-sm font-semibold">{next.label}</span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-tk-acc text-tk-card transition-transform duration-(--motion-fast) group-hover:translate-x-0.5">
            <ArrowRight className="size-4" aria-hidden />
          </span>
        </button>
      )}
    </nav>
  );
}
