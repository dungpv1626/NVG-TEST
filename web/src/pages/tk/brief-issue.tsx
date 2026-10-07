/**
 * Một câu soát đầu bài, tô theo MỨC (Haan, 07/10/2026): cảnh báo màu vàng, lỗi sai logic / không
 * được phép màu đỏ. Trước đó dưới từng ô mọi câu đều đỏ, nên một lời nhắc «kiểm quy định địa
 * phương» trông nặng ngang một mâu thuẫn chặn dựng phương án.
 *
 * Mức luôn kèm CHỮ («Cảnh báo» / «Lỗi») và biểu tượng, không chỉ màu (CGD 6.8). Dùng đúng hai màu
 * trạng thái chuẩn: «Chờ duyệt» (vàng) và «Quá hạn» (đỏ) — không tạo màu mới.
 */

import { AlertTriangle, OctagonAlert } from 'lucide-react';
import type { BriefIssueSeverity } from '@nvg/shared/design';
import { cn } from '@/lib/utils';

export const ISSUE_LABEL: Record<BriefIssueSeverity, string> = {
  canh_bao: 'Cảnh báo',
  nghiem_trong: 'Lỗi',
};

export function issueTone(severity: BriefIssueSeverity): string {
  return severity === 'nghiem_trong'
    ? 'border-status-overdue/40 bg-status-overdue-bg text-status-overdue'
    : 'border-status-pending/40 bg-status-pending-bg text-status-pending';
}

/** Nội dung một câu: biểu tượng + nhãn mức + lời. Khung và màu do nơi gọi đặt bằng `issueTone`. */
export function IssueBody({
  severity,
  message,
}: {
  severity: BriefIssueSeverity;
  message: string;
}): React.ReactElement {
  const Icon = severity === 'nghiem_trong' ? OctagonAlert : AlertTriangle;
  return (
    <>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold">{ISSUE_LABEL[severity]}:</span> {message}
      </span>
    </>
  );
}

/** Câu soát ngay dưới ô có vấn đề. */
export function IssueLine({
  severity,
  message,
}: {
  severity: BriefIssueSeverity;
  message: string;
}): React.ReactElement {
  return (
    <p className={cn('mt-1.5 flex gap-2 rounded-sm border px-3 py-2 text-sm', issueTone(severity))}>
      <IssueBody severity={severity} message={message} />
    </p>
  );
}
