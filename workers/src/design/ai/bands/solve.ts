/**
 * Bộ giải dải (T116, handoff v6 B3) — «LLM xếp dải, chương trình tính kích thước».
 *
 * Mô hình chỉ nói TỔ CHỨC: mỗi tầng là các dải từ mặt đường vào sâu, mỗi dải là các ô từ trái sang phải (nhìn từ
 * đường), một ô có thể là một chồng ô con chia theo chiều sâu. Chương trình tính MỌI kích thước: bề rộng ô theo tỉ
 * lệ diện tích tối thiểu, chiều sâu dải theo ô cần sâu nhất, ô thang tầng trên chồng đúng ô thang tầng 1, bước 10 cm.
 * Kết quả là cây chia ô `ai-plan-tree` — đi thẳng vào cổng `ai/tree/` có sẵn (đặt cửa, kiểm lối đi, luật bắt buộc,
 * chấm điểm, vẽ). Không khả thi thì KHÔNG bóp méo: trả lỗi cấu trúc kèm số thiếu.
 *
 * Hàm THUẦN, tất định: cùng đầu vào cho cùng đầu ra.
 */
import type { AiPlanTree } from '@nvg/shared/design';

/** Một ô của dải: phòng (`id`), sân / phần không xây (`"."`), hoặc chồng ô con chia theo chiều sâu. */
export interface BandCell {
  id?: string;
  /** Bề rộng gợi ý / cố định, cm. 0 hay vắng = để bộ giải tính. */
  w?: number;
  /** Ô con từ phía đường vào sâu; `d` = chiều sâu cố định (cm), 0 = bộ giải tính. */
  stack?: { id: string; d?: number }[];
}

export interface Band {
  /** Chiều sâu gợi ý / cố định, cm. 0 = bộ giải tính. */
  depth?: number;
  cells: BandCell[];
}

export interface BandStorey {
  level: number;
  bands: Band[];
}

export interface BandRoom {
  id: string;
  type: string;
  /** Diện tích lọt lòng tối thiểu, m². `null` = dùng diện tích thường dùng của loại. */
  min_m2: number | null;
}

export interface BandSolveInput {
  /** Khối xây theo tim tường, cm; `y0` là mặt đường. */
  footprint: { x0: number; y0: number; x1: number; y1: number };
  storeys: readonly BandStorey[];
  rooms: readonly BandRoom[];
  /** Mã ô thang đặc biệt trong dải (`THANG`) và loại phòng thang. */
  stairToken: string;
  /** Ô thang tối thiểu, cm — bề ngang × chiều dài (theo chiều sâu nhà). */
  stair: { width: number; length: number } | null;
  /** Cạnh ngắn tối thiểu theo loại phòng, cm — theo loại nhà. */
  minSide: (type: string) => number;
  /** Mã sảnh sau ô thang ở tầng trên khi dải thang sâu hơn ô thang tầng 1 (loại giao thông). Vắng = kéo dài ô thang. */
  landingId?: (level: number) => string;
  /**
   * Gầm thang dùng được ở đầu cao của thang thẳng, cm (`underStairCm`, T116). Có thì ô [THANG / phòng] xếp chồng ở tầng
   * mốc là WC gầm thang: phần thang dài `stair.length − underStairCm`, phòng nằm dưới đầu cao; ô gộp là thang khi kiểm
   * chiều dài, vẽ và làm mốc tầng trên. Vắng / 0 = không cho.
   */
  underStairCm?: number;
  /** Diện tích thường dùng, m² — TRỌNG SỐ chia bề rộng khi phòng không có `min_m2`. */
  usualM2: (type: string) => number;
  /**
   * Diện tích tối thiểu của nghề, m² — CHIỀU SÂU cần khi phòng không có `min_m2` của đầu bài. Vắng = dùng `usualM2`.
   * Lấy mức thường dùng làm mức cần thì bếp 10 m² + ăn 14 m² + gara + khách vượt cả sàn lọt lòng nhà ống 5 × 16,5 m.
   */
  normMinM2?: (type: string) => number;
  /**
   * Loại phòng KHÔNG đẩy chiều sâu dải theo diện tích — hành lang, lõi, giếng trời: diện tích của chúng là phần còn lại
   * sau khi xếp, chỉ xét cạnh tối thiểu. Thiếu điều này thì một ô hành lang 0,9 m «cần» 8 m² thành dải sâu 11 m.
   */
  areaFree?: ReadonlySet<string>;
  /**
   * Loại phòng mà bề rộng mô hình ghi là THÔNG THUỶ (hành lang): bộ giải cộng nửa tường ngoài ở mép khối, nửa vách
   * ngăn mỗi phía trong (`walls`); mép khối là mặt ngoài tường nên ở mép cộng trọn tường ngoài. Hành lang «0,9 m» tim tường chỉ còn ~0,65 m lọt lòng — không đặt nổi cửa.
   */
  clearWidthTypes?: ReadonlySet<string>;
  /** Bề dày tường, cm — cho `clearWidthTypes`. */
  walls?: { exterior: number; partition: number };
  /**
   * Bề rộng thông thuỷ tối thiểu của hành lang theo loại nhà, cm (`circulation.corridor_clear_m` đã áp loại nhà). Ô hành
   * lang mô hình ghi rộng hơn mức này bị thu hẹp về mức ấy khi một ô cùng dải thiếu bề ngang (T104, lượt thật 03718834:
   * hành lang 1,5 m làm phòng ăn thiếu 0,4 m). Vắng = không thu hẹp.
   */
  corridorClearCm?: number;
  /** Ưu tiên nhận phần dư chiều sâu, theo loại phòng — lớn hơn nhận nhiều hơn; vắng = 1. */
  priority?: Readonly<Record<string, number>>;
  /** Phần trừ tường khi đổi diện tích lọt lòng ra kích thước tim tường, cm (handoff: 200 mm). */
  wallCm: number;
  /** Bước làm tròn, cm. */
  stepCm: number;
}

export interface BandIssue {
  code:
    | 'band_unknown_room'
    | 'band_room_twice'
    | 'band_too_deep'
    | 'band_too_wide'
    | 'band_before_stair_too_deep'
    | 'band_stair_clash'
    | 'band_stair_missing'
    | 'band_cell_too_narrow'
    | 'stair_entry_long_side'
    | 'stair_end_blocked'
    | 'light_well_not_stacked'
    | 'wet_over_living'
    | 'habitable_no_window';
  level: number;
  message: string;
  /** Tham số riêng của câu nhắc (vd. `stair`, `host` của `stair_entry_long_side`). */
  params?: Record<string, string>;
  rooms: string[];
  /** Phần thiếu, cm (chiều sâu / bề rộng) — để câu nhắc nói được số. */
  shortCm?: number;
  /**
   * Lỗi chiều sâu: chiều sâu TỐI THIỂU từng dải của tầng (cm) — câu nhắc nói dải nào ngốn chỗ (lượt thật 03718834: câu
   * chỉ có tổng số thiếu, mô hình đoán sai dải và làm tầng sâu thêm).
   */
  bandDepths?: { rooms: string[]; cm: number }[];
  /**
   * `band_stair_clash`: tầng ngốn phần trước thang (`bandDepths` là dải của nó), tầng ngốn thang + phần sau (`backDepths`),
   * và tầng lệch là tầng sau (`blameBack`) hay tầng trước — `level` của lỗi là tầng lệch.
   */
  clash?: {
    front: number;
    back: number;
    blameBack: boolean;
    backDepths: { rooms: string[]; cm: number }[];
  };
}

export interface SolvedStorey {
  level: number;
  tree: AiPlanTree;
  /** Chữ nhật từng phòng, cm. */
  rects: Map<string, Rect>;
  /** Ô thang gộp phòng dưới gầm (WC gầm thang) — mốc tầng trên là ô này, không phải riêng phần thang. */
  stairUnion?: Rect;
}

export interface BandSolveResult {
  storeys: SolvedStorey[];
  issues: BandIssue[];
  /** Chỗ bộ giải tự sửa (tiếng Việt) — ghi nhật ký và hiện cho kỹ sư. */
  fixes: string[];
  /** Ô thang tầng 1 (cm) — mốc cho tầng trên. */
  stairRect: Rect | null;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const OPEN_CELL = '.';

/**
 * Ưu tiên nhận phần dư chiều sâu khi đầu vào không khai (handoff B3: «khách → ngủ chính → ngủ → bếp ăn → khác»). Dải
 * thang không nhận phần dư — chiều sâu của nó là chiều dài thang.
 */
export const DEFAULT_PRIORITY: Readonly<Record<string, number>> = {
  living: 2,
  master_bedroom: 2,
  bedroom: 2,
  kitchen: 1.5,
  dining: 1.5,
  study: 1.5,
  altar_room: 1.5,
  wc: 0.5,
  storage: 0.5,
  circulation: 0.5,
  stair: 0,
};

export function solveBands(input: BandSolveInput): BandSolveResult {
  const windowIssues: BandIssue[] = [];
  const roomOf = new Map(input.rooms.map((room) => [room.id, room]));
  const sorted = [...input.storeys].sort((a, b) => a.level - b.level);
  // Vị trí thang tầng 1 phải để chỗ cho MỌI tầng: trước thang ≥ phần trước thang sâu nhất, sau thang ≥ phần sau thang
  // sâu nhất. Đo từng tầng (chưa ép mốc), lấy khoảng cho phép của mép trước ô thang; tầng 1 chia phần dư trong khoảng ấy.
  const window = stairWindow(input, sorted, roomOf, windowIssues);
  const isWell = (id: string) => roomOf.get(id)?.type === 'light_well';
  /** Một lượt dựng mọi tầng; `fixed` = đoạn giếng trời áp cho MỌI tầng (kể cả tầng 1), vắng = neo theo tầng dưới. */
  const pass = (fixed: Rect[] | null): BandSolveResult => {
    const issues = [...windowIssues];
    const storeys: SolvedStorey[] = [];
    const fixes: string[] = [];
    let stairRect: Rect | null = null;
    // Tầng đặt mốc thang hỏng thì tầng trên KHÔNG lấy ô thang của tầng kế làm mốc: mốc ấy do phần dư của chính tầng kế
    // quyết, không phải tầng 1, nên lỗi đo theo nó là lỗi giả (lượt thật 93d212a2: tầng 1 hỏng, tầng 4 dùng 12 m trên
    // 16,5 m vẫn bị báo «thiếu 100 mm» và gửi mô hình). Các tầng còn lại chỉ tự kiểm (tổng chiều sâu, khoảng thang).
    let anchorFailed = false;
    // Giếng trời tầng thấp nhất có giếng — tầng trên neo giếng của mình vào đó (xem `wells` của `solveStorey`).
    let wells: Rect[] = fixed ?? [];
    for (const storey of sorted) {
      const solved = solveStorey(
        input,
        storey,
        roomOf,
        stairRect,
        issues,
        stairRect ? null : window,
        undefined,
        fixes,
        wells,
      );
      if (solved && !wells.length)
        wells = [...solved.rects].filter(([id]) => isWell(id)).map(([, rect]) => rect);
      if (!solved) {
        if (!stairRect) anchorFailed = true;
        continue;
      }
      storeys.push(solved);
      if (!stairRect && !anchorFailed)
        stairRect =
          solved.stairUnion ?? solved.rects.get(stairIdOf(storey, input.stairToken)) ?? null;
    }
    return { storeys, issues, stairRect, fixes: [...new Set(fixes)] };
  };
  const first = pass(null);
  // Giếng trời vẫn lệch giữa các tầng (phòng cùng ô tầng trên cần sâu hơn phòng tầng 1 — lượt thật df9da65a: bồn nước
  // mái cần 2,1 m trước giếng, WC tầng 1 chỉ 1,4 m): dựng lại với đoạn CHUNG — bắt đầu sau phần trước sâu nhất, kết thúc
  // trước phần sau sâu nhất — áp cho mọi tầng. Chỉ nhận lượt hai khi không thêm lỗi.
  const aligned = commonWell(first.storeys, isWell, input.stepCm);
  if (!aligned) return first;
  const second = pass([aligned]);
  if (second.issues.length > first.issues.length) return first;
  return {
    ...second,
    fixes: [
      ...second.fixes,
      'Giếng trời các tầng lệch nhau trong ô xếp chồng — chương trình đặt giếng trời mọi tầng vào cùng một đoạn.',
    ],
  };
}

/**
 * Đoạn giếng trời chung của các tầng (một giếng mỗi tầng, cùng cột) khi chúng lệch trước–sau; `null` = đã thẳng, không
 * cùng cột, hay không còn đoạn chung.
 */
function commonWell(
  storeys: readonly SolvedStorey[],
  isWell: (id: string) => boolean,
  stepCm: number,
): Rect | null {
  const rects = storeys.flatMap((storey) =>
    [...storey.rects].filter(([id]) => isWell(id)).map(([, rect]) => rect),
  );
  const base = rects[0];
  if (!base || rects.length < 2) return null;
  if (rects.some((r) => Math.abs(r.x0 - base.x0) > stepCm || Math.abs(r.x1 - base.x1) > stepCm))
    return null;
  const y0 = Math.max(...rects.map((r) => r.y0));
  const y1 = Math.min(...rects.map((r) => r.y1));
  if (rects.every((r) => r.y0 === y0 && r.y1 === y1) || y1 <= y0) return null;
  return { x0: base.x0, y0, x1: base.x1, y1 };
}

/**
 * Khoảng cho phép của mép trước ô thang tầng 1: `lo` = phần trước thang sâu nhất trong các tầng, `hi` = chiều sâu khối
 * trừ ô thang và phần sau thang sâu nhất. Không có khoảng → lỗi cấu trúc ở tầng gây hẹp, kèm số thiếu.
 */
function stairWindow(
  input: BandSolveInput,
  storeys: readonly BandStorey[],
  roomOf: ReadonlyMap<string, BandRoom>,
  issues: BandIssue[],
): StairWindow | null {
  const depth = input.footprint.y1 - input.footprint.y0;
  const measured: {
    level: number;
    pre: number;
    stair: number;
    post: number;
    bandDepths: { rooms: string[]; cm: number }[];
    wellPre?: number;
    wellMin?: number;
  }[] = [];
  for (const storey of storeys) {
    solveStorey(input, storey, roomOf, null, [], null, (m) =>
      measured.push({ level: storey.level, ...m }),
    );
  }
  if (measured.length < 2) return null;
  // Mỗi tầng tự ràng buộc: mép thang + dải thang của CHÍNH tầng ấy + phần sau thang ≤ chiều sâu khối (dải thang mái có
  // ô cục nóng có thể sâu hơn ô thang — chỉ hẹp phần sau thang của mái, không phải của mọi tầng).
  const lo = Math.max(...measured.map((m) => m.pre));
  const hi = Math.min(...measured.map((m) => depth - m.stair - m.post));
  const stair = depth - hi - Math.max(...measured.map((m) => m.post));
  if (lo > hi) {
    // Thang tầng 1 là MỐC CỐ ĐỊNH (handoff sửa lỗi đợt 2 mục 3.3 — lời dẫn nói «storey 1 chooses the stair»): tầng 1 vừa
    // khối thì tầng trên nào không khớp khoảng thang của tầng 1 là tầng lệch, không cần quy tắc kinh nghiệm. Tầng 1 tự
    // sâu quá khối thì tầng 1 lệch. Câu nhắc nói cả hai tầng (lượt thật 41ffe1e5: mái dồn 10,5 m trước thang, câu cũ đổ
    // cho tầng 1 — mô hình nén tầng 1 ba vòng tới đúng bằng bộ dải viết tay mà vẫn hỏng).
    const total = (m: (typeof measured)[number]) => m.pre + m.stair + m.post;
    const first = measured.reduce((a, b) => (b.level < a.level ? b : a));
    const room1 = { lo: first.pre, hi: depth - first.stair - first.post };
    /** Phần tầng `m` vượt khoảng thang của tầng 1: trước thang / sau thang. */
    const overFront = (m: (typeof measured)[number]) => Math.max(0, m.pre - room1.hi);
    const overBack = (m: (typeof measured)[number]) =>
      Math.max(0, room1.lo - (depth - m.stair - m.post));
    let culprit: (typeof measured)[number] | null = null;
    let frontSide = true;
    if (total(first) > depth) {
      culprit = first;
      frontSide = first.pre >= first.post;
    } else {
      const worst = measured
        .filter((m) => m !== first)
        .reduce<(typeof measured)[number] | null>(
          (a, b) =>
            !a || Math.max(overFront(b), overBack(b)) > Math.max(overFront(a), overBack(a)) ? b : a,
          null,
        );
      if (worst && Math.max(overFront(worst), overBack(worst)) > 0) {
        culprit = worst;
        frontSide = overFront(worst) >= overBack(worst);
      }
    }
    if (culprit && culprit !== first) {
      // Tầng lệch dồn trước thang → cặp là (tầng lệch trước, tầng 1 sau); dồn sau thang → (tầng 1 trước, tầng lệch sau).
      const front = frontSide ? culprit : first;
      const back = frontSide ? first : culprit;
      issues.push({
        ...issue(
          'band_stair_clash',
          culprit.level,
          `Tầng ${front.level} cần trước thang ${front.pre} cm, tầng ${back.level} cần thang + sau thang ${back.stair + back.post} cm — chung một mốc thang (tầng 1), vượt chiều sâu khối ${lo - hi} cm.`,
          [],
        ),
        params: {
          front_mm: String(front.pre * 10),
          back_mm: String((back.stair + back.post) * 10),
        },
        shortCm: frontSide ? overFront(culprit) : overBack(culprit),
        bandDepths: front.bandDepths,
        clash: {
          front: front.level,
          back: back.level,
          blameBack: !frontSide,
          backDepths: back.bandDepths,
        },
      });
      return null;
    }
    const tight =
      culprit === first
        ? first
        : measured.reduce((a, b) => (b.pre + b.post > a.pre + a.post ? b : a));
    issues.push({
      ...issue(
        'band_before_stair_too_deep',
        tight.level,
        `Các tầng cần trước thang ${lo} cm và sau thang ${depth - stair - hi} cm — tổng vượt chiều sâu khối ${lo - hi} cm.`,
        [],
      ),
      // Tầng 1 tự sâu quá khối: số thiếu là của chính nó (tầng trên khớp lại theo tầng 1 sau khi tầng 1 sửa).
      shortCm: culprit === first ? total(first) - depth : lo - hi,
      bandDepths: tight.bandDepths,
    });
    return null;
  }
  // Dải giếng trời giữa nhà neo theo giếng tầng 1 như dải thang: tầng 1 phải để đủ chỗ trước giếng cho tầng trên sâu nhất.
  const wells = measured.filter((m) => m.wellPre !== undefined);
  return wells.length > 1
    ? {
        lo,
        hi,
        wellLo: Math.max(...wells.map((m) => m.wellPre!)),
        wellMin: Math.max(...wells.map((m) => m.wellMin!)),
      }
    : { lo, hi };
}

/** Khoảng cho phép của mép trước ô thang tầng 1; `wellLo` / `wellMin` = mép trước / chiều sâu tối thiểu dải giếng trời. */
interface StairWindow {
  lo: number;
  hi: number;
  wellLo?: number;
  wellMin?: number;
}

/** Mã phòng thang trên tầng: `THANG` đổi thành `thang_<tầng>`. */
export function stairIdOf(storey: Pick<BandStorey, 'level'>, token: string): string {
  return `${token.toLowerCase()}_${storey.level}`;
}

function solveStorey(
  input: BandSolveInput,
  storey: BandStorey,
  roomOf: ReadonlyMap<string, BandRoom>,
  stairBelow: Rect | null,
  issues: BandIssue[],
  /** Tầng 1: khoảng cho phép của mép trước ô thang (cm từ mặt đường) — vắng = chia phần dư tự do. */
  window: StairWindow | null = null,
  /** Chỉ đo: trả chiều sâu tối thiểu trước / của / sau dải thang (và trước / của dải giếng trời), không dựng. */
  measure?: (m: {
    pre: number;
    stair: number;
    post: number;
    bandDepths: { rooms: string[]; cm: number }[];
    wellPre?: number;
    wellMin?: number;
  }) => void,
  /** Chỗ bộ giải tự sửa — ghi vào đây. */
  fixes: string[] = [],
  /**
   * Giếng trời của tầng dưới (cm). Ô xếp chồng có giếng trời cùng cột thì giếng nằm đúng đoạn trước–sau ấy, phòng cùng ô
   * nhận phần còn lại — chia theo diện tích từng tầng thì giếng lệch nhau (lượt thật df9da65a: [WC / giếng trời] mọi
   * tầng, [bồn nước / giếng trời] trên mái — WC mỗi tầng khác cỡ, giếng tầng 1 bị báo «che» ở mái).
   */
  wells: readonly Rect[] = [],
): SolvedStorey | null {
  const { footprint, stepCm } = input;
  const width = footprint.x1 - footprint.x0;
  const depth = footprint.y1 - footprint.y0;
  const stairId = stairIdOf(storey, input.stairToken);
  const before = issues.length;

  // ── Kiểm mã phòng ──────────────────────────────────────────────────────────────────────────
  const seen = new Set<string>();
  const idsOf = (cell: BandCell): string[] =>
    cell.stack ? cell.stack.map((s) => s.id) : cell.id ? [cell.id] : [];
  for (const band of storey.bands) {
    for (const cell of band.cells) {
      for (const raw of idsOf(cell)) {
        if (raw === OPEN_CELL) continue;
        const id = raw === input.stairToken ? stairId : raw;
        if (raw !== input.stairToken && !roomOf.has(id)) {
          issues.push(
            issue('band_unknown_room', storey.level, `«${raw}» không có trong danh mục phòng.`, [
              raw,
            ]),
          );
        } else if (seen.has(id)) {
          issues.push(
            issue(
              'band_room_twice',
              storey.level,
              `«${raw}» xuất hiện hai lần trên tầng ${storey.level}.`,
              [raw],
            ),
          );
        }
        seen.add(id);
      }
    }
  }
  if (input.stair && !seen.has(stairId) && storey.bands.length > 0) {
    issues.push(
      issue(
        'band_stair_missing',
        storey.level,
        `Tầng ${storey.level} không có ô «${input.stairToken}».`,
        [],
      ),
    );
  }
  if (issues.length > before) return null;

  // Tầng trên: ô thang đứng đúng bề ngang tầng 1. Mô hình hay ghi THANG nhầm phía (ô thang tầng 1 bên phải mà dải ghi
  // THANG trước) — phía nào của thang không có ô mà vẫn còn chỗ thì dồn các ô sang phía ấy, giữ thứ tự của chúng.
  // Bản sao nông: phần dưới có thể thay `cells` của một dải (thu hẹp hành lang) — không đụng đầu vào.
  const bands: Band[] = storey.bands.map((original) => {
    const band = { ...original };
    const at = band.cells.findIndex((cell) => idsOf(cell).includes(input.stairToken));
    if (!stairBelow || at < 0) return band;
    const left = band.cells.slice(0, at);
    const right = band.cells.slice(at + 1);
    const leftGap = stairBelow.x0 - footprint.x0;
    const rightGap = footprint.x1 - stairBelow.x1;
    const stairCell = band.cells[at]!;
    if (left.length === 0 && leftGap > 0 && rightGap === 0)
      return { ...band, cells: [...right, stairCell] };
    if (right.length === 0 && rightGap > 0 && leftGap === 0)
      return { ...band, cells: [stairCell, ...left] };
    return band;
  });

  const typeOf = (id: string) =>
    id === stairId || id === input.stairToken ? 'stair' : (roomOf.get(id)?.type ?? '');
  /** Diện tích CẦN (độ sâu): đầu bài → tối thiểu của nghề. */
  const needM2 = (id: string): number => {
    if (id === stairId || id === input.stairToken || id === OPEN_CELL) return 0;
    const room = roomOf.get(id);
    if (!room || input.areaFree?.has(room.type)) return 0;
    return room.min_m2 ?? (input.normMinM2 ?? input.usualM2)(room.type);
  };
  /** Trọng số chia bề rộng: đầu bài → thường dùng. */
  const minM2 = (id: string): number => {
    if (id === stairId || id === input.stairToken || id === OPEN_CELL) return 0;
    const room = roomOf.get(id);
    if (!room || input.areaFree?.has(room.type)) return 0;
    return room.min_m2 ?? input.usualM2(room.type);
  };
  const side = (id: string) => (id === OPEN_CELL ? 0 : input.minSide(typeOf(id)));
  const round = (v: number) => Math.round(v / stepCm) * stepCm;
  const ceil = (v: number) => Math.ceil(v / stepCm - 1e-9) * stepCm;

  // ── Bề rộng ô trong từng dải ───────────────────────────────────────────────────────────────
  const stairBandIndex = bands.findIndex((band) =>
    band.cells.some((cell) => idsOf(cell).includes(input.stairToken)),
  );
  const allowanceOf = (band: BandStorey['bands'][number], i: number) =>
    !input.walls
      ? 0
      : i === 0 || i === band.cells.length - 1
        ? input.walls.exterior + input.walls.partition / 2
        : input.walls.partition;
  // Cạnh tối thiểu (`minSide`) là LỌT LÒNG — cổng đo «không kê nổi đồ đạc» trên lọt lòng. Bề ngang ô ở đây theo tim
  // tường, mép khối là mặt ngoài tường: so phải cộng phần tường của chính ô ấy (phát lại 93d212a2: WC rộng 90 cm theo
  // tim tường, lọt lòng 63 cm, cổng bác).
  const partitionCm = input.walls?.partition ?? 0;
  const sideIn = (band: BandStorey['bands'][number], c: number, id: string) =>
    id === OPEN_CELL ? 0 : side(id) + allowanceOf(band, c);
  const isClear = (cell: BandCell) =>
    !cell.stack && !!cell.id && !!input.clearWidthTypes?.has(typeOf(cell.id));
  const widthsOf = (
    band: BandStorey['bands'][number],
    index: number,
    clearOverride: ReadonlyMap<number, number> = new Map(),
  ) => {
    const fixed = band.cells.map((cell, i) => {
      if (cell.w && cell.w > 0) {
        // Mọi bề rộng mô hình ghi là LỌT LÒNG (handoff sửa lỗi đợt 2 mục 1.2 — trước đây chỉ hành lang lọt lòng, phòng
        // khác tim tường: «WC 900» là 63 cm lọt lòng). Ô thang giữ số của ô thang (`rect_min_mm`).
        if (idsOf(cell).includes(input.stairToken) || !input.walls) return cell.w;
        // Mép khối là MẶT NGOÀI tường: trọn tường ngoài nằm trong khối (đo trên oracle và cổng `ai/tree/`).
        return ceil((clearOverride.get(i) ?? cell.w) + allowanceOf(band, i));
      }
      if (idsOf(cell).includes(input.stairToken)) return input.stair?.width ?? 0;
      return 0;
    });
    // Tầng trên: ô thang đứng đúng bề ngang tầng 1 — các ô trước nó lấp kín tới mép trái ô thang.
    if (stairBelow && index === stairBandIndex) {
      const at = band.cells.findIndex((cell) => idsOf(cell).includes(input.stairToken));
      fixed[at] = stairBelow.x1 - stairBelow.x0;
      return [
        ...share(band.cells.slice(0, at), fixed.slice(0, at), stairBelow.x0 - footprint.x0),
        fixed[at]!,
        ...share(band.cells.slice(at + 1), fixed.slice(at + 1), footprint.x1 - stairBelow.x1),
      ];
    }
    return share(band.cells, fixed, width);
  };
  const narrowest = (band: BandStorey['bands'][number], ws: number[]) =>
    band.cells.reduce(
      (sum, cell, c) => sum + Math.max(0, ...idsOf(cell).map((id) => sideIn(band, c, id) - ws[c]!)),
      0,
    );
  const widths = bands.map((band, index) => {
    const first = widthsOf(band, index);
    const short = narrowest(band, first);
    const corridor = input.corridorClearCm;
    if (short <= 0 || corridor === undefined || !input.walls) return first;
    // Ô cùng dải thiếu bề ngang mà hành lang mô hình ghi rộng hơn mức thông thuỷ của loại nhà: thu hẹp hành lang về
    // mức ấy (T104 — chương trình tự làm, không gửi mô hình), phần dư về các ô tự do của dải.
    const wide = band.cells
      .map((cell, i) => ({ cell, i }))
      .filter(({ cell }) => isClear(cell) && (cell.w ?? 0) > corridor);
    if (!wide.length) return first;
    const override = new Map(wide.map(({ i }) => [i, corridor]));
    // Ô có bề rộng cố định mà thiếu cạnh: phần hành lang nhả ra phải tới được nó — bỏ bề rộng cố định của ô ấy.
    const freed = {
      ...band,
      cells: band.cells.map((cell, c) =>
        (cell.w ?? 0) > 0 &&
        !isClear(cell) &&
        idsOf(cell).some((id) => sideIn(band, c, id) > first[c]!)
          ? { ...cell, w: 0 }
          : cell,
      ),
    };
    const second = widthsOf(freed, index, override);
    if (narrowest(freed, second) >= short) return first;
    band.cells = freed.cells;
    fixes.push(
      `Tầng ${storey.level}: hành lang ${wide.map(({ cell }) => `«${cell.id}» ${cell.w} cm`).join(', ')} rộng hơn mức thông thuỷ ${corridor} cm — thu hẹp để ô cùng dải đủ bề ngang.`,
    );
    return second;
  });
  // Ô thiếu bề ngang mượn phần dư của ô cùng đoạn dải (chương trình tự làm, không gửi mô hình): ô cho chỉ nhả phần trên
  // cạnh tối thiểu của chính nó, hành lang không cho (đã có bước thu hẹp ở trên), ô thang không cho. Lượt thật 36fb8000:
  // dải [WC / giặt 900 | hành lang 900 | phòng thờ 3.200] — giặt thiếu 100 mm trong khi phòng thờ dư hơn 1 m, mô hình
  // tốn trọn một vòng sửa vì 100 mm.
  bands.forEach((band, b) => {
    const ws = widths[b]!;
    const floorAt = (c: number) =>
      Math.max(0, ...idsOf(band.cells[c]!).map((id) => sideIn(band, c, id)));
    const stairAt = band.cells.findIndex((cell) => idsOf(cell).includes(input.stairToken));
    // Dải thang tầng trên: hai phía ô thang là hai đoạn riêng, bề ngang mỗi đoạn đã khoá theo ô thang tầng 1.
    const segment = (c: number) => (stairBelow && b === stairBandIndex && c > stairAt ? 1 : 0);
    band.cells.forEach((cell, c) => {
      // Đơn vị cm, không làm tròn theo bước: phần thiếu thường dưới một bước (mép tường 27,5 cm so với vách 11 cm).
      let short = Math.ceil(floorAt(c) - ws[c]! - 1e-9);
      if (short <= 0 || c === stairAt) return;
      const slack = (d: number) => ws[d]! - floorAt(d);
      const donors = band.cells
        .map((_, d) => d)
        .filter(
          (d) =>
            d !== c &&
            d !== stairAt &&
            segment(d) === segment(c) &&
            !isClear(band.cells[d]!) &&
            slack(d) > 0,
        )
        .sort((p, q) => slack(q) - slack(p));
      if (donors.reduce((sum, d) => sum + slack(d), 0) < short) return;
      const from: string[] = [];
      for (const d of donors) {
        if (short <= 0) break;
        const give = Math.min(short, Math.floor(slack(d)));
        if (give <= 0) continue;
        ws[d] = ws[d]! - give;
        ws[c] = ws[c]! + give;
        short -= give;
        from.push(`«${idsOf(band.cells[d]!).join(' / ') || OPEN_CELL}»`);
      }
      if (from.length)
        fixes.push(
          `Tầng ${storey.level}: «${idsOf(cell).join(' / ')}» thiếu bề ngang — lấy phần dư của ${from.join(', ')} cùng dải.`,
        );
    });
  });
  function share(cells: BandCell[], given: number[], total: number): number[] {
    // Ô tự do nhận bề ngang theo tỉ lệ diện tích, nhưng KHÔNG dưới cạnh tối thiểu của nó: ô nào rơi dưới mức thì ghim ở
    // mức ấy rồi chia lại phần còn lại (lượt thật 619f0438: dải [kho | bếp | ăn] chia theo diện tích, kho thiếu 10 cm
    // trong khi bếp, ăn còn dư). Không đủ chỗ cho mọi mức tối thiểu thì để phép kiểm bề ngang báo như cũ.
    const fixed = [...given];
    // Không biết vị trí ô trong dải ở đây: cộng một vách trong (ô mép thiếu phần tường ngoài thì bước mượn bù).
    const floorOf = (cell: BandCell) =>
      Math.max(0, ...idsOf(cell).map((id) => (id === OPEN_CELL ? 0 : side(id) + partitionCm)));
    for (let pass = 0; pass < cells.length; pass += 1) {
      const trial = shareOnce(cells, fixed, total);
      const under = cells.findIndex(
        (cell, i) => fixed[i] === 0 && trial[i]! < floorOf(cell) && floorOf(cell) > 0,
      );
      if (under < 0) return trial;
      const pinned = fixed.reduce((sum, w) => sum + w, 0) + ceil(floorOf(cells[under]!));
      if (pinned > total || fixed.every((w, i) => w > 0 || i === under)) return trial;
      fixed[under] = ceil(floorOf(cells[under]!));
    }
    return shareOnce(cells, fixed, total);
  }
  function shareOnce(cells: BandCell[], fixed: number[], total: number): number[] {
    const free = total - fixed.reduce((sum, w) => sum + w, 0);
    const weight = cells.map((cell, i) =>
      fixed[i]! > 0
        ? 0
        : Math.max(
            idsOf(cell).reduce((sum, id) => sum + minM2(id), 0),
            1,
          ),
    );
    const sumW = weight.reduce((sum, w) => sum + w, 0);
    const out = cells.map((_, i) =>
      fixed[i]! > 0 ? fixed[i]! : sumW > 0 ? round((free * weight[i]!) / sumW) : 0,
    );
    // Dồn phần lệch do làm tròn vào ô tự do cuối cùng — tổng đúng bằng bề ngang. Không còn ô tự do (dải thang tầng
    // trên: các ô một phía buộc lấp đúng khoảng tới ô thang tầng 1) thì ô cố định cuối nhận phần chênh.
    const last =
      out
        .map((_, i) => i)
        .filter((i) => fixed[i] === 0)
        .pop() ?? out.length - 1;
    if (last >= 0) out[last] = out[last]! + (total - out.reduce((sum, w) => sum + w, 0));
    return out;
  }
  bands.forEach((band, b) => {
    const ws = widths[b]!;
    if (ws.some((w) => w < 0) || Math.abs(ws.reduce((s, w) => s + w, 0) - width) > 0.5) {
      issues.push(
        issue(
          'band_too_wide',
          storey.level,
          `Dải ${b + 1} tầng ${storey.level}: các ô cố định rộng hơn khối nhà.`,
          band.cells.flatMap(idsOf),
        ),
      );
    }
    band.cells.forEach((cell, c) => {
      for (const id of idsOf(cell)) {
        if (ws[c]! < sideIn(band, c, id)) {
          issues.push({
            ...issue(
              'band_cell_too_narrow',
              storey.level,
              `«${id}» chỉ rộng ${ws[c]} cm, cần ít nhất ${sideIn(band, c, id)} cm.`,
              [id],
            ),
            shortCm: sideIn(band, c, id) - ws[c]!,
          });
        }
      }
    });
  });
  // Chỉ đo (khoảng thang chung): đo tiếp chiều sâu dù ô thiếu bề ngang — lỗi chiều sâu / mốc thang báo CÙNG lượt với lỗi
  // bề ngang (handoff sửa lỗi đợt 2 mục 1.1: mỗi vòng chỉ lộ một lớp lỗi thì rất tốn vòng).
  if (issues.length > before && !measure) return null;

  // ── Chiều sâu dải ──────────────────────────────────────────────────────────────────────────
  const needOf = (id: string, w: number): number => {
    if (id === OPEN_CELL) return 0;
    if (id === stairId || id === input.stairToken) return input.stair?.length ?? 0;
    const area = needM2(id) * 1e4; // cm²
    // Ô hẹp hơn cạnh tối thiểu (đã báo lỗi bề ngang) tính như đã nới tới cạnh ấy — chiều sâu ước không bị thổi phồng.
    const wide = Math.max(w, side(id) + partitionCm);
    return Math.max(
      ceil(area / Math.max(wide - input.wallCm, 1) + input.wallCm),
      side(id) + partitionCm,
    );
  };
  // WC gầm thang (T116): ô chồng đúng hai phần [THANG, phòng] ở tầng mốc — thang giữ phần thấp, phòng nằm dưới đầu cao.
  const under = !stairBelow && input.stair ? (input.underStairCm ?? 0) : 0;
  const underStack = (cell: BandCell) =>
    under > 0 &&
    !!cell.stack &&
    cell.stack.length === 2 &&
    cell.stack.some((s) => s.id === input.stairToken) &&
    cell.stack.some((s) => s.id !== input.stairToken && s.id !== OPEN_CELL);
  const stackNeeds = (cell: BandCell, w: number): number[] =>
    underStack(cell)
      ? cell.stack!.map((s) => (s.id === input.stairToken ? input.stair!.length - under : under))
      : cell.stack!.map((s) =>
          s.d && s.d > 0 ? s.d : needOf(s.id === input.stairToken ? stairId : s.id, w),
        );
  // Chiều sâu dải mô hình ghi không phải số cứng: dưới mức cần của ô trong dải thì lấy mức cần (lượt thật
  // 619f0438: dải thang ghi 4.000 mm trong khi ô thang cần 4.140 mm và ô [WC / giếng trời] cần ~4.600 mm — giếng trời
  // còn 30 cm, cổng cây bác nhát cắt).
  // Ghi LỚN hơn mức cần thì chỉ là mong muốn: phép kiểm dùng mức cần, phần dư lấp tới số mô hình ghi trước (`spread`).
  // Lượt thật 36fb8000: dải sân thượng tầng 4 ghi 7.760 mm — coi là sàn thì phần sau thang tầng 4 chiếm hết, thang tầng
  // 1 không còn chỗ, báo «thừa 3.700 mm» trong khi tầng 4 chỉ cần 4.160 mm.
  // Chiều sâu mô hình ghi cũng LỌT LÒNG (handoff sửa lỗi đợt 2 mục 1.2): cộng một vách. Dải thang giữ số của ô thang.
  const givenDepth = bands.map((band, b) =>
    band.depth && band.depth > 0 ? band.depth + (b === stairBandIndex ? 0 : partitionCm) : 0,
  );
  const minDepth = bands.map((band, b) => {
    return Math.max(
      ...band.cells.map((cell, c) => {
        const w = widths[b]![c]!;
        if (!cell.stack) return needOf(cell.id ?? OPEN_CELL, w);
        return stackNeeds(cell, w).reduce((sum, v) => sum + v, 0);
      }),
      0,
    );
  });
  const depths = [...minDepth];
  const priorityOf = (band: Band) => {
    const ids = band.cells.flatMap(idsOf);
    if (ids.includes(input.stairToken)) return 0;
    const table = input.priority ?? DEFAULT_PRIORITY;
    return Math.max(...ids.map((id) => (id === OPEN_CELL ? 0.5 : (table[typeOf(id)] ?? 1))), 0);
  };

  const bandDepths = bands.map((band, b) => ({
    rooms: band.cells.flatMap(idsOf).map((id) => (id === input.stairToken ? stairId : id)),
    cm: minDepth[b]!,
  }));
  // Dải giếng trời giữa nhà (mẫu C, handoff sửa lỗi đợt 3): ô giếng đứng riêng cùng cột với giếng tầng dưới → dải ấy neo
  // đúng đoạn trước–sau của giếng tầng dưới, như dải thang neo theo ô thang tầng 1.
  /** Dải có một ô giếng trời đứng riêng (không phải dải thang) — dải giếng trời giữa nhà. */
  const wellBandIndex = bands.findIndex(
    (band, b) =>
      b !== stairBandIndex &&
      band.cells.some((cell) => !cell.stack && !!cell.id && typeOf(cell.id) === 'light_well'),
  );
  const wellBand = (() => {
    if (!stairBelow || !wells.length) return null;
    for (let b = 0; b < bands.length; b += 1) {
      if (b === stairBandIndex) continue;
      let x = footprint.x0;
      for (let c = 0; c < bands[b]!.cells.length; c += 1) {
        const cell = bands[b]!.cells[c]!;
        const w = widths[b]![c]!;
        if (!cell.stack && cell.id && typeOf(cell.id) === 'light_well') {
          const anchor = wells.find((r) => Math.min(r.x1, x + w) - Math.max(r.x0, x) > 0);
          if (anchor) return { b, y0: anchor.y0, y1: anchor.y1 };
        }
        x += w;
      }
    }
    return null;
  })();
  if (stairBelow && stairBandIndex >= 0) {
    // Mốc: dải thang bắt đầu đúng y0 của ô thang tầng 1; dải giếng trời (nếu có) đúng đoạn giếng tầng dưới. Các dải còn
    // lại lấp các khoảng giữa mốc.
    const stairH = Math.max(minDepth[stairBandIndex]!, stairBelow.y1 - stairBelow.y0);
    const anchors = [
      { b: stairBandIndex, y0: stairBelow.y0, y1: stairBelow.y0 + stairH },
      ...(wellBand ? [wellBand] : []),
    ].sort((p, q) => p.b - q.b);
    let cursor = footprint.y0;
    let start = 0;
    for (const [k, anchor] of anchors.entries()) {
      const room = anchor.y0 - cursor;
      const need = minDepth.slice(start, anchor.b).reduce((sum, d) => sum + d, 0);
      if (need > room || room < 0) {
        const beforeStair = anchor.b === stairBandIndex;
        issues.push({
          ...issue(
            beforeStair ? 'band_before_stair_too_deep' : 'band_too_deep',
            storey.level,
            beforeStair
              ? `Tầng ${storey.level}: các dải trước thang cần sâu ${need} cm, ô thang tầng 1 bắt đầu ở ${anchor.y0 - footprint.y0} cm.`
              : `Tầng ${storey.level}: các dải trước giếng trời cần sâu ${need} cm, giếng trời tầng dưới bắt đầu ở ${anchor.y0 - footprint.y0} cm.`,
            bands.slice(start, anchor.b).flatMap((band) => band.cells.flatMap(idsOf)),
          ),
          shortCm: need - room,
          bandDepths,
        });
        return null;
      }
      if (anchor.b > start) spread(depths, start, anchor.b, room - need);
      else if (room > 0 && k > 0) {
        // Hai mốc liền nhau mà còn khe: dải mốc trước nhận phần khe (không có dải nào khác để lấp).
        depths[anchors[k - 1]!.b] = depths[anchors[k - 1]!.b]! + room;
      }
      depths[anchor.b] = anchor.y1 - anchor.y0;
      if (
        anchor !== anchors.find((a) => a.b === stairBandIndex) &&
        minDepth[anchor.b]! > depths[anchor.b]!
      ) {
        issues.push({
          ...issue(
            'band_too_deep',
            storey.level,
            `Tầng ${storey.level}: dải giếng trời cần sâu ${minDepth[anchor.b]} cm, giếng trời tầng dưới sâu ${depths[anchor.b]} cm.`,
            bands[anchor.b]!.cells.flatMap(idsOf),
          ),
          shortCm: minDepth[anchor.b]! - depths[anchor.b]!,
          bandDepths,
        });
        return null;
      }
      cursor = anchor.y1;
      start = anchor.b + 1;
    }
    const after = footprint.y1 - cursor;
    const needAfter = minDepth.slice(start).reduce((sum, d) => sum + d, 0);
    if (needAfter > after) {
      issues.push({
        ...issue(
          'band_too_deep',
          storey.level,
          `Tầng ${storey.level}: các dải sau thang cần sâu ${needAfter} cm, còn ${after} cm.`,
          [],
        ),
        shortCm: needAfter - after,
        bandDepths,
      });
      return null;
    }
    if (start < depths.length) spread(depths, start, depths.length, after - needAfter);
    else depths[anchors.at(-1)!.b] = depths[anchors.at(-1)!.b]! + after;
  } else if (measure) {
    if (stairBandIndex >= 0) {
      measure({
        pre: minDepth.slice(0, stairBandIndex).reduce((s, d) => s + d, 0),
        stair: minDepth[stairBandIndex]!,
        post: minDepth.slice(stairBandIndex + 1).reduce((s, d) => s + d, 0),
        bandDepths,
        ...(wellBandIndex >= 0 && wellBandIndex < stairBandIndex
          ? {
              wellPre: minDepth.slice(0, wellBandIndex).reduce((s, d) => s + d, 0),
              wellMin: minDepth[wellBandIndex]!,
            }
          : {}),
      });
    }
    return null;
  } else if (window && stairBandIndex >= 0) {
    const pre = minDepth.slice(0, stairBandIndex).reduce((s, d) => s + d, 0);
    const post = minDepth.slice(stairBandIndex + 1).reduce((s, d) => s + d, 0);
    const extra = depth - pre - post - minDepth[stairBandIndex]!;
    if (extra < 0) {
      issues.push({
        ...issue(
          'band_too_deep',
          storey.level,
          `Tầng ${storey.level}: các dải cần sâu ${depth - extra} cm, khối nhà sâu ${depth} cm.`,
          [],
        ),
        shortCm: -extra,
        bandDepths,
      });
      return null;
    }
    // Phần dư chia như thường, rồi kéo mép thang vào khoảng cho phép bằng cách chuyển phần dư trước ↔ sau thang.
    spread(depths, 0, depths.length, extra);
    const y0 = depths.slice(0, stairBandIndex).reduce((s, d) => s + d, 0);
    const target = Math.min(Math.max(y0, window.lo), window.hi);
    if (target !== y0) {
      depths.splice(0, depths.length, ...minDepth);
      depths[stairBandIndex] = minDepth[stairBandIndex]!;
      spread(depths, 0, stairBandIndex, target - pre);
      if (stairBandIndex + 1 < depths.length) {
        spread(
          depths,
          stairBandIndex + 1,
          depths.length,
          depth - target - minDepth[stairBandIndex]! - post,
        );
      } else {
        depths[stairBandIndex] = depth - target;
      }
    }
    // Dải giếng trời giữa nhà: tầng trên neo giếng của mình vào đoạn giếng tầng 1, nên mép trước giếng tầng 1 phải ≥ phần
    // trước giếng sâu nhất của các tầng. Phần dư nằm ở dải giếng (hay giữa giếng và thang) chuyển lên các dải trước giếng
    // — dải giếng không mỏng hơn dải giếng sâu nhất tầng trên. Mẫu C viết tay cho đầu bài demo: tầng 1 dư 1,8 m mà phần
    // dư dồn vào dải giếng, tầng 3 thiếu 1,1 m trước giếng.
    if (window.wellLo !== undefined && wellBandIndex >= 0 && wellBandIndex < stairBandIndex) {
      let need = window.wellLo - depths.slice(0, wellBandIndex).reduce((s, d) => s + d, 0);
      let moved = 0;
      for (let b = stairBandIndex - 1; b >= wellBandIndex && need > 0; b -= 1) {
        const floor =
          b === wellBandIndex ? Math.max(minDepth[b]!, window.wellMin ?? 0) : minDepth[b]!;
        const take = Math.max(0, Math.min(need, depths[b]! - floor));
        depths[b] = depths[b]! - take;
        need -= take;
        moved += take;
      }
      if (moved > 0) spread(depths, 0, wellBandIndex, moved);
    }
  } else {
    const total = minDepth.reduce((s, d) => s + d, 0);
    if (total > depth) {
      issues.push({
        ...issue(
          'band_too_deep',
          storey.level,
          `Tầng ${storey.level}: các dải cần sâu ${total} cm, khối nhà sâu ${depth} cm.`,
          [],
        ),
        shortCm: total - depth,
        bandDepths,
      });
      return null;
    }
    spread(depths, 0, depths.length, depth - total);
  }
  function spread(target: number[], from: number, to: number, extra: number) {
    if (to <= from) return;
    for (let i = from; i < to && extra > 0; i += 1) {
      const add = Math.floor(Math.min(givenDepth[i]! - target[i]!, extra) / stepCm) * stepCm;
      if (add <= 0) continue;
      target[i] = target[i]! + add;
      extra -= add;
    }
    const ws = bands.slice(from, to).map(priorityOf);
    const allZero = ws.every((w) => w === 0);
    const weight = allZero ? ws.map(() => 1) : ws;
    const sum = weight.reduce((s, w) => s + w, 0);
    let left = extra;
    for (let i = from; i < to; i += 1) {
      const add = Math.floor((extra * weight[i - from]!) / sum / stepCm) * stepCm;
      target[i] = target[i]! + add;
      left -= add;
    }
    // Phần lẻ do làm tròn vào dải ưu tiên cao nhất — không bao giờ vào dải thang (ô thang tầng 1 là mốc tầng trên).
    const best = weight.indexOf(Math.max(...weight));
    target[from + best] = target[from + best]! + left;
  }

  // ── Dựng chữ nhật và cây ───────────────────────────────────────────────────────────────────
  const rects = new Map<string, Rect>();
  const nodes: AiPlanTree['nodes'] = [];
  let unbuilt = 0;
  const leafId = (raw: string): string => {
    if (raw === OPEN_CELL) return `unbuilt_${(unbuilt += 1)}`;
    return raw === input.stairToken ? stairId : raw;
  };
  let nodeN = 0;
  const node = () => `n${storey.level}_${(nodeN += 1)}`;
  /** Chuỗi nhát cắt: `parts` (mã + kích thước) chia đoạn [lo, hi] theo trục `axis`. */
  const chain = (axis: 'x' | 'y', lo: number, parts: { id: string; size: number }[]): string => {
    if (parts.length === 1) return parts[0]!.id;
    const id = node();
    const at = lo + parts[0]!.size;
    nodes.push({ id, cut: axis, at, a: parts[0]!.id, b: chain(axis, at, parts.slice(1)) });
    return id;
  };
  const underStair: { over: { room: string; up: '+y' | '-y' } | null; union: Rect | null } = {
    over: null,
    union: null,
  };
  let y = footprint.y0;
  const bandIds = bands.map((band, b) => {
    const d = depths[b]!;
    let x = footprint.x0;
    const cellIds = band.cells.map((cell, c) => {
      const w = widths[b]![c]!;
      let id: string;
      if (cell.stack) {
        const min = stackNeeds(cell, w);
        const need = [...min];
        // Ô con cuối nhận phần dư chiều sâu của dải.
        need[need.length - 1] = d - need.slice(0, -1).reduce((s, v) => s + v, 0);
        const wellAt = cell.stack.findIndex((part) => typeOf(part.id) === 'light_well');
        const anchor =
          wellAt >= 0
            ? wells.find(
                (r) =>
                  Math.abs(r.x0 - x) <= stepCm &&
                  Math.abs(r.x1 - (x + w)) <= stepCm &&
                  r.y0 >= y &&
                  r.y1 <= y + d,
              )
            : undefined;
        if (anchor) {
          const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
          const front = min.slice(0, wellAt);
          const back = min.slice(wellAt + 1);
          const room = { front: anchor.y0 - y, back: y + d - anchor.y1 };
          const fits =
            anchor.y1 - anchor.y0 >= min[wellAt]! &&
            sum(front) <= room.front &&
            sum(back) <= room.back &&
            (front.length > 0 || room.front === 0) &&
            (back.length > 0 || room.back === 0);
          if (fits) {
            front.forEach((v, i) => (need[i] = v));
            back.forEach((v, i) => (need[wellAt + 1 + i] = v));
            if (front.length) need[wellAt - 1]! += room.front - sum(front);
            need[wellAt] = anchor.y1 - anchor.y0;
            if (back.length) need[need.length - 1]! += room.back - sum(back);
          }
        }
        let yy = y;
        const parts = cell.stack.map((s, i) => {
          const leaf = leafId(s.id);
          if (!leaf.startsWith('unbuilt_'))
            rects.set(leaf, { x0: x, y0: yy, x1: x + w, y1: yy + need[i]! });
          yy += need[i]!;
          return { id: leaf, size: need[i]! };
        });
        if (underStack(cell)) {
          const other = parts.find((part) => part.id !== stairId)!.id;
          const stairFirst = parts[0]!.id === stairId;
          // Bậc 1 ở đầu thấp — xa phòng dưới gầm; vế đi lên về phía phòng ấy.
          underStair.over = { room: other, up: stairFirst ? '+y' : '-y' };
          underStair.union = { x0: x, y0: y, x1: x + w, y1: y + d };
        }
        id = chain('y', y, parts);
      } else {
        id = leafId(cell.id ?? OPEN_CELL);
        const stairH = stairBelow ? stairBelow.y1 - stairBelow.y0 : 0;
        if (stairBelow && id === stairId && d > stairH && input.landingId) {
          // Dải thang tầng trên sâu hơn ô thang tầng 1 (ô xếp chồng cạnh thang cần sâu hơn): ô thang giữ đúng chiều dài
          // tầng 1, phần dư phía sau thành sảnh — kéo dài ô thang là lệch thang giữa các tầng (phát lại 93d212a2: ô
          // thang tầng 4 dài 5,5 m trên 4,7 m của tầng 1, cổng bác «lệch 80 cm»).
          const landing = input.landingId(storey.level);
          rects.set(id, { x0: x, y0: y, x1: x + w, y1: y + stairH });
          rects.set(landing, { x0: x, y0: y + stairH, x1: x + w, y1: y + d });
          id = chain('y', y, [
            { id, size: stairH },
            { id: landing, size: d - stairH },
          ]);
          fixes.push(
            `Tầng ${storey.level}: dải thang sâu hơn ô thang tầng 1 — phần dư sau ô thang thành sảnh «${landing}».`,
          );
        } else if (!id.startsWith('unbuilt_'))
          rects.set(id, { x0: x, y0: y, x1: x + w, y1: y + d });
      }
      x += w;
      return { id, size: w };
    });
    y += d;
    return { id: chain('x', footprint.x0, cellIds), size: d };
  });
  const root = chain('y', footprint.y0, bandIds);
  // Cây một lá (tầng một phòng) vẫn cần gốc: không xảy ra với nhà thật — báo như dải quá sâu.
  if (nodes.length === 0 && !root) return null;
  return {
    level: storey.level,
    rects,
    ...(underStair.union ? { stairUnion: underStair.union } : {}),
    tree: {
      variant_label: null,
      rationale: 'Bộ giải dải dựng từ dải của mô hình.',
      footprint: [footprint.x0, footprint.y0, footprint.x1, footprint.y1],
      nodes: nodes.length ? rootFirst(nodes, root) : nodes,
      also: [],
      doors: [],
      stair: rects.has(stairId)
        ? underStair.over
          ? { room: stairId, up: underStair.over.up, over: underStair.over.room }
          : { room: stairId, up: '+y' }
        : null,
      no_window: [],
    },
  };
}

/** Cây ghi nút gốc trước — cổng đọc nút đầu tiên không làm con của nút nào. */
function rootFirst(nodes: AiPlanTree['nodes'], root: string): AiPlanTree['nodes'] {
  const head = nodes.find((n) => n.id === root);
  return head ? [head, ...nodes.filter((n) => n.id !== root)] : nodes;
}

function issue(
  code: BandIssue['code'],
  level: number,
  message: string,
  rooms: string[],
): BandIssue {
  return { code, level, message, rooms };
}
