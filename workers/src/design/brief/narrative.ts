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

  // ── Ưu tiên ───────────────────────────────────────────────────────────────────────────
  section(
    'Ưu tiên của gia chủ (theo thứ tự)',
    (digest.priorities ?? []).map((p, i) => `${i + 1}. ${label('priorities', p)}.`),
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

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}
