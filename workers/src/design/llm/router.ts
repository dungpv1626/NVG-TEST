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

/** Giá niêm yết của nhà cung cấp — DỮ LIỆU để tính cột chi phí, không phải hằng số trong mã. */
export interface RoutePricing {
  input_per_1m_usd?: number;
  output_per_1m_usd?: number;
  /** Giá một ảnh, khi nhà cung cấp tính theo ảnh thay vì theo token. */
  image_usd?: number;
}

export interface ModelRoute {
  provider: string;
  model: string;
  /**
   * Chữ hiện trên ô chọn model của trang thiết kế (T10). Chỉ tuyến `ai_*` cần; vắng thì
   * giao diện không hiện tuyến đó.
   */
  label?: string;
  pricing?: RoutePricing;
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
  /**
   * Địa chỉ HTTP đầy đủ của đầu ra — CHỈ dùng cho nhà cung cấp không có một gốc URL duy nhất.
   *
   * Gemini suy ra địa chỉ từ tên mô hình nên không cần trường này. Hugging Face thì ngược lại:
   * mỗi mô hình được phục vụ bởi một đối tác định tuyến khác nhau (`fal-ai`, `nscale`,
   * `replicate`…) và đường dẫn mang mã mô hình RIÊNG của đối tác đó
   * (`fal-ai/flux-kontext/dev` chứ không phải `black-forest-labs/FLUX.1-Kontext-dev`). Ánh xạ
   * ấy do Hugging Face công bố và đổi được bất cứ lúc nào, nên nó là DỮ LIỆU — viết vào mã là
   * đúng loại hằng số mà đầu tệp `config/models.yaml` cấm.
   */
  endpoint?: string;
  /**
   * Địa chỉ dành riêng cho lượt sinh ảnh CÓ ảnh vào (ảnh → ảnh).
   *
   * Chỉ OpenAI cần: hãng này tách làm hai đầu ra khác nhau cả về đường dẫn lẫn kiểu thân yêu
   * cầu — `/v1/images/generations` nhận JSON và KHÔNG nhận ảnh vào, `/v1/images/edits` nhận
   * multipart và BẮT BUỘC có ảnh vào. Đó là hình dạng API của họ, không phải của ta, nên nó
   * khai tường minh ở đây thay vì để mã cắt chuỗi đường dẫn lúc chạy.
   *
   * Gemini không cần: một địa chỉ `generateContent` nhận cả hai kiểu, khác nhau chỉ ở số phần
   * ảnh trong `contents`.
   */
  endpoint_edit?: string;
  /**
   * Mức SUY NGHĨ của dòng Gemini 3 — `minimal` | `low` | `medium` | `high`.
   *
   * Là DỮ LIỆU chứ không phải hằng số trong mã, vì nó là một cái van đánh đổi **chất lượng lấy
   * tiền và lấy chỗ**: `maxOutputTokens` là trần CHUNG cho token nghĩ cộng token trả lời, nên
   * nghĩ nhiều là vừa đắt hơn vừa còn ít chỗ cho JSON hơn. Chỉnh nó phải là sửa cấu hình, không
   * phải một lần triển khai.
   *
   * Đo 11/09/2026: để mặc định (`high`) thì `gemini-3.1-pro-preview` tiêu 31.986 token trên
   * ngân sách 32.000 và trả về một chuỗi JSON bị cắt ở 2.113 ký tự — hỏng, và vẫn tính tiền.
   *
   * Chỉ khai cho tuyến dòng Gemini 3. Dòng 2.5 dùng `thinkingBudget` cũ và không nhận trường
   * này; gửi cả hai cùng lúc là lỗi 400.
   */
  thinking_level?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Trần token đầu ra của tuyến — GHI ĐÈ con số mà nơi gọi xin.
   *
   * Vì sao ở đây chứ không ở nơi gọi: nơi gọi biết công việc cần bao nhiêu chữ, nhưng chỉ TUYẾN
   * mới biết model này nghĩ tốn bao nhiêu, và `maxOutputTokens` là trần CHUNG cho cả nghĩ lẫn
   * trả lời. Cùng một bước xếp mặt bằng cần ngân sách rất khác nhau giữa một model nghĩ nhiều
   * và một model nghĩ ít — nên con số ấy thuộc về tuyến.
   *
   * **`0` nghĩa là KHÔNG đặt trần**: bỏ hẳn trường khi gọi, để nhà cung cấp dùng mức tối đa của
   * chính model. Dùng khi cần ĐO xem một bước thật sự tiêu bao nhiêu — đặt một con số đoán rồi
   * đo là đo chính con số mình đoán. Cẩn thận: không trần thì trần thật là mức tối đa của model,
   * nên một lượt gọi hỏng có thể tốn tới cả bậc đó.
   */
  max_output_tokens?: number;
  /**
   * Mức SUY NGHĨ của dòng gpt-5 — `minimal` | `low` | `medium` | `high`.
   *
   * Đối xứng với `thinking_level` của Gemini, và sinh ra từ cùng một phép đo. 13/09/2026: một
   * lượt xếp mặt bằng biệt thự 26 phòng tiêu **hết 32.000 token đầu ra** rồi vẫn bị cắt, trong
   * khi câu trả lời JSON của một mặt bằng cỡ ấy chỉ nặng ~1.500–2.500 token — tức khoảng 90%
   * ngân sách đi vào phần NGHĨ, thứ không hiện ra mà vẫn tính tiền và vẫn ăn vào trần. Lượt ấy
   * cũng vượt hạn chờ 300 giây.
   *
   * **Không khai thì KHÔNG gửi trường nào**, để nhà cung cấp dùng mặc định của model — hành vi
   * hôm nay giữ nguyên cho tới khi có người cố ý vặn. Đây là van đánh đổi chất lượng bố cục lấy
   * tiền và thời gian, nên nó phải là một dòng cấu hình có người quyết, không phải một hằng số
   * ai đó chọn hộ trong mã.
   */
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  /**
   * Hạn chờ MỘT lượt gọi, giây. `0` = không đặt hạn. Vắng = hạn mặc định trong client
   * (`openai.ts` 600 s, `gemini.ts` 500 s, `anthropic.ts` 300 s). Thêm 13/09/2026 để đo lượt
   * dài mà không bị client tự huỷ giữa chừng.
   */
  request_timeout_s?: number;
}

export interface ModelConfig {
  version: string;
  /**
   * Nhà cung cấp nào KHÔNG phát sinh hoá đơn (khoá gói miễn phí, dịch vụ không thu tiền).
   * Theo nhà cung cấp chứ không theo tuyến: tiền bám vào khoá.
   */
  billing?: { free_providers?: string[] };
  routes: Record<string, ModelRoute>;
}

/** Một tuyến nhìn từ giao diện: đủ để chọn, không đủ để gọi. */
export interface PublicRoute {
  route: string;
  provider: string;
  model: string;
  label: string;
  maxDataClass: DataClass;
  enabled: boolean;
  hasKey: boolean;
  pricing?: RoutePricing;
  /** `false` khi khoá của nhà cung cấp không phát sinh hoá đơn — tiền thật là 0. */
  billed: boolean;
  /**
   * Tuyến nhận «mức suy nghĩ» theo lượt không: OpenAI luôn nhận; Gemini chỉ khi tuyến khai
   * `thinking_level` (dòng 3); Anthropic đổi thành `output_config.effort` (13/09/2026).
   */
  supportsEffort: boolean;
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

/**
 * Khoá API theo NHÀ CUNG CẤP (`gemini`, `pollinations`…), lấy từ Cloudflare Workers Secrets.
 *
 * Theo nhà cung cấp chứ không phải một khoá duy nhất, vì từ 06/09/2026 có hai nhà cung cấp
 * cùng lúc. Để mỗi client tự cầm khoá của mình thì lại có chỗ dùng được khoá mà không đi qua
 * lớp chặn hạng dữ liệu — đúng thứ mà cả tệp này tồn tại để ngăn.
 */
export type ProviderKeys = Partial<Record<string, string>>;

export class ModelRouter {
  constructor(
    private readonly config: ModelConfig,
    private readonly apiKeys: ProviderKeys = {},
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
    const apiKey = this.apiKeys[route.provider];
    if (!apiKey) {
      throw new ModelNotConfigured(
        routeName,
        `chưa có khoá API của nhà cung cấp "${route.provider}" trong Cloudflare Workers Secrets.`,
      );
    }
    // Trả kèm khoá thay vì để bên gọi tự cầm một bản sao: có hai chỗ giữ khoá là có một
    // chỗ dùng được khoá mà không đi qua lớp chặn này.
    return { ...route, apiKey };
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

  /**
   * Nhà cung cấp của một đầu ra, KHÔNG kèm khoá và KHÔNG kiểm hạng dữ liệu.
   *
   * Dùng để chọn client nào gọi (`geminiClient` hay `pollinationsImageClient`) — câu hỏi đó
   * phải trả lời được TRƯỚC khi biết sẽ gửi dữ liệu hạng nào, và bản thân câu trả lời không
   * mở đường ra mạng: muốn gọi thật vẫn phải qua `resolve()`.
   */
  providerOf(routeName: string): string | undefined {
    return this.config.routes[routeName]?.provider;
  }

  /**
   * Danh sách tuyến cho ô chọn model — KHÔNG kèm khoá, KHÔNG mở đường ra mạng.
   *
   * `hasKey` nói "nhà cung cấp này đã có khoá trong Secrets" mà không lộ khoá, để giao diện ẩn
   * tuyến chưa dùng được thay vì hiện rồi báo lỗi khi bấm (AFD 6.5). Muốn gọi thật vẫn phải
   * qua `resolve()`.
   */
  publicRoutes(): PublicRoute[] {
    return Object.entries(this.config.routes).map(([route, r]) => ({
      route,
      provider: r.provider,
      model: r.model,
      label: r.label ?? r.model,
      maxDataClass: r.max_data_class,
      enabled: r.enabled,
      hasKey: Boolean(this.apiKeys[r.provider]),
      pricing: r.pricing,
      billed: this.isBilled(r.provider),
      supportsEffort:
        r.provider === 'openai' || r.provider === 'anthropic' || Boolean(r.thinking_level),
    }));
  }

  /** Khoá của nhà cung cấp này có phát sinh hoá đơn không (`billing.free_providers`). */
  isBilled(provider: string): boolean {
    return !(this.config.billing?.free_providers ?? []).includes(provider);
  }

  /** Danh sách nhà cung cấp miễn phí — màn hình nhật ký cần để tính tiền thật của dòng cũ. */
  get freeProviders(): string[] {
    return [...(this.config.billing?.free_providers ?? [])];
  }

  /** Giá niêm yết của một tuyến, không kèm khoá. */
  pricingOf(routeName: string): RoutePricing | undefined {
    return this.config.routes[routeName]?.pricing;
  }

  get version(): string {
    return this.config.version;
  }
}
