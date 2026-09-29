/**
 * Đầu bài nói gì thì mặt bằng phải có nấy — phép suy TẤT ĐỊNH (T65, 22/09/2026).
 *
 * ── Vì sao tệp này tồn tại ────────────────────────────────────────────────────────────
 *
 * Haan, 22/09/2026: «mặt bằng phải theo sát yêu cầu đầu bài, không được làm thiếu hoặc sai so
 * với đầu bài».
 *
 * Từ T62 đầu bài hỏi 98 câu trong sáu mục, nhưng cổng bám đầu bài (`ai/program.ts`) chỉ đọc BA
 * nhóm: danh sách không gian gia chủ tự liệt kê, thành phần gia đình, số xe. Chín nhóm trường
 * thêm ở T62 — thang máy, ban công, lối vào, lưu trữ, nếp sinh hoạt, tín ngưỡng, kỹ thuật, dự
 * trù, mức hoàn thiện — chỉ tới được mô hình dưới dạng CÂU VĂN trong `brief/narrative.ts`.
 *
 * Câu văn là thứ mô hình bỏ qua được mà không ai biết. Một đầu bài khai «làm thang máy ngay» vẫn
 * ra mặt bằng không có thang máy, vẫn qua cổng, vẫn được chấm điểm, và vẫn đúc thành artifact
 * BẤT BIẾN. Không có phép kiểm nào hỏi lại, nên cái sai ấy không nổ ra ở đâu cả — nó chỉ hiện ra
 * khi gia chủ mở bản vẽ và không thấy thang máy đâu.
 *
 * Tệp này biến những câu trả lời ấy thành đòi hỏi mà mã kiểm được.
 *
 * ── Hai ranh giới phải giữ ───────────────────────────────────────────────────────────
 *
 * **(1) Chỉ suy từ câu ĐÃ TRẢ LỜI.** Trường bỏ trống không sinh đòi hỏi nào. «Chưa hỏi» khác
 * «trả lời không» — cùng lẽ với `yesNo()` của `brief/narrative.ts`, và đoán hộ gia chủ đúng là
 * thứ T41 cấm. Vì vậy mọi phép thử dưới đây đều so với một giá trị CỤ THỂ, không bao giờ dùng
 * `!value` hay `?? false`.
 *
 * **(2) Lời gia chủ thì bác được, suy đoán nghề thì không.** `blocking: true` bác phương án và
 * tốn thêm một lượt gọi mô hình, nên chỉ dành cho thứ gia chủ tự khai thành một không gian hay
 * một con số. Suy đoán nghề nghiệp chỉ cảnh báo (Haan, T52). Cờ ấy nằm ở `kb/brief_fidelity.yaml`,
 * không ở đây — đổi ý thì sửa tệp dữ liệu, không sửa mã.
 *
 * Tệp này KHÔNG đọc `rules/`: không một ngưỡng quy chuẩn nào đi vào đây (T14, T30, T42). Mọi con
 * số hoặc đến từ chính đầu bài, hoặc từ `kb/brief_fidelity.yaml`.
 */

import { balconySides, type AiBriefDigest } from '@nvg/shared/design';
import type { BriefFidelity } from '../kb/brief-fidelity';

/** Mặt của thửa đất — cùng tập với `site.main_entrance_side` của đầu bài. */
export type Side = 'front' | 'back' | 'left' | 'right';

const SIDES: readonly Side[] = ['front', 'back', 'left', 'right'];

/** Một không gian mà đầu bài đòi phải có. */
export interface DemandedSpace {
  /** Mã dòng trong `kb/brief_fidelity.yaml` — chỗ duy nhất nối bảng dữ liệu với mã nguồn. */
  code: string;
  /** Một trong các loại này là đủ. */
  anyOf: readonly string[];
  /** Số không gian tối thiểu. */
  count: number;
  /** Tầng bắt buộc; `null` = tầng nào cũng được. */
  level: number | null;
  /** `true` = bác phương án; `false` = chỉ cảnh báo. */
  blocking: boolean;
  /** Câu mở đầu thông điệp, lấy từ `say` của tệp dữ liệu. */
  say: string;
}

/** Thang máy — `null` khi đầu bài không khai, khai «không làm», hoặc nhà một tầng. */
export interface ElevatorDemand {
  /** `lam_ngay` lắp luôn · `chua_cho` chừa sẵn giếng để lắp sau. */
  mode: 'lam_ngay' | 'chua_cho';
  type: string;
  /**
   * Diện tích giếng tối thiểu, m² = rộng × sâu gia chủ khai theo hãng thang. `null` khi đầu bài chưa
   * khai (chỉ gặp ở đầu bài cũ — đầu bài mới bị cổng chặn trước): không đoán, bỏ phép đo cỡ.
   */
  minAreaM2: number | null;
  /** Cạnh ngắn nhất của giếng, m = số nhỏ hơn trong hai kích thước khai. `null` như trên. */
  minSideM: number | null;
  /** Bề rộng × chiều sâu lọt lòng giếng gia chủ khai, m — `null` khi chưa khai. */
  shaftWidthM: number | null;
  shaftDepthM: number | null;
  /**
   * Giếng dựng được phép dài / to tối đa bao nhiêu so với số khai (`kb/brief_fidelity.yaml`
   * `shaft_max_aspect`, `shaft_max_area_ratio`) — `0` là không kiểm. Lượt thật 913bc2ad: giếng 1,3 × 1,4
   * m mà mặt bằng dựng ra 1,6 × 6,45 m.
   */
  maxAspect: number;
  maxAreaRatio: number;
  /**
   * Nhãn ghi lên bản vẽ khi mới chừa chỗ — `null` khi lắp ngay.
   *
   * Vẽ một ô trống rồi ghi «thang máy» lên đó là nói sai trên một tờ bản vẽ kỹ thuật.
   */
  reservedLabel: string | null;
  /**
   * Kiểu bố trí so với thang bộ: `giua_long_thang_bo` · `canh_thang_bo` · `doi_dien_thang_bo` ·
   * `khac` · `rieng_biet` (cũ) · `null` khi chưa quyết. Ba kiểu đầu kiểm được trên mặt bằng
   * (`checkElevatorLayout`); `khac` chỉ tới mô hình dạng câu (`layoutNote`).
   */
  position: string | null;
  /** Mô tả của kiến trúc sư khi chọn `khac`. */
  layoutNote: string | null;
  /** Loại phòng tính là hành lang / sảnh chung (`kb/brief_fidelity.yaml`). */
  hallTypes: readonly string[];
  /** Đoạn vách chung tối thiểu, m — `kb/brief_fidelity.yaml` `layout_min_shared_m`. */
  layoutMinSharedM: number;
  /** Loại phòng là ô thang bộ (`kb/brief_fidelity.yaml` `stair_types`). */
  stairTypes: readonly string[];
}

/** Ban công — `null` khi đầu bài chưa khai gì về ban công. */
export interface BalconyDemand {
  type: string;
  /** Ban công chỉ tính từ tầng này trở lên — tầng 1 «ban công» là sân hay hiên. */
  fromLevel: number;
  /** Gia chủ khai KHÔNG làm ban công: có ban công trong đề xuất là sai đầu bài. */
  forbidden: boolean;
  /** Mặt BẮT BUỘC có ban công. Rỗng = đầu bài không ghim mặt nào. */
  sides: readonly Side[];
  /** Mặt CÓ THỂ có ban công (T91) — có hay không đều được. */
  optionalSides: readonly Side[];
  /**
   * Mặt KHÔNG được có ban công: «chỉ mặt tiền», hoặc (T91, Haan 27/09/2026) mọi mặt không nằm trong
   * `sides` lẫn `optionalSides` khi đầu bài MỚI đã khai ít nhất một mặt. Đầu bài cũ (chỉ có `sides`)
   * thì không suy ra mặt cấm: khi ấy bỏ sót một mặt chỉ là chưa nhắc tới.
   */
  forbiddenSides: readonly Side[];
  /** Tầng phải có ít nhất một ban công. Rỗng = không ghim tầng nào. */
  levels: readonly number[];
  /**
   * Độ đua ra ngoài ranh từng mặt, mét (T91 — mỗi mặt một số). Chỉ mặt đua (> 0) có mặt trong bảng.
   * `null` = không mặt nào đua.
   */
  projection: Readonly<Partial<Record<Side, number>>> | null;
  /**
   * Gia chủ khai CÓ đua ra ngoài ranh nhưng không khai đua bao nhiêu.
   *
   * Không dựng số mặc định: đua 0,6 m hay 1,4 m là hai cái nhà khác nhau, và bịa ra một con số
   * rồi vẽ lên bản vẽ kỹ thuật thì tệ hơn hẳn việc nói ra rằng còn thiếu số (CLAUDE.md 5.2).
   * Mặt bằng giữ ban công trong ranh, và chỗ này thành một câu nhắc.
   */
  projectionDistanceMissing: boolean;
}

/**
 * Bậc tam cấp ngoài cửa chính (T70) — `null` khi đầu bài không cho đủ số để vẽ.
 *
 * Hai nguồn, gia chủ khai thẳng thì thắng: `step_count` (nhiều nhà kiêng số bậc), rồi mới đến chênh
 * cốt nền chia cho cổ bậc. Không có số nào thì KHÔNG vẽ: cốt nền là thứ khảo sát đo, không đoán được,
 * và một dãy bậc bịa ra trên bản vẽ kỹ thuật tệ hơn một chỗ trống có ghi chú (CLAUDE.md 5.2).
 */
export interface EntryStepsDemand {
  /** Số bậc gia chủ khai; `null` = suy từ chênh cốt. */
  count: number | null;
  /** Cốt nền tầng 1 cao hơn tim đường, m; `null` khi không khai. */
  dropM: number | null;
}

export interface BriefDemands {
  spaces: readonly DemandedSpace[];
  elevator: ElevatorDemand | null;
  balcony: BalconyDemand | null;
  entrySteps: EntryStepsDemand | null;
  /** Diện tích chỗ để xe tối thiểu, m² — đã tính theo CỠ xe. `null` khi đầu bài không khai xe. */
  garageMinM2: number | null;
  /** Câu gửi mô hình, mỗi dòng một yêu cầu gia chủ đã khai. */
  lines: readonly string[];
  /** Nhắc nghề nghiệp — hiện cạnh mặt bằng, không bác phương án. */
  warnings: readonly string[];
}

/**
 * Suy đòi hỏi từ đầu bài đã lược danh tính.
 *
 * Hàm THUẦN: không đọc tệp, không gọi mạng, không tốn gì — gọi lại bao nhiêu lần cũng được, và
 * đó là lý do cả cổng chương trình lẫn cổng mặt bằng đều gọi thẳng nó thay vì chuyền nhau kết quả.
 */
export function briefDemands(digest: AiBriefDigest, fidelity: BriefFidelity): BriefDemands {
  const spec = fidelity.demands;
  const lines: string[] = [];
  const warnings: string[] = [];

  const elevator = elevatorDemand(digest, spec, lines, warnings, fidelity.stairTypes);
  const balcony = balconyDemand(digest, spec, lines, warnings);
  const spaces = demandedSpaces(digest, spec, lines);
  const garageMinM2 = garageMinimum(digest, fidelity);

  const entrySteps = entryStepsDemand(digest, spec, warnings);

  otherWarnings(digest, spec, elevator, warnings);

  return { spaces, elevator, balcony, entrySteps, garageMinM2, lines, warnings };
}

/** Bậc tam cấp — chỉ suy từ câu đã trả lời; «không có bậc» là câu trả lời, không phải chỗ trống. */
export function entryStepsDemand(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  warnings: string[],
): EntryStepsDemand | null {
  const entrance = digest.entrance;
  if (!entrance || entrance.steps_from_yard === false) return null;
  const count = typeof entrance.step_count === 'number' ? entrance.step_count : null;
  const dropM =
    typeof entrance.floor_above_road_m === 'number' ? entrance.floor_above_road_m : null;
  if (count !== null || (dropM !== null && dropM > 0)) return { count, dropM };
  if (entrance.steps_from_yard === true && spec.warnings.bac_tam_cap_thieu_so === true) {
    warnings.push(
      'Đầu bài khai có bậc tam cấp nhưng chưa khai cốt nền cao hơn đường bao nhiêu, cũng chưa khai số bậc — mặt bằng chưa vẽ bậc.',
    );
  }
  return null;
}

// ── Thang máy ──────────────────────────────────────────────────────────────────────────

function elevatorDemand(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  lines: string[],
  warnings: string[],
  stairTypes: readonly string[],
): ElevatorDemand | null {
  const vertical = digest.vertical;
  const answer = vertical?.elevator;
  if (answer !== 'lam_ngay' && answer !== 'chua_cho') return null;

  // Nhà một tầng thì thang máy không có nghĩa gì. `brief-completeness.ts` đã hỏi lại gia chủ
  // (`thang_may_nha_mot_tang`); ở đây chỉ cần KHÔNG đòi một ô mà cả tầng phải nhường chỗ cho.
  if (digest.floors <= 1) {
    warnings.push('Đầu bài khai có thang máy nhưng nhà chỉ một tầng — đã bỏ qua khi xếp mặt bằng.');
    return null;
  }

  // Kích thước giếng lấy đúng số gia chủ khai theo hãng thang — không đoán theo tải (Haan 25/09/2026).
  const width = vertical?.elevator_shaft_width_m ?? null;
  const depth = vertical?.elevator_shaft_depth_m ?? null;
  const sized = typeof width === 'number' && typeof depth === 'number';
  const minAreaM2 = sized ? Math.round(width * depth * 100) / 100 : null;
  const minSideM = sized ? Math.min(width, depth) : null;
  if (!sized) {
    warnings.push(
      'Đầu bài khai thang máy nhưng chưa có kích thước giếng thang — chưa kiểm được ô thang máy có lọt cabin không.',
    );
  }
  const size = sized
    ? `tối thiểu ${minAreaM2} m², cạnh ngắn ít nhất ${minSideM} m (giếng ${width} × ${depth} m theo hãng thang)`
    : 'kích thước theo hãng thang (đầu bài chưa khai)';
  const position = vertical?.elevator_position ?? null;

  const layoutNote = vertical?.elevator_layout_note?.trim() || null;
  // Kiểu bố trí đầu bài khai là RÀNG BUỘC — ba kiểu đầu kiểm được trên mặt bằng (Haan 25/09/2026).
  const where =
    position === 'giua_long_thang_bo'
      ? '. Kiểu bố trí: GIỮA LÒNG THANG BỘ — ô thang máy giáp ô thang bộ thành một lõi (thang bộ uốn quanh giếng thang máy), cửa thang máy mở ra chiếu tới của thang bộ hoặc hành lang'
      : position === 'canh_thang_bo'
        ? '. Kiểu bố trí: CẠNH THANG BỘ — ô thang máy chung vách với ô thang bộ, và cả hai cùng giáp một hành lang / sảnh chung; thang máy không bao giờ chắn giữa thang bộ và hành lang'
        : position === 'doi_dien_thang_bo'
          ? '. Kiểu bố trí: ĐỐI DIỆN THANG BỘ — ô thang máy và ô thang bộ không chung vách, nằm hai phía của cùng một hành lang / sảnh chờ, cả hai cùng giáp phòng ấy'
          : position === 'khac' && layoutNote
            ? `. Kiểu bố trí theo mô tả của kiến trúc sư: «${layoutNote}»`
            : position === 'rieng_biet'
              ? ' đặt tách khỏi thang bộ'
              : '';

  lines.push(
    answer === 'lam_ngay'
      ? `Thang máy làm ngay: mọi tầng phải có một ô «${spec.elevator.spaceType}» ${size}, CHỒNG KHÍT nhau qua các tầng${where}.`
      : `Chừa chỗ lắp thang máy sau: mọi tầng phải có một ô «${spec.elevator.spaceType}» ${size}, CHỒNG KHÍT nhau qua các tầng${where}. Chừa lệch tầng thì không phải chừa chỗ — sau này không có giếng thẳng để lắp.`,
  );

  return {
    mode: answer,
    type: spec.elevator.spaceType,
    minAreaM2,
    minSideM,
    shaftWidthM: sized ? width : null,
    shaftDepthM: sized ? depth : null,
    maxAspect: spec.elevator.shaftMaxAspect,
    maxAreaRatio: spec.elevator.shaftMaxAreaRatio,
    reservedLabel: answer === 'chua_cho' ? spec.elevator.reservedLabel || null : null,
    position: position === 'chua_quyet' ? null : position,
    layoutNote,
    hallTypes: spec.elevator.hallTypes,
    layoutMinSharedM: spec.elevator.layoutMinSharedM,
    stairTypes,
  };
}

// ── Ban công ───────────────────────────────────────────────────────────────────────────

function balconyDemand(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  lines: string[],
  warnings: string[],
): BalconyDemand | null {
  const b = digest.balconies;
  if (!b) return null;
  const scope = b.scope ?? null;
  const view = balconySides(b);
  const anyProjection = Object.values(view.projection).some((m) => typeof m === 'number');
  if (
    scope === null &&
    view.required.length === 0 &&
    view.optional.length === 0 &&
    !anyProjection &&
    b.projection_over_boundary == null
  ) {
    return null;
  }

  const type = spec.balcony.spaceType;

  if (scope === 'khong_co') {
    lines.push('Gia chủ khai KHÔNG làm ban công — đừng đưa ban công nào vào phương án.');
    return {
      type,
      fromLevel: spec.balcony.fromLevel,
      forbidden: true,
      sides: [],
      optionalSides: [],
      forbiddenSides: SIDES,
      levels: [],
      projection: null,
      projectionDistanceMissing: false,
    };
  }

  // «Chỉ mặt tiền» là câu PHỦ ĐỊNH với ba mặt còn lại. Đầu bài mới (T91) khai rõ mặt bắt buộc và mặt
  // có thể: mặt còn lại là cấm (Haan 27/09/2026). Đầu bài cũ chỉ có `sides`: bỏ sót một mặt chỉ là
  // chưa nhắc tới, ép thành cấm là bịa ra một yêu cầu.
  const frontOnly = scope === 'chi_mat_tien';
  const sides: Side[] = frontOnly ? ['front'] : view.required;
  const optionalSides: Side[] = frontOnly ? [] : view.optional;
  const declared = new Set<Side>([...sides, ...optionalSides]);
  const forbiddenSides: Side[] = frontOnly
    ? SIDES.filter((s) => s !== 'front')
    : !view.legacy && declared.size
      ? SIDES.filter((s) => !declared.has(s))
      : [];

  const upper: number[] = [];
  for (let level = spec.balcony.fromLevel; level <= digest.floors; level += 1) upper.push(level);
  // `moi_tang` là câu duy nhất ghim TẦNG. `chi_mat_tien` ghim MẶT, `theo_tung_phong` ghim theo
  // phòng — cả hai chỉ cần có ban công ở đâu đó trên các tầng trên.
  const levels = scope === 'moi_tang' ? upper : [];

  // Độ đua từng mặt. Mặt có ban công mà chưa trả lời độ đua: không bịa số — giữ trong ranh và nói ra
  // (chỉ nói khi gia chủ có ý đua: đầu bài cũ khai «có đua» mà thiếu số).
  const projectionBySide: Partial<Record<Side, number>> = {};
  for (const side of SIDES) {
    const m = view.projection[side];
    if (typeof m === 'number' && m > 0 && !forbiddenSides.includes(side))
      projectionBySide[side] = m;
  }
  const projection = Object.keys(projectionBySide).length ? projectionBySide : null;
  const projectionDistanceMissing =
    view.legacy && b.projection_over_boundary === true && projection === null;

  if (sides.length) {
    lines.push(`Ban công BẮT BUỘC có ở ${sides.map(sideWord).join(', ')}.`);
  }
  if (optionalSides.length) {
    lines.push(`Ban công CÓ THỂ có ở ${optionalSides.map(sideWord).join(', ')} (không bắt buộc).`);
  }
  if (forbiddenSides.length) {
    lines.push(`KHÔNG đặt ban công ở ${forbiddenSides.map(sideWord).join(', ')}.`);
  }
  if (levels.length) {
    lines.push(`Mỗi tầng từ tầng ${spec.balcony.fromLevel} trở lên phải có ban công.`);
  }
  if (b.drying_balcony === true) {
    lines.push('Phải có một ban công dành cho giặt phơi, tách khỏi ban công mặt tiền.');
  }
  for (const side of SIDES) {
    const m = projectionBySide[side];
    if (m !== undefined) {
      lines.push(
        `Ban công ${sideWord(side)} được đua ra ngoài ranh nhà ${m} m — phần đua ấy nằm NGOÀI hình bao xây được, không tốn diện tích sàn.`,
      );
    } else if (declared.has(side) && view.projection[side] === 0) {
      lines.push(`Ban công ${sideWord(side)} KHÔNG đua — nằm trong diện tích sàn.`);
    }
  }
  if (projectionDistanceMissing) {
    warnings.push(
      'Đầu bài khai ban công đua ra ngoài ranh nhà nhưng chưa khai đua bao nhiêu mét — mặt bằng giữ ban công trong ranh cho tới khi có số.',
    );
  }

  return {
    type,
    fromLevel: spec.balcony.fromLevel,
    forbidden: false,
    sides,
    optionalSides,
    forbiddenSides,
    levels,
    projection,
    projectionDistanceMissing,
  };
}

export function sideWord(side: Side): string {
  return side === 'front'
    ? 'mặt trước'
    : side === 'back'
      ? 'mặt sau'
      : side === 'left'
        ? 'mặt bên trái'
        : 'mặt bên phải';
}

// ── Câu trả lời nào đòi không gian nào ─────────────────────────────────────────────────

/**
 * Bảng `demands.spaces` của `kb/brief_fidelity.yaml` đọc theo `code`.
 *
 * Mỗi nhánh trả về `null` khi câu ấy CHƯA được trả lời, hoặc một tầng ghim (`level`) khi đầu bài
 * nói rõ tầng. Trả về `{ level: null }` nghĩa là «phải có, tầng nào cũng được».
 */
function demandedSpaces(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  lines: string[],
): DemandedSpace[] {
  const out: DemandedSpace[] = [];
  for (const row of spec.spaces) {
    const hit = matchDemand(row.code, digest);
    if (!hit) continue;
    out.push({
      code: row.code,
      anyOf: row.anyOf,
      count: row.count,
      level: hit.level,
      blocking: row.blocking,
      say: row.say,
    });
    if (row.blocking) {
      lines.push(
        `${row.say} — phương án phải có ${row.count > 1 ? `${row.count} ` : ''}${row.anyOf.join(' hoặc ')}${
          hit.level === null ? '' : ` ở tầng ${hit.level}`
        }.`,
      );
    }
  }
  return out;
}

/**
 * Mã dòng dữ liệu → câu hỏi tương ứng trong đầu bài.
 *
 * Danh sách mã ở đây phải khớp với `demands.spaces` của tệp YAML; có phép thử canh hai bên không
 * lệch nhau, vì một dòng dữ liệu không ai đọc thì im lặng không làm gì, và đó là cách tệ nhất để
 * một yêu cầu của gia chủ biến mất.
 */
export function matchDemand(code: string, digest: AiBriefDigest): { level: number | null } | null {
  const household = digest.household;
  const lifestyle = digest.lifestyle;
  const business = household?.home_business;

  switch (code) {
    case 'phong_tho_rieng':
      return household?.altar_arrangement === 'phong_tho_rieng'
        ? { level: altarLevel(digest) }
        : null;
    case 'tho_san_thuong':
      return household?.altar_arrangement === 'tren_san_thuong' ? { level: digest.floors } : null;
    case 'kinh_doanh_tai_nha':
      return business?.mode === 'cua_hang_mat_tien' ||
        business?.mode === 'san_xuat_nho' ||
        business?.mode === 'kho_hang'
        ? // Cửa hàng mặt tiền thì ở tầng 1 — đó là nghĩa của «mặt tiền». Kho hàng và sản xuất
          // nhỏ thì không ghim tầng: gia chủ có thể để trên tầng lửng hay tầng trên cùng.
          { level: business.mode === 'cua_hang_mat_tien' ? 1 : null }
        : null;
    case 'van_phong_tai_nha':
      return business?.mode === 'van_phong_tai_nha' ? { level: null } : null;
    case 'wc_cho_khach':
      return business?.customer_wc === true ? { level: 1 } : null;
    case 'bep_phu':
      return lifestyle?.second_kitchen === true ? { level: null } : null;
    case 'kho_do_nhieu':
      return digest.storage?.level === 'nhieu' ? { level: null } : null;
    case 'hop_ky_thuat_cuc_nong':
      return digest.systems?.aircon_outdoor === 'hop_ky_thuat' ? { level: null } : null;
    case 'cho_phoi_ngoai_troi':
      return lifestyle?.drying === 'phoi_nang_ngoai_troi' || lifestyle?.drying === 'ca_hai'
        ? { level: null }
        : null;
    case 'bon_nuoc_mai':
      return (digest.systems?.water_storage ?? []).includes('bon_mai')
        ? { level: digest.floors }
        : null;
    case 'bep_kin_chien_xao':
      return lifestyle?.cooking === 'nau_nhieu_chien_xao' ? { level: null } : null;
    case 'khach_o_lai':
      return lifestyle?.overnight_guests === true ? { level: null } : null;
    case 'lam_viec_tai_nha':
      return lifestyle?.work_from_home === true ? { level: null } : null;
    case 'san_trong':
      return (digest.massing?.yards ?? []).includes('san_trong') ? { level: null } : null;
    default:
      // Dòng mới trong tệp dữ liệu mà chưa có nhánh ở đây: bỏ qua, KHÔNG ném lỗi. Một dòng thừa
      // không được phép làm hỏng cả lượt chạy. Phép thử canh ở trên bắt việc này trên máy, trước
      // khi tới được lượt chạy thật.
      return null;
  }
}

/** Tầng đặt bàn thờ nếu đầu bài ghim; ngoài khoảng số tầng thì coi như không ghim. */
function altarLevel(digest: AiBriefDigest): number | null {
  const floor = digest.household?.altar_floor;
  if (typeof floor !== 'number') return null;
  return floor >= 1 && floor <= digest.floors ? floor : null;
}

// ── Chỗ để xe ──────────────────────────────────────────────────────────────────────────

/**
 * Diện tích chỗ để xe tối thiểu, m² — nay tính theo CỠ xe đầu bài khai.
 *
 * Trước T65 mọi ô tô đều là 15 m². Một chiếc bán tải dài hơn xe gầm thấp khoảng nửa mét, và một
 * chỗ đỗ 15 m² cho bán tải là chỗ đỗ không đóng được cửa cuốn. Vẫn là SỐ THAM KHẢO như cả mục
 * `parking` (Haan, 13/09/2026) và vẫn được nới bởi `area_tolerance_ratio`.
 */
export function garageMinimum(digest: AiBriefDigest, fidelity: BriefFidelity): number | null {
  const cars = digest.parking?.cars ?? 0;
  const bikes = digest.parking?.motorbikes ?? 0;
  if (cars + bikes <= 0) return null;
  const size = digest.parking?.car_size ?? null;
  const perCar =
    (size === null ? undefined : fidelity.demands.carM2BySize[size]) ?? fidelity.parking.carM2;
  return round1(cars * perCar + bikes * fidelity.parking.motorbikeM2);
}

// ── Nhắc nghề nghiệp ───────────────────────────────────────────────────────────────────

/**
 * Cảnh báo suy từ đầu bài — KHÔNG bác phương án, chỉ hiện cạnh mặt bằng để kiến trúc sư quyết.
 *
 * Bật/tắt từng cái ở `demands.warnings` của tệp dữ liệu. Vắng khoá = tắt.
 */
function otherWarnings(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  elevator: ElevatorDemand | null,
  warnings: string[],
): void {
  const on = (key: string) => spec.warnings[key] === true;
  const lifestyle = digest.lifestyle;
  const entrance = digest.entrance;

  if (
    on('di_lai_kho_khan_khong_thang_may') &&
    lifestyle?.reduced_mobility === true &&
    digest.floors > 1 &&
    elevator === null
  ) {
    warnings.push(
      'Đầu bài khai trong nhà có người đi lại khó khăn, nhà nhiều tầng mà không làm thang máy và cũng không chừa chỗ.',
    );
  }
  if (
    on('di_lai_kho_khan_con_bac') &&
    lifestyle?.reduced_mobility === true &&
    entrance?.steps_from_yard === true &&
    entrance?.vehicle_ramp !== true
  ) {
    warnings.push(
      'Đầu bài khai có người đi lại khó khăn mà lối vào vẫn còn bậc tam cấp, chưa khai dốc dắt xe hay dốc tiếp cận.',
    );
  }
  if (on('du_tru_nang_tang_thang_khong_len_mai') && digest.future?.expansion === 'nang_them_tang') {
    warnings.push(
      'Đầu bài dự trù nâng thêm tầng — thang bộ và ô thang phải lên được tới sân thượng để sau này nối tiếp, kiểm lại trên bản vẽ.',
    );
  }
  if (
    on('nen_thap_hon_duong_noi_ngap') &&
    typeof digest.site.land_level_m === 'number' &&
    typeof digest.site.road_level_m === 'number' &&
    digest.site.land_level_m < digest.site.road_level_m &&
    (digest.site.flood_risk === 'thinh_thoang' || digest.site.flood_risk === 'thuong_xuyen')
  ) {
    warnings.push(
      'Khu đất thấp hơn mặt đường ở nơi đầu bài khai có ngập — cao độ nền và lối vào phải xử lý, mặt bằng chưa nói được việc này.',
    );
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
