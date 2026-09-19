/**
 * Phân loại lỗi nhà cung cấp — bắt được ngày 11/09/2026 trên lời gọi thật.
 *
 * Nguyên văn hôm ấy: `429 {"error":{"code":429,"status":"RESOURCE_EXHAUSTED",
 * "message":"Your prepayment credits are depleted."}}`. Mã 429 nhưng KHÔNG phải «gọi quá
 * nhanh» — nó là hết tiền, và thử lại sau mười giây thì hết tiền y nguyên. Nhật ký cho thấy
 * hai dòng cách nhau đúng 11 giây: một cú bấm mua hai lần cùng một thất bại.
 */

import { describe, expect, it } from 'vitest';
import { classifyHttpFault, classifyNetworkFault, userFacing } from '../llm/provider-faults';

const vietnamese = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

describe('429 — hai chuyện khác nhau dưới cùng một mã', () => {
  it('hết tín dụng thì KHÔNG thử lại, dù mã là 429', () => {
    const body = JSON.stringify({
      error: {
        code: 429,
        message: 'Your prepayment credits are depleted. Please go to AI Studio.',
        status: 'RESOURCE_EXHAUSTED',
      },
    });
    expect(classifyHttpFault(429, body).retryable).toBe(false);
  });

  it('nhận ra cả câu của OpenAI và của Anthropic, không chỉ của Google', () => {
    // Ba nhà cung cấp, ba cách nói, cùng một chuyện. Khớp thiếu một câu là mua lại một thất bại.
    for (const body of [
      'You exceeded your current quota, please check your plan and billing details.',
      '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}',
      '{"error":{"code":"insufficient_quota"}}',
    ]) {
      expect(classifyHttpFault(429, body).retryable, body.slice(0, 40)).toBe(false);
    }
  });

  it('giới hạn tốc độ thật thì VẪN thử lại', () => {
    const body = JSON.stringify({ error: { message: 'Rate limit exceeded. Try again later.' } });
    expect(classifyHttpFault(429, body).retryable).toBe(true);
  });

  it('thân rỗng thì rơi về «giới hạn tốc độ» — hại ít hơn là coi lỗi tạm thời thành vĩnh viễn', () => {
    expect(classifyHttpFault(429, '').retryable).toBe(true);
  });
});

describe('Các mã còn lại', () => {
  it('5xx đáng thử lại, 4xx còn lại thì không', () => {
    expect(classifyHttpFault(503, '').retryable).toBe(true);
    expect(classifyHttpFault(529, '').retryable).toBe(true);
    expect(classifyHttpFault(400, '').retryable).toBe(false);
    expect(classifyHttpFault(404, '').retryable).toBe(false);
  });

  it('khoá bị từ chối thì không thử lại, và nói rõ ai xử lý được', () => {
    for (const status of [401, 403]) {
      const fault = classifyHttpFault(status, '');
      expect(fault.retryable).toBe(false);
      expect(fault.userMessage).toMatch(/Quản trị hệ thống/);
    }
  });
});

describe('Câu đưa lên màn hình', () => {
  it('mọi câu đều là TIẾNG VIỆT, không mã HTTP, không JSON', () => {
    // CLAUDE.md 4.1: giao diện 100% tiếng Việt. CGD 4.4: không hiện mã HTTP hay vết ngăn xếp.
    // Nhân sự NVG có người không đọc được tiếng Anh, và câu này hiện đúng lúc họ bị chặn.
    for (const status of [400, 401, 403, 429, 500]) {
      const message = classifyHttpFault(status, 'Your prepayment credits are depleted').userMessage;
      expect(vietnamese.test(message), message).toBe(true);
      expect(message).not.toMatch(/\d{3}/);
      expect(message).not.toMatch(/[{}]/);
    }
  });

  it('mỗi câu nói ra VIỆC GÌ không làm được và CẦN LÀM GÌ', () => {
    const fault = classifyHttpFault(429, 'prepayment credits are depleted');
    expect(fault.userMessage).toMatch(/^Không chạy được bước này:/);
    expect(fault.userMessage).toMatch(/Nạp thêm/);
  });

  it('userFacing ưu tiên câu cho người dùng, và rơi về message khi không có', () => {
    expect(userFacing({ userMessage: 'Câu cho người đọc.', message: 'raw 429 {json}' })).toBe(
      'Câu cho người đọc.',
    );
    expect(userFacing(new Error('Câu tự dựng, đã là tiếng Việt.'))).toBe(
      'Câu tự dựng, đã là tiếng Việt.',
    );
    expect(userFacing(undefined)).toBe('Lỗi không rõ.');
    // Chuỗi rỗng KHÔNG được coi là câu hợp lệ — nếu không màn hình hiện một dòng trống.
    expect(userFacing({ userMessage: '', message: 'còn câu này' })).toBe('còn câu này');
  });
});

/**
 * Lượt chạy nền ĐỨNG HÌNH — gặp thật ngày 11/09/2026.
 *
 * Worker nạp lại (hot reload lúc dev) đúng lúc một lượt đang bay: isolate bị xoá, dòng tiến độ
 * còn nguyên, instance Workflow vẫn khai `running`. Cả hạn 10 phút của bước lẫn bộ đếm 180 giây
 * của lời gọi đều không nổ, vì không còn bộ đếm nào tồn tại.
 *
 * Hậu quả nặng hơn cái vòng quay vô hạn trên màn hình: `activeRun` thấy dòng ấy nên lượt chạy
 * mới bị trả 409, và người dùng bị KHOÁ không chạy lại được.
 */
describe('Nhận ra lượt chạy đứng hình', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('vừa cập nhật thì KHÔNG phải đứng hình', async () => {
    const { runStalled } = await import('../ai/runs');
    expect(runStalled(iso(30_000))).toBe(false);
  });

  it('một bước gọi mô hình chạy hết cỡ vẫn CHƯA bị coi là đứng hình', async () => {
    // Đây là chỗ dễ sai nhất: `updated_at` chỉ nhúc nhích ở ranh giới các bước, nên nó đứng yên
    // suốt thời gian một bước chạy. Hạn bước là 10 phút, cộng một lượt thử lại sau 10 giây,
    // cộng 10 phút nữa — gần 21 phút mà không có gì sai. Bắt nhầm ở đây là huỷ một lượt ĐÃ
    // TRẢ TIỀN.
    const { runStalled, RUN_STALE_MS } = await import('../ai/runs');
    expect(RUN_STALE_MS).toBeGreaterThanOrEqual(20 * 60_000);
    expect(runStalled(iso(RUN_STALE_MS - 60_000))).toBe(false);
    expect(runStalled(iso(RUN_STALE_MS + 60_000))).toBe(true);
  });

  it('chưa có mốc cập nhật thì KHÔNG kết luận là đứng hình', async () => {
    // Thiếu số đo không phải bằng chứng. Đoán bừa ở đây là huỷ một lượt đang khoẻ.
    const { runStalled } = await import('../ai/runs');
    expect(runStalled(null)).toBe(false);
    expect(runStalled('không phải ngày giờ')).toBe(false);
  });
});

describe('lỗi tầng mạng — hết giờ phía ta KHÁC rớt kết nối', () => {
  // Hai lỗi này trước 12/09/2026 cùng đi qua một dòng `true` cứng, và đó là chỗ mua hai lần một
  // lượt gọi. Lượt `adbc2867`: huỷ ở giây 180, chờ 10 giây, huỷ lại ở giây 181.
  it('HẾT GIỜ thì không thử lại — thử lại cũng hết giờ y như vậy, mà vẫn bị tính tiền', () => {
    // `AbortSignal.timeout` ném đúng thứ này ở runtime Workers: một DOMException, KHÔNG phải Error.
    const fault = classifyNetworkFault(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
      'mô hình ngôn ngữ',
    );
    expect(fault.retryable).toBe(false);
    expect(fault.userMessage).toMatch(vietnamese);
  });

  it('đọc `name` theo THUỘC TÍNH, nên vật đã qua serialise vẫn phân loại đúng', () => {
    // Giá trị lỗi đi qua `Promise.allSettled` của Workflow hoặc một bước `step.do` đã lưu lại thì
    // còn `name` nhưng không còn là Error. Kiểm bằng `instanceof` thì đúng lúc ấy nó thành «thử lại».
    expect(classifyNetworkFault({ name: 'TimeoutError' }, 'mô hình ngôn ngữ').retryable).toBe(
      false,
    );
  });

  it('bị DỪNG giữa đường thì không thử lại — thử lại là làm trái ý người dừng', () => {
    expect(classifyNetworkFault(new DOMException('aborted', 'AbortError'), 'x').retryable).toBe(
      false,
    );
  });

  it('RỚT KẾT NỐI thì vẫn thử lại một lượt — lời gọi có thể chưa tới được model', () => {
    const fault = classifyNetworkFault(new TypeError('fetch failed'), 'mô hình ngôn ngữ');
    expect(fault.retryable).toBe(true);
    expect(fault.userMessage).toMatch(vietnamese);
  });

  it('câu cho người dùng không mang nguyên văn tiếng Anh của runtime', () => {
    const raw = 'The operation was aborted due to timeout';
    const fault = classifyNetworkFault(new DOMException(raw, 'TimeoutError'), 'mô hình ngôn ngữ');
    // CGD 4.4: màn hình không hiện mã HTTP hay vết ngăn xếp. Nguyên văn vẫn vào `message` của lỗi
    // và vào `design_ai_call`, không vào câu này.
    expect(fault.userMessage).not.toContain(raw);
    expect(fault.userMessage).toMatch(/Quản trị hệ thống/);
  });
});
