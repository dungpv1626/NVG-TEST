/**
 * Phần NGHIỆP VỤ của Workflow nhánh AI — tách khỏi `ai-design.ts` để kiểm thử được.
 *
 * `ai-design.ts` import `cloudflare:workers` nên chỉ nạp được trong runtime Workers; tệp này
 * không import gì của Cloudflare, nên `vitest` gọi thẳng được với client mô hình giả.
 *
 * ── Một bước = một lượt gọi tính tiền ───────────────────────────────────────────────
 *
 * Workflow lưu kết quả từng `step.do` và thử lại cả bước khi bước đó hỏng. Vì thế mỗi hàm ở
 * đây gọi mô hình NHIỀU NHẤT MỘT LẦN: gộp hai lượt vào một bước thì một lần rớt mạng ở lượt
 * sau sẽ mua lại lượt trước. Và mọi lượt gọi đều ghi `design_ai_call` NGAY trong bước đã gọi,
 * trước khi bước sau có cơ hội hỏng — tiền đã tiêu thì phải có dòng nhật ký, kể cả khi lượt
 * chạy chết ngay sau đó (CLAUDE.md 6.4).
 *
 * Dữ liệu đi lại giữa các bước là CHUỖI JSON, không phải đối tượng: Workflow chỉ lưu được giá
 * trị serialise được, và kiểu `Serializable` của nó không diễn đạt được `unknown` — cùng cách
 * `digitise-steps.ts` đã làm với `extractionJson`.
 */

import type { AiBriefDigest, AiSpaceProgram } from '@nvg/shared/design';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { ArtifactRepository } from '../artifacts';
import type { ConstructionNorms } from '../kb/construction';
import type { RoutePricing } from '../llm/router';
import type { TextModelClient } from '../llm/text-client';
import type { RulePack } from '../rules/rule-pack';
import { recordAiCall, type AiCallScope } from '../ai/call-log';
import {
  callPlanModel,
  checkProposal,
  finalisePlan,
  planContext,
  type AiPlanProposal,
  type PlanCallRecord,
  type PlanContext,
  type PlanVariant,
} from '../ai/plan';
import type { AiPrompts } from '../ai/prompts';
import type { PlanIssue } from '../ai/plan-check';

/** Tham số của một instance Workflow — chỉ dữ liệu hạng 2 đã lược danh tính, và chuỗi nhỏ. */
export interface AiDesignParams {
  /** Dòng `design_ai_run` mà instance này ghi tiến độ vào. */
  runId: string;
  tenantId: string;
  companyId: string;
  projectId: string;
  actorId: string | null;
  discipline: 'kien_truc';
  stage: 'plan' | 'facade' | 'images';
  /** Tuyến model chữ đã chọn trên màn hình. */
  textRoute: string;
  briefRef: string;
  programRef: string;
  /**
   * Đầu bài đã LƯỢC DANH TÍNH, dựng sẵn ở tuyến khởi động dưới phiên người dùng.
   *
   * Vì sao không để Workflow tự đọc: dựng digest phải đọc tên, điện thoại, địa chỉ khách hàng
   * để lược chúng đi (`aiDigestInputs`), và Workflow chỉ có khoá `service_role` — vượt RLS.
   * Dựng ở tuyến khởi động thì việc đọc ấy đi qua đúng quyền của người bấm, và Workflow không
   * bao giờ chạm được vào dữ liệu danh tính.
   */
  digest: AiBriefDigest;
  /** Chương trình không gian đã chốt — mặt bằng phải xếp đúng danh sách này. */
  program: AiSpaceProgram;
  /**
   * Gói quy tắc kỹ sư đã tích cho lượt này (T20) — mặc định tắt cả hai.
   *
   * Đi trong params chứ không đọc lại từ cấu hình tenant lúc chạy: lựa chọn thuộc LƯỢT CHẠY này.
   * Đọc lại lúc chạy thì một lần ai đó đổi cấu hình giữa lúc bấm và lúc Workflow nhận việc sẽ
   * đổi luôn bộ ngưỡng gửi cho mô hình, mà không có gì nói ra.
   */
  rulePacks: { standards: boolean; experience: boolean };
  variants: PlanVariant[];
}

export interface PlanStepDeps {
  client: TextModelClient;
  prompts: AiPrompts;
  labels: Record<string, string>;
  construction: ConstructionNorms;
  rules: RulePack;
  doorExemptTypes: ReadonlySet<string>;
  repo: ArtifactRepository;
  /** Giá niêm yết của tuyến, để nhật ký chi phí có cột tiền. Thiếu thì cột tiền rỗng. */
  pricing?: RoutePricing;
  /** Nhà cung cấp theo cấu hình tuyến — dùng khi lượt gọi hỏng trước khi biết nhà cung cấp thật. */
  provider: string;
}

/** Mã bước, ổn định và đọc được trong nhật ký Workflow. */
export function planStepId(variantId: string, phase: 'propose' | 'check' | 'repair' | 'write') {
  return `plan:${variantId}:${phase}`;
}

/** Danh sách bước khai TRƯỚC khi chạy — lượt sửa không có ở đây vì nó chỉ phát sinh khi cần. */
export function planStepSpecs(variants: readonly PlanVariant[]) {
  return variants.flatMap((variant) => [
    { id: planStepId(variant.id, 'propose'), label: `Xếp phương án ${variant.id}` },
    { id: planStepId(variant.id, 'check'), label: `Kiểm phương án ${variant.id}` },
    { id: planStepId(variant.id, 'write'), label: `Lưu phương án ${variant.id}` },
  ]);
}

export interface ProposeOutcome {
  /** Đề xuất đã qua hợp đồng, dạng chuỗi JSON. `null` khi câu trả lời sai cấu trúc. */
  proposalJson: string | null;
  /** Lỗi cấu trúc của lượt này — rỗng khi `proposalJson` có giá trị. */
  issues: string[];
  call: PlanCallRecord;
}

/**
 * Một lượt gọi mô hình cho một phương án. Lượt đầu hay lượt sửa cùng dùng hàm này.
 *
 * Hàm này KHÔNG ném khi câu trả lời sai cấu trúc: sai cấu trúc là một kết quả, và lượt sửa là
 * việc của lớp gọi. Ném ở đây thì Workflow sẽ thử lại cả bước và mua lại đúng lượt vừa hỏng.
 */
export async function proposePlan(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  previous?: { proposalJson: string | null; issues: readonly string[] },
): Promise<ProposeOutcome> {
  const context = contextFor(deps, params, variant);
  const scope = scopeOf(params);
  const repairing = (previous?.issues.length ?? 0) > 0;

  let outcome: ProposeOutcome;
  try {
    const attempt = await callPlanModel({
      client: deps.client,
      route: params.textRoute,
      prompts: deps.prompts,
      digest: params.digest,
      context,
      previous: previous?.proposalJson
        ? (JSON.parse(previous.proposalJson) as AiPlanProposal)
        : null,
      issues: previous?.issues,
    });
    outcome = {
      proposalJson: attempt.proposal ? JSON.stringify(attempt.proposal) : null,
      issues: attempt.issues,
      call: attempt.call,
    };
  } catch (error) {
    // Lượt gọi hỏng ở tầng mạng hoặc nhà cung cấp: vẫn có thể đã tính tiền, nên vẫn ghi một
    // dòng. Rồi ném tiếp để Workflow thử lại theo chính sách của nó.
    await logCall(deps, scope, params, repairing, {
      provider: deps.provider,
      model: 'unknown',
      usage: { inputTokens: null, outputTokens: null },
      latencyMs: 0,
      status: 'failed',
      errorCode: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }

  await logCall(deps, scope, params, repairing, {
    ...outcome.call,
    // «Trả về nhưng sai cấu trúc» là `rejected`: tiền đã tiêu, kết quả không dùng được. Phân
    // biệt với `failed` (không tới được nhà cung cấp) để bảng chi phí nói đúng chuyện gì đã xảy ra.
    status: outcome.proposalJson ? 'ok' : 'rejected',
  });
  return outcome;
}

export interface CheckOutcome {
  /** Câu lỗi CHẶN, tiếng Việt, cụ thể — chính là danh sách gửi kèm lượt sửa. */
  blocking: string[];
  findings: PlanIssue[];
  /** Chỉ còn nhóm lỗi tường: lượt sửa xong mà vẫn vậy thì chương trình suy tường hộ (T19). */
  wallOnly: boolean;
}

/** Kiểm một đề xuất. Hàm thuần, không tốn gì — nên là một bước riêng và chạy lại vô hại. */
export function checkPlanProposal(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  proposalJson: string,
  call: PlanCallRecord,
  repaired: boolean,
): CheckOutcome {
  const check = checkProposal(assembleInput(deps, params, variant, proposalJson, call, repaired));
  return {
    blocking: check.blocking.map((issue) => issue.message),
    findings: check.findings,
    wallOnly: check.wallOnly,
  };
}

export interface WriteOutcome {
  variantId: string;
  artifactId: string;
  reused: boolean;
  wallsDerived: boolean;
  /** Lỗi CHẶN còn lại sau tất cả: không chặn việc lưu, nhưng phải hiện đỏ trên màn hình. */
  blocking: PlanIssue[];
  findings: PlanIssue[];
  /** Chỗ chương trình tự xử lý (suy tường, bỏ lỗ mở không còn tường). */
  notes: { code: string; message: string }[];
  repaired: boolean;
}

/**
 * Chốt và đúc artifact một phương án.
 *
 * `setHead: false` có chủ đích: ba phương án cùng loại `ai_floor_plan`, đặt head theo phương án
 * ghi xong sau cùng thì «bản đang hiệu lực» là kết quả của một cuộc chạy đua. Head do người
 * CHỌN (`POST /design/ai/plan/choose`).
 */
export async function writePlan(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  proposalJson: string,
  call: PlanCallRecord,
  repaired: boolean,
): Promise<WriteOutcome> {
  const final = finalisePlan({
    ...assembleInput(deps, params, variant, proposalJson, call, repaired),
    construction: deps.construction,
  });

  const artifact = await deps.repo.write({
    scope: scopeOf(params),
    kind: 'ai_floor_plan',
    payload: final.payload,
    inputs: [params.programRef],
    step: 'ai_plan_propose',
    params: {
      route: params.textRoute,
      prompt_version: deps.prompts.version,
      variant: variant.id,
      strategy: variant.strategy,
    },
    setHead: false,
  });

  return {
    variantId: variant.id,
    artifactId: artifact.id,
    reused: artifact.reused,
    wallsDerived: final.wallsDerived,
    blocking: final.check.blocking,
    findings: final.check.findings,
    notes: final.notes.map((note) => ({ code: note.code, message: note.message })),
    repaired,
  };
}

function contextFor(deps: PlanStepDeps, params: AiDesignParams, variant: PlanVariant): PlanContext {
  return planContext({
    digest: params.digest,
    program: params.program,
    variant,
    labels: deps.labels,
    construction: deps.construction,
    rules: deps.rules,
  });
}

function assembleInput(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  proposalJson: string,
  call: PlanCallRecord,
  repaired: boolean,
) {
  return {
    proposal: JSON.parse(proposalJson) as AiPlanProposal,
    context: contextFor(deps, params, variant),
    program: params.program,
    programRef: params.programRef,
    variant,
    call,
    route: params.textRoute,
    promptVersion: deps.prompts.version,
    repaired,
    doorExemptTypes: deps.doorExemptTypes,
  };
}

function scopeOf(params: AiDesignParams): AiCallScope {
  return {
    tenantId: params.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    discipline: params.discipline,
    actorId: params.actorId,
  };
}

async function logCall(
  deps: PlanStepDeps,
  scope: AiCallScope,
  params: AiDesignParams,
  repairing: boolean,
  outcome: Parameters<typeof recordAiCall>[3],
): Promise<void> {
  await recordAiCall(
    deps.repo.db,
    scope,
    {
      route: params.textRoute,
      // Hai việc khác nhau nên hai mã khác nhau: tỷ lệ phải sửa là con số cần đo của Đợt 3, và
      // gộp chung một mã thì không tính được nó.
      purpose: repairing ? 'plan_repair' : 'plan',
      dataClass: AI_DIGEST_DATA_CLASS,
      promptVersion: deps.prompts.version,
    },
    outcome,
    deps.pricing,
  );
}
