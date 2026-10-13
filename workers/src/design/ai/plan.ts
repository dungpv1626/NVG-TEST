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

import { altarBackSide, BEARINGS } from './altar-facing';
import { lightWellAdvice, profileMinSide } from './house-profile-norms';
import {
  gridParamsInMm,
  LAYOUT_CELL_MM,
  layoutToIntent,
  layoutView,
  mergeLayoutDelta,
  normaliseLayoutIds,
} from './layout';
import {
  aiHouseIntentSchema,
  aiHouseBandsDeltaSchema,
  aiHouseBandsSchema,
  aiHouseLayoutDeltaSchema,
  aiHouseLayoutSchema,
  type AiHouseLayout,
  type AiBriefDigest,
  type AiFloorPlan,
  type AiPlanIntent,
  type AiPlanRooms,
  type AiPlanRoomsLevel,
  type AiPlanTree,
  type AiSpaceProgram,
  type AiSpaceProgramProposal,
} from '@nvg/shared/design';
import type { ZodError } from 'zod';
import houseIntentSchemaJson from '../../../../contracts/ai-house-intent.schema.json';
import houseLayoutSchemaJson from '../../../../contracts/ai-house-layout.schema.json';
import houseLayoutDeltaSchemaJson from '../../../../contracts/ai-house-layout-delta.schema.json';
import houseBandsSchemaJson from '../../../../contracts/ai-house-bands-compact.schema.json';
import houseBandsDeltaSchemaJson from '../../../../contracts/ai-house-bands-delta-compact.schema.json';
import { STAIR_TOKEN, bandStairId, bandsToLayout, mergeBandsDelta } from './bands/layout';
import { rebuildStorey } from './bands/rebuild';
import { bandAccessIssues } from './bands/access';
import { compactBands, expandCompact } from './bands/compact';
import { LIGHT_WELL_TOKEN, pinLightWell } from './bands/light-well';
import { OPEN_CELL } from './bands/solve';
import {
  houseProfile,
  houseProfileLabel,
  type AiHouseBands,
  type HouseProfile,
} from '@nvg/shared/design';
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
  BAND_REVISABLE_CODES,
  isRevisable,
  ZONES,
  type ArrangeResult,
  type ArrangeSummary,
  type LevelIntent,
} from './arrange';
import { stairEntrySide, type StairSide } from './arrange/doors';
import { SPLIT_MIN_CM } from './arrange/grid';
import { equalizeByType, hallVariants, retargetIntent } from './plan-variants';
import { absorbStranded, type StrandedNote } from './stranded';
import { absorbUnknown, partitionRows, splitMerged } from './arrange/sketch';
import {
  buildableFromDigest,
  lotRectFromDigest,
  setbacksFromDigest,
  type BuildableBox,
} from './buildable';
import { briefDemands, sideWord, type BriefDemands, type ElevatorDemand } from './brief-demands';
import { placeEntrySteps } from './entry-steps';
import {
  bandMinDepth,
  feasibilityIssue,
  loadsIssue,
  loadsKnowledge,
  storeyLoads,
  type StoreyLoad,
} from './feasibility';
import {
  mandatoryFor,
  offAxisNotes,
  serviceAnchors,
  type MandatoryRules,
  type MandatorySetup,
  wetRects,
} from './mandatory';
import {
  balconyMovedByRepartition,
  checkSketchBalconyDemand,
  labelReservedShaft,
  sketchBalconyCornerAdvice,
  truthfulBalconyIssues,
} from './plan-demands';
import type { Rect } from './draw/geometry';
import type { DrawNote } from './draw/notes';
import {
  briefMinimums,
  foldStairCore,
  levelIntentsOf,
  proposalFromHouse,
  renameHouse,
  type HouseCantilever,
  type HouseIntent,
} from './house';
import { outlineFaces } from './outline-faces';
import { checkPlan, restateRoomFacts, type PlanCheckResult, type PlanIssue } from './plan-check';
import { levelFromRooms, mergedZoning, withMergedParts } from './plan-geometry';
import { criterionFor, type PlanQuality } from './plan-quality';
import { groupsBelowFloor, scoreForArtifact, scorePlan, type PlanScore } from './plan-score';
import {
  checkProposal,
  liftToBriefFloors,
  foldInBedroom,
  programFromProposal,
  askedTypes,
  programKnowledge,
  PROGRAM_PREDICATES,
  type ProgramKnowledge,
} from './program';
import { layoutPrompts, type AiPrompts } from './prompts';
import { requiredRoofZones, type RoofPlanSpec } from '../kb/roof-plan';
import type { FurnitureSpec, HouseProgramSpec } from '../kb/house-program';
import { houseProgram, typeOfId, type ProgramRow } from './house-program';
import {
  compactBrief,
  layoutKnowledge,
  priorityLabels,
  selectRules,
  type RuleFacts,
} from './layout-prompt';
import { injectableRules, type InjectedRule } from './rule-packs';
import { MEASURABLE_ON_PLAN } from './rule-warnings';
import { clampText, normaliseHouseIds } from './tree/ids';
import { OUTSIDE } from './tree/openings';
import { corridorMinCells, minSketchCells, minSketchSideCells } from './sketch-cells';
import { stairMinCm, stairParamsOf, stairRunNeedCm, stairTreads } from './tree/stair-fit';
import { stairArrival, underStairCm, type StairParams } from './stair-geometry';
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
/**
 * Số lượt SỬA tối đa sau lượt đầu. 3 → 5 (Haan, 25/09/2026): ba lượt thật cùng ngày đều dừng vì hết lượt
 * khi lỗi đang giảm. Mỗi lượt sửa đo được ~0,05 USD trên GPT-6 Sol (vào ~7.100 token, ra ~3.700–4.800
 * trong đó ~2.000 là nghĩ); tiền đi phần lớn vào token RA, nên lượt sửa chỉ trả về tầng có lỗi.
 */
// 5 → 4 (Haan 30/09/2026, T109: «để số lần gọi tối đa là 5»): lượt đầu + bốn lượt sửa.
export const HOUSE_REVISIONS_MAX = 4;

/** Gửi lại bản tốt nhất bấy nhiêu lần liền mà không tiến thì đổi gốc sang bản mới nhất (`revisionBase`). */
export const STALLED_AFTER = 2;

/**
 * Bấy nhiêu lượt LIỀN NHAU hỏng đúng cùng một tập lỗi thì thôi gọi mô hình (`stuckRepeating`). Đo trên 37 lượt
 * thật 23–30/09/2026 (bản demo): 2 trong 5 lượt ra mặt bằng từng lặp nguyên văn HAI lượt rồi mới qua — dừng ở
 * 2 là giết chúng; lặp BA lượt liền thì chưa lượt nào qua được (14 lần, đều hỏng hết lượt sửa).
 */
export const STUCK_AFTER = 3;

/** Số vòng sửa tối đa theo đường: v6 3 vòng (handoff B5 — bộ giải đã gánh phần hình học), còn lại 4. */
export function houseRevisionsMax(pipeline?: 'v6' | null): number {
  return pipeline === 'v6' ? 3 : HOUSE_REVISIONS_MAX;
}

/** Dừng sớm khi cùng bộ lỗi lặp lại ngần ấy vòng liền: v6 2 vòng (handoff B5), còn lại `STUCK_AFTER`. */
export function stuckAfter(pipeline?: 'v6' | null): number {
  return pipeline === 'v6' ? 2 : STUCK_AFTER;
}

/** Lỗi tầng trên chỉ do bị ÉP theo ô lõi tầng dưới — xem `fail` trong `evaluateHouse`. */
const CORE_FORCED_CODES: ReadonlySet<string> = new Set([
  'sketch_core_overlap',
  'arrange_anchor_conflict',
]);

/** Lỗi vị trí ban công theo mặt — có thể chỉ là hệ quả khi chương trình chia lại một tầng. */
const BALCONY_PLACEMENT_CODES: ReadonlySet<string> = new Set([
  'balcony_side_missing',
  'balcony_side_not_wanted',
  'balcony_level_missing',
]);

/** Mã băm giữ chỗ khi kiểm liên tầng TRƯỚC lúc danh mục phòng thành artifact — không đi vào artifact. */
const PENDING_REF = `sha256:${'0'.repeat(64)}`;

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
export type RetryKind = 'revise' | 'resample' | 'none' | 'unchanged' | 'stuck';

/** Một tầng không xếp được, kèm câu tiếng Việt cho màn hình. */
/** Mã của lời bác ở cổng danh mục phòng (T41) — trước khi xếp tầng nào (`setbackRank`). */
export const PROGRAM_STAGE_CODE = 'program_brief';
/**
 * Mã của lời bác khi câu trả lời KHÔNG DÙNG ĐƯỢC — sai hợp đồng, hay bộ giải dải không dựng nổi (chưa có ý định để
 * kiểm). Tệ hơn mọi lượt đã có ý định (`setbackRank`). Lượt thật 822e699d: lỗi bộ giải mang tầng `0` không mã bị coi là
 * «mọi tầng đã xếp» — lời gọi 2 (vừa khối, chỉ thiếu WC chung tầng 2) bị gạt, mô hình sửa lại từ lời gọi 1, mất hai vòng.
 */
export const ANSWER_STAGE_CODE = 'answer_unusable';

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
  /** Mã lỗi song song với `messages` — để so bậc tệ giữa các lượt (`setbackRank`), không hiện lên. */
  codes?: string[];
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
  /** Thu hẹp hành lang quá rộng khi xếp (T104) — `evaluateHouseBest` tự bật cho biến thể của nó. */
  trimCorridors?: boolean;
  /** Nới phòng hẹp hơn mức nghề khi xếp (T113) — `evaluateHouseBest` tự bật cho biến thể của nó. */
  widenRooms?: boolean;
  /** Tách WC khép kín dài thành WC + tủ đồ khi xếp (T160) — `evaluateHouseBest` tự bật cho biến thể của nó. */
  splitClosets?: boolean;
  /** Lấy ứng viên xếp hạng thứ `rankSkip` (0 = tốt nhất) — chỉ cho bước quay lui tầng 1 của `evaluateHouse` (T113). */
  rankSkip?: number;
  /** Tầng 1: cạnh ô thang xếp cuối khi chọn lối vào — bước quay lui của `evaluateHouse` (T161). */
  stairEntryAvoid?: StairSide;
  /**
   * Cỡ ô bản phác, m. Vắng = `sketchGridOf` (ô ~1 m cho mô hình đếm). Lược đồ hình chữ nhật (bàn giao v5,
   * cách A) đổi rect của mô hình ra lưới mịn hơn để không làm tròn mất WC 1,5 m hay hành lang 1,3 m.
   */
  sketchCellM?: number;
  /** `rect` = mô hình khai hình chữ nhật mm (`ai-house-layout`, bàn giao v5 cách A); vắng = bản phác lưới. */
  geometry?: 'rect';
  /**
   * `v6` = mô hình xếp DẢI, bộ giải tính kích thước (`contracts/ai-house-bands`, T116). Cần `geometry: 'rect'` (dùng
   * chung danh mục, bố cục và mái của v5). Vắng = v5 / lưới.
   */
  pipeline?: 'v6';
  /** Đường v6: cây chia ô bộ giải dải dựng, theo tầng (`evaluateHouse` gắn từ ý định) — `arrangeFor` đọc. */
  bandTrees?: ReadonlyMap<number, AiPlanTree>;
  /** Danh mục mái (`kb/roof_plan.yaml`, Haan chốt luôn vẽ mái). Vắng = phương án không có tờ mái. */
  roofPlan?: RoofPlanSpec;
  /** Chế độ hình chữ nhật: danh mục phòng (`kb/house_program.yaml`) và đồ đạc (`kb/furniture.yaml`). */
  houseProgram?: HouseProgramSpec;
  furniture?: FurnitureSpec;
  /** Ban công đua của ý định đang xếp (`evaluateHouse` gắn) — bộ dựng ô thêm ô ban công ngoài khối. */
  cantilevers?: readonly HouseCantilever[];
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
  /**
   * Luật bố trí BẮT BUỘC của Haan (T71, `rules/nvg-mandatory.yaml`). Vắng = không kiểm — phép thử
   * dựng ngữ cảnh tay; mọi tuyến chạy thật đều truyền.
   */
  mandatory?: MandatoryRules | null;
  /** Dòng gỡ lỗi của bộ giải — chỉ phép thử dùng. */
  trace?: (line: string) => void;
}

/** Mọi thứ tất định suy được TRƯỚC lượt gọi đầu tiên — dùng chung cho mọi lượt. */
/** Đường v6: những gì bộ giải dải cần ngoài danh mục — theo loại nhà (T116). */
export interface BandsContext {
  profile: HouseProfile;
  kd: boolean;
  /** Loại phòng đi xuyên được — `passage.through`, thêm gara khi loại nhà cho gara là lối đi (ỐNG / PHỐ / KD). */
  through: ReadonlySet<string>;
  /** Vách tối thiểu để đặt cửa, cm (cửa + 2 × lề, số đo đã theo loại nhà). */
  doorWallCm: number;
  /** Vách chung tối thiểu giữa hai ô hành lang (ô thông), cm — `circulation.corridor_pass_clear_m`; vắng = `doorWallCm`. */
  corridorPassCm?: number;
  /** Ô thang tối thiểu, cm — bề ngang × chiều dài theo chiều sâu nhà. */
  stair: { width: number; length: number } | null;
  minSideCm: (type: string) => number;
  usualM2: (type: string) => number;
  /** Diện tích tối thiểu của nghề (`space_norms` `min`), m² — chiều sâu cần khi đầu bài không khai. */
  normMinM2: (type: string) => number;
  /** Loại phòng không đẩy chiều sâu dải theo diện tích: nhóm giao thông + giếng trời. */
  areaFree: ReadonlySet<string>;
  /** Bề dày tường, cm (`construction.walls`). */
  walls: { exterior: number; partition: number };
  /** Hành lang thông thuỷ tối thiểu theo loại nhà, cm — bộ giải thu hẹp hành lang rộng hơn khi ô cùng dải thiếu chỗ. */
  corridorClearCm?: number;
  /** Loại phòng không cần cửa (`groups.noDoorRequired`). */
  /** Loại thang của lượt (T105) — lối vào thang từng tầng theo đúng loại (`placeStairEntry`). */
  stairParams: StairParams | null;
  /** Loại để trời (sân, sân thượng, giếng trời) — kiểm giếng trời thông lên trời (`lightWellIssues`). */
  openTypes: ReadonlySet<string>;
  /** Gầm thang dùng được ở đầu cao (cm, thang thẳng) — WC gầm thang tầng 1 (T116); 0 = không cho. */
  underStairCm: number;
  noDoor: ReadonlySet<string>;
  /** Vách bàn thờ dựa lưng theo hướng gia chủ chọn (T106) — `altarBackSide(digest)`. */
  altarBackSide: 'x0' | 'x1' | 'y0' | 'y1' | null;
  /** `passage.stair_opens_to` / `passage.served_from` — luật mở cửa cho bộ chọn cửa. */
  stairOpensTo: ReadonlySet<string> | null;
  servedFrom: ReadonlyMap<string, ReadonlySet<string>> | null;
}

export interface PlanContext {
  buildable: BuildableBox;
  /** Cặp loại phòng được gộp SAU khi lọc theo câu khách – ăn – bếp của đầu bài (T103); vắng = của kb. */
  mergeAllowed?: ReadonlySet<string>;
  /** Hình bao xây được đổi sang cm — đơn vị của hợp đồng mặt bằng. */
  buildableCm: Rect;
  northDeg: number;
  /** Mặt thửa lấy được sáng — suy từ khảo sát, không hỏi mô hình (`outline-faces.ts`). */
  openFaces: readonly Face[];
  accessFaces: readonly Face[];
  /** Mặt lối vào chính và lối xe đầu bài khai. */
  entrances: { main: Face | null; vehicle: Face | null };
  /**
   * Ô thửa chưa trừ khoảng lùi, cm — phần đất bậc tam cấp được chìa ra (T70). Tuỳ chọn vì phép thử
   * dựng ngữ cảnh tay; vắng thì không kiểm ranh thửa.
   */
  lotCm?: Rect;
  /** Luật bắt buộc kèm tầm «thẳng trục» (E2) và cách chia không gian mở — `null` khi không kiểm. */
  mandatory: MandatorySetup | null;
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
  modelKnowledge: HouseModelKnowledge | LayoutModelKnowledge;
  /** `rect` = lượt khai hình chữ nhật (`ai-house-layout`); `cells` = bản phác lưới (T48). */
  geometry: 'cells' | 'rect';
  /** Khối xây được, mm, đo từ góc LÔ (gốc toạ độ của rect mô hình khai). */
  blockMm: { x: number; y: number; widthMm: number; depthMm: number };
  /** Chế độ hình chữ nhật: danh mục, mặt được đua, sự kiện lọc luật. `null` ở bản phác lưới. */
  layout: LayoutContext | null;
  /** Bề dày tường trừ ở mỗi chiều khi đổi rect ra diện tích lọt lòng (như `minSketchCells`), m. */
  layoutWallM: number;
  /** Mái: danh mục, số tầng mái (tầng trên cùng + 1) và mã khu đầu bài đòi. Vắng = không dựng mái. */
  roof: { spec: RoofPlanSpec; level: number; required: string[] } | null;
  /** Cờ bật / tắt các câu `[[cờ|…]]` của lời dẫn hệ thống (T112) — `houseSystem`. */
  promptFlags: HousePromptFlags;
  /** Đường v6 (T116): loại nhà và thông số cho bộ giải dải. `null` ở v5 / lưới. */
  bands: BandsContext | null;
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
  /** Số ô tối thiểu của từng phòng đầu bài khai diện tích (T73) — `briefMinCells`. */
  min_cells: BriefMinCells[];
  /** Bề ngang tối thiểu của hành lang trên bản phác, ô (T73) — `corridorMinCells`. */
  corridor_min_cells: number;
  /** Định mức diện tích nghề theo loại phòng — vắng thì lời dẫn không có bảng ấy (T48). */
  area_norms?: ReadonlyMap<string, { min: number; target: number; max: number }>;
  zones: readonly string[];
  open_faces: readonly Face[];
  faces: Readonly<Record<Face, readonly FaceTag[]>>;
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
    /**
     * Loại thang của lượt (T105) và ô thang nhỏ nhất theo tài liệu thang bộ, m (lọt lòng, cạnh ngắn × cạnh dài) —
     * vắng khi lượt không mang loại thang.
     */
    shape?: {
      vi: string;
      short_m: number;
      long_m: number;
      cells: [number, number];
      /** Chỗ người lên / xuống ô thang ở các tầng (T161) — `STAIR_ARRIVAL_SENT` theo `stairArrival`. */
      arrival: StairArrivalSent;
    };
  };
}

/**
 * Chỗ người bước lên / ra khỏi ô thang, gửi cho mô hình NGAY lượt đầu (T161, Haan 14/10/2026). Trước đó mô hình chỉ
 * biết loại thang và cỡ ô, nên vẽ phòng ngủ chắn đầu bước ra (phương án d084a46e tầng 2) — tới khi cổng T157 bác mới
 * biết, mất một vòng sửa. Thang U / ba vế: lên và ra cùng một đầu ngắn ở mọi tầng; thẳng: tầng trên cần cả hai đầu
 * (bước ra ở đầu kia, vế kế tiếp lại lên từ đầu cũ); chữ L: đầu ngắn và một cạnh dài.
 */
const STAIR_ARRIVAL_SENT = {
  start: 'one_short_end',
  end: 'both_short_ends',
  across: 'short_end_and_long_side',
} as const;
type StairArrivalSent = (typeof STAIR_ARRIVAL_SENT)[keyof typeof STAIR_ARRIVAL_SENT];

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
  /**
   * Phòng đầu bài khai diện tích tối thiểu → số ô bản phác ít nhất phải vẽ (T73). Rỗng khi đầu bài
   * không khai diện tích nào (vẫn gửi: lời dẫn nhắc tới khoá này). Gửi SỐ Ô chứ không để mô hình tự quy đổi: lượt đo 011b4adc khai mục
   * tiêu 45 m² mà vẽ 28 ô.
   */
  min_cells: BriefMinCells[];
  /**
   * Hành lang vẽ ít nhất bấy nhiêu ô bề ngang (T73). Lượt đo 0c86c0b1: hành lang một ô, bộ xếp nới
   * lên đủ bề rộng lọt lòng và lấy phần thiếu từ phòng bên cạnh.
   */
  corridor_min_cells: number;
  open_faces: readonly Face[];
  /** Nhãn từng mặt khối nhà (T112): `open`, `blind`, `harsh_sun`, `cool_wind` — `faceTags`. */
  faces: Readonly<Record<Face, readonly FaceTag[]>>;
  /** Kích thước lọt lòng nhỏ nhất của ô thang hai vế, m. Vắng ở nhà một tầng. */
  /**
   * `cells`: số ô bản phác ô thang phải chiếm, [cạnh ngắn, cạnh dài], mỗi cạnh cộng bề dày tường rồi làm tròn lên — như
   * giếng thang máy (T106, lượt 2c522a90: thang U chiếu nghỉ rộng cần 3 ô ngang, mô hình vẽ cột tầng 2 rộng 2 ô).
   */
  stair_min_m?: {
    width: number;
    length: number;
    shape?: string;
    cells?: [number, number];
    arrival?: StairArrivalSent;
  };
  garage_min_m2?: number;
  ensuite: { child: string[]; parent: string[] };
  walk_through: string[];
  entry_through: string[];
  served_from: Record<string, string[]>;
  open_pairs: string[][];
  /** Loại chỉ được khai khi đầu bài hỏi tới (T96). */
  only_when_asked: string[];
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

/** Một dòng `min_cells`: loại phòng, tầng (null = tầng nào cũng được), mức đầu bài, số ô tối thiểu. */
export interface BriefMinCells {
  type: string;
  floor: number | null;
  min_m2: number;
  cells: number;
  /**
   * Số ô tối thiểu MỖI CẠNH: giếng thang máy theo đúng hình giếng; phòng có sàn đầu bài theo cùng giả định tỉ lệ
   * của `cells` (T107 — `cells` ô xếp thành dải mỏng thì tường ăn hết phần dư).
   */
  min_side_cells?: number;
}

/**
 * Số ô tối thiểu cho mỗi phòng đầu bài khai diện tích, và cho chỗ để xe (T73). Bề dày tường lấy tường
 * ngoài (dày nhất) để số gửi đi không thiếu; phép kiểm bản phác phía chương trình dùng tường ngăn, nên
 * bản phác vẽ đủ số này thì chắc chắn qua phép kiểm ấy.
 */
export function briefMinCells(
  spaces: readonly { type: string; floor: number | null; area_m2: number | null }[],
  garageMinM2: number | null,
  grid: SketchGridSize,
  construction: ConstructionNorms,
  lift: Pick<ElevatorDemand, 'type' | 'shaftWidthM' | 'shaftDepthM'> | null = null,
): BriefMinCells[] {
  const wall = construction.walls.exterior_m;
  const rows: BriefMinCells[] = spaces.flatMap((space) =>
    space.area_m2 && space.area_m2 > 0
      ? [
          {
            type: space.type,
            floor: space.floor,
            min_m2: space.area_m2,
            cells: minSketchCells(space.area_m2, grid.cell_m, wall),
            min_side_cells: minSketchSideCells(space.area_m2, grid.cell_m, wall),
          },
        ]
      : [],
  );
  if (garageMinM2 && garageMinM2 > 0) {
    rows.push({
      type: 'garage',
      floor: null,
      min_m2: garageMinM2,
      cells: minSketchCells(garageMinM2, grid.cell_m, wall),
      min_side_cells: minSketchSideCells(garageMinM2, grid.cell_m, wall),
    });
  }
  // Giếng thang máy: số ô theo ĐÚNG HÌNH giếng gia chủ khai, mỗi cạnh cộng một bề dày tường rồi làm tròn
  // lên ô — lượt thật 913bc2ad vẽ giếng 1,3 × 1,4 m thành dải 1 × 4 ô; căn vách phải nới nó ra 1,3 m
  // và phòng ngủ bên cạnh hụt mức đầu bài, bản phác tầng 1 bị bỏ.
  if (lift && lift.shaftWidthM !== null && lift.shaftDepthM !== null) {
    const across = Math.ceil((lift.shaftWidthM + wall) / grid.cell_m - 1e-9);
    const deep = Math.ceil((lift.shaftDepthM + wall) / grid.cell_m - 1e-9);
    rows.push({
      type: lift.type,
      floor: null,
      min_m2: Math.round(lift.shaftWidthM * lift.shaftDepthM * 100) / 100,
      cells: across * deep,
      min_side_cells: Math.min(across, deep),
    });
  }
  return rows;
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

/**
 * Tri thức gửi đi ở chế độ hình chữ nhật (`prompt-mat-bang-v5.md` mục 4) — JSON do `layoutKnowledge` dựng, khoá
 * theo thứ tự cố định để bộ nhớ đệm của nhà cung cấp đọc lại.
 */
export type LayoutModelKnowledge = Record<string, unknown>;

/** Phần ngữ cảnh riêng của chế độ hình chữ nhật. */
export interface LayoutContext {
  /** Danh mục chương trình cấp (`ai/house-program.ts`). */
  program: ProgramRow[];
  spec: HouseProgramSpec;
  /** Mặt được đua và độ đua tối đa, cm. */
  cantileverFaces: Partial<Record<Face, number>>;
  /** Sự kiện để lọc catalog luật (`selectRules`). */
  ruleFacts: RuleFacts;
  /** Ô thang tối thiểu theo tim tường, mm `[ngang, dài]` — cùng số lời dẫn gửi (`knowledge.stair.rect_min_mm`). */
  stairRectMm: [number, number] | null;
  /** Đường dải: tải từng tầng theo mức tối thiểu (`storeyLoads`) — dòng gửi mô hình và cổng chặn dùng chung. */
  loads?: StoreyLoad[];
}

function layoutContextOf(
  input: PlanContextInput,
  knowledge: HouseKnowledge,
  demands: BriefDemands,
  openFaces: readonly Face[],
  buildableCm: Rect,
  roof: PlanContext['roof'],
): { layout: LayoutContext; modelKnowledge: LayoutModelKnowledge } {
  if (!input.houseProgram || !input.furniture) {
    throw new Error(
      'Chế độ hình chữ nhật cần `kb/house_program.yaml` và `kb/furniture.yaml` (PlanContextInput.houseProgram, .furniture).',
    );
  }
  const spec = input.houseProgram;
  const program = houseProgram({
    digest: input.digest,
    knowledge,
    labels: input.labels,
    spec,
    roof: roof ? { spec: roof.spec, required: roof.required } : null,
  });
  const cellMm = Math.round(knowledge.sketch_grid.cell_m * 1000);
  const stair = knowledge.stair_geometry;
  const rectMin: [number, number] | null =
    knowledge.floors > 1
      ? stair.shape
        ? [stair.shape.cells[0] * cellMm, stair.shape.cells[1] * cellMm]
        : [
            Math.ceil((stair.two_flights_min_width_m + input.construction.walls.exterior_m) * 10) *
              100,
            Math.ceil(
              ((stair.two_flights_length_m ?? stair.one_flight_length_m ?? 0) +
                input.construction.walls.exterior_m) *
                10,
            ) * 100,
          ]
      : null;
  const balcony = demands.balcony && !demands.balcony.forbidden ? demands.balcony : null;
  const cantileverFaces: Partial<Record<Face, number>> = {};
  if (balcony?.projection) {
    for (const side of [...balcony.sides, ...balcony.optionalSides]) {
      const m = balcony.projection[side];
      if (m && m > 0) cantileverFaces[side] = Math.round(m * 100);
    }
  }
  const openPairs = pairsOnOneStorey(knowledge);
  const doorM =
    (input.construction.openings.door?.width_m ?? 0.9) +
    2 * input.construction.openingRules.door_margin_m +
    input.construction.walls.partition_m;
  const site = input.digest.site;
  const lotM2 = (site.width_m ?? 0) * (site.depth_m ?? 0);
  const modelKnowledge = layoutKnowledge({
    digest: input.digest,
    program,
    spec,
    furniture: input.furniture,
    envelopeMm: [
      buildableCm.x0 * 10,
      buildableCm.y0 * 10,
      buildableCm.x1 * 10,
      buildableCm.y1 * 10,
    ],
    maxFootprintM2:
      typeof site.max_density === 'number' && lotM2 > 0 ? site.max_density * lotM2 : null,
    faces: faceTags(input.digest, openFaces),
    entries: {
      main: site.main_entrance_side ?? null,
      car: site.vehicle_entrance_side ?? null,
    },
    stair: rectMin
      ? { type: stair.shape?.vi ?? null, risers: stair.risers, rectMinMm: rectMin }
      : null,
    balcony: balcony
      ? {
          cantilever: Object.fromEntries(
            Object.entries(cantileverFaces).map(([face, cm]) => [face, cm * 10]),
          ),
          required: [...balcony.sides],
          optional: [...balcony.optionalSides],
        }
      : null,
    garageMinM2: knowledge.garage_min_m2,
    openPairs,
    minSideM: (type) =>
      usableMinSide(input.construction, type, { cars: input.digest.parking?.cars ?? 0 }),
    corridorMinMm: knowledge.corridor_min_cells * cellMm,
    doorWallMm: Math.ceil((doorM * 1000) / cellMm - 1e-9) * cellMm,
    circulationShare: knowledge.circulation_share,
    stairAreaM2: rectMin ? (rectMin[0] * rectMin[1]) / 1e6 : 0,
    storeys: knowledge.floors,
    usualM2: (type) => input.areaNorms?.get(type)?.target ?? null,
    priorities: priorityLabels(input.digest),
    strategy: knowledge.strategy.trim().replace(/\s+/g, ' '),
  });
  return {
    layout: {
      program,
      spec,
      cantileverFaces,
      stairRectMm: rectMin,
      ruleFacts: {
        storeys: knowledge.floors,
        program,
        hasCantilever: Object.keys(cantileverFaces).length > 0,
        hasBalcony: balcony !== null && balcony.sides.length > 0,
        hasOpenPairs: openPairs.length > 0,
        hasRoof: roof !== null,
        lightFirst: (input.digest.priorities ?? []).slice(0, 2).includes('natural_light'),
        profile: houseProfile(input.digest).profile,
        entryViaGarage:
          program.some(
            (row) =>
              row.level === '1' &&
              input.groups.passage?.entryRoomByBuildingType
                .get(input.digest.building_type)
                ?.has(row.type) === true,
          ) &&
          (!site.vehicle_entrance_side || site.vehicle_entrance_side === site.main_entrance_side),
      },
    },
    modelKnowledge,
  };
}

/** Lưới bản phác với cỡ ô cho trước — số ô làm tròn theo khối nhà, như `sketchGridOf`. */
export function sketchGridForCell(widthCm: number, depthCm: number, cellM: number): SketchGridSize {
  return {
    columns: Math.max(1, Math.round(widthCm / 100 / cellM)),
    rows: Math.max(1, Math.round(depthCm / 100 / cellM)),
    cell_m: cellM,
  };
}

export function modelKnowledgeOf(k: HouseKnowledge): HouseModelKnowledge {
  // Loại `only_when_asked` mà đầu bài không hỏi tới thì cổng danh mục đã bác — đưa tên nó vào danh mục,
  // dải diện tích và `served_from` chỉ mời mô hình khai rồi bị gửi trả (review 01/10/2026 P2-01).
  const asked = askedTypes(k);
  const unasked = new Set(k.only_when_asked.filter((type) => !asked.has(type)));
  const offered = k.room_types.filter(
    (t) => !k.stair_types.slice(1).includes(t.code) && !unasked.has(t.code),
  );
  const bands: Record<string, [number, number, number]> = Object.fromEntries(
    offered.flatMap((t) => {
      const norm = k.area_norms?.get(t.code);
      return norm ? [[t.code, [norm.min, norm.target, norm.max]] as const] : [];
    }),
  );
  const { areaBands, constraints } = modelConstraints(bands, k.constraints);
  const areas = k.buildable_per_level_m2;
  const stair = k.stair_geometry;
  const stairLength = stair.two_flights_length_m ?? stair.one_flight_length_m;
  const sentTypes = new Set(offered.map((t) => t.code));
  const sent = (code: string) => sentTypes.has(code);
  return {
    // Chỉ loại thang ĐẦU của `stair_types`: các loại sau (lõi thang) bị gộp vào nó khi xếp
    // (`foldStairCore`), đưa cho mô hình thì nó khai cả hai (lượt 4a521f52).
    room_types: Object.fromEntries(offered.map((t) => [t.code, t.vi])),
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
    min_cells: k.min_cells,
    corridor_min_cells: k.corridor_min_cells,
    open_faces: k.open_faces,
    faces: k.faces,
    ...(k.floors > 1 && stair.shape
      ? {
          stair_min_m: {
            width: stair.shape.short_m,
            length: stair.shape.long_m,
            shape: stair.shape.vi,
            cells: stair.shape.cells,
            arrival: stair.shape.arrival,
          },
        }
      : k.floors > 1 && stairLength !== null
        ? { stair_min_m: { width: stair.two_flights_min_width_m, length: stairLength } }
        : {}),
    ...(k.garage_min_m2 !== null ? { garage_min_m2: k.garage_min_m2 } : {}),
    ensuite: { child: k.ensuite_child_types, parent: k.ensuite_parent_types },
    // Chỉ những mã có trong `room_types` đã gửi (T112): `core` bị gộp vào thang ở trên nhưng vẫn nằm
    // trong `walk_through` — mô hình gặp một mã không ai định nghĩa.
    walk_through: (k.passage?.through ?? []).filter(sent),
    entry_through: (k.passage?.entry_through ?? []).filter(sent),
    served_from: Object.fromEntries(
      Object.entries(k.passage?.served_from ?? {})
        .filter(([type]) => sent(type))
        .map(([type, from]) => [type, from.filter(sent)]),
    ),
    open_pairs: pairsOnOneStorey(k),
    // Loại chỉ được khai khi đầu bài hỏi (T96) — cổng danh mục bác nếu mô hình vẫn bịa.
    only_when_asked: k.only_when_asked,
    strategy: k.strategy.trim().replace(/\s+/g, ' '),
    ...(constraints.length ? { constraints } : {}),
  };
}

/**
 * Cặp gộp được mà hai loại CÓ THỂ ở cùng một tầng (T112). Quan hệ chỉ nối phòng cùng tầng, nên cặp
 * phòng khách – phòng thờ khi đầu bài đặt phòng khách tầng 1 và phòng thờ tầng 2 chỉ là chữ thừa mời
 * mô hình làm sai. Một loại «biết tầng» khi MỌI dòng đầu bài của nó đều khai tầng; loại không có trong
 * đầu bài, hay có dòng không khai tầng, coi như ở tầng nào cũng được — không đoán hộ.
 * Chỉ lọc phần gửi mô hình; bộ xếp vẫn đọc `merge_allowed` đầy đủ.
 */
function pairsOnOneStorey(k: HouseKnowledge): string[][] {
  const floors = new Map<string, Set<number> | null>();
  const note = (type: string, floor: number | null) => {
    const known = floors.get(type);
    if (known === null) return;
    if (floor === null) return void floors.set(type, null);
    floors.set(type, (known ?? new Set<number>()).add(floor));
  };
  for (const space of k.brief_spaces) note(space.type, space.floor);
  for (const member of k.members) {
    if (member.bedroom_type && member.rooms > 0) note(member.bedroom_type, member.floor);
  }
  return k.merge_allowed.filter(([a, b]) => {
    const fa = floors.get(a!);
    const fb = floors.get(b!);
    if (!fa || !fb) return true;
    return [...fa].some((floor) => fb.has(floor));
  });
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

/**
 * Mặt gia chủ BẮT BUỘC có ban công mà không thoáng (giáp nhà bên, hay giáp đất trống mà lùi dưới
 * mức `min_open_setback_m`, T112) thì cổng «ban công dài quay ra mặt thoáng» chặn mọi phương án.
 * Nói ra trước trên màn hình — một mâu thuẫn của đầu bài, không phải lỗi của mô hình.
 */
function withClosedBalconyFaces(
  demands: BriefDemands,
  openFaces: readonly string[],
  dryingAtBack: boolean,
): BriefDemands {
  const closed = (demands.balcony?.sides ?? []).filter((side) => !openFaces.includes(side));
  const warnings = [...demands.warnings];
  if (closed.length) {
    warnings.push(
      `Đầu bài bắt buộc có ban công ở ${closed.map(sideWord).join(', ')} nhưng mặt ấy không thoáng ` +
        '(giáp nhà bên hoặc sát đất người khác) — ban công dài phải quay ra mặt thoáng. Cần xem lại ' +
        'khoảng lùi hoặc mặt đặt ban công trong đầu bài.',
    );
  }
  if (dryingAtBack && !openFaces.includes('back')) {
    warnings.push(
      'Đầu bài muốn ban công phơi phía sau nhưng mặt sau không thoáng (sát đất người khác hoặc giáp nhà ' +
        'bên) — chỗ phơi sẽ phải đặt ở mặt khác. Muốn giữ phía sau thì cần chừa sân sau trong đầu bài.',
    );
  }
  return warnings.length === demands.warnings.length ? demands : { ...demands, warnings };
}

export type FaceTag = 'open' | 'blind' | 'harsh_sun' | 'cool_wind';

/**
 * Nhãn từng mặt khối nhà gửi mô hình (T112, review lời dẫn P1-04). Trước đây nắng gắt, gió mát, nhà liền
 * kề chỉ nằm trong văn xuôi đầu bài; mô hình không biết đặt thang, WC dựa vào mặt nào.
 *  - `open`: mặt thoáng (`siteFaces`).
 *  - `blind`: không thoáng VÀ giáp nhà bên — mặt đặc, chỗ dựa của thang, khu ướt, kho.
 *  - `harsh_sun`: đầu bài khai nắng gắt.
 *  - `cool_wind`: đầu bài khai gió mát, chỉ khi mặt ấy thoáng — gió ở mặt bị nhà bên bịt thì vô nghĩa.
 * Chỉ suy từ câu ĐÃ trả lời: mặt chưa khai gì thì danh sách rỗng.
 */
export function faceTags(
  digest: AiBriefDigest,
  openFaces: readonly Face[],
): Record<Face, FaceTag[]> {
  const site = digest.site;
  const tags = (face: Face): FaceTag[] => {
    const open = openFaces.includes(face);
    return [
      ...(open ? (['open'] as const) : []),
      ...(!open && site.adjacent?.[face] === 'nha_hang_xom' ? (['blind'] as const) : []),
      ...((site.harsh_sun_sides ?? []).includes(face) ? (['harsh_sun'] as const) : []),
      ...(open && (site.cool_wind_sides ?? []).includes(face) ? (['cool_wind'] as const) : []),
    ];
  };
  return { front: tags('front'), back: tags('back'), left: tags('left'), right: tags('right') };
}

/** Cờ của các câu `[[cờ|…]]` trong lời dẫn hệ thống `plan_house` (T112). */
export interface HousePromptFlags {
  /** Đầu bài khai thang máy (làm ngay hay chừa chỗ). */
  elevator: boolean;
  /** Đầu bài có hỏi tới sân thượng (`askedTypes`). */
  terrace: boolean;
  /** Có ông bà mà đầu bài chưa ghim tầng. */
  ong_ba_unset: boolean;
  /** Lượt hình chữ nhật có danh mục mái — mô hình khai khu trên mái (`knowledge.roof_level`). */
  roof?: boolean;
}

/**
 * Lời dẫn hệ thống của lượt: giữ chữ trong `[[cờ|chữ]]` khi cờ bật, bỏ khi tắt (T112). Cờ lạ là lỗi tệp
 * dữ liệu — ném, không im lặng gửi chữ thô `[[…]]` cho mô hình.
 */
export function houseSystem(template: string, flags: HousePromptFlags): string {
  const known = { roof: false, ...flags };
  return template.replace(/\[\[(\w+)\|([\s\S]*?)\]\]/g, (_, flag: string, text: string) => {
    if (!(flag in known)) {
      throw new Error(
        `kb/ai_design_prompts.yaml: cờ lời dẫn lạ «${flag}» trong floor_level.system.`,
      );
    }
    return known[flag as keyof HousePromptFlags] ? text : '';
  });
}

/**
 * Loại phòng được mở cửa ra ban công chính mặt tiền theo lời gia chủ (T161): «sảnh, hành lang, sinh hoạt chung» là nhóm
 * `shared_access` của `kb/room_vocabulary.yaml` (cùng nhóm tiêu chí D6 đọc), «phòng ngủ chính» là
 * `demands.balcony.main_master_types` của `kb/brief_fidelity.yaml`. Ngữ cảnh dựng tay không có nhóm phòng thì không kiểm.
 */
function withMainBalconyFrom(demands: BriefDemands, input: PlanContextInput): BriefDemands {
  const balcony = demands.balcony;
  if (!balcony?.mainAccess) return demands;
  const from =
    balcony.mainAccess === 'chung'
      ? (input.roomGroups?.shared_access ?? null)
      : input.fidelity.demands.balcony.mainMasterTypes;
  return from?.length ? { ...demands, balcony: { ...balcony, mainFrom: from } } : demands;
}

export function planContext(input: PlanContextInput): PlanContext {
  const buildable = buildableFromDigest(input.digest);
  const faces = siteFaces(input.digest.site, input.siteContext, setbacksFromDigest(input.digest));
  const demands = withMainBalconyFrom(
    withClosedBalconyFaces(
      briefDemands(input.digest, input.fidelity),
      faces.open,
      input.digest.balconies?.drying_balcony === true,
    ),
    input,
  );
  // Khách – ăn – bếp gia chủ không muốn liền thì không gộp (T103) — cả lời dẫn lẫn bộ xếp đọc tập này.
  const openForbidden = demands.openPlan?.forbidden ?? null;
  const mergeAllowed: ReadonlySet<string> = openForbidden
    ? new Set([...input.mergeAllowed].filter((key) => !openForbidden.has(key)))
    : input.mergeAllowed;
  const buildableCm = buildableRectCm(buildable);
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
  const rect = input.geometry === 'rect';
  const floors = Math.max(1, input.digest.floors);
  const roof: PlanContext['roof'] = input.roofPlan
    ? {
        spec: input.roofPlan,
        level: floors + 1,
        required: requiredRoofZones(input.roofPlan, input.digest),
      }
    : null;
  const cellM = input.sketchCellM ?? (rect ? LAYOUT_CELL_MM / 1000 : undefined);
  const grid = cellM ? sketchGridForCell(widthCm, depthCm, cellM) : sketchGridOf(widthCm, depthCm);
  const knowledge: HouseKnowledge = {
    ...base,
    // Cùng TẬP VỊ TỪ mà `rule-warnings.ts` đo lại sau, cộng phần danh mục — một nguồn duy nhất (T20).
    constraints: injectableRules(input.rules, input.digest.building_type, HOUSE_PREDICATES),
    block_m: { width: round1(widthCm / 100), depth: round1(depthCm / 100) },
    grid: { columns: widthCm >= SPLIT_MIN_CM ? 3 : 1, rows: depthCm >= SPLIT_MIN_CM ? 3 : 1 },
    sketch_grid: grid,
    min_cells: briefMinCells(
      base.brief_spaces,
      base.garage_min_m2,
      grid,
      input.construction,
      demands.elevator,
    ),
    corridor_min_cells: corridorMinCells(input.construction, grid.cell_m),
    ...(input.areaNorms ? { area_norms: input.areaNorms } : {}),
    zones: ZONES,
    open_faces: faces.open,
    faces: faceTags(input.digest, faces.open),
    access_faces: accessFaces,
    yards: (input.digest.massing?.yards ?? []).map((yard) => YARD_WORDS[yard] ?? yard),
    main_entrance_side: input.digest.site.main_entrance_side ?? null,
    vehicle_entrance_side: input.digest.site.vehicle_entrance_side ?? null,
    merge_allowed: [...mergeAllowed].map((key) => key.split('|')),
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
    stair_geometry: stairGeometry(input.construction, grid.cell_m),
  };
  const layoutPart = rect
    ? layoutContextOf(input, knowledge, demands, faces.open, buildableCm, roof)
    : null;
  const bands =
    rect && input.pipeline === 'v6' && layoutPart
      ? bandsContextOf(input, layoutPart.layout.stairRectMm)
      : null;
  if (bands && layoutPart) {
    const site = input.digest.site;
    const lotM2 = (site.width_m ?? 0) * (site.depth_m ?? 0);
    layoutPart.layout.loads = storeyLoads({
      program: layoutPart.layout.program,
      minM2: bands.normMinM2,
      storeys: knowledge.floors,
      stairAreaM2: bands.stair ? (bands.stair.width * bands.stair.length) / 1e4 : 0,
      feasibility: layoutPart.layout.spec.feasibility,
      envelopeM2: (widthCm * depthCm) / 1e4,
      maxFootprintM2:
        typeof site.max_density === 'number' && lotM2 > 0 ? site.max_density * lotM2 : null,
      depth: {
        minSideCm: bands.minSideCm,
        areaFree: bands.areaFree,
        stair: knowledge.floors >= 2 ? bands.stair : null,
        stairLabel: STAIR_TOKEN,
        widthCm,
        depthCm,
        wallCm: Math.ceil(bands.walls.exterior + bands.walls.partition / 2),
      },
    });
    layoutPart.modelKnowledge = bandsKnowledge(
      layoutPart.modelKnowledge,
      bands,
      layoutPart.layout.loads,
    );
  }
  return {
    buildable,
    buildableCm,
    demands,
    mergeAllowed,
    northDeg: northDegFor(input.digest.site.orientation),
    openFaces: faces.open,
    accessFaces,
    entrances: {
      main: input.digest.site.main_entrance_side ?? null,
      vehicle: input.digest.site.vehicle_entrance_side ?? null,
    },
    lotCm: buildableRectCm({ ...lotRectFromDigest(input.digest) } as BuildableBox),
    mandatory: mandatorySetup(input),
    levels: Array.from({ length: Math.max(1, input.digest.floors) }, (_, i) => i + 1),
    narrative: briefNarrative(input.digest, { roomLabels: input.labels }),
    knowledge,
    modelKnowledge: layoutPart ? layoutPart.modelKnowledge : modelKnowledgeOf(knowledge),
    layout: layoutPart?.layout ?? null,
    roof,
    geometry: rect ? 'rect' : 'cells',
    blockMm: {
      x: buildableCm.x0 * 10,
      y: buildableCm.y0 * 10,
      widthMm: widthCm * 10,
      depthMm: depthCm * 10,
    },
    layoutWallM: input.construction.walls.exterior_m,
    promptFlags: {
      elevator: demands.elevator !== null,
      terrace: askedTypes(knowledge).has('terrace'),
      ong_ba_unset: knowledge.members.some(
        (m) => m.role === 'ong_ba' && m.rooms > 0 && m.floor === null,
      ),
      roof: rect && roof !== null,
    },
    schema: bands
      ? houseBandsJsonSchema()
      : rect
        ? houseLayoutJsonSchema()
        : houseIntentJsonSchema(),
    bands,
  };
}

/** Số bậc và chiều dài ô thang cần của một tầng thường — cùng phép tính cổng dùng (`tree/stair-fit.ts`). */
function stairGeometry(
  construction: ConstructionNorms,
  cellM: number,
): HouseKnowledge['stair_geometry'] {
  const risers = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
  const width = construction.stairs.two_flights_min_width_m;
  const one = stairRunNeedCm(construction, { flights: 1, treads: risers, acrossCm: width * 50 });
  const two = stairRunNeedCm(construction, { flights: 2, treads: risers, acrossCm: width * 100 });
  const shape = construction.stairs.shape;
  const spec = shape ? construction.stairs.shapes?.[shape] : undefined;
  const min = shape && spec ? stairMinCm(construction) : null;
  return {
    risers,
    one_flight_length_m: one === null ? null : round1(one / 100),
    two_flights_length_m: two === null ? null : round1(two / 100),
    two_flights_min_width_m: width,
    ...(shape && spec && min
      ? {
          shape: {
            vi: spec.vi,
            short_m: round1(min.short / 100),
            long_m: round1(min.long / 100),
            // Mỗi cạnh cộng một bề dày tường ngoài rồi làm tròn lên ô — như giếng thang máy (`briefMinCells`).
            cells: [
              Math.ceil((min.short / 100 + construction.walls.exterior_m) / cellM - 1e-9),
              Math.ceil((min.long / 100 + construction.walls.exterior_m) / cellM - 1e-9),
            ],
            arrival: STAIR_ARRIVAL_SENT[stairArrival(shape)],
          },
        }
      : {}),
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

/** Lược đồ vòng sửa chế độ hình chữ nhật: nguyên hợp đồng `ai-house-layout-delta`. */
export function houseLayoutDeltaJsonSchema(): Record<string, unknown> {
  return structuredClone(houseLayoutDeltaSchemaJson) as Record<string, unknown>;
}

/** Lược đồ đường v6: dạng gọn `ai-house-bands-compact` (mô hình trả; chương trình bung ra hợp đồng nội bộ). */
export function houseBandsJsonSchema(): Record<string, unknown> {
  return structuredClone(houseBandsSchemaJson) as Record<string, unknown>;
}

/** Lược đồ vòng sửa đường v6: dạng gọn `ai-house-bands-delta-compact` (mô hình trả; chương trình bung ra hợp đồng nội bộ). */
export function houseBandsDeltaJsonSchema(): Record<string, unknown> {
  return structuredClone(houseBandsDeltaSchemaJson) as Record<string, unknown>;
}

/**
 * Tri thức gửi mô hình ở đường dải (v6) — CÙNG số bộ giải dùng (handoff v6 sửa lỗi đợt 1, P0-1). Đường v5 làm tròn hành
 * lang / vách cửa lên bội ô lưới 0,5 m (nhà ống ra 1.500 mm) trong khi mẫu dải dạy 900 mm: lời dẫn tự mâu thuẫn, mô hình
 * nghĩ rất lâu để dung hoà (lượt thật 619f0438). Bỏ phần mô hình không dùng ở đường dải: nội thất, khoảng trống (bộ giải
 * lo diện tích — T2), `strategy` (mẫu dải đã nói — T5), loại `core` (đường dải không có — handoff mục 3).
 */
function bandsKnowledge(
  knowledge: LayoutModelKnowledge,
  bands: BandsContext,
  loads: readonly StoreyLoad[],
): LayoutModelKnowledge {
  const {
    furniture: _furniture,
    clearances: _clearances,
    strategy: _strategy,
    feasibility: _feasibility,
    ...rest
  } = knowledge as LayoutModelKnowledge & Record<string, unknown>;
  // Khả thi theo mức tối thiểu, chỉ tầng chật / vượt, một dòng ngắn (T6, P0-4).
  const feasibility = loadsKnowledge(loads);
  const stair = (rest as { stair?: Record<string, unknown> }).stair;
  return {
    ...rest,
    ...(stair && bands.stair
      ? {
          stair: {
            ...stair,
            rect_min_mm: [bands.stair.width * 10, bands.stair.length * 10],
            // Gầm thang dùng được ở đầu cao (thang thẳng, T116) — có thì WC nhỏ nằm dưới đó: stack(THANG, wc).
            ...(bands.underStairCm ? { under_mm: bands.underStairCm * 10 } : {}),
          },
        }
      : {}),
    ...(bands.corridorClearCm ? { corridor_min_mm: bands.corridorClearCm * 10 } : {}),
    door_wall_mm: bands.doorWallCm * 10,
    ...(Object.keys(feasibility).length ? { feasibility } : {}),
    house_type: houseProfileLabel(bands),
    walk_through: [...bands.through].filter((type) => type !== 'core').sort(),
    // Mái do chương trình dựng từ tầng trên cùng (handoff sửa lỗi đợt 2 mục 2): mô hình không thấy mã mái.
    ...(Array.isArray((rest as { program?: unknown }).program)
      ? {
          program: (rest as { program: unknown[][] }).program.filter((row) => row[2] !== 'roof'),
        }
      : {}),
  } as LayoutModelKnowledge;
}

/** Thông số bộ giải dải theo loại nhà — đọc từ số đo đã áp loại nhà (`withHouseProfile`) và `passage`. */
function bandsContextOf(
  input: PlanContextInput,
  stairRectMm: [number, number] | null,
): BandsContext {
  const result = houseProfile(input.digest);
  const through = new Set(input.groups.passage?.through ?? []);
  if (result.profile === 'ong' || result.profile === 'pho' || result.kd) through.add('garage');
  const door = input.construction.openings.door?.width_m ?? 0.9;
  const margin = input.construction.openingRules.door_margin_m;
  const cars = input.digest.parking?.cars ?? 0;
  // Ô thang theo tim tường, ĐÃ cộng tường — đúng số lời dẫn v5 gửi (`rect_min_mm`); cổng đo lọt lòng trên đó.
  const plain = stairGeometry(input.construction, 1);
  const wall = Math.round(input.construction.walls.exterior_m * 100);
  // Mọi tầng chồng chung một ô thang: đủ dài cho cả tầng trên cùng (cao `top_storey_height_m`, nhiều bậc hơn — cổng
  // tính theo chiều cao ấy ở tầng `isTop`).
  const levels = input.construction.levels;
  const top = levels.top_storey_height_m
    ? stairMinCm({
        ...input.construction,
        levels: { ...levels, storey_height_m: levels.top_storey_height_m },
      })
    : null;
  const topLong = top
    ? Math.ceil(
        top.long +
          input.construction.walls.exterior_m * 100 +
          input.construction.walls.partition_m * 50,
      )
    : 0;
  const stair = stairRectMm
    ? {
        short: Math.round(stairRectMm[0] / 10),
        long: Math.max(Math.round(stairRectMm[1] / 10), topLong),
      }
    : {
        short: Math.ceil(plain.two_flights_min_width_m * 100 + wall),
        long: Math.ceil(
          (plain.two_flights_length_m ?? plain.one_flight_length_m ?? 4) * 100 + wall,
        ),
      };
  return {
    profile: result.profile,
    kd: result.kd,
    through,
    doorWallCm: Math.round((door + 2 * margin) * 100),
    ...(input.construction.circulation?.corridor_pass_clear_m
      ? { corridorPassCm: Math.round(input.construction.circulation.corridor_pass_clear_m * 100) }
      : {}),
    stair: { width: stair.short, length: stair.long },
    openTypes: new Set([...input.groups.outdoor, 'light_well']),
    underStairCm: ((params) =>
      params && input.construction.stairs.under_use_height_m
        ? underStairCm(
            params,
            Math.round(input.construction.levels.storey_height_m * 100),
            Math.round(input.construction.stairs.under_use_height_m * 100),
          )
        : 0)(
      stairParamsOf(
        input.construction,
        stairTreads(
          input.construction,
          Math.round(input.construction.levels.storey_height_m * 100),
        ),
      ),
    ),
    stairParams: stairParamsOf(
      input.construction,
      stairTreads(input.construction, Math.round(input.construction.levels.storey_height_m * 100)),
    ),
    minSideCm: (type) =>
      Math.round((usableMinSide(input.construction, type, { cars }) ?? 0.9) * 100),
    usualM2: (type) => input.areaNorms?.get(type)?.target ?? 6,
    normMinM2: (type) => input.areaNorms?.get(type)?.min ?? 4,
    areaFree: new Set([...input.groups.vertical, 'light_well']),
    noDoor: input.groups.noDoorRequired,
    altarBackSide: altarBackSide(input.digest),
    stairOpensTo: input.groups.passage?.stairOpensTo.size
      ? input.groups.passage.stairOpensTo
      : null,
    servedFrom: input.groups.passage?.servedFrom ?? null,
    walls: {
      exterior: Math.round(input.construction.walls.exterior_m * 100),
      partition: Math.round(input.construction.walls.partition_m * 100),
    },
    ...(input.construction.circulation?.corridor_clear_m
      ? { corridorClearCm: Math.round(input.construction.circulation.corridor_clear_m * 100) }
      : {}),
  };
}

/** Lược đồ chế độ hình chữ nhật: nguyên hợp đồng `ai-house-layout`. */
export function houseLayoutJsonSchema(): Record<string, unknown> {
  return structuredClone(houseLayoutSchemaJson) as Record<string, unknown>;
}

/** Thân lời gọi: văn xuôi đầu bài + tri thức gửi đi (JSON không thụt lề, T26). */
export function housePrompt(
  narrative: string,
  knowledge: HouseModelKnowledge | LayoutModelKnowledge,
): string {
  return modelBody(narrative, knowledge);
}

/**
 * Thân lời gọi chế độ hình chữ nhật (tài liệu v5 mục 4): `<rules>` đánh số + `<knowledge>` + `<brief>` rút gọn — đúng thứ
 * tự ấy, không mốc thời gian, nên giống hệt từng byte giữa lượt đầu và các vòng sửa.
 */
export function layoutPrompt(
  context: PlanContext,
  prompts: AiPrompts,
  flags: HousePromptFlags,
): string {
  const layout = prompts.houseLayout!;
  const rules = selectRules(layout.rules, context.layout!.ruleFacts);
  return (
    `<rules>
${houseSystem(rules.text, flags)}
</rules>
` +
    `<knowledge>${JSON.stringify(context.modelKnowledge)}</knowledge>
` +
    `<brief>
${compactBrief(context.narrative, layout.briefSections)}
</brief>` +
    bandPatterns(context, prompts)
  );
}

/** Mẫu dải của ĐÚNG loại nhà (đường v6) — nhà ống kinh doanh nhận cả mẫu ỐNG lẫn KD. */
function bandPatterns(context: PlanContext, prompts: AiPrompts): string {
  const bands = context.bands;
  const patterns = prompts.houseBands?.patterns;
  if (!bands || !patterns) return '';
  // Nhà ống: MỘT mẫu (T4) — B khi danh mục có giếng trời (đầu bài hỏi), không thì A.
  const wantsWell = context.layout?.program.some((row) => row.type === 'light_well') ?? false;
  const own =
    bands.profile === 'ong'
      ? (patterns[wantsWell ? 'ong_b' : 'ong_a'] ?? patterns.ong)
      : patterns[bands.profile];
  const text = [own, bands.kd ? patterns.kd : undefined].filter((p): p is string => !!p).join('\n');
  return text ? `\n<patterns>\n${text.trim()}\n</patterns>` : '';
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
  /**
   * Chế độ hình chữ nhật: câu nhắc tiếng Anh cho chỗ rect chồng / hở / vượt khối mà chương trình không tự sửa.
   * Không chặn — nối vào vòng sửa chỉ khi phương án vẫn hỏng hay dưới ngưỡng (`arrangeHouseStep`).
   */
  layoutHints?: string[];
  /** Chỗ chương trình tự sửa trên rect (bắt bước, căn vách), tiếng Việt — ghi nhật ký. */
  layoutFixes?: string[];
  /**
   * Đường v6: bộ dải đã gộp KHI bộ giải báo lỗi cấu trúc (thiếu chỗ, sai bề rộng) — vòng sau SỬA chính bộ dải ấy
   * (`<plan>`), không lấy mẫu lại cả nhà (T116, Bước 5).
   */
  bandsBase?: AiHouseBands;
  /** Tầng của `bandsBase` đã khoá (tầng 1 chương trình dựng lại) — vòng sửa không được đổi. */
  bandsKeep?: number[];
}

/** Lời dẫn đúng chế độ của ngữ cảnh: chế độ hình chữ nhật thay khối `floor_level` bằng `house_layout`. */
export function promptsFor(context: PlanContext, prompts: AiPrompts): AiPrompts {
  if (context.geometry !== 'rect' || !context.layout) return prompts;
  // Đường v6: khối `house_bands` thay vào chỗ `house_layout` — mọi chỗ đọc `houseLayout` phía sau chạy nguyên.
  if (context.bands && prompts.houseBands)
    prompts = { ...prompts, houseLayout: prompts.houseBands };
  const grid = context.knowledge.sketch_grid;
  const ruleOf = prompts.houseLayout
    ? selectRules(prompts.houseLayout.rules, context.layout.ruleFacts).ruleOf
    : {};
  return layoutPrompts(
    prompts,
    {
      x: context.blockMm.widthMm / grid.columns,
      y: context.blockMm.depthMm / grid.rows,
      ox: context.blockMm.x,
      oy: context.blockMm.y,
    },
    ruleOf,
  );
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
  /** Tầng đã qua, giữ nguyên khi ghép câu trả lời sửa (T86, `settledLevels`). */
  keep?: readonly number[];
  /** Mức suy nghĩ kỹ sư chọn cho lượt chạy; vắng = cấu hình tuyến. */
  reasoningEffort?: ReasoningEffort;
  onProgress?: StructuredCallOptions['onProgress'];
  signal?: AbortSignal;
}

/**
 * Khoá bộ nhớ đệm của một đầu bài: băm FNV-1a 32 bit của thân lời gọi. Lượt đầu và các vòng sửa cùng
 * đầu bài cùng khoá; hai hồ sơ khác nhau khác khoá. Không mang danh tính — chỉ là số băm.
 */
export function cacheKeyOf(prompt: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i += 1) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `nvg-house-${hash.toString(16).padStart(8, '0')}`;
}

/** Trần chữ tự do của `ai-house-intent` — cắt thay vì bác cả lượt (`tree/ids.ts` `clampText`). */
const HOUSE_TEXT_LIMITS = { variant_label: 120, rationale: 1500 } as const;

/** Một lượt gọi mô hình cho cả nhà. Đây là chỗ DUY NHẤT trong tệp này tốn tiền. */
export async function callHouseModel(call: HouseCallInput): Promise<HouseAttempt> {
  if (call.context.bands) return callBandsModel(call);
  if (call.context.geometry === 'rect') return callLayoutModel(call);
  const retrying = (call.avoid?.length ?? 0) > 0;
  const prompts = call.prompts;
  const floor = prompts.floorLevel;
  const avoid = (call.avoid ?? []).join('\n');
  // Phần gọi lại nối vào CUỐI thân lời gọi, không vào lời dẫn hệ thống: lời dẫn + đầu bài + tri thức
  // giữ nguyên từng byte như lượt đầu, nên nhà cung cấp đọc lại từ bộ nhớ đệm.
  const view =
    retrying && call.previous ? revisionView(call.previous, call.avoid ?? [], call.keep) : null;
  const retry = !retrying
    ? null
    : view
      ? floor.revise
          .replace('{avoid}', () => view.avoid.join('\n'))
          .replace('{intent}', () => JSON.stringify(view.intent))
      : floor.resample.replace('{avoid}', () => avoid);

  const prompt = housePrompt(call.context.narrative, call.context.modelKnowledge);
  // Không truyền trần token: tuyến trong `config/models.yaml` là van DUY NHẤT (`text-client.ts`).
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: houseSystem(floor.system, call.context.promptFlags),
    prompt,
    ...(retry ? { promptTail: retry } : {}),
    cacheKey: cacheKeyOf(prompt),
    schema: call.context.schema,
    ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
    ...(call.onProgress ? { onProgress: call.onProgress } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  });

  const record = callRecord(result);
  const candidate = tidyHouse(result.json);
  const parsed = aiHouseIntentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { intent: null, issues: describeZod(parsed.error, candidate), call: record };
  }
  const data = splitClashingIds(parsed.data);
  const intent =
    view && call.previous
      ? mergeRevision(call.previous, fromRevisionIds(data, view.back), call.keep)
      : data;
  return { intent, issues: [], call: record };
}

function callRecord(result: StructuredCallResult): PlanCallRecord {
  return {
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
  };
}

/**
 * Lượt gọi chế độ hình chữ nhật (`prompt-mat-bang-v5.md`): lời dẫn hệ thống tĩnh, thân lời gọi `<rules><knowledge>
 * <brief>`; vòng SỬA gửi `<plan>` mới nhất + lỗi ở khối sau và nhận DELTA (mục 6) — chương trình gộp vào kế hoạch,
 * bỏ phần đụng tầng đã khoá, rồi đổi ra ý định như lượt đầu. Câu trả lời sai hợp đồng thì lấy mẫu lại cả nhà.
 */
/** Cắt từng dòng chữ quá trần thay vì bác cả câu trả lời (lượt 139e1a3f: một `assumptions` > 200 ký tự, 0,057 USD). */
function clampLines(json: unknown, limits: Readonly<Record<string, number>>): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const out: Record<string, unknown> = { ...(json as Record<string, unknown>) };
  for (const [key, max] of Object.entries(limits)) {
    const value = out[key];
    if (Array.isArray(value)) {
      out[key] = value.map((line) =>
        typeof line === 'string' && line.length > max ? `${line.slice(0, max - 1)}…` : line,
      );
    } else if (typeof value === 'string' && value.length > max) {
      out[key] = `${value.slice(0, max - 1)}…`;
    }
  }
  return out;
}

const BAND_TEXT_LIMITS = {
  variant_label: 120,
  parti: 200,
  rationale: 1500,
  design_notes: 300,
  assumptions: 200,
  notes: 300,
} as const;

/**
 * Đường v6 (T116): mô hình trả DẢI, bộ giải tính kích thước. Câu trả lời → bộ giải → bố cục hình chữ nhật v5 →
 * `layoutToIntent` (mã danh mục, ban công đua, mái như v5) + cây chia ô từng tầng gắn vào ý định (`band_trees`).
 */
async function callBandsModel(call: HouseCallInput): Promise<HouseAttempt> {
  const context = call.context;
  const layoutCtx = context.layout!;
  const bandsCtx = context.bands!;
  const prompts = promptsFor(context, call.prompts);
  const floor = prompts.floorLevel;
  const retrying = (call.avoid?.length ?? 0) > 0;
  const roofLevel = context.roof?.level;
  const base = retrying ? (call.previous?.bands ?? null) : null;
  const retry = !retrying
    ? null
    : base
      ? floor.revise
          .replace('{avoid}', () => (call.avoid ?? []).join('\n'))
          .replace('{intent}', () => JSON.stringify(compactBands(base)))
      : floor.resample.replace('{avoid}', () => (call.avoid ?? []).join('\n'));
  const prompt = layoutPrompt(context, prompts, context.promptFlags);
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: houseSystem(floor.system, context.promptFlags),
    prompt,
    ...(retry ? { promptTail: retry } : {}),
    cacheKey: cacheKeyOf(prompt),
    schema: base ? houseBandsDeltaJsonSchema() : context.schema,
    ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
    ...(call.onProgress ? { onProgress: call.onProgress } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  });
  const record = callRecord(result);
  // Câu trả lời dạng gọn (ô là chuỗi, handoff sửa lỗi đợt 2 mục 4.2) → dạng nội bộ, rồi chuẩn hoá mềm (mục 3.1).
  const normalized = normalizeBandsAnswer(expandCompact(result.json), !!base);
  if (normalized.changes.length)
    console.log(`[ĐO] chuẩn hoá câu trả lời: ${normalized.changes.join('; ')}`);
  const candidate = dropBadDoorPairs(clampLines(normalized.json, BAND_TEXT_LIMITS));
  let bands: AiHouseBands;
  if (base) {
    const parsed = aiHouseBandsDeltaSchema.safeParse(candidate);
    if (!parsed.success) {
      // Bản sửa hỏng hợp đồng: sửa tiếp TỪ BẢN CŨ, không lấy mẫu lại (handoff sửa lỗi đợt 2 mục 3.2).
      return {
        intent: null,
        bandsBase: base,
        ...(call.keep?.length ? { bandsKeep: [...call.keep] } : {}),
        issues: describeZod(parsed.error, candidate),
        call: record,
      };
    }
    // Tầng đã qua (T86) bất khả xâm phạm: delta chạm tầng ấy bị bỏ.
    bands = mergeBandsDelta(base, parsed.data, new Set((call.keep ?? []).map(String)));
  } else {
    const parsed = aiHouseBandsSchema.safeParse(candidate);
    if (!parsed.success) {
      // Đủ khung dải (tầng nào cũng có danh sách dải) thì vòng sau SỬA chính bộ này; chỉ lấy mẫu lại khi JSON hỏng hẳn
      // (handoff sửa lỗi đợt 2 mục 3.2 — lấy mẫu lại vứt bỏ một thiết kế đúng hướng).
      const storeys = (candidate as { storeys?: unknown }).storeys;
      const shaped =
        Array.isArray(storeys) &&
        storeys.length > 0 &&
        storeys.every((s) => Array.isArray((s as { bands?: unknown })?.bands));
      return {
        intent: null,
        ...(shaped ? { bandsBase: candidate as AiHouseBands } : {}),
        issues: describeZod(parsed.error, candidate),
        call: record,
      };
    }
    bands = parsed.data;
  }
  return bandsAttempt(context, layoutCtx, bandsCtx, prompts, bands, record, roofLevel);
}

const STAIR_ALIASES = new Set(['thang', 'stair', 'stairs', 'cau_thang', 'staircase']);

/**
 * Lớp chuẩn hoá MỀM trước khi kiểm hợp đồng (handoff sửa lỗi đợt 2 mục 3.1) — sửa thay vì bác những chỗ hiểu được ý:
 * đường dẫn knowledge trên mã, mã viết hoa / có khoảng trắng, «thang» / «stair» thay `THANG`, trường thiếu (mặc định
 * rỗng). Ghi lại mọi chỗ đã đổi. Mã có tiền tố `model_added` chưa khai và mã phần tử đứng lặp qua tầng đã được bộ giải
 * nhận sẵn (`typeOfId`, đổi mã theo tầng).
 */
export function normalizeBandsAnswer(
  json: unknown,
  delta: boolean,
): { json: unknown; changes: string[] } {
  const counts = new Map<string, number>();
  const note = (what: string) => counts.set(what, (counts.get(what) ?? 0) + 1);
  const stripped = stripKnowledgePaths(json);
  if (stripped !== json && JSON.stringify(stripped) !== JSON.stringify(json))
    note('bỏ tiền tố đường dẫn knowledge');
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped))
    return { json: stripped, changes: [] };
  const obj = { ...(stripped as Record<string, unknown>) };
  const id = (value: unknown, cell: boolean): unknown => {
    if (typeof value !== 'string') return value;
    if (value === STAIR_TOKEN || value === OPEN_CELL || value === LIGHT_WELL_TOKEN) return value;
    const lower = value.trim().toLowerCase().replace(/\s+/g, '_');
    if (cell && lower === 'lw') return LIGHT_WELL_TOKEN;
    if (cell && STAIR_ALIASES.has(lower)) {
      note(`«${value}» → ${STAIR_TOKEN}`);
      return STAIR_TOKEN;
    }
    if (lower !== value) note('mã viết hoa / có khoảng trắng → chữ thường');
    return lower;
  };
  const arr = (key: string) => {
    if (Array.isArray(obj[key])) return;
    note(`thiếu «${key}» → rỗng`);
    obj[key] = [];
  };
  if (delta) for (const key of ['storeys', 'doors_prefer', 'cantilevers_upsert', 'notes']) arr(key);
  else {
    for (const key of ['design_notes', 'assumptions', 'doors_prefer', 'cantilevers', 'storeys'])
      arr(key);
    for (const key of ['variant_label', 'parti', 'rationale', 'entry_room', 'garage_room'])
      if (typeof obj[key] !== 'string') {
        note(`thiếu «${key}» → rỗng`);
        obj[key] = '';
      }
  }
  // Tầng ghi bằng chữ (lượt thật f0c97c06: «Tầng 1» — schema có mẫu nhưng nhà cung cấp không chặn; mô hình tốn hai vòng
  // chỉ để đổi tên tầng): lấy số tầng; «mái» / «roof» / «tum» → `roof`.
  const storeyLevel = (level: unknown): unknown => {
    if (typeof level === 'number') return String(level);
    if (typeof level !== 'string' || /^([1-9][0-9]?|roof)$/.test(level)) return level;
    const plain = level
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase();
    const digits = /\d+/.exec(plain)?.[0];
    const fixed =
      /roof|mai|tum/.test(plain) && !digits ? 'roof' : digits ? String(Number(digits)) : level;
    if (fixed !== level) note(`tầng «${level}» → «${String(fixed)}»`);
    return fixed;
  };
  obj.storeys = (obj.storeys as unknown[]).map((storey) => {
    if (!storey || typeof storey !== 'object') return storey;
    const s = storey as Record<string, unknown>;
    return {
      ...s,
      level: storeyLevel(s.level),
      bands: Array.isArray(s.bands)
        ? s.bands.map((band) => {
            if (!band || typeof band !== 'object') return band;
            const b = band as Record<string, unknown>;
            return {
              ...b,
              depth: typeof b.depth === 'number' ? b.depth : 0,
              cells: Array.isArray(b.cells)
                ? b.cells.map((cell) => {
                    if (!cell || typeof cell !== 'object') return cell;
                    const c = cell as Record<string, unknown>;
                    return {
                      ...c,
                      id: typeof c.id === 'string' ? id(c.id, true) : '',
                      w: typeof c.w === 'number' ? c.w : 0,
                      stack: Array.isArray(c.stack)
                        ? c.stack.map((part) =>
                            part && typeof part === 'object'
                              ? {
                                  ...(part as Record<string, unknown>),
                                  id: id((part as { id?: unknown }).id, true),
                                  d:
                                    typeof (part as { d?: unknown }).d === 'number'
                                      ? (part as { d: number }).d
                                      : 0,
                                }
                              : part,
                          )
                        : [],
                    };
                  })
                : b.cells,
            };
          })
        : s.bands,
    };
  });
  obj.doors_prefer = (obj.doors_prefer as unknown[]).map((pair) =>
    Array.isArray(pair) ? pair.map((value) => id(value, false)) : pair,
  );
  for (const key of ['entry_room', 'garage_room'])
    if (typeof obj[key] === 'string') obj[key] = id(obj[key], false);
  const changes = [...counts].map(([what, n]) => (n > 1 ? `${what} (${n})` : what));
  return { json: obj, changes };
}

/**
 * Mã viết kèm đường dẫn knowledge (`knowledge.model_added.gt_t1`, `knowledge.program.wc_1`) → mã trần. Chỉ chuỗi TRỌN là
 * một đường dẫn như thế mới đổi — câu chữ không bị chạm (lượt thật 41ffe1e5: lời gọi 1 bị bác cả bộ vì năm mã như vậy,
 * 0,09 USD).
 */
export function stripKnowledgePaths(json: unknown): unknown {
  if (typeof json === 'string') {
    const m = /^knowledge\.(?:model_added|program)\.([a-z0-9_]+)$/.exec(json);
    return m ? m[1] : json;
  }
  if (Array.isArray(json)) return json.map(stripKnowledgePaths);
  if (json && typeof json === 'object')
    return Object.fromEntries(
      Object.entries(json).map(([key, value]) => [key, stripKnowledgePaths(value)]),
    );
  return json;
}

/**
 * Sảnh đầu thang do chương trình chèn (Haan, sau lượt thật df9da65a: «cho chương trình tự chèn sảnh đầu thang»). Tầng
 * trên có đầu thang trước / sau không giáp lối đi (`stair_end_blocked`) → chèn một dải hành lang chạy suốt bề ngang ngay
 * sát đầu ấy (phòng ở dải bên cạnh cũng có lối vào từ đó), rồi giải lại. Chỉ nhận khi số lỗi giảm; đầu trái / phải (thang
 * quay ngang) không chèn. Bộ dải trả về là bộ đã chèn — mô hình thấy sảnh trong `<plan>` nếu còn phải sửa.
 */
function addStairLandings(
  given: AiHouseBands,
  solve: (trial: AiHouseBands) => ReturnType<typeof bandsToLayout>,
  spec: LayoutContext['spec'],
): { bands: AiHouseBands; solved: ReturnType<typeof bandsToLayout> } {
  const prefix = Object.entries(spec.modelAdded).find(([, type]) => type === 'circulation')?.[0];
  let bands = given;
  let solved = solve(given);
  if (!prefix) return { bands, solved };
  for (let round = 0; round < 2; round += 1) {
    const blocked = solved.issues.filter(
      (issue) =>
        issue.code === 'stair_end_blocked' &&
        (issue.params?.end === 'front' || issue.params?.end === 'back'),
    );
    if (!blocked.length) break;
    const added: string[] = [];
    let trial = bands;
    for (const issue of blocked) {
      const end = issue.params!.end as 'front' | 'back';
      const next = insertLanding(trial, String(issue.level), end, prefix);
      if (next === trial) continue;
      trial = next;
      added.push(`tầng ${issue.level} đầu ${end === 'front' ? 'trước' : 'sau'}`);
    }
    if (trial === bands) break;
    const result = solve(trial);
    if (result.layout ? false : result.issues.length >= solved.issues.length) break;
    bands = trial;
    solved = {
      ...result,
      fixes: [
        ...result.fixes,
        `Đầu thang không giáp lối đi — chương trình chèn sảnh suốt bề ngang: ${added.join(', ')}.`,
      ],
    };
    if (result.layout) break;
  }
  return { bands, solved };
}

/**
 * Chèn một dải sảnh suốt bề ngang sát đầu trước / sau ô thang của tầng `level`. Trả lại đúng bộ cũ khi tầng không có
 * thang, hay sát đầu ấy đã là sảnh chương trình chèn.
 */
function insertLanding(
  bands: AiHouseBands,
  level: string,
  end: 'front' | 'back',
  prefix: string,
): AiHouseBands {
  const id = `${prefix}_h${level}${end === 'front' ? 'a' : 'b'}`;
  const storey = bands.storeys.find((s) => s.level === level);
  if (!storey) return bands;
  const at = storey.bands.findIndex((band) =>
    band.cells.some(
      (cell) => cell.id === STAIR_TOKEN || cell.stack.some((part) => part.id === STAIR_TOKEN),
    ),
  );
  if (at < 0 || storey.bands.some((band) => band.cells.some((cell) => cell.id === id)))
    return bands;
  const next = [...storey.bands];
  next.splice(end === 'front' ? at : at + 1, 0, { depth: 0, cells: [{ id, w: 0, stack: [] }] });
  return {
    ...bands,
    storeys: bands.storeys.map((s) => (s === storey ? { ...s, bands: next } : s)),
  };
}

/** Lỗi cổng cho thấy một phòng chỉ ra được ô thang / qua phòng riêng — sảnh đầu thang thường gỡ được. */
const LANDING_CODES = new Set([
  'door_from_stair',
  'room_through_private',
  'room_without_door',
  'room_unreachable_on_level',
]);

/**
 * Sảnh đầu thang sau cổng (Haan, sau lượt thật df9da65a): tầng có phòng chỉ ra được ô thang hay chỉ vào được qua phòng
 * riêng (vd. tầng 1 [gara] ngay trước [THANG | WC] — gara chỉ giáp thang, WC chỉ vào qua gara) → thử chèn sảnh suốt bề
 * ngang ở đầu trước, đầu sau, hay cả hai của ô thang tầng ấy; lấy cách ít lỗi cổng nhất, chỉ nhận khi ít hơn bản gốc.
 */
export function landStairEnds(
  input: PlanContextInput & HouseScoring,
  context: PlanContext,
  prompts: AiPrompts,
  generator: AiSpaceProgram['generator'],
  attempt: HouseAttempt,
  evaluation: HouseEvaluation,
  evaluate: typeof evaluateHouse = evaluateHouse,
): { attempt: HouseAttempt; evaluation: HouseEvaluation } | null {
  const layoutCtx = context.layout;
  const bandsCtx = context.bands;
  const given = attempt.intent?.bands;
  if (evaluation.ok || !layoutCtx || !bandsCtx || !given) return null;
  const prefix = Object.entries(layoutCtx.spec.modelAdded).find(
    ([, type]) => type === 'circulation',
  )?.[0];
  if (!prefix) return null;
  const levels = [
    ...new Set(
      evaluation.rejections
        .filter((r) => r.level > 0 && r.codes?.some((code) => LANDING_CODES.has(code)))
        .map((r) => r.level),
    ),
  ];
  if (!levels.length) return null;
  const roofLevel = context.roof?.level;
  const cost = (ev: HouseEvaluation) =>
    ev.ok ? 0 : ev.rejections.reduce((sum, r) => sum + Math.max(r.messages.length, 1), 0);
  let best = { bands: given, attempt, evaluation, cost: cost(evaluation) };
  const added: string[] = [];
  for (const level of levels) {
    let pick: (typeof best & { label: string }) | null = null;
    for (const ends of [['front'], ['back'], ['front', 'back']] as const) {
      let trial = best.bands;
      for (const end of ends) trial = insertLanding(trial, String(level), end, prefix);
      if (trial === best.bands) continue;
      const tried = bandsAttempt(
        context,
        layoutCtx,
        bandsCtx,
        prompts,
        trial,
        attempt.call,
        roofLevel,
      );
      if (!tried.intent) continue;
      const ev = evaluate(input, context, tried.intent, generator, prompts);
      const c = cost(ev);
      if (c < (pick?.cost ?? best.cost))
        pick = {
          bands: trial,
          attempt: tried,
          evaluation: ev,
          cost: c,
          label: `tầng ${level} đầu ${ends.map((e) => (e === 'front' ? 'trước' : 'sau')).join(' + ')}`,
        };
    }
    if (pick) {
      added.push(pick.label);
      best = pick;
      if (best.evaluation.ok) break;
    }
  }
  if (!added.length) return null;
  const note = `Phòng chỉ ra được ô thang / qua phòng riêng — chương trình chèn sảnh suốt bề ngang: ${added.join(', ')}.`;
  return {
    attempt: { ...best.attempt, layoutFixes: [note, ...(best.attempt.layoutFixes ?? [])] },
    evaluation: best.evaluation,
  };
}

/** Câu nhắc phòng không có lối vào, suy thẳng trên dải (`bandAccessIssues`) — khi bộ giải / bước dựng bố cục hỏng. */
export function bandsAccessHints(
  context: PlanContext,
  layoutCtx: LayoutContext,
  bandsCtx: BandsContext,
  bands: AiHouseBands,
  prompts: AiPrompts,
): string[] {
  const programOf = new Map(layoutCtx.program.map((row) => [row.id, row]));
  const issues = bandAccessIssues({
    storeys: bands.storeys,
    widthCm: context.buildableCm.x1 - context.buildableCm.x0,
    stairToken: STAIR_TOKEN,
    stairWidthCm: bandsCtx.stair?.width ?? 0,
    typeOf: (id) => typeOfId(id, layoutCtx.program, layoutCtx.spec),
    minSideCm: bandsCtx.minSideCm,
    through: bandsCtx.through,
    stairOpensTo: bandsCtx.stairOpensTo,
    parentOf: (id) => programOf.get(id)?.parent ?? null,
    servedFrom: bandsCtx.servedFrom,
    noDoor: bandsCtx.noDoor,
    entryRooms: [bands.entry_room, bands.garage_room].filter((id): id is string => !!id),
  });
  return issues.flatMap((issue) =>
    hintsFor(
      [
        {
          code: 'band_no_access',
          level: 'blocking',
          message: 'band_no_access',
          params: {
            level: issue.level,
            room: issue.room,
            neighbours: issue.neighbours.length ? issue.neighbours.join(', ') : 'nothing',
          },
        },
      ],
      prompts,
    ),
  );
}

/** Bỏ tầng «roof» khỏi bộ dải — mái do chương trình dựng từ tầng trên cùng (`buildRoof`). */
export function withoutRoof(bands: AiHouseBands): AiHouseBands {
  return bands.storeys.some((storey) => storey.level === 'roof')
    ? { ...bands, storeys: bands.storeys.filter((storey) => storey.level !== 'roof') }
    : bands;
}

/** Hai tầng ép mốc thang đã nói trong một dòng — dòng «dải trước thang» của chính hai tầng ấy là cùng chuyện. */
function withoutClashEcho<
  T extends { code: string; level: number; clash?: { front: number; back: number } },
>(issues: readonly T[]): T[] {
  const levels = new Set(
    issues.flatMap((issue) => (issue.clash ? [issue.clash.front, issue.clash.back] : [])),
  );
  return issues.filter(
    (issue) => issue.code !== 'band_before_stair_too_deep' || !levels.has(issue.level),
  );
}

/** Bộ giải dải của ngữ cảnh: dải → bố cục + cây từng tầng (dùng chung cho câu trả lời và cho tầng dựng lại). */
function bandsSolver(
  context: PlanContext,
  layoutCtx: LayoutContext,
  bandsCtx: BandsContext,
  roofLevel?: number,
): (trial: AiHouseBands) => ReturnType<typeof bandsToLayout> {
  return (trial) =>
    bandsToLayout({
      bands: trial,
      footprintCm: context.buildableCm,
      program: layoutCtx.program,
      spec: layoutCtx.spec,
      stair: bandsCtx.stair,
      minSideCm: bandsCtx.minSideCm,
      usualM2: bandsCtx.usualM2,
      normMinM2: bandsCtx.normMinM2,
      through: bandsCtx.through,
      noDoor: bandsCtx.noDoor,
      ...(bandsCtx.stairOpensTo ? { stairOpensTo: bandsCtx.stairOpensTo } : {}),
      ...(bandsCtx.servedFrom ? { servedFrom: bandsCtx.servedFrom } : {}),
      ...(bandsCtx.altarBackSide ? { altarBackSide: bandsCtx.altarBackSide } : {}),
      areaFree: bandsCtx.areaFree,
      walls: bandsCtx.walls,
      ...(bandsCtx.corridorClearCm ? { corridorClearCm: bandsCtx.corridorClearCm } : {}),
      doorWallCm: bandsCtx.doorWallCm,
      ...(bandsCtx.corridorPassCm ? { corridorPassCm: bandsCtx.corridorPassCm } : {}),
      ...(roofLevel ? { roofLevel } : {}),
      stairParams: bandsCtx.stairParams,
      openTypes: bandsCtx.openTypes,
      ...(bandsCtx.underStairCm ? { underStairCm: bandsCtx.underStairCm } : {}),
      // Nhà ống: WC / giặt tầng trên không đè phòng ở tầng dưới — CHẶN (Haan, handoff sửa lỗi đợt 3 mục 3.2).
      ...(bandsCtx.profile === 'ong' ? { wetForbiddenBelow: WET_FORBIDDEN_BELOW } : {}),
      // «Lấy sáng» trong hai ưu tiên đầu: phòng ở phải có mặt thoáng — CHẶN (đợt 3 mục 3.3).
      ...(layoutCtx.ruleFacts.lightFirst
        ? {
            windowRequired: {
              types: WINDOW_REQUIRED_TYPES,
              openSides: new Set(
                context.openFaces
                  .map((face) => FACE_SIDE[face as keyof typeof FACE_SIDE])
                  .filter(Boolean),
              ),
              // Nhà ống: phòng ngủ thứ hai trở đi trên một tầng chỉ trừ điểm (Haan 07/10/2026, T116 tiếp 17).
              ...(bandsCtx.profile === 'ong' ? { mainBedroomOnly: true } : {}),
            },
          }
        : {}),
    });
}

/** Loại phòng tầng dưới mà WC / giặt tầng trên không được đè (Haan: khách / ăn / ngủ / thờ / bếp). */
const WET_FORBIDDEN_BELOW: ReadonlySet<string> = new Set([
  'living',
  'dining',
  'bedroom',
  'master_bedroom',
  'altar_room',
  'kitchen',
]);
/** Phòng ở phải có mặt thoáng khi gia chủ ưu tiên lấy sáng (handoff đợt 3: ngủ / làm việc / thờ). */
const WINDOW_REQUIRED_TYPES: ReadonlySet<string> = new Set([
  'bedroom',
  'master_bedroom',
  'study',
  'altar_room',
]);
const FACE_SIDE = { front: 'y0', back: 'y1', left: 'x0', right: 'x1' } as const;

/** Dải đã gộp → bộ giải → ý định (tách khỏi lời gọi để phát lại và phép thử dùng chung). */
export function bandsAttempt(
  context: PlanContext,
  layoutCtx: LayoutContext,
  bandsCtx: BandsContext,
  prompts: AiPrompts,
  given: AiHouseBands,
  record: PlanCallRecord,
  roofLevel?: number,
): HouseAttempt {
  const solve = bandsSolver(context, layoutCtx, bandsCtx, roofLevel);
  // Mái do chương trình dựng (`buildRoof`, handoff sửa lỗi đợt 2 mục 2): tầng «roof» mô hình gửi bị bỏ. Giếng trời do
  // chương trình giữ như ô thang (đợt 3 mục 2).
  const corridorPrefix =
    Object.entries(layoutCtx.spec.modelAdded).find(([, type]) => type === 'circulation')?.[0] ??
    null;
  const pinned = pinLightWell(
    withoutRoof(given),
    (id) => typeOfId(id, layoutCtx.program, layoutCtx.spec),
    STAIR_TOKEN,
    corridorPrefix,
  );
  const landed = addStairLandings(pinned.bands, solve, layoutCtx.spec);
  const bands = landed.bands;
  const solved = pinned.notes.length
    ? { ...landed.solved, fixes: [...pinned.notes, ...landed.solved.fixes] }
    : landed.solved;
  const storeyName = (level: number) => (level === roofLevel ? 'roof' : `storey ${level}`);
  const bandsLine = (depths: readonly { rooms: string[]; cm: number }[]) =>
    depths.map((band, i) => `B${i + 1} [${band.rooms.join(', ')}] ${band.cm * 10} mm`).join(' · ');
  if (!solved.layout) {
    // Lỗi cấu trúc của bộ giải: câu nhắc có số; vòng sau SỬA bộ dải này (`bandsBase` → `retryPlan`).
    return {
      intent: null,
      bandsBase: bands,
      // Một tầng vừa «dải trước thang quá sâu» vừa «các dải quá sâu» là cùng một chuyện — chỉ gửi dòng đầu (bớt token).
      issues: withoutClashEcho(solved.issues)
        .filter(
          (issue) =>
            issue.code !== 'band_too_deep' ||
            !solved.issues.some(
              (other) => other.code === 'band_before_stair_too_deep' && other.level === issue.level,
            ),
        )
        .flatMap((issue) =>
          hintsFor(
            [
              {
                code: issue.code,
                level: 'blocking',
                message: issue.message,
                params: {
                  level: issue.level,
                  rooms: issue.rooms.join('", "'),
                  short_mm: (issue.shortCm ?? 0) * 10,
                  ...issue.params,
                  // Chiều sâu tối thiểu từng dải (lượt thật 03718834) — để mô hình thấy dải nào ngốn chỗ.
                  bands_mm: issue.clash
                    ? ` Minimum depth of each band, front to back: ${storeyName(issue.clash.front)}: ${bandsLine(issue.bandDepths ?? [])}; ${storeyName(issue.clash.back)}: ${bandsLine(issue.clash.backDepths)}.`
                    : issue.bandDepths?.length
                      ? ` Minimum depth of each band, front to back: ${bandsLine(issue.bandDepths)}.`
                      : '',
                  ...(issue.clash
                    ? {
                        front_storey: storeyName(issue.clash.front),
                        back_storey: storeyName(issue.clash.back),
                        fix_storey: storeyName(issue.level),
                        fix_how: issue.clash.blameBack
                          ? 'put rooms behind THANG beside it or in front of it'
                          : 'put rooms in front of THANG beside it or behind it',
                      }
                    : {}),
                },
              },
            ],
            prompts,
          ),
        )
        // Mọi lỗi một lần (handoff sửa lỗi đợt 2 mục 1.1): phòng không có lối vào thấy được ngay trên dải.
        .concat(bandsAccessHints(context, layoutCtx, bandsCtx, bands, prompts)),
      call: record,
    };
  }
  const converted = layoutToIntent(solved.layout, {
    block: context.blockMm,
    program: layoutCtx.program,
    spec: layoutCtx.spec,
    cellMm: context.knowledge.sketch_grid.cell_m * 1000,
    wallM: context.layoutWallM,
    cantileverFaces: layoutCtx.cantileverFaces,
    parentTypes: new Set(context.knowledge.ensuite_parent_types),
    levels: context.levels,
    ...(roofLevel ? { roofLevel } : {}),
  });
  return {
    intent: {
      ...converted.intent,
      bands,
      band_trees: Object.fromEntries(
        [...solved.trees].map(([level, tree]) => [String(level), tree]),
      ),
    },
    issues: [],
    call: record,
    layoutHints: converted.issues.flatMap((issue) =>
      hintsFor(
        [{ code: issue.code, level: 'finding', message: issue.message, params: issue.params }],
        prompts,
        issue.level ? `Storey ${issue.level}: ` : '',
      ),
    ),
    layoutFixes: [...solved.fixes, ...converted.fixes],
  };
}

const BAND_DEPTH_CODES = new Set([
  'band_too_deep',
  'band_before_stair_too_deep',
  'band_stair_clash',
]);
/** Lỗi của bước dựng bố cục sau bộ giải (lối vào thang, giếng trời thông tầng) — không phải lỗi hình học dải. */
const LAYOUT_CHECK_CODES = new Set([
  'stair_entry_long_side',
  'stair_end_blocked',
  'light_well_not_stacked',
  'wet_over_living',
  'habitable_no_window',
]);
/** Lỗi kiểm bố cục ở tầng khác cho phép giữ tầng 1 dựng lại khi bố cục chưa dựng được (lượt thật 41ffe1e5). */
const PARTIAL_OK_CODES = new Set([
  'stair_entry_long_side',
  'stair_end_blocked',
  'light_well_not_stacked',
]);
/** Lỗi bề ngang của dải tầng 1 — bộ dựng lại bỏ bề ngang mô hình ghi nên gỡ được cả loại này. */
const BAND_WIDTH_CODES = new Set(['band_cell_too_narrow', 'band_too_wide']);

/**
 * Cổng danh mục phòng (T41) chạy thẳng trên DẢI khi bộ giải không dựng nổi — chưa có ý định để kiểm. Lượt thật
 * 822e699d: tầng 2 thiếu WC chung có từ lời gọi 1, nhưng lỗi chiều sâu che nó; mô hình chỉ biết khi hình học đã vừa (lời
 * gọi 2), rồi tới hết lượt vẫn chưa sửa. Cùng chuỗi bước với `evaluateHouse` (gộp lõi thang, gộp tiện ích vào phòng ngủ,
 * nâng diện tích lên sàn đầu bài); diện tích mỗi phòng lấy mức đầu bài / định mức — chỉ để soát loại và số phòng.
 */
export function bandsProgramIssues(
  input: Pick<PlanContextInput, 'fidelity' | 'labels'>,
  context: PlanContext,
  bands: AiHouseBands,
): string[] {
  const layoutCtx = context.layout;
  const bandsCtx = context.bands;
  if (!layoutCtx || !bandsCtx) return [];
  const programOf = new Map(layoutCtx.program.map((row) => [row.id, row]));
  const spaces: AiSpaceProgramProposal['spaces'] = [];
  const seen = new Set<string>();
  const add = (id: string, type: string, level: number) => {
    const row = programOf.get(id);
    spaces.push({
      id,
      type,
      level,
      target_area_m2: row?.min_m2 ?? bandsCtx.normMinM2(type),
      ensuite_of: row?.parent ?? null,
      why: null,
    });
  };
  // Như `layoutToIntent`: phòng mái không vào danh mục tầng; ô thang là phòng `stair` của từng tầng; ban công đua là
  // phòng của tầng phòng mẹ. Mã trùng giữa các tầng (hộp kỹ thuật, hành lang) mang hậu tố tầng như `bandsToLayout`.
  const levelOf = new Map<string, number>();
  for (const storey of bands.storeys) {
    if (storey.level === 'roof') continue;
    const level = Number(storey.level);
    if (!Number.isInteger(level) || level < 1) continue;
    for (const band of storey.bands) {
      for (const cell of band.cells) {
        for (const raw of cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id]) {
          if (!raw || raw === OPEN_CELL) continue;
          if (raw === STAIR_TOKEN) {
            if (!seen.has(bandStairId(level))) add(bandStairId(level), 'stair', level);
            seen.add(bandStairId(level));
            continue;
          }
          const id = seen.has(raw) ? `${raw}_t${level}` : raw;
          if (seen.has(id)) continue;
          seen.add(id);
          levelOf.set(raw, level);
          const type = programOf.get(raw)?.type ?? typeOfId(raw, layoutCtx.program, layoutCtx.spec);
          if (type) add(id, type, level);
        }
      }
    }
  }
  for (const c of bands.cantilevers) {
    const level = levelOf.get(c.from_room);
    const type = programOf.get(c.id)?.type ?? typeOfId(c.id, layoutCtx.program, layoutCtx.spec);
    if (c.depth > 0 && level && type === 'balcony' && !seen.has(c.id)) {
      seen.add(c.id);
      add(c.id, type, level);
    }
  }
  const proposal: AiSpaceProgramProposal = {
    schema_version: '1.0.0',
    spaces,
    rationale: bands.rationale,
    assumptions: bands.assumptions,
  };
  const stairFold = foldStairCore(proposal, input.fidelity.stairTypes);
  const folded = foldInBedroom(
    stairFold.proposal,
    input.fidelity.inBedroomTypes,
    input.fidelity.ensuiteParentTypes,
  );
  const raised = liftToBriefFloors(folded.proposal, context.knowledge, input.labels);
  return checkProposal(raised.proposal, context.knowledge, input.labels);
}

/**
 * Giếng trời thông tầng soát thẳng trên DẢI khi bộ giải không dựng nổi (cùng lý do `bandsProgramIssues`: lỗi chiều sâu
 * che lỗi này tới khi hình học vừa). Thô: tầng nào phía trên tầng có giếng trời mà không có ô giếng trời cũng không có ô
 * để trống «.» thì chắc chắn giếng bị lợp. Phép kiểm đúng chỗ (`lightWellIssues`) chạy khi bộ giải dựng được.
 */
export function bandsLightWellHints(
  context: PlanContext,
  bands: AiHouseBands,
  prompts: AiPrompts,
): string[] {
  const layoutCtx = context.layout;
  if (!layoutCtx) return [];
  const typeOf = (id: string) => typeOfId(id, layoutCtx.program, layoutCtx.spec);
  const roofLevel = context.roof?.level;
  const storeys = bands.storeys
    .map((storey) => ({
      level: storey.level === 'roof' ? (roofLevel ?? Number.NaN) : Number(storey.level),
      ids: storey.bands.flatMap((band) =>
        band.cells.flatMap((cell) => (cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id])),
      ),
    }))
    .filter((storey) => Number.isInteger(storey.level))
    .sort((a, b) => a.level - b.level);
  const lowest = storeys.findIndex((storey) =>
    storey.ids.some((id) => id && typeOf(id) === 'light_well'),
  );
  if (lowest < 0) return [];
  const well = storeys[lowest]!.ids.find((id) => id && typeOf(id) === 'light_well')!;
  const covered = storeys
    .slice(lowest + 1)
    .find(
      (storey) => !storey.ids.some((id) => id === OPEN_CELL || (id && typeOf(id) === 'light_well')),
    );
  if (!covered) return [];
  return hintsFor(
    [
      {
        code: 'light_well_not_stacked',
        level: 'blocking',
        message: 'light_well_not_stacked',
        params: { rooms: well, level: storeys[lowest]!.level, above: covered.level },
      },
    ],
    prompts,
  );
}

/**
 * Tầng 1 dựng lại thay câu trả lời của mô hình: ý định mới và kết quả cổng của nó — hoặc, khi tầng khác cũng hỏng ở bộ
 * giải, `evaluation: null` và `attempt.bandsBase` là bộ dải đã thay tầng 1 (tầng 1 khoá qua `bandsKeep`), lỗi còn lại của
 * tầng khác gửi mô hình sửa.
 */
export interface BandsRescue {
  attempt: HouseAttempt;
  evaluation: HouseEvaluation | null;
}

/**
 * Dải tầng 1 sâu hơn khối nhà hay ô tầng 1 thiếu bề ngang (mọi lỗi bộ giải thuộc hai loại ấy) → dựng lại tầng 1 từ
 * cùng các phòng (`rebuildStorey`, Haan chọn hướng (a) sau lượt thật 93d212a2) TRƯỚC khi gửi mô hình sửa. Mỗi cách
 * dựng lại đi qua chính cổng (`evaluate`): tầng 1 phải qua trọn; cách qua cả nhà thì dừng ngay, không thì lấy cách ít lỗi
 * tầng trên nhất — phần ấy là lỗi của dải tầng trên, gửi mô hình như thường, tầng 1 giữ nguyên (`settled`).
 * Chỉ tầng 1: nó đặt mốc ô thang cho mọi tầng, và là tầng chật nhất ở nhà hẹp (gara, khách, bếp, ăn, thang).
 */
export function rescueFirstStorey(
  input: PlanContextInput & HouseScoring,
  context: PlanContext,
  prompts: AiPrompts,
  generator: AiSpaceProgram['generator'],
  bands: AiHouseBands,
  record: PlanCallRecord,
  evaluate: typeof evaluateHouse = evaluateHouse,
): BandsRescue | null {
  const layoutCtx = context.layout;
  const bandsCtx = context.bands;
  if (!layoutCtx || !bandsCtx) return null;
  const roofLevel = context.roof?.level;
  const solve = bandsSolver(context, layoutCtx, bandsCtx, roofLevel);
  const solved = solve(bands);
  const fixable = (issue: (typeof solved.issues)[number]) =>
    BAND_DEPTH_CODES.has(issue.code) || (BAND_WIDTH_CODES.has(issue.code) && issue.level === 1);
  if (solved.layout || !solved.issues.length || !solved.issues.every(fixable)) return null;
  // Tầng 1 phải là một chỗ hỏng; tầng khác hỏng ở bộ giải (lượt thật 822e699d: tầng 4 cũng thừa sâu) thì tạm bỏ các tầng
  // ấy khi chấm cách dựng lại — dựng lại tầng 1 không gỡ được chúng, chúng gửi mô hình sửa với tầng 1 đã khoá.
  // Thang tầng 1 là mốc cố định (handoff sửa lỗi đợt 2 mục 3.3): cặp tầng ép mốc thang mà tầng 1 vừa khối là lỗi của tầng
  // trên — không dựng lại tầng 1 cho nó (bộ dải viết tay: dời thang tầng 1 lên trước để vừa tầng 4 thì tầng 3 hết chỗ).
  const touchesFirst = (issue: (typeof solved.issues)[number]) => issue.level === 1;
  if (!solved.issues.some(touchesFirst)) return null;
  const levelKey = (level: number) => (level === roofLevel ? 'roof' : String(level));
  const dropped = new Set(
    solved.issues
      .filter((issue) => !touchesFirst(issue))
      .map((issue) => issue.level)
      .map(levelKey),
  );
  const withoutDropped = (trial: AiHouseBands) => ({
    ...trial,
    storeys: trial.storeys.filter((s) => !dropped.has(s.level)),
  });
  const first = bands.storeys.find((storey) => storey.level === '1');
  const corridorPrefix = Object.entries(layoutCtx.spec.modelAdded).find(
    ([, type]) => type === 'circulation',
  )?.[0];
  if (!first || !corridorPrefix || !bandsCtx.corridorClearCm) return null;
  const typeOf = (id: string) => typeOfId(id, layoutCtx.program, layoutCtx.spec);
  const programOf = new Map(layoutCtx.program.map((row) => [row.id, row]));
  const footprint = context.buildableCm;
  // Lọc rẻ trước cổng — mốc: các tầng trên tự dựng KHÔNG có tầng 1 (tầng 2 làm mốc thang); số phòng không đi tới được
  // lúc ấy là lỗi vốn có của dải tầng trên. Cách dựng lại làm tầng trên tệ hơn mốc bị loại (phát lại 03718834: cách
  // «ít hỏng nhất» cắt 12 phòng tầng 2–3 khỏi ô thang — mô hình sẽ nhận một loạt lỗi nó không gây ra).
  const upperOnly = solve(
    withoutDropped({ ...bands, storeys: bands.storeys.filter((s) => s.level !== '1') }),
  );
  // So trên đúng các tầng mốc có (tầng hỏng ban đầu không có trong mốc — phát lại 822e699d: tính cả tầng 4 cho ứng viên
  // mà mốc bỏ tầng 4 thì cách tốt nhất bị loại oan).
  const baseLevels = upperOnly.layout ? [...upperOnly.trees.keys()].filter((l) => l > 1) : [];
  const upperPenalty = (result: ReturnType<typeof bandsToLayout>) =>
    baseLevels
      .filter((level) => result.trees.has(level))
      .reduce((sum, level) => sum + unreachable(result, level, typeOf, bandsCtx.noDoor), 0);
  const baseline = upperOnly.layout ? upperPenalty(upperOnly) : 0;
  const state: {
    found: {
      attempt: HouseAttempt | null;
      evaluation: HouseEvaluation | null;
      penalty: number;
      full: AiHouseBands;
      partial: boolean;
    } | null;
  } = { found: null };
  const rebuilt = rebuildStorey({
    storey: first,
    typeOf,
    needM2: (id) => {
      const type = typeOf(id);
      if (!type || bandsCtx.areaFree.has(type)) return 0;
      return programOf.get(id)?.min_m2 ?? bandsCtx.normMinM2(type);
    },
    minSideCm: bandsCtx.minSideCm,
    stair: bandsCtx.stair,
    stairToken: STAIR_TOKEN,
    widthCm: footprint.x1 - footprint.x0,
    depthCm: footprint.y1 - footprint.y0,
    wallCm: Math.ceil(bandsCtx.walls.exterior + bandsCtx.walls.partition / 2),
    corridorClearCm: bandsCtx.corridorClearCm,
    corridorId: `${corridorPrefix}_r1`,
    entryRoom: bands.entry_room || null,
    stairWindow: upperStairWindow(bands, layoutCtx, bandsCtx, footprint, typeOf),
    attempt: (storey) => {
      const full = {
        ...bands,
        storeys: bands.storeys.map((s) => (s.level === storey.level ? storey : s)),
      };
      // Ghép cả nhà: tầng 1 không còn lỗi nào (kể cả lỗi chung mốc thang với tầng trên); tầng còn hỏng ở bộ giải thì tạm
      // bỏ khi chấm cổng.
      const fullResult = solve(full);
      if (fullResult.issues.some((issue) => issue.level === 1)) return null;
      // Không được GÂY THÊM lỗi bộ giải ở tầng khác (thang tầng 1 đổi chỗ thì hành lang cạnh thang tầng trên mất chỗ):
      // mỗi tầng còn hỏng phải vốn đã hỏng, và không nhiều lỗi hơn ban đầu.
      const countBy = (issues: readonly { level: number }[]) => {
        const map = new Map<number, number>();
        for (const issue of issues) map.set(issue.level, (map.get(issue.level) ?? 0) + 1);
        return map;
      };
      // Chỉ so lỗi HÌNH HỌC của bộ giải: lỗi lối vào thang / giếng trời chỉ lộ ra khi bộ giải dựng được, nên bản gốc
      // (hỏng ở bộ giải) chưa từng có — chúng là lỗi của dải tầng ấy, gửi mô hình như thường.
      const geometric = (issue: { code: string }) => !LAYOUT_CHECK_CODES.has(issue.code);
      // Lỗi hai tầng ép mốc thang gắn vào tầng lệch — tầng ấy đổi theo cách dựng lại, nên đếm chung cả nhà, không theo tầng.
      // «Hai tầng ép mốc thang» và «dải trước thang quá sâu» cùng nói về vị trí thang chung: tầng 1 tự thừa sâu thì là dòng
      // sau, dựng lại xong mà tầng trên còn lệch thì thành dòng trước — không phải lỗi mới.
      const stairCodes = new Set(['band_stair_clash', 'band_before_stair_too_deep']);
      const perLevel = (issues: typeof solved.issues) =>
        withoutClashEcho(issues).filter((issue) => geometric(issue) && !stairCodes.has(issue.code));
      const stairProblem = (issues: typeof solved.issues) =>
        issues.some((issue) => stairCodes.has(issue.code));
      if (stairProblem(fullResult.issues) && !stairProblem(solved.issues)) return null;
      const before = countBy(perLevel(solved.issues));
      for (const [level, n] of countBy(perLevel(fullResult.issues)))
        if (n > (before.get(level) ?? 0)) return null;
      const drop = new Set(fullResult.issues.map((issue) => levelKey(issue.level)));
      const trial = {
        ...full,
        storeys: full.storeys.filter((s) => !drop.has(s.level)),
      };
      const result = drop.size ? solve(trial) : fullResult;
      if (!result.layout) {
        // Tầng 1 dựng xong, chỉ còn lỗi kiểm bố cục ở tầng KHÁC (lượt thật 41ffe1e5: tầng 4 mô hình ghi che giếng trời
        // tầng 2–3) — lỗi của dải tầng ấy: giữ tầng 1, gửi mô hình sửa tầng kia.
        const others = result.issues.filter((issue) => issue.level !== 1);
        if (!others.length || others.length < result.issues.length) return null;
        // Chỉ lỗi thang / giếng trời: tầng 1 chưa qua cổng (bố cục chưa dựng) — WC đè phòng ở / phòng không mặt thoáng ở
        // tầng khác không đủ cớ nhận tầng 1 dựng lại mà cổng chưa xét (phát lại 93d212a2).
        if (!others.every((issue) => PARTIAL_OK_CODES.has(issue.code))) return null;
        const penalty = (fullResult.issues.length + others.length) * 1000;
        if (!state.found || penalty < state.found.penalty)
          state.found = { attempt: null, evaluation: null, penalty, full, partial: true };
        return penalty;
      }
      const entry = bands.entry_room ? rectOf(result, bands.entry_room) : null;
      if (bands.entry_room && (!entry || entry[1] !== footprint.y0 * 10)) return null;
      if (unreachable(result, 1, typeOf, bandsCtx.noDoor) > 0) return null;
      if (upperPenalty(result) > baseline) return null;
      // Cổng thật: tầng 1 phải qua trọn.
      const attempt = bandsAttempt(context, layoutCtx, bandsCtx, prompts, trial, record, roofLevel);
      if (!attempt.intent) return null;
      const evaluation = evaluate(input, context, attempt.intent, generator, prompts);
      // Mỗi tầng còn hỏng ở bộ giải nặng hơn mọi lỗi cổng.
      let penalty = fullResult.issues.length * 1000;
      if (!evaluation.ok) {
        if (evaluation.rejections.some((rejection) => rejection.level === 1)) return null;
        // Tầng tạm bỏ thiếu thì cổng báo thiếu phòng cả nhà (tầng 0) — không tính khi đang bỏ tầng.
        penalty += evaluation.rejections
          .filter((r) => !drop.size || (r.level > 0 && !drop.has(levelKey(r.level))))
          .reduce((sum, r) => sum + Math.max(r.messages.length, 1), 0);
      }
      if (!state.found || penalty < state.found.penalty)
        state.found = { attempt, evaluation, penalty, full, partial: drop.size > 0 };
      return penalty;
    },
  });
  const best = state.found;
  if (!rebuilt || !best) return null;
  const note = `Tầng 1: dải mô hình ghi không vừa khối nhà — chương trình dựng lại tầng 1 từ cùng các phòng, trước ra sau: ${rebuilt.bands
    .map((ids) => `[${ids.join(' | ')}]`)
    .join(' ')}.`;
  if (!best.partial && best.attempt) {
    return {
      attempt: { ...best.attempt, layoutFixes: [note, ...(best.attempt.layoutFixes ?? [])] },
      evaluation: best.evaluation,
    };
  }
  // Có tầng tạm bỏ: cả bộ dải (tầng 1 dựng lại + tầng hỏng nguyên bản) qua bộ giải lại, lỗi tầng ấy đi mô hình.
  const whole = bandsAttempt(context, layoutCtx, bandsCtx, prompts, best.full, record, roofLevel);
  if (whole.intent) {
    return {
      attempt: { ...whole, layoutFixes: [note, ...(whole.layoutFixes ?? [])] },
      evaluation: evaluate(input, context, whole.intent, generator, prompts),
    };
  }
  const kept = hintsFor(
    [
      {
        code: 'revision_kept',
        level: 'blocking',
        message: 'revision_kept',
        params: { levels: '1' },
      },
    ],
    prompts,
  );
  return {
    attempt: {
      ...whole,
      issues: [...whole.issues, ...kept],
      bandsKeep: [1],
      layoutFixes: [note],
    },
    evaluation: null,
  };
}

/**
 * Ước khoảng mép trước ô thang mà các tầng trên chịu được (cm): `lo` = phần trước thang sâu nhất, `hi` = chiều sâu khối
 * trừ dải thang và phần sau thang sâu nhất — đo bằng `bandMinDepth` trên dải mô hình ghi (ô xếp chồng tính một ô, diện tích
 * cộng). Chỉ để XẾP THỨ TỰ cách dựng lại tầng 1; bộ giải vẫn là nơi kiểm.
 */
function upperStairWindow(
  bands: AiHouseBands,
  layoutCtx: LayoutContext,
  bandsCtx: BandsContext,
  footprint: Rect,
  typeOf: (id: string) => string | null,
): { lo: number; hi: number } | null {
  const programOf = new Map(layoutCtx.program.map((row) => [row.id, row]));
  const width = footprint.x1 - footprint.x0;
  const depth = footprint.y1 - footprint.y0;
  const wall = Math.ceil(bandsCtx.walls.exterior + bandsCtx.walls.partition / 2);
  const area = (id: string) => {
    const type = typeOf(id);
    if (!type || bandsCtx.areaFree.has(type)) return 0;
    return (programOf.get(id)?.min_m2 ?? bandsCtx.normMinM2(type)) * 1e4;
  };
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (const storey of bands.storeys) {
    if (storey.level === '1' || storey.level === 'roof') continue;
    const depths = storey.bands.map((band) =>
      bandMinDepth(
        band.cells.map((cell) => {
          const ids = cell.stack.length ? cell.stack.map((s) => s.id) : [cell.id];
          if (ids.includes(STAIR_TOKEN) && bandsCtx.stair)
            return {
              id: STAIR_TOKEN,
              side: bandsCtx.stair.length,
              w: bandsCtx.stair.width,
              area: 0,
            };
          const real = ids.filter((id) => id && id !== OPEN_CELL);
          return {
            id: real.join('/'),
            side: Math.max(0, ...real.map((id) => bandsCtx.minSideCm(typeOf(id) ?? ''))),
            w: cell.w > 0 ? Math.round(cell.w / 10) : 0,
            area: real.reduce((sum, id) => sum + area(id), 0),
          };
        }),
        width,
        wall,
        10,
        depth * 3,
      ),
    );
    const at = storey.bands.findIndex((band) =>
      band.cells.some(
        (cell) => cell.id === STAIR_TOKEN || cell.stack.some((s) => s.id === STAIR_TOKEN),
      ),
    );
    if (at < 0 || depths.some((d) => !Number.isFinite(d))) continue;
    lo = Math.max(
      lo,
      depths.slice(0, at).reduce((sum, d) => sum + d, 0),
    );
    hi = Math.min(hi, depth - depths[at]! - depths.slice(at + 1).reduce((sum, d) => sum + d, 0));
  }
  return Number.isFinite(hi) ? { lo, hi } : null;
}

/** Chữ nhật (mm, [x, y, rộng, sâu]) của một phòng tầng 1 trong bố cục bộ giải. */
function rectOf(solved: ReturnType<typeof bandsToLayout>, id: string): number[] | null {
  return solved.layout?.rooms.find((room) => room.id === id && room.level === '1')?.rect ?? null;
}

/**
 * Số phòng của tầng (trừ loại không cần cửa) KHÔNG đi tới được qua các cửa bộ chọn cửa đã đặt: tầng 1 từ ngoài nhà,
 * tầng trên từ ô thang của tầng ấy.
 */
function unreachable(
  solved: ReturnType<typeof bandsToLayout>,
  level: number,
  typeOf: (id: string) => string | null,
  noDoor: ReadonlySet<string>,
): number {
  const tree = solved.trees.get(level);
  if (!tree || !solved.layout) return Number.POSITIVE_INFINITY;
  const rooms = solved.layout.rooms
    .filter((room) => room.level === String(level))
    .map((room) => room.id)
    .filter((id) => !noDoor.has(typeOf(id) ?? ''));
  const seen = new Set([level === 1 ? 'outside' : bandStairId(level)]);
  for (let grew = true; grew;) {
    grew = false;
    for (const door of tree.doors) {
      if (seen.has(door.a) !== seen.has(door.b)) {
        seen.add(door.a);
        seen.add(door.b);
        grew = true;
      }
    }
  }
  return rooms.filter((id) => !seen.has(id)).length;
}

/**
 * `doors_prefer` chỉ là GỢI Ý cửa: cặp mang mã sai khuôn (vd «THANG» — chỉ dùng được trong ô dải) bị bỏ, không làm cả
 * câu trả lời hỏng hợp đồng. Lượt thật 619f0438 (05/10/2026, GPT-5.6 Sol): một cặp `["THANG", "ac_yard"]` làm mất trọn
 * lời gọi đầu (0,178 USD) và buộc mô hình vẽ lại từ đầu.
 */
export function dropBadDoorPairs(json: unknown): unknown {
  if (
    !json ||
    typeof json !== 'object' ||
    !Array.isArray((json as { doors_prefer?: unknown }).doors_prefer)
  )
    return json;
  const ok = (id: unknown) => typeof id === 'string' && /^[a-z0-9_.]+$/.test(id);
  const pairs = (json as { doors_prefer: unknown[] }).doors_prefer.filter(
    (pair) => Array.isArray(pair) && pair.length === 2 && ok(pair[0]) && ok(pair[1]),
  );
  return { ...json, doors_prefer: pairs };
}

async function callLayoutModel(call: HouseCallInput): Promise<HouseAttempt> {
  const context = call.context;
  const layoutCtx = context.layout!;
  const prompts = promptsFor(context, call.prompts);
  const floor = prompts.floorLevel;
  const retrying = (call.avoid?.length ?? 0) > 0;
  const roofLevel = context.roof?.level;
  const base =
    retrying && call.previous ? layoutView(call.previous, context.blockMm, roofLevel) : null;
  const retry = !retrying
    ? null
    : base
      ? floor.revise
          .replace('{avoid}', () => (call.avoid ?? []).join('\n'))
          .replace('{intent}', () => JSON.stringify(base))
      : floor.resample.replace('{avoid}', () => (call.avoid ?? []).join('\n'));
  const prompt = layoutPrompt(context, call.prompts, context.promptFlags);
  const result = await call.client.complete(call.route, AI_DIGEST_DATA_CLASS, {
    system: houseSystem(floor.system, context.promptFlags),
    prompt,
    ...(retry ? { promptTail: retry } : {}),
    cacheKey: cacheKeyOf(prompt),
    schema: base ? houseLayoutDeltaJsonSchema() : context.schema,
    ...(call.reasoningEffort ? { reasoningEffort: call.reasoningEffort } : {}),
    ...(call.onProgress ? { onProgress: call.onProgress } : {}),
    ...(call.signal ? { signal: call.signal } : {}),
  });
  const record = callRecord(result);
  const candidate = clampText(normaliseLayoutIds(result.json), HOUSE_TEXT_LIMITS).json;
  let layout: AiHouseLayout;
  if (base) {
    const parsed = aiHouseLayoutDeltaSchema.safeParse(candidate);
    if (!parsed.success) {
      return { intent: null, issues: describeZod(parsed.error, candidate), call: record };
    }
    // Tầng đã qua (T86) bất khả xâm phạm: bỏ phần delta đụng phòng của các tầng ấy.
    const locked = new Set((call.keep ?? []).map(String));
    const lockedIds = new Set(base.rooms.filter((r) => locked.has(r.level)).map((r) => r.id));
    const delta = {
      ...parsed.data,
      rooms_upsert: parsed.data.rooms_upsert.filter(
        (r) => !locked.has(r.level) && !lockedIds.has(r.id),
      ),
      rooms_delete: parsed.data.rooms_delete.filter((id) => !lockedIds.has(id)),
    };
    layout = mergeLayoutDelta(base, delta);
  } else {
    const parsed = aiHouseLayoutSchema.safeParse(candidate);
    if (!parsed.success) {
      return { intent: null, issues: describeZod(parsed.error, candidate), call: record };
    }
    layout = parsed.data;
  }
  const converted = layoutToIntent(layout, {
    block: context.blockMm,
    program: layoutCtx.program,
    spec: layoutCtx.spec,
    cellMm: context.knowledge.sketch_grid.cell_m * 1000,
    wallM: context.layoutWallM,
    cantileverFaces: layoutCtx.cantileverFaces,
    parentTypes: new Set(context.knowledge.ensuite_parent_types),
    levels: context.levels,
    ...(roofLevel ? { roofLevel } : {}),
  });
  return {
    intent: converted.intent,
    issues: [],
    call: record,
    layoutHints: converted.issues.flatMap((issue) =>
      hintsFor(
        [{ code: issue.code, level: 'finding', message: issue.message, params: issue.params }],
        prompts,
        issue.level ? `Storey ${issue.level}: ` : '',
      ),
    ),
    layoutFixes: converted.fixes,
  };
}

/**
 * Lượt sửa chỉ trả về các tầng có lỗi (tiết kiệm token RA — phần đắt nhất của một lượt sửa, Haan
 * 25/09/2026): tầng nào câu trả lời không nhắc tới (không phòng, không bản phác) thì lấy nguyên từ ý định
 * trước — phòng, quan hệ giữa các phòng ấy, bản phác. Câu trả lời đủ mọi tầng thì không đổi gì.
 */
export function mergeRevision(
  previous: HouseIntent,
  answer: HouseIntent,
  /** Tầng đã qua (`settledLevels`, T86): phần mô hình vẽ lại cho các tầng này bị bỏ, giữ bản cũ. */
  keep: readonly number[] = [],
): HouseIntent {
  const locked = new Set(keep);
  // Câu trả lời chỉ còn phần của tầng chưa khoá — vẽ lại tầng đã qua là việc lời dẫn đã dặn đừng làm.
  const own = {
    rooms: answer.rooms.filter((room) => !locked.has(room.level)),
    sketches: (answer.sketches ?? []).filter((sketch) => !locked.has(sketch.level)),
  };
  const answered = new Set<number>([
    ...own.rooms.map((room) => room.level),
    ...own.sketches.map((sketch) => sketch.level),
  ]);
  const kept = previous.rooms.filter((room) => !answered.has(room.level));
  // Mái (lược đồ hình chữ nhật): câu trả lời không khai lại thì giữ mái của ý định trước.
  const roof = answer.roof ?? previous.roof;
  if (!kept.length) return roof ? { ...answer, roof } : answer;
  const keptIds = new Set(kept.map((room) => room.id));
  // Mã phòng của tầng giữ là bất khả xâm phạm (T97): phòng mới của tầng đang sửa mà trùng mã thì đổi
  // sang mã trống — đổi cả trong bản phác và quan hệ của câu trả lời. Lượt thật 5584bf0d (28/09/2026):
  // hành lang mới của tầng 2 tên `circulation_1`, trùng hành lang tầng 1; gộp theo mã thì hành lang tầng
  // 1 mất, bốn phòng quanh nó thành «không có lối vào» — ở tầng chương trình vừa nói «giữ nguyên».
  {
    const clashing = own.rooms.filter((room) => keptIds.has(room.id));
    if (clashing.length) {
      const used = new Set([...keptIds, ...answer.rooms.map((room) => room.id)]);
      const idMap = new Map(answer.rooms.map((room) => [room.id, room.id]));
      for (const room of clashing) {
        let n = 1;
        while (used.has(`${room.type}_${n}`)) n += 1;
        const fresh = `${room.type}_${n}`;
        used.add(fresh);
        idMap.set(room.id, fresh);
      }
      const freed = renameHouse(answer, idMap);
      // Cửa chính / chỗ để xe của tầng giữ vẫn là phòng của tầng giữ, không đi theo mã mới.
      const anchor = (id: string | null, fresh: string | null) =>
        id !== null && keptIds.has(id) ? id : fresh;
      return mergeRevision(
        previous,
        {
          ...freed,
          entry_room: anchor(answer.entry_room, freed.entry_room),
          garage_room: anchor(answer.garage_room, freed.garage_room),
        },
        keep,
      );
    }
  }
  const ownIds = new Set(own.rooms.map((room) => room.id));
  const rooms = [...own.rooms, ...kept.filter((room) => !ownIds.has(room.id))];
  const known = new Set(rooms.map((room) => room.id));
  const relationships = [
    // Quan hệ trong tầng đã khoá lấy từ bản cũ; quan hệ mô hình khai phải chạm ít nhất một phòng mới.
    ...answer.relationships.filter(
      (rel) => known.has(rel.a) && known.has(rel.b) && !(keptIds.has(rel.a) && keptIds.has(rel.b)),
    ),
    ...previous.relationships.filter((rel) => keptIds.has(rel.a) && keptIds.has(rel.b)),
  ];
  const sketches = [
    ...own.sketches,
    ...(previous.sketches ?? []).filter((sketch) => !answered.has(sketch.level)),
  ].sort((p, q) => p.level - q.level);
  return { ...answer, rooms, relationships, sketches, ...(roof ? { roof } : {}) };
}

/**
 * Tầng lượt sửa GIỮ NGUYÊN (T86, lượt thật dc949b49: năm câu trả lời sửa đều vẽ lại cả hai tầng, tầng
 * đã qua bị vẽ lại rồi hỏng lại, tầng hỏng đổi qua lại 1 → 2 → 1 → 2). Chỉ tầng nằm DƯỚI tầng hỏng thấp
 * nhất: tầng trên xếp theo mốc của tầng dưới, nên tầng dưới qua là qua thật; tầng trên tầng hỏng thì
 * xếp theo mốc của một tầng sắp đổi, chưa qua gì cả. Tầng dưới mà chương trình đã CHIA LẠI (không theo
 * bản phác) thì không giữ: câu nhắc `sketch_below_replaced` đang đòi mô hình sửa chính nó. Lỗi cả nhà
 * (tầng `0`) thì không giữ tầng nào.
 */
export function settledLevels(
  levels: readonly number[],
  rejections: readonly Pick<LevelRejection, 'level'>[],
): number[] {
  if (!rejections.length || rejections.some((rejection) => rejection.level <= 0)) return [];
  const lowest = Math.min(...rejections.map((rejection) => rejection.level));
  return levels.filter((level) => level < lowest);
}

/**
 * Tầng giữ mà chương trình đã CHIA LẠI (bản phác của mô hình hỏng): thay bản phác cũ trong ý định gửi
 * lượt sửa bằng chính cách chia thật, vẽ lại trên lưới khối nhà cùng khổ mô hình đã dùng (T86 phương án
 * 1, Haan 26/09/2026). Lượt sau tầng ấy đi theo bản phác «đúng» này, còn mô hình vẽ tầng trên theo vị trí
 * thang, thang máy, khu ướt THẬT. Ô của phòng chương trình tự thêm (không có trong ý định) nhập vào phòng
 * giao thông kề nó, vì bản phác chỉ được ghi mã phòng của ý định.
 */
export function replaceKeptSketches(
  intent: HouseIntent,
  arranged: readonly ArrangedLevel[],
  replaced: readonly { level: number }[],
  kept: readonly number[],
  block: Rect,
  /**
   * Bản phác vẽ lại có xếp lại được đúng tầng ấy không (T97). Vẽ lại lên lưới ô là phép LÀM TRÒN: lượt
   * thật 5584bf0d (28/09/2026) phòng ngủ 20 m² co còn 18 ô ≈ 15–17 m², vòng sau cổng bác chính tầng
   * chương trình vừa nói «giữ nguyên». Không qua thì giữ bản phác cũ của mô hình — bộ xếp tất định, chia
   * lại vẫn ra cùng cách chia.
   */
  verify: (level: number, rows: readonly string[]) => boolean = () => true,
): HouseIntent {
  const redraw = new Set(
    replaced.map((item) => item.level).filter((level) => kept.includes(level)),
  );
  if (!redraw.size || !intent.sketches) return intent;
  const sketches = intent.sketches.map((sketch) => {
    const done = arranged.find((item) => item.level.level === sketch.level);
    if (!redraw.has(sketch.level) || !done) return sketch;
    const tokens = sketch.rows.map((row) => row.trim().split(/\s+/).filter(Boolean));
    const cols = Math.max(...tokens.map((row) => row.length));
    const own = intent.rooms.filter((room) => room.level === sketch.level);
    const known = new Set(own.map((room) => room.id));
    const target = (id: string) => own.find((room) => room.id === id)?.target_area_m2 ?? 0;
    const rows = absorbUnknown(
      partitionRows(
        splitMerged(foldClosets(done.level.rooms, known), target),
        block,
        cols,
        tokens.length,
      ),
      known,
    );
    return verify(sketch.level, rows) ? { ...sketch, rows } : sketch;
  });
  return { ...intent, sketches };
}

/** Bản đã xếp có WC khép kín dài quá mức tách tủ đồ không (T160) — không có thì khỏi tốn một lượt xếp cả nhà. */
function longEnsuiteWc(evaluation: HouseEvaluation, construction: ConstructionNorms): boolean {
  const norms = construction.ensuite;
  if (!norms || !evaluation.ok) return false;
  const ensuite = new Set(
    evaluation.ok.program.spaces.filter((space) => space.ensuite_of).map((space) => space.id),
  );
  // Ô lưu theo LỌT LÒNG; mức khai theo tim — một vách ngăn chênh.
  const limit =
    (norms.wc_max_length_m + norms.closet_min_length_m - construction.walls.partition_m) * 100;
  return evaluation.ok.levels.some(({ level }) =>
    level.rooms.some((room) => {
      if (room.type !== 'wc' || !ensuite.has(room.id)) return false;
      const [x0, y0, x1, y1] = room.rect as number[];
      return Math.max(x1! - x0!, y1! - y0!) > limit;
    }),
  );
}

/**
 * Tủ đồ chương trình tách từ WC khép kín dài (T160, `arrange/ensuite-closet.ts`) không có trong ý định mô hình: vẽ lại
 * bản phác thì trả nó về WC mà nó tách ra (hai chữ nhật chung trọn một cạnh), không để `absorbUnknown` nhập vào phòng
 * ngủ bên cạnh — phòng ngủ lồi vào dải WC làm hỏng các vòng sau (phát lại b1543b8c vòng 5–6).
 */
function foldClosets(
  rooms: AiPlanRoomsLevel['rooms'],
  known: ReadonlySet<string>,
): AiPlanRoomsLevel['rooms'] {
  const closets = rooms.filter((room) => room.type === 'closet' && !known.has(room.id));
  if (!closets.length) return rooms;
  const out = rooms.filter((room) => !closets.includes(room));
  for (const closet of closets) {
    const [cx0, cy0, cx1, cy1] = closet.rect as number[];
    const index = out.findIndex((room) => {
      if (room.type !== 'wc') return false;
      const [x0, y0, x1, y1] = room.rect as number[];
      const sameRow = Math.abs(y0! - cy0!) <= 1 && Math.abs(y1! - cy1!) <= 1;
      const sameCol = Math.abs(x0! - cx0!) <= 1 && Math.abs(x1! - cx1!) <= 1;
      const gapX = Math.min(Math.abs(cx0! - x1!), Math.abs(x0! - cx1!));
      const gapY = Math.min(Math.abs(cy0! - y1!), Math.abs(y0! - cy1!));
      return (sameRow && gapX <= 30) || (sameCol && gapY <= 30);
    });
    if (index < 0) {
      out.push(closet);
      continue;
    }
    const wc = out[index]!;
    const [x0, y0, x1, y1] = wc.rect as number[];
    out[index] = {
      ...wc,
      rect: [Math.min(x0!, cx0!), Math.min(y0!, cy0!), Math.max(x1!, cx1!), Math.max(y1!, cy1!)],
      area_m2: wc.area_m2 + closet.area_m2,
    };
  }
  return out;
}

/**
 * Ý định cũ gửi lại ở lượt sửa — BỎ `rationale` và `assumptions`: lỗi không bao giờ nằm ở hai trường
 * chữ tự do ấy, và chúng chiếm phần lớn độ dài (T46). Mô hình vẫn viết lại chúng trong câu trả lời.
 */
function revisable(intent: HouseIntent): Omit<HouseIntent, 'rationale' | 'assumptions'> {
  const { rationale: _rationale, assumptions: _assumptions, ...rest } = intent;
  return rest;
}

/** Phần gửi lượt sửa: ý định rút gọn, câu nhắc cùng mã ngắn, và bảng đổi mã ngắn → mã thật cho câu trả lời. */
export interface RevisionView {
  intent: Omit<HouseIntent, 'rationale' | 'assumptions'>;
  avoid: string[];
  back: ReadonlyMap<string, string>;
}

/**
 * Ý định gửi lượt sửa, gọn cho token (tổng hợp 37 lượt thật 23–30/09/2026: câu lượt sửa ~17.500 ký tự, gấp
 * đôi lượt đầu, vì gửi lại CẢ NHÀ với mã dài):
 *  · tầng đã khoá (`keep`, T86) không gửi — lời dẫn đã bảo mô hình đừng trả, chương trình giữ bản cũ;
 *  · phòng của tầng gửi đi mang mã NGẮN (`master_bedroom_1` → `mb1`) cả trong ý định lẫn câu nhắc: bản phác
 *    12 × 16 ô viết mỗi mã 192 lần, ở cả chiều vào lẫn chiều ra. Mã tầng khoá giữ nguyên chữ để câu nhắc
 *    nhắc tới chúng vẫn đọc được. Câu trả lời đổi ngược bằng `back` trước khi ghép (`mergeRevision`).
 */
export function revisionView(
  previous: HouseIntent,
  avoid: readonly string[],
  keep: readonly number[] = [],
): RevisionView {
  const locked = new Set(keep);
  const sent = previous.rooms.filter((room) => !locked.has(room.level));
  const lockedIds = new Set(
    previous.rooms.filter((room) => locked.has(room.level)).map((room) => room.id),
  );
  const short = shortIds(
    sent.map((room) => ({ id: room.id, type: room.type })),
    new Set(previous.rooms.map((room) => room.id)),
  );
  const to = (id: string) => short.get(id) ?? id;
  const tokenRe = new RegExp(
    `(?<![a-z0-9_])(${[...short.keys()]
      .sort((a, b) => b.length - a.length)
      .map((id) => id.replace(/[^a-z0-9_]/g, ''))
      .join('|')})(?![a-z0-9_])`,
    'g',
  );
  const text = (line: string) => (short.size ? line.replace(tokenRe, (id) => to(id)) : line);
  const base = revisable(previous);
  return {
    intent: {
      ...base,
      rooms: sent.map((room) => ({
        ...room,
        id: to(room.id),
        ensuite_of: room.ensuite_of === null ? null : to(room.ensuite_of),
      })),
      relationships: previous.relationships
        .filter((rel) => !(lockedIds.has(rel.a) && lockedIds.has(rel.b)))
        .map((rel) => ({ ...rel, a: to(rel.a), b: to(rel.b) })),
      ...(previous.sketches
        ? {
            sketches: previous.sketches
              .filter((sketch) => !locked.has(sketch.level))
              .map((sketch) => ({
                ...sketch,
                rows: sketch.rows.map((row) => row.trim().split(/\s+/).map(to).join(' ')),
              })),
          }
        : {}),
      entry_room: base.entry_room === null ? null : to(base.entry_room),
      garage_room: base.garage_room === null ? null : to(base.garage_room),
    },
    avoid: avoid.map(text),
    back: new Map([...short].map(([long, brief]) => [brief, long])),
  };
}

/**
 * Một mã phòng khai ở HAI tầng khác nhau: bản phác và quan hệ của mỗi tầng vẫn chỉ rõ phòng nào, nên đổi mã
 * của lần khai sau sang mã trống — trong bản phác tầng ấy, phòng khép kín và quan hệ có đầu kia cùng tầng —
 * thay vì bác cả lượt. Lượt thật 46d6eff3 (01/10/2026) lời gọi 5: `co4` là hành lang mới ở cả tầng 1 lẫn
 * tầng 2, cổng danh mục bác «mã tạm bị dùng hai lần» và lượt dừng ở đó. Trùng trong cùng một tầng thì để
 * nguyên: không biết ô nào của phòng nào.
 */
export function splitClashingIds(intent: HouseIntent): HouseIntent {
  const firstLevel = new Map<string, number>();
  const used = new Set(intent.rooms.map((room) => room.id));
  const renames: { index: number; from: string; to: string; level: number }[] = [];
  intent.rooms.forEach((room, index) => {
    const seen = firstLevel.get(room.id);
    if (seen === undefined) {
      firstLevel.set(room.id, room.level);
      return;
    }
    if (seen === room.level) return;
    let n = 2;
    while (used.has(`${room.id}_${n}`)) n += 1;
    const to = `${room.id}_${n}`;
    used.add(to);
    renames.push({ index, from: room.id, to, level: room.level });
  });
  if (!renames.length) return intent;
  const levelOf = (id: string, fallback: number) =>
    intent.rooms.find((room) => room.id === id)?.level ?? fallback;
  let rooms = intent.rooms;
  let relationships = intent.relationships;
  let sketches = intent.sketches;
  for (const { index, from, to, level } of renames) {
    rooms = rooms.map((room, i) =>
      i === index
        ? { ...room, id: to }
        : room.level === level && room.ensuite_of === from
          ? { ...room, ensuite_of: to }
          : room,
    );
    relationships = relationships.map((rel) => ({
      ...rel,
      a: rel.a === from && rel.b !== from && levelOf(rel.b, -1) === level ? to : rel.a,
      b: rel.b === from && rel.a !== from && levelOf(rel.a, -1) === level ? to : rel.b,
    }));
    sketches = sketches?.map((sketch) =>
      sketch.level === level
        ? {
            ...sketch,
            rows: sketch.rows.map((row) =>
              row
                .trim()
                .split(/\s+/)
                .map((token) => (token === from ? to : token))
                .join(' '),
            ),
          }
        : sketch,
    );
  }
  return { ...intent, rooms, relationships, ...(sketches ? { sketches } : {}) };
}

/** Câu trả lời lượt sửa về lại mã thật; mã mô hình tự đặt mới giữ nguyên. */
export function fromRevisionIds(
  answer: HouseIntent,
  back: ReadonlyMap<string, string>,
): HouseIntent {
  if (!back.size) return answer;
  const ids = new Set<string>([
    ...answer.rooms.map((room) => room.id),
    ...(answer.sketches ?? []).flatMap((sketch) =>
      sketch.rows.flatMap((row) => row.trim().split(/\s+/)),
    ),
    ...answer.relationships.flatMap((rel) => [rel.a, rel.b]),
    // Cửa chính / chỗ để xe thường ở tầng 1 đã khoá, không nằm trong phòng câu trả lời: thiếu ở đây thì
    // `renameHouse` đổi chúng thành null (lượt thật 46d6eff3, 01/10/2026 — mất cửa chính từ lời gọi 2, lời
    // gọi 5 bị bắt vẽ lại tầng 1 đã qua).
    ...[answer.entry_room, answer.garage_room].filter((id): id is string => id !== null),
  ]);
  const map = new Map([...ids].map((id) => [id, back.get(id) ?? id]));
  for (const [brief, long] of back) map.set(brief, long);
  return renameHouse(answer, map);
}

/**
 * Gốc mã ngắn của các loại hay gặp — đọc ra được loại (`st` là thang, không phải phòng làm việc). Loại khác:
 * chữ đầu mỗi phần (`altar_room` → `ar`) hoặc hai chữ đầu, dài thêm tới khi không trùng gốc loại khác.
 */
const SHORT_STEMS: Readonly<Record<string, string>> = {
  stair: 'st',
  elevator: 'el',
  circulation: 'co',
  bedroom: 'bd',
  master_bedroom: 'mb',
  study: 'sd',
  storage: 'sg',
  balcony: 'bc',
  living: 'lv',
  dining: 'dn',
  kitchen: 'kt',
  garage: 'gr',
  laundry: 'ld',
  altar_room: 'ar',
  wc: 'wc',
};

/** Mã ngắn = gốc của loại + số thứ tự của mã cũ; trùng một mã thật thì thêm chữ. */
function shortIds(
  rooms: readonly { id: string; type: string }[],
  taken: ReadonlySet<string>,
): Map<string, string> {
  const stems = new Map<string, string>();
  const stemOwner = new Map<string, string>(Object.entries(SHORT_STEMS).map(([t, v]) => [v, t]));
  const stemOf = (type: string): string => {
    const known = stems.get(type) ?? SHORT_STEMS[type];
    if (known) return known;
    const parts = type.split('_').filter(Boolean);
    const whole = parts.join('');
    const tries = [
      parts.length > 1 ? parts.map((part) => part[0]).join('') : whole.slice(0, 2),
      whole.slice(0, 3),
      whole.slice(0, 4),
      whole,
    ];
    const stem = tries.find((t) => !stemOwner.has(t) || stemOwner.get(t) === type) ?? whole;
    stemOwner.set(stem, type);
    stems.set(type, stem);
    return stem;
  };
  const out = new Map<string, string>();
  const used = new Set<string>(taken);
  for (const room of rooms) {
    const n = /_(\d+)$/.exec(room.id)?.[1] ?? '';
    let pick = `${stemOf(room.type)}${n}`;
    while (used.has(pick)) pick = `${pick}x`;
    if (pick.length >= room.id.length) continue;
    used.add(pick);
    out.set(room.id, pick);
  }
  return out;
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

/**
 * Soát BẢN PHÁC mọi tầng mà không xếp (`precheckOnly`, T92) — khi danh mục phòng sai đầu bài nên chưa xếp được tầng
 * nào (T107). Tầng trên chưa có mốc tầng dưới: chỉ lỗi của chính hình vẽ (lối vào, sàn đầu bài, chong chóng…).
 */
function precheckSketches(
  input: PlanContextInput,
  context: PlanContext,
  program: AiSpaceProgram,
  byLevel: ReadonlyMap<number, AiPlanIntent>,
  minimums: ReadonlyMap<string, number>,
  sketches: ReadonlyMap<number, readonly string[] | null>,
  prompts: AiPrompts,
): { hints: string[]; messages: string[] } {
  const hints: string[] = [];
  const messages: string[] = [];
  for (const level of context.levels) {
    const intent = byLevel.get(level);
    if (!intent) continue;
    const pre = arrangeFor(
      input,
      context,
      program,
      level,
      intent,
      null,
      minimums,
      sketches.get(level),
      true,
    );
    const revisable = pre.issues.filter((issue) => isRevisable(issue.code));
    if (!revisable.length) continue;
    hints.push(...hintsFor(revisable, prompts, `Storey ${level}: `));
    messages.push(...revisable.map((issue) => issue.message));
  }
  return { hints, messages };
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
  /** Chỉ soát bản phác, không xếp (T92) — xem `ArrangeInput.precheckOnly`. */
  precheckOnly = false,
): ArrangeResult {
  const buildingType = input.digest.building_type;
  return arrangeLevel({
    intent,
    ...(precheckOnly ? { precheckOnly } : {}),
    ...(sketch !== undefined ? { sketch } : {}),
    level,
    isTop: level === context.levels[context.levels.length - 1],
    program,
    buildableCm: context.buildableCm,
    balcony: context.demands.balcony,
    ...(input.cantilevers?.some((c) => c.level === level)
      ? { cantilevers: input.cantilevers.filter((c) => c.level === level) }
      : {}),
    construction: input.construction,
    groups: input.groups,
    mergeAllowed: context.mergeAllowed ?? input.mergeAllowed,
    openForbidden: context.demands.openPlan?.forbidden ?? null,
    // Hướng bàn thờ gia chủ khai (T106): cửa phòng thờ không mở ở vách bàn thờ dựa lưng.
    altarBackSide: altarBackSide(input.digest),
    ...(input.trimCorridors ? { trimCorridors: true } : {}),
    ...(input.widenRooms ? { widenRooms: true } : {}),
    ...(input.splitClosets ? { splitClosets: true } : {}),
    ...(input.rankSkip ? { rankSkip: input.rankSkip } : {}),
    ...(input.stairEntryAvoid ? { stairEntryAvoid: input.stairEntryAvoid } : {}),
    openFaces: context.openFaces,
    accessFaces: context.accessFaces,
    entrances: context.entrances,
    garageEntry:
      input.groups.passage?.entryRoomByBuildingType.get(buildingType)?.has('garage') === true,
    ...(input.bandTrees?.get(level) ? { bandTree: input.bandTrees.get(level)! } : {}),
    ...(input.bandTrees ? { bandsOnly: true } : {}),
    anchors,
    zoneDefaults: input.zoneDefaults,
    stairTypes: input.stairTypes,
    // Giếng thang máy: cạnh ngắn lấy từ kích thước gia chủ khai theo hãng thang (Haan 25/09/2026) —
    // cùng số mà cổng `elevator_too_narrow` bác, để bộ xếp không dựng thứ cổng không nhận.
    usableMinSideM: (type: string) =>
      context.demands.elevator && type === context.demands.elevator.type
        ? context.demands.elevator.minSideM
        : usableMinSide(input.construction, type, { cars: input.digest.parking?.cars ?? 0 }),
    usableMaxAspect: (type: string) => usableMaxAspect(input.construction, type),
    briefMinAreaM2: (id: string) => minimums.get(id) ?? null,
    ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
    ...(context.mandatory ? { mandatory: context.mandatory } : {}),
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
            houseProfile: houseProfile(input.digest).profile,
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
    // Lỗi mang số ô bản phác (`withSketchCells`) thì dùng dòng nói số ô, nếu lời dẫn có.
    // Không phòng kề nào nhường được (`adviseShort`, T89) thì dùng dòng bảo xếp lại dải phòng.
    const template =
      (issue.params?.tight !== undefined
        ? prompts.floorLevel.hints[`${issue.code}_tight`]
        : undefined) ??
      (issue.params?.need_cells !== undefined
        ? prompts.floorLevel.hints[`${issue.code}_cells`]
        : undefined) ??
      // Bản phác có ban công dọc mặt ấy, mặt bằng chia lại nắn thành khối góc (T155) — đứng trước câu khối góc.
      (issue.params?.reshaped !== undefined
        ? prompts.floorLevel.hints[`${issue.code}_reshaped`]
        : undefined) ??
      (issue.params?.fitted !== undefined
        ? prompts.floorLevel.hints[`${issue.code}_fitted`]
        : undefined) ??
      // Ban công chỉ chạm mặt ấy ở góc (T112) — câu riêng, câu chung nói «không cái nào chạm» là sai.
      (issue.params?.corner !== undefined
        ? prompts.floorLevel.hints[`${issue.code}_corner`]
        : undefined) ??
      prompts.floorLevel.hints[issue.code] ??
      prompts.floorLevel.hintDefault;
    const grid = prompts.floorLevel.gridMm;
    const values: Record<string, string | number> = {
      code: issue.code,
      ref: issue.ref ?? '',
      ...(issue.params ?? {}),
      ...(grid && issue.params ? gridParamsInMm(issue.params, grid) : {}),
    };
    const filled = template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
    // Chế độ hình chữ nhật: lỗi mang số luật mô hình thấy ở `<rules>` (tài liệu v5 mục 6: «rule number, room…»).
    const rule = prompts.floorLevel.ruleOf?.[issue.code];
    const line = rule ? filled.replace(/^- /, `- R${rule} `) : filled;
    lines.add(
      prefix
        ? line.replace(/^- (R\d+ )?/, (_m, r: string | undefined) => `- ${r ?? ''}${prefix}`)
        : line,
    );
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
  /** Loại nhà (T116) — lớp ghi đè thứ hai của thước chấm. */
  houseProfile?: string | null;
  /** Vi phạm luật bắt buộc đã có sẵn trong phương án đang sửa — hạ xuống ghi chú (`mandatoryKey`). */
  relaxMandatory?: ReadonlySet<string>;
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
  const ground = Math.min(...input.levels.map((entry) => entry.level.level));
  const levels = input.levels.map((entry) => {
    const geometry = levelFromRooms(entry.level, input.construction, input.groups.outdoor);
    issues.push(...geometry.issues);
    notes.push(...geometry.notes);
    // Bậc tam cấp ngoài cửa chính (T70) — đặt SAU khi đã có tường, vì mặt ngoài tường là chỗ bậc
    // bắt đầu. Không vẽ được thì chỉ ghi chú, không chặn (`entry-steps.ts`).
    const entry_steps =
      entry.level.level === ground
        ? placeEntrySteps({
            level: geometry.level,
            demand: input.context.demands.entrySteps ?? null,
            norms: input.construction.entry_steps,
            lotCm: input.context.lotCm ?? null,
            mainFace: input.context.entrances.main,
          })
        : null;
    if (entry_steps) notes.push(...entry_steps.notes);
    // Không gian mở chia thành khu để tờ vẽ ghi tên từng khu (T48) — nhãn đọc, không phải tường.
    const labelled = labelReservedShaft(
      withMergedParts(
        geometry.level.rooms,
        (id) => {
          const space = input.program.spaces.find((entry) => entry.id === id);
          return space ? { type: space.type, target: space.target_area_m2 } : null;
        },
        input.groups.passage ? mergedZoning(input.groups.passage) : undefined,
        // Khu bếp tránh nằm dưới WC tầng trên — cùng mốc luật bắt buộc dùng (T96).
        wetRects(
          input.levels.find((other) => other.level.level === entry.level.level + 1)?.level.rooms ??
            [],
        ),
      ),
      input.context.demands.elevator,
    );
    const restated = restateRoomFacts(labelled, `tầng ${entry.level.level}`);
    notes.push(...restated.notes);
    const rooms = restated.rooms;
    return {
      ...geometry.level,
      ...(entry_steps?.steps.length ? { entry_steps: entry_steps.steps } : {}),
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
    mandatory: mandatoryFor(input.context.mandatory, input.program),
    ...(input.relaxMandatory ? { relaxMandatory: input.relaxMandatory } : {}),
  });
  const score = scorePlan({
    plan: assembled.payload,
    program: input.program,
    buildingType: input.buildingType,
    houseProfile: input.houseProfile ?? null,
    ...(input.houseProfile
      ? { profileMinSide: profileMinSide(input.construction, input.houseProfile) }
      : {}),
    mainBalconyAccess: input.context.demands.balcony?.mainAccess ?? null,
    quality: input.quality,
    rules: input.scoreRules,
    groups: input.roomGroups,
    // Luật đi lại và định mức nghề (T48): C6/C7 đo đường đi hằng ngày, A5/A6 đếm phòng ngoài định mức.
    passage: input.groups.passage ?? null,
    areaNorms: input.areaNorms ?? null,
    balconyFace: input.context.mandatory?.rules.balconyOnOpenFace ?? null,
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
    notes: [...assembled.notes, ...briefNotes, ...stackNotes(input, assembled.payload)],
    wallsDerived: true,
    score,
  };
}

/**
 * Luật bắt buộc cho cả lượt (T71): tầm «thẳng trục» lấy đúng `khoang_cach_m` của tiêu chí E2 — một con
 * số, hai nơi dùng — và cách chia không gian mở như `assemblePlan` chia.
 */
function mandatorySetup(input: PlanContextInput): MandatorySetup | null {
  if (!input.mandatory) return null;
  const e2 = input.quality?.criteria.find((entry) => entry.code === 'E2');
  const reachM = e2 ? criterionFor(e2, input.digest.building_type).params.khoang_cach_m : undefined;
  return {
    rules: input.mandatory,
    stackReachCm: typeof reachM === 'number' ? reachM * 100 : null,
    ...(input.groups.passage ? { zoning: mergedZoning(input.groups.passage) } : {}),
  };
}

/** WC chung vẫn lệch trục sau khi bộ xếp đã ưu tiên thẳng trục — nói ra, không chặn (Haan, T71). */
function stackNotes(input: PlanAssembleInput, plan: AiFloorPlan): DrawNote[] {
  const ctx = mandatoryFor(input.context.mandatory, input.program);
  return ctx ? offAxisNotes(plan.levels, ctx) : [];
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
  /**
   * % như `percent` nhưng bỏ A1 (lệch diện tích so với chương trình) — thước để xét biến thể thu hẹp hành lang (T160):
   * phép thu hẹp CỐ Ý lệch khỏi con số mô hình đoán cho hành lang và trả phần dư cho phòng kề. Vắng = như `percent`.
   */
  percentWithoutAreaFit?: number | null;
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
  groupFloorPercent: number | null = null,
  groupFloors: Readonly<Record<string, number>> = {},
): HouseScoreSummary {
  const percent = scorePercent(score);
  const areaFit = score.criteria.find((criterion) => criterion.code === 'A1');
  const percentWithoutAreaFit =
    areaFit && areaFit.score !== null
      ? scorePercent({
          points: score.points - areaFit.weight * areaFit.score,
          scoredWeight: score.scoredWeight - areaFit.weight,
        })
      : percent;
  // Dưới ngưỡng tổng, hoặc một nhóm dưới sàn nhóm (T96) — cả hai đều đáng một lượt sửa; khi chỉ nhóm
  // hụt sàn thì câu nhắc lấy từ đúng nhóm ấy, không lấy tiêu chí nặng nhất của cả thước.
  const weak = new Set(
    acceptPercent === null ? [] : groupsBelowFloor(score, groupFloorPercent, groupFloors),
  );
  const belowTotal = acceptPercent !== null && percent !== null && percent < acceptPercent;
  if (!belowTotal && weak.size === 0) {
    return { percent, acceptPercent, hints: [], percentWithoutAreaFit };
  }
  const hints = score.criteria
    .filter(
      (criterion) =>
        criterion.score !== null &&
        prompts.floorLevel.scoreHints[criterion.code] &&
        (belowTotal || weak.has(criterion.group)),
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
  return { percent, acceptPercent, hints, percentWithoutAreaFit };
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
  /**
   * Tầng ĐÃ QUA, lượt sửa giữ nguyên (T86): nằm dưới tầng hỏng thấp nhất và xếp đúng theo bản phác của
   * mô hình. Vắng/rỗng khi có lỗi cả nhà (tầng `0`) — lỗi ấy có thể cần sửa bất kỳ tầng nào.
   */
  settled?: number[];
}

/**
 * `evaluateHouse` cộng các biến thể chương trình tự thử trước khi bác (T94, B2 bước 1 — Haan duyệt
 * 27/09/2026, `doc/design/THIET_KE_B2.md` mục 8; biến thể ở `plan-variants.ts`):
 *
 *  1. phương án gốc đã đạt ngưỡng điểm → trả luôn, không thử gì thêm;
 *  2. chia lại diện tích mục tiêu (mức tối thiểu + phần dư chia theo tỉ lệ, chặn mức tối đa nghề);
 *  3. tầng nào còn hỏng → chèn một dải hành lang vào từng đường cắt sạch của bản phác tầng ấy.
 *
 * Giữ biến thể TỐT NHẤT (xếp được hơn không xếp được; cùng xếp được thì điểm cao hơn; cùng hỏng thì bậc
 * tệ `setbackRank` nhẹ hơn), nên không bao giờ tệ hơn phương án gốc. Biến thể được chọn thì ghi chú cho
 * kiến trúc sư, và ý định đã biến đổi là ý định gửi lại mô hình ở lượt sửa.
 *
 * Đo trên 105 vòng thật (không gọi mô hình): gốc 0 mặt bằng; với các biến thể 5 mặt bằng, 4 qua ngưỡng.
 */
/** Số bản tầng 1 xếp hạng kế tiếp được thử khi tầng trên hỏng (T113). */
const GROUND_BACKTRACK = 2;

export function evaluateHouseBest(
  input: PlanContextInput & HouseScoring,
  context: PlanContext,
  intent: HouseIntent,
  generator: AiSpaceProgram['generator'],
  prompts: AiPrompts,
): HouseEvaluation {
  // Phòng phụ nhỏ kẹt trên bản phác: nhập vào phòng kề trước khi xếp (T153) — ý định đã nhập cũng là ý định gửi lại
  // mô hình ở lượt sửa (`renamed`), nên mô hình không vẽ lại ô kho ấy.
  const stranded = absorbStrandedFor(input, intent);
  const evaluation = evaluateHouseVariants(input, context, stranded.intent, generator, prompts);
  for (const note of stranded.notes) {
    const arranged = evaluation.ok?.levels.find((item) => item.level.level === note.level);
    if (arranged) arranged.notes.push({ code: 'stranded_absorbed', message: note.message });
    // Tầng ấy đã qua mà nhà vẫn hỏng ở tầng khác: ghi vào lỗi tầng thấp nhất để kỹ sư vẫn thấy chương trình đã
    // nhập gì (ý định gửi lượt sửa đã mang sẵn bản nhập).
    const rejected =
      evaluation.rejections.find((item) => item.level === note.level) ??
      [...evaluation.rejections].sort((a, b) => a.level - b.level)[0];
    if (rejected) rejected.notes = [...(rejected.notes ?? []), note.message];
  }
  // Lưu ý giếng trời theo loại nhà (T116) — chỉ ghi chú, không đổi điểm hay cổng.
  const advice = evaluation.ok
    ? lightWellAdvice(
        input.construction,
        input.digest,
        intent.rooms.map((room) => room.type),
      )
    : null;
  if (advice && evaluation.ok) evaluation.ok.levels[0]?.notes.push(advice);
  return evaluation;
}

/** Quy tắc nhập phòng phụ kẹt (T153) từ kb — tắt khi `sketch.absorb_stranded` vắng hoặc thiếu nhóm lối đi. */
function absorbStrandedFor(
  input: PlanContextInput,
  intent: HouseIntent,
): { intent: HouseIntent; notes: StrandedNote[] } {
  const absorb = input.construction.sketch?.absorb_stranded;
  const passage = input.groups.passage;
  if (!absorb || !passage) return { intent, notes: [] };
  const required = input.digest.required_spaces ?? [];
  return absorbStranded(intent, {
    types: new Set(absorb.types),
    maxAreaM2: absorb.max_area_m2,
    through: passage.through,
    servedFrom: passage.servedFrom,
    // Không nhập vào thang, thang máy, gara, hiên: đổi cỡ thứ đã có mốc, hoặc đặt kho lên đường xe.
    noHost: new Set([
      ...input.fidelity.stairTypes,
      ...passage.entryThrough,
      ...input.groups.vertical,
    ]),
    // Đầu bài khai loại phòng này ở tầng này (hoặc không nói tầng) thì giữ — đó là lời gia chủ.
    required: (type, level) =>
      required.some((space) => space.type === type && (space.floor ?? level) === level),
    label: (type) => input.labels[type] ?? type,
  });
}

function evaluateHouseVariants(
  input: PlanContextInput & HouseScoring,
  context: PlanContext,
  intent: HouseIntent,
  generator: AiSpaceProgram['generator'],
  prompts: AiPrompts,
): HouseEvaluation {
  const run = (candidate: HouseIntent) =>
    evaluateHouse(input, context, candidate, generator, prompts);
  // Đường v6: kích thước do bộ giải dải quyết — các biến thể dưới đây sửa BẢN PHÁC (chia lại diện tích, chèn hành
  // lang, thu hẹp hành lang) nên không áp; lỗi cấu trúc quay về mô hình.
  if (intent.band_trees) return run(intent);
  // Thôi thử biến thể khi phương án đã qua ngưỡng nhận VÀ đạt mức tìm (`variant_search_until_percent`). Hai
  // mức tách nhau từ 01/10/2026: hạ ngưỡng nhận 65 → 60 làm bản 61,8 điểm của bea4c6fa vòng 6 được trả
  // ngay, bỏ mất biến thể 71,2 điểm mà ngưỡng 65 vẫn tìm ra.
  const searchUntil = input.quality.variantSearchUntilPercent;
  const goodEnough = (e: HouseEvaluation) =>
    !!e.ok &&
    !e.ok.score.hints.length &&
    (searchUntil === null || (e.ok.score.percent ?? 0) >= searchUntil);
  const chosen = bestVariant();
  // Hành lang rộng quá khung nghề (T104, Haan chọn hướng (a) ngày 30/09/2026): xếp lại cả nhà với hành lang thu
  // hẹp, phần dư cho cụm phòng không chứa ô thang; giữ bản ấy khi qua cổng và điểm KHÔNG thấp hơn. Cửa của cả tầng
  // suy lại theo hình học mới nên không áp thẳng vào mọi ứng viên — phát lại 30/09/2026 mất hai mặt bằng khi làm thế.
  if (input.trimCorridors || input.widenRooms || input.splitClosets) return chosen.evaluation;
  const roomsOf = (e: HouseEvaluation) =>
    e.ok ? JSON.stringify(e.ok.levels.map((lv) => lv.level.rooms)) : null;
  const percentOf = (e: HouseEvaluation) => e.ok?.score.percent ?? 0;
  /** Bản biến đổi được nhận khi qua cổng, khác hình, và điểm không thấp hơn bản đang giữ. */
  const beats = (next: HouseEvaluation, held: HouseEvaluation) =>
    !!next.ok &&
    roomsOf(next) !== roomsOf(held) &&
    (!held.ok || percentOf(next) >= percentOf(held));
  const variant = (extra: Partial<PlanContextInput>) =>
    evaluateHouse({ ...input, ...extra }, context, chosen.intent, generator, prompts);

  let held = chosen.evaluation;
  const notes: DrawNote[] = [];
  // Hành lang rộng quá khung nghề (T104, Haan chọn hướng (a) ngày 30/09/2026): xếp lại cả nhà với hành lang thu
  // hẹp, phần dư cho cụm phòng không chứa ô thang. Cửa của cả tầng suy lại theo hình học mới nên không áp thẳng vào
  // mọi ứng viên — phát lại 30/09/2026 mất hai mặt bằng khi làm thế.
  const trimmed = variant({ trimCorridors: true });
  // Thu hẹp hành lang cố ý lệch khỏi diện tích mô hình đoán (T160) — so điểm không tính A1, các tiêu chí khác phải
  // không thấp hơn. Phương án d084a46e: hành lang tầng 2 2,14 → 1,50 m, WC + giặt phơi nhận phần dư, A1 lại trừ điểm.
  const withoutAreaFit = (e: HouseEvaluation) => e.ok?.score.percentWithoutAreaFit ?? percentOf(e);
  const trimBeats =
    !!trimmed.ok &&
    roomsOf(trimmed) !== roomsOf(held) &&
    (!held.ok || withoutAreaFit(trimmed) >= withoutAreaFit(held));
  input.trace?.(
    `▷ thu hẹp hành lang: ${trimmed.ok ? withoutAreaFit(trimmed) : 'hỏng'} so với ${withoutAreaFit(held)} (không tính A1)`,
  );
  if (trimBeats) {
    held = trimmed;
    notes.push({
      code: 'corridor_trimmed',
      message:
        'Hành lang rộng quá khung nghề được thu hẹp; phần dư trả cho các phòng bên kia hành lang.',
    });
  }
  // Phòng hẹp hơn mức nghề (T113): nới, chồng lên bản đang giữ.
  const widened = variant({
    ...(held === trimmed ? { trimCorridors: true } : {}),
    widenRooms: true,
  });
  if (beats(widened, held)) {
    held = widened;
    notes.push({
      code: 'rooms_widened',
      message: 'Phòng hẹp hơn mức nghề được nới; phần thiếu lấy từ phòng kề còn dư bề ngang.',
    });
  }
  // WC khép kín dài quá → WC gọn + tủ đồ (T160), chồng lên bản đang giữ. Là biến thể cả nhà chứ không áp vào mọi ứng
  // viên: áp thẳng thì thứ hạng ứng viên đổi — phát lại e1c432f4 vòng 1 mất mặt bằng vì ban công tầng 2 ôm góc. So điểm
  // không tính A1: tủ đồ không có trong chương trình, WC nhỏ hơn số mô hình đoán.
  const closeted = longEnsuiteWc(held, input.construction)
    ? variant({
        ...(held === trimmed || (held === widened && trimBeats) ? { trimCorridors: true } : {}),
        ...(held === widened ? { widenRooms: true } : {}),
        splitClosets: true,
      })
    : held;
  if (
    closeted !== held &&
    closeted.ok &&
    roomsOf(closeted) !== roomsOf(held) &&
    (!held.ok || withoutAreaFit(closeted) >= withoutAreaFit(held))
  ) {
    held = closeted;
    notes.push({
      code: 'ensuite_closet_split',
      message:
        'WC khép kín dài quá được thu về chiều dài thường dùng; phần còn lại của dải thành tủ đồ mở từ phòng ngủ.',
    });
  }
  if (held !== chosen.evaluation && held.ok) {
    const kept =
      chosen.evaluation.ok?.levels[0]?.notes.filter((n) => n.code === 'plan_variant') ?? [];
    held.ok.levels[0]?.notes.push(...kept, ...notes);
    return { ...held, renamed: held.renamed ?? chosen.evaluation.renamed };
  }
  return chosen.evaluation;

  function bestVariant(): { evaluation: HouseEvaluation; intent: HouseIntent } {
    const base = run(intent);
    if (goodEnough(base)) return { evaluation: base, intent };
    const better = (a: HouseEvaluation, b: HouseEvaluation) => {
      if (!!a.ok !== !!b.ok) return !!a.ok;
      if (a.ok && b.ok) return (a.ok.score.percent ?? 0) > (b.ok.score.percent ?? 0);
      return setbackRank(a) < setbackRank(b);
    };
    let best = base;
    let bestIntent = intent;
    const used: string[] = [];

    const targetOpts = {
      floors: context.knowledge.floors,
      briefRows: context.knowledge.brief_spaces,
      norms: input.areaNorms ?? null,
      garageMinM2: context.demands.garageMinM2,
    };
    // Bộ xếp rất nhạy với diện tích mục tiêu — thử vài cách phân, giữ cách tốt nhất.
    for (const [candidate, note] of [
      [
        retargetIntent(intent, targetOpts),
        'chia lại diện tích mục tiêu: mỗi phòng mức tối thiểu + phần dư của tầng chia theo tỉ lệ',
      ],
      [
        equalizeByType(intent, targetOpts),
        'phòng cùng loại cùng tầng nhận cùng diện tích mục tiêu (mức lớn nhất của loại)',
      ],
    ] as const) {
      if (!candidate) continue;
      const tried = run(candidate);
      if (better(tried, best)) {
        best = tried;
        bestIntent = candidate;
        used.splice(0, used.length, note);
      }
    }

    for (const level of context.levels) {
      if (goodEnough(best)) break;
      // Tầng hỏng vì bất kỳ lý do nào: dải hành lang chèn vào đổi tỉ lệ cả tầng (lượt 5aba737d: ban công dài
      // không quay ra mặt thoáng thành đạt sau khi chèn một dải dọc).
      if (!best.rejections.some((r) => r.level === level)) continue;
      let chosen: { intent: HouseIntent; evaluation: HouseEvaluation; key: string } | null = null;
      for (const variant of hallVariants(bestIntent, level, `hall_auto_${level}`)) {
        const tried = run(variant.intent);
        if (better(tried, chosen?.evaluation ?? best)) {
          chosen = { intent: variant.intent, evaluation: tried, key: variant.key };
        }
      }
      // Chỉ giữ dải chèn khi CHÍNH tầng ấy qua: còn hỏng thì câu nhắc vòng sau nói về phòng `hall_auto_*` mô
      // hình chưa từng vẽ (lượt e34f8f58, nhà ống 04/10/2026: «hall_auto_1 không có lối vào» — mô hình xoá luôn
      // sảnh của mình, mặt bằng xấu dần qua ba vòng).
      if (chosen && !chosen.evaluation.rejections.some((r) => r.level === level)) {
        best = chosen.evaluation;
        bestIntent = chosen.intent;
        used.push(`tầng ${level}: chèn dải hành lang vào đường cắt ${chosen.key} của bản phác`);
      }
    }

    if (!used.length || best === base) return { evaluation: base, intent };
    const message = `Chương trình tự sửa trước khi gửi lại mô hình: ${used.join('; ')}.`;
    if (best.ok) {
      best.ok.levels[0]?.notes.push({ code: 'plan_variant', message });
    } else if (best.rejections[0]) {
      best.rejections[0] = {
        ...best.rejections[0],
        notes: [message, ...(best.rejections[0].notes ?? [])],
      };
    }
    return { evaluation: best, intent: bestIntent };
  }
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
  if (intent.band_trees) {
    input = {
      ...input,
      bandTrees: new Map(
        Object.entries(intent.band_trees).map(([level, tree]) => [Number(level), tree]),
      ),
    };
  }
  // Đường dải: lỗi cửa / lối đi / phòng hẹp là chỗ mô hình xếp — gửi lại mô hình (`BAND_REVISABLE_CODES`).
  const revisableFor = (code: string) =>
    isRevisable(code) || (!!intent.band_trees && BAND_REVISABLE_CODES.has(code));
  const stairFold = foldStairCore(proposalFromHouse(intent), input.fidelity.stairTypes);
  const folded = foldInBedroom(
    stairFold.proposal,
    input.fidelity.inBedroomTypes,
    input.fidelity.ensuiteParentTypes,
  );
  // Diện tích khai dưới sàn đầu bài: nâng lên thay vì bác (T91) — xem `liftToBriefFloors`.
  const lifted = liftToBriefFloors(folded.proposal, context.knowledge, input.labels);
  const programIssues = checkProposal(lifted.proposal, context.knowledge, input.labels);

  const { payload: program, idMap } = programFromProposal({
    proposal: lifted.proposal,
    includes: folded.includes,
    briefRef: PENDING_REF,
    generator,
    // Chế độ hình chữ nhật: mã là mã danh mục chương trình cấp — giữ nguyên (vòng sửa gửi lại đúng mã ấy).
    ...(context.geometry === 'rect' ? { keepIds: true } : {}),
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
  // Ban công đua (chế độ hình chữ nhật): có trong danh mục nhưng không có ô bản phác — bộ dựng ô gắn chúng ngoài khối.
  const cantilevers = (intent.cantilevers ?? []).map((c) => ({
    ...c,
    id: fullMap.get(c.id) ?? c.id,
    from: fullMap.get(c.from) ?? c.from,
  }));
  const renamed = dedupeRooms(
    renameHouse(
      { ...intent, rooms: intent.rooms.filter((room) => !stairFold.absorbed.has(room.id)) },
      fullMap,
    ),
  );
  if (cantilevers.length) {
    renamed.cantilevers = cantilevers;
    input = { ...input, cantilevers };
  }
  const jut = new Set(cantilevers.map((c) => c.id));
  const { byLevel, crossLevel, sketches } = levelIntentsOf(
    jut.size
      ? {
          ...renamed,
          rooms: renamed.rooms.filter((room) => !jut.has(room.id)),
          relationships: renamed.relationships.filter((rel) => !jut.has(rel.a) && !jut.has(rel.b)),
        }
      : renamed,
    context.levels,
  );
  const minimums = briefMinimums(input.digest, program);
  if (programIssues.length) {
    // Danh mục sai đầu bài: chưa xếp tầng nào — nhưng BẢN PHÁC mọi tầng soát được ngay (lối vào, sàn đầu bài, ban
    // công), như T92 soát tầng trên khi tầng 1 hỏng. Tổng hợp 37 lượt thật và lượt bea4c6fa (T107): mỗi vòng chỉ lộ
    // lỗi của giai đoạn hỏng đầu tiên — vòng 1 thiếu WC chung, vòng 2 mới lộ lối vào, vòng 3 diện tích, vòng 4 ban
    // công: bốn lời gọi cho bốn lỗi cùng có từ vòng 1.
    const pre = precheckSketches(input, context, program, byLevel, minimums, sketches, prompts);
    const balconyLines: PlanIssue[] = [];
    checkSketchBalconyDemand(
      context.demands.balcony,
      renamed.rooms,
      sketches,
      (level, code, message, ref, params) =>
        balconyLines.push({
          code,
          level,
          message,
          ...(ref ? { ref } : {}),
          ...(params ? { params } : {}),
        }),
      context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
      renamed.cantilevers ?? [],
    );
    const programHints = programIssues.map((issue) => `- ${issue}`);
    const advice = sketchBalconyCornerAdvice(
      context.demands.balcony,
      renamed.rooms,
      sketches,
      context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
    ).map((item): PlanIssue => ({ ...item, level: 'finding' }));
    const sketchHints = [...pre.hints, ...hintsFor([...balconyLines, ...advice], prompts)];
    return {
      ok: null,
      // Mã riêng cho GIAI ĐOẠN: tầng `0` ở đây là «chưa xếp nổi tầng nào», ngược hẳn tầng `0` của lỗi
      // liên tầng khi đã ghép đủ — `setbackRank` phải phân biệt (lượt thật 81fd3f57).
      rejections: [
        {
          level: 0,
          messages: programIssues,
          codes: programIssues.map(() => PROGRAM_STAGE_CODE),
          ...(pre.messages.length || balconyLines.length
            ? { notes: [...pre.messages, ...balconyLines.map((issue) => issue.message)] }
            : {}),
        },
      ],
      hints: [...programHints, ...sketchHints].slice(0, HINTS_MAX),
      // Câu nhắc bản phác nói bằng mã `type_n` — gửi kèm ý định đã đánh mã để khớp.
      renamed: sketchHints.length ? renamed : null,
    };
  }
  const crossNotes = [
    ...lifted.notes,
    ...crossLevel.map(
      (rel) =>
        `Quan hệ "${rel.a}"–"${rel.b}" nối hai tầng khác nhau — đã bỏ, mặt bằng chỉ xếp trong một tầng.`,
    ),
  ];

  const rejections: LevelRejection[] = [];
  /**
   * Câu nhắc của từng tầng hỏng, hai bản (T86): `normal` như trước — kèm lỗi bản phác các tầng dưới bị
   * chia lại, đòi sửa cả chúng; `settled` khi mọi tầng dưới ấy được GIỮ (và gửi lại bằng cách chia thật)
   * — chỉ lỗi của chính tầng này, kể cả lỗi ép ô lõi, vì mô hình giờ thấy đúng ô lõi ấy.
   */
  const failed: { dropped: number[]; normal: string[]; settled: string[] }[] = [];
  const arranged: ArrangedLevel[] = [];
  // Ban công đầu bài khai, đo trên bản phác (T73 h): nhắc cùng lượt với lỗi tầng, đừng chờ mọi tầng
  // xếp xong mới lộ (lượt đo 2ddf782a).
  const balconyIssues: PlanIssue[] = [];
  checkSketchBalconyDemand(
    context.demands.balcony,
    renamed.rooms,
    sketches,
    (level, code, message, ref, params) =>
      balconyIssues.push({
        code,
        level,
        message,
        ...(ref ? { ref } : {}),
        ...(params ? { params } : {}),
      }),
    context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
    renamed.cantilevers ?? [],
  );
  // Lời khuyên ban công góc (T107): chỉ đi kèm câu nhắc của lượt đã hỏng, không thành lời bác.
  const cornerAdvice = sketchBalconyCornerAdvice(
    context.demands.balcony,
    renamed.rooms,
    sketches,
    context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
  ).map((item): PlanIssue => ({ ...item, level: 'finding' }));
  const rejected = () => {
    if (balconyIssues.length) {
      rejections.push({ level: 0, messages: balconyIssues.map((issue) => issue.message) });
    }
    const balconyHints = hintsFor([...balconyIssues, ...cornerAdvice], prompts);
    const candidate = settledLevels(context.levels, rejections);
    const lockedAll = (dropped: number[]) => dropped.every((level) => candidate.includes(level));
    const hints = failed.flatMap((item) => (lockedAll(item.dropped) ? item.settled : item.normal));
    const kept = hints.length ? candidate : [];
    return {
      ok: null,
      rejections,
      hints: [
        ...hints.slice(0, HINTS_MAX - balconyHints.length),
        ...balconyHints,
        ...(kept.length
          ? hintsFor(
              [
                {
                  code: 'revision_kept',
                  level: 'blocking',
                  message: 'revision_kept',
                  params: { levels: kept.join(', ') },
                },
              ],
              prompts,
            )
          : []),
      ],
      renamed: kept.length
        ? replaceKeptSketches(
            renamed,
            arranged,
            droppedBelow,
            kept,
            context.buildableCm,
            (level, rows) => {
              const used = arrangedWith.get(level);
              if (!used) return false;
              const check = arrangeFor(
                input,
                context,
                used.program,
                level,
                used.intent,
                used.anchors,
                minimums,
                rows,
              );
              if (!arrangedLevel(check)) return false;
              // Tầng dựng bằng khung xương (T102) vẽ lại lên lưới rồi xếp lại vẫn về đúng khung ấy — bộ
              // xếp tất định — nên GIỮ được dù bản phác vẽ lại không tự qua cổng.
              return (
                !check.sketchFailure?.length ||
                check.notes.some((note) => note.code === 'skeleton_arranged')
              );
            },
          )
        : renamed,
      settled: kept,
    };
  };
  // Tầng dưới xếp được nhưng KHÔNG theo bản phác (chương trình chia lại) — tầng trên hỏng thì mô hình
  // phải biết cả lỗi của bản phác tầng dưới, vì mốc tầng trên đến từ bản chia lại ấy (lượt thật 913bc2ad).
  const droppedBelow: { level: number; issues: PlanIssue[]; coresMoved: string[] }[] = [];
  /** Tầng đã xếp được xếp bằng chương trình, mốc và ý định nào — để soát lại bản phác vẽ lại (T97). */
  const arrangedWith = new Map<
    number,
    { program: AiSpaceProgram; anchors: LevelAnchors | null; intent: AiPlanIntent }
  >();
  const fail = (level: number, result: ArrangeResult, entry?: string) => {
    const dropped = droppedBelow.filter((item) => item.level < level);
    // Tầng dưới chia lại đã DỜI ô lõi, và tầng này hỏng vì bị ép theo ô lõi ấy: lỗi ép mốc là hệ quả của
    // việc dời, không phải của bản phác tầng này — không gửi mô hình («wc_4 vẽ đè lên ô thang máy» ở hàng
    // mà chính mô hình chưa từng vẽ thang máy, lượt 913bc2ad); lỗi của bản phác tầng dưới nói TRƯỚC.
    const artefact =
      dropped.some((item) => item.coresMoved.length > 0) &&
      result.issues.some((issue) => CORE_FORCED_CODES.has(issue.code));
    const own = artefact
      ? result.issues.filter((issue) => !CORE_FORCED_CODES.has(issue.code))
      : result.issues;
    rejections.push({
      level,
      messages: result.issues.map((issue) => issue.message),
      codes: result.issues.map((issue) => issue.code),
      notes: [
        ...crossNotes,
        ...result.notes.map((note) => note.message),
        ...dropped.flatMap((item) => item.issues.map((issue) => issue.message)),
      ],
    });
    const boxed = entry ? entryBoxedIssue(own, entry) : null;
    const revisable = own.filter(
      (issue) => revisableFor(issue.code) && !(boxed && issue.params?.via === entry),
    );
    const ownHints = hintsFor(
      boxed ? [boxed, ...revisable] : revisable,
      prompts,
      `Storey ${level}: `,
    );
    const belowHints = dropped.flatMap((item) => [
      ...hintsFor(
        [
          {
            code: 'sketch_below_replaced',
            level: 'blocking',
            message: 'sketch_below_replaced',
            params: { level: item.level, above: level },
          },
        ],
        prompts,
      ),
      ...hintsFor(item.issues, prompts, `Storey ${item.level}: `),
    ]);
    const allRevisable = result.issues.filter(
      (issue) => revisableFor(issue.code) && !(boxed && issue.params?.via === entry),
    );
    // Vị trí ô thang (mốc tầng dưới) đứng ĐẦU câu nhắc của tầng hỏng (T105, lượt 1330ce12): trước chỉ nói khi mô
    // hình đã vẽ đè lên nó, nên mỗi lượt sửa lại vẽ thang lệch và hở một phòng khác.
    const cells = result.stairCells;
    const stairHint =
      cells &&
      !result.issues.some(
        (issue) => issue.code === 'sketch_core_overlap' && issue.params?.core === cells.core,
      )
        ? hintsFor(
            [{ code: 'stair_cells', level: 'blocking', message: 'stair_cells', params: cells }],
            prompts,
            `Storey ${level}: `,
          )
        : [];
    failed.push({
      dropped: dropped.map((item) => item.level),
      normal: artefact
        ? [...stairHint, ...belowHints, ...ownHints]
        : [...stairHint, ...ownHints, ...belowHints],
      settled: [
        ...stairHint,
        ...(dropped.length
          ? hintsFor(boxed ? [boxed, ...allRevisable] : allRevisable, prompts, `Storey ${level}: `)
          : ownHints),
      ],
    });
  };

  // Bộ xếp có thể thêm nhánh hành lang cho một tầng (V-29): tầng sau và artifact dùng chương trình mới.
  let current = program;
  const [ground, ...upper] = context.levels;
  const groundIntent = byLevel.get(ground!)!;
  let groundIntentUsed = groundIntent;
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
    (groundResult.issues.some((issue) => ENTRY_SIDE_CODES.has(issue.code)) ||
      (groundIntent.entry_room && entryBoxedIssue(groundResult.issues, groundIntent.entry_room)))
  ) {
    // Cách thử hỏng mà ÍT lỗi chặn nhất (T153) — lượt 75ba5793: lối vào qua gara chỉ vướng một lỗi ô thang,
    // nhưng báo cáo chỉ nói «phòng khách không có cửa ra mặt tiền».
    let nearest: { entry: string; result: typeof groundResult } | null = null;
    for (const entry of entryAlternatives(
      groundIntent,
      current,
      input.groups.passage,
      input.digest.building_type,
    )) {
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
      if (!arrangedLevel(retry)) {
        if (!nearest || blockingCount(retry.issues) < blockingCount(nearest.result.issues)) {
          nearest = { entry, result: retry };
        }
        continue;
      }
      groundIntentUsed = { ...groundIntent, entry_room: entry };
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
    if (!arrangedLevel(groundResult) && nearest) {
      // Câu gửi MÔ HÌNH giữ nguyên lỗi của phòng mô hình chọn: câu lỗi tả một bố cục mô hình không vẽ thì mô
      // hình sửa nhầm chỗ (bẫy T103; phát lại fdd486b1). Lỗi của cách thử gần qua nhất chỉ vào ghi chú cho KỸ
      // SƯ — lượt 75ba5793 khi ấy sẽ hiện ngay «ô thang 3,59 m» thay vì chỉ «phòng khách không có cửa».
      const original = groundIntent.entry_room ?? 'phòng mô hình chọn';
      const blocking = nearest.result.issues.filter((issue) => issue.level === 'blocking');
      groundResult = {
        ...groundResult,
        notes: [
          ...groundResult.notes,
          {
            code: 'entry_room_tried',
            message: `Chương trình đã thử đặt cửa chính vào "${nearest.entry}" thay cho "${original}" — vẫn vướng: ${blocking
              .slice(0, 3)
              .map((issue) => issue.message)
              .join(' · ')}`,
          },
        ],
      };
    }
  }
  const groundDone = arrangedLevel(groundResult);
  if (!groundDone) {
    fail(ground!, groundResult, groundIntent.entry_room ?? undefined);
    // Tầng trên chưa xếp được (chưa có mốc thang, khu ướt), nhưng BẢN PHÁC của chúng soát được ngay —
    // lỗi lối vào / sàn đầu bài đi cùng lượt sửa này, không chờ tầng 1 qua mới lộ (T92).
    for (const level of upper) {
      const pre = arrangeFor(
        input,
        context,
        current,
        level,
        byLevel.get(level)!,
        null,
        minimums,
        sketches.get(level),
        true,
      );
      if (!pre.issues.length) continue;
      fail(level, {
        ...pre,
        notes: [
          ...pre.notes,
          {
            code: 'sketch_prechecked',
            message: `Tầng ${level}: tầng dưới chưa xếp được nên tầng này mới SOÁT bản phác, chưa xếp.`,
          },
        ],
      });
    }
    return rejected();
  }
  const programBeforeGround = current;
  /**
   * Xếp các tầng trên theo MỘT bản tầng 1 đã xếp — không đụng trạng thái chung, để thử được nhiều bản tầng 1
   * (quay lui, T113) rồi mới ghi bản được chọn.
   */
  const upperFrom = (groundRes: ArrangeResult, groundLevel: ArrangedLevel) => {
    let program = programBeforeGround;
    if (groundRes.program) program = groundRes.program;
    const anchors = groundRes.layout!.anchors;
    // Thang, giếng trời, thang máy, khối nhà bám TẦNG 1 như trước; khu ướt, bếp, phòng thờ bám TẦNG NGAY
    // DƯỚI (T71) — «WC tầng 3 trên bếp tầng 2» chỉ thấy được khi tầng 3 cầm mốc của tầng 2.
    let below: ArrangedLevel = groundLevel;
    let belowAnchors: LevelAnchors | null = anchors;
    const steps: {
      level: number;
      result: ArrangeResult;
      done: ArrangedLevel | null;
      program: AiSpaceProgram;
      anchors: LevelAnchors | null;
    }[] = [];
    for (const level of upper) {
      const rules = mandatoryFor(context.mandatory, program);
      const levelAnchors: LevelAnchors | null = anchors
        ? {
            ...anchors,
            wetRooms: belowAnchors?.wetRooms ?? anchors.wetRooms,
            ...(rules
              ? { service: serviceAnchors(below.level.rooms, rules), belowRooms: below.level.rooms }
              : {}),
          }
        : null;
      const result = arrangeFor(
        input,
        context,
        program,
        level,
        byLevel.get(level)!,
        levelAnchors,
        minimums,
        sketches.get(level),
      );
      const done = arrangedLevel(result);
      steps.push({ level, result, done, program, anchors: levelAnchors });
      if (done) {
        if (result.program) program = result.program;
        below = done;
        belowAnchors = result.layout!.anchors ?? belowAnchors;
      }
    }
    return { steps, program, failed: steps.some((step) => !step.done) };
  };

  let chosenGround = { result: groundResult, done: groundDone };
  let upperRun = upperFrom(groundResult, groundDone);
  // Quay lui MỘT bước (T113): tầng trên hỏng thì thử bản tầng 1 xếp hạng kế tiếp. Tầng 1 được chọn theo điểm của
  // RIÊNG nó; điểm đổi (thêm C12) là tầng 1 đổi bản và tầng trên — ép theo mốc thang, WC của tầng 1 — có thể không
  // còn cách xếp nào (phát lại: 182665ea vòng 3 và 46d6eff3 vòng 1 mất mặt bằng chỉ vì vậy).
  // Tầng trên hỏng mà thang tầng 1 còn cạnh khác vào được: thử vào thang từ cạnh ấy TRƯỚC khi lùi sang bản xếp hạng
  // sau (T161). Thang U / ba vế bước ra ở tầng trên đúng đầu bậc 1, nên cạnh vào ở tầng 1 quyết đầu nào mọi tầng trên
  // phải giáp lối đi — d084a46e: tầng 1 vào từ phòng khách (đầu trước), tầng 2 phòng ngủ chính chắn đúng đầu ấy, còn
  // đầu sau giáp hành lang ở cả hai tầng. Bộ xếp tầng 1 không nhìn tầng trên; đường dải có bước tương tự
  // (`bands/layout.ts`, `preferredSide`).
  const groundUp = groundResult.layout?.anchors?.stairUp ?? null;
  if (upperRun.failed && upper.length && groundUp && input.construction.stairs.shape) {
    const alt = arrangeFor(
      { ...input, stairEntryAvoid: stairEntrySide(groundUp) },
      context,
      programBeforeGround,
      ground!,
      groundIntentUsed,
      null,
      minimums,
      sketches.get(ground!),
    );
    const altDone = arrangedLevel(alt);
    const altUp = alt.layout?.anchors?.stairUp ?? null;
    if (altDone && altUp && altUp !== groundUp) {
      const altRun = upperFrom(alt, altDone);
      input.trace?.(
        `▷ thang tầng 1 vào từ cạnh khác (${groundUp} → ${altUp}): tầng trên ${altRun.failed ? 'vẫn hỏng' : 'qua'}`,
      );
      if (!altRun.failed) {
        chosenGround = { result: alt, done: altDone };
        upperRun = altRun;
      }
    }
  }
  if (upperRun.failed && upper.length) {
    const seen = new Set([JSON.stringify(groundDone.level.rooms)]);
    for (let skip = 1; skip <= GROUND_BACKTRACK; skip += 1) {
      const alt = arrangeFor(
        { ...input, rankSkip: skip },
        context,
        programBeforeGround,
        ground!,
        groundIntentUsed,
        null,
        minimums,
        sketches.get(ground!),
      );
      const altDone = arrangedLevel(alt);
      if (!altDone) break;
      const key = JSON.stringify(altDone.level.rooms);
      if (seen.has(key)) break;
      seen.add(key);
      const altRun = upperFrom(alt, altDone);
      if (!altRun.failed) {
        chosenGround = { result: alt, done: altDone };
        upperRun = altRun;
        break;
      }
    }
  }
  arranged.push(chosenGround.done);
  arrangedWith.set(ground!, {
    program: programBeforeGround,
    anchors: null,
    intent: groundIntentUsed,
  });
  if (chosenGround.result.sketchFailure?.length) {
    droppedBelow.push({
      level: ground!,
      issues: chosenGround.result.sketchFailure,
      coresMoved: chosenGround.result.coresMoved ?? [],
    });
  }
  for (const step of upperRun.steps) {
    if (!step.done) {
      fail(step.level, step.result);
      continue;
    }
    arranged.push(step.done);
    arrangedWith.set(step.level, {
      program: step.program,
      anchors: step.anchors,
      intent: byLevel.get(step.level)!,
    });
    if (step.result.sketchFailure?.length) {
      droppedBelow.push({
        level: step.level,
        issues: step.result.sketchFailure,
        coresMoved: step.result.coresMoved ?? [],
      });
    }
  }
  current = upperRun.program;
  if (rejections.length) return rejected();

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
    houseProfile: houseProfile(input.digest).profile,
  });
  if (final.check.blocking.length) {
    // Mọi tầng đã xếp, nhưng có tầng xếp được chỉ nhờ chương trình CHIA LẠI (bản phác hỏng): lỗi cả nhà
    // có thể là hệ quả của việc chia lại ấy. Lượt thật 02982bd7 (26/09/2026, GPT-6 Sol) vòng 3: bản phác
    // tầng 2 để phòng ngủ chính 19 / 25 m², chương trình chia lại và dời ban công mặt sau sang mép trái;
    // kiểm cả nhà báo «thiếu ban công mặt sau», mô hình vẽ THÊM ban công ba lần, mỗi lần phá chỗ khác —
    // lỗi thật chưa bao giờ tới nó. Lỗi bản phác của tầng chia lại đứng ĐẦU câu nhắc (T90).
    const replacedHints = droppedBelow.flatMap((item) => [
      ...hintsFor(
        [
          {
            code: 'sketch_replaced',
            level: 'blocking',
            message: 'sketch_replaced',
            params: { level: item.level },
          },
        ],
        prompts,
      ),
      ...hintsFor(item.issues, prompts, `Storey ${item.level}: `),
    ]);
    // Lỗi ban công của cả nhà mà bản phác của mô hình KHÔNG mắc: ban công đã đúng mặt trên bản phác, bị dời
    // vì chương trình chia lại tầng (`balconyMovedByRepartition`), không phải mô hình vẽ sai. Tổng hợp
    // 37 lượt thật 23–30/09/2026: 30/57 lần báo «không ban công nào chạm mặt X», bản phác CÓ ban công ở mép
    // ấy — mô hình vẽ lại ban công vô ích, còn lỗi thật (bản phác hỏng) không được sửa.
    const replacedLevels = new Set(droppedBelow.map((item) => item.level));
    const consequence = (issue: PlanIssue) =>
      replacedLevels.size > 0 &&
      context.demands.balcony !== null &&
      BALCONY_PLACEMENT_CODES.has(issue.code) &&
      balconyMovedByRepartition(
        issue,
        final.payload,
        context.demands.balcony.type,
        sketches,
        replacedLevels,
        context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
      );
    const real = final.check.blocking.filter((issue) => !consequence(issue));
    if (!real.length) {
      // Mọi lỗi cả nhà là hệ quả: lỗi thật là bản phác của (các) tầng bị chia lại. Bác THEO TẦNG ấy để các
      // tầng dưới nó được giữ (T86) — lượt sửa chỉ gửi và chỉ vẽ lại tầng hỏng.
      const lowest = Math.min(...droppedBelow.map((item) => item.level));
      const kept = context.levels.filter((level) => level < lowest);
      return {
        ok: null,
        rejections: droppedBelow.map((item) => ({
          level: item.level,
          messages: item.issues.map((issue) => issue.message),
          codes: item.issues.map((issue) => issue.code),
          notes: final.check.blocking.map((issue) => issue.message),
        })),
        hints: [
          ...droppedBelow
            .flatMap((item) => hintsFor(item.issues, prompts, `Storey ${item.level}: `))
            .slice(0, HINTS_MAX),
          ...(kept.length
            ? hintsFor(
                [
                  {
                    code: 'revision_kept',
                    level: 'blocking',
                    message: 'revision_kept',
                    params: { levels: kept.join(', ') },
                  },
                ],
                prompts,
              )
            : []),
        ],
        renamed,
        settled: kept,
      };
    }
    // Câu «ban công chỉ chạm mặt ấy ở góc» cho một bản phác có ban công chạy suốt mặt ấy là sai với chính bản vẽ mô
    // hình thấy (T155, lượt thật 79669685: mô hình trả lại y nguyên tới hết lượt sửa).
    const revisableReal = real.filter((issue) => revisableFor(issue.code));
    const hinted = truthfulBalconyIssues(
      revisableReal,
      final.payload,
      context.demands.balcony?.type ?? null,
      sketches,
      replacedLevels,
      context.mandatory?.rules.balconyOnOpenFace?.longRatio ?? null,
    );
    const ownHints = hintsFor(hinted, prompts);
    return {
      ok: null,
      rejections: [
        {
          level: 0,
          messages: final.check.blocking.map((issue) => issue.message),
          ...(droppedBelow.length
            ? { notes: droppedBelow.flatMap((item) => item.issues.map((issue) => issue.message)) }
            : {}),
        },
      ],
      hints: ownHints.length ? [...replacedHints, ...ownHints].slice(0, HINTS_MAX) : [],
      renamed,
    };
  }
  return {
    ok: {
      program: current,
      levels: arranged,
      intent: renamed,
      score: scoreSummary(
        final.score,
        input.quality.acceptPercent,
        prompts,
        input.quality.acceptGroupFloorPercent,
        input.quality.acceptGroupFloors,
      ),
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

/**
 * Phòng mang cửa chính bị KẸT: vách ra ngoài của nó không đủ chỗ cửa, hoặc đường đi hằng ngày phải xuyên
 * qua nó. Trả một «lỗi» chỉ để dựng dòng gợi ý `entry_room_boxed_in` cho lượt sửa; không đi vào cổng.
 *
 * Lượt đo 458d9a91 (gpt-5.6-terra, 23/09/2026, 0,333 USD): bản phác đặt `porch_1` hai ô ở góc trước,
 * gara bao quanh. Cổng báo hai lỗi — cửa hiên ra ngoài thiếu vách (lỗi hình học, không gửi) và đường từ
 * phòng khách tới thang xuyên hiên — nên mô hình chỉ nhận dòng «vẽ hành lang nối phòng khách với thang».
 * Nó đã có hành lang, nên ba lượt sửa giữ nguyên hiên. Chỗ sai thật là chọn phòng cửa chính; dòng này
 * nói đúng chỗ ấy và THAY dòng hành lang trỏ vào cùng phòng.
 */
export function entryBoxedIssue(issues: readonly PlanIssue[], entry: string): PlanIssue | null {
  const doorShort = issues.find(
    (issue) =>
      issue.code === 'door_wall_too_short' &&
      issue.params?.a === entry &&
      issue.params?.b === OUTSIDE,
  );
  const crossed = issues.some(
    (issue) => issue.code === 'route_through_service' && issue.params?.via === entry,
  );
  if (!doorShort && !crossed) return null;
  return {
    code: 'entry_room_boxed_in',
    level: 'blocking',
    message: `Phòng mang cửa chính "${entry}" bị kẹt: ${doorShort ? 'vách ra ngoài không đủ chỗ đặt cửa' : 'đường đi hằng ngày phải xuyên qua nó'}.`,
    params: { room: entry },
    ref: entry,
  };
}

/** Tối đa bấy nhiêu phòng thay thế — mỗi lần thử là một lượt xếp trọn tầng. */
/** Số lỗi CHẶN của một lượt xếp — để so hai cách thử hỏng cách nào gần qua hơn. */
function blockingCount(issues: readonly PlanIssue[]): number {
  return issues.filter((issue) => issue.level === 'blocking').length;
}

const ENTRY_ALTERNATIVES_MAX = 3;

/**
 * Phòng thay thế mang cửa chính: phòng đi xuyên được (sinh hoạt chung, giao thông; không thang, không
 * gara), ưu tiên phòng mô hình khai liền với lối vào cũ, rồi chỗ sinh hoạt chung, rồi hành lang.
 */
export function entryAlternatives(
  intent: AiPlanIntent,
  program: AiSpaceProgram,
  passage: PlanContextInput['groups']['passage'],
  buildingType: string | null = null,
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
    .slice(0, ENTRY_ALTERNATIVES_MAX)
    .concat(garageEntry(intent, program, passage, buildingType));
}

/**
 * Gara làm phòng lối vào — thử SAU các phòng sinh hoạt chung, chỉ với loại hình `kb` cho phép
 * (`passage.entry_room_by_building_type`; nhà phố, Haan 04/10/2026). Nhà ống 5 m có gara mặt tiền:
 * phòng khách nằm sau gara không có vách ra đường, nên mọi phòng thay thế khác đều kẹt như nhau.
 */
function garageEntry(
  intent: AiPlanIntent,
  program: AiSpaceProgram,
  passage: NonNullable<PlanContextInput['groups']['passage']>,
  buildingType: string | null,
): string[] {
  const garage = intent.garage_room;
  if (!garage || garage === intent.entry_room || !buildingType) return [];
  const space = program.spaces.find((s) => s.id === garage);
  if (!space || space.level !== 1) return [];
  return passage.entryRoomByBuildingType.get(buildingType)?.has(space.type) ? [garage] : [];
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
    /** Tuyến cho vòng sửa (`revise_route` của tuyến đã chọn, handoff đợt 3 mục 4.1); vắng = `route`. */
    reviseRoute?: string;
    client: TextModelClient;
    prompts: AiPrompts;
    /**
     * Thử biến thể của chương trình trước khi bác (`evaluateHouseBest`, T94). Mặc định bật; phép thử cơ
     * chế vòng sửa (chọn gốc T81, giữ tầng T86) trên câu trả lời ghi sẵn thì tắt để canh đúng cơ chế ấy.
     */
    planVariants?: boolean;
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
  attempt: Pick<HouseAttempt, 'intent' | 'issues'> &
    Pick<Partial<HouseAttempt>, 'bandsBase' | 'bandsKeep'>,
  evaluation:
    | (Pick<HouseEvaluation, 'hints' | 'renamed'> &
        Partial<Pick<HouseEvaluation, 'rejections' | 'settled'>>)
    | null,
  asked: HouseIntent | null = null,
):
  | { kind: 'resample'; avoid: string[]; previous: null }
  | { kind: 'revise'; avoid: string[]; previous: HouseIntent; keep: number[] }
  | { kind: 'none'; avoid: []; previous: null }
  | { kind: 'unchanged'; avoid: []; previous: null } {
  if (!attempt.intent && attempt.bandsBase) {
    // Đường v6: câu trả lời đọc được nhưng bộ giải báo lỗi cấu trúc — sửa đúng bộ dải ấy, câu nhắc đã có số.
    const bands = attempt.bandsBase;
    const previous = {
      variant_label: bands.variant_label,
      rationale: bands.rationale,
      assumptions: bands.assumptions,
      rooms: [],
      relationships: [],
      entry_room: bands.entry_room || null,
      garage_room: bands.garage_room || null,
      bands,
    } as unknown as HouseIntent;
    return { kind: 'revise', avoid: [...attempt.issues], previous, keep: attempt.bandsKeep ?? [] };
  }
  if (!attempt.intent || !evaluation) {
    return { kind: 'resample', avoid: schemaHints(attempt.issues), previous: null };
  }
  if (!evaluation.hints.length) return { kind: 'none', avoid: [], previous: null };
  const answer = evaluation.renamed ?? attempt.intent;
  const levels = (evaluation.rejections ?? []).map((rejection) => rejection.level);
  if (asked && unchangedWhereFailed(asked, answer, levels)) {
    return { kind: 'unchanged', avoid: [], previous: null };
  }
  return {
    kind: 'revise',
    avoid: evaluation.hints,
    previous: evaluation.renamed ?? attempt.intent,
    keep: evaluation.settled ?? [],
  };
}

/**
 * Lượt sửa đi tiếp từ lượt hỏng NHẸ NHẤT, không phải lượt mới nhất (T73 i).
 *
 * Lượt đo 5cd78ef7 (24/09/2026, gpt-6-sol): lượt 3 chỉ còn phòng thờ không lối vào; mô hình sửa bằng
 * cách vẽ lại cả tầng 2 và lượt 4 hỏng năm chỗ mới, bỏ luôn ban công đầu bài đòi. Chương trình khi ấy
 * luôn gửi lượt MỚI NHẤT đi sửa, nên một lượt sửa hỏng kéo mọi lượt sau xuống theo. Ở đây lượt mới
 * tệ hơn hẳn lượt tốt nhất trước đó thì lượt sau sửa từ bản tốt nhất ấy, kèm dòng nói lần sửa vừa rồi
 * đã bị gạt đi.
 *
 * «Tệ hơn»: hỏng ở tầng THẤP hơn (tầng dưới hỏng thì tầng trên chưa được xét), cùng tầng thì nhiều
 * lỗi hơn. Bằng nhau thì theo lượt mới — mô hình có thể đã đi đúng hướng. Trả `best` (bản giữ lại
 * để so lượt sau) và `next` (bản gửi mô hình).
 */
export function revisionBase<
  T extends { rejections: readonly LevelRejection[]; hints: readonly string[] },
>(best: T | null, current: T, prompts: AiPrompts, stalled = false): { best: T; next: T } {
  if (!best || setbackRank(current) <= setbackRank(best)) return { best: current, next: current };
  // Hai lượt cùng hỏng ở bộ giải dải: so THEO TỪNG TẦNG (handoff sửa lỗi đợt 2 mục 3.4 — lượt thật 41ffe1e5 lời gọi 3 bị
  // gạt vì «8 lỗi so với 6», mô hình đã sửa đúng tầng 1). Chỉ gạt khi lượt mới không khá hơn ở tầng nào.
  if (bothAnswerStage(best, current) && !dominated(current, best))
    return { best: current, next: current };
  // Đã gửi lại bản tốt nhất cùng câu nhắc hai lần liền mà không tiến (Haan 25/09/2026, mục 3): lấy
  // bản mới nhất làm gốc — cùng lời dẫn ba lần cho cùng một bản thì lần thứ ba cũng không khác.
  if (stalled) {
    const line = hintsFor(
      [{ code: 'revision_stalled', level: 'blocking', message: 'revision_stalled' }],
      prompts,
    );
    return { best: current, next: { ...current, hints: [...line, ...current.hints] } };
  }
  const problems = (item: T) => item.rejections.reduce((sum, r) => sum + r.messages.length, 0);
  const setback = hintsFor(
    [
      {
        code: 'revision_setback',
        level: 'blocking',
        message: 'revision_setback',
        params: { worse: problems(current), better: problems(best) },
      },
    ],
    prompts,
  );
  // Nói lỗi chính của lượt bị gạt (lượt thật 03718834): không có dòng này, mô hình lặp lại đúng cách sửa vừa hỏng.
  const why = current.hints.find((line) => !best.hints.includes(line));
  const reason = why
    ? hintsFor(
        [
          {
            code: 'revision_setback_why',
            level: 'blocking',
            message: 'revision_setback_why',
            params: { why: why.replace(/^- /, '') },
          },
        ],
        prompts,
      )
    : [];
  return { best, next: { ...best, hints: [...setback, ...reason, ...best.hints] } };
}

/** Số lỗi theo tầng của một lượt hỏng ở bộ giải dải — đọc «Storey N» / «roof» trong câu nhắc; câu không nêu tầng tính chung. */
function problemsPerStorey(item: { rejections: readonly LevelRejection[] }): Map<string, number> {
  const counts = new Map<string, number>();
  for (const message of item.rejections.flatMap((r) => r.messages)) {
    const key =
      /\b[Ss]torey (\d+)\b/.exec(message)?.[1] ?? (/\broof\b/.test(message) ? 'roof' : 'all');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function bothAnswerStage(
  a: { rejections: readonly LevelRejection[] },
  b: { rejections: readonly LevelRejection[] },
): boolean {
  const stage = (item: { rejections: readonly LevelRejection[] }) =>
    item.rejections.some((r) => (r.codes ?? []).includes(ANSWER_STAGE_CODE));
  return stage(a) && stage(b);
}

/** `current` tệ hơn hoặc bằng `best` ở MỌI tầng và tệ hơn hẳn ở ít nhất một tầng. */
function dominated(
  current: { rejections: readonly LevelRejection[] },
  best: { rejections: readonly LevelRejection[] },
): boolean {
  const now = problemsPerStorey(current);
  const was = problemsPerStorey(best);
  const keys = new Set([...now.keys(), ...was.keys()]);
  let worse = false;
  for (const key of keys) {
    const delta = (now.get(key) ?? 0) - (was.get(key) ?? 0);
    if (delta < 0) return false;
    if (delta > 0) worse = true;
  }
  return worse;
}

/**
 * Bậc tệ của một lượt hỏng, so được bằng số: tầng hỏng thấp nhất trước; rồi GIAI ĐOẠN đi được tới —
 * lỗi còn nằm ở bản phác (`sketch_*`: chưa dựng nổi cây) tệ hơn lỗi sau khi cây đã dựng (phòng hụt vài
 * phần trăm, cửa…); rồi số lỗi. Lượt thật 4198d692 (25/09/2026): vòng 3 còn MỘT lỗi lối vào trên bản
 * phác; vòng 4, 5, 6 đều gỡ xong lối vào, dựng được cây, chỉ còn hai phòng hụt 0,08 và 1,3 m² — nhưng
 * «2 lỗi > 1 lỗi» nên cả ba bị gạt, mô hình nhận lại câu nhắc cũ ba lần và hết lượt.
 */
function setbackRank(item: { rejections: readonly LevelRejection[] }): number {
  // Câu trả lời không dùng được (sai hợp đồng, bộ giải dải không dựng nổi) — tệ hơn mọi lượt đã có ý định.
  if (item.rejections.some((r) => (r.codes ?? []).includes(ANSWER_STAGE_CODE)))
    return 100_000 + item.rejections.reduce((sum, r) => sum + r.messages.length, 0);
  const levels = item.rejections.map((r) => r.level).filter((level) => level > 0);
  // Bác ở cổng danh mục phòng = chưa xếp nổi tầng nào — TỆ NHẤT. Lượt thật 81fd3f57 (26/09/2026,
  // GPT-5.6 Luna): vòng 1 bác ở cổng danh mục (phòng ngủ 12 / 15 m²), vòng 2 qua cổng và xếp tới tầng 1;
  // hai lỗi cùng mang tầng `0` nên vòng 1 bị coi là «mọi tầng đã xếp» và vòng 2 bị gạt, hai lời gọi sau
  // nhận lại đúng câu nhắc cũ.
  const atProgram = item.rejections.some((r) => (r.codes ?? []).includes(PROGRAM_STAGE_CODE));
  // Chỉ còn lỗi cả nhà (tầng 0) sau khi xếp = mọi tầng đã xếp được — nhẹ nhất.
  const lowest = atProgram ? 0 : levels.length ? Math.min(...levels) : 1_000;
  // `sketch_room_crooked` chỉ kèm thông tin cho câu nhắc của tầng vốn đã hỏng — không làm một biến thể tệ hơn.
  const counted = (code: string) => code !== 'sketch_room_crooked';
  const atSketch = item.rejections.some((r) =>
    (r.codes ?? []).some((code) => counted(code) && code.startsWith('sketch_')),
  );
  const problems = item.rejections.reduce(
    (sum, r) => sum + r.messages.length - (r.codes ?? []).filter((code) => !counted(code)).length,
    0,
  );
  return -lowest * 10_000 + (atSketch ? 1_000 : 0) + problems;
}

/**
 * Mô hình được gửi `asked` kèm lỗi và trả về `answer` KHÔNG ĐỔI gì ở các tầng đang hỏng — cùng bản phác,
 * cùng phòng, cùng quan hệ, cùng phòng cửa chính / gara. Bộ xếp tất định nên kết quả sẽ y hệt, và lượt
 * gọi sau nhận đúng lời dẫn của lượt này: dừng, không tiêu thêm tiền.
 *
 * Lượt đo 458d9a91 (gpt-5.6-terra, 23/09/2026): lượt sửa 3 nộp lại nguyên văn lượt sửa 2; lượt 4 (0,086
 * USD) cũng không gỡ được lỗi.
 *
 * So các tầng TỪ DƯỚI LÊN TỚI tầng hỏng cao nhất: tầng dưới đổi thì mốc của tầng trên đổi. Tầng `0` (lỗi
 * cả nhà) = so mọi tầng. Chữ tự do (`rationale`, `assumptions`, `variant_label`) không tính.
 */
export function unchangedWhereFailed(
  asked: HouseIntent,
  answer: HouseIntent,
  failedLevels: readonly number[],
): boolean {
  if (!failedLevels.length) return false;
  const top = failedLevels.includes(0) ? Infinity : Math.max(...failedLevels);
  const shape = (intent: HouseIntent) => {
    const rooms = intent.rooms
      .filter((room) => room.level <= top)
      .map((room) => JSON.stringify(room))
      .sort();
    const ids = new Set(intent.rooms.filter((room) => room.level <= top).map((room) => room.id));
    const relationships = intent.relationships
      .filter((rel) => ids.has(rel.a) || ids.has(rel.b))
      .map((rel) => JSON.stringify(rel))
      .sort();
    const sketches = (intent.sketches ?? [])
      .filter((sketch) => sketch.level <= top)
      .map((sketch) => JSON.stringify(sketch))
      .sort();
    return JSON.stringify([
      rooms,
      relationships,
      sketches,
      intent.entry_room ?? null,
      intent.garage_room ?? null,
    ]);
  };
  return shape(asked) === shape(answer);
}

/** Khoá so được của tập lỗi một lượt — theo tầng, không phụ thuộc thứ tự. */
export function problemKey(
  rejections: readonly Pick<LevelRejection, 'level' | 'messages'>[],
): string {
  return JSON.stringify(
    rejections
      .flatMap((rejection) => rejection.messages.map((m) => `${rejection.level}|${m}`))
      .sort(),
  );
}

/**
 * `STUCK_AFTER` lượt cuối hỏng đúng cùng một tập lỗi: mô hình nhận cùng câu nhắc mà không gỡ được gì — gọi
 * tiếp chỉ tốn tiền (lượt thật 6bf43039: ba lượt sửa cuối nhận nguyên văn «chong chóng» + «ban công mặt
 * trước», 0,33 USD).
 */
/**
 * Khoá của MỘT câu trả lời đã chấm — bản phác, danh mục phòng, quan hệ, lối vào; bỏ lời văn tự do (`rationale`,
 * `assumptions`) vì hai câu trả lời cùng hình khác chữ vẫn ra cùng kết quả xếp (T153).
 *
 * `unchanged` (`retryPlan`) chỉ so với ý định VỪA gửi; nhưng lượt sửa có thể gửi lại lượt hỏng nhẹ nhất cũ hơn
 * (T73 i), và mô hình trả lại đúng một câu trả lời đã chấm trước đó — lượt 75ba5793 vòng 3 y hệt vòng 2. Kết quả
 * của câu ấy đã biết; gọi tiếp là mua lại nó.
 */
export function houseAnswerKey(intent: HouseIntent): string {
  return JSON.stringify({
    rooms: intent.rooms.map((r) => [r.id, r.type, r.level, r.target_area_m2, r.ensuite_of ?? null]),
    relationships: intent.relationships.map((r) => [r.a, r.b, r.kind]),
    sketches: (intent.sketches ?? []).map((k) => [
      k.level,
      k.rows.map((row) => row.trim().split(/\s+/).join(' ')),
    ]),
    entry: intent.entry_room ?? null,
    garage: intent.garage_room ?? null,
    bands: intent.band_trees ?? null,
  });
}

export function stuckRepeating(history: readonly string[], after = STUCK_AFTER): boolean {
  if (history.length < after) return false;
  const tail = history.slice(-after);
  return tail.every((key) => key === tail[0]);
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

/** Một lượt hỏng còn sửa được, giữ để so với lượt sau (`revisionBase`). */
interface FailedRound {
  rejections: LevelRejection[];
  hints: string[];
  plan: Extract<ReturnType<typeof retryPlan>, { kind: 'revise' }>;
}

/**
 * Một phương án từ đầu đến cuối, theo đúng thứ tự của Workflow — cho tuyến đồng bộ và kiểm thử.
 *
 * Ném `AiPlanRejected` khi sau lượt sửa thứ `HOUSE_REVISIONS_MAX` vẫn không xếp được: không có artifact nào được đúc từ một
 * mặt bằng hỏng.
 */
/**
 * Câu chặn khi đầu bài vượt sàn (T112) — kiểm trước lời gọi mô hình đầu tiên, ở cả `generateAiPlan` lẫn Workflow. Đường
 * dải (v6) dùng ước lượng theo mức tối thiểu (`storeyLoads`, cùng số dòng `knowledge.feasibility`); đường khác giữ cổng
 * ô lưới cũ.
 */
export function briefInfeasible(
  input: Pick<PlanContextInput, 'construction' | 'labels'> & {
    quality: Pick<PlanQuality, 'feasibilityMaxPercent'>;
  },
  context: PlanContext,
): string | null {
  if (context.bands && context.layout?.loads) return loadsIssue(context.layout.loads, input.labels);
  return feasibilityIssue(
    context.knowledge,
    input.construction.walls.exterior_m,
    input.quality,
    input.labels,
  );
}

/**
 * Mức suy nghĩ của một lời gọi xếp nhà (T1, handoff v6 sửa lỗi đợt 1). Kỹ sư chọn mức trên màn hình thì mức ấy thắng.
 * Để «Mặc định của model» thì lượt đầu theo cấu hình tuyến (`reasoning_effort`, thường `medium`), còn VÒNG SỬA ở đường
 * dải trên tuyến OpenAI hạ `low`: vòng sửa chỉ chỉnh vài dải theo câu nhắc có số, và đổi mức nghĩ không làm mất bộ nhớ
 * đệm tiền tố của OpenAI. Anthropic giữ một mức — đổi tham số suy nghĩ làm mất bộ nhớ đệm lời dẫn.
 */
export function houseCallEffort(
  chosen: ReasoningEffort | null | undefined,
  provider: string,
  retrying: boolean,
  bandsPipeline: boolean,
): ReasoningEffort | undefined {
  if (chosen) return chosen;
  return retrying && bandsPipeline && provider === 'openai' ? 'low' : undefined;
}

export async function generateAiPlan(input: AiPlanInput): Promise<AiPlanResult> {
  const context = planContext(input);
  // Đầu bài vượt sàn thì mô hình nào cũng không xếp nổi — dừng trước lời gọi đầu tiên (T112).
  const infeasible = briefInfeasible(input, context);
  if (infeasible) throw new AiPlanRejected([{ level: 0, messages: [infeasible] }]);
  const calls: PlanCallRecord[] = [];
  const failedLevels = new Set<number>();
  let first: LevelRejection[] | null = null;
  let next: Extract<ReturnType<typeof retryPlan>, { kind: 'revise' | 'resample' }> | null = null;
  let bestFailed: FailedRound | null = null;
  // Số lần liền nhau đã gửi lại bản tốt nhất thay vì bản mới (xem `revisionBase`, `stalled`).
  let resent = 0;
  const history: string[] = [];
  /** Câu trả lời đã chấm trong lượt này (`houseAnswerKey`) — gặp lại thì dừng (T153). */
  const seenAnswers = new Set<string>();

  for (let round = 0; ; round += 1) {
    let attempt = await callHouseModel({
      client: input.client,
      route: round > 0 && input.reviseRoute ? input.reviseRoute : input.route,
      prompts: input.prompts,
      context,
      ...(next ? { avoid: next.avoid, previous: next.previous } : {}),
      ...(next?.kind === 'revise' ? { keep: next.keep } : {}),
    });
    calls.push(attempt.call);
    const generator = programGenerator(attempt.call, input.route, input.prompts.version, round > 0);
    const evaluate = input.planVariants === false ? evaluateHouse : evaluateHouseBest;
    // Cùng lời dẫn với Workflow thật (`ai-design-steps.ts`): chế độ hình chữ nhật / dải tráo khối câu nhắc.
    const roundPrompts = promptsFor(context, input.prompts);
    // Dải tầng 1 không vừa khối: chương trình dựng lại tầng 1 trước khi gửi mô hình sửa.
    const rescued =
      !attempt.intent && attempt.bandsBase
        ? rescueFirstStorey(
            input,
            context,
            roundPrompts,
            generator,
            attempt.bandsBase,
            attempt.call,
            evaluate,
          )
        : null;
    if (rescued) attempt = rescued.attempt;
    if (!rescued?.evaluation && !attempt.intent && attempt.bandsBase) {
      const missing = [
        ...bandsProgramIssues(input, context, attempt.bandsBase),
        ...bandsLightWellHints(context, attempt.bandsBase, roundPrompts).map((line) =>
          line.replace(/^- /, ''),
        ),
      ];
      if (missing.length)
        attempt = { ...attempt, issues: [...attempt.issues, ...missing.map((m) => `- ${m}`)] };
    }
    let evaluation = rescued
      ? rescued.evaluation
      : attempt.intent
        ? evaluate(input, context, attempt.intent, generator, roundPrompts)
        : null;
    // Phòng chỉ ra được ô thang: chương trình thử chèn sảnh đầu thang trước khi gửi mô hình sửa.
    const landed = evaluation
      ? landStairEnds(input, context, roundPrompts, generator, attempt, evaluation, evaluate)
      : null;
    if (landed) ({ attempt, evaluation } = landed);

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
        houseProfile: houseProfile(input.digest).profile,
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
      : [{ level: 0, messages: attempt.issues, codes: [ANSWER_STAGE_CODE] }];
    for (const rejection of rejections) if (rejection.level > 0) failedLevels.add(rejection.level);
    first ??= rejections;
    history.push(problemKey(rejections));
    const plan = retryPlan(attempt, evaluation, next?.previous ?? null);
    const answered = evaluation?.renamed ?? attempt.intent;
    const answerKey = answered ? houseAnswerKey(answered) : null;
    const repeated = answerKey !== null && seenAnswers.has(answerKey);
    if (answerKey) seenAnswers.add(answerKey);
    if (
      round >= houseRevisionsMax(input.pipeline) ||
      plan.kind === 'none' ||
      plan.kind === 'unchanged' ||
      repeated
    ) {
      throw new AiPlanRejected(
        finalRejections(rejections, first, repeated ? 'unchanged' : plan.kind, round + 1),
      );
    }
    if (stuckRepeating(history, stuckAfter(input.pipeline))) {
      throw new AiPlanRejected(finalRejections(rejections, first, 'stuck', round + 1));
    }
    if (plan.kind === 'revise') {
      const current: FailedRound = { rejections, hints: plan.avoid, plan };
      const picked: { best: FailedRound; next: FailedRound } = revisionBase(
        bestFailed,
        current,
        input.prompts,
        resent >= STALLED_AFTER,
      );
      resent = picked.best === current ? 0 : resent + 1;
      bestFailed = picked.best;
      next = { ...picked.next.plan, avoid: [...picked.next.hints] };
    } else next = plan;
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
