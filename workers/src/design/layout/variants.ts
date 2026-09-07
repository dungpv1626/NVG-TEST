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
import { plateFor } from './plate';
import { spaceLabels } from './labels';
import { siteFaces, type SiteContextTable } from './site-context';
import { buildArchModel, layoutIntent, solveFloorPlan } from '../workflows/steps';
import { NO_RULES, summariseFloorPlan, type FloorPlanSummary, type RuleCatalogue } from './summary';

/** Phần của kho artifact mà lớp này cần — thu hẹp để bản giả trong kiểm thử nhỏ. */
export type VariantRepo = Pick<
  ArtifactRepository,
  'head' | 'write' | 'findComputed' | 'get' | 'setHead' | 'edgesFrom' | 'lineage' | 'listKind'
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
  /**
   * Tra cứu quy tắc để gắn nguồn và đếm mẫu số "16/18 đạt".
   *
   * Truyền vào từ ngoài chứ không tự nạp: gói quy tắc nằm trong các tệp `rules/**` được nhúng
   * vào bản dựng Worker dưới dạng văn bản, và `import` thẳng chúng từ đây sẽ kéo cả tệp YAML
   * vào mọi nơi nhập tệp này — kể cả bộ kiểm thử, nơi không có bước nhúng đó. Điểm nạp dữ
   * liệu là `index.ts`, đúng chỗ `siteContext` và `viByType` đang được lắp.
   *
   * Vắng mặt thì kết quả không mang nguồn và mẫu số bằng 0 — thiếu thông tin, không phải sai
   * thông tin.
   */
  rulesFor?: (locality: string, buildingType: string) => RuleCatalogue;
}

export interface VariantResult {
  variantId: string;
  label: string;
  intentArtifactId: string;
  artifactId: string;
  kind: 'floor_plan' | 'infeasibility_report';
  /** `true` nghĩa là cùng chương trình, cùng cấu hình — bộ giải không chạy lại. */
  reused: boolean;
  /**
   * Những bản giải TRƯỚC của đúng biến thể này (cùng ý đồ, khác cấu hình hoặc khác phiên bản
   * mã hình học). Cần để biết bản đang hiệu lực có phải bản cũ của chính biến thể này không.
   */
  supersedes: string[];
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
  // Cùng gói quy tắc sẽ gửi cho bộ giải. Lớp 3a đọc nó để BIẾT phòng nào phải giáp mặt nào
  // (`requires_face`) rồi xếp chỗ cho đúng ngay từ đầu — chứ không để bộ giải phát hiện sai
  // rồi báo vi phạm trên một bố cục không sửa được bằng toạ độ.
  const rules = ctx.rulesFor?.(brief.locality, brief.building_type) ?? NO_RULES;
  const plate = plateFor(brief, program, rules.setbacks, rules.maxDensity);

  // Dấu vân mã hình học của Container — hỏi MỘT lần cho cả mẻ, rồi đưa vào khoá bộ nhớ đệm.
  // Không có nó thì "cùng đầu vào, cùng cấu hình" bỏ sót chính phần mã sinh ra hình học: sửa
  // xong bộ dựng tường rồi dựng lại ảnh Docker vẫn nhận về mặt bằng cũ, không lỗi, không cảnh
  // báo (đo được 06/09/2026 — mặt bằng cũ không có lối vào nhà vẫn được dùng lại nguyên vẹn).
  // Container không nói ra được thì để `null`: khi đó khoá khác mọi khoá đã lưu, tức là TÍNH
  // LẠI — chậm hơn nhưng không bao giờ trả về hình học lỗi thời.
  const solverVersion = (await compute.health()).solverVersion;

  for (const variant of variants) {
    const intent = layoutIntent(program, programId, {
      massing: brief.massing,
      variant,
      openFaces: faces.open,
      accessFaces: faces.access,
      faceOf: rules.faceOf,
      plate,
      minSideOf: rules.minSideOf,
    });
    // Nhãn theo khung THẬT đã dựng, đọc lại từ chính artifact vừa sinh. Lấy `variant.label`
    // ở đây là hiển thị khung mặc định trong khi bản vẽ dùng khung khác.
    const label =
      typeof (intent.payload as { variant_label?: unknown }).variant_label === 'string'
        ? (intent.payload as { variant_label: string }).variant_label
        : variant.label;
    const intentArtifact = await repo.write({
      scope,
      kind: 'layout_intent',
      payload: intent.payload,
      inputs: [programId],
      step: 'layer3a_intent',
      params: { variant: variant.id },
      setHead: false,
    });

    // Chụp danh sách bản giải cũ của cùng ý đồ TRƯỚC khi ghi bản mới — sau khi ghi thì bản
    // mới cũng nằm trong danh sách và không phân biệt được cũ với mới nữa.
    const siblings = await repo.edgesFrom(intentArtifact.id, 'layer3b_solve');
    const solveParams = {
      locality: brief.locality,
      timeBudgetS,
      variant: variant.id,
      solverVersion,
    };
    const computed = await repo.findComputed(intentArtifact.id, 'layer3b_solve', solveParams);
    if (computed) {
      const found = await repo.get(computed, scope.projectId);
      if (found && (found.kind === 'floor_plan' || found.kind === 'infeasibility_report')) {
        // Mặt bằng giải từ trước khi có Lớp 4 tất định thì chưa có mô hình kiến trúc — bổ sung
        // ngay ở đây, để lineage của mọi mặt bằng khả thi đều đầy đủ.
        if (found.kind === 'floor_plan')
          await ensureArchModel(repo, scope, found.id, found.payload as FloorPlan);
        results.push({
          variantId: variant.id,
          label,
          intentArtifactId: intentArtifact.id,
          artifactId: found.id,
          kind: found.kind,
          reused: true,
          // Cũng phải khai ở đây: bản đang hiệu lực có thể là một bản giải CŨ của đúng biến
          // thể này, còn bản khớp cấu hình hiện tại đã có sẵn nên bộ giải không chạy lại.
          // Bỏ trống thì con trỏ hiệu lực kẹt lại ở bản cũ mà không lần nào gỡ ra được.
          supersedes: siblings.filter((id) => id !== found.id),
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
      buildingType: brief.building_type,
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
    if (solved.status === 'ok') {
      // Lớp 4 tất định đi liền sau: khối sơ bộ và lỗ mở mặt đứng chép từ mặt bằng vừa giải.
      await ensureArchModel(repo, scope, written.id, solved.payload);
    }
    results.push({
      variantId: variant.id,
      label,
      intentArtifactId: intentArtifact.id,
      artifactId: written.id,
      kind,
      reused: written.reused,
      supersedes: siblings.filter((id) => id !== written.id),
      solveTimeMs: solved.solveTimeMs,
    });
  }

  let head = await repo.head(scope.projectId, scope.discipline, 'floor_plan');

  // Bản đang hiệu lực có thuộc ĐỢT vừa sinh không? Nếu không thì nó là hậu duệ của một chương
  // trình không gian đã bị thay — và giữ nguyên nó là để màn hình vẽ một công trình khác hẳn
  // công trình đang được yêu cầu.
  //
  // Đo được 06/09/2026 trên dự án demo: đầu bài lên phiên bản 2 (5 tầng), chương trình không
  // gian mới đã lên hiệu lực, nhưng `design_head/floor_plan` vẫn trỏ vào mặt bằng 4 tầng sinh
  // từ chương trình cũ — `updated_at` bằng đúng `created_at`. Mọi mặt bằng sinh sau đó đều có
  // đủ 5 tầng; không cái nào được dùng.
  //
  // Chuyển sang ĐÚNG CHỮ CÁI phương án cũ, không phải sang phương án khả thi đầu tiên: lựa
  // chọn của kiến trúc sư là "phương án C", và phương án C của chương trình mới vẫn là C.
  const inThisRound = head ? results.some((r) => r.artifactId === head!.id) : false;
  if (head && !inThisRound) {
    // Chữ cái phương án của bản cũ đọc từ ý đồ đang hiệu lực — hai con trỏ luôn được đặt cùng
    // lúc, nên chúng luôn khớp nhau.
    const headIntent = await repo.head(scope.projectId, scope.discipline, 'layout_intent');
    const previousLetter = headIntent
      ? ((headIntent.payload as LayoutIntent | null)?.variant_id ?? null)
      : null;
    const sameLetter = results.find(
      (r) => r.kind === 'floor_plan' && r.variantId === previousLetter,
    );
    const anyFeasible = results.find((r) => r.kind === 'floor_plan');
    const moveTo = sameLetter ?? anyFeasible;
    if (moveTo) {
      await repo.setHead(scope, 'layout_intent', moveTo.intentArtifactId);
      await repo.setHead(scope, 'floor_plan', moveTo.artifactId);
      await setArchHead(repo, scope, moveTo.artifactId);
      head = { id: moveTo.artifactId, payload: null };
    }
  }

  if (!head) {
    const first = results.find((r) => r.kind === 'floor_plan');
    if (first) {
      await repo.setHead(scope, 'layout_intent', first.intentArtifactId);
      await repo.setHead(scope, 'floor_plan', first.artifactId);
      await setArchHead(repo, scope, first.artifactId);
      head = { id: first.artifactId, payload: null };
    }
  } else {
    // Bản đang hiệu lực trỏ tới một mặt bằng CŨ của đúng biến thể vừa giải lại (mã hình học
    // đổi, rule pack đổi) thì chuyển sang bản mới.
    //
    // Đây KHÔNG phải "lặng lẽ đổi lựa chọn của kiến trúc sư": lựa chọn của họ là biến thể
    // A/B/C, và biến thể đó giữ nguyên. Thứ thay đổi là bản tính của chính biến thể ấy. Giữ
    // bản cũ thì màn hình rơi vào trạng thái nửa nọ nửa kia — thẻ tóm tắt hiện số mới còn tờ
    // bản vẽ vẽ hình cũ (đo được 06/09/2026: thẻ ghi phòng khách 16 m², bản vẽ ghi 20 m²).
    const refreshed = results.find(
      (r) =>
        r.kind === 'floor_plan' && r.artifactId !== head!.id && r.supersedes.includes(head!.id),
    );
    if (refreshed) {
      await repo.setHead(scope, 'layout_intent', refreshed.intentArtifactId);
      await repo.setHead(scope, 'floor_plan', refreshed.artifactId);
      await setArchHead(repo, scope, refreshed.artifactId);
      head = { id: refreshed.artifactId, payload: null };
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
  /**
   * Mục «Tổ chức khối nhà» của đầu bài: câu nào phương án này đáp ứng, câu nào chưa.
   *
   * Đọc TỪ artifact chứ không tính lại: bản đang xem có thể được dựng bằng phiên bản mã cũ,
   * và tính lại theo mã hôm nay sẽ mô tả một phương án khác cái đang hiện trên màn hình.
   * `null` với artifact tạo trước 07/09/2026 — lúc đó chưa có phần này.
   */
  massing: { honoured: string[]; deferred: { field: string; reason: string }[] } | null;
}

export interface Generation {
  programArtifactId: string;
  createdAt: string;
  variants: VariantView[];
}

export interface VariantsListing {
  programArtifactId: string;
  headArtifactId: string | null;
  variants: VariantView[];
  /**
   * Bản vẽ đang hiệu lực KHÔNG phải hậu duệ của chương trình không gian đang hiệu lực.
   *
   * Nghĩa là màn hình đang vẽ một công trình khác công trình đang được yêu cầu — số tầng khác,
   * số phòng khác — và không có gì trên bản vẽ nói điều đó. Đây là trạng thái đo được thật:
   * đầu bài lên 5 tầng, chương trình không gian lên theo, còn con trỏ mặt bằng ở lại bản 4
   * tầng suốt một ngày (06/09/2026).
   *
   * Không tự sửa ở tuyến ĐỌC: đặt lại bản hiệu lực là một thay đổi, và một lần mở màn hình
   * không phải là một thao tác. Sinh lại phương án mới chuyển con trỏ.
   */
  headStale: boolean;
  /**
   * Các đợt phương án của những chương trình không gian TRƯỚC (khách đổi ý, giải lại) — mới
   * nhất trước. Bản cũ vẫn còn nguyên để so sánh: đó là điều 11-design-flow 11.6 hứa với khách.
   */
  previous: Generation[];
}

/**
 * Mọi phương án đã sinh từ chương trình không gian ĐANG HIỆU LỰC — đi theo lineage
 * chương trình → ý đồ → mặt bằng, nên phương án của một chương trình cũ không lẫn vào.
 */
export async function listVariants(ctx: VariantContext): Promise<VariantsListing> {
  const { repo, scope } = ctx;
  const { brief, program, programId } = await requireInputs(ctx);
  const labels = spaceLabels(program, ctx.viByType);
  const head = await repo.head(scope.projectId, scope.discipline, 'floor_plan');
  // Cùng gói quy tắc đã gửi cho bộ giải — xem `ruleCatalogue` trong `summary.ts`.
  const rules = ctx.rulesFor?.(brief.locality, brief.building_type) ?? NO_RULES;

  const variants = await variantsOfProgram(ctx, programId, labels, head?.id ?? null, rules);

  // Đợt trước: mọi chương trình không gian khác của dự án còn có phương án đã sinh.
  const previous: Generation[] = [];
  for (const item of await repo.listKind(scope.projectId, scope.discipline, 'space_program', 6)) {
    if (item.id === programId || previous.length >= 3) continue;
    const older = await repo.get(item.id, scope.projectId);
    if (!older || older.kind !== 'space_program') continue;
    const olderLabels = spaceLabels(older.payload as SpaceProgram, ctx.viByType);
    const olderVariants = await variantsOfProgram(
      ctx,
      item.id,
      olderLabels,
      head?.id ?? null,
      rules,
    );
    if (olderVariants.length > 0) {
      previous.push({
        programArtifactId: item.id,
        createdAt: item.createdAt,
        variants: olderVariants,
      });
    }
  }

  return {
    programArtifactId: programId,
    headArtifactId: head?.id ?? null,
    variants,
    // Có bản hiệu lực, mà nó không nằm trong danh sách phương án của chương trình hiện hành.
    headStale: Boolean(head) && !variants.some((v) => v.artifactId === head!.id),
    previous,
  };
}

/** Mọi phương án đã sinh từ MỘT chương trình không gian, theo lineage chương trình → ý đồ → mặt bằng. */
async function variantsOfProgram(
  ctx: VariantContext,
  programId: string,
  labels: Record<string, string>,
  headId: string | null,
  rules: RuleCatalogue,
): Promise<VariantView[]> {
  const { repo, scope } = ctx;
  const fallbackLabel = new Map(LAYOUT_VARIANTS.map((v) => [v.id, v.label] as const));
  const variants: VariantView[] = [];
  for (const intentId of await repo.edgesFrom(programId, 'layer3a_intent')) {
    const intent = await repo.get(intentId, scope.projectId);
    if (!intent || intent.kind !== 'layout_intent') continue;
    const variantId = (intent.payload as LayoutIntent).variant_id ?? intentId.slice(-6);
    // Nhãn ĐỌC TỪ ARTIFACT, không dựng lại từ bảng biến thể: khung mẫu do Lớp 3a chọn theo
    // mặt sàn (`chooseFrame`), nên nhãn tĩnh "hành lang bên trái" có thể mô tả một bố cục
    // khác hẳn bố cục đã giải. Bảng biến thể chỉ còn là đường lùi cho artifact cũ chưa mang
    // nhãn nào.
    const storedLabel = (intent.payload as LayoutIntent).variant_label;
    const digest = (intent.payload as LayoutIntent).massing as {
      honoured?: string[];
      deferred?: { field: string; reason: string }[];
    };
    const massing =
      digest?.honoured || digest?.deferred
        ? { honoured: digest.honoured ?? [], deferred: digest.deferred ?? [] }
        : null;
    const label =
      (typeof storedLabel === 'string' && storedLabel) ||
      fallbackLabel.get(variantId) ||
      `Phương án ${variantId}`;

    for (const outId of await repo.edgesFrom(intentId, 'layer3b_solve')) {
      const out = await repo.get(outId, scope.projectId);
      if (!out) continue;
      if (out.kind === 'floor_plan') {
        const plan = out.payload as FloorPlan;
        variants.push({
          variantId,
          label,
          intentArtifactId: intentId,
          artifactId: out.id,
          createdAt: out.createdAt,
          isHead: headId === out.id,
          status: 'ok',
          summary: summariseFloorPlan(plan, labels, ctx.groups, rules),
          floorPlan: plan,
          infeasibility: null,
          massing,
        });
      } else if (out.kind === 'infeasibility_report') {
        const report = out.payload as {
          human_message: string;
          conflict_set?: Array<{ rule_id: string }>;
        };
        variants.push({
          variantId,
          label,
          intentArtifactId: intentId,
          artifactId: out.id,
          createdAt: out.createdAt,
          isHead: false,
          status: 'infeasible',
          summary: null,
          floorPlan: null,
          massing,
          infeasibility: {
            message: report.human_message,
            conflictRules: (report.conflict_set ?? []).map((c) => c.rule_id),
          },
        });
      }
    }
  }
  // Cùng biến thể có thể có nhiều bản giải từ CÙNG một ý đồ: đổi ngân sách giải, đổi địa
  // phương, hay — thường gặp nhất — dựng lại ảnh Docker sau khi sửa mã hình học. Xếp bản mới
  // nhất lên trước trong từng nhóm, nhóm xếp theo mã biến thể để A · B · C đứng đúng thứ tự.
  variants.sort(
    (a, b) => a.variantId.localeCompare(b.variantId) || b.createdAt.localeCompare(a.createdAt),
  );

  // …rồi chỉ giữ MỘT bản cho mỗi biến thể. Trả về cả hai bản thì bảng so sánh mọc thêm cột
  // "Phương án A" thứ hai với đúng những con số ấy, và người dùng không có cách nào biết cột
  // nào là cột nào (đo được 06/09/2026: 5 cột cho 3 biến thể). Bản đang hiệu lực được ưu tiên
  // giữ — nếu không, chọn xong một phương án rồi sinh lại là lựa chọn đó biến khỏi màn hình.
  const kept = new Map<string, VariantView>();
  for (const variant of variants) {
    const current = kept.get(variant.variantId);
    if (!current || (variant.isHead && !current.isHead)) kept.set(variant.variantId, variant);
  }
  return [...kept.values()];
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
  await setArchHead(repo, scope, artifactId);
}

async function ensureArchModel(
  repo: VariantRepo,
  scope: ArtifactScope,
  planId: string,
  plan: FloorPlan,
): Promise<void> {
  const [existing] = await repo.edgesFrom(planId, 'layer4_arch');
  if (existing) return;
  const arch = buildArchModel(plan, planId);
  await repo.write({
    scope,
    kind: 'arch_model',
    payload: arch.payload,
    inputs: [planId],
    step: 'layer4_arch',
    params: { stub: arch.stub },
    setHead: false,
  });
}

/** Mô hình kiến trúc sinh từ mặt bằng này (nếu đã có) thành bản hiệu lực — đi theo mặt bằng. */
async function setArchHead(repo: VariantRepo, scope: ArtifactScope, planId: string): Promise<void> {
  const [archId] = await repo.edgesFrom(planId, 'layer4_arch');
  if (archId) await repo.setHead(scope, 'arch_model', archId);
}
