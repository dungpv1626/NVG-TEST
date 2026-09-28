/**
 * Từ PHÒNG ra hình học bản vẽ — chỗ thực thi của quyết định T23 (12/09/2026).
 *
 * Mô hình khai phòng và lỗ mở trên CẠNH PHÒNG (`contracts/ai-plan-rooms`); artifact thì cần
 * tường và lỗ mở neo vào ĐOẠN TƯỜNG (`contracts/ai-floor-plan`), vì đó là thứ bộ vẽ, bộ xuất DXF
 * và phép đối chiếu mặt thoáng đọc. Tệp này là cây cầu, và nó là đường DUY NHẤT giữa hai hợp đồng.
 *
 * ── Vì sao chương trình suy tường, không hỏi mô hình ────────────────────────────────
 *
 * Vị trí tường suy được TẤT ĐỊNH từ chính chữ nhật phòng mà mô hình đã khai đúng: cạnh chung giữa
 * hai phòng thành vách ngăn, cạnh biên thành tường bao. Hỏi thêm là trả tiền cho một thứ đã biết,
 * và mở ra một cách sai mới — sáu trong 21 phép kiểm CHẶN trước 12/09/2026 tồn tại chỉ vì mô hình
 * khai tường, trong đó `room_edge_uncovered` bắt đúng lúc tường mô hình khai không trùng phòng mô
 * hình khai. Với đường này thì tường và phòng không thể lệch nhau: chúng cùng một nguồn.
 *
 * Giới hạn đã biết và chấp nhận, giữ nguyên từ T19: tường suy ra chỉ có hai bề dày (bao và ngăn),
 * không có tường chịu lực dày riêng và không có cột. Đây là bản phác tham khảo, không phải hồ sơ
 * kết cấu — nhánh AI không sinh kết cấu (CLAUDE.md 8.2 điểm 9). Và vì CHƯƠNG TRÌNH cầm bút suy
 * tường ở mọi lượt, tờ vẽ LUÔN in dòng `AI_DISCLAIMERS.wallsDerived`, không phải chỉ khi cứu hộ.
 */

import type { AiFloorPlanLevel, AiPlanRooms } from '@nvg/shared/design';
import type { ConstructionNorms } from '../kb/construction';
import { deriveWallsFromRooms } from './draw/derive-walls';
import { intervalsOverlap, toRect, type Interval, type Rect } from './draw/geometry';
import { DrawNotes, type DrawNote } from './draw/notes';
import { prepareWalls } from './draw/walls';
import type { PlanIssue } from './plan-check';

type ProposalLevel = AiPlanRooms['levels'][number];
type ProposalDoor = NonNullable<ProposalLevel['doors']>[number];
export type Edge = ProposalDoor['edge'];
type ArtifactDoor = NonNullable<AiFloorPlanLevel['doors']>[number];
type ArtifactWindow = NonNullable<AiFloorPlanLevel['windows']>[number];

/** Tim tường lệch cạnh phòng quá mức này thì không phải tường của cạnh ấy, cm. */
const ANCHOR_SLACK_CM = 2;

export interface LevelGeometry {
  /** Tầng đã đủ tường và lỗ mở neo theo tường — đúng hợp đồng `ai-floor-plan`. */
  level: Omit<AiFloorPlanLevel, 'outline_faces'>;
  /** Mô hình tự mâu thuẫn: lỗ mở trỏ vào phòng không có, hoặc vượt khỏi cạnh. CHẶN. */
  issues: PlanIssue[];
  /** Chỗ chương trình tự xử lý — hiện lên màn hình, không im lặng. */
  notes: DrawNote[];
}

/**
 * Dựng hình học một tầng từ phần mô hình khai.
 *
 * `outdoorTypes` là nhóm `outdoor` của `kb/room_vocabulary.yaml`: cạnh biên của một phòng ngoài
 * trời là LAN CAN (`k: 'r'`), không phải tường. Là dữ liệu vì cùng lý lẽ với mọi danh sách mã
 * phòng khác (CLAUDE.md 8.7) — viết cứng thì hôm thêm một loại không gian ngoài trời mới, bộ vẽ
 * dựng một bức tường kín quanh cái ban công.
 */
export function levelFromRooms(
  level: ProposalLevel,
  norms: ConstructionNorms,
  outdoorTypes: ReadonlySet<string>,
): LevelGeometry {
  const notes = new DrawNotes();
  const issues: PlanIssue[] = [];
  const where = `tầng ${level.level}`;

  issues.push(...checkRoomGaps(level, norms, where));

  const walls = deriveWallsFromRooms(
    level.rooms.map((room) => ({ rect: toRect(room.rect), outdoor: outdoorTypes.has(room.type) })),
    norms,
  );
  if (walls.length === 0) {
    notes.add(
      'walls_not_derivable',
      `Không suy được tường từ chữ nhật phòng của ${where} — tầng không có phòng nào hợp lệ.`,
    );
  }

  const rects = new Map(level.rooms.map((room) => [room.id, toRect(room.rect)]));
  const prepared = prepareWalls(walls);
  const byWallId = new Map(prepared.map((wall) => [wall.id, wall]));

  /**
   * Lỗ mở đã đặt trên mỗi cạnh phòng — để bắt hai lỗ chồng nhau.
   *
   * Đo trên CẠNH PHÒNG chứ không trên đoạn tường, khác phép kiểm trước 12/09/2026: một cạnh phòng
   * có thể được nhiều đoạn tường phủ (tường bị cắt ở mỗi mối T), nên đo trên tường thì hai lỗ nằm
   * trên hai đoạn khác nhau của cùng một cạnh sẽ lọt.
   */
  const taken = new Map<string, Interval[]>();

  /**
   * Lỗ mở đã đặt trên mỗi ĐOẠN TƯỜNG — vế thứ hai của phép bắt chồng, và nó bắt được thứ vế thứ
   * nhất không thấy.
   *
   * Một bức vách chung giữa hai phòng có HAI cạnh phòng cùng nằm trên nó, nên hai lỗ mở khai từ hai
   * phía có hai khoá `room:edge` khác nhau và không bao giờ được so với nhau — rồi cùng neo vào một
   * đoạn tường, cùng một chỗ. Bộ vẽ khoét lỗ hai lần và vẽ hai bộ má cửa đè lên nhau, còn đồ thị
   * «phòng nối phòng» của cổng G3 thì đếm đôi. Phép kiểm trước T23 neo theo tường nên bắt được;
   * vế này trả lại đúng tầm ấy. Một map dùng chung cho CẢ cửa và cửa sổ, vì chúng cũng chồng nhau
   * được.
   */
  const onWall = new Map<string, Interval[]>();

  const anchor = (
    opening: { id: string; room: string; edge: Edge; at: number; w: number },
    what: string,
  ): { wall: string; at: number; reversed: boolean } | null => {
    const rect = rects.get(opening.room);
    if (!rect) {
      issues.push({
        code: 'opening_room_unknown',
        level: 'blocking',
        ref: opening.id,
        message: `${what} "${opening.id}" ở ${where} ghi nằm trên cạnh của phòng "${opening.room}", nhưng tầng này không có phòng đó.`,
      });
      return null;
    }
    const span = edgeSpan(rect, opening.edge);
    if (
      opening.w <= 0 ||
      opening.at < 0 ||
      opening.at + opening.w > span.length + ANCHOR_SLACK_CM
    ) {
      issues.push({
        code: 'opening_outside_edge',
        level: 'blocking',
        ref: opening.id,
        message: `${what} "${opening.id}" ở ${where} đặt tại ${opening.at} cm, rộng ${opening.w} cm, trong khi cạnh ${EDGE_VI[opening.edge]} của phòng "${opening.room}" chỉ dài ${Math.round(span.length)} cm.`,
      });
      return null;
    }

    const slot = `${opening.room}:${opening.edge}`;
    const here: Interval = { from: opening.at, to: opening.at + opening.w };
    const existing = taken.get(slot) ?? [];
    if (existing.some((other) => intervalsOverlap(here, other, ANCHOR_SLACK_CM))) {
      issues.push({
        code: 'opening_overlap',
        level: 'blocking',
        ref: opening.id,
        message: `${what} "${opening.id}" ở ${where} chồng lên một lỗ mở khác trên cùng cạnh ${EDGE_VI[opening.edge]} của phòng "${opening.room}".`,
      });
      return null;
    }
    existing.push(here);
    taken.set(slot, existing);

    // Điểm giữa lỗ mở trong hệ toạ độ của tầng — thứ duy nhất nối hai hệ neo với nhau.
    const middle = opening.at + opening.w / 2;
    const centre: [number, number] = [
      span.from[0] + span.unit[0] * middle,
      span.from[1] + span.unit[1] * middle,
    ];

    for (const wall of prepared) {
      const parallel = Math.abs(wall.u[0] * span.unit[0] + wall.u[1] * span.unit[1]);
      if (parallel < 0.999) continue;
      const across = (centre[0] - wall.a[0]) * wall.n[0] + (centre[1] - wall.a[1]) * wall.n[1];
      // Mặt tường giáp phòng cách tim đúng nửa bề dày: đó là chỗ cạnh phòng đi qua.
      if (Math.abs(Math.abs(across) - wall.t / 2) > ANCHOR_SLACK_CM) continue;
      const along = (centre[0] - wall.a[0]) * wall.u[0] + (centre[1] - wall.a[1]) * wall.u[1];
      if (along < opening.w / 2 - ANCHOR_SLACK_CM) continue;
      if (along > wall.length - opening.w / 2 + ANCHOR_SLACK_CM) continue;
      const at = Math.round(along - opening.w / 2);
      const hole: Interval = { from: at, to: at + opening.w };
      const placed = onWall.get(wall.id) ?? [];
      if (placed.some((other) => intervalsOverlap(hole, other, ANCHOR_SLACK_CM))) {
        issues.push({
          code: 'opening_overlap',
          level: 'blocking',
          ref: opening.id,
          message: `${what} "${opening.id}" ở ${where} chồng lên một lỗ mở khác trên cùng bức tường giữa phòng "${opening.room}" và phòng bên cạnh.`,
        });
        return null;
      }
      placed.push(hole);
      onWall.set(wall.id, placed);
      return {
        wall: wall.id,
        at,
        // Tường có thể chạy NGƯỢC chiều cạnh phòng: lúc đó «đầu gần» của cạnh là «đầu b» của
        // tường, và cánh cửa phải lật theo. Thiếu phép này thì mọi cửa trên một nửa số tường mở
        // sai phía, và không lỗi nào nổ ra.
        reversed: wall.u[0] * span.unit[0] + wall.u[1] * span.unit[1] < 0,
      };
    }

    notes.add(
      'opening_unplaceable',
      `${what} "${opening.id}" ở ${where} không đặt được lên tường nào chương trình suy ra từ cạnh ${EDGE_VI[opening.edge]} của phòng "${opening.room}" — đã bỏ khỏi tờ vẽ.`,
    );
    return null;
  };

  const doors: ArtifactDoor[] = (level.doors ?? []).flatMap((door) => {
    const placed = anchor(door, 'Cửa');
    if (!placed) return [];
    return [
      {
        id: door.id,
        wall: placed.wall,
        at: placed.at,
        w: door.w,
        kind: door.kind,
        hinge: hingeOf(door, placed.reversed),
        side: sideOf(door, placed.reversed),
      },
    ];
  });

  const windows: ArtifactWindow[] = (level.windows ?? []).flatMap((window) => {
    const placed = anchor(window, 'Cửa sổ');
    if (!placed) return [];
    // Cạnh chung với một phòng KHÁC TRONG NHÀ thì không có cửa sổ: bức tường chương trình suy ra ở
    // đó là vách ngăn (`p`), và một cửa sổ trên vách ngăn không mang ánh sáng trời vào. Đây là phép
    // kiểm `window_on_partition` cũ, nay đo trên hình học CHƯƠNG TRÌNH tự suy — nên nó không còn
    // có thể báo oan vì mô hình khai loại tường sai.
    if (byWallId.get(placed.wall)?.kind === 'p') {
      issues.push({
        code: 'window_on_interior_edge',
        level: 'blocking',
        ref: window.id,
        message: `Cửa sổ "${window.id}" ở ${where} đặt trên cạnh ${EDGE_VI[window.edge]} của phòng "${window.room}", nhưng cạnh đó là vách ngăn với một phòng khác trong nhà — cửa sổ chỉ đặt được trên cạnh giáp ngoài trời.`,
      });
      return [];
    }
    return [
      {
        id: window.id,
        wall: placed.wall,
        at: placed.at,
        w: window.w,
        ...(window.sill === undefined ? {} : { sill: window.sill }),
        ...(window.h === undefined ? {} : { h: window.h }),
      },
    ];
  });

  return {
    level: {
      level: level.level,
      name: level.name,
      h: level.h,
      outline: level.outline,
      walls,
      rooms: level.rooms,
      doors,
      windows,
      stairs: level.stairs ?? [],
      voids: level.voids ?? [],
    },
    issues,
    notes: notes.list(),
  };
}

/**
 * Hai phòng cạnh nhau phải CHỪA CHỖ cho bức vách giữa chúng.
 *
 * Vì sao cần phép kiểm riêng: `rect` của phòng là kích thước LỌT LÒNG theo hợp đồng, nên hai phòng
 * kề nhau phải cách nhau đúng bề dày vách. Khi mô hình cho hai chữ nhật CHẠM nhau, bộ suy tường
 * dựng một bức dày 11 cm (hoặc 22 cm nếu một bên là ngoài trời) có TIM nằm đúng trên đường chạm —
 * tức thân tường ăn 5,5 cm (hoặc 11 cm) vào mỗi phòng. Đo được trên fixture: đẩy mặt trước phòng
 * khách lên sát mặt sau chỗ để xe cho ra một bức `t: 11` tim ở y = 382, chiếm 376,5–387,5.
 *
 * Và nó hỏng IM LẶNG: `room_overlap` đòi chồng nhau hơn 100 cm² nên hai phòng chạm mép không chạm
 * ngưỡng, còn `floor_not_covered` thì không thấy lỗ nào. Hệ quả là phòng VẼ RA nhỏ hơn chính
 * `area_m2` nó khai, và chuỗi kích thước của Đợt D sẽ suy từ hình vẽ ấy.
 *
 * Trước T23 chỗ này được canh gián tiếp: `room_edge_uncovered` đòi mỗi cạnh phòng có một mặt tường
 * nằm trên nó, mà hai phòng chạm nhau thì không bức nào thoả được cả hai cạnh. Gỡ phép ấy đi là mở
 * ra khoảng trống này, nên đây là phép trả lại đúng tầm kiểm cũ — lần này đo thẳng nguyên nhân.
 */
function checkRoomGaps(level: ProposalLevel, norms: ConstructionNorms, where: string): PlanIssue[] {
  const needed = Math.round(norms.walls.partition_m * 100);
  const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));
  const issues: PlanIssue[] = [];

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;
      // Hai cặp cạnh đối diện nhau, mỗi cặp kèm phần chồng theo phương vuông góc: chỉ khi hai
      // phòng thật sự kề nhau thì khe mới có nghĩa.
      const pairs = [
        { gap: b.rect.y0 - a.rect.y1, overlap: span(a.rect.x0, a.rect.x1, b.rect.x0, b.rect.x1) },
        { gap: a.rect.y0 - b.rect.y1, overlap: span(a.rect.x0, a.rect.x1, b.rect.x0, b.rect.x1) },
        { gap: b.rect.x0 - a.rect.x1, overlap: span(a.rect.y0, a.rect.y1, b.rect.y0, b.rect.y1) },
        { gap: a.rect.x0 - b.rect.x1, overlap: span(a.rect.y0, a.rect.y1, b.rect.y0, b.rect.y1) },
      ];
      for (const pair of pairs) {
        if (pair.overlap <= ANCHOR_SLACK_CM) continue;
        if (pair.gap < -ANCHOR_SLACK_CM || pair.gap > ANCHOR_SLACK_CM) continue;
        issues.push({
          code: 'rooms_touch_no_wall',
          level: 'blocking',
          ref: a.id,
          message: `Ở ${where}, phòng "${a.id}" và "${b.id}" nằm sát nhau không chừa khe nào cho bức vách giữa chúng. Kích thước phòng là LỌT LÒNG, nên hai phòng kề nhau phải cách nhau ${needed} cm.`,
        });
        break;
      }
    }
  }
  return issues;
}

/** Phần chồng nhau của hai khoảng một chiều, cm. */
function span(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

const EDGE_VI: Record<Edge, string> = {
  front: 'trước',
  back: 'sau',
  left: 'trái',
  right: 'phải',
};

/**
 * Một cạnh của chữ nhật phòng, theo đúng quy ước của hợp đồng: `at` đo từ góc `x` nhỏ với cạnh
 * trước/sau, từ góc `y` nhỏ với cạnh trái/phải.
 */
function edgeSpan(
  rect: Rect,
  edge: Edge,
): { from: [number, number]; unit: [number, number]; length: number } {
  switch (edge) {
    case 'front':
      return { from: [rect.x0, rect.y0], unit: [1, 0], length: rect.x1 - rect.x0 };
    case 'back':
      return { from: [rect.x0, rect.y1], unit: [1, 0], length: rect.x1 - rect.x0 };
    case 'left':
      return { from: [rect.x0, rect.y0], unit: [0, 1], length: rect.y1 - rect.y0 };
    case 'right':
      return { from: [rect.x1, rect.y0], unit: [0, 1], length: rect.y1 - rect.y0 };
  }
}

/** Bản lề: hợp đồng mô hình nói GẦN/XA theo cạnh phòng, artifact nói đầu `a`/`b` của tường. */
function hingeOf(door: ProposalDoor, reversed: boolean): ArtifactDoor['hinge'] {
  if (!door.hinge) return null;
  const atA = door.hinge === 'near' ? !reversed : reversed;
  return atA ? 'a' : 'b';
}

/**
 * Pháp tuyến TRÁI của một cạnh phòng chỉ VÀO TRONG phòng hay ra ngoài.
 *
 * Đây là cầu nối giữa hai cách nói: hợp đồng của mô hình nói cánh cửa quét VÀO hay RA theo phòng
 * (`swing`), còn artifact nói trái hay phải khi đứng ở đầu `a` của tường nhìn về `b` (`side`), và
 * `draw/openings.ts` hiểu `side: 'l'` là quét về phía pháp tuyến trái `n = [−uy, ux]`.
 *
 * Suy từng cạnh, theo đúng quy ước `at` của hợp đồng:
 *
 * | Cạnh    | Chiều `at` | `n = [−uy, ux]` | Phòng nằm phía | Trái là TRONG? |
 * | ------- | ---------- | --------------- | -------------- | -------------- |
 * | `front` | +x         | +y              | y > y0 → +y    | **có**         |
 * | `back`  | +x         | +y              | y < y1 → −y    | không          |
 * | `left`  | +y         | −x              | x > x0 → +x    | không          |
 * | `right` | +y         | −x              | x < x1 → −x    | **có**         |
 *
 * ⚠️ Hàm này phải là chỗ DUY NHẤT giữ phép suy ấy. Trước 12/09/2026 nó là một hằng số chép hai
 * bản — một trong `sideOf` và một trong `roomsProposalOf` của tệp fixture — và **cả hai đều sai
 * cùng một kiểu** (đảo cực). Hai bản sai giống nhau thì triệt tiêu nhau trong phép thử vòng
 * artifact → đề xuất → artifact, nên phép thử ấy xanh, ảnh chụp vàng không đổi, mà đường chạy
 * THẬT thì sai: `swing` đến từ mô hình nên không có gì triệt tiêu, và mọi cánh cửa quay được vẽ
 * sang mặt tường bên kia. Đo được trên fixture: cửa khai «quét vào chỗ để xe» ra mũi cánh ở
 * (211, 488) — nằm trong phòng khách.
 *
 * Vì vậy bất biến này có phép thử đo TUYỆT ĐỐI, không đo theo vòng: mũi cánh phải rơi vào trong
 * chữ nhật phòng đã khai khi `swing: 'in'`, và ra ngoài khi `'out'`.
 */
export function leftNormalPointsInward(edge: Edge): boolean {
  return edge === 'front' || edge === 'right';
}

/** Chiều quét cánh: hợp đồng mô hình nói VÀO/RA theo phòng, artifact nói trái/phải theo tường. */
function sideOf(door: ProposalDoor, reversed: boolean): ArtifactDoor['side'] {
  if (!door.swing) return null;
  const left = (door.swing === 'in') === leftNormalPointsInward(door.edge);
  // Tường chương trình suy ra có thể chạy NGƯỢC chiều cạnh phòng; lúc đó «trái khi đứng ở `a`»
  // lật theo.
  return (reversed ? !left : left) ? 'l' : 'r';
}

/** Loại phòng quyết định chỗ đặt từng khu trong một không gian mở (`kb/room_vocabulary.yaml`). */
export interface MergedZoning {
  /** Khu nấu nướng. */
  cooking: ReadonlySet<string>;
  /** Phòng yên tĩnh: cửa của nó không nên mở thẳng vào khu nấu nướng. */
  quiet: ReadonlySet<string>;
  /** Khu đón khách — xếp về phía cửa vào (T96). Vắng = không xét. */
  reception?: ReadonlySet<string>;
  /** Phòng kề mà khu đón khách phải quay về (sảnh ngoài, chỗ để xe, hành lang). */
  receptionFrom?: ReadonlySet<string>;
}

/** Cách chia khu của không gian mở, đọc từ luật đi lại — MỘT nguồn cho cả tờ vẽ lẫn luật bắt buộc. */
export function mergedZoning(passage: {
  cooking: ReadonlySet<string>;
  quiet: ReadonlySet<string>;
  reception: ReadonlySet<string>;
  receptionFrom: ReadonlySet<string>;
}): MergedZoning {
  return {
    cooking: passage.cooking,
    quiet: passage.quiet,
    reception: passage.reception,
    receptionFrom: passage.receptionFrom,
  };
}

/** Khu đón khách đặt sai phía cửa vào nặng hơn mọi vách chung bếp – phòng yên tĩnh cộng lại, cm. */
const RECEPTION_MISPLACED_COST = 1_000_000;
/** Khu bếp dưới WC tầng trên là luật bắt buộc — nặng hơn cả khu đón khách sai phía. */
const KITCHEN_UNDER_WET_COST = 10_000_000;
/** Phần chồng nhỏ hơn chừng này (0,25 m²) là chạm mép, không phải nằm dưới. */
const WET_ABOVE_MIN_CM2 = 2_500;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

interface PartEntry {
  id: string;
  meta: { type: string; target: number };
}

/**
 * Thứ tự các khu dọc trục chia — chọn thứ tự để khu NẤU NƯỚNG chung vách với phòng yên tĩnh ít nhất
 * (Haan 18/09/2026, chấm lượt 3bc3d2ed: phòng ngủ 28,9 m² mở cửa thẳng vào khu bếp, vì bếp là khu
 * cuối của dải khách–ăn–bếp và đúng cạnh chung với phòng ngủ ấy).
 *
 * Đây KHÔNG phải một luật: không lỗi, không cảnh báo, không trừ điểm. Tường, cửa và diện tích của
 * phòng không đổi — chỉ đổi chỗ ghi nhãn trong chính không gian mở đó, thứ mà kiến trúc sư vẫn tự
 * quyết khi bố trí đồ đạc. Hoà nhau thì giữ nguyên thứ tự mô hình khai.
 */
function bestPartOrder(
  parts: readonly PartEntry[],
  rect: Rect,
  roomId: string,
  rooms: AiFloorPlanLevel['rooms'],
  zoning: MergedZoning | undefined,
  avoidAbove: readonly Rect[] = [],
): PartEntry[] {
  if (!zoning || parts.length < 2) return [...parts];
  const cooking = parts.filter((part) => zoning.cooking.has(part.meta.type));
  const quiet =
    cooking.length === 0 || cooking.length === parts.length
      ? []
      : rooms
          .filter((other) => other.id !== roomId && zoning.quiet.has(other.type))
          .map((other) => toRect(other.rect));
  // Khu đón khách (T96): quay về phía phòng loại `receptionFrom` kề không gian này; không có phòng nào
  // như thế mà không gian chạm mặt đường (hàng đầu của tầng) thì quay ra mặt đường.
  const reception = zoning.reception ? parts.filter((p) => zoning.reception!.has(p.meta.type)) : [];
  const anchors: Rect[] =
    reception.length && reception.length < parts.length
      ? receptionAnchors(rect, roomId, rooms, zoning)
      : [];
  // Khu bếp không nằm dưới WC tầng trên (luật bắt buộc T71): thứ tự khu đổi được là đổi, để không tạo
  // một vi phạm bắt buộc chỉ vì nhãn (phát lại 4a521f52 vòng 2–3 sau khi khu khách quay về phía sảnh).
  const wetAbove = cooking.length && cooking.length < parts.length ? avoidAbove : [];
  if (quiet.length === 0 && anchors.length === 0 && wetAbove.length === 0) return [...parts];

  const horizontal = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
  const span = horizontal ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
  const total = parts.reduce((sum, part) => sum + part.meta.target, 0);

  /** Khu đón khách sai phía (một khoản lớn), cộng chiều dài vách chung bếp – phòng yên tĩnh, cm. */
  const cost = (order: readonly PartEntry[]): number => {
    let cursor = horizontal ? rect.x0 : rect.y0;
    let sum = 0;
    let received = anchors.length === 0;
    for (const part of order) {
      const end = cursor + (span * part.meta.target) / total;
      const box: Rect = horizontal
        ? { ...rect, x0: cursor, x1: end }
        : { ...rect, y0: cursor, y1: end };
      if (zoning.cooking.has(part.meta.type)) {
        for (const other of quiet) sum += sharedEdgeLength(box, other);
        for (const wet of wetAbove) {
          if (overlapArea(box, wet) > WET_ABOVE_MIN_CM2) sum += KITCHEN_UNDER_WET_COST;
        }
      }
      if (!received && zoning.reception!.has(part.meta.type)) {
        received = anchors.some((anchor) => sharedEdgeLength(box, anchor) > 0);
      }
      cursor = end;
    }
    return sum + (received ? 0 : RECEPTION_MISPLACED_COST);
  };

  let best = [...parts];
  let bestCost = cost(best);
  if (bestCost === 0) return best;
  for (const order of permutations(parts)) {
    const value = cost(order);
    if (value < bestCost - 0.5) {
      best = [...order];
      bestCost = value;
    }
  }
  return best;
}

/**
 * Chỗ khu đón khách phải chạm tới: phòng kề không gian mở thuộc loại ĐẦU TIÊN của `receptionFrom` có mặt
 * (sảnh ngoài trước, rồi chỗ để xe, rồi hành lang — có sảnh thì gara không còn là lối vào; phát lại 5fda70dc:
 * gara kề cạnh bên làm mọi thứ tự đều «đã đón», và bếp lại về phía sảnh); không có thì mặt đường (đường y nhỏ
 * nhất của tầng — hàng đầu bản phác là mặt đường) khi không gian chạm nó.
 */
function receptionAnchors(
  rect: Rect,
  roomId: string,
  rooms: AiFloorPlanLevel['rooms'],
  zoning: MergedZoning,
): Rect[] {
  for (const type of zoning.receptionFrom ?? []) {
    const beside = rooms
      .filter((other) => other.id !== roomId && other.type === type)
      .map((other) => toRect(other.rect))
      .filter((other) => sharedEdgeLength(rect, other) > 0);
    if (beside.length) return beside;
  }
  const front = Math.min(...rooms.map((other) => other.rect[1] ?? Infinity));
  return Number.isFinite(front) && rect.y0 <= front + 25
    ? [{ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y0 }]
    : [];
}

/** Hoán vị, thứ tự tất định. Danh sách khu của một không gian mở nhiều nhất ba phần (`also` kẹp 2). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([items[i]!, ...tail]);
  }
  return out;
}

/** Chiều dài đoạn vách chung của hai chữ nhật, cm — 0 khi không kề nhau (kể cả khi chồng lấn). */
function sharedEdgeLength(a: Rect, b: Rect, tolerance = 25): number {
  const touchX = Math.abs(a.x1 - b.x0) <= tolerance || Math.abs(b.x1 - a.x0) <= tolerance;
  const touchY = Math.abs(a.y1 - b.y0) <= tolerance || Math.abs(b.y1 - a.y0) <= tolerance;
  if (touchY) return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  if (touchX) return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return 0;
}

/** Ranh mềm làm tròn về mô-đun này, cm — cùng mô-đun bộ xếp đặt vách. */
const PART_MODULE_CM = 5;

/**
 * Chia một không gian mở thành các KHU để tờ vẽ ghi tên từng khu (T48, 16/09/2026 — Haan chấm lượt
 * 58d9ff66: «nếu gộp thì trên hình vẫn phải có chi tiết phân cách mềm giữa các khu vực»).
 *
 * Phòng mang `also` là MỘT ô không vách — bếp, ăn, khách chung một chữ nhật. Trước đây tờ vẽ chỉ ghi
 * tên phòng chính, nên một ô 6 × 14,5 m đọc thành «phòng khách 86,8 m²». Nay chương trình chia chữ
 * nhật ấy theo tỉ lệ diện tích MỤC TIÊU của từng phòng trong chương trình không gian, cắt dọc cạnh
 * DÀI (dãy khu nối nhau theo chiều sâu, như nhà thật), và trả về `parts`.
 *
 * Đây là NHÃN ĐỌC, không phải hình học: không sinh tường, không đổi `area_m2` của phòng, không vào
 * `walls[]`. Thiếu diện tích mục tiêu của một thành viên thì không chia — thà một nhãn chung còn hơn
 * một ranh đặt bừa.
 */
export function withMergedParts(
  rooms: AiFloorPlanLevel['rooms'],
  targetOf: (id: string) => { type: string; target: number } | null,
  zoning?: MergedZoning,
  /** Chữ nhật khu ướt của tầng NGAY TRÊN — khu bếp tránh nằm dưới chúng (T96). */
  avoidAbove: readonly Rect[] = [],
): AiFloorPlanLevel['rooms'] {
  return rooms.map((room) => {
    const members = [room.id, ...(room.also ?? [])];
    if (members.length < 2) return room;
    const declared = members.map((id) => ({ id, meta: targetOf(id) }));
    if (declared.some((part) => part.meta === null || part.meta.target <= 0)) return room;
    const rect = toRect(room.rect);
    const parts = bestPartOrder(declared as PartEntry[], rect, room.id, rooms, zoning, avoidAbove);
    const horizontal = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
    const span = horizontal ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
    const total = parts.reduce((sum, part) => sum + part.meta!.target, 0);
    let cursor = horizontal ? rect.x0 : rect.y0;
    const out = parts.map((part, index) => {
      const end =
        index === parts.length - 1
          ? horizontal
            ? rect.x1
            : rect.y1
          : Math.round((cursor + (span * part.meta!.target) / total) / PART_MODULE_CM) *
            PART_MODULE_CM;
      const box: Rect = horizontal
        ? { ...rect, x0: cursor, x1: end }
        : { ...rect, y0: cursor, y1: end };
      cursor = end;
      return {
        id: part.id,
        type: part.meta!.type,
        rect: [box.x0, box.y0, box.x1, box.y1] as [number, number, number, number],
        area_m2: Math.round(((box.x1 - box.x0) * (box.y1 - box.y0)) / 100) / 100,
      };
    });
    // Ranh làm tròn có thể nuốt một khu hẹp hơn mô-đun: bỏ cả bảng, không vẽ ranh sai.
    if (out.some((part) => part.area_m2 <= 0)) return room;
    return { ...room, parts: out };
  });
}
