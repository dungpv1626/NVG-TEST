/**
 * Mặt bằng: mô hình khai Ý ĐỊNH CẢ NHÀ, chương trình xếp phòng — bước 2 của nhánh AI (T43, T45).
 *
 * ── Việc của mô hình và việc của mã ──────────────────────────────────────────────────
 *
 * Tài liệu bàn giao `ai-architectural-floorplan-claude-code-handoff` (Haan chốt tuân thủ, 15/09/2026):
 * «GPT decides» danh sách phòng, diện tích mục tiêu, vùng, quan hệ; «Code decides» mọi toạ độ.
 *
 * Mô hình khai MỘT ý định cho cả nhà (`contracts/ai-house-intent`): mỗi phòng ở tầng nào, rộng bao nhiêu
 * m², ở vùng nào trong chín vùng của khối nhà, ra mặt đường không; phòng nào cạnh / gần / xa / thông
 * phòng nào; phòng nào mang cửa chính, cửa xe. Mã tất định lo toàn bộ phần còn lại:
 *
 *  · **kiểm danh mục** — bộ kiểm bám đầu bài T41 (`program.ts` `checkProposal`): tầng ghim, diện tích
 *    ghim, phòng ngủ khép kín, nhu cầu riêng, chỗ đỗ, thang mọi tầng, tổng tầng không vượt sàn;
 *  · **xếp** — `ai/arrange/` từng tầng: tầng 1 trước, các tầng trên bám mốc thang/giếng trời tầng 1;
 *    diện tích đầu bài khai là SÀN CỨNG ở cổng, phòng đầu bài không khai thì bám số mô hình khai;
 *  · **suy tường**, **kiểm liên tầng**, **chấm**, **vẽ** — không đổi.
 *
 * ── Đầu vào: CHỈ đầu bài và khảo sát ────────────────────────────────────────────────
 *
 * Haan, 15/09/2026: «prompt input chỉ lấy thông tin đầu bài và khảo sát thực tế, tạm bỏ qua thông tin từ
 * chương trình không gian». Bước chương trình không gian vẫn chạy được riêng, nhưng mặt bằng KHÔNG đọc
 * nó. Danh mục phòng mặt bằng dùng được dựng lại từ ý định và lưu thành artifact `ai_space_program`
 * riêng (không đặt head) để lineage mặt bằng → danh mục → đầu bài vẫn đọc được.
 *
 * ── Vòng sửa: tối đa BA lượt ────────────────────────────────────────────────────────
 *
 * Haan, 15/09/2026: «nếu phương án hỏng cho phép loop tối đa 3 lần thay vì 1 lần». Ba ngả (`retryPlan`,
 * theo tài liệu bàn giao mục 08, Haan duyệt 15/09/2026): sai hợp đồng → lấy mẫu lại, không kèm câu trả
 * lời hỏng; có lỗi NGỮ NGHĨA (danh mục sai đầu bài, dồn vùng, diện tích vượt khối xây, phòng mang cửa
 * chính sai mặt) → gửi lại ý định cũ (đã đánh mã `type_n`) kèm đúng các lỗi ấy; chỉ còn lỗi HÌNH HỌC →
 * dừng, không gọi lại — bộ dựng hình đã thử hết cách của nó. Vẫn hỏng sau lượt thứ tư → không đúc gì.
 *
 * ── Dữ liệu gửi đi ──────────────────────────────────────────────────────────────────
 *
 * Hạng 2: đầu bài + khảo sát đã lược danh tính, dạng VĂN XUÔI tiếng Việt (`brief/narrative.ts`), và tri
 * thức dạng JSON: từ vựng phòng, ràng buộc đầu bài, lưới vùng, mặt thoáng, luật đi xuyên, ý đồ bố cục
 * của phương án. KHÔNG một toạ độ nào.
 */

import {
  aiHouseIntentSchema,
  type AiBriefDigest,
  type AiFloorPlan,
  type AiPlanIntent,
  type AiPlanRooms,
  type AiPlanRoomsLevel,
  type AiPlanTree,
  type AiSpaceProgram,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import houseIntentSchemaJson from '../../../../contracts/ai-house-intent.schema.json';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import { briefNarrative, modelBody } from '../brief/narrative';
import type { BriefFidelity } from '../kb/brief-fidelity';
import { usableMaxAspect, usableMinSide, type ConstructionNorms } from '../kb/construction';
import type {
  ReasoningEffort,
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import type { RulePack } from '../rules/rule-pack';
import { siteFaces, type Face, type SiteContextTable } from '../kb/site-context';
import type { VocabularyIndex, ZoneDefaults } from '../kb/vocabulary';
import {
  arrangeLevel,
  isRevisable,
  ZONES,
  type ArrangeResult,
  type ArrangeSummary,
  type LevelIntent,
} from './arrange';
import { SPLIT_MIN_CM } from './arrange/grid';
import { buildableFromDigest, type BuildableBox } from './buildable';
import { briefDemands, type BriefDemands } from './brief-demands';
import { labelReservedShaft } from './plan-demands';
import type { Rect } from './draw/geometry';
import type { DrawNote } from './draw/notes';
import {
  briefMinimums,
  foldStairCore,
  levelIntentsOf,
  proposalFromHouse,
  renameHouse,
  type HouseIntent,
} from './house';
import { outlineFaces } from './outline-faces';
import { checkPlan, type PlanCheckResult, type PlanIssue } from './plan-check';
import { levelFromRooms, withMergedParts } from './plan-geometry';
import type { PlanQuality } from './plan-quality';
import { scoreForArtifact, scorePlan, type PlanScore } from './plan-score';
import {
  checkProposal,
  foldInBedroom,
  programFromProposal,
  programKnowledge,
  PROGRAM_PREDICATES,
  type ProgramKnowledge,
} from './program';
import type { AiPrompts } from './prompts';
import { injectableRules, type InjectedRule } from './rule-packs';
import { MEASURABLE_ON_PLAN } from './rule-warnings';
import { clampText, normaliseHouseIds } from './tree/ids';
import { stairRunNeedCm, stairTreads } from './tree/stair-fit';
import type { LevelAnchors, LevelLayout, RoomGroups } from './tree';

const SCHEMA_VERSION = '1.0.0';

/** Trần độ dài `rationale` của artifact — cùng `maxLength` trong hợp đồng. */
const RATIONALE_MAX = 1500;

/** Tối đa bấy nhiêu dòng «tránh những chỗ này» — quá dài thì lượt gọi lại thành một bài giảng. */
const HINTS_MAX = 16;

/**
 * Số lượt SỬA tối đa sau lượt đầu (Haan, 15/09/2026: «loop tối đa 3 lần thay vì 1 lần»). Trần chi phí
 * một phương án là 1 + 3 lượt gọi — con số đọc được ở đây, không phải hệ quả của một vòng lặp mở.
 */
export const HOUSE_REVISIONS_MAX = 3;

/** Mã băm giữ chỗ khi kiểm liên tầng TRƯỚC lúc danh mục phòng thành artifact — không đi vào artifact. */
const PENDING_REF = `sha256:${'0'.repeat(64)}`;

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

/** Sân đầu bài đòi → câu tiếng Anh cho lời dẫn. */
const YARD_WORDS: Record<string, string> = {
  san_truoc: 'front yard',
  san_sau: 'back yard',
  san_ben: 'side yard',
  san_trong: 'inner courtyard',
};

/** Vị từ quy tắc mô hình dùng được ở bước cả nhà: phần danh mục (diện tích, tầng) + phần mặt bằng. */
const HOUSE_PREDICATES: ReadonlySet<string> = new Set([
  ...PROGRAM_PREDICATES,
  ...MEASURABLE_ON_PLAN,
]);

/**
 * Cách lượt tiếp theo được gọi. `none` chỉ còn ở lượt chạy trước 15/09/2026 — màn hình vẫn đọc được.
 */
export type RetryKind = 'revise' | 'resample' | 'none';

/** Một tầng không xếp được, kèm câu tiếng Việt cho màn hình. */
export interface LevelRejection {
  /** `0` = lỗi CẢ NHÀ — danh mục phòng sai đầu bài, hoặc lỗi liên tầng khi đã ghép đủ. */
  level: number;
  /** Lỗi của lượt CUỐI. */
  messages: string[];
  /** Lỗi của lượt ĐẦU, khi đã có lượt sửa — để kỹ sư thấy vòng sửa làm tốt lên hay tệ đi. */
  firstMessages?: string[];
  retry?: RetryKind;
  /** Số lượt gọi mô hình đã dùng cho phương án khi bác. */
  attempts?: number;
  /** Chỗ chương trình đã tự sửa ở lượt cuối (vùng mặc định, quan hệ bỏ…). */
  notes?: string[];
}

/** Phương án không đúc được artifact — lỗi nghiệp vụ đọc được, không thử lại. */
export class AiPlanRejected extends Error {
  readonly retryable = false;

  constructor(readonly levels: LevelRejection[]) {
    const first = levels[0];
    super(
      first
        ? `Chưa xếp được ${first.level === 0 ? 'mặt bằng' : `tầng ${first.level}`}: ${first.messages[0] ?? ''}${
            first.messages.length > 1 ? ` (và ${first.messages.length - 1} lỗi khác)` : ''
          }`.trim()
        : 'Chưa xếp được mặt bằng.',
    );
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

export interface PlanContextInput {
  digest: AiBriefDigest;
  variant: PlanVariant;
  /** Nhãn tiếng Việt theo mã phòng — cho văn xuôi đầu bài và để mô hình hiểu mã. */
  labels: Record<string, string>;
  /** Từ vựng phòng — nguồn của `room_types` gửi cho mô hình. */
  vocabulary: VocabularyIndex;
  /** Mức bám đầu bài (`kb/brief_fidelity.yaml`) — khép kín, chỗ đỗ, tiện ích trong phòng ngủ. */
  fidelity: BriefFidelity;
  construction: ConstructionNorms;
  /** Gói quy tắc kỹ sư đã chọn, đã gộp. Rỗng là mặc định hợp lệ (T20). */
  rules: RulePack;
  /**
   * Bảng hiện trạng bốn phía (`kb/site_context.yaml`), ĐI QUA ĐẦU VÀO chứ không import tệp dữ liệu
   * ở đây: tệp YAML chỉ nạp được qua bộ dựng của Worker.
   */
  siteContext: SiteContextTable;
  /** Nhóm mã phòng của `kb/room_vocabulary.yaml` mà bộ giải cần. */
  groups: RoomGroups;
  /** Cặp loại phòng được ghép, khoá `mergeKey` (`kb/room_vocabulary.yaml` mục `merge_allowed`). */
  mergeAllowed: ReadonlySet<string>;
  /** Vùng mặc định khi ý định bỏ sót phòng (`kb/room_vocabulary.yaml` mục `zone_defaults`). */
  zoneDefaults: ZoneDefaults;
  /** Loại phòng giao thông đứng có thang (`kb/brief_fidelity.yaml` mục `stair_types`). */
  stairTypes: readonly string[];
  /**
   * Gói quy tắc bộ chấm đọc (kinh nghiệm + đo được). Có mặt thì bộ giải chấm ứng viên bằng nó và căn
   * vách theo diện tích — số kinh nghiệm chỉ vào điểm, không loại ứng viên nào.
   */
  scoreRules?: RulePack;
  /** Định mức diện tích nghề (`kb/space_norms.yaml`) — chỉ vào ĐIỂM (T48). */
  areaNorms?: ReadonlyMap<string, { min: number; target: number; max: number }> | null;
  /** Thước chấm để xếp hạng ứng viên (`kb/plan_quality.yaml`). */
  quality?: PlanQuality;
  roomGroups?: Record<string, string[]>;
  /** Dòng gỡ lỗi của bộ giải — chỉ phép thử dùng. */
  trace?: (line: string) => void;
}

/** Mọi thứ tất định suy được TRƯỚC lượt gọi đầu tiên — dùng chung cho mọi lượt. */
export interface PlanContext {
  buildable: BuildableBox;
  /** Hình bao xây được đổi sang cm — đơn vị của hợp đồng mặt bằng. */
  buildableCm: Rect;
  northDeg: number;
  /** Mặt thửa lấy được sáng — suy từ khảo sát, không hỏi mô hình (`outline-faces.ts`). */
  openFaces: readonly Face[];
  accessFaces: readonly Face[];
  /** Mặt lối vào chính và lối xe đầu bài khai. */
  entrances: { main: Face | null; vehicle: Face | null };
  /** Các tầng của nhà theo đầu bài, tăng dần. */
  levels: number[];
  /** Đầu bài dạng văn xuôi tiếng Việt — giống hệt nhau ở mọi lượt gọi của hồ sơ. */
  narrative: string;
  /** Tri thức ĐẦY ĐỦ — bộ kiểm danh mục đọc nó. Không gửi nguyên cho mô hình. */
  knowledge: HouseKnowledge;
  /**
   * Đòi hỏi suy từ đầu bài (T65), KÈM `warnings` — cổng mặt bằng và màn hình đều đọc từ đây.
   *
   * `knowledge.brief_demands` mang đúng phần ấy trừ `warnings`, vì nó đi vào lời dẫn. Hai chỗ
   * không lệch nhau được: `briefDemands` là hàm THUẦN, cùng đầu bài thì cùng kết quả.
   */
  demands: BriefDemands;
  /** Phần tri thức GỬI cho mô hình — giống hệt nhau ở mọi lượt, để bộ nhớ đệm của nhà cung cấp đọc lại. */
  modelKnowledge: HouseModelKnowledge;
  /** Lược đồ gửi cho mô hình: hợp đồng `ai-house-intent`. */
  schema: Record<string, unknown>;
}

/**
 * Tri thức tiêm vào lời dẫn — phần danh mục (`ProgramKnowledge`: từ vựng, ràng buộc đầu bài, sàn xây
 * được) cộng phần xếp (lưới vùng, mặt thoáng, luật đi xuyên, ý đồ của phương án). Không một toạ độ nào.
 */
export interface HouseKnowledge extends ProgramKnowledge {
  /** Khối xây được, m — để mô hình biết lô rộng hay hẹp, không để tính toạ độ. */
  block_m: { width: number; depth: number };
  /** Lưới vùng hiệu dụng: lô hẹp chỉ còn một cột, lô nông chỉ còn một hàng. */
  grid: { columns: 1 | 3; rows: 1 | 3 };
  /** Lưới bản phác gửi mô hình (T48): số cột, số hàng, cạnh ô — `sketchGridOf`. */
  sketch_grid: SketchGridSize;
  /** Định mức diện tích nghề theo loại phòng — vắng thì lời dẫn không có bảng ấy (T48). */
  area_norms?: ReadonlyMap<string, { min: number; target: number; max: number }>;
  zones: readonly string[];
  open_faces: readonly Face[];
  access_faces: readonly Face[];
  yards: string[];
  main_entrance_side: Face | null;
  vehicle_entrance_side: Face | null;
  merge_allowed: string[][];
  passage: {
    through: string[];
    entry_through: string[];
    served_from: Record<string, string[]>;
  } | null;
  variant_id: string;
  strategy: string;
  /**
   * Thang dựng từ tham số (Q-45d): số bậc một tầng và chiều dài lọt lòng ô thang cần dọc chiều đi lên.
   * Chương trình tính, không để mô hình chia — mô hình chỉ cần khai diện tích ô thang đủ chứa nó.
   */
  stair_geometry: {
    risers: number;
    one_flight_length_m: number | null;
    two_flights_length_m: number | null;
    two_flights_min_width_m: number;
  };
}

/**
 * Phần tri thức GỬI cho mô hình (T46, 15/09/2026 — Haan: «tối giản lời dẫn, ưu tiên giữ đầu bài, khảo
 * sát, đầu ra mong muốn; phần còn lại tối giản hoặc loại bỏ»).
 *
 * Chỉ giữ thứ mô hình phải khớp mà văn xuôi `<brief>` không nói thẳng: mã loại phòng, phòng ngủ theo
 * nhóm thành viên (số phòng suy từ số người), sàn mỗi tầng, khối nhà, mặt thoáng (suy từ hiện trạng bốn
 * phía), ô thang, chỗ để xe, luật khép kín, luật đi xuyên. Đã BỎ vì văn xuôi nói rồi hoặc mô hình không
 * dùng: danh sách không gian đầu bài, quy cách cửa/cửa sổ/lan can/cao tầng, nhóm chức năng của từng loại
 * phòng, dung sai, loại hình, hướng lối vào, sân, khoảng giao thông, mã phương án.
 *
 * `HouseKnowledge` vẫn đủ cho bộ kiểm: gửi ít đi KHÔNG nới phép kiểm nào.
 */
export interface HouseModelKnowledge {
  /** Mã → tên tiếng Việt, để đọc được tên phòng trong `<brief>`. */
  room_types: Record<string, string>;
  /**
   * Định mức nghề theo loại phòng, m²: `[tối thiểu, hợp lý, tối đa]` (T48, `kb/space_norms.yaml`).
   *
   * Vì sao gửi: lượt đo 58d9ff66 khai kho 2 m² và bếp 12 m² mà không gì lên tiếng — nhánh AI chưa bao
   * giờ đọc tệp định mức. Đây là số THAM KHẢO: đầu bài khách khai vẫn thắng, và lệch định mức chỉ trừ
   * điểm chứ không bác (Haan chốt 16/09/2026).
   */
  room_area_m2: Record<string, [number, number, number]>;
  bedrooms: {
    for: string;
    type: string;
    count: number;
    floor: number | null;
    ensuite: boolean;
    /** Không gian riêng cho TỪNG phòng ngủ của nhóm (ban công riêng…). */
    own: string[];
    /** Tiện ích trong phòng ngủ — cộng diện tích, không tách không gian. */
    inside: string[];
  }[];
  /** Trần tổng diện tích mục tiêu của một tầng, m² — một số khi mọi tầng như nhau. */
  storey_area_m2: number | number[];
  block_m: { width: number; depth: number };
  sketch_grid: SketchGridSize;
  open_faces: readonly Face[];
  /** Kích thước lọt lòng nhỏ nhất của ô thang hai vế, m. Vắng ở nhà một tầng. */
  stair_min_m?: { width: number; length: number };
  garage_min_m2?: number;
  ensuite: { child: string[]; parent: string[] };
  walk_through: string[];
  entry_through: string[];
  served_from: Record<string, string[]>;
  open_pairs: string[][];
  strategy: string;
  /**
   * Quy tắc kỹ sư đã tích — vắng khi không tích gói nào (mặc định, T20). Chỉ phần mô hình đọc được
   * (`ModelConstraint`), và không lặp điều đã có ở chỗ khác của tri thức (`modelConstraints`).
   */
  constraints?: ModelConstraint[];
}

/** Một quy tắc gửi cho mô hình: bỏ nguồn, loại, trường rỗng; mức chỉ ghi khi là lỗi chặn. */
export interface ModelConstraint {
  id: string;
  predicate: string;
  target?: string;
  value?: number;
  unit?: string;
  severity?: 'error';
}

export interface SketchGridSize {
  columns: number;
  rows: number;
  cell_m: number;
}

/** Cạnh dài của khối nhà vẽ bằng tối đa bấy nhiêu ô — quá thì ô to lên theo bậc nửa mét. */
const SKETCH_CELLS_MAX = 24;

/**
 * Lưới bản phác cho khối nhà (T48): ô một mét, khối dài hơn `SKETCH_CELLS_MAX` m thì ô to lên theo bậc
 * 0,5 m. Một ô một mét để mô hình đếm ô ra m² mà không phải nhân; trần số ô để một hàng không dài quá.
 */
export function sketchGridOf(widthCm: number, depthCm: number): SketchGridSize {
  const longM = Math.max(widthCm, depthCm) / 100;
  const cell = Math.max(1, Math.ceil((longM / SKETCH_CELLS_MAX) * 2) / 2);
  return {
    columns: Math.max(1, Math.round(widthCm / 100 / cell)),
    rows: Math.max(1, Math.round(depthCm / 100 / cell)),
    cell_m: cell,
  };
}

export function modelKnowledgeOf(k: HouseKnowledge): HouseModelKnowledge {
  const bands: Record<string, [number, number, number]> = Object.fromEntries(
    k.room_types
      .filter((t) => !k.stair_types.slice(1).includes(t.code))
      .flatMap((t) => {
        const norm = k.area_norms?.get(t.code);
        return norm ? [[t.code, [norm.min, norm.target, norm.max]] as const] : [];
      }),
  );
  const { areaBands, constraints } = modelConstraints(bands, k.constraints);
  const areas = k.buildable_per_level_m2;
  const stair = k.stair_geometry;
  const stairLength = stair.two_flights_length_m ?? stair.one_flight_length_m;
  return {
    // Chỉ loại thang ĐẦU của `stair_types`: các loại sau (lõi thang) bị gộp vào nó khi xếp
    // (`foldStairCore`), đưa cho mô hình thì nó khai cả hai (lượt 4a521f52).
    room_types: Object.fromEntries(
      k.room_types
        .filter((t) => !k.stair_types.slice(1).includes(t.code))
        .map((t) => [t.code, t.vi]),
    ),
    room_area_m2: areaBands,
    bedrooms: k.members
      .filter((m) => m.bedroom_type && m.rooms > 0)
      .map((m) => ({
        for: m.role,
        type: m.bedroom_type!,
        count: m.rooms,
        floor: m.floor,
        ensuite: m.ensuite,
        own: m.needs,
        inside: m.in_room,
      })),
    storey_area_m2: areas.every((a) => a === areas[0]) ? (areas[0] ?? 0) : areas,
    block_m: k.block_m,
    sketch_grid: k.sketch_grid,
    open_faces: k.open_faces,
    ...(k.floors > 1 && stairLength !== null
      ? { stair_min_m: { width: stair.two_flights_min_width_m, length: stairLength } }
      : {}),
    ...(k.garage_min_m2 !== null ? { garage_min_m2: k.garage_min_m2 } : {}),
    ensuite: { child: k.ensuite_child_types, parent: k.ensuite_parent_types },
    walk_through: k.passage?.through ?? [],
    entry_through: k.passage?.entry_through ?? [],
    served_from: k.passage?.served_from ?? {},
    open_pairs: k.merge_allowed,
    strategy: k.strategy.trim().replace(/\s+/g, ' '),
    ...(constraints.length ? { constraints } : {}),
  };
}

/**
 * Quy tắc gói đã tích, bỏ phần TRÙNG với tri thức đã gửi (Haan 17/09/2026: «giữ ở lời dẫn, nhưng yếu
 * tố nào đã có trong lời dẫn thì bỏ qua, tránh trùng lặp»).
 *
 * `min_area`/`max_area` nhắm đúng một loại phòng đã có dải trong `room_area_m2` thì GỘP số vào dải
 * (lấy mức chặt hơn) rồi bỏ quy tắc — cùng một ý không phải nói hai lần bằng hai con số. Đo trên biệt thự
 * demo: 3/22 quy tắc (`min_area_living`, `min_area_master_bedroom`, `lightwell_max_area`). Quy tắc còn
 * lại bỏ nguồn, loại, trường rỗng: mô hình không làm gì khác được với chúng — lượt 17/09/2026 gửi 4.162
 * ký tự cho 22 quy tắc.
 */
export function modelConstraints(
  bands: Readonly<Record<string, [number, number, number]>>,
  rules: readonly InjectedRule[],
): { areaBands: Record<string, [number, number, number]>; constraints: ModelConstraint[] } {
  const areaBands = Object.fromEntries(
    Object.entries(bands).map(([code, band]) => [code, [...band] as [number, number, number]]),
  );
  const constraints: ModelConstraint[] = [];
  for (const rule of rules) {
    const band = rule.target ? areaBands[rule.target] : undefined;
    if (band && rule.value !== null && rule.unit === 'm2') {
      if (rule.predicate === 'min_area') {
        band[0] = Math.max(band[0], rule.value);
        band[1] = Math.max(band[1], band[0]);
        band[2] = Math.max(band[2], band[1]);
        continue;
      }
      if (rule.predicate === 'max_area') {
        band[2] = Math.min(band[2], rule.value);
        band[1] = Math.min(band[1], band[2]);
        band[0] = Math.min(band[0], band[1]);
        continue;
      }
    }
    constraints.push({
      id: rule.id,
      predicate: rule.predicate,
      ...(rule.target !== null ? { target: rule.target } : {}),
      ...(rule.value !== null ? { value: rule.value } : {}),
      ...(rule.unit !== null ? { unit: rule.unit } : {}),
      ...(rule.severity === 'error' ? { severity: 'error' as const } : {}),
    });
  }
  return { areaBands, constraints };
}

export function planContext(input: PlanContextInput): PlanContext {
  const buildable = buildableFromDigest(input.digest);
  const demands = briefDemands(input.digest, input.fidelity);
  const buildableCm = buildableRectCm(buildable);
  const faces = siteFaces(input.digest.site, input.siteContext);
  const accessFaces = input.digest.site.main_entrance_side
    ? [
        input.digest.site.main_entrance_side,
        ...faces.access.filter((f) => f !== input.digest.site.main_entrance_side),
      ]
    : faces.access;
  const base = programKnowledge({
    digest: input.digest,
    vocabulary: input.vocabulary,
    labels: input.labels,
    buildable,
    construction: input.construction,
    rules: input.rules,
    fidelity: input.fidelity,
    ...(input.quality ? { quality: input.quality } : {}),
  });
  const widthCm = buildableCm.x1 - buildableCm.x0;
  const depthCm = buildableCm.y1 - buildableCm.y0;
  const knowledge: HouseKnowledge = {
    ...base,
    // Cùng TẬP VỊ TỪ mà `rule-warnings.ts` đo lại sau, cộng phần danh mục — một nguồn duy nhất (T20).
    constraints: injectableRules(input.rules, input.digest.building_type, HOUSE_PREDICATES),
    block_m: { width: round1(widthCm / 100), depth: round1(depthCm / 100) },
    grid: { columns: widthCm >= SPLIT_MIN_CM ? 3 : 1, rows: depthCm >= SPLIT_MIN_CM ? 3 : 1 },
    sketch_grid: sketchGridOf(widthCm, depthCm),
    ...(input.areaNorms ? { area_norms: input.areaNorms } : {}),
    zones: ZONES,
    open_faces: faces.open,
    access_faces: accessFaces,
    yards: (input.digest.massing?.yards ?? []).map((yard) => YARD_WORDS[yard] ?? yard),
    main_entrance_side: input.digest.site.main_entrance_side ?? null,
    vehicle_entrance_side: input.digest.site.vehicle_entrance_side ?? null,
    merge_allowed: [...input.mergeAllowed].map((key) => key.split('|')),
    passage: input.groups.passage
      ? {
          through: [...input.groups.passage.through],
          entry_through: [...input.groups.passage.entryThrough],
          served_from: Object.fromEntries(
            [...input.groups.passage.servedFrom].map(([type, from]) => [type, [...from]]),
          ),
        }
      : null,
    variant_id: input.variant.id,
    strategy: input.variant.strategy,
    stair_geometry: stairGeometry(input.construction),
  };
  return {
    buildable,
    buildableCm,
    demands,
    northDeg: northDegFor(input.digest.site.orientation),
    openFaces: faces.open,
    accessFaces,
    entrances: {
      main: input.digest.site.main_entrance_side ?? null,
      vehicle: input.digest.site.vehicle_entrance_side ?? null,
    },
    levels: Array.from({ length: Math.max(1, input.digest.floors) }, (_, i) => i + 1),
    narrative: briefNarrative(input.digest, { roomLabels: input.labels }),
    knowledge,
    modelKnowledge: modelKnowledgeOf(knowledge),
    schema: houseIntentJsonSchema(),
  };
}

/** Số bậc và chiều dài ô thang cần của một tầng thường — cùng phép tính cổng dùng (`tree/stair-fit.ts`). */
function stairGeometry(construction: ConstructionNorms): HouseKnowledge['stair_geometry'] {
  const risers = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
  const width = construction.stairs.two_flights_min_width_m;
  const one = stairRunNeedCm(construction, { flights: 1, treads: risers, acrossCm: width * 50 });
  const two = stairRunNeedCm(construction, { flights: 2, treads: risers, acrossCm: width * 100 });
  return {
    risers,
    one_flight_length_m: one === null ? null : round1(one / 100),
    two_flights_length_m: two === null ? null : round1(two / 100),
    two_flights_min_width_m: width,
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

/** Lược đồ gửi cho mô hình: nguyên hợp đồng `ai-house-intent`, sao ra để không ai sửa bản đã import. */
export function houseIntentJsonSchema(): Record<string, unknown> {
  return structuredClone(houseIntentSchemaJson) as Record<string, unknown>;
}

/** Thân lời gọi: văn xuôi đầu bài + tri thức gửi đi (JSON không thụt lề, T26). */
export function housePrompt(narrative: string, knowledge: HouseModelKnowledge): string {
  return modelBody(narrative, knowledge);
}

/** Phần của một lượt gọi cần LƯU LẠI giữa hai bước Workflow — nhẹ, serialise được. */
export interface PlanCallRecord {
  provider: string;
  model: string;
  usage: StructuredCallResult['usage'];
  latencyMs: number;
}

export interface HouseAttempt {
  /** `null` khi câu trả lời không qua được hợp đồng — `issues` nói sai ở đâu. */
  intent: HouseIntent | null;
  issues: string[];
  call: PlanCallRecord;
}

export interface HouseCallInput {
  client: TextModelClient;
  route: string;
  prompts: AiPrompts;
  context: PlanContext;
  /** Có mặt nghĩa là đây là lượt gọi LẠI — những dòng «tránh những chỗ này». */
  avoid?: readonly string[];
  /** Ý định của lượt trước khi lượt này SỬA nó; vắng = lấy mẫu lại. */
  previous?: HouseIntent | null;
  /** Mức suy nghĩ kỹ sư chọn cho lượt chạy; vắng = cấu hình tuyến. */
  reasoningEffort?: ReasoningEffort;
  onProgress?: StructuredCallOptions['onProgress'];
  signal?: AbortSignal;
}

/** Trần chữ tự do của `ai-house-intent` — cắt thay vì bác cả lượt (`tree/ids.ts` `clampText`). */
const HOUSE_TEXT_LIMITS = { variant_label: 120, rationale: 1500 } as const;

/** Một lượt gọi mô hình cho cả nhà. Đây là chỗ DUY NHẤT trong tệp này tốn tiền. */
export async function callHouseModel(call: HouseCallInput): Promise<HouseAttempt> {
  const retrying = (call.avoid?.length ?? 0) > 0;
  const floor = call.prompts.floorLevel;
  const avoid = (call.avoid ?? []).join('\n');
  // Phần gọi lại nối vào CUỐI thân lời gọi, không vào lời dẫn hệ thống: lời dẫn + đầu bài + tri thức
  // giữ nguyên từng byte như lượt đầu, nên nhà cung cấp đọc lại từ bộ nhớ đệm.
  const retry = !retrying
    ? null
    : call.previous
      ? floor.revise
          .replace('{avoid}', () => avoid)
          .replace('{intent}', () => JSON.stringify(revisable(call.previous!)))
      : floor.resample.replace('{avoid}', () => avoid);

  // Không truyền trần token: tuyến trong `config/models.yaml` là van DUY NHẤT (`text-client.ts`).
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: floor.system,
    prompt: `${housePrompt(call.context.narrative, call.context.modelKnowledge)}${retry ? `\n\n${retry}` : ''}`,
    schema: call.context.schema,
    ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
    ...(call.onProgress ? { onProgress: call.onProgress } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  });

  const record: PlanCallRecord = {
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
  const candidate = tidyHouse(result.json);
  const parsed = aiHouseIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { intent: null, issues: describeZod(parsed.error, candidate), call: record };
  }
  return { intent: parsed.data, issues: [], call: record };
}

/**
 * Ý định cũ gửi lại ở lượt sửa — BỎ `rationale` và `assumptions`: lỗi không bao giờ nằm ở hai trường
 * chữ tự do ấy, và chúng chiếm phần lớn độ dài (T46). Mô hình vẫn viết lại chúng trong câu trả lời.
 */
function revisable(intent: HouseIntent): Omit<HouseIntent, 'rationale' | 'assumptions'> {
  const { rationale: _rationale, assumptions: _assumptions, ...rest } = intent;
  return rest;
}

/** Chuẩn hoá mã phòng và cắt chữ tự do vượt trần của `ai-house-intent`. */
export function tidyHouse(json: unknown): unknown {
  const top = clampText(normaliseHouseIds(json).json, HOUSE_TEXT_LIMITS).json;
  if (!top || typeof top !== 'object' || Array.isArray(top)) return top;
  const intent = top as Record<string, unknown>;
  return Array.isArray(intent.assumptions)
    ? {
        ...intent,
        assumptions: intent.assumptions.map((line) =>
          typeof line === 'string' && line.length > 200 ? `${line.slice(0, 199)}…` : line,
        ),
      }
    : intent;
}

/** Bộ giải một tầng — hàm THUẦN, không tốn gì, nên gọi lại bao nhiêu lần cũng được. */
export function arrangeFor(
  input: PlanContextInput,
  context: PlanContext,
  program: AiSpaceProgram,
  level: number,
  intent: AiPlanIntent,
  anchors: LevelAnchors | null,
  minimums: ReadonlyMap<string, number> = new Map(),
  sketch?: readonly string[] | null,
): ArrangeResult {
  const buildingType = input.digest.building_type;
  return arrangeLevel({
    intent,
    ...(sketch !== undefined ? { sketch } : {}),
    level,
    isTop: level === context.levels[context.levels.length - 1],
    program,
    buildableCm: context.buildableCm,
    balcony: context.demands.balcony,
    construction: input.construction,
    groups: input.groups,
    mergeAllowed: input.mergeAllowed,
    openFaces: context.openFaces,
    accessFaces: context.accessFaces,
    entrances: context.entrances,
    anchors,
    zoneDefaults: input.zoneDefaults,
    stairTypes: input.stairTypes,
    usableMinSideM: (type: string) =>
      usableMinSide(input.construction, type, { cars: input.digest.parking?.cars ?? 0 }),
    usableMaxAspect: (type: string) => usableMaxAspect(input.construction, type),
    briefMinAreaM2: (id: string) => minimums.get(id) ?? null,
    ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
    ...(input.trace ? { trace: input.trace } : {}),
    ...(input.scoreRules
      ? {
          minSideM: (type: string) => input.scoreRules!.minDimension(buildingType, type),
          aspectMax: (type: string) => input.scoreRules!.aspectRatioMax(buildingType, type),
        }
      : {}),
    ...(input.scoreRules && input.quality && input.roomGroups
      ? {
          scoring: {
            quality: input.quality,
            rules: input.scoreRules,
            roomGroups: input.roomGroups,
            buildingType,
          },
        }
      : {}),
  });
}

/**
 * Ghi chú «tránh những chỗ này» cho lượt gọi lại — TIẾNG ANH, dựng từ mã lỗi và tham số.
 *
 * Dựng từ `code` + `params` chứ không dịch câu tiếng Việt: lời dẫn là tiếng Anh có chủ đích
 * (`kb/ai_design_prompts.yaml`), và bóc số ra khỏi một câu văn là chỗ sai im lặng.
 */
export function hintsFor(issues: readonly PlanIssue[], prompts: AiPrompts, prefix = ''): string[] {
  const lines = new Set<string>();
  for (const issue of issues) {
    const template = prompts.floorLevel.hints[issue.code] ?? prompts.floorLevel.hintDefault;
    const values: Record<string, string | number> = {
      code: issue.code,
      ref: issue.ref ?? '',
      ...(issue.params ?? {}),
    };
    const line = template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
    lines.add(prefix ? line.replace(/^- /, `- ${prefix}`) : line);
    if (lines.size >= HINTS_MAX) break;
  }
  return [...lines];
}

/** Câu trả lời trước không qua được hợp đồng — ghi chú cho lượt lấy mẫu lại. */
export function schemaHints(issues: readonly string[]): string[] {
  return issues
    .slice(0, HINTS_MAX)
    .map((issue) => `- The previous answer did not match the schema: ${issue}`);
}

/** Một tầng đã xếp xong, như bước ghi cần. */
export interface ArrangedLevel {
  level: AiPlanRoomsLevel;
  /** Cây bộ giải đã dựng (sau khi căn vách) — NGUỒN hình học, lưu trong artifact. */
  tree: AiPlanTree;
  /** Ý định đã chuẩn hoá, đúng hình `levels[].intent` của artifact. */
  intent: NonNullable<AiFloorPlan['levels'][number]['intent']>;
  arrange: ArrangeSummary;
  notes: DrawNote[];
  rationale: string;
  variantLabel: string | null;
}

export interface PlanAssembleInput {
  levels: readonly ArrangedLevel[];
  context: PlanContext;
  program: AiSpaceProgram;
  programRef: string;
  variant: PlanVariant;
  call: PlanCallRecord;
  route: string;
  promptVersion: string;
  /** Tầng đã hỏng ở một lượt trước và phải xếp lại. */
  resampledLevels: number[];
  construction: ConstructionNorms;
  groups: RoomGroups;
  /** Thước chấm chất lượng (`kb/plan_quality.yaml`) — điểm đi vào payload của artifact (T27). */
  quality: PlanQuality;
  /** Gói quy tắc để tra ngưỡng theo mã phòng khi CHẤM — LUÔN kinh nghiệm + đo được. */
  scoreRules: RulePack;
  /** Định mức diện tích nghề theo loại phòng (`kb/space_norms.yaml`) — chỉ trừ điểm (T48). */
  areaNorms?: ReadonlyMap<string, { min: number; target: number; max: number }> | null;
  /** Mã nhóm → danh sách mã phòng (`kb/room_vocabulary.yaml` mục `group_targets`). */
  roomGroups: Record<string, string[]>;
  buildingType: string;
}

/** Ghép các tầng đã xếp thành phần `ai-plan-rooms` của cả phương án. */
export function levelsToRooms(levels: readonly ArrangedLevel[], variant: PlanVariant): AiPlanRooms {
  // Một ý định cho cả nhà (T45): mọi tầng mang cùng một lời giải thích — ghi một lần.
  const texts = [...new Set(levels.map((entry) => entry.rationale))];
  const rationale =
    texts.length <= 1
      ? (texts[0] ?? '')
      : levels.map((entry) => `Tầng ${entry.level.level}: ${entry.rationale}`).join(' ');
  return {
    variant_label: levels[0]?.variantLabel || variant.label,
    levels: levels.map((entry) => entry.level),
    rationale:
      rationale.length > RATIONALE_MAX ? `${rationale.slice(0, RATIONALE_MAX - 1)}…` : rationale,
  };
}

export interface AssembledPlan {
  payload: AiFloorPlan;
  /** Mâu thuẫn ở bước neo lỗ mở lên tường vừa suy. Với cây hợp lệ: rỗng. */
  issues: PlanIssue[];
  notes: DrawNote[];
}

/**
 * Ghép thành artifact `ai_floor_plan`. Hàm THUẦN, tất định — cùng ý định cho cùng mã băm.
 *
 * Suy tường từ phòng và neo lỗ mở lên tường (`plan-geometry.ts`), điền `outline_faces`, và lưu CÂY,
 * Ý ĐỊNH và tóm tắt bộ giải của từng tầng để truy vết.
 */
export function assemblePlan(input: PlanAssembleInput): AssembledPlan {
  const issues: PlanIssue[] = [];
  const notes: DrawNote[] = [];
  const rooms = levelsToRooms(input.levels, input.variant);
  const levels = input.levels.map((entry) => {
    const geometry = levelFromRooms(entry.level, input.construction, input.groups.outdoor);
    issues.push(...geometry.issues);
    notes.push(...geometry.notes);
    // Không gian mở chia thành khu để tờ vẽ ghi tên từng khu (T48) — nhãn đọc, không phải tường.
    const rooms = labelReservedShaft(
      withMergedParts(
        geometry.level.rooms,
        (id) => {
          const space = input.program.spaces.find((entry) => entry.id === id);
          return space ? { type: space.type, target: space.target_area_m2 } : null;
        },
        input.groups.passage
          ? { cooking: input.groups.passage.cooking, quiet: input.groups.passage.quiet }
          : undefined,
      ),
      input.context.demands.elevator,
    );
    return {
      ...geometry.level,
      rooms,
      outline_faces: outlineFaces(
        geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
        input.context.openFaces,
      ),
      tree: storedTree(entry.tree),
      intent: entry.intent,
      arrange: {
        candidates: entry.arrange.candidates,
        passed: entry.arrange.passed,
        intent_fit: entry.arrange.intentFit,
        parti: entry.arrange.parti,
        relaxed: entry.arrange.relaxed,
      },
    };
  });

  return {
    payload: {
      schema_version: SCHEMA_VERSION,
      program_ref: input.programRef,
      variant_id: input.variant.id,
      variant_label: rooms.variant_label || input.variant.label,
      strategy: input.variant.strategy,
      north_deg: input.context.northDeg,
      levels,
      rationale: rooms.rationale,
      generator: {
        kind: 'ai',
        provider: input.call.provider,
        model: input.call.model,
        route: input.route,
        prompt_version: input.promptVersion,
        repaired: input.resampledLevels.length > 0,
        // LUÔN bật: tường của nhánh AI không có đường nào khác để ra đời, và tờ vẽ phải nói ra.
        walls_derived: true,
        layout: 'intent',
        resampled_levels: [...input.resampledLevels].sort((a, b) => a - b),
      },
    },
    issues,
    notes,
  };
}

/** Cây lưu trong artifact: bỏ hai trường đã có chỗ ở gốc artifact. */
function storedTree(tree: AiPlanTree): NonNullable<AiFloorPlan['levels'][number]['tree']> {
  const { variant_label: _label, rationale: _rationale, ...rest } = tree;
  return rest;
}

/** Ý định lưu trong artifact — bản ĐÃ chuẩn hoá của bộ giải. */
export function storedIntent(intent: LevelIntent): ArrangedLevel['intent'] {
  return intent.stored;
}

export interface PlanFinal {
  payload: AiFloorPlan;
  /** Kết quả kiểm CUỐI CÙNG, trên chính dữ liệu sẽ được vẽ và lưu — gồm cổng liên tầng. */
  check: PlanCheckResult;
  notes: DrawNote[];
  /** LUÔN `true`; giữ vì artifact đúc trước 12/09/2026 mang `false`. */
  wallsDerived: boolean;
  /** Điểm chất lượng, dạng đầy đủ để hiện lên màn hình (payload chỉ mang phần cần đọc lại). */
  score: PlanScore;
}

/** Ghép, kiểm liên tầng, rồi CHẤM. Hàm THUẦN. */
export function finalisePlan(input: PlanAssembleInput): PlanFinal {
  const assembled = assemblePlan(input);
  const check = checkPlan({
    plan: assembled.payload,
    program: input.program,
    buildable: input.context.buildableCm,
    doorExemptTypes: input.groups.noDoorRequired,
    verticalTypes: input.groups.vertical,
    demands: {
      elevator: input.context.demands.elevator,
      balcony: input.context.demands.balcony,
      spaces: input.context.demands.spaces,
    },
  });
  const score = scorePlan({
    plan: assembled.payload,
    program: input.program,
    buildingType: input.buildingType,
    quality: input.quality,
    rules: input.scoreRules,
    groups: input.roomGroups,
    // Luật đi lại và định mức nghề (T48): C6/C7 đo đường đi hằng ngày, A5/A6 đếm phòng ngoài định mức.
    passage: input.groups.passage ?? null,
    areaNorms: input.areaNorms ?? null,
  });
  // Nhắc nghề suy từ đầu bài (T65) đi cùng đường với ghi chú của bộ vẽ: chúng hiện cạnh mặt bằng
  // để kiến trúc sư quyết, và KHÔNG bao giờ chặn — đó là ranh giới T52.
  const briefNotes: DrawNote[] = input.context.demands.warnings.map((message) => ({
    code: 'brief_demand_warning',
    message,
  }));

  return {
    payload: { ...assembled.payload, score: scoreForArtifact(score) },
    check: { ...check, blocking: [...assembled.issues, ...check.blocking] },
    notes: [...assembled.notes, ...briefNotes],
    wallsDerived: true,
    score,
  };
}

/** Kết quả bộ giải đổi thành tầng đã xếp, hoặc `null` khi không xếp được. */
export function arrangedLevel(result: ArrangeResult): ArrangedLevel | null {
  const layout: LevelLayout | null = result.layout;
  if (!layout?.level || !result.summary) return null;
  return {
    level: layout.level,
    tree: layout.tree,
    intent: result.intent.stored,
    arrange: result.summary,
    notes: [...result.notes, ...layout.notes],
    rationale: result.intent.rationale,
    variantLabel: result.intent.variantLabel,
  };
}

/** Phần tất định cần để kiểm liên tầng và chấm — không đổi giữa các lượt. */
export interface HouseScoring {
  quality: PlanQuality;
  scoreRules: RulePack;
  roomGroups: Record<string, string[]>;
}

/** Ý định cả nhà đã xếp được — đủ để bước ghi đúc artifact mà không phải xếp lại. */
export interface HouseArranged {
  program: AiSpaceProgram;
  levels: ArrangedLevel[];
  /** Ý định đã đánh mã `type_n` mà cả nhà xếp từ đó — lưu vào artifact cho lượt sửa bố cục (T53). */
  intent: HouseIntent;
  /** Điểm khi xếp xong, đủ để luồng quyết có gọi sửa vì dưới ngưỡng không (T53). */
  score: HouseScoreSummary;
}

/** Tóm tắt điểm của một phương án đã xếp — không phải bảng điểm đầy đủ (bảng ấy nằm trong artifact). */
export interface HouseScoreSummary {
  /** % trên phần trọng số chấm được; `null` khi không chấm được gì. */
  percent: number | null;
  /** Ngưỡng nhận của thước lúc chấm; `null` = không ngưỡng. */
  acceptPercent: number | null;
  /** Dòng gửi mô hình cho các tiêu chí mất điểm nhiều nhất — rỗng khi đạt ngưỡng. */
  hints: string[];
}

/** Gửi mô hình bấy nhiêu tiêu chí mất điểm nhất khi dưới ngưỡng — nhiều hơn thì nó sửa lan man. */
const SCORE_HINTS_MAX = 3;

/** % điểm trên phần trọng số chấm được, một chữ số thập phân; `null` khi không chấm được gì. */
export function scorePercent(score: { points: number; scoredWeight: number }): number | null {
  return score.scoredWeight > 0
    ? Math.round((score.points / score.scoredWeight) * 1000) / 10
    : null;
}

/** Điểm → phần trăm, và dòng sửa cho vài tiêu chí mất nhiều điểm nhất khi dưới ngưỡng (T53). */
export function scoreSummary(
  score: PlanScore,
  acceptPercent: number | null,
  prompts: AiPrompts,
): HouseScoreSummary {
  const percent = scorePercent(score);
  if (acceptPercent === null || percent === null || percent >= acceptPercent) {
    return { percent, acceptPercent, hints: [] };
  }
  const hints = score.criteria
    .filter(
      (criterion) => criterion.score !== null && prompts.floorLevel.scoreHints[criterion.code],
    )
    .map((criterion) => ({ criterion, loss: criterion.weight * (1 - criterion.score!) }))
    .filter((entry) => entry.loss > 0.01)
    .sort((p, q) => q.loss - p.loss)
    .slice(0, SCORE_HINTS_MAX)
    .map(({ criterion }) =>
      prompts.floorLevel.scoreHints[criterion.code]!.replace(
        /\{rooms\}/g,
        criterion.refs.slice(0, 6).join(', ') || 'several rooms',
      ),
    );
  return { percent, acceptPercent, hints };
}

export interface HouseEvaluation {
  ok: HouseArranged | null;
  /** Lý do của lượt này, theo tầng; tầng `0` = cả nhà. Rỗng khi `ok`. */
  rejections: LevelRejection[];
  /**
   * Dòng «tránh những chỗ này» cho lượt sửa — CHỈ từ lỗi NGỮ NGHĨA (`isRevisable`, danh mục sai đầu bài).
   * Rỗng trong khi `rejections` có lỗi nghĩa là mọi lỗi đều hình học: không gọi lại mô hình.
   */
  hints: string[];
  /** Ý định đã đánh mã `type_n` — gửi lại ở lượt sửa, vì lời lỗi nói bằng các mã này. */
  renamed: HouseIntent | null;
}

/**
 * Kiểm và xếp một ý định cả nhà — hàm THUẦN, không tốn gì.
 *
 *  1. danh mục phòng đúng đầu bài (bộ kiểm T41) — sai thì dừng ở đây, chưa xếp gì;
 *  2. tầng 1 → mốc → các tầng trên, diện tích đầu bài là sàn cứng;
 *  3. ghép, kiểm liên tầng.
 */
export function evaluateHouse(
  input: PlanContextInput & HouseScoring,
  context: PlanContext,
  intent: HouseIntent,
  generator: AiSpaceProgram['generator'],
  prompts: AiPrompts,
): HouseEvaluation {
  const stairFold = foldStairCore(proposalFromHouse(intent), input.fidelity.stairTypes);
  const folded = foldInBedroom(
    stairFold.proposal,
    input.fidelity.inBedroomTypes,
    input.fidelity.ensuiteParentTypes,
  );
  const programIssues = checkProposal(folded.proposal, context.knowledge, input.labels);
  if (programIssues.length) {
    return {
      ok: null,
      rejections: [{ level: 0, messages: programIssues }],
      hints: programIssues.slice(0, HINTS_MAX).map((issue) => `- ${issue}`),
      renamed: null,
    };
  }

  const { payload: program, idMap } = programFromProposal({
    proposal: folded.proposal,
    includes: folded.includes,
    briefRef: PENDING_REF,
    generator,
  });
  // Tiện ích gộp vào phòng ngủ không có mã mới: phòng mẹ gánh nó, nên mọi chỗ trỏ tiện ích trỏ về mẹ.
  const fullMap = new Map(idMap);
  for (const room of intent.rooms) {
    if (!fullMap.has(room.id) && room.ensuite_of && idMap.has(room.ensuite_of)) {
      fullMap.set(room.id, idMap.get(room.ensuite_of)!);
    }
  }
  // Lõi thang gộp vào ô thang cùng tầng: quan hệ trỏ lõi trỏ về ô thang.
  for (const [gone, host] of stairFold.absorbed) {
    if (!fullMap.has(gone) && idMap.has(host)) fullMap.set(gone, idMap.get(host)!);
  }
  const renamed = dedupeRooms(
    renameHouse(
      { ...intent, rooms: intent.rooms.filter((room) => !stairFold.absorbed.has(room.id)) },
      fullMap,
    ),
  );
  const { byLevel, crossLevel, sketches } = levelIntentsOf(renamed, context.levels);
  const minimums = briefMinimums(input.digest, program);
  const crossNotes = crossLevel.map(
    (rel) =>
      `Quan hệ "${rel.a}"–"${rel.b}" nối hai tầng khác nhau — đã bỏ, mặt bằng chỉ xếp trong một tầng.`,
  );

  const rejections: LevelRejection[] = [];
  const hints: string[] = [];
  const arranged: ArrangedLevel[] = [];
  const fail = (level: number, result: ArrangeResult) => {
    rejections.push({
      level,
      messages: result.issues.map((issue) => issue.message),
      notes: [...crossNotes, ...result.notes.map((note) => note.message)],
    });
    hints.push(
      ...hintsFor(
        result.issues.filter((issue) => isRevisable(issue.code)),
        prompts,
        `Storey ${level}: `,
      ),
    );
  };

  // Bộ xếp có thể thêm nhánh hành lang cho một tầng (V-29): tầng sau và artifact dùng chương trình mới.
  let current = program;
  const [ground, ...upper] = context.levels;
  const groundIntent = byLevel.get(ground!)!;
  let groundResult = arrangeFor(
    input,
    context,
    current,
    ground!,
    groundIntent,
    null,
    minimums,
    sketches.get(ground!),
  );
  if (
    !arrangedLevel(groundResult) &&
    groundResult.issues.some((issue) => ENTRY_SIDE_CODES.has(issue.code))
  ) {
    for (const entry of entryAlternatives(groundIntent, current, input.groups.passage)) {
      const retry = arrangeFor(
        input,
        context,
        current,
        ground!,
        { ...groundIntent, entry_room: entry },
        null,
        minimums,
        sketches.get(ground!),
      );
      if (!arrangedLevel(retry)) continue;
      groundResult = {
        ...retry,
        notes: [
          {
            code: 'entry_room_switched',
            message: `Chương trình đặt cửa chính vào "${entry}" thay cho "${groundIntent.entry_room ?? 'phòng mô hình chọn'}": với phòng mô hình chọn, không cách xếp nào đặt được cửa chính hoặc cửa xe ra mặt thoáng.`,
          },
          ...retry.notes,
        ],
      };
      break;
    }
  }
  const groundDone = arrangedLevel(groundResult);
  if (!groundDone) {
    fail(ground!, groundResult);
    return { ok: null, rejections, hints: hints.slice(0, HINTS_MAX), renamed };
  }
  arranged.push(groundDone);
  if (groundResult.program) current = groundResult.program;
  const anchors = groundResult.layout!.anchors;
  for (const level of upper) {
    const result = arrangeFor(
      input,
      context,
      current,
      level,
      byLevel.get(level)!,
      anchors,
      minimums,
      sketches.get(level),
    );
    const done = arrangedLevel(result);
    if (done) {
      arranged.push(done);
      if (result.program) current = result.program;
    } else fail(level, result);
  }
  if (rejections.length) return { ok: null, rejections, hints: hints.slice(0, HINTS_MAX), renamed };

  const final = finalisePlan({
    levels: arranged,
    context,
    program: current,
    programRef: PENDING_REF,
    variant: input.variant,
    call: {
      provider: generator.provider,
      model: generator.model,
      usage: { inputTokens: null, outputTokens: null },
      latencyMs: 0,
    },
    route: generator.route,
    promptVersion: generator.prompt_version,
    resampledLevels: [],
    construction: input.construction,
    groups: input.groups,
    quality: input.quality,
    scoreRules: input.scoreRules,
    roomGroups: input.roomGroups,
    ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
    buildingType: input.digest.building_type,
  });
  if (final.check.blocking.length) {
    return {
      ok: null,
      rejections: [{ level: 0, messages: final.check.blocking.map((issue) => issue.message) }],
      hints: hintsFor(
        final.check.blocking.filter((issue) => isRevisable(issue.code)),
        prompts,
      ),
      renamed,
    };
  }
  return {
    ok: {
      program: current,
      levels: arranged,
      intent: renamed,
      score: scoreSummary(final.score, input.quality.acceptPercent, prompts),
    },
    rejections: [],
    hints: [],
    renamed,
  };
}

/**
 * Lỗi đặt cửa ra ngoài ở tầng 1 mà chương trình thử gỡ bằng cách đổi phòng mang cửa chính TRƯỚC khi gọi
 * lại mô hình. Lượt đo 58688ead (16/09/2026): ba lượt sửa liền (0,34 USD) cùng một lỗi «cửa gara chỉ đặt
 * được trên cạnh giáp hàng xóm», mô hình gửi lại bản phác y hệt; lượt thứ tư qua chỉ vì nó đổi
 * `entry_room` từ sảnh sang phòng khách. Việc ấy chương trình tự thử được, không tốn một lượt gọi nào.
 */
const ENTRY_SIDE_CODES: ReadonlySet<string> = new Set([
  'door_outside_on_boundary',
  'door_no_outside_edge',
  'entrance_wrong_side',
  'vehicle_door_wrong_side',
  'arrange_entrance_side',
]);

/** Tối đa bấy nhiêu phòng thay thế — mỗi lần thử là một lượt xếp trọn tầng. */
const ENTRY_ALTERNATIVES_MAX = 3;

/**
 * Phòng thay thế mang cửa chính: phòng đi xuyên được (sinh hoạt chung, giao thông; không thang, không
 * gara), ưu tiên phòng mô hình khai liền với lối vào cũ, rồi chỗ sinh hoạt chung, rồi hành lang.
 */
export function entryAlternatives(
  intent: AiPlanIntent,
  program: AiSpaceProgram,
  passage: PlanContextInput['groups']['passage'],
): string[] {
  if (!passage) return [];
  const current = intent.entry_room;
  const typeOf = new Map(program.spaces.map((space) => [space.id, space.type]));
  const here = new Set(
    program.spaces
      .filter((space) => space.level === 1 && !space.ensuite_of)
      .map((space) => space.id),
  );
  const linked = new Set(
    intent.relationships
      .filter((rel) => (rel.kind === 'adjacent' || rel.kind === 'open') && current)
      .flatMap((rel) => (rel.a === current ? [rel.b] : rel.b === current ? [rel.a] : [])),
  );
  const rank = (id: string): number => {
    const type = typeOf.get(id) ?? '';
    return (
      (linked.has(id) ? 0 : 10) +
      (passage.everydayFrom.has(type) ? 0 : type === 'circulation' ? 1 : 2) +
      (passage.entryThrough.has(type) ? 1 : 0)
    );
  };
  return [...here]
    .filter((id) => id !== current && id !== intent.garage_room)
    .filter((id) => {
      const type = typeOf.get(id) ?? '';
      return (
        (passage.through.has(type) || passage.entryThrough.has(type)) &&
        type !== 'stair' &&
        type !== 'core' &&
        type !== 'garage'
      );
    })
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, ENTRY_ALTERNATIVES_MAX);
}

/** Tiện ích đã gộp trỏ về phòng mẹ thì mẹ xuất hiện hai lần — giữ dòng đầu. */
function dedupeRooms(intent: HouseIntent): HouseIntent {
  const seen = new Set<string>();
  return {
    ...intent,
    rooms: intent.rooms.filter((room) => (seen.has(room.id) ? false : (seen.add(room.id), true))),
    relationships: intent.relationships.filter((rel) => rel.a !== rel.b),
  };
}

export type AiPlanInput = PlanContextInput &
  HouseScoring & {
    briefRef: string;
    route: string;
    client: TextModelClient;
    prompts: AiPrompts;
  };

export interface AiPlanResult extends PlanFinal {
  buildable: BuildableBox;
  /** Danh mục phòng dựng từ ý định — mặt bằng trỏ `program_ref` vào bản này. */
  program: AiSpaceProgram;
  calls: PlanCallRecord[];
  repaired: boolean;
  resampledLevels: number[];
}

/**
 * Lượt tiếp theo gọi thế nào — MỘT chỗ quyết, cho cả tuyến đồng bộ lẫn Workflow. Ba ngả, theo tài liệu
 * bàn giao mục 08:
 *  · câu trả lời sai hợp đồng → `resample`: khai lại, không kèm câu trả lời hỏng;
 *  · có lỗi NGỮ NGHĨA → `revise`: gửi ý định cũ kèm đúng các lỗi ấy (lỗi hình học đi cùng không gửi —
 *    mô hình không làm gì được với chúng);
 *  · chỉ còn lỗi HÌNH HỌC → `none`: bộ dựng hình đã thử hết cách, dừng, không tốn thêm lượt gọi.
 */
export function retryPlan(
  attempt: Pick<HouseAttempt, 'intent' | 'issues'>,
  evaluation: Pick<HouseEvaluation, 'hints' | 'renamed'> | null,
):
  | { kind: 'resample'; avoid: string[]; previous: null }
  | { kind: 'revise'; avoid: string[]; previous: HouseIntent }
  | { kind: 'none'; avoid: []; previous: null } {
  if (!attempt.intent || !evaluation) {
    return { kind: 'resample', avoid: schemaHints(attempt.issues), previous: null };
  }
  if (!evaluation.hints.length) return { kind: 'none', avoid: [], previous: null };
  return {
    kind: 'revise',
    avoid: evaluation.hints,
    previous: evaluation.renamed ?? attempt.intent,
  };
}

/** Ghép lý do lượt cuối với lượt đầu để màn hình so được — theo tầng. */
export function finalRejections(
  last: readonly LevelRejection[],
  first: readonly LevelRejection[],
  retry: RetryKind,
  attempts: number,
): LevelRejection[] {
  return last.map((rejection) => {
    const earlier = first.filter((item) => item.level === rejection.level);
    return {
      ...rejection,
      retry,
      attempts,
      ...(attempts > 1 && earlier.length && earlier !== last
        ? { firstMessages: earlier.flatMap((item) => item.messages) }
        : {}),
    };
  });
}

/**
 * Một phương án từ đầu đến cuối, theo đúng thứ tự của Workflow — cho tuyến đồng bộ và kiểm thử.
 *
 * Ném `AiPlanRejected` khi sau lượt sửa thứ ba vẫn không xếp được: không có artifact nào được đúc từ một
 * mặt bằng hỏng.
 */
export async function generateAiPlan(input: AiPlanInput): Promise<AiPlanResult> {
  const context = planContext(input);
  const calls: PlanCallRecord[] = [];
  const failedLevels = new Set<number>();
  let first: LevelRejection[] | null = null;
  let next: Exclude<ReturnType<typeof retryPlan>, { kind: 'none' }> | null = null;

  for (let round = 0; ; round += 1) {
    const attempt = await callHouseModel({
      client: input.client,
      route: input.route,
      prompts: input.prompts,
      context,
      ...(next ? { avoid: next.avoid, previous: next.previous } : {}),
    });
    calls.push(attempt.call);
    const generator = programGenerator(attempt.call, input.route, input.prompts.version, round > 0);
    const evaluation = attempt.intent
      ? evaluateHouse(input, context, attempt.intent, generator, input.prompts)
      : null;

    if (evaluation?.ok) {
      const final = finalisePlan({
        levels: evaluation.ok.levels,
        context,
        program: evaluation.ok.program,
        programRef: PENDING_REF,
        variant: input.variant,
        call: attempt.call,
        route: input.route,
        promptVersion: input.prompts.version,
        resampledLevels: [...failedLevels],
        construction: input.construction,
        groups: input.groups,
        quality: input.quality,
        scoreRules: input.scoreRules,
        roomGroups: input.roomGroups,
        buildingType: input.digest.building_type,
      });
      return {
        ...final,
        program: { ...evaluation.ok.program, brief_ref: input.briefRef },
        buildable: context.buildable,
        calls,
        repaired: round > 0,
        resampledLevels: [...failedLevels].sort((a, b) => a - b),
      };
    }

    const rejections = evaluation
      ? evaluation.rejections
      : [{ level: 0, messages: attempt.issues }];
    for (const rejection of rejections) if (rejection.level > 0) failedLevels.add(rejection.level);
    first ??= rejections;
    const plan = retryPlan(attempt, evaluation);
    if (round >= HOUSE_REVISIONS_MAX || plan.kind === 'none') {
      throw new AiPlanRejected(finalRejections(rejections, first, plan.kind, round + 1));
    }
    next = plan;
  }
}

/** Nguồn sinh của danh mục phòng dựng từ ý định — cùng nhà cung cấp, cùng lời dẫn với lượt gọi. */
export function programGenerator(
  call: PlanCallRecord,
  route: string,
  promptVersion: string,
  repaired: boolean,
): AiSpaceProgram['generator'] {
  return {
    kind: 'ai',
    provider: call.provider,
    model: call.model,
    route,
    prompt_version: promptVersion,
    repaired,
  };
}

function describeZod(error: ZodError, value?: unknown): string[] {
  return error.issues.slice(0, 10).map((issue) => {
    const where = issue.path.join('.') || 'gốc';
    // «Invalid» của Zod không nói được giá trị nào sai — đọc thẳng giá trị ở đường dẫn ấy.
    const actual = issue.path.reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      value,
    );
    if (issue.code === 'invalid_string' && typeof actual === 'string') {
      return `Sai cấu trúc ở ${where}: mã «${actual}» chỉ được dùng chữ thường a–z, số và dấu _.`;
    }
    return `Sai cấu trúc ở ${where}: ${issue.message}`;
  });
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
