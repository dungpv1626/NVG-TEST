/**
 * Mã lỗi của cổng CẤU TRÚC (T37) — lỗi của cây chia mô hình khai, bắt TRƯỚC khi có hình học.
 *
 * Mọi mã ở đây đều CHẶN: một cây hỏng không có hình học để vẽ, không có gì để chấm. Mã là thứ
 * màn hình, kiểm thử và bảng ghi chú lấy mẫu lại (`kb/ai_design_prompts.yaml` mục `hints`) bám
 * vào — câu chữ tiếng Việt thì đổi được, mã thì không.
 *
 * Danh sách là HẰNG SỐ xuất ra ngoài vì có phép thử đòi mỗi mã một dòng ghi chú tiếng Anh cho lượt
 * lấy mẫu lại: thêm một mã mà quên ghi chú thì lượt ấy chỉ nhận câu mặc định chung chung, và mô
 * hình mắc lại đúng lỗi cũ.
 */

import type { PlanIssue } from '../plan-check';

export const TREE_ISSUE_CODES = [
  'footprint_empty',
  'footprint_outside_buildable',
  'tree_id_reused',
  'tree_self_child',
  'tree_child_reused',
  'tree_no_root',
  'tree_many_roots',
  'tree_orphan_node',
  'cut_outside_cell',
  'cut_too_close',
  'cell_collapsed',
  'leaf_unknown',
  'leaf_duplicate',
  'room_missing_on_level',
  'merge_unknown_room',
  'merge_room_not_leaf',
  'merge_target_is_leaf',
  'merge_not_allowed',
  'outline_disconnected',
  'outline_has_hole',
  'outline_too_complex',
  'door_no_outside_edge',
  'door_outside_on_boundary',
  'door_wall_too_short',
  'entrance_wrong_side',
  'vehicle_door_wrong_side',
  'room_without_door',
  'ensuite_door_wrong',
  'level_no_entrance',
  'room_unreachable_on_level',
  'room_through_private',
  'route_through_service',
  'door_from_stair',
  'void_on_ground',
  'stair_missing_on_level',
  'stair_room_unknown',
  'stair_not_at_anchor',
  'light_well_not_at_anchor',
  'snap_collapsed_cell',
] as const;

export type TreeIssueCode = (typeof TREE_ISSUE_CODES)[number];

export function treeIssue(
  code: TreeIssueCode,
  message: string,
  params: Record<string, string | number>,
  ref?: string,
): PlanIssue {
  return { code, level: 'blocking', message, params, ...(ref ? { ref } : {}) };
}
