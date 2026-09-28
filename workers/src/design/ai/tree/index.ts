/**
 * Cây chia một tầng → một tầng `ai-plan-rooms` đã qua cổng (T37–T40, 13/09/2026).
 *
 * «Mô hình khai cấu trúc, chương trình gán số» — nguyên tắc 2 của CLAUDE.md 8.2, nay áp lại cho cả
 * nhánh AI. Mô hình khai nhát cắt, phòng nào ở ô nào, phòng nào nối phòng nào; mọi con số còn lại
 * do tệp này suy, TẤT ĐỊNH, nên cùng một cây luôn cho cùng một tầng và cùng một mã băm artifact.
 *
 *     walkTree ─► (bám mốc) ─► innerRects ─► outlineOf ─► placeOpenings ─► thang ─► lưới an toàn
 *
 * Lưới an toàn ở cuối là `levelFromRooms` + `checkPlan` — đúng bộ suy tường và cổng kiểm mà tầng sẽ
 * đi qua khi ghép. Với một cây hợp lệ chúng KHÔNG BAO GIỜ báo gì (chồng lấn, sàn trống, phòng chạm
 * nhau không chừa vách… không diễn đạt được bằng cây). Chúng vẫn chạy, vì chính chúng là thứ phát
 * hiện được một lỗi của TỆP NÀY — và có phép thử canh rằng chúng im lặng trên mọi fixture.
 *
 * ⚠️ Thư mục này thuộc nhánh AI và KHÔNG import gì của bộ giải nội bộ (`layout/`, `program/`,
 * `compute/`). Ý tưởng cây chia mượn từ `layout-intent`; mã thì không — `ai-independence.test.ts`.
 */

import type { AiFloorPlan, AiPlanRoomsLevel, AiPlanTree, AiSpaceProgram } from '@nvg/shared/design';
import type { ConstructionNorms } from '../../kb/construction';
import type { Face } from '../../kb/site-context';
import type { ServiceAnchors } from '../mandatory';
import { mergeKey, type PassageRules } from '../../kb/vocabulary';
import { overlapArea, rectContainsRect, toRect, type Rect } from '../draw/geometry';
import { DrawNotes, type DrawNote } from '../draw/notes';
import { outlineFaces } from '../outline-faces';
import { checkPlan, OVERLAP_TOLERANCE_CM2, restateRoomFacts, type PlanIssue } from '../plan-check';
import { levelFromRooms } from '../plan-geometry';
import { walkTree, type Cell } from './cells';
import { innerRects } from './insets';
import { treeIssue } from './issues';
import { placeOpenings } from './openings';
import { outlineOf } from './outline';
import { projectBalconyCells } from './balcony-projection';
import type { BalconyDemand, Side } from '../brief-demands';
import { resizeTree } from './sizing';
import { snapToAnchors, type SnapTarget } from './snap';
import { stairFlights, stairTreads } from './stair-fit';

export { TREE_ISSUE_CODES } from './issues';
export { SNAP_MAX_CM } from './snap';
export { MIN_CELL_CM } from './cells';

/**
 * Loại phòng của giếng trời — trùng giá trị `light_well` của enum `void_space.kind` trong hợp đồng,
 * nên đây là một TÊN trong hợp đồng chứ không phải một danh sách mã phòng viết cứng.
 */
const LIGHT_WELL = 'light_well';

/** Tên mặt để viết ghi chú — bản gọn của `sideWord`, chỉ dùng trong tệp này. */
const SIDE_WORDS: Record<Side, string> = {
  front: 'mặt trước',
  back: 'mặt sau',
  left: 'mặt bên trái',
  right: 'mặt bên phải',
};

/**
 * Giếng thang máy (T65, 22/09/2026) — bám mốc tầng dưới y như giếng trời.
 *
 * Cùng một lẽ: cả hai là ô xuyên suốt chiều cao nhà. Giếng trời lệch tầng thì hở sàn, giếng thang
 * máy lệch tầng thì không có đường thẳng cho cabin chạy — và với lựa chọn «chừa chỗ lắp sau» thì
 * chừa lệch nhau nghĩa là chưa chừa gì cả.
 */
const ELEVATOR = 'elevator';

/** Mốc một tầng để lại cho các tầng trên, theo TIM tường. */
export interface LevelAnchors {
  stair: Rect | null;
  lightWells: Rect[];
  /**
   * Ô thang máy của tầng — tầng trên phải chồng khít.
   *
   * Tuỳ chọn vì mốc đúc trước 22/09/2026 không có trường này, và một hồ sơ cũ đọc lại vẫn phải
   * dựng được: vắng thì không bám mốc, đúng hành vi trước T65.
   */
  elevators?: Rect[];
  /**
   * Ô khu ướt (WC, lavabo) của tầng — mốc để tầng trên xếp THẲNG TRỤC: ép vùng, phạt khoảng cách, bản
   * phác thứ hai, và (T71) bậc xếp hạng đầu tiên của bộ xếp. Không chặn — Haan: «chỉ lệch khi cần».
   */
  wetRooms: Rect[];
  /**
   * Bếp, phòng thờ, WC / hộp kỹ thuật của TẦNG NGAY DƯỚI (T71) — cổng luật bắt buộc của bộ xếp đo theo
   * đây. Vắng ở tầng 1 và ở mốc đúc trước T71.
   */
  service?: ServiceAnchors;
  /**
   * Phòng của tầng NGAY DƯỚI (T96): cổng luật bắt buộc chia lại khu của không gian mở tầng dưới theo WC
   * của chính ứng viên đang xét — khu bếp tránh nằm dưới WC đúng cách tờ vẽ sẽ chia. Vắng = dùng `service`.
   */
  belowRooms?: AiPlanRoomsLevel['rooms'];
  footprint: Rect;
  /**
   * Chiều đi lên của vế thang đầu tầng này (T43) — tầng trên dùng lại khi bộ giải ý định dựng cây.
   * Vắng ở mốc đúc trước 14/09/2026 và ở tầng không có thang đi lên.
   */
  stairUp?: '+x' | '-x' | '+y' | '-y';
}

export interface RoomGroups {
  outdoor: ReadonlySet<string>;
  vertical: ReadonlySet<string>;
  noDoorRequired: ReadonlySet<string>;
  habitable: ReadonlySet<string>;
  /** Loại phòng được mở thêm cửa vào để nối phòng mô hình quên khai lối vào, theo thứ tự ưu tiên. */
  doorHosts?: readonly string[];
  /** Phòng nào được đi xuyên để tới phòng khác (`kb/room_vocabulary.yaml` mục `passage`, V-27). */
  passage?: PassageRules | null;
}

export interface LevelLayoutInput {
  tree: AiPlanTree;
  level: number;
  isTop: boolean;
  program: AiSpaceProgram;
  buildableCm: Rect;
  construction: ConstructionNorms;
  groups: RoomGroups;
  mergeAllowed: ReadonlySet<string>;
  openFaces: readonly Face[];
  accessFaces: readonly Face[];
  anchors: LevelAnchors | null;
  /**
   * Mã lỗi cổng hạ xuống GHI CHÚ cho lượt này (18/09/2026). Lượt sửa của kỹ sư truyền vào những luật
   * ra đời SAU bản vẽ đang sửa: một phương án đã lưu không được biến thành không sửa nổi chỉ vì hôm
   * nay có thêm luật, và chỗ sai ấy vốn không phải do thao tác kỹ sư vừa yêu cầu.
   */
  relax?: ReadonlySet<string>;
  /** Mặt lối vào chính và lối xe đầu bài khai; vắng = chương trình tự chọn. */
  entrances?: { main: Face | null; vehicle: Face | null };
  /**
   * Yêu cầu ban công của đầu bài (T65) — chỉ dùng cho phần ĐUA RA NGOÀI RANH.
   *
   * Vắng = không ô nào nhô ra, đúng hành vi trước T65. Phần «đúng mặt, đúng tầng» kiểm ở cổng
   * mặt bằng khi đã ghép đủ tầng, không ở đây.
   */
  balcony?: BalconyDemand | null;
  /**
   * Cạnh ngắn tối thiểu lọt lòng theo loại phòng, m (gói kinh nghiệm, `min_dimension`). Có mặt thì
   * chương trình thử CĂN LẠI vị trí vách theo diện tích yêu cầu (`sizing.ts`); vắng thì giữ nguyên
   * mọi con số mô hình khai.
   */
  minSideM?: (roomType: string) => number | null;
}

export interface LevelLayout {
  /** `null` khi có lỗi chặn — không có gì để vẽ. */
  level: AiPlanRoomsLevel | null;
  /** Cây đã áp các lần dời vách để bám mốc — đúng cây sinh ra hình học của `level`. */
  tree: AiPlanTree;
  issues: PlanIssue[];
  notes: DrawNote[];
  anchors: LevelAnchors | null;
}

/**
 * Cây một tầng → tầng đã qua cổng.
 *
 * Dựng HAI LẦN khi có thể: đúng các con số mô hình khai, rồi với vị trí vách chương trình căn lại theo
 * diện tích chương trình (`sizing.ts`). Bản căn lại được dùng khi nó qua cổng và sát chương trình hơn
 * — hoặc khi bản của mô hình không qua cổng mà bản căn lại qua (vách quá ngắn để đặt cửa là lỗi của
 * con số, không phải của tôpô). Cả hai là hàm thuần, nên kết quả vẫn tất định.
 */
export function layoutLevel(input: LevelLayoutInput): LevelLayout {
  const first = layoutOnce(input);
  if (!input.minSideM) return first;
  const base = first.tree;
  const walked = walkTree({
    tree: base,
    level: input.level,
    roomIds: new Set(input.program.spaces.filter((s) => s.level === input.level).map((s) => s.id)),
    levelOf: new Map(input.program.spaces.map((s) => [s.id, s.level])),
  });
  if (walked.issues.length) return first;

  const spaces = new Map(
    input.program.spaces
      .filter((space) => space.level === input.level)
      .map((space) => [space.id, { type: space.type, target: space.target_area_m2 }]),
  );
  const pinned = new Set<string>();
  if (input.anchors) {
    // Chỉ ô ĐANG bám mốc: ô thang (trùng ô thang tầng dưới) và giếng trời. Nhóm `vertical` gồm cả
    // hành lang — ghim theo nhóm là khoá luôn cái hành lang 29 m² cần co lại nhất (đo trên cây gpt-5).
    const stairAnchor = input.anchors.stair;
    for (const cell of walked.cells) {
      const type = spaces.get(cell.id)?.type ?? '';
      const onStair =
        stairAnchor !== null &&
        input.groups.vertical.has(type) &&
        overlapArea(cell.rect, stairAnchor) > OVERLAP_TOLERANCE_CM2;
      if (type === LIGHT_WELL || type === ELEVATOR || onStair || cell.id === base.stair?.room) {
        pinned.add(cell.id);
      }
    }
  }
  const fit = (layout: LevelLayout) => areaFit(layout.level!, input);
  const before = first.level ? fit(first) : null;
  let best: { layout: LevelLayout; fit: AreaFit } | null = null;
  const tried = new Set<string>();
  for (const strength of SIZING_STRENGTHS) {
    const nodes = resizeTree({
      tree: base,
      spaces,
      minSideM: input.minSideM,
      pinnedLeaves: pinned,
      noShrinkTypes: input.groups.vertical,
      strength,
    });
    if (!nodes) continue;
    const key = nodes.map((node) => node.at).join(',');
    if (tried.has(key)) continue;
    tried.add(key);
    const attempt = layoutOnce({ ...input, tree: { ...base, nodes } });
    if (!attempt.level) continue;
    const score = fit(attempt);
    if (!best || score.score < best.fit.score) best = { layout: attempt, fit: score };
  }
  if (!best) return first;
  if (before && best.fit.score >= before.score - FIT_MIN_GAIN) return first;
  return withNote(best.layout, before, best.fit);
}

/**
 * Các mức căn thử, từ hết cỡ về gần con số của mô hình. Căn hết cỡ có thể làm đoạn vách mang cửa ngắn
 * lại dưới bề rộng cửa; mức nhẹ hơn giữ được cửa mà vẫn kéo diện tích về gần chương trình.
 */
const SIZING_STRENGTHS = [1, 0.75, 0.5, 0.25] as const;

/** Bản căn lại phải sát chương trình hơn ít nhất chừng này (điểm `areaFit`) mới thay bản của mô hình. */
const FIT_MIN_GAIN = 0.005;

/**
 * Mức phạt cho mỗi chỗ hỏng mà căn vách có thể GÂY RA, cộng vào độ lệch diện tích bình quân: phòng hẹp
 * dưới mức tối thiểu, phòng ở mất cửa sổ (cạnh ra mặt thoáng ngắn lại), WC tầng trên rời khỏi WC tầng
 * dưới. Căn vách để sát diện tích mà đổi lấy một trong ba thứ ấy là đổi điểm A1 lấy điểm B1, D1, E2.
 */
const DEFECT_PENALTY = 0.05;

interface AreaFit {
  /** Nhỏ hơn là tốt hơn. */
  score: number;
  deviation: number;
  narrow: number;
}

/**
 * Độ sát chương trình của một tầng — cùng cách đo tiêu chí A1 (lệch diện tích bình quân có trọng số,
 * phòng ghép so với tổng yêu cầu) và B1 (phòng hẹp dưới mức tối thiểu, dung sai 5 cm) của `plan-score.ts`,
 * cộng hai chốt chặn không để căn vách làm tệ đi D1 (phòng ở có cửa sổ) và E2 (WC chồng lên WC).
 */
function areaFit(level: AiPlanRoomsLevel, input: LevelLayoutInput): AreaFit {
  const wanted = new Map(input.program.spaces.map((space) => [space.id, space.target_area_m2]));
  const wetTypes = new Set(input.construction.openingRules.wc_door_types);
  const lit = new Set((level.windows ?? []).map((window) => window.room));
  let weighted = 0;
  let area = 0;
  let narrow = 0;
  let defects = 0;
  for (const room of level.rooms) {
    const required = [room.id, ...(room.also ?? [])].reduce(
      (sum, id) => sum + (wanted.get(id) ?? 0),
      0,
    );
    if (required > 0) {
      weighted += (Math.abs(room.area_m2 - required) / required) * room.area_m2;
      area += room.area_m2;
    }
    const rect = toRect(room.rect);
    const limit = input.minSideM!(room.type);
    if (limit !== null && Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0) / 100 + 0.05 < limit) {
      narrow += 1;
    }
    if (input.groups.habitable.has(room.type) && !lit.has(room.id)) defects += 1;
    const below = input.anchors?.wetRooms ?? [];
    if (
      wetTypes.has(room.type) &&
      below.length > 0 &&
      !below.some((wet) => overlapArea(wet, rect) > OVERLAP_TOLERANCE_CM2)
    ) {
      defects += 1;
    }
  }
  const deviation = area > 0 ? weighted / area : 0;
  return { score: deviation + (narrow + defects) * DEFECT_PENALTY, deviation, narrow };
}

function withNote(layout: LevelLayout, before: AreaFit | null, after: AreaFit): LevelLayout {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const message = before
    ? `Chương trình căn lại vị trí vách tầng ${layout.level!.level} theo diện tích chương trình: lệch diện tích bình quân ${pct(before.deviation)} → ${pct(after.deviation)}, phòng hẹp dưới mức tối thiểu ${before.narrow} → ${after.narrow}. Bố cục (phòng nào cạnh phòng nào) giữ nguyên của mô hình.`
    : `Chương trình căn lại vị trí vách tầng ${layout.level!.level} theo diện tích chương trình vì con số mô hình khai không đặt được cửa hoặc phòng — bố cục giữ nguyên, lệch diện tích bình quân ${pct(after.deviation)}.`;
  return { ...layout, notes: [...layout.notes, { code: 'rooms_resized', message }] };
}

function layoutOnce(input: LevelLayoutInput): LevelLayout {
  const { tree, level, construction } = input;
  const where = `tầng ${level}`;
  const notes = new DrawNotes();
  const fail = (issues: PlanIssue[]): LevelLayout => ({
    level: null,
    tree,
    issues,
    notes: notes.list(),
    anchors: null,
  });

  const spaces = input.program.spaces.filter((space) => space.level === level);
  const typeOfSpace = new Map(spaces.map((space) => [space.id, space.type]));
  const levelOf = new Map(input.program.spaces.map((space) => [space.id, space.level]));
  const roomIds = new Set(spaces.map((space) => space.id));

  const footprint = toRect(tree.footprint);
  if (!rectContainsRect(input.buildableCm, footprint, 1)) {
    return fail([
      treeIssue(
        'footprint_outside_buildable',
        `Khối xây ${where} [${tree.footprint.join(', ')}] vượt ra ngoài phần đất xây được [${input.buildableCm.x0}, ${input.buildableCm.y0}, ${input.buildableCm.x1}, ${input.buildableCm.y1}].`,
        {},
      ),
    ]);
  }

  const walkInput = { tree, level, roomIds, levelOf };
  const walked = walkTree(walkInput);
  if (walked.issues.length) return fail(walked.issues);
  let cells: Cell[] = walked.cells;

  // Lỗ thông tầng ở TẦNG 1 là lỗ trên nền đất — không mở ra tầng nào, chỉ là sàn chết không ai dùng.
  // Lượt thật 13/09/2026 (Claude Sonnet) lấp phần dư bằng một `void_1` ≈ 13 m² ở tầng 1.
  if (level === 1) {
    const voids = cells.filter((cell) => cell.kind === 'void').map((cell) => cell.id);
    if (voids.length) {
      return fail(
        voids.map((id) =>
          treeIssue(
            'void_on_ground',
            `Ô "${id}" là lỗ thông tầng đặt ở tầng 1 — tầng 1 không có tầng dưới để thông, phần sàn ấy thành chỗ chết.`,
            { id },
            id,
          ),
        ),
      );
    }
  }

  // ── Phòng ghép và phòng thiếu ──────────────────────────────────────────────────────────
  const leaves = new Set(cells.filter((c) => c.kind === 'room').map((c) => c.id));
  const hostOf = new Map<string, string>([...leaves].map((id) => [id, id]));
  const issues: PlanIssue[] = [];
  const alsoOf = new Map<string, string[]>();
  for (const merge of tree.also) {
    if (!roomIds.has(merge.room)) {
      issues.push(
        treeIssue(
          'merge_unknown_room',
          `Phòng ghép "${merge.room}" ở ${where} không phải phòng của tầng này.`,
          { room: merge.room },
          merge.room,
        ),
      );
      continue;
    }
    if (!leaves.has(merge.room)) {
      issues.push(
        treeIssue(
          'merge_room_not_leaf',
          `"${merge.room}" khai là phòng ghép ở ${where} nhưng không có ô nào trên cây.`,
          { room: merge.room },
          merge.room,
        ),
      );
      continue;
    }
    for (const other of merge.with) {
      if (!roomIds.has(other)) {
        issues.push(
          treeIssue(
            'merge_unknown_room',
            `"${other}" (ghép vào "${merge.room}") không phải phòng của ${where}.`,
            { room: other },
            other,
          ),
        );
        continue;
      }
      if (leaves.has(other) || hostOf.has(other)) {
        issues.push(
          treeIssue(
            'merge_target_is_leaf',
            `"${other}" vừa có ô riêng trên cây vừa ghép vào "${merge.room}" ở ${where} — chọn một.`,
            { room: other, host: merge.room },
            other,
          ),
        );
        continue;
      }
      const pair = mergeKey(typeOfSpace.get(merge.room)!, typeOfSpace.get(other)!);
      if (!input.mergeAllowed.has(pair)) {
        issues.push(
          treeIssue(
            'merge_not_allowed',
            `"${other}" (${typeOfSpace.get(other)}) không ghép được vào "${merge.room}" (${typeOfSpace.get(merge.room)}) — hành lang, thang, WC luôn là ô riêng.`,
            { room: other, host: merge.room },
            other,
          ),
        );
        continue;
      }
      hostOf.set(other, merge.room);
      alsoOf.set(merge.room, [...(alsoOf.get(merge.room) ?? []), other]);
    }
  }
  for (const space of spaces) {
    if (!hostOf.has(space.id)) {
      issues.push(
        treeIssue(
          'room_missing_on_level',
          `Phòng "${space.id}" của chương trình không có ô nào trên cây ${where}.`,
          { room: space.id },
          space.id,
        ),
      );
    }
  }
  if (issues.length) return fail(issues);

  // ── Thang của tầng, và bám mốc tầng dưới ───────────────────────────────────────────────
  const stairRoom = stairRoomOf(tree, cells, input, typeOfSpace);
  if (tree.stair && !leaves.has(tree.stair.room)) {
    return fail([
      treeIssue(
        'stair_room_unknown',
        `Thang ${where} khai ở "${tree.stair.room}", nhưng đó không phải một ô phòng trên cây.`,
        { room: tree.stair.room },
        tree.stair.room,
      ),
    ]);
  }
  if ((!input.isTop && !tree.stair) || (level > 1 && !stairRoom)) {
    return fail([
      treeIssue(
        'stair_missing_on_level',
        input.isTop
          ? `${where} không có ô thang nào trùng chỗ thang tầng dưới — không có đường lên.`
          : `${where} không khai thang trong khi còn tầng trên.`,
        {},
      ),
    ]);
  }

  if (input.anchors) {
    const targets: SnapTarget[] = [];
    if (input.anchors.stair && stairRoom) {
      targets.push({
        leaf: stairRoom,
        anchor: input.anchors.stair,
        code: 'stair_not_at_anchor',
        label: 'Ô thang',
      });
    }
    for (const cell of cells) {
      if (typeOfSpace.get(cell.id) !== LIGHT_WELL) continue;
      const anchor = nearest(cell.rect, input.anchors.lightWells);
      if (anchor) {
        targets.push({
          leaf: cell.id,
          anchor,
          code: 'light_well_not_at_anchor',
          label: 'Giếng trời',
        });
      }
    }
    for (const cell of cells) {
      if (typeOfSpace.get(cell.id) !== ELEVATOR) continue;
      const anchor = nearest(cell.rect, input.anchors.elevators ?? []);
      if (anchor) {
        targets.push({
          leaf: cell.id,
          anchor,
          code: 'elevator_not_at_anchor',
          label: 'Ô thang máy',
        });
      } else if (input.anchors.elevators?.length) {
        // Không chồng lên giếng nào của tầng dưới — lệch HẲN, không có gì để kéo về. Trước đây ô như
        // vậy lọt qua tầng này rồi mới hỏng ở cổng cuối, làm hỏng cả lượt (lượt chạy thật 23/09/2026:
        // lệch 455 cm); bác ở đây thì bộ xếp còn thử được cách khác.
        return fail([
          {
            code: 'elevator_not_at_anchor',
            level: 'blocking',
            message: `Ô thang máy "${cell.id}" ở tầng ${level} không nằm trên giếng thang máy tầng dưới — giếng thang phải thẳng suốt.`,
            ref: cell.id,
          },
        ]);
      }
    }
    const snapped = snapToAnchors(walkInput, cells, targets, notes);
    if (snapped.issues.length) return fail(snapped.issues);
    cells = snapped.cells;
    if (snapped.overrides.size) {
      input = {
        ...input,
        tree: {
          ...tree,
          nodes: tree.nodes.map((node) => ({
            ...node,
            at: snapped.overrides.get(node.id) ?? node.at,
          })),
        },
      };
    }
  }

  // ── Ban công đua ra ngoài ranh ─────────────────────────────────────────────────────────
  // Phải đứng TRƯỚC `innerRects` và `outlineOf`: hình bao, lan can và lỗ mở đều suy từ ô, nên nới
  // ở đây thì ba thứ ấy tự khớp. Xem đầu `tree/balcony-projection.ts`.
  const jutting = projectBalconyCells({
    cells,
    typeOf: typeOfSpace,
    balcony: input.balcony ?? null,
    level,
    footprint,
  });
  cells = jutting.cells;
  for (const jut of jutting.projected) {
    notes.add(
      'balcony_projected',
      `Ban công "${jut.id}" ${where} đua ra ngoài ranh nhà ${jut.cm} cm ở ${SIDE_WORDS[jut.side]}, theo đúng mức đầu bài khai.`,
    );
  }

  // ── Lọt lòng, hình bao, lỗ mở ──────────────────────────────────────────────────────────
  const outdoor = (id: string) => input.groups.outdoor.has(typeOfSpace.get(id) ?? '');
  const inset = innerRects({ cells, outdoor, construction, level });
  if (inset.issues.length) return fail(inset.issues);
  const outline = outlineOf(cells, level);
  if (!outline.points) return fail(outline.issues);

  const leafTypes = new Map([...leaves].map((id) => [id, typeOfSpace.get(id)!]));
  const typesOfLeaf = new Map(
    [...leaves].map((id) => [
      id,
      new Set([id, ...(alsoOf.get(id) ?? [])].map((room) => typeOfSpace.get(room)!)),
    ]),
  );
  const ensuiteOf = new Map(
    spaces.filter((space) => space.ensuite_of).map((space) => [space.id, space.ensuite_of!]),
  );
  const openings = placeOpenings({
    level,
    cells,
    inner: inset.inner,
    typeOf: leafTypes,
    hostOf,
    ensuiteOf,
    tree: input.tree,
    construction,
    openFaces: input.openFaces,
    accessFaces: input.accessFaces,
    groups: input.groups,
    typesOfLeaf,
    stairRoom,
    relax: input.relax,
    entrances: input.entrances ?? { main: null, vehicle: null },
  });
  for (const note of openings.notes.list()) notes.add(note.code, note.message);
  if (openings.issues.length) return fail(openings.issues);

  const h = Math.round(
    (input.isTop ? construction.levels.top_storey_height_m : construction.levels.storey_height_m) *
      100,
  );
  const stairs = [];
  if (input.tree.stair) {
    const rect = inset.inner.get(input.tree.stair.room)!;
    const across = input.tree.stair.up.endsWith('y') ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
    stairs.push({
      id: `st${level}`,
      rect: rectArray(rect),
      up: input.tree.stair.up,
      flights: stairFlights(construction, across),
      treads: stairTreads(construction, h),
      // Mặt bậc là số NVG giữ cố định (250 trên cả bốn vế đo được, 13.16.1) — tờ vẽ đọc số này
      // thay vì chia đều ô thang, để ô thang dài hơn cần thì phần dư vào chiếu nghỉ (T70).
      ...(construction.stairs.going_m !== undefined
        ? { going: Math.round(construction.stairs.going_m * 100) }
        : {}),
    });
  }

  const result: AiPlanRoomsLevel = {
    level,
    name: `Tầng ${level}`,
    h,
    outline: outline.points.map(([x, y]) => [x, y]),
    rooms: cells
      .filter((cell) => cell.kind === 'room')
      .map((cell) => {
        const rect = inset.inner.get(cell.id)!;
        const also = alsoOf.get(cell.id);
        return {
          id: cell.id,
          type: typeOfSpace.get(cell.id)!,
          rect: rectArray(rect),
          area_m2: Math.round(((rect.x1 - rect.x0) * (rect.y1 - rect.y0)) / 100) / 100,
          ...(also ? { also } : {}),
          label: null,
        };
      }),
    doors: openings.doors,
    windows: openings.windows,
    stairs,
    voids: cells
      .filter((cell) => cell.kind === 'void')
      .map((cell) => ({
        id: cell.id,
        kind: 'void' as const,
        rect: rectArray(inset.inner.get(cell.id)!),
      })),
  };

  const safety = safetyNet(result, input, levelSpaces(input.program, level));
  for (const note of safety.notes) notes.add(note.code, note.message);
  if (safety.issues.length) return fail(safety.issues);

  return {
    level: result,
    tree: input.tree,
    issues: [],
    notes: notes.list(),
    anchors: {
      stair: stairRoom ? (cells.find((c) => c.id === stairRoom)?.rect ?? null) : null,
      lightWells: cells.filter((c) => typeOfSpace.get(c.id) === LIGHT_WELL).map((c) => c.rect),
      elevators: cells.filter((c) => typeOfSpace.get(c.id) === ELEVATOR).map((c) => c.rect),
      wetRooms: cells
        .filter((c) =>
          construction.openingRules.wc_door_types.includes(typeOfSpace.get(c.id) ?? ''),
        )
        .map((c) => c.rect),
      footprint,
      ...(input.tree.stair ? { stairUp: input.tree.stair.up } : {}),
    },
  };
}

/**
 * Chạy lại đúng bộ suy tường và cổng kiểm mà tầng sẽ gặp khi ghép — trên MỘT tầng lẻ.
 *
 * Với cây hợp lệ, không có gì ở đây được phép lên tiếng. Khi nó lên tiếng, đó là lỗi của `ai/tree/`,
 * không phải của mô hình: câu lỗi vẫn đi ra như một lỗi cổng (không có hình học thì không vẽ), nhưng
 * phép thử của thư mục này canh để chuyện đó không xảy ra trên fixture.
 */
function safetyNet(
  level: AiPlanRoomsLevel,
  input: LevelLayoutInput,
  program: AiSpaceProgram,
): { issues: PlanIssue[]; notes: DrawNote[] } {
  const geometry = levelFromRooms(level, input.construction, input.groups.outdoor);
  // Diện tích và tên phòng do chương trình gán: lệch thì tự ghi lại, như khi ghép cả nhà (`assemblePlan`).
  const restated = restateRoomFacts(geometry.level.rooms, `tầng ${level.level}`);
  const plan = {
    levels: [
      {
        ...geometry.level,
        rooms: restated.rooms,
        outline_faces: outlineFaces(
          geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
          input.openFaces,
        ),
      },
    ],
  } as unknown as AiFloorPlan;
  const check = checkPlan({
    plan,
    program,
    buildable: input.buildableCm,
    doorExemptTypes: input.groups.noDoorRequired,
    verticalTypes: input.groups.vertical,
    crossLevel: false,
    // Phần ban công ĐUA RA NGOÀI RANH (T65) đã được nới ngay trong cây (`balcony-projection.ts`), nên
    // phép «trong phần đất được xây» phải biết mức đua ấy — thiếu dòng này thì mọi ban công đua ra đều
    // bị bác ở đây (lượt chạy thật 23/09/2026: đầu bài khai đua 1 m, tầng 2 không xếp nổi).
    demands: { elevator: null, balcony: input.balcony ?? null, spaces: [] },
  });
  return { issues: [...geometry.issues, ...check.blocking], notes: geometry.notes };
}

function levelSpaces(program: AiSpaceProgram, level: number): AiSpaceProgram {
  return { ...program, spaces: program.spaces.filter((space) => space.level === level) };
}

/**
 * Ô thang của tầng: thang tầng này khai, hoặc — ở tầng trên cùng, nơi không khai thang đi lên — ô
 * phòng giao thông đứng trùng chỗ thang tầng dưới.
 */
function stairRoomOf(
  tree: AiPlanTree,
  cells: readonly Cell[],
  input: LevelLayoutInput,
  typeOf: ReadonlyMap<string, string>,
): string | null {
  if (tree.stair) return tree.stair.room;
  const anchor = input.anchors?.stair;
  if (!anchor) return null;
  const candidates = cells
    .filter((c) => c.kind === 'room' && input.groups.vertical.has(typeOf.get(c.id) ?? ''))
    .map((c) => ({ id: c.id, overlap: overlapArea(c.rect, anchor) }))
    .filter((c) => c.overlap > OVERLAP_TOLERANCE_CM2)
    .sort((p, q) => q.overlap - p.overlap);
  return candidates[0]?.id ?? null;
}

function nearest(rect: Rect, anchors: readonly Rect[]): Rect | null {
  const ranked = anchors
    .map((anchor) => ({ anchor, overlap: overlapArea(rect, anchor) }))
    .filter((entry) => entry.overlap > OVERLAP_TOLERANCE_CM2)
    .sort((p, q) => q.overlap - p.overlap);
  return ranked[0]?.anchor ?? null;
}

function rectArray(rect: Rect): [number, number, number, number] {
  return [rect.x0, rect.y0, rect.x1, rect.y1];
}
