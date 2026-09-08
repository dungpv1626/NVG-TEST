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
  return { version: doc.version, program: { system: program.system, repair: program.repair } };
}
