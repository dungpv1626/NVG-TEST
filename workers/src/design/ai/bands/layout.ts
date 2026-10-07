/**
 * Câu trả lời DẢI của mô hình (đường v6, `contracts/ai-house-bands`) → bộ giải → bố cục hình chữ nhật v5
 * (`AiHouseLayout`) + cây chia ô từng tầng. Bố cục đi qua `layoutToIntent` có sẵn (mã danh mục, ban công đua, mái),
 * cây đi thẳng vào cổng `ai/tree/` (qua `ArrangeInput.bandTree`) — đường v6 dùng lại gần trọn đường v5, chỉ khác
 * chỗ ai tính kích thước.
 *
 * Hàm THUẦN.
 */
import type { AiHouseBands, AiHouseLayout, AiPlanTree } from '@nvg/shared/design';

type Door = AiPlanTree['doors'][number];
import { typeOfId, type ProgramRow } from '../house-program';
import type { HouseProgramSpec } from '../../kb/house-program';
import { chooseBandDoors } from './doors';
import {
  placeStairEntry,
  stairSideOf,
  stairSidesNeeded,
  stairUpFromSide,
  type StairSide,
} from '../arrange/doors';
import type { StairParams } from '../stair-geometry';
import {
  OPEN_CELL,
  solveBands,
  stairIdOf,
  type BandIssue,
  type BandRoom,
  type BandStorey,
  type Rect,
} from './solve';

export const STAIR_TOKEN = 'THANG';

const SIDE_VI = { x0: 'trái', x1: 'phải', y0: 'trước', y1: 'sau' } as const;
const SIDE_EN = { x0: 'left', x1: 'right', y0: 'front', y1: 'back' } as const;

export interface BandsLayoutInput {
  bands: AiHouseBands;
  /** Khối xây theo tim tường, cm, toạ độ lô (`PlanContext.buildableCm`). */
  footprintCm: Rect;
  program: readonly ProgramRow[];
  spec: HouseProgramSpec;
  /** Ô thang tối thiểu, cm. */
  stair: { width: number; length: number } | null;
  minSideCm: (type: string) => number;
  usualM2: (type: string) => number;
  normMinM2?: (type: string) => number;
  priority?: Readonly<Record<string, number>>;
  /** Loại phòng đi xuyên được (đã gồm gara nếu loại nhà cho gara là lối đi). */
  through: ReadonlySet<string>;
  /** Loại phòng không cần cửa (`groups.noDoorRequired`). */
  noDoor?: ReadonlySet<string>;
  stairOpensTo?: ReadonlySet<string>;
  servedFrom?: ReadonlyMap<string, ReadonlySet<string>>;
  altarBackSide?: 'x0' | 'x1' | 'y0' | 'y1' | null;
  /** Loại phòng không đẩy chiều sâu theo diện tích (giao thông, giếng trời) — `BandSolveInput.areaFree`. */
  areaFree?: ReadonlySet<string>;
  /** Bề dày tường, cm — bề rộng hành lang là thông thuỷ, bộ giải cộng tường. */
  walls?: { exterior: number; partition: number };
  /** Hành lang thông thuỷ tối thiểu theo loại nhà, cm — `BandSolveInput.corridorClearCm`. */
  corridorClearCm?: number;
  doorWallCm: number;
  /** Vách chung tối thiểu giữa hai ô hành lang (ô thông), cm — vắng = `doorWallCm`. */
  corridorPassCm?: number;
  /** Tầng mái — số tầng ảo của «roof». Vắng = không có mái. */
  roofLevel?: number;
  /**
   * Loại thang của lượt (T105) — có thì lối vào thang mỗi tầng đặt theo đúng logic bộ xếp (`placeStairEntry`: đầu ngắn,
   * sát bậc 1, chiều lên khớp lối vào); `null` = thang thẳng / U mặc định. Vắng = giữ `up: '+y'` (phép thử cũ).
   */
  stairParams?: StairParams | null;
  /** Gầm thang dùng được ở đầu cao (cm) — cho phép ô [THANG / WC] ở tầng 1 (`BandSolveInput.underStairCm`). */
  underStairCm?: number;
  /**
   * Loại để trời (sân, sân thượng, giếng trời…) — có thì kiểm giếng trời thông suốt lên trên (Haan chọn CHẶN, T116):
   * giếng trời ở tầng nào thì mọi tầng trên phải có giếng trời đúng chỗ ấy, tầng mái không phòng nào lợp lên nó.
   */
  openTypes?: ReadonlySet<string>;
  /**
   * Nhà ống (Haan chọn CHẶN, handoff sửa lỗi đợt 3 mục 3.2): loại phòng tầng dưới mà WC / giặt tầng trên không được đè
   * lên. Vắng = không kiểm (loại nhà khác vẫn chỉ trừ điểm E5).
   */
  wetForbiddenBelow?: ReadonlySet<string>;
  /**
   * Gia chủ xếp «lấy sáng» trong hai ưu tiên đầu (đợt 3 mục 3.3): loại phòng phải có mặt thoáng và các cạnh khối nhà
   * thoáng (`y0` mặt tiền…). Vắng = không kiểm (chỉ trừ điểm).
   */
  windowRequired?: {
    types: ReadonlySet<string>;
    openSides: ReadonlySet<'x0' | 'x1' | 'y0' | 'y1'>;
    /**
     * Nhà ống (Haan 07/10/2026, T116 tiếp 17): mỗi tầng chỉ phòng ngủ CHÍNH của tầng bị đòi mặt thoáng — phòng ngủ
     * chính, không có thì phòng ngủ rộng nhất; phòng ngủ thứ hai trở đi chỉ trừ điểm (D2).
     */
    mainBedroomOnly?: boolean;
  };
}

export interface BandsLayoutResult {
  layout: AiHouseLayout | null;
  trees: Map<number, AiPlanTree>;
  issues: BandIssue[];
  /** Chỗ bộ giải tự sửa (tiếng Việt). */
  fixes: string[];
}

export function bandsToLayout(input: BandsLayoutInput): BandsLayoutResult {
  const { bands } = input;
  const levelOf = (raw: string): number | null =>
    raw === 'roof' ? (input.roofLevel ?? null) : Number(raw);
  const storeys: BandStorey[] = bands.storeys.flatMap((storey) => {
    const level = levelOf(storey.level);
    if (level === null || !Number.isInteger(level)) return [];
    return [
      {
        level,
        bands: storey.bands.map((band) => ({
          depth: Math.round(band.depth / 10),
          cells: band.cells.map((cell) =>
            cell.stack.length
              ? {
                  w: Math.round(cell.w / 10),
                  stack: cell.stack.map((s) => ({ id: s.id, d: Math.round(s.d / 10) })),
                }
              : { id: cell.id || OPEN_CELL, w: Math.round(cell.w / 10) },
          ),
        })),
      },
    ];
  });

  // Hộp kỹ thuật / giếng trời chạy suốt nhà: mô hình hay ghi CÙNG một mã ở mọi tầng (lượt thật 619f0438: `hkt_1` ở tầng
  // 2, 3, 4 và mái). Mỗi tầng là một ô riêng — từ lần gặp thứ hai, mã mang thêm hậu tố tầng. Loại khác trùng mã giữa
  // các tầng vẫn là lỗi (một phòng ngủ không thể ở hai tầng).
  //
  // Hành lang cũng vậy trong CÙNG một tầng: mô hình ghi một mã cho hành lang chạy suốt dọc nhà qua nhiều dải (lượt thật
  // 93d212a2: `gt_1` ở dải 2, 3, 4 tầng 1 — bị bác «xuất hiện hai lần», mất trọn một vòng sửa chỉ để đổi mã). Mỗi dải là
  // một đoạn riêng, nối nhau bằng ô thông (hành lang đi xuyên được) — từ đoạn thứ hai, mã mang thêm hậu tố dải.
  const programOf = new Map(input.program.map((row) => [row.id, row]));
  // Hành lang cũng thế giữa các tầng: mô hình ghi `gt_1` cho hành lang mọi tầng (lượt thật 93d212a2).
  const stackedTypes = new Set(['shaft', 'technical', 'light_well', 'circulation']);
  const firstLevel = new Map<string, number>();
  // Mã đã đổi → mã gốc: mã chương trình (`light_well_1`) không có tiền tố `model_added`, mã đổi phải mang loại của gốc
  // (lượt thật 41ffe1e5: `light_well_1_t2` bị bác «không có trong danh mục» cả bốn vòng).
  const renamedFrom = new Map<string, string>();
  for (const storey of storeys) {
    const onStorey = new Set<string>();
    storey.bands.forEach((band, b) => {
      band.cells = band.cells.map((cell) => {
        const rename = (id: string) => {
          if (id === OPEN_CELL || id === STAIR_TOKEN) return id;
          const type = programOf.get(id)?.type ?? typeOfId(id, input.program, input.spec);
          if (onStorey.has(id) && type === 'circulation') {
            // Mã đứng một mình qua mọi tầng: tầng khác tầng gặp đầu tiên mang thêm hậu tố tầng.
            const stem =
              (firstLevel.get(id) ?? storey.level) === storey.level ? id : `${id}_t${storey.level}`;
            let n = b + 1;
            while (onStorey.has(`${stem}_b${n}`)) n += 1;
            onStorey.add(`${stem}_b${n}`);
            return `${stem}_b${n}`;
          }
          onStorey.add(id);
          const seen = firstLevel.get(id);
          if (seen === undefined) {
            firstLevel.set(id, storey.level);
            return id;
          }
          if (seen === storey.level || !type || !stackedTypes.has(type)) return id;
          renamedFrom.set(`${id}_t${storey.level}`, id);
          return `${id}_t${storey.level}`;
        };
        return cell.stack
          ? { ...cell, stack: cell.stack.map((s) => ({ ...s, id: rename(s.id) })) }
          : { ...cell, id: rename(cell.id ?? OPEN_CELL) };
      });
    });
  }

  // Danh mục cho bộ giải: phòng chương trình cấp + mã mô hình tự thêm (tiền tố `model_added`).
  const rooms = new Map<string, BandRoom>();
  for (const row of input.program)
    rooms.set(row.id, { id: row.id, type: row.type, min_m2: row.min_m2 });
  for (const storey of storeys) {
    for (const band of storey.bands) {
      for (const cell of band.cells) {
        for (const id of cell.stack ? cell.stack.map((s) => s.id) : [cell.id ?? OPEN_CELL]) {
          if (id === OPEN_CELL || id === STAIR_TOKEN || rooms.has(id)) continue;
          const stem = renamedFrom.get(id);
          const type = stem
            ? (programOf.get(stem)?.type ?? typeOfId(stem, input.program, input.spec))
            : typeOfId(id, input.program, input.spec);
          if (type) rooms.set(id, { id, type, min_m2: null });
        }
      }
    }
  }
  const corridorPrefix = Object.entries(input.spec.modelAdded).find(
    ([, type]) => type === 'circulation',
  )?.[0];
  const solved = solveBands({
    footprint: input.footprintCm,
    storeys,
    rooms: [...rooms.values()],
    stairToken: STAIR_TOKEN,
    stair: input.stair,
    minSide: input.minSideCm,
    usualM2: input.usualM2,
    ...(input.normMinM2 ? { normMinM2: input.normMinM2 } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.areaFree ? { areaFree: input.areaFree } : {}),
    ...(input.walls
      ? { walls: input.walls, clearWidthTypes: new Set(['circulation', 'core']) }
      : {}),
    ...(input.corridorClearCm ? { corridorClearCm: input.corridorClearCm } : {}),
    ...(input.underStairCm ? { underStairCm: input.underStairCm } : {}),
    // Diện tích lọt lòng trừ tường thật: mép khối là mặt ngoài tường (22 cm) + nửa vách trong — cổng đo như vậy.
    wallCm: input.walls ? Math.ceil(input.walls.exterior + input.walls.partition / 2) : 20,
    ...(corridorPrefix ? { landingId: (level: number) => `${corridorPrefix}_s${level}` } : {}),
    stepCm: 10,
  });
  if (solved.issues.length)
    return { layout: null, trees: new Map(), issues: solved.issues, fixes: solved.fixes };

  const typeOf = (id: string): string =>
    id.startsWith(`${STAIR_TOKEN.toLowerCase()}_`)
      ? 'stair'
      : (rooms.get(id)?.type ?? typeOfId(id, input.program, input.spec) ?? '');
  const parentOf = (id: string): string | null => programOf.get(id)?.parent ?? null;
  const trees = new Map<number, AiPlanTree>();
  const layoutRooms: AiHouseLayout['rooms'] = [];
  const doorPairs: [string, string][] = [];
  const wellIssues = input.openTypes
    ? lightWellIssues(solved.storeys, typeOf, input.openTypes)
    : [];
  // Phòng ở / khu ướt kiểm chung một lần với giếng trời — mọi lỗi một lần (đợt 2 mục 1.1).
  const roomIssues = [
    ...(input.wetForbiddenBelow
      ? wetOverIssues(solved.storeys, typeOf, input.wetForbiddenBelow, input.roofLevel, {
          parentOf,
          below: ENSUITE_OVER_OK,
        })
      : []),
    ...(input.windowRequired
      ? windowIssues(
          solved.storeys,
          typeOf,
          input.windowRequired,
          input.openTypes ?? new Set(),
          input.footprintCm,
          new Set(bands.cantilevers.map((c) => c.from_room)),
          input.roofLevel,
        )
      : []),
  ];
  if (wellIssues.length)
    return {
      layout: null,
      trees: new Map(),
      issues: [...wellIssues, ...roomIssues],
      fixes: solved.fixes,
    };
  // Cặp hành lang – hành lang không cần khai: chúng là một vùng giao thông (handoff sửa lỗi đợt 3 mục 1).
  const prefer = bands.doors_prefer
    .map(([a, b]) => [a!, b!] as const)
    .filter(([a, b]) => !(typeOf(a) === 'circulation' && typeOf(b) === 'circulation'));
  const entryIssues: BandIssue[] = [];
  // Chiều lên của thang tầng 1 — mọi tầng trên dùng chung (tầng duyệt từ dưới lên).
  let anchorUp: NonNullable<AiPlanTree['stair']>['up'] | null = null;
  // Cửa từng tầng trước — chiều lên của thang chọn theo CẢ NHÀ (bên dưới).
  const doorsOf = new Map<number, Door[]>();
  for (const storey of solved.storeys) {
    const doors: Door[] = chooseBandDoors({
      level: storey.level,
      rects: storey.rects,
      typeOf,
      parentOf,
      through: input.through,
      doorWallCm: input.doorWallCm,
      ...(input.corridorPassCm ? { corridorPassCm: input.corridorPassCm } : {}),
      ...(input.walls ? { walls: { footprint: input.footprintCm, ...input.walls } } : {}),
      prefer,
      ...(input.noDoor ? { noDoor: input.noDoor } : {}),
      ...(input.stairOpensTo
        ? { stairOpensTo: input.stairOpensTo, stairTypes: new Set(['stair', 'core']) }
        : {}),
      ...(input.servedFrom ? { servedFrom: input.servedFrom } : {}),
      ...(input.altarBackSide ? { altarBackSide: input.altarBackSide } : {}),
      entryRoom: bands.entry_room || null,
      garageRoom: bands.garage_room || null,
    });
    doorsOf.set(storey.level, doors);
  }
  const hubAt = (storey: (typeof solved.storeys)[number], side: StairSide) => {
    const stairRoom = storey.tree.stair?.room;
    const r = stairRoom ? storey.rects.get(stairRoom) : undefined;
    if (!stairRoom || !r) return false;
    return doorsOf.get(storey.level)!.some((door) => {
      const other = door.a === stairRoom ? door.b : door.b === stairRoom ? door.a : null;
      const rect = other ? storey.rects.get(other) : undefined;
      return !!rect && stairSideOf(r, rect) === side;
    });
  };
  const built = solved.storeys.filter((s) => s.level !== input.roofLevel && s.tree.stair);
  const ground = built[0];
  // Thang U / thẳng chồng một cột: chiều lên của tầng 1 quyết đầu nào ở MỌI tầng phải giáp lối đi. Thử từng đầu ngắn tầng
  // 1 có lối đi, lấy đầu khiến ít tầng trên bị chặn nhất (bản viết tay nhà ống demo: tầng 1 vào được cả đầu trước — từ
  // phòng khách — lẫn đầu sau — từ bếp; tầng trên chỉ có sảnh ở đầu trước).
  let preferredSide: StairSide | null = null;
  if (ground && input.stairParams !== undefined && !ground.tree.stair?.over) {
    const r = ground.rects.get(ground.tree.stair!.room)!;
    const shortSides: StairSide[] = r.y1 - r.y0 >= r.x1 - r.x0 ? ['y0', 'y1'] : ['x0', 'x1'];
    const scored = shortSides
      .filter((side) => hubAt(ground, side))
      .map((side) => {
        const up = stairUpFromSide(side);
        const blocked = built
          .slice(1)
          .reduce(
            (sum, storey) =>
              sum +
              stairSidesNeeded(up, input.stairParams ?? null).filter((need) => !hubAt(storey, need))
                .length,
            0,
          );
        return { side, blocked };
      })
      .sort((p, q) => p.blocked - q.blocked);
    preferredSide = scored[0]?.side ?? null;
  }
  for (const storey of solved.storeys) {
    const isRoof = storey.level === input.roofLevel;
    const doors = doorsOf.get(storey.level)!;
    // Tầng 1: cửa ở đầu đã chọn đứng đầu danh sách — `placeStairEntry` lấy nó làm lối vào.
    if (storey === ground && preferredSide) {
      const stairRoom = storey.tree.stair!.room;
      const r = storey.rects.get(stairRoom)!;
      const at = doors.findIndex((door) => {
        const other = door.a === stairRoom ? door.b : door.b === stairRoom ? door.a : null;
        const rect = other ? storey.rects.get(other) : undefined;
        return !!rect && stairSideOf(r, rect) === preferredSide;
      });
      if (at > 0) doors.unshift(...doors.splice(at, 1));
    }
    let stair = storey.tree.stair;
    if (!isRoof && stair && input.stairParams !== undefined && anchorUp) {
      // Tầng trên: chung chiều lên với tầng 1 (thang chồng một cột); đầu bậc 1 và đầu người từ dưới lên phải giáp lối đi
      // (T105 `stairArrival`; Haan chấm lượt a68c50bb: «ngay bậc một là tường chắn thì đi lên kiểu gì»).
      const stairRoom = stair.room;
      const r = storey.rects.get(stairRoom)!;
      stair = { ...stair, up: anchorUp };
      for (const side of stairSidesNeeded(anchorUp, input.stairParams)) {
        const open = doors.some((door) => {
          const other = door.a === stairRoom ? door.b : door.b === stairRoom ? door.a : null;
          const rect = other ? storey.rects.get(other) : undefined;
          return !!rect && stairSideOf(r, rect) === side;
        });
        if (open) continue;
        entryIssues.push({
          code: 'stair_end_blocked',
          level: storey.level,
          message: `Ô thang "${stairRoom}" tầng ${storey.level}: đầu ${SIDE_VI[side]} (chỗ bậc 1 / chỗ bước ra) không giáp lối đi.`,
          rooms: [stairRoom],
          params: { stair: stairRoom, end: SIDE_EN[side] },
        });
      }
    } else if (!isRoof && stair?.over && input.stairParams !== undefined) {
      // WC gầm thang (T116): chiều lên đã cố định — bậc 1 ở đầu thấp, xa phòng dưới gầm. Đầu ấy phải giáp lối đi.
      const stairRoom = stair.room;
      const r = storey.rects.get(stairRoom)!;
      anchorUp = stair.up;
      const [start] = stairSidesNeeded(stair.up, null);
      const open = doors.some((door) => {
        const other = door.a === stairRoom ? door.b : door.b === stairRoom ? door.a : null;
        const rect = other ? storey.rects.get(other) : undefined;
        return !!rect && stairSideOf(r, rect) === start;
      });
      if (!open) {
        entryIssues.push({
          code: 'stair_end_blocked',
          level: storey.level,
          message: `Ô thang "${stairRoom}" tầng ${storey.level}: đầu ${SIDE_VI[start!]} (chỗ bậc 1, xa WC gầm thang) không giáp lối đi.`,
          rooms: [stairRoom],
          params: { stair: stairRoom, end: SIDE_EN[start!] },
        });
      }
    } else if (!isRoof && stair && input.stairParams !== undefined) {
      const stairRoom = stair.room;
      const entry = placeStairEntry(
        stairRoom,
        storey.rects,
        doors,
        (id) => id !== stairRoom && input.through.has(typeOf(id)),
        input.stairParams,
      );
      if (entry) {
        stair = { ...stair, up: entry.up };
        anchorUp = entry.up;
      }
      // Không đầu ngắn nào giáp lối đi: bước ngang vào vế đang lên — không dùng được (T105), gửi mô hình sửa.
      if (entry?.longSide) {
        entryIssues.push({
          code: 'stair_entry_long_side',
          level: storey.level,
          message: `Ô thang "${stairRoom}" tầng ${storey.level} chỉ vào được từ cạnh dài (qua "${entry.longSide}").`,
          rooms: [stairRoom, entry.longSide],
          params: { stair: stairRoom, host: entry.longSide },
        });
      }
    }
    if (!isRoof) trees.set(storey.level, { ...storey.tree, stair, doors });
    for (const [id, r] of storey.rects) {
      layoutRooms.push({
        id,
        level: isRoof ? 'roof' : String(storey.level),
        rect: [r.x0 * 10, r.y0 * 10, (r.x1 - r.x0) * 10, (r.y1 - r.y0) * 10],
      });
    }
    for (const door of doors) if (door.b !== 'outside') doorPairs.push([door.a, door.b]);
  }
  // WC / mặt thoáng (đợt 3) không dừng sớm: lỗi đầu thang vẫn phải hiện để chương trình chèn sảnh — dừng trước đó thì
  // sảnh không được chèn và câu nhắc mang «không có lối vào» ước trên bộ dải chưa chèn (phát lại df9da65a).
  if (entryIssues.length || roomIssues.length)
    return {
      layout: null,
      trees: new Map(),
      issues: [...roomIssues, ...entryIssues],
      fixes: solved.fixes,
    };
  // Giếng trời mô hình ghi lại ở tầng trên bằng chính mã chương trình (`light_well_1`): trong bộ giải và các phép kiểm nó
  // là giếng trời (`light_well_1_t2`…), ra cây thì là lỗ thông tầng `void_N` — không phải phòng thứ hai của danh mục
  // (phát lại df9da65a: cổng cây bác `leaf_unknown` ở mọi tầng trên).
  const voids = new Map<string, string>();
  for (const [id, stem] of renamedFrom)
    if (programOf.get(stem)?.type === 'light_well') voids.set(id, `void_${voids.size + 1}`);
  if (voids.size) {
    const leaf = (id: string) => voids.get(id) ?? id;
    for (const [level, tree] of trees)
      trees.set(level, {
        ...tree,
        nodes: tree.nodes.map((n) => ({ ...n, a: leaf(n.a), b: leaf(n.b) })),
      });
  }
  return {
    trees,
    issues: [],
    fixes: solved.fixes,
    layout: {
      variant_label: bands.variant_label,
      rationale: bands.rationale,
      design_notes: [bands.parti, ...bands.design_notes].filter((line) => line.trim().length > 0),
      assumptions: bands.assumptions,
      rooms: layoutRooms.filter((room) => !voids.has(room.id)),
      doors: doorPairs.filter(([a, b]) => !voids.has(a) && !voids.has(b)),
      open: [],
      cantilevers: bands.cantilevers,
      entry_room: bands.entry_room,
      garage_room: bands.garage_room,
    },
  };
}

/** Mã ô thang của tầng — cho câu nhắc và phép thử. */
export function bandStairId(level: number): string {
  return stairIdOf({ level }, STAIR_TOKEN);
}

/** Gộp vòng sửa: tầng có trong delta thay trọn danh sách dải; tầng đã khoá giữ nguyên. */
export function mergeBandsDelta(
  base: AiHouseBands,
  delta: {
    storeys: AiHouseBands['storeys'];
    doors_prefer: AiHouseBands['doors_prefer'];
    cantilevers_upsert: AiHouseBands['cantilevers'];
    notes: string[];
  },
  locked: ReadonlySet<string> = new Set(),
): AiHouseBands {
  const replaced = new Map(
    delta.storeys.filter((s) => !locked.has(s.level)).map((s) => [s.level, s]),
  );
  const storeys = base.storeys.map((s) => replaced.get(s.level) ?? s);
  for (const [level, storey] of replaced) {
    if (!base.storeys.some((s) => s.level === level)) storeys.push(storey);
  }
  const cantilevers = [
    ...base.cantilevers.filter((c) => !delta.cantilevers_upsert.some((u) => u.id === c.id)),
    ...delta.cantilevers_upsert.filter((c) => c.depth > 0),
  ];
  return {
    ...base,
    storeys,
    // Cặp cửa gộp qua các vòng sửa: bỏ trùng, giữ 24 cặp MỚI nhất — đúng trần hợp đồng (lượt thật affaf12b: 19 + 1 + 9 + 2
    // = 31 cặp, bộ dải lưu kèm phương án sẽ sai hợp đồng).
    doors_prefer: [
      ...new Map(
        [...base.doors_prefer, ...delta.doors_prefer].map(
          (pair) => [[...pair].sort().join('|'), pair] as const,
        ),
      ).values(),
    ].slice(-24),
    cantilevers,
    design_notes: delta.notes.length ? delta.notes : base.design_notes,
  };
}

/**
 * Giếng trời phải thông lên trời (Haan chấm lượt a68c50bb: «tầng 1 có giếng trời, các tầng còn lại thì không có → quá
 * tệ về mặt logic»; Haan chọn CHẶN). Với mỗi giếng trời (phần nằm trên trục giếng tầng thấp nhất), mọi tầng phía trên phải
 * có giếng trời phủ ≥ 80 % chỗ ấy, hoặc để trống chỗ ấy — không phòng có mái (loại không để trời) nào đè lên quá 20 %.
 */
export function lightWellIssues(
  storeys: readonly { level: number; rects: ReadonlyMap<string, Rect> }[],
  typeOf: (id: string) => string,
  openTypes: ReadonlySet<string>,
): BandIssue[] {
  const issues: BandIssue[] = [];
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const overlap = (p: Rect, q: Rect) =>
    Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) *
    Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));
  const sorted = [...storeys].sort((a, b) => a.level - b.level);
  // Trục giếng = giếng trời ở tầng thấp nhất có giếng. Giếng tầng trên chỉ phải thông PHẦN nằm trên trục ấy — phần thừa ra
  // (lượt thật affaf12b: tầng 3 để giếng chiếm trọn cột cạnh thang, tầng 1 và 4 chỉ phần sau cột) không phải giếng trời
  // bị che; bắt nó thì tầng 3, 4 đều đúng trục mà vẫn bị bác.
  const base =
    sorted
      .map((storey) =>
        [...storey.rects].filter(([id]) => typeOf(id) === 'light_well').map(([, r]) => r),
      )
      .find((wells) => wells.length > 0) ?? [];
  const coreOf = (well: Rect): Rect => {
    for (const r of base) {
      const core = {
        x0: Math.max(well.x0, r.x0),
        y0: Math.max(well.y0, r.y0),
        x1: Math.min(well.x1, r.x1),
        y1: Math.min(well.y1, r.y1),
      };
      if (core.x1 > core.x0 && core.y1 > core.y0) return core;
    }
    return well;
  };
  sorted.forEach((storey, i) => {
    for (const [id, full] of storey.rects) {
      if (typeOf(id) !== 'light_well') continue;
      const well = coreOf(full);
      for (const above of sorted.slice(i + 1)) {
        const rects = [...above.rects];
        const kept = rects.some(
          ([other, r]) => typeOf(other) === 'light_well' && overlap(r, well) >= 0.8 * area(well),
        );
        // Chỗ ấy để trống (ô «.» không xây, sân, sân thượng): giếng vẫn thông — chỉ phòng có mái đè lên mới che.
        const open = rects.every(
          ([other, r]) => openTypes.has(typeOf(other)) || overlap(r, well) <= 0.2 * area(well),
        );
        if (kept || open) continue;
        issues.push({
          code: 'light_well_not_stacked',
          level: storey.level,
          message: `Giếng trời "${id}" tầng ${storey.level} bị che ở tầng ${above.level} — giếng trời phải thông lên trời.`,
          rooms: [id],
          params: { above: String(above.level) },
        });
        break;
      }
    }
  });
  return issues;
}

const overlapArea = (p: Rect, q: Rect) =>
  Math.max(0, Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)) *
  Math.max(0, Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0));

/**
 * WC / giặt tầng trên đè lên phòng ở tầng dưới (nhà ống, Haan chọn CHẶN — handoff sửa lỗi đợt 3 mục 3.2): phần đè quá
 * 10 % diện tích WC là lỗi. Nhà ống luôn có chỗ đặt WC trên gara hay trên WC tầng dưới.
 */
/** Nhà ống: loại phòng tầng dưới mà WC RIÊNG của phòng ngủ được đè lên (khách / ăn) — Haan 07/10/2026, T116 tiếp 17. */
const ENSUITE_OVER_OK: ReadonlySet<string> = new Set(['living', 'dining']);

export function wetOverIssues(
  storeys: readonly { level: number; rects: ReadonlyMap<string, Rect> }[],
  typeOf: (id: string) => string,
  forbidden: ReadonlySet<string>,
  roofLevel?: number,
  /** WC riêng của phòng ngủ (`parent` là phòng ngủ) được đè lên các loại `below` — Haan 07/10/2026, T116 tiếp 17. */
  ensuite?: { parentOf: (id: string) => string | null; below: ReadonlySet<string> },
): BandIssue[] {
  const issues: BandIssue[] = [];
  const isEnsuite = (id: string) => {
    const parent = ensuite?.parentOf(id);
    return !!parent && (typeOf(parent) === 'bedroom' || typeOf(parent) === 'master_bedroom');
  };
  const sorted = [...storeys]
    .filter((s) => s.level !== roofLevel)
    .sort((a, b) => a.level - b.level);
  for (let i = 1; i < sorted.length; i += 1) {
    const below = sorted[i - 1]!;
    for (const [id, r] of sorted[i]!.rects) {
      if (!['wc', 'laundry'].includes(typeOf(id))) continue;
      const area = (r.x1 - r.x0) * (r.y1 - r.y0);
      const ok = isEnsuite(id) ? ensuite!.below : null;
      const hit = [...below.rects].filter(
        ([other, q]) =>
          forbidden.has(typeOf(other)) && !ok?.has(typeOf(other)) && overlapArea(r, q) > 0.1 * area,
      );
      if (!hit.length) continue;
      issues.push({
        code: 'wet_over_living',
        level: sorted[i]!.level,
        message: `"${id}" tầng ${sorted[i]!.level} đè lên ${hit.map(([o]) => `"${o}"`).join(', ')} tầng ${below.level}.`,
        rooms: [id],
        params: { room: id, below: hit.map(([o]) => o).join('", "') },
      });
    }
  }
  return issues;
}

/**
 * Phòng ở không có mặt thoáng (gia chủ xếp «lấy sáng» trong hai ưu tiên đầu — handoff sửa lỗi đợt 3 mục 3.3): phòng
 * thuộc `types` phải có một cạnh trên cạnh khối nhà thoáng, hoặc giáp giếng trời / sân thượng / ban công (loại để trời),
 * hoặc mang ban công đua.
 */
export function windowIssues(
  storeys: readonly { level: number; rects: ReadonlyMap<string, Rect> }[],
  typeOf: (id: string) => string,
  rule: {
    types: ReadonlySet<string>;
    openSides: ReadonlySet<'x0' | 'x1' | 'y0' | 'y1'>;
    mainBedroomOnly?: boolean;
  },
  openTypes: ReadonlySet<string>,
  footprint: Rect,
  cantileverHosts: ReadonlySet<string>,
  roofLevel?: number,
): BandIssue[] {
  const issues: BandIssue[] = [];
  const touches = (p: Rect, q: Rect) => {
    const across = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
    const along = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    return (
      ((p.x1 === q.x0 || q.x1 === p.x0) && along > 0) ||
      ((p.y1 === q.y0 || q.y1 === p.y0) && across > 0)
    );
  };
  for (const storey of storeys) {
    if (storey.level === roofLevel) continue;
    const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
    const bedrooms = [...storey.rects]
      .filter(([id]) => typeOf(id) === 'master_bedroom' || typeOf(id) === 'bedroom')
      .sort(
        ([a, p], [b, q]) =>
          Number(typeOf(b) === 'master_bedroom') - Number(typeOf(a) === 'master_bedroom') ||
          area(q) - area(p),
      );
    const secondary = new Set(rule.mainBedroomOnly ? bedrooms.slice(1).map(([id]) => id) : []);
    for (const [id, r] of storey.rects) {
      if (!rule.types.has(typeOf(id)) || cantileverHosts.has(id) || secondary.has(id)) continue;
      const onFace =
        (rule.openSides.has('y0') && r.y0 === footprint.y0) ||
        (rule.openSides.has('y1') && r.y1 === footprint.y1) ||
        (rule.openSides.has('x0') && r.x0 === footprint.x0) ||
        (rule.openSides.has('x1') && r.x1 === footprint.x1);
      if (onFace) continue;
      const onOpen = [...storey.rects].some(
        ([other, q]) => other !== id && openTypes.has(typeOf(other)) && touches(r, q),
      );
      if (onOpen) continue;
      issues.push({
        code: 'habitable_no_window',
        level: storey.level,
        message: `"${id}" tầng ${storey.level} không có mặt thoáng (không giáp mặt thoáng, giếng trời, sân thượng hay ban công).`,
        rooms: [id],
        params: { room: id },
      });
    }
  }
  return issues;
}
