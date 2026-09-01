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
      'kb_label_normalize',
      'kb_rationale_embed',
      'layer1_brief',
      'layer2_program',
      'layer3_intent',
      'layer3_intent_hard',
      'layer4_facade',
      'site_boundary_extract',
    ]);
  });

  it('giai đoạn demo: MỌI đầu ra chỉ nhận hạng 3', () => {
    // Gói Gemini miễn phí có thể được dùng để cải thiện sản phẩm (CLAUDE.md 5.1, T8), nên
    // demo chỉ chạy dữ liệu giả lập hoặc đã ẩn danh. Test này là hàng rào: nới `max_data_class`
    // trong cấu hình mà không có cam kết bằng văn bản của nhà cung cấp sẽ làm đỏ ở đây.
    for (const route of Object.values(config.routes)) {
      expect(route.max_data_class).toBe(3);
    }
  });

  it('chỉ đầu ra nhóm `pro` còn tắt, và tắt có lý do', () => {
    // Khoá gói miễn phí không có hạn mức cho nhóm `pro` (đo 29/08/2026: `gemini-pro-latest`
    // trả 429, `gemini-2.5-pro` trả 404 "no longer available to new users"). Bật nó lên thì
    // mọi lần dự phòng đều ăn 429 — thay một lỗi đọc được bằng một lỗi khó hiểu.
    const off = Object.entries(config.routes)
      .filter(([, route]) => !route.enabled)
      .map(([name]) => name);
    expect(off).toEqual(['layer3_intent_hard']);
    expect(config.routes.layer3_intent_hard?.model).toMatch(/pro/);
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
  const router = new ModelRouter(config, 'khoa-gia-de-test');

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
    expect(new ModelRouter(enabled, 'k').resolve('probe', 3).model).toBe('m');
  });

  it('đầu ra khai hạng 1 nhận được CẢ BA hạng — chốt chiều so sánh', () => {
    // Chiều này dễ cài ngược vì số nhỏ nghĩa là nhạy cảm hơn. Cài ngược thì lớp chặn vẫn
    // "hoạt động" và vẫn chặn được cái gì đó — chỉ là chặn nhầm chiều, tức cho dữ liệu nhạy
    // cảm nhất đi qua. Đây là test duy nhất phân biệt được hai cách cài.
    const trusted = {
      ...config,
      routes: { safe: { provider: 'p', model: 'm', max_data_class: 1 as const, enabled: true } },
    };
    const r = new ModelRouter(trusted, 'k');
    for (const dc of DATA_CLASSES) expect(r.allows('safe', dc)).toBe(true);
    expect(r.resolve('safe', 1).model).toBe('m');
  });

  it('báo lỗi rõ ràng khi bước không có trong cấu hình', () => {
    expect(() => router.resolve('layer9_khong_ton_tai', 3)).toThrow(ModelNotConfigured);
  });
});
