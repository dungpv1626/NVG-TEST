/**
 * Quy phần CHỮ TỰ DO của đầu bài về mã không gian chuẩn.
 *
 * Nguồn: doc/design/02-architecture.md mục 2.2 (Lớp 2 = "LLM + truy hồi SQL");
 * 03-data-contracts.md mục 3.1 (`family[].needs` là mảng chuỗi tự do).
 *
 * Đây là chỗ DUY NHẤT của Lớp 2 có mô hình ngôn ngữ, và vị trí đó là có chủ ý: engine soạn
 * chương trình (`engine.ts`) phải tất định để cùng đầu bài luôn ra cùng mã băm artifact. Nên
 * phần "hiểu tiếng người" bị đẩy hết ra rìa, và nó giao cho engine một danh sách mã đã sạch.
 *
 * Hai lượt, cùng khuôn với `kb/normalize-labels.ts`:
 *
 *  1. **Bảng bí danh** — tất định, không ra mạng, và xử lý được phần lớn trường hợp thật:
 *     người bán hàng gõ "phòng thờ", "gara", "phòng làm việc" chứ ít khi gõ một câu dài.
 *  2. **Mô hình ngôn ngữ** — chỉ phần còn lại.
 *
 * ⚠️ Lượt 2 HIỆN KHÔNG CHẠY, và đó là trạng thái đúng chứ không phải lỗi. Nhu cầu do khách
 * nói ra là dữ liệu **hạng 1** (`config/models.yaml`: "thông tin khách hàng, đầu bài"), còn
 * mọi đầu ra trong giai đoạn demo đặt `max_data_class: 3` vì gói Gemini miễn phí có thể được
 * dùng để huấn luyện (CLAUDE.md 5.1, quyết định T8). Lớp chặn từ chối lời gọi TRƯỚC khi ra
 * mạng. Ngày có cam kết bằng văn bản của nhà cung cấp thì hạ một con số trong cấu hình là
 * chạy — không sửa dòng mã nào ở đây.
 *
 * Hạ hạng dữ liệu khai báo ở lời gọi để "cho nó chạy được" là cách vượt rào duy nhất, và nó
 * đưa nguyên văn yêu cầu của khách ra dịch vụ ngoài mà không ai nhận ra. Đừng làm.
 */

import type { DataClass } from '@nvg/shared/design';
import { DataClassViolation, ModelNotConfigured } from '../llm/router';
import { LlmCallFailed, type GeminiClient } from '../llm/gemini';
import type { VocabularyIndex } from '../kb/vocabulary';

/** Nhu cầu do khách nói ra là đầu bài — hạng nhạy cảm nhất. Xem chú thích đầu tệp. */
const NEEDS_DATA_CLASS: DataClass = 1;

/** Mô hình trả về mã này khi đoạn chữ không tương ứng không gian nào. */
export const NOT_A_SPACE = 'khong_phai_khong_gian';

export interface NeedsResult {
  /** Mã không gian rút ra được, đã lọc trùng, thứ tự tất định. */
  spaces: string[];
  /** Đoạn chữ không quy được về mã nào — kiến trúc sư đọc và tự xử lý. */
  unresolved: string[];
  /** Vì sao phần còn lại chưa được xử lý. Rỗng khi không có gì để nói. */
  notes: string[];
}

/**
 * `phrases` gộp `family[].needs` và `priorities` của đầu bài.
 *
 * Đoạn nào quy được về một mã không gian thì thành một không gian trong chương trình; đoạn
 * còn lại KHÔNG bị nuốt mà trả về nguyên văn — khách đã nói ra một yêu cầu, im lặng bỏ qua
 * nó là cách chắc chắn nhất để mất lòng tin vào cả hệ thống.
 */
export async function resolveNeeds(
  phrases: string[],
  index: VocabularyIndex,
  llm?: GeminiClient,
): Promise<NeedsResult> {
  const spaces: string[] = [];
  const pending: string[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const text = phrase?.trim();
    if (!text) continue;
    const hit = index.lookup(text);
    if (hit) {
      if (!seen.has(hit)) {
        seen.add(hit);
        spaces.push(hit);
      }
    } else if (!pending.includes(text)) {
      pending.push(text);
    }
  }

  if (!pending.length) return { spaces, unresolved: [], notes: [] };
  if (!llm) {
    return {
      spaces,
      unresolved: pending,
      notes: [
        'Chưa cấu hình mô hình ngôn ngữ nên phần nhu cầu viết bằng lời chưa được đọc tự động.',
      ],
    };
  }

  try {
    const guessed = await askModel(pending, index, llm);
    for (const code of guessed.values()) {
      if (code !== NOT_A_SPACE && !seen.has(code)) {
        seen.add(code);
        spaces.push(code);
      }
    }
    return { spaces, unresolved: pending.filter((p) => !guessed.has(p)), notes: [] };
  } catch (error) {
    // Ba loại hỏng, một cách xử lý: giữ nguyên phần chưa đọc được và NÓI RA lý do. Lớp 2 là
    // luồng nghiệp vụ chính, còn mô hình ngôn ngữ ở đây là phụ trợ (PRD 5.1) — để nó chặn
    // việc soạn chương trình không gian là đảo ngược quan hệ đó.
    if (
      error instanceof DataClassViolation ||
      error instanceof ModelNotConfigured ||
      error instanceof LlmCallFailed
    ) {
      return { spaces, unresolved: pending, notes: [explain(error)] };
    }
    throw error;
  }
}

function explain(error: Error): string {
  if (error instanceof DataClassViolation) {
    return 'Phần nhu cầu viết bằng lời chưa được đọc tự động: đầu bài là dữ liệu nhạy cảm, chưa được phép gửi tới dịch vụ mô hình ngôn ngữ đang dùng. Đọc thủ công và bổ sung vào danh sách không gian.';
  }
  if (error instanceof ModelNotConfigured) {
    return 'Phần nhu cầu viết bằng lời chưa được đọc tự động: chưa cấu hình mô hình ngôn ngữ cho bước này.';
  }
  return 'Phần nhu cầu viết bằng lời chưa được đọc tự động: dịch vụ mô hình ngôn ngữ đang không phản hồi.';
}

async function askModel(
  phrases: string[],
  index: VocabularyIndex,
  llm: GeminiClient,
): Promise<Map<string, string>> {
  const catalogue = index.vocabulary.types.map((t) => `${t.code} = ${t.vi}`).join('\n');

  const system = [
    'Vai trò: đọc nhu cầu của chủ nhà viết bằng tiếng Việt tự do và quy về mã không gian chuẩn.',
    'Chỉ trả về mã có trong danh mục.',
    `Đoạn nào không nói về một không gian (ví dụ mong muốn về phong cách, ngân sách, hướng nhà) thì trả về "${NOT_A_SPACE}".`,
    'Một đoạn chỉ ứng với một mã — đoạn nhắc nhiều không gian thì chọn không gian chính.',
    'Danh mục mã không gian:',
    catalogue,
  ].join('\n');

  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        phrase: { type: 'string' },
        code: { type: 'string', enum: [...index.codes, NOT_A_SPACE] },
      },
      required: ['phrase', 'code'],
    },
  };

  const answer = await llm.generateJson<{ phrase: string; code: string }[]>(
    'layer2_program',
    NEEDS_DATA_CLASS,
    {
      system,
      prompt: `Quy các nhu cầu sau về mã không gian, trả về đủ ${phrases.length} mục:\n${phrases.map((p) => `- ${p}`).join('\n')}`,
      schema,
    },
  );

  const allowed = new Set([...index.codes, NOT_A_SPACE]);
  const requested = new Set(phrases);
  const result = new Map<string, string>();
  for (const item of answer) {
    if (requested.has(item.phrase) && allowed.has(item.code)) result.set(item.phrase, item.code);
  }
  return result;
}
