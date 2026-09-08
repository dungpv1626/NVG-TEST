/**
 * Chương trình không gian do MÔ HÌNH lập — nhánh AI của Lớp 2 (T10–T13, 08/09/2026).
 *
 * ── Vai trò của mô hình và vai trò của mã ────────────────────────────────────────────
 *
 * Mô hình đề xuất DANH MỤC không gian, TẦNG và DIỆN TÍCH MONG MUỐN (hợp đồng
 * `ai-space-program-proposal`). Đây là chỗ nới có kiểm soát của nguyên tắc bất biến 2 (CLAUDE.md
 * 8.2), theo quyết định T10/T11 của Haan. Mọi thứ còn lại vẫn là mã tất định:
 *
 *  · kiểm: mã phòng có trong từ vựng · tầng trong 1..N · số phòng ngủ đúng theo gia đình
 *    (cùng luật với engine) · không phòng nào dưới tối thiểu quy chuẩn · tổng từng tầng không
 *    vượt sàn xây được · đủ không gian bắt buộc của loại hình;
 *  · điền: `min/max/priority/needs_*` từ rule pack + `kb/space_norms.yaml`, `adjacency` từ rule
 *    pack (cùng hàm với engine), `floor_allocation` từ hình học thửa, `id` đánh số theo khuôn
 *    `type_n` của engine;
 *  · soát tính hợp lý nghề (`checkPlausibility`) chạy SAU, thành cảnh báo — như nhánh bộ giải.
 *
 * Sai kiểm → đúng MỘT lượt sửa kèm danh sách lỗi cụ thể → vẫn sai → bác (`AiProgramRejected`),
 * không đúc artifact. Không có vòng lặp: gọi lại mô hình để nó tự sửa mãi là đốt tiền vào cùng
 * một loại sai (04-layer3-floorplan 4.3).
 *
 * ── Dữ liệu gửi đi ───────────────────────────────────────────────────────────────────
 *
 * Hạng 2: đầu bài + khảo sát đã lược danh tính (`brief/anonymise.ts`), cộng phần TRI THỨC do
 * Worker tiêm vào — từ vựng, chuẩn nghề, tối thiểu quy chuẩn, sàn xây được từng tầng, số phòng
 * ngủ bắt buộc. Không một ngưỡng nào viết trong mã hay trong lời dẫn (CLAUDE.md 8.7).
 */

import {
  aiSpaceProgramProposalSchema,
  bedroomsFor,
  bedroomTypeFor,
  siteGeometry,
  type AiBriefDigest,
  type AiSpaceProgramProposal,
  type DesignBrief,
  type SpaceProgram,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import proposalSchemaJson from '../../../../contracts/ai-space-program-proposal.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { VocabularyIndex } from '../kb/vocabulary';
import type { StructuredCallResult, TextModelClient } from '../llm/text-client';
import { buildAdjacency, buildableFootprint } from '../program/engine';
import { checkPlausibility, type PlausibilityRules } from '../program/plausibility';
import type { SpaceNorms } from '../program/norms';
import { bandFor } from '../program/norms';
import type { RulePack } from '../program/rule-pack';
import type { AiPrompts } from './prompts';

const SCHEMA_VERSION = '1.0.0';

/** Đề xuất không đạt kiểm sau lượt sửa — lỗi nghiệp vụ đọc được, không thử lại. */
export class AiProgramRejected extends Error {
  readonly retryable = false;
  constructor(
    readonly findings: string[],
    readonly attempts: number,
  ) {
    super(
      `AI chưa lập được chương trình không gian đạt quy chuẩn sau ${attempts} lượt. ${findings[0] ?? ''}`.trim(),
    );
    this.name = 'AiProgramRejected';
  }
}

export interface AiProgramInput {
  brief: DesignBrief;
  briefRef: string;
  digest: AiBriefDigest;
  route: string;
  client: TextModelClient;
  prompts: AiPrompts;
  rules: RulePack;
  norms: SpaceNorms;
  vocabulary: VocabularyIndex;
  /** Nhãn tiếng Việt theo mã phòng — gửi kèm để mô hình hiểu mã. */
  labels: Record<string, string>;
  plausibility: PlausibilityRules;
}

export interface AiProgramResult {
  payload: SpaceProgram;
  rationale: string;
  assumptions: string[];
  /** Ghi chú `why` theo mã không gian đã đánh số lại. */
  notes: Record<string, string>;
  warnings: string[];
  /** Lượt gọi đã thực hiện (1 hoặc 2), để ghi nhật ký. */
  calls: StructuredCallResult[];
  /** Số lỗi kiểm ở lượt đầu — 0 nghĩa là không cần sửa. */
  repaired: boolean;
}

/** Tri thức tiêm vào lời dẫn — mọi con số ở đây đọc từ dữ liệu, không viết cứng. */
export interface ProgramKnowledge {
  floors: number;
  building_type: string;
  buildable_per_floor_m2: number[];
  width_band: string;
  bedrooms_required: { type: string; count: number }[];
  mandatory: string[];
  room_types: {
    code: string;
    vi: string;
    min_m2: number;
    target_m2: number;
    max_m2: number;
    floor_pref: string;
    daylight: boolean;
    auto: boolean;
  }[];
  adjacency_rules: { a: string; b: string; kind: string }[];
}

export function programKnowledge(input: {
  brief: DesignBrief;
  rules: RulePack;
  norms: SpaceNorms;
  labels: Record<string, string>;
  buildablePerFloor: number[];
  widthBand: string;
}): ProgramKnowledge {
  const { brief, rules, norms, labels } = input;
  const type = brief.building_type;
  const floorPref = rules.floorPreference(type);
  const bedrooms = new Map<string, number>();
  for (const member of brief.family ?? []) {
    const roomType = bedroomTypeFor(member.role ?? '');
    const count = bedroomsFor(member.role ?? '', member.count ?? 0);
    if (roomType && count > 0) bedrooms.set(roomType, (bedrooms.get(roomType) ?? 0) + count);
  }
  return {
    floors: brief.floors,
    building_type: type,
    buildable_per_floor_m2: input.buildablePerFloor,
    width_band: input.widthBand,
    bedrooms_required: [...bedrooms].map(([t, count]) => ({ type: t, count })),
    mandatory: norms.mandatory[type] ?? [],
    room_types: Object.entries(norms.spaces).map(([code, norm]) => ({
      code,
      vi: labels[code] ?? code,
      // Tối thiểu là mức CHẶT hơn giữa quy chuẩn và chuẩn nghề — cùng phép với engine.
      min_m2: Math.max(norm.min_m2, rules.minArea(type, code) ?? 0),
      target_m2: norm.target_m2,
      max_m2: norm.max_m2,
      floor_pref: floorPref.get(code) ?? norm.floor,
      daylight: norm.daylight,
      auto: norm.auto,
    })),
    adjacency_rules: rules.adjacency(type).map((r) => ({ a: r.a, b: r.b, kind: r.kind })),
  };
}

/** Kiểm nghiệp vụ trên đề xuất đã qua Zod. Trả danh sách lỗi tiếng Việt, rỗng = đạt. */
export function checkProposal(
  proposal: AiSpaceProgramProposal,
  knowledge: ProgramKnowledge,
  labels: Record<string, string>,
): string[] {
  const issues: string[] = [];
  const known = new Map(knowledge.room_types.map((r) => [r.code, r]));
  const name = (code: string) => labels[code] ?? code;
  const ids = new Set<string>();

  for (const s of proposal.spaces) {
    if (ids.has(s.id)) issues.push(`Mã tạm "${s.id}" bị dùng hai lần.`);
    ids.add(s.id);
    const norm = known.get(s.type);
    if (!norm) {
      issues.push(`Loại không gian "${s.type}" không có trong từ vựng — chỉ dùng mã đã cho.`);
      continue;
    }
    if (s.floor > knowledge.floors) {
      issues.push(
        `${name(s.type)} đặt ở tầng ${s.floor} nhưng nhà chỉ có ${knowledge.floors} tầng.`,
      );
    }
    if (s.target_area_m2 + 0.05 < norm.min_m2) {
      issues.push(
        `${name(s.type)} ${s.target_area_m2} m² dưới mức tối thiểu ${norm.min_m2} m² của loại phòng này.`,
      );
    }
  }
  for (const s of proposal.spaces) {
    if (s.enclosed_in && !ids.has(s.enclosed_in)) {
      issues.push(
        `${name(s.type)} khai nằm trong "${s.enclosed_in}" nhưng không có không gian nào mang mã đó.`,
      );
    }
  }

  for (let level = 1; level <= knowledge.floors; level += 1) {
    const onFloor = proposal.spaces.filter((s) => s.floor === level && !s.enclosed_in);
    if (!onFloor.length) {
      issues.push(`Tầng ${level} không có không gian nào.`);
      continue;
    }
    const sum = onFloor.reduce((acc, s) => acc + s.target_area_m2, 0);
    const cap = knowledge.buildable_per_floor_m2[level - 1];
    if (cap !== undefined && sum > cap + 0.5) {
      issues.push(`Tầng ${level} cộng lại ${round1(sum)} m², vượt sàn xây được ${round1(cap)} m².`);
    }
  }

  for (const code of knowledge.mandatory) {
    if (!proposal.spaces.some((s) => s.type === code)) {
      issues.push(`Thiếu ${name(code)} — không gian bắt buộc của loại hình này.`);
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

/**
 * Đổi đề xuất đã đạt kiểm thành `SpaceProgram` chuẩn — điền mọi phần tất định.
 */
export function programFromProposal(input: {
  proposal: AiSpaceProgramProposal;
  brief: DesignBrief;
  briefRef: string;
  rules: RulePack;
  norms: SpaceNorms;
  knowledge: ProgramKnowledge;
  generator: NonNullable<SpaceProgram['generator']>;
}): { payload: SpaceProgram; notes: Record<string, string> } {
  const { proposal, brief, rules, norms, knowledge } = input;
  const type = brief.building_type;
  const daylightRequired = rules.requiresDaylight(type);

  // Đánh số theo khuôn `type_n` của engine — bảng so sánh và nhãn dùng chung một cách gọi.
  const counters = new Map<string, number>();
  const idMap = new Map<string, string>();
  const ordered = [...proposal.spaces].sort((a, b) => a.floor - b.floor);
  for (const s of ordered) {
    const n = (counters.get(s.type) ?? 0) + 1;
    counters.set(s.type, n);
    idMap.set(s.id, `${s.type}_${n}`);
  }

  const notes: Record<string, string> = {};
  const spaces: SpaceProgram['spaces'] = ordered.map((s) => {
    const norm = norms.spaces[s.type]!;
    const id = idMap.get(s.id)!;
    const enclosedIn = s.enclosed_in ? (idMap.get(s.enclosed_in) ?? null) : null;
    const min = Math.max(norm.min_m2, rules.minArea(type, s.type) ?? 0);
    if (s.why) notes[id] = s.why;
    return {
      id,
      type: s.type,
      floor: s.floor,
      min_area_m2: round1(min),
      target_area_m2: round1(Math.max(min, s.target_area_m2)),
      // Trần nghề vẫn là dữ liệu của kb; mô hình đề xuất lớn hơn thì trần theo đề xuất — bộ
      // giải cần khoảng [min, max] chứa target.
      max_area_m2: round1(Math.max(norm.max_m2, s.target_area_m2)),
      priority: norm.priority,
      needs_daylight: enclosedIn ? false : daylightRequired.has(s.type) || norm.daylight,
      needs_facade: enclosedIn ? false : norm.facade,
      needs_ventilation: norm.ventilation,
      ...(enclosedIn ? { enclosed_in: enclosedIn } : {}),
    };
  });

  const floorAllocation = Array.from({ length: brief.floors }, (_, i) => {
    const level = i + 1;
    const buildable = knowledge.buildable_per_floor_m2[i] ?? null;
    const allocated = spaces
      .filter((s) => s.floor === level && !s.enclosed_in)
      .reduce((sum, s) => sum + (s.target_area_m2 ?? 0), 0);
    return {
      floor: level,
      // Sàn DÙNG = tổng mô hình xếp, kẹp dưới trần xây được — bộ giải chia đúng phần này.
      usable_area_m2: round1(buildable === null ? allocated : Math.min(buildable, allocated)),
      buildable_area_m2: buildable === null ? null : round1(buildable),
      allocated_area_m2: round1(allocated),
    };
  });

  const payload: SpaceProgram = {
    schema_version: SCHEMA_VERSION,
    brief_ref: input.briefRef,
    spaces,
    adjacency: buildAdjacency(spaces, rules, norms, type, brief.massing?.service_core === true),
    floor_allocation: floorAllocation,
    reference_projects: [],
    priors_applied: false,
    generator: input.generator,
  };
  return { payload, notes };
}

/** Lời dẫn người dùng: dữ liệu + tri thức, dạng JSON để mô hình không phải đoán cấu trúc. */
export function programPrompt(digest: AiBriefDigest, knowledge: ProgramKnowledge): string {
  return JSON.stringify({ brief: digest, knowledge }, null, 1);
}

export async function generateAiProgram(input: AiProgramInput): Promise<AiProgramResult> {
  const { brief, rules, norms, prompts, client, route, labels } = input;

  // Sàn xây được từng tầng: cùng hàm với engine, nên hai nhánh nói cùng một con số.
  const warnings: string[] = [];
  const geometry = siteGeometry(brief.site);
  const footprint = buildableFootprint(brief, geometry, rules, warnings);
  const knowledge = programKnowledge({
    brief,
    rules,
    norms,
    labels,
    buildablePerFloor: Array.from({ length: brief.floors }, () => round1(footprint)),
    // Dải bề rộng theo ô XÂY ĐƯỢC, cùng phép với engine.
    widthBand: bandFor(norms, geometry.buildable.widthM).id,
  });

  const schema = proposalSchemaJson as Record<string, unknown>;
  const calls: StructuredCallResult[] = [];
  const attempt = async (userPrompt: string, system: string) => {
    const result = await client.complete(route, AI_DIGEST_DATA_CLASS, {
      system,
      prompt: userPrompt,
      schema,
      maxOutputTokens: 12_000,
    });
    calls.push(result);
    return result;
  };

  const basePrompt = programPrompt(input.digest, knowledge);
  let issues: string[] = [];
  let proposal: AiSpaceProgramProposal | null = null;

  for (let round = 0; round < 2; round += 1) {
    const system =
      round === 0
        ? prompts.program.system
        : `${prompts.program.system}\n\n${prompts.program.repair.replace('{issues}', issues.map((i) => `- ${i}`).join('\n'))}`;
    const result = await attempt(basePrompt, system);
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
    brief,
    briefRef: input.briefRef,
    rules,
    norms,
    knowledge,
    generator: {
      kind: 'ai',
      provider: last.provider,
      model: last.model,
      route,
      prompt_version: prompts.version,
      rationale: proposal.rationale,
    },
  });

  for (const finding of checkPlausibility(payload, input.plausibility)) {
    warnings.push(finding.message);
  }

  return {
    payload,
    rationale: proposal.rationale,
    assumptions: proposal.assumptions ?? [],
    notes,
    warnings,
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
