/**
 * Sinh và liệt kê các PHƯƠNG ÁN mặt bằng của một dự án — đường chạy đồng bộ của Lớp 3.
 *
 * Vì sao không đi qua `DesignPipeline` (Cloudflare Workflow): bộ giải CP-SAT trả lời trong
 * mili-giây, còn Workflow là công cụ cho việc chạy nền dài có thử lại. Đặt một lời gọi vài
 * mili-giây sau một lớp điều phối bất đồng bộ là bắt màn hình phải thăm dò kết quả cho một
 * việc lẽ ra xong trước khi con trỏ chuột nhấc lên. Xem `doc/design/14-phuong-an-demo.md`
 * 14.6(a). Các HÀM BƯỚC (`steps.ts`) dùng chung với Workflow, nên hai đường chạy không lệch.
 *
 * Ba phương án khác nhau về CẤU TRÚC (`LAYOUT_VARIANTS`), không phải về vài con số — đó là
 * điều kiện để kiến trúc sư có thứ để chọn (04-layer3-floorplan 4.3).
 *
 * Mọi thứ ở đây là hàm thuần trên hai giao diện (`repo`, `compute`) để kiểm thử được bằng bản
 * giả dưới Node; tuyến Hono chỉ kiểm quyền rồi gọi vào.
 */

import type { DesignBrief, FloorPlan, LayoutIntent, SpaceProgram } from '@nvg/shared/design';
import type { ArtifactRepository, ArtifactScope } from '../artifacts';
import { ContractError } from '../contracts';
import type { ComputeBackend } from '../compute-backend';
import { LAYOUT_VARIANTS, type LayoutVariant } from './intent';
import { spaceLabels } from './labels';
import { siteFaces, type SiteContextTable } from './site-context';
import { layoutIntent, solveFloorPlan } from '../workflows/steps';
import { summariseFloorPlan, type FloorPlanSummary } from './summary';

/** Phần của kho artifact mà lớp này cần — thu hẹp để bản giả trong kiểm thử nhỏ. */
export type VariantRepo = Pick<
  ArtifactRepository,
  'head' | 'write' | 'findComputed' | 'get' | 'setHead' | 'edgesFrom' | 'lineage'
>;

export interface VariantContext {
  repo: VariantRepo;
  compute: ComputeBackend;
  scope: ArtifactScope;
  siteContext: SiteContextTable;
  /** Mã phòng → tên tiếng Việt (`kb/room_vocabulary.yaml`). */
  viByType: Record<string, string>;
  /** Nhóm mã phòng (`group_targets`) — gửi cho bộ giải và dùng để tóm tắt. */
  groups: Record<string, string[]>;
}

export interface VariantResult {
  variantId: string;
  label: string;
  intentArtifactId: string;
  artifactId: string;
  kind: 'floor_plan' | 'infeasibility_report';
  /** `true` nghĩa là cùng chương trình, cùng cấu hình — bộ giải không chạy lại. */
  reused: boolean;
  solveTimeMs: number;
}

export interface GenerateOutcome {
  programArtifactId: string;
  headArtifactId: string | null;
  results: VariantResult[];
}

export class VariantsPrerequisiteMissing extends Error {
  readonly retryable = false;
}

/** Ngân sách giải mặc định. Bộ giải thường xong dưới một giây; đây chỉ là trần an toàn. */
export const DEFAULT_TIME_BUDGET_S = 10;

async function requireInputs(ctx: VariantContext): Promise<{
  brief: DesignBrief;
  program: SpaceProgram;
  programId: string;
}> {
  const { repo, scope } = ctx;
  // Artifact bất biến, còn hợp đồng thì có thể đổi: một đầu bài đúc theo hợp đồng cũ vẫn nằm
  // trong kho và vẫn là bản hiệu lực, nhưng không đọc được nữa. Đó là trạng thái người dùng
  // sửa được (xác nhận lại đầu bài), không phải hỏng hóc — nên nói bằng câu nghiệp vụ.
  let brief: { id: string; payload: unknown } | null;
  let program: { id: string; payload: unknown } | null;
  try {
    brief = await repo.head(scope.projectId, scope.discipline, 'design_brief');
    program = await repo.head(scope.projectId, scope.discipline, 'space_program');
  } catch (error) {
    if (error instanceof ContractError) {
      throw new VariantsPrerequisiteMissing(
        'Đầu bài hoặc chương trình không gian đang hiệu lực được lập theo mẫu cũ. Xác nhận lại đầu bài rồi chốt lại chương trình không gian.',
      );
    }
    throw error;
  }
  if (!brief) {
    throw new VariantsPrerequisiteMissing(
      'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.',
    );
  }
  if (!program) {
    throw new VariantsPrerequisiteMissing(
      'Chưa chốt chương trình không gian. Mở tab Chương trình không gian và chốt một bản trước.',
    );
  }
  return {
    brief: brief.payload as DesignBrief,
    program: program.payload as SpaceProgram,
    programId: program.id,
  };
}

/**
 * Sinh mọi biến thể cho chương trình không gian đang hiệu lực.
 *
 * Không đặt bản hiệu lực khi đã có: kiến trúc sư đã chọn một phương án thì sinh lại không được
 * lặng lẽ đổi lựa chọn của họ. Chưa có thì chọn sẵn phương án khả thi đầu tiên để các bước sau
 * (DXF, khối 3D) chạy được ngay — kiến trúc sư đổi bằng `chooseVariant`.
 */
export async function generateVariants(
  ctx: VariantContext,
  options: { variants?: readonly LayoutVariant[]; timeBudgetS?: number } = {},
): Promise<GenerateOutcome> {
  const { repo, compute, scope } = ctx;
  const { brief, program, programId } = await requireInputs(ctx);
  const variants = options.variants ?? LAYOUT_VARIANTS;
  const timeBudgetS = options.timeBudgetS ?? DEFAULT_TIME_BUDGET_S;

  const faces = siteFaces(brief.site as never, ctx.siteContext);
  const labels = spaceLabels(program, ctx.viByType);
  const results: VariantResult[] = [];

  for (const variant of variants) {
    const intent = layoutIntent(program, programId, { variant, openFaces: faces.open });
    const intentArtifact = await repo.write({
      scope,
      kind: 'layout_intent',
      payload: intent.payload,
      inputs: [programId],
      step: 'layer3a_intent',
      params: { variant: variant.id },
      setHead: false,
    });

    const solveParams = { locality: brief.locality, timeBudgetS, variant: variant.id };
    const computed = await repo.findComputed(intentArtifact.id, 'layer3b_solve', solveParams);
    if (computed) {
      const found = await repo.get(computed, scope.projectId);
      if (found && (found.kind === 'floor_plan' || found.kind === 'infeasibility_report')) {
        results.push({
          variantId: variant.id,
          label: variant.label,
          intentArtifactId: intentArtifact.id,
          artifactId: found.id,
          kind: found.kind,
          reused: true,
          solveTimeMs: 0,
        });
        continue;
      }
    }

    const solved = await solveFloorPlan(compute, {
      intent: intent.payload,
      intentRef: intentArtifact.id,
      program,
      site: brief.site,
      locality: brief.locality,
      timeBudgetS,
      openFaces: faces.open,
      accessFaces: faces.access,
      labels,
      groups: ctx.groups,
    });
    const kind = solved.status === 'ok' ? 'floor_plan' : 'infeasibility_report';
    const written = await repo.write({
      scope,
      kind,
      payload: solved.payload,
      inputs: [intentArtifact.id],
      step: 'layer3b_solve',
      params: solveParams,
      setHead: false,
    });
    results.push({
      variantId: variant.id,
      label: variant.label,
      intentArtifactId: intentArtifact.id,
      artifactId: written.id,
      kind,
      reused: written.reused,
      solveTimeMs: solved.solveTimeMs,
    });
  }

  let head = await repo.head(scope.projectId, scope.discipline, 'floor_plan');
  if (!head) {
    const first = results.find((r) => r.kind === 'floor_plan');
    if (first) {
      await repo.setHead(scope, 'layout_intent', first.intentArtifactId);
      await repo.setHead(scope, 'floor_plan', first.artifactId);
      head = { id: first.artifactId, payload: null };
    }
  }

  return { programArtifactId: programId, headArtifactId: head?.id ?? null, results };
}

export interface VariantView {
  variantId: string;
  label: string;
  intentArtifactId: string;
  artifactId: string;
  createdAt: string;
  isHead: boolean;
  status: 'ok' | 'infeasible';
  summary: FloorPlanSummary | null;
  floorPlan: FloorPlan | null;
  /** Câu giải thích vô nghiệm sinh từ mẫu câu — không có mô hình ngôn ngữ nào ở đây. */
  infeasibility: { message: string; conflictRules: string[] } | null;
}

export interface VariantsListing {
  programArtifactId: string;
  headArtifactId: string | null;
  variants: VariantView[];
}

/**
 * Mọi phương án đã sinh từ chương trình không gian ĐANG HIỆU LỰC — đi theo lineage
 * chương trình → ý đồ → mặt bằng, nên phương án của một chương trình cũ không lẫn vào.
 */
export async function listVariants(ctx: VariantContext): Promise<VariantsListing> {
  const { repo, scope } = ctx;
  const { program, programId } = await requireInputs(ctx);
  const labels = spaceLabels(program, ctx.viByType);
  const labelOf = new Map(LAYOUT_VARIANTS.map((v) => [v.id, v.label] as const));
  const head = await repo.head(scope.projectId, scope.discipline, 'floor_plan');

  const variants: VariantView[] = [];
  for (const intentId of await repo.edgesFrom(programId, 'layer3a_intent')) {
    const intent = await repo.get(intentId, scope.projectId);
    if (!intent || intent.kind !== 'layout_intent') continue;
    const variantId = (intent.payload as LayoutIntent).variant_id ?? intentId.slice(-6);

    for (const outId of await repo.edgesFrom(intentId, 'layer3b_solve')) {
      const out = await repo.get(outId, scope.projectId);
      if (!out) continue;
      if (out.kind === 'floor_plan') {
        const plan = out.payload as FloorPlan;
        variants.push({
          variantId,
          label: labelOf.get(variantId) ?? `Phương án ${variantId}`,
          intentArtifactId: intentId,
          artifactId: out.id,
          createdAt: out.createdAt,
          isHead: head?.id === out.id,
          status: 'ok',
          summary: summariseFloorPlan(plan, labels, ctx.groups),
          floorPlan: plan,
          infeasibility: null,
        });
      } else if (out.kind === 'infeasibility_report') {
        const report = out.payload as {
          human_message: string;
          conflict_set?: Array<{ rule_id: string }>;
        };
        variants.push({
          variantId,
          label: labelOf.get(variantId) ?? `Phương án ${variantId}`,
          intentArtifactId: intentId,
          artifactId: out.id,
          createdAt: out.createdAt,
          isHead: false,
          status: 'infeasible',
          summary: null,
          floorPlan: null,
          infeasibility: {
            message: report.human_message,
            conflictRules: (report.conflict_set ?? []).map((c) => c.rule_id),
          },
        });
      }
    }
  }

  // Cùng biến thể có thể có nhiều bản (đổi ngân sách giải, đổi locality) — bản mới nhất lên
  // trước trong từng nhóm, nhóm xếp theo mã biến thể để A · B · C luôn đứng đúng thứ tự.
  variants.sort(
    (a, b) => a.variantId.localeCompare(b.variantId) || b.createdAt.localeCompare(a.createdAt),
  );
  return { programArtifactId: programId, headArtifactId: head?.id ?? null, variants };
}

/**
 * Chọn một phương án làm bản đang hiệu lực. Chuyển CẢ ý đồ lẫn mặt bằng: hai con trỏ trỏ
 * hai bản của hai biến thể khác nhau thì "vì sao ra bản này" không còn đọc được.
 */
export async function chooseVariant(ctx: VariantContext, artifactId: string): Promise<void> {
  const { repo, scope } = ctx;
  const artifact = await repo.get(artifactId, scope.projectId);
  if (!artifact || artifact.kind !== 'floor_plan') {
    throw new VariantsPrerequisiteMissing(
      'Không tìm thấy phương án này trong dự án. Tải lại danh sách phương án rồi chọn lại.',
    );
  }
  const intents = (await repo.lineage(artifactId)).map((edge) => edge.fromId);
  for (const intentId of intents) {
    const intent = await repo.get(intentId, scope.projectId);
    if (intent?.kind === 'layout_intent') await repo.setHead(scope, 'layout_intent', intentId);
  }
  await repo.setHead(scope, 'floor_plan', artifactId);
}
