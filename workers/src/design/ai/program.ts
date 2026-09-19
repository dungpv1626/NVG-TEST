/**
 * Chương trình không gian do MÔ HÌNH lập — bước đầu của nhánh AI (T15–T18, 09/09/2026).
 *
 * ── Viết lại ngày 09/09/2026, và vì sao ──────────────────────────────────────────────
 *
 * Bản trước mượn bốn hàm của bộ giải (`buildableFootprint`, `buildAdjacency` từ
 * `program/engine.ts`, `checkPlausibility`, `bandFor`) và đúc ra `space_program` — hợp đồng
 * của bộ giải, với những trường chỉ bộ giải điền được. Haan chốt bộ giải sẽ bị XOÁ, nên mọi
 * đường nối ấy là ngày mai nhánh AI vỡ theo. Bản này không nối gì sang đó nữa; ranh giới do
 * `__tests__/ai-independence.test.ts` canh.
 *
 * ── Vai trò của mô hình và vai trò của mã ────────────────────────────────────────────
 *
 * Mô hình đề xuất DANH MỤC không gian, TẦNG và DIỆN TÍCH MONG MUỐN. Mã tất định lo phần còn lại:
 *
 *  · **kiểm** (chặn, kéo theo một lượt sửa): mã phòng có trong từ vựng · tầng trong 1..N ·
 *    mã tạm không trùng · `ensuite_of` trỏ vào chỗ có thật · mỗi tầng có ít nhất một không
 *    gian · tổng diện tích từng tầng không vượt sàn xây được · đủ không gian mà ĐẦU BÀI đòi ·
 *    số phòng ngủ đúng theo thành phần gia đình;
 *  · **điền**: `id` đánh số theo khuôn `type_n`, `brief_ref`, `generator`;
 *  · **cảnh báo** (không chặn): lệch quy chuẩn quốc gia, đo SAU khi mô hình trả về
 *    (`rule-warnings.ts`).
 *
 * Sai kiểm → đúng MỘT lượt sửa kèm danh sách lỗi cụ thể → vẫn sai → bác
 * (`AiProgramRejected`), không đúc artifact. Không có vòng lặp: gọi lại mô hình để nó tự sửa
 * mãi là đốt tiền vào cùng một loại sai.
 *
 * ── Dữ liệu gửi đi ───────────────────────────────────────────────────────────────────
 *
 * Hạng 2: đầu bài + khảo sát đã lược danh tính (`brief/anonymise.ts`), cộng phần TRI THỨC do
 * Worker tiêm: từ vựng phòng, quy ước cấu tạo (`kb/construction_norms.yaml`), sàn xây được
 * từng tầng, số phòng ngủ bắt buộc. **Không một ngưỡng quy chuẩn nào** — đó là T14, và nó là
 * lý do nhánh AI có giá trị: bó nó bằng đúng ràng buộc của bộ giải là dựng lại bộ giải bằng
 * một công cụ dở hơn.
 */

import { clampText, normaliseProgramIds } from './tree/ids';
import {
  aiSpaceProgramProposalSchema,
  bedroomsFor,
  DERIVED_NEED_CODES,
  bedroomTypeFor,
  type AiBriefDigest,
  type AiSpaceProgram,
  type AiSpaceProgramProposal,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import proposalSchemaJson from '../../../../contracts/ai-space-program-proposal.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import { briefNarrative, modelBody } from '../brief/narrative';
import type { BriefFidelity } from '../kb/brief-fidelity';
import { roomGroups, type VocabularyIndex } from '../kb/vocabulary';
import type {
  CallProgress,
  ReasoningEffort,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import { buildableFromDigest, type BuildableBox } from './buildable';
import { injectableRules, type InjectedRule } from './rule-packs';
import type { RulePack } from '../rules/rule-pack';
import type { AiPrompts } from './prompts';
import { criterionFor, type PlanQuality } from './plan-quality';

const SCHEMA_VERSION = '1.0.0';

/**
 * Ngân sách token đầu ra cho một chương trình không gian.
 *
 * Rộng hơn nhiều so với nhu cầu (một biệt thự 25 phòng ≈ 2.500 token): chỗ thừa là dành cho
 * token SUY LUẬN, thứ cũng tính vào trần này. Đo 08/09: các lượt thật dùng 1.100–2.600 token.
 */
const PROGRAM_OUTPUT_TOKENS = 12_000;

/**
 * Vị từ mà bước LẬP CHƯƠNG TRÌNH hiểu được — hẹp có chủ ý.
 *
 * Ở bước này mới có diện tích, chưa có hình học. Gửi kèm `min_dimension` hay `setback` là gửi
 * con số mô hình không dùng được vào việc gì, và chỉ làm loãng lời dẫn. Chúng thuộc bước xếp
 * mặt bằng.
 */
export const PROGRAM_PREDICATES: ReadonlySet<string> = new Set([
  'min_area',
  'max_area',
  'floor_preference',
  'adjacency',
]);

/** Đề xuất không đạt kiểm sau lượt sửa — lỗi nghiệp vụ đọc được, không thử lại. */
export class AiProgramRejected extends Error {
  readonly retryable = false;
  constructor(
    readonly findings: string[],
    readonly attempts: number,
    /**
     * Mọi lượt gọi đã ra mạng — ĐÃ TÍNH TIỀN dù đề xuất bị bác. Mang theo để nhật ký chi phí và
     * màn hình ghi đúng số token của từng lượt, không gộp thành một dòng không có số.
     */
    readonly calls: StructuredCallResult[] = [],
    /** Lý do bác của từng lượt — hiện lên màn hình để biết vì sao phải sửa. */
    readonly rounds: AiProgramRound[] = [],
  ) {
    super(
      `AI chưa lập được chương trình không gian dùng được sau ${attempts} lượt. ${findings[0] ?? ''}`.trim(),
    );
    this.name = 'AiProgramRejected';
  }
}

export interface AiProgramInput {
  digest: AiBriefDigest;
  briefRef: string;
  route: string;
  client: TextModelClient;
  prompts: AiPrompts;
  vocabulary: VocabularyIndex;
  /** Nhãn tiếng Việt theo mã phòng — gửi kèm để mô hình hiểu mã. */
  labels: Record<string, string>;
  /** Quy ước cấu tạo (`kb/construction_norms.yaml`) — bề dày tường, cao độ tầng, kích thước cửa. */
  construction: unknown;
  /**
   * Gói quy tắc KỸ SƯ đã chọn áp, đã gộp sẵn. Rỗng là trạng thái mặc định và hợp lệ: không
   * tích gì thì mô hình thiết kế tự do và không có cảnh báo nào (T20, 09/09/2026).
   */
  rules: RulePack;
  /** Mức bám đầu bài (`kb/brief_fidelity.yaml`) — sai số diện tích, chỗ đỗ, khép kín. */
  fidelity: BriefFidelity;
  /** Thước chấm mặt bằng (`kb/plan_quality.yaml`) — nguồn của `circulation_share`. Vắng = không gửi. */
  quality?: PlanQuality;
  /** Mức suy nghĩ kỹ sư chọn cho lượt chạy này; vắng = cấu hình tuyến. */
  reasoningEffort?: ReasoningEffort;
  /** Tiến độ của lượt gọi đang chạy — `round` bắt đầu từ 1. */
  onCallProgress?: (round: number, progress: CallProgress) => void;
  /** Huỷ giữa chừng — nút «Dừng». Huỷ thì không gọi lượt sửa. */
  signal?: AbortSignal;
  /** Một lượt gọi vừa xong và vừa được kiểm — kèm lý do bác nếu có. */
  onRoundDone?: (round: AiProgramRound, call: StructuredCallResult) => void;
}

/** Một lượt gọi mô hình trong vòng lập chương trình, và kết quả kiểm của nó. */
export interface AiProgramRound {
  round: number;
  /** `accepted` = qua bộ kiểm; `rejected` = bị bác, `issues` nói vì sao. */
  outcome: 'accepted' | 'rejected';
  issues: string[];
}

export interface AiProgramResult {
  payload: AiSpaceProgram;
  rationale: string;
  assumptions: string[];
  /** Ghi chú `why` theo mã không gian đã đánh số lại. */
  notes: Record<string, string>;
  buildable: BuildableBox;
  /** Lượt gọi đã thực hiện (1 hoặc 2), để ghi nhật ký chi phí. */
  calls: StructuredCallResult[];
  /** Kết quả kiểm từng lượt, cùng thứ tự với `calls`. */
  rounds: AiProgramRound[];
  repaired: boolean;
}

/**
 * Tri thức tiêm vào lời dẫn.
 *
 * ⚠️ Mọi con số ở đây đến từ ĐẦU BÀI hoặc từ `kb/` (quy ước cấu tạo). **Không** con số nào
 * đến từ `rules/` — đó là ranh giới của T14, và có kiểm thử canh (`ai-prompts.test.ts` cùng
 * bài kiểm ngưỡng trong `ai-program.test.ts`).
 */
export interface ProgramKnowledge {
  floors: number;
  building_type: string;
  buildable_per_level_m2: number[];
  buildable_footprint_m: { width: number; depth: number };
  /** `false` khi thửa là đa giác: ô chữ nhật có thể nhỏ hơn ô lớn nhất thật. */
  buildable_exact: boolean;
  bedrooms_required: { type: string; count: number }[];
  /** Không gian ĐẦU BÀI đòi phải có — người dùng tự khai, không phải mặc định của hệ thống. */
  required_by_brief: string[];
  /**
   * Từng dòng «Không gian bắt buộc có» kèm tầng ghim, diện tích ghim, khép kín — RÀNG BUỘC, không
   * phải gợi ý (13/09/2026). Trước đó chỉ còn tập loại phòng, và mô hình được dặn «diện tích là việc
   * của bạn», nên «phòng khách 58 m²» của gia chủ không có gì giữ.
   */
  brief_spaces: {
    type: string;
    floor: number | null;
    area_m2: number | null;
    ensuite: boolean | null;
  }[];
  /** Từng nhóm thành viên: loại phòng ngủ, số phòng, tầng ghim, khép kín, nhu cầu riêng. */
  members: {
    role: string;
    bedroom_type: string | null;
    rooms: number;
    floor: number | null;
    ensuite: boolean;
    /** Nhu cầu phải thành KHÔNG GIAN riêng (ban công riêng…). */
    needs: string[];
    /** Tiện ích đặt TRONG phòng ngủ — không tách không gian, cộng diện tích vào phòng. */
    in_room: string[];
  }[];
  /** Diện tích chỗ để xe tối thiểu suy từ số xe; `null` khi đầu bài không khai xe. */
  garage_min_m2: number | null;
  /** Sai số cho phép với chỗ để xe so với số xe (diện tích phòng đầu bài khai là mức TỐI THIỂU). */
  area_tolerance_ratio: number;
  ensuite_child_types: string[];
  ensuite_parent_types: string[];
  stair_types: string[];
  /** Nhu cầu riêng → các loại không gian đáp ứng được nó. */
  need_equivalents: Record<string, string[]>;
  room_types: { code: string; vi: string; group: string | null }[];
  construction: unknown;
  /**
   * Quy tắc kỹ sư đã chọn áp — RỖNG khi không tích gói nào, và đó là mặc định.
   *
   * ⚠️ Đây là chỗ duy nhất ngưỡng đi vào lời dẫn. Trước T20 (09/09/2026) mảng này không tồn
   * tại: T14 cấm hẳn việc tiêm ngưỡng. Nay kỹ sư quyết theo từng hồ sơ, nhưng mặc định vẫn là
   * KHÔNG — không tích gì thì mảng rỗng và mô hình thiết kế tự do như trước.
   */
  constraints: InjectedRule[];
  /**
   * Khoảng tỷ lệ diện tích giao thông (thang + lõi + hành lang) trên sàn lọt lòng mà mặt bằng sẽ
   * được CHẤM (tiêu chí C2, `kb/plan_quality.yaml`, theo loại hình). Gửi ở bước này vì mặt bằng
   * không tạo được diện tích hành lang mà chương trình không cấp: lượt thật 13/09/2026 cấp 12,9% cho
   * một nhà vườn (khoảng đạt 18–25%) và mặt bằng mất nửa điểm C2 trước khi được vẽ.
   */
  circulation_share: { low: number; high: number } | null;
}

export function programKnowledge(input: {
  digest: AiBriefDigest;
  vocabulary: VocabularyIndex;
  labels: Record<string, string>;
  buildable: BuildableBox;
  construction: unknown;
  rules: RulePack;
  fidelity: BriefFidelity;
  quality?: PlanQuality;
}): ProgramKnowledge {
  const { digest, vocabulary, labels, buildable } = input;

  const inBedroom = new Set(input.fidelity.inBedroomTypes);
  const bedrooms = new Map<string, number>();
  for (const member of digest.family ?? []) {
    const roomType = bedroomTypeFor(member.role ?? '');
    const count = bedroomsFor(member.role ?? '', member.count ?? 0);
    if (roomType && count > 0) bedrooms.set(roomType, (bedrooms.get(roomType) ?? 0) + count);
  }

  // Nhóm chức năng (`circulation`, `sleeping`, `service`, `outdoor`…) giúp mô hình hiểu mã
  // phòng thuộc họ nào. Nhóm khai `members: null` nghĩa là mọi mã — `roomGroups` đã bỏ chúng.
  const groupOf = new Map<string, string>();
  for (const [group, members] of Object.entries(roomGroups(vocabulary.vocabulary))) {
    for (const code of members) if (!groupOf.has(code)) groupOf.set(code, group);
  }

  return {
    floors: digest.floors,
    building_type: digest.building_type,
    // Cùng một trần cho mọi tầng: đầu bài chỉ khai một hình bao. Tầng lùi vào là quyết định
    // THIẾT KẾ, và đó chính là thứ đi hỏi mô hình.
    // Kẹp dưới mật độ xây dựng tối đa khi đầu bài khai — cùng phép với dòng tổng diện tích ở
    // màn hình đầu bài (`briefAreaBudget`), để hai chỗ nói cùng một con số.
    buildable_per_level_m2: Array.from({ length: digest.floors }, () =>
      typeof digest.site.max_density === 'number' && digest.site.max_density > 0
        ? Math.min(
            buildable.areaM2,
            round1(digest.site.max_density * digest.site.width_m * digest.site.depth_m),
          )
        : buildable.areaM2,
    ),
    buildable_footprint_m: { width: buildable.widthM, depth: buildable.depthM },
    buildable_exact: buildable.exact,
    bedrooms_required: [...bedrooms].map(([type, count]) => ({ type, count })),
    required_by_brief: [...new Set((digest.required_spaces ?? []).map((s) => s.type))],
    brief_spaces: (digest.required_spaces ?? []).map((space) => ({
      type: space.type,
      floor: space.floor ?? null,
      area_m2: space.area_m2 ?? null,
      ensuite: space.ensuite ?? null,
    })),
    members: (digest.family ?? [])
      .filter((member) => (member.count ?? 0) > 0)
      .map((member) => ({
        role: member.role,
        bedroom_type: bedroomTypeFor(member.role ?? ''),
        rooms: bedroomsFor(member.role ?? '', member.count ?? 0),
        floor: member.floor ?? null,
        ensuite: member.ensuite === true,
        needs: [
          ...new Set(
            (member.needs ?? []).filter((need) => !DERIVED_NEEDS.has(need) && !inBedroom.has(need)),
          ),
        ],
        in_room: [...new Set((member.needs ?? []).filter((need) => inBedroom.has(need)))],
      })),
    garage_min_m2: garageMinimum(digest, input.fidelity),
    area_tolerance_ratio: input.fidelity.areaToleranceRatio,
    ensuite_child_types: input.fidelity.ensuiteChildTypes,
    ensuite_parent_types: input.fidelity.ensuiteParentTypes,
    stair_types: input.fidelity.stairTypes,
    need_equivalents: input.fidelity.needEquivalents,
    room_types: vocabulary.vocabulary.types.map((t) => ({
      code: t.code,
      vi: labels[t.code] ?? t.vi,
      group: groupOf.get(t.code) ?? null,
    })),
    construction: forModel(input.construction),
    constraints: injectableRules(input.rules, digest.building_type, PROGRAM_PREDICATES),
    circulation_share: circulationShare(input.quality, digest.building_type),
  };
}

/**
 * Quy ước cấu tạo gửi cho mô hình — BỎ mục `usable` (điều kiện dựng của bộ giải ý định, V-28). Bước
 * chương trình không gian không xếp phòng; gửi thêm chục con số chỉ tốn token và đổi lời dẫn đang
 * được bộ nhớ đệm của nhà cung cấp giữ.
 */
function forModel(construction: unknown): unknown {
  if (!construction || typeof construction !== 'object') return construction;
  const { usable: _usable, ...rest } = construction as Record<string, unknown>;
  return rest;
}

function circulationShare(
  quality: PlanQuality | undefined,
  buildingType: string,
): { low: number; high: number } | null {
  const spec = quality?.criteria.find((criterion) => criterion.code === 'C2');
  if (!spec || spec.kind !== 'band') return null;
  const band = criterionFor(spec, buildingType);
  return typeof band.low === 'number' && typeof band.high === 'number'
    ? { low: band.low, high: band.high }
    : null;
}

/** Nhu cầu mà hệ thống TỰ SUY (phòng ngủ, khu vệ sinh) — không kiểm như một nhu cầu riêng. */
const DERIVED_NEEDS: ReadonlySet<string> = new Set(DERIVED_NEED_CODES);

/** Diện tích chỗ để xe tối thiểu, m², suy từ số xe đầu bài khai. */
function garageMinimum(digest: AiBriefDigest, fidelity: BriefFidelity): number | null {
  const cars = digest.parking?.cars ?? 0;
  const bikes = digest.parking?.motorbikes ?? 0;
  if (cars + bikes <= 0) return null;
  return round1(cars * fidelity.parking.carM2 + bikes * fidelity.parking.motorbikeM2);
}

/**
 * Kiểm nghiệp vụ trên đề xuất đã qua Zod. Trả danh sách lỗi tiếng Việt, rỗng = đạt.
 *
 * Hai loại phép kiểm, và ranh giới giữa chúng là chủ ý của Haan (13/09/2026) — «sáng tạo nhưng
 * sát đầu bài, không conflict»:
 *  · TOÀN VẸN: mã phòng, tầng tồn tại, khép kín trỏ đúng chỗ, tổng diện tích tầng, thang mọi tầng;
 *  · BÁM ĐẦU BÀI: mọi thứ gia chủ ĐÃ KHAI — tầng ghim, diện tích ghim, phòng ngủ khép kín, nhu cầu
 *    riêng của từng thành viên, số xe. Thứ gia chủ không khai thì không kiểm: đó là chỗ sáng tạo.
 */
export function checkProposal(
  proposal: AiSpaceProgramProposal,
  knowledge: ProgramKnowledge,
  labels: Record<string, string>,
): string[] {
  const issues: string[] = [];
  const known = new Set(knowledge.room_types.map((r) => r.code));
  const name = (code: string) => labels[code] ?? code;
  const ids = new Set<string>();
  const byId = new Map(proposal.spaces.map((space) => [space.id, space]));
  const tolerance = knowledge.area_tolerance_ratio;

  for (const s of proposal.spaces) {
    if (ids.has(s.id)) issues.push(`Mã tạm "${s.id}" bị dùng hai lần.`);
    ids.add(s.id);
    if (!known.has(s.type)) {
      issues.push(`Loại không gian "${s.type}" không có trong từ vựng — chỉ dùng mã đã cho.`);
    }
    if (s.level > knowledge.floors) {
      issues.push(
        `${name(s.type)} đặt ở tầng ${s.level} nhưng nhà chỉ có ${knowledge.floors} tầng.`,
      );
    }
  }

  // ── Khép kín: trỏ vào đâu, loại gì, cùng tầng ─────────────────────────────────────────
  // Trước 13/09/2026 chỉ kiểm mã có tồn tại, và phòng khép kín không cộng vào tổng tầng — nên gắn
  // `ensuite_of` cho một phòng lớn là né được trần sàn.
  for (const s of proposal.spaces) {
    if (!s.ensuite_of) continue;
    const parent = byId.get(s.ensuite_of);
    if (!parent) {
      issues.push(
        `${name(s.type)} khai nằm trong "${s.ensuite_of}" nhưng không có không gian nào mang mã đó.`,
      );
      continue;
    }
    if (parent.id === s.id) {
      issues.push(`${name(s.type)} khai khép kín trong chính nó.`);
      continue;
    }
    if (!knowledge.ensuite_child_types.includes(s.type)) {
      issues.push(
        `${name(s.type)} không được làm phòng khép kín — chỉ ${knowledge.ensuite_child_types.map(name).join(', ')}.`,
      );
    }
    if (!knowledge.ensuite_parent_types.includes(parent.type)) {
      issues.push(
        `${name(s.type)} khép kín trong ${name(parent.type)} — phòng mẹ phải là phòng ngủ.`,
      );
    }
    if (parent.level !== s.level) {
      issues.push(
        `${name(s.type)} khép kín trong ${name(parent.type)} nhưng đặt ở tầng ${s.level}, phòng mẹ ở tầng ${parent.level}.`,
      );
    }
  }

  // ── Mỗi tầng: có phòng, không vượt sàn, có thang ──────────────────────────────────────
  for (let level = 1; level <= knowledge.floors; level += 1) {
    const onLevel = proposal.spaces.filter((s) => s.level === level);
    if (!onLevel.length) {
      issues.push(`Tầng ${level} không có không gian nào.`);
      continue;
    }
    // Phòng khép kín CÓ cộng: trên mặt bằng nó là một ô riêng chiếm sàn thật.
    const sum = onLevel.reduce((acc, s) => acc + s.target_area_m2, 0);
    const cap = knowledge.buildable_per_level_m2[level - 1];
    if (cap !== undefined && sum > cap + 0.5) {
      issues.push(
        `Tầng ${level} cộng lại ${round1(sum)} m², vượt sàn xây được ${round1(cap)} m² (đã trừ khoảng lùi và khoảng sân).`,
      );
    }
    if (knowledge.floors > 1 && !onLevel.some((s) => knowledge.stair_types.includes(s.type))) {
      issues.push(
        `Tầng ${level} không có thang — nhà ${knowledge.floors} tầng cần thang ở mọi tầng.`,
      );
    }
  }

  // ── Bám đầu bài: không gian bắt buộc, theo SỐ DÒNG, tầng ghim và diện tích ghim ───────
  const bedroomTypes = new Set(knowledge.bedrooms_required.map((b) => b.type));
  // Phòng ngủ lấy thẳng từ gia đình (bên dưới). Kiểm thêm ở đây thì một đầu bài có dòng phòng ngủ
  // lệch gia đình sẽ bị hai phép kiểm đòi hai điều ngược nhau — chắc chắn bị bác.
  const rows = knowledge.brief_spaces.filter(
    (row) => !bedroomTypes.has(row.type) && !/bedroom/.test(row.type),
  );
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.type}@${row.floor ?? '*'}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [key, group] of groups) {
    const [type, floorKey] = key.split('@') as [string, string];
    const floor = floorKey === '*' ? null : Number(floorKey);
    const candidates = proposal.spaces.filter(
      (s) => s.type === type && (floor === null || s.level === floor),
    );
    if (candidates.length === 0) {
      issues.push(
        `Thiếu ${name(type)}${floor === null ? '' : ` ở tầng ${floor}`} — đầu bài khai đây là không gian phải có.`,
      );
      continue;
    }
    if (candidates.length < group.length) {
      issues.push(
        floor === null
          ? `Đầu bài khai ${group.length} ${name(type)}, đề xuất có ${candidates.length}.`
          : `Đầu bài khai ${group.length} ${name(type)} ở tầng ${floor}, đề xuất có ${candidates.length} ở tầng đó.`,
      );
      continue;
    }
    issues.push(...areaMismatches(group, candidates, name, floor, type));
  }

  // ── Bám đầu bài: phòng ngủ theo từng nhóm thành viên ──────────────────────────────────
  for (const { type, count } of knowledge.bedrooms_required) {
    const have = proposal.spaces.filter((s) => s.type === type).length;
    if (have !== count) {
      issues.push(`Cần đúng ${count} ${name(type)} theo thành phần gia đình, đề xuất có ${have}.`);
    }
  }
  for (const s of proposal.spaces) {
    if (/bedroom/.test(s.type) && !bedroomTypes.has(s.type)) {
      issues.push(`${name(s.type)} không nằm trong số phòng ngủ gia đình cần — bỏ dòng này.`);
    }
  }

  // Diện tích ghim của các dòng PHÒNG NGỦ: số lượng và tầng đã kiểm theo gia đình, còn diện tích
  // thì chỉ danh sách không gian mới khai.
  const bedroomRows = new Map<string, typeof knowledge.brief_spaces>();
  for (const row of knowledge.brief_spaces) {
    if (!/bedroom/.test(row.type) || typeof row.area_m2 !== 'number') continue;
    const key = `${row.type}@${row.floor ?? '*'}`;
    bedroomRows.set(key, [...(bedroomRows.get(key) ?? []), row]);
  }
  for (const [key, group] of bedroomRows) {
    const [type, floorKey] = key.split('@') as [string, string];
    const floor = floorKey === '*' ? null : Number(floorKey);
    const candidates = proposal.spaces.filter(
      (s) => s.type === type && (floor === null || s.level === floor),
    );
    issues.push(...areaMismatches(group, candidates, name, floor, type));
  }

  const needAt = new Map<string, number>();
  const bump = (key: string, by: number) => needAt.set(key, (needAt.get(key) ?? 0) + by);
  for (const member of knowledge.members) {
    if (!member.bedroom_type || member.rooms <= 0) continue;
    const at = member.floor ?? '*';
    bump(`bed:${member.bedroom_type}@${at}`, member.rooms);
    if (member.ensuite) bump(`ens:${member.bedroom_type}@${at}`, member.rooms);
    for (const need of member.needs) bump(`need:${need}@${at}`, member.rooms);
  }
  const onFloor = (s: { level: number }, at: string) => at === '*' || s.level === Number(at);
  for (const [key, required] of [...needAt].sort()) {
    const [kind, rest] = key.split(':') as [string, string];
    const [type, at] = rest.split('@') as [string, string];
    const where = at === '*' ? '' : ` ở tầng ${at}`;
    if (kind === 'bed') {
      if (at === '*') continue; // số lượng đã kiểm ở trên
      const have = proposal.spaces.filter((s) => s.type === type && onFloor(s, at)).length;
      if (have < required) {
        issues.push(`Đầu bài xếp ${required} ${name(type)}${where}, đề xuất có ${have}${where}.`);
      }
    } else if (kind === 'ens') {
      const parents = proposal.spaces.filter((s) => s.type === type && onFloor(s, at));
      const withEnsuite = parents.filter((parent) =>
        proposal.spaces.some((child) => child.ensuite_of === parent.id && child.type === 'wc'),
      ).length;
      if (withEnsuite < required) {
        issues.push(
          `Đầu bài khai ${required} ${name(type)}${where} khép kín, đề xuất chỉ ${withEnsuite} phòng có khu vệ sinh khép kín (\`ensuite_of\`).`,
        );
      }
    } else {
      const accepted = knowledge.need_equivalents[type] ?? [type];
      const have = proposal.spaces.filter(
        (s) => accepted.includes(s.type) && onFloor(s, at),
      ).length;
      if (have < required) {
        issues.push(
          `Nhu cầu riêng «${name(type)}» của thành viên cần ${required} không gian${where}, đề xuất có ${have}.`,
        );
      }
    }
  }

  // ── Bám đầu bài: chỗ để xe đủ số xe ────────────────────────────────────────────────────
  if (knowledge.garage_min_m2 !== null) {
    const garages = proposal.spaces.filter((s) => s.type === 'garage');
    const area = garages.reduce((sum, s) => sum + s.target_area_m2, 0);
    if (!garages.length) {
      issues.push('Đầu bài khai số xe cần chỗ đỗ nhưng đề xuất không có chỗ để xe.');
    } else if (area < knowledge.garage_min_m2 * (1 - tolerance)) {
      issues.push(
        `Chỗ để xe ${round1(area)} m² không đủ cho số xe đầu bài khai (cần khoảng ${knowledge.garage_min_m2} m²).`,
      );
    }
  }

  return issues;
}

/**
 * Diện tích ghim là mức TỐI THIỂU (Haan, 13/09/2026): ghép từng dòng đầu bài với một không gian cùng
 * loại (và cùng tầng nếu ghim), lớn với lớn, nhỏ với nhỏ — rồi chỉ bác khi không gian NHỎ HƠN mức
 * tối thiểu. Lớn hơn bao nhiêu cũng được: đó là chỗ sáng tạo, và trần sàn đã có phép kiểm riêng.
 * Ghép theo thứ tự diện tích chứ không theo chỉ số, vì mô hình không giữ thứ tự dòng của đầu bài.
 */
function areaMismatches(
  rows: { area_m2: number | null }[],
  candidates: { target_area_m2: number }[],
  name: (code: string) => string,
  floor: number | null,
  type: string,
): string[] {
  const minimums = rows
    .map((row) => row.area_m2)
    .filter((area): area is number => typeof area === 'number')
    .sort((a, b) => b - a);
  if (!minimums.length) return [];
  const offered = candidates.map((c) => c.target_area_m2).sort((a, b) => b - a);
  const out: string[] = [];
  minimums.forEach((minimum, index) => {
    const got = offered[index];
    // Làm tròn tới 0,1 m² như lúc đúc artifact, để 27,95 không bị bác vì mức 28.
    if (got === undefined || round1(got) >= minimum) return;
    out.push(
      `${name(type)}${floor === null ? '' : ` tầng ${floor}`}: đầu bài khai tối thiểu ${minimum} m², đề xuất ${round1(got)} m² — nhỏ hơn mức tối thiểu.`,
    );
  });
  return out;
}

/** Đổi đề xuất đã đạt kiểm thành artifact `ai_space_program` — điền phần tất định. */
export function programFromProposal(input: {
  proposal: AiSpaceProgramProposal;
  briefRef: string;
  generator: AiSpaceProgram['generator'];
  /** Mã phòng của mô hình → loại tiện ích đã gộp vào phòng ấy (`foldInBedroom`). */
  includes?: ReadonlyMap<string, readonly string[]>;
}): {
  payload: AiSpaceProgram;
  notes: Record<string, string>;
  /** Mã tạm của mô hình → mã `type_n` — để đánh lại cả những chỗ khác trỏ vào phòng (T45). */
  idMap: ReadonlyMap<string, string>;
} {
  const { proposal } = input;

  // Đánh số theo khuôn `type_n`: mã của mô hình chỉ là mã tạm để nó trỏ `enclosed_in`, và ba
  // lượt gọi song song ở bước sau cần mã ổn định để nói về cùng một phòng.
  const counters = new Map<string, number>();
  const idMap = new Map<string, string>();
  const ordered = [...proposal.spaces].sort((a, b) => a.level - b.level);
  for (const s of ordered) {
    const n = (counters.get(s.type) ?? 0) + 1;
    counters.set(s.type, n);
    idMap.set(s.id, `${s.type}_${n}`);
  }

  const notes: Record<string, string> = {};
  const spaces: AiSpaceProgram['spaces'] = ordered.map((s) => {
    const id = idMap.get(s.id)!;
    if (s.why) notes[id] = s.why;
    return {
      id,
      type: s.type,
      level: s.level,
      target_area_m2: round1(s.target_area_m2),
      ensuite_of: s.ensuite_of ? (idMap.get(s.ensuite_of) ?? null) : null,
      why: s.why ?? null,
      ...(input.includes?.get(s.id)?.length ? { includes: [...input.includes.get(s.id)!] } : {}),
    };
  });

  const payload: AiSpaceProgram = {
    schema_version: SCHEMA_VERSION,
    brief_ref: input.briefRef,
    spaces,
    rationale: proposal.rationale,
    assumptions: proposal.assumptions ?? [],
    generator: input.generator,
  };
  return { payload, notes, idMap };
}

/**
 * Gộp tiện ích trong phòng ngủ (tủ đồ, góc học tập, phòng thay đồ) vào phòng mẹ — tất định, không
 * tốn lượt gọi. Mô hình được dặn không tách chúng; lỡ tách thành phòng khép kín (`ensuite_of` trỏ
 * vào một phòng ngủ) thì cộng diện tích vào phòng ngủ, bỏ không gian ấy, ghi loại vào `includes`.
 *
 * Vì sao phải gộp chứ không chỉ dặn: lượt chạy thật 13/09/2026, chương trình AI vẫn tách tủ đồ,
 * góc học tập, phòng thay đồ thành phòng — tầng 2 thành 20 lá cây, mỗi lá là thêm một cách xếp
 * sai ở bước mặt bằng, trong khi kiến trúc sư không bao giờ vẽ tủ đồ thành một phòng có vách.
 *
 * Tiện ích đứng một mình (không `ensuite_of`) thì giữ nguyên: không biết nó thuộc phòng nào.
 */
export function foldInBedroom(
  proposal: AiSpaceProgramProposal,
  inBedroomTypes: readonly string[],
  parentTypes: readonly string[],
): { proposal: AiSpaceProgramProposal; includes: Map<string, string[]> } {
  const amenity = new Set(inBedroomTypes);
  const parents = new Map(
    proposal.spaces.filter((s) => parentTypes.includes(s.type)).map((s) => [s.id, s]),
  );
  const folded = proposal.spaces.filter(
    (s) =>
      amenity.has(s.type) &&
      s.ensuite_of !== null &&
      s.ensuite_of !== undefined &&
      parents.has(s.ensuite_of),
  );
  if (!folded.length) return { proposal, includes: new Map() };

  const extra = new Map<string, number>();
  const includes = new Map<string, string[]>();
  for (const s of folded) {
    const parent = s.ensuite_of!;
    extra.set(parent, (extra.get(parent) ?? 0) + s.target_area_m2);
    const list = includes.get(parent) ?? [];
    if (!list.includes(s.type)) list.push(s.type);
    includes.set(parent, list);
  }
  const gone = new Set(folded.map((s) => s.id));
  return {
    proposal: {
      ...proposal,
      spaces: proposal.spaces
        .filter((s) => !gone.has(s.id))
        .map((s) =>
          extra.has(s.id)
            ? { ...s, target_area_m2: round1(s.target_area_m2 + extra.get(s.id)!) }
            : s,
        ),
    },
    includes,
  };
}

/**
 * Thân lời gọi: đầu bài dạng VĂN XUÔI tiếng Việt trong `<brief>`, tri thức dạng JSON trong
 * `<knowledge>` (T43, 14/09/2026).
 *
 * Đầu bài là lời gia chủ và ghi chú khảo sát — thứ để đọc; mã loại phòng, số tầng, diện tích tối thiểu
 * mô hình phải khớp CHÍNH XÁC thì vẫn đi trong `<knowledge>` (`brief_spaces`, `members`…). JSON không
 * thụt lề — T26.
 */
export function programPrompt(narrative: string, knowledge: ProgramKnowledge): string {
  return modelBody(narrative, knowledge);
}

export async function generateAiProgram(input: AiProgramInput): Promise<AiProgramResult> {
  const { digest, prompts, client, route, labels } = input;

  const buildable = buildableFromDigest(digest);
  const knowledge = programKnowledge({
    digest,
    vocabulary: input.vocabulary,
    labels,
    buildable,
    construction: input.construction,
    rules: input.rules,
    fidelity: input.fidelity,
    ...(input.quality ? { quality: input.quality } : {}),
  });

  const schema = proposalSchemaJson as Record<string, unknown>;
  const calls: StructuredCallResult[] = [];
  const rounds: AiProgramRound[] = [];
  const basePrompt = programPrompt(briefNarrative(digest, { roomLabels: labels }), knowledge);
  let issues: string[] = [];
  let proposal: AiSpaceProgramProposal | null = null;
  let includes = new Map<string, string[]>();

  for (let round = 0; round < 2; round += 1) {
    // Lượt sửa nối lý do bị bác vào CUỐI thân lời gọi, không vào lời dẫn hệ thống: phần đầu giữ
    // nguyên từng byte như lượt 1, nên nhà cung cấp đọc lại từ bộ nhớ đệm và tính giá token vào
    // đã lưu đệm cho cả lời dẫn lẫn đầu bài.
    const prompt =
      round === 0
        ? basePrompt
        : `${basePrompt}\n\n${prompts.program.repair.replace('{issues}', () =>
            issues.map((i) => `- ${i}`).join('\n'),
          )}`;
    const result = await client.complete(route, AI_DIGEST_DATA_CLASS, {
      system: prompts.program.system,
      prompt,
      schema,
      maxOutputTokens: PROGRAM_OUTPUT_TOKENS,
      ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onCallProgress
        ? { onProgress: (p: CallProgress) => input.onCallProgress!(round + 1, p) }
        : {}),
    });
    calls.push(result);

    // Mã sai khuôn và chữ tự do quá trần không làm chương trình sai đi — sửa trước khi kiểm, thay vì
    // mua lại cả lượt (lượt thật 13/09/2026: lượt 1 bị bác chỉ vì `spaces.N.id`, 0,10 USD).
    const parsed = aiSpaceProgramProposalSchema.safeParse(tidyProposal(result.json));
    if (!parsed.success) {
      issues = describeZod(parsed.error);
      proposal = null;
    } else {
      const folded = foldInBedroom(
        parsed.data,
        input.fidelity.inBedroomTypes,
        input.fidelity.ensuiteParentTypes,
      );
      issues = checkProposal(folded.proposal, knowledge, labels);
      proposal = issues.length ? null : folded.proposal;
      includes = folded.includes;
    }
    const verdict: AiProgramRound = {
      round: round + 1,
      outcome: proposal ? 'accepted' : 'rejected',
      issues: [...issues],
    };
    rounds.push(verdict);
    input.onRoundDone?.(verdict, result);
    if (proposal) break;
  }

  if (!proposal) throw new AiProgramRejected(issues, calls.length, calls, rounds);

  const last = calls[calls.length - 1]!;
  const { payload, notes } = programFromProposal({
    proposal,
    includes,
    briefRef: input.briefRef,
    generator: {
      kind: 'ai',
      provider: last.provider,
      model: last.model,
      route,
      prompt_version: prompts.version,
      repaired: calls.length > 1,
    },
  });

  return {
    payload,
    rationale: proposal.rationale,
    assumptions: proposal.assumptions ?? [],
    notes,
    buildable,
    calls,
    rounds,
    repaired: calls.length > 1,
  };
}

/** Chuẩn hoá mã phòng và cắt chữ tự do vượt trần của `ai-space-program-proposal`. */
export function tidyProposal(json: unknown): unknown {
  const named = normaliseProgramIds(json).json;
  const top = clampText(named, { rationale: 1500 }).json;
  if (!top || typeof top !== 'object' || Array.isArray(top)) return top;
  const proposal = top as Record<string, unknown>;
  return {
    ...proposal,
    ...(Array.isArray(proposal.spaces)
      ? { spaces: proposal.spaces.map((space) => clampText(space, { why: 200 }).json) }
      : {}),
    ...(Array.isArray(proposal.assumptions)
      ? {
          assumptions: proposal.assumptions.map((line) =>
            typeof line === 'string' && line.length > 200 ? `${line.slice(0, 199)}…` : line,
          ),
        }
      : {}),
  };
}

function describeZod(error: ZodError): string[] {
  return error.issues
    .slice(0, 8)
    .map((i) => `Sai cấu trúc ở ${i.path.join('.') || 'gốc'}: ${i.message}`);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
