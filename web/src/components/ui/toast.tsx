/**
 * Thông báo nhỏ tối có «Hoàn tác» — trạng thái chung 1.9 của giao diện v2 (handoff README).
 *
 * Hai cách dùng:
 *  - `showToast({ message, onUndo })`: việc ĐÃ ghi xong, «Hoàn tác» chạy thao tác ngược (đổi cờ lại).
 *  - `showToast({ message, onExpire, onUndo })`: việc CHƯA ghi — nơi gọi ẩn dòng ngay, ghi thật ở
 *    `onExpire` khi thông báo hết hạn; «Hoàn tác» chỉ hiện lại dòng. Dùng khi CSDL không cho thao
 *    tác ngược (vd chính sách sửa bỏ qua dòng đã xoá mềm). Đóng tab trước hạn thì việc không xảy ra
 *    — hướng an toàn: không mất dữ liệu (CLAUDE.md 5.4).
 *
 * Một thông báo một lúc: thông báo mới tới thì thông báo cũ hết hạn ngay (việc của nó được ghi).
 * Khung đặt một lần ở `AppShell`, nên đổi trang không làm mất việc đang chờ ghi.
 */

import { Undo2, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';

export const TOAST_DURATION_MS = 6000;

export interface ToastOptions {
  message: string;
  /** Có thì hiện nút «Hoàn tác». */
  onUndo?: () => void | Promise<void>;
  /** Chạy khi thông báo hết hạn hoặc bị đóng mà không hoàn tác. */
  onExpire?: () => void | Promise<void>;
  durationMs?: number;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

interface ToastStore {
  current: ActiveToast | null;
  show: (options: ToastOptions) => void;
  /** Đóng thông báo; `undo` = người dùng bấm «Hoàn tác». */
  close: (id: number, undo: boolean) => void;
}

let nextId = 1;

function run(fn: (() => void | Promise<void>) | undefined) {
  if (!fn) return;
  try {
    void Promise.resolve(fn()).catch(() => undefined);
  } catch {
    // Lỗi của việc nền không được làm đổ khung ứng dụng; nơi gọi tự báo lỗi trong hàm của nó.
  }
}

export const useToastStore = create<ToastStore>((set, get) => ({
  current: null,
  show: (options) => {
    const previous = get().current;
    set({ current: { ...options, id: nextId++ } });
    if (previous) run(previous.onExpire);
  },
  close: (id, undo) => {
    const toast = get().current;
    if (!toast || toast.id !== id) return;
    set({ current: null });
    run(undo ? toast.onUndo : toast.onExpire);
  },
}));

export function showToast(options: ToastOptions): void {
  useToastStore.getState().show(options);
}

export function Toaster() {
  const toast = useToastStore((s) => s.current);
  const close = useToastStore((s) => s.close);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => close(toast.id, false),
      toast.durationMs ?? TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast, close]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4',
        // Trên điện thoại nằm trên thanh tab (~64px + vạch Home), trên máy tính sát đáy.
        'bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6',
      )}
    >
      {toast && (
        <div
          className={cn(
            // Bo thẻ tối chứ không bo viên: câu dài xuống hai, ba dòng trên điện thoại.
            'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card-dark',
            'bg-shell-card py-2 pr-2 pl-4 text-sm text-fg-inverse shadow-overlay',
          )}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => close(toast.id, true)}
              className={cn(
                'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold',
                'text-brand-mint hover:bg-shell-active sm:min-h-8',
              )}
            >
              <Undo2 className="size-4" aria-hidden />
              Hoàn tác
            </button>
          )}
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => close(toast.id, false)}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full sm:size-8',
              'text-shell-fg-subtle hover:bg-shell-active hover:text-fg-inverse',
            )}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
