/**
 * Phần NGHIỆP VỤ của lượt chạy nền «ý tưởng mặt đứng» (T59) — không import gì của Cloudflare, nên
 * `vitest` gọi thẳng được với client mô hình giả. Cùng khuôn với `ai-design-steps.ts`:
 *
 *  · một hàm = một bước Workflow, gọi mô hình NHIỀU NHẤT MỘT LẦN — Workflow thử lại cả bước khi hỏng,
 *    gộp hai lượt gọi vào một bước là một lần rớt mạng mua lại lượt trước;
 *  · lượt gọi nào cũng ghi `design_ai_call` ngay trong bước đã gọi, kể cả lượt hỏng (CLAUDE.md 6.4);
 *  · dữ liệu đi giữa các bước là chuỗi JSON.
 */

import type { AiDesignParams } from './ai-design-steps';
import type { AiFacadeBrief, AiFloorPlan } from '@nvg/shared/design';
import { LlmCallFailed } from '../llm/gemini';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { ArtifactRepository } from '../artifacts';
import type { ConstructionNorms } from '../kb/construction';
import type { FacadeVocabulary } from '../kb/facade-vocabulary';
import type { RoutePricing } from '../llm/router';
import type { TextModelClient } from '../llm/text-client';
import { recordAiCall, type AiCallOutcome, type PromptSink } from '../ai/call-log';
import { callFacadeModel } from '../ai/facade/propose';
import { facadeFrame } from '../ai/facade/frame';
import { mergeFacade } from '../ai/facade/merge';
import type { PlanCallRecord } from '../ai/plan';
import { recordingClient } from '../ai/prompt-record';
import type { AiPrompts } from '../ai/prompts';
import type { LevelLiveHooks } from './ai-design-steps';

/**
 * Tổng số lượt gọi một lần chạy mặt đứng: lượt đầu, cộng MỘT lượt sửa kèm lý do phép kiểm. Mặt đứng
 * là một câu trả lời nhỏ; ý tưởng hỏng hai lần liền thì lỗi nằm ở lời dẫn hoặc danh mục, gọi thêm
 * chỉ mua lại đúng chỗ hỏng ấy.
 */
export const FACADE_CALLS_MAX = 2;

export interface FacadeStepDeps {
  client: TextModelClient;
  prompts: AiPrompts;
  construction: ConstructionNorms;
  /** Nhóm `outdoor` của `kb/room_vocabulary.yaml` — ban công, sân thượng. */
  outdoor: ReadonlySet<string>;
  vocab: FacadeVocabulary;
  repo: ArtifactRepository;
  pricing?: RoutePricing;
  provider: string;
  model: string;
  promptStore?: PromptSink;
}

export function facadeStepId(phase: 'propose' | 'write', round = 1): string {
  return phase === 'write' ? 'facade:write' : `facade:propose:${round}`;
}

export function facadeStepLabel(round: number): string {
  return round > 1 ? `AI sửa ý tưởng mặt đứng (lượt ${round})` : 'AI đề xuất ý tưởng mặt đứng';
}

/** Danh sách bước khai TRƯỚC khi chạy — lượt sửa chỉ phát sinh khi lượt đầu hỏng. */
export function facadeStepSpecs() {
  return [
    { id: facadeStepId('propose', 1), label: facadeStepLabel(1) },
    { id: facadeStepId('write'), label: 'Lưu ý tưởng mặt đứng' },
  ];
}

export interface FacadeProposeOutcome {
  /** Ý tưởng đã qua hợp đồng VÀ phép kiểm, JSON. `null` khi còn lỗi. */
  proposalJson: string | null;
  issues: string[];
  call: PlanCallRecord;
}

/** Mặt bằng mà lượt chạy dựng mặt đứng theo — đọc lại mỗi bước, rẻ và tất định. */
async function planOf(deps: FacadeStepDeps, params: AiDesignParams): Promise<AiFloorPlan> {
  if (!params.planRef) throw new Error('Lượt chạy mặt đứng thiếu mã phương án mặt bằng.');
  const artifact = await deps.repo.get(params.planRef, params.projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    throw new Error('Không tìm thấy phương án mặt bằng mà mặt đứng dựng theo.');
  }
  return artifact.payload as AiFloorPlan;
}

/** Phiếu yêu cầu của kỹ sư mà lượt chạy theo — `null` khi lượt chạy không kèm phiếu. */
async function briefOf(
  deps: FacadeStepDeps,
  params: AiDesignParams,
): Promise<AiFacadeBrief | null> {
  if (!params.facadeBriefRef) return null;
  const artifact = await deps.repo.get(params.facadeBriefRef, params.projectId);
  if (!artifact || artifact.kind !== 'ai_facade_brief') {
    throw new Error('Không tìm thấy phiếu yêu cầu mặt đứng mà lượt chạy theo.');
  }
  return artifact.payload as AiFacadeBrief;
}

/**
 * Một lượt gọi mô hình. KHÔNG ném khi câu trả lời sai: sai là một kết quả, gọi lại là việc của lớp
 * gọi. Chỉ ném khi chính lời gọi hỏng (mạng, nhà cung cấp) — sau khi đã ghi nhật ký.
 */
export async function proposeFacadeStep(
  deps: FacadeStepDeps,
  params: AiDesignParams,
  round: number,
  retryIssues: readonly string[] | null,
  live?: LevelLiveHooks,
): Promise<FacadeProposeOutcome> {
  const brief = await briefOf(deps, params);
  const frame = facadeFrame(await planOf(deps, params), deps.construction, deps.outdoor, brief);
  const recorded = recordingClient(deps.client);
  const request = () => recorded.records[recorded.records.length - 1];
  const started = Date.now();
  const purpose = round > 1 ? 'facade_revise' : 'facade';

  let attempt;
  try {
    attempt = await callFacadeModel({
      client: recorded.client,
      route: params.textRoute,
      prompts: deps.prompts,
      digest: params.digest,
      frame,
      vocab: deps.vocab,
      brief,
      retryIssues,
      ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      ...(live ? { onProgress: live.onProgress, signal: live.signal } : {}),
    });
  } catch (error) {
    // Lượt hỏng vẫn có thể đã tính tiền: ghi một dòng, lấy token từ chính lỗi (cùng cách `proposeHouse`).
    const failed: AiCallOutcome = {
      provider: deps.provider,
      model: deps.model,
      usage: (error instanceof LlmCallFailed && error.usage) || {
        inputTokens: null,
        outputTokens: null,
      },
      latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || Date.now() - started,
      status: 'failed',
      errorCode: live?.signal.aborted
        ? 'cancelled'
        : error instanceof Error
          ? error.name
          : 'unknown',
      request: request(),
    };
    const callId = await logCall(deps, params, purpose, failed);
    live?.onLogged({ callId, ...failed });
    throw error;
  }

  const logged: AiCallOutcome = {
    ...attempt.call,
    // «Trả về nhưng không dùng được» là `rejected`: tiền đã tiêu, kết quả không lưu.
    status: attempt.proposal ? 'ok' : 'rejected',
    request: request(),
  };
  const callId = await logCall(deps, params, purpose, logged);
  live?.onLogged({ callId, ...logged });
  return {
    proposalJson: attempt.proposal ? JSON.stringify(attempt.proposal) : null,
    issues: attempt.issues,
    call: attempt.call,
  };
}

export interface FacadeWriteOutcome {
  artifactId: string;
  reused: boolean;
  attempts: number;
}

/** Ghép khung KHOÁ với ý tưởng rồi đúc artifact — đặt head: mặt đứng mới nhất là bản đang hiệu lực. */
export async function writeFacadeStep(
  deps: FacadeStepDeps,
  params: AiDesignParams,
  proposalJson: string,
  call: PlanCallRecord,
  attempts: number,
): Promise<FacadeWriteOutcome> {
  const plan = await planOf(deps, params);
  const brief = await briefOf(deps, params);
  const frame = facadeFrame(plan, deps.construction, deps.outdoor, brief);
  const concept = mergeFacade(
    frame,
    JSON.parse(proposalJson),
    deps.vocab,
    {
      planRef: params.planRef!,
      briefRef: params.facadeBriefRef ?? null,
      generator: {
        kind: 'ai',
        provider: call.provider,
        model: call.model,
        route: params.textRoute,
        prompt_version: deps.prompts.version,
        repaired: attempts > 1,
      },
    },
    brief,
  );
  const written = await deps.repo.write({
    scope: {
      tenantId: params.tenantId,
      companyId: params.companyId,
      projectId: params.projectId,
      discipline: params.discipline,
      actorId: params.actorId,
    },
    kind: 'ai_facade_concept',
    payload: concept,
    // Phiếu là đầu vào thứ hai của ý tưởng — lineage nói được ý tưởng theo phiếu nào.
    inputs: [params.planRef!, ...(params.facadeBriefRef ? [params.facadeBriefRef] : [])],
    step: 'ai_facade_propose',
    params: { route: params.textRoute, prompt_version: deps.prompts.version },
  });
  return { artifactId: written.id, reused: written.reused, attempts };
}

async function logCall(
  deps: FacadeStepDeps,
  params: AiDesignParams,
  purpose: string,
  outcome: AiCallOutcome,
): Promise<string | null> {
  return recordAiCall(
    deps.repo.db,
    {
      tenantId: params.tenantId,
      companyId: params.companyId,
      projectId: params.projectId,
      discipline: params.discipline,
      actorId: params.actorId,
    },
    {
      route: params.textRoute,
      purpose,
      dataClass: AI_DIGEST_DATA_CLASS,
      promptVersion: deps.prompts.version,
    },
    outcome,
    deps.pricing,
    deps.promptStore,
  );
}
