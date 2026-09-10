/**
 * Kiểm máy mặt bằng do mô hình đề xuất — trước khi vẽ, trước khi lưu.
 *
 * Đây là nửa còn lại của quyết định T15. Mô hình khai NỘI DUNG bản vẽ dưới dạng dữ liệu chính
 * là để chỗ này kiểm được: thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng, diện tích
 * khai lệch chữ nhật — máy bắt được và bắt mô hình sửa. Một tệp SVG thì chỉ đếm được ký tự.
 *
 * ── Hai mức, và ranh giới giữa chúng ───────────────────────────────────────────────────
 * `blocking` = tờ vẽ sẽ SAI nếu cứ vẽ, nên đáng tiêu thêm một lượt gọi để mô hình sửa. Đúng
 * MỘT lượt sửa, không hơn: lượt thứ hai tốn tiền như lượt đầu mà tỷ lệ cứu được thấp hẳn.
 * `findings` = tờ vẽ vẫn dùng được nhưng có chỗ đáng ngờ; hiện lên màn hình, không chặn.
 *
 * ⚠️ KHÔNG kiểm quy chuẩn ở đây. Ngưỡng quy chuẩn nằm ở `rules/` và chỉ được đối chiếu SAU
 * để sinh CẢNH BÁO (T14, T20) — không bao giờ chặn, không bao giờ bắt mô hình sửa theo. Bộ này
 * chỉ hỏi «dữ liệu có tự mâu thuẫn không», tức những câu trả lời được mà không cần biết quy
 * chuẩn Việt Nam nói gì.
 *
 * Đơn vị: xăng-ti-mét, theo hợp đồng `ai-floor-plan`.
 */

import type { AiFloorPlan, AiFloorPlanLevel, AiSpaceProgram } from '@nvg/shared/design';
import {
  intervalsOverlap,
  overlapArea,
  pointInPolygon,
  rectArea,
  rectContainsRect,
  toPt,
  toRect,
  type Interval,
  type Pt,
  type Rect,
} from './draw/geometry';
import { prepareWalls, type WallGeom } from './draw/walls';

/** Sai lệch cho phép khi hỏi "mặt tường này có trùng cạnh phòng không". */
export const EDGE_TOLERANCE_CM = 1;

/** Lõi thang giữa hai tầng lệch quá mức này thì không còn là một lõi. */
export const STAIR_ALIGN_CM = 20;

/** Phần cạnh phòng phải được tường phủ. Dưới mức này là phòng hở, không phải phòng. */
export const EDGE_COVERAGE_MIN = 0.95;

/** Diện tích khai lệch chữ nhật quá CẢ HAI ngưỡng này mới tính là sai. */
export const AREA_TOLERANCE_RATIO = 0.1;
export const AREA_TOLERANCE_M2 = 1;

/** Hai phòng chồng nhau dưới mức này coi như chỉ chạm mép do làm tròn. */
export const OVERLAP_TOLERANCE_CM2 = 100;

export type IssueLevel = 'blocking' | 'finding';

export interface PlanIssue {
  /** Mã ngắn không dấu — màn hình và kiểm thử bám vào mã, không bám vào câu chữ. */
  code: string;
  level: IssueLevel;
  /** Phần tử liên quan: mã phòng, mã tường, mã cửa. */
  ref?: string;
  /** Câu tiếng Việt CỤ THỂ: nêu đúng phần tử và đúng con số, để lượt sửa có cái mà bám. */
  message: string;
}

export interface PlanCheckResult {
  blocking: PlanIssue[];
  findings: PlanIssue[];
  /**
   * Chỉ những mã lỗi thuộc NHÓM TƯỜNG. Sau lượt sửa mà chỉ còn nhóm này thì chương trình suy
   * tường từ phòng (T19) và tờ vẽ vẫn dùng được — xem `draw/derive-walls.ts`.
   */
  wallOnly: boolean;
}

/** Mã lỗi do tường khai sai gây ra — nhóm mà T19 cứu được bằng cách suy tường từ phòng. */
const WALL_CODES = new Set([
  'wall_degenerate',
  'wall_duplicate_id',
  'room_edge_uncovered',
  'opening_wall_missing',
  'opening_outside_wall',
  'opening_overlap',
  'window_on_partition',
]);

/**
 * Mã lỗi KHÔNG tự nói được gì khi tường đã sai — vì phép kiểm sinh ra nó ĐỌC hình học tường.
 *
 * «Phòng không có cửa» suy từ hình học: lùi từ điểm giữa lỗ mở ra mỗi bên nửa bề dày tường, rơi
 * vào phòng nào thì cửa phục vụ phòng đó. Tường khai sai thì phép suy ấy sai theo, và một cửa
 * nằm trên đoạn tường không tồn tại sẽ làm phòng của nó «mất cửa» — nên đây không phải bằng
 * chứng độc lập về một thiếu sót thiết kế.
 *
 * Bỏ sót điều này thì T19 KHÔNG kích hoạt đúng vào trường hợp nó được dựng ra để cứu: tường sai
 * kéo theo `room_without_door`, `wallOnly` thành false, và người dùng nhận một tờ vẽ hỏng kèm lời
 * mời bấm lại — tức một lượt gọi tính tiền nữa. Phát hiện 10/09/2026 khi viết `ai-plan.test.ts`.
 */
const WALL_DEPENDENT_CODES = new Set(['room_without_door']);

export interface PlanCheckInput {
  plan: AiFloorPlan;
  /** Chương trình không gian mà mặt bằng phải bám theo — nguồn của danh sách phòng. */
  program: AiSpaceProgram;
  /** Hình bao XÂY ĐƯỢC theo đầu bài, cm. Thiếu thì bỏ qua phép kiểm "trong lô đất". */
  buildable?: Rect | null;
  /** Mã loại phòng KHÔNG bắt buộc có cửa: ngoài trời và ô trống (nhóm của room_vocabulary). */
  doorExemptTypes: ReadonlySet<string>;
}

export function checkPlan(input: PlanCheckInput): PlanCheckResult {
  const issues: PlanIssue[] = [];
  const add = (level: IssueLevel, code: string, message: string, ref?: string): void => {
    issues.push({ code, level, message, ...(ref ? { ref } : {}) });
  };

  checkAgainstProgram(input, add);
  for (const level of input.plan.levels) {
    checkLevel(level, input, add);
  }
  checkStairs(input.plan, add);

  const blocking = issues.filter((issue) => issue.level === 'blocking');
  return {
    blocking,
    findings: issues.filter((issue) => issue.level === 'finding'),
    // Phải có ÍT NHẤT MỘT lỗi thuộc nhóm tường: một phòng thật sự không có cửa thì suy tường
    // không cứu được gì, và bật cờ «tường do chương trình suy» lúc ấy là nói sai trên tờ vẽ.
    wallOnly:
      blocking.some((issue) => WALL_CODES.has(issue.code)) &&
      blocking.every((issue) => WALL_CODES.has(issue.code) || WALL_DEPENDENT_CODES.has(issue.code)),
  };
}

type Add = (level: IssueLevel, code: string, message: string, ref?: string) => void;

/** (2) Mặt bằng phải xếp ĐÚNG danh sách phòng của chương trình, đúng tầng, không thừa không thiếu. */
function checkAgainstProgram(input: PlanCheckInput, add: Add): void {
  const wanted = new Map(input.program.spaces.map((space) => [space.id, space]));
  const seen = new Set<string>();

  for (const level of input.plan.levels) {
    for (const room of level.rooms) {
      if (seen.has(room.id)) {
        add('blocking', 'room_duplicate', `Phòng "${room.id}" xuất hiện hai lần.`, room.id);
        continue;
      }
      seen.add(room.id);

      const space = wanted.get(room.id);
      if (!space) {
        add(
          'blocking',
          'room_unknown',
          `Phòng "${room.id}" không có trong chương trình không gian. Chỉ được xếp đúng những phòng đã lập.`,
          room.id,
        );
        continue;
      }
      if (space.level !== level.level) {
        add(
          'blocking',
          'room_wrong_level',
          `Phòng "${room.id}" thuộc tầng ${space.level} theo chương trình không gian nhưng được xếp ở tầng ${level.level}.`,
          room.id,
        );
      }
      if (space.type !== room.type) {
        add(
          'blocking',
          'room_wrong_type',
          `Phòng "${room.id}" là "${space.type}" theo chương trình không gian nhưng được xếp thành "${room.type}".`,
          room.id,
        );
      }
    }
  }

  for (const [id, space] of wanted) {
    if (!seen.has(id)) {
      add(
        'blocking',
        'room_missing',
        `Chương trình không gian có phòng "${id}" (tầng ${space.level}) nhưng mặt bằng không xếp phòng này.`,
        id,
      );
    }
  }
}

function checkLevel(level: AiFloorPlanLevel, input: PlanCheckInput, add: Add): void {
  const walls = prepareWalls(level.walls);
  const where = `tầng ${level.level}`;

  checkWalls(walls, where, add);
  checkRoomRects(level, input, where, add);
  checkOverlaps(level, where, add);
  checkOpenings(level, walls, where, add);
  checkEdgeCoverage(level, walls, where, add);
  checkDoorsPerRoom(level, walls, input, where, add);
}

/** (11) Tường phải có chiều dài, có bề dày, và mã duy nhất. */
function checkWalls(walls: WallGeom[], where: string, add: Add): void {
  const seen = new Set<string>();
  for (const wall of walls) {
    if (seen.has(wall.id)) {
      add(
        'blocking',
        'wall_duplicate_id',
        `Ở ${where} có hai đoạn tường cùng mã "${wall.id}".`,
        wall.id,
      );
    }
    seen.add(wall.id);
    if (wall.length <= 0 || wall.t <= 0) {
      add(
        'blocking',
        'wall_degenerate',
        `Đoạn tường "${wall.id}" ở ${where} dài ${Math.round(wall.length)} cm, dày ${wall.t} cm — cả hai phải lớn hơn 0.`,
        wall.id,
      );
    }
  }
}

/** (3) và (9) Chữ nhật phòng hợp lệ, nằm trong hình bao, và diện tích khai khớp chữ nhật. */
function checkRoomRects(
  level: AiFloorPlanLevel,
  input: PlanCheckInput,
  where: string,
  add: Add,
): void {
  const outline: Pt[] = level.outline.map(toPt);

  for (const room of level.rooms) {
    const rect = toRect(room.rect);
    if (rect.x1 - rect.x0 <= 0 || rect.y1 - rect.y0 <= 0) {
      add(
        'blocking',
        'room_rect_empty',
        `Phòng "${room.id}" ở ${where} có chữ nhật rỗng hoặc lộn ngược.`,
        room.id,
      );
      continue;
    }

    const corners: Pt[] = [
      [rect.x0, rect.y0],
      [rect.x1, rect.y0],
      [rect.x1, rect.y1],
      [rect.x0, rect.y1],
    ];
    if (!corners.every((corner) => pointInPolygon(corner, outline, EDGE_TOLERANCE_CM))) {
      add(
        'blocking',
        'room_outside_outline',
        `Phòng "${room.id}" ở ${where} nằm lấn ra ngoài hình bao khối xây của tầng.`,
        room.id,
      );
    }
    if (input.buildable && !rectContainsRect(input.buildable, rect, EDGE_TOLERANCE_CM)) {
      add(
        'blocking',
        'room_outside_buildable',
        `Phòng "${room.id}" ở ${where} nằm ngoài phần đất được phép xây theo đầu bài.`,
        room.id,
      );
    }

    const measured = rectArea(rect) / 10_000;
    const gap = Math.abs(measured - room.area_m2);
    if (gap > AREA_TOLERANCE_M2 && gap > measured * AREA_TOLERANCE_RATIO) {
      add(
        'blocking',
        'room_area_mismatch',
        `Phòng "${room.id}" ở ${where} khai ${room.area_m2} m² nhưng chữ nhật đo được ${measured.toFixed(1)} m².`,
        room.id,
      );
    }
  }
}

/** (4) Hai phòng không được chồng lên nhau. */
function checkOverlaps(level: AiFloorPlanLevel, where: string, add: Add): void {
  const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const first = rooms[i];
      const second = rooms[j];
      if (!first || !second) continue;
      const area = overlapArea(first.rect, second.rect);
      if (area > OVERLAP_TOLERANCE_CM2) {
        add(
          'blocking',
          'room_overlap',
          `Ở ${where}, phòng "${first.id}" và "${second.id}" chồng lên nhau ${(area / 10_000).toFixed(1)} m².`,
          first.id,
        );
      }
    }
  }
}

/** (6) và (7) Lỗ mở phải nằm trong tường, không chồng nhau; cửa sổ chỉ trên tường bao. */
function checkOpenings(level: AiFloorPlanLevel, walls: WallGeom[], where: string, add: Add): void {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const holes = new Map<string, Interval[]>();

  const place = (id: string, wallId: string, at: number, width: number, kind: string): void => {
    const wall = byId.get(wallId);
    if (!wall) {
      add(
        'blocking',
        'opening_wall_missing',
        `${kind} "${id}" ở ${where} ghi nằm trên tường "${wallId}" nhưng tầng này không có đoạn tường đó.`,
        id,
      );
      return;
    }
    if (width <= 0 || at < -EDGE_TOLERANCE_CM || at + width > wall.length + EDGE_TOLERANCE_CM) {
      add(
        'blocking',
        'opening_outside_wall',
        `${kind} "${id}" ở ${where} đặt tại ${at} cm, rộng ${width} cm, trong khi tường "${wallId}" chỉ dài ${Math.round(wall.length)} cm.`,
        id,
      );
      return;
    }
    const span: Interval = { from: at, to: at + width };
    const existing = holes.get(wallId) ?? [];
    for (const other of existing) {
      if (intervalsOverlap(span, other, EDGE_TOLERANCE_CM)) {
        add(
          'blocking',
          'opening_overlap',
          `${kind} "${id}" ở ${where} chồng lên một lỗ mở khác trên cùng tường "${wallId}".`,
          id,
        );
        return;
      }
    }
    existing.push(span);
    holes.set(wallId, existing);
  };

  for (const door of level.doors ?? []) place(door.id, door.wall, door.at, door.w, 'Cửa');
  for (const window of level.windows ?? []) {
    place(window.id, window.wall, window.at, window.w, 'Cửa sổ');
    const wall = byId.get(window.wall);
    if (wall && wall.kind !== 'e') {
      add(
        'blocking',
        'window_on_partition',
        `Cửa sổ "${window.id}" ở ${where} đặt trên ${wall.kind === 'p' ? 'vách ngăn trong nhà' : 'lan can'} "${wall.id}" — cửa sổ chỉ đặt được trên tường bao.`,
        window.id,
      );
    }
  }
}

/** (8) Mỗi cạnh phòng phải được tường thẳng hàng phủ gần kín. */
function checkEdgeCoverage(
  level: AiFloorPlanLevel,
  walls: WallGeom[],
  where: string,
  add: Add,
): void {
  for (const room of level.rooms) {
    const rect = toRect(room.rect);
    const edges = [
      { name: 'trước', axis: 'x' as const, line: rect.y0, from: rect.x0, to: rect.x1, side: -1 },
      { name: 'sau', axis: 'x' as const, line: rect.y1, from: rect.x0, to: rect.x1, side: 1 },
      { name: 'trái', axis: 'y' as const, line: rect.x0, from: rect.y0, to: rect.y1, side: -1 },
      { name: 'phải', axis: 'y' as const, line: rect.x1, from: rect.y0, to: rect.y1, side: 1 },
    ];

    for (const edge of edges) {
      const length = edge.to - edge.from;
      if (length <= 0) continue;
      const covered = coveredLength(walls, edge);
      if (covered / length < EDGE_COVERAGE_MIN) {
        add(
          'blocking',
          'room_edge_uncovered',
          `Cạnh ${edge.name} của phòng "${room.id}" ở ${where} chỉ được tường phủ ${Math.round((covered / length) * 100)}% — phòng không kín.`,
          room.id,
        );
      }
    }
  }
}

interface Edge {
  axis: 'x' | 'y';
  /** Toạ độ đường thẳng chứa cạnh: `y` với cạnh ngang, `x` với cạnh dọc. */
  line: number;
  from: number;
  to: number;
  /** −1 khi tường nằm phía toạ độ NHỎ hơn cạnh (ngoài phòng), +1 khi nằm phía lớn hơn. */
  side: number;
}

/** Tổng chiều dài cạnh được các đoạn tường thẳng hàng phủ — có gộp phần chồng nhau. */
function coveredLength(walls: readonly WallGeom[], edge: Edge): number {
  const spans: Interval[] = [];

  for (const wall of walls) {
    const horizontal = Math.abs(wall.a[1] - wall.b[1]) <= EDGE_TOLERANCE_CM;
    const vertical = Math.abs(wall.a[0] - wall.b[0]) <= EDGE_TOLERANCE_CM;
    if (edge.axis === 'x' ? !horizontal : !vertical) continue;

    const centre = edge.axis === 'x' ? (wall.a[1] + wall.b[1]) / 2 : (wall.a[0] + wall.b[0]) / 2;
    // Mặt tường giáp phòng: tim lùi ra ngoài nửa bề dày theo đúng phía của cạnh.
    const face = centre - edge.side * (wall.t / 2);
    if (Math.abs(face - edge.line) > EDGE_TOLERANCE_CM) continue;

    const min = edge.axis === 'x' ? Math.min(wall.a[0], wall.b[0]) : Math.min(wall.a[1], wall.b[1]);
    const max = edge.axis === 'x' ? Math.max(wall.a[0], wall.b[0]) : Math.max(wall.a[1], wall.b[1]);
    const from = Math.max(edge.from, min);
    const to = Math.min(edge.to, max);
    if (to > from) spans.push({ from, to });
  }

  spans.sort((a, b) => a.from - b.from);
  let total = 0;
  let cursor = -Infinity;
  for (const span of spans) {
    const from = Math.max(span.from, cursor);
    if (span.to > from) {
      total += span.to - from;
      cursor = span.to;
    }
  }
  return total;
}

/**
 * (5) Mọi phòng phải có ít nhất một cửa hoặc ô thông trên biên.
 *
 * Phòng phục vụ suy từ HÌNH HỌC, không hỏi mô hình: lùi từ điểm giữa lỗ mở ra mỗi bên nửa bề
 * dày tường cộng một chút, rơi vào phòng nào thì cửa phục vụ phòng đó. Đây đúng là quy ước ghi
 * trong hợp đồng — bắt mô hình khai thêm trường "cửa này của phòng nào" là thêm một cách sai.
 *
 * Ngoại lệ là DỮ LIỆU, không phải danh sách trong mã: ban công, sân thượng, giếng trời, ô trống
 * lấy từ nhóm `outdoor`/`void` của `kb/room_vocabulary.yaml`.
 */
function checkDoorsPerRoom(
  level: AiFloorPlanLevel,
  walls: WallGeom[],
  input: PlanCheckInput,
  where: string,
  add: Add,
): void {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const rooms = level.rooms.map((room) => ({ room, rect: toRect(room.rect) }));
  const served = new Set<string>();

  for (const door of level.doors ?? []) {
    const wall = byId.get(door.wall);
    if (!wall) continue;
    const centre: Pt = [
      wall.a[0] + wall.u[0] * (door.at + door.w / 2),
      wall.a[1] + wall.u[1] * (door.at + door.w / 2),
    ];
    const reach = wall.t / 2 + EDGE_TOLERANCE_CM;
    for (const sign of [1, -1]) {
      const probe: Pt = [
        centre[0] + wall.n[0] * sign * reach,
        centre[1] + wall.n[1] * sign * reach,
      ];
      for (const entry of rooms) {
        if (
          probe[0] >= entry.rect.x0 - EDGE_TOLERANCE_CM &&
          probe[0] <= entry.rect.x1 + EDGE_TOLERANCE_CM &&
          probe[1] >= entry.rect.y0 - EDGE_TOLERANCE_CM &&
          probe[1] <= entry.rect.y1 + EDGE_TOLERANCE_CM
        ) {
          served.add(entry.room.id);
        }
      }
    }
  }

  for (const entry of rooms) {
    if (served.has(entry.room.id)) continue;
    if (input.doorExemptTypes.has(entry.room.type)) continue;
    add(
      'blocking',
      'room_without_door',
      `Phòng "${entry.room.id}" ở ${where} không có cửa hay ô thông nào mở vào — không đi tới được.`,
      entry.room.id,
    );
  }
}

/** (10) Tầng nào cũng phải có thang lên tầng trên, và các lõi thang phải chồng khít nhau. */
function checkStairs(plan: AiFloorPlan, add: Add): void {
  const top = Math.max(...plan.levels.map((level) => level.level));
  let reference: { level: number; rect: Rect } | null = null;

  for (const level of [...plan.levels].sort((a, b) => a.level - b.level)) {
    const stairs = level.stairs ?? [];
    if (stairs.length === 0) {
      if (level.level < top) {
        add(
          'blocking',
          'stair_missing',
          `Tầng ${level.level} không có thang trong khi còn tầng ${level.level + 1} ở trên.`,
        );
      }
      continue;
    }

    const first = stairs[0];
    if (!first) continue;
    const rect = toRect(first.rect);
    if (reference) {
      const shift = Math.max(
        Math.abs(rect.x0 - reference.rect.x0),
        Math.abs(rect.y0 - reference.rect.y0),
        Math.abs(rect.x1 - reference.rect.x1),
        Math.abs(rect.y1 - reference.rect.y1),
      );
      if (shift > STAIR_ALIGN_CM) {
        add(
          'blocking',
          'stair_not_aligned',
          `Ô thang tầng ${level.level} lệch ${Math.round(shift)} cm so với tầng ${reference.level} — hai vế thang phải chồng khít nhau.`,
          first.id,
        );
      }
    }
    reference = { level: level.level, rect };
  }
}
