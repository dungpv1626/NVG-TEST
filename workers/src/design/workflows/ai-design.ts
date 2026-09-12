/**
 * Cloudflare Workflow của nhánh AI — một instance cho MỘT giai đoạn.
 *
 * Vì sao một instance một giai đoạn chứ không phải một instance cho cả bốn bước: kiến trúc sư
 * DUYỆT giữa các bước (T16, T18). Một instance chạy suốt sẽ phải ngủ chờ người bấm, và trong
 * lúc ngủ thì không ai biết nó đang chờ cái gì; còn chọn phương án mặt bằng nào là quyết định
 * của người, không phải của mã (PRD 2.3).
 *
 * Vì sao chạy nền thay vì đồng bộ như bước chương trình không gian: ba phương án × một lượt gọi
 * 1,5–3 phút. Giữ một kết nối HTTP mở chừng đó là cách chắc chắn để gặp hết giờ ở tầng mạng, và
 * mất kết quả của những lượt gọi ĐÃ TÍNH TIỀN.
 *
 * ⚠️ Tệp này import `cloudflare:workers` nên CHỈ nạp được trong runtime Workers. Phần nghiệp vụ
 * kiểm thử được nằm ở `ai-design-steps.ts`.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { userFacing } from '../llm/provider-faults';
import { LlmCallFailed } from '../llm/gemini';
import { ArtifactRepository } from '../artifacts';
import type { DesignEnv } from '../env';
import { constructionNorms } from '../kb/construction-data';
import { siteContextTable } from '../kb/site-context-data';
import { roomGroups } from '../kb/vocabulary';
import { roomVocabulary } from '../kb/vocabulary-data';
import { roomLabels } from '../auth-scope';
import { modelRouter, textClientFor } from '../llm/factory';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { aiPrompts } from '../ai/prompts-data';
import { selectedRulePack } from '../ai/rule-packs';
import { finishRun, markStep } from '../ai/runs';
import {
  checkPlanProposal,
  planStepId,
  proposePlan,
  writePlan,
  type AiDesignParams,
  type CheckOutcome,
  type PlanStepDeps,
  type ProposeOutcome,
  type WriteOutcome,
} from './ai-design-steps';
import { keepRepaired, type PlanVariant } from '../ai/plan';

/**
 * Chính sách thử lại của bước GỌI MÔ HÌNH — khai tường minh vì mặc định tốn tiền.
 *
 * Mặc định của Cloudflare Workflows là thử lại nhiều lần với giãn cách tăng dần. Với một bước chỉ
 * đọc/ghi CSDL thì đó là mặc định đúng; với một bước gọi mô hình thì mỗi lần thử là 0,15–0,30 USD,
 * và một nhà cung cấp đang chập chờn sẽ tính tiền đủ số lần ấy.
 *
 * Một lần thử lại là mức vừa: sự cố thật sự thoáng qua (rớt mạng, 5xx) thường qua ngay lần sau,
 * còn lỗi thật thì thử thêm cũng không đổi. Cộng với đúng một lượt sửa của chính nghiệp vụ, trần
 * chi phí một phương án là bốn lượt — và trần ấy phải là con số đọc được ở đây, không phải hệ quả
 * của một mặc định nền tảng.
 */
const MODEL_STEP = {
  retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' },
  // 12 phút, không 10: hạn chờ một lời gọi văn bản là 300 giây (`llm/openai.ts`), nên trần thật
  // của bước là 300 + 10 (giãn cách) + 300 = 610 giây. Để 10 phút thì lượt thử lại bị bước cắt
  // ngang ở giây 600 — và cắt ở đó là mất luôn kết quả của một lượt ĐÃ TÍNH TIỀN. Hai con số này
  // ràng buộc nhau; đổi một bên thì phải tính lại bên kia.
  timeout: '12 minutes',
} as const;

/**
 * Lỗi nhà cung cấp KHÔNG đáng thử lại thì phải nói ra ngay trong bước.
 *
 * `LlmCallFailed.retryable === false` là những thứ thử lại chắc chắn hỏng y hệt: sai khoá, sai
 * tham số, vượt hạn mức tài khoản. Để Workflow tự thử lại là mua thêm một lượt để nhận lại đúng
 * câu trả lời ấy. Phép đổi phải nằm TRONG hàm truyền cho `step.do` — đặt ngoài thì Workflow không
 * nhìn thấy.
 */
async function once<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LlmCallFailed && error.retryable === false) {
      // Câu cho NGƯỜI ĐỌC, không phải nguyên văn nhà cung cấp: câu kia là tiếng Anh, mang mã
      // HTTP và một khối JSON — CGD 4.4 cấm đưa những thứ đó lên màn hình. Nguyên văn vẫn nằm
      // trong nhật ký Workflow và trong `design_ai_call`.
      throw new NonRetryableError(userFacing(error));
    }
    throw error;
  }
}

export class AiDesignPipeline extends WorkflowEntrypoint<DesignEnv, AiDesignParams> {
  override async run(event: WorkflowEvent<AiDesignParams>, step: WorkflowStep) {
    const params = event.payload;
    const repo = new ArtifactRepository(this.env);

    const client = textClientFor(this.env, params.textRoute);
    if (!client) {
      // Khoá biến mất giữa lúc khởi động và lúc Workflow nhận việc: thử lại không đổi được gì.
      const message = 'Chưa cấu hình khoá API cho model đã chọn.';
      await finishRun(repo.db, params.runId, { status: 'failed', error: message });
      throw new NonRetryableError(message);
    }

    const router = modelRouter(this.env);
    const publicRoute = router.publicRoutes().find((route) => route.route === params.textRoute);
    const deps: PlanStepDeps = {
      client,
      prompts: aiPrompts(),
      labels: roomLabels(),
      construction: constructionNorms(),
      siteContext: siteContextTable(),
      rules: selectedRulePack(params.rulePacks, {
        standards: nationalRulePack(),
        experience: nvgExperiencePack(),
      }),
      doorExemptTypes: new Set(roomGroups(roomVocabulary().vocabulary).no_door_required ?? []),
      verticalTypes: new Set(roomGroups(roomVocabulary().vocabulary).circulation ?? []),
      outdoorTypes: new Set(roomGroups(roomVocabulary().vocabulary).outdoor ?? []),
      repo,
      pricing: publicRoute?.pricing,
      provider: router.providerOf(params.textRoute) ?? 'unknown',
      model: publicRoute?.model ?? 'unknown',
    };

    if (params.stage !== 'plan') {
      const message = `Giai đoạn "${params.stage}" chưa mở.`;
      await finishRun(repo.db, params.runId, { status: 'failed', error: message });
      throw new NonRetryableError(message);
    }

    // Ba phương án chạy SONG SONG: mỗi phương án là một lượt gọi độc lập, và chờ tuần tự thì
    // người dùng chờ gấp ba. `allSettled` vì một phương án hỏng không được giết hai phương án
    // kia — hai bản vẽ dùng được vẫn hơn không có gì.
    const settled = await Promise.allSettled(
      params.variants.map((variant) => this.runVariant(step, deps, params, variant)),
    );

    const plans: WriteOutcome[] = [];
    const failed: { variantId: string; error: string }[] = [];
    params.variants.forEach((variant, index) => {
      const outcome = settled[index];
      if (outcome?.status === 'fulfilled') plans.push(outcome.value);
      else {
        failed.push({
          variantId: variant.id,
          error: userFacing(outcome?.reason),
        });
      }
    });

    const result = { plans, failed };
    await finishRun(repo.db, params.runId, {
      // Không phương án nào xếp được thì lượt chạy là HỎNG, dù từng bước đã chạy hết: màn hình
      // phải nói thất bại, không phải «xong» với danh sách rỗng.
      status: plans.length ? 'done' : 'failed',
      result,
      error: plans.length
        ? null
        : (failed[0]?.error ?? 'Không phương án nào xếp được mặt bằng dùng được.'),
      partial: { plans },
    });
    return result;
  }

  /**
   * Một phương án: đề xuất → kiểm → (sửa → kiểm lại) → lưu.
   *
   * Mỗi lượt gọi mô hình là một `step.do` riêng nên Workflow thử lại không bao giờ mua lại thứ
   * đã mua. Tên bước mang mã phương án để đọc nhật ký biết ngay phương án nào hỏng.
   */
  private async runVariant(
    step: WorkflowStep,
    deps: PlanStepDeps,
    params: AiDesignParams,
    variant: PlanVariant,
  ): Promise<WriteOutcome> {
    const db = deps.repo.db;
    const runId = params.runId;

    await markStep(db, runId, planStepId(variant.id, 'propose'), 'running');
    let proposal = (await step.do(planStepId(variant.id, 'propose'), MODEL_STEP, () =>
      once(() => proposePlan(deps, params, variant)),
    )) as ProposeOutcome;
    await markStep(db, runId, planStepId(variant.id, 'propose'), 'done');

    let repaired = false;
    let issues = proposal.issues;
    if (proposal.proposalJson) {
      await markStep(db, runId, planStepId(variant.id, 'check'), 'running');
      const check = (await step.do(planStepId(variant.id, 'check'), async () =>
        checkPlanProposal(deps, params, variant, proposal.proposalJson!, proposal.call, false),
      )) as CheckOutcome;
      await markStep(db, runId, planStepId(variant.id, 'check'), 'done');
      issues = check.blocking;
    }

    if (issues.length) {
      const repairId = planStepId(variant.id, 'repair');
      await markStep(db, runId, repairId, 'running', {
        label: `Sửa phương án ${variant.id}`,
      });
      const second = (await step.do(repairId, MODEL_STEP, () =>
        once(() =>
          proposePlan(deps, params, variant, {
            // Bản cũ có thể KHÔNG có (lượt đầu sai cấu trúc), nhưng danh sách lỗi thì luôn có —
            // và đó mới là thứ làm lượt này khác lượt trước.
            proposalJson: proposal.proposalJson,
            issues,
          }),
        ),
      )) as ProposeOutcome;
      await markStep(db, runId, repairId, 'done');

      if (second.proposalJson) {
        // Giữ bản TỐT HƠN, không mặc định giữ bản mới: một lượt sửa có thể làm bản vẽ tệ đi, và
        // lúc ấy bản cũ mới là thứ đáng lưu. So bằng số lỗi CHẶN còn lại; bằng nhau thì chọn bản
        // đã sửa vì nó được yêu cầu sửa đúng những chỗ đã nêu.
        const recheckId = `plan:${variant.id}:recheck`;
        await markStep(db, runId, recheckId, 'running', {
          label: `Kiểm lại phương án ${variant.id}`,
        });
        const recheck = (await step.do(recheckId, async () =>
          checkPlanProposal(deps, params, variant, second.proposalJson!, second.call, true),
        )) as CheckOutcome;
        await markStep(db, runId, recheckId, 'done');

        const before = proposal.proposalJson ? issues.length : Number.POSITIVE_INFINITY;
        if (keepRepaired(before, recheck.blocking.length)) {
          proposal = second;
          repaired = true;
        }
      }
      if (!proposal.proposalJson) {
        throw new NonRetryableError(
          `Phương án ${variant.id}: mô hình không trả về cấu trúc đọc được sau hai lượt.`,
        );
      }
    }

    await markStep(db, runId, planStepId(variant.id, 'write'), 'running');
    const written = (await step.do(planStepId(variant.id, 'write'), () =>
      writePlan(deps, params, variant, proposal.proposalJson!, proposal.call, repaired),
    )) as WriteOutcome;
    await markStep(db, runId, planStepId(variant.id, 'write'), 'done', {
      // Phương án xong nào hiện ngay phương án đó: ba lượt gọi song song nhưng không kết thúc
      // cùng lúc, và chờ cả ba mới hiện là giấu kết quả đã có.
      partial: { [variant.id]: written.artifactId },
    });
    return written;
  }
}
