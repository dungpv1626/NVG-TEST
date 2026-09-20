/**
 * Trung tâm Thông báo — panel thả xuống của nút chuông ở Top Bar (Webapp Flow 5.4).
 *
 * TÁCH RIÊNG khỏi Việc cần làm: đây là thông tin MỘT CHIỀU, không có nút "Xử lý" — bấm vào
 * một dòng vừa đánh dấu đã đọc vừa điều hướng thẳng tới `action_url` của chính hồ sơ liên
 * quan (mọi thông báo BẮT BUỘC có đường dẫn, xem `db/src/schema/notifications.ts`).
 */

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '@nvg/shared';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useNotifications();
  // Huy hiệu đếm TOÀN BỘ chưa đọc — có thể nhiều hơn 30 dòng đang hiện trong panel bên dưới,
  // nên KHÔNG đếm bằng cách lọc trên `rows` (xem ghi chú ở use-notifications.ts).
  const { data: unreadCount } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const rows = data ?? [];
  const hasUnread = (unreadCount ?? 0) > 0;
  const bellLabel = hasUnread ? `Thông báo — ${unreadCount} chưa đọc` : 'Thông báo';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function openNotification(id: string, readAt: string | null, actionUrl: string) {
    if (!readAt) markRead.mutate(id);
    setIsOpen(false);
    void navigate(actionUrl);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={bellLabel}
        title={bellLabel}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'relative flex size-10 items-center justify-center rounded-md sm:size-8',
          'text-fg-subtle hover:bg-surface-muted hover:text-fg',
        )}
      >
        <Bell className="size-4" />
        {hasUnread && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center',
              'rounded-full bg-status-overdue px-1 text-[10px] font-semibold',
              'text-fg-inverse',
            )}
          >
            {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Thông báo"
          className={cn(
            'absolute right-0 top-full z-50 mt-1 max-h-96 w-80 overflow-y-auto rounded-md',
            'border border-border bg-surface p-1 shadow-overlay',
          )}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-bold tracking-wide text-fg-subtle">Thông báo</span>
            {hasUnread && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs text-brand hover:underline"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-fg-subtle">
              Chưa có thông báo nào.
            </div>
          ) : (
            rows.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={() => openNotification(n.id, n.readAt, n.actionUrl)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left',
                  'hover:bg-surface-hover',
                  !n.readAt && 'bg-brand-subtle/40',
                )}
              >
                <span className="flex w-full items-start gap-2">
                  {!n.readAt && (
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                  )}
                  <span className={cn('flex-1', !n.readAt && 'font-medium')}>{n.message}</span>
                </span>
                <span className="pl-3.5 text-xs text-fg-subtle">{formatDateTime(n.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
