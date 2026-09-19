/**
 * Phân loại lỗi HTTP của nhà cung cấp mô hình — dùng chung cho Gemini, OpenAI và Anthropic.
 *
 * ── Vì sao tách ra một tệp ─────────────────────────────────────────────────────────────
 * Ba client đang chép lại cùng một dòng `status === 429 || status >= 500`, và dòng ấy SAI ở
 * đúng một chỗ tốn tiền. Đo ngày 11/09/2026 trên lời gọi thật:
 *
 *     429 { "error": { "code": 429, "status": "RESOURCE_EXHAUSTED",
 *           "message": "Your prepayment credits are depleted." } }
 *
 * 429 ở đây KHÔNG phải «gọi quá nhanh, chờ rồi thử lại» — nó là **hết tiền**. Thử lại sau mười
 * giây thì hết tiền y nguyên. Workflow có một lượt thử lại, nên một cú bấm mua hai lần cùng một
 * thất bại; đo được hai dòng cách nhau đúng 11 giây trong `design_ai_call`. Lần ấy miễn phí vì
 * lời gọi bị chặn trước khi tới model, nhưng cùng đường mã ấy áp cho mọi lỗi 429 khác.
 *
 * Cả ba nhà cung cấp đều trộn hai chuyện vào cùng mã 429, và thứ phân biệt chúng nằm trong
 * THÂN phản hồi: Google nói «prepayment credits are depleted», OpenAI nói «exceeded your current
 * quota … check your plan and billing details», Anthropic nói «credit balance is too low».
 *
 * ── Vì sao có `userMessage` ───────────────────────────────────────────────────────────
 * Câu nguyên văn của nhà cung cấp là tiếng Anh, mang mã HTTP và một khối JSON. Nó phải vào
 * NHẬT KÝ, không được lên màn hình: CLAUDE.md 4.1 đòi giao diện 100% tiếng Việt, và CGD 4.4
 * cấm hiện mã HTTP hay vết ngăn xếp cho người dùng, đồng thời buộc lỗi vượt quyền phải nói rõ
 * AI xử lý được. Nhân sự NVG có người không đọc được tiếng Anh, và câu này hiện lên đúng lúc
 * họ đang bị chặn thao tác.
 */

export interface ProviderFault {
  /** Thử lại có cơ may đổi kết quả không. `false` thì Workflow không được mua lượt thứ hai. */
  retryable: boolean;
  /** Câu tiếng Việt cho người dùng: việc gì không làm được, vì sao, và ai xử lý được. */
  userMessage: string;
}

/**
 * Dấu hiệu HẾT TIỀN trong thân phản hồi.
 *
 * Khớp theo thân chứ không theo mã trạng thái, vì mã trạng thái không phân biệt được. Danh sách
 * lấy từ câu thật của ba nhà cung cấp; khớp thiếu thì rơi về «giới hạn tốc độ» — tức là thử lại
 * một lần rồi thôi, hại ít hơn là coi một lỗi tạm thời thành vĩnh viễn.
 */
const BILLING_HINTS = [
  'credit',
  'prepay',
  'depleted',
  'billing',
  'balance',
  'insufficient_quota',
  'exceeded your current quota',
];

function looksLikeBilling(body: string): boolean {
  const lower = body.toLowerCase();
  return BILLING_HINTS.some((hint) => lower.includes(hint));
}

export function classifyHttpFault(status: number, body: string): ProviderFault {
  if (status === 429 && looksLikeBilling(body)) {
    return {
      retryable: false,
      userMessage:
        'Không chạy được bước này: tài khoản tại nhà cung cấp mô hình đã hết tín dụng. ' +
        'Nạp thêm trên trang thanh toán của nhà cung cấp rồi chạy lại — Quản trị hệ thống xử lý được việc này. ' +
        'Thử lại ngay bây giờ không đổi được kết quả.',
    };
  }
  if (status === 429) {
    return {
      retryable: true,
      userMessage:
        'Không chạy được bước này: nhà cung cấp mô hình đang giới hạn số lượt gọi. Thử lại sau ít phút.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      retryable: false,
      userMessage:
        'Không chạy được bước này: khoá API của nhà cung cấp mô hình bị từ chối. ' +
        'Quản trị hệ thống kiểm tra lại khoá.',
    };
  }
  if (status >= 500) {
    return {
      retryable: true,
      userMessage:
        'Không chạy được bước này: dịch vụ của nhà cung cấp mô hình đang lỗi. Thử lại sau ít phút.',
    };
  }
  return {
    retryable: false,
    userMessage:
      'Không chạy được bước này: yêu cầu gửi tới nhà cung cấp mô hình không hợp lệ. ' +
      'Báo Quản trị hệ thống — thử lại cũng cho cùng kết quả.',
  };
}

/**
 * Phân loại lỗi ở TẦNG MẠNG — tức nhánh `catch` quanh chính `fetch`, chưa có phản hồi nào.
 *
 * Trước 12/09/2026 cả bốn client truyền `true` CỨNG ở đây, và đó là chỗ tốn tiền thật. Đo trên
 * lượt chạy `adbc2867` (11/09/2026, hỏng sau 6 phút 11 giây):
 *
 *     00:19:26 bắt đầu → 00:22:26 huỷ (đúng 180 giây) → +10 giây thử lại → 00:25:37 huỷ (181 giây)
 *
 * Hai lần huỷ là hai lần mô hình đã SINH xong phần lớn câu trả lời. OpenAI tính tiền token nó
 * sinh ra, không tính theo việc ta có đọc được thân phản hồi hay không — nên lượt thử lại ấy
 * **mua lần thứ hai đúng cái vừa trả tiền**, rồi hỏng y như lần đầu vì đồng hồ của ta vẫn là
 * 180 giây.
 *
 * Phân biệt hai chuyện mà mã cũ gộp làm một:
 *   · **Hết giờ phía TA** (`TimeoutError` do `AbortSignal.timeout`) — thử lại chắc chắn hỏng lại
 *     theo đúng cách, vì ngân sách thời gian không đổi. KHÔNG thử lại.
 *   · **Rớt kết nối** (DNS, TLS, socket đóng giữa đường) — lời gọi có thể chưa tới được model,
 *     và thử lại thường qua. Thử lại một lượt.
 *
 * `AbortError` cũng xếp vào nhóm không thử lại: nó nghĩa là có người/có mã chủ động dừng, và
 * thử lại là làm trái ý đó.
 */
export function classifyNetworkFault(
  error: unknown,
  what: string,
  /**
   * Nhà cung cấp có tính tiền phần đã sinh khi ta huỷ giữa đường không.
   *
   * Mặc định `true` — an toàn cho mọi tuyến TRẢ PHÍ. Đặt `false` cho dịch vụ miễn phí
   * (Pollinations): ở đó lý lẽ «đừng mua hai lần» không tồn tại, còn hàng đợi miễn phí thì hay
   * tắc tạm thời, nên thử lại một lượt là việc đúng và không tốn gì. Đây là chỗ dễ làm quá rộng:
   * quy tắc không-thử-lại sinh ra từ chuyện TIỀN, không từ chuyện thời gian.
   */
  timeoutIsBilled = true,
): ProviderFault {
  // Đọc `name` theo thuộc tính: `AbortSignal.timeout` ném `DOMException`, không phải `Error`,
  // và ở runtime Workers nó không nhất thiết qua được `instanceof Error`.
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  if (name === 'TimeoutError') {
    if (!timeoutIsBilled) {
      return {
        retryable: true,
        userMessage: `Không chạy được bước này: ${what} không trả lời kịp hạn chờ. Thử lại sau ít phút.`,
      };
    }
    return {
      retryable: false,
      userMessage:
        `Không chạy được bước này: ${what} không trả lời kịp hạn chờ. ` +
        'Thử lại ngay cũng hết giờ y như vậy, và nhà cung cấp vẫn tính tiền phần đã sinh. ' +
        'Báo Quản trị hệ thống để nâng hạn chờ hoặc chọn model nhanh hơn.',
    };
  }
  if (name === 'AbortError') {
    return {
      retryable: false,
      userMessage: `Không chạy được bước này: lượt gọi ${what} đã bị dừng giữa đường.`,
    };
  }
  return {
    retryable: true,
    userMessage: `Không chạy được bước này: không kết nối được tới ${what}. Thử lại sau ít phút.`,
  };
}

/**
 * Câu ĐƯA LÊN MÀN HÌNH cho một lỗi bất kỳ.
 *
 * Có `userMessage` thì dùng nó; không thì dùng `message`, vốn đã là câu tiếng Việt ở mọi chỗ
 * mã nguồn tự dựng lỗi. Chỉ những lỗi mang nguyên văn phản hồi nhà cung cấp mới cần lớp này.
 */
export function userFacing(error: unknown): string {
  // Đọc theo THUỘC TÍNH, không theo `instanceof Error`. Giá trị đi qua đây có thể đã vượt một
  // ranh giới serialise — `Promise.allSettled` trong Workflow, một bước `step.do` đã lưu lại —
  // và lúc ấy nó còn nguyên `message` nhưng không còn là `Error`. Kiểm bằng `instanceof` thì
  // đúng lúc đó câu lỗi biến thành «Lỗi không rõ.» và người đọc mất luôn manh mối.
  for (const key of ['userMessage', 'message'] as const) {
    if (error && typeof error === 'object' && key in error) {
      const text = (error as Record<string, unknown>)[key];
      if (typeof text === 'string' && text.trim()) return text;
    }
  }
  return 'Lỗi không rõ.';
}
