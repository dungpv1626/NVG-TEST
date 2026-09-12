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

import {
  aiSpaceProgramProposalSchema,
  bedroomsFor,
  bedroomTypeFor,
  type AiBriefDigest,
  type AiSpaceProgram,
  type AiSpaceProgramProposal,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import proposalSchemaJson from '../../../../contracts/ai-space-program-proposal.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import { roomGroups, type VocabularyIndex } from '../kb/vocabulary';
import type { StructuredCallResult, TextModelClient } from '../llm/text-client';
import { buildableFromDigest, type BuildableBox } from './buildable';
import { injectableRules, type InjectedRule } from './rule-packs';
import type { RulePack } from '../rules/rule-pack';
import type { AiPrompts } from './prompts';

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
const PROGRAM_PREDICATES: ReadonlySet<string> = new Set([
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
}

export function programKnowledge(input: {
  digest: AiBriefDigest;
  vocabulary: VocabularyIndex;
  labels: Record<string, string>;
  buildable: BuildableBox;
  construction: unknown;
  rules: RulePack;
}): ProgramKnowledge {
  const { digest, vocabulary, labels, buildable } = input;

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
    buildable_per_level_m2: Array.from({ length: digest.floors }, () => buildable.areaM2),
    buildable_footprint_m: { width: buildable.widthM, depth: buildable.depthM },
    buildable_exact: buildable.exact,
    bedrooms_required: [...bedrooms].map(([type, count]) => ({ type, count })),
    required_by_brief: [...new Set((digest.required_spaces ?? []).map((s) => s.type))],
    room_types: vocabulary.vocabulary.types.map((t) => ({
      code: t.code,
      vi: labels[t.code] ?? t.vi,
      group: groupOf.get(t.code) ?? null,
    })),
    construction: input.construction,
    constraints: injectableRules(input.rules, digest.building_type, PROGRAM_PREDICATES),
  };
}

/** Kiểm nghiệp vụ trên đề xuất đã qua Zod. Trả danh sách lỗi tiếng Việt, rỗng = đạt. */
export function checkProposal(
  proposal: AiSpaceProgramProposal,
  knowledge: ProgramKnowledge,
  labels: Record<string, string>,
): string[] {
  const issues: string[] = [];
  const known = new Set(knowledge.room_types.map((r) => r.code));
  const name = (code: string) => labels[code] ?? code;
  const ids = new Set<string>();

  for (const s of proposal.spaces) {
    if (ids.has(s.id)) issues.push(`Mã tạm "${s.id}" bị dùng hai lần.`);
    ids.add(s.id);
    if (!known.has(s.type)) {
      issues.push(`Loại không gian "${s.type}" không có trong từ vựng — chỉ dùng mã đã cho.`);
      continue;
    }
    if (s.level > knowledge.floors) {
      issues.push(
        `${name(s.type)} đặt ở tầng ${s.level} nhưng nhà chỉ có ${knowledge.floors} tầng.`,
      );
    }
  }

  for (const s of proposal.spaces) {
    if (s.ensuite_of && !ids.has(s.ensuite_of)) {
      issues.push(
        `${name(s.type)} khai nằm trong "${s.ensuite_of}" nhưng không có không gian nào mang mã đó.`,
      );
    }
  }

  for (let level = 1; level <= knowledge.floors; level += 1) {
    // Phòng khép kín trong phòng khác không cộng riêng: diện tích của nó đã nằm trong phòng mẹ.
    const onLevel = proposal.spaces.filter((s) => s.level === level && !s.ensuite_of);
    if (!onLevel.length) {
      issues.push(`Tầng ${level} không có không gian nào.`);
      continue;
    }
    const sum = onLevel.reduce((acc, s) => acc + s.target_area_m2, 0);
    const cap = knowledge.buildable_per_level_m2[level - 1];
    if (cap !== undefined && sum > cap + 0.5) {
      issues.push(`Tầng ${level} cộng lại ${round1(sum)} m², vượt sàn xây được ${round1(cap)} m².`);
    }
  }

  // Không gian bắt buộc lấy từ ĐẦU BÀI, không từ một danh sách mặc định của hệ thống: người
  // dùng đã khai họ cần gì, và đó là thứ duy nhất có thẩm quyền ở đây.
  for (const code of knowledge.required_by_brief) {
    if (!proposal.spaces.some((s) => s.type === code)) {
      issues.push(`Thiếu ${name(code)} — đầu bài khai đây là không gian phải có.`);
    }
  }

  for (const { type, count } of knowledge.bedrooms_required) {
    const have = proposal.spaces.filter((s) => s.type === type).length;
    if (have !== count) {
      issues.push(`Cần đúng ${count} ${name(type)} theo thành phần gia đình, đề xuất có ${have}.`);
    }
  }
  const bedroomTypes = new Set(knowledge.bedrooms_required.map((b) => b.type));
  for (const s of proposal.spaces) {
    if (/bedroom/.test(s.type) && !bedroomTypes.has(s.type)) {
      issues.push(`${name(s.type)} không nằm trong số phòng ngủ gia đình cần — bỏ dòng này.`);
    }
  }
  return issues;
}

/** Đổi đề xuất đã đạt kiểm thành artifact `ai_space_program` — điền phần tất định. */
export function programFromProposal(input: {
  proposal: AiSpaceProgramProposal;
  briefRef: string;
  generator: AiSpaceProgram['generator'];
}): { payload: AiSpaceProgram; notes: Record<string, string> } {
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
  return { payload, notes };
}

/**
 * Lời dẫn người dùng: dữ liệu + tri thức, dạng JSON để mô hình không phải đoán cấu trúc.
 *
 * Không thụt lề — cùng lý do như `planPrompt` (T26): khoảng trắng thuần không mang tin nào nhưng
 * vẫn tính token. Bước này nhỏ hơn bước mặt bằng nên phần cắt được ít hơn, nhưng nó chạy ở MỌI
 * hồ sơ còn bước mặt bằng thì chỉ chạy khi kỹ sư bấm.
 */
export function programPrompt(digest: AiBriefDigest, knowledge: ProgramKnowledge): string {
  return JSON.stringify({ brief: digest, knowledge });
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
  });

  const schema = proposalSchemaJson as Record<string, unknown>;
  const calls: StructuredCallResult[] = [];
  const basePrompt = programPrompt(digest, knowledge);
  let issues: string[] = [];
  let proposal: AiSpaceProgramProposal | null = null;

  for (let round = 0; round < 2; round += 1) {
    const system =
      round === 0
        ? prompts.program.system
        : `${prompts.program.system}\n\n${prompts.program.repair.replace(
            '{issues}',
            issues.map((i) => `- ${i}`).join('\n'),
          )}`;
    const result = await client.complete(route, AI_DIGEST_DATA_CLASS, {
      system,
      prompt: basePrompt,
      schema,
      maxOutputTokens: PROGRAM_OUTPUT_TOKENS,
    });
    calls.push(result);

    const parsed = aiSpaceProgramProposalSchema.safeParse(result.json);
    if (!parsed.success) {
      issues = describeZod(parsed.error);
      proposal = null;
      continue;
    }
    issues = checkProposal(parsed.data, knowledge, labels);
    proposal = issues.length ? null : parsed.data;
    if (proposal) break;
  }

  if (!proposal) throw new AiProgramRejected(issues, calls.length);

  const last = calls[calls.length - 1]!;
  const { payload, notes } = programFromProposal({
    proposal,
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
    repaired: calls.length > 1,
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
