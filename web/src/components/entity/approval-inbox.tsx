/**
 * Hộp thư Phê duyệt — mẫu bố cục 6 (Webapp Flow Mục 4.6).
 *
 * "Dùng cho MỌI loại phê duyệt trong hệ thống (giá dự thầu, hợp đồng, đề nghị thanh toán,
 *  tạm ứng, nghỉ phép...) — GOM VỀ MỘT MẪU DUY NHẤT dù nội dung phê duyệt thuộc module nào."
 *
 * Đây là màn hình giải quyết trực tiếp vướng mắc #6 trong khảo sát ("chờ cấp trên duyệt lâu
 * mới làm tiếp được") bằng cách gom mọi phê duyệt về một nơi thay vì rải rác từng module.
 *
 * Quy tắc bắt buộc:
 *  - Danh sách bên trái sắp theo MỨC ĐỘ KHẨN / thời gian chờ, không phải theo thứ tự tạo.
 *  - Xem nhanh bên phải đủ thông tin để QUYẾT ĐỊNH mà không cần rời Hộp thư; có nút
 *    "Xem đầy đủ hồ sơ" nếu cần xem sâu hơn.
 *  - Sau khi phê duyệt/từ chối, TỰ ĐỘNG chuyển sang hồ sơ tiếp theo — không bắt người duyệt
 *    quay lại danh sách sau mỗi lần xử lý.
 *  - Chỉ hiển thị hồ sơ nằm trong hạn mức của người dùng (mẫu RLS C) — việc lọc do RLS lo,
 *    component này không tự suy diễn quyền.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BUTTONS, formatCurrency, formatDeadline, type ApprovalSubject } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { cn } from '@/lib/utils';

export interface ApprovalItem {
  id: string;
  /** Loại nghiệp vụ — quyết định hạn mức áp dụng (PRD NEN-02). */
  subject: ApprovalSubject;
  code: string;
  title: string;
  /** Người gửi phê duyệt. */
  requestedBy: string;
  requestedAt: string;
  /** Giá trị hồ sơ, đơn vị đồng. `null` với nghiệp vụ không gắn tiền (nghỉ phép). */
  amount: bigint | string | null;
  /** Đường dẫn tới hồ sơ đầy đủ ở module tương ứng. */
  fullRecordPath: string;
  /** Nội dung xem nhanh — đủ để quyết định mà không rời Hộp thư. */
  preview: ReactNode;
}

export interface ApprovalInboxProps {
  items: ApprovalItem[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  onDecision: (item: ApprovalItem, decision: 'approved' | 'rejected', note: string) => Promise<void>;
}

export function ApprovalInbox({
  items,
  isLoading,
  error,
  onRetry,
  onDecision,
}: ApprovalInboxProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = items ?? [];
  const selected = list.find((i) => i.id === selectedId) ?? list[0];

  // Giữ con trỏ ở hồ sơ hợp lệ khi danh sách thay đổi (ví dụ vừa duyệt xong một hồ sơ).
  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null);
    } else if (!list.some((i) => i.id === selectedId)) {
      setSelectedId(list[0]!.id);
    }
  }, [list, selectedId]);

  async function decide(decision: 'approved' | 'rejected') {
    if (!selected) return;
    setActionError(null);
    setSubmitting(true);
    try {
      // Ghi lại vị trí hiện tại để nhảy sang hồ sơ TIẾP THEO sau khi xử lý xong,
      // thay vì bắt người duyệt quay lại danh sách (Webapp Flow 4.6).
      const index = list.findIndex((i) => i.id === selected.id);
      const next = list[index + 1] ?? list[index - 1] ?? null;

      await onDecision(selected, decision, note.trim());
      setNote('');
      setSelectedId(next?.id ?? null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <ErrorState
        message="Không tải được danh sách hồ sơ chờ phê duyệt. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={onRetry}
        technicalDetail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (isLoading) return <TableSkeleton rows={6} columns={3} />;

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        {/* Trạng thái rỗng mang tính tích cực (Content Guidelines 4.7). */}
        <EmptyState message="Không có việc nào cần xử lý. Mọi thứ đã được cập nhật." />
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      {/* Danh sách bên trái — đã sắp theo mức độ khẩn ở tầng truy vấn. */}
      <ul className="w-80 shrink-0 space-y-1 overflow-y-auto" aria-label="Hồ sơ chờ phê duyệt">
        {list.map((item) => {
          const isActive = item.id === selected?.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'w-full rounded-lg border p-3 text-left',
                  isActive
                    ? 'border-brand bg-brand-subtle'
                    : 'border-border bg-surface hover:bg-surface-hover',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-medium">{item.title}</span>
                  <StatusLozenge status="pending_approval" />
                </div>
                <div className="mt-1 font-mono text-xs text-fg-subtle">{item.code}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-subtle">
                  <span className="truncate">{item.requestedBy}</span>
                  <span>{formatDeadline(item.requestedAt)}</span>
                </div>
                {item.amount !== null && (
                  <div className="mt-1 font-medium tabular-nums">
                    {formatCurrency(item.amount)}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Xem nhanh bên phải — đủ để quyết định mà KHÔNG cần rời Hộp thư. */}
      {selected && (
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{selected.title}</h2>
              <p className="font-mono text-xs text-fg-subtle">{selected.code}</p>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link to={selected.fullRecordPath}>{BUTTONS.viewFullRecord}</Link>
            </Button>
          </div>

          <div className="mb-4">{selected.preview}</div>

          <div className="space-y-2 border-t border-border pt-4">
            <label className="block space-y-1.5">
              <span className="block font-medium">Ý kiến</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Nêu căn cứ phê duyệt hoặc lý do từ chối"
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
              />
            </label>

            {actionError && (
              <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
                {actionError}
              </p>
            )}

            <div className="flex items-center gap-2">
              {/* Hành động chính DUY NHẤT trên màn hình (Content Guidelines 6.3). */}
              <Button variant="primary" disabled={submitting} onClick={() => void decide('approved')}>
                {submitting ? 'Đang xử lý…' : BUTTONS.approve}
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={() => void decide('rejected')}>
                {BUTTONS.reject}
              </Button>
              <span className="ml-auto text-xs text-fg-subtle">
                Còn {list.length} hồ sơ chờ xử lý
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
