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
import { LlmCallFailed, type GeminiClient } from '../llm/gemini';
import type { VocabularyIndex } from '../kb/vocabulary';
import { bedroomsFor } from '@nvg/shared/design';

/** Bản tóm tắt đã ẩn danh — hạng 3. KHÔNG nhận từ bên ngoài. Xem chú thích đầu tệp. */
const INTENT_DATA_CLASS: DataClass = 3;

const SCHEMA_VERSION = '1.0.0';

export interface IntentResult {
  intent: ProgramIntent | null;
  /** Câu tiếng Việt nói cho kiến trúc sư biết AI có tham gia hay không, và vì sao. */
  notes: string[];
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
}

export function digestBrief(brief: DesignBrief, floorAreaM2: number): BriefDigest {
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
  };
}

/**
 * Nhớ lại kết quả theo BẢN TÓM TẮT, dùng chung giữa các request trong cùng isolate.
 *
 * Lời gọi thật mất 10–15 giây, và màn hình Chương trình không gian gọi lại mỗi lần mở tab —
 * người dùng ngồi nhìn khung xám suốt từng đó giây cho một câu trả lời không đổi. Bản tóm tắt
 * là toàn bộ đầu vào của lượt gọi, nên hai bản tóm tắt giống nhau thì câu trả lời dùng lại
 * được mà không mất gì.
 *
 * Cố ý KHÔNG lưu xuống CSDL: isolate sống ngắn nên bộ nhớ này tự hết hạn, và một đề xuất cũ
 * nằm lại nhiều ngày sau khi đã sửa lời nhắc là thứ khó truy hơn nhiều so với việc gọi lại.
 */
const cache = new Map<string, ProgramIntent>();
const CACHE_LIMIT = 64;

export async function resolveProgramIntent(
  brief: DesignBrief,
  floorAreaM2: number,
  index: VocabularyIndex,
  llm: GeminiClient | null | undefined,
): Promise<IntentResult> {
  if (!llm) {
    return { intent: null, notes: [] };
  }

  const digest = digestBrief(brief, floorAreaM2);
  const cacheKey = JSON.stringify(digest);
  const remembered = cache.get(cacheKey);
  if (remembered) return { intent: remembered, notes: [] };

  const catalogue = index.vocabulary.types.map((t) => `${t.code} = ${t.vi}`).join('\n');

  const system = [
    'Vai trò: kiến trúc sư soạn chương trình không gian cho nhà ở dân dụng Việt Nam.',
    'Nhiệm vụ: với mỗi loại không gian, nói nó NÊN RỘNG RÃI, BÌNH THƯỜNG hay TỐI GIẢN trong một hồ sơ có hình dạng như dưới đây.',
    'TUYỆT ĐỐI KHÔNG trả về diện tích, kích thước hay bất kỳ con số mét vuông nào — việc gán số do bước sau làm.',
    'Chỉ dùng mã không gian có trong danh mục. Không bịa mã mới.',
    'Ở "add_spaces" chỉ nêu không gian mà hồ sơ này CÒN THIẾU. Không nêu phòng ngủ, phòng khách, bếp, phòng ăn, khu vệ sinh, thang bộ, giao thông — những thứ đó hệ thống luôn tự có.',
    'Nêu lý do ngắn gọn bằng tiếng Việt, một hai câu, không dùng đại từ nhân xưng.',
    'Danh mục mã không gian:',
    catalogue,
  ].join('\n');

  const schema = {
    type: 'object',
    properties: {
      emphasis: {
        type: 'array',
        items: {
          type: 'object',
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
    required: ['emphasis', 'rationale'],
  };

  try {
    const answer = await llm.generateJson<Omit<ProgramIntent, 'schema_version'>>(
      'layer2_program',
      INTENT_DATA_CLASS,
      {
        system,
        prompt: `Hồ sơ (đã ẩn danh):\n${JSON.stringify(digest, null, 2)}`,
        schema,
      },
    );
    // Kiểm theo hợp đồng ngay tại ranh giới. Mô hình trả sai cấu trúc là chuyện thường; đi
    // tiếp với một cấu trúc sai thì cái sai lộ ra ở tận bảng diện tích.
    const parsed = programIntentSchema.safeParse({ ...answer, schema_version: SCHEMA_VERSION });
    if (!parsed.success) {
      return { intent: null, notes: [NOTE_BAD_SHAPE] };
    }
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(cacheKey, parsed.data);
    return { intent: parsed.data, notes: [] };
  } catch (error) {
    return { intent: null, notes: [noteFor(error)] };
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
