/**
 * Bước 1 (phần cuối) của pipeline số hoá: quy nhãn phòng nguyên văn về mã phòng chuẩn.
 *
 * Nguồn: doc/design/06-knowledge-base.md mục 6.1 — `"PN2"` / `"P.NGỦ 2"` / `"BEDROOM 2"` →
 * `bedroom`.
 *
 * Chạy ở Worker, KHÔNG ở Container (CLAUDE.md 8.7). Trình trích xuất giữ nguyên văn.
 *
 * Hai lượt, và thứ tự quan trọng:
 *
 *  1. **Bảng bí danh** (`kb/room_vocabulary.yaml`) — tất định, miễn phí, và cho cùng kết quả
 *     giữa hai lần chạy. Phần lớn nhãn thật rơi vào đây.
 *  2. **Mô hình ngôn ngữ** — chỉ cho phần còn lại, và chỉ MỘT lượt gọi cho toàn bộ nhãn lạ
 *     đã lọc trùng của cả bộ hồ sơ.
 *
 * Vì sao không đưa thẳng mọi nhãn cho mô hình: kết quả sẽ thôi tất định. Cùng một bộ hồ sơ
 * số hoá lại hai lần có thể ra hai bản ghi khác nhau, mà bản ghi lại được dùng làm few-shot
 * — sai sót ở đây không dừng ở một hồ sơ, nó dạy sai cho mọi phương án sinh sau đó.
 */

import type { DataClass } from '@nvg/shared/design';
import type { GeminiClient } from '../llm/gemini';
import { LlmCallFailed } from '../llm/gemini';
import type { VocabularyIndex } from './vocabulary';

/** Giá trị mô hình trả về khi không quy được nhãn về loại nào — KHÔNG đoán bừa. */
export const UNKNOWN = 'khong_ro';

export interface NormaliseResult {
  /** Mã phòng theo từng tầng, cùng thứ tự với `rooms` của tầng đó. `null` = chưa quy được. */
  roomTypes: (string | null)[][];
  /** Nhãn đã phải nhờ tới mô hình ngôn ngữ. Dùng để người xác nhận soát trước. */
  inferred: { label: string; code: string }[];
  /** Nhãn không ai quy được — vào hàng chờ người xác nhận. */
  unresolved: string[];
}

/**
 * Hạng dữ liệu của nhãn phòng.
 *
 * Nhãn phòng trong bản vẽ (`"PN2"`, `"BẾP"`) không mang thông tin nhận dạng khách hàng, không
 * mang giá, không mang kích thước — nên là hạng 3 và gửi được tới gói miễn phí. Đây là lý do
 * bước này chạy được ngay trong khi các lớp khác còn phải chờ cam kết của nhà cung cấp.
 *
 * ⚠️ Chỉ đúng chừng nào hàm dưới gửi ĐÚNG chuỗi nhãn. Thêm bất kỳ ngữ cảnh nào — mã dự án,
 * tên chủ nhà, diện tích thật — là đổi hạng dữ liệu, và khi đó phải sửa cả `config/models.yaml`.
 */
const LABEL_DATA_CLASS: DataClass = 3;

export async function normaliseRoomLabels(
  plans: { rooms: { label_raw?: string | null }[] }[],
  index: VocabularyIndex,
  llm?: GeminiClient,
): Promise<NormaliseResult> {
  const roomTypes: (string | null)[][] = [];
  const pending = new Set<string>();

  for (const plan of plans) {
    const level: (string | null)[] = [];
    for (const room of plan.rooms) {
      const raw = room.label_raw?.trim();
      if (!raw) {
        level.push(null);
        continue;
      }
      const hit = index.lookup(raw);
      level.push(hit ?? null);
      if (!hit) pending.add(raw);
    }
    roomTypes.push(level);
  }

  if (pending.size === 0 || !llm) {
    return { roomTypes, inferred: [], unresolved: [...pending] };
  }

  const guessed = await askModel([...pending], index, llm);

  const inferred: { label: string; code: string }[] = [];
  for (const [label, code] of guessed) inferred.push({ label, code });

  // Áp kết quả bằng cách quét lại, không phải bằng chỉ số đã ghi nhớ: hai phòng khác tầng
  // có cùng nhãn phải nhận cùng mã, và đi qua cùng một bảng tra là cách chắc chắn nhất.
  plans.forEach((plan, level) => {
    const codes = roomTypes[level];
    if (!codes) return;
    plan.rooms.forEach((room, i) => {
      if (codes[i] !== null) return;
      const raw = room.label_raw?.trim();
      if (raw) codes[i] = guessed.get(raw) ?? null;
    });
  });

  return {
    roomTypes,
    inferred,
    unresolved: [...pending].filter((label) => !guessed.has(label)),
  };
}

/**
 * Một lượt gọi cho toàn bộ nhãn lạ.
 *
 * Gọi từng nhãn một sẽ tốn n lượt mạng và — quan trọng hơn — mất ngữ cảnh: biết cả bộ nhãn
 * của một công trình giúp phân biệt `"P.T"` là phòng thờ hay phòng tắm, vì bộ còn lại cho
 * thấy phòng kia đã có nhãn riêng.
 */
async function askModel(
  labels: string[],
  index: VocabularyIndex,
  llm: GeminiClient,
): Promise<Map<string, string>> {
  const catalogue = index.vocabulary.types.map((t) => `${t.code} = ${t.vi}`).join('\n');

  const system = [
    'Vai trò: quy nhãn phòng viết tắt trong bản vẽ kiến trúc Việt Nam về mã phòng chuẩn.',
    'Chỉ trả về mã có trong danh mục. Không chắc thì trả về "' + UNKNOWN + '".',
    'Số đuôi là số thứ tự phòng, không đổi loại phòng: "PN2" và "PN3" cùng là bedroom.',
    'Danh mục mã phòng:',
    catalogue,
  ].join('\n');

  const schema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        code: { type: 'string', enum: [...index.codes, UNKNOWN] },
      },
      required: ['label', 'code'],
    },
  };

  let answer: { label: string; code: string }[];
  try {
    answer = await llm.generateJson<{ label: string; code: string }[]>(
      'kb_label_normalize',
      LABEL_DATA_CLASS,
      {
        system,
        prompt: `Quy các nhãn sau về mã phòng, trả về đủ ${labels.length} mục:\n${labels.map((l) => `- ${l}`).join('\n')}`,
        schema,
      },
    );
  } catch (error) {
    // Mô hình hỏng KHÔNG được giết cả mẻ số hoá: bản ghi vẫn hợp lệ khi thiếu mã phòng, chỉ
    // là mất phần few-shot. Ném lên đây sẽ biến một tính năng phụ trợ thành điểm chặn luồng
    // chính, trái với PRD 5.1 ("AI luôn ở mức phụ trợ tuỳ chọn").
    if (error instanceof LlmCallFailed) return new Map();
    throw error;
  }

  const allowed = new Set(index.codes);
  const requested = new Set(labels);
  const result = new Map<string, string>();
  for (const item of answer) {
    // Lọc lại phía mình dù lược đồ đã ràng buộc: `responseSchema` là ràng buộc của nhà cung
    // cấp, không phải của mình, và mã lạ lọt vào đây sẽ vi phạm hợp đồng kb-record ở tận
    // bước sau — nơi thông báo lỗi không còn nhắc gì tới mô hình ngôn ngữ nữa.
    if (requested.has(item.label) && allowed.has(item.code)) result.set(item.label, item.code);
  }
  return result;
}
