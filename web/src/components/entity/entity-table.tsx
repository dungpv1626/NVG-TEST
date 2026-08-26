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
 * Trên điện thoại, cùng dữ liệu đó hiển thị dạng THẺ thay vì bảng (Webapp Flow 4.7: không
 * thu nhỏ bố cục máy tính). Bảng 6–8 cột trên màn hình 390px chỉ còn cách cuộn ngang, mà
 * cuộn ngang thì ba cột cố định — người chịu trách nhiệm, trạng thái, thời hạn — nằm ngoài
 * màn hình đúng lúc cần nhìn nhất.
 */

import { Search } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDeadline, type StatusGroup } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { cn } from '@/lib/utils';

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
  selection,
}: EntityTableProps<T>) {
  // Bộ lọc lưu trong query string: quay lại từ Chi tiết vẫn giữ nguyên, và đường dẫn
  // chia sẻ được cho người khác (Webapp Flow 4.2).
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const filtered = useMemo(() => (rows ?? []).filter((r) => matchesQuery(r, query)), [rows, query]);

  const allSelected =
    selection !== undefined &&
    filtered.length > 0 &&
    selection.selectedIds.length === filtered.length;

  function setQuery(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className={cn(
            'h-10 w-full rounded-sm border border-border bg-surface pl-8 pr-3 sm:h-8',
            'placeholder:text-fg-subtle',
          )}
        />
      </div>
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
        <TableSkeleton columns={4 + columns.length} />
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
              query
                ? 'Không tìm thấy kết quả phù hợp. Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.'
                : emptyMessage
            }
            action={query ? undefined : emptyAction}
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
                'rounded-lg border border-border bg-surface p-3',
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

                  {columns.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {columns.map((c) => (
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
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface sm:block">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-fg-subtle">
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
              {columns.map((c) => (
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
                    'border-b border-border last:border-b-0 hover:bg-surface-hover',
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
                    <Link to={detailPath(row)} className="text-brand hover:underline">
                      <span className="font-medium">{row.title}</span>
                    </Link>
                    <div className="text-xs text-fg-subtle">{row.code}</div>
                  </td>
                  {columns.map((c) => (
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
                        className={cn(row.status === 'overdue' && 'font-medium text-status-overdue')}
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
        {query
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
