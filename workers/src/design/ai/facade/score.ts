/**
 * Chấm mặt đứng theo thước `kb/facade_quality.yaml` (T63, 20/09/2026).
 *
 * Haan: «cần cải tiến để bản vẽ mặt đứng đạt được tối thiểu 80% so với bản vẽ từ hồ sơ thật của
 * NVG». Bộ này là phép ĐO của con số ấy — không có nó thì «80%» không kiểm chứng được.
 *
 * ── Ba ranh giới, giống hệt bộ chấm mặt bằng ───────────────────────────────────────────
 *
 * 1. **Điểm KHÔNG phải cổng.** Cổng dữ liệu (`check.ts`) hỏi «dựng được không» và trả đạt/không
 *    đạt; bộ này hỏi «giống cách NVG vẽ đến đâu» và trả một con số. Dưới ngưỡng thì dùng lượt sửa
 *    còn lại, hết lượt vẫn LƯU — điểm thấp không chặn, điểm cao không tự mở.
 * 2. **«Chưa chấm được» không phải 0.** Tiêu chí không áp dụng (tiêu chí mái Nhật trên nhà mái
 *    bằng) hoặc thiếu đầu vào trả `null`, và trọng số của nó KHÔNG chia lại. Kết quả vì thế luôn
 *    mang cả `points` lẫn `scoredWeight`.
 * 3. **n = 6 công trình.** Mọi ngưỡng `[ĐO]` là chỉ dấu, không phải định mức (CLAUDE.md 8.7.5).
 *
 * Công thức cho điểm dùng lại `scoreOf` của bộ chấm mặt bằng — một bộ công thức, hai cái thước.
 */

import type { AiFacadeConcept } from '@nvg/shared/design';
import type { FacadeVocabulary } from '../../kb/facade-vocabulary';
import { scoreOf } from '../plan-score';
import type { FacadeCriterion, FacadeQuality } from './quality';

export interface FacadeCriterionScore {
  code: string;
  group: string;
  vi: string;
  giaiThich: string | null;
  /** Giá trị đo được. `null` = chưa chấm được (không áp dụng, hoặc thiếu đầu vào). */
  value: number | null;
  /** Điểm 0–1 của tiêu chí. `null` khi `value` rỗng. */
  score: number | null;
  weight: number;
  n: number;
  label: string;
  doAi: boolean;
  /** Vì sao không chấm được — chỉ có khi `value` rỗng. */
  why: string | null;
}

export interface FacadeGroupScore {
  code: string;
  vi: string;
  weight: number;
  /** Phần trọng số nhóm thực sự chấm được. */
  scoredWeight: number;
  points: number;
}

export interface FacadeScore {
  scoreVersion: number;
  coSoDuLieu: string;
  /** Điểm đạt được, trên thang `scoredWeight`. */
  points: number;
  /** Tổng trọng số đã chấm được. */
  scoredWeight: number;
  /** % trên phần chấm được — con số đem so với `accept_percent`. */
  percent: number | null;
  acceptPercent: number | null;
  groups: FacadeGroupScore[];
  criteria: FacadeCriterionScore[];
}

/** Một phép đo: giá trị, hoặc lý do vì sao chưa đo được. */
type Measured = { value: number } | { why: string };

const isMeasured = (m: Measured): m is { value: number } => 'value' in m;

/**
 * Độ sáng CẢM NHẬN của một mã màu — L* của CIELAB, thang 0 (đen) đến 100 (trắng).
 *
 * ⚠️ Lần đầu viết bộ chấm (20/09/2026) tôi dùng *relative luminance* Y của sRGB. Sai, và lượt chấm
 * đầu tiên trên hồ sơ demo bắt được ngay: «ghi bạc» #A7ABAE có Y = 0,40 nên bị chấm là màu TỐI,
 * trong khi bốn trong sáu hồ sơ thật của NVG dùng đúng loại ghi sáng ấy cho thân nhà. Một cái thước
 * chấm trượt chính những bản vẽ nó được dựng từ đó thì hỏng, không phải bản vẽ hỏng.
 *
 * Y đo năng lượng ánh sáng, L* đo cái mắt gọi là «sáng». Cùng dải màu của danh mục:
 *   trắng #F5F5F2 Y 0,91 · L* 96,5   ghi bạc #A7ABAE Y 0,40 · L* 69,8
 *   xám nhạt #C9CBCB Y 0,59 · L* 81,5   nâu gỗ #8A5A3B Y 0,13 · L* 42,8
 * Với Y thì ghi bạc nằm gần nâu gỗ hơn gần trắng; với L* thì ngược lại, và đó mới là cách người
 * đọc bản vẽ phân nhóm.
 *
 * Mã hex nằm trong `kb/facade_vocabulary.yaml`, nên đổi bảng màu là điểm đổi theo.
 */
export function lightness(hex: string): number | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const n = parseInt(m[1]!, 16);
  const y =
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** Cửa chính = cửa `door` rộng nhất ở tầng THẤP NHẤT có lỗ mở (cùng quy ước `frame.mainDoorOf`). */
function mainDoorOf(openings: AiFacadeConcept['openings_front']) {
  const doors = openings.filter((o) => o.kind === 'door');
  if (doors.length === 0) return null;
  const lowest = Math.min(...openings.map((o) => o.level));
  const onLowest = doors.filter((o) => o.level === lowest);
  const pool = onLowest.length > 0 ? onLowest : doors;
  return pool.reduce((best, o) => (o.w > best.w ? o : best), pool[0]!);
}

/**
 * Tầng lấy làm mốc để đo cao độ lanh tô và bậu cửa sổ: tầng có cửa chính.
 *
 * Nhà phố hay để tầng trệt chỉ có cửa để xe và đưa cửa chính lên tầng lửng — lúc ấy hàng lỗ mở
 * đáng đo là hàng của cửa chính, không phải hàng thấp nhất. Không có cửa chính thì lùi về tầng
 * thấp nhất có lỗ mở.
 */
function refLevel(concept: AiFacadeConcept): number | null {
  const door = mainDoorOf(concept.openings_front);
  if (door) return door.level;
  const levels = concept.openings_front.map((o) => o.level);
  return levels.length > 0 ? Math.min(...levels) : null;
}

function windowsOn(
  concept: AiFacadeConcept,
  level: number | null,
): AiFacadeConcept['openings_front'] {
  return concept.openings_front.filter((o) => o.kind === 'window' && o.level === level);
}

/*
 * Haan, 20/09/2026: «việc có cửa sổ ở mặt tiền là không bắt buộc, có nhà cần có, có nhà không.»
 * Vì vậy mặt tiền không cửa sổ là KHÔNG ÁP DỤNG, không phải thiếu dữ liệu: C1 và C3 ra khỏi phép
 * chia, phần trọng số của chúng về tiêu chí còn lại của nhóm Cửa. Để ở nhánh «thiếu đầu vào» thì
 * một ngôi nhà hợp lệ vĩnh viễn chỉ chấm được 1/3 nhóm Cửa — mẫu số co lại vì một chuyện bình thường.
 * Cửa chính cũng vậy: nhà phố lấy cửa để xe làm lối vào là nhà không có cửa chính, không phải nhà
 * thiếu số đo.
 */
const KHONG_CUA_CHINH = 'Mặt tiền không có cửa chính — lối vào là cửa để xe.';
const KHONG_BAN_CONG = 'Mặt tiền không có ban công nào, nên không có lan can để đo.';
const KHONG_CUA_SO =
  'Tầng có cửa chính không có cửa sổ nào, và có cửa sổ ở mặt tiền hay không là tuỳ ngôi nhà.';

/** `true` = có chấm; chuỗi = lý do KHÔNG áp dụng, hiện nguyên văn lên màn hình. */
function conditionHolds(criterion: FacadeCriterion, concept: AiFacadeConcept): true | string {
  const type = concept.roof.type;
  switch (criterion.chiKhi) {
    case undefined:
      return true;
    case 'roof_japanese':
      return type === 'japanese' || 'Chỉ chấm cho nhà mái Nhật.';
    case 'roof_flat':
      return type === 'flat' || 'Chỉ chấm cho nhà mái bằng.';
    case 'roof_pitched':
      return type !== 'flat' || 'Chỉ chấm cho nhà mái dốc.';
    case 'main_door':
      return mainDoorOf(concept.openings_front) !== null || KHONG_CUA_CHINH;
    case 'front_window':
      return windowsOn(concept, refLevel(concept)).length > 0 || KHONG_CUA_SO;
    case 'balcony':
      return (concept.balconies ?? []).length > 0 || KHONG_BAN_CONG;
    case 'main_door_window': {
      const door = mainDoorOf(concept.openings_front);
      if (!door) return KHONG_CUA_CHINH;
      return windowsOn(concept, door.level).length > 0 || KHONG_CUA_SO;
    }
  }
}

/** Mảng trang trí mô hình đã đặt, theo `kind`. */
function elementKinds(concept: AiFacadeConcept): string[] {
  return (concept.elevation.elements ?? []).map((e) => e.kind);
}

function zoneOf(concept: AiFacadeConcept, where: string) {
  return concept.materials.find((m) => m.where === where) ?? null;
}

function measure(
  criterion: FacadeCriterion,
  concept: AiFacadeConcept,
  vocab: FacadeVocabulary,
  railingCm: number | null,
): Measured {
  const bool = (ok: boolean): Measured => ({ value: ok ? 1 : 0 });
  const colourLight = (code: string | null | undefined): number | null => {
    if (!code) return null;
    const hex = vocab.colours[code]?.hex;
    return hex ? lightness(hex) : null;
  };

  switch (criterion.code) {
    case 'M1': {
      const pitch = concept.roof.pitch_deg;
      return pitch === null || pitch === undefined
        ? { why: 'Ý tưởng không khai độ dốc mái.' }
        : { value: pitch };
    }
    case 'M2':
      return bool(elementKinds(concept).includes('eaves_band'));
    case 'M3': {
      const parapet = concept.elevation.parapet;
      return parapet === null || parapet === undefined
        ? { why: 'Ý tưởng không khai tường chắn mái.' }
        : { value: parapet };
    }
    case 'V1': {
      const base = colourLight(zoneOf(concept, 'base')?.colour);
      const body = colourLight(zoneOf(concept, 'body')?.colour);
      if (base === null || body === null) return { why: 'Chưa có màu của phần đế hoặc thân nhà.' };
      const delta = criterion.params.chenh_lech_do_sang_toi_thieu ?? 0;
      return bool(body - base >= delta);
    }
    case 'V2': {
      const code = zoneOf(concept, 'base')?.material;
      if (!code) return { why: 'Chưa có vật liệu phần đế.' };
      return bool(vocab.materials[code]?.op === true);
    }
    case 'V3': {
      const body = colourLight(zoneOf(concept, 'body')?.colour);
      if (body === null) return { why: 'Chưa có màu thân nhà.' };
      return bool(body >= (criterion.params.do_sang_toi_thieu ?? 0));
    }
    case 'V4': {
      const { primary_hex, secondary_hex, accent_hex } = concept.palette;
      const set = new Set([primary_hex, secondary_hex, accent_hex].filter(Boolean));
      return { value: set.size };
    }
    /*
     * Ba tiêu chí C dưới đây có `chi_khi` lo phần «nhà này không có cửa chính / không có cửa sổ»
     * (xem `conditionHolds`), nên tới đây là đã có. Hàng rào `why` vẫn giữ: bỏ `chi_khi` khỏi tệp
     * thước mà bộ chấm im lặng cho 0 thì không ai thấy.
     */
    case 'C1': {
      const door = mainDoorOf(concept.openings_front);
      if (!door) return { why: KHONG_CUA_CHINH };
      const windows = windowsOn(concept, door.level);
      if (windows.length === 0) return { why: KHONG_CUA_SO };
      const top = door.sill + door.h;
      const tol = criterion.params.sai_so_cm ?? 0;
      return bool(windows.some((w) => Math.abs(w.sill + w.h - top) <= tol));
    }
    case 'C2': {
      const door = mainDoorOf(concept.openings_front);
      return door ? { value: door.h } : { why: KHONG_CUA_CHINH };
    }
    case 'C3': {
      const windows = windowsOn(concept, refLevel(concept));
      if (windows.length === 0) return { why: KHONG_CUA_SO };
      // Bậu thấp nhất: hồ sơ đo bậu của cửa sổ thường, không đo cửa sổ vệ sinh đặt cao.
      return { value: Math.min(...windows.map((w) => w.sill)) };
    }
    case 'T1':
      return bool(elementKinds(concept).includes('cornice'));
    case 'T2':
      return bool(elementKinds(concept).includes('finial'));
    case 'T3':
      return { value: elementKinds(concept).length };
    case 'R1':
      return railingCm === null
        ? { why: 'Chưa biết chiều cao lan can của quy ước cấu tạo.' }
        : { value: railingCm };
    default:
      // Thước khai một tiêu chí mà bộ chấm chưa biết đo: nói ra, đừng cho 0 lặng lẽ.
      return { why: `Bộ chấm chưa biết đo tiêu chí ${criterion.code}.` };
  }
}

export interface FacadeScoreInput {
  concept: AiFacadeConcept;
  quality: FacadeQuality;
  vocab: FacadeVocabulary;
  /** Chiều cao lan can bộ vẽ dùng, cm (`kb/construction_norms.yaml`). */
  railingCm?: number | null;
}

export function scoreFacade(input: FacadeScoreInput): FacadeScore {
  const { concept, quality, vocab } = input;
  const railingCm = input.railingCm ?? null;

  /*
   * Hai kiểu «rỗng» KHÁC NHAU, và trọng số xử lý ngược nhau — cùng cách bộ chấm mặt bằng phân
   * biệt lỗi cổng với thiếu dữ liệu:
   *
   *  · KHÔNG ÁP DỤNG (`chi_khi` không đúng): tiêu chí mái Nhật trên nhà mái bằng. Nó ra khỏi
   *    phép chia hẳn, trọng số 0. Giữ lại phần của nó thì nhà mái bằng vĩnh viễn không vượt quá
   *    1/3 nhóm Mái — phạt một ngôi nhà vì nó không phải kiểu nhà khác.
   *  · THIẾU ĐẦU VÀO (không biết chiều cao lan can): tiêu chí VẪN giữ phần trọng số của mình,
   *    chỉ là phần ấy không vào `scoredWeight`. Chia lại cho tiêu chí khác là vờ như đã đo đủ.
   */
  const measured = quality.criteria.map((criterion) => {
    const holds = conditionHolds(criterion, concept);
    return {
      criterion,
      inScope: holds === true,
      m:
        holds === true
          ? measure(criterion, concept, vocab, railingCm)
          : ({ why: holds } as Measured),
    };
  });

  const inScopeByGroup = new Map<string, number>();
  for (const { criterion, inScope } of measured) {
    if (inScope) {
      inScopeByGroup.set(criterion.group, (inScopeByGroup.get(criterion.group) ?? 0) + 1);
    }
  }

  const criteria: FacadeCriterionScore[] = measured.map(({ criterion, inScope, m }) => {
    const group = quality.groups[criterion.group]!;
    const count = inScopeByGroup.get(criterion.group) ?? 0;
    const weight = inScope && count > 0 ? group.weight / count : 0;
    return {
      code: criterion.code,
      group: criterion.group,
      vi: criterion.vi,
      giaiThich: criterion.giaiThich ?? null,
      value: isMeasured(m) ? m.value : null,
      score: isMeasured(m) ? scoreOf(criterion, m.value) : null,
      weight,
      n: criterion.n,
      label: criterion.label,
      doAi: criterion.doAi,
      why: isMeasured(m) ? null : m.why,
    };
  });

  return {
    scoreVersion: quality.scoreVersion,
    coSoDuLieu: quality.coSoDuLieu,
    acceptPercent: quality.acceptPercent,
    ...rollUp(criteria, quality.groups),
    criteria,
  };
}

/**
 * Cộng điểm từng tiêu chí thành điểm nhóm và điểm chung.
 *
 * Tách riêng vì bảng điểm KỸ SƯ CHẤM LẠI (`facade/review.ts`) cộng lại đúng công thức này trên
 * những điểm đã thay. Hai bản sao của một công thức cộng điểm là hai con số sẽ lệch nhau mà không
 * ai biết bên nào đúng.
 */
export function rollUp(
  criteria: FacadeCriterionScore[],
  groups: FacadeQuality['groups'],
): Pick<FacadeScore, 'groups' | 'points' | 'scoredWeight' | 'percent'> {
  const rows: FacadeGroupScore[] = Object.entries(groups).map(([code, g]) => {
    const own = criteria.filter((c) => c.group === code && c.score !== null);
    return {
      code,
      vi: g.vi,
      weight: g.weight,
      scoredWeight: own.reduce((sum, c) => sum + c.weight, 0),
      points: own.reduce((sum, c) => sum + c.weight * c.score!, 0),
    };
  });

  const scoredWeight = rows.reduce((sum, g) => sum + g.scoredWeight, 0);
  const points = rows.reduce((sum, g) => sum + g.points, 0);
  return {
    points: Math.round(points * 10) / 10,
    scoredWeight: Math.round(scoredWeight * 10) / 10,
    percent: scoredWeight > 0 ? Math.round((points / scoredWeight) * 100) : null,
    groups: rows,
  };
}

/**
 * Các tiêu chí mất điểm mà MÔ HÌNH sửa được — đầu vào của vòng tự sửa.
 *
 * Nặng nhất trước, và chỉ lấy `doAi: true`. Tiêu chí do chương trình quyết (cao độ lanh tô, chiều
 * cao cửa, lan can) vẫn hiện trên màn hình nhưng không bao giờ đi vào lời dẫn: gửi chúng đi là mua
 * lại đúng câu trả lời cũ bằng một lượt gọi tính tiền.
 */
export function facadeFixable(score: FacadeScore, limit = 4): FacadeCriterionScore[] {
  return score.criteria
    .filter((c) => c.doAi && c.score !== null && c.score < 1)
    .sort((a, b) => b.weight * (1 - b.score!) - a.weight * (1 - a.score!))
    .slice(0, limit);
}
