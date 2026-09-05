/**
 * 6 nhóm trạng thái chuẩn — dùng THỐNG NHẤT cho toàn bộ 12 module.
 *
 * Nguồn: Content Guidelines v1.2 5.1 (nhãn chữ) + Webapp Flow v1.1 5.5 (ý nghĩa điều hướng)
 *        + Backend Schema v1.1 1.4 (giá trị lưu trong cột `status`).
 *
 * `disputed` là nhóm thứ SÁU, thêm ở Content Guidelines v1.2 theo khảo sát Xưởng giàn giáo.
 * Nó không phải "một trạng thái xấu" — nó là trạng thái KHOÁ SỐ LIỆU GỐC: khi hai bên chưa
 * thống nhất số thiếu/hỏng, biên bản và ảnh giữ nguyên, mọi thay đổi phải là chứng từ điều
 * chỉnh mới có người duyệt (PRD SX-19, Backend Schema v1.1 3.5).
 *
 * QUY TẮC BẤT BIẾN (CLAUDE.md 5.4):
 *  - KHÔNG tạo màu trạng thái mới. Module có trạng thái con riêng vẫn phải quy về 1 trong 6 nhóm này.
 *  - KHÔNG dùng màu làm cách duy nhất truyền đạt thông tin — luôn hiển thị kèm nhãn chữ.
 */

export const STATUS_GROUPS = [
  'draft',
  'pending_approval',
  'in_progress',
  'completed',
  'overdue',
  'disputed',
] as const;

export type StatusGroup = (typeof STATUS_GROUPS)[number];

export interface StatusMeta {
  /** Nhãn chữ chuẩn — Content Guidelines 5.1. KHÔNG tự đặt nhãn khác. */
  readonly label: string;
  /** Mã màu — Content Guidelines 6.3. */
  readonly color: string;
  /** Ý nghĩa điều hướng — Webapp Flow 5.5. */
  readonly meaning: string;
}

export const STATUS_META: Readonly<Record<StatusGroup, StatusMeta>> = {
  draft: {
    label: 'Nháp',
    color: '#6B778C',
    meaning: 'Chỉ người tạo và người được chia sẻ thấy; chưa xuất hiện ở Hộp thư Phê duyệt của ai.',
  },
  pending_approval: {
    label: 'Chờ duyệt',
    color: '#B38600',
    meaning: 'Xuất hiện ở Hộp thư Phê duyệt của đúng người có thẩm quyền theo hạn mức (NEN-02).',
  },
  in_progress: {
    label: 'Đang xử lý',
    color: '#0C66E4',
    meaning: 'Đã duyệt, chuyển bước tiếp theo; thông báo cho người phụ trách bước sau.',
  },
  completed: {
    label: 'Hoàn thành',
    color: '#22A06B',
    meaning: 'Hồ sơ chuyển chế độ chỉ xem (trừ khi có quyền đặc biệt để mở lại).',
  },
  overdue: {
    label: 'Quá hạn',
    color: '#CA3521',
    meaning: 'Đẩy lên Trung tâm Thông báo và làm nổi bật trên Dashboard liên quan.',
  },
  disputed: {
    label: 'Tranh chấp',
    color: '#8270DB',
    meaning:
      'Số liệu gốc bị khoá: biên bản, ảnh và số lượng giữ nguyên, chỉ lập được chứng từ điều chỉnh mới có người duyệt.',
  },
} as const;

/** Nhãn chữ tiếng Việt của một nhóm trạng thái. */
export function statusLabel(status: StatusGroup): string {
  return STATUS_META[status].label;
}

/**
 * Ánh xạ trạng thái con riêng của module về 1 trong 6 nhóm chuẩn.
 *
 * Ví dụ Kho có trạng thái riêng "Đang kiểm kê" (Content Guidelines 5.1, ghi chú) —
 * vẫn phải quy về `in_progress` khi hiển thị.
 */
export function toStatusGroup(
  value: string,
  moduleMap: Readonly<Record<string, StatusGroup>> = {},
): StatusGroup {
  if (isStatusGroup(value)) return value;
  const mapped = moduleMap[value];
  if (mapped) return mapped;
  // Không đoán bừa: trạng thái lạ hiển thị như bản nháp thay vì vỡ giao diện.
  return 'draft';
}

export function isStatusGroup(value: string): value is StatusGroup {
  return (STATUS_GROUPS as readonly string[]).includes(value);
}
