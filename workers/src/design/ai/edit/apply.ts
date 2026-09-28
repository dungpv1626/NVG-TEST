/**
 * Áp thao tác sửa của kỹ sư lên một mặt bằng AI đã lưu (T53, 16/09/2026).
 *
 * Haan chấm T52: «những lỗi này chỉ là điểm bất hợp lý trên bản vẽ này … còn lựa chọn đặt cửa ở chỗ
 * khác tốt hơn mà không cần sửa lại toàn bộ». Nên chỗ sửa là CÂY CHIA đã lưu trong artifact — nguồn
 * hình học duy nhất của phương án — chứ không phải bản phác của mô hình: đổi đúng chỗ kỹ sư nói, cho qua
 * CÙNG cổng kiểm (`layoutLevel`, `finalisePlan`), chấm lại điểm. Mọi chỗ kỹ sư không nhắc giữ nguyên
 * theo cấu tạo.
 *
 * Hàm THUẦN: không đọc tệp, không gọi mô hình, không ghi gì. Hỏng thì trả lý do tiếng Việt, không ném.
 */

import type { AiFloorPlan, AiPlanEdit, AiPlanTree, AiSpaceProgram } from '@nvg/shared/design';
import {
  finalisePlan,
  type ArrangedLevel,
  type HouseScoring,
  type PlanCallRecord,
  type PlanContext,
  type PlanContextInput,
  type PlanFinal,
} from '../plan';
import { prepareWalls } from '../draw/walls';
import { doorLinks } from '../plan-check';
import { layoutLevel, type LevelAnchors } from '../tree';
import { mandatoryFor, mandatoryKey, mandatoryViolations } from '../mandatory';

export type PlanEditOp = AiPlanEdit['ops'][number];

export interface EditApplyInput {
  base: AiFloorPlan;
  program: AiSpaceProgram;
  ops: readonly PlanEditOp[];
  contextInput: PlanContextInput & HouseScoring;
  context: PlanContext;
  call: PlanCallRecord;
  route: string;
  promptVersion: string;
}

export interface EditApplyResult {
  /** `null` khi có thao tác không áp được hoặc bản sửa không qua cổng. */
  final: PlanFinal | null;
  /** Chương trình không gian của bản sửa — khác bản gốc khi có `resize_room`. */
  program: AiSpaceProgram;
  /** Lý do không áp được / không qua cổng — tiếng Việt, cho kỹ sư đọc. */
  issues: string[];
  /** Từng thao tác đã áp, tiếng Việt. */
  applied: string[];
}

const OUTSIDE = 'outside';

/** Lỗi cổng chỉ hạ xuống ghi chú trong lượt SỬA — xem chỗ truyền `relax` bên dưới. */
const LEGACY_RELAXED: ReadonlySet<string> = new Set(['door_from_stair']);

/** Đổi diện tích phải kéo phòng lại gần số kỹ sư muốn ít nhất chừng này, m² — không thì coi là không căn được. */
const RESIZE_PROGRESS_M2 = 0.5;

export function applyPlanEdits(input: EditApplyInput): EditApplyResult {
  const issues: string[] = [];
  const applied: string[] = [];
  let program = input.program;
  const stairTypes = new Set(input.contextInput.stairTypes);
  const typeOf = new Map(program.spaces.map((space) => [space.id, space.type]));
  const trees = new Map<number, AiPlanTree>();

  for (const stored of input.base.levels) {
    if (!stored.tree) {
      return fail(
        program,
        'Phương án này đúc trước khi lưu cây chia — không sửa trực tiếp được; chạy lại mặt bằng.',
      );
    }
    const tree = {
      variant_label: null,
      rationale: '',
      ...structuredClone(stored.tree),
    } as AiPlanTree;
    materialiseDoors(tree, stored);
    trees.set(stored.level, tree);
  }

  for (const op of input.ops) {
    if (op.op === 'relayout') continue; // luồng gọi mô hình xử lý — không phải việc của hàm này
    const tree = trees.get(op.level);
    if (!tree) {
      issues.push(`Không có tầng ${op.level} trong phương án.`);
      continue;
    }
    const where = `tầng ${op.level}`;
    const leaves = leafIds(tree);
    // Phòng gộp (`also`) không phải lá — thao tác nhắm vào nó là nhắm vào ô chứa nó.
    const host = (id: string | null): string | null => {
      if (!id) return null;
      if (id === OUTSIDE || leaves.has(id)) return id;
      return tree.also.find((entry) => entry.with.includes(id))?.room ?? null;
    };
    const need = (id: string | null, label: string): string | null => {
      const leaf = host(id);
      if (!leaf) issues.push(`${where}: không có phòng "${id ?? ''}" (${label}).`);
      return leaf;
    };
    const isStair = (id: string) => stairTypes.has(typeOf.get(id) ?? '');

    switch (op.op) {
      case 'move_door': {
        const room = need(op.room, 'phòng cần dời cửa');
        const to = need(op.to, 'phía mở cửa ra');
        if (!room || !to || room === to) break;
        const from = op.from ? host(op.from) : null;
        const interior = tree.doors.filter(
          (door) =>
            (door.a === room || door.b === room) && door.a !== OUTSIDE && door.b !== OUTSIDE,
        );
        const existing = tree.doors.find((door) => joins(door, room, to));
        // Cửa cũ: đúng phòng kỹ sư nói, hoặc cửa trong nhà duy nhất của phòng.
        const old =
          from && from !== to
            ? tree.doors.find((door) => joins(door, room, from))
            : !existing && interior.length === 1
              ? interior[0]
              : undefined;
        if (old) tree.doors = tree.doors.filter((door) => door !== old);
        if (existing) {
          existing.place = op.place ?? null;
        } else {
          tree.doors.push({
            a: to === OUTSIDE ? room : to,
            b: to === OUTSIDE ? OUTSIDE : room,
            kind: old?.kind ?? 'single',
            full: null,
            place: op.place ?? null,
          });
        }
        applied.push(
          `${where}: cửa "${room}" mở ra "${to}"${old ? ` thay cho "${old.a === room ? old.b : old.a}"` : ''}${op.place && op.place !== 'middle' ? ` (${op.place === 'start' ? 'đầu' : 'cuối'} vách)` : ''}.`,
        );
        break;
      }
      case 'open_wall': {
        const a = need(op.a, 'phòng thứ nhất');
        const b = need(op.b, 'phòng thứ hai');
        if (!a || !b || a === OUTSIDE || b === OUTSIDE) break;
        tree.doors = tree.doors.filter((door) => !joins(door, a, b));
        tree.doors.push({ a, b, kind: 'opening', full: true, place: null });
        applied.push(`${where}: bỏ vách giữa "${a}" và "${b}".`);
        break;
      }
      case 'close_wall': {
        const a = need(op.a, 'phòng thứ nhất');
        const b = need(op.b, 'phòng thứ hai');
        if (!a || !b) break;
        const before = tree.doors.length;
        tree.doors = tree.doors.filter((door) => !joins(door, a, b));
        if (tree.doors.length === before) {
          issues.push(`${where}: giữa "${a}" và "${b}" không có cửa hay ô thông nào để bỏ.`);
          break;
        }
        applied.push(`${where}: bỏ cửa giữa "${a}" và "${b}", dựng lại vách.`);
        break;
      }
      case 'swap_rooms': {
        const a = need(op.a, 'phòng thứ nhất');
        const b = need(op.b, 'phòng thứ hai');
        if (!a || !b || a === b) break;
        if (isStair(a) || isStair(b)) {
          issues.push(`${where}: ô thang phải chồng khít các tầng — không đổi chỗ được.`);
          break;
        }
        const swap = (id: string) => (id === a ? b : id === b ? a : id);
        for (const node of tree.nodes) {
          node.a = swap(node.a);
          node.b = swap(node.b);
        }
        // Cửa đi theo VỊ TRÍ: phòng mới vào chỗ nào dùng lối vào của chỗ ấy.
        for (const door of tree.doors) {
          door.a = swap(door.a);
          door.b = swap(door.b);
        }
        applied.push(`${where}: đổi chỗ "${a}" và "${b}".`);
        break;
      }
      case 'resize_room': {
        const room = need(op.room, 'phòng cần đổi diện tích');
        if (!room || op.area_m2 === null) break;
        if (isStair(room)) {
          issues.push(`${where}: ô thang do số bậc quyết — không đổi diện tích được.`);
          break;
        }
        // Dời MỘT vách chung với phòng kề có cạnh chung dài nhất, đúng khoảng bù phần diện tích thiếu /
        // thừa. Căn lại cả tầng theo chương trình (`sizing.ts`) chỉ nhận khi CẢ TẦNG sát hơn, nên một
        // yêu cầu cho một phòng thường không làm gì — đo trên lượt 58688ead: bốn phòng thử, không phòng
        // nào đổi.
        const stored = input.base.levels.find((entry) => entry.level === op.level);
        const current = stored?.rooms.find((entry) => entry.id === room);
        const rect = new Map((stored?.rooms ?? []).map((entry) => [entry.id, entry.rect]));
        const mine = rect.get(room);
        if (!current || !mine) {
          issues.push(`${where}: không đọc được kích thước hiện tại của "${room}".`);
          break;
        }
        const options = [...leaves]
          .filter((other) => other !== room && !isStair(other) && rect.has(other))
          .map((other) => ({ other, shared: sharedLength(mine, rect.get(other)!) }))
          .filter((entry) => entry.shared > 0)
          .sort((p, q) => q.shared - p.shared)
          .map((entry) => ({ ...entry, node: dividingNode(tree, room, entry.other) }))
          .filter((entry) => entry.node !== null);
        const pick = options[0];
        if (!pick) {
          issues.push(`${where}: "${room}" không chung bức vách dời được nào với phòng bên cạnh.`);
          break;
        }
        const node = pick.node!.node;
        const along = node.cut === 'x' ? mine[3]! - mine[1]! : mine[2]! - mine[0]!;
        const deltaCm = ((op.area_m2 - current.area_m2) * 10_000) / along;
        const roomOnLow = subtreeLeaves(tree, node.a).has(room);
        node.at = Math.round(node.at + (roomOnLow ? 1 : -1) * deltaCm);
        program = {
          ...program,
          spaces: program.spaces.map((space) =>
            space.id === room ? { ...space, target_area_m2: op.area_m2! } : space,
          ),
        };
        applied.push(
          `${where}: "${room}" từ ${current.area_m2} m² thành khoảng ${op.area_m2} m², dời vách chung với "${pick.other}" ${Math.round(Math.abs(deltaCm))} cm.`,
        );
        break;
      }
      case 'move_wall': {
        const a = need(op.a, 'phòng thứ nhất');
        const b = need(op.b, 'phòng thứ hai');
        if (!a || !b || op.delta_m === null) break;
        if (isStair(a) || isStair(b)) {
          issues.push(`${where}: ô thang phải chồng khít các tầng — không dời vách của nó được.`);
          break;
        }
        const node = dividingNode(tree, a, b);
        if (!node) {
          issues.push(`${where}: "${a}" và "${b}" không chung một bức vách chạy suốt để dời.`);
          break;
        }
        const aOnLow = subtreeLeaves(tree, node.node.a).has(a);
        node.node.at = Math.round(node.node.at + (aOnLow ? 1 : -1) * op.delta_m * 100);
        applied.push(
          `${where}: dời vách giữa "${a}" và "${b}" ${Math.abs(op.delta_m)} m về phía "${op.delta_m > 0 ? b : a}".`,
        );
        break;
      }
      case 'window': {
        const room = need(op.room, 'phòng cần đổi cửa sổ');
        if (!room || op.on === null) break;
        tree.no_window = op.on
          ? tree.no_window.filter((id) => id !== room)
          : [...new Set([...tree.no_window, room])];
        applied.push(`${where}: ${op.on ? 'thêm' : 'bỏ'} cửa sổ "${room}".`);
        break;
      }
    }
  }
  if (issues.length) return { final: null, program, issues, applied };

  // Dựng lại MỌI tầng theo thứ tự — tầng trên nhận mốc của tầng 1, đúng như lúc xếp. Tầng không đổi
  // dựng lại ra đúng tầng đã lưu (cây đã căn vách, không căn lại).
  const { contextInput, context } = input;
  const buildingType = contextInput.digest.building_type;
  const levels: ArrangedLevel[] = [];
  let anchors: LevelAnchors | null = null;
  for (const stored of [...input.base.levels].sort((p, q) => p.level - q.level)) {
    const tree = trees.get(stored.level)!;
    const layout = layoutLevel({
      tree,
      level: stored.level,
      isTop: stored.level === context.levels[context.levels.length - 1],
      program,
      buildableCm: context.buildableCm,
      construction: contextInput.construction,
      groups: contextInput.groups,
      mergeAllowed: contextInput.mergeAllowed,
      openFaces: context.openFaces,
      accessFaces: context.accessFaces,
      anchors,
      entrances: context.entrances,
      // Luật ra đời sau bản vẽ đang sửa không được chặn lượt sửa: bản vẽ ấy đã lưu rồi, và kỹ sư
      // đang yêu cầu một chỗ khác (18/09/2026).
      relax: LEGACY_RELAXED,
    });
    if (!layout.level) {
      issues.push(...layout.issues.map((issue) => issue.message));
      continue;
    }
    if (stored.level === context.levels[0]) anchors = layout.anchors;
    levels.push({
      level: layout.level,
      tree: layout.tree,
      intent: stored.intent ?? {
        rooms: [],
        relationships: [],
        entry_room: null,
        garage_room: null,
      },
      arrange: {
        candidates: stored.arrange?.candidates ?? 1,
        passed: stored.arrange?.passed ?? 1,
        intentFit: stored.arrange?.intent_fit ?? 0,
        parti: stored.arrange?.parti ?? 'sửa theo yêu cầu kỹ sư',
        relaxed: stored.arrange?.relaxed ?? 0,
      },
      notes: layout.notes,
      rationale: input.base.rationale,
      variantLabel: stored.level === context.levels[0] ? input.base.variant_label : null,
    });
  }
  if (issues.length) return { final: null, program, issues, applied };

  const final = finalisePlan({
    levels,
    context,
    program,
    programRef: input.base.program_ref,
    variant: {
      id: input.base.variant_id,
      label: input.base.variant_label ?? input.base.variant_id,
      strategy: input.base.strategy ?? '',
    },
    call: input.call,
    route: input.route,
    promptVersion: input.promptVersion,
    resampledLevels: [],
    construction: contextInput.construction,
    groups: contextInput.groups,
    quality: contextInput.quality,
    scoreRules: contextInput.scoreRules,
    ...(contextInput.areaNorms ? { areaNorms: contextInput.areaNorms } : {}),
    roomGroups: contextInput.roomGroups,
    buildingType,
    relaxMandatory: preExistingViolations(input.base, context, program),
  });
  if (final.check.blocking.length) {
    return {
      final: null,
      program,
      issues: final.check.blocking.map((issue) => issue.message),
      applied,
    };
  }
  // Bỏ cửa mà phòng mất lối vào thì cổng TỰ MỞ LẠI một cửa (`door_added`) — lặng lẽ trả về đúng bản
  // cũ là nói dối kỹ sư. Đo trên hình học đã dựng.
  for (const op of input.ops) {
    if (op.op !== 'close_wall' || !op.a || !op.b) continue;
    const level = final.payload.levels.find((entry) => entry.level === op.level);
    if (!level) continue;
    const reopened = doorLinks(level, prepareWalls(level.walls)).some(
      (link) => link.rooms.includes(op.a!) && link.rooms.includes(op.b!),
    );
    if (reopened) {
      issues.push(
        `Tầng ${op.level}: không bỏ được cửa giữa "${op.a}" và "${op.b}" — một trong hai phòng sẽ không còn lối vào nào khác.`,
      );
    }
  }
  // Căn vách theo diện tích mới chỉ được nhận khi qua cổng và SÁT HƠN (`layoutLevel`) — không căn được
  // thì hình học giữ nguyên. Báo thẳng, đừng lưu một «bản sửa» không sửa gì.
  for (const op of input.ops) {
    if (op.op !== 'resize_room' || !op.room || op.area_m2 === null) continue;
    const areaOf = (plan: AiFloorPlan) =>
      plan.levels
        .find((entry) => entry.level === op.level)
        ?.rooms.find((entry) => entry.id === op.room || entry.also?.includes(op.room!))?.area_m2 ??
      null;
    const before = areaOf(input.base);
    const after = areaOf(final.payload);
    if (before === null || after === null) continue;
    if (Math.abs(after - op.area_m2) > Math.abs(before - op.area_m2) - RESIZE_PROGRESS_M2) {
      issues.push(
        `Tầng ${op.level}: không căn được vách để "${op.room}" gần ${op.area_m2} m² (vẫn ${after} m²) — các phòng quanh nó không nhường được chỗ. Thử dời vách với một phòng cụ thể.`,
      );
    }
  }
  if (issues.length) return { final: null, program, issues, applied };
  return { final, program, issues: [], applied };
}

type TreeDoorKind = AiPlanTree['doors'][number]['kind'];
const TREE_DOOR_KINDS = new Set<string>([
  'single',
  'double',
  'sliding',
  'garage',
  'gate',
  'opening',
]);

/**
 * Đưa vào cây MỌI cửa đang có trên bản vẽ đã lưu mà cây chưa khai.
 *
 * Cây lưu trong artifact chỉ giữ cửa mô hình khai; cửa cổng tự mở cho phòng thiếu lối vào
 * (`door_added`) chỉ có trên hình học. Dựng lại từ cây thì cổng suy lại những cửa ấy từ đầu — sau
 * một lần đổi chỗ phòng nó có thể chọn khác hẳn. Đo 17/09/2026 trên phương án 082293: đổi chỗ bếp với
 * phòng ăn làm mất cửa phòng ăn–thang, thang không còn lối vào và lượt sửa hỏng. Chốt các cửa đang
 * thấy thì bản sửa chỉ đổi đúng chỗ kỹ sư nói.
 */
function materialiseDoors(tree: AiPlanTree, stored: AiFloorPlan['levels'][number]): void {
  if (!stored.walls?.length || !stored.doors?.length) return;
  const leaves = leafIds(tree);
  const kindOf = new Map(stored.doors.map((door) => [door.id, door.kind as string]));
  for (const link of doorLinks(stored, prepareWalls(stored.walls))) {
    const [a, other] = link.rooms;
    if (!a || !leaves.has(a)) continue;
    const b = link.toOutside ? OUTSIDE : other;
    if (!b || (b !== OUTSIDE && !leaves.has(b)) || link.rooms.length > 2) continue;
    if (tree.doors.some((door) => joins(door, a, b))) continue;
    const kind = kindOf.get(link.id) ?? 'single';
    tree.doors.push({
      a,
      b,
      kind: (TREE_DOOR_KINDS.has(kind) ? kind : 'single') as TreeDoorKind,
      full: null,
      place: null,
    });
  }
}

function fail(program: AiSpaceProgram, message: string): EditApplyResult {
  return { final: null, program, issues: [message], applied: [] };
}

/** Chiều dài cạnh chung của hai chữ nhật lọt lòng cách nhau một bề dày vách, cm; 0 khi không kề. */
function sharedLength(a: readonly number[], b: readonly number[]): number {
  const [ax0 = 0, ay0 = 0, ax1 = 0, ay1 = 0] = a;
  const [bx0 = 0, by0 = 0, bx1 = 0, by1 = 0] = b;
  const gap = (p: number, q: number) => Math.abs(p - q) <= WALL_GAP_CM;
  if (gap(ax1, bx0) || gap(bx1, ax0)) return Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  if (gap(ay1, by0) || gap(by1, ay0)) return Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
  return 0;
}

/** Khe giữa hai phòng kề nhau, cm — tường dày nhất cộng dung sai. */
const WALL_GAP_CM = 30;

function joins(door: { a: string; b: string }, p: string, q: string): boolean {
  return (door.a === p && door.b === q) || (door.a === q && door.b === p);
}

/** Mọi lá của cây: con của nút mà không phải mã nút. */
function leafIds(tree: AiPlanTree): Set<string> {
  const nodeIds = new Set(tree.nodes.map((node) => node.id));
  const out = new Set<string>();
  for (const node of tree.nodes) {
    for (const child of [node.a, node.b]) if (!nodeIds.has(child)) out.add(child);
  }
  return out;
}

function subtreeLeaves(tree: AiPlanTree, id: string): Set<string> {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const out = new Set<string>();
  const visit = (current: string) => {
    const node = byId.get(current);
    if (!node) {
      out.add(current);
      return;
    }
    visit(node.a);
    visit(node.b);
  };
  visit(id);
  return out;
}

/**
 * Nút cắt SÂU nhất tách `a` với `b` về hai phía — vách giữa hai phòng là nhát cắt ấy. Đi từ gốc xuống:
 * nút nào còn chứa cả hai thì đi tiếp vào nhánh chứa cả hai; tới nút tách hai bên thì đó là nút cần tìm.
 */
function dividingNode(
  tree: AiPlanTree,
  a: string,
  b: string,
): { node: AiPlanTree['nodes'][number] } | null {
  const children = new Set(tree.nodes.flatMap((node) => [node.a, node.b]));
  let current = tree.nodes.find((node) => !children.has(node.id));
  while (current) {
    const low = subtreeLeaves(tree, current.a);
    const high = subtreeLeaves(tree, current.b);
    if ((low.has(a) && high.has(b)) || (low.has(b) && high.has(a))) return { node: current };
    const next =
      low.has(a) && low.has(b) ? current.a : high.has(a) && high.has(b) ? current.b : null;
    current = next ? tree.nodes.find((node) => node.id === next) : undefined;
  }
  return null;
}

/**
 * Vi phạm luật bắt buộc (T71) ĐÃ CÓ trong phương án đang lưu — tuyến sửa hạ chúng xuống ghi chú.
 *
 * Cùng lẽ `LEGACY_RELAXED`: một phương án đúc trước khi luật ra đời không được biến thành không sửa
 * nổi, vì kỹ sư đang yêu cầu một chỗ khác. Khác `LEGACY_RELAXED` ở chỗ chỉ tha ĐÚNG những vi phạm có
 * sẵn (mã + phòng): một thao tác sửa không được tạo ra vi phạm mới.
 */
function preExistingViolations(
  base: AiFloorPlan,
  context: PlanContext,
  program: AiSpaceProgram,
): ReadonlySet<string> {
  const rules = mandatoryFor(context.mandatory, program);
  if (!rules) return new Set();
  return new Set(mandatoryViolations(base.levels, rules).map(mandatoryKey));
}
