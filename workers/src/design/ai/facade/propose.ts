/**
 * Lượt gọi mô hình cho ý tưởng mặt đứng (T59) — chỗ DUY NHẤT của `ai/facade/` tốn tiền.
 *
 * Gửi ba khối: phần đầu bài có ích cho mặt ngoài (đã lược danh tính, hạng 2 — T12), KHUNG khoá suy
 * từ mặt bằng, và danh mục mã. Không gửi cả mặt bằng: mô hình chỉ cần biết mặt tiền rộng bao nhiêu,
 * cao mấy tầng và lỗ mở nằm đâu — trả tiền cho nó đọc lại từng phòng không đổi được quyết định nào.
 */

import {
  aiFacadeProposalSchema,
  type AiBriefDigest,
  type AiFacadeBrief,
  type AiFacadeProposal,
} from '@nvg/shared/design';
import proposalSchemaJson from '../../../../../contracts/ai-facade-proposal.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../../brief/anonymise';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import type {
  ReasoningEffort,
  StructuredCallOptions,
  TextModelClient,
} from '../../llm/text-client';
import type { PlanCallRecord } from '../plan';
import type { AiPrompts } from '../prompts';
import { facadeRequirementsText } from './brief';
import { checkFacade } from './check';
import type { FacadeFrame } from './frame';

/**
 * Phần đầu bài gửi cho mô hình — chỉ những trường nói về MẶT NGOÀI. Đã lược danh tính từ trước
 * (`anonymiseForAi`); lọc thêm ở đây là để lời dẫn ngắn, không phải để bảo mật.
 */
export function facadeBrief(digest: AiBriefDigest): string {
  return JSON.stringify({
    building_type: digest.building_type,
    floors: digest.floors,
    style: digest.style ?? null,
    style_note: digest.free_text?.style_note ?? null,
    indoor_outdoor: digest.massing?.indoor_outdoor ?? null,
    orientation: digest.site.orientation ?? null,
  });
}

/** Khung mặt đứng dạng chữ — mọi dòng lỗ mở và ban công đánh dấu LOCKED. */
export function facadeFrameText(frame: FacadeFrame): string {
  const out = [
    `Facade width ${frame.width} cm, x from ${frame.x0} to ${frame.x1}.`,
    `Pavement level z = ${frame.groundZ}. Roof slab z = ${frame.roofZ}.`,
    `Front yard: ${frame.frontYard ? 'yes — a gate and fence may stand at the pavement' : 'no — the house stands on the street line, gate and fence must be null'}.`,
    'Storeys:',
    ...frame.levels.map(
      (l) => `- storey ${l.level}: z ${l.z} to ${l.z + l.h}, x ${l.x0} to ${l.x1}`,
    ),
    'LOCKED openings (storey, kind, x from–to, z from–to):',
    ...(frame.openings.length
      ? frame.openings.map((o) => {
          const z = (frame.levels.find((l) => l.level === o.level)?.z ?? 0) + o.sill;
          return `- storey ${o.level}, ${o.kind}, x ${o.x}–${o.x + o.w}, z ${z}–${z + o.h}`;
        })
      : ['- none']),
    'LOCKED balconies (storey, x from–to):',
    ...(frame.balconies.length
      ? frame.balconies.map((b) => `- storey ${b.level}, x ${b.x0}–${b.x1}`)
      : ['- none']),
  ];
  return out.join('\n');
}

/** Danh mục mã, mỗi nhóm một khối `code — cụm tiếng Anh`. */
export function facadeCodes(vocab: FacadeVocabulary): string {
  const block = (title: string, table: Record<string, { prompt_en: string }>) =>
    [`${title}:`, ...Object.entries(table).map(([code, v]) => `- ${code} — ${v.prompt_en}`)].join(
      '\n',
    );
  return [
    block('roof materials (roof.material)', vocab.roofMaterials),
    block('materials (materials[].material, gate.material, fence.material)', vocab.materials),
    block('colours (every colour field)', vocab.colours),
    block('balcony railings (balcony_railing)', vocab.railings),
    block(
      'door materials (materials[].material for main_door, side_door, window, garage_door)',
      vocab.doorMaterials,
    ),
  ].join('\n\n');
}

export interface FacadeCallInput {
  client: TextModelClient;
  route: string;
  prompts: AiPrompts;
  digest: AiBriefDigest;
  frame: FacadeFrame;
  vocab: FacadeVocabulary;
  /** Phiếu yêu cầu của kỹ sư — rỗng khi chưa điền. */
  brief?: AiFacadeBrief | null;
  /** Lượt gọi lại: lý do lượt trước không dùng được (tiếng Việt, nguyên văn phép kiểm). */
  retryIssues?: readonly string[] | null;
  /**
   * Lượt gọi lại vì ĐIỂM chứ không vì lỗi (T63) — câu trả lời trước hợp lệ, chỉ chưa giống thói
   * quen vẽ của NVG. Dùng lời dẫn khác: bảo mô hình rằng nó «không dùng được» trong khi nó dùng
   * được là dạy sai, và lượt sau nó sẽ đổi cả những thứ đang đúng.
   */
  retryKind?: 'gate' | 'habits';
  reasoningEffort?: ReasoningEffort;
  onProgress?: StructuredCallOptions['onProgress'];
  signal?: AbortSignal;
}

export interface FacadeAttempt {
  /** Đúng hợp đồng VÀ qua phép kiểm. `null` khi còn lỗi. */
  proposal: AiFacadeProposal | null;
  /** Đúng hợp đồng nhưng chưa qua phép kiểm — giữ để lượt sau biết đã hỏng ở đâu. */
  parsed: AiFacadeProposal | null;
  issues: string[];
  call: PlanCallRecord;
}

export async function callFacadeModel(call: FacadeCallInput): Promise<FacadeAttempt> {
  const facade = call.prompts.facade;
  const body = facade.user
    .replace('{brief}', () => facadeBrief(call.digest))
    .replace('{frame}', () => facadeFrameText(call.frame))
    .replace('{requirements}', () =>
      facadeRequirementsText(call.brief ?? null, call.vocab, call.frame),
    )
    .replace('{codes}', () => facadeCodes(call.vocab));
  // Phần gọi lại nối vào CUỐI thân lời gọi: lời dẫn hệ thống và phần đầu giữ nguyên từng byte, nên
  // nhà cung cấp đọc lại từ bộ nhớ đệm (cùng cách với `callHouseModel`).
  const retryTemplate = call.retryKind === 'habits' ? facade.retryHabits : facade.retry;
  const retry = call.retryIssues?.length
    ? `\n\n${retryTemplate.replace('{issues}', () => call.retryIssues!.map((i) => `- ${i}`).join('\n'))}`
    : '';

  // Không truyền trần token: tuyến trong `config/models.yaml` là van DUY NHẤT (`text-client.ts`).
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: facade.system,
    prompt: `${body}${retry}`,
    schema: structuredClone(proposalSchemaJson) as Record<string, unknown>,
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
  const parsed = aiFacadeProposalSchema.safeParse(result.json);
  if (!parsed.success) {
    return {
      proposal: null,
      parsed: null,
      issues: parsed.error.issues
        .slice(0, 10)
        .map((issue) => `Sai cấu trúc ở ${issue.path.join('.') || 'gốc'}: ${issue.message}`),
      call: record,
    };
  }
  const issues = checkFacade(parsed.data, call.frame, call.vocab, call.brief ?? null);
  return {
    proposal: issues.length ? null : parsed.data,
    parsed: parsed.data,
    issues,
    call: record,
  };
}
