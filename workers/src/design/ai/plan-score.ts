/**
 * Chấm điểm chất lượng mặt bằng — tầng ② của T29, và nó KHÔNG phải cổng.
 *
 * Cổng dữ liệu (`plan-check.ts`) hỏi «dữ liệu có tự mâu thuẫn không» và trả đạt/không đạt. Bộ này
 * hỏi «bố cục này tốt đến đâu trong những gì hình học đo được» và trả một con số. Trộn hai thứ vào
 * một số thì không ai biết 62 điểm nghĩa là sai dữ liệu hay bố cục chưa hay (T24), nên điểm chỉ
 * chấm trên bản ĐÃ QUA cổng.
 *
 * ── Bốn điều phải đọc trước khi tin con số ────────────────────────────────────────────
 *
 * 1. **Điểm không phải điểm cho thiết kế.** Một mặt bằng hay vẫn có thể 70, một mặt bằng vô hồn
 *    vẫn có thể 90. Nó xếp hạng ứng viên và chỉ chỗ yếu; theo T35 nó KHÔNG gác cổng xuất DXF theo
 *    cả hai chiều — điểm cao không tự mở, điểm thấp không chặn.
 * 2. **«Chưa đủ dữ liệu» không phải 0.** Tiêu chí thiếu đầu vào trả `null`, và trọng số của nó
 *    KHÔNG được chia lại cho phần còn lại. Vì vậy kết quả mang cả `points` lẫn `scoredWeight`:
 *    đọc là «72 trên 85 phần trọng số chấm được», không phải «72/100».
 * 3. **n nhỏ.** Bộ đo có n tối đa 6 và n theo dự án tối đa 2, nên mọi ngưỡng `[ĐO]` là CHỈ DẤU.
 *    Từng tiêu chí mang `n` và nhãn ra tới màn hình (T31), không gói lại trong tài liệu.
 * 4. **Tiêu chí cổng đã bảo đảm thì không tính điểm.** A2 («phòng đúng tầng») là lỗi CHẶN ở cổng,
 *    nên mọi bản tới được đây đều đạt; cho nó 1/4 của 25 điểm là tặng 6,25 điểm không đo gì cả.
 *
 * Mọi trọng số, công thức và ngưỡng ở `kb/plan_quality.yaml`. Ngưỡng theo MÃ PHÒNG ở `rules/`, đọc
 * qua `RulePack` — không chép số sang đây và không chép sang tệp thước chấm.
 */

import type { AiFloorPlan, AiFloorPlanLevel, AiSpaceProgram } from '@nvg/shared/design';
import type { PassageRules } from '../kb/vocabulary';
import type { RulePack } from '../rules/rule-pack';
import { routesFrom } from './circulation';
import {
  rectCentre,
  rectsOverlap as overlaps,
  rectsShareEdge as sharesEdge,
  toRect,
  type Rect,
} from './draw/geometry';
import {
  criterionFor,
  type CriterionSpec,
  type PlanQuality,
  type ScoreScale,
} from './plan-quality';
import { planGraph, reachableFrom, roomsBetween, type PlanGraph } from './plan-check';
import { roomsWithDaylight } from './rule-warnings';
import { BALCONY_PROJECTING_OPEN_SIDES, balconyFaces } from './mandatory';

/** Điểm của một tiêu chí. `value === null` nghĩa là chưa đủ dữ liệu để chấm. */
export interface CriterionScore {
  code: string;
  group: string;
  vi: string;
  /** Giá trị đo được, theo đúng đơn vị tiêu chí khai. `null` = không chấm. */
  value: number | null;
  /** 0…1. `null` khi `value` là `null`. */
  score: number | null;
  /**
   * Phần trọng số tiêu chí này chiếm trong 100 điểm — DANH NGHĨA, không phải phần đã chấm được.
   *
   * Tiêu chí thiếu dữ liệu vẫn mang trọng số của nó; nó chỉ không cộng vào `points` và không cộng
   * vào `scoredWeight`. Nhờ vậy màn hình nói được «6 điểm chưa chấm được vì không có hộp kỹ thuật»
   * thay vì âm thầm chia 6 điểm ấy cho tiêu chí khác. Riêng tiêu chí cổng đã bảo đảm thì mang 0 —
   * nó không phải tiêu chí chấm điểm.
   */
  weight: number;
  n: number;
  label: string;
  /** Vì sao không chấm được — câu tiếng Việt, hiện thay cho con số (CLAUDE.md 5.2). */
  khongCham?: string;
  /**
   * Hai lý do không chấm KHÁC NHAU, và màn hình phải phân biệt được:
   *   `gate` — cổng dữ liệu đã bảo đảm, nên đây không phải tiêu chí chấm điểm;
   *   `thieu_du_lieu` — phương án này không có đầu vào cho nó.
   */
  khongChamVi?: 'gate' | 'thieu_du_lieu';
  /** Phần tử bị trừ điểm: mã phòng, mã tầng. Dùng cho màn hình VÀ cho ghi chú lượt sau (T25). */
  refs: string[];
}

export interface GroupScore {
  code: string;
  vi: string;
  /** Trọng số khai trong thước — KHÔNG phải phần đã chấm được. */
  weight: number;
  /** Trọng số thật sự chấm được của nhóm này. */
  scoredWeight: number;
  /** Điểm tuyệt đối của nhóm, tối đa là `scoredWeight`. */
  points: number;
}

export interface PlanScore {
  /** Phiên bản THƯỚC, không phải phiên bản mặt bằng (T27). */
  scoreVersion: number;
  /** Điểm tuyệt đối, tối đa 100 khi chấm được hết. */
  points: number;
  /** Tổng trọng số đã chấm được. Đọc điểm PHẢI kèm số này. */
  scoredWeight: number;
  groups: GroupScore[];
  criteria: CriterionScore[];
  /**
   * Phần điểm dựa trên ngưỡng CHƯA AI ĐO (`n = 0`) — T31 buộc nói ra.
   *
   * Không phải lời rào: A1 có `n = 0` và chiếm một phần của nhóm nặng thứ hai, nên một người đọc
   * con số tổng mà không biết điều đó sẽ tin nó chắc hơn thực tế.
   */
  suyLuanWeight: number;
}

export interface PlanScoreInput {
  plan: AiFloorPlan;
  program: AiSpaceProgram;
  /**
   * Loại hình công trình từ ĐẦU BÀI — `nha_pho` / `biet_thu` / `nha_vuon`.
   *
   * Đi qua đầu vào chứ không suy từ mặt bằng: ngưỡng của C2 và D1 khác nhau theo loại hình, và
   * đoán loại hình từ hình dạng mặt bằng là thêm một chỗ sai trong khi đầu bài đã khai rõ.
   */
  buildingType: string;
  quality: PlanQuality;
  /**
   * Gói quy tắc để tra ngưỡng theo mã phòng (B1, B2).
   *
   * LUÔN là gói kinh nghiệm + đo được, KHÔNG phụ thuộc ô tích của kỹ sư: hình dáng phòng không
   * phải thứ bật tắt bằng ô tích. Ô tích chỉ quyết định có tiêm vào lời dẫn và có hiện thành cảnh
   * báo hay không — xem phần đầu `kb/plan_quality.yaml`.
   */
  rules: RulePack;
  /** Mã nhóm → danh sách mã phòng, từ `kb/room_vocabulary.yaml`. */
  groups: Record<string, string[]>;
  /**
   * Luật đi lại (`kb/room_vocabulary.yaml` mục `passage`) — C6, C7 đo đường đi hằng ngày theo nó.
   * Vắng thì hai tiêu chí ấy «chưa đủ dữ liệu», không đoán danh sách loại phòng trong mã.
   */
  passage?: PassageRules | null;
  /** Định mức diện tích nghề theo loại phòng (`kb/space_norms.yaml`) — A5, A6. Vắng thì không chấm. */
  areaNorms?: ReadonlyMap<string, { min: number; target: number; max: number }> | null;
  /**
   * Luật «ban công quay ra mặt thoáng» (`rules/nvg-mandatory.yaml`, T71/T91) — D3 đo bằng đúng dung sai
   * và tỉ lệ ấy. Vắng thì D3 «chưa đủ dữ liệu».
   */
  balconyFace?: { edgeToleranceCm: number; longRatio: number } | null;
}

export function scorePlan(input: PlanScoreInput): PlanScore {
  const measured = measureAll(input);
  const byGroup = new Map<string, CriterionScore[]>();

  for (const spec of input.quality.criteria) {
    const list = byGroup.get(spec.group) ?? [];
    list.push(measured.get(spec.code)!);
    byGroup.set(spec.group, list);
  }

  const criteria: CriterionScore[] = [];
  const groups: GroupScore[] = [];
  for (const [code, group] of Object.entries(input.quality.groups)) {
    const list = byGroup.get(code) ?? [];

    // Mẫu số là số tiêu chí của nhóm TRỪ những tiêu chí cổng đã bảo đảm — tức một con số CỐ ĐỊNH
    // của cái thước, không phụ thuộc phương án đang chấm.
    //
    // Đây là chỗ dễ làm sai, và bản đầu tôi đã làm sai: nếu mẫu số chỉ đếm tiêu chí chấm được cho
    // RIÊNG phương án này thì trọng số của tiêu chí thiếu dữ liệu được chia lại cho các tiêu chí
    // còn lại trong nhóm. Hệ quả: `scoredWeight` luôn bằng 100 nên không nói được gì, và một phương
    // án không có hộp kỹ thuật làm E2 một mình gánh cả 10 điểm của nhóm E. Phương án cấm đúng điều
    // đó (5.5 điểm 2): «KHÔNG âm thầm chia lại trọng số», và điểm tổng phải nói rõ nó tính trên mấy
    // phần trăm trọng số.
    const inScope = list.filter((entry) => entry.khongChamVi !== 'gate');
    // Trọng số TƯƠNG ĐỐI trong nhóm (T96, `weight` của từng tiêu chí, vắng = 1): mẫu số vẫn là con số
    // CỐ ĐỊNH của cái thước — tổng trọng số tương đối của các tiêu chí trong phạm vi chấm.
    const relative = new Map(input.quality.criteria.map((spec) => [spec.code, spec.weight]));
    const total = inScope.reduce((sum, entry) => sum + (relative.get(entry.code) ?? 1), 0);

    let points = 0;
    let scoredWeight = 0;
    for (const entry of list) {
      if (entry.khongChamVi === 'gate') {
        entry.weight = 0;
      } else {
        const each = total > 0 ? (group.weight * (relative.get(entry.code) ?? 1)) / total : 0;
        entry.weight = each;
        if (entry.score !== null) {
          points += entry.score * each;
          scoredWeight += each;
        }
      }
      criteria.push(entry);
    }
    groups.push({ code, vi: group.vi, weight: group.weight, scoredWeight, points });
  }

  return {
    scoreVersion: input.quality.scoreVersion,
    points: round2(groups.reduce((sum, group) => sum + group.points, 0)),
    scoredWeight: round2(groups.reduce((sum, group) => sum + group.scoredWeight, 0)),
    groups: groups.map((group) => ({
      ...group,
      points: round2(group.points),
      scoredWeight: round2(group.scoredWeight),
    })),
    criteria,
    suyLuanWeight: round2(
      criteria
        .filter((entry) => entry.n === 0 && entry.score !== null)
        .reduce((sum, entry) => sum + entry.weight, 0),
    ),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nhóm chấm được mà dưới sàn `floorPercent` (T96, `accept_group_floor_percent`). Rỗng khi không có sàn
 * hoặc mọi nhóm đạt. Nhóm chưa chấm được gì (`scoredWeight` = 0) không xét — «chưa đủ dữ liệu» không
 * phải 0.
 */
export function groupsBelowFloor(
  score: { groups?: readonly { code: string; points: number; scoredWeight: number }[] },
  floorPercent: number | null,
): string[] {
  if (floorPercent === null || !score.groups) return [];
  return score.groups
    .filter(
      (group) => group.scoredWeight > 0 && (group.points / group.scoredWeight) * 100 < floorPercent,
    )
    .map((group) => group.code);
}

/** Kết quả thô của một phép đo: giá trị, phần tử bị trừ, hoặc lý do không đo được. */
interface Measure {
  value: number | null;
  refs?: string[];
  khongCham?: string;
  vi?: 'gate' | 'thieu_du_lieu';
}

function measureAll(input: PlanScoreInput): Map<string, CriterionScore> {
  const ctx = context(input);
  const out = new Map<string, CriterionScore>();

  for (const base of input.quality.criteria) {
    const spec = criterionFor(base, ctx.buildingType);
    const measure: Measure = spec.enforcedByGate
      ? {
          value: null,
          khongCham: `Cổng dữ liệu đã bảo đảm (lỗi chặn "${spec.enforcedByGate}"), nên tiêu chí này không tính vào điểm.`,
          vi: 'gate',
        }
      : (MEASURES[spec.code]?.(ctx, spec) ?? {
          value: null,
          khongCham: 'Chưa có phép đo cho tiêu chí này.',
        });

    const score = measure.value === null ? null : scoreOf(spec, measure.value);
    const fullMarks = score !== null && score >= 1;

    out.set(spec.code, {
      code: spec.code,
      group: spec.group,
      vi: spec.vi,
      value: measure.value,
      score,
      weight: 0,
      n: spec.n,
      label: spec.label,
      ...(measure.khongCham ? { khongCham: measure.khongCham } : {}),
      ...(measure.value === null ? { khongChamVi: measure.vi ?? ('thieu_du_lieu' as const) } : {}),
      // `refs` nghĩa là PHẦN TỬ BỊ TRỪ ĐIỂM, không phải phần tử đã đo. Vài phép đo trả về phần tử
      // quyết định giá trị (thang lệch nhất ở B4, hành lang hẹp nhất ở C4) dù giá trị ấy đạt; giữ
      // nguyên thì màn hình in «Chỗ bị trừ: st1, st2» cạnh một dòng đủ điểm, và ghi chú «tránh
      // những chỗ này» của lượt lấy mẫu sau (T25) bảo mô hình tránh đúng những chỗ đang làm đúng.
      // Chốt ở một nơi thay vì sửa từng phép đo: bất biến này đúng cho mọi tiêu chí, kể cả tiêu
      // chí thêm sau.
      refs: fullMarks ? [] : (measure.refs ?? []),
    });
  }
  return out;
}

/** Giá trị đo được → 0…1 theo kiểu thang điểm của tiêu chí. */
export function scoreOf(spec: ScoreScale, value: number): number {
  switch (spec.kind) {
    case 'boolean':
      return value >= 1 ? 1 : 0;
    case 'band': {
      if (value >= spec.low! && value <= spec.high!) return 1;
      if (value < spec.hardLow! || value > spec.hardHigh!) return 0;
      // NỬA điểm, cố ý không nội suy: khoảng đạt của C2 rộng 0,18 trong khi sai số do chỗ cắt ranh
      // giới mặt bằng mở là ±0,10. Một đường nội suy trên phép đo như thế là vờ như đo tinh hơn
      // thực tế.
      return 0.5;
    }
    case 'higher_better': {
      if (value >= spec.pass!) return 1;
      if (value <= spec.zero!) return 0;
      return (value - spec.zero!) / (spec.pass! - spec.zero!);
    }
    case 'lower_better':
    case 'count': {
      if (value <= spec.pass!) return 1;
      if (value >= spec.zero!) return 0;
      return 1 - (value - spec.pass!) / (spec.zero! - spec.pass!);
    }
  }
}

// ---------------------------------------------------------------------------
// Bối cảnh: mọi thứ các phép đo cùng cần, tính MỘT lần
// ---------------------------------------------------------------------------

interface RoomRef {
  id: string;
  type: string;
  level: number;
  rect: Rect;
  areaM2: number;
  /** Mã phòng khác mà chữ nhật này cũng phục vụ (`also`). */
  also: string[];
  label: string | null;
}

interface ScoreContext {
  plan: AiFloorPlan;
  buildingType: string;
  rules: RulePack;
  groups: Record<string, string[]>;
  rooms: RoomRef[];
  byLevel: Map<number, RoomRef[]>;
  levels: AiFloorPlanLevel[];
  graph: PlanGraph;
  /** Diện tích yêu cầu theo mã phòng của chương trình không gian. */
  wanted: Map<string, number>;
  /** Loại của từng mã phòng theo chương trình — cần để đọc `also` (xem A3). */
  wantedType: Map<string, string>;
  /** Phòng khép kín trong phòng nào — đi xuyên phòng cha là HỢP LỆ (C1). */
  ensuiteOf: Map<string, string>;
  inGroup: (group: string, type: string) => boolean;
  passage: PassageRules | null;
  areaNorms: ReadonlyMap<string, { min: number; target: number; max: number }> | null;
  balconyFace: { edgeToleranceCm: number; longRatio: number } | null;
}

function context(input: PlanScoreInput): ScoreContext {
  const rooms: RoomRef[] = [];
  for (const level of input.plan.levels) {
    for (const room of level.rooms) {
      rooms.push({
        id: room.id,
        type: room.type,
        level: level.level,
        rect: toRect(room.rect),
        areaM2: room.area_m2,
        also: [...(room.also ?? [])],
        label: room.label ?? null,
      });
    }
  }
  const byLevel = new Map<number, RoomRef[]>();
  for (const room of rooms) {
    const list = byLevel.get(room.level) ?? [];
    list.push(room);
    byLevel.set(room.level, list);
  }

  const groupSets = new Map<string, Set<string>>();
  for (const [name, members] of Object.entries(input.groups)) {
    groupSets.set(name, new Set(members));
  }

  return {
    plan: input.plan,
    buildingType: input.buildingType,
    rules: input.rules,
    groups: input.groups,
    rooms,
    byLevel,
    levels: [...input.plan.levels].sort((a, b) => a.level - b.level),
    graph: planGraph(input.plan),
    wanted: new Map(input.program.spaces.map((space) => [space.id, space.target_area_m2])),
    wantedType: new Map(input.program.spaces.map((space) => [space.id, space.type])),
    ensuiteOf: new Map(
      input.program.spaces
        .filter((space) => space.ensuite_of)
        .map((space) => [space.id, String(space.ensuite_of)]),
    ),
    inGroup: (group, type) => groupSets.get(group)?.has(type) ?? false,
    passage: input.passage ?? null,
    areaNorms: input.areaNorms ?? null,
    balconyFace: input.balconyFace ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mười chín phép đo (A2 do cổng bảo đảm nên không có phép đo)
// ---------------------------------------------------------------------------

type MeasureFn = (ctx: ScoreContext, spec: CriterionSpec) => Measure;

/**
 * Đường đi hằng ngày xa nhất: từ chỗ sinh hoạt chung tới một WC CHUNG, không đi xuyên gara hay sảnh
 * ngoài (T48). Trả phòng xa nhất kèm số cửa và số mét, hoặc lý do không chấm được.
 *
 * WC khép kín không tính: nó là phòng riêng của phòng ngủ, đi qua phòng mẹ là đúng.
 */
function everydayWalk(
  ctx: ScoreContext,
): { worst: { room: string; doors: number; metres: number } } | { value: null; khongCham: string } {
  const passage = ctx.passage;
  if (!passage) return { value: null, khongCham: 'Chưa nạp luật đi lại của từ vựng phòng.' };
  const forbidden = new Set(
    ctx.rooms.filter((room) => passage.notARoute.has(room.type)).map((room) => room.id),
  );
  let worst: { room: string; doors: number; metres: number } | null = null;
  let measured = false;

  // Đo TỪNG TẦNG. Đo cả nhà một lượt thì WC tầng 2 luôn cách phòng khách tầng 1 hơn 20 m vì phải leo
  // thang — con số ấy nói về chiều cao nhà, không nói về bố cục (lượt đo fd3b0b86, 16/09/2026).
  for (const level of ctx.levels) {
    const here = ctx.byLevel.get(level.level) ?? [];
    // Chỗ xuất phát của tầng: nơi cả nhà ngồi; tầng chỉ có phòng ngủ thì lấy chỗ vừa lên thang.
    const shared = here.filter((room) => passage.everydayFrom.has(room.type));
    const starts = (shared.length ? shared : here.filter((room) => passage.through.has(room.type)))
      .filter((room) => !forbidden.has(room.id))
      .map((room) => room.id);
    const targets = here.filter(
      (room) => room.type === 'wc' && !ctx.ensuiteOf.has(room.id) && room.also.length === 0,
    );
    if (starts.length === 0 || targets.length === 0) continue;
    measured = true;
    const routes = routesFrom(ctx.graph, starts, { forbidden });
    for (const target of targets) {
      const route = routes.get(target.id);
      // Không có đường nào tránh khu phục vụ: đó là lỗi CHẶN `route_through_service` của cổng, nên ở
      // đây tính là xa nhất có thể — một phương án như vậy không được trông như đạt.
      const doors = route ? route.doors : 9;
      const metres = route ? route.metres : 99;
      if (!worst || metres > worst.metres) worst = { room: target.id, doors, metres };
    }
  }
  if (!measured || !worst) {
    return {
      value: null,
      khongCham: 'Không tầng nào có cả chỗ sinh hoạt chung lẫn WC chung để đo.',
    };
  }
  return worst.doors >= 9 || worst.metres >= 99
    ? {
        worst: {
          room: worst.room,
          doors: Math.min(worst.doors, 9),
          metres: Math.min(worst.metres, 99),
        },
      }
    : { worst };
}

/** Đếm phòng nằm ngoài định mức nghề theo một phía (T48). */
function outsideNorm(ctx: ScoreContext, side: 'min' | 'max'): Measure {
  const norms = ctx.areaNorms;
  if (!norms) return { value: null, khongCham: 'Chưa nạp định mức diện tích của nghề.' };
  const refs: string[] = [];
  for (const room of ctx.rooms) {
    // Phòng ghép mang nhiều chức năng: so với tổng mức của mọi loại nó phục vụ.
    const types = [room.type, ...room.also.map((id) => ctx.wantedType.get(id) ?? '')];
    const bounds = types
      .map((type) => norms.get(type))
      .filter((norm): norm is { min: number; target: number; max: number } => norm !== undefined);
    if (bounds.length === 0) continue;
    const limit = bounds.reduce((sum, norm) => sum + norm[side], 0);
    const below = side === 'min' && room.areaM2 + 0.05 < limit;
    const above = side === 'max' && room.areaM2 > limit + 0.05;
    if (below || above) refs.push(room.id);
  }
  return { value: refs.length, refs };
}

const MEASURES: Record<string, MeasureFn> = {
  A1: (ctx) => {
    let weighted = 0;
    let area = 0;
    const refs: string[] = [];
    for (const room of ctx.rooms) {
      // Phòng ghép so với TỔNG diện tích yêu cầu của mọi mã nó phục vụ: một chữ nhật «bếp ăn» phải
      // đủ cho cả bếp lẫn phòng ăn, nên so với riêng bếp là kết luận nó rộng gấp đôi yêu cầu.
      const required = [room.id, ...room.also].reduce(
        (sum, id) => sum + (ctx.wanted.get(id) ?? 0),
        0,
      );
      if (required <= 0) continue;
      const gap = Math.abs(room.areaM2 - required) / required;
      weighted += gap * room.areaM2;
      area += room.areaM2;
      if (gap > 0.1) refs.push(room.id);
    }
    if (area <= 0) {
      return {
        value: null,
        khongCham: 'Chương trình không gian không khai diện tích yêu cầu cho phòng nào.',
      };
    }
    return { value: weighted / area, refs };
  },

  A3: (ctx) => {
    // Bàn thờ KHÔNG nhất thiết là một phòng riêng. Đo trên hồ sơ thật: P2 tầng 5 có «PHÒNG KHÁCH +
    // THỜ», tức bàn thờ nằm TRONG phòng khách — và đó là cách làm phổ biến ở nhà phố, không phải
    // ngoại lệ. Nên phép đo này tìm cả phòng mang mã thờ trong `also` (T23), chứ không chỉ phòng có
    // `type === 'altar_room'`. Bỏ vế ấy thì A3 trả «chưa đủ dữ liệu» trên đúng loại hồ sơ nó được
    // dựng ra để chấm.
    const altars = ctx.rooms.filter(
      (room) =>
        room.type === 'altar_room' ||
        room.also.some((id) => ctx.wantedType.get(id) === 'altar_room'),
    );
    if (altars.length === 0) {
      return { value: null, khongCham: 'Phương án không có phòng thờ hay chỗ thờ nào.' };
    }
    // «Tầng cao nhất CÓ NGƯỜI Ở», không phải tầng cao nhất: tầng mái hay tầng kỹ thuật không tính.
    const habitableLevels = ctx.rooms
      .filter((room) => ctx.inGroup('habitable', room.type))
      .map((room) => room.level);
    if (habitableLevels.length === 0) {
      return { value: null, khongCham: 'Không tầng nào có không gian ở để so «tầng cao nhất».' };
    }
    const top = Math.max(...habitableLevels);
    const refs: string[] = [];
    let ok = true;
    for (const altar of altars) {
      if (altar.level !== top) {
        ok = false;
        refs.push(altar.id);
        continue;
      }
      const above = (ctx.byLevel.get(altar.level + 1) ?? []).filter(
        (room) => room.type === 'wc' && overlaps(room.rect, altar.rect),
      );
      const beside = (ctx.byLevel.get(altar.level) ?? []).filter(
        (room) => room.type === 'wc' && sharesEdge(room.rect, altar.rect),
      );
      if (above.length || beside.length) {
        ok = false;
        refs.push(altar.id, ...above.map((room) => room.id), ...beside.map((room) => room.id));
      }
    }
    return { value: ok ? 1 : 0, refs: [...new Set(refs)] };
  },

  A4: (ctx) => {
    const levels = [...ctx.byLevel.entries()].filter(([, rooms]) =>
      rooms.some((room) => ctx.inGroup('sleeping', room.type)),
    );
    if (levels.length === 0) {
      return { value: null, khongCham: 'Không tầng nào có phòng ngủ.' };
    }
    const refs: string[] = [];
    let withWc = 0;
    for (const [level, rooms] of levels) {
      if (rooms.some((room) => room.type === 'wc')) withWc += 1;
      else refs.push(`Tầng ${level}`);
    }
    return { value: withWc / levels.length, refs };
  },

  B1: (ctx) => {
    const refs: string[] = [];
    for (const room of ctx.rooms) {
      const limit = ctx.rules.minDimension(ctx.buildingType, room.type);
      if (limit === null) continue;
      const shortest = Math.min(width(room.rect), height(room.rect)) / 100;
      // Dung sai 5 cm: hợp đồng khai cm nguyên, và một phòng hụt 1 cm so ngưỡng không phải chỗ
      // đáng trừ điểm — cùng mức dung sai `rule-warnings.ts` dùng khi sinh cảnh báo.
      if (shortest + 0.05 < limit) refs.push(room.id);
    }
    return { value: refs.length, refs };
  },

  B2: (ctx) => {
    const refs: string[] = [];
    for (const room of ctx.rooms) {
      const limit = ctx.rules.aspectRatioMax(ctx.buildingType, room.type);
      if (limit === null) continue;
      const short = Math.min(width(room.rect), height(room.rect));
      if (short <= 0) continue;
      const ratio = Math.max(width(room.rect), height(room.rect)) / short;
      if (ratio > limit + 0.05) refs.push(room.id);
    }
    return { value: refs.length, refs };
  },

  B4: (ctx) => {
    const risers: number[] = [];
    const refs: string[] = [];
    for (const level of ctx.levels) {
      for (const stair of level.stairs ?? []) {
        if (!stair.treads || stair.treads <= 0) continue;
        risers.push(level.h / 100 / stair.treads);
        refs.push(stair.id);
      }
    }
    if (risers.length === 0) {
      return {
        value: null,
        khongCham: 'Ô thang không khai số bậc, nên không tính được chiều cao bậc.',
      };
    }
    // Lấy bậc LỆCH NHẤT khỏi khoảng đạt, không lấy bình quân: một thang dốc không được một thang
    // thoải bù lại — người đi vẫn phải bước lên chính cái thang dốc ấy.
    return { value: worst(risers), refs };
  },

  C1: (ctx) => {
    const bedrooms = ctx.rooms.filter((room) => ctx.inGroup('sleeping', room.type));
    if (bedrooms.length === 0) {
      return { value: null, khongCham: 'Phương án không có phòng ngủ.' };
    }
    const refs: string[] = [];
    for (const room of ctx.rooms) {
      if (ctx.inGroup('outdoor', room.type)) continue;
      // Khu vệ sinh khép kín đi xuyên phòng cha là HỢP LỆ — chương trình không gian đã nói vậy.
      const parent = ctx.ensuiteOf.get(room.id);
      const forbidden = new Set(
        bedrooms.map((bedroom) => bedroom.id).filter((id) => id !== room.id && id !== parent),
      );
      if (forbidden.size === 0) continue;
      if (!reachableFrom(ctx.graph, ctx.graph.entries, forbidden).has(room.id)) refs.push(room.id);
    }
    return { value: refs.length, refs };
  },

  C2: (ctx) => {
    let circulation = 0;
    let floor = 0;
    for (const room of ctx.rooms) {
      // Mẫu số là SÀN LỌT LÒNG, nên phòng ngoài trời (ban công, sảnh ngoài nhà) không vào cả tử số
      // lẫn mẫu số. Đây đúng là lý do mã `porch` phải tồn tại riêng (T32): xếp sảnh ngoài nhà vào
      // `circulation` thì nó vào tử số mà không vào mẫu số, và tỷ lệ phồng lên.
      if (ctx.inGroup('outdoor', room.type)) continue;
      floor += room.areaM2;
      if (ctx.inGroup('circulation', room.type)) circulation += room.areaM2;
    }
    if (floor <= 0) return { value: null, khongCham: 'Không đo được diện tích sàn lọt lòng.' };
    return { value: circulation / floor };
  },

  C3: (ctx) => {
    const ground = ctx.levels[0];
    if (!ground) return { value: null, khongCham: 'Phương án không có tầng nào.' };
    const stairRooms = new Set(
      (ground.stairs ?? []).flatMap((stair) =>
        (ctx.byLevel.get(ground.level) ?? [])
          .filter((room) => overlaps(room.rect, toRect(stair.rect)))
          .map((room) => room.id),
      ),
    );
    if (stairRooms.size === 0) {
      return { value: null, khongCham: `Tầng ${ground.level} không có ô thang để đo đường tới.` };
    }
    if (ctx.graph.entries.length === 0) {
      return { value: null, khongCham: 'Không có cửa nào mở ra ngoài nhà để đo đường từ đó.' };
    }
    const hops = roomsBetween(ctx.graph, ctx.graph.entries, stairRooms);
    if (hops === null) {
      return { value: null, khongCham: 'Không có đường nào từ lối vào tới chân thang.' };
    }
    return { value: hops, refs: [...stairRooms] };
  },

  C4: (ctx) => {
    const halls = ctx.rooms.filter((room) => room.type === 'circulation');
    if (halls.length === 0) {
      return { value: null, khongCham: 'Phương án không có hành lang hay sảnh tầng riêng.' };
    }
    let narrowest = Infinity;
    let ref = '';
    for (const hall of halls) {
      const short = Math.min(width(hall.rect), height(hall.rect)) / 100;
      if (short < narrowest) {
        narrowest = short;
        ref = hall.id;
      }
    }
    return { value: narrowest, refs: [ref] };
  },

  /** Số cửa từ chỗ sinh hoạt chung tới WC chung xa nhất (T48). */
  C6: (ctx) => {
    const walk = everydayWalk(ctx);
    if ('khongCham' in walk) return walk;
    return { value: walk.worst.doors, refs: [walk.worst.room] };
  },

  /** Quãng đường mét từ chỗ sinh hoạt chung tới WC chung xa nhất (T48). */
  C7: (ctx) => {
    const walk = everydayWalk(ctx);
    if ('khongCham' in walk) return walk;
    return { value: Math.round(walk.worst.metres * 10) / 10, refs: [walk.worst.room] };
  },

  /**
   * Chiều dài hành lang trên mỗi phòng nó phục vụ (T48).
   *
   * Hành lang 16,6 m mở cửa vào ba phòng là một đường đi tốn sàn — đó là tầng 1 của lượt 58d9ff66.
   * Đo bằng CẠNH DÀI của từng ô hành lang chia cho số phòng có cửa mở vào nó.
   */
  C8: (ctx) => {
    const corridors = ctx.rooms.filter((room) => ctx.inGroup('circulation', room.type));
    if (corridors.length === 0) {
      return { value: null, khongCham: 'Phương án không có phòng giao thông nào.' };
    }
    let worst: { value: number; room: string } | null = null;
    for (const corridor of corridors) {
      const served = new Set<string>();
      for (const door of ctx.graph.doors) {
        if (!door.rooms.includes(corridor.id)) continue;
        for (const other of door.rooms) if (other !== corridor.id) served.add(other);
      }
      if (served.size === 0) continue;
      const long =
        Math.max(corridor.rect.x1 - corridor.rect.x0, corridor.rect.y1 - corridor.rect.y0) / 100;
      const value = long / served.size;
      if (!worst || value > worst.value) worst = { value, room: corridor.id };
    }
    if (!worst) return { value: null, khongCham: 'Không hành lang nào có cửa mở vào phòng khác.' };
    return { value: Math.round(worst.value * 10) / 10, refs: [worst.room] };
  },

  /** Số phòng nhỏ hơn mức tối thiểu của nghề (T48) — chỉ trừ điểm, Haan chốt 16/09/2026. */
  A5: (ctx) => outsideNorm(ctx, 'min'),

  /** Số phòng lớn hơn mức tối đa của nghề (T48). */
  A6: (ctx) => outsideNorm(ctx, 'max'),

  C5: (ctx) => {
    const shops = ctx.rooms.filter((room) => room.type === 'shop');
    if (shops.length === 0) {
      return { value: null, khongCham: 'Phương án không có mặt bằng bán hàng.' };
    }
    const ground = ctx.levels[0];
    const stairRooms = new Set(
      (ground?.stairs ?? []).flatMap((stair) =>
        (ctx.byLevel.get(ground!.level) ?? [])
          .filter((room) => overlaps(room.rect, toRect(stair.rect)))
          .map((room) => room.id),
      ),
    );
    if (stairRooms.size === 0) {
      return { value: null, khongCham: 'Tầng trệt không có ô thang để đo lối vào riêng.' };
    }
    const withoutShops = reachableFrom(
      ctx.graph,
      ctx.graph.entries,
      new Set(shops.map((shop) => shop.id)),
    );
    const ok = [...stairRooms].some((id) => withoutShops.has(id));
    return { value: ok ? 1 : 0, refs: ok ? [] : shops.map((shop) => shop.id) };
  },

  D1: (ctx, spec) => {
    const wanted =
      spec.rooms === 'living_and_master'
        ? ctx.rooms.filter((room) => room.type === 'living' || room.type === 'master_bedroom')
        : ctx.rooms.filter((room) => ctx.inGroup('habitable', room.type));
    if (wanted.length === 0) {
      return { value: null, khongCham: 'Không có phòng ở nào để đo mặt thoáng.' };
    }
    const lit = new Set<string>();
    for (const level of ctx.levels) for (const id of roomsWithDaylight(level)) lit.add(id);
    const dark = wanted.filter((room) => !lit.has(room.id));
    return { value: (wanted.length - dark.length) / wanted.length, refs: dark.map((r) => r.id) };
  },

  // T91 (Haan 27/09/2026): ban công nằm trong sàn, gần vuông, không quay cạnh dài ra mặt thoáng — không
  // chặn, nhưng trừ điểm. Ban công đua ra (ba cạnh thoáng) và ban công có cạnh dài thoáng tính là đạt.
  D3: (ctx) => {
    if (!ctx.balconyFace) return { value: null, khongCham: 'Chưa có luật mặt thoáng ban công.' };
    const all = ctx.levels.flatMap((level) =>
      balconyFaces(level, ctx.balconyFace!.edgeToleranceCm),
    );
    if (all.length === 0) return { value: null, khongCham: 'Không có ban công nào.' };
    const off = all.filter((b) => b.openSides < BALCONY_PROJECTING_OPEN_SIDES && !b.longOpen);
    return { value: (all.length - off.length) / all.length, refs: off.map((b) => b.id) };
  },

  /**
   * Cửa chính đón vào đâu (T96 — Haan chấm lượt 5fda70dc: «vào phòng khách từ cửa chính đi qua bếp và
   * phòng ăn, rất không hợp lý»). Đếm số phòng KHÔNG PHẢI lối đi phải xuyên qua từ một cửa ra ngoài tới
   * phòng khách gần nhất: sảnh, hành lang, chỗ để xe (`entry_through` — nhà phố vào qua gara là thường)
   * không tính. Không tới được phòng khách thì tính như xa nhất có thể.
   */
  C9: (ctx) => {
    const living = ctx.rooms.filter((room) => room.type === 'living');
    if (living.length === 0) return { value: null, khongCham: 'Phương án không có phòng khách.' };
    if (ctx.graph.entries.length === 0) {
      return { value: null, khongCham: 'Không có cửa nào mở ra ngoài nhà để đo đường từ đó.' };
    }
    if (!ctx.passage) return { value: null, khongCham: 'Chưa nạp luật đi lại của từ vựng phòng.' };
    const free = (id: string) => {
      const type = ctx.graph.rooms.get(id)?.type ?? '';
      return (
        type === 'living' || ctx.inGroup('circulation', type) || ctx.passage!.entryThrough.has(type)
      );
    };
    const walk = cheapestWalk(ctx.graph, ctx.graph.entries, new Set(living.map((r) => r.id)), free);
    if (!walk) return { value: 9, refs: living.map((room) => room.id) };
    return { value: walk.cost, refs: walk.crossed };
  },

  /**
   * Hành lang phải phục vụ được việc gì (T96 — Haan chấm lượt 4a521f52: «giao thông 10 m² để đi vào
   * phòng kho 3 m², sao không gộp luôn»). Đếm hành lang từ `min_area_m2` trở lên mà số phòng NGÕ CỤT nó
   * mở cửa vào (không tính phòng đi xuyên được, chỗ để xe, sảnh ngoài; ô thang có tính) dưới hai. Sảnh
   * đệm nhỏ dưới mức ấy không đếm — một vài mét vuông giữa gara và bếp là chuyện thường.
   */
  C10: (ctx, spec) => {
    if (!ctx.passage) return { value: null, khongCham: 'Chưa nạp luật đi lại của từ vựng phòng.' };
    const minArea = spec.params.min_area_m2 ?? 4;
    const corridors = ctx.rooms.filter(
      (room) => room.type === 'circulation' && room.areaM2 >= minArea,
    );
    if (corridors.length === 0) {
      return { value: null, khongCham: 'Phương án không có hành lang nào đủ lớn để xét.' };
    }
    const passage = ctx.passage;
    const refs: string[] = [];
    for (const corridor of corridors) {
      const served = new Set<string>();
      for (const door of ctx.graph.doors) {
        if (door.toOutside || !door.rooms.includes(corridor.id)) continue;
        for (const other of door.rooms) {
          if (other === corridor.id) continue;
          const type = ctx.graph.rooms.get(other)?.type ?? '';
          const stair = ctx.inGroup('circulation', type) && type !== 'circulation';
          if (stair || (!passage.through.has(type) && !passage.entryThrough.has(type)))
            served.add(other);
        }
      }
      if (served.size < 2) refs.push(corridor.id);
    }
    return { value: refs.length, refs };
  },

  /**
   * Khu ướt tầng trên không đè lên chỗ tiếp khách, chỗ ngủ, lối vào tầng dưới (T96 — Haan chấm lượt
   * 5aba737d: «khu vệ sinh của phòng chính nằm ngay trên cửa vào phòng khách»). Tỷ lệ khu ướt (nhóm
   * `wet`) từ tầng 2 mà phần chồng lên phòng nhóm `dry_below` tầng dưới nhỏ hơn `overlap_ratio` diện
   * tích của nó. Bếp và phòng thờ dưới WC đã là luật bắt buộc; ở đây là phần còn lại — trừ điểm, không chặn.
   */
  E5: (ctx, spec) => {
    const ratio = spec.params.overlap_ratio ?? 0.3;
    const upper = ctx.rooms.filter(
      (room) => ctx.inGroup('wet', room.type) && room.level > ctx.levels[0]!.level,
    );
    if (upper.length === 0) {
      return { value: null, khongCham: 'Không có khu ướt nào từ tầng 2 trở lên.' };
    }
    const refs: string[] = [];
    let clean = 0;
    for (const wet of upper) {
      const below = (ctx.byLevel.get(wet.level - 1) ?? []).filter((room) =>
        ctx.inGroup('dry_below', room.type),
      );
      const own = Math.max(1, (wet.rect.x1 - wet.rect.x0) * (wet.rect.y1 - wet.rect.y0));
      const over = below.reduce((sum, room) => sum + overlapArea(wet.rect, room.rect), 0);
      if (over / own < ratio) clean += 1;
      else
        refs.push(
          wet.id,
          ...below.filter((room) => overlapArea(wet.rect, room.rect) > 0).map((r) => r.id),
        );
    }
    return { value: clean / upper.length, refs: [...new Set(refs)] };
  },

  E2: (ctx, spec) => {
    const reach = (spec.params.khoang_cach_m ?? 1.5) * 100;
    const upper = ctx.rooms.filter(
      (room) => room.type === 'wc' && room.level > ctx.levels[0]!.level,
    );
    if (upper.length === 0) {
      return { value: null, khongCham: 'Không có khu vệ sinh nào từ tầng 2 trở lên.' };
    }
    const refs: string[] = [];
    let stacked = 0;
    for (const wc of upper) {
      const anchors = [
        ...(ctx.byLevel.get(wc.level - 1) ?? []).filter((room) => room.type === 'wc'),
        ...ctx.rooms.filter((room) => room.type === 'shaft'),
      ];
      const near = anchors.some((anchor) => centreDistance(anchor.rect, wc.rect) <= reach);
      if (near) stacked += 1;
      else refs.push(wc.id);
    }
    return { value: stacked / upper.length, refs };
  },

  E4: (ctx, spec) => {
    const slack = (spec.params.lech_m ?? 0.15) * 100;
    const shafts = ctx.rooms.filter((room) => room.type === 'shaft');
    if (shafts.length === 0) {
      return { value: null, khongCham: 'Phương án không khai hộp kỹ thuật.' };
    }
    const byLevel = new Map<number, RoomRef[]>();
    for (const shaft of shafts) {
      const list = byLevel.get(shaft.level) ?? [];
      list.push(shaft);
      byLevel.set(shaft.level, list);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    if (levels.length < 2) {
      return { value: null, khongCham: 'Chỉ một tầng có hộp kỹ thuật, không có gì để so.' };
    }
    const refs: string[] = [];
    for (let i = 0; i + 1 < levels.length; i += 1) {
      const here = byLevel.get(levels[i]!)!;
      const next = byLevel.get(levels[i + 1]!)!;
      for (const shaft of next) {
        if (!here.some((below) => centreDistance(below.rect, shaft.rect) <= slack)) {
          refs.push(shaft.id);
        }
      }
    }
    return { value: refs.length === 0 ? 1 : 0, refs };
  },
};

// ---------------------------------------------------------------------------
// Phép hình học nhỏ dùng riêng ở đây
// ---------------------------------------------------------------------------

const width = (r: Rect): number => r.x1 - r.x0;
const height = (r: Rect): number => r.y1 - r.y0;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Đường rẻ nhất từ một trong `from` tới một trong `to`, mỗi phòng đi xuyên tốn 1 trừ phòng `free`
 * (tốn 0). Trả số phòng phải xuyên và tên chúng; `null` khi không tới được. Tìm kiếm 0–1 BFS, tất định.
 */
function cheapestWalk(
  graph: PlanGraph,
  from: readonly string[],
  to: ReadonlySet<string>,
  free: (id: string) => boolean,
): { cost: number; crossed: string[] } | null {
  const cost = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const id of from) {
    // Cửa mở thẳng vào một phòng không phải lối đi (phòng ăn có cửa ra ngoài) thì chính phòng ấy đã
    // là một phòng phải xuyên.
    cost.set(id, free(id) || to.has(id) ? 0 : 1);
    prev.set(id, null);
    queue.push(id);
  }
  while (queue.length) {
    const id = queue.shift()!;
    const here = cost.get(id)!;
    for (const next of [...(graph.neighbours.get(id) ?? [])].sort()) {
      const step = free(next) || to.has(next) ? 0 : 1;
      const via = here + step;
      if (via < (cost.get(next) ?? Infinity)) {
        cost.set(next, via);
        prev.set(next, id);
        if (step === 0) queue.unshift(next);
        else queue.push(next);
      }
    }
  }
  const best = [...to].filter((id) => cost.has(id)).sort((p, q) => cost.get(p)! - cost.get(q)!)[0];
  if (best === undefined) return null;
  const crossed: string[] = [];
  for (let at = prev.get(best) ?? null; at !== null; at = prev.get(at) ?? null) {
    if (!free(at) && !to.has(at)) crossed.unshift(at);
  }
  return { cost: cost.get(best)!, crossed };
}

function centreDistance(a: Rect, b: Rect): number {
  const [ax, ay] = rectCentre(a);
  const [bx, by] = rectCentre(b);
  return Math.hypot(bx - ax, by - ay);
}

/** Giá trị xa trung vị nhất — dùng cho B4, nơi cái tệ nhất là cái người ta phải bước lên. */
function worst(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  return sorted.reduce((far, value) =>
    Math.abs(value - middle) > Math.abs(far - middle) ? value : far,
  );
}

/**
 * Đổi kết quả chấm sang hình dạng của hợp đồng `ai-floor-plan.$defs.score`.
 *
 * Tách hẳn khỏi `scorePlan`: kết quả trong bộ nhớ mang tên trường tiếng Anh kiểu camelCase và mang
 * cả `vi` để hiện lên màn hình, còn artifact thì BẤT BIẾN nên chỉ được mang thứ cần cho việc đọc
 * lại — chữ tiếng Việt của từng tiêu chí đã nằm ở `kb/plan_quality.yaml` và tra lại được bằng mã.
 * Đúc chữ vào artifact là đúc một bản sao sẽ lệch khi ai đó sửa câu chữ.
 */
export function scoreForArtifact(score: PlanScore): NonNullable<AiFloorPlan['score']> {
  return {
    score_version: score.scoreVersion,
    points: score.points,
    scored_weight: score.scoredWeight,
    reasoned_weight: score.suyLuanWeight,
    groups: score.groups.map((group) => ({
      code: group.code,
      weight: group.weight,
      scored_weight: group.scoredWeight,
      points: group.points,
    })),
    criteria: score.criteria.map((entry) => ({
      code: entry.code,
      group: entry.group,
      value: entry.value,
      score: entry.score,
      weight: entry.weight,
      n: entry.n,
      label: entry.label,
      not_scored: entry.khongChamVi ?? null,
      why: entry.khongCham ?? null,
      refs: entry.refs,
    })),
  };
}

// ---------------------------------------------------------------------------
// Hình dạng cho màn hình
// ---------------------------------------------------------------------------

/**
 * Điểm đã chấm, đọc lại từ artifact và dịch sang hình dạng màn hình dùng.
 *
 * **ĐỌC LẠI, không chấm lại.** Điểm nằm trong payload nên nó là điểm của đúng bản vẽ này, chấm
 * bằng đúng cái thước lúc đúc. Chấm lại lúc đọc bằng thước hôm nay cho một con số khác mà vẫn hiện
 * cạnh cùng một mã băm — lúc ấy hai lần mở cùng một phương án ra hai con số, không ai hiểu vì sao.
 * Đổi lại, `currentVersion` phải đi kèm để màn hình nói được rằng thước đã khác (T27).
 *
 * Chữ tiếng Việt thì tra lại từ thước: nó là câu cho người đọc, sửa được, nên đúc vào artifact bất
 * biến là đúc một bản sao rồi để nó lệch dần.
 *
 * ⚠️ Khoá đổi sang camelCase ở ĐÂY. Payload dùng snake_case (hợp đồng JSON Schema) còn màn hình thì
 * camelCase như mọi tuyến khác; trải thẳng `...entry` ra API cho một đối tượng nửa nọ nửa kia, và
 * đó là kiểu lệch KHÔNG có lỗi nào báo — màn hình đọc `undefined` rồi vẽ một panel trông bình
 * thường với mọi ô trống. Vì vậy hàm này là hàm thuần và có phép thử canh từng khoá.
 */
export function scoreForScreen(
  score: NonNullable<AiFloorPlan['score']>,
  quality: PlanQuality,
): PlanScoreScreen {
  const spec = new Map(quality.criteria.map((criterion) => [criterion.code, criterion]));
  return {
    scoreVersion: score.score_version,
    /** Thước HÔM NAY. Khác `scoreVersion` nghĩa là điểm này chấm bằng thước cũ, không so được. */
    currentVersion: quality.scoreVersion,
    points: score.points,
    scoredWeight: score.scored_weight,
    reasonedWeight: score.reasoned_weight,
    coSoDuLieu: quality.coSoDuLieu,
    groups: score.groups.map((group) => ({
      code: group.code,
      vi: quality.groups[group.code]?.vi ?? group.code,
      weight: group.weight,
      scoredWeight: group.scored_weight,
      points: group.points,
    })),
    criteria: score.criteria.map((entry) => ({
      code: entry.code,
      group: entry.group,
      vi: spec.get(entry.code)?.vi ?? entry.code,
      giaiThich: spec.get(entry.code)?.giaiThich ?? null,
      value: entry.value ?? null,
      score: entry.score ?? null,
      weight: entry.weight,
      n: entry.n,
      label: entry.label ?? '',
      notScored: entry.not_scored ?? null,
      why: entry.why ?? null,
      refs: entry.refs ?? [],
    })),
  };
}

export interface PlanScoreScreen {
  scoreVersion: number;
  currentVersion: number;
  points: number;
  scoredWeight: number;
  reasonedWeight: number;
  coSoDuLieu: string;
  groups: { code: string; vi: string; weight: number; scoredWeight: number; points: number }[];
  criteria: {
    code: string;
    group: string;
    vi: string;
    giaiThich: string | null;
    value: number | null;
    score: number | null;
    weight: number;
    n: number;
    label: string;
    notScored: 'gate' | 'thieu_du_lieu' | null;
    why: string | null;
    refs: string[];
  }[];
}
