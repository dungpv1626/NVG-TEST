/**
 * Trạng thái vòng đời PWA — tách khỏi giao diện để phần hiển thị chỉ còn việc hiển thị.
 *
 * Ba việc ở đây đều là chuyện của trình duyệt, không phải chuyện nghiệp vụ:
 *  1. Kết nối mạng còn hay mất.
 *  2. Ứng dụng đã cài lên màn hình chính chưa, và cài được không.
 *  3. Có bản mới đang chờ thay thế bản đang chạy không.
 */

import { useCallback, useEffect, useState } from 'react';

/**
 * Sự kiện Chrome/Edge phát ra khi trang đủ điều kiện cài đặt.
 * Chưa có trong lib DOM chuẩn nên phải tự khai báo.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Còn kết nối mạng không. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** Đang chạy dạng ứng dụng đã cài (toàn màn hình), hay đang chạy trong tab trình duyệt. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari trên iOS không hỗ trợ display-mode, dùng thuộc tính riêng của nó.
    ('standalone' in window.navigator && Boolean(window.navigator.standalone))
  );
}

/** Thiết bị iPhone/iPad — nơi việc cài đặt phải làm thủ công qua nút Chia sẻ. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

const DISMISS_KEY = 'nvg.pwa.install-dismissed';

/**
 * Lời mời cài đặt ứng dụng.
 *
 * Đã từ chối một lần thì KHÔNG hỏi lại (Content Guidelines 3.4 — không lặp lại thông báo
 * đã xử lý). Người dùng vẫn cài được bất cứ lúc nào từ menu của trình duyệt.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1' || isStandalone(),
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Chặn thanh mời cài mặc định của trình duyệt để tự chọn thời điểm hỏi.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  }, [event]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  return {
    /** Cài được ngay bằng một nút (Chrome, Edge, Android). */
    canInstall: Boolean(event) && !dismissed,
    /** iOS: không có nút, phải hướng dẫn thao tác thủ công. */
    showIosHint: isIos() && !isStandalone() && !dismissed,
    install,
    dismiss,
  };
}
