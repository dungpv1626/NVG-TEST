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
import { createArtifactStore } from '../artifact-store';
import type { DesignEnv } from '../env';
import { constructionNorms } from '../kb/construction-data';
import { siteContextTable } from '../kb/site-context-data';
import { areaNorms } from '../kb/space-norms-data';
import { planQuality } from '../ai/plan-quality-data';
import { mergeAllowed, passageRules, roomGroups, zoneDefaults } from '../kb/vocabulary';
import { briefFidelity } from '../kb/brief-fidelity-data';
import { roomVocabulary } from '../kb/vocabulary-data';
import { roomLabels } from '../auth-scope';
import { modelRouter, textClientFor } from '../llm/factory';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { aiPrompts } from '../ai/prompts-data';
import { selectedRulePack } from '../ai/rule-packs';
import { finishRun, markStep, RUN_CANCELLED, runCancelled, writeRunPartial } from '../ai/runs';
import { LivePlanBoard } from '../ai/live-plan';
import type { CallProgress } from '../llm/text-client';
import {
  applyEditStep,
  arrangeHouseStep,
  editStepId,
  houseStepId,
  proposeEdit,
  type EditApplyOutcome,
  type EditCallOutcome,
  houseStepLabel,
  proposeHouse,
  writePlan,
  writeStepId,
  type AiDesignParams,
  keepBest,
  type ArrangeOutcome,
  type BestArranged,
  type HousePhase,
  type PlanStepDeps,
  type ProposeOutcome,
  type LevelLiveHooks,
  type WriteOutcome,
  type WriteResult,
} from './ai-design-steps';
import {
  AiPlanRejected,
  finalRejections,
  HOUSE_REVISIONS_MAX,
  type LevelRejection,
  type PlanCallRecord,
  type PlanVariant,
} from '../ai/plan';
import { roomVocabulary as vocabularyIndex } from '../kb/vocabulary-data';
import { facadeVocabulary } from '../kb/facade-vocabulary-data';
import {
  FACADE_CALLS_MAX,
  facadeStepId,
  facadeStepLabel,
  proposeFacadeStep,
  writeFacadeStep,
  type FacadeProposeOutcome,
  type FacadeStepDeps,
  type FacadeWriteOutcome,
} from './ai-facade-steps';

/** Lượt sửa theo yêu cầu kỹ sư gọi mô hình tối đa bấy nhiêu lần: một lần, cộng một lần kèm lý do cổng. */
const EDIT_CALLS_MAX = 4;

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
/** Nhịp ghi bảng theo dõi trực tiếp và đọc nút «Dừng» — khớp nhịp hỏi của màn hình. */
const LIVE_TICK_MS = 2_000;

const MODEL_STEP = {
  // Một lần thử lại cho sự cố thật sự thoáng qua (rớt mạng, 5xx). Hết giờ phía ta thì client đã tự
  // không thử lại (`provider-faults.ts`) — thử lại cũng hết giờ y vậy, mà nhà cung cấp vẫn tính tiền.
  //
  // Trả lại từ mức ĐẶT TẠM 0 của lượt đo 13/09/2026. Lý do trả lại được: lượt gọi nay là MỘT TẦNG,
  // trả về một cây vài trăm token, dưới trần 16.000 của tuyến — nên một lần thử lại tốn tối đa
  // khoảng 0,16 USD, còn một lần rớt mạng mà giết cả phương án nhiều tầng là bỏ đi N lượt đã trả.
  retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' },
  // Hạn của bước phải LỚN HƠN tổng mọi lần thử của lời gọi, nếu không bước cắt ngang một lượt
  // ĐÃ TÍNH TIỀN. Có phép thử canh quan hệ này, không canh con số.
  // ⚠️ TẠM ĐO 13/09/2026 — Haan: «bỏ trần giới hạn thời gian». Các tuyến văn bản đặt
  // `request_timeout_s: 0` nên lời gọi không tự huỷ; bước Workflow BẮT BUỘC có hạn, nên đặt
  // rộng. Trả về '22 minutes' cùng lúc trả `request_timeout_s` trong config/models.yaml.
  timeout: '120 minutes',
} as const;

/**
 * Lỗi nhà cung cấp KHÔNG đáng thử lại thì phải nói ra ngay trong bước.
 *
 * `LlmCallFailed.retryable === false` là những thứ thử lại chắc chắn hỏng y hệt: sai khoá, sai
 * tham số, vượt hạn mức tài khoản. Để Workflow tự thử lại là mua thêm một lượt để nhận lại đúng
 * câu trả lời ấy. Phép đổi phải nằm TRONG hàm truyền cho `step.do` — đặt ngoài thì Workflow không
 * nhìn thấy.
 */
async function once<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  // Kỹ sư đã bấm «Dừng»: không mở lượt gọi mới, và lượt vừa bị huỷ KHÔNG được Workflow thử lại.
  if (signal?.aborted) throw new NonRetryableError(RUN_CANCELLED);
  try {
    return await work();
  } catch (error) {
    if (signal?.aborted) throw new NonRetryableError(RUN_CANCELLED);
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
    const groups = roomGroups(roomVocabulary().vocabulary);
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
      groups: {
        outdoor: new Set(groups.outdoor ?? []),
        vertical: new Set(groups.circulation ?? []),
        noDoorRequired: new Set(groups.no_door_required ?? []),
        habitable: new Set(groups.habitable ?? []),
        doorHosts: groups.door_hosts ?? [],
        passage: passageRules(roomVocabulary().vocabulary),
      },
      mergeAllowed: mergeAllowed(roomVocabulary().vocabulary),
      vocabulary: vocabularyIndex(),
      fidelity: briefFidelity(),
      quality: planQuality(),
      // Bộ chấm LUÔN đọc gói kinh nghiệm + đo được, KHÔNG phụ thuộc ô tích của kỹ sư: hình dáng
      // phòng không phải thứ bật tắt bằng ô tích. Ô tích chỉ quyết định có tiêm vào lời dẫn và có
      // hiện thành cảnh báo hay không — xem phần đầu `kb/plan_quality.yaml`.
      scoreRules: nvgExperiencePack(),
      areaNorms: areaNorms(),
      roomGroups: groups,
      zoneDefaults: zoneDefaults(roomVocabulary().vocabulary),
      stairTypes: briefFidelity().stairTypes,
      repo,
      pricing: publicRoute?.pricing,
      provider: router.providerOf(params.textRoute) ?? 'unknown',
      model: publicRoute?.model ?? 'unknown',
      promptStore: createArtifactStore(this.env),
    };

    if (params.stage === 'facade') {
      return this.runFacade(step, params, {
        client,
        prompts: deps.prompts,
        construction: deps.construction,
        outdoor: deps.groups.outdoor,
        vocab: facadeVocabulary(),
        repo,
        ...(publicRoute?.pricing ? { pricing: publicRoute.pricing } : {}),
        provider: deps.provider,
        model: deps.model,
        ...(deps.promptStore ? { promptStore: deps.promptStore } : {}),
      });
    }
    if (params.stage !== 'plan') {
      const message = `Giai đoạn "${params.stage}" chưa mở.`;
      await finishRun(repo.db, params.runId, { status: 'failed', error: message });
      throw new NonRetryableError(message);
    }

    const { board, stop } = this.startLive(params, repo);
    // Ba phương án chạy SONG SONG: mỗi phương án là một lượt gọi độc lập, và chờ tuần tự thì
    // người dùng chờ gấp ba. `allSettled` vì một phương án hỏng không được giết hai phương án
    // kia — hai bản vẽ dùng được vẫn hơn không có gì.
    let settled: PromiseSettledResult<WriteOutcome>[];
    try {
      settled = await Promise.allSettled(
        params.variants.map((variant) =>
          params.edit
            ? this.runEdit(step, deps, params, variant, board)
            : this.runVariant(step, deps, params, variant, board),
        ),
      );
    } finally {
      stop();
    }
    if (board.signal.aborted) {
      await finishRun(repo.db, params.runId, {
        status: 'failed',
        error: RUN_CANCELLED,
        partial: { live: board.snapshot() },
      });
      return { plans: [], failed: [] };
    }

    const plans: WriteOutcome[] = [];
    const failed: { variantId: string; error: string; reasons: LevelRejection[] }[] = [];
    params.variants.forEach((variant, index) => {
      const outcome = settled[index];
      if (outcome?.status === 'fulfilled') plans.push(outcome.value);
      else {
        const reason = outcome?.reason;
        failed.push({
          variantId: variant.id,
          error: reason instanceof AiPlanRejected ? reason.message : userFacing(reason),
          reasons: reason instanceof AiPlanRejected ? reason.levels : [],
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
      partial: { plans, live: board.snapshot() },
    });
    return result;
  }

  /**
   * Bảng theo dõi trực tiếp + nút «Dừng» (13/09/2026). Một vòng 2 giây ghi bảng xuống dòng lượt chạy và
   * đọc xem kỹ sư đã bấm «Dừng» chưa; bấm rồi thì huỷ mọi lời gọi đang bay. Dùng chung cho mặt bằng và
   * mặt đứng (T59).
   */
  private startLive(
    params: AiDesignParams,
    repo: ArtifactRepository,
  ): { board: LivePlanBoard; stop: () => void } {
    const router = modelRouter(this.env);
    const publicRoute = router.publicRoutes().find((route) => route.route === params.textRoute);
    const board = new LivePlanBoard(
      {
        model: publicRoute?.model ?? params.textRoute,
        route: params.textRoute,
        effort: params.reasoningEffort ?? null,
      },
      publicRoute?.pricing,
      router.isBilled(router.providerOf(params.textRoute) ?? ''),
    );
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (!board.signal.aborted && (await runCancelled(repo.db, params.runId))) board.cancel();
        await writeRunPartial(repo.db, params.runId, 'live', board.snapshot());
      } catch {
        // Theo dõi hỏng không được làm hỏng lượt chạy.
      } finally {
        ticking = false;
      }
    };
    const timer = setInterval(() => void tick(), LIVE_TICK_MS);
    return { board, stop: () => clearInterval(timer) };
  }

  /**
   * Ý tưởng mặt đứng (T59): AI đề xuất → chương trình kiểm → (AI sửa kèm lý do) → ghép khung KHOÁ và
   * lưu. Tối đa `FACADE_CALLS_MAX` lượt gọi. Hết lượt mà vẫn hỏng thì KHÔNG đúc artifact.
   */
  private async runFacade(step: WorkflowStep, params: AiDesignParams, deps: FacadeStepDeps) {
    const db = deps.repo.db;
    const { board, stop } = this.startLive(params, deps.repo);
    let issues: string[] = [];
    try {
      for (let round = 1; round <= FACADE_CALLS_MAX; round += 1) {
        if (board.signal.aborted) throw new NonRetryableError(RUN_CANCELLED);
        const id = facadeStepId('propose', round);
        const label = facadeStepLabel(round);
        await markStep(db, params.runId, id, 'running', { label });
        const hooks = (): LevelLiveHooks => {
          board.begin(id, label);
          return {
            onProgress: (progress: CallProgress) => board.progress(id, progress),
            signal: board.signal,
            onLogged: (logged) => board.finish(id, logged),
          };
        };
        const retry = round > 1 ? issues : null;
        const proposal = (await step.do(id, MODEL_STEP, () =>
          once(
            () =>
              proposeFacadeStep(deps, params, round, retry, hooks()).finally(() => board.drop(id)),
            board.signal,
          ),
        )) as FacadeProposeOutcome;

        if (proposal.proposalJson) {
          await markStep(db, params.runId, id, 'done');
          const writeId = facadeStepId('write');
          await markStep(db, params.runId, writeId, 'running');
          const written = (await step.do(writeId, () =>
            writeFacadeStep(deps, params, proposal.proposalJson!, proposal.call, round),
          )) as FacadeWriteOutcome;
          await markStep(db, params.runId, writeId, 'done');
          await finishRun(db, params.runId, {
            status: 'done',
            result: written,
            partial: { live: board.snapshot() },
          });
          return written;
        }
        await markStep(db, params.runId, id, 'failed');
        issues = proposal.issues;
      }
    } catch (error) {
      const cancelled = board.signal.aborted;
      await finishRun(db, params.runId, {
        status: 'failed',
        error: cancelled ? RUN_CANCELLED : userFacing(error),
        partial: { live: board.snapshot() },
      });
      if (cancelled) return null;
      throw error;
    } finally {
      stop();
    }

    // Hết lượt mà ý tưởng vẫn không dùng được: lượt chạy HỎNG kèm lý do nguyên văn phép kiểm.
    await finishRun(db, params.runId, {
      status: 'failed',
      error: `AI chưa đưa ra được ý tưởng mặt đứng dùng được sau ${FACADE_CALLS_MAX} lượt. ${issues.slice(0, 3).join(' ')}`,
      result: { issues },
      partial: { live: board.snapshot() },
    });
    return null;
  }

  /**
   * Một phương án: AI khai cả nhà → chương trình kiểm và xếp → (AI sửa → xếp lại) tối đa ba lần → lưu
   * (T45).
   *
   * Mỗi lượt gọi mô hình là một `step.do` riêng nên Workflow thử lại không bao giờ mua lại thứ đã
   * mua. Sau lượt sửa thứ ba vẫn không xếp được thì phương án dừng với lý do, KHÔNG đúc artifact:
   * không lưu và không vẽ một mặt bằng mà chương trình đã biết là hỏng.
   */
  private async runVariant(
    step: WorkflowStep,
    deps: PlanStepDeps,
    params: AiDesignParams,
    variant: PlanVariant,
    board: LivePlanBoard,
    /** Lượt sửa bố cục theo yêu cầu kỹ sư (T53): lượt 1 đã là `revise` của ý định lưu trong artifact. */
    seed: { hints: string[]; previousJson: string } | null = null,
  ): Promise<WriteOutcome> {
    const db = deps.repo.db;
    const runId = params.runId;
    const calls: PlanCallRecord[] = [];
    const failedLevels = new Set<number>();
    let first: LevelRejection[] | null = null;
    let previous: ArrangeOutcome | null = seed
      ? {
          arrangedJson: null,
          rejections: [],
          hints: seed.hints,
          previousJson: seed.previousJson,
          retry: 'revise',
          score: null,
        }
      : null;
    let best: BestArranged | null = null;

    for (let round = 1; ; round += 1) {
      const id = (phase: HousePhase) => houseStepId(variant.id, phase, round);
      const label = (phase: HousePhase) => houseStepLabel(variant.id, phase, round);
      if (board.signal.aborted) throw new NonRetryableError(RUN_CANCELLED);

      await markStep(db, runId, id('propose'), 'running', { label: label('propose') });
      const hooks = (): LevelLiveHooks => {
        board.begin(id('propose'), label('propose'));
        return {
          onProgress: (progress: CallProgress) => board.progress(id('propose'), progress),
          signal: board.signal,
          onLogged: (logged) => board.finish(id('propose'), logged),
        };
      };
      const retry = previous;
      const proposal = (await step.do(id('propose'), MODEL_STEP, () =>
        once(
          () =>
            proposeHouse(
              deps,
              params,
              variant,
              round,
              retry?.hints,
              retry?.previousJson ?? null,
              hooks(),
            ).finally(() => board.drop(id('propose'))),
          board.signal,
        ),
      )) as ProposeOutcome;
      calls.push(proposal.call);
      await markStep(db, runId, id('propose'), 'done');

      await markStep(db, runId, id('arrange'), 'running', { label: label('arrange') });
      const arranged = (await step.do(id('arrange'), async () =>
        arrangeHouseStep(deps, params, variant, proposal, round),
      )) as ArrangeOutcome;

      if (arranged.arrangedJson) {
        await markStep(db, runId, id('arrange'), 'done');
        const percent = arranged.score?.percent ?? null;
        // Giữ phương án điểm cao nhất đã xếp được (T53): lượt sửa vì điểm có thể ra bản kém hơn.
        best = keepBest(best, {
          arrangedJson: arranged.arrangedJson,
          call: proposal.call,
          percent,
          failedLevels: [...failedLevels],
        });
        // Đạt ngưỡng, hết lượt sửa, hoặc không có dòng nào để gửi mô hình → ghi bản tốt nhất.
        if (arranged.retry === 'none' || round > HOUSE_REVISIONS_MAX) {
          return this.writeBest(step, deps, params, variant, best, calls.length);
        }
        previous = arranged;
        continue;
      }

      await markStep(db, runId, id('arrange'), 'failed');
      for (const rejection of arranged.rejections) {
        if (rejection.level > 0) failedLevels.add(rejection.level);
      }
      first ??= arranged.rejections;
      // Chỉ còn lỗi hình học (`retry: 'none'`): bộ dựng hình đã thử hết cách, mô hình không sửa được.
      if (round > HOUSE_REVISIONS_MAX || arranged.retry === 'none') {
        // Một lượt TRƯỚC đã xếp được (dưới ngưỡng), lượt sửa vì điểm thì hỏng: lưu bản đã có.
        if (best) return this.writeBest(step, deps, params, variant, best, calls.length);
        throw new AiPlanRejected(
          finalRejections(arranged.rejections, first, arranged.retry, calls.length),
        );
      }
      previous = arranged;
    }
  }

  /**
   * Sửa theo yêu cầu kỹ sư (T53): AI dịch yêu cầu thành thao tác → chương trình áp lên bản đã lưu và
   * ghi. Thao tác không qua cổng thì gọi lại kèm lý do, tổng tối đa `EDIT_CALLS_MAX` lượt (Haan 17/09/2026: «sửa đến lần thứ 4»); yêu cầu cần xếp lại bố cục thì đi
   * đường `revise` của lượt thường với ý định lưu trong artifact.
   */
  private async runEdit(
    step: WorkflowStep,
    deps: PlanStepDeps,
    params: AiDesignParams,
    variant: PlanVariant,
    board: LivePlanBoard,
  ): Promise<WriteOutcome> {
    const db = deps.repo.db;
    const runId = params.runId;
    let retry: { opsJson: string; issues: string[] } | null = null;
    for (let n = 1; n <= EDIT_CALLS_MAX; n += 1) {
      if (board.signal.aborted) throw new NonRetryableError(RUN_CANCELLED);
      const callId = editStepId('call', n);
      const callLabel = n === 1 ? 'AI đọc yêu cầu sửa' : 'AI sửa lại thao tác';
      await markStep(db, runId, callId, 'running', { label: callLabel });
      const hooks = (): LevelLiveHooks => {
        board.begin(callId, callLabel);
        return {
          onProgress: (progress: CallProgress) => board.progress(callId, progress),
          signal: board.signal,
          onLogged: (logged) => board.finish(callId, logged),
        };
      };
      const currentRetry = retry;
      const proposal = (await step.do(callId, MODEL_STEP, () =>
        once(
          () => proposeEdit(deps, params, currentRetry, hooks()).finally(() => board.drop(callId)),
          board.signal,
        ),
      )) as EditCallOutcome;
      await markStep(db, runId, callId, 'done');

      const applyId = editStepId('apply', n);
      await markStep(db, runId, applyId, 'running', {
        label: 'Áp thao tác lên bản vẽ và chấm lại',
      });
      const outcome = (await step.do(applyId, () =>
        applyEditStep(deps, params, variant, proposal),
      )) as EditApplyOutcome;
      if ('written' in outcome) {
        await markStep(db, runId, applyId, 'done', {
          partial: { [variant.id]: outcome.written.artifactId },
        });
        return outcome.written;
      }
      if ('relayout' in outcome) {
        await markStep(db, runId, applyId, 'done');
        return this.runVariant(step, deps, params, variant, board, {
          hints: [`- The architect asks for this change: ${outcome.relayout}`],
          previousJson: outcome.previousJson,
        });
      }
      await markStep(db, runId, applyId, 'failed');
      // Thao tác đọc được mà không qua cổng: gọi lại kèm lý do tới hết `EDIT_CALLS_MAX`. Câu trả lời không đọc được thành
      // thao tác nào thì gọi lại cũng chỉ mua lại đúng câu ấy — dừng.
      if (n >= EDIT_CALLS_MAX || !outcome.opsJson) {
        throw new AiPlanRejected([{ level: 0, messages: outcome.rejected }]);
      }
      retry = { opsJson: outcome.opsJson, issues: outcome.rejected };
    }
    throw new AiPlanRejected([{ level: 0, messages: ['Không áp được yêu cầu sửa.'] }]);
  }

  /** Ghi phương án điểm cao nhất của một phương án — đúng một bước ghi mỗi phương án. */
  private async writeBest(
    step: WorkflowStep,
    deps: PlanStepDeps,
    params: AiDesignParams,
    variant: PlanVariant,
    best: BestArranged,
    attempts: number,
  ): Promise<WriteOutcome> {
    const db = deps.repo.db;
    const writeId = writeStepId(variant.id);
    await markStep(db, params.runId, writeId, 'running');
    const written = (await step.do(writeId, () =>
      writePlan(deps, params, variant, best.arrangedJson, best.call, best.failedLevels, attempts),
    )) as WriteResult;
    if ('rejected' in written) {
      await markStep(db, params.runId, writeId, 'failed');
      throw new AiPlanRejected([{ level: 0, messages: written.rejected }]);
    }
    await markStep(db, params.runId, writeId, 'done', {
      // Phương án xong nào hiện ngay phương án đó: ba phương án không kết thúc cùng lúc, và chờ cả
      // ba mới hiện là giấu kết quả đã có.
      partial: { [variant.id]: written.written.artifactId },
    });
    return written.written;
  }
}
