/**
 * Mã lỗi và mã ghi chú của bộ giải ý định (T43).
 *
 * Hai loại, tách bạch:
 *  · `ARRANGE_ISSUE_CODES` — CHẶN: không dựng được một tầng nào qua cổng từ ý định này. Mỗi mã có
 *    một dòng ghi chú tiếng Anh cho lượt sửa ý định (`kb/ai_design_prompts.yaml` mục `hints`).
 *  · `INTENT_NOTE_CODES` — ghi chú: chương trình đã sửa ý định (điền vùng thiếu, bỏ quan hệ trỏ phòng
 *    lạ). Không chặn gì; màn hình nói ra để tờ vẽ không khác lời mô hình mà im lặng.
 *
 * ⚠️ Không mã nào ở đây chặn vì một ngưỡng KINH NGHIỆM (cạnh tối thiểu theo loại phòng, tỉ lệ dài/rộng,
 * tỉ lệ giao thông): số đo từ hồ sơ thật chỉ là tham khảo (Haan, 14/09/2026). Chúng đi vào điểm.
 * `arrange_room_too_narrow` chặn theo cạnh DÙNG ĐƯỢC (`kb/construction_norms.yaml` mục `usable`) —
 * giới hạn đồ đạc, không phải kinh nghiệm (V-28).
 */

import type { PlanIssue } from '../plan-check';

export const ARRANGE_ISSUE_CODES = [
  'arrange_zone_overfull',
  'arrange_no_hub_wall',
  'arrange_program_exceeds_footprint',
  'arrange_room_too_narrow',
  'arrange_stair_too_short',
  'arrange_room_below_brief_area',
  'arrange_anchor_conflict',
  'arrange_no_parti',
  'arrange_unreachable',
  'arrange_entrance_side',
  // Bản phác lưới (T48) không nắn được thành cây — chỉ lên tiếng khi cả tầng không xếp được.
  'sketch_room_missing',
  'sketch_not_rectangular',
  'sketch_pinwheel',
  'sketch_rooms_too_small',
  'sketch_island_room',
] as const;

export type ArrangeIssueCode = (typeof ARRANGE_ISSUE_CODES)[number];

export const INTENT_NOTE_CODES = [
  'intent_zone_defaulted',
  'intent_room_dropped',
  'intent_relationship_dropped',
  'intent_relationship_conflict',
  'intent_open_not_merged',
  'intent_merge_capped',
  'intent_ensuite_zone_forced',
  'intent_entry_defaulted',
  'intent_entry_invalid',
  'intent_garage_defaulted',
  'intent_anchor_zone_forced',
  // Khu vệ sinh tầng trên kéo về vùng của khu vệ sinh tầng dưới (Q-B, 18/09/2026) — cùng vùng, không
  // đòi chồng khít; chỗ đứng trong vùng do khoản phạt `wet` của bộ xếp quyết.
  'intent_wet_zone_forced',
  // Ban công, lô gia không quay cạnh dài ra mặt thoáng (Haan 18/09/2026) — ghi chú, chưa chặn: chặn
  // khi chưa cho ban công đua ra ngoài khối thì bộ xếp mất phương án ở phần lớn bản phác đã đo.
  'outdoor_off_face',
] as const;

export type IntentNoteCode = (typeof INTENT_NOTE_CODES)[number];

export function arrangeIssue(
  code: ArrangeIssueCode,
  message: string,
  params: Record<string, string | number>,
  ref?: string,
): PlanIssue {
  return { code, level: 'blocking', message, params, ...(ref ? { ref } : {}) };
}

/**
 * Mã lỗi NGỮ NGHĨA — nguyên nhân nằm ở thứ mô hình khai: danh mục phòng, diện tích mục tiêu, vùng, bản
 * phác lưới, phòng mang cửa chính / cửa xe. Chỉ những lỗi này được gửi lại cho mô hình sửa (15/09/2026, tài liệu bàn giao
 * `ai-architectural-floorplan-handoff` mục 08 «Validation / Repair Flow»).
 *
 * Mọi mã KHÔNG có ở đây là lỗi HÌNH HỌC — phòng không cửa, ô hẹp hay ngắn, hụt sàn khi chia ô, lệch mốc,
 * không dựng được khung. Bộ dựng hình đã tự thử hết cách của nó (mọi khung, hành lang chữ T/L, bốn vòng
 * nới vùng tới bỏ hẳn vùng) trước khi báo, và mô hình không thấy toạ độ nên không sửa trúng được: lượt đo
 * 4a521f52 tiêu ba lượt sửa (0,152 USD) cho lỗi ô thang hẹp mà không gỡ được. Gặp lỗi hình học thì dừng,
 * không gọi lại.
 *
 * Mặc định là HÌNH HỌC: một mã mới quên xếp loại thì không tốn tiền, chỉ mất một lượt sửa có thể có ích.
 */
export const REVISABLE_CODES: ReadonlySet<string> = new Set([
  // Vùng: dồn quá nhiều phòng vào một vùng.
  'arrange_zone_overfull',
  // Diện tích: tổng m² mục tiêu của tầng vượt khối xây.
  'arrange_program_exceeds_footprint',
  // Phòng mang cửa chính / cửa xe chọn sai mặt, hoặc không ra được mặt ngoài.
  'arrange_entrance_side',
  'entrance_wrong_side',
  'vehicle_door_wrong_side',
  'door_no_outside_edge',
  'door_outside_on_boundary',
  // Đường đi hằng ngày xuyên gara / sảnh ngoài (T48): chỗ sai là bố cục mô hình vẽ.
  'route_through_service',
  // Phòng ở / thờ lấy cửa thẳng từ ô thang (Haan 18/09/2026): phòng ấy phải kề hành lang — bản phác
  // sửa được, chương trình thì không (dời cửa sang vách khác là dời cả phòng).
  'door_from_stair',
  // Bản phác lưới (T48): chính hình mô hình vẽ — thiếu phòng, phòng không chữ nhật, chong chóng, quá
  // nhiều phòng trên một đường chia. Mô hình thấy lưới của nó nên sửa trúng được.
  'sketch_room_missing',
  'sketch_not_rectangular',
  'sketch_pinwheel',
  'sketch_rooms_too_small',
  'sketch_island_room',
]);

/** Lỗi này mô hình sửa được bằng cách đổi ý định không. */
export function isRevisable(code: string): boolean {
  return REVISABLE_CODES.has(code);
}
