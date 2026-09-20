/**
 * Lưu NGUYÊN VĂN những gì đã gửi cho mô hình ở mỗi lượt gọi — để kỹ sư đọc lại (13/09/2026).
 *
 * Haan: «tôi muốn biết bạn đã input những gì vào prompt cho model AI — hãy thêm nút xuất prompt ra
 * file text để tôi review». Trước đó nhật ký `design_ai_call` chỉ giữ số token và tiền: biết một
 * lượt tốn 32.000 token nhưng không biết đã hỏi nó điều gì.
 *
 * Lưu ở kho artifact (`<project>/ai_calls/<call_id>.json`), KHÔNG ở CSDL: một lượt xếp tầng mang
 * ~20 KB chữ, và bảng nhật ký được màn hình đọc thẳng qua PostgREST — nhét chừng ấy vào mỗi dòng là
 * làm chậm đúng bảng hiện ở cuối mọi trang thiết kế AI.
 *
 * Bản ghi là DỮ LIỆU (JSON); tệp chữ cho người đọc dựng lúc tải (`formatPromptText`), để đổi cách
 * trình bày không phải đổi những gì đã lưu.
 *
 * ⚠️ Đây là dữ liệu hạng 2 (đầu bài đã lược danh tính, T12) — cùng hạng đã gửi cho nhà cung cấp.
 * Tải về phải đi qua RLS của dòng nhật ký, như mọi artifact của hồ sơ.
 */

import { schemaFor, type SchemaProvider } from '../llm/schema-dialect';
import type { DataClass } from '@nvg/shared/design';
import type {
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';

export const PROMPT_RECORD_VERSION = 1;

export interface PromptRecord {
  version: typeof PROMPT_RECORD_VERSION;
  route: string;
  dataClass: DataClass;
  system: string;
  prompt: string;
  /** Lược đồ đầu ra ĐỘC LẬP nhà cung cấp — tệp chữ đổi sang phương ngữ nhà cung cấp lúc tải. */
  schema: Record<string, unknown>;
  reasoningEffort: string | null;
  maxOutputTokens: number | null;
  /** Số ảnh gửi kèm — ảnh không lưu lại ở đây (đã có ở artifact nguồn). */
  imageCount: number;
  /**
   * JSON mô hình TRẢ VỀ, chưa validate — vắng khi lời gọi hỏng. Thêm 15/09/2026: lượt đo 4a521f52 hỏng
   * ở lượt thứ tư mà ý định lượt ấy không còn ở đâu (ba lượt đầu chỉ đọc lại được nhờ lượt sửa gửi kèm
   * ý định cũ), nên không phát lại được đúng lượt cuối.
   */
  output?: unknown;
}

export function promptRecordOf(
  route: string,
  dataClass: DataClass,
  options: StructuredCallOptions,
): PromptRecord {
  return {
    version: PROMPT_RECORD_VERSION,
    route,
    dataClass,
    system: options.system,
    prompt: options.prompt,
    schema: options.schema,
    reasoningEffort: options.reasoningEffort ?? null,
    maxOutputTokens: options.maxOutputTokens ?? null,
    imageCount: options.images?.length ?? 0,
  };
}

/**
 * Bọc một client để ghi lại MỌI lời gọi, theo đúng thứ tự — kể cả lời gọi hỏng giữa chừng: lượt
 * hỏng vẫn tính tiền, và đó chính là lượt kỹ sư muốn đọc lại nhất.
 */
export function recordingClient(client: TextModelClient): {
  client: TextModelClient;
  records: PromptRecord[];
} {
  const records: PromptRecord[] = [];
  return {
    records,
    client: {
      async complete(routeName, dataClass, options): Promise<StructuredCallResult> {
        const record: PromptRecord = promptRecordOf(routeName, dataClass, options);
        records.push(record);
        const result = await client.complete(routeName, dataClass, options);
        record.output = result.json;
        return result;
      },
    },
  };
}

/** Khoá trong kho artifact. Mã lượt gọi là UUID do Worker sinh — không lấy từ trình duyệt. */
export function promptKey(projectId: string, callId: string): string {
  return `${projectId}/ai_calls/${callId}.json`;
}

export interface PromptCallMeta {
  createdAt: string;
  purpose: string;
  purposeLabel: string;
  provider: string;
  model: string;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: string;
}

/** Tên việc cho đầu tệp — cùng từ với nhật ký trên màn hình (`web/.../ai-usage.tsx`). */
const PURPOSE_VI: Record<string, string> = {
  program: 'Chương trình không gian (AI)',
  program_intent: 'Đề xuất ưu tiên diện tích',
  plan_house: 'Mặt bằng — AI khai cả nhà',
  plan_house_revise: 'Mặt bằng — AI sửa ý định cả nhà',
  plan_house_edit: 'Mặt bằng — sửa theo yêu cầu kỹ sư',
  facade: 'Mặt đứng — AI đề xuất ý tưởng',
  facade_revise: 'Mặt đứng — AI sửa ý tưởng',
  facade_image: 'Mặt đứng — ảnh có vật liệu (ảnh)',
  plan_level: 'Mặt bằng — xếp một tầng (luồng trước 15/09/2026)',
  plan_level_resample: 'Mặt bằng — xếp lại / sửa một tầng (luồng trước 15/09/2026)',
};

export function purposeLabelVi(purpose: string): string {
  return PURPOSE_VI[purpose] ?? purpose;
}

const SCHEMA_PROVIDERS: readonly SchemaProvider[] = ['openai', 'anthropic', 'gemini'];

/**
 * Tệp chữ cho người đọc. Ba phần theo đúng thứ tự nhà cung cấp nhận: lời dẫn hệ thống, thân lời
 * gọi, lược đồ đầu ra.
 *
 * Thân lời gọi gửi đi là JSON KHÔNG thụt lề (tiết kiệm token, T26). Tệp này thụt lề phần JSON cho
 * dễ đọc và nói rõ điều đó; phần chữ nối sau (lượt sửa, lượt xếp lại) giữ nguyên văn.
 */
export function formatPromptText(record: PromptRecord, meta: PromptCallMeta): string {
  const rule = (title: string) => `\n${'='.repeat(100)}\n${title}\n${'='.repeat(100)}\n`;
  const [head, ...tail] = record.prompt.split('\n\n');
  let body = record.prompt;
  let pretty = false;
  try {
    body = JSON.stringify(JSON.parse(head ?? ''), null, 2);
    if (tail.length) body += `\n\n${tail.join('\n\n')}`;
    pretty = true;
  } catch {
    body = record.prompt;
  }
  const provider = meta.provider.replace(/_paid$/, '') as SchemaProvider;
  const dialect = SCHEMA_PROVIDERS.includes(provider);
  let sentSchema: unknown = record.schema;
  try {
    if (dialect) sentSchema = schemaFor(provider, record.schema);
  } catch {
    sentSchema = record.schema;
  }

  const lines = [
    'LỜI GỌI MÔ HÌNH AI — BẢN GHI NGUYÊN VĂN',
    '',
    `Thời điểm         : ${meta.createdAt}`,
    `Việc              : ${meta.purposeLabel} (${meta.purpose})`,
    `Tuyến / model     : ${record.route} · ${meta.provider} · ${meta.model}`,
    `Mức suy nghĩ      : ${record.reasoningEffort ?? 'mặc định của tuyến'}`,
    `Trần token ra     : ${record.maxOutputTokens ?? 'theo tuyến (config/models.yaml)'}`,
    `Phiên bản lời dẫn : ${meta.promptVersion ?? '—'}`,
    `Hạng dữ liệu      : ${record.dataClass}`,
    `Ảnh gửi kèm       : ${record.imageCount}`,
    `Token vào / ra    : ${meta.inputTokens ?? 'không rõ'} / ${meta.outputTokens ?? 'không rõ'}`,
    `Kết quả           : ${meta.status}`,
    '',
    `Độ dài đã gửi: lời dẫn hệ thống ${record.system.length} ký tự · thân lời gọi ${record.prompt.length} ký tự · lược đồ ${JSON.stringify(sentSchema).length} ký tự.`,
    rule('1. LỜI DẪN HỆ THỐNG (system / instructions)'),
    record.system,
    rule(
      pretty
        ? '2. THÂN LỜI GỌI (prompt) — phần JSON đã thụt lề cho dễ đọc; bản gửi đi viết liền một dòng'
        : '2. THÂN LỜI GỌI (prompt)',
    ),
    body,
    rule(
      dialect
        ? `3. LƯỢC ĐỒ ĐẦU RA BẮT BUỘC — đúng phương ngữ đã gửi cho ${provider}`
        : '3. LƯỢC ĐỒ ĐẦU RA BẮT BUỘC',
    ),
    JSON.stringify(sentSchema, null, 2),
    '',
  ];
  return lines.join('\n');
}
