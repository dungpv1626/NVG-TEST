/**
 * Đầu bài + khảo sát ĐÃ LƯỢC DANH TÍNH → văn xuôi tiếng Việt cho mô hình ngôn ngữ (T43, 14/09/2026).
 *
 * Vì sao văn xuôi thay cho JSON: đầu bài là lời gia chủ và ghi chú khảo sát — thứ kiến trúc sư ĐỌC,
 * không phải bảng tra. Gửi dạng JSON thì mô hình phải tự dịch `vo_chong`, `hem_3m`, `san_sau`, và các ô
 * chữ tự do (phần giàu ý nhất) nằm lọt thỏm giữa những mã máy. Dữ liệu MÁY CẦN KHỚP CHÍNH XÁC (mã
 * phòng, số tầng, vùng) vẫn đi riêng trong `<knowledge>` dạng JSON.
 *
 * Ba ràng buộc, cả ba có phép thử canh:
 *  · chỉ đọc `AiBriefDigest` — bản đã lược danh tính (T12). Hàm này KHÔNG lược lại và KHÔNG thêm dữ
 *    liệu nào không có trong digest;
 *  · không dịch và không tóm tắt lời gia chủ: bốn ô chữ tự do và ghi chú khảo sát đi nguyên văn;
 *  · nhãn lấy từ `BRIEF_FORM` (cùng nguồn biểu mẫu hiển thị) và từ vựng phòng — không có bảng nhãn thứ
 *    hai để lệch. Mã không có nhãn thì giữ mã, không đoán.
 *
 * Hàm THUẦN, tất định: cùng digest cho cùng từng byte, nên tiền tố lời gọi đọc được từ bộ nhớ đệm.
 */

import {
  BALCONY_SIDES,
  balconySides,
  BRIEF_FORM,
  FAMILY_ROLE_LABEL,
  fieldByPath,
  FLOOR_PREF_LABEL,
  type AiBriefDigest,
} from '@nvg/shared/design';

export interface NarrativeOptions {
  /** Mã phòng → nhãn tiếng Việt (`kb/room_vocabulary.yaml`). */
  roomLabels: Readonly<Record<string, string>>;
}

type Face = 'front' | 'back' | 'left' | 'right';
const FACES: readonly Face[] = ['front', 'back', 'left', 'right'];

export function briefNarrative(digest: AiBriefDigest, options: NarrativeOptions): string {
  const optionLabel = (path: string, value: string | number | boolean): string | null => {
    const field = fieldByPath(BRIEF_FORM, path);
    return field?.options?.find((o) => String(o.value) === String(value))?.label ?? null;
  };
  const label = (path: string, value: string | number | boolean | null | undefined): string =>
    value === null || value === undefined ? '' : (optionLabel(path, value) ?? String(value));
  const room = (code: string) => options.roomLabels[code] ?? code;
  const face = (value: string | null | undefined) =>
    value ? label('site.access_sides', value).toLowerCase() : '';
  const metres = (value: number | null | undefined) =>
    typeof value === 'number' ? `${formatNumber(value)} m` : '';
  /**
   * Câu trả lời có/không viết thành chữ.
   *
   * `null` và `undefined` trả chuỗi rỗng chứ KHÔNG trả «không»: chưa hỏi và trả lời «không»
   * là hai chuyện khác nhau, và gộp lại thì mô hình đọc được một câu khẳng định mà gia chủ
   * chưa từng nói.
   */
  const yesNo = (value: boolean | null | undefined) =>
    value === true ? 'có' : value === false ? 'không' : '';
  const faces = (values: readonly string[] | null | undefined) =>
    values?.length ? values.map(face).join(', ') : '';

  const sections: string[] = [];
  const section = (title: string, lines: (string | null | undefined | false)[]) => {
    const kept = lines.filter(
      (line): line is string => typeof line === 'string' && line.trim().length > 0,
    );
    if (kept.length) sections.push(`## ${title}\n${kept.map((line) => `- ${line}`).join('\n')}`);
  };

  // ── Công trình ─────────────────────────────────────────────────────────────────────────
  section('Công trình', [
    `${label('building_type', digest.building_type)}, ${digest.floors} tầng.`,
    digest.locality ? `Địa phương: ${label('locality', digest.locality)}.` : null,
    digest.style ? `Phong cách mong muốn: ${label('style', digest.style)}.` : null,
  ]);

  // ── Khu đất ─────────────────────────────────────────────────────────────────────────────
  const site = digest.site;
  const adjacent = FACES.map((f) => {
    const value = site.adjacent?.[f];
    return value ? `${face(f)} giáp ${label('site.adjacent', value).toLowerCase()}` : null;
  }).filter(Boolean);
  const setbacks = FACES.map((f) => {
    const value = site.setback_required_m?.[f];
    return typeof value === 'number' && value > 0 ? `${face(f)} ${metres(value)}` : null;
  }).filter(Boolean);
  const walls = FACES.map((f) => {
    const value = site.boundary_walls?.[f];
    return value ? `${face(f)}: ${label('site.boundary_walls', value).toLowerCase()}` : null;
  }).filter(Boolean);
  const neighbours = FACES.map((f) => {
    const value = site.neighbour_floors?.[f];
    return typeof value === 'number' && value > 0 ? `${face(f)} ${value} tầng` : null;
  }).filter(Boolean);
  section('Khu đất', [
    `Mặt tiền rộng ${metres(site.width_m)}, sâu ${metres(site.depth_m)}${
      site.shape ? ` — ${label('site.shape', site.shape).toLowerCase()}` : ''
    }${typeof site.rear_width_m === 'number' ? `, mặt hậu rộng ${metres(site.rear_width_m)}` : ''}.`,
    site.boundary_m?.length
      ? `Ranh đất là đa giác ${site.boundary_m.length} đỉnh (toạ độ trong phần dữ liệu máy).`
      : null,
    site.orientation ? `Nhà hướng ${label('site.orientation', site.orientation)}.` : null,
    site.access_sides?.length ? `Tiếp cận từ: ${site.access_sides.map(face).join(', ')}.` : null,
    adjacent.length ? `Hiện trạng xung quanh: ${adjacent.join('; ')}.` : null,
    setbacks.length ? `Khoảng lùi bắt buộc: ${setbacks.join(', ')}.` : null,
    typeof site.max_density === 'number'
      ? `Mật độ xây dựng tối đa ${formatNumber(site.max_density * 100)}%.`
      : null,
    site.main_entrance_side ? `Lối vào chính đặt ở ${face(site.main_entrance_side)}.` : null,
    site.vehicle_entrance_side ? `Lối xe vào ở ${face(site.vehicle_entrance_side)}.` : null,
    walls.length ? `Tường ranh — ${walls.join('; ')}.` : null,
    typeof site.road_width_m === 'number'
      ? `Đường trước nhà rộng ${metres(site.road_width_m)}.`
      : null,
    levelLine(site),
    faces(site.harsh_sun_sides) ? `Mặt chịu nắng gắt: ${faces(site.harsh_sun_sides)}.` : null,
    faces(site.cool_wind_sides) ? `Mặt đón gió mát: ${faces(site.cool_wind_sides)}.` : null,
    neighbours.length ? `Nhà liền kề: ${neighbours.join('; ')}.` : null,
    site.flood_risk && site.flood_risk !== 'khong'
      ? `Khu đất bị ngập ${label('site.flood_risk', site.flood_risk).toLowerCase()}.`
      : null,
    site.existing_structure && site.existing_structure !== 'dat_trong'
      ? `Hiện trạng: ${label('site.existing_structure', site.existing_structure).toLowerCase()}.`
      : null,
  ]);

  // ── Gia đình ────────────────────────────────────────────────────────────────────────────
  section(
    'Gia đình',
    (digest.family ?? [])
      .filter((member) => (member.count ?? 0) > 0)
      .map((member) => {
        const role =
          FAMILY_ROLE_LABEL[member.role as keyof typeof FAMILY_ROLE_LABEL] ?? member.role;
        const parts = [`${role}: ${member.count} người`];
        if (typeof member.floor === 'number') parts.push(`ở tầng ${member.floor}`);
        else if (member.floor_pref) {
          const pref = FLOOR_PREF_LABEL[member.floor_pref as keyof typeof FLOOR_PREF_LABEL];
          if (pref) parts.push(`muốn ở ${pref.toLowerCase()}`);
        }
        if (member.ages?.length) parts.push(`tuổi ${member.ages.join(', ')}`);
        if (member.ensuite) parts.push('phòng ngủ khép kín');
        if (member.needs?.length) {
          const needs = member.needs.map((need) =>
            (optionLabel('family', need) ?? room(need)).toLowerCase(),
          );
          parts.push(`cần ${needs.join(', ')}`);
        }
        return `${parts.join(', ')}.`;
      }),
  );

  // ── Không gian gia chủ yêu cầu ───────────────────────────────────────────────────────────
  const grouped = new Map<string, { count: number; line: string }>();
  for (const space of digest.required_spaces ?? []) {
    const parts = [room(space.type)];
    if (typeof space.floor === 'number') parts.push(`tầng ${space.floor}`);
    if (typeof space.area_m2 === 'number')
      parts.push(`tối thiểu ${formatNumber(space.area_m2)} m²`);
    if (space.ensuite) parts.push('khép kín');
    if (space.amenities) parts.push(`«${space.amenities}»`);
    const line = parts.join(', ');
    const entry = grouped.get(line);
    if (entry) entry.count += 1;
    else grouped.set(line, { count: 1, line });
  }
  section(
    'Không gian gia chủ yêu cầu',
    [...grouped.values()].map(
      (entry) => `${entry.count > 1 ? `${entry.count} × ` : ''}${entry.line}.`,
    ),
  );

  // ── Chỗ để xe, khối nhà, sân ───────────────────────────────────────────────────────────
  const parking = digest.parking;
  const massing = digest.massing;
  const yardDepth = FACES.map((f) => {
    const value = massing?.yard_depth_m?.[f];
    return typeof value === 'number' && value > 0 ? `${face(f)} ${metres(value)}` : null;
  }).filter(Boolean);
  section('Chỗ để xe, khối nhà và sân', [
    parking && ((parking.cars ?? 0) > 0 || (parking.motorbikes ?? 0) > 0)
      ? `Chỗ để xe: ${[
          (parking.cars ?? 0) > 0 ? `${parking.cars} ô tô` : null,
          (parking.motorbikes ?? 0) > 0 ? `${parking.motorbikes} xe máy` : null,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : null,
    massing?.footprint_shape
      ? `Hình khối mong muốn: ${label('massing.footprint_shape', massing.footprint_shape).toLowerCase()}.`
      : null,
    typeof massing?.wings_preferred === 'number'
      ? `${label('massing.wings_preferred', massing.wings_preferred)}.`
      : null,
    typeof massing?.cores_preferred === 'number'
      ? `${label('massing.cores_preferred', massing.cores_preferred)}.`
      : null,
    massing?.service_core ? 'Muốn khối phụ trợ gom một chỗ.' : null,
    massing?.yards?.length
      ? `Sân: ${massing.yards.map((y) => label('massing.yards', y).toLowerCase()).join(', ')}.`
      : null,
    yardDepth.length ? `Khoảng sân gia chủ muốn tính từ ranh đất: ${yardDepth.join(', ')}.` : null,
    massing?.indoor_outdoor
      ? `Quan hệ trong – ngoài: ${label('massing.indoor_outdoor', massing.indoor_outdoor).toLowerCase()}.`
      : null,
  ]);

  // ── Gia chủ, tín ngưỡng, kinh doanh tại nhà ────────────────────────────────────────────
  const household = digest.household;
  const business = household?.home_business;
  section('Gia chủ và tín ngưỡng', [
    household?.occupation ? `Ngành nghề: ${household.occupation}.` : null,
    household?.religion
      ? `Tín ngưỡng: ${label('household.religion', household.religion).toLowerCase()}.`
      : null,
    household?.altar_arrangement
      ? `Nơi thờ: ${label('household.altar_arrangement', household.altar_arrangement).toLowerCase()}${
          typeof household.altar_floor === 'number' ? `, đặt ở tầng ${household.altar_floor}` : ''
        }.`
      : null,
    household?.feng_shui
      ? `Phong thuỷ: ${label('household.feng_shui', household.feng_shui).toLowerCase()}.`
      : null,
    household?.feng_shui_notes ? `Yêu cầu phong thuỷ: ${household.feng_shui_notes}` : null,
    household?.taboos ? `Kiêng kỵ: ${household.taboos}` : null,
  ]);

  section('Kinh doanh tại nhà', [
    business?.mode && business.mode !== 'khong'
      ? `Hình thức: ${label('household.home_business.mode', business.mode).toLowerCase()}${
          typeof business.floor_count === 'number'
            ? `, chiếm ${business.floor_count} tầng dưới`
            : ''
        }.`
      : null,
    business?.mode && business.mode !== 'khong' && yesNo(business.separate_entrance)
      ? `Lối vào riêng cho khách: ${yesNo(business.separate_entrance)}.`
      : null,
    business?.mode && business.mode !== 'khong' && yesNo(business.customer_wc)
      ? `Khu vệ sinh riêng cho khách: ${yesNo(business.customer_wc)}.`
      : null,
    typeof business?.staff_count === 'number' && business.staff_count > 0
      ? `${business.staff_count} người làm việc tại nhà.`
      : null,
    business?.note ? `Ghi chú: ${business.note}` : null,
  ]);

  // ── Nếp sinh hoạt ─────────────────────────────────────────────────────────────────────
  const life = digest.lifestyle;
  section('Nếp sinh hoạt', [
    life?.cooking ? `Nấu ăn: ${label('lifestyle.cooking', life.cooking).toLowerCase()}.` : null,
    yesNo(life?.second_kitchen) ? `Cần bếp phụ tách riêng: ${yesNo(life?.second_kitchen)}.` : null,
    life?.dining_place
      ? `Chỗ ăn: ${label('lifestyle.dining_place', life.dining_place).toLowerCase()}.`
      : null,
    life?.guests ? `Tiếp khách ${label('lifestyle.guests', life.guests).toLowerCase()}.` : null,
    yesNo(life?.overnight_guests) ? `Khách ở lại qua đêm: ${yesNo(life?.overnight_guests)}.` : null,
    yesNo(life?.work_from_home) ? `Làm việc tại nhà: ${yesNo(life?.work_from_home)}.` : null,
    yesNo(life?.night_shift)
      ? `Có người làm ca đêm, ngủ ban ngày: ${yesNo(life?.night_shift)}.`
      : null,
    life?.reduced_mobility === true
      ? 'Trong nhà có người đi lại khó khăn: cần một phòng ngủ và một khu vệ sinh ở tầng trệt, hạn chế bậc, cửa và hành lang đủ rộng.'
      : null,
    life?.drying ? `Phơi đồ: ${label('lifestyle.drying', life.drying).toLowerCase()}.` : null,
    life?.pets && life.pets !== 'khong'
      ? `Thú nuôi: ${label('lifestyle.pets', life.pets).toLowerCase()}.`
      : null,
    life?.daily_rhythm ? `Nếp hằng ngày: ${life.daily_rhythm}` : null,
  ]);

  // ── Lưu trữ ───────────────────────────────────────────────────────────────────────────
  const storage = digest.storage;
  section('Nhu cầu lưu trữ', [
    storage?.level
      ? `Lượng đồ cần cất: ${label('storage.level', storage.level).toLowerCase()}.`
      : null,
    storage?.items?.length
      ? `Cần chỗ cho: ${storage.items.map((i) => label('storage.items', i).toLowerCase()).join(', ')}.`
      : null,
    storage?.note ? `Ghi chú: ${storage.note}` : null,
  ]);

  // ── Thang, lối vào, cao độ nền ────────────────────────────────────────────────────────
  const vertical = digest.vertical;
  const entrance = digest.entrance;
  section('Thang, lối vào và cao độ nền', [
    vertical?.elevator && vertical.elevator !== 'khong'
      ? `Thang máy: ${label('vertical.elevator', vertical.elevator).toLowerCase()}${
          vertical.elevator_capacity
            ? `, tải ${label('vertical.elevator_capacity', vertical.elevator_capacity)}`
            : ''
        }${
          vertical.elevator_position === 'khac'
            ? vertical.elevator_layout_note?.trim()
              ? `, bố trí: ${vertical.elevator_layout_note.trim()}`
              : ''
            : vertical.elevator_position && vertical.elevator_position !== 'chua_quyet'
              ? `, bố trí ${label('vertical.elevator_position', vertical.elevator_position).toLowerCase()}`
              : ''
        }. Ô thang máy phải chừa đủ chỗ ngay ở phương án này, kể cả khi lắp sau.`
      : vertical?.elevator === 'khong'
        ? 'Không làm thang máy.'
        : null,
    vertical?.stair_type && vertical.stair_type !== 'chua_quyet'
      ? `Thang bộ: ${label('vertical.stair_type', vertical.stair_type).toLowerCase()}.`
      : null,
    typeof entrance?.floor_above_road_m === 'number'
      ? `Cốt nền tầng 1 cao hơn tim đường ${metres(entrance.floor_above_road_m)}.`
      : null,
    yesNo(entrance?.steps_from_yard)
      ? `Bậc tam cấp từ sân lên nhà: ${yesNo(entrance?.steps_from_yard)}${
          typeof entrance?.step_count === 'number' ? `, ${entrance.step_count} bậc` : ''
        }.`
      : null,
    yesNo(entrance?.vehicle_ramp) ? `Dốc dắt xe lên sân: ${yesNo(entrance?.vehicle_ramp)}.` : null,
  ]);

  // ── Ban công ──────────────────────────────────────────────────────────────────────────
  const balconies = digest.balconies;
  const view = balconySides(balconies);
  section('Ban công', [
    balconies?.scope
      ? `Phạm vi: ${label('balconies.scope', balconies.scope).toLowerCase()}.`
      : null,
    faces(view.required) ? `Mặt BẮT BUỘC có ban công: ${faces(view.required)}.` : null,
    faces(view.optional)
      ? `Mặt CÓ THỂ có ban công (có hay không đều được): ${faces(view.optional)}.`
      : null,
    view.required.length || view.optional.length
      ? 'Mặt không nêu ở trên thì KHÔNG đặt ban công.'
      : null,
    ...BALCONY_SIDES.filter((side) => side in view.projection).map((side) => {
      const m = view.projection[side];
      return typeof m === 'number' && m > 0
        ? `Ban công ${faces([side])} ĐUA RA NGOÀI ranh đất ${metres(m)} — phần đua nằm ngoài diện tích sàn.`
        : m === 0
          ? `Ban công ${faces([side])} KHÔNG đua — nằm trong diện tích sàn.`
          : null;
    }),
    yesNo(balconies?.drying_balcony)
      ? `Ban công phơi riêng phía sau: ${yesNo(balconies?.drying_balcony)}.`
      : null,
    balconies?.note ? `Ghi chú: ${balconies.note}` : null,
  ]);

  // ── Kỹ thuật và dự trù ────────────────────────────────────────────────────────────────
  const systems = digest.systems;
  const future = digest.future;
  section('Kỹ thuật và dự trù tương lai', [
    systems?.water_storage?.length
      ? `Trữ nước: ${systems.water_storage.map((w) => label('systems.water_storage', w).toLowerCase()).join(', ')}.`
      : null,
    yesNo(systems?.solar_water)
      ? `Bình nước nóng năng lượng mặt trời trên mái: ${yesNo(systems?.solar_water)}.`
      : null,
    systems?.aircon_outdoor && systems.aircon_outdoor !== 'chua_quyet'
      ? `Cục nóng điều hoà đặt ở ${label('systems.aircon_outdoor', systems.aircon_outdoor).toLowerCase()}.`
      : null,
    systems?.note ? `Ghi chú kỹ thuật: ${systems.note}` : null,
    future?.expansion && future.expansion !== 'khong'
      ? `Dự trù: ${label('future.expansion', future.expansion).toLowerCase()}${
          typeof future.expansion_floors === 'number'
            ? `, thêm ${future.expansion_floors} tầng`
            : ''
        }.`
      : null,
    yesNo(future?.phasing) ? `Xây theo giai đoạn: ${yesNo(future?.phasing)}.` : null,
  ]);

  // ── Ưu tiên ───────────────────────────────────────────────────────────────────────────
  section(
    'Ưu tiên của gia chủ (theo thứ tự)',
    (digest.priorities ?? []).map((p, i) => `${i + 1}. ${label('priorities', p)}.`),
  );

  if (digest.finishing_level) {
    section('Mức hoàn thiện', [`${label('finishing_level', digest.finishing_level)}.`]);
  }

  // ── Câu hỏi quản trị viên tự thêm ──────────────────────────────────────────────────────
  //
  // Đứng SAU các mục có tên và TRƯỚC lời gia chủ: chúng là câu hỏi của NVG chứ không phải lời
  // gia chủ, nhưng chúng cũng không thuộc mục nào đã khai — nhét vào một mục có sẵn là nói dối
  // về nguồn gốc của câu trả lời.
  section(
    'Khảo sát bổ sung',
    (digest.custom ?? []).map((answer) => `${answer.label}: ${answer.value}`),
  );

  // ── Lời gia chủ, nguyên văn ────────────────────────────────────────────────────────────
  const free = digest.free_text ?? {};
  section('Lời gia chủ (nguyên văn)', [
    free.design_task ? `Nhiệm vụ thiết kế: ${free.design_task}` : null,
    free.functional_needs ? `Nhu cầu công năng: ${free.functional_needs}` : null,
    free.style_note ? `Về phong cách: ${free.style_note}` : null,
    free.site_condition ? `Về hiện trạng khu đất: ${free.site_condition}` : null,
  ]);

  // ── Khảo sát hiện trạng ────────────────────────────────────────────────────────────────
  const survey = digest.survey;
  if (survey) {
    section('Khảo sát hiện trạng', [
      typeof survey.land_width_m === 'number' || typeof survey.land_depth_m === 'number'
        ? `Đo thực tế: rộng ${metres(survey.land_width_m) || '—'}, sâu ${metres(survey.land_depth_m) || '—'}${
            typeof survey.land_area_m2 === 'number'
              ? `, diện tích ${formatNumber(survey.land_area_m2)} m²`
              : ''
          }.`
        : null,
      survey.orientation ? `Hướng ghi nhận: ${survey.orientation}.` : null,
      survey.measurement_notes ? `Ghi chú đo đạc: ${survey.measurement_notes}` : null,
      survey.surrounding_notes ? `Xung quanh: ${survey.surrounding_notes}` : null,
      survey.usage_notes ? `Hiện trạng sử dụng: ${survey.usage_notes}` : null,
      survey.notes ? `Ghi chú khác: ${survey.notes}` : null,
    ]);
  }

  return sections.join('\n\n');
}

/**
 * Thân lời gọi chung của nhánh AI: văn xuôi đầu bài trong `<brief>`, dữ liệu máy trong `<knowledge>`
 * (JSON không thụt lề — T26). Đầu bài đứng TRƯỚC và giống hệt nhau giữa các lượt gọi của cùng hồ sơ,
 * nên nhà cung cấp đọc lại được từ bộ nhớ đệm.
 */
export function modelBody(narrative: string, knowledge: unknown): string {
  return `<brief>\n${narrative}\n</brief>\n<knowledge>${JSON.stringify(knowledge)}</knowledge>`;
}

/** Đọc lại phần `<knowledge>` của một thân lời gọi — cho phép thử và cho bảng «Xuất prompt». */
export function knowledgeOf<T = unknown>(body: string): T {
  const match = /<knowledge>([\s\S]*?)<\/knowledge>/.exec(body);
  if (!match) throw new Error('Thân lời gọi không có <knowledge>.');
  return JSON.parse(match[1]!) as T;
}

/**
 * Cao độ đường và cao độ đất — nói bằng CHÊNH LỆCH, không nói trị tuyệt đối.
 *
 * Hai con số đo theo mốc chuẩn của người khảo sát (cốt quốc gia, hay một mốc tự đặt), nên
 * riêng chúng không mang thông tin nào mô hình dùng được: «cốt +7,25 m» chỉ có nghĩa khi biết
 * mốc. Cái quyết cốt nền, số bậc tam cấp và hướng thoát nước là ĐẤT CAO HƠN hay THẤP HƠN
 * đường bao nhiêu — nên văn xuôi chỉ nói đúng điều đó.
 *
 * Thiếu một trong hai thì không suy ra được gì; im lặng, không đoán.
 */
function levelLine(site: AiBriefDigest['site']): string | null {
  const road = site.road_level_m;
  const land = site.land_level_m;
  if (typeof road !== 'number' || typeof land !== 'number') return null;
  const diff = Math.round((land - road) * 100) / 100;
  if (diff === 0) return 'Đất ngang bằng cao độ đường.';
  const rounded = formatNumber(Math.abs(diff));
  return diff > 0
    ? `Đất cao hơn tim đường ${rounded} m.`
    : `Đất THẤP hơn tim đường ${rounded} m — phải tôn nền và tính lại thoát nước.`;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}
