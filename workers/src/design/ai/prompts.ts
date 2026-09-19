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
  floorLevel: {
    /**
     * Chỉ dẫn hệ thống cho bước khai Ý ĐỊNH BỐ CỤC của MỘT TẦNG (T43) — tiếng Anh, không mang dữ liệu.
     */
    system: string;
    /**
     * Phần nối vào khi LẤY MẪU LẠI một tầng vì câu trả lời trước sai hợp đồng, có chỗ `{avoid}`. KHÔNG
     * mang câu trả lời cũ — không có ý định đúng hợp đồng nào để sửa.
     */
    resample: string;
    /**
     * Lượt SỬA Ý ĐỊNH khi bộ giải không dựng được tầng vì lý do nằm ở ý định (T43) — có chỗ `{intent}`
     * và `{avoid}`. Ý định chỉ ~1 KB nên gửi lại rẻ hơn hẳn để mô hình dựng lại từ đầu và sai chỗ khác.
     */
    revise: string;
    /** Mã lỗi cổng → một dòng tiếng Anh, `{…}` điền từ `params` của lỗi. */
    hints: Record<string, string>;
    /** Dòng dùng khi mã lỗi chưa có trong `hints`; có `{code}` và `{ref}`. */
    hintDefault: string;
    /**
     * Mã tiêu chí điểm (`kb/plan_quality.yaml`) → một dòng tiếng Anh, `{rooms}` = phòng làm mất điểm. Dùng
     * khi phương án qua cổng nhưng dưới ngưỡng điểm (T53). Tiêu chí không có dòng thì không gửi.
     */
    scoreHints: Record<string, string>;
    /**
     * Ba ý đồ bố cục gửi kèm ba phương án.
     *
     * Là DỮ LIỆU chứ không phải hằng số trong mã vì đây là thứ sẽ đổi sau mỗi lần đo: ba phương
     * án chỉ có giá trị khi chúng khác nhau về CẤU TRÚC, và việc tìm ba ý đồ thật sự khác nhau
     * là việc chỉnh lời dẫn, không phải việc triển khai lại.
     */
    strategies: PlanStrategy[];
  };
  /**
   * Lượt SỬA theo yêu cầu kỹ sư trên một bản vẽ đã lưu (T53). `user` có `{plan}` và `{request}`; `retry`
   * có `{issues}` — nối vào khi thao tác lượt trước không qua cổng.
   */
  planEdit: { system: string; user: string; retry: string };
  /**
   * Tờ mặt bằng CÓ NỘI THẤT do mô hình ảnh vẽ từ ảnh neo (T57). `user` có bảy chỗ điền; `styles`
   * là mã phong cách đầu bài → một câu tiếng Anh; `watermark` là câu tiếng Việt in đè lên ảnh.
   */
  sheetImage: {
    system: string;
    user: string;
    styles: Record<string, string>;
    watermark: string;
  };
}

/**
 * Bảy chỗ điền bắt buộc của `sheet_image.user`.
 *
 * Kiểm lúc NẠP chứ không lúc gọi, vì thiếu một chỗ điền chỉ lộ ra sau khi đã trả tiền một tấm ảnh:
 * lời dẫn vẫn hợp lệ, mô hình vẫn vẽ, chỉ là vẽ thiếu tên phòng hoặc thiếu khung tên.
 */
const SHEET_IMAGE_SLOTS = [
  '{level_name}',
  '{rooms}',
  '{footprint}',
  '{dimensions}',
  '{north}',
  '{title_block}',
  '{style}',
] as const;

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
  const floorLevel = (doc as { floor_level?: Record<string, unknown> }).floor_level;
  if (
    !floorLevel ||
    typeof floorLevel.system !== 'string' ||
    typeof floorLevel.resample !== 'string' ||
    typeof floorLevel.revise !== 'string' ||
    typeof floorLevel.hint_default !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `floor_level.system`, `floor_level.resample`, `floor_level.revise` hoặc `floor_level.hint_default`.',
    );
  }
  if (!floorLevel.resample.includes('{avoid}')) {
    throw new AiPromptsError('`floor_level.resample` phải có chỗ điền `{avoid}`.');
  }
  if (!floorLevel.revise.includes('{avoid}') || !floorLevel.revise.includes('{intent}')) {
    throw new AiPromptsError('`floor_level.revise` phải có chỗ điền `{intent}` và `{avoid}`.');
  }
  const hints = floorLevel.hints;
  if (
    !hints ||
    typeof hints !== 'object' ||
    Object.values(hints).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`floor_level.hints` phải là bảng mã lỗi → một dòng chữ.');
  }
  const scoreHints = floorLevel.score_hints ?? {};
  if (
    typeof scoreHints !== 'object' ||
    Object.values(scoreHints).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`floor_level.score_hints` phải là bảng mã tiêu chí → một dòng chữ.');
  }
  const planEdit = (doc as { plan_edit?: Record<string, unknown> }).plan_edit;
  if (
    !planEdit ||
    typeof planEdit.system !== 'string' ||
    typeof planEdit.user !== 'string' ||
    typeof planEdit.retry !== 'string' ||
    !planEdit.user.includes('{plan}') ||
    !planEdit.user.includes('{request}') ||
    !planEdit.retry.includes('{issues}')
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `plan_edit.system`, `plan_edit.user` (có `{plan}`, `{request}`) hoặc `plan_edit.retry` (có `{issues}`).',
    );
  }
  const sheetImage = parseSheetImage((doc as { sheet_image?: unknown }).sheet_image);
  const strategies = parseStrategies(floorLevel.strategies);
  return {
    version: doc.version,
    program: { system: program.system, repair: program.repair },
    floorLevel: {
      system: floorLevel.system,
      resample: floorLevel.resample,
      revise: floorLevel.revise,
      hints: hints as Record<string, string>,
      hintDefault: floorLevel.hint_default,
      scoreHints: scoreHints as Record<string, string>,
      strategies,
    },
    planEdit: { system: planEdit.system, user: planEdit.user, retry: planEdit.retry },
    sheetImage,
  };
}

/**
 * Khối lời dẫn của tờ mặt bằng có nội thất — kiểm đủ bốn khoá và đủ bảy chỗ điền.
 *
 * Bảng `styles` được phép RỖNG: đầu bài có thể không khai phong cách, và khi ấy lời dẫn bỏ hẳn
 * mệnh đề ấy. Nhưng khoá phải có mặt, để việc thiếu bảng phân biệt được với việc thiếu một mã.
 */
function parseSheetImage(raw: unknown): AiPrompts['sheetImage'] {
  const block = raw as Record<string, unknown> | undefined;
  if (
    !block ||
    typeof block !== 'object' ||
    typeof block.system !== 'string' ||
    typeof block.user !== 'string' ||
    typeof block.watermark !== 'string'
  ) {
    throw new AiPromptsError(
      'kb/ai_design_prompts.yaml thiếu `sheet_image.system`, `sheet_image.user` hoặc `sheet_image.watermark`.',
    );
  }
  const missing = SHEET_IMAGE_SLOTS.filter((slot) => !(block.user as string).includes(slot));
  if (missing.length) {
    throw new AiPromptsError(`\`sheet_image.user\` thiếu chỗ điền ${missing.join(', ')}.`);
  }
  const styles = block.styles ?? {};
  if (
    typeof styles !== 'object' ||
    styles === null ||
    Object.values(styles).some((line) => typeof line !== 'string')
  ) {
    throw new AiPromptsError('`sheet_image.styles` phải là bảng mã phong cách → một dòng chữ.');
  }
  return {
    system: block.system,
    user: block.user,
    styles: styles as Record<string, string>,
    watermark: block.watermark,
  };
}

/**
 * Danh sách ý đồ bố cục — kiểm đủ hình dạng và mã không trùng.
 *
 * Mã trùng nhau là lỗi phải chặn lúc NẠP, không phải lúc chạy: hai phương án cùng `variant_id`
 * sẽ đúc ra hai artifact mà màn hình không phân biệt được, và lúc ấy đã tốn tiền gọi mô hình.
 */
function parseStrategies(raw: unknown): PlanStrategy[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AiPromptsError('kb/ai_design_prompts.yaml thiếu `floor_level.strategies`.');
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
        `\`floor_level.strategies[${index}]\` phải có đủ \`id\`, \`label\`, \`strategy\`.`,
      );
    }
    if (!/^AI-[A-Z]$/.test(entry.id)) {
      throw new AiPromptsError(
        `\`floor_level.strategies[${index}].id\` phải theo khuôn AI-A, AI-B… (đang là "${entry.id}").`,
      );
    }
    if (seen.has(entry.id)) {
      throw new AiPromptsError(`Hai ý đồ bố cục cùng mã "${entry.id}".`);
    }
    seen.add(entry.id);
    return { id: entry.id, label: entry.label, strategy: entry.strategy };
  });
}
