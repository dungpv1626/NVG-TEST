/**
 * Ba thông báo vòng đời ứng dụng cài trên điện thoại.
 *
 *  1. Mất kết nối — Webapp Flow 4.7 yêu cầu màn hình di động LUÔN hiện trạng thái đồng bộ
 *     dữ liệu. Không nói gì thì người dùng ở công trường tưởng dữ liệu đã lưu.
 *  2. Có bản mới — hỏi trước khi tải lại, không tự nạp giữa chừng (Webapp Flow 6.3).
 *  3. Mời cài lên màn hình chính — hỏi ĐÚNG MỘT LẦN, từ chối rồi thì thôi
 *     (Content Guidelines 3.4).
 */

import { Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt, useOnline } from '@/lib/pwa';
import { cn } from '@/lib/utils';

/** Kiểm tra bản mới mỗi giờ — máy để mở cả ngày vẫn nhận được bản vá. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Dải báo mất mạng — đặt ngay dưới thanh trên cùng, chiếm hết chiều ngang.
 *
 * KHÔNG chỉ dùng màu để truyền đạt (Content Guidelines 6.8): có icon và có chữ.
 */
export function OfflineBar() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex shrink-0 items-center justify-center gap-2 px-4 py-1.5',
        'bg-status-pending-bg text-status-pending',
      )}
    >
      <WifiOff className="size-4 shrink-0" />
      <span className="text-center">
        Đang ngoại tuyến. Dữ liệu mới không tải được cho tới khi có mạng trở lại.
      </span>
    </div>
  );
}

function PromptCard({
  title,
  detail,
  actions,
  onDismiss,
  dismissLabel,
}: {
  title: string;
  detail: string;
  actions: React.ReactNode;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className={cn(
        'pointer-events-auto w-full max-w-md rounded-lg border border-border',
        'bg-surface p-4 shadow-overlay',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-fg-subtle">{detail}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          // 40px trên màn hình cảm ứng, 32px trên máy tính có chuột (Content Guidelines 6.8) —
          // cùng quy tắc với IconButton ở Top Bar; lề âm co giãn theo để icon vẫn nép sát góc
          // thẻ như trước, không đội bố cục lên.
          className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-hover sm:-mr-1 sm:-mt-1 sm:size-8"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function PwaPrompts() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });

  const { canInstall, showIosHint, install, dismiss } = useInstallPrompt();

  if (!needRefresh && !canInstall && !showIosHint) return null;

  return (
    // `pointer-events-none` ở lớp bao để vùng trống không chặn thao tác với nội dung phía sau;
    // từng thẻ tự bật lại. `pb-[env(safe-area-inset-bottom)]`: tránh vạch Home của iPhone.
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2',
        'p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]',
      )}
    >
      {needRefresh && (
        <PromptCard
          title="Đã có phiên bản mới."
          detail="Tải lại để dùng bản mới. Nội dung đang nhập dở trên màn hình hiện tại sẽ mất khi tải lại."
          dismissLabel="Đóng thông báo cập nhật"
          onDismiss={() => setNeedRefresh(false)}
          actions={
            <>
              <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
                <RefreshCw className="size-4" />
                Tải lại
              </Button>
              <Button variant="subtle" onClick={() => setNeedRefresh(false)}>
                Để sau
              </Button>
            </>
          }
        />
      )}

      {canInstall && (
        <PromptCard
          title="Cài ứng dụng lên màn hình chính."
          detail="Mở nhanh như một ứng dụng, chạy toàn màn hình, không phải gõ lại địa chỉ web."
          dismissLabel="Bỏ qua lời mời cài đặt"
          onDismiss={dismiss}
          actions={
            <>
              <Button variant="primary" onClick={() => void install()}>
                <Download className="size-4" />
                Cài đặt
              </Button>
              <Button variant="subtle" onClick={dismiss}>
                Bỏ qua
              </Button>
            </>
          }
        />
      )}

      {!canInstall && showIosHint && (
        <PromptCard
          title="Cài ứng dụng lên màn hình chính."
          // iOS không cho phép cài bằng nút — chỉ dẫn được đúng thao tác thủ công.
          detail="Trên iPhone và iPad: bấm nút Chia sẻ ở thanh công cụ, chọn Thêm vào Màn hình chính."
          dismissLabel="Bỏ qua hướng dẫn cài đặt"
          onDismiss={dismiss}
          actions={
            <Button variant="secondary" onClick={dismiss}>
              <Share className="size-4" />
              Đã hiểu
            </Button>
          }
        />
      )}
    </div>
  );
}
