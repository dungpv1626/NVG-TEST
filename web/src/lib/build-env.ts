/**
 * Kiểm biến `VITE_*` trước khi dựng bản phát hành — `web/vite.config.ts` gọi hàm này và DỪNG
 * build nếu có vấn đề.
 *
 * Biến `VITE_*` được Vite thay thẳng vào mã JS lúc build (SPA không có máy chủ nào đưa cấu hình
 * vào lúc chạy), nên giá trị sai chỉ lộ ra khi người dùng mở trang — build và deploy vẫn XANH.
 * Đã hỏng thật hai lần theo đúng kiểu đó:
 *
 * - Biến RỖNG (Workers Builds thiếu build variable): `supabase.ts` throw lúc nạp module, trắng màn
 *   hình, mà `not_found_handling: "single-page-application"` vẫn trả 200 cho mọi đường dẫn.
 * - Biến trỏ về MÁY PHÁT TRIỂN (23/09/2026): bản public dựng ở máy bằng `.env` dev, đóng gói
 *   `VITE_DESIGN_API_URL=http://localhost:8788`. Tab «AI Design» chỉ chạy trên đúng máy đang mở
 *   `wrangler dev`; mọi máy khác thấy «Dịch vụ thiết kế đang không phản hồi» từ 06/09.
 *
 * Giá trị đúng cho bản phát hành nằm ở `.env.production` (có commit — chỉ chứa địa chỉ công khai,
 * đằng nào cũng nằm trong bundle). Chỉ áp cho `vite build` ở mode `production`: `vite build --mode
 * development` để gỡ lỗi vẫn được trỏ về máy.
 */

/** Mọi biến `VITE_*` mà `define` trong `vite.config.ts` đưa vào bundle — thiếu cái nào là hỏng. */
export const REQUIRED_BUILD_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_DESIGN_API_URL',
] as const;

/** Biến là địa chỉ — trình duyệt của người dùng thật sẽ gọi tới. */
const URL_ENV = ['VITE_SUPABASE_URL', 'VITE_DESIGN_API_URL'] as const;

/** Tên máy chỉ có nghĩa trên chính máy đang build. */
function isMachineLocal(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** Danh sách vấn đề của bộ biến dùng cho bản phát hành; rỗng = dựng được. */
export function productionEnvProblems(env: Readonly<Record<string, string | undefined>>): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_BUILD_ENV) {
    if (!env[name]?.trim()) problems.push(`${name} rỗng.`);
  }

  for (const name of URL_ENV) {
    const value = env[name]?.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      problems.push(`${name}="${value}" không phải địa chỉ hợp lệ.`);
      continue;
    }
    if (isMachineLocal(url.hostname)) {
      problems.push(
        `${name}="${value}" trỏ về máy đang build, trình duyệt người dùng không tới được.`,
      );
    } else if (url.protocol !== 'https:') {
      problems.push(`${name}="${value}" phải là https.`);
    }
  }

  return problems;
}
