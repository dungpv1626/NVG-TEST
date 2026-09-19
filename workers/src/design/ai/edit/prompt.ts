/**
 * Lượt gọi mô hình cho yêu cầu sửa của kỹ sư (T53) — chỗ DUY NHẤT của `ai/edit/` tốn tiền.
 *
 * Gửi BẢNG GỌN của bản vẽ, không gửi đầu bài, không gửi ảnh: mô hình chỉ cần hiểu «phòng ngủ 1», «mặt
 * hành lang», «góc phải» trỏ vào mã phòng và cạnh nào. Đầu bài đã được bản vẽ trả lời; gửi lại là trả
 * tiền đọc lại hai nghìn chữ không đổi được thao tác nào.
 */

import { aiPlanEditSchema, type AiFloorPlan, type AiPlanEdit } from '@nvg/shared/design';
import planEditSchemaJson from '../../../../../contracts/ai-plan-edit.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../../brief/anonymise';
import type {
  ReasoningEffort,
  StructuredCallOptions,
  TextModelClient,
} from '../../llm/text-client';
import { prepareWalls } from '../draw/walls';
import type { PlanCallRecord } from '../plan';
import { doorLinks } from '../plan-check';
import type { AiPrompts } from '../prompts';

const OUTSIDE = 'outside';

/** cm → m, hai chữ số thập phân — đủ để chỉ phía, không thừa ký tự. */
const m = (cm: number) => Math.round(cm) / 100;

/**
 * Bảng gọn một phương án: mỗi tầng một khối — dòng phòng `id | tên | m² | x0,y0,x1,y1 (m)`, rồi một dòng
 * các cửa `a-b kiểu`.
 */
export function planTable(plan: AiFloorPlan, labels: Readonly<Record<string, string>>): string {
  const out: string[] = [];
  for (const level of [...plan.levels].sort((p, q) => p.level - q.level)) {
    out.push(`Storey ${level.level}`);
    for (const room of level.rooms) {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
      const parts = room.parts?.length
        ? ` (open plan: ${room.parts.map((part) => `${part.id} ${labels[part.type] ?? part.type}`).join(', ')})`
        : '';
      out.push(
        `${room.id} | ${labels[room.type] ?? room.type} | ${room.area_m2} | ${m(x0)},${m(y0)},${m(x1)},${m(y1)}${parts}`,
      );
    }
    // Cửa đọc từ HÌNH HỌC đã dựng, không từ cây: cổng tự thêm cửa cho phòng mô hình quên (`door_added`),
    // và những cửa ấy không có trong cây — đọc cây thì phòng trông như không có lối vào.
    const kindOf = new Map((level.doors ?? []).map((door) => [door.id, door]));
    const full = new Set(
      (level.tree?.doors ?? [])
        .filter((door) => door.full)
        .map((door) => [door.a, door.b].sort().join('-')),
    );
    const doors = doorLinks(level, prepareWalls(level.walls)).map((link) => {
      const pair = link.toOutside ? `${link.rooms[0]}-${OUTSIDE}` : link.rooms.join('-');
      const kind = kindOf.get(link.id)?.kind ?? 'single';
      return `${pair} ${full.has([...link.rooms].sort().join('-')) ? 'no wall' : kind}`;
    });
    if (doors.length) out.push(`doors: ${doors.join('; ')}`);
    if (level.tree?.no_window.length) out.push(`no window: ${level.tree.no_window.join(', ')}`);
  }
  return out.join('\n');
}

export interface EditCallInput {
  client: TextModelClient;
  route: string;
  prompts: AiPrompts;
  plan: AiFloorPlan;
  labels: Readonly<Record<string, string>>;
  request: string;
  /** Lượt gọi lại: thao tác lần trước và lý do không áp được (tiếng Việt, nguyên văn cổng). */
  retry?: { ops: AiPlanEdit['ops']; issues: readonly string[] } | null;
  reasoningEffort?: ReasoningEffort;
  onProgress?: StructuredCallOptions['onProgress'];
  signal?: AbortSignal;
}

export interface EditAttempt {
  edit: AiPlanEdit | null;
  issues: string[];
  call: PlanCallRecord;
}

export async function callEditModel(call: EditCallInput): Promise<EditAttempt> {
  const edit = call.prompts.planEdit;
  const body = edit.user
    .replace('{plan}', () => planTable(call.plan, call.labels))
    .replace('{request}', () => call.request.trim());
  const retry = call.retry
    ? `\n\n${edit.retry.replace(
        '{issues}',
        () =>
          `${JSON.stringify(call.retry!.ops)}\n${call.retry!.issues.map((issue) => `- ${issue}`).join('\n')}`,
      )}`
    : '';

  // Không truyền trần token: tuyến trong `config/models.yaml` là van DUY NHẤT (`text-client.ts`).
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: edit.system,
    prompt: `${body}${retry}`,
    schema: structuredClone(planEditSchemaJson) as Record<string, unknown>,
    ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
    ...(call.onProgress ? { onProgress: call.onProgress } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  });
  const record: PlanCallRecord = {
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
  const parsed = aiPlanEditSchema.safeParse(result.json);
  if (!parsed.success) {
    return {
      edit: null,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`,
      ),
      call: record,
    };
  }
  return { edit: parsed.data, issues: [], call: record };
}
