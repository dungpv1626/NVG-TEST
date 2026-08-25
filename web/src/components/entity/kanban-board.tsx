/**
 * Bảng Kanban / Pipeline — mẫu bố cục 5 (Webapp Flow Mục 4.5).
 *
 * "Chỉ dùng cho các quy trình có SỐ LƯỢNG TRẠNG THÁI CỐ ĐỊNH và người dùng cần nhìn tổng quan
 *  phân bổ — các quy trình phê duyệt tuần tự dùng mẫu Hộp thư Phê duyệt thay vì Kanban."
 *
 * Kéo–thả để chuyển trạng thái, hoặc bấm vào thẻ để mở Chi tiết.
 *
 * Dùng HTML Drag and Drop có sẵn của trình duyệt thay vì thư viện kéo–thả:
 * đủ cho nhu cầu ở đây, không thêm phụ thuộc, và hoạt động với bàn phím qua nút chuyển
 * trạng thái trên từng thẻ (khả năng tiếp cận — Content Guidelines 6.8: kéo–thả KHÔNG
 * được là cách duy nhất để thực hiện một thao tác).
 */

import { useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDeadline, type MoneyValue } from '@nvg/shared';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';

export interface KanbanColumn {
  id: string;
  label: string;
  description?: string;
  /** Cột kết thúc quy trình — thẻ ở đây không kéo đi tiếp được. */
  isTerminal?: boolean;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  code: string;
  /** Người chịu trách nhiệm — một trong ba thông tin luôn hiển thị (Webapp Flow 1.3). */
  responsiblePerson: string | null;
  deadline: string | null;
  amount: MoneyValue | null;
  detailPath: string;
  /** Nhãn phụ, ví dụ phân loại M1–M4 hoặc tên khách hàng. */
  subtitle?: string | null;
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  cards: KanbanCard[] | undefined;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Gọi khi thẻ được chuyển sang cột khác. Trả về `false` để hủy (ví dụ người dùng bấm Hủy). */
  onMove: (card: KanbanCard, toColumnId: string) => Promise<boolean | void>;
  /** `false` khi người dùng không có quyền sửa — thẻ vẫn xem được nhưng không kéo được. */
  canMove?: boolean;
  emptyMessage: string;
  emptyAction?: ReactNode;
}

export function KanbanBoard({
  columns,
  cards,
  isLoading,
  error,
  onRetry,
  onMove,
  canMove = true,
  emptyMessage,
  emptyAction,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  if (error) {
    return (
      <ErrorState
        message="Không tải được pipeline. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={onRetry}
        technicalDetail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((c) => (
          <div key={c.id} className="w-64 shrink-0 space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  const list = cards ?? [];

  if (list.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState message={emptyMessage} action={emptyAction} />
      </div>
    );
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, columnId: string) {
    e.preventDefault();
    setDropTarget(null);
    const cardId = e.dataTransfer.getData('text/plain');
    const card = list.find((c) => c.id === cardId);
    setDraggingId(null);
    if (!card || card.columnId === columnId) return;

    setMoving(true);
    try {
      await onMove(card, columnId);
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className={cn('flex gap-3 overflow-x-auto pb-2', moving && 'pointer-events-none opacity-70')}>
      {columns.map((column) => {
        const columnCards = list.filter((c) => c.columnId === column.id);
        const total = columnCards.reduce(
          (sum, c) => sum + (c.amount ? BigInt(String(c.amount).split('.')[0] ?? '0') : 0n),
          0n,
        );

        return (
          <div
            key={column.id}
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              setDropTarget(column.id);
            }}
            onDragLeave={() => setDropTarget((t) => (t === column.id ? null : t))}
            onDrop={(e) => void handleDrop(e, column.id)}
            className={cn(
              'w-64 shrink-0 rounded-lg border p-2',
              dropTarget === column.id
                ? 'border-brand bg-brand-subtle'
                : 'border-border bg-surface-sunken',
            )}
          >
            <div className="mb-2 px-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate font-semibold" title={column.description}>
                  {column.label}
                </h2>
                <span className="shrink-0 rounded-full bg-surface px-1.5 text-xs text-fg-subtle">
                  {columnCards.length}
                </span>
              </div>
              {total > 0n && (
                <div className="text-xs tabular-nums text-fg-subtle">{formatCurrency(total)}</div>
              )}
            </div>

            <ul className="space-y-2">
              {columnCards.map((card) => (
                <li key={card.id}>
                  <div
                    draggable={canMove && !column.isTerminal}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', card.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingId(card.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={cn(
                      'rounded-lg border border-border bg-surface p-2.5 shadow-card',
                      canMove && !column.isTerminal && 'cursor-grab active:cursor-grabbing',
                      draggingId === card.id && 'opacity-50',
                    )}
                  >
                    <Link to={card.detailPath} className="block">
                      <span className="line-clamp-2 font-medium text-brand hover:underline">
                        {card.title}
                      </span>
                    </Link>
                    <div className="mt-1 font-mono text-xs text-fg-subtle">{card.code}</div>
                    {card.subtitle && (
                      <div className="mt-1 truncate text-xs text-fg-subtle">{card.subtitle}</div>
                    )}
                    {card.amount !== null && (
                      <div className="mt-1 font-medium tabular-nums">
                        {formatCurrency(card.amount)}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-fg-subtle">
                      <span className="truncate">{card.responsiblePerson ?? 'Chưa phân công'}</span>
                      {card.deadline && <span className="shrink-0">{formatDeadline(card.deadline)}</span>}
                    </div>
                  </div>
                </li>
              ))}
              {columnCards.length === 0 && (
                <li className="px-1 py-4 text-center text-xs text-fg-subtle">Chưa có hồ sơ</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
