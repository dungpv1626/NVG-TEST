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

import type { AiBriefDigest } from '@nvg/shared/design';
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
  /** Diện tích giếng tối thiểu, m². */
  minAreaM2: number;
  /** Cạnh ngắn nhất của giếng, m. */
  minSideM: number;
  /**
   * Nhãn ghi lên bản vẽ khi mới chừa chỗ — `null` khi lắp ngay.
   *
   * Vẽ một ô trống rồi ghi «thang máy» lên đó là nói sai trên một tờ bản vẽ kỹ thuật.
   */
  reservedLabel: string | null;
  /** `canh_thang_bo` · `rieng_biet` · `null` khi gia chủ chưa quyết. */
  position: string | null;
}

/** Ban công — `null` khi đầu bài chưa khai gì về ban công. */
export interface BalconyDemand {
  type: string;
  /** Ban công chỉ tính từ tầng này trở lên — tầng 1 «ban công» là sân hay hiên. */
  fromLevel: number;
  /** Gia chủ khai KHÔNG làm ban công: có ban công trong đề xuất là sai đầu bài. */
  forbidden: boolean;
  /** Mặt phải có ban công. Rỗng = đầu bài không ghim mặt nào. */
  sides: readonly Side[];
  /**
   * Mặt KHÔNG được có ban công — chỉ điền khi gia chủ khai «chỉ mặt tiền»: đó là một câu phủ
   * định thật sự, khác hẳn với khai `sides` mà bỏ sót một mặt.
   */
  forbiddenSides: readonly Side[];
  /** Tầng phải có ít nhất một ban công. Rỗng = không ghim tầng nào. */
  levels: readonly number[];
  /** Được phép đua ra ngoài ranh bao nhiêu mét, trên những mặt nào. `null` = không được đua. */
  projection: { sides: readonly Side[]; m: number } | null;
  /**
   * Gia chủ khai CÓ đua ra ngoài ranh nhưng không khai đua bao nhiêu.
   *
   * Không dựng số mặc định: đua 0,6 m hay 1,4 m là hai cái nhà khác nhau, và bịa ra một con số
   * rồi vẽ lên bản vẽ kỹ thuật thì tệ hơn hẳn việc nói ra rằng còn thiếu số (CLAUDE.md 5.2).
   * Mặt bằng giữ ban công trong ranh, và chỗ này thành một câu nhắc.
   */
  projectionDistanceMissing: boolean;
}

export interface BriefDemands {
  spaces: readonly DemandedSpace[];
  elevator: ElevatorDemand | null;
  balcony: BalconyDemand | null;
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

  const elevator = elevatorDemand(digest, spec, lines, warnings);
  const balcony = balconyDemand(digest, spec, lines, warnings);
  const spaces = demandedSpaces(digest, spec, lines);
  const garageMinM2 = garageMinimum(digest, fidelity);

  otherWarnings(digest, spec, elevator, warnings);

  return { spaces, elevator, balcony, garageMinM2, lines, warnings };
}

// ── Thang máy ──────────────────────────────────────────────────────────────────────────

function elevatorDemand(
  digest: AiBriefDigest,
  spec: BriefFidelity['demands'],
  lines: string[],
  warnings: string[],
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

  const capacity = vertical?.elevator_capacity ?? null;
  const byCapacity = capacity === null ? undefined : spec.elevator.shaftM2[capacity];
  const minAreaM2 = byCapacity ?? spec.elevator.shaftM2Unknown;
  const position = vertical?.elevator_position ?? null;

  const where =
    position === 'canh_thang_bo'
      ? ' đặt cạnh thang bộ'
      : position === 'rieng_biet'
        ? ' đặt tách khỏi thang bộ'
        : '';

  lines.push(
    answer === 'lam_ngay'
      ? `Thang máy làm ngay: mọi tầng phải có một ô «${spec.elevator.spaceType}» tối thiểu ${minAreaM2} m², cạnh ngắn ít nhất ${spec.elevator.shaftMinSideM} m, CHỒNG KHÍT nhau qua các tầng${where}.`
      : `Chừa chỗ lắp thang máy sau: mọi tầng phải có một ô «${spec.elevator.spaceType}» tối thiểu ${minAreaM2} m², cạnh ngắn ít nhất ${spec.elevator.shaftMinSideM} m, CHỒNG KHÍT nhau qua các tầng${where}. Chừa lệch tầng thì không phải chừa chỗ — sau này không có giếng thẳng để lắp.`,
  );

  return {
    mode: answer,
    type: spec.elevator.spaceType,
    minAreaM2,
    minSideM: spec.elevator.shaftMinSideM,
    reservedLabel: answer === 'chua_cho' ? spec.elevator.reservedLabel || null : null,
    position: position === 'chua_quyet' ? null : position,
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
  const declaredSides = (b.sides ?? []).filter((s): s is Side => SIDES.includes(s as Side));
  if (scope === null && declaredSides.length === 0 && b.projection_over_boundary == null) {
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
      forbiddenSides: SIDES,
      levels: [],
      projection: null,
      projectionDistanceMissing: false,
    };
  }

  // «Chỉ mặt tiền» là câu PHỦ ĐỊNH với ba mặt còn lại, nên nó sinh `forbiddenSides`. Khai `sides`
  // mà bỏ sót một mặt thì không: đó chỉ là chưa nhắc tới, và ép thành cấm là bịa ra một yêu cầu.
  const frontOnly = scope === 'chi_mat_tien';
  const sides: Side[] = frontOnly ? ['front'] : [...new Set(declaredSides)];
  const forbiddenSides: Side[] = frontOnly ? SIDES.filter((s) => s !== 'front') : [];

  const upper: number[] = [];
  for (let level = spec.balcony.fromLevel; level <= digest.floors; level += 1) upper.push(level);
  // `moi_tang` là câu duy nhất ghim TẦNG. `chi_mat_tien` ghim MẶT, `theo_tung_phong` ghim theo
  // phòng — cả hai chỉ cần có ban công ở đâu đó trên các tầng trên.
  const levels = scope === 'moi_tang' ? upper : [];

  const projectionM = typeof b.projection_m === 'number' ? b.projection_m : null;
  const wantsProjection = b.projection_over_boundary === true;
  const projectionDistanceMissing = wantsProjection && (projectionM === null || projectionM <= 0);
  const projectionSides: Side[] = sides.length ? sides : ['front'];
  const projection =
    wantsProjection && projectionM !== null && projectionM > 0
      ? { sides: projectionSides, m: projectionM }
      : null;

  if (sides.length) {
    lines.push(
      `Ban công phải có ở ${sides.map(sideWord).join(', ')}${
        forbiddenSides.length ? ' và CHỈ ở đó' : ''
      }.`,
    );
  }
  if (levels.length) {
    lines.push(`Mỗi tầng từ tầng ${spec.balcony.fromLevel} trở lên phải có ban công.`);
  }
  if (b.drying_balcony === true) {
    lines.push('Phải có một ban công dành cho giặt phơi, tách khỏi ban công mặt tiền.');
  }
  if (projection) {
    lines.push(
      `Ban công ${projection.sides.map(sideWord).join(', ')} được đua ra ngoài ranh nhà ${projection.m} m — phần đua ấy nằm NGOÀI hình bao xây được, và chỉ ban công mới được đua.`,
    );
  } else if (wantsProjection) {
    lines.push('Ban công KHÔNG được vượt ra ngoài ranh nhà.');
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
