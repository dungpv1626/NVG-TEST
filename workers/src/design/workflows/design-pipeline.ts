/**
 * Cloudflare Workflow điều phối pipeline thiết kế — khung xương Mốc 1.
 *
 * Nguồn: doc/design/02-architecture.md mục 2.5.
 *
 * Ba yêu cầu bắt buộc của tài liệu, và cách tệp này đáp ứng:
 *
 *  · **Chạy lại được từng phần.** Mỗi layer là một `step.do` riêng, và `fromStep` cho phép
 *    bắt đầu từ giữa: "chạy lại Layer 3, giữ nguyên Layer 1–2" là một lời gọi.
 *  · **Retry có phân biệt.** Lỗi mang cờ `retryable = false` (`ContractError`,
 *    `DataClassViolation`, `ModelNotConfigured`) được bọc thành `NonRetryableError` để
 *    Workflow dừng ngay. Gọi lại một mô hình đã sinh sai cấu trúc chỉ tốn tiền để nhận lại
 *    cùng loại sai.
 *  · **Idempotent.** Việc "đã có kết quả thì trả về luôn" nằm ở `ArtifactRepository`
 *    (`findComputed` + khoá chính là mã băm), không lặp lại ở đây.
 *
 * ⚠️ Tệp này import `cloudflare:workers` nên CHỈ nạp được trong runtime Workers. Phần nghiệp
 * vụ kiểm thử được nằm ở `steps.ts`.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { ArtifactDiscipline, DesignBrief, PipelineStep } from '@nvg/shared/design';
import { ArtifactRepository, type ArtifactScope, type WrittenArtifact } from '../artifacts';
import { gateLayer2, readCompletenessThreshold } from '../brief/gate';
import { createComputeBackend } from '../compute-backend';
import type { DesignEnv } from '../env';
import { runLayer2 } from '../program/run';
import { buildArchModel, layoutIntent, solveFloorPlan, stubRenderResult } from './steps';
import { spaceLabels } from '../layout/labels';
import { siteFaces } from '../layout/site-context';
import { siteContextTable } from '../layout/site-context-data';
import { roomVocabulary } from '../kb/vocabulary-data';
import { roomGroups } from '../kb/vocabulary';

export interface DesignPipelineParams {
  tenantId: string;
  companyId: string;
  projectId: string;
  discipline: ArtifactDiscipline;
  actorId: string | null;
  /** Đầu bài đã kiểm hợp đồng — bước Layer 1 nhận đầu vào từ giao diện, không tự sinh. */
  brief: unknown;
  locality: string;
  timeBudgetS: number;
  /** Bắt đầu lại từ bước này, giữ nguyên các bước trước. Rỗng = chạy từ đầu. */
  fromStep?: PipelineStep;
}

const ORDER: PipelineStep[] = [
  'layer1_brief',
  'layer2_program',
  'layer3a_intent',
  'layer3b_solve',
  'layer4_arch',
  'layer5_render',
];

export class DesignPipeline extends WorkflowEntrypoint<DesignEnv, DesignPipelineParams> {
  override async run(event: WorkflowEvent<DesignPipelineParams>, step: WorkflowStep) {
    const p = event.payload;
    const scope: ArtifactScope = {
      tenantId: p.tenantId,
      companyId: p.companyId,
      projectId: p.projectId,
      discipline: p.discipline,
      actorId: p.actorId,
    };

    const repo = new ArtifactRepository(this.env);
    const compute = createComputeBackend(this.env);
    const startAt = p.fromStep ? ORDER.indexOf(p.fromStep) : 0;
    const runs = (s: PipelineStep) => ORDER.indexOf(s) >= startAt;

    // Layer 1 — đầu bài. Đây là bước duy nhất nhận dữ liệu từ ngoài vào; các bước sau chỉ đọc
    // artifact đang hiệu lực, không nhận tham số rời (nguyên tắc "hàm thuần" của 2.3).
    const brief = await guard(step, 'layer1_brief', runs('layer1_brief'), () =>
      repo.write({ scope, kind: 'design_brief', payload: p.brief }),
    );
    const briefId = brief?.id ?? (await requireHead(repo, scope, 'design_brief'));

    // Cảnh báo của Lớp 2 không có chỗ trong hợp đồng `SpaceProgram` (nó mô tả chương trình
    // không gian, không mô tả quá trình soạn ra nó) nên đi theo kết quả chạy, cùng khuôn với
    // `inferredLabels` của Workflow số hoá.
    let layer2Notes: string[] = [];
    let layer2Unresolved: string[] = [];

    const program = await guard(step, 'layer2_program', runs('layer2_program'), async () => {
      const head = await repo.head(p.projectId, p.discipline, 'design_brief');
      if (!head) throw new NonRetryableError('Chưa có đầu bài đang hiệu lực cho dự án này.');

      // Cổng chặn duy nhất của quy tắc "đầu bài chưa đủ thì không chạy Lớp 2"
      // (03-data-contracts 3.1). Đặt ở đây chứ không ở giao diện: giao diện ẩn nút là để
      // đỡ phiền, còn chỗ này mới là chỗ không vòng qua được.
      const gate = gateLayer2(head.payload, await readCompletenessThreshold(repo.db, p.tenantId));
      if (!gate.allowed) throw new NonRetryableError(gate.message);

      const run = await runLayer2(
        this.env,
        repo.db,
        head.payload as DesignBrief,
        briefId,
        p.tenantId,
      );
      layer2Notes = run.warnings;
      layer2Unresolved = run.unresolved;

      return repo.write({
        scope,
        kind: 'space_program',
        payload: run.payload,
        inputs: [briefId],
        step: 'layer2_program',
        params: run.params,
      });
    });
    const programId = program?.id ?? (await requireHead(repo, scope, 'space_program'));

    const intent = await guard(step, 'layer3a_intent', runs('layer3a_intent'), async () => {
      const head = await repo.head(p.projectId, p.discipline, 'space_program');
      const briefForIntent = await repo.head(p.projectId, p.discipline, 'design_brief');
      if (!head || !briefForIntent) {
        throw new NonRetryableError('Chưa có chương trình không gian.');
      }
      // Mặt thoáng quyết định CẤU TRÚC cây, không chỉ quyết định lúc kiểm: thửa bị bịt mặt
      // sau thì dải trong cùng phải có giếng trời ngay từ lúc sinh ý đồ, chứ không phải để
      // bộ giải báo vô nghiệm rồi mới biết.
      const faces = siteFaces(
        (briefForIntent.payload as DesignBrief).site as never,
        siteContextTable(),
      );
      const result = layoutIntent(head.payload as never, programId, { openFaces: faces.open });
      return repo.write({
        scope,
        kind: 'layout_intent',
        payload: result.payload,
        inputs: [programId],
        step: 'layer3a_intent',
        params: { stub: result.stub, variant: result.payload.variant_id },
      });
    });
    const intentId = intent?.id ?? (await requireHead(repo, scope, 'layout_intent'));

    // Layer 3b — bước duy nhất đã có bản THẬT (Container + OR-Tools CP-SAT, đo ở Mốc 0.2).
    const plan = await guard(step, 'layer3b_solve', runs('layer3b_solve'), async () => {
      const intentHead = await repo.head(p.projectId, p.discipline, 'layout_intent');
      const programHead = await repo.head(p.projectId, p.discipline, 'space_program');
      const briefHead = await repo.head(p.projectId, p.discipline, 'design_brief');
      if (!intentHead || !programHead || !briefHead) {
        throw new NonRetryableError('Thiếu artifact đầu vào cho bước giải ràng buộc.');
      }
      // Gửi phần `site` NGUYÊN VĂN: `solveFloorPlan` tự quy về ô chữ nhật xây được. Quy đổi
      // ở đây thì bước này có một bản quy đổi riêng, và Container nhận một mảnh đất khác
      // mảnh đất Lớp 2 đã soạn chương trình lên.
      const briefSite = (briefHead.payload as DesignBrief).site;
      const faces = siteFaces(briefSite as never, siteContextTable());
      const vi: Record<string, string> = {};
      for (const type of roomVocabulary().vocabulary.types) vi[type.code] = type.vi;

      const solved = await solveFloorPlan(compute, {
        intent: intentHead.payload as never,
        intentRef: intentId,
        program: programHead.payload as never,
        site: briefSite,
        locality: p.locality,
        timeBudgetS: p.timeBudgetS,
        openFaces: faces.open,
        accessFaces: faces.access,
        labels: spaceLabels(programHead.payload as never, vi),
        groups: roomGroups(roomVocabulary().vocabulary),
      });

      // Vô nghiệm KHÔNG phải lỗi: `InfeasibilityReport` là một artifact hạng nhất, quan trọng
      // ngang FloorPlan (03-data-contracts 3.5). Ghi lại rồi dừng — người dùng cần đọc được
      // vì sao, không phải nhận một thông báo "thất bại".
      return repo.write({
        scope,
        kind: solved.status === 'ok' ? 'floor_plan' : 'infeasibility_report',
        payload: solved.payload,
        inputs: [intentId],
        step: 'layer3b_solve',
        params: { locality: p.locality, timeBudgetS: p.timeBudgetS },
      });
    });

    if (plan?.kind === 'infeasibility_report') {
      return { status: 'infeasible' as const, artifactId: plan.id };
    }
    const planId = plan?.id ?? (await requireHead(repo, scope, 'floor_plan'));

    const arch = await guard(step, 'layer4_arch', runs('layer4_arch'), async () => {
      const head = await repo.head(p.projectId, p.discipline, 'floor_plan');
      if (!head) throw new NonRetryableError('Chưa có mặt bằng đang hiệu lực.');
      const result = buildArchModel(head.payload as never, planId);
      return repo.write({
        scope,
        kind: 'arch_model',
        payload: result.payload,
        inputs: [planId],
        step: 'layer4_arch',
        params: { stub: result.stub },
      });
    });
    const archId = arch?.id ?? (await requireHead(repo, scope, 'arch_model'));

    const render = await guard(step, 'layer5_render', runs('layer5_render'), async () => {
      const result = stubRenderResult();
      return repo.write({
        scope,
        kind: 'render_result',
        payload: result.payload,
        inputs: [archId],
        step: 'layer5_render',
        params: { stub: result.stub },
      });
    });

    return {
      status: 'ok' as const,
      notes: layer2Notes,
      unresolvedNeeds: layer2Unresolved,
      artifacts: {
        design_brief: briefId,
        space_program: programId,
        layout_intent: intentId,
        floor_plan: planId,
        arch_model: archId,
        render_result: render?.id ?? null,
      },
    };
  }
}

/**
 * Bọc một bước: bỏ qua nếu đang chạy lại từ giữa, và biến lỗi không đáng thử lại thành
 * `NonRetryableError` để Workflow không đốt bốn lần thử vào một lỗi cấu trúc.
 */
async function guard(
  step: WorkflowStep,
  name: PipelineStep,
  shouldRun: boolean,
  body: () => Promise<WrittenArtifact>,
): Promise<WrittenArtifact | null> {
  if (!shouldRun) return null;
  return step.do(
    name,
    { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
    async () => {
      try {
        return await body();
      } catch (error) {
        if (error instanceof Error && (error as { retryable?: boolean }).retryable === false) {
          throw new NonRetryableError(error.message);
        }
        throw error;
      }
    },
  );
}

async function requireHead(
  repo: ArtifactRepository,
  scope: ArtifactScope,
  kind: Parameters<ArtifactRepository['head']>[2],
): Promise<string> {
  const head = await repo.head(scope.projectId, scope.discipline, kind);
  if (!head) {
    throw new NonRetryableError(
      `Chạy lại từ giữa nhưng chưa có "${kind}" đang hiệu lực — chạy lại từ bước đầu.`,
    );
  }
  return head.id;
}
