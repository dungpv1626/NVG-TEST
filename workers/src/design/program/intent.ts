/**
 * Lớp 2a — hỏi mô hình ngôn ngữ phòng nào NÊN RỘNG RÃI, phòng nào NÊN TỐI GIẢN.
 *
 * Nguồn: `config/models.yaml` tuyến `layer2_program`; yêu cầu 07/09/2026 của Haan ("hãy áp
 * dụng AI vào xử lý công việc này để tạo ra một chương trình không gian hợp lý nhất").
 *
 * ── Ranh giới, và vì sao nó ở đúng chỗ này ────────────────────────────────────────────
 *
 * Mô hình KHÔNG sinh mét vuông. Hợp đồng `ProgramIntent` không có một trường nào mang đơn
 * vị diện tích — nó chỉ có ba bậc `generous | normal | modest`. Bộ cấp phát tất định
 * (`engine.ts::allocateAreas`) nhận ba bậc đó, đổi thành hệ số trọng số, rồi chia ngân sách
 * sàn — và luôn kẹp trong [tối thiểu quy chuẩn, tối đa nghề].
 *
 * Nguyên tắc bất biến 2 (CLAUDE.md 8.2) là một lý do. Lý do thứ hai thực tế hơn: khoá chính
 * của `design_artifact` là mã băm nội dung, nên một con số do mô hình sinh làm "cùng đầu vào
 * → cùng artifact" mất nghĩa, và mất luôn khả năng nói một diện tích đến từ đâu.
 *
 * ── Hạng dữ liệu: chỉ gửi BẢN TÓM TẮT ĐÃ ẨN DANH ──────────────────────────────────────
 *
 * Đầu bài là dữ liệu **hạng 1** (`config/models.yaml`), mà mọi tuyến trong giai đoạn demo
 * đặt `max_data_class: 3` vì gói Gemini miễn phí có thể được dùng để huấn luyện (quyết định
 * T8). Nên tệp này KHÔNG gửi đầu bài. Nó dựng một bản tóm tắt bằng DANH SÁCH CHO PHÉP —
 * cách duy nhất bảo đảm một trường mới thêm vào hợp đồng đầu bài không tự động đi ra mạng:
 *
 *   gửi đi:      loại hình · số tầng · diện tích sàn LÀM TRÒN tới 10 m² · số phòng ngủ ·
 *                số thế hệ · phong cách · mã ưu tiên · danh sách MÃ không gian
 *   không gửi:   tên, địa chỉ, ngân sách, kích thước thật của thửa, và TOÀN BỘ chữ tự do
 *                của khách (`functional_notes`, `style_note`, `family[].needs`…)
 *
 * Cùng khuôn với `program/needs.ts`: ở đó lượt gọi mô hình cố ý KHÔNG chạy vì nó cần chính
 * chữ của khách. Ở đây lượt gọi chạy được, vì bản tóm tắt không mang chữ của ai.
 *
 * ⚠️ Hạ hạng khai báo ở lời gọi để "cho nó chạy" là cách vượt rào duy nhất — và nó đưa đầu
 * bài thật ra dịch vụ ngoài mà không ai nhận ra. Hằng số dưới đây khai CỨNG bằng 3 và không
 * nhận số này từ bên ngoài, cùng cách `site/extract-boundary.ts` làm.
 *
 * ── Không bao giờ chặn luồng chính ────────────────────────────────────────────────────
 * Hết hạn mức, mô hình trả sai cấu trúc, mạng hỏng — tất cả trả về `null` kèm một ghi chú
 * tiếng Việt. Chương trình không gian vẫn soạn xong bằng chuẩn nghề (PRD 5.1: tính năng AI
 * là phụ trợ tuỳ chọn).
 */

import {
  familyArchetype,
  programIntentSchema,
  type DataClass,
  type DesignBrief,
  type ProgramIntent,
} from '@nvg/shared/design';
import { DataClassViolation, ModelNotConfigured } from '../llm/router';
import { LlmCallFailed } from '../llm/gemini';
import type { TextModelClient, TokenUsage } from '../llm/text-client';
import type { VocabularyIndex } from '../kb/vocabulary';
import { bedroomsFor } from '@nvg/shared/design';

/** Bản tóm tắt đã ẩn danh — hạng 3. KHÔNG nhận từ bên ngoài. Xem chú thích đầu tệp. */
const INTENT_DATA_CLASS: DataClass = 3;

const SCHEMA_VERSION = '1.0.0';

export interface IntentResult {
  intent: ProgramIntent | null;
  /** Câu tiếng Việt nói cho kiến trúc sư biết AI có tham gia hay không, và vì sao. */
  notes: string[];
  /**
   * Lượt gọi đã ra mạng — để ghi nhật ký chi phí và hiện token lên màn hình. `null` khi không
   * có lượt nào đi ra (chưa có client, bị chặn trước khi gọi).
   */
  call: IntentCall | null;
}

export interface IntentCall {
  provider: string;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  status: 'ok' | 'rejected' | 'failed';
  errorCode?: string;
}

/**
 * Bản tóm tắt gửi cho mô hình. Dựng bằng DANH SÁCH CHO PHÉP, không phải bằng cách bỏ bớt.
 *
 * Khác biệt không phải chuyện phong cách: "bỏ bớt" nghĩa là một trường mới thêm vào hợp đồng
 * đầu bài sẽ tự động đi ra mạng cho tới khi có người nhớ ra phải bỏ nó.
 */
export interface BriefDigest {
  building_type: string;
  floors: number;
  floor_area_m2: number;
  bedrooms: number;
  generations: string | null;
  style: string | null;
  priorities: string[];
  space_types: string[];
  /**
   * Phần sàn CÒN LẠI cho không gian đề xuất thêm, tính bằng diện tích TỐI THIỂU: sàn cho phép
   * mỗi tầng × số tầng − tổng tối thiểu của chương trình hiện có. Làm tròn XUỐNG bậc 5 m² —
   * đủ để mô hình biết còn chỗ bao nhiêu, không đủ để suy ngược số đo thửa. `null` khi nơi gọi
   * không tính (kiểm thử cũ).
   */
  spare_min_area_m2: number | null;
}

/** Ngân sách diện tích cho không gian AI đề xuất thêm — xem `BriefDigest.spare_min_area_m2`. */
export interface IntentAreaBudget {
  spareMinAreaM2: number;
  /** Diện tích tối thiểu của từng mã phòng (chuẩn nghề) — mô hình cần để tự cộng. */
  minByType: Record<string, number>;
}

export function digestBrief(
  brief: DesignBrief,
  floorAreaM2: number,
  budget?: IntentAreaBudget,
): BriefDigest {
  return {
    building_type: brief.building_type,
    floors: brief.floors,
    // Làm tròn tới BẬC 50 m²: con số này chỉ để mô hình biết "cỡ nào", còn kích thước thật
    // của thửa là dữ liệu hạng 2 ("mặt bằng kích thước thật"). Bậc 10 m² từng dùng trước
    // 08/09/2026 gần bằng diện tích thửa thật với lô chữ nhật — tức là lộ số đo của bất động
    // sản qua tuyến hạng 3.
    floor_area_m2: Math.round(floorAreaM2 / 50) * 50,
    bedrooms: (brief.family ?? []).reduce(
      (sum, m) => sum + bedroomsFor(m.role ?? '', m.count ?? 0),
      0,
    ),
    generations: familyArchetype(brief.family),
    style: brief.style ?? null,
    priorities: [...(brief.priorities ?? [])],
    space_types: [...new Set((brief.required_spaces ?? []).map((s) => s.type))].sort(),
    spare_min_area_m2: budget ? Math.max(0, Math.floor(budget.spareMinAreaM2 / 5) * 5) : null,
  };
}

/**
 * Từ 13/09/2026 KHÔNG còn bộ nhớ đệm và KHÔNG còn tự gọi khi mở màn hình.
 *
 * Trước đó màn hình Chương trình không gian gọi mô hình mỗi lần mở tab, nhớ tạm theo isolate.
 * Chấp nhận được chừng nào đó là khoá Gemini miễn phí; hết chấp nhận được khi kỹ sư chọn được
 * mô hình trả phí — mỗi lần mở trang thành một khoản tiền không ai bấm. Nay chỉ chạy khi bấm
 * nút (`POST /design/program/intent`), và kết quả lưu kèm bản chốt (`space_program.ai_intent`).
 */
export async function resolveProgramIntent(
  brief: DesignBrief,
  floorAreaM2: number,
  index: VocabularyIndex,
  llm: TextModelClient | null | undefined,
  route: string,
  budget?: IntentAreaBudget,
): Promise<IntentResult> {
  if (!llm) {
    return { intent: null, notes: [], call: null };
  }

  const digest = digestBrief(brief, floorAreaM2, budget);

  const catalogue = index.vocabulary.types
    .map((t) => {
      const min = budget?.minByType[t.code];
      return min === undefined
        ? `${t.code} = ${t.vi}`
        : `${t.code} = ${t.vi} (tối thiểu ${min} m²)`;
    })
    .join('\n');

  const system = [
    'Vai trò: kiến trúc sư soạn chương trình không gian cho nhà ở dân dụng Việt Nam.',
    'Nhiệm vụ: với mỗi loại không gian, nói nó NÊN RỘNG RÃI, BÌNH THƯỜNG hay TỐI GIẢN trong một hồ sơ có hình dạng như dưới đây.',
    'TUYỆT ĐỐI KHÔNG trả về diện tích, kích thước hay bất kỳ con số mét vuông nào — việc gán số do bước sau làm.',
    'Chỉ dùng mã không gian có trong danh mục. Không bịa mã mới.',
    'Ở "add_spaces" chỉ nêu không gian mà hồ sơ này CÒN THIẾU. Không nêu phòng ngủ, phòng khách, bếp, phòng ăn, khu vệ sinh, thang bộ, giao thông — những thứ đó hệ thống luôn tự có.',
    // Luật cứng về diện tích (Haan, 13/09/2026): lượt GPT-5 đầu tiên đề xuất thêm chín không
    // gian trên một hồ sơ đã kín sàn, đẩy nhu cầu lên 226,9 m² trên sàn 180 m². Máy chủ vẫn tự
    // bỏ phần vượt (`run.ts::fitAiAdditions`), nhưng mô hình phải được nói trước.
    'LUẬT CỨNG VỀ DIỆN TÍCH: tổng diện tích TỐI THIỂU của các không gian nêu ở "add_spaces" KHÔNG ĐƯỢC VƯỢT "spare_min_area_m2" trong hồ sơ — đó là phần sàn còn lại sau khi đã trừ mọi không gian đang có, trên toàn bộ các tầng. Diện tích tối thiểu của từng mã ghi trong danh mục. "spare_min_area_m2" bằng 0 thì "add_spaces" phải rỗng. Không đủ chỗ cho một không gian đáng có thì nói ra trong "rationale", không nêu nó.',
    'Không nêu tủ đồ, phòng thay đồ, góc học tập, góc làm việc: đó là tiện ích NẰM TRONG phòng ngủ, không phải không gian riêng.',
    'Nêu lý do ngắn gọn bằng tiếng Việt, một hai câu, không dùng đại từ nhân xưng.',
    'Danh mục mã không gian:',
    catalogue,
  ].join('\n');

  // Mọi trường đều BẮT BUỘC và đóng `additionalProperties`: chế độ nghiêm của OpenAI đòi thế,
  // và một lược đồ chạy được ở cả ba nhà cung cấp thì không phải rẽ nhánh theo nhà cung cấp.
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      emphasis: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            space_type: { type: 'string', enum: [...index.codes] },
            level: { type: 'string', enum: ['generous', 'normal', 'modest'] },
          },
          required: ['space_type', 'level'],
        },
      },
      add_spaces: { type: 'array', items: { type: 'string', enum: [...index.codes] } },
      rationale: { type: 'string' },
    },
    required: ['emphasis', 'add_spaces', 'rationale'],
  };

  const started = Date.now();
  try {
    const result = await llm.complete(route, INTENT_DATA_CLASS, {
      system,
      prompt: `Hồ sơ (đã ẩn danh):\n${JSON.stringify(digest, null, 2)}`,
      schema,
    });
    const call: IntentCall = {
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      status: 'ok',
    };
    // Kiểm theo hợp đồng ngay tại ranh giới. Mô hình trả sai cấu trúc là chuyện thường; đi
    // tiếp với một cấu trúc sai thì cái sai lộ ra ở tận bảng diện tích.
    const answer = (result.json ?? {}) as Record<string, unknown>;
    const parsed = programIntentSchema.safeParse({
      ...answer,
      // Nhà cung cấp đổi trường tuỳ chọn thành `null` ở chế độ nghiêm; hợp đồng thì không nhận.
      add_spaces: Array.isArray(answer.add_spaces) ? answer.add_spaces : [],
      schema_version: SCHEMA_VERSION,
    });
    if (!parsed.success) {
      return {
        intent: null,
        notes: [NOTE_BAD_SHAPE],
        call: { ...call, status: 'rejected', errorCode: 'contract' },
      };
    }
    return { intent: parsed.data, notes: [], call };
  } catch (error) {
    const note = noteFor(error);
    // Bị chặn TRƯỚC khi ra mạng thì không có lượt gọi nào để tính tiền.
    if (error instanceof DataClassViolation || error instanceof ModelNotConfigured) {
      return { intent: null, notes: [note], call: null };
    }
    return {
      intent: null,
      notes: [note],
      call: {
        provider: '',
        model: '',
        // Nhà cung cấp tính tiền phần token đã sinh dù kết quả không dùng được.
        usage: (error instanceof LlmCallFailed && error.usage) || {
          inputTokens: null,
          outputTokens: null,
        },
        latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || Date.now() - started,
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'Error',
      },
    };
  }
}

const NOTE_BAD_SHAPE =
  'Phần đề xuất của AI về mức rộng rãi từng phòng chưa dùng được lần này (kết quả trả về không đúng cấu trúc). Chương trình không gian đang lập theo chuẩn nghề nghiệp.';

function noteFor(error: unknown): string {
  if (error instanceof DataClassViolation) {
    // Không bao giờ nên xảy ra: bản tóm tắt khai hạng 3, đúng mức tuyến cho phép. Nếu xảy ra
    // thì cấu hình đã siết chặt hơn, và im lặng ở đây là giấu mất lý do.
    return 'Phần đề xuất của AI bị lớp chặn dữ liệu từ chối. Chương trình không gian đang lập theo chuẩn nghề nghiệp.';
  }
  if (error instanceof ModelNotConfigured) {
    return 'Chưa cấu hình mô hình ngôn ngữ cho bước lập chương trình không gian. Chương trình đang lập theo chuẩn nghề nghiệp.';
  }
  if (error instanceof LlmCallFailed) {
    return 'Dịch vụ mô hình ngôn ngữ đang không phản hồi nên phần đề xuất của AI chưa chạy. Chương trình không gian đang lập theo chuẩn nghề nghiệp.';
  }
  throw error;
}
