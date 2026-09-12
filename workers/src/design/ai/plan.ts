/**
 * Mặt bằng do MÔ HÌNH khai, CHƯƠNG TRÌNH cầm bút — bước 2 của nhánh AI (T15, 09/09/2026).
 *
 * ── Việc của mô hình và việc của mã ──────────────────────────────────────────────────
 *
 * Mô hình khai PHÒNG và LỖ MỞ TRÊN CẠNH PHÒNG (`contracts/ai-plan-rooms`), kèm thang, ô trống,
 * tên và diện tích. Nó KHÔNG khai tường — đó là T23 (12/09/2026), thay phần khai tường của T15 và
 * giữ nguyên phần «mô hình khai dữ liệu, chương trình cầm bút». Mã tất định lo phần còn lại:
 *
 *  · **điền** `schema_version`, `program_ref`, `variant_id`, `strategy`, `north_deg`,
 *    `generator` — sáu trường mô hình không có thẩm quyền hoặc không biết. Ba lượt gọi song
 *    song sẽ đặt trùng `variant_id` nếu để mô hình tự chọn, và mô hình không biết hướng nhà;
 *  · **suy tường** từ chữ nhật phòng, ở MỌI lượt (`plan-geometry.ts`), và neo lỗ mở lên tường
 *    vừa suy — nên tường và phòng không thể lệch nhau: chúng cùng một nguồn;
 *  · **điền** `levels[].outline_faces` từ hiện trạng bốn phía của đầu bài (`outline-faces.ts`);
 *  · **kiểm** bằng `plan-check.ts` (chặn → đúng MỘT lượt sửa);
 *  · **vẽ** bằng `draw/` — không hỏi mô hình một nét nào.
 *
 * ── Vì sao tệp này chia thành bốn mảnh rời ──────────────────────────────────────────
 *
 * `callPlanModel` · `checkProposal` · `finalisePlan` · và `generateAiPlan` ghép cả ba. Lý do
 * chia là TIỀN: Workflow lưu kết quả từng `step.do` và thử lại cả bước khi bước đó hỏng. Gộp
 * «gọi → kiểm → sửa» vào một bước thì một lần rớt mạng ở lượt sửa sẽ gọi lại cả lượt đề xuất
 * — một lượt mặt bằng tốn 0,15–0,30 USD, nên đó là tiền thật tiêu hai lần cho cùng một việc.
 * Chia ra thì mỗi lượt gọi là một bước riêng, thử lại không bao giờ mua lại thứ đã mua.
 *
 * `generateAiPlan` vẫn tồn tại cho tuyến đồng bộ và cho kiểm thử: nó ghép đúng các mảnh ấy
 * theo đúng thứ tự, nên không có đường chạy thứ hai để lệch.
 *
 * ── Vòng sửa, và vì sao chỉ một ─────────────────────────────────────────────────────
 *
 * Sai cấu trúc hoặc sai kiểm → một lượt sửa kèm danh sách lỗi CỤ THỂ và kèm chính bản cũ để
 * mô hình vá chứ không vẽ lại. Lượt thứ hai tốn tiền đúng như lượt đầu mà tỷ lệ cứu được thấp
 * hẳn, nên không có vòng lặp.
 *
 * Sau lượt sửa, kết quả vẫn được LƯU VÀ TRẢ VỀ kèm findings — trừ đúng một trường hợp: không
 * lượt nào cho ra cấu trúc hợp lệ (`AiPlanRejected`), lúc đó không có gì để lưu. Trả về một
 * mặt bằng có chỗ đáng ngờ và nói rõ chỗ nào là việc có ích; bác cả bản vì một cánh cửa lệch
 * 3 cm là bắt người dùng trả tiền cho một lượt gọi nữa.
 *
 * ── Dữ liệu gửi đi ──────────────────────────────────────────────────────────────────
 *
 * Hạng 2: đầu bài + khảo sát đã lược danh tính, chương trình không gian đã chốt, hình bao xây
 * được (từ khoảng lùi ĐẦU BÀI khai), quy ước cấu tạo của NVG, và ý đồ bố cục của riêng phương
 * án này. Ngưỡng quy chuẩn chỉ đi kèm khi kỹ sư đã tích gói (T20); mặc định là không.
 */

import {
  aiPlanRoomsSchema,
  type AiBriefDigest,
  type AiFloorPlan,
  type AiPlanRooms,
  type AiSpaceProgram,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import planSchemaJson from '../../../../contracts/ai-plan-rooms.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { ConstructionNorms } from '../kb/construction';
import type { StructuredCallResult, TextModelClient } from '../llm/text-client';
import type { RulePack } from '../rules/rule-pack';
import { siteFaces, type Face, type SiteContextTable } from '../kb/site-context';
import { buildableFromDigest, type BuildableBox } from './buildable';
import type { Rect } from './draw/geometry';
import type { DrawNote } from './draw/notes';
import { outlineFaces } from './outline-faces';
import { checkPlan, type PlanCheckResult, type PlanIssue } from './plan-check';
import { levelFromRooms } from './plan-geometry';
import type { AiPrompts } from './prompts';
import { injectableRules, type InjectedRule } from './rule-packs';
import { MEASURABLE_ON_PLAN } from './rule-warnings';

const SCHEMA_VERSION = '1.0.0';

/**
 * Ngân sách token đầu ra cho một phương án mặt bằng.
 *
 * Ước lượng dung lượng dữ liệu: biệt thự 3 tầng ≈ 6.000 token, nhà phố 5 tầng ≈ 15.000. Trần
 * này gấp khoảng bốn lần chỗ cần, và chỗ thừa là dành cho token SUY LUẬN — thứ cũng tính vào
 * trần. Đây chính là thứ phương án cũ (mô hình tự viết chuỗi SVG, 30.000–60.000 token) làm tràn.
 */
const PLAN_OUTPUT_TOKENS = 32_000;

/**
 * Sáu trường Worker điền, lược khỏi CÂU TRẢ LỜI của mô hình.
 *
 * Từ T23 chúng không còn nằm trong lược đồ gửi đi — hợp đồng `ai-plan-rooms` không có chúng. Nhưng
 * phép lược ở phía câu trả lời thì vẫn cần: mô hình thỉnh thoảng điền thêm một trường nó từng thấy
 * ở đâu đó, và `aiPlanRoomsSchema` là `strict` nên một trường thừa sẽ đốt cả một lượt sửa để đổi
 * lấy việc xoá một khoá mà ta ghi đè ngay sau đó. Khoá LẠ thì vẫn chặn như cũ — đó là lỗi thật,
 * đáng một lượt sửa.
 */
const WORKER_FILLED = [
  'schema_version',
  'program_ref',
  'variant_id',
  'strategy',
  'north_deg',
  'generator',
] as const;

/** Hướng la bàn của từng mã hướng nhà, độ, cùng chiều kim đồng hồ từ hướng bắc. */
const BEARINGS: Record<string, number> = {
  B: 0,
  BD: 45,
  D: 90,
  DN: 135,
  N: 180,
  TN: 225,
  T: 270,
  TB: 315,
};

/** Không lượt nào cho ra cấu trúc hợp lệ — lỗi nghiệp vụ đọc được, không thử lại. */
export class AiPlanRejected extends Error {
  readonly retryable = false;

  constructor(
    readonly issues: string[],
    readonly attempts: number,
  ) {
    super(`AI chưa xếp được mặt bằng đọc được sau ${attempts} lượt. ${issues[0] ?? ''}`.trim());
    this.name = 'AiPlanRejected';
  }
}

/** Một phương án cần xếp: mã và ý đồ bố cục, do Worker đặt chứ không hỏi mô hình. */
export interface PlanVariant {
  /** `AI-A`, `AI-B`, `AI-C`. */
  id: string;
  label: string;
  /** Ý đồ bố cục gửi kèm lời dẫn để ba phương án khác nhau về CẤU TRÚC. */
  strategy: string;
}

/**
 * Tri thức tiêm vào lời dẫn.
 *
 * Mọi con số ở đây đến từ ĐẦU BÀI, từ chương trình không gian hoặc từ `kb/`. Ngưỡng quy chuẩn
 * chỉ vào qua `constraints`, và chỉ khi kỹ sư đã tích gói (T20).
 */
export interface PlanKnowledge {
  floors: number;
  building_type: string;
  /** Hình bao xây được, cm nguyên — cùng hệ toạ độ mà mô hình phải khai. */
  buildable_cm: { x0: number; y0: number; x1: number; y1: number };
  /** Kích thước thửa, cm — để mô hình biết phần đất ngoài hình bao xây được còn bao nhiêu. */
  plot_cm: { width: number; depth: number };
  variant_id: string;
  strategy: string;
  /** Danh mục phòng phải xếp, kèm nhãn tiếng Việt để mô hình hiểu mã. */
  program: {
    id: string;
    type: string;
    vi: string;
    level: number;
    target_area_m2: number;
    ensuite_of: string | null;
  }[];
  construction: ConstructionNorms;
  constraints: InjectedRule[];
}

/** Mọi thứ tất định suy được TRƯỚC lượt gọi đầu tiên — dùng lại nguyên vẹn cho lượt sửa. */
export interface PlanContext {
  knowledge: PlanKnowledge;
  buildable: BuildableBox;
  /** Hình bao xây được đổi sang cm — đơn vị của hợp đồng mặt bằng. */
  buildableCm: Rect;
  northDeg: number;
  /**
   * Mặt thửa lấy được sáng, suy từ hiện trạng bốn phía của đầu bài (`kb/site_context.yaml`).
   *
   * Worker điền `levels[].outline_faces` từ đây. KHÔNG hỏi mô hình: hiện trạng bốn phía là
   * khảo sát, tức dữ liệu đã có trước lượt gọi đầu tiên — xem `outline-faces.ts`.
   */
  openFaces: readonly Face[];
  /** Lược đồ gửi cho mô hình: hợp đồng `ai-floor-plan` trừ sáu trường Worker điền. */
  schema: Record<string, unknown>;
}

export interface PlanContextInput {
  digest: AiBriefDigest;
  program: AiSpaceProgram;
  variant: PlanVariant;
  /** Nhãn tiếng Việt theo mã phòng — gửi kèm để mô hình hiểu mã. */
  labels: Record<string, string>;
  construction: ConstructionNorms;
  /** Gói quy tắc kỹ sư đã chọn, đã gộp. Rỗng là mặc định hợp lệ (T20). */
  rules: RulePack;
  /**
   * Bảng hiện trạng bốn phía (`kb/site_context.yaml`), ĐI QUA ĐẦU VÀO chứ không import tệp dữ
   * liệu ở đây: tệp YAML chỉ nạp được qua bộ dựng của Worker, nên một lần import trong mô-đun
   * thuần này làm cả tệp kiểm thử không tải nổi. Cùng khuôn với `construction`.
   */
  siteContext: SiteContextTable;
}

export function planContext(input: PlanContextInput): PlanContext {
  const buildable = buildableFromDigest(input.digest);
  return {
    knowledge: planKnowledge(input, buildable),
    buildable,
    buildableCm: buildableRectCm(buildable),
    northDeg: northDegFor(input.digest.site.orientation),
    openFaces: siteFaces(input.digest.site, input.siteContext).open,
    schema: planProposalJsonSchema(),
  };
}

function planKnowledge(input: PlanContextInput, buildable: BuildableBox): PlanKnowledge {
  const { digest, program, variant, labels } = input;
  return {
    floors: digest.floors,
    building_type: digest.building_type,
    buildable_cm: buildableRectCm(buildable),
    plot_cm: {
      width: Math.round(digest.site.width_m * 100),
      depth: Math.round(digest.site.depth_m * 100),
    },
    variant_id: variant.id,
    strategy: variant.strategy,
    program: program.spaces.map((space) => ({
      id: space.id,
      type: space.type,
      vi: labels[space.type] ?? space.type,
      level: space.level,
      target_area_m2: space.target_area_m2,
      ensuite_of: space.ensuite_of ?? null,
    })),
    construction: input.construction,
    // Cùng TẬP VỊ TỪ mà `rule-warnings.ts` đo lại sau — một nguồn duy nhất, nên không bao giờ
    // cảnh báo về một ngưỡng mà mô hình chưa từng được biết (T20, tác động cả hai chiều).
    constraints: injectableRules(input.rules, digest.building_type, MEASURABLE_ON_PLAN),
  };
}

/** Hình bao xây được đổi sang cm — đơn vị của hợp đồng mặt bằng. */
export function buildableRectCm(buildable: BuildableBox): Rect {
  return {
    x0: Math.round(buildable.x0 * 100),
    y0: Math.round(buildable.y0 * 100),
    x1: Math.round(buildable.x1 * 100),
    y1: Math.round(buildable.y1 * 100),
  };
}

/**
 * Góc hướng bắc so với trục +y của bản vẽ.
 *
 * `orientation` trong đầu bài là hướng NHÀ — hướng mặt tiền nhìn ra. Trục +y của bản vẽ chạy
 * vào sâu thửa, tức ngược với hướng nhà, nên la bàn của +y là «hướng nhà + 180°». Góc cần trả
 * là từ +y quay về bắc, cùng chiều kim đồng hồ: `(0 − (hướng + 180)) mod 360`.
 *
 * Thiếu hướng thì trả 0 — mũi tên chỉ lên đầu tờ. Không tự đoán một hướng: hướng nhà là dữ
 * liệu người dùng nhập, và một mũi tên bắc sai còn tệ hơn một mũi tên quy ước (CLAUDE.md 5.2).
 */
export function northDegFor(orientation: string | null | undefined): number {
  const bearing = orientation ? BEARINGS[orientation] : undefined;
  if (bearing === undefined) return 0;
  return (540 - bearing) % 360;
}

/**
 * Lược đồ gửi cho mô hình: nguyên hợp đồng `ai-plan-rooms`, không cắt gì.
 *
 * Trước T23 hàm này lược sáu trường Worker điền khỏi hợp đồng artifact. Nay hai ranh giới có hai
 * hợp đồng riêng, vì chúng là hai HÌNH DẠNG khác nhau chứ không phải một hình dạng bị cắt bớt: lỗ
 * mở của mô hình neo vào cạnh phòng, lỗ mở của artifact neo vào đoạn tường. Phần TRÙNG giữa hai
 * hợp đồng có `contracts-parity.test.ts` canh để không lệch.
 */
export function planProposalJsonSchema(): Record<string, unknown> {
  return structuredClone(planSchemaJson) as Record<string, unknown>;
}

/** Phần mô hình khai — hợp đồng `ai-plan-rooms`. */
const proposalSchema = aiPlanRoomsSchema;

export type AiPlanProposal = AiPlanRooms;

/** Bỏ sáu trường Worker điền khỏi câu trả lời của mô hình, giữ nguyên mọi khoá khác. */
export function stripWorkerFields(json: unknown): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const copy = { ...(json as Record<string, unknown>) };
  for (const key of WORKER_FILLED) delete copy[key];
  return copy;
}

/** Phần của một lượt gọi cần LƯU LẠI giữa hai bước Workflow — nhẹ, serialise được. */
export interface PlanCallRecord {
  provider: string;
  model: string;
  usage: StructuredCallResult['usage'];
  latencyMs: number;
}

export interface PlanAttempt {
  /** `null` khi câu trả lời không qua được hợp đồng — `issues` nói sai ở đâu. */
  proposal: AiPlanProposal | null;
  issues: string[];
  call: PlanCallRecord;
}

export interface PlanCallInput {
  client: TextModelClient;
  route: string;
  prompts: AiPrompts;
  digest: AiBriefDigest;
  context: PlanContext;
  /** Bản cũ để mô hình VÁ. Có mặt nghĩa là đây là lượt sửa. */
  previous?: AiPlanProposal | null;
  /** Danh sách lỗi của lượt trước, tiếng Việt, cụ thể. */
  issues?: readonly string[];
}

/** Một lượt gọi mô hình. Đây là chỗ DUY NHẤT trong tệp này tốn tiền. */
export async function callPlanModel(input: PlanCallInput): Promise<PlanAttempt> {
  // Có DANH SÁCH LỖI là đủ để đây là lượt sửa — không đòi phải có bản cũ. Lượt đầu trả về cấu
  // trúc hỏng thì không có bản cũ để vá, nhưng vẫn có lý do cụ thể để nói; gọi lại y nguyên lời
  // dẫn cũ là mua đúng một lượt nữa để nhận lại đúng cái sai vừa rồi.
  const repairing = (input.issues?.length ?? 0) > 0;
  const system = repairing
    ? `${input.prompts.floorPlan.system}\n\n${input.prompts.floorPlan.repair.replace(
        '{issues}',
        (input.issues ?? []).map((issue) => `- ${issue}`).join('\n'),
      )}`
    : input.prompts.floorPlan.system;

  const result = await input.client.complete(input.route, AI_DIGEST_DATA_CLASS, {
    system,
    prompt: planPrompt(input.digest, input.context.knowledge, input.previous ?? null),
    schema: input.context.schema,
    maxOutputTokens: PLAN_OUTPUT_TOKENS,
  });

  const call: PlanCallRecord = {
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
  const parsed = proposalSchema.safeParse(stripWorkerFields(result.json));
  if (!parsed.success) return { proposal: null, issues: describeZod(parsed.error), call };
  return { proposal: parsed.data, issues: [], call };
}

/** Lời dẫn người dùng: đầu bài + chương trình + tri thức, dạng JSON để mô hình không phải đoán. */
export function planPrompt(
  digest: AiBriefDigest,
  knowledge: PlanKnowledge,
  previous?: AiPlanProposal | null,
): string {
  // Bản cũ đi KÈM lượt sửa để mô hình vá chứ không vẽ lại: vẽ lại thì chỗ đang đúng cũng đổi,
  // và người soát phải đọc lại từ đầu một bản khác hẳn.
  //
  // KHÔNG thụt lề (T26, 12/09/2026). `JSON.stringify(…, null, 1)` thêm một dấu cách cho mỗi bậc
  // của mỗi dòng, và thân lời gọi này là một cây sâu vài bậc với hàng trăm dòng — đo được ~2.100
  // ký tự khoảng trắng thuần trên một lượt `plan`, tức 27% thân lời gọi, không mang một tin nào.
  // JSON không thụt lề vẫn là JSON hợp lệ và mô hình đọc y như cũ.
  //
  // Đổi lại: nhật ký khó đọc hơn khi gỡ lỗi. Chỗ bù là `design_ai_call` — dán chuỗi ra và chạy
  // `python3 -m json.tool` là có bản đẹp, không cần mỗi lượt gọi trả tiền cho nó.
  return JSON.stringify(
    previous ? { brief: digest, knowledge, previous } : { brief: digest, knowledge },
  );
}

export interface PlanAssembleInput {
  proposal: AiPlanProposal;
  context: PlanContext;
  program: AiSpaceProgram;
  programRef: string;
  variant: PlanVariant;
  call: PlanCallRecord;
  route: string;
  promptVersion: string;
  repaired: boolean;
  /** Quy ước cấu tạo của NVG — nguồn bề dày tường khi chương trình suy tường (T23). */
  construction: ConstructionNorms;
  /** Loại phòng không bắt buộc có cửa — nhóm `outdoor` của `kb/room_vocabulary.yaml`. */
  doorExemptTypes: ReadonlySet<string>;
  /** Loại phòng giao thông đứng — nhóm `circulation`, để cổng G2 không bắt oan ô thang. */
  verticalTypes: ReadonlySet<string>;
  /** Loại phòng ngoài trời — cạnh biên của chúng là LAN CAN, không phải tường (T23). */
  outdoorTypes: ReadonlySet<string>;
}

export interface AssembledPlan {
  payload: AiFloorPlan;
  /**
   * Mô hình tự mâu thuẫn ở bước neo lỗ mở: cửa trỏ vào phòng không có, cửa vượt khỏi cạnh phòng,
   * hai lỗ chồng nhau trên một cạnh, cửa sổ trên cạnh chung với phòng trong nhà. Đều CHẶN, và đều
   * đi vào lời dẫn của lượt sửa.
   */
  issues: PlanIssue[];
  /** Chỗ chương trình tự xử lý — hiện lên màn hình, không im lặng. */
  notes: DrawNote[];
}

/**
 * Ghép phần mô hình khai thành artifact `ai_floor_plan`. Hàm THUẦN.
 *
 * Ba việc, không chỉ một phép ghép: điền sáu trường Worker điền · SUY TƯỜNG từ chữ nhật phòng và
 * neo lỗ mở lên tường vừa suy (T23, `plan-geometry.ts`) · điền `outline_faces` từ hiện trạng bốn
 * phía. Cả ba đều tất định, nên cùng một đề xuất luôn cho cùng một mã băm artifact.
 */
export function assemblePlan(input: PlanAssembleInput): AssembledPlan {
  const issues: PlanIssue[] = [];
  const notes: DrawNote[] = [];
  const levels = input.proposal.levels.map((level) => {
    const geometry = levelFromRooms(level, input.construction, input.outdoorTypes);
    issues.push(...geometry.issues);
    notes.push(...geometry.notes);
    return {
      ...geometry.level,
      // Thuộc tính mặt của từng cạnh hình bao — Worker điền, không hỏi mô hình. Đây là thứ quyết
      // định một cửa sổ có được tính là mặt thoáng hay không (`outline-faces.ts`).
      outline_faces: outlineFaces(
        geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
        input.context.openFaces,
      ),
    };
  });

  return {
    payload: {
      schema_version: SCHEMA_VERSION,
      program_ref: input.programRef,
      variant_id: input.variant.id,
      // Nhãn của mô hình thắng nhãn mặc định: nó mô tả CẤU TRÚC thật của bản vừa xếp, còn nhãn
      // của Worker chỉ là tên ý đồ đã gửi đi.
      variant_label: input.proposal.variant_label || input.variant.label,
      strategy: input.variant.strategy,
      north_deg: input.context.northDeg,
      levels,
      rationale: input.proposal.rationale,
      generator: {
        kind: 'ai',
        provider: input.call.provider,
        model: input.call.model,
        route: input.route,
        prompt_version: input.promptVersion,
        repaired: input.repaired,
        // LUÔN bật từ T23: tường của nhánh AI không còn đường nào khác để ra đời. Tờ vẽ và màn
        // hình vì vậy luôn in «Tường do chương trình suy từ phòng, không phải của AI».
        walls_derived: true,
      },
    },
    issues,
    notes,
  };
}

/** Kiểm một đề xuất — hàm THUẦN, không tốn gì, nên gọi lại bao nhiêu lần cũng được. */
export function checkProposal(input: PlanAssembleInput): PlanCheckResult {
  return checkAssembled(assemblePlan(input), input);
}

/** Kiểm một artifact đã ghép, gộp cả lỗi của bước neo lỗ mở. */
function checkAssembled(assembled: AssembledPlan, input: PlanAssembleInput): PlanCheckResult {
  const check = checkPlan({
    plan: assembled.payload,
    program: input.program,
    buildable: input.context.buildableCm,
    doorExemptTypes: input.doorExemptTypes,
    verticalTypes: input.verticalTypes,
  });
  return { ...check, blocking: [...assembled.issues, ...check.blocking] };
}

export interface PlanFinal {
  payload: AiFloorPlan;
  /** Kết quả kiểm CUỐI CÙNG, trên chính dữ liệu sẽ được vẽ và lưu. */
  check: PlanCheckResult;
  /** Chỗ chương trình đã tự xử lý — hiện lên màn hình, không im lặng. */
  notes: DrawNote[];
  /**
   * LUÔN `true` từ T23 (12/09/2026) — giữ trường lại vì artifact đúc trước ngày ấy mang `false`,
   * và màn hình phải đọc đúng cờ của chính artifact đang xem chứ không đoán theo ngày.
   */
  wallsDerived: boolean;
}

/** Chốt một phương án: ghép artifact (kèm suy tường) rồi kiểm. Hàm THUẦN. */
export function finalisePlan(input: PlanAssembleInput): PlanFinal {
  const assembled = assemblePlan(input);
  return {
    payload: assembled.payload,
    check: checkAssembled(assembled, input),
    notes: assembled.notes,
    wallsDerived: true,
  };
}

export interface AiPlanInput extends PlanContextInput {
  programRef: string;
  route: string;
  client: TextModelClient;
  prompts: AiPrompts;
  doorExemptTypes: ReadonlySet<string>;
  verticalTypes: ReadonlySet<string>;
  outdoorTypes: ReadonlySet<string>;
}

export interface AiPlanResult extends PlanFinal {
  buildable: BuildableBox;
  calls: PlanCallRecord[];
  repaired: boolean;
}

/**
 * Một phương án từ đầu đến cuối: gọi → kiểm → (sửa → kiểm) → chốt.
 *
 * Tuyến ĐỒNG BỘ và tuyến kiểm thử dùng hàm này. Workflow thì gọi từng mảnh riêng để mỗi lượt
 * gọi là một bước thử lại được — xem ghi chú đầu tệp.
 */
export async function generateAiPlan(input: AiPlanInput): Promise<AiPlanResult> {
  const context = planContext(input);
  const calls: PlanCallRecord[] = [];

  let attempt = await callPlanModel({
    client: input.client,
    route: input.route,
    prompts: input.prompts,
    digest: input.digest,
    context,
  });
  calls.push(attempt.call);

  const assemble = (proposal: AiPlanProposal, call: PlanCallRecord): PlanAssembleInput => ({
    proposal,
    context,
    program: input.program,
    programRef: input.programRef,
    variant: input.variant,
    call,
    route: input.route,
    promptVersion: input.prompts.version,
    repaired: calls.length > 1,
    construction: input.construction,
    doorExemptTypes: input.doorExemptTypes,
    verticalTypes: input.verticalTypes,
    outdoorTypes: input.outdoorTypes,
  });

  let proposal = attempt.proposal;
  let issues = attempt.issues;
  if (proposal) {
    const check = checkProposal(assemble(proposal, attempt.call));
    issues = check.blocking.map((issue) => issue.message);
  }

  if (issues.length) {
    const repair = await callPlanModel({
      client: input.client,
      route: input.route,
      prompts: input.prompts,
      digest: input.digest,
      context,
      previous: proposal,
      issues,
    });
    calls.push(repair.call);
    // Lượt sửa trả về cấu trúc hỏng thì bản cũ vẫn là thứ tốt nhất đang có — bỏ nó đi là đổi
    // một lỗi nhỏ thành không có gì để trả về.
    if (!repair.proposal) {
      if (!proposal) throw new AiPlanRejected(repair.issues, calls.length);
    } else if (!proposal) {
      proposal = repair.proposal;
      attempt = repair;
    } else {
      const after = checkProposal(assemble(repair.proposal, repair.call)).blocking.length;
      if (keepRepaired(issues.length, after)) {
        proposal = repair.proposal;
        attempt = repair;
      }
    }
  }

  if (!proposal) throw new AiPlanRejected(issues, calls.length);

  const last = calls[calls.length - 1]!;
  const final = finalisePlan(assemble(proposal, last));
  return { ...final, buildable: context.buildable, calls, repaired: calls.length > 1 };
}

/**
 * Giữ bản đã sửa hay bản cũ?
 *
 * Bản đã sửa thắng khi nó KHÔNG nhiều lỗi chặn hơn bản cũ. Một lượt sửa làm bản vẽ tệ đi là
 * chuyện có thật — mô hình vá một chỗ và làm lệch ba chỗ khác — và lúc ấy bản cũ mới là thứ đáng
 * lưu. Bằng nhau thì chọn bản đã sửa, vì nó được yêu cầu sửa đúng những chỗ đã nêu.
 *
 * Hàm một dòng này tồn tại để tuyến đồng bộ và Workflow quyết định GIỐNG NHAU: hai bản thực thi
 * của cùng một luật là hai bản sẽ lệch, và lệch ở đây nghĩa là cùng một đầu vào cho ra hai
 * artifact khác nhau tuỳ chạy đường nào.
 */
export function keepRepaired(blockingBefore: number, blockingAfter: number): boolean {
  return blockingAfter <= blockingBefore;
}

function describeZod(error: ZodError): string[] {
  return error.issues
    .slice(0, 10)
    .map((issue) => `Sai cấu trúc ở ${issue.path.join('.') || 'gốc'}: ${issue.message}`);
}
