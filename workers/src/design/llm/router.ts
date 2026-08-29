/**
 * Định tuyến mô hình ngôn ngữ + LỚP CHẶN theo hạng dữ liệu.
 *
 * Nguồn: doc/design/05-tech-stack.md mục 5.6, doc/design/01-overview.md mục 1.5.
 *
 * Hai việc, cố ý gộp vào một chỗ:
 *
 *  1. Tên mô hình đọc từ `config/models.yaml`, KHÔNG BAO GIỜ là hằng số trong mã nguồn.
 *  2. Mỗi lời gọi ra ngoài phải khai `data_class`. Lời gọi mang hạng dữ liệu nhạy cảm hơn
 *     mức đầu ra cho phép bị chặn TRƯỚC khi ra mạng.
 *
 * Vì sao gộp: tài liệu nói thẳng "đừng để việc này phụ thuộc trí nhớ người viết code". Nếu
 * lớp chặn là một hàm riêng phải nhớ gọi thì sẽ có ngày quên. Ở đây KHÔNG CÓ đường lấy được
 * cấu hình mô hình mà không đi qua kiểm tra hạng dữ liệu — muốn gọi mô hình thì phải khai.
 */

import { load as parseYaml } from 'js-yaml';
import type { DataClass } from '@nvg/shared/design';

export interface ModelRoute {
  provider: string;
  model: string;
  /**
   * Hạng dữ liệu NHẠY CẢM NHẤT mà đầu ra này được phép nhận.
   *
   * ⚠️ Số nhỏ = nhạy cảm hơn (1 nhạy cảm, 3 thấp), nên "max" ở đây là **cận dưới** của con
   * số: đầu ra khai `1` nhận được cả 1, 2, 3; đầu ra khai `3` chỉ nhận hạng 3. Tên trường
   * lấy nguyên từ tài liệu đặc tả (05-tech-stack 5.6) để không sinh ra từ vựng thứ hai,
   * nhưng nó dễ đọc ngược — đó là lý do có dòng chú thích này và một test canh.
   */
  max_data_class: DataClass;
  enabled: boolean;
  purpose?: string;
  /**
   * Số chiều của vector nhúng — CHỈ có nghĩa với đầu ra nhúng.
   *
   * Nằm trong cấu hình chứ không trong mã nguồn vì nó phải khớp với bề rộng cột `vector(n)`
   * trong CSDL: đổi con số này mà không đổi migration là làm hỏng mọi phép so vector đã lưu,
   * nên nó cần ở chỗ người sửa nhìn thấy ràng buộc. Có kiểm thử canh hai nơi khớp nhau.
   */
  output_dimensions?: number;
}

export interface ModelConfig {
  version: string;
  routes: Record<string, ModelRoute>;
}

/** Lỗi chính sách dữ liệu — KHÔNG thử lại, và không có cách "vòng qua" nào từ mã gọi. */
export class DataClassViolation extends Error {
  readonly retryable = false;

  constructor(
    readonly routeName: string,
    readonly requested: DataClass,
    readonly allowed: DataClass,
  ) {
    super(
      `Không gửi được dữ liệu hạng ${requested} tới "${routeName}" — đầu ra này chỉ nhận dữ liệu từ hạng ${allowed} trở xuống về mức nhạy cảm. ` +
        'Ẩn danh dữ liệu trước khi gửi, hoặc dùng nhà cung cấp có cam kết không lưu trữ và không huấn luyện.',
    );
    this.name = 'DataClassViolation';
  }
}

export class ModelNotConfigured extends Error {
  readonly retryable = false;

  constructor(routeName: string, reason: string) {
    super(`Chưa gọi được mô hình cho bước "${routeName}": ${reason}`);
    this.name = 'ModelNotConfigured';
  }
}

/**
 * Đọc `config/models.yaml`.
 *
 * Tệp YAML nạp vào Worker dạng văn bản qua `rules` trong `wrangler.jsonc`; trong kiểm thử
 * thì đọc bằng `node:fs`. Cả hai đường đều đi qua hàm này nên chỉ có một bản phân tích.
 */
export function parseModelConfig(yamlText: string): ModelConfig {
  const raw = parseYaml(yamlText) as ModelConfig | undefined;
  if (!raw || typeof raw !== 'object' || !raw.routes) {
    throw new Error('config/models.yaml không đúng định dạng: thiếu mục `routes`.');
  }
  for (const [name, route] of Object.entries(raw.routes)) {
    if (![1, 2, 3].includes(route.max_data_class)) {
      throw new Error(`Đầu ra "${name}" có max_data_class không hợp lệ: ${route.max_data_class}.`);
    }
  }
  return raw;
}

/** Cấu hình mô hình đã qua lớp chặn, kèm khoá để gọi. Chỉ `resolve()` tạo ra được. */
export type ResolvedRoute = ModelRoute & { apiKey: string };

export class ModelRouter {
  constructor(
    private readonly config: ModelConfig,
    private readonly apiKey?: string,
  ) {}

  /**
   * Lấy cấu hình mô hình cho một bước, kèm khai báo hạng dữ liệu sẽ gửi.
   *
   * Đây là ĐƯỜNG DUY NHẤT tới cấu hình mô hình. Không có biến thể "chỉ lấy tên mô hình" —
   * có biến thể đó là có đường vòng qua lớp chặn.
   */
  resolve(routeName: string, dataClass: DataClass): ResolvedRoute {
    const route = this.config.routes[routeName];
    if (!route) {
      throw new ModelNotConfigured(routeName, 'không có mục tương ứng trong config/models.yaml.');
    }
    // Hạng nhỏ hơn = nhạy cảm hơn mức đầu ra được phép nhận.
    if (dataClass < route.max_data_class) {
      throw new DataClassViolation(routeName, dataClass, route.max_data_class);
    }
    if (!route.enabled) {
      throw new ModelNotConfigured(routeName, 'đầu ra đang tắt trong cấu hình.');
    }
    if (!this.apiKey) {
      throw new ModelNotConfigured(routeName, 'chưa có khoá API trong Cloudflare Workers Secrets.');
    }
    // Trả kèm khoá thay vì để bên gọi tự cầm một bản sao: có hai chỗ giữ khoá là có một
    // chỗ dùng được khoá mà không đi qua lớp chặn này.
    return { ...route, apiKey: this.apiKey };
  }

  /**
   * Kiểm tra hạng dữ liệu MÀ KHÔNG cần đầu ra đã bật.
   *
   * Tách riêng để phần chính sách dữ liệu kiểm thử được ngay bây giờ, khi chưa có khoá API
   * — và để câu trả lời "được phép gửi không" không bị lẫn với "gọi được không".
   */
  allows(routeName: string, dataClass: DataClass): boolean {
    const route = this.config.routes[routeName];
    return route !== undefined && dataClass >= route.max_data_class;
  }

  get version(): string {
    return this.config.version;
  }
}
