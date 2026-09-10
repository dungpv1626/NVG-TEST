/**
 * Lời dẫn của nhánh AI — đọc từ `kb/ai_design_prompts.yaml`, kiểm hình dạng lúc nạp.
 *
 * Tách phần phân tích (thuần, kiểm thử được) khỏi phần nạp tệp (`prompts-data.ts`), cùng khuôn
 * với `render/render.ts` + `render/prompts-data.ts`.
 */

export interface AiPrompts {
  version: string;
  program: {
    /** Chỉ dẫn hệ thống cho bước lập chương trình không gian — tiếng Anh, không mang dữ liệu. */
    system: string;
    /** Lời dẫn lượt sửa, có chỗ `{issues}` để điền danh sách lỗi. */
    repair: string;
  };
  floorPlan: {
    /** Chỉ dẫn hệ thống cho bước xếp mặt bằng — tiếng Anh, không mang dữ liệu. */
    system: string;
    /**
     * Lời dẫn lượt sửa, có chỗ `{issues}` để điền danh sách lỗi.
     *
     * Có mặt từ T15 (09/09/2026), và đó là một thay đổi về NGUYÊN TẮC chứ không phải thêm một
     * chuỗi: trước đó mô hình tự viết SVG nên không có tiêu chí đạt/không đạt nào để đòi sửa.
     * Nay mô hình khai dữ liệu, nên `ai/plan-check.ts` trả lời được câu «bản này tự mâu thuẫn ở
     * đâu» và lượt sửa có cái mà bám vào. Vẫn đúng MỘT lượt.
     *
     * Lệch quy chuẩn thì KHÔNG đi qua đường này: nó hiện thành cảnh báo (`rule-warnings.ts`),
     * không bao giờ bắt mô hình sửa (T14, T20).
     */
    repair: string;
    /**
     * Ba ý đồ bố cục gửi kèm ba lượt gọi song song.
     *
     * Là DỮ LIỆU chứ không phải hằng số trong mã vì đây là thứ sẽ đổi sau mỗi lần đo: ba phương
     * án chỉ có giá trị khi chúng khác nhau về CẤU TRÚC, và việc tìm ba ý đồ thật sự khác nhau
     * là việc chỉnh lời dẫn, không phải việc triển khai lại.
     */
    strategies: PlanStrategy[];
  };
  /**
   * Tờ mặt bằng công năng do MÔ HÌNH ẢNH vẽ (T21, 10/09/2026).
   *
   * Ba khoá vì ba chủ sở hữu khác nhau, không phải vì gọn: `system` là phong cách tờ vẽ của
   * NVG và không hồ sơ nào đổi được; `prompt` là khuôn Worker điền số liệu THẬT lấy từ chính
   * artifact; `watermark` là câu in đè lên ảnh ở trình duyệt (CLAUDE.md 8.7).
   */
  sheetImage: {
    system: string;
    /**
     * Khuôn lời dẫn. Bốn chỗ điền, và `{sheet_prompt}` là chỗ QUAN TRỌNG nhất — nó nhận đoạn
     * mô tả do mô hình văn bản khai. Thiếu nó thì cả lượt gọi mất phần nội dung riêng của tầng
     * mà vẫn tính tiền, nên chỗ này được kiểm ngay lúc nạp.
     */
    prompt: string;
    watermark: string;
  };
}

/** Một ý đồ bố cục: mã phương án, nhãn tiếng Việt cho màn hình, câu tiếng Anh cho lời dẫn. */
export interface PlanStrategy {
  /** `AI-A`, `AI-B`, `AI-C` — khớp `variant_id` của hợp đồng `ai-floor-plan`. */
  id: string;
  label: string;
  strategy: string;
}

export class AiPromptsError extends Error {
  readonly retryable = false;
}

export function parseAiPrompts(raw: unknown): AiPrompts {
  const doc = raw as Partial<AiPrompts> | undefined;
  if (!doc || typeof doc !== 'object') throw new AiPromptsError('kb/ai_design_prompts.yaml rỗng.');
  if (typeof doc.version !== 'string') {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `version`.');
  }
  const program = doc.program;
  if (!program || typeof program.system !== 'string' || typeof program.repair !== 'string') {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `program.system` hoặc `program.repair`.',
    );
  }
  if (!program.repair.includes('{issues}')) {
    throw new AiPromptsError('`program.repair` phải có chỗ điền `{issues}`.');
  }
  const floorPlan = (doc as { floor_plan?: { system?: unknown; repair?: unknown } }).floor_plan;
  if (!floorPlan || typeof floorPlan.system !== 'string' || typeof floorPlan.repair !== 'string') {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `floor_plan.system` hoặc `floor_plan.repair`.',
    );
  }
  if (!floorPlan.repair.includes('{issues}')) {
    throw new AiPromptsError('`floor_plan.repair` phải có chỗ điền `{issues}`.');
  }
  const strategies = parseStrategies((floorPlan as { strategies?: unknown }).strategies);
  const sheetImage = parseSheetImage((doc as { sheet_image?: unknown }).sheet_image);
  return {
    version: doc.version,
    program: { system: program.system, repair: program.repair },
    floorPlan: { system: floorPlan.system, repair: floorPlan.repair, strategies },
    sheetImage,
  };
}

/**
 * Khối lời dẫn cho mô hình ảnh — BẮT BUỘC, không phải tuỳ chọn.
 *
 * Lời dẫn là tệp nằm trong kho, không phải cấu hình lúc chạy: thiếu nó là lỗi triển khai, và
 * lỗi triển khai phải nổ lúc nạp chứ không phải lúc một kiến trúc sư bấm nút vẽ.
 */
function parseSheetImage(raw: unknown): AiPrompts['sheetImage'] {
  const block = raw as Partial<AiPrompts['sheetImage']> | undefined;
  if (
    !block ||
    typeof block.system !== 'string' ||
    typeof block.prompt !== 'string' ||
    typeof block.watermark !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `sheet_image.system`, `sheet_image.prompt` hoặc `sheet_image.watermark`.',
    );
  }
  // Không có chỗ điền thì đoạn mô tả của mô hình văn bản rơi mất và tờ ảnh ra một ngôi nhà
  // chung chung — vẫn tính tiền, vẫn trông như một tờ bản vẽ, và không có gì báo.
  if (!block.prompt.includes('{sheet_prompt}')) {
    throw new AiPromptsError('`sheet_image.prompt` phải có chỗ điền `{sheet_prompt}`.');
  }
  if (!block.watermark.trim()) {
    throw new AiPromptsError('`sheet_image.watermark` không được rỗng — đây là nhãn bắt buộc.');
  }
  return { system: block.system, prompt: block.prompt, watermark: block.watermark };
}

/**
 * Danh sách ý đồ bố cục — kiểm đủ hình dạng và mã không trùng.
 *
 * Mã trùng nhau là lỗi phải chặn lúc NẠP, không phải lúc chạy: hai phương án cùng `variant_id`
 * sẽ đúc ra hai artifact mà màn hình không phân biệt được, và lúc ấy đã tốn tiền gọi mô hình.
 */
function parseStrategies(raw: unknown): PlanStrategy[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `floor_plan.strategies`.');
  }
  const seen = new Set<string>();
  return raw.map((item, index) => {
    const entry = item as Partial<PlanStrategy>;
    if (
      typeof entry.id !== 'string' ||
      typeof entry.label !== 'string' ||
      typeof entry.strategy !== 'string'
    ) {
      throw new AiPromptsError(
        `\`floor_plan.strategies[${index}]\` phải có đủ \`id\`, \`label\`, \`strategy\`.`,
      );
    }
    if (!/^AI-[A-Z]$/.test(entry.id)) {
      throw new AiPromptsError(
        `\`floor_plan.strategies[${index}].id\` phải theo khuôn AI-A, AI-B… (đang là "${entry.id}").`,
      );
    }
    if (seen.has(entry.id)) {
      throw new AiPromptsError(`Hai ý đồ bố cục cùng mã "${entry.id}".`);
    }
    seen.add(entry.id);
    return { id: entry.id, label: entry.label, strategy: entry.strategy };
  });
}
