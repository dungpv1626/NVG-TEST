/**
 * Đề xuất phát sinh từ công trường (T1) và tồn tại cần khắc phục (T2) — migration 0241.
 *
 * Bảng `site_change_proposals` không có cột tiền: giá nằm ở `contract_amendments` (HD-04), phân hệ Thi
 * công không đọc. Trạng thái hiển thị suy từ phát sinh đã lập — CSDL tính ở `site_change_proposal_states`.
 */

import type { StatusGroup } from './status';

export const SITE_CHANGE_CAUSES = ['chu_dau_tu', 'thiet_ke', 'hien_truong', 'khac'] as const;
export type SiteChangeCause = (typeof SITE_CHANGE_CAUSES)[number];

export const SITE_CHANGE_CAUSE_LABELS: Readonly<Record<SiteChangeCause, string>> = {
  chu_dau_tu: 'Chủ đầu tư yêu cầu',
  thiet_ke: 'Thiết kế thay đổi',
  hien_truong: 'Hiện trường khác hồ sơ',
  khac: 'Khác',
};

export const SITE_CHANGE_DISPLAY_STATUSES = [
  'da_gui',
  'dang_bao_gia',
  'cho_duyet',
  'cho_khach',
  'da_duyet',
  'hoan_tat',
  'tu_choi',
] as const;
export type SiteChangeDisplayStatus = (typeof SITE_CHANGE_DISPLAY_STATUSES)[number];

export const SITE_CHANGE_STATUS_META: Readonly<
  Record<SiteChangeDisplayStatus, { label: string; statusGroup: StatusGroup }>
> = {
  da_gui: { label: 'Đã gửi — chờ văn phòng tiếp nhận', statusGroup: 'pending_approval' },
  dang_bao_gia: { label: 'Đang lập báo giá phát sinh', statusGroup: 'in_progress' },
  cho_duyet: { label: 'Chờ phê duyệt', statusGroup: 'pending_approval' },
  cho_khach: { label: 'Chờ khách xác nhận', statusGroup: 'pending_approval' },
  da_duyet: { label: 'Đã duyệt — khách đã xác nhận', statusGroup: 'in_progress' },
  hoan_tat: { label: 'Đã ký phụ lục, ghi nhận thực hiện', statusGroup: 'completed' },
  tu_choi: { label: 'Không lập phát sinh', statusGroup: 'draft' },
};

export const SITE_ISSUE_STATUS_META = {
  dang_mo: { label: 'Đang mở', statusGroup: 'in_progress' },
  da_dong: { label: 'Đã khắc phục', statusGroup: 'completed' },
} as const satisfies Record<string, { label: string; statusGroup: StatusGroup }>;
export type SiteIssueStatus = keyof typeof SITE_ISSUE_STATUS_META;

/** Hiển thị trạng thái một tồn tại: đang mở mà đã qua hạn (theo ngày Việt Nam) là «Quá hạn». */
export function siteIssueDisplayStatus(
  status: SiteIssueStatus,
  dueDate: string | null,
  today: string,
): StatusGroup {
  if (status === 'dang_mo' && dueDate && dueDate < today) return 'overdue';
  return SITE_ISSUE_STATUS_META[status].statusGroup;
}
