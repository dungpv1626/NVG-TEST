/**
 * Lớp chặn theo hạng dữ liệu và định tuyến mô hình ngôn ngữ.
 *
 * Đây là kiểm thử của một CHÍNH SÁCH DỮ LIỆU, không phải của một tính năng: nó khẳng định
 * rằng đầu bài của khách (hạng 1) không đi ra được dịch vụ chưa có cam kết bảo mật. Chạy
 * được ngay bây giờ dù chưa có khoá API — và đó là chủ ý, vì chính sách phải đứng vững
 * TRƯỚC khi có khoá.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DATA_CLASSES } from '@nvg/shared/design';
import {
  DataClassViolation,
  ModelNotConfigured,
  ModelRouter,
  parseModelConfig,
} from '../llm/router';

const CONFIG_PATH = fileURLToPath(new URL('../../../../config/models.yaml', import.meta.url));
const config = parseModelConfig(readFileSync(CONFIG_PATH, 'utf8'));

describe('config/models.yaml', () => {
  it('khai đủ các đầu ra mà tài liệu liệt kê', () => {
    expect(Object.keys(config.routes).sort()).toEqual([
      'ai_image_gemini',
      'ai_image_openai',
      'ai_text_anthropic',
      'ai_text_gemini',
      'ai_text_openai',
      'kb_label_normalize',
      'kb_rationale_embed',
      'layer1_brief',
      'layer2_program',
      'layer3_intent',
      'layer3_intent_hard',
      'layer4_facade',
      'layer5_render',
      'site_boundary_extract',
    ]);
  });

  /*
   * Gói Gemini miễn phí có thể được dùng để cải thiện sản phẩm (CLAUDE.md 5.1, quyết định
   * T8), nên demo chỉ chạy dữ liệu giả lập hoặc đã ẩn danh. Test này là hàng rào: nới
   * `max_data_class` trong cấu hình mà không có cam kết bằng văn bản của nhà cung cấp sẽ
   * làm đỏ ở đây.
   *
   * MỘT ngoại lệ, khai tên tường minh chứ không nới cả loạt: `site_boundary_extract` được
   * Haan xác nhận trực tiếp hạ xuống hạng 2 ngày 31/08/2026, CHỈ để tự thử bằng ảnh sổ đỏ
   * lấy trên mạng trong lúc chạy thử cục bộ. Trước 04/09/2026 test này đứng ở "mọi đầu ra
   * đều là 3" nên nó ĐỎ suốt từ hôm đó — một hàng rào đang đỏ thì không còn canh được gì,
   * vì người đọc quen mắt với màu đỏ sẵn có sẽ không nhận ra lần nới tiếp theo.
   *
   * Ngoại lệ này phải biến mất trước khi có ảnh thật của khách chạm vào route đó, hoặc
   * trước khi triển khai production — lúc đó xoá hẳn tên nó khỏi tập dưới đây.
   *
   * Từ 08/09/2026 (quyết định T12) có thêm nhóm thứ hai ở hạng 2, và nhóm này KHÔNG tạm: các
   * tuyến `ai_text_*`/`ai_image_*` gọi API TRẢ PHÍ của OpenAI, Google, Anthropic — cả ba cam kết
   * không huấn luyện trên dữ liệu gửi qua API. Chúng nhận đầu bài đã LƯỢC DANH TÍNH
   * (`brief/anonymise.ts`), và test dưới canh chúng không tụt xuống 1.
   */
  const TAM_THOI_HANG_2 = new Set(['site_boundary_extract']);
  const isAiRoute = (name: string) => /^ai_(text|image)_/.test(name);

  it('gói miễn phí chỉ nhận hạng 3 (trừ ngoại lệ tạm); tuyến AI trả phí nhận hạng 2, không thấp hơn', () => {
    for (const [name, route] of Object.entries(config.routes)) {
      const expected = isAiRoute(name) || TAM_THOI_HANG_2.has(name) ? 2 : 3;
      expect(route.max_data_class, `đầu ra ${name}`).toBe(expected);
    }
  });

  it('ngoại lệ tạm hạng 2 KHÔNG lan sang đầu ra thứ hai ngoài nhóm AI trả phí', () => {
    const hang2 = Object.entries(config.routes)
      .filter(([name, route]) => route.max_data_class !== 3 && !isAiRoute(name))
      .map(([name]) => name);
    expect(hang2).toEqual([...TAM_THOI_HANG_2]);
  });

  it('mỗi tuyến AI có nhãn cho ô chọn, và nhà cung cấp không suy được địa chỉ thì khai endpoint', () => {
    const ai = Object.entries(config.routes).filter(([name]) => isAiRoute(name));
    expect(ai.length).toBeGreaterThanOrEqual(5);
    for (const [name, route] of ai) {
      expect(route.label, `nhãn của ${name}`).toBeTruthy();
      if (!/^gemini/.test(route.provider)) expect(route.endpoint, name).toMatch(/^https:\/\//);
    }
    // Anthropic không sinh ảnh — không được có tuyến ảnh nào trỏ vào nó.
    for (const [name, route] of ai) {
      if (name.startsWith('ai_image_')) expect(route.provider, name).not.toBe('anthropic');
    }
  });

  it('tuyến AI hạng 2 KHÔNG dùng chung nhà cung cấp (tức khoá) với tuyến gói miễn phí hạng 3', () => {
    // Chính sách bám vào KHOÁ: Google dùng một API cho cả gói miễn phí lẫn trả phí, nên nếu hai
    // tuyến Gemini của nhánh AI khai `provider: gemini` thì đầu bài kích thước thật đi ra bằng
    // đúng khoá miễn phí mà T8 cấm (rà soát 08/09/2026).
    const freeProviders = new Set(
      Object.entries(config.routes)
        .filter(([name, route]) => !isAiRoute(name) && route.max_data_class === 3)
        .map(([, route]) => route.provider),
    );
    for (const [name, route] of Object.entries(config.routes)) {
      if (isAiRoute(name)) expect(freeProviders.has(route.provider), name).toBe(false);
    }
  });

  /*
   * Hai đầu ra đang tắt, và cả hai tắt vì CÙNG một lý do đo được: khoá gói miễn phí không có
   * hạn mức cho chúng. Bật lên thì mọi lần gọi đều ăn 429 — thay một lỗi đọc được bằng một
   * lỗi khó hiểu.
   *
   *   `layer3_intent_hard` — nhóm `pro`. Đo 29/08/2026: `gemini-pro-latest` trả 429,
   *   `gemini-2.5-pro` trả 404 "no longer available to new users".
   *
   * Nhóm SINH ẢNH của Gemini cũng không có hạn mức (đo 05 và 06/09/2026: `limit: 0`), nhưng
   * tuyến phối cảnh KHÔNG vì thế mà tắt — nó đã đổi sang nhà cung cấp khác, xem test dưới.
   *
   * Thêm tên thứ hai vào đây phải kèm một phép đo, không phải một phỏng đoán.
   */
  it('chỉ những đầu ra không có hạn mức trên gói miễn phí còn tắt, và tắt có lý do', () => {
    const off = Object.entries(config.routes)
      .filter(([, route]) => !route.enabled)
      .map(([name]) => name)
      .sort();
    expect(off).toEqual(['layer3_intent_hard']);
    expect(config.routes.layer3_intent_hard?.model).toMatch(/pro/);
  });

  /**
   * Tuyến phối cảnh: nhà cung cấp hết hạn mức thì ĐỔI NHÀ CUNG CẤP, không tắt tính năng.
   *
   * Đây là chỗ dễ quay về trạng thái cũ nhất: chỉ cần ai đó đổi `provider` về `gemini` cho
   * "gọn" là tính năng chết lặng — Gemini gói miễn phí trả `limit: 0` cho mọi mô hình sinh
   * ảnh, và người dùng chỉ thấy dòng "chưa dựng được ảnh".
   */
  it('tuyến phối cảnh bật, và nhà cung cấp nào cũng phải khai đủ thứ nó cần', () => {
    const route = config.routes.layer5_render;
    expect(route?.enabled).toBe(true);
    expect(route?.max_data_class).toBe(3); // ảnh khối là hạng 3 — KHÔNG được hạ xuống 2 hay 1.
    // Nhà cung cấp không suy được địa chỉ từ tên mô hình thì phải khai `endpoint`.
    if (route?.provider !== 'gemini') expect(route?.endpoint).toMatch(/^https:\/\//);
  });

  it('đầu ra nhúng khai số chiều, và số chiều đó đánh chỉ mục được', () => {
    // Chỉ mục vector của Postgres nhận tối đa 2000 chiều. Để mặc định 3072 thì cột vẫn lưu
    // được nhưng KHÔNG BAO GIỜ đánh chỉ mục được, và điều đó chỉ lộ ra vào ngày kho đủ lớn.
    const embed = config.routes.kb_rationale_embed;
    expect(embed?.output_dimensions).toBe(1536);
    expect(embed!.output_dimensions!).toBeLessThanOrEqual(2000);
  });

  it('từ chối cấu hình có hạng dữ liệu ngoài 1/2/3', () => {
    expect(() =>
      parseModelConfig(
        'version: "1.0.0"\nroutes:\n  x: { provider: a, model: b, max_data_class: 4, enabled: true }\n',
      ),
    ).toThrow(/max_data_class/);
  });
});

describe('Lớp chặn hạng dữ liệu', () => {
  const router = new ModelRouter(config, { gemini: 'khoa-gia-de-test' });

  it('chặn dữ liệu hạng 1 tới đầu ra gói miễn phí', () => {
    expect(() => router.resolve('layer1_brief', 1)).toThrow(DataClassViolation);
  });

  it('chặn cả hạng 2', () => {
    expect(() => router.resolve('layer3_intent', 2)).toThrow(DataClassViolation);
  });

  it('nói rõ phải làm gì, không chỉ báo bị chặn', () => {
    // Lỗi vượt quyền phải nêu ai/cách xử lý được, không dừng ở "không đủ quyền" (CGD 5.5).
    try {
      router.resolve('layer1_brief', 1);
    } catch (error) {
      expect((error as Error).message).toMatch(/ẩn danh/i);
      expect((error as DataClassViolation).retryable).toBe(false);
      return;
    }
    throw new Error('Lẽ ra phải bị chặn.');
  });

  it('không có đường vòng: mọi lối lấy cấu hình mô hình đều đi qua kiểm tra', () => {
    // `resolve` là hàm DUY NHẤT trả về cấu hình mô hình, và nó bắt buộc nhận `data_class`.
    // Nếu có ngày ai đó thêm một hàm "chỉ lấy tên mô hình", test này vẫn xanh — nên chốt
    // bằng chữ ký hàm: resolve nhận đúng hai tham số.
    expect(ModelRouter.prototype.resolve.length).toBe(2);
  });

  it('cho phép hạng 3 đi qua kiểm tra hạng dữ liệu', () => {
    expect(router.allows('layer1_brief', 3)).toBe(true);
    for (const dc of DATA_CLASSES) {
      expect(router.allows('layer1_brief', dc)).toBe(dc === 3);
    }
  });

  it('báo "chưa cấu hình" chứ không gọi ra mạng khi đầu ra đang tắt', () => {
    expect(() => router.resolve('layer3_intent_hard', 3)).toThrow(ModelNotConfigured);
  });

  it('trả khoá kèm cấu hình, chỉ qua đường đã kiểm hạng dữ liệu', () => {
    // Khoá đi CÙNG kết quả `resolve` thay vì để bên gọi giữ một bản sao riêng: có hai chỗ
    // giữ khoá là có một chỗ gọi được mô hình mà không đi qua lớp chặn.
    expect(router.resolve('layer1_brief', 3).apiKey).toBe('khoa-gia-de-test');
  });

  it('báo thiếu khoá API riêng biệt với chuyện bị chặn hạng dữ liệu', () => {
    const enabled = {
      ...config,
      routes: { probe: { provider: 'p', model: 'm', max_data_class: 3 as const, enabled: true } },
    };
    expect(() => new ModelRouter(enabled).resolve('probe', 3)).toThrow(/khoá API/);
    expect(new ModelRouter(enabled, { p: 'k' }).resolve('probe', 3).model).toBe('m');
  });

  it('đầu ra khai hạng 1 nhận được CẢ BA hạng — chốt chiều so sánh', () => {
    // Chiều này dễ cài ngược vì số nhỏ nghĩa là nhạy cảm hơn. Cài ngược thì lớp chặn vẫn
    // "hoạt động" và vẫn chặn được cái gì đó — chỉ là chặn nhầm chiều, tức cho dữ liệu nhạy
    // cảm nhất đi qua. Đây là test duy nhất phân biệt được hai cách cài.
    const trusted = {
      ...config,
      routes: { safe: { provider: 'p', model: 'm', max_data_class: 1 as const, enabled: true } },
    };
    const r = new ModelRouter(trusted, { p: 'k' });
    for (const dc of DATA_CLASSES) expect(r.allows('safe', dc)).toBe(true);
    expect(r.resolve('safe', 1).model).toBe('m');
  });

  it('báo lỗi rõ ràng khi bước không có trong cấu hình', () => {
    expect(() => router.resolve('layer9_khong_ton_tai', 3)).toThrow(ModelNotConfigured);
  });
});
