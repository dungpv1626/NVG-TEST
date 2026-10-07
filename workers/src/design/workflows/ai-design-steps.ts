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

import { withStairShape } from '../ai/stair-choice';
import { withHouseProfile } from '../ai/house-profile-norms';
import { houseProfile } from '@nvg/shared/design';
import { LlmCallFailed } from '../llm/gemini';
import type {
  AiHouseBands,
  AiBriefDigest,
  AiFloorPlan,
  AiPlanEdit,
  AiSpaceProgram,
} from '@nvg/shared/design';
import { applyPlanEdits } from '../ai/edit/apply';
import { callEditModel } from '../ai/edit/prompt';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { ArtifactRepository } from '../artifacts';
import type { BriefFidelity } from '../kb/brief-fidelity';
import type { ConstructionNorms } from '../kb/construction';
import type { SiteContextTable } from '../kb/site-context';
import type { VocabularyIndex, ZoneDefaults } from '../kb/vocabulary';
import type { PlanQuality } from '../ai/plan-quality';
import type { RoutePricing } from '../llm/router';
import type { ReasoningEffort, StructuredCallOptions, TextModelClient } from '../llm/text-client';
import type { RulePack } from '../rules/rule-pack';
import {
  recordAiCall,
  type AiCallOutcome,
  type AiCallScope,
  type PromptSink,
} from '../ai/call-log';
import type { HouseIntent } from '../ai/house';
import { recordingClient } from '../ai/prompt-record';
import {
  AiPlanRejected,
  callHouseModel,
  promptsFor,
  evaluateHouseBest,
  finalisePlan,
  planContext,
  ANSWER_STAGE_CODE,
  bandsLightWellHints,
  bandsProgramIssues,
  briefInfeasible,
  houseCallEffort,
  programGenerator,
  rescueFirstStorey,
  landStairEnds,
  retryPlan,
  scorePercent,
  type HouseArranged,
  type HouseScoreSummary,
  type LevelRejection,
  type PlanCallRecord,
  type PlanContext,
  type PlanVariant,
  type RetryKind,
} from '../ai/plan';
import { groupsBelowFloor } from '../ai/plan-score';
import type { AiPrompts } from '../ai/prompts';
import type { PlanIssue } from '../ai/plan-check';
import type { RoomGroups } from '../ai/tree';
import type { MandatoryRules } from '../ai/mandatory';
import { buildRoof } from '../ai/roof';
import type { RoofPlanSpec } from '../kb/roof-plan';
import type { FurnitureSpec, HouseProgramSpec } from '../kb/house-program';

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
  /** Mức suy nghĩ kỹ sư chọn cho lượt chạy này; vắng = cấu hình tuyến (13/09/2026). */
  reasoningEffort?: ReasoningEffort | null;
  /** `rect` = mô hình khai hình chữ nhật mm (bàn giao v5, cờ `AI_PROMPT_PIPELINE=v5`); vắng = bản phác lưới. */
  geometry?: 'rect';
  /** `v6` = mô hình xếp dải, bộ giải tính kích thước (T116, cờ `AI_PROMPT_PIPELINE=v6`). */
  pipeline?: 'v6';
  briefRef: string;
  /**
   * Đầu bài đã LƯỢC DANH TÍNH, dựng sẵn ở tuyến khởi động dưới phiên người dùng.
   *
   * Vì sao không để Workflow tự đọc: dựng digest phải đọc tên, điện thoại, địa chỉ khách hàng
   * để lược chúng đi (`aiDigestInputs`), và Workflow chỉ có khoá `service_role` — vượt RLS.
   * Dựng ở tuyến khởi động thì việc đọc ấy đi qua đúng quyền của người bấm, và Workflow không
   * bao giờ chạm được vào dữ liệu danh tính.
   *
   * ĐÂY LÀ ĐẦU VÀO DUY NHẤT của mô hình (T45, 15/09/2026): mặt bằng không đọc chương trình không gian.
   */
  digest: AiBriefDigest;
  /**
   * Gói quy tắc kỹ sư đã tích cho lượt này (T20) — mặc định tắt cả hai.
   *
   * Đi trong params chứ không đọc lại từ cấu hình tenant lúc chạy: lựa chọn thuộc LƯỢT CHẠY này.
   * Đọc lại lúc chạy thì một lần ai đó đổi cấu hình giữa lúc bấm và lúc Workflow nhận việc sẽ
   * đổi luôn bộ ngưỡng gửi cho mô hình, mà không có gì nói ra.
   */
  rulePacks: { standards: boolean; experience: boolean };
  variants: PlanVariant[];
  /**
   * Lượt SỬA theo yêu cầu kỹ sư trên một phương án đã lưu (T53). Có mặt thì Workflow không khai mới:
   * gọi mô hình dịch yêu cầu thành thao tác, áp lên cây đã lưu, ghi bản sửa. `variants` khi ấy là đúng
   * một phương án — của bản gốc.
   */
  edit?: { baseArtifactId: string; instruction: string } | null;
  /**
   * Phương án mặt bằng ĐANG HIỆU LỰC lúc bấm — bước mặt đứng dựng theo đúng bản này (T59). Chốt ở tuyến
   * khởi động chứ không đọc head lúc chạy: kỹ sư đổi phương án giữa chừng thì mặt đứng vẫn nói về
   * ngôi nhà họ đã bấm chạy.
   */
  planRef?: string | null;
  /**
   * Phiếu yêu cầu mặt đứng của kỹ sư (`ai_facade_brief`, T59 Đợt F2) chốt lúc bấm — rỗng khi chưa điền.
   * Chốt mã ở tuyến khởi động vì cùng lý do với `planRef`: sửa phiếu giữa chừng không đổi lượt đang chạy.
   */
  facadeBriefRef?: string | null;
  /**
   * Ý tưởng mặt đứng mà bộ ảnh phối cảnh dựng theo (T67) — chốt lúc bấm, cùng lý do với `planRef`.
   */
  facadeRef?: string | null;
  /**
   * Mặt đứng KỸ SƯ tải lên (`ai_uploaded_drawing`) mà bộ ảnh phối cảnh dựng theo (T114 Đợt 4b). Có thì
   * `facadeRef` và `planRef` rỗng: khối nhà lấy từ đầu bài, vật liệu từ phần Mặt đứng của đầu bài.
   */
  facadeUploadRef?: string | null;
  /**
   * Tuyến model VẼ ẢNH. Tách hẳn khỏi `textRoute`: hai giai đoạn trước gọi model chữ, giai đoạn này
   * gọi model ảnh, và trộn chung một trường là mở đường cho một lượt ảnh đi nhầm sang tuyến chữ —
   * lỗi ấy chỉ lộ ra ở phản hồi của nhà cung cấp, tức sau khi đã tính tiền.
   */
  imageRoute?: string | null;
  /** Ô của kỹ sư: cho phép mô hình thêm người, ô tô, xe máy vào ảnh (T67, Haan chốt). */
  peopleAndVehicles?: boolean;
  /**
   * Tờ neo vector TRÌNH DUYỆT đã rasterise và gửi lên, đã cất vào kho trước khi mở lượt chạy.
   *
   * Vì sao đi qua kho chứ không đi thẳng trong params: Worker không có canvas nên tờ neo phải do
   * trình duyệt dựng, mà Workflow thì không hỏi trình duyệt được. Tuyến khởi động nhận byte, dựng
   * lại tờ ở máy chủ để đối chiếu cỡ khung, cất vào kho, rồi chỉ truyền URI — params của Workflow
   * không phải chỗ để mang vài megabyte ảnh.
   */
  anchors?: Array<{ kind: 'elevation' | 'roof_plan'; uri: string; sha256: string; bytes: number }>;
}

export interface PlanStepDeps {
  client: TextModelClient;
  prompts: AiPrompts;
  labels: Record<string, string>;
  construction: ConstructionNorms;
  /** Bảng hiện trạng bốn phía — nguồn của `levels[].outline_faces`. */
  siteContext: SiteContextTable;
  rules: RulePack;
  /** Nhóm mã phòng bước gán số cần: ngoài trời, giao thông đứng, miễn cửa, phòng ở. */
  groups: RoomGroups;
  /** Cặp loại phòng được ghép (`kb/room_vocabulary.yaml` mục `merge_allowed`), khoá `mergeKey`. */
  mergeAllowed: ReadonlySet<string>;
  /** Từ vựng phòng — nguồn `room_types` của lời dẫn. */
  vocabulary: VocabularyIndex;
  /** Mức bám đầu bài (`kb/brief_fidelity.yaml`). */
  fidelity: BriefFidelity;
  /** Thước chấm chất lượng — điểm đi vào payload artifact (T27, Đợt C′). */
  quality: PlanQuality;
  /** Luật bố trí BẮT BUỘC của Haan (T71, `rules/nvg-mandatory.yaml`) — luôn bật. */
  mandatory: MandatoryRules;
  /** Gói quy tắc bộ chấm đọc: LUÔN kinh nghiệm + đo được, không phụ thuộc ô tích của kỹ sư. */
  scoreRules: RulePack;
  /** Định mức diện tích nghề (`kb/space_norms.yaml`) — chỉ trừ điểm (T48, Haan chốt 16/09/2026). */
  areaNorms: ReadonlyMap<string, { min: number; target: number; max: number }>;
  /** Mã nhóm → danh sách mã phòng, cho bộ chấm. */
  roomGroups: Record<string, string[]>;
  /** Vùng mặc định khi ý định bỏ sót phòng (`kb/room_vocabulary.yaml`). */
  zoneDefaults: ZoneDefaults;
  /** Loại phòng giao thông đứng có thang (`kb/brief_fidelity.yaml`). */
  stairTypes: readonly string[];
  repo: ArtifactRepository;
  /** Giá niêm yết của tuyến, để nhật ký chi phí có cột tiền. Thiếu thì cột tiền rỗng. */
  pricing?: RoutePricing;
  /** Nhà cung cấp theo cấu hình tuyến — dùng khi lượt gọi hỏng trước khi biết nhà cung cấp thật. */
  provider: string;
  /** Kho lưu nguyên văn lời gọi (nút «Xuất prompt» ở nhật ký). Vắng thì không lưu. */
  promptStore?: PromptSink;
  /** Danh mục mái (`kb/roof_plan.yaml`) — có thì mọi phương án mang tờ mái (Haan chốt 04/10/2026). */
  roofPlan?: RoofPlanSpec;
  /** Chế độ hình chữ nhật: danh mục phòng và đồ đạc (`kb/house_program.yaml`, `kb/furniture.yaml`). */
  houseProgram?: HouseProgramSpec;
  furniture?: FurnitureSpec;
  /** Model theo cấu hình tuyến, cùng lý do với `provider`: lượt hỏng vẫn phải cộng được theo model. */
  model: string;
  /**
   * Tuyến của VÒNG SỬA mặt bằng (`revise_route`, handoff đợt 3 mục 4.1) — kèm giá và model để nhật ký ghi đúng.
   * Vắng = vòng sửa chạy tuyến kỹ sư chọn.
   */
  revise?: { route: string; pricing?: RoutePricing; model: string };
}

/** Pha của một lượt: mô hình khai cả nhà, rồi chương trình kiểm và xếp. */
export type HousePhase = 'propose' | 'arrange';

/** Mã bước — `plan:AI-A:propose:1`. Ổn định, đọc được trong nhật ký Workflow. */
export function houseStepId(variantId: string, phase: HousePhase, round: number): string {
  return `plan:${variantId}:${phase}:${round}`;
}

/** Mã bước ghi artifact của một phương án. */
export function writeStepId(variantId: string): string {
  return `plan:${variantId}:write`;
}

export function houseStepLabel(variantId: string, phase: HousePhase, round: number): string {
  if (phase === 'arrange') {
    return `${round > 1 ? `Xếp lại (lượt ${round})` : 'Kiểm và xếp phòng các tầng'} · ${variantId}`;
  }
  return `${round > 1 ? `AI sửa ý định (lượt ${round})` : 'AI khai ý định cả nhà'} · ${variantId}`;
}

/**
 * Danh sách bước khai TRƯỚC khi chạy — mỗi phương án «khai · xếp · lưu». Các lượt sửa không có ở đây vì
 * chúng chỉ phát sinh khi lượt trước không xếp được.
 */
export function planStepSpecs(variants: readonly PlanVariant[]) {
  return variants.flatMap((variant) => [
    ...(['propose', 'arrange'] as const).map((phase) => ({
      id: houseStepId(variant.id, phase, 1),
      label: houseStepLabel(variant.id, phase, 1),
    })),
    { id: writeStepId(variant.id), label: `Lưu phương án ${variant.id}` },
  ]);
}

export interface ProposeOutcome {
  /** Ý định đã qua hợp đồng, dạng chuỗi JSON. `null` khi câu trả lời sai cấu trúc. */
  intentJson: string | null;
  /** Lỗi cấu trúc của lượt này — rỗng khi `intentJson` có giá trị. */
  issues: string[];
  call: PlanCallRecord;
  /** Chế độ hình chữ nhật: câu nhắc rect chồng / hở / vượt khối — nối vào vòng sửa nếu phương án chưa đạt. */
  layoutHints?: string[];
  /** Đường v6: bộ dải khi bộ giải báo lỗi cấu trúc — vòng sau sửa bộ dải này (T116). */
  bandsBase?: AiHouseBands;
  /** Tầng của `bandsBase` đã khoá (tầng 1 chương trình dựng lại). */
  bandsKeep?: number[];
}

/**
 * Một lượt gọi mô hình cho CẢ NHÀ của một phương án. Lượt đầu hay lượt sửa cùng dùng hàm này.
 *
 * Hàm này KHÔNG ném khi câu trả lời sai cấu trúc: sai cấu trúc là một kết quả, và lấy mẫu lại là
 * việc của lớp gọi. Ném ở đây thì Workflow sẽ thử lại cả bước và mua lại đúng lượt vừa hỏng.
 */
export async function proposeHouse(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  round: number,
  avoid?: readonly string[],
  /** Ý định lượt trước (JSON, đã đánh mã) khi lượt này SỬA nó thay vì khai mới — xem `retryPlan`. */
  previousJson?: string | null,
  /** Tầng đã qua của lượt gốc — giữ nguyên khi ghép câu trả lời (T86). */
  keep?: readonly number[],
  /** Bảng theo dõi trực tiếp và nút «Dừng» (13/09/2026). Vắng ở phép thử. */
  live?: LevelLiveHooks,
): Promise<ProposeOutcome> {
  const context = contextFor(deps, params, variant);
  const scope = scopeOf(params);
  const retrying = (avoid?.length ?? 0) > 0;
  const what = `lượt ${round} phương án ${variant.id}`;

  let outcome: ProposeOutcome;
  // Đồng hồ của cả BƯỚC, không phải của riêng lời gọi: chênh lệch giữa hai con số nói được «chậm ở
  // mô hình» hay «chậm ở ta».
  const stepStarted = Date.now();
  const recorded = recordingClient(deps.client);
  const request = () => recorded.records[recorded.records.length - 1];
  const effort = houseCallEffort(params.reasoningEffort, deps.provider, retrying, !!context.bands);
  try {
    const attempt = await callHouseModel({
      client: recorded.client,
      route: retrying && deps.revise ? deps.revise.route : params.textRoute,
      prompts: deps.prompts,
      context,
      ...(retrying ? { avoid } : {}),
      ...(retrying && previousJson ? { previous: JSON.parse(previousJson) as HouseIntent } : {}),
      ...(retrying && keep?.length ? { keep } : {}),
      ...(effort ? { reasoningEffort: effort } : {}),
      ...(live ? { onProgress: live.onProgress, signal: live.signal } : {}),
    });
    outcome = {
      intentJson: attempt.intent ? JSON.stringify(attempt.intent) : null,
      issues: attempt.issues,
      call: attempt.call,
      ...(attempt.layoutHints?.length ? { layoutHints: attempt.layoutHints } : {}),
      ...(attempt.bandsBase ? { bandsBase: attempt.bandsBase } : {}),
    };
    if (attempt.layoutFixes?.length || attempt.layoutHints?.length) {
      console.log(
        `[ĐO] ${what} rect: ${attempt.layoutFixes?.length ?? 0} chỗ tự sửa, ` +
          `${attempt.layoutHints?.length ?? 0} lỗi rect`,
      );
    }
  } catch (error) {
    // Lượt gọi hỏng ở tầng mạng hoặc nhà cung cấp: vẫn có thể đã tính tiền, nên vẫn ghi một dòng,
    // lấy số token từ chính lỗi và tên model từ cấu hình tuyến (đo 11/09/2026: 6/6 dòng `failed`
    // từng ghi 0 đồng và `model = "unknown"`). Rồi ném tiếp để Workflow xử lý theo chính sách.
    console.log(
      `[ĐO] ${what} HỎNG sau ${Date.now() - stepStarted} ms: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    const cancelled = live?.signal.aborted === true;
    const failed = {
      provider: deps.provider,
      model: retrying && deps.revise ? deps.revise.model : deps.model,
      usage: (error instanceof LlmCallFailed && error.usage) || {
        inputTokens: null,
        outputTokens: null,
      },
      latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || Date.now() - stepStarted,
      status: 'failed' as const,
      errorCode: cancelled ? 'cancelled' : error instanceof Error ? error.name : 'unknown',
      request: request(),
    };
    const callId = await logCall(deps, scope, params, retrying, failed);
    live?.onLogged({ callId, ...failed });
    throw error;
  }

  console.log(
    `[ĐO] ${what} xong sau ${Date.now() - stepStarted} ms · lời gọi ${outcome.call.latencyMs} ms · ` +
      `vào ${outcome.call.usage.inputTokens ?? '?'} tok · ra ${outcome.call.usage.outputTokens ?? '?'} tok · ` +
      `${outcome.intentJson ? `ý định ${outcome.intentJson.length} ký tự` : 'KHÔNG đọc được ý định'}` +
      `${outcome.issues.length ? ` · ${outcome.issues.length} lỗi hợp đồng` : ''}`,
  );
  const logged = {
    ...outcome.call,
    // «Trả về nhưng sai cấu trúc» là `rejected`: tiền đã tiêu, kết quả không dùng được.
    status: outcome.intentJson ? ('ok' as const) : ('rejected' as const),
    request: request(),
  };
  const callId = await logCall(deps, scope, params, retrying, logged);
  live?.onLogged({ callId, ...logged });
  return outcome;
}

/** Móc của bảng theo dõi trực tiếp vào một lượt gọi. */
export interface LevelLiveHooks {
  onProgress: NonNullable<StructuredCallOptions['onProgress']>;
  signal: AbortSignal;
  /** Gọi ngay sau khi dòng nhật ký được ghi — kèm mã lượt gọi để màn hình xuất prompt. */
  onLogged: (logged: AiCallOutcome & { callId: string | null }) => void;
}

export interface ArrangeOutcome {
  /** Cả nhà đã xếp, dạng chuỗi JSON `HouseArranged`. `null` khi không xếp được. */
  arrangedJson: string | null;
  /** Lý do theo tầng; tầng `0` = cả nhà. */
  rejections: LevelRejection[];
  /** Dòng «tránh những chỗ này» cho lượt sửa. */
  hints: string[];
  /** Ý định đã đánh mã, cho lượt sửa. `null` khi phải lấy mẫu lại. */
  previousJson: string | null;
  /** Tầng đã qua, lượt sửa giữ nguyên (T86). Vắng ở kết quả Workflow ghi trước T86. */
  keep?: number[];
  retry: RetryKind;
  /** Điểm khi xếp được (T53) — `null` khi không xếp được. */
  score: HouseScoreSummary | null;
}

/** Kiểm danh mục + xếp mọi tầng + kiểm liên tầng. Hàm thuần, không tốn gì — chạy lại vô hại. */
export function arrangeHouseStep(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  proposal: ProposeOutcome,
  round: number,
  /** Ý định lượt trước đã gửi mô hình sửa — để nhận ra lượt trả lại y nguyên (`retry: 'unchanged'`). */
  askedJson: string | null = null,
): ArrangeOutcome {
  let intent = proposal.intentJson ? (JSON.parse(proposal.intentJson) as HouseIntent) : null;
  const context = contextFor(deps, params, variant);
  const generator = programGenerator(
    proposal.call,
    params.textRoute,
    deps.prompts.version,
    round > 1,
  );
  // Dải tầng 1 không vừa khối: chương trình dựng lại tầng 1 trước khi gửi mô hình sửa (`rescueFirstStorey`).
  const rescued =
    !intent && proposal.bandsBase
      ? rescueFirstStorey(
          contextInput(deps, params, variant),
          context,
          promptsFor(context, deps.prompts),
          generator,
          proposal.bandsBase,
          proposal.call,
          evaluateHouseBest,
        )
      : null;
  if (rescued) {
    intent = rescued.attempt.intent;
    proposal = {
      ...proposal,
      intentJson: intent ? JSON.stringify(intent) : null,
      issues: rescued.evaluation ? [] : rescued.attempt.issues,
      layoutHints: rescued.attempt.layoutHints ?? [],
    };
    delete proposal.bandsBase;
    // Tầng khác cũng hỏng ở bộ giải: bộ dải đã thay tầng 1 đi mô hình sửa, tầng 1 khoá.
    if (!rescued.evaluation && rescued.attempt.bandsBase) {
      proposal.bandsBase = rescued.attempt.bandsBase;
      proposal.bandsKeep = rescued.attempt.bandsKeep ?? [];
    }
    console.log(`[ĐO] ${rescued.attempt.layoutFixes?.[0] ?? 'dựng lại tầng 1'}`);
  }
  if (!rescued?.evaluation && !intent && proposal.bandsBase) {
    // Bộ giải hỏng: cổng danh mục phòng soát luôn trên dải, lỗi đi cùng lỗi hình học (`bandsProgramIssues`).
    const missing = [
      ...bandsProgramIssues(contextInput(deps, params, variant), context, proposal.bandsBase),
      ...bandsLightWellHints(context, proposal.bandsBase, promptsFor(context, deps.prompts)).map(
        (line) => line.replace(/^- /, ''),
      ),
    ];
    if (missing.length)
      proposal = { ...proposal, issues: [...proposal.issues, ...missing.map((m) => `- ${m}`)] };
  }
  let evaluation = rescued
    ? rescued.evaluation
    : intent
      ? evaluateHouseBest(
          contextInput(deps, params, variant),
          context,
          intent,
          generator,
          promptsFor(context, deps.prompts),
        )
      : null;
  // Phòng chỉ ra được ô thang: chương trình thử chèn sảnh đầu thang trước khi gửi mô hình sửa (`landStairEnds`).
  const landed =
    evaluation && intent
      ? landStairEnds(
          contextInput(deps, params, variant),
          context,
          promptsFor(context, deps.prompts),
          generator,
          { intent, issues: [], call: proposal.call },
          evaluation,
          evaluateHouseBest,
        )
      : null;
  if (landed) {
    intent = landed.attempt.intent;
    evaluation = landed.evaluation;
    proposal = {
      ...proposal,
      intentJson: intent ? JSON.stringify(intent) : null,
      layoutHints: landed.attempt.layoutHints ?? [],
    };
    console.log(`[ĐO] ${landed.attempt.layoutFixes?.[0] ?? 'chèn sảnh đầu thang'}`);
  }
  // Lỗi rect chương trình không tự sửa (chồng, hở, vượt khối) đứng đầu câu nhắc khi còn vòng sửa.
  const layoutHints = proposal.layoutHints ?? [];
  if (evaluation?.ok) {
    const score = evaluation.ok.score;
    // Qua cổng mà dưới ngưỡng (T53): lượt sửa kế tiếp nhận dòng tiêu chí mất điểm và ý định đã đánh mã.
    const below = score.hints.length > 0;
    return {
      arrangedJson: JSON.stringify(evaluation.ok),
      rejections: [],
      hints: below ? [...layoutHints, ...score.hints] : score.hints,
      previousJson: below ? JSON.stringify(evaluation.ok.intent) : null,
      retry: below ? 'revise' : 'none',
      score,
    };
  }
  const asked = askedJson ? (JSON.parse(askedJson) as HouseIntent) : null;
  const plan = retryPlan(
    {
      intent,
      issues: proposal.issues,
      ...(proposal.bandsBase ? { bandsBase: proposal.bandsBase } : {}),
      ...(proposal.bandsKeep?.length ? { bandsKeep: proposal.bandsKeep } : {}),
    },
    evaluation,
    asked,
  );
  return {
    arrangedJson: null,
    rejections: evaluation
      ? evaluation.rejections
      : [{ level: 0, messages: proposal.issues, codes: [ANSWER_STAGE_CODE] }],
    hints: plan.kind === 'revise' ? [...layoutHints, ...plan.avoid] : plan.avoid,
    previousJson: plan.previous ? JSON.stringify(plan.previous) : null,
    ...(plan.kind === 'revise' && plan.keep.length ? { keep: plan.keep } : {}),
    retry: plan.kind,
    score: null,
  };
}

/**
 * Mặt bằng mái của phương án (Haan chốt 04/10/2026) — dựng từ tầng trên cùng đã xếp và khu mái mô hình khai.
 * Không có danh mục mái thì không có phần `roof` (artifact như trước).
 */
function roofOf(
  context: PlanContext,
  payload: AiFloorPlan,
  intent: HouseIntent,
  deps: PlanStepDeps,
): { roof?: AiFloorPlan['roof'] } {
  const top = payload.levels.at(-1);
  if (!context.roof || !top) return {};
  return {
    roof: buildRoof({
      top,
      spec: context.roof.spec,
      required: context.roof.required,
      modelRooms: intent.roof ?? [],
      origin: { x: context.buildableCm.x0, y: context.buildableCm.y0 },
      outdoor: deps.groups.outdoor,
      wet: new Set(deps.roomGroups.wet ?? []),
    }),
  };
}

export interface WriteOutcome {
  variantId: string;
  artifactId: string;
  /** Danh mục phòng dựng từ ý định — artifact riêng, KHÔNG đặt head. */
  programArtifactId: string;
  reused: boolean;
  wallsDerived: boolean;
  findings: PlanIssue[];
  /** Chỗ chương trình tự xử lý (bám mốc, cửa sổ không đặt được…). */
  notes: { code: string; message: string }[];
  repaired: boolean;
  resampledLevels: number[];
  /** Số lượt gọi mô hình phương án này đã dùng. */
  attempts: number;
  /**
   * Điểm và phần trọng số chấm được — đủ để bảng lịch sử so hai model mà không phải đọc lại payload.
   * `version` đi kèm vì hai dòng khác phiên bản thước là hai con số chấm bằng hai cái thước (T27).
   */
  score: { version: number; points: number; scoredWeight: number } | null;
  /** % điểm và ngưỡng nhận lúc ghi; `belowThreshold` = hết lượt sửa mà vẫn dưới ngưỡng (T53). */
  percent: number | null;
  acceptPercent: number | null;
  /** Nhóm của thước dưới sàn nhóm lúc ghi (T96) — rỗng khi không có sàn hay mọi nhóm đạt. */
  belowGroups: string[];
  belowThreshold: boolean;
}

/** Kết quả bước ghi: đúc được artifact, hoặc cả nhà trượt cổng LIÊN TẦNG và không đúc gì. */
export type WriteResult = { written: WriteOutcome } | { rejected: string[] };

/**
 * Chốt và đúc artifact một phương án — CHỈ khi cả nhà qua cổng liên tầng (T39).
 *
 * Đúc HAI artifact: danh mục phòng dựng từ ý định (`ai_space_program`, trỏ đầu bài), rồi mặt bằng trỏ
 * danh mục ấy. Cả hai `setHead: false`: danh mục này KHÔNG phải kết quả của bước «Chương trình không
 * gian» và không được thay bản kiến trúc sư đang xem ở đó; ba phương án mặt bằng cùng loại, head do
 * người CHỌN (`POST /design/ai/plan/choose`).
 *
 * Không ném khi trượt cổng: ném trong `step.do` thì Workflow thử lại một phép thuần nhiều lần để
 * nhận lại đúng câu trả lời ấy. Trả `rejected` để lớp gọi dừng phương án có lý do.
 */
export async function writePlan(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  arrangedJson: string,
  call: PlanCallRecord,
  resampledLevels: readonly number[],
  attempts: number,
): Promise<WriteResult> {
  const context = contextFor(deps, params, variant);
  const house = JSON.parse(arrangedJson) as HouseArranged;
  const programPayload: AiSpaceProgram = {
    ...house.program,
    brief_ref: params.briefRef,
    generator: programGenerator(call, params.textRoute, deps.prompts.version, attempts > 1),
  };
  // Kiểm liên tầng TRƯỚC khi ghi gì: trượt cổng thì không để lại danh mục phòng mồ côi. Mã tham chiếu
  // không đổi kết quả kiểm hay điểm, nên gắn vào sau khi danh mục đã có mã băm.
  const final = finalisePlan({
    levels: house.levels,
    context,
    program: programPayload,
    programRef: params.briefRef,
    variant,
    call,
    route: params.textRoute,
    promptVersion: deps.prompts.version,
    resampledLevels: [...resampledLevels],
    construction: withHouseProfile(withStairShape(deps.construction, params.digest), params.digest),
    groups: deps.groups,
    quality: deps.quality,
    scoreRules: deps.scoreRules,
    areaNorms: deps.areaNorms,
    roomGroups: deps.roomGroups,
    buildingType: params.digest.building_type,
    houseProfile: houseProfile(params.digest).profile,
  });
  if (final.check.blocking.length) {
    return { rejected: final.check.blocking.map((issue) => issue.message) };
  }

  const program = await deps.repo.write({
    scope: scopeOf(params),
    kind: 'ai_space_program',
    payload: programPayload,
    inputs: [params.briefRef],
    // Cùng bước sinh với chương trình không gian của AI; lineage (trỏ đầu bài, mặt bằng trỏ nó) và
    // `params.variant` phân biệt bản dựng từ ý định mặt bằng.
    step: 'ai_program_propose',
    params: { route: params.textRoute, prompt_version: deps.prompts.version, variant: variant.id },
    setHead: false,
  });
  final.payload = {
    ...final.payload,
    program_ref: program.id,
    house_intent: house.intent,
    ...roofOf(context, final.payload, house.intent, deps),
  };

  const artifact = await deps.repo.write({
    scope: scopeOf(params),
    kind: 'ai_floor_plan',
    payload: final.payload,
    inputs: [program.id],
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
    written: {
      variantId: variant.id,
      artifactId: artifact.id,
      programArtifactId: program.id,
      reused: artifact.reused,
      wallsDerived: final.wallsDerived,
      findings: final.check.findings,
      notes: [
        ...house.levels.flatMap((level) =>
          level.notes.map((note) => ({ code: note.code, message: note.message })),
        ),
        ...final.notes,
      ],
      repaired: attempts > 1,
      resampledLevels: [...resampledLevels].sort((a, b) => a - b),
      attempts,
      score: {
        version: final.score.scoreVersion,
        points: final.score.points,
        scoredWeight: final.score.scoredWeight,
      },
      ...thresholdOf(
        final.score,
        deps.quality.acceptPercent,
        deps.quality.acceptGroupFloorPercent,
        deps.quality.acceptGroupFloors,
      ),
    },
  };
}

/** Phương án đã xếp được, chờ ghi — bản điểm cao nhất qua các lượt (T53). */
export interface BestArranged {
  arrangedJson: string;
  call: PlanCallRecord;
  percent: number | null;
  failedLevels: number[];
}

/**
 * Bản nào đáng ghi: điểm cao hơn thắng, hoà thì giữ bản CŨ — lượt sửa vì điểm không được thay một bản
 * bằng một bản không tốt hơn (T53).
 */
export function keepBest(best: BestArranged | null, candidate: BestArranged): BestArranged {
  if (!best) return candidate;
  return (candidate.percent ?? -1) > (best.percent ?? -1) ? candidate : best;
}

/** % điểm, ngưỡng, và có dưới ngưỡng không — cùng cách tính với `scoreSummary`. */
export function thresholdOf(
  score: {
    points: number;
    scoredWeight: number;
    groups?: readonly { code: string; points: number; scoredWeight: number }[];
  },
  acceptPercent: number | null,
  groupFloorPercent: number | null = null,
  groupFloors: Readonly<Record<string, number>> = {},
): {
  percent: number | null;
  acceptPercent: number | null;
  belowGroups: string[];
  belowThreshold: boolean;
} {
  const percent = scorePercent(score);
  // Sàn nhóm là phần tinh của ngưỡng nhận: không có ngưỡng thì không có sàn.
  const belowGroups =
    acceptPercent === null ? [] : groupsBelowFloor(score, groupFloorPercent, groupFloors);
  return {
    percent,
    acceptPercent,
    belowGroups,
    // Dưới ngưỡng tổng, HOẶC một nhóm chấm được dưới sàn nhóm (T96): nhóm diện tích không bù được
    // cho một tầng đi lại tệ.
    belowThreshold:
      (acceptPercent !== null && percent !== null && percent < acceptPercent) ||
      belowGroups.length > 0,
  };
}

function contextInput(deps: PlanStepDeps, params: AiDesignParams, variant: PlanVariant) {
  return {
    ...(params.geometry === 'rect' ? { geometry: 'rect' as const } : {}),
    ...(params.pipeline === 'v6' ? { pipeline: 'v6' as const } : {}),
    ...(deps.roofPlan ? { roofPlan: deps.roofPlan } : {}),
    ...(deps.houseProgram ? { houseProgram: deps.houseProgram } : {}),
    ...(deps.furniture ? { furniture: deps.furniture } : {}),
    digest: params.digest,
    variant,
    labels: deps.labels,
    vocabulary: deps.vocabulary,
    fidelity: deps.fidelity,
    // Loại thang của lượt (T105) gắn một lần ở đây — bộ xếp, cổng và bộ vẽ đọc cùng một chỗ.
    construction: withHouseProfile(withStairShape(deps.construction, params.digest), params.digest),
    siteContext: deps.siteContext,
    rules: deps.rules,
    groups: deps.groups,
    mergeAllowed: deps.mergeAllowed,
    zoneDefaults: deps.zoneDefaults,
    stairTypes: deps.stairTypes,
    scoreRules: deps.scoreRules,
    areaNorms: deps.areaNorms,
    quality: deps.quality,
    roomGroups: deps.roomGroups,
    mandatory: deps.mandatory,
  };
}

/** Câu chặn khi đầu bài vượt sàn xây được (T112) — kiểm trước lời gọi mô hình đầu tiên. */
export function infeasibleBrief(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
): string | null {
  const input = contextInput(deps, params, variant);
  return briefInfeasible(input, planContext(input));
}

function contextFor(deps: PlanStepDeps, params: AiDesignParams, variant: PlanVariant): PlanContext {
  return planContext(contextInput(deps, params, variant));
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
  retrying: boolean,
  outcome: Parameters<typeof recordAiCall>[3],
  purpose?: string,
): Promise<string | null> {
  // Vòng sửa mặt bằng chạy tuyến `revise_route` thì ghi đúng tuyến ấy và giá của nó (lượt sửa theo yêu cầu kỹ sư thì
  // không — nó có `purpose` riêng và chạy tuyến kỹ sư chọn).
  const revise = retrying && purpose === undefined ? deps.revise : undefined;
  return recordAiCall(
    deps.repo.db,
    scope,
    {
      route: revise?.route ?? params.textRoute,
      // Hai việc khác nhau nên hai mã khác nhau: tỷ lệ phương án phải sửa là con số cần đo để biết lời
      // dẫn tốt tới đâu. `plan_level` / `plan_level_resample` là của luồng mỗi-tầng-một-lượt trước
      // 15/09/2026, `plan` / `plan_repair` của luồng trước 13/09/2026 — giữ nguyên ở các dòng cũ.
      purpose: purpose ?? (retrying ? 'plan_house_revise' : 'plan_house'),
      dataClass: AI_DIGEST_DATA_CLASS,
      promptVersion: deps.prompts.version,
    },
    outcome,
    revise ? revise.pricing : deps.pricing,
    deps.promptStore,
  );
}

// ── Sửa theo yêu cầu kỹ sư (T53) ────────────────────────────────────────────────────────────────

/** Mã bước của lượt sửa — `n` là lần gọi (1 hoặc 2). */
export function editStepId(phase: 'call' | 'apply', n: number): string {
  return `edit-${phase}-${n}`;
}

export function editStepSpecs(): { id: string; label: string }[] {
  return [
    { id: editStepId('call', 1), label: 'AI đọc yêu cầu sửa' },
    { id: editStepId('apply', 1), label: 'Áp thao tác lên bản vẽ và chấm lại' },
  ];
}

export interface EditCallOutcome {
  /** Thao tác đã qua hợp đồng, JSON. `null` khi câu trả lời sai cấu trúc. */
  editJson: string | null;
  issues: string[];
  call: PlanCallRecord;
}

/** Bản gốc + chương trình không gian của nó, đọc bằng khoá Workflow — ném khi không đọc được. */
async function loadEditBase(
  deps: PlanStepDeps,
  params: AiDesignParams,
): Promise<{ id: string; plan: AiFloorPlan; program: AiSpaceProgram }> {
  const baseId = params.edit!.baseArtifactId;
  const base = await deps.repo.get(baseId, params.projectId);
  if (!base || base.kind !== 'ai_floor_plan') {
    throw new AiPlanRejected([{ level: 0, messages: ['Không đọc được phương án cần sửa.'] }]);
  }
  const plan = base.payload as AiFloorPlan;
  const program = await deps.repo.get(plan.program_ref, params.projectId);
  if (!program || program.kind !== 'ai_space_program') {
    throw new AiPlanRejected([
      { level: 0, messages: ['Không đọc được chương trình không gian của phương án cần sửa.'] },
    ]);
  }
  return { id: baseId, plan, program: program.payload as AiSpaceProgram };
}

/** Một lượt gọi mô hình dịch yêu cầu sửa thành thao tác. Không ném khi sai cấu trúc. */
export async function proposeEdit(
  deps: PlanStepDeps,
  params: AiDesignParams,
  retry: { opsJson: string; issues: string[] } | null,
  live?: LevelLiveHooks,
): Promise<EditCallOutcome> {
  const scope = scopeOf(params);
  const { plan } = await loadEditBase(deps, params);
  const recorded = recordingClient(deps.client);
  const request = () => recorded.records[recorded.records.length - 1];
  const started = Date.now();
  try {
    const attempt = await callEditModel({
      client: recorded.client,
      route: params.textRoute,
      prompts: deps.prompts,
      plan,
      labels: deps.labels,
      request: params.edit!.instruction,
      retry: retry
        ? { ops: JSON.parse(retry.opsJson) as AiPlanEdit['ops'], issues: retry.issues }
        : null,
      ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      ...(live ? { onProgress: live.onProgress, signal: live.signal } : {}),
    });
    const logged = {
      ...attempt.call,
      status: attempt.edit ? ('ok' as const) : ('rejected' as const),
      request: request(),
    };
    const callId = await logCall(deps, scope, params, retry !== null, logged, 'plan_house_edit');
    live?.onLogged({ callId, ...logged });
    return {
      editJson: attempt.edit ? JSON.stringify(attempt.edit) : null,
      issues: attempt.issues,
      call: attempt.call,
    };
  } catch (error) {
    const failed = {
      provider: deps.provider,
      model: deps.model,
      usage: (error instanceof LlmCallFailed && error.usage) || {
        inputTokens: null,
        outputTokens: null,
      },
      latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || Date.now() - started,
      status: 'failed' as const,
      errorCode: live?.signal.aborted
        ? 'cancelled'
        : error instanceof Error
          ? error.name
          : 'unknown',
      request: request(),
    };
    const callId = await logCall(deps, scope, params, retry !== null, failed, 'plan_house_edit');
    live?.onLogged({ callId, ...failed });
    throw error;
  }
}

export type EditApplyOutcome =
  | { written: WriteOutcome }
  /** Yêu cầu cần đổi bố cục: luồng gửi lại ý định cả nhà cho lượt `revise`. */
  | { relayout: string; previousJson: string }
  | { rejected: string[]; opsJson: string | null };

/**
 * Áp thao tác lên bản gốc, và ghi bản sửa khi qua cổng — MỘT bước: `repo.write` băm nội dung nên chạy
 * lại bước là ghi đè đúng artifact ấy (`reused`), không đúc thêm.
 */
export async function applyEditStep(
  deps: PlanStepDeps,
  params: AiDesignParams,
  variant: PlanVariant,
  proposal: EditCallOutcome,
): Promise<EditApplyOutcome> {
  if (!proposal.editJson) {
    return {
      rejected: proposal.issues.length
        ? proposal.issues
        : ['Câu trả lời của AI không đọc được thành thao tác sửa.'],
      opsJson: null,
    };
  }
  const edit = JSON.parse(proposal.editJson) as AiPlanEdit;
  const base = await loadEditBase(deps, params);

  const relayout = edit.ops.find((op) => op.op === 'relayout');
  if (relayout) {
    if (!base.plan.house_intent) {
      return {
        rejected: [
          'Yêu cầu này cần xếp lại bố cục, nhưng phương án được tạo trước khi lưu ý định cả nhà — chạy lại mặt bằng rồi sửa.',
        ],
        opsJson: null,
      };
    }
    return {
      relayout: relayout.request ?? params.edit!.instruction,
      previousJson: JSON.stringify(base.plan.house_intent),
    };
  }
  if (edit.ops.length === 0) {
    return {
      rejected: [
        edit.unsupported.length
          ? `AI không tìm được thao tác nào cho yêu cầu này: ${edit.unsupported.join('; ')}`
          : 'AI không tìm được thao tác nào cho yêu cầu này. Nói rõ phòng nào, đổi thế nào.',
      ],
      opsJson: null,
    };
  }

  const result = applyPlanEdits({
    base: base.plan,
    program: base.program,
    ops: edit.ops,
    contextInput: contextInput(deps, params, variant),
    context: contextFor(deps, params, variant),
    call: proposal.call,
    route: params.textRoute,
    promptVersion: deps.prompts.version,
  });
  if (!result.final) return { rejected: result.issues, opsJson: JSON.stringify(edit.ops) };

  const scope = scopeOf(params);
  const programChanged = JSON.stringify(result.program) !== JSON.stringify(base.program);
  const programId = programChanged
    ? (
        await deps.repo.write({
          scope,
          kind: 'ai_space_program',
          payload: result.program,
          inputs: [result.program.brief_ref],
          step: 'ai_program_propose',
          params: { edit_of: base.plan.program_ref, variant: variant.id },
          setHead: false,
        })
      ).id
    : base.plan.program_ref;

  const final = result.final;
  const payload: AiFloorPlan = {
    ...final.payload,
    program_ref: programId,
    variant_label: `${(base.plan.variant_label ?? variant.id).replace(/ · sửa \d+$/, '')} · sửa ${editRound(base.plan) + 1}`,
    ...(base.plan.house_intent ? { house_intent: base.plan.house_intent } : {}),
    // Mái dựng lại theo tầng trên cùng ĐÃ SỬA — khu mái mô hình khai ở bản gốc (nếu có) vẫn là đầu vào.
    ...roofOf(
      contextFor(deps, params, variant),
      final.payload,
      (base.plan.house_intent ?? { rooms: [] }) as HouseIntent,
      deps,
    ),
    generator: {
      ...final.payload.generator,
      edit: { instruction: params.edit!.instruction, base_ref: base.id, ops: edit.ops },
    },
  };
  // Lineage: bản sửa trỏ bản gốc VÀ chương trình. Mã bước dùng lại `ai_plan_propose` — bảng cạnh chỉ
  // nhận các mã đã khai trong CSDL; `params.edit` nói đây là bản sửa.
  const artifact = await deps.repo.write({
    scope,
    kind: 'ai_floor_plan',
    payload,
    inputs: [base.id, programId],
    step: 'ai_plan_propose',
    params: {
      route: params.textRoute,
      prompt_version: deps.prompts.version,
      variant: variant.id,
      edit: base.id,
    },
    setHead: false,
  });

  return {
    written: {
      variantId: variant.id,
      artifactId: artifact.id,
      programArtifactId: programId,
      reused: artifact.reused,
      wallsDerived: final.wallsDerived,
      findings: final.check.findings,
      notes: [
        ...result.applied.map((message) => ({ code: 'edit_applied', message })),
        ...(edit.explanation ? [{ code: 'edit_explanation', message: edit.explanation }] : []),
        ...edit.unsupported.map((message) => ({ code: 'edit_unsupported', message })),
        ...final.notes,
      ],
      repaired: false,
      resampledLevels: [],
      attempts: 1,
      score: {
        version: final.score.scoreVersion,
        points: final.score.points,
        scoredWeight: final.score.scoredWeight,
      },
      ...thresholdOf(
        final.score,
        deps.quality.acceptPercent,
        deps.quality.acceptGroupFloorPercent,
        deps.quality.acceptGroupFloors,
      ),
    },
  };
}

/** Bản gốc đã là bản sửa thứ mấy — đọc từ nhãn, để bản mới đánh số tiếp. */
function editRound(plan: AiFloorPlan): number {
  const match = /· sửa (\d+)$/.exec(plan.variant_label ?? '');
  return match ? Number(match[1]) : 0;
}
