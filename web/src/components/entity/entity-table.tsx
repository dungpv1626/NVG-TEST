/**
 * Màn hình Danh sách — mẫu bố cục 2 (Webapp Flow Mục 4.2).
 *
 * Thay thế ~20 màn hình Danh sách của 12 module. Quy tắc bắt buộc từ tài liệu:
 *
 *  - Cột đầu tiên LUÔN là mã/tên hồ sơ, bấm để mở Chi tiết.
 *  - Ba cột cố định luôn hiển thị: NGƯỜI CHỊU TRÁCH NHIỆM, TRẠNG THÁI (có màu), THỜI HẠN
 *    (Webapp Flow 1.3 — "ba thông tin này xuất hiện ở vị trí cố định trên mọi màn hình").
 *  - Bộ lọc và tìm kiếm ở đầu bảng; trạng thái lọc được GIỮ LẠI khi quay lại từ Chi tiết
 *    (Webapp Flow 4.2 — "không mất bộ lọc khi bấm Back"). Lưu vào query string để hoạt động
 *    cả khi mở tab mới hoặc chia sẻ đường dẫn.
 *  - Hành động hàng loạt khi chọn nhiều dòng.
 *  - Trạng thái rỗng LUÔN kèm nút hành động gợi ý, không để trang trắng.
 *
 * Trên điện thoại, cùng dữ liệu đó hiển thị dạng THẺ thay vì bảng (Webapp Flow 4.8: không
 * thu nhỏ bố cục máy tính). Bảng 6–8 cột trên màn hình 390px chỉ còn cách cuộn ngang, mà
 * cuộn ngang thì ba cột cố định — người chịu trách nhiệm, trạng thái, thời hạn — nằm ngoài
 * màn hình đúng lúc cần nhìn nhất.
 */

import { Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DASHBOARD_PERIOD_LABELS,
  STATUS_GROUPS,
  formatDeadline,
  isDashboardPeriod,
  isStatusGroup,
  matchesPeriodFilter,
  statusLabel,
  type DashboardPeriod,
  type StatusGroup,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useCompanyLookup } from '@/hooks/use-companies';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';

/**
 * Tham số lọc theo trạng thái trên thanh địa chỉ.
 *
 * Đặt ở đây chứ không ở từng màn hình vì đây cũng là thứ các thẻ chỉ số trên Dashboard trỏ
 * tới: mẫu bố cục Dashboard yêu cầu mỗi thẻ dẫn thẳng tới DANH SÁCH ĐÃ LỌC SẴN theo đúng
 * điều kiện của thẻ (Webapp Flow 4.1). Một tên tham số dùng chung cho mọi danh sách nghĩa là
 * thêm một thẻ mới không phải sửa màn hình đích.
 */
export const STATUS_FILTER_PARAM = 'trang-thai';

/**
 * Tham số kỳ báo cáo — CÙNG tên với bộ lọc trên Dashboard, và đó là điểm mấu chốt.
 *
 * Thẻ trên Dashboard đếm hồ sơ trong kỳ đang chọn. Nếu đường dẫn nó dẫn tới không mang theo
 * kỳ đó, danh sách sẽ hiện mọi hồ sơ từ trước tới nay và ra một con số khác hẳn con số vừa
 * bấm vào — đúng thứ mẫu bố cục Dashboard cấm (Webapp Flow 4.1).
 */
export const PERIOD_FILTER_PARAM = 'ky';

/** Đường dẫn tới một danh sách đã lọc sẵn — dùng cho thẻ chỉ số trên Dashboard. */
export function listPathFiltered(
  basePath: string,
  filters: { status?: StatusGroup; period?: DashboardPeriod },
): string {
  const params = new URLSearchParams();
  if (filters.status) params.set(STATUS_FILTER_PARAM, filters.status);
  if (filters.period) params.set(PERIOD_FILTER_PARAM, filters.period);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Bản ghi tối thiểu mà mọi danh sách phải cung cấp. */
export interface EntityRow {
  id: string;
  /** Mã hồ sơ hiển thị (ví dụ `NVC-DA-2026-0001`) hoặc tên nếu chưa có mã. */
  code: string;
  title: string;
  /** Người chịu trách nhiệm — thuật ngữ chuẩn, Content Guidelines 4.4. */
  responsiblePerson: string | null;
  status: StatusGroup;
  deadline: string | null;
  /**
   * Ngày lập hồ sơ — chỉ cần khi danh sách này là ĐÍCH ĐẾN của một thẻ chỉ số trên Dashboard,
   * vì thẻ đếm theo kỳ báo cáo nên danh sách phải lọc được theo đúng kỳ đó.
   *
   * Bỏ trống (`undefined`) nghĩa là danh sách KHÔNG theo dõi ngày lập, và khi đó bộ lọc kỳ
   * không áp dụng — khác hẳn với `null` (hồ sơ có trường ngày nhưng đang để rỗng, và hồ sơ
   * như vậy thì không thuộc kỳ nào). Phân biệt hai thứ này để một danh sách quên khai báo
   * ngày lập không âm thầm biến thành danh sách rỗng.
   */
  createdAt?: string | null;
  /**
   * Pháp nhân của hồ sơ. Chỉ dùng khi màn hình đang GỘP nhiều pháp nhân ("Toàn NVG"):
   * lúc đó thanh bên không còn cho biết dòng này thuộc công ty nào, mà nhầm công ty là nhầm
   * P&L (PRD NEN-01).
   */
  companyId?: string | null;
}

export interface EntityColumn<T extends EntityRow> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Căn phải cho cột số/tiền — dễ so sánh theo cột. */
  numeric?: boolean;
}

export interface EntityTableProps<T extends EntityRow> {
  rows: T[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;

  /** Đường dẫn tới trang Chi tiết của một dòng. */
  detailPath: (row: T) => string;

  /** Cột bổ sung riêng của module, chèn giữa cột tên và ba cột cố định. */
  columns?: EntityColumn<T>[];

  /** Nội dung trạng thái rỗng — lấy từ `MODULE_EMPTY_STATES` trong `@nvg/shared`. */
  emptyMessage: string;
  emptyAction?: ReactNode;

  searchPlaceholder?: string;

  /** Bộ lọc bổ sung hiển thị cạnh ô tìm kiếm. */
  filters?: ReactNode;

  /**
   * Hiện ô lọc theo trạng thái. Đặt `false` cho danh mục không có vòng đời trạng thái thật
   * (khách hàng, đơn giá — mọi dòng đều mang cùng một trạng thái quy ước): ở đó ô lọc chỉ có
   * thể cho ra danh sách rỗng, tức là mời người dùng bấm vào một ngõ cụt.
   */
  showStatusFilter?: boolean;

  /**
   * Đặt `true` cho danh sách của bảng DÙNG CHUNG giữa các pháp nhân (`customers`, `suppliers`)
   * để KHÔNG chèn cột "Pháp nhân" khi đang gộp "Toàn NVG".
   *
   * Những bảng đó cố ý không có `company_id` (Backend Schema 2.2): một khách hàng xuất hiện ở
   * cơ hội của nhiều pháp nhân, gắn nó vào một pháp nhân là sai nghiệp vụ. Nhưng cột vẫn được
   * chèn thì mọi dòng hiện dấu gạch — đọc ra thành "hồ sơ này chưa được gán pháp nhân", một
   * việc còn thiếu cần đi sửa, trong khi sự thật là "pháp nhân không áp dụng ở đây".
   */
  sharedAcrossCompanies?: boolean;

  /** Bật chọn nhiều dòng để thao tác hàng loạt (Webapp Flow 4.2). */
  selection?: {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    actions: ReactNode;
  };
}

/**
 * Lọc phía trình duyệt theo từ khóa.
 *
 * Đủ cho quy mô dữ liệu hiện tại của NVG. Khi một danh sách vượt ngưỡng phân trang,
 * chuyển sang lọc phía máy chủ bằng `ilike` của PostgREST — đổi ở hook truy vấn,
 * không phải đổi component này.
 */
function matchesQuery(row: EntityRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    row.code.toLowerCase().includes(q) ||
    row.title.toLowerCase().includes(q) ||
    (row.responsiblePerson?.toLowerCase().includes(q) ?? false)
  );
}

export function EntityTable<T extends EntityRow>({
  rows,
  isLoading,
  error,
  onRetry,
  detailPath,
  columns = [],
  emptyMessage,
  emptyAction,
  searchPlaceholder = 'Tìm trong danh sách…',
  filters,
  showStatusFilter = true,
  sharedAcrossCompanies = false,
  selection,
}: EntityTableProps<T>) {
  // Bộ lọc lưu trong query string: quay lại từ Chi tiết vẫn giữ nguyên, và đường dẫn
  // chia sẻ được cho người khác (Webapp Flow 4.2).
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const statusParam = searchParams.get(STATUS_FILTER_PARAM);
  // Giá trị lạ trên thanh địa chỉ thì coi như KHÔNG lọc, chứ không phải danh sách rỗng —
  // đường dẫn cũ hoặc gõ tay sai không được biến thành màn hình trắng không giải thích được.
  const statusFilter = isStatusGroup(statusParam ?? '') ? (statusParam as StatusGroup) : null;

  const periodParam = searchParams.get(PERIOD_FILTER_PARAM);
  const periodFilter: DashboardPeriod | null = isDashboardPeriod(periodParam) ? periodParam : null;

  const scope = useCompanyScope();
  const showCompanyColumn = scope.isAggregate && !sharedAcrossCompanies;
  const companyOf = useCompanyLookup(showCompanyColumn);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          matchesQuery(r, query) &&
          (statusFilter === null || r.status === statusFilter) &&
          matchesPeriodFilter(r.createdAt, periodFilter),
      ),
    [rows, query, statusFilter, periodFilter],
  );

  const isFiltering = query !== '' || statusFilter !== null || periodFilter !== null;

  /**
   * Khi gộp "Toàn NVG", mỗi dòng phải tự nói nó thuộc pháp nhân nào.
   *
   * Không phải cột trang trí: ba pháp nhân có bộ mã hồ sơ riêng và P&L riêng, nhìn nhầm công
   * ty là đọc nhầm số (Webapp Flow 6.2, PRD NEN-01). Chèn ngay sau cột Mã/Tên chứ không đẩy
   * xuống cuối để nó nằm trong tầm mắt cùng lúc với tên hồ sơ.
   */
  const companyColumn: EntityColumn<T> = {
    key: '__company',
    header: 'Pháp nhân',
    render: (row) => companyOf(row.companyId)?.code ?? <span className="text-fg-subtle">—</span>,
  };
  // KHÔNG ghi nhớ bằng `useMemo`: hàm tra cứu đọc danh mục pháp nhân tải bất đồng bộ, nên bản
  // ghi nhớ dựng ở lượt vẽ đầu sẽ giữ mãi danh mục rỗng và cả cột chỉ hiện dấu gạch. Ghép hai
  // mảng ngắn mỗi lượt vẽ rẻ hơn nhiều so với một cột hỏng im lặng.
  const displayColumns = showCompanyColumn ? [companyColumn, ...columns] : columns;

  const allSelected =
    selection !== undefined &&
    filtered.length > 0 &&
    selection.selectedIds.length === filtered.length;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder={searchPlaceholder}
          className={cn(
            'h-10 w-full rounded-sm border border-border-strong bg-surface pl-8 pr-3 sm:h-8',
            'placeholder:text-fg-subtle',
            'transition-[border-color] duration-(--motion-fast) ease-(--ease-out)',
            'hover:border-fg-subtle',
          )}
        />
      </div>
      {/* Lọc theo trạng thái nằm ở component dùng chung vì MỌI danh sách đều có cột trạng
          thái, và vì các thẻ trên Dashboard dẫn thẳng tới đây bằng tham số này. */}
      {showStatusFilter && (
        <label className="flex items-center gap-2">
          <span className="text-fg-subtle">Trạng thái</span>
          <select
            value={statusFilter ?? ''}
            onChange={(e) => setParam(STATUS_FILTER_PARAM, e.target.value)}
            className={cn(
              'h-10 cursor-pointer rounded-sm border border-border-strong bg-surface px-2 sm:h-8',
              'transition-[border-color] duration-(--motion-fast) ease-(--ease-out)',
              'hover:border-fg-subtle',
            )}
          >
            <option value="">Tất cả</option>
            {STATUS_GROUPS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      )}
      {periodFilter && (
        <button
          type="button"
          onClick={() => setParam(PERIOD_FILTER_PARAM, '')}
          className={cn(
            'h-10 cursor-pointer rounded-sm border border-brand bg-brand-subtle px-3',
            'font-medium text-brand sm:h-8',
            'transition-colors duration-(--motion-fast) ease-(--ease-out) hover:bg-brand/10',
          )}
        >
          {DASHBOARD_PERIOD_LABELS[periodFilter]} — bỏ lọc kỳ
        </button>
      )}
      {filters}
      {selection && selection.selectedIds.length > 0 && (
        <div className="flex items-center gap-2 text-fg-subtle">
          <span>Đã chọn {selection.selectedIds.length}</span>
          {selection.actions}
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <>
        {toolbar}
        <ErrorState
          message="Không tải được danh sách. Kiểm tra kết nối mạng rồi thử lại."
          onRetry={onRetry}
          technicalDetail={error instanceof Error ? error.message : String(error)}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {toolbar}
        <TableSkeleton columns={4 + displayColumns.length} />
      </>
    );
  }

  if (filtered.length === 0) {
    return (
      <>
        {toolbar}
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            message={
              isFiltering
                ? 'Không tìm thấy kết quả phù hợp. Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.'
                : emptyMessage
            }
            action={isFiltering ? undefined : emptyAction}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}

      {/* Khổ điện thoại — mỗi hồ sơ một thẻ. */}
      <ul className="space-y-2 sm:hidden">
        {filtered.map((row) => {
          const isSelected = selection?.selectedIds.includes(row.id) ?? false;
          return (
            <li
              key={row.id}
              className={cn(
                'rounded-lg border border-border bg-surface p-3 shadow-raised',
                'transition-[border-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
                'active:bg-surface-hover',
                isSelected && 'border-brand bg-brand-subtle',
              )}
            >
              <div className="flex items-start gap-3">
                {selection && (
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${row.code}`}
                    checked={isSelected}
                    onChange={(e) =>
                      selection.onChange(
                        e.target.checked
                          ? [...selection.selectedIds, row.id]
                          : selection.selectedIds.filter((id) => id !== row.id),
                      )
                    }
                    className="mt-0.5 size-5 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={detailPath(row)}
                      className="min-w-0 font-medium text-brand hover:underline"
                    >
                      {row.title}
                    </Link>
                    {/* Trạng thái luôn kèm chữ, không chỉ dựa vào màu (Content Guidelines 6.8). */}
                    <StatusLozenge status={row.status} />
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-fg-subtle">{row.code}</div>

                  {displayColumns.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {displayColumns.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-fg-subtle">{c.header}</dt>
                          <dd className={cn('truncate', c.numeric && 'tabular-nums')}>
                            {c.render(row)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {/* Hai cột cố định còn lại đi cùng nhau ở chân thẻ. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                    <span>{row.responsiblePerson ?? 'Chưa phân công'}</span>
                    {row.deadline && (
                      <span
                        className={cn(
                          row.status === 'overdue' && 'font-medium text-status-overdue',
                        )}
                      >
                        {formatDeadline(row.deadline)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Khổ máy tính bảng trở lên — bảng đầy đủ cột. */}
      {/* `max-h` + `sticky` để đầu bảng ở lại khi cuộn danh sách dài: cuộn tới dòng thứ 40 mà
          không còn tên cột thì người dùng phải cuộn ngược lên để biết cột nào là gì. */}
      <div
        className={cn(
          'hidden max-h-[calc(100dvh-16rem)] overflow-auto rounded-lg',
          'border border-border bg-surface shadow-raised sm:block',
        )}
      >
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface shadow-sticky">
            <tr className="border-b border-border-strong text-xs uppercase tracking-wide text-fg-subtle">
              {selection && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={allSelected}
                    onChange={(e) =>
                      selection.onChange(e.target.checked ? filtered.map((r) => r.id) : [])
                    }
                  />
                </th>
              )}
              <th className="px-4 py-2.5 font-medium">Mã / Tên</th>
              {displayColumns.map((c) => (
                <th
                  key={c.key}
                  className={cn('px-4 py-2.5 font-medium', c.numeric && 'text-right')}
                >
                  {c.header}
                </th>
              ))}
              {/* Ba cột cố định — Webapp Flow 1.3. */}
              <th className="px-4 py-2.5 font-medium">Người chịu trách nhiệm</th>
              <th className="px-4 py-2.5 font-medium">Trạng thái</th>
              <th className="px-4 py-2.5 font-medium">Thời hạn</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isSelected = selection?.selectedIds.includes(row.id) ?? false;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border last:border-b-0',
                    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                    'hover:bg-surface-hover',
                    isSelected && 'bg-brand-subtle',
                  )}
                >
                  {selection && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Chọn ${row.code}`}
                        checked={isSelected}
                        onChange={(e) =>
                          selection.onChange(
                            e.target.checked
                              ? [...selection.selectedIds, row.id]
                              : selection.selectedIds.filter((id) => id !== row.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      to={detailPath(row)}
                      className="font-medium text-fg underline-offset-2 hover:text-brand hover:underline"
                    >
                      {row.title}
                    </Link>
                    <div className="text-xs text-fg-subtle">{row.code}</div>
                  </td>
                  {displayColumns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('px-4 py-3', c.numeric && 'text-right tabular-nums')}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {row.responsiblePerson ?? (
                      <span className="text-fg-subtle">Chưa phân công</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusLozenge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.deadline ? (
                      <span
                        className={cn(
                          row.status === 'overdue' && 'font-medium text-status-overdue',
                        )}
                      >
                        {formatDeadline(row.deadline)}
                      </span>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-fg-subtle">
        {isFiltering
          ? `${filtered.length} kết quả phù hợp trong ${rows?.length ?? 0} hồ sơ`
          : `${filtered.length} hồ sơ`}
      </p>
    </>
  );
}

/**
 * Nút tạo mới — dùng ở header trang và trong trạng thái rỗng.
 *
 * Ở trạng thái rỗng phải đặt `variant="secondary"`: hai nút cùng dẫn tới một hành động mà
 * cùng tô màu thương hiệu là vi phạm "DUY NHẤT một hành động chính mỗi màn hình"
 * (Content Guidelines 6.3). Nút ở header giữ vai trò hành động chính.
 */
export function CreateButton({
  label,
  to,
  variant = 'primary',
}: {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Button variant={variant} asChild>
      <Link to={to}>{label}</Link>
    </Button>
  );
}

/**
 * Cặp nút "Tạo … mới" cho một màn hình Danh sách: một ở header, một trong trạng thái rỗng.
 *
 * Gom về đây vì luật đi kèm chúng dễ quên khi chép tay: mỗi màn hình chỉ được có ĐÚNG MỘT
 * hành động chính (Content Guidelines 6.3), nên khi danh sách rỗng — lúc trạng thái rỗng đã
 * mời tạo mới — nút ở header phải biến mất, nếu không cùng một việc hiện hai lần trên cùng
 * một màn hình và người dùng phải chọn giữa hai thứ y hệt nhau.
 *
 * Trả `undefined` cho cả hai khi vai trò không có quyền tạo: điều hướng phản ánh phân quyền,
 * ẩn hẳn chứ không hiện rồi báo lỗi khi bấm (Webapp Flow 6.5).
 */
export function useCreateActions({
  canCreate,
  label,
  to,
  isEmpty,
}: {
  canCreate: boolean;
  label: string;
  to: string;
  /** Danh sách đã tải xong và không có dòng nào. Đang tải hay lỗi thì KHÔNG tính là rỗng. */
  isEmpty: boolean;
}): { headerAction: ReactNode; emptyAction: ReactNode } {
  if (!canCreate) return { headerAction: undefined, emptyAction: undefined };
  return {
    headerAction: isEmpty ? undefined : <CreateButton label={label} to={to} />,
    emptyAction: <CreateButton label={label} to={to} variant="secondary" />,
  };
}
