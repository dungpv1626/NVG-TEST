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
      'ai_image_gemini_fast',
      'ai_image_gemini_pro',
      'ai_image_openai',
      'ai_image_openai_fast',
      'ai_image_openai_precise',
      'ai_text_anthropic',
      'ai_text_anthropic_fast',
      'ai_text_gemini',
      'ai_text_gemini_fast',
      'ai_text_openai',
      'ai_text_openai_deep',
      'ai_text_openai_fast',
      'ai_text_openai_top',
      'kb_label_normalize',
      'kb_rationale_embed',
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
   *
   * Từ 20/09/2026 KHÔNG tuyến `ai_*` nào chạy khoá miễn phí nữa (`ai_text_gemini_free` đã gỡ theo
   * yêu cầu của Haan). Hàng rào `isPaidAiRoute` dưới đây GIỮ NGUYÊN: nó canh cho lần sau, khi có
   * người thêm lại một tuyến khoá miễn phí và quên đặt nó ở hạng 3.
   */
  const TAM_THOI_HANG_2 = new Set(['site_boundary_extract']);
  const isAiRoute = (name: string) => /^ai_(text|image)_/.test(name);
  /**
   * Nhà cung cấp gói miễn phí — đọc từ CHÍNH cấu hình (`billing.free_providers`), không chép.
   * Từ 13/09/2026 ô chọn model có một tuyến `ai_text_*` chạy khoá miễn phí cho bước chỉ gửi
   * bản tóm tắt đã ẩn danh; tuyến ấy phải đứng ở hạng 3, không bao giờ hạng 2.
   */
  const FREE = new Set(config.billing?.free_providers ?? []);
  const isPaidAiRoute = (name: string) =>
    isAiRoute(name) && !FREE.has(config.routes[name]!.provider);

  it('có danh sách nhà cung cấp miễn phí, và khoá miễn phí của Gemini nằm trong đó', () => {
    expect(FREE.has('gemini')).toBe(true);
    expect(FREE.has('gemini_paid')).toBe(false);
  });

  it('gói miễn phí chỉ nhận hạng 3 (trừ ngoại lệ tạm); tuyến AI trả phí nhận hạng 2, không thấp hơn', () => {
    for (const [name, route] of Object.entries(config.routes)) {
      const expected = isPaidAiRoute(name) || TAM_THOI_HANG_2.has(name) ? 2 : 3;
      expect(route.max_data_class, `đầu ra ${name}`).toBe(expected);
    }
  });

  it('ngoại lệ tạm hạng 2 KHÔNG lan sang đầu ra thứ hai ngoài nhóm AI trả phí', () => {
    const hang2 = Object.entries(config.routes)
      .filter(([name, route]) => route.max_data_class !== 3 && !isPaidAiRoute(name))
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
      if (isAiRoute(name) && route.max_data_class === 2) {
        expect(freeProviders.has(route.provider), name).toBe(false);
        expect(FREE.has(route.provider), name).toBe(false);
      }
    }
  });

  it('mọi tuyến của nhánh AI có nhãn riêng — ô chọn không được hiện hai dòng giống nhau', () => {
    // Nhãn là thứ DUY NHẤT phân biệt hai bậc của cùng một nhà cung cấp trên ô chọn. Thiếu nhãn
    // thì router lấy tạm tên model (`label ?? model`) — vẫn chạy, nhưng người dùng đọc thấy
    // `gpt-5-mini` giữa các dòng tiếng Việt. Trùng nhãn thì tệ hơn: hai dòng y hệt, chọn dòng nào
    // cũng không biết mình vừa chọn gì.
    const labels = Object.entries(config.routes)
      .filter(([name]) => isAiRoute(name))
      .map(([name, route]) => {
        expect(route.label, name).toBeTruthy();
        return route.label;
      });
    expect(new Set(labels).size).toBe(labels.length);
  });

  /*
   * Đầu ra duy nhất từng tắt (`layer3_intent_hard`, nhóm `pro` không có hạn mức trên gói miễn phí)
   * đã gỡ cùng bộ giải (T58). Tắt một tuyến mới phải kèm một phép đo, không phải một phỏng đoán —
   * khi đó ghi tên nó vào đây cùng lý do.
   */
  it('không đầu ra nào tắt mà không có lý do ghi ở đây', () => {
    const off = Object.entries(config.routes)
      .filter(([, route]) => !route.enabled)
      .map(([name]) => name)
      .sort();
    expect(off).toEqual([]);
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
    expect(() => router.resolve('kb_label_normalize', 1)).toThrow(DataClassViolation);
  });

  it('chặn cả hạng 2', () => {
    expect(() => router.resolve('kb_rationale_embed', 2)).toThrow(DataClassViolation);
  });

  it('nói rõ phải làm gì, không chỉ báo bị chặn', () => {
    // Lỗi vượt quyền phải nêu ai/cách xử lý được, không dừng ở "không đủ quyền" (CGD 5.5).
    try {
      router.resolve('kb_label_normalize', 1);
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
    expect(router.allows('kb_label_normalize', 3)).toBe(true);
    for (const dc of DATA_CLASSES) {
      expect(router.allows('kb_label_normalize', dc)).toBe(dc === 3);
    }
  });

  it('báo "chưa cấu hình" chứ không gọi ra mạng khi đầu ra đang tắt', () => {
    const off = {
      ...config,
      routes: {
        tat: { provider: 'gemini', model: 'm', max_data_class: 3 as const, enabled: false },
      },
    };
    expect(() => new ModelRouter(off, { gemini: 'k' }).resolve('tat', 3)).toThrow(
      ModelNotConfigured,
    );
  });

  it('trả khoá kèm cấu hình, chỉ qua đường đã kiểm hạng dữ liệu', () => {
    // Khoá đi CÙNG kết quả `resolve` thay vì để bên gọi giữ một bản sao riêng: có hai chỗ
    // giữ khoá là có một chỗ gọi được mô hình mà không đi qua lớp chặn.
    expect(router.resolve('kb_label_normalize', 3).apiKey).toBe('khoa-gia-de-test');
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
