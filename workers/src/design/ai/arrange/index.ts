/**
 * Bộ giải Ý ĐỊNH → một tầng đã qua cổng (T43, 14/09/2026 — Haan chốt).
 *
 * «Mô hình khai ý định, chương trình xếp phòng.» Mô hình nói phòng nào ở vùng nào, phòng nào cạnh phòng
 * nào, phòng nào mang cửa chính (`contracts/ai-plan-intent`). Tệp này dựng MỌI con số:
 *
 *   normaliseIntent ─► lá + vùng ─► enumerateFrames (nhiều cây ứng viên) ─► ép mốc tầng dưới
 *     ─► deriveDoors ─► layoutLevel (cổng hiện có, KHÔNG đổi) ─► scorePlan + độ khớp ý định ─► 1 cây
 *
 * Cổng kiểm, bộ chấm, bộ vẽ đều là mã có sẵn của `ai/tree/`, `plan-check`, `plan-score`, `draw/` — bộ
 * giải chỉ thêm một bước PHÍA TRƯỚC chúng, và đổ ra đúng hợp đồng cây chia (`ai-plan-tree`) mà cổng
 * đã đọc từ T37. Nhờ vậy mọi bất biến đã có phép thử canh (không chồng lấn, tường 11/22 cm, luật đi
 * xuyên phòng, cửa sổ, thang) được thừa hưởng, không viết lại.
 *
 * Cứng và mềm (Haan, 14/09/2026: «kinh nghiệm từ hồ sơ thật chỉ là tham khảo»): ứng viên chỉ bị LOẠI
 * khi không dựng được hoặc không đi được. Mọi ngưỡng kinh nghiệm chỉ đi vào điểm xếp hạng. «Không dựng
 * được» gồm cả phòng hẹp dưới cạnh DÙNG ĐƯỢC (`kb/construction_norms.yaml` mục `usable`, V-28) — giới
 * hạn hình học của đồ đạc, không phải thói quen NVG.
 *
 * Hàm THUẦN, tất định: không số ngẫu nhiên, mọi sắp xếp có khoá cuối là mã — cùng ý định cho cùng cây,
 * cùng tầng, cùng mã băm artifact.
 *
 * ⚠️ Thư mục này thuộc nhánh AI và KHÔNG import gì của bộ giải nội bộ (`layout/`, `program/`,
 * `compute/`) — `ai-independence.test.ts` canh.
 */

import type {
  AiFloorPlan,
  AiPlanIntent,
  AiPlanRoomsLevel,
  AiPlanTree,
  AiSpaceProgram,
} from '@nvg/shared/design';
import type { ConstructionNorms } from '../../kb/construction';
import type { Face } from '../../kb/site-context';
import { opensFromStair, type ZoneDefaults } from '../../kb/vocabulary';
import type { RulePack } from '../../rules/rule-pack';
import type { Rect } from '../draw/geometry';
import type { DrawNote } from '../draw/notes';
import { outlineFaces } from '../outline-faces';
import type { BalconyDemand } from '../brief-demands';
import type { PlanIssue } from '../plan-check';
import { levelFromRooms } from '../plan-geometry';
import type { PlanQuality } from '../plan-quality';
import { scorePlan } from '../plan-score';
import { clearAreaM2 } from '../sketch-cells';
import { layoutLevel, type LevelAnchors, type LevelLayout, type RoomGroups } from '../tree';
import { MIN_CELL_CM } from '../tree/cells';
import { stairFlights, stairRunNeedCm, stairShortfall, stairTreads } from '../tree/stair-fit';
import { deriveDoors } from './doors';
import { intentFit, type IntentFit } from './fit';
import { enumerateCarved, enumerateFrames, type FrameCandidate } from './frames';
import {
  effectiveZoneOfRect,
  projectedDistance,
  SPLIT_MIN_CM,
  ZONE_CELL,
  zoneOfRect,
  type Zone,
} from './grid';
import { normaliseIntent, type IntentLeaf, type LevelIntent } from './intent';
import { arrangeIssue, REVISABLE_CODES } from './issues';
import {
  DEFAULT_WEIGHTS,
  evaluate,
  NO_REACH,
  type PackEnv,
  type PackItem,
  type PackLeaf,
  type PenaltyWeights,
} from './pack';
import { emitNodes, leaves, pinLeaf, type Axis, type Placed, type Side } from './placed';
import {
  copySketch,
  forceSketchRect,
  growSketchRoom,
  forcedCellBox,
  sketchIds,
  prepareSketch,
  sketchRectOf,
  sketchTrees,
  stackWetRooms,
  type PreparedSketch,
} from './sketch';
import {
  MANDATORY_CODES,
  altarNeighbourViolations,
  balconyViolations,
  mandatoryFor,
  serviceAnchors,
  verticalViolations,
  wcOffAxis,
  wetRects,
  type MandatorySetup,
} from '../mandatory';

export { ARRANGE_ISSUE_CODES, INTENT_NOTE_CODES, isRevisable, REVISABLE_CODES } from './issues';
export { effectiveZoneOfRect, ZONES, type Zone } from './grid';
export type { LevelIntent } from './intent';

/** Một ô lõi (thang bộ, thang máy) trên bản phác tầng 1, cm theo tim tường. */
export interface SketchCore {
  id: string;
  rect: Rect;
  /** Lệch tâm tối đa vẫn coi là «đúng chỗ bản phác» — nửa cạnh ô lưới. */
  toleranceCm: number;
}

export interface ArrangeInput {
  intent: AiPlanIntent;
  level: number;
  isTop: boolean;
  program: AiSpaceProgram;
  buildableCm: Rect;
  construction: ConstructionNorms;
  groups: RoomGroups;
  mergeAllowed: ReadonlySet<string>;
  openFaces: readonly Face[];
  accessFaces: readonly Face[];
  entrances: { main: Face | null; vehicle: Face | null };
  anchors: LevelAnchors | null;
  /**
   * Tầng 1 (không mốc): ô thang bộ / thang máy đúng chỗ bản phác vẽ — `arrangeLevel` tự điền (T73).
   * Bản phác bị bỏ thì các khung khoét sẵn các ô này và xếp hạng ưu tiên cây giữ chúng: tầng trên đã vẽ
   * theo chỗ ấy, dời đi là tầng trên «không ép được mốc» (lượt đo 0c86c0b1).
   */
  sketchCores?: readonly SketchCore[];

  /**
   * Mặt hình bao mà ban công trên bản phác chạm tới (T92). Khi chương trình phải chia lại tầng, cách chia
   * giữ ban công ở đúng những mặt ấy thắng — lượt thật 02982bd7: chia lại dời ban công mặt sau sang mép
   * trái, rồi cả nhà hỏng vì «thiếu ban công mặt sau» mà mô hình đã vẽ.
   */
  sketchBalconySides?: readonly Side[];
  /**
   * Chỉ SOÁT bản phác (lối vào, sàn đầu bài), không xếp (T92). Dùng cho tầng trên khi tầng dưới đã hỏng:
   * trước đây tầng 1 hỏng thì tầng trên không được soát, mô hình sửa xong tầng 1 mới biết tầng 2 cũng
   * hỏng — mỗi tầng tốn một lượt gọi.
   */
  precheckOnly?: boolean;
  /** Yêu cầu ban công của đầu bài (T65) — dùng cho phần đua ra ngoài ranh. */
  balcony?: BalconyDemand | null;
  zoneDefaults: ZoneDefaults;
  /** Loại phòng giao thông đứng có thang (`kb/brief_fidelity.yaml` mục `stair_types`). */
  stairTypes: readonly string[];
  /** Cạnh ngắn kinh nghiệm theo loại phòng, m — MỀM (`rules/`). */
  minSideM?: (roomType: string) => number | null;
  /** Tỉ lệ dài/rộng kinh nghiệm theo loại phòng — MỀM. */
  aspectMax?: (roomType: string) => number | null;
  /**
   * Cạnh ngắn DÙNG ĐƯỢC theo loại phòng, lọt lòng, m — CỨNG (`kb/construction_norms.yaml` mục
   * `usable`, V-28). Bộ giải không dựng ô hẹp hơn, và cổng bác cây mà bước căn vách làm hẹp đi.
   */
  usableMinSideM?: (roomType: string) => number | null;
  /** Tỉ lệ dài/rộng lọt lòng tối đa DÙNG ĐƯỢC của phòng ở — CỨNG ở cổng, phạt nặng khi xếp (V-28). */
  usableMaxAspect?: (roomType: string) => number | null;
  /**
   * Diện tích lọt lòng TỐI THIỂU đầu bài khai cho phòng này, m² — CỨNG ở cổng (T45, Haan 15/09/2026:
   * «phòng nào khai thì phải tuân thủ»). `null` = đầu bài không khai, diện tích mô hình khai chỉ là mục
   * tiêu để bám.
   */
  briefMinAreaM2?: (roomId: string) => number | null;
  /** Định mức diện tích nghề theo loại phòng — đi thẳng vào bộ chấm (T48), không ràng buộc gì. */
  areaNorms?: ReadonlyMap<string, { min: number; target: number; max: number }> | null;
  /**
   * Bản phác lưới của tầng (T48, `ai-house-intent` `sketches[].rows`), mã đã đánh lại `type_n`. Vắng
   * hoặc rỗng: xếp từ vùng như T43.
   */
  sketch?: readonly string[] | null;
  /** Chấm để xếp hạng ứng viên. Vắng thì xếp theo hàm phạt và độ khớp ý định. */
  scoring?: {
    quality: PlanQuality;
    rules: RulePack;
    roomGroups: Record<string, string[]>;
    buildingType: string;
  };
  /**
   * Luật bố trí BẮT BUỘC (T71): cổng loại ứng viên vi phạm, và WC chung thẳng trục xếp trước. Vắng =
   * không kiểm (phép thử dựng tay).
   */
  mandatory?: MandatorySetup | null;
  /** Dòng gỡ lỗi — chỉ phép thử dùng. */
  trace?: (line: string) => void;
  /** Giới hạn công việc — mặc định vừa một bước Workflow. */
  budget?: { gated?: number; packs?: number };
}

export interface ArrangeSummary {
  candidates: number;
  passed: number;
  intentFit: number;
  parti: string;
  relaxed: number;
}

export interface ArrangeResult {
  /** `null` khi không ứng viên nào qua cổng. */
  layout: LevelLayout | null;
  intent: LevelIntent;
  summary: ArrangeSummary | null;
  /** Lý do không xếp được — của ứng viên hỏng ÍT nhất. Rỗng khi `layout` có. */
  issues: PlanIssue[];
  /** Ghi chú: ý định đã sửa + chỗ bộ giải đã nới. */
  notes: DrawNote[];
  /** Gọi lại mô hình với ý định sửa có ích không — lý do có nằm ở tầng ý định không. */
  revisable: boolean;
  /**
   * Chương trình đã thêm nhánh hành lang (V-29) — có mặt khi cây thắng tách hành lang của tầng thành hai
   * dải. Lớp gọi phải dùng bản này cho mọi tầng xếp sau và cho artifact.
   */
  program?: AiSpaceProgram;
  /**
   * Tầng xếp được nhưng KHÔNG theo bản phác: bản phác không qua cổng vì những lỗi này (sửa được), chương
   * trình chia lại. Lớp gọi kèm chúng vào câu nhắc khi một tầng TRÊN hỏng — lượt thật 913bc2ad: tầng 1
   * được «cứu» im lặng, tầng 2 hỏng vì mốc của bản chia lại, mô hình bốn lượt không biết tầng 1 có lỗi.
   */
  sketchFailure?: PlanIssue[];
  /** Ô lõi mà cách chia lại đã dời khỏi chỗ bản phác tầng 1 vẽ (`movedCores`) — đi cùng `sketchFailure`. */
  coresMoved?: string[];
}

/**
 * Vòng nới cuối cùng. Vòng 0 giữ trọn vùng mô hình khai; 1 nới phòng phụ; 2 nới mọi phòng trừ lối vào,
 * chỗ để xe, phòng ra mặt đường; 3 BỎ vùng (15/09/2026, tài liệu bàn giao mục 08: lỗi hình học thì bộ
 * dựng hình tự sinh ứng viên khác, giữ nguyên phòng, diện tích, quan hệ — không gọi lại mô hình). Trên
 * 36 ý định thật và biến thể của hai lượt đo: 26 → 29 xếp được, ca chậm nhất 2,6 s.
 */
const LAST_RING = 3;

/**
 * Ứng viên đưa qua cổng mỗi vòng. Mỗi lần qua cổng là một `layoutLevel` đầy đủ, vài mili-giây. 12 → 30
 * (15/09/2026): trên 36 ý định thật và biến thể của hai lượt đo, số tầng xếp được 22 → 25, thời gian cả bộ
 * không tăng — cây rẻ phạt nhất thường hỏng cổng, và xếp được sớm thì thôi liệt kê.
 */
const GATED_PER_ROUND = 30;
/** Trần số lần xếp một vùng cho cả một lượt liệt kê khung. */
const PACK_BUDGET = 40_000;
/** Hệ số từ diện tích lọt lòng yêu cầu ra diện tích theo tim tường — chỉ để quyết thu hình bao. */
const GROSS_FACTOR = 1.25;
/** Tỉ lệ dài/rộng mặc định khi gói kinh nghiệm không nói gì — mềm. */
const DEFAULT_ASPECT = 3;
/** Loại phòng là LỖ trong nhà (không cần chạm mặt thoáng) — trùng enum `void_space.kind` của hợp đồng. */
const INNER_OPEN = new Set(['light_well', 'courtyard']);

const FACE_SIDE: Record<Face, Side> = { front: 'y0', back: 'y1', left: 'x0', right: 'x1' };

export function arrangeLevel(input: ArrangeInput): ArrangeResult {
  const spaces = input.program.spaces.filter((space) => space.level === input.level);
  let sketch = input.sketch?.length
    ? prepareSketch({
        rows: input.sketch,
        level: input.level,
        footprint: input.anchors?.footprint ?? input.buildableCm,
        known: new Set(spaces.map((space) => space.id)),
        trim: input.anchors ? 'fit' : 'shrink',
        streetSides: input.accessFaces.map((face) => FACE_SIDE[face]),
      })
    : null;
  const footprints = footprintOptions(input, spaces);
  if (sketch && !footprints.some((f) => sameRect(f, sketch!.footprint))) {
    footprints.unshift(sketch.footprint);
  }
  const raw = sketch ? withSketchZones(input.intent, sketch) : input.intent;
  const missingSketch =
    input.sketch !== undefined && !sketch
      ? [
          {
            code: 'sketch_missing',
            message: `Mô hình không phác tầng ${input.level} — chương trình xếp theo vùng mặc định của từng loại phòng.`,
          },
        ]
      : [];
  const intent = intentFor(input, raw, spaces, footprints[0]!, sketch !== null);
  const cores = !input.anchors && sketch ? sketchCoresOf(input, intent, sketch) : [];
  if (cores.length) input = { ...input, sketchCores: cores };

  const balconySides = sketch ? sketchBalconySidesOf(input, sketch) : [];
  if (balconySides.length) input = { ...input, sketchBalconySides: balconySides };

  const notes: DrawNote[] = [...missingSketch, ...(sketch?.notes ?? []), ...intent.notes];
  input.trace?.(
    `tầng ${input.level} mốc ${input.anchors ? JSON.stringify({ stair: input.anchors.stair, wells: input.anchors.lightWells, footprint: input.anchors.footprint }) : 'không'}`,
  );

  // Cứng: diện tích lọt lòng yêu cầu lớn hơn cả khối xây theo tim tường thì không cây nào đúng — cổng
  // vẫn cho qua vì `layoutLevel` co phòng theo ô, và tờ vẽ ra những phòng bằng nửa chương trình. So với
  // hình bao LỚN NHẤT, không nhân hệ số tường: chỉ bác chỗ chắc chắn không vừa.
  const overflow = programOverflow(input, spaces, footprints);
  if (overflow) {
    const issues = dedupeIssues([...intent.issues, overflow]);
    return { layout: null, intent, summary: null, issues, notes, revisable: false };
  }

  // Bản phác vẽ phòng đầu bài khai diện tích THIẾU Ô thì báo ngay (T73), không để bộ xếp bỏ bản phác
  // «cứu» tầng bằng cách chia khác: lượt 011b4adc cứu tầng 1 như thế, dời ô thang, mô hình không được
  // biết phòng khách vẽ 28 ô cho mức 45 m², và tầng 2 phải ghim theo ô thang đã dời.
  let shortDrawn = sketch
    ? (sketchNoAccess(input, intent, sketch) ?? sketchBelowBrief(input, intent, sketch))
    : null;
  // Phòng vẽ thiếu sàn đầu bài mà CẢ TẦNG không còn chỗ bù (T91, Haan 27/09/2026): mọi phòng khác đã ở
  // mức tối thiểu của chúng. Gọi lại mô hình không đổi được gì — xếp tiếp, tha sàn cho phòng ấy, và cảnh
  // báo để kỹ sư sửa đầu bài. Còn chỗ bù thì vẫn bác và gửi mô hình (câu nhắc nói phòng nào dư).
  const waived = new Set<string>();
  while (sketch && shortDrawn?.code === 'arrange_room_below_brief_area' && shortDrawn.ref) {
    const deficit = Number(shortDrawn.params?.min_m2) - Number(shortDrawn.params?.area_m2);
    const spare = levelSpare(input, intent, sketch, shortDrawn.ref);
    if (!(deficit > 0) || spare.total >= deficit || waived.has(shortDrawn.ref)) break;
    const room = shortDrawn.ref;
    waived.add(room);
    notes.push({
      code: 'brief_area_unreachable',
      message: `Phòng "${room}" tầng ${input.level} chỉ vẽ được khoảng ${shortDrawn.params?.area_m2} m², đầu bài đòi tối thiểu ${shortDrawn.params?.min_m2} m² — các phòng khác trên tầng đã ở mức tối thiểu, không còn chỗ bù. Mặt bằng vẫn được lập; đề nghị sửa đầu bài: giảm diện tích hoặc bớt không gian.`,
    });
    const floorOf = input.briefMinAreaM2;
    input = {
      ...input,
      ...(floorOf ? { briefMinAreaM2: (id: string) => (waived.has(id) ? null : floorOf(id)) } : {}),
    };
    shortDrawn = sketchNoAccess(input, intent, sketch) ?? sketchBelowBrief(input, intent, sketch);
  }
  if (shortDrawn) {
    // Hỏng vì lý do khác (vd hụt diện tích đầu bài) thì kèm luôn phòng chỉ vào được qua ô thang.
    const stairOnly =
      shortDrawn.code === 'sketch_room_no_access' || shortDrawn.code === 'sketch_stair_isolated'
        ? null
        : sketchNoAccess(input, intent, sketch!, 'touch', true);
    const issues = dedupeIssues([
      ...intent.issues,
      adviseShort(input, intent, withSketchCells(shortDrawn, sketch!), sketch!),
      ...(stairOnly ? [stairOnly] : []),
    ]);
    return { layout: null, intent, summary: null, issues, notes, revisable: true };
  }
  if (input.precheckOnly) {
    return { layout: null, intent, summary: null, issues: [], notes, revisable: true };
  }

  let bestFailure: { issues: PlanIssue[]; weight: number } | null = null;
  // Lý do SỬA ĐƯỢC tốt nhất đã gặp — kèm theo khi lý do chọn ở trên là lỗi hình học. Không có nó thì một
  // ứng viên vòng khung hỏng vì lỗi hình học «thắng» và lượt chạy dừng, dù bản phác chỉ cần vẽ lại
  // (lượt chạy thật fad0c0fa, 23/09/2026: báo thang máy lệch, im lặng về master vẽ quá nhỏ).
  let bestRevisable: { issues: PlanIssue[]; weight: number } | null = null;
  // Lý do nào nói cho mô hình biết: của ứng viên hỏng ÍT nhất. Lọc trước cổng (`filtered`) xếp sau mọi
  // ứng viên đã tới cổng — nó chỉ nên lên tiếng khi không cây nào đi được tới đó.
  const remember = (issues: PlanIssue[], filtered = false) => {
    if (!issues.length) return;
    // Ứng viên CHỈ vướng luật bắt buộc (T71) là lý do đáng nói nhất: mọi thứ khác đã đạt, và mô hình
    // phải nghe đúng luật ấy — không thì nó sửa một lỗi phụ của ứng viên khác và vẽ lại y chỗ sai cũ
    // (đo 23/09/2026 trên 9 ý định thật: câu báo lên không nhắc tới ban công nào).
    const onlyMandatory = issues.every((issue) => MANDATORY_CODE_SET.has(issue.code));
    const weight =
      (onlyMandatory ? 0.5 : issues.length) +
      (issues.every((issue) => issue.code === 'arrange_anchor_conflict') ? 100 : 0) +
      (filtered ? 50 : 0);
    if (!bestFailure || weight < bestFailure.weight) bestFailure = { issues, weight };
    const revisable = issues.filter((issue) => REVISABLE_CODES.has(issue.code));
    if (revisable.length && (!bestRevisable || weight < bestRevisable.weight)) {
      bestRevisable = { issues: revisable, weight };
    }
  };
  // Cây đã hỏng cổng ở vòng trước thì hỏng lại y như vậy: cổng không đọc vòng nới. Không tiêu suất cổng
  // lần nữa (lượt đo 4a521f52: bốn cây rẻ nhất tầng 2 là CÙNG một mặt bằng qua ba vòng).
  const failedGeometry = new Set<string>();

  // Bản phác (T48) đi TRƯỚC mọi khung: qua được cổng thì đó là mặt bằng mô hình vẽ, chương trình chỉ căn
  // vách. Không qua thì vùng của bản phác vẫn dẫn các vòng dưới.
  let sketchIssues: PlanIssue[] = [];
  // Lỗi SỬA ĐƯỢC của bản phác khi tầng này rồi xếp được bằng cách chia lại — xem `ArrangeResult.sketchFailure`.
  let sketchFailure: PlanIssue[] = [];
  let built = 0;
  if (sketch) {
    // Phòng vẽ đủ ô mà căn vách vẫn hụt mức đầu bài (T79): nới nó thêm một dải ô lấy của phòng kề còn
    // dư, thử lại — trước khi bỏ bản phác. Mỗi lần như thế trước đây là một lượt sửa của mô hình.
    const tries = input.construction.sketch?.grow_tries ?? 0;
    const short = new Map<string, PlanIssue>();
    const rememberShort = (issues: PlanIssue[], filtered?: boolean) => {
      for (const issue of issues) {
        if (issue.code === 'arrange_room_below_brief_area' && issue.ref && !short.has(issue.ref)) {
          short.set(issue.ref, issue);
        }
      }
      remember(issues, filtered);
    };
    let drawn = sketchStage(input, intent, sketch, rememberShort, failedGeometry);
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (drawn.winner || drawn.issues.length || !short.size) break;
      const [room, issue] = [...short.entries()][0]!;
      const grown = growSketchRoom(sketch, room, (other, remaining) => {
        const spare = sketchSpare(input, intent, sketch!, other, remaining);
        input.trace?.(
          `  nới "${room}": "${other}" còn ${remaining} ô → dư ${spare === null ? 'không được' : spare.toFixed(1)}`,
        );
        return spare;
      });
      if (!grown) {
        input.trace?.(`  nới "${room}": không có dải nào lấy được`);
        break;
      }
      // Nới xong bản phác vẫn phải qua hai phép kiểm trước bộ xếp: lối vào, và không phòng nào hụt ô.
      const recheck =
        sketchNoAccess(input, intent, grown.sketch) ??
        sketchBelowBrief(input, intent, grown.sketch);
      if (recheck) {
        input.trace?.(
          `  nới "${room}" lấy của "${grown.from}": bản phác hỏng lại — ${recheck.message}`,
        );
        break;
      }
      built += drawn.built;
      notes.push(...drawn.notes, {
        code: 'sketch_room_grown',
        message: `Bản phác tầng ${input.level}: phòng "${room}" căn vách chỉ được ${issue.params?.area_m2 ?? '?'} m² (đầu bài tối thiểu ${issue.params?.min_m2 ?? '?'} m²) — chương trình nới thêm ${grown.cells} ô lấy của "${grown.from}" rồi xếp lại, không gọi lại mô hình.`,
      });
      sketch = grown.sketch;
      short.clear();
      drawn = sketchStage(input, intent, sketch, rememberShort, failedGeometry);
    }
    notes.push(...drawn.notes);
    built += drawn.built;
    if (drawn.winner?.stacked) {
      return finish(input, intent, notes, drawn.winner, {
        candidates: built,
        passed: drawn.passed,
        relaxed: 0,
      });
    }
    if (drawn.winner) {
      // Bản phác qua cổng nhưng WC chung lệch trục (T71): thử các vòng khung trước khi nhận. Có cách
      // xếp thẳng trục thì dùng nó — Haan: «chỉ cho phép lệch trục khi cần thiết»; không có thì giữ
      // đúng bản mô hình vẽ.
      const rings = runRings(input, intent, footprints, remember, failedGeometry);
      built += rings.built;
      if (rings.winner?.stacked) {
        notes.push({
          code: 'sketch_replaced_for_wc_stack',
          message: `Tầng ${input.level}: bản phác của mô hình đặt khu vệ sinh chung lệch trục tầng dưới — chương trình chọn cách xếp khác để các khu vệ sinh thẳng một trục.`,
        });
        return finish(input, intent, notes, rings.winner, {
          candidates: built,
          passed: rings.passed,
          relaxed: rings.ring,
        });
      }
      return finish(input, intent, notes, drawn.winner, {
        candidates: built,
        passed: drawn.passed,
        relaxed: 0,
      });
    }
    sketchIssues = drawn.issues;
    sketchFailure = dedupeIssues([
      ...drawn.issues,
      ...((bestRevisable as { issues: PlanIssue[] } | null)?.issues ?? []),
    ])
      .filter((issue) => REVISABLE_CODES.has(issue.code))
      .map((issue) => adviseShort(input, intent, withSketchCells(issue, sketch!), sketch!));
    notes.push({
      code: 'sketch_fallback',
      message: `Tầng ${input.level}: bản phác của mô hình không qua được cổng kiểm${
        drawn.reason ? ` (${drawn.reason})` : ''
      } — chương trình xếp lại, giữ vùng từng phòng theo bản phác.`,
    });
  }

  // Tầng xếp được bằng cách chia lại: kèm lỗi của bản phác, và tên ô lõi (thang bộ, thang máy) mà cách
  // chia lại đã DỜI khỏi chỗ bản phác — tầng trên vẽ theo chỗ ấy, nên lớp gọi biết một tầng trên hỏng vì
  // ép mốc là hệ quả của việc dời này, không phải lỗi của bản phác tầng trên.
  const dropped = (result: ArrangeResult): ArrangeResult => {
    if (!sketchFailure.length && !sketch) return result;
    const moved = result.layout?.level ? movedCores(input, result.layout.level.rooms) : [];
    return {
      ...result,
      ...(sketchFailure.length ? { sketchFailure } : {}),
      ...(moved.length ? { coresMoved: moved } : {}),
    };
  };
  const rings = runRings(input, intent, footprints, remember, failedGeometry);
  built += rings.built;
  if (rings.winner) {
    return dropped(
      finish(input, intent, notes, rings.winner, {
        candidates: built,
        passed: rings.passed,
        relaxed: rings.ring,
      }),
    );
  }

  // Hướng A (T48): không cây nào qua cổng — thêm một hành lang rồi thử lại trọn các vòng. Chỉ SAU khi
  // thất bại: tầng xếp được không hành lang thì không phí sàn cho nó. Thêm cả khi tầng ĐÃ có hành lang,
  // nếu lý do hỏng là đường đi hằng ngày phải xuyên gara — chính là chỗ một hành lang thứ hai gỡ được.
  const failedCodes = new Set(
    ((bestFailure as { issues: PlanIssue[] } | null)?.issues ?? []).map((issue) => issue.code),
  );
  const hall = hallInput(input, spaces, footprints, failedCodes.has('route_through_service'));
  if (hall) {
    const hallSpaces = hall.input.program.spaces.filter((space) => space.level === input.level);
    const hallRaw: AiPlanIntent = {
      ...raw,
      rooms: [...raw.rooms, { id: hall.id, zone: hall.zone, street_facing: false }],
    };
    const hallIntent = intentFor(hall.input, hallRaw, hallSpaces, footprints[0]!, sketch !== null);
    const retry = runRings(hall.input, hallIntent, footprints, remember, new Set());
    built += retry.built;
    if (retry.winner) {
      notes.push({
        code: 'arrange_hall_inserted',
        message: `Tầng ${input.level}: không cách chia nào cho mọi phòng một lối vào mà không đi xuyên phòng khác — chương trình thêm hành lang "${hall.id}" khoảng ${hall.area} m² (mô hình không khai hành lang cho tầng này).`,
      });
      return dropped(
        finish(
          hall.input,
          hallIntent,
          notes,
          retry.winner,
          { candidates: built, passed: retry.passed, relaxed: retry.ring },
          hall.input.program,
        ),
      );
    }
  }

  const chosen: PlanIssue[] =
    (bestFailure as { issues: PlanIssue[] } | null)?.issues ??
    (built === 0 ? [noPartiIssue(input, spaces)] : []);
  const extra = (bestRevisable as { issues: PlanIssue[] } | null)?.issues ?? [];
  const failure =
    chosen.some((issue) => REVISABLE_CODES.has(issue.code)) || !extra.length
      ? chosen
      : [...chosen, ...extra];
  // Tầng hỏng: đo lại lối vào trên bản phác với độ dài tiếp giáp đủ đặt cửa (T73 g). Lượt 9d3cc059 hỏng
  // vì hành lang chia bốn mẩu nối nhau một ô — toàn lỗi hình học, không dòng nào gửi mô hình, lượt dừng.
  // Phòng đang bị nêu lỗi thì không được nằm trong danh sách «phải giữ nguyên» của câu nhắc lối vào —
  // lượt 4b0268b1 vòng 3: «giữ `bedroom_4`» cạnh «`bedroom_4` chỉ vào được qua ô thang».
  const faulted = new Set(failure.map((issue) => issue.ref).filter((ref): ref is string => !!ref));
  const weakRaw = sketch ? sketchNoAccess(input, intent, sketch, 'door') : null;
  const weak =
    weakRaw && typeof weakRaw.params?.keep === 'string'
      ? {
          ...weakRaw,
          params: {
            ...weakRaw.params,
            keep:
              weakRaw.params.keep
                .split(', ')
                .filter((id) => !faulted.has(id.replaceAll('"', '')))
                .join(', ') || 'none',
          },
        }
      : weakRaw;
  // Không lỗi lối vào nào nói về ô thang thì kèm phòng chỉ vào được qua ô thang trên bản phác.
  const stairOnly =
    sketch && !weak && !failure.some((issue) => issue.code === 'door_from_stair')
      ? sketchNoAccess(input, intent, sketch, 'touch', true)
      : null;
  const issues = dedupeIssues([
    ...intent.issues,
    ...sketchIssues,
    ...failure,
    ...(weak ? [weak] : []),
    ...(stairOnly ? [stairOnly] : []),
  ]).map((issue) =>
    sketch ? adviseShort(input, intent, withSketchCells(issue, sketch), sketch) : issue,
  );
  return {
    layout: null,
    intent,
    summary: null,
    issues,
    notes,
    revisable: issues.some((issue) => REVISABLE_CODES.has(issue.code)),
  };
}

/**
 * Phòng không có lối vào NGAY TRÊN BẢN PHÁC — `null` khi mọi phòng có (T73, lượt đo 6c35ed79).
 *
 * Một phòng cần cửa phải có ít nhất một ô chung cạnh với ô của phòng đi xuyên được (`walk_through`), của
 * loại phòng được phép phục vụ nó (`served_from`), hoặc — phòng khép kín — của phòng mẹ. Đúng luật lời
 * dẫn đã nói với mô hình («Every other room shares a wall in the sketch with a walk-through room or with
 * a type listed for it in `knowledge.served_from`»), đo thẳng trên lưới ô nên chỉ bắt chỗ CHẮC CHẮN sai.
 * Không kiểm: phòng đi xuyên được, phòng vào từ ngoài (`entry_through`: gara, hiên), ban công / sân,
 * phòng không cần cửa (`no_door_required`: hộp kỹ thuật, giếng trời).
 *
 * Lượt 6c35ed79: năm phòng tầng 2 không giáp hành lang nào trên bản phác. Bộ xếp bỏ bản phác, mọi cây dự
 * phòng hỏng «phòng không giáp phòng giao thông» — lỗi hình học, không gửi mô hình — nên ba lượt sửa chỉ
 * nhận câu nhắc diện tích và không sửa bố cục.
 */
function sketchNoAccess(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
  /**
   * `touch` — trước khi xếp: hai phòng «nối» khi chạm nhau một ô trở lên; chỉ bắt chỗ CHẮC CHẮN sai.
   * `door` — sau khi tầng đã hỏng: phải chung một đoạn liền đủ đặt cửa. Đoạn một ô trên bản phác chưa chắc
   * hỏng (bộ xếp căn vách theo diện tích có thể nới ra — tầng 1 lượt 9d3cc059 qua với hành lang chạm thang
   * một ô), nên chỉ nói ra khi tầng đã hỏng.
   */
  mode: 'touch' | 'door' = 'touch',
  /**
   * `true` — không phòng nào mất lối vào nhưng có phòng CHỈ vào được qua ô thang (ngoài
   * `passage.stair_opens_to`) thì trả `sketch_stair_only`. Chỉ gọi khi tầng ĐÃ hỏng vì lý do khác: bản phác
   * chưa phải hình cuối, bộ xếp còn nắn được, nên tự nó không đủ để bác (lượt 9d3cc059, 6c35ed79).
   */
  stairOnlyAlone = false,
): PlanIssue | null {
  const passage = input.groups.passage;
  // Cùng mục `sketch` của `kb/construction_norms.yaml` với phép kiểm diện tích: vắng mục ấy (phương án
  // lưu trước T73) thì không kiểm bản phác trước khi xếp.
  if (!passage || !input.construction.sketch) return null;
  const { cells, cols, rows } = sketch.grid;
  const cellCm = Math.min(
    (sketch.footprint.x1 - sketch.footprint.x0) / cols,
    (sketch.footprint.y1 - sketch.footprint.y0) / rows,
  );
  const leafOf = (id: string | null | undefined) => (id ? (intent.hostOf.get(id) ?? id) : null);
  // Đoạn tiếp giáp LIỀN MẠCH dài nhất giữa hai lá, tính bằng ô (T73 g). Chạm một ô, hay hai ô rời nhau,
  // không đặt được cửa: lượt 9d3cc059 chia hành lang thành bốn mẩu nối nhau chỉ một ô.
  const runs = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const scan = (
    at: (i: number, j: number) => [string | null, string | null],
    outer: number,
    inner: number,
  ) => {
    for (let i = 0; i < outer; i += 1) {
      let run = 0;
      let key = '';
      for (let j = 0; j < inner; j += 1) {
        const [a, b] = at(i, j);
        const next = a && b && a !== b ? pairKey(a, b) : '';
        run = next && next === key ? run + 1 : next ? 1 : 0;
        key = next;
        if (next) runs.set(next, Math.max(runs.get(next) ?? 0, run));
      }
    }
  };
  // Ranh đứng giữa cột c và c+1, chạy dọc các hàng; ranh ngang giữa hàng r và r+1, chạy dọc các cột.
  scan((c, r) => [leafOf(cells[r]?.[c]), leafOf(cells[r]?.[c + 1])], cols - 1, rows);
  scan((r, c) => [leafOf(cells[r]?.[c]), leafOf(cells[r + 1]?.[c])], rows - 1, cols);
  const narrow = new Set(input.construction.openingRules.narrow_door_types);
  const wallCm = input.construction.walls.partition_m * 100;
  const marginCm = input.construction.openingRules.door_margin_m * 100;
  // Vách trống cần cho một cửa (bề rộng + hai mép, như `putDoor`) cộng một tường ngăn — bản phác vẽ theo
  // tim tường. Cửa 0,9 m → 1,21 m → 2 ô một mét.
  const doorCells = (a: IntentLeaf, b: IntentLeaf) => {
    if (mode === 'touch') return 1;
    const width =
      (a.types.some((t) => narrow.has(t)) || b.types.some((t) => narrow.has(t))
        ? input.construction.openings.wc_door?.width_m
        : input.construction.openings.door?.width_m) ?? 0.9;
    return Math.ceil((width * 100 + 2 * marginCm + wallCm) / cellCm - 1e-9);
  };
  const joined = (a: IntentLeaf, b: IntentLeaf) =>
    (runs.get(pairKey(a.id, b.id)) ?? 0) >= doorCells(a, b);
  const touching = (leaf: IntentLeaf) =>
    intent.leaves.filter((other) => other !== leaf && runs.has(pairKey(leaf.id, other.id)));

  const walk = (leaf: IntentLeaf) => leaf.types.some((type) => passage.through.has(type));
  // Phòng đi xuyên được nối về ô thang qua những đoạn đủ đặt cửa. Tầng không thang (nhà một tầng) thì
  // coi mọi phòng đi xuyên được là nối — bộ xếp lo lối vào từ ngoài.
  const stairs = intent.leaves.filter((leaf) =>
    leaf.types.some((t) => input.stairTypes.includes(t)),
  );
  const linked = new Set<string>(
    stairs.length
      ? stairs.map((leaf) => leaf.id)
      : intent.leaves.filter(walk).map((leaf) => leaf.id),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const leaf of intent.leaves) {
      if (linked.has(leaf.id) || !walk(leaf)) continue;
      if (
        touching(leaf).some((other) => linked.has(other.id) && walk(other) && joined(leaf, other))
      ) {
        linked.add(leaf.id);
        grew = true;
      }
    }
  }

  const cut: string[] = [];
  const fine: string[] = [];
  // Phòng có lối vào trên bản phác nhưng CHỈ qua ô thang, mà loại phòng ấy không được mở cửa từ ô thang
  // (T74). Lượt thật 4b0268b1: vòng 2 chỉ báo `bedroom_5`, im lặng về `wc_4` chỉ giáp ô thang — mô hình
  // sửa xong `bedroom_5` thì lộ `wc_4`, hết lượt sửa. Báo cùng một lượt (Haan chọn 25/09/2026).
  const stairOnly: string[] = [];
  const stairLeafIds = new Set(
    intent.leaves.filter((l) => l.types.some((t) => input.stairTypes.includes(t))).map((l) => l.id),
  );
  for (const leaf of intent.leaves) {
    if (!touching(leaf).length && !cells.some((row) => row.some((id) => leafOf(id) === leaf.id)))
      continue;
    if (leaf.types.some((type) => passage.entryThrough.has(type))) continue;
    if (leaf.types.every((type) => input.groups.outdoor.has(type))) continue;
    // Hộp kỹ thuật, giếng trời… không cần cửa (`no_door_required`). Lượt 8efa35a6 báo nhầm `shaft_1`.
    if (leaf.types.every((type) => input.groups.noDoorRequired.has(type))) continue;
    if (walk(leaf)) {
      if (!linked.has(leaf.id)) cut.push(leaf.id);
      continue;
    }
    const hosts = touching(leaf).filter((other) => {
      if (!joined(leaf, other)) return false;
      if (other.id === leaf.ensuiteOf) return true;
      if (walk(other)) return linked.has(other.id);
      return leaf.types.some((type) =>
        other.types.some((host) => passage.servedFrom.get(type)?.has(host)),
      );
    });
    if (!hosts.length) cut.push(leaf.id);
    else if (
      hosts.every((host) => stairLeafIds.has(host.id)) &&
      !opensFromStair(passage.stairOpensTo, leaf.types)
    ) {
      stairOnly.push(leaf.id);
    } else fine.push(leaf.id);
  }
  const quote = (ids: string[]) => ids.map((id) => `"${id}"`).join(', ');
  const minCells = Math.ceil(
    ((input.construction.openings.door?.width_m ?? 0.9) * 100 + 2 * marginCm + wallCm) / cellCm -
      1e-9,
  );
  if (!cut.length) {
    if (!stairOnlyAlone || !stairOnly.length) return null;
    return arrangeIssue(
      'sketch_stair_only',
      `Bản phác tầng ${input.level}: ${quote(stairOnly)} chỉ vào được qua ô thang — ô thang chỉ mở cửa sang hành lang, khu sinh hoạt chung, sân thượng, thang máy.`,
      { rooms: quote(stairOnly), door_cells: minCells },
      stairOnly[0],
    );
  }
  const rooms = quote(cut);
  // Kèm ngay các phòng chỉ vào được qua ô thang, bằng một câu tiếng Anh cho câu nhắc (`{also}`).
  const also = stairOnly.length
    ? ` Also, ${quote(stairOnly)} can only be entered from the stair, which only corridors, the living/dining space, the roof terrace and the elevator may open off — give each a wall of at least ${minCells} cells on a corridor or shared room in the same change.`
    : '';
  const alsoVi = stairOnly.length ? ` Thêm: ${quote(stairOnly)} chỉ vào được qua ô thang.` : '';
  // Ô THANG bị cô lập: không phòng đi xuyên được nào (hành lang, khách, ăn) nối về nó. Mọi phòng của tầng
  // khi ấy đều «không có lối vào», nhưng liệt kê cả tầng thì chỉ sai chỗ — lượt b5202883 đặt thang máy chắn
  // giữa thang bộ và hành lang, câu nhắc kể bảy phòng, dặn GIỮ nguyên thang máy, và mô hình nộp lại y nguyên
  // ba lượt. Nói đúng chỗ hỏng: ô thang chỉ giáp những gì, và bỏ danh sách «giữ nguyên» (Haan 25/09/2026).
  const stairIds = new Set(stairs.map((leaf) => leaf.id));
  if (stairs.length && ![...linked].some((id) => !stairIds.has(id))) {
    const stair = stairs[0]!;
    const around = touching(stair).map((leaf) => leaf.id);
    return arrangeIssue(
      'sketch_stair_isolated',
      mode === 'touch'
        ? `Bản phác tầng ${input.level}: ô thang "${stair.id}" không chạm hành lang / phòng sinh hoạt chung nào (chỉ giáp ${quote(around) || 'không phòng nào'}) — lên tới tầng này là không đi tiếp được.${alsoVi}`
        : `Bản phác tầng ${input.level}: ô thang "${stair.id}" chỉ chạm hành lang / phòng sinh hoạt chung bằng đoạn tường ngắn hơn ${minCells} ô liền (đang giáp ${quote(around)}) — không đủ chỗ ra vào.${alsoVi}`,
      { stair: stair.id, touching: quote(around) || 'nothing', door_cells: minCells, also },
      stair.id,
    );
  }
  // Kèm các phòng ĐANG có lối vào: lượt 8efa35a6 sửa đúng phòng bị báo nhưng mỗi lượt lại làm hở một
  // phòng khác (laundry → wc_4 → phòng thờ → phòng ngủ 5) — câu nhắc chỉ nói phòng hỏng.
  return arrangeIssue(
    'sketch_room_no_access',
    mode === 'touch'
      ? `Bản phác tầng ${input.level}: ${rooms} không chạm hành lang / phòng sinh hoạt chung nào nối về ô thang — không có lối vào.${alsoVi}`
      : `Bản phác tầng ${input.level}: ${rooms} chỉ chạm đường về ô thang bằng đoạn tường ngắn hơn ${minCells} ô liền — không đủ chỗ đặt cửa.${alsoVi}`,
    { rooms, keep: fine.length ? quote(fine) : 'none', door_cells: minCells, also },
    cut[0],
  );
}

/**
 * Phòng đầu bài khai diện tích mà bản phác vẽ hụt QUÁ `sketch.area_slack_ratio` (`kb/construction_norms`)
 * — `null` khi không có. Ước lượng lạc quan như `belowFloorCell`: lọt lòng = chữ nhật bao các ô trừ một
 * tường ngăn mỗi chiều. Hụt trong tỉ lệ ấy thì bộ xếp tự dời vách; tệp dữ liệu không khai thì không kiểm. Phòng gộp mở (`merged`) để phép kiểm cuối lo: tổng
 * hai chữ nhật trên bản phác không nói được phần nào thuộc phòng nào.
 */
function sketchBelowBrief(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
): PlanIssue | null {
  const read = input.briefMinAreaM2;
  const slack = input.construction.sketch?.area_slack_ratio;
  if (!read || slack === undefined) return null;
  const wallCm = Math.round(input.construction.walls.partition_m * 100);
  for (const leaf of intent.leaves) {
    if (leaf.merged.length) continue;
    const floor = read(leaf.id);
    const rect = floor ? sketchRectOf(sketch, leaf.id) : null;
    if (!floor || !rect) continue;
    const drawn = clearAreaM2(rect.x1 - rect.x0, rect.y1 - rect.y0, wallCm);
    if (drawn >= floor * (1 - slack)) continue;
    return arrangeIssue(
      'arrange_room_below_brief_area',
      `Bản phác tầng ${input.level} vẽ phòng "${leaf.id}" chỉ đủ khoảng ${round2(drawn)} m² — đầu bài khai tối thiểu ${floor} m².`,
      {
        room: leaf.id,
        min_m2: floor,
        area_m2: round2(drawn),
        zone: zoneOfRect(sketch.footprint, rect),
      },
      leaf.id,
    );
  }
  return null;
}

/**
 * Mức TỐI THIỂU một phòng được lùi tới khi nhường ô cho phòng thiếu sàn (T91, Haan 27/09/2026 — «khi có
 * phòng lớn hơn diện tích tối thiểu, hoàn toàn có thể giảm để bù sang»): sàn đầu bài nếu gia chủ khai;
 * không khai thì mức tối thiểu nghề của loại phòng (`kb/space_norms.yaml` `min_m2`); không có nữa thì
 * mục tiêu mô hình tự đặt trừ tỉ lệ nới. Ô lõi và hành lang không nhường (`null`).
 */
function roomMinimumM2(input: ArrangeInput, id: string): number | null {
  const space = input.program.spaces.find((item) => item.id === id);
  if (!space) return null;
  const fixed = new Set([...input.stairTypes, 'elevator', 'light_well', 'core', 'circulation']);
  if (fixed.has(space.type)) return null;
  const slack = input.construction.sketch?.area_slack_ratio ?? 0;
  return (
    input.briefMinAreaM2?.(id) ??
    input.areaNorms?.get(space.type)?.min ??
    space.target_area_m2 * (1 - slack)
  );
}

/** Tổng phần dư (m² lọt lòng ước lượng) của cả tầng trên bản phác, trừ phòng đang thiếu. */
function levelSpare(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
  short: string,
): { total: number; rooms: { id: string; m2: number }[] } {
  void intent;
  const { footprint, grid } = sketch;
  const cellM2 =
    (((footprint.x1 - footprint.x0) / grid.cols) * ((footprint.y1 - footprint.y0) / grid.rows)) /
    1e4;
  const count = new Map<string, number>();
  let empty = 0;
  for (const row of grid.cells) {
    for (const id of row) {
      if (id) count.set(id, (count.get(id) ?? 0) + 1);
      else empty += 1;
    }
  }
  const rooms: { id: string; m2: number }[] = [];
  for (const [id, cells] of count) {
    if (id === short) continue;
    const min = roomMinimumM2(input, id);
    if (min === null) continue;
    const spare = (cells * cellM2) / GROSS_FACTOR - min;
    if (spare > 0) rooms.push({ id, m2: spare });
  }
  // Ô trống trong lưới (mô hình để làm sân) cũng là chỗ bù được — lượt 011b4adc để trống 40/192 ô mà
  // vẽ phòng khách 28 ô cho mức 45 m². Chỉ khi không còn phòng dư LẪN ô trống mới là «hết cách».
  if (empty > 0) rooms.push({ id: '.', m2: (empty * cellM2) / GROSS_FACTOR });
  rooms.sort((p, q) => q.m2 - p.m2 || p.id.localeCompare(q.id));
  return { total: rooms.reduce((sum, room) => sum + room.m2, 0), rooms };
}

/**
 * Phần dư (m² lọt lòng ước lượng) của một phòng trên bản phác/**
 * Phần dư (m² lọt lòng ước lượng) của một phòng trên bản phác sau khi nhường `remainingCells` ô còn lại
 * (T79) — `null` khi không được lấy của nó: ô lõi (thang bộ, thang máy, giếng trời), phòng đi xuyên
 * (hành lang), phòng sẽ hụt mức đầu bài hoặc mục tiêu của chính nó (trừ tỉ lệ `area_slack_ratio`).
 */
function sketchSpare(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
  other: string,
  remainingCells: number,
): number | null {
  const leaf = intent.leaves.find((item) => item.id === other);
  if (!leaf || leaf.merged.length) return null;
  const through = input.groups.passage?.through ?? new Set<string>();
  const fixed = new Set([...input.stairTypes, 'elevator', 'light_well', 'core']);
  if (leaf.types.some((type) => fixed.has(type) || through.has(type))) return null;
  const { footprint, grid } = sketch;
  const cellM2 =
    (((footprint.x1 - footprint.x0) / grid.cols) * ((footprint.y1 - footprint.y0) / grid.rows)) /
    1e4;
  const clear = (remainingCells * cellM2) / GROSS_FACTOR;
  const slack = input.construction.sketch?.area_slack_ratio ?? 0;
  // Mức đầu bài khai là sàn CỨNG; không khai thì giữ mục tiêu mô hình tự đặt (trừ tỉ lệ nới). Phòng
  // nhường có sàn đầu bài thì được lùi tới sàn ấy — mục tiêu mô hình đặt cho nó chỉ là mong muốn.
  const floor = input.briefMinAreaM2?.(other) ?? null;
  const target = input.program.spaces.find((space) => space.id === other)?.target_area_m2 ?? 0;
  const need = floor ?? target * (1 - slack);
  return clear >= need ? clear - need : null;
}

/**
 * Phòng hụt diện tích đầu bài: kèm SỐ Ô bản phác đang vẽ và số ô cần vẽ, để lượt sửa biết vẽ to bao
 * nhiêu. Lượt đo 011b4adc: câu nhắc chỉ nói «vẽ thêm ô», phòng làm việc nhích 7,7 → 8,9 → 10,3 m² qua ba
 * lượt sửa (cần 13 m²) rồi hết lượt.
 *
 * m² mỗi ô: mức ĐO được (diện tích ra / số ô) — phòng nhỏ mất nhiều diện tích cho tường hơn, nên mức
 * đo sát hơn mọi hệ số chung. Mức đo dưới nửa mức danh định (ô lưới trừ hệ số tường `GROSS_FACTOR`) thì
 * diện tích ấy không đến từ bản phác (cách chia khác co phòng lại): dùng mức danh định.
 */
function withSketchCells(issue: PlanIssue, sketch: PreparedSketch): PlanIssue {
  if (issue.code !== 'arrange_room_below_brief_area') return issue;
  const room = String(issue.params?.room ?? '');
  const minM2 = Number(issue.params?.min_m2);
  const areaM2 = Number(issue.params?.area_m2);
  const cells = sketch.grid.cells.flat().filter((id) => id === room).length;
  if (!cells || !(minM2 > 0)) return issue;
  const { footprint, grid } = sketch;
  const cellM2 =
    (((footprint.x1 - footprint.x0) / grid.cols) * ((footprint.y1 - footprint.y0) / grid.rows)) /
    1e4;
  const nominal = cellM2 / GROSS_FACTOR;
  const observed = areaM2 > 0 ? areaM2 / cells : 0;
  const perCell = observed >= nominal / 2 ? observed : nominal;
  const needCells = Math.max(cells + 1, Math.ceil(minM2 / perCell));
  return { ...issue, params: { ...issue.params, cells, need_cells: needCells } };
}

/**
 * Phòng hụt sàn đầu bài mà KHÔNG phòng kề nào nhường được ô (T89): câu nhắc «lấy ô của phòng kề còn dư»
 * là chỉ đường cụt. Lượt thật bc504189 vòng 3: `bedroom_1` (sàn 20 m²) kề `living_1` (sàn 45 m², đang
 * đúng 50 ô), `bedroom_2` (sàn 15 m²), ô thang — mô hình ba lần nới bằng cách đẩy lấn, làm ô thang ngắn
 * còn 3,89 m, hết lượt. Kèm tên các phòng kề đã chạm mức (`tight`) và các phòng TRONG TẦNG còn dư
 * (`spare`, m² dư ước lượng) để câu nhắc bảo xếp lại dải phòng, lấy chỗ từ đúng nơi có chỗ.
 */
function adviseShort(
  input: ArrangeInput,
  intent: LevelIntent,
  issue: PlanIssue,
  sketch: PreparedSketch,
): PlanIssue {
  if (issue.code !== 'arrange_room_below_brief_area' || issue.params?.need_cells === undefined) {
    return issue;
  }
  const room = String(issue.params.room ?? '');
  const cells = sketch.grid.cells;
  const count = new Map<string, number>();
  for (const row of cells) for (const id of row) if (id) count.set(id, (count.get(id) ?? 0) + 1);
  const neighbours = new Set<string>();
  cells.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id !== room) return;
      for (const other of [cells[r - 1]?.[c], cells[r + 1]?.[c], row[c - 1], row[c + 1]]) {
        if (other && other !== room) neighbours.add(other);
      }
    }),
  );
  // «Nhường được» = còn dư sau khi mất số ô còn thiếu, xét CHÍNH phòng ấy (không theo lá gộp khách + ăn +
  // bếp như bộ nới phòng), lùi tới mức tối thiểu của nó (`roomMinimumM2`, T91).
  const { footprint, grid } = sketch;
  const cellM2 =
    (((footprint.x1 - footprint.x0) / grid.cols) * ((footprint.y1 - footprint.y0) / grid.rows)) /
    1e4;
  const spareAt = (id: string, remaining: number): number | null => {
    const need = roomMinimumM2(input, id);
    if (need === null) return null;
    const clear = (remaining * cellM2) / GROSS_FACTOR;
    return clear >= need ? clear - need : null;
  };
  // Phải nhường được ĐỦ số ô còn thiếu: phòng bớt một ô vẫn trên sàn mà bớt đủ thì hụt là không cứu được.
  const deficit = Math.max(1, Number(issue.params.need_cells) - (count.get(room) ?? 0));
  const canGive = (id: string) => spareAt(id, (count.get(id) ?? 0) - deficit) !== null;
  if ([...neighbours].some(canGive)) return issue;
  const spare = [...count.keys()]
    .filter((id) => id !== room)
    .map((id) => ({ id, m2: spareAt(id, count.get(id)!) }))
    .filter((item): item is { id: string; m2: number } => item.m2 !== null && item.m2 >= 1)
    .sort((p, q) => q.m2 - p.m2 || p.id.localeCompare(q.id))
    .slice(0, 3);
  return {
    ...issue,
    params: {
      ...issue.params,
      tight: [...neighbours]
        .sort()
        .map((id) => `"${id}"`)
        .join(', '),
      spare: spare.length
        ? spare.map((item) => `"${item.id}" (about ${Math.floor(item.m2)} m² spare)`).join(', ')
        : 'none',
    },
  };
}

/** Chuẩn hoá ý định của một tầng — vùng từ bản phác thì không giới hạn số phòng mỗi vùng. */
function intentFor(
  input: ArrangeInput,
  raw: AiPlanIntent,
  spaces: AiSpaceProgram['spaces'],
  footprint: Rect,
  fromSketch: boolean,
): LevelIntent {
  const cols = footprint.x1 - footprint.x0 >= SPLIT_MIN_CM;
  const rows = footprint.y1 - footprint.y0 >= SPLIT_MIN_CM;
  return normaliseIntent(raw, {
    level: input.level,
    spaces,
    groups: input.groups,
    mergeAllowed: input.mergeAllowed,
    zoneDefaults: input.zoneDefaults,
    anchorZones: input.anchors
      ? {
          stair: input.anchors.stair
            ? effectiveZoneOfRect(input.anchors.footprint, input.anchors.stair)
            : null,
          lightWells: input.anchors.lightWells.map((well) =>
            effectiveZoneOfRect(input.anchors!.footprint, well),
          ),
          wetRooms: input.anchors.wetRooms.map((wc) =>
            effectiveZoneOfRect(input.anchors!.footprint, wc),
          ),
          elevators: (input.anchors.elevators ?? []).map((lift) =>
            effectiveZoneOfRect(input.anchors!.footprint, lift),
          ),
        }
      : null,
    isWet: (type) => input.construction.openingRules.wc_door_types.includes(type),
    sameZone: (a, b) => projectedDistance(footprint, a, b) === 0,
    touchesOpenFace: (zone) => {
      const { col, row } = ZONE_CELL[zone];
      return input.openFaces.some((face) =>
        face === 'front'
          ? !rows || row === 0
          : face === 'back'
            ? !rows || row === 2
            : face === 'left'
              ? !cols || col === 0
              : !cols || col === 2,
      );
    },
    // Vùng suy từ hình mô hình vẽ: mười phòng nhỏ trong một phần ba khối nhà là hình có thật, không
    // phải ý đồ dồn vùng.
    maxPerZone: fromSketch ? Number.POSITIVE_INFINITY : (cols ? 3 : 5) + (rows ? 1 : 2),
  });
}

/** Vùng và mặt đường của mọi phòng CÓ trên bản phác thay cho vùng khai (hợp đồng trước T48). */
function withSketchZones(intent: AiPlanIntent, sketch: PreparedSketch): AiPlanIntent {
  const drawn = [...sketch.rooms].map(([id, room]) => ({
    id,
    zone: room.zone,
    street_facing: room.street,
  }));
  return {
    ...intent,
    rooms: [...drawn, ...intent.rooms.filter((room) => !sketch.rooms.has(room.id))],
  };
}

interface RingOutcome {
  winner: Ranked | null;
  ring: number;
  passed: number;
  built: number;
}

/** Bốn vòng nới vùng, mỗi vòng khung thường rồi hành lang chữ T/L. Dừng ở vòng đầu có cây qua cổng. */
function runRings(
  input: ArrangeInput,
  intent: LevelIntent,
  footprints: readonly Rect[],
  remember: (issues: PlanIssue[], filtered?: boolean) => void,
  failedGeometry: Set<string>,
): RingOutcome {
  let built = 0;
  for (let ring = 0; ring <= LAST_RING; ring += 1) {
    // Hành lang chữ T/L là phương án DỰ PHÒNG (V-29): chỉ dựng khi không cây thường nào qua cổng ở vòng
    // này. Thử song song thì nhánh hay thắng xếp hạng một tầng dù chỉ là một đoạn hành lang cụt — biệt
    // thự mẫu tụt điểm cả nhà 55,5 → 53,8.
    let passed: Ranked[] = [];
    for (const mode of ['plain', 'tee'] as const) {
      const candidates: Built[] = [];
      const seen = new Set<string>();
      for (const footprint of footprints) {
        for (const candidate of buildCandidates(input, intent, footprint, ring, mode)) {
          if ('issues' in candidate) {
            remember(candidate.issues, candidate.filtered === true);
            continue;
          }
          const signature = geometrySignature(candidate.tree);
          if (seen.has(signature)) continue;
          seen.add(signature);
          candidates.push(candidate);
        }
      }
      built += candidates.length;
      candidates.sort(
        (p, q) =>
          p.reasons.length - q.reasons.length ||
          p.penalty - q.penalty ||
          p.key.localeCompare(q.key),
      );
      passed = gateCandidates(
        input,
        intent,
        candidates.filter((candidate) => !failedGeometry.has(geometrySignature(candidate.tree))),
        remember,
        failedGeometry,
      );
      if (passed.length > 0) break;
    }
    if (passed.length === 0) continue;
    return { winner: best(passed), ring, passed: passed.length, built };
  }
  return { winner: null, ring: LAST_RING, passed: 0, built };
}

function best(passed: Ranked[]): Ranked {
  return [...passed].sort(compareRanked)[0]!;
}

/**
 * Thứ tự ứng viên đã qua cổng — âm khi `p` đứng trước. Bậc đầu: WC chung thẳng trục (T71) — phương án
 * thẳng trục thắng phương án lệch dù điểm thấp hơn; bậc hai: tầng 1 giữ ô thang / thang máy đúng chỗ bản
 * phác (T73); bậc ba: ban công còn đủ mặt bản phác vẽ (T92); bậc bốn: phòng ngoài trời ra được mặt thoáng
 * (T96); rồi điểm, độ khớp ý định, phạt, khoá (tất định).
 */
export function compareRanked(
  p: Pick<Ranked, 'stacked' | 'total'> &
    Partial<Pick<Ranked, 'atSketch' | 'balconiesKept' | 'onFace'>> & {
      fit: { total: number };
      candidate: { penalty: number; key: string };
    },
  q: Pick<Ranked, 'stacked' | 'total'> &
    Partial<Pick<Ranked, 'atSketch' | 'balconiesKept' | 'onFace'>> & {
      fit: { total: number };
      candidate: { penalty: number; key: string };
    },
): number {
  return (
    Number(q.stacked) - Number(p.stacked) ||
    Number(q.atSketch ?? true) - Number(p.atSketch ?? true) ||
    Number(q.balconiesKept ?? true) - Number(p.balconiesKept ?? true) ||
    Number(q.onFace ?? true) - Number(p.onFace ?? true) ||
    q.total - p.total ||
    q.fit.total - p.fit.total ||
    p.candidate.penalty - q.candidate.penalty ||
    p.candidate.key.localeCompare(q.candidate.key)
  );
}

/** Cây thắng → kết quả: căn vách theo diện tích, ghi chú vòng nới. */
function finish(
  input: ArrangeInput,
  intent: LevelIntent,
  notes: DrawNote[],
  winner: Ranked,
  counts: { candidates: number; passed: number; relaxed: number },
  program?: AiSpaceProgram,
): ArrangeResult {
  // Căn vách theo diện tích chương trình CHỈ cho cây thắng — cùng bước `layoutLevel` vẫn làm (T40).
  const winnerInput = inputFor(input, winner.candidate);
  const final = input.minSideM ? gate(winnerInput, winner.candidate.tree, true) : winner.layout;
  const layout = final.level ? final : winner.layout;
  const ring = counts.relaxed;
  if (ring > 0) {
    notes.push({
      code: 'arrange_relaxed',
      message: `Tầng ${input.level}: không cây nào giữ trọn vùng mô hình khai qua được cổng kiểm — chương trình ${
        ring === 1
          ? 'nới vùng của phòng phụ'
          : ring === 2
            ? 'nới vùng của mọi phòng trừ lối vào, chỗ để xe và phòng ra mặt đường'
            : 'bỏ vùng mô hình khai, chỉ giữ nhẹ vùng của lối vào, chỗ để xe và phòng ra mặt đường'
      } để xếp được.`,
    });
  }
  const finalProgram = winner.candidate.program ?? program;
  return {
    layout,
    intent,
    summary: {
      candidates: counts.candidates,
      passed: counts.passed,
      intentFit: round3(winner.fit.total),
      parti: winner.candidate.key.slice(0, 120),
      relaxed: ring,
    },
    issues: [],
    notes,
    revisable: false,
    ...(finalProgram ? { program: finalProgram } : {}),
  };
}

/**
 * Bản phác → cây ứng viên → cổng. `reason` là câu ngắn cho ghi chú khi không cây nào qua; `issues` chỉ
 * có khi bản phác không nắn nổi thành cây (lỗi của chính hình vẽ, mô hình sửa được).
 */
function sketchStage(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
  remember: (issues: PlanIssue[], filtered?: boolean) => void,
  failedGeometry: Set<string>,
): {
  winner: Ranked | null;
  passed: number;
  built: number;
  notes: DrawNote[];
  issues: PlanIssue[];
  reason: string | null;
} {
  const { env, stairIds } = environment(input, intent, sketch.footprint, 0);
  const notes: DrawNote[] = [];
  // Ô thang tầng trên phải chồng khít tầng dưới (T38). Mô hình vẽ lệch thì ép, đừng để cả bản phác hỏng
  // vì một ô: lượt 58d9ff66 vẽ thang tầng 2 dài 11 ô trong khi tầng 1 chỉ 3 ô.
  const anchorStair = input.anchors?.stair;
  const stairLeaf = anchorStair ? intent.leaves.find((leaf) => stairIds.has(leaf.id)) : undefined;
  // Ép ô thang / thang máy về đúng ô tầng dưới đã DỰNG có thể xoá trọn một phòng mô hình vẽ ở đó —
  // lượt thật 913bc2ad: bộ xếp kéo ô thang tầng 1 xuống thêm một hàng, ép sang tầng 2 thì xoá sạch dải
  // `wc_4`, rồi mô hình nhận câu «bản phác không vẽ wc_4» mà nó đã vẽ, và nộp lại y nguyên hai lượt.
  // Nói đúng chỗ: ô thang phải nằm ở hàng, cột nào; phòng nào đang vẽ đè lên đó.
  const eaten: PlanIssue[] = [];
  const forceCore = (id: string, rect: Rect, what: string): boolean => {
    const before = sketchIds(sketch);
    const box = forcedCellBox(sketch, rect);
    if (!forceSketchRect(sketch, id, rect)) return false;
    const after = sketchIds(sketch);
    const gone = [...before].filter((other) => other !== id && !after.has(other)).sort();
    if (gone.length) {
      const rooms = gone.map((other) => `"${other}"`).join(', ');
      const rows = `${box.r0 + 1}–${box.r1}`;
      const cols = `${box.c0 + 1}–${box.c1}`;
      eaten.push(
        arrangeIssue(
          'sketch_core_overlap',
          `Bản phác tầng ${input.level}: ${what} "${id}" phải nằm đúng hàng ${rows}, cột ${cols} như tầng dưới đã dựng — ${rooms} vẽ đè lên đó nên mất hết ô.`,
          { level: input.level, core: id, rows, cols, rooms },
          gone[0],
        ),
      );
    }
    return true;
  };
  if (anchorStair && stairLeaf && forceCore(stairLeaf.id, anchorStair, 'ô thang')) {
    notes.push({
      code: 'sketch_stair_forced',
      message: `Bản phác tầng ${input.level} vẽ ô thang "${stairLeaf.id}" lệch ô thang tầng dưới — chương trình đặt lại đúng ô ấy.`,
    });
  }
  // Ô thang máy cũng vậy (23/09/2026): lượt chạy thật đầu tiên sau T71 vẽ ô thang máy CÙNG ô lưới ở
  // hai tầng, nhưng căn vách theo diện tích từng tầng đẩy ô tầng 2 lệch 152 cm và cả tầng hỏng. Ép về
  // đúng ô thang máy tầng dưới đã DỰNG (không phải ô mô hình vẽ), như thang bộ.
  for (const [leaf, rect] of elevatorPairs(input, intent, env, sketch)) {
    if (forceCore(leaf, rect, 'ô thang máy')) {
      notes.push({
        code: 'sketch_elevator_forced',
        message: `Bản phác tầng ${input.level} vẽ ô thang máy "${leaf}" lệch ô thang máy tầng dưới — chương trình đặt lại đúng ô ấy.`,
      });
    }
  }
  // Bản phác THỨ HAI: khu vệ sinh tầng trên ép về đúng ô khu vệ sinh tầng dưới, để trục ống nước thẳng
  // (Q-B, 18/09/2026 — Haan chốt «dời vách tầng trên»). Không ép thẳng lên bản phác đang dùng như ô
  // thang: đo 18/09 trên bốn bản phác thật của `58688ead` và bản `fd3b0b86`, khu vệ sinh tầng trên nằm
  // cách tầng dưới 4–6 m, nên đây là dời cả phòng. Hai bản cùng đi qua cổng; bản nào ra mặt bằng điểm
  // cao hơn thì thắng, nên việc ép không bao giờ làm mất một phương án.
  if (eaten.length) {
    return {
      winner: null,
      passed: 0,
      built: 0,
      notes,
      issues: eaten,
      reason: eaten.map((issue) => issue.message).join(' '),
    };
  }
  const wetBelow = input.anchors?.wetRooms ?? [];
  const wetLeaves = intent.leaves.filter((leaf) => env.leafById.get(leaf.id)?.wet === true);
  let stackedSketch: PreparedSketch | null = null;
  let stackedRooms: string[] = [];
  if (wetBelow.length && wetLeaves.length) {
    const copy = copySketch(sketch);
    stackedRooms = stackWetRooms(copy, {
      below: wetBelow,
      wet: wetLeaves.map((leaf) => leaf.id),
      parentOf: (id) => env.leafById.get(id)?.parent ?? null,
      areaFloor: (id) => env.leafById.get(id)?.areaFloor ?? null,
      wallCm: env.floorWallCm,
    });
    if (stackedRooms.length) stackedSketch = copy;
  }
  const drawn = sketchTrees({
    sketch,
    level: input.level,
    hostOf: intent.hostOf,
    leaves: intent.leaves.map((leaf) => leaf.id),
    weight: (id) => {
      const leaf = env.leafById.get(id);
      return leaf ? packWeight(leaf) : 0;
    },
    minCell: MIN_CELL_CM,
    minExtent: (id, axis, box) => sketchMinExtent(input, env, id, axis, box),
    needArea: (id) => {
      const floor = env.leafById.get(id)?.areaFloor ?? 0;
      return floor > 0 ? floor * FLOOR_SHARE * 10_000 : 0;
    },
    maxAspect: (id) => env.leafById.get(id)?.aspectHard ?? null,
    ensuiteOf: (id) => env.leafById.get(id)?.parent ?? null,
    ...(input.trace ? { trace: input.trace } : {}),
  });
  if (drawn.issues.length) {
    return {
      winner: null,
      passed: 0,
      built: 0,
      notes: [...notes, ...drawn.notes],
      issues: drawn.issues,
      reason: drawn.issues.map((issue) => issue.message).join(' '),
    };
  }
  const candidates: Built[] = [];
  let reason: string | null = null;
  const stackedKeys = new Set<string>();
  const trees = [
    ...drawn.trees.map((tree) => ({ ...tree, stacked: false })),
    ...(stackedSketch
      ? treesOfStacked(input, intent, env, stackedSketch).map((tree) => ({
          ...tree,
          stacked: true,
        }))
      : []),
  ];
  for (const tree of trees) {
    const frame: FrameCandidate = {
      key: tree.stacked ? `${tree.key}-wc` : tree.key,
      placed: tree.placed,
      penalty: evaluate(tree.placed, sketch.footprint, NO_REACH, env),
    };
    const emitted = emitCandidate(input, intent, sketch.footprint, frame, env, stairIds);
    if (!emitted) continue;
    if ('issues' in emitted) {
      remember(emitted.issues, emitted.filtered === true);
      reason ??= emitted.issues[0]?.message ?? null;
      continue;
    }
    if (tree.stacked) stackedKeys.add(frame.key);
    candidates.push(emitted);
  }
  const passed = gateCandidates(
    input,
    intent,
    candidates,
    (issues) => {
      remember(issues);
      reason ??= issues[0]?.message ?? null;
    },
    failedGeometry,
  );
  const winner = passed.length ? best(passed) : null;
  if (winner && stackedKeys.has(winner.candidate.key)) {
    notes.push({
      code: 'sketch_wet_stacked',
      message: `Bản phác tầng ${input.level} vẽ khu vệ sinh ${stackedRooms.map((id) => `"${id}"`).join(', ')} lệch khu vệ sinh tầng dưới — chương trình đặt lại đúng ô ấy để trục ống nước thẳng.`,
    });
  }
  return {
    winner,
    passed: passed.length,
    built: candidates.length,
    notes: [...notes, ...drawn.notes],
    issues: [],
    reason,
  };
}

/** Cây từ bản phác đã ép khu vệ sinh — cùng bộ tham số với bản gốc, chỉ khác lưới ô. */
function treesOfStacked(
  input: ArrangeInput,
  intent: LevelIntent,
  env: PackEnv,
  sketch: PreparedSketch,
): { key: string; placed: Placed }[] {
  return sketchTrees({
    sketch,
    level: input.level,
    hostOf: intent.hostOf,
    leaves: intent.leaves.map((leaf) => leaf.id),
    weight: (id) => {
      const leaf = env.leafById.get(id);
      return leaf ? packWeight(leaf) : 0;
    },
    minCell: MIN_CELL_CM,
    minExtent: (id, axis, box) => sketchMinExtent(input, env, id, axis, box),
    needArea: (id) => {
      const floor = env.leafById.get(id)?.areaFloor ?? 0;
      return floor > 0 ? floor * FLOOR_SHARE * 10_000 : 0;
    },
    maxAspect: (id) => env.leafById.get(id)?.aspectHard ?? null,
    ensuiteOf: (id) => env.leafById.get(id)?.parent ?? null,
    ...(input.trace ? { trace: input.trace } : {}),
  }).trees;
}

/**
 * Cạnh nhỏ nhất một lá cần theo trục khi căn vách bản phác, cm: mọi lá lấy mức kỹ thuật (cửa, cạnh dùng
 * được); ô thang có thang đi lên lấy thêm chiều dài theo SỐ BẬC dọc cạnh dài của nó — cạnh ngắn quyết
 * một vế hay hai vế. Lượt 58d9ff66 hỏng vì ô thang căn ra 3 m trong khi 21 bậc cần 3,3 m.
 */
function sketchMinExtent(
  input: ArrangeInput,
  env: PackEnv,
  id: string,
  axis: Axis,
  box: { w: number; h: number },
): number {
  const leaf = env.leafById.get(id);
  const base = Math.max(MIN_CELL_CM, leaf?.techMin ?? 0);
  if (!leaf?.stair || input.isTop) return base;
  const construction = input.construction;
  const wallCm = Math.round(construction.walls.partition_m * 100);
  // Ô thang HAI VẾ, mức hẹp nhất dựng được: rộng theo `two_flights_min_width_m`, dài theo số bậc. Đo
  // theo đúng bề rộng mô hình vẽ thì thang 2 m thành một vế và đòi 5 m dài — bản phác nào cũng hỏng,
  // trong khi bộ xếp vẫn dựng được thang hai vế 2,4 × 3,3 m ở chính chỗ ấy (lượt 58d9ff66).
  const widthCm = construction.stairs.two_flights_min_width_m * 100;
  const treads = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
  const run = stairRunNeedCm(construction, { flights: 2, treads, acrossCm: widthCm });
  const alongX = box.w >= box.h;
  const need = (axis === 'x') === alongX ? (run ?? 0) : widthCm;
  return Math.max(base, ceil5(need + wallCm));
}

/** Phần sàn một hành lang chèn thêm lấy theo cạnh dài khối nhà (A, T48). */
const HALL_LENGTH_SHARE = 0.5;
/** Hành lang chèn thêm không nhỏ hơn, m². */
const HALL_MIN_M2 = 4;

/**
 * Chương trình và đầu vào có thêm MỘT hành lang cho tầng — `null` khi tầng đã có hành lang, khi vocabulary
 * không có loại hành lang, hoặc khi thêm vào thì tầng vượt khối xây.
 */
function hallInput(
  input: ArrangeInput,
  spaces: AiSpaceProgram['spaces'],
  footprints: readonly Rect[],
  /** Tầng đã có hành lang vẫn được thêm một dải nữa — khi lý do hỏng là đường đi vòng qua khu phục vụ. */
  evenWithCorridor = false,
): { input: ArrangeInput; id: string; zone: Zone; area: number } | null {
  const corridorTypes = [...input.groups.vertical]
    .filter((type) => !input.stairTypes.includes(type))
    .sort();
  const type = corridorTypes[0];
  if (!type) return null;
  const corridors = spaces.filter((space) => corridorTypes.includes(space.type)).length;
  if (corridors > (evenWithCorridor ? 1 : 0)) return null;
  const footprint = footprints[0]!;
  const clear = input.construction.circulation?.corridor_clear_m ?? 1.2;
  const long = Math.max(footprint.x1 - footprint.x0, footprint.y1 - footprint.y0) / 100;
  const area = Math.max(HALL_MIN_M2, round1(clear * long * HALL_LENGTH_SHARE));
  const need = spaces.reduce((sum, space) => sum + space.target_area_m2, 0) + area;
  const have = Math.max(...footprints.map((f) => ((f.x1 - f.x0) * (f.y1 - f.y0)) / 10_000));
  if (need > have) return null;
  const id = nextSpaceId(input.program, type);
  const zone: Zone = input.anchors?.stair
    ? effectiveZoneOfRect(input.anchors.footprint, input.anchors.stair)
    : 'center';
  const program: AiSpaceProgram = {
    ...input.program,
    spaces: [
      ...input.program.spaces,
      { id, type, level: input.level, target_area_m2: area, ensuite_of: null },
    ],
  };
  return { input: { ...input, program }, id, zone, area };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

/** Đưa ứng viên rẻ phạt nhất qua cổng, trả những cây đã qua kèm điểm xếp hạng. */
function gateCandidates(
  input: ArrangeInput,
  intent: LevelIntent,
  candidates: readonly Built[],
  remember: (issues: PlanIssue[], filtered?: boolean) => void,
  failedGeometry: Set<string>,
): Ranked[] {
  const passed: Ranked[] = [];
  const gated = input.budget?.gated ?? GATED_PER_ROUND * 2;
  for (let i = 0; i < Math.min(candidates.length, gated); i += 1) {
    if (i >= GATED_PER_ROUND && passed.length > 0) break;
    const candidate = candidates[i]!;
    const scoped = inputFor(input, candidate);
    const layout = gate(scoped, candidate.tree, false);
    if (!layout.level) {
      input.trace?.(
        `  ✗ ${candidate.key} phạt ${candidate.penalty.toFixed(1)}: ${layout.issues.map((issue) => issue.code).join(', ')} ## ${layout.issues.map((issue) => issue.message).join(' | ')}`,
      );
      // Chỉ vướng luật bắt buộc (T71): cây đã dựng xong, nên các lý do dự đoán trước cổng không còn
      // đúng — báo đúng luật ấy, để lượt sửa của mô hình nhắm trúng chỗ.
      const mandatoryOnly =
        layout.issues.length > 0 &&
        layout.issues.every((issue) => MANDATORY_CODE_SET.has(issue.code));
      remember(mandatoryOnly ? layout.issues : [...candidate.reasons, ...layout.issues]);
      failedGeometry.add(geometrySignature(candidate.tree));
      continue;
    }
    const ranked = rank(scoped, intent, candidate, layout);
    input.trace?.(
      `  ✓ ${candidate.key} phạt ${candidate.penalty.toFixed(1)} tổng ${ranked.total.toFixed(1)} khớp ${ranked.fit.total.toFixed(2)} | ${layout.level.rooms.map((r) => `${r.id}:${r.area_m2}`).join(' ')}`,
    );
    passed.push(ranked);
  }
  return passed;
}

// ── Ứng viên ─────────────────────────────────────────────────────────────────────────────

interface Built {
  key: string;
  tree: AiPlanTree;
  penalty: number;
  footprint: Rect;
  /** Lý do cấu trúc bộ giải tự thấy (phòng không lối vào) — ứng viên vẫn qua cổng thử, xếp sau. */
  reasons: PlanIssue[];
  /** Chương trình đã thêm nhánh hành lang khi cây này dùng hành lang chữ T/L (V-29). */
  program?: AiSpaceProgram;
}

/**
 * Chữ ký HÌNH HỌC của một cây: tập lá kèm chữ nhật, không phụ thuộc thứ tự nhát cắt. Hai cây chia cùng
 * một mặt bằng theo thứ tự cắt khác nhau (cắt dọc trước hay ngang trước) ra cùng phòng, cùng cửa.
 */
function geometrySignature(tree: AiPlanTree): string {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const out: string[] = [];
  const visit = (id: string, r: readonly number[]) => {
    const node = byId.get(id);
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = r;
    if (!node) {
      out.push(`${id}:${x0},${y0},${x1},${y1}`);
      return;
    }
    if (node.cut === 'x') {
      visit(node.a, [x0, y0, node.at, y1]);
      visit(node.b, [node.at, y0, x1, y1]);
    } else {
      visit(node.a, [x0, y0, x1, node.at]);
      visit(node.b, [x0, node.at, x1, y1]);
    }
  };
  const root = tree.nodes[0];
  if (root) visit(root.id, tree.footprint);
  else out.push(tree.footprint.join(','));
  return out.sort().join(';');
}

/** Đầu vào của cổng và bộ chấm cho một ứng viên — chương trình của ứng viên khi nó tách hành lang. */
function inputFor(input: ArrangeInput, candidate: Built): ArrangeInput {
  return candidate.program ? { ...input, program: candidate.program } : input;
}

function buildCandidates(
  input: ArrangeInput,
  intent: LevelIntent,
  footprint: Rect,
  ring: number,
  mode: 'plain' | 'tee',
): (Built | { issues: PlanIssue[]; filtered?: boolean })[] {
  const { env, items, corridorIds, stairIds } = environment(input, intent, footprint, ring);
  const exterior = Math.round(input.construction.walls.exterior_m * 100);
  const partition = Math.round(input.construction.walls.partition_m * 100);
  const clear = Math.round(
    (input.construction.circulation?.corridor_clear_m ??
      input.construction.openings.door?.width_m ??
      0.9) * 100,
  );
  const frameInput = {
    footprint,
    items,
    env,
    corridorWidth: {
      edge: ceil5(clear + exterior + partition / 2),
      inner: ceil5(clear + partition),
    },
    corridorIds,
    stairIds,
    ...(input.trace ? { trace: input.trace } : {}),
  };
  // Tầng trên: khung khoét mốc trước (chắc chắn đúng mốc), khung thường sau (phải ép mốc, hay hỏng).
  const forced = forcedCells(input, items, stairIds, env);
  const frames =
    mode === 'tee'
      ? []
      : [
          ...enumerateCarved(frameInput, forced),
          ...corridorStrips(
            input,
            items,
            corridorIds,
            forced,
            frameInput.corridorWidth.inner,
          ).flatMap((strip) =>
            enumerateCarved(frameInput, [...forced, strip]).map((frame) => ({
              ...frame,
              key: `${frame.key}|hl${strip.rect.x0},${strip.rect.y0},${strip.rect.x1},${strip.rect.y1}`,
            })),
          ),
          ...enumerateFrames(frameInput),
        ];
  input.trace?.(
    `tầng ${input.level} vòng ${ring} hình bao ${footprintKey(footprint, input.buildableCm)}: ${frames.length} khung`,
  );

  const out: (Built | { issues: PlanIssue[]; filtered?: boolean })[] = [];
  const emit = (frame: FrameCandidate, frameEnv: PackEnv, program?: AiSpaceProgram) => {
    const emitted = emitCandidate(input, intent, footprint, frame, frameEnv, stairIds, program);
    if (emitted) out.push(emitted);
  };
  for (const frame of frames) emit(frame, env);

  // Hành lang chữ T/L (V-29): dải áp thang + một nhánh vuông góc tới tường bao. Chỉ ở lượt `tee`.
  const tees =
    mode === 'tee'
      ? corridorTees(input, items, corridorIds, forced, env, frameInput.corridorWidth.inner)
      : [];
  for (const tee of tees) {
    const teeEnv: PackEnv = { ...env, leafById: tee.leafById };
    const teeInput = { ...frameInput, env: teeEnv, corridorIds: tee.corridorIds };
    const key = [tee.base, ...tee.branches]
      .map(
        (cell, i) =>
          `${i ? 'nh' : 'hl'}${cell.rect.x0},${cell.rect.y0},${cell.rect.x1},${cell.rect.y1}`,
      )
      .join('|');
    for (const frame of enumerateCarved(teeInput, [...forced, tee.base, ...tee.branches])) {
      emit({ ...frame, key: `${frame.key}|${key}` }, teeEnv, tee.program);
    }
  }
  return out;
}

/**
 * Một khung (hoặc cây nắn từ bản phác) → ứng viên: ép mốc tầng dưới, lọc ô chắc chắn hỏng, đặt cửa.
 * `null` khi cây rỗng hoặc không đặt được cửa nào.
 */
function emitCandidate(
  input: ArrangeInput,
  intent: LevelIntent,
  footprint: Rect,
  frame: FrameCandidate,
  frameEnv: PackEnv,
  stairIds: ReadonlySet<string>,
  program?: AiSpaceProgram,
): Built | { issues: PlanIssue[]; filtered?: boolean } | null {
  const pinned = pinAnchors(input, frame, frameEnv, stairIds);
  if ('issues' in pinned) {
    input.trace?.(`  ⊘ ${frame.key}: không ép được mốc`);
    return pinned;
  }
  const cells = leaves(pinned.placed);
  const unusable =
    unusableCell(input, cells, frameEnv) ??
    shortStairCell(input, cells, stairIds) ??
    belowFloorCell(input, cells, frameEnv);
  if (unusable) {
    // Lọc TRƯỚC cổng: cây có ô chắc chắn hỏng điều kiện dùng được không được tiêu ngân sách qua cổng
    // (V-28 — lọc ở cổng thì 24 cây rẻ phạt nhất đều hỏng và tầng không ra cây nào). Lý do vẫn đi ra:
    // không cây nào qua thì mô hình phải biết là thang quá ngắn, không phải «không dựng được gì».
    input.trace?.(`  ⊘ ${frame.key}: ${unusable.message}`);
    return { issues: [unusable], filtered: true };
  }
  const doors = deriveDoors({
    level: input.level,
    isTop: input.isTop,
    cells,
    leafById: frameEnv.leafById,
    intent,
    doorHosts: input.groups.doorHosts ?? [],
    doorShared: frameEnv.doorShared,
    mainEntranceDeclared: input.entrances.main !== null,
    stairUp: input.anchors?.stairUp ?? null,
    stairIds,
    circulation: input.groups.vertical,
    openFlow: input.groups.passage?.openFlow ?? null,
    stairOpensTo: input.groups.passage?.stairOpensTo ?? null,
    mainSide:
      input.level === 1 && input.entrances.main
        ? { footprint, side: FACE_SIDE[input.entrances.main] }
        : null,
  });
  const nodes = emitNodes(pinned.placed);
  if (nodes.length === 0 || doors.doors.length === 0) return null;
  return {
    key: `${footprintKey(footprint, input.buildableCm)}|${frame.key}`,
    tree: {
      variant_label: input.level === 1 ? intent.variantLabel : null,
      rationale: intent.rationale,
      footprint: [footprint.x0, footprint.y0, footprint.x1, footprint.y1],
      nodes,
      also: doors.also,
      doors: doors.doors,
      stair: doors.stair,
      no_window: [],
    },
    penalty: pinned.penalty,
    footprint,
    reasons: doors.reasons,
    ...(program ? { program } : {}),
  };
}

/**
 * Ô đầu tiên CHẮC CHẮN hỏng điều kiện dùng được, ước lượng từ ô theo tim — `null` khi không có. Ước
 * lượng lạc quan (trừ ít tường nhất, cho thêm 5 % tỉ lệ): chỉ bỏ cây mà cổng chắc chắn sẽ bác, còn chỗ
 * sát nút để cổng đo đúng.
 */
function unusableCell(
  input: ArrangeInput,
  cells: readonly { id: string; rect: Rect }[],
  env: PackEnv,
): PlanIssue | null {
  const partitionCm = 11;
  for (const cell of cells) {
    const leaf = env.leafById.get(cell.id);
    if (!leaf || leaf.aspectHard === null) continue;
    const w = Math.max(1, cell.rect.x1 - cell.rect.x0 - partitionCm);
    const h = Math.max(1, cell.rect.y1 - cell.rect.y0 - partitionCm);
    if (Math.max(w, h) / Math.min(w, h) > leaf.aspectHard * 1.05) {
      const short = Math.min(w, h) / 100;
      const long = Math.max(w, h) / 100;
      return arrangeIssue(
        'arrange_room_too_narrow',
        `Phòng "${cell.id}" ở tầng ${input.level} chỉ chia được ô ${round2(short)} × ${round2(long)} m — dài hơn ${leaf.aspectHard} lần bề ngang.`,
        {
          room: cell.id,
          min_m: round2(long / leaf.aspectHard),
          zone: zoneOfRect(env.footprint, cell.rect),
        },
        cell.id,
      );
    }
  }
  return null;
}

/**
 * Ô CHẮC CHẮN hụt diện tích đầu bài khai — `null` khi không có. Ước lượng LẠC QUAN (chỉ trừ một vách
 * ngăn mỗi chiều), ngược với hàm phạt: chỉ bỏ cây mà cổng chắc chắn bác (T45).
 */
function belowFloorCell(
  input: ArrangeInput,
  cells: readonly { id: string; rect: Rect }[],
  env: PackEnv,
): PlanIssue | null {
  const partitionCm = Math.round(input.construction.walls.partition_m * 100);
  for (const cell of cells) {
    const floor = env.leafById.get(cell.id)?.areaFloor ?? null;
    if (floor === null) continue;
    const w = Math.max(0, cell.rect.x1 - cell.rect.x0 - partitionCm);
    const h = Math.max(0, cell.rect.y1 - cell.rect.y0 - partitionCm);
    const best = (w * h) / 10_000;
    if (best >= floor) continue;
    return arrangeIssue(
      'arrange_room_below_brief_area',
      `Phòng "${cell.id}" ở tầng ${input.level} chỉ chia được ô khoảng ${round2(best)} m² — đầu bài khai tối thiểu ${floor} m².`,
      {
        room: cell.id,
        min_m2: floor,
        area_m2: round2(best),
        zone: zoneOfRect(env.footprint, cell.rect),
      },
      cell.id,
    );
  }
  return null;
}

/**
 * Ô thang CHẮC CHẮN ngắn hơn số bậc cần, ước lượng lạc quan từ ô theo tim (không trừ tường, đi dọc cạnh
 * dài) — cùng lý lẽ với `unusableCell`. Tầng trên cùng không có thang đi lên.
 */
function shortStairCell(
  input: ArrangeInput,
  cells: readonly { id: string; rect: Rect }[],
  stairIds: ReadonlySet<string>,
): PlanIssue | null {
  if (input.isTop) return null;
  const storeyCm = Math.round(input.construction.levels.storey_height_m * 100);
  for (const cell of cells) {
    if (!stairIds.has(cell.id)) continue;
    const w = cell.rect.x1 - cell.rect.x0;
    const h = cell.rect.y1 - cell.rect.y0;
    const treads = stairTreads(input.construction, storeyCm);
    const short = stairShortfall(input.construction, {
      rect: [cell.rect.x0, cell.rect.y0, cell.rect.x1, cell.rect.y1],
      up: h >= w ? '+y' : '+x',
      flights: stairFlights(input.construction, Math.min(w, h)),
      treads,
    });
    if (!short) continue;
    return arrangeIssue(
      'arrange_stair_too_short',
      `Ô thang "${cell.id}" ở tầng ${input.level} chỉ dài được ${round2(short.haveCm / 100)} m — ${treads} bậc cần ít nhất ${round2(short.needCm / 100)} m.`,
      {
        room: cell.id,
        need_m: round2(short.needCm / 100),
        have_m: round2(short.haveCm / 100),
        zone: zoneOfRect(input.anchors?.footprint ?? input.buildableCm, cell.rect),
      },
      cell.id,
    );
  }
  return null;
}

/**
 * Ô mốc của tầng trên: ô thang (lá thang của tầng), giếng trời (lá giếng trời gần mốc nhất) và ô thang
 * máy, đúng chữ nhật tầng dưới. Không có mốc thì rỗng — tầng 1 không khoét gì.
 */
function forcedCells(
  input: ArrangeInput,
  items: readonly PackItem[],
  stairIds: ReadonlySet<string>,
  env: PackEnv,
): { key: string; rect: Rect }[] {
  const anchors = input.anchors;
  if (!anchors) {
    // Tầng 1: khoét ô lõi đúng chỗ bản phác (T73).
    return (input.sketchCores ?? []).flatMap((core) =>
      items.some((item) => item.key === core.id) ? [{ key: core.id, rect: core.rect }] : [],
    );
  }
  const out: { key: string; rect: Rect }[] = [];
  const stair = items.find((item) => stairIds.has(item.key));
  if (stair && anchors.stair) out.push({ key: stair.key, rect: anchors.stair });
  const wells = items.filter((item) => env.leafById.get(item.key)?.types.includes('light_well'));
  const free = [...anchors.lightWells];
  for (const well of wells) {
    const target = free.shift();
    if (target) out.push({ key: well.key, rect: target });
  }
  // Ô thang máy khoét đúng giếng tầng dưới như thang bộ (T65). Thiếu dòng này thì khung khoét ném thang
  // máy vào chung một mảnh với phòng khác và nó rơi lệch giếng — lượt đo 011b4adc hỏng tầng 2 cả bốn
  // lượt vì thế, dù mô hình vẽ thang máy đúng cùng ô với tầng 1.
  const lifts = items.filter((item) => env.leafById.get(item.key)?.types.includes('elevator'));
  const shafts = [...(anchors.elevators ?? [])];
  for (const lift of lifts) {
    const target = shafts.shift();
    if (target) out.push({ key: lift.key, rect: target });
  }
  return out;
}

/**
 * Tầng trên: các dải hành lang ÁP SÁT ô thang tầng dưới, chạy suốt chiều sâu hoặc suốt bề ngang khối
 * nhà — khoét cùng ô thang như một ô mốc thứ hai (V-28).
 *
 * Khoét chỉ theo cạnh ô thang thì khối nhà luôn thành bốn mảnh quanh thang, và phòng ở mảnh không chạm
 * thang không có cửa: lượt 9cce001a bỏ rơi hai phòng ngủ ở cả hai lượt dù mô hình khai đủ «cạnh hành
 * lang». Dải chạy suốt nhà thì mọi mảnh hai bên nó đều giáp hành lang. Dải chạm hình bao sát quá (mảnh
 * còn lại hẹp dưới ô tối thiểu) tự bị bỏ ở bước chia.
 */
function corridorStrips(
  input: ArrangeInput,
  items: readonly PackItem[],
  corridorIds: ReadonlySet<string>,
  forced: readonly { key: string; rect: Rect }[],
  width: number,
): { key: string; rect: Rect }[] {
  const corridor = items.find((item) => corridorIds.has(item.key));
  const stair = forced.find(
    (cell) => cell.key !== corridor?.key && input.anchors?.stair === cell.rect,
  );
  const f = input.anchors?.footprint;
  if (!corridor || !stair || !f) return [];
  const s = stair.rect;
  const candidates: Rect[] = [
    { x0: s.x0 - width, y0: f.y0, x1: s.x0, y1: f.y1 },
    { x0: s.x1, y0: f.y0, x1: s.x1 + width, y1: f.y1 },
    { x0: f.x0, y0: s.y0 - width, x1: f.x1, y1: s.y0 },
    { x0: f.x0, y0: s.y1, x1: f.x1, y1: s.y1 + width },
  ];
  const others = forced.filter((cell) => cell !== stair).map((cell) => cell.rect);
  return candidates
    .filter((r) => r.x0 >= f.x0 && r.y0 >= f.y0 && r.x1 <= f.x1 && r.y1 <= f.y1)
    .map((r) => trimAround(snapToFootprint(r, f), s, others))
    .filter((r): r is Rect => r !== null)
    .map((rect) => ({ key: corridor.key, rect }));
}

/**
 * Dải hành lang để hở một khe hẹp hơn ô nhỏ nhất tới tường bao thì lấn hết khe ấy: nhà phố 4 m có ô thang
 * thật 2,4 m chỉ còn 1,58 m bên cạnh — dải 1,35 m để thừa 23 cm không phòng nào dùng được.
 */
function snapToFootprint(r: Rect, f: Rect): Rect {
  return {
    x0: r.x0 - f.x0 < MIN_CELL_CM ? f.x0 : r.x0,
    y0: r.y0 - f.y0 < MIN_CELL_CM ? f.y0 : r.y0,
    x1: f.x1 - r.x1 < MIN_CELL_CM ? f.x1 : r.x1,
    y1: f.y1 - r.y1 < MIN_CELL_CM ? f.y1 : r.y1,
  };
}

/**
 * Cắt dải dọc chiều dài của nó cho khỏi chạm ô mốc khác (giếng trời cạnh thang), giữ đoạn DÀI hơn —
 * dải chạy song song ô thang nên đoạn nào cũng còn áp thang. `null` khi đoạn còn lại dưới ô nhỏ nhất.
 */
function trimAround(r: Rect, stair: Rect, others: readonly Rect[]): Rect | null {
  // Dải nằm trái/phải ô thang thì chạy dọc trục y; nằm trước/sau thì chạy dọc trục x.
  const alongY = r.x1 <= stair.x0 || r.x0 >= stair.x1;
  let out: Rect | null = { ...r };
  for (const cell of others) {
    if (!out || !overlaps(cell, out)) continue;
    const current: Rect = out;
    const pieces: Rect[] = alongY
      ? [
          { ...current, y1: Math.min(current.y1, cell.y0) },
          { ...current, y0: Math.max(current.y0, cell.y1) },
        ]
      : [
          { ...current, x1: Math.min(current.x1, cell.x0) },
          { ...current, x0: Math.max(current.x0, cell.x1) },
        ];
    const length = (p: Rect) => (alongY ? p.y1 - p.y0 : p.x1 - p.x0);
    out = pieces.filter((p) => length(p) > 0).sort((a, b) => length(b) - length(a))[0] ?? null;
  }
  return out && out.x1 - out.x0 >= MIN_CELL_CM && out.y1 - out.y0 >= MIN_CELL_CM ? out : null;
}

/** Nhánh hành lang phải vào sâu ít nhất chừng này để hai bên nó còn xếp được phòng, cm. */
const BRANCH_MIN_DEPTH_CM = 600;
/** Mỗi bên nhánh, dọc dải chính, phải còn ít nhất chừng này — bề ngang một phòng ngủ nhỏ, cm. */
const BRANCH_SIDE_MIN_CM = 300;
/** Vị trí nhánh dọc dải chính, theo phần chiều dài dải. */
const BRANCH_SHARES = [0.5, 0.4, 0.6, 0.3, 0.7] as const;

interface CorridorTee {
  base: { key: string; rect: Rect };
  branches: { key: string; rect: Rect }[];
  leafById: ReadonlyMap<string, PackLeaf>;
  corridorIds: ReadonlySet<string>;
  program: AiSpaceProgram;
}

/**
 * Tầng trên: hành lang chữ T/L — dải áp ô thang (`corridorStrips`) cộng nhánh vuông góc chạy từ dải tới
 * tường bao (V-29, 15/09/2026).
 *
 * Lượt đo 5aba737d: tầng 2 biệt thự 15 phòng, ô thang áp tường trái phía sau. Dải dọc cạnh thang chừa
 * bên trái 2,5 m không đặt nổi phòng; dải ngang trên thang thì phòng phía trước không chạm được — mọi cây
 * đều thiếu cửa. Một nhánh giữa nhà ra phía trước chia vùng trước thành hai dãy phòng cùng mở ra nhánh.
 *
 * Mỗi phòng của cây chia là một chữ nhật, nên mỗi nhánh là một KHÔNG GIAN GIAO THÔNG MỚI: chương trình
 * tách diện tích hành lang mô hình khai theo tỉ lệ diện tích các dải, mã mới theo khuôn `type_n`. Chỉ
 * tách khi tầng có đúng một hành lang; cây không dùng nhánh thì chương trình không đổi.
 */
function corridorTees(
  input: ArrangeInput,
  items: readonly PackItem[],
  corridorIds: ReadonlySet<string>,
  forced: readonly { key: string; rect: Rect }[],
  env: PackEnv,
  width: number,
): CorridorTee[] {
  const f = input.anchors?.footprint;
  const corridors = items.filter((item) => corridorIds.has(item.key));
  if (!f || corridors.length !== 1 || corridors[0]!.children.length > 0) return [];
  const corridor = corridors[0]!;
  const leaf = env.leafById.get(corridor.key);
  const space = input.program.spaces.find((s) => s.id === corridor.key);
  if (!leaf || !space) return [];

  const tee = (base: { key: string; rect: Rect }, rects: readonly Rect[]): CorridorTee => {
    const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
    const total = space.target_area_m2;
    const whole = area(base.rect) + rects.reduce((sum, r) => sum + area(r), 0);
    const leafById = new Map(env.leafById);
    let program = input.program;
    const branches: { key: string; rect: Rect }[] = [];
    let used = 0;
    for (const rect of rects) {
      const id = nextSpaceId(program, space.type);
      const target = Math.max(0.1, round1((total * area(rect)) / whole));
      used += target;
      leafById.set(id, { ...leaf, id, target, zone: zoneOfRect(f, rect), areaFloor: null });
      program = {
        ...program,
        spaces: [...program.spaces, { ...space, id, target_area_m2: target }],
      };
      branches.push({ key: id, rect });
    }
    const baseTarget = Math.max(0.1, round1(total - used));
    leafById.set(corridor.key, { ...leaf, target: baseTarget });
    return {
      base,
      branches,
      leafById,
      corridorIds: new Set([...corridorIds, ...branches.map((b) => b.key)]),
      program: {
        ...program,
        spaces: program.spaces.map((s) =>
          s.id === corridor.key ? { ...s, target_area_m2: baseTarget } : s,
        ),
      },
    };
  };

  const out: CorridorTee[] = [];
  for (const base of corridorStrips(input, items, corridorIds, forced, width)) {
    const r = base.rect;
    const horizontal = r.x1 - r.x0 > r.y1 - r.y0;
    const lo = horizontal ? r.x0 : r.y0;
    const hi = horizontal ? r.x1 : r.y1;
    const sides: [number, number][] = horizontal
      ? [
          [f.y0, r.y0],
          [r.y1, f.y1],
        ]
      : [
          [f.x0, r.x0],
          [r.x1, f.x1],
        ];
    const perSide = sides.map(([a, b]) => {
      const out: Rect[] = [];
      if (b - a < BRANCH_MIN_DEPTH_CM) return out;
      for (const share of BRANCH_SHARES) {
        const p = lo + Math.round(((hi - lo) * share - width / 2) / 5) * 5;
        if (p - lo < BRANCH_SIDE_MIN_CM || hi - (p + width) < BRANCH_SIDE_MIN_CM) continue;
        const rect: Rect = horizontal
          ? { x0: p, y0: a, x1: p + width, y1: b }
          : { x0: a, y0: p, x1: b, y1: p + width };
        if (forced.some((cell) => overlaps(cell.rect, rect))) continue;
        if (!out.some((seen) => JSON.stringify(seen) === JSON.stringify(rect))) out.push(rect);
      }
      return out;
    });
    for (const rects of perSide) for (const rect of rects) out.push(tee(base, [rect]));
  }
  return out;
}

/** Mã `type_n` kế tiếp chưa dùng trong cả nhà. */
function nextSpaceId(program: AiSpaceProgram, type: string): string {
  const pattern = new RegExp(`^${type}_(\\d+)$`);
  const used = program.spaces
    .map((s) => pattern.exec(s.id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `${type}_${Math.max(0, ...used) + 1}`;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Tầng trên: ép ô thang và giếng trời về ĐÚNG ô tầng dưới, dời các nhát cắt tạo cạnh của chúng. */
function pinAnchors(
  input: ArrangeInput,
  frame: FrameCandidate,
  env: PackEnv,
  stairIds: ReadonlySet<string>,
): { placed: Placed; penalty: number } | { issues: PlanIssue[] } {
  const anchors = input.anchors;
  if (!anchors) return { placed: frame.placed, penalty: frame.penalty };
  let placed: Placed | null = frame.placed;
  const cells = leaves(frame.placed);
  const stair = cells.find((cell) => stairIds.has(cell.id));
  if (anchors.stair && stair) {
    placed = pinLeaf(placed, stair.id, anchors.stair, MIN_CELL_CM);
    if (!placed) {
      return {
        issues: [
          arrangeIssue(
            'arrange_anchor_conflict',
            `Tầng ${input.level}: không đặt được ô thang "${stair.id}" trùng ô thang tầng dưới mà vẫn giữ các phòng quanh nó.`,
            { room: stair.id },
            stair.id,
          ),
        ],
      };
    }
  }
  const wells = cells.filter((cell) => env.leafById.get(cell.id)?.types.includes('light_well'));
  const free = [...anchors.lightWells];
  for (const well of wells) {
    if (!placed || free.length === 0) break;
    const centre = (r: Rect) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2] as const;
    const [cx, cy] = centre(well.rect);
    free.sort((p, q) => {
      const [px, py] = centre(p);
      const [qx, qy] = centre(q);
      return Math.hypot(px - cx, py - cy) - Math.hypot(qx - cx, qy - cy);
    });
    const next: Placed | null = pinLeaf(placed, well.id, free.shift()!, MIN_CELL_CM);
    if (next) placed = next;
  }
  // Ô thang máy ghim về đúng ô tầng dưới như thang bộ (T65: giếng thang máy chồng khít mọi tầng).
  for (const cell of cells.filter((c) => env.leafById.get(c.id)?.types.includes('elevator'))) {
    const target = nearestRect(cell.rect, anchors.elevators ?? []);
    if (!placed || !target) break;
    const next: Placed | null = pinLeaf(placed, cell.id, target, MIN_CELL_CM);
    if (next) placed = next;
  }
  if (!placed) return { issues: [] };
  return {
    placed,
    penalty:
      placed === frame.placed ? frame.penalty : evaluate(placed, anchors.footprint, NO_REACH, env),
  };
}

/** Chữ nhật gần tâm nhất trong danh sách — `null` khi danh sách rỗng. */
function nearestRect(rect: Rect, candidates: readonly Rect[]): Rect | null {
  const centre = (r: Rect) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2] as const;
  const [cx, cy] = centre(rect);
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const [x, y] = centre(c);
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

/** Lá thang máy của tầng và ô thang máy tầng dưới gần nó nhất (theo tâm), trên bản phác. */
function elevatorPairs(
  input: ArrangeInput,
  intent: LevelIntent,
  env: PackEnv,
  sketch: PreparedSketch,
): Array<[string, Rect]> {
  const below = input.anchors?.elevators ?? [];
  if (!below.length) return [];
  return intent.leaves
    .filter((leaf) => env.leafById.get(leaf.id)?.types.includes('elevator'))
    .flatMap((leaf): Array<[string, Rect]> => {
      const drawn = sketchRectOf(sketch, leaf.id);
      const target = drawn ? nearestRect(drawn, below) : below.length === 1 ? below[0]! : null;
      return target ? [[leaf.id, target]] : [];
    });
}

// ── Lá, vùng, môi trường xếp ──────────────────────────────────────────────────────────────

function environment(
  input: ArrangeInput,
  intent: LevelIntent,
  footprint: Rect,
  ring: number,
): {
  env: PackEnv;
  items: PackItem[];
  corridorIds: Set<string>;
  stairIds: Set<string>;
} {
  const construction = input.construction;
  const exterior = Math.round(construction.walls.exterior_m * 100);
  const margin = Math.round(construction.openingRules.door_margin_m * 100);
  const narrow = new Set([
    ...construction.openingRules.wc_door_types,
    ...construction.openingRules.narrow_door_types,
  ]);
  const doorWidth = Math.round((construction.openings.door?.width_m ?? 0.9) * 100);
  const narrowWidth = Math.round((construction.openings.wc_door?.width_m ?? 0.75) * 100);
  const through = input.groups.passage?.through ?? new Set<string>();
  const servedFrom = input.groups.passage?.servedFrom ?? new Map<string, ReadonlySet<string>>();
  const stairTypes = new Set(input.stairTypes);
  const stairOpensTo = input.groups.passage?.stairOpensTo ?? null;
  const wet = new Set(construction.openingRules.wc_door_types);
  const keepZone = new Set(input.scoring?.roomGroups.keep_zone ?? []);
  const cols = footprint.x1 - footprint.x0 >= SPLIT_MIN_CM;
  const rows = footprint.y1 - footprint.y0 >= SPLIT_MIN_CM;

  const isNarrow = (types: readonly string[]) => types.some((type) => narrow.has(type));
  const noDoor = (types: readonly string[]) =>
    types.every((type) => input.groups.noDoorRequired.has(type));
  // Cạnh dùng được là lọt lòng; ô ở đây theo tim. Trừ phần tường của ô ÁP tường bao (nửa bề dày
  // ngoài phía tường bao cộng nửa vách phía trong) — ô nằm giữa mất ít hơn, nên sàn này thận trọng
  // vài phân, và cổng đo lại đúng trên phòng đã dựng.
  const usableAllowance = exterior + Math.round(construction.walls.partition_m * 50);
  // Ô áp tường bao mất trọn tường ngoài ở một đầu và nửa vách ở đầu kia — thiếu nửa vách thì ô 120 cm
  // chỉ còn 92,5 cm vách trống, hụt 95 cm cửa WC cần (phát lại lượt 9cce001a).
  const wallLoss = usableAllowance;
  const usableMin = (types: readonly string[]) => {
    const metres = types
      .map((type) => input.usableMinSideM?.(type) ?? null)
      .filter((value): value is number => value !== null);
    return metres.length ? ceil5(Math.max(...metres) * 100 + usableAllowance) : 0;
  };
  const techMin = (types: readonly string[]) =>
    Math.max(
      usableMin(types),
      noDoor(types)
        ? ceil5(Math.max(MIN_CELL_CM, 100))
        : ceil5((isNarrow(types) ? narrowWidth : doorWidth) + 2 * margin + wallLoss),
    );

  const hardAspect = (types: readonly string[]) => {
    const ratios = types
      .map((type) => input.usableMaxAspect?.(type) ?? null)
      .filter((value): value is number => value !== null);
    return ratios.length ? Math.min(...ratios) : null;
  };

  const habitable = input.groups.habitable;
  // Ô thang có thang đi lên không nhỏ hơn thang hai vế hẹp nhất dựng được: mô hình khai 7 m² cho 21 bậc
  // (lượt 5fda70dc) thì mọi cách chia ra ô thang ngắn — cổng bác ở mọi khung, và lượt sửa không gỡ được
  // vì mô hình không thấy hình. Đây là điều kiện dựng, không phải kinh nghiệm.
  const stairFloorM2 = input.isTop ? 0 : stairFloorArea(construction);
  const leafById = new Map<string, PackLeaf>();
  for (const leaf of intent.leaves) {
    const role: PackLeaf['role'] = leaf.types.some((type) => through.has(type))
      ? 'hub'
      : noDoor(leaf.types)
        ? 'open'
        : 'room';
    const prefs = leaf.types
      .map((type) => input.minSideM?.(type) ?? null)
      .filter((value): value is number => value !== null);
    const aspects = leaf.types
      .map((type) => input.aspectMax?.(type) ?? null)
      .filter((value): value is number => value !== null);
    const hostTypes = new Set<string>();
    for (const type of leaf.types)
      for (const host of servedFrom.get(type) ?? []) hostTypes.add(host);
    const special = keepsZoneWhenRelaxed(leaf, intent, keepZone);
    const floor = [leaf.id, ...leaf.merged].reduce(
      (sum, id) => sum + (input.briefMinAreaM2?.(id) ?? 0),
      0,
    );
    const zoneWeight =
      ring === 0
        ? 1
        : ring === 1
          ? leaf.types.some((type) => habitable.has(type) || through.has(type)) || special
            ? 1
            : 0.2
          : ring === 2
            ? special
              ? 1
              : 0.2
            : special
              ? 0.3
              : 0;
    const isStair = leaf.types.some((type) => stairTypes.has(type));
    leafById.set(leaf.id, {
      id: leaf.id,
      types: leaf.types,
      target: isStair ? Math.max(leaf.target, stairFloorM2) : leaf.target,
      techMin: techMin(leaf.types),
      pref: prefs.length ? ceil5(Math.max(...prefs) * 100 + WALL_ALLOWANCE_CM) : null,
      aspectMax: aspects.length ? Math.min(...aspects) : DEFAULT_ASPECT,
      // Phòng khép kín là dải dọc một cạnh phòng mẹ — dạng dài là của cấu trúc, không xét tỉ lệ.
      aspectHard: leaf.ensuiteOf ? null : hardAspect(leaf.types),
      areaFloor: floor > 0 ? floor : null,
      zone: leaf.zone,
      street: leaf.street,
      role,
      needsOpenFace: leaf.types.some(
        (type) => input.groups.outdoor.has(type) && !INNER_OPEN.has(type),
      ),
      noStairDoor: !opensFromStair(stairOpensTo, leaf.types),
      parent: leaf.ensuiteOf ? (intent.hostOf.get(leaf.ensuiteOf) ?? null) : null,
      stair: isStair,
      wet: leaf.types.some((type) => wet.has(type)),
      zoneWeight,
      hostTypes: hostTypes.size ? hostTypes : null,
    });
  }

  const children = new Map<string, PackLeaf[]>();
  for (const leaf of leafById.values()) {
    if (leaf.parent && leafById.has(leaf.parent)) {
      children.set(leaf.parent, [...(children.get(leaf.parent) ?? []), leaf]);
    }
  }
  const items: PackItem[] = [];
  for (const leaf of leafById.values()) {
    if (leaf.parent && leafById.has(leaf.parent)) continue;
    const kids = children.get(leaf.id) ?? [];
    const cell = ZONE_CELL[leaf.zone];
    items.push({
      key: leaf.id,
      primary: leaf,
      children: kids,
      weight: packWeight(leaf) + kids.reduce((sum, kid) => sum + packWeight(kid), 0),
      need: [leaf, ...kids].reduce(
        (sum, part) =>
          sum +
          (part.areaFloor === null ? part.target * SOFT_NEED_SHARE : part.areaFloor * FLOOR_SHARE),
        0,
      ),
      col: cols ? cell.col : 1,
      row: rows ? cell.row : 1,
    });
  }

  // Thang máy nằm trong nhóm giao thông của từ vựng nhưng KHÔNG phải hành lang: coi nó là hành lang thì
  // dải hành lang áp thang mang mã thang máy — cùng lúc thang máy là ô khoét theo giếng (T72), nên cây
  // có hai nút cùng một phòng (`tree_child_reused`, lượt đo 6c35ed79) — và hành lang chữ T tắt vì tầng
  // «có hai hành lang».
  const corridorIds = new Set(
    [...leafById.values()]
      .filter(
        (leaf) =>
          leaf.types.some(
            (type) =>
              input.groups.vertical.has(type) && !stairTypes.has(type) && type !== 'elevator',
          ) && !leaf.stair,
      )
      .map((leaf) => leaf.id),
  );
  const stairIds = new Set(
    [...leafById.values()].filter((leaf) => leaf.stair).map((leaf) => leaf.id),
  );

  const weights: PenaltyWeights =
    ring === 0 ? DEFAULT_WEIGHTS : { ...DEFAULT_WEIGHTS, access: DEFAULT_WEIGHTS.access * 1.6 };
  const env: PackEnv = {
    footprint,
    openSides: new Set(input.openFaces.map((face) => FACE_SIDE[face])),
    entranceSide:
      input.level === 1 ? FACE_SIDE[input.entrances.main ?? input.accessFaces[0] ?? 'front'] : null,
    vehicleSide:
      input.level === 1 && (input.entrances.vehicle ?? input.accessFaces[0])
        ? FACE_SIDE[(input.entrances.vehicle ?? input.accessFaces[0])!]
        : null,
    entryId: intent.entryRoom,
    garageId: intent.garageRoom,
    weights,
    stairUp: !input.isTop,
    anchors: input.anchors
      ? {
          stair: input.anchors.stair,
          lightWells: input.anchors.lightWells,
          wetRooms: input.anchors.wetRooms,
        }
      : null,
    floorWallCm: exterior,
    doorShared: (a, b) =>
      (isNarrow(a.types) || isNarrow(b.types) ? narrowWidth : doorWidth) + 2 * margin + wallLoss,
    leafById,
    budget: { left: input.budget?.packs ?? PACK_BUDGET },
  };
  return { env, items, corridorIds, stairIds };
}

/** Diện tích theo tim tường của ô thang hai vế hẹp nhất cho một tầng thường, m² — 0 khi không kiểm. */
function stairFloorArea(construction: ConstructionNorms): number {
  const treads = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
  const widthCm = construction.stairs.two_flights_min_width_m * 100;
  const run = stairRunNeedCm(construction, { flights: 2, treads, acrossCm: widthCm });
  if (run === null) return 0;
  const wallCm = Math.round(construction.walls.partition_m * 100);
  return round1(((widthCm + wallCm) * (run + wallCm)) / 10_000);
}

/**
 * Tỉ trọng sàn một lá đòi khi chia ô. Lá có sàn đầu bài đòi ít nhất sàn ấy cộng phần tường: chia theo
 * diện tích mô hình khai thì một tầng khai sát khối nhà co MỌI phòng theo cùng tỉ lệ, và phòng khai 22 m²
 * cho mức 20 m² rơi xuống dưới sàn trước khi hàm phạt kịp kéo lại (lượt đo 5aba737d, 15/09/2026).
 */
function packWeight(leaf: PackLeaf): number {
  return leaf.areaFloor === null
    ? leaf.target
    : Math.max(leaf.target, leaf.areaFloor * FLOOR_SHARE);
}

/**
 * Phần diện tích mục tiêu của phòng KHÔNG có sàn đầu bài tính vào sức chứa vùng (`PackItem.need`). 0 thì
 * bộ chia vùng dồn phòng loại này vào dải nông cho bằng được: lượt 9cce001a ra phòng ngủ 6,9 m² (mục tiêu
 * 12) cạnh phòng ngủ chính 86 m². 0,7–0,9 cho cùng kết quả trên hai lượt đo và biến thể của chúng.
 */
const SOFT_NEED_SHARE = 0.75;

/** Lọt lòng so với sàn theo tim của một phòng cỡ 4–5 m cạnh — phần tường chiếm chừng này. */
const FLOOR_SHARE = 1.12;

/** Phần tường cộng vào cạnh lọt lòng để ra cạnh theo tim — cùng số `tree/sizing.ts` dùng. */
const WALL_ALLOWANCE_CM = 33;

function footprintOptions(input: ArrangeInput, spaces: AiSpaceProgram['spaces']): Rect[] {
  if (input.anchors) return [input.anchors.footprint];
  const full = input.buildableCm;
  const width = full.x1 - full.x0;
  const depth = full.y1 - full.y0;
  const need = spaces.reduce((sum, space) => sum + space.target_area_m2, 0) * GROSS_FACTOR * 10_000;
  const have = width * depth;
  const out = [full];
  // Chương trình nhỏ hẳn so với đất xây được: thử khối nhà gọn hơn, lùi cạnh sau. Phòng không phải
  // thổi phồng để lấp đất trống — phần còn lại là sân sau.
  if (need < 0.8 * have) {
    const shallower = ceil5(need / width / 0.9);
    if (shallower >= SPLIT_MIN_CM / 2 && shallower < depth) {
      out.push({ ...full, y1: full.y0 + shallower });
    }
  }
  return out;
}

function footprintKey(footprint: Rect, full: Rect): string {
  return footprint.y1 === full.y1 && footprint.x1 === full.x1
    ? 'full'
    : `shrink${footprint.y1 - footprint.y0}`;
}

// ── Cổng, chấm ────────────────────────────────────────────────────────────────────────────

function gate(input: ArrangeInput, tree: AiPlanTree, resize: boolean): LevelLayout {
  const usable = input.usableMinSideM;
  // Bước căn vách giữ cạnh tối thiểu nó được đưa: đưa mức CAO hơn giữa kinh nghiệm và dùng được, để
  // căn theo diện tích không bóp một phòng xuống dưới mức dựng.
  const minSideM =
    input.minSideM && usable
      ? (type: string) => {
          const values = [input.minSideM!(type), usable(type)].filter(
            (value): value is number => value !== null,
          );
          return values.length ? Math.max(...values) : null;
        }
      : input.minSideM;
  const layout = layoutLevel({
    tree,
    level: input.level,
    isTop: input.isTop,
    program: input.program,
    buildableCm: input.buildableCm,
    construction: input.construction,
    groups: input.groups,
    mergeAllowed: input.mergeAllowed,
    openFaces: input.openFaces,
    accessFaces: input.accessFaces,
    anchors: input.anchors,
    entrances: input.entrances,
    balcony: input.balcony ?? null,
    ...(resize && minSideM ? { minSideM } : {}),
  });
  if (!layout.level) return layout;
  const blocked = [
    ...narrowRooms(input, layout.level),
    ...shortStairs(input, layout.level),
    ...belowBriefArea(input, layout.level),
    ...mandatoryBlocked(input, layout.level),
  ];
  if (blocked.length) return { ...layout, level: null, issues: [...layout.issues, ...blocked] };
  const offFace = outdoorOffFace(input, layout.level);
  return offFace.length ? { ...layout, notes: [...layout.notes, ...offFace] } : layout;
}

const MANDATORY_CODE_SET: ReadonlySet<string> = new Set(MANDATORY_CODES);

/**
 * Luật bố trí BẮT BUỘC của Haan (T71) — ứng viên vi phạm bị loại để bộ xếp thử cách khác; hết cách thì
 * lỗi đi lên và được gửi lại mô hình (mã nằm trong `REVISABLE_CODES`). Đo trên đúng tầng giả mà bộ
 * chấm dựng (`pseudoPlan`: tường, cửa, mặt thoáng), bằng cùng hàm cổng cuối dùng (`ai/mandatory.ts`).
 */
function mandatoryBlocked(input: ArrangeInput, level: AiPlanRoomsLevel): PlanIssue[] {
  const rules = mandatoryFor(input.mandatory, input.program);
  if (!rules) return [];
  const pseudo = pseudoPlan(input, level).levels[0]!;
  // Mốc tầng dưới chia lại theo WC của ứng viên này (T96): khu bếp của không gian mở tầng dưới dời khỏi
  // chỗ WC đè lên khi thứ tự khu còn đổi được — đúng cách `assemblePlan` sẽ chia, nên cổng không bác
  // một cây mà tờ vẽ cuối vẫn hợp luật.
  const service = input.anchors?.belowRooms
    ? serviceAnchors(input.anchors.belowRooms, rules, wetRects(pseudo.rooms))
    : input.anchors?.service;
  return [
    ...(service ? verticalViolations(service, pseudo.rooms, input.level, rules) : []),
    ...altarNeighbourViolations(pseudo, rules),
    ...balconyViolations(pseudo, rules),
  ].filter((issue) => issue.level === 'blocking');
}

/**
 * Phòng đã dựng nhỏ hơn diện tích tối thiểu đầu bài khai — lỗi CHẶN (T45). Phòng ghép (`also`) gánh
 * tổng mức của mọi phòng nó chứa. So sau khi làm tròn 0,1 m² như lúc đúc artifact, tha phần hụt trong
 * `sketch.floor_tolerance_ratio` (T82, Haan 25/09/2026: «thiếu 8 cm² hoàn toàn có thể bỏ qua»).
 */
function belowBriefArea(input: ArrangeInput, level: AiPlanRoomsLevel): PlanIssue[] {
  const read = input.briefMinAreaM2;
  if (!read) return [];
  const tolerance = input.construction.sketch?.floor_tolerance_ratio ?? 0;
  return level.rooms.flatMap((room) => {
    const need = [room.id, ...(room.also ?? [])].reduce((sum, id) => sum + (read(id) ?? 0), 0);
    if (need <= 0 || Math.round(room.area_m2 * 10) / 10 >= need * (1 - tolerance)) return [];
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    return [
      arrangeIssue(
        'arrange_room_below_brief_area',
        `Phòng "${room.id}" ở tầng ${input.level} chỉ được ${round2(room.area_m2)} m² — đầu bài khai tối thiểu ${need} m².`,
        {
          room: room.id,
          min_m2: need,
          area_m2: round2(room.area_m2),
          zone: zoneOfRect(input.anchors?.footprint ?? input.buildableCm, { x0, y0, x1, y1 }),
        },
        room.id,
      ),
    ];
  });
}

/**
 * Ô thang ngắn hơn số bậc × bề sâu bậc (+ chiếu nghỉ) dọc chiều đi lên — lỗi CHẶN (Q-45d): cái thang ấy
 * không xây nổi. Tầng trên cùng không có thang đi lên nên không kiểm.
 */
function shortStairs(input: ArrangeInput, level: AiPlanRoomsLevel): PlanIssue[] {
  return (level.stairs ?? []).flatMap((stair) => {
    const short = stairShortfall(input.construction, {
      rect: stair.rect,
      up: stair.up,
      flights: stair.flights ?? 1,
      treads: stair.treads ?? 0,
    });
    if (!short) return [];
    const room =
      level.rooms.find((r) => r.rect.every((value, i) => value === stair.rect[i]))?.id ?? stair.id;
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = stair.rect;
    return [
      arrangeIssue(
        'arrange_stair_too_short',
        `Ô thang "${room}" ở tầng ${input.level} chỉ dài ${round2(short.haveCm / 100)} m theo chiều đi lên — ${stair.treads} bậc${
          (stair.flights ?? 1) > 1 ? ' chia hai vế' : ''
        } cần ít nhất ${round2(short.needCm / 100)} m.`,
        {
          room,
          need_m: round2(short.needCm / 100),
          have_m: round2(short.haveCm / 100),
          zone: zoneOfRect(input.anchors?.footprint ?? input.buildableCm, { x0, y0, x1, y1 }),
        },
        room,
      ),
    ];
  });
}

/**
 * Phòng đã dựng hẹp dưới mức dùng được — cạnh ngắn lọt lòng dưới `usableMinSideM`, hoặc dài quá
 * `usableMaxAspect` lần cạnh ngắn — lỗi CHẶN (V-28). Phòng ghép (`also`) đo theo mức khắt nhất của các
 * loại nó gánh: bếp ghép phòng ăn vẫn phải kê được bàn ăn.
 */
function narrowRooms(input: ArrangeInput, level: AiPlanRoomsLevel): PlanIssue[] {
  const typeOf = new Map(input.program.spaces.map((space) => [space.id, space.type]));
  const ensuite = new Set(
    input.program.spaces.filter((space) => space.ensuite_of).map((space) => space.id),
  );
  const pick = (
    types: readonly string[],
    read: ((type: string) => number | null) | undefined,
    combine: (...values: number[]) => number,
  ) => {
    const values = read ? types.map(read).filter((value): value is number => value !== null) : [];
    return values.length ? combine(...values) : null;
  };
  const out: PlanIssue[] = [];
  for (const room of level.rooms) {
    const types = [room.type, ...(room.also ?? []).map((id) => typeOf.get(id) ?? '')];
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    const short = Math.min(x1 - x0, y1 - y0) / 100;
    const long = Math.max(x1 - x0, y1 - y0) / 100;
    const minSide = pick(types, input.usableMinSideM, Math.max);
    const maxAspect = ensuite.has(room.id) ? null : pick(types, input.usableMaxAspect, Math.min);
    const need = Math.max(minSide ?? 0, maxAspect ? long / maxAspect : 0);
    if (short + 1e-6 >= need) continue;
    const why =
      minSide !== null && short + 1e-6 < minSide
        ? `chỉ rộng ${round2(short)} m lọt lòng — dưới ${minSide} m, không kê nổi đồ đạc của nó`
        : `${round2(short)} × ${round2(long)} m — dài hơn ${maxAspect} lần bề ngang, thành một dải hành lang`;
    out.push(
      arrangeIssue(
        'arrange_room_too_narrow',
        `Phòng "${room.id}" ở tầng ${input.level} ${why}.`,
        {
          room: room.id,
          min_m: round2(need),
          zone: zoneOfRect(input.anchors?.footprint ?? input.buildableCm, { x0, y0, x1, y1 }),
        },
        room.id,
      ),
    );
  }
  return out;
}

/**
 * Ban công, lô gia, sân thượng phải quay CẠNH DÀI ra mặt thoáng — lỗi CHẶN (Haan 18/09/2026, chấm lượt
 * 78be09b4: một ban công 1 × 6,3 m thọc vào giữa nhà, chỉ đầu 98 cm chạm mặt tiền, lại cắt phòng thờ
 * khỏi hành lang).
 *
 * Đo trên chính hình đã dựng: cạnh dài của phòng phải trùng đường bao tầng ở một mặt thoáng. Giếng
 * trời và sân trong (`INNER_OPEN`) không xét — chúng vốn nằm giữa nhà. Sai số 25 cm cho bề dày tường:
 * ô phòng lấy theo tim, còn phòng ngoài trời chạy ra tới mép lan can.
 */
export function outdoorOffFace(input: ArrangeInput, level: AiPlanRoomsLevel): DrawNote[] {
  const openSides = new Set(input.openFaces.map((face) => FACE_SIDE[face]));
  if (openSides.size === 0) return [];
  const others = level.rooms.map((room) => ({
    id: room.id,
    x0: room.rect[0] ?? 0,
    y0: room.rect[1] ?? 0,
    x1: room.rect[2] ?? 0,
    y1: room.rect[3] ?? 0,
  }));
  if (!others.length) return [];
  const tolerance = 25;
  /** Cạnh `side` của phòng có nhìn thẳng ra ngoài không — không phòng nào nằm bên kia cạnh ấy. */
  const exposed = (id: string, r: Record<Side, number>, side: Side): boolean => {
    const horizontal = side === 'y0' || side === 'y1';
    const [lo, hi] = horizontal ? [r.x0, r.x1] : [r.y0, r.y1];
    return !others.some((o) => {
      if (o.id === id) return false;
      const [olo, ohi] = horizontal ? [o.x0, o.x1] : [o.y0, o.y1];
      if (Math.min(hi, ohi) - Math.max(lo, olo) <= tolerance) return false;
      switch (side) {
        case 'y0':
          return o.y1 <= r.y0 + tolerance;
        case 'y1':
          return o.y0 >= r.y1 - tolerance;
        case 'x0':
          return o.x1 <= r.x0 + tolerance;
        case 'x1':
          return o.x0 >= r.x1 - tolerance;
      }
    });
  };
  const out: DrawNote[] = [];
  for (const room of level.rooms) {
    if (!input.groups.outdoor.has(room.type) || INNER_OPEN.has(room.type)) continue;
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    const w = x1 - x0;
    const h = y1 - y0;
    // Cạnh dài chạy theo trục nào thì cạnh ấy là hai cạnh vuông góc với trục kia.
    const sides: Side[] = w > h ? ['y0', 'y1'] : h > w ? ['x0', 'x1'] : ['y0', 'y1', 'x0', 'x1'];
    const rect: Record<Side, number> = { x0, y0, x1, y1 };
    if (sides.some((side) => openSides.has(side) && exposed(room.id, rect, side))) continue;
    out.push({
      code: 'outdoor_off_face',
      message: `Phòng ngoài trời "${room.id}" ở tầng ${input.level} (${round2(Math.max(w, h) / 100)} × ${round2(Math.min(w, h) / 100)} m) không quay cạnh dài ra mặt thoáng — ban công nên chạy dọc mặt ngoài nhà.`,
    });
  }
  return out;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Ranked {
  candidate: Built;
  layout: LevelLayout;
  fit: IntentFit;
  total: number;
  /**
   * Mọi WC chung thẳng trục với WC / hộp kỹ thuật tầng dưới (T71). Bậc xếp hạng ĐẦU TIÊN: một phương
   * án thẳng trục luôn thắng một phương án lệch, điểm cao đến đâu cũng vậy — Haan: «chỉ cho phép lệch
   * trục khi cần thiết». Tầng 1 và lượt không có luật: luôn `true`.
   */
  stacked: boolean;
  /**
   * Tầng 1: ô thang bộ / thang máy nằm đúng chỗ bản phác vẽ (T73). Bậc xếp hạng THỨ HAI, sau `stacked`:
   * tầng trên vẽ thang theo chỗ ấy. Tầng trên (có mốc) và tầng không bản phác: luôn `true`.
   */
  atSketch: boolean;
  /**
   * Ban công của tầng còn chạm đủ các mặt bản phác đã vẽ ban công (T92). Bậc xếp hạng THỨ BA, sau lõi.
   * Tầng không bản phác / bản phác không ban công: luôn `true`.
   */
  balconiesKept: boolean;
  /**
   * Không phòng ngoài trời nào (ban công, sân thượng) quay lưng vào trong nhà (T96). Bậc THỨ TƯ: thước 3
   * đổi thứ hạng theo điểm và một cây có ban công thọc vào giữa nhà từng thắng cây có ban công ra mặt
   * thoáng (phát lại 9cce001a) — ban công không ra ngoài thì không phải ban công, điểm cao mấy cũng thế.
   */
  onFace: boolean;
}

function rank(
  input: ArrangeInput,
  intent: LevelIntent,
  candidate: Built,
  layout: LevelLayout,
): Ranked {
  const level = layout.level!;
  const weights = input.scoring?.quality.intentFit ?? {
    zone: 0.5,
    relationship: 0.3,
    street: 0.2,
    nearM: 6,
    farM: 8,
    blend: 0.3,
  };
  const fit = intentFit(level, candidate.footprint, intent, weights);
  let normalised = 100 - Math.min(100, candidate.penalty * 5);
  if (input.scoring) {
    const score = scorePlan({
      plan: pseudoPlan(input, level),
      program: {
        ...input.program,
        spaces: input.program.spaces.filter((space) => space.level === input.level),
      },
      buildingType: input.scoring.buildingType,
      quality: input.scoring.quality,
      rules: input.scoring.rules,
      groups: input.scoring.roomGroups,
      passage: input.groups.passage ?? null,
      areaNorms: input.areaNorms ?? null,
      balconyFace: input.mandatory?.rules.balconyOnOpenFace ?? null,
    });
    normalised = score.scoredWeight > 0 ? (score.points / score.scoredWeight) * 100 : 0;
  }
  const total = normalised + weights.blend * 100 * fit.total - 0.5 * layout.notes.length;
  const rules = mandatoryFor(input.mandatory, input.program);
  const service = input.anchors?.service;
  const stacked = !rules || !service || wcOffAxis(service, level.rooms, rules).length === 0;
  const atSketch = movedCores(input, level.rooms).length === 0;
  const balconiesKept = balconySidesKept(input, level.rooms, candidate.footprint);
  const onFace = outdoorOffFace(input, level).length === 0;
  return { candidate, layout, fit, total, stacked, atSketch, balconiesKept, onFace };
}

/** Ô lõi (thang bộ, thang máy) của một mặt bằng tầng 1 đã dựng KHÔNG còn ở chỗ bản phác vẽ (T73). */
function movedCores(input: ArrangeInput, rooms: AiPlanRoomsLevel['rooms']): string[] {
  return (input.sketchCores ?? []).flatMap((core) => {
    const room = rooms.find((r) => r.id === core.id);
    if (!room) return [core.id];
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    const kept =
      Math.abs((x0 + x1) / 2 - (core.rect.x0 + core.rect.x1) / 2) <= core.toleranceCm &&
      Math.abs((y0 + y1) / 2 - (core.rect.y0 + core.rect.y1) / 2) <= core.toleranceCm;
    return kept ? [] : [core.id];
  });
}

/** Mặt hình bao (theo lưới bản phác) mà các ô ban công chạm tới (T92). */
function sketchBalconySidesOf(input: ArrangeInput, sketch: PreparedSketch): Side[] {
  const type = input.balcony?.type ?? 'balcony';
  const ids = new Set(
    input.program.spaces
      .filter((space) => space.level === input.level && space.type === type)
      .map((space) => space.id),
  );
  const { grid } = sketch;
  const sides = new Set<Side>();
  grid.cells.forEach((row, r) =>
    row.forEach((id, c) => {
      if (!id || !ids.has(id)) return;
      if (r === 0) sides.add('y0');
      if (r === grid.rows - 1) sides.add('y1');
      if (c === 0) sides.add('x0');
      if (c === grid.cols - 1) sides.add('x1');
    }),
  );
  return [...sides];
}

/** Ban công đã xếp còn chạm đủ các mặt bản phác vẽ ban công không (T92). */
function balconySidesKept(
  input: ArrangeInput,
  rooms: AiPlanRoomsLevel['rooms'],
  footprint: Rect,
): boolean {
  const want = input.sketchBalconySides ?? [];
  if (!want.length) return true;
  const type = input.balcony?.type ?? 'balcony';
  // Lòng phòng cách mép hình bao nửa bề dày tường ngoài — dung sai một lớp tường.
  const tolerance = Math.round(input.construction.walls.exterior_m * 100);
  const touched = new Set<Side>();
  for (const room of rooms) {
    if (room.type !== type) continue;
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    if (y0 - footprint.y0 <= tolerance) touched.add('y0');
    if (footprint.y1 - y1 <= tolerance) touched.add('y1');
    if (x0 - footprint.x0 <= tolerance) touched.add('x0');
    if (footprint.x1 - x1 <= tolerance) touched.add('x1');
  }
  return want.every((side) => touched.has(side));
}

/**
 * Phòng giữ vùng mô hình khai ở các vòng NỚI (vòng 1–2 giữ trọn, vòng cuối giữ nhẹ): lối vào, chỗ để xe,
 * phòng ra mặt đường — và từ T100 bếp, phòng thờ (nhóm `keep_zone`). Đầu bài có thể quy định HƯỚNG cho bếp
 * / bàn thờ (Haan 28/09/2026); chương trình không đọc được câu chữ ấy, chỗ mô hình đặt phòng là cách duy
 * nhất hướng ấy tới được mặt bằng, nên nới vùng của chúng là âm thầm bỏ lời gia chủ.
 */
export function keepsZoneWhenRelaxed(
  leaf: { id: string; types: readonly string[]; street: boolean },
  intent: { entryRoom: string | null; garageRoom: string | null },
  keepZone: ReadonlySet<string>,
): boolean {
  return (
    leaf.id === intent.entryRoom ||
    leaf.id === intent.garageRoom ||
    leaf.street ||
    leaf.types.some((type) => keepZone.has(type))
  );
}

/** Ô thang bộ / thang máy của tầng trên bản phác — lõi mà tầng trên vẽ theo (T73). */
function sketchCoresOf(
  input: ArrangeInput,
  intent: LevelIntent,
  sketch: PreparedSketch,
): SketchCore[] {
  const lift = new Set([...input.stairTypes, 'elevator']);
  const { footprint, grid } = sketch;
  const toleranceCm =
    Math.min((footprint.x1 - footprint.x0) / grid.cols, (footprint.y1 - footprint.y0) / grid.rows) /
    2;
  return intent.leaves.flatMap((leaf) => {
    if (leaf.merged.length || !leaf.types.some((type) => lift.has(type))) return [];
    const rect = sketchRectOf(sketch, leaf.id);
    return rect ? [{ id: leaf.id, rect, toleranceCm }] : [];
  });
}

/** Một tầng lẻ dựng thành artifact tạm để chấm — đúng cách lưới an toàn của `ai/tree/` dựng. */
function pseudoPlan(input: ArrangeInput, level: AiPlanRoomsLevel): AiFloorPlan {
  const geometry = levelFromRooms(level, input.construction, input.groups.outdoor);
  return {
    levels: [
      {
        ...geometry.level,
        outline_faces: outlineFaces(
          geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
          input.openFaces,
        ),
      },
    ],
  } as unknown as AiFloorPlan;
}

function exceedsIssue(input: ArrangeInput, need: number, have: number): PlanIssue {
  return arrangeIssue(
    'arrange_program_exceeds_footprint',
    `Tầng ${input.level}: chương trình không gian cần ${round1(need)} m² lọt lòng, khối xây chỉ ${round1(have)} m² theo tim tường — không xếp vừa.`,
    { need_m2: round1(need), have_m2: round1(have) },
  );
}

function programOverflow(
  input: ArrangeInput,
  spaces: AiSpaceProgram['spaces'],
  footprints: readonly Rect[],
): PlanIssue | null {
  const need = spaces.reduce((sum, space) => sum + space.target_area_m2, 0);
  const have = Math.max(...footprints.map((f) => ((f.x1 - f.x0) * (f.y1 - f.y0)) / 10_000));
  return need > have ? exceedsIssue(input, need, have) : null;
}

function noPartiIssue(input: ArrangeInput, spaces: AiSpaceProgram['spaces']): PlanIssue {
  const need = spaces.reduce((sum, space) => sum + space.target_area_m2, 0);
  const footprint = input.anchors?.footprint ?? input.buildableCm;
  const have = ((footprint.x1 - footprint.x0) * (footprint.y1 - footprint.y0)) / 10_000;
  if (need * 1.1 > have) return exceedsIssue(input, need, have);
  return arrangeIssue(
    'arrange_no_parti',
    `Tầng ${input.level}: không dựng được cây nào từ ý định bố cục — phòng quá nhiều hoặc quá hẹp so với khối xây ${round1(have)} m².`,
    { rooms: spaces.length },
  );
}

function dedupeIssues(issues: PlanIssue[]): PlanIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.ref ?? ''}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ceil5(value: number): number {
  return Math.ceil(value / 5) * 5;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
