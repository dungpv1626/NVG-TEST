/**
 * Hỏi trước khi bỏ dữ liệu đang nhập dở.
 *
 * "KHÔNG bao giờ để mất dữ liệu đang nhập" (Webapp Flow 6.3) là một ràng buộc cứng, nhưng
 * trước đây mỗi biểu mẫu chỉ tự bảo vệ được đúng nút **Hủy** của nó. Mọi lối ra khác — bấm
 * breadcrumb, bấm mục menu bên trái, bấm nút Lùi của trình duyệt, đóng tab, tải lại trang —
 * đều đi vòng qua nút đó và xóa sạch những gì đã gõ mà không hỏi một câu.
 *
 * Hook này bịt cả hai nhóm lối ra:
 *
 * 1. **Điều hướng trong ứng dụng** — `useBlocker` giữ lại lần chuyển trang để hỏi. Đây là lý
 *    do `App.tsx` phải dùng `createBrowserRouter`: `useBlocker` không chạy với `<BrowserRouter>`.
 * 2. **Rời khỏi trang** — `beforeunload` cho đóng tab / tải lại / gõ địa chỉ khác. Trình duyệt
 *    tự hiện hộp thoại của nó và KHÔNG cho đặt lời thoại riêng, nên phần chữ ở đây không theo
 *    được Content Guidelines — đổi lại, không mất dữ liệu vẫn hơn.
 *
 * Chỉ gắn khi `dirty` là `true`. Gắn `beforeunload` vô điều kiện sẽ chặn cả những lần rời
 * trang hoàn toàn bình thường, và người dùng học được cách bấm "Rời khỏi" theo phản xạ — đến
 * lúc cảnh báo thật thì nó không còn tác dụng.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { CONFIRMS } from '@nvg/shared';

/**
 * @returns `release` — tắt hàng rào NGAY LẬP TỨC, gọi ngay trước khi tự chuyển trang sau khi
 * lưu thành công. Cần một hàm riêng vì `setDirty(false)` chỉ có hiệu lực ở lượt vẽ sau, mà
 * `navigate()` thì chạy ngay trong cùng lượt — không có nó, người dùng vừa bấm Lưu xong lại bị
 * hỏi "dữ liệu chưa lưu sẽ mất", đúng lúc dữ liệu vừa được lưu xong.
 */
/**
 * Lần điều hướng này có RỜI khỏi biểu mẫu không.
 *
 * Cố ý bỏ qua phần lớn `search`: biểu mẫu nhiều bước đổi bước bằng tham số URL (Webapp Flow
 * 4.4), và chặn ở đó là hỏi "dữ liệu sẽ mất" giữa chừng chính việc người dùng đang làm —
 * trong khi họ có rời trang đâu.
 *
 * Nhưng KHÔNG bỏ qua `tab`. Màn hình chi tiết dùng cùng một đường dẫn cho mọi tab và mọi màn
 * hình con (`/tk/du-an/<id>?tab=…`), nên nút «← Tổng quan» của trình soạn thảo Đầu bài rời
 * khỏi biểu mẫu mà chỉ đổi đúng tham số đó. So mỗi `pathname` thì nó lọt qua hàng rào và xoá
 * sạch những gì vừa gõ, không hỏi một câu — đúng thứ "KHÔNG bao giờ để mất dữ liệu đang
 * nhập" (Webapp Flow 6.3) tồn tại để chặn.
 *
 * Một tham số, không phải cả chuỗi: bộ lọc, phân trang, bước của wizard đều nằm trong
 * `search` và không cái nào là rời biểu mẫu.
 */
function leavesForm(
  current: { pathname: string; search: string },
  next: { pathname: string; search: string },
): boolean {
  if (current.pathname !== next.pathname) return true;
  const tabOf = (search: string) => new URLSearchParams(search).get('tab');
  return tabOf(current.search) !== tabOf(next.search);
}

export function useUnsavedChangesGuard(dirty: boolean): () => void {
  // Đọc qua `ref` chứ không đọc thẳng `dirty`: hàm quyết định chặn được router gọi ngoài chu
  // kỳ vẽ của React, nên nó phải nhìn thấy giá trị mới nhất chứ không phải giá trị đóng băng
  // trong lượt vẽ đã đăng ký nó.
  const active = useRef(dirty);
  useEffect(() => {
    active.current = dirty;
  }, [dirty]);

  const release = useCallback(() => {
    active.current = false;
  }, []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active.current && leavesForm(currentLocation, nextLocation),
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(CONFIRMS.unsavedChanges)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Một số trình duyệt cũ vẫn cần `returnValue` được gán thì mới hiện hộp thoại.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  return release;
}
