/**
 * Kiểm máy mặt bằng do mô hình đề xuất — trước khi vẽ, trước khi lưu.
 *
 * Đây là nửa còn lại của quyết định T15. Mô hình khai NỘI DUNG bản vẽ dưới dạng dữ liệu chính
 * là để chỗ này kiểm được: phòng thiếu, phòng chồng nhau, phòng không tới được, mặt sàn còn lỗ,
 * diện tích khai lệch chữ nhật — máy bắt được và bắt mô hình sửa. Một tệp SVG thì chỉ đếm được ký
 * tự.
 *
 * ── Sáu phép kiểm đã XOÁ ngày 12/09/2026 (T23) ─────────────────────────────────────────
 *
 * `wall_duplicate_id` · `wall_degenerate` · `opening_wall_missing` · `opening_outside_wall` ·
 * `window_on_partition` · `room_edge_uncovered`. Cả sáu tồn tại CHỈ VÌ mô hình khai tường, và từ
 * T23 thì tường do chương trình suy từ chữ nhật phòng (`plan-geometry.ts`) — nên chúng không còn
 * đối tượng để bắt: tường và phòng cùng một nguồn, không thể lệch nhau. Hai phép còn có ý nghĩa
 * thì chuyển sang không gian CẠNH PHÒNG và nằm ở `plan-geometry.ts`: `opening_overlap` và
 * `window_on_interior_edge` (tên cũ là `window_on_partition`).
 *
 * `room_edge_uncovered` là phép mất đi đáng nói nhất: nó bắt đúng lúc tường mô hình khai không
 * trùng phòng mô hình khai, tức mô hình tự mâu thuẫn với chính nó. Xoá nó không làm yếu bộ kiểm vì
 * mâu thuẫn ấy nay KHÔNG DIỄN ĐẠT ĐƯỢC.
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
  emptyCells,
  overlapArea,
  pointInPolygon,
  polygonArea,
  rectArea,
  rectCentre,
  rectContainsRect,
  toPt,
  toRect,
  type Pt,
  type Rect,
} from './draw/geometry';
import { prepareWalls, type WallGeom } from './draw/walls';
import type { BalconyDemand, DemandedSpace, ElevatorDemand } from './brief-demands';
import { mandatoryKey, mandatoryViolations, type MandatoryContext } from './mandatory';
import {
  allowedBox,
  checkBalconyDemand,
  checkElevatorLayout,
  checkElevatorStack,
  checkSoftDemands,
} from './plan-demands';

/** Sai lệch cho phép khi hỏi "mặt tường này có trùng cạnh phòng không". */
export const EDGE_TOLERANCE_CM = 1;

/** Lõi thang giữa hai tầng lệch quá mức này thì không còn là một lõi. */
export const STAIR_ALIGN_CM = 20;

/** Diện tích khai lệch chữ nhật quá CẢ HAI ngưỡng này mới tính là sai. */
export const AREA_TOLERANCE_RATIO = 0.1;
export const AREA_TOLERANCE_M2 = 1;

/** Hai phòng chồng nhau dưới mức này coi như chỉ chạm mép do làm tròn. */
export const OVERLAP_TOLERANCE_CM2 = 100;

/**
 * Cạnh ngắn tối thiểu để một khoảng chưa xếp phòng được coi là LỖ, không phải khe tường (G1).
 *
 * 60 cm nằm giữa hai thứ không chồng nhau: bức tường dày nhất của `kb/construction_norms.yaml`
 * là 22 cm, còn kích thước tối thiểu hẹp nhất trong `rules/` là 85 cm (kho, đo trên hồ sơ thật).
 * Nên không khe tường nào vượt ngưỡng này, và không khoảng nào có thể thành phòng mà lọt dưới nó.
 */
export const POCKET_MIN_SIDE_CM = 60;

/** Tổng diện tích lỗ cho phép trên một tầng trước khi coi là mặt sàn chưa lấp kín (G1), m². */
export const POCKET_MAX_TOTAL_M2 = 1;

export type IssueLevel = 'blocking' | 'finding';

export interface PlanIssue {
  /** Mã ngắn không dấu — màn hình và kiểm thử bám vào mã, không bám vào câu chữ. */
  code: string;
  level: IssueLevel;
  /** Phần tử liên quan: mã phòng, mã tường, mã cửa. */
  ref?: string;
  /** Câu tiếng Việt CỤ THỂ: nêu đúng phần tử và đúng con số, để lượt sửa có cái mà bám. */
  message: string;
  /**
   * Tham số của câu lỗi dạng dữ liệu — để dựng ghi chú «tránh những chỗ này» bằng TIẾNG ANH cho
   * lượt lấy mẫu lại (T39) mà không phải bóc số ra khỏi câu tiếng Việt. Vắng ở các phép kiểm cũ;
   * lời dẫn khi đó dùng câu mặc định theo `code` và `ref`.
   */
  params?: Record<string, string | number>;
}

export interface PlanCheckResult {
  blocking: PlanIssue[];
  findings: PlanIssue[];
}

/**
 * Phần đòi hỏi của đầu bài mà cổng mặt bằng kiểm được — thứ chỉ hiện ra khi đã có TOẠ ĐỘ (T65).
 *
 * Bước chương trình không gian đã kiểm «có hay không có» và «đủ mấy cái» (`ai/program.ts`). Còn
 * «chồng khít không», «nằm ở mặt nào», «đua ra bao xa» thì chỉ ở đây mới trả lời được.
 */
export interface PlanDemands {
  elevator: ElevatorDemand | null;
  balcony: BalconyDemand | null;
  /**
   * Bảng «câu trả lời nào đòi không gian nào». Ở đây chỉ dùng phần MỀM (`blocking: false`) —
   * phần cứng đã bị bác từ cổng chương trình không gian, nhắc lại là hai dòng nói cùng một chuyện.
   */
  spaces: readonly DemandedSpace[];
}

export interface PlanCheckInput {
  plan: AiFloorPlan;
  /** Chương trình không gian mà mặt bằng phải bám theo — nguồn của danh sách phòng. */
  program: AiSpaceProgram;
  /** Hình bao XÂY ĐƯỢC theo đầu bài, cm. Thiếu thì bỏ qua phép kiểm "trong lô đất". */
  buildable?: Rect | null;
  /** Mã loại phòng KHÔNG bắt buộc có cửa: ngoài trời và ô trống (nhóm của room_vocabulary). */
  doorExemptTypes: ReadonlySet<string>;
  /**
   * Mã loại phòng GIAO THÔNG ĐỨNG — nhóm `circulation` của `kb/room_vocabulary.yaml`.
   *
   * Cần cho cổng G2: ô thang trong `stairs[]` và phòng thang trong `rooms[]` mô tả CÙNG một chỗ
   * và chữ nhật của chúng trùng khít nhau một cách hợp lệ. Không có danh sách này thì G2 báo
   * «thang chồng lên phòng» trên mọi mặt bằng đúng. Là DỮ LIỆU vì cùng lý lẽ với `doorExemptTypes`.
   */
  verticalTypes: ReadonlySet<string>;
  /**
   * Có chạy hai phép kiểm LIÊN TẦNG không — thang chồng khít và đi tới được từ cửa ngoài tầng 1.
   *
   * `false` khi kiểm MỘT tầng lẻ trong luồng theo tầng (T38): tầng 2 đứng một mình thì nó là «tầng
   * thấp nhất» và không có cửa ra ngoài, nên G3 sẽ báo cả tầng không có lối vào. Phép đi lại trong
   * một tầng do `ai/tree/` kiểm (xuất phát từ ô thang); hai phép này chạy lại khi đã ghép đủ tầng.
   * Mặc định `true`.
   */
  crossLevel?: boolean;
  /**
   * Yêu cầu gia chủ đã khai ở đầu bài (T65). Vắng = không kiểm phần ấy, đúng hành vi trước T65 —
   * mốc đúc cũ đọc lại vẫn phải qua được cổng.
   */
  demands?: PlanDemands | null;
  /**
   * Luật bố trí BẮT BUỘC của Haan (T71, `rules/nvg-mandatory.yaml`, `ai/mandatory.ts`). Vắng = không
   * kiểm, đúng hành vi trước T71 — tuyến xem lại artifact cũ cố ý không truyền.
   */
  mandatory?: MandatoryContext | null;
  /**
   * Vi phạm luật bắt buộc được HẠ xuống ghi chú, khoá `mã|phòng` (tuyến sửa của kỹ sư): chỉ những vi
   * phạm ĐÃ CÓ trong phương án đang lưu — phương án cũ không thành không sửa nổi vì luật ra đời sau,
   * nhưng một thao tác sửa không được TẠO vi phạm mới.
   */
  relaxMandatory?: ReadonlySet<string>;
}

export function checkPlan(input: PlanCheckInput): PlanCheckResult {
  const issues: PlanIssue[] = [];
  const add = (
    level: IssueLevel,
    code: string,
    message: string,
    ref?: string,
    params?: Record<string, string | number>,
  ): void => {
    issues.push({ code, level, message, ...(ref ? { ref } : {}), ...(params ? { params } : {}) });
  };

  checkAgainstProgram(input, add);
  for (const level of input.plan.levels) {
    checkLevel(level, input, add);
  }
  if (input.crossLevel !== false) {
    checkStairs(input.plan, add);
    // Hai phép kiểm của T65 xét CẢ NHÀ: «mọi tầng đều có» và «ở mặt nào» không trả lời được khi
    // chỉ cầm một tầng lẻ, nên chúng đi cùng nhóm liên tầng với thang và đường đi.
    checkElevatorStack(input.plan, input.demands?.elevator ?? null, add);
    checkElevatorLayout(input.plan, input.demands?.elevator ?? null, add);
    checkBalconyDemand(input.plan, input.demands?.balcony ?? null, add);
    checkSoftDemands(input.plan, input.demands?.spaces ?? [], add);
    checkReachability(input, add);
    if (input.mandatory) {
      for (const found of mandatoryViolations(input.plan.levels, input.mandatory)) {
        const relaxed =
          found.level === 'blocking' && input.relaxMandatory?.has(mandatoryKey(found));
        issues.push(relaxed ? { ...found, level: 'finding' } : found);
      }
    }
  }

  return {
    blocking: issues.filter((issue) => issue.level === 'blocking'),
    findings: issues.filter((issue) => issue.level === 'finding'),
  };
}

type Add = (level: IssueLevel, code: string, message: string, ref?: string) => void;

/**
 * (2) Mặt bằng phải xếp ĐÚNG danh sách phòng của chương trình, đúng tầng, không thừa không thiếu.
 *
 * PHÒNG GHÉP (`also`, T23): một chữ nhật phục vụ nhiều mã phòng của chương trình — bếp thông
 * phòng ăn, khách có bàn thờ. Đo trên hồ sơ thật 12/09/2026: 3 trong 6 mặt bằng của hai dự án
 * NVO có phòng ghép. Không có đường này thì mô hình chỉ còn hai lựa chọn, và cả hai đều sai: bỏ
 * một mã phòng (bị `room_missing` chặn), hoặc dựng một vách không tồn tại để có đủ phòng — tức
 * bố cục bị hợp đồng bóp méo.
 *
 * Mã trong `also` tính là ĐÃ XẾP, nên không sinh `room_missing`; nhưng vẫn phải tồn tại trong
 * chương trình, vẫn phải thuộc đúng tầng, và vẫn không được trùng với một chữ nhật khác. Riêng
 * `room_wrong_type` thì cố ý KHÔNG áp: phòng ghép mang loại của phần chính («bếp ăn» là `kitchen`
 * với `also: [dining]`), nên đòi loại khớp là đòi một điều tự mâu thuẫn.
 */
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

      for (const merged of room.also ?? []) {
        if (merged === room.id) {
          add(
            'blocking',
            'room_merge_self',
            `Phòng "${room.id}" khai chính nó trong "also" — trường này dành cho mã phòng KHÁC mà chữ nhật này cũng phục vụ.`,
            room.id,
          );
          continue;
        }
        if (seen.has(merged)) {
          add(
            'blocking',
            'room_duplicate',
            `Phòng "${merged}" được khai hai lần: vừa là phòng riêng vừa ghép vào "${room.id}".`,
            merged,
          );
          continue;
        }
        seen.add(merged);
        const mergedSpace = wanted.get(merged);
        if (!mergedSpace) {
          add(
            'blocking',
            'room_unknown',
            `Phòng "${merged}" ghép vào "${room.id}" nhưng không có trong chương trình không gian.`,
            merged,
          );
          continue;
        }
        if (mergedSpace.level !== level.level) {
          add(
            'blocking',
            'room_wrong_level',
            `Phòng "${merged}" thuộc tầng ${mergedSpace.level} theo chương trình không gian nhưng được ghép vào "${room.id}" ở tầng ${level.level}.`,
            merged,
          );
        }
      }

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

  checkRoomRects(level, input, where, add);
  checkOverlaps(level, input, where, add);
  checkDoorsPerRoom(level, walls, input, where, add);
  checkFloorCoverage(level, where, add);
  checkVerticalElements(level, where, add);
  checkRoomNames(level, where, add);
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
    if (input.buildable) {
      // Ban công ĐUA RA NGOÀI RANH là thứ gia chủ tự khai, nên nó không phải lỗi — nhưng chỉ ban
      // công, chỉ ở mặt đã khai, và chỉ xa đúng mức đã khai. Phòng khác ra ngoài vẫn là lỗi, và
      // ban công đua quá mức cũng vậy: nới vô điều kiện thì phép kiểm này mất hết tác dụng.
      const box = allowedBox(
        input.buildable,
        input.demands?.balcony ?? null,
        room.type,
        level.level,
      );
      if (!rectContainsRect(box, rect, EDGE_TOLERANCE_CM)) {
        add(
          'blocking',
          'room_outside_buildable',
          box === input.buildable
            ? `Phòng "${room.id}" ở ${where} nằm ngoài phần đất được phép xây theo đầu bài.`
            : `Ban công "${room.id}" ở ${where} đua ra xa hơn mức đầu bài khai.`,
          room.id,
        );
      }
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

/**
 * (4) và cổng **G2** — không phần tử nào được chồng lên nhau, xét MỌI LOẠI CẶP.
 *
 * Trước 12/09/2026 phép này chỉ xét phòng ↔ phòng, nên một ô thang đặt trùng lên phòng ngủ vẫn
 * ĐẠT và tờ vẽ ra một cái thang mọc giữa giường.
 *
 * Hai ngoại lệ là THẬT, không phải nới tay:
 *  · ô thang trong `stairs[]` và phòng thang trong `rooms[]` mô tả CÙNG một chỗ — chữ nhật trùng
 *    khít nhau là cách hợp đồng diễn đạt «đây là chỗ đặt thang», nên chỉ báo lỗi khi ô thang
 *    chồng lên một phòng KHÔNG thuộc nhóm giao thông đứng (`verticalTypes`);
 *  · ô trống `void` nằm ĐÚNG trên ô thang hoặc trên giếng trời là định nghĩa của nó — lỗ thông
 *    tầng thì phải trùng chỗ thông. Nên void chỉ xung đột với phòng trong nhà, không xung đột
 *    với thang và không xung đột với phòng ngoài trời (`doorExemptTypes` đã là nhóm ấy).
 */
function checkOverlaps(
  level: AiFloorPlanLevel,
  input: PlanCheckInput,
  where: string,
  add: Add,
): void {
  const rooms = level.rooms.map((room) => ({
    id: room.id,
    rect: toRect(room.rect),
    type: room.type,
  }));
  const stairs = (level.stairs ?? []).map((stair) => ({ id: stair.id, rect: toRect(stair.rect) }));
  const voids = (level.voids ?? []).map((hole) => ({ id: hole.id, rect: toRect(hole.rect) }));

  const clash = (
    code: string,
    first: { id: string; rect: Rect },
    second: { id: string; rect: Rect },
    what: string,
  ): void => {
    const area = overlapArea(first.rect, second.rect);
    if (area <= OVERLAP_TOLERANCE_CM2) return;
    add(
      'blocking',
      code,
      `Ở ${where}, ${what} chồng lên nhau ${(area / 10_000).toFixed(1)} m².`,
      first.id,
    );
  };

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const first = rooms[i];
      const second = rooms[j];
      if (!first || !second) continue;
      clash('room_overlap', first, second, `phòng "${first.id}" và "${second.id}"`);
    }
  }

  for (const stair of stairs) {
    for (const room of rooms) {
      if (input.verticalTypes.has(room.type)) continue;
      clash('stair_overlaps_room', stair, room, `ô thang "${stair.id}" và phòng "${room.id}"`);
    }
  }

  for (const hole of voids) {
    for (const room of rooms) {
      if (input.verticalTypes.has(room.type) || input.doorExemptTypes.has(room.type)) continue;
      clash('void_overlaps_room', hole, room, `ô trống "${hole.id}" và phòng "${room.id}"`);
    }
    for (const other of voids) {
      if (other.id <= hole.id) continue;
      clash('void_overlaps_void', hole, other, `ô trống "${hole.id}" và "${other.id}"`);
    }
  }
}

/**
 * Cổng **G1** — mặt sàn phải được LẤP KÍN.
 *
 * Trước 12/09/2026 chiều duy nhất được kiểm là «phòng nằm trong hình bao»; không gì đo chiều
 * ngược lại, nên một mặt bằng có lỗ 30 m² giữa nhà vẫn ĐẠT. CLAUDE.md 8.8 điểm 6 thì nói rõ cây
 * chia không gian LẤP KÍN mặt sàn — muốn để trống thì khai một ô `void`.
 *
 * Phép đo không so hai con số tổng, vì so tổng thì không phân biệt được LỖ với BỀ DÀY TƯỜNG:
 * `rect` của phòng là kích thước lọt lòng, nên một tầng đúng đắn vẫn có 10 trong 60 m² chưa phủ
 * (đo trên fixture nhà phố) và toàn bộ chỗ ấy là tường. Thay vào đó: nén toạ độ ra từng ô chưa
 * phủ, rồi chỉ tính những ô mà CẠNH NGẮN vượt `POCKET_MIN_SIDE_CM` — không khe tường nào rộng
 * tới mức đó, và không khoảng nào hẹp hơn thế mà thành phòng được.
 */
function checkFloorCoverage(level: AiFloorPlanLevel, where: string, add: Add): void {
  const outline = level.outline.map(toPt);
  const covers = [
    ...level.rooms.map((room) => toRect(room.rect)),
    ...(level.stairs ?? []).map((stair) => toRect(stair.rect)),
    ...(level.voids ?? []).map((hole) => toRect(hole.rect)),
  ];
  const pockets = emptyCells(outline, covers, EDGE_TOLERANCE_CM).filter(
    (cell) => cell.thinnestCm > POCKET_MIN_SIDE_CM,
  );
  if (pockets.length === 0) return;

  const totalM2 = pockets.reduce((sum, cell) => sum + rectArea(cell.rect), 0) / 10_000;
  if (totalM2 <= POCKET_MAX_TOTAL_M2) return;

  const biggest = pockets.reduce((best, cell) =>
    rectArea(cell.rect) > rectArea(best.rect) ? cell : best,
  );
  const outlineM2 = Math.abs(polygonArea(outline)) / 10_000;
  add(
    'blocking',
    'floor_not_covered',
    `Ở ${where} còn ${totalM2.toFixed(1)} m² trong hình bao ${outlineM2.toFixed(1)} m² không thuộc phòng, ô thang hay ô trống nào — khoảng lớn nhất là ${(rectArea(biggest.rect) / 10_000).toFixed(1)} m² tại x ${Math.round(biggest.rect.x0)}–${Math.round(biggest.rect.x1)}, y ${Math.round(biggest.rect.y0)}–${Math.round(biggest.rect.y1)} cm. Xếp phòng vào đó, hoặc khai một ô trống.`,
  );
}

/**
 * Cổng **G4** — ô thang và ô trống phải có hình học dùng được.
 *
 * Hôm nay một ô thang có cạnh ≤ 0 thì bộ vẽ KHÔNG vẽ gì và KHÔNG ghi ghi chú nào: hỏng im lặng,
 * và người đọc tờ vẽ thấy một mặt bằng không có thang mà không có chữ nào nói vì sao.
 */
function checkVerticalElements(level: AiFloorPlanLevel, where: string, add: Add): void {
  const outline = level.outline.map(toPt);

  const inspect = (id: string, values: readonly number[], code: string, what: string): void => {
    const rect = toRect(values);
    if (rect.x1 - rect.x0 <= 0 || rect.y1 - rect.y0 <= 0) {
      add('blocking', `${code}_rect_empty`, `${what} "${id}" ở ${where} có chữ nhật rỗng.`, id);
      return;
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
        `${code}_outside_outline`,
        `${what} "${id}" ở ${where} nằm lấn ra ngoài hình bao khối xây của tầng.`,
        id,
      );
    }
  };

  for (const stair of level.stairs ?? []) inspect(stair.id, stair.rect, 'stair', 'Ô thang');
  for (const hole of level.voids ?? []) inspect(hole.id, hole.rect, 'void', 'Ô trống');
}

/**
 * Diện tích ghi trên phòng và tên phòng là thứ CHƯƠNG TRÌNH gán (mô hình không còn khai toạ độ hay
 * nhãn từ T37/T48), nên lệch diện tích hay trùng tên là lỗi của chính chương trình — tự sửa, không
 * chặn phương án (Haan 25/09/2026: «hai phần này có thể sửa dễ dàng, ko nên dừng»):
 *  · diện tích khai lệch chữ nhật quá dung sai của `room_area_mismatch` → ghi lại theo chữ nhật;
 *  · hai phòng cùng tầng trùng nhãn (hai giếng trời cùng mang «Giếng trời») → đánh số từ phòng thứ hai.
 * Chạy TRƯỚC `checkPlan`; hai cổng ấy vẫn giữ làm lưới an toàn cho bản vẽ đọc lại từ kho.
 */
export function restateRoomFacts<
  T extends {
    id: string;
    rect: AiFloorPlanLevel['rooms'][number]['rect'];
    area_m2: number;
    label?: string | null;
  },
>(rooms: readonly T[], where: string): { rooms: T[]; notes: { code: string; message: string }[] } {
  const notes: { code: string; message: string }[] = [];
  const key = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();
  const taken = new Set(
    rooms
      .map((room) => room.label?.trim())
      .filter(Boolean)
      .map((l) => key(l!)),
  );
  const seen = new Map<string, number>();
  const out = rooms.map((room) => {
    let next = room;
    const rect = toRect(room.rect);
    const measured = rectArea(rect) / 10_000;
    const gap = Math.abs(measured - room.area_m2);
    if (measured > 0 && gap > AREA_TOLERANCE_M2 && gap > measured * AREA_TOLERANCE_RATIO) {
      const area = Math.round(measured * 100) / 100;
      notes.push({
        code: 'room_area_restated',
        message: `Phòng "${room.id}" ở ${where} ghi ${room.area_m2} m², chữ nhật đo được ${area} m² — chương trình ghi lại theo số đo.`,
      });
      next = { ...next, area_m2: area };
    }
    const label = room.label?.trim();
    if (label) {
      const count = (seen.get(key(label)) ?? 0) + 1;
      seen.set(key(label), count);
      if (count > 1) {
        let n = count;
        while (taken.has(key(`${label} ${n}`))) n += 1;
        const renamed = `${label} ${n}`;
        taken.add(key(renamed));
        notes.push({
          code: 'room_label_numbered',
          message: `Ở ${where}, phòng "${room.id}" trùng tên "${label}" với phòng khác — chương trình đổi thành "${renamed}".`,
        });
        next = { ...next, label: renamed };
      }
    }
    return next;
  });
  return { rooms: out, notes };
}

/**
 * Cổng **G5** — không hai phòng nào trên cùng một tầng mang CÙNG một tên.
 *
 * Hồ sơ P1 có hai phòng cùng tên «P NGỦ 3» trên một tầng, và đúng cặp ấy mang hai nhãn diện tích
 * sai 30%. Trùng tên không gây ra sai số, nhưng nó đi kèm: một tờ vẽ mà người đọc không phân biệt
 * được hai phòng thì mọi câu hỏi về một trong hai đều không trả lời được.
 *
 * Chỉ so nhãn mô hình KHAI TƯỜNG MINH. Nhãn rỗng thì bộ vẽ lấy tên theo mã phòng
 * (`kb/room_vocabulary.yaml`), nên hai phòng ngủ không nhãn đều ra «Phòng ngủ» — đó là việc của
 * bộ vẽ (đánh số), không phải mâu thuẫn trong dữ liệu mô hình khai.
 */
function checkRoomNames(level: AiFloorPlanLevel, where: string, add: Add): void {
  const seen = new Map<string, string>();
  for (const room of level.rooms) {
    const label = room.label?.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!label) continue;
    const first = seen.get(label);
    if (first) {
      add(
        'blocking',
        'room_name_duplicate',
        `Ở ${where}, phòng "${first}" và "${room.id}" cùng mang nhãn "${room.label?.trim()}" — hai phòng trên một tầng phải phân biệt được bằng tên.`,
        room.id,
      );
      continue;
    }
    seen.set(label, room.id);
  }
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
  const served = new Set<string>();
  for (const link of doorLinks(level, walls)) {
    for (const id of link.rooms) served.add(id);
  }

  for (const room of level.rooms) {
    if (served.has(room.id)) continue;
    if (input.doorExemptTypes.has(room.type)) continue;
    add(
      'blocking',
      'room_without_door',
      `Phòng "${room.id}" ở ${where} không có cửa hay ô thông nào mở vào — không đi tới được.`,
      room.id,
    );
  }
}

/** Một cửa và những phòng nó nối. `toOutside` khi một phía không có phòng nào. */
export interface DoorLink {
  id: string;
  rooms: string[];
  toOutside: boolean;
  /** Tim lỗ cửa, toạ độ thật (cm) — bộ đo quãng đường đi qua đây (T48). */
  at: Pt;
  level: number;
}

/**
 * Phòng nào nằm hai bên mỗi cửa — nền của cả «phòng phải có cửa» và cổng G3.
 *
 * Suy từ HÌNH HỌC, không hỏi mô hình: lùi từ điểm giữa lỗ mở ra mỗi bên nửa bề dày tường cộng một
 * chút, rơi vào phòng nào thì cửa ăn vào phòng đó. Một phía không có phòng nào nghĩa là cửa mở ra
 * NGOÀI NHÀ — đó là cửa chính, cửa cổng, hoặc cửa ra ban công chưa khai thành phòng.
 */
export function doorLinks(level: AiFloorPlanLevel, walls: readonly WallGeom[]): DoorLink[] {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));
  const links: DoorLink[] = [];

  for (const door of level.doors ?? []) {
    const wall = byId.get(door.wall);
    if (!wall) continue;
    const centre: Pt = [
      wall.a[0] + wall.u[0] * (door.at + door.w / 2),
      wall.a[1] + wall.u[1] * (door.at + door.w / 2),
    ];
    const reach = wall.t / 2 + EDGE_TOLERANCE_CM;
    const sides = [1, -1].map((sign) => {
      const probe: Pt = [
        centre[0] + wall.n[0] * sign * reach,
        centre[1] + wall.n[1] * sign * reach,
      ];
      return rooms
        .filter(
          (entry) =>
            probe[0] >= entry.rect.x0 - EDGE_TOLERANCE_CM &&
            probe[0] <= entry.rect.x1 + EDGE_TOLERANCE_CM &&
            probe[1] >= entry.rect.y0 - EDGE_TOLERANCE_CM &&
            probe[1] <= entry.rect.y1 + EDGE_TOLERANCE_CM,
        )
        .map((entry) => entry.id);
    });
    const touched = [...new Set(sides.flat())];
    if (touched.length === 0) continue;
    links.push({
      id: door.id,
      rooms: touched,
      toOutside: sides.some((side) => side.length === 0),
      at: centre,
      level: level.level,
    });
  }
  return links;
}

/**
 * Cổng **G3** — mọi phòng phải ĐI TỚI ĐƯỢC từ cửa ngoài nhà.
 *
 * Trước 12/09/2026 câu hỏi duy nhất là «phòng này có cửa nào chạm vào không», nên một cụm phòng
 * biệt lập nối nhau bằng cửa mà không nối ra ngoài vẫn ĐẠT. Đây là phép duyệt đồ thị thật: đỉnh
 * là phòng, cạnh ngang là cửa, cạnh dọc là ô thang, và điểm xuất phát là phòng có cửa mở ra ngoài
 * ở TẦNG 1.
 *
 * Vì sao chỉ tầng 1 làm điểm xuất phát: một cửa ra ban công ở tầng 3 cũng «mở ra ngoài» nhưng
 * không ai vào nhà từ đó. Lấy nó làm lối vào thì một tầng trên hoàn toàn đứt khỏi thang vẫn đạt.
 *
 * Liên kết dọc suy từ `stairs[]`: chữ nhật ô thang của tầng n chạm phòng nào ở tầng n và tầng
 * n+1 thì những phòng ấy nối nhau. Đi xuyên phòng KHÔNG bị coi là lỗi ở đây — đó là tiêu chí C1
 * và C3 của bộ chấm, và `ensuite_of` của chương trình không gian nói rõ có những chỗ đi xuyên
 * phòng là hợp lệ (WC khép kín).
 *
 * Phòng ngoài trời (`doorExemptTypes`) không cần tới được: giếng trời và hộp kỹ thuật thì không
 * ai vào.
 */
function checkReachability(input: PlanCheckInput, add: Add): void {
  const graph = planGraph(input.plan);

  if (graph.entries.length === 0) {
    add(
      'blocking',
      'no_entrance',
      `Không phòng nào ở tầng ${graph.ground} có cửa mở ra ngoài nhà — mặt bằng không có lối vào.`,
    );
    return;
  }

  const reached = reachableFrom(graph, graph.entries);
  for (const [id, room] of graph.rooms) {
    if (reached.has(id)) continue;
    if (input.doorExemptTypes.has(room.type)) continue;
    add(
      'blocking',
      'room_unreachable',
      `Phòng "${id}" ở tầng ${room.level} không đi tới được từ cửa ngoài nhà: không có chuỗi cửa và thang nào dẫn tới nó.`,
      id,
    );
  }
}

/**
 * Đồ thị đi lại của cả phương án — đỉnh là phòng, cạnh ngang là cửa, cạnh dọc là ô thang.
 *
 * Xuất ra ngoài vì BỘ CHẤM cần đúng đồ thị này (tiêu chí C1, C3, C5). Dựng bản thứ hai ở đó là
 * tạo hai câu trả lời cho câu hỏi «từ đây đi tới kia được không», và chúng sẽ lệch — lúc ấy cổng
 * G3 nói mặt bằng liền mạch trong khi bộ chấm trừ điểm vì đường đi, hoặc ngược lại.
 */
export interface PlanGraph {
  /** Phòng → các phòng nối trực tiếp. Quan hệ hai chiều. */
  neighbours: Map<string, Set<string>>;
  /** Phòng ở tầng thấp nhất có cửa mở RA NGOÀI nhà — điểm xuất phát của mọi đường đi. */
  entries: string[];
  /** Số tầng thấp nhất của phương án. */
  ground: number;
  rooms: Map<string, { level: number; type: string }>;
  /** Cửa nối những phòng nào — giữ lại để bộ chấm đếm được số lần đi xuyên phòng. */
  doors: DoorLink[];
  /** Tâm từng phòng, toạ độ thật (cm) — bộ đo quãng đường đi (T48). */
  centres: Map<string, Pt>;
}

export function planGraph(plan: AiFloorPlan): PlanGraph {
  const neighbours = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    if (from === to) return;
    for (const [a, b] of [
      [from, to],
      [to, from],
    ] as const) {
      const set = neighbours.get(a) ?? new Set<string>();
      set.add(b);
      neighbours.set(a, set);
    }
  };

  const levels = [...plan.levels].sort((a, b) => a.level - b.level);
  const ground = Math.min(...levels.map((level) => level.level));
  const entries: string[] = [];
  const rooms = new Map<string, { level: number; type: string }>();
  const doors: DoorLink[] = [];

  const centres = new Map<string, Pt>();
  for (const level of levels) {
    for (const room of level.rooms) {
      rooms.set(room.id, { level: level.level, type: room.type });
      centres.set(room.id, rectCentre(toRect(room.rect)));
    }
    const walls = prepareWalls(level.walls);
    for (const door of doorLinks(level, walls)) {
      doors.push(door);
      for (const first of door.rooms) {
        for (const second of door.rooms) link(first, second);
        // Chỉ tầng thấp nhất làm lối vào: một cửa ra ban công ở tầng 3 cũng «mở ra ngoài» nhưng
        // không ai vào nhà từ đó, và lấy nó làm lối vào thì một tầng trên đứt hẳn khỏi thang vẫn đạt.
        if (door.toOutside && level.level === ground) entries.push(first);
      }
    }
  }

  for (const level of levels) {
    const above = levels.find((other) => other.level === level.level + 1);
    if (!above) continue;
    for (const stair of level.stairs ?? []) {
      const rect = toRect(stair.rect);
      const here = roomsTouching(level, rect);
      const upstairs = roomsTouching(above, rect);
      for (const from of here) for (const to of upstairs) link(from, to);
    }
  }

  return { neighbours, entries, ground, rooms, doors, centres };
}

/** Mọi phòng tới được từ một tập phòng xuất phát, có thể CẤM đi qua một số phòng. */
export function reachableFrom(
  graph: PlanGraph,
  from: readonly string[],
  forbidden: ReadonlySet<string> = new Set(),
): Set<string> {
  const reached = new Set<string>();
  const queue = from.filter((id) => !forbidden.has(id));
  while (queue.length) {
    const current = queue.pop();
    if (!current || reached.has(current)) continue;
    reached.add(current);
    for (const next of graph.neighbours.get(current) ?? []) {
      if (!reached.has(next) && !forbidden.has(next)) queue.push(next);
    }
  }
  return reached;
}

/**
 * Số phòng ÍT NHẤT phải đi qua để từ `from` tới `to` — không đếm hai đầu.
 *
 * `null` khi không có đường nào. Đây là phép đo của tiêu chí C3 («từ lối vào tới chân thang»), nên
 * nó đếm PHÒNG TRUNG GIAN, không đếm số cạnh: hai phòng thông nhau trực tiếp cho 0.
 */
export function roomsBetween(
  graph: PlanGraph,
  from: readonly string[],
  to: ReadonlySet<string>,
): number | null {
  const seen = new Set<string>(from);
  let frontier = [...from];
  let hops = 0;
  while (frontier.length) {
    if (frontier.some((id) => to.has(id))) return Math.max(0, hops - 1);
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of graph.neighbours.get(id) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
    hops += 1;
  }
  return null;
}

/** Phòng của một tầng có phần chung thật sự với một chữ nhật — dùng để nối hai tầng qua ô thang. */
function roomsTouching(level: AiFloorPlanLevel, rect: Rect): string[] {
  return level.rooms
    .filter((room) => overlapArea(toRect(room.rect), rect) > OVERLAP_TOLERANCE_CM2)
    .map((room) => room.id);
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
