/**
 * Cổng MẶT BẰNG cho phần đòi hỏi của đầu bài (T65, 22/09/2026).
 *
 * Bước chương trình không gian (`ai/program.ts`) đã kiểm được «có hay không» và «đủ mấy cái»: ở
 * đó mới có danh mục phòng, chưa có một toạ độ nào. Ba câu còn lại chỉ trả lời được khi đã xếp
 * xong hình học, và chúng là ba câu gia chủ quan tâm nhất:
 *
 *  · giếng thang máy có CHỒNG KHÍT qua các tầng không — lệch 20 cm là không lắp được cabin, và
 *    với lựa chọn «chừa chỗ lắp sau» thì chừa lệch nhau nghĩa là chưa chừa gì cả;
 *  · ban công có nằm đúng MẶT gia chủ khai không — «ban công mặt tiền» mà ra sau nhà là sai đầu
 *    bài, dù số lượng vẫn đủ;
 *  · ban công đua ra ngoài ranh có đúng mức đã khai không.
 *
 * Tách khỏi `plan-check.ts` vì tệp ấy đã dài và vì ranh giới ở đây rõ: mọi thứ trong tệp này đều
 * bắt nguồn từ một câu gia chủ ĐÃ trả lời. Không có câu trả lời thì không có phép kiểm nào chạy.
 */

import type { AiFloorPlan, AiFloorPlanLevel } from '@nvg/shared/design';
import type { BalconyDemand, DemandedSpace, ElevatorDemand, Side } from './brief-demands';
import { sideWord } from './brief-demands';
import { rectArea, toRect, type Rect } from './draw/geometry';

/** Hai ô thang máy lệch nhau quá chừng này thì không phải sai số, cm. Cùng mức với ô thang bộ. */
export const ELEVATOR_ALIGN_CM = 10;

/** Nới khi so diện tích, m² — chống chuyện 2,19 bị bác vì mức 2,2 do làm tròn toạ độ. */
const AREA_SLACK_M2 = 0.05;

/** Nới khi so cạnh, cm. */
const SIDE_SLACK_CM = 1;

/** Mép phòng cách mép nhà dưới chừng này coi như áp sát mặt ấy, cm. */
const FACE_TOLERANCE_CM = 30;

type Add = (level: 'blocking' | 'finding', code: string, message: string, ref?: string) => void;

/**
 * Hình bao mà một phòng được phép nằm trong.
 *
 * Bằng đúng hình bao xây được với mọi phòng — TRỪ ban công, ở đúng mặt gia chủ khai được đua, và
 * chỉ xa đúng mức đã khai. Trả về chính đối tượng `buildable` khi không nới, để nơi gọi phân biệt
 * được hai câu lỗi: «phòng nằm ngoài đất xây được» khác hẳn «ban công đua quá mức đã khai».
 */
export function allowedBox(
  buildable: Rect,
  balcony: BalconyDemand | null,
  roomType: string,
  level: number,
): Rect {
  const projection = balcony?.projection;
  // Tầng 1 không được đua: phần «đua ra ngoài ranh» của một tầng trệt là lấn đất, không phải ban
  // công. Đầu bài hỏi ban công từ tầng 2 trở lên, và mức đua ấy chỉ có nghĩa ở trên cao.
  if (!projection || !balcony || roomType !== balcony.type || level < balcony.fromLevel) {
    return buildable;
  }
  const cm = Math.round(projection.m * 100);
  const box = { ...buildable };
  for (const side of projection.sides) {
    if (side === 'front') box.y0 -= cm;
    else if (side === 'back') box.y1 += cm;
    else if (side === 'left') box.x0 -= cm;
    else box.x1 += cm;
  }
  return box;
}

/**
 * Giếng thang máy: mọi tầng đều có, đủ rộng, và chồng khít nhau.
 *
 * So từng tầng với tầng ngay trước chứ không với tầng 1: sai lệch nhỏ dồn lại qua năm tầng vẫn
 * phải bị bắt, và câu lỗi phải chỉ đúng vào chỗ bắt đầu lệch.
 */
export function checkElevatorStack(plan: AiFloorPlan, lift: ElevatorDemand | null, add: Add): void {
  if (!lift) return;
  const levels = [...plan.levels].sort((a, b) => a.level - b.level);
  const word = lift.mode === 'lam_ngay' ? 'làm thang máy' : 'chừa chỗ lắp thang máy sau';
  let reference: { level: number; rect: Rect } | null = null;

  for (const level of levels) {
    const cabins = level.rooms.filter((room) => room.type === lift.type);
    const first = cabins[0];
    if (!first) {
      add(
        'blocking',
        'elevator_missing',
        `Đầu bài khai ${word} nhưng tầng ${level.level} không có ô thang máy — giếng thang phải xuyên suốt mọi tầng.`,
      );
      continue;
    }
    const rect = toRect(first.rect);
    const areaM2 = rectArea(rect) / 10_000;
    const sideCm = Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0);
    if (areaM2 + AREA_SLACK_M2 < lift.minAreaM2) {
      add(
        'blocking',
        'elevator_too_small',
        `Ô thang máy tầng ${level.level} rộng ${areaM2.toFixed(1)} m², nhỏ hơn mức ${lift.minAreaM2} m² của tải đầu bài khai.`,
        first.id,
      );
    }
    if (sideCm + SIDE_SLACK_CM < lift.minSideM * 100) {
      add(
        'blocking',
        'elevator_too_narrow',
        `Ô thang máy tầng ${level.level} có cạnh ngắn ${Math.round(sideCm)} cm, hẹp hơn ${Math.round(lift.minSideM * 100)} cm — không lọt cabin.`,
        first.id,
      );
    }
    if (reference) {
      const shift = Math.max(
        Math.abs(rect.x0 - reference.rect.x0),
        Math.abs(rect.y0 - reference.rect.y0),
        Math.abs(rect.x1 - reference.rect.x1),
        Math.abs(rect.y1 - reference.rect.y1),
      );
      if (shift > ELEVATOR_ALIGN_CM) {
        add(
          'blocking',
          'elevator_not_aligned',
          `Ô thang máy tầng ${level.level} lệch ${Math.round(shift)} cm so với tầng ${reference.level} — giếng thang phải thẳng suốt, cabin không đi chéo được.`,
          first.id,
        );
      }
    }
    reference = { level: level.level, rect };
  }
}

/** Ban công: đúng tầng, đúng mặt, và không có ở mặt gia chủ đã loại. */
export function checkBalconyDemand(
  plan: AiFloorPlan,
  balcony: BalconyDemand | null,
  add: Add,
): void {
  if (!balcony) return;
  const found = plan.levels.flatMap((level) =>
    level.rooms
      .filter((room) => room.type === balcony.type)
      .map((room) => ({ level, room, rect: toRect(room.rect) })),
  );

  if (balcony.forbidden) {
    if (found.length) {
      add(
        'blocking',
        'balcony_not_wanted',
        `Gia chủ khai KHÔNG làm ban công, mặt bằng vẫn có ${found.length} ban công.`,
        found[0]?.room.id,
      );
    }
    return;
  }

  for (const want of balcony.levels) {
    if (!found.some((entry) => entry.level.level === want)) {
      add(
        'blocking',
        'balcony_level_missing',
        `Đầu bài khai ban công ở mọi tầng, tầng ${want} không có ban công nào.`,
      );
    }
  }

  for (const side of balcony.sides) {
    const hit = found.some((entry) => touchesSide(entry.level, entry.rect, side));
    if (!hit) {
      add(
        'blocking',
        'balcony_side_missing',
        found.length
          ? `Đầu bài khai ban công ở ${sideWord(side)}, mặt bằng có ban công nhưng không cái nào nằm ở mặt ấy.`
          : `Đầu bài khai ban công ở ${sideWord(side)}, mặt bằng không có ban công nào.`,
      );
    }
  }

  for (const side of balcony.forbiddenSides) {
    const bad = found.find((entry) => touchesSide(entry.level, entry.rect, side));
    if (bad) {
      add(
        'blocking',
        'balcony_side_not_wanted',
        `Gia chủ khai ban công CHỈ ở mặt tiền, mặt bằng có ban công "${bad.room.id}" ở ${sideWord(side)} tầng ${bad.level.level}.`,
        bad.room.id,
      );
    }
  }
}

/**
 * Phòng có áp sát một mặt của khối nhà TẦNG ẤY không.
 *
 * Đo theo hình bao của chính tầng, KHÔNG theo hình bao xây được của cả lô: tầng trên lùi vào là
 * chuyện bình thường, và đo theo lô thì mọi ban công của một tầng lùi đều bị coi là không ở mặt
 * nào cả — bác một mặt bằng đúng.
 */
function touchesSide(level: AiFloorPlanLevel, rect: Rect, side: Side): boolean {
  const box = outlineBox(level);
  if (!box) return false;
  // `<=` chứ không phải `Math.abs`: ban công đua ra ngoài nằm XA hơn mép nhà, và nó vẫn đang ở
  // đúng mặt ấy — đo bằng khoảng cách tuyệt đối thì chính cái ban công đua ra lại trượt phép kiểm.
  if (side === 'front') return rect.y0 <= box.y0 + FACE_TOLERANCE_CM;
  if (side === 'back') return rect.y1 >= box.y1 - FACE_TOLERANCE_CM;
  if (side === 'left') return rect.x0 <= box.x0 + FACE_TOLERANCE_CM;
  return rect.x1 >= box.x1 - FACE_TOLERANCE_CM;
}

/** Chữ nhật bao của hình bao tầng; `null` khi tầng chưa có hình bao. */
function outlineBox(level: AiFloorPlanLevel): Rect | null {
  let box: Rect | null = null;
  for (const point of level.outline) {
    const x = point[0];
    const y = point[1];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    box = box
      ? {
          x0: Math.min(box.x0, x),
          y0: Math.min(box.y0, y),
          x1: Math.max(box.x1, x),
          y1: Math.max(box.y1, y),
        }
      : { x0: x, y0: y, x1: x, y1: y };
  }
  return box;
}

/**
 * Ghi nhãn «ô chừa thang máy» cho trường hợp gia chủ mới CHỪA CHỖ, chưa lắp.
 *
 * Vì sao phải có: bộ vẽ lấy nhãn theo mã loại phòng, nên một ô `elevator` in ra chữ «Thang máy».
 * Với lựa chọn `chua_cho` thì hôm nay chỗ ấy là một ô trống — in «Thang máy» lên một tờ bản vẽ kỹ
 * thuật là nói sai, và người đọc bản vẽ không có cách nào biết được.
 *
 * Không đụng tới nhãn kiến trúc sư đã tự đặt: tên riêng của người dùng luôn thắng.
 */
export function labelReservedShaft<T extends { type: string; label?: string | null }>(
  rooms: readonly T[],
  lift: ElevatorDemand | null,
): T[] {
  if (!lift || lift.mode !== 'chua_cho' || !lift.reservedLabel) return [...rooms];
  return rooms.map((room) =>
    room.type === lift.type && !room.label?.trim() ? { ...room, label: lift.reservedLabel } : room,
  );
}

/**
 * Đòi hỏi MỀM: đầu bài gợi ra nhưng KHÔNG bác phương án.
 *
 * Đây là phần suy đoán nghề — «nấu nhiều chiên xào nên có bếp kín», «khách ở lại qua đêm nên có
 * một phòng ngủ được». Chúng ra `finding`, không ra `blocking`: bác một phương án vì một suy đoán
 * là đúng thứ Haan đã cho gỡ ở T52, và một cảnh báo sai loại dạy người dùng bỏ qua cả danh sách.
 *
 * Dòng `blocking: true` KHÔNG đi qua đây — chúng đã bị bác ở cổng chương trình không gian, và
 * nhắc lại lần nữa là hai dòng nói cùng một chuyện.
 */
export function checkSoftDemands(
  plan: AiFloorPlan,
  spaces: readonly DemandedSpace[],
  add: Add,
): void {
  for (const demand of spaces) {
    if (demand.blocking) continue;
    const have = plan.levels.reduce(
      (count, level) =>
        count +
        (demand.level !== null && level.level !== demand.level
          ? 0
          : level.rooms.filter((room) => demand.anyOf.includes(room.type)).length),
      0,
    );
    if (have >= demand.count) continue;
    add(
      'finding',
      `brief_demand_${demand.code}`,
      `${demand.say} — mặt bằng chưa có không gian nào đáp ứng${
        demand.level === null ? '' : ` ở tầng ${demand.level}`
      }. Không chặn: đây là gợi ý nghề, kiến trúc sư quyết.`,
    );
  }
}
