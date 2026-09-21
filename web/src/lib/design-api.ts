/**
 * Gọi API của Module Thiết kế AI (Worker `nvg-api`, tiền tố `/design`).
 *
 * ⚠️ Đây là lớp gọi Worker ĐẦU TIÊN của `web/`. Mười hai module còn lại gọi thẳng Supabase và
 * đó vẫn là mặc định đúng (CLAUDE.md 3.1) — chỉ dùng lớp này khi thao tác thoả một trong ba
 * điều kiện của quy tắc đó. Việc chú giải hồ sơ thoả điều kiện (a): nó gọi mô hình nhúng bên
 * ngoài, thứ mà trình duyệt không được cầm khoá.
 *
 * Phần đọc danh sách và chi tiết bản ghi vẫn gọi thẳng Supabase — đừng thêm endpoint ở đây
 * cho việc RLS đã đủ sức làm.
 */

import { noteContractsHeader, VERSION_SKEW_MESSAGE } from './design-version';
import { supabase } from './supabase';

/**
 * Địa chỉ Worker. Rỗng nghĩa là chưa cấu hình — trả câu tiếng Việt đọc được thay vì để
 * `fetch` ném ra một lỗi mạng khó hiểu ở giữa màn hình.
 */
const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

export class DesignApiError extends Error {
  /**
   * Mã HTTP của phản hồi, khi có một phản hồi.
   *
   * Rỗng nghĩa là chưa tới được máy chủ (chưa đăng nhập, chưa cấu hình địa chỉ, `fetch` ném).
   * Có mã để chỗ gọi phân biệt được «chưa có» (404) với «có mà không lấy ra được» (502) — hai
   * thứ mà một câu lỗi chung gộp lại thành một, và ở tuyến tờ ảnh thì gộp nhầm khiến người dùng
   * trả tiền vẽ lại một tấm đã có.
   */
  readonly status?: number;

  /**
   * Danh sách mục hỏng do Worker trả kèm, đã viết bằng tiếng Việt.
   *
   * Bản trước VỨT BỎ danh sách này: màn hình chỉ còn câu tổng «Phiếu yêu cầu chưa đúng. Kiểm tra
   * lại các ô đã điền», trong khi phiếu có mười bốn mục. Xảy ra thật ngày 20/09/2026 và không có
   * cách nào đoán ra từ màn hình. Worker chỉ đưa câu tiếng Việt vào đây — chữ của thư viện kiểm
   * kiểu (tiếng Anh, nói theo ngôn ngữ kiểu dữ liệu) được đổi ở phía Worker, không lên đây.
   */
  readonly issues?: readonly string[];

  constructor(message: string, status?: number, issues?: readonly string[]) {
    super(message);
    this.status = status;
    if (issues?.length) this.issues = issues;
  }
}

/**
 * `fetch` ném ra khi KHÔNG chạm tới được dịch vụ — chưa chạy, đổ, hoặc bị chặn giữa đường.
 *
 * Bản trước bảo người dùng "kiểm tra đường truyền": sai hướng, và tốn thời gian thật. Máy
 * vẫn vào mạng bình thường (mọi tab khác của module gọi thẳng Supabase nên vẫn chạy) — thứ
 * không phản hồi là dịch vụ thiết kế, và kiến trúc sư không có cách nào khởi động lại nó.
 * Nên câu này nói đúng cái hỏng và nêu AI xử lý được (CGD 5.5), chỉ giữ lại "thử lại" cho
 * trường hợp trục trặc thoáng qua.
 */
const UNREACHABLE_MESSAGE =
  'Dịch vụ thiết kế đang không phản hồi. Các phần khác của hồ sơ vẫn dùng được bình thường. ' +
  'Thử lại sau ít phút; nếu vẫn vậy, báo Quản trị hệ thống — chỉ bên đó khởi động lại được dịch vụ.';

/**
 * Bỏ `body` để gọi GET. Phân biệt bằng chính sự có mặt của dữ liệu gửi đi thay vì thêm một
 * tham số `method`: mọi endpoint của module này hoặc là đọc (không gửi gì), hoặc là ghi (gửi
 * một đối tượng) — nên một tham số thứ hai chỉ tạo chỗ cho việc khai sai.
 */
export async function designApi<T>(path: string, body?: unknown): Promise<T> {
  if (!BASE) {
    throw new DesignApiError(
      'Chưa cấu hình địa chỉ dịch vụ thiết kế. Quản trị hệ thống bổ sung biến VITE_DESIGN_API_URL rồi phát hành lại ứng dụng.',
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DesignApiError('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');

  let response: Response;
  try {
    response = await fetch(
      `${BASE}${path}`,
      body === undefined
        ? { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          },
    );
  } catch {
    throw new DesignApiError(UNREACHABLE_MESSAGE);
  }

  return parseResponse<T>(response);
}

/**
 * Tải một tệp nhị phân lên — bước đọc ảnh trích lục/sổ đỏ là lời gọi ĐẦU TIÊN của `web/` gửi
 * `multipart/form-data` thay vì JSON, nên tách khỏi `designApi` thay vì thêm tham số thứ ba
 * cho một hàm vốn chỉ có hai hình dạng "đọc" và "ghi JSON".
 *
 * KHÔNG tự đặt `Content-Type`: trình duyệt phải tự sinh giá trị kèm `boundary` của chính
 * `FormData`, đặt tay sẽ làm mất `boundary` và Worker không tách được từng phần.
 */
export async function designApiUpload<T>(path: string, form: FormData): Promise<T> {
  if (!BASE) {
    throw new DesignApiError(
      'Chưa cấu hình địa chỉ dịch vụ thiết kế. Quản trị hệ thống bổ sung biến VITE_DESIGN_API_URL rồi phát hành lại ứng dụng.',
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DesignApiError('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new DesignApiError(UNREACHABLE_MESSAGE);
  }

  return parseResponse<T>(response);
}

/** Câu chung khi Worker không kèm lời giải thích nào. */
const GENERIC_FAILURE = 'Không thực hiện được thao tác. Thử lại sau ít phút.';

/**
 * Ghi nhận dấu vân tay hợp đồng ở phản hồi; trả về việc nó có lệch với bản giao diện không.
 *
 * Header phải nằm trong `exposeHeaders` của CORS phía Worker; thiếu khai thì `get` trả `null`
 * mà không có lỗi nào (`cors-expose.test.ts` canh phía kia).
 */
function contractsSkewed(response: Response): boolean {
  return noteContractsHeader(response.headers.get('X-NVG-Contracts'));
}

async function parseResponse<T>(response: Response): Promise<T> {
  const skewed = contractsSkewed(response);
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    issues?: string[];
  };
  if (!response.ok) {
    // Không hiện mã HTTP cho người dùng (CGD 5.5) — Worker đã trả sẵn câu tiếng Việt. Mã vẫn đi
    // theo lỗi để mã nguồn phân biệt được các loại hỏng; nó không lên màn hình.
    //
    // Khi hai bên lệch phiên bản thì câu của Worker nói đúng chỗ hỏng nhưng sai NGUYÊN NHÂN:
    // «dữ liệu không đúng hợp đồng» dẫn người đọc đi sửa dữ liệu, trong khi dữ liệu không sai.
    // Ở đây biết thêm một điều Worker không biết — bản giao diện đang chạy — nên nói ra được.
    throw new DesignApiError(
      skewed ? VERSION_SKEW_MESSAGE : (payload.error ?? GENERIC_FAILURE),
      response.status,
      payload.issues,
    );
  }
  return payload as T;
}

/**
 * Đọc một tuyến trả TỆP (SVG, DXF) thay vì JSON. Lỗi vẫn là JSON tiếng Việt do Worker trả.
 */
export async function designApiFile(
  path: string,
  /**
   * Bỏ qua bộ đệm HTTP của trình duyệt.
   *
   * Dùng cho tuyến mà phản hồi là ĐẦU VÀO của một lượt gọi tính tiền — ảnh neo của tờ mặt bằng
   * (T57). Tuyến ấy khai `max-age=300` vì nó tất định và người xem tải lại nhiều lần; nhưng một
   * bản chụp tới năm phút trước lại là thứ khác hẳn khi nó đi thẳng ra nhà cung cấp: mã bộ vẽ và
   * `kb/sheet_style.yaml` đều đổi được mà không nằm trong địa chỉ, nên bản cũ có thể là bản đã sửa
   * lỗi rồi. Một lượt tải vài chục ki-lô-byte, chỉ xảy ra khi người dùng bấm, đổi lấy việc chắc
   * chắn trả tiền cho đúng tờ đang có.
   */
  fresh = false,
): Promise<Response> {
  if (!BASE) {
    throw new DesignApiError(
      'Chưa cấu hình địa chỉ dịch vụ thiết kế. Quản trị hệ thống bổ sung biến VITE_DESIGN_API_URL rồi phát hành lại ứng dụng.',
    );
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DesignApiError('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      ...(fresh ? { cache: 'reload' as const } : {}),
    });
  } catch {
    throw new DesignApiError(UNREACHABLE_MESSAGE);
  }
  const skewed = contractsSkewed(response);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new DesignApiError(
      skewed ? VERSION_SKEW_MESSAGE : (payload.error ?? GENERIC_FAILURE),
      response.status,
    );
  }
  return response;
}
