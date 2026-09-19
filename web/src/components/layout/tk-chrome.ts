/**
 * "Đang ở trong Module Thiết kế hay không" — câu hỏi mà cả ba vùng của khung ứng dụng đều
 * phải trả lời giống nhau.
 *
 * Module Thiết kế có vỏ riêng: thanh điều hướng tối, thanh trên cao 60px, nền tối. Haan chốt
 * 06/09/2026 rằng vỏ đó **chỉ hiện khi ở trong `/tk/*`**, ra module khác thì trở lại vỏ sáng
 * dùng chung — nên phạm vi phải suy từ ĐƯỜNG DẪN, không phải từ một cờ ai đó bật lên rồi
 * quên tắt.
 *
 * Để ở một chỗ vì ba nơi cùng cần (khung, thanh trái, thanh trên) và ba nơi đó lệch nhau một
 * nhịp là thấy ngay: nền tối nhưng chữ vẫn màu của nền sáng.
 */

import { useLocation } from 'react-router-dom';

/** Tiền tố đường dẫn của Module Thiết kế — `MODULE_ROUTES.TK` cũng trỏ về đây. */
const TK_PREFIX = '/tk';

export function useTkScope(): boolean {
  const { pathname } = useLocation();
  return pathname === TK_PREFIX || pathname.startsWith(`${TK_PREFIX}/`);
}
