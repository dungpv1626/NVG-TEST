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
import type { ZoneDefaults } from '../../kb/vocabulary';
import type { RulePack } from '../../rules/rule-pack';
import type { Rect } from '../draw/geometry';
import type { DrawNote } from '../draw/notes';
import { outlineFaces } from '../outline-faces';
import type { BalconyDemand } from '../brief-demands';
import type { PlanIssue } from '../plan-check';
import { levelFromRooms } from '../plan-geometry';
import type { PlanQuality } from '../plan-quality';
import { scorePlan } from '../plan-score';
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
import { normaliseIntent, type LevelIntent } from './intent';
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
  prepareSketch,
  sketchTrees,
  stackWetRooms,
  type PreparedSketch,
} from './sketch';

export { ARRANGE_ISSUE_CODES, INTENT_NOTE_CODES, isRevisable, REVISABLE_CODES } from './issues';
export { effectiveZoneOfRect, ZONES, type Zone } from './grid';
export type { LevelIntent } from './intent';

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
  const sketch = input.sketch?.length
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
  if (sketch && !footprints.some((f) => sameRect(f, sketch.footprint))) {
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

  let bestFailure: { issues: PlanIssue[]; weight: number } | null = null;
  // Lý do nào nói cho mô hình biết: của ứng viên hỏng ÍT nhất. Lọc trước cổng (`filtered`) xếp sau mọi
  // ứng viên đã tới cổng — nó chỉ nên lên tiếng khi không cây nào đi được tới đó.
  const remember = (issues: PlanIssue[], filtered = false) => {
    if (!issues.length) return;
    const weight =
      issues.length +
      (issues.every((issue) => issue.code === 'arrange_anchor_conflict') ? 100 : 0) +
      (filtered ? 50 : 0);
    if (!bestFailure || weight < bestFailure.weight) bestFailure = { issues, weight };
  };
  // Cây đã hỏng cổng ở vòng trước thì hỏng lại y như vậy: cổng không đọc vòng nới. Không tiêu suất cổng
  // lần nữa (lượt đo 4a521f52: bốn cây rẻ nhất tầng 2 là CÙNG một mặt bằng qua ba vòng).
  const failedGeometry = new Set<string>();

  // Bản phác (T48) đi TRƯỚC mọi khung: qua được cổng thì đó là mặt bằng mô hình vẽ, chương trình chỉ căn
  // vách. Không qua thì vùng của bản phác vẫn dẫn các vòng dưới.
  let sketchIssues: PlanIssue[] = [];
  let built = 0;
  if (sketch) {
    const drawn = sketchStage(input, intent, sketch, remember, failedGeometry);
    notes.push(...drawn.notes);
    built += drawn.built;
    if (drawn.winner) {
      return finish(input, intent, notes, drawn.winner, {
        candidates: built,
        passed: drawn.passed,
        relaxed: 0,
      });
    }
    sketchIssues = drawn.issues;
    notes.push({
      code: 'sketch_fallback',
      message: `Tầng ${input.level}: bản phác của mô hình không qua được cổng kiểm${
        drawn.reason ? ` (${drawn.reason})` : ''
      } — chương trình xếp lại, giữ vùng từng phòng theo bản phác.`,
    });
  }

  const rings = runRings(input, intent, footprints, remember, failedGeometry);
  built += rings.built;
  if (rings.winner) {
    return finish(input, intent, notes, rings.winner, {
      candidates: built,
      passed: rings.passed,
      relaxed: rings.ring,
    });
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
      return finish(
        hall.input,
        hallIntent,
        notes,
        retry.winner,
        { candidates: built, passed: retry.passed, relaxed: retry.ring },
        hall.input.program,
      );
    }
  }

  const failure: PlanIssue[] =
    (bestFailure as { issues: PlanIssue[] } | null)?.issues ??
    (built === 0 ? [noPartiIssue(input, spaces)] : []);
  const issues = dedupeIssues([...intent.issues, ...sketchIssues, ...failure]);
  return {
    layout: null,
    intent,
    summary: null,
    issues,
    notes,
    revisable: issues.some((issue) => REVISABLE_CODES.has(issue.code)),
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
  return [...passed].sort(
    (p, q) =>
      q.total - p.total ||
      q.fit.total - p.fit.total ||
      p.candidate.penalty - q.candidate.penalty ||
      p.candidate.key.localeCompare(q.candidate.key),
  )[0]!;
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
  if (anchorStair && stairLeaf && forceSketchRect(sketch, stairLeaf.id, anchorStair)) {
    notes.push({
      code: 'sketch_stair_forced',
      message: `Bản phác tầng ${input.level} vẽ ô thang "${stairLeaf.id}" lệch ô thang tầng dưới — chương trình đặt lại đúng ô ấy.`,
    });
  }
  // Bản phác THỨ HAI: khu vệ sinh tầng trên ép về đúng ô khu vệ sinh tầng dưới, để trục ống nước thẳng
  // (Q-B, 18/09/2026 — Haan chốt «dời vách tầng trên»). Không ép thẳng lên bản phác đang dùng như ô
  // thang: đo 18/09 trên bốn bản phác thật của `58688ead` và bản `fd3b0b86`, khu vệ sinh tầng trên nằm
  // cách tầng dưới 4–6 m, nên đây là dời cả phòng. Hai bản cùng đi qua cổng; bản nào ra mặt bằng điểm
  // cao hơn thì thắng, nên việc ép không bao giờ làm mất một phương án.
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
  remember: (issues: PlanIssue[]) => void,
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
      remember([...candidate.reasons, ...layout.issues]);
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
    stairNotFor: input.groups.passage?.stairNotFor ?? null,
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
 * Ô mốc của tầng trên: ô thang (lá thang của tầng) và giếng trời (lá giếng trời gần mốc nhất), đúng
 * chữ nhật tầng dưới. Không có mốc thì rỗng — tầng 1 không khoét gì.
 */
function forcedCells(
  input: ArrangeInput,
  items: readonly PackItem[],
  stairIds: ReadonlySet<string>,
  env: PackEnv,
): { key: string; rect: Rect }[] {
  const anchors = input.anchors;
  if (!anchors) return [];
  const out: { key: string; rect: Rect }[] = [];
  const stair = items.find((item) => stairIds.has(item.key));
  if (stair && anchors.stair) out.push({ key: stair.key, rect: anchors.stair });
  const wells = items.filter((item) => env.leafById.get(item.key)?.types.includes('light_well'));
  const free = [...anchors.lightWells];
  for (const well of wells) {
    const target = free.shift();
    if (target) out.push({ key: well.key, rect: target });
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
  if (!placed) return { issues: [] };
  return {
    placed,
    penalty:
      placed === frame.placed ? frame.penalty : evaluate(placed, anchors.footprint, NO_REACH, env),
  };
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
  const stairNotFor = input.groups.passage?.stairNotFor ?? new Set<string>();
  const wet = new Set(construction.openingRules.wc_door_types);
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
    const special = leaf.id === intent.entryRoom || leaf.id === intent.garageRoom || leaf.street;
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
      noStairDoor: leaf.types.some((type) => stairNotFor.has(type)),
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

  const corridorIds = new Set(
    [...leafById.values()]
      .filter(
        (leaf) =>
          leaf.types.some((type) => input.groups.vertical.has(type) && !stairTypes.has(type)) &&
          !leaf.stair,
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
  ];
  if (blocked.length) return { ...layout, level: null, issues: [...layout.issues, ...blocked] };
  const offFace = outdoorOffFace(input, layout.level);
  return offFace.length ? { ...layout, notes: [...layout.notes, ...offFace] } : layout;
}

/**
 * Phòng đã dựng nhỏ hơn diện tích tối thiểu đầu bài khai — lỗi CHẶN (T45). Phòng ghép (`also`) gánh
 * tổng mức của mọi phòng nó chứa. So sau khi làm tròn 0,1 m² như lúc đúc artifact.
 */
function belowBriefArea(input: ArrangeInput, level: AiPlanRoomsLevel): PlanIssue[] {
  const read = input.briefMinAreaM2;
  if (!read) return [];
  return level.rooms.flatMap((room) => {
    const need = [room.id, ...(room.also ?? [])].reduce((sum, id) => sum + (read(id) ?? 0), 0);
    if (need <= 0 || Math.round(room.area_m2 * 10) / 10 >= need) return [];
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
    });
    normalised = score.scoredWeight > 0 ? (score.points / score.scoredWeight) * 100 : 0;
  }
  const total = normalised + weights.blend * 100 * fit.total - 0.5 * layout.notes.length;
  return { candidate, layout, fit, total };
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
